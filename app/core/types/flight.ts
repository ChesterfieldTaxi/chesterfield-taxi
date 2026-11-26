/**
 * Flight Status Telemetry & Provider Adapter Contracts
 *
 * Pure domain types for Phase 38 Live Flight Status Tracking across
 * Lambert-St. Louis International (STL), Spirit of St. Louis (SUS),
 * and St. Louis Downtown (CPS) airports.
 *
 * Zero external SDK or secret dependencies per constitution.md.
 */

export type FlightProviderId = 'aerodatabox' | 'flightaware' | 'fallback';

import type { TerminalPickupLocations } from '../config/airports';

export type FlightOperationalStatus =
  | 'scheduled'
  | 'en_route'
  | 'landed'
  | 'delayed'
  | 'cancelled'
  | 'diverted'
  | 'unknown';

export interface FlightTelemetrySnapshot {
  flightIdent: string;
  airlineCode: string;
  airlineName?: string;
  flightNumber: string;
  /** Service date in YYYY-MM-DD format */
  serviceDate: string;
  status: FlightOperationalStatus;
  scheduledDepartureIso?: string;
  estimatedDepartureIso?: string;
  scheduledArrivalIso?: string;
  estimatedArrivalIso?: string;
  delayMinutes: number;
  originIata?: string;
  originCity?: string;
  destinationIata?: string;
  terminal?: string;
  gate?: string;
  baggageClaim?: string;
  pickupDoorGuidance?: string;
  provider: FlightProviderId;
  isSimulatedFallback: boolean;
  checkedAt: string;
  cacheExpiresAt: string;
}

export interface FlightLookupQuery {
  flightIdent: string;
  airlineCode: string;
  airlineName?: string;
  flightNumber: string;
  /** YYYY-MM-DD */
  serviceDate: string;
  destinationIata?: string;
  originIata?: string;
  scheduledPickupIso?: string;
  pickupConfig?: TerminalPickupLocations | null;
}

export interface IFlightStatusProvider {
  readonly id: FlightProviderId;
  isConfigured(): boolean;
  lookupFlight(query: FlightLookupQuery): Promise<FlightTelemetrySnapshot | null>;
}

export type FlightPickupConflictType =
  | 'none'
  | 'pickup_before_arrival'
  | 'significant_delay'
  | 'flight_cancelled';

export interface FlightPickupAlignment {
  aligned: boolean;
  conflict: FlightPickupConflictType;
  /** Positive minutes by which scheduledPickupTime should move later */
  driftMinutes: number;
  recommendedPickupIso?: string;
  effectiveArrivalIso?: string;
  bufferMinutes: number;
  message?: string;
}

export interface FlightDiagnosticsSummary {
  activeProvider: FlightProviderId;
  liveApiConfigured: boolean;
  aeroDataBoxConfigured: boolean;
  flightAwareConfigured: boolean;
  fallbackReady: boolean;
  cacheTtlMinutes: number;
  cachedEntriesCount: number;
  supportedAirports: string[];
  endpointPath: string;
}
