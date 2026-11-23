/**
 * Intelligent 4-Mode Auto-Dispatch & Offer Cascade Engine (`auto-dispatch.service.ts` — Phase 50)
 *
 * Responsibilities:
 * 1. Candidate evaluation & Pre-Pickup Lead-Window gating (re-exported from `./auto-dispatch-ranking`).
 * 2. 4 Assignment Modes (`executeAutoDispatch`, `startOfferCascade`, `advanceOrExpireOfferCascade`,
 *    `cancelOfferCascade`, `runReadyAutoDispatchSweep`):
 *    - `manual_1tap`: Dispatcher-initiated 1-tap or on-demand `sweepExecutionMode` sweep.
 *    - `sequential_cascade`: Offers 1 driver at a time (`offeredToIds: [top.driverId]`), rolling over
 *      on decline/timeout up to `maxCascadeAttempts`, with optional `broadcast_all_eligible` fallback.
 *    - `broadcast_pool`: Offers up to `broadcastPoolSize` top candidates simultaneously
 *      (`offeredToIds: batchIds`, `activeOfferedDriverIds: batchIds`), waiting while >= 1 driver
 *      remains active before `offerExpiresAt`, atomic first-accept win, or batch rollover/exhaustion.
 *    - `direct_auto_assign`: Immediately assigns `#1` ranked candidate (`status: 'assigned'`,
 *      frozen `assignedVehicle` snapshot, `DRIVER_ASSIGNED` audit event, and push alert).
 *
 * Zero React, browser DOM, or `node:*` dependencies per `constitution.md`.
 */

import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
  type ActiveAutoDispatchStrategyMode,
  type DispatchAutomationConfig,
  type DispatchAutomationMode,
  type DispatchRankingStrategy,
  type FleetCarConfig,
  type VehicleTierConfig,
} from '../../types/config';
import type { PhysicalFleetAsset } from '../../types/fleet';
import type {
  Trip,
  TripAuditEvent,
  TripOfferCascade,
  TripStatus,
  TripStatusHistoryEntry,
} from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import { authorizedFetch } from '../auth/auth-headers';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { formatDriverOfferNotificationPayload } from '../notifications/push-notification.service';
import {
  evaluateAutoDispatchCandidates,
  getReadyForAutoDispatchTrips,
  resolveDriverFrozenVehicleSnapshot,
  type AutoDispatchDriverInput,
  type ExcludedDispatchCandidate,
  type RankedDispatchCandidate,
} from './auto-dispatch-ranking';

export * from './auto-dispatch-ranking';

export type PushOfferSender = (
  targetDriverId: string,
  trip: Trip
) => Promise<void> | void;

export interface StartOfferCascadeParams {
  trip: Trip;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  zones?: ReadonlyArray<ZoneGeofence>;
  config?: Partial<DispatchAutomationConfig> | null;
  modeOverride?: ActiveAutoDispatchStrategyMode;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  activeTrips?: ReadonlyArray<Partial<Trip>>;
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  actorId?: string;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export type ExecuteAutoDispatchParams = StartOfferCascadeParams;

export interface AdvanceOfferCascadeParams {
  trip: Trip;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  zones?: ReadonlyArray<ZoneGeofence>;
  config?: Partial<DispatchAutomationConfig> | null;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  activeTrips?: ReadonlyArray<Partial<Trip>>;
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export interface CancelOfferCascadeParams {
  trip: Trip;
  reason?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  actorId?: string;
  bookingService?: IBookingService;
  nowMs?: number;
}

export interface OfferCascadeStepResult {
  outcome:
    | 'offered'
    | 'assigned'
    | 'advanced'
    | 'accepted'
    | 'exhausted'
    | 'cancelled'
    | 'waiting'
    | 'noop';
  trip: Trip;
  candidate: RankedDispatchCandidate | null;
  candidates: RankedDispatchCandidate[];
  offeredCandidates?: RankedDispatchCandidate[];
  excludedCandidates?: ExcludedDispatchCandidate[];
  mode?: DispatchAutomationMode;
  reason?: string;
}

export interface RunAutoDispatchSweepParams {
  trips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  zones?: ReadonlyArray<ZoneGeofence>;
  config?: Partial<DispatchAutomationConfig> | null;
  modeOverride?: ActiveAutoDispatchStrategyMode;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  actorId?: string;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
  includeExhausted?: boolean;
}

export interface AutoDispatchSweepSummary {
  mode: ActiveAutoDispatchStrategyMode;
  readyCount: number;
  dispatchedCount: number;
  offeredCount: number;
  assignedCount: number;
  exhaustedCount: number;
  updatedTrips: Trip[];
  results: OfferCascadeStepResult[];
}

function resolvePostExhaustionFallbackStatus(trip: Partial<Trip>): TripStatus {
  if (trip.bookingType === 'scheduled') {
    return 'CONFIRMED';
  }
  const history = Array.isArray(trip.statusHistory) ? trip.statusHistory : [];
  if (
    history.some(
      (entry) =>
        entry?.from === 'CONFIRMED' ||
        entry?.from === 'confirmed' ||
        entry?.to === 'CONFIRMED' ||
        entry?.to === 'confirmed'
    )
  ) {
    return 'CONFIRMED';
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const prev = history[i]?.from;
    if (prev === 'pending') return 'pending';
  }
  return 'CONFIRMED';
}

async function defaultTriggerServerPush(targetDriverId: string, trip: Trip): Promise<void> {
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
    // Non-fatal: active Driver PWA clients also receive offers/assignments via Firestore snapshot
  }
}

function dispatchPushBatch(
  driverIds: ReadonlyArray<string>,
  trip: Trip,
  sendPush?: PushOfferSender | false
): void {
  if (sendPush === false || driverIds.length === 0) return;
  const pushFn = typeof sendPush === 'function' ? sendPush : defaultTriggerServerPush;
  for (const driverId of driverIds) {
    if (!driverId) continue;
    Promise.resolve(pushFn(driverId, trip)).catch(() => {});
  }
}

/**
 * Executes auto-dispatch for a single unassigned trip according to the active or overridden mode:
 * - `'manual_1tap'` (without `modeOverride`): returns `'noop'` (never auto-dispatches unattended).
 * - `'sequential_cascade'`: offers `#1` candidate (`offeredToIds: [top.driverId]`).
 * - `'broadcast_pool'`: offers Top-K (`broadcastPoolSize`) candidates simultaneously.
 * - `'direct_auto_assign'`: assigns `#1` candidate immediately with frozen `assignedVehicle`.
 */
export async function executeAutoDispatch(
  params: ExecuteAutoDispatchParams
): Promise<OfferCascadeStepResult> {
  const {
    trip,
    drivers,
    zones,
    config,
    modeOverride,
    fleetVehicles,
    activeTrips,
    vehicleTiers,
    actorRole = 'system',
    actorId,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const effectiveMode: DispatchAutomationMode = modeOverride ?? cfg.dispatchMode;

  if (effectiveMode === 'manual_1tap') {
    return {
      outcome: 'noop',
      trip,
      candidate: null,
      candidates: [],
      offeredCandidates: [],
      excludedCandidates: [],
      mode: 'manual_1tap',
      reason: 'Dispatch mode is set to 1-Tap Manual.',
    };
  }

  if (
    trip.assignedDriverId ||
    ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(
      trip.status
    )
  ) {
    return {
      outcome: 'noop',
      trip,
      candidate: null,
      candidates: [],
      mode: effectiveMode,
      reason: 'Trip is already assigned or in a terminal state.',
    };
  }

  const nowIso = new Date(nowMs).toISOString();

  // Start a fresh run while still respecting explicit `trip.rejectedByIds` from prior declines
  const tripForFreshEvaluation: Partial<Trip> = {
    ...trip,
    offerCascade: undefined,
  };

  const evaluation = evaluateAutoDispatchCandidates(
    tripForFreshEvaluation,
    drivers,
    zones,
    cfg,
    {
      fleetVehicles,
      activeTrips,
      vehicleTiers,
      nowMs,
    }
  );
  const candidates = evaluation.eligible;

  if (candidates.length === 0) {
    const fallbackStatus: TripStatus =
      trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed'
        ? 'CONFIRMED'
        : trip.status === 'offered'
        ? resolvePostExhaustionFallbackStatus(trip)
        : trip.status;

    const exhaustedCascade: TripOfferCascade = {
      state: 'exhausted',
      mode: effectiveMode,
      activeOfferedDriverId: null,
      activeOfferedDriverIds: [],
      offerStartedAt: nowIso,
      offerExpiresAt: nowIso,
      timeoutSeconds: cfg.offerTimeoutSeconds,
      cascadeAttempt: 0,
      maxAttempts: effectiveMode === 'direct_auto_assign' ? 1 : cfg.maxCascadeAttempts,
      attemptedDriverIds: [],
      strategy: cfg.rankingStrategy,
    };

    const auditEvent: TripAuditEvent = {
      action: 'STATUS_CHANGED',
      timestamp: nowIso,
      actorId,
      actorRole,
      referenceNumber: `CSC-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'offer',
      context: `Auto-Dispatch (${effectiveMode}) exhausted immediately (0 eligible drivers matched strategy "${cfg.rankingStrategy}"). Manual dispatcher assignment required.`,
    };

    const patch: Partial<Trip> = {
      status: fallbackStatus,
      offeredToIds: [],
      offerCascade: exhaustedCascade,
      auditLog: [...(trip.auditLog || []), auditEvent],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    return {
      outcome: 'exhausted',
      trip: updatedTrip,
      candidate: null,
      candidates: [],
      offeredCandidates: [],
      excludedCandidates: evaluation.excluded,
      mode: effectiveMode,
      reason: 'No eligible on-duty drivers matched trip requirements.',
    };
  }

  // ─── MODE 3: DIRECT AUTO-ASSIGN (#1 DRIVER) ───
  if (effectiveMode === 'direct_auto_assign') {
    const top = candidates[0];
    const matchedDriverInput = drivers.find((d) => d.id === top.driverId);
    const frozenVehicle = resolveDriverFrozenVehicleSnapshot(
      matchedDriverInput,
      top,
      fleetVehicles
    );

    const acceptedCascade: TripOfferCascade = {
      state: 'accepted',
      mode: 'direct_auto_assign',
      activeOfferedDriverId: top.driverId,
      activeOfferedDriverName: top.driverLabel,
      activeOfferedDriverIds: [],
      offerStartedAt: nowIso,
      offerExpiresAt: nowIso,
      timeoutSeconds: cfg.offerTimeoutSeconds,
      cascadeAttempt: 1,
      maxAttempts: 1,
      attemptedDriverIds: [top.driverId],
      strategy: cfg.rankingStrategy,
    };

    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: 'assigned',
      timestamp: nowIso,
      actorId,
      actorRole: 'system',
      reason: `Direct Auto-Assign (${cfg.rankingStrategy}): Assigned to ${top.driverLabel}`,
    };

    const assignAudit: TripAuditEvent = {
      action: 'DRIVER_ASSIGNED',
      timestamp: nowIso,
      actorId,
      actorRole: 'system',
      referenceNumber: `ASN-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'lifecycle',
      context: `Direct Auto-Assign (${cfg.rankingStrategy}): Assigned #1 candidate ${top.driverLabel} (${frozenVehicle.vehicleNumber}) [${top.rankReason}].`,
    };

    const patch: Partial<Trip> = {
      status: 'assigned',
      assignedDriverId: top.driverId,
      assignedVehicle: frozenVehicle,
      offeredToIds: [],
      offerCascade: acceptedCascade,
      metadata: {
        ...(trip.metadata || {}),
        assignedDriverName: top.driverName,
        ...(matchedDriverInput?.phone ? { assignedDriverPhone: matchedDriverInput.phone } : {}),
      },
      statusHistory: [...(trip.statusHistory || []), historyEntry],
      auditLog: [...(trip.auditLog || []), assignAudit],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    dispatchPushBatch([top.driverId], updatedTrip, sendPush);

    return {
      outcome: 'assigned',
      trip: updatedTrip,
      candidate: top,
      candidates,
      offeredCandidates: [top],
      excludedCandidates: evaluation.excluded,
      mode: 'direct_auto_assign',
    };
  }

  // ─── MODE 2: SIMULTANEOUS TOP-K BROADCAST POOL ───
  if (effectiveMode === 'broadcast_pool') {
    const batch = candidates.slice(0, cfg.broadcastPoolSize);
    const batchIds = batch.map((c) => c.driverId);
    const top = batch[0];
    const expiresIso = new Date(nowMs + cfg.offerTimeoutSeconds * 1000).toISOString();
    const poolSummaryLabel =
      batch.length === 1 ? top.driverLabel : `Pool (${batch.length} cars)`;

    const activeCascade: TripOfferCascade = {
      state: 'active',
      mode: 'broadcast_pool',
      activeOfferedDriverId: top.driverId,
      activeOfferedDriverName: poolSummaryLabel,
      activeOfferedDriverIds: batchIds,
      fallbackBroadcastUsed: false,
      offerStartedAt: nowIso,
      offerExpiresAt: expiresIso,
      timeoutSeconds: cfg.offerTimeoutSeconds,
      cascadeAttempt: 1,
      maxAttempts: cfg.maxCascadeAttempts,
      attemptedDriverIds: batchIds,
      strategy: cfg.rankingStrategy,
    };

    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: 'offered',
      timestamp: nowIso,
      actorId,
      actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
      reason: `Broadcast Pool Batch 1/${cfg.maxCascadeAttempts}: Offered to ${batch
        .map((c) => c.driverLabel)
        .join(', ')} (${cfg.offerTimeoutSeconds}s window)`,
    };

    const offerAudit: TripAuditEvent = {
      action: 'DISPATCH_OFFERED',
      timestamp: nowIso,
      actorId,
      actorRole,
      referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'offer',
      context: `Top-${cfg.broadcastPoolSize} Broadcast Pool Batch 1/${cfg.maxCascadeAttempts} (${
        cfg.rankingStrategy
      }): Offered simultaneously to ${batch.map((c) => c.driverLabel).join(', ')}. Expires in ${
        cfg.offerTimeoutSeconds
      }s.`,
    };

    const patch: Partial<Trip> = {
      status: 'offered',
      assignedDriverId: null,
      offeredToIds: batchIds,
      offerCascade: activeCascade,
      statusHistory: [...(trip.statusHistory || []), historyEntry],
      auditLog: [...(trip.auditLog || []), offerAudit],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    dispatchPushBatch(batchIds, updatedTrip, sendPush);

    return {
      outcome: 'offered',
      trip: updatedTrip,
      candidate: top,
      candidates,
      offeredCandidates: batch,
      excludedCandidates: evaluation.excluded,
      mode: 'broadcast_pool',
    };
  }

  // ─── MODE 1: SEQUENTIAL 1-BY-1 CASCADE ───
  const top = candidates[0];
  const expiresIso = new Date(nowMs + cfg.offerTimeoutSeconds * 1000).toISOString();

  const activeCascade: TripOfferCascade = {
    state: 'active',
    mode: 'sequential_cascade',
    activeOfferedDriverId: top.driverId,
    activeOfferedDriverName: top.driverLabel,
    activeOfferedDriverIds: [top.driverId],
    fallbackBroadcastUsed: false,
    offerStartedAt: nowIso,
    offerExpiresAt: expiresIso,
    timeoutSeconds: cfg.offerTimeoutSeconds,
    cascadeAttempt: 1,
    maxAttempts: cfg.maxCascadeAttempts,
    attemptedDriverIds: [top.driverId],
    strategy: cfg.rankingStrategy,
  };

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: 'offered',
    timestamp: nowIso,
    actorId,
    actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
    reason: `Cascade Step 1/${cfg.maxCascadeAttempts}: Offered to ${top.driverLabel} (${cfg.offerTimeoutSeconds}s window)`,
  };

  const offerAudit: TripAuditEvent = {
    action: 'DISPATCH_OFFERED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'offer',
    context: `Auto-Offer Cascade Step 1/${cfg.maxCascadeAttempts} (${cfg.rankingStrategy}): Offered to ${top.driverLabel} [${top.rankReason}]. Expires in ${cfg.offerTimeoutSeconds}s.`,
  };

  const patch: Partial<Trip> = {
    status: 'offered',
    assignedDriverId: null,
    offeredToIds: [top.driverId],
    offerCascade: activeCascade,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), offerAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  dispatchPushBatch([top.driverId], updatedTrip, sendPush);

  return {
    outcome: 'offered',
    trip: updatedTrip,
    candidate: top,
    candidates,
    offeredCandidates: [top],
    excludedCandidates: evaluation.excluded,
    mode: 'sequential_cascade',
  };
}

/**
 * Initiates a single-trip dispatch action (1-tap manual trigger or automatic cascade start).
 * When `config.dispatchMode === 'manual_1tap'`, runs `config.sweepExecutionMode` (default `'sequential_cascade'`).
 */
export async function startOfferCascade(
  params: StartOfferCascadeParams
): Promise<OfferCascadeStepResult> {
  const cfg = normalizeDispatchAutomationConfig(params.config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const resolvedMode: ActiveAutoDispatchStrategyMode =
    params.modeOverride ??
    (cfg.dispatchMode !== 'manual_1tap' ? cfg.dispatchMode : cfg.sweepExecutionMode);

  return executeAutoDispatch({
    ...params,
    actorRole: params.actorRole ?? 'dispatcher',
    modeOverride: resolvedMode,
  });
}

/**
 * Evaluates an active `offerCascade` (`sequential_cascade` or `broadcast_pool`) and:
 * - Marks `'accepted'` if already claimed by a driver (`assignedDriverId`),
 * - Marks `'cancelled'` if cancelled/declined at trip level,
 * - Returns `'waiting'` while `nowMs < offerExpiresAt` and >= 1 offered driver remains active,
 * - Rolls over to the next candidate / Top-K batch while `cascadeAttempt < maxAttempts`,
 * - Executes optional `fallbackOnExhaustion === 'broadcast_all_eligible'` final broadcast, or
 * - Transitions to `'exhausted'` and reverts `status` to `'CONFIRMED'` (or `'pending'`).
 */
export async function advanceOrExpireOfferCascade(
  params: AdvanceOfferCascadeParams
): Promise<OfferCascadeStepResult> {
  const {
    trip,
    drivers,
    zones,
    config,
    fleetVehicles,
    activeTrips,
    vehicleTiers,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const cascade = trip.offerCascade;
  if (!cascade || cascade.state !== 'active') {
    return { outcome: 'noop', trip, candidate: null, candidates: [] };
  }

  const nowIso = new Date(nowMs).toISOString();

  // 1. Already accepted / assigned (atomic first-accept win)
  if (
    trip.assignedDriverId ||
    ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'].includes(
      trip.status
    )
  ) {
    const acceptedCascade: TripOfferCascade = {
      ...cascade,
      state: 'accepted',
      activeOfferedDriverId: trip.assignedDriverId || cascade.activeOfferedDriverId,
      activeOfferedDriverIds: [],
    };
    const patch: Partial<Trip> = {
      offeredToIds: [],
      offerCascade: acceptedCascade,
      updatedAt: nowIso,
    };
    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    return {
      outcome: 'accepted',
      trip: updatedTrip,
      candidate: null,
      candidates: [],
      mode: cascade.mode || 'sequential_cascade',
    };
  }

  // 2. Cancelled or declined trip
  if (trip.status === 'cancelled' || trip.status === 'DECLINED' || trip.status === 'declined') {
    const cancelledCascade: TripOfferCascade = {
      ...cascade,
      state: 'cancelled',
      activeOfferedDriverId: null,
      activeOfferedDriverName: '',
      activeOfferedDriverIds: [],
    };
    const patch: Partial<Trip> = {
      offerCascade: cancelledCascade,
      offeredToIds: [],
      updatedAt: nowIso,
    };
    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    return {
      outcome: 'cancelled',
      trip: updatedTrip,
      candidate: null,
      candidates: [],
      mode: cascade.mode || 'sequential_cascade',
    };
  }

  const isPoolMode = cascade.mode === 'broadcast_pool';
  const offeredSet = new Set(trip.offeredToIds || []);
  const rejectedSet = new Set(trip.rejectedByIds || []);

  const currentStepDriverIds: string[] = isPoolMode
    ? Array.isArray(cascade.activeOfferedDriverIds) && cascade.activeOfferedDriverIds.length > 0
      ? cascade.activeOfferedDriverIds
      : cascade.activeOfferedDriverId
      ? [cascade.activeOfferedDriverId]
      : []
    : cascade.activeOfferedDriverId
    ? [cascade.activeOfferedDriverId]
    : [];

  const stillActiveStepDriverIds = currentStepDriverIds.filter(
    (id) => offeredSet.has(id) && !rejectedSet.has(id)
  );

  const expiresMs = Date.parse(cascade.offerExpiresAt);
  const isExpired = Number.isFinite(expiresMs) && nowMs >= expiresMs;
  const allStepDriversDeclined = stillActiveStepDriverIds.length === 0;

  if (!allStepDriversDeclined && !isExpired) {
    return {
      outcome: 'waiting',
      trip,
      candidate: null,
      candidates: [],
      mode: cascade.mode || 'sequential_cascade',
    };
  }

  const cfg = normalizeDispatchAutomationConfig({
    ...(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG),
    rankingStrategy: (cascade.strategy as DispatchRankingStrategy) || config?.rankingStrategy,
    offerTimeoutSeconds: cascade.timeoutSeconds || config?.offerTimeoutSeconds,
    maxCascadeAttempts: cascade.maxAttempts || config?.maxCascadeAttempts,
  });

  // Record timed-out / declined step drivers in rejectedByIds & attemptedDriverIds
  const nextRejectedByIds = Array.from(
    new Set([...(trip.rejectedByIds || []), ...currentStepDriverIds])
  );
  const baseAttemptedIds = Array.from(
    new Set([...(cascade.attemptedDriverIds || []), ...currentStepDriverIds])
  );

  const currentAttempt = Math.max(1, Number(cascade.cascadeAttempt || 1));
  const maxAttempts = Math.max(1, Number(cascade.maxAttempts || cfg.maxCascadeAttempts));
  const timeoutSeconds = cascade.timeoutSeconds || cfg.offerTimeoutSeconds;

  const transitionReason = allStepDriversDeclined
    ? isPoolMode
      ? `All offered pool drivers (${currentStepDriverIds.length}) declined`
      : `Driver ${cascade.activeOfferedDriverName || cascade.activeOfferedDriverId || 'candidate'} declined`
    : isPoolMode
    ? `Broadcast pool timed out after ${timeoutSeconds}s`
    : `Offer timed out after ${timeoutSeconds}s`;

  const virtualTripForRanking: Partial<Trip> = {
    ...trip,
    rejectedByIds: nextRejectedByIds,
    offerCascade: {
      ...cascade,
      attemptedDriverIds: baseAttemptedIds,
    },
  };

  const remainingEvaluation = evaluateAutoDispatchCandidates(
    virtualTripForRanking,
    drivers,
    zones,
    cfg,
    {
      fleetVehicles,
      activeTrips,
      vehicleTiers,
      nowMs,
    }
  );
  const remainingCandidates = remainingEvaluation.eligible;

  // 3. Rollover to next step / batch while attempts remain (and not already on final fallback broadcast)
  if (!cascade.fallbackBroadcastUsed && currentAttempt < maxAttempts && remainingCandidates.length > 0) {
    const nextAttempt = currentAttempt + 1;
    const nextExpiresIso = new Date(nowMs + timeoutSeconds * 1000).toISOString();

    if (isPoolMode) {
      const nextBatch = remainingCandidates.slice(0, cfg.broadcastPoolSize);
      const nextBatchIds = nextBatch.map((c) => c.driverId);
      const nextTop = nextBatch[0];
      const poolLabel =
        nextBatch.length === 1 ? nextTop.driverLabel : `Pool (${nextBatch.length} cars)`;

      const nextCascade: TripOfferCascade = {
        ...cascade,
        state: 'active',
        mode: 'broadcast_pool',
        activeOfferedDriverId: nextTop.driverId,
        activeOfferedDriverName: poolLabel,
        activeOfferedDriverIds: nextBatchIds,
        offerStartedAt: nowIso,
        offerExpiresAt: nextExpiresIso,
        timeoutSeconds,
        cascadeAttempt: nextAttempt,
        maxAttempts,
        attemptedDriverIds: Array.from(new Set([...baseAttemptedIds, ...nextBatchIds])),
        strategy: cfg.rankingStrategy,
      };

      const historyEntry: TripStatusHistoryEntry = {
        from: trip.status,
        to: 'offered',
        timestamp: nowIso,
        actorRole: 'system',
        reason: `${transitionReason}. Pool Batch ${nextAttempt}/${maxAttempts}: Offered to ${nextBatch
          .map((c) => c.driverLabel)
          .join(', ')}`,
      };

      const rolloverAudit: TripAuditEvent = {
        action: 'DISPATCH_OFFERED',
        timestamp: nowIso,
        actorRole: 'system',
        referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
        referenceType: 'offer',
        context: `${transitionReason}. Broadcast Pool Batch ${nextAttempt}/${maxAttempts} (${
          cfg.rankingStrategy
        }): Rolled over to ${nextBatch.map((c) => c.driverLabel).join(', ')}.`,
      };

      const patch: Partial<Trip> = {
        status: 'offered',
        assignedDriverId: null,
        offeredToIds: nextBatchIds,
        rejectedByIds: nextRejectedByIds,
        offerCascade: nextCascade,
        statusHistory: [...(trip.statusHistory || []), historyEntry],
        auditLog: [...(trip.auditLog || []), rolloverAudit],
        updatedAt: nowIso,
      };

      const updatedTrip = bookingService.updateTrip
        ? await bookingService.updateTrip(trip.id, patch)
        : ({ ...trip, ...patch } as Trip);

      dispatchPushBatch(nextBatchIds, updatedTrip, sendPush);

      return {
        outcome: 'advanced',
        trip: updatedTrip,
        candidate: nextTop,
        candidates: remainingCandidates,
        offeredCandidates: nextBatch,
        mode: 'broadcast_pool',
        reason: transitionReason,
      };
    }

    const nextCandidate = remainingCandidates[0];
    const nextCascade: TripOfferCascade = {
      ...cascade,
      state: 'active',
      mode: 'sequential_cascade',
      activeOfferedDriverId: nextCandidate.driverId,
      activeOfferedDriverName: nextCandidate.driverLabel,
      activeOfferedDriverIds: [nextCandidate.driverId],
      offerStartedAt: nowIso,
      offerExpiresAt: nextExpiresIso,
      timeoutSeconds,
      cascadeAttempt: nextAttempt,
      maxAttempts,
      attemptedDriverIds: Array.from(new Set([...baseAttemptedIds, nextCandidate.driverId])),
      strategy: cfg.rankingStrategy,
    };

    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: 'offered',
      timestamp: nowIso,
      actorRole: 'system',
      reason: `${transitionReason}. Cascade Step ${nextAttempt}/${maxAttempts}: Offered to ${nextCandidate.driverLabel}`,
    };

    const rolloverAudit: TripAuditEvent = {
      action: 'DISPATCH_OFFERED',
      timestamp: nowIso,
      actorRole: 'system',
      referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'offer',
      context: `${transitionReason}. Auto-Offer Cascade Step ${nextAttempt}/${maxAttempts} (${cfg.rankingStrategy}): Rolled over to ${nextCandidate.driverLabel} [${nextCandidate.rankReason}].`,
    };

    const patch: Partial<Trip> = {
      status: 'offered',
      assignedDriverId: null,
      offeredToIds: [nextCandidate.driverId],
      rejectedByIds: nextRejectedByIds,
      offerCascade: nextCascade,
      statusHistory: [...(trip.statusHistory || []), historyEntry],
      auditLog: [...(trip.auditLog || []), rolloverAudit],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    dispatchPushBatch([nextCandidate.driverId], updatedTrip, sendPush);

    return {
      outcome: 'advanced',
      trip: updatedTrip,
      candidate: nextCandidate,
      candidates: remainingCandidates,
      offeredCandidates: [nextCandidate],
      mode: 'sequential_cascade',
      reason: transitionReason,
    };
  }

  // 4. Optional Fallback Broadcast to All Remaining Eligible Drivers before Exhaustion
  if (
    cfg.fallbackOnExhaustion === 'broadcast_all_eligible' &&
    !cascade.fallbackBroadcastUsed &&
    remainingCandidates.length > 0
  ) {
    const fallbackIds = remainingCandidates.map((c) => c.driverId);
    const fallbackTop = remainingCandidates[0];
    const fallbackExpiresIso = new Date(nowMs + timeoutSeconds * 1000).toISOString();

    const fallbackCascade: TripOfferCascade = {
      ...cascade,
      state: 'active',
      mode: 'broadcast_pool',
      activeOfferedDriverId: fallbackTop.driverId,
      activeOfferedDriverName: `Pool (${fallbackIds.length} cars)`,
      activeOfferedDriverIds: fallbackIds,
      fallbackBroadcastUsed: true,
      offerStartedAt: nowIso,
      offerExpiresAt: fallbackExpiresIso,
      timeoutSeconds,
      cascadeAttempt: currentAttempt + 1,
      maxAttempts,
      attemptedDriverIds: Array.from(new Set([...baseAttemptedIds, ...fallbackIds])),
      strategy: cfg.rankingStrategy,
    };

    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: 'offered',
      timestamp: nowIso,
      actorRole: 'system',
      reason: `${transitionReason}. Exhaustion Fallback Broadcast: Offered to all ${fallbackIds.length} remaining eligible driver(s)`,
    };

    const fallbackAudit: TripAuditEvent = {
      action: 'DISPATCH_OFFERED',
      timestamp: nowIso,
      actorRole: 'system',
      referenceNumber: `FBK-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'offer',
      context: `${transitionReason}. Final Fallback Broadcast sent to all ${
        fallbackIds.length
      } remaining eligible driver(s): ${remainingCandidates.map((c) => c.driverLabel).join(', ')}.`,
    };

    const patch: Partial<Trip> = {
      status: 'offered',
      assignedDriverId: null,
      offeredToIds: fallbackIds,
      rejectedByIds: nextRejectedByIds,
      offerCascade: fallbackCascade,
      statusHistory: [...(trip.statusHistory || []), historyEntry],
      auditLog: [...(trip.auditLog || []), fallbackAudit],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    dispatchPushBatch(fallbackIds, updatedTrip, sendPush);

    return {
      outcome: 'advanced',
      trip: updatedTrip,
      candidate: fallbackTop,
      candidates: remainingCandidates,
      offeredCandidates: remainingCandidates,
      mode: 'broadcast_pool',
      reason: `${transitionReason}; launched fallback broadcast to ${fallbackIds.length} eligible driver(s).`,
    };
  }

  // 5. Exhausted (`currentAttempt >= maxAttempts` or 0 eligible candidates left)
  const fallbackStatus = resolvePostExhaustionFallbackStatus(trip);
  const exhaustedCascade: TripOfferCascade = {
    ...cascade,
    state: 'exhausted',
    activeOfferedDriverId: null,
    activeOfferedDriverName: '',
    activeOfferedDriverIds: [],
    attemptedDriverIds: baseAttemptedIds,
  };

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: fallbackStatus,
    timestamp: nowIso,
    actorRole: 'system',
    reason: `${transitionReason}. Offer cascade exhausted after ${baseAttemptedIds.length} driver attempt(s).`,
  };

  const exhaustedAudit: TripAuditEvent = {
    action: 'STATUS_CHANGED',
    timestamp: nowIso,
    actorRole: 'system',
    referenceNumber: `EXH-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'offer',
    context: `${transitionReason}. Auto-Offer Cascade exhausted (${baseAttemptedIds.length}/${maxAttempts} attempts). Reverted to ${fallbackStatus} for immediate dispatcher triage.`,
  };

  const patch: Partial<Trip> = {
    status: fallbackStatus,
    assignedDriverId: null,
    offeredToIds: [],
    rejectedByIds: nextRejectedByIds,
    offerCascade: exhaustedCascade,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), exhaustedAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  return {
    outcome: 'exhausted',
    trip: updatedTrip,
    candidate: null,
    candidates: [],
    mode: cascade.mode || 'sequential_cascade',
    reason: `${transitionReason}; cascade exhausted after ${baseAttemptedIds.length} attempt(s).`,
  };
}

/**
 * Cancels an in-flight `offerCascade`, clears `offeredToIds`, and restores unassigned queue status.
 */
export async function cancelOfferCascade(
  params: CancelOfferCascadeParams
): Promise<OfferCascadeStepResult> {
  const {
    trip,
    reason = 'Offer cascade cancelled by dispatcher',
    actorRole = 'dispatcher',
    actorId,
    bookingService = getBookingService(),
    nowMs = Date.now(),
  } = params;

  if (!trip.offerCascade || trip.offerCascade.state !== 'active') {
    return { outcome: 'noop', trip, candidate: null, candidates: [] };
  }

  const nowIso = new Date(nowMs).toISOString();
  const nextStatus: TripStatus =
    trip.status === 'offered' && !trip.assignedDriverId
      ? resolvePostExhaustionFallbackStatus(trip)
      : trip.status;

  const cancelledCascade: TripOfferCascade = {
    ...trip.offerCascade,
    state: 'cancelled',
    activeOfferedDriverId: null,
    activeOfferedDriverName: '',
    activeOfferedDriverIds: [],
  };

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: nextStatus,
    timestamp: nowIso,
    actorId,
    actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
    reason,
  };

  const cancelAudit: TripAuditEvent = {
    action: 'STATUS_CHANGED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `CNL-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'offer',
    context: `${reason}. Cleared active driver offer and restored status to ${nextStatus}.`,
  };

  const patch: Partial<Trip> = {
    status: nextStatus,
    offeredToIds: [],
    offerCascade: cancelledCascade,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), cancelAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  return {
    outcome: 'cancelled',
    trip: updatedTrip,
    candidate: null,
    candidates: [],
    reason,
  };
}

/**
 * Runs a 1-click Auto-Dispatch sweep across all open trips currently inside `isTripWithinDispatchLeadWindow`.
 * Never touches rides outside the Pre-Pickup Lead Window (e.g., 3 hours, 2 weeks, or 2 months ahead),
 * and updates `workingTrips` sequentially so the same driver is never double-offered across ready rides.
 */
export async function runReadyAutoDispatchSweep(
  params: RunAutoDispatchSweepParams
): Promise<AutoDispatchSweepSummary> {
  const {
    trips,
    drivers,
    zones,
    config,
    modeOverride,
    fleetVehicles,
    vehicleTiers,
    actorRole = 'dispatcher',
    actorId,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
    includeExhausted = false,
  } = params;

  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const resolvedMode: ActiveAutoDispatchStrategyMode =
    modeOverride ??
    (cfg.dispatchMode !== 'manual_1tap' ? cfg.dispatchMode : cfg.sweepExecutionMode);

  const readyTrips = getReadyForAutoDispatchTrips(trips, cfg, nowMs, { includeExhausted });
  if (readyTrips.length === 0) {
    return {
      mode: resolvedMode,
      readyCount: 0,
      dispatchedCount: 0,
      offeredCount: 0,
      assignedCount: 0,
      exhaustedCount: 0,
      updatedTrips: [...trips],
      results: [],
    };
  }

  const workingTripMap = new Map<string, Trip>(trips.map((t) => [t.id, t]));
  const results: OfferCascadeStepResult[] = [];
  let offeredCount = 0;
  let assignedCount = 0;
  let exhaustedCount = 0;

  for (const readyTrip of readyTrips) {
    const currentTrip = workingTripMap.get(readyTrip.id) || readyTrip;
    const stepRes = await executeAutoDispatch({
      trip: currentTrip,
      drivers,
      zones,
      config: cfg,
      modeOverride: resolvedMode,
      fleetVehicles,
      activeTrips: Array.from(workingTripMap.values()),
      vehicleTiers,
      actorRole,
      actorId,
      bookingService,
      sendPush,
      nowMs,
    });

    workingTripMap.set(readyTrip.id, stepRes.trip);
    results.push(stepRes);

    if (stepRes.outcome === 'offered') offeredCount++;
    else if (stepRes.outcome === 'assigned') assignedCount++;
    else if (stepRes.outcome === 'exhausted') exhaustedCount++;
  }

  return {
    mode: resolvedMode,
    readyCount: readyTrips.length,
    dispatchedCount: offeredCount + assignedCount,
    offeredCount,
    assignedCount,
    exhaustedCount,
    updatedTrips: trips.map((t) => workingTripMap.get(t.id) || t),
    results,
  };
}
