/**
 * Client-Side Firebase Auth Header Helper
 *
 * Attaches the current signed-in Firebase user's ID token as a Bearer token
 * on authenticated requests to internal serverless API routes
 * (`/api/send-email`, `/api/payments`, `/api/telephony`, etc.).
 */

import { getFirebaseAuth, isFirebaseConfigured } from '../firebase';

export async function getFirebaseAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined' || !isFirebaseConfigured()) {
    return {};
  }

  try {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return {};
    const idToken = await user.getIdToken();
    if (!idToken) return {};
    return {
      Authorization: `Bearer ${idToken}`,
    };
  } catch (err) {
    console.warn('[auth-headers] Could not retrieve Firebase ID token:', err);
    return {};
  }
}

/**
 * Drop-in wrapper around `fetch` that attaches the current Firebase Bearer token
 * alongside any caller-supplied headers.
 */
export async function authorizedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const authHeaders = await getFirebaseAuthHeaders();
  const mergedHeaders = new Headers(init.headers);
  for (const [key, value] of Object.entries(authHeaders)) {
    if (!mergedHeaders.has(key)) {
      mergedHeaders.set(key, value);
    }
  }
  return fetch(input, {
    ...init,
    headers: mergedHeaders,
  });
}
