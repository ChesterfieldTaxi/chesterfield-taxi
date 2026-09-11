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

export type RouteEndpointInput = string | google.maps.LatLngLiteral | { lat: number; lng: number };

export interface LiveRouteRequest {
  origin: RouteEndpointInput;
  destination: RouteEndpointInput;
  waypoints?: RouteEndpointInput[];
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

/**
 * Calculates a live driving route using Google Maps DirectionsService.
 * 
 * @param request Origin, destination, and optional intermediate waypoints.
 * @returns LiveRouteResult if successful, or null if Google Maps is unavailable/fails.
 */
export async function calculateLiveRoute(request: LiveRouteRequest): Promise<LiveRouteResult | null> {
  // Ensure Google Maps is loaded
  if (!isGoogleMapsReady()) {
    const loaded = await loadGoogleMaps();
    if (!loaded || !isGoogleMapsReady()) {
      return null;
    }
  }

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

    const directionsRequest: google.maps.DirectionsRequest = {
      origin: googleOrigin,
      destination: googleDestination,
      waypoints: googleWaypoints,
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

    let totalMeters = 0;
    let totalSeconds = 0;
    let totalTrafficSeconds = 0;
    let hasTraffic = false;

    const legs = route.legs.map((leg: google.maps.DirectionsLeg) => {
      const legMeters = leg.distance?.value ?? 0;
      const legSeconds = leg.duration?.value ?? 0;
      totalMeters += legMeters;
      totalSeconds += legSeconds;

      if (leg.duration_in_traffic?.value) {
        hasTraffic = true;
        totalTrafficSeconds += leg.duration_in_traffic.value;
      } else {
        totalTrafficSeconds += legSeconds;
      }

      // Convert leg meters to statute miles with float precision: totalMeters / 1609.344
      const legMiles = Math.round((legMeters / 1609.344) * 100) / 100;
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

    // Statute miles float precision with 2 decimal places: Math.round((totalMeters / 1609.344) * 100) / 100
    // 1 statute mile = 1609.344 meters exactly
    const distanceMiles = Math.max(0.1, Math.round((totalMeters / 1609.344) * 100) / 100);
    const durationMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
    const durationInTrafficMinutes = hasTraffic
      ? Math.max(durationMinutes, Math.ceil(totalTrafficSeconds / 60))
      : undefined;

    // Output debugging logs to browser console for verification
    console.log('[LiveRoute]', {
      totalMeters,
      miles: distanceMiles,
      minutes: durationMinutes,
      legs,
    });

    return {
      distanceMiles,
      distanceMeters: totalMeters,
      durationMinutes,
      durationSeconds: totalSeconds,
      durationInTrafficMinutes,
      startAddress: route.legs[0].start_address ?? endpointToString(origin),
      endAddress: route.legs[route.legs.length - 1].end_address ?? endpointToString(destination),
      overviewPolyline: route.overview_polyline,
      warnings: route.warnings ?? [],
      isLiveGoogleResult: true,
      legs,
    };
  } catch (err) {
    console.warn('[LiveRoutingService] Live directions query failed or rate-limited, falling back:', err);
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
            distanceMiles: Math.max(0.1, Math.round((meters / 1609.344) * 100) / 100),
            durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
          });
        }
      });
    });

    return elements;
  } catch (err) {
    console.warn('[LiveRoutingService] Distance matrix query failed:', err);
    return null;
  }
}

