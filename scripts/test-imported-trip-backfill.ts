/**
 * Unit Tests for Imported Trip Location & Pricing Backfill Utility
 *
 * Run with:
 *   npx tsx scripts/test-imported-trip-backfill.ts
 */

import assert from 'node:assert/strict';
import {
  CANONICAL_STL_LOCATION,
  buildRouteDedupeKey,
  estimateBackfillPlan,
  executeBackfillPipeline,
  extractZipCodeFromAddress,
  hydrateImportedTrip,
  isEligibleImportedZeroFareTrip,
  resolveLocationLocally,
  selectEligibleTrips,
  type ResolvedAddressInfo,
} from '../app/core/services/booking/imported-trip-backfill.util';
import { DEFAULT_SPECIAL_PLACES } from '../app/core/services/places/special-places.service';
import type { Trip } from '../app/core/types/trip';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'tc_trip_test_1',
    status: 'confirmed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: { address: '16330 Copperwood Lane, Wildwood, MO 63040' },
    dropoffLocation: { address: 'Lambert AP (17, RENZ)' },
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-27T14:00:00.000Z',
    passenger: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+13145550101',
      passengerCount: 1,
      luggageCount: 1,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 0,
      distanceMiles: 0,
      durationMinutes: 0,
      distanceRate: 0,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 0,
      totalFare: 0,
      currency: 'USD',
    },
    payment: {
      method: 'cash',
      status: 'pending',
      amount: 0,
    },
    statusHistory: [],
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    metadata: { source: 'taxicaller_import' },
    ...overrides,
  };
}

async function runTests(): Promise<void> {
  console.log('Running Imported Trip Backfill unit tests...\n');

  // 1. Date cutoff filtering (> 2026-11-26T23:59:59.999 vs --after vs --all)
  const upcomingImported = makeTrip({
    id: 'trip_upcoming',
    scheduledPickupTime: '2026-11-27T10:00:00.000Z',
  });
  const historicalImported = makeTrip({
    id: 'trip_historical',
    scheduledPickupTime: '2026-11-26T12:00:00.000Z',
    status: 'completed',
  });
  const alreadyPriced = makeTrip({
    id: 'trip_priced',
    scheduledPickupTime: '2026-11-28T10:00:00.000Z',
    pricing: {
      ...makeTrip().pricing,
      totalFare: 48,
      subtotal: 48,
    },
  });
  const nonImportedWithCoords = makeTrip({
    id: 'trip_web_coords',
    scheduledPickupTime: '2026-11-28T10:00:00.000Z',
    pickupLocation: {
      address: '100 Main St, Chesterfield, MO 63017',
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    dropoffLocation: {
      address: 'Lambert STL',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    metadata: { source: 'web' },
  });
  const nonImportedMissingCoords = makeTrip({
    id: 'trip_web_missing_coords',
    scheduledPickupTime: '2026-11-28T10:00:00.000Z',
    metadata: { source: 'web' },
  });

  assert.equal(isEligibleImportedZeroFareTrip(upcomingImported), true);
  assert.equal(isEligibleImportedZeroFareTrip(historicalImported), false);
  assert.equal(isEligibleImportedZeroFareTrip(historicalImported, { all: true }), true);
  assert.equal(
    isEligibleImportedZeroFareTrip(historicalImported, { afterIso: '2026-11-25T00:00:00.000Z' }),
    true
  );
  assert.equal(isEligibleImportedZeroFareTrip(alreadyPriced), false);
  assert.equal(isEligibleImportedZeroFareTrip(nonImportedWithCoords), false);
  assert.equal(isEligibleImportedZeroFareTrip(nonImportedMissingCoords), true);

  const selectedDefault = selectEligibleTrips([
    upcomingImported,
    historicalImported,
    alreadyPriced,
    nonImportedWithCoords,
  ]);
  assert.deepEqual(
    selectedDefault.map((t) => t.id),
    ['trip_upcoming']
  );

  const selectedAllWithLimit = selectEligibleTrips(
    [upcomingImported, historicalImported, nonImportedMissingCoords],
    { all: true, limit: 2 }
  );
  assert.equal(selectedAllWithLimit.length, 2);

  // 2. ZIP code extraction & local landmark resolution
  assert.equal(
    extractZipCodeFromAddress('16330 Copperwood Lane, Wildwood, MO 63040, USA'),
    '63040',
    'Should not confuse 5-digit house number 16330 with ZIP code'
  );
  assert.equal(extractZipCodeFromAddress('63017'), '63017');
  assert.equal(extractZipCodeFromAddress('Lambert AP (17, RENZ)'), undefined);

  const stlResolved = resolveLocationLocally({ address: 'Lambert AP (17, RENZ)' });
  assert.ok(stlResolved);
  assert.equal(stlResolved.source, 'canonical_stl');
  assert.equal(stlResolved.placeId, CANONICAL_STL_LOCATION.placeId);
  assert.equal(stlResolved.zipCode, '63145');

  const spResolved = resolveLocationLocally(
    { address: 'Spirit Airport (SUS)' },
    { specialPlaces: DEFAULT_SPECIAL_PLACES }
  );
  assert.ok(spResolved);
  assert.equal(spResolved.source, 'special_place');
  assert.equal(spResolved.zipCode, '63005');

  const cpResolved = resolveLocationLocally(
    { address: '16330 Copperwood Lane, Wildwood, MO 63040' },
    {
      contactPlaces: [
        {
          address: '16330 Copperwood Lane, Wildwood, MO 63040',
          coordinates: { lat: 38.582, lng: -90.662 },
        },
      ],
    }
  );
  assert.ok(cpResolved);
  assert.equal(cpResolved.source, 'contact_place');
  assert.equal(cpResolved.zipCode, '63040');

  // 3. Address & route deduplication + dry-run estimate
  const dupTrip1 = makeTrip({
    id: 'dup_1',
    pickupLocation: { address: '16330 Copperwood Lane, Wildwood, MO 63040' },
    dropoffLocation: { address: 'Lambert AP (17, RENZ)' },
  });
  const dupTrip2 = makeTrip({
    id: 'dup_2',
    pickupLocation: { address: '  16330 Copperwood Lane,   Wildwood, MO 63040 ' },
    dropoffLocation: { address: 'Lambert AP (17, RENZ)' },
  });
  const dupTrip3 = makeTrip({
    id: 'dup_3',
    pickupLocation: { address: '1600 Clarkson Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: 'Lambert AP (17, RENZ)' },
  });

  const estimate = estimateBackfillPlan(
    [dupTrip1, dupTrip2, dupTrip3],
    [dupTrip1, dupTrip2, dupTrip3],
    { specialPlaces: DEFAULT_SPECIAL_PLACES }
  );
  assert.equal(estimate.selectedTripsCount, 3);
  assert.equal(estimate.uniqueAddressesToGeocode.length, 2, 'Duplicate address should be deduped');
  assert.equal(estimate.uniqueRoutesToCalculate.length, 2, 'Duplicate route should be deduped');
  assert.equal(estimate.estimatedGeocodingCalls, 2);
  assert.equal(estimate.estimatedDirectionsCalls, 2);
  assert.equal(estimate.estimatedTotalApiCalls, 4);

  assert.equal(
    buildRouteDedupeKey(' 100 Main St ', { lat: 38.7487, lng: -90.37 }),
    '100 main st -> 38.74870,-90.37000'
  );

  // 4. --max-api-calls guardrail & deduplicated execution
  let geocodeCalls = 0;
  let routeCalls = 0;
  const geocodeMock = async (address: string): Promise<ResolvedAddressInfo> => {
    geocodeCalls += 1;
    if (address.includes('Copperwood')) {
      return {
        coordinates: { lat: 38.582, lng: -90.662 },
        formattedAddress: '16330 Copperwood Ln, Wildwood, MO 63040, USA',
        placeId: 'place_copperwood_fixture',
        zipCode: '63040',
        source: 'geocoded',
      };
    }
    return {
      coordinates: { lat: 38.6512, lng: -90.5621 },
      formattedAddress: '1600 Clarkson Rd, Chesterfield, MO 63017, USA',
      placeId: 'place_clarkson_fixture',
      zipCode: '63017',
      source: 'geocoded',
    };
  };
  const routeMock = async () => {
    routeCalls += 1;
    return { distanceMiles: 22.5, durationMinutes: 28, isLiveGoogleResult: true };
  };

  // With maxApiCalls = 2:
  // dup_1 uses 1 geocode + 1 route = 2 calls -> hydrated.
  // dup_2 uses 0 geocode (cached) + 0 route (cached) -> hydrated!
  // dup_3 needs 1 geocode -> exceeds maxApiCalls=2 -> skipped!
  const cappedResult = await executeBackfillPipeline([dupTrip1, dupTrip2, dupTrip3], {
    localContext: { specialPlaces: DEFAULT_SPECIAL_PLACES },
    maxApiCalls: 2,
    nowIso: '2026-11-26T06:00:00.000Z',
    geocodeAddress: geocodeMock,
    calculateRoute: routeMock,
  });

  assert.equal(geocodeCalls, 1);
  assert.equal(routeCalls, 1);
  assert.equal(cappedResult.totalApiCallsMade, 2);
  assert.equal(cappedResult.hydratedTrips.length, 2);
  assert.equal(cappedResult.skippedDueToCapCount, 1);

  // 5. hydrateImportedTrip pricing & payment.amount preservation
  const hydratedZeroPayment = cappedResult.hydratedTrips[0];
  assert.ok(hydratedZeroPayment.pricing.totalFare > 0, 'Total fare should be hydrated > 0');
  assert.equal(hydratedZeroPayment.pricing.distanceMiles, 22.5);
  assert.equal(hydratedZeroPayment.pricing.durationMinutes, 28);
  assert.equal(
    hydratedZeroPayment.payment.amount,
    hydratedZeroPayment.pricing.totalFare,
    'payment.amount should be updated when initially 0'
  );
  assert.equal(hydratedZeroPayment.pickupLocation.zipCode, '63040');
  assert.equal(hydratedZeroPayment.dropoffLocation.zipCode, '63145');
  assert.equal(hydratedZeroPayment.dropoffLocation.placeId, 'canonical-lambert-stl');

  const tripWithExistingPayment = makeTrip({
    id: 'trip_nonzero_payment',
    payment: { method: 'card', status: 'authorized', amount: 55 },
  });
  const hydratedExistingPayment = hydrateImportedTrip(tripWithExistingPayment, {
    pickupResolved: {
      coordinates: { lat: 38.582, lng: -90.662 },
      formattedAddress: '16330 Copperwood Ln, Wildwood, MO 63040, USA',
      placeId: 'place_copperwood_fixture',
      zipCode: '63040',
      source: 'geocoded',
    },
    dropoffResolved: stlResolved,
    route: { distanceMiles: 22.5, durationMinutes: 28 },
    nowIso: '2026-11-26T06:00:00.000Z',
  });
  assert.ok(hydratedExistingPayment.pricing.totalFare > 0);
  assert.equal(
    hydratedExistingPayment.payment.amount,
    55,
    'payment.amount must NOT be overwritten when non-zero'
  );

  console.log('✅ All Imported Trip Backfill unit tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
