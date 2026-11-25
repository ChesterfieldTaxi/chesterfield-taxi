import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveCommsEmailDeliveryBadge, type CommsConversationRowSummary, type CommsCrmContextSummary } from '../../../../core/services/comms/comms-templates.service';
import type { ContactRecord } from '../../../../core/services/customer/contact.service';
import { normalizePhone } from '../../../../core/services/passenger.service';
import { getWorkspaceBus, type WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import { AlertTriangleIcon, ChevronDownIcon, ExternalLinkIcon, MailIcon, MicIcon, PauseIcon, PhoneIcon, PlayIcon, RefreshCwIcon, SpinnerIcon, UserIcon } from '../../../ui/Icons';
import { DispatchStatusBadge } from '../queue/DispatchStatusBadge';
import { CommsComposerBar } from './CommsComposerBar';
import { buildOmnichannelTimelineItems, buildReturnTripDraftPayload, cleanCommsEmailSnippet, formatShortRouteEndpoint, formatShortTripId, formatTripTimelineDateTime, hasPlayableCallAudio } from './comms-timeline.util';
import { formatMessageTimestamp, type InteractionEvent, type PlaybackSpeed, type ThreadTab } from './comms-types';

export { NewSmsMessageModal, type NewSmsMessageModalProps } from './CommsModals';

const THREAD_FILTER_OPTS: ReadonlyArray<{ value: ThreadTab; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'sms', label: 'SMS' }, { value: 'calls', label: 'Calls' },
  { value: 'emails', label: 'Email' }, { value: 'trips', label: 'Trips' }, { value: 'notes', label: 'Notes' },
];

export interface SmsThreadPaneProps {
  mode: 'thread' | 'list'; activeContactSummary?: InteractionEvent | null;
  activeContactRecord?: ContactRecord | null; threadCrmContext?: CommsCrmContextSummary | null;
  trips?: Trip[]; nowMs?: number; voiceOnlyMode?: boolean;
  onBackFromThread: () => void; onOpenContactEdit: () => void; onOpenClientProfile?: () => void;
  onBookContactRide: () => void; onOpenContactEmailInDock?: () => void; onMarkThreadUnread?: () => void;
  onOpenTripById?: (tripId: string) => void; onFocusTripOnMap?: (tripId: string) => void;
  onRebookLastRide?: (payload: WorkspaceEventMap['POPULATE_BOOKING']) => void;
  threadTab: ThreadTab; onChangeThreadTab: (tab: ThreadTab) => void;
  selectedInteractions: InteractionEvent[]; messagesEndRef?: React.RefObject<HTMLDivElement | null>;
  playingCallId: string | null; onTogglePlayCall: (id: string) => void;
  playingVoicemailId: string | null; onTogglePlayVoicemail: (id: string) => void;
  playbackSpeed: PlaybackSpeed; onCyclePlaybackSpeed: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void;
  onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  onOpenEmailInDock?: (evt: InteractionEvent) => void;
  onRetrySms?: (evt: InteractionEvent) => void; retryingSmsId?: string | null;
  onInsertTrackingLink?: () => void; onInsertPayLink?: () => void; isGeneratingPayLink?: boolean;
  noteDraftText?: string; onChangeNoteDraftText?: (val: string) => void; onAddInternalNote?: () => void;
  smsReplyText: string; onChangeSmsReplyText: (val: string) => void;
  isSendingSms: boolean; onSendSms: () => void; smsStatusMessage: string | null;
  conversationRows?: CommsConversationRowSummary[]; messageConversations?: InteractionEvent[];
  threadUnreadCountMap?: Map<string, number>; onSelectContact: (selectorTarget: string) => void;
  onOpenFreshNewMessageModal: () => void;
}

export function SmsThreadPane({
  mode, activeContactSummary, activeContactRecord, threadCrmContext, trips = [], nowMs, voiceOnlyMode,
  onBackFromThread, onOpenContactEdit, onOpenClientProfile, onBookContactRide, onOpenContactEmailInDock,
  onMarkThreadUnread, onOpenTripById, onFocusTripOnMap, onRebookLastRide, threadTab, onChangeThreadTab,
  selectedInteractions, messagesEndRef, playingCallId, onTogglePlayCall, playingVoicemailId, onTogglePlayVoicemail,
  playbackSpeed, onCyclePlaybackSpeed, onStartCall, onConvertVoicemailToBooking, onOpenEmailInDock,
  onRetrySms, retryingSmsId, onInsertTrackingLink, onInsertPayLink, isGeneratingPayLink = false,
  noteDraftText = '', onChangeNoteDraftText, onAddInternalNote, smsReplyText, onChangeSmsReplyText,
  isSendingSms, onSendSms, smsStatusMessage, conversationRows, messageConversations = [],
  threadUnreadCountMap, onSelectContact, onOpenFreshNewMessageModal,
}: SmsThreadPaneProps) {
  const effectivePhone =
    activeContactSummary?.mobilePhone || threadCrmContext?.primaryPhone ||
    (activeContactSummary?.contactPhone && !activeContactSummary.contactPhone.includes('@') && !activeContactSummary.contactPhone.startsWith('thr_') ? activeContactSummary.contactPhone : '');
  const effectiveEmail =
    threadCrmContext?.primaryEmail || activeContactRecord?.email || activeContactSummary?.contactEmail ||
    (activeContactSummary?.contactPhone?.includes('@') ? activeContactSummary.contactPhone : '');

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);

  const calcMenuCoords = useCallback(() => {
    if (!filterBtnRef.current || typeof window === 'undefined') return null;
    const rect = filterBtnRef.current.getBoundingClientRect();
    return { top: Math.min(window.innerHeight - 240, rect.bottom + 4), left: Math.max(8, Math.min(window.innerWidth - 196, rect.right - 188)) };
  }, []);

  useEffect(() => {
    if (!isFilterOpen) return setMenuCoords(null);
    setMenuCoords(calcMenuCoords());
    const onOut = (e: MouseEvent) => {
      if (!filterBtnRef.current?.contains(e.target as Node) && !filterMenuRef.current?.contains(e.target as Node)) setIsFilterOpen(false);
    };
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [isFilterOpen, calcMenuCoords]);

  const timeline = useMemo(() => buildOmnichannelTimelineItems({
    events: selectedInteractions, trips, contactPhone: effectivePhone, contactEmail: effectiveEmail,
    contactId: activeContactRecord?.id, threadTab, nowMs,
  }), [selectedInteractions, trips, effectivePhone, effectiveEmail, activeContactRecord?.id, threadTab, nowMs]);

  if (mode === 'thread' && activeContactSummary) {
    const displayName =
      threadCrmContext?.contactName && threadCrmContext.contactName !== 'Unknown Caller'
        ? threadCrmContext.contactName
        : activeContactRecord?.name || activeContactSummary.contactName;
    const isBlocked = Boolean(threadCrmContext?.isBlacklisted || activeContactRecord?.isBlacklisted);
    const isVip = Boolean(threadCrmContext?.isVip || activeContactRecord?.isVip);
    const isDriver = Boolean(threadCrmContext?.isDriver || activeContactSummary.contactType === 'driver');
    const isCorp = Boolean(threadCrmContext?.corporateAccountName || activeContactRecord?.corporateAccountName);
    const pinned = timeline.pinnedUpcomingTrip;

    const triggerProfileOverview = () => {
      if (onOpenClientProfile) return onOpenClientProfile();
      getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', { phone: effectivePhone || undefined, email: effectiveEmail || undefined, name: displayName || undefined, source: 'comms_hub' });
    };

    return (
      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden bg-white">
        <div data-comms-thread-header="v2" className="h-10 px-2 border-b border-slate-200 bg-white flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <button type="button" onClick={onBackFromThread} title="Back to list (Esc)" className="h-7 px-1.5 rounded-md hover:bg-slate-100 text-xs font-bold text-slate-600 cursor-pointer shrink-0">←</button>
            <button type="button" onClick={onOpenContactEdit} className="min-w-0 text-left flex items-center gap-1.5 hover:text-blue-700 cursor-pointer">
              <span className="text-xs font-extrabold text-slate-900 truncate max-w-[125px]">{displayName}</span>
              {effectivePhone && <span className="text-[10.5px] font-mono text-slate-500 hidden @[360px]/commshub:inline shrink-0">{formatDisplayPhone(effectivePhone)}</span>}
            </button>
            {isBlocked ? <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-black uppercase shrink-0">Blocked</span>
              : isVip ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase shrink-0">VIP</span>
              : isDriver ? <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">Driver</span>
              : isCorp ? <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold shrink-0">Corp</span> : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" disabled={!effectivePhone} onClick={() => effectivePhone && onStartCall(effectivePhone, displayName)} className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
              <PhoneIcon className="w-3 h-3" /><span>Call</span>
            </button>
            <button type="button" onClick={onBookContactRide} className="h-7 px-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer">Book</button>
            <button type="button" onClick={triggerProfileOverview} title="Client Profile" className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
              <UserIcon className="w-3 h-3 text-indigo-600" /><span className="hidden @[410px]/commshub:inline">Client Profile</span>
            </button>
            <button ref={filterBtnRef} type="button" onClick={() => setIsFilterOpen((v) => !v)} className={`h-7 px-1.5 rounded-md border text-[11px] font-bold inline-flex items-center gap-0.5 cursor-pointer ${threadTab !== 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              <span>Filter</span><ChevronDownIcon className="w-3 h-3" />
            </button>
          </div>
        </div>

        {pinned && (
          <div data-pinned-upcoming-trip={pinned.id} className="px-2.5 py-1 bg-blue-50/90 border-b border-blue-200/80 flex items-center justify-between gap-2 text-[11px] shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="font-mono font-extrabold text-blue-900 shrink-0">{formatShortTripId(pinned.id)}</span>
              <span className="text-slate-600 font-semibold shrink-0">{formatTripTimelineDateTime(pinned)}</span>
              <span className="text-slate-700 truncate">{formatShortRouteEndpoint(pinned.pickupLocation?.address)} → {formatShortRouteEndpoint(pinned.dropoffLocation?.address)}</span>
              <DispatchStatusBadge status={pinned.status} compact={true} trip={pinned} nowMs={nowMs} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => onOpenTripById?.(pinned.id)} className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold cursor-pointer">Edit</button>
              <button type="button" onClick={() => { getWorkspaceBus().publish('FOCUS_TRIP_ON_MAP', { tripId: pinned.id }); onFocusTripOnMap?.(pinned.id); }} className="px-1.5 py-0.5 rounded bg-white hover:bg-emerald-50 border border-slate-200 text-emerald-700 text-[10px] font-bold cursor-pointer">Map</button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-slate-50/30">
          {timeline.items.map((item) => {
            if (item.kind === 'trip') {
              const tr = item.trip;
              const fare = (tr.pricing?.totalFare ?? tr.payment?.amount ?? 0).toFixed(2);
              return (
                <div key={`trip_${tr.id}`} data-timeline-trip-card={tr.id} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-extrabold text-blue-700">{formatShortTripId(tr.id)}</span>
                      <span className="text-slate-500">{formatTripTimelineDateTime(tr)}</span>
                      <span className="font-bold text-slate-900">${fare}</span>
                    </div>
                    <DispatchStatusBadge status={tr.status} compact={false} trip={tr} nowMs={nowMs} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700 truncate">{formatShortRouteEndpoint(tr.pickupLocation?.address)} → {formatShortRouteEndpoint(tr.dropoffLocation?.address)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => onOpenTripById?.(tr.id)} className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold cursor-pointer">Edit</button>
                      <button type="button" onClick={() => { const p = buildReturnTripDraftPayload(tr, nowMs); getWorkspaceBus().publish('POPULATE_BOOKING', p); onRebookLastRide?.(p); }} className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[10.5px] font-bold cursor-pointer">⇄ Return</button>
                    </div>
                  </div>
                </div>
              );
            }

            const evt = item.event;
            const playable = hasPlayableCallAudio(evt);

            if (evt.type.startsWith('call_')) {
              const callLabel = evt.type === 'call_inbound' ? 'Inbound Call' : evt.type === 'call_outbound' ? 'Outbound Call' : 'Missed Call';
              const dur = evt.audioDuration || (evt.durationSeconds ? `${Math.floor(evt.durationSeconds / 60)}:${String(evt.durationSeconds % 60).padStart(2, '0')}` : '0:00');
              return (
                <div key={evt.id} data-call-row={evt.id} className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PhoneIcon className={`w-3.5 h-3.5 shrink-0 ${evt.type === 'call_missed' ? 'text-rose-600' : 'text-emerald-600'}`} />
                    <span className="font-bold text-slate-800 truncate">{callLabel}</span>
                    <span className="text-slate-400 font-mono shrink-0">{formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span>
                    <span className="text-slate-500 font-mono shrink-0">· {dur}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {playable && (
                      <div data-call-audio-player="true" className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => onTogglePlayCall(evt.id)} className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center cursor-pointer">
                          {playingCallId === evt.id ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}
                        </button>
                        <button type="button" onClick={onCyclePlaybackSpeed} className="px-1 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9.5px] font-bold cursor-pointer">{playbackSpeed}x</button>
                      </div>
                    )}
                    {evt.contactPhone && <button type="button" onClick={() => onStartCall(evt.contactPhone, evt.contactName)} className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10.5px] cursor-pointer">Call</button>}
                  </div>
                </div>
              );
            }

            if (evt.type === 'voicemail') {
              return (
                <div key={evt.id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold text-amber-900 inline-flex items-center gap-1"><MicIcon className="w-3 h-3" />Voicemail · {formatMessageTimestamp(evt.timestampMs, evt.timestamp)} · {evt.audioDuration || '0:30'}</span>
                    <div className="flex items-center gap-1">
                      {playable && (
                        <button type="button" onClick={() => onTogglePlayVoicemail(evt.id)} className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center cursor-pointer">
                          {playingVoicemailId === evt.id ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}
                        </button>
                      )}
                      <button type="button" onClick={() => onConvertVoicemailToBooking(evt.suggestedBooking)} className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10.5px] font-bold cursor-pointer">Book</button>
                    </div>
                  </div>
                  {evt.transcription && <p className="text-[11px] text-slate-700 italic line-clamp-2">&ldquo;{evt.transcription}&rdquo;</p>}
                </div>
              );
            }

            if (evt.type.startsWith('email_')) {
              const badge = resolveCommsEmailDeliveryBadge(evt.deliveryStatus, evt.type === 'email_outbound' ? 'outbound' : 'inbound');
              return (
                <div key={evt.id} data-email-card={evt.id} className="rounded-xl border border-indigo-200/80 bg-white p-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="font-extrabold text-indigo-900 inline-flex items-center gap-1"><MailIcon className="w-3 h-3 text-indigo-600" />{evt.subject || (evt.type === 'email_outbound' ? 'Sent Email' : 'Inbound Email')}</span>
                    <span className="text-slate-400 font-mono shrink-0">{badge.label} · {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span>
                  </div>
                  <p className="text-slate-600 line-clamp-2 leading-snug">{cleanCommsEmailSnippet(evt.bodyText || evt.snippet)}</p>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => onOpenEmailInDock?.(evt)} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-indigo-700 hover:underline cursor-pointer">Open in Email ↗</button>
                  </div>
                </div>
              );
            }

            if (evt.type === 'internal_note') {
              return (
                <div key={evt.id} className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between text-[10px] font-bold text-amber-800">
                    <span>Note · {evt.actorName || 'Dispatcher'}</span><span className="font-mono">{formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span>
                  </div>
                  <p className="text-slate-800 mt-0.5 whitespace-pre-wrap">{evt.bodyText || evt.snippet}</p>
                </div>
              );
            }

            const isOut = evt.type === 'sms_outbound';
            const isFailed = isOut && (evt.deliveryStatus === 'failed' || evt.deliveryStatus === 'undelivered');
            return (
              <div key={evt.id} className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-xs shadow-2xs ${isOut ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{evt.bodyText || evt.snippet}</p>
                  <div className={`flex items-center justify-end gap-1.5 mt-1 text-[9.5px] ${isOut ? 'text-blue-200' : 'text-slate-400'}`}>
                    <span className="font-mono">{formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span>
                    {isFailed && (
                      <span className="inline-flex items-center gap-1 text-amber-200 font-bold">
                        <AlertTriangleIcon className="w-2.5 h-2.5" /><span>{evt.deliveryStatus === 'undelivered' ? 'Undelivered' : 'Failed'}</span>
                        {onRetrySms && <button type="button" disabled={retryingSmsId === evt.id} onClick={() => onRetrySms(evt)} className="underline ml-1 cursor-pointer">{retryingSmsId === evt.id ? <SpinnerIcon className="w-2.5 h-2.5 animate-spin inline" /> : <RefreshCwIcon className="w-2.5 h-2.5 inline" />} Retry</button>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {timeline.items.length === 0 && <div className="py-10 text-center text-xs text-slate-400">No items in this view yet.</div>}
          <div ref={messagesEndRef} />
        </div>

        <CommsComposerBar
          effectivePhone={effectivePhone} voiceOnlyMode={voiceOnlyMode} templateContext={threadCrmContext?.templateContext}
          hasMatchedTrip={Boolean(threadCrmContext?.primaryMatchedTrip || pinned)} smsReplyText={smsReplyText}
          onChangeSmsReplyText={onChangeSmsReplyText} onSendSms={onSendSms} isSendingSms={isSendingSms}
          noteDraftText={noteDraftText} onChangeNoteDraftText={onChangeNoteDraftText || (() => {})}
          onAddInternalNote={onAddInternalNote || (() => {})} onInsertTrackingLink={onInsertTrackingLink}
          onInsertPayLink={onInsertPayLink} isGeneratingPayLink={isGeneratingPayLink} smsStatusMessage={smsStatusMessage}
        />

        {isFilterOpen && menuCoords !== null && typeof document !== 'undefined' && createPortal(
          <div ref={filterMenuRef} style={{ position: 'fixed', top: `${menuCoords.top}px`, left: `${menuCoords.left}px`, width: '188px' }} className="z-[260] bg-white rounded-xl shadow-xl ring-1 ring-slate-900/5 py-1 text-xs divide-y divide-slate-100 select-none">
            <div className="py-0.5">
              {THREAD_FILTER_OPTS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => { onChangeThreadTab(opt.value); setIsFilterOpen(false); }} className={`w-full px-3 py-1.5 text-left font-semibold flex items-center justify-between cursor-pointer ${threadTab === opt.value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span>{opt.label}</span>{threadTab === opt.value && <span>✓</span>}
                </button>
              ))}
            </div>
            <div className="py-0.5">
              {onOpenContactEmailInDock && (
                <button type="button" onClick={() => { onOpenContactEmailInDock(); setIsFilterOpen(false); }} className="w-full px-3 py-1.5 text-left font-semibold text-indigo-700 hover:bg-indigo-50 flex items-center gap-1.5 cursor-pointer">
                  <ExternalLinkIcon className="w-3 h-3" /><span>Open in Email Dock</span>
                </button>
              )}
              {onMarkThreadUnread && <button type="button" onClick={() => { onMarkThreadUnread(); setIsFilterOpen(false); }} className="w-full px-3 py-1.5 text-left font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Mark Unread</button>}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  const rows: CommsConversationRowSummary[] = conversationRows || messageConversations.map((sms) => {
    const norm = normalizePhone(sms.contactPhone) || sms.contactPhone;
    const unread = threadUnreadCountMap?.get(norm) || (sms.isUnread ? 1 : 0);
    return {
      threadId: sms.threadId || `thr_${norm || sms.id}`, selectorTarget: sms.contactPhone || sms.contactEmail || sms.threadId || '',
      latestEvent: sms, contactName: sms.contactName, contactType: sms.contactType, primaryPhone: sms.contactPhone || undefined,
      displayPhone: sms.contactPhone ? formatDisplayPhone(sms.contactPhone) : undefined, primaryEmail: sms.contactEmail,
      isVip: false, isBlacklisted: false, channels: ['sms'], channelCounts: { sms: 1, call: 0, voicemail: 0, email: 0, note: 0 },
      unreadCountTotal: unread, unreadByChannel: { sms: unread, call: 0, voicemail: 0, email: 0 },
    };
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 bg-white">
      {rows.length === 0 ? (
        <div className="py-12 px-4 text-center space-y-2">
          <p className="text-xs font-bold text-slate-600">No Conversations Found</p>
          <button type="button" onClick={onOpenFreshNewMessageModal} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer">+ New SMS</button>
        </div>
      ) : rows.map((row) => {
        const isUnread = row.unreadCountTotal > 0 || Boolean(row.latestEvent.isUnread);
        return (
          <div key={row.threadId} onClick={() => row.selectorTarget && onSelectContact(row.selectorTarget)} className={`min-h-[52px] px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-colors ${isUnread ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">{(row.contactName || '#').charAt(0).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`text-xs truncate ${isUnread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>{row.contactName}</span>
                  {row.isVip && <span className="px-1 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase shrink-0">VIP</span>}
                  {row.contactType === 'driver' && <span className="px-1 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">Driver</span>}
                  {row.contactType === 'corporate' && <span className="px-1 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold shrink-0">Corp</span>}
                  {row.unreadCountTotal > 0 && <span className="px-1.5 rounded-full bg-blue-600 text-white text-[9.5px] font-black shrink-0">{row.unreadCountTotal}</span>}
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">{row.latestEvent.timestamp}</span>
              </div>
              <p className={`text-[11px] truncate ${isUnread ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>{cleanCommsEmailSnippet(row.latestEvent.snippet)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {row.primaryPhone && <button type="button" onClick={() => onStartCall(row.primaryPhone, row.contactName)} title="Call" className="p-1.5 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white cursor-pointer"><PhoneIcon className="w-3 h-3" /></button>}
              <button type="button" onClick={() => getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', { phone: row.primaryPhone, email: row.primaryEmail, name: row.contactName, source: 'comms_hub' })} title="Client Profile" className="p-1.5 rounded-md bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white cursor-pointer"><UserIcon className="w-3 h-3" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
