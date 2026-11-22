import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getWorkspaceBus, type UpcomingBookingPreview } from '../../../core/services/workspace-bus.service';
import { authorizedFetch } from '../../../core/services/auth/auth-headers';
import { normalizePhone } from '../../../core/services/passenger.service';
import { validatePhoneNumber, sanitizeToE164, formatDisplayPhone } from '../../../core/utils/phone';
import {
  PhoneIcon,
  ExternalLinkIcon,
  XIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
} from '../../ui/Icons';
import {
  getContactService,
  normalizeEmail,
  type ContactRecord,
  type AdditionalPhone,
} from '../../../core/services/customer/contact.service';
import {
  commsEventToInteractionEvent,
  getCommsThreadService,
  interactionEventToCommsEvent,
} from '../../../core/services/comms/comms-thread.service';
import {
  getAdminConfigService,
  DEFAULT_CORPORATE_ACCOUNTS,
} from '../../../core/services/config/admin-config.service';
import type { CorporateAccountConfig } from '../../../core/types/config';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';
import {
  STORAGE_KEY_INTERACTIONS,
  formatCallTimer,
  getClientTelephonyCredentials,
  getStoredTwilioCreds,
  type CallNotice,
  type CallStatus,
  type CallTypeFilter,
  type CallsSubTab,
  type ChannelFilter,
  type CommsHubProps,
  type CommsTab,
  type ContactFilter,
  type InteractionEvent,
  type PlaybackSpeed,
  type SoftphoneStatus,
  type ThreadTab,
} from './comms/comms-types';
import { SoftphoneDialerPane, AgentPhoneSetupModal } from './comms/SoftphoneDialerPane';
import {
  SmsThreadPane,
  NewSmsMessageModal,
  MobileComposeSmsFab,
} from './comms/SmsThreadPane';
import { VoicemailCallLogPane, CommsRowActionSheet } from './comms/VoicemailCallLogPane';
import { CommsContactModal } from './comms/comms-ContactModal';

export type {
  CommsTab,
  ChannelFilter,
  ContactFilter,
  InteractionEvent,
  CommsHubProps,
} from './comms/comms-types';
export { getClientTelephonyCredentials } from './comms/comms-types';

const INITIAL_INTERACTIONS: InteractionEvent[] = [];

function getInitialInteractions(): InteractionEvent[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_INTERACTIONS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(
            (p: any) =>
              !p?.snippet?.includes('Thank you for contacting our dispatch desk') &&
              !p?.id?.startsWith('sms_seed_') &&
              !p?.id?.startsWith('int-') &&
              p?.contactPhone !== '+13145551234'
          );
        }
      }
    } catch {}
  }
  return INITIAL_INTERACTIONS.filter(
    (p: any) =>
      !p?.snippet?.includes('Thank you for contacting our dispatch desk') &&
      !p?.id?.startsWith('sms_seed_') &&
      !p?.id?.startsWith('int-') &&
      p?.contactPhone !== '+13145551234'
  );
}

let ringtoneAudioCtx: any = null;
let ringtoneIntervalTimer: any = null;

function playInboundRingtone() {
  try {
    if (typeof window === 'undefined') return;
    const isMuted =
      localStorage.getItem('chesterfield_sound_muted') === 'true' ||
      localStorage.getItem('ct_dispatch_sound_muted') === 'true';
    if (isMuted) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!ringtoneAudioCtx || ringtoneAudioCtx.state === 'closed') {
      ringtoneAudioCtx = new AudioContextClass();
    }
    const ctx = ringtoneAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const ringCycle = () => {
      try {
        if (!ringtoneAudioCtx || ringtoneAudioCtx.state === 'closed') return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.setValueAtTime(0.18, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      } catch {}
    };

    ringCycle();
    if (ringtoneIntervalTimer) clearInterval(ringtoneIntervalTimer);
    ringtoneIntervalTimer = setInterval(ringCycle, 3800);
  } catch {}
}

function stopInboundRingtone() {
  try {
    if (ringtoneIntervalTimer) {
      clearInterval(ringtoneIntervalTimer);
      ringtoneIntervalTimer = null;
    }
    if (ringtoneAudioCtx) {
      ringtoneAudioCtx.close().catch(() => {});
      ringtoneAudioCtx = null;
    }
  } catch {}
}

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

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      if (initialTab === 'phone' && callStatus === 'idle') {
        setCallsSubTab('history');
      }
      onTabChange?.(initialTab);
    }
  }, [initialTab]);

  const handleSelectTab = (tab: CommsTab) => {
    setActiveTab(tab);
    if (tab === 'phone' && callStatus === 'idle') {
      setCallsSubTab('history');
    }
    onTabChange?.(tab);
  };

  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [callTypeFilter, setCallTypeFilter] = useState<CallTypeFilter>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Primary Interactions state (persisted to localStorage)
  const [interactions, setInteractions] = useState<InteractionEvent[]>(getInitialInteractions);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [forwardToast, setForwardToast] = useState<string | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Active call tracking & user notices
  const activeCallInteractionIdRef = useRef<string | null>(null);
  const [callNotice, setCallNotice] = useState<CallNotice | null>(null);

  // Sync interactions to localStorage on changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage && interactions.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_INTERACTIONS, JSON.stringify(interactions.slice(0, 100)));
      } catch {}
    }
  }, [interactions]);

  // Selected thread state
  const [selectedContactPhone, setSelectedContactPhone] = useState<string | null>(null);
  const [threadTab, setThreadTab] = useState<ThreadTab>('all');
  const [noteDraftText, setNoteDraftText] = useState('');
  const [smsReplyText, setSmsReplyText] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatusMessage, setSmsStatusMessage] = useState<string | null>(null);

  // Softphone state
  const [dialpadNumber, setDialpadNumber] = useState('');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [activeCallContact, setActiveCallContact] = useState<string | null>(null);
  const [activeCallPhone, setActiveCallPhone] = useState<string | null>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [showInCallKeypad, setShowInCallKeypad] = useState(false);
  const [showInCallTrips, setShowInCallTrips] = useState(false);
  const [showInCallNotes, setShowInCallNotes] = useState(false);
  const [inCallNoteText, setInCallNoteText] = useState('');
  const [bookingToast, setBookingToast] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [callsSubTab, setCallsSubTab] = useState<CallsSubTab>('history');
  const [activeKeypadFeedback, setActiveKeypadFeedback] = useState<string | null>(null);
  const [operatorPhoneInput, setOperatorPhoneInput] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('ct_dispatch_operator_phone') || '' : ''
  );
  const [isEditingOperatorPhone, setIsEditingOperatorPhone] = useState(false);
  const [showAgentSetupModal, setShowAgentSetupModal] = useState(false);
  const [pendingCallTarget, setPendingCallTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [setupAgentPhoneInput, setSetupAgentPhoneInput] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('ct_dispatch_operator_phone') || '' : ''
  );
  const [setupAgentPhoneError, setSetupAgentPhoneError] = useState<string | null>(null);
  const dialpadInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // In-Browser WebRTC Softphone state & refs
  const [softphoneStatus, setSoftphoneStatus] = useState<SoftphoneStatus>('unconfigured');
  const [incomingCallInfo, setIncomingCallInfo] = useState<{ from: string; callSid?: string } | null>(null);
  const deviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const incomingCallRef = useRef<any>(null);
  const handleEndCallRef = useRef<(broadcast?: boolean) => void>(() => {});
  const isMountedRef = useRef(true);
  const initWebRtcPromiseRef = useRef<Promise<any> | null>(null);

  // Audio voicemail & call recording playback state
  const [playingVoicemailId, setPlayingVoicemailId] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

  // Mobile long-press quick action sheet & multi-select gesture for Comms rows (scroll-safe)
  const [commsActionSheetEvent, setCommsActionSheetEvent] = useState<InteractionEvent | null>(null);
  const commsLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commsLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const commsLongPressTriggeredIdRef = useRef<string | null>(null);

  const cancelCommsLongPress = () => {
    if (commsLongPressTimerRef.current) {
      clearTimeout(commsLongPressTimerRef.current);
      commsLongPressTimerRef.current = null;
    }
    commsLongPressStartRef.current = null;
  };

  const handleCommsRowTouchStart = (event: InteractionEvent, e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a')) return;
    const touch = e.touches[0];
    if (!touch) return;
    cancelCommsLongPress();
    commsLongPressStartRef.current = { x: touch.clientX, y: touch.clientY };
    commsLongPressTimerRef.current = setTimeout(() => {
      commsLongPressTimerRef.current = null;
      commsLongPressStartRef.current = null;
      commsLongPressTriggeredIdRef.current = event.id;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(15);
        } catch {}
      }
      if (selectedItemIds.size > 0) {
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          if (next.has(event.id)) next.delete(event.id);
          else next.add(event.id);
          return next;
        });
      } else {
        setCommsActionSheetEvent(event);
      }
    }, 380);
  };

  const handleCommsRowTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!commsLongPressStartRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (
      Math.abs(touch.clientX - commsLongPressStartRef.current.x) > 10 ||
      Math.abs(touch.clientY - commsLongPressStartRef.current.y) > 10
    ) {
      cancelCommsLongPress();
    }
  };

  // Contact Profile & Edit modal in CommsHub
  const [isContactEditOpen, setIsContactEditOpen] = useState(false);
  const [contactEditForm, setContactEditForm] = useState<Partial<ContactRecord>>({});
  const [contactSaveFeedback, setContactSaveFeedback] = useState<string | null>(null);
  const [activeContactRecord, setActiveContactRecord] = useState<ContactRecord | null>(null);
  const [corporateAccountsList, setCorporateAccountsList] = useState<CorporateAccountConfig[]>(
    DEFAULT_CORPORATE_ACCOUNTS
  );
  const [corpSearchQuery, setCorpSearchQuery] = useState('');
  const [isCorpDropdownOpen, setIsCorpDropdownOpen] = useState(false);

  // New SMS composition modal state
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [newMsgRecipientPhone, setNewMsgRecipientPhone] = useState('');
  const [newMsgRecipientName, setNewMsgRecipientName] = useState('');
  const [newMsgBody, setNewMsgBody] = useState('');
  const [newMsgError, setNewMsgError] = useState<string | null>(null);
  const [isSendingNewMsg, setIsSendingNewMsg] = useState(false);
  const [allContactsForMsg, setAllContactsForMsg] = useState<ContactRecord[]>([]);
  const [msgContactSearch, setMsgContactSearch] = useState('');
  const [isMsgContactDropdownOpen, setIsMsgContactDropdownOpen] = useState(false);

  const commsSheetDrag = useBottomSheetDragToClose({
    onClose: () => {
      if (commsActionSheetEvent) {
        setCommsActionSheetEvent(null);
      } else if (isNewMessageModalOpen) {
        setIsNewMessageModalOpen(false);
      } else if (isContactEditOpen) {
        setIsCorpDropdownOpen(false);
        setIsContactEditOpen(false);
      } else if (showAgentSetupModal) {
        setShowAgentSetupModal(false);
        setPendingCallTarget(null);
        setSetupAgentPhoneError(null);
      }
    },
  });

  // Load corporate accounts from AdminConfigService
  useEffect(() => {
    getAdminConfigService()
      .getSettings()
      .then((settings) => {
        if (settings?.corporateAccounts && settings.corporateAccounts.length > 0) {
          setCorporateAccountsList(settings.corporateAccounts);
        }
      })
      .catch(() => {});
  }, []);

  const filteredCorpAccounts = useMemo(() => {
    const q = corpSearchQuery.toLowerCase().trim();
    if (!q) return corporateAccountsList.slice(0, 8);
    return corporateAccountsList
      .filter(
        (a) =>
          (a.accountNumber && a.accountNumber.toLowerCase().includes(q)) ||
          (a.companyName && a.companyName.toLowerCase().includes(q)) ||
          (a.billingContactName && a.billingContactName.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [corporateAccountsList, corpSearchQuery]);

  useEffect(() => {
    if (isNewMessageModalOpen) {
      try {
        const contacts = getContactService().getAllContacts();
        setAllContactsForMsg(contacts);
      } catch {}
    }
  }, [isNewMessageModalOpen]);

  const filteredContactsForMsg = useMemo(() => {
    const q = msgContactSearch.toLowerCase().trim();
    if (!q) return allContactsForMsg.slice(0, 8);
    return allContactsForMsg
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.mobilePhone && c.mobilePhone.includes(q)) ||
          (c.corporateAccountNumber || (c as any).accountNumber || '').toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [allContactsForMsg, msgContactSearch]);

  const handleOpenFreshNewMessageModal = () => {
    setNewMsgRecipientPhone('');
    setNewMsgRecipientName('');
    setNewMsgBody('');
    setNewMsgError(null);
    setMsgContactSearch('');
    setIsNewMessageModalOpen(true);
  };

  const handleSendNewMessage = async () => {
    const rawTarget = newMsgRecipientPhone.trim();
    if (!rawTarget) {
      setNewMsgError('Please select a contact or enter a phone number.');
      return;
    }
    const val = validatePhoneNumber(rawTarget);
    if (!val.isValid) {
      setNewMsgError(val.error || 'Please enter a valid 10-digit phone number.');
      return;
    }
    if (!newMsgBody.trim()) {
      setNewMsgError('Please enter a message text.');
      return;
    }

    setIsSendingNewMsg(true);
    setNewMsgError(null);

    const contact = getContactService().getContactByPhone(val.e164);
    const displayName = newMsgRecipientName.trim() || contact?.name || formatDisplayPhone(val.e164);
    const msgText = newMsgBody.trim();

    const newEvt: InteractionEvent = {
      id: `sms_out_${Date.now()}`,
      type: 'sms_outbound',
      contactName: displayName,
      contactPhone: val.e164,
      contactType: ((contact as any)?.type as any) || 'passenger',
      timestamp: 'Just now',
      timestampMs: Date.now(),
      snippet: msgText,
      isUnread: false,
    };

    setInteractions((prev) => [newEvt, ...prev]);

    try {
      const creds = getClientTelephonyCredentials();
      const twilioSid = creds.accountSid;
      const twilioToken = creds.authToken;
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: val.e164,
          body: msgText,
          credentials: {
            accountSid: twilioSid,
            authToken: twilioToken,
            phoneNumber: sanitizeToE164(twilioPhone),
          },
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.messageSid || resData.status) {
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === newEvt.id
              ? {
                  ...i,
                  id: resData.messageSid || i.id,
                  deliveryStatus: resData.status || (resData.success ? 'sent' : 'failed'),
                  errorCode: resData.code || resData.errorCode,
                  errorMessage: resData.error || resData.errorMessage,
                }
              : i
          )
        );
      }
      setTimeout(fetchTelephonyData, 1000);
    } catch {}

    setIsSendingNewMsg(false);
    setIsNewMessageModalOpen(false);
    setSelectedContactPhone(val.e164);
  };

  const handleOpenNewMessageThread = () => {
    const rawTarget = newMsgRecipientPhone.trim();
    if (!rawTarget) {
      setNewMsgError('Please select a contact or enter a phone number.');
      return;
    }
    const val = validatePhoneNumber(rawTarget);
    if (!val.isValid) {
      setNewMsgError(val.error || 'Please enter a valid 10-digit phone number.');
      return;
    }
    setIsNewMessageModalOpen(false);
    setSelectedContactPhone(val.e164);
  };

  // Message activity stream bottom anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Cross-Window Workspace Bus
  const workspaceBus = getWorkspaceBus();

  // Call duration counter
  useEffect(() => {
    let interval: any;
    if (callStatus === 'connected') {
      interval = setInterval(() => setCallTimer((prev) => prev + 1), 1000);
    } else if (callStatus === 'idle') {
      setCallTimer(0);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  // ─── Lazy Twilio WebRTC Softphone Initializer ───
  const ensureWebRtcDevice = async (): Promise<any | null> => {
    if (typeof window === 'undefined') return null;
    if (deviceRef.current) return deviceRef.current;
    if (initWebRtcPromiseRef.current) return initWebRtcPromiseRef.current;

    const creds = getClientTelephonyCredentials();
    if (!creds.accountSid || !creds.apiKeySid || !creds.apiKeySecret || !creds.twimlAppSid) {
      if (isMountedRef.current) setSoftphoneStatus('unconfigured');
      return null;
    }

    const initPromise = (async () => {
      try {
        if (isMountedRef.current) setSoftphoneStatus('initializing');
        const tokenResp = await authorizedFetch('/api/telephony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_voice_token',
            credentials: creds,
            identity: 'dispatch_agent',
          }),
        });

        if (!tokenResp.ok) {
          if (isMountedRef.current) setSoftphoneStatus('error');
          return null;
        }

        const tokenData = await tokenResp.json();
        if (!tokenData.success || !tokenData.token) {
          if (isMountedRef.current) setSoftphoneStatus('error');
          return null;
        }

        const { Device, Call } = await import('@twilio/voice-sdk');
        if (!isMountedRef.current) return null;

        const device = new Device(tokenData.token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          logLevel: 1,
        });
        deviceRef.current = device;

        device.on('registered', () => {
          if (isMountedRef.current) setSoftphoneStatus('ready');
        });

        device.on('error', (twErr: any) => {
          console.warn('Twilio Voice Device Error:', twErr);
          if (isMountedRef.current) setSoftphoneStatus('error');
        });

        device.on('incoming', (call: any) => {
          incomingCallRef.current = call;
          const callerNumber = call.parameters?.From || 'Incoming Passenger';
          const callSid = call.parameters?.CallSid;
          setIncomingCallInfo({ from: callerNumber, callSid });

          // Start audible ringtone & alert dispatch workspace
          playInboundRingtone();
          workspaceBus.publish('INCOMING_CALL', { from: callerNumber, callSid });

          call.on('disconnect', () => {
            stopInboundRingtone();
            setIncomingCallInfo(null);
            incomingCallRef.current = null;
            workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
            if (activeCallRef.current === call) {
              handleEndCallRef.current?.(true);
            }
          });

          call.on('error', (err: any) => {
            console.error('Incoming call error:', err);
            stopInboundRingtone();
            setIncomingCallInfo(null);
            incomingCallRef.current = null;
            workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
          });
        });

        await device.register();
        if (isMountedRef.current) setSoftphoneStatus('ready');
        return device;
      } catch (err) {
        console.warn('Twilio WebRTC init error:', err);
        if (isMountedRef.current) setSoftphoneStatus('error');
        return null;
      } finally {
        initWebRtcPromiseRef.current = null;
      }
    })();

    initWebRtcPromiseRef.current = initPromise;
    return initPromise;
  };

  // ─── Twilio WebRTC Device Initialization ───
  useEffect(() => {
    isMountedRef.current = true;
    ensureWebRtcDevice();

    return () => {
      isMountedRef.current = false;
      stopInboundRingtone();
      if (deviceRef.current) {
        try {
          deviceRef.current.destroy();
        } catch {}
        deviceRef.current = null;
      }
    };
  }, []);

  const handleAcceptIncomingCall = () => {
    stopInboundRingtone();
    workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
    const call = incomingCallRef.current;
    if (!call) return;
    const callerFrom = incomingCallInfo?.from || call.parameters?.From || 'Passenger';
    const displayNum = formatDisplayPhone(callerFrom);
    const callId = `call_${Date.now()}`;
    activeCallInteractionIdRef.current = callId;
    activeCallRef.current = call;

    call.accept();
    setIncomingCallInfo(null);
    setCallStatus('connected');
    setActiveCallContact(displayNum);
    setActiveCallPhone(callerFrom);
    setActiveCallSid(call.parameters?.CallSid || null);
    setActiveTab('phone');
    setCallsSubTab('keypad');

    setInteractions((prev) => [
      {
        id: callId,
        type: 'call_inbound',
        contactName: displayNum,
        contactPhone: callerFrom,
        contactType: 'passenger',
        timestamp: 'Just now',
        timestampMs: Date.now(),
        durationSeconds: 0,
        audioDuration: '0:00',
        snippet: `Inbound Call Answered (${displayNum})`,
        isUnread: false,
      },
      ...prev,
    ]);

    call.on('disconnect', () => {
      handleEndCallRef.current?.(true);
    });
  };

  const handleRejectIncomingCall = () => {
    stopInboundRingtone();
    workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
    const call = incomingCallRef.current;
    if (call) {
      try {
        call.reject();
      } catch {}
      incomingCallRef.current = null;
    }
    setIncomingCallInfo(null);
  };

  // Subscribe to CommsThreadService so unified Calls + SMS + Voicemails + Emails + Notes stay in sync
  useEffect(() => {
    const commsService = getCommsThreadService();
    if (interactions.length > 0 && commsService.getAllEvents().length === 0) {
      const seeded = interactions.map((item) => interactionEventToCommsEvent(item));
      commsService.hydrateFromServerSync({ events: seeded });
    }
    const unsub = commsService.subscribe(({ threads, events }) => {
      if (events.length === 0) return;
      const threadMap = new Map(threads.map((t) => [t.id, t]));
      const adapted = events.map((evt) =>
        commsEventToInteractionEvent(evt, threadMap.get(evt.threadId))
      );

      setInteractions((prev) => {
        const mergedById = new Map<string, InteractionEvent>();
        for (const item of prev) {
          // Avoid duplicating raw SID if deterministic prefixed ID exists
          const prefixedSms = `sms_${item.id}`;
          const prefixedCall = `call_${item.id}`;
          const prefixedVm = `vm_${item.id}`;
          if (
            adapted.some(
              (a) =>
                a.id === item.id ||
                a.id === prefixedSms ||
                a.id === prefixedCall ||
                a.id === prefixedVm
            )
          ) {
            continue;
          }
          mergedById.set(item.id, item);
        }
        for (const a of adapted) {
          mergedById.set(a.id, a);
        }
        return Array.from(mergedById.values()).sort(
          (x, y) => (y.timestampMs || 0) - (x.timestampMs || 0)
        );
      });
    });
    return () => unsub();
  }, []);

  // Subscribe to global workspace bus for cross-dock answering, rejection, and OPEN_COMMS_THREAD
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'ANSWER_INCOMING_CALL') {
        handleAcceptIncomingCall();
      } else if (msg.type === 'REJECT_INCOMING_CALL') {
        handleRejectIncomingCall();
      } else if (msg.type === 'OPEN_COMMS_THREAD') {
        const p = msg.payload;
        const resolvedThread = getCommsThreadService().findThread({
          threadId: p.threadId,
          phone: p.phone,
          email: p.email,
        });
        const targetSelector =
          resolvedThread?.primaryPhone ||
          p.phone ||
          resolvedThread?.primaryEmail ||
          p.email ||
          resolvedThread?.id ||
          p.threadId ||
          null;
        if (targetSelector) {
          setSelectedContactPhone(targetSelector);
          if (p.tab) {
            setThreadTab(p.tab);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  // Audio element player effect (uses server-signed audioUrl with sig + exp whenever available)
  useEffect(() => {
    if (!audioPlayerRef.current) return;
    const player = audioPlayerRef.current;

    let targetUrl: string | null = null;
    if (playingVoicemailId) {
      const vm = interactions.find((i) => i.id === playingVoicemailId);
      targetUrl =
        vm?.audioUrl ||
        (vm?.recordingSid
          ? `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(vm.recordingSid)}`
          : null);
    } else if (playingCallId) {
      const call = interactions.find((i) => i.id === playingCallId);
      targetUrl =
        call?.audioUrl ||
        (call?.recordingSid
          ? `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(
              call.recordingSid
            )}`
          : null);
    }

    if (targetUrl) {
      player.src = targetUrl;
      player.playbackRate = playbackSpeed;
      player.onended = () => {
        setPlayingVoicemailId(null);
        setPlayingCallId(null);
      };
      player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, [playingVoicemailId, playingCallId, playbackSpeed, interactions]);

  // Stable telephony & unified comms fetcher (sync_comms + voicemails, messages, call recordings)
  const fetchTelephonyData = async () => {
    try {
      const [syncResp, vmResp, msgResp, recResp] = await Promise.all([
        authorizedFetch('/api/telephony?action=sync_comms'),
        authorizedFetch('/api/telephony?action=list_voicemails'),
        authorizedFetch('/api/telephony?action=list_messages'),
        authorizedFetch('/api/telephony?action=list_recordings'),
      ]);

      if (syncResp.ok) {
        const syncData = (await syncResp.json()) as any;
        if (syncData?.success) {
          getCommsThreadService().hydrateFromServerSync({
            threads: syncData.threads,
            events: syncData.events,
          });
        }
      }

      if (vmResp.ok) {
        const vmData = (await vmResp.json()) as any;
        if (vmData.success && Array.isArray(vmData.voicemails)) {
          setInteractions((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newVms = vmData.voicemails
              .filter((v: any) => !existingIds.has(v.id))
              .map((v: any) => ({
                id: v.id,
                type: 'voicemail' as const,
                contactName: v.contactName,
                contactPhone: v.contactPhone,
                contactType: (v.contactType as InteractionEvent['contactType']) || 'passenger',
                timestamp: v.timestamp,
                timestampMs: v.timestampMs || Date.now(),
                durationSeconds: parseInt(v.audioDuration || '30', 10),
                audioDuration: v.audioDuration || '0:30',
                snippet: `Voicemail: ${v.transcription ? v.transcription.slice(0, 50) + '...' : 'Audio message'}`,
                transcription: v.transcription,
                recordingSid: v.recordingSid,
                suggestedBooking: v.suggestedBooking,
                isUnread: v.isUnread ?? true,
              }));
            if (newVms.length === 0) return prev;
            return [...newVms, ...prev];
          });
        }
      }

      if (msgResp.ok) {
        const msgData = (await msgResp.json()) as any;
        if (msgData.success && Array.isArray(msgData.messages)) {
          setInteractions((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newMsgs: InteractionEvent[] = [];
            let hasNewInbound = false;
            let hasStateUpdates = false;
            const updatedPrev = [...prev];

            msgData.messages.forEach((m: any) => {
              if (m.body?.includes('Thank you for contacting our dispatch desk')) {
                return;
              }

              const phone = m.direction === 'inbound' ? m.from : m.to;

              // Check if already in state by Twilio SID - update status & error info if changed
              const existingIdx = updatedPrev.findIndex((p) => p.id === m.id);
              if (existingIdx !== -1) {
                const existing = updatedPrev[existingIdx];
                if (
                  (m.status && existing.deliveryStatus !== m.status) ||
                  (m.errorCode !== undefined && existing.errorCode !== m.errorCode) ||
                  (m.errorMessage !== undefined && existing.errorMessage !== m.errorMessage)
                ) {
                  hasStateUpdates = true;
                  updatedPrev[existingIdx] = {
                    ...existing,
                    deliveryStatus: m.status || existing.deliveryStatus,
                    errorCode: m.errorCode !== undefined ? m.errorCode : existing.errorCode,
                    errorMessage:
                      m.errorMessage !== undefined ? m.errorMessage : existing.errorMessage,
                  };
                }
                return;
              }

              // Reconcile optimistic outbound messages
              const optimisticIdx = updatedPrev.findIndex(
                (p) =>
                  p.id.startsWith('sms_out_') &&
                  normalizePhone(p.contactPhone) === normalizePhone(phone) &&
                  p.snippet === m.body &&
                  Math.abs((p.timestampMs || 0) - (m.timestampMs || 0)) < 120000
              );

              if (optimisticIdx !== -1) {
                hasStateUpdates = true;
                updatedPrev[optimisticIdx] = {
                  ...updatedPrev[optimisticIdx],
                  id: m.id,
                  deliveryStatus: m.status || updatedPrev[optimisticIdx].deliveryStatus,
                  errorCode:
                    m.errorCode !== undefined
                      ? m.errorCode
                      : updatedPrev[optimisticIdx].errorCode,
                  errorMessage:
                    m.errorMessage !== undefined
                      ? m.errorMessage
                      : updatedPrev[optimisticIdx].errorMessage,
                };
                existingIds.add(m.id);
                return;
              }

              const contact = getContactService().getContactByPhone(phone);
              const displayName = contact?.name || formatDisplayPhone(phone);

              if (m.direction === 'inbound') {
                hasNewInbound = true;
              }

              newMsgs.push({
                id: m.id,
                type: (m.direction === 'inbound' ? 'sms_inbound' : 'sms_outbound') as any,
                contactName: displayName,
                contactPhone: phone,
                contactType: ((contact as any)?.type as any) || 'passenger',
                timestamp: m.timestamp,
                timestampMs: m.timestampMs || Date.now(),
                snippet: m.body,
                deliveryStatus: m.status,
                errorCode: m.errorCode,
                errorMessage: m.errorMessage,
                isUnread: m.direction === 'inbound' ? (m.isUnread ?? true) : false,
              });
            });

            if (newMsgs.length === 0 && !hasStateUpdates) return prev;

            // Trigger gentle chime for new inbound SMS if supported
            if (hasNewInbound && typeof window !== 'undefined') {
              try {
                const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtxClass) {
                  const audioCtx = new AudioCtxClass();
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
                  osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
                  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.3);
                }
              } catch {}
            }

            return [...newMsgs, ...updatedPrev].sort(
              (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
            );
          });
        }
      }

      if (recResp.ok) {
        const recData = (await recResp.json()) as any;
        if (recData.success && Array.isArray(recData.recordings)) {
          setInteractions((prev) => {
            let anyRecAttached = false;
            const updated = prev.map((item) => {
              if (item.type.startsWith('call_')) {
                const match = recData.recordings.find(
                  (r: any) =>
                    (item.callSid && r.callSid === item.callSid) ||
                    (item.recordingSid && r.sid === item.recordingSid)
                );
                if (
                  match &&
                  (item.recordingSid !== match.sid ||
                    item.audioUrl !== match.audioUrl ||
                    item.durationSeconds !== match.durationSeconds)
                ) {
                  anyRecAttached = true;
                  return {
                    ...item,
                    recordingSid: match.sid,
                    audioDuration: match.duration,
                    durationSeconds: match.durationSeconds,
                    audioUrl: match.audioUrl,
                  };
                }
              }
              return item;
            });

            // Insert unattached recordings as recent recorded calls
            const existingRecSids = new Set(updated.map((u) => u.recordingSid).filter(Boolean));
            const unattached: InteractionEvent[] = recData.recordings
              .filter((r: any) => !existingRecSids.has(r.sid))
              .map((r: any) => ({
                id: `rec_${r.sid}`,
                type: 'call_inbound' as const,
                contactName: 'Recorded Call',
                contactPhone: '+13147391800',
                contactType: 'passenger' as const,
                recordingSid: r.sid,
                audioDuration: r.duration,
                durationSeconds: r.durationSeconds,
                audioUrl: r.audioUrl,
                timestamp: r.dateCreated
                  ? new Date(r.dateCreated).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'Recent',
                timestampMs: r.dateCreated ? new Date(r.dateCreated).getTime() : Date.now(),
                snippet: `Call Recording (${r.duration})`,
                isUnread: false,
              }));

            if (!anyRecAttached && unattached.length === 0) return prev;
            return [...unattached, ...updated];
          });
        }
      }
    } catch {
      // Fallback
    }
  };

  // Poll every 12s when Phone drawer is actively open, 45s when hidden, and pause when tab is backgrounded
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const lastTelephonyFetchRef = useRef<number>(0);

  useEffect(() => {
    const runFetchIfEligible = (force = false) => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      const minGap = isVisibleRef.current ? 10_000 : 40_000;
      if (!force && now - lastTelephonyFetchRef.current < minGap) return;
      lastTelephonyFetchRef.current = now;
      fetchTelephonyData();
    };

    runFetchIfEligible(true);

    const interval = setInterval(() => {
      runFetchIfEligible(false);
    }, 12_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Immediately refresh once when the dispatcher opens the Phone drawer
  useEffect(() => {
    if (isVisible) {
      const now = Date.now();
      if (now - lastTelephonyFetchRef.current > 4_000) {
        lastTelephonyFetchRef.current = now;
        fetchTelephonyData();
      }
    }
  }, [isVisible]);

  // Focus dialpad input ONLY when the Phone drawer is actually visible and on keypad sub-tab
  useEffect(() => {
    if (isVisible && activeTab === 'phone' && callsSubTab === 'keypad') {
      const timer = setTimeout(() => {
        dialpadInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, activeTab, callsSubTab]);

  // Physical keyboard dialing response (ONLY active when CommsHub is actually visible!)
  useEffect(() => {
    if (!isVisible || activeTab !== 'phone') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT' && target !== dialpadInputRef.current) {
        return;
      }
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const validDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#', '+'];

      if (validDigits.includes(e.key)) {
        e.preventDefault();
        setDialpadNumber((prev) => prev + e.key);
        setActiveKeypadFeedback(e.key);
        setTimeout(() => setActiveKeypadFeedback(null), 150);
      } else if (e.key === 'Backspace') {
        if (target !== dialpadInputRef.current) {
          e.preventDefault();
          setDialpadNumber((prev) => prev.slice(0, -1));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dialpadNumber.trim()) {
          handleStartCall();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, activeTab, dialpadNumber]);

  // Listen for bus incoming call events
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'CALL_INCOMING') {
        const payload = msg.payload;
        setActiveCallContact(payload.callerName || payload.callerNumber);
        setDialpadNumber(payload.callerNumber);
      }
    });
    return unsub;
  }, [workspaceBus]);

  // Filter interaction items helper
  const filterItem = (item: InteractionEvent) => {
    if (filterUnreadOnly && !item.isUnread) return false;

    if (
      contactFilter === 'passengers' &&
      item.contactType !== 'passenger' &&
      item.contactType !== 'corporate'
    ) {
      return false;
    }
    if (contactFilter === 'drivers' && item.contactType !== 'driver') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (item.contactName || '').toLowerCase().includes(q);
      const matchPhone = (item.contactPhone || '').includes(q);
      const matchSnippet = (item.snippet || '').toLowerCase().includes(q);
      const matchTranscript = (item.transcription || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchSnippet && !matchTranscript) return false;
    }
    return true;
  };

  const allHistoryCalls = useMemo(
    () => interactions.filter((item) => item.type.startsWith('call_')),
    [interactions]
  );
  const allMissedCalls = useMemo(
    () => interactions.filter((item) => item.type === 'call_missed'),
    [interactions]
  );
  const allVoicemails = useMemo(
    () => interactions.filter((item) => item.type === 'voicemail'),
    [interactions]
  );
  const allMessages = useMemo(
    () =>
      interactions.filter(
        (item) =>
          item.type.startsWith('sms_') &&
          !item.snippet?.includes('Thank you for contacting our dispatch desk')
      ),
    [interactions]
  );

  const filteredAllInteractions = useMemo(() => {
    return interactions.filter((item) => {
      if (item.snippet?.includes('Thank you for contacting our dispatch desk')) return false;
      if (channelFilter === 'calls' && !item.type.startsWith('call_')) return false;
      if (channelFilter === 'voicemail' && item.type !== 'voicemail') return false;
      if (channelFilter === 'messages' && !item.type.startsWith('sms_')) return false;
      if (channelFilter === 'emails' && !item.type.startsWith('email_')) return false;
      if (channelFilter === 'notes' && item.type !== 'internal_note') return false;
      return filterItem(item);
    });
  }, [interactions, channelFilter, filterUnreadOnly, contactFilter, searchQuery]);

  const filteredHistoryCalls = useMemo(() => {
    return allHistoryCalls.filter((item) => {
      if (callTypeFilter === 'inbound' && item.type !== 'call_inbound') return false;
      if (callTypeFilter === 'outbound' && item.type !== 'call_outbound') return false;
      if (callTypeFilter === 'missed' && item.type !== 'call_missed') return false;
      return filterItem(item);
    });
  }, [allHistoryCalls, callTypeFilter, filterUnreadOnly, contactFilter, searchQuery]);

  const filteredMissedCalls = useMemo(
    () => allMissedCalls.filter(filterItem),
    [allMissedCalls, filterUnreadOnly, contactFilter, searchQuery]
  );
  const filteredVoicemails = useMemo(
    () => allVoicemails.filter(filterItem),
    [allVoicemails, filterUnreadOnly, contactFilter, searchQuery]
  );
  const filteredMessages = useMemo(
    () => allMessages.filter(filterItem),
    [allMessages, filterUnreadOnly, contactFilter, searchQuery]
  );

  const threadUnreadCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const msg of allMessages) {
      if (msg.isUnread) {
        const norm = normalizePhone(msg.contactPhone) || msg.contactPhone;
        map.set(norm, (map.get(norm) || 0) + 1);
      }
    }
    return map;
  }, [allMessages]);

  const messageConversations = useMemo(() => {
    const threadMap = new Map<string, InteractionEvent>();
    for (const msg of filteredMessages) {
      const norm = normalizePhone(msg.contactPhone) || msg.contactPhone;
      if (!norm) continue;
      const existing = threadMap.get(norm);
      if (!existing || (msg.timestampMs || 0) > (existing.timestampMs || 0)) {
        threadMap.set(norm, msg);
      }
    }
    return Array.from(threadMap.values()).sort(
      (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
    );
  }, [filteredMessages]);

  // Active items for current view
  const currentTabItems = useMemo(() => {
    if (activeTab === 'all') return filteredAllInteractions;
    if (activeTab === 'phone') {
      if (callsSubTab === 'history') return filteredHistoryCalls;
      if (callsSubTab === 'missed') return filteredMissedCalls;
      return [];
    }
    if (activeTab === 'voicemail') return filteredVoicemails;
    if (activeTab === 'messages') return messageConversations;
    return filteredAllInteractions;
  }, [
    activeTab,
    callsSubTab,
    filteredAllInteractions,
    filteredHistoryCalls,
    filteredMissedCalls,
    filteredVoicemails,
    messageConversations,
  ]);

  const unreadCountAll = useMemo(() => interactions.filter((i) => i.isUnread).length, [interactions]);
  const unreadCountHistory = useMemo(
    () => allHistoryCalls.filter((i) => i.isUnread).length,
    [allHistoryCalls]
  );
  const unreadCountMissed = useMemo(
    () => allMissedCalls.filter((i) => i.isUnread).length,
    [allMissedCalls]
  );
  const unreadCountVoicemail = useMemo(
    () => allVoicemails.filter((i) => i.isUnread).length,
    [allVoicemails]
  );
  const unreadCountMessages = useMemo(
    () => allMessages.filter((i) => i.isUnread).length,
    [allMessages]
  );

  // Broadcast live unread count changes ONLY when counts actually change
  const lastBroadcastCountsRef = useRef<string>('');
  useEffect(() => {
    const key = `${unreadCountMessages}|${unreadCountMissed}|${unreadCountVoicemail}`;
    if (lastBroadcastCountsRef.current === key) return;
    lastBroadcastCountsRef.current = key;
    workspaceBus.publish('UNREAD_COUNTS_CHANGED', {
      unreadMessages: unreadCountMessages,
      missedCalls: unreadCountMissed,
      unreadVoicemails: unreadCountVoicemail,
    });
  }, [workspaceBus, unreadCountMessages, unreadCountMissed, unreadCountVoicemail]);

  // Master checkbox selection calculation for active tab
  const isAllSelected =
    currentTabItems.length > 0 && currentTabItems.every((item) => selectedItemIds.has(item.id));
  const isSomeSelected =
    currentTabItems.some((item) => selectedItemIds.has(item.id)) && !isAllSelected;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        currentTabItems.forEach((i) => next.delete(i.id));
        return next;
      });
    } else {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        currentTabItems.forEach((i) => next.add(i.id));
        return next;
      });
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatchMarkRead = () => {
    const ids = Array.from(selectedItemIds);
    setInteractions((prev) =>
      prev.map((item) => (selectedItemIds.has(item.id) ? { ...item, isUnread: false } : item))
    );
    void getCommsThreadService().markEventsRead(ids);
    setSelectedItemIds(new Set());
  };

  const handleBatchMarkUnread = () => {
    const ids = Array.from(selectedItemIds);
    setInteractions((prev) =>
      prev.map((item) => (selectedItemIds.has(item.id) ? { ...item, isUnread: true } : item))
    );
    void getCommsThreadService().markEventsUnread(ids);
    setSelectedItemIds(new Set());
  };

  const handleBatchArchive = () => {
    const ids = Array.from(selectedItemIds);
    setInteractions((prev) => prev.filter((item) => !selectedItemIds.has(item.id)));
    void getCommsThreadService().archiveEvents(ids);
    setSelectedItemIds(new Set());
  };

  const handleToggleReadStatus = (id: string) => {
    setInteractions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isUnread: !item.isUnread } : item))
    );
    void getCommsThreadService().toggleEventReadStatus(id);
  };

  const handleArchiveItem = (id: string) => {
    setInteractions((prev) => prev.filter((item) => item.id !== id));
    void getCommsThreadService().archiveEvents([id]);
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleForwardItem = (item: InteractionEvent) => {
    const text = `[Chesterfield Taxi Comms Record]\nContact: ${item.contactName} (${item.contactPhone})\nTime: ${item.timestamp}\nType: ${item.type}\nContent: ${item.transcription || item.snippet}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setForwardToast(`Copied ${item.contactName}'s comms log to clipboard`);
      setTimeout(() => setForwardToast(null), 2500);
    }
  };

  // Sync threadTab when activeTab changes or new contact selected
  useEffect(() => {
    if (activeTab === 'messages') {
      setThreadTab('sms');
    } else if (activeTab === 'phone') {
      setThreadTab('calls');
    } else {
      setThreadTab('all');
    }
  }, [activeTab, selectedContactPhone]);

  // Resolve active unified thread across phone, email, and canonical threadId
  const activeUnifiedThread = useMemo(() => {
    if (!selectedContactPhone) return null;
    const isEmailSel = selectedContactPhone.includes('@');
    const isThreadSel = selectedContactPhone.startsWith('thr_');
    return getCommsThreadService().findThread({
      threadId: isThreadSel ? selectedContactPhone : undefined,
      phone: !isEmailSel && !isThreadSel ? selectedContactPhone : undefined,
      email: isEmailSel ? selectedContactPhone : undefined,
    });
  }, [selectedContactPhone, interactions]);

  // Selected contact thread all interactions (spanning Calls + SMS + Voicemails + Emails + Notes)
  const allSelectedContactInteractions = useMemo(() => {
    if (!selectedContactPhone) return [];
    const normTarget = normalizePhone(selectedContactPhone);
    const normEmailTarget = normalizeEmail(selectedContactPhone);
    const resolvedContact =
      (normTarget ? getContactService().getContactByPhone(selectedContactPhone) : null) ||
      (normEmailTarget ? getContactService().getContactByEmail(selectedContactPhone) : null) ||
      (activeUnifiedThread?.contactId
        ? getContactService().getContactById(activeUnifiedThread.contactId)
        : null);
    const resolvedContactNormPhone = resolvedContact?.phone
      ? normalizePhone(resolvedContact.phone)
      : '';
    const resolvedContactNormEmail = normalizeEmail(resolvedContact?.email);

    return interactions
      .filter((i) => {
        if (i.snippet?.includes('Thank you for contacting our dispatch desk')) return false;
        if (activeUnifiedThread && i.threadId === activeUnifiedThread.id) return true;
        if (selectedContactPhone.startsWith('thr_') && i.threadId === selectedContactPhone) {
          return true;
        }
        const normContact = normalizePhone(i.contactPhone);
        const normMobile = i.mobilePhone ? normalizePhone(i.mobilePhone) : '';
        const normHome = i.homePhone ? normalizePhone(i.homePhone) : '';
        const normItemEmail = normalizeEmail(i.contactEmail);

        return (
          (normTarget &&
            (normContact === normTarget ||
              normMobile === normTarget ||
              normHome === normTarget)) ||
          (resolvedContactNormPhone && normContact === resolvedContactNormPhone) ||
          (normEmailTarget && normItemEmail === normEmailTarget) ||
          (resolvedContactNormEmail && normItemEmail === resolvedContactNormEmail)
        );
      })
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  }, [interactions, selectedContactPhone, activeUnifiedThread]);

  // Filtered interactions according to the thread's active sub-tab
  const selectedInteractions = useMemo(() => {
    if (threadTab === 'sms') {
      return allSelectedContactInteractions.filter((i) => i.type.startsWith('sms_'));
    }
    if (threadTab === 'calls') {
      return allSelectedContactInteractions.filter(
        (i) => i.type.startsWith('call_') || i.type === 'voicemail'
      );
    }
    if (threadTab === 'emails') {
      return allSelectedContactInteractions.filter((i) => i.type.startsWith('email_'));
    }
    if (threadTab === 'notes') {
      return allSelectedContactInteractions.filter((i) => i.type === 'internal_note');
    }
    return allSelectedContactInteractions;
  }, [allSelectedContactInteractions, threadTab]);

  const threadSmsCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type.startsWith('sms_')).length,
    [allSelectedContactInteractions]
  );
  const threadCallCount = useMemo(
    () =>
      allSelectedContactInteractions.filter(
        (i) => i.type.startsWith('call_') || i.type === 'voicemail'
      ).length,
    [allSelectedContactInteractions]
  );
  const threadEmailCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type.startsWith('email_')).length,
    [allSelectedContactInteractions]
  );
  const threadNoteCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type === 'internal_note').length,
    [allSelectedContactInteractions]
  );
  const has10DlcBlockedMessages = useMemo(
    () =>
      allSelectedContactInteractions.some(
        (i) =>
          i.type === 'sms_outbound' &&
          (i.errorCode === 30034 || i.errorCode === '30034' || i.deliveryStatus === 'undelivered')
      ),
    [allSelectedContactInteractions]
  );

  // Active contact summary
  const activeContactSummary = useMemo(() => {
    const lastEvt = allSelectedContactInteractions[allSelectedContactInteractions.length - 1];
    const contactRec = selectedContactPhone
      ? getContactService().getContactByPhone(selectedContactPhone)
      : null;
    const resolvedName =
      activeContactRecord?.name ||
      contactRec?.name ||
      lastEvt?.contactName ||
      (selectedContactPhone ? formatDisplayPhone(selectedContactPhone) : 'Contact');

    if (lastEvt) {
      return {
        ...lastEvt,
        contactName: resolvedName,
      };
    }
    if (selectedContactPhone) {
      return {
        id: `contact_${selectedContactPhone}`,
        type: 'call_inbound' as const,
        contactName: resolvedName,
        contactPhone: selectedContactPhone,
        contactType: 'passenger' as const,
        timestamp: 'Recent',
        timestampMs: Date.now(),
        snippet: 'Direct contact thread',
      } as InteractionEvent;
    }
    return null;
  }, [allSelectedContactInteractions, selectedContactPhone, activeContactRecord]);

  // Sync activeContactRecord from ContactService whenever contact changes
  useEffect(() => {
    if (!selectedContactPhone) {
      setActiveContactRecord(null);
      return;
    }
    const contactService = getContactService();
    const found =
      contactService.getContactByPhone(selectedContactPhone) ||
      contactService.getContactByEmail(selectedContactPhone) ||
      (activeUnifiedThread?.contactId
        ? contactService.getContactById(activeUnifiedThread.contactId)
        : null);
    if (found) {
      setActiveContactRecord(found);
    } else {
      setActiveContactRecord({
        id: `temp_${Date.now()}`,
        name: activeContactSummary?.contactName || formatDisplayPhone(selectedContactPhone),
        phone: selectedContactPhone,
        email: '',
        isVip: false,
        preferredVehicleTier: 'standard',
        notes: '',
        customerScore: 90,
        tripCount: 1,
        totalSpend: 0,
        createdAt: new Date().toISOString(),
        updatedAt: Date.now(),
      });
    }
  }, [selectedContactPhone, activeContactSummary?.contactName]);

  // Listen to CONTACT_UPDATED events across tabs
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'CONTACT_UPDATED') {
        const contact = msg.payload?.contact;
        if (contact && selectedContactPhone) {
          if (normalizePhone(contact.phone) === normalizePhone(selectedContactPhone)) {
            setActiveContactRecord(contact);
          }
        }
      }
    });
    return () => unsub();
  }, [selectedContactPhone]);

  // Auto-scroll to latest message at the bottom of the conversation thread
  useEffect(() => {
    if (selectedContactPhone && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedContactPhone, selectedInteractions.length]);

  // Check upcoming bookings for the active contact
  const upcomingBookingsForContact: UpcomingBookingPreview[] = [];
  if (activeContactSummary) {
    trips.forEach((t) => {
      const passengerPhone = t.passenger?.phone || '';
      if (
        normalizePhone(passengerPhone) === normalizePhone(activeContactSummary.contactPhone) ||
        (activeContactSummary.mobilePhone &&
          normalizePhone(passengerPhone) === normalizePhone(activeContactSummary.mobilePhone))
      ) {
        upcomingBookingsForContact.push({
          id: t.id,
          time: t.scheduledPickupTime
            ? new Date(t.scheduledPickupTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'ASAP',
          pickupAddress: t.pickupLocation?.address || 'Pickup Point',
          dropoffAddress: t.dropoffLocation?.address || 'Destination',
          fare: t.pricing?.totalFare ?? 0,
        });
      }
    });
  }

  // Check matching caller trips for active in-call phone
  const activeCallerPhoneClean = (activeCallPhone || dialpadNumber || '')
    .replace(/\D/g, '')
    .slice(-10);
  const matchingCallerTrips: UpcomingBookingPreview[] = [];
  if (activeCallerPhoneClean) {
    trips.forEach((t) => {
      const passengerPhone = (t.passenger?.phone || (t as any).passengerPhone || '')
        .replace(/\D/g, '')
        .slice(-10);
      if (passengerPhone && passengerPhone === activeCallerPhoneClean) {
        matchingCallerTrips.push({
          id: t.id,
          time: t.scheduledPickupTime
            ? new Date(t.scheduledPickupTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'ASAP',
          pickupAddress: t.pickupLocation?.address || 'Pickup Point',
          dropoffAddress: t.dropoffLocation?.address || 'Destination',
          fare: t.pricing?.totalFare ?? 0,
        });
      }
    });
  }

  const handleDialDigit = (digit: string) => {
    setDialpadNumber((prev) => prev + digit);
  };

  const handleSaveAgentAndCall = () => {
    const trimmed = setupAgentPhoneInput.trim();
    if (!trimmed) {
      setSetupAgentPhoneError('Please enter your mobile or desk phone number.');
      return;
    }
    const validated = validatePhoneNumber(trimmed);
    if (!validated.isValid) {
      setSetupAgentPhoneError(
        validated.error || 'Please enter a valid 10-digit phone number (e.g. 314-555-0100).'
      );
      return;
    }
    const cleanE164 = validated.e164;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('ct_dispatch_operator_phone', cleanE164);
    }
    setOperatorPhoneInput(cleanE164);
    setSetupAgentPhoneError(null);
    setShowAgentSetupModal(false);

    if (pendingCallTarget) {
      const target = pendingCallTarget;
      setPendingCallTarget(null);
      setTimeout(() => {
        handleStartCall(target.phone, target.name);
      }, 50);
    }
  };

  const handleStartCall = async (numberToCall?: string, contactName?: string) => {
    const num = numberToCall || dialpadNumber;
    if (!num.trim()) return;

    const phoneValidation = validatePhoneNumber(num);
    const targetE164 = phoneValidation.isValid ? phoneValidation.e164 : sanitizeToE164(num);
    const displayNum = phoneValidation.isValid ? formatDisplayPhone(phoneValidation.e164) : num;
    const callerDisplayName = contactName || displayNum;
    const creds = getClientTelephonyCredentials();
    const hasWebRtcCreds = Boolean(
      creds.accountSid && creds.apiKeySid && creds.apiKeySecret && creds.twimlAppSid
    );

    let activeDevice = deviceRef.current && softphoneStatus === 'ready' ? deviceRef.current : null;
    if (!activeDevice && hasWebRtcCreds && softphoneStatus !== 'error') {
      activeDevice = await ensureWebRtcDevice();
    }

    // ─── 1. TRUE IN-BROWSER WEBRTC SOFTPHONE (Direct Computer Mic & Headset) ───
    if (activeDevice) {
      const callId = `call_${Date.now()}`;
      activeCallInteractionIdRef.current = callId;

      setCallStatus('calling');
      setActiveCallContact(callerDisplayName);
      setActiveCallPhone(targetE164);
      setCallNotice({
        type: 'info',
        message: `Connecting live audio via computer microphone & headset to ${displayNum}...`,
      });
      setShowInCallKeypad(false);
      setShowInCallTrips(false);
      setShowInCallNotes(false);

      // Switch view to phone/keypad so in-call screen displays immediately
      setActiveTab('phone');
      setCallsSubTab('keypad');

      const newCallRecord: InteractionEvent = {
        id: callId,
        type: 'call_outbound',
        contactName: callerDisplayName,
        contactPhone: targetE164,
        contactType: 'passenger',
        timestamp: 'Just now',
        timestampMs: Date.now(),
        durationSeconds: 0,
        audioDuration: '0:00',
        snippet: `Outbound Call (${displayNum})`,
        isUnread: false,
      };
      setInteractions((prev) => [newCallRecord, ...prev]);

      workspaceBus.publish('CALL_OUTBOUND_STARTED', {
        targetNumber: targetE164,
        contactName: callerDisplayName,
      });

      try {
        const call = await activeDevice.connect({
          params: {
            To: targetE164,
            FromNumber: creds.phoneNumber,
            CallerId: creds.phoneNumber,
          },
        });
        activeCallRef.current = call;

        call.on('accept', () => {
          setCallStatus('connected');
          const twCallSid = call.parameters?.CallSid || null;
          setActiveCallSid(twCallSid);
          setCallNotice({
            type: 'info',
            message: `Connected via Browser Softphone. Audio live through headset.`,
          });
          setInteractions((prev) =>
            prev.map((i) =>
              i.id === callId
                ? {
                    ...i,
                    recordingSid: twCallSid || undefined,
                    snippet: `Outbound Call Connected (${displayNum})`,
                  }
                : i
            )
          );
          if (twCallSid) {
            workspaceBus.publish('CALL_ANSWERED', {
              callSid: twCallSid,
              callerNumber: targetE164,
            });
          }
        });

        call.on('disconnect', () => {
          handleEndCallRef.current?.(true);
        });

        call.on('error', (callErr: any) => {
          console.error('Softphone call connection error:', callErr);
          handleEndCallRef.current?.(false);
          setCallNotice({
            type: 'warning',
            message:
              callErr?.message || 'Softphone audio error. Check microphone permissions.',
          });
        });
      } catch (err: any) {
        console.error('Failed to connect WebRTC call:', err);
        handleEndCallRef.current?.(false);
        setCallNotice({
          type: 'warning',
          message: err?.message || 'Failed to start WebRTC softphone call.',
        });
      }
      return;
    }

    // ─── 2. FALLBACK: PSTN BRIDGE (If WebRTC keys not yet configured) ───
    const effectiveOperatorPhone = (operatorPhoneInput || creds.operatorPhone || '').trim();

    if (!effectiveOperatorPhone) {
      setPendingCallTarget({ phone: targetE164, name: callerDisplayName });
      setSetupAgentPhoneInput('');
      setSetupAgentPhoneError(null);
      setShowAgentSetupModal(true);
      return;
    }

    const callId = `call_${Date.now()}`;
    activeCallInteractionIdRef.current = callId;

    setCallStatus('calling');
    setActiveCallContact(callerDisplayName);
    setActiveCallPhone(targetE164);
    setCallNotice({
      type: 'info',
      message: `Connecting... Ringing your phone (${formatDisplayPhone(effectiveOperatorPhone)}) to bridge.`,
    });
    setShowInCallKeypad(false);
    setShowInCallTrips(false);
    setShowInCallNotes(false);

    // Switch view to phone/keypad so in-call screen displays immediately
    setActiveTab('phone');
    setCallsSubTab('keypad');

    // Immediately log outbound call to history
    const newCallRecord: InteractionEvent = {
      id: callId,
      type: 'call_outbound',
      contactName: callerDisplayName,
      contactPhone: targetE164,
      contactType: 'passenger',
      timestamp: 'Just now',
      timestampMs: Date.now(),
      durationSeconds: 0,
      audioDuration: '0:00',
      snippet: `Outbound Call (${displayNum})`,
      isUnread: false,
    };
    setInteractions((prev) => [newCallRecord, ...prev]);

    workspaceBus.publish('CALL_OUTBOUND_STARTED', {
      targetNumber: targetE164,
      contactName: callerDisplayName,
    });

    try {
      if (targetE164 === creds.phoneNumber) {
        setCallNotice({
          type: 'warning',
          message: `Destination matches dispatch caller ID (${creds.phoneNumber}). Dialing customer line.`,
        });
      }

      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: targetE164,
          from: creds.phoneNumber,
          operatorPhone: effectiveOperatorPhone,
          credentials: creds.accountSid ? creds : undefined,
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.success) {
        setActiveCallSid(resData.callSid || null);
        setCallStatus('connected');
        setCallNotice({
          type: 'info',
          message: `Twilio bridge active. Ringing your phone (${formatDisplayPhone(effectiveOperatorPhone)})...`,
        });
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === callId
              ? {
                  ...i,
                  recordingSid: resData.callSid,
                  snippet: `Outbound Call Connected (${displayNum})`,
                }
              : i
          )
        );
        workspaceBus.publish('CALL_ANSWERED', {
          callSid: resData.callSid,
          callerNumber: targetE164,
        });
      } else {
        handleEndCallRef.current?.(false);
        const warningMsg =
          resData.code === 'NO_OPERATOR_PHONE'
            ? 'Please enter your agent phone number to bridge live calls.'
            : resData.code === 'TWILIO_NUMBER_UNVERIFIED'
            ? 'Twilio Trial Error: Recipient phone number must be verified in Twilio Console.'
            : resData.error || resData.message || 'Call failed to initiate on Twilio.';
        setCallNotice({
          type: 'warning',
          message: warningMsg,
        });
        if (resData.code === 'NO_OPERATOR_PHONE') {
          setPendingCallTarget({ phone: targetE164, name: callerDisplayName });
          setSetupAgentPhoneInput('');
          setSetupAgentPhoneError(null);
          setShowAgentSetupModal(true);
        }
      }
    } catch {
      handleEndCallRef.current?.(false);
      setCallNotice({
        type: 'warning',
        message: 'Network offline. Unable to reach Twilio service.',
      });
    }
  };

  const handleEndCall = (broadcast: boolean | React.MouseEvent | unknown = true) => {
    if (activeCallRef.current) {
      try {
        activeCallRef.current.disconnect();
      } catch {}
      activeCallRef.current = null;
    }

    const finalSecs = callTimer > 0 ? callTimer : 1;
    const m = Math.floor(finalSecs / 60);
    const s = (finalSecs % 60).toString().padStart(2, '0');
    const durationLabel = `${m}:${s}`;

    if (activeCallSid) {
      try {
        const creds = getClientTelephonyCredentials();
        authorizedFetch('/api/telephony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'end_call',
            callSid: activeCallSid,
            credentials: creds.accountSid ? creds : undefined,
          }),
        }).catch(() => {});
      } catch {}
    }

    const shouldBroadcast = typeof broadcast === 'boolean' ? broadcast : true;
    if (shouldBroadcast) {
      workspaceBus.publish('CALL_ENDED', {
        callSid: activeCallSid || undefined,
        durationSeconds: finalSecs,
      });
    }

    if (activeCallInteractionIdRef.current) {
      const activeId = activeCallInteractionIdRef.current;
      setInteractions((prev) =>
        prev.map((i) =>
          i.id === activeId
            ? {
                ...i,
                durationSeconds: finalSecs,
                audioDuration: durationLabel,
                snippet: `Outbound Call (${durationLabel})`,
              }
            : i
        )
      );
    }

    setCallStatus('idle');
    setCallsSubTab('history');
    setActiveCallContact(null);
    setActiveCallPhone(null);
    setActiveCallSid(null);
    setCallTimer(0);
    setCallNotice(null);
    setShowInCallKeypad(false);
    setShowInCallTrips(false);
    setShowInCallNotes(false);
    activeCallInteractionIdRef.current = null;

    setTimeout(() => {
      fetchTelephonyData();
    }, 4000);
  };
  handleEndCallRef.current = handleEndCall;

  // Synchronize remote call completion from Twilio PSTN
  useEffect(() => {
    if (
      !activeCallSid ||
      (callStatus !== 'calling' && callStatus !== 'connected' && callStatus !== 'on_hold')
    ) {
      return;
    }

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const creds = getClientTelephonyCredentials();
        const resp = await authorizedFetch('/api/telephony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_call_status',
            callSid: activeCallSid,
            credentials: creds.accountSid ? creds : undefined,
          }),
        });
        if (resp.ok && isSubscribed) {
          const statusData = await resp.json();
          if (statusData.success && statusData.status) {
            const terminalStatuses = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
            if (terminalStatuses.includes(statusData.status.toLowerCase())) {
              clearInterval(interval);
              handleEndCall(true);
            }
          }
        }
      } catch {
        // Tolerated polling network error
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeCallSid, callStatus]);

  // Sync call ending from external triggers (header flydown or top banner)
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'CALL_ENDED') {
        if (callStatus !== 'idle') {
          handleEndCall(false);
        }
      }
    });
    return unsub;
  }, [workspaceBus, callStatus, callTimer, activeCallSid]);

  const handleInCallBookRide = () => {
    const rawPhone = activeCallPhone || dialpadNumber;
    const contactService = getContactService();
    const contact = rawPhone ? contactService.getContactByPhone(rawPhone) : null;

    const payload = {
      passengerName:
        contact?.name ||
        (activeCallContact && activeCallContact !== 'Caller' ? activeCallContact : '') ||
        '',
      passengerPhone: contact?.phone || rawPhone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: contact?.homeAddress || contact?.workAddress || '',
      dropoffAddress: contact?.workAddress && contact?.homeAddress ? contact.workAddress : '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Direct phone reservation from call (${formatCallTimer(callTimer)})${
        contact?.notes ? ` | Contact notes: ${contact.notes}` : ''
      }`,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
    setBookingToast('Draft ready');
    setTimeout(() => setBookingToast(null), 2500);
  };

  const handleLoadCallerTrip = (tr: UpcomingBookingPreview) => {
    const rawPhone = activeCallPhone || dialpadNumber;
    const contact = rawPhone ? getContactService().getContactByPhone(rawPhone) : null;
    const payload = {
      passengerName:
        contact?.name ||
        (activeCallContact && activeCallContact !== 'Caller' ? activeCallContact : '') ||
        '',
      passengerPhone: contact?.phone || rawPhone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: tr.pickupAddress || contact?.homeAddress || '',
      dropoffAddress: tr.dropoffAddress || contact?.workAddress || '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Re-booking route: ${tr.pickupAddress} -> ${tr.dropoffAddress}`,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) onPopulateBooking(payload);
    setBookingToast('Trip loaded');
    setTimeout(() => setBookingToast(null), 2000);
  };

  const handleEditCallerTrip = (tripId: string) => {
    workspaceBus.publish('OPEN_EDIT_TRIP', {
      tripId,
      phone: activeCallPhone || dialpadNumber,
    });
    if (onOpenEditTrip) {
      onOpenEditTrip(tripId);
    }
  };

  const handleInCallSendLink = async () => {
    const targetPhone = activeCallPhone || dialpadNumber;
    if (!targetPhone) return;

    try {
      const creds = getClientTelephonyCredentials();
      const twilioSid = creds.accountSid;
      const twilioToken = creds.authToken;
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const res = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: sanitizeToE164(targetPhone),
          body: 'Book your Chesterfield Taxi ride online anytime: https://chesterfieldtaxi.com/book',
          credentials: {
            accountSid: twilioSid,
            authToken: twilioToken,
            phoneNumber: sanitizeToE164(twilioPhone),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        setBookingToast(data?.error || 'Failed to send booking link');
        setTimeout(() => setBookingToast(null), 3500);
        return;
      }

      setBookingToast('Booking link sent!');
      setTimeout(() => setBookingToast(null), 2500);
    } catch {
      setBookingToast('Failed to send SMS link');
      setTimeout(() => setBookingToast(null), 3500);
    }
  };

  const handleAppendCallNote = (chipText?: string) => {
    const noteToAdd = chipText || inCallNoteText.trim();
    if (!noteToAdd) return;

    const targetPhone = activeCallPhone || dialpadNumber;
    const payload = {
      passengerPhone: targetPhone,
      notes: noteToAdd,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
    if (targetPhone) {
      void getCommsThreadService().addInternalNote({
        phone: targetPhone,
        contactName: activeCallContact || undefined,
        bodyText: noteToAdd,
        actorName: _user?.displayName || _user?.email || 'Dispatcher',
      });
    }
    setInCallNoteText('');
    setBookingToast(`Note: ${noteToAdd}`);
    setTimeout(() => setBookingToast(null), 2000);
  };

  const handleOpenContactEdit = () => {
    const phone = activeContactSummary?.contactPhone || selectedContactPhone || '';
    const contactService = getContactService();
    const existing = (phone ? contactService.getContactByPhone(phone) : null) || activeContactRecord;
    setContactEditForm({
      id: existing?.id,
      name: existing?.name || activeContactSummary?.contactName || formatDisplayPhone(phone),
      firstName: existing?.firstName || '',
      lastName: existing?.lastName || '',
      phone: existing?.phone || phone,
      primaryPhoneType: existing?.primaryPhoneType || 'mobile',
      additionalPhones: existing?.additionalPhones
        ? JSON.parse(JSON.stringify(existing.additionalPhones))
        : [],
      mobilePhone: existing?.mobilePhone || existing?.phone || phone,
      homePhone: existing?.homePhone || '',
      workPhone: existing?.workPhone || '',
      workExtension: existing?.workExtension || '',
      email: existing?.email || '',
      secondaryEmail: existing?.secondaryEmail || '',
      corporateAccountId: existing?.corporateAccountId || '',
      corporateAccountNumber: existing?.corporateAccountNumber || '',
      corporateAccountName: existing?.corporateAccountName || '',
      billingDepartment: existing?.billingDepartment || '',
      defaultPoNumber: existing?.defaultPoNumber || '',
      homeAddress: existing?.homeAddress || '',
      workAddress: existing?.workAddress || '',
      isVip: existing?.isVip || false,
      vipReason: existing?.vipReason || '',
      preferredVehicleTier: existing?.preferredVehicleTier || 'standard',
      accessibilityNeeds: existing?.accessibilityNeeds ? { ...existing.accessibilityNeeds } : {},
      smsNotifications: existing?.smsNotifications ?? true,
      notes: existing?.notes || '',
      internalDispatcherNotes: existing?.internalDispatcherNotes || '',
    });
    setCorpSearchQuery(existing?.corporateAccountNumber || existing?.corporateAccountName || '');
    setIsCorpDropdownOpen(false);
    setContactSaveFeedback(null);
    setIsContactEditOpen(true);
  };

  const handleAddPhone = () => {
    const newPhone: AdditionalPhone = {
      id: `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'mobile',
      number: '',
    };
    setContactEditForm((prev) => ({
      ...prev,
      additionalPhones: [...(prev.additionalPhones || []), newPhone],
    }));
  };

  const handleUpdatePhone = (index: number, patch: Partial<AdditionalPhone>) => {
    setContactEditForm((prev) => {
      const list = [...(prev.additionalPhones || [])];
      if (list[index]) {
        list[index] = { ...list[index], ...patch };
      }
      return { ...prev, additionalPhones: list };
    });
  };

  const handleRemovePhone = (index: number) => {
    setContactEditForm((prev) => {
      const list = [...(prev.additionalPhones || [])];
      list.splice(index, 1);
      return { ...prev, additionalPhones: list };
    });
  };

  const handleSaveContactFromHub = () => {
    const contactService = getContactService();
    const phone =
      contactEditForm.phone || activeContactSummary?.contactPhone || selectedContactPhone || '';
    if (!phone) return;

    const cleanAdditional = (contactEditForm.additionalPhones || []).filter(
      (ap) => ap.number && ap.number.trim()
    );

    const updated = contactService.saveContact({
      ...contactEditForm,
      id: contactEditForm.id || activeContactRecord?.id || `cust_${Date.now()}`,
      name:
        contactEditForm.name || activeContactSummary?.contactName || formatDisplayPhone(phone),
      phone: phone.trim(),
      additionalPhones: cleanAdditional,
      customerScore: activeContactRecord?.customerScore ?? 90,
      tripCount: activeContactRecord?.tripCount ?? 1,
      totalSpend: activeContactRecord?.totalSpend ?? 0,
      isBlacklisted: activeContactRecord?.isBlacklisted ?? false,
    });

    setActiveContactRecord(updated);
    void getCommsThreadService().mergeThreadsForContact(updated);
    setContactSaveFeedback('Contact profile updated successfully');
    setTimeout(() => {
      setContactSaveFeedback(null);
      setIsContactEditOpen(false);
    }, 1200);
  };

  const handleBookContactRide = () => {
    if (!activeContactSummary) return;
    const phone =
      activeContactSummary.mobilePhone ||
      activeContactSummary.contactPhone ||
      selectedContactPhone;
    const contact =
      activeContactRecord || (phone ? getContactService().getContactByPhone(phone) : null);
    const payload = {
      passengerName: contact?.name || activeContactSummary.contactName || '',
      passengerPhone: contact?.phone || phone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: contact?.homeAddress || contact?.workAddress || '',
      dropoffAddress: contact?.workAddress && contact?.homeAddress ? contact.workAddress : '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: contact?.notes || '',
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
  };

  const handleViewUpcomingTrip = (targetTrip: UpcomingBookingPreview) => {
    if (!targetTrip) return;
    workspaceBus.publish('OPEN_EDIT_TRIP', {
      tripId: targetTrip.id,
      phone: activeContactSummary?.contactPhone || selectedContactPhone || undefined,
    });
    workspaceBus.publish('FOCUS_TRIP_ON_MAP', {
      tripId: targetTrip.id,
    });
    if (onOpenEditTrip) {
      onOpenEditTrip(targetTrip.id);
    }
  };

  const handleSendSms = async () => {
    if (!smsReplyText.trim() || !selectedContactPhone) return;

    const phoneValidation = validatePhoneNumber(selectedContactPhone);
    if (!phoneValidation.isValid) {
      setSmsStatusMessage(phoneValidation.error || 'Invalid recipient phone number.');
      setTimeout(() => setSmsStatusMessage(null), 3500);
      return;
    }

    setIsSendingSms(true);
    setSmsStatusMessage(null);

    const messageText = smsReplyText.trim();
    const targetContactName =
      activeContactRecord?.name ||
      activeContactSummary?.contactName ||
      formatDisplayPhone(phoneValidation.e164);

    const newInteraction: InteractionEvent = {
      id: `sms_out_${Date.now()}`,
      type: 'sms_outbound',
      contactName: targetContactName,
      contactPhone: phoneValidation.e164,
      contactType: ((activeContactRecord as any)?.type as any) || 'passenger',
      timestamp: 'Just now',
      timestampMs: Date.now(),
      snippet: messageText,
      isUnread: false,
    };

    setInteractions((prev) => [newInteraction, ...prev]);
    setSmsReplyText('');

    try {
      const creds = getClientTelephonyCredentials();
      const twilioSid = creds.accountSid;
      const twilioToken = creds.authToken;
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: phoneValidation.e164,
          body: messageText,
          credentials: {
            accountSid: twilioSid,
            authToken: twilioToken,
            phoneNumber: sanitizeToE164(twilioPhone),
          },
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.success) {
        setSmsStatusMessage(resData.simulated ? 'Sent (Simulated)' : 'Sent to carrier');
        if (resData.messageSid || resData.status) {
          setInteractions((prev) =>
            prev.map((i) =>
              i.id === newInteraction.id
                ? {
                    ...i,
                    id: resData.messageSid || i.id,
                    deliveryStatus: resData.status || 'sent',
                    errorCode: resData.code || resData.errorCode,
                    errorMessage: resData.error || resData.errorMessage,
                  }
                : i
            )
          );
        }
      } else {
        const errorDesc = resData.error || resData.warning || 'Failed to dispatch';
        setSmsStatusMessage(`Failed: ${errorDesc}`);
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === newInteraction.id
              ? { ...i, deliveryStatus: 'failed', errorMessage: errorDesc }
              : i
          )
        );
      }
      setTimeout(fetchTelephonyData, 1000);
    } catch (err: any) {
      setSmsStatusMessage(err?.message || 'Error sending');
    } finally {
      setIsSendingSms(false);
      setTimeout(() => setSmsStatusMessage(null), 4000);
    }
  };

  const handleConvertVoicemailToBooking = (suggested: InteractionEvent['suggestedBooking']) => {
    if (!suggested) return;
    const phone = suggested.passengerPhone;
    const contact = phone ? getContactService().getContactByPhone(phone) : null;

    const payload = {
      passengerName: contact?.name || suggested.passengerName || '',
      passengerPhone: contact?.phone || phone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: suggested.pickup || contact?.homeAddress || '',
      dropoffAddress: suggested.dropoff || contact?.workAddress || '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber:
        contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Converted from Voicemail (Received ${suggested.pickupTime || 'earlier'})${
        contact?.notes ? ` | Contact notes: ${contact.notes}` : ''
      }`,
    };

    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
  };

  const handleCyclePlaybackSpeed = () => {
    setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
  };

  const handleTogglePlayVoicemail = (id: string) => {
    setPlayingVoicemailId((prev) => (prev === id ? null : id));
  };

  const handleTogglePlayCall = (id: string) => {
    setPlayingCallId((prev) => (prev === id ? null : id));
  };

  const handleOpenInKeypad = (phone: string) => {
    setDialpadNumber(phone);
    setCallsSubTab('keypad');
  };

  const sharedLogProps = {
    selectedItemIds,
    isAllSelected,
    masterCheckboxRef,
    onToggleSelectAll: handleToggleSelectAll,
    onToggleSelectRow: handleToggleSelectRow,
    onClearSelection: () => setSelectedItemIds(new Set()),
    onBatchMarkRead: handleBatchMarkRead,
    onBatchMarkUnread: handleBatchMarkUnread,
    onBatchArchive: handleBatchArchive,
    filterUnreadOnly,
    onToggleUnreadOnly: () => setFilterUnreadOnly((v) => !v),
    contactFilter,
    onChangeContactFilter: setContactFilter,
    searchQuery,
    onChangeSearchQuery: setSearchQuery,
    channelFilter,
    onChangeChannelFilter: setChannelFilter,
    callTypeFilter,
    onChangeCallTypeFilter: setCallTypeFilter,
    forwardToast,
    onDismissForwardToast: () => setForwardToast(null),
    playingVoicemailId,
    onTogglePlayVoicemail: handleTogglePlayVoicemail,
    playingCallId,
    onTogglePlayCall: handleTogglePlayCall,
    playbackSpeed,
    onCyclePlaybackSpeed: handleCyclePlaybackSpeed,
    onStartCall: handleStartCall,
    onOpenInKeypad: handleOpenInKeypad,
    onSelectContact: setSelectedContactPhone,
    onConvertVoicemailToBooking: handleConvertVoicemailToBooking,
    onToggleReadStatus: handleToggleReadStatus,
    onForwardItem: handleForwardItem,
    onArchiveItem: handleArchiveItem,
    commsLongPressTriggeredIdRef,
    onRowTouchStart: handleCommsRowTouchStart,
    onRowTouchMove: handleCommsRowTouchMove,
    onRowTouchEnd: cancelCommsLongPress,
  };

  const handleAddThreadInternalNote = async () => {
    const clean = noteDraftText.trim();
    if (!clean || !selectedContactPhone) return;
    const phoneCandidate =
      activeContactRecord?.phone ||
      activeContactSummary?.contactPhone ||
      (!selectedContactPhone.includes('@') && !selectedContactPhone.startsWith('thr_')
        ? selectedContactPhone
        : undefined);
    const emailCandidate =
      activeContactRecord?.email ||
      activeContactSummary?.contactEmail ||
      (selectedContactPhone.includes('@') ? selectedContactPhone : undefined);

    setNoteDraftText('');
    await getCommsThreadService().addInternalNote({
      threadId: activeUnifiedThread?.id,
      phone: phoneCandidate,
      email: emailCandidate,
      contactName: activeContactRecord?.name || activeContactSummary?.contactName,
      bodyText: clean,
      actorName: _user?.displayName || _user?.email || 'Dispatcher',
    });
  };

  const handleOpenEmailInDock = (evt: InteractionEvent) => {
    workspaceBus.publish('OPEN_EMAIL_MESSAGE', {
      emailMessageId: evt.emailMessageId || evt.id.replace(/^em_/, ''),
      threadId: evt.threadId,
      senderEmail: evt.contactEmail || activeContactRecord?.email,
    });
    workspaceBus.publish('FOCUS_MODULE', { moduleKey: 'email' });
  };

  const sharedSmsThreadProps = {
    activeContactSummary,
    activeContactRecord,
    onBackFromThread: () => setSelectedContactPhone(null),
    onOpenContactEdit: handleOpenContactEdit,
    onBookContactRide: handleBookContactRide,
    threadTab,
    onChangeThreadTab: setThreadTab,
    totalContactInteractionCount: allSelectedContactInteractions.length,
    threadSmsCount,
    threadCallCount,
    threadEmailCount,
    threadNoteCount,
    has10DlcBlockedMessages,
    upcomingBookingsForContact,
    onViewUpcomingTrip: handleViewUpcomingTrip,
    selectedInteractions,
    messagesEndRef,
    playingCallId,
    onTogglePlayCall: handleTogglePlayCall,
    playingVoicemailId,
    onTogglePlayVoicemail: handleTogglePlayVoicemail,
    playbackSpeed,
    onCyclePlaybackSpeed: handleCyclePlaybackSpeed,
    onStartCall: handleStartCall,
    onConvertVoicemailToBooking: handleConvertVoicemailToBooking,
    onOpenEmailInDock: handleOpenEmailInDock,
    noteDraftText,
    onChangeNoteDraftText: setNoteDraftText,
    onAddInternalNote: handleAddThreadInternalNote,
    smsReplyText,
    onChangeSmsReplyText: setSmsReplyText,
    isSendingSms,
    onSendSms: handleSendSms,
    smsStatusMessage,
    messageConversations,
    threadUnreadCountMap,
    selectedItemIds,
    isAllSelected,
    masterCheckboxRef,
    onToggleSelectAll: handleToggleSelectAll,
    onToggleSelectRow: handleToggleSelectRow,
    onClearSelection: () => setSelectedItemIds(new Set()),
    onBatchMarkRead: handleBatchMarkRead,
    onBatchMarkUnread: handleBatchMarkUnread,
    onBatchArchive: handleBatchArchive,
    unreadCountMessages,
    filterUnreadOnly,
    onToggleUnreadOnly: () => setFilterUnreadOnly((v) => !v),
    contactFilter,
    onChangeContactFilter: setContactFilter,
    searchQuery,
    onChangeSearchQuery: setSearchQuery,
    onSelectContact: setSelectedContactPhone,
    onOpenFreshNewMessageModal: handleOpenFreshNewMessageModal,
  };

  return (
    <div className={`flex flex-col h-full bg-slate-50 text-slate-900 ${isPopout ? 'h-screen' : ''}`}>
      {/* Hidden audio element for Twilio recordings & voicemail playback */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => {
          setPlayingVoicemailId(null);
          setPlayingCallId(null);
        }}
        className="hidden"
      />

      {/* ─── Incoming Softphone Call Banner ─── */}
      {incomingCallInfo && (
        <div className="bg-emerald-600 text-white px-4 py-3 shrink-0 shadow-lg flex items-center justify-between border-b border-emerald-700 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <PhoneIcon className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
                Incoming Softphone Call
              </p>
              <p className="text-sm font-bold font-mono">
                {formatDisplayPhone(incomingCallInfo.from)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRejectIncomingCall}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={handleAcceptIncomingCall}
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
              setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="truncate">All</span>
            {unreadCountAll > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-slate-700 text-white">
                {unreadCountAll}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('phone');
              setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'phone'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <PhoneIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">Calls</span>
            {unreadCountMissed > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-rose-500 text-white">
                {unreadCountMissed}
              </span>
            )}
            {callStatus !== 'idle' && (
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
            {unreadCountMessages > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-blue-600 text-white">
                {unreadCountMessages}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('voicemail');
              setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'voicemail'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="truncate">VM</span>
            {unreadCountVoicemail > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black shrink-0 bg-amber-500 text-white">
                {unreadCountVoicemail}
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
        {activeTab === 'all' && !selectedContactPhone && (
          <VoicemailCallLogPane
            mode="all"
            items={filteredAllInteractions}
            unreadCount={unreadCountAll}
            {...sharedLogProps}
          />
        )}

        {/* VIEW 2: UNIFIED CONTACT CONVERSATION THREAD */}
        {selectedContactPhone && activeContactSummary && (
          <SmsThreadPane mode="thread" {...sharedSmsThreadProps} />
        )}

        {/* VIEW 3: FULL DTMF NUMERIC DIALPAD & SOFTPHONE / CALL HISTORY */}
        {activeTab === 'phone' && !selectedContactPhone && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
            {/* Top Sub-Switcher: Keypad vs All Calls vs Missed */}
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/80 shrink-0">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCallsSubTab('history')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    callsSubTab === 'history'
                      ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">History</span>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.2 rounded-full shrink-0 ${
                      callsSubTab === 'history'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {allHistoryCalls.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCallsSubTab('keypad')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    callsSubTab === 'keypad'
                      ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Keypad</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCallsSubTab('missed')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    callsSubTab === 'missed'
                      ? 'bg-white text-rose-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span className="truncate">Missed</span>
                  {allMissedCalls.length > 0 && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded-full shrink-0 ${
                        callsSubTab === 'missed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-rose-500 text-white'
                      }`}
                    >
                      {allMissedCalls.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {callsSubTab === 'keypad' && (
              <SoftphoneDialerPane
                callStatus={callStatus}
                bookingToast={bookingToast}
                activeCallContact={activeCallContact}
                activeCallPhone={activeCallPhone}
                dialpadNumber={dialpadNumber}
                onChangeDialpadNumber={setDialpadNumber}
                dialpadInputRef={dialpadInputRef}
                callTimer={callTimer}
                isMuted={isMuted}
                callNotice={callNotice}
                showInCallTrips={showInCallTrips}
                showInCallNotes={showInCallNotes}
                showInCallKeypad={showInCallKeypad}
                onToggleInCallTrips={() => {
                  setShowInCallTrips((v) => !v);
                  setShowInCallNotes(false);
                  setShowInCallKeypad(false);
                }}
                onToggleInCallNotes={() => {
                  setShowInCallNotes((v) => !v);
                  setShowInCallTrips(false);
                  setShowInCallKeypad(false);
                }}
                onToggleInCallKeypad={() => {
                  setShowInCallKeypad((v) => !v);
                  setShowInCallTrips(false);
                  setShowInCallNotes(false);
                }}
                onInCallBookRide={handleInCallBookRide}
                onInCallSendLink={handleInCallSendLink}
                matchingCallerTrips={matchingCallerTrips}
                onLoadCallerTrip={handleLoadCallerTrip}
                onEditCallerTrip={handleEditCallerTrip}
                inCallNoteText={inCallNoteText}
                onChangeInCallNoteText={setInCallNoteText}
                onAppendCallNote={handleAppendCallNote}
                onSendInCallDtmf={(digit) => {
                  setActiveKeypadFeedback(digit);
                  if (activeCallRef.current) {
                    try {
                      activeCallRef.current.sendDigits(digit);
                    } catch {}
                  }
                  setTimeout(() => setActiveKeypadFeedback(null), 150);
                }}
                onToggleMute={() => {
                  const nextMute = !isMuted;
                  setIsMuted(nextMute);
                  if (activeCallRef.current) {
                    try {
                      activeCallRef.current.mute(nextMute);
                    } catch {}
                  }
                }}
                onToggleHold={() =>
                  setCallStatus((s) => (s === 'on_hold' ? 'connected' : 'on_hold'))
                }
                onEndCall={handleEndCall}
                softphoneStatus={softphoneStatus}
                operatorPhoneInput={operatorPhoneInput}
                onChangeOperatorPhoneInput={setOperatorPhoneInput}
                isEditingOperatorPhone={isEditingOperatorPhone}
                onToggleEditingOperatorPhone={() => setIsEditingOperatorPhone((v) => !v)}
                onSaveOperatorPhone={() => {
                  if (typeof window !== 'undefined' && window.localStorage) {
                    localStorage.setItem('ct_dispatch_operator_phone', operatorPhoneInput.trim());
                  }
                  setIsEditingOperatorPhone(false);
                }}
                onCancelEditingOperatorPhone={() => setIsEditingOperatorPhone(false)}
                activeKeypadFeedback={activeKeypadFeedback}
                onDialDigit={handleDialDigit}
                onDeleteDialDigit={() => setDialpadNumber((prev) => prev.slice(0, -1))}
                onClearDialpad={() => setDialpadNumber('')}
                onStartCall={handleStartCall}
                drivers={drivers}
              />
            )}

            {callsSubTab === 'history' && (
              <VoicemailCallLogPane
                mode="call_history"
                items={filteredHistoryCalls}
                unreadCount={unreadCountHistory}
                {...sharedLogProps}
              />
            )}

            {callsSubTab === 'missed' && (
              <VoicemailCallLogPane
                mode="call_missed"
                items={filteredMissedCalls}
                unreadCount={unreadCountMissed}
                {...sharedLogProps}
              />
            )}
          </div>
        )}

        {/* VIEW 4: VOICEMAIL INBOX */}
        {activeTab === 'voicemail' && !selectedContactPhone && (
          <VoicemailCallLogPane
            mode="voicemail"
            items={filteredVoicemails}
            unreadCount={unreadCountVoicemail}
            {...sharedLogProps}
          />
        )}

        {/* VIEW 5: MESSAGING LIST */}
        {activeTab === 'messages' && !selectedContactPhone && (
          <SmsThreadPane mode="list" {...sharedSmsThreadProps} />
        )}
      </div>

      {/* AGENT PHONE SETUP MODAL */}
      <AgentPhoneSetupModal
        isOpen={showAgentSetupModal}
        pendingCallTarget={pendingCallTarget}
        setupAgentPhoneInput={setupAgentPhoneInput}
        setupAgentPhoneError={setupAgentPhoneError}
        onChangeSetupAgentPhoneInput={(val) => {
          setSetupAgentPhoneInput(val);
          if (setupAgentPhoneError) setSetupAgentPhoneError(null);
        }}
        onSaveAndCall={handleSaveAgentAndCall}
        onClose={() => {
          setShowAgentSetupModal(false);
          setPendingCallTarget(null);
          setSetupAgentPhoneError(null);
        }}
        sheetDrag={commsSheetDrag}
      />

      {/* Contact Profile & Edit Modal */}
      <CommsContactModal
        isOpen={isContactEditOpen}
        contactEditForm={contactEditForm}
        setContactEditForm={setContactEditForm}
        contactSaveFeedback={contactSaveFeedback}
        activeContactPhoneFallback={activeContactSummary?.contactPhone || ''}
        corpSearchQuery={corpSearchQuery}
        onChangeCorpSearchQuery={setCorpSearchQuery}
        isCorpDropdownOpen={isCorpDropdownOpen}
        setIsCorpDropdownOpen={setIsCorpDropdownOpen}
        filteredCorpAccounts={filteredCorpAccounts}
        onAddPhone={handleAddPhone}
        onUpdatePhone={handleUpdatePhone}
        onRemovePhone={handleRemovePhone}
        onSaveContact={handleSaveContactFromHub}
        onClose={() => {
          setIsCorpDropdownOpen(false);
          setIsContactEditOpen(false);
        }}
        sheetDrag={commsSheetDrag}
      />

      {/* ─── NEW SMS MESSAGE MODAL ─── */}
      <NewSmsMessageModal
        isOpen={isNewMessageModalOpen}
        newMsgError={newMsgError}
        msgContactSearch={msgContactSearch}
        newMsgRecipientPhone={newMsgRecipientPhone}
        newMsgRecipientName={newMsgRecipientName}
        newMsgBody={newMsgBody}
        isSendingNewMsg={isSendingNewMsg}
        isMsgContactDropdownOpen={isMsgContactDropdownOpen}
        filteredContactsForMsg={filteredContactsForMsg}
        onRecipientInputChange={(val) => {
          setMsgContactSearch(val);
          setNewMsgRecipientPhone(val);
          setIsMsgContactDropdownOpen(true);
          setNewMsgError(null);
        }}
        onRecipientInputFocus={() => setIsMsgContactDropdownOpen(true)}
        onSelectContactOption={(c) => {
          const chosenPhone = c.mobilePhone || c.phone;
          setNewMsgRecipientPhone(chosenPhone);
          setNewMsgRecipientName(c.name);
          setMsgContactSearch(`${c.name} (${chosenPhone})`);
          setIsMsgContactDropdownOpen(false);
          setNewMsgError(null);
        }}
        onBodyChange={(val) => {
          setNewMsgBody(val);
          setNewMsgError(null);
        }}
        onSelectPresetChip={setNewMsgBody}
        onOpenThread={handleOpenNewMessageThread}
        onSend={handleSendNewMessage}
        onClose={() => setIsNewMessageModalOpen(false)}
        sheetDrag={commsSheetDrag}
      />

      {/* ─── Mobile Floating Compose SMS Button (All / SMS stream views) ─── */}
      <MobileComposeSmsFab
        isVisible={!selectedContactPhone && (activeTab === 'all' || activeTab === 'messages')}
        onOpenCompose={() => {
          setNewMsgError(null);
          setIsNewMessageModalOpen(true);
        }}
      />

      {/* ─── Mobile-Native Comms Row Quick Action Bottom Sheet (Touch & Hold) ─── */}
      <CommsRowActionSheet
        event={commsActionSheetEvent}
        onClose={() => setCommsActionSheetEvent(null)}
        onCallBack={(target) => {
          setCommsActionSheetEvent(null);
          handleStartCall(target.contactPhone, target.contactName);
        }}
        onOpenThread={(target) => {
          setCommsActionSheetEvent(null);
          setSelectedContactPhone(target.contactPhone);
        }}
        onBookTrip={(target) => {
          setCommsActionSheetEvent(null);
          if (target.suggestedBooking) {
            handleConvertVoicemailToBooking(target.suggestedBooking);
          } else if (onPopulateBooking) {
            onPopulateBooking({
              passengerName: target.contactName,
              passengerPhone: target.contactPhone,
            });
          }
        }}
        onToggleRead={(target) => {
          setCommsActionSheetEvent(null);
          setInteractions((prev) =>
            prev.map((item) =>
              item.id === target.id ? { ...item, isUnread: !item.isUnread } : item
            )
          );
        }}
        onSelectMultiple={(target) => {
          setCommsActionSheetEvent(null);
          setSelectedItemIds((prev) => {
            const next = new Set(prev);
            next.add(target.id);
            return next;
          });
        }}
        onArchive={(target) => {
          setCommsActionSheetEvent(null);
          setInteractions((prev) => prev.filter((item) => item.id !== target.id));
        }}
        sheetDrag={commsSheetDrag}
      />
    </div>
  );
}

export const CommsHub = React.memo(CommsHubComponent);
