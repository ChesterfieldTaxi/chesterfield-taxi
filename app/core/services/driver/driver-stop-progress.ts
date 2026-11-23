import type { UniversalExtrasConfig } from '../../types/config';
import type { DriverMeterExtra } from '../../types/driver';
import type { PriceLineItem, Trip, TripLocation, TripPricing } from '../../types/trip';

export type DriverStopStepStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

export interface TripStopProgressEntry {
  stopIndex: number; // 0-based index into trip.intermediateStops
  address: string;
  status: DriverStopStepStatus;
  arrivedAt?: string;
  departedAt?: string;
  waitedSeconds?: number;
  freeAllowanceMinutes?: number;
  excessWaitSeconds?: number;
  waitFeeAdded?: number;
  waitFeeExtraId?: string;
}

export interface TripStopProgressSummary {
  entries: TripStopProgressEntry[];
  totalStops: number;
  completedCount: number;
  skippedCount: number;
  openCount: number;
  activeArrivedEntry: TripStopProgressEntry | null;
  nextPendingEntry: TripStopProgressEntry | null;
  allStopsCompleted: boolean;
  completedIndicesSet: ReadonlySet<number>;
}

export interface StopWaitTimerState {
  freeMinutes: number;
  freeSeconds: number;
  perMinuteRate: number;
  elapsedSeconds: number;
  remainingFreeSeconds: number;
  isOverFreeWindow: boolean;
  excessSeconds: number;
  excessBillableMinutes: number;
  suggestedWaitFee: number;
}

const VALID_STOP_STATUSES = new Set<DriverStopStepStatus>([
  'pending',
  'arrived',
  'completed',
  'skipped',
]);

function isValidStopLocation(stop: TripLocation | null | undefined): stop is TripLocation {
  if (!stop) return false;
  if (typeof stop.address === 'string' && stop.address.trim().length > 0) return true;
  if (
    stop.coordinates &&
    typeof stop.coordinates.lat === 'number' &&
    typeof stop.coordinates.lng === 'number' &&
    Number.isFinite(stop.coordinates.lat) &&
    Number.isFinite(stop.coordinates.lng)
  ) {
    return true;
  }
  return false;
}

function sanitizeStopEntry(
  stopIndex: number,
  address: string,
  raw?: Partial<TripStopProgressEntry> | null
): TripStopProgressEntry {
  const status: DriverStopStepStatus =
    raw?.status && VALID_STOP_STATUSES.has(raw.status) ? raw.status : 'pending';

  const entry: TripStopProgressEntry = {
    stopIndex,
    address,
    status,
  };

  if (typeof raw?.arrivedAt === 'string' && raw.arrivedAt.trim()) {
    entry.arrivedAt = raw.arrivedAt.trim();
  }
  if (typeof raw?.departedAt === 'string' && raw.departedAt.trim()) {
    entry.departedAt = raw.departedAt.trim();
  }
  if (typeof raw?.waitedSeconds === 'number' && Number.isFinite(raw.waitedSeconds)) {
    entry.waitedSeconds = Math.max(0, Math.floor(raw.waitedSeconds));
  }
  if (typeof raw?.freeAllowanceMinutes === 'number' && Number.isFinite(raw.freeAllowanceMinutes)) {
    entry.freeAllowanceMinutes = Math.max(0, raw.freeAllowanceMinutes);
  }
  if (typeof raw?.excessWaitSeconds === 'number' && Number.isFinite(raw.excessWaitSeconds)) {
    entry.excessWaitSeconds = Math.max(0, Math.floor(raw.excessWaitSeconds));
  }
  if (typeof raw?.waitFeeAdded === 'number' && Number.isFinite(raw.waitFeeAdded)) {
    entry.waitFeeAdded = Number(Math.max(0, raw.waitFeeAdded).toFixed(2));
  }
  if (typeof raw?.waitFeeExtraId === 'string' && raw.waitFeeExtraId.trim()) {
    entry.waitFeeExtraId = raw.waitFeeExtraId.trim();
  }

  return entry;
}

/**
 * Aligns `trip.intermediateStops` safely with any saved `trip.metadata?.stopProgress` entries,
 * preserving each stop's 0-based `stopIndex` into `trip.intermediateStops`.
 */
export function normalizeTripStopProgress(
  trip: Trip | null | undefined
): TripStopProgressEntry[] {
  if (!trip || !Array.isArray(trip.intermediateStops) || trip.intermediateStops.length === 0) {
    return [];
  }

  const meta = (trip.metadata || {}) as Record<string, unknown>;
  const rawSavedList = Array.isArray(meta.stopProgress) ? meta.stopProgress : [];
  const savedByIndex = new Map<number, Partial<TripStopProgressEntry>>();

  for (const item of rawSavedList) {
    if (item && typeof item === 'object') {
      const candidate = item as Partial<TripStopProgressEntry>;
      if (typeof candidate.stopIndex === 'number' && Number.isInteger(candidate.stopIndex)) {
        savedByIndex.set(candidate.stopIndex, candidate);
      }
    }
  }

  const normalized: TripStopProgressEntry[] = [];
  trip.intermediateStops.forEach((stop, stopIndex) => {
    if (!isValidStopLocation(stop)) return;
    const cleanAddr =
      (stop.address || '').trim() ||
      (stop.coordinates ? `${stop.coordinates.lat},${stop.coordinates.lng}` : `Stop #${stopIndex + 1}`);
    const saved = savedByIndex.get(stopIndex);
    normalized.push(sanitizeStopEntry(stopIndex, cleanAddr, saved));
  });

  return normalized;
}

/**
 * Computes derived progression counters, active arrived stop, next pending stop,
 * and `completedIndicesSet` (covering `'completed'` and `'skipped'` stops).
 */
export function summarizeTripStopProgress(
  trip: Trip | null | undefined
): TripStopProgressSummary {
  const entries = normalizeTripStopProgress(trip);
  const completedIndices = new Set<number>();
  let completedCount = 0;
  let skippedCount = 0;
  let activeArrivedEntry: TripStopProgressEntry | null = null;
  let nextPendingEntry: TripStopProgressEntry | null = null;

  for (const entry of entries) {
    if (entry.status === 'completed' || entry.status === 'skipped') {
      completedIndices.add(entry.stopIndex);
      completedCount += 1;
      if (entry.status === 'skipped') {
        skippedCount += 1;
      }
    } else if (entry.status === 'arrived' && !activeArrivedEntry) {
      activeArrivedEntry = entry;
    } else if (entry.status === 'pending' && !nextPendingEntry) {
      nextPendingEntry = entry;
    }
  }

  const totalStops = entries.length;
  const openCount = Math.max(0, totalStops - completedCount);

  return {
    entries,
    totalStops,
    completedCount,
    skippedCount,
    openCount,
    activeArrivedEntry,
    nextPendingEntry,
    allStopsCompleted: entries.every((e) => e.status === 'completed' || e.status === 'skipped'),
    completedIndicesSet: completedIndices,
  };
}

/**
 * Pure, deterministic free-wait & overtime fee calculator for an intermediate stop.
 */
export function computeStopWaitTimerState(
  entry: TripStopProgressEntry | null | undefined,
  nowMs: number,
  extrasConfig?: Partial<UniversalExtrasConfig>
): StopWaitTimerState {
  const rawFreeMinutes = extrasConfig?.intermediateStopFreeWaitingMinutes ?? 5;
  const freeMinutes = Math.max(
    0,
    Number.isFinite(Number(rawFreeMinutes)) ? Number(rawFreeMinutes) : 5
  );
  const freeSeconds = Math.round(freeMinutes * 60);

  const rawRate =
    extrasConfig?.curbWaitingRatePerMinute ?? extrasConfig?.waitingRatePerMinute ?? 0.5;
  const perMinuteRate = Math.max(0, Number.isFinite(Number(rawRate)) ? Number(rawRate) : 0.5);

  let elapsedSeconds = 0;
  if (entry) {
    if (entry.status === 'arrived') {
      const arrivedMs = entry.arrivedAt ? Date.parse(entry.arrivedAt) : NaN;
      if (Number.isFinite(arrivedMs) && Number.isFinite(nowMs)) {
        elapsedSeconds = Math.max(0, Math.floor((nowMs - arrivedMs) / 1000));
      }
    } else if (entry.status === 'completed') {
      if (typeof entry.waitedSeconds === 'number' && Number.isFinite(entry.waitedSeconds)) {
        elapsedSeconds = Math.max(0, Math.floor(entry.waitedSeconds));
      } else if (entry.arrivedAt && entry.departedAt) {
        const arrivedMs = Date.parse(entry.arrivedAt);
        const departedMs = Date.parse(entry.departedAt);
        if (Number.isFinite(arrivedMs) && Number.isFinite(departedMs)) {
          elapsedSeconds = Math.max(0, Math.floor((departedMs - arrivedMs) / 1000));
        }
      }
    }
  }

  const remainingFreeSeconds = Math.max(0, freeSeconds - elapsedSeconds);
  const isOverFreeWindow = elapsedSeconds > freeSeconds;
  const excessSeconds = Math.max(0, elapsedSeconds - freeSeconds);
  const excessBillableMinutes = excessSeconds > 0 ? Math.ceil(excessSeconds / 60) : 0;
  const suggestedWaitFee = Number((excessBillableMinutes * perMinuteRate).toFixed(2));

  return {
    freeMinutes,
    freeSeconds,
    perMinuteRate,
    elapsedSeconds,
    remainingFreeSeconds,
    isOverFreeWindow,
    excessSeconds,
    excessBillableMinutes,
    suggestedWaitFee,
  };
}

/**
 * Builds a deterministic `DriverMeterExtra` for excess intermediate-stop curb wait.
 */
export function buildStopWaitDriverExtra(params: {
  tripId: string;
  stopNumber: number;
  excessBillableMinutes: number;
  freeMinutes: number;
  amount: number;
  nowIso: string;
}): DriverMeterExtra {
  const cleanAmount = Number(Math.max(0, Number(params.amount || 0)).toFixed(2));
  return {
    id: `stop-wait-${params.tripId}-stop-${params.stopNumber}`,
    name: `Stop #${params.stopNumber} Wait (${params.excessBillableMinutes}m past ${params.freeMinutes}m free)`,
    amount: cleanAmount,
    category: 'custom',
  };
}

/**
 * Idempotently appends a `DriverMeterExtra` to `trip.pricing` & `trip.meterExtras`,
 * matching `DriverService.addMeterExtra` and `computeRideFareSnapshot` so `driverExtras`
 * never double-count on either quoted-locked or walk-up metered trips.
 */
export function appendDriverExtraToTripPricing(
  trip: Trip,
  extra: DriverMeterExtra
): { pricing: TripPricing; meterExtras: DriverMeterExtra[]; added: boolean } {
  const currentExtras: DriverMeterExtra[] = (
    trip.pricing?.driverExtras ||
    trip.meterExtras ||
    []
  ).map((item) => ({
    id: item.id,
    name: item.name,
    amount: Number(Number(item.amount || 0).toFixed(2)),
    category: (item.category as DriverMeterExtra['category']) || 'custom',
  }));

  if (currentExtras.some((e) => e.id === extra.id)) {
    return {
      pricing: trip.pricing,
      meterExtras: currentExtras,
      added: false,
    };
  }

  const cleanAmount = Number(Math.max(0, Number(extra.amount || 0)).toFixed(2));
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return {
      pricing: trip.pricing,
      meterExtras: currentExtras,
      added: false,
    };
  }

  const cleanExtra: DriverMeterExtra = {
    ...extra,
    name: extra.name.trim() || 'In-Car Extra',
    amount: cleanAmount,
  };

  const existingExtrasSum = Number(
    currentExtras.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  );
  const priorExtrasTotal =
    typeof trip.pricing?.driverExtrasTotal === 'number' &&
    Number.isFinite(trip.pricing.driverExtrasTotal)
      ? trip.pricing.driverExtrasTotal
      : existingExtrasSum;

  const updatedExtras = [...currentExtras, cleanExtra];
  const driverExtrasTotal = Number(
    updatedExtras.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  );

  const rawTotalFare = Number(trip.pricing?.totalFare || 0);
  const baseTotalWithoutDriverExtras = Number(
    Math.max(0, rawTotalFare - priorExtrasTotal).toFixed(2)
  );
  const newTotalFare = Number((baseTotalWithoutDriverExtras + driverExtrasTotal).toFixed(2));

  const existingBreakdown: PriceLineItem[] =
    Array.isArray(trip.pricing?.breakdown) && trip.pricing.breakdown.length > 0
      ? [...trip.pricing.breakdown]
      : [
          {
            id: 'base-quoted-fare',
            label: 'Base Fare',
            amount: baseTotalWithoutDriverExtras,
            category: 'base',
          },
        ];

  const extraLineItemId = `driver-extra-${cleanExtra.id}`;
  const nextBreakdown = existingBreakdown.some((li) => li.id === extraLineItemId)
    ? existingBreakdown
    : [
        ...existingBreakdown,
        {
          id: extraLineItemId,
          label: cleanExtra.name,
          amount: cleanExtra.amount,
          category: cleanExtra.category === 'toll' ? ('surcharge' as const) : ('extra' as const),
          detail: cleanExtra.category === 'toll' ? 'In-Car Toll' : `In-Car ${cleanExtra.category}`,
        },
      ];

  const updatedPricing: TripPricing = {
    ...trip.pricing,
    driverExtras: updatedExtras,
    driverExtrasTotal,
    totalFare: newTotalFare,
    breakdown: nextBreakdown,
  };

  return {
    pricing: updatedPricing,
    meterExtras: updatedExtras,
    added: true,
  };
}

/**
 * Reverses an appended `DriverMeterExtra` by `extraId` when a driver taps Undo on a completed stop.
 */
export function removeDriverExtraFromTripPricing(
  trip: Trip,
  extraId: string
): { pricing: TripPricing; meterExtras: DriverMeterExtra[]; removed: boolean } {
  const currentExtras: DriverMeterExtra[] = (
    trip.pricing?.driverExtras ||
    trip.meterExtras ||
    []
  ).map((item) => ({
    id: item.id,
    name: item.name,
    amount: Number(Number(item.amount || 0).toFixed(2)),
    category: (item.category as DriverMeterExtra['category']) || 'custom',
  }));

  if (!extraId || !currentExtras.some((e) => e.id === extraId)) {
    return {
      pricing: trip.pricing,
      meterExtras: currentExtras,
      removed: false,
    };
  }

  const existingExtrasSum = Number(
    currentExtras.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  );
  const priorExtrasTotal =
    typeof trip.pricing?.driverExtrasTotal === 'number' &&
    Number.isFinite(trip.pricing.driverExtrasTotal)
      ? trip.pricing.driverExtrasTotal
      : existingExtrasSum;

  const remainingExtras = currentExtras.filter((e) => e.id !== extraId);
  const driverExtrasTotal = Number(
    remainingExtras.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  );

  const rawTotalFare = Number(trip.pricing?.totalFare || 0);
  const baseTotalWithoutDriverExtras = Number(
    Math.max(0, rawTotalFare - priorExtrasTotal).toFixed(2)
  );
  const newTotalFare = Number((baseTotalWithoutDriverExtras + driverExtrasTotal).toFixed(2));

  const extraLineItemId = `driver-extra-${extraId}`;
  const nextBreakdown = Array.isArray(trip.pricing?.breakdown)
    ? trip.pricing.breakdown.filter((li) => li.id !== extraLineItemId)
    : undefined;

  const updatedPricing: TripPricing = {
    ...trip.pricing,
    driverExtras: remainingExtras,
    driverExtrasTotal,
    totalFare: newTotalFare,
    ...(nextBreakdown ? { breakdown: nextBreakdown } : {}),
  };

  return {
    pricing: updatedPricing,
    meterExtras: remainingExtras,
    removed: true,
  };
}

/**
 * Pure builder for marking `stopIndex` as `'arrived'` (auto-completing any previously `'arrived'` stop).
 */
export function buildArriveAtStopUpdate(
  trip: Trip,
  stopIndex: number,
  nowIso: string,
  extrasConfig?: Partial<UniversalExtrasConfig>
): Partial<Trip> {
  const nowMs = Date.parse(nowIso);
  const entries = normalizeTripStopProgress(trip);

  const nextEntries = entries.map((entry) => {
    if (entry.stopIndex === stopIndex) {
      return sanitizeStopEntry(entry.stopIndex, entry.address, {
        ...entry,
        status: 'arrived',
        arrivedAt: nowIso,
        departedAt: undefined,
      });
    }
    if (entry.status === 'arrived') {
      const priorTimer = computeStopWaitTimerState(
        entry,
        Number.isFinite(nowMs) ? nowMs : Date.now(),
        extrasConfig
      );
      return sanitizeStopEntry(entry.stopIndex, entry.address, {
        ...entry,
        status: 'completed',
        arrivedAt: entry.arrivedAt || nowIso,
        departedAt: nowIso,
        waitedSeconds: priorTimer.elapsedSeconds,
        freeAllowanceMinutes: priorTimer.freeMinutes,
        excessWaitSeconds: priorTimer.excessSeconds,
      });
    }
    return entry;
  });

  return {
    metadata: {
      ...(trip.metadata || {}),
      stopProgress: nextEntries,
    },
  };
}

/**
 * Pure builder for completing an intermediate stop and optionally attaching its suggested wait fee.
 */
export function buildCompleteStopUpdate(params: {
  trip: Trip;
  stopIndex: number;
  nowIso: string;
  extrasConfig?: Partial<UniversalExtrasConfig>;
  applySuggestedWaitFee?: boolean;
}): {
  updates: Partial<Trip>;
  waitFeeApplied: number;
  waitFeeExtra: DriverMeterExtra | null;
} {
  const { trip, stopIndex, nowIso, extrasConfig, applySuggestedWaitFee = false } = params;
  const nowMs = Date.parse(nowIso);
  const entries = normalizeTripStopProgress(trip);
  const ordinalIdx = entries.findIndex((e) => e.stopIndex === stopIndex);
  if (ordinalIdx < 0) {
    return {
      updates: { metadata: { ...(trip.metadata || {}), stopProgress: entries } },
      waitFeeApplied: 0,
      waitFeeExtra: null,
    };
  }

  const target = entries[ordinalIdx];
  const displayStopNumber = ordinalIdx + 1;
  const timer = computeStopWaitTimerState(
    target.status === 'arrived'
      ? target
      : { ...target, status: 'arrived', arrivedAt: target.arrivedAt || nowIso },
    Number.isFinite(nowMs) ? nowMs : Date.now(),
    extrasConfig
  );

  let waitFeeApplied = 0;
  let waitFeeExtra: DriverMeterExtra | null = null;
  let pricingPatch: { pricing: TripPricing; meterExtras: DriverMeterExtra[] } | null = null;

  let nextWaitFeeAdded = target.waitFeeAdded;
  let nextWaitFeeExtraId = target.waitFeeExtraId;

  if (applySuggestedWaitFee && timer.suggestedWaitFee > 0 && !target.waitFeeExtraId) {
    const candidateExtra = buildStopWaitDriverExtra({
      tripId: trip.id,
      stopNumber: displayStopNumber,
      excessBillableMinutes: timer.excessBillableMinutes,
      freeMinutes: timer.freeMinutes,
      amount: timer.suggestedWaitFee,
      nowIso,
    });
    const extraResult = appendDriverExtraToTripPricing(trip, candidateExtra);
    nextWaitFeeExtraId = candidateExtra.id;
    nextWaitFeeAdded = candidateExtra.amount;
    if (extraResult.added) {
      pricingPatch = {
        pricing: extraResult.pricing,
        meterExtras: extraResult.meterExtras,
      };
      waitFeeApplied = candidateExtra.amount;
      waitFeeExtra = candidateExtra;
    }
  }

  const updatedEntry = sanitizeStopEntry(target.stopIndex, target.address, {
    ...target,
    status: 'completed',
    arrivedAt: target.arrivedAt || nowIso,
    departedAt: nowIso,
    waitedSeconds: timer.elapsedSeconds,
    freeAllowanceMinutes: timer.freeMinutes,
    excessWaitSeconds: timer.excessSeconds,
    waitFeeAdded: nextWaitFeeAdded,
    waitFeeExtraId: nextWaitFeeExtraId,
  });

  const nextEntries = entries.map((e, i) => (i === ordinalIdx ? updatedEntry : e));

  return {
    updates: {
      metadata: {
        ...(trip.metadata || {}),
        stopProgress: nextEntries,
      },
      ...(pricingPatch
        ? {
            pricing: pricingPatch.pricing,
            meterExtras: pricingPatch.meterExtras,
          }
        : {}),
    },
    waitFeeApplied,
    waitFeeExtra,
  };
}

/**
 * Pure builder for skipping an intermediate stop.
 */
export function buildSkipStopUpdate(
  trip: Trip,
  stopIndex: number,
  nowIso: string
): Partial<Trip> {
  const entries = normalizeTripStopProgress(trip);
  const nextEntries = entries.map((entry) => {
    if (entry.stopIndex !== stopIndex) return entry;
    return sanitizeStopEntry(entry.stopIndex, entry.address, {
      stopIndex: entry.stopIndex,
      address: entry.address,
      status: 'skipped',
      departedAt: nowIso,
      waitedSeconds: 0,
      excessWaitSeconds: 0,
    });
  });

  return {
    metadata: {
      ...(trip.metadata || {}),
      stopProgress: nextEntries,
    },
  };
}

/**
 * Pure builder for resetting an intermediate stop back to `'pending'` (1-tap Undo),
 * cleanly reversing any wait-fee extra that was attached by that stop.
 */
export function buildResetStopToPendingUpdate(
  trip: Trip,
  stopIndex: number
): Partial<Trip> {
  const entries = normalizeTripStopProgress(trip);
  const target = entries.find((e) => e.stopIndex === stopIndex);

  let pricingPatch: { pricing: TripPricing; meterExtras: DriverMeterExtra[] } | null = null;
  if (target?.waitFeeExtraId) {
    const removal = removeDriverExtraFromTripPricing(trip, target.waitFeeExtraId);
    if (removal.removed) {
      pricingPatch = {
        pricing: removal.pricing,
        meterExtras: removal.meterExtras,
      };
    }
  }

  const nextEntries = entries.map((entry) =>
    entry.stopIndex === stopIndex
      ? sanitizeStopEntry(entry.stopIndex, entry.address, {
          stopIndex: entry.stopIndex,
          address: entry.address,
          status: 'pending',
        })
      : entry
  );

  return {
    metadata: {
      ...(trip.metadata || {}),
      stopProgress: nextEntries,
    },
    ...(pricingPatch
      ? {
          pricing: pricingPatch.pricing,
          meterExtras: pricingPatch.meterExtras,
        }
      : {}),
  };
}
