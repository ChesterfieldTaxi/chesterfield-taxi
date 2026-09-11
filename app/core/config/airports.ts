/**
 * Airport Constants & Utilities
 *
 * Defines supported regional airports in the St. Louis / Chesterfield service area,
 * major commercial airline carriers, vehicle luggage capacities, and a pure
 * detection helper used to auto-detect airport trips in the booking wizard.
 *
 * All detection logic is pure (no side effects) per constitution.md constraints.
 */

import type { VehicleTier } from '../types';

// ---------------------------------------------------------------------------
// Regional Airports
// ---------------------------------------------------------------------------

export interface RegionalAirport {
  /** Official IATA code */
  iataCode: string;
  /** Full official airport name */
  name: string;
  /** Short display name used in UI banners */
  shortName: string;
  /** City served */
  city: string;
  /**
   * Lowercase keyword aliases used for fuzzy address matching.
   * Include IATA code, common abbreviations, and partial address strings.
   */
  keywords: string[];
}

export const REGIONAL_AIRPORTS: readonly RegionalAirport[] = [
  {
    iataCode: 'STL',
    name: 'Lambert-St. Louis International Airport',
    shortName: 'Lambert Intl (STL)',
    city: 'St. Louis',
    keywords: [
      'stl',
      'lambert',
      'lambert airport',
      'lambert-st. louis',
      'lambert st louis',
      'st. louis international',
      'st louis international',
      'terminal 1',
      'terminal 2',
      'natural bridge ave',
    ],
  },
  {
    iataCode: 'SUS',
    name: 'Spirit of St. Louis Airport',
    shortName: 'Spirit of St. Louis (SUS)',
    city: 'Chesterfield',
    keywords: [
      'sus',
      'spirit of st. louis',
      'spirit of st louis',
      'spirit airport',
      'chesterfield airport',
      'spirit st louis',
    ],
  },
  {
    iataCode: 'CPS',
    name: 'St. Louis Downtown Airport',
    shortName: 'St. Louis Downtown (CPS)',
    city: 'Cahokia',
    keywords: [
      'cps',
      'st. louis downtown airport',
      'st louis downtown airport',
      'cahokia airport',
      'downtown airport',
      'parks airport',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Airport Detection
// ---------------------------------------------------------------------------

export interface AirportDetectionResult {
  /** Whether either address is an airport */
  isAirportTrip: boolean;
  /** Whether the pickup address matched an airport */
  isPickupAirport: boolean;
  /** Whether the dropoff address matched an airport */
  isDropoffAirport: boolean;
  /** The matched airport, if any */
  airport: RegionalAirport | null;
}

/**
 * Pure helper that determines whether either a pickup or dropoff address
 * corresponds to one of the supported regional airports.
 *
 * Matching is case-insensitive and keyword-based — no external API calls.
 */
export function detectAirportInAddresses(
  pickupAddress: string,
  dropoffAddress: string
): AirportDetectionResult {
  const pickupLower = pickupAddress.toLowerCase();
  const dropoffLower = dropoffAddress.toLowerCase();

  for (const airport of REGIONAL_AIRPORTS) {
    const matchesPickup = airport.keywords.some((kw) => pickupLower.includes(kw));
    const matchesDropoff = airport.keywords.some((kw) => dropoffLower.includes(kw));

    if (matchesPickup || matchesDropoff) {
      return {
        isAirportTrip: true,
        isPickupAirport: matchesPickup,
        isDropoffAirport: matchesDropoff,
        airport,
      };
    }
  }

  return {
    isAirportTrip: false,
    isPickupAirport: false,
    isDropoffAirport: false,
    airport: null,
  };
}

// ---------------------------------------------------------------------------
// Major Airlines
// ---------------------------------------------------------------------------

export interface Airline {
  /** IATA 2-letter carrier code */
  code: string;
  /** Full carrier name */
  name: string;
}

export const MAJOR_AIRLINES: readonly Airline[] = [
  { code: 'WN', name: 'Southwest Airlines' },
  { code: 'AA', name: 'American Airlines' },
  { code: 'DL', name: 'Delta Air Lines' },
  { code: 'UA', name: 'United Airlines' },
  { code: 'AS', name: 'Alaska Airlines' },
  { code: 'NK', name: 'Spirit Airlines' },
  { code: 'F9', name: 'Frontier Airlines' },
  { code: 'G4', name: 'Allegiant Air' },
  { code: 'B6', name: 'JetBlue Airways' },
  { code: 'HA', name: 'Hawaiian Airlines' },
  { code: 'SY', name: 'Sun Country Airlines' },
  { code: 'MX', name: 'Breeze Airways' },
  { code: 'OO', name: 'SkyWest Airlines' },
  { code: 'YX', name: 'Republic Airways' },
] as const;

/**
 * Airlines formatted as select options for the booking form dropdown.
 * Value is the IATA code; label is the full carrier name.
 */
export const AIRLINE_SELECT_OPTIONS = MAJOR_AIRLINES.map((airline) => ({
  value: airline.code,
  label: airline.name,
}));

// ---------------------------------------------------------------------------
// Vehicle Luggage Capacity
// ---------------------------------------------------------------------------

/**
 * Maximum number of standard bags that fit in each vehicle tier.
 * Used to trigger the luggage capacity warning when passenger bag count exceeds this limit.
 *
 * - standard:    2 bags (standard sedan trunk)
 * - premium:     3 bags (executive sedan / larger trunk)
 * - xl:          5 bags (minivan / SUV cargo area)
 * - wheelchair:  2 bags (WAV — cargo area partially used by ramp/tie-downs)
 */
export const VEHICLE_LUGGAGE_CAPACITY: Record<VehicleTier, number> = {
  standard: 2,
  premium: 3,
  xl: 5,
  wheelchair: 2,
};
