/**
 * Server-Side Google Maps Route Calculation Service (Stub & Utility)
 * 
 * Ensures all distance, duration, and transit routing calculations occur
 * exclusively on the server (via React Router loaders, actions, or serverless functions).
 * 
 * SECURITY GUARANTEES:
 * 1. Google Maps Server API keys are never leaked to client bundles.
 * 2. Route distances and durations cannot be manipulated by client-side tampering.
 * 3. Client receives tamper-proof metrics that feed directly into the Pure Functional Pricing Engine.
 */

import type { GeoPoint } from '../../types';
import type {
  IServerRouteService,
  RouteRequest,
  RouteResponse,
  DistanceMatrixRequest,
  DistanceMatrixResponse,
  DistanceMatrixElement,
  RouteEndpoint,
} from './types';

// Default reference coordinates centered around Chesterfield, VA / Richmond metro area
const DEFAULT_CENTER_COORDINATES: GeoPoint = {
  lat: 37.3771,
  lng: -77.5036,
};

/**
 * Pure Haversine formula to calculate great-circle distance between two GPS coordinates in miles.
 */
function calculateHaversineDistanceMiles(coord1: GeoPoint, coord2: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;

  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

/**
 * Resolves a RouteEndpoint (string or GeoPoint) into a concrete GeoPoint coordinate.
 */
function resolveEndpointCoordinates(endpoint: RouteEndpoint): GeoPoint {
  if (typeof endpoint === 'object' && endpoint !== null && 'lat' in endpoint && 'lng' in endpoint) {
    return endpoint;
  }
  // Deterministic pseudo-offset for string addresses during offline/stub mode
  let hash = 0;
  const str = String(endpoint);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((hash % 1000) / 1000) * 0.1;
  const lngOffset = (((hash >> 3) % 1000) / 1000) * 0.1;

  return {
    lat: DEFAULT_CENTER_COORDINATES.lat + latOffset,
    lng: DEFAULT_CENTER_COORDINATES.lng + lngOffset,
  };
}

function resolveEndpointAddress(endpoint: RouteEndpoint, defaultLabel: string): string {
  if (typeof endpoint === 'string' && endpoint.trim().length > 0) {
    return endpoint;
  }
  if (typeof endpoint === 'object' && endpoint !== null) {
    return `${endpoint.lat.toFixed(4)}, ${endpoint.lng.toFixed(4)}`;
  }
  return defaultLabel;
}

/**
 * Server-Side Route Service Stub Implementation.
 * 
 * Provides realistic route calculations for development and testing.
 * When GOOGLE_MAPS_SERVER_API_KEY is configured in production, this
 * stub can be substituted with Google Maps Directions & Distance Matrix HTTP clients.
 */
export class StubServerRouteService implements IServerRouteService {
  /**
   * Generates a safe fallback route estimate when addresses are unrecognized or mock data is blank.
   */
  private getDefaultEstimatedRoute(request?: RouteRequest): RouteResponse {
    const defaultDistanceMiles = 12.5;
    const defaultDurationMinutes = 22;

    return {
      distanceMiles: defaultDistanceMiles,
      distanceMeters: Math.round(defaultDistanceMiles * 1609.34),
      durationMinutes: defaultDurationMinutes,
      durationSeconds: defaultDurationMinutes * 60,
      durationInTrafficMinutes: defaultDurationMinutes + 3,
      startAddress: resolveEndpointAddress(request?.origin ?? '', 'Chesterfield, VA'),
      endAddress: resolveEndpointAddress(request?.destination ?? '', 'Richmond International Airport (RIC)'),
      startLocation: DEFAULT_CENTER_COORDINATES,
      endLocation: { lat: 37.5052, lng: -77.3197 },
      overviewPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      warnings: ['Default mock estimate applied (12.5 mi, 22 mins) for route query.'],
      calculatedAt: new Date().toISOString(),
    };
  }

  public async calculateRoute(request: RouteRequest): Promise<RouteResponse> {
    try {
      if (
        !request.origin ||
        !request.destination ||
        (typeof request.origin === 'string' && request.origin.trim().length === 0) ||
        (typeof request.destination === 'string' && request.destination.trim().length === 0)
      ) {
        return this.getDefaultEstimatedRoute(request);
      }

      const startLocation = resolveEndpointCoordinates(request.origin);
      const endLocation = resolveEndpointCoordinates(request.destination);

      if (
        isNaN(startLocation.lat) ||
        isNaN(startLocation.lng) ||
        isNaN(endLocation.lat) ||
        isNaN(endLocation.lng)
      ) {
        return this.getDefaultEstimatedRoute(request);
      }

      // Calculate straight-line distance, scaled by 1.3 to approximate real road street networks
      const straightLineMiles = calculateHaversineDistanceMiles(startLocation, endLocation);
      if (isNaN(straightLineMiles) || straightLineMiles <= 0) {
        return this.getDefaultEstimatedRoute(request);
      }

      const roadNetworkFactor = 1.30;
      const distanceMiles = Math.max(0.5, Math.round(straightLineMiles * roadNetworkFactor * 10) / 10);
      const distanceMeters = Math.round(distanceMiles * 1609.34);

      // Approximate urban/suburban driving speed (~30 mph average with traffic lights)
      const averageSpeedMph = 30;
      const durationHours = distanceMiles / averageSpeedMph;
      const durationMinutes = Math.max(3, Math.round(durationHours * 60));
      const durationSeconds = durationMinutes * 60;

      return {
        distanceMiles,
        distanceMeters,
        durationMinutes,
        durationSeconds,
        durationInTrafficMinutes: durationMinutes + 2,
        startAddress: resolveEndpointAddress(request.origin, 'Chesterfield, VA'),
        endAddress: resolveEndpointAddress(request.destination, 'Richmond Metro Area, VA'),
        startLocation,
        endLocation,
        overviewPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        warnings: [],
        calculatedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[StubServerRouteService] Unrecognized route or calculation error, using default estimate:', err);
      return this.getDefaultEstimatedRoute(request);
    }
  }

  public async calculateDistanceMatrix(
    request: DistanceMatrixRequest
  ): Promise<DistanceMatrixResponse> {
    const elements: DistanceMatrixElement[] = [];

    for (let o = 0; o < request.origins.length; o++) {
      const originCoord = resolveEndpointCoordinates(request.origins[o]);
      for (let d = 0; d < request.destinations.length; d++) {
        const destCoord = resolveEndpointCoordinates(request.destinations[d]);
        const straightMiles = calculateHaversineDistanceMiles(originCoord, destCoord);
        const distanceMiles = Math.max(0.2, Math.round(straightMiles * 1.3 * 10) / 10);
        const durationMinutes = Math.max(2, Math.round((distanceMiles / 30) * 60));

        elements.push({
          originIndex: o,
          destinationIndex: d,
          status: 'OK',
          distanceMiles,
          durationMinutes,
        });
      }
    }

    return {
      elements,
      calculatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Factory to retrieve the server route calculation service.
 */
let cachedRouteService: IServerRouteService | null = null;

export function getServerRouteService(): IServerRouteService {
  if (!cachedRouteService) {
    cachedRouteService = new StubServerRouteService();
  }
  return cachedRouteService;
}
