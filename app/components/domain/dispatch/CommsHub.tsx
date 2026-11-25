import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCommsThreadService } from '../../../core/services/comms/comms-thread.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import { ExternalLinkIcon, KeypadGridIcon, PlusIcon, SpinnerIcon, XIcon } from '../../ui/Icons';
import { CommsFilterToolbar } from './comms/CommsFilterToolbar';
import { AgentPhoneSetupModal, CommsBottomNewSmsSheet } from './comms/CommsModals';
import { SmsThreadPane } from './comms/SmsThreadPane';
import { SoftphoneDialerPane } from './comms/SoftphoneDialerPane';
import { VoicemailCallLogPane } from './comms/VoicemailCallLogPane';
import { COMMS_ALL_VIEW_MODE_STORAGE_KEY, type CommsAllViewMode, type CommsHubProps, type CommsTab } from './comms/comms-types';
import { useCommsInteractionSync } from './comms/useCommsInteractionSync';
import { useCommsMessagingAndContacts } from './comms/useCommsMessagingAndContacts';
import { useTwilioSoftphoneDevice } from './comms/useTwilioSoftphoneDevice';

export type { CommsTab, ChannelFilter, ContactFilter, InteractionEvent, CommsHubProps } from './comms/comms-types';
export { getClientTelephonyCredentials } from './comms/comms-types';

const CLIENT_PROFILE_ACTION_LABEL = 'Client Profile';

function CommsHubComponent({
  user: _user, initialTab = 'all', onTabChange, isPopout = false, isVisible = true,
  showWindowControls = false, onClose, onPopOut, onPopulateBooking, onOpenEditTrip,
  onOpenTripDetails, initialAllViewMode = 'grouped', initialNewSmsSheetOpen = false,
  drivers = [], trips = [],
}: CommsHubProps) {
  const [activeTab, setActiveTab] = useState<CommsTab>(initialTab);
  const [allViewMode, setAllViewMode] = useState<CommsAllViewMode>(initialAllViewMode);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const saved = localStorage.getItem(COMMS_ALL_VIEW_MODE_STORAGE_KEY);
      if (saved === 'grouped' || saved === 'stream') setAllViewMode(saved);
    } catch {}
  }, []);

  const handleChangeAllViewMode = (mode: CommsAllViewMode) => {
    setAllViewMode(mode);
    if (typeof window !== 'undefined' && window.localStorage) {
      try { localStorage.setItem(COMMS_ALL_VIEW_MODE_STORAGE_KEY, mode); } catch {}
    }
  };

  const sync = useCommsInteractionSync({ isVisible });
  const softphone = useTwilioSoftphoneDevice({
    user: _user, isVisible, activeTab, setActiveTab, trips, drivers,
    setInteractions: sync.setInteractions, fetchTelephonyData: sync.fetchTelephonyData,
    onPopulateBooking, onOpenEditTrip,
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      if (initialTab === 'phone' && softphone.callStatus === 'idle') softphone.setCallsSubTab('history');
      onTabChange?.(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab]);

  const handleSelectTab = (tab: CommsTab) => {
    setActiveTab(tab);
    if (tab === 'phone' && softphone.callStatus === 'idle') softphone.setCallsSubTab('history');
    onTabChange?.(tab);
  };

  const messaging = useCommsMessagingAndContacts({
    user: _user, activeTab, interactions: sync.interactions, setInteractions: sync.setInteractions,
    fetchTelephonyData: sync.fetchTelephonyData, trips, drivers, activeCallPhone: softphone.activeCallPhone,
    dialpadNumber: softphone.dialpadNumber, showTimedBookingToast: softphone.showTimedBookingToast,
    onPopulateBooking, onOpenEditTrip, initialNewSmsSheetOpen,
  });

  const openKeypadView = () => {
    messaging.setSelectedContactPhone(null);
    setActiveTab('phone');
    softphone.setCallsSubTab('keypad');
    onTabChange?.('phone');
  };
  const openKeypadRef = useRef(openKeypadView);
  openKeypadRef.current = openKeypadView;

  useEffect(() => getWorkspaceBus().subscribe((msg) => {
    if (msg.type === 'OPEN_SOFTPHONE_KEYPAD') openKeypadRef.current();
  }), []);

  const isThreadOpen = Boolean(messaging.selectedContactPhone && messaging.activeContactSummary);
  useEffect(() => {
    getWorkspaceBus().publish('SOFTPHONE_VIEW_STATE_CHANGED', {
      activeTab,
      callsSubTab: isThreadOpen ? 'thread' : softphone.callsSubTab,
    });
  }, [activeTab, softphone.callsSubTab, isThreadOpen]);

  const handleMarkAllRead = () => {
    const unreadIds = sync.interactions.filter((i) => i.isUnread && !i.isDeleted).map((i) => i.id);
    if (unreadIds.length === 0) return;
    sync.setInteractions((prev) => prev.map((i) => (i.isUnread ? { ...i, isUnread: false } : i)));
    void getCommsThreadService().markEventsRead(unreadIds);
  };

  const isGroupedView = activeTab === 'messages' || (activeTab === 'all' && allViewMode === 'grouped');
  const activeGroupedRows = activeTab === 'all' ? sync.filteredAllConversationRows : sync.conversationRows;
  const activeEventRows =
    activeTab === 'voicemail'
      ? sync.filteredVoicemails
      : activeTab === 'phone'
      ? softphone.callsSubTab === 'missed'
        ? sync.filteredMissedCalls
        : sync.filteredHistoryCalls
      : sync.filteredAllInteractions;

  const visibleRowKeys = useMemo(() => {
    if (isThreadOpen || (activeTab === 'phone' && softphone.callsSubTab === 'keypad')) return [];
    return isGroupedView
      ? activeGroupedRows.map((r) => r.threadId)
      : activeEventRows.map((e) => e.id);
  }, [isThreadOpen, activeTab, softphone.callsSubTab, isGroupedView, activeGroupedRows, activeEventRows]);

  useEffect(() => {
    setSelectedRowKeys(new Set());
  }, [activeTab, allViewMode, softphone.callsSubTab, isThreadOpen]);

  const handleClearSelection = useCallback(() => {
    setSelectedRowKeys(new Set());
  }, []);

  const handleToggleSelectRow = useCallback((key: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allSelected = useMemo(
    () => visibleRowKeys.length > 0 && visibleRowKeys.every((k) => selectedRowKeys.has(k)),
    [visibleRowKeys, selectedRowKeys]
  );

  const handleToggleSelectAll = useCallback(() => {
    setSelectedRowKeys((prev) => {
      if (visibleRowKeys.length > 0 && visibleRowKeys.every((k) => prev.has(k))) {
        return new Set();
      }
      return new Set(visibleRowKeys);
    });
  }, [visibleRowKeys]);

  const selectedHasUnread = useMemo(() => {
    if (selectedRowKeys.size === 0) return false;
    if (isGroupedView) {
      return activeGroupedRows.some(
        (r) => selectedRowKeys.has(r.threadId) && (r.unreadCountTotal > 0 || Boolean(r.latestEvent.isUnread))
      );
    }
    return activeEventRows.some((e) => selectedRowKeys.has(e.id) && Boolean(e.isUnread));
  }, [selectedRowKeys, isGroupedView, activeGroupedRows, activeEventRows]);

  const selectedAllArchived = useMemo(() => {
    if (selectedRowKeys.size === 0) return false;
    const svc = getCommsThreadService();
    if (isGroupedView) {
      return Array.from(selectedRowKeys).every((tid) => Boolean(svc.getThreadById(tid)?.isArchived));
    }
    return activeEventRows
      .filter((e) => selectedRowKeys.has(e.id))
      .every((e) => Boolean(e.isArchived));
  }, [selectedRowKeys, isGroupedView, activeEventRows]);

  const handleBulkMarkReadUnread = useCallback(() => {
    const keys = Array.from(selectedRowKeys);
    if (keys.length === 0) return;
    const svc = getCommsThreadService();
    if (isGroupedView) {
      if (selectedHasUnread) {
        keys.forEach((tid) => void svc.markThreadRead(tid));
      } else {
        void svc.markThreadsUnread(keys);
      }
    } else {
      const keySet = new Set(keys);
      sync.setInteractions((prev) =>
        prev.map((i) => (keySet.has(i.id) ? { ...i, isUnread: !selectedHasUnread } : i))
      );
      if (selectedHasUnread) {
        void svc.markEventsRead(keys);
      } else {
        void svc.markEventsUnread(keys);
      }
    }
    setSelectedRowKeys(new Set());
  }, [selectedRowKeys, isGroupedView, selectedHasUnread, sync]);

  const handleBulkArchive = useCallback(() => {
    const keys = Array.from(selectedRowKeys);
    if (keys.length === 0) return;
    const svc = getCommsThreadService();
    if (isGroupedView) {
      if (selectedAllArchived) void svc.unarchiveThreads(keys);
      else void svc.archiveThreads(keys);
    } else {
      const keySet = new Set(keys);
      sync.setInteractions((prev) =>
        prev.map((i) =>
          keySet.has(i.id)
            ? { ...i, isArchived: !selectedAllArchived, isUnread: selectedAllArchived ? i.isUnread : false }
            : i
        )
      );
      if (selectedAllArchived) void svc.unarchiveEvents(keys);
      else void svc.archiveEvents(keys);
    }
    setSelectedRowKeys(new Set());
  }, [selectedRowKeys, isGroupedView, selectedAllArchived, sync]);

  const handleBulkDelete = useCallback(() => {
    const keys = Array.from(selectedRowKeys);
    if (keys.length === 0) return;
    const svc = getCommsThreadService();
    const keySet = new Set(keys);
    if (isGroupedView) {
      sync.setInteractions((prev) =>
        prev.filter((i) => !i.threadId || !keySet.has(i.threadId))
      );
      void svc.deleteThreads(keys);
    } else {
      sync.setInteractions((prev) => prev.filter((i) => !keySet.has(i.id)));
      void svc.deleteEvents(keys);
    }
    setSelectedRowKeys(new Set());
  }, [selectedRowKeys, isGroupedView, sync]);

  const handleToggleRowReadStatus = useCallback(
    (key: string, currentlyUnread: boolean) => {
      const svc = getCommsThreadService();
      if (isGroupedView) {
        if (currentlyUnread) {
          void svc.markThreadRead(key);
        } else {
          void svc.markThreadsUnread([key]);
        }
      } else {
        sync.setInteractions((prev) =>
          prev.map((i) => (i.id === key ? { ...i, isUnread: !currentlyUnread } : i))
        );
        void svc.toggleEventReadStatus(key);
      }
    },
    [isGroupedView, sync]
  );

  const keyboardRef = useRef({
    sendSms: messaging.handleSendSms, addNote: messaging.handleAddThreadInternalNote, sendNew: messaging.handleSendNewMessage,
  });
  keyboardRef.current = {
    sendSms: messaging.handleSendSms, addNote: messaging.handleAddThreadInternalNote, sendNew: messaging.handleSendNewMessage,
  };

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (messaging.isNewMessageModalOpen && messaging.newMsgBody.trim()) { e.preventDefault(); void keyboardRef.current.sendNew(); return; }
        if (messaging.selectedContactPhone) {
          if (messaging.noteDraftText.trim()) { e.preventDefault(); void keyboardRef.current.addNote(); }
          else if (messaging.smsReplyText.trim()) { e.preventDefault(); void keyboardRef.current.sendSms(); }
          return;
        }
      }
      if (e.key === 'Escape') {
        if (messaging.isNewMessageModalOpen) { e.preventDefault(); messaging.setIsNewMessageModalOpen(false); }
        else if (softphone.showAgentSetupModal) { e.preventDefault(); softphone.handleCloseAgentSetupModal(); }
        else if (messaging.selectedContactPhone) { e.preventDefault(); messaging.setSelectedContactPhone(null); }
        else if (selectedRowKeys.size > 0) { e.preventDefault(); setSelectedRowKeys(new Set()); }
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !editable && searchInputRef.current?.offsetParent) {
        e.preventDefault(); searchInputRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isVisible, messaging.isNewMessageModalOpen, softphone.showAgentSetupModal, messaging.selectedContactPhone, selectedRowKeys.size, messaging.newMsgBody, messaging.noteDraftText, messaging.smsReplyText]);

  const showListToolbar = !isThreadOpen && !(activeTab === 'phone' && softphone.callsSubTab === 'keypad');
  const activeUnreadCount = activeTab === 'messages' ? sync.unreadCountMessages : activeTab === 'voicemail' ? sync.unreadCountVoicemail : activeTab === 'phone' ? sync.unreadCountMissed : sync.unreadCountAll;
  const showKeypadFab = activeTab === 'all' || activeTab === 'phone' || activeTab === 'voicemail';
  const showNewMsgFab = activeTab === 'all' || activeTab === 'messages';

  const sharedSmsProps = {
    threadTab: messaging.threadTab, onChangeThreadTab: messaging.setThreadTab,
    timelineFilters: messaging.timelineFilters, onChangeTimelineFilters: messaging.setTimelineFilters,
    onBackFromThread: () => messaging.setSelectedContactPhone(null),
    onOpenContactEdit: messaging.handleOpenContactEdit, onOpenClientProfile: messaging.handleOpenClientProfile,
    onBookContactRide: messaging.handleBookContactRide, playingCallId: sync.playingCallId,
    onTogglePlayCall: sync.handleTogglePlayCall, playingVoicemailId: sync.playingVoicemailId,
    onTogglePlayVoicemail: sync.handleTogglePlayVoicemail, playbackSpeed: sync.playbackSpeed,
    onCyclePlaybackSpeed: sync.handleCyclePlaybackSpeed, onStartCall: softphone.handleStartCall,
    onConvertVoicemailToBooking: messaging.handleConvertVoicemailToBooking,
    smsReplyText: messaging.smsReplyText, onChangeSmsReplyText: messaging.setSmsReplyText,
    isSendingSms: messaging.isSendingSms, onSendSms: messaging.handleSendSms,
    smsStatusMessage: messaging.smsStatusMessage, onSelectContact: messaging.setSelectedContactPhone,
    onOpenFreshNewMessageModal: messaging.handleOpenFreshNewMessageModal,
  };

  return (
    <div
      data-client-profile-label={CLIENT_PROFILE_ACTION_LABEL}
      className={`@container/commshub relative flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden h-full bg-white text-slate-900 ${isPopout ? 'h-screen' : ''}`}
    >
      <audio ref={sync.audioPlayerRef} onEnded={sync.handleAudioEnded} className="hidden" />

      {/* Row 1 (h-10): Passive WebRTC Dot + 4-Segment Switch (Window Title/Controls only in popout/window mode) */}
      <div data-comms-row="header" className="h-10 px-2.5 border-b border-slate-200 bg-white flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {softphone.softphoneStatus === 'initializing' ? (
            <SpinnerIcon className="w-2.5 h-2.5 animate-spin text-blue-600 shrink-0" />
          ) : (
            <span
              data-webrtc-status-dot={softphone.softphoneStatus}
              title={softphone.softphoneStatus === 'ready' ? 'WebRTC Softphone Ready' : 'Softphone Bridge Mode'}
              className={`w-2 h-2 rounded-full shrink-0 ${softphone.softphoneStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          )}
          {(isPopout || showWindowControls) && (
            <span className="text-[11px] font-extrabold text-slate-900 truncate">Phone &amp; Messages</span>
          )}
        </div>

        <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold min-w-0">
          {([
            { id: 'all' as const, label: 'All', badge: sync.unreadCountAll, cls: 'bg-slate-700' },
            { id: 'phone' as const, label: 'Calls', badge: sync.unreadCountMissed, cls: 'bg-rose-500' },
            { id: 'messages' as const, label: 'Messages', badge: sync.unreadCountMessages, cls: 'bg-blue-600' },
            { id: 'voicemail' as const, label: 'VM', badge: sync.unreadCountVoicemail, cls: 'bg-amber-500' },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { handleSelectTab(t.id); if (t.id !== 'messages') messaging.setSelectedContactPhone(null); }}
              className={`h-7 px-2 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${activeTab === t.id ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <span>{t.label}</span>
              {t.badge > 0 && <span className={`px-1 rounded-full text-[9px] font-black text-white ${t.cls}`}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {isPopout || showWindowControls ? (
          <div className="flex items-center gap-1 shrink-0 min-w-[4px]">
            {showWindowControls && !isPopout && onPopOut && (
              <button type="button" onClick={onPopOut} title="Pop out window" className="p-1 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"><ExternalLinkIcon className="w-3.5 h-3.5" /></button>
            )}
            {showWindowControls && !isPopout && onClose && (
              <button type="button" onClick={onClose} title="Close" className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-rose-600 cursor-pointer"><XIcon className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ) : (
          <span className="w-2 shrink-0" />
        )}
      </div>

      {/* Row 2 (h-9): List-Only Leading Toggle (Grouped|Stream or All|Missed) + Search + Multi-Select Filter ▾ */}
      {showListToolbar && (
        <CommsFilterToolbar
          searchQuery={sync.searchQuery} onChangeSearchQuery={sync.setSearchQuery} searchInputRef={searchInputRef}
          channelFilter={sync.channelFilter} onChangeChannelFilter={sync.setChannelFilter}
          channelFilters={sync.channelFilters} onChangeChannelFilters={sync.setChannelFilters} showChannelFilter={activeTab === 'all'}
          contactFilter={sync.contactFilter} onChangeContactFilter={sync.setContactFilter}
          contactFilters={sync.contactFilters} onChangeContactFilters={sync.setContactFilters}
          filterUnreadOnly={sync.filterUnreadOnly} onToggleUnreadOnly={() => sync.setFilterUnreadOnly((v) => !v)}
          showArchived={sync.showArchived} onToggleShowArchived={() => sync.setShowArchived((v) => !v)}
          unreadCount={activeUnreadCount} onMarkAllRead={handleMarkAllRead} onRefresh={() => void sync.fetchTelephonyData()}
          allViewMode={allViewMode} onChangeAllViewMode={handleChangeAllViewMode} showAllViewModeToggle={activeTab === 'all'}
          selectedCount={selectedRowKeys.size} allSelected={allSelected}
          selectedHasUnread={selectedHasUnread} selectedAllArchived={selectedAllArchived}
          onToggleSelectAll={handleToggleSelectAll} onBulkMarkReadUnread={handleBulkMarkReadUnread}
          onBulkArchive={handleBulkArchive} onBulkDelete={handleBulkDelete} onClearSelection={handleClearSelection}
          leadingSlot={activeTab === 'phone' ? (
            <div data-comms-calls-subtoggle="true" className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-[10.5px] font-bold shrink-0">
              {([
                { id: 'history' as const, label: 'All' },
                { id: 'missed' as const, label: 'Missed' },
              ] as const).map((sub) => (
                <button key={sub.id} type="button" onClick={() => softphone.setCallsSubTab(sub.id)} className={`h-6 px-2 rounded-md transition-colors cursor-pointer ${softphone.callsSubTab === sub.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  {sub.label}
                </button>
              ))}
            </div>
          ) : undefined}
        />
      )}

      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
        {isThreadOpen ? (
          <SmsThreadPane
            mode="thread" {...sharedSmsProps}
            activeContactSummary={messaging.activeContactSummary} activeContactRecord={messaging.activeContactRecord}
            threadCrmContext={messaging.threadCrmContext} trips={trips} drivers={drivers}
            onOpenContactEmailInDock={messaging.handleOpenContactEmailInDock} onMarkThreadUnread={messaging.handleMarkThreadUnread}
            onOpenTripById={messaging.handleOpenTripById} onOpenTripDetails={onOpenTripDetails}
            onFocusTripOnMap={messaging.handleFocusTripOnMap} onRebookLastRide={messaging.handleRebookFromCrm}
            selectedInteractions={messaging.allSelectedContactInteractions} messagesEndRef={messaging.messagesEndRef}
            onOpenEmailInDock={messaging.handleOpenEmailInDock} onRetrySms={messaging.handleRetrySms}
            retryingSmsId={messaging.retryingSmsId} onInsertTrackingLink={() => messaging.handleInsertTrackingLink('thread')}
            onInsertPayLink={() => messaging.handleInsertPayLink('thread')} isGeneratingPayLink={messaging.isGeneratingPayLink}
            noteDraftText={messaging.noteDraftText} onChangeNoteDraftText={messaging.setNoteDraftText}
            onAddInternalNote={messaging.handleAddThreadInternalNote}
          />
        ) : activeTab === 'messages' || (activeTab === 'all' && allViewMode === 'grouped') ? (
          <SmsThreadPane
            mode="list" {...sharedSmsProps} selectedInteractions={[]}
            conversationRows={activeTab === 'all' ? sync.filteredAllConversationRows : sync.conversationRows}
            messageConversations={sync.messageConversations} threadUnreadCountMap={sync.threadUnreadCountMap}
            selectedRowKeys={selectedRowKeys} onToggleSelectRow={handleToggleSelectRow}
            onToggleRowReadStatus={handleToggleRowReadStatus}
          />
        ) : activeTab === 'phone' && softphone.callsSubTab === 'keypad' ? (
          <SoftphoneDialerPane
            callStatus={softphone.callStatus} bookingToast={softphone.bookingToast} activeCallContact={softphone.activeCallContact}
            activeCallPhone={softphone.activeCallPhone} dialpadNumber={softphone.dialpadNumber} onChangeDialpadNumber={softphone.setDialpadNumber}
            dialpadInputRef={softphone.dialpadInputRef} callTimer={softphone.callTimer} isMuted={softphone.isMuted} callNotice={softphone.callNotice}
            showInCallKeypad={softphone.showInCallKeypad} onToggleInCallKeypad={() => softphone.setShowInCallKeypad((v) => !v)}
            onInCallBookRide={softphone.handleInCallBookRide} onInCallSendLink={softphone.handleInCallSendLink}
            onSendInCallDtmf={softphone.handleSendInCallDtmf} onToggleMute={softphone.handleToggleMute}
            onToggleHold={softphone.handleToggleHold} onEndCall={softphone.handleEndCall} softphoneStatus={softphone.softphoneStatus}
            operatorPhoneInput={softphone.operatorPhoneInput} onChangeOperatorPhoneInput={softphone.setOperatorPhoneInput}
            isEditingOperatorPhone={softphone.isEditingOperatorPhone} onToggleEditingOperatorPhone={() => softphone.setIsEditingOperatorPhone((v) => !v)}
            onSaveOperatorPhone={softphone.handleSaveOperatorPhone} onCancelEditingOperatorPhone={() => softphone.setIsEditingOperatorPhone(false)}
            activeKeypadFeedback={softphone.activeKeypadFeedback} onDialDigit={softphone.handleDialDigit}
            onDeleteDialDigit={softphone.handleDeleteDialDigit} onClearDialpad={softphone.handleClearDialpad}
            onStartCall={softphone.handleStartCall} drivers={drivers} callerCrmContext={softphone.callerCrmContext}
            onRebookCallerRide={messaging.handleRebookFromCrm} onSelectThread={messaging.setSelectedContactPhone}
            onBackToHistory={() => softphone.setCallsSubTab('history')}
          />
        ) : (
          <VoicemailCallLogPane
            mode={activeTab === 'voicemail' ? 'voicemail' : activeTab === 'phone' ? (softphone.callsSubTab === 'missed' ? 'call_missed' : 'call_history') : 'all'}
            items={activeTab === 'voicemail' ? sync.filteredVoicemails : activeTab === 'phone' ? (softphone.callsSubTab === 'missed' ? sync.filteredMissedCalls : sync.filteredHistoryCalls) : sync.filteredAllInteractions}
            playingVoicemailId={sync.playingVoicemailId} onTogglePlayVoicemail={sync.handleTogglePlayVoicemail}
            playingCallId={sync.playingCallId} onTogglePlayCall={sync.handleTogglePlayCall}
            playbackSpeed={sync.playbackSpeed} onCyclePlaybackSpeed={sync.handleCyclePlaybackSpeed}
            onStartCall={softphone.handleStartCall} onSelectContact={messaging.setSelectedContactPhone}
            onConvertVoicemailToBooking={messaging.handleConvertVoicemailToBooking} onOpenEmailInDock={messaging.handleOpenEmailInDock}
            selectedRowKeys={selectedRowKeys} onToggleSelectRow={handleToggleSelectRow}
            onToggleRowReadStatus={handleToggleRowReadStatus}
          />
        )}
      </div>

      {showListToolbar && !messaging.isNewMessageModalOpen && (
        <div className="absolute bottom-3.5 right-3.5 z-30 flex items-center gap-2">
          {showKeypadFab && (
            <button
              type="button"
              data-comms-keypad-fab="true"
              onClick={openKeypadView}
              title="Open Softphone Keypad"
              className="h-9 px-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-extrabold shadow-lg ring-1 ring-emerald-700/20 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <KeypadGridIcon className="w-3.5 h-3.5" /><span>Keypad</span>
            </button>
          )}
          {showNewMsgFab && (
            <button
              type="button"
              data-comms-new-sms-fab="true"
              onClick={messaging.handleOpenFreshNewMessageModal}
              title="Compose New Message"
              className="h-9 px-3.5 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-extrabold shadow-lg ring-1 ring-blue-700/20 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5" /><span>New Message</span>
            </button>
          )}
        </div>
      )}

      <AgentPhoneSetupModal
        isOpen={softphone.showAgentSetupModal} pendingCallTarget={softphone.pendingCallTarget}
        setupAgentPhoneInput={softphone.setupAgentPhoneInput} setupAgentPhoneError={softphone.setupAgentPhoneError}
        onChangeSetupAgentPhoneInput={(val) => { softphone.setSetupAgentPhoneInput(val); if (softphone.setupAgentPhoneError) softphone.setSetupAgentPhoneError(null); }}
        onSaveAndCall={softphone.handleSaveAgentAndCall} onClose={softphone.handleCloseAgentSetupModal}
      />

      <CommsBottomNewSmsSheet
        isOpen={messaging.isNewMessageModalOpen} trips={trips} newMsgError={messaging.newMsgError} msgContactSearch={messaging.msgContactSearch}
        newMsgRecipientPhone={messaging.newMsgRecipientPhone} newMsgRecipientName={messaging.newMsgRecipientName}
        newMsgBody={messaging.newMsgBody} isSendingNewMsg={messaging.isSendingNewMsg}
        isMsgContactDropdownOpen={messaging.isMsgContactDropdownOpen} filteredContactsForMsg={messaging.filteredContactsForMsg}
        recipientCrmContext={messaging.newMsgRecipientCrmContext}
        onInsertTrackingLink={() => messaging.handleInsertTrackingLink('modal')}
        onInsertPayLink={() => messaging.handleInsertPayLink('modal')} isGeneratingPayLink={messaging.isGeneratingPayLink}
        onSelectActiveRideChip={(chip) => { messaging.setNewMsgRecipientPhone(chip.phone); messaging.setNewMsgRecipientName(chip.passengerName); messaging.setMsgContactSearch(`${chip.passengerName} (${chip.phone})`); messaging.setIsMsgContactDropdownOpen(false); messaging.setNewMsgError(null); }}
        onRecipientInputChange={(val) => { messaging.setMsgContactSearch(val); messaging.setNewMsgRecipientPhone(val); messaging.setIsMsgContactDropdownOpen(true); messaging.setNewMsgError(null); }}
        onRecipientInputFocus={() => messaging.setIsMsgContactDropdownOpen(true)}
        onSelectContactOption={(c) => { const ph = c.mobilePhone || c.phone; messaging.setNewMsgRecipientPhone(ph); messaging.setNewMsgRecipientName(c.name); messaging.setMsgContactSearch(`${c.name} (${ph})`); messaging.setIsMsgContactDropdownOpen(false); }}
        onBodyChange={(val) => { messaging.setNewMsgBody(val); messaging.setNewMsgError(null); }}
        onSelectPresetChip={messaging.setNewMsgBody} onOpenThread={messaging.handleOpenNewMessageThread}
        onSend={messaging.handleSendNewMessage} onClose={() => messaging.setIsNewMessageModalOpen(false)}
      />
    </div>
  );
}

export const CommsHub = React.memo(CommsHubComponent);
