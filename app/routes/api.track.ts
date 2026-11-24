/**
 * Serverless Resource Route: Secure Guest Trip Tracking & Self-Service Manage Ride (/api/track)
 *
 * Serves strictly zero-PII live tracking projections and verified self-service mutations for guests:
 * 1. Direct token resolution (`GET /api/track?token=trk_...` or `POST { trackingToken }`)
 *    reads `/tripTracking/{trackingToken}`.
 * 2. Manual reservation lookup (`POST { tripId, phoneLast4 }`) applies strict
 *    per-IP+trip rate limiting and resolves `/tripTrackingLookup/{tripId}_{hash}`
 *    before returning `{ trackingToken, tracking }`.
 * 3. Self-service guest manage-ride intents (`POST { intent, trackingToken, phoneLast4, ... }`)
 *    delegate to `handleGuestManageRidePost` in `guest-manage-ride.server.ts`.
 *
 * Raw `/trips/{tripId}` documents containing PII (email, phone, gate codes,
 * corporate PO numbers, billing records) are NEVER exposed to unauthenticated callers.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
} from '../core/services/auth/server-auth.server';
import {
  handleGuestManageRidePost,
  resolveGuestSelfServicePolicyServer,
  resolvePublicTrackingByTokenServer,
} from '../core/services/tracking/guest-manage-ride.server';
import {
  computeTripPhoneLookupKey,
  extractPhoneLast4,
  sanitizePublicTrackingProjection,
  type PublicTripTrackingProjection,
} from '../core/utils/tracking-token.util';

const TOKEN_PATTERN = /^trk_[a-zA-Z0-9_-]{16,80}$/;

function sanitizeOutProjection(doc: Record<string, any>): PublicTripTrackingProjection {
  return sanitizePublicTrackingProjection(doc);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').trim();
  if (!token || !TOKEN_PATTERN.test(token)) {
    return Response.json(
      { success: false, error: 'Valid tracking token is required.' },
      { status: 400 }
    );
  }

  const clientIp = getRequestClientIp(request);
  if (!checkRateLimit(`track_get:${clientIp}`, 60, 60_000)) {
    return Response.json(
      { success: false, error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429 }
    );
  }

  const doc = await resolvePublicTrackingByTokenServer(token);
  if (!doc) {
    return Response.json(
      { success: false, error: 'Tracking session not found or expired.' },
      { status: 404 }
    );
  }

  return Response.json(
    {
      success: true,
      tracking: sanitizeOutProjection(doc),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  const clientIp = getRequestClientIp(request);

  try {
    const body = (await request.json()) as {
      intent?: string;
      trackingToken?: string;
      tripId?: string;
      phoneLast4?: string;
      [key: string]: unknown;
    };

    // Mode 0 (Phase 56): Self-service Manage Ride intent (`preview_cancel`, `update_notes_flight`, `modify_time_route`, `confirm_cancel`)
    if (typeof body?.intent === 'string' && body.intent.trim()) {
      return handleGuestManageRidePost(request, { parsedBody: body });
    }

    // Mode 1: Direct high-entropy tracking token lookup
    if (body?.trackingToken) {
      const token = body.trackingToken.trim();
      if (!TOKEN_PATTERN.test(token)) {
        return Response.json(
          { success: false, error: 'Invalid tracking link.' },
          { status: 400 }
        );
      }

      if (!checkRateLimit(`track_token:${clientIp}`, 60, 60_000)) {
        return Response.json(
          { success: false, error: 'Too many requests. Please try again shortly.' },
          { status: 429 }
        );
      }

      const doc = await resolvePublicTrackingByTokenServer(token);
      if (!doc) {
        return Response.json(
          { success: false, error: 'Live tracking link was not found.' },
          { status: 404 }
        );
      }

      return Response.json(
        {
          success: true,
          trackingToken: token,
          tracking: sanitizeOutProjection(doc),
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Mode 2: Manual Trip ID + Last-4 Phone Number verification (rate-limited)
    const rawTripId = (body?.tripId || '').trim().replace(/^#/, '').toUpperCase();
    const last4 = extractPhoneLast4(body?.phoneLast4 || '');

    if (!rawTripId || rawTripId.length < 4 || rawTripId.length > 40) {
      return Response.json(
        { success: false, error: 'Please enter a valid Trip ID (e.g., CT-1234-5678).' },
        { status: 400 }
      );
    }

    if (last4.length !== 4) {
      return Response.json(
        {
          success: false,
          code: 'PHONE_VERIFICATION_REQUIRED',
          error: 'Please enter the last 4 digits of the passenger phone number.',
        },
        { status: 400 }
      );
    }

    // Strict brute-force protection: configurable lookup attempts per 5 minutes per IP + Trip ID
    const guestPolicy = await resolveGuestSelfServicePolicyServer();
    if (
      !checkRateLimit(
        `track_verify:${clientIp}:${rawTripId}`,
        guestPolicy.maxLookupAttemptsPer5Min,
        5 * 60_000
      )
    ) {
      return Response.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many verification attempts. Please wait 5 minutes or contact dispatch.',
        },
        { status: 429 }
      );
    }

    const lookupKey = await computeTripPhoneLookupKey(rawTripId, last4);
    if (!lookupKey) {
      return Response.json(
        { success: false, error: 'Unable to verify reservation details.' },
        { status: 400 }
      );
    }

    const lookupDoc = await fetchFirestoreDocumentRest('tripTrackingLookup', lookupKey);
    const resolvedToken =
      typeof lookupDoc?.trackingToken === 'string' ? lookupDoc.trackingToken : '';

    if (!resolvedToken || !TOKEN_PATTERN.test(resolvedToken)) {
      return Response.json(
        {
          success: false,
          code: 'VERIFICATION_FAILED',
          error: 'Reservation not found or the last 4 phone digits did not match.',
        },
        { status: 404 }
      );
    }

    const trackingDoc = await resolvePublicTrackingByTokenServer(resolvedToken);
    if (!trackingDoc) {
      return Response.json(
        { success: false, error: 'Tracking data is not yet available for this reservation.' },
        { status: 404 }
      );
    }

    return Response.json(
      {
        success: true,
        trackingToken: resolvedToken,
        tracking: sanitizeOutProjection(trackingDoc),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/track] Error:', message);
    return Response.json(
      { success: false, error: 'Unable to resolve trip tracking right now.' },
      { status: 500 }
    );
  }
}
