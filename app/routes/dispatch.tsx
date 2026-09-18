import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { getBookingService } from '../core/services/booking';
import { isFirebaseConfigured } from '../core/services/firebase';
import type { AppSettings, NamedPricingRule } from '../core/types/config';
import type { Trip, TripStatus, TripAuditEvent } from '../core/types/trip';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { getPricingRulesService } from '../core/services/pricing';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { DispatchBookingEngine, type DispatchFormValues } from '../components/domain/dispatch/DispatchBookingEngine';
import { CustomDateTimePicker, type DateTimeRange } from '../components/domain/dispatch/CustomDateTimePicker';
import { UserDropdown } from '../components/domain/common/UserDropdown';
import { loadGoogleMaps, CHESTERFIELD_CENTER } from '../core/services/maps/google-maps-loader';
import { hasValidRoutePair } from '../core/hooks/useDebounceRoute';
import { resolveMockCoordinates } from '../core/services/maps/mock-routing';
import {
  SpinnerIcon,
  RadioIcon,
  CarIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  MenuIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  TableCellsIcon,
  Squares2X2Icon,
  ListBulletIcon,
  DocumentTextIcon,
  MapIcon,
  ChatBubbleLeftRightIcon,
  BoltIcon,
  CalendarIcon,
  ChevronDownIcon,
  XIcon,
  UsersIcon,
  BellIcon,
  ExternalLinkIcon,
  PencilIcon,
  ShieldCheckIcon,
  PlusIcon,
} from '../components/ui/Icons';
import { Badge } from '../components/ui/Badge';
import { getEmailDispatchService } from '../core/services/email/resend-email.service';
import { getTelephonyService, sanitizePhoneNumber } from '../core/services/telephony.service';
import { TripAuditModal } from '../components/domain/admin/TripAuditModal';
import { useDisplayLayout } from '../core/hooks/useDisplayLayout';
import { LayoutToggle } from '../components/ui/LayoutToggle';
import { RoleViewSwitcher } from '../components/domain/common/RoleViewSwitcher';
import { CommsHub } from '../components/domain/dispatch/CommsHub';
import { EmailDock } from '../components/domain/dispatch/EmailDock';
import { AppSuiteLauncher } from '../components/domain/dispatch/AppSuiteLauncher';
import { DispatchHeaderCallHud } from '../components/domain/dispatch/DispatchHeaderCallHud';
import { FleetAlertCard, type DispatchMessageItem } from '../components/domain/dispatch/FleetAlertCard';
import { getWorkspaceBus } from '../core/services/workspace-bus.service';
import { soundNotificationService } from '../core/services/sound-notification.service';

export function meta() {
  return [
    { title: 'Dispatch Console – Chesterfield Taxi' },
    { name: 'description', content: 'Tactical split-screen dispatch dashboard' },
  ];
}

interface DraftTab {
  id: string;
  isNew: boolean;
  trip?: Trip;
  formValues?: DispatchFormValues;
}

interface DriverRosterItem {
  id: string;
  name: string;
  status: 'available' | 'on_trip' | 'offline';
  vehicle: string;
  tier: string;
  phone: string;
  zone: string;
  currentTripId?: string;
  driverScore?: number;
  isBlacklisted?: boolean;
}

const INITIAL_DRIVERS: DriverRosterItem[] = [
  {
    id: 'drv-101',
    name: 'Driver 101 (Mike T.)',
    status: 'available',
    vehicle: 'Toyota Camry (#204)',
    tier: 'Sedan',
    phone: '(314) 555-0101',
    zone: 'Chesterfield Valley',
    driverScore: 98,
  },
  {
    id: 'drv-104',
    name: 'Driver 104 (Sarah K.)',
    status: 'on_trip',
    vehicle: 'Chevy Suburban (#301)',
    tier: 'SUV',
    phone: '(314) 555-0104',
    zone: 'Lambert Airport (STL)',
    currentTripId: 'tr-8831',
    driverScore: 95,
  },
  {
    id: 'drv-108',
    name: 'Driver 108 (David R.)',
    status: 'available',
    vehicle: 'Ford Transit (#102)',
    tier: 'Van',
    phone: '(314) 555-0108',
    zone: 'Town and Country',
    driverScore: 91,
  },
  {
    id: 'drv-112',
    name: 'Driver 112 (James W.)',
    status: 'available',
    vehicle: 'Lincoln Continental (#208)',
    tier: 'Sedan',
    phone: '(314) 555-0112',
    zone: 'Ballwin / Manchester',
    driverScore: 88,
  },
  {
    id: 'drv-115',
    name: 'Driver 115 (Alex M.)',
    status: 'offline',
    vehicle: 'Toyota Sienna (#105)',
    tier: 'Van',
    phone: '(314) 555-0115',
    zone: 'Off Duty',
    driverScore: 74,
  },
];

interface TripActionDropdownProps {
  trip: Trip;
  isUnconfirmed: boolean;
  isOpen: boolean;
  isDesktop?: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReview: () => void;
  onEdit: () => void;
  onFare: () => void;
  onAudit: () => void;
  onClone: () => void;
  onFocusMap: () => void;
  onCancelTrip?: () => void;
  onReactivateTrip?: () => void;
}

function TripActionDropdown({
  trip,
  isUnconfirmed,
  isOpen,
  isDesktop = true,
  onToggle,
  onClose,
  onReview,
  onEdit,
  onFare,
  onAudit,
  onClone,
  onFocusMap,
  onCancelTrip,
  onReactivateTrip,
}: TripActionDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuWidth = 208; // width in px
    // Use measured height if mounted, otherwise estimate based on items
    const menuHeight = menuEl?.offsetHeight || (isUnconfirmed ? 200 : 165);
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Overlay directly below if there is enough space, otherwise overlay directly above
    const openUpward = spaceBelow < (menuHeight + 8) && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(viewportHeight - menuHeight - 8, rect.bottom + 4);

    // Align dropdown right edge with the trigger button right edge
    let left = rect.right - menuWidth;
    if (left < 8) {
      left = Math.max(8, rect.left);
    }
    if (left + menuWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - menuWidth - 8);
    }

    return { top, left, openUpward };
  }, [isUnconfirmed]);

  // Synchronously compute trigger coordinates before browser paint to prevent flying from (0,0)
  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    const initial = calculatePosition();
    if (initial) {
      setCoords(initial);
    }
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const updated = calculatePosition();
      if (updated) setCoords(updated);
    };

    // Re-measure on next animation frame after portal mounts to ensure exact DOM height
    const rafId = requestAnimationFrame(updatePosition);

    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(event.target as Node) &&
        menuRef.current && !menuRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, calculatePosition]);

  const isCompleted = trip.status === 'completed';
  const isCancelled = trip.status === 'cancelled';

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`px-2.5 py-1 rounded-lg border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-300'
        }`}
        title="Trip Actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>Actions</span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-600' : 'text-slate-500'
          }`}
        />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: '208px',
            zIndex: 99999,
            transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
          }}
          className="bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/60 rounded-t-xl">
            <span className="font-mono text-slate-600">Trip #{trip.id.slice(0, 8)}</span>
            <span className={`capitalize px-1.5 py-0.2 rounded-md font-bold text-[10px] ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-800'
                : isCancelled
                ? 'bg-rose-100 text-rose-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {trip.status}
            </span>
          </div>

          <div className="py-1">
            {/* On mobile: include Edit and Focus Map */}
            {!isDesktop && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  <PencilIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Edit Trip</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFocusMap();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50/80 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  <MapPinIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>View on Map</span>
                </button>
              </>
            )}

            {isUnconfirmed && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReview();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-50/70 hover:bg-amber-100/80 transition-colors cursor-pointer"
              >
                <DocumentTextIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Review Booking</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onFare();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/80 hover:text-amber-700 transition-colors cursor-pointer"
            >
              <BoltIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Fare &amp; Rules</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onClone();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-cyan-50/80 hover:text-cyan-700 transition-colors cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
              <span>Copy Booking</span>
            </button>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onAudit();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-purple-50/80 hover:text-purple-700 transition-colors cursor-pointer"
            >
              <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Audit Trail Log</span>
            </button>
          </div>

          {!isCompleted && (
            <div className="py-1">
              {isCancelled ? (
                onReactivateTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onReactivateTrip();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                  >
                    <span>🔄</span>
                    <span>Reactivate Trip</span>
                  </button>
                )
              ) : (
                onCancelTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCancelTrip();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <span>✕</span>
                    <span>Cancel Trip</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export type DesktopDockTab = 'none' | 'phone' | 'email' | 'drivers' | 'comms' | 'alerts';

export default function DispatchRoute() {
  const navigate = useNavigate();

  // Auth & Settings state
  const [user, setUser] = useState<AdminUser | null>(() => getAdminAuthService().getCurrentUser());
  const [isAuthChecking, setIsAuthChecking] = useState(() => !getAdminAuthService().getCurrentUser());
  const [settings, setSettings] = useState<AppSettings>(() => getAdminConfigService().getCachedSettings());

  // Trips real-time state
  const [trips, setTrips] = useState<Trip[]>([]);
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
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(2);
  const [missedCallsCount, setMissedCallsCount] = useState<number>(1);

  // Dispatcher Review Modal State for UNCONFIRMED web bookings
  const [reviewTrip, setReviewTrip] = useState<Trip | null>(null);
  const [reviewDeclineMode, setReviewDeclineMode] = useState<boolean>(false);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState<string>('No driver availability');
  const [reviewCustomNotes, setReviewCustomNotes] = useState<string>('');
  const [isProcessingReview, setIsProcessingReview] = useState<boolean>(false);
  const [reviewAlert, setReviewAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
  type FilterType = 'driver' | 'vehicle' | 'company' | 'payment_type' | 'tariff' | 'has_car_seat';
  const [isAddFilterOpen, setIsAddFilterOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const addFilterRef = useRef<HTMLDivElement>(null);
  const [activeFilterKeys, setActiveFilterKeys] = useState<FilterType[]>([]);
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

  // Draft Tabs state
  const maxDrafts = COMPANY_CONFIG.maxDispatchDrafts || 10;
  const [drafts, setDrafts] = useState<DraftTab[]>([
    { id: 'new-1', isNew: true },
  ]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState(2);
  const [isTabOverflowOpen, setIsTabOverflowOpen] = useState(false);
  const tabOverflowRef = useRef<HTMLDivElement>(null);

  // Operational Right Dock Tools (Unified Dock: Main / Phone / Email / Drivers)
  const [activeDockTab, setActiveDockTab] = useState<DesktopDockTab>('none');
  const [commsInitialTab, setCommsInitialTab] = useState<'all' | 'phone' | 'messages' | 'voicemail'>('all');
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

  // Drivers Data State
  const [drivers, setDrivers] = useState<DriverRosterItem[]>(INITIAL_DRIVERS);
  const [driverFilter, setDriverFilter] = useState<'all' | 'available' | 'on_trip' | 'offline'>('all');
  const [driverSearch, setDriverSearch] = useState('');

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

  // Driver Fare Console Modal State
  const [driverModalTrip, setDriverModalTrip] = useState<Trip | null>(null);
  const [driverPermittedRules, setDriverPermittedRules] = useState<NamedPricingRule[]>([]);
  const [selectedDriverRuleId, setSelectedDriverRuleId] = useState<string>('');
  const [driverManualFare, setDriverManualFare] = useState<string>('');
  const [driverOverrideReason, setDriverOverrideReason] = useState<string>('');
  const [isApplyingDriverFare, setIsApplyingDriverFare] = useState<boolean>(false);
  const [driverFareTab, setDriverFareTab] = useState<'rule' | 'flat'>('rule');

  // Resizable layout dimensions - Default to balanced heights so Softphone never overflows
  const [sidebarWidth, setSidebarWidth] = useState(430); // 340px - 620px
  const [queueHeight, setQueueHeight] = useState(240); // 160px - 50%
  const [operationsWidth, setOperationsWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ct_dispatch_dock_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 750) return parsed;
      }
    }
    return 420;
  });
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
    'booking' | 'queue' | 'map' | 'messages' | 'phone' | 'drivers' | 'comms'
  >('queue');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [openTripActionId, setOpenTripActionId] = useState<string | null>(null);

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
    };
    if (isViewsDropdownOpen || isTabOverflowOpen || isAddFilterOpen || isLayoutDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isViewsDropdownOpen, isTabOverflowOpen, isAddFilterOpen, isLayoutDropdownOpen]);

  // Auth Guard
  useEffect(() => {
    const unsubscribe = getAdminAuthService().onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/signin?message=unauthenticated&redirect=/dispatch', { replace: true });
      } else if (
        !(currentUser.roles && (currentUser.roles.includes('admin') || currentUser.roles.includes('dispatcher'))) &&
        currentUser.role !== 'admin' && currentUser.role !== 'dispatcher'
      ) {
        navigate('/signin?message=unauthorized', { replace: true });
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
    return unsub;
  }, []);

  // Persist right dock operations width in localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ct_dispatch_dock_width', String(operationsWidth));
    }
  }, [operationsWidth]);

  // Dispatcher Hotkeys: M (Main), C (Comms), D (Drivers), A (Alerts), Escape (Close dock/drawers)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setIsSearchExpanded(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        setIsSearchExpanded(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape') {
        setActiveDockTab('none');
        setIsMobileDrawerOpen(false);
        setShowAlertsDropdown(false);
        setIsSearchExpanded(false);
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveDockTab('none');
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C') {
        setCommsInitialTab('phone');
        setActiveDockTab((prev) => (prev === 'phone' || (prev === 'comms' && commsInitialTab === 'phone') ? 'none' : 'phone'));
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

  // Pricing Rules (Driver Permitted)
  useEffect(() => {
    const unsub = getPricingRulesService().subscribeToRules((rules) => {
      setDriverPermittedRules(rules.filter((r) => r.isActive && r.allowDriverSelection));
    });
    return () => unsub();
  }, []);

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
            passengerPhone: payload.passengerPhone || currentForm.passengerPhone || '',
            pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
            dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
            internalNotes: payload.notes
              ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
              : currentForm.internalNotes,
          };
          return prev.map((item) => (item.id === target.id ? { ...item, formValues: updatedForm } : item));
        });
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

  const handleOpenReviewModal = (trip: Trip) => {
    setReviewTrip(trip);
    setReviewDeclineMode(false);
    setSelectedDeclineReason('No driver availability');
    setReviewCustomNotes('');
    setReviewAlert(null);
  };

  const handleConfirmTrip = async () => {
    if (!reviewTrip) return;
    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      const bookingService = getBookingService();
      if (bookingService.updateTripStatus) {
        await bookingService.updateTripStatus(reviewTrip.id, 'CONFIRMED', {
          actorRole: 'admin',
          reason: 'Dispatcher accepted web booking',
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, { status: 'CONFIRMED' });
      }

      // Dispatch confirmation email to passenger
      const emailService = getEmailDispatchService();
      await emailService.sendBookingConfirmation({
        tripId: reviewTrip.id,
        passenger: {
          firstName: reviewTrip.passenger.firstName,
          lastName: reviewTrip.passenger.lastName,
          email: reviewTrip.passenger.email,
          phone: reviewTrip.passenger.phone,
        },
        pickupAddress: reviewTrip.pickupLocation.address,
        dropoffAddress: reviewTrip.dropoffLocation.address,
        pickupTime:
          reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
            ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
        bookingType: reviewTrip.bookingType,
        vehicleTier: reviewTrip.vehicleTier,
        passengerCount: reviewTrip.passenger.passengerCount,
        luggageCount: reviewTrip.passenger.luggageCount,
        totalFare: reviewTrip.pricing?.totalFare || 0,
        currency: reviewTrip.pricing?.currency || 'USD',
        paymentMethod: reviewTrip.payment?.method || 'cash',
        specialRequests: reviewTrip.passenger.specialRequests,
      });

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '2001';
      const emailRef = `EML-${numPart}-${Math.floor(100 + Math.random() * 900)}`;
      const confRef = `CNF-${numPart}`;

      const newAuditEvents: TripAuditEvent[] = [
        ...(reviewTrip.auditLog || []),
        {
          action: 'AUTO_CONFIRMED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: confRef,
          context: 'Dispatcher reviewed and confirmed reservation',
        },
        {
          action: 'EMAIL_LOGGED',
          timestamp: nowIso,
          actorRole: 'system',
          referenceNumber: emailRef,
          context: `Dispatched confirmation receipt & live tracking link to ${reviewTrip.passenger.email}`,
        },
      ];

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          status: 'CONFIRMED',
          auditLog: newAuditEvents,
        });
      }

      // Update local state
      setTrips((prev) =>
        prev.map((t) => (t.id === reviewTrip.id ? ({ ...t, status: 'CONFIRMED' as TripStatus, auditLog: newAuditEvents }) : t))
      );

      setReviewAlert({
        type: 'success',
        message: `Booking #${reviewTrip.id} confirmed! Confirmation email dispatched to ${reviewTrip.passenger.email}.`,
      });
      setTimeout(() => {
        setReviewTrip(null);
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to confirm trip:', err);
      setReviewAlert({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to confirm trip.',
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleDeclineTrip = async () => {
    if (!reviewTrip) return;
    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      const reasonToSave =
        selectedDeclineReason === 'Custom message'
          ? reviewCustomNotes.trim() || 'Trip request declined by dispatch'
          : selectedDeclineReason;

      const bookingService = getBookingService();
      if (bookingService.updateTripStatus) {
        await bookingService.updateTripStatus(reviewTrip.id, 'DECLINED', {
          actorRole: 'admin',
          reason: reasonToSave,
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, { status: 'DECLINED' });
      }

      // Dispatch decline notification email to passenger
      const emailService = getEmailDispatchService();
      await emailService.sendBookingDeclined({
        tripId: reviewTrip.id,
        passenger: {
          firstName: reviewTrip.passenger.firstName,
          lastName: reviewTrip.passenger.lastName,
          email: reviewTrip.passenger.email,
          phone: reviewTrip.passenger.phone,
        },
        pickupAddress: reviewTrip.pickupLocation.address,
        dropoffAddress: reviewTrip.dropoffLocation.address,
        pickupTime:
          reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
            ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
        vehicleTier: reviewTrip.vehicleTier,
        reason: selectedDeclineReason,
        customNotes: reviewCustomNotes.trim() || undefined,
      });

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '3001';
      const emailRef = `EML-${numPart}-${Math.floor(100 + Math.random() * 900)}`;
      const decRef = `DEC-${numPart}`;

      const newAuditEvents: TripAuditEvent[] = [
        ...(reviewTrip.auditLog || []),
        {
          action: 'DRIVER_DECLINED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: decRef,
          context: `Dispatcher declined booking: ${reasonToSave}`,
        },
        {
          action: 'EMAIL_LOGGED',
          timestamp: nowIso,
          actorRole: 'system',
          referenceNumber: emailRef,
          context: `Sent cancellation notice email to ${reviewTrip.passenger.email}`,
        },
      ];

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          status: 'DECLINED',
          auditLog: newAuditEvents,
        });
      }

      // Update local state
      setTrips((prev) =>
        prev.map((t) => (t.id === reviewTrip.id ? ({ ...t, status: 'DECLINED' as TripStatus, auditLog: newAuditEvents }) : t))
      );

      setReviewAlert({
        type: 'success',
        message: `Booking #${reviewTrip.id} declined. Notification email sent to ${reviewTrip.passenger.email}.`,
      });
      setTimeout(() => {
        setReviewTrip(null);
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to decline trip:', err);
      setReviewAlert({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to decline trip.',
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleOpenDriverModal = (trip: Trip) => {
    setDriverModalTrip(trip);
    setSelectedDriverRuleId('');
    setDriverManualFare(trip.pricing?.totalFare ? trip.pricing.totalFare.toFixed(2) : '');
    setDriverOverrideReason('');
    setDriverFareTab('rule');
  };

  const handleApplyDriverPricingRule = async () => {
    if (!driverModalTrip) return;
    const rule = driverPermittedRules.find((r) => r.id === selectedDriverRuleId);
    if (!rule) return;

    setIsApplyingDriverFare(true);
    try {
      let newFare = driverModalTrip.pricing?.totalFare || 0;
      if (rule.modifier.type === 'flat_override') {
        newFare = rule.modifier.value;
      } else if (rule.modifier.type === 'multiplier') {
        newFare = Math.round(newFare * rule.modifier.value * 100) / 100;
      } else if (rule.modifier.type === 'surcharge_flat') {
        newFare = Math.round((newFare + rule.modifier.value) * 100) / 100;
      } else if (rule.modifier.type === 'surcharge_percent') {
        newFare = Math.round((newFare * (1 + rule.modifier.value / 100)) * 100) / 100;
      }

      const existingRules = driverModalTrip.pricing?.appliedRuleNames || [];
      const updatedRules = Array.from(new Set([...existingRules, rule.name]));

      const updates: Partial<Trip> = {
        pricing: {
          ...driverModalTrip.pricing,
          totalFare: newFare,
          appliedRuleNames: updatedRules,
        },
        payment: {
          ...driverModalTrip.payment,
          amount: newFare,
        },
        metadata: {
          ...driverModalTrip.metadata,
          driverAppliedRule: {
            ruleId: rule.id,
            ruleName: rule.name,
            appliedAt: new Date().toISOString(),
          },
        },
      };

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(driverModalTrip.id, updates);
      }

      setTrips((prev) =>
        prev.map((t) => (t.id === driverModalTrip.id ? ({ ...t, ...updates } as Trip) : t))
      );
      setDriverModalTrip(null);
    } catch (err) {
      console.error('Failed to apply driver pricing rule:', err);
    } finally {
      setIsApplyingDriverFare(false);
    }
  };

  const handleApplyDriverFlatOverride = async () => {
    if (!driverModalTrip || !driverManualFare) return;
    const fareVal = parseFloat(driverManualFare);
    if (isNaN(fareVal) || fareVal <= 0) return;

    setIsApplyingDriverFare(true);
    try {
      const existingRules = driverModalTrip.pricing?.appliedRuleNames || [];
      const updatedRules = Array.from(new Set([...existingRules, `Driver Override: $${fareVal.toFixed(2)}`]));

      const updates: Partial<Trip> = {
        pricing: {
          ...driverModalTrip.pricing,
          totalFare: fareVal,
          appliedRuleNames: updatedRules,
        },
        payment: {
          ...driverModalTrip.payment,
          amount: fareVal,
        },
        metadata: {
          ...driverModalTrip.metadata,
          driverFareOverride: {
            originalFare: driverModalTrip.pricing?.totalFare,
            overrideFare: fareVal,
            reason: driverOverrideReason || 'Driver manual flat override',
            appliedAt: new Date().toISOString(),
          },
        },
      };

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(driverModalTrip.id, updates);
      }

      setTrips((prev) =>
        prev.map((t) => (t.id === driverModalTrip.id ? ({ ...t, ...updates } as Trip) : t))
      );
      setDriverModalTrip(null);
    } catch (err) {
      console.error('Failed to apply driver flat override:', err);
    } finally {
      setIsApplyingDriverFare(false);
    }
  };

  // Batch Actions for Trips Table
  const handleBatchConfirmTrips = async () => {
    if (selectedTripIds.length === 0) return;
    const bookingService = getBookingService();
    const tripsToConfirm = trips.filter(
      (t) => selectedTripIds.includes(t.id) && t.status !== 'CONFIRMED' && t.status !== 'confirmed' && t.status !== 'completed'
    );
    if (tripsToConfirm.length === 0) {
      alert('All selected trip(s) are already confirmed or completed.');
      return;
    }

    try {
      for (const t of tripsToConfirm) {
        if (bookingService.updateTripStatus) {
          await bookingService.updateTripStatus(t.id, 'CONFIRMED', {
            actorRole: 'admin',
            reason: 'Batch confirmed by dispatcher',
          });
        } else if (bookingService.updateTrip) {
          await bookingService.updateTrip(t.id, { status: 'CONFIRMED' });
        }
      }
      setTrips((prev) =>
        prev.map((t) => (selectedTripIds.includes(t.id) ? { ...t, status: 'CONFIRMED' as TripStatus } : t))
      );
      setSelectedTripIds([]);
    } catch (err) {
      console.error('Failed to batch confirm trips:', err);
    }
  };

  const handleBatchAssignDriver = () => {
    if (selectedTripIds.length === 0) return;
    const firstTrip = trips.find((t) => t.id === selectedTripIds[0]);
    if (firstTrip) {
      handleOpenDriverModal(firstTrip);
    }
  };

  const handleQuickAssignDriver = async (tripId: string, driverId: string) => {
    const isUnassigning = !driverId || driverId === 'unassigned';
    const tripToUpdate = trips.find((t) => t.id === tripId);
    if (!tripToUpdate) return;

    const previousDriverId = tripToUpdate.assignedDriverId;

    const updates: Partial<Trip> = {
      assignedDriverId: isUnassigning ? null : driverId,
      status: isUnassigning
        ? (tripToUpdate.status === 'assigned' ? 'pending' : tripToUpdate.status)
        : (['pending', 'unconfirmed', 'UNCONFIRMED', 'CONFIRMED', 'confirmed'].includes(tripToUpdate.status)
            ? 'assigned'
            : tripToUpdate.status),
    };

    const bookingService = getBookingService();
    try {
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(tripId, updates);
      }
      setTrips((prev) => prev.map((t) => (t.id === tripId ? ({ ...t, ...updates } as Trip) : t)));

      // Sync driver roster statuses
      setDrivers((prev) =>
        prev.map((d) => {
          if (!isUnassigning && d.id === driverId) {
            return { ...d, status: 'on_trip', currentTripId: tripId };
          }
          if (previousDriverId && d.id === previousDriverId && d.currentTripId === tripId) {
            return { ...d, status: 'available', currentTripId: undefined };
          }
          return d;
        })
      );
    } catch (err) {
      console.error('Failed to quick-assign driver:', err);
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
    link.download = `trips_export_${new Date().toISOString().slice(0, 10)}_${selectedTrips.length}_trips.csv`;
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
    } catch (err) {
      console.error('Failed to reactivate trip:', err);
    }
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
        const hasAsapOrPending = newTrips.some(
          (t) =>
            t.bookingType === 'asap' ||
            t.status === 'unconfirmed' ||
            t.status === 'UNCONFIRMED' ||
            t.status === 'pending'
        );
        if (hasAsapOrPending) {
          soundNotificationService.playAsapRideChime();
        }
        newTrips.forEach((t) => knownTripIdsRef.current!.add(t.id));
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
      }
    });

    return unsub;
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
    window.location.href = '/signin?message=logged_out';
  };

  // Create new draft
  const createDraft = () => {
    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} drafts allowed.`);
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

  // Clone an existing booking into a new draft reservation
  const handleCloneBookingToNewDraft = (clonedValues: DispatchFormValues) => {
    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} tabs open. Please close a tab before cloning.`);
      return;
    }
    const newId = `new-${nextDraftIdx}`;
    setNextDraftIdx((n) => n + 1);

    try {
      localStorage.setItem(`chesterfield_dispatch_draft_${newId}`, JSON.stringify(clonedValues));
    } catch {}

    const newDraft: DraftTab = {
      id: newId,
      isNew: true,
      formValues: clonedValues,
    };
    setDrafts((prev) => [...prev, newDraft]);
    setActiveDraftId(newId);
  };

  // Close draft
  const closeDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
    const existingEdit = drafts.find((d) => !d.isNew && d.trip?.id === trip.id);
    if (existingEdit) {
      setActiveDraftId(existingEdit.id);
      return;
    }

    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} tabs open. Please close a tab before editing.`);
      return;
    }

    const editDraft: DraftTab = {
      id: `edit-${trip.id}`,
      isNew: false,
      trip,
    };
    setDrafts([...drafts, editDraft]);
    setActiveDraftId(editDraft.id);
  };

  // Clone an existing trip into a new booking draft tab
  const handleCloneBooking = (trip: Trip) => {
    const pickupDate = trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime) : new Date();
    const clonedValues: DispatchFormValues = {
      timingType: trip.scheduledPickupTime ? 'later' : 'asap',
      scheduledDate: pickupDate.toISOString().split('T')[0],
      scheduledTime: pickupDate.toTimeString().slice(0, 5),
      pickupAddress: trip.pickupLocation.address,
      pickupCoordinates: trip.pickupLocation.coordinates,
      dropoffAddress: trip.dropoffLocation.address,
      dropoffCoordinates: trip.dropoffLocation.coordinates,
      intermediateStops: [],
      passengerName: `${trip.passenger.firstName} ${trip.passenger.lastName}`.trim(),
      phone: trip.passenger.phone || '',
      email: trip.passenger.email || '',
      additionalPassengers: [],
      contactPerson: {
        isBookerDifferent: false,
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        contactRole: '',
      },
      passengers: trip.passenger.passengerCount || 1,
      bags: trip.passenger.luggageCount || 0,
      carSeats: false,
      carSeatsBreakdown: {
        rearFacing: 0,
        frontFacing: 0,
        booster: 0,
      },
      selectedVehicles: ['any'],
      vehicle: 'any',
      paymentMethod: trip.payment?.method === 'card' ? 'card' : trip.payment?.method === 'corporate' ? 'account' : 'cash',
      cardDetails: {
        cardPaymentType: 'manual',
        cardholderName: '',
        cardNumber: '',
        cardExp: '',
        cardCvc: '',
        saveCardOnFile: false,
      },
      corporateDetails: {
        corporateAccount: '',
        billingPo: '',
        authorizedBy: '',
        invoicingTerms: 'NET30',
      },
      tariff: 'Standard Rates',
      discount: '',
      company: '',
      driverId: trip.assignedDriverId || 'unassigned',
      notesForAll: trip.passenger.specialRequests || '',
      internalNotes: trip.pickupLocation.driverNotes || '',
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

  // Assign driver to current active draft
  const handleAssignDriverToDraft = (driver: DriverRosterItem) => {
    setDrivers((prev) =>
      prev.map((d) => {
        if (d.id === driver.id) return { ...d, status: 'on_trip' };
        return d;
      })
    );
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
      const twilioSid = typeof window !== 'undefined' ? localStorage.getItem('ct_twilio_sid') || '' : '';
      const twilioToken = typeof window !== 'undefined' ? localStorage.getItem('ct_twilio_token') || '' : '';
      const twilioPhone = typeof window !== 'undefined' ? localStorage.getItem('ct_twilio_phone') || '' : '';

      const resp = await fetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'make_call',
          to: sanitizePhoneNumber(numToCall),
          credentials: {
            accountSid: twilioSid,
            authToken: twilioToken,
            phoneNumber: sanitizePhoneNumber(twilioPhone),
          },
        }),
      });

      const data = (await resp.json()) as any;
      if (data.success && data.callSid) {
        setSoftphoneNotice(`Twilio Call Live (SID: ${data.callSid.slice(0, 10)}...). Ringing target phone!`);
      } else if (data.status === 'simulated' || !twilioSid) {
        setSoftphoneNotice('Simulated WebRTC Call. Add Twilio keys in Admin > Financials to ring your physical cell phone.');
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

  // Resizable sidebar handlers
  const isDraggingSidebar = useRef(false);
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    document.addEventListener('mousemove', handleSidebarMouseMove);
    document.addEventListener('mouseup', handleSidebarMouseUp);
  };

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebar.current) return;
    const newWidth = Math.min(Math.max(e.clientX, 340), 620);
    setSidebarWidth(newWidth);
  }, []);

  const handleSidebarMouseUp = useCallback(() => {
    isDraggingSidebar.current = false;
    document.removeEventListener('mousemove', handleSidebarMouseMove);
    document.removeEventListener('mouseup', handleSidebarMouseUp);
  }, [handleSidebarMouseMove]);

  // Resizable queue handlers
  const isDraggingQueue = useRef(false);
  const handleQueueMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingQueue.current = true;
    document.addEventListener('mousemove', handleQueueMouseMove);
    document.addEventListener('mouseup', handleQueueMouseUp);
  };

  const handleQueueMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingQueue.current) return;
    const windowHeight = window.innerHeight;
    const newHeight = Math.min(Math.max(windowHeight - e.clientY, 150), windowHeight * 0.6);
    setQueueHeight(newHeight);
  }, []);

  const handleQueueMouseUp = useCallback(() => {
    isDraggingQueue.current = false;
    document.removeEventListener('mousemove', handleQueueMouseMove);
    document.removeEventListener('mouseup', handleQueueMouseUp);
  }, [handleQueueMouseMove]);

  // Operations panel horizontal resize
  const isDraggingOperations = useRef(false);
  const handleOperationsMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingOperations.current = true;
    document.addEventListener('mousemove', handleOperationsMouseMove);
    document.addEventListener('mouseup', handleOperationsMouseUp);
  };

  const handleOperationsMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingOperations.current) return;
    const windowWidth = window.innerWidth;
    const newWidth = Math.min(Math.max(windowWidth - e.clientX, 320), 750);
    setOperationsWidth(newWidth);
  }, []);

  const handleOperationsMouseUp = useCallback(() => {
    isDraggingOperations.current = false;
    document.removeEventListener('mousemove', handleOperationsMouseMove);
    document.removeEventListener('mouseup', handleOperationsMouseUp);
  }, [handleOperationsMouseMove]);

  // Panel Minimization Toggle
  const toggleMinimizePanel = (panelKey: string) => {
    setMinimizedPanels((prev) => ({
      ...prev,
      [panelKey]: !prev[panelKey],
    }));
  };

  // Operations panels vertical resize between cards with strict clamping
  const isDraggingVerticalKey = useRef<string | null>(null);
  const startDragY = useRef(0);
  const startDragHeight = useRef(0);

  const handleVerticalResizeStart = (e: React.MouseEvent, panelKey: string) => {
    e.preventDefault();
    isDraggingVerticalKey.current = panelKey;
    startDragY.current = e.clientY;
    startDragHeight.current = panelHeights[panelKey] || 300;
    document.addEventListener('mousemove', handleVerticalResizeMove);
    document.addEventListener('mouseup', handleVerticalResizeUp);
  };

  // Keypad Toggle: opens numeric dialpad and ensures panel has sufficient height
  const toggleKeypad = () => {
    setShowKeypad((prev) => {
      const willShow = !prev;
      if (willShow) {
        const containerHeight = operationsContainerRef.current?.clientHeight || 650;
        const requiredPhoneHeight = 270;
        const availableForUpper = containerHeight - requiredPhoneHeight - 30;

        setPanelHeights((curr) => {
          const upperPanels = activePanels.filter((p) => p !== 'phone' && !minimizedPanels[p]);
          const updated = { ...curr };
          if (upperPanels.length > 0) {
            const totalUpper = upperPanels.reduce((sum, p) => sum + (curr[p] || 250), 0);
            if (totalUpper > availableForUpper) {
              const scale = Math.max(0.35, availableForUpper / totalUpper);
              upperPanels.forEach((p) => {
                updated[p] = Math.max(120, Math.floor((curr[p] || 250) * scale));
              });
            }
          }
          updated.phone = Math.max(updated.phone || 0, requiredPhoneHeight);
          return updated;
        });
      }
      return willShow;
    });
  };

  const handleVerticalResizeMove = useCallback((e: MouseEvent) => {
    if (!isDraggingVerticalKey.current) return;
    const key = isDraggingVerticalKey.current;
    const delta = e.clientY - startDragY.current;

    const containerHeight = operationsContainerRef.current?.clientHeight || 650;
    
    // Find index of the panel being resized
    const panelIdx = activePanels.indexOf(key as any);
    if (panelIdx === -1) return;

    // Calculate height consumed by all panels ABOVE this panel
    let heightAbove = 0;
    for (let i = 0; i < panelIdx; i++) {
      const p = activePanels[i];
      heightAbove += minimizedPanels[p] ? 32 : (panelHeights[p] || 160);
      heightAbove += 8; // resize divider
    }

    // Calculate minimum height required for all panels BELOW this panel
    let minBelow = 0;
    for (let i = panelIdx + 1; i < activePanels.length; i++) {
      const p = activePanels[i];
      if (minimizedPanels[p]) {
        minBelow += 32;
      } else if (p === 'phone') {
        minBelow += showKeypad ? 270 : 180;
      } else {
        minBelow += 120;
      }
      minBelow += 8; // resize divider
    }

    // Stop resizing when it reaches the lower panel's min height
    const maxAllowedHeight = Math.max(120, containerHeight - heightAbove - minBelow - 16);
    const minAllowedHeight = minimizedPanels[key] ? 32 : 120;

    const nextHeight = Math.max(minAllowedHeight, Math.min(maxAllowedHeight, startDragHeight.current + delta));
    setPanelHeights((prev) => ({
      ...prev,
      [key]: nextHeight,
    }));
  }, [activePanels, minimizedPanels, panelHeights, showKeypad]);

  const handleVerticalResizeUp = useCallback(() => {
    isDraggingVerticalKey.current = null;
    document.removeEventListener('mousemove', handleVerticalResizeMove);
    document.removeEventListener('mouseup', handleVerticalResizeUp);
  }, [handleVerticalResizeMove]);

  // Phase 31.5: Explicit cleanup of document resize listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleSidebarMouseMove);
      document.removeEventListener('mouseup', handleSidebarMouseUp);
      document.removeEventListener('mousemove', handleQueueMouseMove);
      document.removeEventListener('mouseup', handleQueueMouseUp);
      document.removeEventListener('mousemove', handleOperationsMouseMove);
      document.removeEventListener('mouseup', handleOperationsMouseUp);
      document.removeEventListener('mousemove', handleVerticalResizeMove);
      document.removeEventListener('mouseup', handleVerticalResizeUp);
    };
  }, [
    handleSidebarMouseMove,
    handleSidebarMouseUp,
    handleQueueMouseMove,
    handleQueueMouseUp,
    handleOperationsMouseMove,
    handleOperationsMouseUp,
    handleVerticalResizeMove,
    handleVerticalResizeUp,
  ]);

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

  // Comprehensive filtered trips in queue
  const filteredTrips = trips.filter((trip) => {
    // Status filter from dropdown (including unconfirmed)
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

    // Date Range (against scheduledPickupTime or createdAt)
    if (dateTimeRange.startDate || dateTimeRange.endDate) {
      const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
      if (tripDateStr) {
        const tripDate = tripDateStr.slice(0, 10);
        if (dateTimeRange.startDate && tripDate < dateTimeRange.startDate) return false;
        if (dateTimeRange.endDate && tripDate > dateTimeRange.endDate) return false;
      }
    } else if (filterStartDate || filterEndDate) {
      const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
      if (tripDateStr) {
        const tripDate = tripDateStr.slice(0, 10);
        if (filterStartDate && tripDate < filterStartDate) return false;
        if (filterEndDate && tripDate > filterEndDate) return false;
      }
    }

    // Active Filter: Driver
    if (activeFilterKeys.includes('driver') && selectedDriverFilter !== 'all') {
      if (trip.assignedDriverId !== selectedDriverFilter) return false;
    }

    // Active Filter: Vehicle
    if (activeFilterKeys.includes('vehicle') && selectedVehicleFilter !== 'all') {
      if (trip.vehicleTier !== selectedVehicleFilter) return false;
    }

    // Active Filter: Has Car Seat
    if (activeFilterKeys.includes('has_car_seat')) {
      const notesLower = (
        (trip.passenger.specialRequests || '') + ' ' +
        (trip.pickupLocation.notes || '') + ' ' +
        (trip.pickupLocation.driverNotes || '')
      ).toLowerCase();
      const hasSeat = notesLower.includes('car seat') || notesLower.includes('carseat') || notesLower.includes('booster');
      if (!hasSeat) return false;
    }

    // Active Filter: Company
    if (activeFilterKeys.includes('company') && selectedCompanyFilter !== 'all') {
      const company = ((trip as any).company || (trip.passenger as any).company || '').toLowerCase();
      if (!company.includes(selectedCompanyFilter.toLowerCase())) return false;
    }

    // Active Filter: Payment Type
    if (activeFilterKeys.includes('payment_type') && selectedPaymentFilter !== 'all') {
      const method = trip.payment?.method || 'cash';
      if (method !== selectedPaymentFilter) return false;
    }

    // Search query
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchId = trip.id.toLowerCase().includes(term);
      const matchPassenger = `${trip.passenger.firstName} ${trip.passenger.lastName}`
        .toLowerCase()
        .includes(term);
      const matchPhone = trip.passenger.phone.includes(term);
      const matchPickup = trip.pickupLocation.address.toLowerCase().includes(term);
      const matchDropoff = trip.dropoffLocation.address.toLowerCase().includes(term);
      const matchDriver = trip.assignedDriverId?.toLowerCase().includes(term);
      if (!matchId && !matchPassenger && !matchPhone && !matchPickup && !matchDropoff && !matchDriver) {
        return false;
      }
    }
    return true;
  });

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

  const getStatusBadge = (status: TripStatus) => {
    switch (status) {
      case 'UNCONFIRMED':
      case 'unconfirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unconfirmed
          </span>
        );
      case 'CONFIRMED':
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            Confirmed
          </span>
        );
      case 'DECLINED':
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            Declined
          </span>
        );
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'offered':
        return <Badge variant="info">Offered</Badge>;
      case 'assigned':
        return <Badge variant="primary">Assigned</Badge>;
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            Accepted
          </span>
        );
      case 'en_route':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            🚗 En Route
          </span>
        );
      case 'arrived':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            📍 Arrived
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            ⏱️ In Progress
          </span>
        );
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }

  };

  // Active Draft object for map route display
  const activeDraft = drafts.find((d) => d.id === activeDraftId);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <SpinnerIcon className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col overflow-hidden text-slate-900 select-none">
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

          {/* Desktop Operational Panel Triggers: Main, Communications, Drivers, Alerts */}
          <div className="hidden lg:flex items-center gap-1.5">
            {/* Main Console Tab (Booking on left, Map on top right, Trips table on bottom right) */}
            <button
              type="button"
              onClick={() => setActiveDockTab('none')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeDockTab === 'none'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Main Console: Booking form, Map, and Trips queue"
            >
              <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
              <span>Main</span>
            </button>

            {/* Phone Tab (Calls, SMS, Voicemail) */}
            <button
              type="button"
              onClick={() => {
                if (activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')) {
                  setActiveDockTab('none');
                } else {
                  setCommsInitialTab('phone');
                  setActiveDockTab('phone');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Phone: Omnichannel Calls, Messages, and Voicemail (Alt+P)"
            >
              <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Phone</span>
              {activeCallStatus !== 'idle' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              )}
            </button>

            {/* Email Tab */}
            <button
              type="button"
              onClick={() => setActiveDockTab(activeDockTab === 'email' ? 'none' : 'email')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeDockTab === 'email'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Email: Inquiries, Bookings, Receipts (Alt+E)"
            >
              <MailIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Email</span>
            </button>

            {/* Drivers Tab */}
            <button
              type="button"
              onClick={() => setActiveDockTab(activeDockTab === 'drivers' ? 'none' : 'drivers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeDockTab === 'drivers'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Drivers Roster & Status (Alt+D)"
            >
              <CarIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Drivers</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeDockTab === 'drivers' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {drivers.filter((d) => d.status === 'available').length}
              </span>
            </button>
          </div>
        </div>

        {/* Center: Brand Badge */}
        <div className="flex items-center gap-2">
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

        {/* Right: Screen Pop Call HUD + Omnichannel Messages + Alerts Bell + App Suite Launcher */}
        <div className="flex items-center gap-2">
          <DispatchHeaderCallHud
            trips={trips}
            missedCallsCount={missedCallsCount}
            isPhoneDockActive={
              activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')
            }
            onTogglePhoneDock={() => {
              if (activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')) {
                setActiveDockTab('none');
              } else {
                setCommsInitialTab('phone');
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
              if (tab) setCommsInitialTab(tab);
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
                  passengerPhone: payload.passengerPhone || currentForm.passengerPhone || '',
                  pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
                  dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
                  internalNotes: payload.notes
                    ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
                    : currentForm.internalNotes,
                };
                return prev.map((d) => (d.id === target.id ? { ...d, formValues: updatedForm } : d));
              });
            }}
          />

          {/* Omnichannel Messages Hub Button */}
          <button
            type="button"
            onClick={() => {
              if (activeDockTab === 'comms' && commsInitialTab === 'messages') {
                setActiveDockTab('none');
              } else {
                setCommsInitialTab('messages');
                setActiveDockTab('comms');
                setActiveMobileTab('messages');
                setUnreadMessagesCount(0);
              }
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              activeDockTab === 'comms' && commsInitialTab === 'messages'
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
                    <span>⏳ Auto-dismiss:</span>
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
              <span className="text-base select-none leading-none" role="img" aria-label="Muted">🔇</span>
            ) : (
              <span className="text-base select-none leading-none" role="img" aria-label="Sound Active">🔊</span>
            )}
            {!isSoundMuted && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            )}
          </button>

          {/* App Suite Launcher (9-Dot Grid) */}
          <AppSuiteLauncher />
        </div>
      </header>

      {/* ─── ACTIVE CALL TOP STICKY GREEN BANNER (CALL PERSISTENCE ACROSS TABS / DOCK CLOSE) ─── */}
      {activeCallStatus !== 'idle' && (activeDockTab !== 'phone' || (activeMobileTab !== 'comms' && activeMobileTab !== 'phone')) && (
        <div
          onClick={() => {
            setActiveDockTab('phone');
            setCommsInitialTab('phone');
            setActiveMobileTab('comms');
          }}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 flex items-center justify-between cursor-pointer shadow-md z-30 transition-colors select-none shrink-0"
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
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-bold cursor-pointer transition-colors"
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            {/* Quick Operations Triggers */}
            <div className="py-3 border-b border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Operations
                </span>
                <span className="text-[10px] text-blue-400 font-bold">Detachable</span>
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
                  activeDockTab === 'none'
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

              {/* Phone Hub (Calls & SMS) with Pop-Out */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCommsInitialTab('phone');
                    setActiveDockTab('phone');
                    setActiveMobileTab('comms');
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (activeDockTab !== 'none' ? (activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')) : activeMobileTab === 'comms')
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
                      (activeDockTab !== 'none' ? (activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')) : activeMobileTab === 'comms')
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
                  className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              {/* Email Console with Pop-Out */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDockTab('email');
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeDockTab === 'email'
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
                      activeDockTab === 'email'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Inquiries
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => getWorkspaceBus().popOutModule('email')}
                  title="Pop out Email Console to detached window"
                  className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              {/* Drivers Roster with Pop-Out */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDockTab('drivers');
                    setActiveMobileTab('drivers');
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    (activeDockTab !== 'none' ? activeDockTab === 'drivers' : activeMobileTab === 'drivers')
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
                      (activeDockTab !== 'none' ? activeDockTab === 'drivers' : activeMobileTab === 'drivers')
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
                  className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                >
                  ↗
                </button>
              </div>

              {/* Fleet Alerts & Broadcasts */}
              <button
                type="button"
                onClick={() => {
                  setActiveDockTab('alerts');
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

            {/* Workspace Layout Preferences */}
            <div className="py-3 border-b border-slate-800/80 space-y-2">
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

            {/* Quick Links */}
            <div className="py-3 border-b border-slate-800/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1">
                System &amp; Platform
              </span>
              <Link
                to="/admin"
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                onClick={() => setIsMobileDrawerOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <span>👑</span>
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
                  <span>🌐</span>
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
          {/* Browser-style Tab Bar */}
          <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-center px-1 shrink-0 select-none relative">
            <div className="flex-1 flex items-center gap-1 overflow-x-auto h-full scrollbar-none py-1 min-w-0">
              {drafts.map((d) => {
                const isActive = d.id === activeDraftId;
                const label = getTabLabel(d);
                return (
                  <div
                    key={d.id}
                    onClick={() => setActiveDraftId(d.id)}
                    title={d.formValues?.passengerName || d.id}
                    className={`group relative h-7 px-2 rounded-t-md text-xs font-semibold flex items-center gap-1 cursor-pointer border-t border-x transition-colors shrink-0 max-w-[85px] ${
                      isActive
                        ? 'bg-white text-blue-600 border-slate-300 shadow-xs'
                        : 'bg-slate-200/60 text-slate-600 hover:bg-slate-200 border-transparent'
                    }`}
                  >
                    <span className="truncate flex-1 text-[11px]">{label}</span>
                    <button
                      type="button"
                      onClick={(e) => closeDraft(d.id, e)}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] text-slate-400 hover:text-slate-700 hover:bg-slate-300 cursor-pointer shrink-0"
                      title="Close Tab"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Pinned Add Tab & Overflow Actions (Always visible, never squeezed under dropdown) */}
            <div className="flex items-center shrink-0 pl-1 border-l border-slate-200 gap-0.5">
              {drafts.length < maxDrafts && (
                <button
                  type="button"
                  onClick={createDraft}
                  className="h-7 w-7 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 font-bold text-sm flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                  title="Open new draft booking tab"
                >
                  +
                </button>
              )}

              {/* Tab Overflow Chevron Menu (Pinned to right) */}
              <div className="relative shrink-0 flex items-center" ref={tabOverflowRef}>
                <button
                  type="button"
                  onClick={() => setIsTabOverflowOpen(!isTabOverflowOpen)}
                className={`h-7 px-1.5 rounded flex items-center justify-center text-xs font-bold transition-colors ${
                  isTabOverflowOpen
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                }`}
                title="All Open Draft Tabs"
              >
                <span>▾</span>
              </button>

              {isTabOverflowOpen && (
                <div className="absolute right-0 top-8 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                    <span>Open Tabs ({drafts.length}/{maxDrafts})</span>
                    {drafts.length < maxDrafts && (
                      <button
                        type="button"
                        onClick={() => {
                          createDraft();
                          setIsTabOverflowOpen(false);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-bold text-xs capitalize"
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
                            <span className="text-sm">{d.isNew ? '📝' : '✎'}</span>
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
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors ml-2"
                            title="Close tab"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Persistent Draft / Edit Form Container */}
          <div className="flex-1 overflow-hidden relative">
            {drafts.map((d) => (
              <div
                key={d.id}
                className={`h-full w-full ${d.id === activeDraftId ? 'block' : 'hidden'}`}
              >
                <DispatchBookingEngine
                  draftId={d.id}
                  initialTrip={d.trip}
                  onValuesChange={(vals) => handleDraftValuesChange(d.id, vals)}
                  onBookingSuccess={(savedTrip, isEdit) => {
                    if (isEdit) {
                      closeDraft(d.id, { stopPropagation: () => {} } as any);
                    }
                  }}
                  onClearDraft={() => {
                    setDrafts((prev) =>
                      prev.map((item) => (item.id === d.id ? { ...item, formValues: undefined } : item))
                    );
                  }}
                  onCopyBooking={handleCloneBookingToNewDraft}
                  onCloneBooking={handleCloneBookingToNewDraft}
                  onOpenLinkedTrip={(linkedTripId) => {
                    const linkedTrip = trips.find((t) => t.id === linkedTripId);
                    if (linkedTrip) {
                      handleOpenEditTrip(linkedTrip);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </aside>

        {/* Resizer Handle (Left Sidebar) */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className="w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-20 shrink-0"
        />

        {/* ─── B. CENTER COLUMN: MAP VIEW STAGE + BOTTOM DOCKED QUEUE ─── */}
        <div className={`flex-1 flex-col h-full overflow-hidden relative min-w-0 ${
          activeMobileTab === 'queue' || activeMobileTab === 'map' ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Live Google Map Stage */}
          <div className={`w-full relative z-0 ${
            activeMobileTab === 'map'
              ? 'flex-1 h-full'
              : activeMobileTab === 'queue'
              ? 'hidden lg:flex lg:flex-1 lg:min-h-[160px]'
              : 'flex-1 lg:min-h-[160px]'
          }`}>
            <LiveDispatchMap
              activeFormValues={activeDraft?.formValues}
              activeTrip={activeDraft?.trip}
              selectedTrip={selectedMapTrip}
              shouldZoom={shouldZoomMap}
            />
          </div>

          {/* Resizer Handle (Bottom Queue) */}
          <div
            onMouseDown={handleQueueMouseDown}
            className="hidden lg:block h-1.5 w-full cursor-row-resize hover:bg-blue-500/50 transition-colors z-10 shrink-0"
          />

          {/* Bottom Docked Queue */}
          <div
            style={{
              height: isDesktop ? `${queueHeight}px` : undefined,
            }}
            className={`w-full bg-white border-t border-slate-200 flex flex-col z-10 shadow-md ${
              activeMobileTab === 'queue'
                ? 'flex-1 h-full lg:flex-none lg:h-auto lg:shrink-0'
                : 'hidden lg:flex lg:flex-none lg:h-auto lg:shrink-0'
            }`}
          >
            {/* ─── Modern Filter & Trips Control Bar ─── */}
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-1.5 sm:gap-2 shrink-0 min-w-0 h-11 relative z-30 overflow-visible">
              {/* Mobile-Only Expanded Search (takes full width on small screens) */}
              {isSearchExpanded ? (
                <div className="md:hidden flex-1 flex items-center gap-2 animate-in fade-in duration-150 min-w-0">
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search trips by ID, passenger, phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsSearchExpanded(false);
                      }}
                      className="w-full pl-8 pr-8 py-1 bg-white border border-blue-500 rounded-lg text-slate-800 text-xs shadow-2xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                        title="Clear search text"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchExpanded(false);
                      setSearchTerm('');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0 h-7 flex items-center gap-1"
                    title="Close search and show filters"
                  >
                    <span>✕</span>
                  </button>
                </div>
              ) : null}

              {/* Standard Control Bar: Always displayed on Desktop; visible on mobile when search is NOT expanded */}
              <div className={`${isSearchExpanded ? 'hidden md:flex' : 'flex'} items-center justify-between gap-1.5 sm:gap-2 flex-1 min-w-0`}>
                {/* Left Controls: Date Range, Status Dropdown, and (on Desktop) Filter Add & Pills */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-visible">
                    {/* 1. Select Date Range Popover Button */}
                    <div className="relative shrink-0" ref={datePickerTriggerRef}>
                      <button
                        type="button"
                        onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-white border rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer h-7 shrink-0 ${
                          dateTimeRange.presetKey && dateTimeRange.presetKey !== 'all_time'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                        title="Filter trips by date range"
                      >
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate max-w-[90px] sm:max-w-[130px] md:max-w-[160px]">{getDateRangeButtonLabel()}</span>
                        <ChevronDownIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      </button>

                      <CustomDateTimePicker
                        isOpen={isDatePickerOpen}
                        onClose={() => setIsDatePickerOpen(false)}
                        value={dateTimeRange}
                        placement="top"
                        onChange={(newRange) => {
                          setDateTimeRange(newRange);
                          setFilterStartDate(newRange.startDate);
                          setFilterEndDate(newRange.endDate);
                        }}
                      />
                    </div>

                    {/* 2. Unified Status Dropdown */}
                    <div className="relative shrink-0">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className={`h-7 pl-2 pr-6 bg-white border rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer max-w-[110px] sm:max-w-[140px] md:max-w-[170px] truncate ${
                          statusFilter.toLowerCase() === 'unconfirmed'
                            ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold ring-1 ring-amber-300'
                            : unconfirmedCount > 0 && statusFilter === 'all'
                            ? 'border-amber-300 text-slate-800'
                            : 'border-slate-300 text-slate-700'
                        }`}
                      >
                        <option value="all">
                          {unconfirmedCount > 0 ? `Status: All (${unconfirmedCount} unconfirmed)` : 'Status: All ▾'}
                        </option>
                        <option value="unconfirmed">
                          ⚡ Unconfirmed ({unconfirmedCount})
                        </option>
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                        <option value="assigned">Assigned</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="declined">Declined</option>
                      </select>
                      {unconfirmedCount > 0 && statusFilter.toLowerCase() !== 'unconfirmed' && (
                        <span
                          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-pulse pointer-events-none"
                          title={`${unconfirmedCount} unconfirmed booking(s)`}
                        />
                      )}
                    </div>

                    {/* Desktop Only: Add Filter & Active Filter Pills */}
                    <div className="hidden md:flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      {/* 3. + Add Filter Dropdown */}
                      <div className="relative shrink-0" ref={addFilterRef}>
                        <button
                          type="button"
                          onClick={() => setIsAddFilterOpen(!isAddFilterOpen)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer h-7"
                        >
                          <FunnelIcon className="w-3.5 h-3.5 text-slate-500" />
                          <span>Filter</span>
                          <span className="text-[10px] text-slate-400">▾</span>
                        </button>

                        {isAddFilterOpen && (
                          <div className="absolute bottom-full left-0 mb-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                            {[
                              { key: 'driver', label: 'Driver' },
                              { key: 'vehicle', label: 'Vehicle' },
                              { key: 'company', label: 'Company' },
                              { key: 'payment_type', label: 'Payment Type' },
                              { key: 'tariff', label: 'Tariff' },
                              { key: 'has_car_seat', label: 'Has Car Seat' },
                            ].map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  if (!activeFilterKeys.includes(item.key as FilterType)) {
                                    setActiveFilterKeys([...activeFilterKeys, item.key as FilterType]);
                                  }
                                  setIsAddFilterOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-between transition-colors cursor-pointer ${
                                  activeFilterKeys.includes(item.key as FilterType) ? 'text-blue-600 font-bold bg-blue-50/50' : ''
                                }`}
                              >
                                <span>{item.label}</span>
                                {activeFilterKeys.includes(item.key as FilterType) && <span>✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Active Filter Pills on Desktop */}
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 py-0.5">
                        {/* Pill: Driver */}
                        {activeFilterKeys.includes('driver') && (
                          <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                            <span className="font-semibold text-slate-500 text-[11px]">Driver:</span>
                            <select
                              value={selectedDriverFilter}
                              onChange={(e) => setSelectedDriverFilter(e.target.value)}
                              className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                            >
                              <option value="all">All Drivers ▾</option>
                              {drivers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'driver'))}
                              className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                              title="Remove Driver filter"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Pill: Has Car Seat */}
                        {activeFilterKeys.includes('has_car_seat') && (
                          <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-bold text-blue-800 shadow-2xs shrink-0 h-6">
                            <span className="text-[11px]">Has Car Seat</span>
                            <button
                              type="button"
                              onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'has_car_seat'))}
                              className="text-blue-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                              title="Remove Car Seat filter"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Pill: Vehicle */}
                        {activeFilterKeys.includes('vehicle') && (
                          <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                            <span className="font-semibold text-slate-500 text-[11px]">Vehicle:</span>
                            <select
                              value={selectedVehicleFilter}
                              onChange={(e) => setSelectedVehicleFilter(e.target.value)}
                              className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                            >
                              <option value="all">All Vehicles ▾</option>
                              {settings.vehicles.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'vehicle'))}
                              className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                              title="Remove Vehicle filter"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Pill: Company */}
                        {activeFilterKeys.includes('company') && (
                          <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                            <span className="font-semibold text-slate-500 text-[11px]">Company:</span>
                            <select
                              value={selectedCompanyFilter}
                              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                              className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                            >
                              <option value="all">All Companies ▾</option>
                              <option value="Chesterfield">Chesterfield Corporate</option>
                              <option value="Medical">Medical Express</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'company'))}
                              className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                              title="Remove Company filter"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Pill: Payment Type */}
                        {activeFilterKeys.includes('payment_type') && (
                          <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                            <span className="font-semibold text-slate-500 text-[11px]">Payment:</span>
                            <select
                              value={selectedPaymentFilter}
                              onChange={(e) => setSelectedPaymentFilter(e.target.value)}
                              className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                            >
                              <option value="all">All Methods ▾</option>
                              <option value="card">Credit Card</option>
                              <option value="cash">Cash in Cab</option>
                              <option value="account">Corporate Account</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'payment_type'))}
                              className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                              title="Remove Payment filter"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {/* Pill: Tariff */}
                        {activeFilterKeys.includes('tariff') && (
                          <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                            <span className="font-semibold text-slate-500 text-[11px]">Tariff:</span>
                            <select
                              value={selectedTariffFilter}
                              onChange={(e) => setSelectedTariffFilter(e.target.value)}
                              className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                            >
                              <option value="all">Standard Tariff ▾</option>
                              <option value="surge">Surge Rate</option>
                              <option value="airport">Flat Airport Rate</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'tariff'))}
                              className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                              title="Remove Tariff filter"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Displaying X trips text */}
                      <span className="text-[11px] text-slate-500 font-medium shrink-0 whitespace-nowrap ml-1 hidden xl:inline">
                        Displaying {filteredTrips.length} {filteredTrips.length === 1 ? 'trip' : 'trips'}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Selection Badge, Mobile Filter Toggle, Queue Layout Dropdown, Search Magnifier */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {selectedTripIds.length > 0 && (
                      <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-900 text-white px-2 py-1 rounded-xl text-xs font-semibold shadow-md shrink-0 animate-in fade-in zoom-in-95 duration-100">
                        <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 shrink-0">
                          ✓ {selectedTripIds.length} <span className="hidden sm:inline">Selected</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleBatchConfirmTrips}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Confirm all selected trips"
                        >
                          <BoltIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Confirm</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleBatchAssignDriver}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Assign driver to selected trip"
                        >
                          <UsersIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Assign</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleBatchExportCsv}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Export selected trips as CSV"
                        >
                          <DocumentTextIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Export</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleBatchCancelTrips}
                          className="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                          title="Cancel selected trips"
                        >
                          <span>🚫</span>
                          <span className="hidden sm:inline">Cancel</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTripIds([])}
                          className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer ml-0.5 shrink-0"
                          title="Clear selection"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Mobile Filters Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                      className={`md:hidden flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer h-7 shadow-2xs ${
                        activeFilterKeys.length > 0 || isMobileFiltersOpen
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
                      }`}
                      title="Filter Trips"
                    >
                      <FunnelIcon className="w-3.5 h-3.5" />
                      {activeFilterKeys.length > 0 && (
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                          {activeFilterKeys.length}
                        </span>
                      )}
                    </button>

                    {/* Queue Display Layout Dropdown */}
                    <div className="relative shrink-0" ref={layoutDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
                        className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer h-7"
                        title={`Queue Layout: ${displayLayout}. Click to change.`}
                      >
                        {displayLayout === 'cards' ? (
                          <Squares2X2Icon className="w-3.5 h-3.5 text-slate-600" />
                        ) : displayLayout === 'table' ? (
                          <TableCellsIcon className="w-3.5 h-3.5 text-slate-600" />
                        ) : (
                          <ListBulletIcon className="w-3.5 h-3.5 text-slate-600" />
                        )}
                        <span className="hidden sm:inline capitalize">
                          {displayLayout === 'cards' ? 'Cards' : displayLayout === 'table' ? 'Table' : 'Compact'}
                        </span>
                        <ChevronDownIcon className="w-3 h-3 text-slate-400" />
                      </button>

                      {isLayoutDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setDisplayLayout('cards');
                              setIsLayoutDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                              displayLayout === 'cards' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Squares2X2Icon className="w-4 h-4 text-slate-500" />
                              <span>Cards</span>
                            </div>
                            {displayLayout === 'cards' && <span>✓</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDisplayLayout('table');
                              setIsLayoutDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                              displayLayout === 'table' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <TableCellsIcon className="w-4 h-4 text-slate-500" />
                              <span>Table</span>
                            </div>
                            {displayLayout === 'table' && <span>✓</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDisplayLayout('compact');
                              setIsLayoutDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between transition-colors cursor-pointer ${
                              displayLayout === 'compact' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <ListBulletIcon className="w-4 h-4 text-slate-500" />
                              <span>Compact</span>
                            </div>
                            {displayLayout === 'compact' && <span>✓</span>}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Search Component: Desktop inline bar with max-width or compact button */}
                    {isSearchExpanded ? (
                      <div className="hidden md:flex items-center gap-1.5 w-60 lg:w-72 max-w-[320px] animate-in fade-in duration-150">
                        <div className="relative flex-1 min-w-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                          </span>
                          <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search trips (/ or Ctrl+K)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                if (searchTerm) {
                                  setSearchTerm('');
                                } else {
                                  setIsSearchExpanded(false);
                                }
                              }
                            }}
                            className="w-full pl-8 pr-7 py-1 bg-white border border-blue-500 rounded-lg text-slate-800 text-xs shadow-2xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden h-7"
                          />
                          {searchTerm && (
                            <button
                              type="button"
                              onClick={() => setSearchTerm('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                              title="Clear search text"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSearchExpanded(false);
                          }}
                          className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0 h-7 flex items-center justify-center"
                          title="Close search (Esc)"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchExpanded(true);
                          setTimeout(() => searchInputRef.current?.focus(), 50);
                        }}
                        className={`p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 h-7 w-7 shadow-2xs ${
                          searchTerm
                            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-300'
                            : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
                        }`}
                        title={searchTerm ? `Searching "${searchTerm}" - Click to edit` : 'Search trips (/ or Ctrl+K)'}
                      >
                        <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

            {/* Mobile Sub-Toolbar: Filter Controls & Active Pills (visible if filters active or expanded on mobile) */}
            {!isSearchExpanded && (activeFilterKeys.length > 0 || isMobileFiltersOpen) && (
              <div className="md:hidden px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 animate-in fade-in duration-100">
                {/* Mobile Add Filter Button */}
                <div className="relative shrink-0" ref={addFilterRef}>
                  <button
                    type="button"
                    onClick={() => setIsAddFilterOpen(!isAddFilterOpen)}
                    className="flex items-center gap-1 px-2.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer h-6 shrink-0"
                  >
                    <FunnelIcon className="w-3 h-3 text-slate-500" />
                    <span>+ Filter</span>
                  </button>

                  {isAddFilterOpen && (
                    <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                      {[
                        { key: 'driver', label: 'Driver' },
                        { key: 'vehicle', label: 'Vehicle' },
                        { key: 'company', label: 'Company' },
                        { key: 'payment_type', label: 'Payment Type' },
                        { key: 'tariff', label: 'Tariff' },
                        { key: 'has_car_seat', label: 'Has Car Seat' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            if (!activeFilterKeys.includes(item.key as FilterType)) {
                              setActiveFilterKeys([...activeFilterKeys, item.key as FilterType]);
                            }
                            setIsAddFilterOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-between transition-colors cursor-pointer ${
                            activeFilterKeys.includes(item.key as FilterType) ? 'text-blue-600 font-bold bg-blue-50/50' : ''
                          }`}
                        >
                          <span>{item.label}</span>
                          {activeFilterKeys.includes(item.key as FilterType) && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Filter Pills on Mobile */}
                {activeFilterKeys.includes('driver') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Driver:</span>
                    <select
                      value={selectedDriverFilter}
                      onChange={(e) => setSelectedDriverFilter(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'driver'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('has_car_seat') && (
                  <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-bold text-blue-800 shadow-2xs shrink-0 h-6">
                    <span className="text-[11px]">Car Seat</span>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'has_car_seat'))}
                      className="text-blue-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('vehicle') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Veh:</span>
                    <select
                      value={selectedVehicleFilter}
                      onChange={(e) => setSelectedVehicleFilter(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All</option>
                      {settings.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'vehicle'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('company') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Co:</span>
                    <select
                      value={selectedCompanyFilter}
                      onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="Chesterfield">Chesterfield</option>
                      <option value="Medical">Medical</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'company'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('payment_type') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Pay:</span>
                    <select
                      value={selectedPaymentFilter}
                      onChange={(e) => setSelectedPaymentFilter(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="account">Account</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'payment_type'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.includes('tariff') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs text-slate-700 shadow-2xs shrink-0 h-6">
                    <span className="font-semibold text-slate-500 text-[11px]">Tariff:</span>
                    <select
                      value={selectedTariffFilter}
                      onChange={(e) => setSelectedTariffFilter(e.target.value)}
                      className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="surge">Surge</option>
                      <option value="airport">Airport</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'tariff'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {activeFilterKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilterKeys([])}
                    className="text-[10px] text-red-600 hover:underline font-bold shrink-0 ml-1 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}

            {/* ─── Queue Content (Cards vs Compact vs Table) ─── */}
            {displayLayout === 'cards' ? (
              <div className="flex-1 overflow-auto p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 bg-slate-50/50">
                {filteredTrips.map((trip) => {
                  const isSelected = selectedQueueTripId === trip.id;
                  const isChecked = selectedTripIds.includes(trip.id);
                  const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
                  const pickupTimeStr = trip.scheduledPickupTime
                    ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'ASAP';

                  return (
                    <div
                      key={trip.id}
                      onClick={() => {
                        setSelectedQueueTripId(trip.id);
                        setSelectedMapTrip(trip);
                        setShouldZoomMap(false);
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white flex flex-col justify-between shadow-2xs ${
                        isUnconfirmedTrip
                          ? 'border-amber-400 bg-amber-50/50 hover:bg-amber-50 ring-1 ring-amber-300'
                          : isSelected
                          ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-400'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleSelectTrip(trip.id);
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="font-mono font-bold text-xs text-slate-800">
                              #{trip.id.slice(-6).toUpperCase()}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              {pickupTimeStr}
                            </span>
                          </div>
                          <div>{getStatusBadge(trip.status)}</div>
                        </div>

                        <div className="mb-2.5">
                          <div className="font-bold text-xs text-slate-900">
                            {trip.passenger.firstName} {trip.passenger.lastName}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                            <span>{trip.passenger.phone}</span>
                            {trip.passenger.phone && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartCall(trip.passenger.phone, `${trip.passenger.firstName} ${trip.passenger.lastName}`);
                                  setCommsInitialTab('phone');
                                  setActiveDockTab('phone');
                                }}
                                className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                                title="Click-to-Call Passenger via WebRTC Softphone"
                              >
                                <PhoneIcon className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl mb-3">
                          <div className="flex items-start gap-1.5">
                            <span className="text-emerald-600 text-xs shrink-0">🟢</span>
                            <span className="truncate font-medium" title={trip.pickupLocation.address}>
                              {trip.pickupLocation.address}
                            </span>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="text-red-500 text-xs shrink-0">📍</span>
                            <span className="truncate font-medium" title={trip.dropoffLocation.address}>
                              {trip.dropoffLocation.address}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-sm">
                            ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {trip.vehicleTier || 'Standard'}
                          </span>
                          <select
                            value={trip.assignedDriverId || 'unassigned'}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleQuickAssignDriver(trip.id, e.target.value);
                            }}
                            className={`text-[11px] font-semibold rounded-md border py-0.5 px-1.5 cursor-pointer transition-colors max-w-[140px] truncate ${
                              trip.assignedDriverId
                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                : 'bg-amber-50 text-amber-800 border-amber-300 font-bold hover:bg-amber-100'
                            }`}
                            title="Quick-assign driver"
                          >
                            <option value="unassigned">⚠️ Unassigned</option>
                            {drivers.map((drv) => (
                              <option key={drv.id} value={drv.id}>
                                {drv.name} ({drv.status === 'available' ? 'Avail' : drv.status === 'on_trip' ? 'Busy' : 'Off'})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isUnconfirmedTrip && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReviewModal(trip);
                              }}
                              className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs cursor-pointer animate-pulse"
                              title="Review customer web booking"
                            >
                              Review
                            </button>
                          )}
                          <TripActionDropdown
                            trip={trip}
                            isUnconfirmed={isUnconfirmedTrip}
                            isOpen={openTripActionId === trip.id}
                            isDesktop={isDesktop}
                            onToggle={() => setOpenTripActionId(openTripActionId === trip.id ? null : trip.id)}
                            onClose={() => setOpenTripActionId(null)}
                            onReview={() => handleOpenReviewModal(trip)}
                            onEdit={() => {
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(true);
                              handleOpenEditTrip(trip);
                              setActiveMobileTab('booking');
                            }}
                            onFare={() => handleOpenDriverModal(trip)}
                            onAudit={() => setAuditTrailTrip(trip)}
                            onClone={() => {
                              handleCloneBooking(trip);
                              setActiveMobileTab('booking');
                            }}
                            onFocusMap={() => {
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(true);
                              setActiveMobileTab('map');
                            }}
                            onCancelTrip={() => handlePromptCancelTrip(trip)}
                            onReactivateTrip={() => handleReactivateTrip(trip)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredTrips.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 font-semibold text-xs">
                    No trips found.
                  </div>
                )}
              </div>
            ) : displayLayout === 'compact' ? (
              <div className="flex-1 overflow-auto divide-y divide-slate-100 text-xs">
                {filteredTrips.map((trip) => {
                  const isSelected = selectedQueueTripId === trip.id;
                  const isChecked = selectedTripIds.includes(trip.id);
                  const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
                  const pickupTimeStr = trip.scheduledPickupTime
                    ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'ASAP';

                  return (
                    <div
                      key={trip.id}
                      onClick={() => {
                        setSelectedQueueTripId(trip.id);
                        setSelectedMapTrip(trip);
                        setShouldZoomMap(false);
                      }}
                      onDoubleClick={() => {
                        setSelectedQueueTripId(trip.id);
                        setSelectedMapTrip(trip);
                        setShouldZoomMap(true);
                        handleOpenEditTrip(trip);
                        setActiveMobileTab('booking');
                      }}
                      className={`h-9 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isUnconfirmedTrip
                          ? 'bg-amber-50/80 border-l-4 border-l-amber-500'
                          : isSelected
                          ? 'bg-blue-50 font-medium'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleSelectTrip(trip.id);
                          }}
                          className="rounded border-slate-300 text-blue-600 cursor-pointer"
                        />
                        <span className="font-semibold text-slate-700 shrink-0 w-16">
                          {pickupTimeStr}
                        </span>
                        <span className="font-bold text-slate-900 shrink-0 max-w-[120px] truncate">
                          {trip.passenger.firstName} {trip.passenger.lastName}
                        </span>
                        <span className="text-slate-500 truncate max-w-[200px]" title={`${trip.pickupLocation.address} → ${trip.dropoffLocation.address}`}>
                          {trip.pickupLocation.address} → {trip.dropoffLocation.address}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={trip.assignedDriverId || 'unassigned'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleQuickAssignDriver(trip.id, e.target.value);
                          }}
                          className={`text-[11px] font-semibold rounded-md border py-0.5 px-1.5 cursor-pointer transition-colors max-w-[130px] truncate ${
                            trip.assignedDriverId
                              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                              : 'bg-amber-50 text-amber-800 border-amber-300 font-bold hover:bg-amber-100'
                          }`}
                          title="Quick-assign driver"
                        >
                          <option value="unassigned">⚠️ Unassigned</option>
                          {drivers.map((drv) => (
                            <option key={drv.id} value={drv.id}>
                              {drv.name} ({drv.status === 'available' ? 'Avail' : drv.status === 'on_trip' ? 'Busy' : 'Off'})
                            </option>
                          ))}
                        </select>
                        <span className="font-bold text-slate-900">
                          ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                        <div>{getStatusBadge(trip.status)}</div>
                        <div className="flex items-center gap-1.5">
                          {isUnconfirmedTrip && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReviewModal(trip);
                              }}
                              className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] cursor-pointer"
                              title="Review customer web booking"
                            >
                              Review
                            </button>
                          )}
                          <TripActionDropdown
                            trip={trip}
                            isUnconfirmed={isUnconfirmedTrip}
                            isOpen={openTripActionId === trip.id}
                            isDesktop={isDesktop}
                            onToggle={() => setOpenTripActionId(openTripActionId === trip.id ? null : trip.id)}
                            onClose={() => setOpenTripActionId(null)}
                            onReview={() => handleOpenReviewModal(trip)}
                            onEdit={() => {
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(true);
                              handleOpenEditTrip(trip);
                              setActiveMobileTab('booking');
                            }}
                            onFare={() => handleOpenDriverModal(trip)}
                            onAudit={() => setAuditTrailTrip(trip)}
                            onClone={() => {
                              handleCloneBooking(trip);
                              setActiveMobileTab('booking');
                            }}
                            onFocusMap={() => {
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(true);
                              setActiveMobileTab('map');
                            }}
                            onCancelTrip={() => handlePromptCancelTrip(trip)}
                            onReactivateTrip={() => handleReactivateTrip(trip)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredTrips.length === 0 && (
                  <div className="py-12 text-center text-slate-500 font-semibold text-xs">
                    No trips found.
                  </div>
                )}
              </div>
            ) : (
              /* Dense Table View wrapped in overflow-x-auto custom-scrollbar */
              <div className="flex-1 overflow-auto text-xs">
                <div className="overflow-x-auto custom-scrollbar min-w-full">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold text-[11px] z-10">
                      <tr>
                        <th className="py-2 px-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someFilteredSelected;
                            }}
                            onChange={handleToggleSelectAll}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            title="Select/Deselect All Filtered Trips"
                          />
                        </th>
                        <th className="py-2 px-3">DATE/TIME ▲</th>
                        <th className="py-2 px-3">PASSENGER</th>
                        <th className="py-2 px-3">PICKUP</th>
                        <th className="py-2 px-3">DROPOFF</th>
                        <th className="py-2 px-3">DRIVER</th>
                        <th className="py-2 px-3">VEHICLE</th>
                        <th className="py-2 px-3">PRICE</th>
                        <th className="py-2 px-3">STATUS</th>
                        <th className="py-2 px-3 text-center">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {filteredTrips.map((trip) => {
                        const isSelected = selectedQueueTripId === trip.id;
                        const isChecked = selectedTripIds.includes(trip.id);
                        const pickupTimeStr = trip.scheduledPickupTime
                          ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : 'ASAP';

                        const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';

                        return (
                          <tr
                            key={trip.id}
                            onClick={() => {
                              // Single click: show route without zooming in
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(false);
                            }}
                            onDoubleClick={() => {
                              // Double click: open edit tab and zoom in on map route
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(true);
                              handleOpenEditTrip(trip);
                              setActiveMobileTab('booking');
                            }}
                            className={`cursor-pointer transition-colors ${
                              isUnconfirmedTrip
                                ? 'bg-amber-50/70 border-l-4 border-l-amber-500 hover:bg-amber-100/70'
                                : isSelected
                                ? 'bg-blue-50 font-medium hover:bg-blue-50/70'
                                : isChecked
                                ? 'bg-blue-50/40 hover:bg-blue-50/70'
                                : 'hover:bg-blue-50/70'
                            }`}
                            title="Click to view route on map. Double-click to edit trip & zoom in."
                          >
                            <td className="py-2 px-3 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectTrip(trip.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-700">
                              {pickupTimeStr}
                            </td>
                            <td className="py-2 px-3 font-medium">
                              {trip.passenger.firstName} {trip.passenger.lastName}
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                <span>{trip.passenger.phone}</span>
                                {trip.passenger.phone && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartCall(trip.passenger.phone, `${trip.passenger.firstName} ${trip.passenger.lastName}`);
                                      setCommsInitialTab('phone');
                                      setActiveDockTab('phone');
                                    }}
                                    className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                                    title="Click-to-Call Passenger via WebRTC Softphone"
                                  >
                                    <PhoneIcon className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 truncate max-w-[160px]" title={trip.pickupLocation.address}>
                              {trip.pickupLocation.address}
                            </td>
                            <td className="py-2 px-3 truncate max-w-[160px]" title={trip.dropoffLocation.address}>
                              {trip.dropoffLocation.address}
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={trip.assignedDriverId || 'unassigned'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleQuickAssignDriver(trip.id, e.target.value);
                                }}
                                className={`text-xs font-semibold rounded-lg border py-1 px-2 cursor-pointer transition-colors outline-hidden focus:ring-2 focus:ring-blue-500 max-w-[155px] truncate ${
                                  trip.assignedDriverId
                                    ? 'bg-blue-50/90 text-blue-800 border-blue-200 hover:bg-blue-100/80'
                                    : 'bg-amber-50/90 text-amber-900 border-amber-300 font-bold hover:bg-amber-100/80'
                                }`}
                                title="Quick-assign driver to this trip"
                              >
                                <option value="unassigned">⚠️ Unassigned</option>
                                {drivers.map((drv) => (
                                  <option key={drv.id} value={drv.id}>
                                    {drv.name} ({drv.status === 'available' ? 'Available' : drv.status === 'on_trip' ? 'On Trip' : 'Offline'})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <span className="capitalize px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                {trip.vehicleTier || 'Standard'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                            </td>
                            <td className="py-2 px-3">{getStatusBadge(trip.status)}</td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {isUnconfirmedTrip && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenReviewModal(trip);
                                    }}
                                    className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center gap-1 animate-pulse"
                                    title="Review and Accept or Decline customer web booking"
                                  >
                                    <span>Review</span>
                                    <span>📋</span>
                                  </button>
                                )}
                                 <TripActionDropdown
                                   trip={trip}
                                   isUnconfirmed={isUnconfirmedTrip}
                                   isOpen={openTripActionId === trip.id}
                                   isDesktop={isDesktop}
                                   onToggle={() => setOpenTripActionId(openTripActionId === trip.id ? null : trip.id)}
                                   onClose={() => setOpenTripActionId(null)}
                                   onReview={() => handleOpenReviewModal(trip)}
                                   onEdit={() => {
                                     setSelectedQueueTripId(trip.id);
                                     setSelectedMapTrip(trip);
                                     setShouldZoomMap(true);
                                     handleOpenEditTrip(trip);
                                     setActiveMobileTab('booking');
                                   }}
                                   onFare={() => handleOpenDriverModal(trip)}
                                   onAudit={() => setAuditTrailTrip(trip)}
                                   onClone={() => {
                                     handleCloneBooking(trip);
                                     setActiveMobileTab('booking');
                                   }}
                                   onFocusMap={() => {
                                     setSelectedQueueTripId(trip.id);
                                     setSelectedMapTrip(trip);
                                     setShouldZoomMap(true);
                                     setActiveMobileTab('map');
                                   }}
                                   onCancelTrip={() => handlePromptCancelTrip(trip)}
                                   onReactivateTrip={() => handleReactivateTrip(trip)}
                                 />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredTrips.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-500 font-semibold text-xs">
                            No trips found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── FULL-SCREEN MOBILE OPERATIONS TABS (lg:hidden) ─── */}
        {/* 1. Mobile Drivers Roster Page */}
        {activeMobileTab === 'drivers' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/60 lg:hidden">
            {/* Header */}
            <div className="py-3 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-2xs">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 tracking-tight">Drivers Roster</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {drivers.filter((d) => d.status === 'available').length} Avail
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Fleet availability &amp; live assignment</p>
                </div>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="p-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0 shadow-2xs">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <MagnifyingGlassIcon className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Search drivers by name, vehicle, zone, phone..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
                />
                {driverSearch && (
                  <button
                    type="button"
                    onClick={() => setDriverSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status Segmented Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 overflow-x-auto no-scrollbar">
                {(['all', 'available', 'on_trip', 'offline'] as const).map((filterKey) => {
                  const count =
                    filterKey === 'all'
                      ? drivers.length
                      : drivers.filter((d) => d.status === filterKey).length;
                  const isActive = driverFilter === filterKey;
                  return (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setDriverFilter(filterKey)}
                      className={`flex-1 min-w-[70px] shrink-0 py-1.5 text-center rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        isActive
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="capitalize">{filterKey.replace('_', ' ')}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                          isActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-200/70 text-slate-600'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drivers List */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs pb-24">
              {drivers
                .filter((d) => {
                  if (driverFilter !== 'all' && d.status !== driverFilter) return false;
                  if (driverSearch.trim()) {
                    const q = driverSearch.toLowerCase();
                    return (
                      d.name.toLowerCase().includes(q) ||
                      d.vehicle.toLowerCase().includes(q) ||
                      d.zone.toLowerCase().includes(q) ||
                      d.phone.toLowerCase().includes(q)
                    );
                  }
                  return true;
                })
                .map((driver) => {
                  return (
                    <div
                      key={driver.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-black text-sm flex items-center justify-center border border-slate-200 shrink-0">
                            {driver.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">{driver.name}</span>
                              {driver.driverScore !== undefined && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                  ★ {driver.driverScore}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-medium">
                              {driver.vehicle} • <span className="font-semibold text-slate-700">{driver.tier}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {driver.status === 'available' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Available
                            </span>
                          ) : driver.status === 'on_trip' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              On Trip
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Offline
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 py-1.5 px-3 bg-slate-50/80 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">📍 Zone:</span>
                          <span className="font-bold text-slate-800">{driver.zone}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMobileTab('phone');
                            handleStartCall(driver.phone);
                          }}
                          className="font-mono text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                          <span>{driver.phone}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleAssignDriverToDraft(driver);
                            setActiveMobileTab('booking');
                          }}
                          className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Assign to Draft</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDrivers((prev) =>
                              prev.map((d) =>
                                d.id === driver.id
                                  ? {
                                      ...d,
                                      status:
                                        d.status === 'available'
                                          ? 'offline'
                                          : d.status === 'offline'
                                          ? 'available'
                                          : 'available',
                                    }
                                  : d
                              )
                            );
                          }}
                          className="py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Toggle Status</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* 2. Mobile Comms Hub Page (Omnichannel View: All / Phone / Messages / Voicemail) */}
        <div
          className={`flex-1 flex-col h-full overflow-hidden bg-slate-50/60 lg:hidden pb-16 ${
            activeMobileTab === 'comms' || activeMobileTab === 'messages' || activeMobileTab === 'phone'
              ? 'flex'
              : 'hidden'
          }`}
        >
          <CommsHub
            user={user}
            drivers={drivers}
            trips={trips}
            initialTab={activeMobileTab === 'phone' ? 'phone' : activeMobileTab === 'messages' ? 'messages' : 'all'}
            onPopulateBooking={(payload) => {
              setActiveMobileTab('booking');
              setDrafts((prev) => {
                const target = prev.find((d) => d.id === activeDraftId) || prev[0];
                if (!target) return prev;
                const currentForm = target.formValues || ({} as any);
                const updatedForm: DispatchFormValues = {
                  ...currentForm,
                  passengerName: payload.passengerName || currentForm.passengerName || '',
                  passengerPhone: payload.passengerPhone || currentForm.passengerPhone || '',
                  pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
                  dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
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

        {/* ─── C. RIGHT DOCKED OPERATIONAL PANEL (DESKTOP SINGLE ACTIVE VIEW) ─── */}
        <aside
          className={`relative bg-slate-100 border-l border-slate-200 flex-col shrink-0 h-full overflow-hidden z-20 shadow-2xl animate-in slide-in-from-right duration-250 ease-out ${
            activeDockTab !== 'none' ? 'hidden lg:flex' : 'hidden'
          }`}
          style={{ width: `${operationsWidth}px` }}
        >
            {/* Horizontal Resize Drag Handle on Left Edge */}
            <div
              onMouseDown={handleOperationsMouseDown}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 transition-colors z-30 group select-none"
              title="Drag to resize Operations Panel width"
            >
              <div className="w-[1px] h-full bg-slate-300 group-hover:bg-blue-500 mx-auto" />
            </div>

            {/* Master Header with Tab Switchers & Actions */}
            <div className="h-10 px-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 text-xs shadow-2xs pl-4 gap-2">
              {/* Tab Switcher Pills: Phone | Email | Drivers */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setCommsInitialTab('phone');
                    setActiveDockTab('phone');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeDockTab === 'phone' || (activeDockTab === 'comms' && commsInitialTab === 'phone')
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Phone Hub: Calls, SMS, Voicemail"
                >
                  <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Phone</span>
                  {activeCallStatus !== 'idle' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDockTab('email')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeDockTab === 'email'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Email Console: Requests, Bookings, Receipts"
                >
                  <MailIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Email</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDockTab('drivers')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeDockTab === 'drivers'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Drivers Roster"
                >
                  <CarIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Drivers</span>
                  <span
                    className={`text-[10px] font-bold px-1 py-0.1 rounded-full ${
                      activeDockTab === 'drivers' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {drivers.filter((d) => d.status === 'available').length}
                  </span>
                </button>
              </div>

              {/* Action Buttons: Pop-out and Close Dock */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeDockTab === 'phone' || activeDockTab === 'comms') getWorkspaceBus().popOutModule('comms');
                    else if (activeDockTab === 'email') getWorkspaceBus().popOutModule('email');
                    else if (activeDockTab === 'drivers') getWorkspaceBus().popOutModule('drivers');
                    else getWorkspaceBus().popOutModule('trips');
                  }}
                  title="Pop out this view into separate desktop window"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDockTab('none')}
                  className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-600 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                  title="Close dock (Return to Main)"
                >
                  <span>✕ Close</span>
                </button>
              </div>
            </div>

            {/* Active Panel Viewport: Occupies Full Height */}
            <div ref={operationsContainerRef} className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white">
              {/* 1. PHONE / COMMUNICATIONS HUB */}
              {(activeDockTab === 'phone' || activeDockTab === 'comms' || activeCallStatus !== 'idle') && (
                <div className={`flex-1 flex-col h-full overflow-hidden ${
                  activeDockTab === 'phone' || activeDockTab === 'comms' ? 'flex' : 'hidden'
                }`}>
                  <CommsHub
                    user={user}
                    drivers={drivers}
                    trips={trips}
                    initialTab={commsInitialTab}
                    isPopout={false}
                    onPopOut={() => getWorkspaceBus().popOutModule('comms')}
                    onClose={() => setActiveDockTab('none')}
                    onPopulateBooking={(payload) => {
                      setDrafts((prev) => {
                        const target = prev.find((d) => d.id === activeDraftId) || prev[0];
                        if (!target) return prev;
                        const currentForm = target.formValues || ({} as any);
                        const updatedForm: DispatchFormValues = {
                          ...currentForm,
                          passengerName: payload.passengerName || currentForm.passengerName || '',
                          passengerPhone: payload.passengerPhone || currentForm.passengerPhone || '',
                          pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
                          dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
                          internalNotes: payload.notes
                            ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
                            : currentForm.internalNotes,
                        };
                        return prev.map((item) => (item.id === target.id ? { ...item, formValues: updatedForm } : item));
                      });
                    }}
                  />
                </div>
              )}

              {/* 2. EMAIL DOCK CONSOLE */}
              {activeDockTab === 'email' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <EmailDock
                    onClose={() => setActiveDockTab('none')}
                    onPopOut={() => getWorkspaceBus().popOutModule('email')}
                    showWindowControls={false}
                    onPopulateBooking={(payload) => {
                      setDrafts((prev) => {
                        const target = prev.find((d) => d.id === activeDraftId) || prev[0];
                        if (!target) return prev;
                        const currentForm = target.formValues || ({} as any);
                        const updatedForm: DispatchFormValues = {
                          ...currentForm,
                          passengerName: payload.passenger?.fullName || payload.passengerName || currentForm.passengerName || '',
                          passengerPhone: payload.passenger?.phone || payload.passengerPhone || currentForm.passengerPhone || '',
                          pickupAddress: payload.pickupAddress || currentForm.pickupAddress || '',
                          dropoffAddress: payload.dropoffAddress || currentForm.dropoffAddress || '',
                          internalNotes: payload.notes
                            ? `${currentForm.internalNotes ? currentForm.internalNotes + '\n' : ''}${payload.notes}`
                            : currentForm.internalNotes,
                        };
                        return prev.map((item) => (item.id === target.id ? { ...item, formValues: updatedForm } : item));
                      });
                    }}
                  />
                </div>
              )}

              {/* 2. DRIVERS ROSTER */}
              {activeDockTab === 'drivers' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Filter tabs */}
                  <div className="p-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1 text-xs shrink-0">
                    {(['all', 'available', 'on_trip', 'offline'] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => setDriverFilter(filterKey)}
                        className={`flex-1 py-1 text-center rounded-lg font-bold capitalize transition-all cursor-pointer ${
                          driverFilter === filterKey ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {filterKey.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  {/* Drivers List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
                    {drivers
                      .filter((d) => (driverFilter === 'all' ? true : d.status === driverFilter))
                      .map((driver) => {
                        let badge = <Badge variant="success">Available</Badge>;
                        if (driver.status === 'on_trip') badge = <Badge variant="info">On Trip</Badge>;
                        if (driver.status === 'offline') badge = <Badge variant="neutral">Offline</Badge>;

                        return (
                          <div
                            key={driver.id}
                            className="p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all space-y-2 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-extrabold text-slate-900 text-sm">{driver.name}</span>
                                <span className="text-xs text-slate-500 ml-2">
                                  {driver.vehicle} ({driver.tier})
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {driver.driverScore !== undefined && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" title="Driver Score">
                                    ★ {driver.driverScore}
                                  </span>
                                )}
                                {badge}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
                              <div>📍 {driver.zone}</div>
                              <button
                                type="button"
                                onClick={() => {
                                  setCommsInitialTab('phone');
                                  setActiveDockTab('phone');
                                  handleStartCall(driver.phone, driver.name);
                                }}
                                className="font-mono text-blue-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <PhoneIcon className="w-3 h-3 text-blue-600" />
                                <span>{driver.phone}</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleAssignDriverToDraft(driver)}
                                className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition-colors cursor-pointer"
                              >
                                Assign to Active Draft
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDrivers((prev) =>
                                    prev.map((d) =>
                                      d.id === driver.id
                                        ? {
                                            ...d,
                                            status:
                                              d.status === 'available'
                                                ? 'offline'
                                                : d.status === 'offline'
                                                ? 'available'
                                                : 'available',
                                          }
                                        : d
                                    )
                                  );
                                }}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 cursor-pointer"
                              >
                                Toggle
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 3. FLEET ALERTS & BROADCASTS */}
              {activeDockTab === 'alerts' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Space-Saving Tactical Presets Dropdown */}
                  <div className="p-2.5 bg-slate-50 border-b border-slate-200 space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                        ⚡ Tactical Broadcast Presets
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
                        <option value="__add_custom__">➕ Create New Preset (Admin)...</option>
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
                          <option value="All Drivers">📢 All Drivers</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.name}>
                              {d.name}
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
                          <option value="urgent">🚨 Urgent</option>
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
                        📌 Pinned ({pinnedAlertsCount})
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-slate-500 font-medium">⏳ Retention:</span>
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

      {/* Driver Fare Adjustment & Permitted Rules Modal */}
      {driverModalTrip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-sm">⚡ Driver Fare Console</span>
                  <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    Trip #{driverModalTrip.id.slice(-6).toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Passenger: {driverModalTrip.passenger?.firstName} {driverModalTrip.passenger?.lastName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDriverModalTrip(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Trip Snapshot */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pickup</div>
                <div className="text-slate-800 font-medium truncate" title={driverModalTrip.pickupLocation.address}>
                  {driverModalTrip.pickupLocation.address}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Dropoff</div>
                <div className="text-slate-800 font-medium truncate" title={driverModalTrip.dropoffLocation.address}>
                  {driverModalTrip.dropoffLocation.address}
                </div>
              </div>
              <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-600 font-medium">
                  Current Trip Total Fare:
                </span>
                <span className="text-sm font-extrabold text-blue-700 font-mono">
                  ${driverModalTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            {/* Tabs: Permitted Rule vs Manual Flat Override */}
            <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setDriverFareTab('rule')}
                className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
                  driverFareTab === 'rule'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Apply Permitted Rule
              </button>
              <button
                type="button"
                onClick={() => setDriverFareTab('flat')}
                className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
                  driverFareTab === 'flat'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Flat Fare Override
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              {driverFareTab === 'rule' ? (
                <div className="space-y-3">
                  <p className="text-slate-600 text-xs">
                    Select an authorized pricing rule permitted for in-cab or on-trip driver selection:
                  </p>

                  {driverPermittedRules.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-center text-xs">
                      No pricing rules are currently flagged for driver selection in the Admin Rates Tab.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {driverPermittedRules.map((rule) => {
                        const isSelected = selectedDriverRuleId === rule.id;
                        return (
                          <div
                            key={rule.id}
                            onClick={() => setSelectedDriverRuleId(rule.id)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/70 shadow-2xs'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{rule.name}</span>
                              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-100 text-blue-800">
                                {rule.modifier.type === 'flat_override'
                                  ? `$${rule.modifier.value.toFixed(2)} Flat`
                                  : rule.modifier.type === 'multiplier'
                                  ? `${rule.modifier.value}x Multiplier`
                                  : rule.modifier.type === 'surcharge_flat'
                                  ? `+$${rule.modifier.value.toFixed(2)}`
                                  : `+${rule.modifier.value}%`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">{rule.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedDriverRuleId && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs">
                      <span className="font-bold">Calculated Preview: </span>
                      {(() => {
                        const r = driverPermittedRules.find((x) => x.id === selectedDriverRuleId);
                        if (!r) return null;
                        let calc = driverModalTrip.pricing?.totalFare || 0;
                        if (r.modifier.type === 'flat_override') calc = r.modifier.value;
                        else if (r.modifier.type === 'multiplier') calc = calc * r.modifier.value;
                        else if (r.modifier.type === 'surcharge_flat') calc = calc + r.modifier.value;
                        else if (r.modifier.type === 'surcharge_percent') calc = calc * (1 + r.modifier.value / 100);
                        return (
                          <span className="font-bold font-mono text-emerald-700">
                            New Fare: ${calc.toFixed(2)}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-600 text-xs">
                    Manually override the total fare for this trip. This will be recorded with driver audit metadata:
                  </p>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Flat Fare Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={driverManualFare}
                      onChange={(e) => setDriverManualFare(e.target.value)}
                      placeholder="e.g. 45.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Reason / Notes (Optional)</label>
                    <input
                      type="text"
                      value={driverOverrideReason}
                      onChange={(e) => setDriverOverrideReason(e.target.value)}
                      placeholder="e.g. Severe weather detour, agreed customer flat"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDriverModalTrip(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              {driverFareTab === 'rule' ? (
                <button
                  type="button"
                  disabled={!selectedDriverRuleId || isApplyingDriverFare}
                  onClick={handleApplyDriverPricingRule}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                >
                  {isApplyingDriverFare ? 'Applying...' : 'Apply Rule to Trip'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!driverManualFare || isApplyingDriverFare}
                  onClick={handleApplyDriverFlatOverride}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                >
                  {isApplyingDriverFare ? 'Applying...' : 'Apply Flat Fare'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DISPATCHER REVIEW ACTION MODAL (UNCONFIRMED Bookings)
      ───────────────────────────────────────────────────────────── */}
      {reviewTrip && (() => {
        const tripMeta = (reviewTrip.metadata || {}) as Record<string, any>;
        const carSeatsBreakdown = (tripMeta.carSeatsBreakdown || {}) as {
          rearFacing?: number;
          frontFacing?: number;
          booster?: number;
        };
        const bookerName = tripMeta.bookerName ? String(tripMeta.bookerName) : null;
        const bookerPhone = tripMeta.bookerPhone ? String(tripMeta.bookerPhone) : null;
        const corporateOrgName = tripMeta.corporateOrgName ? String(tripMeta.corporateOrgName) : null;
        const flightNumber = tripMeta.flightNumber ? String(tripMeta.flightNumber) : null;
        const airline = tripMeta.airline ? String(tripMeta.airline) : '';
        const luggageType = tripMeta.luggageType ? String(tripMeta.luggageType) : 'Standard';
        const oversizedLuggageNotes = tripMeta.oversizedLuggageNotes ? String(tripMeta.oversizedLuggageNotes) : null;
        const hasOversizedLuggage = Boolean(tripMeta.hasOversizedLuggage);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-bold text-xl flex items-center justify-center shadow-md">
                    📋
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold tracking-tight">Review Web Booking</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wider animate-pulse">
                        Pending Review
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      Trip #{reviewTrip.id} • Created {new Date(reviewTrip.createdAt || Date.now()).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewTrip(null)}
                  className="text-slate-400 hover:text-white text-lg w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Notification alert banner */}
              {reviewAlert && (
                <div
                  className={`px-5 py-3 text-xs font-bold flex items-center gap-2 ${
                    reviewAlert.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                      : 'bg-red-50 text-red-800 border-b border-red-200'
                  }`}
                >
                  <span>{reviewAlert.type === 'success' ? '✓' : '⚠️'}</span>
                  <span>{reviewAlert.message}</span>
                </div>
              )}

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
                {/* Customer & Route Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Passenger Card */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Customer Details</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {reviewTrip.passenger.firstName} {reviewTrip.passenger.lastName}
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">📞</span>
                        <a href={`tel:${reviewTrip.passenger.phone}`} className="hover:underline font-mono text-blue-600">
                          {reviewTrip.passenger.phone}
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">✉️</span>
                        <a href={`mailto:${reviewTrip.passenger.email}`} className="hover:underline font-mono text-blue-600">
                          {reviewTrip.passenger.email}
                        </a>
                      </div>
                      {bookerName && (
                        <div className="pt-1 text-[11px] text-slate-500">
                          <span className="font-semibold">Booker:</span> {bookerName} ({bookerPhone || 'No phone'})
                        </div>
                      )}
                      {corporateOrgName && (
                        <div className="pt-1 text-[11px] text-slate-500">
                          <span className="font-semibold">Corporate:</span> {corporateOrgName}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timing & Vehicle */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Schedule & Vehicle</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
                        ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
                        : 'Immediate Dispatch (ASAP)'}
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <div>
                        <span className="font-semibold">Vehicle Class: </span>
                        <span className="capitalize font-bold text-slate-800">{reviewTrip.vehicleTier || 'Standard Sedan'}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Estimated Fare: </span>
                        <span className="font-mono font-extrabold text-emerald-700 text-sm">
                          ${reviewTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>{' '}
                        <span className="text-[10px] text-slate-500 uppercase">({reviewTrip.payment?.method || 'Cash'})</span>
                      </div>
                      {flightNumber && (
                        <div className="text-[11px] text-blue-700 font-semibold">
                          ✈️ Flight: {airline} #{flightNumber}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Route */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Route</div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-800">Pickup: </span>
                        <span className="text-slate-700">{reviewTrip.pickupLocation.address}</span>
                      </div>
                    </div>
                    {reviewTrip.intermediateStops && reviewTrip.intermediateStops.length > 0 && (
                      <div className="pl-4 space-y-1 text-[11px] text-slate-600 border-l-2 border-slate-200 ml-1">
                        {reviewTrip.intermediateStops.map((stop, i) => (
                          <div key={i}>Stop {i + 1}: {stop.address}</div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-800">Dropoff: </span>
                        <span className="text-slate-700">{reviewTrip.dropoffLocation.address}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Equipment & Child Seats Breakdown */}
                <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2">
                  <div className="font-bold text-amber-900 uppercase tracking-wider text-[10px] flex items-center justify-between">
                    <span>Safety Equipment & Luggage Specification</span>
                    <span className="font-mono text-amber-700">
                      Passengers: {reviewTrip.passenger.passengerCount} • Luggage: {reviewTrip.passenger.luggageCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Infant (Rear)</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {carSeatsBreakdown.rearFacing ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Toddler (Front)</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {carSeatsBreakdown.frontFacing ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Youth Booster</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {carSeatsBreakdown.booster ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Luggage Type</div>
                      <div className="font-bold text-xs capitalize text-slate-900 truncate">
                        {luggageType}
                      </div>
                    </div>
                  </div>
                  {hasOversizedLuggage && oversizedLuggageNotes && (
                    <div className="p-2 bg-white rounded-lg border border-amber-200 text-[11px] text-amber-900">
                      <span className="font-bold">Oversized Cargo: </span>
                      {oversizedLuggageNotes}
                    </div>
                  )}
                  {reviewTrip.passenger.specialRequests && (
                    <div className="p-2 bg-white rounded-lg border border-amber-200 text-[11px] text-slate-700">
                      <span className="font-bold">Special Requests: </span>
                      {reviewTrip.passenger.specialRequests}
                    </div>
                  )}
                </div>

                {/* Decline View (if toggled) */}
                {reviewDeclineMode && (
                  <div className="p-4 bg-red-50 rounded-xl border border-red-200 space-y-3 animate-in fade-in duration-100">
                    <div className="font-bold text-red-900 flex items-center justify-between">
                      <span>Select Reason for Declining Booking</span>
                      <span className="text-[10px] text-red-700">Passenger will receive notification email</span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        'No driver availability',
                        'Outside service boundary',
                        'Vehicle class unavailable',
                        'Custom message',
                      ].map((reason) => (
                        <label
                          key={reason}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                            selectedDeclineReason === reason
                              ? 'bg-white border-red-400 font-bold text-red-950 shadow-2xs'
                              : 'bg-red-50/50 border-red-100 text-red-800 hover:bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="declineReason"
                            value={reason}
                            checked={selectedDeclineReason === reason}
                            onChange={(e) => setSelectedDeclineReason(e.target.value)}
                            className="text-red-600 focus:ring-red-500"
                          />
                          <span>{reason}</span>
                        </label>
                      ))}
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        {selectedDeclineReason === 'Custom message'
                          ? 'Custom Explanation (Required for passenger email):'
                          : 'Additional Notes / Guidance (Optional):'}
                      </label>
                      <textarea
                        rows={2}
                        value={reviewCustomNotes}
                        onChange={(e) => setReviewCustomNotes(e.target.value)}
                        placeholder={
                          selectedDeclineReason === 'Custom message'
                            ? 'Explain why this ride request cannot be serviced...'
                            : 'Optional note to customer...'
                        }
                        className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Actions Footer */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setReviewTrip(null)}
                  disabled={isProcessingReview}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Close
                </button>

                <div className="flex items-center gap-2">
                  {!reviewDeclineMode ? (
                    <>
                      <button
                        type="button"
                        disabled={isProcessingReview}
                        onClick={() => setReviewDeclineMode(true)}
                        className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Decline...
                      </button>
                      <button
                        type="button"
                        disabled={isProcessingReview}
                        onClick={handleConfirmTrip}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isProcessingReview ? (
                          <>
                            <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                            <span>Confirming...</span>
                          </>
                        ) : (
                          <>
                            <span>✓ Confirm & Accept Booking</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isProcessingReview}
                        onClick={() => setReviewDeclineMode(false)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={
                          isProcessingReview ||
                          (selectedDeclineReason === 'Custom message' && !reviewCustomNotes.trim())
                        }
                        onClick={handleDeclineTrip}
                        className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingReview ? (
                          <>
                            <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                            <span>Declining...</span>
                          </>
                        ) : (
                          <>
                            <span>Send Rejection & Decline Trip</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Audit Trail Drawer Modal */}
      {auditTrailTrip && (
        <TripAuditModal
          trip={auditTrailTrip}
          onClose={() => setAuditTrailTrip(null)}
        />
      )}

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
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                {drafts.length}
              </span>
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
            ) : messages.length > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                {messages.length}
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
              {drivers.filter((d) => d.status === 'available').length}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Live Google Map Stage
// ─────────────────────────────────────────────────────────────
interface LiveDispatchMapProps {
  activeFormValues?: DispatchFormValues;
  activeTrip?: Trip | null;
  selectedTrip?: Trip | null;
  shouldZoom?: boolean;
}

function LiveDispatchMap({
  activeFormValues,
  activeTrip,
  selectedTrip,
  shouldZoom = false,
}: LiveDispatchMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const mockPolylineRef = useRef<google.maps.Polyline | null>(null);

  // Initialize Map
  useEffect(() => {
    let isMounted = true;
    loadGoogleMaps()
      .then((gMaps) => {
        if (!isMounted || !gMaps || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new gMaps.maps.Map(mapContainerRef.current, {
            center: { lat: CHESTERFIELD_CENTER.lat, lng: CHESTERFIELD_CENTER.lng },
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
          });

          directionsRendererRef.current = new gMaps.maps.DirectionsRenderer({
            map: mapInstanceRef.current,
            suppressMarkers: false,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: '#2563eb',
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });
        }
      })
      .catch((err) => {
        console.warn('[LiveDispatchMap] Initialization failed:', err);
      });

    return () => {
      isMounted = false;
      if (directionsRendererRef.current) {
        try {
          directionsRendererRef.current.setMap(null);
        } catch {}
        directionsRendererRef.current = null;
      }
      if (mockPolylineRef.current) {
        try {
          mockPolylineRef.current.setMap(null);
        } catch {}
        mockPolylineRef.current = null;
      }
      if (mapInstanceRef.current && typeof google !== 'undefined' && google?.maps?.event) {
        try {
          google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Route Polyline based on selected queue trip or active draft (debounced 800ms & trigger guarded)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    let origin: any = null;
    let destination: any = null;
    let waypoints: any[] = [];

    // Priority 1: User explicitly clicked or double-clicked a trip in queue table
    if (selectedTrip?.pickupLocation?.address && selectedTrip?.dropoffLocation?.address) {
      origin = selectedTrip.pickupLocation.coordinates || selectedTrip.pickupLocation.address;
      destination = selectedTrip.dropoffLocation.coordinates || selectedTrip.dropoffLocation.address;
      waypoints = (selectedTrip.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    }
    // Priority 2: Active form values in active draft tab
    else if (activeFormValues?.pickupAddress && activeFormValues?.dropoffAddress) {
      origin = activeFormValues.pickupCoordinates || activeFormValues.pickupAddress;
      destination = activeFormValues.dropoffCoordinates || activeFormValues.dropoffAddress;
      waypoints = (activeFormValues.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    }
    // Priority 3: Active trip from edit draft
    else if (activeTrip?.pickupLocation?.address && activeTrip?.dropoffLocation?.address) {
      origin = activeTrip.pickupLocation.coordinates || activeTrip.pickupLocation.address;
      destination = activeTrip.dropoffLocation.coordinates || activeTrip.dropoffLocation.address;
      waypoints = (activeTrip.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    }

    // Offline / Developer Mock Mode: Zero Google Directions API cost
    if (!COMPANY_CONFIG.enableRealtimeRouting) {
      try {
        directionsRendererRef.current?.setDirections({ routes: [] } as any);
      } catch {}

      if (mockPolylineRef.current) {
        mockPolylineRef.current.setMap(null);
        mockPolylineRef.current = null;
      }

      if (origin && destination && window.google?.maps?.Polyline) {
        const originCoord = resolveMockCoordinates(origin);
        const destCoord = resolveMockCoordinates(destination);
        const wpCoords = waypoints.map((w) => resolveMockCoordinates(w.location));
        const path = [originCoord, ...wpCoords, destCoord];

        mockPolylineRef.current = new window.google.maps.Polyline({
          path,
          strokeColor: '#2563eb',
          strokeWeight: 5,
          strokeOpacity: 0.85,
          map: mapInstanceRef.current,
        });

        if (shouldZoom && window.google?.maps?.LatLngBounds) {
          const bounds = new window.google.maps.LatLngBounds();
          path.forEach((pt) => bounds.extend(pt));
          mapInstanceRef.current.fitBounds(bounds);
        }
      }
      return;
    }

    // Clean up mock polyline when live routing is enabled
    if (mockPolylineRef.current) {
      mockPolylineRef.current.setMap(null);
      mockPolylineRef.current = null;
    }

    // Trigger Guard: Ensure both endpoints have valid place_id or Lat/Lng coordinates
    if (!origin || !destination || !hasValidRoutePair(origin, destination)) {
      try {
        directionsRendererRef.current?.setDirections({ routes: [] } as any);
      } catch {}
      return;
    }

    if (typeof window.google?.maps?.DirectionsService !== 'function' || !directionsRendererRef.current) {
      return;
    }

    // 800ms debounce quiet period before calling Google Directions API
    const timer = setTimeout(() => {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && directionsRendererRef.current) {
            directionsRendererRef.current.setOptions({
              preserveViewport: !shouldZoom,
            });
            directionsRendererRef.current.setDirections(result);

            if (shouldZoom && result?.routes?.[0]?.bounds && mapInstanceRef.current) {
              mapInstanceRef.current.fitBounds(result.routes[0].bounds);
            }
          }
        }
      );
    }, 800);

    return () => {
      clearTimeout(timer);
    };
  }, [activeFormValues, activeTrip, selectedTrip, shouldZoom]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
