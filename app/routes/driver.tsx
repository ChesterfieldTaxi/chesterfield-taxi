import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import type { GeoPoint, Trip, TripStatus } from '../core/types/trip';
import type { VehicleTierConfig } from '../core/types/config';
import type { PhysicalFleetAsset } from '../core/types/fleet';
import { getBookingService } from '../core/services/booking';
import { authorizedFetch } from '../core/services/auth/auth-headers';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
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
import { getTelephonyService } from '../core/services/telephony.service';
import { getInvoicingService } from '../core/services/invoicing.service';
import { getEmailDispatchService } from '../core/services/email';
import { soundNotificationService } from '../core/services/sound-notification.service';
import type { DriverPayoutRecord, DriverSettlementMethod } from '../core/types/payment';
import {
  PhoneIcon,
  CheckIcon,
  SpinnerIcon,
  XIcon,
  CalendarIcon,
  MapPinIcon,
  CarIcon,
  ClockIcon,
  UserIcon,
  LuggageIcon,
  MailIcon,
  FlagIcon,
  LogOutIcon,
  RadioIcon,
  ShieldCheckIcon,
  DollarSignIcon,
} from '../components/ui/Icons';
import { useDriverTelemetry } from '../core/hooks/useDriverTelemetry';
import { validatePhoneNumber } from '../core/utils/phone';
import { formatVehicleTierDisplay } from '../core/services/email/email-templates';
import { DriverTripManifest } from '../components/domain/driver/DriverTripManifest';

export function meta() {
  return [
    { title: 'Driver Console – Chesterfield Taxi' },
    { name: 'description', content: 'Mobile-first driver console, trip manifest, and in-cab settlement app' },
  ];
}

type DriverTab = 'active' | 'offers' | 'earnings' | 'scheduled' | 'schedule';
type PreferredNavApp = 'google' | 'apple' | 'waze';

const NAV_PREF_KEY = 'ct_driver_preferred_nav_app';
const METER_STORAGE_PREFIX = 'ct_driver_meter_v2_';

const PRESET_EXTRAS: Array<{ name: string; amount: number; category: DriverMeterExtra['category'] }> = [
  { name: 'Lambert STL Airport Toll / Surcharge', amount: 4.0, category: 'toll' },
  { name: 'Highway / Bridge Toll Pass-through', amount: 3.5, category: 'toll' },
  { name: 'Downtown Parking Garage Pass', amount: 10.0, category: 'parking' },
  { name: 'Extra Baggage / Luggage Assist', amount: 5.0, category: 'luggage' },
  { name: 'Wait Time Fee (15 min)', amount: 10.0, category: 'custom' },
  { name: 'Vehicle Cleaning Surcharge', amount: 25.0, category: 'cleaning' },
];

export function formatCabUnitLabel(vehicleUnit?: string | null): string {
  const raw = (vehicleUnit || '').trim();
  if (!raw) return 'No Vehicle Assigned';
  if (/^cab\s*#/i.test(raw)) return raw;
  if (/^#/.test(raw)) return `Cab ${raw}`;
  return `Cab #${raw}`;
}

export function openMapNavigation(
  address: string,
  app: PreferredNavApp = 'google',
  coords?: GeoPoint | null
) {
  if (!address && !coords) return;
  const hasCoords =
    coords &&
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng);

  const destination = hasCoords ? `${coords.lat},${coords.lng}` : address;
  const encodedDest = encodeURIComponent(destination);
  const encodedAddr = encodeURIComponent(address || destination);

  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}&travelmode=driving`;
  if (app === 'apple') {
    url = hasCoords
      ? `https://maps.apple.com/?daddr=${encodedDest}&dirflg=d`
      : `https://maps.apple.com/?daddr=${encodedAddr}&dirflg=d`;
  } else if (app === 'waze') {
    url = hasCoords
      ? `https://waze.com/ul?ll=${encodedDest}&navigate=yes`
      : `https://waze.com/ul?q=${encodedAddr}&navigate=yes`;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Decision #2: Determines whether a trip has a locked upfront quoted/flat fare
 * vs a live GPS-metered walk-up ride.
 */
function isTripQuotedLocked(trip: Trip | null): boolean {
  if (!trip) return true;
  const meta = (trip.metadata || {}) as Record<string, any>;
  if (meta.isWalkupMetered === true || meta.billingMode === 'metered') return false;
  if (
    trip.pricing?.matchedCorridorId ||
    meta.manualFareOverride != null ||
    (trip.pricing?.totalFare && trip.pricing.totalFare > 0)
  ) {
    return true;
  }
  return false;
}

/**
 * Splits a trip's in-cab driver extras cleanly into 100%-reimbursed tolls vs commissionable non-toll extras.
 */
function splitDriverExtras(trip: Trip | null): {
  extras: DriverMeterExtra[];
  tollsTotal: number;
  nonTollExtrasTotal: number;
  allDriverExtrasTotal: number;
} {
  const raw = (trip?.pricing?.driverExtras || trip?.meterExtras || []) as DriverMeterExtra[];
  const tollsTotal = Number(
    raw
      .filter((e) => e.category === 'toll')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
      .toFixed(2)
  );
  const nonTollExtrasTotal = Number(
    raw
      .filter((e) => e.category !== 'toll')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
      .toFixed(2)
  );
  return {
    extras: raw,
    tollsTotal,
    nonTollExtrasTotal,
    allDriverExtrasTotal: Number((tollsTotal + nonTollExtrasTotal).toFixed(2)),
  };
}

function maskPhoneForDisplay(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return 'Masked';
  return `(•••) •••-${digits.slice(-4)}`;
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
  const [confirmStepKey, setConfirmStepKey] = useState<string | null>(null);

  // Preferred Navigation App
  const [preferredNavApp, setPreferredNavApp] = useState<PreferredNavApp>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(NAV_PREF_KEY);
      if (saved === 'google' || saved === 'apple' || saved === 'waze') return saved;
    }
    return 'google';
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
  }, [navigate]);

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
  }, [authUserUid]);

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
        if (t.status === 'completed' || t.status === 'cancelled' || t.status === 'DECLINED' || t.status === 'declined') {
          return false;
        }
        if (Array.isArray(t.rejectedByIds) && t.rejectedByIds.includes(driver.id) && t.assignedDriverId !== driver.id) {
          return false;
        }
        if (t.assignedDriverId && t.assignedDriverId !== driver.id) {
          return false;
        }
        return t.assignedDriverId === driver.id || (t.status === 'offered' && t.offeredToIds?.includes(driver.id));
      });

      // Audible alert when new broadcast offers arrive while on_duty
      if (driver.dutyStatus === 'on_duty') {
        const incomingOffers = myLiveTrips.filter(
          (t) => t.status === 'offered' && !t.assignedDriverId && t.offeredToIds?.includes(driver.id)
        );
        let hasBrandNewOffer = false;
        for (const o of incomingOffers) {
          if (!seenOfferIdsRef.current.has(o.id)) {
            seenOfferIdsRef.current.add(o.id);
            hasBrandNewOffer = true;
          }
        }
        if (hasBrandNewOffer) {
          try {
            soundNotificationService.playAsapRideChime();
          } catch {}
        }
      }

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
  }, [driver?.id, driver?.dutyStatus, modalTripId, completedPayoutReceipt, showTerminalModal, showExtrasModal, showSmsModal, showNoShowModal]);

  // Derived categorized trips (strictly separated!)
  const statusPriority: Record<string, number> = {
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

  const sortDriverTrips = (list: Trip[]) =>
    [...list].sort((a, b) => {
      const pA = statusPriority[a.status] || 99;
      const pB = statusPriority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      const qA = typeof a.queueOrder === 'number' ? a.queueOrder : Number.MAX_SAFE_INTEGER;
      const qB = typeof b.queueOrder === 'number' ? b.queueOrder : Number.MAX_SAFE_INTEGER;
      if (qA !== qB) return qA - qB;
      const timeA = a.scheduledPickupTime ? new Date(a.scheduledPickupTime).getTime() : 0;
      const timeB = b.scheduledPickupTime ? new Date(b.scheduledPickupTime).getTime() : 0;
      return timeA - timeB;
    });

  const liveEligibleTrips = sortDriverTrips(
    allDriverTrips.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled' || t.status === 'DECLINED' || t.status === 'declined') {
        return false;
      }
      if (!driver?.id) return false;
      if (Array.isArray(t.rejectedByIds) && t.rejectedByIds.includes(driver.id) && t.assignedDriverId !== driver.id) {
        return false;
      }
      if (t.assignedDriverId && t.assignedDriverId !== driver.id) return false;
      return t.assignedDriverId === driver.id || (t.status === 'offered' && t.offeredToIds?.includes(driver.id));
    })
  );

  // Offers: strictly unassigned `offered` trips targeted to this driver
  const offeredTrips = liveEligibleTrips.filter(
    (t) => t.status === 'offered' && !t.assignedDriverId && t.offeredToIds?.includes(driver?.id || '')
  );

  // Assigned / Accepted / En Route / Arrived / In Progress trips
  const scheduledTrips = liveEligibleTrips.filter(
    (t) => t.assignedDriverId === driver?.id && t.status !== 'offered'
  );

  // Completed trips for Earnings & History tab
  const completedTrips = allDriverTrips
    .filter((t) => t.assignedDriverId === driver?.id && t.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime());

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
    let ticks = 0;

    const interval = setInterval(() => {
      ticks += 1;
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
    (trip: Trip | null) => {
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
  const handleToggleDuty = async (newStatus: DriverDutyStatus) => {
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
  };

  // Shift Vehicle Selection backed by `/fleet`
  const handleSelectFleetVehicle = async (asset: PhysicalFleetAsset) => {
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
  };

  // Atomic Offer Accept & Decline
  const handleAcceptOffer = async (offerId: string) => {
    if (!driver) return;
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
  };

  const handleDeclineOffer = async (offerId: string) => {
    if (!driver) return;
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
  };

  // Open Checkout Terminal Modal (auto-selects Corporate / Cash / Card Terminal based on booking!)
  const openCheckoutTerminalForTrip = (trip: Trip) => {
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
  };

  // Step-by-Step Status Transitions (looks up targetTripId explicitly — never stale activeTrip!)
  const handleStepAction = async (targetTripId: string, targetStatus: TripStatus, reason?: string) => {
    if (!driver) return;
    const targetTrip = liveEligibleTrips.find((t) => t.id === targetTripId) || null;

    if (targetStatus === 'completed') {
      if (targetTrip) openCheckoutTerminalForTrip(targetTrip);
      return;
    }

    try {
      setActionLoading(targetStatus);
      setConfirmStepKey(null);
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
            vehicleModel: driver.vehicleModel || 'Chauffeur Vehicle',
            trackingToken: targetTrip.trackingToken,
          });
        } else if (targetStatus === 'in_progress') {
          await telephonyService.sendLifecycleSms(targetTripId, 'trip_started', {
            passengerPhone: targetTrip.passenger.phone,
          });
        }
      }

      setSuccessNotice('Status updated to ' + targetStatus.toUpperCase().replace('_', ' '));
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      setErrorNotice(msg);
      setTimeout(() => setErrorNotice(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  // Driver No-Show / Cancellation Workflow
  const handleDriverCancelOrNoShow = async () => {
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
  };

  // In-Cab Payment & Settlement Processing (Decisions #2, #3, #4)
  const handleProcessTerminalPayment = async () => {
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
  };

  // Append Extra Fee (pinned to modalTrip + clears inputs cleanly!)
  const handleAddExtra = async (extra: DriverMeterExtra) => {
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
  };

  // Schedule / Calendar Handlers (marks dirty so GPS pings never wipe unsaved edits!)
  const handleToggleDay = (day: DayOfWeek) => {
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
  };

  const handleTimeChange = (day: DayOfWeek, field: 'startHour' | 'endHour', value: string) => {
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
  };

  const handleAddTimeOff = () => {
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
  };

  const handleRemoveTimeOff = (id: string) => {
    setIsScheduleDirty(true);
    setScheduleConfig((prev) => ({
      ...prev,
      timeOffList: (prev.timeOffList || []).filter((to) => to.id !== id),
    }));
  };

  const handleSaveSchedule = async () => {
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
  };

  const handleChangeNavApp = (app: PreferredNavApp) => {
    setPreferredNavApp(app);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(NAV_PREF_KEY, app);
      } catch {}
    }
  };

  const handleSendTwilioSms = async () => {
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
  };

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

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const DAYS_ORDER: { key: DayOfWeek; label: string }[] = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
  ];

  const resolveCallPassengerHref = (trip: Trip): { href: string; isMasked: boolean } => {
    const hasDistinctProxy =
      Boolean(trip.proxyNumber) &&
      trip.proxyNumber !== COMPANY_CONFIG.phone.primaryRaw &&
      trip.proxyNumber !== COMPANY_CONFIG.phone.dispatch;
    if (hasDistinctProxy && trip.proxyNumber) {
      return { href: `tel:${trip.proxyNumber}`, isMasked: true };
    }
    return {
      href: `tel:${trip.passenger?.phone || COMPANY_CONFIG.phone.primaryRaw}`,
      isMasked: false,
    };
  };

  const activeFareSnap = computeRideFareSnapshot(activeTrip);

  // Earnings KPIs
  const todayStr = formatLocalDateStr(new Date());
  const todaysPayouts = payoutHistory.filter((p) => {
    const pDate = p.createdAt ? formatLocalDateStr(new Date(p.createdAt)) : '';
    return pDate === todayStr;
  });
  const todaysEarningsTotal = todaysPayouts.reduce(
    (sum, p) => sum + (p.driverShare + p.tipAmount + p.tollsReimbursed),
    0
  );
  const totalCompanyOwesDriver = payoutHistory
    .filter((p) => p.status === 'pending' && p.settlementDirection !== 'driver_owes_company')
    .reduce((sum, p) => sum + Math.max(0, p.netPayout), 0);
  const totalDriverOwesCompany = payoutHistory
    .filter((p) => p.status === 'pending' && p.settlementDirection === 'driver_owes_company')
    .reduce((sum, p) => sum + Number(p.companyCommissionOwed || p.platformFee || 0), 0);

  return (
    <div className="h-dvh overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none antialiased">
      {/* Click-outside dismissal backdrop for profile dropdown */}
      {showProfileMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowProfileMenu(false)}
          aria-hidden="true"
        />
      )}

      {/* Top Mobile App Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-md gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 relative w-full">
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-3 text-left min-w-0 flex-1 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 rounded-xl min-h-[44px]"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0 uppercase">
              {driver?.name ? driver.name.charAt(0) : 'CT'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-white leading-tight truncate">
                  {driver?.name || 'Driver Console'}
                </h1>
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ${
                    driver?.dutyStatus === 'on_duty'
                      ? 'bg-emerald-500 shadow-emerald-500/50'
                      : driver?.dutyStatus === 'on_break'
                      ? 'bg-amber-400 shadow-amber-400/50'
                      : 'bg-slate-500'
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {formatCabUnitLabel(driver?.vehicleUnit)}
                {driver?.vehicleMake || driver?.vehicleModel
                  ? ` · ${[driver.vehicleColor, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ')}`
                  : ''}
              </p>
            </div>
            <div className="shrink-0 text-slate-400 pl-2">
              <svg
                className={`w-5 h-5 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[280px]">
              {/* Duty Status Controls */}
              <div className="p-3 border-b border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Shift Duty Status
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleDuty('on_duty');
                      setShowProfileMenu(false);
                    }}
                    disabled={actionLoading === 'duty'}
                    className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      driver?.dutyStatus === 'on_duty'
                        ? 'bg-emerald-950/80 text-emerald-400 ring-1 ring-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    On-Duty (Available)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleDuty('on_break');
                      setShowProfileMenu(false);
                    }}
                    disabled={actionLoading === 'duty'}
                    className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      driver?.dutyStatus === 'on_break'
                        ? 'bg-amber-950/80 text-amber-300 ring-1 ring-amber-500/40'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    On-Break (30s Light GPS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleDuty('off_duty');
                      setShowProfileMenu(false);
                    }}
                    disabled={actionLoading === 'duty'}
                    className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      driver?.dutyStatus === 'off_duty'
                        ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-600'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    Off-Duty (End Shift)
                  </button>
                </div>
              </div>

              {/* Shift Vehicle Picker + Navigation App Preference */}
              <div className="p-3 border-b border-slate-800 space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowVehiclePickerModal(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl bg-slate-800/80 hover:bg-slate-800 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <CarIcon className="w-4 h-4 text-blue-400" />
                    <span>Select Shift Vehicle</span>
                  </span>
                  <span className="text-blue-400">{formatCabUnitLabel(driver?.vehicleUnit)}</span>
                </button>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">
                    Turn-by-Turn Navigation App
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['google', 'apple', 'waze'] as PreferredNavApp[]).map((app) => (
                      <button
                        key={app}
                        type="button"
                        onClick={() => handleChangeNavApp(app)}
                        className={`py-2 rounded-lg text-[11px] font-bold uppercase cursor-pointer border ${
                          preferredNavApp === app
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {app}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Workspace Switcher */}
              {(driverRoles.includes('admin') ||
                driverRoles.includes('dispatcher') ||
                driverRoles.includes('customer')) && (
                <div className="p-2 border-b border-slate-800">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Switch Workspace
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/app?choose=1');
                      }}
                      className="text-[10px] font-bold text-blue-400 hover:underline cursor-pointer"
                    >
                      Hub
                    </button>
                  </div>
                  <div className="space-y-1">
                    {(driverRoles.includes('dispatcher') || driverRoles.includes('admin')) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/app/dispatch');
                        }}
                        className="w-full flex items-center justify-between p-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <RadioIcon className="w-4 h-4 text-blue-400" />
                          <span>Dispatch Console</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">/app/dispatch</span>
                      </button>
                    )}

                    {(driverRoles.includes('customer') || driverRoles.includes('admin')) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/app/passenger');
                        }}
                        className="w-full flex items-center justify-between p-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-emerald-400" />
                          <span>Passenger Portal</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">/app/passenger</span>
                      </button>
                    )}

                    {driverRoles.includes('admin') && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/app/admin');
                        }}
                        className="w-full flex items-center justify-between p-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheckIcon className="w-4 h-4 text-purple-400" />
                          <span>Admin Console</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">/app/admin</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    driverService.setActiveDriverId('');
                    getAdminAuthService().signOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-rose-400 hover:bg-rose-950/30 cursor-pointer"
                >
                  <LogOutIcon className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Driver Telemetry Status Bar (prominently surfaces GPS errors!) */}
      {(telemetry.isTracking || telemetry.gpsError) && (
        <div
          className={`border-b px-4 py-1.5 flex items-center justify-between text-[11px] backdrop-blur-sm ${
            telemetry.gpsError
              ? 'bg-rose-950/80 border-rose-800/70 text-rose-200'
              : 'bg-slate-900/90 border-slate-800 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              {!telemetry.gpsError && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    telemetry.isOffline ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  telemetry.gpsError
                    ? 'bg-rose-500'
                    : telemetry.isOffline
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
              />
            </span>
            <span className="font-semibold truncate">
              {telemetry.gpsError
                ? `GPS Warning: ${telemetry.gpsError}`
                : telemetry.isOffline
                ? 'Offline GPS Buffer'
                : driver?.dutyStatus === 'on_break'
                ? 'Fleet GPS Active (On Break)'
                : 'Fleet GPS Telemetry Live'}
            </span>
            {!telemetry.gpsError && (
              <span className="text-slate-400 font-mono shrink-0">
                {telemetry.currentTelemetry?.speedMph ? `${telemetry.currentTelemetry.speedMph} mph` : '0 mph'}
              </span>
            )}
          </div>
          {!telemetry.gpsError && (
            <div className="flex items-center gap-2 text-slate-400 shrink-0">
              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                {telemetry.currentIntervalSeconds}s
              </span>
              {telemetry.isOffline && (
                <span className="bg-amber-950/80 text-amber-400 border border-amber-800/50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  Buffered: {telemetry.pendingOfflineBufferCount}
                </span>
              )}
              {telemetry.lastBroadcastAt && !telemetry.isOffline && (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  {telemetry.lastBroadcastAt}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notifications Toast */}
      {successNotice && (
        <div className="mx-4 mt-3 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 max-w-lg sm:mx-auto w-full">
          <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}
      {errorNotice && (
        <div className="mx-4 mt-3 p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2 max-w-lg sm:mx-auto w-full">
          <XIcon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Main Scrollable Viewport Container (fits cleanly between header and bottom nav without dead scroll) */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full">
        <div className="p-4 max-w-lg mx-auto w-full flex flex-col gap-4 pb-6">
        {/* TAB 1: ACTIVE TRIP VIEW */}
        {currentTab === 'active' && (
          <>
            {/* Multi-Trip Queue Strip */}
            {scheduledTrips.length > 1 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-md">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    Trip Lineup ({scheduledTrips.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentTab('scheduled')}
                    className="text-[11px] text-blue-400 hover:underline font-bold cursor-pointer py-1"
                  >
                    View All &rarr;
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  {scheduledTrips.map((trip, idx) => {
                    const isSelected = activeTrip?.id === trip.id;
                    const pickupTime = trip.scheduledPickupTime
                      ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : 'ASAP';
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => {
                          setConfirmStepKey(null);
                          setActiveTripId(trip.id);
                        }}
                        className={`px-3 py-2 min-h-[44px] rounded-xl text-left border shrink-0 transition-all cursor-pointer flex flex-col gap-0.5 min-w-[136px] ${
                          isSelected
                            ? 'bg-blue-600/15 border-blue-600 text-blue-300 shadow-sm'
                            : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            #{idx + 1} {trip.bookingType === 'asap' ? 'ASAP' : pickupTime}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase bg-slate-900/80">
                            {trip.status.replace('_', ' ').slice(0, 10)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-white truncate max-w-[130px]">
                          {trip.passenger?.firstName} {trip.passenger?.lastName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ACTIVE ASSIGNED TRIP CARD */}
            {activeTrip ? (
              <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
                {/* Status Header */}
                <div className="flex items-center justify-between bg-slate-800/80 px-3.5 py-2.5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                      {activeTrip.id}
                    </span>
                  </div>
                  <span
                    className={
                      'px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase ' +
                      (activeTrip.status === 'in_progress'
                        ? 'bg-emerald-500 text-slate-950'
                        : activeTrip.status === 'en_route'
                        ? 'bg-blue-600 text-white'
                        : activeTrip.status === 'arrived'
                        ? 'bg-rose-500 text-white'
                        : 'bg-purple-500 text-white')
                    }
                  >
                    {activeTrip.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Prominent Pickup Time Card */}
                <div className="bg-gradient-to-r from-blue-600/20 via-blue-600/10 to-transparent border-2 border-blue-600/50 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <ClockIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400 block">
                        {activeTrip.bookingType === 'asap' ? 'Immediate Pickup' : 'Scheduled Pickup Time'}
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        {activeTrip.scheduledPickupTime
                          ? new Date(activeTrip.scheduledPickupTime).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : 'ASAP (Immediate)'}
                      </div>
                      {activeTrip.scheduledPickupTime && (
                        <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                          {new Date(activeTrip.scheduledPickupTime).toLocaleDateString([], {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-600/30">
                      {activeTrip.bookingType === 'asap' ? 'ASAP' : 'PRE-BOOKED'}
                    </span>
                    {(() => {
                      const meta = (activeTrip.metadata || {}) as Record<string, any>;
                      const groupId = activeTrip.multiCarGroupId || meta.multiCarGroupId;
                      const total = Number(activeTrip.multiCarTotal || meta.multiCarTotal || activeTrip.vehicleCount || 1);
                      const idx = Number(activeTrip.multiCarIndex || meta.multiCarIndex || 1);
                      if (!(groupId || activeTrip.multipleVehiclesRequested) || total <= 1) return null;
                      return (
                        <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded bg-violet-600/30 text-violet-200 border border-violet-400/50">
                          CAR {idx}/{total}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Passenger Card & Contact Actions */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-slate-400 block font-medium">Passenger</span>
                    <h4 className="text-base font-bold text-white truncate">
                      {activeTrip.passenger?.firstName} {activeTrip.passenger?.lastName}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        {activeTrip.passenger?.passengerCount || 1} Pax
                      </span>
                      <span className="flex items-center gap-1">
                        <LuggageIcon className="w-3.5 h-3.5 text-slate-400" />
                        {activeTrip.passenger?.luggageCount || 0} Bags
                      </span>
                    </div>
                  </div>

                  {activeTrip.passenger?.phone && (() => {
                    const callInfo = resolveCallPassengerHref(activeTrip);
                    return (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const presetDefault =
                              activeTrip.status === 'en_route'
                                ? 'Chesterfield Taxi: Your driver is en route to your pickup location.'
                                : activeTrip.status === 'arrived'
                                ? 'Chesterfield Taxi: Your driver has arrived outside at your pickup location.'
                                : 'Chesterfield Taxi: Your ride is confirmed and assigned.';
                            setModalTripId(activeTrip.id);
                            setCustomSmsText(presetDefault);
                            setTwilioSmsFeedback(null);
                            setShowSmsModal(true);
                          }}
                          className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 flex items-center justify-center shadow cursor-pointer active:scale-95"
                          title="Send SMS via Chesterfield Relay"
                        >
                          <MailIcon className="w-5 h-5" />
                        </button>

                        <a
                          href={callInfo.href}
                          className="w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95"
                          title={callInfo.isMasked ? 'Call Passenger (Masked Proxy)' : 'Call Passenger'}
                        >
                          <PhoneIcon className="w-5 h-5" />
                        </a>
                      </div>
                    );
                  })()}
                </div>

                {/* Complete Operational Manifest (Vehicle, Payment/PO, Car Seats, Cargo, Aviation, Booker, Gate Code, Notes, Breakdown) */}
                <DriverTripManifest trip={activeTrip} adminVehicles={adminVehicles} />

                {/* Route Details with Turn-by-Turn Navigation */}
                <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                        P
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                          Pickup Location
                        </span>
                        <p className="text-sm font-semibold text-white leading-snug">
                          {activeTrip.pickupLocation?.address}
                        </p>
                        {activeTrip.pickupLocation?.driverNotes && (
                          <p className="text-xs text-blue-300 mt-1 italic">
                            Pickup Note: {activeTrip.pickupLocation.driverNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    {activeTrip.pickupLocation?.address && (
                      <button
                        type="button"
                        onClick={() =>
                          openMapNavigation(
                            activeTrip.pickupLocation.address,
                            preferredNavApp,
                            activeTrip.pickupLocation.coordinates
                          )
                        }
                        className="px-3 py-2 min-h-[44px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
                      >
                        <MapPinIcon className="w-4 h-4 text-emerald-400" />
                        <span>Directions</span>
                      </button>
                    )}
                  </div>

                  {/* Intermediate Stops */}
                  {activeTrip.intermediateStops && activeTrip.intermediateStops.length > 0 && (
                    <div className="pl-9 space-y-2 border-l-2 border-dashed border-slate-700 ml-3.5">
                      {activeTrip.intermediateStops.map((stop, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-300 min-w-0">
                            <span className="text-blue-400 font-bold">Stop {idx + 1}:</span> {stop.address}
                            {stop.unitOrApt ? ` (${stop.unitOrApt})` : ''}
                            {stop.driverNotes ? (
                              <span className="block text-[11px] text-slate-400 italic">{stop.driverNotes}</span>
                            ) : null}
                          </div>
                          {stop.address && (
                            <button
                              type="button"
                              onClick={() => openMapNavigation(stop.address, preferredNavApp, stop.coordinates)}
                              className="px-3 py-2 min-h-[40px] bg-blue-600/15 hover:bg-blue-600/25 border border-blue-600/35 text-blue-300 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Nav
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dropoff */}
                  <div className="flex items-start justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                        D
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block">
                          Destination
                        </span>
                        <p className="text-sm font-semibold text-white leading-snug">
                          {activeTrip.dropoffLocation?.address}
                        </p>
                        {activeTrip.dropoffLocation?.driverNotes && (
                          <p className="text-xs text-rose-200 mt-1 italic">
                            Dropoff Note: {activeTrip.dropoffLocation.driverNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    {activeTrip.dropoffLocation?.address && (
                      <button
                        type="button"
                        onClick={() =>
                          openMapNavigation(
                            activeTrip.dropoffLocation.address,
                            preferredNavApp,
                            activeTrip.dropoffLocation.coordinates
                          )
                        }
                        className="px-3 py-2 min-h-[44px] bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
                      >
                        <MapPinIcon className="w-4 h-4 text-rose-400" />
                        <span>Directions</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Fare Summary Card */}
                <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                      {activeFareSnap.isQuotedLocked ? 'Upfront Quoted Fare (Locked)' : 'Estimated Meter Fare'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {activeTrip.pricing?.distanceMiles
                        ? `${activeTrip.pricing.distanceMiles.toFixed(1)} mi est. · ${activeFareSnap.tariffName}`
                        : activeFareSnap.tariffName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-blue-400 font-mono">
                      ${activeFareSnap.subtotalFare.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* IN-CAB TRIP MONITOR / TAXIMETER (Active when in_progress) */}
                {activeTrip.status === 'in_progress' && (
                  <div className="bg-slate-950 border-2 border-emerald-500/60 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider truncate">
                          {activeFareSnap.isQuotedLocked ? 'Quoted Ride Active' : 'Live Taximeter Active'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                        {activeFareSnap.isQuotedLocked ? 'QUOTE LOCKED' : activeFareSnap.tariffName}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-mono">ELAPSED</span>
                        <span className="text-lg font-black text-white font-mono">
                          {formatTimer(meterSeconds)}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-mono">GPS DIST</span>
                        <span className="text-lg font-black text-white font-mono">
                          {meterDistance.toFixed(2)} mi
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {activeFareSnap.isQuotedLocked ? 'TOTAL FARE' : 'METER FARE'}
                        </span>
                        <span className="text-lg font-black text-blue-400 font-mono">
                          ${activeFareSnap.subtotalFare.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {!activeFareSnap.isQuotedLocked && (
                      <div className="mt-2 text-[11px] text-slate-400 flex justify-between px-1">
                        <span>Stationary Wait Time:</span>
                        <span className="font-mono text-slate-300">{formatTimer(meterWaitSeconds)}</span>
                      </div>
                    )}

                    {/* Add Post-Booking Extra / Toll */}
                    <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center gap-2">
                      <span className="text-xs text-slate-400">Tolls, Wait Time &amp; Extras</span>
                      <button
                        type="button"
                        onClick={() => {
                          setModalTripId(activeTrip.id);
                          setShowExtrasModal(true);
                        }}
                        className="px-3.5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
                      >
                        + Add Toll / Extra
                      </button>
                    </div>

                    {activeTrip.pricing?.driverExtras && activeTrip.pricing.driverExtras.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Appended In-Cab Extras:
                        </span>
                        <div className="space-y-1">
                          {activeTrip.pricing.driverExtras.map((ex, i) => (
                            <div key={ex.id || i} className="flex justify-between text-xs text-slate-300">
                              <span>
                                {ex.name}{' '}
                                <span className="text-[10px] text-slate-500 uppercase">({ex.category})</span>
                              </span>
                              <span className="font-bold text-blue-400 font-mono">+${ex.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SEQUENTIAL STATUS ACTION BUTTONS (with 2-tap safety confirm on live SMS triggers) */}
                <div className="pt-2 space-y-2.5">
                  {activeTrip.status === 'offered' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => handleAcceptOffer(activeTrip.id)}
                        className="py-4 min-h-[52px] bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {actionLoading === `accept-${activeTrip.id}` ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}
                        <span>ACCEPT TRIP</span>
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => handleDeclineOffer(activeTrip.id)}
                        className="py-4 min-h-[52px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl border border-slate-700 cursor-pointer"
                      >
                        DECLINE
                      </button>
                    </div>
                  ) : ['assigned', 'accepted', 'UNCONFIRMED', 'CONFIRMED', 'unconfirmed', 'confirmed'].includes(activeTrip.status) ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => {
                          const key = `${activeTrip.id}:en_route`;
                          if (confirmStepKey !== key) {
                            setConfirmStepKey(key);
                            return;
                          }
                          handleStepAction(activeTrip.id, 'en_route');
                        }}
                        className={`w-full py-4 min-h-[54px] font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                          confirmStepKey === `${activeTrip.id}:en_route`
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-300'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {actionLoading === 'en_route' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CarIcon className="w-5 h-5" />}
                        <span>
                          {confirmStepKey === `${activeTrip.id}:en_route`
                            ? 'TAP AGAIN TO CONFIRM EN ROUTE & NOTIFY'
                            : 'EN ROUTE TO PICKUP'}
                        </span>
                      </button>
                      {activeTrip.status === 'assigned' && (
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleStepAction(activeTrip.id, 'accepted')}
                          className="w-full py-3 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 cursor-pointer"
                        >
                          {actionLoading === 'accepted' ? 'Confirming...' : 'Acknowledge / Mark Accepted'}
                        </button>
                      )}
                    </div>
                  ) : activeTrip.status === 'en_route' ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => {
                          const key = `${activeTrip.id}:arrived`;
                          if (confirmStepKey !== key) {
                            setConfirmStepKey(key);
                            return;
                          }
                          handleStepAction(activeTrip.id, 'arrived');
                        }}
                        className={`w-full py-4 min-h-[54px] font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                          confirmStepKey === `${activeTrip.id}:arrived`
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-300'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {actionLoading === 'arrived' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <MapPinIcon className="w-5 h-5" />}
                        <span>
                          {confirmStepKey === `${activeTrip.id}:arrived`
                            ? 'TAP AGAIN TO CONFIRM ARRIVAL & TEXT RIDER'
                            : 'ARRIVED AT PICKUP'}
                        </span>
                      </button>
                    </>
                  ) : activeTrip.status === 'arrived' ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => {
                          const key = `${activeTrip.id}:in_progress`;
                          if (confirmStepKey !== key) {
                            setConfirmStepKey(key);
                            return;
                          }
                          handleStepAction(activeTrip.id, 'in_progress');
                        }}
                        className={`w-full py-4 min-h-[54px] font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                          confirmStepKey === `${activeTrip.id}:in_progress`
                            ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {actionLoading === 'in_progress' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <ClockIcon className="w-5 h-5" />}
                        <span>
                          {confirmStepKey === `${activeTrip.id}:in_progress`
                            ? 'TAP AGAIN TO START RIDE'
                            : 'START RIDE'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => {
                          setModalTripId(activeTrip.id);
                          setShowNoShowModal(true);
                        }}
                        className="w-full py-3 min-h-[44px] bg-slate-900 hover:bg-rose-950/40 text-rose-400 font-bold text-xs rounded-xl border border-rose-900/50 cursor-pointer"
                      >
                        Report Passenger No-Show / Cancel
                      </button>
                    </>
                  ) : activeTrip.status === 'in_progress' ? (
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => handleStepAction(activeTrip.id, 'completed')}
                      className="w-full py-4 min-h-[54px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-2xl shadow-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <FlagIcon className="w-5 h-5" />
                      <span>COMPLETE RIDE &amp; SETTLE FARE</span>
                    </button>
                  ) : null}
                </div>
              </section>
            ) : (
              /* STANDBY STATE */
              <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 text-blue-400 shadow-inner">
                  <CarIcon className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Standby for Next Trip</h3>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  You are currently{' '}
                  <strong className="text-emerald-400">
                    {driver?.dutyStatus?.replace('_', ' ').toUpperCase() || 'OFF DUTY'}
                  </strong>
                  . Keep this screen open to receive instant ride offers from dispatch.
                </p>

                {offeredTrips.length > 0 && driver?.dutyStatus === 'on_duty' && (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('offers')}
                    className="mt-4 px-5 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer"
                  >
                    View {offeredTrips.length} Pending Offer{offeredTrips.length === 1 ? '' : 's'} &rarr;
                  </button>
                )}

                <div className="mt-6 pt-6 border-t border-slate-800/80 w-full flex items-center justify-around text-xs text-slate-400">
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">Service Unit</span>
                    <span className="font-bold text-white">{formatCabUnitLabel(driver?.vehicleUnit)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">Tier Class</span>
                    <span className="font-bold text-blue-400 uppercase">
                      {formatVehicleTierDisplay(driver?.vehicleTier, adminVehicles)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">Split</span>
                    <span className="font-bold text-emerald-400">
                      {Math.round((driver?.commissionRate ?? globalCommissionRate) * 100)}%
                    </span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* TAB 2: OFFERS VIEW */}
        {currentTab === 'offers' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Trip Offers ({offeredTrips.length})</h2>
              <p className="text-xs text-slate-400">Incoming broadcast dispatches awaiting your acceptance</p>
            </div>

            {offeredTrips.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-blue-400">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No Pending Trip Offers</h3>
                <p className="text-xs max-w-xs">
                  When dispatch offers an ASAP or scheduled trip to your unit, it appears here with full details.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {offeredTrips.map((offer) => {
                  const pickupTime = offer.scheduledPickupTime
                    ? new Date(offer.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : 'ASAP';
                  return (
                    <div
                      key={offer.id}
                      className="bg-slate-900 border-2 border-blue-600/60 rounded-3xl p-4 shadow-xl space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
                          <span className="text-xs font-black text-blue-400 uppercase tracking-wide">
                            {offer.bookingType === 'asap' ? 'ASAP Dispatch Offer' : 'Scheduled Offer'}
                          </span>
                          {(() => {
                            const meta = (offer.metadata || {}) as Record<string, any>;
                            const groupId = offer.multiCarGroupId || meta.multiCarGroupId;
                            const total = Number(offer.multiCarTotal || meta.multiCarTotal || offer.vehicleCount || 1);
                            const idx = Number(offer.multiCarIndex || meta.multiCarIndex || 1);
                            if (!(groupId || offer.multipleVehiclesRequested) || total <= 1) return null;
                            return (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-200 border border-violet-400/50">
                                MULTI-CAR · CAR {idx}/{total}
                              </span>
                            );
                          })()}
                        </div>
                        <span className="text-base font-black text-white font-mono">
                          ${offer.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                      </div>

                      <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-white block">
                            {offer.passenger?.firstName} {offer.passenger?.lastName}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {offer.passenger?.passengerCount || 1} Pax · {offer.passenger?.luggageCount || 0} Bags ·{' '}
                            {offer.bookingType === 'asap' ? 'Immediate' : pickupTime}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-blue-400 font-mono block">EST. DISTANCE</span>
                          <span className="text-xs font-bold text-white">
                            {offer.pricing?.distanceMiles?.toFixed(1) || '—'} mi
                          </span>
                        </div>
                      </div>

                      {/* Full Manifest on Offer Cards too! */}
                      <DriverTripManifest trip={offer} adminVehicles={adminVehicles} compact />

                      <div className="space-y-2 text-xs bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80">
                        <div className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold shrink-0">Pickup:</span>
                          <span className="text-slate-200">{offer.pickupLocation?.address}</span>
                        </div>
                        {offer.intermediateStops && offer.intermediateStops.length > 0 && (
                          <div className="pl-3 border-l border-dashed border-slate-700 space-y-1">
                            {offer.intermediateStops.map((s, i) => (
                              <div key={i} className="text-slate-300">
                                <span className="text-blue-400 font-bold">Stop {i + 1}:</span> {s.address}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <span className="text-rose-400 font-bold shrink-0">Dest:</span>
                          <span className="text-slate-200">{offer.dropoffLocation?.address}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleAcceptOffer(offer.id)}
                          className="py-3.5 min-h-[48px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {actionLoading === `accept-${offer.id}` ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : null}
                          <span>ACCEPT OFFER</span>
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleDeclineOffer(offer.id)}
                          className="py-3.5 min-h-[48px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer"
                        >
                          {actionLoading === `decline-${offer.id}` ? 'Declining...' : 'DECLINE'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: SCHEDULED / ASSIGNED QUEUE */}
        {currentTab === 'scheduled' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Scheduled Trips ({scheduledTrips.length})</h2>
              <p className="text-xs text-slate-400">Accepted and upcoming trips in your dispatch lineup</p>
            </div>

            {scheduledTrips.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-blue-400">
                  <ClockIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No Scheduled Trips</h3>
                <p className="text-xs max-w-xs">Assigned rides appear here in dispatch priority order.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledTrips.map((trip, idx) => {
                  const isCurrentActive = activeTrip?.id === trip.id;
                  const pickupTimeFormatted = trip.scheduledPickupTime
                    ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : 'ASAP';
                  const pickupDateFormatted = trip.scheduledPickupTime
                    ? new Date(trip.scheduledPickupTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
                    : 'Today';
                  const callInfo = resolveCallPassengerHref(trip);

                  return (
                    <div
                      key={trip.id}
                      className={`bg-slate-900 rounded-3xl p-4 border space-y-3 transition-all ${
                        isCurrentActive ? 'border-blue-600 shadow-xl' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-600/30">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5 text-blue-400" />
                            {trip.bookingType === 'asap' ? 'ASAP' : `${pickupTimeFormatted} · ${pickupDateFormatted}`}
                          </span>
                        </div>
                        <span className="text-xs font-black text-blue-400 font-mono">
                          ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {trip.passenger?.firstName} {trip.passenger?.lastName}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            <span>{trip.passenger?.passengerCount || 1} Pax</span>
                            <span>·</span>
                            <span>{trip.passenger?.luggageCount || 0} Bags</span>
                            <span>·</span>
                            <strong className="uppercase text-blue-300">{trip.status.replace('_', ' ')}</strong>
                          </div>
                        </div>
                        {trip.passenger?.phone && (
                          <a
                            href={callInfo.href}
                            className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center justify-center border border-slate-700"
                            title={callInfo.isMasked ? 'Call Passenger (Masked Proxy)' : 'Call Passenger'}
                          >
                            <PhoneIcon className="w-4 h-4" />
                          </a>
                        )}
                      </div>

                      {/* Manifest on Scheduled cards */}
                      <DriverTripManifest trip={trip} adminVehicles={adminVehicles} compact />

                      <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="text-emerald-400 font-bold block text-[10px] uppercase">Pickup:</span>
                            <span className="text-slate-200">{trip.pickupLocation?.address}</span>
                          </div>
                          {trip.pickupLocation?.address && (
                            <button
                              type="button"
                              onClick={() =>
                                openMapNavigation(
                                  trip.pickupLocation.address,
                                  preferredNavApp,
                                  trip.pickupLocation.coordinates
                                )
                              }
                              className="px-3 py-2 min-h-[40px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Maps
                            </button>
                          )}
                        </div>
                        {trip.intermediateStops && trip.intermediateStops.length > 0 && (
                          <div className="pl-2.5 border-l border-dashed border-slate-700 space-y-1">
                            {trip.intermediateStops.map((s, sIdx) => (
                              <div key={sIdx} className="text-slate-300">
                                <span className="text-blue-400 font-bold">Stop {sIdx + 1}:</span> {s.address}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-slate-800">
                          <div className="flex-1">
                            <span className="text-rose-400 font-bold block text-[10px] uppercase">Destination:</span>
                            <span className="text-slate-200">{trip.dropoffLocation?.address}</span>
                          </div>
                          {trip.dropoffLocation?.address && (
                            <button
                              type="button"
                              onClick={() =>
                                openMapNavigation(
                                  trip.dropoffLocation.address,
                                  preferredNavApp,
                                  trip.dropoffLocation.coordinates
                                )
                              }
                              className="px-3 py-2 min-h-[40px] bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Maps
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTripId(trip.id);
                          setCurrentTab('active');
                        }}
                        className={`w-full py-3 min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isCurrentActive
                            ? 'bg-blue-600 text-white font-black'
                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                        }`}
                      >
                        {isCurrentActive ? '✓ Active in Console' : 'Open as Active Ride'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 4: EARNINGS, SETTLEMENTS & TRIP HISTORY (Replaces placeholder Messages tab!) */}
        {currentTab === 'earnings' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSignIcon className="w-5 h-5 text-emerald-400" />
                  Earnings &amp; Settlement History
                </h2>
                <p className="text-xs text-slate-400">
                  Split: {Math.round((driver?.commissionRate ?? globalCommissionRate) * 100)}% Fare + 100% Tolls &amp; Tips
                </p>
              </div>
              <a
                href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                className="px-3 py-2 min-h-[40px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-300 font-bold text-xs rounded-xl flex items-center gap-1.5"
              >
                <PhoneIcon className="w-3.5 h-3.5" />
                <span>Dispatch</span>
              </a>
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Today Earned</span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  ${todaysEarningsTotal.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Payout Due</span>
                <span className="text-lg font-black font-mono text-blue-400">
                  ${totalCompanyOwesDriver.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Cash Comm.</span>
                <span className="text-lg font-black font-mono text-amber-400">
                  ${totalDriverOwesCompany.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payout Records List */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Recent Completed Settlements ({payoutHistory.length})
              </span>

              {payoutHistory.length === 0 && completedTrips.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No completed rides recorded yet. Completed Cash, Card Terminal, and Corporate rides appear here automatically.
                </p>
              ) : (
                <div className="space-y-2">
                  {payoutHistory.slice(0, 25).map((p) => {
                    const isCash = p.settlementDirection === 'driver_owes_company' || p.paymentMethod === 'cash';
                    return (
                      <div
                        key={p.id}
                        className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span className="font-mono text-blue-300">{p.tripId}</span>
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                isCash
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : p.paymentMethod === 'corporate_account'
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {(p.paymentMethod || 'card').replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Gross ${p.totalFare.toFixed(2)}
                            {p.tipAmount > 0 ? ` · Tip $${p.tipAmount.toFixed(2)}` : ''}
                            {p.tollsReimbursed > 0 ? ` · Tolls $${p.tollsReimbursed.toFixed(2)}` : ''}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(p.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {isCash ? (
                            <>
                              <span className="block text-[10px] text-amber-400 font-bold uppercase">Comm. Due</span>
                              <span className="text-sm font-black font-mono text-amber-300">
                                -${(p.companyCommissionOwed || p.platformFee).toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="block text-[10px] text-emerald-400 font-bold uppercase">Net Payout</span>
                              <span className="text-sm font-black font-mono text-emerald-400">
                                +${p.netPayout.toFixed(2)}
                              </span>
                            </>
                          )}
                          <span className="text-[9px] uppercase font-bold text-slate-500 block">{p.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 5: CALENDAR & WORKING HOURS */}
        {currentTab === 'schedule' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-400" />
                  Availability &amp; Working Hours
                </h2>
                <p className="text-xs text-slate-400">
                  Configure shift hours and advance days off for dispatch scheduling.
                </p>
              </div>
              {isScheduleDirty && (
                <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                  Unsaved
                </span>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                Regular Weekly Shift Hours
              </span>

              <div className="space-y-2">
                {DAYS_ORDER.map(({ key, label }) => {
                  const dayConfig = scheduleConfig.weeklyHours?.[key] || {
                    enabled: false,
                    startHour: '08:00',
                    endHour: '17:00',
                  };
                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        dayConfig.enabled
                          ? 'bg-slate-950/80 border-slate-700/80'
                          : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                      }`}
                    >
                      <label
                        htmlFor={`day-${key}`}
                        className="flex items-center gap-3 cursor-pointer select-none min-h-[40px]"
                      >
                        <input
                          type="checkbox"
                          checked={dayConfig.enabled}
                          onChange={() => handleToggleDay(key)}
                          id={`day-${key}`}
                          className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-white">{label}</span>
                      </label>

                      {dayConfig.enabled ? (
                        <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                          <input
                            type="time"
                            value={dayConfig.startHour}
                            onChange={(e) => handleTimeChange(key, 'startHour', e.target.value)}
                            className="flex-1 sm:flex-initial bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-2 outline-none text-xs text-center"
                          />
                          <span className="text-slate-400 text-xs px-1 shrink-0">to</span>
                          <input
                            type="time"
                            value={dayConfig.endHour}
                            onChange={(e) => handleTimeChange(key, 'endHour', e.target.value)}
                            className="flex-1 sm:flex-initial bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-2 outline-none text-xs text-center"
                          />
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-semibold italic">Off-duty / Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                Advance Notice Days Off
              </span>

              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">From Date</label>
                    <input
                      type="date"
                      min={formatLocalDateStr(new Date())}
                      value={newTimeOffStart}
                      onChange={(e) => setNewTimeOffStart(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">To Date</label>
                    <input
                      type="date"
                      min={newTimeOffStart || formatLocalDateStr(new Date())}
                      value={newTimeOffEnd}
                      onChange={(e) => setNewTimeOffEnd(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Reason / Note (e.g. Doctor appt, Vacation)"
                  value={newTimeOffReason}
                  onChange={(e) => setNewTimeOffReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-600"
                />

                <button
                  type="button"
                  onClick={handleAddTimeOff}
                  className="w-full py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-400 font-bold text-xs rounded-xl cursor-pointer"
                >
                  + Add Advance Notice Days Off
                </button>
              </div>

              {scheduleConfig.timeOffList && scheduleConfig.timeOffList.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {scheduleConfig.timeOffList.map((to) => (
                    <div
                      key={to.id}
                      className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {to.startDate} to {to.endDate}
                        </div>
                        {to.reason && <p className="text-[11px] text-slate-400 mt-0.5">{to.reason}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTimeOff(to.id)}
                        className="w-10 h-10 text-rose-400 hover:bg-rose-500/10 rounded-xl flex items-center justify-center cursor-pointer"
                        title="Remove time off"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">No scheduled days off registered.</p>
              )}

              <div className="pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSavingSchedule}
                  onClick={handleSaveSchedule}
                  className="w-full py-3.5 min-h-[48px] bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl shadow-xl cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSavingSchedule ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : null}
                  <span>SAVE AVAILABILITY &amp; CALENDAR</span>
                </button>
              </div>
            </div>
          </section>
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

      {/* SHIFT VEHICLE PICKER MODAL (Backed by `/fleet`) */}
      {showVehiclePickerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-base text-white">Select Shift Vehicle</h4>
                <p className="text-xs text-slate-400">Choose your active cab from the fleet roster</p>
              </div>
              <button
                type="button"
                onClick={() => setShowVehiclePickerModal(false)}
                className="w-11 h-11 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {fleetAssets.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No active vehicles found in `/fleet`. Contact dispatch to assign a cab.
              </p>
            ) : (
              <div className="space-y-2">
                {fleetAssets.map((asset) => {
                  const isCurrent =
                    driver?.vehicleId === asset.id ||
                    (driver?.vehicleUnit && driver.vehicleUnit === asset.unitNumber);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      disabled={actionLoading === 'vehicle'}
                      onClick={() => handleSelectFleetVehicle(asset)}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-slate-950/70 border-slate-800 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm">{formatCabUnitLabel(asset.unitNumber)}</div>
                        <div className="text-xs text-slate-400">
                          {asset.year} {asset.color} {asset.make} {asset.model}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Plate: {asset.licensePlate} · {formatVehicleTierDisplay(asset.vehicleTypeId, adminVehicles)}
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PASSENGER NO-SHOW / CANCEL MODAL */}
      {showNoShowModal && modalTrip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-base text-white">Report No-Show / Cancel Ride</h4>
                <span className="text-xs text-slate-400">Trip {modalTrip.id}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNoShowModal(false);
                  setModalTripId(null);
                }}
                className="w-11 h-11 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {[
                'Passenger no-show after 10 min wait',
                'Passenger cancelled at curb',
                'Unsafe pickup location / unable to locate',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNoShowReason(preset)}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold border cursor-pointer ${
                    noShowReason === preset
                      ? 'bg-rose-950/60 border-rose-500 text-rose-200'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
              <input
                type="text"
                value={noShowReason}
                onChange={(e) => setNoShowReason(e.target.value)}
                placeholder="Custom reason..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNoShowModal(false);
                  setModalTripId(null);
                }}
                className="flex-1 py-3 min-h-[44px] bg-slate-800 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Keep Ride
              </button>
              <button
                type="button"
                disabled={actionLoading === 'cancel_noshow'}
                onClick={handleDriverCancelOrNoShow}
                className="flex-1 py-3 min-h-[44px] bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl cursor-pointer"
              >
                {actionLoading === 'cancel_noshow' ? 'Submitting...' : 'Confirm Cancel / No-Show'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSENGER SMS MODAL (Uses server relay without leaking raw passenger phone) */}
      {showSmsModal && modalTrip?.passenger?.phone && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Text Passenger (Relay)</h4>
                  <span className="text-[11px] text-slate-400">
                    {modalTrip.passenger?.firstName} ({maskPhoneForDisplay(modalTrip.passenger.phone)})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSmsModal(false);
                  setModalTripId(null);
                }}
                className="w-11 h-11 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {[
                { title: 'En Route', text: 'Chesterfield Taxi: Your driver is en route to your pickup location.' },
                { title: 'Arrived Outside', text: 'Chesterfield Taxi: Your driver has arrived outside at your pickup location.' },
                { title: 'Waiting at Curb', text: 'Chesterfield Taxi: Your chauffeur is waiting at the curb for you.' },
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomSmsText(preset.text)}
                  className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl text-left border border-slate-700/80 cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-blue-400 block">{preset.title}</span>
                  <span className="text-xs text-slate-300">{preset.text}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={customSmsText}
              onChange={(e) => setCustomSmsText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-600"
            />

            {twilioSmsFeedback && (
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-blue-300 flex items-center gap-2">
                {isSendingTwilioSms && <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                <span>{twilioSmsFeedback}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSmsModal(false);
                  setModalTripId(null);
                }}
                className="flex-1 py-3 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingTwilioSms || !customSmsText.trim()}
                onClick={handleSendTwilioSms}
                className="flex-[2] py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MailIcon className="w-4 h-4" />
                <span>{isSendingTwilioSms ? 'Sending...' : 'Send via Chesterfield Relay'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD POST-BOOKING TOLL / EXTRA MODAL (with Category Picker & Canonical Breakdown Sync) */}
      {showExtrasModal && modalTrip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-base text-white">Add Toll / Extra to Fare</h4>
                <p className="text-[11px] text-slate-400">
                  Tolls are 100% driver pass-through; other extras follow commission split
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowExtrasModal(false);
                  setModalTripId(null);
                }}
                className="w-11 h-11 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_EXTRAS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={actionLoading === 'extra'}
                  onClick={() =>
                    handleAddExtra({
                      id: 'extra-' + Date.now() + '-' + idx,
                      name: preset.name,
                      amount: preset.amount,
                      category: preset.category,
                    })
                  }
                  className="p-3 min-h-[44px] bg-slate-800 hover:bg-slate-700/80 rounded-xl text-left flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <span>
                    {preset.name}{' '}
                    <span className="text-[10px] text-slate-400 uppercase">({preset.category})</span>
                  </span>
                  <span className="font-bold text-blue-400 font-mono">+${preset.amount.toFixed(2)}</span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Custom Extra / Surcharge:
              </span>
              <div className="grid grid-cols-5 gap-1">
                {(['toll', 'parking', 'luggage', 'cleaning', 'custom'] as DriverMeterExtra['category'][]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCustomExtraCategory(cat)}
                    className={`py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer border ${
                      customExtraCategory === cat
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Reason / Description"
                  value={customExtraName}
                  onChange={(e) => setCustomExtraName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-600"
                />
                <input
                  type="number"
                  step="0.50"
                  min="0.50"
                  placeholder="$0.00"
                  value={customExtraAmount}
                  onChange={(e) => setCustomExtraAmount(e.target.value)}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-blue-400 font-bold outline-none focus:border-blue-600 text-right font-mono"
                />
              </div>

              <button
                type="button"
                disabled={!customExtraName.trim() || !customExtraAmount || actionLoading === 'extra'}
                onClick={() => {
                  const amt = parseFloat(customExtraAmount);
                  if (isNaN(amt) || amt <= 0) return;
                  handleAddExtra({
                    id: 'extra-custom-' + Date.now(),
                    name: customExtraName.trim(),
                    amount: amt,
                    category: customExtraCategory,
                  });
                }}
                className="w-full py-3 min-h-[44px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
              >
                Attach Extra to Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-CAB SETTLEMENT & CHECKOUT TERMINAL MODAL (Cash / External Card Terminal / Corporate / Stripe Pre-Auth) */}
      {showTerminalModal && modalTrip && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-5 text-white my-auto">
            {completedPayoutReceipt ? (
              /* RECONCILED RECEIPT & DRIVER SETTLEMENT SUMMARY (ZERO DOUBLE-COUNT!) */
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
                  <CheckIcon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Ride Completed &amp; Reconciled</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Settled via {(completedPayoutReceipt.paymentMethod || 'card_terminal').replace('_', ' ').toUpperCase()}
                  </p>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Base Ride Fare:</span>
                    <span className="font-mono text-slate-200">
                      ${(completedPayoutReceipt.baseFareAmount ?? completedPayoutReceipt.totalFare).toFixed(2)}
                    </span>
                  </div>
                  {(completedPayoutReceipt.nonTollExtrasAmount || 0) > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Non-Toll Extras (Split):</span>
                      <span className="font-mono font-bold">
                        +${(completedPayoutReceipt.nonTollExtrasAmount || 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {completedPayoutReceipt.tollsReimbursed > 0 && (
                    <div className="flex justify-between text-blue-400">
                      <span>Tolls (100% Pass-Through):</span>
                      <span className="font-mono font-bold">
                        +${completedPayoutReceipt.tollsReimbursed.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {completedPayoutReceipt.tipAmount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Gratuity / Tip (100% Driver):</span>
                      <span className="font-mono font-bold">+${completedPayoutReceipt.tipAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-800 pt-2 flex justify-between font-black text-sm text-white">
                    <span>Passenger Grand Total:</span>
                    <span className="font-mono">${completedPayoutReceipt.totalFare.toFixed(2)}</span>
                  </div>
                </div>

                {completedPayoutReceipt.settlementDirection === 'driver_owes_company' ? (
                  <div className="bg-amber-950/50 border border-amber-700/70 rounded-2xl p-4 text-left space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Cash Ride Settlement
                    </span>
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-300">Cash Collected in Cab:</span>
                      <span className="text-base font-black text-white font-mono">
                        ${(completedPayoutReceipt.driverCashCollected || completedPayoutReceipt.totalFare).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-amber-300 font-semibold">
                        Company Commission Owed ({Math.round((1 - (completedPayoutReceipt.commissionRate ?? 0.75)) * 100)}%):
                      </span>
                      <span className="text-xl font-black text-amber-400 font-mono">
                        ${(completedPayoutReceipt.companyCommissionOwed || completedPayoutReceipt.platformFee).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-amber-500/80">Ref: {completedPayoutReceipt.id}</p>
                  </div>
                ) : (
                  <div className="bg-emerald-950/50 border border-emerald-800/80 rounded-2xl p-4 text-left space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                      Driver Net Payout Logged
                    </span>
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        ${completedPayoutReceipt.netPayout.toFixed(2)}
                      </span>
                      <span className="text-[11px] text-emerald-300 font-semibold">
                        ({Math.round((completedPayoutReceipt.commissionRate ?? 0.75) * 100)}% Fare + 100% Tolls/Tip)
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-emerald-500/80">
                      Payout Ref: {completedPayoutReceipt.id} · {completedPayoutReceipt.status.toUpperCase()}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowTerminalModal(false);
                    setCompletedPayoutReceipt(null);
                    setModalTripId(null);
                    setMeterSeconds(0);
                    setMeterWaitSeconds(0);
                    setMeterDistance(0);
                    setActiveTripId(null);
                  }}
                  className="w-full py-3.5 min-h-[48px] bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl shadow-lg cursor-pointer"
                >
                  Return to Shift Roster
                </button>
              </div>
            ) : (
              /* PAY-IN-CAB SETTLEMENT PROMPT */
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="font-black text-base text-white">In-Cab Settlement &amp; Checkout</h4>
                    <p className="text-[11px] text-slate-400">Trip {modalTrip.id} · Select payment &amp; gratuity</p>
                  </div>
                  <button
                    type="button"
                    disabled={isProcessingPayment}
                    onClick={() => {
                      setShowTerminalModal(false);
                      setModalTripId(null);
                    }}
                    className="w-11 h-11 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {(() => {
                  const snap = computeRideFareSnapshot(modalTrip);
                  let calculatedTip = 0;
                  if (tipSelection === 'custom') {
                    calculatedTip = Math.max(0, Number((parseFloat(customTipValue) || 0).toFixed(2)));
                  } else if (typeof tipSelection === 'number' && tipSelection > 0) {
                    calculatedTip = Number(((snap.subtotalFare * tipSelection) / 100).toFixed(2));
                  }
                  const grandTotal = Number((snap.subtotalFare + calculatedTip).toFixed(2));
                  const hasStripePreAuth =
                    stripeOnlineEnabled &&
                    modalTrip.payment?.status === 'authorized' &&
                    Boolean(modalTrip.payment?.paymentIntentId?.startsWith('pi_'));
                  const meta = (modalTrip.metadata || {}) as Record<string, any>;

                  return (
                    <div className="space-y-4">
                      {/* Accurate Breakdown Box */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>{snap.isQuotedLocked ? 'Quoted Ride Fare' : 'Metered Ride Fare'}:</span>
                          <span className="font-mono text-white font-bold">${snap.baseRideFare.toFixed(2)}</span>
                        </div>
                        {snap.nonTollExtrasTotal > 0 && (
                          <div className="flex justify-between text-slate-400">
                            <span>In-Cab Extras (Split):</span>
                            <span className="font-mono text-white">+${snap.nonTollExtrasTotal.toFixed(2)}</span>
                          </div>
                        )}
                        {snap.tollsTotal > 0 && (
                          <div className="flex justify-between text-blue-300">
                            <span>Tolls (100% Driver):</span>
                            <span className="font-mono">+${snap.tollsTotal.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="pt-1.5 border-t border-slate-800 flex justify-between font-black text-sm text-white">
                          <span>Subtotal Before Tip</span>
                          <span className="font-mono">${snap.subtotalFare.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Settlement Mode Selector (Pay-in-Cab Priority) */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Settlement Method:
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setSettlementMethod('card_terminal')}
                            className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                              settlementMethod === 'card_terminal'
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            Card Terminal
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettlementMethod('cash')}
                            className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                              settlementMethod === 'cash'
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            Cash in Cab
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettlementMethod('corporate_account')}
                            className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                              settlementMethod === 'corporate_account'
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            Corp Account
                          </button>
                        </div>

                        {hasStripePreAuth && (
                          <button
                            type="button"
                            onClick={() => setSettlementMethod('stripe_preauth')}
                            className={`w-full py-2.5 px-3 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                              settlementMethod === 'stripe_preauth'
                                ? 'bg-indigo-600 border-indigo-400 text-white'
                                : 'bg-slate-800 border-slate-700 text-indigo-300'
                            }`}
                          >
                            Capture Online Stripe Pre-Auth Hold
                            {modalTrip.payment?.cardLast4 ? ` (•••• ${modalTrip.payment.cardLast4})` : ''}
                          </button>
                        )}

                        {settlementMethod === 'card_terminal' && (
                          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-400">Card Last 4 (optional):</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="1234"
                              value={cardLast4Input}
                              onChange={(e) => setCardLast4Input(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-center font-mono text-white outline-none focus:border-blue-500"
                            />
                          </div>
                        )}

                        {settlementMethod === 'corporate_account' && (
                          <div className="bg-purple-950/40 border border-purple-800/60 rounded-xl p-3 text-xs text-purple-200">
                            <strong>B2B Direct Bill:</strong>{' '}
                            {meta.corporateOrgName || meta.corporateDetails?.companyName || 'Corporate Account'}
                            {meta.billingPo || meta.corporateDetails?.billingPo
                              ? ` · PO #${meta.billingPo || meta.corporateDetails?.billingPo}`
                              : ''}
                            <span className="block text-[11px] text-purple-300/80 mt-0.5">
                              No card charged in cab — logged to Corporate AR for monthly invoicing.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tip Selection */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Gratuity / Tip (100% Driver):
                        </span>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'No Tip', value: 0 },
                            { label: '15%', value: 15 },
                            { label: '20%', value: 20 },
                            { label: '25%', value: 25 },
                          ].map((opt) => {
                            const isSelected = tipSelection === opt.value;
                            const tipValue = opt.value > 0 ? (snap.subtotalFare * opt.value) / 100 : 0;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTipSelection(opt.value)}
                                className={`py-2.5 px-1 min-h-[48px] rounded-xl text-center border font-bold text-xs cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}
                              >
                                <div>{opt.label}</div>
                                {opt.value > 0 && (
                                  <div className="text-[10px] font-normal opacity-80 font-mono">
                                    +${tipValue.toFixed(2)}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setTipSelection('custom')}
                            className={`py-2.5 px-3 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer shrink-0 ${
                              tipSelection === 'custom'
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            Custom Tip ($)
                          </button>
                          {tipSelection === 'custom' && (
                            <input
                              type="number"
                              step="0.50"
                              min="0"
                              placeholder="e.g. 5.00"
                              value={customTipValue}
                              onChange={(e) => setCustomTipValue(e.target.value)}
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 font-mono"
                              autoFocus
                            />
                          )}
                        </div>
                      </div>

                      {/* Grand Total */}
                      <div className="bg-blue-950/40 border border-blue-800/80 rounded-2xl p-4 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
                            {settlementMethod === 'cash'
                              ? 'Cash to Collect'
                              : settlementMethod === 'corporate_account'
                              ? 'Total to Bill Account'
                              : 'Total to Charge'}
                          </span>
                          <span className="text-xs text-slate-400">Includes fare, extras, tolls &amp; tip</span>
                        </div>
                        <span className="text-2xl font-black font-mono text-emerald-400">
                          ${grandTotal.toFixed(2)}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={isProcessingPayment}
                        onClick={handleProcessTerminalPayment}
                        className="w-full py-4 min-h-[54px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-xl cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isProcessingPayment ? (
                          <>
                            <SpinnerIcon className="w-5 h-5 animate-spin" />
                            <span>Finalizing Settlement...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheckIcon className="w-5 h-5" />
                            <span>
                              {settlementMethod === 'cash'
                                ? 'Confirm Cash Collected & Complete'
                                : settlementMethod === 'corporate_account'
                                ? 'Log Corporate Direct Bill & Complete'
                                : settlementMethod === 'stripe_preauth'
                                ? 'Capture Stripe Pre-Auth & Complete'
                                : 'Confirm Card Terminal & Complete'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
