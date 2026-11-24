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
  normalizeBillingSettingsConfig,
  type BillingSettingsConfig,
  type CustomPayeeCategory,
  type CustomPayeeRateType,
  type PayoutPayeeRecord,
  type PayoutPayeeType,
  type PayoutSettlementRecord,
} from '../types/config';
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

export interface DriverEarningsRollupRow {
  driverId: string;
  driverName: string;
  cabNumber?: string;
  tripCount: number;
  grossFares: number;
  tips: number;
  tollsReimbursed: number;
  commissionPercent: number;
  driverFareShare: number;
  platformFee: number;
  totalEarned: number;
  alreadySettledAmount: number;
  pendingSettlementAmount: number;
  netPayout: number;
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

function extractTripTollsAndTips(trip: Trip): {
  grossFareExTipAndTolls: number;
  tips: number;
  tolls: number;
} {
  const driverTollSum = (trip.pricing?.driverExtras || [])
    .filter((ex) => ex.category === 'toll')
    .reduce((sum, ex) => sum + Math.max(0, Number(ex.amount || 0)), 0);

  const tolls = roundMoney(
    Math.max(
      driverTollSum,
      Math.max(0, Number(trip.pricing?.tollsFee || 0)),
      Math.max(0, Number(trip.payment?.tollsAmount || 0))
    )
  );

  const tips = roundMoney(Math.max(0, Number(trip.payment?.tipAmount || 0)));

  const rawTotalBeforeTip =
    trip.pricing?.totalFare !== undefined && Number(trip.pricing.totalFare) > 0
      ? Number(trip.pricing.totalFare)
      : trip.pricing?.meterCalculatedFare && Number(trip.pricing.meterCalculatedFare) > 0
      ? Number(trip.pricing.meterCalculatedFare)
      : Math.max(0, Number(trip.payment?.amount || 0) - tips);

  const grossFareExTipAndTolls = roundMoney(Math.max(0, rawTotalBeforeTip - tolls));

  return {
    grossFareExTipAndTolls,
    tips,
    tolls,
  };
}

/**
 * Aggregates completed trips per driver within `periodWindow`:
 * - `grossFares`: commissionable base+distance+wait+extras fare (excluding tips & pass-through tolls)
 * - `tips` & `tollsReimbursed`: 100% pass-through to driver
 * - `driverFareShare`: `grossFares * (commissionPercent / 100)`
 * - `platformFee`: `grossFares - driverFareShare`
 * - `netPayout`: `Math.max(0, driverFareShare + tips + tollsReimbursed - alreadySettledAmount)`
 */
export function computeDriverEarningsRollup(
  trips: ReadonlyArray<Trip>,
  drivers: ReadonlyArray<Pick<DriverRosterItem, 'id' | 'name' | 'cabNumber'> & { isArchived?: boolean }>,
  defaultCommissionPercent: number = 75,
  periodWindow?: PayoutPeriodInput,
  existingSettlements?: ReadonlyArray<PayoutSettlementRecord>,
  driverCommissionOverrides?: Record<string, number>
): DriverEarningsRollupRow[] {
  const periodWin = resolvePayoutPeriodWindow(periodWindow);
  const clampedDefaultComm = clampCommissionPercent(defaultCommissionPercent, 75);
  const settlements = existingSettlements ?? periodWin.settlements ?? [];
  const overrides = driverCommissionOverrides ?? periodWin.commissionOverrides ?? {};

  const driverMeta = new Map<
    string,
    { id: string; name: string; cabNumber?: string }
  >();

  for (const d of drivers || []) {
    if (!d?.id || d.isArchived) continue;
    driverMeta.set(d.id, {
      id: d.id,
      name: d.name || d.id,
      cabNumber: d.cabNumber,
    });
  }

  const tripStatsByDriver = new Map<
    string,
    { tripCount: number; grossFares: number; tips: number; tollsReimbursed: number }
  >();

  for (const trip of trips || []) {
    if (!trip || String(trip.status || '').toLowerCase() !== 'completed') continue;
    const driverId = (trip.assignedDriverId || '').trim();
    if (!driverId) continue;

    const tsMs = resolveTripTimestampMs(trip);
    if (!isTimestampWithinWindow(tsMs, periodWin)) continue;

    if (!driverMeta.has(driverId)) {
      const meta = (trip.metadata || {}) as Record<string, unknown>;
      driverMeta.set(driverId, {
        id: driverId,
        name:
          (typeof meta.assignedDriverName === 'string' && meta.assignedDriverName.trim()) ||
          `Driver ${driverId}`,
      });
    }

    const amounts = extractTripTollsAndTips(trip);
    const current = tripStatsByDriver.get(driverId) || {
      tripCount: 0,
      grossFares: 0,
      tips: 0,
      tollsReimbursed: 0,
    };
    current.tripCount += 1;
    current.grossFares = roundMoney(current.grossFares + amounts.grossFareExTipAndTolls);
    current.tips = roundMoney(current.tips + amounts.tips);
    current.tollsReimbursed = roundMoney(current.tollsReimbursed + amounts.tolls);
    tripStatsByDriver.set(driverId, current);
  }

  const rows: DriverEarningsRollupRow[] = [];

  for (const [driverId, info] of driverMeta.entries()) {
    const stats = tripStatsByDriver.get(driverId) || {
      tripCount: 0,
      grossFares: 0,
      tips: 0,
      tollsReimbursed: 0,
    };

    const commissionPercent =
      overrides[driverId] !== undefined
        ? clampCommissionPercent(overrides[driverId], clampedDefaultComm)
        : clampedDefaultComm;

    const driverFareShare = roundMoney((stats.grossFares * commissionPercent) / 100);
    const platformFee = roundMoney(Math.max(0, stats.grossFares - driverFareShare));
    const totalEarned = roundMoney(driverFareShare + stats.tips + stats.tollsReimbursed);

    let alreadySettledAmount = 0;
    let pendingSettlementAmount = 0;

    for (const s of settlements) {
      if (s.payeeType !== 'driver' || s.payeeId !== driverId) continue;
      if (!doesSettlementOverlapWindow(s, periodWin)) continue;
      if (s.status === 'paid') {
        alreadySettledAmount = roundMoney(alreadySettledAmount + Math.max(0, Number(s.netPayoutAmount || 0)));
      } else {
        pendingSettlementAmount = roundMoney(
          pendingSettlementAmount + Math.max(0, Number(s.netPayoutAmount || 0))
        );
      }
    }

    const netPayout = roundMoney(Math.max(0, totalEarned - alreadySettledAmount));

    rows.push({
      driverId,
      driverName: info.name,
      ...(info.cabNumber ? { cabNumber: info.cabNumber } : {}),
      tripCount: stats.tripCount,
      grossFares: stats.grossFares,
      tips: stats.tips,
      tollsReimbursed: stats.tollsReimbursed,
      commissionPercent,
      driverFareShare,
      platformFee,
      totalEarned,
      alreadySettledAmount,
      pendingSettlementAmount,
      netPayout,
      periodStart: periodWin.periodStart,
      periodEnd: periodWin.periodEnd,
    });
  }

  return rows.sort((a, b) => b.netPayout - a.netPayout || b.tripCount - a.tripCount || a.driverName.localeCompare(b.driverName));
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
    return [
      item.driverId,
      'DRIVER',
      item.driverName,
      item.cabNumber ? `Cab #${item.cabNumber} (${item.commissionPercent}%)` : `${item.commissionPercent}% Share`,
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
