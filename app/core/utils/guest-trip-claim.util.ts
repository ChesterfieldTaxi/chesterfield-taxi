import { getBookingService } from '../services/booking';

export interface GuestAccountSignupHrefParams {
  baseUrl?: string;
  tripIds?: string | ReadonlyArray<string | null | undefined> | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  redirect?: string | null;
}

/**
 * Parses one or more trip IDs from a query param string (`"id1,id2"`) or array while strictly
 * preserving exact Firestore document ID casing (NEVER `.toUpperCase()` / `.toLowerCase()`).
 */
export function parseClaimTripIds(
  rawOrIds?: string | ReadonlyArray<string | null | undefined> | null
): string[] {
  if (!rawOrIds) return [];
  const rawList = typeof rawOrIds === 'string' ? rawOrIds.split(',') : rawOrIds;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of rawList) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim().replace(/^#+/, '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

/**
 * Builds the canonical `/app/register` URL pre-populated with exact-case `claimTrip` IDs
 * and guest passenger contact details.
 */
export function buildGuestAccountSignupHref(params: GuestAccountSignupHrefParams): string {
  const ids = parseClaimTripIds(params.tripIds);
  const qs = new URLSearchParams();

  if (ids.length > 0) {
    qs.set('claimTrip', ids.join(','));
  }
  if (params.email && params.email.trim()) {
    qs.set('email', params.email.trim());
  }
  if (params.name && params.name.trim()) {
    qs.set('name', params.name.trim());
  }
  if (params.phone && params.phone.trim()) {
    qs.set('phone', params.phone.trim());
  }
  if (params.redirect && params.redirect.trim()) {
    qs.set('redirect', params.redirect.trim());
  }

  const prefix = params.baseUrl ? params.baseUrl.trim().replace(/\/+$/, '') : '';
  const query = qs.toString();
  return `${prefix}/app/register${query ? `?${query}` : ''}`;
}

/**
 * Claims one or more guest trips (e.g. outbound + linked return leg) for an authenticated user
 * by updating `{ customerId: uid, userId: uid }` using exact-case `tripId`s in compliance with
 * `firestore.rules` lines 245–257.
 */
export async function claimGuestTripsForUser(
  uid: string,
  rawOrIds?: string | ReadonlyArray<string | null | undefined> | null,
  bookingServiceOverride?: { updateTrip?: (tripId: string, updates: Record<string, unknown>) => Promise<unknown> }
): Promise<{ claimedIds: string[]; failedIds: string[] }> {
  const cleanUid = String(uid || '').trim();
  const tripIds = parseClaimTripIds(rawOrIds);
  if (!cleanUid || tripIds.length === 0) {
    return { claimedIds: [], failedIds: [] };
  }

  const bookingService = bookingServiceOverride ?? getBookingService();
  if (!bookingService.updateTrip) {
    return { claimedIds: [], failedIds: tripIds };
  }

  const claimedIds: string[] = [];
  const failedIds: string[] = [];

  for (const tripId of tripIds) {
    try {
      await bookingService.updateTrip(tripId, {
        customerId: cleanUid,
        userId: cleanUid,
      } as any);
      claimedIds.push(tripId);
    } catch (err) {
      console.warn(`[GuestTripClaim] Could not link guest trip ${tripId} to user ${cleanUid}:`, err);
      failedIds.push(tripId);
    }
  }

  return { claimedIds, failedIds };
}
