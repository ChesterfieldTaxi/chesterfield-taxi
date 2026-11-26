/**
 * Multi-Role Payouts, Earnings Rollup, GL Journal Mapping & CSV Export Service (`payouts.service.ts` — Phase 60)
 *
 * Strictly pure TypeScript module:
 * - Zero React, DOM, Firebase SDK, Node `fs`/`crypto`, or `*.server` imports.
 * - Deterministic & SSR-safe via injectable `nowMs?: number`.
 * - Powers Driver, Staff/Dispatcher, and Other Payee (Affiliate/Contractor/Vendor/Concierge)
 *   settlements, QuickBooks/GL journal entries, and formula-safe RFC-4180 CSV exports.
 */

import {
  DEFAULT_COMMISSIONABLE_FARE_COMPONENTS,
  normalizeBillingSettingsConfig,
  type BillingSettingsConfig,
  type CommissionableFareComponent,
  type CustomPayeeCategory,
  type CustomPayeeRateType,
  type PayoutPayeeRecord,
  type PayoutPayeeType,
  type PayoutSettlementRecord,
} from '../types/config';
import type {
  DriverCarOwnership,
  DriverPayoutType,
  FlatPayoutPeriod,
  PaymentTypeCommissionRates,
} from '../types/driver';
import type { FinancialLedgerEntry, LedgerEntryType } from '../types/invoicing';
import type { Trip } from '../types/trip';
import { escapeCsvCell } from './analytics/operational-intelligence.service';
import type { DriverRosterItem, OperatorUser } from './operator.service';

export type PayoutPeriodPreset = '7d' | '14d' | '30d' | 'mtd' | 'all';

export interface PayoutPeriodWindow {
  preset: PayoutPeriodPreset;
  startMs: number | null;
  endMs: number | null;
  periodStart: string;
  periodEnd: string;
  label: string;
  settlements?: ReadonlyArray<PayoutSettlementRecord>;
  commissionOverrides?: Record<string, number>;
  nowMs?: number;
}

export type PayoutPeriodInput =
  | PayoutPeriodPreset
  | Partial<PayoutPeriodWindow>
  | null
  | undefined;

export interface ExtractedTripFareComponents {
  baseFare: number;
  extras: number;
  waitDelay: number;
  surcharges: number;
  tolls: number;
  tips: number;
  grossFareExTipAndTolls: number;
}

export interface DriverPayoutOverrideInput {
  carOwnership?: DriverCarOwnership;
  payoutType?: DriverPayoutType;
  flatPayoutPeriod?: FlatPayoutPeriod;
  flatPayoutAmount?: number;
  commissionPercent?: number | null;
  paymentTypeCommissionRates?: PaymentTypeCommissionRates;
}

export interface DriverEarningsRollupRow {
  driverId: string;
  driverName: string;
  cabNumber?: string;
  carOwnership: DriverCarOwnership;
  payoutType: DriverPayoutType;
  flatPayoutPeriod: FlatPayoutPeriod;
  flatPayoutAmount: number;
  flatPeriodMultiplier: number;
  calendarDays: number;
  tripCount: number;
  grossFares: number;
  commissionableBaseAmount: number;
  tips: number;
  tollsReimbursed: number;
  commissionPercent: number;
  effectivePaymentTypePercents: {
    cash: number;
    card: number;
    account: number;
  };
  driverFareShare: number;
  platformFee: number;
  totalEarned: number;
  alreadySettledAmount: number;
  pendingSettlementAmount: number;
  netPayout: number;
  owesCompanyAmount: number;
  periodStart: string;
  periodEnd: string;
}

export type StaffHoursInputValue =
  | number
  | {
      hours: number;
      adjustments?: number;
      dispatchedCountOverride?: number;
    };

export interface StaffPayoutPreviewRow {
  operatorId: string;
  operatorName: string;
  operatorEmail: string;
  roleLabel: string;
  hoursWorked: number;
  hourlyRate: number;
  dispatchedTripsCount: number;
  perBookingBonusAmount: number;
  baseWageAmount: number;
  bookingBonusAmount: number;
  adjustmentsAmount: number;
  alreadySettledAmount: number;
  netPayoutAmount: number;
  periodStart: string;
  periodEnd: string;
}

export interface OtherPayeeSettlementPreview {
  payeeId: string;
  payeeName: string;
  category: CustomPayeeCategory;
  rateType: CustomPayeeRateType;
  rateValue: number;
  baseVolumeOrHours: number;
  grossAmount: number;
  adjustmentsAmount: number;
  netPayoutAmount: number;
}

export interface ExportedPayoutsCsv {
  fileName: string;
  mimeType: string;
  csvContent: string;
  rowCount: number;
  totalNetPayout: number;
}

const CANCELLED_OR_DECLINED = new Set<string>(['cancelled', 'declined', 'DECLINED']);

function roundMoney(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number(val.toFixed(2));
}

function clampCommissionPercent(val: unknown, fallback = 75): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Number(num.toFixed(2))));
}

function toIsoDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Resolves a deterministic `PayoutPeriodWindow` from a preset or partial window object.
 */
export function resolvePayoutPeriodWindow(
  input?: PayoutPeriodInput,
  nowMsInput?: number
): PayoutPeriodWindow {
  const nowMs =
    typeof nowMsInput === 'number' && Number.isFinite(nowMsInput)
      ? nowMsInput
      : typeof input === 'object' && input !== null && typeof input.nowMs === 'number'
      ? input.nowMs
      : Date.now();

  if (typeof input === 'object' && input !== null && (input.periodStart || input.startMs !== undefined)) {
    const startMs =
      input.startMs !== undefined
        ? input.startMs
        : input.periodStart
        ? Date.parse(`${input.periodStart}T00:00:00.000Z`)
        : null;
    const endMs =
      input.endMs !== undefined
        ? input.endMs
        : input.periodEnd
        ? Date.parse(`${input.periodEnd}T23:59:59.999Z`)
        : nowMs;
    const safeStartMs = startMs !== null && Number.isFinite(startMs) ? startMs : null;
    const safeEndMs = endMs !== null && Number.isFinite(endMs) ? endMs : nowMs;
    const periodStart =
      input.periodStart || (safeStartMs !== null ? toIsoDateStr(safeStartMs) : '2020-01-01');
    const periodEnd = input.periodEnd || toIsoDateStr(safeEndMs ?? nowMs);

    return {
      preset: input.preset || 'all',
      startMs: safeStartMs,
      endMs: safeEndMs,
      periodStart,
      periodEnd,
      label: input.label || `${periodStart} – ${periodEnd}`,
      settlements: input.settlements,
      commissionOverrides: input.commissionOverrides,
      nowMs,
    };
  }

  const preset: PayoutPeriodPreset =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object' && input.preset
      ? input.preset
      : '30d';

  const settlements =
    input && typeof input === 'object' ? input.settlements : undefined;
  const commissionOverrides =
    input && typeof input === 'object' ? input.commissionOverrides : undefined;

  const endStr = toIsoDateStr(nowMs);

  if (preset === 'all') {
    return {
      preset: 'all',
      startMs: null,
      endMs: null,
      periodStart: 'All-Time',
      periodEnd: endStr,
      label: 'All Available Periods',
      settlements,
      commissionOverrides,
      nowMs,
    };
  }

  if (preset === 'mtd') {
    const nowDt = new Date(nowMs);
    const monthStartMs = Date.UTC(nowDt.getUTCFullYear(), nowDt.getUTCMonth(), 1, 0, 0, 0, 0);
    return {
      preset: 'mtd',
      startMs: monthStartMs,
      endMs: nowMs,
      periodStart: toIsoDateStr(monthStartMs),
      periodEnd: endStr,
      label: 'Month to Date',
      settlements,
      commissionOverrides,
      nowMs,
    };
  }

  const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
  const startMs = nowMs - days * 86_400_000;
  return {
    preset,
    startMs,
    endMs: nowMs,
    periodStart: toIsoDateStr(startMs),
    periodEnd: endStr,
    label: `Last ${days} Days`,
    settlements,
    commissionOverrides,
    nowMs,
  };
}

function resolveTripTimestampMs(trip: Trip): number | null {
  const raw =
    trip.completedAt ||
    trip.actualPickupTime ||
    trip.scheduledPickupTime ||
    trip.createdAt;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTimestampWithinWindow(tsMs: number | null, periodWin: PayoutPeriodWindow): boolean {
  if (periodWin.startMs === null && periodWin.endMs === null) return true;
  if (tsMs === null) return false;
  if (periodWin.startMs !== null && tsMs < periodWin.startMs) return false;
  if (periodWin.endMs !== null && tsMs > periodWin.endMs) return false;
  return true;
}

function doesSettlementOverlapWindow(
  settlement: PayoutSettlementRecord,
  periodWin: PayoutPeriodWindow
): boolean {
  if (periodWin.startMs === null && periodWin.endMs === null) return true;
  const refStr = settlement.paidAt || settlement.periodEnd || settlement.createdAt;
  if (!refStr) return true;
  const refMs = Date.parse(refStr.length === 10 ? `${refStr}T12:00:00.000Z` : refStr);
  if (!Number.isFinite(refMs)) return true;
  if (periodWin.startMs !== null && refMs < periodWin.startMs) return false;
  if (periodWin.endMs !== null && refMs > periodWin.endMs + 86_400_000) return false;
  return true;
}

/**
 * Extracts itemized fare components from a completed `Trip`:
 * `baseFare`, `extras`, `waitDelay`, `surcharges`, `tolls`, `tips`, and `grossFareExTipAndTolls`.
 */
export function extractTripFareComponents(trip: Trip): ExtractedTripFareComponents {
  const p = trip.pricing;
  const driverExtras = p?.driverExtras || [];

  const driverTollSum = driverExtras
    .filter((ex) => ex.category === 'toll')
    .reduce((sum, ex) => sum + Math.max(0, Number(ex.amount || 0)), 0);

  const tolls = roundMoney(
    Math.max(
      driverTollSum,
      Math.max(0, Number(p?.tollsFee || 0)),
      Math.max(0, Number(trip.payment?.tollsAmount || 0))
    )
  );

  const tips = roundMoney(Math.max(0, Number(trip.payment?.tipAmount || 0)));

  const rawTotalBeforeTip =
    p?.totalFare !== undefined && Number(p.totalFare) > 0
      ? Number(p.totalFare)
      : p?.meterCalculatedFare && Number(p.meterCalculatedFare) > 0
      ? Number(p.meterCalculatedFare)
      : Math.max(0, Number(trip.payment?.amount || 0) - tips);

  const grossFareExTipAndTolls = roundMoney(Math.max(0, rawTotalBeforeTip - tolls));

  const driverNonTollExtrasSum = driverExtras
    .filter((ex) => ex.category !== 'toll')
    .reduce((sum, ex) => sum + Math.max(0, Number(ex.amount || 0)), 0);

  const explicitWait = Math.max(
    Math.max(0, Number(p?.delayFee || 0)),
    Math.max(0, Number(trip.payment?.waitTimeAmount || 0))
  );

  let rawWaitDelay = explicitWait;
  let rawExtras = 0;
  let rawSurcharges = 0;

  if (Array.isArray(p?.breakdown) && p.breakdown.length > 0) {
    let breakdownWait = 0;
    let breakdownExtras = 0;
    let breakdownSurcharges = 0;

    for (const item of p.breakdown) {
      if (!item || item.isWaived || Number(item.amount || 0) <= 0) continue;
      const amt = Math.max(0, Number(item.amount || 0));
      const keyText = `${item.id || ''} ${item.label || ''}`.toLowerCase();
      if (keyText.includes('toll')) continue;
      if (keyText.includes('wait') || keyText.includes('delay')) {
        breakdownWait += amt;
      } else if (item.category === 'extra') {
        breakdownExtras += amt;
      } else if (item.category === 'surcharge') {
        breakdownSurcharges += amt;
      }
    }

    rawWaitDelay = Math.max(explicitWait, breakdownWait);
    rawExtras = breakdownExtras + driverNonTollExtrasSum;
    rawSurcharges = breakdownSurcharges;
  } else {
    rawExtras =
      Math.max(0, Number(p?.carSeatFee || 0)) +
      Math.max(0, Number(p?.oversizedLuggageFee || 0)) +
      Math.max(0, Number(p?.customExtrasFee || 0)) +
      Math.max(0, Number(p?.multiStopSurcharge || 0)) +
      Math.max(0, Number(p?.passengerSurcharge || 0)) +
      driverNonTollExtrasSum;

    const itemizedSurchargesSum = (p?.itemizedSurcharges || []).reduce(
      (sum, s) => sum + Math.max(0, Number(s.amount || 0)),
      0
    );
    rawSurcharges =
      itemizedSurchargesSum > 0
        ? itemizedSurchargesSum
        : Math.max(0, Number(p?.airportSurcharge || 0));
  }

  let remaining = grossFareExTipAndTolls;
  const waitDelay = roundMoney(Math.min(remaining, Math.max(0, rawWaitDelay)));
  remaining = roundMoney(Math.max(0, remaining - waitDelay));
  const extras = roundMoney(Math.min(remaining, Math.max(0, rawExtras)));
  remaining = roundMoney(Math.max(0, remaining - extras));
  const surcharges = roundMoney(Math.min(remaining, Math.max(0, rawSurcharges)));
  const baseFare = roundMoney(Math.max(0, remaining - surcharges));

  return {
    baseFare,
    extras,
    waitDelay,
    surcharges,
    tolls,
    tips,
    grossFareExTipAndTolls,
  };
}

export function normalizeDriverCommissionRateToPercent(rate?: number | null): number | null {
  if (rate === null || rate === undefined) return null;
  const num = Number(rate);
  if (!Number.isFinite(num) || num < 0) return null;
  const asPercent = num <= 1 && num > 0 ? num * 100 : num;
  return clampCommissionPercent(asPercent, 75);
}

export function resolveTripPaymentCommissionBucket(
  method?: string | null
): 'cash' | 'card' | 'account' {
  const clean = String(method || '').trim().toLowerCase();
  if (clean === 'cash') return 'cash';
  if (clean === 'corporate' || clean === 'account') return 'account';
  return 'card';
}

export function resolvePayoutWindowCalendarDays(
  periodWin: PayoutPeriodWindow,
  earliestTripMs?: number | null
): number {
  if (periodWin.startMs !== null && periodWin.endMs !== null) {
    const spanDays = (periodWin.endMs - periodWin.startMs) / 86_400_000;
    return Math.max(1, Math.ceil(spanDays));
  }
  if (earliestTripMs !== null && earliestTripMs !== undefined && Number.isFinite(earliestTripMs)) {
    const endMs = periodWin.endMs ?? periodWin.nowMs ?? Date.now();
    return Math.max(1, Math.ceil(Math.max(0, endMs - earliestTripMs) / 86_400_000));
  }
  return 30;
}

export function resolveFlatPayoutPeriodMultiplier(
  calendarDays: number,
  flatPeriod: FlatPayoutPeriod
): number {
  const safeDays = Math.max(1, calendarDays);
  if (flatPeriod === 'day') return safeDays;
  if (flatPeriod === 'week') return safeDays / 7;
  return safeDays / 30;
}

function resolveDriverCommissionPercentForBucket(params: {
  bucket: 'cash' | 'card' | 'account';
  carOwnership: DriverCarOwnership;
  individualCommissionPercent: number | null;
  driverPaymentTypeRates?: PaymentTypeCommissionRates;
  usePaymentTypeSplit: boolean;
  globalPaymentTypePercents: { cash: number | null; card: number | null; account: number | null };
  ownerOperatorPercent: number | null;
  companyOwnedPercent: number | null;
  universalPercent: number;
}): number {
  const {
    bucket,
    carOwnership,
    individualCommissionPercent,
    driverPaymentTypeRates,
    usePaymentTypeSplit,
    globalPaymentTypePercents,
    ownerOperatorPercent,
    companyOwnedPercent,
    universalPercent,
  } = params;

  // 1. Per-driver payment-type override (if enabled) -> Per-driver commissionRate
  if (usePaymentTypeSplit && driverPaymentTypeRates) {
    const perDriverBucketVal = driverPaymentTypeRates[bucket];
    if (perDriverBucketVal !== null && perDriverBucketVal !== undefined && Number.isFinite(Number(perDriverBucketVal))) {
      return clampCommissionPercent(perDriverBucketVal, universalPercent);
    }
  }
  if (individualCommissionPercent !== null && Number.isFinite(individualCommissionPercent)) {
    return clampCommissionPercent(individualCommissionPercent, universalPercent);
  }

  // 2. Global payment-type % (if enabled)
  if (usePaymentTypeSplit) {
    const globalBucketVal = globalPaymentTypePercents[bucket];
    if (globalBucketVal !== null && globalBucketVal !== undefined && Number.isFinite(Number(globalBucketVal))) {
      return clampCommissionPercent(globalBucketVal, universalPercent);
    }
  }

  // 3. Car Ownership %
  const ownershipOverride =
    carOwnership === 'company_owned' ? companyOwnedPercent : ownerOperatorPercent;
  if (ownershipOverride !== null && ownershipOverride !== undefined && Number.isFinite(Number(ownershipOverride))) {
    return clampCommissionPercent(ownershipOverride, universalPercent);
  }

  // 4. Universal %
  return universalPercent;
}

export type DriverRollupRosterInput = Pick<DriverRosterItem, 'id' | 'name' | 'cabNumber'> & {
  isArchived?: boolean;
  carOwnership?: DriverCarOwnership;
  payoutType?: DriverPayoutType;
  flatPayoutPeriod?: FlatPayoutPeriod;
  flatPayoutAmount?: number;
  commissionRate?: number;
  paymentTypeCommissionRates?: PaymentTypeCommissionRates;
};

/**
 * Aggregates completed trips per driver within `periodWindow`, supporting:
 * - `percent` mode: `commissionableComponents` filtering + 4-tier rate precedence
 *   (individual -> payment type -> car ownership -> universal)
 * - `flat` mode: calendar-day lease/fee multiplier (`day`, `week`, `month`) where
 *   `netPayout = (grossFares + tips + tolls) - platformFee - alreadySettledAmount` (allows negative balance)
 */
export function computeDriverEarningsRollup(
  trips: ReadonlyArray<Trip>,
  drivers: ReadonlyArray<DriverRollupRosterInput>,
  defaultCommissionPercentOrPolicy: number | Partial<BillingSettingsConfig> = 75,
  periodWindow?: PayoutPeriodInput,
  existingSettlements?: ReadonlyArray<PayoutSettlementRecord>,
  driverCommissionOverrides?: Record<string, number>,
  billingPolicy?: Partial<BillingSettingsConfig> | null,
  driverPayoutOverrides?: Record<string, DriverPayoutOverrideInput>
): DriverEarningsRollupRow[] {
  const periodWin = resolvePayoutPeriodWindow(periodWindow);
  const inlinePolicy =
    typeof defaultCommissionPercentOrPolicy === 'object' && defaultCommissionPercentOrPolicy !== null
      ? defaultCommissionPercentOrPolicy
      : undefined;
  const mergedPolicyRaw: Partial<BillingSettingsConfig> = {
    ...(inlinePolicy || {}),
    ...(billingPolicy || {}),
  };
  if (typeof defaultCommissionPercentOrPolicy === 'number' && mergedPolicyRaw.driverDefaultCommissionPercent === undefined) {
    mergedPolicyRaw.driverDefaultCommissionPercent = defaultCommissionPercentOrPolicy;
  }

  const normalizedPolicy = normalizeBillingSettingsConfig(mergedPolicyRaw);
  const universalPercent = clampCommissionPercent(normalizedPolicy.driverDefaultCommissionPercent, 75);
  const commissionableSet = new Set<CommissionableFareComponent>(
    normalizedPolicy.commissionableComponents || DEFAULT_COMMISSIONABLE_FARE_COMPONENTS
  );
  const settlements = existingSettlements ?? periodWin.settlements ?? [];
  const legacyCommOverrides = driverCommissionOverrides ?? periodWin.commissionOverrides ?? {};
  const payoutOverrides = driverPayoutOverrides || {};

  interface ResolvedDriverMeta {
    id: string;
    name: string;
    cabNumber?: string;
    carOwnership: DriverCarOwnership;
    payoutType: DriverPayoutType;
    flatPayoutPeriod: FlatPayoutPeriod;
    flatPayoutAmount: number;
    individualCommissionPercent: number | null;
    paymentTypeCommissionRates?: PaymentTypeCommissionRates;
  }

  const driverMeta = new Map<string, ResolvedDriverMeta>();

  const buildDriverMeta = (
    id: string,
    base: Partial<DriverRollupRosterInput> & { name: string }
  ): ResolvedDriverMeta => {
    const rowOverride = payoutOverrides[id];
    const carOwnership: DriverCarOwnership =
      (rowOverride?.carOwnership ?? base.carOwnership) === 'company_owned'
        ? 'company_owned'
        : 'owner_operator';
    const payoutType: DriverPayoutType =
      (rowOverride?.payoutType ?? base.payoutType) === 'flat' ? 'flat' : 'percent';
    const rawPeriod = rowOverride?.flatPayoutPeriod ?? base.flatPayoutPeriod;
    const flatPayoutPeriod: FlatPayoutPeriod =
      rawPeriod === 'day' || rawPeriod === 'month' ? rawPeriod : 'week';
    const rawFlatAmt = rowOverride?.flatPayoutAmount ?? base.flatPayoutAmount ?? 0;
    const flatPayoutAmount = roundMoney(Math.max(0, Number(rawFlatAmt) || 0));

    let individualCommissionPercent: number | null = null;
    if (legacyCommOverrides[id] !== undefined) {
      individualCommissionPercent = clampCommissionPercent(legacyCommOverrides[id], universalPercent);
    } else if (rowOverride?.commissionPercent !== undefined) {
      individualCommissionPercent =
        rowOverride.commissionPercent === null
          ? null
          : clampCommissionPercent(rowOverride.commissionPercent, universalPercent);
    } else if (base.commissionRate !== undefined) {
      individualCommissionPercent = normalizeDriverCommissionRateToPercent(base.commissionRate);
    }

    const paymentTypeCommissionRates =
      rowOverride?.paymentTypeCommissionRates ?? base.paymentTypeCommissionRates;

    return {
      id,
      name: base.name || id,
      cabNumber: base.cabNumber,
      carOwnership,
      payoutType,
      flatPayoutPeriod,
      flatPayoutAmount,
      individualCommissionPercent,
      paymentTypeCommissionRates,
    };
  };

  for (const d of drivers || []) {
    if (!d?.id || d.isArchived) continue;
    driverMeta.set(d.id, buildDriverMeta(d.id, d));
  }

  const tripsByDriver = new Map<string, Trip[]>();
  let earliestMatchedTripMs: number | null = null;

  for (const trip of trips || []) {
    if (!trip || String(trip.status || '').toLowerCase() !== 'completed') continue;
    const driverId = (trip.assignedDriverId || '').trim();
    if (!driverId) continue;

    const tsMs = resolveTripTimestampMs(trip);
    if (!isTimestampWithinWindow(tsMs, periodWin)) continue;

    if (tsMs !== null && (earliestMatchedTripMs === null || tsMs < earliestMatchedTripMs)) {
      earliestMatchedTripMs = tsMs;
    }

    if (!driverMeta.has(driverId)) {
      const meta = (trip.metadata || {}) as Record<string, unknown>;
      const fallbackName =
        (typeof meta.assignedDriverName === 'string' && meta.assignedDriverName.trim()) ||
        `Driver ${driverId}`;
      driverMeta.set(driverId, buildDriverMeta(driverId, { name: fallbackName }));
    }

    const list = tripsByDriver.get(driverId) || [];
    list.push(trip);
    tripsByDriver.set(driverId, list);
  }

  const calendarDays = resolvePayoutWindowCalendarDays(periodWin, earliestMatchedTripMs);
  const rows: DriverEarningsRollupRow[] = [];

  for (const [driverId, info] of driverMeta.entries()) {
    const driverTrips = tripsByDriver.get(driverId) || [];

    const effectivePaymentTypePercents = {
      cash: resolveDriverCommissionPercentForBucket({
        bucket: 'cash',
        carOwnership: info.carOwnership,
        individualCommissionPercent: info.individualCommissionPercent,
        driverPaymentTypeRates: info.paymentTypeCommissionRates,
        usePaymentTypeSplit: normalizedPolicy.usePaymentTypeCommissionSplit,
        globalPaymentTypePercents: normalizedPolicy.paymentTypeCommissionPercents,
        ownerOperatorPercent: normalizedPolicy.ownerOperatorCommissionPercent,
        companyOwnedPercent: normalizedPolicy.companyOwnedCommissionPercent,
        universalPercent,
      }),
      card: resolveDriverCommissionPercentForBucket({
        bucket: 'card',
        carOwnership: info.carOwnership,
        individualCommissionPercent: info.individualCommissionPercent,
        driverPaymentTypeRates: info.paymentTypeCommissionRates,
        usePaymentTypeSplit: normalizedPolicy.usePaymentTypeCommissionSplit,
        globalPaymentTypePercents: normalizedPolicy.paymentTypeCommissionPercents,
        ownerOperatorPercent: normalizedPolicy.ownerOperatorCommissionPercent,
        companyOwnedPercent: normalizedPolicy.companyOwnedCommissionPercent,
        universalPercent,
      }),
      account: resolveDriverCommissionPercentForBucket({
        bucket: 'account',
        carOwnership: info.carOwnership,
        individualCommissionPercent: info.individualCommissionPercent,
        driverPaymentTypeRates: info.paymentTypeCommissionRates,
        usePaymentTypeSplit: normalizedPolicy.usePaymentTypeCommissionSplit,
        globalPaymentTypePercents: normalizedPolicy.paymentTypeCommissionPercents,
        ownerOperatorPercent: normalizedPolicy.ownerOperatorCommissionPercent,
        companyOwnedPercent: normalizedPolicy.companyOwnedCommissionPercent,
        universalPercent,
      }),
    };

    const baseDefaultPercent = resolveDriverCommissionPercentForBucket({
      bucket: 'card',
      carOwnership: info.carOwnership,
      individualCommissionPercent: info.individualCommissionPercent,
      driverPaymentTypeRates: undefined,
      usePaymentTypeSplit: false,
      globalPaymentTypePercents: normalizedPolicy.paymentTypeCommissionPercents,
      ownerOperatorPercent: normalizedPolicy.ownerOperatorCommissionPercent,
      companyOwnedPercent: normalizedPolicy.companyOwnedCommissionPercent,
      universalPercent,
    });

    let grossFares = 0;
    let tips = 0;
    let tollsReimbursed = 0;
    let commissionableBaseAmount = 0;
    let percentDriverShareSum = 0;
    let percentPassThroughSum = 0;
    let percentTotalCollectedSum = 0;

    for (const trip of driverTrips) {
      const comp = extractTripFareComponents(trip);
      grossFares = roundMoney(grossFares + comp.grossFareExTipAndTolls);
      tips = roundMoney(tips + comp.tips);
      tollsReimbursed = roundMoney(tollsReimbursed + comp.tolls);

      const tripCommBase = roundMoney(
        (commissionableSet.has('base_fare') ? comp.baseFare : 0) +
          (commissionableSet.has('extras') ? comp.extras : 0) +
          (commissionableSet.has('wait_delay') ? comp.waitDelay : 0) +
          (commissionableSet.has('surcharges') ? comp.surcharges : 0) +
          (commissionableSet.has('tolls') ? comp.tolls : 0) +
          (commissionableSet.has('tips') ? comp.tips : 0)
      );
      commissionableBaseAmount = roundMoney(commissionableBaseAmount + tripCommBase);

      const bucket = resolveTripPaymentCommissionBucket(trip.payment?.method);
      const tripRatePercent = effectivePaymentTypePercents[bucket];
      const tripCommShare = roundMoney((tripCommBase * tripRatePercent) / 100);
      const tripPassThrough = roundMoney(
        (commissionableSet.has('tips') ? 0 : comp.tips) +
          (commissionableSet.has('tolls') ? 0 : comp.tolls)
      );

      percentDriverShareSum = roundMoney(percentDriverShareSum + tripCommShare);
      percentPassThroughSum = roundMoney(percentPassThroughSum + tripPassThrough);
      percentTotalCollectedSum = roundMoney(
        percentTotalCollectedSum + comp.grossFareExTipAndTolls + comp.tips + comp.tolls
      );
    }

    let alreadySettledAmount = 0;
    let pendingSettlementAmount = 0;

    for (const s of settlements) {
      if (s.payeeType !== 'driver' || s.payeeId !== driverId) continue;
      if (!doesSettlementOverlapWindow(s, periodWin)) continue;
      if (s.status === 'paid') {
        alreadySettledAmount = roundMoney(
          alreadySettledAmount + Math.max(0, Number(s.netPayoutAmount || 0))
        );
      } else {
        pendingSettlementAmount = roundMoney(
          pendingSettlementAmount + Math.max(0, Number(s.netPayoutAmount || 0))
        );
      }
    }

    const flatPeriodMultiplier = Number(
      resolveFlatPayoutPeriodMultiplier(calendarDays, info.flatPayoutPeriod).toFixed(4)
    );

    let commissionPercent = baseDefaultPercent;
    let driverFareShare = 0;
    let platformFee = 0;
    let totalEarned = 0;
    let netPayout = 0;

    if (info.payoutType === 'flat') {
      commissionPercent = 100;
      platformFee = roundMoney(info.flatPayoutAmount * flatPeriodMultiplier);
      driverFareShare = grossFares;
      totalEarned = roundMoney(grossFares + tips + tollsReimbursed - platformFee);
      netPayout = roundMoney(totalEarned - alreadySettledAmount);
    } else {
      if (driverTrips.length > 0 && commissionableBaseAmount > 0 && normalizedPolicy.usePaymentTypeCommissionSplit) {
        commissionPercent = clampCommissionPercent(
          (percentDriverShareSum / commissionableBaseAmount) * 100,
          baseDefaultPercent
        );
      }
      driverFareShare = percentDriverShareSum;
      totalEarned = roundMoney(percentDriverShareSum + percentPassThroughSum);
      platformFee = roundMoney(Math.max(0, percentTotalCollectedSum - totalEarned));
      netPayout = roundMoney(Math.max(0, totalEarned - alreadySettledAmount));
    }

    const owesCompanyAmount = netPayout < 0 ? roundMoney(Math.abs(netPayout)) : 0;

    rows.push({
      driverId,
      driverName: info.name,
      ...(info.cabNumber ? { cabNumber: info.cabNumber } : {}),
      carOwnership: info.carOwnership,
      payoutType: info.payoutType,
      flatPayoutPeriod: info.flatPayoutPeriod,
      flatPayoutAmount: info.flatPayoutAmount,
      flatPeriodMultiplier,
      calendarDays,
      tripCount: driverTrips.length,
      grossFares,
      commissionableBaseAmount,
      tips,
      tollsReimbursed,
      commissionPercent,
      effectivePaymentTypePercents,
      driverFareShare,
      platformFee,
      totalEarned,
      alreadySettledAmount,
      pendingSettlementAmount,
      netPayout,
      owesCompanyAmount,
      periodStart: periodWin.periodStart,
      periodEnd: periodWin.periodEnd,
    });
  }

  return rows.sort(
    (a, b) =>
      b.netPayout - a.netPayout ||
      b.tripCount - a.tripCount ||
      a.driverName.localeCompare(b.driverName)
  );
}

function isStaffOperator(op: OperatorUser): boolean {
  if (op.isArchived) return false;
  const roles = new Set<string>([
    ...(Array.isArray(op.roles) ? op.roles : []),
    ...(op.role ? [op.role] : []),
  ]);
  return roles.has('dispatcher') || roles.has('admin');
}

function doesTripMatchStaffDispatcher(trip: Trip, op: OperatorUser): boolean {
  const uid = (op.uid || '').trim();
  const email = (op.email || '').trim().toLowerCase();
  const meta = (trip.metadata || {}) as Record<string, unknown>;
  const anyTrip = trip as unknown as Record<string, unknown>;

  const candidateValues = [
    anyTrip.dispatchedBy,
    anyTrip.createdBy,
    meta.dispatchedBy,
    meta.dispatchedByEmail,
    meta.createdBy,
    meta.createdByEmail,
    meta.operatorId,
    meta.operatorEmail,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());

  for (const val of candidateValues) {
    if (uid && val === uid) return true;
    if (email && val.toLowerCase() === email) return true;
  }
  return false;
}

/**
 * Computes staff/dispatcher settlement previews:
 * `hours * hourlyRate + dispatchedTripsCount * perBookingBonus + adjustments - alreadySettledAmount`
 */
export function computeStaffPayoutPreview(
  operators: ReadonlyArray<OperatorUser>,
  trips: ReadonlyArray<Trip>,
  staffHoursMap: Record<string, StaffHoursInputValue> = {},
  policy?: Partial<BillingSettingsConfig> | null,
  periodWindow?: PayoutPeriodInput,
  adjustmentsMap: Record<string, number> = {},
  existingSettlements?: ReadonlyArray<PayoutSettlementRecord>
): StaffPayoutPreviewRow[] {
  const periodWin = resolvePayoutPeriodWindow(periodWindow);
  const normalizedPolicy = normalizeBillingSettingsConfig(policy);
  const hourlyRate = normalizedPolicy.staffDispatcherHourlyRate;
  const perBookingBonusAmount = normalizedPolicy.staffPerBookingBonusAmount;
  const settlements = existingSettlements ?? periodWin.settlements ?? [];

  const eligibleTrips = (trips || []).filter((t) => {
    if (!t || CANCELLED_OR_DECLINED.has(String(t.status || ''))) return false;
    const tsMs = resolveTripTimestampMs(t);
    return isTimestampWithinWindow(tsMs, periodWin);
  });

  const rows: StaffPayoutPreviewRow[] = [];

  for (const op of operators || []) {
    if (!op || !isStaffOperator(op)) continue;

    const rawEntry = staffHoursMap[op.uid] ?? staffHoursMap[op.email];
    const hoursWorked =
      typeof rawEntry === 'number'
        ? Math.max(0, Number(rawEntry.toFixed(2)))
        : rawEntry && typeof rawEntry === 'object'
        ? Math.max(0, Number(Number(rawEntry.hours || 0).toFixed(2)))
        : 0;

    const entryAdj =
      rawEntry && typeof rawEntry === 'object' && rawEntry.adjustments !== undefined
        ? Number(rawEntry.adjustments)
        : adjustmentsMap[op.uid] ?? adjustmentsMap[op.email] ?? 0;
    const adjustmentsAmount = Number.isFinite(entryAdj) ? roundMoney(entryAdj) : 0;

    const countedTrips =
      rawEntry && typeof rawEntry === 'object' && rawEntry.dispatchedCountOverride !== undefined
        ? Math.max(0, Math.round(rawEntry.dispatchedCountOverride))
        : eligibleTrips.filter((t) => doesTripMatchStaffDispatcher(t, op)).length;

    const baseWageAmount = roundMoney(hoursWorked * hourlyRate);
    const bookingBonusAmount = roundMoney(countedTrips * perBookingBonusAmount);

    let alreadySettledAmount = 0;
    for (const s of settlements) {
      if (s.payeeType !== 'staff' || s.payeeId !== op.uid) continue;
      if (s.status !== 'paid' || !doesSettlementOverlapWindow(s, periodWin)) continue;
      alreadySettledAmount = roundMoney(
        alreadySettledAmount + Math.max(0, Number(s.netPayoutAmount || 0))
      );
    }

    const netPayoutAmount = roundMoney(
      Math.max(0, baseWageAmount + bookingBonusAmount + adjustmentsAmount - alreadySettledAmount)
    );

    const roleSet = new Set<string>([
      ...(Array.isArray(op.roles) ? op.roles : []),
      ...(op.role ? [op.role] : []),
    ]);
    const roleLabel = roleSet.has('dispatcher') && roleSet.has('admin')
      ? 'Admin & Dispatcher'
      : roleSet.has('dispatcher')
      ? 'Dispatcher'
      : 'Administrator';

    const operatorName =
      op.displayName?.trim() ||
      [op.firstName, op.lastName].filter(Boolean).join(' ').trim() ||
      op.email;

    rows.push({
      operatorId: op.uid,
      operatorName,
      operatorEmail: op.email,
      roleLabel,
      hoursWorked,
      hourlyRate,
      dispatchedTripsCount: countedTrips,
      perBookingBonusAmount,
      baseWageAmount,
      bookingBonusAmount,
      adjustmentsAmount,
      alreadySettledAmount,
      netPayoutAmount,
      periodStart: periodWin.periodStart,
      periodEnd: periodWin.periodEnd,
    });
  }

  return rows.sort(
    (a, b) => b.netPayoutAmount - a.netPayoutAmount || a.operatorName.localeCompare(b.operatorName)
  );
}

/**
 * Deterministic settlement calculator for `'flat' | 'percent' | 'hourly'`
 * custom vendors, affiliates, concierge partners, and sub-contractors.
 */
export function computeOtherPayeeSettlement(
  payee: Pick<PayoutPayeeRecord, 'id' | 'name' | 'category' | 'defaultRateType' | 'defaultRateValue'>,
  baseVolumeOrHours: number = 1,
  adjustments: number = 0
): OtherPayeeSettlementPreview {
  const rateValue = Math.max(0, roundMoney(Number(payee.defaultRateValue || 0)));
  const cleanVolume = Math.max(0, roundMoney(Number(baseVolumeOrHours || 0)));
  const adjustmentsAmount = Number.isFinite(Number(adjustments)) ? roundMoney(Number(adjustments)) : 0;

  let grossAmount = 0;
  if (payee.defaultRateType === 'percent') {
    grossAmount = roundMoney((cleanVolume * rateValue) / 100);
  } else if (payee.defaultRateType === 'hourly') {
    grossAmount = roundMoney(cleanVolume * rateValue);
  } else {
    // 'flat': 0 or 1 unit = 1x flat rate; > 1 units (e.g. N referrals/runs) = N * flat rate
    const units = cleanVolume > 0 ? cleanVolume : 1;
    grossAmount = roundMoney(units * rateValue);
  }

  const netPayoutAmount = roundMoney(Math.max(0, grossAmount + adjustmentsAmount));

  return {
    payeeId: payee.id,
    payeeName: payee.name,
    category: payee.category,
    rateType: payee.defaultRateType,
    rateValue,
    baseVolumeOrHours: cleanVolume,
    grossAmount,
    adjustmentsAmount,
    netPayoutAmount,
  };
}

/**
 * Maps a paid `PayoutSettlementRecord` into a balanced GL journal entry payload:
 * - `'driver'` -> `driver_payout` (`5010-DriverPayout`)
 * - `'staff'`  -> `staff_payout` (`5020-StaffPayroll`)
 * - `'other'`  -> `vendor_payout` (`5030-VendorAffiliatePayout`)
 */
export function resolvePayoutLedgerMapping(payeeType: PayoutPayeeType): {
  type: LedgerEntryType;
  accountCode: string;
} {
  if (payeeType === 'staff') {
    return { type: 'staff_payout', accountCode: '5020-StaffPayroll' };
  }
  if (payeeType === 'other') {
    return { type: 'vendor_payout', accountCode: '5030-VendorAffiliatePayout' };
  }
  return { type: 'driver_payout', accountCode: '5010-DriverPayout' };
}

export function buildPayoutLedgerEntry(
  settlement: PayoutSettlementRecord,
  paidDateIso?: string
): Omit<FinancialLedgerEntry, 'id' | 'createdAt'> {
  const mapping = resolvePayoutLedgerMapping(settlement.payeeType);
  const date =
    paidDateIso ||
    (settlement.paidAt ? settlement.paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const refPart = settlement.referenceNumber ? ` · Ref #${settlement.referenceNumber}` : '';

  return {
    date,
    type: mapping.type,
    ...(settlement.payeeType === 'driver' ? { driverId: settlement.payeeId } : {}),
    amount: roundMoney(Math.max(0, Number(settlement.netPayoutAmount || 0))),
    description: `Payout (${settlement.payeeRoleLabel}): ${settlement.payeeName} [${settlement.periodStart} – ${settlement.periodEnd}] via ${settlement.paymentMethod.toUpperCase()}${refPart}`,
    accountCode: mapping.accountCode,
  };
}

/**
 * Exports `PayoutSettlementRecord[]` or `DriverEarningsRollupRow[]` to a formula-safe
 * RFC-4180 CSV file using `escapeCsvCell` from `operational-intelligence.service.ts`.
 */
export function exportPayoutsCsv(
  settlementsOrRollups: ReadonlyArray<PayoutSettlementRecord | DriverEarningsRollupRow>,
  nowMs?: number
): ExportedPayoutsCsv {
  const tsMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  const dateSlug = toIsoDateStr(tsMs);

  const headers = [
    'Record ID / Key',
    'Payee Category',
    'Payee Name',
    'Role / Detail',
    'Period Start',
    'Period End',
    'Trips / Hours',
    'Gross Amount ($)',
    'Tips / Bonus ($)',
    'Platform Fee / Deductions ($)',
    'Adjustments ($)',
    'Net Payout ($)',
    'Status',
    'Payment Method',
    'Reference #',
    'Paid At',
    'GL Account Code',
    'Notes',
  ];

  let totalNetPayout = 0;

  const rows = (settlementsOrRollups || []).map((item) => {
    if ('payeeType' in item) {
      const mapping = resolvePayoutLedgerMapping(item.payeeType);
      const net = roundMoney(Number(item.netPayoutAmount || 0));
      totalNetPayout = roundMoney(totalNetPayout + net);
      const volumeDetail =
        item.tripCount !== undefined
          ? `${item.tripCount} trips`
          : item.hoursWorked !== undefined
          ? `${item.hoursWorked} hrs`
          : '';

      return [
        item.id,
        item.payeeType.toUpperCase(),
        item.payeeName,
        item.payeeRoleLabel,
        item.periodStart,
        item.periodEnd,
        volumeDetail,
        roundMoney(item.grossAmount).toFixed(2),
        roundMoney(item.tipsOrBonusAmount).toFixed(2),
        roundMoney(item.deductionsOrPlatformFee).toFixed(2),
        roundMoney(item.adjustmentsAmount).toFixed(2),
        net.toFixed(2),
        item.status.toUpperCase(),
        item.paymentMethod.toUpperCase(),
        item.referenceNumber || '',
        item.paidAt || '',
        mapping.accountCode,
        item.notes || '',
      ];
    }

    // DriverEarningsRollupRow preview export
    const net = roundMoney(Number(item.netPayout || 0));
    totalNetPayout = roundMoney(totalNetPayout + net);
    const modeDetail =
      item.payoutType === 'flat'
        ? `Flat $${item.flatPayoutAmount.toFixed(2)}/${item.flatPayoutPeriod}`
        : `${item.commissionPercent}% Share`;
    return [
      item.driverId,
      'DRIVER',
      item.driverName,
      item.cabNumber ? `Cab #${item.cabNumber} (${modeDetail})` : modeDetail,
      item.periodStart,
      item.periodEnd,
      `${item.tripCount} trips`,
      roundMoney(item.grossFares).toFixed(2),
      roundMoney(item.tips + item.tollsReimbursed).toFixed(2),
      roundMoney(item.platformFee).toFixed(2),
      roundMoney(-item.alreadySettledAmount).toFixed(2),
      net.toFixed(2),
      'PREVIEW',
      'PENDING',
      '',
      '',
      '5010-DriverPayout',
      '',
    ];
  });

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];

  return {
    fileName: `chesterfield-payouts-export-${dateSlug}.csv`,
    mimeType: 'text/csv;charset=utf-8;',
    csvContent: csvLines.join('\r\n'),
    rowCount: rows.length,
    totalNetPayout,
  };
}
