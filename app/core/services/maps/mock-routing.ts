/**
 * Local Developer & Offline Mock Routing Engine
 * 
 * Replaces live Google Directions API calls with a pure local Haversine
 * distance calculator multiplied by a 1.25x road curvature factor.
 * 
 * Returns mock distance, duration, and straight-line encoded polyline
 * for zero API cost during development, testing, or offline scenarios.
 */

import type { LiveRouteRequest, LiveRouteResult, RouteEndpointInput } from './live-routing.service';

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

// Default regional reference points (Chesterfield & St. Louis metro)
const CHESTERFIELD_DEFAULT: GeoCoordinate = { lat: 38.6631, lng: -90.5771 };
const STL_AIRPORT_DEFAULT: GeoCoordinate = { lat: 38.7499, lng: -90.3700 };
const SPIRIT_AIRPORT_DEFAULT: GeoCoordinate = { lat: 38.6622, lng: -90.6508 };
const DOWNTOWN_STL_DEFAULT: GeoCoordinate = { lat: 38.6270, lng: -90.1994 };

/**
 * Encodes an array of lat/lng coordinates into a Google-compatible polyline string.
 * Implements the official Google Polyline Encoding Algorithm.
 */
export function encodePolyline(points: GeoCoordinate[]): string {
  if (!points || points.length === 0) return '';

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const latE5 = Math.round(point.lat * 1e5);
    const lngE5 = Math.round(point.lng * 1e5);

    const dLat = latE5 - prevLat;
    const dLng = lngE5 - prevLng;

    prevLat = latE5;
    prevLng = lngE5;

    encoded += encodeSignedNumber(dLat) + encodeSignedNumber(dLng);
  }

  return encoded;
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num < 0 ? ~(num << 1) : num << 1;
  let encoded = '';

  while (sgnNum >= 0x20) {
    encoded += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>= 5;
  }
  encoded += String.fromCharCode(sgnNum + 63);
  return encoded;
}

/**
 * Calculates straight-line distance in statute miles using the Haversine formula.
 */
export function calculateHaversineDistance(c1: GeoCoordinate, c2: GeoCoordinate): number {
  const earthRadiusMiles = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(c2.lat - c1.lat);
  const dLng = toRad(c2.lng - c1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(c1.lat)) *
      Math.cos(toRad(c2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

/**
 * Resolves a route endpoint into a concrete latitude/longitude pair.
 */
export function resolveMockCoordinates(endpoint: RouteEndpointInput): GeoCoordinate {
  if (typeof endpoint === 'object' && endpoint !== null) {
    const lat = typeof endpoint.lat === 'function' ? (endpoint.lat as () => number)() : endpoint.lat;
    const lng = typeof endpoint.lng === 'function' ? (endpoint.lng as () => number)() : endpoint.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  if (typeof endpoint === 'string') {
    const trimmed = endpoint.trim().toLowerCase();
    const latLngMatch = trimmed.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (latLngMatch) {
      const lat = parseFloat(latLngMatch[1]);
      const lng = parseFloat(latLngMatch[3]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }

    if (trimmed.includes('lambert') || trimmed.includes('stl')) return STL_AIRPORT_DEFAULT;
    if (trimmed.includes('spirit') || trimmed.includes('sus')) return SPIRIT_AIRPORT_DEFAULT;
    if (trimmed.includes('downtown') || trimmed.includes('arch')) return DOWNTOWN_STL_DEFAULT;

    // Deterministic pseudo-random offset within Chesterfield/St. Louis corridor
    let hash = 0;
    for (let i = 0; i < trimmed.length; i++) {
      hash = (hash << 5) - hash + trimmed.charCodeAt(i);
      hash |= 0;
    }
    const latOffset = ((Math.abs(hash) % 1000) / 1000) * 0.08 - 0.04;
    const lngOffset = ((Math.abs(hash >> 3) % 1000) / 1000) * 0.08 - 0.04;
    return {
      lat: CHESTERFIELD_DEFAULT.lat + latOffset,
      lng: CHESTERFIELD_DEFAULT.lng + lngOffset,
    };
  }

  return CHESTERFIELD_DEFAULT;
}

function resolveAddressLabel(endpoint: RouteEndpointInput, fallback: string): string {
  if (typeof endpoint === 'string' && endpoint.trim().length > 0) {
    return endpoint.trim();
  }
  if (typeof endpoint === 'object' && endpoint !== null) {
    const lat = typeof endpoint.lat === 'function' ? (endpoint.lat as () => number)() : endpoint.lat;
    const lng = typeof endpoint.lng === 'function' ? (endpoint.lng as () => number)() : endpoint.lng;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  return fallback;
}

/**
 * Calculates a local mock driving route with:
 * - Haversine distance × 1.25x road curvature factor
 * - Realistic driving duration (~32 mph average speed)
 * - Straight-line encoded polyline
 * - Zero Google Directions API cost
 */
export function calculateMockRoute(request: LiveRouteRequest): LiveRouteResult {
  const originCoord = resolveMockCoordinates(request.origin);
  const destCoord = resolveMockCoordinates(request.destination);
  const waypointCoords = (request.waypoints || []).map(resolveMockCoordinates);

  const allPoints: GeoCoordinate[] = [originCoord, ...waypointCoords, destCoord];

  // Road curvature factor: 1.25x
  const ROAD_CURVATURE_FACTOR = 1.25;
  const AVERAGE_SPEED_MPH = 32;

  let totalStraightMiles = 0;
  const legs: LiveRouteResult['legs'] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];
    const straightSegmentMiles = calculateHaversineDistance(p1, p2);
    totalStraightMiles += straightSegmentMiles;

    const legRoadMiles = Math.max(0.1, Math.round(straightSegmentMiles * ROAD_CURVATURE_FACTOR * 100) / 100);
    const legMeters = Math.round(legRoadMiles * 1609.344);
    const legMinutes = Math.max(1, Math.ceil((legRoadMiles / AVERAGE_SPEED_MPH) * 60));

    const fromLabel = i === 0 ? resolveAddressLabel(request.origin, 'Pickup') : `Waypoint ${i}`;
    const toLabel = i === allPoints.length - 2 ? resolveAddressLabel(request.destination, 'Destination') : `Waypoint ${i + 1}`;

    legs.push({
      distanceMiles: legRoadMiles,
      distanceMeters: legMeters,
      durationMinutes: legMinutes,
      durationSeconds: legMinutes * 60,
      startAddress: fromLabel,
      endAddress: toLabel,
    });
  }

  const distanceMiles = Math.max(0.5, Math.round(totalStraightMiles * ROAD_CURVATURE_FACTOR * 100) / 100);
  const distanceMeters = Math.round(distanceMiles * 1609.344);
  const durationMinutes = Math.max(2, Math.ceil((distanceMiles / AVERAGE_SPEED_MPH) * 60));
  const overviewPolyline = encodePolyline(allPoints);

  return {
    distanceMiles,
    distanceMeters,
    durationMinutes,
    durationSeconds: durationMinutes * 60,
    startAddress: resolveAddressLabel(request.origin, 'Chesterfield, MO'),
    endAddress: resolveAddressLabel(request.destination, 'St. Louis, MO'),
    overviewPolyline,
    warnings: ['Local mock route active (enableRealtimeRouting: false, 1.25x road curvature factor). Zero API cost.'],
    isLiveGoogleResult: false,
    legs,
  };
}
