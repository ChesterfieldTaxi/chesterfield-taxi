import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getWorkspaceBus, type UpcomingBookingPreview } from '../../../core/services/workspace-bus.service';
import {
  matchPassengerByPhone,
  resolvePrimarySmsPhone,
  normalizePhone,
  DEFAULT_PASSENGER_ACCOUNT,
} from '../../../core/services/passenger.service';
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
} from '../../ui/Icons';

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
  hasRecording?: boolean;
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

const INITIAL_INTERACTIONS: InteractionEvent[] = [
  {
    id: 'int-1',
    type: 'voicemail',
    contactName: 'Sarah Jenkins',
    contactPhone: '(314) 532-1200', // Home phone
    homePhone: '(314) 532-1200',
    mobilePhone: '(314) 738-9921',
    contactType: 'passenger',
    timestamp: 'Today, 2:15 PM',
    timestampMs: Date.now() - 15 * 60 * 1000,
    durationSeconds: 34,
    audioDuration: '0:34',
    snippet: 'Voicemail: Airport pickup reservation for tomorrow morning 6:00 AM',
    transcription:
      'Hi Chesterfield Taxi, this is Sarah Jenkins calling from my home phone. I need a cab tomorrow morning at 6:00 AM from 14848 Conway Rd to Lambert Airport Terminal 1. Please text my cell at 314-738-9921 when the driver is on the way. Thank you!',
    isUnread: true,
    suggestedBooking: {
      passengerName: 'Sarah Jenkins',
      passengerPhone: '(314) 738-9921',
      pickup: '14848 Conway Rd, Chesterfield, MO 63017',
      dropoff: 'Lambert St. Louis International Airport (STL) Terminal 1',
      pickupTime: 'Tomorrow 06:00 AM',
    },
  },
  {
    id: 'int-2',
    type: 'sms_inbound',
    contactName: 'Cab 14 - Dave Miller',
    contactPhone: '(314) 555-0144',
    mobilePhone: '(314) 555-0144',
    contactType: 'driver',
    timestamp: 'Today, 2:02 PM',
    timestampMs: Date.now() - 28 * 60 * 1000,
    snippet: 'Passenger picked up at Bayer Campus Building A. On route to STL Airport.',
    isUnread: false,
  },
  {
    id: 'int-3',
    type: 'call_missed',
    contactName: 'Mercy Hospital ER Desk',
    contactPhone: '(314) 251-6000',
    contactType: 'corporate',
    timestamp: 'Today, 1:45 PM',
    timestampMs: Date.now() - 45 * 60 * 1000,
    snippet: 'Missed Call – No voicemail left (Ranged for 18 sec)',
    isUnread: true,
  },
  {
    id: 'int-4',
    type: 'call_inbound',
    contactName: 'Robert Vance',
    contactPhone: '(314) 555-0182',
    mobilePhone: '(314) 555-0182',
    contactType: 'passenger',
    timestamp: 'Today, 1:12 PM',
    timestampMs: Date.now() - 78 * 60 * 1000,
    durationSeconds: 134,
    audioDuration: '2:14',
    hasRecording: true,
    transcription:
      'Passenger called to confirm pickup at Chesterfield Mall Entrance 3. Advised driver to look for green luggage.',
    snippet: 'Call ended – 2 min 14 sec (Recording available)',
    isUnread: false,
  },
  {
    id: 'int-5',
    type: 'sms_outbound',
    contactName: 'Sarah Jenkins',
    contactPhone: '(314) 738-9921',
    mobilePhone: '(314) 738-9921',
    contactType: 'passenger',
    timestamp: 'Today, 11:30 AM',
    timestampMs: Date.now() - 180 * 60 * 1000,
    snippet: 'Chesterfield Taxi: Driver Dave in Cab #14 is 4 mins away in a White Toyota Sienna.',
    isUnread: false,
  },
  {
    id: 'int-6',
    type: 'call_outbound',
    contactName: 'Cab 11 - Marcus Brody',
    contactPhone: '(314) 555-0199',
    mobilePhone: '(314) 555-0199',
    contactType: 'driver',
    timestamp: 'Today, 11:15 AM',
    timestampMs: Date.now() - 195 * 60 * 1000,
    durationSeconds: 58,
    audioDuration: '0:58',
    hasRecording: true,
    transcription:
      'Dispatcher called Marcus to re-route via I-64 due to heavy construction on Olive Blvd. Marcus acknowledged and took highway.',
    snippet: 'Outbound Call ended – 58 sec (Recording available)',
    isUnread: false,
  },
  {
    id: 'int-7',
    type: 'call_missed',
    contactName: 'Dr. Elena Rossi',
    contactPhone: '(314) 555-0191',
    mobilePhone: '(314) 555-0191',
    contactType: 'passenger',
    timestamp: 'Today, 12:40 PM',
    timestampMs: Date.now() - 110 * 60 * 1000,
    snippet: 'Missed Call – Caller rang 24 seconds without leaving voicemail.',
    isUnread: true,
  },
];

interface CommsHubProps {
  user?: any;
  initialTab?: CommsTab;
  isPopout?: boolean;
  showWindowControls?: boolean;
  onClose?: () => void;
  onPopOut?: () => void;
  onPopulateBooking?: (bookingData: any) => void;
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

export function CommsHub({
  user,
  initialTab = 'all',
  isPopout = false,
  showWindowControls = false,
  onClose,
  onPopOut,
  onPopulateBooking,
  drivers = [],
  trips = [],
}: CommsHubProps) {
  const [activeTab, setActiveTab] = useState<CommsTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [callTypeFilter, setCallTypeFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed'>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Primary Interactions state
  const [interactions, setInteractions] = useState<InteractionEvent[]>(INITIAL_INTERACTIONS);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [forwardToast, setForwardToast] = useState<string | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Selected thread state
  const [selectedContactPhone, setSelectedContactPhone] = useState<string | null>(null);
  const [smsReplyText, setSmsReplyText] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatusMessage, setSmsStatusMessage] = useState<string | null>(null);

  // Softphone state
  const [dialpadNumber, setDialpadNumber] = useState('');
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'on_hold'>('idle');
  const [activeCallContact, setActiveCallContact] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnSpeaker, setIsOnSpeaker] = useState(false);
  const [callsSubTab, setCallsSubTab] = useState<'keypad' | 'history' | 'missed'>('keypad');
  const [activeKeypadFeedback, setActiveKeypadFeedback] = useState<string | null>(null);
  const dialpadInputRef = useRef<HTMLInputElement>(null);

  // Audio voicemail & call recording playback state
  const [playingVoicemailId, setPlayingVoicemailId] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);

  // Cross-Window Workspace Bus
  const workspaceBus = getWorkspaceBus();

  // Call duration counter
  useEffect(() => {
    let interval: any;
    if (callStatus === 'connected') {
      interval = setInterval(() => setCallTimer((prev) => prev + 1), 1000);
    } else {
      setCallTimer(0);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

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
  const allMessages = useMemo(() => interactions.filter((item) => item.type.startsWith('sms_')), [interactions]);

  const filteredAllInteractions = useMemo(() => {
    return interactions.filter((item) => {
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
    if (activeTab === 'messages') return filteredMessages;
    return filteredAllInteractions;
  }, [activeTab, callsSubTab, filteredAllInteractions, filteredHistoryCalls, filteredMissedCalls, filteredVoicemails, filteredMessages]);

  const unreadCountAll = useMemo(() => interactions.filter((i) => i.isUnread).length, [interactions]);
  const unreadCountHistory = useMemo(() => allHistoryCalls.filter((i) => i.isUnread).length, [allHistoryCalls]);
  const unreadCountMissed = useMemo(() => allMissedCalls.filter((i) => i.isUnread).length, [allMissedCalls]);
  const unreadCountVoicemail = useMemo(() => allVoicemails.filter((i) => i.isUnread).length, [allVoicemails]);
  const unreadCountMessages = useMemo(() => allMessages.filter((i) => i.isUnread).length, [allMessages]);

  const unreadCount = unreadCountAll;

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

  // Selected contact thread interactions
  const selectedInteractions = selectedContactPhone
    ? interactions.filter(
        (i) =>
          normalizePhone(i.contactPhone) === normalizePhone(selectedContactPhone) ||
          (i.mobilePhone && normalizePhone(i.mobilePhone) === normalizePhone(selectedContactPhone)) ||
          (i.homePhone && normalizePhone(i.homePhone) === normalizePhone(selectedContactPhone))
      )
    : [];

  const activeContactSummary = selectedInteractions[0] || null;

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

  // Handle dialpad press
  const handleDialDigit = (digit: string) => {
    setDialpadNumber((prev) => prev + digit);
  };

  const handleStartCall = (numberToCall?: string, contactName?: string) => {
    const num = numberToCall || dialpadNumber;
    if (!num.trim()) return;
    setCallStatus('calling');
    setActiveCallContact(contactName ? `${contactName} (${num})` : num);

    setTimeout(() => {
      setCallStatus('connected');
    }, 1500);
  };

  const handleEndCall = () => {
    workspaceBus.publish('CALL_ENDED', { durationSeconds: callTimer });
    setCallStatus('idle');
    setActiveCallContact(null);
    setCallTimer(0);
  };

  const handleSendSms = async () => {
    if (!smsReplyText.trim() || !selectedContactPhone) return;
    setIsSendingSms(true);
    setSmsStatusMessage(null);

    try {
      const twilioSid = typeof window !== 'undefined' ? localStorage.getItem('ct_twilio_sid') || '' : '';
      const twilioToken = typeof window !== 'undefined' ? localStorage.getItem('ct_twilio_token') || '' : '';
      const twilioPhone = typeof window !== 'undefined' ? localStorage.getItem('ct_twilio_phone') || '+13145550199' : '';

      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: selectedContactPhone,
          body: smsReplyText.trim(),
          credentials: { accountSid: twilioSid, authToken: twilioToken, phoneNumber: twilioPhone },
        }),
      });

      const resData = (await resp.json()) as any;
      if (resData.success) {
        setSmsStatusMessage('SMS dispatched via Twilio Gateway.');
        setSmsReplyText('');
        setTimeout(() => setSmsStatusMessage(null), 3000);
      } else {
        setSmsStatusMessage(`Dispatched in sandbox mode: "${smsReplyText}"`);
        setSmsReplyText('');
        setTimeout(() => setSmsStatusMessage(null), 3000);
      }
    } catch (e) {
      setSmsStatusMessage('Sent to passenger via local buffer.');
      setSmsReplyText('');
      setTimeout(() => setSmsStatusMessage(null), 3000);
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleConvertVoicemailToBooking = (suggested: any) => {
    if (!suggested) return;
    const payload = {
      passengerName: suggested.passengerName,
      passengerPhone: suggested.passengerPhone,
      pickupAddress: suggested.pickup,
      dropoffAddress: suggested.dropoff,
      notes: `Converted from Voicemail (Received ${suggested.pickupTime})`,
    };

    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) {
      onPopulateBooking(payload);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-slate-50 text-slate-900 ${isPopout ? 'h-screen' : ''}`}>
      {/* ─── Segmented Sub-Toolbar Tabs (Omnichannel: All, Phone, Messages, Voicemail) ─── */}
      <div className="bg-white border-b border-slate-200 p-2 shrink-0">
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl text-center">
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
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
              setActiveTab('phone');
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
            {callStatus !== 'idle' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'messages'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MailIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Messages</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('voicemail');
              setSelectedContactPhone(null);
            }}
            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
              activeTab === 'voicemail'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="truncate">Voicemail</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 font-bold shrink-0">
              1
            </span>
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

      {/* ─── ACTIVE CALL BANNER (If call in progress) ─── */}
      {callStatus !== 'idle' && (
        <div className="bg-emerald-600 text-white p-3 shrink-0 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <PhoneIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-extrabold flex items-center gap-2">
                <span>In Call with: {activeCallContact}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono font-normal">
                  {Math.floor(callTimer / 60)}:{(callTimer % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <span className="text-[10px] text-emerald-100">Twilio PSTN Bridge Active</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                isMuted ? 'bg-rose-500 text-white' : 'bg-emerald-700 hover:bg-emerald-800 text-white'
              }`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={handleEndCall}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs"
            >
              End Call
            </button>
          </div>
        </div>
      )}

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
                                    title="Call back customer"
                                  >
                                    <PhoneIcon className="w-2.5 h-2.5" />
                                    <span>Call Back</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConvertVoicemailToBooking(event.suggestedBooking);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <span>➕ Convert to Booking</span>
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
                                    <span>Call Back</span>
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
                            <span>Call back</span>
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

        {/* VIEW 2: UNIFIED CONTACT CONVERSATION THREAD (When contact is clicked in All or Messages) */}
        {(activeTab === 'all' || activeTab === 'messages') && selectedContactPhone && activeContactSummary && (
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Thread Header */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedContactPhone(null)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ← All
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">
                      {activeContactSummary.contactName}
                    </span>
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
                  </div>
                </div>
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
                    workspaceBus.publish('POPULATE_BOOKING', {
                      passengerName: activeContactSummary.contactName,
                      passengerPhone:
                        activeContactSummary.mobilePhone || activeContactSummary.contactPhone,
                      callingFromPhone: activeContactSummary.homePhone,
                    });
                  }}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>➕ Book Ride</span>
                </button>
              </div>
            </div>

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
                  onClick={() =>
                    workspaceBus.publish('FOCUS_TRIP_ON_MAP', {
                      tripId: upcomingBookingsForContact[0].id,
                    })
                  }
                  className="text-[10px] font-bold text-blue-700 underline hover:text-blue-900"
                >
                  View Trip
                </button>
              </div>
            )}

            {/* Thread Activity Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {selectedInteractions.map((evt) => (
                <div key={evt.id} className="flex flex-col">
                  {/* SMS Inbound Bubble */}
                  {evt.type === 'sms_inbound' && (
                    <div className="self-start max-w-[80%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 shadow-xs">
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">
                        {evt.contactName} • {evt.timestamp}
                      </span>
                      <p className="text-xs text-slate-800">{evt.snippet}</p>
                    </div>
                  )}

                  {/* SMS Outbound Bubble */}
                  {evt.type === 'sms_outbound' && (
                    <div className="self-end max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 shadow-xs">
                      <span className="text-[10px] text-blue-200 block mb-1 font-semibold">
                        Chesterfield Dispatch • {evt.timestamp}
                      </span>
                      <p className="text-xs">{evt.snippet}</p>
                    </div>
                  )}

                  {/* Call Event with Recording Playback (Just like voicemail) */}
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
                            • {evt.timestamp}
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
                          <span>Call Back</span>
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
                          🎙️ Voicemail • {evt.timestamp}
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
                            <span>Call Back</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConvertVoicemailToBooking(evt.suggestedBooking)}
                            className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <span>➕ Convert to Booking</span>
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
              ))}
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
                  <span>Send SMS</span>
                </button>
              </div>

              {smsStatusMessage && (
                <p className="text-[10px] text-emerald-600 font-bold">{smsStatusMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: FULL DTMF NUMERIC DIALPAD & SOFTPHONE / CALL HISTORY */}
        {activeTab === 'phone' && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
            {/* Top Sub-Switcher: Keypad vs All Calls vs Missed */}
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/80 shrink-0">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl">
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

            {/* SUB-VIEW 1: KEYPAD */}
            {callsSubTab === 'keypad' && (
              <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-white overflow-y-auto">
                <div className="w-full max-w-xs space-y-3.5">
                  <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-center relative focus-within:ring-2 focus-within:ring-blue-500/30">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Outbound Caller ID: (314) 738-0100
                    </span>
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
                </div>
              </div>
            )}

            {/* SUB-VIEW 2: CALL HISTORY */}
            {callsSubTab === 'history' && (
              <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 overflow-y-auto">
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
                <div className="p-3 space-y-2.5">
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
                        onClick={() => handleToggleSelectRow(call.id)}
                        className={`p-3 rounded-2xl border transition-all space-y-2 border-l-4 cursor-pointer ${
                          isRowSelected
                            ? 'bg-blue-100/70 border-blue-300 border-l-blue-700 shadow-2xs'
                            : call.isUnread
                            ? 'bg-blue-50/70 hover:bg-blue-100/60 border-blue-200 border-l-blue-600 font-semibold'
                            : 'bg-white hover:bg-slate-50 border-slate-200 border-l-transparent text-slate-700'
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
                            <span className="flex items-center gap-1">
                              <span>🎙️ Call Recording</span>
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
                              className="w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-2xs active:scale-95 text-xs font-bold"
                            >
                              {isCallPlaying ? '⏸' : '▶'}
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
                          className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Copy to Keypad
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartCall(call.contactPhone, call.contactName)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <PhoneIcon className="w-3 h-3" />
                          <span>Call Back</span>
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
              <div className="flex-1 flex flex-col bg-white overflow-y-auto">
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
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
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
                          onClick={() => handleToggleSelectRow(call.id)}
                          className={`p-3 rounded-2xl border transition-all space-y-2.5 border-l-4 cursor-pointer ${
                            isRowSelected
                              ? 'bg-blue-100/70 border-blue-300 border-l-blue-700 shadow-2xs'
                              : call.isUnread
                              ? 'bg-blue-50/70 hover:bg-blue-100/60 border-rose-200 border-l-blue-600 font-semibold'
                              : 'bg-white hover:bg-slate-50 border-rose-100 border-l-transparent text-slate-700'
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
                          className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Copy to Keypad
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartCall(call.contactPhone, call.contactName)}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <PhoneIcon className="w-3.5 h-3.5" />
                          <span>Call Back</span>
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
        {activeTab === 'voicemail' && (
          <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
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
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Voicemail Inbox</h3>
                  <p className="text-xs text-slate-500">Audio playback and automated booking transcripts</p>
                </div>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                  {unreadCountVoicemail} New Voicemail
                </span>
              </div>

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
                      className={`p-4 rounded-2xl border space-y-3 border-l-4 cursor-pointer transition-all ${
                        isRowSelected
                          ? 'bg-blue-100/70 border-blue-300 border-l-blue-700 shadow-2xs'
                          : vm.isUnread
                          ? 'bg-amber-50/60 border-amber-200 border-l-blue-600 font-semibold'
                          : 'bg-white border-amber-200/80 border-l-transparent text-slate-700'
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
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setPlayingVoicemailId(playingVoicemailId === vm.id ? null : vm.id)
                        }
                        className="w-9 h-9 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs cursor-pointer"
                      >
                        {playingVoicemailId === vm.id ? '⏸' : '▶'}
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
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                        title={`Call back ${vm.contactName}`}
                      >
                        <PhoneIcon className="w-3 h-3" />
                        <span>Call Back</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleConvertVoicemailToBooking(vm.suggestedBooking)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <span>➕ Convert to Booking</span>
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
            {filteredMessages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <p className="text-xs font-bold text-slate-600">No Messages Found</p>
                <p className="text-[11px]">No SMS messages match your active filter.</p>
              </div>
            ) : (
              filteredMessages.map((sms) => {
                const isRowSelected = selectedItemIds.has(sms.id);
                return (
                  <div
                    key={sms.id}
                    onClick={() => setSelectedContactPhone(sms.contactPhone)}
                    className={`group relative p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 border-l-4 ${
                      isRowSelected
                        ? 'bg-blue-100/70 border-l-blue-700'
                        : sms.isUnread
                        ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                        : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        {sms.isUnread ? (
                          <span
                            className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                            title="Unread SMS"
                          />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                        )}
                      </div>

                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        💬
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs block ${
                              sms.isUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'
                            }`}
                          >
                            {sms.contactName}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {sms.contactPhone}
                          </span>
                        </div>
                        <p
                          className={`text-xs line-clamp-1 mt-0.5 ${
                            sms.isUnread ? 'text-slate-900 font-medium' : 'text-slate-600'
                          }`}
                        >
                          {sms.snippet}
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-400 font-medium shrink-0 pl-2">
                      {sms.timestamp}
                    </span>

                    {/* Hover Action Overlay Strip */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-white/95 backdrop-blur-xs shadow-md border border-slate-200 rounded-xl px-2 py-1 z-20 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleReadStatus(sms.id)}
                        title={sms.isUnread ? 'Mark as Read' : 'Mark as Unread'}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        {sms.isUnread ? (
                          <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <MailIcon className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartCall(sms.contactPhone, sms.contactName)}
                        title={`Call ${sms.contactName}`}
                        className="p-1 rounded-lg hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        <PhoneIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleForwardItem(sms)}
                        title="Copy summary to clipboard"
                        className="p-1 rounded-lg hover:bg-amber-50 text-slate-600 hover:text-amber-600 transition-colors cursor-pointer"
                      >
                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveItem(sms.id)}
                        title="Archive / Remove"
                        className="p-1 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
