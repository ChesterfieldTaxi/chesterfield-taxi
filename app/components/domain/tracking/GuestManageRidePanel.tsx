import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { getFirebaseAuth, isFirebaseConfigured } from '../../../core/services/firebase';
import {
  evaluateGuestManageEligibility,
  getPendingGuestChangeRequest,
  type GuestCancellationPolicyEvaluation,
  type GuestRouteTimeMode,
} from '../../../core/services/tracking/guest-manage-ride';
import {
  DEFAULT_GUEST_SELF_SERVICE_POLICY,
  normalizeGuestSelfServicePolicy,
  type GuestSelfServicePolicyConfig,
} from '../../../core/types/config';
import type { GeoPoint, Trip } from '../../../core/types/trip';
import {
  extractPhoneLast4,
  type PublicPendingGuestChangeSummary,
  type PublicTripTrackingProjection,
} from '../../../core/utils/tracking-token.util';
import { LocationAutocomplete } from '../LocationAutocomplete';
import {
  AlertTriangleIcon,
  BanIcon,
  BoltIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  EditIcon,
  LockIcon,
  PhoneIcon,
  PlaneIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../ui/Icons';

export interface GuestManageRidePanelProps {
  trackingToken: string;
  trip: Trip | null;
  publicTracking: PublicTripTrackingProjection | null;
  policyOverride?: Partial<GuestSelfServicePolicyConfig>;
  initialPhoneLast4?: string;
  isAuthenticatedOwner?: boolean;
  onTrackingUpdated: (nextTracking: PublicTripTrackingProjection) => void;
  onTripUpdated?: (updater: (prev: Trip | null) => Trip | null) => void;
}

type ManageTabKey = 'notes_flight' | 'time_route' | 'cancel';

function toLocalDateTimeInputs(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
  };
}

function splitFlightSummary(summary?: string): { airline: string; flightNumber: string } {
  if (!summary) return { airline: '', flightNumber: '' };
  const clean = summary.trim();
  const hashIdx = clean.lastIndexOf('#');
  if (hashIdx >= 0) {
    return {
      airline: clean.slice(0, hashIdx).trim(),
      flightNumber: clean.slice(hashIdx + 1).trim(),
    };
  }
  return { airline: '', flightNumber: clean };
}

export function GuestManageRidePanel({
  trackingToken,
  trip,
  publicTracking,
  policyOverride,
  initialPhoneLast4 = '',
  isAuthenticatedOwner = false,
  onTrackingUpdated,
  onTripUpdated,
}: GuestManageRidePanelProps) {
  const effectiveToken = (trackingToken || trip?.trackingToken || publicTracking?.trackingToken || '').trim();

  const [liveGuestPolicy, setLiveGuestPolicy] = useState<GuestSelfServicePolicyConfig>(
    DEFAULT_GUEST_SELF_SERVICE_POLICY
  );

  useEffect(() => {
    const svc = getAdminConfigService();
    const unsub = svc.subscribeToSettings((s) => {
      setLiveGuestPolicy(
        normalizeGuestSelfServicePolicy(s.customerBookingConfig?.guestSelfServicePolicy)
      );
    });
    return () => unsub();
  }, []);

  const resolvedPolicy = useMemo(
    () => normalizeGuestSelfServicePolicy(policyOverride ?? liveGuestPolicy),
    [policyOverride, liveGuestPolicy]
  );

  // Derive zero-PII eligibility & change summary across both Guest (`publicTracking`) and Owner (`trip`) views
  const eligibility = useMemo(() => {
    if (trip) {
      return evaluateGuestManageEligibility(trip, resolvedPolicy);
    }
    if (publicTracking) {
      const inferredAssigned =
        Boolean(publicTracking.assignedDriverFirstName) ||
        Boolean(publicTracking.assignedVehicle) ||
        ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(
          String(publicTracking.status || '')
        );
      const base = evaluateGuestManageEligibility(
        {
          status: publicTracking.status,
          assignedDriverId: inferredAssigned ? 'assigned' : null,
          bookingType: publicTracking.bookingType,
          scheduledPickupTime: publicTracking.scheduledPickupTime,
        },
        resolvedPolicy
      );
      const canSelfManage =
        base.canSelfManage && publicTracking.canSelfManage !== false;
      const routeTimeMode: GuestRouteTimeMode = !base.canModifyTimeRoute
        ? 'locked'
        : base.routeTimeMode === 'request_approval' ||
          publicTracking.routeTimeMode === 'request_approval'
        ? 'request_approval'
        : base.routeTimeMode;
      return {
        ...base,
        canSelfManage,
        routeTimeMode,
      };
    }
    return {
      canSelfManage: false,
      canEditNotesFlight: false,
      canModifyTimeRoute: false,
      routeTimeMode: 'locked' as GuestRouteTimeMode,
      canCancel: false,
    };
  }, [trip, publicTracking, resolvedPolicy]);

  const pendingChangeSummary: PublicPendingGuestChangeSummary | null = useMemo(() => {
    if (trip) {
      const req = getPendingGuestChangeRequest(trip);
      if (!req) return null;
      return {
        requestId: req.requestId,
        status: req.status,
        requestedAt: req.requestedAt,
        requestedScheduledPickupTime: req.requestedScheduledPickupTime,
        requestedPickupDisplay: req.requestedPickupAddress,
        requestedDropoffDisplay: req.requestedDropoffAddress,
        estimatedNewFare: req.estimatedNewFare,
        resolutionNote: req.resolutionNote,
      };
    }
    return publicTracking?.pendingGuestChangeSummary ?? null;
  }, [trip, publicTracking]);

  const availableTabs = useMemo((): ManageTabKey[] => {
    const out: ManageTabKey[] = [];
    if (eligibility.canEditNotesFlight) out.push('notes_flight');
    if (eligibility.canModifyTimeRoute) out.push('time_route');
    if (eligibility.canCancel) out.push('cancel');
    return out;
  }, [eligibility.canEditNotesFlight, eligibility.canModifyTimeRoute, eligibility.canCancel]);

  const [activeTab, setActiveTab] = useState<ManageTabKey | null>('notes_flight');

  useEffect(() => {
    if (activeTab && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? null);
    }
  }, [activeTab, availableTabs]);

  // Cached 4-digit phone verification for guest session
  const [phoneLast4, setPhoneLast4] = useState<string>(() => extractPhoneLast4(initialPhoneLast4));
  const [isEditingPhoneLast4, setIsEditingPhoneLast4] = useState<boolean>(false);

  // Tab 1: Instant Notes, Gate Code & Flight #
  const [driverNotes, setDriverNotes] = useState<string>('');
  const [gateCode, setGateCode] = useState<string>('');
  const [airline, setAirline] = useState<string>('');
  const [flightNumber, setFlightNumber] = useState<string>('');

  // Tab 2: Change Time or Address
  const [schedDate, setSchedDate] = useState<string>('');
  const [schedTime, setSchedTime] = useState<string>('');
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [pickupCoordinates, setPickupCoordinates] = useState<GeoPoint | undefined>(undefined);
  const [dropoffAddress, setDropoffAddress] = useState<string>('');
  const [dropoffCoordinates, setDropoffCoordinates] = useState<GeoPoint | undefined>(undefined);
  const [customerReason, setCustomerReason] = useState<string>('');

  // Tab 3: Cancel Ride + Live Policy Preview
  const [cancelPolicy, setCancelPolicy] = useState<GuestCancellationPolicyEvaluation | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Submission & Feedback Banners
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Hydrate cached phoneLast4 from sessionStorage on client mount
  useEffect(() => {
    if (!effectiveToken) return;
    const prefilled = extractPhoneLast4(initialPhoneLast4);
    if (prefilled.length === 4) {
      setPhoneLast4(prefilled);
      try {
        sessionStorage.setItem(`ct_manage_last4_${effectiveToken}`, prefilled);
      } catch {}
      return;
    }
    try {
      const cached = extractPhoneLast4(sessionStorage.getItem(`ct_manage_last4_${effectiveToken}`));
      if (cached.length === 4) {
        setPhoneLast4(cached);
      }
    } catch {}
  }, [effectiveToken, initialPhoneLast4]);

  // Hydrate initial form values from `trip` (authenticated owner) or zero-PII `publicTracking`
  useEffect(() => {
    if (trip) {
      const meta = (trip.metadata || {}) as Record<string, any>;
      setDriverNotes(trip.driverNotes || trip.pickupLocation?.notes || '');
      setGateCode(typeof meta.gateCode === 'string' ? meta.gateCode : '');
      setAirline(String(meta.airline || meta.airlineName || ''));
      setFlightNumber(String(meta.flightNumber || ''));
      const dt = toLocalDateTimeInputs(trip.scheduledPickupTime);
      setSchedDate(dt.date);
      setSchedTime(dt.time);
      setPickupAddress(trip.pickupLocation?.address || '');
      setPickupCoordinates(trip.pickupLocation?.coordinates);
      setDropoffAddress(trip.dropoffLocation?.address || '');
      setDropoffCoordinates(trip.dropoffLocation?.coordinates);
      return;
    }

    if (publicTracking) {
      setDriverNotes(publicTracking.riderNotesPreview || '');
      const parsedFlight = splitFlightSummary(publicTracking.flightSummary);
      setAirline(parsedFlight.airline);
      setFlightNumber(parsedFlight.flightNumber);
      const dt = toLocalDateTimeInputs(publicTracking.scheduledPickupTime);
      setSchedDate(dt.date);
      setSchedTime(dt.time);
      setPickupAddress(publicTracking.pickupDisplay || '');
      setPickupCoordinates(publicTracking.pickupCoordinates);
      setDropoffAddress(publicTracking.dropoffDisplay || '');
      setDropoffCoordinates(publicTracking.dropoffCoordinates);
    }
  }, [
    trip?.id,
    trip?.updatedAt,
    publicTracking?.trackingToken,
    publicTracking?.updatedAt,
  ]);

  const buildRequestHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (isAuthenticatedOwner && isFirebaseConfigured()) {
      try {
        const fbUser = getFirebaseAuth().currentUser;
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          if (idToken) {
            headers.Authorization = `Bearer ${idToken}`;
          }
        }
      } catch {
        // Fallback to phoneLast4 if token lookup unavailable
      }
    }
    return headers;
  }, [isAuthenticatedOwner]);

  const resolveEffectivePhoneLast4 = useCallback((): string => {
    if (isAuthenticatedOwner && trip?.passenger?.phone) {
      const ownerDigits = extractPhoneLast4(trip.passenger.phone);
      if (ownerDigits.length === 4) return ownerDigits;
    }
    return extractPhoneLast4(phoneLast4);
  }, [isAuthenticatedOwner, trip, phoneLast4]);

  // Fetch live Cancellation Policy preview when Cancel tab is opened
  useEffect(() => {
    if (activeTab !== 'cancel' || !effectiveToken || !eligibility.canCancel) return;
    let isMounted = true;
    setIsLoadingPolicy(true);

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'preview_cancel',
        trackingToken: effectiveToken,
      }),
    })
      .then(async (resp) => {
        const json = (await resp.json().catch(() => ({}))) as any;
        if (!isMounted) return;
        if (resp.ok && json?.success && json?.policy) {
          setCancelPolicy(json.policy as GuestCancellationPolicyEvaluation);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingPolicy(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, effectiveToken, eligibility.canCancel]);

  const cacheVerifiedPhoneLast4 = (digits: string) => {
    if (digits.length === 4 && effectiveToken) {
      try {
        sessionStorage.setItem(`ct_manage_last4_${effectiveToken}`, digits);
      } catch {}
      setIsEditingPhoneLast4(false);
    }
  };

  const handleSaveNotesFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!effectiveToken) {
      setFeedback({ type: 'error', text: 'Tracking session token is unavailable.' });
      return;
    }

    const last4 = resolveEffectivePhoneLast4();
    if (!isAuthenticatedOwner && last4.length !== 4) {
      setIsEditingPhoneLast4(true);
      setFeedback({
        type: 'error',
        text: 'Please enter the last 4 digits of the passenger phone number to save updates.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = await buildRequestHeaders();
      const payload: Record<string, unknown> = {
        intent: 'update_notes_flight',
        trackingToken: effectiveToken,
        phoneLast4: last4,
        driverNotes,
        airline,
        flightNumber,
      };
      if (gateCode.trim().length > 0 || trip) {
        payload.gateCode = gateCode.trim();
      }

      const resp = await fetch('/api/track', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const json = (await resp.json().catch(() => ({}))) as any;

      if (!resp.ok || !json?.success) {
        if (json?.code === 'PHONE_VERIFICATION_FAILED' || json?.code === 'PHONE_VERIFICATION_REQUIRED') {
          setIsEditingPhoneLast4(true);
        }
        setFeedback({
          type: 'error',
          text: json?.error || 'Could not update notes right now. Please try again.',
        });
        return;
      }

      cacheVerifiedPhoneLast4(last4);
      if (json.tracking) {
        onTrackingUpdated(json.tracking as PublicTripTrackingProjection);
      }
      if (onTripUpdated) {
        onTripUpdated((prev) =>
          prev
            ? {
                ...prev,
                driverNotes,
                pickupLocation: { ...prev.pickupLocation, notes: driverNotes },
                metadata: {
                  ...(prev.metadata || {}),
                  ...(gateCode.trim() ? { gateCode: gateCode.trim() } : {}),
                  airline: airline.trim(),
                  flightNumber: flightNumber.trim().toUpperCase(),
                },
              }
            : prev
        );
      }
      setGateCode('');
      setFeedback({
        type: 'success',
        text: json.driverNotified
          ? 'Saved! Your driver has been notified of the update.'
          : 'Saved! Your pickup instructions and flight details are updated.',
      });
    } catch {
      setFeedback({
        type: 'error',
        text: 'Network error while saving updates. Please try again or call dispatch.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModifyTimeRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!effectiveToken) {
      setFeedback({ type: 'error', text: 'Tracking session token is unavailable.' });
      return;
    }

    const last4 = resolveEffectivePhoneLast4();
    if (!isAuthenticatedOwner && last4.length !== 4) {
      setIsEditingPhoneLast4(true);
      setFeedback({
        type: 'error',
        text: 'Please enter the last 4 digits of the passenger phone number to confirm changes.',
      });
      return;
    }

    let scheduledPickupIso: string | undefined;
    if (schedDate && schedTime) {
      const parsed = new Date(`${schedDate}T${schedTime}`);
      if (Number.isNaN(parsed.getTime())) {
        setFeedback({ type: 'error', text: 'Please select a valid pickup date and time.' });
        return;
      }
      scheduledPickupIso = parsed.toISOString();
    }

    setIsSubmitting(true);
    try {
      const headers = await buildRequestHeaders();
      const resp = await fetch('/api/track', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          intent: 'modify_time_route',
          trackingToken: effectiveToken,
          phoneLast4: last4,
          scheduledPickupTime: scheduledPickupIso,
          pickupAddress: pickupAddress.trim() || undefined,
          pickupCoordinates,
          dropoffAddress: dropoffAddress.trim() || undefined,
          dropoffCoordinates,
          customerReason: customerReason.trim() || undefined,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as any;

      if (!resp.ok || !json?.success) {
        if (json?.code === 'PHONE_VERIFICATION_FAILED' || json?.code === 'PHONE_VERIFICATION_REQUIRED') {
          setIsEditingPhoneLast4(true);
        }
        setFeedback({
          type: 'error',
          text: json?.error || 'Could not submit route or schedule change.',
        });
        return;
      }

      cacheVerifiedPhoneLast4(last4);
      if (json.tracking) {
        onTrackingUpdated(json.tracking as PublicTripTrackingProjection);
      }

      if (json.mode === 'pending_approval') {
        setCustomerReason('');
        setFeedback({
          type: 'info',
          text: 'Change request sent to Dispatch! Because a driver is already assigned, Dispatch will confirm and alert your driver shortly.',
        });
      } else {
        setFeedback({
          type: 'success',
          text:
            json.status === 'UNCONFIRMED'
              ? 'Updated! Your modified itinerary is saved and queued for quick dispatch confirmation.'
              : 'Updated! Your new pickup time and route have been applied immediately.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'Network error while updating ride. Please try again or call dispatch.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!effectiveToken) {
      setFeedback({ type: 'error', text: 'Tracking session token is unavailable.' });
      return;
    }

    const last4 = resolveEffectivePhoneLast4();
    if (!isAuthenticatedOwner && last4.length !== 4) {
      setIsEditingPhoneLast4(true);
      setFeedback({
        type: 'error',
        text: 'Please enter the last 4 digits of the passenger phone number to confirm cancellation.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = await buildRequestHeaders();
      const resp = await fetch('/api/track', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          intent: 'confirm_cancel',
          trackingToken: effectiveToken,
          phoneLast4: last4,
          reason: cancelReason.trim() || undefined,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as any;

      if (!resp.ok || !json?.success) {
        if (json?.code === 'PHONE_VERIFICATION_FAILED' || json?.code === 'PHONE_VERIFICATION_REQUIRED') {
          setIsEditingPhoneLast4(true);
        }
        setFeedback({
          type: 'error',
          text: json?.error || 'Could not cancel reservation right now. Please call dispatch.',
        });
        return;
      }

      cacheVerifiedPhoneLast4(last4);
      if (json.policy) {
        setCancelPolicy(json.policy as GuestCancellationPolicyEvaluation);
      }
      if (json.tracking) {
        onTrackingUpdated(json.tracking as PublicTripTrackingProjection);
      }
      if (onTripUpdated) {
        onTripUpdated((prev) =>
          prev
            ? {
                ...prev,
                status: 'cancelled',
                cancellationReason: cancelReason.trim() || 'Cancelled by passenger via /track',
                cancelledBy: 'passenger',
              }
            : prev
        );
      }
      setFeedback({
        type: 'success',
        text: 'Your reservation has been cancelled.',
      });
    } catch {
      setFeedback({
        type: 'error',
        text: 'Network error while cancelling ride. Please call dispatch directly.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!eligibility.canSelfManage && !pendingChangeSummary) {
    return null;
  }

  const hasVerifiedDigitsCached = extractPhoneLast4(phoneLast4).length === 4;
  const hasGateCodeOnFile = Boolean(
    publicTracking?.hasGateCode ||
      (trip?.metadata && typeof (trip.metadata as any).gateCode === 'string' && (trip.metadata as any).gateCode.trim())
  );
  const isAssignedDriverActive = eligibility.routeTimeMode === 'request_approval';

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-lg mb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <EditIcon className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Manage Your Ride</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Update pickup instructions, flight #, schedule, or cancellation options.
          </p>
        </div>

        {/* Last-4 Phone Security Pill for Unauthenticated Guests */}
        {!isAuthenticatedOwner && eligibility.canSelfManage && (
          <div className="shrink-0">
            {hasVerifiedDigitsCached && !isEditingPhoneLast4 ? (
              <button
                type="button"
                onClick={() => setIsEditingPhoneLast4(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                title="Click to re-enter passenger phone last 4 digits"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Phone ••{extractPhoneLast4(phoneLast4)}</span>
                <span className="text-[10px] underline ml-0.5">Change</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                <LockIcon className="w-3 h-3 text-slate-500 shrink-0" />
                <span>4-Digit Phone Check</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pending / Resolved Guest Change Request Status Banner */}
      {pendingChangeSummary && (
        <div
          className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
            pendingChangeSummary.status === 'pending'
              ? 'bg-violet-50 border-violet-300 text-violet-950'
              : pendingChangeSummary.status === 'approved'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="font-extrabold flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              {pendingChangeSummary.status === 'pending' && (
                <span className="w-2 h-2 rounded-full bg-violet-600 animate-ping shrink-0" />
              )}
              <span>
                {pendingChangeSummary.status === 'pending'
                  ? 'Change Request Pending Dispatch Confirmation'
                  : pendingChangeSummary.status === 'approved'
                  ? '✓ Change Request Approved — Itinerary Updated'
                  : '✕ Change Request Could Not Be Accommodated'}
              </span>
            </span>
            {typeof pendingChangeSummary.estimatedNewFare === 'number' && (
              <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-white/80 border border-current/15">
                Est. Fare: ${pendingChangeSummary.estimatedNewFare.toFixed(2)}
              </span>
            )}
          </div>

          <div className="space-y-0.5 text-[11.5px] opacity-90">
            {pendingChangeSummary.requestedScheduledPickupTime && (
              <div>
                <strong>Requested Time:</strong>{' '}
                {new Date(pendingChangeSummary.requestedScheduledPickupTime).toLocaleString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            )}
            {pendingChangeSummary.requestedPickupDisplay && (
              <div>
                <strong>Requested Pickup:</strong> {pendingChangeSummary.requestedPickupDisplay}
              </div>
            )}
            {pendingChangeSummary.requestedDropoffDisplay && (
              <div>
                <strong>Requested Dropoff:</strong> {pendingChangeSummary.requestedDropoffDisplay}
              </div>
            )}
            {pendingChangeSummary.resolutionNote && (
              <div className="pt-1 font-semibold">
                Dispatch Note: {pendingChangeSummary.resolutionNote}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback Toast Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedback.type === 'info'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {eligibility.canSelfManage && (
        <>
          {/* Shared 4-Digit Phone Verification Input (shown until verified or when editing) */}
          {!isAuthenticatedOwner && (!hasVerifiedDigitsCached || isEditingPhoneLast4) && (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
              <label
                htmlFor="guest-manage-phone-last4"
                className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700"
              >
                Verify Last 4 Digits of Passenger Phone
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="guest-manage-phone-last4"
                  type="tel"
                  inputMode="numeric"
                  maxLength={14}
                  value={phoneLast4}
                  onChange={(e) => setPhoneLast4(e.target.value)}
                  placeholder="e.g. 0192"
                  className="flex-1 px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
                {hasVerifiedDigitsCached && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPhoneLast4(false)}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
                  >
                    Done
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Required once this session to protect your reservation from unauthorized edits.
              </p>
            </div>
          )}

          {/* Policy-Filtered Self-Service Tab Selector */}
          {availableTabs.length > 0 && (
            <div
              className={`grid ${
                availableTabs.length === 1
                  ? 'grid-cols-1'
                  : availableTabs.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-3'
              } gap-1.5 bg-slate-100 p-1 rounded-2xl`}
            >
              {eligibility.canEditNotesFlight && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setActiveTab((prev) => (prev === 'notes_flight' ? null : 'notes_flight'));
                  }}
                  className={`py-2.5 px-2 rounded-xl text-[11.5px] sm:text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'notes_flight'
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PlaneIcon className="w-3.5 h-3.5 text-blue-600 shrink-0 hidden sm:inline" />
                  <span>Notes &amp; Flight</span>
                </button>
              )}

              {eligibility.canModifyTimeRoute && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setActiveTab((prev) => (prev === 'time_route' ? null : 'time_route'));
                  }}
                  className={`py-2.5 px-2 rounded-xl text-[11.5px] sm:text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'time_route'
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0 hidden sm:inline" />
                  <span>Time / Address</span>
                </button>
              )}

              {eligibility.canCancel && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setActiveTab((prev) => (prev === 'cancel' ? null : 'cancel'));
                  }}
                  className={`py-2.5 px-2 rounded-xl text-[11.5px] sm:text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'cancel'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  <BanIcon className="w-3.5 h-3.5 text-rose-500 shrink-0 hidden sm:inline" />
                  <span>Cancel Ride</span>
                </button>
              )}
            </div>
          )}

          {/* ─── TAB 1: Instant Notes, Gate Code & Flight # ─── */}
          {activeTab === 'notes_flight' && eligibility.canEditNotesFlight && (
            <form onSubmit={handleSaveNotesFlight} className="space-y-3.5 pt-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-extrabold">
                  <BoltIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Instant Save</span>
                </span>
                {isAssignedDriverActive && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Alerts your assigned driver immediately
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="guest-driver-notes"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Pickup Instructions / Notes for Driver
                </label>
                <textarea
                  id="guest-driver-notes"
                  rows={2}
                  maxLength={500}
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  placeholder="e.g. Waiting by Hotel East Lobby, wearing navy coat..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="guest-gate-code"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Gate / Door Code
                  </label>
                  <input
                    id="guest-gate-code"
                    type="text"
                    maxLength={32}
                    value={gateCode}
                    onChange={(e) => setGateCode(e.target.value)}
                    placeholder={
                      hasGateCodeOnFile && !trip
                        ? 'Code on file (enter new to update)'
                        : 'e.g. #4410'
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="guest-airline"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Airline
                  </label>
                  <input
                    id="guest-airline"
                    type="text"
                    maxLength={60}
                    value={airline}
                    onChange={(e) => setAirline(e.target.value)}
                    placeholder="e.g. Southwest / Delta"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="guest-flight-number"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Flight #
                  </label>
                  <input
                    id="guest-flight-number"
                    type="text"
                    maxLength={20}
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. WN1420"
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    <span>Saving Updates...</span>
                  </>
                ) : (
                  <span>Save Notes &amp; Flight Details</span>
                )}
              </button>
            </form>
          )}

          {/* ─── TAB 2: Change Time or Address ─── */}
          {activeTab === 'time_route' && (
            <div className="space-y-3.5 pt-1">
              {eligibility.routeTimeMode === 'locked' ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2.5">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <LockIcon className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Driver Arrived at Pickup — Online Route Edits Locked</span>
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    {eligibility.lockReason ||
                      'Your driver is already waiting at pickup. Please speak directly with your driver or call dispatch to change your destination.'}
                  </p>
                  <a
                    href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    <span>Call Dispatch ({COMPANY_CONFIG.phone.primary})</span>
                  </a>
                </div>
              ) : (
                <form onSubmit={handleModifyTimeRoute} className="space-y-3.5">
                  {/* Auto-Apply vs Dispatch Confirmation Mode Badge */}
                  {eligibility.routeTimeMode === 'auto_apply' ? (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                      <BoltIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold block">Applies Instantly</strong>
                        <span className="text-[11px] text-emerald-800">
                          No driver has been dispatched yet — schedule and address changes update your
                          reservation immediately.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 flex items-start gap-2">
                      <ClockIcon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold block">
                          Requires Quick Dispatch Confirmation (Driver Assigned)
                        </strong>
                        <span className="text-[11px] text-indigo-800">
                          Your driver is already assigned. Submitting sends a 1-tap approval alert to
                          Dispatch so we can verify driver schedule &amp; notify your driver.
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="guest-pickup-date"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Pickup Date
                      </label>
                      <input
                        id="guest-pickup-date"
                        type="date"
                        value={schedDate}
                        onChange={(e) => setSchedDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="guest-pickup-time"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Pickup Time
                      </label>
                      <input
                        id="guest-pickup-time"
                        type="time"
                        value={schedTime}
                        onChange={(e) => setSchedTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />
                    </div>
                  </div>

                  <LocationAutocomplete
                    label="Pickup Address"
                    icon="map-pin"
                    value={pickupAddress}
                    onChange={(val) => {
                      setPickupAddress(val);
                      setPickupCoordinates(undefined);
                    }}
                    onPlaceSelected={(details) => {
                      setPickupAddress(details.formattedAddress || details.address);
                      setPickupCoordinates(details.coordinates);
                    }}
                    placeholder="Enter updated pickup address..."
                  />

                  <LocationAutocomplete
                    label="Destination Address"
                    icon="flag"
                    value={dropoffAddress}
                    onChange={(val) => {
                      setDropoffAddress(val);
                      setDropoffCoordinates(undefined);
                    }}
                    onPlaceSelected={(details) => {
                      setDropoffAddress(details.formattedAddress || details.address);
                      setDropoffCoordinates(details.coordinates);
                    }}
                    placeholder="Enter updated destination address..."
                  />

                  {eligibility.routeTimeMode === 'request_approval' && (
                    <div>
                      <label
                        htmlFor="guest-change-reason"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Note for Dispatch (Optional)
                      </label>
                      <input
                        id="guest-change-reason"
                        type="text"
                        maxLength={240}
                        value={customerReason}
                        onChange={(e) => setCustomerReason(e.target.value)}
                        placeholder="e.g. Flight landed 30 mins late / meeting ran over..."
                        className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm text-white transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 ${
                      eligibility.routeTimeMode === 'auto_apply'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <SpinnerIcon className="w-4 h-4 animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : eligibility.routeTimeMode === 'auto_apply' ? (
                      <span>Apply New Time &amp; Route</span>
                    ) : (
                      <span>Request Dispatch Confirmation</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ─── TAB 3: Cancel Ride + Live Policy Preview ─── */}
          {activeTab === 'cancel' && eligibility.canCancel && (
            <form onSubmit={handleConfirmCancel} className="space-y-3.5 pt-1">
              {isLoadingPolicy ? (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <SpinnerIcon className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Checking cancellation policy window...</span>
                </div>
              ) : cancelPolicy ? (
                <div
                  className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                    cancelPolicy.isFreeCancellation
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="font-extrabold flex items-center justify-between gap-2">
                    <span>
                      {cancelPolicy.isFreeCancellation
                        ? 'Free cancellation ($0.00)'
                        : cancelPolicy.policyTier === 'driver_arrived_no_show_fee'
                        ? `Arrival / No-Show fee preview: $${cancelPolicy.cancellationFeeAmount.toFixed(
                            2
                          )}`
                        : `Late cancellation fee preview: $${cancelPolicy.cancellationFeeAmount.toFixed(
                            2
                          )}`}
                    </span>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white/80">
                      ${cancelPolicy.cancellationFeeAmount.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    {cancelPolicy.summaryText}
                  </p>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="guest-cancel-reason"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Reason for Cancelling (Optional)
                </label>
                <input
                  id="guest-cancel-reason"
                  type="text"
                  maxLength={240}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Flight cancelled, travel plans changed..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || cancelPolicy?.canCancel === false}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    <span>Cancelling Ride...</span>
                  </>
                ) : (
                  <>
                    <BanIcon className="w-4 h-4" />
                    <span>Confirm Ride Cancellation</span>
                  </>
                )}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
