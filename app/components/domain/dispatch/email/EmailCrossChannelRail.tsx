import React, { useMemo, useState } from 'react';
import { getCommsThreadService } from '../../../../core/services/comms/comms-thread.service';
import {
  buildPopulateRebookPayloadFromTrip,
  buildTripTrackingUrl,
  formatDispatchEmailTimestamp,
  isActiveOrUpcomingTripStatus,
  type SenderCrossChannelContext,
} from '../../../../core/services/email/dispatch-email.service';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import type { CommsChannel, CommsEvent } from '../../../../core/types/comms';
import type { Trip } from '../../../../core/types/trip';
import {
  BuildingIcon,
  CarIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExternalLinkIcon,
  LinkIcon,
  MailIcon,
  MicIcon,
  PhoneIcon,
  PlaneIcon,
  PlusIcon,
  RepeatIcon,
  SpinnerIcon,
  UserIcon,
  XIcon,
} from '../../../ui/Icons';

export interface EmailCrossChannelRailProps {
  context: SenderCrossChannelContext;
  onClose?: () => void;
  onOpenEditTrip?: (tripId: string) => void;
  onPopulateBookingPayload: (payload: any) => void;
  onInsertIntoComposer: (snippet: string, tripId?: string) => void;
  onSelectEmailFromTimeline?: (emailId: string) => void;
  onToast?: (msg: string, tone?: 'success' | 'error') => void;
  className?: string;
}

type TimelineFilter = 'all' | 'calls' | 'sms' | 'notes' | 'email';

const CHANNEL_STYLE_MAP: Record<
  CommsChannel,
  { label: string; badgeClass: string }
> = {
  call: {
    label: 'Call',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  voicemail: {
    label: 'Voicemail',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  sms: {
    label: 'SMS',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  note: {
    label: 'Internal Note',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  email: {
    label: 'Email',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

function ChannelMiniIcon({ channel }: { channel: CommsChannel }) {
  switch (channel) {
    case 'call':
      return <PhoneIcon className="w-3 h-3 shrink-0" />;
    case 'voicemail':
      return <MicIcon className="w-3 h-3 shrink-0" />;
    case 'sms':
      return <ChatBubbleLeftRightIcon className="w-3 h-3 shrink-0" />;
    case 'note':
      return <DocumentTextIcon className="w-3 h-3 shrink-0" />;
    case 'email':
    default:
      return <MailIcon className="w-3 h-3 shrink-0" />;
  }
}

export function EmailCrossChannelRail({
  context,
  onClose,
  onOpenEditTrip,
  onPopulateBookingPayload,
  onInsertIntoComposer,
  onSelectEmailFromTimeline,
  onToast,
  className = '',
}: EmailCrossChannelRailProps) {
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);
  const [generatingPayTripId, setGeneratingPayTripId] = useState<string | null>(null);

  const filteredEvents = useMemo((): CommsEvent[] => {
    const ordered = [...context.timelineEvents].sort(
      (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
    );
    if (timelineFilter === 'all') return ordered;
    if (timelineFilter === 'calls') {
      return ordered.filter((e) => e.channel === 'call' || e.channel === 'voicemail');
    }
    if (timelineFilter === 'sms') {
      return ordered.filter((e) => e.channel === 'sms');
    }
    if (timelineFilter === 'notes') {
      return ordered.filter((e) => e.channel === 'note');
    }
    return ordered.filter((e) => e.channel === 'email');
  }, [context.timelineEvents, timelineFilter]);

  const handleOpenInCommsHub = () => {
    const bus = getWorkspaceBus();
    bus.publish('OPEN_COMMS_THREAD', {
      threadId: context.threadId !== 'thr_unknown' ? context.threadId : undefined,
      phone: context.primaryPhone,
      email: context.primaryEmail,
      tab: 'all',
    });
    bus.publish('FOCUS_MODULE', { moduleKey: 'comms' });
  };

  const handleCallCustomer = () => {
    if (!context.primaryPhone) {
      onToast?.('No phone number linked to this sender yet.', 'error');
      return;
    }
    const bus = getWorkspaceBus();
    bus.publish('CALL_OUTBOUND_STARTED', {
      targetNumber: context.primaryPhone,
      contactName: context.contactName,
    });
    bus.publish('FOCUS_MODULE', { moduleKey: 'comms' });
    onToast?.(`Dialing ${context.displayPhone || context.primaryPhone}...`, 'success');
  };

  const handleOpenTrip = (trip: Trip) => {
    getWorkspaceBus().publish('OPEN_EDIT_TRIP', {
      tripId: trip.id,
      phone: trip.passenger?.phone,
    });
    onOpenEditTrip?.(trip.id);
  };

  const handleRebookTrip = (trip: Trip) => {
    const payload = buildPopulateRebookPayloadFromTrip(trip);
    onPopulateBookingPayload(payload);
  };

  const handleInsertTripTracking = (trip: Trip) => {
    const url = buildTripTrackingUrl(trip);
    onInsertIntoComposer(`Live Chauffeur Tracking (${trip.id}):\n${url}`, trip.id);
    onToast?.(`Inserted tracking link for ${trip.id}.`, 'success');
  };

  const handleInsertTripPayLink = async (trip: Trip) => {
    const payService = getPayLinkService();
    const cachedToken = payService.getTripCachedPayToken(trip);
    if (cachedToken) {
      const url = payService.buildPayUrl(cachedToken);
      onInsertIntoComposer(`Secure 1-Tap Payment Link (${trip.id}):\n${url}`, trip.id);
      onToast?.(`Inserted 1-tap Pay Link for ${trip.id}.`, 'success');
      return;
    }

    setGeneratingPayTripId(trip.id);
    const created = await payService.createOrGetTripPayLink(trip, {
      sendSms: false,
      sendEmail: false,
    });
    setGeneratingPayTripId(null);

    if (created.success && (created.payUrl || created.payToken)) {
      const url = created.payUrl || payService.buildPayUrl(created.payToken as string);
      onInsertIntoComposer(`Secure 1-Tap Payment Link (${trip.id}):\n${url}`, trip.id);
      onToast?.(`Generated & inserted Pay Link for ${trip.id}.`, 'success');
    } else {
      onToast?.(created.error || 'Unable to generate Pay Link.', 'error');
    }
  };

  const handleSaveInternalNote = async () => {
    const clean = noteDraft.trim();
    if (!clean) return;
    await getCommsThreadService().addInternalNote({
      threadId: context.threadId !== 'thr_unknown' ? context.threadId : undefined,
      phone: context.primaryPhone,
      email: context.primaryEmail,
      contactName: context.contactName,
      bodyText: clean,
    });
    setNoteDraft('');
    setIsAddingNote(false);
    onToast?.('Added internal dispatcher note to unified customer timeline.', 'success');
  };

  return (
    <aside
      className={`flex flex-col h-full bg-slate-50/80 border-l border-slate-200 overflow-hidden ${className}`}
      aria-label="Unified Customer Activity and Trips"
    >
      {/* ─── RAIL HEADER: SENDER PROFILE & CROSS-CHANNEL ACTIONS ─── */}
      <div className="p-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="text-xs font-extrabold text-slate-900 truncate">
                  {context.contactName}
                </h4>
                {context.isVip && (
                  <span className="text-[9.5px] font-black px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    VIP
                  </span>
                )}
              </div>
              {context.primaryEmail && (
                <p className="text-[10.5px] font-mono text-slate-500 truncate">
                  {context.primaryEmail}
                </p>
              )}
              {context.displayPhone && (
                <p className="text-[10.5px] font-mono text-slate-600 font-semibold">
                  {context.displayPhone}
                </p>
              )}
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              title="Close Customer Activity panel"
              aria-label="Close Customer Activity panel"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {(context.corporateAccountName || context.corporateAccountNumber) && (
          <div className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-[10.5px] font-bold text-indigo-800 flex items-center gap-1.5">
            <BuildingIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="truncate">
              {context.corporateAccountName || 'Corporate Account'}
              {context.corporateAccountNumber ? ` · ${context.corporateAccountNumber}` : ''}
            </span>
          </div>
        )}

        {/* 1-Tap Call Customer & Open in Comms Hub */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleCallCustomer}
            disabled={!context.primaryPhone}
            className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            title={
              context.primaryPhone
                ? `Call ${context.displayPhone || context.primaryPhone}`
                : 'No phone number available'
            }
          >
            <PhoneIcon className="w-3 h-3 shrink-0" />
            <span>Call Customer</span>
          </button>

          <button
            type="button"
            onClick={handleOpenInCommsHub}
            className="py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            title="Open full unified thread in Comms Hub"
          >
            <ExternalLinkIcon className="w-3 h-3 shrink-0" />
            <span>Open in Comms Hub</span>
          </button>
        </div>
      </div>

      {/* ─── SCROLLABLE BODY: MATCHED TRIPS + MULTI-CHANNEL TIMELINE ─── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* SECTION 1: MATCHED ACTIVE / UPCOMING / RECENT TRIPS */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <CarIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Customer Trips ({context.matchedTrips.length})</span>
            </h5>
            {context.activeTrips.length > 0 && (
              <span className="text-[9.5px] font-black px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                {context.activeTrips.length} active
              </span>
            )}
          </div>

          {context.matchedTrips.length === 0 ? (
            <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-500 text-center">
              No active or recent trips linked to this sender yet.
            </div>
          ) : (
            <div className="space-y-2">
              {context.matchedTrips.slice(0, 5).map((trip) => {
                const isActive = isActiveOrUpcomingTripStatus(trip.status);
                const payState = getPayLinkService().getTripPayLinkDisplayState(trip);
                return (
                  <div
                    key={trip.id}
                    className={`p-2.5 rounded-xl border bg-white space-y-2 shadow-2xs ${
                      isActive ? 'border-blue-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] font-mono font-extrabold text-slate-900 truncate">
                          {trip.id}
                        </span>
                        <span
                          className={`text-[9.5px] font-bold uppercase px-1.5 py-0.2 rounded-full border shrink-0 ${
                            isActive
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {trip.status}
                        </span>
                        {trip.flightTelemetry?.flightIdent && (
                          <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                            <PlaneIcon className="w-2.5 h-2.5" />
                            <span>{trip.flightTelemetry.flightIdent}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-extrabold text-emerald-700 shrink-0">
                        ${(trip.pricing?.totalFare ?? 0).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <p className="truncate">
                        <span className="font-bold text-slate-800">From:</span>{' '}
                        {trip.pickupLocation?.address || 'N/A'}
                      </p>
                      <p className="truncate">
                        <span className="font-bold text-slate-800">To:</span>{' '}
                        {trip.dropoffLocation?.address || 'N/A'}
                      </p>
                      {trip.scheduledPickupTime && (
                        <p className="text-[10px] text-slate-400">
                          Pickup:{' '}
                          {new Date(trip.scheduledPickupTime).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>

                    {/* 1-Tap Trip Actions */}
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleOpenTrip(trip)}
                        className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10.5px] font-bold text-slate-800 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <ExternalLinkIcon className="w-3 h-3" />
                        <span>Open Trip</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRebookTrip(trip)}
                        className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10.5px] font-bold text-slate-800 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RepeatIcon className="w-3 h-3" />
                        <span>Populate Rebook</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleInsertTripTracking(trip)}
                        className="py-1 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[10.5px] font-bold text-blue-700 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <LinkIcon className="w-3 h-3" />
                        <span>Insert Tracking</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleInsertTripPayLink(trip)}
                        disabled={generatingPayTripId === trip.id}
                        className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[10.5px] font-bold text-emerald-800 inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {generatingPayTripId === trip.id ? (
                          <SpinnerIcon className="w-3 h-3 animate-spin" />
                        ) : (
                          <CreditCardIcon className="w-3 h-3" />
                        )}
                        <span>{payState === 'paid' ? 'Paid Link' : 'Insert Pay Link'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION 2: UNIFIED MULTI-CHANNEL SENDER TIMELINE */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-1">
            <h5 className="text-[10.5px] font-black uppercase tracking-wider text-slate-500">
              Multi-Channel Timeline ({context.timelineEvents.length})
            </h5>
            <button
              type="button"
              onClick={() => setIsAddingNote((prev) => !prev)}
              className="text-[10.5px] font-bold text-purple-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <PlusIcon className="w-3 h-3" />
              <span>Note</span>
            </button>
          </div>

          {isAddingNote && (
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="Add internal dispatcher note visible across Phone, SMS & Email..."
                className="w-full text-xs p-2 rounded-lg border border-purple-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 resize-none"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNote(false);
                    setNoteDraft('');
                  }}
                  className="px-2 py-1 rounded-md text-[10.5px] font-bold text-slate-600 hover:bg-slate-200/60 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveInternalNote()}
                  disabled={!noteDraft.trim()}
                  className="px-2.5 py-1 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-45 text-white text-[10.5px] font-bold cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </div>
          )}

          {/* Channel Filter Pills */}
          <div className="flex items-center flex-wrap gap-1 pb-0.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'calls', label: 'Calls/VM' },
                { id: 'sms', label: 'SMS' },
                { id: 'email', label: 'Email' },
                { id: 'notes', label: 'Notes' },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTimelineFilter(pill.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer shrink-0 ${
                  timelineFilter === pill.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {filteredEvents.length === 0 ? (
            <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-400 text-center">
              No interactions recorded in this channel yet.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((evt) => {
                const chStyle = CHANNEL_STYLE_MAP[evt.channel] || CHANNEL_STYLE_MAP.email;
                const isClickableEmail =
                  evt.channel === 'email' &&
                  Boolean(evt.emailMessageId && onSelectEmailFromTimeline);

                return (
                  <div
                    key={evt.id}
                    onClick={() => {
                      if (isClickableEmail && evt.emailMessageId) {
                        onSelectEmailFromTimeline?.(evt.emailMessageId);
                      }
                    }}
                    className={`p-2.5 rounded-xl bg-white border border-slate-200 space-y-1 shadow-2xs ${
                      isClickableEmail ? 'cursor-pointer hover:border-blue-300' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${chStyle.badgeClass}`}
                        >
                          <ChannelMiniIcon channel={evt.channel} />
                          <span>{chStyle.label}</span>
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 capitalize truncate">
                          {evt.direction === 'internal'
                            ? evt.actorName || 'Dispatcher'
                            : evt.direction}
                          {evt.durationSeconds ? ` · ${evt.durationSeconds}s` : ''}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatDispatchEmailTimestamp(evt.timestampMs, evt.timestampIso)}
                      </span>
                    </div>

                    {evt.subject && (
                      <p className="text-[11px] font-bold text-slate-800 truncate">
                        {evt.subject}
                      </p>
                    )}

                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                      {evt.bodyText || evt.snippet || 'Recorded activity'}
                    </p>

                    {evt.channel === 'voicemail' && evt.transcription && (
                      <div className="p-1.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[10.5px] text-amber-900 italic line-clamp-3">
                        &ldquo;{evt.transcription}&rdquo;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
