/**
 * Pure Assignment Dropdown Urgency & Tone Resolution Service (Phase 78)
 *
 * Deterministically resolves the visual tone for `DriverAssignDropdown` across
 * Dispatch and Admin views from trip status, staging/offer state, bookingType,
 * SLA thresholds, and airport flight-tracking arrival timestamps.
 *
 * Zero React or browser DOM dependencies per `constitution.md`.
 */

import { detectAirportInAddresses } from '../../config/airports';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
  type DispatchAutomationConfig,
} from '../../types/config';
import type { Trip } from '../../types/trip';

export type AssignmentDropdownTone =
  | 'staged_white'
  | 'offered_purple'
  | 'assigned_green'
  | 'unassigned_blue'
  | 'warning_orange'
  | 'critical_red';

export interface AssignmentToneResolution {
  tone: AssignmentDropdownTone;
  effectivePickupMs: number | null;
  isAirportTrip: boolean;
  minutesUntilPickup: number | null;
  reason: string;
}

export interface AssignmentToneOptions {
  hasStaged?: boolean;
  isStageMode?: boolean;
  isAssigned?: boolean;
  isCascadeExhausted?: boolean;
}

const ASSIGNED_LIFECYCLE_STATUSES = new Set<string>([
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
]);

const ARRIVED_OR_BEYOND_STATUSES = new Set<string>([
  'arrived',
  'in_progress',
  'completed',
]);

function isAirportTripRecord(trip?: Partial<Trip> | null): boolean {
  if (!trip) return false;
  const airportCheck = detectAirportInAddresses(
    trip.pickupLocation?.address || '',
    trip.dropoffLocation?.address || ''
  );
  const meta = (trip.metadata || {}) as Record<string, unknown>;
  return Boolean(airportCheck.isAirportTrip || meta.isAirportTrip);
}

/**
 * Resolves the effective pickup timestamp in epoch milliseconds.
 *
 * For airport trips (`detectAirportInAddresses` or `trip.metadata?.isAirportTrip`),
 * if `trip.flightTelemetry?.estimatedArrivalIso` (or `scheduledArrivalIso`) is present,
 * returns `Date.parse(arrivalIso) + airportPickupBufferMinutes * 60_000`.
 * Otherwise falls back to `trip.scheduledPickupTime`.
 */
export function resolveEffectivePickupMs(
  trip?: Partial<Trip> | null,
  config?: Partial<DispatchAutomationConfig> | null
): number | null {
  if (!trip) return null;
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);

  if (isAirportTripRecord(trip)) {
    const arrivalIso =
      trip.flightTelemetry?.estimatedArrivalIso || trip.flightTelemetry?.scheduledArrivalIso;
    if (arrivalIso) {
      const arrivalMs = Date.parse(arrivalIso);
      if (Number.isFinite(arrivalMs)) {
        return arrivalMs + cfg.airportPickupBufferMinutes * 60_000;
      }
    }
  }

  if (trip.scheduledPickupTime) {
    const scheduledMs = Date.parse(trip.scheduledPickupTime);
    if (Number.isFinite(scheduledMs)) {
      return scheduledMs;
    }
  }

  return null;
}

/**
 * Pure deterministic resolver for `DriverAssignDropdown` color-coding.
 */
export function resolveAssignmentDropdownTone(
  trip?: Partial<Trip> | null,
  config?: Partial<DispatchAutomationConfig> | null,
  nowMs: number = Date.now(),
  options?: AssignmentToneOptions
): AssignmentToneResolution {
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const isAirportTrip = isAirportTripRecord(trip);
  const effectivePickupMs = resolveEffectivePickupMs(trip, cfg);
  const minutesUntilPickup =
    effectivePickupMs !== null ? Math.round((effectivePickupMs - nowMs) / 60_000) : null;

  const statusLower = String(trip?.status || '').trim().toLowerCase();
  const isTripAssigned = Boolean(
    options?.isAssigned ||
      (trip?.assignedDriverId && String(trip.assignedDriverId).trim() !== 'unassigned') ||
      ASSIGNED_LIFECYCLE_STATUSES.has(statusLower)
  );

  // 1. Staged (stage_hold / hasStaged) — only when not yet assigned live
  const hasStaged = Boolean(
    !isTripAssigned &&
      (options?.hasStaged ||
        options?.isStageMode ||
        (trip?.plannedDriverId && String(trip.plannedDriverId).trim() !== 'unassigned'))
  );
  if (hasStaged) {
    return {
      tone: 'staged_white',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason: 'Staged hold',
    };
  }

  // 2. Assigned lifecycle (green, or red if scheduled driver is late pre-arrival)
  if (isTripAssigned) {
    if (trip?.bookingType === 'asap') {
      return {
        tone: 'assigned_green',
        effectivePickupMs,
        isAirportTrip,
        minutesUntilPickup,
        reason: 'ASAP trip assigned',
      };
    }

    const isPreArrival = !ARRIVED_OR_BEYOND_STATUSES.has(statusLower);
    if (isPreArrival && effectivePickupMs !== null && nowMs > effectivePickupMs) {
      return {
        tone: 'critical_red',
        effectivePickupMs,
        isAirportTrip,
        minutesUntilPickup,
        reason: 'Assigned driver past effective pickup time',
      };
    }

    return {
      tone: 'assigned_green',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason: 'Driver assigned',
    };
  }

  // 3. Offered (status === 'offered' or active auto-offer cascade)
  if (statusLower === 'offered' || trip?.offerCascade?.state === 'active') {
    return {
      tone: 'offered_purple',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason: 'Active driver offer',
    };
  }

  // 4. Exhausted auto-offer cascade alert
  if (options?.isCascadeExhausted || trip?.offerCascade?.state === 'exhausted') {
    return {
      tone: 'critical_red',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason: 'Auto-offer cascade exhausted',
    };
  }

  // 5. Unassigned ASAP trip: orange during grace window from createdAt, then red
  if (trip?.bookingType === 'asap') {
    const createdMs = trip.createdAt ? Date.parse(trip.createdAt) : NaN;
    if (!Number.isFinite(createdMs)) {
      return {
        tone: 'warning_orange',
        effectivePickupMs,
        isAirportTrip,
        minutesUntilPickup,
        reason: 'ASAP unassigned (grace window)',
      };
    }
    const elapsedMinutes = (nowMs - createdMs) / 60_000;
    if (elapsedMinutes <= cfg.asapUnassignedGraceMinutes) {
      return {
        tone: 'warning_orange',
        effectivePickupMs,
        isAirportTrip,
        minutesUntilPickup,
        reason: `ASAP unassigned within ${cfg.asapUnassignedGraceMinutes}m grace`,
      };
    }
    return {
      tone: 'critical_red',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason: `ASAP unassigned past ${cfg.asapUnassignedGraceMinutes}m grace`,
    };
  }

  // 6. Unassigned Scheduled trip: blue (> warning), orange (<= warning), red (<= critical or overdue)
  if (effectivePickupMs === null) {
    return {
      tone: 'unassigned_blue',
      effectivePickupMs: null,
      isAirportTrip,
      minutesUntilPickup: null,
      reason: 'Unassigned',
    };
  }

  const rawMinutesUntilPickup = (effectivePickupMs - nowMs) / 60_000;
  if (rawMinutesUntilPickup <= cfg.slaCriticalMinutes) {
    return {
      tone: 'critical_red',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason:
        rawMinutesUntilPickup <= 0
          ? 'Unassigned scheduled trip overdue'
          : `Unassigned scheduled trip within ${cfg.slaCriticalMinutes}m critical window`,
    };
  }

  if (rawMinutesUntilPickup <= cfg.slaWarningMinutes) {
    return {
      tone: 'warning_orange',
      effectivePickupMs,
      isAirportTrip,
      minutesUntilPickup,
      reason: `Unassigned scheduled trip within ${cfg.slaWarningMinutes}m warning window`,
    };
  }

  return {
    tone: 'unassigned_blue',
    effectivePickupMs,
    isAirportTrip,
    minutesUntilPickup,
    reason: 'Unassigned scheduled trip outside warning window',
  };
}
