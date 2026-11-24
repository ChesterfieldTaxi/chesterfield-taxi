import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';
import { resolveInteractionSelectorTarget } from '../../../core/services/comms/comms-templates.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import { formatDisplayPhone } from '../../../core/utils/phone';
import {
  ChatBubbleLeftRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  PhoneIcon,
  UserIcon,
  XIcon,
} from '../../ui/Icons';
import { CommsContactModal } from './comms/comms-ContactModal';
import { CommsRowActionSheet, useCommsRowTriage } from './comms/CommsRowActionSheet';
import {
  MobileComposeSmsFab,
  NewSmsMessageModal,
  SmsThreadPane,
} from './comms/SmsThreadPane';
import { AgentPhoneSetupModal, SoftphoneDialerPane } from './comms/SoftphoneDialerPane';
import { VoicemailCallLogPane } from './comms/VoicemailCallLogPane';
import type { CommsHubProps, CommsTab } from './comms/comms-types';
import { useCommsInteractionSync } from './comms/useCommsInteractionSync';
import { useCommsMessagingAndContacts } from './comms/useCommsMessagingAndContacts';
import { useTwilioSoftphoneDevice } from './comms/useTwilioSoftphoneDevice';

export type {
  CommsTab,
  ChannelFilter,
  ContactFilter,
  InteractionEvent,
  CommsHubProps,
} from './comms/comms-types';
export { getClientTelephonyCredentials } from './comms/comms-types';

function CommsHubComponent({
  user: _user,
  initialTab = 'all',
  onTabChange,
  isPopout = false,
  isVisible = true,
  showWindowControls = false,
  onClose,
  onPopOut,
  onPopulateBooking,
  onOpenEditTrip,
  drivers = [],
  trips = [],
}: CommsHubProps) {
  const [activeTab, setActiveTab] = useState<CommsTab>(initialTab);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 1. Unified Telephony Polling, CommsThreadService + DispatchEmailService Mirror Sync & Audio Player
  const sync = useCommsInteractionSync({ isVisible });

  // 2. Twilio WebRTC Softphone Device, Ringtone, Inbound/Outbound Calls & PSTN Bridge Fallback
  const softphone = useTwilioSoftphoneDevice({
    user: _user,
    isVisible,
    activeTab,
    setActiveTab,
    trips,
    drivers,
    setInteractions: sync.setInteractions,
    fetchTelephonyData: sync.fetchTelephonyData,
    onPopulateBooking,
    onOpenEditTrip,
  });

  // Sync controlled initialTab prop updates
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      if (initialTab === 'phone' && softphone.callStatus === 'idle') {
        softphone.setCallsSubTab('history');
      }
      onTabChange?.(initialTab);
    }
  }, [initialTab]);

  const handleSelectTab = (tab: CommsTab) => {
    setActiveTab(tab);
    if (tab === 'phone' && softphone.callStatus === 'idle') {
      softphone.setCallsSubTab('history');
    }
    onTabChange?.(tab);
  };

  // 3. Thread Selection, CRM Context, Contact Profile Modal & Outbound SMS / Note / Link Composer
  const messaging = useCommsMessagingAndContacts({
    user: _user,
    activeTab,
    interactions: sync.interactions,
    setInteractions: sync.setInteractions,
    fetchTelephonyData: sync.fetchTelephonyData,
    trips,
    drivers,
    activeCallPhone: softphone.activeCallPhone,
    dialpadNumber: softphone.dialpadNumber,
    showTimedBookingToast: softphone.showTimedBookingToast,
    onPopulateBooking,
    onOpenEditTrip,
  });

  // Active items in current list view for master checkbox & batch triage
  const currentTabItems = useMemo(() => {
    if (activeTab === 'all') return sync.filteredAllInteractions;
    if (activeTab === 'phone') {
      if (softphone.callsSubTab === 'history') return sync.filteredHistoryCalls;
      if (softphone.callsSubTab === 'missed') return sync.filteredMissedCalls;
      return [];
    }
    if (activeTab === 'voicemail') return sync.filteredVoicemails;
    if (activeTab === 'messages') return sync.messageConversations;
    return sync.filteredAllInteractions;
  }, [
    activeTab, softphone.callsSubTab, sync.filteredAllInteractions,
    sync.filteredHistoryCalls, sync.filteredMissedCalls, sync.filteredVoicemails, sync.messageConversations,
  ]);

  // 4. Contextual Row Long-Press Action Sheet & Multi-Select Triage Controls
  const triage = useCommsRowTriage({
    currentTabItems,
    setInteractions: sync.setInteractions,
  });

  // Shared mobile bottom-sheet drag-to-close handler (ordered by z-index priority)
  const commsSheetDrag = useBottomSheetDragToClose({
    onClose: () => {
      if (triage.commsActionSheetEvent) {
        triage.setCommsActionSheetEvent(null);
      } else if (messaging.isNewMessageModalOpen) {
        messaging.setIsNewMessageModalOpen(false);
      } else if (messaging.isContactEditOpen) {
        messaging.handleCloseContactEdit();
      } else if (softphone.showAgentSetupModal) {
        softphone.handleCloseAgentSetupModal();
      }
    },
  });

  // 5. Global CommsHub Hotkeys: `/` search focus, `Cmd/Ctrl + Enter` submit SMS/Note, `Escape` layered dismiss
  const keyboardHandlersRef = useRef({
    onSendSms: messaging.handleSendSms,
    onAddNote: messaging.handleAddThreadInternalNote,
    onSendNewMsg: messaging.handleSendNewMessage,
  });
  keyboardHandlersRef.current = {
    onSendSms: messaging.handleSendSms,
    onAddNote: messaging.handleAddThreadInternalNote,
    onSendNewMsg: messaging.handleSendNewMessage,
  };

  useEffect(() => {
    if (!isVisible) return;

    const handleCommsHotkeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
      );

      // `Cmd/Ctrl + Enter`: submit active New Message modal, Internal Note, or Thread SMS reply
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (messaging.isNewMessageModalOpen && messaging.newMsgBody.trim()) {
          e.preventDefault();
          e.stopPropagation();
          void keyboardHandlersRef.current.onSendNewMsg();
          return;
        }
        if (messaging.selectedContactPhone) {
          if (messaging.noteDraftText.trim()) {
            e.preventDefault();
            e.stopPropagation();
            void keyboardHandlersRef.current.onAddNote();
            return;
          }
          if (messaging.smsReplyText.trim()) {
            e.preventDefault();
            e.stopPropagation();
            void keyboardHandlersRef.current.onSendSms();
            return;
          }
        }
      }

      // `Escape`: close active CommsHub modals/sheets first, or exit active thread / selection
      if (e.key === 'Escape') {
        if (triage.commsActionSheetEvent) {
          e.preventDefault();
          e.stopImmediatePropagation();
          triage.setCommsActionSheetEvent(null);
          return;
        }
        if (messaging.isNewMessageModalOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          messaging.setIsNewMessageModalOpen(false);
          return;
        }
        if (messaging.isContactEditOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          messaging.handleCloseContactEdit();
          return;
        }
        if (softphone.showAgentSetupModal) {
          e.preventDefault();
          e.stopImmediatePropagation();
          softphone.handleCloseAgentSetupModal();
          return;
        }
        if (softphone.isEditingOperatorPhone) {
          e.preventDefault();
          e.stopImmediatePropagation();
          softphone.setIsEditingOperatorPhone(false);
          return;
        }
        if (messaging.selectedContactPhone) {
          e.preventDefault();
          e.stopImmediatePropagation();
          messaging.setSelectedContactPhone(null);
          return;
        }
        if (triage.selectedItemIds.size > 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          triage.handleClearSelection();
          return;
        }
      }

      // `/`: focus visible CommsHub search input when focus is not inside an editable field
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable) {
        if (searchInputRef.current && searchInputRef.current.offsetParent !== null) {
          e.preventDefault();
          e.stopImmediatePropagation();
          searchInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleCommsHotkeys, true);
    return () => window.removeEventListener('keydown', handleCommsHotkeys, true);
  }, [
    isVisible, triage.commsActionSheetEvent, messaging.isNewMessageModalOpen, messaging.isContactEditOpen,
    softphone.showAgentSetupModal, softphone.isEditingOperatorPhone, messaging.selectedContactPhone,
    triage.selectedItemIds.size, messaging.newMsgBody, messaging.noteDraftText, messaging.smsReplyText,
  ]);

  const sharedLogProps = {
    selectedItemIds: triage.selectedItemIds,
    isAllSelected: triage.isAllSelected,
    masterCheckboxRef: triage.masterCheckboxRef,
    onToggleSelectAll: triage.handleToggleSelectAll,
    onToggleSelectRow: triage.handleToggleSelectRow,
    onClearSelection: triage.handleClearSelection,
    onBatchMarkRead: triage.handleBatchMarkRead,
    onBatchMarkUnread: triage.handleBatchMarkUnread,
    onBatchArchive: triage.handleBatchArchive,
    filterUnreadOnly: sync.filterUnreadOnly,
    onToggleUnreadOnly: () => sync.setFilterUnreadOnly((v) => !v),
    contactFilter: sync.contactFilter,
    onChangeContactFilter: sync.setContactFilter,
    searchQuery: sync.searchQuery,
    onChangeSearchQuery: sync.setSearchQuery,
    searchInputRef,
    channelFilter: sync.channelFilter,
    onChangeChannelFilter: sync.setChannelFilter,
    callTypeFilter: sync.callTypeFilter,
    onChangeCallTypeFilter: sync.setCallTypeFilter,
    forwardToast: triage.forwardToast,
    onDismissForwardToast: () => triage.setForwardToast(null),
    playingVoicemailId: sync.playingVoicemailId,
    onTogglePlayVoicemail: sync.handleTogglePlayVoicemail,
    playingCallId: sync.playingCallId,
    onTogglePlayCall: sync.handleTogglePlayCall,
    playbackSpeed: sync.playbackSpeed,
    onCyclePlaybackSpeed: sync.handleCyclePlaybackSpeed,
    onStartCall: softphone.handleStartCall,
    onOpenInKeypad: softphone.handleOpenInKeypad,
    onSelectContact: messaging.setSelectedContactPhone,
    onConvertVoicemailToBooking: messaging.handleConvertVoicemailToBooking,
    onOpenEmailInDock: messaging.handleOpenEmailInDock,
    onToggleReadStatus: triage.handleToggleReadStatus,
    onForwardItem: triage.handleForwardItem,
    onArchiveItem: triage.handleArchiveItem,
    commsLongPressTriggeredIdRef: triage.commsLongPressTriggeredIdRef,
    onRowTouchStart: triage.handleCommsRowTouchStart,
    onRowTouchMove: triage.handleCommsRowTouchMove,
    onRowTouchEnd: triage.cancelCommsLongPress,
  };

  const sharedSmsThreadProps = {
    activeContactSummary: messaging.activeContactSummary,
    activeContactRecord: messaging.activeContactRecord,
    threadCrmContext: messaging.threadCrmContext,
    onBackFromThread: () => messaging.setSelectedContactPhone(null),
    onOpenContactEdit: messaging.handleOpenContactEdit,
    onBookContactRide: messaging.handleBookContactRide,
    onOpenContactEmailInDock: messaging.handleOpenContactEmailInDock,
    onOpenTripById: messaging.handleOpenTripById,
    onRebookLastRide: messaging.handleRebookFromCrm,
    threadTab: messaging.threadTab,
    onChangeThreadTab: messaging.setThreadTab,
    totalContactInteractionCount: messaging.allSelectedContactInteractions.length,
    threadSmsCount: messaging.threadSmsCount,
    threadCallCount: messaging.threadCallCount,
    threadEmailCount: messaging.threadEmailCount,
    threadNoteCount: messaging.threadNoteCount,
    has10DlcBlockedMessages: messaging.has10DlcBlockedMessages,
    upcomingBookingsForContact: messaging.upcomingBookingsForContact,
    onViewUpcomingTrip: messaging.handleViewUpcomingTrip,
    selectedInteractions: messaging.selectedInteractions,
    messagesEndRef: messaging.messagesEndRef,
    playingCallId: sync.playingCallId,
    onTogglePlayCall: sync.handleTogglePlayCall,
    playingVoicemailId: sync.playingVoicemailId,
    onTogglePlayVoicemail: sync.handleTogglePlayVoicemail,
    playbackSpeed: sync.playbackSpeed,
    onCyclePlaybackSpeed: sync.handleCyclePlaybackSpeed,
    onStartCall: softphone.handleStartCall,
    onConvertVoicemailToBooking: messaging.handleConvertVoicemailToBooking,
    onOpenEmailInDock: messaging.handleOpenEmailInDock,
    onRetrySms: messaging.handleRetrySms,
    retryingSmsId: messaging.retryingSmsId,
    onInsertTrackingLink: () => messaging.handleInsertTrackingLink('thread'),
    onInsertPayLink: () => messaging.handleInsertPayLink('thread'),
    isGeneratingPayLink: messaging.isGeneratingPayLink,
    noteDraftText: messaging.noteDraftText,
    onChangeNoteDraftText: messaging.setNoteDraftText,
    onAddInternalNote: messaging.handleAddThreadInternalNote,
    smsReplyText: messaging.smsReplyText,
    onChangeSmsReplyText: messaging.setSmsReplyText,
    isSendingSms: messaging.isSendingSms,
    onSendSms: messaging.handleSendSms,
    smsStatusMessage: messaging.smsStatusMessage,
    conversationRows: sync.conversationRows,
    messageConversations: sync.messageConversations,
    threadUnreadCountMap: sync.threadUnreadCountMap,
    selectedItemIds: triage.selectedItemIds,
    isAllSelected: triage.isAllSelected,
    masterCheckboxRef: triage.masterCheckboxRef,
    onToggleSelectAll: triage.handleToggleSelectAll,
    onToggleSelectRow: triage.handleToggleSelectRow,
    onClearSelection: triage.handleClearSelection,
    onBatchMarkRead: triage.handleBatchMarkRead,
    onBatchMarkUnread: triage.handleBatchMarkUnread,
    onBatchArchive: triage.handleBatchArchive,
    unreadCountMessages: sync.unreadCountMessages,
    filterUnreadOnly: sync.filterUnreadOnly,
    onToggleUnreadOnly: () => sync.setFilterUnreadOnly((v) => !v),
    contactFilter: sync.contactFilter,
    onChangeContactFilter: sync.setContactFilter,
    searchQuery: sync.searchQuery,
    onChangeSearchQuery: sync.setSearchQuery,
    searchInputRef,
    onSelectContact: messaging.setSelectedContactPhone,
    onOpenFreshNewMessageModal: messaging.handleOpenFreshNewMessageModal,
  };

  return (
    <div
      className={`@container/commshub relative flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900 ${
        isPopout ? 'h-screen' : ''
      }`}
    >
      {/* Hidden audio element for Twilio recordings & voicemail playback */}
      <audio ref={sync.audioPlayerRef} onEnded={sync.handleAudioEnded} className="hidden" />

      {/* ─── Incoming Softphone Call Banner ─── */}
      {softphone.incomingCallInfo && (
        <div className="bg-emerald-600 text-white px-4 py-3 shrink-0 shadow-lg flex items-center justify-between border-b border-emerald-700 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <PhoneIcon className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
                Incoming Softphone Call
                {softphone.callerCrmContext?.isVip ? ' · VIP' : ''}
                {softphone.callerCrmContext?.isBlacklisted ? ' · DO NOT DISPATCH' : ''}
              </p>
              <p className="text-sm font-bold font-mono">
                {softphone.callerCrmContext?.hasKnownContext &&
                softphone.callerCrmContext.contactName !== 'Unknown Caller'
                  ? `${softphone.callerCrmContext.contactName} (${formatDisplayPhone(
                      softphone.incomingCallInfo.from
                    )})`
                  : formatDisplayPhone(softphone.incomingCallInfo.from)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', {
                  phone: softphone.incomingCallInfo?.from,
                  name: softphone.callerCrmContext?.contactName,
                  source: 'comms_hub',
                })
              }
              className="px-2.5 py-1.5 rounded-xl bg-emerald-800/70 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              Client Profile
            </button>
            <button
              type="button"
              onClick={softphone.handleRejectIncomingCall}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={softphone.handleAcceptIncomingCall}
              className="px-4 py-1.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 text-xs font-black cursor-pointer shadow-md transition-all active:scale-95"
            >
              Answer
            </button>
          </div>
        </div>
      )}

      {/* ─── Clean Sub-Navigation Bar (All | Calls | SMS | VM) ─── */}
      <div className="bg-white border-b border-slate-200/80 px-2.5 py-2 shrink-0">
        <div className="grid grid-cols-4 gap-1 bg-slate-100/90 p-0.5 rounded-xl text-center">
          <button
            type="button"
            onClick={() => {
              handleSelectTab('all');
              messaging.setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="truncate">All</span>
            {sync.unreadCountAll > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-slate-700 text-white">
                {sync.unreadCountAll}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('phone');
              messaging.setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'phone'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <PhoneIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">Calls</span>
            {sync.unreadCountMissed > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-rose-500 text-white">
                {sync.unreadCountMissed}
              </span>
            )}
            {softphone.callStatus !== 'idle' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('messages');
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'messages'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ChatBubbleLeftRightIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">SMS</span>
            {sync.unreadCountMessages > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-blue-600 text-white">
                {sync.unreadCountMessages}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('voicemail');
              messaging.setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'voicemail'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="truncate">VM</span>
            {sync.unreadCountVoicemail > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-amber-500 text-white">
                {sync.unreadCountVoicemail}
              </span>
            )}
          </button>
        </div>

        {/* Optional Action Controls (Only when explicitly enabled, never in docked view) */}
        {showWindowControls && !isPopout && onPopOut && (
          <div className="flex items-center justify-end gap-1 pt-1.5">
            <button
              type="button"
              onClick={onPopOut}
              title="Pop out into separate desktop window"
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer hidden md:flex items-center"
            >
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close panel"
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer hidden md:flex items-center"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── MAIN CONTENT BODY ─── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* VIEW 1: UNIFIED ALL COMMUNICATIONS ACTIVITY STREAM */}
        {activeTab === 'all' && !messaging.selectedContactPhone && (
          <VoicemailCallLogPane
            mode="all"
            items={sync.filteredAllInteractions}
            unreadCount={sync.unreadCountAll}
            {...sharedLogProps}
          />
        )}

        {/* VIEW 2: UNIFIED CONTACT CONVERSATION THREAD */}
        {messaging.selectedContactPhone && messaging.activeContactSummary && (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="px-2.5 py-1 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between shrink-0">
              <span className="text-[10.5px] font-bold text-indigo-900 truncate">
                {messaging.activeContactRecord?.name || messaging.activeContactSummary.contactName}
              </span>
              <button
                type="button"
                onClick={() =>
                  getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', {
                    phone:
                      messaging.activeContactRecord?.phone ||
                      messaging.activeContactSummary?.mobilePhone ||
                      messaging.activeContactSummary?.contactPhone,
                    email:
                      messaging.activeContactRecord?.email ||
                      messaging.activeContactSummary?.contactEmail,
                    name:
                      messaging.activeContactRecord?.name ||
                      messaging.activeContactSummary?.contactName,
                    source: 'comms_hub',
                  })
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-indigo-100 text-indigo-700 font-bold text-[10.5px] border border-indigo-200 cursor-pointer shrink-0"
              >
                <UserIcon className="w-3 h-3" />
                <span>Client Profile</span>
              </button>
            </div>
            <SmsThreadPane mode="thread" {...sharedSmsThreadProps} />
          </div>
        )}

        {/* VIEW 3: FULL DTMF NUMERIC DIALPAD & SOFTPHONE / CALL HISTORY */}
        {activeTab === 'phone' && !messaging.selectedContactPhone && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
            {/* Top Sub-Switcher: History vs Keypad vs Missed */}
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/80 shrink-0">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => softphone.setCallsSubTab('history')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    softphone.callsSubTab === 'history'
                      ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">History</span>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.2 rounded-full shrink-0 ${
                      softphone.callsSubTab === 'history'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {sync.allHistoryCalls.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => softphone.setCallsSubTab('keypad')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    softphone.callsSubTab === 'keypad'
                      ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Keypad</span>
                </button>
                <button
                  type="button"
                  onClick={() => softphone.setCallsSubTab('missed')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    softphone.callsSubTab === 'missed'
                      ? 'bg-white text-rose-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span className="truncate">Missed</span>
                  {sync.allMissedCalls.length > 0 && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded-full shrink-0 ${
                        softphone.callsSubTab === 'missed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-rose-500 text-white'
                      }`}
                    >
                      {sync.allMissedCalls.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {softphone.callsSubTab === 'keypad' && (
              <SoftphoneDialerPane
                callStatus={softphone.callStatus}
                bookingToast={softphone.bookingToast}
                activeCallContact={softphone.activeCallContact}
                activeCallPhone={softphone.activeCallPhone}
                dialpadNumber={softphone.dialpadNumber}
                onChangeDialpadNumber={softphone.setDialpadNumber}
                dialpadInputRef={softphone.dialpadInputRef}
                callTimer={softphone.callTimer}
                isMuted={softphone.isMuted}
                callNotice={softphone.callNotice}
                showInCallTrips={softphone.showInCallTrips}
                showInCallNotes={softphone.showInCallNotes}
                showInCallKeypad={softphone.showInCallKeypad}
                onToggleInCallTrips={() => {
                  softphone.setShowInCallTrips((v) => !v);
                  softphone.setShowInCallNotes(false);
                  softphone.setShowInCallKeypad(false);
                }}
                onToggleInCallNotes={() => {
                  softphone.setShowInCallNotes((v) => !v);
                  softphone.setShowInCallTrips(false);
                  softphone.setShowInCallKeypad(false);
                }}
                onToggleInCallKeypad={() => {
                  softphone.setShowInCallKeypad((v) => !v);
                  softphone.setShowInCallTrips(false);
                  softphone.setShowInCallNotes(false);
                }}
                onInCallBookRide={softphone.handleInCallBookRide}
                onInCallSendLink={softphone.handleInCallSendLink}
                matchingCallerTrips={softphone.matchingCallerTrips}
                onLoadCallerTrip={softphone.handleLoadCallerTrip}
                onEditCallerTrip={softphone.handleEditCallerTrip}
                inCallNoteText={softphone.inCallNoteText}
                onChangeInCallNoteText={softphone.setInCallNoteText}
                onAppendCallNote={softphone.handleAppendCallNote}
                onSendInCallDtmf={softphone.handleSendInCallDtmf}
                onToggleMute={softphone.handleToggleMute}
                onToggleHold={softphone.handleToggleHold}
                onEndCall={softphone.handleEndCall}
                softphoneStatus={softphone.softphoneStatus}
                operatorPhoneInput={softphone.operatorPhoneInput}
                onChangeOperatorPhoneInput={softphone.setOperatorPhoneInput}
                isEditingOperatorPhone={softphone.isEditingOperatorPhone}
                onToggleEditingOperatorPhone={() =>
                  softphone.setIsEditingOperatorPhone((v) => !v)
                }
                onSaveOperatorPhone={softphone.handleSaveOperatorPhone}
                onCancelEditingOperatorPhone={() => softphone.setIsEditingOperatorPhone(false)}
                activeKeypadFeedback={softphone.activeKeypadFeedback}
                onDialDigit={softphone.handleDialDigit}
                onDeleteDialDigit={softphone.handleDeleteDialDigit}
                onClearDialpad={softphone.handleClearDialpad}
                onStartCall={softphone.handleStartCall}
                drivers={drivers}
                callerCrmContext={softphone.callerCrmContext}
                onRebookCallerRide={messaging.handleRebookFromCrm}
                onSelectThread={(target) => messaging.setSelectedContactPhone(target)}
              />
            )}

            {softphone.callsSubTab === 'history' && (
              <VoicemailCallLogPane
                mode="call_history"
                items={sync.filteredHistoryCalls}
                unreadCount={sync.unreadCountHistory}
                {...sharedLogProps}
              />
            )}

            {softphone.callsSubTab === 'missed' && (
              <VoicemailCallLogPane
                mode="call_missed"
                items={sync.filteredMissedCalls}
                unreadCount={sync.unreadCountMissed}
                {...sharedLogProps}
              />
            )}
          </div>
        )}

        {/* VIEW 4: VOICEMAIL INBOX */}
        {activeTab === 'voicemail' && !messaging.selectedContactPhone && (
          <VoicemailCallLogPane
            mode="voicemail"
            items={sync.filteredVoicemails}
            unreadCount={sync.unreadCountVoicemail}
            {...sharedLogProps}
          />
        )}

        {/* VIEW 5: MESSAGING LIST */}
        {activeTab === 'messages' && !messaging.selectedContactPhone && (
          <SmsThreadPane mode="list" {...sharedSmsThreadProps} />
        )}
      </div>

      {/* AGENT PHONE SETUP MODAL */}
      <AgentPhoneSetupModal
        isOpen={softphone.showAgentSetupModal}
        pendingCallTarget={softphone.pendingCallTarget}
        setupAgentPhoneInput={softphone.setupAgentPhoneInput}
        setupAgentPhoneError={softphone.setupAgentPhoneError}
        onChangeSetupAgentPhoneInput={(val) => {
          softphone.setSetupAgentPhoneInput(val);
          if (softphone.setupAgentPhoneError) softphone.setSetupAgentPhoneError(null);
        }}
        onSaveAndCall={softphone.handleSaveAgentAndCall}
        onClose={softphone.handleCloseAgentSetupModal}
        sheetDrag={commsSheetDrag}
      />

      {/* Contact Profile & Edit Modal */}
      <CommsContactModal
        isOpen={messaging.isContactEditOpen}
        contactEditForm={messaging.contactEditForm}
        setContactEditForm={messaging.setContactEditForm}
        contactSaveFeedback={messaging.contactSaveFeedback}
        activeContactPhoneFallback={messaging.activeContactSummary?.contactPhone || ''}
        corpSearchQuery={messaging.corpSearchQuery}
        onChangeCorpSearchQuery={messaging.setCorpSearchQuery}
        isCorpDropdownOpen={messaging.isCorpDropdownOpen}
        setIsCorpDropdownOpen={messaging.setIsCorpDropdownOpen}
        filteredCorpAccounts={messaging.filteredCorpAccounts}
        onAddPhone={messaging.handleAddPhone}
        onUpdatePhone={messaging.handleUpdatePhone}
        onRemovePhone={messaging.handleRemovePhone}
        onSaveContact={messaging.handleSaveContactFromHub}
        onClose={messaging.handleCloseContactEdit}
        sheetDrag={commsSheetDrag}
      />

      {/* ─── NEW SMS MESSAGE MODAL (Bottom-Docked Composer) ─── */}
      <NewSmsMessageModal
        isOpen={messaging.isNewMessageModalOpen}
        newMsgError={messaging.newMsgError}
        msgContactSearch={messaging.msgContactSearch}
        newMsgRecipientPhone={messaging.newMsgRecipientPhone}
        newMsgRecipientName={messaging.newMsgRecipientName}
        newMsgBody={messaging.newMsgBody}
        isSendingNewMsg={messaging.isSendingNewMsg}
        isMsgContactDropdownOpen={messaging.isMsgContactDropdownOpen}
        filteredContactsForMsg={messaging.filteredContactsForMsg}
        recipientCrmContext={messaging.newMsgRecipientCrmContext}
        onInsertTrackingLink={() => messaging.handleInsertTrackingLink('modal')}
        onInsertPayLink={() => messaging.handleInsertPayLink('modal')}
        isGeneratingPayLink={messaging.isGeneratingPayLink}
        onRecipientInputChange={(val) => {
          messaging.setMsgContactSearch(val);
          messaging.setNewMsgRecipientPhone(val);
          messaging.setIsMsgContactDropdownOpen(true);
          messaging.setNewMsgError(null);
        }}
        onRecipientInputFocus={() => messaging.setIsMsgContactDropdownOpen(true)}
        onSelectContactOption={(c) => {
          const chosenPhone = c.mobilePhone || c.phone;
          messaging.setNewMsgRecipientPhone(chosenPhone);
          messaging.setNewMsgRecipientName(c.name);
          messaging.setMsgContactSearch(`${c.name} (${chosenPhone})`);
          messaging.setIsMsgContactDropdownOpen(false);
          messaging.setNewMsgError(null);
        }}
        onBodyChange={(val) => {
          messaging.setNewMsgBody(val);
          messaging.setNewMsgError(null);
        }}
        onSelectPresetChip={messaging.setNewMsgBody}
        onOpenThread={messaging.handleOpenNewMessageThread}
        onSend={messaging.handleSendNewMessage}
        onClose={() => messaging.setIsNewMessageModalOpen(false)}
        sheetDrag={commsSheetDrag}
      />

      {/* ─── Standardized Floating Compose SMS Button (All / SMS stream views) ─── */}
      <MobileComposeSmsFab
        isVisible={
          !messaging.isNewMessageModalOpen &&
          !messaging.selectedContactPhone &&
          (activeTab === 'all' || activeTab === 'messages')
        }
        onOpenCompose={messaging.handleOpenFreshNewMessageModal}
      />

      {/* ─── Mobile-Native Comms Row Quick Action Bottom Sheet (Touch & Hold) ─── */}
      <CommsRowActionSheet
        event={triage.commsActionSheetEvent}
        onClose={() => triage.setCommsActionSheetEvent(null)}
        onCallBack={(target) => {
          triage.setCommsActionSheetEvent(null);
          void softphone.handleStartCall(target.contactPhone, target.contactName);
        }}
        onOpenThread={(target) => {
          triage.setCommsActionSheetEvent(null);
          const sel = resolveInteractionSelectorTarget(target);
          if (sel) messaging.setSelectedContactPhone(sel);
        }}
        onBookTrip={(target) => {
          triage.setCommsActionSheetEvent(null);
          if (target.suggestedBooking) {
            messaging.handleConvertVoicemailToBooking(target.suggestedBooking);
          } else {
            const payload = {
              passengerName: target.contactName,
              passengerPhone: target.contactPhone,
              passengerEmail: target.contactEmail,
            };
            getWorkspaceBus().publish('POPULATE_BOOKING', payload);
            onPopulateBooking?.(payload);
          }
        }}
        onToggleRead={(target) => {
          triage.setCommsActionSheetEvent(null);
          triage.handleToggleReadStatus(target.id);
        }}
        onSelectMultiple={(target) => {
          triage.setCommsActionSheetEvent(null);
          triage.setSelectedItemIds((prev) => {
            const next = new Set(prev);
            next.add(target.id);
            return next;
          });
        }}
        onArchive={(target) => {
          triage.setCommsActionSheetEvent(null);
          triage.handleArchiveItem(target.id);
        }}
        onOpenEmailInDock={(target) => {
          triage.setCommsActionSheetEvent(null);
          messaging.handleOpenEmailInDock(target);
        }}
        sheetDrag={commsSheetDrag}
      />
    </div>
  );
}

export const CommsHub = React.memo(CommsHubComponent);
