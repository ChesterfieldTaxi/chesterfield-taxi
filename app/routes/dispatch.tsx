import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { getBookingService } from '../core/services/booking';
import type { AppSettings } from '../core/types/config';
import type { Trip, TripStatus, TripAuditEvent } from '../core/types/trip';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { type DispatchFormValues } from '../components/domain/dispatch/DispatchBookingEngine';
import { type DateTimeRange } from '../components/domain/dispatch/CustomDateTimePicker';
import { UserDropdown } from '../components/domain/common/UserDropdown';
import {
  SpinnerIcon,
  RadioIcon,
  CarIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  MenuIcon,
  Squares2X2Icon,
  DocumentTextIcon,
  MapIcon,
  ChatBubbleLeftRightIcon,
  BoltIcon,
  ChevronDownIcon,
  XIcon,
  UsersIcon,
  BellIcon,
  ExternalLinkIcon,
  PencilIcon,
  ShieldCheckIcon,
  PlusIcon,
  AlertTriangleIcon,
  CheckIcon,
  FlagIcon,
  GlobeIcon,
  InfoIcon,
  VolumeXIcon,
  ClockIcon,
  SunIcon,
  SettingsIcon,
} from '../components/ui/Icons';
import { getEmailDispatchService } from '../core/services/email/resend-email.service';
import { formatVehicleTier, formatVehicleTierDisplay } from '../core/services/email/email-templates';
import { getDispatchEmailService } from '../core/services/email/dispatch-email.service';
import { getTelephonyService, sanitizePhoneNumber, formatDisplayPhone } from '../core/services/telephony.service';
import { useDisplayLayout } from '../core/hooks/useDisplayLayout';
import { useWakeLock } from '../core/hooks/useWakeLock';
import { usePushNotifications } from '../core/hooks/usePushNotifications';
import {
  pushNotificationService,
  formatDispatchNewRideAlert,
} from '../core/services/notifications/push-notification.service';
import { CommsHub } from '../components/domain/dispatch/CommsHub';
import { EmailDock } from '../components/domain/dispatch/EmailDock';
import { AppSuiteLauncher } from '../components/domain/dispatch/AppSuiteLauncher';
import { DispatchHeaderCallHud } from '../components/domain/dispatch/DispatchHeaderCallHud';
import { FleetAlertCard, type DispatchMessageItem } from '../components/domain/dispatch/FleetAlertCard';
import { getWorkspaceBus } from '../core/services/workspace-bus.service';
import { authorizedFetch } from '../core/services/auth/auth-headers';
import { soundNotificationService } from '../core/services/sound-notification.service';
import { getOperatorService, formatDriverAssignmentLabel, type DriverRosterItem } from '../core/services/operator.service';
import { DriverQueueWindow } from '../components/domain/dispatch/DriverQueueWindow';
import {
  useDispatchFleet,
  FLEET_STATUS_COLORS,
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../core/hooks/useDispatchFleet';
import { formatLocalDateStr } from '../core/services/pricing/vehicle-matching';
import { useBottomSheetDragToClose } from '../core/hooks/useBottomSheetDragToClose';
import { MemoizedDraftBookingPane } from '../components/domain/dispatch/MemoizedDraftBookingPane';
import { DispatchLiveMapPane } from '../components/domain/dispatch/DispatchLiveMapPane';
import {
  DispatchTripQueuePane,
  DispatchTripQueueSheets,
  type QueueFilterType,
} from '../components/domain/dispatch/DispatchTripQueuePane';
import {
  DispatchDriverRosterPane,
  DispatchDriverSheets,
} from '../components/domain/dispatch/DispatchDriverRosterPane';
import {
  DispatchTripDetailsDrawer,
  sendDispatchContextualTripEmail,
} from '../components/domain/dispatch/DispatchTripDetailsDrawer';
import { getZoneService, DEFAULT_ZONES } from '../core/services/zones/zone.service';
import type { ZoneGeofence } from '../core/types/zone';
import {
  advanceOrExpireOfferCascade,
  buildTripSlaStatusPatch,
  cancelOfferCascade,
  scanUpcomingUnassignedSlaTrips,
  startOfferCascade,
} from '../core/services/dispatch';

export type { DriverRosterItem };

export function meta() {
  return [
    { title: 'Dispatch Console – Chesterfield Taxi' },
    { name: 'description', content: 'Tactical split-screen dispatch dashboard' },
  ];
}

interface DraftTab {
  id: string;
  isNew: boolean;
  tripId?: string;
  trip?: Trip;
  formValues?: DispatchFormValues;
}

const DISPATCH_TABS_STORAGE_KEY = 'ct_dispatch_open_tabs_v1';
const MOBILE_TAB_STORAGE_KEY = 'ct_dispatch_mobile_tab_v1';
const MOBILE_GESTURE_PREF_KEY = 'ct_dispatch_mobile_gesture_v1';
const VALID_MOBILE_TABS = new Set(['booking', 'queue', 'map', 'messages', 'phone', 'drivers', 'comms', 'email']);
const SIDEBAR_WIDTH_STORAGE_KEY = 'ct_dispatch_sidebar_width';
const QUEUE_HEIGHT_STORAGE_KEY = 'ct_dispatch_queue_height';
const DOCK_WIDTH_STORAGE_KEY = 'ct_dispatch_dock_width';
const DISPATCH_WAKE_LOCK_STORAGE_KEY = 'ct_dispatch_wake_lock';

export type DesktopDockTab = 'none' | 'phone' | 'email' | 'drivers' | 'comms' | 'alerts';

export default function DispatchRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTripId = searchParams.get('tripId');
  const handledUrlTripIdRef = useRef<string | null>(null);

  // Auth & Settings state (initialize `isAuthChecking = true` so SSR & initial client hydration match)
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(() => getAdminConfigService().getCachedSettings());

  // Trips real-time state
  const [trips, setTrips] = useState<Trip[]>([]);
  const [dispatchZones, setDispatchZones] = useState<ZoneGeofence[]>(() => [...DEFAULT_ZONES]);
  const [slaUrgentOnlyFilter, setSlaUrgentOnlyFilter] = useState<boolean>(false);
  const [slaClockTick, setSlaClockTick] = useState<number>(() => Date.now());
  const inFlightCascadeIdsRef = useRef<Set<string>>(new Set());
  const slaNotifiedLevelsRef = useRef<Map<string, 'warning' | 'critical'>>(new Map());
  const autoOfferStartedIdsRef = useRef<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [filterPreset, setFilterPreset] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [pillFilter, setPillFilter] = useState<'all' | 'unconfirmed' | 'pending' | 'assigned' | 'completed' | 'cancelled' | 'unassigned'>('all');
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedQueueTripId, setSelectedQueueTripId] = useState<string | null>(null);
  const [selectedMapTrip, setSelectedMapTrip] = useState<Trip | null>(null);
  const [shouldZoomMap, setShouldZoomMap] = useState<boolean>(false);
  const [auditTrailTrip, setAuditTrailTrip] = useState<Trip | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = localStorage.getItem('ct_interactions_database');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((i: any) => i.type?.startsWith('sms_') && i.isUnread).length;
        }
      }
    } catch {}
    return 0;
  });
  const [missedCallsCount, setMissedCallsCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = localStorage.getItem('ct_interactions_database');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((i: any) => i.type === 'call_missed' && i.isUnread).length;
        }
      }
    } catch {}
    return 0;
  });
  const [unreadEmailCount, setUnreadEmailCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return getDispatchEmailService().getUnreadCount();
  });

  // Dispatcher Review Modal State for UNCONFIRMED web bookings & Trip Details
  const [reviewTrip, setReviewTrip] = useState<Trip | null>(null);
  const [reviewOpenSeq, setReviewOpenSeq] = useState<number>(0);
  const [reviewModalTab, setReviewModalTab] = useState<'details' | 'audit'>('details');
  const [queueDriver, setQueueDriver] = useState<DriverRosterItem | null>(null);

  // Custom DateTime Range Picker State
  const [dateTimeRange, setDateTimeRange] = useState<DateTimeRange>({
    startDate: '',
    endDate: '',
    startTime: { hour: '12', minute: '00', period: 'AM' },
    endTime: { hour: '11', minute: '59', period: 'PM' },
    presetKey: 'all_time',
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerTriggerRef = useRef<HTMLDivElement>(null);

  // Filter Pills & Dropdown System (Driver, Vehicle, Company, Payment Type, Tariff, Has Car Seat)
  const [isAddFilterOpen, setIsAddFilterOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const addFilterRef = useRef<HTMLDivElement>(null);
  const [activeFilterKeys, setActiveFilterKeys] = useState<QueueFilterType[]>([]);
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>('all');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [selectedTariffFilter, setSelectedTariffFilter] = useState<string>('all');

  // Memoized draft values updater to prevent infinite re-render loops
  const handleDraftValuesChange = useCallback((draftId: string, vals: DispatchFormValues) => {
    setDrafts((prev) => {
      const target = prev.find((item) => item.id === draftId);
      if (!target) return prev;
      if (target.formValues === vals) return prev;
      return prev.map((item) => (item.id === draftId ? { ...item, formValues: vals } : item));
    });
  }, []);

  // Draft Tabs & Mobile Tab state — restored safely on client mount so SSR never clobbers saved tabs or booking drafts
  const maxDrafts = COMPANY_CONFIG.maxDispatchDrafts || 10;
  const hasHydratedClientTabsRef = useRef(false);
  const [drafts, setDrafts] = useState<DraftTab[]>([{ id: 'new-1', isNew: true }]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState<number>(2);
  const [isTabOverflowOpen, setIsTabOverflowOpen] = useState(false);
  const tabOverflowRef = useRef<HTMLDivElement>(null);

  // Persist open tabs metadata cleanly only after client hydration restores saved tabs
  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedClientTabsRef.current) return;
    try {
      const serializable = {
        drafts: drafts.map((d) => ({
          id: d.id,
          isNew: d.isNew,
          tripId: d.trip?.id || d.tripId,
        })),
        activeDraftId,
        nextDraftIdx,
      };
      localStorage.setItem(DISPATCH_TABS_STORAGE_KEY, JSON.stringify(serializable));
    } catch {}
  }, [drafts, activeDraftId, nextDraftIdx]);

  // Re-hydrate persisted Edit tabs with live Trip objects once Firestore trips load
  useEffect(() => {
    if (trips.length === 0) return;
    setDrafts((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        if (!d.isNew && !d.trip && d.tripId) {
          const match = trips.find((t) => t.id === d.tripId);
          if (match) {
            changed = true;
            return { ...d, trip: match };
          }
        }
        return d;
      });
      return changed ? next : prev;
    });
  }, [trips]);

  // Operational Right Dock Tools (Unified Dock: Main / Phone / Email / Drivers)
  const [activeDockTab, setActiveDockTab] = useState<DesktopDockTab>('none');
  const [commsInitialTab, setCommsInitialTab] = useState<'all' | 'phone' | 'messages' | 'voicemail'>('all');
  const [commsActiveTab, setCommsActiveTab] = useState<'all' | 'phone' | 'messages' | 'voicemail'>('all');

  // Dispatch Console Complete Trip Modal target state
  const [completeTripTarget, setCompleteTripTarget] = useState<Trip | null>(null);
  const [completeModalOpenSeq, setCompleteModalOpenSeq] = useState<number>(0);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    confirmVariant?: 'danger' | 'primary' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {},
  });
  const isDriversOpen = activeDockTab === 'drivers';
  const isMessagesOpen = activeDockTab === 'alerts';
  const isPhoneOpen = activeDockTab === 'phone' || activeDockTab === 'comms';
  const isEmailOpen = activeDockTab === 'email';
  const setIsDriversOpen = (open: boolean) => setActiveDockTab(open ? 'drivers' : 'none');
  const setIsMessagesOpen = (open: boolean) => setActiveDockTab(open ? 'alerts' : 'none');
  const setIsPhoneOpen = (open: boolean) => setActiveDockTab(open ? 'phone' : 'none');
  const setIsEmailOpen = (open: boolean) => setActiveDockTab(open ? 'email' : 'none');
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const alertsDropdownRef = useRef<HTMLDivElement>(null);
  const [minimizedPanels, setMinimizedPanels] = useState<Record<string, boolean>>({});
  const operationsContainerRef = useRef<HTMLDivElement>(null);
  const knownTripIdsRef = useRef<Set<string> | null>(null);

  // Dispatch Audio State (Inbound calls & ASAP chimes)
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => soundNotificationService.isMuted());
  const toggleSoundMuted = useCallback(() => {
    const nextMuted = soundNotificationService.toggleMute();
    setIsSoundMuted(nextMuted);
    if (!nextMuted) {
      soundNotificationService.playAsapRideChime();
    }
  }, []);

  // Phase 34: Optional Keep Screen Awake (`ct_dispatch_wake_lock`) & Browser Push Alerts
  const [showDeviceSettingsMenu, setShowDeviceSettingsMenu] = useState(false);
  const deviceSettingsMenuRef = useRef<HTMLDivElement>(null);
  const [keepScreenAwake, setKeepScreenAwake] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(DISPATCH_WAKE_LOCK_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleKeepScreenAwake = useCallback(() => {
    setKeepScreenAwake((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(DISPATCH_WAKE_LOCK_STORAGE_KEY, next ? 'true' : 'false');
        } catch {}
      }
      return next;
    });
  }, []);

  const dispatchWakeLock = useWakeLock({ enabled: keepScreenAwake });
  const dispatchPush = usePushNotifications({ uid: user?.uid });

  // Live Unified Fleet State (OperatorService + Firestore `drivers` dutyStatus/GPS + Trips + WorkspaceBus)
  const { fleet: drivers, setDriverDutyStatus } = useDispatchFleet(trips);
  const [driverFilter, setDriverFilter] = useState<'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline'>('all');
  const [driverSearch, setDriverSearch] = useState('');
  const [focusedMapDriverId, setFocusedMapDriverId] = useState<string | null>(null);
  const [dispatchToast, setDispatchToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isBatchAssignOpen, setIsBatchAssignOpen] = useState(false);
  const [batchAssignDriverId, setBatchAssignDriverId] = useState<string>('');

  const showDispatchToast = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      setDispatchToast({ type, text });
    },
    []
  );

  useEffect(() => {
    if (!dispatchToast) return;
    const t = setTimeout(() => setDispatchToast(null), 4000);
    return () => clearTimeout(t);
  }, [dispatchToast]);

  // Admin-configurable alert auto-dismiss duration (default: 60 minutes = 1 hour)
  const [alertDismissMinutes, setAlertDismissMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('chesterfield_alerts_ttl_minutes');
      if (saved) return parseInt(saved, 10);
    } catch {}
    return settings.fleetAlertsConfig?.autoDismissMinutes ?? 60;
  });

  // Messages Data State (Persisted)
  const [messages, setMessages] = useState<DispatchMessageItem[]>(() => {
    try {
      const saved = localStorage.getItem('chesterfield_dispatch_alerts');
      if (saved) {
        const parsed: DispatchMessageItem[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'msg-1',
        to: 'All Drivers',
        text: 'Morning briefing: Lambert Airport terminal arrivals surge active until 11:30 AM.',
        timestamp: '08:15 AM',
        createdAt: Date.now() - 15 * 60 * 1000,
        priority: 'normal',
        isPinned: true,
        isRead: false,
      },
      {
        id: 'msg-2',
        to: 'Driver 104 (Sarah K.)',
        text: 'Terminal 1 pickup confirmed for passenger Johnson.',
        timestamp: '08:32 AM',
        createdAt: Date.now() - 5 * 60 * 1000,
        priority: 'normal',
        isPinned: false,
        isRead: false,
      },
    ];
  });
  const [msgRecipient, setMsgRecipient] = useState('All Drivers');
  const [msgText, setMsgText] = useState('');
  const [msgPriority, setMsgPriority] = useState<'normal' | 'urgent'>('normal');
  const [alertsFilter, setAlertsFilter] = useState<'all' | 'unread' | 'pinned'>('all');

  // Persist alerts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('chesterfield_dispatch_alerts', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Periodic Auto-dismissal of unpinned alerts exceeding TTL
  useEffect(() => {
    if (alertDismissMinutes === 0) return; // 0 = Never auto-dismiss
    const checkAndPrune = () => {
      const now = Date.now();
      const ttlMs = alertDismissMinutes * 60 * 1000;
      setMessages((prev) => {
        const unexpired = prev.filter((m) => m.isPinned || now - (m.createdAt || now) < ttlMs);
        if (unexpired.length !== prev.length) {
          return unexpired;
        }
        return prev;
      });
    };

    const interval = setInterval(checkAndPrune, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [alertDismissMinutes]);

  // Alert Action Handlers
  const handleTogglePinAlert = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isPinned: !m.isPinned } : m))
    );
  }, []);

  const handleToggleReadAlert = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isRead: !m.isRead } : m))
    );
  }, []);

  const handleDismissAlert = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleMarkAllAlertsRead = useCallback(() => {
    setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
  }, []);

  const handleClearUnpinnedAlerts = useCallback(() => {
    setMessages((prev) => prev.filter((m) => m.isPinned));
  }, []);

  const handleUpdateAlertDismissMinutes = useCallback(async (mins: number) => {
    setAlertDismissMinutes(mins);
    try {
      localStorage.setItem('chesterfield_alerts_ttl_minutes', String(mins));
    } catch {}
    if (user?.role === 'admin') {
      try {
        await getAdminConfigService().updateSettings({
          fleetAlertsConfig: { autoDismissMinutes: mins },
        });
      } catch (e) {
        console.warn('Failed to persist alerts autoDismissMinutes setting to server', e);
      }
    }
  }, [user]);

  // Active and sorted alerts: Pinned alerts stay at the top, unpinned sorted by newest, expired filtered
  const activeAndSortedMessages = useMemo(() => {
    const now = Date.now();
    const ttlMs = alertDismissMinutes * 60 * 1000;
    return messages
      .filter((m) => {
        if (alertDismissMinutes === 0) return true;
        if (m.isPinned) return true;
        return now - (m.createdAt || now) < ttlMs;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [messages, alertDismissMinutes]);

  const unreadAlertsCount = useMemo(() => {
    return activeAndSortedMessages.filter((m) => !m.isRead).length;
  }, [activeAndSortedMessages]);

  const pinnedAlertsCount = useMemo(() => {
    return activeAndSortedMessages.filter((m) => m.isPinned).length;
  }, [activeAndSortedMessages]);

  // Tactical Presets State (Persisted)
  const [tacticalPresets, setTacticalPresets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('chesterfield_tactical_presets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      'Airport surge at Lambert T1/T2.',
      'Traffic advisory: I-64 westbound heavy congestion.',
      'Check in with dispatch if available.',
      'Weather alert: slick roads, maintain safe following distance.',
      'Terminal 2 pickup queue backed up.',
      'Priority VIP pickup waiting at Lambert Main.',
    ];
  });
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetText, setNewPresetText] = useState('');

  // Phone Softphone State
  const [dialedNumber, setDialedNumber] = useState('');
  const [activeCallStatus, setActiveCallStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [activeCallMeta, setActiveCallMeta] = useState<{ contactName: string; phoneNumber: string; duration: number } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [softphoneNotice, setSoftphoneNotice] = useState<string | null>(null);
  const [incomingCallAlert, setIncomingCallAlert] = useState<{ from: string; callSid?: string } | null>(null);

  // Driver Fare Console Modal State
  const [driverModalTrip, setDriverModalTrip] = useState<Trip | null>(null);
  const [driverModalOpenSeq, setDriverModalOpenSeq] = useState<number>(0);

  // Resizable layout dimensions — persisted to localStorage with safe viewport bounds
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 680) return parsed;
      }
    }
    return 430;
  });
  const [queueHeight, setQueueHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(QUEUE_HEIGHT_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 150 && parsed <= 600) return parsed;
      }
    }
    return 240;
  });
  const [operationsWidth, setOperationsWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DOCK_WIDTH_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 760) return parsed;
      }
    }
    return 400;
  });
  const [activeResizeHandle, setActiveResizeHandle] = useState<'sidebar' | 'queue' | 'operations' | null>(null);
  const [panelHeights, setPanelHeights] = useState<Record<string, number>>({
    drivers: 180,
    messages: 180,
    phone: 220,
  });
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isViewsDropdownOpen, setIsViewsDropdownOpen] = useState(false);
  const viewsDropdownRef = useRef<HTMLDivElement>(null);

  // Phase 29B/29D: Display Layout & Mobile View State
  const [displayLayout, setDisplayLayout] = useDisplayLayout('ct_dispatch_layout', 'table');
  const [workspaceLayout, setWorkspaceLayout] = useState<'compact' | 'split' | 'popout'>('compact');
  const [activeMobileTab, setActiveMobileTab] = useState<
    'booking' | 'queue' | 'map' | 'messages' | 'phone' | 'drivers' | 'comms' | 'email'
  >('queue');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [openTripActionId, setOpenTripActionId] = useState<string | null>(null);

  // Mobile-native card gesture preference ('action_sheet' = hold for actions; 'multi_select' = tap for actions, hold for multi-select)
  const [mobileCardGestureMode, setMobileCardGestureMode] = useState<'action_sheet' | 'multi_select'>('action_sheet');
  const [mobileActionSheetTrip, setMobileActionSheetTrip] = useState<Trip | null>(null);
  const [mobileActionSheetDriver, setMobileActionSheetDriver] = useState<LiveFleetDriver | null>(null);
  const [driverPickerTrip, setDriverPickerTrip] = useState<Trip | null>(null);
  const [driverPickerSearch, setDriverPickerSearch] = useState('');
  const [driverPickerFilter, setDriverPickerFilter] = useState<'all' | 'available' | 'busy'>('all');

  // Shared drag-down-to-close gesture for mobile bottom sheets in Dispatch
  const handleDismissActiveDispatchSheet = useCallback(() => {
    if (driverPickerTrip) {
      setDriverPickerTrip(null);
    } else if (isBatchAssignOpen) {
      setIsBatchAssignOpen(false);
    } else if (mobileActionSheetDriver) {
      setMobileActionSheetDriver(null);
    } else if (mobileActionSheetTrip) {
      setMobileActionSheetTrip(null);
    } else if (isTabOverflowOpen) {
      setIsTabOverflowOpen(false);
    }
  }, [driverPickerTrip, isBatchAssignOpen, mobileActionSheetDriver, mobileActionSheetTrip, isTabOverflowOpen]);

  const dispatchSheetDrag = useBottomSheetDragToClose({
    onClose: handleDismissActiveDispatchSheet,
    disabled: isDesktop,
  });

  // Client-only hydration for open tabs & mobile tab so page refresh preserves exact mobile workspace & unsaved booking work
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedGesture = localStorage.getItem(MOBILE_GESTURE_PREF_KEY);
      if (savedGesture === 'action_sheet' || savedGesture === 'multi_select') {
        setMobileCardGestureMode(savedGesture);
      }
      const rawTabs = localStorage.getItem(DISPATCH_TABS_STORAGE_KEY);
      if (rawTabs) {
        const parsed = JSON.parse(rawTabs);
        if (Array.isArray(parsed?.drafts) && parsed.drafts.length > 0) {
          const restored: DraftTab[] = parsed.drafts.slice(0, maxDrafts).map((item: any) => ({
            id: String(item.id),
            isNew: Boolean(item.isNew),
            tripId: item.tripId ? String(item.tripId) : undefined,
          }));
          const validActive = restored.some((d) => d.id === parsed.activeDraftId)
            ? parsed.activeDraftId
            : restored[0].id;
          const nextIdx =
            typeof parsed.nextDraftIdx === 'number' && parsed.nextDraftIdx >= 2
              ? parsed.nextDraftIdx
              : restored.length + 2;
          setDrafts(restored);
          setActiveDraftId(validActive);
          setNextDraftIdx(nextIdx);
        }
      }
      if (!urlTripId) {
        const savedMobileTab = localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
        if (savedMobileTab && VALID_MOBILE_TABS.has(savedMobileTab)) {
          setActiveMobileTab(savedMobileTab as any);
        }
      }
    } catch {}
    hasHydratedClientTabsRef.current = true;
  }, [maxDrafts, urlTripId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedClientTabsRef.current) return;
    try {
      localStorage.setItem(MOBILE_TAB_STORAGE_KEY, activeMobileTab);
    } catch {}
  }, [activeMobileTab]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedClientTabsRef.current) return;
    try {
      localStorage.setItem(MOBILE_GESTURE_PREF_KEY, mobileCardGestureMode);
    } catch {}
  }, [mobileCardGestureMode]);

  // Indicator dot on Mobile Booking tab whenever any open draft or edit tab has work in progress
  const hasUnsavedDraftWork = useMemo(() => {
    return drafts.some((d) => {
      if (!d.isNew) return true;
      if (
        d.formValues?.pickupAddress?.trim() ||
        d.formValues?.dropoffAddress?.trim() ||
        d.formValues?.passengerName?.trim() ||
        d.formValues?.phone?.trim() ||
        d.formValues?.email?.trim()
      ) {
        return true;
      }
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(`chesterfield_dispatch_draft_${d.id}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              parsed?.pickupAddress?.trim() ||
              parsed?.dropoffAddress?.trim() ||
              parsed?.passengerName?.trim() ||
              parsed?.phone?.trim() ||
              parsed?.email?.trim()
            ) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
  }, [drafts]);

  // Dynamic height balance when panels change or keyboard toggles to guarantee NO sidebar container overflow
  const activeOperationalCount = activeDockTab === 'none' ? 0 : 1;
  const activePanels = (
    activeDockTab === 'none'
      ? []
      : [activeDockTab === 'alerts' ? 'messages' : activeDockTab]
  ) as ('drivers' | 'messages' | 'phone')[];

  useEffect(() => {
    if (!operationsContainerRef.current) return;
    const containerH = operationsContainerRef.current.clientHeight || 620;
    const activeCount = activePanels.filter((p) => !minimizedPanels[p]).length;
    if (activeCount <= 1) return;

    // Minimum required height for phone if active
    const requiredPhone = showKeypad ? 270 : 190;
    const isPhoneActive = isPhoneOpen && !minimizedPanels.phone;
    const phoneReserve = isPhoneActive ? requiredPhone : (isPhoneOpen ? 32 : 0);

    const availableForUpper = containerH - phoneReserve - (activePanels.length * 8);

    if (isDriversOpen && !minimizedPanels.drivers && isMessagesOpen && !minimizedPanels.messages) {
      const half = Math.max(110, Math.floor(availableForUpper / 2));
      setPanelHeights((prev) => {
        if (prev.drivers + prev.messages > availableForUpper) {
          return {
            ...prev,
            drivers: half,
            messages: half,
            phone: requiredPhone,
          };
        }
        return prev;
      });
    }
  }, [activePanels.length, isDriversOpen, isMessagesOpen, isPhoneOpen, showKeypad, minimizedPanels]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (viewsDropdownRef.current && !viewsDropdownRef.current.contains(target)) {
        setIsViewsDropdownOpen(false);
      }
      if (tabOverflowRef.current && !tabOverflowRef.current.contains(target)) {
        setIsTabOverflowOpen(false);
      }
      if (addFilterRef.current && !addFilterRef.current.contains(target)) {
        setIsAddFilterOpen(false);
      }
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(target)) {
        setIsLayoutDropdownOpen(false);
      }
      if (deviceSettingsMenuRef.current && !deviceSettingsMenuRef.current.contains(target)) {
        setShowDeviceSettingsMenu(false);
      }
    };
    if (
      isViewsDropdownOpen ||
      isTabOverflowOpen ||
      isAddFilterOpen ||
      isLayoutDropdownOpen ||
      showDeviceSettingsMenu
    ) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [
    isViewsDropdownOpen,
    isTabOverflowOpen,
    isAddFilterOpen,
    isLayoutDropdownOpen,
    showDeviceSettingsMenu,
  ]);

  // Auth Guard
  useEffect(() => {
    const unsubscribe = getAdminAuthService().onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/app/login?message=unauthenticated&redirect=/app/dispatch', { replace: true });
      } else if (
        !(currentUser.roles && (currentUser.roles.includes('admin') || currentUser.roles.includes('dispatcher'))) &&
        currentUser.role !== 'admin' && currentUser.role !== 'dispatcher'
      ) {
        navigate('/app/login?message=unauthorized', { replace: true });
      } else {
        setUser(currentUser);
        setIsAuthChecking(false);
      }
    });
    return unsubscribe;
  }, [navigate]);

  // Settings
  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings((updated) => setSettings(updated), () => {});
    getZoneService()
      .getZones()
      .then((loadedZones) => {
        if (loadedZones && loadedZones.length > 0) {
          setDispatchZones(loadedZones);
        }
      })
      .catch(() => {});
    return unsub;
  }, []);

  // Refresh SLA urgency clock every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      setSlaClockTick(Date.now());
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Persist panel dimensions in localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(sidebarWidth)));
      localStorage.setItem(QUEUE_HEIGHT_STORAGE_KEY, String(Math.round(queueHeight)));
      localStorage.setItem(DOCK_WIDTH_STORAGE_KEY, String(Math.round(operationsWidth)));
    } catch {}
  }, [sidebarWidth, queueHeight, operationsWidth]);

  // Dispatcher Hotkeys: M (Main), Alt+P/P/C (Comms), Alt+E/E (Email), Alt+D/D (Drivers), A (Alerts), Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditableTarget = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable ||
            target.getAttribute('role') === 'textbox')
      );

      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setIsSearchExpanded(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        return;
      }

      // Support advertised Alt+P / Alt+E / Alt+D / Alt+A shortcuts anywhere (except inside Alt+S booking swap)
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'p' || key === 'c') {
          e.preventDefault();
          setCommsInitialTab('all');
          setCommsActiveTab('all');
          setActiveDockTab((prev) => (prev === 'phone' || prev === 'comms' ? 'none' : 'phone'));
        } else if (key === 'e') {
          e.preventDefault();
          setActiveDockTab((prev) => (prev === 'email' ? 'none' : 'email'));
        } else if (key === 'd') {
          e.preventDefault();
          setActiveDockTab((prev) => (prev === 'drivers' ? 'none' : 'drivers'));
        } else if (key === 'a') {
          e.preventDefault();
          setShowAlertsDropdown((prev) => !prev);
        }
        return;
      }

      if (isEditableTarget) return;

      if (e.key === '/') {
        e.preventDefault();
        setIsSearchExpanded(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape') {
        setActiveDockTab('none');
        setIsMobileDrawerOpen(false);
        setShowAlertsDropdown(false);
        setShowDeviceSettingsMenu(false);
        setIsSearchExpanded(false);
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveDockTab('none');
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C') {
        setCommsInitialTab('all');
        setCommsActiveTab('all');
        setActiveDockTab((prev) => (prev === 'phone' || prev === 'comms' ? 'none' : 'phone'));
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveDockTab((prev) => (prev === 'email' ? 'none' : 'email'));
      } else if (e.key === 'd' || e.key === 'D') {
        setActiveDockTab((prev) => (prev === 'drivers' ? 'none' : 'drivers'));
      } else if (e.key === 'a' || e.key === 'A') {
        setShowAlertsDropdown((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click-outside listener for header alerts dropdown
  useEffect(() => {
    function handleClickOutsideAlerts(e: MouseEvent) {
      if (alertsDropdownRef.current && !alertsDropdownRef.current.contains(e.target as Node)) {
        setShowAlertsDropdown(false);
      }
    }
    if (showAlertsDropdown) {
      document.addEventListener('mousedown', handleClickOutsideAlerts);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideAlerts);
    };
  }, [showAlertsDropdown]);

  // Window resize listener to keep layout reactive across breakpoints and DevTools toggles
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pricing Rules subscription now lives inside DispatchTripDetailsDrawer

  // Cross-Window Workspace Bus Sync (Multi-monitor pop-out synchronization)
  useEffect(() => {
    const bus = getWorkspaceBus();
    const unsub = bus.subscribe((msg) => {
      if (msg.type === 'POPULATE_BOOKING') {
        const payload = msg.payload;
        setActiveMobileTab('booking');
        setDrafts((prev) => {
          const target = prev.find((d) => d.id === activeDraftId) || prev[0];
          if (!target) return prev;
          const currentForm = target.formValues || ({} as any);
          const updatedForm: DispatchFormValues = {
            ...currentForm,
            passengerName: payload.passengerName || currentForm.passengerName || '',
            phone: payload.passengerPhone || payload.phone || currentForm.phone || '',
            email: payload.passengerEmail || payload.email || currentForm.email || '',
            pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
            dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
            vehicle: (payload.vehicleTier || payload.vehicle || currentForm.vehicle || 'any') as any,
            selectedVehicles: payload.vehicleTier ? [payload.vehicleTier as any] : (currentForm.selectedVehicles || ['any']),
            corporateDetails: {
              ...currentForm.corporateDetails,
              corporateAccount: payload.corporateAccount || payload.corporateAccountName || payload.accountNumber || currentForm.corporateDetails?.corporateAccount || '',
              billingPo: payload.billingPo || payload.poNumber || currentForm.corporateDetails?.billingPo || '',
              authorizedBy: currentForm.corporateDetails?.authorizedBy || '',
              invoicingTerms: currentForm.corporateDetails?.invoicingTerms || 'Net 30 Direct Bill',
            },
            paymentMethod: (payload.corporateAccount || payload.corporateAccountName || payload.accountNumber) ? 'account' : (currentForm.paymentMethod || 'cash'),
            internalNotes: payload.notes
              ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
              : currentForm.internalNotes,
          };
          return prev.map((item) => (item.id === target.id ? { ...item, formValues: updatedForm } : item));
        });
      } else if (msg.type === 'OPEN_EDIT_TRIP') {
        const payload = msg.payload;
        let found = payload.tripId ? trips.find((t) => t.id === payload.tripId) : undefined;
        if (!found && payload.phone) {
          const cleanTarget = payload.phone.replace(/\D/g, '').slice(-10);
          if (cleanTarget) {
            found = trips.find((t) => {
              const tp = (t.passenger?.phone || (t as any).passengerPhone || '').replace(/\D/g, '').slice(-10);
              return tp === cleanTarget;
            });
          }
        }
        if (found) {
          setSelectedQueueTripId(found.id);
          setSelectedMapTrip(found);
          setShouldZoomMap(true);
          handleOpenEditTrip(found);
          setActiveMobileTab('booking');
        }
      } else if (msg.type === 'UNREAD_COUNTS_CHANGED') {
        const payload = msg.payload;
        if (typeof payload.unreadMessages === 'number') {
          setUnreadMessagesCount(payload.unreadMessages);
        }
        if (typeof payload.missedCalls === 'number') {
          setMissedCallsCount(payload.missedCalls);
        }
      } else if (msg.type === 'INCOMING_CALL') {
        const payload = msg.payload;
        setIncomingCallAlert({ from: payload.from, callSid: payload.callSid });
        setActiveDockTab('phone');
        setCommsInitialTab('phone');
        setCommsActiveTab('phone');
      } else if (msg.type === 'INCOMING_CALL_DISMISSED') {
        setIncomingCallAlert(null);
      } else if (msg.type === 'FOCUS_TRIP_ON_MAP') {
        const found = trips.find((t) => t.id === msg.payload.tripId);
        if (found) {
          setSelectedMapTrip(found);
          setSelectedQueueTripId(found.id);
          setActiveMobileTab('map');
        }
      } else if (msg.type === 'DRIVER_TELEMETRY_PING') {
        const payload = msg.payload;
        if (payload?.tripId) {
          const ping = {
            coordinates: payload.coordinates,
            speedMph: payload.speedMph,
            heading: payload.heading,
            accuracy: payload.accuracy,
            timestamp: payload.timestamp,
            status: payload.status,
            isOfflineBuffer: payload.isOfflineBuffer,
          };
          setTrips((prev) =>
            prev.map((t) =>
              t.id === payload.tripId
                ? {
                    ...t,
                    driverTelemetry: ping,
                    currentLocation: ping,
                  }
                : t
            )
          );
        }
      }
    });
    return unsub;
  }, [activeDraftId, trips]);

  const handleOpenReviewModal = useCallback((trip: Trip, initialTab: 'details' | 'audit' = 'details') => {
    setReviewTrip(trip);
    setReviewModalTab(initialTab);
    setReviewOpenSeq((seq) => seq + 1);
  }, []);

  const handleOpenDriverModal = useCallback((trip: Trip) => {
    setDriverModalTrip(trip);
    setDriverModalOpenSeq((seq) => seq + 1);
  }, []);

  // Batch Actions for Trips Table
  const handleBatchConfirmTrips = async () => {
    if (selectedTripIds.length === 0) return;
    const bookingService = getBookingService();
    const tripsToConfirm = trips.filter(
      (t) => selectedTripIds.includes(t.id) && t.status !== 'CONFIRMED' && t.status !== 'confirmed' && t.status !== 'completed'
    );
    if (tripsToConfirm.length === 0) {
      showDispatchToast('All selected trip(s) are already confirmed or completed.', 'info');
      return;
    }
    try {
      const emailService = getEmailDispatchService();
      for (const t of tripsToConfirm) {
        if (bookingService.updateTripStatus) {
          await bookingService.updateTripStatus(t.id, 'CONFIRMED', {
            actorRole: 'admin',
            reason: 'Batch confirmed by dispatcher',
          });
        } else if (bookingService.updateTrip) {
          await bookingService.updateTrip(t.id, { status: 'CONFIRMED' });
        }

        if (t.passenger?.email) {
          try {
            const meta = (t.metadata || {}) as Record<string, any>;
            const resolvedTier = (meta.vehicleTypeId as string) || t.vehicleTier || (meta.vehiclePreference as string) || 'standard';
            emailService.sendBookingConfirmation({
              tripId: t.id,
              trackingToken: t.trackingToken,
              status: 'CONFIRMED',
              passenger: {
                firstName: t.passenger.firstName,
                lastName: t.passenger.lastName,
                email: t.passenger.email,
                phone: t.passenger.phone,
              },
              pickupAddress: t.pickupLocation?.address || '',
              intermediateStops: t.intermediateStops?.map((s) => ({ address: s.address, notes: s.notes })),
              dropoffAddress: t.dropoffLocation?.address || '',
              dropoffNotes: t.dropoffLocation?.notes,
              pickupTime:
                t.bookingType === 'scheduled' && t.scheduledPickupTime
                  ? new Date(t.scheduledPickupTime).toLocaleString()
                  : 'Immediate Ride (ASAP)',
              bookingType: t.bookingType,
              vehicleTier: resolvedTier,
              vehicleDisplayName: formatVehicleTier(resolvedTier, settings.vehicles, meta.vehicleDisplayName as string | undefined),
              passengerCount: t.passenger?.passengerCount,
              luggageCount: t.passenger?.luggageCount,
              contactPerson: meta.contactPerson
                ? (meta.contactPerson as any)
                : (meta.isBookerDifferent || meta.bookerName || meta.contactName)
                ? {
                    isBookerDifferent: Boolean(meta.isBookerDifferent || meta.bookerName || meta.contactName),
                    contactName: meta.bookerName || meta.contactName,
                    contactPhone: meta.bookerPhone || meta.contactPhone,
                    contactEmail: meta.bookerEmail || meta.contactEmail,
                    contactRole: meta.bookerRole || meta.contactRole,
                  }
                : undefined,
              carSeatsBreakdown: meta.carSeatsBreakdown ? (meta.carSeatsBreakdown as any) : undefined,
              additionalPassengers: meta.additionalPassengers ? (meta.additionalPassengers as any) : undefined,
              totalFare: t.pricing?.totalFare || 0,
              breakdown: t.pricing?.breakdown,
              tariffProfileName: t.pricing?.matchedCorridorName || t.pricing?.tariffProfileName,
              currency: t.pricing?.currency || 'USD',
              paymentMethod: t.payment?.method || 'cash',
              specialRequests: t.passenger?.specialRequests,
              oversizedBags: meta.oversizedBags as Record<string, number> | undefined,
              oversizedItemsSummary: meta.oversizedItemsSummary as string | undefined,
              customExtrasSummary: meta.customExtrasSummary as string | undefined,
              pickupNotes: (meta.pickupLocationDescription as string | undefined) || t.pickupLocation?.notes,
              companySettings: {
                name: settings.company?.name,
                phone: settings.company?.phone,
                address: settings.company?.address,
                email: settings.company?.email,
              },
              flightDetails: (meta.flightNumber || meta.airline || meta.airlineName || meta.tailNumber)
                ? {
                    flightNumber: meta.flightNumber ? String(meta.flightNumber) : undefined,
                    airlineName: (meta.airlineName || meta.airline || meta.airlineCode) ? String(meta.airlineName || meta.airline || meta.airlineCode) : undefined,
                    departureAirport: meta.flightOrigin || meta.departureAirport ? String(meta.flightOrigin || meta.departureAirport) : undefined,
                    tailNumber: meta.tailNumber ? String(meta.tailNumber) : undefined,
                    fboFacility: meta.fboFacility ? String(meta.fboFacility) : undefined,
                    isPrivateAviation: Boolean(meta.isPrivateAviation || meta.tailNumber),
                    hasCheckedLuggage: Boolean(meta.hasCheckedLuggage),
                    isAirportTrip: Boolean(meta.isAirportTrip),
                  }
                : undefined,
            }).catch((err) => console.warn('[Dispatch] Batch confirmation email error:', err));
          } catch (e) {
            console.warn('[Dispatch] Batch confirmation email skipped:', e);
          }
        }
      }
      setTrips((prev) =>
        prev.map((t) => (selectedTripIds.includes(t.id) ? { ...t, status: 'CONFIRMED' as TripStatus } : t))
      );
      setSelectedTripIds([]);
      showDispatchToast(`Confirmed ${tripsToConfirm.length} selected trip(s).`, 'success');

      if (settings.dispatchAutomation?.autoOfferOnConfirm) {
        for (const t of tripsToConfirm) {
          if (!t.assignedDriverId && !t.offerCascade) {
            void handleStartAutoOffer({ ...t, status: 'CONFIRMED' });
          }
        }
      }
    } catch (err) {
      console.error('Failed to batch confirm trips:', err);
      showDispatchToast('Failed to batch confirm selected trips. Please try again.', 'error');
    }
  };

  const handleBatchAssignDriver = () => {
    if (selectedTripIds.length === 0) return;
    setBatchAssignDriverId(drivers.find((d) => d.mapStatus === 'available')?.id || '');
    setIsBatchAssignOpen(true);
  };

  const handleConfirmBatchAssign = async () => {
    if (selectedTripIds.length === 0 || !batchAssignDriverId) return;
    let successCount = 0;
    for (const tripId of selectedTripIds) {
      try {
        await handleQuickAssignDriver(tripId, batchAssignDriverId);
        successCount += 1;
      } catch {}
    }
    setIsBatchAssignOpen(false);
    setSelectedTripIds([]);
    const drv = drivers.find((d) => d.id === batchAssignDriverId);
    showDispatchToast(
      `Assigned ${drv?.formattedLabel || drv?.name || 'driver'} to ${successCount} trip(s).`,
      'success'
    );
  };

  const handleQuickAssignDriver = async (tripId: string, driverId: string) => {
    const isUnassigning = !driverId || driverId === 'unassigned';
    const tripToUpdate = trips.find((t) => t.id === tripId);
    if (!tripToUpdate) return;

    const nextStatus: TripStatus = isUnassigning
      ? tripToUpdate.status === 'assigned'
        ? 'pending'
        : tripToUpdate.status
      : ['pending', 'unconfirmed', 'UNCONFIRMED', 'CONFIRMED', 'confirmed'].includes(tripToUpdate.status)
      ? 'assigned'
      : tripToUpdate.status;

    const drvObj = isUnassigning ? undefined : drivers.find((d) => d.id === driverId);
    const updates: Partial<Trip> = {
      assignedDriverId: isUnassigning ? null : driverId,
      status: nextStatus,
      ...(isUnassigning ? {} : { offeredToIds: [] }),
      ...(!isUnassigning && tripToUpdate.offerCascade?.state === 'active'
        ? {
            offerCascade: {
              ...tripToUpdate.offerCascade,
              state: 'accepted',
              activeOfferedDriverId: driverId,
              activeOfferedDriverName: drvObj?.formattedLabel || drvObj?.name,
            },
          }
        : {}),
      ...(drvObj
        ? {
            metadata: {
              ...(tripToUpdate.metadata || {}),
              assignedDriverName: drvObj.name,
              assignedDriverPhone: drvObj.phone,
            },
          }
        : {}),
    };

    const bookingService = getBookingService();
    try {
      if (bookingService.updateTripStatus && nextStatus !== tripToUpdate.status && !isUnassigning) {
        await bookingService.updateTripStatus(tripId, nextStatus, {
          assignedDriverId: driverId,
          actorRole: 'admin',
          reason: `Assigned to driver ${driverId} by dispatcher`,
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(tripId, updates);
      }
      setTrips((prev) => prev.map((t) => (t.id === tripId ? ({ ...t, ...updates } as Trip) : t)));
      const drv = drivers.find((d) => d.id === driverId);
      showDispatchToast(
        isUnassigning
          ? `Trip #${tripId.slice(-6)} unassigned.`
          : `Assigned ${drv?.formattedLabel || drv?.name || 'driver'} to Trip #${tripId.slice(-6)}.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to quick-assign driver:', err);
      showDispatchToast('Failed to assign driver. Please try again.', 'error');
      throw err;
    }
  };

  const handleBatchExportCsv = () => {
    if (selectedTripIds.length === 0) return;
    const selectedTrips = trips.filter((t) => selectedTripIds.includes(t.id));
    if (selectedTrips.length === 0) return;

    const headers = [
      'Trip ID',
      'Status',
      'Booking Type',
      'Pickup Time',
      'Passenger Name',
      'Passenger Phone',
      'Pickup Address',
      'Dropoff Address',
      'Vehicle Tier',
      'Total Fare',
      'Assigned Driver',
    ];

    const rows = selectedTrips.map((t) => [
      `"${t.id}"`,
      `"${t.status}"`,
      `"${t.bookingType || 'scheduled'}"`,
      `"${t.scheduledPickupTime || 'ASAP'}"`,
      `"${[t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}"`,
      `"${t.passenger?.phone || ''}"`,
      `"${(t.pickupLocation?.address || '').replace(/"/g, '""')}"`,
      `"${(t.dropoffLocation?.address || '').replace(/"/g, '""')}"`,
      `"${t.vehicleTier || 'standard'}"`,
      `"$${(t.pricing?.totalFare || 0).toFixed(2)}"`,
      `"${t.assignedDriverId || 'Unassigned'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trips_export_${formatLocalDateStr(new Date())}_${selectedTrips.length}_trips.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBatchCancelTrips = () => {
    if (selectedTripIds.length === 0) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Batch Cancel Bookings',
      message: `Are you sure you want to cancel the ${selectedTripIds.length} selected trip(s)? Any assigned drivers will be notified.`,
      confirmText: 'Cancel Trips',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        const bookingService = getBookingService();
        try {
          for (const id of selectedTripIds) {
            if (bookingService.updateTripStatus) {
              await bookingService.updateTripStatus(id, 'cancelled', {
                actorRole: 'admin',
                reason: 'Batch cancellation by dispatcher',
              });
            } else if (bookingService.updateTrip) {
              await bookingService.updateTrip(id, { status: 'cancelled' });
            }
          }
          setTrips((prev) =>
            prev.map((t) => (selectedTripIds.includes(t.id) ? { ...t, status: 'cancelled' as TripStatus } : t))
          );
          setSelectedTripIds([]);
        } catch (err) {
          console.error('Failed to batch cancel trips:', err);
        }
      },
    });
  };

  const handlePromptCancelTrip = (trip: Trip) => {
    setConfirmModalConfig({
      isOpen: true,
      title: `Cancel Trip #${trip.id.slice(0, 8)}`,
      message: `Are you sure you want to cancel the booking for ${trip.passenger?.firstName || 'Guest'} ${trip.passenger?.lastName || ''}? Any assigned driver will be notified.`,
      confirmText: 'Cancel Trip',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        const bookingService = getBookingService();
        try {
          if (bookingService.updateTripStatus) {
            await bookingService.updateTripStatus(trip.id, 'cancelled', {
              actorRole: 'admin',
              reason: 'Cancelled by dispatcher from Actions Menu',
            });
          } else if (bookingService.updateTrip) {
            await bookingService.updateTrip(trip.id, { status: 'cancelled' });
          }
          setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, status: 'cancelled' as TripStatus } : t)));
        } catch (err) {
          console.error('Failed to cancel trip:', err);
        }
      },
    });
  };

  const handleReactivateTrip = async (trip: Trip) => {
    const bookingService = getBookingService();
    try {
      if (bookingService.updateTripStatus) {
        await bookingService.updateTripStatus(trip.id, 'pending', {
          actorRole: 'admin',
          reason: 'Reactivated by dispatcher from Actions Menu',
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(trip.id, { status: 'pending' });
      }
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, status: 'pending' as TripStatus } : t)));
      setReviewTrip((prev) => (prev && prev.id === trip.id ? { ...prev, status: 'pending' as TripStatus } : prev));
      showDispatchToast(`Trip #${trip.id.slice(-6).toUpperCase()} reactivated to Pending.`, 'success');
    } catch (err) {
      console.error('Failed to reactivate trip:', err);
      showDispatchToast('Failed to reactivate trip.', 'error');
    }
  };

  const handleOpenCompleteTripModal = useCallback((trip: Trip) => {
    setCompleteTripTarget(trip);
    setCompleteModalOpenSeq((seq) => seq + 1);
  }, []);

  // Phase 35: Sequential Auto-Offer Cascade Start & Cancel Handlers
  const handleStartAutoOffer = useCallback(
    async (trip: Trip) => {
      if (!trip?.id || inFlightCascadeIdsRef.current.has(trip.id)) return;
      inFlightCascadeIdsRef.current.add(trip.id);
      autoOfferStartedIdsRef.current.add(trip.id);

      try {
        const res = await startOfferCascade({
          trip,
          drivers,
          zones: dispatchZones,
          config: settings.dispatchAutomation,
          fleetVehicles: settings.fleet,
          activeTrips: trips,
          vehicleTiers: settings.vehicles,
          actorRole: user?.role === 'admin' ? 'admin' : 'dispatcher',
          actorId: user?.uid,
        });

        setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));

        if (res.outcome === 'offered' && res.candidate) {
          showDispatchToast(
            `Offering Trip #${trip.id.slice(-6).toUpperCase()} to ${res.candidate.driverLabel} (Step 1/${res.trip.offerCascade?.maxAttempts || 3} · ${res.trip.offerCascade?.timeoutSeconds || 45}s).`,
            'info'
          );
        } else if (res.outcome === 'exhausted') {
          showDispatchToast(
            `Auto-Offer Cascade: No eligible available drivers matched Trip #${trip.id.slice(-6).toUpperCase()}.`,
            'error'
          );
        }
      } catch (err) {
        console.error('[Dispatch] Failed to start Auto-Offer Cascade:', err);
        showDispatchToast('Failed to start Auto-Offer Cascade.', 'error');
      } finally {
        inFlightCascadeIdsRef.current.delete(trip.id);
      }
    },
    [drivers, dispatchZones, settings.dispatchAutomation, settings.fleet, settings.vehicles, trips, user, showDispatchToast]
  );

  const handleCancelAutoOffer = useCallback(
    async (trip: Trip) => {
      if (!trip?.id || inFlightCascadeIdsRef.current.has(trip.id)) return;
      inFlightCascadeIdsRef.current.add(trip.id);

      try {
        const res = await cancelOfferCascade({
          trip,
          actorRole: user?.role === 'admin' ? 'admin' : 'dispatcher',
          actorId: user?.uid,
        });

        setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));
        showDispatchToast(
          `Offer cascade cancelled for Trip #${trip.id.slice(-6).toUpperCase()}.`,
          'info'
        );
      } catch (err) {
        console.error('[Dispatch] Failed to cancel Offer Cascade:', err);
        showDispatchToast('Failed to cancel Offer Cascade.', 'error');
      } finally {
        inFlightCascadeIdsRef.current.delete(trip.id);
      }
    },
    [user, showDispatchToast]
  );

  const autoOfferContextRef = useRef({
    autoOfferOnConfirm: Boolean(settings.dispatchAutomation?.autoOfferOnConfirm),
    handleStartAutoOffer,
  });
  autoOfferContextRef.current = {
    autoOfferOnConfirm: Boolean(settings.dispatchAutomation?.autoOfferOnConfirm),
    handleStartAutoOffer,
  };

  // Trips real-time subscription with ASAP Ride Audio Chime
  useEffect(() => {
    const service = getBookingService();
    const handleTripsUpdate = (updatedTrips: Trip[]) => {
      if (knownTripIdsRef.current === null) {
        knownTripIdsRef.current = new Set(updatedTrips.map((t) => t.id));
        setTrips(updatedTrips);
        return;
      }

      // Check for incoming new trips
      const newTrips = updatedTrips.filter((t) => !knownTripIdsRef.current!.has(t.id));
      if (newTrips.length > 0) {
        const urgentNewTrips = newTrips.filter(
          (t) =>
            t.bookingType === 'asap' ||
            t.status === 'unconfirmed' ||
            t.status === 'UNCONFIRMED' ||
            t.status === 'pending'
        );
        if (urgentNewTrips.length > 0) {
          soundNotificationService.playAsapRideChime();
          const alertInput = formatDispatchNewRideAlert(urgentNewTrips);
          void pushNotificationService.notifyDispatchAlert(alertInput, { requireHidden: true });
        }
        newTrips.forEach((t) => knownTripIdsRef.current!.add(t.id));

        if (autoOfferContextRef.current.autoOfferOnConfirm) {
          for (const nt of newTrips) {
            const isAutoEligible =
              !nt.assignedDriverId &&
              !nt.offerCascade &&
              !autoOfferStartedIdsRef.current.has(nt.id) &&
              (nt.status === 'CONFIRMED' ||
                nt.status === 'confirmed' ||
                (nt.bookingType === 'asap' && nt.status === 'pending'));
            if (isAutoEligible) {
              void autoOfferContextRef.current.handleStartAutoOffer(nt);
            }
          }
        }
      }

      setTrips(updatedTrips);
    };

    if (service.subscribeToAllTrips) {
      return service.subscribeToAllTrips(
        handleTripsUpdate,
        (err) => console.error('[Dispatch] Trips subscription error:', err)
      );
    } else if (service.getAllTrips) {
      service.getAllTrips().then(handleTripsUpdate).catch(console.error);
    }
  }, []);

  // When active draft tab changes, clear selected map trip so route defaults to active draft
  useEffect(() => {
    setSelectedMapTrip(null);
    setShouldZoomMap(false);
  }, [activeDraftId]);

  // Cross-component active call synchronization via WorkspaceBus
  useEffect(() => {
    const bus = getWorkspaceBus();
    const unsub = bus.subscribe((msg) => {
      if (msg.type === 'CALL_OUTBOUND_STARTED') {
        setActiveCallStatus('connected');
        setActiveCallMeta({
          contactName: msg.payload.contactName || msg.payload.targetNumber,
          phoneNumber: msg.payload.targetNumber,
          duration: 0,
        });
      } else if (msg.type === 'CALL_ANSWERED') {
        setActiveCallStatus('connected');
        if (msg.payload.callerNumber) {
          setActiveCallMeta((prev) => ({
            contactName: prev?.contactName || msg.payload.callerNumber,
            phoneNumber: msg.payload.callerNumber,
            duration: prev?.duration || 0,
          }));
        }
      } else if (msg.type === 'CALL_INCOMING') {
        setActiveCallStatus('calling');
        setActiveCallMeta({
          contactName: msg.payload.callerName || msg.payload.callerNumber,
          phoneNumber: msg.payload.callerNumber,
          duration: 0,
        });
      } else if (msg.type === 'CALL_ENDED') {
        setActiveCallStatus('idle');
        setActiveCallMeta(null);
        setCallDuration(0);
      } else if (msg.type === 'OPEN_COMMS_THREAD') {
        setActiveDockTab('comms');
        setCommsInitialTab('messages');
        setActiveMobileTab('comms');
      } else if (msg.type === 'OPEN_EMAIL_MESSAGE') {
        setActiveDockTab('email');
        setActiveMobileTab('email');
      } else if (msg.type === 'FOCUS_MODULE') {
        if (msg.payload?.moduleKey === 'email') {
          setActiveDockTab('email');
          setActiveMobileTab('email');
        } else if (msg.payload?.moduleKey === 'comms') {
          setActiveDockTab('comms');
          setActiveMobileTab('comms');
        }
      } else if (msg.type === 'EMAIL_STATE_CHANGED') {
        if (typeof msg.payload?.unreadCount === 'number') {
          setUnreadEmailCount(msg.payload.unreadCount);
        }
      }
    });

    const emailSvc = getDispatchEmailService();
    const unsubEmails = emailSvc.subscribe((snap) => {
      setUnreadEmailCount(snap.counts.totalUnread);
    });
    void emailSvc.syncWithServer({ seedSamplesIfOfflineEmpty: true });

    return () => {
      unsub();
      unsubEmails();
    };
  }, []);

  // Softphone call timer
  useEffect(() => {
    let interval: any;
    if (activeCallStatus === 'connected') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
        setActiveCallMeta((prev) => (prev ? { ...prev, duration: prev.duration + 1 } : null));
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [activeCallStatus]);

  // Immediate Sign Out with clean window redirect
  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
        localStorage.removeItem('chesterfield_taxi_admin_session');
      } catch {}
    }
    try {
      getAdminAuthService().signOut().catch(() => {});
    } catch {}
    window.location.href = '/app/login?message=logged_out';
  };

  // Create new draft
  const createDraft = () => {
    if (drafts.length >= maxDrafts) {
      showDispatchToast(`Maximum of ${maxDrafts} drafts allowed. Close a tab first.`, 'info');
      return;
    }
    const newDraft: DraftTab = {
      id: `new-${nextDraftIdx}`,
      isNew: true,
    };
    setDrafts([...drafts, newDraft]);
    setActiveDraftId(newDraft.id);
    setNextDraftIdx((n) => n + 1);
  };

  // Clone an existing booking into a new draft reservation (PCI-safe: scrubs PAN & CVC)
  const handleCloneBookingToNewDraft = (clonedValues: DispatchFormValues) => {
    if (drafts.length >= maxDrafts) {
      showDispatchToast(`Maximum of ${maxDrafts} tabs open. Please close a tab before cloning.`, 'info');
      return;
    }
    const newId = `new-${nextDraftIdx}`;
    setNextDraftIdx((n) => n + 1);

    const safeClonedValues: DispatchFormValues = {
      ...clonedValues,
      cardDetails: clonedValues.cardDetails
        ? {
            ...clonedValues.cardDetails,
            cardNumber: clonedValues.cardDetails.cardNumber
              ? clonedValues.cardDetails.cardNumber.replace(/\D/g, '').slice(-4)
              : '',
            cardCvc: '',
          }
        : clonedValues.cardDetails,
    };

    try {
      localStorage.setItem(`chesterfield_dispatch_draft_${newId}`, JSON.stringify(safeClonedValues));
    } catch {}

    const newDraft: DraftTab = {
      id: newId,
      isNew: true,
      formValues: safeClonedValues,
    };
    setDrafts((prev) => [...prev, newDraft]);
    setActiveDraftId(newId);
    setReviewTrip(null);
    setActiveMobileTab('booking');
    showDispatchToast('Trip copied to new booking tab.', 'info');
  };

  // Close draft (cleans up its cached localStorage draft so stale data never resurfaces)
  const closeDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.removeItem(`chesterfield_dispatch_draft_${id}`);
    } catch {}
    if (drafts.length === 1) {
      const resetDraft: DraftTab = { id: `new-${nextDraftIdx}`, isNew: true };
      setDrafts([resetDraft]);
      setActiveDraftId(resetDraft.id);
      setNextDraftIdx((n) => n + 1);
      return;
    }

    const filtered = drafts.filter((d) => d.id !== id);
    setDrafts(filtered);
    if (activeDraftId === id) {
      setActiveDraftId(filtered[filtered.length - 1].id);
    }
  };

  // Double-click to open edit tab for a trip
  const handleOpenEditTrip = (trip: Trip) => {
    const existingEdit = drafts.find((d) => !d.isNew && (d.trip?.id === trip.id || d.tripId === trip.id));
    if (existingEdit) {
      if (!existingEdit.trip) {
        setDrafts((prev) => prev.map((d) => (d.id === existingEdit.id ? { ...d, trip } : d)));
      }
      setActiveDraftId(existingEdit.id);
      return;
    }

    if (drafts.length >= maxDrafts) {
      showDispatchToast(`Maximum of ${maxDrafts} tabs open. Please close a tab before editing.`, 'info');
      return;
    }

    const editDraft: DraftTab = {
      id: `edit-${trip.id}`,
      isNew: false,
      tripId: trip.id,
      trip,
    };
    setDrafts([...drafts, editDraft]);
    setActiveDraftId(editDraft.id);
  };

  // Automatically open trip edit tab when tripId query parameter is present (e.g. Open Leg in New Tab)
  useEffect(() => {
    if (urlTripId && trips.length > 0 && handledUrlTripIdRef.current !== urlTripId) {
      const match = trips.find((t) => t.id === urlTripId);
      if (match) {
        handledUrlTripIdRef.current = urlTripId;
        handleOpenEditTrip(match);
        setActiveMobileTab('booking');
      }
    }
  }, [urlTripId, trips]);

  // Clone an existing trip into a new booking draft tab (local date + preserves vehicle, stops & extras)
  const handleCloneBooking = (trip: Trip) => {
    const pickupDate = trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime) : new Date();
    const meta = (trip.metadata || {}) as Record<string, any>;
    const clonedVehicle =
      (Array.isArray(meta.selectedVehicles) && meta.selectedVehicles.length > 0
        ? meta.selectedVehicles[0]
        : meta.vehicleTypeId || trip.vehicleTier || 'any') as any;
    const clonedVehicles =
      Array.isArray(meta.selectedVehicles) && meta.selectedVehicles.length > 0
        ? meta.selectedVehicles
        : [clonedVehicle];
    const hh = String(pickupDate.getHours()).padStart(2, '0');
    const mm = String(pickupDate.getMinutes()).padStart(2, '0');

    const clonedValues: DispatchFormValues = {
      timingType: trip.scheduledPickupTime ? 'later' : 'asap',
      scheduledDate: formatLocalDateStr(pickupDate),
      scheduledTime: `${hh}:${mm}`,
      pickupAddress: trip.pickupLocation?.address || '',
      pickupCoordinates: trip.pickupLocation?.coordinates,
      dropoffAddress: trip.dropoffLocation?.address || '',
      dropoffCoordinates: trip.dropoffLocation?.coordinates,
      intermediateStops: (trip.intermediateStops || []).map((s) => ({
        address: s.address,
        coordinates: s.coordinates,
      })),
      passengerName: `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`.trim(),
      phone: trip.passenger?.phone || '',
      email: trip.passenger?.email || '',
      additionalPassengers: Array.isArray(meta.additionalPassengers) ? meta.additionalPassengers : [],
      contactPerson: meta.contactPerson || {
        isBookerDifferent: false,
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        contactRole: '',
      },
      passengers: trip.passenger?.passengerCount || 1,
      bags: trip.passenger?.luggageCount || 0,
      carSeats: Boolean(
        meta.carSeatsBreakdown &&
          ((meta.carSeatsBreakdown.rearFacing || 0) +
            (meta.carSeatsBreakdown.frontFacing || 0) +
            (meta.carSeatsBreakdown.booster || 0)) > 0
      ),
      carSeatsBreakdown: meta.carSeatsBreakdown || {
        rearFacing: 0,
        frontFacing: 0,
        booster: 0,
      },
      selectedVehicles: clonedVehicles,
      vehicle: clonedVehicle,
      paymentMethod:
        trip.payment?.method === 'card'
          ? 'card'
          : trip.payment?.method === 'corporate' || trip.payment?.method === 'account'
          ? 'account'
          : 'cash',
      cardDetails: {
        cardPaymentType: 'terminal',
        cardholderName: '',
        cardNumber: '',
        cardExp: '',
        cardCvc: '',
        saveCardOnFile: false,
      },
      corporateDetails: meta.corporateDetails || {
        corporateAccount: meta.corporateOrgName || '',
        billingPo: '',
        authorizedBy: '',
        invoicingTerms: 'Net 30 Direct Bill',
      },
      tariff: meta.tariff || 'Standard',
      pricingRuleId: meta.pricingRuleId,
      discount: meta.discount || 'None',
      company: meta.company || 'Chesterfield Taxi',
      driverId: 'unassigned',
      notesForAll: trip.driverNotes || trip.passenger.specialRequests || '',
      internalNotes: meta.internalNotes || trip.pickupLocation.driverNotes || '',
      returnDetails: {
        returnTrip: false,
        returnPickupAddress: '',
        returnDropoffAddress: '',
        returnIntermediateStops: [],
        returnDate: '',
        returnTime: '',
        returnPassengers: 1,
        returnBags: 0,
        returnCarSeats: false,
        returnCarSeatsBreakdown: {
          rearFacing: 0,
          frontFacing: 0,
          booster: 0,
        },
        returnVehicles: ['any'],
        autoCreateReturnTrip: false,
        returnEstimatedFare: 0,
        returnEstimatedDurationMinutes: 0,
        returnEstimatedDistanceMiles: 0,
      },
      repeatDetails: {
        repeat: false,
        repeatFrequency: 'daily',
        repeatDays: [],
        repeatOccurrences: 1,
        repeatUntilDate: '',
        repeatWeeksPattern: 'all',
      },
      estimatedFare: trip.pricing?.totalFare || 0,
      returnEstimatedFare: 0,
      totalCalculatedFare: trip.pricing?.totalFare || 0,
      manualFare: '',
      isFareOverridden: false,
      estimatedDurationMinutes: trip.pricing?.durationMinutes || 0,
      estimatedDistanceMiles: trip.pricing?.distanceMiles || 0,
    };
    handleCloneBookingToNewDraft(clonedValues);
  };

  // Assign driver to current active draft (does NOT falsely mark driver busy before booking is submitted!)
  const handleAssignDriverToDraft = (driver: DriverRosterItem) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id === activeDraftId) {
          return {
            ...draft,
            formValues: {
              ...(draft.formValues || {}),
              driverId: driver.id,
            } as any,
          };
        }
        return draft;
      })
    );
    showDispatchToast(`Selected ${driver.formattedLabel || driver.name} for active draft.`, 'info');
  };

  // Re-order trips in driver queue (rethrows on failure so DriverQueueWindow rolls back cleanly)
  const handleReorderDriverQueue = async (driverId: string, reorderedTripIds: string[]) => {
    const bookingService = getBookingService();
    const updatePromises = reorderedTripIds.map((id, index) => {
      const order = index + 1;
      const existing = trips.find((t) => t.id === id);
      const updates: Partial<Trip> = {
        queueOrder: order,
        metadata: {
          ...(existing?.metadata || {}),
          driverQueueOrder: order,
        },
      };
      return bookingService.updateTrip ? bookingService.updateTrip(id, updates) : Promise.resolve(null as any);
    });

    const previousTrips = trips;
    setTrips((prev) =>
      prev.map((t) => {
        const idx = reorderedTripIds.indexOf(t.id);
        if (idx !== -1) {
          return {
            ...t,
            queueOrder: idx + 1,
            metadata: {
              ...(t.metadata || {}),
              driverQueueOrder: idx + 1,
            },
          };
        }
        return t;
      })
    );

    try {
      await Promise.all(updatePromises);
    } catch (err) {
      setTrips(previousTrips);
      console.error('Failed to persist reordered driver queue:', err);
      showDispatchToast('Failed to save queue order — reverted.', 'error');
      throw err;
    }
  };

  // Send dispatch message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    const newMsg: DispatchMessageItem = {
      id: `msg-${Date.now()}`,
      to: msgRecipient,
      text: msgText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      priority: msgPriority,
      isPinned: false,
      isRead: false,
    };
    setMessages((prev) => [newMsg, ...prev]);
    setMsgText('');
  };

  // Softphone dialpad helpers
  const handleDialDigit = (digit: string) => {
    setDialedNumber((prev) => prev + digit);
  };

  const handleStartCall = async (targetNum?: string, peerName?: string) => {
    const numToCall = targetNum || dialedNumber;
    if (!numToCall) return;
    setDialedNumber(numToCall);
    setActiveCallStatus('calling');
    setSoftphoneNotice(`Initiating call to ${numToCall}...`);

    try {
      const telephonyService = getTelephonyService();
      telephonyService.startSoftphoneCall(numToCall, peerName);
    } catch (e) {
      console.warn('Softphone call initiation warning:', e);
    }

    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: sanitizePhoneNumber(numToCall),
        }),
      });

      const data = (await resp.json()) as any;
      if (data.success && data.callSid) {
        setSoftphoneNotice(`Twilio Call Live (SID: ${data.callSid.slice(0, 10)}...). Ringing target phone!`);
      } else if (data.status === 'simulated') {
        setSoftphoneNotice('Simulated WebRTC Call. Configure TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN on the server to place live PSTN calls.');
      } else {
        setSoftphoneNotice(data.message || data.error || 'Simulated call connected.');
      }
    } catch (err: any) {
      console.warn('Telephony endpoint error:', err);
      setSoftphoneNotice('Softphone connected (simulated line).');
    }

    setActiveCallStatus('connected');
  };

  const handleEndCall = () => {
    try {
      const telephonyService = getTelephonyService();
      telephonyService.endSoftphoneCall('call_active');
    } catch (e) {
      console.warn('Softphone call termination warning:', e);
    }
    setActiveCallStatus('idle');
    setCallDuration(0);
    setSoftphoneNotice(null);
  };

  // ─── Rock-Solid Panel Resizing (Sidebar, Bottom Queue, Right Operations Drawer) ───
  // Uses a single activeResizeHandle state + window pointer/mouse listeners (zero render-churn teardown!)
  // paired with a full-screen drag overlay so Google Maps canvas can never steal pointer events.
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setActiveResizeHandle('sidebar');
  }, []);

  const handleQueueMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setActiveResizeHandle('queue');
  }, []);

  const handleOperationsMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setActiveResizeHandle('operations');
  }, []);

  useEffect(() => {
    if (!activeResizeHandle || typeof window === 'undefined') return;

    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (activeResizeHandle === 'sidebar') {
        const maxSidebar = Math.min(680, Math.max(360, window.innerWidth - 420));
        const nextWidth = Math.min(Math.max(e.clientX, 320), maxSidebar);
        setSidebarWidth(nextWidth);
      } else if (activeResizeHandle === 'queue') {
        const maxQueue = Math.max(220, Math.floor(window.innerHeight * 0.65));
        const nextHeight = Math.min(Math.max(window.innerHeight - e.clientY, 150), maxQueue);
        setQueueHeight(nextHeight);
      } else if (activeResizeHandle === 'operations') {
        const maxDock = Math.min(760, Math.max(360, window.innerWidth - 460));
        const nextWidth = Math.min(Math.max(window.innerWidth - e.clientX, 320), maxDock);
        setOperationsWidth(nextWidth);
      }
    };

    const handleUp = () => {
      setActiveResizeHandle(null);
    };

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = activeResizeHandle === 'queue' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('blur', handleUp);

    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('blur', handleUp);
    };
  }, [activeResizeHandle]);

  // Panel Minimization Toggle
  const toggleMinimizePanel = (panelKey: string) => {
    setMinimizedPanels((prev) => ({
      ...prev,
      [panelKey]: !prev[panelKey],
    }));
  };

  // Keypad Toggle: opens numeric dialpad and ensures panel has sufficient height
  const toggleKeypad = () => {
    setShowKeypad((prev) => !prev);
  };

  // Tactical Presets Admin Management
  const handleSaveNewPreset = () => {
    if (!newPresetText.trim()) return;
    const updated = [...tacticalPresets, newPresetText.trim()];
    setTacticalPresets(updated);
    try {
      localStorage.setItem('chesterfield_tactical_presets', JSON.stringify(updated));
    } catch {}
    setMsgText(newPresetText.trim());
    setNewPresetText('');
    setIsAddingPreset(false);
  };

  // Date Formatting & Presets
  const formatDateYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleApplyDatePreset = (preset: string) => {
    setFilterPreset(preset);
    const now = new Date();

    if (preset === 'today') {
      const ymd = formatDateYMD(now);
      setFilterStartDate(ymd);
      setFilterEndDate(ymd);
    } else if (preset === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const ymd = formatDateYMD(tomorrow);
      setFilterStartDate(ymd);
      setFilterEndDate(ymd);
    } else if (preset === 'this_week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setFilterStartDate(formatDateYMD(monday));
      setFilterEndDate(formatDateYMD(sunday));
    } else if (preset === 'last_week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day - 7;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() + diffToMonday);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      setFilterStartDate(formatDateYMD(lastMonday));
      setFilterEndDate(formatDateYMD(lastSunday));
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFilterStartDate(formatDateYMD(firstDay));
      setFilterEndDate(formatDateYMD(lastDay));
    } else if (preset === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setFilterStartDate(formatDateYMD(firstDay));
      setFilterEndDate(formatDateYMD(lastDay));
    } else if (preset === 'next_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      setFilterStartDate(formatDateYMD(firstDay));
      setFilterEndDate(formatDateYMD(lastDay));
    } else {
      // 'all'
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  // Dynamic tab titles based on tab count
  const getTabLabel = (draft: DraftTab) => {
    const isCompact = drafts.length > 3;
    if (draft.isNew) {
      if (draft.formValues?.passengerName?.trim()) {
        const name = draft.formValues.passengerName.trim();
        return isCompact ? name.split(' ')[0] : name;
      }
      const num = draft.id.replace('new-', '');
      return isCompact ? `#${num}` : `New Booking ${num}`;
    } else {
      const shortId = draft.trip?.id.slice(-4) || draft.id.replace('edit-', '').slice(-4);
      return isCompact ? `#${shortId}` : `Edit #${shortId}`;
    }
  };

  const getDateRangeButtonLabel = () => {
    if (dateTimeRange.presetKey && dateTimeRange.presetKey !== 'all_time' && dateTimeRange.presetKey !== 'custom') {
      const labels: Record<string, string> = {
        today: 'Today',
        tomorrow: 'Tomorrow',
        this_week: 'This Week',
        this_month: 'This Month',
        yesterday: 'Yesterday',
        last_7_days: 'Last 7 Days',
        last_week: 'Last Week',
        last_month: 'Last Month',
        next_7_days: 'Next 7 Days',
        next_week: 'Next Week',
        next_month: 'Next Month',
        year_to_date: 'Year to Date',
        rest_of_the_year: 'Rest of the Year',
      };
      if (labels[dateTimeRange.presetKey]) return labels[dateTimeRange.presetKey];
    }
    if (dateTimeRange.startDate && dateTimeRange.endDate) {
      if (dateTimeRange.startDate === dateTimeRange.endDate) {
        return dateTimeRange.startDate;
      }
      return `${dateTimeRange.startDate} - ${dateTimeRange.endDate}`;
    }
    return 'All Dates';
  };

  // Phase 35: Scheduled-Ride SLA Urgency Summary
  const slaSummary = useMemo(
    () =>
      scanUpcomingUnassignedSlaTrips(trips, settings.dispatchAutomation, {
        nowMs: slaClockTick,
      }),
    [trips, settings.dispatchAutomation, slaClockTick]
  );

  // Phase 35: Periodic SLA Monitor & Active Offer Cascade Coordinator Tick
  const coordinatorStateRef = useRef({
    trips,
    drivers,
    dispatchZones,
    settings,
    showDispatchToast,
  });
  coordinatorStateRef.current = {
    trips,
    drivers,
    dispatchZones,
    settings,
    showDispatchToast,
  };

  useEffect(() => {
    const runCoordinatorTick = () => {
      const {
        trips: latestTrips,
        drivers: latestDrivers,
        dispatchZones: latestZones,
        settings: latestSettings,
        showDispatchToast: toastFn,
      } = coordinatorStateRef.current;

      if (!latestTrips || latestTrips.length === 0) return;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const bookingSvc = getBookingService();

      // 1. Evaluate Scheduled SLA threshold transitions (once per trip into warning / critical)
      const currentSlaScan = scanUpcomingUnassignedSlaTrips(
        latestTrips,
        latestSettings.dispatchAutomation,
        { nowMs }
      );

      for (const { trip, sla } of currentSlaScan.atRiskTrips) {
        // Hydrate ref from persisted trip stamps so reload never re-chimes already notified rides
        if (!slaNotifiedLevelsRef.current.has(trip.id)) {
          if (trip.slaStatus?.criticalNotifiedAt) {
            slaNotifiedLevelsRef.current.set(trip.id, 'critical');
          } else if (trip.slaStatus?.warningNotifiedAt) {
            slaNotifiedLevelsRef.current.set(trip.id, 'warning');
          }
        }

        const prevLevel = slaNotifiedLevelsRef.current.get(trip.id);

        if (
          (sla.level === 'critical' || sla.level === 'overdue') &&
          prevLevel !== 'critical'
        ) {
          slaNotifiedLevelsRef.current.set(trip.id, 'critical');
          soundNotificationService.playSlaWarningChime();
          void pushNotificationService.notifyDispatchAlert({
            title: `SLA ${sla.level.toUpperCase()}: Trip #${trip.id.slice(-6).toUpperCase()} (${sla.badgeLabel})`,
            body: `Unassigned scheduled ride: ${trip.pickupLocation?.address || 'Pickup'} → ${trip.dropoffLocation?.address || 'Destination'}`,
            url: `/app/dispatch?tripId=${encodeURIComponent(trip.id)}`,
            tag: `ct-sla-crit-${trip.id}`,
            requireInteraction: true,
          });
          toastFn(
            `SLA ${sla.level.toUpperCase()}: Scheduled Trip #${trip.id.slice(-6).toUpperCase()} (${sla.badgeLabel}) is unassigned!`,
            'error'
          );

          if (bookingSvc.updateTrip && !trip.slaStatus?.criticalNotifiedAt) {
            const nextSla = buildTripSlaStatusPatch(trip.slaStatus, sla, {
              warningNotifiedAt: trip.slaStatus?.warningNotifiedAt || nowIso,
              criticalNotifiedAt: nowIso,
            });
            bookingSvc.updateTrip(trip.id, { slaStatus: nextSla }).catch(() => {});
          }
        } else if (sla.level === 'warning' && !prevLevel) {
          slaNotifiedLevelsRef.current.set(trip.id, 'warning');
          soundNotificationService.playSlaWarningChime();
          void pushNotificationService.notifyDispatchAlert({
            title: `SLA Warning: Trip #${trip.id.slice(-6).toUpperCase()} (${sla.badgeLabel})`,
            body: `Unassigned scheduled pickup: ${trip.pickupLocation?.address || 'Pickup'}`,
            url: `/app/dispatch?tripId=${encodeURIComponent(trip.id)}`,
            tag: `ct-sla-warn-${trip.id}`,
          });

          if (bookingSvc.updateTrip && !trip.slaStatus?.warningNotifiedAt) {
            const nextSla = buildTripSlaStatusPatch(trip.slaStatus, sla, {
              warningNotifiedAt: nowIso,
            });
            bookingSvc.updateTrip(trip.id, { slaStatus: nextSla }).catch(() => {});
          }
        }
      }

      // 2. Advance or Expire Active Offer Cascades
      for (const trip of latestTrips) {
        const cascade = trip.offerCascade;
        if (!cascade || cascade.state !== 'active') continue;
        if (inFlightCascadeIdsRef.current.has(trip.id)) continue;

        const activeDriverId = cascade.activeOfferedDriverId;
        const wasDeclined =
          !activeDriverId ||
          !Array.isArray(trip.offeredToIds) ||
          !trip.offeredToIds.includes(activeDriverId) ||
          (Array.isArray(trip.rejectedByIds) && trip.rejectedByIds.includes(activeDriverId));
        const expiresMs = Date.parse(cascade.offerExpiresAt);
        const isExpired = Number.isFinite(expiresMs) && nowMs >= expiresMs;
        const isAccepted = Boolean(trip.assignedDriverId);

        if (!wasDeclined && !isExpired && !isAccepted) {
          continue;
        }

        inFlightCascadeIdsRef.current.add(trip.id);
        advanceOrExpireOfferCascade({
          trip,
          drivers: latestDrivers,
          zones: latestZones,
          config: latestSettings.dispatchAutomation,
          fleetVehicles: latestSettings.fleet,
          activeTrips: latestTrips,
          vehicleTiers: latestSettings.vehicles,
          nowMs,
        })
          .then((res) => {
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
            setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));

            if (res.outcome === 'advanced' && res.candidate) {
              toastFn(
                `Cascade Step ${res.trip.offerCascade?.cascadeAttempt}/${res.trip.offerCascade?.maxAttempts}: Rolled over Trip #${trip.id.slice(-6).toUpperCase()} to ${res.candidate.driverLabel}.`,
                'info'
              );
            } else if (res.outcome === 'exhausted') {
              soundNotificationService.playSlaWarningChime();
              void pushNotificationService.notifyDispatchAlert({
                title: `Offer Cascade Exhausted — Trip #${trip.id.slice(-6).toUpperCase()}`,
                body: `No driver accepted after ${res.trip.offerCascade?.attemptedDriverIds.length || 0} attempt(s). Manual assignment needed.`,
                url: `/app/dispatch?tripId=${encodeURIComponent(trip.id)}`,
                tag: `ct-cascade-exhausted-${trip.id}`,
                requireInteraction: true,
              });
              toastFn(
                `Offer Cascade exhausted for Trip #${trip.id.slice(-6).toUpperCase()} — assign a driver manually.`,
                'error'
              );
            }
          })
          .catch((err) => {
            console.warn('[Dispatch] Cascade coordinator tick warning:', err);
          })
          .finally(() => {
            inFlightCascadeIdsRef.current.delete(trip.id);
          });
      }
    };

    runCoordinatorTick();
    const interval = setInterval(runCoordinatorTick, 3000);
    return () => clearInterval(interval);
  }, [trips]);

  // Comprehensive memoized filtered trips in queue (local timezone dates + time range + all active filters)
  const filteredTrips = useMemo(() => {
    const normSearchDigits = searchTerm.replace(/\D/g, '');
    const term = searchTerm.trim().toLowerCase();

    return trips.filter((trip) => {
      const meta = (trip.metadata || {}) as Record<string, any>;

      if (slaUrgentOnlyFilter) {
        const sla = slaSummary.byTripId[trip.id];
        if (!sla || !sla.isEligible || sla.level === 'normal') return false;
      }

      // Status filter from dropdown (including unconfirmed & live active states)
      if (statusFilter !== 'all') {
        const tripStatusLower = (trip.status || '').toLowerCase();
        const filterLower = statusFilter.toLowerCase();
        if (tripStatusLower !== filterLower) return false;
      }

      // Filter pills
      if (pillFilter === 'unconfirmed' && trip.status !== 'UNCONFIRMED' && trip.status !== 'unconfirmed') return false;
      if (pillFilter === 'pending' && trip.status !== 'pending') return false;
      if (pillFilter === 'assigned' && trip.status !== 'assigned') return false;
      if (pillFilter === 'completed' && trip.status !== 'completed') return false;
      if (pillFilter === 'cancelled' && trip.status !== 'cancelled') return false;
      if (pillFilter === 'unassigned' && trip.assignedDriverId) return false;

      // Local Timezone Date & Time Range (against scheduledPickupTime or createdAt)
      const to24h = (t?: { hour: string; minute: string; period: 'AM' | 'PM' } | null): string | null => {
        if (!t || !t.hour || !t.minute) return null;
        let h = parseInt(t.hour, 10) % 12;
        if (t.period === 'PM') h += 12;
        return `${String(h).padStart(2, '0')}:${String(parseInt(t.minute, 10)).padStart(2, '0')}`;
      };

      if (dateTimeRange.startDate || dateTimeRange.endDate) {
        const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
        if (tripDateStr) {
          const d = new Date(tripDateStr);
          if (!isNaN(d.getTime())) {
            const localYmd = formatLocalDateStr(d);
            const localHm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const startHm = to24h(dateTimeRange.startTime);
            const endHm = to24h(dateTimeRange.endTime);
            if (dateTimeRange.startDate && localYmd < dateTimeRange.startDate) return false;
            if (dateTimeRange.endDate && localYmd > dateTimeRange.endDate) return false;
            if (
              dateTimeRange.startDate &&
              startHm &&
              localYmd === dateTimeRange.startDate &&
              localHm < startHm
            ) {
              return false;
            }
            if (
              dateTimeRange.endDate &&
              endHm &&
              localYmd === dateTimeRange.endDate &&
              localHm > endHm
            ) {
              return false;
            }
          }
        }
      } else if (filterStartDate || filterEndDate) {
        const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
        if (tripDateStr) {
          const d = new Date(tripDateStr);
          if (!isNaN(d.getTime())) {
            const localYmd = formatLocalDateStr(d);
            if (filterStartDate && localYmd < filterStartDate) return false;
            if (filterEndDate && localYmd > filterEndDate) return false;
          }
        }
      }

      // Active Filter: Driver
      if (activeFilterKeys.includes('driver') && selectedDriverFilter !== 'all') {
        if (trip.assignedDriverId !== selectedDriverFilter) return false;
      }

      // Active Filter: Vehicle (matches both vehicleTier and custom metadata.vehicleTypeId)
      if (activeFilterKeys.includes('vehicle') && selectedVehicleFilter !== 'all') {
        const vId = String(meta.vehicleTypeId || trip.vehicleTier || '').toLowerCase();
        if (vId !== selectedVehicleFilter.toLowerCase() && (trip.vehicleTier || '').toLowerCase() !== selectedVehicleFilter.toLowerCase()) {
          return false;
        }
      }

      // Active Filter: Tariff
      if (activeFilterKeys.includes('tariff') && selectedTariffFilter !== 'all') {
        const tariffStr = `${trip.pricing?.tariffProfileName || ''} ${trip.pricing?.matchedCorridorName || ''} ${meta.tariff || ''} ${meta.pricingRuleName || ''}`.toLowerCase();
        if (!tariffStr.includes(selectedTariffFilter.toLowerCase())) return false;
      }

      // Active Filter: Has Car Seat (checks structured carSeatsBreakdown + notes)
      if (activeFilterKeys.includes('has_car_seat')) {
        const csb = meta.carSeatsBreakdown;
        const hasStructuredSeats = Boolean(
          csb && ((csb.rearFacing || 0) + (csb.frontFacing || 0) + (csb.booster || 0) > 0)
        );
        const notesLower = (
          (trip.passenger?.specialRequests || '') + ' ' +
          (trip.pickupLocation?.notes || '') + ' ' +
          (trip.pickupLocation?.driverNotes || '')
        ).toLowerCase();
        const hasSeat = hasStructuredSeats || notesLower.includes('car seat') || notesLower.includes('carseat') || notesLower.includes('booster');
        if (!hasSeat) return false;
      }

      // Active Filter: Company
      if (activeFilterKeys.includes('company') && selectedCompanyFilter !== 'all') {
        const companyStr = `${meta.corporateOrgName || ''} ${meta.corporateDetails?.corporateAccount || ''} ${meta.company || ''} ${(trip as any).company || ''}`.toLowerCase();
        if (!companyStr.includes(selectedCompanyFilter.toLowerCase())) return false;
      }

      // Active Filter: Payment Type (treats corporate & account equivalently)
      if (activeFilterKeys.includes('payment_type') && selectedPaymentFilter !== 'all') {
        const method = trip.payment?.method || 'cash';
        if (selectedPaymentFilter === 'account' || selectedPaymentFilter === 'corporate') {
          if (method !== 'account' && method !== 'corporate') return false;
        } else if (method !== selectedPaymentFilter) {
          return false;
        }
      }

      // Search query (null-safe & digit-normalized phone matching)
      if (term) {
        const matchId = (trip.id || '').toLowerCase().includes(term);
        const matchPassenger = `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`
          .toLowerCase()
          .includes(term);
        const rawPhone = trip.passenger?.phone || '';
        const matchPhone =
          rawPhone.toLowerCase().includes(term) ||
          (normSearchDigits.length >= 3 && rawPhone.replace(/\D/g, '').includes(normSearchDigits));
        const matchPickup = (trip.pickupLocation?.address || '').toLowerCase().includes(term);
        const matchDropoff = (trip.dropoffLocation?.address || '').toLowerCase().includes(term);
        const matchDriver = (trip.assignedDriverId || '').toLowerCase().includes(term);
        const matchGroup = (trip.multiCarGroupId || '').toLowerCase().includes(term);
        const matchFlight =
          (trip.flightTelemetry?.flightIdent || '').toLowerCase().includes(term) ||
          (trip.flightTelemetry?.airlineName || '').toLowerCase().includes(term) ||
          String(meta.flightNumber || '').toLowerCase().includes(term) ||
          String(meta.airline || '').toLowerCase().includes(term) ||
          String(meta.tailNumber || '').toLowerCase().includes(term);
        if (
          !matchId &&
          !matchPassenger &&
          !matchPhone &&
          !matchPickup &&
          !matchDropoff &&
          !matchDriver &&
          !matchGroup &&
          !matchFlight
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    trips,
    statusFilter,
    pillFilter,
    dateTimeRange,
    filterStartDate,
    filterEndDate,
    activeFilterKeys,
    selectedDriverFilter,
    selectedVehicleFilter,
    selectedTariffFilter,
    selectedCompanyFilter,
    selectedPaymentFilter,
    searchTerm,
    slaUrgentOnlyFilter,
    slaSummary,
  ]);

  // Table Selection Handlers
  const allFilteredSelected =
    filteredTrips.length > 0 && filteredTrips.every((t) => selectedTripIds.includes(t.id));
  const someFilteredSelected =
    filteredTrips.some((t) => selectedTripIds.includes(t.id)) && !allFilteredSelected;

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredTrips.map((t) => t.id));
      setSelectedTripIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredTrips.map((t) => t.id);
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleToggleSelectTrip = (tripId: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  };

  const unconfirmedCount = trips.filter(
    (t) => t.status === 'UNCONFIRMED' || t.status === 'unconfirmed'
  ).length;

  // Active Draft object for map route display
  const activeDraft = drafts.find((d) => d.id === activeDraftId);

  // Ref-backed stable callbacks so toggling side menus/drawers never re-renders
  // DispatchBookingEngine (6k+ lines per tab), LiveFleetMap, or CommsHub (5.5k+ lines).
  const panelCallbacksRef = useRef({
    trips,
    activeDraftId,
    handleDraftValuesChange,
    handleOpenEditTrip,
    handleQuickAssignDriver,
    handleStartCall,
    handleCloneBookingToNewDraft,
    closeDraft,
    setDriverDutyStatus,
    showDispatchToast,
  });
  panelCallbacksRef.current = {
    trips,
    activeDraftId,
    handleDraftValuesChange,
    handleOpenEditTrip,
    handleQuickAssignDriver,
    handleStartCall,
    handleCloneBookingToNewDraft,
    closeDraft,
    setDriverDutyStatus,
    showDispatchToast,
  };

  const stableDraftValuesChange = useCallback((draftId: string, vals: DispatchFormValues) => {
    panelCallbacksRef.current.handleDraftValuesChange(draftId, vals);
  }, []);

  const stableDraftBookingSuccess = useCallback((draftId: string, savedTrip: Trip, isEdit: boolean) => {
    if (savedTrip.multiCarGroupId && (savedTrip.multiCarTotal || 1) > 1) {
      panelCallbacksRef.current.showDispatchToast(
        `${isEdit ? 'Split into' : 'Created'} ${savedTrip.multiCarTotal} linked trips (${savedTrip.multiCarGroupId}) — assign each car individually.`,
        'success'
      );
    } else if (isEdit) {
      panelCallbacksRef.current.showDispatchToast(
        `Trip #${savedTrip.id.slice(-6).toUpperCase()} updated.`,
        'success'
      );
    }
    if (isEdit) {
      // Keep the edit tab open so the dispatcher can review, copy, or make follow-up tweaks; refresh its live trip record
      try {
        localStorage.removeItem(`chesterfield_dispatch_draft_${draftId}`);
      } catch {}
      setDrafts((prev) =>
        prev.map((item) => (item.id === draftId ? { ...item, trip: savedTrip } : item))
      );
    } else if (
      autoOfferContextRef.current.autoOfferOnConfirm &&
      !savedTrip.assignedDriverId &&
      !savedTrip.offerCascade &&
      (savedTrip.status === 'CONFIRMED' ||
        savedTrip.status === 'confirmed' ||
        savedTrip.status === 'pending')
    ) {
      void autoOfferContextRef.current.handleStartAutoOffer(savedTrip);
    }
  }, []);

  const stableClearDraftById = useCallback((draftId: string) => {
    setDrafts((prev) =>
      prev.map((item) => (item.id === draftId ? { ...item, formValues: undefined } : item))
    );
  }, []);

  const stableCloneBooking = useCallback((values: DispatchFormValues) => {
    panelCallbacksRef.current.handleCloneBookingToNewDraft(values);
  }, []);

  const stableOpenLinkedTrip = useCallback(async (linkedTripId: string) => {
    const linkedTrip = panelCallbacksRef.current.trips.find((t) => t.id === linkedTripId);
    if (linkedTrip) {
      panelCallbacksRef.current.handleOpenEditTrip(linkedTrip);
      setActiveMobileTab('booking');
    } else {
      try {
        const statusRes = await getBookingService().getBookingStatus(linkedTripId);
        if (statusRes?.trip) {
          panelCallbacksRef.current.handleOpenEditTrip(statusRes.trip);
          setActiveMobileTab('booking');
        }
      } catch (err) {
        console.error('Failed to load linked trip:', err);
      }
    }
  }, []);

  const stableClearFocusedDriver = useCallback(() => setFocusedMapDriverId(null), []);
  const stableAssignDriverToTrip = useCallback((tripId: string, driverId: string) => {
    panelCallbacksRef.current.handleQuickAssignDriver(tripId, driverId);
  }, []);
  const stableOpenDriverQueue = useCallback((drv: DriverRosterItem) => setQueueDriver(drv), []);
  const stableCallDriverFromMap = useCallback((phone: string, name?: string) => {
    setCommsInitialTab('phone');
    setActiveDockTab('phone');
    panelCallbacksRef.current.handleStartCall(phone, name);
  }, []);
  const stableChangeDriverDutyStatus = useCallback(async (driverId: string, duty: 'on_duty' | 'on_break' | 'off_duty') => {
    try {
      await panelCallbacksRef.current.setDriverDutyStatus(driverId, duty);
      panelCallbacksRef.current.showDispatchToast(
        `Driver status updated to ${duty === 'on_break' ? 'On Break' : duty === 'off_duty' ? 'Offline' : 'Available'}.`,
        'success'
      );
    } catch {
      panelCallbacksRef.current.showDispatchToast('Failed to update driver status.', 'error');
    }
  }, []);
  const stableSelectMapTrip = useCallback((trip: Trip) => {
    setSelectedMapTrip(trip);
    setSelectedQueueTripId(trip.id);
    setShouldZoomMap(true);
  }, []);

  const stableCommsTabChange = useCallback((tab: any) => setCommsActiveTab(tab), []);
  const stableCommsPopOut = useCallback(() => getWorkspaceBus().popOutModule('comms'), []);
  const stableCommsClose = useCallback(() => setActiveDockTab('none'), []);
  const stableCommsOpenEditTrip = useCallback((tripId: string) => {
    const found = panelCallbacksRef.current.trips.find((t) => t.id === tripId);
    if (found) {
      setSelectedQueueTripId(found.id);
      setSelectedMapTrip(found);
      setShouldZoomMap(true);
      panelCallbacksRef.current.handleOpenEditTrip(found);
      setActiveMobileTab('booking');
    }
  }, []);
  const stableCommsPopulateBooking = useCallback((payload: any) => {
    setActiveMobileTab('booking');
    setDrafts((prev) => {
      const target = prev.find((d) => d.id === panelCallbacksRef.current.activeDraftId) || prev[0];
      if (!target) return prev;
      const currentForm = target.formValues || ({} as any);
      const updatedForm: DispatchFormValues = {
        ...currentForm,
        passengerName: payload.passengerName || currentForm.passengerName || '',
        phone: payload.passengerPhone || payload.phone || currentForm.phone || '',
        email: payload.passengerEmail || payload.email || currentForm.email || '',
        pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
        dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
        vehicle: (payload.vehicleTier || payload.vehicle || currentForm.vehicle || 'any') as any,
        selectedVehicles: payload.vehicleTier ? [payload.vehicleTier as any] : (currentForm.selectedVehicles || ['any']),
        corporateDetails: {
          ...currentForm.corporateDetails,
          corporateAccount: payload.corporateAccount || payload.corporateAccountName || payload.accountNumber || currentForm.corporateDetails?.corporateAccount || '',
          billingPo: payload.billingPo || payload.poNumber || currentForm.corporateDetails?.billingPo || '',
          authorizedBy: currentForm.corporateDetails?.authorizedBy || '',
          invoicingTerms: currentForm.corporateDetails?.invoicingTerms || 'Net 30 Direct Bill',
        },
        paymentMethod: (payload.corporateAccount || payload.corporateAccountName || payload.accountNumber) ? 'account' : (currentForm.paymentMethod || 'cash'),
        internalNotes: payload.notes
          ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
          : currentForm.internalNotes,
      };
      return prev.map((item) => (item.id === target.id ? { ...item, formValues: updatedForm } : item));
    });
  }, []);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <SpinnerIcon className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col overflow-hidden text-slate-900 select-none">
      {/* Full-screen drag overlay while resizing so Google Maps canvas / iframes never hijack pointer events */}
      {activeResizeHandle && (
        <div
          className={`fixed inset-0 z-[9999] bg-transparent select-none ${
            activeResizeHandle === 'queue' ? 'cursor-row-resize' : 'cursor-col-resize'
          }`}
        />
      )}
      {/* ─────────────────────────────────────────────────────────────
          INCOMING WEBRTC SOFTPHONE CALL ALERT BANNER
      ───────────────────────────────────────────────────────────── */}
      {incomingCallAlert && (
        <div className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-4 py-2.5 flex items-center justify-between shadow-xl z-50 shrink-0 border-b-2 border-emerald-400 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="w-5 h-5 rounded-full bg-white animate-ping absolute opacity-75" />
              <PhoneIcon className="w-5 h-5 text-white relative animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Incoming Softphone Call
                </span>
                <span className="text-sm font-extrabold tracking-wide">
                  {formatDisplayPhone(incomingCallAlert.from)}
                </span>
              </div>
              <p className="text-[11px] text-emerald-100 font-medium">
                Customer is calling the dispatch desk. Click Answer to connect headset audio.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                getWorkspaceBus().publish('ANSWER_INCOMING_CALL', {});
                setIncomingCallAlert(null);
                setActiveDockTab('phone');
                setCommsActiveTab('phone');
              }}
              className="px-4 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-black shadow-lg transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <PhoneIcon className="w-4 h-4 text-emerald-600" />
              <span>Answer Call</span>
            </button>
            <button
              type="button"
              onClick={() => {
                getWorkspaceBus().publish('REJECT_INCOMING_CALL', {});
                setIncomingCallAlert(null);
              }}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <span>Decline</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. TOP NAVIGATION BAR (Functional & Rerouted)
      ───────────────────────────────────────────────────────────── */}
      <header className="h-12 bg-white border-b border-slate-200 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-xs">
        {/* Left: Mobile Drawer Trigger + View Switcher & Dock Triggers */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile & Desktop Drawer Hamburger Button */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="p-1.5 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
            title="Open Operations & Profile Drawer"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Single Unified Desktop Workspace Switcher: Main | Phone | Email | Drivers */}
          <div className="hidden lg:flex items-center gap-0.5 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80">
            {/* Main Console Tab */}
            <button
              type="button"
              onClick={() => setActiveDockTab('none')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'none'
                  ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Main Console: Booking form, Map, and Trips queue (M)"
            >
              <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
              <span>Main</span>
            </button>

            {/* Phone Tab (Calls, SMS, Voicemail) */}
            <button
              type="button"
              onClick={() => {
                if (activeDockTab === 'phone' || activeDockTab === 'comms') {
                  setActiveDockTab('none');
                } else {
                  setCommsActiveTab('all');
                  setCommsInitialTab('all');
                  setActiveDockTab('phone');
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'phone' || activeDockTab === 'comms'
                  ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Phone & SMS Hub (Alt+P)"
            >
              <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Phone</span>
              {activeCallStatus !== 'idle' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              )}
              {unreadMessagesCount + missedCallsCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white leading-tight">
                  {unreadMessagesCount + missedCallsCount}
                </span>
              )}
            </button>

            {/* Email Tab */}
            <button
              type="button"
              onClick={() => setActiveDockTab(activeDockTab === 'email' ? 'none' : 'email')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'email'
                  ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Email Inbox: dispatch@chesterfieldtaxi.com (Alt+E)"
            >
              <MailIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Email</span>
              {unreadEmailCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-blue-600 text-white leading-tight">
                  {unreadEmailCount}
                </span>
              )}
            </button>

            {/* Drivers Tab */}
            <button
              type="button"
              onClick={() => setActiveDockTab(activeDockTab === 'drivers' ? 'none' : 'drivers')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeDockTab === 'drivers'
                  ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Live Fleet Roster & Status (Alt+D)"
            >
              <CarIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Drivers</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeDockTab === 'drivers'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {drivers.filter((d) => d.mapStatus === 'available').length}
              </span>
            </button>
          </div>
        </div>

        {/* Center: Brand Badge (Desktop only — keeps mobile header uncluttered) */}
        <div className="hidden lg:flex items-center gap-2">
          <div
            style={{
              backgroundColor: 'var(--brand-primary, #2563eb)',
              color: 'var(--btn-primary-text, #ffffff)',
            }}
            className="w-7 h-7 rounded-xl flex items-center justify-center font-black shadow-xs shrink-0"
          >
            {settings.branding?.logoUrl ? (
              <img
                src={settings.branding.logoUrl}
                alt={settings.company?.name || COMPANY_CONFIG.name}
                className="w-4.5 h-4.5 object-contain"
              />
            ) : (
              <CarIcon className="w-4 h-4 text-white" />
            )}
          </div>
          <span className="font-extrabold text-sm tracking-tight text-slate-900 hidden sm:inline">
            {settings.company?.name || COMPANY_CONFIG.name}
          </span>
        </div>

        {/* Right: Active Call HUD (only visible on desktop during live call) + Utility Controls (Alerts, Audio, App Suite) */}
        <div className="flex items-center gap-2">
          <DispatchHeaderCallHud
            trips={trips}
            missedCallsCount={missedCallsCount}
            hideIdleButtonOnDesktop={true}
            isPhoneDockActive={
              activeDockTab === 'phone' || activeDockTab === 'comms'
            }
            onTogglePhoneDock={() => {
              if (activeDockTab === 'phone' || activeDockTab === 'comms') {
                setActiveDockTab('none');
              } else {
                setCommsActiveTab('all');
                setCommsInitialTab('all');
                setActiveDockTab('phone');
                setActiveMobileTab('comms');
              }
            }}
            onOpenBooking={() => setActiveMobileTab('booking')}
            onOpenEditTrip={(tripId) => {
              const found = trips.find((t) => t.id === tripId) || {
                id: tripId,
                bookingType: 'scheduled',
                status: 'CONFIRMED',
                pickupLocation: { address: '14848 Conway Rd, Chesterfield, MO' },
                dropoffLocation: { address: 'Lambert Airport Terminal 1 (STL)' },
                passenger: { firstName: 'Sarah', lastName: 'Jenkins', phone: '(314) 532-1200' },
                pricing: { totalFare: 68.5 },
              } as Trip;
              setSelectedQueueTripId(found.id);
              setSelectedMapTrip(found);
              setShouldZoomMap(true);
              handleOpenEditTrip(found);
              setActiveMobileTab('booking');
            }}
            onOpenComms={(tab, phone) => {
              if (tab) {
                setCommsInitialTab(tab);
                setCommsActiveTab(tab);
              }
              setActiveDockTab(tab === 'phone' ? 'phone' : 'comms');
              setActiveMobileTab('comms');
            }}
            onPopulateBooking={(payload) => {
              setActiveMobileTab('booking');
              setDrafts((prev) => {
                const target = prev.find((d) => d.id === activeDraftId) || prev[0];
                if (!target) return prev;
                const currentForm = target.formValues || ({} as any);
                const updatedForm: DispatchFormValues = {
                  ...currentForm,
                  passengerName: payload.passengerName || currentForm.passengerName || '',
                  phone: payload.passengerPhone || payload.phone || currentForm.phone || '',
                  email: payload.passengerEmail || payload.email || currentForm.email || '',
                  pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
                  dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
                  vehicle: (payload.vehicleTier || payload.vehicle || currentForm.vehicle || 'any') as any,
                  selectedVehicles: payload.vehicleTier ? [payload.vehicleTier as any] : (currentForm.selectedVehicles || ['any']),
                  corporateDetails: {
                    ...currentForm.corporateDetails,
                    corporateAccount: payload.corporateAccount || payload.corporateAccountName || payload.accountNumber || currentForm.corporateDetails?.corporateAccount || '',
                    billingPo: payload.billingPo || payload.poNumber || currentForm.corporateDetails?.billingPo || '',
                    authorizedBy: currentForm.corporateDetails?.authorizedBy || '',
                    invoicingTerms: currentForm.corporateDetails?.invoicingTerms || 'Net 30 Direct Bill',
                  },
                  paymentMethod: (payload.corporateAccount || payload.corporateAccountName || payload.accountNumber) ? 'account' : (currentForm.paymentMethod || 'cash'),
                  internalNotes: payload.notes
                    ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
                    : currentForm.internalNotes,
                };
                return prev.map((d) => (d.id === target.id ? { ...d, formValues: updatedForm } : d));
              });
            }}
          />

          {/* Mobile-only Messages Shortcut (hidden on desktop to prevent double nav bar) */}
          <button
            type="button"
            onClick={() => {
              if (
                activeDockTab !== 'none' &&
                (activeDockTab === 'phone' || activeDockTab === 'comms') &&
                commsActiveTab === 'messages'
              ) {
                setActiveDockTab('none');
              } else {
                setCommsActiveTab('messages');
                setCommsInitialTab('messages');
                setActiveDockTab('phone');
                setActiveMobileTab('messages');
                setUnreadMessagesCount(0);
              }
            }}
            className={`lg:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              activeDockTab !== 'none' &&
              (activeDockTab === 'phone' || activeDockTab === 'comms') &&
              commsActiveTab === 'messages'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200 shadow-2xs'
            }`}
            title="Communications & Messages Hub"
            aria-label="Messages"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {unreadMessagesCount}
              </span>
            )}
          </button>

          {/* Mobile-only Drivers Shortcut (hidden on desktop to prevent double nav bar) */}
          <button
            type="button"
            onClick={() => {
              if (activeDockTab === 'drivers') {
                setActiveDockTab('none');
              } else {
                setActiveDockTab('drivers');
                setActiveMobileTab('drivers');
              }
            }}
            className={`lg:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              activeDockTab === 'drivers'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200 shadow-2xs'
            }`}
            title="Open Drivers Roster"
            aria-label="Drivers Roster"
          >
            <CarIcon className="w-4 h-4" />
            {drivers.filter((d) => d.mapStatus === 'available').length > 0 && (
              <span
                className={`absolute -top-1 -right-1 text-[10px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center shadow-xs ${
                  activeDockTab === 'drivers'
                    ? 'bg-blue-800 text-white border border-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {drivers.filter((d) => d.mapStatus === 'available').length}
              </span>
            )}
          </button>

          {/* Tactical Alerts Bell Notification Center */}
          <div className="relative" ref={alertsDropdownRef}>
            <button
              type="button"
              onClick={() => setShowAlertsDropdown((prev) => !prev)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                showAlertsDropdown
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200 shadow-2xs'
              }`}
              title="Fleet Broadcasts & Tactical Alerts"
              aria-label="Alerts"
            >
              <BellIcon className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {/* Alerts Dropdown Popover */}
            {showAlertsDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <BellIcon className="w-4 h-4 text-amber-400" />
                    <span className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                      Fleet Tactical Alerts
                    </span>
                    {unreadAlertsCount > 0 ? (
                      <span className="bg-rose-600 text-[10px] font-black px-1.5 py-0.2 rounded-full text-white">
                        {unreadAlertsCount} new
                      </span>
                    ) : activeAndSortedMessages.length > 0 ? (
                      <span className="bg-slate-700 text-[10px] font-bold px-1.5 py-0.2 rounded-full text-slate-300">
                        {activeAndSortedMessages.length}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAlertsDropdown(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Close alerts"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Toolbar: Auto-Dismiss selector & Mark Read */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600">
                  <div className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Auto-dismiss:</span>
                    <select
                      value={alertDismissMinutes}
                      onChange={(e) => handleUpdateAlertDismissMinutes(parseInt(e.target.value, 10))}
                      className="font-bold text-slate-800 bg-transparent border-none cursor-pointer focus:outline-hidden"
                      title="Admin-configured alert auto-dismiss window"
                    >
                      <option value={15}>15m</option>
                      <option value={30}>30m</option>
                      <option value={60}>1h (Default)</option>
                      <option value={120}>2h</option>
                      <option value={240}>4h</option>
                      <option value={720}>12h</option>
                      <option value={1440}>24h</option>
                      <option value={0}>Never</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadAlertsCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllAlertsRead}
                        className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                    {activeAndSortedMessages.some((m) => !m.isPinned) && (
                      <button
                        type="button"
                        onClick={handleClearUnpinnedAlerts}
                        className="text-slate-500 hover:text-rose-600 font-bold hover:underline cursor-pointer"
                      >
                        Clear unpinned
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Broadcast Input */}
                <form
                  onSubmit={(e) => {
                    handleSendMessage(e);
                  }}
                  className="p-2.5 bg-slate-50/50 border-b border-slate-200 flex gap-1.5"
                >
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Broadcast alert to all drivers..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer"
                  >
                    Send
                  </button>
                </form>

                {/* Alerts List */}
                <div className="max-h-72 overflow-y-auto p-3 space-y-2 text-xs">
                  {activeAndSortedMessages.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 space-y-1">
                      <p className="font-bold text-slate-600">No active fleet alerts</p>
                      <p className="text-[11px]">All drivers operating under normal conditions.</p>
                    </div>
                  ) : (
                    activeAndSortedMessages.map((m) => (
                      <FleetAlertCard
                        key={m.id}
                        message={m}
                        onTogglePin={handleTogglePinAlert}
                        onToggleRead={handleToggleReadAlert}
                        onDismiss={handleDismissAlert}
                      />
                    ))
                  )}
                </div>

                {/* Popover Footer Info */}
                <div className="p-2 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-500 flex items-center justify-between px-3">
                  <span>
                    {activeAndSortedMessages.length} active ({pinnedAlertsCount} pinned)
                  </span>
                  <span>
                    Retention: {alertDismissMinutes === 0 ? 'Permanent' : `${alertDismissMinutes}m`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Audio Chime & Inbound Ring Mute Toggle */}
          <button
            type="button"
            onClick={toggleSoundMuted}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              isSoundMuted
                ? 'bg-slate-100 text-slate-400 border border-slate-200 hover:text-slate-600'
                : 'bg-white text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 shadow-2xs'
            }`}
            title={
              isSoundMuted
                ? 'Dispatch Audio Muted (Click to Unmute Calls & ASAP Chimes)'
                : 'Dispatch Audio Active (Inbound Ring & ASAP Chimes Enabled)'
            }
            aria-label="Sound Notification Toggle"
          >
            {isSoundMuted ? (
              <VolumeXIcon className="w-4 h-4 shrink-0" />
            ) : (
              <BellIcon className="w-4 h-4 shrink-0" />
            )}
            {!isSoundMuted && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            )}
          </button>

          {/* Phase 34: Workstation Wake Lock & Browser Push Alerts Settings Menu */}
          <div className="relative" ref={deviceSettingsMenuRef}>
            <button
              type="button"
              onClick={() => setShowDeviceSettingsMenu((prev) => !prev)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                showDeviceSettingsMenu
                  ? 'bg-blue-600 text-white shadow-md'
                  : keepScreenAwake && dispatchWakeLock.isActive
                  ? 'bg-white text-blue-600 hover:bg-blue-50 border border-blue-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200 shadow-2xs'
              }`}
              title="Console Settings: Keep Screen Awake & Browser Push Alerts"
              aria-label="Console Settings"
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              {(keepScreenAwake || dispatchPush.alertsEnabled) && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>

            {showDeviceSettingsMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4 text-blue-400" />
                    <span className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                      Console &amp; Alert Settings
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeviceSettingsMenu(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label="Close settings menu"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 space-y-2.5 text-xs">
                  {/* Keep Screen Awake Toggle */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SunIcon
                        className={`w-4 h-4 shrink-0 ${
                          keepScreenAwake && dispatchWakeLock.isActive
                            ? 'text-amber-500'
                            : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 block leading-tight">
                          Keep Screen Awake
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {!dispatchWakeLock.isSupported
                            ? 'Not supported in this browser'
                            : keepScreenAwake
                            ? dispatchWakeLock.isActive
                              ? 'Active — screen lock prevented'
                              : 'Enabled — re-acquires on focus'
                            : 'Prevent display sleep on shift'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!dispatchWakeLock.isSupported}
                      onClick={handleToggleKeepScreenAwake}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-colors ${
                        !dispatchWakeLock.isSupported
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : keepScreenAwake
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer'
                      }`}
                    >
                      {keepScreenAwake ? 'Active' : 'Off'}
                    </button>
                  </div>

                  {/* Browser Push Alerts Opt-In / Toggle */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BellIcon
                        className={`w-4 h-4 shrink-0 ${
                          dispatchPush.permission === 'granted' && dispatchPush.alertsEnabled
                            ? 'text-blue-600'
                            : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 block leading-tight">
                          Browser Push Alerts
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {!dispatchPush.isSupported
                            ? 'Notifications unsupported'
                            : dispatchPush.permission === 'denied'
                            ? 'Blocked in browser permissions'
                            : dispatchPush.permission === 'granted'
                            ? dispatchPush.alertsEnabled
                              ? 'Notifies on background ASAP/Unconfirmed rides'
                              : 'Background push notifications paused'
                            : 'Alert when new rides arrive in background'}
                        </span>
                      </div>
                    </div>
                    {!dispatchPush.isSupported ? (
                      <span className="px-2 py-1 rounded-lg bg-slate-200 text-slate-500 text-[10px] font-bold shrink-0">
                        N/A
                      </span>
                    ) : dispatchPush.permission === 'denied' ? (
                      <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-bold shrink-0">
                        Blocked
                      </span>
                    ) : dispatchPush.permission === 'default' ? (
                      <button
                        type="button"
                        disabled={dispatchPush.isRequesting}
                        onClick={() => void dispatchPush.enableAlerts()}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        {dispatchPush.isRequesting ? 'Enabling...' : 'Enable'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={dispatchPush.isRequesting}
                        onClick={() => void dispatchPush.toggleAlerts()}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                          dispatchPush.alertsEnabled
                            ? 'bg-blue-600 text-white hover:bg-blue-500'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {dispatchPush.alertsEnabled ? 'Enabled' : 'Paused'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* App Suite Launcher (9-Dot Grid) */}
          <AppSuiteLauncher />
        </div>
      </header>

      {/* ─── ACTIVE CALL TOP STICKY GREEN BANNER (CALL PERSISTENCE ACROSS TABS / DOCK CLOSE - SMALL SCREENS ONLY) ─── */}
      {activeCallStatus !== 'idle' && (activeDockTab !== 'phone' || (activeMobileTab !== 'comms' && activeMobileTab !== 'phone')) && (
        <div
          onClick={() => {
            setActiveDockTab('phone');
            setCommsInitialTab('phone');
            setActiveMobileTab('comms');
          }}
          className="lg:hidden w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 flex items-center justify-between cursor-pointer shadow-md z-30 transition-colors select-none shrink-0"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping absolute" />
              <PhoneIcon className="w-4 h-4 text-white relative shrink-0" />
            </div>
            <span className="font-extrabold text-xs truncate">
              In Call: {activeCallMeta?.contactName || activeCallMeta?.phoneNumber || dialedNumber || 'Live Customer'}
            </span>
            <span className="font-mono bg-emerald-800/80 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
              {Math.floor((activeCallMeta?.duration ?? callDuration) / 60)}:
              {((activeCallMeta?.duration ?? callDuration) % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveDockTab('phone');
                setCommsInitialTab('phone');
                setActiveMobileTab('comms');
              }}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Return to Call →</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                getWorkspaceBus().publish('CALL_ENDED', { durationSeconds: activeCallMeta?.duration ?? callDuration });
                setActiveCallStatus('idle');
                setActiveCallMeta(null);
                setCallDuration(0);
              }}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <span>End</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1C. SLIDE-OUT OPERATIONS & PROFILE DRAWER (MATCHING ADMIN SIDEBAR)
      ───────────────────────────────────────────────────────────── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 text-slate-300 h-full shadow-2xl flex flex-col p-4 z-10 overflow-y-auto">
            {/* Drawer Header (Admin Logo & Operational Indicator) */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div
                  style={{
                    backgroundColor: 'var(--brand-primary, #2563eb)',
                    color: 'var(--btn-primary-text, #ffffff)',
                  }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black shadow-md shrink-0"
                >
                  {settings.branding?.logoUrl ? (
                    <img
                      src={settings.branding.logoUrl}
                      alt={settings.company?.name || COMPANY_CONFIG.name}
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <CarIcon className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white tracking-tight truncate">
                      {settings.company?.name || COMPANY_CONFIG.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      Operational
                    </span>
                    <span>•</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Dispatch
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
                title="Close drawer"
                aria-label="Close navigation drawer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Operations Triggers */}
            <div className="py-3 border-b border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Operations
                </span>
                <span className="hidden lg:inline text-[10px] text-blue-400 font-bold">Detachable</span>
              </div>

              {/* Main Console */}
              <button
                type="button"
                onClick={() => {
                  setActiveDockTab('none');
                  setActiveMobileTab('queue');
                  setIsMobileDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  (isDesktop ? activeDockTab === 'none' : activeMobileTab === 'queue' || activeMobileTab === 'booking' || activeMobileTab === 'map')
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Squares2X2Icon className="w-4 h-4" />
                  <span>Main Console</span>
                </div>
                <span className="text-[10px] opacity-80 font-bold">Booking • Map • Trips</span>
              </button>

              {/* Phone Hub (Calls & SMS) with Desktop Pop-Out */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCommsInitialTab('all');
                    setCommsActiveTab('all');
                    setActiveDockTab('phone');
                    setActiveMobileTab('comms');
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (isDesktop ? (activeDockTab === 'phone' || activeDockTab === 'comms') : (activeMobileTab === 'comms' || activeMobileTab === 'phone' || activeMobileTab === 'messages'))
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <PhoneIcon className="w-4 h-4" />
                    <span>Phone Hub</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (isDesktop ? (activeDockTab === 'phone' || activeDockTab === 'comms') : (activeMobileTab === 'comms' || activeMobileTab === 'phone' || activeMobileTab === 'messages'))
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Calls &amp; SMS
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('comms')}
                  title="Pop out Phone Hub to detached window"
                  className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              {/* Email Console with Desktop Pop-Out */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDockTab('email');
                    setActiveMobileTab('email');
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (isDesktop ? activeDockTab === 'email' : activeMobileTab === 'email')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MailIcon className="w-4 h-4" />
                    <span>Email Console</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (isDesktop ? activeDockTab === 'email' : activeMobileTab === 'email')
                        ? 'bg-white/20 text-white'
                        : unreadEmailCount > 0
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {unreadEmailCount > 0 ? `${unreadEmailCount} unread` : 'Inquiries'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('email')}
                  title="Pop out Email Console to detached window"
                  className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              {/* Drivers Roster with Desktop Pop-Out */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDockTab('drivers');
                    setActiveMobileTab('drivers');
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (isDesktop ? activeDockTab === 'drivers' : activeMobileTab === 'drivers')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CarIcon className="w-4 h-4" />
                    <span>Drivers Roster</span>
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      (isDesktop ? activeDockTab === 'drivers' : activeMobileTab === 'drivers')
                        ? 'text-white'
                        : 'text-slate-300'
                    }`}
                  >
                    {drivers.filter((d) => d.status === 'available').length} Avail
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('drivers')}
                  title="Pop out Drivers to detached window"
                  className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              {/* Fleet Alerts & Broadcasts */}
              <button
                type="button"
                onClick={() => {
                  if (isDesktop) {
                    setActiveDockTab('alerts');
                  } else {
                    setShowAlertsDropdown(true);
                  }
                  setIsMobileDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeDockTab === 'alerts'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BellIcon className="w-4 h-4" />
                  <span>Alerts &amp; Broadcasts</span>
                </div>
                {messages.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-black">
                    {messages.length}
                  </span>
                )}
              </button>
            </div>

            {/* Workspace Layout Preferences (Desktop Only — multi-pane dock & detached windows) */}
            <div className="hidden lg:block py-3 border-b border-slate-800/80 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                Workspace Workflow Layout
              </span>
              <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-xl text-center text-[10px] font-bold border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceLayout('compact');
                    setActiveDockTab('none');
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    workspaceLayout === 'compact'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Compact HUD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceLayout('split');
                    setActiveDockTab('phone');
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    workspaceLayout === 'split'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Split Dock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceLayout('popout');
                    getWorkspaceBus().popOutModule('comms');
                  }}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    workspaceLayout === 'popout'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pop-Out ↗
                </button>
              </div>
              <p className="text-[10px] text-slate-400 px-1 leading-tight">
                {workspaceLayout === 'compact' && 'Minimal desktop: floating caller HUD + full queue space.'}
                {workspaceLayout === 'split' && 'Multi-tasking: side-by-side dock with dialer & roster.'}
                {workspaceLayout === 'popout' && 'Multi-monitor: detached windows with cross-window sync.'}
              </p>
            </div>

            {/* Mobile Card Gesture Preferences (Mobile Only) */}
            <div className="lg:hidden py-3 border-b border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Preferences · Trip Card Gesture
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-950/80 p-1 rounded-xl text-center text-[11px] font-bold border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMobileCardGestureMode('action_sheet')}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    mobileCardGestureMode === 'action_sheet'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hold → Actions
                </button>
                <button
                  type="button"
                  onClick={() => setMobileCardGestureMode('multi_select')}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    mobileCardGestureMode === 'multi_select'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hold → Select
                </button>
              </div>
              <p className="text-[10px] text-slate-400 px-1 leading-snug">
                {mobileCardGestureMode === 'action_sheet'
                  ? 'Tap a trip card for Trip Details & context actions. Touch & hold for Quick Actions.'
                  : 'Tap a trip card for Trip Details & context actions. Touch & hold to multi-select.'}
              </p>
            </div>

            {/* Phase 34: Workstation Screen Awake & Browser Push Alerts (Drawer Controls) */}
            <div className="py-3 border-b border-slate-800/80 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                Device &amp; Push Alerts
              </span>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <SunIcon
                    className={`w-4 h-4 shrink-0 ${
                      keepScreenAwake && dispatchWakeLock.isActive
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="font-semibold text-slate-200 truncate">Keep Screen Awake</span>
                </div>
                <button
                  type="button"
                  disabled={!dispatchWakeLock.isSupported}
                  onClick={handleToggleKeepScreenAwake}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 transition-colors ${
                    !dispatchWakeLock.isSupported
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : keepScreenAwake
                      ? 'bg-emerald-600 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer'
                  }`}
                >
                  {!dispatchWakeLock.isSupported ? 'N/A' : keepScreenAwake ? 'Active' : 'Off'}
                </button>
              </div>

              {dispatchPush.isSupported && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BellIcon
                      className={`w-4 h-4 shrink-0 ${
                        dispatchPush.permission === 'granted' && dispatchPush.alertsEnabled
                          ? 'text-blue-400'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="font-semibold text-slate-200 truncate">Browser Push Alerts</span>
                  </div>
                  {dispatchPush.permission === 'denied' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold shrink-0">
                      Blocked
                    </span>
                  ) : dispatchPush.permission === 'default' ? (
                    <button
                      type="button"
                      disabled={dispatchPush.isRequesting}
                      onClick={() => void dispatchPush.enableAlerts()}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                    >
                      {dispatchPush.isRequesting ? '...' : 'Enable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={dispatchPush.isRequesting}
                      onClick={() => void dispatchPush.toggleAlerts()}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 cursor-pointer ${
                        dispatchPush.alertsEnabled
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {dispatchPush.alertsEnabled ? 'On' : 'Off'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="py-3 border-b border-slate-800/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1">
                System &amp; Platform
              </span>
              <Link
                to="/app/admin"
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                onClick={() => setIsMobileDrawerOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Admin Console</span>
                </span>
                <span className="text-slate-500">→</span>
              </Link>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                onClick={() => setIsMobileDrawerOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <GlobeIcon className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Public Live Site</span>
                </span>
                <span className="text-slate-500">↗</span>
              </a>
            </div>

            {/* Account and Profile Menu (Consistently in Side Drawer with Dark Variant) */}
            <div className="mt-auto pt-3 border-t border-slate-800 shrink-0">
              <UserDropdown
                email={user?.email}
                onSignOut={handleSignOut}
                variant="dark"
                currentView="dispatch"
                dropUp={true}
                triggerVariant="full"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. WORKSPACE: LEFT PERSISTENT SIDEBAR + CENTER MAP & QUEUE + RIGHT DOCKED PANEL
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative pb-14 lg:pb-0">
        {/* ─── A. LEFT SIDEBAR: TABBED DRAFT / EDIT ENGINE ─── */}
        <aside
          style={{
            width: isDesktop ? `${sidebarWidth}px` : undefined,
          }}
          className={`h-full bg-white border-r border-slate-200 flex flex-col shrink-0 relative z-20 shadow-xs ${
            activeMobileTab === 'booking' ? 'flex w-full' : 'hidden lg:flex'
          }`}
        >
          {/* Browser-style Tab Bar (Pill tabs on mobile, classic tabs on desktop) */}
          <div className="h-11 lg:h-9 bg-slate-100 border-b border-slate-200 flex items-center px-1.5 lg:px-1 shrink-0 select-none relative">
            <div className="flex-1 flex items-center gap-1.5 lg:gap-1 overflow-x-auto h-full scrollbar-none py-1.5 lg:py-1 min-w-0">
              {drafts.map((d) => {
                const isActive = d.id === activeDraftId;
                const label = getTabLabel(d);
                const hasData = Boolean(
                  d.formValues?.pickupAddress?.trim() ||
                    d.formValues?.dropoffAddress?.trim() ||
                    d.formValues?.passengerName?.trim() ||
                    d.formValues?.phone?.trim()
                );
                return (
                  <div
                    key={d.id}
                    onClick={() => setActiveDraftId(d.id)}
                    title={d.formValues?.passengerName || label}
                    className={`group relative h-8 lg:h-7 px-2.5 lg:px-2 rounded-xl lg:rounded-t-md lg:rounded-b-none text-xs font-semibold flex items-center gap-1.5 lg:gap-1 cursor-pointer border lg:border-b-0 transition-colors shrink-0 max-w-[140px] lg:max-w-[104px] ${
                      isActive
                        ? 'bg-white text-blue-600 border-slate-300 shadow-xs'
                        : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
                    }`}
                  >
                    {hasData && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                        title="Saved draft data"
                      />
                    )}
                    <span className="truncate flex-1 text-xs lg:text-[11px]">{label}</span>
                    <button
                      type="button"
                      onClick={(e) => closeDraft(d.id, e)}
                      className="w-5 h-5 lg:w-3.5 lg:h-3.5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-300/80 cursor-pointer shrink-0"
                      title="Close Tab"
                      aria-label={`Close ${label}`}
                    >
                      <XIcon className="w-3 h-3 lg:w-2.5 lg:h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Pinned Add Tab & Overflow Actions (Always visible, never squeezed under dropdown) */}
            <div className="flex items-center shrink-0 pl-1.5 lg:pl-1 border-l border-slate-200 gap-1 lg:gap-0.5">
              {drafts.length < maxDrafts && (
                <button
                  type="button"
                  onClick={createDraft}
                  className="h-8 w-8 lg:h-7 lg:w-7 rounded-xl lg:rounded bg-white lg:bg-transparent border border-slate-200 lg:border-transparent hover:bg-slate-200 text-slate-700 lg:text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                  title="Open new draft booking tab"
                  aria-label="New booking tab"
                >
                  <PlusIcon className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                </button>
              )}

              {/* Tab Overflow Chevron Menu (Bottom sheet on mobile, popover on desktop) */}
              <div className="relative shrink-0 flex items-center" ref={tabOverflowRef}>
                <button
                  type="button"
                  onClick={() => setIsTabOverflowOpen(!isTabOverflowOpen)}
                  className={`h-8 w-8 lg:h-7 lg:w-auto lg:px-1.5 rounded-xl lg:rounded flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                    isTabOverflowOpen
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-white lg:bg-transparent border border-slate-200 lg:border-transparent hover:bg-slate-200 text-slate-600 lg:text-slate-500 hover:text-slate-800'
                  }`}
                  title="All Open Draft Tabs"
                  aria-label="All open tabs"
                >
                  <ChevronDownIcon className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                </button>

                {isTabOverflowOpen && (
                  <>
                    {/* Desktop Popover */}
                    <div className="hidden lg:block absolute right-0 top-8 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                        <span>Open Tabs ({drafts.length}/{maxDrafts})</span>
                        {drafts.length < maxDrafts && (
                          <button
                            type="button"
                            onClick={() => {
                              createDraft();
                              setIsTabOverflowOpen(false);
                            }}
                            className="text-blue-600 hover:text-blue-800 font-bold text-xs capitalize cursor-pointer"
                          >
                            + New Tab
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 py-1">
                        {drafts.map((d) => {
                          const isActive = d.id === activeDraftId;
                          const label = getTabLabel(d);
                          const subtitle = d.formValues?.phone || (d.isNew ? 'New Draft Reservation' : 'Existing Trip Edit');
                          return (
                            <div
                              key={d.id}
                              className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                                isActive ? 'bg-blue-50/80 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                              onClick={() => {
                                setActiveDraftId(d.id);
                                setIsTabOverflowOpen(false);
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {d.isNew ? (
                                  <DocumentTextIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                ) : (
                                  <PencilIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="font-semibold truncate text-xs flex items-center gap-1.5">
                                    <span>{label}</span>
                                    {isActive && (
                                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeDraft(d.id, e);
                                }}
                                className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors ml-2 cursor-pointer"
                                title="Close tab"
                              >
                                <XIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mobile Drag-Down-to-Close Draft Tabs Sheet */}
                    <div
                      className="lg:hidden fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-[2px] flex items-end"
                      onClick={() => setIsTabOverflowOpen(false)}
                    >
                      <div
                        style={dispatchSheetDrag.sheetStyle}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 max-h-[75dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 pb-[max(1rem,env(safe-area-inset-bottom))]"
                      >
                        <div
                          {...dispatchSheetDrag.dragHandlers}
                          className="bg-slate-900 text-white px-4 pt-2 pb-3 shrink-0 touch-none"
                        >
                          <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5" aria-hidden="true" />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black tracking-tight">
                              Booking Tabs ({drafts.length}/{maxDrafts})
                            </span>
                            <div className="flex items-center gap-2">
                              {drafts.length < maxDrafts && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    createDraft();
                                    setIsTabOverflowOpen(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <PlusIcon className="w-3.5 h-3.5" />
                                  <span>New</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setIsTabOverflowOpen(false)}
                                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                                aria-label="Close tabs sheet"
                              >
                                <XIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 space-y-2 overflow-y-auto">
                          {drafts.map((d) => {
                            const isActive = d.id === activeDraftId;
                            const label = getTabLabel(d);
                            const subtitle =
                              d.formValues?.pickupAddress ||
                              d.formValues?.phone ||
                              (d.isNew ? 'New Draft Reservation' : 'Existing Trip Edit');
                            return (
                              <div
                                key={d.id}
                                onClick={() => {
                                  setActiveDraftId(d.id);
                                  setIsTabOverflowOpen(false);
                                }}
                                className={`flex items-center justify-between gap-2 p-3 rounded-2xl border cursor-pointer transition-colors ${
                                  isActive
                                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                                    : 'bg-slate-50 border-slate-200 text-slate-800 active:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                      isActive ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500'
                                    }`}
                                  >
                                    {d.isNew ? (
                                      <DocumentTextIcon className="w-4 h-4" />
                                    ) : (
                                      <PencilIcon className="w-4 h-4" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-extrabold text-xs flex items-center gap-1.5">
                                      <span className="truncate">{label}</span>
                                      {isActive && (
                                        <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">
                                          Active
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeDraft(d.id, e);
                                  }}
                                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 flex items-center justify-center shrink-0 cursor-pointer"
                                  aria-label={`Close ${label}`}
                                >
                                  <XIcon className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Persistent Draft / Edit Form Container */}
          <div className="flex-1 overflow-hidden relative">
            {drafts.map((d) => (
              <MemoizedDraftBookingPane
                key={d.id}
                draftId={d.id}
                isActive={d.id === activeDraftId}
                isNew={d.isNew}
                trip={d.trip}
                tripId={d.tripId}
                allTrips={trips}
                drivers={drivers}
                onValuesChangeByDraft={stableDraftValuesChange}
                onBookingSuccessByDraft={stableDraftBookingSuccess}
                onClearDraftById={stableClearDraftById}
                onCloneBooking={stableCloneBooking}
                onOpenLinkedTrip={stableOpenLinkedTrip}
              />
            ))}
          </div>
        </aside>

        {/* Resizer Handle (Left Sidebar — drag to resize, double-click to reset to 430px) */}
        <div
          onPointerDown={handleSidebarMouseDown}
          onDoubleClick={() => setSidebarWidth(430)}
          title="Drag to resize booking panel (double-click to reset)"
          className={`hidden lg:flex items-center justify-center w-2 h-full cursor-col-resize transition-colors z-30 shrink-0 select-none group ${
            activeResizeHandle === 'sidebar'
              ? 'bg-blue-500/30'
              : 'bg-slate-200/60 hover:bg-blue-500/20'
          }`}
        >
          <div
            className={`w-0.5 h-10 rounded-full transition-colors ${
              activeResizeHandle === 'sidebar'
                ? 'bg-blue-600'
                : 'bg-slate-300 group-hover:bg-blue-500'
            }`}
          />
        </div>

        {/* ─── B. CENTER COLUMN: MAP VIEW STAGE + BOTTOM DOCKED QUEUE ─── */}
        <div className={`flex-1 flex-col h-full overflow-hidden relative min-w-0 ${
          activeMobileTab === 'queue' || activeMobileTab === 'map' ? 'flex' : 'hidden lg:flex'
        }`}>
          <DispatchLiveMapPane
            activeMobileTab={activeMobileTab}
            drivers={drivers}
            trips={trips}
            activeFormValues={activeDraft?.formValues}
            activeTrip={activeDraft?.trip}
            selectedMapTrip={selectedMapTrip}
            shouldZoomMap={shouldZoomMap}
            focusedMapDriverId={focusedMapDriverId}
            activeResizeHandle={activeResizeHandle}
            onQueueMouseDown={handleQueueMouseDown}
            onResetQueueHeight={() => setQueueHeight(240)}
            onClearFocusedDriver={stableClearFocusedDriver}
            onAssignDriverToTrip={stableAssignDriverToTrip}
            onOpenDriverQueue={stableOpenDriverQueue}
            onCallDriver={stableCallDriverFromMap}
            onChangeDriverDutyStatus={stableChangeDriverDutyStatus}
            onSelectTrip={stableSelectMapTrip}
          />

          <DispatchTripQueuePane
            isDesktop={isDesktop}
            queueHeight={queueHeight}
            activeMobileTab={activeMobileTab}
            settings={settings}
            drivers={drivers}
            filteredTrips={filteredTrips}
            unconfirmedCount={unconfirmedCount}
            displayLayout={displayLayout}
            onDisplayLayoutChange={setDisplayLayout}
            isLayoutDropdownOpen={isLayoutDropdownOpen}
            onLayoutDropdownOpenChange={setIsLayoutDropdownOpen}
            layoutDropdownRef={layoutDropdownRef}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            isSearchExpanded={isSearchExpanded}
            onSearchExpandedChange={setIsSearchExpanded}
            searchInputRef={searchInputRef}
            dateTimeRange={dateTimeRange}
            isDatePickerOpen={isDatePickerOpen}
            onDatePickerOpenChange={setIsDatePickerOpen}
            datePickerTriggerRef={datePickerTriggerRef}
            dateRangeButtonLabel={getDateRangeButtonLabel()}
            onDateTimeRangeChange={(newRange) => {
              setDateTimeRange(newRange);
              setFilterStartDate(newRange.startDate);
              setFilterEndDate(newRange.endDate);
            }}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            isAddFilterOpen={isAddFilterOpen}
            onAddFilterOpenChange={setIsAddFilterOpen}
            isMobileFiltersOpen={isMobileFiltersOpen}
            onMobileFiltersOpenChange={setIsMobileFiltersOpen}
            addFilterRef={addFilterRef}
            activeFilterKeys={activeFilterKeys}
            onActiveFilterKeysChange={setActiveFilterKeys}
            selectedDriverFilter={selectedDriverFilter}
            onSelectedDriverFilterChange={setSelectedDriverFilter}
            selectedVehicleFilter={selectedVehicleFilter}
            onSelectedVehicleFilterChange={setSelectedVehicleFilter}
            selectedCompanyFilter={selectedCompanyFilter}
            onSelectedCompanyFilterChange={setSelectedCompanyFilter}
            selectedPaymentFilter={selectedPaymentFilter}
            onSelectedPaymentFilterChange={setSelectedPaymentFilter}
            selectedTariffFilter={selectedTariffFilter}
            onSelectedTariffFilterChange={setSelectedTariffFilter}
            selectedTripIds={selectedTripIds}
            onClearSelectedTripIds={() => setSelectedTripIds([])}
            allFilteredSelected={allFilteredSelected}
            someFilteredSelected={someFilteredSelected}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleSelectTrip={handleToggleSelectTrip}
            onBatchConfirmTrips={handleBatchConfirmTrips}
            onBatchAssignDriver={handleBatchAssignDriver}
            onBatchExportCsv={handleBatchExportCsv}
            onBatchCancelTrips={handleBatchCancelTrips}
            selectedQueueTripId={selectedQueueTripId}
            openTripActionId={openTripActionId}
            onOpenTripActionIdChange={setOpenTripActionId}
            mobileCardGestureMode={mobileCardGestureMode}
            onOpenMobileActionSheetTrip={setMobileActionSheetTrip}
            onOpenDriverPickerForTrip={(trip) => {
              setDriverPickerSearch('');
              setDriverPickerFilter('all');
              setDriverPickerTrip(trip);
            }}
            onSelectTripOnQueue={(trip, shouldZoom) => {
              setSelectedQueueTripId(trip.id);
              setSelectedMapTrip(trip);
              setShouldZoomMap(shouldZoom);
            }}
            onEditTripFromQueue={(trip) => {
              setSelectedQueueTripId(trip.id);
              setSelectedMapTrip(trip);
              setShouldZoomMap(true);
              handleOpenEditTrip(trip);
              setActiveMobileTab('booking');
            }}
            onFocusTripOnMapFromQueue={(trip) => {
              setSelectedQueueTripId(trip.id);
              setSelectedMapTrip(trip);
              setShouldZoomMap(true);
              setActiveMobileTab('map');
            }}
            onOpenReviewModal={handleOpenReviewModal}
            onOpenDriverModal={handleOpenDriverModal}
            onCloneBookingFromQueue={(trip) => {
              handleCloneBooking(trip);
              setActiveMobileTab('booking');
            }}
            onOpenCompleteTripModal={handleOpenCompleteTripModal}
            onPromptCancelTrip={handlePromptCancelTrip}
            onReactivateTrip={handleReactivateTrip}
            onQuickAssignDriver={handleQuickAssignDriver}
            onCallPassengerFromQueue={(phone, passengerFullName) => {
              handleStartCall(phone, passengerFullName);
              setCommsInitialTab('phone');
              setActiveDockTab('phone');
              setActiveMobileTab('phone');
            }}
            slaSummary={slaSummary}
            slaUrgentOnlyFilter={slaUrgentOnlyFilter}
            onToggleSlaUrgentOnlyFilter={() => setSlaUrgentOnlyFilter((prev) => !prev)}
            onStartAutoOffer={handleStartAutoOffer}
            onCancelAutoOffer={handleCancelAutoOffer}
          />
        </div>

        {/* ─── FULL-SCREEN MOBILE OPERATIONS TABS (lg:hidden) ─── */}
        {/* 1. Mobile Drivers Roster Page (Beautified Native Cards + Touch & Hold Actions) */}
        {activeMobileTab === 'drivers' && (
          <DispatchDriverRosterPane
            variant="mobile"
            drivers={drivers}
            isDesktop={isDesktop}
            driverFilter={driverFilter}
            onDriverFilterChange={setDriverFilter}
            driverSearch={driverSearch}
            onDriverSearchChange={setDriverSearch}
            onOpenDriverQueue={(driver) => setQueueDriver(driver)}
            onOpenMobileActionSheetDriver={setMobileActionSheetDriver}
            onFocusMapDriver={setFocusedMapDriverId}
            onCallDriver={(phone, name) => {
              setActiveMobileTab('phone');
              handleStartCall(phone, name);
            }}
            onChangeDriverDutyStatus={setDriverDutyStatus}
            onShowToast={showDispatchToast}
          />
        )}

        {/* 2. Mobile Comms Hub Page (Omnichannel View: All / Calls / SMS / Voicemail) */}
        {!isDesktop && (activeMobileTab === 'comms' || activeMobileTab === 'messages' || activeMobileTab === 'phone') && (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white lg:hidden">
            <CommsHub
              user={user}
              drivers={drivers}
              trips={trips}
              onTabChange={(tab) => setCommsActiveTab(tab)}
              initialTab={activeMobileTab === 'phone' ? 'phone' : activeMobileTab === 'messages' ? 'messages' : 'all'}
              onOpenEditTrip={(tripId) => {
                const found = trips.find((t) => t.id === tripId);
                if (found) {
                  setSelectedQueueTripId(found.id);
                  setSelectedMapTrip(found);
                  setShouldZoomMap(true);
                  handleOpenEditTrip(found);
                  setActiveMobileTab('booking');
                }
              }}
              onPopulateBooking={(payload) => {
                setActiveMobileTab('booking');
                setDrafts((prev) => {
                  const target = prev.find((d) => d.id === activeDraftId) || prev[0];
                  if (!target) return prev;
                  const currentForm = target.formValues || ({} as any);
                  const updatedForm: DispatchFormValues = {
                    ...currentForm,
                    passengerName: payload.passengerName || currentForm.passengerName || '',
                    phone: payload.passengerPhone || payload.phone || currentForm.phone || '',
                    email: payload.passengerEmail || payload.email || currentForm.email || '',
                    pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
                    dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
                    vehicle: (payload.vehicleTier || payload.vehicle || currentForm.vehicle || 'any') as any,
                    selectedVehicles: payload.vehicleTier ? [payload.vehicleTier as any] : (currentForm.selectedVehicles || ['any']),
                    corporateDetails: {
                      ...currentForm.corporateDetails,
                      corporateAccount: payload.corporateAccount || payload.corporateAccountName || payload.accountNumber || currentForm.corporateDetails?.corporateAccount || '',
                      billingPo: payload.billingPo || payload.poNumber || currentForm.corporateDetails?.billingPo || '',
                      authorizedBy: currentForm.corporateDetails?.authorizedBy || '',
                      invoicingTerms: currentForm.corporateDetails?.invoicingTerms || 'Net 30 Direct Bill',
                    },
                    paymentMethod: (payload.corporateAccount || payload.corporateAccountName || payload.accountNumber) ? 'account' : (currentForm.paymentMethod || 'cash'),
                    internalNotes: payload.notes
                      ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
                      : currentForm.internalNotes,
                  };
                  return prev.map((item) => (item.id === target.id ? { ...item, formValues: updatedForm } : item));
                });
              }}
              onPopOut={() => getWorkspaceBus().popOutModule('comms')}
            />
          </div>
        )}

        {/* 3. Mobile Email Console Page (Accessible from slide-out drawer) */}
        {!isDesktop && activeMobileTab === 'email' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white lg:hidden">
            <EmailDock
              isDocked={true}
              trips={trips}
              onOpenEditTrip={stableCommsOpenEditTrip}
              onClose={() => setActiveMobileTab('queue')}
              onPopOut={() => getWorkspaceBus().popOutModule('email')}
              showWindowControls={false}
              onPopulateBooking={() => {
                setActiveMobileTab('booking');
                showDispatchToast('Booking form populated from email!', 'success');
              }}
            />
          </div>
        )}

        {/* ─── C. RIGHT DOCKED OPERATIONAL DRAWER (SINGLE CLEAN HEADER — NO DOUBLE NAV BAR!) ─── */}
        <aside
          className={`relative bg-white border-l border-slate-200 flex-col shrink-0 h-full overflow-hidden z-20 shadow-xl ${
            activeDockTab !== 'none' ? 'hidden lg:flex' : 'hidden'
          }`}
          style={{ width: `${operationsWidth}px` }}
        >
            {/* Horizontal Resize Drag Handle on Left Edge (drag to resize, double-click to reset to 400px) */}
            <div
              onPointerDown={handleOperationsMouseDown}
              onDoubleClick={() => setOperationsWidth(400)}
              className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize transition-colors z-30 group select-none flex items-center justify-center ${
                activeResizeHandle === 'operations'
                  ? 'bg-blue-500/30'
                  : 'hover:bg-blue-500/20'
              }`}
              title="Drag to resize side drawer width (double-click to reset)"
            >
              <div
                className={`w-0.5 h-10 rounded-full transition-colors ${
                  activeResizeHandle === 'operations'
                    ? 'bg-blue-600'
                    : 'bg-slate-300/80 group-hover:bg-blue-500'
                }`}
              />
            </div>

            {/* Clean Single-Row Drawer Title Bar (Workspace switching lives solely in Top Header) */}
            <div className="h-10 px-3 pl-4 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between shrink-0 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {(activeDockTab === 'phone' || activeDockTab === 'comms') && (
                  <>
                    <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0">
                      <PhoneIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-extrabold text-slate-900 tracking-tight truncate">Phone &amp; SMS</span>
                    {activeCallStatus !== 'idle' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        Live Call
                      </span>
                    )}
                  </>
                )}
                {activeDockTab === 'email' && (
                  <>
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-600 flex items-center justify-center shrink-0">
                      <MailIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-extrabold text-slate-900 tracking-tight truncate">Email Inbox</span>
                    {unreadEmailCount > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                        {unreadEmailCount}
                      </span>
                    )}
                  </>
                )}
                {activeDockTab === 'drivers' && (
                  <>
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shrink-0">
                      <CarIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-extrabold text-slate-900 tracking-tight truncate">Live Fleet</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {drivers.filter((d) => d.mapStatus === 'available').length} avail
                    </span>
                  </>
                )}
                {activeDockTab === 'alerts' && (
                  <>
                    <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
                      <BellIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-extrabold text-slate-900 tracking-tight truncate">Fleet Alerts</span>
                  </>
                )}
              </div>

              {/* Minimal Utility Actions: Pop-out & Close */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeDockTab === 'phone' || activeDockTab === 'comms') getWorkspaceBus().popOutModule('comms');
                    else if (activeDockTab === 'email') getWorkspaceBus().popOutModule('email');
                    else if (activeDockTab === 'drivers') getWorkspaceBus().popOutModule('drivers');
                    else getWorkspaceBus().popOutModule('trips');
                  }}
                  title="Pop out into separate window"
                  className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDockTab('none')}
                  className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Close drawer (Esc)"
                  aria-label="Close drawer"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Active Panel Viewport: Occupies Full Height */}
            <div ref={operationsContainerRef} className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white">
              {/* 1. PHONE / COMMUNICATIONS HUB (Persistently mounted on desktop so WebRTC softphone stays online) */}
              <div className={`flex-1 flex-col h-full overflow-hidden ${
                activeDockTab === 'phone' || activeDockTab === 'comms' ? 'flex' : 'hidden'
              }`}>
                <CommsHub
                  user={user}
                  drivers={drivers}
                  trips={trips}
                  initialTab={commsInitialTab}
                  onTabChange={stableCommsTabChange}
                  isPopout={false}
                  isVisible={activeDockTab === 'phone' || activeDockTab === 'comms'}
                  onPopOut={stableCommsPopOut}
                  onClose={stableCommsClose}
                  onOpenEditTrip={stableCommsOpenEditTrip}
                  onPopulateBooking={stableCommsPopulateBooking}
                />
              </div>

              {/* 2. EMAIL DOCK CONSOLE (isDocked hides redundant dark header bar) */}
              {activeDockTab === 'email' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <EmailDock
                    isDocked={true}
                    trips={trips}
                    onOpenEditTrip={stableCommsOpenEditTrip}
                    onClose={() => setActiveDockTab('none')}
                    onPopOut={() => getWorkspaceBus().popOutModule('email')}
                    showWindowControls={false}
                    onPopulateBooking={() => {
                      // EmailDock publishes POPULATE_BOOKING directly to DispatchBookingEngine via WorkspaceBus
                      setActiveMobileTab('booking');
                      showDispatchToast('Booking form populated from email!', 'success');
                    }}
                  />
                </div>
              )}

              {/* 3. DRIVERS ROSTER (Clean, Scannable Live Fleet Cards + Search + Option C Status Filter) */}
              {activeDockTab === 'drivers' && (
                <DispatchDriverRosterPane
                  variant="dock"
                  drivers={drivers}
                  isDesktop={isDesktop}
                  driverFilter={driverFilter}
                  onDriverFilterChange={setDriverFilter}
                  driverSearch={driverSearch}
                  onDriverSearchChange={setDriverSearch}
                  onOpenDriverQueue={(driver) => setQueueDriver(driver)}
                  onOpenMobileActionSheetDriver={setMobileActionSheetDriver}
                  onFocusMapDriver={setFocusedMapDriverId}
                  onCallDriver={(phone, name) => {
                    setCommsInitialTab('phone');
                    setActiveDockTab('phone');
                    handleStartCall(phone, name);
                  }}
                  onChangeDriverDutyStatus={setDriverDutyStatus}
                  onShowToast={showDispatchToast}
                />
              )}

              {/* 3. FLEET ALERTS & BROADCASTS */}
              {activeDockTab === 'alerts' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Space-Saving Tactical Presets Dropdown */}
                  <div className="p-2.5 bg-slate-50 border-b border-slate-200 space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide inline-flex items-center gap-1">
                        <BoltIcon className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>Tactical Broadcast Presets</span>
                      </span>
                      {user?.role === 'admin' && !isAddingPreset && (
                        <button
                          type="button"
                          onClick={() => setIsAddingPreset(true)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                        >
                          + Add Preset
                        </button>
                      )}
                    </div>

                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        if (val === '__add_custom__') {
                          setIsAddingPreset(true);
                        } else {
                          setMsgText(val);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 font-medium focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Select a tactical preset to insert...</option>
                      {tacticalPresets.map((preset, i) => (
                        <option key={i} value={preset}>
                          {preset}
                        </option>
                      ))}
                      {user?.role === 'admin' && (
                        <option value="__add_custom__">+ Create New Preset (Admin)...</option>
                      )}
                    </select>

                    {isAddingPreset && (
                      <div className="flex items-center gap-1.5 mt-1.5 p-1.5 bg-blue-50 border border-blue-200 rounded-xl">
                        <input
                          type="text"
                          placeholder="Enter new preset message..."
                          value={newPresetText}
                          onChange={(e) => setNewPresetText(e.target.value)}
                          className="flex-1 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveNewPreset();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleSaveNewPreset}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingPreset(false);
                            setNewPresetText('');
                          }}
                          className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-xs rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Compose Alert Form */}
                  <form onSubmit={handleSendMessage} className="p-3 bg-white border-b border-slate-200 space-y-2 shrink-0">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase">Send To</span>
                        <select
                          value={msgRecipient}
                          onChange={(e) => setMsgRecipient(e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 cursor-pointer"
                        >
                          <option value="All Drivers">All Drivers</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.name}>
                              {d.formattedLabel || formatDriverAssignmentLabel(d)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase">Priority</span>
                        <select
                          value={msgPriority}
                          onChange={(e) => setMsgPriority(e.target.value as any)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 cursor-pointer"
                        >
                          <option value="normal">Normal</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Type dispatch broadcast or alert..."
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors shrink-0 cursor-pointer"
                      >
                        Broadcast
                      </button>
                    </div>
                  </form>

                  {/* Filter & Retention Toolbar */}
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 text-xs">
                    <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setAlertsFilter('all')}
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                          alertsFilter === 'all'
                            ? 'bg-white text-blue-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All ({activeAndSortedMessages.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAlertsFilter('unread')}
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                          alertsFilter === 'unread'
                            ? 'bg-white text-blue-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Unread ({unreadAlertsCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAlertsFilter('pinned')}
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                          alertsFilter === 'pinned'
                            ? 'bg-white text-blue-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <FlagIcon className="w-3 h-3 shrink-0" />
                          <span>Pinned ({pinnedAlertsCount})</span>
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                        <ClockIcon className="w-3 h-3 shrink-0" />
                        <span>Retention:</span>
                      </span>
                      <select
                        value={alertDismissMinutes}
                        onChange={(e) => handleUpdateAlertDismissMinutes(parseInt(e.target.value, 10))}
                        className="font-bold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer shadow-2xs focus:outline-hidden"
                        title="Admin-configured alert auto-dismiss window"
                      >
                        <option value={15}>15m</option>
                        <option value={30}>30m</option>
                        <option value={60}>1h (Default)</option>
                        <option value={120}>2h</option>
                        <option value={240}>4h</option>
                        <option value={720}>12h</option>
                        <option value={1440}>24h</option>
                        <option value={0}>Never</option>
                      </select>
                    </div>
                  </div>

                  {/* Secondary Toolbar: Bulk Actions */}
                  <div className="px-3 py-1 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-[10px] text-slate-600 shrink-0">
                    <span>
                      Showing {alertsFilter === 'all' ? 'all' : alertsFilter} alerts ({
                        activeAndSortedMessages.filter((m) => {
                          if (alertsFilter === 'unread') return !m.isRead;
                          if (alertsFilter === 'pinned') return m.isPinned;
                          return true;
                        }).length
                      })
                    </span>
                    <div className="flex items-center gap-2">
                      {unreadAlertsCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllAlertsRead}
                          className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                      {activeAndSortedMessages.some((m) => !m.isPinned) && (
                        <button
                          type="button"
                          onClick={handleClearUnpinnedAlerts}
                          className="text-slate-500 hover:text-rose-600 font-bold hover:underline cursor-pointer"
                        >
                          Clear unpinned
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message History List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
                    {activeAndSortedMessages
                      .filter((m) => {
                        if (alertsFilter === 'unread') return !m.isRead;
                        if (alertsFilter === 'pinned') return m.isPinned;
                        return true;
                      })
                      .length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <BellIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs font-semibold">
                          {alertsFilter === 'unread'
                            ? 'No unread alerts'
                            : alertsFilter === 'pinned'
                            ? 'No pinned alerts'
                            : 'No active alerts'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Non-pinned alerts auto-dismiss after {alertDismissMinutes === 0 ? 'infinite' : `${alertDismissMinutes}m`}.
                        </p>
                      </div>
                    ) : (
                      activeAndSortedMessages
                        .filter((m) => {
                          if (alertsFilter === 'unread') return !m.isRead;
                          if (alertsFilter === 'pinned') return m.isPinned;
                          return true;
                        })
                        .map((m) => (
                          <FleetAlertCard
                            key={m.id}
                            message={m}
                            onTogglePin={handleTogglePinAlert}
                            onToggleRead={handleToggleReadAlert}
                            onDismiss={handleDismissAlert}
                          />
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
      </div>

      {/* Trip Details, Unconfirmed Review, Fare Override, Audit Trail & Complete Trip Modals */}
      <DispatchTripDetailsDrawer
        isDesktop={isDesktop}
        user={user}
        settings={settings}
        trips={trips}
        onTripsChange={setTrips}
        drivers={drivers}
        reviewTrip={reviewTrip}
        reviewOpenSeq={reviewOpenSeq}
        reviewModalTab={reviewModalTab}
        onReviewModalTabChange={setReviewModalTab}
        onReviewTripChange={setReviewTrip}
        onOpenReviewModal={handleOpenReviewModal}
        auditTrailTrip={auditTrailTrip}
        onCloseAuditTrailTrip={() => setAuditTrailTrip(null)}
        driverModalTrip={driverModalTrip}
        driverModalOpenSeq={driverModalOpenSeq}
        onCloseDriverModal={() => setDriverModalTrip(null)}
        completeTripTarget={completeTripTarget}
        completeModalOpenSeq={completeModalOpenSeq}
        onOpenCompleteTripModal={handleOpenCompleteTripModal}
        onCloseCompleteTripModal={() => setCompleteTripTarget(null)}
        onQuickAssignDriver={handleQuickAssignDriver}
        onStartAutoOffer={handleStartAutoOffer}
        onCancelAutoOffer={handleCancelAutoOffer}
        onPromptCancelTrip={handlePromptCancelTrip}
        onReactivateTrip={handleReactivateTrip}
        onCloneBookingFromReview={(trip) => {
          handleCloneBooking(trip);
          setActiveMobileTab('booking');
        }}
        onEditTripFromReview={(trip) => {
          setSelectedQueueTripId(trip.id);
          setSelectedMapTrip(trip);
          setShouldZoomMap(true);
          handleOpenEditTrip(trip);
          setActiveMobileTab('booking');
        }}
        onShowToast={showDispatchToast}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        confirmText={confirmModalConfig.confirmText}
        cancelText={confirmModalConfig.cancelText || 'Cancel'}
        confirmVariant={confirmModalConfig.confirmVariant || 'primary'}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Universal Modeless Driver Queue Window */}
      {queueDriver && (
        <DriverQueueWindow
          driver={queueDriver}
          isOpen={Boolean(queueDriver)}
          onClose={() => setQueueDriver(null)}
          trips={trips}
          onReorderQueue={handleReorderDriverQueue}
          onUnassignTrip={async (tripId) => {
            await handleQuickAssignDriver(tripId, 'unassigned');
          }}
          onOpenEditTrip={(tripId) => {
            const found = trips.find((t) => t.id === tripId);
            if (found) {
              handleOpenEditTrip(found);
              setActiveMobileTab('booking');
            }
          }}
          onFocusTripOnMap={(tripId) => {
            const found = trips.find((t) => t.id === tripId);
            if (found) {
              setSelectedMapTrip(found);
              setSelectedQueueTripId(found.id);
              setShouldZoomMap(true);
            }
          }}
          onCallPassenger={(phone, name) => {
            handleStartCall(phone, name);
            setActiveDockTab('phone');
          }}
          onAssignActiveDraft={(driver) => {
            handleAssignDriverToDraft(driver);
          }}
        />
      )}


      {/* ─────────────────────────────────────────────────────────────
          MOBILE BOTTOM DOCK NAVIGATION (lg:hidden) - 5 CONSOLIDATED TABS
          Tabs: Trips, Booking, Comms (Omnichannel Hub), Drivers, Map
      ───────────────────────────────────────────────────────────── */}
      <nav
        aria-label="Mobile Dispatch Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1 py-1 flex items-center justify-around select-none print:hidden"
      >
        {/* Tab 1: Trips */}
        <button
          type="button"
          onClick={() => setActiveMobileTab('queue')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'queue'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors relative ${activeMobileTab === 'queue' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <CarIcon className="w-5 h-5" />
            {unconfirmedCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center animate-pulse">
                {unconfirmedCount}
              </span>
            ) : filteredTrips.length > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-slate-200 text-slate-800 text-[9px] font-bold flex items-center justify-center">
                {filteredTrips.length}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Trips</span>
        </button>

        {/* Tab 2: Booking */}
        <button
          type="button"
          onClick={() => setActiveMobileTab('booking')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'booking'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors relative ${activeMobileTab === 'booking' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <DocumentTextIcon className="w-5 h-5" />
            {drafts.length > 0 && (
              <span
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center ${
                  hasUnsavedDraftWork ? 'bg-amber-500 ring-2 ring-white' : 'bg-blue-600'
                }`}
                title={hasUnsavedDraftWork ? 'Unsaved draft in progress' : `${drafts.length} open tab(s)`}
              >
                {drafts.length}
              </span>
            )}
            {hasUnsavedDraftWork && activeMobileTab !== 'booking' && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white animate-pulse"
                aria-label="Unsaved booking draft in progress"
              />
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Booking</span>
        </button>

        {/* Tab 3: Comms (Omnichannel All / Phone / Messages / Voicemail) */}
        <button
          type="button"
          onClick={() => setActiveMobileTab('comms')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'comms' || activeMobileTab === 'messages' || activeMobileTab === 'phone'
              ? 'text-emerald-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors relative ${
            activeMobileTab === 'comms' || activeMobileTab === 'messages' || activeMobileTab === 'phone'
              ? 'bg-emerald-50 text-emerald-600'
              : ''
          }`}>
            <PhoneIcon className="w-5 h-5" />
            {activeCallStatus !== 'idle' ? (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            ) : unreadMessagesCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                {unreadMessagesCount}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Comms</span>
        </button>

        {/* Tab 4: Drivers */}
        <button
          type="button"
          onClick={() => setActiveMobileTab('drivers')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'drivers'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors relative ${activeMobileTab === 'drivers' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <UsersIcon className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold flex items-center justify-center">
              {drivers.filter((d) => d.mapStatus === 'available').length}
            </span>
          </div>
          <span className="text-[10px] tracking-tight leading-none">Drivers</span>
        </button>

        {/* Tab 5: Map */}
        <button
          type="button"
          onClick={() => setActiveMobileTab('map')}
          className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeMobileTab === 'map'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${activeMobileTab === 'map' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <MapIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight leading-none">Map</span>
        </button>
      </nav>

      {/* Batch Assign & Mobile Trip Quick-Action Sheets */}
      <DispatchTripQueueSheets
        trips={trips}
        drivers={drivers}
        isBatchAssignOpen={isBatchAssignOpen}
        onCloseBatchAssign={() => setIsBatchAssignOpen(false)}
        selectedTripIdsCount={selectedTripIds.length}
        batchAssignDriverId={batchAssignDriverId}
        onBatchAssignDriverIdChange={setBatchAssignDriverId}
        onConfirmBatchAssign={handleConfirmBatchAssign}
        mobileActionSheetTrip={mobileActionSheetTrip}
        onCloseMobileActionSheetTrip={() => setMobileActionSheetTrip(null)}
        onSendReceiptForTrip={(sheetTrip) => {
          sendDispatchContextualTripEmail({
            targetTrip: sheetTrip,
            drivers,
            settings,
            onToast: showDispatchToast,
          });
        }}
        onReactivateTrip={handleReactivateTrip}
        onOpenDriverPickerForTrip={(sheetTrip) => {
          setDriverPickerSearch('');
          setDriverPickerFilter('all');
          setDriverPickerTrip(sheetTrip);
        }}
        onEditTripFromQueue={(sheetTrip) => {
          setSelectedQueueTripId(sheetTrip.id);
          setSelectedMapTrip(sheetTrip);
          setShouldZoomMap(true);
          handleOpenEditTrip(sheetTrip);
          setActiveMobileTab('booking');
        }}
        onCloneBookingFromQueue={(sheetTrip) => {
          handleCloneBooking(sheetTrip);
          setActiveMobileTab('booking');
        }}
        onOpenCompleteTripModal={handleOpenCompleteTripModal}
        onOpenReviewModal={handleOpenReviewModal}
        onCallPassengerFromQueue={(phone, passengerFullName) => {
          handleStartCall(phone, passengerFullName);
          setCommsInitialTab('phone');
          setActiveDockTab('phone');
          setActiveMobileTab('phone');
        }}
        onOpenDriverModal={handleOpenDriverModal}
        onFocusTripOnMapFromQueue={(sheetTrip) => {
          setSelectedQueueTripId(sheetTrip.id);
          setSelectedMapTrip(sheetTrip);
          setShouldZoomMap(true);
          setActiveMobileTab('map');
        }}
        onAddTripToMultiSelect={(tripId) => {
          setSelectedTripIds((prev) => (prev.includes(tripId) ? prev : [...prev, tripId]));
        }}
        onPromptCancelTrip={handlePromptCancelTrip}
        onStartAutoOffer={handleStartAutoOffer}
        onCancelAutoOffer={handleCancelAutoOffer}
        sheetStyle={dispatchSheetDrag.sheetStyle}
        dragHandlers={dispatchSheetDrag.dragHandlers}
      />

      {/* Mobile Driver Picker & Driver Quick-Action Sheets */}
      <DispatchDriverSheets
        trips={trips}
        drivers={drivers}
        driverPickerTrip={driverPickerTrip}
        onCloseDriverPicker={() => setDriverPickerTrip(null)}
        driverPickerSearch={driverPickerSearch}
        onDriverPickerSearchChange={setDriverPickerSearch}
        driverPickerFilter={driverPickerFilter}
        onDriverPickerFilterChange={setDriverPickerFilter}
        onQuickAssignDriver={handleQuickAssignDriver}
        mobileActionSheetDriver={mobileActionSheetDriver}
        onCloseMobileActionSheetDriver={() => setMobileActionSheetDriver(null)}
        onChangeDriverDutyStatus={setDriverDutyStatus}
        onOpenDriverQueue={(driver) => setQueueDriver(driver)}
        onLocateDriverOnMobileMap={(driverId) => {
          setFocusedMapDriverId(driverId);
          setActiveMobileTab('map');
        }}
        onCallDriverOnMobile={(phone, name) => {
          setActiveMobileTab('phone');
          handleStartCall(phone, name);
        }}
        onAssignDriverToActiveDraftOnMobile={(driver) => {
          handleAssignDriverToDraft(driver);
          setActiveMobileTab('booking');
        }}
        onShowToast={showDispatchToast}
        sheetStyle={dispatchSheetDrag.sheetStyle}
        dragHandlers={dispatchSheetDrag.dragHandlers}
      />

      {/* ─── Non-Blocking Dispatch Toast Notification ─── */}
      {dispatchToast && (
        <div className="fixed bottom-16 lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[130] sm:max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div
            className={`px-3.5 py-2.5 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 ${
              dispatchToast.type === 'success'
                ? 'bg-emerald-900 text-emerald-50 border-emerald-700'
                : dispatchToast.type === 'error'
                ? 'bg-rose-900 text-rose-50 border-rose-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {dispatchToast.type === 'success' ? (
              <CheckIcon className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : dispatchToast.type === 'error' ? (
              <AlertTriangleIcon className="w-4 h-4 text-rose-300 shrink-0" />
            ) : (
              <InfoIcon className="w-4 h-4 text-blue-300 shrink-0" />
            )}
            <span className="flex-1 min-w-0 break-words">{dispatchToast.text}</span>
            <button
              type="button"
              onClick={() => setDispatchToast(null)}
              className="text-white/70 hover:text-white cursor-pointer shrink-0 p-0.5"
              aria-label="Dismiss notification"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
