/**
 * Pure Scheduled-Ride SLA Urgency Monitor Service (Phase 35)
 *
 * Evaluates upcoming unassigned scheduled trips (`UNCONFIRMED`, `CONFIRMED`, `pending`, `offered`
 * with `assignedDriverId == null`) and deterministically classifies SLA urgency:
 * - `normal`   : Beyond warning lead window
 * - `warning`  : Within `slaWarningMinutes` (+ `airportExtraLeadMinutes` for STL/SUS/CPS)
 * - `critical` : Within `slaCriticalMinutes` (+ `airportExtraLeadMinutes` for STL/SUS/CPS)
 * - `overdue`  : `scheduledPickupTime <= now` while still unassigned
 *
 * Zero React or browser DOM dependencies per `constitution.md`.
 */

import { detectAirportInAddresses } from '../../config/airports';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
  type DispatchAutomationConfig,
} from '../../types/config';
import type { Trip, TripSlaLevel, TripSlaStatus } from '../../types/trip';

export const UNASSIGNED_SLA_ELIGIBLE_STATUSES = new Set<string>([
  'UNCONFIRMED',
  'unconfirmed',
  'CONFIRMED',
  'confirmed',
  'pending',
  'offered',
]);

const SLA_LEVEL_SORT_WEIGHT: Record<TripSlaLevel, number> = {
  overdue: 0,
  critical: 1,
  warning: 2,
  normal: 3,
};

export interface TripSlaEvaluation {
  tripId: string;
  isEligible: boolean;
  level: TripSlaLevel;
  minutesUntilPickup: number | null;
  isAirportTrip: boolean;
  airportCode: string | null;
  airportExtraLeadMinutes: number;
  effectiveWarningMinutes: number;
  effectiveCriticalMinutes: number;
  scheduledPickupTime?: string;
  badgeLabel: string | null;
}

export interface EvaluatedSlaTripItem {
  trip: Trip;
  sla: TripSlaEvaluation;
}

export interface SlaScanOptions {
  nowMs?: number;
  /** Maximum minutes in the past to still surface an overdue unassigned ride (default 1440 = 24h) */
  maxPastOverdueMinutes?: number;
  /** Optional upper horizon in minutes for future scheduled trips (default Infinity) */
  maxFutureHorizonMinutes?: number;
}

export interface SlaScanSummary {
  evaluatedAt: string;
  overdueCount: number;
  criticalCount: number;
  warningCount: number;
  normalCount: number;
  atRiskCount: number;
  atRiskTrips: EvaluatedSlaTripItem[];
  criticalOrOverdueTrips: EvaluatedSlaTripItem[];
  allEligible: EvaluatedSlaTripItem[];
  byTripId: Record<string, TripSlaEvaluation>;
}

/**
 * Pure deterministic evaluator for a single Trip's scheduled pickup SLA urgency.
 */
export function evaluateTripSlaUrgency(
  trip: Partial<Trip>,
  config?: Partial<DispatchAutomationConfig> | null,
  nowMs: number = Date.now()
): TripSlaEvaluation {
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const tripId = String(trip.id || '');

  const baseIneligible: TripSlaEvaluation = {
    tripId,
    isEligible: false,
    level: 'normal',
    minutesUntilPickup: null,
    isAirportTrip: false,
    airportCode: null,
    airportExtraLeadMinutes: 0,
    effectiveWarningMinutes: cfg.slaWarningMinutes,
    effectiveCriticalMinutes: cfg.slaCriticalMinutes,
    scheduledPickupTime: trip.scheduledPickupTime,
    badgeLabel: null,
  };

  if (!trip || trip.isArchived || trip.isBlacklisted) {
    return baseIneligible;
  }

  if (trip.assignedDriverId) {
    return baseIneligible;
  }

  const status = String(trip.status || '');
  if (!UNASSIGNED_SLA_ELIGIBLE_STATUSES.has(status)) {
    return baseIneligible;
  }

  if (trip.bookingType === 'asap' || !trip.scheduledPickupTime) {
    return baseIneligible;
  }

  const pickupMs = Date.parse(trip.scheduledPickupTime);
  if (!Number.isFinite(pickupMs)) {
    return baseIneligible;
  }

  const airportCheck = detectAirportInAddresses(
    trip.pickupLocation?.address || '',
    trip.dropoffLocation?.address || ''
  );
  const meta = (trip.metadata || {}) as Record<string, unknown>;
  const isAirportTrip = Boolean(airportCheck.isAirportTrip || meta.isAirportTrip);
  const airportCode =
    airportCheck.airport?.iataCode ||
    (typeof meta.pickupAirportCode === 'string' ? meta.pickupAirportCode : null);

  const airportExtraLeadMinutes = isAirportTrip ? cfg.airportExtraLeadMinutes : 0;
  const effectiveWarningMinutes = cfg.slaWarningMinutes + airportExtraLeadMinutes;
  const effectiveCriticalMinutes = cfg.slaCriticalMinutes + airportExtraLeadMinutes;

  const rawMinutes = (pickupMs - nowMs) / 60_000;
  const minutesUntilPickup = Math.round(rawMinutes);

  let level: TripSlaLevel = 'normal';
  if (rawMinutes <= 0) {
    level = 'overdue';
  } else if (rawMinutes <= effectiveCriticalMinutes) {
    level = 'critical';
  } else if (rawMinutes <= effectiveWarningMinutes) {
    level = 'warning';
  }

  let badgeLabel: string | null = null;
  if (level === 'overdue') {
    const overdueMins = Math.abs(minutesUntilPickup);
    badgeLabel = overdueMins === 0 ? 'OVERDUE • NOW' : `OVERDUE • ${overdueMins}m`;
  } else if (level === 'critical') {
    badgeLabel = `CRITICAL • ${Math.max(1, minutesUntilPickup)}m`;
  } else if (level === 'warning') {
    badgeLabel = `Due in ${Math.max(1, minutesUntilPickup)}m`;
  }

  return {
    tripId,
    isEligible: true,
    level,
    minutesUntilPickup,
    isAirportTrip,
    airportCode,
    airportExtraLeadMinutes,
    effectiveWarningMinutes,
    effectiveCriticalMinutes,
    scheduledPickupTime: trip.scheduledPickupTime,
    badgeLabel,
  };
}

/**
 * Pure batch scanner across all Trip records returning SLA counts, lookup map, and sorted at-risk queue.
 */
export function scanUpcomingUnassignedSlaTrips(
  trips: Trip[],
  config?: Partial<DispatchAutomationConfig> | null,
  options?: SlaScanOptions
): SlaScanSummary {
  const nowMs = options?.nowMs ?? Date.now();
  const maxPastOverdueMinutes = options?.maxPastOverdueMinutes ?? 24 * 60;
  const maxFutureHorizonMinutes = options?.maxFutureHorizonMinutes ?? Number.POSITIVE_INFINITY;

  let overdueCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let normalCount = 0;

  const allEligible: EvaluatedSlaTripItem[] = [];
  const byTripId: Record<string, TripSlaEvaluation> = {};

  for (const trip of trips) {
    if (!trip?.id) continue;
    const sla = evaluateTripSlaUrgency(trip, config, nowMs);
    if (!sla.isEligible || sla.minutesUntilPickup === null) {
      continue;
    }

    if (
      sla.minutesUntilPickup < -maxPastOverdueMinutes ||
      sla.minutesUntilPickup > maxFutureHorizonMinutes
    ) {
      continue;
    }

    byTripId[trip.id] = sla;
    allEligible.push({ trip, sla });

    if (sla.level === 'overdue') overdueCount++;
    else if (sla.level === 'critical') criticalCount++;
    else if (sla.level === 'warning') warningCount++;
    else normalCount++;
  }

  allEligible.sort((a, b) => {
    const weightDiff = SLA_LEVEL_SORT_WEIGHT[a.sla.level] - SLA_LEVEL_SORT_WEIGHT[b.sla.level];
    if (weightDiff !== 0) return weightDiff;
    const minA = a.sla.minutesUntilPickup ?? Number.MAX_SAFE_INTEGER;
    const minB = b.sla.minutesUntilPickup ?? Number.MAX_SAFE_INTEGER;
    if (minA !== minB) return minA - minB;
    return a.trip.id.localeCompare(b.trip.id);
  });

  const atRiskTrips = allEligible.filter((item) => item.sla.level !== 'normal');
  const criticalOrOverdueTrips = allEligible.filter(
    (item) => item.sla.level === 'critical' || item.sla.level === 'overdue'
  );

  return {
    evaluatedAt: new Date(nowMs).toISOString(),
    overdueCount,
    criticalCount,
    warningCount,
    normalCount,
    atRiskCount: overdueCount + criticalCount + warningCount,
    atRiskTrips,
    criticalOrOverdueTrips,
    allEligible,
    byTripId,
  };
}

/**
 * Pure helper constructing an idempotent `Trip.slaStatus` sub-object preserving prior notification timestamps.
 */
export function buildTripSlaStatusPatch(
  existing: TripSlaStatus | undefined,
  evaluation: TripSlaEvaluation,
  stamps?: {
    warningNotifiedAt?: string;
    criticalNotifiedAt?: string;
  }
): TripSlaStatus {
  const next: TripSlaStatus = {
    level: evaluation.level,
    ...(typeof evaluation.minutesUntilPickup === 'number'
      ? { minutesUntilPickup: evaluation.minutesUntilPickup }
      : {}),
  };

  const warnTs = existing?.warningNotifiedAt || stamps?.warningNotifiedAt;
  if (warnTs) {
    next.warningNotifiedAt = warnTs;
  }

  const critTs = existing?.criticalNotifiedAt || stamps?.criticalNotifiedAt;
  if (critTs) {
    next.criticalNotifiedAt = critTs;
  }

  return next;
}
