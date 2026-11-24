/**
 * Platform Phase 67 Automated Verification Suite
 * (`scripts/test-vehicles-places-flights-and-waivers-phase67.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildVehicleTypeFilterOptions, matchesSelectedVehicleTypes, resolveDriverVehicleTypeKey,
} from '../app/components/domain/dispatch/map/fleet-car-marker.util';
import {
  formatTripVehicleColumnDisplay, formatVehicleTier, formatVehicleTierDisplay,
} from '../app/core/utils/vehicle-tier-format.util';
import { sortQueueTripsByColumn } from '../app/core/hooks/dispatch/dispatch-workspace.util';
import {
  DEFAULT_SPECIAL_PLACES, DELETED_SPECIAL_PLACES_STORAGE_KEY, SpecialPlacesService,
  mergeSpecialPlacesWithDefaults, type SpecialPlace,
} from '../app/core/services/places/special-places.service';
import { buildStarredPlacesOverlayItems } from '../app/components/domain/dispatch/map/useLiveMapCustomOverlays';
import {
  MAJOR_AIRPORTS, extractAirportIataCode, formatAirportCodeCity,
  resolveAirportDisplayValue, searchAirportCatalog,
} from '../app/core/config/airport-catalog';
import { detectAirportEndpoint } from '../app/core/config/airports';
import {
  buildReturnLegSeedFromOutbound, shouldAutoEnableReturnFlightInfo,
} from '../app/core/hooks/booking/useReturnTripSync';
import { extractTripFlightCredentials } from '../app/core/services/flight/flight-status.service';
import { calculateTripPricing, DEFAULT_PRICING_CONFIG } from '../app/core/services/pricing';
import {
  BUILTIN_SURCHARGE_IDS, DEFAULT_SURCHARGES_CONFIG,
} from '../app/core/services/pricing/surcharges.service';
import { DEFAULT_UNIVERSAL_EXTRAS } from '../app/core/services/pricing/extras.service';
import { buildActiveWaivableFeeOptions } from '../app/components/domain/dispatch/booking/DispatchWaiveFeesDropdown';
import type { FleetCarConfig, VehicleTierConfig } from '../app/core/types/config';
import type { Trip } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();

function collectFiles(dir: string, extRegex: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, extRegex));
    else if (entry.isFile() && extRegex.test(entry.name)) results.push(full);
  }
  return results;
}

function makeTrip(id: string, overrides: Partial<Trip> = {}): Trip {
  const now = '2026-11-24T12:00:00.000Z';
  return {
    id, status: 'confirmed', offeredToIds: [], rejectedByIds: [], assignedDriverId: null,
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled', scheduledPickupTime: '2026-11-24T18:00:00.000Z',
    passenger: {
      firstName: 'Jordan', lastName: 'Reed', email: 'jordan@example.com',
      phone: '(314) 555-0192', passengerCount: 2, luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 10, distanceMiles: 18.5, durationMinutes: 24, distanceRate: 40, timeRate: 0,
      vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 50, totalFare: 54, currency: 'USD',
    },
    payment: { method: 'card', status: 'pending', amount: 54 },
    statusHistory: [], createdAt: now, updatedAt: now, ...overrides,
  };
}

function testActiveAdminVehiclesAndAnyAssignedDisplay(): void {
  console.log('1️⃣  Testing Active Admin Vehicles & "Any → <Assigned Tier>" display...');

  const adminVehicles: VehicleTierConfig[] = [
    { id: 'standard', name: 'Executive Sedan', baseMultiplier: 1, maxPassengers: 3, maxLuggage: 2, isActive: true },
    { id: 'compact-suv', name: 'Compact SUV', baseMultiplier: 1, maxPassengers: 4, maxLuggage: 3, isActive: true },
    { id: 'midsize-suv', name: 'Midsize SUV', baseMultiplier: 1.2, maxPassengers: 5, maxLuggage: 4, isActive: true },
    { id: 'minivan', name: 'Family Minivan', baseMultiplier: 1.3, maxPassengers: 6, maxLuggage: 5, isActive: true },
    { id: 'xl', name: 'Archived XL', baseMultiplier: 1.5, maxPassengers: 6, maxLuggage: 6, isArchived: true },
    { id: 'wheelchair', name: 'Inactive WAV', baseMultiplier: 1, maxPassengers: 4, maxLuggage: 2, isActive: false },
  ];

  const fleetCars: FleetCarConfig[] = [
    {
      id: 'car-201', unitNumber: 'Cab #201', vehicleTypeId: 'midsize-suv', make: 'Honda', model: 'Pilot',
      year: 2024, color: 'Black', licensePlate: 'MO-201', vin: 'MOCK_VIN_201', assignedDriverId: 'drv-201',
      mileage: 14000, status: 'active',
    },
  ];

  const fleet = [
    { id: 'drv-101', cabNumber: '101', tier: 'standard', mapStatus: 'available' as const },
    { id: 'drv-201', cabNumber: '201', tier: 'midsize-suv', mapStatus: 'available' as const },
    { id: 'drv-301', cabNumber: '301', vehicle: '2024 Toyota Sienna Minivan', mapStatus: 'en_route' as const },
  ];

  const filterOpts = buildVehicleTypeFilterOptions(fleet, fleetCars, adminVehicles);
  assert.deepEqual(filterOpts.map((o) => o.key), ['standard', 'compact-suv', 'midsize-suv', 'minivan']);
  assert.deepEqual(filterOpts.map((o) => o.label), ['Executive Sedan', 'Compact SUV', 'Midsize SUV', 'Family Minivan']);
  assert.equal(filterOpts.find((o) => o.key === 'standard')?.onShiftDriversCount, 1);
  assert.equal(filterOpts.find((o) => o.key === 'midsize-suv')?.onShiftDriversCount, 1);
  assert.equal(filterOpts.find((o) => o.key === 'minivan')?.onShiftDriversCount, 1);
  assert.equal(resolveDriverVehicleTypeKey(fleet[1], fleetCars, adminVehicles), 'midsize-suv');
  assert.equal(matchesSelectedVehicleTypes(fleet[1], ['midsize-suv'], fleetCars, adminVehicles), true);

  const fallbackOpts = buildVehicleTypeFilterOptions(fleet, fleetCars, []);
  assert.deepEqual(fallbackOpts.map((o) => o.key), ['sedan', 'suv', 'minivan', 'van', 'wheelchair_wav']);

  assert.equal(formatVehicleTier('standard', adminVehicles, 'Standard Sedan'), 'Executive Sedan');
  assert.equal(formatVehicleTierDisplay('standard', adminVehicles, 'standard'), 'Executive Sedan');

  const unassignedAnyTrip = makeTrip('trip-any-open', {
    vehicleTier: 'standard', assignedDriverId: null,
    metadata: { requestedAnyVehicle: true, vehicleTypeId: 'any' },
  });
  assert.equal(formatTripVehicleColumnDisplay(unassignedAnyTrip, adminVehicles, fleet, fleetCars), 'Any');

  const assignedAnyTrip = makeTrip('trip-any-assigned', {
    vehicleTier: 'standard', assignedDriverId: 'drv-201',
    metadata: { requestedAnyVehicle: true, vehicleTypeId: 'any' },
  });
  assert.equal(formatTripVehicleColumnDisplay(assignedAnyTrip, adminVehicles, fleet, fleetCars), 'Any → Midsize SUV');

  const sortedByVeh = sortQueueTripsByColumn(
    [assignedAnyTrip, unassignedAnyTrip],
    { column: 'vehicle', direction: 'asc' },
    { drivers: fleet, vehicles: adminVehicles, fleetCars }
  );
  assert.deepEqual(sortedByVeh.map((t) => t.id), ['trip-any-open', 'trip-any-assigned']);

  console.log('   ✅ Passed Active Admin Vehicles & "Any → Assigned" display checks.\n');
}

async function testSpecialPlacesNonClobberingMergeAndStarredOverlay(): Promise<void> {
  console.log('2️⃣  Testing SpecialPlacesService non-clobbering merge, tombstones & Starred overlay...');

  const singleStarredOverride: SpecialPlace = {
    ...DEFAULT_SPECIAL_PLACES[2], isPopular: true, notes: 'Starred in Admin Console',
  };
  const deletedTargetId = DEFAULT_SPECIAL_PLACES[1].id;
  const merged = mergeSpecialPlacesWithDefaults([singleStarredOverride], DEFAULT_SPECIAL_PLACES, [deletedTargetId]);

  assert.equal(merged.length, DEFAULT_SPECIAL_PLACES.length - 1);
  assert.equal(merged.some((p) => p.id === deletedTargetId), false);
  assert.equal(merged.find((p) => p.id === singleStarredOverride.id)?.notes, 'Starred in Admin Console');
  assert.equal(merged.some((p) => p.id === DEFAULT_SPECIAL_PLACES[0].id), true);

  const mockStore = new Map<string, string>();
  const origLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => { mockStore.set(k, String(v)); },
    removeItem: (k: string) => { mockStore.delete(k); },
    clear: () => { mockStore.clear(); },
  };

  try {
    const svc = new SpecialPlacesService();
    let notifyCount = 0;
    const unsub = svc.subscribe(() => { notifyCount += 1; });

    await svc.deletePlace(deletedTargetId);
    assert.ok(notifyCount >= 1);
    const storedDeleted = JSON.parse(mockStore.get(DELETED_SPECIAL_PLACES_STORAGE_KEY) || '[]');
    assert.ok(storedDeleted.includes(deletedTargetId));
    assert.equal(svc.getAllPlaces().some((p) => p.id === deletedTargetId), false);

    mockStore.set('chesterfield_taxi_special_places_v2', JSON.stringify([singleStarredOverride]));
    const reloadedSvc = new SpecialPlacesService();
    const afterSync = await reloadedSvc.syncWithFirestore();
    assert.equal(afterSync.length, DEFAULT_SPECIAL_PLACES.length - 1);
    assert.equal(afterSync.some((p) => p.id === deletedTargetId), false);
    unsub();
  } finally {
    if (origLocalStorage === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = origLocalStorage;
  }

  const samplePlaces: SpecialPlace[] = [
    { ...DEFAULT_SPECIAL_PLACES[0], id: 'p-starred', name: 'STL Starred', shortName: 'STL Starred', isActive: true, isPopular: true },
    { ...DEFAULT_SPECIAL_PLACES[1], id: 'p-unstarred', name: 'SUS Unstarred', shortName: 'SUS Unstarred', isActive: true, isPopular: false },
    { ...DEFAULT_SPECIAL_PLACES[2], id: 'p-inactive', name: 'Hotel Inactive', shortName: 'Hotel Inactive', isActive: false, isPopular: true },
    { ...DEFAULT_SPECIAL_PLACES[3], id: 'p-archived', name: 'Hospital Archived', shortName: 'Hospital Archived', isActive: true, isPopular: true, isArchived: true },
  ];
  const overlayItems = buildStarredPlacesOverlayItems(samplePlaces);
  assert.equal(overlayItems.length, 1);
  assert.equal(overlayItems[0].id, 'sp-p-starred');

  const overlayHookSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/map/useLiveMapCustomOverlays.ts'),
    'utf8'
  );
  assert.equal(overlayHookSrc.includes('getLocationCollections'), false);

  console.log('   ✅ Passed SpecialPlacesService merge, tombstones & Starred overlay checks.\n');
}

function testAirportCatalogComboboxAndAutoReturnFlight(): void {
  console.log('3️⃣  Testing YYZ Toronto Airport Catalog, Combobox wiring & Auto Return Flight...');

  assert.ok(MAJOR_AIRPORTS.length >= 100, `Expected >= 100 airports, got ${MAJOR_AIRPORTS.length}`);
  const yyz = MAJOR_AIRPORTS.find((a) => a.iata === 'YYZ');
  assert.ok(yyz);
  assert.equal(formatAirportCodeCity(yyz), 'YYZ Toronto');
  assert.equal(resolveAirportDisplayValue('yyz'), 'YYZ Toronto');
  assert.equal(resolveAirportDisplayValue('YYZ Toronto'), 'YYZ Toronto');

  assert.equal(extractAirportIataCode('YYZ Toronto'), 'YYZ');
  assert.equal(extractAirportIataCode('yyz'), 'YYZ');
  assert.equal(extractAirportIataCode('CYYZ'), 'YYZ');
  assert.equal(extractAirportIataCode('STL St. Louis'), 'STL');
  assert.equal(extractAirportIataCode('TEB Teterboro'), 'TEB');

  assert.equal(searchAirportCatalog('yy')[0].iata, 'YYZ');
  assert.equal(searchAirportCatalog('toronto')[0].iata, 'YYZ');
  assert.equal(searchAirportCatalog('pearson')[0].iata, 'YYZ');

  const creds = extractTripFlightCredentials(
    makeTrip('trip-yyz', { metadata: { airline: 'AC', flightNumber: '735', flightOrigin: 'YYZ Toronto' } })
  );
  assert.equal(creds.originIata, 'YYZ');

  assert.equal(detectAirportEndpoint('10701 Lambert International Blvd, St. Louis, MO 63145').isAirport, true);
  assert.equal(detectAirportEndpoint('Spirit of St. Louis Airport (SUS), Chesterfield, MO').isAirport, true);
  assert.equal(detectAirportEndpoint('123 Main St, Clayton, MO').isAirport, false);

  assert.equal(
    shouldAutoEnableReturnFlightInfo({ returnTrip: true, outboundDropoffAddress: 'Lambert Intl (STL)', manuallyDismissed: false }),
    true
  );
  assert.equal(
    shouldAutoEnableReturnFlightInfo({ returnTrip: true, outboundDropoffAddress: 'Lambert Intl (STL)', manuallyDismissed: true }),
    false
  );

  const seeded = buildReturnLegSeedFromOutbound(
    {
      pickupAddress: '16625 Swingley Ridge Rd, Chesterfield, MO',
      dropoffAddress: 'Lambert-St. Louis International Airport (STL)',
      passengers: 2, carryOnBags: 1, checkedBags: 1, bags: 2,
      hasOversizedLuggage: false, oversizedBags: {}, oversizedLuggageNotes: '',
      carSeats: false, rearFacingCount: 0, frontFacingCount: 0, boosterCount: 0,
      selectedVehicles: ['any'],
    },
    undefined,
    { returnFlightInfoDismissed: false }
  );
  assert.equal(seeded.returnProvideFlightInfo, true);

  for (const [relPath, expectedCount] of [
    ['app/components/domain/booking/FlightAssistanceCard.tsx', 2],
    ['app/components/domain/dispatch/booking/DispatchRoutingTimingSection.tsx', 2],
    ['app/components/domain/dispatch/booking/DispatchReturnRepeatSection.tsx', 2],
  ] as const) {
    const src = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
    assert.equal((src.match(/<AirportCityCombobox\b/g) || []).length, expectedCount);
  }

  console.log('   ✅ Passed AirportCityCombobox, catalog search & Auto Return Flight checks.\n');
}

function testDynamicWaiveFeesDropdownAndPricingMath(): void {
  console.log('4️⃣  Testing dynamic waivedSurchargeIds & waivedExtraKeys pricing math...');

  const testSurcharges = {
    ...DEFAULT_SURCHARGES_CONFIG,
    catalogVersion: 2 as const,
    items: [
      { id: BUILTIN_SURCHARGE_IDS.FUEL, name: 'Fuel / Gas Surcharge', enabled: true, defaultPolicy: 'universal' as const, mode: 'flat' as const, amount: 3.0, isBuiltIn: true },
      { id: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS, name: 'Airport Commercial Access Fee', enabled: true, defaultPolicy: 'universal' as const, mode: 'flat' as const, amount: 4.0, isBuiltIn: true },
      { id: 'surcharge-disabled-winter', name: 'Disabled Winter Fee', enabled: false, defaultPolicy: 'universal' as const, mode: 'flat' as const, amount: 8.0 },
    ],
  };

  const testExtras = {
    ...DEFAULT_UNIVERSAL_EXTRAS,
    carSeatFeePerUnit: 10.0,
    intermediateStopFee: 5.0,
    extraPassengerFeePerHead: 0,
    curbWaitingRatePerMinute: 0,
    oversizedBagsConfig: [{ id: 'golf', label: 'Golf Clubs', fee: 12.0, requiresUpgrade: false, maxCount: 4 }],
    customExtras: [
      { id: 'pet-vip', name: 'Pet Friendly Cabin', fee: 15.0, isPerUnit: false, isActive: true },
      { id: 'inactive-extra', name: 'Disabled Extra', fee: 20.0, isPerUnit: false, isActive: false },
    ],
  };

  const pricingCfg = {
    ...DEFAULT_PRICING_CONFIG,
    surchargesCatalog: testSurcharges,
    universalExtras: testExtras,
    namedPricingRules: [],
  };

  const baseInput = {
    distanceMiles: 10, durationMinutes: 20, isAirportPickup: true, intermediateStopsCount: 1,
    carSeatsBreakdown: { rearFacing: 1 }, oversizedBags: { golf: 1 }, selectedCustomExtras: { 'pet-vip': 1 },
  };

  const unwaived = calculateTripPricing(baseInput, pricingCfg);
  const activeCatalog = buildActiveWaivableFeeOptions({
    surchargesConfig: testSurcharges, universalExtrasConfig: testExtras, outboundPricing: unwaived.pricing,
  });

  assert.deepEqual(activeCatalog.surcharges.map((s) => s.key), [BUILTIN_SURCHARGE_IDS.FUEL, BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS]);
  assert.equal(activeCatalog.extras.some((e) => e.key === 'extra_passenger'), false);
  assert.equal(activeCatalog.extras.some((e) => e.key === 'curb_wait'), false);
  assert.equal(activeCatalog.extras.some((e) => e.key === 'custom:inactive-extra'), false);
  assert.ok(activeCatalog.extras.some((e) => e.key === 'car_seat' && e.liveAppliedAmount === 10));
  assert.ok(activeCatalog.extras.some((e) => e.key === 'custom:pet-vip' && e.liveAppliedAmount === 15));

  const waived = calculateTripPricing(
    {
      ...baseInput,
      waivedSurchargeIds: [BUILTIN_SURCHARGE_IDS.FUEL, BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS],
      waivedExtraKeys: ['car_seat', 'intermediate_stop', 'oversized_cargo', 'custom:pet-vip'],
    },
    pricingCfg
  );

  assert.equal(waived.pricing.totalFare, unwaived.pricing.totalFare - 49);
  const breakdown = waived.pricing.breakdown || [];
  assert.equal(Math.round(breakdown.reduce((sum, li) => sum + li.amount, 0) * 100) / 100, waived.pricing.totalFare);

  const waivedLines = breakdown.filter((li) => li.isWaived);
  assert.equal(waivedLines.length, 6);
  assert.ok(waivedLines.some((li) => li.label.includes('Fuel / Gas Surcharge (Waived)') && li.originalAmount === 3));
  assert.ok(waivedLines.some((li) => li.label.includes('Child Safety Seats (1) (Waived)') && li.originalAmount === 10));
  assert.ok(waivedLines.some((li) => li.label.includes('Pet Friendly Cabin (Waived)') && li.originalAmount === 15));

  console.log('   ✅ Passed dynamic Waive Fees catalog & pricing pipeline math.\n');
}

function testUiHygieneLineCeilingsAndImmutableFiles(): void {
  console.log('5️⃣  Testing 0 raw <select>, portal hygiene, line ceilings & immutable files...');

  const allTsx = collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/);
  assert.ok(allTsx.length >= 200);
  const selectOffenders = allTsx.filter((f) => /<select\b/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT_DIR, f));
  assert.deepEqual(selectOffenders, []);

  for (const rel of [
    'app/components/domain/booking/AirportCityCombobox.tsx',
    'app/components/domain/dispatch/booking/DispatchWaiveFeesDropdown.tsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    assert.ok(src.includes('createPortal') && src.includes('z-[99999]') && src.includes('coords !== null'));
    assert.equal(src.includes('type="checkbox"'), false);
  }

  assert.ok(fs.readFileSync(path.join(ROOT_DIR, 'app/components/domain/dispatch/booking/DispatchWaiveFeesDropdown.tsx'), 'utf8').includes('MenuCheckIndicator'));
  const paymentSecSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx'), 'utf8');
  assert.ok(paymentSecSrc.includes('<DispatchWaiveFeesDropdown'));
  assert.equal(paymentSecSrc.includes("label: 'Waive Airport Fee'"), false);

  const ceilings: Array<[string, number]> = [
    ['app/routes/dispatch.tsx', 1600],
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/components/domain/dispatch/queue/TripQueueTableView.tsx', 615],
    ['app/components/domain/dispatch/queue/TripQueueToolbar.tsx', 1150],
    ['app/components/domain/dispatch/DispatchBookingEngine.tsx', 1800],
    ['app/components/domain/BookingEngineV2.tsx', 1350],
    ['app/core/config/airport-catalog.ts', 320],
    ['app/components/domain/booking/AirportCityCombobox.tsx', 280],
    ['app/components/domain/dispatch/booking/DispatchWaiveFeesDropdown.tsx', 280],
    ['app/components/domain/dispatch/booking/waive-fees-catalog.util.ts', 420],
    ['app/components/domain/admin/trips/AdminTripsTablePanel.tsx', 420],
    ['app/components/domain/dispatch/map/useLiveMapCustomOverlays.ts', 430],
    ['scripts/test-vehicles-places-flights-and-waivers-phase67.ts', 420],
  ];

  for (const [rel, maxLines] of ceilings) {
    const abs = path.join(ROOT_DIR, rel);
    assert.equal(fs.existsSync(abs), true, `Missing expected file: ${rel}`);
    const count = fs.readFileSync(abs, 'utf8').split(/\r?\n/).length;
    assert.ok(count < maxLines, `${rel} exceeded line ceiling: ${count} >= ${maxLines}`);
  }

  const immutableDiff = execSync(
    'git status --porcelain firestore.rules vercel.json app/components/domain/dispatch/queue/DriverAssignDropdown.tsx',
    { cwd: ROOT_DIR, encoding: 'utf8' }
  ).trim();
  assert.equal(immutableDiff, '', `Immutable files modified: ${immutableDiff}`);

  console.log('   ✅ Passed 0 raw <select>, portal hygiene, line ceilings & immutable file checks.\n');
}

async function main(): Promise<void> {
  console.log('🚀 Running Platform Phase 67 Verification Suite...\n');
  testActiveAdminVehiclesAndAnyAssignedDisplay();
  await testSpecialPlacesNonClobberingMergeAndStarredOverlay();
  testAirportCatalogComboboxAndAutoReturnFlight();
  testDynamicWaiveFeesDropdownAndPricingMath();
  testUiHygieneLineCeilingsAndImmutableFiles();
  console.log('🎉 ALL PHASE 67 VERIFICATION ASSERTIONS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
