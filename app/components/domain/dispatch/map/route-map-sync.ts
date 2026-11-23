/// <reference types="google.maps" />

import type { GeoPoint, Trip, TripLocation } from '../../../../core/types/trip';
import { hasValidRoutingEndpoint } from '../../../../core/hooks/useDebounceRoute';
import { resolveMockCoordinates } from '../../../../core/services/maps/mock-routing';
import {
  ROUTE_WAYPOINT_PIN_ANCHOR_X,
  ROUTE_WAYPOINT_PIN_ANCHOR_Y,
  ROUTE_WAYPOINT_PIN_HEIGHT,
  ROUTE_WAYPOINT_PIN_WIDTH,
  buildRouteWaypointPinDataUrl,
  getTripIntermediateStops,
  type RouteWaypointKind,
} from '../../../../core/utils/route-markers.util';

export interface ResolvedRouteWaypoint {
  id: string;
  kind: RouteWaypointKind;
  stopNumber?: number;
  badgeLabel: string;
  address: string;
  notes?: string;
  coordinates: GeoPoint;
  hasExplicitCoordinates?: boolean;
  placeId?: string;
}

export interface ResolvedRouteMetrics {
  distanceMiles: number;
  durationMinutes: number;
}

export interface ActiveRouteContext {
  source: 'selected_trip' | 'draft_form' | 'active_trip';
  hasFullRoute: boolean;
  tripId?: string;
  passengerLabel?: string;
  originInput: GeoPoint | string;
  destinationInput: GeoPoint | string;
  originPlaceId?: string;
  destinationPlaceId?: string;
  waypointInputs: Array<{ location: GeoPoint | string; stopover: boolean }>;
  waypoints: ResolvedRouteWaypoint[];
  stopCount: number;
  fallbackMetrics: ResolvedRouteMetrics | null;
  locationSignature: string;
  signature: string;
}

export interface RoutePolylineHandles {
  casingPolyline: google.maps.Polyline | null;
  mainPolyline: google.maps.Polyline | null;
}

export const DIRECTIONS_CACHE_MAX_ENTRIES = 50;
const GEOCODE_CACHE_MAX_ENTRIES = 100;

export interface CachedDirectionsRouteEntry {
  snappedWaypoints: ResolvedRouteWaypoint[];
  path: GeoPoint[];
  metrics: ResolvedRouteMetrics | null;
  bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral | null;
}

const directionsLruCache = new Map<string, CachedDirectionsRouteEntry>();
const geocodeLruCache = new Map<string, GeoPoint>();

/**
 * Retrieves a cached road-snapped Directions snapshot by route signature (O(1) LRU touch).
 */
export function getCachedDirectionsResult(signature: string): CachedDirectionsRouteEntry | null {
  const key = typeof signature === 'string' ? signature.trim() : '';
  if (!key || !directionsLruCache.has(key)) return null;
  const entry = directionsLruCache.get(key)!;
  directionsLruCache.delete(key);
  directionsLruCache.set(key, entry);
  return entry;
}

/**
 * Stores a road-snapped Directions snapshot in the bounded LRU cache (`maxEntries` default `50`).
 */
export function setCachedDirectionsResult(
  signature: string,
  entry: CachedDirectionsRouteEntry,
  maxEntries: number = DIRECTIONS_CACHE_MAX_ENTRIES
): void {
  const key = typeof signature === 'string' ? signature.trim() : '';
  if (!key) return;
  const cap = Math.max(1, Math.floor(maxEntries));
  if (directionsLruCache.has(key)) {
    directionsLruCache.delete(key);
  }
  directionsLruCache.set(key, entry);
  while (directionsLruCache.size > cap) {
    const oldestKey = directionsLruCache.keys().next().value;
    if (oldestKey !== undefined) {
      directionsLruCache.delete(oldestKey);
    } else {
      break;
    }
  }
}

export function clearCachedDirectionsResults(): void {
  directionsLruCache.clear();
}

export function getDirectionsCacheSize(): number {
  return directionsLruCache.size;
}

export function applyCachedDirectionsToWaypoints(
  cached: CachedDirectionsRouteEntry,
  baseWaypoints: ResolvedRouteWaypoint[]
): ResolvedRouteWaypoint[] {
  return baseWaypoints.map((wp, idx) => {
    const snapped = cached.snappedWaypoints[idx];
    return snapped
      ? { ...wp, coordinates: snapped.coordinates, hasExplicitCoordinates: true }
      : wp;
  });
}

export function getCachedGeocodeCoordinates(address: string): GeoPoint | null {
  const key = typeof address === 'string' ? address.trim().toLowerCase() : '';
  if (!key || !geocodeLruCache.has(key)) return null;
  const pt = geocodeLruCache.get(key)!;
  geocodeLruCache.delete(key);
  geocodeLruCache.set(key, pt);
  return pt;
}

export function setCachedGeocodeCoordinates(address: string, point: GeoPoint): void {
  const key = typeof address === 'string' ? address.trim().toLowerCase() : '';
  if (!key || !isValidGeoPoint(point)) return;
  if (geocodeLruCache.has(key)) {
    geocodeLruCache.delete(key);
  }
  geocodeLruCache.set(key, point);
  while (geocodeLruCache.size > GEOCODE_CACHE_MAX_ENTRIES) {
    const oldest = geocodeLruCache.keys().next().value;
    if (oldest !== undefined) geocodeLruCache.delete(oldest);
    else break;
  }
}

/**
 * Resolves freeform address text via `window.google.maps.Geocoder` when loaded,
 * caching results by normalized address string. Returns `null` when unavailable.
 */
export function geocodeAddressCached(address: string): Promise<GeoPoint | null> {
  const trimmed = typeof address === 'string' ? address.trim() : '';
  if (trimmed.length < 4) return Promise.resolve(null);
  const hit = getCachedGeocodeCoordinates(trimmed);
  if (hit) return Promise.resolve(hit);

  if (typeof window === 'undefined' || typeof window.google?.maps?.Geocoder !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: trimmed }, (results, status) => {
        if (status === 'OK' && results && results[0]?.geometry?.location) {
          const pt = latLngToGeoPoint(results[0].geometry.location);
          if (pt) {
            setCachedGeocodeCoordinates(trimmed, pt);
            resolve(pt);
            return;
          }
        }
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

export function isValidGeoPoint(pt?: GeoPoint | null): pt is GeoPoint {
  return Boolean(
    pt &&
      typeof pt.lat === 'number' &&
      typeof pt.lng === 'number' &&
      Number.isFinite(pt.lat) &&
      Number.isFinite(pt.lng) &&
      !(pt.lat === 0 && pt.lng === 0)
  );
}

export function isRoutableMapEndpoint(endpoint: unknown, placeId?: string): boolean {
  if (hasValidRoutingEndpoint(endpoint, placeId)) return true;
  if (typeof endpoint === 'string' && endpoint.trim().length >= 4) return true;
  return false;
}

export function isRoutableMapRoute(route: ActiveRouteContext | null | undefined): boolean {
  if (!route || !route.hasFullRoute) return false;
  return (
    isRoutableMapEndpoint(route.originInput, route.originPlaceId) &&
    isRoutableMapEndpoint(route.destinationInput, route.destinationPlaceId)
  );
}

function combineLocationNotes(...parts: Array<string | undefined | null>): string | undefined {
  const unique: string[] = [];
  for (const part of parts) {
    const trimmed = typeof part === 'string' ? part.trim() : '';
    if (trimmed && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique.length > 0 ? unique.join(' • ') : undefined;
}

function locSignatureToken(val: GeoPoint | string | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val.lat === 'number' && typeof val.lng === 'number') {
    return `${val.lat.toFixed(5)},${val.lng.toFixed(5)}`;
  }
  return String(val);
}

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function resolveBestInitialCoords(coords: GeoPoint | undefined | null, address: string): {
  coordinates: GeoPoint;
  hasExplicitCoordinates: boolean;
} {
  if (isValidGeoPoint(coords)) {
    return { coordinates: coords, hasExplicitCoordinates: true };
  }
  const geocoded = getCachedGeocodeCoordinates(address);
  if (geocoded) {
    return { coordinates: geocoded, hasExplicitCoordinates: true };
  }
  return {
    coordinates: resolveMockCoordinates(address || 'Chesterfield, MO'),
    hasExplicitCoordinates: false,
  };
}

export function estimateFallbackRouteMetrics(
  waypoints: ResolvedRouteWaypoint[],
  explicitMiles?: number,
  explicitMinutes?: number
): ResolvedRouteMetrics | null {
  if (
    typeof explicitMiles === 'number' &&
    explicitMiles > 0 &&
    typeof explicitMinutes === 'number' &&
    explicitMinutes > 0
  ) {
    return {
      distanceMiles: Number(explicitMiles.toFixed(1)),
      durationMinutes: Math.max(1, Math.round(explicitMinutes)),
    };
  }
  if (waypoints.length < 2) return null;
  let straightMiles = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    straightMiles += haversineMiles(waypoints[i].coordinates, waypoints[i + 1].coordinates);
  }
  const roadMiles = Math.max(0.4, straightMiles * 1.24);
  const estMinutes = Math.max(2, Math.round((roadMiles / 28) * 60));
  return {
    distanceMiles: Number(roadMiles.toFixed(1)),
    durationMinutes: estMinutes,
  };
}

function buildWaypointsFromTrip(trip: Trip): {
  originInput: GeoPoint | string;
  destinationInput: GeoPoint | string;
  waypointInputs: Array<{ location: GeoPoint | string; stopover: boolean }>;
  waypoints: ResolvedRouteWaypoint[];
} {
  const pickupLoc = trip.pickupLocation;
  const dropoffLoc = trip.dropoffLocation;
  const stops: TripLocation[] = getTripIntermediateStops(trip);

  const originInput: GeoPoint | string = isValidGeoPoint(pickupLoc.coordinates)
    ? pickupLoc.coordinates
    : pickupLoc.address;
  const destinationInput: GeoPoint | string = isValidGeoPoint(dropoffLoc.coordinates)
    ? dropoffLoc.coordinates
    : dropoffLoc.address;

  const waypointInputs = stops.map((s) => ({
    location: isValidGeoPoint(s.coordinates) ? s.coordinates : s.address,
    stopover: true,
  }));

  const pickupResolved = resolveBestInitialCoords(pickupLoc.coordinates, pickupLoc.address);
  const dropoffResolved = resolveBestInitialCoords(dropoffLoc.coordinates, dropoffLoc.address);

  const waypoints: ResolvedRouteWaypoint[] = [
    {
      id: 'pickup',
      kind: 'pickup',
      badgeLabel: 'Pickup',
      address: (pickupLoc.address || '').trim() || 'Selected Pickup',
      notes: combineLocationNotes(
        pickupLoc.unitOrApt ? `Unit/Apt: ${pickupLoc.unitOrApt}` : undefined,
        pickupLoc.notes,
        pickupLoc.flightNotes || trip.flightNotes,
        pickupLoc.driverNotes || trip.driverNotes
      ),
      coordinates: pickupResolved.coordinates,
      hasExplicitCoordinates: pickupResolved.hasExplicitCoordinates,
    },
    ...stops.map((stop, idx) => {
      const stopResolved = resolveBestInitialCoords(stop.coordinates, stop.address);
      return {
        id: `stop-${idx + 1}`,
        kind: 'stop' as const,
        stopNumber: idx + 1,
        badgeLabel: `Stop #${idx + 1}`,
        address: (stop.address || '').trim(),
        notes: combineLocationNotes(
          stop.unitOrApt ? `Unit/Apt: ${stop.unitOrApt}` : undefined,
          stop.notes,
          stop.driverNotes
        ),
        coordinates: stopResolved.coordinates,
        hasExplicitCoordinates: stopResolved.hasExplicitCoordinates,
      };
    }),
    {
      id: 'dropoff',
      kind: 'dropoff',
      badgeLabel: 'Dropoff',
      address: (dropoffLoc.address || '').trim() || 'Selected Dropoff',
      notes: combineLocationNotes(
        dropoffLoc.unitOrApt ? `Unit/Apt: ${dropoffLoc.unitOrApt}` : undefined,
        dropoffLoc.notes,
        dropoffLoc.driverNotes
      ),
      coordinates: dropoffResolved.coordinates,
      hasExplicitCoordinates: dropoffResolved.hasExplicitCoordinates,
    },
  ];

  return { originInput, destinationInput, waypointInputs, waypoints };
}

/**
 * Resolves the active route context from `selectedTrip`, `activeFormValues`, or `activeTrip`:
 * - Supports full routes (`hasFullRoute: true`) across all 3 sources.
 * - Supports single-endpoint / partial `'draft_form'` previews (`hasFullRoute: false`) when
 *   only Pickup (Emerald pin) or only Dropoff (Rose pin) + optional stops are entered.
 */
export function resolveActiveRouteContext(params: {
  selectedTrip?: Trip | null;
  activeFormValues?: any;
  activeTrip?: Trip | null;
  shouldZoom?: boolean;
}): ActiveRouteContext | null {
  const { selectedTrip, activeFormValues, activeTrip, shouldZoom = false } = params;

  const hasSelectedPickup = Boolean(
    selectedTrip?.pickupLocation?.address?.trim() ||
      isValidGeoPoint(selectedTrip?.pickupLocation?.coordinates)
  );
  const hasSelectedDropoff = Boolean(
    selectedTrip?.dropoffLocation?.address?.trim() ||
      isValidGeoPoint(selectedTrip?.dropoffLocation?.coordinates)
  );

  if (selectedTrip && hasSelectedPickup && hasSelectedDropoff) {
    const built = buildWaypointsFromTrip(selectedTrip);
    const passengerName = `${selectedTrip.passenger?.firstName || ''} ${
      selectedTrip.passenger?.lastName || ''
    }`.trim();
    const locationSignature = [
      locSignatureToken(built.originInput),
      locSignatureToken(built.destinationInput),
      built.waypointInputs.map((w) => locSignatureToken(w.location)).join('|'),
    ].join('=>');
    const signature = [
      'selected',
      selectedTrip.id,
      locationSignature,
      shouldZoom ? '1' : '0',
    ].join('=>');

    return {
      source: 'selected_trip',
      hasFullRoute: true,
      tripId: selectedTrip.id,
      passengerLabel: passengerName || undefined,
      ...built,
      stopCount: Math.max(0, built.waypoints.length - 2),
      fallbackMetrics: estimateFallbackRouteMetrics(
        built.waypoints,
        selectedTrip.pricing?.distanceMiles,
        selectedTrip.pricing?.durationMinutes
      ),
      locationSignature,
      signature,
    };
  }

  if (activeFormValues) {
    const pickupAddr =
      typeof activeFormValues.pickupAddress === 'string'
        ? activeFormValues.pickupAddress.trim()
        : '';
    const dropoffAddr =
      typeof activeFormValues.dropoffAddress === 'string'
        ? activeFormValues.dropoffAddress.trim()
        : '';
    const hasDraftPickup = Boolean(pickupAddr || isValidGeoPoint(activeFormValues.pickupCoordinates));
    const hasDraftDropoff = Boolean(
      dropoffAddr || isValidGeoPoint(activeFormValues.dropoffCoordinates)
    );
    const rawStops: Array<any> = Array.isArray(activeFormValues.intermediateStops)
      ? activeFormValues.intermediateStops.filter(
          (s: any) =>
            (typeof s?.address === 'string' && s.address.trim().length > 0) ||
            isValidGeoPoint(s?.coordinates)
        )
      : [];

    if (hasDraftPickup || hasDraftDropoff || rawStops.length > 0) {
      const hasFullRoute = hasDraftPickup && hasDraftDropoff;
      const originInput: GeoPoint | string = hasDraftPickup
        ? isValidGeoPoint(activeFormValues.pickupCoordinates)
          ? activeFormValues.pickupCoordinates
          : pickupAddr
        : '';
      const destinationInput: GeoPoint | string = hasDraftDropoff
        ? isValidGeoPoint(activeFormValues.dropoffCoordinates)
          ? activeFormValues.dropoffCoordinates
          : dropoffAddr
        : '';
      const waypointInputs = rawStops.map((s) => ({
        location: isValidGeoPoint(s.coordinates) ? s.coordinates : String(s.address || '').trim(),
        stopover: true,
      }));

      const waypoints: ResolvedRouteWaypoint[] = [];
      if (hasDraftPickup) {
        const pRes = resolveBestInitialCoords(activeFormValues.pickupCoordinates, pickupAddr);
        waypoints.push({
          id: 'pickup',
          kind: 'pickup',
          badgeLabel: 'Pickup',
          address:
            pickupAddr ||
            `${pRes.coordinates.lat.toFixed(4)}, ${pRes.coordinates.lng.toFixed(4)}`,
          notes: combineLocationNotes(activeFormValues.notesForAll),
          coordinates: pRes.coordinates,
          hasExplicitCoordinates: pRes.hasExplicitCoordinates,
          placeId: activeFormValues.pickupPlaceId,
        });
      }

      rawStops.forEach((s, idx) => {
        const addr = String(s.address || '').trim();
        const sRes = resolveBestInitialCoords(s.coordinates, addr);
        waypoints.push({
          id: `stop-${idx + 1}`,
          kind: 'stop' as const,
          stopNumber: idx + 1,
          badgeLabel: `Stop #${idx + 1}`,
          address: addr || `${sRes.coordinates.lat.toFixed(4)}, ${sRes.coordinates.lng.toFixed(4)}`,
          notes: combineLocationNotes(s.notes),
          coordinates: sRes.coordinates,
          hasExplicitCoordinates: sRes.hasExplicitCoordinates,
          placeId: s.placeId,
        });
      });

      if (hasDraftDropoff) {
        const dRes = resolveBestInitialCoords(activeFormValues.dropoffCoordinates, dropoffAddr);
        waypoints.push({
          id: 'dropoff',
          kind: 'dropoff',
          badgeLabel: 'Dropoff',
          address:
            dropoffAddr ||
            `${dRes.coordinates.lat.toFixed(4)}, ${dRes.coordinates.lng.toFixed(4)}`,
          coordinates: dRes.coordinates,
          hasExplicitCoordinates: dRes.hasExplicitCoordinates,
          placeId: activeFormValues.dropoffPlaceId,
        });
      }

      const locationSignature = [
        locSignatureToken(originInput),
        locSignatureToken(destinationInput),
        waypointInputs.map((w) => locSignatureToken(w.location)).join('|'),
      ].join('=>');
      const signature = [
        'draft',
        hasFullRoute ? 'full' : 'partial',
        locationSignature,
        shouldZoom ? '1' : '0',
      ].join('=>');

      return {
        source: 'draft_form',
        hasFullRoute,
        passengerLabel: activeFormValues.passengerName?.trim() || 'Booking Draft',
        originInput,
        destinationInput,
        originPlaceId: activeFormValues.pickupPlaceId,
        destinationPlaceId: activeFormValues.dropoffPlaceId,
        waypointInputs,
        waypoints,
        stopCount: rawStops.length,
        fallbackMetrics: hasFullRoute
          ? estimateFallbackRouteMetrics(
              waypoints,
              activeFormValues.estimatedDistanceMiles,
              activeFormValues.estimatedDurationMinutes
            )
          : waypoints.length >= 2
          ? estimateFallbackRouteMetrics(waypoints)
          : null,
        locationSignature,
        signature,
      };
    }
  }

  if (activeTrip?.pickupLocation?.address?.trim() && activeTrip?.dropoffLocation?.address?.trim()) {
    const built = buildWaypointsFromTrip(activeTrip);
    const passengerName = `${activeTrip.passenger?.firstName || ''} ${
      activeTrip.passenger?.lastName || ''
    }`.trim();
    const locationSignature = [
      locSignatureToken(built.originInput),
      locSignatureToken(built.destinationInput),
      built.waypointInputs.map((w) => locSignatureToken(w.location)).join('|'),
    ].join('=>');
    const signature = [
      'active',
      activeTrip.id,
      locationSignature,
      shouldZoom ? '1' : '0',
    ].join('=>');

    return {
      source: 'active_trip',
      hasFullRoute: true,
      tripId: activeTrip.id,
      passengerLabel: passengerName || undefined,
      ...built,
      stopCount: Math.max(0, built.waypoints.length - 2),
      fallbackMetrics: estimateFallbackRouteMetrics(
        built.waypoints,
        activeTrip.pricing?.distanceMiles,
        activeTrip.pricing?.durationMinutes
      ),
      locationSignature,
      signature,
    };
  }

  return null;
}

function latLngToGeoPoint(latLng: google.maps.LatLng | GeoPoint | null | undefined): GeoPoint | null {
  if (!latLng) return null;
  const anyLoc = latLng as any;
  const lat = typeof anyLoc.lat === 'function' ? anyLoc.lat() : anyLoc.lat;
  const lng = typeof anyLoc.lng === 'function' ? anyLoc.lng() : anyLoc.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

/**
 * Extracts snapped waypoint coordinates, full road polyline path, and summed leg metrics
 * from a Google `DirectionsResult`.
 */
export function extractDirectionsRouteSnapshot(
  result: google.maps.DirectionsResult,
  baseWaypoints: ResolvedRouteWaypoint[]
): {
  snappedWaypoints: ResolvedRouteWaypoint[];
  path: GeoPoint[];
  metrics: ResolvedRouteMetrics | null;
} {
  const route = result.routes?.[0];
  if (!route) {
    return {
      snappedWaypoints: baseWaypoints,
      path: baseWaypoints.map((w) => w.coordinates),
      metrics: null,
    };
  }

  const legs = route.legs || [];
  const snappedWaypoints = baseWaypoints.map((wp, idx) => {
    if (legs.length === 0) return wp;
    if (idx === 0) {
      const startPt = latLngToGeoPoint(legs[0]?.start_location);
      return startPt ? { ...wp, coordinates: startPt, hasExplicitCoordinates: true } : wp;
    }
    if (idx === baseWaypoints.length - 1) {
      const endPt = latLngToGeoPoint(legs[legs.length - 1]?.end_location);
      return endPt ? { ...wp, coordinates: endPt, hasExplicitCoordinates: true } : wp;
    }
    // Intermediate stop idx (1..N) corresponds to legs[idx - 1].end_location
    const legEndPt = latLngToGeoPoint(legs[idx - 1]?.end_location);
    return legEndPt ? { ...wp, coordinates: legEndPt, hasExplicitCoordinates: true } : wp;
  });

  const stepPoints: GeoPoint[] = [];
  for (const leg of legs) {
    for (const step of leg.steps || []) {
      for (const pt of step.path || []) {
        const converted = latLngToGeoPoint(pt);
        if (converted) stepPoints.push(converted);
      }
    }
  }

  const overviewPoints =
    stepPoints.length >= 2
      ? stepPoints
      : (route.overview_path || [])
          .map((pt) => latLngToGeoPoint(pt))
          .filter((pt): pt is GeoPoint => Boolean(pt));

  const totalMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
  const totalSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
  const metrics =
    totalMeters > 0 || totalSeconds > 0
      ? {
          distanceMiles: Number((totalMeters / 1609.344).toFixed(1)),
          durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
        }
      : null;

  return {
    snappedWaypoints,
    path: overviewPoints.length >= 2 ? overviewPoints : snappedWaypoints.map((w) => w.coordinates),
    metrics,
  };
}

/**
 * Frames either a single waypoint pin (`panTo` + `zoom >= 13`) or a multi-point route
 * (`fitBounds` with `56px` padding) on the Google Map instance.
 */
export function frameRouteViewportOnMap(params: {
  map: google.maps.Map | null;
  waypoints: ResolvedRouteWaypoint[];
  path?: GeoPoint[];
  bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral | null;
}): void {
  const { map, waypoints, path = [], bounds } = params;
  if (!map) return;

  if (waypoints.length === 1 && isValidGeoPoint(waypoints[0].coordinates)) {
    map.panTo(waypoints[0].coordinates);
    const currentZoom = map.getZoom?.() ?? 11;
    if (currentZoom < 13) {
      map.setZoom(14);
    }
    return;
  }

  if (bounds) {
    map.fitBounds(bounds, 56);
    return;
  }

  const pts = path.length >= 2 ? path : waypoints.map((w) => w.coordinates);
  if (pts.length >= 2 && typeof window !== 'undefined' && window.google?.maps?.LatLngBounds) {
    const computed = new window.google.maps.LatLngBounds();
    pts.forEach((pt) => computed.extend(pt));
    map.fitBounds(computed, 56);
  }
}

export function clearRoutePolylines(handles: RoutePolylineHandles): void {
  if (handles.casingPolyline) {
    try {
      handles.casingPolyline.setMap(null);
    } catch {}
    handles.casingPolyline = null;
  }
  if (handles.mainPolyline) {
    try {
      handles.mainPolyline.setMap(null);
    } catch {}
    handles.mainPolyline = null;
  }
}

/**
 * Synchronizes either a high-contrast outer-cased polyline with periodic travel-direction
 * arrow chevrons (`casedRouteWithArrows === true`) or a clean single blue polyline (`false`).
 */
export function syncRoutePolylines(params: {
  map: google.maps.Map | null;
  handles: RoutePolylineHandles;
  path: GeoPoint[];
  casedRouteWithArrows: boolean;
}): void {
  const { map, handles, path, casedRouteWithArrows } = params;
  if (!map || path.length < 2 || typeof window === 'undefined' || !window.google?.maps?.Polyline) {
    clearRoutePolylines(handles);
    return;
  }

  const gMaps = window.google.maps;

  if (casedRouteWithArrows) {
    if (!handles.casingPolyline) {
      handles.casingPolyline = new gMaps.Polyline({
        path,
        strokeColor: '#1e3a8a',
        strokeWeight: 8,
        strokeOpacity: 0.55,
        zIndex: 40,
        clickable: false,
        map,
      });
    } else {
      handles.casingPolyline.setOptions({
        path,
        strokeColor: '#1e3a8a',
        strokeWeight: 8,
        strokeOpacity: 0.55,
        zIndex: 40,
        clickable: false,
      });
      if (!handles.casingPolyline.getMap()) {
        handles.casingPolyline.setMap(map);
      }
    }

    const arrowIcons: google.maps.IconSequence[] =
      gMaps.SymbolPath?.FORWARD_CLOSED_ARROW !== undefined
        ? [
            {
              icon: {
                path: gMaps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 2.6,
                fillColor: '#ffffff',
                fillOpacity: 1,
                strokeColor: '#1d4ed8',
                strokeWeight: 1.2,
              },
              offset: '48px',
              repeat: '90px',
            },
          ]
        : [];

    if (!handles.mainPolyline) {
      handles.mainPolyline = new gMaps.Polyline({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 4.5,
        strokeOpacity: 0.96,
        zIndex: 41,
        clickable: false,
        icons: arrowIcons,
        map,
      });
    } else {
      handles.mainPolyline.setOptions({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 4.5,
        strokeOpacity: 0.96,
        zIndex: 41,
        clickable: false,
        icons: arrowIcons,
      });
      if (!handles.mainPolyline.getMap()) {
        handles.mainPolyline.setMap(map);
      }
    }
  } else {
    if (handles.casingPolyline) {
      try {
        handles.casingPolyline.setMap(null);
      } catch {}
      handles.casingPolyline = null;
    }

    if (!handles.mainPolyline) {
      handles.mainPolyline = new gMaps.Polyline({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 5,
        strokeOpacity: 0.85,
        zIndex: 41,
        clickable: false,
        icons: [],
        map,
      });
    } else {
      handles.mainPolyline.setOptions({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 5,
        strokeOpacity: 0.85,
        zIndex: 41,
        clickable: false,
        icons: [],
      });
      if (!handles.mainPolyline.getMap()) {
        handles.mainPolyline.setMap(map);
      }
    }
  }
}

export function clearRouteWaypointMarkers(pool: Map<string, google.maps.Marker>): void {
  pool.forEach((marker) => {
    try {
      if (typeof google !== 'undefined' && google?.maps?.event) {
        google.maps.event.clearInstanceListeners(marker);
      }
      marker.setMap(null);
    } catch {}
  });
  pool.clear();
}

/**
 * Synchronizes pooled Green Pickup, Orange Stop `1..N`, and Red Dropoff teardrop SVG pins.
 */
export function syncRouteWaypointMarkers(params: {
  map: google.maps.Map | null;
  pool: Map<string, google.maps.Marker>;
  waypoints: ResolvedRouteWaypoint[];
  selectedWaypointId: string | null;
  interactiveRoutePinPopovers: boolean;
  onSelectWaypoint: (waypointId: string) => void;
}): void {
  const {
    map,
    pool,
    waypoints,
    selectedWaypointId,
    interactiveRoutePinPopovers,
    onSelectWaypoint,
  } = params;

  if (!map || waypoints.length === 0 || typeof window === 'undefined' || !window.google?.maps?.Marker) {
    clearRouteWaypointMarkers(pool);
    return;
  }

  const gMaps = window.google.maps;
  const activeIds = new Set<string>();

  for (const wp of waypoints) {
    activeIds.add(wp.id);
    const isSelected = interactiveRoutePinPopovers && selectedWaypointId === wp.id;
    const icon: google.maps.Icon = {
      url: buildRouteWaypointPinDataUrl({
        kind: wp.kind,
        stopNumber: wp.stopNumber,
        isSelected,
      }),
      scaledSize: new gMaps.Size(ROUTE_WAYPOINT_PIN_WIDTH, ROUTE_WAYPOINT_PIN_HEIGHT),
      anchor: new gMaps.Point(ROUTE_WAYPOINT_PIN_ANCHOR_X, ROUTE_WAYPOINT_PIN_ANCHOR_Y),
    };

    const title = `${wp.badgeLabel}: ${wp.address}${wp.notes ? ` (${wp.notes})` : ''}`;
    const zIndex = isSelected
      ? 480
      : wp.kind === 'pickup'
      ? 435
      : wp.kind === 'dropoff'
      ? 430
      : 410 + (wp.stopNumber || 0);

    const existing = pool.get(wp.id);
    if (existing) {
      existing.setPosition(wp.coordinates);
      existing.setIcon(icon);
      existing.setTitle(title);
      existing.setZIndex(zIndex);
      existing.setClickable(interactiveRoutePinPopovers);
      if (!existing.getMap()) {
        existing.setMap(map);
      }
    } else {
      const marker = new gMaps.Marker({
        position: wp.coordinates,
        map,
        icon,
        title,
        zIndex,
        clickable: interactiveRoutePinPopovers,
        optimized: false,
      });
      marker.addListener('click', () => {
        onSelectWaypoint(wp.id);
      });
      pool.set(wp.id, marker);
    }
  }

  pool.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      try {
        if (typeof google !== 'undefined' && google?.maps?.event) {
          google.maps.event.clearInstanceListeners(marker);
        }
        marker.setMap(null);
      } catch {}
      pool.delete(id);
    }
  });
}
