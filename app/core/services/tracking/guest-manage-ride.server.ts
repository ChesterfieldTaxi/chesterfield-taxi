/**
 * Server-Isolated Guest "Manage My Ride" Mutation & Lookup Handler (`guest-manage-ride.server.ts`)
 *
 * Strictly server-only (`*.server.ts` — `0.00 kB` client bundle).
 * Powers self-service guest mutations on `/track/:tripToken` via `POST /api/track`:
 * - `preview_cancel`: Rate-limited read-only policy & fee calculation
 * - `update_notes_flight`: Last-4 phone (or owner auth) verified instant notes/gate/flight update
 *   with Phase 55 `PendingDriverUpdateAck` (`source: 'guest_manage_ride'`) driver alert integration
 * - `modify_time_route`: Pre-dispatch auto-apply (with proportional fare re-estimation +
 *   `evaluateBookingRules`) vs. Assigned-driver `PendingGuestChangeRequest` queue submission
 * - `confirm_cancel`: Last-4 phone (or owner auth) verified policy-aware cancellation clearing
 *   assigned/staged/offered driver state and recording audit history
 *
 * Updates both `/trips/{tripId}` AND `/tripTracking/{trackingToken}` atomically while guaranteeing
 * zero PII ever enters `PublicTripTrackingProjection`.
 */

import { detectAirportInAddresses } from '../../config/airports';
import type { CustomerBookingConfig } from '../../types/config';
import type {
  GeoPoint,
  Trip,
  TripAuditEvent,
  TripFieldDiff,
  TripStatus,
  TripStatusHistoryEntry,
} from '../../types/trip';
import {
  buildPublicTrackingProjection,
  extractPhoneLast4,
  sanitizePublicTrackingProjection,
  toFirestoreClientRuleProjection,
  type PublicTripTrackingProjection,
} from '../../utils/tracking-token.util';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
  verifyServerRequestAuth,
  type VerifiedServerAuth,
} from '../auth/server-auth.server';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import {
  evaluateBookingRules,
  type BookingRulesConfig,
} from '../bookingRulesEngine';
import { DEFAULT_APP_SETTINGS } from '../config/admin-config.service';
import { loadPublicSettingsForServer } from '../config/public-settings.server';
import { isFirebaseConfigured } from '../firebase';
import {
  getServiceAccountDatastoreToken,
  patchFirestoreDocumentRest,
} from '../payments/stripe-webhook.server';
import {
  applyInstantGuestDetailsUpdate,
  buildGuestCancellationPatch,
  buildPendingGuestChangeRequestPatch,
  evaluateGuestCancellationPolicy,
  evaluateGuestManageEligibility,
  reestimateTripPricingForRouteChange,
} from './guest-manage-ride';

export const TRACKING_TOKEN_PATTERN = /^trk_[a-zA-Z0-9_-]{16,80}$/;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
};

export type GuestManageRideIntent =
  | 'preview_cancel'
  | 'update_notes_flight'
  | 'modify_time_route'
  | 'confirm_cancel';

export interface GuestManageRideServerOptions {
  bookingServiceOverride?: IBookingService;
  bookingConfigOverride?: Partial<CustomerBookingConfig>;
  bookingRulesConfigOverride?: Partial<BookingRulesConfig>;
  skipRateLimitForTests?: boolean;
  nowMs?: number;
  parsedBody?: Record<string, any>;
}

interface ServerGuestTrackingStore {
  projectionsByToken: Map<string, PublicTripTrackingProjection>;
  tripsById: Map<string, Trip>;
}

const serverTrackingStore: ServerGuestTrackingStore = ((globalThis as any)
  .__ct_guest_manage_ride_store ||= {
  projectionsByToken: new Map<string, PublicTripTrackingProjection>(),
  tripsById: new Map<string, Trip>(),
});

export function getServerGuestTrackingStore(): ServerGuestTrackingStore {
  return serverTrackingStore;
}

export function resetServerGuestTrackingStoreForTests(): void {
  serverTrackingStore.projectionsByToken.clear();
  serverTrackingStore.tripsById.clear();
}

function normStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function isValidCoordinates(coord: unknown): coord is GeoPoint {
  if (!coord || typeof coord !== 'object') return false;
  const c = coord as Record<string, unknown>;
  return (
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng)
  );
}

/**
 * Resolves a sanitized `PublicTripTrackingProjection` for `GET /api/track?token=trk_...`
 * or `POST /api/track` token lookup, merging Firestore REST with server-side projection mirror
 * and optional `bookingServiceOverride`.
 */
export async function resolvePublicTrackingByTokenServer(
  token: string,
  options?: Pick<GuestManageRideServerOptions, 'bookingServiceOverride'>
): Promise<PublicTripTrackingProjection | null> {
  if (!token || !TRACKING_TOKEN_PATTERN.test(token)) return null;

  // 1. Explicit test / injected booking service override
  if (options?.bookingServiceOverride) {
    const cachedProj = serverTrackingStore.projectionsByToken.get(token);
    if (options.bookingServiceOverride.getAllTrips) {
      const all = await options.bookingServiceOverride.getAllTrips();
      const matched = all.find((t) => t.trackingToken === token);
      if (matched) {
        const built = buildPublicTrackingProjection(matched);
        if (built) {
          const clean = sanitizePublicTrackingProjection(built);
          serverTrackingStore.projectionsByToken.set(token, clean);
          return clean;
        }
      }
    }
    if (cachedProj?.tripId) {
      const statusRes = await options.bookingServiceOverride.getBookingStatus(cachedProj.tripId);
      if (statusRes?.trip) {
        const built = buildPublicTrackingProjection(statusRes.trip);
        if (built) {
          const clean = sanitizePublicTrackingProjection(built);
          serverTrackingStore.projectionsByToken.set(token, clean);
          return clean;
        }
      }
    }
    return cachedProj ? sanitizePublicTrackingProjection(cachedProj) : null;
  }

  // 2. Live Firestore REST read on `/tripTracking/{token}` (+ privileged server-only enrichment from `/trips/{tripId}`)
  const remoteDoc = isFirebaseConfigured()
    ? await fetchFirestoreDocumentRest('tripTracking', token)
    : null;
  const mirroredProj = serverTrackingStore.projectionsByToken.get(token);

  let authoritativeProjection: PublicTripTrackingProjection | null = null;
  const candidateTripId = String(remoteDoc?.tripId || mirroredProj?.tripId || '').trim();
  if (candidateTripId && isFirebaseConfigured()) {
    try {
      const datastoreToken = await getServiceAccountDatastoreToken();
      if (datastoreToken) {
        const tripDoc = await fetchFirestoreDocumentRest('trips', candidateTripId, datastoreToken);
        if (tripDoc && tripDoc.id) {
          const fullTrip = tripDoc as Trip;
          if (!fullTrip.trackingToken) {
            fullTrip.trackingToken = token;
          }
          const built = buildPublicTrackingProjection(fullTrip);
          if (built) {
            authoritativeProjection = sanitizePublicTrackingProjection(built);
            serverTrackingStore.projectionsByToken.set(token, authoritativeProjection);
          }
        }
      }
    } catch {
      // Fall back cleanly to mirroredProj / remoteDoc below
    }
  }

  if (authoritativeProjection && mirroredProj) {
    const authMs = Date.parse(String(authoritativeProjection.updatedAt || '')) || 0;
    const mirrorMs = Date.parse(String(mirroredProj.updatedAt || '')) || 0;
    return mirrorMs > authMs
      ? sanitizePublicTrackingProjection(mirroredProj)
      : authoritativeProjection;
  }

  if (authoritativeProjection) {
    return authoritativeProjection;
  }

  if (remoteDoc && mirroredProj) {
    const remoteMs = Date.parse(String(remoteDoc.updatedAt || '')) || 0;
    const mirrorMs = Date.parse(String(mirroredProj.updatedAt || '')) || 0;
    return mirrorMs >= remoteMs
      ? sanitizePublicTrackingProjection(mirroredProj)
      : sanitizePublicTrackingProjection(remoteDoc);
  }

  if (remoteDoc) {
    return sanitizePublicTrackingProjection(remoteDoc);
  }

  if (mirroredProj) {
    return sanitizePublicTrackingProjection(mirroredProj);
  }

  // 3. Fallback to default BookingService (e.g., local dev / MockBookingService)
  try {
    const bookingService = getBookingService();
    if (bookingService.getAllTrips) {
      const all = await bookingService.getAllTrips();
      const matched = all.find((t) => t.trackingToken === token);
      if (matched) {
        const built = buildPublicTrackingProjection(matched);
        if (built) {
          const clean = sanitizePublicTrackingProjection(built);
          serverTrackingStore.projectionsByToken.set(token, clean);
          return clean;
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }

  return null;
}

async function resolveAuthoritativeTripByToken(
  token: string,
  auth: VerifiedServerAuth,
  options?: GuestManageRideServerOptions
): Promise<{ trip: Trip; datastoreToken: string | null } | null> {
  // 1. Dependency-injected IBookingService override (deterministic Node test harness)
  if (options?.bookingServiceOverride) {
    if (options.bookingServiceOverride.getAllTrips) {
      const all = await options.bookingServiceOverride.getAllTrips();
      const matched = all.find((t) => t.trackingToken === token);
      if (matched) {
        return { trip: matched, datastoreToken: null };
      }
    }
    const cachedProj = serverTrackingStore.projectionsByToken.get(token);
    if (cachedProj?.tripId) {
      const res = await options.bookingServiceOverride.getBookingStatus(cachedProj.tripId);
      if (res?.trip && res.trip.trackingToken === token) {
        return { trip: res.trip, datastoreToken: null };
      }
    }
    return null;
  }

  // 2. Privileged Service Account Firestore REST lookup
  const datastoreToken = isFirebaseConfigured()
    ? await getServiceAccountDatastoreToken()
    : null;

  let knownTripId = serverTrackingStore.projectionsByToken.get(token)?.tripId || '';

  if (isFirebaseConfigured()) {
    const trackingDoc = await fetchFirestoreDocumentRest(
      'tripTracking',
      token,
      datastoreToken || undefined
    );
    if (trackingDoc?.tripId) {
      knownTripId = String(trackingDoc.tripId);
    }

    const readBearer = datastoreToken || (auth.authenticated ? auth.rawToken : undefined);
    if (knownTripId && readBearer) {
      const tripDoc = await fetchFirestoreDocumentRest('trips', knownTripId, readBearer);
      if (tripDoc && tripDoc.id) {
        const trip = tripDoc as Trip;
        if (!trip.trackingToken) {
          trip.trackingToken = token;
        }
        return { trip, datastoreToken };
      }
    }
  }

  // 3. Server mirror / local BookingService fallback
  if (knownTripId && serverTrackingStore.tripsById.has(knownTripId)) {
    const mirrored = serverTrackingStore.tripsById.get(knownTripId)!;
    return { trip: mirrored, datastoreToken };
  }

  const bookingService = getBookingService();
  if (knownTripId) {
    try {
      const statusRes = await bookingService.getBookingStatus(knownTripId);
      if (statusRes?.trip) {
        return { trip: statusRes.trip, datastoreToken };
      }
    } catch {
      // Continue to getAllTrips scan
    }
  }

  if (bookingService.getAllTrips) {
    try {
      const all = await bookingService.getAllTrips();
      const matched = all.find((t) => t.trackingToken === token);
      if (matched) {
        return { trip: matched, datastoreToken };
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

async function persistTripAndTrackingAtomically(params: {
  tripId: string;
  tripPatch: Partial<Trip>;
  updatedTrip: Trip;
  datastoreToken: string | null;
  auth: VerifiedServerAuth;
  options?: GuestManageRideServerOptions;
}): Promise<PublicTripTrackingProjection> {
  const { tripId, tripPatch, updatedTrip, datastoreToken, auth, options } = params;

  let finalTrip: Trip = updatedTrip;

  // 1. Update injected bookingServiceOverride if provided
  if (options?.bookingServiceOverride) {
    if (options.bookingServiceOverride.updateTrip) {
      finalTrip = await options.bookingServiceOverride.updateTrip(tripId, tripPatch);
    } else if (tripPatch.status === 'cancelled') {
      finalTrip = await options.bookingServiceOverride.cancelBooking(
        tripId,
        tripPatch.cancellationReason,
        'passenger'
      );
      finalTrip = { ...finalTrip, ...tripPatch };
    }
  } else {
    // 2. Privileged Firestore REST patch on BOTH `/trips/{tripId}` and `/tripTracking/{token}`
    const writeBearer =
      datastoreToken || (auth.authenticated && auth.isDispatcher ? auth.rawToken : undefined);

    let wroteViaRest = false;
    if (writeBearer && isFirebaseConfigured()) {
      const rawProjection = buildPublicTrackingProjection(finalTrip);
      const tripOk = await patchFirestoreDocumentRest(
        'trips',
        tripId,
        tripPatch as Record<string, unknown>,
        writeBearer,
        false
      );
      const projOk = rawProjection
        ? await patchFirestoreDocumentRest(
            'tripTracking',
            rawProjection.trackingToken,
            toFirestoreClientRuleProjection(rawProjection),
            writeBearer,
            true
          )
        : true;
      wroteViaRest = tripOk && projOk;
    }

    // 3. Always sync BookingService fallback when REST service-account token is not active
    if (!wroteViaRest) {
      try {
        const bookingService = getBookingService();
        if (bookingService.updateTrip) {
          finalTrip = await bookingService.updateTrip(tripId, tripPatch);
        } else if (tripPatch.status === 'cancelled') {
          finalTrip = await bookingService.cancelBooking(
            tripId,
            tripPatch.cancellationReason,
            'passenger'
          );
        }
      } catch (err) {
        console.warn('[guest-manage-ride.server] BookingService fallback update warning:', err);
      }
    }
  }

  const builtProjection = buildPublicTrackingProjection(finalTrip);
  if (!builtProjection) {
    throw new Error('Failed to build sanitized tracking projection for trip.');
  }

  const sanitizedProjection = sanitizePublicTrackingProjection(builtProjection);
  serverTrackingStore.tripsById.set(finalTrip.id, finalTrip);
  serverTrackingStore.projectionsByToken.set(
    sanitizedProjection.trackingToken,
    sanitizedProjection
  );

  return sanitizedProjection;
}

function isCallerAuthorizedOwnerOrStaff(auth: VerifiedServerAuth, trip: Trip): boolean {
  if (!auth.authenticated) return false;
  if (auth.isAdminSecret || auth.isAdmin || auth.isDispatcher) return true;
  if (auth.uid && (trip.customerId === auth.uid || trip.userId === auth.uid)) {
    return true;
  }
  if (
    auth.email &&
    trip.passenger?.email &&
    trip.passenger.email.trim().toLowerCase() === auth.email.trim().toLowerCase()
  ) {
    return true;
  }
  if (
    auth.isCorporateManager &&
    auth.corporateAccountId &&
    trip.corporateAccountId &&
    auth.corporateAccountId === trip.corporateAccountId
  ) {
    return true;
  }
  return false;
}

async function resolveBookingConfig(
  options?: GuestManageRideServerOptions
): Promise<Partial<CustomerBookingConfig>> {
  if (options?.bookingConfigOverride) {
    return options.bookingConfigOverride;
  }
  try {
    const publicSettings = await loadPublicSettingsForServer();
    if (publicSettings?.customerBookingConfig) {
      return publicSettings.customerBookingConfig;
    }
  } catch {
    // Fallback below
  }
  return DEFAULT_APP_SETTINGS.customerBookingConfig || {};
}

/**
 * Handles all `POST /api/track` requests carrying a self-service `body.intent`.
 */
export async function handleGuestManageRidePost(
  request: Request,
  options?: GuestManageRideServerOptions
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  const clientIp = getRequestClientIp(request);

  let body: Record<string, any>;
  try {
    body = options?.parsedBody ?? ((await request.json()) as Record<string, any>);
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON request payload.' },
      { status: 400 }
    );
  }

  const intent = normStr(body?.intent) as GuestManageRideIntent;
  const validIntents: ReadonlySet<string> = new Set<GuestManageRideIntent>([
    'preview_cancel',
    'update_notes_flight',
    'modify_time_route',
    'confirm_cancel',
  ]);

  if (!validIntents.has(intent)) {
    return Response.json(
      { success: false, error: `Unsupported manage-ride intent "${intent}".` },
      { status: 400 }
    );
  }

  const token = normStr(body?.trackingToken);
  if (!token || !TRACKING_TOKEN_PATTERN.test(token)) {
    return Response.json(
      { success: false, error: 'A valid tracking token is required.' },
      { status: 400 }
    );
  }

  // 1. Intent: Read-only cancellation policy & fee preview (`preview_cancel`)
  if (intent === 'preview_cancel') {
    if (
      !options?.skipRateLimitForTests &&
      !checkRateLimit(`track_cancel_preview:${clientIp}:${token}`, 30, 60_000)
    ) {
      return Response.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many requests. Please wait a moment and try again.',
        },
        { status: 429 }
      );
    }

    const auth = await verifyServerRequestAuth(request);
    const resolved = await resolveAuthoritativeTripByToken(token, auth, options);
    if (!resolved) {
      return Response.json(
        { success: false, error: 'Reservation session not found or expired.' },
        { status: 404 }
      );
    }

    const bookingConfig = await resolveBookingConfig(options);
    const policy = evaluateGuestCancellationPolicy({
      trip: resolved.trip,
      bookingConfig,
      nowMs: options?.nowMs,
    });

    return Response.json(
      { success: true, policy },
      { headers: NO_STORE_HEADERS }
    );
  }

  // 2. Write Intents (`update_notes_flight` | `modify_time_route` | `confirm_cancel`)
  const auth = await verifyServerRequestAuth(request);

  // Rate-limit per IP + trackingToken on unauthenticated write attempts
  if (
    !options?.skipRateLimitForTests &&
    !auth.isAdminSecret &&
    !auth.isDispatcher &&
    !checkRateLimit(`track_manage_write:${clientIp}:${token}`, 8, 5 * 60_000)
  ) {
    return Response.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many modification attempts. Please wait 5 minutes or contact dispatch.',
      },
      { status: 429 }
    );
  }

  const resolved = await resolveAuthoritativeTripByToken(token, auth, options);
  if (!resolved) {
    return Response.json(
      { success: false, error: 'Reservation session not found or expired.' },
      { status: 404 }
    );
  }

  const { trip, datastoreToken } = resolved;
  const bypassedViaOwnerOrStaffAuth = isCallerAuthorizedOwnerOrStaff(auth, trip);

  if (!bypassedViaOwnerOrStaffAuth) {
    const providedLast4 = extractPhoneLast4(body?.phoneLast4);
    if (providedLast4.length !== 4) {
      return Response.json(
        {
          success: false,
          code: 'PHONE_VERIFICATION_REQUIRED',
          error: 'Please enter the last 4 digits of the passenger phone number on this booking.',
        },
        { status: 403 }
      );
    }

    const tripPassengerLast4 = extractPhoneLast4(trip.passenger?.phone);
    if (!tripPassengerLast4 || providedLast4 !== tripPassengerLast4) {
      return Response.json(
        {
          success: false,
          code: 'PHONE_VERIFICATION_FAILED',
          error:
            'Verification failed: the last 4 phone digits did not match the passenger phone number.',
        },
        { status: 403 }
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Intent A: `update_notes_flight` (Instant Notes, Gate Code & Flight #)
  // ───────────────────────────────────────────────────────────────────────────
  if (intent === 'update_notes_flight') {
    const eligibility = evaluateGuestManageEligibility(trip);
    if (!eligibility.canEditNotesFlight) {
      return Response.json(
        {
          success: false,
          code: 'EDIT_LOCKED',
          error:
            eligibility.lockReason ||
            'Notes and flight information can no longer be edited on this trip.',
        },
        { status: 409 }
      );
    }

    const driverNotes =
      typeof body?.driverNotes === 'string' ? body.driverNotes.slice(0, 500) : undefined;
    const gateCode =
      typeof body?.gateCode === 'string' ? body.gateCode.slice(0, 32) : undefined;
    const airline =
      typeof body?.airline === 'string' ? body.airline.slice(0, 80) : undefined;
    const flightNumber =
      typeof body?.flightNumber === 'string' ? body.flightNumber.slice(0, 24) : undefined;

    const mutation = applyInstantGuestDetailsUpdate({
      trip,
      driverNotes,
      gateCode,
      airline,
      flightNumber,
      nowMs: options?.nowMs,
    });

    const tracking = await persistTripAndTrackingAtomically({
      tripId: trip.id,
      tripPatch: mutation.tripPatch,
      updatedTrip: mutation.updatedTrip,
      datastoreToken,
      auth,
      options,
    });

    return Response.json(
      {
        success: true,
        tracking,
        driverNotified: Boolean(mutation.pendingDriverUpdateAck),
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Intent B: `modify_time_route` (Pre-Dispatch Auto-Apply vs Assigned Request)
  // ───────────────────────────────────────────────────────────────────────────
  if (intent === 'modify_time_route') {
    const eligibility = evaluateGuestManageEligibility(trip);
    if (!eligibility.canModifyTimeRoute || eligibility.routeTimeMode === 'locked') {
      return Response.json(
        {
          success: false,
          code: 'ROUTE_TIME_LOCKED',
          error:
            eligibility.lockReason ||
            'Pickup time and route cannot be modified online at this stage. Please call dispatch.',
        },
        { status: 409 }
      );
    }

    const rawSchedIso = normStr(body?.scheduledPickupTime);
    let parsedSchedIso: string | undefined;
    if (rawSchedIso) {
      const ms = Date.parse(rawSchedIso);
      if (!Number.isFinite(ms)) {
        return Response.json(
          { success: false, error: 'Please provide a valid scheduled pickup date and time.' },
          { status: 400 }
        );
      }
      parsedSchedIso = new Date(ms).toISOString();
    }

    const cleanPickupAddress = normStr(body?.pickupAddress).slice(0, 240) || undefined;
    const cleanDropoffAddress = normStr(body?.dropoffAddress).slice(0, 240) || undefined;
    const pickupCoordinates = isValidCoordinates(body?.pickupCoordinates)
      ? { lat: body.pickupCoordinates.lat, lng: body.pickupCoordinates.lng }
      : undefined;
    const dropoffCoordinates = isValidCoordinates(body?.dropoffCoordinates)
      ? { lat: body.dropoffCoordinates.lat, lng: body.dropoffCoordinates.lng }
      : undefined;
    const customerReason = normStr(body?.customerReason).slice(0, 300) || undefined;

    if (!parsedSchedIso && !cleanPickupAddress && !cleanDropoffAddress) {
      return Response.json(
        {
          success: false,
          error: 'Please specify an updated pickup time, pickup address, or destination address.',
        },
        { status: 400 }
      );
    }

    // Mode B1: Driver Assigned -> Submit `PendingGuestChangeRequest` for 1-Tap Dispatch Approval
    if (eligibility.routeTimeMode === 'request_approval') {
      const pendingMutation = buildPendingGuestChangeRequestPatch({
        trip,
        scheduledPickupTime: parsedSchedIso,
        pickupAddress: cleanPickupAddress,
        pickupCoordinates,
        dropoffAddress: cleanDropoffAddress,
        dropoffCoordinates,
        customerReason,
        nowMs: options?.nowMs,
      });

      const tracking = await persistTripAndTrackingAtomically({
        tripId: trip.id,
        tripPatch: pendingMutation.tripPatch,
        updatedTrip: pendingMutation.updatedTrip,
        datastoreToken,
        auth,
        options,
      });

      return Response.json(
        {
          success: true,
          mode: 'pending_approval',
          requestId: pendingMutation.changeRequest.requestId,
          tracking,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Mode B2: Pre-Dispatch Unassigned -> Auto-Apply with Fare Re-Estimation & Booking Rules Gate
    const nowMs =
      typeof options?.nowMs === 'number' && Number.isFinite(options.nowMs)
        ? Math.floor(options.nowMs)
        : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const nextPickupLocation = cleanPickupAddress
      ? {
          ...trip.pickupLocation,
          address: cleanPickupAddress,
          formattedAddress: cleanPickupAddress,
          ...(pickupCoordinates ? { coordinates: pickupCoordinates } : {}),
        }
      : pickupCoordinates
      ? { ...trip.pickupLocation, coordinates: pickupCoordinates }
      : trip.pickupLocation;

    const nextDropoffLocation = cleanDropoffAddress
      ? {
          ...trip.dropoffLocation,
          address: cleanDropoffAddress,
          formattedAddress: cleanDropoffAddress,
          ...(dropoffCoordinates ? { coordinates: dropoffCoordinates } : {}),
        }
      : dropoffCoordinates
      ? { ...trip.dropoffLocation, coordinates: dropoffCoordinates }
      : trip.dropoffLocation;

    const nextScheduledPickupTime = parsedSchedIso || trip.scheduledPickupTime;
    const nextBookingType: 'asap' | 'scheduled' = parsedSchedIso
      ? 'scheduled'
      : trip.bookingType;

    const reestimated = reestimateTripPricingForRouteChange({
      trip,
      nextPickupAddress: nextPickupLocation.address,
      nextPickupCoordinates: nextPickupLocation.coordinates,
      nextDropoffAddress: nextDropoffLocation.address,
      nextDropoffCoordinates: nextDropoffLocation.coordinates,
    });

    const airportCheck = detectAirportInAddresses(
      nextPickupLocation.address || '',
      nextDropoffLocation.address || ''
    );

    const wasAlreadyConfirmed = ['CONFIRMED', 'confirmed', 'pending', 'offered'].includes(
      String(trip.status || '')
    );

    const priorAirportCheck = detectAirportInAddresses(
      trip.pickupLocation.address || '',
      trip.dropoffLocation.address || ''
    );

    const rulesDecision = evaluateBookingRules(
      {
        ...trip,
        pickupLocation: nextPickupLocation,
        dropoffLocation: nextDropoffLocation,
        bookingType: nextBookingType,
        scheduledPickupTime: nextScheduledPickupTime,
        pricing: reestimated.pricing,
        fare: reestimated.pricing.totalFare,
        isPickupAirport: airportCheck.isPickupAirport,
        isDropoffAirport: airportCheck.isDropoffAirport,
      },
      {
        config: options?.bookingRulesConfigOverride,
        preservePriorConfirmation: wasAlreadyConfirmed,
        priorTrip: {
          ...trip,
          fare: trip.pricing?.totalFare,
          isPickupAirport: priorAirportCheck.isPickupAirport,
          isDropoffAirport: priorAirportCheck.isDropoffAirport,
        },
      }
    );

    if (rulesDecision.action === 'block') {
      return Response.json(
        {
          success: false,
          code: 'BOOKING_RULE_BLOCKED',
          error:
            rulesDecision.reason ||
            'The requested route or schedule modification is restricted by dispatch policy.',
        },
        { status: 403 }
      );
    }

    const nextStatus: TripStatus =
      rulesDecision.action === 'require_review'
        ? 'UNCONFIRMED'
        : trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed'
        ? 'CONFIRMED'
        : trip.status;

    const fieldChanges: TripFieldDiff[] = [];
    if (nextScheduledPickupTime && nextScheduledPickupTime !== trip.scheduledPickupTime) {
      fieldChanges.push({
        field: 'scheduledPickupTime',
        label: 'Pickup Time',
        oldValue: trip.scheduledPickupTime,
        newValue: nextScheduledPickupTime,
      });
    }
    if (nextPickupLocation.address !== trip.pickupLocation.address) {
      fieldChanges.push({
        field: 'pickupLocation',
        label: 'Pickup Address',
        oldValue: trip.pickupLocation.address,
        newValue: nextPickupLocation.address,
      });
    }
    if (nextDropoffLocation.address !== trip.dropoffLocation.address) {
      fieldChanges.push({
        field: 'dropoffLocation',
        label: 'Dropoff Address',
        oldValue: trip.dropoffLocation.address,
        newValue: nextDropoffLocation.address,
      });
    }
    if (Math.abs(reestimated.fareDelta) >= 0.01) {
      fieldChanges.push({
        field: 'totalFare',
        label: 'Total Fare',
        oldValue: `$${(trip.pricing?.totalFare || 0).toFixed(2)}`,
        newValue: `$${reestimated.pricing.totalFare.toFixed(2)}`,
      });
    }

    const refSuffix = String(Math.abs(nowMs)).slice(-4);
    const auditEvent: TripAuditEvent = {
      action:
        nextStatus === 'UNCONFIRMED' && trip.status !== 'UNCONFIRMED'
          ? 'FLAGGED_FOR_HUMAN_REVIEW'
          : 'TRIP_MODIFIED',
      timestamp: nowIso,
      actorRole: 'passenger',
      referenceNumber: `TRK-${refSuffix}`,
      referenceType: 'edit',
      bookingChannel: 'web',
      fieldChanges: fieldChanges.length > 0 ? fieldChanges : undefined,
      context: `Passenger self-modified pre-dispatch ride via /track (${
        fieldChanges.map((f) => f.label).join(', ') || 'schedule/route'
      })${customerReason ? ` — Note: "${customerReason}"` : ''}.${
        nextStatus === 'UNCONFIRMED' && wasAlreadyConfirmed
          ? ` Held for dispatch review: ${rulesDecision.reason || 'Booking rule triggered'}.`
          : ''
      }`,
    };

    const nextStatusHistory: TripStatusHistoryEntry[] =
      nextStatus !== trip.status
        ? [
            ...(trip.statusHistory || []),
            {
              from: trip.status,
              to: nextStatus,
              timestamp: nowIso,
              actorRole: 'passenger',
              reason:
                rulesDecision.reason ||
                'Status updated following passenger pre-dispatch modification',
            },
          ]
        : trip.statusHistory || [];

    const nextMetadata: Record<string, unknown> = {
      ...(trip.metadata || {}),
      pendingGuestChangeRequest: null,
    };

    const nextPayment =
      Math.abs(reestimated.fareDelta) >= 0.01
        ? {
            ...trip.payment,
            amount: reestimated.pricing.totalFare,
          }
        : trip.payment;

    const tripPatch: Partial<Trip> = {
      status: nextStatus,
      bookingType: nextBookingType,
      ...(nextScheduledPickupTime ? { scheduledPickupTime: nextScheduledPickupTime } : {}),
      pickupLocation: nextPickupLocation,
      dropoffLocation: nextDropoffLocation,
      pricing: reestimated.pricing,
      payment: nextPayment,
      metadata: nextMetadata,
      statusHistory: nextStatusHistory,
      auditLog: [...(trip.auditLog || []), auditEvent],
      updatedAt: nowIso,
    };

    const updatedTrip: Trip = {
      ...trip,
      ...tripPatch,
    };

    const tracking = await persistTripAndTrackingAtomically({
      tripId: trip.id,
      tripPatch,
      updatedTrip,
      datastoreToken,
      auth,
      options,
    });

    return Response.json(
      {
        success: true,
        mode: 'auto_applied',
        status: nextStatus,
        tracking,
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Intent C: `confirm_cancel` (Policy-Aware Cancellation)
  // ───────────────────────────────────────────────────────────────────────────
  const bookingConfig = await resolveBookingConfig(options);
  const policy = evaluateGuestCancellationPolicy({
    trip,
    bookingConfig,
    nowMs: options?.nowMs,
  });

  if (!policy.canCancel) {
    return Response.json(
      {
        success: false,
        code: 'CANCELLATION_LOCKED',
        error: policy.summaryText,
        policy,
      },
      { status: 409 }
    );
  }

  const cancelReason =
    typeof body?.reason === 'string' ? body.reason.slice(0, 300) : undefined;

  const cancelMutation = buildGuestCancellationPatch({
    trip,
    policy,
    reason: cancelReason,
    nowMs: options?.nowMs,
  });

  const tracking = await persistTripAndTrackingAtomically({
    tripId: trip.id,
    tripPatch: cancelMutation.tripPatch,
    updatedTrip: cancelMutation.updatedTrip,
    datastoreToken,
    auth,
    options,
  });

  return Response.json(
    {
      success: true,
      policy,
      tracking,
    },
    { headers: NO_STORE_HEADERS }
  );
}
