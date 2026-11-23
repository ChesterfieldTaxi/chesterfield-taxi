/**
 * Server-Isolated Unattended Auto-Dispatch Engine (`auto-dispatch.server.ts` — Phase 50)
 *
 * Consumed exclusively by `POST /api/auto-dispatch` (`app/routes/api.auto-dispatch.ts`),
 * `sla-cron.server.ts`, and server verification suites (`scripts/test-auto-dispatch-admin-controls.ts`).
 *
 * Security & Isolation Guarantees:
 * - Zero Firestore rule weakening: guest browsers never read `/drivers` directly.
 * - Zero trust of client payload: accepts ONLY `{ tripId }` (or `tripIds[]`), re-reads the
 *   authoritative Firestore `/trips/{tripId}`, `/config/appSettings`, `/drivers`, and `/zones`
 *   via `getServiceAccountDatastoreToken()`, and enforces `isTripEligibleForAutoPilot` server-side.
 * - Zero PII returned in HTTP responses.
 */

import type { AppSettings, DispatchAutomationConfig, DispatchAutomationMode } from '../../types/config';
import type { Trip, TripStatus } from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
} from '../auth/server-auth.server';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  getAdminConfigService,
  normalizeDispatchAutomationConfig,
} from '../config/admin-config.service';
import { isFirebaseConfigured } from '../firebase';
import { DEFAULT_ZONES } from '../zones/zone.service';
import {
  executeAutoDispatch,
  isTripEligibleForAutoPilot,
  isTripWithinDispatchLeadWindow,
  isWithinAutoDispatchOperatingHours,
  type AutoDispatchDriverInput,
  type OfferCascadeStepResult,
} from './auto-dispatch.service';
import {
  getServiceAccountDatastoreToken,
  listCollectionFirestoreRest,
  patchFirestoreTripRest,
} from './sla-cron.server';

const VALID_TRIP_ID_PATTERN = /^[a-zA-Z0-9_-]{4,64}$/;

export interface ServerAutoDispatchOptions {
  bearerToken?: string;
  nowMs?: number;
  bookingServiceOverride?: IBookingService;
  settingsOverride?: Partial<AppSettings>;
  driversOverride?: AutoDispatchDriverInput[];
  zonesOverride?: ZoneGeofence[];
  skipRateLimitForTests?: boolean;
}

export interface ServerAutoDispatchTripResult {
  success: boolean;
  tripId: string;
  dispatched: boolean;
  outcome: OfferCascadeStepResult['outcome'] | 'skipped_ineligible' | 'not_found';
  mode: DispatchAutomationMode;
  status?: TripStatus;
  reason?: string;
}

function describeAutoPilotIneligibility(
  trip: Trip,
  cfg: DispatchAutomationConfig,
  nowMs: number
): string {
  if (cfg.dispatchMode === 'manual_1tap') {
    return 'Auto-Pilot is disabled (mode is 1-Tap Manual).';
  }
  if (cfg.isPaused) {
    return 'Auto-Pilot is currently paused.';
  }
  if (!isWithinAutoDispatchOperatingHours(cfg, new Date(nowMs))) {
    return 'Current time is outside configured Auto-Dispatch operating hours.';
  }
  if (trip.assignedDriverId) {
    return 'Trip is already assigned to a driver.';
  }
  if (trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed') {
    return 'Trip requires human dispatcher confirmation before auto-dispatch.';
  }
  if (trip.offerCascade?.state === 'active') {
    return 'Trip already has an active offer cascade.';
  }
  if (trip.offerCascade?.state === 'exhausted' || trip.offerCascade?.state === 'cancelled') {
    return `Trip cascade is already ${trip.offerCascade.state}.`;
  }
  const isAsap = trip.bookingType === 'asap' || !trip.scheduledPickupTime;
  if (isAsap && !cfg.autoDispatchAsapRides) {
    return 'ASAP ride auto-dispatch is disabled in settings.';
  }
  if (!isAsap && !cfg.autoDispatchScheduledRides) {
    return 'Scheduled ride auto-dispatch is disabled in settings.';
  }
  if (!isTripWithinDispatchLeadWindow(trip, cfg, nowMs)) {
    return `Trip is outside the ${cfg.scheduledDispatchLeadMinutes}m Pre-Pickup Lead Window.`;
  }
  return 'Trip is not eligible for unattended Auto-Pilot.';
}

/**
 * Loads authoritative trip & fleet context server-side, verifies `isTripEligibleForAutoPilot`,
 * and executes `executeAutoDispatch` idempotently.
 */
export async function executeServerAutoDispatchForTrip(
  rawTripId: string,
  options?: ServerAutoDispatchOptions
): Promise<ServerAutoDispatchTripResult> {
  const tripId = String(rawTripId || '').trim();
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const restToken =
    options?.bearerToken ||
    (!options?.bookingServiceOverride ? (await getServiceAccountDatastoreToken()) || undefined : undefined);

  // 1. Load authoritative AppSettings & DispatchAutomationConfig
  let settings: Partial<AppSettings> | null = options?.settingsOverride || null;
  if (!settings && restToken && isFirebaseConfigured()) {
    settings = (await fetchFirestoreDocumentRest(
      'config',
      'appSettings',
      restToken
    )) as Partial<AppSettings> | null;
  }
  if (!settings) {
    try {
      settings = await getAdminConfigService().getSettings();
    } catch {
      settings = null;
    }
  }

  const dispatchConfig: DispatchAutomationConfig = normalizeDispatchAutomationConfig(
    settings?.dispatchAutomation || DEFAULT_DISPATCH_AUTOMATION_CONFIG
  );

  // Fast exit before reading collections when Auto-Pilot is off, paused, or outside operating hours
  if (
    dispatchConfig.dispatchMode === 'manual_1tap' ||
    dispatchConfig.isPaused ||
    !isWithinAutoDispatchOperatingHours(dispatchConfig, new Date(nowMs))
  ) {
    const fastReason =
      dispatchConfig.dispatchMode === 'manual_1tap'
        ? 'Auto-Pilot is disabled (mode is 1-Tap Manual).'
        : dispatchConfig.isPaused
        ? 'Auto-Pilot is currently paused.'
        : 'Current time is outside configured Auto-Dispatch operating hours.';
    return {
      success: true,
      tripId,
      dispatched: false,
      outcome: 'skipped_ineligible',
      mode: dispatchConfig.dispatchMode,
      reason: fastReason,
    };
  }

  // 2. Load authoritative Trip document
  const baseBookingService = options?.bookingServiceOverride || getBookingService();
  let targetTrip: Trip | null = null;

  if (!options?.bookingServiceOverride && restToken && isFirebaseConfigured()) {
    const docData = await fetchFirestoreDocumentRest('trips', tripId, restToken);
    if (docData) {
      targetTrip = { ...(docData as Trip), id: String(docData.id || tripId) };
    }
  }

  if (!targetTrip && baseBookingService.getBookingStatus) {
    try {
      const statusRes = await baseBookingService.getBookingStatus(tripId);
      if (statusRes?.trip) {
        targetTrip = statusRes.trip;
      }
    } catch {
      targetTrip = null;
    }
  }

  if (!targetTrip && baseBookingService.getAllTrips) {
    try {
      const all = await baseBookingService.getAllTrips();
      targetTrip = all.find((t) => t.id === tripId) || null;
    } catch {
      targetTrip = null;
    }
  }

  if (!targetTrip) {
    return {
      success: false,
      tripId,
      dispatched: false,
      outcome: 'not_found',
      mode: dispatchConfig.dispatchMode,
      reason: 'Trip was not found.',
    };
  }

  // 3. Enforce authoritative server-side eligibility (lead window, CONFIRMED status, idempotency)
  if (!isTripEligibleForAutoPilot(targetTrip, dispatchConfig, nowMs)) {
    return {
      success: true,
      tripId,
      dispatched: false,
      outcome: 'skipped_ineligible',
      mode: dispatchConfig.dispatchMode,
      status: targetTrip.status,
      reason: describeAutoPilotIneligibility(targetTrip, dispatchConfig, nowMs),
    };
  }

  // 4. Load Drivers, Zones & Active Trips for conflict evaluation
  let drivers: AutoDispatchDriverInput[] = options?.driversOverride || [];
  let zones: ZoneGeofence[] = options?.zonesOverride || [...DEFAULT_ZONES];
  let allTrips: Trip[] = [];

  if (!options?.bookingServiceOverride && restToken && isFirebaseConfigured()) {
    const [restTrips, restDrivers, restZones] = await Promise.all([
      listCollectionFirestoreRest<Trip>('trips', restToken, 250),
      drivers.length === 0
        ? listCollectionFirestoreRest<AutoDispatchDriverInput>('drivers', restToken, 150)
        : Promise.resolve(drivers),
      !options?.zonesOverride
        ? listCollectionFirestoreRest<ZoneGeofence>('zones', restToken, 100)
        : Promise.resolve(zones),
    ]);
    if (restTrips) allTrips = restTrips;
    if (restDrivers) drivers = restDrivers;
    if (restZones && restZones.length > 0) zones = restZones;
  } else if (baseBookingService.getAllTrips) {
    try {
      allTrips = await baseBookingService.getAllTrips();
    } catch {
      allTrips = [targetTrip];
    }
  }

  let currentPersistedTrip: Trip = targetTrip;
  const persistenceAdapter: IBookingService = {
    ...baseBookingService,
    updateTrip: async (id: string, updates: Partial<Trip>): Promise<Trip> => {
      const merged: Trip = {
        ...currentPersistedTrip,
        ...updates,
        updatedAt: updates.updatedAt || nowIso,
      };
      currentPersistedTrip = merged;

      if (!options?.bookingServiceOverride && restToken && isFirebaseConfigured()) {
        const ok = await patchFirestoreTripRest(id, updates, restToken);
        if (ok) return merged;
      }

      if (baseBookingService.updateTrip) {
        return await baseBookingService.updateTrip(id, updates);
      }
      return merged;
    },
  };

  const execRes = await executeAutoDispatch({
    trip: targetTrip,
    drivers,
    zones,
    config: dispatchConfig,
    fleetVehicles: settings?.fleet,
    activeTrips: allTrips.length > 0 ? allTrips : [targetTrip],
    vehicleTiers: settings?.vehicles,
    actorRole: 'system',
    bookingService: persistenceAdapter,
    sendPush: false,
    nowMs,
  });

  return {
    success: true,
    tripId,
    dispatched: execRes.outcome === 'offered' || execRes.outcome === 'assigned',
    outcome: execRes.outcome,
    mode: execRes.mode || dispatchConfig.dispatchMode,
    status: execRes.trip.status,
    ...(execRes.reason ? { reason: execRes.reason } : {}),
  };
}

/**
 * HTTP handler for `POST /api/auto-dispatch`.
 */
export async function handleAutoDispatchHttpRequest(
  request: Request,
  options?: ServerAutoDispatchOptions
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const clientIp = getRequestClientIp(request);
  if (
    !options?.skipRateLimitForTests &&
    !checkRateLimit(`auto_dispatch_ip:${clientIp}`, 30, 60_000)
  ) {
    return Response.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many auto-dispatch requests. Please wait a moment.',
      },
      { status: 429, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  let body: { tripId?: unknown; tripIds?: unknown } | null = null;
  try {
    body = (await request.json()) as { tripId?: unknown; tripIds?: unknown };
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON request body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const requestedIds: string[] = [];
  if (typeof body?.tripId === 'string' && body.tripId.trim()) {
    requestedIds.push(body.tripId.trim());
  }
  if (Array.isArray(body?.tripIds)) {
    for (const raw of body.tripIds.slice(0, 5)) {
      if (typeof raw === 'string' && raw.trim() && !requestedIds.includes(raw.trim())) {
        requestedIds.push(raw.trim());
      }
    }
  }

  if (requestedIds.length === 0 || requestedIds.some((id) => !VALID_TRIP_ID_PATTERN.test(id))) {
    return Response.json(
      { success: false, error: 'A valid tripId is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  for (const id of requestedIds) {
    if (
      !options?.skipRateLimitForTests &&
      !checkRateLimit(`auto_dispatch_trip:${id}`, 6, 60_000)
    ) {
      return Response.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many auto-dispatch triggers for this trip.',
        },
        { status: 429, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
  }

  try {
    if (requestedIds.length === 1) {
      const singleResult = await executeServerAutoDispatchForTrip(requestedIds[0], options);
      const status = singleResult.outcome === 'not_found' ? 404 : 200;
      return Response.json(singleResult, {
        status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    const batchResults: ServerAutoDispatchTripResult[] = [];
    for (const id of requestedIds) {
      const res = await executeServerAutoDispatchForTrip(id, options);
      batchResults.push(res);
    }

    return Response.json(
      {
        success: true,
        dispatchedCount: batchResults.filter((r) => r.dispatched).length,
        results: batchResults,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal auto-dispatch error.';
    console.error('[api.auto-dispatch] Execution error:', message);
    return Response.json(
      { success: false, error: 'Unable to evaluate unattended auto-dispatch.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
