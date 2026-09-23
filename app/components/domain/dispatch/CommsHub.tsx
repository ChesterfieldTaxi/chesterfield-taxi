import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getWorkspaceBus, type UpcomingBookingPreview } from '../../../core/services/workspace-bus.service';
import {
  matchPassengerByPhone,
  resolvePrimarySmsPhone,
  normalizePhone,
  DEFAULT_PASSENGER_ACCOUNT,
} from '../../../core/services/passenger.service';
import { validatePhoneNumber, sanitizeToE164, formatDisplayPhone } from '../../../core/utils/phone';
import type { Trip } from '../../../core/types/trip';
import {
  PhoneIcon,
  MailIcon,
  SearchIcon,
  CheckIcon,
  ExternalLinkIcon,
  XIcon,
  UserIcon,
  SpinnerIcon,
  ClockIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
  CarIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PlayIcon,
  PhoneOffIcon,
  FileTextIcon,
  LinkIcon,
  KeypadGridIcon,
  PlusIcon,
  BuildingIcon,
  MapPinIcon,
  WheelchairIcon,
} from '../../ui/Icons';
import {
  getContactService,
  type ContactRecord,
  type AdditionalPhone,
  type PhoneType,
} from '../../../core/services/customer/contact.service';
import {
  getAdminConfigService,
  DEFAULT_CORPORATE_ACCOUNTS,
} from '../../../core/services/config/admin-config.service';
import type { CorporateAccountConfig } from '../../../core/types/config';

const formatMessageTimestamp = (timestampMs?: number, fallbackStr?: string) => {
  if (!timestampMs) return fallbackStr || '';
  const d = new Date(timestampMs);
  if (isNaN(d.getTime())) return fallbackStr || '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

const getStoredTwilioCreds = () => {
  if (typeof window === 'undefined') return { sid: '', token: '', phone: '' };
  const creds = getClientTelephonyCredentials();
  return {
    sid: creds.accountSid,
    token: creds.authToken,
    phone: creds.phoneNumber,
  };
};

export type CommsTab = 'all' | 'phone' | 'messages' | 'voicemail';
export type ChannelFilter = 'all' | 'calls' | 'voicemail' | 'messages';
export type ContactFilter = 'all' | 'passengers' | 'drivers';

export interface InteractionEvent {
  id: string;
  type: 'call_inbound' | 'call_outbound' | 'call_missed' | 'voicemail' | 'sms_inbound' | 'sms_outbound';
  contactName: string;
  contactPhone: string;
  contactType: 'passenger' | 'driver' | 'corporate' | 'unknown';
  homePhone?: string;
  mobilePhone?: string;
  timestamp: string;
  timestampMs: number;
  durationSeconds?: number;
  snippet: string;
  isUnread?: boolean;
  deliveryStatus?: string;
  errorCode?: number | string;
  errorMessage?: string;
  hasRecording?: boolean;
  recordingSid?: string;
  callSid?: string;
  audioUrl?: string;
  audioDuration?: string;
  transcription?: string;
  suggestedBooking?: {
    pickup: string;
    dropoff: string;
    pickupTime: string;
    passengerName: string;
    passengerPhone: string;
  };
}

const INITIAL_INTERACTIONS: InteractionEvent[] = [];

interface CommsHubProps {
  user?: any;
  initialTab?: CommsTab;
  onTabChange?: (tab: CommsTab) => void;
  isPopout?: boolean;
  showWindowControls?: boolean;
  onClose?: () => void;
  onPopOut?: () => void;
  onPopulateBooking?: (bookingData: any) => void;
  onOpenEditTrip?: (tripId: string) => void;
  drivers?: any[];
  trips?: Trip[];
}

interface CommsBatchActionBarProps {
  selectedCount: number;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onClear: () => void;
}

function CommsBatchActionBar({
  selectedCount,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onClear,
}: CommsBatchActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="p-2.5 px-3 bg-slate-900 text-white flex items-center justify-between gap-2 shadow-xs shrink-0 animate-in fade-in duration-150">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-xs font-bold text-slate-200">
          {selectedCount} selected
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onMarkRead}
          className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          title="Mark selected as Read"
        >
          <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>Mark Read</span>
        </button>
        <button
          type="button"
          onClick={onMarkUnread}
          className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          title="Mark selected as Unread"
        >
          <MailIcon className="w-3.5 h-3.5 text-blue-400" />
          <span>Mark Unread</span>
        </button>
        <button
          type="button"
          onClick={onArchive}
          className="px-2 py-1 rounded-md bg-rose-950/70 hover:bg-rose-900 text-xs font-semibold text-rose-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 border border-rose-800/40"
          title="Archive / Remove selected"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          <span>Archive</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="p-1 rounded-md text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-1"
          title="Clear selection"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface CommsFilterToolbarProps {
  isAllSelected: boolean;
  masterCheckboxRef?: React.RefObject<HTMLInputElement | null>;
  onToggleSelectAll: () => void;
  unreadCount: number;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  contactFilter: ContactFilter;
  onChangeContactFilter: (val: ContactFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  showChannelFilter?: boolean;
  channelFilter?: string;
  onChangeChannelFilter?: (val: string) => void;
  channelOptions?: { value: string; label: string }[];
  placeholder?: string;
}

function CommsFilterToolbar({
  isAllSelected,
  masterCheckboxRef,
  onToggleSelectAll,
  unreadCount,
  filterUnreadOnly,
  onToggleUnreadOnly,
  contactFilter,
  onChangeContactFilter,
  searchQuery,
  onChangeSearchQuery,
  showChannelFilter = false,
  channelFilter = 'all',
  onChangeChannelFilter,
  channelOptions = [],
  placeholder = 'Filter communications...',
}: CommsFilterToolbarProps) {
  return (
    <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="checkbox"
          ref={masterCheckboxRef}
          checked={isAllSelected}
          onChange={onToggleSelectAll}
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          title="Select/Deselect all communications in this view"
        />

        <button
          type="button"
          onClick={onToggleUnreadOnly}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
            filterUnreadOnly
              ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          Unread ({unreadCount})
        </button>

        {showChannelFilter && channelOptions.length > 0 && (
          <select
            value={channelFilter}
            onChange={(e) => onChangeChannelFilter && onChangeChannelFilter(e.target.value)}
            className="px-2 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 cursor-pointer"
          >
            {channelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        <select
          value={contactFilter}
          onChange={(e) => onChangeContactFilter(e.target.value as ContactFilter)}
          className="px-2 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 cursor-pointer"
        >
          <option value="all">All contacts</option>
          <option value="passengers">Passengers &amp; VIPs</option>
          <option value="drivers">Active Drivers</option>
        </select>
      </div>

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onChangeSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 w-44 focus:outline-blue-500"
        />
      </div>
    </div>
  );
}

const STORAGE_KEY_INTERACTIONS = 'ct_comms_interactions';

export function getClientTelephonyCredentials() {
  let sid = '';
  let token = '';
  let phone = '';
  let operatorPhone = '';
  let apiKeySid = '';
  let apiKeySecret = '';
  let twimlAppSid = '';

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      sid = localStorage.getItem('ct_twilio_sid') || '';
      token = localStorage.getItem('ct_twilio_token') || '';
      phone = localStorage.getItem('ct_twilio_phone') || '';
      operatorPhone = localStorage.getItem('ct_dispatch_operator_phone') || '';
      apiKeySid = localStorage.getItem('ct_twilio_api_key') || '';
      apiKeySecret = localStorage.getItem('ct_twilio_api_secret') || '';
      twimlAppSid = localStorage.getItem('ct_twilio_twiml_app_sid') || '';

      if (!sid || !token || !phone || !apiKeySid || !apiKeySecret || !twimlAppSid) {
        const stored = localStorage.getItem('chesterfield_taxi_app_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          const tel = parsed?.integrations?.telephony;
          if (tel) {
            sid = sid || tel.accountSid || '';
            token = token || tel.authToken || '';
            phone = phone || tel.phoneNumber || '';
            operatorPhone = operatorPhone || tel.operatorPhone || '';
            apiKeySid = apiKeySid || tel.apiKeySid || '';
            apiKeySecret = apiKeySecret || tel.apiKeySecret || '';
            twimlAppSid = twimlAppSid || tel.twimlAppSid || '';
          }
        }
      }
    } catch {
      // Ignore storage read failures
    }
  }

  return {
    accountSid: sid.trim(),
    authToken: token.trim(),
    phoneNumber: phone.trim() || '+13142281454',
    operatorPhone: operatorPhone.trim(),
    apiKeySid: apiKeySid.trim(),
    apiKeySecret: apiKeySecret.trim(),
    twimlAppSid: twimlAppSid.trim(),
  };
}

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
    const isMuted = localStorage.getItem('chesterfield_sound_muted') === 'true' || localStorage.getItem('ct_dispatch_sound_muted') === 'true';
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

export function CommsHub({
  user,
  initialTab = 'all',
  onTabChange,
  isPopout = false,
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
  const [callTypeFilter, setCallTypeFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed'>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Primary Interactions state (persisted to localStorage)
  const [interactions, setInteractions] = useState<InteractionEvent[]>(getInitialInteractions);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [forwardToast, setForwardToast] = useState<string | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Active call tracking & user notices
  const activeCallInteractionIdRef = useRef<string | null>(null);
  const [callNotice, setCallNotice] = useState<{ type: 'info' | 'warning' | 'error'; message: string } | null>(null);

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
  const [threadTab, setThreadTab] = useState<'all' | 'sms' | 'calls'>('all');
  const [smsReplyText, setSmsReplyText] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatusMessage, setSmsStatusMessage] = useState<string | null>(null);

  // Softphone state
  const [dialpadNumber, setDialpadNumber] = useState('');
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'on_hold'>('idle');
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
  const [isOnSpeaker, setIsOnSpeaker] = useState(false);
  const [callsSubTab, setCallsSubTab] = useState<'keypad' | 'history' | 'missed'>('history');
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
  const [softphoneStatus, setSoftphoneStatus] = useState<
    'unconfigured' | 'initializing' | 'ready' | 'connecting' | 'on_call' | 'error'
  >('unconfigured');
  const [incomingCallInfo, setIncomingCallInfo] = useState<{ from: string; callSid?: string } | null>(null);
  const deviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const incomingCallRef = useRef<any>(null);
  const handleEndCallRef = useRef<(broadcast?: boolean) => void>(() => {});

  // Audio voicemail & call recording playback state
  const [playingVoicemailId, setPlayingVoicemailId] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);

  // Contact Profile & Edit modal in CommsHub
  const [isContactEditOpen, setIsContactEditOpen] = useState(false);
  const [contactEditForm, setContactEditForm] = useState<Partial<ContactRecord>>({});
  const [contactSaveFeedback, setContactSaveFeedback] = useState<string | null>(null);
  const [activeContactRecord, setActiveContactRecord] = useState<ContactRecord | null>(null);
  const [corporateAccountsList, setCorporateAccountsList] = useState<CorporateAccountConfig[]>(DEFAULT_CORPORATE_ACCOUNTS);
  const [corpSearchQuery, setCorpSearchQuery] = useState('');
  const [isCorpDropdownOpen, setIsCorpDropdownOpen] = useState(false);

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
    return corporateAccountsList.filter(
      (a) =>
        (a.accountNumber && a.accountNumber.toLowerCase().includes(q)) ||
        (a.companyName && a.companyName.toLowerCase().includes(q)) ||
        (a.billingContactName && a.billingContactName.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [corporateAccountsList, corpSearchQuery]);

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
    return allContactsForMsg.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.mobilePhone && c.mobilePhone.includes(q)) ||
        ((c.corporateAccountNumber || (c as any).accountNumber || '').toLowerCase().includes(q))
    ).slice(0, 10);
  }, [allContactsForMsg, msgContactSearch]);

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

      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: val.e164,
          body: msgText,
          credentials: { accountSid: twilioSid, authToken: twilioToken, phoneNumber: sanitizeToE164(twilioPhone) },
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

  // ─── Twilio WebRTC Device Initialization ───
  useEffect(() => {
    let isMounted = true;
    let deviceInstance: any = null;

    const initWebRtcDevice = async () => {
      if (typeof window === 'undefined') return;
      const creds = getClientTelephonyCredentials();

      if (!creds.accountSid || !creds.apiKeySid || !creds.apiKeySecret || !creds.twimlAppSid) {
        if (isMounted) setSoftphoneStatus('unconfigured');
        return;
      }

      try {
        if (isMounted) setSoftphoneStatus('initializing');
        const tokenResp = await fetch('/api/telephony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_voice_token',
            credentials: creds,
            identity: 'dispatch_agent',
          }),
        });

        if (!tokenResp.ok) {
          if (isMounted) setSoftphoneStatus('error');
          return;
        }

        const tokenData = await tokenResp.json();
        if (!tokenData.success || !tokenData.token) {
          if (isMounted) setSoftphoneStatus('error');
          return;
        }

        const { Device, Call } = await import('@twilio/voice-sdk');
        if (!isMounted) return;

        const device = new Device(tokenData.token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          logLevel: 1,
        });
        deviceInstance = device;
        deviceRef.current = device;

        device.on('registered', () => {
          if (isMounted) setSoftphoneStatus('ready');
        });

        device.on('error', (twErr: any) => {
          console.warn('Twilio Voice Device Error:', twErr);
          if (isMounted) setSoftphoneStatus('error');
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
      } catch (err) {
        console.warn('Twilio WebRTC init error:', err);
        if (isMounted) setSoftphoneStatus('error');
      }
    };

    initWebRtcDevice();

    return () => {
      isMounted = false;
      stopInboundRingtone();
      if (deviceInstance) {
        try {
          deviceInstance.destroy();
        } catch {}
      }
      deviceRef.current = null;
    };
  }, []);

  const handleAcceptIncomingCall = () => {
    stopInboundRingtone();
    workspaceBus.publish('INCOMING_CALL_DISMISSED', {});
    const call = incomingCallRef.current;
    if (!call) return;
    const callerFrom = incomingCallInfo?.from || 'Passenger';
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

  // Subscribe to global workspace bus for cross-dock answering and rejection
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg) => {
      if (msg.type === 'ANSWER_INCOMING_CALL') {
        handleAcceptIncomingCall();
      } else if (msg.type === 'REJECT_INCOMING_CALL') {
        handleRejectIncomingCall();
      }
    });
    return () => unsub();
  }, []);

  // Audio element player effect
  useEffect(() => {
    if (!audioPlayerRef.current) return;
    const player = audioPlayerRef.current;

    const creds = getStoredTwilioCreds();
    const credParams =
      creds.sid && creds.token
        ? `&accountSid=${encodeURIComponent(creds.sid)}&authToken=${encodeURIComponent(creds.token)}`
        : '';

    let targetUrl: string | null = null;
    if (playingVoicemailId) {
      const vm = interactions.find((i) => i.id === playingVoicemailId);
      targetUrl = vm?.recordingSid
        ? `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(vm.recordingSid)}${credParams}`
        : (vm as any)?.audioUrl || null;
    } else if (playingCallId) {
      const call = interactions.find((i) => i.id === playingCallId);
      targetUrl = call?.recordingSid
        ? `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(call.recordingSid)}${credParams}`
        : (call as any)?.audioUrl || null;
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

  // Stable telephony data fetcher (voicemails, messages, call recordings)
  const fetchTelephonyData = async () => {
    try {
      const creds = getStoredTwilioCreds();
      const credParams =
        creds.sid && creds.token
          ? `&accountSid=${encodeURIComponent(creds.sid)}&authToken=${encodeURIComponent(creds.token)}`
          : '';

      const [vmResp, msgResp, recResp] = await Promise.all([
        fetch(`/api/telephony?action=list_voicemails${credParams}`),
        fetch(`/api/telephony?action=list_messages${credParams}`),
        fetch(`/api/telephony?action=list_recordings${credParams}`),
      ]);

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
                    errorMessage: m.errorMessage !== undefined ? m.errorMessage : existing.errorMessage,
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
                  errorCode: m.errorCode !== undefined ? m.errorCode : updatedPrev[optimisticIdx].errorCode,
                  errorMessage: m.errorMessage !== undefined ? m.errorMessage : updatedPrev[optimisticIdx].errorMessage,
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

            return [...newMsgs, ...updatedPrev].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
          });
        }
      }

      if (recResp.ok) {
        const recData = (await recResp.json()) as any;
        if (recData.success && Array.isArray(recData.recordings)) {
          setInteractions((prev) => {
            // Attach recordings to calls
            const updated = prev.map((item) => {
              if (item.type.startsWith('call_')) {
                const match = recData.recordings.find(
                  (r: any) =>
                    (item.callSid && r.callSid === item.callSid) ||
                    (item.recordingSid && r.sid === item.recordingSid)
                );
                if (match) {
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
            const unattached = recData.recordings
              .filter((r: any) => !existingRecSids.has(r.sid))
              .map((r: any) => ({
                id: `rec_${r.sid}`,
                type: 'call_inbound' as const,
                contactName: 'Recorded Call',
                contactPhone: '+13147391800',
                recordingSid: r.sid,
                audioDuration: r.duration,
                durationSeconds: r.durationSeconds,
                audioUrl: r.audioUrl,
                timestamp: r.dateCreated
                  ? new Date(r.dateCreated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : 'Recent',
                timestampMs: r.dateCreated ? new Date(r.dateCreated).getTime() : Date.now(),
                snippet: `Call Recording (${r.duration})`,
                isUnread: false,
              }));

            return [...unattached, ...updated];
          });
        }
      }
    } catch {
      // Fallback
    }
  };

  // Fetch live Twilio voicemails, messages, and recordings on mount & poll every 3.5s
  useEffect(() => {
    fetchTelephonyData();

    const interval = setInterval(() => {
      fetchTelephonyData();
    }, 3500);

    const onFocus = () => {
      fetchTelephonyData();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Focus dialpad input when switching to phone tab and keypad sub-tab
  useEffect(() => {
    if (activeTab === 'phone' && callsSubTab === 'keypad') {
      const timer = setTimeout(() => {
        dialpadInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, callsSubTab]);

  // Physical keyboard dialing response (0-9, *, #, +, Backspace, Enter)
  useEffect(() => {
    if (activeTab !== 'phone') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // If typing in another text input, textarea, or contenteditable, don't intercept
      if (target && target.tagName === 'INPUT' && target !== dialpadInputRef.current) {
        return;
      }
      if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
  }, [activeTab, dialpadNumber]);

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

    if (contactFilter === 'passengers' && item.contactType !== 'passenger' && item.contactType !== 'corporate') {
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

  const allHistoryCalls = useMemo(() => interactions.filter((item) => item.type.startsWith('call_')), [interactions]);
  const allMissedCalls = useMemo(() => interactions.filter((item) => item.type === 'call_missed'), [interactions]);
  const allVoicemails = useMemo(() => interactions.filter((item) => item.type === 'voicemail'), [interactions]);
  const allMessages = useMemo(
    () =>
      interactions.filter(
        (item) => item.type.startsWith('sms_') && !item.snippet?.includes('Thank you for contacting our dispatch desk')
      ),
    [interactions]
  );

  const filteredAllInteractions = useMemo(() => {
    return interactions.filter((item) => {
      if (item.snippet?.includes('Thank you for contacting our dispatch desk')) return false;
      if (channelFilter === 'calls' && !item.type.startsWith('call_')) return false;
      if (channelFilter === 'voicemail' && item.type !== 'voicemail') return false;
      if (channelFilter === 'messages' && !item.type.startsWith('sms_')) return false;
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

  const filteredMissedCalls = useMemo(() => allMissedCalls.filter(filterItem), [allMissedCalls, filterUnreadOnly, contactFilter, searchQuery]);
  const filteredVoicemails = useMemo(() => allVoicemails.filter(filterItem), [allVoicemails, filterUnreadOnly, contactFilter, searchQuery]);
  const filteredMessages = useMemo(() => allMessages.filter(filterItem), [allMessages, filterUnreadOnly, contactFilter, searchQuery]);

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
    return Array.from(threadMap.values()).sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }, [filteredMessages]);

  // Backward-compatible alias
  const filteredInteractions = filteredAllInteractions;

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
  }, [activeTab, callsSubTab, filteredAllInteractions, filteredHistoryCalls, filteredMissedCalls, filteredVoicemails, messageConversations]);

  const unreadCountAll = useMemo(() => interactions.filter((i) => i.isUnread).length, [interactions]);
  const unreadCountHistory = useMemo(() => allHistoryCalls.filter((i) => i.isUnread).length, [allHistoryCalls]);
  const unreadCountMissed = useMemo(() => allMissedCalls.filter((i) => i.isUnread).length, [allMissedCalls]);
  const unreadCountVoicemail = useMemo(() => allVoicemails.filter((i) => i.isUnread).length, [allVoicemails]);
  const unreadCountMessages = useMemo(() => allMessages.filter((i) => i.isUnread).length, [allMessages]);

  const unreadCount = unreadCountAll;

  // Broadcast live unread count changes to workspaceBus so headers and indicators stay perfectly synced
  useEffect(() => {
    workspaceBus.publish('UNREAD_COUNTS_CHANGED', {
      unreadMessages: unreadCountMessages,
      missedCalls: unreadCountMissed,
      unreadVoicemails: unreadCountVoicemail,
    });
  }, [workspaceBus, unreadCountMessages, unreadCountMissed, unreadCountVoicemail]);

  // Master checkbox selection calculation for active tab
  const isAllSelected =
    currentTabItems.length > 0 &&
    currentTabItems.every((item) => selectedItemIds.has(item.id));
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
    setInteractions((prev) =>
      prev.map((item) => (selectedItemIds.has(item.id) ? { ...item, isUnread: false } : item))
    );
    setSelectedItemIds(new Set());
  };

  const handleBatchMarkUnread = () => {
    setInteractions((prev) =>
      prev.map((item) => (selectedItemIds.has(item.id) ? { ...item, isUnread: true } : item))
    );
    setSelectedItemIds(new Set());
  };

  const handleBatchArchive = () => {
    setInteractions((prev) => prev.filter((item) => !selectedItemIds.has(item.id)));
    setSelectedItemIds(new Set());
  };

  const handleToggleReadStatus = (id: string) => {
    setInteractions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isUnread: !item.isUnread } : item))
    );
  };

  const handleArchiveItem = (id: string) => {
    setInteractions((prev) => prev.filter((item) => item.id !== id));
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

  // Selected contact thread all interactions
  const allSelectedContactInteractions = useMemo(() => {
    if (!selectedContactPhone) return [];
    const normTarget = normalizePhone(selectedContactPhone);
    return interactions
      .filter((i) => {
        if (i.snippet?.includes('Thank you for contacting our dispatch desk')) return false;
        const normContact = normalizePhone(i.contactPhone);
        const normMobile = i.mobilePhone ? normalizePhone(i.mobilePhone) : '';
        const normHome = i.homePhone ? normalizePhone(i.homePhone) : '';
        return (
          (normContact && normContact === normTarget) ||
          (normMobile && normMobile === normTarget) ||
          (normHome && normHome === normTarget)
        );
      })
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  }, [interactions, selectedContactPhone]);

  // Filtered interactions according to the thread's active sub-tab ('sms', 'calls', or 'all')
  const selectedInteractions = useMemo(() => {
    if (threadTab === 'sms') {
      return allSelectedContactInteractions.filter((i) => i.type.startsWith('sms_'));
    }
    if (threadTab === 'calls') {
      return allSelectedContactInteractions.filter((i) => i.type.startsWith('call_') || i.type === 'voicemail');
    }
    return allSelectedContactInteractions;
  }, [allSelectedContactInteractions, threadTab]);

  const threadSmsCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type.startsWith('sms_')).length,
    [allSelectedContactInteractions]
  );
  const threadCallCount = useMemo(
    () => allSelectedContactInteractions.filter((i) => i.type.startsWith('call_') || i.type === 'voicemail').length,
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

  // Active contact summary (derives from latest contact interaction or fallback)
  const activeContactSummary = useMemo(() => {
    const lastEvt = allSelectedContactInteractions[allSelectedContactInteractions.length - 1];
    const contactRec = selectedContactPhone ? getContactService().getContactByPhone(selectedContactPhone) : null;
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
    const found = contactService.getContactByPhone(selectedContactPhone);
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
          time: t.scheduledPickupTime ? new Date(t.scheduledPickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ASAP',
          pickupAddress: t.pickupLocation?.address || 'Pickup Point',
          dropoffAddress: t.dropoffLocation?.address || 'Destination',
          fare: t.pricing?.totalFare || 45,
        });
      }
    });
  }

  // Check matching caller trips for active in-call phone
  const activeCallerPhoneClean = (activeCallPhone || dialpadNumber || '').replace(/\D/g, '').slice(-10);
  const matchingCallerTrips: UpcomingBookingPreview[] = [];
  if (activeCallerPhoneClean) {
    trips.forEach((t) => {
      const passengerPhone = (t.passenger?.phone || (t as any).passengerPhone || '').replace(/\D/g, '').slice(-10);
      if (passengerPhone && passengerPhone === activeCallerPhoneClean) {
        matchingCallerTrips.push({
          id: t.id,
          time: t.scheduledPickupTime ? new Date(t.scheduledPickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ASAP',
          pickupAddress: t.pickupLocation?.address || 'Pickup Point',
          dropoffAddress: t.dropoffLocation?.address || 'Destination',
          fare: t.pricing?.totalFare || 45,
        });
      }
    });
  }

  // Handle dialpad press
  const handleDialDigit = (digit: string) => {
    setDialpadNumber((prev) => prev + digit);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveAgentAndCall = () => {
    const trimmed = setupAgentPhoneInput.trim();
    if (!trimmed) {
      setSetupAgentPhoneError('Please enter your mobile or desk phone number.');
      return;
    }
    const validated = validatePhoneNumber(trimmed);
    if (!validated.isValid) {
      setSetupAgentPhoneError(validated.error || 'Please enter a valid 10-digit phone number (e.g. 314-555-0100).');
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

    // ─── 1. TRUE IN-BROWSER WEBRTC SOFTPHONE (Direct Computer Mic & Headset) ───
    if (deviceRef.current && softphoneStatus === 'ready') {
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
        const call = await deviceRef.current.connect({
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
            message: callErr?.message || 'Softphone audio error. Check microphone permissions.',
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

    // Immediately log outbound call to history so it appears in Call History immediately
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

    // Broadcast outbound call started
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

      const resp = await fetch('/api/telephony', {
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
            : (resData.error || resData.message || 'Call failed to initiate on Twilio.');
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
    // 1. Disconnect active Twilio WebRTC call if active
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

    // If activeCallSid exists, terminate call on Twilio so caller/callee phone hangs up simultaneously
    if (activeCallSid) {
      try {
        const creds = getClientTelephonyCredentials();
        fetch('/api/telephony', {
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

    // Refresh telephony recordings after a short delay so Twilio recording callback is fetched
    setTimeout(() => {
      fetchTelephonyData();
    }, 4000);
  };
  handleEndCallRef.current = handleEndCall;

  // Synchronize remote call completion from Twilio PSTN
  useEffect(() => {
    if (!activeCallSid || (callStatus !== 'calling' && callStatus !== 'connected' && callStatus !== 'on_hold')) {
      return;
    }

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const creds = getClientTelephonyCredentials();
        const resp = await fetch('/api/telephony', {
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
      passengerName: contact?.name || (activeCallContact && activeCallContact !== 'Caller' ? activeCallContact : '') || '',
      passengerPhone: contact?.phone || rawPhone || '',
      passengerEmail: contact?.email || '',
      pickupAddress: contact?.homeAddress || contact?.workAddress || '',
      dropoffAddress: contact?.workAddress && contact?.homeAddress ? contact.workAddress : '',
      vehicleTier: contact?.preferredVehicleTier || '',
      corporateAccount: contact?.corporateAccountName || '',
      corporateAccountNumber: contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Direct phone reservation from call (${formatTimer(callTimer)})${contact?.notes ? ` | Contact notes: ${contact.notes}` : ''}`,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
    setBookingToast('Draft ready');
    setTimeout(() => setBookingToast(null), 2500);
  };

  const handleInCallSendLink = async () => {
    const targetPhone = activeCallPhone || dialpadNumber;
    if (!targetPhone) return;

    try {
      const creds = getClientTelephonyCredentials();
      const twilioSid = creds.accountSid;
      const twilioToken = creds.authToken;
      const twilioPhone = creds.phoneNumber || '+13142281454';

      await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: sanitizeToE164(targetPhone),
          body: 'Book your Chesterfield Taxi ride online anytime: https://chesterfieldtaxi.com/app',
          credentials: { accountSid: twilioSid, authToken: twilioToken, phoneNumber: sanitizeToE164(twilioPhone) },
        }),
      });

      setBookingToast('Link sent');
      setTimeout(() => setBookingToast(null), 2500);
    } catch {
      setBookingToast('Link sent');
      setTimeout(() => setBookingToast(null), 2500);
    }
  };

  const handleAppendCallNote = (chipText?: string) => {
    const noteToAdd = chipText || inCallNoteText.trim();
    if (!noteToAdd) return;

    const payload = {
      passengerPhone: activeCallPhone || dialpadNumber,
      notes: noteToAdd,
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
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
      additionalPhones: existing?.additionalPhones ? JSON.parse(JSON.stringify(existing.additionalPhones)) : [],
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
    const phone = contactEditForm.phone || activeContactSummary?.contactPhone || selectedContactPhone || '';
    if (!phone) return;

    // Filter out empty additional phones
    const cleanAdditional = (contactEditForm.additionalPhones || []).filter(
      (ap) => ap.number && ap.number.trim()
    );

    const updated = contactService.saveContact({
      ...contactEditForm,
      id: contactEditForm.id || activeContactRecord?.id || `cust_${Date.now()}`,
      name: contactEditForm.name || activeContactSummary?.contactName || formatDisplayPhone(phone),
      phone: phone.trim(),
      additionalPhones: cleanAdditional,
      customerScore: activeContactRecord?.customerScore ?? 90,
      tripCount: activeContactRecord?.tripCount ?? 1,
      totalSpend: activeContactRecord?.totalSpend ?? 0,
      isBlacklisted: activeContactRecord?.isBlacklisted ?? false,
    });

    setActiveContactRecord(updated);
    setContactSaveFeedback('Contact profile updated successfully');
    setTimeout(() => {
      setContactSaveFeedback(null);
      setIsContactEditOpen(false);
    }, 1200);
  };

  const handleSendSms = async () => {
    if (!smsReplyText.trim() || !selectedContactPhone) return;

    // Strict E.164 and NANP validation prior to dispatch
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

    // Optimistically prepend sent message to local interaction thread
    setInteractions((prev) => [newInteraction, ...prev]);

    setSmsReplyText('');

    try {
      const creds = getClientTelephonyCredentials();
      const twilioSid = creds.accountSid;
      const twilioToken = creds.authToken;
      const twilioPhone = creds.phoneNumber || '+13142281454';

      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: phoneValidation.e164,
          body: messageText,
          credentials: { accountSid: twilioSid, authToken: twilioToken, phoneNumber: sanitizeToE164(twilioPhone) },
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

  const handleConvertVoicemailToBooking = (suggested: any) => {
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
      corporateAccountNumber: contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
      accessibilityNeeds: contact?.accessibilityNeeds || {},
      notes: `Converted from Voicemail (Received ${suggested.pickupTime || 'earlier'})${contact?.notes ? ` | Contact notes: ${contact.notes}` : ''}`,
    };

    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
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
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-200">Incoming Softphone Call</p>
              <p className="text-sm font-bold font-mono">{formatDisplayPhone(incomingCallInfo.from)}</p>
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

      {/* ─── Segmented Sub-Toolbar Tabs (Omnichannel: All, Phone, Messages, Voicemail) ─── */}
      <div className="bg-white border-b border-slate-200 p-2 shrink-0">
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl text-center">
          <button
            type="button"
            onClick={() => {
              handleSelectTab('all');
              setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="truncate">All</span>
            {unreadCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black shrink-0 ${
                  activeTab === 'all' ? 'bg-white text-blue-600' : 'bg-rose-500 text-white'
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('phone');
              setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'phone'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Calls</span>
            {unreadCountMissed > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black shrink-0 ${
                  activeTab === 'phone' ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
                }`}
              >
                {unreadCountMissed}
              </span>
            )}
            {callStatus !== 'idle' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectTab('messages');
            }}
            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'messages'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MailIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Messages</span>
            {unreadCountMessages > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black shrink-0 ${
                  activeTab === 'messages' ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'
                }`}
              >
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
            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'voicemail'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="truncate">Voicemail</span>
            {unreadCountVoicemail > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black shrink-0 ${
                  activeTab === 'voicemail' ? 'bg-white text-blue-600' : 'bg-amber-500 text-white'
                }`}
              >
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
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Batch Actions Bar OR Filter Toolbar */}
            <CommsBatchActionBar
              selectedCount={selectedItemIds.size}
              onMarkRead={handleBatchMarkRead}
              onMarkUnread={handleBatchMarkUnread}
              onArchive={handleBatchArchive}
              onClear={() => setSelectedItemIds(new Set())}
            />
            {selectedItemIds.size === 0 && (
              <CommsFilterToolbar
                isAllSelected={isAllSelected}
                masterCheckboxRef={masterCheckboxRef}
                onToggleSelectAll={handleToggleSelectAll}
                unreadCount={unreadCountAll}
                filterUnreadOnly={filterUnreadOnly}
                onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
                contactFilter={contactFilter}
                onChangeContactFilter={setContactFilter}
                searchQuery={searchQuery}
                onChangeSearchQuery={setSearchQuery}
                showChannelFilter={true}
                channelFilter={channelFilter}
                onChangeChannelFilter={(val) => setChannelFilter(val as any)}
                channelOptions={[
                  { value: 'all', label: 'All channels' },
                  { value: 'calls', label: 'Calls Only' },
                  { value: 'voicemail', label: 'Voicemail Only' },
                  { value: 'messages', label: 'Messaging Only' },
                ]}
                placeholder="Filter communications..."
              />
            )}

            {/* Temporary Toast for Forward / Clipboard Copy */}
            {forwardToast && (
              <div className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>{forwardToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForwardToast(null)}
                  className="text-blue-200 hover:text-white"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Event rows list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredInteractions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No communications found matching the selected filters.
                </div>
              ) : (
                filteredInteractions.map((event) => {
                  const isRowSelected = selectedItemIds.has(event.id);
                  return (
                    <div
                      key={event.id}
                      onClick={() => setSelectedContactPhone(event.contactPhone)}
                      className={`group relative p-3 transition-all cursor-pointer flex items-start justify-between gap-2.5 border-l-4 ${
                        isRowSelected
                          ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                          : event.isUnread
                          ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                          : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                      }`}
                    >
                      {/* Checkbox column + Unread Indicator Dot */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectRow(event.id);
                        }}
                        className="pt-1 flex items-center gap-1.5 shrink-0"
                      >
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        {event.isUnread ? (
                          <span
                            className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                            title="Unread message"
                          />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                        )}
                      </div>

                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {/* Event Type Icon Badge */}
                        <div className="shrink-0 mt-0.5">
                          {event.type === 'voicemail' && (
                            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                              🎙️
                            </div>
                          )}
                          {event.type === 'call_inbound' && (
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                              <PhoneIcon className="w-4 h-4" />
                            </div>
                          )}
                          {event.type === 'call_missed' && (
                            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                              ✕
                            </div>
                          )}
                          {event.type.startsWith('sms_') && (
                            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                              <MailIcon className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        {/* Contact & Event Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs ${
                                event.isUnread
                                  ? 'font-black text-slate-900'
                                  : 'font-bold text-slate-800'
                              }`}
                            >
                              {event.contactName}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {event.contactPhone}
                            </span>
                            {event.homePhone && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                                🏠 Home Line
                              </span>
                            )}
                            {event.contactType === 'driver' && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                                Driver
                              </span>
                            )}
                          </div>

                          {/* Snippet / Transcript */}
                          <p
                            className={`text-xs line-clamp-1 mt-0.5 ${
                              event.isUnread ? 'text-slate-900 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {event.snippet}
                          </p>

                          {/* Voicemail Audio Controls, Speed, & Booking Shortcut */}
                          {event.type === 'voicemail' && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPlayingVoicemailId(
                                        playingVoicemailId === event.id ? null : event.id
                                      );
                                    }}
                                    className="w-7 h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                                  >
                                    {playingVoicemailId === event.id ? '⏸' : '▶'}
                                  </button>
                                  <span className="text-[11px] font-mono font-bold text-amber-900">
                                    {event.audioDuration}
                                  </span>
                                  <div className="h-2 w-24 bg-amber-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full bg-amber-600 ${
                                        playingVoicemailId === event.id ? 'w-2/3 animate-pulse' : 'w-0'
                                      }`}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold border border-amber-300 transition-colors cursor-pointer"
                                    title="Toggle playback speed"
                                  >
                                    {playbackSpeed}x
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartCall(event.contactPhone, event.contactName);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                                    title="Call customer"
                                  >
                                    <PhoneIcon className="w-2.5 h-2.5" />
                                    <span>Call</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConvertVoicemailToBooking(event.suggestedBooking);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <span>Book</span>
                                  </button>
                                </div>
                              </div>

                              {event.transcription && (
                                <p className="text-[11px] text-slate-700 italic border-l-2 border-amber-400 pl-2">
                                  "{event.transcription}"
                                </p>
                              )}
                            </div>
                          )}

                          {/* Call Recording Playback Scrubber for Call Events */}
                          {event.type.startsWith('call_') &&
                            (event.hasRecording ||
                              (event.durationSeconds && event.durationSeconds > 0)) && (
                              <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPlayingCallId(
                                          playingCallId === event.id ? null : event.id
                                        );
                                      }}
                                      className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                                    >
                                      {playingCallId === event.id ? '⏸' : '▶'}
                                    </button>
                                    <span className="text-[11px] font-mono font-bold text-emerald-950">
                                      {event.audioDuration ||
                                        `${Math.floor(
                                          (event.durationSeconds || 60) / 60
                                        )}:${((event.durationSeconds || 60) % 60)
                                          .toString()
                                          .padStart(2, '0')}`}
                                    </span>
                                    <div className="h-2 w-24 bg-emerald-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full bg-emerald-600 ${
                                          playingCallId === event.id ? 'w-2/3 animate-pulse' : 'w-0'
                                        }`}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
                                      }}
                                      className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                                      title="Playback speed"
                                    >
                                      {playbackSpeed}x
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartCall(event.contactPhone, event.contactName);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <PhoneIcon className="w-2.5 h-2.5" />
                                    <span>Call</span>
                                  </button>
                                </div>

                                {event.transcription && (
                                  <p className="text-[11px] text-slate-700 italic border-l-2 border-emerald-400 pl-2">
                                    "{event.transcription}"
                                  </p>
                                )}
                              </div>
                            )}
                        </div>
                      </div>

                      {/* Timestamp & Quick Badges */}
                      <div className="shrink-0 text-right flex flex-col items-end gap-1.5 pl-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {event.timestamp}
                        </span>
                        {event.type === 'call_missed' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartCall(event.contactPhone);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 cursor-pointer flex items-center gap-1"
                          >
                            <PhoneIcon className="w-2.5 h-2.5" />
                            <span>Call</span>
                          </button>
                        )}
                      </div>

                      {/* Hover Action Overlay Strip (Gmail / Linear Style) */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-3 top-3 hidden group-hover:flex items-center gap-1 bg-white/95 backdrop-blur-xs shadow-md border border-slate-200 rounded-xl px-2 py-1 z-20 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleReadStatus(event.id)}
                          title={event.isUnread ? 'Mark as Read' : 'Mark as Unread'}
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          {event.isUnread ? (
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <MailIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartCall(event.contactPhone, event.contactName)}
                          title={`Call ${event.contactName}`}
                          className="p-1 rounded-lg hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
                        >
                          <PhoneIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedContactPhone(event.contactPhone)}
                          title="Open SMS message thread"
                          className="p-1 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleForwardItem(event)}
                          title="Copy summary to clipboard"
                          className="p-1 rounded-lg hover:bg-amber-50 text-slate-600 hover:text-amber-600 transition-colors cursor-pointer"
                        >
                          <ExternalLinkIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveItem(event.id)}
                          title="Archive / Remove"
                          className="p-1 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: UNIFIED CONTACT CONVERSATION THREAD */}
        {selectedContactPhone && activeContactSummary && (
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Thread Header */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedContactPhone(null)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleOpenContactEdit}
                  className="text-left group hover:bg-slate-200/60 p-1.5 -m-1.5 rounded-xl transition-all cursor-pointer"
                  title="Click to view & edit contact profile"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                      <span>{activeContactRecord?.name || activeContactSummary.contactName}</span>
                      <span className="text-slate-400 group-hover:text-blue-600 text-xs">✎</span>
                    </span>
                    {activeContactRecord?.isVip && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-black uppercase">
                        VIP
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      Verified Contact
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>Calling: {activeContactSummary.contactPhone}</span>
                    {activeContactSummary.mobilePhone && (
                      <span className="text-blue-600 font-semibold">
                        • SMS Cell: {activeContactSummary.mobilePhone}
                      </span>
                    )}
                    <span className="text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      Edit Profile
                    </span>
                  </div>
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleStartCall(
                      activeContactSummary.mobilePhone || activeContactSummary.contactPhone
                    )
                  }
                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <PhoneIcon className="w-3 h-3" />
                  <span>Call</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const phone = activeContactSummary.mobilePhone || activeContactSummary.contactPhone || selectedContactPhone;
                    const contact = activeContactRecord || (phone ? getContactService().getContactByPhone(phone) : null);
                    const payload = {
                      passengerName: contact?.name || activeContactSummary.contactName || '',
                      passengerPhone: contact?.phone || phone || '',
                      passengerEmail: contact?.email || '',
                      pickupAddress: contact?.homeAddress || contact?.workAddress || '',
                      dropoffAddress: contact?.workAddress && contact?.homeAddress ? contact.workAddress : '',
                      vehicleTier: contact?.preferredVehicleTier || '',
                      corporateAccount: contact?.corporateAccountName || '',
                      corporateAccountNumber: contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
                      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
                      accessibilityNeeds: contact?.accessibilityNeeds || {},
                      notes: contact?.notes || '',
                    };
                    workspaceBus.publish('POPULATE_BOOKING', payload);
                    if (onPopulateBooking) {
                      onPopulateBooking(payload);
                    }
                  }}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>Book</span>
                </button>
              </div>
            </div>

            {/* Thread Channel Filter Sub-Bar & 10DLC Notice Banner */}
            <div className="bg-slate-100/90 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-white border border-slate-200/90 p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setThreadTab('all')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    threadTab === 'all'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({allSelectedContactInteractions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setThreadTab('sms')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                    threadTab === 'sms'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MailIcon className="w-3 h-3" />
                  <span>SMS ({threadSmsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setThreadTab('calls')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                    threadTab === 'calls'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PhoneIcon className="w-3 h-3" />
                  <span>Calls ({threadCallCount})</span>
                </button>
              </div>

              {has10DlcBlockedMessages && (
                <div className="flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-md font-medium">
                  <span className="font-bold text-amber-700">⚠ 10DLC Notice:</span>
                  <span className="hidden sm:inline">Carrier requires A2P 10DLC campaign registration.</span>
                </div>
              )}
            </div>

            {has10DlcBlockedMessages && (
              <div className="bg-amber-50/95 border-b border-amber-200 px-3 py-1.5 flex items-start gap-2 text-[11px] text-amber-900 shrink-0">
                <span className="font-bold text-amber-700 shrink-0">Carrier Alert:</span>
                <span className="leading-tight">
                  Outbound SMS to US mobile networks (Verizon/AT&T/T-Mobile) is blocked by carriers until A2P 10DLC Campaign registration is approved in Twilio Console. Inbound texts and VoIP delivery (e.g. 314-738-0100) are working normally.
                </span>
              </div>
            )}

            {/* Upcoming / Past Bookings Banner for Contact */}
            {upcomingBookingsForContact.length > 0 && (
              <div className="bg-blue-50/70 border-b border-blue-100 px-3 py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-900">1 Upcoming Reservation:</span>
                  <span className="text-blue-700">
                    {upcomingBookingsForContact[0].time} to {upcomingBookingsForContact[0].dropoffAddress}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const targetTrip = upcomingBookingsForContact[0];
                    if (targetTrip) {
                      workspaceBus.publish('OPEN_EDIT_TRIP', {
                        tripId: targetTrip.id,
                        phone: activeContactSummary.contactPhone || selectedContactPhone || undefined,
                      });
                      workspaceBus.publish('FOCUS_TRIP_ON_MAP', {
                        tripId: targetTrip.id,
                      });
                      if (onOpenEditTrip) {
                        onOpenEditTrip(targetTrip.id);
                      }
                    }
                  }}
                  className="text-[10px] font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
                >
                  View Trip
                </button>
              </div>
            )}

            {/* Thread Activity Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {selectedInteractions.map((evt, idx) => {
                const prevEvt = idx > 0 ? selectedInteractions[idx - 1] : null;
                const curDateStr = evt.timestampMs ? new Date(evt.timestampMs).toDateString() : '';
                const prevDateStr = prevEvt?.timestampMs ? new Date(prevEvt.timestampMs).toDateString() : '';
                const showDateSeparator = curDateStr && curDateStr !== prevDateStr;

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
                      <div className="self-start max-w-[80%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 shadow-xs">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="text-[10px] font-bold text-slate-600">
                            {evt.contactName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed">{evt.snippet}</p>
                      </div>
                    )}

                    {/* SMS Outbound Bubble */}
                    {evt.type === 'sms_outbound' && (
                      <div className="self-end max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 shadow-xs">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="text-[10px] text-blue-100 font-semibold">
                            Chesterfield Dispatch
                          </span>
                          <span className="text-[10px] text-blue-200 font-mono">
                            {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed">{evt.snippet}</p>
                        {evt.deliveryStatus && (
                          <div className="flex items-center justify-end gap-1 mt-1 text-[9px]">
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
                                className="text-amber-200 font-medium flex items-center gap-0.5"
                                title={evt.errorMessage || 'Carrier rejected delivery. US carriers require A2P 10DLC registration in Twilio Console.'}
                              >
                                ⚠ Undelivered (10DLC blocked)
                              </span>
                            ) : evt.deliveryStatus === 'failed' ? (
                              <span
                                className="text-rose-200 font-medium flex items-center gap-0.5"
                                title={evt.errorMessage || 'SMS dispatch failed'}
                              >
                                ⚠ Failed
                              </span>
                            ) : null}
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
                              `${Math.floor((evt.durationSeconds || 60) / 60)}:${((evt.durationSeconds || 60) % 60)
                                .toString()
                                .padStart(2, '0')}`}
                          </span>
                        </div>

                        {/* Call Recording Audio Scrubber */}
                        <div className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPlayingCallId(playingCallId === evt.id ? null : evt.id)
                              }
                              className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                            >
                              {playingCallId === evt.id ? '⏸' : '▶'}
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
                              onClick={() =>
                                setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))
                              }
                              className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                              title="Playback speed"
                            >
                              {playbackSpeed}x
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleStartCall(evt.contactPhone, evt.contactName)}
                            className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <PhoneIcon className="w-2.5 h-2.5" />
                            <span>Call</span>
                          </button>
                        </div>

                        {evt.transcription && (
                          <p className="text-[11px] text-slate-700 italic border-l-2 border-emerald-400 pl-2">
                            "{evt.transcription}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Voicemail Bubble with Audio Scrubber & Actions */}
                    {evt.type === 'voicemail' && (
                      <div className="self-start max-w-[85%] bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm p-3 shadow-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-900">
                            🎙️ Voicemail • {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                          </span>
                          <span className="text-[10px] font-mono text-amber-700 font-bold">{evt.audioDuration}</span>
                        </div>

                        {/* Voicemail Audio Scrubber */}
                        <div className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPlayingVoicemailId(playingVoicemailId === evt.id ? null : evt.id)
                              }
                              className="w-7 h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                            >
                              {playingVoicemailId === evt.id ? '⏸' : '▶'}
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
                              onClick={() =>
                                setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))
                              }
                              className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold border border-amber-300 transition-colors cursor-pointer"
                              title="Playback speed"
                            >
                              {playbackSpeed}x
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartCall(evt.contactPhone, evt.contactName)}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <PhoneIcon className="w-2.5 h-2.5" />
                              <span>Call</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConvertVoicemailToBooking(evt.suggestedBooking)}
                              className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <span>Book</span>
                            </button>
                          </div>
                        </div>

                        {evt.transcription && (
                          <p className="text-xs text-slate-800 italic border-l-2 border-amber-400 pl-2">
                            "{evt.transcription}"
                          </p>
                        )}
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
                      : 'No interactions recorded for this contact yet.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">Use the composer below to send an SMS text message.</p>
                </div>
              )}
              {/* Auto-scroll anchor to stick to the bottom of the thread */}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Response Templates & SMS Composer */}
            <div className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSmsReplyText('Your cab is 5 minutes away.')}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer"
                >
                  ⚡ "Cab is 5 mins away"
                </button>
                <button
                  type="button"
                  onClick={() => setSmsReplyText('Your driver has arrived outside.')}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer"
                >
                  ⚡ "Driver has arrived"
                </button>
                <button
                  type="button"
                  onClick={() => setSmsReplyText('We have confirmed your airport reservation.')}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer"
                >
                  ⚡ "Reservation confirmed"
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={smsReplyText}
                  onChange={(e) => setSmsReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendSms();
                  }}
                  placeholder={`Send SMS to ${
                    activeContactSummary.mobilePhone || activeContactSummary.contactPhone
                  }...`}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-blue-500 bg-slate-50 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={isSendingSms || !smsReplyText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSendingSms ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Send</span>
                </button>
              </div>

              {smsStatusMessage && (
                <p className="text-[10px] text-emerald-600 font-bold">{smsStatusMessage}</p>
              )}
            </div>
          </div>
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
                      callsSubTab === 'history' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {interactions.filter((item) => item.type.startsWith('call_')).length}
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
                  {interactions.filter((item) => item.type === 'call_missed').length > 0 && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded-full shrink-0 ${
                        callsSubTab === 'missed' ? 'bg-rose-100 text-rose-800' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {interactions.filter((item) => item.type === 'call_missed').length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* SUB-VIEW 1: KEYPAD OR ACTIVE CALL SCREEN */}
            {callsSubTab === 'keypad' && (
              callStatus !== 'idle' ? (
                <div className="flex-1 flex flex-col justify-between p-4 bg-slate-900 text-white overflow-y-auto min-h-0 space-y-4">
                  {/* Toast Notification */}
                  {bookingToast && (
                    <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl text-center shadow-md animate-in fade-in zoom-in-95 shrink-0">
                      ✓ {bookingToast}
                    </div>
                  )}

                  {/* Caller Info Header */}
                  <div className="flex flex-col items-center text-center space-y-2 pt-1 shrink-0">
                    <div className="relative">
                      <div
                        className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-xl shadow-lg ${
                          callStatus === 'connected'
                            ? 'bg-emerald-600 ring-4 ring-emerald-500/30'
                            : 'bg-amber-600 ring-4 ring-amber-500/30 animate-pulse'
                        }`}
                      >
                        {activeCallContact ? (
                          activeCallContact.charAt(0).toUpperCase()
                        ) : (
                          <PhoneIcon className="w-6 h-6 text-white" />
                        )}
                      </div>
                      {callStatus === 'connected' && !isMuted && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-black text-white truncate max-w-[240px]">
                        {activeCallContact || 'Unknown Caller'}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400">
                        {activeCallPhone ? formatDisplayPhone(activeCallPhone) : dialpadNumber}
                      </p>
                    </div>

                    {/* Status Pill & Waveform */}
                    <div className="flex items-center gap-2">
                      {callStatus === 'calling' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                          Calling...
                        </span>
                      )}
                      {callStatus === 'connected' && (
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-[11px] font-mono font-bold text-emerald-300">
                            {formatTimer(callTimer)}
                          </span>
                          {!isMuted && (
                            <div className="flex items-center gap-0.5 ml-1 h-2.5">
                              <span className="w-0.5 h-2 bg-emerald-400 animate-pulse rounded-full" />
                              <span className="w-0.5 h-2.5 bg-emerald-400 animate-pulse rounded-full delay-75" />
                              <span className="w-0.5 h-1.5 bg-emerald-400 animate-pulse rounded-full delay-150" />
                            </div>
                          )}
                        </div>
                      )}
                      {callStatus === 'on_hold' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                          <PauseIcon className="w-3 h-3" />
                          <span>On Hold</span>
                        </span>
                      )}
                    </div>

                    {/* Telephony Connection Notice */}
                    {callNotice && (
                      <div
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-medium max-w-xs text-center border ${
                          callNotice.type === 'info'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            : 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                        }`}
                      >
                        {callNotice.message}
                      </div>
                    )}
                  </div>

                  {/* Booking & Dispatch Actions Section */}
                  <div className="bg-slate-800/80 rounded-2xl p-2.5 border border-slate-700/80 space-y-2 shrink-0">
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={handleInCallBookRide}
                        className="py-2 px-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="Load into draft booking"
                      >
                        <CarIcon className="w-4 h-4 text-white" />
                        <span>Book</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowInCallTrips((v) => !v);
                          setShowInCallNotes(false);
                          setShowInCallKeypad(false);
                        }}
                        className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs ${
                          showInCallTrips
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        }`}
                        title="View trips for this caller"
                      >
                        <ClockIcon className="w-4 h-4 text-amber-300" />
                        <span>Trips</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleInCallSendLink}
                        className="py-2 px-1 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="Text web app link to caller"
                      >
                        <LinkIcon className="w-4 h-4 text-slate-300" />
                        <span>Link</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowInCallNotes((v) => !v);
                          setShowInCallTrips(false);
                          setShowInCallKeypad(false);
                        }}
                        className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs ${
                          showInCallNotes
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        }`}
                        title="Add notes to draft booking"
                      >
                        <FileTextIcon className="w-4 h-4 text-purple-300" />
                        <span>Note</span>
                      </button>
                    </div>

                    {/* Caller Trips Drawer */}
                    {showInCallTrips && (
                      <div className="pt-2 border-t border-slate-700/80 space-y-1.5 animate-in fade-in">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Caller Trips ({matchingCallerTrips.length})
                        </span>
                        {matchingCallerTrips.length === 0 ? (
                          <p className="text-[11px] text-slate-400 py-1 text-center">
                            No past or active trips for caller.
                          </p>
                        ) : (
                          matchingCallerTrips.slice(0, 2).map((tr) => (
                            <div
                              key={tr.id}
                              className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-white block truncate">
                                  {tr.time} • ${tr.fare}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {tr.pickupAddress} ➔ {tr.dropoffAddress}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const rawPhone = activeCallPhone || dialpadNumber;
                                    const contact = rawPhone ? getContactService().getContactByPhone(rawPhone) : null;
                                    const payload = {
                                      passengerName: contact?.name || (activeCallContact && activeCallContact !== 'Caller' ? activeCallContact : '') || '',
                                      passengerPhone: contact?.phone || rawPhone || '',
                                      passengerEmail: contact?.email || '',
                                      pickupAddress: tr.pickupAddress || contact?.homeAddress || '',
                                      dropoffAddress: tr.dropoffAddress || contact?.workAddress || '',
                                      vehicleTier: contact?.preferredVehicleTier || '',
                                      corporateAccount: contact?.corporateAccountName || '',
                                      corporateAccountNumber: contact?.corporateAccountNumber || (contact as any)?.accountNumber || '',
                                      billingPo: contact?.defaultPoNumber || (contact as any)?.billingPo || '',
                                      accessibilityNeeds: contact?.accessibilityNeeds || {},
                                      notes: `Re-booking route: ${tr.pickupAddress} -> ${tr.dropoffAddress}`,
                                    };
                                    workspaceBus.publish('POPULATE_BOOKING', payload);
                                    if (onPopulateBooking) onPopulateBooking(payload);
                                    setBookingToast('Trip loaded');
                                    setTimeout(() => setBookingToast(null), 2000);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer"
                                  title="Load this route into active draft reservation"
                                >
                                  Load
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    workspaceBus.publish('OPEN_EDIT_TRIP', {
                                      tripId: tr.id,
                                      phone: activeCallPhone || dialpadNumber,
                                    });
                                    if (onOpenEditTrip) {
                                      onOpenEditTrip(tr.id);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold cursor-pointer"
                                  title="Open trip in dispatch edit tab"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* In-Call Notes Drawer */}
                    {showInCallNotes && (
                      <div className="pt-2 border-t border-slate-700/80 space-y-1.5 animate-in fade-in">
                        <div className="flex flex-wrap gap-1">
                          {['Airport', 'Luggage', 'Car Seat', 'Cash', 'Van Req'].map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleAppendCallNote(chip)}
                              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-purple-900/60 border border-slate-700 text-slate-200 text-[10px] font-semibold transition-colors cursor-pointer"
                            >
                              +{chip}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="text"
                            value={inCallNoteText}
                            onChange={(e) => setInCallNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAppendCallNote();
                              }
                            }}
                            placeholder="Add booking note..."
                            className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleAppendCallNote()}
                            disabled={!inCallNoteText.trim()}
                            className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {/* DTMF Touch-tone Keypad Drawer */}
                    {showInCallKeypad && (
                      <div className="pt-2 border-t border-slate-700/80 space-y-1.5 animate-in fade-in">
                        <div className="grid grid-cols-3 gap-1.5">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => {
                                setActiveKeypadFeedback(k);
                                if (activeCallRef.current) {
                                  try {
                                    activeCallRef.current.sendDigits(k);
                                  } catch {}
                                }
                                setTimeout(() => setActiveKeypadFeedback(null), 150);
                              }}
                              className="py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-blue-600 text-white font-mono font-bold text-sm cursor-pointer shadow-xs"
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Core Phone Controls */}
                  <div className="grid grid-cols-4 gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const nextMute = !isMuted;
                        setIsMuted(nextMute);
                        if (activeCallRef.current) {
                          try {
                            activeCallRef.current.mute(nextMute);
                          } catch {}
                        }
                      }}
                      className={`p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                        isMuted
                          ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isMuted ? (
                        <MicOffIcon className="w-5 h-5 text-amber-300" />
                      ) : (
                        <MicIcon className="w-5 h-5 text-slate-300" />
                      )}
                      <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCallStatus((s) => (s === 'on_hold' ? 'connected' : 'on_hold'))
                      }
                      className={`p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                        callStatus === 'on_hold'
                          ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {callStatus === 'on_hold' ? (
                        <PlayIcon className="w-5 h-5 text-amber-300" />
                      ) : (
                        <PauseIcon className="w-5 h-5 text-slate-300" />
                      )}
                      <span>{callStatus === 'on_hold' ? 'Resume' : 'Hold'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowInCallKeypad((v) => !v);
                        setShowInCallTrips(false);
                        setShowInCallNotes(false);
                      }}
                      className={`p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                        showInCallKeypad
                          ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      <KeypadGridIcon className="w-5 h-5 text-slate-300" />
                      <span>Keypad</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEndCall}
                      className="p-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer shadow-lg shadow-rose-600/30 active:scale-95"
                    >
                      <PhoneOffIcon className="w-5 h-5 text-white" />
                      <span>End</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-white overflow-y-auto">
                <div className="w-full max-w-xs space-y-3.5">
                  <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-center relative focus-within:ring-2 focus-within:ring-blue-500/30">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1">
                      <span className="uppercase tracking-wider">
                        Caller ID: {formatDisplayPhone(getClientTelephonyCredentials().phoneNumber)}
                      </span>
                      {softphoneStatus === 'ready' ? (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200"
                          title="In-Browser Softphone active. Calls connect directly through your computer headset/microphone."
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Softphone: Headset Ready</span>
                        </span>
                      ) : softphoneStatus === 'initializing' ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200">
                          <SpinnerIcon className="w-2.5 h-2.5 animate-spin text-blue-600" />
                          <span>Connecting Softphone...</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditingOperatorPhone((v) => !v)}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 ${
                            operatorPhoneInput
                              ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                              : 'text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300'
                          }`}
                          title="Configure forwarding cell/desk line to bridge live calls"
                        >
                          {operatorPhoneInput ? `Agent Line: ${formatDisplayPhone(operatorPhoneInput)}` : '⚠️ Set Agent Line'}
                        </button>
                      )}
                    </div>
                    {isEditingOperatorPhone && (
                      <div className="mb-2 p-2 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-1.5 text-left">
                        <label className="text-[10px] font-bold text-slate-600 block">
                          Dispatcher Forwarding / Agent Phone:
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="tel"
                            value={operatorPhoneInput}
                            onChange={(e) => setOperatorPhoneInput(e.target.value)}
                            placeholder="(314) 555-0100"
                            className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-300 font-mono bg-slate-50 focus:bg-white focus:outline-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== 'undefined' && window.localStorage) {
                                localStorage.setItem('ct_dispatch_operator_phone', operatorPhoneInput.trim());
                              }
                              setIsEditingOperatorPhone(false);
                            }}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingOperatorPhone(false)}
                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-lg cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400">
                          Twilio calls the customer and bridges your agent phone into the live audio.
                        </p>
                      </div>
                    )}
                    <input
                      ref={dialpadInputRef}
                      type="text"
                      value={dialpadNumber}
                      onChange={(e) => setDialpadNumber(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (dialpadNumber.trim()) {
                            handleStartCall();
                          }
                        }
                      }}
                      placeholder="Type or click number..."
                      className="w-full text-center text-xl font-mono font-bold bg-transparent border-none focus:outline-none text-slate-900 mt-1"
                    />
                    {dialpadNumber && (
                      <button
                        type="button"
                        onClick={() => setDialpadNumber('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer p-1"
                        title="Clear number"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* 12 Key DTMF Matrix */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { key: '1', sub: '' },
                      { key: '2', sub: 'ABC' },
                      { key: '3', sub: 'DEF' },
                      { key: '4', sub: 'GHI' },
                      { key: '5', sub: 'JKL' },
                      { key: '6', sub: 'MNO' },
                      { key: '7', sub: 'PQRS' },
                      { key: '8', sub: 'TUV' },
                      { key: '9', sub: 'WXYZ' },
                      { key: '*', sub: '' },
                      { key: '0', sub: '+' },
                      { key: '#', sub: '' },
                    ].map((d) => {
                      const isPressed = activeKeypadFeedback === d.key;
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => handleDialDigit(d.key)}
                          className={`p-3.5 rounded-2xl transition-all flex flex-col items-center justify-center cursor-pointer shadow-xs active:scale-95 ${
                            isPressed
                              ? 'bg-blue-600 text-white scale-95 ring-2 ring-blue-400 shadow-md'
                              : 'bg-slate-100 hover:bg-slate-200 active:bg-blue-600 active:text-white text-slate-900'
                          }`}
                        >
                          <span className="text-lg font-black">{d.key}</span>
                          {d.sub && (
                            <span
                              className={`text-[9px] font-semibold ${
                                isPressed ? 'text-blue-100' : 'text-slate-400'
                              }`}
                            >
                              {d.sub}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Call Controls */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDialpadNumber((prev) => prev.slice(0, -1))}
                      disabled={!dialpadNumber}
                      className="p-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer flex-1"
                      title="Backspace"
                    >
                      ⌫ Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartCall()}
                      disabled={!dialpadNumber.trim()}
                      className="p-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-2xl text-xs font-extrabold transition-all cursor-pointer flex-2 flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95"
                    >
                      <PhoneIcon className="w-4 h-4" />
                      <span>Call Number</span>
                    </button>
                  </div>

                  {/* Quick Tip */}
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 font-medium">
                      Press 0-9 on keyboard to dial • Enter to call
                    </span>
                  </div>

                  {/* Driver Quick Dials */}
                  {drivers.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Cab Speed Dials
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {drivers.slice(0, 4).map((drv) => (
                          <button
                            key={drv.id}
                            type="button"
                            onClick={() => handleStartCall(drv.phone, `Cab #${drv.cabNumber}`)}
                            className="p-2 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50/30 text-left text-xs transition-colors cursor-pointer flex items-center justify-between"
                          >
                            <span className="font-bold text-slate-800 truncate">
                              Cab #{drv.cabNumber}
                            </span>
                            <PhoneIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Diagnostics & Simulation */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-medium">Inbound Call HUD:</span>
                    <button
                      type="button"
                      onClick={() => {
                        getWorkspaceBus().publish('CALL_INCOMING', {
                          callSid: `CA_${Date.now()}`,
                          callerNumber: '(314) 532-1200',
                          callerName: 'Sarah Jenkins',
                          numberType: 'home',
                          mobileForSms: '(314) 532-1200',
                          upcomingBookings: [
                            {
                              id: 'bk-994',
                              time: 'Tomorrow 6:00 AM',
                              pickupAddress: '14848 Conway Rd, Chesterfield, MO',
                              dropoffAddress: 'Lambert Airport Terminal 1 (STL)',
                              fare: 68.5,
                            },
                          ],
                          vipTag: 'VIP Executive',
                        });
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer flex items-center gap-1 shadow-2xs"
                      title="Simulate incoming call to test screen-pop HUD and ring audio"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Simulate Inbound</span>
                    </button>
                  </div>
                </div>
              </div>
              )
            )}

            {/* SUB-VIEW 2: CALL HISTORY */}
            {callsSubTab === 'history' && (
              <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
                <CommsBatchActionBar
                  selectedCount={selectedItemIds.size}
                  onMarkRead={handleBatchMarkRead}
                  onMarkUnread={handleBatchMarkUnread}
                  onArchive={handleBatchArchive}
                  onClear={() => setSelectedItemIds(new Set())}
                />
                {selectedItemIds.size === 0 && (
                  <CommsFilterToolbar
                    isAllSelected={isAllSelected}
                    masterCheckboxRef={masterCheckboxRef}
                    onToggleSelectAll={handleToggleSelectAll}
                    unreadCount={unreadCountHistory}
                    filterUnreadOnly={filterUnreadOnly}
                    onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
                    contactFilter={contactFilter}
                    onChangeContactFilter={setContactFilter}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={setSearchQuery}
                    showChannelFilter={true}
                    channelFilter={callTypeFilter}
                    onChangeChannelFilter={(val) => setCallTypeFilter(val as any)}
                    channelOptions={[
                      { value: 'all', label: 'All Call Types' },
                      { value: 'inbound', label: 'Inbound Only' },
                      { value: 'outbound', label: 'Outbound Only' },
                      { value: 'missed', label: 'Missed Only' },
                    ]}
                    placeholder="Filter call history..."
                  />
                )}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {filteredHistoryCalls.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 space-y-2">
                      <p className="text-xs font-bold text-slate-600">No Call History Matches</p>
                      <p className="text-[11px]">No call records match your current filter criteria.</p>
                    </div>
                  ) : (
                    filteredHistoryCalls.map((call) => {
                    const isCallPlaying = playingCallId === call.id;
                    const isMissed = call.type === 'call_missed';
                    const isOutbound = call.type === 'call_outbound';
                    const isRowSelected = selectedItemIds.has(call.id);

                    return (
                      <div
                        key={call.id}
                        onClick={() => setSelectedContactPhone(call.contactPhone)}
                        className={`group relative p-3.5 transition-all cursor-pointer space-y-2 border-l-4 ${
                          isRowSelected
                            ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                            : call.isUnread
                            ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                            : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                        }`}
                      >
                        {/* Caller Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectRow(call.id);
                              }}
                              className="flex items-center gap-1.5 shrink-0"
                            >
                              <input
                                type="checkbox"
                                checked={isRowSelected}
                                onChange={() => {}}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              {call.isUnread ? (
                                <span
                                  className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                                  title="Unread call"
                                />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                              )}
                            </div>
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                isMissed
                                  ? 'bg-rose-100 text-rose-600'
                                  : isOutbound
                                  ? 'bg-blue-100 text-blue-600'
                                  : 'bg-emerald-100 text-emerald-600'
                              }`}
                            >
                              <PhoneIcon className="w-3.5 h-3.5" />
                            </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-slate-900 truncate">
                              {call.contactName}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {call.contactPhone}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {call.timestamp}
                          </span>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md uppercase tracking-wider ${
                              isMissed
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isOutbound
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isMissed ? 'Missed' : isOutbound ? 'Outbound' : 'Inbound'}
                          </span>
                        </div>
                      </div>

                      {/* Snippet / Description */}
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                        {call.transcription || call.snippet}
                      </p>

                      {/* Audio Playback Scrubber if recording exists */}
                      {call.hasRecording && (
                        <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800">
                            <span className="flex items-center gap-1.5">
                              <MicIcon className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Call Recording</span>
                              <span className="text-slate-400 font-normal">
                                ({call.audioDuration || '2:14'})
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))
                              }
                              className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded font-mono font-bold text-[9px] text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                              title="Toggle playback speed"
                            >
                              {playbackSpeed}x
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPlayingCallId(isCallPlaying ? null : call.id)}
                              className="w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-2xs active:scale-95"
                            >
                              {isCallPlaying ? (
                                <PauseIcon className="w-3 h-3 text-white" />
                              ) : (
                                <PlayIcon className="w-3 h-3 text-white ml-0.5" />
                              )}
                            </button>
                            <div className="flex-1 h-2 bg-emerald-200/60 rounded-full overflow-hidden relative cursor-pointer">
                              <div
                                className={`h-full bg-emerald-500 rounded-full transition-all duration-300 ${
                                  isCallPlaying ? 'w-2/3 animate-pulse' : 'w-0'
                                }`}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-emerald-700 font-bold shrink-0">
                              {isCallPlaying ? '0:45' : call.audioDuration || '0:00'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Actions: Call Back / Dial */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setDialpadNumber(call.contactPhone);
                            setCallsSubTab('keypad');
                          }}
                          className="px-2 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Keypad
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartCall(call.contactPhone, call.contactName)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <PhoneIcon className="w-3 h-3" />
                          <span>Call</span>
                        </button>
                      </div>
                    </div>
                  );
                }))}
                </div>
              </div>
            )}

            {/* SUB-VIEW 3: MISSED CALLS INBOX */}
            {callsSubTab === 'missed' && (
              <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <CommsBatchActionBar
                  selectedCount={selectedItemIds.size}
                  onMarkRead={handleBatchMarkRead}
                  onMarkUnread={handleBatchMarkUnread}
                  onArchive={handleBatchArchive}
                  onClear={() => setSelectedItemIds(new Set())}
                />
                {selectedItemIds.size === 0 && (
                  <CommsFilterToolbar
                    isAllSelected={isAllSelected}
                    masterCheckboxRef={masterCheckboxRef}
                    onToggleSelectAll={handleToggleSelectAll}
                    unreadCount={unreadCountMissed}
                    filterUnreadOnly={filterUnreadOnly}
                    onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
                    contactFilter={contactFilter}
                    onChangeContactFilter={setContactFilter}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={setSearchQuery}
                    showChannelFilter={false}
                    placeholder="Filter missed calls..."
                  />
                )}
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                      <span>Missed Inbound Calls</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">Unanswered customer and driver attempts requiring callback</p>
                  </div>
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    {filteredMissedCalls.length} Missed
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {filteredMissedCalls.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 space-y-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-lg">
                        ✓
                      </div>
                      <p className="text-xs font-bold text-slate-600">No Missed Calls</p>
                      <p className="text-[11px]">All incoming call attempts have been answered or resolved.</p>
                    </div>
                  ) : (
                    filteredMissedCalls.map((call) => {
                      const isRowSelected = selectedItemIds.has(call.id);
                      return (
                        <div
                          key={call.id}
                          onClick={() => setSelectedContactPhone(call.contactPhone)}
                          className={`group relative p-3.5 transition-all cursor-pointer space-y-2.5 border-l-4 ${
                            isRowSelected
                              ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                              : call.isUnread
                              ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                              : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelectRow(call.id);
                                }}
                                className="flex items-center gap-1.5 shrink-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={isRowSelected}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                {call.isUnread ? (
                                  <span
                                    className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                                    title="Unread missed call"
                                  />
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                                )}
                              </div>
                              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
                                <PhoneIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-xs text-slate-900 truncate">
                                  {call.contactName}
                                </h4>
                                <p className="text-[11px] text-slate-600 font-mono font-medium">
                                  {call.contactPhone}
                                </p>
                              </div>
                            </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-500 font-medium block">
                            {call.timestamp}
                          </span>
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                            Missed Call
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 bg-rose-50/60 p-2 rounded-xl border border-rose-100">
                        {call.transcription || call.snippet}
                      </p>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setDialpadNumber(call.contactPhone);
                            setCallsSubTab('keypad');
                          }}
                          className="px-2 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Keypad
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartCall(call.contactPhone, call.contactName)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <PhoneIcon className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
          </div>
        )}

        {/* VIEW 4: VOICEMAIL INBOX */}
        {activeTab === 'voicemail' && !selectedContactPhone && (
          <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
            <CommsBatchActionBar
              selectedCount={selectedItemIds.size}
              onMarkRead={handleBatchMarkRead}
              onMarkUnread={handleBatchMarkUnread}
              onArchive={handleBatchArchive}
              onClear={() => setSelectedItemIds(new Set())}
            />
            {selectedItemIds.size === 0 && (
              <CommsFilterToolbar
                isAllSelected={isAllSelected}
                masterCheckboxRef={masterCheckboxRef}
                onToggleSelectAll={handleToggleSelectAll}
                unreadCount={unreadCountVoicemail}
                filterUnreadOnly={filterUnreadOnly}
                onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
                contactFilter={contactFilter}
                onChangeContactFilter={setContactFilter}
                searchQuery={searchQuery}
                onChangeSearchQuery={setSearchQuery}
                showChannelFilter={false}
                placeholder="Filter voicemails..."
              />
            )}
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-extrabold text-xs text-slate-900">Voicemail Inbox</h3>
                <p className="text-[11px] text-slate-500">Audio playback and automated booking transcripts</p>
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                {unreadCountVoicemail} New Voicemail
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
              {filteredVoicemails.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-lg">
                    ✓
                  </div>
                  <p className="text-xs font-bold text-slate-600">No Voicemails Found</p>
                  <p className="text-[11px]">No voicemail messages match your active filter.</p>
                </div>
              ) : (
                filteredVoicemails.map((vm) => {
                  const isRowSelected = selectedItemIds.has(vm.id);
                  return (
                    <div
                      key={vm.id}
                      onClick={() => handleToggleSelectRow(vm.id)}
                      className={`group relative p-3.5 transition-all cursor-pointer space-y-3 border-l-4 ${
                        isRowSelected
                          ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                          : vm.isUnread
                          ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                          : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectRow(vm.id);
                            }}
                            className="flex items-center gap-1.5 shrink-0"
                          >
                            <input
                              type="checkbox"
                              checked={isRowSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            {vm.isUnread ? (
                              <span
                                className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                                title="Unread voicemail"
                              />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                            )}
                          </div>
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{vm.contactName}</span>
                            <span className="text-[11px] font-mono text-slate-600">{vm.contactPhone}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">{vm.timestamp}</span>
                      </div>

                  {/* Audio Controls */}
                  <div className="flex items-center justify-between bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setPlayingVoicemailId(playingVoicemailId === vm.id ? null : vm.id)
                        }
                        className="w-9 h-9 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center shadow-xs cursor-pointer active:scale-95 transition-all"
                      >
                        {playingVoicemailId === vm.id ? (
                          <PauseIcon className="w-4 h-4 text-white" />
                        ) : (
                          <PlayIcon className="w-4 h-4 text-white ml-0.5" />
                        )}
                      </button>
                      <div>
                        <span className="text-xs font-mono font-bold text-slate-900 block">
                          {vm.audioDuration}
                        </span>
                        <span className="text-[10px] text-slate-400">Recorded via Twilio PSTN</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPlaybackSpeed(playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1)}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                        title="Toggle playback speed"
                      >
                        {playbackSpeed}x
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartCall(vm.contactPhone, vm.contactName)}
                        className="px-2 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                        title={`Call ${vm.contactName}`}
                      >
                        <PhoneIcon className="w-3 h-3" />
                        <span>Call</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleConvertVoicemailToBooking(vm.suggestedBooking)}
                        className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <span>Book</span>
                      </button>
                    </div>
                  </div>

                  {/* Transcript */}
                  {vm.transcription && (
                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Speech-to-Text Transcription
                      </span>
                      <p className="italic leading-relaxed">"{vm.transcription}"</p>
                    </div>
                  )}
                </div>
              );
            }))}
            </div>
          </div>
        )}

        {/* VIEW 5: MESSAGING LIST */}
        {activeTab === 'messages' && !selectedContactPhone && (
          <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
            {/* Messages Actions Header Bar */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">SMS Conversations</span>
                <span className="text-[10px] text-slate-500 font-medium">({messageConversations.length})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewMsgRecipientPhone('');
                  setNewMsgRecipientName('');
                  setNewMsgBody('');
                  setNewMsgError(null);
                  setMsgContactSearch('');
                  setIsNewMessageModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>New Message</span>
              </button>
            </div>

            <CommsBatchActionBar
              selectedCount={selectedItemIds.size}
              onMarkRead={handleBatchMarkRead}
              onMarkUnread={handleBatchMarkUnread}
              onArchive={handleBatchArchive}
              onClear={() => setSelectedItemIds(new Set())}
            />
            {selectedItemIds.size === 0 && (
              <CommsFilterToolbar
                isAllSelected={isAllSelected}
                masterCheckboxRef={masterCheckboxRef}
                onToggleSelectAll={handleToggleSelectAll}
                unreadCount={unreadCountMessages}
                filterUnreadOnly={filterUnreadOnly}
                onToggleUnreadOnly={() => setFilterUnreadOnly(!filterUnreadOnly)}
                contactFilter={contactFilter}
                onChangeContactFilter={setContactFilter}
                searchQuery={searchQuery}
                onChangeSearchQuery={setSearchQuery}
                showChannelFilter={false}
                placeholder="Filter messages..."
              />
            )}
            <div className="divide-y divide-slate-100">
            {messageConversations.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-3 px-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl font-bold">
                  💬
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">No Messages Found</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Start a new conversation with a customer or driver.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewMsgRecipientPhone('');
                    setNewMsgRecipientName('');
                    setNewMsgBody('');
                    setNewMsgError(null);
                    setMsgContactSearch('');
                    setIsNewMessageModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Compose Message</span>
                </button>
              </div>
            ) : (
              messageConversations.map((sms) => {
                const isRowSelected = selectedItemIds.has(sms.id);
                const unreadInThread = threadUnreadCountMap.get(normalizePhone(sms.contactPhone) || sms.contactPhone) || 0;
                const isThreadUnread = unreadInThread > 0 || sms.isUnread;
                return (
                  <div
                    key={sms.id}
                    onClick={() => setSelectedContactPhone(sms.contactPhone)}
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
                        handleToggleSelectRow(sms.id);
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
                          title="Unread SMS"
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                      )}
                    </div>

                    {/* Contact Initial Avatar */}
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {sms.contactName ? sms.contactName.charAt(0).toUpperCase() : '#'}
                    </div>

                    {/* Text Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-xs truncate ${
                              isThreadUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'
                            }`}
                          >
                            {sms.contactName}
                          </span>
                          {unreadInThread > 1 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold shrink-0">
                              {unreadInThread}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0">
                          {sms.timestamp}
                        </span>
                      </div>
                      <p
                        className={`text-xs line-clamp-1 mt-0.5 ${
                          isThreadUnread ? 'text-slate-900 font-medium' : 'text-slate-500'
                        }`}
                      >
                        {sms.snippet}
                      </p>
                    </div>

                    {/* Quick 1-Click Call */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartCall(sms.contactPhone, sms.contactName);
                      }}
                      title={`Call ${sms.contactName}`}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white transition-colors cursor-pointer shrink-0"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }))}
            </div>
          </div>
        )}
      </div>

      {/* AGENT PHONE SETUP MODAL */}
      {showAgentSetupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <PhoneIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Set Dispatcher Line</h3>
                <p className="text-[11px] text-slate-500">Connect your phone to speak live</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              To connect you with <strong className="text-slate-900">{pendingCallTarget?.name || pendingCallTarget?.phone}</strong>, enter your mobile or desk phone number. Twilio dials the recipient and simultaneously rings your phone so you speak together live.
            </p>

            <div className="space-y-1 mb-4">
              <label className="text-[11px] font-bold text-slate-700 block">
                Your Phone Number (Mobile or Desk):
              </label>
              <input
                type="tel"
                autoFocus
                placeholder="(314) 555-0100"
                value={setupAgentPhoneInput}
                onChange={(e) => {
                  setSetupAgentPhoneInput(e.target.value);
                  if (setupAgentPhoneError) setSetupAgentPhoneError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveAgentAndCall();
                  }
                }}
                className={`w-full px-3 py-2 text-sm rounded-xl border font-mono bg-slate-50 focus:bg-white focus:outline-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                  setupAgentPhoneError ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                }`}
              />
              {setupAgentPhoneError ? (
                <p className="text-[10px] text-rose-600 font-semibold">{setupAgentPhoneError}</p>
              ) : (
                <p className="text-[10px] text-slate-400">
                  Tip: Want to speak through your computer microphone & headset without ringing your cell phone? Configure Twilio WebRTC keys in Admin &gt; Integrations.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAgentSetupModal(false);
                  setPendingCallTarget(null);
                  setSetupAgentPhoneError(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAgentAndCall}
                className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <PhoneIcon className="w-3.5 h-3.5" />
                <span>Save & Call Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Profile & Edit Modal */}
      {isContactEditOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            setIsCorpDropdownOpen(false);
            setIsContactEditOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Passenger &amp; Contact Profile</h3>
                  <p className="text-[11px] text-slate-500">
                    Comprehensive customer record • Unified across dispatch, booking &amp; directory
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCorpDropdownOpen(false);
                  setIsContactEditOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Save Toast Feedback */}
            {contactSaveFeedback && (
              <div className="mx-6 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{contactSaveFeedback}</span>
              </div>
            )}

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto p-6 space-y-5 flex-1 text-xs">
              {/* ── Section 1: Passenger Name & VIP Status ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                    Passenger Identity
                  </span>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contactEditForm.isVip}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, isVip: e.target.checked }))
                      }
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span className="font-bold text-amber-800 text-xs">VIP Priority Client</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactEditForm.name || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g. Eleanor Vance"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      VIP Classification / Reason
                    </label>
                    <input
                      type="text"
                      disabled={!contactEditForm.isVip}
                      value={contactEditForm.vipReason || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, vipReason: e.target.value }))
                      }
                      placeholder={contactEditForm.isVip ? "e.g. Executive Board Member, Medical Priority" : "Enable VIP above to add reason"}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-blue-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 2: Phone Numbers (by Type) ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                      Phone Numbers
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                      {1 + (contactEditForm.additionalPhones?.length || 0)} Total
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPhone}
                    className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <PlusIcon className="w-3 h-3" />
                    <span>Add Phone Number</span>
                  </button>
                </div>

                {/* Primary Phone */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-blue-700 tracking-wider">
                      ★ Primary Phone
                    </span>
                    <span className="text-[10px] text-slate-400">Default dispatch &amp; SMS target</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={contactEditForm.primaryPhoneType || 'mobile'}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({
                          ...prev,
                          primaryPhoneType: e.target.value as PhoneType,
                        }))
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-blue-500 cursor-pointer text-xs"
                    >
                      <option value="mobile">Mobile (SMS)</option>
                      <option value="home">Home Landline</option>
                      <option value="work">Work / Office</option>
                      <option value="other">Other Phone</option>
                    </select>

                    <div className="sm:col-span-2">
                      <input
                        type="tel"
                        value={contactEditForm.phone || ''}
                        onChange={(e) =>
                          setContactEditForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        placeholder="+1 (314) 555-0199"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 font-mono text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Phones List */}
                {contactEditForm.additionalPhones && contactEditForm.additionalPhones.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Additional Numbers
                    </span>
                    {contactEditForm.additionalPhones.map((phoneItem, idx) => (
                      <div
                        key={phoneItem.id || idx}
                        className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                      >
                        <select
                          value={phoneItem.type || 'mobile'}
                          onChange={(e) =>
                            handleUpdatePhone(idx, { type: e.target.value as PhoneType })
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-blue-500 cursor-pointer text-xs sm:w-32 shrink-0"
                        >
                          <option value="mobile">Mobile</option>
                          <option value="home">Home</option>
                          <option value="work">Work</option>
                          <option value="other">Other</option>
                        </select>

                        <input
                          type="tel"
                          value={phoneItem.number || ''}
                          onChange={(e) => handleUpdatePhone(idx, { number: e.target.value })}
                          placeholder="Phone number..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 font-mono text-xs"
                        />

                        {phoneItem.type === 'work' && (
                          <input
                            type="text"
                            value={phoneItem.extension || ''}
                            onChange={(e) => handleUpdatePhone(idx, { extension: e.target.value })}
                            placeholder="Ext."
                            className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 text-xs shrink-0"
                          />
                        )}

                        <input
                          type="text"
                          value={phoneItem.label || ''}
                          onChange={(e) => handleUpdatePhone(idx, { label: e.target.value })}
                          placeholder="Label (e.g. Spouse, Office)"
                          className="sm:w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 text-xs shrink-0"
                        />

                        <button
                          type="button"
                          onClick={() => handleRemovePhone(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                          title="Remove phone number"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Section 3: Email Addresses & Notifications ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase block">
                  Email &amp; Digital Messaging
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Primary Email
                    </label>
                    <input
                      type="email"
                      value={contactEditForm.email || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="client@example.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Secondary / Invoicing Email
                    </label>
                    <input
                      type="email"
                      value={contactEditForm.secondaryEmail || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, secondaryEmail: e.target.value }))
                      }
                      placeholder="accounting@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={contactEditForm.smsNotifications !== false}
                    onChange={(e) =>
                      setContactEditForm((prev) => ({ ...prev, smsNotifications: e.target.checked }))
                    }
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-slate-700 font-semibold text-xs">
                    Send automated SMS dispatch &amp; chauffeur arrival notifications to primary mobile
                  </span>
                </label>
              </div>

              {/* ── Section 4: Searchable Corporate Account & Direct Billing ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="w-4 h-4 text-slate-600" />
                    <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                      Corporate Direct Billing
                    </span>
                  </div>
                  {(contactEditForm.corporateAccountNumber || contactEditForm.corporateAccountName) && (
                    <button
                      type="button"
                      onClick={() => {
                        setContactEditForm((prev) => ({
                          ...prev,
                          corporateAccountId: '',
                          corporateAccountNumber: '',
                          corporateAccountName: '',
                          defaultPoNumber: '',
                          billingDepartment: '',
                        }));
                        setCorpSearchQuery('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      ✕ Unlink Corporate Account
                    </button>
                  )}
                </div>

                {/* Active linked corporate account card */}
                {(contactEditForm.corporateAccountNumber || contactEditForm.corporateAccountName) && (
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold text-[10px] rounded-md">
                          {contactEditForm.corporateAccountNumber || 'CUSTOM-ACCT'}
                        </span>
                        <span className="font-bold text-blue-900 text-xs">
                          {contactEditForm.corporateAccountName || 'Corporate Billing'}
                        </span>
                      </div>
                      <p className="text-[10px] text-blue-700 mt-0.5">
                        Linked for monthly invoicing &amp; corporate discounted chauffeur rates.
                      </p>
                    </div>
                  </div>
                )}

                {/* Searchable Corporate Account Input */}
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Search Account Number or Company Name
                  </label>
                  <div className="relative">
                    <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={corpSearchQuery}
                      onChange={(e) => {
                        setCorpSearchQuery(e.target.value);
                        setIsCorpDropdownOpen(true);
                      }}
                      onFocus={() => setIsCorpDropdownOpen(true)}
                      placeholder="Type to search (e.g. CORP-BAY-902, Bayer, Centene, Enterprise...)"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 font-medium"
                    />
                  </div>

                  {/* Dropdown Suggestions */}
                  {isCorpDropdownOpen && (
                    <div
                      className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {filteredCorpAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => {
                            setContactEditForm((prev) => ({
                              ...prev,
                              corporateAccountId: acc.id,
                              corporateAccountNumber: acc.accountNumber,
                              corporateAccountName: acc.companyName,
                              defaultPoNumber: acc.currentPoNumber || prev.defaultPoNumber || '',
                            }));
                            setCorpSearchQuery(acc.accountNumber);
                            setIsCorpDropdownOpen(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 font-mono font-bold text-[10px] rounded border border-slate-200">
                                {acc.accountNumber}
                              </span>
                              <span className="font-bold text-slate-900 text-xs">
                                {acc.companyName}
                              </span>
                            </div>
                            {acc.billingContactName && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Contact: {acc.billingContactName} {acc.billingContactEmail ? `(${acc.billingContactEmail})` : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {acc.discountPercent && acc.discountPercent > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                                {acc.discountPercent}% Off
                              </span>
                            )}
                            <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 font-medium rounded">
                              {acc.poRequired ? 'PO Required' : 'PO Optional'}
                            </span>
                          </div>
                        </button>
                      ))}

                      {/* Custom account number fallback option */}
                      {corpSearchQuery.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = corpSearchQuery.trim();
                            setContactEditForm((prev) => ({
                              ...prev,
                              corporateAccountNumber: trimmed,
                              corporateAccountName: prev.corporateAccountName || trimmed,
                            }));
                            setIsCorpDropdownOpen(false);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-slate-100 transition-colors cursor-pointer text-blue-700 font-bold text-[11px] flex items-center gap-2"
                        >
                          <span>+ Use custom account number:</span>
                          <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-blue-900">
                            "{corpSearchQuery.trim()}"
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Department / Cost Center
                    </label>
                    <input
                      type="text"
                      value={contactEditForm.billingDepartment || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, billingDepartment: e.target.value }))
                      }
                      placeholder="e.g. Sales Division, R&amp;D"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Default PO # / Billing Reference
                    </label>
                    <input
                      type="text"
                      value={contactEditForm.defaultPoNumber || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, defaultPoNumber: e.target.value }))
                      }
                      placeholder="e.g. PO-88402"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 5: Saved Locations & Addresses ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPinIcon className="w-4 h-4 text-slate-600" />
                  <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                    Saved Addresses &amp; Locations
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Home Address
                    </label>
                    <input
                      type="text"
                      value={contactEditForm.homeAddress || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, homeAddress: e.target.value }))
                      }
                      placeholder="e.g. 14820 Conway Rd, Chesterfield, MO"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Work / Office Address
                    </label>
                    <input
                      type="text"
                      value={contactEditForm.workAddress || ''}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({ ...prev, workAddress: e.target.value }))
                      }
                      placeholder="e.g. 800 N Lindbergh Blvd, St. Louis, MO"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 6: Vehicle Preferences & Accessibility ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center gap-2">
                  <WheelchairIcon className="w-4 h-4 text-slate-600" />
                  <span className="text-[11px] font-black tracking-wide text-slate-700 uppercase">
                    Vehicle Class &amp; Accessibility
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Preferred Vehicle Tier
                    </label>
                    <select
                      value={contactEditForm.preferredVehicleTier || 'standard'}
                      onChange={(e) =>
                        setContactEditForm((prev) => ({
                          ...prev,
                          preferredVehicleTier: e.target.value as any,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 cursor-pointer font-medium"
                    >
                      <option value="standard">Standard Sedan (Town Car)</option>
                      <option value="executive">Executive Black Car (Lincoln Continental / Mercedes)</option>
                      <option value="suv">Luxury SUV (Cadillac Escalade / Suburban)</option>
                      <option value="van">Passenger Van (High-Capacity)</option>
                      <option value="wheelchair">WAV Wheelchair Accessible Vehicle (Hydraulic Ramp)</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      Mobility &amp; Assistance Needs
                    </span>
                    <div className="space-y-1.5 pt-0.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!contactEditForm.accessibilityNeeds?.wheelchair}
                          onChange={(e) =>
                            setContactEditForm((prev) => ({
                              ...prev,
                              accessibilityNeeds: {
                                ...prev.accessibilityNeeds,
                                wheelchair: e.target.checked,
                              },
                            }))
                          }
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="text-[11px] text-slate-700 font-medium">Wheelchair Ramp Required (WAV)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!contactEditForm.accessibilityNeeds?.walker}
                          onChange={(e) =>
                            setContactEditForm((prev) => ({
                              ...prev,
                              accessibilityNeeds: {
                                ...prev.accessibilityNeeds,
                                walker: e.target.checked,
                              },
                            }))
                          }
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="text-[11px] text-slate-700 font-medium">Folding Walker / Wheelchair Trunk Storage</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!contactEditForm.accessibilityNeeds?.serviceAnimal}
                          onChange={(e) =>
                            setContactEditForm((prev) => ({
                              ...prev,
                              accessibilityNeeds: {
                                ...prev.accessibilityNeeds,
                                serviceAnimal: e.target.checked,
                              },
                            }))
                          }
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="text-[11px] text-slate-700 font-medium">Certified Service Animal Accompanying</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!contactEditForm.accessibilityNeeds?.extraAssistance}
                          onChange={(e) =>
                            setContactEditForm((prev) => ({
                              ...prev,
                              accessibilityNeeds: {
                                ...prev.accessibilityNeeds,
                                extraAssistance: e.target.checked,
                              },
                            }))
                          }
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="text-[11px] text-slate-700 font-medium">Door-to-Door Arm Assistance Needed</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 7: Dispatcher & Driver Instructions ── */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  Internal Dispatcher &amp; Chauffeur Instructions
                </label>
                <textarea
                  rows={3}
                  value={contactEditForm.notes || ''}
                  onChange={(e) =>
                    setContactEditForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Gate code, terminal pickup preferences, baggage assistance instructions, requested drivers..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-blue-500 text-xs font-normal"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <a
                href={`/admin?tab=customers&phone=${encodeURIComponent(
                  contactEditForm.phone || activeContactSummary?.contactPhone || ''
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                <span>Open in Admin Customer Directory</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCorpDropdownOpen(false);
                    setIsContactEditOpen(false);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveContactFromHub}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>Save Contact Profile</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── NEW SMS MESSAGE MODAL ─── */}
      {isNewMessageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">New Text Message</h3>
                  <p className="text-[11px] text-slate-500">Send an SMS dispatch or chat with a passenger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewMessageModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              {newMsgError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {newMsgError}
                </div>
              )}

              {/* Recipient Search & Input */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient (Phone Number or Contact)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={msgContactSearch || newMsgRecipientPhone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMsgContactSearch(val);
                      setNewMsgRecipientPhone(val);
                      setIsMsgContactDropdownOpen(true);
                      setNewMsgError(null);
                    }}
                    onFocus={() => setIsMsgContactDropdownOpen(true)}
                    placeholder="Search contact by name, phone, or enter 10-digit number..."
                    className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs text-slate-900 bg-white focus:outline-blue-500 font-medium"
                  />
                  {newMsgRecipientName && (
                    <span className="absolute right-2.5 top-2 text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md pointer-events-none">
                      {newMsgRecipientName}
                    </span>
                  )}
                </div>

                {/* Dropdown search results */}
                {isMsgContactDropdownOpen && filteredContactsForMsg.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {filteredContactsForMsg.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          const chosenPhone = c.mobilePhone || c.phone;
                          setNewMsgRecipientPhone(chosenPhone);
                          setNewMsgRecipientName(c.name);
                          setMsgContactSearch(`${c.name} (${chosenPhone})`);
                          setIsMsgContactDropdownOpen(false);
                          setNewMsgError(null);
                        }}
                        className="p-2.5 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 block">{c.name}</span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {formatDisplayPhone(c.mobilePhone || c.phone)}
                            {c.corporateAccountName ? ` • ${c.corporateAccountName}` : ''}
                          </span>
                        </div>
                        {(c.corporateAccountNumber || (c as any).accountNumber) && (
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            {c.corporateAccountNumber || (c as any).accountNumber}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Message text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Message Text</label>
                  <span className="text-[10px] text-slate-400 font-medium">{newMsgBody.length} chars</span>
                </div>
                <textarea
                  rows={4}
                  value={newMsgBody}
                  onChange={(e) => {
                    setNewMsgBody(e.target.value);
                    setNewMsgError(null);
                  }}
                  placeholder="Type your message to passenger or driver..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 bg-white focus:outline-blue-500 resize-none font-normal"
                />
              </div>

              {/* Quick Preset Chips */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quick Responses
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Your driver is arriving shortly in a black sedan.',
                    'Your reservation has been confirmed with Chesterfield Taxi.',
                    'Please meet your chauffeur outside baggage claim.',
                    'Driver is waiting at pickup location.',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewMsgBody(preset)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      {preset.slice(0, 36)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <button
                type="button"
                onClick={handleOpenNewMessageThread}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                Open Thread
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewMessageModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSendingNewMsg}
                  onClick={handleSendNewMessage}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSendingNewMsg ? (
                    <>
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <MailIcon className="w-3.5 h-3.5" />
                      <span>Send SMS</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
