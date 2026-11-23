/**
 * Operational SLA, Auto-Dispatch, Surcharge & Revenue Intelligence Engine (Phase 57)
 *
 * Strictly pure TypeScript module:
 * - Zero React, DOM, Firebase SDK, Node `fs`/`crypto`, or `*.server` imports.
 * - Deterministic & SSR-safe via injectable `nowMs?: number`.
 * - Powers `AdminDashboardTab` (`overview`, `analytics`, `telemetry`) and RFC-4180 CSV exports.
 */

import type {
  AppSettings,
  NamedPricingRule,
  SurchargeCatalogItem,
  SurchargesConfig,
} from '../../types/config';
import type { PricingAuditEvent } from '../../types/pricing-audit';
import type { Trip } from '../../types/trip';
import type { DriverRosterItem } from '../operator.service';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Period Window & Prior-Period Comparison Engine
// ─────────────────────────────────────────────────────────────────────────────

export type AnalyticsPeriodPreset = 'today' | '7d' | '30d' | 'mtd' | 'all' | 'custom';

export type AnalyticsBucketGranularity = 'hour' | 'day' | 'month';

export interface AnalyticsDateWindow {
  preset: AnalyticsPeriodPreset;
  startMs: number | null;
  endMs: number | null;
  prevStartMs: number | null;
  prevEndMs: number | null;
  label: string;
  bucketGranularity: AnalyticsBucketGranularity;
}

export interface PercentDeltaResult {
  deltaPercent: number | null;
  direction: 'up' | 'down' | 'flat';
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const CANCELLED_OR_DECLINED_STATUSES = new Set<string>([
  'cancelled',
  'declined',
  'DECLINED',
]);

const ACTIVE_DISPATCHED_STATUSES = new Set<string>([
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
]);

const OPEN_UNASSIGNED_PRE_CURB_STATUSES = new Set<string>([
  'UNCONFIRMED',
  'unconfirmed',
  'CONFIRMED',
  'confirmed',
  'pending',
  'offered',
]);

function resolveNowMs(nowMs?: number): number {
  return typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function roundOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(1));
}

function formatShortMonthDay(ms: number): string {
  const dt = new Date(ms);
  return `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

function formatDateKeyLocal(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMonthKeyLocal(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseYyyyMmDdLocal(
  raw: string | undefined,
  endOfDay: boolean
): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isCancelledOrDeclinedTrip(trip: Partial<Trip>): boolean {
  return CANCELLED_OR_DECLINED_STATUSES.has(String(trip.status || ''));
}

/**
 * Resolves a trip's canonical operational timestamp in milliseconds:
 * `scheduledPickupTime || actualPickupTime || completedAt || createdAt`
 */
export function resolveTripOperationalTimestampMs(trip: Partial<Trip>): number | null {
  const candidates = [
    trip.scheduledPickupTime,
    trip.actualPickupTime,
    trip.completedAt,
    trip.createdAt,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

export function resolveAnalyticsDateWindow(params: {
  preset: AnalyticsPeriodPreset;
  customStartDate?: string;
  customEndDate?: string;
  nowMs?: number;
}): AnalyticsDateWindow {
  const now = resolveNowMs(params.nowMs);
  const nowDt = new Date(now);
  const y = nowDt.getFullYear();
  const m = nowDt.getMonth();
  const d = nowDt.getDate();

  const todayStartMs = new Date(y, m, d, 0, 0, 0, 0).getTime();
  const todayEndMs = new Date(y, m, d, 23, 59, 59, 999).getTime();

  switch (params.preset) {
    case 'today': {
      const prevStartMs = new Date(y, m, d - 1, 0, 0, 0, 0).getTime();
      const prevEndMs = new Date(y, m, d - 1, 23, 59, 59, 999).getTime();
      return {
        preset: 'today',
        startMs: todayStartMs,
        endMs: todayEndMs,
        prevStartMs,
        prevEndMs,
        label: `Today (${formatShortMonthDay(todayStartMs)})`,
        bucketGranularity: 'hour',
      };
    }

    case '7d': {
      const startMs = new Date(y, m, d - 6, 0, 0, 0, 0).getTime();
      const endMs = todayEndMs;
      const prevStartMs = new Date(y, m, d - 13, 0, 0, 0, 0).getTime();
      const prevEndMs = new Date(y, m, d - 7, 23, 59, 59, 999).getTime();
      return {
        preset: '7d',
        startMs,
        endMs,
        prevStartMs,
        prevEndMs,
        label: `Last 7 Days (${formatShortMonthDay(startMs)} – ${formatShortMonthDay(endMs)})`,
        bucketGranularity: 'day',
      };
    }

    case '30d': {
      const startMs = new Date(y, m, d - 29, 0, 0, 0, 0).getTime();
      const endMs = todayEndMs;
      const prevStartMs = new Date(y, m, d - 59, 0, 0, 0, 0).getTime();
      const prevEndMs = new Date(y, m, d - 30, 23, 59, 59, 999).getTime();
      return {
        preset: '30d',
        startMs,
        endMs,
        prevStartMs,
        prevEndMs,
        label: `Last 30 Days (${formatShortMonthDay(startMs)} – ${formatShortMonthDay(endMs)})`,
        bucketGranularity: 'day',
      };
    }

    case 'mtd': {
      const startMs = new Date(y, m, 1, 0, 0, 0, 0).getTime();
      const endMs = todayEndMs;
      const prevMonthLastDay = new Date(y, m, 0).getDate();
      const clampedPrevDay = Math.min(d, prevMonthLastDay);
      const prevStartMs = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
      const prevEndMs = new Date(y, m - 1, clampedPrevDay, 23, 59, 59, 999).getTime();
      return {
        preset: 'mtd',
        startMs,
        endMs,
        prevStartMs,
        prevEndMs,
        label: `Month-to-Date (${formatShortMonthDay(startMs)} – ${formatShortMonthDay(endMs)})`,
        bucketGranularity: 'day',
      };
    }

    case 'custom': {
      let startMs = parseYyyyMmDdLocal(params.customStartDate, false);
      let endMs = parseYyyyMmDdLocal(params.customEndDate, true);

      if (startMs !== null && endMs !== null && startMs > endMs) {
        const swappedStart = parseYyyyMmDdLocal(params.customEndDate, false);
        const swappedEnd = parseYyyyMmDdLocal(params.customStartDate, true);
        startMs = swappedStart;
        endMs = swappedEnd;
      }

      let prevStartMs: number | null = null;
      let prevEndMs: number | null = null;
      let bucketGranularity: AnalyticsBucketGranularity = 'day';
      let label = 'Custom Range';

      if (startMs !== null && endMs !== null) {
        const spanMs = Math.max(1, endMs - startMs + 1);
        prevEndMs = startMs - 1;
        prevStartMs = prevEndMs - spanMs + 1;
        const spanDays = spanMs / 86_400_000;
        if (spanDays <= 1.05) bucketGranularity = 'hour';
        else if (spanDays > 92) bucketGranularity = 'month';
        else bucketGranularity = 'day';
        label =
          formatDateKeyLocal(startMs) === formatDateKeyLocal(endMs)
            ? `Custom (${formatShortMonthDay(startMs)})`
            : `Custom (${formatShortMonthDay(startMs)} – ${formatShortMonthDay(endMs)})`;
      } else if (startMs !== null) {
        label = `From ${formatShortMonthDay(startMs)}`;
      } else if (endMs !== null) {
        label = `Through ${formatShortMonthDay(endMs)}`;
      } else {
        label = 'Custom Range (All Dates)';
      }

      return {
        preset: 'custom',
        startMs,
        endMs,
        prevStartMs,
        prevEndMs,
        label,
        bucketGranularity,
      };
    }

    case 'all':
    default:
      return {
        preset: 'all',
        startMs: null,
        endMs: null,
        prevStartMs: null,
        prevEndMs: null,
        label: 'All-Time Ledger',
        bucketGranularity: 'month',
      };
  }
}

export function filterTripsByAnalyticsWindow(
  trips: ReadonlyArray<Trip>,
  window: Pick<AnalyticsDateWindow, 'startMs' | 'endMs'>
): Trip[] {
  if (!Array.isArray(trips) || trips.length === 0) return [];
  const { startMs, endMs } = window;
  if (startMs === null && endMs === null) {
    return trips.filter((t) => !t.isArchived);
  }

  return trips.filter((trip) => {
    if (trip.isArchived) return false;
    const ts = resolveTripOperationalTimestampMs(trip);
    if (ts === null) return false;
    if (startMs !== null && ts < startMs) return false;
    if (endMs !== null && ts > endMs) return false;
    return true;
  });
}

export function computePercentDelta(
  current: number,
  previous: number
): PercentDeltaResult {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { deltaPercent: null, direction: 'flat' };
  }
  if (Math.abs(current - previous) < 1e-9) {
    return { deltaPercent: 0, direction: 'flat' };
  }
  if (previous === 0) {
    return {
      deltaPercent: null,
      direction: current > 0 ? 'up' : current < 0 ? 'down' : 'flat',
    };
  }
  const raw = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = roundOneDecimal(raw);
  return {
    deltaPercent: rounded,
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Operational SLA & Cancellation Policy Metrics
// ─────────────────────────────────────────────────────────────────────────────

export interface CancelledByBreakdown {
  passenger: number;
  dispatcher: number;
  driver: number;
  system: number;
}

export interface SlaPerformanceMetrics {
  onTimeGraceMinutes: number;
  evaluatedScheduledCount: number;
  onTimeCount: number;
  lateCount: number;
  /** `null` when `evaluatedScheduledCount === 0` (gracefully distinguished from 100%) */
  onTimeRatePercent: number | null;
  /** Negative = early arrival/pickup, Positive = late past scheduled pickup */
  avgPickupVarianceMinutes: number;
  slaWarningCount: number;
  slaCriticalCount: number;
  slaOverdueCount: number;
  warningAlertsSentCount: number;
  criticalAlertsSentCount: number;
  openUnassignedScheduledAtRiskCount: number;
  totalCancelledOrDeclined: number;
  cancellationRatePercent: number;
  cancelledByBreakdown: CancelledByBreakdown;
  guestTrackCancellationsCount: number;
  previewedCancellationFeesCount: number;
  previewedCancellationFeesTotal: number;
}

/**
 * Resolves `(actualOrArrivedMs - scheduledMs) / 60_000` for a scheduled ride that
 * reached pickup or completion. Returns `null` if not a scheduled ride or not yet reached pickup.
 */
export function resolveScheduledPickupVarianceMinutes(trip: Partial<Trip>): number | null {
  if (!trip || isCancelledOrDeclinedTrip(trip)) return null;
  if (trip.bookingType === 'asap') return null;
  if (!trip.scheduledPickupTime) return null;

  const scheduledMs = Date.parse(trip.scheduledPickupTime);
  if (!Number.isFinite(scheduledMs)) return null;

  let effectiveActualMs: number | null = null;

  if (trip.actualPickupTime) {
    const parsedActual = Date.parse(trip.actualPickupTime);
    if (Number.isFinite(parsedActual)) {
      effectiveActualMs = parsedActual;
    }
  }

  if (effectiveActualMs === null && Array.isArray(trip.statusHistory)) {
    let earliestArrivalOrStartMs = Infinity;
    for (const entry of trip.statusHistory) {
      if (entry && (entry.to === 'arrived' || entry.to === 'in_progress') && entry.timestamp) {
        const ms = Date.parse(entry.timestamp);
        if (Number.isFinite(ms) && ms < earliestArrivalOrStartMs) {
          earliestArrivalOrStartMs = ms;
        }
      }
    }
    if (Number.isFinite(earliestArrivalOrStartMs)) {
      effectiveActualMs = earliestArrivalOrStartMs;
    }
  }

  if (effectiveActualMs === null) {
    let completedMs = trip.completedAt ? Date.parse(trip.completedAt) : NaN;
    if (!Number.isFinite(completedMs) && trip.status === 'completed' && Array.isArray(trip.statusHistory)) {
      for (const entry of trip.statusHistory) {
        if (entry?.to === 'completed' && entry.timestamp) {
          const ms = Date.parse(entry.timestamp);
          if (Number.isFinite(ms)) completedMs = ms;
        }
      }
    }
    if (Number.isFinite(completedMs)) {
      const estDurationMins = Math.max(
        0,
        Number(trip.pricing?.meterDurationMinutes ?? trip.pricing?.durationMinutes ?? 0) || 0
      );
      effectiveActualMs = completedMs - estDurationMins * 60_000;
    }
  }

  if (effectiveActualMs === null) return null;
  return (effectiveActualMs - scheduledMs) / 60_000;
}

export function computeSlaPerformanceMetrics(
  trips: ReadonlyArray<Trip>,
  options?: { onTimeGraceMinutes?: number; nowMs?: number }
): SlaPerformanceMetrics {
  const graceMinutes =
    typeof options?.onTimeGraceMinutes === 'number' && Number.isFinite(options.onTimeGraceMinutes)
      ? Math.max(0, options.onTimeGraceMinutes)
      : 10;
  const nowMs = resolveNowMs(options?.nowMs);

  let evaluatedScheduledCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let sumVarianceMinutes = 0;

  let slaWarningCount = 0;
  let slaCriticalCount = 0;
  let slaOverdueCount = 0;
  let warningAlertsSentCount = 0;
  let criticalAlertsSentCount = 0;
  let openUnassignedScheduledAtRiskCount = 0;

  let totalCancelledOrDeclined = 0;
  const cancelledByBreakdown: CancelledByBreakdown = {
    passenger: 0,
    dispatcher: 0,
    driver: 0,
    system: 0,
  };
  let guestTrackCancellationsCount = 0;
  let previewedCancellationFeesCount = 0;
  let previewedCancellationFeesTotal = 0;

  for (const trip of trips) {
    // 1. SLA status & alert telemetry
    const slaLevel = trip.slaStatus?.level;
    if (slaLevel === 'warning') slaWarningCount += 1;
    else if (slaLevel === 'critical') slaCriticalCount += 1;
    else if (slaLevel === 'overdue') slaOverdueCount += 1;

    if (trip.slaStatus?.warningNotifiedAt) warningAlertsSentCount += 1;
    if (trip.slaStatus?.criticalNotifiedAt) criticalAlertsSentCount += 1;

    const isOpenUnassigned =
      !trip.assignedDriverId && OPEN_UNASSIGNED_PRE_CURB_STATUSES.has(String(trip.status || ''));
    if (isOpenUnassigned && trip.bookingType !== 'asap' && trip.scheduledPickupTime) {
      const schedMs = Date.parse(trip.scheduledPickupTime);
      const minsUntil = Number.isFinite(schedMs) ? (schedMs - nowMs) / 60_000 : Infinity;
      const flaggedAtRisk =
        slaLevel === 'warning' ||
        slaLevel === 'critical' ||
        slaLevel === 'overdue' ||
        minsUntil <= 60;
      if (flaggedAtRisk) {
        openUnassignedScheduledAtRiskCount += 1;
      }
    }

    // 2. Cancellation breakdown & /track fee previews
    if (isCancelledOrDeclinedTrip(trip)) {
      totalCancelledOrDeclined += 1;

      let actor: string | undefined = trip.cancelledBy;
      if (!actor && Array.isArray(trip.auditLog)) {
        for (let i = trip.auditLog.length - 1; i >= 0; i--) {
          const ev = trip.auditLog[i];
          if (ev?.action === 'TRIP_CANCELED' && ev.actorRole) {
            actor = ev.actorRole;
            break;
          }
        }
      }
      if (!actor && Array.isArray(trip.statusHistory)) {
        for (let i = trip.statusHistory.length - 1; i >= 0; i--) {
          const st = trip.statusHistory[i];
          if ((st?.to === 'cancelled' || st?.to === 'declined' || st?.to === 'DECLINED') && st.actorRole) {
            actor = st.actorRole;
            break;
          }
        }
      }

      if (actor === 'passenger') cancelledByBreakdown.passenger += 1;
      else if (actor === 'admin' || actor === 'dispatcher') cancelledByBreakdown.dispatcher += 1;
      else if (actor === 'driver') cancelledByBreakdown.driver += 1;
      else cancelledByBreakdown.system += 1;

      const meta = (trip.metadata || {}) as Record<string, unknown>;
      const rawPolicy = meta.guestCancellationPolicy as
        | { cancellationFeeAmount?: unknown; policyTier?: unknown }
        | undefined;
      const cancelledViaTrackAudit =
        Array.isArray(trip.auditLog) &&
        trip.auditLog.some(
          (ev) =>
            ev?.action === 'TRIP_CANCELED' &&
            ev.actorRole === 'passenger' &&
            typeof ev.context === 'string' &&
            ev.context.includes('/track')
        );

      if (rawPolicy && typeof rawPolicy === 'object') {
        guestTrackCancellationsCount += 1;
        const feeAmt = Number(rawPolicy.cancellationFeeAmount || 0);
        if (Number.isFinite(feeAmt) && feeAmt > 0) {
          previewedCancellationFeesCount += 1;
          previewedCancellationFeesTotal += feeAmt;
        }
      } else if (cancelledViaTrackAudit) {
        guestTrackCancellationsCount += 1;
      }

      continue;
    }

    // 3. On-Time Scheduled Pickup SLA evaluation
    const variance = resolveScheduledPickupVarianceMinutes(trip);
    if (variance !== null) {
      evaluatedScheduledCount += 1;
      sumVarianceMinutes += variance;
      if (variance <= graceMinutes) {
        onTimeCount += 1;
      } else {
        lateCount += 1;
      }
    }
  }

  const onTimeRatePercent =
    evaluatedScheduledCount > 0
      ? roundOneDecimal((onTimeCount / evaluatedScheduledCount) * 100)
      : null;

  const avgPickupVarianceMinutes =
    evaluatedScheduledCount > 0
      ? roundOneDecimal(sumVarianceMinutes / evaluatedScheduledCount)
      : 0;

  const cancellationRatePercent =
    trips.length > 0 ? roundOneDecimal((totalCancelledOrDeclined / trips.length) * 100) : 0;

  return {
    onTimeGraceMinutes: graceMinutes,
    evaluatedScheduledCount,
    onTimeCount,
    lateCount,
    onTimeRatePercent,
    avgPickupVarianceMinutes,
    slaWarningCount,
    slaCriticalCount,
    slaOverdueCount,
    warningAlertsSentCount,
    criticalAlertsSentCount,
    openUnassignedScheduledAtRiskCount,
    totalCancelledOrDeclined,
    cancellationRatePercent,
    cancelledByBreakdown,
    guestTrackCancellationsCount,
    previewedCancellationFeesCount,
    previewedCancellationFeesTotal: roundMoney(previewedCancellationFeesTotal),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Auto-Dispatch, Staged Shift & Wave 4 Workflow Intelligence
// ─────────────────────────────────────────────────────────────────────────────

export type DispatchChannelKey =
  | 'sequential_cascade'
  | 'broadcast_pool'
  | 'direct_auto_assign'
  | 'staged_release'
  | 'manual_assign';

export interface DispatchChannelStat {
  channel: DispatchChannelKey;
  label: string;
  count: number;
  sharePercent: number;
}

export interface DriverUpdateAckStats {
  totalUpdatesSent: number;
  acknowledgedCount: number;
  pendingAckCount: number;
  ackRatePercent: number;
  avgAckLatencySeconds: number | null;
}

export interface GuestSelfServiceStats {
  pendingChangeRequests: number;
  approvedChangeRequests: number;
  declinedChangeRequests: number;
  guestModifiedTripsCount: number;
}

export interface AutoDispatchIntelligenceMetrics {
  totalDispatchedOrOffered: number;
  channelCounts: Record<DispatchChannelKey, number>;
  channelBreakdown: DispatchChannelStat[];
  totalCascadesTriggered: number;
  acceptedCascades: number;
  exhaustedCascades: number;
  cancelledCascades: number;
  activeCascades: number;
  firstAttemptAcceptCount: number;
  firstAttemptAcceptRatePercent: number;
  overallCascadeAcceptRatePercent: number;
  exhaustionRatePercent: number;
  avgAttemptsPerAcceptedCascade: number;
  avgOfferResponseSeconds: number | null;
  currentlyStagedCount: number;
  standingOrderTripsCount: number;
  driverUpdateAckStats: DriverUpdateAckStats;
  guestSelfServiceStats: GuestSelfServiceStats;
}

const DISPATCH_CHANNEL_LABELS: Record<DispatchChannelKey, string> = {
  sequential_cascade: 'Sequential Cascade',
  broadcast_pool: 'Broadcast Pool',
  direct_auto_assign: 'Direct Auto-Assign',
  staged_release: 'Staged Shift Release',
  manual_assign: 'Manual Assign',
};

export function classifyTripDispatchChannel(trip: Partial<Trip>): DispatchChannelKey | null {
  const hasCascade = Boolean(trip.offerCascade);
  const hasDriverOrDispatchedStatus =
    Boolean(trip.assignedDriverId) ||
    trip.status === 'offered' ||
    trip.status === 'assigned' ||
    trip.status === 'accepted' ||
    trip.status === 'en_route' ||
    trip.status === 'arrived' ||
    trip.status === 'in_progress' ||
    trip.status === 'completed';

  if (!hasCascade && !hasDriverOrDispatchedStatus) {
    return null;
  }

  if (trip.offerCascade) {
    if (trip.offerCascade.mode === 'broadcast_pool') return 'broadcast_pool';
    if (trip.offerCascade.mode === 'direct_auto_assign') return 'direct_auto_assign';
    return 'sequential_cascade';
  }

  const hasStagedProvenance =
    Boolean(trip.plannedBy) ||
    Boolean(trip.plannedAt) ||
    (Array.isArray(trip.auditLog) &&
      trip.auditLog.some((ev) => ev?.action === 'DRIVER_STAGED'));

  if (hasStagedProvenance) {
    return 'staged_release';
  }

  return 'manual_assign';
}

function extractOfferResponseDurationsSeconds(trip: Partial<Trip>): number[] {
  const durations: number[] = [];

  if (Array.isArray(trip.auditLog) && trip.auditLog.length > 0) {
    let pendingOfferedMs: number | null = null;
    for (const ev of trip.auditLog) {
      if (!ev || !ev.timestamp) continue;
      const ms = Date.parse(ev.timestamp);
      if (!Number.isFinite(ms)) continue;

      if (ev.action === 'DISPATCH_OFFERED') {
        pendingOfferedMs = ms;
      } else if (
        (ev.action === 'DRIVER_ACCEPTED' || ev.action === 'DRIVER_DECLINED') &&
        pendingOfferedMs !== null &&
        ms >= pendingOfferedMs
      ) {
        durations.push((ms - pendingOfferedMs) / 1000);
        pendingOfferedMs = null;
      }
    }
  }

  if (durations.length === 0 && Array.isArray(trip.statusHistory) && trip.statusHistory.length > 0) {
    let offeredAtMs: number | null = null;
    if (trip.offerCascade?.offerStartedAt) {
      const parsedStart = Date.parse(trip.offerCascade.offerStartedAt);
      if (Number.isFinite(parsedStart)) offeredAtMs = parsedStart;
    }
    for (const st of trip.statusHistory) {
      if (!st?.timestamp) continue;
      const ms = Date.parse(st.timestamp);
      if (!Number.isFinite(ms)) continue;
      if (st.to === 'offered') {
        offeredAtMs = ms;
      } else if (
        offeredAtMs !== null &&
        ms >= offeredAtMs &&
        (st.to === 'accepted' || st.to === 'assigned')
      ) {
        durations.push((ms - offeredAtMs) / 1000);
        offeredAtMs = null;
      }
    }
  }

  return durations;
}

export function computeAutoDispatchIntelligence(
  trips: ReadonlyArray<Trip>
): AutoDispatchIntelligenceMetrics {
  const channelCounts: Record<DispatchChannelKey, number> = {
    sequential_cascade: 0,
    broadcast_pool: 0,
    direct_auto_assign: 0,
    staged_release: 0,
    manual_assign: 0,
  };

  let totalDispatchedOrOffered = 0;
  let totalCascadesTriggered = 0;
  let acceptedCascades = 0;
  let exhaustedCascades = 0;
  let cancelledCascades = 0;
  let activeCascades = 0;
  let firstAttemptAcceptCount = 0;
  let sumAcceptedAttempts = 0;

  const offerResponseDurationsSec: number[] = [];

  let currentlyStagedCount = 0;
  let standingOrderTripsCount = 0;

  let totalUpdatesSent = 0;
  let acknowledgedCount = 0;
  let pendingAckCount = 0;
  const ackLatenciesSec: number[] = [];

  let pendingChangeRequests = 0;
  let approvedChangeRequests = 0;
  let declinedChangeRequests = 0;
  let guestModifiedTripsCount = 0;

  for (const trip of trips) {
    // 1. Dispatch channel classification
    const channel = classifyTripDispatchChannel(trip);
    if (channel) {
      channelCounts[channel] += 1;
      totalDispatchedOrOffered += 1;
    }

    // 2. Offer cascade funnel
    if (trip.offerCascade) {
      totalCascadesTriggered += 1;
      const state = trip.offerCascade.state;
      const attempts = Math.max(1, Number(trip.offerCascade.cascadeAttempt || 1));

      if (state === 'accepted') {
        acceptedCascades += 1;
        sumAcceptedAttempts += attempts;
        if ((trip.offerCascade.cascadeAttempt || 1) <= 1) {
          firstAttemptAcceptCount += 1;
        }
      } else if (state === 'exhausted') {
        exhaustedCascades += 1;
      } else if (state === 'cancelled') {
        cancelledCascades += 1;
      } else if (state === 'active') {
        activeCascades += 1;
      }
    }

    const respSecs = extractOfferResponseDurationsSeconds(trip);
    for (const s of respSecs) {
      offerResponseDurationsSec.push(s);
    }

    // 3. Wave 4 workflow adoption counters
    const statusStr = String(trip.status || '');
    const isTerminalOrInExecution =
      isCancelledOrDeclinedTrip(trip) ||
      statusStr === 'completed' ||
      statusStr === 'en_route' ||
      statusStr === 'arrived' ||
      statusStr === 'in_progress';

    if (!trip.assignedDriverId && Boolean(trip.plannedDriverId) && !isTerminalOrInExecution) {
      currentlyStagedCount += 1;
    }

    const meta = (trip.metadata || {}) as Record<string, unknown>;
    if (typeof meta.standingOrderId === 'string' && meta.standingOrderId.trim().length > 0) {
      standingOrderTripsCount += 1;
    }

    // Driver Update Ack stats (Phase 55)
    const rawAck = meta.pendingDriverUpdateAck as
      | {
          revisionId?: unknown;
          updatedAt?: unknown;
          requiresAck?: unknown;
          acknowledgedAt?: unknown;
        }
      | null
      | undefined;

    if (rawAck && typeof rawAck === 'object' && typeof rawAck.revisionId === 'string' && rawAck.revisionId) {
      totalUpdatesSent += 1;
      const hasAcked =
        typeof rawAck.acknowledgedAt === 'string' && rawAck.acknowledgedAt.trim().length > 0;
      if (hasAcked) {
        acknowledgedCount += 1;
        const updMs = typeof rawAck.updatedAt === 'string' ? Date.parse(rawAck.updatedAt) : NaN;
        const ackMs = Date.parse(rawAck.acknowledgedAt as string);
        if (Number.isFinite(updMs) && Number.isFinite(ackMs) && ackMs >= updMs) {
          ackLatenciesSec.push((ackMs - updMs) / 1000);
        }
      } else if (
        rawAck.requiresAck !== false &&
        !isCancelledOrDeclinedTrip(trip) &&
        statusStr !== 'completed'
      ) {
        pendingAckCount += 1;
      }
    }

    // Guest Self-Service Manage-My-Ride stats (Phase 56)
    const rawGuestReq = meta.pendingGuestChangeRequest as
      | { requestId?: unknown; status?: unknown }
      | null
      | undefined;

    let hasApprovedGuestReq = false;
    if (
      rawGuestReq &&
      typeof rawGuestReq === 'object' &&
      typeof rawGuestReq.requestId === 'string' &&
      rawGuestReq.requestId
    ) {
      if (rawGuestReq.status === 'approved') {
        approvedChangeRequests += 1;
        hasApprovedGuestReq = true;
      } else if (rawGuestReq.status === 'declined') {
        declinedChangeRequests += 1;
      } else if (!isCancelledOrDeclinedTrip(trip) && statusStr !== 'completed') {
        pendingChangeRequests += 1;
      }
    }

    const hasPassengerModifiedAudit =
      Array.isArray(trip.auditLog) &&
      trip.auditLog.some(
        (ev) => ev?.actorRole === 'passenger' && ev.action === 'TRIP_MODIFIED'
      );

    if (hasPassengerModifiedAudit || hasApprovedGuestReq) {
      guestModifiedTripsCount += 1;
    }
  }

  const orderedChannels: DispatchChannelKey[] = [
    'sequential_cascade',
    'broadcast_pool',
    'direct_auto_assign',
    'staged_release',
    'manual_assign',
  ];

  const channelBreakdown: DispatchChannelStat[] = orderedChannels.map((channel) => ({
    channel,
    label: DISPATCH_CHANNEL_LABELS[channel],
    count: channelCounts[channel],
    sharePercent:
      totalDispatchedOrOffered > 0
        ? roundOneDecimal((channelCounts[channel] / totalDispatchedOrOffered) * 100)
        : 0,
  }));

  return {
    totalDispatchedOrOffered,
    channelCounts,
    channelBreakdown,
    totalCascadesTriggered,
    acceptedCascades,
    exhaustedCascades,
    cancelledCascades,
    activeCascades,
    firstAttemptAcceptCount,
    firstAttemptAcceptRatePercent:
      totalCascadesTriggered > 0
        ? roundOneDecimal((firstAttemptAcceptCount / totalCascadesTriggered) * 100)
        : 0,
    overallCascadeAcceptRatePercent:
      totalCascadesTriggered > 0
        ? roundOneDecimal((acceptedCascades / totalCascadesTriggered) * 100)
        : 0,
    exhaustionRatePercent:
      totalCascadesTriggered > 0
        ? roundOneDecimal((exhaustedCascades / totalCascadesTriggered) * 100)
        : 0,
    avgAttemptsPerAcceptedCascade:
      acceptedCascades > 0 ? roundMoney(sumAcceptedAttempts / acceptedCascades) : 0,
    avgOfferResponseSeconds:
      offerResponseDurationsSec.length > 0
        ? roundOneDecimal(
            offerResponseDurationsSec.reduce((a, b) => a + b, 0) /
              offerResponseDurationsSec.length
          )
        : null,
    currentlyStagedCount,
    standingOrderTripsCount,
    driverUpdateAckStats: {
      totalUpdatesSent,
      acknowledgedCount,
      pendingAckCount,
      ackRatePercent:
        totalUpdatesSent > 0 ? roundOneDecimal((acknowledgedCount / totalUpdatesSent) * 100) : 0,
      avgAckLatencySeconds:
        ackLatenciesSec.length > 0
          ? roundOneDecimal(ackLatenciesSec.reduce((a, b) => a + b, 0) / ackLatenciesSec.length)
          : null,
    },
    guestSelfServiceStats: {
      pendingChangeRequests,
      approvedChangeRequests,
      declinedChangeRequests,
      guestModifiedTripsCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Revenue Waterfall, Surcharge/Rule Attribution & Pricing Audit Correlation
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentMethodBucket {
  count: number;
  revenue: number;
  sharePercent: number;
}

export interface PaymentMethodMix {
  card: PaymentMethodBucket;
  cash: PaymentMethodBucket;
  corporate: PaymentMethodBucket;
  settledPayLinks: {
    count: number;
    revenue: number;
  };
}

export interface SurchargeAttributionRow {
  key: string;
  id: string;
  name: string;
  itemType: 'surcharge' | 'rule';
  tripCount: number;
  attributedRevenue: number;
  avgAmountPerTrip: number;
  sharePercent: number;
  currentState: 'enabled' | 'disabled' | 'custom';
  lastAuditAction?: string;
  lastAuditTimestamp?: string;
  lastActor?: string;
  lastAuditNote?: string;
}

export interface CorridorAttributionRow {
  key: string;
  name: string;
  tripCount: number;
  grossRevenue: number;
  avgFare: number;
  sharePercent: number;
}

export interface RevenueAttributionMetrics {
  completedTripsCount: number;
  pipelineTripsCount: number;
  billableTripsCount: number;
  completedRevenue: number;
  scheduledPipelineRevenue: number;
  grossBookedRevenue: number;
  baseAndDistanceRevenue: number;
  surchargesRevenue: number;
  extrasAndWaitRevenue: number;
  tipsTotal: number;
  discountsTotal: number;
  avgFare: number;
  paymentMethodMix: PaymentMethodMix;
  surchargeAttributionRows: SurchargeAttributionRow[];
  corridorAttributionRows: CorridorAttributionRow[];
}

export interface ComputeRevenueAttributionParams {
  trips: ReadonlyArray<Trip>;
  settings?: (Partial<AppSettings> & {
    surcharges?: Partial<SurchargesConfig>;
    pricingRules?: ReadonlyArray<NamedPricingRule>;
  }) | null;
  surchargesConfig?: Partial<SurchargesConfig> | null;
  pricingRules?: ReadonlyArray<NamedPricingRule> | null;
  pricingAuditEvents?: ReadonlyArray<PricingAuditEvent> | null;
}

function normalizeMatchSlug(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function resolveAuditEventMs(ev: Pick<PricingAuditEvent, 'timestamp' | 'timestampMs'>): number {
  if (typeof ev.timestampMs === 'number' && Number.isFinite(ev.timestampMs)) {
    return ev.timestampMs;
  }
  const parsed = Date.parse(ev.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyTripCorridorName(trip: Partial<Trip>): string {
  const explicitCorridor = trip.pricing?.matchedCorridorName?.trim();
  if (explicitCorridor) return explicitCorridor;

  const combinedRouteText = [
    trip.pickupLocation?.address || '',
    trip.dropoffLocation?.address || '',
    trip.flightNotes || '',
  ].join(' ');

  if (/\b(spirit of st\.?\s*louis|spirit airport|\bsus\b|edison ave)\b/i.test(combinedRouteText)) {
    return 'Spirit of St. Louis (SUS)';
  }
  if (
    /\b(lambert|\bstl\b|st\.?\s*louis international|airport)\b/i.test(combinedRouteText)
  ) {
    return 'STL Lambert Airport';
  }

  const tariffName = trip.pricing?.tariffProfileName?.trim();
  if (tariffName) return tariffName;

  return 'Chesterfield & West County Local';
}

export function computeRevenueAttributionMetrics(
  params: ComputeRevenueAttributionParams
): RevenueAttributionMetrics {
  const { trips } = params;
  const effectiveSurcharges = params.surchargesConfig ?? params.settings?.surcharges ?? null;
  const effectiveRules = params.pricingRules ?? params.settings?.pricingRules ?? null;
  const auditEvents = Array.isArray(params.pricingAuditEvents) ? params.pricingAuditEvents : [];

  // Build catalog & audit lookup maps
  const catalogById = new Map<
    string,
    { id: string; name: string; itemType: 'surcharge' | 'rule'; enabled: boolean }
  >();
  const catalogBySlug = new Map<
    string,
    { id: string; name: string; itemType: 'surcharge' | 'rule'; enabled: boolean }
  >();

  const registerConfigEntry = (entry: {
    id: string;
    name: string;
    itemType: 'surcharge' | 'rule';
    enabled: boolean;
  }) => {
    if (!entry.id && !entry.name) return;
    const id = entry.id || normalizeMatchSlug(entry.name);
    const normalized = { ...entry, id };
    catalogById.set(id.toLowerCase(), normalized);
    const slug = normalizeMatchSlug(entry.name);
    if (slug) catalogBySlug.set(slug, normalized);
  };

  if (effectiveSurcharges) {
    const items: SurchargeCatalogItem[] = Array.isArray(effectiveSurcharges.items)
      ? effectiveSurcharges.items
      : [];
    for (const item of items) {
      registerConfigEntry({
        id: item.id,
        name: item.name,
        itemType: 'surcharge',
        enabled: Boolean(item.enabled),
      });
    }
    if (Array.isArray(effectiveSurcharges.customSurcharges)) {
      for (const cs of effectiveSurcharges.customSurcharges) {
        registerConfigEntry({
          id: cs.id,
          name: cs.name,
          itemType: 'surcharge',
          enabled: Boolean(cs.isActive),
        });
      }
    }
  }

  if (Array.isArray(effectiveRules)) {
    for (const rule of effectiveRules) {
      registerConfigEntry({
        id: rule.id,
        name: rule.name,
        itemType: 'rule',
        enabled: Boolean(rule.isActive),
      });
    }
  }

  // Sort audit events newest first
  const sortedAudit = [...auditEvents]
    .filter((ev) => ev && (ev.pillar === 'surcharges' || ev.pillar === 'rules'))
    .sort((a, b) => resolveAuditEventMs(b) - resolveAuditEventMs(a));

  const latestAuditById = new Map<string, PricingAuditEvent>();
  const latestAuditBySlug = new Map<string, PricingAuditEvent>();
  const latestToggleAuditById = new Map<string, PricingAuditEvent>();
  const latestToggleAuditBySlug = new Map<string, PricingAuditEvent>();

  for (const ev of sortedAudit) {
    if (ev.targetId === 'surcharges_catalog') continue;
    const idKey = String(ev.targetId || '').trim().toLowerCase();
    const slugKey = normalizeMatchSlug(ev.targetName);
    const isToggle =
      ev.action === 'surcharge_enabled' ||
      ev.action === 'surcharge_disabled' ||
      ev.action === 'rule_enabled' ||
      ev.action === 'rule_disabled';

    if (idKey && !latestAuditById.has(idKey)) latestAuditById.set(idKey, ev);
    if (slugKey && !latestAuditBySlug.has(slugKey)) latestAuditBySlug.set(slugKey, ev);
    if (isToggle) {
      if (idKey && !latestToggleAuditById.has(idKey)) latestToggleAuditById.set(idKey, ev);
      if (slugKey && !latestToggleAuditBySlug.has(slugKey)) latestToggleAuditBySlug.set(slugKey, ev);
    }
  }

  let completedTripsCount = 0;
  let pipelineTripsCount = 0;
  let completedRevenue = 0;
  let scheduledPipelineRevenue = 0;

  let baseAndDistanceRevenue = 0;
  let surchargesRevenue = 0;
  let extrasAndWaitRevenue = 0;
  let tipsTotal = 0;
  let discountsTotal = 0;

  const paymentCounts = { card: 0, cash: 0, corporate: 0 };
  const paymentRev = { card: 0, cash: 0, corporate: 0 };
  let settledPayLinksCount = 0;
  let settledPayLinksRevenue = 0;

  const surchargeAgg = new Map<
    string,
    {
      id: string;
      name: string;
      itemType: 'surcharge' | 'rule';
      tripCount: number;
      attributedRevenue: number;
    }
  >();

  const resolveCanonicalSurchargeMeta = (
    rawId: string | undefined,
    rawLabel: string,
    defaultType: 'surcharge' | 'rule'
  ): { key: string; id: string; name: string; itemType: 'surcharge' | 'rule' } => {
    const idClean = String(rawId || '').trim();
    const idLower = idClean.toLowerCase();
    const slug = normalizeMatchSlug(rawLabel);

    const matchedCfg =
      (idLower ? catalogById.get(idLower) : undefined) ||
      (slug ? catalogBySlug.get(slug) : undefined);

    if (matchedCfg) {
      return {
        key: matchedCfg.id.toLowerCase(),
        id: matchedCfg.id,
        name: matchedCfg.name,
        itemType: matchedCfg.itemType,
      };
    }

    const matchedAudit =
      (idLower ? latestAuditById.get(idLower) : undefined) ||
      (slug ? latestAuditBySlug.get(slug) : undefined);

    if (matchedAudit) {
      const aType: 'surcharge' | 'rule' = matchedAudit.pillar === 'rules' ? 'rule' : 'surcharge';
      return {
        key: matchedAudit.targetId.toLowerCase(),
        id: matchedAudit.targetId,
        name: matchedAudit.targetName || rawLabel,
        itemType: aType,
      };
    }

    const fallbackId = idClean || slug || 'custom-surcharge';
    return {
      key: fallbackId.toLowerCase(),
      id: fallbackId,
      name: rawLabel.trim() || fallbackId,
      itemType: defaultType,
    };
  };

  const corridorAgg = new Map<string, { name: string; tripCount: number; grossRevenue: number }>();

  for (const trip of trips) {
    if (trip.isArchived || isCancelledOrDeclinedTrip(trip)) continue;

    const totalFare = Math.max(0, Number(trip.pricing?.totalFare ?? trip.payment?.amount ?? 0) || 0);
    const tipAmt = Math.max(0, Number(trip.payment?.tipAmount || 0) || 0);

    if (trip.status === 'completed') {
      completedTripsCount += 1;
      completedRevenue += totalFare;
    } else {
      pipelineTripsCount += 1;
      scheduledPipelineRevenue += totalFare;
    }

    tipsTotal += tipAmt;

    // Payment method mix
    const method = trip.payment?.method;
    if (method === 'cash') {
      paymentCounts.cash += 1;
      paymentRev.cash += totalFare;
    } else if (method === 'corporate' || method === 'account') {
      paymentCounts.corporate += 1;
      paymentRev.corporate += totalFare;
    } else {
      paymentCounts.card += 1;
      paymentRev.card += totalFare;
    }

    if (trip.payment?.payLinkStatus === 'paid') {
      settledPayLinksCount += 1;
      const settledAmt = Math.max(totalFare, Number(trip.payment?.amount || 0) || 0);
      settledPayLinksRevenue += settledAmt;
    }

    // Waterfall + Itemized Surcharge / Rule Attribution (zero double-counting)
    const seenSurchargeKeysInTrip = new Set<string>();
    const addSurchargeAttribution = (
      rawId: string | undefined,
      rawLabel: string,
      amount: number,
      defaultType: 'surcharge' | 'rule'
    ) => {
      const resolved = resolveCanonicalSurchargeMeta(rawId, rawLabel, defaultType);
      let row = surchargeAgg.get(resolved.key);
      if (!row) {
        row = {
          id: resolved.id,
          name: resolved.name,
          itemType: resolved.itemType,
          tripCount: 0,
          attributedRevenue: 0,
        };
        surchargeAgg.set(resolved.key, row);
      }
      if (!seenSurchargeKeysInTrip.has(resolved.key)) {
        seenSurchargeKeysInTrip.add(resolved.key);
        row.tripCount += 1;
      }
      if (Number.isFinite(amount) && amount > 0) {
        row.attributedRevenue += amount;
      }
    };

    const breakdown = trip.pricing?.breakdown;
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      const breakdownItemIds = new Set<string>();
      for (const item of breakdown) {
        if (!item) continue;
        if (item.id) breakdownItemIds.add(item.id);
        if (item.sourceId) breakdownItemIds.add(item.sourceId);

        const amt = Number(item.amount) || 0;
        if (amt < 0 || item.category === 'discount' || item.sourceType === 'discount') {
          discountsTotal += Math.abs(amt);
        } else if (
          item.category === 'surcharge' ||
          item.sourceType === 'surcharge' ||
          item.sourceType === 'rule'
        ) {
          surchargesRevenue += amt;
          addSurchargeAttribution(
            item.sourceId || item.id,
            item.label,
            amt,
            item.sourceType === 'rule' ? 'rule' : 'surcharge'
          );
        } else if (item.category === 'extra' || item.sourceType === 'extra') {
          extrasAndWaitRevenue += amt;
        } else {
          baseAndDistanceRevenue += amt;
        }
      }

      // Include any post-quote driver meter extras not yet mirrored into `breakdown`
      if (Array.isArray(trip.pricing?.driverExtras)) {
        for (const dex of trip.pricing.driverExtras) {
          if (
            dex &&
            Number(dex.amount) > 0 &&
            !breakdownItemIds.has(dex.id) &&
            !breakdownItemIds.has(`driver-extra-${dex.id}`)
          ) {
            extrasAndWaitRevenue += Number(dex.amount);
          }
        }
      }
    } else {
      // Legacy fallback when `pricing.breakdown` is absent
      let tripSurchargeSum = 0;
      const itemized = trip.pricing?.itemizedSurcharges;
      let hasAirportItemized = false;

      if (Array.isArray(itemized) && itemized.length > 0) {
        for (const sur of itemized) {
          const amt = Math.max(0, Number(sur?.amount || 0) || 0);
          if (amt > 0 && sur?.name) {
            tripSurchargeSum += amt;
            if (/airport/i.test(sur.name)) hasAirportItemized = true;
            addSurchargeAttribution(undefined, sur.name, amt, 'surcharge');
          }
        }
      }

      const airportFee = Math.max(0, Number(trip.pricing?.airportSurcharge || 0) || 0);
      if (airportFee > 0 && !hasAirportItemized) {
        tripSurchargeSum += airportFee;
        addSurchargeAttribution(
          'surcharge-airport-access',
          'Airport Commercial Access Fee',
          airportFee,
          'surcharge'
        );
      }

      if (Array.isArray(trip.pricing?.appliedRuleNames)) {
        for (const rName of trip.pricing.appliedRuleNames) {
          if (typeof rName === 'string' && rName.trim()) {
            addSurchargeAttribution(undefined, rName.trim(), 0, 'rule');
          }
        }
      }

      const driverExtrasAmt =
        typeof trip.pricing?.driverExtrasTotal === 'number' && trip.pricing.driverExtrasTotal > 0
          ? trip.pricing.driverExtrasTotal
          : Array.isArray(trip.pricing?.driverExtras)
          ? trip.pricing.driverExtras.reduce((acc, e) => acc + Math.max(0, Number(e?.amount || 0)), 0)
          : Array.isArray(trip.meterExtras)
          ? trip.meterExtras.reduce((acc, e) => acc + Math.max(0, Number(e?.amount || 0)), 0)
          : 0;

      const delayOrWait =
        Math.max(0, Number(trip.pricing?.delayFee || 0)) ||
        Math.max(0, Number(trip.payment?.waitTimeAmount || 0));

      const tolls =
        Math.max(0, Number(trip.pricing?.tollsFee || 0)) ||
        Math.max(0, Number(trip.payment?.tollsAmount || 0));

      const tripExtrasSum =
        Math.max(0, Number(trip.pricing?.multiStopSurcharge || 0)) +
        tolls +
        Math.max(0, Number(trip.pricing?.carSeatFee || 0)) +
        Math.max(0, Number(trip.pricing?.passengerSurcharge || 0)) +
        Math.max(0, Number(trip.pricing?.oversizedLuggageFee || 0)) +
        Math.max(0, Number(trip.pricing?.customExtrasFee || 0)) +
        delayOrWait +
        driverExtrasAmt;

      const tripDiscount = Math.abs(Number(trip.pricing?.discountAmount || 0) || 0);
      const residualBase = Math.max(0, totalFare + tripDiscount - tripSurchargeSum - tripExtrasSum);

      surchargesRevenue += tripSurchargeSum;
      extrasAndWaitRevenue += tripExtrasSum;
      discountsTotal += tripDiscount;
      baseAndDistanceRevenue += residualBase;
    }

    // Corridor & Tariff Attribution
    const corridorName = classifyTripCorridorName(trip);
    const corridorKey = normalizeMatchSlug(corridorName) || 'local';
    let cRow = corridorAgg.get(corridorKey);
    if (!cRow) {
      cRow = { name: corridorName, tripCount: 0, grossRevenue: 0 };
      corridorAgg.set(corridorKey, cRow);
    }
    cRow.tripCount += 1;
    cRow.grossRevenue += totalFare;
  }

  // Also ensure active catalog surcharges and any surcharge/rule with recent audit events
  // in `pricingAuditEvents` are surfaced so operators see live state alongside trip revenue
  if (effectiveSurcharges && Array.isArray(effectiveSurcharges.items)) {
    for (const item of effectiveSurcharges.items) {
      if (!item?.id || !item.enabled) continue;
      const idKey = item.id.toLowerCase();
      if (!surchargeAgg.has(idKey)) {
        const slug = normalizeMatchSlug(item.name);
        const existingBySlug = slug
          ? Array.from(surchargeAgg.values()).find((r) => normalizeMatchSlug(r.name) === slug)
          : undefined;
        if (!existingBySlug) {
          surchargeAgg.set(idKey, {
            id: item.id,
            name: item.name,
            itemType: 'surcharge',
            tripCount: 0,
            attributedRevenue: 0,
          });
        }
      }
    }
  }

  for (const [idKey, ev] of latestAuditById.entries()) {
    if (!surchargeAgg.has(idKey)) {
      const slug = normalizeMatchSlug(ev.targetName);
      const existingBySlug = slug
        ? Array.from(surchargeAgg.values()).find((r) => normalizeMatchSlug(r.name) === slug)
        : undefined;
      if (!existingBySlug) {
        const cfgMatch = catalogById.get(idKey) || (slug ? catalogBySlug.get(slug) : undefined);
        surchargeAgg.set(idKey, {
          id: cfgMatch?.id || ev.targetId,
          name: cfgMatch?.name || ev.targetName,
          itemType: cfgMatch?.itemType || (ev.pillar === 'rules' ? 'rule' : 'surcharge'),
          tripCount: 0,
          attributedRevenue: 0,
        });
      }
    }
  }

  const grossBookedRevenue = roundMoney(completedRevenue + scheduledPipelineRevenue);
  const billableTripsCount = completedTripsCount + pipelineTripsCount;
  const avgFare = billableTripsCount > 0 ? roundMoney(grossBookedRevenue / billableTripsCount) : 0;

  const totalAttributedSurcharges = Array.from(surchargeAgg.values()).reduce(
    (sum, r) => sum + r.attributedRevenue,
    0
  );

  const surchargeAttributionRows: SurchargeAttributionRow[] = Array.from(
    surchargeAgg.entries()
  )
    .map(([key, row]) => {
      const idLower = row.id.toLowerCase();
      const slug = normalizeMatchSlug(row.name);
      const cfg = catalogById.get(idLower) || (slug ? catalogBySlug.get(slug) : undefined);
      const latestEv =
        latestToggleAuditById.get(idLower) ||
        latestAuditById.get(idLower) ||
        (slug ? latestToggleAuditBySlug.get(slug) || latestAuditBySlug.get(slug) : undefined);

      let currentState: 'enabled' | 'disabled' | 'custom' = 'custom';
      if (cfg) {
        currentState = cfg.enabled ? 'enabled' : 'disabled';
      } else if (latestEv) {
        if (latestEv.action === 'surcharge_enabled' || latestEv.action === 'rule_enabled') {
          currentState = 'enabled';
        } else if (
          latestEv.action === 'surcharge_disabled' ||
          latestEv.action === 'rule_disabled' ||
          latestEv.action === 'surcharge_deleted' ||
          latestEv.action === 'rule_deleted'
        ) {
          currentState = 'disabled';
        } else if (
          latestEv.action === 'surcharge_created' ||
          latestEv.action === 'rule_created'
        ) {
          const createdDisabled = latestEv.diffs?.some(
            (d) => (d.field === 'enabled' || d.field === 'isActive') && d.after === false
          );
          currentState = createdDisabled ? 'disabled' : 'enabled';
        }
      }

      const rev = roundMoney(row.attributedRevenue);
      return {
        key,
        id: row.id,
        name: row.name,
        itemType: row.itemType,
        tripCount: row.tripCount,
        attributedRevenue: rev,
        avgAmountPerTrip: row.tripCount > 0 ? roundMoney(rev / row.tripCount) : 0,
        sharePercent:
          totalAttributedSurcharges > 0
            ? roundOneDecimal((row.attributedRevenue / totalAttributedSurcharges) * 100)
            : 0,
        currentState,
        ...(latestEv
          ? {
              lastAuditAction: latestEv.action,
              lastAuditTimestamp: latestEv.timestamp,
              lastActor:
                latestEv.operatorName || latestEv.operatorEmail || latestEv.operatorId,
              ...(latestEv.note ? { lastAuditNote: latestEv.note } : {}),
            }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        b.attributedRevenue - a.attributedRevenue ||
        b.tripCount - a.tripCount ||
        a.name.localeCompare(b.name)
    );

  const corridorAttributionRows: CorridorAttributionRow[] = Array.from(corridorAgg.entries())
    .map(([key, row]) => {
      const rev = roundMoney(row.grossRevenue);
      return {
        key,
        name: row.name,
        tripCount: row.tripCount,
        grossRevenue: rev,
        avgFare: row.tripCount > 0 ? roundMoney(rev / row.tripCount) : 0,
        sharePercent:
          grossBookedRevenue > 0 ? roundOneDecimal((rev / grossBookedRevenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue || b.tripCount - a.tripCount);

  return {
    completedTripsCount,
    pipelineTripsCount,
    billableTripsCount,
    completedRevenue: roundMoney(completedRevenue),
    scheduledPipelineRevenue: roundMoney(scheduledPipelineRevenue),
    grossBookedRevenue,
    baseAndDistanceRevenue: roundMoney(baseAndDistanceRevenue),
    surchargesRevenue: roundMoney(surchargesRevenue),
    extrasAndWaitRevenue: roundMoney(extrasAndWaitRevenue),
    tipsTotal: roundMoney(tipsTotal),
    discountsTotal: roundMoney(discountsTotal),
    avgFare,
    paymentMethodMix: {
      card: {
        count: paymentCounts.card,
        revenue: roundMoney(paymentRev.card),
        sharePercent:
          grossBookedRevenue > 0
            ? roundOneDecimal((paymentRev.card / grossBookedRevenue) * 100)
            : 0,
      },
      cash: {
        count: paymentCounts.cash,
        revenue: roundMoney(paymentRev.cash),
        sharePercent:
          grossBookedRevenue > 0
            ? roundOneDecimal((paymentRev.cash / grossBookedRevenue) * 100)
            : 0,
      },
      corporate: {
        count: paymentCounts.corporate,
        revenue: roundMoney(paymentRev.corporate),
        sharePercent:
          grossBookedRevenue > 0
            ? roundOneDecimal((paymentRev.corporate / grossBookedRevenue) * 100)
            : 0,
      },
      settledPayLinks: {
        count: settledPayLinksCount,
        revenue: roundMoney(settledPayLinksRevenue),
      },
    },
    surchargeAttributionRows,
    corridorAttributionRows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Chronological Time-Series & Leaderboards
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeSeriesBucket {
  key: string;
  label: string;
  revenue: number;
  completedRevenue: number;
  trips: number;
  onTimeCount: number;
  scheduledEvaluatedCount: number;
}

export interface HourlyDemandWindowRow {
  key: 'early_airport' | 'morning_commute' | 'midday' | 'evening_rush' | 'late_night';
  label: string;
  timeRange: string;
  tripCount: number;
  sharePercent: number;
  grossRevenue: number;
  avgFare: number;
}

export interface CorporateLeaderboardRow {
  accountKey: string;
  accountName: string;
  tripCount: number;
  grossRevenue: number;
  avgFare: number;
  pendingInvoiceCount: number;
}

export interface DriverLeaderboardRow {
  driverId: string;
  driverName: string;
  cabNumber: string;
  completedTrips: number;
  activeTrips: number;
  grossFare: number;
  tipsEarned: number;
  declinedOffersCount: number;
  onTimeRatePercent: number | null;
}

export interface ZoneOriginationRow {
  zoneKey: string;
  zoneLabel: string;
  tripCount: number;
  grossRevenue: number;
  sharePercent: number;
}

export interface VehicleClassDemandRow {
  tierKey: 'standard' | 'executive' | 'xl' | 'wav';
  label: string;
  tripCount: number;
  sharePercent: number;
  grossRevenue: number;
}

export interface TimeSeriesAndLeaderboardsResult {
  timeSeries: TimeSeriesBucket[];
  hourlyDemand: HourlyDemandWindowRow[];
  corporateLeaderboard: CorporateLeaderboardRow[];
  driverLeaderboard: DriverLeaderboardRow[];
  zoneBreakdown: ZoneOriginationRow[];
  vehicleClassBreakdown: VehicleClassDemandRow[];
}

function formatHourLabel(hour24: number): string {
  if (hour24 === 0) return '12a';
  if (hour24 < 12) return `${hour24}a`;
  if (hour24 === 12) return '12p';
  return `${hour24 - 12}p`;
}

function formatMonthLabelFromKey(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split('-');
  const mIdx = Number(mStr) - 1;
  const mon = SHORT_MONTHS[mIdx] || mStr;
  return `${mon} ${yStr}`;
}

function extractPickupZoneLabel(address: string | undefined): string {
  const raw = String(address || '').trim();
  if (!raw) return 'Unspecified Pickup';

  if (/\b(spirit of st\.?\s*louis|spirit airport|\bsus\b|edison ave)\b/i.test(raw)) {
    return 'Spirit Airport (SUS)';
  }
  if (/\b(lambert|\bstl\b|st\.?\s*louis international|terminal [12])\b/i.test(raw)) {
    return 'STL Lambert Airport';
  }

  const knownCities = [
    'Chesterfield',
    'Clayton',
    'Creve Coeur',
    'Town and Country',
    'Wildwood',
    'Ballwin',
    'Maryland Heights',
    'Ladue',
    'Frontenac',
    'Des Peres',
    'Kirkwood',
    'St. Charles',
    'O\'Fallon',
    'Wentzville',
    'University City',
    'Brentwood',
  ];
  for (const city of knownCities) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(raw)) {
      return city;
    }
  }

  // Parse city segment before `, MO` or `, IL`
  const stateMatch = /,\s*([A-Za-z .'-]{2,28}),\s*(?:MO|IL)\b/i.exec(raw);
  if (stateMatch?.[1]) {
    const candidate = stateMatch[1].trim();
    if (/^st\.?\s*louis$/i.test(candidate)) return 'St. Louis Metro';
    return candidate;
  }

  if (/\bst\.?\s*louis\b/i.test(raw)) return 'St. Louis Metro';
  return 'West County Local';
}

export function computeTimeSeriesAndLeaderboards(params: {
  trips: ReadonlyArray<Trip>;
  window: AnalyticsDateWindow;
  drivers?: ReadonlyArray<DriverRosterItem>;
  settings?: Partial<AppSettings> | null;
  onTimeGraceMinutes?: number;
  nowMs?: number;
}): TimeSeriesAndLeaderboardsResult {
  const { trips, window, drivers = [], settings } = params;
  const graceMinutes =
    typeof params.onTimeGraceMinutes === 'number' && Number.isFinite(params.onTimeGraceMinutes)
      ? Math.max(0, params.onTimeGraceMinutes)
      : 10;
  const nowMs = resolveNowMs(params.nowMs);

  // 1. Pre-seed chronological buckets
  const bucketMap = new Map<string, TimeSeriesBucket>();
  const granularity = window.bucketGranularity;

  const ensureBucket = (key: string, label: string): TimeSeriesBucket => {
    let b = bucketMap.get(key);
    if (!b) {
      b = {
        key,
        label,
        revenue: 0,
        completedRevenue: 0,
        trips: 0,
        onTimeCount: 0,
        scheduledEvaluatedCount: 0,
      };
      bucketMap.set(key, b);
    }
    return b;
  };

  if (granularity === 'hour') {
    const baseMs = window.startMs ?? nowMs;
    const datePrefix = formatDateKeyLocal(baseMs);
    for (let h = 0; h < 24; h++) {
      const hKey = `${datePrefix}T${String(h).padStart(2, '0')}`;
      ensureBucket(hKey, formatHourLabel(h));
    }
  } else if (granularity === 'day' && window.startMs !== null && window.endMs !== null) {
    const startDt = new Date(window.startMs);
    const cursor = new Date(
      startDt.getFullYear(),
      startDt.getMonth(),
      startDt.getDate(),
      0,
      0,
      0,
      0
    );
    const endLimit = window.endMs;
    let safety = 0;
    while (cursor.getTime() <= endLimit && safety < 400) {
      const ms = cursor.getTime();
      ensureBucket(formatDateKeyLocal(ms), formatShortMonthDay(ms));
      cursor.setDate(cursor.getDate() + 1);
      safety += 1;
    }
  } else if (granularity === 'month' && trips.length === 0) {
    // Seed trailing 6 months when empty so All-Time chart still renders a clean baseline
    const nowDt = new Date(nowMs);
    for (let offset = 5; offset >= 0; offset--) {
      const dt = new Date(nowDt.getFullYear(), nowDt.getMonth() - offset, 1);
      const mKey = formatMonthKeyLocal(dt.getTime());
      ensureBucket(mKey, formatMonthLabelFromKey(mKey));
    }
  }

  // 2. Peak Demand 5-block setup
  const demandDefs: Array<{
    key: HourlyDemandWindowRow['key'];
    label: string;
    timeRange: string;
  }> = [
    { key: 'early_airport', label: 'Early Airport', timeRange: '04:00–07:59' },
    { key: 'morning_commute', label: 'Morning Commute', timeRange: '08:00–11:59' },
    { key: 'midday', label: 'Midday', timeRange: '12:00–15:59' },
    { key: 'evening_rush', label: 'Evening Rush', timeRange: '16:00–19:59' },
    { key: 'late_night', label: 'Late Night', timeRange: '20:00–03:59' },
  ];

  const demandAgg = new Map<
    HourlyDemandWindowRow['key'],
    { tripCount: number; grossRevenue: number }
  >(demandDefs.map((d) => [d.key, { tripCount: 0, grossRevenue: 0 }]));

  // 3. Corporate account lookup
  const corpNameById = new Map<string, string>();
  if (Array.isArray(settings?.corporateAccounts)) {
    for (const acc of settings.corporateAccounts) {
      if (acc?.id && acc.companyName) {
        corpNameById.set(acc.id.toLowerCase(), acc.companyName);
      }
      if (acc?.accountNumber && acc.companyName) {
        corpNameById.set(acc.accountNumber.toLowerCase(), acc.companyName);
      }
    }
  }

  const corpAgg = new Map<
    string,
    { accountName: string; tripCount: number; grossRevenue: number; pendingInvoiceCount: number }
  >();

  // 4. Driver leaderboard setup
  const driverMetaMap = new Map<string, { driverName: string; cabNumber: string }>();
  for (const drv of drivers) {
    if (!drv?.id) continue;
    const cleanCab = String(drv.cabNumber || '')
      .trim()
      .replace(/^#/, '');
    driverMetaMap.set(drv.id, {
      driverName: drv.name || `${drv.firstName || ''} ${drv.lastName || ''}`.trim() || drv.id,
      cabNumber: cleanCab,
    });
  }

  const driverAgg = new Map<
    string,
    {
      driverId: string;
      driverName: string;
      cabNumber: string;
      completedTrips: number;
      activeTrips: number;
      grossFare: number;
      tipsEarned: number;
      declinedOffersCount: number;
      scheduledEvalCount: number;
      scheduledOnTimeCount: number;
    }
  >();

  const ensureDriverRow = (driverId: string, fallbackName?: string, fallbackCab?: string) => {
    let row = driverAgg.get(driverId);
    if (!row) {
      const rosterMeta = driverMetaMap.get(driverId);
      row = {
        driverId,
        driverName: rosterMeta?.driverName || fallbackName || driverId,
        cabNumber:
          rosterMeta?.cabNumber ||
          String(fallbackCab || '')
            .trim()
            .replace(/^#/, ''),
        completedTrips: 0,
        activeTrips: 0,
        grossFare: 0,
        tipsEarned: 0,
        declinedOffersCount: 0,
        scheduledEvalCount: 0,
        scheduledOnTimeCount: 0,
      };
      driverAgg.set(driverId, row);
    }
    return row;
  };

  // Zone & Vehicle class aggregators
  const zoneAgg = new Map<string, { zoneLabel: string; tripCount: number; grossRevenue: number }>();
  const tierAgg: Record<VehicleClassDemandRow['tierKey'], { count: number; revenue: number }> = {
    standard: { count: 0, revenue: 0 },
    executive: { count: 0, revenue: 0 },
    xl: { count: 0, revenue: 0 },
    wav: { count: 0, revenue: 0 },
  };

  let billablePeriodTripsCount = 0;

  for (const trip of trips) {
    if (trip.isArchived) continue;

    // Track declined offers across all trips in the window (including cancelled/re-offered)
    const declinedSetForTrip = new Set<string>();
    if (Array.isArray(trip.rejectedByIds)) {
      for (const rejId of trip.rejectedByIds) {
        if (typeof rejId === 'string' && rejId.trim()) {
          declinedSetForTrip.add(rejId.trim());
        }
      }
    }
    if (Array.isArray(trip.auditLog)) {
      for (const ev of trip.auditLog) {
        if (ev?.action === 'DRIVER_DECLINED' && typeof ev.actorId === 'string' && ev.actorId.trim()) {
          declinedSetForTrip.add(ev.actorId.trim());
        }
      }
    }
    for (const decDriverId of declinedSetForTrip) {
      const dRow = ensureDriverRow(decDriverId);
      dRow.declinedOffersCount += 1;
    }

    if (isCancelledOrDeclinedTrip(trip)) continue;

    billablePeriodTripsCount += 1;
    const totalFare = Math.max(0, Number(trip.pricing?.totalFare ?? trip.payment?.amount ?? 0) || 0);
    const tipAmt = Math.max(0, Number(trip.payment?.tipAmount || 0) || 0);
    const tsMs = resolveTripOperationalTimestampMs(trip);
    const variance = resolveScheduledPickupVarianceMinutes(trip);

    // Time-series bucket assignment
    if (tsMs !== null) {
      let bKey: string;
      let bLabel: string;
      if (granularity === 'hour') {
        const dt = new Date(tsMs);
        const h = dt.getHours();
        bKey = `${formatDateKeyLocal(tsMs)}T${String(h).padStart(2, '0')}`;
        bLabel = formatHourLabel(h);
      } else if (granularity === 'month') {
        bKey = formatMonthKeyLocal(tsMs);
        bLabel = formatMonthLabelFromKey(bKey);
      } else {
        bKey = formatDateKeyLocal(tsMs);
        bLabel = formatShortMonthDay(tsMs);
      }

      const bucket = ensureBucket(bKey, bLabel);
      bucket.trips += 1;
      bucket.revenue += totalFare;
      if (trip.status === 'completed') {
        bucket.completedRevenue += totalFare;
      }
      if (variance !== null) {
        bucket.scheduledEvaluatedCount += 1;
        if (variance <= graceMinutes) {
          bucket.onTimeCount += 1;
        }
      }

      // Peak demand window assignment
      const hour = new Date(tsMs).getHours();
      let blockKey: HourlyDemandWindowRow['key'];
      if (hour >= 4 && hour <= 7) blockKey = 'early_airport';
      else if (hour >= 8 && hour <= 11) blockKey = 'morning_commute';
      else if (hour >= 12 && hour <= 15) blockKey = 'midday';
      else if (hour >= 16 && hour <= 19) blockKey = 'evening_rush';
      else blockKey = 'late_night';

      const dBucket = demandAgg.get(blockKey)!;
      dBucket.tripCount += 1;
      dBucket.grossRevenue += totalFare;
    }

    // Corporate B2B leaderboard
    const meta = (trip.metadata || {}) as Record<string, unknown>;
    const rawCorpId =
      trip.corporateAccountId ||
      trip.payment?.corporateAccountId ||
      (typeof meta.corporateAccountId === 'string' ? meta.corporateAccountId : '');
    const rawCorpName =
      (typeof meta.corporateOrgName === 'string' && meta.corporateOrgName.trim()) ||
      (typeof meta.corporateAccountName === 'string' && meta.corporateAccountName.trim()) ||
      '';
    const isCorporateTrip =
      Boolean(rawCorpId) ||
      Boolean(rawCorpName) ||
      trip.payment?.method === 'corporate' ||
      trip.payment?.method === 'account';

    if (isCorporateTrip) {
      const resolvedName =
        (rawCorpId && corpNameById.get(rawCorpId.toLowerCase())) ||
        rawCorpName ||
        rawCorpId ||
        'Corporate Account';
      const accountKey = (rawCorpId || normalizeMatchSlug(resolvedName) || 'corporate').toLowerCase();
      let cEntry = corpAgg.get(accountKey);
      if (!cEntry) {
        cEntry = {
          accountName: resolvedName,
          tripCount: 0,
          grossRevenue: 0,
          pendingInvoiceCount: 0,
        };
        corpAgg.set(accountKey, cEntry);
      }
      cEntry.tripCount += 1;
      cEntry.grossRevenue += totalFare;
      if (
        trip.payment?.status === 'pending_invoice' ||
        (trip.status === 'completed' && trip.payment?.status === 'pending')
      ) {
        cEntry.pendingInvoiceCount += 1;
      }
    }

    // Driver leaderboard
    if (trip.assignedDriverId) {
      const metaDriverName =
        typeof meta.driverName === 'string' ? meta.driverName : undefined;
      const dRow = ensureDriverRow(
        trip.assignedDriverId,
        metaDriverName,
        trip.assignedVehicle?.vehicleNumber
      );

      if (trip.status === 'completed') {
        dRow.completedTrips += 1;
        dRow.grossFare += totalFare;
        dRow.tipsEarned += tipAmt;
      } else if (ACTIVE_DISPATCHED_STATUSES.has(String(trip.status || ''))) {
        dRow.activeTrips += 1;
      }

      if (variance !== null) {
        dRow.scheduledEvalCount += 1;
        if (variance <= graceMinutes) {
          dRow.scheduledOnTimeCount += 1;
        }
      }
    }

    // Zone origination
    const zoneLabel = extractPickupZoneLabel(trip.pickupLocation?.address);
    const zoneKey = normalizeMatchSlug(zoneLabel) || 'other';
    let zRow = zoneAgg.get(zoneKey);
    if (!zRow) {
      zRow = { zoneLabel, tripCount: 0, grossRevenue: 0 };
      zoneAgg.set(zoneKey, zRow);
    }
    zRow.tripCount += 1;
    zRow.grossRevenue += totalFare;

    // Vehicle class demand
    const vTier = String(trip.vehicleTier || 'standard').toLowerCase();
    if (vTier === 'wav' || vTier === 'wheelchair' || vTier === 'accessible' || vTier === 'wheelchair_wav') {
      tierAgg.wav.count += 1;
      tierAgg.wav.revenue += totalFare;
    } else if (vTier === 'xl' || vTier === 'suv' || vTier === 'minivan' || vTier === 'van') {
      tierAgg.xl.count += 1;
      tierAgg.xl.revenue += totalFare;
    } else if (vTier === 'executive' || vTier === 'premium') {
      tierAgg.executive.count += 1;
      tierAgg.executive.revenue += totalFare;
    } else {
      tierAgg.standard.count += 1;
      tierAgg.standard.revenue += totalFare;
    }
  }

  // Sort chronological timeSeries strictly by ISO-lexicographic key (`YYYY-MM-DD`, `YYYY-MM-DDTHH`, `YYYY-MM`)
  const timeSeries: TimeSeriesBucket[] = Array.from(bucketMap.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      ...b,
      revenue: roundMoney(b.revenue),
      completedRevenue: roundMoney(b.completedRevenue),
    }));

  const hourlyDemand: HourlyDemandWindowRow[] = demandDefs.map((def) => {
    const agg = demandAgg.get(def.key)!;
    const rev = roundMoney(agg.grossRevenue);
    return {
      key: def.key,
      label: def.label,
      timeRange: def.timeRange,
      tripCount: agg.tripCount,
      sharePercent:
        billablePeriodTripsCount > 0
          ? roundOneDecimal((agg.tripCount / billablePeriodTripsCount) * 100)
          : 0,
      grossRevenue: rev,
      avgFare: agg.tripCount > 0 ? roundMoney(rev / agg.tripCount) : 0,
    };
  });

  const corporateLeaderboard: CorporateLeaderboardRow[] = Array.from(corpAgg.entries())
    .map(([accountKey, row]) => {
      const rev = roundMoney(row.grossRevenue);
      return {
        accountKey,
        accountName: row.accountName,
        tripCount: row.tripCount,
        grossRevenue: rev,
        avgFare: row.tripCount > 0 ? roundMoney(rev / row.tripCount) : 0,
        pendingInvoiceCount: row.pendingInvoiceCount,
      };
    })
    .sort((a, b) => b.grossRevenue - a.grossRevenue || b.tripCount - a.tripCount);

  const driverLeaderboard: DriverLeaderboardRow[] = Array.from(driverAgg.values())
    .filter(
      (d) => d.completedTrips > 0 || d.activeTrips > 0 || d.declinedOffersCount > 0
    )
    .map((d) => ({
      driverId: d.driverId,
      driverName: d.driverName,
      cabNumber: d.cabNumber,
      completedTrips: d.completedTrips,
      activeTrips: d.activeTrips,
      grossFare: roundMoney(d.grossFare),
      tipsEarned: roundMoney(d.tipsEarned),
      declinedOffersCount: d.declinedOffersCount,
      onTimeRatePercent:
        d.scheduledEvalCount > 0
          ? roundOneDecimal((d.scheduledOnTimeCount / d.scheduledEvalCount) * 100)
          : null,
    }))
    .sort(
      (a, b) =>
        b.grossFare - a.grossFare ||
        b.completedTrips - a.completedTrips ||
        b.activeTrips - a.activeTrips ||
        a.driverName.localeCompare(b.driverName)
    );

  const zoneBreakdown: ZoneOriginationRow[] = Array.from(zoneAgg.entries())
    .map(([zoneKey, row]) => ({
      zoneKey,
      zoneLabel: row.zoneLabel,
      tripCount: row.tripCount,
      grossRevenue: roundMoney(row.grossRevenue),
      sharePercent:
        billablePeriodTripsCount > 0
          ? roundOneDecimal((row.tripCount / billablePeriodTripsCount) * 100)
          : 0,
    }))
    .sort((a, b) => b.tripCount - a.tripCount || b.grossRevenue - a.grossRevenue);

  const vehicleDefs: Array<{ tierKey: VehicleClassDemandRow['tierKey']; label: string }> = [
    { tierKey: 'standard', label: 'Standard Sedan (Up to 4 Pax)' },
    { tierKey: 'executive', label: 'Executive Sedan / SUV' },
    { tierKey: 'xl', label: 'XL Minivan / SUV (Up to 6 Pax)' },
    { tierKey: 'wav', label: 'Wheelchair Accessible (WAV)' },
  ];

  const vehicleClassBreakdown: VehicleClassDemandRow[] = vehicleDefs.map((v) => ({
    tierKey: v.tierKey,
    label: v.label,
    tripCount: tierAgg[v.tierKey].count,
    sharePercent:
      billablePeriodTripsCount > 0
        ? roundOneDecimal((tierAgg[v.tierKey].count / billablePeriodTripsCount) * 100)
        : 0,
    grossRevenue: roundMoney(tierAgg[v.tierKey].revenue),
  }));

  return {
    timeSeries,
    hourlyDemand,
    corporateLeaderboard,
    driverLeaderboard,
    zoneBreakdown,
    vehicleClassBreakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Unified Snapshot & RFC-4180 Formula-Safe Multi-Report CSV Exporter
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationalIntelligenceSnapshot {
  window: AnalyticsDateWindow;
  periodTrips: Trip[];
  priorPeriodTrips: Trip[];
  hasPriorPeriodComparison: boolean;
  totalTripsCount: number;
  completedCount: number;
  activeDispatchedCount: number;
  pendingCount: number;
  cancelledCount: number;
  sla: SlaPerformanceMetrics;
  autoDispatch: AutoDispatchIntelligenceMetrics;
  revenue: RevenueAttributionMetrics;
  seriesAndBoards: TimeSeriesAndLeaderboardsResult;
  deltas: {
    bookings: PercentDeltaResult;
    completed: PercentDeltaResult;
    grossRevenue: PercentDeltaResult;
    avgFare: PercentDeltaResult;
    onTimeSla: PercentDeltaResult;
    firstAttemptAccept: PercentDeltaResult;
  };
}

export function computeOperationalIntelligenceSnapshot(params: {
  allTrips: ReadonlyArray<Trip>;
  window: AnalyticsDateWindow;
  drivers?: ReadonlyArray<DriverRosterItem>;
  settings?: ComputeRevenueAttributionParams['settings'];
  surchargesConfig?: Partial<SurchargesConfig> | null;
  pricingRules?: ReadonlyArray<NamedPricingRule> | null;
  pricingAuditEvents?: ReadonlyArray<PricingAuditEvent> | null;
  onTimeGraceMinutes?: number;
  nowMs?: number;
}): OperationalIntelligenceSnapshot {
  const { allTrips, window, drivers = [], settings, onTimeGraceMinutes, nowMs } = params;

  const periodTrips = filterTripsByAnalyticsWindow(allTrips, window);
  const hasPriorPeriodComparison =
    window.prevStartMs !== null && window.prevEndMs !== null;
  const priorPeriodTrips = hasPriorPeriodComparison
    ? filterTripsByAnalyticsWindow(allTrips, {
        startMs: window.prevStartMs,
        endMs: window.prevEndMs,
      })
    : [];

  const sla = computeSlaPerformanceMetrics(periodTrips, { onTimeGraceMinutes, nowMs });
  const autoDispatch = computeAutoDispatchIntelligence(periodTrips);
  const revenue = computeRevenueAttributionMetrics({
    trips: periodTrips,
    settings,
    surchargesConfig: params.surchargesConfig,
    pricingRules: params.pricingRules,
    pricingAuditEvents: params.pricingAuditEvents,
  });
  const seriesAndBoards = computeTimeSeriesAndLeaderboards({
    trips: periodTrips,
    window,
    drivers,
    settings,
    onTimeGraceMinutes,
    nowMs,
  });

  const completedCount = periodTrips.filter((t) => t.status === 'completed').length;
  const activeDispatchedCount = periodTrips.filter((t) =>
    ACTIVE_DISPATCHED_STATUSES.has(String(t.status || ''))
  ).length;
  const pendingCount = periodTrips.filter(
    (t) =>
      t.status === 'pending' ||
      t.status === 'unconfirmed' ||
      t.status === 'UNCONFIRMED' ||
      (!t.assignedDriverId && (t.status === 'CONFIRMED' || t.status === 'confirmed'))
  ).length;
  const cancelledCount = sla.totalCancelledOrDeclined;

  let deltas: OperationalIntelligenceSnapshot['deltas'] = {
    bookings: { deltaPercent: null, direction: 'flat' },
    completed: { deltaPercent: null, direction: 'flat' },
    grossRevenue: { deltaPercent: null, direction: 'flat' },
    avgFare: { deltaPercent: null, direction: 'flat' },
    onTimeSla: { deltaPercent: null, direction: 'flat' },
    firstAttemptAccept: { deltaPercent: null, direction: 'flat' },
  };

  if (hasPriorPeriodComparison) {
    const prevSla = computeSlaPerformanceMetrics(priorPeriodTrips, {
      onTimeGraceMinutes,
      nowMs,
    });
    const prevAuto = computeAutoDispatchIntelligence(priorPeriodTrips);
    const prevRev = computeRevenueAttributionMetrics({
      trips: priorPeriodTrips,
      settings,
      surchargesConfig: params.surchargesConfig,
      pricingRules: params.pricingRules,
      pricingAuditEvents: params.pricingAuditEvents,
    });
    const prevCompleted = priorPeriodTrips.filter((t) => t.status === 'completed').length;

    deltas = {
      bookings: computePercentDelta(periodTrips.length, priorPeriodTrips.length),
      completed: computePercentDelta(completedCount, prevCompleted),
      grossRevenue: computePercentDelta(
        revenue.grossBookedRevenue,
        prevRev.grossBookedRevenue
      ),
      avgFare: computePercentDelta(revenue.avgFare, prevRev.avgFare),
      onTimeSla:
        sla.onTimeRatePercent !== null && prevSla.onTimeRatePercent !== null
          ? computePercentDelta(sla.onTimeRatePercent, prevSla.onTimeRatePercent)
          : { deltaPercent: null, direction: 'flat' },
      firstAttemptAccept:
        autoDispatch.totalCascadesTriggered > 0 && prevAuto.totalCascadesTriggered > 0
          ? computePercentDelta(
              autoDispatch.firstAttemptAcceptRatePercent,
              prevAuto.firstAttemptAcceptRatePercent
            )
          : { deltaPercent: null, direction: 'flat' },
    };
  }

  return {
    window,
    periodTrips,
    priorPeriodTrips,
    hasPriorPeriodComparison,
    totalTripsCount: periodTrips.length,
    completedCount,
    activeDispatchedCount,
    pendingCount,
    cancelledCount,
    sla,
    autoDispatch,
    revenue,
    seriesAndBoards,
    deltas,
  };
}

export type AnalyticsCsvReportType =
  | 'executive_summary'
  | 'trips_sla_dispatch'
  | 'surcharge_tariff_attribution'
  | 'driver_corporate_leaderboard';

export interface ExportedAnalyticsCsvReport {
  filename: string;
  csvContent: string;
  rowCount: number;
}

/**
 * RFC-4180 cell serializer with spreadsheet formula-injection neutralization:
 * - Prefixes strings whose trimmed first character is `=`, `+`, `-`, or `@`
 *   (unless it is a plain signed negative number such as `-15.50`) with `'`.
 * - Escapes internal `"` as `""` and wraps cells containing `,`, `"`, `\r`, or `\n` in `"..."`.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  let str = String(value);
  const trimmed = str.trim();
  if (trimmed.length > 0 && /^[=+\-@]/.test(trimmed)) {
    const isPlainSignedNegativeNumber = /^-\d+(\.\d+)?$/.test(trimmed);
    if (!isPlainSignedNegativeNumber) {
      str = `'${str}`;
    }
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function serializeCsvRows(header: string[], dataRows: Array<Array<unknown>>): string {
  const lines = [
    header.map(escapeCsvCell).join(','),
    ...dataRows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return lines.join('\r\n');
}

export function exportAnalyticsCsvReport(params: {
  reportType: AnalyticsCsvReportType;
  snapshot: OperationalIntelligenceSnapshot;
  drivers?: ReadonlyArray<DriverRosterItem>;
  nowMs?: number;
}): ExportedAnalyticsCsvReport {
  const { reportType, snapshot, drivers = [] } = params;
  const dateSlug = formatDateKeyLocal(resolveNowMs(params.nowMs));
  const presetSlug = snapshot.window.preset;

  const driverNameById = new Map<string, string>();
  for (const d of drivers) {
    if (d?.id) {
      driverNameById.set(d.id, d.formattedLabel || d.name || d.id);
    }
  }

  if (reportType === 'executive_summary') {
    const header = [
      'Category',
      'Metric',
      'Value',
      'Delta vs Prior (%)',
      'Period Window',
      'Notes',
    ];
    const fmtDelta = (d: PercentDeltaResult) =>
      d.deltaPercent !== null ? `${d.deltaPercent > 0 ? '+' : ''}${d.deltaPercent}%` : '—';

    const dataRows: Array<Array<unknown>> = [
      [
        'Volume',
        'Total Bookings',
        snapshot.totalTripsCount,
        fmtDelta(snapshot.deltas.bookings),
        snapshot.window.label,
        `${snapshot.completedCount} completed, ${snapshot.activeDispatchedCount} active, ${snapshot.pendingCount} open`,
      ],
      [
        'Volume',
        'Completed Rides',
        snapshot.completedCount,
        fmtDelta(snapshot.deltas.completed),
        snapshot.window.label,
        '',
      ],
      [
        'Revenue',
        'Gross Booked Revenue ($)',
        snapshot.revenue.grossBookedRevenue.toFixed(2),
        fmtDelta(snapshot.deltas.grossRevenue),
        snapshot.window.label,
        'Excludes cancelled and declined trips',
      ],
      [
        'Revenue',
        'Settled Completed Revenue ($)',
        snapshot.revenue.completedRevenue.toFixed(2),
        '—',
        snapshot.window.label,
        `Pipeline: $${snapshot.revenue.scheduledPipelineRevenue.toFixed(2)}`,
      ],
      [
        'Revenue',
        'Average Fare ($)',
        snapshot.revenue.avgFare.toFixed(2),
        fmtDelta(snapshot.deltas.avgFare),
        snapshot.window.label,
        `Tips: $${snapshot.revenue.tipsTotal.toFixed(2)}`,
      ],
      [
        'SLA',
        'On-Time Pickup SLA (%)',
        snapshot.sla.onTimeRatePercent !== null
          ? `${snapshot.sla.onTimeRatePercent}%`
          : 'N/A (0 due)',
        fmtDelta(snapshot.deltas.onTimeSla),
        snapshot.window.label,
        `${snapshot.sla.onTimeCount}/${snapshot.sla.evaluatedScheduledCount} within ${snapshot.sla.onTimeGraceMinutes}m grace`,
      ],
      [
        'SLA',
        'Avg Pickup Variance (min)',
        snapshot.sla.avgPickupVarianceMinutes,
        '—',
        snapshot.window.label,
        'Negative = early, positive = late',
      ],
      [
        'SLA',
        'Open At-Risk Scheduled Rides',
        snapshot.sla.openUnassignedScheduledAtRiskCount,
        '—',
        snapshot.window.label,
        `Critical: ${snapshot.sla.slaCriticalCount}, Overdue: ${snapshot.sla.slaOverdueCount}`,
      ],
      [
        'Cancellations',
        'Cancelled / Declined Rides',
        snapshot.sla.totalCancelledOrDeclined,
        '—',
        snapshot.window.label,
        `Rate: ${snapshot.sla.cancellationRatePercent}% | /track Fee Previews: $${snapshot.sla.previewedCancellationFeesTotal.toFixed(2)}`,
      ],
      [
        'Auto-Dispatch',
        '1st-Attempt Cascade Accept (%)',
        `${snapshot.autoDispatch.firstAttemptAcceptRatePercent}%`,
        fmtDelta(snapshot.deltas.firstAttemptAccept),
        snapshot.window.label,
        `${snapshot.autoDispatch.firstAttemptAcceptCount}/${snapshot.autoDispatch.totalCascadesTriggered} cascades`,
      ],
      [
        'Auto-Dispatch',
        'Cascade Exhaustion Rate (%)',
        `${snapshot.autoDispatch.exhaustionRatePercent}%`,
        '—',
        snapshot.window.label,
        `${snapshot.autoDispatch.exhaustedCascades} exhausted`,
      ],
      [
        'Wave 4 Ops',
        'Currently Staged Shift Holds',
        snapshot.autoDispatch.currentlyStagedCount,
        '—',
        snapshot.window.label,
        `Standing Order Trips: ${snapshot.autoDispatch.standingOrderTripsCount}`,
      ],
      [
        'Wave 4 Ops',
        'Driver Update Ack Rate (%)',
        `${snapshot.autoDispatch.driverUpdateAckStats.ackRatePercent}%`,
        '—',
        snapshot.window.label,
        `${snapshot.autoDispatch.driverUpdateAckStats.acknowledgedCount}/${snapshot.autoDispatch.driverUpdateAckStats.totalUpdatesSent} acknowledged`,
      ],
      [
        'Wave 4 Ops',
        'Guest Self-Service Modifications',
        snapshot.autoDispatch.guestSelfServiceStats.guestModifiedTripsCount,
        '—',
        snapshot.window.label,
        `Pending requests: ${snapshot.autoDispatch.guestSelfServiceStats.pendingChangeRequests}`,
      ],
    ];

    return {
      filename: `chesterfield-executive-summary-${presetSlug}-${dateSlug}.csv`,
      csvContent: serializeCsvRows(header, dataRows),
      rowCount: dataRows.length,
    };
  }

  if (reportType === 'trips_sla_dispatch') {
    const header = [
      'Trip ID',
      'Operational Timestamp',
      'Scheduled Pickup',
      'Actual Pickup',
      'Booking Type',
      'Status',
      'Passenger',
      'Pickup Address',
      'Dropoff Address',
      'Vehicle Tier',
      'Dispatch Channel',
      'Cascade State',
      'Cascade Attempts',
      'Assigned Driver',
      'Staged Driver',
      'SLA Level',
      'Pickup Variance (min)',
      'On-Time Status',
      'Fare ($)',
      'Tip ($)',
      'Payment Method',
      'Cancelled By',
      'Cancellation Fee Preview ($)',
    ];

    const dataRows: Array<Array<unknown>> = snapshot.periodTrips.map((trip) => {
      const opTs = resolveTripOperationalTimestampMs(trip);
      const opIso = opTs !== null ? new Date(opTs).toISOString() : '';
      const passengerName = trip.passenger
        ? `${trip.passenger.firstName || ''} ${trip.passenger.lastName || ''}`.trim() ||
          'Guest Client'
        : 'Guest Client';
      const channel = classifyTripDispatchChannel(trip);
      const variance = resolveScheduledPickupVarianceMinutes(trip);
      const roundedVar = variance !== null ? roundOneDecimal(variance) : '';
      const onTimeLabel =
        variance === null
          ? 'N/A'
          : variance <= snapshot.sla.onTimeGraceMinutes
          ? 'On-Time'
          : 'Late';

      const fare = Number(trip.pricing?.totalFare ?? trip.payment?.amount ?? 0) || 0;
      const tip = Number(trip.payment?.tipAmount || 0) || 0;
      const meta = (trip.metadata || {}) as Record<string, unknown>;
      const cxlPolicy = meta.guestCancellationPolicy as
        | { cancellationFeeAmount?: unknown }
        | undefined;
      const cxlFee = Number(cxlPolicy?.cancellationFeeAmount || 0) || 0;

      const assignedLabel = trip.assignedDriverId
        ? driverNameById.get(trip.assignedDriverId) || trip.assignedDriverId
        : '';
      const stagedLabel = trip.plannedDriverLabel || trip.plannedDriverId || '';

      return [
        trip.id,
        opIso,
        trip.scheduledPickupTime || '',
        trip.actualPickupTime || '',
        trip.bookingType || 'asap',
        trip.status,
        passengerName,
        trip.pickupLocation?.address || '',
        trip.dropoffLocation?.address || '',
        trip.vehicleTier || 'standard',
        channel ? DISPATCH_CHANNEL_LABELS[channel] : 'Unassigned',
        trip.offerCascade?.state || '',
        trip.offerCascade?.cascadeAttempt ?? '',
        assignedLabel,
        stagedLabel,
        trip.slaStatus?.level || 'normal',
        roundedVar,
        onTimeLabel,
        fare.toFixed(2),
        tip.toFixed(2),
        trip.payment?.method || 'card',
        trip.cancelledBy || '',
        cxlFee > 0 ? cxlFee.toFixed(2) : '0.00',
      ];
    });

    return {
      filename: `chesterfield-trips-sla-dispatch-${presetSlug}-${dateSlug}.csv`,
      csvContent: serializeCsvRows(header, dataRows),
      rowCount: dataRows.length,
    };
  }

  if (reportType === 'surcharge_tariff_attribution') {
    const header = [
      'Record Type',
      'Item ID',
      'Name',
      'Current State',
      'Trip Count',
      'Attributed Revenue ($)',
      'Avg Per Trip ($)',
      'Share (%)',
      'Last Audit Action',
      'Last Changed At',
      'Last Changed By',
    ];

    const rev = snapshot.revenue;
    const dataRows: Array<Array<unknown>> = [
      [
        'Waterfall',
        'base_distance',
        'Base & Distance Fare',
        'enabled',
        rev.billableTripsCount,
        rev.baseAndDistanceRevenue.toFixed(2),
        rev.billableTripsCount > 0
          ? (rev.baseAndDistanceRevenue / rev.billableTripsCount).toFixed(2)
          : '0.00',
        rev.grossBookedRevenue > 0
          ? roundOneDecimal((rev.baseAndDistanceRevenue / rev.grossBookedRevenue) * 100)
          : 0,
        '',
        '',
        '',
      ],
      [
        'Waterfall',
        'surcharges_total',
        'Surcharges & Rules Total',
        'enabled',
        rev.billableTripsCount,
        rev.surchargesRevenue.toFixed(2),
        rev.billableTripsCount > 0
          ? (rev.surchargesRevenue / rev.billableTripsCount).toFixed(2)
          : '0.00',
        rev.grossBookedRevenue > 0
          ? roundOneDecimal((rev.surchargesRevenue / rev.grossBookedRevenue) * 100)
          : 0,
        '',
        '',
        '',
      ],
      [
        'Waterfall',
        'extras_wait_total',
        'Extras, Stops & Wait Fees',
        'enabled',
        rev.billableTripsCount,
        rev.extrasAndWaitRevenue.toFixed(2),
        rev.billableTripsCount > 0
          ? (rev.extrasAndWaitRevenue / rev.billableTripsCount).toFixed(2)
          : '0.00',
        rev.grossBookedRevenue > 0
          ? roundOneDecimal((rev.extrasAndWaitRevenue / rev.grossBookedRevenue) * 100)
          : 0,
        '',
        '',
        '',
      ],
      [
        'Waterfall',
        'tips_total',
        'Driver Gratuities (Tips)',
        'enabled',
        rev.billableTripsCount,
        rev.tipsTotal.toFixed(2),
        '0.00',
        '',
        '',
        '',
        '',
      ],
      [
        'Waterfall',
        'discounts_total',
        'Courtesy & Promo Discounts',
        'enabled',
        rev.billableTripsCount,
        (-rev.discountsTotal).toFixed(2),
        '0.00',
        '',
        '',
        '',
        '',
      ],
      ...rev.surchargeAttributionRows.map((s) => [
        s.itemType === 'rule' ? 'Pricing Rule' : 'Surcharge',
        s.id,
        s.name,
        s.currentState,
        s.tripCount,
        s.attributedRevenue.toFixed(2),
        s.avgAmountPerTrip.toFixed(2),
        s.sharePercent,
        s.lastAuditAction || '',
        s.lastAuditTimestamp || '',
        s.lastActor || '',
      ]),
      ...rev.corridorAttributionRows.map((c) => [
        'Corridor / Tariff',
        c.key,
        c.name,
        'enabled',
        c.tripCount,
        c.grossRevenue.toFixed(2),
        c.avgFare.toFixed(2),
        c.sharePercent,
        '',
        '',
        '',
      ]),
    ];

    return {
      filename: `chesterfield-surcharge-tariff-attribution-${presetSlug}-${dateSlug}.csv`,
      csvContent: serializeCsvRows(header, dataRows),
      rowCount: dataRows.length,
    };
  }

  // 'driver_corporate_leaderboard'
  const header = [
    'Segment',
    'ID / Key',
    'Name',
    'Cab / Detail',
    'Primary Trips Count',
    'Active Trips',
    'Gross Revenue ($)',
    'Tips Earned ($)',
    'Avg Fare ($)',
    'Declined Offers',
    'On-Time SLA (%)',
    'Pending Invoices',
  ];

  const boards = snapshot.seriesAndBoards;
  const dataRows: Array<Array<unknown>> = [
    ...boards.driverLeaderboard.map((d) => [
      'Driver',
      d.driverId,
      d.driverName,
      d.cabNumber ? `#${d.cabNumber}` : '',
      d.completedTrips,
      d.activeTrips,
      d.grossFare.toFixed(2),
      d.tipsEarned.toFixed(2),
      d.completedTrips > 0 ? (d.grossFare / d.completedTrips).toFixed(2) : '0.00',
      d.declinedOffersCount,
      d.onTimeRatePercent !== null ? `${d.onTimeRatePercent}%` : 'N/A',
      '',
    ]),
    ...boards.corporateLeaderboard.map((c) => [
      'Corporate Account',
      c.accountKey,
      c.accountName,
      'B2B Billing',
      c.tripCount,
      '',
      c.grossRevenue.toFixed(2),
      '',
      c.avgFare.toFixed(2),
      '',
      '',
      c.pendingInvoiceCount,
    ]),
    ...boards.zoneBreakdown.map((z) => [
      'Pickup Zone',
      z.zoneKey,
      z.zoneLabel,
      `${z.sharePercent}% share`,
      z.tripCount,
      '',
      z.grossRevenue.toFixed(2),
      '',
      z.tripCount > 0 ? (z.grossRevenue / z.tripCount).toFixed(2) : '0.00',
      '',
      '',
      '',
    ]),
    ...boards.hourlyDemand.map((h) => [
      'Peak Window',
      h.key,
      h.label,
      h.timeRange,
      h.tripCount,
      '',
      h.grossRevenue.toFixed(2),
      '',
      h.avgFare.toFixed(2),
      '',
      '',
      '',
    ]),
  ];

  return {
    filename: `chesterfield-driver-corporate-leaderboard-${presetSlug}-${dateSlug}.csv`,
    csvContent: serializeCsvRows(header, dataRows),
    rowCount: dataRows.length,
  };
}
