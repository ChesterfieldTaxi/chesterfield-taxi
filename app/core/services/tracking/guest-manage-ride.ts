/**
 * Pure Guest "Manage My Ride" Governance Engine (Phase 56)
 *
 * Shared pure models, eligibility gates, policy-aware cancellation calculators,
 * instant detail mutators, and 1-tap Dispatcher approval/decline resolvers for
 * `/track/:tripToken`.
 *
 * Strictly pure TypeScript (zero server-only or Node imports) so it can be
 * safely imported by client UI components, server `/api/track` handlers, and
 * automated test suites.
 */

import type { CustomerBookingConfig } from '../../types/config';
import type {
  GeoPoint,
  Trip,
  TripAuditEvent,
  TripFieldDiff,
  TripPricing,
  TripStatus,
  TripStatusHistoryEntry,
} from '../../types/trip';
import {
  buildPendingDriverUpdateAck,
  getPendingDriverUpdateAck,
  type PendingDriverUpdateAck,
} from '../dispatch/trip-update-ack.service';

export interface PendingGuestChangeRequest {
  requestId: string; // e.g., `gcr_${nowMs}_${seq}`
  status: 'pending' | 'approved' | 'declined';
  requestedAt: string; // ISO
  requestedScheduledPickupTime?: string; // ISO
  requestedPickupAddress?: string;
  requestedPickupCoordinates?: { lat: number; lng: number };
  requestedDropoffAddress?: string;
  requestedDropoffCoordinates?: { lat: number; lng: number };
  estimatedNewFare?: number;
  fareDelta?: number;
  customerReason?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}

export type GuestRouteTimeMode = 'auto_apply' | 'request_approval' | 'locked';

export interface GuestManageEligibility {
  canSelfManage: boolean;
  canEditNotesFlight: boolean;
  canModifyTimeRoute: boolean;
  routeTimeMode: GuestRouteTimeMode;
  canCancel: boolean;
  lockReason?: string;
}

export type GuestCancellationPolicyTier =
  | 'free_pre_dispatch'
  | 'free_within_window'
  | 'late_window_fee'
  | 'driver_arrived_no_show_fee'
  | 'locked_in_progress';

export interface GuestCancellationPolicyEvaluation {
  canCancel: boolean;
  isFreeCancellation: boolean;
  minutesUntilPickup: number | null;
  freeWindowMinutes: number;
  cancellationFeeAmount: number;
  policyTier: GuestCancellationPolicyTier;
  summaryText: string;
}

const LOCKED_ACTIVE_OR_TERMINAL_STATUSES = new Set<string>([
  'in_progress',
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

const INSTANT_NOTES_ALLOWED_STATUSES = new Set<string>([
  'UNCONFIRMED',
  'unconfirmed',
  'CONFIRMED',
  'confirmed',
  'pending',
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
]);

const PRE_DISPATCH_AUTO_EDIT_STATUSES = new Set<string>([
  'UNCONFIRMED',
  'unconfirmed',
  'CONFIRMED',
  'confirmed',
  'pending',
  'offered',
]);

const ASSIGNED_APPROVAL_EDIT_STATUSES = new Set<string>([
  'assigned',
  'accepted',
  'en_route',
]);

let guestChangeSeqCounter = 0;

function normStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

function resolveNowMs(nowMs?: number): number {
  return typeof nowMs === 'number' && Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();
}

function isValidCoordinates(coord?: Partial<GeoPoint> | null): coord is GeoPoint {
  return Boolean(
    coord &&
      typeof coord.lat === 'number' &&
      typeof coord.lng === 'number' &&
      Number.isFinite(coord.lat) &&
      Number.isFinite(coord.lng)
  );
}

/**
 * Extracts a typed `PendingGuestChangeRequest` from `trip.metadata.pendingGuestChangeRequest` if present.
 */
export function getPendingGuestChangeRequest(
  trip: Partial<Trip> | null | undefined
): PendingGuestChangeRequest | null {
  if (!trip || !trip.metadata || typeof trip.metadata !== 'object') return null;
  const raw = (trip.metadata as Record<string, unknown>).pendingGuestChangeRequest;
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<PendingGuestChangeRequest>;
  if (typeof candidate.requestId !== 'string' || !candidate.requestId) return null;
  const status =
    candidate.status === 'approved' || candidate.status === 'declined'
      ? candidate.status
      : 'pending';

  return {
    requestId: candidate.requestId,
    status,
    requestedAt: typeof candidate.requestedAt === 'string' ? candidate.requestedAt : '',
    ...(typeof candidate.requestedScheduledPickupTime === 'string' &&
    candidate.requestedScheduledPickupTime
      ? { requestedScheduledPickupTime: candidate.requestedScheduledPickupTime }
      : {}),
    ...(typeof candidate.requestedPickupAddress === 'string' && candidate.requestedPickupAddress
      ? { requestedPickupAddress: candidate.requestedPickupAddress }
      : {}),
    ...(isValidCoordinates(candidate.requestedPickupCoordinates)
      ? {
          requestedPickupCoordinates: {
            lat: candidate.requestedPickupCoordinates.lat,
            lng: candidate.requestedPickupCoordinates.lng,
          },
        }
      : {}),
    ...(typeof candidate.requestedDropoffAddress === 'string' && candidate.requestedDropoffAddress
      ? { requestedDropoffAddress: candidate.requestedDropoffAddress }
      : {}),
    ...(isValidCoordinates(candidate.requestedDropoffCoordinates)
      ? {
          requestedDropoffCoordinates: {
            lat: candidate.requestedDropoffCoordinates.lat,
            lng: candidate.requestedDropoffCoordinates.lng,
          },
        }
      : {}),
    ...(typeof candidate.estimatedNewFare === 'number' && Number.isFinite(candidate.estimatedNewFare)
      ? { estimatedNewFare: Number(candidate.estimatedNewFare.toFixed(2)) }
      : {}),
    ...(typeof candidate.fareDelta === 'number' && Number.isFinite(candidate.fareDelta)
      ? { fareDelta: Number(candidate.fareDelta.toFixed(2)) }
      : {}),
    ...(typeof candidate.customerReason === 'string' && candidate.customerReason.trim()
      ? { customerReason: candidate.customerReason.trim() }
      : {}),
    resolvedAt: candidate.resolvedAt ?? null,
    resolvedBy: candidate.resolvedBy ?? null,
    resolutionNote: candidate.resolutionNote ?? null,
  };
}

/**
 * Returns `true` when `trip` has an unresolved `'pending'` passenger change request awaiting Dispatch review.
 */
export function hasPendingGuestChangeRequest(
  trip: Partial<Trip> | null | undefined
): boolean {
  if (!trip) return false;
  if (LOCKED_ACTIVE_OR_TERMINAL_STATUSES.has(String(trip.status || ''))) return false;
  const req = getPendingGuestChangeRequest(trip);
  return Boolean(req && req.status === 'pending');
}

/**
 * Pure eligibility evaluator determining what self-service actions a passenger may take on `/track`.
 */
export function evaluateGuestManageEligibility(
  trip: Pick<Trip, 'status' | 'assignedDriverId' | 'bookingType' | 'scheduledPickupTime'>
): GuestManageEligibility {
  const statusStr = String(trip.status || '');

  // 1. Terminal / active-ride lock
  if (LOCKED_ACTIVE_OR_TERMINAL_STATUSES.has(statusStr)) {
    const lockReason =
      statusStr === 'in_progress'
        ? 'Your ride is currently in progress. Please speak with your driver or call dispatch for route changes.'
        : statusStr === 'completed'
        ? 'This ride has already been completed.'
        : 'This reservation has been cancelled or closed.';
    return {
      canSelfManage: false,
      canEditNotesFlight: false,
      canModifyTimeRoute: false,
      routeTimeMode: 'locked',
      canCancel: false,
      lockReason,
    };
  }

  const canEditNotesFlight = INSTANT_NOTES_ALLOWED_STATUSES.has(statusStr);
  const canCancel = INSTANT_NOTES_ALLOWED_STATUSES.has(statusStr);
  const hasAssignedDriver = Boolean(trip.assignedDriverId);

  // 2. Driver already arrived at pickup curb -> lock time/route self-edits
  if (statusStr === 'arrived') {
    return {
      canSelfManage: canEditNotesFlight || canCancel,
      canEditNotesFlight,
      canModifyTimeRoute: false,
      routeTimeMode: 'locked',
      canCancel,
      lockReason:
        'Your driver has already arrived at pickup. Call dispatch directly to change destination.',
    };
  }

  // 3. Pre-dispatch unassigned -> auto-apply time & route edits
  if (!hasAssignedDriver && PRE_DISPATCH_AUTO_EDIT_STATUSES.has(statusStr)) {
    return {
      canSelfManage: true,
      canEditNotesFlight,
      canModifyTimeRoute: true,
      routeTimeMode: 'auto_apply',
      canCancel,
    };
  }

  // 4. Driver assigned (assigned / accepted / en_route, or assignedDriverId present pre-curb) -> request approval
  if (hasAssignedDriver || ASSIGNED_APPROVAL_EDIT_STATUSES.has(statusStr)) {
    return {
      canSelfManage: true,
      canEditNotesFlight,
      canModifyTimeRoute: true,
      routeTimeMode: 'request_approval',
      canCancel,
    };
  }

  return {
    canSelfManage: canEditNotesFlight || canCancel,
    canEditNotesFlight,
    canModifyTimeRoute: false,
    routeTimeMode: 'locked',
    canCancel,
  };
}

/**
 * Policy-aware cancellation fee & window evaluator for `/track`.
 */
export function evaluateGuestCancellationPolicy(params: {
  trip: Trip;
  bookingConfig?: Partial<CustomerBookingConfig>;
  nowMs?: number;
}): GuestCancellationPolicyEvaluation {
  const { trip, bookingConfig } = params;
  const resolvedNow = resolveNowMs(params.nowMs);

  const freeWindowMinutes =
    typeof bookingConfig?.freeCancellationWindowMinutes === 'number' &&
    Number.isFinite(bookingConfig.freeCancellationWindowMinutes)
      ? Math.max(0, Math.round(bookingConfig.freeCancellationWindowMinutes))
      : 120;

  const lateFeePercent =
    typeof bookingConfig?.lateCancellationFeePercent === 'number' &&
    Number.isFinite(bookingConfig.lateCancellationFeePercent)
      ? Math.max(0, bookingConfig.lateCancellationFeePercent)
      : 25;

  const noShowFeeAmount =
    typeof bookingConfig?.noShowFeeAmount === 'number' &&
    Number.isFinite(bookingConfig.noShowFeeAmount)
      ? Math.max(0, bookingConfig.noShowFeeAmount)
      : 50;

  const statusStr = String(trip.status || '');

  let minutesUntilPickup: number | null = null;
  if (trip.scheduledPickupTime) {
    const pickupMs = Date.parse(trip.scheduledPickupTime);
    if (Number.isFinite(pickupMs)) {
      minutesUntilPickup = Math.round((pickupMs - resolvedNow) / 60_000);
    }
  }

  // 1. Terminal or active in-progress ride lock
  if (LOCKED_ACTIVE_OR_TERMINAL_STATUSES.has(statusStr)) {
    return {
      canCancel: false,
      isFreeCancellation: false,
      minutesUntilPickup,
      freeWindowMinutes,
      cancellationFeeAmount: 0,
      policyTier: 'locked_in_progress',
      summaryText:
        statusStr === 'in_progress'
          ? 'This ride is already in progress and cannot be cancelled online. Please speak with your driver or call dispatch.'
          : 'This reservation is already closed and cannot be cancelled.',
    };
  }

  // 2. Driver already arrived at pickup curb -> no-show / arrival fee preview
  if (statusStr === 'arrived') {
    const fee = Number(noShowFeeAmount.toFixed(2));
    return {
      canCancel: true,
      isFreeCancellation: fee === 0,
      minutesUntilPickup,
      freeWindowMinutes,
      cancellationFeeAmount: fee,
      policyTier: 'driver_arrived_no_show_fee',
      summaryText:
        fee > 0
          ? `Your driver has already arrived at pickup. Cancelling now carries a $${fee.toFixed(
              2
            )} arrival / no-show fee preview.`
          : 'Free cancellation ($0.00).',
    };
  }

  const hasAssignedDriver = Boolean(trip.assignedDriverId);
  const isAsap = trip.bookingType === 'asap' || minutesUntilPickup === null;

  // 3. Pre-dispatch unassigned AND (ASAP OR outside free window) -> $0.00 free cancellation
  if (
    !hasAssignedDriver &&
    (isAsap || minutesUntilPickup === null || minutesUntilPickup >= freeWindowMinutes)
  ) {
    return {
      canCancel: true,
      isFreeCancellation: true,
      minutesUntilPickup,
      freeWindowMinutes,
      cancellationFeeAmount: 0,
      policyTier: 'free_pre_dispatch',
      summaryText: isAsap
        ? 'Free cancellation ($0.00) — your ride has not been dispatched to a driver yet.'
        : `Free cancellation ($0.00) — more than ${freeWindowMinutes} minutes before scheduled pickup.`,
    };
  }

  // 4. Driver assigned on scheduled ride well ahead of free cancellation window -> $0.00 free cancellation
  if (
    hasAssignedDriver &&
    !isAsap &&
    minutesUntilPickup !== null &&
    minutesUntilPickup >= freeWindowMinutes
  ) {
    return {
      canCancel: true,
      isFreeCancellation: true,
      minutesUntilPickup,
      freeWindowMinutes,
      cancellationFeeAmount: 0,
      policyTier: 'free_within_window',
      summaryText: `Free cancellation ($0.00) — cancelling at least ${freeWindowMinutes} minutes prior to scheduled pickup.`,
    };
  }

  // 5. Inside late cancellation window (or ASAP ride after driver already assigned/en-route)
  const baseTotalFare = Number(trip.pricing?.totalFare || 0);
  const lateFee = Number(Math.max(0, baseTotalFare * (lateFeePercent / 100)).toFixed(2));

  return {
    canCancel: true,
    isFreeCancellation: lateFee === 0,
    minutesUntilPickup,
    freeWindowMinutes,
    cancellationFeeAmount: lateFee,
    policyTier: 'late_window_fee',
    summaryText:
      lateFee > 0
        ? isAsap
          ? `Your driver is already assigned. Late cancellation fee preview (${lateFeePercent}%): $${lateFee.toFixed(
              2
            )}.`
          : `Inside ${freeWindowMinutes}-minute window (${Math.max(
              0,
              minutesUntilPickup ?? 0
            )}m before pickup). Late cancellation fee preview (${lateFeePercent}%): $${lateFee.toFixed(2)}.`
        : 'Free cancellation ($0.00).',
  };
}

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/**
 * Pure proportional / distance-aware fare re-estimator when pickup or dropoff coordinates change.
 */
export function reestimateTripPricingForRouteChange(params: {
  trip: Trip;
  nextPickupAddress?: string;
  nextPickupCoordinates?: GeoPoint;
  nextDropoffAddress?: string;
  nextDropoffCoordinates?: GeoPoint;
}): {
  pricing: TripPricing;
  routeChanged: boolean;
  fareDelta: number;
} {
  const {
    trip,
    nextPickupAddress,
    nextPickupCoordinates,
    nextDropoffAddress,
    nextDropoffCoordinates,
  } = params;

  const currentPricing = trip.pricing;
  const resolvedPickupAddr = normStr(nextPickupAddress) || trip.pickupLocation.address;
  const resolvedDropoffAddr = normStr(nextDropoffAddress) || trip.dropoffLocation.address;

  const pickupAddrChanged =
    normStr(resolvedPickupAddr).toLowerCase() !==
    normStr(trip.pickupLocation.address).toLowerCase();
  const dropoffAddrChanged =
    normStr(resolvedDropoffAddr).toLowerCase() !==
    normStr(trip.dropoffLocation.address).toLowerCase();

  const resolvedPickupCoords = isValidCoordinates(nextPickupCoordinates)
    ? nextPickupCoordinates
    : !pickupAddrChanged && isValidCoordinates(trip.pickupLocation.coordinates)
    ? trip.pickupLocation.coordinates
    : undefined;

  const resolvedDropoffCoords = isValidCoordinates(nextDropoffCoordinates)
    ? nextDropoffCoordinates
    : !dropoffAddrChanged && isValidCoordinates(trip.dropoffLocation.coordinates)
    ? trip.dropoffLocation.coordinates
    : undefined;

  const coordsChanged = Boolean(
    (isValidCoordinates(nextPickupCoordinates) &&
      (!isValidCoordinates(trip.pickupLocation.coordinates) ||
        Math.abs(nextPickupCoordinates.lat - trip.pickupLocation.coordinates.lat) > 0.0005 ||
        Math.abs(nextPickupCoordinates.lng - trip.pickupLocation.coordinates.lng) > 0.0005)) ||
      (isValidCoordinates(nextDropoffCoordinates) &&
        (!isValidCoordinates(trip.dropoffLocation.coordinates) ||
          Math.abs(nextDropoffCoordinates.lat - trip.dropoffLocation.coordinates.lat) > 0.0005 ||
          Math.abs(nextDropoffCoordinates.lng - trip.dropoffLocation.coordinates.lng) > 0.0005))
  );

  const routeChanged = pickupAddrChanged || dropoffAddrChanged || coordsChanged;
  if (!routeChanged || !resolvedPickupCoords || !resolvedDropoffCoords) {
    return {
      pricing: currentPricing,
      routeChanged,
      fareDelta: 0,
    };
  }

  const straightMiles = haversineMiles(resolvedPickupCoords, resolvedDropoffCoords);
  let newDistanceMiles = Number(Math.max(0.8, straightMiles * 1.28).toFixed(2));

  if (
    isValidCoordinates(trip.pickupLocation.coordinates) &&
    isValidCoordinates(trip.dropoffLocation.coordinates) &&
    currentPricing.distanceMiles > 0
  ) {
    const oldStraight = haversineMiles(
      trip.pickupLocation.coordinates,
      trip.dropoffLocation.coordinates
    );
    if (oldStraight > 0.25) {
      const ratio = straightMiles / oldStraight;
      newDistanceMiles = Number(
        Math.max(0.8, currentPricing.distanceMiles * ratio).toFixed(2)
      );
    }
  }

  if (Math.abs(newDistanceMiles - (currentPricing.distanceMiles || 0)) < 0.1) {
    return {
      pricing: currentPricing,
      routeChanged,
      fareDelta: 0,
    };
  }

  const newDurationMinutes = Math.max(5, Math.round((newDistanceMiles / 28) * 60));
  const baseFare = currentPricing.baseFare > 0 ? currentPricing.baseFare : 8;
  const oldMiles = Math.max(1, currentPricing.distanceMiles || 10);
  const oldTotal = Math.max(baseFare, currentPricing.totalFare || 25);
  const variablePortion = Math.max(0, oldTotal - baseFare);
  const effectivePerMile =
    currentPricing.distanceRate > 0
      ? currentPricing.distanceRate * (currentPricing.vehicleMultiplier || 1)
      : variablePortion / oldMiles;

  const rawNewTotal = Math.max(
    baseFare,
    baseFare + newDistanceMiles * Math.max(1.75, effectivePerMile)
  );
  const newTotalFare = Number(rawNewTotal.toFixed(2));
  const fareDelta = Number((newTotalFare - (currentPricing.totalFare || 0)).toFixed(2));

  const nextPricing: TripPricing = {
    ...currentPricing,
    distanceMiles: newDistanceMiles,
    durationMinutes: newDurationMinutes,
    subtotal: newTotalFare,
    totalFare: newTotalFare,
  };

  return {
    pricing: nextPricing,
    routeChanged,
    fareDelta,
  };
}

/**
 * Applies instant self-service updates for Driver Notes, Gate Code, and Airline / Flight #
 * and triggers Phase 55's `PendingDriverUpdateAck` (`source: 'guest_manage_ride'`) if a driver is assigned.
 */
export function applyInstantGuestDetailsUpdate(params: {
  trip: Trip;
  driverNotes?: string;
  gateCode?: string;
  airline?: string;
  flightNumber?: string;
  nowMs?: number;
}): {
  updatedTrip: Trip;
  tripPatch: Partial<Trip>;
  pendingDriverUpdateAck: PendingDriverUpdateAck | null;
  auditEvent: TripAuditEvent;
} {
  const { trip, driverNotes, gateCode, airline, flightNumber } = params;
  const resolvedNow = resolveNowMs(params.nowMs);
  const nowIso = new Date(resolvedNow).toISOString();

  const eligibility = evaluateGuestManageEligibility(trip);
  if (!eligibility.canEditNotesFlight) {
    throw new Error(
      eligibility.lockReason || 'Notes and flight details can no longer be edited on this trip.'
    );
  }

  const existingMeta = { ...((trip.metadata || {}) as Record<string, unknown>) };

  const nextDriverNotes =
    driverNotes !== undefined ? normStr(driverNotes) : trip.driverNotes ?? '';
  const nextPickupLocation =
    driverNotes !== undefined
      ? {
          ...trip.pickupLocation,
          notes: nextDriverNotes,
          driverNotes: nextDriverNotes,
        }
      : trip.pickupLocation;

  if (gateCode !== undefined) {
    existingMeta.gateCode = normStr(gateCode);
  }

  let nextFlightNotes = trip.flightNotes;
  if (airline !== undefined || flightNumber !== undefined) {
    const cleanAirline =
      airline !== undefined
        ? normStr(airline)
        : normStr(existingMeta.airline || existingMeta.airlineName);
    const cleanFlightNum =
      flightNumber !== undefined
        ? normStr(flightNumber).replace(/^#/, '').toUpperCase()
        : normStr(existingMeta.flightNumber).replace(/^#/, '').toUpperCase();

    existingMeta.airline = cleanAirline;
    existingMeta.airlineName = cleanAirline;
    existingMeta.flightNumber = cleanFlightNum;
    existingMeta.provideFlightInfo = Boolean(cleanAirline || cleanFlightNum);

    if (cleanAirline || cleanFlightNum) {
      const descriptor = [cleanAirline, cleanFlightNum ? `#${cleanFlightNum}` : '']
        .filter(Boolean)
        .join(' ');
      nextFlightNotes = `[Flight: ${descriptor}]`;
    } else {
      nextFlightNotes = '';
    }
  }

  const candidateAfter: Trip = {
    ...trip,
    driverNotes: nextDriverNotes,
    pickupLocation: nextPickupLocation,
    flightNotes: nextFlightNotes,
    metadata: existingMeta,
    updatedAt: nowIso,
  };

  let pendingDriverUpdateAck: PendingDriverUpdateAck | null = null;
  if (trip.assignedDriverId) {
    const freshAck = buildPendingDriverUpdateAck({
      before: trip,
      after: candidateAfter,
      updatedBy: 'Passenger (/track)',
      source: 'guest_manage_ride',
      nowMs: resolvedNow,
    });
    if (freshAck) {
      const priorAck = getPendingDriverUpdateAck(trip);
      if (priorAck && priorAck.requiresAck && !priorAck.acknowledgedAt) {
        const mergedBullets = Array.from(
          new Set([...freshAck.changesSummary, ...priorAck.changesSummary])
        );
        pendingDriverUpdateAck = {
          ...freshAck,
          changesSummary: mergedBullets,
        };
      } else {
        pendingDriverUpdateAck = freshAck;
      }
      existingMeta.pendingDriverUpdateAck = pendingDriverUpdateAck;
    }
  }

  const refSuffix = String(Math.abs(resolvedNow)).slice(-4);
  const changedParts: string[] = [];
  if (driverNotes !== undefined && normStr(driverNotes) !== normStr(trip.driverNotes)) {
    changedParts.push('driver notes');
  }
  if (
    gateCode !== undefined &&
    normStr(gateCode) !== normStr((trip.metadata as Record<string, unknown> | undefined)?.gateCode)
  ) {
    changedParts.push('gate code');
  }
  if (airline !== undefined || flightNumber !== undefined) {
    changedParts.push('flight details');
  }

  const auditEvent: TripAuditEvent = {
    action: 'TRIP_MODIFIED',
    timestamp: nowIso,
    actorRole: 'passenger',
    referenceNumber: `TRK-${refSuffix}`,
    referenceType: 'edit',
    bookingChannel: 'web',
    context: `Passenger updated ${
      changedParts.length > 0 ? changedParts.join(', ') : 'trip instructions'
    } via /track self-service.${
      pendingDriverUpdateAck ? ' Assigned driver notified for acknowledgement.' : ''
    }`,
  };

  const nextAuditLog = [...(trip.auditLog || []), auditEvent];

  const tripPatch: Partial<Trip> = {
    driverNotes: nextDriverNotes,
    pickupLocation: nextPickupLocation,
    ...(nextFlightNotes !== undefined ? { flightNotes: nextFlightNotes } : {}),
    metadata: existingMeta,
    auditLog: nextAuditLog,
    updatedAt: nowIso,
  };

  const updatedTrip: Trip = {
    ...candidateAfter,
    metadata: existingMeta,
    auditLog: nextAuditLog,
  };

  return {
    updatedTrip,
    tripPatch,
    pendingDriverUpdateAck,
    auditEvent,
  };
}

/**
 * Builds a `PendingGuestChangeRequest` patch (`status: 'pending'`) for an already-assigned trip
 * without mutating the live driver route/time until Dispatch approves.
 */
export function buildPendingGuestChangeRequestPatch(params: {
  trip: Trip;
  scheduledPickupTime?: string;
  pickupAddress?: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress?: string;
  dropoffCoordinates?: GeoPoint;
  estimatedNewFare?: number;
  customerReason?: string;
  nowMs?: number;
}): {
  updatedTrip: Trip;
  tripPatch: Partial<Trip>;
  changeRequest: PendingGuestChangeRequest;
  auditEvent: TripAuditEvent;
} {
  const {
    trip,
    scheduledPickupTime,
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
    estimatedNewFare,
    customerReason,
  } = params;

  const resolvedNow = resolveNowMs(params.nowMs);
  const nowIso = new Date(resolvedNow).toISOString();
  guestChangeSeqCounter += 1;

  const cleanSchedIso = normStr(scheduledPickupTime) || undefined;
  const cleanPickupAddr = normStr(pickupAddress) || undefined;
  const cleanDropoffAddr = normStr(dropoffAddress) || undefined;
  const cleanReason = normStr(customerReason) || undefined;

  const resolvedEstimatedFare =
    typeof estimatedNewFare === 'number' && Number.isFinite(estimatedNewFare)
      ? Number(estimatedNewFare.toFixed(2))
      : reestimateTripPricingForRouteChange({
          trip,
          nextPickupAddress: cleanPickupAddr,
          nextPickupCoordinates: pickupCoordinates,
          nextDropoffAddress: cleanDropoffAddr,
          nextDropoffCoordinates: dropoffCoordinates,
        }).pricing.totalFare;

  const currentFare = Number(trip.pricing?.totalFare || 0);
  const fareDelta = Number((resolvedEstimatedFare - currentFare).toFixed(2));

  const changeRequest: PendingGuestChangeRequest = {
    requestId: `gcr_${resolvedNow}_${guestChangeSeqCounter}`,
    status: 'pending',
    requestedAt: nowIso,
    ...(cleanSchedIso ? { requestedScheduledPickupTime: cleanSchedIso } : {}),
    ...(cleanPickupAddr ? { requestedPickupAddress: cleanPickupAddr } : {}),
    ...(isValidCoordinates(pickupCoordinates)
      ? { requestedPickupCoordinates: { lat: pickupCoordinates.lat, lng: pickupCoordinates.lng } }
      : {}),
    ...(cleanDropoffAddr ? { requestedDropoffAddress: cleanDropoffAddr } : {}),
    ...(isValidCoordinates(dropoffCoordinates)
      ? {
          requestedDropoffCoordinates: {
            lat: dropoffCoordinates.lat,
            lng: dropoffCoordinates.lng,
          },
        }
      : {}),
    estimatedNewFare: resolvedEstimatedFare,
    fareDelta,
    ...(cleanReason ? { customerReason: cleanReason } : {}),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };

  const summaryBits: string[] = [];
  if (cleanSchedIso && cleanSchedIso !== trip.scheduledPickupTime) {
    summaryBits.push(`Pickup Time → ${new Date(cleanSchedIso).toLocaleString()}`);
  }
  if (cleanPickupAddr && cleanPickupAddr !== trip.pickupLocation.address) {
    summaryBits.push(`Pickup → ${cleanPickupAddr}`);
  }
  if (cleanDropoffAddr && cleanDropoffAddr !== trip.dropoffLocation.address) {
    summaryBits.push(`Dropoff → ${cleanDropoffAddr}`);
  }

  const refSuffix = String(Math.abs(resolvedNow)).slice(-4);
  const auditEvent: TripAuditEvent = {
    action: 'FLAGGED_FOR_HUMAN_REVIEW',
    timestamp: nowIso,
    actorRole: 'passenger',
    referenceNumber: `GCR-${refSuffix}`,
    referenceType: 'edit',
    bookingChannel: 'web',
    context: `Passenger requested schedule/route modification on assigned trip (${
      summaryBits.join('; ') || 'details change'
    })${cleanReason ? ` — Reason: "${cleanReason}"` : ''}. Awaiting 1-tap Dispatch approval.`,
  };

  const nextMetadata: Record<string, unknown> = {
    ...(trip.metadata || {}),
    pendingGuestChangeRequest: changeRequest,
  };
  const nextAuditLog = [...(trip.auditLog || []), auditEvent];

  const tripPatch: Partial<Trip> = {
    metadata: nextMetadata,
    auditLog: nextAuditLog,
    updatedAt: nowIso,
  };

  const updatedTrip: Trip = {
    ...trip,
    ...tripPatch,
  };

  return {
    updatedTrip,
    tripPatch,
    changeRequest,
    auditEvent,
  };
}

/**
 * Resolves a Dispatcher's 1-tap Approve or Decline decision on a `PendingGuestChangeRequest`.
 * - On `'approve'`: applies requested time, pickup/dropoff locations, and estimated fare onto `Trip`,
 *   marks `pendingGuestChangeRequest.status = 'approved'`, appends a `TripAuditEvent`, and builds
 *   Phase 55's `PendingDriverUpdateAck` (`source: 'guest_manage_ride'`) so the assigned driver is alerted!
 * - On `'decline'`: preserves live route/time unchanged, marks `status = 'declined'` with `resolutionNote`,
 *   and appends a `TripAuditEvent`.
 */
export function resolveDispatcherGuestChangeDecision(params: {
  trip: Trip;
  decision: 'approve' | 'decline';
  actorEmail: string;
  resolutionNote?: string;
  nowMs?: number;
}): {
  updatedTrip: Trip;
  tripPatch: Partial<Trip>;
  resolvedRequest: PendingGuestChangeRequest;
  pendingDriverUpdateAck: PendingDriverUpdateAck | null;
  auditEvent: TripAuditEvent;
} {
  const { trip, decision, actorEmail, resolutionNote } = params;
  const resolvedNow = resolveNowMs(params.nowMs);
  const nowIso = new Date(resolvedNow).toISOString();
  const cleanActor = normStr(actorEmail) || 'Dispatcher';
  const cleanNote = normStr(resolutionNote) || null;

  const existingReq = getPendingGuestChangeRequest(trip);
  if (!existingReq) {
    throw new Error(`No pending guest change request found on trip #${trip.id}.`);
  }

  const refSuffix = String(Math.abs(resolvedNow)).slice(-4);

  if (decision === 'decline') {
    const resolvedRequest: PendingGuestChangeRequest = {
      ...existingReq,
      status: 'declined',
      resolvedAt: nowIso,
      resolvedBy: cleanActor,
      resolutionNote: cleanNote || 'Declined by dispatch',
    };

    const nextMetadata: Record<string, unknown> = {
      ...(trip.metadata || {}),
      pendingGuestChangeRequest: resolvedRequest,
    };

    const auditEvent: TripAuditEvent = {
      action: 'STATUS_CHANGED',
      timestamp: nowIso,
      actorRole: 'dispatcher',
      actorId: cleanActor,
      referenceNumber: `GCR-${refSuffix}`,
      referenceType: 'edit',
      context: `Dispatcher ${cleanActor} declined passenger change request (${
        existingReq.requestId
      })${cleanNote ? `: ${cleanNote}` : '.'}`,
    };

    const nextAuditLog = [...(trip.auditLog || []), auditEvent];
    const tripPatch: Partial<Trip> = {
      metadata: nextMetadata,
      auditLog: nextAuditLog,
      updatedAt: nowIso,
    };

    return {
      updatedTrip: {
        ...trip,
        ...tripPatch,
      },
      tripPatch,
      resolvedRequest,
      pendingDriverUpdateAck: null,
      auditEvent,
    };
  }

  // Approve branch
  const resolvedRequest: PendingGuestChangeRequest = {
    ...existingReq,
    status: 'approved',
    resolvedAt: nowIso,
    resolvedBy: cleanActor,
    resolutionNote: cleanNote,
  };

  const fieldChanges: TripFieldDiff[] = [];

  const nextScheduledPickupTime =
    existingReq.requestedScheduledPickupTime || trip.scheduledPickupTime;
  const nextBookingType: 'asap' | 'scheduled' = existingReq.requestedScheduledPickupTime
    ? 'scheduled'
    : trip.bookingType;

  if (
    existingReq.requestedScheduledPickupTime &&
    existingReq.requestedScheduledPickupTime !== trip.scheduledPickupTime
  ) {
    fieldChanges.push({
      field: 'scheduledPickupTime',
      label: 'Pickup Time',
      oldValue: trip.scheduledPickupTime,
      newValue: existingReq.requestedScheduledPickupTime,
    });
  }

  const nextPickupLocation = existingReq.requestedPickupAddress
    ? {
        ...trip.pickupLocation,
        address: existingReq.requestedPickupAddress,
        formattedAddress: existingReq.requestedPickupAddress,
        ...(isValidCoordinates(existingReq.requestedPickupCoordinates)
          ? { coordinates: existingReq.requestedPickupCoordinates }
          : {}),
      }
    : trip.pickupLocation;

  if (
    existingReq.requestedPickupAddress &&
    existingReq.requestedPickupAddress !== trip.pickupLocation.address
  ) {
    fieldChanges.push({
      field: 'pickupLocation',
      label: 'Pickup Address',
      oldValue: trip.pickupLocation.address,
      newValue: existingReq.requestedPickupAddress,
    });
  }

  const nextDropoffLocation = existingReq.requestedDropoffAddress
    ? {
        ...trip.dropoffLocation,
        address: existingReq.requestedDropoffAddress,
        formattedAddress: existingReq.requestedDropoffAddress,
        ...(isValidCoordinates(existingReq.requestedDropoffCoordinates)
          ? { coordinates: existingReq.requestedDropoffCoordinates }
          : {}),
      }
    : trip.dropoffLocation;

  if (
    existingReq.requestedDropoffAddress &&
    existingReq.requestedDropoffAddress !== trip.dropoffLocation.address
  ) {
    fieldChanges.push({
      field: 'dropoffLocation',
      label: 'Dropoff Address',
      oldValue: trip.dropoffLocation.address,
      newValue: existingReq.requestedDropoffAddress,
    });
  }

  const hasNewFare =
    typeof existingReq.estimatedNewFare === 'number' &&
    Number.isFinite(existingReq.estimatedNewFare);

  const nextPricing: TripPricing = hasNewFare
    ? {
        ...trip.pricing,
        subtotal: existingReq.estimatedNewFare!,
        totalFare: existingReq.estimatedNewFare!,
      }
    : trip.pricing;

  const nextPayment = hasNewFare
    ? {
        ...trip.payment,
        amount: existingReq.estimatedNewFare!,
      }
    : trip.payment;

  if (
    hasNewFare &&
    Math.abs((existingReq.estimatedNewFare || 0) - (trip.pricing?.totalFare || 0)) >= 0.01
  ) {
    fieldChanges.push({
      field: 'totalFare',
      label: 'Total Fare',
      oldValue: `$${(trip.pricing?.totalFare || 0).toFixed(2)}`,
      newValue: `$${existingReq.estimatedNewFare!.toFixed(2)}`,
    });
  }

  const nextMetadata: Record<string, unknown> = {
    ...(trip.metadata || {}),
    pendingGuestChangeRequest: resolvedRequest,
  };

  const candidateAfter: Trip = {
    ...trip,
    bookingType: nextBookingType,
    ...(nextScheduledPickupTime ? { scheduledPickupTime: nextScheduledPickupTime } : {}),
    pickupLocation: nextPickupLocation,
    dropoffLocation: nextDropoffLocation,
    pricing: nextPricing,
    payment: nextPayment,
    metadata: nextMetadata,
    updatedAt: nowIso,
  };

  const pendingDriverUpdateAck = trip.assignedDriverId
    ? buildPendingDriverUpdateAck({
        before: trip,
        after: candidateAfter,
        updatedBy: `Passenger (/track) · Approved by ${cleanActor}`,
        source: 'guest_manage_ride',
        nowMs: resolvedNow,
      })
    : null;

  if (pendingDriverUpdateAck) {
    nextMetadata.pendingDriverUpdateAck = pendingDriverUpdateAck;
  }

  const auditEvent: TripAuditEvent = {
    action: 'TRIP_MODIFIED',
    timestamp: nowIso,
    actorRole: 'dispatcher',
    actorId: cleanActor,
    referenceNumber: `GCR-${refSuffix}`,
    referenceType: 'edit',
    fieldChanges: fieldChanges.length > 0 ? fieldChanges : undefined,
    context: `Dispatcher ${cleanActor} approved passenger change request (${
      existingReq.requestId
    }).${pendingDriverUpdateAck ? ' Assigned driver notified for acknowledgement.' : ''}`,
  };

  const nextAuditLog = [...(trip.auditLog || []), auditEvent];

  const tripPatch: Partial<Trip> = {
    bookingType: nextBookingType,
    ...(nextScheduledPickupTime ? { scheduledPickupTime: nextScheduledPickupTime } : {}),
    pickupLocation: nextPickupLocation,
    dropoffLocation: nextDropoffLocation,
    pricing: nextPricing,
    payment: nextPayment,
    metadata: nextMetadata,
    auditLog: nextAuditLog,
    updatedAt: nowIso,
  };

  const updatedTrip: Trip = {
    ...candidateAfter,
    metadata: nextMetadata,
    auditLog: nextAuditLog,
  };

  return {
    updatedTrip,
    tripPatch,
    resolvedRequest,
    pendingDriverUpdateAck,
    auditEvent,
  };
}

/**
 * Builds an atomic passenger cancellation patch enforcing `GuestCancellationPolicyEvaluation`,
 * clearing driver/staged/offer state and recording policy fee preview in `metadata` & `auditLog`.
 */
export function buildGuestCancellationPatch(params: {
  trip: Trip;
  policy: GuestCancellationPolicyEvaluation;
  reason?: string;
  nowMs?: number;
}): {
  updatedTrip: Trip;
  tripPatch: Partial<Trip>;
  auditEvent: TripAuditEvent;
} {
  const { trip, policy, reason } = params;
  if (!policy.canCancel) {
    throw new Error(policy.summaryText || 'This trip can no longer be cancelled.');
  }

  const resolvedNow = resolveNowMs(params.nowMs);
  const nowIso = new Date(resolvedNow).toISOString();
  const cleanReason = normStr(reason) || 'Cancelled by passenger via /track self-service';
  const refSuffix = String(Math.abs(resolvedNow)).slice(-4);

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: 'cancelled' as TripStatus,
    timestamp: nowIso,
    actorRole: 'passenger',
    reason: cleanReason,
  };

  const feeSummary = policy.isFreeCancellation
    ? 'Free cancellation ($0.00)'
    : `Cancellation fee preview: $${policy.cancellationFeeAmount.toFixed(2)} (${policy.policyTier})`;

  const auditEvent: TripAuditEvent = {
    action: 'TRIP_CANCELED',
    timestamp: nowIso,
    actorRole: 'passenger',
    referenceNumber: `CXL-${refSuffix}`,
    referenceType: 'lifecycle',
    bookingChannel: 'web',
    context: `Passenger cancelled reservation via /track self-service [${feeSummary}]. Reason: ${cleanReason}`,
  };

  const existingReq = getPendingGuestChangeRequest(trip);
  const nextMetadata: Record<string, unknown> = {
    ...(trip.metadata || {}),
    pendingDriverUpdateAck: null,
    ...(existingReq && existingReq.status === 'pending'
      ? {
          pendingGuestChangeRequest: {
            ...existingReq,
            status: 'declined',
            resolvedAt: nowIso,
            resolvedBy: 'Passenger (/track)',
            resolutionNote: 'Reservation cancelled by passenger',
          },
        }
      : {}),
    guestCancellationPolicy: {
      policyTier: policy.policyTier,
      isFreeCancellation: policy.isFreeCancellation,
      cancellationFeeAmount: policy.cancellationFeeAmount,
      minutesUntilPickup: policy.minutesUntilPickup,
      freeWindowMinutes: policy.freeWindowMinutes,
      cancelledAt: nowIso,
    },
  };

  const tripPatch: Partial<Trip> = {
    status: 'cancelled',
    cancelledAt: nowIso,
    cancelledBy: 'passenger',
    cancellationReason: cleanReason,
    assignedDriverId: null,
    plannedDriverId: null,
    plannedDriverLabel: null,
    plannedAt: null,
    plannedBy: null,
    offeredToIds: [],
    ...(trip.offerCascade
      ? {
          offerCascade: {
            ...trip.offerCascade,
            state: 'cancelled',
            activeOfferedDriverId: null,
          },
        }
      : {}),
    metadata: nextMetadata,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), auditEvent],
    updatedAt: nowIso,
  };

  const updatedTrip: Trip = {
    ...trip,
    ...tripPatch,
  };

  return {
    updatedTrip,
    tripPatch,
    auditEvent,
  };
}
