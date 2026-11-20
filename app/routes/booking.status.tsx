import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router';
import { getBookingService } from '../core/services/booking';
import type { Trip, TripStatus } from '../core/types/trip';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { PhoneIcon, SpinnerIcon, SearchIcon } from '../components/ui/Icons';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { CustomerTelemetryMap } from '../components/domain/tracking/CustomerTelemetryMap';
import { getWorkspaceBus } from '../core/services/workspace-bus.service';
import { formatVehicleTierDisplay } from '../core/services/email/email-templates';
import { verifyTripPhoneMatch } from '../core/utils/trip-id.util';

export function meta() {
  return [
    { title: 'Live Trip Status & Tracking – Chesterfield Taxi' },
    { name: 'description', content: 'Track your ride in real-time with live status updates.' },
  ];
}

const LIFECYCLE_STEPS: Array<{ key: TripStatus; label: string; desc: string }> = [
  { key: 'UNCONFIRMED', label: 'Requested', desc: 'Booking received, pending dispatch desk confirmation' },
  { key: 'CONFIRMED', label: 'Confirmed', desc: 'Ride confirmed by dispatch desk' },
  { key: 'assigned', label: 'Driver Assigned', desc: 'A driver has been assigned to your booking' },
  { key: 'en_route', label: 'Driver En Route', desc: 'Vehicle is travelling to your pickup address' },
  { key: 'arrived', label: 'Driver Arrived', desc: 'Driver is waiting outside at pickup location' },
  { key: 'in_progress', label: 'On Trip', desc: 'Trip is currently in progress' },
  { key: 'completed', label: 'Completed', desc: 'Trip safely completed. Thank you for riding!' },
];

export default function BookingStatusRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tripId = params.tripId || params.tripToken || searchParams.get('id') || undefined;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(tripId));
  const [error, setError] = useState<string | null>(null);
  const [searchRef, setSearchRef] = useState(tripId || '');
  const [phoneInput, setPhoneInput] = useState(searchParams.get('phone') || '');
  const [phoneVerifyError, setPhoneVerifyError] = useState<string | null>(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneVerifyError(null);
    const cleanId = searchRef.trim().replace(/^#/, '');
    const cleanPhone = phoneInput.trim();
    if (!cleanId) {
      setPhoneVerifyError('Please enter your Trip ID (e.g., CT-1234-5678).');
      return;
    }
    if (cleanPhone.replace(/\D/g, '').length < 7) {
      setPhoneVerifyError('Please enter the passenger phone number used for this booking.');
      return;
    }
    try {
      sessionStorage.setItem(`ct_verified_phone_${cleanId.toUpperCase()}`, cleanPhone);
      sessionStorage.setItem(`ct_verified_phone_${cleanId}`, cleanPhone);
    } catch {}
    navigate(`/booking/status/${encodeURIComponent(cleanId)}`);
  };

  const handleVerifyExistingTripPhone = (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneVerifyError(null);
    if (!trip) return;
    if (verifyTripPhoneMatch(trip.passenger?.phone, phoneInput)) {
      try {
        sessionStorage.setItem(`ct_verified_phone_${trip.id}`, phoneInput.trim());
      } catch {}
      setIsPhoneVerified(true);
    } else {
      setPhoneVerifyError('The phone number entered does not match the passenger phone number on this reservation.');
    }
  };

  useEffect(() => {
    const authService = getAdminAuthService();
    const unsub = authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!trip) return;
    // Check if authenticated user owns this trip or is staff
    if (currentUser) {
      const isStaff = ['admin', 'dispatcher', 'driver'].includes(currentUser.role);
      const isOwner =
        (trip.customerId && currentUser.uid === trip.customerId) ||
        (trip.passenger?.email &&
          currentUser.email &&
          trip.passenger.email.toLowerCase() === currentUser.email.toLowerCase());
      if (isStaff || isOwner) {
        setIsPhoneVerified(true);
        return;
      }
    }

    // Check sessionStorage or URL query parameter for matching phone
    let storedPhone = searchParams.get('phone') || '';
    if (!storedPhone && typeof window !== 'undefined') {
      try {
        storedPhone =
          sessionStorage.getItem(`ct_verified_phone_${trip.id}`) ||
          sessionStorage.getItem(`ct_verified_phone_${trip.id.toUpperCase()}`) ||
          '';
      } catch {}
    }

    if (storedPhone && verifyTripPhoneMatch(trip.passenger?.phone, storedPhone)) {
      setIsPhoneVerified(true);
    } else {
      setIsPhoneVerified(false);
      if (storedPhone) {
        setPhoneVerifyError('The phone number provided does not match this Trip ID. Please verify and try again.');
      }
    }
  }, [trip, currentUser, searchParams]);

  useEffect(() => {
    if (!tripId) {
      setTrip(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const bookingService = getBookingService();

    bookingService
      .getBookingStatus(tripId)
      .then((res) => {
        if (res?.trip) {
          setTrip(res.trip);
          setError(null);
        } else {
          setError('Booking reference "' + tripId + '" was not found. Please check your Trip ID and try again.');
        }
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load booking status.');
      })
      .finally(() => {
        setIsLoading(false);
      });

    let unsub: (() => void) | undefined;
    if (bookingService.subscribeToBooking) {
      unsub = bookingService.subscribeToBooking(
        tripId,
        (updatedTrip) => {
          setTrip(updatedTrip);
          setError(null);
        },
        (err) => {
          console.warn('[BookingStatus] Realtime sync error:', err);
        }
      );
    }

    // Subscribe to cross-tab / WebSocket live driver telemetry pings
    const bus = getWorkspaceBus();
    const unsubBus = bus.subscribe((msg) => {
      if (msg.type === 'DRIVER_TELEMETRY_PING' && msg.payload?.tripId === tripId) {
        const ping = {
          coordinates: msg.payload.coordinates,
          speedMph: msg.payload.speedMph,
          heading: msg.payload.heading,
          accuracy: msg.payload.accuracy,
          timestamp: msg.payload.timestamp,
          status: msg.payload.status,
          isOfflineBuffer: msg.payload.isOfflineBuffer,
        };
        setTrip((prev) =>
          prev
            ? {
                ...prev,
                driverTelemetry: ping,
                currentLocation: ping,
              }
            : prev
        );
      }
    });

    return () => {
      if (unsub) unsub();
      unsubBus();
    };
  }, [tripId]);

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <SpinnerIcon className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Connecting to Live Dispatch...</h2>
        <p className="text-sm text-slate-500 mt-1">Retrieving real-time trip status.</p>
      </div>
    );
  }

  // Case 1: Lookup Landing (/track with no tripId yet, or trip lookup error)
  if (!tripId || error || !trip) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 text-center shadow-xl">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold ${
            error ? 'bg-rose-100 text-rose-600' : 'bg-blue-50 text-blue-600'
          }`}
        >
          {error ? '!' : <SearchIcon className="w-6 h-6" />}
        </div>
        <h1 className="text-xl font-black text-slate-900">
          {error ? 'Trip Not Found' : 'Track Your Ride'}
        </h1>
        <p className="text-xs text-slate-600 mt-2 mb-6 leading-relaxed">
          {error ||
            'Enter your Trip Confirmation ID and the passenger phone number used during booking to view real-time dispatch status.'}
        </p>

        {phoneVerifyError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 text-left">
            {phoneVerifyError}
          </div>
        )}

        <form onSubmit={handleSearchSubmit} className="mb-6 space-y-3 text-left">
          <div>
            <label htmlFor="track-trip-id" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Confirmation Code / Trip ID
            </label>
            <input
              id="track-trip-id"
              type="text"
              required
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              placeholder="e.g. CT-4821-9034"
              className="w-full px-3.5 py-2.5 text-base sm:text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
          <div>
            <label htmlFor="track-phone" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Passenger Phone Number
            </label>
            <input
              id="track-phone"
              type="tel"
              required
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="(314) 555-0199"
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
          >
            Track Live Status
          </button>
        </form>

        <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-100">
          <Link
            to="/book"
            className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors"
          >
            Book a Ride
          </Link>
          <a
            href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
            className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors"
          >
            Call Dispatch
          </a>
        </div>
      </div>
    );
  }

  // Case 2: Trip exists, but guest has not verified passenger phone number yet
  if (!isPhoneVerified) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 text-center shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <PhoneIcon className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-black text-slate-900">Verify Passenger Phone</h1>
        <p className="text-xs text-slate-600 mt-2 mb-6 leading-relaxed">
          To protect passenger privacy for reservation <strong className="font-mono text-slate-900">{trip.id}</strong>, please confirm the phone number associated with this booking.
        </p>

        {phoneVerifyError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 text-left">
            {phoneVerifyError}
          </div>
        )}

        <form onSubmit={handleVerifyExistingTripPhone} className="space-y-4 text-left mb-6">
          <div>
            <label htmlFor="verify-trip-phone" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Passenger Phone Number
            </label>
            <input
              id="verify-trip-phone"
              type="tel"
              required
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="(314) 555-0199"
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            Verify & View Trip Status
          </button>
        </form>

        <div className="text-xs text-slate-500 pt-4 border-t border-slate-100">
          Need assistance? Call Dispatch at{' '}
          <a href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`} className="font-bold text-slate-800 underline">
            {COMPANY_CONFIG.phone.primary}
          </a>
        </div>
      </div>
    );
  }

  const normalizedStatus = trip.status.toLowerCase();
  const getStepIndex = (s: string) => {
    if (s.includes('unconfirm')) return 0;
    if (s.includes('confirm') || s === 'pending') return 1;
    if (s === 'assigned' || s === 'accepted' || s === 'offered') return 2;
    if (s === 'en_route') return 3;
    if (s === 'arrived') return 4;
    if (s === 'in_progress') return 5;
    if (s === 'completed') return 6;
    return 1;
  };

  const currentStepIdx = getStepIndex(normalizedStatus);
  const isCancelled = trip.status === 'cancelled' || trip.status === 'DECLINED' || trip.status === 'declined';

  return (
    <div className="py-8 sm:py-12 bg-gradient-to-b from-slate-50 via-white to-blue-50/20 flex-1 pb-28">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header Summary */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl mb-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase tracking-widest text-blue-400">
              Live Ride Status
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-400 text-slate-950">
              {trip.status.replace('_', ' ')}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Trip #{trip.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Passenger: <strong className="text-white">{trip.passenger?.firstName} {trip.passenger?.lastName}</strong>
          </p>

          <div className="mt-6 pt-6 border-t border-slate-800 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Vehicle Class</span>
              <span className="text-sm font-bold text-white uppercase">{formatVehicleTierDisplay(trip.vehicleTier)}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Fare Total</span>
              <span className="text-lg font-black text-amber-400">
                ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Status Timeline */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-lg mb-6">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-6 flex items-center justify-between">
            <span>Ride Progress</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold normal-case">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Sync
            </span>
          </h2>

          {isCancelled ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm">
              <strong className="block font-bold">This trip was cancelled / declined.</strong>
              <p className="text-xs mt-1 text-rose-700">
                Reason: {trip.cancellationReason || 'No driver available or user cancelled'}
              </p>
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {LIFECYCLE_STEPS.map((step, idx) => {
                const isPassed = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;

                return (
                  <div key={step.key} className="relative flex items-start gap-4">
                    <div
                      className={'absolute -left-6 sm:-left-8 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ' +
                        (isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                          : isPassed
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-400')}
                    >
                      {isPassed ? '✓' : idx + 1}
                    </div>

                    <div className="flex-1">
                      <h4
                        className={'text-sm font-bold ' +
                          (isCurrent ? 'text-blue-600' : isPassed ? 'text-slate-900' : 'text-slate-400')}
                      >
                        {step.label}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Customer Telemetry Map & HUD */}
        <CustomerTelemetryMap trip={trip} className="mb-6" />

        {/* Route Details Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-lg mb-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Route Details
          </h3>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              P
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase block">Pickup</span>
              <p className="text-sm font-semibold text-slate-900">{trip.pickupLocation?.address}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              D
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase block">Destination</span>
              <p className="text-sm font-semibold text-slate-900">{trip.dropoffLocation?.address}</p>
            </div>
          </div>
        </div>

        {/* Guest to User Account Linking CTA */}
        {!currentUser && (
          <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 shadow-md mb-6 text-center">
            <h3 className="text-sm font-black text-blue-900 mb-2">Save Account & Claim Trips</h3>
            <p className="text-xs text-blue-700 mb-4">
              Register now using your booking email or phone to seamlessly attach this and previous guest bookings to your passenger profile.
            </p>
            <Link
              to={`/app/register?claimTrip=${tripId}`}
              className="inline-block px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl shadow hover:bg-blue-700 transition-colors"
            >
              Create Account
            </Link>
          </div>
        )}

        {/* Need Help CTA */}
        <div className="text-center text-xs text-slate-500 space-y-2">
          <p>Questions about your trip? Call 24/7 Chesterfield Dispatch Desk:</p>
          <a
            href={'tel:' + COMPANY_CONFIG.phone.primaryRaw}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs shadow hover:bg-slate-800 transition-colors"
          >
            <PhoneIcon className="w-3.5 h-3.5 text-amber-400" />
            <span>{COMPANY_CONFIG.phone.dispatch}</span>
          </a>
        </div>
      </div>
    </div>
  );
}