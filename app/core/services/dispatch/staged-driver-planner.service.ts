/**
 * Staged Driver Shift Planner, Chronological Turnaround/Overlap Checker & Auto-Release Service
 * (`staged-driver-planner.service.ts` — Platform Phase 51)
 *
 * Architectural & Security Invariants:
 * 1. Zero `/app/driver` Leak: Staging a driver sets ONLY `plannedDriverId`, `plannedDriverLabel`,
 *    `plannedAt`, and `plannedBy` (plus `DRIVER_STAGED` audit log) while keeping `assignedDriverId: null`
 *    and `offeredToIds: []`. Under `firestore.rules`, drivers cannot read or list staged trips, and zero
 *    push/SMS notifications are emitted when staging.
 * 2. Strict Wording: Operator-facing summaries and errors use "Send to Driver" / "Staged" (never "HUD Now").
 * 3. Pure & Deterministic: Browser/SSR/Node-safe with injectable `nowMs`, `bookingService`, and `sendPush`.
 */

import { detectAirportInAddresses } from '../../config/airports';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
  type AppSettings,
  type DispatchAutomationConfig,
  type FleetCarConfig,
} from '../../types/config';
import type { DriverDutyStatus } from '../../types/driver';
import type { PhysicalFleetAsset } from '../../types/fleet';
import type {
  Trip,
  TripAuditEvent,
  TripOfferCascade,
  TripStatus,
  TripStatusHistoryEntry,
} from '../../types/trip';
import { authorizedFetch } from '../auth/auth-headers';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { formatDriverOfferNotificationPayload } from '../notifications/push-notification.service';
import { formatDriverAssignmentLabel } from '../operator.service';
import {
  evaluateDriverVehicleCompatibility,
  findDriverFleetVehicle,
  resolveDriverFrozenVehicleSnapshot,
  type AutoDispatchDriverInput,
  type RankedDispatchCandidate,
} from './auto-dispatch-ranking';
import type { PushOfferSender } from './auto-dispatch.service';

export type StagedConflictResolutionStrategy =
  | 'keep_staged'
  | 'skip_staged'
  | 'override_staged';

export type DriverTimelineConflictStatus = 'ok' | 'tight_turnaround' | 'overlap';

export interface DriverScheduleTimelineItem {
  trip: Trip;
  assignmentState: 'active' | 'assigned' | 'staged';
  scheduledPickupMs: number | null;
  projectedPickupMs: number;
  projectedDropoffMs: number;
  durationMinutes: number;
  bufferMinutesAfterPrior: number | null;
  conflictStatus: DriverTimelineConflictStatus;
}

export interface DriverScheduleTimelineSummary {
  driverId: string;
  items: DriverScheduleTimelineItem[];
  overlapCount: number;
  tightTurnaroundCount: number;
  stagedCount: number;
  assignedCount: number;
  activeCount: number;
  totalFare: number;
  totalDurationMinutes: number;
}

export interface StageDriverForTripParams {
  tripId: string;
  trip?: Trip;
  driver: AutoDispatchDriverInput;
  actorName: string;
  actorId?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  bookingService?: IBookingService;
  nowMs?: number;
}

export interface ClearStagedDriverParams {
  tripId: string;
  trip?: Trip;
  actorName: string;
  actorId?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  reason?: string;
  bookingService?: IBookingService;
  nowMs?: number;
}

export interface SendStagedTripToDriverParams {
  trip: Trip;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  actorName: string;
  actorId?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  mode?: 'direct_assign' | 'offer_first';
  offerTimeoutSeconds?: number;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export interface SendStagedTripResult {
  trip: Trip;
  driverId: string;
  driverLabel: string;
  mode: 'direct_assign' | 'offer_first';
}

export interface SendMultipleStagedTripsParams {
  trips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  actorName: string;
  actorId?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  mode?: 'direct_assign' | 'offer_first';
  requireOnDuty?: boolean;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export interface SendMultipleStagedTripsSummary {
  sentCount: number;
  skippedOfflineOrInvalid: number;
  updatedTrips: Trip[];
  results: Array<{
    tripId: string;
    sent: boolean;
    trip?: Trip;
    driverId?: string;
    driverLabel?: string;
    reason?: string;
  }>;
}

export interface AutoStageSuggestionItem {
  tripId: string;
  tripNumber: string;
  driverId: string;
  driverLabel: string;
  bufferMinutesAfterPrior: number | null;
  scheduledPickupTime: string;
}

export interface ComputeAutoStageSuggestionsParams {
  trips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  settings?: Partial<AppSettings> | null;
  /** Optional full workspace trip list so existing commitments outside a filtered view are honored */
  allTrips?: ReadonlyArray<Trip>;
  tightBufferMinutes?: number;
  nowMs?: number;
}

export interface AutoStageSuggestionsResult {
  suggestions: AutoStageSuggestionItem[];
  unmatchedTripIds: string[];
}

export interface StagedAutoReleaseAlert {
  trip: Trip;
  tripId: string;
  driverId: string;
  driverLabel: string;
  reason: 'staged_driver_offline' | 'staged_driver_conflict';
  message: string;
}

export interface ReleaseDueStagedTripsParams {
  trips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  settings?: Partial<AppSettings> | null;
  actorName?: string;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export interface ReleaseDueStagedTripsResult {
  dueCount: number;
  releasedTrips: Trip[];
  alerts: StagedAutoReleaseAlert[];
}

const NON_STAGEABLE_STATUSES = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
  'en_route',
  'arrived',
  'in_progress',
]);

const TERMINAL_OR_REJECTED_STATUSES = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

const ACTIVE_EXECUTION_STATUSES = new Set<string>(['en_route', 'arrived', 'in_progress']);

async function defaultSendDriverPush(targetDriverId: string, trip: Trip): Promise<void> {
  if (typeof window === 'undefined' || !targetDriverId) return;
  try {
    const formatted = formatDriverOfferNotificationPayload(trip);
    await authorizedFetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_push',
        targetUid: targetDriverId,
        notification: {
          title: formatted.title,
          body: formatted.body,
          url: formatted.url,
          tag: formatted.tag,
          requireInteraction: true,
        },
      }),
    });
  } catch {
    // Non-fatal: active Driver PWA clients also receive assignments via Firestore snapshot
  }
}

function triggerDriverPush(
  driverId: string,
  trip: Trip,
  sendPush?: PushOfferSender | false
): void {
  if (sendPush === false || !driverId) return;
  const pushFn = typeof sendPush === 'function' ? sendPush : defaultSendDriverPush;
  Promise.resolve(pushFn(driverId, trip)).catch(() => {});
}

async function resolveTripFromParams(
  tripId: string,
  suppliedTrip: Trip | undefined,
  bookingService: IBookingService
): Promise<Trip> {
  if (suppliedTrip) return suppliedTrip;

  if (bookingService.getBookingStatus) {
    const res = await bookingService.getBookingStatus(tripId);
    if (res?.trip) return res.trip;
  }

  if (bookingService.getAllTrips) {
    const all = await bookingService.getAllTrips();
    const match = all.find((t) => t.id === tripId);
    if (match) return match;
  }

  throw new Error(`Trip "${tripId}" could not be found.`);
}

export function formatShortTripNumber(tripId: string): string {
  const clean = String(tripId || '').trim();
  if (!clean) return 'TRIP';
  return clean.length > 6 ? clean.slice(-6).toUpperCase() : clean.toUpperCase();
}

export function resolveStagedDriverLabel(driver: AutoDispatchDriverInput): string {
  const formatted = formatDriverAssignmentLabel({
    name: driver.name,
    cabNumber: driver.cabNumber,
    assignedUnit: driver.vehicleUnit,
    vehicle: driver.vehicle,
    zone: driver.zone,
    status: driver.status,
    isBlacklisted: driver.isBlacklisted,
  });
  return formatted || driver.formattedLabel?.trim() || driver.name || driver.id;
}

export function isDriverBlacklistedOrSuspended(
  driver?: AutoDispatchDriverInput | null
): boolean {
  if (!driver) return true;
  return Boolean(
    driver.isBlacklisted ||
      driver.isArchived ||
      driver.zone === 'Suspended' ||
      driver.isVehicleGrounded ||
      driver.isVehicleBlacklisted ||
      (driver.vehicleStatus && driver.vehicleStatus !== 'active')
  );
}

export function isDriverCurrentlyOnDuty(driver?: AutoDispatchDriverInput | null): boolean {
  if (!driver || isDriverBlacklistedOrSuspended(driver)) return false;

  const resolvedDuty: DriverDutyStatus =
    driver.dutyStatus ||
    (driver.mapStatus === 'offline' || driver.status === 'offline'
      ? 'off_duty'
      : driver.mapStatus === 'break' || driver.status === 'break'
      ? 'on_break'
      : 'on_duty');

  if (
    resolvedDuty !== 'on_duty' ||
    driver.mapStatus === 'offline' ||
    driver.mapStatus === 'break' ||
    driver.status === 'offline' ||
    driver.status === 'break'
  ) {
    return false;
  }

  return true;
}

/**
 * True when a trip has a staged driver placeholder (`plannedDriverId`) and is not yet assigned.
 */
export function hasStagedDriver(trip?: Partial<Trip> | null): boolean {
  return Boolean(trip && !trip.assignedDriverId && trip.plannedDriverId);
}

/**
 * True when a trip is open/unassigned and eligible for staging a driver placeholder.
 */
export function isTripEligibleForStaging(trip?: Partial<Trip> | null): boolean {
  if (!trip) return false;
  if (trip.assignedDriverId) return false;
  if (trip.isArchived || trip.isBlacklisted) return false;
  const status = String(trip.status || '');
  if (!status || NON_STAGEABLE_STATUSES.has(status)) return false;
  return true;
}

/**
 * Resolves estimated ride leg duration in minutes (minimum 15m).
 * Inspects `trip.route?.durationMinutes`, `trip.pricing?.durationMinutes`, or distance fallback.
 */
export function resolveTripEstimatedDurationMinutes(
  trip: Partial<Trip>,
  defaultDurationMinutes: number = 25
): number {
  const routeDur = Number((trip as Record<string, any>)?.route?.durationMinutes || 0);
  if (Number.isFinite(routeDur) && routeDur > 0) {
    return Math.max(15, Math.round(routeDur));
  }

  const pricingDur = Number(trip.pricing?.durationMinutes || 0);
  if (Number.isFinite(pricingDur) && pricingDur > 0) {
    return Math.max(15, Math.round(pricingDur));
  }

  const distanceMiles = Number(
    (trip as Record<string, any>)?.route?.distanceMiles ?? trip.pricing?.distanceMiles ?? 0
  );
  if (Number.isFinite(distanceMiles) && distanceMiles > 0) {
    return Math.max(15, Math.ceil(distanceMiles * 2.2 + 5));
  }

  return Math.max(15, Math.round(defaultDurationMinutes));
}

/**
 * Stages a driver placeholder (`plannedDriverId`) on an open trip without assigning or notifying `/app/driver`.
 */
export async function stageDriverForTrip(
  params: StageDriverForTripParams
): Promise<Trip> {
  const {
    tripId,
    trip: suppliedTrip,
    driver,
    actorName,
    actorId,
    actorRole = 'dispatcher',
    bookingService = getBookingService(),
    nowMs = Date.now(),
  } = params;

  if (!driver || !driver.id) {
    throw new Error('A valid driver is required to stage a trip.');
  }

  if (isDriverBlacklistedOrSuspended(driver)) {
    throw new Error(
      `Cannot stage ${driver.name || driver.id}: driver or assigned vehicle is suspended or blacklisted.`
    );
  }

  const targetTrip = await resolveTripFromParams(tripId, suppliedTrip, bookingService);

  if (!isTripEligibleForStaging(targetTrip)) {
    throw new Error(
      `Trip #${formatShortTripNumber(targetTrip.id)} is already assigned or in a non-stageable status (${targetTrip.status}).`
    );
  }

  const nowIso = new Date(nowMs).toISOString();
  const plannedDriverLabel = resolveStagedDriverLabel(driver);
  const resolvedActor = actorName?.trim() || 'Dispatcher';

  const cabDigitsMatch = String(driver.cabNumber || driver.vehicleUnit || driver.vehicle || '').match(
    /#?(\d+)/
  );
  const humanDriverTag = cabDigitsMatch
    ? `#${cabDigitsMatch[1]} (${driver.name.split(' ')[0] || driver.name})`
    : plannedDriverLabel;

  const auditEvent: TripAuditEvent = {
    action: 'DRIVER_STAGED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `STG-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'lifecycle',
    context: `Staged ${humanDriverTag} as planned driver — held in Dispatch`,
  };

  const patch: Partial<Trip> = {
    plannedDriverId: driver.id,
    plannedDriverLabel,
    plannedAt: nowIso,
    plannedBy: resolvedActor,
    assignedDriverId: null,
    offeredToIds: [],
    auditLog: [...(targetTrip.auditLog || []), auditEvent],
    updatedAt: nowIso,
  };

  if (bookingService.updateTrip) {
    return await bookingService.updateTrip(targetTrip.id, patch);
  }

  return {
    ...targetTrip,
    ...patch,
  };
}

/**
 * Clears any staged driver placeholder (`plannedDriverId -> null`) and logs `DRIVER_UNSTAGED`.
 */
export async function clearStagedDriver(
  params: ClearStagedDriverParams
): Promise<Trip> {
  const {
    tripId,
    trip: suppliedTrip,
    actorName,
    actorId,
    actorRole = 'dispatcher',
    reason,
    bookingService = getBookingService(),
    nowMs = Date.now(),
  } = params;

  const targetTrip = await resolveTripFromParams(tripId, suppliedTrip, bookingService);
  const nowIso = new Date(nowMs).toISOString();
  const prevLabel = targetTrip.plannedDriverLabel || targetTrip.plannedDriverId || 'planned driver';
  const resolvedActor = actorName?.trim() || 'Dispatcher';

  const auditEvent: TripAuditEvent = {
    action: 'DRIVER_UNSTAGED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `UST-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'lifecycle',
    context: reason
      ? `Cleared staged driver ${prevLabel} by ${resolvedActor} (${reason})`
      : `Cleared staged driver ${prevLabel} by ${resolvedActor}`,
  };

  const patch: Partial<Trip> = {
    plannedDriverId: null,
    plannedDriverLabel: null,
    plannedAt: null,
    plannedBy: null,
    auditLog: [...(targetTrip.auditLog || []), auditEvent],
    updatedAt: nowIso,
  };

  if (bookingService.updateTrip) {
    return await bookingService.updateTrip(targetTrip.id, patch);
  }

  return {
    ...targetTrip,
    ...patch,
  };
}

/**
 * Promotes a staged trip (`plannedDriverId`) into a live driver assignment (`assignedDriverId`)
 * or live offer (`offeredToIds`), freezes `assignedVehicle`, clears staging placeholders,
 * records audit provenance, and triggers push notification.
 */
export async function sendStagedTripToDriver(
  params: SendStagedTripToDriverParams
): Promise<SendStagedTripResult> {
  const {
    trip,
    drivers,
    actorName,
    actorId,
    actorRole = 'dispatcher',
    mode = 'direct_assign',
    offerTimeoutSeconds = 45,
    fleetVehicles,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  if (!trip || !trip.plannedDriverId) {
    throw new Error(
      `Trip #${formatShortTripNumber(trip?.id || '')} does not have a staged driver to send.`
    );
  }

  if (trip.assignedDriverId) {
    throw new Error(
      `Trip #${formatShortTripNumber(trip.id)} is already assigned to driver ${trip.assignedDriverId}.`
    );
  }

  const matchedDriver = drivers.find((d) => d.id === trip.plannedDriverId);
  if (!matchedDriver) {
    throw new Error(
      `Staged driver (${trip.plannedDriverLabel || trip.plannedDriverId}) was not found in the active driver roster.`
    );
  }

  if (isDriverBlacklistedOrSuspended(matchedDriver)) {
    throw new Error(
      `Cannot send trip to ${matchedDriver.name}: driver or vehicle is blacklisted or suspended.`
    );
  }

  const matchedFleetVeh = findDriverFleetVehicle(matchedDriver, fleetVehicles);
  if (matchedFleetVeh) {
    const groundedReason = (matchedFleetVeh as FleetCarConfig).groundedReason;
    if (
      matchedFleetVeh.status !== 'active' ||
      matchedFleetVeh.isBlacklisted ||
      matchedFleetVeh.isArchived ||
      Boolean(groundedReason)
    ) {
      throw new Error(
        `Cannot send trip to ${matchedDriver.name}: assigned vehicle ${matchedFleetVeh.unitNumber} is unavailable (${groundedReason || matchedFleetVeh.status}).`
      );
    }
  }

  const nowIso = new Date(nowMs).toISOString();
  const driverLabel =
    trip.plannedDriverLabel?.trim() || resolveStagedDriverLabel(matchedDriver);
  const resolvedActor = actorName?.trim() || 'Dispatcher';

  if (mode === 'offer_first') {
    const expiresIso = new Date(nowMs + Math.max(15, offerTimeoutSeconds) * 1000).toISOString();
    const offerCascade: TripOfferCascade = {
      state: 'active',
      mode: 'sequential_cascade',
      activeOfferedDriverId: matchedDriver.id,
      activeOfferedDriverName: driverLabel,
      activeOfferedDriverIds: [matchedDriver.id],
      offerStartedAt: nowIso,
      offerExpiresAt: expiresIso,
      timeoutSeconds: Math.max(15, offerTimeoutSeconds),
      cascadeAttempt: 1,
      maxAttempts: 1,
      attemptedDriverIds: [matchedDriver.id],
      strategy: 'staged_planned_driver',
    };

    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: 'offered',
      timestamp: nowIso,
      actorId,
      actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
      reason: `Sent staged trip offer to ${driverLabel} (${resolvedActor})`,
    };

    const offerAudit: TripAuditEvent = {
      action: 'DISPATCH_OFFERED',
      timestamp: nowIso,
      actorId,
      actorRole,
      referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'offer',
      context: `Sent staged trip offer to ${driverLabel} by ${resolvedActor}.`,
    };

    const patch: Partial<Trip> = {
      status: 'offered',
      assignedDriverId: null,
      offeredToIds: [matchedDriver.id],
      offerCascade,
      plannedDriverId: null,
      plannedDriverLabel: null,
      plannedAt: null,
      plannedBy: null,
      metadata: {
        ...(trip.metadata || {}),
        previouslyPlannedDriverId: trip.plannedDriverId,
        previouslyPlannedDriverLabel: driverLabel,
        ...(trip.plannedAt ? { previouslyPlannedAt: trip.plannedAt } : {}),
        ...(trip.plannedBy ? { previouslyPlannedBy: trip.plannedBy } : {}),
      },
      statusHistory: [...(trip.statusHistory || []), historyEntry],
      auditLog: [...(trip.auditLog || []), offerAudit],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    triggerDriverPush(matchedDriver.id, updatedTrip, sendPush);

    return {
      trip: updatedTrip,
      driverId: matchedDriver.id,
      driverLabel,
      mode: 'offer_first',
    };
  }

  // Default: mode === 'direct_assign'
  const unitDigitsMatch = String(
    matchedDriver.cabNumber || matchedDriver.vehicleUnit || matchedDriver.vehicle || ''
  ).match(/#?(\d+)/);
  const cabNumber = unitDigitsMatch ? unitDigitsMatch[1] : matchedDriver.cabNumber;
  const vehicleUnit = cabNumber
    ? `Car #${cabNumber}`
    : matchedDriver.vehicleUnit || matchedDriver.vehicle || 'Assigned Unit';

  const candidateStub: RankedDispatchCandidate = {
    driverId: matchedDriver.id,
    driverName: matchedDriver.name,
    driverLabel,
    cabNumber,
    vehicleUnit,
    vehicleTier: matchedDriver.vehicleTier || matchedDriver.tier || 'standard',
    inPickupZone: true,
    matchedZoneIds: [],
    distanceMiles: null,
    idleDurationMs: 0,
    driverScore: typeof matchedDriver.driverScore === 'number' ? matchedDriver.driverScore : 80,
    strategy: 'nearest_in_zone',
    rankReason: 'Staged Planned Driver',
    isPlannedDriver: true,
  };

  const frozenVehicle = resolveDriverFrozenVehicleSnapshot(
    matchedDriver,
    candidateStub,
    fleetVehicles
  );

  const promotableStatuses = new Set<string>([
    'pending',
    'confirmed',
    'CONFIRMED',
    'UNCONFIRMED',
    'unconfirmed',
    'accepted',
    'offered',
  ]);
  const nextStatus: TripStatus = promotableStatuses.has(trip.status) ? 'assigned' : trip.status;

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: nextStatus,
    timestamp: nowIso,
    actorId,
    actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
    reason: `Sent staged trip to driver ${driverLabel} (${resolvedActor})`,
  };

  const assignAudit: TripAuditEvent = {
    action: 'DRIVER_ASSIGNED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `ASN-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'lifecycle',
    context: `Sent staged trip to driver ${driverLabel} (${frozenVehicle.vehicleNumber}) by ${resolvedActor}.`,
  };

  const patch: Partial<Trip> = {
    status: nextStatus,
    assignedDriverId: matchedDriver.id,
    assignedVehicle: frozenVehicle,
    offeredToIds: [],
    ...(trip.offerCascade?.state === 'active'
      ? {
          offerCascade: {
            ...trip.offerCascade,
            state: 'accepted',
            activeOfferedDriverId: matchedDriver.id,
            activeOfferedDriverName: driverLabel,
            activeOfferedDriverIds: [],
          },
        }
      : {}),
    plannedDriverId: null,
    plannedDriverLabel: null,
    plannedAt: null,
    plannedBy: null,
    metadata: {
      ...(trip.metadata || {}),
      assignedDriverName: matchedDriver.name,
      ...(matchedDriver.phone ? { assignedDriverPhone: matchedDriver.phone } : {}),
      previouslyPlannedDriverId: trip.plannedDriverId,
      previouslyPlannedDriverLabel: driverLabel,
      ...(trip.plannedAt ? { previouslyPlannedAt: trip.plannedAt } : {}),
      ...(trip.plannedBy ? { previouslyPlannedBy: trip.plannedBy } : {}),
    },
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), assignAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  triggerDriverPush(matchedDriver.id, updatedTrip, sendPush);

  return {
    trip: updatedTrip,
    driverId: matchedDriver.id,
    driverLabel,
    mode: 'direct_assign',
  };
}

/**
 * Batch helper sending multiple staged trips live to their planned drivers.
 */
export async function sendMultipleStagedTripsToDrivers(
  params: SendMultipleStagedTripsParams
): Promise<SendMultipleStagedTripsSummary> {
  const {
    trips,
    drivers,
    actorName,
    actorId,
    actorRole = 'dispatcher',
    mode = 'direct_assign',
    requireOnDuty = false,
    fleetVehicles,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const stagedTargets = trips.filter((t) => hasStagedDriver(t));
  let sentCount = 0;
  let skippedOfflineOrInvalid = 0;
  const updatedTrips: Trip[] = [];
  const results: SendMultipleStagedTripsSummary['results'] = [];

  for (const trip of stagedTargets) {
    const drv = drivers.find((d) => d.id === trip.plannedDriverId);
    if (!drv) {
      skippedOfflineOrInvalid++;
      results.push({
        tripId: trip.id,
        sent: false,
        driverId: trip.plannedDriverId || undefined,
        driverLabel: trip.plannedDriverLabel || undefined,
        reason: 'Staged driver not found in roster',
      });
      continue;
    }

    if (requireOnDuty && !isDriverCurrentlyOnDuty(drv)) {
      skippedOfflineOrInvalid++;
      results.push({
        tripId: trip.id,
        sent: false,
        driverId: drv.id,
        driverLabel: trip.plannedDriverLabel || resolveStagedDriverLabel(drv),
        reason: 'Staged driver is currently offline or on break',
      });
      continue;
    }

    try {
      const sent = await sendStagedTripToDriver({
        trip,
        drivers,
        actorName,
        actorId,
        actorRole,
        mode,
        fleetVehicles,
        bookingService,
        sendPush,
        nowMs,
      });
      sentCount++;
      updatedTrips.push(sent.trip);
      results.push({
        tripId: trip.id,
        sent: true,
        trip: sent.trip,
        driverId: sent.driverId,
        driverLabel: sent.driverLabel,
      });
    } catch (err: unknown) {
      skippedOfflineOrInvalid++;
      results.push({
        tripId: trip.id,
        sent: false,
        driverId: drv.id,
        driverLabel: trip.plannedDriverLabel || resolveStagedDriverLabel(drv),
        reason: err instanceof Error ? err.message : 'Unable to send staged trip',
      });
    }
  }

  return {
    sentCount,
    skippedOfflineOrInvalid,
    updatedTrips,
    results,
  };
}

/**
 * Chronological Schedule & Turnaround / Overlap Sanity Checker (`computeDriverScheduleTimeline`).
 *
 * Interleaves BOTH live assigned trips (`assignedDriverId === driverId`) and staged placeholders
 * (`!assignedDriverId && plannedDriverId === driverId`), computing projected pickup/dropoff times,
 * `bufferMinutesAfterPrior`, and `conflictStatus`:
 * - `'overlap'`          (`bufferMinutesAfterPrior < 0`)
 * - `'tight_turnaround'` (`0 <= bufferMinutesAfterPrior < tightBufferMinutes`, default `15`)
 * - `'ok'`               (`bufferMinutesAfterPrior >= tightBufferMinutes` or first leg)
 */
export function computeDriverScheduleTimeline(
  driverId: string,
  allTrips: ReadonlyArray<Trip>,
  options?: {
    tightBufferMinutes?: number;
    defaultDurationMinutes?: number;
    nowMs?: number;
  }
): DriverScheduleTimelineSummary {
  const tightBufferMinutes = options?.tightBufferMinutes ?? 15;
  const defaultDurationMinutes = options?.defaultDurationMinutes ?? 25;
  const nowMs = options?.nowMs ?? Date.now();

  if (!driverId || !Array.isArray(allTrips) || allTrips.length === 0) {
    return {
      driverId,
      items: [],
      overlapCount: 0,
      tightTurnaroundCount: 0,
      stagedCount: 0,
      assignedCount: 0,
      activeCount: 0,
      totalFare: 0,
      totalDurationMinutes: 0,
    };
  }

  const matchingTrips = allTrips.filter((t) => {
    if (!t || t.isArchived || t.isBlacklisted) return false;
    if (TERMINAL_OR_REJECTED_STATUSES.has(String(t.status || ''))) return false;
    const isAssigned = t.assignedDriverId === driverId;
    const isStaged = !t.assignedDriverId && t.plannedDriverId === driverId;
    return isAssigned || isStaged;
  });

  const activeTrips: Trip[] = [];
  const upcomingTrips: Trip[] = [];

  for (const trip of matchingTrips) {
    if (trip.assignedDriverId === driverId && ACTIVE_EXECUTION_STATUSES.has(trip.status)) {
      activeTrips.push(trip);
    } else {
      upcomingTrips.push(trip);
    }
  }

  const resolveSortMs = (t: Trip): number => {
    if (t.scheduledPickupTime) {
      const parsed = Date.parse(t.scheduledPickupTime);
      if (Number.isFinite(parsed)) return parsed;
    }
    return nowMs;
  };

  upcomingTrips.sort((a, b) => {
    const timeA = resolveSortMs(a);
    const timeB = resolveSortMs(b);

    const orderA =
      typeof a.queueOrder === 'number'
        ? a.queueOrder
        : typeof (a.metadata as Record<string, any> | undefined)?.driverQueueOrder === 'number'
        ? Number((a.metadata as Record<string, any>).driverQueueOrder)
        : undefined;
    const orderB =
      typeof b.queueOrder === 'number'
        ? b.queueOrder
        : typeof (b.metadata as Record<string, any> | undefined)?.driverQueueOrder === 'number'
        ? Number((b.metadata as Record<string, any>).driverQueueOrder)
        : undefined;

    // Respect explicit manual queueOrder when both legs have explicit ordering within the same 6-hour shift window
    if (
      orderA !== undefined &&
      orderB !== undefined &&
      orderA !== orderB &&
      Math.abs(timeA - timeB) <= 6 * 3600_000
    ) {
      return orderA - orderB;
    }

    if (timeA !== timeB) return timeA - timeB;
    if ((orderA ?? 999) !== (orderB ?? 999)) return (orderA ?? 999) - (orderB ?? 999);
    return a.id.localeCompare(b.id);
  });

  const orderedTrips = [...activeTrips, ...upcomingTrips];

  const items: DriverScheduleTimelineItem[] = [];
  let overlapCount = 0;
  let tightTurnaroundCount = 0;
  let stagedCount = 0;
  let assignedCount = 0;
  let activeCount = 0;
  let totalFare = 0;
  let totalDurationMinutes = 0;
  let priorDropoffMs: number | null = null;

  for (const trip of orderedTrips) {
    const isAssigned = trip.assignedDriverId === driverId;
    const isActive = isAssigned && ACTIVE_EXECUTION_STATUSES.has(trip.status);
    const assignmentState: DriverScheduleTimelineItem['assignmentState'] = isActive
      ? 'active'
      : isAssigned
      ? 'assigned'
      : 'staged';

    if (assignmentState === 'staged') {
      stagedCount++;
    } else {
      assignedCount++;
      if (isActive) activeCount++;
    }

    const durationMinutes = resolveTripEstimatedDurationMinutes(trip, defaultDurationMinutes);
    const durationMs = durationMinutes * 60_000;
    totalDurationMinutes += durationMinutes;
    totalFare += Number(
      trip.pricing?.totalFare ??
        (trip.pricing as Record<string, any> | undefined)?.estimatedTotal ??
        trip.pricing?.subtotal ??
        0
    );

    const parsedSched = trip.scheduledPickupTime ? Date.parse(trip.scheduledPickupTime) : NaN;
    const scheduledPickupMs = Number.isFinite(parsedSched) ? parsedSched : null;

    let projectedPickupMs: number;
    let projectedDropoffMs: number;

    if (isActive) {
      projectedPickupMs = scheduledPickupMs ?? nowMs;
      if (trip.status === 'in_progress') {
        projectedDropoffMs = nowMs + Math.max(10, Math.round(durationMinutes * 0.6)) * 60_000;
      } else if (trip.status === 'arrived') {
        projectedDropoffMs = nowMs + durationMs;
      } else {
        const etaMins = Number((trip as Record<string, any>).etaMinutes || 8);
        projectedPickupMs = nowMs + etaMins * 60_000;
        projectedDropoffMs = projectedPickupMs + durationMs;
      }
    } else if (scheduledPickupMs !== null) {
      projectedPickupMs = scheduledPickupMs;
      projectedDropoffMs = scheduledPickupMs + durationMs;
    } else {
      // Unscheduled ASAP ride queued behind active/prior work
      projectedPickupMs = priorDropoffMs !== null ? Math.max(nowMs, priorDropoffMs) : nowMs;
      projectedDropoffMs = projectedPickupMs + durationMs;
    }

    let bufferMinutesAfterPrior: number | null = null;
    let conflictStatus: DriverTimelineConflictStatus = 'ok';

    if (priorDropoffMs !== null) {
      const comparisonPickupMs = scheduledPickupMs ?? nowMs;
      bufferMinutesAfterPrior = Math.round((comparisonPickupMs - priorDropoffMs) / 60_000);
      if (bufferMinutesAfterPrior < 0) {
        conflictStatus = 'overlap';
        overlapCount++;
      } else if (bufferMinutesAfterPrior < tightBufferMinutes) {
        conflictStatus = 'tight_turnaround';
        tightTurnaroundCount++;
      } else {
        conflictStatus = 'ok';
      }
    }

    items.push({
      trip,
      assignmentState,
      scheduledPickupMs,
      projectedPickupMs,
      projectedDropoffMs,
      durationMinutes,
      bufferMinutesAfterPrior,
      conflictStatus,
    });

    priorDropoffMs =
      priorDropoffMs !== null
        ? Math.max(priorDropoffMs, projectedDropoffMs)
        : projectedDropoffMs;
  }

  return {
    driverId,
    items,
    overlapCount,
    tightTurnaroundCount,
    stagedCount,
    assignedCount,
    activeCount,
    totalFare,
    totalDurationMinutes,
  };
}

/**
 * Auto-Stage Suggestions Helper (`computeAutoStageSuggestions`).
 *
 * Greedily pairs open unassigned & unstaged scheduled trips with compatible, non-blacklisted
 * drivers while simulating each driver's projected timeline so suggested assignments NEVER
 * create a `< tightBufferMinutes` (default `15m`) turnaround conflict with existing `Assigned`
 * or `Staged` rides.
 */
export function computeAutoStageSuggestions(
  params: ComputeAutoStageSuggestionsParams
): AutoStageSuggestionsResult {
  const {
    trips,
    drivers,
    settings,
    allTrips,
    tightBufferMinutes = 15,
    nowMs = Date.now(),
  } = params;

  const eligibleStatuses = new Set<string>(['CONFIRMED', 'confirmed', 'accepted', 'pending']);
  const openScheduledTrips = [...trips]
    .filter((t) => {
      if (!t || t.assignedDriverId || t.plannedDriverId) return false;
      if (t.isArchived || t.isBlacklisted) return false;
      if (!eligibleStatuses.has(String(t.status || ''))) return false;
      if (!t.scheduledPickupTime) return false;
      const ms = Date.parse(t.scheduledPickupTime);
      return Number.isFinite(ms);
    })
    .sort((a, b) => {
      const aMs = Date.parse(a.scheduledPickupTime!);
      const bMs = Date.parse(b.scheduledPickupTime!);
      if (aMs !== bMs) return aMs - bMs;
      return a.id.localeCompare(b.id);
    });

  if (openScheduledTrips.length === 0) {
    return { suggestions: [], unmatchedTripIds: [] };
  }

  const baseScheduleMap = new Map<string, Trip>();
  for (const t of allTrips || trips) {
    if (t?.id) baseScheduleMap.set(t.id, t);
  }
  for (const t of trips) {
    if (t?.id) baseScheduleMap.set(t.id, t);
  }
  const workingTrips: Trip[] = Array.from(baseScheduleMap.values());

  const fleetVehicles = settings?.fleet;
  const vehicleTiers = settings?.vehicles;
  const minScore = normalizeDispatchAutomationConfig(settings?.dispatchAutomation).minDriverScore;

  const suggestions: AutoStageSuggestionItem[] = [];
  const unmatchedTripIds: string[] = [];

  for (const candidateTrip of openScheduledTrips) {
    const pickupMs = Date.parse(candidateTrip.scheduledPickupTime!);
    const isNearTermShift = pickupMs - nowMs <= 3 * 3600_000;

    interface ScoredSuggestionDriver {
      driver: AutoDispatchDriverInput;
      driverLabel: string;
      bufferMinutesAfterPrior: number | null;
      existingCommitmentCount: number;
      isOnDuty: boolean;
      driverScore: number;
    }

    const viableDrivers: ScoredSuggestionDriver[] = [];

    for (const drv of drivers) {
      if (!drv?.id || isDriverBlacklistedOrSuspended(drv)) continue;

      const matchedFleetVeh = findDriverFleetVehicle(drv, fleetVehicles);
      if (matchedFleetVeh) {
        const groundedReason = (matchedFleetVeh as FleetCarConfig).groundedReason;
        if (
          matchedFleetVeh.status !== 'active' ||
          matchedFleetVeh.isBlacklisted ||
          matchedFleetVeh.isArchived ||
          Boolean(groundedReason)
        ) {
          continue;
        }
      }

      const effectiveTier =
        drv.vehicleTier || drv.tier || matchedFleetVeh?.vehicleTypeId || 'standard';
      const compat = evaluateDriverVehicleCompatibility(
        candidateTrip,
        effectiveTier,
        vehicleTiers
      );
      if (!compat.compatible) continue;

      const score =
        typeof drv.driverScore === 'number' && Number.isFinite(drv.driverScore)
          ? drv.driverScore
          : 80;
      if (minScore > 0 && score < minScore) continue;

      // Baseline conflict counts BEFORE adding candidateTrip
      const beforeTimeline = computeDriverScheduleTimeline(drv.id, workingTrips, {
        tightBufferMinutes,
        nowMs,
      });

      const simulatedTrip: Trip = {
        ...candidateTrip,
        plannedDriverId: drv.id,
        plannedDriverLabel: resolveStagedDriverLabel(drv),
      };
      const simulatedList = workingTrips.map((wt) =>
        wt.id === candidateTrip.id ? simulatedTrip : wt
      );

      const afterTimeline = computeDriverScheduleTimeline(drv.id, simulatedList, {
        tightBufferMinutes,
        nowMs,
      });

      // Never suggest an assignment that introduces any overlap or < tightBufferMinutes turnaround!
      if (
        afterTimeline.overlapCount > beforeTimeline.overlapCount ||
        afterTimeline.tightTurnaroundCount > beforeTimeline.tightTurnaroundCount
      ) {
        continue;
      }

      const simItem = afterTimeline.items.find((it) => it.trip.id === candidateTrip.id);
      if (!simItem || simItem.conflictStatus !== 'ok') {
        continue;
      }

      viableDrivers.push({
        driver: drv,
        driverLabel: resolveStagedDriverLabel(drv),
        bufferMinutesAfterPrior: simItem.bufferMinutesAfterPrior,
        existingCommitmentCount: beforeTimeline.items.length,
        isOnDuty: isDriverCurrentlyOnDuty(drv),
        driverScore: score,
      });
    }

    if (viableDrivers.length === 0) {
      unmatchedTripIds.push(candidateTrip.id);
      continue;
    }

    viableDrivers.sort((a, b) => {
      // Near-term pickups prefer currently on-duty drivers
      if (isNearTermShift && a.isOnDuty !== b.isOnDuty) {
        return a.isOnDuty ? -1 : 1;
      }
      // Fair shift distribution across eligible drivers first, then higher driver score, then on-duty
      if (a.existingCommitmentCount !== b.existingCommitmentCount) {
        return a.existingCommitmentCount - b.existingCommitmentCount;
      }
      if (a.driverScore !== b.driverScore) {
        return b.driverScore - a.driverScore;
      }
      if (a.isOnDuty !== b.isOnDuty) {
        return a.isOnDuty ? -1 : 1;
      }
      return a.driver.id.localeCompare(b.driver.id);
    });

    const chosen = viableDrivers[0];
    suggestions.push({
      tripId: candidateTrip.id,
      tripNumber: formatShortTripNumber(candidateTrip.id),
      driverId: chosen.driver.id,
      driverLabel: chosen.driverLabel,
      bufferMinutesAfterPrior: chosen.bufferMinutesAfterPrior,
      scheduledPickupTime: candidateTrip.scheduledPickupTime!,
    });

    // Update simulated working schedule so subsequent trips respect this staged reservation
    const idx = workingTrips.findIndex((wt) => wt.id === candidateTrip.id);
    if (idx !== -1) {
      workingTrips[idx] = {
        ...workingTrips[idx],
        plannedDriverId: chosen.driver.id,
        plannedDriverLabel: chosen.driverLabel,
      };
    }
  }

  return {
    suggestions,
    unmatchedTripIds,
  };
}

/**
 * Applies computed auto-stage suggestions as `plannedDriverId` placeholders (zero `/app/driver` push/leak).
 */
export async function applyAutoStageSuggestions(params: {
  suggestions: ReadonlyArray<AutoStageSuggestionItem>;
  trips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  actorName: string;
  actorId?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  bookingService?: IBookingService;
  nowMs?: number;
}): Promise<Trip[]> {
  const {
    suggestions,
    trips,
    drivers,
    actorName,
    actorId,
    actorRole = 'dispatcher',
    bookingService = getBookingService(),
    nowMs = Date.now(),
  } = params;

  const updated: Trip[] = [];
  for (const s of suggestions) {
    const trip = trips.find((t) => t.id === s.tripId);
    const drv = drivers.find((d) => d.id === s.driverId);
    if (!trip || !drv || !isTripEligibleForStaging(trip)) continue;

    const stagedTrip = await stageDriverForTrip({
      tripId: trip.id,
      trip,
      driver: drv,
      actorName,
      actorId,
      actorRole,
      bookingService,
      nowMs,
    });
    updated.push(stagedTrip);
  }
  return updated;
}

/**
 * Returns open staged trips (`Boolean(t.plannedDriverId) && !t.assignedDriverId`) whose pickup
 * falls inside `T - (stagedAutoReleaseLeadMinutes + airportExtra)` (and not > 4h overdue)
 * when `config.autoReleaseStagedDrivers === true` and `!config.isPaused`.
 */
export function getDueStagedTripsForAutoRelease(
  trips: ReadonlyArray<Trip>,
  config?: Partial<DispatchAutomationConfig> | null,
  nowMs: number = Date.now()
): Trip[] {
  if (!Array.isArray(trips) || trips.length === 0) return [];
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);

  if (!cfg.autoReleaseStagedDrivers || cfg.isPaused) {
    return [];
  }

  const nonReleasableStatuses = new Set<string>([
    'UNCONFIRMED',
    'unconfirmed',
    'completed',
    'cancelled',
    'declined',
    'DECLINED',
    'en_route',
    'arrived',
    'in_progress',
  ]);

  const due = trips.filter((trip) => {
    if (!trip || trip.assignedDriverId || !trip.plannedDriverId) return false;
    if (trip.isArchived || trip.isBlacklisted) return false;
    if (nonReleasableStatuses.has(String(trip.status || ''))) return false;
    if (trip.offerCascade?.state === 'active') return false;

    if (trip.bookingType === 'asap' || !trip.scheduledPickupTime) {
      return true;
    }

    const scheduledMs = Date.parse(trip.scheduledPickupTime);
    if (!Number.isFinite(scheduledMs)) return true;

    const minutesUntilPickup = (scheduledMs - nowMs) / 60_000;
    // Do not auto-release stale rides more than 4 hours (240 minutes) overdue
    if (minutesUntilPickup < -240) {
      return false;
    }

    const meta = (trip.metadata || {}) as Record<string, any>;
    const airportCheck = detectAirportInAddresses(
      trip.pickupLocation?.address || '',
      trip.dropoffLocation?.address || ''
    );
    const isAirportTrip = Boolean(airportCheck.isAirportTrip || meta.isAirportTrip);
    const airportExtra = isAirportTrip ? cfg.airportExtraLeadMinutes : 0;
    const effectiveReleaseMinutes = cfg.stagedAutoReleaseLeadMinutes + airportExtra;

    return minutesUntilPickup <= effectiveReleaseMinutes;
  });

  due.sort((a, b) => {
    const aMs = a.scheduledPickupTime ? Date.parse(a.scheduledPickupTime) : nowMs;
    const bMs = b.scheduledPickupTime ? Date.parse(b.scheduledPickupTime) : nowMs;
    if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
      return aMs - bMs;
    }
    return a.id.localeCompare(b.id);
  });

  return due;
}

/**
 * Evaluates all due staged trips inside the Auto-Release Lead Window:
 * - If the staged driver is currently `on_duty` and free of time overlap -> sends live via `sendStagedTripToDriver`.
 * - If the staged driver is offline/on-break/suspended OR has a time overlap -> keeps the ride held
 *   and returns a structured tactical alert (`staged_driver_offline` | `staged_driver_conflict`).
 */
export async function releaseDueStagedTrips(
  params: ReleaseDueStagedTripsParams
): Promise<ReleaseDueStagedTripsResult> {
  const {
    trips,
    drivers,
    settings,
    actorName = 'Staged Auto-Release',
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const dueTrips = getDueStagedTripsForAutoRelease(
    trips,
    settings?.dispatchAutomation,
    nowMs
  );

  if (dueTrips.length === 0) {
    return {
      dueCount: 0,
      releasedTrips: [],
      alerts: [],
    };
  }

  const workingTripMap = new Map<string, Trip>(trips.map((t) => [t.id, t]));
  const releasedTrips: Trip[] = [];
  const alerts: StagedAutoReleaseAlert[] = [];

  for (const dueTrip of dueTrips) {
    const currentTrip = workingTripMap.get(dueTrip.id) || dueTrip;
    if (!currentTrip.plannedDriverId || currentTrip.assignedDriverId) continue;

    const drv = drivers.find((d) => d.id === currentTrip.plannedDriverId);
    const fallbackLabel =
      currentTrip.plannedDriverLabel ||
      (drv ? resolveStagedDriverLabel(drv) : currentTrip.plannedDriverId);
    const shortTrip = formatShortTripNumber(currentTrip.id);

    if (!drv || !isDriverCurrentlyOnDuty(drv)) {
      alerts.push({
        trip: currentTrip,
        tripId: currentTrip.id,
        driverId: currentTrip.plannedDriverId,
        driverLabel: fallbackLabel,
        reason: 'staged_driver_offline',
        message: `⚠️ Staged driver ${fallbackLabel} is offline for Trip #${shortTrip} — Send anyway or Re-assign`,
      });
      continue;
    }

    // Check active / timeline overlap for this driver across all live + staged work
    const timeline = computeDriverScheduleTimeline(
      drv.id,
      Array.from(workingTripMap.values()),
      { nowMs }
    );
    const legEntry = timeline.items.find((it) => it.trip.id === currentTrip.id);
    const hasImmediateAsapBusyConflict =
      (currentTrip.bookingType === 'asap' || !currentTrip.scheduledPickupTime) &&
      (drv.mapStatus === 'busy' ||
        drv.mapStatus === 'en_route' ||
        drv.status === 'on_trip' ||
        Boolean(drv.activeTrip) ||
        Boolean(drv.currentTripId));

    if (legEntry?.conflictStatus === 'overlap' || hasImmediateAsapBusyConflict) {
      alerts.push({
        trip: currentTrip,
        tripId: currentTrip.id,
        driverId: drv.id,
        driverLabel: fallbackLabel,
        reason: 'staged_driver_conflict',
        message: `⚠️ Staged driver ${fallbackLabel} has a schedule overlap for Trip #${shortTrip} — Send anyway or Re-assign`,
      });
      continue;
    }

    try {
      const sent = await sendStagedTripToDriver({
        trip: currentTrip,
        drivers,
        actorName,
        actorRole: 'system',
        fleetVehicles: settings?.fleet,
        bookingService,
        sendPush,
        nowMs,
      });
      workingTripMap.set(currentTrip.id, sent.trip);
      releasedTrips.push(sent.trip);
    } catch {
      alerts.push({
        trip: currentTrip,
        tripId: currentTrip.id,
        driverId: drv.id,
        driverLabel: fallbackLabel,
        reason: 'staged_driver_offline',
        message: `⚠️ Staged driver ${fallbackLabel} is unavailable for Trip #${shortTrip} — Send anyway or Re-assign`,
      });
    }
  }

  return {
    dueCount: dueTrips.length,
    releasedTrips,
    alerts,
  };
}

/**
 * Splits any target trip list into `{ stagedTrips, unstagedTrips }` so Dispatch can prompt
 * the operator before overriding pre-planned shift assignments.
 */
export function partitionTripsByStagedConflict(targetTrips: ReadonlyArray<Trip>): {
  stagedTrips: Trip[];
  unstagedTrips: Trip[];
} {
  const stagedTrips: Trip[] = [];
  const unstagedTrips: Trip[] = [];

  for (const trip of targetTrips) {
    if (!trip) continue;
    if (hasStagedDriver(trip)) {
      stagedTrips.push(trip);
    } else {
      unstagedTrips.push(trip);
    }
  }

  return { stagedTrips, unstagedTrips };
}

/**
 * Deterministic executor for the 3 Staged Override Modal choices:
 * - `'keep_staged'`:     Sends `stagedTrips` directly to their planned drivers (`sendStagedTripToDriver`),
 *                        returning `unstagedTrips` for Auto-Dispatch ranking.
 * - `'skip_staged'`:     Leaves `stagedTrips` untouched as held placeholders, returning `unstagedTrips`
 *                        for Auto-Dispatch ranking.
 * - `'override_staged'`: Clears `plannedDriverId` on `stagedTrips` (`clearStagedDriver`), returning
 *                        all `[...clearedStagedTrips, ...unstagedTrips]` for fresh Auto-Dispatch ranking.
 */
export async function resolveStagedConflictStrategy(params: {
  strategy: StagedConflictResolutionStrategy;
  targetTrips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  actorName: string;
  actorId?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}): Promise<{
  strategy: StagedConflictResolutionStrategy;
  sentStagedTrips: Trip[];
  clearedStagedTrips: Trip[];
  skippedStagedTrips: Trip[];
  tripsForAutoDispatch: Trip[];
  failedStagedSends: Array<{ tripId: string; reason: string }>;
}> {
  const {
    strategy,
    targetTrips,
    drivers,
    actorName,
    actorId,
    actorRole = 'dispatcher',
    fleetVehicles,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const { stagedTrips, unstagedTrips } = partitionTripsByStagedConflict(targetTrips);

  if (strategy === 'skip_staged') {
    return {
      strategy,
      sentStagedTrips: [],
      clearedStagedTrips: [],
      skippedStagedTrips: stagedTrips,
      tripsForAutoDispatch: unstagedTrips,
      failedStagedSends: [],
    };
  }

  if (strategy === 'keep_staged') {
    const batchSent = await sendMultipleStagedTripsToDrivers({
      trips: stagedTrips,
      drivers,
      actorName,
      actorId,
      actorRole,
      fleetVehicles,
      bookingService,
      sendPush,
      nowMs,
    });

    const failedStagedSends = batchSent.results
      .filter((r) => !r.sent)
      .map((r) => ({ tripId: r.tripId, reason: r.reason || 'Unable to send staged trip' }));

    return {
      strategy,
      sentStagedTrips: batchSent.updatedTrips,
      clearedStagedTrips: [],
      skippedStagedTrips: [],
      tripsForAutoDispatch: unstagedTrips,
      failedStagedSends,
    };
  }

  // strategy === 'override_staged'
  const clearedStagedTrips: Trip[] = [];
  for (const st of stagedTrips) {
    const cleared = await clearStagedDriver({
      tripId: st.id,
      trip: st,
      actorName,
      actorId,
      actorRole,
      reason: 'Overridden for fresh Auto-Dispatch candidate ranking',
      bookingService,
      nowMs,
    });
    clearedStagedTrips.push(cleared);
  }

  return {
    strategy,
    sentStagedTrips: [],
    clearedStagedTrips,
    skippedStagedTrips: [],
    tripsForAutoDispatch: [...clearedStagedTrips, ...unstagedTrips],
    failedStagedSends: [],
  };
}
