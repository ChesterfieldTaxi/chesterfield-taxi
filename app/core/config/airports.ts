/**
 * Airport Constants & Utilities
 *
 * Defines supported regional airports in the St. Louis / Chesterfield service area,
 * major commercial airline carriers, vehicle luggage capacities, and a pure
 * detection helper used to auto-detect airport trips in the booking wizard.
 *
 * All detection logic is pure (no side effects) per constitution.md constraints.
 */

import type { VehicleTier, TripStatus } from '../types';
import type {
  FlightPickupAlignment,
  FlightTelemetrySnapshot,
} from '../types/flight';

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
  /** Airport classification: commercial airline terminal vs private aviation / FBO */
  airportType: 'commercial' | 'private';
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
    airportType: 'commercial',
    keywords: [
      'stl',
      'lambert',
      'lambert airport',
      'lambert-st. louis',
      'lambert st louis',
      'lambert international',
      'lambert international blvd',
      'st. louis international',
      'st louis international',
      'terminal 1',
      'terminal 2',
      'natural bridge ave',
      '63145',
    ],
  },
  {
    iataCode: 'SUS',
    name: 'Spirit of St. Louis Airport',
    shortName: 'Spirit of St. Louis (SUS)',
    city: 'Chesterfield',
    airportType: 'private',
    keywords: [
      'sus',
      'spirit of st. louis',
      'spirit of st louis',
      'spirit airport',
      'chesterfield airport',
      'spirit st louis',
      'spirit dr',
      'spirit drive',
      'million air',
      'tac air',
      'premier jet',
      'signature flight support',
      'signature aviation',
      'fbo',
      'hangar',
      'executive air',
    ],
  },
  {
    iataCode: 'CPS',
    name: 'St. Louis Downtown Airport',
    shortName: 'St. Louis Downtown (CPS)',
    city: 'Cahokia',
    airportType: 'private',
    keywords: [
      'cps',
      'st. louis downtown airport',
      'st louis downtown airport',
      'cahokia airport',
      'downtown airport',
      'parks airport',
      'ideal aviation',
      'jet aviation',
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
  /** Whether the matched airport or address corresponds to private/charter aviation */
  isPrivateAviation: boolean;
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
  const pickupLower = (pickupAddress || '').toLowerCase();
  const dropoffLower = (dropoffAddress || '').toLowerCase();

  // Helper: use strict word-boundary matching for short IATA/acronym codes (e.g. "stl", "sus", "cps", "fbo")
  // so regular street/city names like "Castle", "Westlake", or "Sussex" never false-positive.
  const matchesKeyword = (text: string, kw: string): boolean => {
    if (!text) return false;
    if (kw.length <= 4) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    }
    return text.includes(kw);
  };

  // Check standalone private aviation keywords across both addresses
  const privateKeywords = [
    'signature flight support',
    'signature aviation',
    'million air',
    'tac air',
    'premier jet',
    'jet aviation',
    'hangar',
    'fbo',
    'general aviation',
    'private terminal',
  ];
  const hasPrivateKeyword = privateKeywords.some(
    (kw) => matchesKeyword(pickupLower, kw) || matchesKeyword(dropoffLower, kw)
  );

  for (const airport of REGIONAL_AIRPORTS) {
    const matchesPickup = airport.keywords.some((kw) => matchesKeyword(pickupLower, kw));
    const matchesDropoff = airport.keywords.some((kw) => matchesKeyword(dropoffLower, kw));

    if (matchesPickup || matchesDropoff) {
      const isPrivate = airport.airportType === 'private' || hasPrivateKeyword;
      return {
        isAirportTrip: true,
        isPickupAirport: matchesPickup,
        isDropoffAirport: matchesDropoff,
        airport,
        isPrivateAviation: isPrivate,
      };
    }
  }

  // If address has private aviation keywords even if no formal airport code matched
  if (hasPrivateKeyword) {
    const matchesPickup = privateKeywords.some((kw) => pickupLower.includes(kw));
    const matchesDropoff = privateKeywords.some((kw) => dropoffLower.includes(kw));
    return {
      isAirportTrip: true,
      isPickupAirport: matchesPickup,
      isDropoffAirport: matchesDropoff,
      airport: REGIONAL_AIRPORTS[1], // Default to SUS (Spirit of St. Louis)
      isPrivateAviation: true,
    };
  }

  return {
    isAirportTrip: false,
    isPickupAirport: false,
    isDropoffAirport: false,
    airport: null,
    isPrivateAviation: false,
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
  { code: 'AC', name: 'Air Canada' },
  { code: 'LH', name: 'Lufthansa' },
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
// Flight Ident Parsing, STL/SUS Terminal Intelligence & Pickup Drift Math
// ---------------------------------------------------------------------------

const ICAO_TO_IATA_CARRIER_MAP: Record<string, string> = {
  SWA: 'WN',
  AAL: 'AA',
  DAL: 'DL',
  UAL: 'UA',
  ASA: 'AS',
  NKS: 'NK',
  FFT: 'F9',
  ACA: 'AC',
  DLH: 'LH',
  AAY: 'G4',
  JBU: 'B6',
  HAL: 'HA',
  SCX: 'SY',
  MXY: 'MX',
  SKW: 'OO',
  RPA: 'YX',
  CFG: 'DE',
  ICE: 'FI',
};

const EXTENDED_AIRLINE_NAMES: Record<string, string> = {
  ...Object.fromEntries(MAJOR_AIRLINES.map((a) => [a.code, a.name])),
  DE: 'Condor',
  FI: 'Icelandair',
  WG: 'Sunwing Airlines',
  '9K': 'Cape Air',
  LF: 'Contour Airlines',
  BA: 'British Airways',
};

const STL_TERMINAL_2_CODES = new Set(['WN', 'LH', 'DE', 'FI', 'WG']);
const STL_TERMINAL_1_CODES = new Set([
  'AA',
  'DL',
  'UA',
  'AS',
  'NK',
  'F9',
  'AC',
  'OO',
  'YX',
  'G4',
  'B6',
  'HA',
  'SY',
  'MX',
  '9K',
  'LF',
]);

export interface ParsedFlightIdent {
  airlineCode: string;
  airlineName?: string;
  flightNumber: string;
  flightIdent: string;
  isValid: boolean;
}

export interface StlTerminalInfo {
  airportCode: 'STL' | 'SUS' | 'CPS';
  airlineCode?: string;
  airlineName?: string;
  terminal?: string;
  shortTerminal: string;
  pickupDoorGuidance: string;
  isPrivateFbo: boolean;
}

/**
 * Resolves a raw airline code or carrier name (e.g. "WN", "Southwest Airlines",
 * "Southwest Airlines (WN)", "SWA") to a normalized 2-character IATA carrier code.
 */
export function resolveAirlineCode(airlineCodeOrName?: string): {
  airlineCode: string;
  airlineName?: string;
} {
  const raw = (airlineCodeOrName || '').trim();
  if (!raw) return { airlineCode: '' };

  // Check parenthetical IATA code e.g. "Southwest Airlines (WN)"
  const parenMatch = raw.match(/\(([A-Z0-9]{2,3})\)\s*$/i);
  if (parenMatch) {
    const candidate = parenMatch[1].toUpperCase();
    const mapped = ICAO_TO_IATA_CARRIER_MAP[candidate] || candidate;
    if (/^[A-Z0-9]{2}$/.test(mapped)) {
      return {
        airlineCode: mapped,
        airlineName: EXTENDED_AIRLINE_NAMES[mapped] || raw.replace(/\s*\([A-Z0-9]{2,3}\)\s*$/i, '').trim(),
      };
    }
  }

  const upper = raw.toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(upper) && /[A-Z]/.test(upper)) {
    return {
      airlineCode: upper,
      airlineName: EXTENDED_AIRLINE_NAMES[upper],
    };
  }

  if (/^[A-Z]{3}$/.test(upper) && ICAO_TO_IATA_CARRIER_MAP[upper]) {
    const mapped = ICAO_TO_IATA_CARRIER_MAP[upper];
    return {
      airlineCode: mapped,
      airlineName: EXTENDED_AIRLINE_NAMES[mapped],
    };
  }

  const lower = raw.toLowerCase();
  for (const [code, name] of Object.entries(EXTENDED_AIRLINE_NAMES)) {
    const nameLower = name.toLowerCase();
    const firstWord = nameLower.split(/\s+/)[0];
    if (
      lower === nameLower ||
      nameLower.includes(lower) ||
      lower.includes(nameLower) ||
      (firstWord.length >= 5 && lower.includes(firstWord))
    ) {
      return { airlineCode: code, airlineName: name };
    }
  }

  return { airlineCode: '' };
}

/**
 * Normalizes flexible user/dispatcher inputs such as ("WN", "1425"),
 * ("Southwest Airlines", "1425"), or ("", "WN 1425") into a canonical IATA flight ident.
 */
export function parseFlightIdent(
  airlineInput?: string,
  flightNumberInput?: string
): ParsedFlightIdent {
  const rawAirline = (airlineInput || '').trim();
  const rawNumber = (flightNumberInput || '').trim();

  // Case 1: Combined ident supplied in either field (e.g. "WN1425", "WN 1425", "SWA-1425", "9K412")
  const combinedSource =
    rawAirline && !rawNumber
      ? rawAirline
      : /^[A-Za-z0-9]{2,3}[\s#-]*\d{1,4}$/.test(rawNumber)
      ? rawNumber
      : '';

  if (combinedSource) {
    const match = combinedSource
      .replace(/^#/, '')
      .trim()
      .match(/^([A-Za-z]{2,3}|\d[A-Za-z]|[A-Za-z]\d)[\s#-]*(\d{1,4})$/);
    if (match) {
      const prefixUpper = match[1].toUpperCase();
      const mappedCode = ICAO_TO_IATA_CARRIER_MAP[prefixUpper] || prefixUpper;
      const cleanDigits = match[2].replace(/^0+(?=\d)/, '');
      if (/^[A-Z0-9]{2}$/.test(mappedCode) && /^\d{1,4}$/.test(cleanDigits)) {
        return {
          airlineCode: mappedCode,
          airlineName: EXTENDED_AIRLINE_NAMES[mappedCode],
          flightNumber: cleanDigits,
          flightIdent: `${mappedCode}${cleanDigits}`,
          isValid: true,
        };
      }
    }
  }

  const resolved = resolveAirlineCode(rawAirline);
  let extractedDigits = rawNumber.replace(/^#/, '').trim();
  if (resolved.airlineCode && extractedDigits.toUpperCase().startsWith(resolved.airlineCode)) {
    extractedDigits = extractedDigits.slice(resolved.airlineCode.length).trim();
  }
  extractedDigits = extractedDigits.replace(/^[\s#-]+/, '');

  if (!/^\d{1,4}$/.test(extractedDigits)) {
    return {
      airlineCode: resolved.airlineCode,
      airlineName: resolved.airlineName,
      flightNumber: '',
      flightIdent: '',
      isValid: false,
    };
  }

  const cleanNumber = extractedDigits.replace(/^0+(?=\d)/, '');
  if (!resolved.airlineCode || !/^[A-Z0-9]{2}$/.test(resolved.airlineCode)) {
    return {
      airlineCode: '',
      airlineName: undefined,
      flightNumber: cleanNumber,
      flightIdent: '',
      isValid: false,
    };
  }

  return {
    airlineCode: resolved.airlineCode,
    airlineName: resolved.airlineName,
    flightNumber: cleanNumber,
    flightIdent: `${resolved.airlineCode}${cleanNumber}`,
    isValid: true,
  };
}

/**
 * Pure regional terminal & curbside exit door mapper for Lambert-St. Louis (STL),
 * Spirit of St. Louis (SUS), and St. Louis Downtown (CPS) airports.
 */
export function resolveStlTerminalInfo(
  airlineCodeOrName?: string,
  airportCode?: string
): StlTerminalInfo {
  const raw = (airlineCodeOrName || '').trim();
  const rawLower = raw.toLowerCase();
  const explicitAirport = (airportCode || '').trim().toUpperCase();

  if (
    explicitAirport === 'SUS' ||
    raw.toUpperCase() === 'SUS' ||
    rawLower.includes('spirit of st') ||
    rawLower.includes('signature') ||
    rawLower.includes('million air') ||
    rawLower.includes('tac air') ||
    rawLower.includes('premier jet')
  ) {
    return {
      airportCode: 'SUS',
      terminal: 'Private FBO',
      shortTerminal: 'SUS FBO',
      pickupDoorGuidance: 'Spirit of St. Louis (SUS) · Private FBO Ramp / Lobby Coordination',
      isPrivateFbo: true,
    };
  }

  if (
    explicitAirport === 'CPS' ||
    raw.toUpperCase() === 'CPS' ||
    rawLower.includes('downtown airport') ||
    rawLower.includes('jet aviation') ||
    rawLower.includes('ideal aviation')
  ) {
    return {
      airportCode: 'CPS',
      terminal: 'Private FBO',
      shortTerminal: 'CPS FBO',
      pickupDoorGuidance: 'St. Louis Downtown (CPS) · Private FBO Ramp / Lobby Coordination',
      isPrivateFbo: true,
    };
  }

  const { airlineCode, airlineName } = resolveAirlineCode(raw);

  if (
    STL_TERMINAL_2_CODES.has(airlineCode) ||
    rawLower.includes('southwest') ||
    rawLower.includes('lufthansa') ||
    rawLower.includes('terminal 2') ||
    rawLower === 't2'
  ) {
    return {
      airportCode: 'STL',
      airlineCode: airlineCode || undefined,
      airlineName,
      terminal: 'Terminal 2',
      shortTerminal: 'STL T2',
      pickupDoorGuidance: 'Terminal 2 · Baggage Claim Exit Door 12',
      isPrivateFbo: false,
    };
  }

  if (
    STL_TERMINAL_1_CODES.has(airlineCode) ||
    Boolean(airlineCode) ||
    rawLower.includes('terminal 1') ||
    rawLower === 't1'
  ) {
    return {
      airportCode: 'STL',
      airlineCode: airlineCode || undefined,
      airlineName,
      terminal: 'Terminal 1',
      shortTerminal: 'STL T1',
      pickupDoorGuidance: 'Terminal 1 · Lower Level Exit Door 6 / Door 12',
      isPrivateFbo: false,
    };
  }

  return {
    airportCode: 'STL',
    terminal: undefined,
    shortTerminal: 'STL',
    pickupDoorGuidance:
      'Terminal 1: Lower Level Exit Door 6 / Door 12 • Terminal 2 (Southwest / Lufthansa): Baggage Claim Exit Door 12',
    isPrivateFbo: false,
  };
}

/**
 * Pure helper evaluating whether a passenger's scheduled pickup time conflicts
 * with their flight's estimated landing or requires shifting due to >= 15m flight delay.
 */
export function evaluateFlightPickupAlignment(
  snapshot: FlightTelemetrySnapshot | null | undefined,
  scheduledPickupIso: string | null | undefined,
  options?: {
    bufferMinutesAfterArrival?: number;
    hasCheckedLuggage?: boolean;
    delayThresholdMinutes?: number;
  }
): FlightPickupAlignment {
  const bufferMinutes =
    options?.bufferMinutesAfterArrival ?? (options?.hasCheckedLuggage ? 25 : 20);
  const delayThreshold = options?.delayThresholdMinutes ?? 15;

  if (!snapshot) {
    return { aligned: true, conflict: 'none', driftMinutes: 0, bufferMinutes };
  }

  if (snapshot.status === 'cancelled') {
    return {
      aligned: false,
      conflict: 'flight_cancelled',
      driftMinutes: 0,
      bufferMinutes,
      message: `Flight ${snapshot.flightIdent} is marked CANCELLED. Verify alternate flight details with the passenger.`,
    };
  }

  if (!scheduledPickupIso) {
    return { aligned: true, conflict: 'none', driftMinutes: 0, bufferMinutes };
  }

  const pickupMs = Date.parse(scheduledPickupIso);
  if (!Number.isFinite(pickupMs)) {
    return { aligned: true, conflict: 'none', driftMinutes: 0, bufferMinutes };
  }

  const effectiveArrivalIso = snapshot.estimatedArrivalIso || snapshot.scheduledArrivalIso;
  if (effectiveArrivalIso) {
    const arrivalMs = Date.parse(effectiveArrivalIso);
    if (Number.isFinite(arrivalMs)) {
      const recommendedMs = arrivalMs + bufferMinutes * 60_000;
      const recommendedPickupIso = new Date(recommendedMs).toISOString();
      const driftMinutes = Math.max(0, Math.round((recommendedMs - pickupMs) / 60_000));

      // 1. Requested pickup time precedes estimated flight touchdown/gate arrival
      if (pickupMs < arrivalMs) {
        return {
          aligned: false,
          conflict: 'pickup_before_arrival',
          driftMinutes,
          recommendedPickupIso,
          effectiveArrivalIso,
          bufferMinutes,
          message: `Scheduled pickup is earlier than ${snapshot.flightIdent} arrival (+${bufferMinutes}m deplane/curb buffer recommended).`,
        };
      }

      // 2. Flight is delayed >= threshold AND pickup time leaves insufficient buffer (< arrival + buffer)
      const scheduledArrMs = snapshot.scheduledArrivalIso
        ? Date.parse(snapshot.scheduledArrivalIso)
        : NaN;
      const computedDelayMin = Number.isFinite(scheduledArrMs)
        ? Math.round((arrivalMs - scheduledArrMs) / 60_000)
        : snapshot.delayMinutes;
      const effectiveDelay = Math.max(snapshot.delayMinutes || 0, computedDelayMin || 0);

      if (effectiveDelay >= delayThreshold && pickupMs < recommendedMs) {
        return {
          aligned: false,
          conflict: 'significant_delay',
          driftMinutes,
          recommendedPickupIso,
          effectiveArrivalIso,
          bufferMinutes,
          message: `Flight ${snapshot.flightIdent} is delayed +${effectiveDelay}m. Recommend shifting pickup to ${bufferMinutes}m after new ETA.`,
        };
      }

      return {
        aligned: true,
        conflict: 'none',
        driftMinutes: 0,
        effectiveArrivalIso,
        bufferMinutes,
      };
    }
  }

  // Fallback when provider reports delayMinutes >= threshold without arrival ISO timestamps
  if ((snapshot.delayMinutes || 0) >= delayThreshold) {
    const recommendedMs = pickupMs + snapshot.delayMinutes * 60_000;
    return {
      aligned: false,
      conflict: 'significant_delay',
      driftMinutes: snapshot.delayMinutes,
      recommendedPickupIso: new Date(recommendedMs).toISOString(),
      bufferMinutes,
      message: `Flight ${snapshot.flightIdent} is delayed +${snapshot.delayMinutes}m.`,
    };
  }

  return { aligned: true, conflict: 'none', driftMinutes: 0, bufferMinutes };
}

// ---------------------------------------------------------------------------
// Phase 38.B: Flight Status Quota & Operational Window Eligibility Gate
// ---------------------------------------------------------------------------

export const FLIGHT_LOOKUP_FUTURE_WINDOW_MS = 24 * 3_600_000; // 24 hours before pickup
export const FLIGHT_LOOKUP_PAST_WINDOW_MS = 12 * 3_600_000; // 12 hours after pickup

export type FlightCheckBlockReason =
  | 'staff_only'
  | 'unconfirmed'
  | 'terminal_status'
  | 'outside_24h_window'
  | 'past_window';

export interface FlightCheckEligibilityInput {
  status?: TripStatus;
  bookingType?: 'asap' | 'scheduled';
  scheduledPickupTime?: string;
  isStaffContext?: boolean;
  nowMs?: number;
  maxWindowHours?: number;
}

export interface FlightCheckEligibilityResult {
  eligible: boolean;
  reason?: FlightCheckBlockReason;
  message?: string;
  unlocksAtIso?: string;
}

/**
 * Pure operational quota gate controlling when live aviation API lookups are permitted:
 * 1. Staff-only (`isStaffContext === true`).
 * 2. Never for `UNCONFIRMED` bookings or closed/terminal (`DECLINED` / `cancelled` / `completed`) trips.
 * 3. For scheduled rides, strictly within `[-12h, +maxWindowHours]` (default `24h`, clamped `2..72`) of `scheduledPickupTime`.
 */
export function evaluateFlightCheckEligibility(
  input: FlightCheckEligibilityInput,
  maxWindowHours?: number
): FlightCheckEligibilityResult {
  if (!input.isStaffContext) {
    return {
      eligible: false,
      reason: 'staff_only',
      message: 'Live flight status checks are restricted to Dispatch and Admin staff.',
    };
  }

  if (input.status === 'UNCONFIRMED' || input.status === 'unconfirmed') {
    return {
      eligible: false,
      reason: 'unconfirmed',
      message: 'Confirm booking first to enable live flight tracking.',
    };
  }

  if (
    input.status === 'DECLINED' ||
    input.status === 'declined' ||
    input.status === 'cancelled' ||
    input.status === 'completed'
  ) {
    return {
      eligible: false,
      reason: 'terminal_status',
      message: 'Live flight tracking is disabled for closed/completed trips.',
    };
  }

  const rawWindowHours = maxWindowHours ?? input.maxWindowHours;
  const effectiveWindowHours =
    typeof rawWindowHours === 'number' && Number.isFinite(rawWindowHours)
      ? Math.min(72, Math.max(2, Math.round(rawWindowHours)))
      : 24;
  const futureWindowMs = effectiveWindowHours * 3_600_000;

  if (input.bookingType !== 'asap' && input.scheduledPickupTime) {
    const pickupMs = Date.parse(input.scheduledPickupTime);
    if (Number.isFinite(pickupMs)) {
      const nowMs = input.nowMs ?? Date.now();
      if (pickupMs - nowMs > futureWindowMs) {
        return {
          eligible: false,
          reason: 'outside_24h_window',
          unlocksAtIso: new Date(pickupMs - futureWindowMs).toISOString(),
          message: `Live flight tracking unlocks within ${effectiveWindowHours} hours of scheduled pickup.`,
        };
      }
      if (nowMs - pickupMs > FLIGHT_LOOKUP_PAST_WINDOW_MS) {
        return {
          eligible: false,
          reason: 'past_window',
          message: 'Pickup window has passed (>12h ago); live flight lookup locked.',
        };
      }
    }
  }

  return { eligible: true };
}

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
