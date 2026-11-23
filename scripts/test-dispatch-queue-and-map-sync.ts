import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Trip } from '../app/core/types/trip';
import { isValidDisplayLayout } from '../app/core/hooks/useDisplayLayout';
import {
  TABLE_OVERFLOW_MIN_WIDTH_PX,
  TABLE_OVERFLOW_HYSTERESIS_PX,
  resolveEffectiveQueueDisplayLayout,
  splitAddressForTwoLineCell,
} from '../app/components/domain/dispatch/queue/trip-queue-layout.util';
import {
  BATCH_BAR_COMPACT_MAX_PX,
  BATCH_BAR_MEDIUM_MAX_PX,
  computeBatchSelectionActionCounts,
  resolveBatchActionBarTier,
} from '../app/components/domain/dispatch/queue/TripQueueBatchActionBar';
import { getBatchCompletableTrips } from '../app/core/hooks/dispatch/useDispatchTripTriageActions';
import {
  ACTIVE_QUEUE_STATUS_KEYS,
  ALL_QUEUE_STATUS_KEYS,
  computeActiveDraftLocationState,
  matchesQueueStatusFilter,
  parseStatusFilterSelection,
  serializeStatusFilterSelection,
  sortDispatchQueueTrips,
  type DraftTab,
} from '../app/core/hooks/dispatch/dispatch-workspace.util';
import {
  DIRECTIONS_CACHE_MAX_ENTRIES,
  applyCachedDirectionsToWaypoints,
  clearCachedDirectionsResults,
  frameRouteViewportOnMap,
  getCachedDirectionsResult,
  getCachedGeocodeCoordinates,
  getDirectionsCacheSize,
  isRoutableMapRoute,
  resolveActiveRouteContext,
  setCachedDirectionsResult,
  setCachedGeocodeCoordinates,
} from '../app/components/domain/dispatch/map/route-map-sync';

function buildQueuedTrip(id: string): Trip {
  return {
    id,
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-23T15:00:00.000Z',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: {
      address: '14848 Conway Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6531, lng: -90.5341 },
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    passenger: {
      firstName: 'Marcus',
      lastName: 'Holloway',
      email: 'marcus@example.com',
      phone: '(314) 555-0188',
      passengerCount: 1,
      luggageCount: 1,
    },
    vehicleTier: 'sedan',
    pricing: {
      baseFare: 15,
      distanceMiles: 19.2,
      durationMinutes: 24,
      distanceRate: 2.5,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 64,
      totalFare: 64,
      currency: 'USD',
    },
    payment: {
      method: 'cash',
      status: 'pending',
      amount: 64,
    },
    statusHistory: [],
    createdAt: '2026-11-22T20:00:00.000Z',
    updatedAt: '2026-11-22T20:00:00.000Z',
  };
}

function main() {
  console.log('=== Phase 52: Dispatch Queue Layout Override & Live Booking-Form Map Route Sync Suite ===');

  // 1. Explicit 'table' vs 'auto' Queue Layout Resolution
  assert.equal(TABLE_OVERFLOW_MIN_WIDTH_PX, 920);
  assert.equal(TABLE_OVERFLOW_HYSTERESIS_PX, 8);
  assert.equal(isValidDisplayLayout('auto'), true);
  assert.equal(isValidDisplayLayout('table'), true);
  assert.equal(isValidDisplayLayout('cards'), true);
  assert.equal(isValidDisplayLayout('compact'), true);

  for (const narrowWidth of [500, 700, 919, 980, 1400]) {
    const explicitTable = resolveEffectiveQueueDisplayLayout({
      displayLayout: 'table',
      isDesktop: true,
      queueWidthPx: narrowWidth,
      requiredTableWidthPx: 1280,
    });
    assert.equal(explicitTable.effectiveDisplayLayout, 'table');
    assert.equal(explicitTable.isAutoCardsFallback, false);
  }

  const autoBelowThreshold = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'auto',
    isDesktop: true,
    queueWidthPx: 880,
  });
  assert.equal(autoBelowThreshold.effectiveDisplayLayout, 'cards');
  assert.equal(autoBelowThreshold.isAutoCardsFallback, true);

  const autoAboveThreshold = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'auto',
    isDesktop: true,
    queueWidthPx: 980,
  });
  assert.equal(autoAboveThreshold.effectiveDisplayLayout, 'table');
  assert.equal(autoAboveThreshold.isAutoCardsFallback, false);

  const autoEscalatedOverflow = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'auto',
    isDesktop: true,
    queueWidthPx: 980,
    requiredTableWidthPx: 1140,
  });
  assert.equal(autoEscalatedOverflow.effectiveDisplayLayout, 'cards');
  assert.equal(autoEscalatedOverflow.isAutoCardsFallback, true);
  assert.equal(autoEscalatedOverflow.effectiveMinTableWidthPx, 1140);
  console.log('✓ 1. Explicit "table" manual override & "auto" responsive fallback verified');

  // 2. Active Booking Draft Location Signature Tracking (clearing stale selectedMapTrip)
  const emptyDraft: DraftTab = { id: 'new-1', isNew: true };
  const emptySig = computeActiveDraftLocationState(emptyDraft);
  assert.equal(emptySig.hasAnyLocation, false);

  const pickupOnlyDraft: DraftTab = {
    id: 'new-1',
    isNew: true,
    formValues: {
      pickupAddress: "St. Luke's Hospital, Chesterfield, MO",
      pickupCoordinates: { lat: 38.6458, lng: -90.5091 },
      dropoffAddress: '',
      intermediateStops: [],
    } as any,
  };
  const pickupSig = computeActiveDraftLocationState(pickupOnlyDraft);
  assert.equal(pickupSig.hasAnyLocation, true);
  assert.notEqual(pickupSig.signature, emptySig.signature);

  const withStopDraft: DraftTab = {
    ...pickupOnlyDraft,
    formValues: {
      ...pickupOnlyDraft.formValues!,
      intermediateStops: [
        { address: 'Chesterfield Mall, Chesterfield, MO', coordinates: { lat: 38.6531, lng: -90.5625 } },
      ],
    },
  };
  const stopSig = computeActiveDraftLocationState(withStopDraft);
  assert.equal(stopSig.hasAnyLocation, true);
  assert.notEqual(stopSig.signature, pickupSig.signature);

  const switchedTabDraft: DraftTab = {
    ...withStopDraft,
    id: 'new-2',
  };
  const switchedTabSig = computeActiveDraftLocationState(switchedTabDraft);
  assert.equal(switchedTabSig.hasAnyLocation, true);
  assert.notEqual(
    switchedTabSig.signature,
    stopSig.signature,
    'Switching draft tabs must produce a distinct signature so the newly active draft frames on the map'
  );
  console.log('✓ 2. Active draft location signature progression verified');

  // 3. Single-Pin Green Pickup -> Multi-Stop Amber -> Full Red Dropoff Route Context Progression
  const staleSelectedTrip = buildQueuedTrip('trip_old_selected_99');

  // When selectedTrip is still present (before draft edit clears it), selected_trip wins:
  const whileSelected = resolveActiveRouteContext({
    selectedTrip: staleSelectedTrip,
    activeFormValues: pickupOnlyDraft.formValues,
    shouldZoom: false,
  });
  assert.ok(whileSelected);
  assert.equal(whileSelected.source, 'selected_trip');
  assert.equal(whileSelected.hasFullRoute, true);

  // Once draft location change clears selectedTrip -> null, single-pin Pickup renders immediately!
  const singlePickupCtx = resolveActiveRouteContext({
    selectedTrip: null,
    activeFormValues: pickupOnlyDraft.formValues,
    shouldZoom: true,
  });
  assert.ok(singlePickupCtx, 'Pickup-only draft must produce a valid single-pin ActiveRouteContext');
  assert.equal(singlePickupCtx.source, 'draft_form');
  assert.equal(singlePickupCtx.hasFullRoute, false);
  assert.equal(singlePickupCtx.waypoints.length, 1);
  assert.equal(singlePickupCtx.waypoints[0].kind, 'pickup');
  assert.equal(singlePickupCtx.waypoints[0].badgeLabel, 'Pickup');
  assert.equal(singlePickupCtx.waypoints[0].hasExplicitCoordinates, true);
  assert.deepEqual(singlePickupCtx.waypoints[0].coordinates, { lat: 38.6458, lng: -90.5091 });
  assert.equal(isRoutableMapRoute(singlePickupCtx), false);

  // Dropoff-only partial draft renders Red Dropoff pin
  const dropoffOnlyCtx = resolveActiveRouteContext({
    selectedTrip: null,
    activeFormValues: {
      pickupAddress: '',
      dropoffAddress: 'Spirit of St. Louis Airport (SUS), Chesterfield, MO',
      dropoffCoordinates: { lat: 38.6621, lng: -90.652 },
      intermediateStops: [],
    },
  });
  assert.ok(dropoffOnlyCtx);
  assert.equal(dropoffOnlyCtx.source, 'draft_form');
  assert.equal(dropoffOnlyCtx.hasFullRoute, false);
  assert.equal(dropoffOnlyCtx.waypoints.length, 1);
  assert.equal(dropoffOnlyCtx.waypoints[0].kind, 'dropoff');

  // Full multi-leg draft (Pickup + 2 Intermediate Stops + Dropoff) upgrades to hasFullRoute = true
  const fullMultiStopDraftCtx = resolveActiveRouteContext({
    selectedTrip: null,
    activeFormValues: {
      passengerName: 'Clara Oswald',
      pickupAddress: "St. Luke's Hospital, Chesterfield, MO",
      pickupCoordinates: { lat: 38.6458, lng: -90.5091 },
      intermediateStops: [
        { address: 'Chesterfield Mall, Chesterfield, MO', coordinates: { lat: 38.6531, lng: -90.5625 } },
        { address: 'Centene Community Ice Center, Maryland Heights, MO', coordinates: { lat: 38.7248, lng: -90.4648 } },
      ],
      dropoffAddress: 'St. Louis Lambert International Airport (STL), St. Louis, MO',
      dropoffCoordinates: { lat: 38.7487, lng: -90.37 },
      notesForAll: 'Ring bell at main lobby',
    },
    shouldZoom: true,
  });
  assert.ok(fullMultiStopDraftCtx);
  assert.equal(fullMultiStopDraftCtx.source, 'draft_form');
  assert.equal(fullMultiStopDraftCtx.hasFullRoute, true);
  assert.equal(fullMultiStopDraftCtx.passengerLabel, 'Clara Oswald');
  assert.equal(fullMultiStopDraftCtx.stopCount, 2);
  assert.equal(isRoutableMapRoute(fullMultiStopDraftCtx), true);
  assert.deepEqual(
    fullMultiStopDraftCtx.waypoints.map((w) => ({ kind: w.kind, stopNumber: w.stopNumber, badge: w.badgeLabel })),
    [
      { kind: 'pickup', stopNumber: undefined, badge: 'Pickup' },
      { kind: 'stop', stopNumber: 1, badge: 'Stop #1' },
      { kind: 'stop', stopNumber: 2, badge: 'Stop #2' },
      { kind: 'dropoff', stopNumber: undefined, badge: 'Dropoff' },
    ]
  );

  // Cached Geocoder coordinates automatically hydrate raw freeform address drafts
  setCachedGeocodeCoordinates('500 Chesterfield Center, Chesterfield, MO', {
    lat: 38.6549,
    lng: -90.5582,
  });
  assert.deepEqual(getCachedGeocodeCoordinates('  500 chesterfield center, chesterfield, mo  '), {
    lat: 38.6549,
    lng: -90.5582,
  });
  const geocodedSinglePinCtx = resolveActiveRouteContext({
    selectedTrip: null,
    activeFormValues: {
      pickupAddress: '500 Chesterfield Center, Chesterfield, MO',
      dropoffAddress: '',
      intermediateStops: [],
    },
  });
  assert.ok(geocodedSinglePinCtx);
  assert.equal(geocodedSinglePinCtx.waypoints[0].hasExplicitCoordinates, true);
  assert.deepEqual(geocodedSinglePinCtx.waypoints[0].coordinates, { lat: 38.6549, lng: -90.5582 });

  // Single-pin viewport framing pans & zooms to >= 13 when zoomed out
  let pannedTo: any = null;
  let updatedZoom: number | null = null;
  const mockMap = {
    panTo: (pt: any) => {
      pannedTo = pt;
    },
    getZoom: () => 11,
    setZoom: (z: number) => {
      updatedZoom = z;
    },
    fitBounds: () => {
      throw new Error('Single waypoint must panTo rather than fitBounds');
    },
  } as any;
  frameRouteViewportOnMap({
    map: mockMap,
    waypoints: singlePickupCtx.waypoints,
  });
  assert.deepEqual(pannedTo, { lat: 38.6458, lng: -90.5091 });
  assert.equal(updatedZoom, 14);
  console.log('✓ 3. Single-pin Pickup/Dropoff preview, Geocoder cache & full multi-leg upgrade verified');

  // 4. Directions 50-Entry LRU Cache (hit deduplication, recency refresh, capacity eviction)
  assert.equal(DIRECTIONS_CACHE_MAX_ENTRIES, 50);
  clearCachedDirectionsResults();
  assert.equal(getDirectionsCacheSize(), 0);
  assert.equal(getCachedDirectionsResult('missing-sig'), null);

  for (let i = 1; i <= 50; i++) {
    setCachedDirectionsResult(`route-sig-${i}`, {
      snappedWaypoints: fullMultiStopDraftCtx.waypoints,
      path: [
        { lat: 38.64 + i * 0.001, lng: -90.5 },
        { lat: 38.74, lng: -90.37 },
      ],
      metrics: { distanceMiles: 10 + i, durationMinutes: 15 + i },
    });
  }
  assert.equal(getDirectionsCacheSize(), 50);

  // Touch route-sig-1 so route-sig-2 becomes the oldest entry!
  const hitSig1 = getCachedDirectionsResult('route-sig-1');
  assert.ok(hitSig1);
  assert.equal(hitSig1.metrics?.distanceMiles, 11);

  // Insert 51st entry -> must evict route-sig-2 while keeping recently-used route-sig-1!
  setCachedDirectionsResult('route-sig-51', {
    snappedWaypoints: fullMultiStopDraftCtx.waypoints,
    path: [
      { lat: 38.65, lng: -90.51 },
      { lat: 38.75, lng: -90.36 },
    ],
    metrics: { distanceMiles: 22.4, durationMinutes: 29 },
  });
  assert.equal(getDirectionsCacheSize(), 50);
  assert.ok(
    getCachedDirectionsResult('route-sig-1'),
    'Recently accessed route-sig-1 must remain in LRU cache'
  );
  assert.equal(
    getCachedDirectionsResult('route-sig-2'),
    null,
    'Least-recently-used route-sig-2 must be evicted past capacity 50'
  );
  assert.ok(getCachedDirectionsResult('route-sig-51'));

  // Verify applyCachedDirectionsToWaypoints preserves current notes/labels while snapping coords
  const merged = applyCachedDirectionsToWaypoints(
    {
      snappedWaypoints: fullMultiStopDraftCtx.waypoints.map((w) => ({
        ...w,
        coordinates: { lat: 39.0, lng: -90.0 },
        notes: 'stale note',
      })),
      path: [],
      metrics: { distanceMiles: 18, durationMinutes: 24 },
    },
    fullMultiStopDraftCtx.waypoints
  );
  assert.deepEqual(merged[0].coordinates, { lat: 39.0, lng: -90.0 });
  assert.equal(merged[0].notes, 'Ring bell at main lobby');
  clearCachedDirectionsResults();
  console.log('✓ 4. Directions 50-entry LRU cache hit, recency refresh & eviction verified');

  // 5. Monolith Budgets, 10-Column Table Invariant & Zero Realtime-Routing Blocker
  const rootDir = process.cwd();

  const tableSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  const thCount = (tableSource.match(/<th\b/g) || []).length;
  assert.equal(thCount, 10, `TripQueueTableView.tsx must keep exact 10 <th> columns, found ${thCount}`);
  assert.ok(
    tableSource.includes('min-w-[900px]'),
    'TripQueueTableView.tsx must use compact min-w-[900px]'
  );

  const liveFleetMapSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/LiveFleetMap.tsx'),
    'utf8'
  );
  const routeOverlayHookSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/map/useLiveMapRouteOverlaySync.ts'),
    'utf8'
  );
  assert.ok(
    !liveFleetMapSource.includes('isRealtimeRoutingEnabled') &&
      !routeOverlayHookSource.includes('isRealtimeRoutingEnabled'),
    'LiveFleetMap must NOT block DirectionsService with isRealtimeRoutingEnabled()'
  );

  const budgetChecks: Array<{ relPath: string; maxLines: number }> = [
    { relPath: 'app/components/domain/dispatch/LiveFleetMap.tsx', maxLines: 1350 },
    { relPath: 'app/routes/dispatch.tsx', maxLines: 1600 },
    { relPath: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', maxLines: 900 },
    { relPath: 'app/components/domain/admin/AdminRulesTab.tsx', maxLines: 1400 },
  ];

  const summary: string[] = [];
  for (const { relPath, maxLines } of budgetChecks) {
    const text = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const lines = text.split(/\r?\n/).length;
    assert.ok(lines < maxLines, `${relPath} exceeded budget: ${lines} >= ${maxLines}`);
    assert.ok(!text.includes('HUD Now'), `${relPath} must contain zero "HUD Now" occurrences`);
    summary.push(`${path.basename(relPath)}=${lines}L/<${maxLines}L`);
  }
  console.log(`✓ 5. Table 10-col min-w-[900px] & monolith budgets verified (${summary.join(', ')})`);

  // 6. Phase 52.C: Multi-Status Checkboxes, Smart Queue Ordering, 2-Line Address Wrapping & Portal Popovers
  assert.equal(ALL_QUEUE_STATUS_KEYS.length, 12);
  assert.equal(ACTIVE_QUEUE_STATUS_KEYS.length, 9);
  assert.equal(parseStatusFilterSelection('all').size, 12);
  assert.equal(parseStatusFilterSelection('none').size, 0);
  assert.equal(serializeStatusFilterSelection([]), 'none');
  assert.equal(serializeStatusFilterSelection(ALL_QUEUE_STATUS_KEYS), 'all');
  assert.equal(
    serializeStatusFilterSelection(['assigned', 'unconfirmed']),
    'unconfirmed,assigned',
    'Serialized multi-status filter must preserve canonical status order'
  );
  assert.equal(matchesQueueStatusFilter('UNCONFIRMED', 'unconfirmed,assigned'), true);
  assert.equal(matchesQueueStatusFilter('assigned', 'unconfirmed,assigned'), true);
  assert.equal(matchesQueueStatusFilter('completed', 'unconfirmed,assigned'), false);
  assert.equal(matchesQueueStatusFilter('CONFIRMED', 'none'), false);
  assert.equal(matchesQueueStatusFilter('cancelled', 'all'), true);

  // Smart Operational Queue Sort vs Chronological Asc/Desc
  const unsortedTrips: Trip[] = [
    {
      ...buildQueuedTrip('closed_older'),
      status: 'cancelled',
      bookingType: 'scheduled',
      scheduledPickupTime: '2026-11-20T23:15:00.000Z',
      createdAt: '2026-11-20T20:00:00.000Z',
    },
    {
      ...buildQueuedTrip('sched_later'),
      status: 'CONFIRMED',
      bookingType: 'scheduled',
      scheduledPickupTime: '2026-11-25T16:00:00.000Z',
      createdAt: '2026-11-22T18:00:00.000Z',
    },
    {
      ...buildQueuedTrip('asap_older'),
      status: 'UNCONFIRMED',
      bookingType: 'asap',
      scheduledPickupTime: undefined,
      createdAt: '2026-11-23T06:00:00.000Z',
    },
    {
      ...buildQueuedTrip('closed_newer'),
      status: 'completed',
      bookingType: 'scheduled',
      scheduledPickupTime: '2026-11-22T15:40:00.000Z',
      createdAt: '2026-11-22T14:00:00.000Z',
    },
    {
      ...buildQueuedTrip('sched_sooner'),
      status: 'assigned',
      bookingType: 'scheduled',
      scheduledPickupTime: '2026-11-23T14:30:00.000Z',
      createdAt: '2026-11-22T19:00:00.000Z',
    },
    {
      ...buildQueuedTrip('asap_newer'),
      status: 'UNCONFIRMED',
      bookingType: 'asap',
      scheduledPickupTime: undefined,
      createdAt: '2026-11-23T06:15:00.000Z',
    },
  ];

  const smartSortedIds = sortDispatchQueueTrips(unsortedTrips, 'smart').map((t) => t.id);
  assert.deepEqual(
    smartSortedIds,
    ['asap_newer', 'asap_older', 'sched_sooner', 'sched_later', 'closed_newer', 'closed_older'],
    'Smart sort must place Open ASAP (newest first) -> Open Scheduled (soonest -> furthest) -> Closed (newest -> oldest)'
  );

  const ascSortedIds = sortDispatchQueueTrips(unsortedTrips, 'date_asc').map((t) => t.id);
  assert.deepEqual(ascSortedIds, [
    'closed_older',
    'closed_newer',
    'asap_older',
    'asap_newer',
    'sched_sooner',
    'sched_later',
  ]);

  const descSortedIds = sortDispatchQueueTrips(unsortedTrips, 'date_desc').map((t) => t.id);
  assert.deepEqual(descSortedIds, [
    'sched_later',
    'sched_sooner',
    'asap_newer',
    'asap_older',
    'closed_newer',
    'closed_older',
  ]);

  // 2-Line Intelligent Address Splitting
  assert.deepEqual(
    splitAddressForTwoLineCell('10701 Lambert International Blvd, St. Louis, MO 63145, USA'),
    {
      primary: '10701 Lambert International Blvd',
      secondary: 'St. Louis, MO 63145',
    }
  );
  assert.deepEqual(
    splitAddressForTwoLineCell('Monarch Chesterfield Levee Trail, Chesterfield, MO 63005'),
    {
      primary: 'Monarch Chesterfield Levee Trail',
      secondary: 'Chesterfield, MO 63005',
    }
  );
  assert.deepEqual(
    splitAddressForTwoLineCell('Mercy Hospital St Louis Emergency Entrance'),
    {
      primary: 'Mercy Hospital St Louis Emergency Entrance',
      secondary: null,
    }
  );
  assert.deepEqual(splitAddressForTwoLineCell('   '), { primary: '—', secondary: null });

  // Source Guardrails for Portal Popovers, RadarBroadcastIcon & Header Hold Toggle
  const filterPopoversSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx'),
    'utf8'
  );
  assert.ok(
    filterPopoversSource.includes('createPortal') &&
      filterPopoversSource.includes('Select All') &&
      filterPopoversSource.includes('Deselect All') &&
      filterPopoversSource.includes('Active Only'),
    'TripQueueFilterPopovers.tsx must render portal-anchored multi-select status & filter popovers'
  );

  const actionDropdownSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/TripActionDropdown.tsx'),
    'utf8'
  );
  assert.ok(
    actionDropdownSource.includes('RadarBroadcastIcon') &&
      actionDropdownSource.includes('Auto-Offer Cascade'),
    'TripActionDropdown.tsx must render Auto-Offer Cascade with RadarBroadcastIcon'
  );

  assert.ok(
    tableSource.includes('stagedPlanner.setQueueAssignMode') &&
      tableSource.includes('📌 Hold') &&
      tableSource.includes('splitAddressForTwoLineCell') &&
      !tableSource.includes('Auto-Offer'),
    'TripQueueTableView.tsx must have header Hold toggle, 2-line address wrapping, and zero inline Auto-Offer buttons'
  );

  const cardsSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx'),
    'utf8'
  );
  assert.ok(
    !cardsSource.includes('Auto-Offer'),
    'TripQueueCardsGrid.tsx must have zero inline Auto-Offer buttons (moved to Actions dropdown)'
  );
  console.log('✓ 6. Phase 52.C multi-status checkboxes, smart queue sort, 2-line address wrap & header Hold toggle verified');

  // 7. Phase 52.D: Batch Complete Trips & Responsive Multi-Select Batch Actions Dropdown
  assert.equal(BATCH_BAR_COMPACT_MAX_PX, 680);
  assert.equal(BATCH_BAR_MEDIUM_MAX_PX, 1060);
  assert.equal(resolveBatchActionBarTier(false, 0), 'compact_dropdown');
  assert.equal(resolveBatchActionBarTier(false, 1280), 'compact_dropdown');
  assert.equal(resolveBatchActionBarTier(true, 420), 'compact_dropdown');
  assert.equal(resolveBatchActionBarTier(true, 679), 'compact_dropdown');
  assert.equal(resolveBatchActionBarTier(true, 680), 'medium_hybrid');
  assert.equal(resolveBatchActionBarTier(true, 1059), 'medium_hybrid');
  assert.equal(resolveBatchActionBarTier(true, 1060), 'wide_hybrid');
  assert.equal(resolveBatchActionBarTier(true, 0), 'wide_hybrid');

  const batchPool: Trip[] = [
    { ...buildQueuedTrip('b_unconf'), status: 'UNCONFIRMED' },
    { ...buildQueuedTrip('b_conf'), status: 'CONFIRMED' },
    { ...buildQueuedTrip('b_inprog'), status: 'in_progress' },
    { ...buildQueuedTrip('b_done'), status: 'completed' },
    { ...buildQueuedTrip('b_canc'), status: 'cancelled' },
  ];
  const allBatchIds = batchPool.map((t) => t.id);
  const completable = getBatchCompletableTrips(batchPool, allBatchIds);
  assert.deepEqual(
    completable.map((t) => t.id),
    ['b_unconf', 'b_conf', 'b_inprog'],
    'Batch Complete Trips must include active/open rides and skip completed/cancelled rides'
  );
  const batchCounts = computeBatchSelectionActionCounts(batchPool, allBatchIds);
  assert.deepEqual(batchCounts, {
    selectedCount: 5,
    confirmableCount: 2,
    completableCount: 3,
    cancellableCount: 3,
  });

  const batchBarSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueBatchActionBar.tsx'),
    'utf8'
  );
  assert.ok(
    batchBarSource.includes('createPortal') &&
      batchBarSource.includes('Complete Trips') &&
      batchBarSource.includes('Batch Actions') &&
      !batchBarSource.includes('HUD Now'),
    'TripQueueBatchActionBar.tsx must render portal dropdown with Complete Trips and zero HUD Now wording'
  );
  console.log('✓ 7. Phase 52.D Batch Complete Trips & responsive Batch Actions dropdown verified');

  console.log('ALL PHASE 52 DISPATCH QUEUE & LIVE MAP SYNC TESTS PASSED! ✅');
}

main();
