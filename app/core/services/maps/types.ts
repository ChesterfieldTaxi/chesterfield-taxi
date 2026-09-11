/**
 * Server-Side Route & Distance Calculation Types
 * 
 * Defines data structures for server-side Google Maps Directions and
 * Distance Matrix integrations, ensuring API keys and calculations
 * remain securely server-bound.
 */

import type { GeoPoint } from '../../types';

export type RouteEndpoint = string | GeoPoint;

export interface RouteRequest {
  origin: RouteEndpoint;
  destination: RouteEndpoint;
  waypoints?: RouteEndpoint[];
  departureTime?: Date | string;
  trafficModel?: 'best_guess' | 'pessimistic' | 'optimistic';
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}

export interface RouteResponse {
  distanceMiles: number;
  distanceMeters: number;
  durationMinutes: number;
  durationSeconds: number;
  durationInTrafficMinutes?: number;
  startAddress: string;
  endAddress: string;
  startLocation: GeoPoint;
  endLocation: GeoPoint;
  /** Encoded polyline string returned for safe client-side vector map rendering */
  overviewPolyline?: string;
  warnings?: string[];
  isLiveGoogleResult?: boolean;
  calculatedAt: string; // ISO 8601
}

export interface DistanceMatrixRequest {
  origins: RouteEndpoint[];
  destinations: RouteEndpoint[];
  departureTime?: Date | string;
}

export interface DistanceMatrixElement {
  originIndex: number;
  destinationIndex: number;
  status: 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS';
  distanceMiles: number;
  durationMinutes: number;
}

export interface DistanceMatrixResponse {
  elements: DistanceMatrixElement[];
  calculatedAt: string;
}

/**
 * Server-side route service interface.
 * Must only be invoked from React Router server loaders, actions, or API routes.
 */
export interface IServerRouteService {
  /**
   * Computes precise distance, duration, and route geometry between origin and destination.
   */
  calculateRoute(request: RouteRequest): Promise<RouteResponse>;

  /**
   * Computes many-to-many distance matrix elements for driver dispatch targeting.
   */
  calculateDistanceMatrix(request: DistanceMatrixRequest): Promise<DistanceMatrixResponse>;
}
