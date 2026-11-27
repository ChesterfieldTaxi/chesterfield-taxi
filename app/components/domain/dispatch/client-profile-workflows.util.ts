/**
 * Pure Client Profile workflows (Platform Phase 70): 1-click Book Return, future-safe clone timing,
 * active/upcoming vs past partitioning, unified Saved & Frequent Places, and quick-fill payloads.
 * Zero React / DOM imports.
 */
import { detectAirportEndpoint } from '../../../core/config/airports';
import { cloneTripToDispatchFormValues } from '../../../core/hooks/dispatch/dispatch-workspace.util';
import {
  normalizePlaceAddressKey,
  type ContactRecord,
  type ContactSavedPlaceCategory,
} from '../../../core/services/customer/contact.service';
import { formatLocalDateStr } from '../../../core/services/pricing/vehicle-matching';
import type { WorkspaceEventMap } from '../../../core/services/workspace-bus.service';
import type { CorporateAccountConfig } from '../../../core/types/config';
import type { GeoPoint, Trip } from '../../../core/types/trip';
import type { DispatchFormValues } from './DispatchBookingEngine';
import type { ResolvedClientProfileData } from './client-trip-history.util';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'declined']);
const LIVE_STATUSES = new Set(['in_progress', 'arrived', 'en_route']);
const ROUND_MINUTES_MS = 5 * 60_000;

export type ClientQuickPlaceCategory = ContactSavedPlaceCategory | 'company' | 'frequent';
export type ClientQuickPlaceSource = 'saved' | 'contact_field' | 'corporate' | 'frequent';

export interface ClientQuickPlaceItem {
  id: string;
  label: string;
  category: ClientQuickPlaceCategory;
  source: ClientQuickPlaceSource;
  address: string;
  coordinates?: { lat: number; lng: number };
  notes?: string;
  tripCount?: number;
  removable: boolean;
}

export type ClientPopulatePayload = WorkspaceEventMap['POPULATE_BOOKING'];

function tripTimeMs(trip: Trip): number {
  for (const iso of [trip.scheduledPickupTime, trip.createdAt, trip.updatedAt]) {
    const ms = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/** Seeds `asap` timing with today's local date and a 5-minute-rounded local time derived from `nowMs`. */
function seedAsapTiming(values: DispatchFormValues, nowMs: number): DispatchFormValues {
  const rounded = new Date(Math.ceil(nowMs / ROUND_MINUTES_MS) * ROUND_MINUTES_MS);
  const hh = String(rounded.getHours()).padStart(2, '0');
  const mm = String(rounded.getMinutes()).padStart(2, '0');
  return {
    ...values,
    timingType: 'asap',
    scheduledDate: formatLocalDateStr(rounded),
    scheduledTime: `${hh}:${mm}`,
  };
}

/**
 * Future-safe draft timing: a historical (past) `scheduledPickupTime` is never copied onto a new draft
 * (reset to `asap` + current local date/time); a still-future scheduled pickup is preserved.
 */
export function normalizeClonedDraftTiming(
  values: DispatchFormValues,
  trip: Trip,
  nowMs: number = Date.now()
): DispatchFormValues {
  const pickupMs = trip.scheduledPickupTime ? Date.parse(trip.scheduledPickupTime) : NaN;
  if (Number.isFinite(pickupMs) && pickupMs > nowMs) return values;
  return seedAsapTiming(values, nowMs);
}

/**
 * Pure linked-trip detection shared by the dispatch editor, Client Profile, and Trip Actions dropdown.
 */
export function hasTripLinkedCounterpart(
  trip: Trip | null | undefined,
  allTrips?: ReadonlyArray<Trip>
): boolean {
  if (!trip) return false;
  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  if (
    trip.linkedTripId ||
    trip.linkedReturnTripId ||
    meta.linkedTripId ||
    meta.linkedReturnTripId ||
    meta.returnTripId
  ) {
    return true;
  }
  if (trip.id && allTrips && allTrips.length > 0) {
    return allTrips.some((other) => {
      if (!other || other.id === trip.id) return false;
      const otherMeta = (other.metadata ?? {}) as Record<string, unknown>;
      return (
        other.linkedTripId === trip.id ||
        other.linkedReturnTripId === trip.id ||
        otherMeta.linkedTripId === trip.id ||
        otherMeta.linkedReturnTripId === trip.id ||
        otherMeta.returnTripId === trip.id
      );
    });
  }
  return false;
}

/** 1-click `⇄ Book Return`: reverses the route and resets timing / stale outbound flight info. */
export function buildReturnTabValuesFromClientTrip(
  trip: Trip,
  nowMs: number = Date.now(),
  options?: { linkToSourceTrip?: boolean }
): DispatchFormValues {
  const base = cloneTripToDispatchFormValues(trip);
  const swapped: DispatchFormValues = {
    ...base,
    pickupAddress: base.dropoffAddress,
    dropoffAddress: base.pickupAddress,
    pickupCoordinates: base.dropoffCoordinates,
    dropoffCoordinates: base.pickupCoordinates,
    pickupPlaceId: base.dropoffPlaceId ?? trip.dropoffLocation?.placeId,
    dropoffPlaceId: base.pickupPlaceId ?? trip.pickupLocation?.placeId,
    intermediateStops: [...(trip.intermediateStops || [])]
      .reverse()
      .map((s) => ({ address: s.address, coordinates: s.coordinates, ...(s.placeId ? { placeId: s.placeId } : {}) })),
  };
  const timed = seedAsapTiming(swapped, nowMs);
  const result = detectAirportEndpoint(timed.pickupAddress).isAirport
    ? timed
    : { ...timed, provideFlightInfo: false, airline: '', flightNumber: '', flightOrigin: '' };
  if (options?.linkToSourceTrip && trip.id) {
    return { ...result, linkedOutboundTripId: trip.id };
  }
  return result;
}

export function partitionClientActiveUpcomingAndPastTrips(
  sortedTrips: ReadonlyArray<Trip>,
  _nowMs: number = Date.now()
): { activeUpcomingTrips: Trip[]; pastTrips: Trip[] } {
  const isTerminal = (t: Trip) => TERMINAL_STATUSES.has(String(t.status || '').toLowerCase());
  const isLive = (t: Trip) => LIVE_STATUSES.has(String(t.status || '').toLowerCase());
  const activeUpcomingTrips = sortedTrips
    .filter((t) => !isTerminal(t))
    .sort(
      (a, b) =>
        Number(isLive(b)) - Number(isLive(a)) || tripTimeMs(a) - tripTimeMs(b) || a.id.localeCompare(b.id)
    );
  const pastTrips = sortedTrips
    .filter(isTerminal)
    .sort((a, b) => tripTimeMs(b) - tripTimeMs(a) || b.id.localeCompare(a.id));
  return { activeUpcomingTrips, pastTrips };
}

function shortAddressLabel(address: string): string {
  return address.split(',')[0]?.trim() || address;
}

export function resolveClientSavedAndFrequentPlaces(params: {
  contact?: ContactRecord | null;
  corporateAccounts?: ReadonlyArray<CorporateAccountConfig>;
  corporateAccountName?: string | null;
  sortedTrips?: ReadonlyArray<Trip>;
  maxItems?: number;
}): ClientQuickPlaceItem[] {
  const { contact } = params;
  const maxItems = params.maxItems ?? 6;
  const items: ClientQuickPlaceItem[] = [];
  const seen = new Set<string>();
  const push = (item: ClientQuickPlaceItem): boolean => {
    const key = normalizePlaceAddressKey(item.address);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    items.push(item);
    return true;
  };

  for (const p of contact?.savedPlaces || []) {
    push({ ...p, source: 'saved', removable: true });
  }
  if (contact?.homeAddress) {
    push({ id: 'contact_home', label: 'Home', category: 'home', source: 'contact_field', address: contact.homeAddress, removable: false });
  }
  if (contact?.workAddress) {
    push({ id: 'contact_work', label: 'Work', category: 'work', source: 'contact_field', address: contact.workAddress, removable: false });
  }

  const corpNeedles = [params.corporateAccountName, contact?.corporateAccountName, contact?.corporateAccountId]
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);
  const account =
    corpNeedles.length === 0
      ? undefined
      : (params.corporateAccounts || []).find(
          (a) =>
            a.isActive !== false &&
            [a.companyName, a.accountNumber, a.id].some((v) => corpNeedles.includes(String(v || '').trim().toLowerCase()))
        );
  for (const loc of account?.savedCompanyLocations || []) {
    push({ id: `corp_${account!.id}_${loc.id}`, label: loc.label, category: 'company', source: 'corporate', address: loc.address, notes: loc.notes, removable: false });
  }

  const tally = new Map<string, { address: string; coordinates?: GeoPoint; count: number; order: number }>();
  for (const trip of params.sortedTrips || []) {
    for (const loc of [trip.pickupLocation, trip.dropoffLocation]) {
      const key = normalizePlaceAddressKey(loc?.address);
      if (!key) continue;
      const hit = tally.get(key);
      if (hit) {
        hit.count += 1;
        hit.coordinates = hit.coordinates || loc?.coordinates;
      } else {
        tally.set(key, { address: String(loc!.address).trim(), coordinates: loc?.coordinates, count: 1, order: tally.size });
      }
    }
  }
  const frequent = [...tally.values()].sort((a, b) => b.count - a.count || a.order - b.order);
  for (const f of frequent) {
    if (items.length >= maxItems) break;
    push({
      id: `frequent_${normalizePlaceAddressKey(f.address).replace(/\s+/g, '_')}`,
      label: shortAddressLabel(f.address),
      category: 'frequent',
      source: 'frequent',
      address: f.address,
      coordinates: f.coordinates ? { lat: f.coordinates.lat, lng: f.coordinates.lng } : undefined,
      tripCount: f.count,
      removable: false,
    });
  }
  return items;
}

/**
 * `POPULATE_BOOKING` payload for `Set Pickup` / `Set Dropoff`. Passenger + corporate fields hydrate a blank
 * draft but never clobber a different passenger already entered (`onlyFillEmptyPassenger`).
 */
export function buildPopulateDraftPayloadFromClientPlace(
  place: ClientQuickPlaceItem,
  endpoint: 'pickup' | 'dropoff',
  profile: ResolvedClientProfileData
): ClientPopulatePayload {
  const name = profile.displayName && profile.displayName !== 'Client Profile' && !/^[+\d(]/.test(profile.displayName)
    ? profile.displayName
    : undefined;
  const coordinates = place.coordinates ? { ...place.coordinates } : undefined;
  return {
    ...(endpoint === 'pickup'
      ? { pickupAddress: place.address, pickupCoordinates: coordinates }
      : { dropoffAddress: place.address, dropoffCoordinates: coordinates }),
    notes: place.notes,
    passengerName: name,
    passengerPhone: profile.rawPhone || undefined,
    passengerEmail: profile.displayEmail || undefined,
    corporateAccount: profile.corporateAccountName || undefined,
    billingPo: profile.contact?.defaultPoNumber || undefined,
    onlyFillEmptyPassenger: true,
  };
}
