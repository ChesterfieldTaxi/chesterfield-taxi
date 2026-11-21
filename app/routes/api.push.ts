/**
 * Serverless / SSR Resource Route: Web Push & FCM Token Registry (`/api/push`)
 *
 * Security & Capabilities:
 * - Authenticates requests via `verifyServerRequestAuth` (Firebase ID token or `x-admin-secret`).
 * - `GET /api/push`: Returns push infrastructure diagnostics (VAPID, Firebase, FCM HTTP v1 vs local SW stub).
 * - `POST /api/push`:
 *   1. `status`: Authenticated diagnostics + caller's registered `fcmTokens` count.
 *   2. `register_token`: Deduplicates and stores an FCM device token on `/users/{uid}` (`fcmTokens` array).
 *   3. `remove_token`: Removes an FCM device token from `/users/{uid}` (`fcmTokens` array).
 *   4. `send_push`: (Dispatcher/Admin only) Dispatches Web Push via FCM HTTP v1 when server credentials
 *      (`FCM_SERVER_ACCESS_TOKEN` or `FIREBASE_SERVICE_ACCOUNT_JSON`) are configured, or returns
 *      deterministic stub diagnostics when operating in local Service Worker mode.
 */

import crypto from 'node:crypto';
import type { ActionFunctionArgs } from 'react-router';
import { getResolvedFirebaseConfig, isFirebaseConfigured } from '../core/services/firebase';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
  verifyServerRequestAuth,
} from '../core/services/auth/server-auth.server';

export interface PushApiRequest {
  action: 'status' | 'register_token' | 'remove_token' | 'send_push';
  token?: string;
  uid?: string;
  targetUid?: string;
  tokens?: string[];
  notification?: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    requireInteraction?: boolean;
  };
}

const MAX_TOKENS_PER_USER = 10;
const localDevTokenRegistry = new Map<string, Set<string>>();

interface ServiceAccountShape {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

let cachedGoogleAccessToken: { token: string; expiresAt: number } | null = null;

function isFcmServerConfigured(): boolean {
  if (process.env.FCM_SERVER_ACCESS_TOKEN?.trim()) return true;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccountShape;
      return Boolean(parsed.client_email && parsed.private_key);
    } catch {
      return false;
    }
  }
  return false;
}

async function getFcmHttpV1AccessToken(): Promise<string | null> {
  const staticToken = process.env.FCM_SERVER_ACCESS_TOKEN?.trim();
  if (staticToken) return staticToken;

  if (cachedGoogleAccessToken && Date.now() < cachedGoogleAccessToken.expiresAt - 60_000) {
    return cachedGoogleAccessToken.token;
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawServiceAccount) return null;

  try {
    const sa = JSON.parse(rawServiceAccount) as ServiceAccountShape;
    if (!sa.client_email || !sa.private_key) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
      'base64url'
    );
    const claimB64 = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      })
    ).toString('base64url');

    const unsignedJwt = `${headerB64}.${claimB64}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    const signatureB64 = signer.sign(sa.private_key, 'base64url');
    const assertion = `${unsignedJwt}.${signatureB64}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    if (!resp.ok) return null;
    const json = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedGoogleAccessToken = {
      token: json.access_token,
      expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
    };
    return json.access_token;
  } catch {
    return null;
  }
}

async function patchUserFcmTokensRest(
  uid: string,
  tokens: string[],
  bearerToken: string
): Promise<boolean> {
  const { projectId } = getResolvedFirebaseConfig();
  if (!projectId || !uid || !bearerToken) return false;

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}` +
    `?updateMask.fieldPaths=fcmTokens&updateMask.fieldPaths=fcmUpdatedAt`;

  const body = {
    fields: {
      fcmTokens: {
        arrayValue: {
          values: tokens.map((t) => ({ stringValue: t })),
        },
      },
      fcmUpdatedAt: {
        stringValue: new Date().toISOString(),
      },
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function loader() {
  const firebaseConfigured = isFirebaseConfigured();
  const vapidConfigured = Boolean(
    process.env.VITE_FIREBASE_VAPID_KEY?.trim() || process.env.FIREBASE_VAPID_KEY?.trim()
  );
  const fcmServerConfigured = isFcmServerConfigured();
  const { projectId } = getResolvedFirebaseConfig();

  return Response.json({
    success: true,
    firebaseConfigured,
    vapidConfigured,
    fcmServerConfigured,
    projectId: projectId || 'chesterfield-taxi',
    mode: fcmServerConfigured ? 'fcm_http_v1' : 'service_worker_local_stub',
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  const clientIp = getRequestClientIp(request);
  if (!checkRateLimit(`api_push:${clientIp}`, 60, 60_000)) {
    return Response.json(
      { success: false, error: 'Rate limit exceeded for push endpoint.' },
      { status: 429 }
    );
  }

  try {
    const data = (await request.json()) as PushApiRequest;
    if (!data || !data.action) {
      return Response.json(
        { success: false, error: 'Malformed request: "action" is required.' },
        { status: 400 }
      );
    }

    const auth = await verifyServerRequestAuth(request);
    const enforceAuth = process.env.NODE_ENV === 'production' || isFirebaseConfigured();

    if (enforceAuth && !auth.authenticated) {
      return Response.json(
        { success: false, error: 'Unauthorized: Valid session authentication required.' },
        { status: 401 }
      );
    }

    const resolvedUid =
      (auth.isDispatcher || auth.isAdmin ? data.uid?.trim() : undefined) ||
      auth.uid ||
      'local-dev-user';

    // ─── 1. Push Diagnostics Status ───
    if (data.action === 'status') {
      let registeredTokens: string[] = [];
      if (auth.uid && auth.rawToken && isFirebaseConfigured()) {
        const userDoc = await fetchFirestoreDocumentRest('users', auth.uid, auth.rawToken);
        if (Array.isArray(userDoc?.fcmTokens)) {
          registeredTokens = userDoc.fcmTokens.filter((t: unknown) => typeof t === 'string');
        }
      } else {
        registeredTokens = Array.from(localDevTokenRegistry.get(resolvedUid) || []);
      }

      const fcmServerConfigured = isFcmServerConfigured();
      return Response.json({
        success: true,
        uid: resolvedUid,
        tokenCount: registeredTokens.length,
        vapidConfigured: Boolean(
          process.env.VITE_FIREBASE_VAPID_KEY?.trim() || process.env.FIREBASE_VAPID_KEY?.trim()
        ),
        fcmServerConfigured,
        mode: fcmServerConfigured ? 'fcm_http_v1' : 'service_worker_local_stub',
      });
    }

    // ─── 2. Register FCM Device Token ───
    if (data.action === 'register_token') {
      const token = String(data.token || '').trim();
      if (!token || token.length < 16 || token.length > 4096) {
        return Response.json(
          { success: false, error: 'Valid push registration token is required.' },
          { status: 400 }
        );
      }

      if (auth.uid && auth.rawToken && isFirebaseConfigured()) {
        const existingDoc = await fetchFirestoreDocumentRest('users', resolvedUid, auth.rawToken);
        const existingTokens = Array.isArray(existingDoc?.fcmTokens)
          ? existingDoc.fcmTokens.filter((t: unknown): t is string => typeof t === 'string')
          : [];
        const deduped = Array.from(new Set([...existingTokens, token])).slice(-MAX_TOKENS_PER_USER);
        const persisted = await patchUserFcmTokensRest(resolvedUid, deduped, auth.rawToken);

        return Response.json({
          success: true,
          registered: true,
          persistedToFirestore: persisted,
          tokenCount: deduped.length,
          mode: isFcmServerConfigured() ? 'fcm_http_v1' : 'service_worker_local_stub',
        });
      }

      const bucket = localDevTokenRegistry.get(resolvedUid) || new Set<string>();
      bucket.add(token);
      localDevTokenRegistry.set(resolvedUid, bucket);

      return Response.json({
        success: true,
        registered: true,
        persistedToFirestore: false,
        tokenCount: bucket.size,
        mode: 'service_worker_local_stub',
      });
    }

    // ─── 3. Remove FCM Device Token ───
    if (data.action === 'remove_token') {
      const token = String(data.token || '').trim();
      if (!token) {
        return Response.json(
          { success: false, error: 'Token is required for removal.' },
          { status: 400 }
        );
      }

      if (auth.uid && auth.rawToken && isFirebaseConfigured()) {
        const existingDoc = await fetchFirestoreDocumentRest('users', resolvedUid, auth.rawToken);
        const existingTokens = Array.isArray(existingDoc?.fcmTokens)
          ? existingDoc.fcmTokens.filter((t: unknown): t is string => typeof t === 'string')
          : [];
        const filtered = existingTokens.filter((t) => t !== token);
        const persisted = await patchUserFcmTokensRest(resolvedUid, filtered, auth.rawToken);

        return Response.json({
          success: true,
          removed: true,
          persistedToFirestore: persisted,
          tokenCount: filtered.length,
        });
      }

      const bucket = localDevTokenRegistry.get(resolvedUid);
      if (bucket) bucket.delete(token);

      return Response.json({
        success: true,
        removed: true,
        persistedToFirestore: false,
        tokenCount: bucket ? bucket.size : 0,
      });
    }

    // ─── 4. Server-Dispatched Push Notification (Staff Only) ───
    if (data.action === 'send_push') {
      if (enforceAuth && !auth.isDispatcher && !auth.isAdmin) {
        return Response.json(
          {
            success: false,
            error: 'Forbidden: Dispatcher or Administrator privileges required to dispatch push notifications.',
          },
          { status: 403 }
        );
      }

      const notif = data.notification;
      if (!notif || !notif.title || !notif.body) {
        return Response.json(
          { success: false, error: 'Notification "title" and "body" are required.' },
          { status: 400 }
        );
      }

      let targetTokens: string[] = Array.isArray(data.tokens)
        ? data.tokens.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];

      if (targetTokens.length === 0 && data.targetUid) {
        if (auth.rawToken && isFirebaseConfigured()) {
          const targetUserDoc = await fetchFirestoreDocumentRest(
            'users',
            data.targetUid,
            auth.rawToken
          );
          if (Array.isArray(targetUserDoc?.fcmTokens)) {
            targetTokens = targetUserDoc.fcmTokens.filter(
              (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0
            );
          }
        } else {
          targetTokens = Array.from(localDevTokenRegistry.get(data.targetUid) || []);
        }
      }

      const accessToken = await getFcmHttpV1AccessToken();
      const { projectId } = getResolvedFirebaseConfig();

      if (!accessToken || !projectId) {
        return Response.json({
          success: true,
          simulated: true,
          mode: 'service_worker_local_stub',
          targetTokenCount: targetTokens.length,
          deliveredCount: 0,
          message:
            'FCM HTTP v1 server credentials not configured; active PWA clients receive background notifications via Firestore real-time listeners + Service Worker.',
        });
      }

      if (targetTokens.length === 0) {
        return Response.json({
          success: true,
          simulated: false,
          mode: 'fcm_http_v1',
          targetTokenCount: 0,
          deliveredCount: 0,
          message: 'No registered FCM tokens found for target recipient.',
        });
      }

      const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/messages:send`;
      const rawUrl = String(notif.url || '').trim();
      const targetUrl =
        rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/app/driver';
      let deliveredCount = 0;

      await Promise.all(
        targetTokens.map(async (deviceToken) => {
          try {
            const resp = await fetch(fcmEndpoint, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: deviceToken,
                  notification: {
                    title: String(notif.title).slice(0, 120),
                    body: String(notif.body).slice(0, 300),
                  },
                  data: {
                    url: targetUrl,
                    tag: notif.tag || 'ct-server-push',
                  },
                  webpush: {
                    notification: {
                      title: String(notif.title).slice(0, 120),
                      body: String(notif.body).slice(0, 300),
                      tag: notif.tag || 'ct-server-push',
                      requireInteraction: Boolean(notif.requireInteraction),
                      icon: targetUrl.startsWith('/app/driver')
                        ? '/icon-driver-192.svg'
                        : '/icon-192.svg',
                    },
                    fcm_options: {
                      link: targetUrl,
                    },
                  },
                },
              }),
            });
            if (resp.ok) {
              deliveredCount++;
            }
          } catch {}
        })
      );

      return Response.json({
        success: true,
        simulated: false,
        mode: 'fcm_http_v1',
        targetTokenCount: targetTokens.length,
        deliveredCount,
      });
    }

    return Response.json(
      { success: false, error: `Unsupported push action: ${String(data.action)}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.push] Server error:', errorMessage);
    return Response.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
