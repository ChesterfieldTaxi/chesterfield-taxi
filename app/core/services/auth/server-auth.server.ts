/**
 * Server-Side Firebase Auth & Role Verification Helper
 *
 * Verifies Firebase ID tokens and resolves authoritative Firestore user roles
 * without requiring a Firebase Admin service-account private key:
 * 1. Validates token signature, expiration, and account status via Firebase
 *    Identity Toolkit `accounts:lookup`.
 * 2. Reads `/users/{uid}` via Firestore REST using the verified user's own
 *    Bearer token (permitted by `allow read: if isOwner(userId)`).
 * 3. Supports `ADMIN_API_SECRET` header fallback for server-to-server calls.
 * 4. Includes a lightweight sliding-window rate limiter for public endpoints.
 */

import crypto from 'node:crypto';
import { getResolvedFirebaseConfig } from '../firebase';
import type { UserRole } from './admin-auth.service';

export interface VerifiedServerAuth {
  authenticated: boolean;
  isAdminSecret: boolean;
  uid?: string;
  email?: string;
  roles: UserRole[];
  isAdmin: boolean;
  isDispatcher: boolean;
  isDriver: boolean;
  isCorporateManager: boolean;
  corporateAccountId?: string;
  corporateAccountNumber?: string;
  rawToken?: string;
}

const UNAUTHENTICATED: VerifiedServerAuth = {
  authenticated: false,
  isAdminSecret: false,
  roles: [],
  isAdmin: false,
  isDispatcher: false,
  isDriver: false,
  isCorporateManager: false,
};

interface CachedAuthEntry {
  auth: VerifiedServerAuth;
  expiresAt: number;
}

const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX_SIZE = 200;
const authCache = new Map<string, CachedAuthEntry>();

function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getCachedAuth(tokenHash: string): VerifiedServerAuth | null {
  const hit = authCache.get(tokenHash);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    authCache.delete(tokenHash);
    return null;
  }
  return hit.auth;
}

function setCachedAuth(tokenHash: string, auth: VerifiedServerAuth): void {
  if (authCache.size >= AUTH_CACHE_MAX_SIZE) {
    const oldestKey = authCache.keys().next().value;
    if (oldestKey) authCache.delete(oldestKey);
  }
  authCache.set(tokenHash, {
    auth,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
}

/**
 * Decodes a Firestore REST document's typed `fields` map into a plain JS object.
 */
export function parseFirestoreRestValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values;
    return Array.isArray(values) ? values.map(parseFirestoreRestValue) : [];
  }
  if ('mapValue' in val) {
    return parseFirestoreRestFields(val.mapValue?.fields);
  }
  return undefined;
}

export function parseFirestoreRestFields(fields: Record<string, any> | undefined): Record<string, any> {
  if (!fields || typeof fields !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = parseFirestoreRestValue(value);
  }
  return out;
}

/**
 * Fetches a single Firestore document via REST API (optionally authenticated with a Firebase ID token).
 */
export async function fetchFirestoreDocumentRest(
  collectionPath: string,
  docId: string,
  bearerToken?: string
): Promise<Record<string, any> | null> {
  const { projectId } = getResolvedFirebaseConfig();
  if (!projectId || !docId) return null;

  const encodedDoc = docId.split('/').map(encodeURIComponent).join('/');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collectionPath}/${encodedDoc}`;

  const headers: Record<string, string> = {};
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { fields?: Record<string, any> };
    if (!json || !json.fields) return null;
    return parseFirestoreRestFields(json.fields);
  } catch {
    return null;
  }
}

/**
 * Verifies the incoming request's Authorization / x-admin-secret header.
 */
export async function verifyServerRequestAuth(request: Request): Promise<VerifiedServerAuth> {
  const adminSecret = process.env.ADMIN_API_SECRET?.trim();
  const xAdminHeader = request.headers.get('x-admin-secret')?.trim();
  const authHeader = request.headers.get('authorization')?.trim();

  // 1. Check explicit ADMIN_API_SECRET (constant-time)
  if (adminSecret) {
    if (xAdminHeader && safeSecretEqual(xAdminHeader, adminSecret)) {
      return {
        authenticated: true,
        isAdminSecret: true,
        roles: ['admin', 'dispatcher', 'driver'],
        isAdmin: true,
        isDispatcher: true,
        isDriver: true,
        isCorporateManager: false,
      };
    }
    if (authHeader) {
      const stripped = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader;
      if (stripped && safeSecretEqual(stripped, adminSecret)) {
        return {
          authenticated: true,
          isAdminSecret: true,
          roles: ['admin', 'dispatcher', 'driver'],
          isAdmin: true,
          isDispatcher: true,
          isDriver: true,
          isCorporateManager: false,
        };
      }
    }
  }

  // 2. Check Firebase Bearer ID Token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return UNAUTHENTICATED;
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken || idToken.length < 20) {
    return UNAUTHENTICATED;
  }

  const tokenHash = hashToken(idToken);
  const cached = getCachedAuth(tokenHash);
  if (cached) return cached;

  const { apiKey } = getResolvedFirebaseConfig();
  if (!apiKey || apiKey.includes('DemoPlaceholder')) {
    return UNAUTHENTICATED;
  }

  try {
    const lookupResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupResp.ok) {
      return UNAUTHENTICATED;
    }

    const lookupData = (await lookupResp.json()) as {
      users?: Array<{ localId?: string; email?: string; disabled?: boolean }>;
    };
    const fbUser = lookupData?.users?.[0];
    if (!fbUser?.localId || fbUser.disabled) {
      return UNAUTHENTICATED;
    }

    const uid = fbUser.localId;
    const email = (fbUser.email || '').toLowerCase();

    // Fetch authoritative user role document from Firestore using caller's verified ID token
    const userDoc = await fetchFirestoreDocumentRest('users', uid, idToken);
    if (userDoc?.isBlacklisted === true || userDoc?.status === 'suspended') {
      return UNAUTHENTICATED;
    }

    const roleSet = new Set<UserRole>();
    if (Array.isArray(userDoc?.roles)) {
      for (const r of userDoc.roles) {
        if (
          r === 'admin' ||
          r === 'dispatcher' ||
          r === 'driver' ||
          r === 'corporate_manager' ||
          r === 'customer'
        ) {
          roleSet.add(r);
        }
      }
    }
    if (
      userDoc?.role === 'admin' ||
      userDoc?.role === 'dispatcher' ||
      userDoc?.role === 'driver' ||
      userDoc?.role === 'corporate_manager' ||
      userDoc?.role === 'customer'
    ) {
      roleSet.add(userDoc.role);
    }
    if (email === 'admin@chesterfieldtaxi.com') {
      roleSet.add('admin');
    }
    if (roleSet.size === 0) {
      roleSet.add('customer');
    }

    const roles = Array.from(roleSet);
    const isAdmin = roles.includes('admin');
    const isDispatcher = isAdmin || roles.includes('dispatcher');
    const isDriver = roles.includes('driver');
    const isCorporateManager = roles.includes('corporate_manager');
    const corporateAccountId =
      typeof userDoc?.corporateAccountId === 'string' && userDoc.corporateAccountId.trim()
        ? userDoc.corporateAccountId.trim()
        : undefined;
    const corporateAccountNumber =
      typeof userDoc?.corporateAccountNumber === 'string' && userDoc.corporateAccountNumber.trim()
        ? userDoc.corporateAccountNumber.trim()
        : undefined;

    const verified: VerifiedServerAuth = {
      authenticated: true,
      isAdminSecret: false,
      uid,
      email,
      roles,
      isAdmin,
      isDispatcher,
      isDriver,
      isCorporateManager,
      corporateAccountId,
      corporateAccountNumber,
      rawToken: idToken,
    };

    setCachedAuth(tokenHash, verified);
    return verified;
  } catch (err) {
    console.warn('[server-auth] Token verification error:', err);
    return UNAUTHENTICATED;
  }
}

/**
 * Extracts a normalized client identifier (IP address) for rate limiting.
 */
export function getRequestClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown-ip';
}

interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Simple in-memory sliding-window rate limiter.
 * Returns `true` if allowed, `false` if rate limit exceeded.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Periodic cleanup if store grows large
  if (rateLimitStore.size > 2000) {
    for (const [k, bucket] of rateLimitStore.entries()) {
      const fresh = bucket.timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        rateLimitStore.delete(k);
      } else {
        bucket.timestamps = fresh;
      }
    }
  }

  const bucket = rateLimitStore.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    rateLimitStore.set(key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(key, bucket);
  return true;
}
