/**
 * Standing Orders & Recurring Rides Series Service (`standing-order.service.ts` — Platform Phase 54)
 *
 * Dual-mode persistence:
 * - Firestore `/standingOrders/{seriesId}` (`onSnapshot` + `getDocs`/`setDoc`/`updateDoc` via `sanitizePayload`)
 *   when `isFirebaseConfigured()` in browser sessions (`isDispatcher()` protected in `firestore.rules`).
 * - `localStorage` (`chesterfield_standing_orders_v1`) + deterministic in-memory store for SSR/Node tests
 *   with zero network dependency.
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { formatLocalDate, formatTime12h, generateRecurringDates } from '../../hooks/booking/booking-form.utils';
import type {
  PreferredDriverAssignmentMode,
  StandingOrderFrequency,
  StandingOrderPassenger,
  StandingOrderRoute,
  StandingOrderSchedule,
  StandingOrderSeries,
  StandingOrderStatus,
  StandingOrderWeeksPattern,
} from '../../types/standing-order';
import type {
  CreateTripInput,
  PaymentMethod,
  Trip,
  TripAuditEvent,
  TripPricing,
  TripStatusHistoryEntry,
  VehicleTier,
} from '../../types/trip';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import type { AutoDispatchDriverInput } from './auto-dispatch-ranking';
import {
  clearStagedDriver,
  hasStagedDriver,
  isTripEligibleForStaging,
  stageDriverForTrip,
} from './staged-driver-planner.service';

export const STANDING_ORDERS_STORAGE_KEY = 'chesterfield_standing_orders_v1';
export const STANDING_ORDERS_COLLECTION = 'standingOrders';

const OPEN_UNSTARTED_UNASSIGNED_STATUSES = new Set<string>([
  'CONFIRMED',
  'confirmed',
  'UNCONFIRMED',
  'unconfirmed',
  'pending',
]);

const TERMINAL_OR_EXECUTION_STATUSES = new Set<string>([
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

const CANCELLED_OR_DECLINED_STATUSES = new Set<string>([
  'cancelled',
  'declined',
  'DECLINED',
]);

let memorySeriesMap = new Map<string, StandingOrderSeries>();
let hasHydratedLocalStorage = false;
let firestoreUnsub: Unsubscribe | null = null;
const seriesSubscribers = new Set<(list: StandingOrderSeries[]) => void>();
let seriesIdSeq = 0;

function canUseClientFirestore(): boolean {
  return typeof window !== 'undefined' && isFirebaseConfigured();
}

function generateStandingOrderId(nowMs: number = Date.now()): string {
  seriesIdSeq = (seriesIdSeq + 1) % 100_000;
  const rand = Math.random().toString(36).slice(2, 6);
  return `so_${nowMs}_${seriesIdSeq.toString(36)}${rand}`;
}

export function normalizeDateStringList(dates?: ReadonlyArray<string> | null): string[] {
  if (!Array.isArray(dates)) return [];
  const valid = new Set<string>();
  for (const raw of dates) {
    const trimmed = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      valid.add(trimmed);
    }
  }
  return Array.from(valid).sort();
}

export function addLocalDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalDate(dt);
}

export function doesDateMatchStandingSchedule(
  dateStr: string,
  schedule: Pick<
    StandingOrderSchedule,
    'startDate' | 'frequency' | 'repeatDays' | 'repeatWeeksPattern' | 'untilDate'
  >
): boolean {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return false;

  if (schedule.untilDate && dateStr > schedule.untilDate) return false;
  if (schedule.startDate && dateStr < schedule.startDate) return false;

  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[dow];

  const [ay, am, ad] = String(schedule.startDate || dateStr).split('-').map(Number);
  const anchorDow = ay && am && ad ? new Date(ay, am - 1, ad).getDay() : dow;

  let matchesDay = false;
  if (schedule.frequency === 'daily') matchesDay = true;
  else if (schedule.frequency === 'weekdays') matchesDay = dow >= 1 && dow <= 5;
  else {
    matchesDay =
      schedule.repeatDays && schedule.repeatDays.length > 0
        ? schedule.repeatDays.includes(dayName)
        : dow === anchorDow;
  }

  if (!matchesDay) return false;

  if (schedule.repeatWeeksPattern && schedule.repeatWeeksPattern !== 'all' && ay && am && ad) {
    const diffDays = Math.floor(
      (Date.UTC(y, m - 1, d) - Date.UTC(ay, am - 1, ad)) / 86_400_000
    );
    const weekIndex = Math.floor(diffDays / 7);
    const parity = ((weekIndex % 2) + 2) % 2;
    return schedule.repeatWeeksPattern === 'even' ? parity === 0 : parity === 1;
  }

  return true;
}

export function resolveTripLocalDate(trip: Partial<Trip>): string | null {
  const metaDate = (trip.metadata as Record<string, unknown> | undefined)?.standingOrderDate;
  if (typeof metaDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metaDate.trim())) {
    return metaDate.trim();
  }
  if (!trip.scheduledPickupTime) return null;
  const parsed = new Date(trip.scheduledPickupTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalDate(parsed);
}

export function doesTripBelongToSeries(
  trip: Partial<Trip>,
  series: Pick<StandingOrderSeries, 'id' | 'generatedTripIds'>
): boolean {
  if (!trip || !trip.id) return false;
  const metaSeriesId = (trip.metadata as Record<string, unknown> | undefined)?.standingOrderId;
  if (typeof metaSeriesId === 'string' && metaSeriesId === series.id) {
    return true;
  }
  return Array.isArray(series.generatedTripIds) && series.generatedTripIds.includes(trip.id);
}

export function isFutureTrip(trip: Partial<Trip>, nowMs: number = Date.now()): boolean {
  if (!trip.scheduledPickupTime) return false;
  const ms = Date.parse(trip.scheduledPickupTime);
  return Number.isFinite(ms) && ms > nowMs;
}

export function formatStandingOrderCadenceSummary(series: StandingOrderSeries): string {
  const { schedule } = series;
  const time12 = formatTime12h(schedule.pickupTime || '08:00');
  let freqLabel = 'Daily';
  if (schedule.frequency === 'weekdays') {
    freqLabel = 'Weekdays (Mon–Fri)';
  } else if (schedule.frequency === 'weekly' || schedule.frequency === 'custom') {
    freqLabel =
      schedule.repeatDays.length > 0 ? schedule.repeatDays.join(', ') : 'Weekly';
  }

  const parts = [`${freqLabel} @ ${time12}`];
  if (schedule.repeatWeeksPattern === 'even') parts.push('Even Weeks (Biweekly)');
  else if (schedule.repeatWeeksPattern === 'odd') parts.push('Odd Weeks');

  if (schedule.skipDates && schedule.skipDates.length > 0) {
    parts.push(
      `${schedule.skipDates.length} Skip ${schedule.skipDates.length === 1 ? 'Date' : 'Dates'}`
    );
  }
  if (schedule.untilDate) {
    parts.push(`Until ${schedule.untilDate}`);
  }
  return parts.join(' · ');
}

function buildDefaultSeriesLabel(params: {
  passenger: StandingOrderPassenger;
  route: StandingOrderRoute;
  corporateAccountName?: string;
}): string {
  const fullName =
    [params.passenger.firstName, params.passenger.lastName]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(' ') || 'Recurring Passenger';

  const shortDest =
    String(params.route.dropoffLocation?.address || '')
      .split(',')[0]
      ?.trim() || 'Scheduled Commute';

  if (params.corporateAccountName?.trim()) {
    return `${fullName} (${params.corporateAccountName.trim()}) — ${shortDest}`;
  }
  return `${fullName} — ${shortDest}`;
}

function ensureHydratedFromLocalStorage(): void {
  if (hasHydratedLocalStorage) return;
  hasHydratedLocalStorage = true;

  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(STANDING_ORDERS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item.id === 'string') {
          memorySeriesMap.set(item.id, normalizeStandingOrderSeries(item));
        }
      }
    }
  } catch {
    // Ignore malformed local storage entries
  }
}

function normalizeStandingOrderSeries(raw: StandingOrderSeries): StandingOrderSeries {
  const hasPrefDriver = Boolean(raw.preferredDriverId);
  const resolvedMode: PreferredDriverAssignmentMode = hasPrefDriver
    ? raw.preferredDriverMode === 'send_to_driver'
      ? 'send_to_driver'
      : 'stage_hold'
    : 'unassigned';

  return {
    ...raw,
    status: raw.status || 'active',
    schedule: {
      startDate: raw.schedule?.startDate || '',
      pickupTime: raw.schedule?.pickupTime || '08:00',
      frequency: raw.schedule?.frequency || 'weekdays',
      repeatDays: Array.isArray(raw.schedule?.repeatDays) ? [...raw.schedule.repeatDays] : [],
      repeatWeeksPattern: raw.schedule?.repeatWeeksPattern || 'all',
      ...(raw.schedule?.untilDate ? { untilDate: raw.schedule.untilDate } : {}),
      skipDates: normalizeDateStringList(raw.schedule?.skipDates),
    },
    preferredDriverId: raw.preferredDriverId ?? null,
    preferredDriverLabel: raw.preferredDriverLabel ?? null,
    preferredDriverMode: resolvedMode,
    generatedTripIds: Array.isArray(raw.generatedTripIds)
      ? Array.from(new Set(raw.generatedTripIds.filter(Boolean)))
      : [],
    pausedAt: raw.pausedAt ?? null,
    pauseReason: raw.pauseReason ?? null,
  };
}

function getSortedSeriesSnapshot(): StandingOrderSeries[] {
  ensureHydratedFromLocalStorage();
  return Array.from(memorySeriesMap.values())
    .map((s) => normalizeStandingOrderSeries(s))
    .sort((a, b) => {
      const aMs = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const bMs = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return bMs - aMs;
    });
}

function persistLocalSnapshot(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const list = getSortedSeriesSnapshot();
    window.localStorage.setItem(STANDING_ORDERS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors
  }
}

function notifySeriesSubscribers(): void {
  const snapshot = getSortedSeriesSnapshot();
  for (const cb of seriesSubscribers) {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn('[standing-order.service] Subscriber error:', err);
    }
  }
}

async function persistSeriesToFirestore(
  series: StandingOrderSeries,
  isNew: boolean = false
): Promise<void> {
  if (!canUseClientFirestore()) return;
  try {
    const db = getFirestoreDb();
    const ref = doc(db, STANDING_ORDERS_COLLECTION, series.id);
    if (isNew) {
      await setDoc(ref, sanitizePayload(series));
    } else {
      try {
        await updateDoc(ref, sanitizePayload({ ...series }, { mode: 'null' }));
      } catch {
        await setDoc(ref, sanitizePayload(series));
      }
    }
  } catch (err) {
    console.warn('[standing-order.service] Firestore write fallback to local cache:', err);
  }
}

export function getStandingOrderSeriesList(): StandingOrderSeries[] {
  return getSortedSeriesSnapshot();
}

export function getStandingOrderSeriesById(seriesId: string): StandingOrderSeries | null {
  ensureHydratedFromLocalStorage();
  const found = memorySeriesMap.get(seriesId);
  return found ? normalizeStandingOrderSeries(found) : null;
}

export async function fetchStandingOrderSeriesList(): Promise<StandingOrderSeries[]> {
  ensureHydratedFromLocalStorage();
  if (canUseClientFirestore()) {
    try {
      const db = getFirestoreDb();
      const snap = await getDocs(collection(db, STANDING_ORDERS_COLLECTION));
      snap.forEach((docSnap) => {
        const data = docSnap.data() as StandingOrderSeries;
        if (data) {
          const normalized = normalizeStandingOrderSeries({
            ...data,
            id: data.id || docSnap.id,
          });
          memorySeriesMap.set(normalized.id, normalized);
        }
      });
      persistLocalSnapshot();
      notifySeriesSubscribers();
    } catch (err) {
      console.warn('[standing-order.service] Firestore getDocs fallback:', err);
    }
  }
  return getSortedSeriesSnapshot();
}

export function subscribeToStandingOrders(
  onUpdate: (seriesList: StandingOrderSeries[]) => void,
  onError?: (err: Error) => void
): () => void {
  ensureHydratedFromLocalStorage();
  seriesSubscribers.add(onUpdate);
  onUpdate(getSortedSeriesSnapshot());

  if (canUseClientFirestore() && !firestoreUnsub) {
    try {
      const db = getFirestoreDb();
      firestoreUnsub = onSnapshot(
        collection(db, STANDING_ORDERS_COLLECTION),
        (snap) => {
          snap.forEach((docSnap) => {
            const data = docSnap.data() as StandingOrderSeries;
            if (data) {
              const normalized = normalizeStandingOrderSeries({
                ...data,
                id: data.id || docSnap.id,
              });
              memorySeriesMap.set(normalized.id, normalized);
            }
          });
          persistLocalSnapshot();
          notifySeriesSubscribers();
        },
        (err) => {
          console.warn('[standing-order.service] Firestore onSnapshot fallback:', err);
          onError?.(err as Error);
        }
      );
    } catch (err) {
      console.warn('[standing-order.service] Failed attaching Firestore listener:', err);
    }
  }

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STANDING_ORDERS_STORAGE_KEY) {
      hasHydratedLocalStorage = false;
      ensureHydratedFromLocalStorage();
      onUpdate(getSortedSeriesSnapshot());
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  return () => {
    seriesSubscribers.delete(onUpdate);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
    if (seriesSubscribers.size === 0 && firestoreUnsub) {
      firestoreUnsub();
      firestoreUnsub = null;
    }
  };
}

export function resetStandingOrdersForTests(): void {
  memorySeriesMap = new Map();
  hasHydratedLocalStorage = true;
  if (firestoreUnsub) {
    firestoreUnsub();
    firestoreUnsub = null;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STANDING_ORDERS_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  notifySeriesSubscribers();
}

async function resolveSeriesTrips(
  series: StandingOrderSeries,
  existingTrips?: ReadonlyArray<Trip>,
  bookingService?: IBookingService
): Promise<Trip[]> {
  if (existingTrips) {
    return existingTrips.filter((t) => doesTripBelongToSeries(t, series));
  }
  const svc = bookingService ?? getBookingService();
  if (svc.getAllTrips) {
    const all = await svc.getAllTrips();
    return all.filter((t) => doesTripBelongToSeries(t, series));
  }
  return [];
}

async function cancelOpenSeriesTrip(params: {
  trip: Trip;
  reason: string;
  actorName?: string;
  bookingService: IBookingService;
  nowMs: number;
}): Promise<Trip> {
  const { trip, reason, actorName = 'Dispatcher', bookingService, nowMs } = params;
  const nowIso = new Date(nowMs).toISOString();

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: 'cancelled',
    timestamp: nowIso,
    actorRole: 'admin',
    reason,
  };

  const cancelAudit: TripAuditEvent = {
    action: 'TRIP_CANCELED',
    timestamp: nowIso,
    actorRole: 'dispatcher',
    referenceNumber: `CNL-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'lifecycle',
    context: `${reason} (${actorName})`,
  };

  const patch: Partial<Trip> = {
    status: 'cancelled',
    cancelledAt: nowIso,
    cancellationReason: reason,
    cancelledBy: 'admin',
    assignedDriverId: null,
    offeredToIds: [],
    plannedDriverId: null,
    plannedDriverLabel: null,
    plannedAt: null,
    plannedBy: null,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), cancelAudit],
    updatedAt: nowIso,
  };

  if (bookingService.updateTrip) {
    return await bookingService.updateTrip(trip.id, patch);
  }
  if (bookingService.updateTripStatus) {
    return await bookingService.updateTripStatus(trip.id, 'cancelled', {
      actorRole: 'admin',
      reason,
    });
  }
  return { ...trip, ...patch };
}

export interface CreateStandingOrderSeriesInput {
  id?: string;
  status?: StandingOrderStatus;
  label?: string;
  passenger: StandingOrderPassenger;
  route: StandingOrderRoute;
  schedule: {
    startDate: string;
    pickupTime: string;
    frequency: StandingOrderFrequency;
    repeatDays?: string[];
    repeatWeeksPattern?: StandingOrderWeeksPattern;
    untilDate?: string;
    skipDates?: string[];
  };
  vehicleTier: VehicleTier;
  vehicleDisplayName?: string;
  pricingSnapshot: TripPricing;
  paymentMethod: PaymentMethod;
  corporateAccountId?: string;
  corporateAccountName?: string;
  billingPo?: string;
  driverNotes?: string;
  preferredDriverId?: string | null;
  preferredDriverLabel?: string | null;
  preferredDriverMode?: PreferredDriverAssignmentMode;
  generatedTripIds?: string[];
  lastGeneratedDate?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}

export async function createStandingOrderSeries(
  input: CreateStandingOrderSeriesInput
): Promise<StandingOrderSeries> {
  ensureHydratedFromLocalStorage();
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const id = input.id?.trim() || generateStandingOrderId(nowMs);

  const hasPreferredDriver = Boolean(input.preferredDriverId);
  const preferredDriverMode: PreferredDriverAssignmentMode = hasPreferredDriver
    ? input.preferredDriverMode === 'send_to_driver'
      ? 'send_to_driver'
      : 'stage_hold'
    : 'unassigned';

  const series: StandingOrderSeries = normalizeStandingOrderSeries({
    id,
    status: input.status ?? 'active',
    label:
      input.label?.trim() ||
      buildDefaultSeriesLabel({
        passenger: input.passenger,
        route: input.route,
        corporateAccountName: input.corporateAccountName,
      }),
    passenger: {
      firstName: input.passenger.firstName,
      lastName: input.passenger.lastName,
      phone: input.passenger.phone,
      ...(input.passenger.email ? { email: input.passenger.email } : {}),
      passengerCount: Math.max(1, Number(input.passenger.passengerCount) || 1),
      luggageCount: Math.max(0, Number(input.passenger.luggageCount) || 0),
      ...(input.passenger.specialRequests
        ? { specialRequests: input.passenger.specialRequests }
        : {}),
    },
    route: {
      pickupLocation: input.route.pickupLocation,
      ...(input.route.intermediateStops && input.route.intermediateStops.length > 0
        ? { intermediateStops: input.route.intermediateStops }
        : {}),
      dropoffLocation: input.route.dropoffLocation,
    },
    schedule: {
      startDate: input.schedule.startDate,
      pickupTime: input.schedule.pickupTime || '08:00',
      frequency: input.schedule.frequency,
      repeatDays: Array.isArray(input.schedule.repeatDays) ? [...input.schedule.repeatDays] : [],
      repeatWeeksPattern: input.schedule.repeatWeeksPattern ?? 'all',
      ...(input.schedule.untilDate ? { untilDate: input.schedule.untilDate } : {}),
      skipDates: normalizeDateStringList(input.schedule.skipDates),
    },
    vehicleTier: input.vehicleTier,
    ...(input.vehicleDisplayName ? { vehicleDisplayName: input.vehicleDisplayName } : {}),
    pricingSnapshot: input.pricingSnapshot,
    paymentMethod: input.paymentMethod,
    ...(input.corporateAccountId ? { corporateAccountId: input.corporateAccountId } : {}),
    ...(input.corporateAccountName ? { corporateAccountName: input.corporateAccountName } : {}),
    ...(input.billingPo ? { billingPo: input.billingPo } : {}),
    ...(input.driverNotes ? { driverNotes: input.driverNotes } : {}),
    preferredDriverId: input.preferredDriverId ?? null,
    preferredDriverLabel: input.preferredDriverLabel ?? null,
    preferredDriverMode,
    generatedTripIds: Array.isArray(input.generatedTripIds)
      ? Array.from(new Set(input.generatedTripIds.filter(Boolean)))
      : [],
    ...(input.lastGeneratedDate
      ? { lastGeneratedDate: input.lastGeneratedDate }
      : input.schedule.startDate
      ? { lastGeneratedDate: input.schedule.startDate }
      : {}),
    pausedAt: null,
    pauseReason: null,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  memorySeriesMap.set(series.id, series);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(series, true);

  return series;
}

export interface PauseStandingOrderOptions {
  reason?: string;
  cancelFutureOpenTrips?: boolean;
  existingTrips?: ReadonlyArray<Trip>;
  bookingService?: IBookingService;
  actorName?: string;
  nowMs?: number;
}

export async function pauseStandingOrderSeries(
  seriesId: string,
  reasonOrOpts?: string | PauseStandingOrderOptions,
  extraOpts?: PauseStandingOrderOptions
): Promise<StandingOrderSeries & { cancelledTripIds: string[] }> {
  ensureHydratedFromLocalStorage();
  const existing = memorySeriesMap.get(seriesId);
  if (!existing) {
    throw new Error(`Standing order series "${seriesId}" was not found.`);
  }

  const opts: PauseStandingOrderOptions =
    typeof reasonOrOpts === 'string'
      ? { ...extraOpts, reason: reasonOrOpts }
      : { ...(reasonOrOpts || {}), ...(extraOpts || {}) };

  const nowMs = opts.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const reason = opts.reason?.trim() || null;

  const updatedSeries = normalizeStandingOrderSeries({
    ...existing,
    status: 'paused',
    pausedAt: nowIso,
    pauseReason: reason,
    updatedAt: nowIso,
  });

  memorySeriesMap.set(seriesId, updatedSeries);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(updatedSeries, false);

  const cancelledTripIds: string[] = [];
  if (opts.cancelFutureOpenTrips) {
    const svc = opts.bookingService ?? getBookingService();
    const seriesTrips = await resolveSeriesTrips(updatedSeries, opts.existingTrips, svc);
    for (const trip of seriesTrips) {
      const isFuture = isFutureTrip(trip, nowMs);
      const isOpenUnassigned =
        OPEN_UNSTARTED_UNASSIGNED_STATUSES.has(String(trip.status || '')) &&
        trip.assignedDriverId == null;
      if (isFuture && isOpenUnassigned) {
        await cancelOpenSeriesTrip({
          trip,
          reason: reason
            ? `Standing order series paused (${reason})`
            : 'Standing order series paused by dispatch',
          actorName: opts.actorName,
          bookingService: svc,
          nowMs,
        });
        cancelledTripIds.push(trip.id);
      }
    }
  }

  return {
    ...updatedSeries,
    cancelledTripIds,
  };
}

export async function resumeStandingOrderSeries(
  seriesId: string,
  opts?: { nowMs?: number }
): Promise<StandingOrderSeries> {
  ensureHydratedFromLocalStorage();
  const existing = memorySeriesMap.get(seriesId);
  if (!existing) {
    throw new Error(`Standing order series "${seriesId}" was not found.`);
  }

  const nowIso = new Date(opts?.nowMs ?? Date.now()).toISOString();
  const updatedSeries = normalizeStandingOrderSeries({
    ...existing,
    status: 'active',
    pausedAt: null,
    pauseReason: null,
    updatedAt: nowIso,
  });

  memorySeriesMap.set(seriesId, updatedSeries);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(updatedSeries, false);

  return updatedSeries;
}

export async function cancelStandingOrderSeries(
  seriesId: string,
  opts?: PauseStandingOrderOptions
): Promise<StandingOrderSeries & { cancelledTripIds: string[] }> {
  ensureHydratedFromLocalStorage();
  const existing = memorySeriesMap.get(seriesId);
  if (!existing) {
    throw new Error(`Standing order series "${seriesId}" was not found.`);
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const updatedSeries = normalizeStandingOrderSeries({
    ...existing,
    status: 'cancelled',
    pausedAt: null,
    pauseReason: opts?.reason?.trim() || 'Series cancelled',
    updatedAt: nowIso,
  });

  memorySeriesMap.set(seriesId, updatedSeries);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(updatedSeries, false);

  const cancelledTripIds: string[] = [];
  if (opts?.cancelFutureOpenTrips) {
    const svc = opts.bookingService ?? getBookingService();
    const seriesTrips = await resolveSeriesTrips(updatedSeries, opts.existingTrips, svc);
    for (const trip of seriesTrips) {
      if (
        isFutureTrip(trip, nowMs) &&
        OPEN_UNSTARTED_UNASSIGNED_STATUSES.has(String(trip.status || '')) &&
        trip.assignedDriverId == null
      ) {
        await cancelOpenSeriesTrip({
          trip,
          reason: opts.reason?.trim() || 'Standing order series cancelled',
          actorName: opts.actorName,
          bookingService: svc,
          nowMs,
        });
        cancelledTripIds.push(trip.id);
      }
    }
  }

  return {
    ...updatedSeries,
    cancelledTripIds,
  };
}

export interface UpdateStandingOrderSkipDatesOptions {
  cancelMatchingOpenTrips?: boolean;
  existingTrips?: ReadonlyArray<Trip>;
  bookingService?: IBookingService;
  actorName?: string;
  nowMs?: number;
}

export async function updateStandingOrderSkipDates(
  seriesId: string,
  skipDates: string[],
  opts?: UpdateStandingOrderSkipDatesOptions
): Promise<StandingOrderSeries & { cancelledTripIds: string[]; newlyAddedSkipDates: string[] }> {
  ensureHydratedFromLocalStorage();
  const existing = memorySeriesMap.get(seriesId);
  if (!existing) {
    throw new Error(`Standing order series "${seriesId}" was not found.`);
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const previousSet = new Set(existing.schedule.skipDates || []);
  const normalizedSkipDates = normalizeDateStringList(skipDates);
  const newlyAddedSkipDates = normalizedSkipDates.filter((d) => !previousSet.has(d));

  const updatedSeries = normalizeStandingOrderSeries({
    ...existing,
    schedule: {
      ...existing.schedule,
      skipDates: normalizedSkipDates,
    },
    updatedAt: nowIso,
  });

  memorySeriesMap.set(seriesId, updatedSeries);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(updatedSeries, false);

  const cancelledTripIds: string[] = [];
  if (opts?.cancelMatchingOpenTrips && newlyAddedSkipDates.length > 0) {
    const newlySkippedSet = new Set(newlyAddedSkipDates);
    const svc = opts.bookingService ?? getBookingService();
    const seriesTrips = await resolveSeriesTrips(updatedSeries, opts.existingTrips, svc);

    for (const trip of seriesTrips) {
      if (!isFutureTrip(trip, nowMs)) continue;
      if (TERMINAL_OR_EXECUTION_STATUSES.has(String(trip.status || ''))) continue;

      const tripDate = resolveTripLocalDate(trip);
      if (tripDate && newlySkippedSet.has(tripDate)) {
        await cancelOpenSeriesTrip({
          trip,
          reason: `Holiday / skip date excluded on Standing Order (${tripDate})`,
          actorName: opts.actorName,
          bookingService: svc,
          nowMs,
        });
        cancelledTripIds.push(trip.id);
      }
    }
  }

  return {
    ...updatedSeries,
    cancelledTripIds,
    newlyAddedSkipDates,
  };
}

export interface AssignPreferredDriverToSeriesParams {
  seriesId: string;
  driverId: string | null;
  driverLabel: string | null;
  mode: PreferredDriverAssignmentMode;
  applyToExistingFutureTrips?: boolean;
  actorEmail?: string;
  existingTrips?: ReadonlyArray<Trip>;
  drivers?: ReadonlyArray<AutoDispatchDriverInput>;
  bookingService?: IBookingService;
  nowMs?: number;
}

export async function assignPreferredDriverToSeries(
  params: AssignPreferredDriverToSeriesParams
): Promise<StandingOrderSeries & { updatedTripIds: string[]; updatedTrips: Trip[] }> {
  ensureHydratedFromLocalStorage();
  const existing = memorySeriesMap.get(params.seriesId);
  if (!existing) {
    throw new Error(`Standing order series "${params.seriesId}" was not found.`);
  }

  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cleanDriverId = params.driverId?.trim() || null;
  const resolvedMode: PreferredDriverAssignmentMode =
    !cleanDriverId || params.mode === 'unassigned' ? 'unassigned' : params.mode;
  const cleanLabel =
    resolvedMode === 'unassigned' ? null : params.driverLabel?.trim() || cleanDriverId;

  const updatedSeries = normalizeStandingOrderSeries({
    ...existing,
    preferredDriverId: resolvedMode === 'unassigned' ? null : cleanDriverId,
    preferredDriverLabel: cleanLabel,
    preferredDriverMode: resolvedMode,
    updatedAt: nowIso,
  });

  memorySeriesMap.set(params.seriesId, updatedSeries);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(updatedSeries, false);

  const updatedTrips: Trip[] = [];
  if (params.applyToExistingFutureTrips) {
    const svc = params.bookingService ?? getBookingService();
    const actorName = params.actorEmail?.trim() || 'Dispatcher';
    const seriesTrips = await resolveSeriesTrips(updatedSeries, params.existingTrips, svc);

    const matchedRosterDriver = cleanDriverId
      ? params.drivers?.find((d) => d.id === cleanDriverId)
      : undefined;

    const driverInput: AutoDispatchDriverInput | null = cleanDriverId
      ? matchedRosterDriver || {
          id: cleanDriverId,
          name: cleanLabel || cleanDriverId,
          formattedLabel: cleanLabel || cleanDriverId,
        }
      : null;

    for (const trip of seriesTrips) {
      if (!isFutureTrip(trip, nowMs)) continue;
      if (TERMINAL_OR_EXECUTION_STATUSES.has(String(trip.status || ''))) continue;

      if (resolvedMode === 'unassigned' || !driverInput) {
        if (hasStagedDriver(trip)) {
          const cleared = await clearStagedDriver({
            tripId: trip.id,
            trip,
            actorName,
            reason: 'Cleared preferred driver from Standing Order series',
            bookingService: svc,
            nowMs,
          });
          updatedTrips.push(cleared);
        } else if (trip.assignedDriverId) {
          const patch: Partial<Trip> = {
            status: 'CONFIRMED',
            assignedDriverId: null,
            offeredToIds: [],
            plannedDriverId: null,
            plannedDriverLabel: null,
            plannedAt: null,
            plannedBy: null,
            updatedAt: nowIso,
          };
          const updated = svc.updateTrip
            ? await svc.updateTrip(trip.id, patch)
            : ({ ...trip, ...patch } as Trip);
          updatedTrips.push(updated);
        }
      } else if (resolvedMode === 'stage_hold') {
        let stageableTrip = trip;
        if (trip.assignedDriverId) {
          const resetPatch: Partial<Trip> = {
            status: 'CONFIRMED',
            assignedDriverId: null,
            offeredToIds: [],
            updatedAt: nowIso,
          };
          stageableTrip = svc.updateTrip
            ? await svc.updateTrip(trip.id, resetPatch)
            : ({ ...trip, ...resetPatch } as Trip);
        }
        if (isTripEligibleForStaging(stageableTrip)) {
          const staged = await stageDriverForTrip({
            tripId: stageableTrip.id,
            trip: stageableTrip,
            driver: driverInput,
            actorName,
            bookingService: svc,
            nowMs,
          });
          updatedTrips.push(staged);
        }
      } else if (resolvedMode === 'send_to_driver') {
        const assignAudit: TripAuditEvent = {
          action: 'DRIVER_ASSIGNED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: `ASN-${Math.floor(1000 + Math.random() * 9000)}`,
          referenceType: 'lifecycle',
          context: `Assigned preferred series driver ${cleanLabel || driverInput.id} (${actorName})`,
        };
        const patch: Partial<Trip> = {
          status: 'assigned',
          assignedDriverId: driverInput.id,
          offeredToIds: [],
          plannedDriverId: null,
          plannedDriverLabel: null,
          plannedAt: null,
          plannedBy: null,
          metadata: {
            ...(trip.metadata || {}),
            assignedDriverName: driverInput.name,
            ...(driverInput.phone ? { assignedDriverPhone: driverInput.phone } : {}),
          },
          auditLog: [...(trip.auditLog || []), assignAudit],
          updatedAt: nowIso,
        };
        const assigned = svc.updateTrip
          ? await svc.updateTrip(trip.id, patch)
          : ({ ...trip, ...patch } as Trip);
        updatedTrips.push(assigned);
      }
    }
  }

  return {
    ...updatedSeries,
    updatedTripIds: updatedTrips.map((t) => t.id),
    updatedTrips,
  };
}

export interface ExtendStandingOrderHorizonParams {
  seriesId: string;
  additionalOccurrences?: number;
  extendDays?: number;
  existingTrips: Trip[];
  bookingService?: IBookingService;
  actorName?: string;
  nowMs?: number;
}

export interface ExtendStandingOrderHorizonResult {
  series: StandingOrderSeries;
  createdTrips: Trip[];
  skippedDates: string[];
}

export async function extendStandingOrderHorizon(
  params: ExtendStandingOrderHorizonParams
): Promise<ExtendStandingOrderHorizonResult> {
  ensureHydratedFromLocalStorage();
  const series = memorySeriesMap.get(params.seriesId);
  if (!series) {
    throw new Error(`Standing order series "${params.seriesId}" was not found.`);
  }
  if (series.status === 'cancelled' || series.status === 'completed') {
    throw new Error(`Cannot extend a ${series.status} standing order series.`);
  }

  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const svc = params.bookingService ?? getBookingService();
  const actorName = params.actorName?.trim() || series.createdBy || 'Standing Order Engine';

  // Identify existing active dates on this series for strict deduplication
  const existingActiveDates = new Set<string>();
  let latestExistingDate = '';

  for (const trip of params.existingTrips || []) {
    if (!doesTripBelongToSeries(trip, series)) continue;
    const d = resolveTripLocalDate(trip);
    if (!d) continue;
    if (d > latestExistingDate) latestExistingDate = d;
    if (!CANCELLED_OR_DECLINED_STATUSES.has(String(trip.status || ''))) {
      existingActiveDates.add(d);
    }
  }

  const baseDateStr =
    [series.lastGeneratedDate || '', latestExistingDate, series.schedule.startDate || '']
      .filter(Boolean)
      .sort()
      .pop() || formatLocalDate(new Date(nowMs));

  const dayAfterBaseStr = addLocalDays(baseDateStr, 1);

  let effectiveUntilDate = series.schedule.untilDate || undefined;
  let targetOccurrences = params.additionalOccurrences ?? 5;

  if (typeof params.extendDays === 'number' && params.extendDays > 0) {
    const horizonWindowEnd = addLocalDays(baseDateStr, params.extendDays);
    effectiveUntilDate =
      effectiveUntilDate && effectiveUntilDate < horizonWindowEnd
        ? effectiveUntilDate
        : horizonWindowEnd;
    if (params.additionalOccurrences === undefined) {
      targetOccurrences = Math.min(60, Math.max(1, params.extendDays));
    }
  }

  targetOccurrences = Math.min(60, Math.max(1, targetOccurrences));

  const combinedExclusions = Array.from(
    new Set([...(series.schedule.skipDates || []), ...existingActiveDates])
  );

  const targetDates = generateRecurringDates(
    dayAfterBaseStr,
    series.schedule.frequency,
    series.schedule.repeatDays,
    targetOccurrences,
    effectiveUntilDate,
    {
      repeatWeeksPattern: series.schedule.repeatWeeksPattern,
      skipDates: combinedExclusions,
      maxCap: 60,
      includeStartDate: true,
      anchorDateStr: series.schedule.startDate || dayAfterBaseStr,
    }
  );

  const scanEndStr =
    targetDates.length > 0 ? targetDates[targetDates.length - 1] : effectiveUntilDate;

  const skippedDates = (series.schedule.skipDates || []).filter((skipDate) => {
    if (skipDate < dayAfterBaseStr) return false;
    if (scanEndStr && skipDate > scanEndStr) return false;
    return doesDateMatchStandingSchedule(skipDate, series.schedule);
  });

  const createdTrips: Trip[] = [];
  const baseOccurrenceCount = series.generatedTripIds.length;

  for (let i = 0; i < targetDates.length; i++) {
    const dateStr = targetDates[i];
    const scheduledPickupTime = new Date(
      `${dateStr}T${series.schedule.pickupTime || '08:00'}:00`
    ).toISOString();

    const createPayload: CreateTripInput = {
      status: 'CONFIRMED',
      bookingType: 'scheduled',
      scheduledPickupTime,
      ...(series.corporateAccountId ? { corporateAccountId: series.corporateAccountId } : {}),
      pickupLocation: series.route.pickupLocation,
      ...(series.route.intermediateStops && series.route.intermediateStops.length > 0
        ? { intermediateStops: series.route.intermediateStops }
        : {}),
      dropoffLocation: series.route.dropoffLocation,
      passenger: {
        firstName: series.passenger.firstName,
        lastName: series.passenger.lastName,
        email: series.passenger.email || '',
        phone: series.passenger.phone,
        passengerCount: series.passenger.passengerCount,
        luggageCount: series.passenger.luggageCount,
        ...(series.passenger.specialRequests
          ? { specialRequests: series.passenger.specialRequests }
          : {}),
      },
      vehicleTier: series.vehicleTier,
      ...(series.driverNotes ? { driverNotes: series.driverNotes } : {}),
      pricing: series.pricingSnapshot,
      payment: {
        method: series.paymentMethod,
        status: 'pending',
        amount: series.pricingSnapshot.totalFare,
        ...(series.corporateAccountId ? { corporateAccountId: series.corporateAccountId } : {}),
      },
      metadata: {
        ...(series.metadata || {}),
        standingOrderId: series.id,
        standingOrderLabel: series.label,
        standingOrderDate: dateStr,
        recurringOccurrenceIndex: baseOccurrenceCount + i + 1,
        ...(series.vehicleDisplayName ? { vehicleDisplayName: series.vehicleDisplayName } : {}),
        ...(series.corporateAccountName
          ? { corporateOrgName: series.corporateAccountName }
          : {}),
        ...(series.billingPo ? { billingPo: series.billingPo } : {}),
        createdByRole: 'dispatcher',
      },
    };

    let trip = await svc.createBooking(createPayload);
    if ((trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed') && svc.updateTrip) {
      trip = await svc.updateTrip(trip.id, { status: 'CONFIRMED' });
    }

    if (series.preferredDriverId) {
      if (series.preferredDriverMode === 'send_to_driver') {
        const assignAudit: TripAuditEvent = {
          action: 'DRIVER_ASSIGNED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: `ASN-${Math.floor(1000 + Math.random() * 9000)}`,
          referenceType: 'lifecycle',
          context: `Auto-assigned standing order preferred driver ${
            series.preferredDriverLabel || series.preferredDriverId
          }`,
        };
        const assignPatch: Partial<Trip> = {
          status: 'assigned',
          assignedDriverId: series.preferredDriverId,
          offeredToIds: [],
          plannedDriverId: null,
          plannedDriverLabel: null,
          plannedAt: null,
          plannedBy: null,
          metadata: {
            ...(trip.metadata || {}),
            assignedDriverName: series.preferredDriverLabel || series.preferredDriverId,
          },
          auditLog: [...(trip.auditLog || []), assignAudit],
          updatedAt: nowIso,
        };
        trip = svc.updateTrip
          ? await svc.updateTrip(trip.id, assignPatch)
          : ({ ...trip, ...assignPatch } as Trip);
      } else {
        // Default: 'stage_hold' — hold safely in Dispatch Shift Planner with zero /app/driver leak
        trip = await stageDriverForTrip({
          tripId: trip.id,
          trip,
          driver: {
            id: series.preferredDriverId,
            name: series.preferredDriverLabel || series.preferredDriverId,
            formattedLabel: series.preferredDriverLabel || series.preferredDriverId,
          },
          actorName,
          bookingService: svc,
          nowMs,
        });
      }
    }

    createdTrips.push(trip);
  }

  const nextGeneratedIds = Array.from(
    new Set([...series.generatedTripIds, ...createdTrips.map((t) => t.id)])
  );
  const nextLastGeneratedDate =
    targetDates.length > 0
      ? targetDates[targetDates.length - 1]
      : series.lastGeneratedDate || baseDateStr;

  const updatedSeries = normalizeStandingOrderSeries({
    ...series,
    generatedTripIds: nextGeneratedIds,
    lastGeneratedDate: nextLastGeneratedDate,
    updatedAt: nowIso,
  });

  memorySeriesMap.set(series.id, updatedSeries);
  persistLocalSnapshot();
  notifySeriesSubscribers();
  await persistSeriesToFirestore(updatedSeries, false);

  return {
    series: updatedSeries,
    createdTrips,
    skippedDates,
  };
}

export interface RegisterStandingOrderFromBookingParams {
  primaryTrips: Trip[];
  recurringOccurrences: Array<{ date: string; trips: Trip[] }>;
  passenger: StandingOrderPassenger;
  route: StandingOrderRoute;
  schedule: {
    startDate: string;
    pickupTime: string;
    frequency: StandingOrderFrequency;
    repeatDays: string[];
    repeatWeeksPattern: StandingOrderWeeksPattern;
    untilDate?: string;
    skipDates?: string[];
  };
  vehicleTier: VehicleTier;
  vehicleDisplayName?: string;
  pricingSnapshot: TripPricing;
  paymentMethod: PaymentMethod;
  corporateAccountId?: string;
  corporateAccountName?: string;
  billingPo?: string;
  driverNotes?: string;
  driverId?: string;
  driverLabel?: string | null;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  createdBy?: string;
  metadata?: Record<string, unknown>;
  bookingService?: IBookingService;
}

/**
 * Registers a StandingOrderSeries from DispatchBookingEngine's recurring creation batch,
 * stamps `metadata.standingOrderId` & `metadata.standingOrderLabel` onto both primary &
 * generated recurring trips, and stages/assigns the selected driver onto future occurrences.
 */
export async function registerStandingOrderFromDispatchBooking(
  params: RegisterStandingOrderFromBookingParams
): Promise<StandingOrderSeries> {
  const svc = params.bookingService ?? getBookingService();
  const hasSelectedDriver = Boolean(params.driverId && params.driverId !== 'unassigned');
  const preferredDriverMode: PreferredDriverAssignmentMode = hasSelectedDriver
    ? params.driverAssignmentMode === 'send_to_driver'
      ? 'send_to_driver'
      : 'stage_hold'
    : 'unassigned';

  const allRecurringTrips = params.recurringOccurrences.flatMap((o) => o.trips);
  const allGeneratedTripIds = [
    ...params.primaryTrips.map((t) => t.id),
    ...allRecurringTrips.map((t) => t.id),
  ];
  const lastGeneratedDate =
    params.recurringOccurrences.length > 0
      ? params.recurringOccurrences[params.recurringOccurrences.length - 1].date
      : params.schedule.startDate;

  const series = await createStandingOrderSeries({
    passenger: params.passenger,
    route: params.route,
    schedule: params.schedule,
    vehicleTier: params.vehicleTier,
    vehicleDisplayName: params.vehicleDisplayName,
    pricingSnapshot: params.pricingSnapshot,
    paymentMethod: params.paymentMethod,
    corporateAccountId: params.corporateAccountId,
    corporateAccountName: params.corporateAccountName,
    billingPo: params.billingPo,
    driverNotes: params.driverNotes,
    preferredDriverId: hasSelectedDriver ? params.driverId! : null,
    preferredDriverLabel: hasSelectedDriver
      ? params.driverLabel || params.driverId!
      : null,
    preferredDriverMode,
    generatedTripIds: allGeneratedTripIds,
    lastGeneratedDate,
    createdBy: params.createdBy,
    metadata: params.metadata,
  });

  // Stamp primary outbound trips with standingOrderId & standingOrderLabel
  for (const primaryTrip of params.primaryTrips) {
    const mergedMeta = {
      ...(primaryTrip.metadata || {}),
      standingOrderId: series.id,
      standingOrderLabel: series.label,
      standingOrderDate: params.schedule.startDate,
      recurringOccurrenceIndex: 1,
    };
    primaryTrip.metadata = mergedMeta;
    if (svc.updateTrip) {
      try {
        await svc.updateTrip(primaryTrip.id, { metadata: mergedMeta });
      } catch {
        // Non-fatal
      }
    }
  }

  // Stamp recurring occurrence trips + stage/assign selected driver on Car 1 of each occurrence
  for (let occIdx = 0; occIdx < params.recurringOccurrences.length; occIdx++) {
    const occ = params.recurringOccurrences[occIdx];
    for (let cIdx = 0; cIdx < occ.trips.length; cIdx++) {
      let occTrip = occ.trips[cIdx];
      const mergedMeta = {
        ...(occTrip.metadata || {}),
        standingOrderId: series.id,
        standingOrderLabel: series.label,
        standingOrderDate: occ.date,
        recurringOccurrenceIndex: occIdx + 2,
      };

      if (svc.updateTrip) {
        try {
          occTrip = await svc.updateTrip(occTrip.id, { metadata: mergedMeta });
        } catch {
          occTrip = { ...occTrip, metadata: mergedMeta };
        }
      } else {
        occTrip = { ...occTrip, metadata: mergedMeta };
      }

      if (cIdx === 0 && hasSelectedDriver && params.driverId) {
        if (preferredDriverMode === 'stage_hold') {
          try {
            await stageDriverForTrip({
              tripId: occTrip.id,
              trip: occTrip,
              driver: {
                id: params.driverId,
                name: params.driverLabel || params.driverId,
                formattedLabel: params.driverLabel || params.driverId,
              },
              actorName: params.createdBy || 'Dispatcher',
              bookingService: svc,
            });
          } catch {
            // Non-fatal
          }
        } else if (preferredDriverMode === 'send_to_driver' && svc.updateTripStatus) {
          try {
            await svc.updateTripStatus(occTrip.id, 'assigned', {
              assignedDriverId: params.driverId,
              actorRole: 'admin',
              reason: `Directly assigned standing order occurrence to ${
                params.driverLabel || params.driverId
              }`,
            });
          } catch {
            // Non-fatal
          }
        }
      }
    }
  }

  return series;
}
