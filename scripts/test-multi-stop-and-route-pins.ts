import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Trip } from '../app/core/types/trip';
import {
  ROUTE_WAYPOINT_PIN_ANCHOR_X,
  ROUTE_WAYPOINT_PIN_ANCHOR_Y,
  ROUTE_WAYPOINT_PIN_HEIGHT,
  ROUTE_WAYPOINT_PIN_WIDTH,
  buildRouteWaypointPinDataUrl,
  buildTripItineraryTooltip,
  formatShortStopPreview,
  getTripIntermediateStopCount,
  getTripIntermediateStops,
} from '../app/core/utils/route-markers.util';
import {
  DEFAULT_DISPATCH_MAP_PREFERENCES,
  DISPATCH_MAP_PREFS_STORAGE_KEY,
  parseDispatchMapPreferences,
  serializeDispatchMapPreferences,
} from '../app/core/hooks/dispatch/useDispatchMapPreferences';
import { filterDispatchQueueTrips } from '../app/core/hooks/dispatch/dispatch-workspace.util';
import {
  extractDirectionsRouteSnapshot,
  resolveActiveRouteContext,
} from '../app/components/domain/dispatch/map/route-map-sync';

function decodeSvgDataUrl(dataUrl: string): string {
  const prefix = 'data:image/svg+xml;charset=UTF-8,';
  assert.ok(dataUrl.startsWith(prefix), `Expected SVG data URL prefix, got: ${dataUrl.slice(0, 40)}`);
  return decodeURIComponent(dataUrl.slice(prefix.length));
}

function buildSampleTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_phase49_sample_01',
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-23T14:30:00.000Z',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: {
      address: '14848 Conway Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6531, lng: -90.5341 },
      notes: 'Front porte-cochere',
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
      driverNotes: 'Southwest Departures Door 2',
    },
    passenger: {
      firstName: 'Elena',
      lastName: 'Vance',
      email: 'elena@example.com',
      phone: '(314) 555-0192',
      passengerCount: 2,
      luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 15,
      distanceMiles: 19.4,
      durationMinutes: 26,
      distanceRate: 2.5,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 68.5,
      totalFare: 68.5,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'authorized',
      amount: 68.5,
    },
    statusHistory: [],
    createdAt: '2026-11-22T18:00:00.000Z',
    updatedAt: '2026-11-22T18:00:00.000Z',
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 49: Multi-Stop Queue Indicators, Route Teardrop Pins & Map Preferences Suite ===');

  // 1. Teardrop Waypoint SVG Pin Builder Verification
  assert.equal(ROUTE_WAYPOINT_PIN_WIDTH, 34);
  assert.equal(ROUTE_WAYPOINT_PIN_HEIGHT, 42);
  assert.equal(ROUTE_WAYPOINT_PIN_ANCHOR_X, 17);
  assert.equal(ROUTE_WAYPOINT_PIN_ANCHOR_Y, 40);

  const pickupUrl = buildRouteWaypointPinDataUrl({ kind: 'pickup' });
  const stop1Url = buildRouteWaypointPinDataUrl({ kind: 'stop', stopNumber: 1 });
  const stop2Url = buildRouteWaypointPinDataUrl({ kind: 'stop', stopNumber: 2 });
  const stop3Url = buildRouteWaypointPinDataUrl({ kind: 'stop', stopNumber: 3 });
  const dropoffUrl = buildRouteWaypointPinDataUrl({ kind: 'dropoff' });
  const stop2SelectedUrl = buildRouteWaypointPinDataUrl({
    kind: 'stop',
    stopNumber: 2,
    isSelected: true,
  });

  const uniqueUrls = new Set([
    pickupUrl,
    stop1Url,
    stop2Url,
    stop3Url,
    dropoffUrl,
    stop2SelectedUrl,
  ]);
  assert.equal(uniqueUrls.size, 6, 'Each waypoint kind, stop number, and selection state must produce a distinct data URL');

  // Cache hit determinism
  assert.equal(
    buildRouteWaypointPinDataUrl({ kind: 'stop', stopNumber: 2, isSelected: true }),
    stop2SelectedUrl,
    'Memoized cache must return identical data URL string on repeated calls'
  );

  const pickupSvg = decodeSvgDataUrl(pickupUrl);
  assert.ok(pickupSvg.includes('width="34" height="42"'), 'Pickup SVG must be 34x42');
  assert.ok(pickupSvg.includes('17 40'), 'Teardrop SVG bottom tip must anchor at (17, 40)');
  assert.ok(pickupSvg.includes('#10b981') && pickupSvg.includes('#047857'), 'Pickup SVG must use Emerald #10b981 / #047857');
  assert.ok(pickupSvg.includes('<circle cx="17" cy="16" r="4.8" fill="#ffffff"/>'), 'Pickup SVG must render inner white circle dot');

  const stop1Svg = decodeSvgDataUrl(stop1Url);
  const stop2Svg = decodeSvgDataUrl(stop2Url);
  const stop3Svg = decodeSvgDataUrl(stop3Url);
  assert.ok(stop1Svg.includes('#f59e0b') && stop1Svg.includes('#b45309'), 'Stop SVG must use Amber #f59e0b / #b45309');
  assert.ok(stop1Svg.includes('>1</text>'), 'Stop 1 SVG must render exact number 1');
  assert.ok(stop2Svg.includes('>2</text>'), 'Stop 2 SVG must render exact number 2');
  assert.ok(stop3Svg.includes('>3</text>'), 'Stop 3 SVG must render exact number 3');

  const clampedHighStopSvg = decodeSvgDataUrl(
    buildRouteWaypointPinDataUrl({ kind: 'stop', stopNumber: 145 })
  );
  assert.ok(clampedHighStopSvg.includes('>99</text>'), 'Stop numbers > 99 must clamp safely to 99');

  const dropoffSvg = decodeSvgDataUrl(dropoffUrl);
  assert.ok(dropoffSvg.includes('#ef4444') && dropoffSvg.includes('#b91c1c'), 'Dropoff SVG must use Rose #ef4444 / #b91c1c');
  assert.ok(dropoffSvg.includes('<rect x="12.5" y="11.5" width="9" height="9" rx="2.1" fill="#ffffff"/>'), 'Dropoff SVG must render inner white rounded square');

  const stop2SelectedSvg = decodeSvgDataUrl(stop2SelectedUrl);
  assert.ok(
    stop2SelectedSvg.includes('r="15.2"') && !stop2Svg.includes('r="15.2"'),
    'Selected pin variant must render outer halo ring around pin head'
  );
  console.log('✓ 1. Teardrop SVG pins verified (Pickup #10b981, Stop #f59e0b 1..N, Dropoff #ef4444, halo & cache)');

  // 2. Multi-stop Trip Helpers Verification
  const directTrip = buildSampleTrip();
  assert.equal(getTripIntermediateStops(directTrip).length, 0);
  assert.equal(getTripIntermediateStopCount(directTrip), 0);

  const multiStopTrip = buildSampleTrip({
    id: 'trip_phase49_multistop',
    intermediateStops: [
      {
        address: 'Chesterfield Mall, 291 Chesterfield Center, Chesterfield, MO 63017',
        coordinates: { lat: 38.6535, lng: -90.5612 },
        notes: 'Wait by Macy entrance',
      },
      { address: '   ' }, // blank entry should be ignored cleanly
      {
        address: 'Mercy Hospital St. Louis, 615 S New Ballas Rd, St. Louis, MO 63141',
        coordinates: { lat: 38.6442, lng: -90.4437 },
      },
    ],
  });
  const validStops = getTripIntermediateStops(multiStopTrip);
  assert.equal(validStops.length, 2, 'Blank intermediate stops must be filtered out');
  assert.equal(getTripIntermediateStopCount(multiStopTrip), 2);
  assert.equal(formatShortStopPreview(validStops[0].address), 'Chesterfield Mall');
  assert.equal(formatShortStopPreview(validStops[1].address), 'Mercy Hospital St. Louis');
  assert.equal(
    formatShortStopPreview('12345 Extremely Long Corporate Campus Boulevard Suite 900, Clayton, MO', 24),
    '12345 Extremely Long Co…'
  );

  const summaryOnlyStopTrip = buildSampleTrip({
    id: 'trip_phase49_summary_only',
    intermediateStops: [],
    pricing: {
      ...directTrip.pricing,
      intermediateStopsCount: 3,
    },
  });
  assert.equal(
    getTripIntermediateStopCount(summaryOnlyStopTrip),
    3,
    'Must fall back to pricing.intermediateStopsCount when concrete stop addresses are omitted'
  );

  const tooltip = buildTripItineraryTooltip(multiStopTrip);
  assert.equal(
    tooltip,
    [
      'Pickup: 14848 Conway Rd, Chesterfield, MO 63017',
      'Stop 1: Chesterfield Mall, 291 Chesterfield Center, Chesterfield, MO 63017',
      'Stop 2: Mercy Hospital St. Louis, 615 S New Ballas Rd, St. Louis, MO 63141',
      'Dropoff: 10701 Lambert International Blvd, St. Louis, MO 63145',
    ].join('\n')
  );
  console.log('✓ 2. Multi-stop helpers verified (concrete stops, pricing count fallback, preview & itinerary tooltip)');

  // 3. Queue Filter (`has_stops`) & Stop Search Verification
  const baseFilterInput = {
    trips: [directTrip, multiStopTrip, summaryOnlyStopTrip],
    statusFilter: 'all',
    pillFilter: 'all' as const,
    dateTimeRange: {
      startDate: '',
      endDate: '',
      startTime: { hour: '12', minute: '00', period: 'AM' as const },
      endTime: { hour: '11', minute: '59', period: 'PM' as const },
      presetKey: 'all_time' as const,
    },
    filterStartDate: '',
    filterEndDate: '',
    activeFilterKeys: ['has_stops' as const],
    selectedDriverFilter: 'all',
    selectedVehicleFilter: 'all',
    selectedTariffFilter: 'all',
    selectedCompanyFilter: 'all',
    selectedPaymentFilter: 'all',
    searchTerm: '',
    slaUrgentOnlyFilter: false,
    slaSummary: {
      evaluatedAt: '2026-11-22T18:00:00.000Z',
      overdueCount: 0,
      criticalCount: 0,
      warningCount: 0,
      normalCount: 0,
      atRiskCount: 0,
      atRiskTrips: [],
      criticalOrOverdueTrips: [],
      allEligible: [],
      byTripId: {},
    },
  };

  const stopsFiltered = filterDispatchQueueTrips(baseFilterInput);
  assert.deepEqual(
    stopsFiltered.map((t) => t.id),
    ['trip_phase49_multistop', 'trip_phase49_summary_only'],
    'has_stops filter must keep only trips with intermediate stops'
  );

  const stopSearchFiltered = filterDispatchQueueTrips({
    ...baseFilterInput,
    activeFilterKeys: [],
    searchTerm: 'mercy hospital',
  });
  assert.deepEqual(
    stopSearchFiltered.map((t) => t.id),
    ['trip_phase49_multistop'],
    'Queue text search must match intermediate stop addresses'
  );
  console.log('✓ 3. Queue `has_stops` filter & intermediate stop search verified');

  // 4. Dispatch Map Preferences Defaults & Serialization Resilience
  assert.equal(DISPATCH_MAP_PREFS_STORAGE_KEY, 'ct_dispatch_map_prefs_v1');
  assert.deepEqual(DEFAULT_DISPATCH_MAP_PREFERENCES, {
    casedRouteWithArrows: true,
    interactiveRoutePinPopovers: true,
    showRouteSummaryPill: true,
  });

  assert.deepEqual(parseDispatchMapPreferences(null), DEFAULT_DISPATCH_MAP_PREFERENCES);
  assert.deepEqual(parseDispatchMapPreferences(undefined), DEFAULT_DISPATCH_MAP_PREFERENCES);
  assert.deepEqual(parseDispatchMapPreferences(''), DEFAULT_DISPATCH_MAP_PREFERENCES);
  assert.deepEqual(parseDispatchMapPreferences('{malformed-json'), DEFAULT_DISPATCH_MAP_PREFERENCES);
  assert.deepEqual(parseDispatchMapPreferences('42'), DEFAULT_DISPATCH_MAP_PREFERENCES);
  assert.deepEqual(
    parseDispatchMapPreferences(JSON.stringify({ casedRouteWithArrows: false, showRouteSummaryPill: 'invalid' })),
    {
      casedRouteWithArrows: false,
      interactiveRoutePinPopovers: true,
      showRouteSummaryPill: true,
    }
  );

  const customPrefs = {
    casedRouteWithArrows: false,
    interactiveRoutePinPopovers: true,
    showRouteSummaryPill: false,
  };
  assert.deepEqual(
    parseDispatchMapPreferences(serializeDispatchMapPreferences(customPrefs)),
    customPrefs
  );
  console.log('✓ 4. DispatchMapPreferences defaults (all 3 true) & storage resilience verified');

  // 5. Route Context & Directions Leg Snapping Verification
  const routeCtx = resolveActiveRouteContext({ selectedTrip: multiStopTrip, shouldZoom: true });
  assert.ok(routeCtx, 'Expected active route context for selected multi-stop trip');
  assert.equal(routeCtx.waypoints.length, 4);
  assert.deepEqual(
    routeCtx.waypoints.map((w) => w.badgeLabel),
    ['Pickup', 'Stop #1', 'Stop #2', 'Dropoff']
  );
  assert.equal(routeCtx.waypoints[1].notes, 'Wait by Macy entrance');
  assert.equal(routeCtx.waypoints[3].notes, 'Southwest Departures Door 2');

  const mockDirectionsResult = {
    routes: [
      {
        legs: [
          {
            start_location: { lat: () => 38.65315, lng: () => -90.53415 },
            end_location: { lat: () => 38.65355, lng: () => -90.56125 },
            distance: { value: 4828 },
            duration: { value: 420 },
            steps: [],
          },
          {
            start_location: { lat: () => 38.65355, lng: () => -90.56125 },
            end_location: { lat: () => 38.64425, lng: () => -90.44375 },
            distance: { value: 11265 },
            duration: { value: 780 },
            steps: [],
          },
          {
            start_location: { lat: () => 38.64425, lng: () => -90.44375 },
            end_location: { lat: () => 38.74875, lng: () => -90.37005 },
            distance: { value: 16093 },
            duration: { value: 960 },
            steps: [],
          },
        ],
        overview_path: [
          { lat: () => 38.65315, lng: () => -90.53415 },
          { lat: () => 38.65355, lng: () => -90.56125 },
          { lat: () => 38.64425, lng: () => -90.44375 },
          { lat: () => 38.74875, lng: () => -90.37005 },
        ],
      },
    ],
  } as unknown as google.maps.DirectionsResult;

  const snapped = extractDirectionsRouteSnapshot(mockDirectionsResult, routeCtx.waypoints);
  assert.deepEqual(snapped.snappedWaypoints[0].coordinates, { lat: 38.65315, lng: -90.53415 });
  assert.deepEqual(snapped.snappedWaypoints[1].coordinates, { lat: 38.65355, lng: -90.56125 });
  assert.deepEqual(snapped.snappedWaypoints[2].coordinates, { lat: 38.64425, lng: -90.44375 });
  assert.deepEqual(snapped.snappedWaypoints[3].coordinates, { lat: 38.74875, lng: -90.37005 });
  assert.deepEqual(snapped.metrics, { distanceMiles: 20, durationMinutes: 36 });
  console.log('✓ 5. Route leg coordinate snapping & multi-leg distance/ETA aggregation verified');

  // 6. Source & Line-Budget Invariants
  const rootDir = process.cwd();
  const tableViewSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  const thMatches = tableViewSource.match(/<th\b/g) || [];
  assert.equal(
    thMatches.length,
    10,
    `TripQueueTableView.tsx must have exactly 10 <th> headers (zero new columns), found ${thMatches.length}`
  );
  assert.ok(
    tableViewSource.includes('scroller.scrollWidth > clientW + 1') ||
      tableViewSource.includes('scrollW > clientW + 1'),
    'TripQueueTableView.tsx must preserve live scrollWidth > clientWidth + 1 overflow detection'
  );

  const liveFleetMapPath = path.join(rootDir, 'app/components/domain/dispatch/LiveFleetMap.tsx');
  const liveFleetMapSource = fs.readFileSync(liveFleetMapPath, 'utf8');
  const liveFleetMapLines = liveFleetMapSource.split(/\r?\n/).length;
  assert.ok(
    liveFleetMapSource.includes('suppressMarkers: true'),
    'LiveFleetMap.tsx must configure suppressMarkers: true on DirectionsRenderer'
  );
  assert.ok(
    liveFleetMapLines < 1350,
    `LiveFleetMap.tsx must stay < 1350 lines (actual: ${liveFleetMapLines})`
  );

  const queuePaneLines = fs
    .readFileSync(path.join(rootDir, 'app/components/domain/dispatch/DispatchTripQueuePane.tsx'), 'utf8')
    .split(/\r?\n/).length;
  assert.ok(
    queuePaneLines < 900,
    `DispatchTripQueuePane.tsx must stay < 900 lines (actual: ${queuePaneLines})`
  );

  const dispatchRouteLines = fs
    .readFileSync(path.join(rootDir, 'app/routes/dispatch.tsx'), 'utf8')
    .split(/\r?\n/).length;
  assert.ok(
    dispatchRouteLines < 1600,
    `app/routes/dispatch.tsx must stay < 1600 lines (actual: ${dispatchRouteLines})`
  );

  const customerMapSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/tracking/CustomerTelemetryMap.tsx'),
    'utf8'
  );
  assert.ok(
    customerMapSource.includes('buildRouteWaypointPinDataUrl'),
    'CustomerTelemetryMap.tsx must use buildRouteWaypointPinDataUrl for pickup/stop/dropoff pins'
  );

  const topHeaderSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/workspace/DispatchDesktopTopHeader.tsx'),
    'utf8'
  );
  const navShellSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/workspace/DispatchNavigationShell.tsx'),
    'utf8'
  );
  for (const label of ['Cased Route & Arrows', 'Interactive Route Pins', 'Route Summary Pill']) {
    assert.ok(
      topHeaderSource.includes(label),
      `DispatchDesktopTopHeader.tsx must expose "${label}" toggle`
    );
    assert.ok(
      navShellSource.includes(label),
      `DispatchNavigationShell.tsx must expose "${label}" toggle`
    );
  }

  console.log(
    `✓ 6. Source & monolith budgets verified (10 <th> cols, suppressMarkers: true, LiveFleetMap=${liveFleetMapLines}L < 1350, DispatchTripQueuePane=${queuePaneLines}L < 900, dispatch.tsx=${dispatchRouteLines}L < 1600)`
  );
  console.log('ALL PHASE 49 MULTI-STOP & ROUTE PIN TESTS PASSED! ✅');
}

main();
