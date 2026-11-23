/**
 * Dispatch Booking Duplicate & Future Schedule Conflict Checker
 * (`booking-conflict-checker.service.ts` — Platform Phase 52.B)
 *
 * Detects before and during Dispatch Booking submission:
 * 1. Exact / near-duplicate active or future bookings for the same passenger (phone, email, or full name).
 * 2. Overlapping or closely spaced (< 90m) future/active trips for the same passenger.
 * 3. Future `Assigned` or `📌 Staged` schedule overlaps / tight turnarounds (< 15m) for a selected driver.
 */

import type { Trip } from '../../types/trip';
import type { AutoDispatchDriverInput } from './auto-dispatch-ranking';
import {
  computeDriverScheduleTimeline,
  formatShortTripNumber,
  resolveStagedDriverLabel,
  resolveTripEstimatedDurationMinutes,
} from './staged-driver-planner.service';

export type BookingConflictKind =
  | 'exact_duplicate'
  | 'passenger_time_overlap'
  | 'passenger_nearby_booking'
  | 'driver_schedule_overlap'
  | 'driver_tight_turnaround';

export type BookingConflictSeverity = 'critical' | 'warning';

export interface BookingConflictItem {
  id: string;
  kind: BookingConflictKind;
  severity: BookingConflictSeverity;
  leg: 'outbound' | 'return';
  conflictingTripId: string;
  conflictingTripNumber: string;
  conflictingTrip: Trip;
  title: string;
  description: string;
  pickupTimeLabel: string;
  routeLabel: string;
}

export interface BookingConflictCheckSummary {
  hasConflicts: boolean;
  hasCriticalConflicts: boolean;
  criticalCount: number;
  warningCount: number;
  conflicts: BookingConflictItem[];
  signature: string;
}

export interface EvaluateDispatchBookingConflictsParams {
  timingType: 'asap' | 'later';
  scheduledDate?: string;
  scheduledTime?: string;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedDurationMinutes?: number;
  passengerName: string;
  phone: string;
  email?: string;
  driverId?: string;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  drivers?: ReadonlyArray<AutoDispatchDriverInput>;
  returnTrip?: boolean;
  autoCreateReturnTrip?: boolean;
  returnDate?: string;
  returnTime?: string;
  returnPickupAddress?: string;
  returnDropoffAddress?: string;
  returnEstimatedDurationMinutes?: number;
  allTrips: ReadonlyArray<Trip>;
  excludeTripId?: string | null;
  excludeMultiCarGroupId?: string | null;
  nowMs?: number;
}

const TERMINAL_STATUSES = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

const ACTIVE_RIDE_STATUSES = new Set<string>(['en_route', 'arrived', 'in_progress']);

export function normalizePhoneForMatch(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length >= 7 ? digits : '';
}

export function normalizeEmailForMatch(email?: string | null): string {
  const clean = String(email || '').trim().toLowerCase();
  return clean.includes('@') && clean.length >= 5 ? clean : '';
}

export function normalizeNameForMatch(name?: string | null): string {
  const clean = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (clean.length < 5 || !clean.includes(' ')) return '';
  if (clean === 'guest passenger') return '';
  return clean;
}

export function normalizeAddressForMatch(addr?: string | null): string {
  return String(addr || '')
    .trim()
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 64);
}

function formatConflictPickupLabel(trip: Trip): string {
  if (!trip.scheduledPickupTime || trip.bookingType === 'asap') {
    return ACTIVE_RIDE_STATUSES.has(trip.status)
      ? `Active (${trip.status.replace(/_/g, ' ')})`
      : 'ASAP (Open)';
  }
  const ms = Date.parse(trip.scheduledPickupTime);
  if (!Number.isFinite(ms)) return 'Scheduled';
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortRouteLabel(pickup?: string, dropoff?: string): string {
  const p = (pickup || '').split(',')[0]?.trim() || 'Pickup';
  const d = (dropoff || '').split(',')[0]?.trim() || 'Dropoff';
  return `${p} → ${d}`;
}

function resolveCandidateLegWindow(params: {
  timingType: 'asap' | 'later';
  dateStr?: string;
  timeStr?: string;
  durationMinutes?: number;
  nowMs: number;
}): { startMs: number; endMs: number; durationMinutes: number; scheduledIso?: string } | null {
  const dur = Math.max(15, Math.round(Number(params.durationMinutes) || 25));
  if (params.timingType === 'asap') {
    return {
      startMs: params.nowMs,
      endMs: params.nowMs + dur * 60_000,
      durationMinutes: dur,
    };
  }
  if (!params.dateStr || !params.timeStr) return null;
  const parsed = new Date(`${params.dateStr}T${params.timeStr}:00`).getTime();
  if (!Number.isFinite(parsed)) return null;
  return {
    startMs: parsed,
    endMs: parsed + dur * 60_000,
    durationMinutes: dur,
    scheduledIso: new Date(parsed).toISOString(),
  };
}

function resolveExistingTripWindow(
  trip: Trip,
  nowMs: number
): { startMs: number; endMs: number } | null {
  const durMins = resolveTripEstimatedDurationMinutes(trip, 25);
  const durMs = durMins * 60_000;

  if (ACTIVE_RIDE_STATUSES.has(trip.status)) {
    return {
      startMs: nowMs - 5 * 60_000,
      endMs: nowMs + durMs,
    };
  }

  if (trip.scheduledPickupTime && trip.bookingType !== 'asap') {
    const schedMs = Date.parse(trip.scheduledPickupTime);
    if (!Number.isFinite(schedMs)) return null;
    // Ignore stale historical unclosed fixtures older than 3 hours in the past
    if (schedMs < nowMs - 3 * 3600_000) return null;
    return {
      startMs: schedMs,
      endMs: schedMs + durMs,
    };
  }

  const createdMs = trip.createdAt ? Date.parse(trip.createdAt) : nowMs;
  const safeCreatedMs = Number.isFinite(createdMs) ? createdMs : nowMs;
  // Ignore stale historical ASAP fixtures older than 3 hours unless actively in_progress
  if (safeCreatedMs < nowMs - 3 * 3600_000) return null;

  return {
    startMs: safeCreatedMs,
    endMs: Math.max(nowMs, safeCreatedMs) + durMs,
  };
}

function doesTripMatchPassenger(
  trip: Trip,
  candPhone: string,
  candEmail: string,
  candName: string
): boolean {
  const existPhone = normalizePhoneForMatch(trip.passenger?.phone);
  if (candPhone && existPhone && candPhone === existPhone) {
    return true;
  }

  const existEmail = normalizeEmailForMatch(trip.passenger?.email);
  if (candEmail && existEmail && candEmail === existEmail) {
    return true;
  }

  // Only fall back to exact full-name matching when neither side has a conflicting distinct phone
  if (candName && (!candPhone || !existPhone)) {
    const existFullName = normalizeNameForMatch(
      `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`
    );
    if (existFullName && candName === existFullName) {
      return true;
    }
  }

  return false;
}

export function evaluateDispatchBookingConflicts(
  params: EvaluateDispatchBookingConflictsParams
): BookingConflictCheckSummary {
  const {
    timingType,
    scheduledDate,
    scheduledTime,
    pickupAddress,
    dropoffAddress,
    estimatedDurationMinutes,
    passengerName,
    phone,
    email,
    driverId,
    drivers = [],
    returnTrip = false,
    autoCreateReturnTrip = true,
    returnDate,
    returnTime,
    returnPickupAddress,
    returnDropoffAddress,
    returnEstimatedDurationMinutes,
    allTrips,
    excludeTripId,
    excludeMultiCarGroupId,
    nowMs = Date.now(),
  } = params;

  if (!Array.isArray(allTrips) || allTrips.length === 0) {
    return {
      hasConflicts: false,
      hasCriticalConflicts: false,
      criticalCount: 0,
      warningCount: 0,
      conflicts: [],
      signature: '',
    };
  }

  const activeCandidateTrips = allTrips.filter((t) => {
    if (!t || t.isArchived || t.isBlacklisted) return false;
    if (TERMINAL_STATUSES.has(String(t.status || ''))) return false;
    if (excludeTripId && t.id === excludeTripId) return false;
    if (excludeMultiCarGroupId && t.multiCarGroupId === excludeMultiCarGroupId) return false;
    return true;
  });

  const conflicts: BookingConflictItem[] = [];
  const candPhone = normalizePhoneForMatch(phone);
  const candEmail = normalizeEmailForMatch(email);
  const candName = normalizeNameForMatch(passengerName);
  const hasPassengerIdentity = Boolean(candPhone || candEmail || candName);

  const outboundWindow = resolveCandidateLegWindow({
    timingType,
    dateStr: scheduledDate,
    timeStr: scheduledTime,
    durationMinutes: estimatedDurationMinutes,
    nowMs,
  });

  // 1. Check Passenger Duplicate & Overlapping Active / Future Trips
  const checkPassengerLeg = (
    leg: 'outbound' | 'return',
    legWindow: { startMs: number; endMs: number } | null,
    legPickup: string,
    legDropoff: string
  ) => {
    if (!hasPassengerIdentity || !legWindow) return;

    const normPickup = normalizeAddressForMatch(legPickup);
    const normDropoff = normalizeAddressForMatch(legDropoff);
    const seenConvoyGroups = new Set<string>();

    for (const existing of activeCandidateTrips) {
      if (!doesTripMatchPassenger(existing, candPhone, candEmail, candName)) continue;

      if (existing.multiCarGroupId) {
        if (seenConvoyGroups.has(existing.multiCarGroupId)) continue;
        seenConvoyGroups.add(existing.multiCarGroupId);
      }

      const existWin = resolveExistingTripWindow(existing, nowMs);
      if (!existWin) continue;

      const existPickup = normalizeAddressForMatch(existing.pickupLocation?.address);
      const existDropoff = normalizeAddressForMatch(existing.dropoffLocation?.address);
      const sameRoute =
        Boolean(normPickup && normDropoff) &&
        normPickup === existPickup &&
        normDropoff === existDropoff;

      const pickupDiffMinutes = Math.round(Math.abs(legWindow.startMs - existWin.startMs) / 60_000);
      const intervalsOverlap =
        legWindow.startMs < existWin.endMs && existWin.startMs < legWindow.endMs;

      const shortNo = formatShortTripNumber(existing.id);
      const pickupLabel = formatConflictPickupLabel(existing);
      const routeLabel = formatShortRouteLabel(
        existing.pickupLocation?.address,
        existing.dropoffLocation?.address
      );
      const paxDisplay =
        `${existing.passenger?.firstName || ''} ${existing.passenger?.lastName || ''}`.trim() ||
        'Passenger';
      const legPrefix = leg === 'return' ? 'Return leg: ' : '';

      if (sameRoute && pickupDiffMinutes <= 60) {
        conflicts.push({
          id: `dup:${leg}:${existing.id}`,
          kind: 'exact_duplicate',
          severity: 'critical',
          leg,
          conflictingTripId: existing.id,
          conflictingTripNumber: shortNo,
          conflictingTrip: existing,
          title: `${legPrefix}Identical / Duplicate Booking (#${shortNo})`,
          description: `${paxDisplay} already has an open ${pickupLabel} booking on the exact same route.`,
          pickupTimeLabel: pickupLabel,
          routeLabel,
        });
      } else if (intervalsOverlap || pickupDiffMinutes <= 20) {
        conflicts.push({
          id: `pax-overlap:${leg}:${existing.id}`,
          kind: 'passenger_time_overlap',
          severity: 'critical',
          leg,
          conflictingTripId: existing.id,
          conflictingTripNumber: shortNo,
          conflictingTrip: existing,
          title: `${legPrefix}Passenger Time Conflict (#${shortNo})`,
          description: `${paxDisplay} already has an overlapping trip (${pickupLabel}) within ${pickupDiffMinutes}m.`,
          pickupTimeLabel: pickupLabel,
          routeLabel,
        });
      } else if (pickupDiffMinutes <= 90) {
        conflicts.push({
          id: `pax-nearby:${leg}:${existing.id}`,
          kind: 'passenger_nearby_booking',
          severity: 'warning',
          leg,
          conflictingTripId: existing.id,
          conflictingTripNumber: shortNo,
          conflictingTrip: existing,
          title: `${legPrefix}Nearby Scheduled Trip (#${shortNo})`,
          description: `${paxDisplay} already has another trip ${pickupDiffMinutes}m apart (${pickupLabel}).`,
          pickupTimeLabel: pickupLabel,
          routeLabel,
        });
      }
    }
  };

  checkPassengerLeg('outbound', outboundWindow, pickupAddress, dropoffAddress);

  if (returnTrip && autoCreateReturnTrip && returnDate && returnTime) {
    const returnWindow = resolveCandidateLegWindow({
      timingType: 'later',
      dateStr: returnDate,
      timeStr: returnTime,
      durationMinutes: returnEstimatedDurationMinutes || estimatedDurationMinutes,
      nowMs,
    });
    checkPassengerLeg(
      'return',
      returnWindow,
      returnPickupAddress?.trim() || dropoffAddress,
      returnDropoffAddress?.trim() || pickupAddress
    );
  }

  // 2. Check Selected Driver / Staged Driver Future Schedule Conflicts
  if (driverId && driverId !== 'unassigned' && outboundWindow) {
    const selectedDriver = drivers.find((d) => d.id === driverId);
    const driverLabel = selectedDriver ? resolveStagedDriverLabel(selectedDriver) : driverId;
    const probeId = '__draft_conflict_probe__';

    const probeTrip: Trip = {
      id: probeId,
      status: 'CONFIRMED',
      bookingType: timingType === 'later' ? 'scheduled' : 'asap',
      scheduledPickupTime: outboundWindow.scheduledIso,
      plannedDriverId: driverId,
      assignedDriverId: null,
      offeredToIds: [],
      rejectedByIds: [],
      pickupLocation: { address: pickupAddress || 'Draft Pickup' },
      dropoffLocation: { address: dropoffAddress || 'Draft Dropoff' },
      passenger: {
        firstName: passengerName || 'Draft',
        lastName: '',
        email: email || '',
        phone: phone || '',
        passengerCount: 1,
        luggageCount: 0,
      },
      vehicleTier: 'standard',
      pricing: {
        baseFare: 0,
        distanceMiles: 0,
        durationMinutes: outboundWindow.durationMinutes,
        distanceRate: 0,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: 0,
        totalFare: 0,
        currency: 'USD',
      },
      payment: { method: 'cash', status: 'pending', amount: 0 },
      statusHistory: [],
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    };

    const timeline = computeDriverScheduleTimeline(
      driverId,
      [...activeCandidateTrips, probeTrip],
      { tightBufferMinutes: 15, nowMs }
    );
    const probeIdx = timeline.items.findIndex((it) => it.trip.id === probeId);

    if (probeIdx !== -1) {
      const probeItem = timeline.items[probeIdx];
      const priorItem = probeIdx > 0 ? timeline.items[probeIdx - 1] : null;
      const nextItem =
        probeIdx + 1 < timeline.items.length ? timeline.items[probeIdx + 1] : null;

      // Conflict against prior trip in driver's schedule
      if (priorItem && probeItem.conflictStatus !== 'ok') {
        const shortPrior = formatShortTripNumber(priorItem.trip.id);
        const priorPickup = formatConflictPickupLabel(priorItem.trip);
        const priorRoute = formatShortRouteLabel(
          priorItem.trip.pickupLocation?.address,
          priorItem.trip.dropoffLocation?.address
        );
        const buf = probeItem.bufferMinutesAfterPrior ?? 0;

        if (probeItem.conflictStatus === 'overlap') {
          conflicts.push({
            id: `drv-prior-overlap:${priorItem.trip.id}`,
            kind: 'driver_schedule_overlap',
            severity: 'critical',
            leg: 'outbound',
            conflictingTripId: priorItem.trip.id,
            conflictingTripNumber: shortPrior,
            conflictingTrip: priorItem.trip,
            title: `Driver Overlap with #${shortPrior} (${buf}m)`,
            description: `${driverLabel} is still on ${
              priorItem.assignmentState === 'staged' ? 'staged' : 'assigned'
            } Trip #${shortPrior} (${priorPickup}, ${buf}m overlap).`,
            pickupTimeLabel: priorPickup,
            routeLabel: priorRoute,
          });
        } else {
          conflicts.push({
            id: `drv-prior-tight:${priorItem.trip.id}`,
            kind: 'driver_tight_turnaround',
            severity: 'warning',
            leg: 'outbound',
            conflictingTripId: priorItem.trip.id,
            conflictingTripNumber: shortPrior,
            conflictingTrip: priorItem.trip,
            title: `Tight Driver Buffer after #${shortPrior} (+${buf}m)`,
            description: `${driverLabel} finishes ${
              priorItem.assignmentState === 'staged' ? 'staged' : 'assigned'
            } Trip #${shortPrior} only ${buf}m before this pickup.`,
            pickupTimeLabel: priorPickup,
            routeLabel: priorRoute,
          });
        }
      }

      // Conflict introduced against subsequent future trip in driver's schedule
      if (nextItem && nextItem.conflictStatus !== 'ok') {
        const shortNext = formatShortTripNumber(nextItem.trip.id);
        const nextPickup = formatConflictPickupLabel(nextItem.trip);
        const nextRoute = formatShortRouteLabel(
          nextItem.trip.pickupLocation?.address,
          nextItem.trip.dropoffLocation?.address
        );
        const nextBuf = nextItem.bufferMinutesAfterPrior ?? 0;

        if (nextItem.conflictStatus === 'overlap') {
          conflicts.push({
            id: `drv-next-overlap:${nextItem.trip.id}`,
            kind: 'driver_schedule_overlap',
            severity: 'critical',
            leg: 'outbound',
            conflictingTripId: nextItem.trip.id,
            conflictingTripNumber: shortNext,
            conflictingTrip: nextItem.trip,
            title: `Overlaps Driver's Upcoming #${shortNext} (${nextBuf}m)`,
            description: `This ride would overrun ${driverLabel}'s ${
              nextItem.assignmentState === 'staged' ? 'staged' : 'assigned'
            } Trip #${shortNext} at ${nextPickup} (${nextBuf}m overlap).`,
            pickupTimeLabel: nextPickup,
            routeLabel: nextRoute,
          });
        } else {
          conflicts.push({
            id: `drv-next-tight:${nextItem.trip.id}`,
            kind: 'driver_tight_turnaround',
            severity: 'warning',
            leg: 'outbound',
            conflictingTripId: nextItem.trip.id,
            conflictingTripNumber: shortNext,
            conflictingTrip: nextItem.trip,
            title: `Tight Buffer before Driver's #${shortNext} (+${nextBuf}m)`,
            description: `Leaves only +${nextBuf}m turnaround before ${driverLabel}'s ${
              nextItem.assignmentState === 'staged' ? 'staged' : 'assigned'
            } Trip #${shortNext} (${nextPickup}).`,
            pickupTimeLabel: nextPickup,
            routeLabel: nextRoute,
          });
        }
      }
    }
  }

  // Sort critical conflicts first
  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  const criticalCount = conflicts.filter((c) => c.severity === 'critical').length;
  const warningCount = conflicts.length - criticalCount;

  return {
    hasConflicts: conflicts.length > 0,
    hasCriticalConflicts: criticalCount > 0,
    criticalCount,
    warningCount,
    conflicts,
    signature: conflicts.map((c) => c.id).join('|'),
  };
}
