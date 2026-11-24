/**
 * Phase 63 Automated Verification Suite (`scripts/test-map-overlays-and-queue-polish-phase63.ts`)
 *
 * Verifies:
 * 1. `parseDispatchMapPreferences` & `serializeDispatchMapPreferences` + `normalizeDispatchConsoleConfig`:
 *    all 4 custom map overlays (`showZonesOverlay`, `showTrafficOverlay`, `showPlacesOverlay`,
 *    `showExclusionsOverlay`) default strictly to `false` and `selectedVehicleTypes` defaults to `[]`
 *    + round-trips deduplicated multi-select arrays cleanly + honors Admin fallback defaults when
 *    `localStorage` has no stored preference yet.
 * 2. Pure `resolveDriverVehicleTypeKey`, `matchesSelectedVehicleTypes` & `buildVehicleTypeFilterOptions`
 *    across empty selection (`[]` matches all), multi-selection (`['sedan', 'suv']` vs `'minivan'` /
 *    `'van'` / `'wheelchair_wav'`), and custom `VehicleTierConfig` IDs.
 * 3. `resolveTripFlightBadge`: commercial STL flights (`UA1402`, `WN1425`, delayed telemetry) return
 *    `hasFlight: true` (`STL T1` / `STL T2` / `Delayed`), while Spirit of St. Louis (`SUS`) & private
 *    aviation trips return `hasFlight: false` (zero `SUS FBO` badge!), while `resolveStlTerminalInfo`
 *    in `airports.ts` stays intact for SMS/email templates.
 * 4. `"Geofences"` -> `"Zones"` UI rename across `SUB_PAGES.zones[0].label === 'Zones'`, `AdminSidebar.tsx`,
 *    `admin.tsx`, `AdminZonesTab` + `app/components/domain/admin/zones/*`, `ModularTierCard.tsx`,
 *    `BookingRulesSimulatorCard.tsx`, `OperationalZone` alias in `zone.ts`, and `AdminAutoDispatchControlPanel.tsx`
 *    locked purple `✓ Always Authorized (Admin)` badge.
 * 5. `ModernDateTimePicker.tsx` uses `createPortal` (`document.body`, `z-[99999]`) + viewport clamping, and
 *    `TripQueueTableView.tsx` has zero `asapCreatedSubStr` rendering and strict max 2-line row cells.
 * 6. Static architecture & hygiene guardrails: line ceilings (`LiveFleetMap.tsx < 1,200`L,
 *    `app/components/domain/dispatch/map/* < 450`L, `useLiveMapCustomOverlays.ts < 430`L,
 *    `ModernDateTimePicker.tsx < 600`L, `TripQueueTableView.tsx < 620`L, `admin.tsx < 1,000`L,
 *    `dispatch.tsx < 1,600`L, `driver.tsx < 1,900`L, `AdminRulesTab.tsx < 350`L,
 *    `AdminOperatorsTab.tsx < 350`L, `AdminIntegrationsSubpage.tsx < 300`L), untouched `firestore.rules`
 *    & `vercel.json`, zero `"HUD Now"`, and zero bracketed driver status strings across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DISPATCH_MAP_PREFERENCES,
  parseDispatchMapPreferences,
  serializeDispatchMapPreferences,
} from '../app/core/hooks/dispatch/useDispatchMapPreferences';
import {
  DEFAULT_DISPATCH_CONSOLE_CONFIG,
  normalizeDispatchConsoleConfig,
  type FleetCarConfig,
  type VehicleTierConfig,
} from '../app/core/types/config';
import type { OperationalZone, ZoneGeofence } from '../app/core/types/zone';
import type { Trip } from '../app/core/types/trip';
import {
  buildVehicleTypeFilterOptions,
  matchesSelectedVehicleTypes,
  resolveDriverVehicleTypeKey,
} from '../app/components/domain/dispatch/map/fleet-car-marker.util';
import { resolveTripFlightBadge } from '../app/core/services/flight/flight-status.service';
import { resolveStlTerminalInfo } from '../app/core/config/airports';
import { SUB_PAGES } from '../app/core/utils/admin-nav.util';
import { ADMIN_NAV_GROUPS } from '../app/components/domain/admin/navigation/AdminSidebar';

const ROOT_DIR = process.cwd();

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function makeSampleTrip(overrides: Partial<Trip> = {}): Trip {
  const nowIso = '2026-11-23T20:00:00.000Z';
  return {
    id: 'trip-phase63-001',
    status: 'confirmed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    dropoffLocation: {
      address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6598, lng: -90.5732 },
    },
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-24T01:30:00.000Z',
    passenger: {
      firstName: 'Claire',
      lastName: 'Bennett',
      email: 'claire@example.com',
      phone: '(314) 555-0188',
      passengerCount: 2,
      luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5,
      distanceMiles: 19.2,
      durationMinutes: 25,
      distanceRate: 43.2,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 48.2,
      totalFare: 52.2,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 52.2,
    },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

function testMapPreferencesAndAdminDefaults(): void {
  console.log('1️⃣  Testing DispatchMapPreferences parser/serializer & Admin baseline defaults...');

  assert.equal(DEFAULT_DISPATCH_MAP_PREFERENCES.showZonesOverlay, false);
  assert.equal(DEFAULT_DISPATCH_MAP_PREFERENCES.showTrafficOverlay, false);
  assert.equal(DEFAULT_DISPATCH_MAP_PREFERENCES.showPlacesOverlay, false);
  assert.equal(DEFAULT_DISPATCH_MAP_PREFERENCES.showExclusionsOverlay, false);
  assert.deepEqual(DEFAULT_DISPATCH_MAP_PREFERENCES.selectedVehicleTypes, []);

  // Empty / null / malformed raw input defaults strictly to false for all 4 overlays & [] for vehicles
  for (const raw of [null, undefined, '', '{bad json', '[]', '42']) {
    const parsed = parseDispatchMapPreferences(raw);
    assert.equal(parsed.casedRouteWithArrows, true);
    assert.equal(parsed.interactiveRoutePinPopovers, true);
    assert.equal(parsed.showRouteSummaryPill, true);
    assert.equal(parsed.showZonesOverlay, false);
    assert.equal(parsed.showTrafficOverlay, false);
    assert.equal(parsed.showPlacesOverlay, false);
    assert.equal(parsed.showExclusionsOverlay, false);
    assert.deepEqual(parsed.selectedVehicleTypes, []);
  }

  // Legacy stored JSON without Phase 63 fields preserves route prefs and defaults custom overlays to false
  const legacyParsed = parseDispatchMapPreferences(
    JSON.stringify({ casedRouteWithArrows: false, showRouteSummaryPill: false })
  );
  assert.equal(legacyParsed.casedRouteWithArrows, false);
  assert.equal(legacyParsed.interactiveRoutePinPopovers, true);
  assert.equal(legacyParsed.showRouteSummaryPill, false);
  assert.equal(legacyParsed.showZonesOverlay, false);
  assert.equal(legacyParsed.showTrafficOverlay, false);
  assert.equal(legacyParsed.showPlacesOverlay, false);
  assert.equal(legacyParsed.showExclusionsOverlay, false);
  assert.deepEqual(legacyParsed.selectedVehicleTypes, []);

  // Round-trip multi-select vehicle types & custom overlays (normalizing case & deduplicating)
  const serialized = serializeDispatchMapPreferences({
    casedRouteWithArrows: true,
    interactiveRoutePinPopovers: false,
    showRouteSummaryPill: true,
    showZonesOverlay: true,
    showTrafficOverlay: false,
    showPlacesOverlay: true,
    showExclusionsOverlay: true,
    selectedVehicleTypes: ['Sedan', 'SUV', 'sedan', '  wheelchair_wav  ', ''],
  });
  const roundTripped = parseDispatchMapPreferences(serialized);
  assert.equal(roundTripped.showZonesOverlay, true);
  assert.equal(roundTripped.showTrafficOverlay, false);
  assert.equal(roundTripped.showPlacesOverlay, true);
  assert.equal(roundTripped.showExclusionsOverlay, true);
  assert.equal(roundTripped.interactiveRoutePinPopovers, false);
  assert.deepEqual(roundTripped.selectedVehicleTypes, ['sedan', 'suv', 'wheelchair_wav']);

  // Admin baseline defaults in DispatchConsoleSettingsConfig default strictly to false
  const defaultConsole = normalizeDispatchConsoleConfig(undefined);
  assert.equal(DEFAULT_DISPATCH_CONSOLE_CONFIG.defaultShowZonesOverlay, false);
  assert.equal(DEFAULT_DISPATCH_CONSOLE_CONFIG.defaultShowTrafficOverlay, false);
  assert.equal(DEFAULT_DISPATCH_CONSOLE_CONFIG.defaultShowPlacesOverlay, false);
  assert.equal(DEFAULT_DISPATCH_CONSOLE_CONFIG.defaultShowExclusionsOverlay, false);
  assert.equal(defaultConsole.defaultShowZonesOverlay, false);
  assert.equal(defaultConsole.defaultShowTrafficOverlay, false);
  assert.equal(defaultConsole.defaultShowPlacesOverlay, false);
  assert.equal(defaultConsole.defaultShowExclusionsOverlay, false);

  // Admin baseline defaults apply ONLY when localStorage has no stored boolean preference yet
  const customAdminDefaults = normalizeDispatchConsoleConfig({
    defaultShowZonesOverlay: true,
    defaultShowTrafficOverlay: true,
  });
  const unstoredWithAdminFallback = parseDispatchMapPreferences(null, customAdminDefaults);
  assert.equal(unstoredWithAdminFallback.showZonesOverlay, true);
  assert.equal(unstoredWithAdminFallback.showTrafficOverlay, true);
  assert.equal(unstoredWithAdminFallback.showPlacesOverlay, false);
  assert.equal(unstoredWithAdminFallback.showExclusionsOverlay, false);

  // Explicit operator stored false overrides Admin default true
  const operatorStoredOff = parseDispatchMapPreferences(
    serializeDispatchMapPreferences({
      ...DEFAULT_DISPATCH_MAP_PREFERENCES,
      showZonesOverlay: false,
      showTrafficOverlay: false,
    }),
    customAdminDefaults
  );
  assert.equal(operatorStoredOff.showZonesOverlay, false);
  assert.equal(operatorStoredOff.showTrafficOverlay, false);

  console.log('   ✅ Passed DispatchMapPreferences & Admin baseline defaults.\n');
}

function testVehicleTypeResolverAndMultiSelect(): void {
  console.log('2️⃣  Testing resolveDriverVehicleTypeKey & matchesSelectedVehicleTypes...');

  const fleetCars: FleetCarConfig[] = [
    {
      id: 'car-101',
      unitNumber: 'Car #101',
      vehicleTypeId: 'standard',
      make: 'Toyota',
      model: 'Camry Hybrid',
      year: 2024,
      color: 'Silver',
      licensePlate: 'MO-101',
      vin: 'VIN101',
      assignedDriverId: 'drv-sedan',
      mileage: 22000,
      status: 'active',
    },
    {
      id: 'car-104',
      unitNumber: 'Car #104',
      vehicleTypeId: 'xl',
      make: 'Chevrolet',
      model: 'Suburban LT',
      year: 2024,
      color: 'Black',
      licensePlate: 'MO-104',
      vin: 'VIN104',
      assignedDriverId: 'drv-suv',
      mileage: 18000,
      status: 'active',
    },
    {
      id: 'car-108',
      unitNumber: 'Car #108',
      vehicleTypeId: 'xl',
      make: 'Ford',
      model: 'Transit 350 Passenger Van',
      year: 2023,
      color: 'White',
      licensePlate: 'MO-108',
      vin: 'VIN108',
      assignedDriverId: 'drv-van',
      mileage: 35000,
      status: 'active',
    },
  ];

  const vehicleTiers: VehicleTierConfig[] = [
    {
      id: 'standard',
      name: 'Standard Sedan',
      baseMultiplier: 1,
      maxPassengers: 4,
      maxLuggage: 2,
      iconType: 'standard',
    },
    {
      id: 'xl',
      name: 'XL Minivan / SUV',
      baseMultiplier: 1.75,
      maxPassengers: 6,
      maxLuggage: 5,
      iconType: 'xl',
    },
    {
      id: 'exec_sprinter_vip',
      name: 'VIP Executive Limo',
      baseMultiplier: 2.5,
      maxPassengers: 8,
      maxLuggage: 8,
    },
  ];

  const sedanDriver = { id: 'drv-sedan', cabNumber: '101', vehicle: 'Car #101', tier: 'Standard', mapStatus: 'available' as const };
  const suvDriver = { id: 'drv-suv', cabNumber: '104', vehicle: 'Car #104', tier: 'XL', mapStatus: 'available' as const };
  const minivanDriver = { id: 'drv-minivan', cabNumber: '205', vehicle: '2024 Toyota Sienna Minivan', tier: 'Minivan', mapStatus: 'en_route' as const };
  const vanDriver = { id: 'drv-van', cabNumber: '108', vehicle: 'Car #108', tier: 'XL', mapStatus: 'busy' as const };
  const wavDriver = { id: 'drv-wav', cabNumber: '310', vehicle: 'BraunAbility Accessible Ramp WAV', tier: 'Wheelchair WAV', mapStatus: 'available' as const };
  const customTierDriver = { id: 'drv-vip', cabNumber: '900', vehicle: 'Car #900', tier: 'exec_sprinter_vip', mapStatus: 'available' as const };

  // Canonical fallback when vehicleTiers is empty/null
  assert.equal(resolveDriverVehicleTypeKey(sedanDriver, fleetCars, null), 'sedan');
  assert.equal(resolveDriverVehicleTypeKey(suvDriver, fleetCars, null), 'suv');
  assert.equal(resolveDriverVehicleTypeKey(minivanDriver, fleetCars, null), 'minivan');
  assert.equal(resolveDriverVehicleTypeKey(vanDriver, fleetCars, null), 'van');
  assert.equal(resolveDriverVehicleTypeKey(wavDriver, fleetCars, null), 'wheelchair_wav');
  assert.equal(resolveDriverVehicleTypeKey(customTierDriver, fleetCars, null), 'exec_sprinter_vip');

  // Active Admin vehicleTiers resolution maps cleanly onto configured tier IDs
  assert.equal(resolveDriverVehicleTypeKey(sedanDriver, fleetCars, vehicleTiers), 'standard');
  assert.equal(resolveDriverVehicleTypeKey(suvDriver, fleetCars, vehicleTiers), 'xl');
  assert.equal(resolveDriverVehicleTypeKey(customTierDriver, fleetCars, vehicleTiers), 'exec_sprinter_vip');

  // Empty selection ([]): all drivers match
  for (const d of [sedanDriver, suvDriver, minivanDriver, vanDriver, wavDriver, customTierDriver]) {
    assert.equal(matchesSelectedVehicleTypes(d, [], fleetCars, vehicleTiers), true);
  }

  // Multi-selection ['sedan', 'suv'] matches Sedan + SUV, excludes Minivan, Van, Wheelchair WAV
  const selectedSedanAndSuv = ['sedan', 'suv'];
  assert.equal(matchesSelectedVehicleTypes(sedanDriver, selectedSedanAndSuv, fleetCars, vehicleTiers), true);
  assert.equal(matchesSelectedVehicleTypes(suvDriver, selectedSedanAndSuv, fleetCars, vehicleTiers), true);
  assert.equal(matchesSelectedVehicleTypes(minivanDriver, selectedSedanAndSuv, fleetCars, vehicleTiers), false);
  assert.equal(matchesSelectedVehicleTypes(vanDriver, selectedSedanAndSuv, fleetCars, vehicleTiers), false);
  assert.equal(matchesSelectedVehicleTypes(wavDriver, selectedSedanAndSuv, fleetCars, vehicleTiers), false);

  // Selecting ['minivan', 'wheelchair_wav']
  const selectedMinivanAndWav = ['minivan', 'wheelchair_wav'];
  assert.equal(matchesSelectedVehicleTypes(minivanDriver, selectedMinivanAndWav, fleetCars, vehicleTiers), true);
  assert.equal(matchesSelectedVehicleTypes(wavDriver, selectedMinivanAndWav, fleetCars, vehicleTiers), true);
  assert.equal(matchesSelectedVehicleTypes(sedanDriver, selectedMinivanAndWav, fleetCars, vehicleTiers), false);
  assert.equal(matchesSelectedVehicleTypes(vanDriver, selectedMinivanAndWav, fleetCars, vehicleTiers), false);

  // Custom VehicleTierConfig ID selection
  assert.equal(matchesSelectedVehicleTypes(customTierDriver, ['exec_sprinter_vip'], fleetCars, vehicleTiers), true);
  assert.equal(matchesSelectedVehicleTypes(sedanDriver, ['exec_sprinter_vip'], fleetCars, vehicleTiers), false);

  // Canonical filter option catalog counts (when vehicleTiers is null)
  const canonicalOptions = buildVehicleTypeFilterOptions(
    [sedanDriver, suvDriver, minivanDriver, vanDriver, wavDriver, customTierDriver],
    fleetCars,
    null
  );
  assert.equal(canonicalOptions.find((o) => o.key === 'sedan')?.onShiftDriversCount, 1);
  assert.equal(canonicalOptions.find((o) => o.key === 'suv')?.onShiftDriversCount, 1);
  assert.equal(canonicalOptions.find((o) => o.key === 'minivan')?.onShiftDriversCount, 1);
  assert.equal(canonicalOptions.find((o) => o.key === 'van')?.onShiftDriversCount, 1);
  assert.equal(canonicalOptions.find((o) => o.key === 'wheelchair_wav')?.onShiftDriversCount, 1);
  assert.equal(canonicalOptions.find((o) => o.key === 'exec_sprinter_vip')?.onShiftDriversCount, 1);

  // Active Admin vehicleTiers filter option catalog builds strictly from active Admin entries
  const adminOptions = buildVehicleTypeFilterOptions(
    [sedanDriver, suvDriver, customTierDriver],
    fleetCars,
    vehicleTiers
  );
  assert.deepEqual(
    adminOptions.map((o) => o.key),
    ['standard', 'xl', 'exec_sprinter_vip']
  );
  assert.equal(adminOptions.find((o) => o.key === 'standard')?.onShiftDriversCount, 1);
  assert.equal(adminOptions.find((o) => o.key === 'xl')?.onShiftDriversCount, 1);
  assert.equal(adminOptions.find((o) => o.key === 'exec_sprinter_vip')?.onShiftDriversCount, 1);

  console.log('   ✅ Passed vehicle-type resolution & multi-select filtering.\n');
}

function testFlightBadgePrivateAviationSuppression(): void {
  console.log('3️⃣  Testing resolveTripFlightBadge (Commercial STL kept vs Private SUS FBO suppressed)...');

  // Commercial STL Terminal 1 (UA1402) -> hasFlight: true
  const uaTrip = makeSampleTrip({
    metadata: {
      airline: 'UA',
      flightNumber: '1402',
      airportIataCode: 'STL',
    },
  });
  const uaBadge = resolveTripFlightBadge(uaTrip);
  assert.equal(uaBadge.hasFlight, true);
  assert.match(uaBadge.label, /UA1402/);
  assert.match(uaBadge.label, /STL T1/);

  // Commercial STL Terminal 2 Delayed (WN1425) -> hasFlight: true, Delayed
  const wnDelayedTrip = makeSampleTrip({
    flightTelemetry: {
      flightIdent: 'WN1425',
      airlineCode: 'WN',
      airlineName: 'Southwest Airlines',
      flightNumber: '1425',
      serviceDate: '2026-11-23',
      originIata: 'DEN',
      destinationIata: 'STL',
      terminal: 'Terminal 2',
      status: 'delayed',
      delayMinutes: 35,
      provider: 'aerodatabox',
      isSimulatedFallback: false,
      checkedAt: '2026-11-23T20:00:00.000Z',
      cacheExpiresAt: '2026-11-23T20:15:00.000Z',
    },
  });
  const wnBadge = resolveTripFlightBadge(wnDelayedTrip);
  assert.equal(wnBadge.hasFlight, true);
  assert.equal(wnBadge.tone, 'amber');
  assert.match(wnBadge.shortLabel, /Delayed \+35m/);

  // Spirit of St. Louis (SUS) / Private Aviation FBO trips -> hasFlight: false (NO SUS FBO badge!)
  const susPickupTrip = makeSampleTrip({
    pickupLocation: {
      address: 'Spirit of St. Louis Airport (SUS), 18270 Edison Ave, Chesterfield, MO 63005',
      coordinates: { lat: 38.6622, lng: -90.6508 },
    },
    metadata: {
      isPrivateAviation: true,
      tailNumber: 'N450GX',
      fboFacility: 'Million Air',
    },
  });
  const susBadge = resolveTripFlightBadge(susPickupTrip);
  assert.equal(susBadge.hasFlight, false);
  assert.equal(susBadge.isPrivateAviation, true);
  assert.equal(susBadge.label, '');
  assert.equal(susBadge.shortLabel, '');

  const susAddressOnlyTrip = makeSampleTrip({
    pickupLocation: {
      address: '18260 Edison Ave, Spirit of St. Louis Airport (SUS), Chesterfield, MO 63005',
    },
  });
  const susAddrBadge = resolveTripFlightBadge(susAddressOnlyTrip);
  assert.equal(susAddrBadge.hasFlight, false);
  assert.equal(susAddrBadge.label, '');

  // Verify resolveStlTerminalInfo in airports.ts remains intact for SMS/email templates
  const susTermInfo = resolveStlTerminalInfo('Signature Aviation', 'SUS');
  assert.equal(susTermInfo.airportCode, 'SUS');
  assert.equal(susTermInfo.isPrivateFbo, true);

  console.log('   ✅ Passed commercial STL flight badges & SUS FBO badge suppression.\n');
}

function testZonesRenameAndAdminAuthorizedVisibility(): void {
  console.log('4️⃣  Testing "Geofences" -> "Zones" UI rename & Admin Authorized Dispatchers badge...');

  // Type alias check (compile-time + runtime structural check)
  const sampleOperationalZone: OperationalZone = {
    id: 'zone-test',
    name: 'Chesterfield Test Zone',
    type: 'radius',
    color: '#3b82f6',
    isActive: true,
  };
  const compatZone: ZoneGeofence = sampleOperationalZone;
  assert.equal(compatZone.id, 'zone-test');

  // Navigation sub-page & sidebar check
  assert.equal(SUB_PAGES.zones[0].key, 'zones');
  assert.equal(SUB_PAGES.zones[0].label, 'Zones');

  const zonesSidebarItem = ADMIN_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === 'zones');
  assert.ok(zonesSidebarItem);
  assert.equal(zonesSidebarItem.subHint, 'Zones, Places & Exclusions');

  // Verify zero user-facing "Geofences" / "Geofence" strings remain in target UI files
  const renameTargetFiles = [
    'app/core/utils/admin-nav.util.ts',
    'app/components/domain/admin/navigation/AdminSidebar.tsx',
    'app/routes/admin.tsx',
    'app/components/domain/admin/AdminZonesTab.tsx',
    'app/components/domain/admin/zones/ZoneDirectoryListPane.tsx',
    'app/components/domain/admin/zones/ZoneInspectorEditorPane.tsx',
    'app/components/domain/admin/zones/ZonePolygonMapCanvas.tsx',
    'app/components/domain/admin/zones/InteractiveZoneGoogleMap.tsx',
    'app/components/domain/admin/zones/useAdminZonesController.ts',
    'app/components/domain/admin/rules/ModularTierCard.tsx',
    'app/components/domain/admin/rules/BookingRulesSimulatorCard.tsx',
  ];

  for (const rel of renameTargetFiles) {
    const src = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    // Strip the backwards-compatible TypeScript type identifier `ZoneGeofence` before scanning UI text
    const stripped = src.replace(/ZoneGeofence/g, '');
    assert.equal(
      /geofence/i.test(stripped),
      false,
      `Found leftover "Geofence"/"Geofences" string in ${rel}`
    );
  }

  // Verify AdminAutoDispatchControlPanel lists admin operators with locked purple badge
  const autoDispatchPanelSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/admin/rules/AdminAutoDispatchControlPanel.tsx'),
    'utf8'
  );
  assert.ok(
    autoDispatchPanelSrc.includes('✓ Always Authorized (Admin)'),
    'AdminAutoDispatchControlPanel.tsx must render locked "✓ Always Authorized (Admin)" badge for admins'
  );

  console.log('   ✅ Passed "Zones" rename & Admin Authorized Dispatchers badge verification.\n');
}

function testPortalDateTimePickerAndTwoLineQueue(): void {
  console.log('5️⃣  Testing Portal ModernDateTimePicker & strict 2-line TripQueueTableView...');

  const pickerSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/ui/ModernDateTimePicker.tsx'),
    'utf8'
  );
  assert.ok(pickerSrc.includes('createPortal'), 'ModernDateTimePicker.tsx must use createPortal');
  assert.ok(pickerSrc.includes('document.body'), 'ModernDateTimePicker.tsx must portal to document.body');
  assert.ok(pickerSrc.includes('z-[99999]'), 'ModernDateTimePicker.tsx must render at z-[99999]');
  assert.ok(pickerSrc.includes("position: 'fixed'"), 'ModernDateTimePicker.tsx portal must use fixed positioning');

  const queueSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  assert.equal(
    queueSrc.includes('asapCreatedSubStr'),
    false,
    'TripQueueTableView.tsx must have zero asapCreatedSubStr rendering'
  );
  assert.equal(
    queueSrc.includes('whitespace-normal break-words'),
    false,
    'TripQueueTableView.tsx pickup/dropoff cells must use truncate instead of unbounded wrapping'
  );

  const toolbarSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/map/MapLayersAndVehiclesToolbar.tsx'),
    'utf8'
  );
  assert.ok(toolbarSrc.includes('createPortal'), 'MapLayersAndVehiclesToolbar.tsx must use createPortal');
  assert.ok(toolbarSrc.includes('z-[99999]'), 'MapLayersAndVehiclesToolbar.tsx must use z-[99999]');
  assert.equal(
    toolbarSrc.includes('left: 16'),
    false,
    'MapLayersAndVehiclesToolbar.tsx must initialize coords to null (not left: 16) so popover never flies in from far left'
  );
  assert.ok(
    toolbarSrc.includes('coords !== null'),
    'MapLayersAndVehiclesToolbar.tsx must guard portal mount on coords !== null'
  );
  assert.equal(
    toolbarSrc.includes('activeOverlayCount > 0 &&'),
    false,
    'MapLayersAndVehiclesToolbar.tsx must always render All Off (disabled when 0) so popover height never jumps'
  );
  assert.equal(
    toolbarSrc.includes('Layers (${') || toolbarSrc.includes('Vehicles (${'),
    false,
    'MapLayersAndVehiclesToolbar.tsx trigger buttons must keep fixed labels so HUD width never shifts on selection'
  );

  console.log('   ✅ Passed Portal Date/Time Picker & strict 2-line TripQueueTableView checks.\n');
}

function testArchitectureAndHygieneGuardrails(): void {
  console.log('6️⃣  Testing Monolith Line Ceilings, Immutable Files & Terminology Hygiene...');

  const ceilings: Array<[string, number]> = [
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/components/domain/dispatch/map/fleet-car-marker.util.ts', 450],
    ['app/components/domain/dispatch/map/useLiveMapCustomOverlays.ts', 430],
    ['app/components/domain/dispatch/map/MapCustomOverlayInfoCard.tsx', 450],
    ['app/components/domain/dispatch/map/MapLayersAndVehiclesToolbar.tsx', 430],
    ['app/components/ui/ModernDateTimePicker.tsx', 600],
    ['app/components/domain/dispatch/queue/TripQueueTableView.tsx', 620],
    ['app/routes/admin.tsx', 1000],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
    ['app/components/domain/admin/AdminRulesTab.tsx', 350],
    ['app/components/domain/admin/AdminOperatorsTab.tsx', 350],
    ['app/components/domain/admin/subpages/AdminIntegrationsSubpage.tsx', 300],
  ];

  for (const [relPath, maxLines] of ceilings) {
    const absPath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absPath), true, `Expected file to exist: ${relPath}`);
    const lineCount = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < maxLines,
      `${relPath} exceeded line ceiling: ${lineCount} >= ${maxLines}`
    );
  }

  // Ensure all Phase 63 / modular files in app/components/domain/dispatch/map/ (excluding pre-existing route-map-sync.ts) are < 450L
  const mapDir = path.join(ROOT_DIR, 'app/components/domain/dispatch/map');
  for (const file of collectTsFiles(mapDir)) {
    if (path.basename(file) === 'route-map-sync.ts') continue;
    const lineCount = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < 450,
      `${path.relative(ROOT_DIR, file)} exceeded 450L ceiling: ${lineCount}`
    );
  }

  // Immutable files untouched
  const gitStatusImmutable = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitStatusImmutable,
    '',
    `firestore.rules and vercel.json must remain untouched, got: ${gitStatusImmutable}`
  );

  // Strict UI & terminology scan across app/
  const appFiles = collectTsFiles(path.join(ROOT_DIR, 'app'));
  const forbiddenTokens = ['HUD Now', '[Avail]', '[En Route]', '[Busy]', '[Break]', '[Off]'];
  for (const file of appFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const token of forbiddenTokens) {
      assert.equal(
        src.includes(token),
        false,
        `Forbidden string "${token}" found in ${path.relative(ROOT_DIR, file)}`
      );
    }
  }

  console.log('   ✅ Passed all monolith line ceilings, immutable file & hygiene guardrails.\n');
}

function main(): void {
  console.log('🚀 Running Platform Phase 63 Custom Map Overlays, Vehicle Filter & Queue Polish Suite...\n');
  testMapPreferencesAndAdminDefaults();
  testVehicleTypeResolverAndMultiSelect();
  testFlightBadgePrivateAviationSuppression();
  testZonesRenameAndAdminAuthorizedVisibility();
  testPortalDateTimePickerAndTwoLineQueue();
  testArchitectureAndHygieneGuardrails();
  console.log('🎉 ALL PHASE 63 VERIFICATION ASSERTIONS PASSED!');
}

main();
