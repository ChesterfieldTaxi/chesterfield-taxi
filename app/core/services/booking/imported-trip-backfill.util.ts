/**
 * Imported Trip Location & Pricing Backfill Utility
 *
 * Pure deterministic helpers for:
 * - Filtering $0.00 imported TaxiCaller trips (or trips missing coordinates)
 * - Resolving known landmarks/airports and 5-digit ZIP codes locally before calling Google APIs
 * - Deduplicating unique addresses (Geocoding) and (origin -> destination) pairs (Directions)
 * - Estimating API calls for --dry-run cost guardrails
 * - Hydrating TripLocation + TripPricing via the canonical pricing pipeline
 */

import type { GeoPoint, Trip, TripLocation } from '../../types/trip';
import type { SpecialPlace } from '../places/special-places.service';
import type { RouteResponse } from '../maps/types';
import { createInitialContext, pipePricing, toTripPricing } from '../pricing/pipeline';
import { DEFAULT_PRICING_CONFIG } from '../pricing/rules';
import type { PricingConfig, PricingInput } from '../pricing/types';

export const DEFAULT_BACKFILL_AFTER_ISO = '2026-11-26T23:59:59.999';

export const CANONICAL_STL_LOCATION: TripLocation & { zipCode: string } = {
  address: 'St. Louis Lambert International Airport (STL)',
  formattedAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
  placeId: 'canonical-lambert-stl',
  zipCode: '63145',
  coordinates: { lat: 38.7487, lng: -90.37 },
};

const LAMBERT_MATCH_PATTERNS: RegExp[] = [
  /\blambert\s+ap\b/i,
  /\blambert\b.*\bairport\b/i,
  /\bst\.?\s*louis\s+lambert\b/i,
];

const AIRPORT_TRIP_PATTERN = /\b(lambert|stl|airport|spirit\s+of\s+st\.?\s*louis)\b/i;

export interface ContactSavedPlaceCandidate {
  address: string;
  formattedAddress?: string;
  placeId?: string;
  zipCode?: string;
  coordinates?: GeoPoint;
}

export interface ResolvedAddressInfo {
  coordinates: GeoPoint;
  formattedAddress?: string;
  placeId?: string;
  zipCode?: string;
  source: 'existing' | 'canonical_stl' | 'special_place' | 'contact_place' | 'geocoded';
}

export interface BackfillFilterOptions {
  all?: boolean;
  afterIso?: string;
  limit?: number;
}

export interface BackfillDeduplicatedRoute {
  key: string;
  origin: string | GeoPoint;
  destination: string | GeoPoint;
  originLabel: string;
  destinationLabel: string;
}

export interface BackfillDryRunEstimate {
  totalTripsScanned: number;
  eligibleTripsCount: number;
  selectedTripsCount: number;
  uniqueAddressesToGeocode: string[];
  uniqueRoutesToCalculate: BackfillDeduplicatedRoute[];
  locallyResolvedLocationsCount: number;
  estimatedGeocodingCalls: number;
  estimatedDirectionsCalls: number;
  estimatedTotalApiCalls: number;
}

export interface LocalResolutionContext {
  specialPlaces?: ReadonlyArray<SpecialPlace>;
  contactPlaces?: ReadonlyArray<ContactSavedPlaceCandidate>;
}

/**
 * Parses the cutoff timestamp for --after filtering.
 * Date-only strings (YYYY-MM-DD) are treated as end-of-day (23:59:59.999).
 */
export function parseBackfillCutoffMs(afterIso?: string): number {
  const raw = (afterIso || DEFAULT_BACKFILL_AFTER_ISO).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999` : raw;
  const ms = new Date(normalized).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid --after ISO date: "${afterIso}"`);
  }
  return ms;
}

/**
 * Returns true when a TripLocation already has non-zero finite coordinates.
 */
export function hasValidCoordinates(loc?: TripLocation | null): boolean {
  const coords = loc?.coordinates;
  if (!coords) return false;
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    (coords.lat !== 0 || coords.lng !== 0)
  );
}

/**
 * Normalizes an address string for case-insensitive deduplication and lookup.
 */
export function normalizeAddressKey(address?: string): string {
  return (address || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Extracts a 5-digit US ZIP code from an address string without mistaking
 * a leading 5-digit street number for a ZIP code.
 */
export function extractZipCodeFromAddress(address?: string): string | undefined {
  if (!address || typeof address !== 'string') return undefined;
  const trimmed = address.trim();
  if (!trimmed) return undefined;

  // 1. State + ZIP (e.g. "MO 63017" or "IL 62225-1234")
  const stateZipMatch = trimmed.match(/\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/i);
  if (stateZipMatch) {
    return stateZipMatch[1];
  }

  // 2. Trailing comma-separated ZIP (e.g. "..., 63017" or "..., 63017, USA")
  const trailingZipMatch = trimmed.match(/,\s*(\d{5})(?:-\d{4})?(?:\s*,\s*USA)?\s*$/i);
  if (trailingZipMatch) {
    return trailingZipMatch[1];
  }

  // 3. Standalone ZIP-only string
  const zipOnlyMatch = trimmed.match(/^(\d{5})(?:-\d{4})?$/);
  if (zipOnlyMatch) {
    return zipOnlyMatch[1];
  }

  return undefined;
}

/**
 * Returns true if a trip is an eligible $0.00 imported trip (or missing coordinates)
 * matching the configured date cutoff or --all override.
 */
export function isEligibleImportedZeroFareTrip(
  trip: Trip,
  options: BackfillFilterOptions = {}
): boolean {
  const totalFare = trip.pricing?.totalFare ?? 0;
  if (totalFare !== 0) {
    return false;
  }

  const isImported = trip.metadata?.source === 'taxicaller_import';
  const missingCoords =
    !hasValidCoordinates(trip.pickupLocation) || !hasValidCoordinates(trip.dropoffLocation);

  if (!isImported && !missingCoords) {
    return false;
  }

  if (!options.all) {
    if (!trip.scheduledPickupTime) {
      return false;
    }
    const scheduledMs = new Date(trip.scheduledPickupTime).getTime();
    if (!Number.isFinite(scheduledMs)) {
      return false;
    }
    const cutoffMs = parseBackfillCutoffMs(options.afterIso);
    if (scheduledMs <= cutoffMs) {
      return false;
    }
  }

  return true;
}

/**
 * Filters and deterministically sorts eligible trips, applying an optional --limit cap.
 */
export function selectEligibleTrips(
  trips: ReadonlyArray<Trip>,
  options: BackfillFilterOptions = {}
): Trip[] {
  const eligible = trips
    .filter((trip) => isEligibleImportedZeroFareTrip(trip, options))
    .sort((a, b) => {
      const aMs = a.scheduledPickupTime ? new Date(a.scheduledPickupTime).getTime() : 0;
      const bMs = b.scheduledPickupTime ? new Date(b.scheduledPickupTime).getTime() : 0;
      if (aMs !== bMs) return aMs - bMs;
      return a.id.localeCompare(b.id);
    });

  if (options.limit && options.limit > 0) {
    return eligible.slice(0, options.limit);
  }
  return eligible;
}

function isLambertMatch(loc?: TripLocation): boolean {
  if (!loc) return false;
  if (loc.placeId === CANONICAL_STL_LOCATION.placeId) return true;
  const text = `${loc.address || ''} ${loc.formattedAddress || ''}`;
  return LAMBERT_MATCH_PATTERNS.some((re) => re.test(text));
}

function isValidGeoPoint(coords?: GeoPoint | null): coords is GeoPoint {
  return Boolean(
    coords &&
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng) &&
      (coords.lat !== 0 || coords.lng !== 0)
  );
}

/**
 * Attempts to resolve a TripLocation locally using existing coordinates,
 * CANONICAL_STL_LOCATION, Firestore specialPlaces, or saved contact places.
 */
export function resolveLocationLocally(
  loc: TripLocation | undefined,
  context: LocalResolutionContext = {}
): ResolvedAddressInfo | null {
  if (!loc) return null;

  const existingZip =
    loc.zipCode ||
    extractZipCodeFromAddress(loc.formattedAddress) ||
    extractZipCodeFromAddress(loc.address);

  if (hasValidCoordinates(loc)) {
    return {
      coordinates: { ...loc.coordinates! },
      formattedAddress: loc.formattedAddress,
      placeId: loc.placeId,
      zipCode: existingZip,
      source: 'existing',
    };
  }

  if (isLambertMatch(loc)) {
    return {
      coordinates: { ...CANONICAL_STL_LOCATION.coordinates! },
      formattedAddress: CANONICAL_STL_LOCATION.formattedAddress,
      placeId: CANONICAL_STL_LOCATION.placeId,
      zipCode: CANONICAL_STL_LOCATION.zipCode,
      source: 'canonical_stl',
    };
  }

  const addrKey = normalizeAddressKey(loc.address);
  if (!addrKey) return null;

  for (const sp of context.specialPlaces || []) {
    if (!sp || !sp.isActive || sp.isArchived || !isValidGeoPoint(sp.coordinates)) continue;
    const candidates = [sp.address, sp.name, sp.shortName, ...(sp.aliases || [])]
      .map((s) => normalizeAddressKey(s))
      .filter(Boolean);
    if (candidates.includes(addrKey)) {
      return {
        coordinates: { ...sp.coordinates },
        formattedAddress: sp.address,
        placeId: sp.id,
        zipCode: sp.zip || extractZipCodeFromAddress(sp.address) || existingZip,
        source: 'special_place',
      };
    }
  }

  for (const cp of context.contactPlaces || []) {
    if (!cp || !isValidGeoPoint(cp.coordinates)) continue;
    const cpKeys = [cp.address, cp.formattedAddress]
      .map((s) => normalizeAddressKey(s))
      .filter(Boolean);
    if (cpKeys.includes(addrKey)) {
      return {
        coordinates: { ...cp.coordinates },
        formattedAddress: cp.formattedAddress || cp.address,
        placeId: cp.placeId,
        zipCode: cp.zipCode || extractZipCodeFromAddress(cp.formattedAddress || cp.address) || existingZip,
        source: 'contact_place',
      };
    }
  }

  return null;
}

function formatEndpointKey(endpoint: string | GeoPoint): string {
  if (typeof endpoint === 'string') {
    return normalizeAddressKey(endpoint);
  }
  return `${endpoint.lat.toFixed(5)},${endpoint.lng.toFixed(5)}`;
}

/**
 * Generates a deterministic deduplication key for a (origin -> destination) route pair.
 */
export function buildRouteDedupeKey(
  origin: string | GeoPoint,
  destination: string | GeoPoint
): string {
  return `${formatEndpointKey(origin)} -> ${formatEndpointKey(destination)}`;
}

/**
 * Builds a zero-API-call dry-run cost & deduplication estimate for selected trips.
 */
export function estimateBackfillPlan(
  allTrips: ReadonlyArray<Trip>,
  selectedTrips: ReadonlyArray<Trip>,
  localContext: LocalResolutionContext = {}
): BackfillDryRunEstimate {
  const geocodeAddressMap = new Map<string, string>();
  const uniqueRoutesMap = new Map<string, BackfillDeduplicatedRoute>();
  let locallyResolvedLocationsCount = 0;

  for (const trip of selectedTrips) {
    const pickupLocal = resolveLocationLocally(trip.pickupLocation, localContext);
    const dropoffLocal = resolveLocationLocally(trip.dropoffLocation, localContext);

    if (pickupLocal) {
      locallyResolvedLocationsCount += 1;
    } else if (trip.pickupLocation?.address?.trim()) {
      const key = normalizeAddressKey(trip.pickupLocation.address);
      if (!geocodeAddressMap.has(key)) {
        geocodeAddressMap.set(key, trip.pickupLocation.address.trim());
      }
    }

    if (dropoffLocal) {
      locallyResolvedLocationsCount += 1;
    } else if (trip.dropoffLocation?.address?.trim()) {
      const key = normalizeAddressKey(trip.dropoffLocation.address);
      if (!geocodeAddressMap.has(key)) {
        geocodeAddressMap.set(key, trip.dropoffLocation.address.trim());
      }
    }

    const originEndpoint: string | GeoPoint =
      pickupLocal?.coordinates ?? (trip.pickupLocation?.address?.trim() || '');
    const destEndpoint: string | GeoPoint =
      dropoffLocal?.coordinates ?? (trip.dropoffLocation?.address?.trim() || '');

    if (
      (typeof originEndpoint !== 'string' || originEndpoint.length > 0) &&
      (typeof destEndpoint !== 'string' || destEndpoint.length > 0)
    ) {
      const routeKey = buildRouteDedupeKey(originEndpoint, destEndpoint);
      if (!uniqueRoutesMap.has(routeKey)) {
        uniqueRoutesMap.set(routeKey, {
          key: routeKey,
          origin: originEndpoint,
          destination: destEndpoint,
          originLabel: trip.pickupLocation?.address || formatEndpointKey(originEndpoint),
          destinationLabel: trip.dropoffLocation?.address || formatEndpointKey(destEndpoint),
        });
      }
    }
  }

  const uniqueAddressesToGeocode = Array.from(geocodeAddressMap.values());
  const uniqueRoutesToCalculate = Array.from(uniqueRoutesMap.values());
  const estimatedGeocodingCalls = uniqueAddressesToGeocode.length;
  const estimatedDirectionsCalls = uniqueRoutesToCalculate.length;

  return {
    totalTripsScanned: allTrips.length,
    eligibleTripsCount: selectedTrips.length,
    selectedTripsCount: selectedTrips.length,
    uniqueAddressesToGeocode,
    uniqueRoutesToCalculate,
    locallyResolvedLocationsCount,
    estimatedGeocodingCalls,
    estimatedDirectionsCalls,
    estimatedTotalApiCalls: estimatedGeocodingCalls + estimatedDirectionsCalls,
  };
}

function applyResolvedLocation(
  original: TripLocation,
  resolved?: ResolvedAddressInfo | null
): TripLocation {
  if (!resolved) {
    const zipCode =
      original.zipCode ||
      extractZipCodeFromAddress(original.formattedAddress) ||
      extractZipCodeFromAddress(original.address);
    return zipCode ? { ...original, zipCode } : { ...original };
  }

  return {
    ...original,
    coordinates: { ...resolved.coordinates },
    formattedAddress: original.formattedAddress || resolved.formattedAddress,
    placeId: original.placeId || resolved.placeId,
    zipCode:
      original.zipCode ||
      resolved.zipCode ||
      extractZipCodeFromAddress(original.formattedAddress || resolved.formattedAddress || original.address),
  };
}

function isAirportLocation(loc: TripLocation): boolean {
  if (loc.placeId === CANONICAL_STL_LOCATION.placeId) return true;
  const text = `${loc.address || ''} ${loc.formattedAddress || ''}`;
  return AIRPORT_TRIP_PATTERN.test(text);
}

/**
 * Pure trip hydration helper that applies resolved TripLocation fields and
 * computes TripPricing via pipePricing + toTripPricing.
 * Updates payment.amount only when it is currently 0.
 */
export function hydrateImportedTrip(
  trip: Trip,
  params: {
    pickupResolved?: ResolvedAddressInfo | null;
    dropoffResolved?: ResolvedAddressInfo | null;
    route: Pick<RouteResponse, 'distanceMiles' | 'durationMinutes'>;
    pricingConfig?: PricingConfig;
    nowIso?: string;
  }
): Trip {
  const nowIso = params.nowIso || new Date().toISOString();
  const pickupLocation = applyResolvedLocation(trip.pickupLocation, params.pickupResolved);
  const dropoffLocation = applyResolvedLocation(trip.dropoffLocation, params.dropoffResolved);

  const isAirportPickup = isAirportLocation(pickupLocation);
  const isAirportDropoff = isAirportLocation(dropoffLocation);

  const pricingInput: PricingInput = {
    distanceMiles: params.route.distanceMiles,
    durationMinutes: params.route.durationMinutes,
    vehicleTier: trip.vehicleTier || 'standard',
    pickupDateTime: trip.scheduledPickupTime || trip.createdAt,
    isAirportPickup,
    isAirportDropoff,
    isAirportTrip: isAirportPickup || isAirportDropoff,
    pickupZipCode: pickupLocation.zipCode,
    dropoffZipCode: dropoffLocation.zipCode,
    corporateAccountId: trip.corporateAccountId,
    accountType: trip.corporateAccountId ? 'corporate' : 'retail',
    passengers: trip.passenger?.passengerCount ?? 1,
    intermediateStopsCount: trip.intermediateStops?.length ?? 0,
  };

  const config = params.pricingConfig ?? DEFAULT_PRICING_CONFIG;
  const finalContext = pipePricing(createInitialContext(pricingInput, config));
  const pricing = toTripPricing(finalContext);

  const currentPaymentAmount = trip.payment?.amount ?? 0;
  const nextPayment =
    currentPaymentAmount === 0
      ? { ...trip.payment, amount: pricing.totalFare }
      : { ...trip.payment };

  return {
    ...trip,
    pickupLocation,
    dropoffLocation,
    pricing,
    payment: nextPayment,
    updatedAt: nowIso,
    metadata: {
      ...(trip.metadata || {}),
      backfilledAt: nowIso,
    },
  };
}

export interface BackfillExecutionOptions {
  localContext?: LocalResolutionContext;
  pricingConfig?: PricingConfig;
  maxApiCalls?: number;
  nowIso?: string;
  geocodeAddress?: (address: string) => Promise<ResolvedAddressInfo | null>;
  calculateRoute?: (
    origin: string | GeoPoint,
    destination: string | GeoPoint
  ) => Promise<Pick<RouteResponse, 'distanceMiles' | 'durationMinutes' | 'isLiveGoogleResult'> | null>;
}

export interface BackfillExecutionResult {
  hydratedTrips: Trip[];
  skippedDueToCapCount: number;
  geocodingCallsMade: number;
  directionsCallsMade: number;
  totalApiCallsMade: number;
  uniqueAddressesGeocoded: number;
  uniqueRoutesCalculated: number;
}

/**
 * Executes deduplicated geocoding, route calculation, and trip hydration
 * while strictly enforcing the maxApiCalls guardrail.
 */
export async function executeBackfillPipeline(
  selectedTrips: ReadonlyArray<Trip>,
  options: BackfillExecutionOptions = {}
): Promise<BackfillExecutionResult> {
  const localContext = options.localContext ?? {};
  const maxApiCalls = options.maxApiCalls ?? Number.POSITIVE_INFINITY;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const geocodeCache = new Map<string, ResolvedAddressInfo | null>();
  const routeCache = new Map<
    string,
    Pick<RouteResponse, 'distanceMiles' | 'durationMinutes' | 'isLiveGoogleResult'> | null
  >();

  let geocodingCallsMade = 0;
  let directionsCallsMade = 0;
  let totalApiCallsMade = 0;
  let skippedDueToCapCount = 0;
  const hydratedTrips: Trip[] = [];

  const resolveOrGeocode = async (
    loc: TripLocation | undefined
  ): Promise<{ resolved: ResolvedAddressInfo | null; capExceeded: boolean }> => {
    const local = resolveLocationLocally(loc, localContext);
    if (local) return { resolved: local, capExceeded: false };

    const rawAddr = loc?.address?.trim();
    if (!rawAddr) return { resolved: null, capExceeded: false };

    const key = normalizeAddressKey(rawAddr);
    if (geocodeCache.has(key)) {
      return { resolved: geocodeCache.get(key) ?? null, capExceeded: false };
    }

    if (!options.geocodeAddress) {
      return { resolved: null, capExceeded: false };
    }

    if (totalApiCallsMade >= maxApiCalls) {
      return { resolved: null, capExceeded: true };
    }

    totalApiCallsMade += 1;
    geocodingCallsMade += 1;
    const geocoded = await options.geocodeAddress(rawAddr);
    geocodeCache.set(key, geocoded);
    return { resolved: geocoded, capExceeded: false };
  };

  for (const trip of selectedTrips) {
    const pickupRes = await resolveOrGeocode(trip.pickupLocation);
    if (pickupRes.capExceeded) {
      skippedDueToCapCount += 1;
      continue;
    }

    const dropoffRes = await resolveOrGeocode(trip.dropoffLocation);
    if (dropoffRes.capExceeded) {
      skippedDueToCapCount += 1;
      continue;
    }

    const originEndpoint: string | GeoPoint =
      pickupRes.resolved?.coordinates ?? (trip.pickupLocation?.address?.trim() || '');
    const destEndpoint: string | GeoPoint =
      dropoffRes.resolved?.coordinates ?? (trip.dropoffLocation?.address?.trim() || '');

    if (
      (typeof originEndpoint === 'string' && !originEndpoint) ||
      (typeof destEndpoint === 'string' && !destEndpoint)
    ) {
      skippedDueToCapCount += 1;
      continue;
    }

    const routeKey = buildRouteDedupeKey(originEndpoint, destEndpoint);
    let route = routeCache.get(routeKey);

    if (route === undefined) {
      if (!options.calculateRoute) {
        route = null;
      } else if (totalApiCallsMade >= maxApiCalls) {
        skippedDueToCapCount += 1;
        continue;
      } else {
        totalApiCallsMade += 1;
        directionsCallsMade += 1;
        route = await options.calculateRoute(originEndpoint, destEndpoint);
        routeCache.set(routeKey, route);
      }
    }

    if (!route || !Number.isFinite(route.distanceMiles) || route.distanceMiles <= 0) {
      skippedDueToCapCount += 1;
      continue;
    }

    const hydrated = hydrateImportedTrip(trip, {
      pickupResolved: pickupRes.resolved,
      dropoffResolved: dropoffRes.resolved,
      route,
      pricingConfig: options.pricingConfig,
      nowIso,
    });
    hydratedTrips.push(hydrated);
  }

  return {
    hydratedTrips,
    skippedDueToCapCount,
    geocodingCallsMade,
    directionsCallsMade,
    totalApiCallsMade,
    uniqueAddressesGeocoded: geocodeCache.size,
    uniqueRoutesCalculated: routeCache.size,
  };
}
