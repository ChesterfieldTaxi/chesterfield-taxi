import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { getDriverService, DEFAULT_SCHEDULE } from '../core/services/driver.service';
import type {
  DriverProfile,
  DriverDutyStatus,
  DriverMeterExtra,
  DriverScheduleConfig,
  DayOfWeek,
  DriverTimeOff,
} from '../core/types/driver';
import type { Trip, TripStatus } from '../core/types/trip';
import type { DriverAppPoliciesConfig, VehicleTierConfig } from '../core/types/config';
import type { PhysicalFleetAsset } from '../core/types/fleet';
import { getBookingService } from '../core/services/booking';
import { authorizedFetch } from '../core/services/auth/auth-headers';
import {
  DEFAULT_DRIVER_APP_POLICIES_CONFIG,
  getAdminConfigService,
  mapDriverPolicyNavToPreferredApp,
  normalizeDriverAppPoliciesConfig,
} from '../core/services/config/admin-config.service';
import { getFleetService } from '../core/services/fleet/fleet.service';
import {
  DEFAULT_TARIFF_PROFILES,
  getTariffService,
  evaluateTaximeterFare,
  resolveTariffProfile,
} from '../core/services/pricing/tariff.service';
import { formatLocalDateStr } from '../core/services/pricing/vehicle-matching';
import type { TariffProfile } from '../core/types/tariff';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { getPaymentService } from '../core/services/payment.service';
import { getPayLinkService } from '../core/services/payments/pay-link.service';
import { getTelephonyService } from '../core/services/telephony.service';
import { getInvoicingService } from '../core/services/invoicing.service';
import { getEmailDispatchService } from '../core/services/email';
import { soundNotificationService } from '../core/services/sound-notification.service';
import { pushNotificationService } from '../core/services/notifications/push-notification.service';
import type { DriverPayoutRecord, DriverSettlementMethod } from '../core/types/payment';
import {
  SpinnerIcon,
  CalendarIcon,
  CarIcon,
  ClockIcon,
  DollarSignIcon,
} from '../components/ui/Icons';
import { useDriverTelemetry } from '../core/hooks/useDriverTelemetry';
import { useDriverMultiStopProgress } from '../core/hooks/useDriverMultiStopProgress';
import { useDriverTripUpdateAck } from '../core/hooks/useDriverTripUpdateAck';
import { useWakeLock } from '../core/hooks/useWakeLock';
import { usePushNotifications } from '../core/hooks/usePushNotifications';
import { validatePhoneNumber } from '../core/utils/phone';
import { formatVehicleTierDisplay } from '../core/utils/vehicle-tier-format.util';
import { useBottomSheetDragToClose } from '../core/hooks/useBottomSheetDragToClose';
import {
  formatCabUnitLabel,
  formatStepLabel,
  isTripQuotedLocked,
  maskPhoneForDisplay,
  openMapNavigation,
  splitDriverExtras,
  type DriverTab,
  type LastStepUndoState,
  type PreferredNavApp,
  type RideFareSnapshot,
} from '../core/utils/driver-ui.util';
import { DriverShiftControls } from '../components/domain/driver/DriverShiftControls';
import { DriverOfferSheet } from '../components/domain/driver/DriverOfferSheet';
import { DriverLiveMeterCard } from '../components/domain/driver/DriverLiveMeterCard';
import { DriverPaymentTerminalModal } from '../components/domain/driver/DriverPaymentTerminalModal';
import { DriverEarningsHistoryPane } from '../components/domain/driver/DriverEarningsHistoryPane';

export {
  formatCabUnitLabel,
  openMapNavigation,
  isTripQuotedLocked,
  splitDriverExtras,
  maskPhoneForDisplay,
};
export type { PreferredNavApp, DriverTab };

export function meta() {
  return [
    { title: 'Driver App – Chesterfield Taxi' },
    { name: 'description', content: 'Mobile driver app for trips, navigation, and in-car checkout' },
  ];
}

const NAV_PREF_KEY = 'ct_driver_preferred_nav_app';
const METER_STORAGE_PREFIX = 'ct_driver_meter_v2_';

const STATUS_PRIORITY: Record<string, number> = {
  in_progress: 1,
  arrived: 2,
  en_route: 3,
  accepted: 4,
  assigned: 5,
  offered: 6,
  CONFIRMED: 7,
  confirmed: 7,
  UNCONFIRMED: 8,
  unconfirmed: 8,
  pending: 9,
};

function sortDriverTrips(list: Trip[]): Trip[] {
  return [...list].sort((a, b) => {
    const pA = STATUS_PRIORITY[a.status] || 99;
    const pB = STATUS_PRIORITY[b.status] || 99;
    if (pA !== pB) return pA - pB;
    const qA = typeof a.queueOrder === 'number' ? a.queueOrder : Number.MAX_SAFE_INTEGER;
    const qB = typeof b.queueOrder === 'number' ? b.queueOrder : Number.MAX_SAFE_INTEGER;
    if (qA !== qB) return qA - qB;
    const timeA = a.scheduledPickupTime ? new Date(a.scheduledPickupTime).getTime() : 0;
    const timeB = b.scheduledPickupTime ? new Date(b.scheduledPickupTime).getTime() : 0;
    return timeA - timeB;
  });
}

export default function DriverAppRoute() {
  const navigate = useNavigate();

  // Auth & Identity
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [driverRoles, setDriverRoles] = useState<string[]>(['driver']);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Driver & Fleet & Admin Settings
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [adminVehicles, setAdminVehicles] = useState<VehicleTierConfig[]>([]);
  const [fleetAssets, setFleetAssets] = useState<PhysicalFleetAsset[]>([]);
  const [globalCommissionRate, setGlobalCommissionRate] = useState<number>(0.75);
  const [stripeOnlineEnabled, setStripeOnlineEnabled] = useState(false);

  // Trips & Queue
  const [allDriverTrips, setAllDriverTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<DriverTab>('active');

  // Menus & Notices
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showVehiclePickerModal, setShowVehiclePickerModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [lastStepUndo, setLastStepUndo] = useState<LastStepUndoState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preferred Navigation App & Admin Driver App Policies
  const [driverAppPolicies, setDriverAppPolicies] = useState<DriverAppPoliciesConfig>(
    DEFAULT_DRIVER_APP_POLICIES_CONFIG
  );
  const [hasExplicitLocalNavPref, setHasExplicitLocalNavPref] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(NAV_PREF_KEY);
      return saved === 'google' || saved === 'apple' || saved === 'waze';
    }
    return false;
  });
  const [preferredNavApp, setPreferredNavApp] = useState<PreferredNavApp>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(NAV_PREF_KEY);
      if (saved === 'google' || saved === 'apple' || saved === 'waze') return saved;
    }
    return mapDriverPolicyNavToPreferredApp(
      getAdminConfigService().getCachedSettings().driverAppConfig?.defaultNavigationProvider
    );
  });

  // Taximeter state (persisted per tripId in sessionStorage; stationary wait tracked separately)
  const [meterSeconds, setMeterSeconds] = useState(0);
  const [meterWaitSeconds, setMeterWaitSeconds] = useState(0);
  const [meterDistance, setMeterDistance] = useState(0);
  const [tariffs, setTariffs] = useState<TariffProfile[]>(DEFAULT_TARIFF_PROFILES);

  // Modals pinned to explicit modalTripId (prevents target shifting if dispatch cancels/reassigns)
  const [modalTripId, setModalTripId] = useState<string | null>(null);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [customExtraName, setCustomExtraName] = useState('');
  const [customExtraAmount, setCustomExtraAmount] = useState('');
  const [customExtraCategory, setCustomExtraCategory] = useState<DriverMeterExtra['category']>('toll');

  const [showSmsModal, setShowSmsModal] = useState(false);
  const [customSmsText, setCustomSmsText] = useState('');
  const [isSendingTwilioSms, setIsSendingTwilioSms] = useState(false);
  const [twilioSmsFeedback, setTwilioSmsFeedback] = useState<string | null>(null);

  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowReason, setNoShowReason] = useState('Passenger no-show after 10 min wait');

  // Terminal Payment & Settlement Modal
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [settlementMethod, setSettlementMethod] = useState<DriverSettlementMethod>('card_terminal');
  const [cardLast4Input, setCardLast4Input] = useState('');
  const [tipSelection, setTipSelection] = useState<number | 'custom'>(0);
  const [customTipValue, setCustomTipValue] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [completedPayoutReceipt, setCompletedPayoutReceipt] = useState<DriverPayoutRecord | null>(null);
  const [driverPayLinkToken, setDriverPayLinkToken] = useState<string | null>(null);
  const [driverPayLinkUrl, setDriverPayLinkUrl] = useState<string | null>(null);
  const [driverPayLinkStatus, setDriverPayLinkStatus] = useState<'none' | 'open' | 'paid'>('none');
  const [isSendingDriverPayLink, setIsSendingDriverPayLink] = useState(false);
  const [driverPayLinkFeedback, setDriverPayLinkFeedback] = useState<string | null>(null);

  const driverSheetDrag = useBottomSheetDragToClose({
    onClose: () => {
      if (showTerminalModal && !isProcessingPayment && !completedPayoutReceipt) {
        setShowTerminalModal(false);
        setModalTripId(null);
      } else if (showExtrasModal) {
        setShowExtrasModal(false);
        setModalTripId(null);
      } else if (showSmsModal) {
        setShowSmsModal(false);
        setModalTripId(null);
      } else if (showNoShowModal) {
        setShowNoShowModal(false);
        setModalTripId(null);
      } else if (showVehiclePickerModal) {
        setShowVehiclePickerModal(false);
      }
    },
  });

  // Earnings & History
  const [payoutHistory, setPayoutHistory] = useState<DriverPayoutRecord[]>([]);

  // Calendar / Availability editing state with dirty guard (prevents GPS snapshots overwriting edits)
  const [scheduleConfig, setScheduleConfig] = useState<DriverScheduleConfig>(DEFAULT_SCHEDULE);
  const [isScheduleDirty, setIsScheduleDirty] = useState(false);
  const [newTimeOffStart, setNewTimeOffStart] = useState('');
  const [newTimeOffEnd, setNewTimeOffEnd] = useState('');
  const [newTimeOffReason, setNewTimeOffReason] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const driverService = getDriverService();
  const bookingService = getBookingService();

  const seenOfferIdsRef = useRef<Set<string>>(new Set());
  const isScheduleDirtyRef = useRef(false);
  isScheduleDirtyRef.current = isScheduleDirty;

  // 1. Auth Guard & Real UID Binding
  useEffect(() => {
    const authService = getAdminAuthService();
    const unsubscribe = authService.onAuthStateChanged((currentUser: any) => {
      if (!currentUser) {
        driverService.setActiveDriverId('');
        setAuthUserUid(null);
        navigate('/app/login?message=unauthenticated&redirect=/app/driver', { replace: true });
      } else {
        const roles: string[] = currentUser.roles || (currentUser.role ? [currentUser.role] : ['customer']);
        if (!roles.includes('driver') && !roles.includes('admin')) {
          navigate('/app', { replace: true });
        } else {
          driverService.setActiveDriverId(currentUser.uid);
          setAuthUserUid(currentUser.uid);
          setDriverRoles(roles);
          setIsAuthChecking(false);
        }
      }
    });
    return unsubscribe;
  }, [navigate, driverService]);

  // 2. Subscribe to Live Tariffs, Admin Settings (vehicles + commission), Fleet Assets & Stripe Status
  useEffect(() => {
    const tariffService = getTariffService();
    const unsubTariffs = tariffService.subscribeToTariffs
      ? tariffService.subscribeToTariffs((loaded) => {
          if (loaded && loaded.length > 0) setTariffs(loaded);
        })
      : undefined;

    if (!unsubTariffs) {
      tariffService
        .getTariffs()
        .then((loaded) => {
          if (loaded && loaded.length > 0) setTariffs(loaded);
        })
        .catch(() => {});
    }

    const unsubConfig = getAdminConfigService().subscribeToSettings((s) => {
      if (s.vehicles?.length) {
        setAdminVehicles(s.vehicles.filter((v) => !v.isArchived));
      }
      if (typeof s.pricing?.defaultDriverCommissionRate === 'number') {
        setGlobalCommissionRate(s.pricing.defaultDriverCommissionRate);
      }
      const nextPolicies = normalizeDriverAppPoliciesConfig(s.driverAppConfig);
      setDriverAppPolicies(nextPolicies);
    });

    getFleetService()
      .getFleet()
      .then((assets) => {
        setFleetAssets(assets.filter((a) => a.status === 'active'));
      })
      .catch(() => {});

    fetch('/api/payments')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.stripeConfigured) setStripeOnlineEnabled(true);
      })
      .catch(() => {});

    return () => {
      if (typeof unsubTariffs === 'function') unsubTariffs();
      if (typeof unsubConfig === 'function') unsubConfig();
    };
  }, []);

  // 3. Load & Subscribe to Authenticated Driver Profile (gated on authUserUid!)
  useEffect(() => {
    if (!authUserUid) return;
    let unsubDriver: (() => void) | undefined;
    let mounted = true;

    async function init() {
      try {
        setIsLoading(true);
        const profile = await driverService.getDriverProfile(authUserUid!);
        if (!mounted) return;
        setDriver(profile);
        if (profile.schedule && !isScheduleDirtyRef.current) {
          setScheduleConfig(profile.schedule);
        }
        unsubDriver = driverService.subscribeToDriver(profile.id, (updated) => {
          if (!mounted) return;
          setDriver(updated);
          if (updated.schedule && !isScheduleDirtyRef.current) {
            setScheduleConfig(updated.schedule);
          }
        });
      } catch (err) {
        console.error('[DriverApp] Failed to load driver profile:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      if (unsubDriver) unsubDriver();
    };
  }, [authUserUid, driverService]);

  // 4. Load Driver Payout History when authenticated or switching to Earnings tab
  const refreshPayoutHistory = useCallback(async () => {
    if (!authUserUid) return;
    try {
      const paymentService = getPaymentService();
      if (paymentService.getDriverPayoutHistory) {
        const records = await paymentService.getDriverPayoutHistory(authUserUid);
        setPayoutHistory(records);
      }
    } catch {}
  }, [authUserUid]);

  useEffect(() => {
    refreshPayoutHistory();
  }, [refreshPayoutHistory, currentTab]);

  // 5. Scoped Driver Real-Time Trip Subscription (Firestore `allow list` compliant!)
  useEffect(() => {
    if (!driver?.id) return;

    const handleTripsUpdate = (trips: Trip[]) => {
      setAllDriverTrips(trips);

      // Active/upcoming/offered trips for this driver (excluding rejected and assigned-to-others)
      const myLiveTrips = trips.filter((t) => {
        if (
          t.status === 'completed' ||
          t.status === 'cancelled' ||
          t.status === 'DECLINED' ||
          t.status === 'declined'
        ) {
          return false;
        }
        if (
          Array.isArray(t.rejectedByIds) &&
          t.rejectedByIds.includes(driver.id) &&
          t.assignedDriverId !== driver.id
        ) {
          return false;
        }
        if (t.assignedDriverId && t.assignedDriverId !== driver.id) {
          return false;
        }
        return t.assignedDriverId === driver.id || (t.status === 'offered' && t.offeredToIds?.includes(driver.id));
      });

      // Close pinned modals safely if dispatch cancels or reassigns that trip
      if (modalTripId && !completedPayoutReceipt) {
        const stillMine = myLiveTrips.some((t) => t.id === modalTripId);
        if (!stillMine && (showTerminalModal || showExtrasModal || showSmsModal || showNoShowModal)) {
          setShowTerminalModal(false);
          setShowExtrasModal(false);
          setShowSmsModal(false);
          setShowNoShowModal(false);
          setModalTripId(null);
          setErrorNotice('Trip was cancelled or reassigned by dispatch. Active modal closed.');
          setTimeout(() => setErrorNotice(null), 5000);
        }
      }
    };

    let unsubTrips: (() => void) | undefined;
    if (bookingService.subscribeToDriverTrips) {
      unsubTrips = bookingService.subscribeToDriverTrips(driver.id, handleTripsUpdate);
    } else if (bookingService.subscribeToAllTrips) {
      unsubTrips = bookingService.subscribeToAllTrips(handleTripsUpdate);
    }

    return () => {
      if (unsubTrips) unsubTrips();
    };
  }, [
    bookingService,
    driver?.id,
    driver?.dutyStatus,
    modalTripId,
    completedPayoutReceipt,
    showTerminalModal,
    showExtrasModal,
    showSmsModal,
    showNoShowModal,
  ]);

  // Derived categorized trips (strictly separated & memoized across 1s meter ticks!)
  const liveEligibleTrips = useMemo(
    () =>
      sortDriverTrips(
        allDriverTrips.filter((t) => {
          if (
            t.status === 'completed' ||
            t.status === 'cancelled' ||
            t.status === 'DECLINED' ||
            t.status === 'declined'
          ) {
            return false;
          }
          if (!driver?.id) return false;
          if (
            Array.isArray(t.rejectedByIds) &&
            t.rejectedByIds.includes(driver.id) &&
            t.assignedDriverId !== driver.id
          ) {
            return false;
          }
          if (t.assignedDriverId && t.assignedDriverId !== driver.id) return false;
          return t.assignedDriverId === driver.id || (t.status === 'offered' && t.offeredToIds?.includes(driver.id));
        })
      ),
    [allDriverTrips, driver?.id]
  );

  // Offers: strictly unassigned `offered` trips targeted to this driver
  const offeredTrips = useMemo(
    () =>
      liveEligibleTrips.filter(
        (t) => t.status === 'offered' && !t.assignedDriverId && t.offeredToIds?.includes(driver?.id || '')
      ),
    [liveEligibleTrips, driver?.id]
  );

  // Assigned / Accepted / En Route / Arrived / In Progress trips
  const scheduledTrips = useMemo(
    () => liveEligibleTrips.filter((t) => t.assignedDriverId === driver?.id && t.status !== 'offered'),
    [liveEligibleTrips, driver?.id]
  );

  // Completed trips for Earnings & History tab
  const completedTrips = useMemo(
    () =>
      allDriverTrips
        .filter((t) => t.assignedDriverId === driver?.id && t.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.completedAt || b.updatedAt).getTime() -
            new Date(a.completedAt || a.updatedAt).getTime()
        ),
    [allDriverTrips, driver?.id]
  );

  // Never leak unaccepted offers onto Active tab while off_duty or on_break
  const activeTrip =
    scheduledTrips.find((t) => t.id === activeTripId) ||
    scheduledTrips[0] ||
    (driver?.dutyStatus === 'on_duty' ? offeredTrips.find((t) => t.id === activeTripId) || null : null);

  const modalTrip =
    (modalTripId ? liveEligibleTrips.find((t) => t.id === modalTripId) : null) || activeTrip;

  // Keep activeTripId synced cleanly to scheduledTrips[0]
  useEffect(() => {
    if (activeTripId && liveEligibleTrips.some((t) => t.id === activeTripId)) return;
    if (scheduledTrips[0]?.id) {
      setActiveTripId(scheduledTrips[0].id);
    } else {
      setActiveTripId(null);
    }
  }, [activeTripId, liveEligibleTrips, scheduledTrips]);

  // Continuous Shift & Trip Geolocation Telemetry Engine
  const telemetry = useDriverTelemetry({
    trip: activeTrip,
    driverId: driver?.id,
    dutyStatus: driver?.dutyStatus,
    isEnabled: Boolean(
      driver &&
        (driver.dutyStatus === 'on_duty' ||
          driver.dutyStatus === 'on_break' ||
          (activeTrip && ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(activeTrip.status)))
    ),
  });

  // Phase 53: Intermediate Stop Progression & Live Free-Wait Timer Engine
  const handleMultiStopSuccess = useCallback((msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 3500);
  }, []);

  const handleMultiStopError = useCallback((msg: string) => {
    setErrorNotice(msg);
    setTimeout(() => setErrorNotice(null), 4000);
  }, []);

  const multiStop = useDriverMultiStopProgress({
    activeTrip,
    setAllDriverTrips,
    onSuccessNotice: handleMultiStopSuccess,
    onErrorNotice: handleMultiStopError,
  });

  const tripUpdateAck = useDriverTripUpdateAck({
    driverId: driver?.id,
    dutyStatus: driver?.dutyStatus,
    allDriverTrips,
    setAllDriverTrips,
    onSuccessNotice: handleMultiStopSuccess,
    onErrorNotice: handleMultiStopError,
  });

  // Sync fallback default navigation provider when driver has not chosen a local preference
  useEffect(() => {
    if (hasExplicitLocalNavPref) return;
    setPreferredNavApp(
      mapDriverPolicyNavToPreferredApp(driverAppPolicies.defaultNavigationProvider)
    );
  }, [hasExplicitLocalNavPref, driverAppPolicies.defaultNavigationProvider]);

  // Phase 34: Screen Wake Lock (honors driverAppConfig.enforceScreenWakeLockOnDuty) & Web Push Alerts
  const wakeLock = useWakeLock({
    enabled: driver?.dutyStatus === 'on_duty' && driverAppPolicies.enforceScreenWakeLockOnDuty,
  });

  const handleNotificationFocus = useCallback((url: string) => {
    if (url.startsWith('/app/driver')) {
      setCurrentTab('offers');
    }
  }, []);

  const pushNotifications = usePushNotifications({
    uid: authUserUid,
    onNavigate: handleNotificationFocus,
  });

  const handleEnablePushAlerts = useCallback(() => {
    void pushNotifications.enableAlerts();
  }, [pushNotifications]);

  const handleTogglePushAlerts = useCallback(() => {
    void pushNotifications.toggleAlerts();
  }, [pushNotifications]);

  // Phase 34: Repeating Offer Alert Chime + Background Push Notification Lifecycle
  useEffect(() => {
    if (driver?.dutyStatus !== 'on_duty' || offeredTrips.length === 0) {
      soundNotificationService.stopDriverOfferAlert();
      if (offeredTrips.length === 0) {
        seenOfferIdsRef.current.clear();
      }
      return;
    }

    const currentOfferIds = new Set(offeredTrips.map((o) => o.id));
    seenOfferIdsRef.current.forEach((id) => {
      if (!currentOfferIds.has(id)) {
        seenOfferIdsRef.current.delete(id);
      }
    });

    const unseenOffers = offeredTrips.filter((o) => !seenOfferIdsRef.current.has(o.id));
    if (unseenOffers.length > 0) {
      for (const offer of unseenOffers) {
        seenOfferIdsRef.current.add(offer.id);
        void pushNotificationService.notifyIncomingDriverOffer(offer);
      }
      if (driverAppPolicies.enableAudibleOfferChime) {
        soundNotificationService.playDriverOfferAlert();
      } else {
        soundNotificationService.stopDriverOfferAlert();
      }
    }
  }, [offeredTrips, driver?.dutyStatus, driverAppPolicies.enableAudibleOfferChime]);

  useEffect(() => {
    return () => {
      soundNotificationService.stopDriverOfferAlert();
    };
  }, []);

  // Keep fresh speedMph in a ref so the 1s meter interval NEVER captures a stale closure!
  const speedMphRef = useRef<number>(0);
  speedMphRef.current = telemetry.currentTelemetry?.speedMph || 0;

  // Hydrate persisted per-trip meter state when activeTrip switches
  useEffect(() => {
    if (!activeTrip?.id) {
      setMeterSeconds(0);
      setMeterWaitSeconds(0);
      setMeterDistance(0);
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        const savedRaw = sessionStorage.getItem(METER_STORAGE_PREFIX + activeTrip.id);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          setMeterSeconds(Number(parsed.seconds || 0));
          setMeterWaitSeconds(Number(parsed.waitSeconds || 0));
          setMeterDistance(Number(parsed.distance || 0));
          return;
        }
      } catch {}
    }

    // Fallback to persisted trip timestamps/metrics if starting on another device
    if (activeTrip.status === 'in_progress' && activeTrip.actualPickupTime) {
      const elapsedSec = Math.max(
        0,
        Math.floor((Date.now() - new Date(activeTrip.actualPickupTime).getTime()) / 1000)
      );
      setMeterSeconds(elapsedSec);
      setMeterWaitSeconds(0);
      setMeterDistance(Number(activeTrip.pricing?.meterDistanceMiles || 0));
    } else {
      setMeterSeconds(0);
      setMeterWaitSeconds(0);
      setMeterDistance(0);
    }
  }, [activeTrip?.id, activeTrip?.status]);

  // Taximeter ticker: uses speedMphRef (no stale closure), separates moving vs stationary wait time, persists per tripId
  useEffect(() => {
    if (!activeTrip?.id || activeTrip.status !== 'in_progress') return;
    const tripIdForTicker = activeTrip.id;

    const interval = setInterval(() => {
      const mph = speedMphRef.current;
      const isMoving = mph > 1.5 && mph < 110;

      setMeterSeconds((prevSec) => {
        const nextSec = prevSec + 1;
        setMeterWaitSeconds((prevWait) => {
          const nextWait = isMoving ? prevWait : prevWait + 1;
          setMeterDistance((prevDist) => {
            const nextDist = isMoving ? Number((prevDist + mph / 3600).toFixed(3)) : prevDist;
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.setItem(
                  METER_STORAGE_PREFIX + tripIdForTicker,
                  JSON.stringify({ seconds: nextSec, waitSeconds: nextWait, distance: nextDist })
                );
              } catch {}
            }
            return nextDist;
          });
          return nextWait;
        });
        return nextSec;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrip?.id, activeTrip?.status]);

  // Decision #2: Authoritative Fare Calculation (Locked Quoted Base vs Exact Tariff Taximeter)
  const computeRideFareSnapshot = useCallback(
    (trip: Trip | null): RideFareSnapshot => {
      if (!trip) {
        return {
          isQuotedLocked: true,
          baseRideFare: 0,
          tollsTotal: 0,
          nonTollExtrasTotal: 0,
          subtotalFare: 0,
          tariffName: 'Standard Quote',
        };
      }

      const { tollsTotal, nonTollExtrasTotal, allDriverExtrasTotal } = splitDriverExtras(trip);
      const locked = isTripQuotedLocked(trip);

      if (locked) {
        // Trip totalFare already includes any appended driverExtrasTotal -> subtract to get clean locked base quote
        const rawTotal = Number(trip.pricing?.totalFare || 0);
        const baseRideFare = Number(Math.max(0, rawTotal - allDriverExtrasTotal).toFixed(2));
        return {
          isQuotedLocked: true,
          baseRideFare,
          tollsTotal,
          nonTollExtrasTotal,
          subtotalFare: Number((baseRideFare + allDriverExtrasTotal).toFixed(2)),
          tariffName:
            trip.pricing?.tariffProfileName ||
            (trip.pricing?.matchedCorridorId ? 'Flat Corridor Rate' : 'Upfront Quoted Fare'),
        };
      }

      // Live GPS Taximeter (walk-up / explicitly metered rides ONLY)
      const allTariffs = tariffs.length > 0 ? tariffs : DEFAULT_TARIFF_PROFILES;
      const matchedProfile =
        (trip.pricing?.tariffProfileId
          ? allTariffs.find((t) => t.id === trip.pricing?.tariffProfileId)
          : undefined) ||
        allTariffs.find((t) => t.isActive && t.taximeter) ||
        allTariffs.find((t) => t.taximeter) ||
        DEFAULT_TARIFF_PROFILES[0];

      const resolved = resolveTariffProfile(matchedProfile, allTariffs);
      const waitMinutes = Number((meterWaitSeconds / 60).toFixed(2));
      const meterCalc = resolved?.taximeter
        ? evaluateTaximeterFare(resolved.taximeter, meterDistance, waitMinutes)
        : { subtotal: Number(trip.pricing?.totalFare || 0) };

      const baseRideFare = Number(meterCalc.subtotal.toFixed(2));
      return {
        isQuotedLocked: false,
        baseRideFare,
        tollsTotal,
        nonTollExtrasTotal,
        subtotalFare: Number((baseRideFare + allDriverExtrasTotal).toFixed(2)),
        tariffName: matchedProfile?.name || 'Standard Taximeter',
      };
    },
    [tariffs, meterDistance, meterWaitSeconds]
  );

  // Driver Duty Status Toggle (surfaces real blacklist/archive errors!)
  const handleToggleDuty = useCallback(
    async (newStatus: DriverDutyStatus) => {
      if (!driver) return;
      try {
        setActionLoading('duty');
        const updated = await driverService.setDutyStatus(newStatus, driver.id);
        setDriver(updated);
        setSuccessNotice('Shift status updated to ' + newStatus.replace('_', ' ').toUpperCase());
        setTimeout(() => setSuccessNotice(null), 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to update duty status';
        setErrorNotice(msg);
        setTimeout(() => setErrorNotice(null), 5000);
      } finally {
        setActionLoading(null);
      }
    },
    [driver, driverService]
  );

  // Shift Vehicle Selection backed by `/fleet`
  const handleSelectFleetVehicle = useCallback(
    async (asset: PhysicalFleetAsset) => {
      if (!driver) return;
      try {
        setActionLoading('vehicle');
        const updated = await driverService.setVehicleUnit(asset.unitNumber, asset.id, driver.id, {
          vehicleTier: asset.vehicleTypeId,
          vehicleMake: asset.make,
          vehicleModel: `${asset.year ? asset.year + ' ' : ''}${asset.model}`.trim(),
          vehicleColor: asset.color,
          licensePlate: asset.licensePlate,
        });
        setDriver(updated);
        setShowVehiclePickerModal(false);
        setSuccessNotice(`Clocked into ${formatCabUnitLabel(asset.unitNumber)} (${asset.make} ${asset.model})`);
        setTimeout(() => setSuccessNotice(null), 3500);
      } catch (err: unknown) {
        setErrorNotice(err instanceof Error ? err.message : 'Failed to assign vehicle.');
        setTimeout(() => setErrorNotice(null), 4000);
      } finally {
        setActionLoading(null);
      }
    },
    [driver, driverService]
  );

  // Atomic Offer Accept & Decline
  const handleAcceptOffer = useCallback(
    async (offerId: string) => {
      if (!driver) return;
      soundNotificationService.stopDriverOfferAlert();
      try {
        setActionLoading(`accept-${offerId}`);
        await driverService.acceptOffer(offerId, driver.id);
        setActiveTripId(offerId);
        setCurrentTab('active');
        setSuccessNotice('Offer accepted! Trip is now in your active queue.');
        setTimeout(() => setSuccessNotice(null), 3500);
      } catch (err: unknown) {
        setErrorNotice(err instanceof Error ? err.message : 'Offer could not be claimed.');
        setTimeout(() => setErrorNotice(null), 5000);
      } finally {
        setActionLoading(null);
      }
    },
    [driver, driverService]
  );

  const handleDeclineOffer = useCallback(
    async (offerId: string) => {
      if (!driver) return;
      soundNotificationService.stopDriverOfferAlert();
      try {
        setActionLoading(`decline-${offerId}`);
        await driverService.declineOffer(offerId, driver.id, 'Driver declined trip offer');
        setSuccessNotice('Offer declined and returned to dispatch.');
        setTimeout(() => setSuccessNotice(null), 3000);
      } catch (err: unknown) {
        setErrorNotice(err instanceof Error ? err.message : 'Failed to decline offer.');
        setTimeout(() => setErrorNotice(null), 4000);
      } finally {
        setActionLoading(null);
      }
    },
    [driver, driverService]
  );

  // Open Checkout Terminal Modal (auto-selects Corporate / Cash / Card Terminal based on booking!)
  const openCheckoutTerminalForTrip = useCallback(
    (trip: Trip) => {
      setModalTripId(trip.id);
      setCompletedPayoutReceipt(null);
      setTipSelection(0);
      setCustomTipValue('');
      setCardLast4Input(trip.payment?.cardLast4 || '');

      const method = trip.payment?.method;
      if (method === 'account' || method === 'corporate') {
        setSettlementMethod('corporate_account');
      } else if (method === 'cash') {
        setSettlementMethod('cash');
      } else if (
        stripeOnlineEnabled &&
        trip.payment?.status === 'authorized' &&
        trip.payment?.paymentIntentId &&
        /^pi_[a-zA-Z0-9]{8,64}$/.test(trip.payment.paymentIntentId)
      ) {
        setSettlementMethod('stripe_preauth');
      } else {
        setSettlementMethod('card_terminal');
      }

      setShowTerminalModal(true);
    },
    [stripeOnlineEnabled]
  );

  // Single-Tap Status Transitions (looks up targetTripId explicitly — never stale activeTrip!)
  const handleStepAction = useCallback(
    async (targetTripId: string, targetStatus: TripStatus, reason?: string) => {
      if (!driver) return;
      const targetTrip = liveEligibleTrips.find((t) => t.id === targetTripId) || null;
      const previousStatus = targetTrip?.status || null;

      if (targetStatus === 'completed') {
        if (targetTrip) openCheckoutTerminalForTrip(targetTrip);
        return;
      }

      try {
        setActionLoading(targetStatus);
        await driverService.transitionTrip(targetTripId, targetStatus, driver.id, reason);

        const telephonyService = getTelephonyService();
        if (targetTrip?.passenger?.phone) {
          const cleanUnitNum = (driver.vehicleUnit || '').replace(/^cab\s*#?/i, '').trim();
          if (targetStatus === 'en_route') {
            await telephonyService.createMaskedSession(
              targetTripId,
              driver.phone || COMPANY_CONFIG.phone.dispatch,
              targetTrip.passenger.phone
            );
            await telephonyService.sendLifecycleSms(targetTripId, 'driver_en_route', {
              passengerPhone: targetTrip.passenger.phone,
              driverName: driver.firstName || driver.name.split(' ')[0],
              vehicleUnit: cleanUnitNum || undefined,
              trackingToken: targetTrip.trackingToken,
            });
          } else if (targetStatus === 'arrived') {
            await telephonyService.sendLifecycleSms(targetTripId, 'driver_arrived', {
              passengerPhone: targetTrip.passenger.phone,
              driverName: driver.firstName || driver.name.split(' ')[0],
              vehicleUnit: cleanUnitNum || undefined,
              vehicleModel: driver.vehicleModel || 'Car',
              trackingToken: targetTrip.trackingToken,
            });
          } else if (targetStatus === 'in_progress') {
            await telephonyService.sendLifecycleSms(targetTripId, 'trip_started', {
              passengerPhone: targetTrip.passenger.phone,
            });
          }
        }

        const toLabel = formatStepLabel(targetStatus);
        if (
          previousStatus &&
          previousStatus !== targetStatus &&
          (targetStatus === 'en_route' || targetStatus === 'arrived' || targetStatus === 'in_progress')
        ) {
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          const revertTarget: TripStatus =
            previousStatus === 'en_route' || previousStatus === 'arrived' || previousStatus === 'accepted'
              ? previousStatus
              : 'assigned';
          setLastStepUndo({
            tripId: targetTripId,
            previousStatus: revertTarget,
            toLabel,
            fromLabel: formatStepLabel(revertTarget),
          });
          setSuccessNotice(null);
          undoTimerRef.current = setTimeout(() => setLastStepUndo(null), 6500);
        } else {
          setSuccessNotice('Status updated to ' + toLabel.toUpperCase());
          setTimeout(() => setSuccessNotice(null), 3000);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Action failed';
        setErrorNotice(msg);
        setTimeout(() => setErrorNotice(null), 4000);
      } finally {
        setActionLoading(null);
      }
    },
    [driver, driverService, liveEligibleTrips, openCheckoutTerminalForTrip]
  );

  // Revert Status (lets driver cleanly step back after an accidental tap without spamming duplicate SMS)
  const handleRevertStatus = useCallback(
    async (targetTripId: string, previousStatus: TripStatus) => {
      if (!driver) return;
      try {
        setActionLoading('revert');
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        setLastStepUndo(null);
        await driverService.transitionTrip(
          targetTripId,
          previousStatus,
          driver.id,
          `Driver reverted status back to ${formatStepLabel(previousStatus)}`
        );
        setSuccessNotice(`Reverted status to ${formatStepLabel(previousStatus).toUpperCase()}`);
        setTimeout(() => setSuccessNotice(null), 3000);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to revert status';
        setErrorNotice(msg);
        setTimeout(() => setErrorNotice(null), 4000);
      } finally {
        setActionLoading(null);
      }
    },
    [driver, driverService]
  );

  // Driver No-Show / Cancellation Workflow
  const handleDriverCancelOrNoShow = useCallback(async () => {
    if (!modalTrip || !driver) return;
    try {
      setActionLoading('cancel_noshow');
      await driverService.transitionTrip(
        modalTrip.id,
        'cancelled',
        driver.id,
        noShowReason.trim() || 'Driver marked passenger no-show'
      );
      await getTelephonyService().closeMaskedSession(modalTrip.id).catch(() => {});
      setShowNoShowModal(false);
      setModalTripId(null);
      setSuccessNotice('Trip marked cancelled / no-show and logged with dispatch.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Could not cancel ride.');
      setTimeout(() => setErrorNotice(null), 4000);
    } finally {
      setActionLoading(null);
    }
  }, [modalTrip, driver, driverService, noShowReason]);

  // In-Cab Payment & Settlement Processing (Decisions #2, #3, #4)
  const handleProcessTerminalPayment = useCallback(async () => {
    if (!modalTrip || !driver) return;
    try {
      setIsProcessingPayment(true);
      const paymentService = getPaymentService();
      const invoicingService = getInvoicingService();
      const telephonyService = getTelephonyService();

      const fareSnap = computeRideFareSnapshot(modalTrip);

      // Persist metered pricing back to Trip if this was a walk-up metered ride
      if (!fareSnap.isQuotedLocked) {
        await driverService.updateLiveMeter(
          modalTrip.id,
          meterDistance,
          Number((meterSeconds / 60).toFixed(1)),
          fareSnap.baseRideFare,
          { lockQuotedFare: false }
        );
      } else if (meterSeconds > 0 || meterDistance > 0) {
        await driverService.updateLiveMeter(
          modalTrip.id,
          meterDistance,
          Number((meterSeconds / 60).toFixed(1)),
          fareSnap.baseRideFare,
          { lockQuotedFare: true }
        );
      }

      // Calculate tip on subtotal
      let tipAmount = 0;
      if (tipSelection === 'custom') {
        tipAmount = Math.max(0, Number((parseFloat(customTipValue) || 0).toFixed(2)));
      } else if (typeof tipSelection === 'number' && tipSelection > 0) {
        tipAmount = Number(((fareSnap.subtotalFare * tipSelection) / 100).toFixed(2));
      }

      const grandTotal = Number((fareSnap.subtotalFare + tipAmount).toFixed(2));

      // 1. Capture / Record Settlement against REAL `modalTrip.id`
      const cleanLast4 = cardLast4Input.replace(/\D/g, '').slice(-4) || undefined;
      await paymentService.capturePayment(modalTrip.id, fareSnap.subtotalFare, tipAmount, 0, {
        settlementMethod,
        paymentIntentId: modalTrip.payment?.paymentIntentId,
        cardLast4: settlementMethod === 'card_terminal' ? cleanLast4 : undefined,
      });

      // 2. Configurable Commission Split (Decision #3: 100% pass-through ONLY for tolls + tips; Cash owes commission)
      const effectiveCommissionRate =
        typeof driver.commissionRate === 'number' ? driver.commissionRate : globalCommissionRate;

      const payout = await paymentService.calculateDriverPayout(
        modalTrip.id,
        driver.id,
        fareSnap.baseRideFare,
        tipAmount,
        fareSnap.tollsTotal,
        fareSnap.nonTollExtrasTotal,
        effectiveCommissionRate,
        settlementMethod
      );

      // 3. Balanced Local-Date Financial Ledger Entries (no UTC rollover bug!)
      const todayDate = formatLocalDateStr(new Date());
      const tripRefShort = modalTrip.id.slice(-8).toUpperCase();

      await invoicingService.recordLedgerEntry({
        date: todayDate,
        type: 'fare_revenue',
        tripId: modalTrip.id,
        driverId: driver.id,
        amount: fareSnap.subtotalFare,
        description: `Completed ${settlementMethod.replace('_', ' ')} fare – Trip #${tripRefShort}`,
        accountCode: settlementMethod === 'corporate_account' ? '1200-AccountsReceivable' : '4010-FareRevenue',
      });

      if (tipAmount > 0) {
        await invoicingService.recordLedgerEntry({
          date: todayDate,
          type: 'tip_collected',
          tripId: modalTrip.id,
          driverId: driver.id,
          amount: tipAmount,
          description: `Passenger Gratuity – Trip #${tripRefShort}`,
          accountCode: '2010-DriverTipsPayable',
        });
      }

      if (settlementMethod === 'cash') {
        await invoicingService.recordLedgerEntry({
          date: todayDate,
          type: 'platform_commission',
          tripId: modalTrip.id,
          driverId: driver.id,
          amount: payout.platformFee,
          description: `Cash Trip Company Commission Owed (${driver.name}) – Trip #${tripRefShort}`,
          accountCode: '1250-DriverCommissionReceivable',
        });
      } else {
        await invoicingService.recordLedgerEntry({
          date: todayDate,
          type: 'driver_payout',
          tripId: modalTrip.id,
          driverId: driver.id,
          amount: payout.netPayout,
          description: `Driver Settlement Payable (${driver.name}) – Trip #${tripRefShort}`,
          accountCode: '5010-DriverPayout',
        });
      }

      // 4. Completion SMS + Close Masked Telephony Proxy
      if (modalTrip.passenger?.phone) {
        await telephonyService.sendLifecycleSms(modalTrip.id, 'trip_completed', {
          passengerPhone: modalTrip.passenger.phone,
          finalFare: grandTotal,
        });
      }
      await telephonyService.closeMaskedSession(modalTrip.id);

      // 5. Transition trip to completed (after payment/tip persisted so corporate AR sees accurate tip/tolls!)
      await driverService.transitionTrip(modalTrip.id, 'completed', driver.id);

      // 6. Dispatch official itemized Post-Trip Tax Receipt Email (if passenger has email & admin enabled auto-receipts)
      const cachedSettings = getAdminConfigService().getCachedSettings();
      const autoEmailReceiptsEnabled = cachedSettings.billingSettings?.autoEmailReceipts !== false;
      if (autoEmailReceiptsEnabled && modalTrip.passenger?.email) {
        const meta = (modalTrip.metadata || {}) as Record<string, any>;
        getEmailDispatchService()
          .sendTripReceipt({
            tripId: modalTrip.id,
            completedAt: new Date().toLocaleString(),
            passenger: {
              firstName: modalTrip.passenger.firstName,
              lastName: modalTrip.passenger.lastName,
              email: modalTrip.passenger.email,
              phone: modalTrip.passenger.phone,
            },
            pickupAddress: modalTrip.pickupLocation.address,
            intermediateStops: modalTrip.intermediateStops?.map((s) => ({ address: s.address })),
            dropoffAddress: modalTrip.dropoffLocation.address,
            pickupTime:
              modalTrip.actualPickupTime || modalTrip.scheduledPickupTime
                ? new Date(
                    modalTrip.actualPickupTime || modalTrip.scheduledPickupTime!
                  ).toLocaleString()
                : new Date(modalTrip.createdAt).toLocaleString(),
            vehicleTier: modalTrip.vehicleTier,
            vehicleDisplayName:
              (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName) ||
              formatVehicleTierDisplay(modalTrip.vehicleTier, adminVehicles),
            driverName: driver.name,
            vehicleUnit: driver.vehicleUnit,
            distanceMiles:
              !fareSnap.isQuotedLocked && meterDistance > 0
                ? Number(meterDistance.toFixed(1))
                : modalTrip.pricing?.distanceMiles,
            durationMinutes:
              meterSeconds > 0
                ? Number((meterSeconds / 60).toFixed(1))
                : modalTrip.pricing?.durationMinutes,
            subtotalFare: fareSnap.subtotalFare,
            tipAmount,
            grandTotal,
            currency: modalTrip.pricing?.currency || 'USD',
            breakdown: modalTrip.pricing?.breakdown,
            tariffProfileName: fareSnap.tariffName,
            paymentMethod: settlementMethod,
            cardLast4:
              settlementMethod === 'card_terminal'
                ? cleanLast4
                : modalTrip.payment?.cardLast4,
            paymentStatus:
              settlementMethod === 'corporate_account' ? 'corporate_direct_bill' : 'paid',
            corporateAccountName:
              meta.corporateDetails?.corporateAccount || meta.corporateOrgName,
            poNumber: meta.corporateDetails?.billingPo || meta.billingPo,
            companySettings: {
              name: cachedSettings.company?.name,
              phone: cachedSettings.company?.phone,
              address: cachedSettings.company?.address,
              email: cachedSettings.company?.email,
            },
          })
          .catch((receiptErr) => {
            console.warn('[DriverHUD] Non-blocking receipt email warning:', receiptErr);
          });
      }

      // Clear session meter storage for this completed ride
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(METER_STORAGE_PREFIX + modalTrip.id);
        } catch {}
      }

      setCompletedPayoutReceipt(payout);
      await refreshPayoutHistory();
      setSuccessNotice(
        settlementMethod === 'cash'
          ? `Cash ride completed ($${grandTotal.toFixed(2)} collected). Company commission due: $${payout.platformFee.toFixed(2)}.`
          : settlementMethod === 'corporate_account'
          ? `Corporate ride completed ($${grandTotal.toFixed(2)} billed to account). Your payout: $${payout.netPayout.toFixed(2)}.`
          : `Ride completed ($${grandTotal.toFixed(2)}). Your net payout: $${payout.netPayout.toFixed(2)}.`
      );
    } catch (err: unknown) {
      console.error('[DriverApp] Settlement processing failed:', err);
      setErrorNotice(err instanceof Error ? err.message : 'Checkout transaction failed');
    } finally {
      setIsProcessingPayment(false);
    }
  }, [
    modalTrip,
    driver,
    computeRideFareSnapshot,
    driverService,
    meterDistance,
    meterSeconds,
    tipSelection,
    customTipValue,
    cardLast4Input,
    settlementMethod,
    globalCommissionRate,
    adminVehicles,
    refreshPayoutHistory,
  ]);

  useEffect(() => {
    const cachedToken = getPayLinkService().getTripCachedPayToken(modalTrip);
    setDriverPayLinkToken(cachedToken || null);
    setDriverPayLinkUrl(cachedToken ? getPayLinkService().buildPayUrl(cachedToken) : null);
    const displayState = getPayLinkService().getTripPayLinkDisplayState(modalTrip);
    setDriverPayLinkStatus(
      displayState === 'paid' ? 'paid' : displayState === 'open' ? 'open' : 'none'
    );
    setDriverPayLinkFeedback(null);
  }, [modalTrip?.id, showTerminalModal]);

  const handleRequestDriverPayLink = useCallback(
    async (mode: 'show' | 'sms') => {
      if (!modalTrip || !driver) return;
      setIsSendingDriverPayLink(true);
      setDriverPayLinkFeedback(null);
      try {
        const fareSnap = computeRideFareSnapshot(modalTrip);
        if (!fareSnap.isQuotedLocked) {
          await driverService.updateLiveMeter(
            modalTrip.id,
            meterDistance,
            Number((meterSeconds / 60).toFixed(1)),
            fareSnap.baseRideFare,
            { lockQuotedFare: false }
          );
        }

        const updatedTripForLink: Trip = {
          ...modalTrip,
          pricing: {
            ...modalTrip.pricing,
            totalFare: fareSnap.subtotalFare,
          },
        };

        const res = await getPayLinkService().createOrGetTripPayLink(updatedTripForLink, {
          sendSms: mode === 'sms',
          recipientPhone: modalTrip.passenger?.phone,
        });

        if (!res.success || !res.payLink || !res.payUrl) {
          setDriverPayLinkFeedback(res.error || 'Could not generate Pay Link.');
          return;
        }

        setDriverPayLinkToken(res.payLink.payToken);
        setDriverPayLinkUrl(res.payUrl);
        setDriverPayLinkStatus(res.payLink.status === 'paid' ? 'paid' : 'open');

        if (mode === 'show') {
          await navigator.clipboard?.writeText(res.payUrl).catch(() => {});
          setDriverPayLinkFeedback('Pay Link ready & copied — passenger can scan or open URL.');
        } else if (res.smsResult?.sent) {
          setDriverPayLinkFeedback(`Sent 1-tap Pay Link via SMS to ${maskPhoneForDisplay(modalTrip.passenger?.phone)}.`);
        } else {
          await navigator.clipboard?.writeText(res.payUrl).catch(() => {});
          setDriverPayLinkFeedback('SMS offline — Pay Link shown above & copied to clipboard.');
        }
      } catch (err: any) {
        setDriverPayLinkFeedback(err?.message || 'Unable to generate Pay Link.');
      } finally {
        setIsSendingDriverPayLink(false);
      }
    },
    [modalTrip, driver, computeRideFareSnapshot, driverService, meterDistance, meterSeconds]
  );

  const handleRefreshDriverPayLinkStatus = useCallback(async () => {
    if (!modalTrip || !driver) return;
    const token =
      driverPayLinkToken || getPayLinkService().getTripCachedPayToken(modalTrip) || '';
    if (!token) return;

    setIsSendingDriverPayLink(true);
    try {
      const check = await getPayLinkService().fetchPublicPayLink(token);
      if (!check.success || !check.payLink) {
        setDriverPayLinkFeedback(check.error || 'Could not check Pay Link status.');
        return;
      }

      if (check.payLink.status === 'paid') {
        setDriverPayLinkStatus('paid');
        const fareSnap = computeRideFareSnapshot(modalTrip);
        const onlineTip = Number(check.payLink.tipAmount || 0);
        const effectiveCommissionRate =
          typeof driver.commissionRate === 'number' ? driver.commissionRate : globalCommissionRate;
        const payout = await getPaymentService().calculateDriverPayout(
          modalTrip.id,
          driver.id,
          fareSnap.baseRideFare,
          onlineTip,
          fareSnap.tollsTotal,
          fareSnap.nonTollExtrasTotal,
          effectiveCommissionRate,
          'card_terminal'
        );
        await getTelephonyService().closeMaskedSession(modalTrip.id).catch(() => {});
        await driverService.transitionTrip(modalTrip.id, 'completed', driver.id);
        setCompletedPayoutReceipt(payout);
        await refreshPayoutHistory();
        setSuccessNotice(
          `Passenger paid $${(check.payLink.totalPaidAmount || fareSnap.subtotalFare + onlineTip).toFixed(2)} online! Your net payout: $${payout.netPayout.toFixed(2)}.`
        );
      } else {
        setDriverPayLinkFeedback('Awaiting passenger online payment...');
      }
    } catch (err: any) {
      setDriverPayLinkFeedback(err?.message || 'Error refreshing Pay Link status.');
    } finally {
      setIsSendingDriverPayLink(false);
    }
  }, [
    modalTrip,
    driver,
    driverPayLinkToken,
    computeRideFareSnapshot,
    globalCommissionRate,
    driverService,
    refreshPayoutHistory,
  ]);

  // Append Extra Fee (pinned to modalTrip + clears inputs cleanly!)
  const handleAddExtra = useCallback(
    async (extra: DriverMeterExtra) => {
      const target = modalTrip;
      if (!target) return;
      try {
        setActionLoading('extra');
        await driverService.addMeterExtra(target.id, extra);
        setCustomExtraName('');
        setCustomExtraAmount('');
        setCustomExtraCategory('toll');
        setShowExtrasModal(false);
        setModalTripId(null);
        setSuccessNotice(`Added ${extra.name} (+$${extra.amount.toFixed(2)}) to fare breakdown`);
        setTimeout(() => setSuccessNotice(null), 3000);
      } catch (e: unknown) {
        setErrorNotice(e instanceof Error ? e.message : 'Failed to add extra fee');
        setTimeout(() => setErrorNotice(null), 4000);
      } finally {
        setActionLoading(null);
      }
    },
    [modalTrip, driverService]
  );

  // Schedule / Calendar Handlers (marks dirty so GPS pings never wipe unsaved edits!)
  const handleToggleDay = useCallback((day: DayOfWeek) => {
    setIsScheduleDirty(true);
    setScheduleConfig((prev) => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          enabled: !prev.weeklyHours[day].enabled,
        },
      },
    }));
  }, []);

  const handleTimeChange = useCallback(
    (day: DayOfWeek, field: 'startHour' | 'endHour', value: string) => {
      setIsScheduleDirty(true);
      setScheduleConfig((prev) => ({
        ...prev,
        weeklyHours: {
          ...prev.weeklyHours,
          [day]: {
            ...prev.weeklyHours[day],
            [field]: value,
          },
        },
      }));
    },
    []
  );

  const handleAddTimeOff = useCallback(() => {
    if (!newTimeOffStart || !newTimeOffEnd) {
      setErrorNotice('Please select both start and end dates for time off.');
      setTimeout(() => setErrorNotice(null), 3000);
      return;
    }
    const todayLocal = formatLocalDateStr(new Date());
    if (newTimeOffStart < todayLocal) {
      setErrorNotice('Time-off start date cannot be in the past.');
      setTimeout(() => setErrorNotice(null), 3500);
      return;
    }
    if (newTimeOffEnd < newTimeOffStart) {
      setErrorNotice('End date must be on or after the start date.');
      setTimeout(() => setErrorNotice(null), 3500);
      return;
    }

    setIsScheduleDirty(true);
    const newEntry: DriverTimeOff = {
      id: 'to-' + Date.now(),
      startDate: newTimeOffStart,
      endDate: newTimeOffEnd,
      reason: newTimeOffReason.trim() || 'Scheduled Time Off',
      createdAt: new Date().toISOString(),
    };
    setScheduleConfig((prev) => ({
      ...prev,
      timeOffList: [...(prev.timeOffList || []), newEntry],
    }));
    setNewTimeOffStart('');
    setNewTimeOffEnd('');
    setNewTimeOffReason('');
  }, [newTimeOffStart, newTimeOffEnd, newTimeOffReason]);

  const handleRemoveTimeOff = useCallback((id: string) => {
    setIsScheduleDirty(true);
    setScheduleConfig((prev) => ({
      ...prev,
      timeOffList: (prev.timeOffList || []).filter((to) => to.id !== id),
    }));
  }, []);

  const handleSaveSchedule = useCallback(async () => {
    if (!driver) return;
    // Validate enabled working hours (`endHour > startHour`)
    for (const [dayKey, dayCfg] of Object.entries(scheduleConfig.weeklyHours || {})) {
      if (dayCfg.enabled && dayCfg.endHour <= dayCfg.startHour) {
        setErrorNotice(`End time must be after start time for ${dayKey.toUpperCase()}.`);
        setTimeout(() => setErrorNotice(null), 4000);
        return;
      }
    }

    try {
      setIsSavingSchedule(true);
      const updated = await driverService.updateSchedule(scheduleConfig, driver.id);
      setDriver(updated);
      setIsScheduleDirty(false);
      setSuccessNotice('Working hours and time off saved!');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (e: unknown) {
      setErrorNotice(e instanceof Error ? e.message : 'Failed to save schedule');
      setTimeout(() => setErrorNotice(null), 3500);
    } finally {
      setIsSavingSchedule(false);
    }
  }, [driver, driverService, scheduleConfig]);

  const handleChangeNavApp = useCallback((app: PreferredNavApp) => {
    setHasExplicitLocalNavPref(true);
    setPreferredNavApp(app);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(NAV_PREF_KEY, app);
      } catch {}
    }
  }, []);

  const handleSendTwilioSms = useCallback(async () => {
    if (!modalTrip?.passenger?.phone || !customSmsText.trim()) return;

    const phoneValidation = validatePhoneNumber(modalTrip.passenger.phone);
    if (!phoneValidation.isValid) {
      setTwilioSmsFeedback(phoneValidation.error || 'Invalid passenger phone number.');
      return;
    }

    setIsSendingTwilioSms(true);
    setTwilioSmsFeedback('Sending via Chesterfield SMS relay...');
    try {
      const resp = await authorizedFetch('/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_sms',
          to: phoneValidation.e164,
          body: customSmsText.trim(),
        }),
      });

      const data = (await resp.json()) as any;
      if (data.success) {
        setTwilioSmsFeedback(data.message || 'SMS delivered to passenger!');
        setTimeout(() => {
          setShowSmsModal(false);
          setModalTripId(null);
          setTwilioSmsFeedback(null);
        }, 1400);
      } else {
        setTwilioSmsFeedback(data.message || data.error || 'Failed to dispatch SMS.');
      }
    } catch (err: any) {
      setTwilioSmsFeedback(err.message || 'Error communicating with telephony API.');
    } finally {
      setIsSendingTwilioSms(false);
    }
  }, [modalTrip, customSmsText]);

  const handleNavigateWorkspace = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  const handleSignOut = useCallback(() => {
    driverService.setActiveDriverId('');
    getAdminAuthService().signOut();
  }, [driverService]);

  const handleSelectScheduledTrip = useCallback((tripId: string) => {
    setActiveTripId(tripId);
    setCurrentTab('active');
  }, []);

  const handleOpenSmsModal = useCallback((trip: Trip) => {
    const presetDefault =
      trip.status === 'en_route'
        ? 'Chesterfield Taxi: Your driver is en route to your pickup location.'
        : trip.status === 'arrived'
        ? 'Chesterfield Taxi: Your driver has arrived outside at your pickup location.'
        : 'Chesterfield Taxi: Your ride is confirmed and assigned.';
    setModalTripId(trip.id);
    setCustomSmsText(presetDefault);
    setTwilioSmsFeedback(null);
    setShowSmsModal(true);
  }, []);

  const handleCloseSmsModal = useCallback(() => {
    setShowSmsModal(false);
    setModalTripId(null);
  }, []);

  const handleOpenNoShowModal = useCallback((tripId: string) => {
    setModalTripId(tripId);
    setShowNoShowModal(true);
  }, []);

  const handleCloseNoShowModal = useCallback(() => {
    setShowNoShowModal(false);
    setModalTripId(null);
  }, []);

  const handleOpenExtrasModal = useCallback((tripId: string) => {
    setModalTripId(tripId);
    setShowExtrasModal(true);
  }, []);

  const handleCloseExtrasModal = useCallback(() => {
    setShowExtrasModal(false);
    setModalTripId(null);
  }, []);

  const handleCloseTerminalModal = useCallback(() => {
    setShowTerminalModal(false);
    setModalTripId(null);
  }, []);

  const handleReturnToShift = useCallback(() => {
    setShowTerminalModal(false);
    setCompletedPayoutReceipt(null);
    setModalTripId(null);
    setMeterSeconds(0);
    setMeterWaitSeconds(0);
    setMeterDistance(0);
    setActiveTripId(null);
  }, []);

  const activeFareSnap = useMemo(
    () => computeRideFareSnapshot(activeTrip),
    [computeRideFareSnapshot, activeTrip]
  );

  const modalFareSnap = useMemo(
    () => computeRideFareSnapshot(modalTrip),
    [computeRideFareSnapshot, modalTrip]
  );

  // Block HUD mount completely while verifying auth or loading authenticated driver profile
  if (isAuthChecking || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <SpinnerIcon className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold tracking-wide">Chesterfield Driver Console</h2>
        <p className="text-slate-400 text-sm mt-1">Verifying driver session &amp; syncing dispatch...</p>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none antialiased">
      <DriverShiftControls
        driver={driver}
        driverRoles={driverRoles}
        adminVehicles={adminVehicles}
        fleetAssets={fleetAssets}
        preferredNavApp={preferredNavApp}
        telemetry={telemetry}
        wakeLockSupported={wakeLock.isSupported}
        wakeLockActive={wakeLock.isActive}
        pushSupported={pushNotifications.isSupported}
        pushPermission={pushNotifications.permission}
        pushAlertsEnabled={pushNotifications.alertsEnabled}
        isRequestingPush={pushNotifications.isRequesting}
        actionLoading={actionLoading}
        lastStepUndo={lastStepUndo}
        successNotice={successNotice}
        errorNotice={errorNotice}
        showProfileMenu={showProfileMenu}
        showVehiclePickerModal={showVehiclePickerModal}
        sheetStyle={driverSheetDrag.sheetStyle}
        dragHandlers={driverSheetDrag.dragHandlers}
        onSetShowProfileMenu={setShowProfileMenu}
        onSetShowVehiclePickerModal={setShowVehiclePickerModal}
        onToggleDuty={handleToggleDuty}
        onSelectFleetVehicle={handleSelectFleetVehicle}
        onChangeNavApp={handleChangeNavApp}
        onEnablePushAlerts={handleEnablePushAlerts}
        onTogglePushAlerts={handleTogglePushAlerts}
        onRevertStatus={handleRevertStatus}
        onNavigateWorkspace={handleNavigateWorkspace}
        onSignOut={handleSignOut}
      />

      {/* Main Scrollable Viewport Container (fits cleanly between header and bottom nav without dead scroll) */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full">
        <div className="p-4 max-w-lg mx-auto w-full flex flex-col gap-4 pb-6">
          {currentTab === 'active' && (
            <DriverLiveMeterCard
              driver={driver}
              activeTrip={activeTrip}
              modalTrip={modalTrip}
              scheduledTrips={scheduledTrips}
              offeredTrips={offeredTrips}
              adminVehicles={adminVehicles}
              globalCommissionRate={globalCommissionRate}
              preferredNavApp={preferredNavApp}
              activeFareSnap={activeFareSnap}
              meterSeconds={meterSeconds}
              meterWaitSeconds={meterWaitSeconds}
              meterDistance={meterDistance}
              actionLoading={actionLoading}
              multiStop={multiStop}
              tripUpdateAck={tripUpdateAck}
              showNoShowModal={showNoShowModal}
              noShowReason={noShowReason}
              showSmsModal={showSmsModal}
              customSmsText={customSmsText}
              isSendingTwilioSms={isSendingTwilioSms}
              twilioSmsFeedback={twilioSmsFeedback}
              showExtrasModal={showExtrasModal}
              customExtraName={customExtraName}
              customExtraAmount={customExtraAmount}
              customExtraCategory={customExtraCategory}
              sheetStyle={driverSheetDrag.sheetStyle}
              dragHandlers={driverSheetDrag.dragHandlers}
              onSelectActiveTrip={setActiveTripId}
              onSwitchTab={setCurrentTab}
              onAcceptOffer={handleAcceptOffer}
              onDeclineOffer={handleDeclineOffer}
              onStepAction={handleStepAction}
              onRevertStatus={handleRevertStatus}
              onOpenSmsModal={handleOpenSmsModal}
              onCloseSmsModal={handleCloseSmsModal}
              onSetCustomSmsText={setCustomSmsText}
              onSendTwilioSms={handleSendTwilioSms}
              onOpenNoShowModal={handleOpenNoShowModal}
              onCloseNoShowModal={handleCloseNoShowModal}
              onSetNoShowReason={setNoShowReason}
              onConfirmCancelOrNoShow={handleDriverCancelOrNoShow}
              onOpenExtrasModal={handleOpenExtrasModal}
              onCloseExtrasModal={handleCloseExtrasModal}
              onSetCustomExtraName={setCustomExtraName}
              onSetCustomExtraAmount={setCustomExtraAmount}
              onSetCustomExtraCategory={setCustomExtraCategory}
              onAddExtra={handleAddExtra}
            />
          )}

          {(currentTab === 'offers' || currentTab === 'scheduled') && (
            <DriverOfferSheet
              mode={currentTab}
              offeredTrips={offeredTrips}
              scheduledTrips={scheduledTrips}
              activeTripId={activeTrip?.id ?? null}
              adminVehicles={adminVehicles}
              preferredNavApp={preferredNavApp}
              actionLoading={actionLoading}
              tripUpdateAck={tripUpdateAck}
              onAcceptOffer={handleAcceptOffer}
              onDeclineOffer={handleDeclineOffer}
              onSelectScheduledTrip={handleSelectScheduledTrip}
            />
          )}

          {(currentTab === 'earnings' || currentTab === 'schedule') && (
            <DriverEarningsHistoryPane
              mode={currentTab}
              driver={driver}
              globalCommissionRate={globalCommissionRate}
              payoutHistory={payoutHistory}
              completedTrips={completedTrips}
              scheduleConfig={scheduleConfig}
              isScheduleDirty={isScheduleDirty}
              newTimeOffStart={newTimeOffStart}
              newTimeOffEnd={newTimeOffEnd}
              newTimeOffReason={newTimeOffReason}
              isSavingSchedule={isSavingSchedule}
              onToggleDay={handleToggleDay}
              onTimeChange={handleTimeChange}
              onSetNewTimeOffStart={setNewTimeOffStart}
              onSetNewTimeOffEnd={setNewTimeOffEnd}
              onSetNewTimeOffReason={setNewTimeOffReason}
              onAddTimeOff={handleAddTimeOff}
              onRemoveTimeOff={handleRemoveTimeOff}
              onSaveSchedule={handleSaveSchedule}
            />
          )}
        </div>
      </main>

      {/* STICKY BOTTOM TAB NAVIGATION BAR (non-overlapping flex footer) */}
      <nav className="shrink-0 z-40 bg-slate-900/95 border-t border-slate-800 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="grid grid-cols-5 gap-1.5 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setCurrentTab('active')}
            className={`py-2 px-1 min-h-[52px] rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
              currentTab === 'active'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CarIcon className="w-5 h-5" />
            <span className="truncate">Active</span>
            {activeTrip && (
              <span
                className={`w-2 h-2 rounded-full absolute top-1.5 right-2 ${
                  currentTab === 'active' ? 'bg-white' : 'bg-emerald-400'
                }`}
              />
            )}
          </button>

          <button
            type="button"
            disabled={driver?.dutyStatus !== 'on_duty'}
            onClick={() => setCurrentTab('offers')}
            className={`py-2 px-1 min-h-[52px] rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 relative ${
              driver?.dutyStatus !== 'on_duty'
                ? 'text-slate-600 cursor-not-allowed'
                : currentTab === 'offers'
                ? 'bg-blue-600 text-white shadow-md font-black cursor-pointer'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="truncate">Offers</span>
            {offeredTrips.length > 0 && driver?.dutyStatus === 'on_duty' && (
              <span
                className={`px-1.5 text-[9px] rounded-full font-black absolute top-1 right-2 ${
                  currentTab === 'offers' ? 'bg-slate-950 text-blue-300' : 'bg-blue-600 text-white'
                }`}
              >
                {offeredTrips.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('scheduled')}
            className={`py-2 px-1 min-h-[52px] rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
              currentTab === 'scheduled'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ClockIcon className="w-5 h-5" />
            <span className="truncate">Queue</span>
            {scheduledTrips.length > 0 && (
              <span
                className={`px-1.5 text-[9px] rounded-full font-black absolute top-1 right-2 ${
                  currentTab === 'scheduled' ? 'bg-slate-950 text-blue-300' : 'bg-slate-700 text-white'
                }`}
              >
                {scheduledTrips.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('earnings')}
            className={`py-2 px-1 min-h-[52px] rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              currentTab === 'earnings'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <DollarSignIcon className="w-5 h-5" />
            <span className="truncate">Earnings</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('schedule')}
            className={`py-2 px-1 min-h-[52px] rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              currentTab === 'schedule'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="truncate">Hours</span>
          </button>
        </div>
      </nav>

      <DriverPaymentTerminalModal
        isOpen={showTerminalModal}
        modalTrip={modalTrip}
        fareSnapshot={modalFareSnap}
        stripeOnlineEnabled={stripeOnlineEnabled}
        settlementMethod={settlementMethod}
        cardLast4Input={cardLast4Input}
        tipSelection={tipSelection}
        customTipValue={customTipValue}
        isProcessingPayment={isProcessingPayment}
        completedPayoutReceipt={completedPayoutReceipt}
        sheetStyle={driverSheetDrag.sheetStyle}
        dragHandlers={driverSheetDrag.dragHandlers}
        payLinkUrl={driverPayLinkUrl}
        payLinkStatus={driverPayLinkStatus}
        isSendingPayLink={isSendingDriverPayLink}
        payLinkFeedback={driverPayLinkFeedback}
        onClose={handleCloseTerminalModal}
        onReturnToShift={handleReturnToShift}
        onSetSettlementMethod={setSettlementMethod}
        onSetCardLast4Input={setCardLast4Input}
        onSetTipSelection={setTipSelection}
        onSetCustomTipValue={setCustomTipValue}
        onProcessPayment={handleProcessTerminalPayment}
        onRequestPayLink={handleRequestDriverPayLink}
        onRefreshPayLinkStatus={handleRefreshDriverPayLinkStatus}
      />
    </div>
  );
}
