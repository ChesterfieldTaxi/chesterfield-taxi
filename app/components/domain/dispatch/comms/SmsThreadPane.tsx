import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveCommsEmailDeliveryBadge, resolveTripFlightBadge, toggleCommsMultiFilter, type CommsConversationRowSummary, type CommsCrmContextSummary } from '../../../../core/services/comms/comms-templates.service';
import { getCommsThreadService } from '../../../../core/services/comms/comms-thread.service';
import { getContactService, type ContactRecord } from '../../../../core/services/customer/contact.service';
import { normalizePhone } from '../../../../core/services/passenger.service';
import { getWorkspaceBus, type WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import { AlertTriangleIcon, CheckIcon, ChevronDownIcon, ExternalLinkIcon, MailIcon, MailOpenIcon, MicIcon, PauseIcon, PencilIcon, PhoneIcon, PlayIcon, RefreshCwIcon, SpinnerIcon, UserIcon } from '../../../ui/Icons';
import { DispatchStatusBadge } from '../queue/DispatchStatusBadge';
import { CommsComposerBar } from './CommsComposerBar';
import { CommsChannelDirectionIcon, CommsContactAvatar, CommsTimestampWithHoverReadToggle } from './CommsContactAvatar';
import { buildOmnichannelTimelineItems, buildReturnTripDraftPayload, cleanCommsEmailSnippet, formatShortRouteEndpoint, formatShortTripId, formatTripTimelineDateTime, hasPlayableCallAudio, resolveTripCabBadgeLabel } from './comms-timeline.util';
import { formatMessageTimestamp, type InteractionEvent, type PlaybackSpeed, type ThreadTab, type ThreadTimelineType } from './comms-types';
import { useLongPressSelection } from './useLongPressSelection';

export { NewSmsMessageModal, type NewSmsMessageModalProps } from './CommsModals';

export const THREAD_TIMELINE_FILTER_OPTS: ReadonlyArray<{ value: ThreadTimelineType; label: string }> = [
  { value: 'sms', label: 'Messages' }, { value: 'calls', label: 'Calls' }, { value: 'emails', label: 'Email' }, { value: 'trips', label: 'Trips' }, { value: 'notes', label: 'Notes' },
];

export interface SmsThreadPaneProps {
  mode: 'thread' | 'list'; activeContactSummary?: InteractionEvent | null; activeContactRecord?: ContactRecord | null; threadCrmContext?: CommsCrmContextSummary | null;
  trips?: Trip[]; drivers?: any[]; nowMs?: number; voiceOnlyMode?: boolean; onBackFromThread: () => void; onOpenContactEdit: () => void; onOpenClientProfile?: () => void;
  onBookContactRide: () => void; onOpenContactEmailInDock?: () => void; onMarkThreadUnread?: () => void; onOpenTripById?: (tripId: string) => void;
  onOpenTripDetails?: (tripId: string) => void; onFocusTripOnMap?: (tripId: string) => void; onRebookLastRide?: (payload: WorkspaceEventMap['POPULATE_BOOKING']) => void;
  threadTab: ThreadTab; onChangeThreadTab: (tab: ThreadTab) => void; timelineFilters?: ReadonlyArray<ThreadTimelineType>; onChangeTimelineFilters?: (next: ThreadTimelineType[]) => void;
  selectedInteractions: InteractionEvent[]; messagesEndRef?: React.RefObject<HTMLDivElement | null>; playingCallId: string | null; onTogglePlayCall: (id: string) => void;
  playingVoicemailId: string | null; onTogglePlayVoicemail: (id: string) => void; playbackSpeed: PlaybackSpeed; onCyclePlaybackSpeed: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void; onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  onOpenEmailInDock?: (evt: InteractionEvent) => void; onRetrySms?: (evt: InteractionEvent) => void; retryingSmsId?: string | null;
  onInsertTrackingLink?: () => void; onInsertPayLink?: () => void; isGeneratingPayLink?: boolean; noteDraftText?: string; onChangeNoteDraftText?: (val: string) => void; onAddInternalNote?: () => void;
  smsReplyText: string; onChangeSmsReplyText: (val: string) => void; isSendingSms: boolean; onSendSms: () => void; smsStatusMessage: string | null;
  conversationRows?: CommsConversationRowSummary[]; messageConversations?: InteractionEvent[]; threadUnreadCountMap?: Map<string, number>;
  onSelectContact: (selectorTarget: string, focusEventId?: string) => void; onOpenFreshNewMessageModal: () => void;
  highlightedEvent?: { eventId: string; nonce: number } | null;
  selectedRowKeys?: ReadonlySet<string>; onToggleSelectRow?: (threadId: string) => void;
  onToggleRowReadStatus?: (threadId: string, currentlyUnread: boolean) => void;
}

function renderTripBadges(trip: Trip, drivers?: any[]) {
  const cab = resolveTripCabBadgeLabel(trip, drivers);
  const fb = resolveTripFlightBadge(trip);
  const cabCls = cab.tone === 'assigned' ? 'bg-surface-header-elevated text-white' : cab.tone === 'staged' ? 'bg-status-staged-bg-strong text-status-staged-fg border border-status-staged-border' : 'bg-surface-muted text-fg-secondary border border-border-subtle';
  const flCls = fb.tone === 'amber' ? 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border' : fb.tone === 'rose' ? 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border' : fb.tone === 'emerald' ? 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' : 'bg-status-info-bg text-status-info-fg border-status-info-border';
  return (
    <>
      <span data-trip-cab-badge={cab.tone} className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold shrink-0 ${cabCls}`}>{cab.label}</span>
      {fb.hasFlight && <span data-trip-flight-badge={fb.tone} className={`px-1.5 py-0.5 rounded border text-[9.5px] font-bold shrink-0 ${flCls}`}>✈ {fb.label}</span>}
    </>
  );
}

export function SmsThreadPane({
  mode, activeContactSummary, activeContactRecord, threadCrmContext, trips = [], drivers = [], nowMs, voiceOnlyMode, onBackFromThread, onOpenContactEdit, onOpenClientProfile,
  onBookContactRide, onOpenContactEmailInDock, onMarkThreadUnread, onOpenTripById, onOpenTripDetails, onFocusTripOnMap, onRebookLastRide, threadTab, onChangeThreadTab,
  timelineFilters, onChangeTimelineFilters, selectedInteractions, messagesEndRef, playingCallId, onTogglePlayCall, playingVoicemailId, onTogglePlayVoicemail, playbackSpeed,
  onCyclePlaybackSpeed, onStartCall, onConvertVoicemailToBooking, onOpenEmailInDock, onRetrySms, retryingSmsId, onInsertTrackingLink, onInsertPayLink, isGeneratingPayLink = false,
  noteDraftText = '', onChangeNoteDraftText, onAddInternalNote, smsReplyText, onChangeSmsReplyText, isSendingSms, onSendSms, smsStatusMessage, conversationRows,
  messageConversations = [], threadUnreadCountMap, onSelectContact, onOpenFreshNewMessageModal, highlightedEvent,
  selectedRowKeys, onToggleSelectRow, onToggleRowReadStatus,
}: SmsThreadPaneProps) {
  const [expandedVoicemailIds, setExpandedVoicemailIds] = useState<Set<string>>(() => new Set());
  const toggleVoicemailExpanded = useCallback((id: string) => {
    setExpandedVoicemailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (mode !== 'thread' || !highlightedEvent?.eventId) return;
    const container = timelineContainerRef.current;
    if (!container) return;
    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(highlightedEvent.eventId) : highlightedEvent.eventId;
    const target = container.querySelector(`[data-timeline-event-id="${escapedId}"]`) as HTMLElement | null;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [mode, highlightedEvent?.eventId, highlightedEvent?.nonce]);
  const isSelectionMode = Boolean(selectedRowKeys && selectedRowKeys.size > 0);
  const { getRowGestureProps } = useLongPressSelection({
    isSelectionMode,
    onToggleSelect: (key) => onToggleSelectRow?.(key),
  });
  const effectivePhone = activeContactSummary?.mobilePhone || threadCrmContext?.primaryPhone || (activeContactSummary?.contactPhone && !activeContactSummary.contactPhone.includes('@') && !activeContactSummary.contactPhone.startsWith('thr_') ? activeContactSummary.contactPhone : '');
  const effectiveEmail = threadCrmContext?.primaryEmail || activeContactRecord?.email || activeContactSummary?.contactEmail || (activeContactSummary?.contactPhone?.includes('@') ? activeContactSummary.contactPhone : '');

  const [localFilters, setLocalFilters] = useState<ThreadTimelineType[]>([]);
  const activeFilters = timelineFilters ?? localFilters;
  const updateFilters = (next: ThreadTimelineType[]) => { setLocalFilters(next); onChangeTimelineFilters?.(next); if (next.length === 0) onChangeThreadTab('all'); };

  const [isQuickNaming, setIsQuickNaming] = useState(false);
  const [quickNameDraft, setQuickNameDraft] = useState('');
  useEffect(() => { setIsQuickNaming(false); }, [effectivePhone, effectiveEmail]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const calcMenuCoords = useCallback(() => {
    if (!filterBtnRef.current || typeof window === 'undefined') return null;
    const rect = filterBtnRef.current.getBoundingClientRect();
    return { top: Math.min(window.innerHeight - 280, rect.bottom + 4), left: Math.max(8, Math.min(window.innerWidth - 220, rect.right - 212)) };
  }, []);

  useEffect(() => {
    if (!isFilterOpen) return setMenuCoords(null);
    setMenuCoords(calcMenuCoords());
    const onOut = (e: MouseEvent) => { if (!filterBtnRef.current?.contains(e.target as Node) && !filterMenuRef.current?.contains(e.target as Node)) setIsFilterOpen(false); };
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [isFilterOpen, calcMenuCoords]);

  const timeline = useMemo(() => buildOmnichannelTimelineItems({
    events: selectedInteractions, trips, contactPhone: effectivePhone, contactEmail: effectiveEmail, contactId: activeContactRecord?.id, threadTab, timelineFilters: activeFilters, nowMs,
  }), [selectedInteractions, trips, effectivePhone, effectiveEmail, activeContactRecord?.id, threadTab, activeFilters, nowMs]);

  const openTripDetails = (tripId: string) => { if (!tripId) return; getWorkspaceBus().publish('OPEN_TRIP_DETAILS', { tripId, initialTab: 'details' }); onOpenTripDetails?.(tripId); };

  if (mode === 'thread' && activeContactSummary) {
    const displayName = threadCrmContext?.contactName && threadCrmContext.contactName !== 'Unknown Caller' ? threadCrmContext.contactName : activeContactRecord?.name || activeContactSummary.contactName;
    const isUnsavedCaller = !threadCrmContext?.isKnownContact && (!activeContactRecord?.id || String(activeContactRecord.id).startsWith('temp_'));
    const isBlocked = Boolean(threadCrmContext?.isBlacklisted || activeContactRecord?.isBlacklisted);
    const isVip = Boolean(threadCrmContext?.isVip || activeContactRecord?.isVip);
    const isDriver = Boolean(threadCrmContext?.isDriver || activeContactSummary.contactType === 'driver');
    const isCorp = Boolean(threadCrmContext?.corporateAccountName || activeContactRecord?.corporateAccountName);
    const pinned = timeline.pinnedUpcomingTrip;
    const filterCount = activeFilters.length || (threadTab !== 'all' ? 1 : 0);

    const saveQuickCallerName = () => {
      const clean = quickNameDraft.trim();
      if (!clean) return setIsQuickNaming(false);
      const saved = getContactService().upsertContact({ id: activeContactRecord?.id && !String(activeContactRecord.id).startsWith('temp_') ? activeContactRecord.id : undefined, name: clean, phone: effectivePhone || activeContactRecord?.phone || '', email: effectiveEmail || activeContactRecord?.email || undefined });
      void getCommsThreadService().mergeThreadsForContact(saved);
      setIsQuickNaming(false);
    };
    const triggerProfileOverview = () => onOpenClientProfile ? onOpenClientProfile() : getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', { phone: effectivePhone || undefined, email: effectiveEmail || undefined, name: displayName || undefined, source: 'comms_hub' });

    return (
      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden bg-surface-card">
        <div data-comms-thread-header="v2" className="h-10 px-2 border-b border-border-subtle bg-surface-card flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <button type="button" onClick={onBackFromThread} title="Back to list (Esc)" className="h-7 px-1.5 rounded-md hover:bg-surface-muted text-xs font-bold text-fg-secondary cursor-pointer shrink-0">←</button>
            {isQuickNaming ? (
              <div className="flex items-center gap-1 min-w-0">
                <input type="text" autoFocus data-quick-name-input="true" value={quickNameDraft} onChange={(e) => setQuickNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveQuickCallerName(); } else if (e.key === 'Escape') setIsQuickNaming(false); }} placeholder="Caller name..." className="h-6 w-28 px-2 text-xs rounded border border-blue-400 bg-surface-card text-fg-primary focus:outline-none" />
                <button type="button" onClick={saveQuickCallerName} className="h-6 px-1.5 rounded bg-blue-600 text-white text-[10px] font-bold cursor-pointer"><CheckIcon className="w-3 h-3" /></button>
              </div>
            ) : (
              <>
                <button type="button" onClick={onOpenContactEdit} className="min-w-0 text-left flex items-center gap-1 hover:text-status-info-fg cursor-pointer">
                  <span className="text-xs font-extrabold text-fg-primary truncate max-w-[115px]">{displayName}</span>
                  {effectivePhone && <span className="text-[10.5px] font-mono text-fg-muted hidden @[370px]/commshub:inline shrink-0">{formatDisplayPhone(effectivePhone)}</span>}
                </button>
                <button type="button" data-quick-name-trigger="true" title="Quick-save caller name" onClick={() => { setQuickNameDraft(isUnsavedCaller && (displayName.startsWith('(') || displayName.startsWith('+') || displayName === 'Unknown Caller') ? '' : displayName); setIsQuickNaming(true); }} className="p-1 rounded hover:bg-surface-muted text-fg-subtle hover:text-blue-600 cursor-pointer shrink-0"><PencilIcon className="w-3 h-3" /></button>
              </>
            )}
            {isBlocked ? <span className="px-1.5 py-0.5 rounded bg-status-danger-bg-strong text-status-danger-fg text-[9px] font-black uppercase shrink-0">Blocked</span>
              : isVip ? <span className="px-1.5 py-0.5 rounded bg-status-warning-bg-strong text-status-warning-fg text-[9px] font-black uppercase shrink-0">VIP</span>
              : isDriver ? <span className="px-1.5 py-0.5 rounded bg-status-success-bg-strong text-status-success-fg text-[9px] font-bold shrink-0">Driver</span>
              : isCorp ? <span className="px-1.5 py-0.5 rounded bg-status-staged-bg-strong text-status-staged-fg text-[9px] font-bold shrink-0">Corp</span> : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" disabled={!effectivePhone} onClick={() => effectivePhone && onStartCall(effectivePhone, displayName)} className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"><PhoneIcon className="w-3 h-3" /><span>Call</span></button>
            <button type="button" onClick={onBookContactRide} className="h-7 px-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer">Book</button>
            <button type="button" onClick={triggerProfileOverview} title="Profile" className="h-7 px-2 rounded-md border border-border-subtle bg-surface-card hover:bg-surface-subtle text-fg-secondary text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"><UserIcon className="w-3 h-3 text-indigo-600" /><span className="hidden @[390px]/commshub:inline">Profile</span></button>
            <button ref={filterBtnRef} type="button" onClick={() => setIsFilterOpen((v) => !v)} className={`h-7 px-1.5 rounded-md border text-[11px] font-bold inline-flex items-center gap-0.5 cursor-pointer ${filterCount > 0 ? 'bg-status-info-bg border-status-info-border text-status-info-fg' : 'bg-surface-card border-border-subtle text-fg-secondary hover:bg-surface-subtle'}`}>
              <span>Filter</span>{filterCount > 0 && <span className="px-1 rounded-full bg-blue-600 text-white text-[9px] font-black">{filterCount}</span>}<ChevronDownIcon className="w-3 h-3" />
            </button>
          </div>
        </div>

        {pinned && (
          <div data-pinned-upcoming-trip={pinned.id} className="px-2.5 py-1 bg-status-info-bg/90 border-b border-status-info-border/80 flex items-center justify-between gap-2 text-[11px] shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
              <button type="button" data-open-trip-details={pinned.id} onClick={() => openTripDetails(pinned.id)} className="font-mono font-extrabold text-status-info-fg hover:underline cursor-pointer shrink-0">{formatShortTripId(pinned.id)}</button>
              <span className="text-fg-secondary font-semibold shrink-0">{formatTripTimelineDateTime(pinned)}</span>
              {renderTripBadges(pinned, drivers)}
              <span className="text-fg-secondary truncate">{formatShortRouteEndpoint(pinned.pickupLocation?.address)} → {formatShortRouteEndpoint(pinned.dropoffLocation?.address)}</span>
              <DispatchStatusBadge status={pinned.status} compact={true} trip={pinned} nowMs={nowMs} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => onOpenTripById?.(pinned.id)} className="px-1.5 py-0.5 rounded bg-surface-card hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg text-[10px] font-bold cursor-pointer">Edit</button>
              <button type="button" onClick={() => { getWorkspaceBus().publish('FOCUS_TRIP_ON_MAP', { tripId: pinned.id }); onFocusTripOnMap?.(pinned.id); }} className="px-1.5 py-0.5 rounded bg-surface-card hover:bg-status-success-bg border border-border-subtle text-status-success-fg text-[10px] font-bold cursor-pointer">Map</button>
            </div>
          </div>
        )}

        <div ref={timelineContainerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-surface-subtle/30">
          {timeline.items.map((item) => {
            if (item.kind === 'trip') {
              const tr = item.trip;
              const fare = (tr.pricing?.totalFare ?? tr.payment?.amount ?? 0).toFixed(2);
              return (
                <div key={`trip_${tr.id}`} data-timeline-trip-card={tr.id} className="w-full rounded-xl border border-border-subtle bg-surface-card px-3 py-2 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <button type="button" data-open-trip-details={tr.id} onClick={() => openTripDetails(tr.id)} className="font-mono font-extrabold text-status-info-fg hover:underline cursor-pointer">{formatShortTripId(tr.id)}</button>
                      <span className="text-fg-muted">{formatTripTimelineDateTime(tr)}</span>
                      <span className="font-bold text-fg-primary">${fare}</span>
                      {renderTripBadges(tr, drivers)}
                    </div>
                    <DispatchStatusBadge status={tr.status} compact={false} trip={tr} nowMs={nowMs} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-fg-secondary truncate">{formatShortRouteEndpoint(tr.pickupLocation?.address)} → {formatShortRouteEndpoint(tr.dropoffLocation?.address)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => onOpenTripById?.(tr.id)} className="px-2 py-0.5 rounded-md bg-surface-muted hover:bg-surface-emphasis text-fg-secondary text-[10.5px] font-bold cursor-pointer">Edit</button>
                      <button type="button" onClick={() => { const p = buildReturnTripDraftPayload(tr, nowMs); getWorkspaceBus().publish('POPULATE_BOOKING', p); onRebookLastRide?.(p); }} className="px-2 py-0.5 rounded-md bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg text-[10.5px] font-bold cursor-pointer">⇄ Return</button>
                    </div>
                  </div>
                </div>
              );
            }
            const evt = item.event;
            const playable = hasPlayableCallAudio(evt);
            const isHighlighted = highlightedEvent?.eventId === evt.id;
            const glowCls = isHighlighted ? 'ring-2 ring-status-warning-border shadow-[0_0_16px_rgba(251,191,36,0.45)] transition-all duration-500' : '';
            if (evt.type.startsWith('call_')) {
              const callLabel = evt.type === 'call_inbound' ? 'Inbound Call' : evt.type === 'call_outbound' ? 'Outbound Call' : 'Missed Call';
              const dur = evt.audioDuration || (evt.durationSeconds ? `${Math.floor(evt.durationSeconds / 60)}:${String(evt.durationSeconds % 60).padStart(2, '0')}` : '0:00');
              return (
                <div key={evt.id} data-call-row={evt.id} data-timeline-event-id={evt.id} data-timeline-highlighted={isHighlighted ? 'true' : undefined} className={`min-h-[36px] px-2.5 py-1 rounded-xl border border-border-subtle bg-surface-card flex items-center justify-between gap-2 text-[11px] ${glowCls}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PhoneIcon className={`w-3.5 h-3.5 shrink-0 ${evt.type === 'call_missed' ? 'text-rose-600' : 'text-emerald-600'}`} />
                    <span className="font-bold text-fg-strong truncate">{callLabel}</span>
                    <span className="text-fg-subtle font-mono shrink-0">{formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span>
                    <span className="text-fg-muted font-mono shrink-0">· {dur}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {playable && (
                      <div data-call-audio-player="true" className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => onTogglePlayCall(evt.id)} className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center cursor-pointer">{playingCallId === evt.id ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}</button>
                        <button type="button" onClick={onCyclePlaybackSpeed} className="px-1 py-0.5 rounded bg-status-success-bg border border-status-success-border text-status-success-fg text-[9.5px] font-bold cursor-pointer">{playbackSpeed}x</button>
                      </div>
                    )}
                    {evt.contactPhone && <button type="button" onClick={() => onStartCall(evt.contactPhone, evt.contactName)} className="px-2 py-0.5 rounded-md bg-status-success-bg hover:bg-status-success-bg-strong text-status-success-fg font-bold text-[10.5px] cursor-pointer">Call</button>}
                  </div>
                </div>
              );
            }
            if (evt.type === 'voicemail') {
              const isVmExpanded = expandedVoicemailIds.has(evt.id);
              return (
                <div key={evt.id} data-timeline-event-id={evt.id} data-timeline-highlighted={isHighlighted ? 'true' : undefined} className={`rounded-xl border border-status-warning-border bg-status-warning-bg/70 p-2.5 space-y-1.5 text-xs ${glowCls}`}>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold text-status-warning-fg inline-flex items-center gap-1"><MicIcon className="w-3 h-3" />Voicemail · {formatMessageTimestamp(evt.timestampMs, evt.timestamp)} · {evt.audioDuration || '0:30'}</span>
                    <div className="flex items-center gap-1">
                      {evt.transcription && (
                        <button
                          type="button"
                          data-voicemail-expand-toggle={evt.id}
                          aria-expanded={isVmExpanded}
                          aria-label={isVmExpanded ? 'Collapse transcription' : 'Expand transcription'}
                          onClick={() => toggleVoicemailExpanded(evt.id)}
                          className="p-0.5 rounded hover:bg-status-warning-bg-strong/60 text-status-warning-fg cursor-pointer"
                        >
                          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isVmExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {playable && <button type="button" onClick={() => onTogglePlayVoicemail(evt.id)} className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center cursor-pointer">{playingVoicemailId === evt.id ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}</button>}
                      <button type="button" onClick={() => onConvertVoicemailToBooking(evt.suggestedBooking)} className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10.5px] font-bold cursor-pointer">Book</button>
                    </div>
                  </div>
                  {evt.transcription && (
                    <p className={`text-[11px] text-fg-secondary italic ${isVmExpanded ? 'whitespace-pre-wrap leading-relaxed' : 'line-clamp-2'}`}>
                      &ldquo;{evt.transcription}&rdquo;
                    </p>
                  )}
                </div>
              );
            }
            if (evt.type.startsWith('email_')) {
              const badge = resolveCommsEmailDeliveryBadge(evt.deliveryStatus, evt.type === 'email_outbound' ? 'outbound' : 'inbound');
              return (
                <div key={evt.id} data-email-card={evt.id} data-timeline-event-id={evt.id} data-timeline-highlighted={isHighlighted ? 'true' : undefined} className={`rounded-xl border border-status-staged-border/80 bg-surface-card p-2.5 space-y-1 text-xs ${glowCls}`}>
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-extrabold text-status-staged-fg inline-flex items-center gap-1 truncate"><MailIcon className="w-3 h-3 text-indigo-600 shrink-0" />{evt.subject || (evt.type === 'email_outbound' ? 'Sent Email' : 'Inbound Email')}</span>
                      {evt.tripId && <button type="button" data-open-trip-details={evt.tripId} onClick={() => openTripDetails(evt.tripId!)} className="font-mono font-extrabold text-status-info-fg hover:underline cursor-pointer shrink-0">{formatShortTripId(evt.tripId)}</button>}
                    </div>
                    <span className="text-fg-subtle font-mono shrink-0">{badge.label} · {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span>
                  </div>
                  <p className="text-fg-secondary line-clamp-2 leading-snug">{cleanCommsEmailSnippet(evt.bodyText || evt.snippet)}</p>
                  <div className="flex justify-end"><button type="button" onClick={() => onOpenEmailInDock?.(evt)} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-status-staged-fg hover:underline cursor-pointer">Open in Email ↗</button></div>
                </div>
              );
            }
            if (evt.type === 'internal_note') {
              return (
                <div key={evt.id} data-timeline-event-id={evt.id} data-timeline-highlighted={isHighlighted ? 'true' : undefined} className={`rounded-xl border border-status-warning-border bg-status-warning-bg/80 px-3 py-2 text-xs ${glowCls}`}>
                  <div className="flex items-center justify-between text-[10px] font-bold text-status-warning-fg"><span>Note · {evt.actorName || 'Dispatcher'}</span><span className="font-mono">{formatMessageTimestamp(evt.timestampMs, evt.timestamp)}</span></div>
                  <p className="text-fg-strong mt-0.5 whitespace-pre-wrap">{evt.bodyText || evt.snippet}</p>
                </div>
              );
            }
            const isOut = evt.type === 'sms_outbound';
            const isFailed = isOut && (evt.deliveryStatus === 'failed' || evt.deliveryStatus === 'undelivered');
            return (
              <div key={evt.id} className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
                <div data-timeline-event-id={evt.id} data-timeline-highlighted={isHighlighted ? 'true' : undefined} className={`max-w-[84%] rounded-2xl px-3 py-2 text-xs shadow-2xs ${isOut ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-surface-card border border-border-subtle text-fg-strong rounded-tl-sm'} ${glowCls}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{evt.bodyText || evt.snippet}</p>
                  <div className={`flex items-center justify-end gap-1.5 mt-1 text-[9.5px] ${isOut ? 'text-blue-200' : 'text-fg-subtle'}`}>
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
          {timeline.items.length === 0 && <div className="py-10 text-center text-xs text-fg-subtle">No items in this view yet.</div>}
          <div ref={messagesEndRef} />
        </div>

        <CommsComposerBar effectivePhone={effectivePhone} voiceOnlyMode={voiceOnlyMode} templateContext={threadCrmContext?.templateContext} hasMatchedTrip={Boolean(threadCrmContext?.primaryMatchedTrip || pinned)} smsReplyText={smsReplyText} onChangeSmsReplyText={onChangeSmsReplyText} onSendSms={onSendSms} isSendingSms={isSendingSms} noteDraftText={noteDraftText} onChangeNoteDraftText={onChangeNoteDraftText || (() => {})} onAddInternalNote={onAddInternalNote || (() => {})} onInsertTrackingLink={onInsertTrackingLink} onInsertPayLink={onInsertPayLink} isGeneratingPayLink={isGeneratingPayLink} smsStatusMessage={smsStatusMessage} />

        {isFilterOpen && menuCoords !== null && typeof document !== 'undefined' && createPortal(
          <div ref={filterMenuRef} style={{ position: 'fixed', top: `${menuCoords.top}px`, left: `${menuCoords.left}px`, width: '212px' }} className="z-[260] bg-surface-card rounded-xl shadow-xl ring-1 ring-slate-900/5 py-1 text-xs divide-y divide-border-faint select-none">
            <div>
              <div className="px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/60">
                <span>Timeline Types</span>
                <div className="flex items-center gap-1.5 normal-case tracking-normal">
                  <button type="button" onClick={() => updateFilters(THREAD_TIMELINE_FILTER_OPTS.map((o) => o.value))} className="text-[10px] font-bold text-fg-secondary hover:text-status-info-fg cursor-pointer">All</button>
                  <span className="text-slate-300">·</span>
                  <button type="button" disabled={activeFilters.length === 0 && threadTab === 'all'} onClick={() => updateFilters([])} className="text-[10px] font-bold text-blue-600 hover:text-status-info-fg disabled:opacity-40 cursor-pointer">Clear</button>
                </div>
              </div>
              <div className="py-0.5">
                {THREAD_TIMELINE_FILTER_OPTS.map((opt) => {
                  const checked = activeFilters.includes(opt.value);
                  return (
                    <button key={opt.value} type="button" onClick={() => updateFilters(toggleCommsMultiFilter(activeFilters, opt.value))} className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors cursor-pointer ${checked ? 'bg-status-info-bg/80 text-status-info-fg font-bold hover:bg-status-info-bg-strong/70' : 'text-fg-secondary font-semibold hover:bg-status-info-bg/80 hover:text-status-info-fg'}`}>
                      <span aria-hidden="true" className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-surface-card border-border-strong'}`}>{checked && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="py-0.5">
              {onOpenContactEmailInDock && <button type="button" onClick={() => { onOpenContactEmailInDock(); setIsFilterOpen(false); }} className="w-full px-3 py-1.5 text-left font-semibold text-status-staged-fg hover:bg-status-staged-bg flex items-center gap-1.5 cursor-pointer"><ExternalLinkIcon className="w-3 h-3" /><span>Open in Email Dock</span></button>}
              {onMarkThreadUnread && <button type="button" onClick={() => { onMarkThreadUnread(); setIsFilterOpen(false); }} className="w-full px-3 py-1.5 text-left font-semibold text-fg-secondary hover:bg-surface-subtle cursor-pointer">Mark Unread</button>}
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
    return { threadId: sms.threadId || `thr_${norm || sms.id}`, selectorTarget: sms.contactPhone || sms.contactEmail || sms.threadId || '', latestEvent: sms, contactName: sms.contactName, contactType: sms.contactType, primaryPhone: sms.contactPhone || undefined, displayPhone: sms.contactPhone ? formatDisplayPhone(sms.contactPhone) : undefined, primaryEmail: sms.contactEmail, isVip: false, isBlacklisted: false, channels: ['sms'], channelCounts: { sms: 1, call: 0, voicemail: 0, email: 0, note: 0 }, unreadCountTotal: unread, unreadByChannel: { sms: unread, call: 0, voicemail: 0, email: 0 } };
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border-faint bg-surface-card">
      {rows.length === 0 ? (
        <div className="py-12 px-4 text-center space-y-2">
          <p className="text-xs font-bold text-fg-secondary">No Conversations Found</p>
          <button type="button" onClick={onOpenFreshNewMessageModal} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer">+ New Message</button>
        </div>
      ) : rows.map((row) => {
        const isUnread = row.unreadCountTotal > 0 || Boolean(row.latestEvent.isUnread);
        const isSelected = Boolean(selectedRowKeys?.has(row.threadId));
        const isLatestVoicemail = row.latestEvent.type === 'voicemail';
        const isVmExpanded = isLatestVoicemail && expandedVoicemailIds.has(row.latestEvent.id);
        const vmTranscript = isLatestVoicemail ? row.latestEvent.transcription : undefined;
        const row2Snippet = isLatestVoicemail
          ? `${row.latestEvent.audioDuration || '0:30'} · ${vmTranscript || cleanCommsEmailSnippet(row.latestEvent.snippet) || 'Voicemail message'}`
          : cleanCommsEmailSnippet(row.latestEvent.snippet);
        const gestureProps = getRowGestureProps(row.threadId, () => {
          if (row.selectorTarget) onSelectContact(row.selectorTarget, row.latestEvent.id);
        });
        return (
          <div
            key={row.threadId}
            {...gestureProps}
            className={`group min-h-[52px] px-3 py-1.5 cursor-pointer transition-colors select-none ${
              isSelected
                ? 'bg-status-info-bg-strong/70 hover:bg-status-info-bg-strong'
                : isUnread
                ? 'bg-status-info-bg/50 hover:bg-status-info-bg'
                : 'bg-surface-card hover:bg-surface-subtle'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CommsContactAvatar
                name={row.contactName}
                phone={row.primaryPhone}
                email={row.primaryEmail}
                fallbackId={row.threadId}
                rowKey={row.threadId}
                isSelected={isSelected}
                isSelectionMode={isSelectionMode}
                onToggleSelect={onToggleSelectRow}
                selectionAriaLabel={isSelected ? 'Deselect conversation' : 'Select conversation'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={`text-xs truncate ${isUnread ? 'font-extrabold text-fg-primary' : 'font-semibold text-fg-strong'}`}>{row.contactName}</span>
                    {row.isVip && <span className="px-1 rounded bg-status-warning-bg-strong text-status-warning-fg text-[9px] font-black uppercase shrink-0">VIP</span>}
                    {row.contactType === 'driver' && <span className="px-1 rounded bg-status-success-bg-strong text-status-success-fg text-[9px] font-bold shrink-0">Driver</span>}
                    {row.contactType === 'corporate' && <span className="px-1 rounded bg-status-staged-bg-strong text-status-staged-fg text-[9px] font-bold shrink-0">Corp</span>}
                    {row.unreadCountTotal > 0 && <span className="px-1.5 rounded-full bg-blue-600 text-white text-[9.5px] font-black shrink-0">{row.unreadCountTotal}</span>}
                  </div>
                  <CommsTimestampWithHoverReadToggle
                    rowKey={row.threadId}
                    timestampLabel={row.latestEvent.timestamp}
                    isUnread={isUnread}
                    onToggleRowReadStatus={onToggleRowReadStatus}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <CommsChannelDirectionIcon type={row.latestEvent.type} />
                    <p className={`text-[11px] truncate ${isUnread ? 'text-fg-strong font-medium' : 'text-fg-muted'}`}>{row2Snippet}</p>
                    {isLatestVoicemail && vmTranscript && (
                      <button
                        type="button"
                        data-voicemail-expand-toggle={row.latestEvent.id}
                        aria-expanded={isVmExpanded}
                        aria-label={isVmExpanded ? 'Collapse transcription' : 'Expand transcription'}
                        title={isVmExpanded ? 'Collapse transcription' : 'Expand transcription'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVoicemailExpanded(row.latestEvent.id);
                        }}
                        className="p-0.5 rounded hover:bg-status-warning-bg-strong text-status-warning-fg shrink-0 cursor-pointer"
                      >
                        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isVmExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {row.primaryPhone && <button type="button" onClick={() => onStartCall(row.primaryPhone, row.contactName)} title={`Call ${row.contactName}`} aria-label={`Call ${row.contactName}`} className="w-6 h-6 rounded-md bg-status-success-bg hover:bg-emerald-600 text-status-success-fg hover:text-white flex items-center justify-center cursor-pointer"><PhoneIcon className="w-3 h-3" /></button>}
                    <button type="button" onClick={() => getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', { phone: row.primaryPhone, email: row.primaryEmail, name: row.contactName, source: 'comms_hub' })} title="Profile" aria-label="Profile" className="w-6 h-6 rounded-md bg-surface-muted hover:bg-indigo-600 text-fg-secondary hover:text-white flex items-center justify-center cursor-pointer"><UserIcon className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            </div>
            {isLatestVoicemail && isVmExpanded && vmTranscript && (
              <div
                data-voicemail-expanded-body={row.latestEvent.id}
                onClick={(e) => e.stopPropagation()}
                className="mt-1.5 ml-[42px] pl-2 border-l-2 border-status-warning-border text-[11px] text-fg-secondary italic whitespace-pre-wrap leading-relaxed"
              >
                &ldquo;{vmTranscript}&rdquo;
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
