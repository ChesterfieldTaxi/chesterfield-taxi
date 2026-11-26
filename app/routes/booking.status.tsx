import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { getBookingService } from '../core/services/booking';
import { getFirestoreDb, isFirebaseConfigured } from '../core/services/firebase';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import type { Trip, TripStatus } from '../core/types/trip';
import type { VehicleTierConfig } from '../core/types/config';
import type { PublicTripTrackingProjection } from '../core/utils/tracking-token.util';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { PhoneIcon, SpinnerIcon, SearchIcon, ShieldCheckIcon, CheckIcon, ClockIcon } from '../components/ui/Icons';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { getEffectiveRoles } from '../core/utils/workspace-routing.util';
import { CustomerTelemetryMap } from '../components/domain/tracking/CustomerTelemetryMap';
import { GuestManageRidePanel } from '../components/domain/tracking/GuestManageRidePanel';
import { PriceBreakdownPanel } from '../components/domain/booking/PriceBreakdownPanel';
import { getWorkspaceBus } from '../core/services/workspace-bus.service';
import { formatVehicleTierDisplay } from '../core/utils/vehicle-tier-format.util';

export function meta() {
  return [
    { title: 'Track Your Ride – Chesterfield Taxi' },
    { name: 'description', content: 'Track your ride live with driver ETA and status updates.' },
  ];
}

const LIFECYCLE_STEPS: Array<{ key: TripStatus; label: string; desc: string }> = [
  { key: 'UNCONFIRMED', label: 'Requested', desc: 'Ride request received, awaiting dispatch confirmation' },
  { key: 'CONFIRMED', label: 'Confirmed', desc: 'Confirmed and matching nearest available driver' },
  { key: 'assigned', label: 'Driver Assigned', desc: 'Your driver and car have been assigned' },
  { key: 'en_route', label: 'Driver En Route', desc: 'Your driver is on the way to your pickup address' },
  { key: 'arrived', label: 'Driver Arrived', desc: 'Your driver is waiting outside at pickup' },
  { key: 'in_progress', label: 'On Trip', desc: 'Your ride is in progress' },
  { key: 'completed', label: 'Completed', desc: 'Trip completed. Thank you for riding with us!' },
];

const TOKEN_PATTERN = /^trk_[a-zA-Z0-9_-]{16,80}$/;

export default function BookingStatusRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawParam = (params.tripToken || params.tripId || searchParams.get('id') || '').trim();
  const isDirectToken = TOKEN_PATTERN.test(rawParam);
  const normalizedTripId = !isDirectToken && rawParam ? rawParam.replace(/^#/, '').toUpperCase() : '';

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [adminVehicles, setAdminVehicles] = useState<VehicleTierConfig[]>([]);

  // Authenticated full Trip view vs Zero-PII Guest Tracking view
  const [trip, setTrip] = useState<Trip | null>(null);
  const [publicTracking, setPublicTracking] = useState<PublicTripTrackingProjection | null>(null);
  const [activeTrackingToken, setActiveTrackingToken] = useState<string>(isDirectToken ? rawParam : '');

  const [isLoading, setIsLoading] = useState(Boolean(rawParam));
  const [error, setError] = useState<string | null>(null);

  // Guest manual lookup / last-4 phone verification inputs
  const [searchRef, setSearchRef] = useState(normalizedTripId);
  const [phoneLast4Input, setPhoneLast4Input] = useState(() => {
    const qPhone = searchParams.get('phone') || '';
    return qPhone.replace(/\D/g, '').slice(-4);
  });
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Subscribe to Auth & Admin Vehicles (for custom vehicle display names)
  useEffect(() => {
    const unsubAuth = getAdminAuthService().onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthResolved(true);
    });
    const unsubCfg = getAdminConfigService().subscribeToSettings((s) => {
      if (s.vehicles?.length) setAdminVehicles(s.vehicles);
    });
    return () => {
      unsubAuth();
      if (typeof unsubCfg === 'function') unsubCfg();
    };
  }, []);

  // 1. Direct Token Mode (`/track/trk_...`) -> Zero-PII live tracking without phone gate!
  useEffect(() => {
    if (!activeTrackingToken) return;
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // Initial server API fetch (verifies token & works even if client Firestore is cold)
    fetch(`/api/track?token=${encodeURIComponent(activeTrackingToken)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (res.ok && json?.tracking) {
          setPublicTracking(json.tracking as PublicTripTrackingProjection);
          setError(null);
        } else if (!isFirebaseConfigured()) {
          setError(json?.error || 'Live tracking link was not found.');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Live real-time subscription to zero-PII `/tripTracking/{trackingToken}`
    let unsubFirestore: (() => void) | undefined;
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        unsubFirestore = onSnapshot(
          doc(db, 'tripTracking', activeTrackingToken),
          (snap) => {
            if (!isMounted) return;
            if (snap.exists()) {
              setPublicTracking(snap.data() as PublicTripTrackingProjection);
              setError(null);
              setIsLoading(false);
            }
          },
          (err) => {
            console.warn('[BookingStatus] tripTracking snapshot warning:', err);
          }
        );
      } catch {}
    }

    return () => {
      isMounted = false;
      if (unsubFirestore) unsubFirestore();
    };
  }, [activeTrackingToken]);

  // 2. Authenticated Owner / Staff Mode (`/booking/status/CT-...` or `/track/CT-...`)
  useEffect(() => {
    if (!normalizedTripId || isDirectToken || !authResolved) {
      if (!rawParam) {
        setTrip(null);
        setPublicTracking(null);
        setIsLoading(false);
      }
      return;
    }

    // If unauthenticated guest visited `/track/CT-...`, do NOT query `/trips/{id}` (zero PII leak!)
    // Instead check if they already verified via `/api/track` in this session, else show Last-4 Phone verification form.
    if (!currentUser) {
      try {
        const savedToken = sessionStorage.getItem(`ct_track_token_${normalizedTripId}`);
        if (savedToken && TOKEN_PATTERN.test(savedToken)) {
          setActiveTrackingToken(savedToken);
          return;
        }
      } catch {}
      setTrip(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const bookingService = getBookingService();
    const userRoles = getEffectiveRoles(currentUser);
    const isStaff =
      userRoles.includes('admin') ||
      userRoles.includes('dispatcher') ||
      userRoles.includes('driver');

    const checkOwnershipOrFallback = (loaded: Trip) => {
      const isOwner =
        (loaded.customerId && currentUser.uid === loaded.customerId) ||
        (loaded.userId && currentUser.uid === loaded.userId) ||
        (loaded.passenger?.email &&
          currentUser.email &&
          loaded.passenger.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase());
      if (isStaff || isOwner) {
        setTrip(loaded);
        setError(null);
      } else {
        setTrip(null);
      }
    };

    bookingService
      .getBookingStatus(normalizedTripId)
      .then((res) => {
        if (!isMounted) return;
        if (res?.trip) {
          checkOwnershipOrFallback(res.trip);
        } else {
          setTrip(null);
        }
      })
      .catch(() => {
        if (isMounted) setTrip(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    let unsubBooking: (() => void) | undefined;
    if (bookingService.subscribeToBooking) {
      unsubBooking = bookingService.subscribeToBooking(
        normalizedTripId,
        (updatedTrip) => {
          if (isMounted) checkOwnershipOrFallback(updatedTrip);
        },
        () => {}
      );
    }

    // Same-browser WorkspaceBus telemetry mirror (case-insensitive Trip ID match!)
    const unsubBus = getWorkspaceBus().subscribe((msg) => {
      if (
        msg.type === 'DRIVER_TELEMETRY_PING' &&
        String(msg.payload?.tripId || '').toUpperCase() === normalizedTripId
      ) {
        const ping = {
          coordinates: msg.payload.coordinates,
          speedMph: msg.payload.speedMph,
          heading: msg.payload.heading,
          accuracy: msg.payload.accuracy,
          timestamp: msg.payload.timestamp,
          status: msg.payload.status,
          isOfflineBuffer: msg.payload.isOfflineBuffer,
        };
        setTrip((prev) => (prev ? { ...prev, driverTelemetry: ping, currentLocation: ping } : prev));
        setPublicTracking((prev) => (prev ? { ...prev, driverTelemetry: ping } : prev));
      }
    });

    return () => {
      isMounted = false;
      if (unsubBooking) unsubBooking();
      unsubBus();
    };
  }, [normalizedTripId, isDirectToken, currentUser, authResolved, rawParam]);

  // Server-side Last-4 Phone verification via POST /api/track (rate-limited, zero PII!)
  const handleGuestLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);
    const cleanId = (searchRef || normalizedTripId).trim().replace(/^#/, '').toUpperCase();
    const digits = phoneLast4Input.replace(/\D/g, '');
    const last4 = digits.slice(-4);

    if (!cleanId) {
      setVerifyError('Please enter your Trip # (e.g., CT-1234-5678).');
      return;
    }
    if (last4.length !== 4) {
      setVerifyError('Please enter the last 4 digits of the phone number on the booking.');
      return;
    }

    setIsVerifying(true);
    try {
      const resp = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: cleanId, phoneLast4: last4 }),
      });
      const json = (await resp.json().catch(() => ({}))) as any;

      if (resp.ok && json?.success && json?.trackingToken && json?.tracking) {
        try {
          sessionStorage.setItem(`ct_track_token_${cleanId}`, json.trackingToken);
        } catch {}
        setPublicTracking(json.tracking as PublicTripTrackingProjection);
        setActiveTrackingToken(json.trackingToken);
        navigate(`/track/${encodeURIComponent(json.trackingToken)}`, { replace: true });
      } else {
        setVerifyError(
          json?.error ||
            'Trip not found or the last 4 phone digits did not match. Please double-check and try again.'
        );
      }
    } catch {
      setVerifyError('Could not look up trip right now. Please try again or call dispatch.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <SpinnerIcon className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-fg-strong">Loading Live Trip Status...</h2>
        <p className="text-sm text-fg-muted mt-1">Getting the latest driver and ETA updates.</p>
      </div>
    );
  }

  // Case 1: Lookup Landing OR Guest Phone Last-4 Verification Gate
  if (!trip && !publicTracking) {
    const isVerifyingSpecificId = Boolean(normalizedTripId && !error);
    return (
      <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-surface-card rounded-3xl border border-border-subtle text-center shadow-xl">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold ${
            error ? 'bg-status-danger-bg-strong text-rose-600' : isVerifyingSpecificId ? 'bg-status-warning-bg text-amber-600' : 'bg-status-info-bg text-blue-600'
          }`}
        >
          {error ? '!' : isVerifyingSpecificId ? <PhoneIcon className="w-6 h-6" /> : <SearchIcon className="w-6 h-6" />}
        </div>
        <h1 className="text-xl font-black text-fg-primary">
          {error
            ? 'Tracking Link Unavailable'
            : isVerifyingSpecificId
            ? 'Verify Last 4 Phone Digits'
            : 'Track Your Ride'}
        </h1>
        <p className="text-xs text-fg-secondary mt-2 mb-6 leading-relaxed">
          {error ||
            (isVerifyingSpecificId
              ? `To protect your privacy for Trip #${normalizedTripId}, enter the last 4 digits of the phone number on the booking (or open the tracking link from your text or email).`
              : 'Enter your Trip # and the last 4 digits of the phone number on the booking to view live driver tracking and ETA.')}
        </p>

        {verifyError && (
          <div className="mb-4 p-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-xs font-semibold text-status-danger-fg text-left">
            {verifyError}
          </div>
        )}

        <form onSubmit={handleGuestLookupSubmit} className="mb-6 space-y-3 text-left">
          <div>
            <label htmlFor="track-trip-id" className="block text-xs font-bold text-fg-secondary uppercase tracking-wider mb-1">
              Trip #
            </label>
            <input
              id="track-trip-id"
              type="text"
              required
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value.toUpperCase())}
              placeholder="e.g. CT-4821-9034"
              className="w-full px-3.5 py-2.5 text-base sm:text-sm font-mono border border-border-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-fg-strong"
            />
          </div>
          <div>
            <label htmlFor="track-phone-last4" className="block text-xs font-bold text-fg-secondary uppercase tracking-wider mb-1">
              Last 4 Digits of Phone Number
            </label>
            <input
              id="track-phone-last4"
              type="tel"
              inputMode="numeric"
              required
              value={phoneLast4Input}
              onChange={(e) => setPhoneLast4Input(e.target.value)}
              placeholder="e.g. 0199 (or full phone number)"
              className="w-full px-3.5 py-2.5 text-base sm:text-sm font-mono border border-border-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-fg-strong"
            />
          </div>
          <button
            type="submit"
            disabled={isVerifying}
            className="w-full py-3 bg-surface-header text-white font-bold text-sm rounded-xl hover:bg-surface-header-elevated disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            {isVerifying ? 'Verifying...' : 'Track Live Status'}
          </button>
        </form>

        <div className="flex items-center justify-center gap-3 pt-4 border-t border-border-faint">
          <Link
            to="/book"
            className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors"
          >
            Book a Ride
          </Link>
          <a
            href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
            className="px-4 py-2 bg-surface-muted text-fg-secondary font-bold text-sm rounded-xl hover:bg-surface-emphasis transition-colors"
          >
            Call Dispatch
          </a>
        </div>
      </div>
    );
  }

  // Unified display metadata (full Trip for authenticated owner/staff, or zero-PII PublicTripTrackingProjection for guests)
  const displayTripId = trip ? trip.id : publicTracking!.tripId;
  const displayStatus = (trip ? trip.status : publicTracking!.status) as TripStatus;
  const normalizedStatus = String(displayStatus || '').toLowerCase();

  // Fix stepper: `offered` (unaccepted broadcast) stays at Step 1 ("Finding Nearest Chauffeur")!
  const getStepIndex = (s: string) => {
    if (s.includes('unconfirm')) return 0;
    if (s.includes('confirm') || s === 'pending' || s === 'offered') return 1;
    if (s === 'assigned' || s === 'accepted') return 2;
    if (s === 'en_route') return 3;
    if (s === 'arrived') return 4;
    if (s === 'in_progress') return 5;
    if (s === 'completed') return 6;
    return 1;
  };

  const currentStepIdx = getStepIndex(normalizedStatus);
  const isCancelled =
    displayStatus === 'cancelled' || displayStatus === 'DECLINED' || normalizedStatus === 'declined';

  const tripMeta = (trip?.metadata || {}) as Record<string, any>;
  const vehicleDisplayName = trip
    ? (typeof tripMeta.vehicleDisplayName === 'string' && tripMeta.vehicleDisplayName.trim()) ||
      formatVehicleTierDisplay(trip.vehicleTier, adminVehicles)
    : publicTracking!.vehicleDisplayName ||
      formatVehicleTierDisplay(publicTracking!.vehicleTier, adminVehicles);

  const driverFirstName = trip
    ? String(tripMeta.assignedDriverName || tripMeta.driverName || '').trim().split(/\s+/)[0] || undefined
    : publicTracking!.assignedDriverFirstName;

  const displayPickup = trip ? trip.pickupLocation?.address : publicTracking!.pickupDisplay;
  const displayDropoff = trip ? trip.dropoffLocation?.address : publicTracking!.dropoffDisplay;
  const displayStops = trip
    ? (trip.intermediateStops || []).map((s) => s.address)
    : (publicTracking!.intermediateStops || []).map((s) => s.display);

  const rawPickupTs =
    trip?.scheduledPickupTime ||
    trip?.actualPickupTime ||
    publicTracking?.scheduledPickupTime ||
    trip?.createdAt;
  const pickupTimeDisplay = rawPickupTs
    ? new Date(rawPickupTs).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="py-4 sm:py-10 bg-gradient-to-b from-surface-subtle via-surface-card to-status-info-bg/20 flex-1 pb-24 sm:pb-28">
      <div className="max-w-2xl mx-auto px-3 sm:px-4">
        {/* Header Summary (Compact on mobile so Live Map appears immediately) */}
        <div className="bg-surface-header text-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-xl mb-4 sm:mb-6 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-400 flex items-center gap-1.5 min-w-0 truncate">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{trip ? 'Live Ride Status' : 'Live Trip Tracking'}</span>
            </span>
            <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shrink-0">
              {displayStatus.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Pickup Date & Time Prominent + Full Trip ID Secondary */}
          {pickupTimeDisplay ? (
            <>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-blue-400 shrink-0" />
                <span>{pickupTimeDisplay}</span>
              </h1>
              <p className="text-xs font-mono text-fg-subtle mt-0.5 break-all">
                Trip #{displayTripId}
              </p>
            </>
          ) : (
            <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight font-mono break-all">
              #{displayTripId}
            </h1>
          )}

          {trip && (
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5">
              Passenger:{' '}
              <strong className="text-white">
                {trip.passenger?.firstName} {trip.passenger?.lastName}
              </strong>
            </p>
          )}
          {driverFirstName && (
            <p className="text-xs text-emerald-300 mt-1 font-semibold">
              Driver: {driverFirstName}
              {(trip?.assignedVehicle?.vehicleNumber || publicTracking?.assignedVehicle?.vehicleNumber)
                ? ` · ${trip?.assignedVehicle?.vehicleNumber || publicTracking?.assignedVehicle?.vehicleNumber}`
                : ''}
            </p>
          )}

          <div className="mt-4 pt-3.5 sm:mt-5 sm:pt-5 border-t border-border-header grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <span className="text-[10.5px] text-fg-subtle uppercase font-mono block">Vehicle</span>
              <span className="text-sm font-bold text-white">{vehicleDisplayName}</span>
            </div>
            {trip ? (
              <div className="text-right">
                <span className="text-[10.5px] text-fg-subtle uppercase font-mono block">Fare Total</span>
                <span className="text-lg font-black text-amber-400 font-mono">
                  ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                </span>
              </div>
            ) : (
              <div className="text-right">
                <span className="text-[10.5px] text-fg-subtle uppercase font-mono block">Privacy</span>
                <span className="text-xs font-bold text-emerald-400">Personal Info Protected</span>
              </div>
            )}
          </div>
        </div>

        {/* Live Driver Map */}
        <CustomerTelemetryMap
          trip={trip}
          tracking={publicTracking}
          adminVehicles={adminVehicles}
          className="mb-4 sm:mb-6"
        />

        {/* Real-time Status Timeline */}
        <div className="bg-surface-card rounded-2xl sm:rounded-3xl border border-border-subtle/80 p-4 sm:p-7 shadow-lg mb-4 sm:mb-6">
          <h2 className="text-sm font-black text-fg-primary uppercase tracking-wider mb-5 flex items-center justify-between">
            <span>Ride Progress</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold normal-case">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live
            </span>
          </h2>

          {isCancelled ? (
            <div className="p-4 bg-status-danger-bg border border-status-danger-border rounded-2xl text-status-danger-fg text-sm">
              <strong className="block font-bold">This trip was cancelled / declined.</strong>
              {trip?.cancellationReason && (
                <p className="text-xs mt-1 text-status-danger-fg">Reason: {trip.cancellationReason}</p>
              )}
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 space-y-5 sm:space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-emphasis">
              {LIFECYCLE_STEPS.map((step, idx) => {
                const isPassed = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div key={step.key} className="relative flex items-start gap-4">
                    <div
                      className={
                        'absolute -left-6 sm:-left-8 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ' +
                        (isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                          : isPassed
                          ? 'bg-emerald-500 text-white'
                          : 'bg-surface-emphasis text-fg-subtle')
                      }
                    >
                      {isPassed ? <CheckIcon className="w-3.5 h-3.5" /> : idx + 1}
                    </div>
                    <div className="flex-1">
                      <h4
                        className={
                          'text-sm font-bold ' +
                          (isCurrent ? 'text-blue-600' : isPassed ? 'text-fg-primary' : 'text-fg-subtle')
                        }
                      >
                        {step.label}
                      </h4>
                      <p className="text-xs text-fg-muted mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Route Details Card (includes Intermediate Stops!) */}
        <div className="bg-surface-card rounded-3xl border border-border-subtle/80 p-6 shadow-lg mb-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
            Route Details
          </h3>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-status-success-bg text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              P
            </div>
            <div>
              <span className="text-[11px] font-bold text-fg-subtle uppercase block">Pickup</span>
              <p className="text-sm font-semibold text-fg-primary">{displayPickup}</p>
            </div>
          </div>

          {displayStops.length > 0 &&
            displayStops.map((stopAddr, idx) => (
              <div key={idx} className="flex items-start gap-3 pl-2">
                <div className="w-5 h-5 rounded-full bg-status-info-bg text-blue-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-fg-subtle uppercase block">
                    Stop {idx + 1}
                  </span>
                  <p className="text-xs font-semibold text-fg-strong">{stopAddr}</p>
                </div>
              </div>
            ))}

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-status-danger-bg text-rose-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              D
            </div>
            <div>
              <span className="text-[11px] font-bold text-fg-subtle uppercase block">Destination</span>
              <p className="text-sm font-semibold text-fg-primary">{displayDropoff}</p>
            </div>
          </div>
        </div>

        {/* Self-Service Guest / Owner "Manage Your Ride" Panel (Phase 56) */}
        <GuestManageRidePanel
          trackingToken={activeTrackingToken || trip?.trackingToken || ''}
          trip={trip}
          publicTracking={publicTracking}
          initialPhoneLast4={phoneLast4Input}
          isAuthenticatedOwner={Boolean(trip && currentUser)}
          onTrackingUpdated={(nextTracking) => setPublicTracking(nextTracking)}
          onTripUpdated={setTrip}
        />

        {/* Canonical Itemized Fare Breakdown (Authenticated Owner / Staff Only) */}
        {trip?.pricing && (
          <div className="mb-6">
            <PriceBreakdownPanel
              outboundPricing={trip.pricing}
              outboundDisplayFare={trip.pricing.totalFare}
              returnDisplayFare={null}
              totalDisplayFare={trip.pricing.totalFare}
              isRoundTrip={false}
              vehicleLabel={vehicleDisplayName}
            />
          </div>
        )}

        {/* Guest to User Account Linking CTA */}
        {!currentUser && (
          <div className="bg-status-info-bg border border-status-info-border rounded-3xl p-6 shadow-md mb-6 text-center">
            <h3 className="text-sm font-black text-status-info-fg mb-2">View Full Receipt &amp; Manage Rides</h3>
            <p className="text-xs text-status-info-fg mb-4">
              Sign in or create a free account with your booking email to view itemized receipts, rebook in two taps, and save favorite addresses.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Link
                to={`/app/register?claimTrip=${encodeURIComponent(displayTripId)}`}
                className="px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow hover:bg-blue-700 transition-colors"
              >
                Create Account
              </Link>
              <Link
                to={`/app/login?claimTrip=${encodeURIComponent(displayTripId)}`}
                className="px-5 py-2.5 bg-surface-card text-status-info-fg border border-status-info-border font-bold text-sm rounded-xl hover:bg-status-info-bg transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Need Help CTA */}
        <div className="text-center text-xs text-fg-muted space-y-2">
          <p>Questions about your trip? Call 24/7 Chesterfield Dispatch Desk:</p>
          <a
            href={'tel:' + COMPANY_CONFIG.phone.primaryRaw}
            className="inline-flex items-center gap-1.5 font-bold text-fg-primary bg-surface-card px-4 py-2 rounded-xl border border-border-subtle shadow-xs hover:bg-surface-subtle transition-colors"
          >
            <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>{COMPANY_CONFIG.phone.primary}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
