/**
 * 1-Read Dashboard KPI Summary Service (`analytics/kpiSummary` — Phase 101)
 *
 * Maintains a lightweight aggregate document at `/analytics/kpiSummary` via
 * atomic Firestore `increment()` updates on trip creation, completion, and
 * cancellation so `AdminDashboardTab` can render all-time and 30-day/MTD KPIs
 * in 1 document read instead of downloading 45,000+ trips.
 */

import { doc, getDoc, increment, setDoc } from 'firebase/firestore';
import type { Trip } from '../../types/trip';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import {
  computePercentDelta,
  isCancelledOrDeclinedTrip,
  resolveTripOperationalTimestampMs,
  type OperationalIntelligenceSnapshot,
} from './operational-intelligence.service';

export const KPI_SUMMARY_COLLECTION = 'analytics';
export const KPI_SUMMARY_DOC_ID = 'kpiSummary';
const DAILY_BUCKET_RETENTION_DAYS = 90;
const KPI_CACHE_TTL_MS = 30_000;

export interface KpiDailyBucket {
  trips: number;
  completed: number;
  cancelled: number;
  grossRevenue: number;
  completedRevenue: number;
  tipsTotal: number;
}

export interface KpiSummaryDoc {
  totalTrips: number;
  completedTrips: number;
  cancelledTrips: number;
  activeOrPendingTrips: number;
  grossBookedRevenue: number;
  completedRevenue: number;
  tipsTotal: number;
  /** Rolling daily buckets keyed by local `YYYY-MM-DD` */
  dailyBuckets?: Record<string, KpiDailyBucket>;
  /** Contact directory counters (Phase 101) */
  contactsTotal?: number;
  contactsActive?: number;
  contactsArchived?: number;
  contactsBlacklisted?: number;
  contactsVip?: number;
  contactsByLetter?: Record<string, number>;
  updatedAt: string;
  seededAt?: string;
}

export function resolveContactLetterBucket(name?: string | null): string {
  const firstChar = String(name || '').trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstChar) ? firstChar : '#';
}

interface ContactCounterFlags {
  isActive: boolean;
  isArchived: boolean;
  isBlacklisted: boolean;
  isVip: boolean;
  letterBucket: string;
}

function classifyContactFlags(contact: {
  name?: string | null;
  isArchived?: boolean;
  isBlacklisted?: boolean;
  isVip?: boolean;
}): ContactCounterFlags {
  const isBlacklisted = Boolean(contact.isBlacklisted);
  const isArchived = !isBlacklisted && Boolean(contact.isArchived);
  const isActive = !isBlacklisted && !isArchived;
  const isVip = !isBlacklisted && Boolean(contact.isVip);
  return {
    isActive,
    isArchived,
    isBlacklisted,
    isVip,
    letterBucket: resolveContactLetterBucket(contact.name),
  };
}

type LifecycleBucket = 'open' | 'completed' | 'cancelled';

function roundMoney(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number(val.toFixed(2));
}

function classifyTripBucket(trip: Partial<Trip>): LifecycleBucket {
  if (isCancelledOrDeclinedTrip(trip)) return 'cancelled';
  if (trip.status === 'completed') return 'completed';
  return 'open';
}

function extractTripFare(trip: Partial<Trip>): number {
  return roundMoney(Math.max(0, Number(trip.pricing?.totalFare ?? trip.payment?.amount ?? 0) || 0));
}

function extractTripTip(trip: Partial<Trip>): number {
  return roundMoney(Math.max(0, Number(trip.payment?.tipAmount || 0) || 0));
}

export function formatKpiDateKeyLocal(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveTripKpiDateKey(trip: Partial<Trip>, fallbackMs = Date.now()): string {
  const ts = resolveTripOperationalTimestampMs(trip);
  return formatKpiDateKeyLocal(ts ?? fallbackMs);
}

/**
 * Pure aggregator used by `scripts/backfill-spark-indexes.ts` (and local mock mode)
 * to build an exact `KpiSummaryDoc` from an existing collection of trips.
 */
export function buildKpiSummaryFromTrips(
  trips: Iterable<Trip>,
  nowMs: number = Date.now()
): KpiSummaryDoc {
  const nowIso = new Date(nowMs).toISOString();
  const retentionCutoffMs = nowMs - DAILY_BUCKET_RETENTION_DAYS * 86_400_000;

  let totalTrips = 0;
  let completedTrips = 0;
  let cancelledTrips = 0;
  let activeOrPendingTrips = 0;
  let grossBookedRevenue = 0;
  let completedRevenue = 0;
  let tipsTotal = 0;
  const dailyBuckets: Record<string, KpiDailyBucket> = {};

  for (const trip of trips) {
    if (!trip || trip.isArchived) continue;
    totalTrips += 1;

    const bucket = classifyTripBucket(trip);
    const fare = extractTripFare(trip);
    const tip = extractTripTip(trip);

    if (bucket === 'completed') {
      completedTrips += 1;
      grossBookedRevenue += fare;
      completedRevenue += fare;
      tipsTotal += tip;
    } else if (bucket === 'cancelled') {
      cancelledTrips += 1;
    } else {
      activeOrPendingTrips += 1;
      grossBookedRevenue += fare;
      tipsTotal += tip;
    }

    const opTs = resolveTripOperationalTimestampMs(trip);
    if (opTs !== null && opTs >= retentionCutoffMs) {
      const dateKey = formatKpiDateKeyLocal(opTs);
      const day = dailyBuckets[dateKey] || {
        trips: 0,
        completed: 0,
        cancelled: 0,
        grossRevenue: 0,
        completedRevenue: 0,
        tipsTotal: 0,
      };
      day.trips += 1;
      if (bucket === 'completed') {
        day.completed += 1;
        day.grossRevenue = roundMoney(day.grossRevenue + fare);
        day.completedRevenue = roundMoney(day.completedRevenue + fare);
        day.tipsTotal = roundMoney(day.tipsTotal + tip);
      } else if (bucket === 'cancelled') {
        day.cancelled += 1;
      } else {
        day.grossRevenue = roundMoney(day.grossRevenue + fare);
        day.tipsTotal = roundMoney(day.tipsTotal + tip);
      }
      dailyBuckets[dateKey] = day;
    }
  }

  return {
    totalTrips,
    completedTrips,
    cancelledTrips,
    activeOrPendingTrips,
    grossBookedRevenue: roundMoney(grossBookedRevenue),
    completedRevenue: roundMoney(completedRevenue),
    tipsTotal: roundMoney(tipsTotal),
    dailyBuckets,
    updatedAt: nowIso,
    seededAt: nowIso,
  };
}

function sumDailyBucketsInRange(
  dailyBuckets: Record<string, KpiDailyBucket> | undefined,
  startMs: number | null,
  endMs: number | null
): KpiDailyBucket | null {
  if (!dailyBuckets || startMs === null || endMs === null) return null;
  const startKey = formatKpiDateKeyLocal(startMs);
  const endKey = formatKpiDateKeyLocal(endMs);

  let matchedAny = false;
  const total: KpiDailyBucket = {
    trips: 0,
    completed: 0,
    cancelled: 0,
    grossRevenue: 0,
    completedRevenue: 0,
    tipsTotal: 0,
  };

  for (const [dateKey, bucket] of Object.entries(dailyBuckets)) {
    if (dateKey >= startKey && dateKey <= endKey && bucket) {
      matchedAny = true;
      total.trips += Number(bucket.trips || 0);
      total.completed += Number(bucket.completed || 0);
      total.cancelled += Number(bucket.cancelled || 0);
      total.grossRevenue = roundMoney(total.grossRevenue + Number(bucket.grossRevenue || 0));
      total.completedRevenue = roundMoney(
        total.completedRevenue + Number(bucket.completedRevenue || 0)
      );
      total.tipsTotal = roundMoney(total.tipsTotal + Number(bucket.tipsTotal || 0));
    }
  }

  return matchedAny ? total : null;
}

/**
 * Enriches an `OperationalIntelligenceSnapshot` computed over the bounded active-window
 * trips with the 1-read `KpiSummaryDoc` so all-time, 30d, and MTD dashboard views
 * display accurate historical totals and daily bars without reading 45,000 trips.
 */
export function applyKpiSummaryToDashboardSnapshot(
  snapshot: OperationalIntelligenceSnapshot,
  kpiSummary: KpiSummaryDoc | null
): OperationalIntelligenceSnapshot {
  if (!kpiSummary) return snapshot;

  if (snapshot.window.preset === 'all') {
    const totalTripsCount = Math.max(snapshot.totalTripsCount, Number(kpiSummary.totalTrips || 0));
    const completedCount = Math.max(
      snapshot.completedCount,
      Number(kpiSummary.completedTrips || 0)
    );
    const cancelledCount = Math.max(
      snapshot.cancelledCount,
      Number(kpiSummary.cancelledTrips || 0)
    );
    const grossBookedRevenue = roundMoney(
      Math.max(snapshot.revenue.grossBookedRevenue, Number(kpiSummary.grossBookedRevenue || 0))
    );
    const completedRevenue = roundMoney(
      Math.max(snapshot.revenue.completedRevenue, Number(kpiSummary.completedRevenue || 0))
    );
    const tipsTotal = roundMoney(
      Math.max(snapshot.revenue.tipsTotal, Number(kpiSummary.tipsTotal || 0))
    );
    const billableCount = Math.max(1, totalTripsCount - cancelledCount);
    const avgFare = totalTripsCount > 0 ? roundMoney(grossBookedRevenue / billableCount) : 0;

    return {
      ...snapshot,
      totalTripsCount,
      completedCount,
      cancelledCount,
      revenue: {
        ...snapshot.revenue,
        grossBookedRevenue,
        completedRevenue,
        scheduledPipelineRevenue: roundMoney(Math.max(0, grossBookedRevenue - completedRevenue)),
        tipsTotal,
        avgFare,
      },
    };
  }

  if (
    snapshot.window.bucketGranularity === 'day' &&
    snapshot.window.startMs !== null &&
    snapshot.window.endMs !== null &&
    kpiSummary.dailyBuckets
  ) {
    const periodRollup = sumDailyBucketsInRange(
      kpiSummary.dailyBuckets,
      snapshot.window.startMs,
      snapshot.window.endMs
    );
    if (!periodRollup || periodRollup.trips <= snapshot.totalTripsCount) {
      return snapshot;
    }

    const totalTripsCount = Math.max(snapshot.totalTripsCount, periodRollup.trips);
    const completedCount = Math.max(snapshot.completedCount, periodRollup.completed);
    const cancelledCount = Math.max(snapshot.cancelledCount, periodRollup.cancelled);
    const grossBookedRevenue = roundMoney(
      Math.max(snapshot.revenue.grossBookedRevenue, periodRollup.grossRevenue)
    );
    const completedRevenue = roundMoney(
      Math.max(snapshot.revenue.completedRevenue, periodRollup.completedRevenue)
    );
    const tipsTotal = roundMoney(Math.max(snapshot.revenue.tipsTotal, periodRollup.tipsTotal));
    const billableCount = Math.max(1, totalTripsCount - cancelledCount);
    const avgFare = totalTripsCount > 0 ? roundMoney(grossBookedRevenue / billableCount) : 0;

    // Backfill daily timeSeries buckets older than the 7-day active trip window
    const mergedTimeSeries = snapshot.seriesAndBoards.timeSeries.map((bar) => {
      const dayBucket = kpiSummary.dailyBuckets?.[bar.key];
      if (!dayBucket) return bar;
      return {
        ...bar,
        trips: Math.max(bar.trips, Number(dayBucket.trips || 0)),
        revenue: roundMoney(Math.max(bar.revenue, Number(dayBucket.grossRevenue || 0))),
        completedRevenue: roundMoney(
          Math.max(bar.completedRevenue, Number(dayBucket.completedRevenue || 0))
        ),
      };
    });

    let deltas = snapshot.deltas;
    if (
      snapshot.hasPriorPeriodComparison &&
      snapshot.window.prevStartMs !== null &&
      snapshot.window.prevEndMs !== null
    ) {
      const prevRollup = sumDailyBucketsInRange(
        kpiSummary.dailyBuckets,
        snapshot.window.prevStartMs,
        snapshot.window.prevEndMs
      );
      if (prevRollup) {
        const prevBillable = Math.max(1, prevRollup.trips - prevRollup.cancelled);
        const prevAvg =
          prevRollup.trips > 0 ? roundMoney(prevRollup.grossRevenue / prevBillable) : 0;
        deltas = {
          ...deltas,
          bookings: computePercentDelta(totalTripsCount, prevRollup.trips),
          completed: computePercentDelta(completedCount, prevRollup.completed),
          grossRevenue: computePercentDelta(grossBookedRevenue, prevRollup.grossRevenue),
          avgFare: computePercentDelta(avgFare, prevAvg),
        };
      }
    }

    return {
      ...snapshot,
      totalTripsCount,
      completedCount,
      cancelledCount,
      revenue: {
        ...snapshot.revenue,
        grossBookedRevenue,
        completedRevenue,
        scheduledPipelineRevenue: roundMoney(Math.max(0, grossBookedRevenue - completedRevenue)),
        tipsTotal,
        avgFare,
      },
      seriesAndBoards: {
        ...snapshot.seriesAndBoards,
        timeSeries: mergedTimeSeries,
      },
      deltas,
    };
  }

  return snapshot;
}

class KpiSummaryService {
  private cachedSummary: KpiSummaryDoc | null = null;
  private lastFetchedAtMs = 0;
  private inflightFetch: Promise<KpiSummaryDoc | null> | null = null;
  private listeners = new Set<(summary: KpiSummaryDoc | null) => void>();

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      try {
        fn(this.cachedSummary);
      } catch {
        // Ignore subscriber callback errors
      }
    }
  }

  /**
   * Fetches `/analytics/kpiSummary` in strictly 1 Firestore document read
   * (with a 30-second in-memory cache).
   */
  public async getKpiSummary(options?: { forceRefresh?: boolean }): Promise<KpiSummaryDoc | null> {
    const now = Date.now();
    if (
      !options?.forceRefresh &&
      this.cachedSummary &&
      now - this.lastFetchedAtMs < KPI_CACHE_TTL_MS
    ) {
      return this.cachedSummary;
    }

    if (!isFirebaseConfigured()) {
      return this.cachedSummary;
    }

    if (this.inflightFetch && !options?.forceRefresh) {
      return this.inflightFetch;
    }

    this.inflightFetch = (async () => {
      try {
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, KPI_SUMMARY_COLLECTION, KPI_SUMMARY_DOC_ID));
        if (snap.exists()) {
          const raw = snap.data() as Partial<KpiSummaryDoc>;
          this.cachedSummary = {
            totalTrips: Number(raw.totalTrips || 0),
            completedTrips: Number(raw.completedTrips || 0),
            cancelledTrips: Number(raw.cancelledTrips || 0),
            activeOrPendingTrips: Math.max(0, Number(raw.activeOrPendingTrips || 0)),
            grossBookedRevenue: roundMoney(Number(raw.grossBookedRevenue || 0)),
            completedRevenue: roundMoney(Number(raw.completedRevenue || 0)),
            tipsTotal: roundMoney(Number(raw.tipsTotal || 0)),
            dailyBuckets: raw.dailyBuckets || {},
            ...(raw.contactsTotal !== undefined ? { contactsTotal: Number(raw.contactsTotal || 0) } : {}),
            ...(raw.contactsActive !== undefined ? { contactsActive: Number(raw.contactsActive || 0) } : {}),
            ...(raw.contactsArchived !== undefined ? { contactsArchived: Number(raw.contactsArchived || 0) } : {}),
            ...(raw.contactsBlacklisted !== undefined ? { contactsBlacklisted: Number(raw.contactsBlacklisted || 0) } : {}),
            ...(raw.contactsVip !== undefined ? { contactsVip: Number(raw.contactsVip || 0) } : {}),
            ...(raw.contactsByLetter ? { contactsByLetter: raw.contactsByLetter } : {}),
            updatedAt: String(raw.updatedAt || new Date().toISOString()),
            ...(raw.seededAt ? { seededAt: String(raw.seededAt) } : {}),
          };
          this.lastFetchedAtMs = Date.now();
          this.notifyListeners();
          return this.cachedSummary;
        }
      } catch (err) {
        console.warn('[KpiSummaryService] Unable to read analytics/kpiSummary:', err);
      } finally {
        this.inflightFetch = null;
      }
      return this.cachedSummary;
    })();

    return this.inflightFetch;
  }

  /**
   * Subscribes to in-memory KPI summary updates and triggers an initial 1-doc read
   * if not yet loaded (no continuous Firestore listener overhead).
   */
  public subscribeToKpiSummary(
    onUpdate: (summary: KpiSummaryDoc | null) => void
  ): () => void {
    this.listeners.add(onUpdate);
    if (this.cachedSummary) {
      onUpdate(this.cachedSummary);
    }
    void this.getKpiSummary().then((loaded) => {
      if (this.listeners.has(onUpdate)) {
        onUpdate(loaded);
      }
    });
    return () => {
      this.listeners.delete(onUpdate);
    };
  }

  private applyLocalDeltas(deltas: {
    dateKey: string;
    totalTrips?: number;
    completedTrips?: number;
    cancelledTrips?: number;
    activeOrPendingTrips?: number;
    grossBookedRevenue?: number;
    completedRevenue?: number;
    tipsTotal?: number;
    nowIso: string;
  }): void {
    const base: KpiSummaryDoc = this.cachedSummary ?? {
      totalTrips: 0,
      completedTrips: 0,
      cancelledTrips: 0,
      activeOrPendingTrips: 0,
      grossBookedRevenue: 0,
      completedRevenue: 0,
      tipsTotal: 0,
      dailyBuckets: {},
      updatedAt: deltas.nowIso,
    };

    const existingDay = base.dailyBuckets?.[deltas.dateKey] ?? {
      trips: 0,
      completed: 0,
      cancelled: 0,
      grossRevenue: 0,
      completedRevenue: 0,
      tipsTotal: 0,
    };

    const nextDay: KpiDailyBucket = {
      trips: Math.max(0, existingDay.trips + (deltas.totalTrips || 0)),
      completed: Math.max(0, existingDay.completed + (deltas.completedTrips || 0)),
      cancelled: Math.max(0, existingDay.cancelled + (deltas.cancelledTrips || 0)),
      grossRevenue: roundMoney(
        Math.max(0, existingDay.grossRevenue + (deltas.grossBookedRevenue || 0))
      ),
      completedRevenue: roundMoney(
        Math.max(0, existingDay.completedRevenue + (deltas.completedRevenue || 0))
      ),
      tipsTotal: roundMoney(Math.max(0, existingDay.tipsTotal + (deltas.tipsTotal || 0))),
    };

    this.cachedSummary = {
      ...base,
      totalTrips: Math.max(0, base.totalTrips + (deltas.totalTrips || 0)),
      completedTrips: Math.max(0, base.completedTrips + (deltas.completedTrips || 0)),
      cancelledTrips: Math.max(0, base.cancelledTrips + (deltas.cancelledTrips || 0)),
      activeOrPendingTrips: Math.max(
        0,
        base.activeOrPendingTrips + (deltas.activeOrPendingTrips || 0)
      ),
      grossBookedRevenue: roundMoney(
        Math.max(0, base.grossBookedRevenue + (deltas.grossBookedRevenue || 0))
      ),
      completedRevenue: roundMoney(
        Math.max(0, base.completedRevenue + (deltas.completedRevenue || 0))
      ),
      tipsTotal: roundMoney(Math.max(0, base.tipsTotal + (deltas.tipsTotal || 0))),
      dailyBuckets: {
        ...(base.dailyBuckets || {}),
        [deltas.dateKey]: nextDay,
      },
      updatedAt: deltas.nowIso,
    };

    this.notifyListeners();
  }

  private async persistIncrementDeltas(deltas: {
    dateKey: string;
    totalTrips?: number;
    completedTrips?: number;
    cancelledTrips?: number;
    activeOrPendingTrips?: number;
    grossBookedRevenue?: number;
    completedRevenue?: number;
    tipsTotal?: number;
    nowIso: string;
  }): Promise<void> {
    if (!isFirebaseConfigured()) return;

    const topPatch: Record<string, unknown> = {
      updatedAt: deltas.nowIso,
    };
    const dayPatch: Record<string, unknown> = {};

    if (deltas.totalTrips) {
      topPatch.totalTrips = increment(deltas.totalTrips);
      dayPatch.trips = increment(deltas.totalTrips);
    }
    if (deltas.completedTrips) {
      topPatch.completedTrips = increment(deltas.completedTrips);
      dayPatch.completed = increment(deltas.completedTrips);
    }
    if (deltas.cancelledTrips) {
      topPatch.cancelledTrips = increment(deltas.cancelledTrips);
      dayPatch.cancelled = increment(deltas.cancelledTrips);
    }
    if (deltas.activeOrPendingTrips) {
      topPatch.activeOrPendingTrips = increment(deltas.activeOrPendingTrips);
    }
    if (deltas.grossBookedRevenue) {
      topPatch.grossBookedRevenue = increment(roundMoney(deltas.grossBookedRevenue));
      dayPatch.grossRevenue = increment(roundMoney(deltas.grossBookedRevenue));
    }
    if (deltas.completedRevenue) {
      topPatch.completedRevenue = increment(roundMoney(deltas.completedRevenue));
      dayPatch.completedRevenue = increment(roundMoney(deltas.completedRevenue));
    }
    if (deltas.tipsTotal) {
      topPatch.tipsTotal = increment(roundMoney(deltas.tipsTotal));
      dayPatch.tipsTotal = increment(roundMoney(deltas.tipsTotal));
    }

    if (Object.keys(dayPatch).length > 0) {
      topPatch.dailyBuckets = {
        [deltas.dateKey]: dayPatch,
      };
    }

    try {
      const db = getFirestoreDb();
      await setDoc(doc(db, KPI_SUMMARY_COLLECTION, KPI_SUMMARY_DOC_ID), topPatch, {
        merge: true,
      });
    } catch {
      // Non-fatal: non-staff actors (guest web booking / driver app) may not have write access to /analytics
    }
  }

  /**
   * Atomically increments `analytics/kpiSummary` on new trip creation.
   */
  public async recordTripCreated(trip: Trip): Promise<void> {
    if (!trip || trip.isArchived) return;
    const nowIso = new Date().toISOString();
    const dateKey = resolveTripKpiDateKey(trip);
    const bucket = classifyTripBucket(trip);
    const fare = extractTripFare(trip);
    const tip = extractTripTip(trip);

    const deltas = {
      dateKey,
      nowIso,
      totalTrips: 1,
      completedTrips: bucket === 'completed' ? 1 : 0,
      cancelledTrips: bucket === 'cancelled' ? 1 : 0,
      activeOrPendingTrips: bucket === 'open' ? 1 : 0,
      grossBookedRevenue: bucket === 'cancelled' ? 0 : fare,
      completedRevenue: bucket === 'completed' ? fare : 0,
      tipsTotal: bucket === 'cancelled' ? 0 : tip,
    };

    if (this.cachedSummary || !isFirebaseConfigured()) {
      this.applyLocalDeltas(deltas);
    }
    await this.persistIncrementDeltas(deltas);
  }

  /**
   * Atomically updates `analytics/kpiSummary` when a trip transitions between
   * open, completed, and cancelled/declined states (or adjusts fare/tip on completion).
   */
  public async recordTripTransition(prevTrip: Trip, nextTrip: Trip): Promise<void> {
    if (!prevTrip || !nextTrip || nextTrip.isArchived) return;

    const prevBucket = classifyTripBucket(prevTrip);
    const nextBucket = classifyTripBucket(nextTrip);
    const prevFare = extractTripFare(prevTrip);
    const nextFare = extractTripFare(nextTrip);
    const prevTip = extractTripTip(prevTrip);
    const nextTip = extractTripTip(nextTrip);

    let completedDelta = 0;
    let cancelledDelta = 0;
    let activeDelta = 0;
    let grossDelta = 0;
    let completedRevDelta = 0;
    let tipDelta = 0;

    if (prevBucket === nextBucket) {
      if (nextBucket === 'completed') {
        grossDelta = roundMoney(nextFare - prevFare);
        completedRevDelta = roundMoney(nextFare - prevFare);
        tipDelta = roundMoney(nextTip - prevTip);
      } else if (nextBucket === 'open') {
        grossDelta = roundMoney(nextFare - prevFare);
        tipDelta = roundMoney(nextTip - prevTip);
      }
    } else if (prevBucket === 'open' && nextBucket === 'completed') {
      activeDelta = -1;
      completedDelta = 1;
      grossDelta = roundMoney(nextFare - prevFare);
      completedRevDelta = nextFare;
      tipDelta = roundMoney(nextTip - prevTip);
    } else if (prevBucket === 'open' && nextBucket === 'cancelled') {
      activeDelta = -1;
      cancelledDelta = 1;
      grossDelta = roundMoney(-prevFare);
      tipDelta = roundMoney(-prevTip);
    } else if (prevBucket === 'cancelled' && nextBucket === 'open') {
      cancelledDelta = -1;
      activeDelta = 1;
      grossDelta = nextFare;
      tipDelta = nextTip;
    } else if (prevBucket === 'cancelled' && nextBucket === 'completed') {
      cancelledDelta = -1;
      completedDelta = 1;
      grossDelta = nextFare;
      completedRevDelta = nextFare;
      tipDelta = nextTip;
    } else if (prevBucket === 'completed' && nextBucket === 'cancelled') {
      completedDelta = -1;
      cancelledDelta = 1;
      grossDelta = roundMoney(-prevFare);
      completedRevDelta = roundMoney(-prevFare);
      tipDelta = roundMoney(-prevTip);
    } else if (prevBucket === 'completed' && nextBucket === 'open') {
      completedDelta = -1;
      activeDelta = 1;
      grossDelta = roundMoney(nextFare - prevFare);
      completedRevDelta = roundMoney(-prevFare);
      tipDelta = roundMoney(nextTip - prevTip);
    }

    const hasAnyDelta =
      completedDelta !== 0 ||
      cancelledDelta !== 0 ||
      activeDelta !== 0 ||
      Math.abs(grossDelta) >= 0.01 ||
      Math.abs(completedRevDelta) >= 0.01 ||
      Math.abs(tipDelta) >= 0.01;

    if (!hasAnyDelta) return;

    const nowIso = new Date().toISOString();
    const dateKey = resolveTripKpiDateKey(nextTrip);
    const deltas = {
      dateKey,
      nowIso,
      completedTrips: completedDelta,
      cancelledTrips: cancelledDelta,
      activeOrPendingTrips: activeDelta,
      grossBookedRevenue: grossDelta,
      completedRevenue: completedRevDelta,
      tipsTotal: tipDelta,
    };

    if (this.cachedSummary || !isFirebaseConfigured()) {
      this.applyLocalDeltas(deltas);
    }
    await this.persistIncrementDeltas(deltas);
  }

  private async applyAndPersistContactDeltas(deltas: {
    total?: number;
    active?: number;
    archived?: number;
    blacklisted?: number;
    vip?: number;
    letters?: Record<string, number>;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const hasLetterDelta = Boolean(
      deltas.letters && Object.values(deltas.letters).some((v) => v !== 0)
    );
    const hasAnyDelta =
      Boolean(deltas.total) ||
      Boolean(deltas.active) ||
      Boolean(deltas.archived) ||
      Boolean(deltas.blacklisted) ||
      Boolean(deltas.vip) ||
      hasLetterDelta;
    if (!hasAnyDelta) return;

    if (this.cachedSummary) {
      const nextLetters = { ...(this.cachedSummary.contactsByLetter || {}) };
      if (deltas.letters) {
        for (const [letter, delta] of Object.entries(deltas.letters)) {
          if (delta) {
            nextLetters[letter] = Math.max(0, Number(nextLetters[letter] || 0) + delta);
          }
        }
      }
      this.cachedSummary = {
        ...this.cachedSummary,
        contactsTotal: Math.max(
          0,
          Number(this.cachedSummary.contactsTotal || 0) + (deltas.total || 0)
        ),
        contactsActive: Math.max(
          0,
          Number(this.cachedSummary.contactsActive || 0) + (deltas.active || 0)
        ),
        contactsArchived: Math.max(
          0,
          Number(this.cachedSummary.contactsArchived || 0) + (deltas.archived || 0)
        ),
        contactsBlacklisted: Math.max(
          0,
          Number(this.cachedSummary.contactsBlacklisted || 0) + (deltas.blacklisted || 0)
        ),
        contactsVip: Math.max(
          0,
          Number(this.cachedSummary.contactsVip || 0) + (deltas.vip || 0)
        ),
        contactsByLetter: nextLetters,
        updatedAt: nowIso,
      };
      this.notifyListeners();
    }

    if (!isFirebaseConfigured()) return;

    const patch: Record<string, unknown> = { updatedAt: nowIso };
    if (deltas.total) patch.contactsTotal = increment(deltas.total);
    if (deltas.active) patch.contactsActive = increment(deltas.active);
    if (deltas.archived) patch.contactsArchived = increment(deltas.archived);
    if (deltas.blacklisted) patch.contactsBlacklisted = increment(deltas.blacklisted);
    if (deltas.vip) patch.contactsVip = increment(deltas.vip);
    if (deltas.letters) {
      const letterPatch: Record<string, unknown> = {};
      for (const [letter, delta] of Object.entries(deltas.letters)) {
        if (delta) letterPatch[letter] = increment(delta);
      }
      if (Object.keys(letterPatch).length > 0) {
        patch.contactsByLetter = letterPatch;
      }
    }

    try {
      const db = getFirestoreDb();
      await setDoc(doc(db, KPI_SUMMARY_COLLECTION, KPI_SUMMARY_DOC_ID), patch, { merge: true });
    } catch {
      // Non-fatal if caller lacks /analytics write permissions
    }
  }

  public async recordContactCreated(contact: {
    name?: string | null;
    isArchived?: boolean;
    isBlacklisted?: boolean;
    isVip?: boolean;
  }): Promise<void> {
    const f = classifyContactFlags(contact);
    await this.applyAndPersistContactDeltas({
      total: 1,
      active: f.isActive ? 1 : 0,
      archived: f.isArchived ? 1 : 0,
      blacklisted: f.isBlacklisted ? 1 : 0,
      vip: f.isVip ? 1 : 0,
      letters: f.isBlacklisted ? {} : { [f.letterBucket]: 1 },
    });
  }

  public async recordContactTransition(
    prevContact: {
      name?: string | null;
      isArchived?: boolean;
      isBlacklisted?: boolean;
      isVip?: boolean;
    },
    nextContact: {
      name?: string | null;
      isArchived?: boolean;
      isBlacklisted?: boolean;
      isVip?: boolean;
    }
  ): Promise<void> {
    const prev = classifyContactFlags(prevContact);
    const next = classifyContactFlags(nextContact);

    const letters: Record<string, number> = {};
    if (!prev.isBlacklisted) {
      letters[prev.letterBucket] = (letters[prev.letterBucket] || 0) - 1;
    }
    if (!next.isBlacklisted) {
      letters[next.letterBucket] = (letters[next.letterBucket] || 0) + 1;
    }
    for (const key of Object.keys(letters)) {
      if (letters[key] === 0) delete letters[key];
    }

    await this.applyAndPersistContactDeltas({
      active: (next.isActive ? 1 : 0) - (prev.isActive ? 1 : 0),
      archived: (next.isArchived ? 1 : 0) - (prev.isArchived ? 1 : 0),
      blacklisted: (next.isBlacklisted ? 1 : 0) - (prev.isBlacklisted ? 1 : 0),
      vip: (next.isVip ? 1 : 0) - (prev.isVip ? 1 : 0),
      letters,
    });
  }

  public async recordContactDeleted(contact: {
    name?: string | null;
    isArchived?: boolean;
    isBlacklisted?: boolean;
    isVip?: boolean;
  }): Promise<void> {
    const f = classifyContactFlags(contact);
    await this.applyAndPersistContactDeltas({
      total: -1,
      active: f.isActive ? -1 : 0,
      archived: f.isArchived ? -1 : 0,
      blacklisted: f.isBlacklisted ? -1 : 0,
      vip: f.isVip ? -1 : 0,
      letters: f.isBlacklisted ? {} : { [f.letterBucket]: -1 },
    });
  }
}

let kpiSummaryServiceInstance: KpiSummaryService | null = null;

export function getKpiSummaryService(): KpiSummaryService {
  if (!kpiSummaryServiceInstance) {
    kpiSummaryServiceInstance = new KpiSummaryService();
  }
  return kpiSummaryServiceInstance;
}
