import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { type AdminUser } from '../core/services/auth/admin-auth.service';
import {
  getAdminConfigService,
  normalizeDispatchConsoleConfig,
} from '../core/services/config/admin-config.service';
import { getBookingService } from '../core/services/booking';
import type { AppSettings } from '../core/types/config';
import type { Trip } from '../core/types/trip';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import type { DispatchFormValues } from '../components/domain/dispatch/DispatchBookingEngine';
import type { DispatchBookingFeedback } from '../components/domain/dispatch/booking/useDispatchBookingSubmission';
import type { DateTimeRange } from '../components/domain/dispatch/CustomDateTimePicker';
import { SpinnerIcon, MapIcon, AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from '../components/ui/Icons';
import { useDisplayLayout } from '../core/hooks/useDisplayLayout';
import { useWakeLock } from '../core/hooks/useWakeLock';
import { usePushNotifications } from '../core/hooks/usePushNotifications';
import { getWorkspaceBus } from '../core/services/workspace-bus.service';
import { soundNotificationService } from '../core/services/sound-notification.service';
import type { DriverRosterItem } from '../core/services/operator.service';
import { DriverQueueWindow } from '../components/domain/dispatch/DriverQueueWindow';
import { ClientProfileWindow } from '../components/domain/dispatch/ClientProfileWindow';
import type { DispatchUniversalTripActions } from '../components/domain/dispatch/TripActionDropdown';
import { DispatchStagedPlannerModals } from '../components/domain/dispatch/StagedDriverConflictModal';
import { useDispatchFleet, type LiveFleetDriver } from '../core/hooks/useDispatchFleet';
import { useBottomSheetDragToClose } from '../core/hooks/useBottomSheetDragToClose';
import { DispatchLiveMapPane } from '../components/domain/dispatch/DispatchLiveMapPane';
import { DispatchTripQueuePane, DispatchTripQueueSheets, type QueueFilterType } from '../components/domain/dispatch/DispatchTripQueuePane';
import { DispatchDriverRosterPane, DispatchDriverSheets } from '../components/domain/dispatch/DispatchDriverRosterPane';
import { sendDispatchContextualTripEmail } from '../core/services/dispatch/dispatch-trip-email.util';
import { DEFAULT_ZONES } from '../core/services/zones/zone.service';
import type { ZoneGeofence } from '../core/types/zone';
import {
  DEFAULT_ACTIVE_ONLY_STATUS_FILTER, cloneTripToDispatchFormValues, filterDispatchQueueTrips,
  getDateRangeButtonLabel, mergePopulateBookingIntoDraftForm, useDispatchFleetAlerts,
  useDispatchPanelResize, useDispatchSlaCascadeLoop, useDispatchStagedPlanner,
  useDispatchTripTriageActions, useDispatchWorkspaceSync, useLiveClockNowMs, useSyncDraftLocationsToMap,
  type ConfirmModalConfigState, type DesktopDockTab, type DispatchMobileTab, type DraftTab,
} from '../core/hooks/dispatch';
import {
  DispatchDesktopTopHeader,
  DispatchLeftBookingSidebar,
  DispatchNavigationShell,
  DispatchRightOperationsDock,
} from '../components/domain/dispatch/workspace';

const CommsHub = React.lazy(() =>
  import('../components/domain/dispatch/CommsHub').then((m) => ({ default: m.CommsHub }))
);
const EmailDock = React.lazy(() =>
  import('../components/domain/dispatch/EmailDock').then((m) => ({ default: m.EmailDock }))
);
const DispatchTripDetailsDrawer = React.lazy(() =>
  import('../components/domain/dispatch/DispatchTripDetailsDrawer').then((m) => ({
    default: m.DispatchTripDetailsDrawer,
  }))
);

export type { DriverRosterItem, DesktopDockTab };

export function meta() {
  return [
    { title: 'Dispatch Console – Chesterfield Taxi' },
    { name: 'description', content: 'Tactical split-screen dispatch dashboard' },
  ];
}

const DISPATCH_WAKE_LOCK_STORAGE_KEY = 'ct_dispatch_wake_lock';

export default function DispatchRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTripId = searchParams.get('tripId');

  // Auth & Settings state (deterministic SSR defaults)
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(() =>
    getAdminConfigService().getCachedSettings()
  );
  const consoleCfg = normalizeDispatchConsoleConfig(settings.dispatchConsoleConfig, settings.enableRealtimeRouting);

  // Trips & Geofence Zones real-time state
  const [trips, setTrips] = useState<Trip[]>([]);
  const [dispatchZones, setDispatchZones] = useState<ZoneGeofence[]>(() => [...DEFAULT_ZONES]);
  const [slaUrgentOnlyFilter, setSlaUrgentOnlyFilter] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    consoleCfg.defaultQueueStatusFilter === 'all' ? 'all' : DEFAULT_ACTIVE_ONLY_STATUS_FILTER
  );
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [pillFilter] = useState<
    'all' | 'unconfirmed' | 'pending' | 'assigned' | 'completed' | 'cancelled' | 'unassigned'
  >('all');
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

  // Unread counters (deterministic 0 on SSR, hydrated in useEffect)
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [missedCallsCount, setMissedCallsCount] = useState<number>(0);
  const [unreadEmailCount, setUnreadEmailCount] = useState<number>(0);

  // Dispatcher Review, Driver Fare & Complete Trip Modal States
  const [reviewTrip, setReviewTrip] = useState<Trip | null>(null);
  const [reviewOpenSeq, setReviewOpenSeq] = useState<number>(0);
  const [reviewModalTab, setReviewModalTab] = useState<'details' | 'audit'>('details');
  const [queueDriver, setQueueDriver] = useState<DriverRosterItem | null>(null);
  const [driverModalTrip, setDriverModalTrip] = useState<Trip | null>(null);
  const [driverModalOpenSeq, setDriverModalOpenSeq] = useState<number>(0);
  const [completeTripTarget, setCompleteTripTarget] = useState<Trip | null>(null);
  const [completeModalOpenSeq, setCompleteModalOpenSeq] = useState<number>(0);
  const [confirmModalConfig, setConfirmModalConfig] = useState<ConfirmModalConfigState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {},
  });

  // Custom DateTime Range Picker & Filter Pills State
  const [dateTimeRange, setDateTimeRange] = useState<DateTimeRange>({
    startDate: '',
    endDate: '',
    startTime: { hour: '12', minute: '00', period: 'AM' },
    endTime: { hour: '11', minute: '59', period: 'PM' },
    presetKey: 'all_time',
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerTriggerRef = useRef<HTMLDivElement>(null);
  const [isAddFilterOpen, setIsAddFilterOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const addFilterRef = useRef<HTMLDivElement>(null);
  const [activeFilterKeys, setActiveFilterKeys] = useState<QueueFilterType[]>([]);
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>('all');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [selectedTariffFilter, setSelectedTariffFilter] = useState<string>('all');

  // Draft Tabs & Mobile Navigation State
  const maxDrafts = consoleCfg.maxConcurrentDraftTabs;
  const hasHydratedClientTabsRef = useRef(false);
  const [drafts, setDrafts] = useState<DraftTab[]>([{ id: 'new-1', isNew: true }]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState<number>(2);
  const [isTabOverflowOpen, setIsTabOverflowOpen] = useState(false);
  const tabOverflowRef = useRef<HTMLDivElement>(null);

  const handleDraftValuesChange = useCallback((draftId: string, vals: DispatchFormValues) => {
    setDrafts((prev) => {
      const target = prev.find((item) => item.id === draftId);
      if (!target || target.formValues === vals) return prev;
      return prev.map((item) => (item.id === draftId ? { ...item, formValues: vals } : item));
    });
  }, []);

  // Operational Right Dock, Audio, Wake Lock & Push Notifications
  const [commsInitialTab, setCommsInitialTab] = useState<'all' | 'phone' | 'messages' | 'voicemail'>('all');
  const [commsActiveTab, setCommsActiveTab] = useState<'all' | 'phone' | 'messages' | 'voicemail'>('all');
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const alertsDropdownRef = useRef<HTMLDivElement>(null);
  const operationsContainerRef = useRef<HTMLDivElement>(null);

  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);
  const toggleSoundMuted = useCallback(() => {
    const nextMuted = soundNotificationService.toggleMute();
    setIsSoundMuted(nextMuted);
    if (!nextMuted) {
      soundNotificationService.playAsapRideChime();
    }
  }, []);

  const [showDeviceSettingsMenu, setShowDeviceSettingsMenu] = useState(false);
  const deviceSettingsMenuRef = useRef<HTMLDivElement>(null);
  const [keepScreenAwake, setKeepScreenAwake] = useState<boolean>(false);

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

  // Live Fleet, Toast & Extracted Workspace Hooks
  const { fleet: drivers, setDriverDutyStatus } = useDispatchFleet(trips);
  const [driverFilter, setDriverFilter] = useState<
    'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline'
  >('all');
  const [driverSearch, setDriverSearch] = useState('');
  const [focusedMapDriverId, setFocusedMapDriverId] = useState<string | null>(null);
  const [dispatchToast, setDispatchToast] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isBatchAssignOpen, setIsBatchAssignOpen] = useState(false);
  const [batchAssignDriverId, setBatchAssignDriverId] = useState<string>('');

  const showDispatchToast = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      setDispatchToast({ type, text });
    },
    []
  );

  useEffect(() => {
    return getWorkspaceBus().subscribe((msg) => {
      if (msg.type === 'DISPATCH_TOAST' && msg.payload?.text) {
        setDispatchToast({ type: msg.payload.type || 'info', text: msg.payload.text });
      }
    });
  }, []);

  useEffect(() => {
    if (!dispatchToast) return;
    const t = setTimeout(() => setDispatchToast(null), 4000);
    return () => clearTimeout(t);
  }, [dispatchToast]);

  const {
    sidebarWidth,
    setSidebarWidth,
    queueHeight,
    setQueueHeight,
    operationsWidth,
    setOperationsWidth,
    activeDockTab,
    setActiveDockTab,
    activeResizeHandle,
    isDesktop,
    handleSidebarMouseDown,
    handleQueueMouseDown,
    handleOperationsMouseDown,
  } = useDispatchPanelResize();

  const fleetAlerts = useDispatchFleetAlerts({ settings, user });

  const {
    slaSummary,
    readyForAutoDispatchTrips,
    isRunningReadySweep,
    handleStartAutoOffer,
    handleCancelAutoOffer,
    handleRunAutoDispatchSweep,
    handleToggleAutoPilotPause,
    handleUpdateDispatchLeadWindows,
    autoOfferStartedIdsRef,
    autoOfferContextRef,
  } = useDispatchSlaCascadeLoop({
    trips,
    setTrips,
    setReviewTrip,
    drivers,
    dispatchZones,
    settings,
    setSettings,
    user,
    showDispatchToast,
    onPublishTacticalAlert: fleetAlerts.pushSystemAlert,
  });

  // Softphone HUD & Mobile View State
  const [dialedNumber, setDialedNumber] = useState('');
  const [activeCallStatus, setActiveCallStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [activeCallMeta, setActiveCallMeta] = useState<{
    contactName: string;
    phoneNumber: string;
    duration: number;
  } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCallAlert, setIncomingCallAlert] = useState<{
    from: string;
    callSid?: string;
  } | null>(null);

  const [displayLayout, setDisplayLayout] = useDisplayLayout('ct_dispatch_layout', consoleCfg.defaultQueueLayout);
  const [workspaceLayout, setWorkspaceLayout] = useState<'compact' | 'split' | 'popout'>('compact');
  const [activeMobileTab, setActiveMobileTab] = useState<DispatchMobileTab>('queue');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [openTripActionId, setOpenTripActionId] = useState<string | null>(null);
  const [mobileCardGestureMode, setMobileCardGestureMode] = useState<
    'action_sheet' | 'multi_select'
  >('action_sheet');
  const [mobileActionSheetTrip, setMobileActionSheetTrip] = useState<Trip | null>(null);
  const [mobileActionSheetDriver, setMobileActionSheetDriver] = useState<LiveFleetDriver | null>(
    null
  );
  const [driverPickerTrip, setDriverPickerTrip] = useState<Trip | null>(null);
  const [driverPickerSearch, setDriverPickerSearch] = useState('');
  const [driverPickerFilter, setDriverPickerFilter] = useState<'all' | 'available' | 'busy'>('all');
  const [mobileFleetView, setMobileFleetView] = useState<'drivers' | 'map'>('drivers');

  const handleDismissActiveDispatchSheet = useCallback(() => {
    if (driverPickerTrip) setDriverPickerTrip(null);
    else if (isBatchAssignOpen) setIsBatchAssignOpen(false);
    else if (mobileActionSheetDriver) setMobileActionSheetDriver(null);
    else if (mobileActionSheetTrip) setMobileActionSheetTrip(null);
    else if (isTabOverflowOpen) setIsTabOverflowOpen(false);
  }, [
    driverPickerTrip,
    isBatchAssignOpen,
    mobileActionSheetDriver,
    mobileActionSheetTrip,
    isTabOverflowOpen,
  ]);

  const dispatchSheetDrag = useBottomSheetDragToClose({
    onClose: handleDismissActiveDispatchSheet,
    disabled: isDesktop,
  });

  // Draft Tab Creation, Cloning, Closing & Editing
  const populateActiveDraftFromPayload = useCallback(
    (payload: any, targetDraftId?: string) => {
      setActiveMobileTab('booking');
      setDrafts((prev) => {
        const target = prev.find((d) => d.id === (targetDraftId || activeDraftId)) || prev[0];
        if (!target) return prev;
        const updatedForm = mergePopulateBookingIntoDraftForm(target.formValues, payload);
        return prev.map((item) =>
          item.id === target.id ? { ...item, formValues: updatedForm } : item
        );
      });
    },
    [activeDraftId]
  );

  const createDraft = () => {
    if (drafts.length >= maxDrafts) {
      showDispatchToast(`Maximum of ${maxDrafts} drafts allowed. Close a tab first.`, 'info');
      return;
    }
    const newDraft: DraftTab = { id: `new-${nextDraftIdx}`, isNew: true };
    setDrafts([...drafts, newDraft]);
    setActiveDraftId(newDraft.id);
    setNextDraftIdx((n) => n + 1);
  };

  const handleCloneBookingToNewDraft = (clonedValues: DispatchFormValues) => {
    if (drafts.length >= maxDrafts) {
      showDispatchToast(
        `Maximum of ${maxDrafts} tabs open. Please close a tab before cloning.`,
        'info'
      );
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

    setDrafts((prev) => [...prev, { id: newId, isNew: true, formValues: safeClonedValues }]);
    setActiveDraftId(newId);
    setReviewTrip(null);
    setActiveMobileTab('booking');
    showDispatchToast('Trip copied to new booking tab.', 'info');
  };

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

  const handleOpenEditTrip = (trip: Trip) => {
    const existingEdit = drafts.find(
      (d) => !d.isNew && (d.trip?.id === trip.id || d.tripId === trip.id)
    );
    if (existingEdit) {
      if (!existingEdit.trip) {
        setDrafts((prev) => prev.map((d) => (d.id === existingEdit.id ? { ...d, trip } : d)));
      }
      setActiveDraftId(existingEdit.id);
      return;
    }
    if (drafts.length >= maxDrafts) {
      showDispatchToast(
        `Maximum of ${maxDrafts} tabs open. Please close a tab before editing.`,
        'info'
      );
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

  const handleCloneBooking = (trip: Trip) => {
    handleCloneBookingToNewDraft(cloneTripToDispatchFormValues(trip));
  };

  const {
    handleBatchConfirmTrips,
    handleBatchAssignDriver,
    handleQuickAssignDriver,
    handleConfirmBatchAssign,
    handleBatchCompleteTrips,
    handleBatchExportCsv,
    handleBatchCancelTrips,
    handlePromptCancelTrip,
    handleReactivateTrip,
    handleSignOut,
    handleAssignDriverToDraft,
    handleReorderDriverQueue,
    handleStartCall,
  } = useDispatchTripTriageActions({
    trips,
    setTrips,
    drivers,
    settings,
    selectedTripIds,
    setSelectedTripIds,
    batchAssignDriverId,
    setBatchAssignDriverId,
    setIsBatchAssignOpen,
    setReviewTrip,
    setConfirmModalConfig,
    activeDraftId,
    setDrafts,
    dialedNumber,
    setDialedNumber,
    setActiveCallStatus,
    handleStartAutoOffer,
    showDispatchToast,
  });

  const handleOpenReviewModal = useCallback(
    (trip: Trip, initialTab: 'details' | 'audit' = 'details') => {
      setReviewTrip(trip);
      setReviewModalTab(initialTab);
      setReviewOpenSeq((seq) => seq + 1);
    },
    []
  );

  useDispatchWorkspaceSync({
    navigate,
    urlTripId,
    maxDrafts,
    trips,
    setTrips,
    drafts,
    setDrafts,
    activeDraftId,
    setActiveDraftId,
    nextDraftIdx,
    setNextDraftIdx,
    hasHydratedClientTabsRef,
    activeMobileTab,
    setActiveMobileTab,
    setMobileFleetView,
    mobileCardGestureMode,
    setMobileCardGestureMode,
    setUser,
    setIsAuthChecking,
    setSettings,
    setDispatchZones,
    setIsSoundMuted,
    setKeepScreenAwake,
    setUnreadMessagesCount,
    setMissedCallsCount,
    setUnreadEmailCount,
    setActiveDockTab,
    setCommsInitialTab,
    setCommsActiveTab,
    setIsMobileDrawerOpen,
    setIsSearchExpanded,
    searchInputRef,
    isTabOverflowOpen,
    setIsTabOverflowOpen,
    tabOverflowRef,
    isAddFilterOpen,
    setIsAddFilterOpen,
    addFilterRef,
    isLayoutDropdownOpen,
    setIsLayoutDropdownOpen,
    layoutDropdownRef,
    showDeviceSettingsMenu,
    setShowDeviceSettingsMenu,
    deviceSettingsMenuRef,
    showAlertsDropdown,
    setShowAlertsDropdown,
    alertsDropdownRef,
    setSelectedQueueTripId,
    setSelectedMapTrip,
    setShouldZoomMap,
    activeCallStatus,
    setActiveCallStatus,
    setActiveCallMeta,
    setCallDuration,
    setIncomingCallAlert,
    populateActiveDraftFromPayload,
    onOpenEditTrip: handleOpenEditTrip,
    onOpenReviewModal: handleOpenReviewModal,
    autoOfferContextRef,
    autoOfferStartedIdsRef,
  });

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
      if (typeof window !== 'undefined' && hasHydratedClientTabsRef.current) {
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

  const handleOpenDriverModal = useCallback((trip: Trip) => {
    setDriverModalTrip(trip);
    setDriverModalOpenSeq((seq) => seq + 1);
  }, []);

  const handleOpenCompleteTripModal = useCallback((trip: Trip) => {
    setCompleteTripTarget(trip);
    setCompleteModalOpenSeq((seq) => seq + 1);
  }, []);

  const clockNowMs = useLiveClockNowMs(30_000);
  const filteredTrips = useMemo(
    () =>
      filterDispatchQueueTrips({
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
        nowMs: clockNowMs,
      }),
    [
      trips, statusFilter, pillFilter, dateTimeRange, filterStartDate, filterEndDate,
      activeFilterKeys, selectedDriverFilter, selectedVehicleFilter, selectedTariffFilter,
      selectedCompanyFilter, selectedPaymentFilter, searchTerm, slaUrgentOnlyFilter, slaSummary, clockNowMs,
    ]
  );

  const allFilteredSelected =
    filteredTrips.length > 0 && filteredTrips.every((t) => selectedTripIds.includes(t.id));
  const someFilteredSelected =
    filteredTrips.some((t) => selectedTripIds.includes(t.id)) && !allFilteredSelected;

  const stagedPlanner = useDispatchStagedPlanner({
    trips,
    filteredTrips,
    readyForAutoDispatchTrips,
    setTrips,
    setReviewTrip,
    drivers,
    dispatchZones,
    settings,
    user,
    selectedTripIds,
    setSelectedTripIds,
    batchAssignDriverId,
    setBatchAssignDriverId,
    setIsBatchAssignOpen,
    rawConfirmBatchAssign: handleConfirmBatchAssign,
    rawStartAutoOffer: handleStartAutoOffer,
    rawRunAutoDispatchSweep: handleRunAutoDispatchSweep,
    showDispatchToast,
  });

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

  const activeDraft = drafts.find((d) => d.id === activeDraftId);
  useSyncDraftLocationsToMap({
    activeDraft,
    setSelectedMapTrip,
    setSelectedQueueTripId,
    setShouldZoomMap,
  });

  // Ref-backed stable callbacks for memoized sub-panes
  const panelCallbacksRef = useRef({
    trips,
    activeDraftId,
    handleDraftValuesChange,
    handleOpenEditTrip,
    handleQuickAssignDriver,
    handleStartCall,
    handleCloneBookingToNewDraft,
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
    setDriverDutyStatus,
    showDispatchToast,
  };

  const stableDraftValuesChange = useCallback((draftId: string, vals: DispatchFormValues) => {
    panelCallbacksRef.current.handleDraftValuesChange(draftId, vals);
  }, []);

  const stableDraftBookingSuccess = useCallback(
    (draftId: string, savedTrip: Trip, isEdit: boolean, feedback?: DispatchBookingFeedback) => {
      const shortTripNo = savedTrip.id.slice(-6).toUpperCase();
      const paxName =
        `${savedTrip.passenger?.firstName || ''} ${savedTrip.passenger?.lastName || ''}`.trim() ||
        'Passenger';
      const autoClear = normalizeDispatchConsoleConfig(
        getAdminConfigService().getCachedSettings().dispatchConsoleConfig
      ).autoClearFormAfterCreate;
      if (feedback?.emailToastText && !isEdit) {
        panelCallbacksRef.current.showDispatchToast(
          feedback.emailToastType === 'success'
            ? `Booked Trip #${shortTripNo} (${paxName}) · ${feedback.emailToastText}`
            : feedback.emailToastText,
          feedback.emailToastType || 'info'
        );
      } else if (savedTrip.multiCarGroupId && (savedTrip.multiCarTotal || 1) > 1) {
        panelCallbacksRef.current.showDispatchToast(
          `${isEdit ? 'Split into' : 'Created'} ${savedTrip.multiCarTotal} linked trips (${savedTrip.multiCarGroupId}) — assign each car individually.`,
          'success'
        );
      } else if (isEdit) {
        panelCallbacksRef.current.showDispatchToast(`Trip #${shortTripNo} updated.`, 'success');
      } else {
        panelCallbacksRef.current.showDispatchToast(
          `Booked Trip #${shortTripNo} (${paxName})${autoClear ? ' — form cleared for next booking.' : '.'}`,
          'success'
        );
      }
      if (isEdit) {
        try { localStorage.removeItem(`chesterfield_dispatch_draft_${draftId}`); } catch {}
        setDrafts((prev) => prev.map((item) => (item.id === draftId ? { ...item, trip: savedTrip } : item)));
      } else {
        if (autoClear) {
          try { localStorage.removeItem(`chesterfield_dispatch_draft_${draftId}`); } catch {}
          setDrafts((prev) => prev.map((item) => (item.id === draftId ? { ...item, formValues: undefined } : item)));
        }
        setSelectedQueueTripId(savedTrip.id);
        setSelectedMapTrip(savedTrip);
        setShouldZoomMap(true);
        if (
          !savedTrip.plannedDriverId &&
          autoOfferContextRef.current.autoOfferOnConfirm &&
          autoOfferContextRef.current.isEligibleForAutoPilot(savedTrip)
        ) {
          void autoOfferContextRef.current.handleStartAutoOffer(savedTrip);
        }
      }
    },
    [autoOfferContextRef]
  );

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
  const stableSwitchToRoster = useCallback(() => setActiveMobileTab('drivers'), []);
  const stableAssignDriverToTrip = useCallback((tripId: string, driverId: string) => {
    void panelCallbacksRef.current.handleQuickAssignDriver(tripId, driverId);
  }, []);
  const stableOpenDriverQueue = useCallback((drv: DriverRosterItem) => setQueueDriver(drv), []);
  const stableCallDriverFromMap = useCallback((phone: string, name?: string) => {
    void panelCallbacksRef.current.handleStartCall(phone, name);
  }, []);
  const stableChangeDriverDutyStatus = useCallback(
    async (driverId: string, duty: 'on_duty' | 'on_break' | 'off_duty') => {
      try {
        await panelCallbacksRef.current.setDriverDutyStatus(driverId, duty);
        panelCallbacksRef.current.showDispatchToast(
          `Driver status updated to ${
            duty === 'on_break' ? 'On Break' : duty === 'off_duty' ? 'Offline' : 'Available'
          }.`,
          'success'
        );
      } catch {
        panelCallbacksRef.current.showDispatchToast('Failed to update driver status.', 'error');
      }
    },
    []
  );
  const stableSelectMapTrip = useCallback((trip: Trip) => {
    setSelectedMapTrip(trip);
    setSelectedQueueTripId(trip.id);
    setShouldZoomMap(true);
  }, []);
  const stableClearSelectedMapTrip = useCallback(() => {
    setSelectedMapTrip(null);
    setSelectedQueueTripId(null);
  }, []);
  const stableOpenTripDetailsById = useCallback((tripId: string) => {
    const found = panelCallbacksRef.current.trips.find((t) => t.id === tripId);
    if (found) handleOpenReviewModal(found, 'details');
  }, [handleOpenReviewModal]);

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
      const target =
        prev.find((d) => d.id === panelCallbacksRef.current.activeDraftId) || prev[0];
      if (!target) return prev;
      const updatedForm = mergePopulateBookingIntoDraftForm(target.formValues, payload);
      return prev.map((item) =>
        item.id === target.id ? { ...item, formValues: updatedForm } : item
      );
    });
  }, []);

  const stableEditTripFromWorkspace = useCallback(
    (trip: Trip) => {
      setSelectedQueueTripId(trip.id);
      setSelectedMapTrip(trip);
      setShouldZoomMap(true);
      handleOpenEditTrip(trip);
      setActiveMobileTab('booking');
    },
    [handleOpenEditTrip]
  );
  const stableFocusTripOnMapFromWorkspace = useCallback((trip: Trip) => {
    setSelectedQueueTripId(trip.id);
    setSelectedMapTrip(trip);
    setShouldZoomMap(true);
    setActiveMobileTab('map');
  }, []);
  const stableCloneTripFromWorkspace = useCallback(
    (trip: Trip) => {
      handleCloneBooking(trip);
      setActiveMobileTab('booking');
    },
    [handleCloneBooking]
  );
  const stableOpenDriverPickerFromWorkspace = useCallback((trip: Trip) => {
    setDriverPickerSearch('');
    setDriverPickerFilter('all');
    setDriverPickerTrip(trip);
  }, []);

  const universalTripActions = useMemo<DispatchUniversalTripActions>(
    () => ({
      onReview: handleOpenReviewModal,
      onEdit: stableEditTripFromWorkspace,
      onFare: handleOpenDriverModal,
      onClone: stableCloneTripFromWorkspace,
      onFocusMap: stableFocusTripOnMapFromWorkspace,
      onStartAutoOffer: stagedPlanner.requestAutoOfferWithStagedCheck,
      onCancelAutoOffer: handleCancelAutoOffer,
      onOpenDriverPicker: stableOpenDriverPickerFromWorkspace,
      onCompleteTrip: handleOpenCompleteTripModal,
      onCancelTrip: handlePromptCancelTrip,
      onReactivateTrip: handleReactivateTrip,
      stagedPlanner,
    }),
    [
      handleOpenReviewModal, stableEditTripFromWorkspace, handleOpenDriverModal, stableCloneTripFromWorkspace,
      stableFocusTripOnMapFromWorkspace, stagedPlanner, handleCancelAutoOffer, stableOpenDriverPickerFromWorkspace,
      handleOpenCompleteTripModal, handlePromptCancelTrip, handleReactivateTrip,
    ]
  );

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

      {/* 1. Top Header */}
      <DispatchDesktopTopHeader
        isDesktop={isDesktop}
        settings={settings}
        trips={trips}
        drivers={drivers}
        activeDockTab={activeDockTab}
        onActiveDockTabChange={setActiveDockTab}
        activeMobileTab={activeMobileTab}
        onActiveMobileTabChange={setActiveMobileTab}
        commsActiveTab={commsActiveTab}
        onCommsActiveTabChange={setCommsActiveTab}
        onCommsInitialTabChange={setCommsInitialTab}
        onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
        incomingCallAlert={incomingCallAlert}
        onDismissIncomingCallAlert={() => setIncomingCallAlert(null)}
        activeCallStatus={activeCallStatus}
        activeCallMeta={activeCallMeta}
        callDuration={callDuration}
        dialedNumber={dialedNumber}
        onForceEndCallBanner={() => {
          getWorkspaceBus().publish('CALL_ENDED', {
            durationSeconds: activeCallMeta?.duration ?? callDuration,
          });
          setActiveCallStatus('idle');
          setActiveCallMeta(null);
          setCallDuration(0);
        }}
        unreadMessagesCount={unreadMessagesCount}
        missedCallsCount={missedCallsCount}
        unreadEmailCount={unreadEmailCount}
        onHudOpenEditTrip={(tripId) => {
          const found =
            trips.find((t) => t.id === tripId) ||
            ({
              id: tripId,
              bookingType: 'scheduled',
              status: 'CONFIRMED',
              pickupLocation: { address: '14848 Conway Rd, Chesterfield, MO' },
              dropoffLocation: { address: 'Lambert Airport Terminal 1 (STL)' },
              passenger: { firstName: 'Sarah', lastName: 'Jenkins', phone: '(314) 532-1200' },
              pricing: { totalFare: 68.5 },
            } as Trip);
          setSelectedQueueTripId(found.id);
          setSelectedMapTrip(found);
          setShouldZoomMap(true);
          handleOpenEditTrip(found);
          setActiveMobileTab('booking');
        }}
        onHudPopulateBooking={stableCommsPopulateBooking}
        showAlertsDropdown={showAlertsDropdown}
        onShowAlertsDropdownChange={setShowAlertsDropdown}
        alertsDropdownRef={alertsDropdownRef}
        activeAndSortedMessages={fleetAlerts.activeAndSortedMessages}
        unreadAlertsCount={fleetAlerts.unreadAlertsCount}
        pinnedAlertsCount={fleetAlerts.pinnedAlertsCount}
        alertDismissMinutes={fleetAlerts.alertDismissMinutes}
        onUpdateAlertDismissMinutes={(mins) =>
          void fleetAlerts.handleUpdateAlertDismissMinutes(mins)
        }
        onMarkAllAlertsRead={fleetAlerts.handleMarkAllAlertsRead}
        onClearUnpinnedAlerts={fleetAlerts.handleClearUnpinnedAlerts}
        msgText={fleetAlerts.msgText}
        onMsgTextChange={fleetAlerts.setMsgText}
        onSendMessage={fleetAlerts.handleSendMessage}
        onTogglePinAlert={fleetAlerts.handleTogglePinAlert}
        onToggleReadAlert={fleetAlerts.handleToggleReadAlert}
        onDismissAlert={fleetAlerts.handleDismissAlert}
        isSoundMuted={isSoundMuted}
        onToggleSoundMuted={toggleSoundMuted}
        showDeviceSettingsMenu={showDeviceSettingsMenu}
        onShowDeviceSettingsMenuChange={setShowDeviceSettingsMenu}
        deviceSettingsMenuRef={deviceSettingsMenuRef}
        keepScreenAwake={keepScreenAwake}
        onToggleKeepScreenAwake={handleToggleKeepScreenAwake}
        dispatchWakeLock={dispatchWakeLock}
        dispatchPush={dispatchPush}
        user={user}
        onToggleAutoPilotPause={handleToggleAutoPilotPause}
        onUpdateLeadWindows={handleUpdateDispatchLeadWindows}
      />

      {/* 2. Slide-Out Drawer & Mobile 5-Tab Bottom Navigation */}
      <DispatchNavigationShell
        isDesktop={isDesktop}
        user={user}
        settings={settings}
        drivers={drivers}
        drafts={drafts}
        hasUnsavedDraftWork={hasUnsavedDraftWork}
        unconfirmedCount={unconfirmedCount}
        filteredTripsCount={filteredTrips.length}
        unreadMessagesCount={unreadMessagesCount}
        unreadEmailCount={unreadEmailCount}
        messagesCount={fleetAlerts.messages.length}
        activeCallStatus={activeCallStatus}
        isMobileDrawerOpen={isMobileDrawerOpen}
        onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
        activeDockTab={activeDockTab}
        onActiveDockTabChange={setActiveDockTab}
        activeMobileTab={activeMobileTab}
        onActiveMobileTabChange={setActiveMobileTab}
        mobileFleetView={mobileFleetView}
        onCommsInitialTabChange={setCommsInitialTab}
        onCommsActiveTabChange={setCommsActiveTab}
        onOpenMobileAlertsDropdown={() => setShowAlertsDropdown(true)}
        workspaceLayout={workspaceLayout}
        onWorkspaceLayoutChange={setWorkspaceLayout}
        mobileCardGestureMode={mobileCardGestureMode}
        onMobileCardGestureModeChange={setMobileCardGestureMode}
        keepScreenAwake={keepScreenAwake}
        onToggleKeepScreenAwake={handleToggleKeepScreenAwake}
        dispatchWakeLock={dispatchWakeLock}
        dispatchPush={dispatchPush}
        onSignOut={handleSignOut}
      />

      {/* 3. Main Workspace: Left Booking Sidebar + Center Map/Queue + Right Operations Dock */}
      <div className="flex-1 flex overflow-hidden relative pb-14 lg:pb-0">
        <DispatchLeftBookingSidebar
          isDesktop={isDesktop}
          sidebarWidth={sidebarWidth}
          activeMobileTab={activeMobileTab}
          activeResizeHandle={activeResizeHandle}
          onSidebarMouseDown={handleSidebarMouseDown}
          onResetSidebarWidth={() => setSidebarWidth(430)}
          drafts={drafts}
          maxDrafts={maxDrafts}
          activeDraftId={activeDraftId}
          onActiveDraftIdChange={setActiveDraftId}
          onCreateDraft={createDraft}
          onCloseDraft={closeDraft}
          isTabOverflowOpen={isTabOverflowOpen}
          onTabOverflowOpenChange={setIsTabOverflowOpen}
          tabOverflowRef={tabOverflowRef}
          sheetStyle={dispatchSheetDrag.sheetStyle}
          dragHandlers={dispatchSheetDrag.dragHandlers}
          trips={trips}
          drivers={drivers}
          dispatchAutomation={settings.dispatchAutomation}
          onValuesChangeByDraft={stableDraftValuesChange}
          onBookingSuccessByDraft={stableDraftBookingSuccess}
          onClearDraftById={stableClearDraftById}
          onCloneBooking={stableCloneBooking}
          onOpenLinkedTrip={stableOpenLinkedTrip}
          onQuickAssignDriver={handleQuickAssignDriver}
          tripActions={universalTripActions}
        />

        {/* Center Column: Map Stage + Bottom Responsive Trips Queue */}
        <div
          className={`flex-1 flex-col h-full overflow-hidden relative min-w-0 ${
            activeMobileTab === 'queue' || activeMobileTab === 'map' ? 'flex' : 'hidden lg:flex'
          }`}
        >
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
            onClearSelectedTrip={stableClearSelectedMapTrip}
            onOpenTripDetails={stableOpenTripDetailsById}
            onSwitchToRoster={stableSwitchToRoster}
          />

          <DispatchTripQueuePane
            isDesktop={isDesktop}
            queueHeight={queueHeight}
            activeMobileTab={activeMobileTab}
            settings={settings}
            drivers={drivers}
            trips={trips}
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
            dateRangeButtonLabel={getDateRangeButtonLabel(dateTimeRange)}
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
            onBatchCompleteTrips={handleBatchCompleteTrips}
            onBatchExportCsv={handleBatchExportCsv}
            onBatchCancelTrips={handleBatchCancelTrips}
            selectedQueueTripId={selectedQueueTripId}
            openTripActionId={openTripActionId}
            onOpenTripActionIdChange={setOpenTripActionId}
            mobileCardGestureMode={mobileCardGestureMode}
            onOpenMobileActionSheetTrip={setMobileActionSheetTrip}
            onOpenDriverPickerForTrip={stableOpenDriverPickerFromWorkspace}
            onSelectTripOnQueue={(trip, shouldZoom) => {
              setSelectedQueueTripId(trip.id);
              setSelectedMapTrip(trip);
              setShouldZoomMap(shouldZoom);
            }}
            onEditTripFromQueue={stableEditTripFromWorkspace}
            onFocusTripOnMapFromQueue={stableFocusTripOnMapFromWorkspace}
            onOpenReviewModal={handleOpenReviewModal}
            onOpenDriverModal={handleOpenDriverModal}
            onCloneBookingFromQueue={stableCloneTripFromWorkspace}
            onOpenCompleteTripModal={handleOpenCompleteTripModal}
            onPromptCancelTrip={handlePromptCancelTrip}
            onReactivateTrip={handleReactivateTrip}
            onQuickAssignDriver={handleQuickAssignDriver}
            onCallPassengerFromQueue={(phone, passengerFullName) => {
              void handleStartCall(phone, passengerFullName);
            }}
            slaSummary={slaSummary}
            slaUrgentOnlyFilter={slaUrgentOnlyFilter}
            onToggleSlaUrgentOnlyFilter={() => setSlaUrgentOnlyFilter((prev) => !prev)}
            onStartAutoOffer={stagedPlanner.requestAutoOfferWithStagedCheck}
            onCancelAutoOffer={handleCancelAutoOffer}
            readyAutoDispatchCount={readyForAutoDispatchTrips.length}
            isRunningAutoDispatchSweep={isRunningReadySweep}
            onRunAutoDispatchSweep={stagedPlanner.requestReadySweepWithStagedCheck}
            stagedPlanner={stagedPlanner}
          />
        </div>

        {/* Full-Screen Mobile Operations Tabs (lg:hidden) */}
        {activeMobileTab === 'drivers' && (
          <div className="relative flex-1 min-h-0 flex flex-col h-full overflow-hidden lg:hidden">
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
              onFocusMapDriver={(driverId) => {
                setFocusedMapDriverId(driverId);
                setActiveMobileTab('map');
              }}
              onCallDriver={(phone, name) => {
                setActiveMobileTab('phone');
                void handleStartCall(phone, name);
              }}
              onChangeDriverDutyStatus={setDriverDutyStatus}
              onShowToast={showDispatchToast}
            />

            <button
              type="button"
              onClick={() => setActiveMobileTab('map')}
              className="absolute bottom-3.5 right-3.5 z-30 px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-extrabold shadow-xl ring-1 ring-white/15 flex items-center gap-2 cursor-pointer transition-all"
              title="Switch to Live Fleet Map"
              aria-label="Switch to Live Fleet Map"
            >
              <MapIcon className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Live Map</span>
            </button>
          </div>
        )}

        {!isDesktop &&
          (activeMobileTab === 'comms' ||
            activeMobileTab === 'messages' ||
            activeMobileTab === 'phone') && (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white lg:hidden">
              <Suspense
                fallback={
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="text-xs font-semibold">Loading communications...</span>
                  </div>
                }
              >
                <CommsHub
                  user={user}
                  drivers={drivers}
                  trips={trips}
                  onTabChange={(tab) => {
                    setCommsActiveTab(tab);
                    if (!isDesktop) {
                      setActiveMobileTab(
                        tab === 'phone' ? 'phone' : tab === 'messages' ? 'messages' : 'comms'
                      );
                    }
                  }}
                  initialTab={
                    activeMobileTab === 'phone'
                      ? 'phone'
                      : activeMobileTab === 'messages'
                      ? 'messages'
                      : 'all'
                  }
                  onOpenEditTrip={stableCommsOpenEditTrip}
                  onOpenTripDetails={stableOpenTripDetailsById}
                  onPopulateBooking={stableCommsPopulateBooking}
                  onPopOut={() => getWorkspaceBus().popOutModule('comms')}
                />
              </Suspense>
            </div>
          )}

        {!isDesktop && activeMobileTab === 'email' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white lg:hidden">
            <Suspense
              fallback={
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <SpinnerIcon className="w-5 h-5 animate-spin text-indigo-600" />
                  <span className="text-xs font-semibold">Loading email console...</span>
                </div>
              }
            >
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
            </Suspense>
          </div>
        )}

        {/* Right Docked Operational Drawer */}
        <DispatchRightOperationsDock
          isDesktop={isDesktop}
          user={user}
          trips={trips}
          drivers={drivers}
          activeDockTab={activeDockTab}
          onActiveDockTabChange={setActiveDockTab}
          operationsWidth={operationsWidth}
          activeResizeHandle={activeResizeHandle}
          onOperationsMouseDown={handleOperationsMouseDown}
          onResetOperationsWidth={() => setOperationsWidth(400)}
          operationsContainerRef={operationsContainerRef}
          activeCallStatus={activeCallStatus}
          unreadEmailCount={unreadEmailCount}
          commsInitialTab={commsInitialTab}
          onCommsInitialTabChange={setCommsInitialTab}
          onCommsTabChange={stableCommsTabChange}
          onCommsPopOut={stableCommsPopOut}
          onCommsClose={stableCommsClose}
          onOpenEditTripById={stableCommsOpenEditTrip}
          onOpenTripDetailsById={stableOpenTripDetailsById}
          onCommsPopulateBooking={stableCommsPopulateBooking}
          onEmailPopulateBooking={() => {
            setActiveMobileTab('booking');
            showDispatchToast('Booking form populated from email!', 'success');
          }}
          driverFilter={driverFilter}
          onDriverFilterChange={setDriverFilter}
          driverSearch={driverSearch}
          onDriverSearchChange={setDriverSearch}
          onOpenDriverQueue={(driver) => setQueueDriver(driver)}
          onOpenMobileActionSheetDriver={setMobileActionSheetDriver}
          onFocusMapDriver={setFocusedMapDriverId}
          onCallDriverFromDock={(phone, name) => {
            void handleStartCall(phone, name);
          }}
          onChangeDriverDutyStatus={setDriverDutyStatus}
          onShowToast={showDispatchToast}
          tacticalPresets={fleetAlerts.tacticalPresets}
          isAddingPreset={fleetAlerts.isAddingPreset}
          onIsAddingPresetChange={fleetAlerts.setIsAddingPreset}
          newPresetText={fleetAlerts.newPresetText}
          onNewPresetTextChange={fleetAlerts.setNewPresetText}
          onSaveNewPreset={fleetAlerts.handleSaveNewPreset}
          msgRecipient={fleetAlerts.msgRecipient}
          onMsgRecipientChange={fleetAlerts.setMsgRecipient}
          msgPriority={fleetAlerts.msgPriority}
          onMsgPriorityChange={fleetAlerts.setMsgPriority}
          msgText={fleetAlerts.msgText}
          onMsgTextChange={fleetAlerts.setMsgText}
          onSendMessage={fleetAlerts.handleSendMessage}
          alertsFilter={fleetAlerts.alertsFilter}
          onAlertsFilterChange={fleetAlerts.setAlertsFilter}
          activeAndSortedMessages={fleetAlerts.activeAndSortedMessages}
          unreadAlertsCount={fleetAlerts.unreadAlertsCount}
          pinnedAlertsCount={fleetAlerts.pinnedAlertsCount}
          alertDismissMinutes={fleetAlerts.alertDismissMinutes}
          onUpdateAlertDismissMinutes={(mins) =>
            void fleetAlerts.handleUpdateAlertDismissMinutes(mins)
          }
          onMarkAllAlertsRead={fleetAlerts.handleMarkAllAlertsRead}
          onClearUnpinnedAlerts={fleetAlerts.handleClearUnpinnedAlerts}
          onTogglePinAlert={fleetAlerts.handleTogglePinAlert}
          onToggleReadAlert={fleetAlerts.handleToggleReadAlert}
          onDismissAlert={fleetAlerts.handleDismissAlert}
        />
      </div>

      {/* Trip Details, Unconfirmed Review, Fare Override, Audit Trail & Complete Trip Modals */}
      {Boolean(reviewTrip || auditTrailTrip || driverModalTrip || completeTripTarget) && (
        <Suspense
          fallback={
            <div className="fixed bottom-4 right-4 z-[210] pointer-events-none">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-4 py-3 flex items-center gap-2.5 text-xs font-bold text-slate-700">
                <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading trip details...</span>
              </div>
            </div>
          }
        >
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
            onStartAutoOffer={stagedPlanner.requestAutoOfferWithStagedCheck}
            onCancelAutoOffer={handleCancelAutoOffer}
            onPromptCancelTrip={handlePromptCancelTrip}
            onReactivateTrip={handleReactivateTrip}
            onCloneBookingFromReview={stableCloneTripFromWorkspace}
            onEditTripFromReview={stableEditTripFromWorkspace}
            onShowToast={showDispatchToast}
            stagedPlanner={stagedPlanner}
            tripActions={universalTripActions}
          />
        </Suspense>
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

      {/* Incoming-Call & CRM Client Profile Floating Window */}
      <ClientProfileWindow
        trips={trips}
        vehicles={settings.vehicles}
        drivers={drivers}
        fleetCars={settings.fleet}
        corporateAccounts={settings.corporateAccounts}
        nowMs={clockNowMs}
        onLoadTripIntoNewTab={(vals) => handleCloneBookingToNewDraft(vals)}
        onOpenTripDetails={(t) => handleOpenReviewModal(t, 'details')}
        onEditTrip={stableEditTripFromWorkspace}
        onFocusTripOnMap={stableFocusTripOnMapFromWorkspace}
        onPopulateBookingDraft={stableCommsPopulateBooking}
        onCallClient={(ph, nm) => {
          void handleStartCall(ph, nm);
        }}
      />

      {/* Universal Modeless Driver Queue Window */}
      {queueDriver && (
        <DriverQueueWindow
          driver={queueDriver}
          isOpen={Boolean(queueDriver)}
          isDesktop={isDesktop}
          onClose={() => setQueueDriver(null)}
          trips={trips}
          onReorderQueue={handleReorderDriverQueue}
          onUnassignTrip={(tripId) => handleQuickAssignDriver(tripId, 'unassigned')}
          onSendStagedTrip={stagedPlanner.sendStagedTrip}
          onUnstageTrip={(trip) => stagedPlanner.clearTripStage(trip)}
          onSendAllStagedTrips={stagedPlanner.sendAllStagedForDriver}
          onOpenEditTrip={stableCommsOpenEditTrip}
          onFocusTripOnMap={(tripId) => {
            const found = trips.find((t) => t.id === tripId);
            if (found) stableFocusTripOnMapFromWorkspace(found);
          }}
          onCallPassenger={(phone, name) => {
            void handleStartCall(phone, name);
          }}
          onAssignActiveDraft={handleAssignDriverToDraft}
          tripActions={universalTripActions}
        />
      )}

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
        onSendReceiptForTrip={(sheetTrip) =>
          sendDispatchContextualTripEmail({
            targetTrip: sheetTrip,
            drivers,
            settings,
            onToast: showDispatchToast,
          })
        }
        onReactivateTrip={handleReactivateTrip}
        onOpenDriverPickerForTrip={stableOpenDriverPickerFromWorkspace}
        onEditTripFromQueue={stableEditTripFromWorkspace}
        onCloneBookingFromQueue={stableCloneTripFromWorkspace}
        onOpenCompleteTripModal={handleOpenCompleteTripModal}
        onOpenReviewModal={handleOpenReviewModal}
        onCallPassengerFromQueue={(phone, passengerFullName) => {
          void handleStartCall(phone, passengerFullName);
          setCommsInitialTab('phone');
          setActiveDockTab('phone');
          setActiveMobileTab('phone');
        }}
        onOpenDriverModal={handleOpenDriverModal}
        onFocusTripOnMapFromQueue={stableFocusTripOnMapFromWorkspace}
        onAddTripToMultiSelect={(tripId) => {
          setSelectedTripIds((prev) => (prev.includes(tripId) ? prev : [...prev, tripId]));
        }}
        onPromptCancelTrip={handlePromptCancelTrip}
        onStartAutoOffer={stagedPlanner.requestAutoOfferWithStagedCheck}
        onCancelAutoOffer={handleCancelAutoOffer}
        stagedPlanner={stagedPlanner}
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
          void handleStartCall(phone, name);
        }}
        onAssignDriverToActiveDraftOnMobile={(driver) => {
          handleAssignDriverToDraft(driver);
          setActiveMobileTab('booking');
        }}
        onShowToast={showDispatchToast}
        stagedPlanner={stagedPlanner}
        sheetStyle={dispatchSheetDrag.sheetStyle}
        dragHandlers={dispatchSheetDrag.dragHandlers}
      />

      <DispatchStagedPlannerModals stagedPlanner={stagedPlanner} trips={trips} />

      {/* Non-Blocking Dispatch Toast Notification */}
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
