/// <reference types="google.maps" />

/**
 * Live Google Maps Routing & Distance Matrix Client Service
 * 
 * Computes exact driving distances (statute miles) and driving durations (minutes)
 * using the client-side Google Maps DirectionsService and DistanceMatrixService.
 * 
 * Supports:
 * - Multi-stop routes with intermediate waypoints (e.g. pickup -> stop -> dropoff).
 * - Real turn-by-turn road network distances (not straight-line or Haversine approximations).
 * - Live traffic considerations when available.
 * - Graceful fallback to null when Google Maps is unconfigured, rate-limited, or offline.
 */

import { isGoogleMapsReady, loadGoogleMaps } from './google-maps-loader';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { isRealtimeRoutingEnabled } from '../config/admin-config.service';
import { routeCache } from './route-cache';
import { calculateMockRoute, ceilToHalfMile } from './mock-routing';
import { hasValidRoutingEndpoint } from '../../hooks/useDebounceRoute';

export type RouteEndpointInput = string | google.maps.LatLngLiteral | { lat: number; lng: number };

export interface LiveRouteRequest {
  origin: RouteEndpointInput;
  destination: RouteEndpointInput;
  originPlaceId?: string;
  destinationPlaceId?: string;
  waypoints?: RouteEndpointInput[];
  waypointPlaceIds?: string[];
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}

export interface LiveRouteResult {
  distanceMiles: number;
  distanceMeters: number;
  durationMinutes: number;
  durationSeconds: number;
  durationInTrafficMinutes?: number;
  startAddress: string;
  endAddress: string;
  overviewPolyline?: string;
  warnings: string[];
  isLiveGoogleResult: boolean;
  legs: Array<{
    distanceMiles: number;
    distanceMeters: number;
    durationMinutes: number;
    durationSeconds: number;
    startAddress: string;
    endAddress: string;
  }>;
}

/**
 * Converts a RouteEndpointInput (coordinates or address string) to a google.maps.LatLng or string.
 */
export function toGoogleLocation(
  point: RouteEndpointInput
): string | google.maps.LatLng {
  if (typeof point === 'object' && point !== null) {
    if ('lat' in point && 'lng' in point && typeof point.lat === 'number' && typeof point.lng === 'number') {
      return new google.maps.LatLng(point.lat, point.lng);
    }
  }
  if (typeof point === 'string') {
    const trimmed = point.trim();
    const latLngMatch = trimmed.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (latLngMatch) {
      const lat = parseFloat(latLngMatch[1]);
      const lng = parseFloat(latLngMatch[3]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return new google.maps.LatLng(lat, lng);
      }
    }
    return trimmed;
  }
  return String(point);
}

function endpointToString(point: RouteEndpointInput): string {
  if (typeof point === 'string') {
    return point;
  }
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

// Track whether Directions API or Distance Matrix API has been denied to prevent repeated console spam
let directionsApiDenied = false;
let distanceMatrixApiDenied = false;

export function resetRoutingApiDenial(): void {
  directionsApiDenied = false;
  distanceMatrixApiDenied = false;
}

/**
 * Calculates a live driving route using Google Maps DirectionsService.
 * 
 * @param request Origin, destination, and optional intermediate waypoints.
 * @returns LiveRouteResult if successful, or null if Google Maps is unavailable/fails.
 */
export async function calculateLiveRoute(request: LiveRouteRequest): Promise<LiveRouteResult | null> {
  const { origin, destination, waypoints = [], avoidTolls = false, avoidHighways = false } = request;

  if (!origin || !destination) {
    return null;
  }
  if (typeof origin === 'string' && origin.trim().length === 0) {
    return null;
  }
  if (typeof destination === 'string' && destination.trim().length === 0) {
    return null;
  }

  // 1. Developer & Offline Mock Mode: Check dynamic Admin Settings / companyConfig toggle
  if (!isRealtimeRoutingEnabled()) {
    console.log('[LiveRoutingService] Developer mock routing active (enableRealtimeRouting: false). Returning Haversine 1.25x curvature route for zero API cost.');
    return calculateMockRoute(request);
  }

  // 2. Client-Side Route Caching: Check RouteCache before making Google API call
  const cacheKey = routeCache.buildKey(
    origin,
    destination,
    waypoints,
    request.originPlaceId,
    request.destinationPlaceId,
    request.waypointPlaceIds
  );
  const cached = routeCache.get(cacheKey);
  if (cached) {
    console.log('[LiveRoutingService] Instant RouteCache hit for key:', cacheKey);
    return cached;
  }

  // 3. Debounce & Trigger Guarding: Only call Directions API if both origin and destination
  // possess valid Google place_ids or explicit Lat/Lng coordinates.
  const hasValidOrigin = hasValidRoutingEndpoint(origin, request.originPlaceId);
  const hasValidDestination = hasValidRoutingEndpoint(destination, request.destinationPlaceId);

  if (!hasValidOrigin || !hasValidDestination) {
    console.warn(
      '[LiveRoutingService] Execution guard halted Google Directions API call: Origin or Destination lacks valid place_id or Lat/Lng coordinates.',
      { origin, destination, originPlaceId: request.originPlaceId, destinationPlaceId: request.destinationPlaceId }
    );
    return null;
  }

  // If Directions API is not authorized on this API key, avoid spamming Google's endpoint
  if (directionsApiDenied) {
    return null;
  }

  // Ensure Google Maps is loaded
  if (!isGoogleMapsReady()) {
    const loaded = await loadGoogleMaps();
    if (!loaded || !isGoogleMapsReady()) {
      return null;
    }
  }

  try {
    const directionsService = new google.maps.DirectionsService();

    const googleOrigin = toGoogleLocation(origin);
    const googleDestination = toGoogleLocation(destination);

    // Map intermediate stops into DirectionsWaypoint format with exact LatLng objects when available
    const googleWaypoints: google.maps.DirectionsWaypoint[] = waypoints
      .map((wp) => ({
        location: toGoogleLocation(wp),
        stopover: true,
      }))
      .filter((wp) => {
        if (typeof wp.location === 'string') {
          return wp.location.trim().length > 0;
        }
        return Boolean(wp.location);
      });

    // Symmetric Route Calculation (Option 1: A -> [...stops] -> B -> [...reverseStops] -> A in 1 API call)
    // Computes both forward and reverse driving legs in a single Google Directions request,
    // takes Math.max(forwardDistance, reverseDistance), and rounds up to the next 0.5 mi.
    const forwardLegCount = googleWaypoints.length + 1;
    const useSymmetricLoop = googleWaypoints.length * 2 + 1 <= 23;

    const requestWaypoints: google.maps.DirectionsWaypoint[] = useSymmetricLoop
      ? [
          ...googleWaypoints,
          { location: googleDestination, stopover: true },
          ...[...googleWaypoints].reverse(),
        ]
      : googleWaypoints;

    const directionsRequest: google.maps.DirectionsRequest = {
      origin: googleOrigin,
      destination: useSymmetricLoop ? googleOrigin : googleDestination,
      waypoints: requestWaypoints,
      travelMode: google.maps.TravelMode.DRIVING,
      avoidTolls,
      avoidHighways,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    };

    const response = await directionsService.route(directionsRequest);
    const route = response.routes[0];

    if (!route || !route.legs || route.legs.length === 0) {
      console.warn('[LiveRoutingService] No route or legs returned from Google Directions API');
      return null;
    }

    const forwardRawLegs = useSymmetricLoop
      ? route.legs.slice(0, forwardLegCount)
      : route.legs;
    const reverseRawLegs = useSymmetricLoop
      ? route.legs.slice(forwardLegCount)
      : [];

    let forwardMeters = 0;
    let forwardSeconds = 0;
    let forwardTrafficSeconds = 0;
    let hasTraffic = false;

    const legs = forwardRawLegs.map((leg: google.maps.DirectionsLeg) => {
      const legMeters = leg.distance?.value ?? 0;
      const legSeconds = leg.duration?.value ?? 0;
      forwardMeters += legMeters;
      forwardSeconds += legSeconds;

      if (leg.duration_in_traffic?.value) {
        hasTraffic = true;
        forwardTrafficSeconds += leg.duration_in_traffic.value;
      } else {
        forwardTrafficSeconds += legSeconds;
      }

      const legMiles = Math.max(0.5, ceilToHalfMile(legMeters / 1609.344));
      const legMinutes = Math.max(1, Math.ceil(legSeconds / 60));

      return {
        distanceMiles: legMiles,
        distanceMeters: legMeters,
        durationMinutes: legMinutes,
        durationSeconds: legSeconds,
        startAddress: leg.start_address ?? '',
        endAddress: leg.end_address ?? '',
      };
    });

    let reverseMeters = 0;
    let reverseSeconds = 0;
    let reverseTrafficSeconds = 0;

    for (const rLeg of reverseRawLegs) {
      const rMeters = rLeg.distance?.value ?? 0;
      const rSeconds = rLeg.duration?.value ?? 0;
      reverseMeters += rMeters;
      reverseSeconds += rSeconds;
      if (rLeg.duration_in_traffic?.value) {
        hasTraffic = true;
        reverseTrafficSeconds += rLeg.duration_in_traffic.value;
      } else {
        reverseTrafficSeconds += rSeconds;
      }
    }

    const totalMeters = Math.max(forwardMeters, reverseMeters);
    const totalSeconds = Math.max(forwardSeconds, reverseSeconds);
    const totalTrafficSeconds = Math.max(forwardTrafficSeconds, reverseTrafficSeconds);

    // Ceiling to next 0.5 statute mile on top of max(forward, reverse)
    // 1 statute mile = 1609.344 meters
    const rawMaxMiles = totalMeters / 1609.344;
    const distanceMiles = Math.max(0.5, ceilToHalfMile(rawMaxMiles));
    const durationMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
    const durationInTrafficMinutes = hasTraffic
      ? Math.max(durationMinutes, Math.ceil(totalTrafficSeconds / 60))
      : undefined;

    // For single-leg trips, ensure the leg reflects the symmetric quantized distance
    if (legs.length === 1) {
      legs[0].distanceMiles = distanceMiles;
      legs[0].distanceMeters = totalMeters;
      legs[0].durationMinutes = durationMinutes;
      legs[0].durationSeconds = totalSeconds;
    }

    const resolvedStartAddress =
      forwardRawLegs[0]?.start_address ?? endpointToString(origin);
    const resolvedEndAddress =
      forwardRawLegs[forwardRawLegs.length - 1]?.end_address ?? endpointToString(destination);

    // Output debugging logs to browser console for verification
    console.log('[LiveRoute Symmetric]', {
      forwardMiles: Math.round((forwardMeters / 1609.344) * 100) / 100,
      reverseMiles: Math.round((reverseMeters / 1609.344) * 100) / 100,
      ceiledSymmetricMiles: distanceMiles,
      minutes: durationMinutes,
      legs,
    });

    const liveResult: LiveRouteResult = {
      distanceMiles,
      distanceMeters: totalMeters,
      durationMinutes,
      durationSeconds: totalSeconds,
      durationInTrafficMinutes,
      startAddress: resolvedStartAddress,
      endAddress: resolvedEndAddress,
      overviewPolyline: route.overview_polyline,
      warnings: route.warnings ?? [],
      isLiveGoogleResult: true,
      legs,
    };

    // Client-Side Route Caching: Save forward route AND symmetric reverse route to RouteCache
    routeCache.set(cacheKey, liveResult);

    const reverseCacheKey = routeCache.buildKey(
      destination,
      origin,
      [...waypoints].reverse(),
      request.destinationPlaceId,
      request.originPlaceId,
      request.waypointPlaceIds ? [...request.waypointPlaceIds].reverse() : undefined
    );
    if (reverseCacheKey !== cacheKey) {
      routeCache.set(reverseCacheKey, {
        ...liveResult,
        startAddress: resolvedEndAddress,
        endAddress: resolvedStartAddress,
      });
    }

    return liveResult;
  } catch (err: unknown) {
    const errorStr = String(err);
    if (errorStr.includes('REQUEST_DENIED') || errorStr.includes('not authorized') || errorStr.includes('Directions Service')) {
      directionsApiDenied = true;
      console.warn(
        '[LiveRoutingService] Directions API is not enabled for this key in Google Cloud Console. Enable "Directions API" under APIs & Services to activate client-side driving directions. Seamlessly using server-side road estimation.'
      );
    } else {
      console.warn('[LiveRoutingService] Live directions query failed or rate-limited, falling back:', err);
    }
    return null;
  }
}

/**
 * Calculates a point-to-point driving distance using Google Maps DistanceMatrixService.
 */
export async function calculateLiveDistanceMatrix(
  origins: RouteEndpointInput[],
  destinations: RouteEndpointInput[]
): Promise<Array<{ originIndex: number; destinationIndex: number; distanceMiles: number; durationMinutes: number }> | null> {
  if (distanceMatrixApiDenied) {
    return null;
  }

  if (!isGoogleMapsReady()) {
    const loaded = await loadGoogleMaps();
    if (!loaded || !isGoogleMapsReady()) {
      return null;
    }
  }

  try {
    const googleOrigins = origins.map(toGoogleLocation);
    const googleDestinations = destinations.map(toGoogleLocation);

    const service = new google.maps.DistanceMatrixService();
    const result = await service.getDistanceMatrix({
      origins: googleOrigins,
      destinations: googleDestinations,
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    });

    const elements: Array<{
      originIndex: number;
      destinationIndex: number;
      distanceMiles: number;
      durationMinutes: number;
    }> = [];

    result.rows.forEach((row: google.maps.DistanceMatrixResponseRow, oIdx: number) => {
      row.elements.forEach((element: google.maps.DistanceMatrixResponseElement, dIdx: number) => {
        if (element.status === 'OK') {
          const meters = element.distance?.value ?? 0;
          const seconds = element.duration?.value ?? 0;
          elements.push({
            originIndex: oIdx,
            destinationIndex: dIdx,
            distanceMiles: Math.max(0.5, ceilToHalfMile(meters / 1609.344)),
            durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
          });
        }
      });
    });

    return elements;
  } catch (err: unknown) {
    const errorStr = String(err);
    if (errorStr.includes('REQUEST_DENIED') || errorStr.includes('not authorized')) {
      distanceMatrixApiDenied = true;
    }
    console.warn('[LiveRoutingService] Distance matrix query failed:', err);
    return null;
  }
}

