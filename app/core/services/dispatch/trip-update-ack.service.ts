/**
 * Assigned-Trip Edit Preservation & Driver Update Acknowledgement Service (Phase 55)
 *
 * Canonical pure domain engine shared by Dispatch edits (Phase 55) and Guest `/track`
 * self-service ride modifications (Phase 56):
 * 1. Preserves `assignedDriverId` and active driver lifecycle status (`assigned` | `accepted` |
 *    `en_route` | `arrived` | `in_progress`) when editing a live trip unless explicitly unassigned
 *    or staged by the operator.
 * 2. Computes deterministic, human-readable operational diffs (`computeAssignedTripEditDiff`).
 * 3. Builds structured `PendingDriverUpdateAck` payloads stored inside `Trip.metadata.pendingDriverUpdateAck`
 *    (compatible with existing `firestore.rules` assigned-driver update allowlist).
 * 4. Builds atomic acknowledgement patches (`buildAcknowledgeTripUpdatePatch`) with `TripAuditEvent` trail.
 */

import type { Trip, TripAuditEvent, TripLocation, TripStatus } from '../../types/trip';

export interface PendingDriverUpdateAck {
  revisionId: string; // e.g., `upd_${nowMs}_${seq}`
  updatedAt: string; // ISO
  updatedBy: string; // e.g., dispatcher email or 'Passenger (/track)'
  source: 'dispatch_edit' | 'guest_manage_ride';
  changesSummary: string[]; // human-readable bullets
  requiresAck: boolean; // true while unacknowledged
  acknowledgedAt?: string | null;
  acknowledgedByDriverId?: string | null;
}

export const ACTIVE_DRIVER_LIFECYCLE_STATUSES: ReadonlySet<TripStatus> = new Set<TripStatus>([
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
]);

export const PRE_ASSIGNMENT_TRIP_STATUSES: ReadonlySet<TripStatus> = new Set<TripStatus>([
  'pending',
  'confirmed',
  'CONFIRMED',
  'UNCONFIRMED',
  'unconfirmed',
  'offered',
]);

export const TERMINAL_TRIP_STATUSES: ReadonlySet<string> = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

let revisionSeqCounter = 0;

function normStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

function truncateText(val: string, maxLen = 56): string {
  const clean = normStr(val);
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

function shortAddress(address?: string | null): string {
  const clean = normStr(address)
    .replace(/,\s*(USA|United States)\s*$/i, '')
    .trim();
  if (!clean) return 'Unspecified';
  return truncateText(clean, 52);
}

function formatPickupTimeDisplay(bookingType?: string, scheduledIso?: string): string {
  if (bookingType === 'asap' || !scheduledIso) {
    return 'ASAP';
  }
  const d = new Date(scheduledIso);
  if (Number.isNaN(d.getTime())) {
    return scheduledIso;
  }
  const datePart = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart}, ${timePart}`;
}

function extractFlightDescriptor(
  flightNotes?: string,
  meta?: Record<string, unknown> | null
): string {
  const m = (meta || {}) as Record<string, unknown>;
  const tail = normStr(m.tailNumber);
  const fbo = normStr(m.fboFacility);
  if (tail || fbo) {
    return [tail ? `Tail #${tail}` : '', fbo ? `FBO ${fbo}` : ''].filter(Boolean).join(' · ');
  }

  const flightDetails = (m.flightDetails || {}) as Record<string, unknown>;
  const airline = normStr(m.airline || m.airlineName || flightDetails.airlineName);
  const flightNum = normStr(m.flightNumber || flightDetails.flightNumber);
  if (airline || flightNum) {
    return [airline, flightNum ? `#${flightNum.replace(/^#/, '')}` : ''].filter(Boolean).join(' ');
  }

  const rawNotes = normStr(flightNotes || m.flightNotes);
  return rawNotes;
}

function formatTierReadable(tier?: string, meta?: Record<string, unknown> | null): string {
  const m = (meta || {}) as Record<string, unknown>;
  const display = normStr(m.vehicleDisplayName);
  if (display && display.toLowerCase() !== 'any') return display;
  const raw = normStr(tier || 'standard');
  return raw.toUpperCase() === 'XL'
    ? 'SUV / XL'
    : raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
}

/**
 * Pure deterministic diff calculator comparing driver-relevant operational fields
 * between the prior `Trip` snapshot and the edited `after` state.
 * Returns `[]` when no driver-relevant operational field changed (e.g., no-op save
 * or dispatch-only `internalNotes` edit).
 */
export function computeAssignedTripEditDiff(
  before: Trip,
  after: Partial<Trip> & Pick<Trip, 'pickupLocation' | 'dropoffLocation'>
): string[] {
  const diffs: string[] = [];

  // 1. Scheduled Pickup Time / Booking Type
  const beforeBookingType = before.bookingType || 'asap';
  const afterBookingType = after.bookingType ?? beforeBookingType;
  const beforeSchedIso = before.scheduledPickupTime;
  const afterSchedIso =
    'scheduledPickupTime' in after ? after.scheduledPickupTime : before.scheduledPickupTime;

  if (beforeBookingType !== afterBookingType) {
    diffs.push(
      `Pickup time: ${formatPickupTimeDisplay(beforeBookingType, beforeSchedIso)} → ${formatPickupTimeDisplay(
        afterBookingType,
        afterSchedIso
      )}`
    );
  } else if (afterBookingType === 'scheduled' && normStr(beforeSchedIso) !== normStr(afterSchedIso)) {
    const bMs = beforeSchedIso ? Date.parse(beforeSchedIso) : NaN;
    const aMs = afterSchedIso ? Date.parse(afterSchedIso) : NaN;
    const minutesChanged =
      !Number.isFinite(bMs) || !Number.isFinite(aMs) || Math.abs(aMs - bMs) >= 60_000;
    if (minutesChanged) {
      diffs.push(
        `Pickup time: ${formatPickupTimeDisplay('scheduled', beforeSchedIso)} → ${formatPickupTimeDisplay(
          'scheduled',
          afterSchedIso
        )}`
      );
    }
  }

  // 2. Pickup Address
  const beforePickupAddr = normStr(before.pickupLocation?.address);
  const afterPickupAddr = normStr(after.pickupLocation?.address);
  if (beforePickupAddr !== afterPickupAddr) {
    diffs.push(
      `Pickup: ${shortAddress(before.pickupLocation?.address)} → ${shortAddress(
        after.pickupLocation?.address
      )}`
    );
  }

  // 3. Intermediate Stops (count & addresses)
  const beforeStopsRaw: TripLocation[] = Array.isArray(before.intermediateStops)
    ? before.intermediateStops.filter((s) => Boolean(normStr(s?.address)))
    : [];
  const afterStopsSource =
    'intermediateStops' in after ? after.intermediateStops : before.intermediateStops;
  const afterStopsRaw: TripLocation[] = Array.isArray(afterStopsSource)
    ? afterStopsSource.filter((s) => Boolean(normStr(s?.address)))
    : [];

  const beforeStopSig = beforeStopsRaw.map((s) => normStr(s.address).toLowerCase()).join('||');
  const afterStopSig = afterStopsRaw.map((s) => normStr(s.address).toLowerCase()).join('||');

  if (beforeStopSig !== afterStopSig) {
    if (beforeStopsRaw.length === 0 && afterStopsRaw.length === 1) {
      diffs.push(`Added Stop #1: ${shortAddress(afterStopsRaw[0].address)}`);
    } else if (beforeStopsRaw.length === 0 && afterStopsRaw.length > 1) {
      diffs.push(
        `Added ${afterStopsRaw.length} stops: ${afterStopsRaw
          .map((s, idx) => `#${idx + 1} ${shortAddress(s.address)}`)
          .join(' → ')}`
      );
    } else if (beforeStopsRaw.length > 0 && afterStopsRaw.length === 0) {
      diffs.push(
        beforeStopsRaw.length === 1
          ? `Removed Stop #1 (${shortAddress(beforeStopsRaw[0].address)})`
          : `Removed all ${beforeStopsRaw.length} intermediate stops`
      );
    } else if (beforeStopsRaw.length !== afterStopsRaw.length) {
      diffs.push(
        `Stops (${beforeStopsRaw.length} → ${afterStopsRaw.length}): ${afterStopsRaw
          .map((s, idx) => `#${idx + 1} ${shortAddress(s.address)}`)
          .join(' → ')}`
      );
    } else {
      diffs.push(
        `Updated stops: ${afterStopsRaw
          .map((s, idx) => `#${idx + 1} ${shortAddress(s.address)}`)
          .join(' → ')}`
      );
    }
  }

  // 4. Dropoff Address & Dropoff Notes
  const beforeDropoffAddr = normStr(before.dropoffLocation?.address);
  const afterDropoffAddr = normStr(after.dropoffLocation?.address);
  if (beforeDropoffAddr !== afterDropoffAddr) {
    diffs.push(
      `Dropoff: ${shortAddress(before.dropoffLocation?.address)} → ${shortAddress(
        after.dropoffLocation?.address
      )}`
    );
  }

  const beforeDropNotes = normStr(before.dropoffLocation?.notes);
  const afterDropNotes =
    after.dropoffLocation && 'notes' in after.dropoffLocation
      ? normStr(after.dropoffLocation.notes)
      : beforeDropNotes;
  if (beforeDropNotes !== afterDropNotes) {
    diffs.push(
      afterDropNotes
        ? `Dropoff notes: "${truncateText(afterDropNotes, 48)}"`
        : 'Dropoff notes cleared'
    );
  }

  // 5. Passenger Count & Luggage Count
  const beforePax = before.passenger?.passengerCount ?? 1;
  const afterPax =
    after.passenger && typeof after.passenger.passengerCount === 'number'
      ? after.passenger.passengerCount
      : beforePax;
  if (beforePax !== afterPax) {
    diffs.push(`Passengers: ${beforePax} → ${afterPax}`);
  }

  const beforeBags = before.passenger?.luggageCount ?? 0;
  const afterBags =
    after.passenger && typeof after.passenger.luggageCount === 'number'
      ? after.passenger.luggageCount
      : beforeBags;
  if (beforeBags !== afterBags) {
    diffs.push(`Luggage: ${beforeBags} → ${afterBags} ${afterBags === 1 ? 'bag' : 'bags'}`);
  }

  // 6. Vehicle Tier
  const beforeTier = normStr(before.vehicleTier || 'standard').toLowerCase();
  const afterTier = normStr(
    'vehicleTier' in after && after.vehicleTier ? after.vehicleTier : before.vehicleTier || 'standard'
  ).toLowerCase();
  if (beforeTier !== afterTier) {
    diffs.push(
      `Vehicle tier: ${formatTierReadable(
        before.vehicleTier,
        before.metadata
      )} → ${formatTierReadable(after.vehicleTier, after.metadata ?? before.metadata)}`
    );
  }

  // 7. Total Fare
  const beforeFare = before.pricing?.totalFare;
  const afterFare =
    after.pricing && typeof after.pricing.totalFare === 'number'
      ? after.pricing.totalFare
      : beforeFare;
  if (
    typeof beforeFare === 'number' &&
    typeof afterFare === 'number' &&
    Number.isFinite(beforeFare) &&
    Number.isFinite(afterFare) &&
    Math.abs(afterFare - beforeFare) >= 0.01
  ) {
    diffs.push(`Fare: $${beforeFare.toFixed(2)} → $${afterFare.toFixed(2)}`);
  }

  // 8. Driver Notes / Pickup Notes, Special Requests & Gate Code
  const beforeDriverNotes = normStr(before.driverNotes ?? before.pickupLocation?.notes);
  const resolvedAfterDriverNotes = (() => {
    if ('driverNotes' in after) return normStr(after.driverNotes);
    if (after.pickupLocation && 'notes' in after.pickupLocation) {
      return normStr(after.pickupLocation.notes);
    }
    return beforeDriverNotes;
  })();
  if (beforeDriverNotes !== resolvedAfterDriverNotes) {
    diffs.push(
      resolvedAfterDriverNotes
        ? `Notes: "${truncateText(resolvedAfterDriverNotes, 52)}"`
        : 'Notes cleared'
    );
  } else if (after.pickupLocation && 'notes' in after.pickupLocation) {
    const beforePickupNotes = normStr(before.pickupLocation?.notes);
    const afterPickupNotes = normStr(after.pickupLocation.notes);
    if (beforePickupNotes !== afterPickupNotes && afterPickupNotes !== resolvedAfterDriverNotes) {
      diffs.push(
        afterPickupNotes
          ? `Pickup notes: "${truncateText(afterPickupNotes, 48)}"`
          : 'Pickup notes cleared'
      );
    }
  }

  const beforeSpecial = normStr(before.passenger?.specialRequests);
  const afterSpecial =
    after.passenger && 'specialRequests' in after.passenger
      ? normStr(after.passenger.specialRequests)
      : beforeSpecial;
  if (beforeSpecial !== afterSpecial) {
    diffs.push(
      afterSpecial
        ? `Special requests: ${truncateText(afterSpecial, 52)}`
        : 'Special requests cleared'
    );
  }

  const beforeMeta = (before.metadata || {}) as Record<string, unknown>;
  const afterMeta = after.metadata
    ? ({ ...beforeMeta, ...(after.metadata as Record<string, unknown>) } as Record<string, unknown>)
    : beforeMeta;

  const beforeGate = normStr(beforeMeta.gateCode);
  const afterGate = normStr(afterMeta.gateCode);
  if (beforeGate !== afterGate) {
    diffs.push(afterGate ? `Gate code: ${afterGate}` : 'Gate code cleared');
  }

  // 9. Flight Number / Airline / Aviation
  const beforeFlight = extractFlightDescriptor(before.flightNotes, beforeMeta);
  const afterFlightNotes = 'flightNotes' in after ? after.flightNotes : before.flightNotes;
  const afterFlight = extractFlightDescriptor(afterFlightNotes, afterMeta);
  if (beforeFlight !== afterFlight) {
    if (!beforeFlight && afterFlight) {
      diffs.push(`Flight added: ${truncateText(afterFlight, 48)}`);
    } else if (beforeFlight && !afterFlight) {
      diffs.push('Flight info removed');
    } else {
      diffs.push(
        `Flight: ${truncateText(beforeFlight, 30)} → ${truncateText(afterFlight, 30)}`
      );
    }
  }

  return diffs;
}

export interface BuildPendingDriverUpdateAckParams {
  before: Trip;
  after: Partial<Trip>;
  updatedBy: string;
  source?: 'dispatch_edit' | 'guest_manage_ride';
  requireDriverUpdateAck?: boolean;
  nowMs?: number;
}

/**
 * Builds a structured `PendingDriverUpdateAck` when an edit modifies driver-relevant
 * operational fields on an active assigned trip that retains its assigned driver.
 * Returns `null` if `requireDriverUpdateAck === false`, unassigned, reassigned, terminal, or unchanged.
 */
export function buildPendingDriverUpdateAck(
  params: BuildPendingDriverUpdateAckParams
): PendingDriverUpdateAck | null {
  const {
    before,
    after,
    updatedBy,
    source = 'dispatch_edit',
    requireDriverUpdateAck = true,
    nowMs,
  } = params;

  if (requireDriverUpdateAck === false) {
    return null;
  }

  const afterStatus = String(after.status ?? before.status ?? '');
  if (TERMINAL_TRIP_STATUSES.has(afterStatus) || TERMINAL_TRIP_STATUSES.has(String(before.status || ''))) {
    return null;
  }

  const afterAssignedDriverId =
    'assignedDriverId' in after ? after.assignedDriverId : before.assignedDriverId;
  if (!afterAssignedDriverId) {
    return null;
  }
  if (before.assignedDriverId && afterAssignedDriverId !== before.assignedDriverId) {
    return null;
  }

  const changesSummary = computeAssignedTripEditDiff(before, {
    ...after,
    pickupLocation: after.pickupLocation ?? before.pickupLocation,
    dropoffLocation: after.dropoffLocation ?? before.dropoffLocation,
  });

  if (changesSummary.length === 0) {
    return null;
  }

  revisionSeqCounter += 1;
  const resolvedMs =
    typeof nowMs === 'number' && Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();

  return {
    revisionId: `upd_${resolvedMs}_${revisionSeqCounter}`,
    updatedAt: new Date(resolvedMs).toISOString(),
    updatedBy: normStr(updatedBy) || 'Dispatcher',
    source,
    changesSummary,
    requiresAck: true,
    acknowledgedAt: null,
    acknowledgedByDriverId: null,
  };
}

/**
 * Extracts typed `PendingDriverUpdateAck` from `trip.metadata.pendingDriverUpdateAck` when valid.
 */
export function getPendingDriverUpdateAck(
  trip: Partial<Trip> | null | undefined
): PendingDriverUpdateAck | null {
  if (!trip || !trip.metadata || typeof trip.metadata !== 'object') return null;
  const raw = (trip.metadata as Record<string, unknown>).pendingDriverUpdateAck;
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<PendingDriverUpdateAck>;
  if (
    typeof candidate.revisionId !== 'string' ||
    !candidate.revisionId ||
    !Array.isArray(candidate.changesSummary)
  ) {
    return null;
  }
  return {
    revisionId: candidate.revisionId,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    updatedBy: typeof candidate.updatedBy === 'string' ? candidate.updatedBy : 'Dispatcher',
    source: candidate.source === 'guest_manage_ride' ? 'guest_manage_ride' : 'dispatch_edit',
    changesSummary: candidate.changesSummary.map((s) => String(s)),
    requiresAck: Boolean(candidate.requiresAck),
    acknowledgedAt: candidate.acknowledgedAt ?? null,
    acknowledgedByDriverId: candidate.acknowledgedByDriverId ?? null,
  };
}

/**
 * Returns `true` when `trip` currently has an active, unacknowledged driver update revision.
 */
export function hasUnacknowledgedDriverUpdate(
  trip: Partial<Trip> | null | undefined
): boolean {
  if (!trip || !trip.assignedDriverId) return false;
  if (TERMINAL_TRIP_STATUSES.has(String(trip.status || ''))) return false;
  const ack = getPendingDriverUpdateAck(trip);
  return Boolean(
    ack &&
      ack.requiresAck === true &&
      !ack.acknowledgedAt &&
      ack.changesSummary.length > 0
  );
}

/**
 * Returns `true` when `trip` currently has an active, unacknowledged driver update revision
 * whose `updatedAt` timestamp has exceeded `unacknowledgedAlertMinutes` (clamped 1..60, default 5).
 */
export function isDriverUpdateAckOverdue(
  trip: Partial<Trip> | null | undefined,
  unacknowledgedAlertMinutes: number = 5,
  nowMs: number = Date.now()
): boolean {
  if (!trip || !trip.assignedDriverId) return false;
  if (TERMINAL_TRIP_STATUSES.has(String(trip.status || ''))) return false;

  const meta = (trip.metadata || {}) as Record<string, any>;
  const rawAck = meta.pendingDriverUpdateAck;
  const parsedAck = getPendingDriverUpdateAck(trip);

  const isPending =
    hasUnacknowledgedDriverUpdate(trip) ||
    Boolean(rawAck && rawAck.requiresAck !== false && !rawAck.acknowledgedAt);
  if (!isPending) return false;

  const updatedIso = parsedAck?.updatedAt || rawAck?.updatedAt;
  if (typeof updatedIso !== 'string' || !updatedIso.trim()) return false;
  const updatedMs = Date.parse(updatedIso);
  if (!Number.isFinite(updatedMs)) return false;

  const rawThreshold = Number(unacknowledgedAlertMinutes);
  const clampedMinutes = Number.isFinite(rawThreshold)
    ? Math.min(60, Math.max(1, Math.round(rawThreshold)))
    : 5;

  return nowMs - updatedMs >= clampedMinutes * 60_000;
}

/**
 * Returns `true` when the latest driver update revision on `trip` has been acknowledged by the driver.
 */
export function hasAcknowledgedDriverUpdate(
  trip: Partial<Trip> | null | undefined
): boolean {
  if (!trip || !trip.assignedDriverId) return false;
  const ack = getPendingDriverUpdateAck(trip);
  return Boolean(
    ack &&
      ack.requiresAck === false &&
      Boolean(ack.acknowledgedAt) &&
      ack.changesSummary.length > 0
  );
}

/**
 * Builds an atomic `Partial<Trip>` patch marking `metadata.pendingDriverUpdateAck` acknowledged
 * and appending a driver `STATUS_CHANGED` audit trail event.
 * Touches strictly `metadata`, `auditLog`, and `updatedAt` (100% allowed by `firestore.rules`).
 */
export function buildAcknowledgeTripUpdatePatch(
  trip: Trip,
  driverId: string,
  nowIso?: string
): Partial<Trip> {
  const resolvedIso = nowIso || new Date().toISOString();
  const existing = getPendingDriverUpdateAck(trip);
  const changesSummary = existing?.changesSummary ? [...existing.changesSummary] : [];

  const updatedAck: PendingDriverUpdateAck = {
    revisionId: existing?.revisionId || `upd_${Date.parse(resolvedIso) || Date.now()}_ack`,
    updatedAt: existing?.updatedAt || resolvedIso,
    updatedBy: existing?.updatedBy || 'Dispatcher',
    source: existing?.source || 'dispatch_edit',
    changesSummary,
    requiresAck: false,
    acknowledgedAt: resolvedIso,
    acknowledgedByDriverId: driverId,
  };

  const summaryContext =
    changesSummary.length > 0 ? changesSummary.join('; ') : 'trip details updated';
  const refSuffix = String(Math.abs(Date.parse(resolvedIso) || Date.now())).slice(-4);

  const ackAuditEvent: TripAuditEvent = {
    action: 'STATUS_CHANGED',
    timestamp: resolvedIso,
    actorRole: 'driver',
    actorId: driverId,
    referenceNumber: `ACK-${refSuffix}`,
    referenceType: 'lifecycle',
    context: `Driver acknowledged dispatch trip update (${summaryContext})`,
  };

  return {
    metadata: {
      ...(trip.metadata || {}),
      pendingDriverUpdateAck: updatedAck,
    },
    auditLog: [...(trip.auditLog || []), ackAuditEvent],
    updatedAt: resolvedIso,
  };
}

export interface ResolveAssignedTripEditPreservationParams {
  initialTrip: Trip;
  formDriverId: string;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  driverExplicitlyChangedByUser: boolean;
  isCompleted?: boolean;
  isCancelled?: boolean;
}

export interface ResolvedAssignedTripEditPreservation {
  assignedDriverId: string | null;
  status: TripStatus;
  isStagingSelectedDriver: boolean;
  retainedSameAssignedDriver: boolean;
  shouldClearPendingUpdateAck: boolean;
}

/**
 * Pure preservation resolver for Dispatch Edit submissions:
 * - When `initialTrip.assignedDriverId` is present, preserves `assignedDriverId` and active
 *   driver lifecycle `status` (`assigned` | `accepted` | `en_route` | `arrived` | `in_progress`)
 *   unless the operator explicitly changed the driver to `'unassigned'` or switched to `'stage_hold'`.
 * - Supports explicit reassignment (`drv-1` -> `drv-2`) and clears stale `pendingDriverUpdateAck`
 *   on unassignment or reassignment.
 */
export function resolveAssignedTripEditPreservation(
  params: ResolveAssignedTripEditPreservationParams
): ResolvedAssignedTripEditPreservation {
  const {
    initialTrip,
    formDriverId,
    driverAssignmentMode = 'send_to_driver',
    driverExplicitlyChangedByUser,
    isCompleted = initialTrip.status === 'completed',
    isCancelled = initialTrip.status === 'cancelled',
  } = params;

  const cleanFormDriverId = normStr(formDriverId) || 'unassigned';

  if (isCompleted || isCancelled) {
    return {
      assignedDriverId: initialTrip.assignedDriverId ?? null,
      status: initialTrip.status,
      isStagingSelectedDriver: false,
      retainedSameAssignedDriver: Boolean(initialTrip.assignedDriverId),
      shouldClearPendingUpdateAck: false,
    };
  }

  if (initialTrip.assignedDriverId) {
    const explicitlyUnassigned =
      driverExplicitlyChangedByUser && cleanFormDriverId === 'unassigned';
    const explicitlyStaged =
      driverExplicitlyChangedByUser &&
      cleanFormDriverId !== 'unassigned' &&
      driverAssignmentMode === 'stage_hold';

    if (explicitlyUnassigned) {
      return {
        assignedDriverId: null,
        status: ACTIVE_DRIVER_LIFECYCLE_STATUSES.has(initialTrip.status)
          ? 'CONFIRMED'
          : initialTrip.status,
        isStagingSelectedDriver: false,
        retainedSameAssignedDriver: false,
        shouldClearPendingUpdateAck: true,
      };
    }

    if (explicitlyStaged) {
      return {
        assignedDriverId: null,
        status: ACTIVE_DRIVER_LIFECYCLE_STATUSES.has(initialTrip.status)
          ? 'CONFIRMED'
          : initialTrip.status,
        isStagingSelectedDriver: true,
        retainedSameAssignedDriver: false,
        shouldClearPendingUpdateAck: true,
      };
    }

    const preservedDriverId =
      driverExplicitlyChangedByUser && cleanFormDriverId !== 'unassigned'
        ? cleanFormDriverId
        : initialTrip.assignedDriverId;

    const retainedSame = preservedDriverId === initialTrip.assignedDriverId;
    const nextStatus: TripStatus = retainedSame
      ? ACTIVE_DRIVER_LIFECYCLE_STATUSES.has(initialTrip.status)
        ? initialTrip.status
        : PRE_ASSIGNMENT_TRIP_STATUSES.has(initialTrip.status)
        ? 'assigned'
        : initialTrip.status
      : 'assigned';

    return {
      assignedDriverId: preservedDriverId,
      status: nextStatus,
      isStagingSelectedDriver: false,
      retainedSameAssignedDriver: retainedSame,
      shouldClearPendingUpdateAck: !retainedSame,
    };
  }

  // Previously unassigned or staged trip
  const isStagingSelectedDriver =
    cleanFormDriverId !== 'unassigned' && driverAssignmentMode === 'stage_hold';
  const assignedDriverId =
    cleanFormDriverId === 'unassigned' || isStagingSelectedDriver ? null : cleanFormDriverId;
  const status: TripStatus =
    assignedDriverId && PRE_ASSIGNMENT_TRIP_STATUSES.has(initialTrip.status)
      ? 'assigned'
      : initialTrip.status;

  return {
    assignedDriverId,
    status,
    isStagingSelectedDriver,
    retainedSameAssignedDriver: false,
    shouldClearPendingUpdateAck: Boolean(getPendingDriverUpdateAck(initialTrip)),
  };
}
