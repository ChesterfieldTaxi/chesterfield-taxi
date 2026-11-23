/**
 * Server-Only Scheduled SLA Monitor & Offer Cascade Cron Engine (`sla-cron.server.ts`)
 *
 * Consumed exclusively by `app/routes/api.cron.sla-dispatch.ts` (`GET`/`POST`) and
 * server-side verification suites (`scripts/test-auto-dispatch-sla.ts`).
 *
 * Security:
 * - `Authorization: Bearer ${process.env.CRON_SECRET}` (constant-time verified)
 * - `x-admin-secret: ${process.env.ADMIN_API_SECRET}`
 * - Verified Firebase ID token belonging to an `admin` or `dispatcher` (`verifyServerRequestAuth`)
 *
 * Behavior:
 * 1. Scans upcoming unassigned scheduled trips via `scanUpcomingUnassignedSlaTrips`.
 * 2. Idempotently stamps `slaStatus.criticalNotifiedAt` on unattended `critical` / `overdue` trips
 *    (never double-sending for the same trip) and dispatches alert email + SMS to Dispatch Operations.
 * 3. Optionally initiates `startOfferCascade` on `CONFIRMED` / `pending` critical rides when
 *    `dispatchAutomation.autoOfferOnConfirm` is enabled, and advances any expired active cascades.
 */

import crypto from 'node:crypto';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import type { AppSettings, DispatchAutomationConfig } from '../../types/config';
import type { Trip } from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import { sanitizeToE164 } from '../../utils/phone';
import {
  fetchFirestoreDocumentRest,
  parseFirestoreRestFields,
  verifyServerRequestAuth,
} from '../auth/server-auth.server';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  getAdminConfigService,
  normalizeDispatchAutomationConfig,
} from '../config/admin-config.service';
import { ResendEmailService } from '../email/resend-email.service';
import { getResolvedFirebaseConfig, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { DEFAULT_ZONES } from '../zones/zone.service';
import {
  advanceOrExpireOfferCascade,
  executeAutoDispatch,
  isTripEligibleForAutoPilot,
  type AutoDispatchDriverInput,
} from './auto-dispatch.service';
import {
  buildTripSlaStatusPatch,
  scanUpcomingUnassignedSlaTrips,
} from './sla-monitor.service';

interface ServiceAccountShape {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

let cachedDatastoreToken: { token: string; expiresAt: number } | null = null;
const inMemoryCriticalNotifiedIds = new Set<string>();

function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function getServiceAccountDatastoreToken(): Promise<string | null> {
  if (cachedDatastoreToken && Date.now() < cachedDatastoreToken.expiresAt - 60_000) {
    return cachedDatastoreToken.token;
  }

  const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawSa) return null;

  try {
    const sa = JSON.parse(rawSa) as ServiceAccountShape;
    if (!sa.client_email || !sa.private_key) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
      'base64url'
    );
    const claimB64 = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      })
    ).toString('base64url');

    const unsigned = `${headerB64}.${claimB64}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const sig = signer.sign(sa.private_key, 'base64url');

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${sig}`,
      }).toString(),
    });

    if (!resp.ok) return null;
    const json = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedDatastoreToken = {
      token: json.access_token,
      expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
    };
    return json.access_token;
  } catch {
    return null;
  }
}

function encodeFirestoreRestValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => encodeFirestoreRestValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreRestValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export async function listCollectionFirestoreRest<T>(
  collectionName: string,
  bearerToken: string,
  pageSize: number = 250
): Promise<T[] | null> {
  const { projectId } = getResolvedFirebaseConfig();
  if (!projectId || !bearerToken) return null;

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${encodeURIComponent(collectionName)}?pageSize=${pageSize}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      documents?: Array<{ name?: string; fields?: Record<string, unknown> }>;
    };
    if (!Array.isArray(json.documents)) return [];
    return json.documents.map((docItem) => {
      const parsed = parseFirestoreRestFields(docItem.fields as Record<string, any>);
      const docId = docItem.name?.split('/').pop() || '';
      return {
        ...parsed,
        id: parsed.id || docId,
      } as T;
    });
  } catch {
    return null;
  }
}

export async function patchFirestoreTripRest(
  tripId: string,
  updates: Partial<Trip>,
  bearerToken: string
): Promise<boolean> {
  const { projectId } = getResolvedFirebaseConfig();
  if (!projectId || !tripId || !bearerToken) return false;

  const clean = sanitizePayload(updates) as Record<string, unknown>;
  const keys = Object.keys(clean).filter((k) => clean[k] !== undefined);
  if (keys.length === 0) return true;

  const maskParams = keys
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/trips/${encodeURIComponent(tripId)}?${maskParams}`;

  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    fields[key] = encodeFirestoreRestValue(clean[key]);
  }

  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function sendCriticalSlaSmsAlert(message: string): Promise<{
  sent: boolean;
  simulated: boolean;
  recipient: string;
}> {
  const rawTargetPhone =
    process.env.DISPATCH_ALERT_PHONE ||
    process.env.DISPATCH_FORWARDING_PHONE ||
    process.env.DISPATCH_PHONE_NUMBER ||
    COMPANY_CONFIG.phone.primaryRaw ||
    '+13147380100';
  const to = sanitizeToE164(rawTargetPhone);
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = sanitizeToE164(process.env.TWILIO_PHONE_NUMBER?.trim() || '+13142281454');

  if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
    console.info(`[api.cron.sla-dispatch] [SIMULATED SMS] To ${to}: ${message}`);
    return { sent: true, simulated: true, recipient: to };
  }

  try {
    const basicAuth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
      }
    );
    return { sent: resp.ok, simulated: false, recipient: to };
  } catch {
    return { sent: false, simulated: false, recipient: to };
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function verifyCronOrStaffAuth(request: Request): Promise<{
  allowed: boolean;
  status: number;
  error?: string;
  authorizedVia: 'cron_secret' | 'admin_secret' | 'staff_token' | 'local_dev';
  rawToken?: string;
}> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get('authorization')?.trim() || '';

  if (cronSecret && authHeader.startsWith('Bearer ')) {
    const supplied = authHeader.slice(7).trim();
    if (supplied && safeTimingEqual(supplied, cronSecret)) {
      return { allowed: true, status: 200, authorizedVia: 'cron_secret' };
    }
  }

  const serverAuth = await verifyServerRequestAuth(request);
  if (serverAuth.authenticated) {
    if (serverAuth.isAdminSecret) {
      return { allowed: true, status: 200, authorizedVia: 'admin_secret' };
    }
    if (serverAuth.isAdmin || serverAuth.isDispatcher) {
      return {
        allowed: true,
        status: 200,
        authorizedVia: 'staff_token',
        rawToken: serverAuth.rawToken,
      };
    }
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Dispatcher or Administrator privileges required.',
      authorizedVia: 'staff_token',
    };
  }

  const enforceStrictAuth =
    process.env.NODE_ENV === 'production' || Boolean(cronSecret) || isFirebaseConfigured();

  if (enforceStrictAuth) {
    return {
      allowed: false,
      status: 401,
      error: 'Unauthorized: Valid CRON_SECRET, x-admin-secret, or staff session required.',
      authorizedVia: 'local_dev',
    };
  }

  return { allowed: true, status: 200, authorizedVia: 'local_dev' };
}

export async function executeSlaDispatchCronCycle(options?: {
  bearerToken?: string;
  nowMs?: number;
  bookingServiceOverride?: IBookingService;
  settingsOverride?: Partial<AppSettings>;
  driversOverride?: AutoDispatchDriverInput[];
  zonesOverride?: ZoneGeofence[];
}) {
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const restToken = options?.bearerToken || (await getServiceAccountDatastoreToken()) || undefined;

  // 1. Load AppSettings & DispatchAutomationConfig
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

  // 2. Load Trips, Drivers & Zones
  const baseBookingService = options?.bookingServiceOverride || getBookingService();
  let trips: Trip[] | null = null;
  let drivers: AutoDispatchDriverInput[] = options?.driversOverride || [];
  let zones: ZoneGeofence[] = options?.zonesOverride || [...DEFAULT_ZONES];

  if (!options?.bookingServiceOverride && restToken && isFirebaseConfigured()) {
    trips = await listCollectionFirestoreRest<Trip>('trips', restToken, 300);
    if (drivers.length === 0) {
      const restDrivers = await listCollectionFirestoreRest<AutoDispatchDriverInput>(
        'drivers',
        restToken,
        150
      );
      if (restDrivers) drivers = restDrivers;
    }
    if (!options?.zonesOverride) {
      const restZones = await listCollectionFirestoreRest<ZoneGeofence>('zones', restToken, 100);
      if (restZones && restZones.length > 0) zones = restZones;
    }
  }

  if (!trips) {
    trips = baseBookingService.getAllTrips ? await baseBookingService.getAllTrips() : [];
  }

  const tripMap = new Map<string, Trip>(trips.map((t) => [t.id, t]));

  const persistenceAdapter: IBookingService = {
    ...baseBookingService,
    updateTrip: async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
      const current = tripMap.get(tripId) || ({ id: tripId } as Trip);
      const merged: Trip = {
        ...current,
        ...updates,
        updatedAt: updates.updatedAt || nowIso,
      };
      tripMap.set(tripId, merged);

      if (!options?.bookingServiceOverride && restToken && isFirebaseConfigured()) {
        const ok = await patchFirestoreTripRest(tripId, updates, restToken);
        if (ok) return merged;
      }

      if (baseBookingService.updateTrip) {
        return await baseBookingService.updateTrip(tripId, updates);
      }
      return merged;
    },
  };

  // 3. Scan Upcoming Unassigned Scheduled Rides
  const slaSummary = scanUpcomingUnassignedSlaTrips(trips, dispatchConfig, { nowMs });

  const emailRecipient =
    process.env.ADMIN_ALERT_EMAIL?.trim() ||
    process.env.DISPATCH_ALERT_EMAIL?.trim() ||
    settings?.company?.email?.trim() ||
    COMPANY_CONFIG.email.dispatch;
  const emailService = new ResendEmailService({ adminAlertRecipient: emailRecipient });

  const newlyAlertedTripIds: string[] = [];
  const autoOfferedTripIds: string[] = [];
  let skippedAlreadyNotifiedCount = 0;

  for (const { trip, sla } of slaSummary.criticalOrOverdueTrips) {
    const alreadyNotified = Boolean(
      trip.slaStatus?.criticalNotifiedAt || inMemoryCriticalNotifiedIds.has(trip.id)
    );

    if (alreadyNotified) {
      skippedAlreadyNotifiedCount++;
    } else {
      const nextSlaStatus = buildTripSlaStatusPatch(trip.slaStatus, sla, {
        warningNotifiedAt: trip.slaStatus?.warningNotifiedAt || nowIso,
        criticalNotifiedAt: nowIso,
      });

      const updated = await persistenceAdapter.updateTrip!(trip.id, {
        slaStatus: nextSlaStatus,
      });
      tripMap.set(trip.id, updated);
      inMemoryCriticalNotifiedIds.add(trip.id);
      newlyAlertedTripIds.push(trip.id);

      const paxName =
        [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ').trim() ||
        'Guest Passenger';
      const pickupAddr = trip.pickupLocation?.address || 'Pickup pending';
      const dropoffAddr = trip.dropoffLocation?.address || 'Destination pending';
      const pickupTimeFormatted = trip.scheduledPickupTime
        ? new Date(trip.scheduledPickupTime).toLocaleString()
        : 'Scheduled';
      const urgencyLabel =
        sla.level === 'overdue'
          ? `OVERDUE (${Math.abs(sla.minutesUntilPickup ?? 0)}m past pickup)`
          : `CRITICAL (${sla.minutesUntilPickup ?? 0}m until pickup)`;
      const airportNote = sla.isAirportTrip
        ? ` [${sla.airportCode || 'Airport'} +${sla.airportExtraLeadMinutes}m SLA buffer]`
        : '';

      const subject = `[SLA ${sla.level.toUpperCase()}] Unassigned Scheduled Ride #${trip.id} — ${urgencyLabel}`;
      const plainText =
        `CHESTERFIELD TAXI SLA ALERT\n` +
        `Trip #${trip.id} is UNASSIGNED and ${urgencyLabel}${airportNote}.\n` +
        `Passenger: ${paxName} (${trip.passenger?.phone || 'N/A'})\n` +
        `Scheduled Pickup: ${pickupTimeFormatted}\n` +
        `Pickup: ${pickupAddr}\n` +
        `Dropoff: ${dropoffAddr}\n` +
        `Fare: $${(trip.pricing?.totalFare || 0).toFixed(2)}\n` +
        `Action Required: Assign a driver immediately in Dispatch Console (/app/dispatch?tripId=${encodeURIComponent(trip.id)}).`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #dc2626; border-radius: 14px; overflow: hidden;">
          <div style="background: #991b1b; color: #ffffff; padding: 16px 20px;">
            <strong style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em;">Scheduled-Ride SLA Alert — ${escapeHtml(urgencyLabel)}</strong>
          </div>
          <div style="padding: 20px; background: #ffffff; color: #0f172a; font-size: 14px; line-height: 1.55;">
            <p style="margin: 0 0 12px;"><strong>Trip #${escapeHtml(trip.id)}</strong> remains unassigned inside the critical SLA dispatch window${escapeHtml(airportNote)}.</p>
            <ul style="margin: 0 0 16px; padding-left: 18px;">
              <li><strong>Passenger:</strong> ${escapeHtml(paxName)} (${escapeHtml(trip.passenger?.phone || 'No phone')})</li>
              <li><strong>Scheduled Pickup:</strong> ${escapeHtml(pickupTimeFormatted)}</li>
              <li><strong>Pickup:</strong> ${escapeHtml(pickupAddr)}</li>
              <li><strong>Dropoff:</strong> ${escapeHtml(dropoffAddr)}</li>
              <li><strong>Quoted Fare:</strong> $${(trip.pricing?.totalFare || 0).toFixed(2)}</li>
            </ul>
            <p style="margin: 0; font-weight: 700; color: #b91c1c;">Open the Dispatch Console (/app/dispatch) immediately to assign or cascade-offer a driver.</p>
          </div>
        </div>
      `;

      await Promise.all([
        emailService
          .sendDirect({
            recipient: emailRecipient,
            subject,
            html,
            text: plainText,
          })
          .catch(() => null),
        sendCriticalSlaSmsAlert(
          `Chesterfield SLA ${sla.level.toUpperCase()}: Unassigned Trip #${trip.id.slice(-6)} (${paxName}) ${urgencyLabel}. Pickup: ${pickupAddr}.`
        ).catch(() => null),
      ]);
    }
  }

  // 4. Advance or Expire Active Offer Cascades while unattended
  let cascadeAdvancedCount = 0;
  let cascadeExhaustedCount = 0;

  for (const trip of Array.from(tripMap.values())) {
    if (trip.offerCascade?.state === 'active') {
      const stepRes = await advanceOrExpireOfferCascade({
        trip,
        drivers,
        zones,
        config: dispatchConfig,
        fleetVehicles: settings?.fleet,
        activeTrips: Array.from(tripMap.values()),
        vehicleTiers: settings?.vehicles,
        bookingService: persistenceAdapter,
        sendPush: false,
        nowMs,
      });
      if (stepRes.outcome === 'advanced') cascadeAdvancedCount++;
      if (stepRes.outcome === 'exhausted') cascadeExhaustedCount++;
    }
  }

  // 5. Server Auto-Dispatch Pass across all trips eligible for Auto-Pilot (inside Pre-Pickup Lead Window)
  if (drivers.length > 0 && dispatchConfig.dispatchMode !== 'manual_1tap' && !dispatchConfig.isPaused) {
    for (const candidateTrip of Array.from(tripMap.values())) {
      const latestTrip = tripMap.get(candidateTrip.id) || candidateTrip;
      if (isTripEligibleForAutoPilot(latestTrip, dispatchConfig, nowMs)) {
        const autoRes = await executeAutoDispatch({
          trip: latestTrip,
          drivers,
          zones,
          config: dispatchConfig,
          fleetVehicles: settings?.fleet,
          activeTrips: Array.from(tripMap.values()),
          vehicleTiers: settings?.vehicles,
          actorRole: 'system',
          bookingService: persistenceAdapter,
          sendPush: false,
          nowMs,
        });
        if (autoRes.outcome === 'offered' || autoRes.outcome === 'assigned') {
          autoOfferedTripIds.push(latestTrip.id);
        }
      }
    }
  }

  return {
    success: true,
    evaluatedAt: nowIso,
    scannedTripsCount: trips.length,
    eligibleScheduledCount: slaSummary.allEligible.length,
    atRiskCount: slaSummary.atRiskCount,
    warningCount: slaSummary.warningCount,
    criticalCount: slaSummary.criticalCount,
    overdueCount: slaSummary.overdueCount,
    criticalOrOverdueCount: slaSummary.criticalOrOverdueTrips.length,
    newlyAlertedTripIds,
    skippedAlreadyNotifiedCount,
    autoOfferedTripIds,
    cascadeAdvancedCount,
    cascadeExhaustedCount,
    config: dispatchConfig,
  };
}

export async function handleCronHttpRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use GET or POST.' },
      { status: 405 }
    );
  }

  const authCheck = await verifyCronOrStaffAuth(request);
  if (!authCheck.allowed) {
    return Response.json(
      { success: false, error: authCheck.error || 'Unauthorized' },
      { status: authCheck.status }
    );
  }

  try {
    const result = await executeSlaDispatchCronCycle({
      bearerToken: authCheck.rawToken,
    });
    return Response.json({
      ...result,
      authorizedVia: authCheck.authorizedVia,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.cron.sla-dispatch] Execution error:', errorMessage);
    return Response.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
