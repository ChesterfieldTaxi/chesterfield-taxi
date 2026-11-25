import React, { useEffect, useState } from 'react';
import {
  COMMS_CHANNEL_BADGE_CONFIG,
  buildInterpolatedCommsSmsChips,
  resolveCommsEmailDeliveryBadge,
  type CommsConversationRowSummary,
  type CommsCrmContextSummary,
} from '../../../../core/services/comms/comms-templates.service';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import type { AppSettings } from '../../../../core/types/config';
import type { ContactRecord } from '../../../../core/services/customer/contact.service';
import { normalizePhone } from '../../../../core/services/passenger.service';
import type {
  UpcomingBookingPreview,
  WorkspaceEventMap,
} from '../../../../core/services/workspace-bus.service';
import type { CommsChannel } from '../../../../core/types/comms';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import { FloatingWindow } from '../../../ui/FloatingWindow';
import { Select } from '../../../ui/Select';
import {
  AlertTriangleIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  MailIcon,
  MicIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  SpinnerIcon,
  ZapIcon,
} from '../../../ui/Icons';
import { CommsBatchActionBar } from './CommsBatchActionBar';
import { CommsCrmContextBanner } from './CommsCrmContextBanner';
import { CommsFilterToolbar } from './CommsFilterToolbar';
import {
  formatMessageTimestamp,
  type CommsSheetDragProps,
  type ContactFilter,
  type InteractionEvent,
  type PlaybackSpeed,
  type ThreadTab,
} from './comms-types';

const CHANNEL_PILL_CLASSES: Record<CommsChannel, string> = {
  sms: 'bg-blue-50 text-blue-700 border-blue-200',
  call: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  voicemail: 'bg-amber-50 text-amber-800 border-amber-200',
  email: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  note: 'bg-slate-100 text-slate-700 border-slate-200',
};

const EMAIL_DELIVERY_PILL_CLASSES: Record<
  'emerald' | 'blue' | 'amber' | 'rose' | 'slate',
  string
> = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export interface SmsThreadPaneProps {
  mode: 'thread' | 'list';
  // Thread view (VIEW 2) props
  activeContactSummary?: InteractionEvent | null;
  activeContactRecord?: ContactRecord | null;
  threadCrmContext?: CommsCrmContextSummary | null;
  onBackFromThread: () => void;
  onOpenContactEdit: () => void;
  onBookContactRide: () => void;
  onOpenContactEmailInDock?: () => void;
  onOpenTripById?: (tripId: string) => void;
  onRebookLastRide?: (payload: WorkspaceEventMap['POPULATE_BOOKING']) => void;
  threadTab: ThreadTab;
  onChangeThreadTab: (tab: ThreadTab) => void;
  totalContactInteractionCount: number;
  threadSmsCount: number;
  threadCallCount: number;
  threadEmailCount?: number;
  threadNoteCount?: number;
  has10DlcBlockedMessages: boolean;
  upcomingBookingsForContact: UpcomingBookingPreview[];
  onViewUpcomingTrip: (trip: UpcomingBookingPreview) => void;
  selectedInteractions: InteractionEvent[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  playingCallId: string | null;
  onTogglePlayCall: (id: string) => void;
  playingVoicemailId: string | null;
  onTogglePlayVoicemail: (id: string) => void;
  playbackSpeed: PlaybackSpeed;
  onCyclePlaybackSpeed: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void;
  onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  onOpenEmailInDock?: (evt: InteractionEvent) => void;
  onRetrySms?: (evt: InteractionEvent) => void;
  retryingSmsId?: string | null;
  onInsertTrackingLink?: () => void;
  onInsertPayLink?: () => void;
  isGeneratingPayLink?: boolean;
  noteDraftText?: string;
  onChangeNoteDraftText?: (val: string) => void;
  onAddInternalNote?: () => void;
  smsReplyText: string;
  onChangeSmsReplyText: (val: string) => void;
  isSendingSms: boolean;
  onSendSms: () => void;
  smsStatusMessage: string | null;
  // Messaging / Unified Thread list view (VIEW 5) props
  conversationRows?: CommsConversationRowSummary[];
  messageConversations: InteractionEvent[];
  threadUnreadCountMap: Map<string, number>;
  selectedItemIds: Set<string>;
  isAllSelected: boolean;
  masterCheckboxRef: React.RefObject<HTMLInputElement | null>;
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  onClearSelection: () => void;
  onBatchMarkRead: () => void;
  onBatchMarkUnread: () => void;
  onBatchArchive: () => void;
  unreadCountMessages: number;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  contactFilter: ContactFilter;
  onChangeContactFilter: (val: ContactFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onSelectContact: (selectorTarget: string) => void;
  onOpenFreshNewMessageModal: () => void;
}

export function SmsThreadPane({
  mode,
  activeContactSummary,
  activeContactRecord,
  threadCrmContext,
  onBackFromThread,
  onOpenContactEdit,
  onBookContactRide,
  onOpenContactEmailInDock,
  onOpenTripById,
  onRebookLastRide,
  threadTab,
  onChangeThreadTab,
  totalContactInteractionCount,
  threadSmsCount,
  threadCallCount,
  threadEmailCount = 0,
  threadNoteCount = 0,
  has10DlcBlockedMessages,
  upcomingBookingsForContact,
  onViewUpcomingTrip,
  selectedInteractions,
  messagesEndRef,
  playingCallId,
  onTogglePlayCall,
  playingVoicemailId,
  onTogglePlayVoicemail,
  playbackSpeed,
  onCyclePlaybackSpeed,
  onStartCall,
  onConvertVoicemailToBooking,
  onOpenEmailInDock,
  onRetrySms,
  retryingSmsId,
  onInsertTrackingLink,
  onInsertPayLink,
  isGeneratingPayLink = false,
  noteDraftText = '',
  onChangeNoteDraftText,
  onAddInternalNote,
  smsReplyText,
  onChangeSmsReplyText,
  isSendingSms,
  onSendSms,
  smsStatusMessage,
  conversationRows,
  messageConversations,
  threadUnreadCountMap,
  selectedItemIds,
  isAllSelected,
  masterCheckboxRef,
  onToggleSelectAll,
  onToggleSelectRow,
  onClearSelection,
  onBatchMarkRead,
  onBatchMarkUnread,
  onBatchArchive,
  unreadCountMessages,
  filterUnreadOnly,
  onToggleUnreadOnly,
  contactFilter,
  onChangeContactFilter,
  searchQuery,
  onChangeSearchQuery,
  searchInputRef,
  onSelectContact,
  onOpenFreshNewMessageModal,
}: SmsThreadPaneProps) {
  const effectivePhone =
    activeContactSummary?.mobilePhone ||
    threadCrmContext?.primaryPhone ||
    (activeContactSummary?.contactPhone &&
    !activeContactSummary.contactPhone.includes('@') &&
    !activeContactSummary.contactPhone.startsWith('thr_')
      ? activeContactSummary.contactPhone
      : '');

  const effectiveEmail =
    threadCrmContext?.primaryEmail ||
    activeContactRecord?.email ||
    activeContactSummary?.contactEmail ||
    (activeContactSummary?.contactPhone?.includes('@')
      ? activeContactSummary.contactPhone
      : '');

  const [composerMode, setComposerMode] = useState<'sms' | 'note'>(() =>
    threadTab === 'notes' || !effectivePhone ? 'note' : 'sms'
  );

  useEffect(() => {
    if (threadTab === 'notes') {
      setComposerMode('note');
    } else if (threadTab === 'sms' && effectivePhone) {
      setComposerMode('sms');
    } else if (!effectivePhone) {
      setComposerMode('note');
    } else {
      setComposerMode('sms');
    }
  }, [threadTab, effectivePhone]);

  const [appSettings, setAppSettings] = useState<Partial<AppSettings> | null>(null);

  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings((s) => {
      setAppSettings(s);
    });
    return () => unsub();
  }, []);

  const cannedChips = React.useMemo(
    () => buildInterpolatedCommsSmsChips(threadCrmContext?.templateContext, appSettings),
    [threadCrmContext?.templateContext, appSettings]
  );

  if (mode === 'thread' && activeContactSummary) {
    const hasMatchedTrip = Boolean(threadCrmContext?.primaryMatchedTrip);

    return (
      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Thread Header */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBackFromThread}
              title="Back to list (Esc)"
              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={onOpenContactEdit}
              className="text-left group hover:bg-slate-200/60 p-1.5 -m-1.5 rounded-xl transition-all cursor-pointer min-w-0"
              title="Click to view & edit contact profile"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5 truncate">
                  <span className="truncate">
                    {threadCrmContext?.contactName &&
                    threadCrmContext.contactName !== 'Unknown Caller'
                      ? threadCrmContext.contactName
                      : activeContactRecord?.name || activeContactSummary.contactName}
                  </span>
                  <span className="text-slate-400 group-hover:text-blue-600 text-xs shrink-0">
                    ✎
                  </span>
                </span>
                {(threadCrmContext?.isVip || activeContactRecord?.isVip) && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-black uppercase shrink-0">
                    VIP
                  </span>
                )}
                {threadCrmContext?.isKnownContact && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold shrink-0">
                    Verified Contact
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                {effectivePhone && (
                  <span className="font-mono">{formatDisplayPhone(effectivePhone)}</span>
                )}
                {effectiveEmail && (
                  <span className="text-indigo-600 font-semibold truncate max-w-[180px]">
                    {effectivePhone ? '• ' : ''}
                    {effectiveEmail}
                  </span>
                )}
                {activeContactSummary.mobilePhone &&
                  normalizePhone(activeContactSummary.mobilePhone) !==
                    normalizePhone(effectivePhone) && (
                    <span className="text-blue-600 font-semibold">
                      • Cell: {formatDisplayPhone(activeContactSummary.mobilePhone)}
                    </span>
                  )}
                <span className="text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                  Edit Profile
                </span>
              </div>
            </button>
          </div>

          {/* Quick Actions Trio: Call | Email | Book */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!effectivePhone}
              onClick={() =>
                effectivePhone &&
                onStartCall(
                  effectivePhone,
                  activeContactRecord?.name || activeContactSummary.contactName
                )
              }
              title={
                effectivePhone
                  ? `Call ${formatDisplayPhone(effectivePhone)}`
                  : 'No phone number linked to this thread yet'
              }
              className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <PhoneIcon className="w-3 h-3" />
              <span>Call</span>
            </button>

            {onOpenContactEmailInDock && (
              <button
                type="button"
                onClick={onOpenContactEmailInDock}
                title={
                  effectiveEmail
                    ? `Open ${effectiveEmail} in Email Dock`
                    : 'Open Email Dock composer for this contact'
                }
                className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <MailIcon className="w-3 h-3" />
                <span>Email</span>
              </button>
            )}

            <button
              type="button"
              onClick={onBookContactRide}
              title="Populate Dispatch Booking for this contact"
              className="px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <span>Book</span>
            </button>
          </div>
        </div>

        {/* Thread Channel Filter Sub-Bar & 10DLC Notice Banner */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 bg-white border border-slate-200/90 p-0.5 rounded-lg text-[10px] font-bold shrink-0">
            <button
              type="button"
              onClick={() => onChangeThreadTab('all')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                threadTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({totalContactInteractionCount})
            </button>
            <button
              type="button"
              onClick={() => onChangeThreadTab('sms')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                threadTab === 'sms'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ChatBubbleLeftRightIcon className="w-3 h-3" />
              <span>SMS ({threadSmsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeThreadTab('calls')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                threadTab === 'calls'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PhoneIcon className="w-3 h-3" />
              <span>Calls ({threadCallCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeThreadTab('emails')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                threadTab === 'emails'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MailIcon className="w-3 h-3" />
              <span>Email ({threadEmailCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeThreadTab('notes')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                threadTab === 'notes'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Notes ({threadNoteCount})</span>
            </button>
          </div>

          {has10DlcBlockedMessages && (
            <div className="flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-md font-medium shrink-0">
              <AlertTriangleIcon className="w-3 h-3 text-amber-600 shrink-0" />
              <span className="font-bold text-amber-700">10DLC Notice:</span>
              <span className="hidden sm:inline">
                Carrier requires A2P 10DLC campaign registration.
              </span>
            </div>
          )}
        </div>

        {has10DlcBlockedMessages && (
          <div className="bg-amber-50/95 border-b border-amber-200 px-3 py-1.5 flex items-start gap-2 text-[11px] text-amber-900 shrink-0">
            <span className="font-bold text-amber-700 shrink-0">Carrier Alert:</span>
            <span className="leading-tight">
              Outbound SMS to US mobile networks (Verizon/AT&amp;T/T-Mobile) is blocked by carriers until A2P 10DLC Campaign registration is approved in Twilio Console. Inbound texts and VoIP delivery (e.g. 314-738-0100) are working normally.
            </span>
          </div>
        )}

        {/* Live Unified CRM Context Banner (VIP, Blacklist, Corporate, Accessibility, Active Trip + Flight Badge, Rebook) */}
        {threadCrmContext ? (
          <CommsCrmContextBanner
            crmContext={threadCrmContext}
            variant="light"
            onOpenTrip={onOpenTripById}
            onRebookLastRide={onRebookLastRide}
          />
        ) : (
          upcomingBookingsForContact.length > 0 && (
            <div className="bg-blue-50/70 border-b border-blue-100 px-3 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-900">1 Upcoming Reservation:</span>
                <span className="text-blue-700">
                  {upcomingBookingsForContact[0].time} to{' '}
                  {upcomingBookingsForContact[0].dropoffAddress}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onViewUpcomingTrip(upcomingBookingsForContact[0])}
                className="text-[10px] font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
              >
                View Trip
              </button>
            </div>
          )
        )}

        {/* Thread Activity Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
          {selectedInteractions.map((evt, idx) => {
            const prevEvt = idx > 0 ? selectedInteractions[idx - 1] : null;
            const curDateStr = evt.timestampMs ? new Date(evt.timestampMs).toDateString() : '';
            const prevDateStr = prevEvt?.timestampMs
              ? new Date(prevEvt.timestampMs).toDateString()
              : '';
            const showDateSeparator = curDateStr && curDateStr !== prevDateStr;

            const isFailedOutboundSms =
              evt.type === 'sms_outbound' &&
              (evt.deliveryStatus === 'failed' || evt.deliveryStatus === 'undelivered');

            return (
              <div key={evt.id} className="flex flex-col">
                {/* Optional Date Header Separator */}
                {showDateSeparator && (
                  <div className="flex justify-center my-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-600">
                      {new Date(evt.timestampMs!).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {/* SMS Inbound Bubble */}
                {evt.type === 'sms_inbound' && (
                  <div className="self-start max-w-[82%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[10px] font-bold text-slate-600">
                        {evt.contactName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {evt.bodyText || evt.snippet}
                    </p>
                  </div>
                )}

                {/* SMS Outbound Bubble (+ 1-Tap Retry when failed/undelivered) */}
                {evt.type === 'sms_outbound' && (
                  <div className="self-end max-w-[82%] bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[10px] text-blue-100 font-semibold">
                        Chesterfield Dispatch
                      </span>
                      <span className="text-[10px] text-blue-200 font-mono">
                        {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">
                      {evt.bodyText || evt.snippet}
                    </p>
                    {(evt.deliveryStatus || isFailedOutboundSms) && (
                      <div className="flex items-center justify-end gap-2 mt-1.5 text-[9.5px] flex-wrap">
                        {evt.deliveryStatus === 'delivered' ? (
                          <span className="text-emerald-300 font-medium flex items-center gap-0.5">
                            ✓✓ Delivered
                          </span>
                        ) : evt.deliveryStatus === 'sent' || evt.deliveryStatus === 'queued' ? (
                          <span className="text-blue-200 flex items-center gap-0.5">
                            ✓ Sent to carrier
                          </span>
                        ) : evt.deliveryStatus === 'undelivered' ? (
                          <span
                            className="text-amber-200 font-medium flex items-center gap-1"
                            title={
                              evt.errorMessage ||
                              'Carrier rejected delivery. US carriers require A2P 10DLC registration in Twilio Console.'
                            }
                          >
                            <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                            <span>Undelivered (10DLC blocked)</span>
                          </span>
                        ) : evt.deliveryStatus === 'failed' ? (
                          <span
                            className="text-rose-200 font-medium flex items-center gap-1"
                            title={evt.errorMessage || 'SMS dispatch failed'}
                          >
                            <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                            <span>Failed</span>
                          </span>
                        ) : null}

                        {isFailedOutboundSms && onRetrySms && (
                          <button
                            type="button"
                            disabled={retryingSmsId === evt.id}
                            onClick={() => onRetrySms(evt)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white font-bold cursor-pointer transition-colors disabled:opacity-50"
                            title="Re-dispatch this SMS message"
                          >
                            {retryingSmsId === evt.id ? (
                              <SpinnerIcon className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RefreshCwIcon className="w-2.5 h-2.5" />
                            )}
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Call Event with Recording Playback */}
                {evt.type.startsWith('call_') && (
                  <div className="self-start w-full max-w-[85%] bg-emerald-50/70 border border-emerald-200/90 rounded-2xl rounded-tl-sm p-3 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                          <PhoneIcon className="w-3 h-3" />
                        </div>
                        <span className="text-[11px] font-black text-emerald-950">
                          {evt.type === 'call_inbound'
                            ? 'Inbound Call'
                            : evt.type === 'call_outbound'
                            ? 'Outbound Call'
                            : 'Missed Call'}{' '}
                          • {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-800 font-bold">
                        {evt.audioDuration ||
                          `${Math.floor((evt.durationSeconds || 60) / 60)}:${(
                            (evt.durationSeconds || 60) % 60
                          )
                            .toString()
                            .padStart(2, '0')}`}
                      </span>
                    </div>

                    {/* Call Recording Audio Scrubber */}
                    <div className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onTogglePlayCall(evt.id)}
                          className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                        >
                          {playingCallId === evt.id ? (
                            <PauseIcon className="w-3.5 h-3.5" />
                          ) : (
                            <PlayIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="h-2 w-24 bg-emerald-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-emerald-600 ${
                              playingCallId === evt.id ? 'w-2/3 animate-pulse' : 'w-0'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={onCyclePlaybackSpeed}
                          className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                          title="Playback speed"
                        >
                          {playbackSpeed}x
                        </button>
                      </div>

                      {evt.contactPhone && (
                        <button
                          type="button"
                          onClick={() => onStartCall(evt.contactPhone, evt.contactName)}
                          className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <PhoneIcon className="w-2.5 h-2.5" />
                          <span>Call</span>
                        </button>
                      )}
                    </div>

                    {evt.transcription && (
                      <p className="text-[11px] text-slate-700 italic border-l-2 border-emerald-400 pl-2">
                        &ldquo;{evt.transcription}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Voicemail Bubble with Audio Scrubber & Actions */}
                {evt.type === 'voicemail' && (
                  <div className="self-start max-w-[85%] bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm p-3 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900">
                        <MicIcon className="w-3 h-3 text-amber-700" />
                        <span>
                          Voicemail &middot;{' '}
                          {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-700 font-bold">
                        {evt.audioDuration}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onTogglePlayVoicemail(evt.id)}
                          className="w-7 h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                        >
                          {playingVoicemailId === evt.id ? (
                            <PauseIcon className="w-3.5 h-3.5" />
                          ) : (
                            <PlayIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="h-2 w-24 bg-amber-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-amber-600 ${
                              playingVoicemailId === evt.id ? 'w-2/3 animate-pulse' : 'w-0'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={onCyclePlaybackSpeed}
                          className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold border border-amber-300 transition-colors cursor-pointer"
                          title="Playback speed"
                        >
                          {playbackSpeed}x
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {evt.contactPhone && (
                          <button
                            type="button"
                            onClick={() => onStartCall(evt.contactPhone, evt.contactName)}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <PhoneIcon className="w-2.5 h-2.5" />
                            <span>Call</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onConvertVoicemailToBooking(evt.suggestedBooking)}
                          className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <span>Book</span>
                        </button>
                      </div>
                    </div>

                    {evt.transcription && (
                      <p className="text-xs text-slate-800 italic border-l-2 border-amber-400 pl-2">
                        &ldquo;{evt.transcription}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Upgraded Email Inbound / Outbound Card */}
                {evt.type.startsWith('email_') && (() => {
                  const deliveryBadge = resolveCommsEmailDeliveryBadge(
                    evt.deliveryStatus,
                    evt.type === 'email_outbound' ? 'outbound' : 'inbound'
                  );
                  return (
                    <div
                      className={`w-full max-w-[88%] rounded-2xl p-3 shadow-xs space-y-1.5 border ${
                        evt.type === 'email_outbound'
                          ? 'self-end bg-indigo-50/90 border-indigo-200 rounded-tr-sm'
                          : 'self-start bg-white border-indigo-200/80 rounded-tl-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-900">
                            <MailIcon className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span>
                              {evt.type === 'email_outbound' ? 'Sent Email' : 'Inbound Email'}
                            </span>
                          </span>
                          <span
                            className={`inline-flex items-center gap-0.5 text-[9.5px] font-extrabold px-1.5 py-0.2 rounded-md border ${
                              EMAIL_DELIVERY_PILL_CLASSES[deliveryBadge.tone]
                            }`}
                          >
                            {deliveryBadge.isWarning && (
                              <AlertTriangleIcon className="w-2.5 h-2.5 shrink-0" />
                            )}
                            <span>{deliveryBadge.label}</span>
                          </span>
                          {evt.tripId && (
                            <button
                              type="button"
                              onClick={() => onOpenTripById?.(evt.tripId!)}
                              className="text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                              title={`Open linked trip ${evt.tripId}`}
                            >
                              {evt.tripId}
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                        </span>
                      </div>

                      {evt.subject && (
                        <p className="text-xs font-bold text-slate-900 leading-snug">
                          {evt.subject}
                        </p>
                      )}

                      {deliveryBadge.isWarning && evt.errorMessage && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[10.5px] text-rose-800 font-medium">
                          <AlertTriangleIcon className="w-3 h-3 text-rose-600 shrink-0" />
                          <span className="truncate">{evt.errorMessage}</span>
                        </div>
                      )}

                      <p className="text-xs text-slate-700 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                        {evt.bodyText || evt.snippet}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-500 truncate">
                          {evt.contactEmail ||
                            activeContactRecord?.email ||
                            'dispatch@chesterfieldtaxi.com'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {evt.suggestedBooking && (
                            <button
                              type="button"
                              onClick={() => onConvertVoicemailToBooking(evt.suggestedBooking)}
                              className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                              title="Populate Dispatch Booking from email request"
                            >
                              Book
                            </button>
                          )}
                          {onOpenEmailInDock && (
                            <button
                              type="button"
                              onClick={() => onOpenEmailInDock(evt)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              <span>Open in Email Dock</span>
                              <ExternalLinkIcon className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Internal Dispatcher Note Card */}
                {evt.type === 'internal_note' && (
                  <div className="self-center w-full max-w-[90%] bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-extrabold uppercase tracking-wide text-amber-800">
                        Internal Note · {evt.actorName || 'Dispatcher'}
                      </span>
                      <span className="font-mono text-amber-700/80">
                        {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {evt.bodyText || evt.snippet}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          {selectedInteractions.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <MailIcon className="w-8 h-8 mb-2 opacity-30 text-slate-500" />
              <p className="text-xs font-bold text-slate-600">
                {threadTab === 'sms'
                  ? 'No SMS text messages for this contact yet.'
                  : threadTab === 'calls'
                  ? 'No calls or voicemails recorded for this contact yet.'
                  : threadTab === 'emails'
                  ? 'No emails recorded for this contact yet.'
                  : threadTab === 'notes'
                  ? 'No internal dispatcher notes for this thread yet.'
                  : 'No interactions recorded for this contact yet.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {composerMode === 'note'
                  ? 'Add an internal note below to document thread context.'
                  : 'Use a canned SMS template or composer below to message this contact.'}
              </p>
            </div>
          )}
          {/* Auto-scroll anchor to stick to the bottom of the thread */}
          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Canned SMS Bar, 1-Tap Tracking/Pay Links & SMS / Internal Note Composer */}
        <div className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
          {/* Compact Composer Mode Toggle (SMS Reply vs Internal Note) + 1-Tap Link Actions */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center bg-slate-100 border border-slate-200 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                disabled={!effectivePhone}
                onClick={() => setComposerMode('sms')}
                title={
                  effectivePhone
                    ? 'Switch to SMS text reply'
                    : 'Link a phone number on contact profile to send SMS'
                }
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1 ${
                  composerMode === 'sms'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChatBubbleLeftRightIcon className="w-2.5 h-2.5" />
                <span>SMS Reply</span>
              </button>
              {onChangeNoteDraftText && onAddInternalNote && (
                <button
                  type="button"
                  onClick={() => setComposerMode('note')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                    composerMode === 'note'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileTextIcon className="w-2.5 h-2.5" />
                  <span>Internal Note</span>
                </button>
              )}
            </div>

            {/* 1-Tap Tracking Link & Pay Link Insertion when contact has a matched trip */}
            {composerMode === 'sms' && hasMatchedTrip && (
              <div className="flex items-center gap-1.5">
                {onInsertTrackingLink && (
                  <button
                    type="button"
                    onClick={onInsertTrackingLink}
                    title="Insert live /track/ chauffeur link into SMS"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    <LinkIcon className="w-2.5 h-2.5 text-blue-600" />
                    <span>+ Tracking Link</span>
                  </button>
                )}
                {onInsertPayLink && (
                  <button
                    type="button"
                    disabled={isGeneratingPayLink}
                    onClick={onInsertPayLink}
                    title="Insert 1-tap secure Stripe /pay/ link into SMS"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isGeneratingPayLink ? (
                      <SpinnerIcon className="w-2.5 h-2.5 animate-spin text-emerald-600" />
                    ) : (
                      <CreditCardIcon className="w-2.5 h-2.5 text-emerald-600" />
                    )}
                    <span>+ Pay Link</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {composerMode === 'note' && onChangeNoteDraftText && onAddInternalNote ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={noteDraftText}
                onChange={(e) => onChangeNoteDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAddInternalNote();
                  }
                }}
                placeholder="Log internal dispatcher note to unified thread (Enter or Ctrl+Enter)..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-amber-300 focus:outline-amber-500 bg-amber-50/40 focus:bg-white"
              />
              <button
                type="button"
                onClick={onAddInternalNote}
                disabled={!noteDraftText.trim()}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Save Note
              </button>
            </div>
          ) : (
            <>
              {/* Config-Driven Dynamic Canned SMS Templates Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                {cannedChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => onChangeSmsReplyText(chip.text)}
                    title={chip.text}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-800 border border-slate-200/80 hover:border-blue-200 text-slate-700 font-semibold whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <ZapIcon className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    <span>{chip.shortLabel}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={smsReplyText}
                  onChange={(e) => onChangeSmsReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSendSms();
                    }
                  }}
                  placeholder={
                    effectivePhone
                      ? `Send SMS to ${formatDisplayPhone(effectivePhone)} (Enter or Ctrl+Enter)...`
                      : 'Add a mobile phone to contact profile to send SMS...'
                  }
                  disabled={!effectivePhone}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-blue-500 bg-slate-50 focus:bg-white disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={onSendSms}
                  disabled={isSendingSms || !smsReplyText.trim() || !effectivePhone}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSendingSms ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Send</span>
                </button>
              </div>
            </>
          )}

          {smsStatusMessage && (
            <p
              className={`text-[10px] font-bold ${
                smsStatusMessage.startsWith('Failed') || smsStatusMessage.startsWith('Error')
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }`}
            >
              {smsStatusMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  // mode === 'list' (VIEW 5: UNIFIED MULTI-CHANNEL CONVERSATION LIST)
  const effectiveRows: CommsConversationRowSummary[] =
    conversationRows ||
    messageConversations.map((sms) => {
      const norm = normalizePhone(sms.contactPhone) || sms.contactPhone;
      const unread = threadUnreadCountMap.get(norm) || (sms.isUnread ? 1 : 0);
      return {
        threadId: sms.threadId || `thr_${norm || sms.id}`,
        selectorTarget: sms.contactPhone || sms.contactEmail || sms.threadId || '',
        latestEvent: sms,
        contactName: sms.contactName,
        contactType: sms.contactType,
        primaryPhone: sms.contactPhone || undefined,
        displayPhone: sms.contactPhone ? formatDisplayPhone(sms.contactPhone) : undefined,
        primaryEmail: sms.contactEmail,
        isVip: false,
        isBlacklisted: false,
        channels: sms.channel ? [sms.channel] : ['sms'],
        channelCounts: { sms: 1, call: 0, voicemail: 0, email: 0, note: 0 },
        unreadCountTotal: unread,
        unreadByChannel: { sms: unread, call: 0, voicemail: 0, email: 0 },
      };
    });

  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-white overflow-y-auto">
      {/* Conversations Actions Header Bar */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">Conversations</span>
          <span className="text-[10px] text-slate-500 font-medium">
            ({effectiveRows.length})
          </span>
        </div>
      </div>

      <CommsBatchActionBar
        selectedCount={selectedItemIds.size}
        onMarkRead={onBatchMarkRead}
        onMarkUnread={onBatchMarkUnread}
        onArchive={onBatchArchive}
        onClear={onClearSelection}
      />
      {selectedItemIds.size === 0 && (
        <CommsFilterToolbar
          isAllSelected={isAllSelected}
          masterCheckboxRef={masterCheckboxRef}
          onToggleSelectAll={onToggleSelectAll}
          unreadCount={unreadCountMessages}
          filterUnreadOnly={filterUnreadOnly}
          onToggleUnreadOnly={onToggleUnreadOnly}
          contactFilter={contactFilter}
          onChangeContactFilter={onChangeContactFilter}
          searchQuery={searchQuery}
          onChangeSearchQuery={onChangeSearchQuery}
          searchInputRef={searchInputRef}
          showChannelFilter={false}
          placeholder="Filter threads..."
        />
      )}

      <div className="divide-y divide-slate-100 pb-16">
        {effectiveRows.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-3 px-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <ChatBubbleLeftRightIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">No Conversations Found</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Start a new message or adjust active filters.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenFreshNewMessageModal}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Compose Message</span>
            </button>
          </div>
        ) : (
          effectiveRows.map((row) => {
            const evtId = row.latestEvent.id;
            const isRowSelected = selectedItemIds.has(evtId);
            const isThreadUnread = row.unreadCountTotal > 0 || Boolean(row.latestEvent.isUnread);
            const isEmailOnly = !row.primaryPhone && Boolean(row.primaryEmail);

            return (
              <div
                key={row.threadId}
                onClick={() => {
                  if (row.selectorTarget) onSelectContact(row.selectorTarget);
                }}
                className={`p-3 transition-all cursor-pointer flex items-center gap-2.5 border-l-4 ${
                  isRowSelected
                    ? 'bg-blue-100/70 border-l-blue-700'
                    : isThreadUnread
                    ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600'
                    : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                }`}
              >
                {/* Checkbox + Unread indicator */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelectRow(evtId);
                  }}
                  className="flex items-center gap-1.5 shrink-0"
                >
                  <input
                    type="checkbox"
                    checked={isRowSelected}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  {isThreadUnread ? (
                    <span
                      className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                      title="Unread activity in thread"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                  )}
                </div>

                {/* Contact Initial Avatar */}
                <div
                  className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                    isEmailOnly
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {row.contactName ? row.contactName.charAt(0).toUpperCase() : '#'}
                </div>

                {/* Thread Identity, Multi-Channel Badges & Latest Snippet */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span
                        className={`text-xs truncate ${
                          isThreadUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'
                        }`}
                      >
                        {row.contactName}
                      </span>
                      {row.isVip && (
                        <span className="text-[8.5px] px-1 py-0.1 rounded bg-amber-100 text-amber-800 font-black uppercase shrink-0">
                          VIP
                        </span>
                      )}
                      {row.isBlacklisted && (
                        <span className="text-[8.5px] px-1 py-0.1 rounded bg-rose-100 text-rose-800 font-black uppercase shrink-0">
                          Blocked
                        </span>
                      )}
                      {row.unreadCountTotal > 0 && (
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-black shrink-0">
                          {row.unreadCountTotal}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                      {row.latestEvent.timestamp}
                    </span>
                  </div>

                  {/* Contact Phone / Email & Multi-Channel Activity Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(row.displayPhone || row.primaryEmail) && (
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[165px]">
                        {row.displayPhone && row.primaryEmail
                          ? `${row.displayPhone} · ${row.primaryEmail}`
                          : row.displayPhone || row.primaryEmail}
                      </span>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {row.channels.map((ch) => {
                        const cfg = COMMS_CHANNEL_BADGE_CONFIG[ch];
                        return (
                          <span
                            key={ch}
                            className={`text-[8.5px] font-extrabold px-1.5 py-0.1 rounded border ${CHANNEL_PILL_CLASSES[ch]}`}
                          >
                            {cfg.shortLabel}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <p
                    className={`text-xs line-clamp-1 ${
                      isThreadUnread ? 'text-slate-900 font-medium' : 'text-slate-500'
                    }`}
                  >
                    {row.latestEvent.snippet}
                  </p>
                </div>

                {/* Quick 1-Click Call or Email Dock */}
                {row.primaryPhone ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartCall(row.primaryPhone, row.contactName);
                    }}
                    title={`Call ${row.contactName}`}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                  </button>
                ) : onOpenEmailInDock ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEmailInDock(row.latestEvent);
                    }}
                    title={`Open ${row.primaryEmail || row.contactName} in Email Dock`}
                    className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <MailIcon className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface NewSmsMessageModalProps {
  isOpen: boolean;
  newMsgError: string | null;
  msgContactSearch: string;
  newMsgRecipientPhone: string;
  newMsgRecipientName: string;
  newMsgBody: string;
  isSendingNewMsg: boolean;
  isMsgContactDropdownOpen: boolean;
  filteredContactsForMsg: ContactRecord[];
  recipientCrmContext?: CommsCrmContextSummary | null;
  onInsertTrackingLink?: () => void;
  onInsertPayLink?: () => void;
  isGeneratingPayLink?: boolean;
  onRecipientInputChange: (val: string) => void;
  onRecipientInputFocus: () => void;
  onSelectContactOption: (contact: ContactRecord) => void;
  onBodyChange: (val: string) => void;
  onSelectPresetChip: (preset: string) => void;
  onOpenThread: () => void;
  onSend: () => void;
  onClose: () => void;
  sheetDrag?: CommsSheetDragProps;
}

export function NewSmsMessageModal({
  isOpen,
  newMsgError,
  msgContactSearch,
  newMsgRecipientPhone,
  newMsgRecipientName,
  newMsgBody,
  isSendingNewMsg,
  isMsgContactDropdownOpen,
  filteredContactsForMsg,
  recipientCrmContext,
  onInsertTrackingLink,
  onInsertPayLink,
  isGeneratingPayLink = false,
  onRecipientInputChange,
  onRecipientInputFocus,
  onSelectContactOption,
  onBodyChange,
  onSelectPresetChip,
  onOpenThread,
  onSend,
  onClose,
}: NewSmsMessageModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [appSettings, setAppSettings] = useState<Partial<AppSettings> | null>(null);

  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings((s) => {
      setAppSettings(s);
    });
    return () => unsub();
  }, []);

  const dynamicChips = React.useMemo(
    () => buildInterpolatedCommsSmsChips(recipientCrmContext?.templateContext, appSettings),
    [recipientCrmContext?.templateContext, appSettings]
  );

  if (!isOpen) return null;

  const hasMatchedTrip = Boolean(recipientCrmContext?.primaryMatchedTrip);
  const recipientPreview =
    newMsgRecipientName ||
    (newMsgRecipientPhone ? formatDisplayPhone(newMsgRecipientPhone) : '');

  return (
    <FloatingWindow
      id="comms_new_sms"
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={false}
      title="New Text Message"
      subtitle={recipientPreview ? `To: ${recipientPreview}` : 'SMS Dispatch'}
      icon={<ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 480, height: 420 }}
      autoHeight
      minWidth={350}
      minHeight={280}
      zIndex={225}
      footer={
        <div className="px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onOpenThread}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-blue-700 cursor-pointer transition-colors"
            >
              Open Thread
            </button>
            <span className="hidden sm:inline text-[10px] text-slate-400">
              Ctrl/Cmd + Enter to send
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={isSendingNewMsg || !newMsgBody.trim()}
              onClick={onSend}
              className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white text-xs font-extrabold shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isSendingNewMsg && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSendingNewMsg ? 'Sending...' : 'Send SMS'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="p-3 space-y-2.5">
        {newMsgError && (
          <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {newMsgError}
          </div>
        )}

        <div className="relative">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 w-10 shrink-0">To:</span>
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={msgContactSearch || newMsgRecipientPhone}
                onChange={(e) => onRecipientInputChange(e.target.value)}
                onFocus={onRecipientInputFocus}
                placeholder="Name or 10-digit mobile number..."
                className="w-full text-xs px-2.5 py-1.5 pr-24 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              {newMsgRecipientName && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md pointer-events-none max-w-[96px] truncate">
                  {newMsgRecipientName}
                </span>
              )}

              {isMsgContactDropdownOpen && filteredContactsForMsg.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                  {filteredContactsForMsg.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelectContactOption(c);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-blue-50/70 flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{c.name}</span>
                        <span className="text-[11px] font-mono text-slate-500 block truncate">
                          {formatDisplayPhone(c.mobilePhone || c.phone)}
                          {c.corporateAccountName ? ` • ${c.corporateAccountName}` : ''}
                        </span>
                      </div>
                      {(c.corporateAccountNumber || (c as any).accountNumber) && (
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded shrink-0">
                          {c.corporateAccountNumber || (c as any).accountNumber}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap bg-white p-1.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-1 min-w-[155px] flex-1 sm:flex-none">
            <SparklesIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <Select
              size="xs"
              value={selectedTemplateId}
              onChange={(e) => {
                const chosenId = e.target.value;
                setSelectedTemplateId(chosenId);
                const matched = dynamicChips.find((c) => c.id === chosenId);
                if (matched) {
                  onSelectPresetChip(matched.text);
                  setSelectedTemplateId('');
                }
              }}
              aria-label="Insert canned dispatch SMS template"
            >
              <option value="">+ Canned SMS Template...</option>
              {dynamicChips.map((chip) => (
                <option key={chip.id} value={chip.id}>
                  {chip.shortLabel}
                </option>
              ))}
            </Select>
          </div>

          {hasMatchedTrip && onInsertTrackingLink && (
            <button
              type="button"
              onClick={onInsertTrackingLink}
              className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[11px] font-bold text-blue-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
              title="1-Tap Insert Live Chauffeur Tracking Link (/track/...)"
            >
              <LinkIcon className="w-3 h-3 shrink-0" />
              <span>Tracking Link</span>
            </button>
          )}

          {hasMatchedTrip && onInsertPayLink && (
            <button
              type="button"
              disabled={isGeneratingPayLink}
              onClick={onInsertPayLink}
              className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold text-emerald-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
              title="1-Tap Insert Tokenized Stripe Payment Link (/pay/...)"
            >
              {isGeneratingPayLink ? (
                <SpinnerIcon className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <CreditCardIcon className="w-3 h-3 shrink-0" />
              )}
              <span>Pay Link</span>
            </button>
          )}

          <span className="ml-auto text-[10px] text-slate-400 font-mono shrink-0">
            {newMsgBody.length} chars
          </span>
        </div>

        <textarea
          rows={4}
          value={newMsgBody}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Write text message or choose a Canned SMS Template above... (Ctrl/Cmd + Enter to send)"
          className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
        />
      </div>
    </FloatingWindow>
  );
}

export interface MobileComposeSmsFabProps {
  isVisible: boolean;
  onOpenCompose: () => void;
}

export function MobileComposeSmsFab({ isVisible, onOpenCompose }: MobileComposeSmsFabProps) {
  if (!isVisible) return null;
  return (
    <button
      type="button"
      onClick={onOpenCompose}
      className="absolute bottom-4 right-4 z-20 w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition-all cursor-pointer"
      title="Compose New Text Message"
      aria-label="Compose New Text Message"
    >
      <PlusIcon className="w-5 h-5" />
    </button>
  );
}
