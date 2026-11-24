// Phase 66 Automated Verification Suite (`scripts/test-queue-columns-sorting-and-icons-phase66.ts`)
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Trip, TripStatus } from '../app/core/types/trip';
import { normalizeDispatchConsoleConfig } from '../app/core/types/config';
import {
  ACTIVE_QUEUE_STATUS_KEYS, DEFAULT_ACTIVE_ONLY_STATUS_FILTER, DEFAULT_QUEUE_COLUMN_SORT,
  computeNextStatusFilterOnUnconfirmedToggle, cycleQueueColumnSort, matchesQueueStatusFilter, sortQueueTripsByColumn,
} from '../app/core/hooks/dispatch/dispatch-workspace.util';
import { getDispatchStatusBadge, resolveDispatchStatusMeta } from '../app/components/domain/dispatch/queue/DispatchStatusBadge';
import {
  COMPACT_DOCK_QUEUE_COLUMNS, DEFAULT_QUEUE_COLUMNS, DISPATCH_QUEUE_COLUMNS_STORAGE_KEY, FULL_DESK_QUEUE_COLUMNS,
  computeQueueTableMinWidthPx, parseStoredQueueColumns, resolveActiveQueueColumnPreset, serializeQueueColumns, toggleQueueColumnSelection,
} from '../app/components/domain/dispatch/queue/trip-queue-columns.util';
import { resolveEffectiveQueueDisplayLayout } from '../app/components/domain/dispatch/queue/trip-queue-layout.util';

const ROOT_DIR = process.cwd();

function collectFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, pattern));
    else if (entry.isFile() && pattern.test(entry.name)) results.push(full);
  }
  return results;
}

function makeTrip(id: string, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    status: 'confirmed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: { address: '100 Main St, Chesterfield, MO' },
    dropoffLocation: { address: '200 Airport Way, St. Louis, MO' },
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-24T15:00:00.000Z',
    passenger: {
      firstName: 'Alex',
      lastName: 'Rivera',
      email: 'alex@example.com',
      phone: '(314) 555-0100',
      passengerCount: 1,
      luggageCount: 1,
    },
    vehicleTier: 'sedan',
    pricing: {
      baseFare: 10, distanceMiles: 12, durationMinutes: 20, distanceRate: 30,
      timeRate: 0, vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0,
      subtotal: 40, totalFare: 40, currency: 'USD',
    },
    payment: { method: 'card', status: 'pending', amount: 40 },
    statusHistory: [],
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

function testActiveOnlyStatusFilterDefault(): void {
  console.log('1️⃣  Testing Active Only status filter default & DispatchConsoleSettingsConfig...');

  assert.equal(
    DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
    'late,unconfirmed,confirmed,pending,offered,assigned,accepted,en_route,arrived,in_progress'
  );
  assert.equal(ACTIVE_QUEUE_STATUS_KEYS.length, 10);

  for (const openStatus of [
    'UNCONFIRMED', 'unconfirmed', 'CONFIRMED', 'confirmed', 'pending',
    'offered', 'assigned', 'accepted', 'en_route', 'arrived', 'in_progress',
  ]) {
    assert.equal(matchesQueueStatusFilter(openStatus, DEFAULT_ACTIVE_ONLY_STATUS_FILTER), true);
  }
  for (const closedStatus of ['completed', 'cancelled', 'declined', 'DECLINED']) {
    assert.equal(matchesQueueStatusFilter(closedStatus, DEFAULT_ACTIVE_ONLY_STATUS_FILTER), false);
  }

  assert.equal(normalizeDispatchConsoleConfig(undefined).defaultQueueStatusFilter, 'active_only');
  assert.equal(normalizeDispatchConsoleConfig({ defaultQueueStatusFilter: 'all' }).defaultQueueStatusFilter, 'all');
  assert.equal(normalizeDispatchConsoleConfig({ defaultQueueStatusFilter: 'bad' as any }).defaultQueueStatusFilter, 'active_only');

  const toggledOn = computeNextStatusFilterOnUnconfirmedToggle(DEFAULT_ACTIVE_ONLY_STATUS_FILTER);
  assert.deepEqual(toggledOn, {
    nextStatusFilter: 'unconfirmed',
    savedPreviousFilter: DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
  });
  const toggledOff = computeNextStatusFilterOnUnconfirmedToggle(
    toggledOn.nextStatusFilter,
    toggledOn.savedPreviousFilter
  );
  assert.deepEqual(toggledOff, {
    nextStatusFilter: DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
    savedPreviousFilter: DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
  });
  assert.deepEqual(computeNextStatusFilterOnUnconfirmedToggle('unconfirmed'), {
    nextStatusFilter: 'all',
    savedPreviousFilter: 'all',
  });

  const dispatchSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/routes/dispatch.tsx'), 'utf8');
  assert.ok(dispatchSrc.includes('DEFAULT_ACTIVE_ONLY_STATUS_FILTER'));
  const toolbarSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueToolbar.tsx'),
    'utf8'
  );
  assert.ok(toolbarSrc.includes('useRef<string>(DEFAULT_ACTIVE_ONLY_STATUS_FILTER)'));
  console.log('   ✅ Passed Active Only status filter default & policy normalizer.\n');
}

function testPureIconStatusPills(): void {
  console.log('2️⃣  Testing DispatchStatusBadge pure inline SVG icon pills across all 12 statuses...');

  const expectedCases: ReadonlyArray<{
    status: TripStatus;
    colorToken: string;
    tooltip: string;
    label: string;
  }> = [
    { status: 'unconfirmed', colorToken: 'bg-amber-100', tooltip: 'Unconfirmed — Awaiting dispatch review', label: 'Unconfirmed' },
    { status: 'confirmed', colorToken: 'bg-emerald-100', tooltip: 'Confirmed — Ready for dispatch', label: 'Confirmed' },
    { status: 'pending', colorToken: 'bg-amber-50', tooltip: 'Pending — Queued', label: 'Pending' },
    { status: 'offered', colorToken: 'bg-sky-100', tooltip: 'Offered — Waiting for driver response', label: 'Offered' },
    { status: 'assigned', colorToken: 'bg-blue-100', tooltip: 'Assigned to driver', label: 'Assigned' },
    { status: 'accepted', colorToken: 'bg-purple-100', tooltip: 'Accepted — Driver acknowledged', label: 'Accepted' },
    { status: 'en_route', colorToken: 'bg-indigo-100', tooltip: 'En Route to pickup', label: 'En Route' },
    { status: 'arrived', colorToken: 'bg-orange-100', tooltip: 'Arrived at pickup', label: 'Arrived' },
    { status: 'in_progress', colorToken: 'bg-emerald-100', tooltip: 'In Progress — Passenger on board', label: 'In Progress' },
    { status: 'completed', colorToken: 'bg-emerald-700', tooltip: 'Completed', label: 'Completed' },
    { status: 'cancelled', colorToken: 'bg-rose-800', tooltip: 'Cancelled', label: 'Cancelled' },
    { status: 'declined', colorToken: 'bg-slate-200', tooltip: 'Declined', label: 'Declined' },
  ];

  for (const c of expectedCases) {
    const meta = resolveDispatchStatusMeta(c.status);
    assert.equal(meta.tooltip, c.tooltip);
    const compactHtml = renderToStaticMarkup(getDispatchStatusBadge(c.status));
    assert.ok(compactHtml.includes('<svg'), `Expected inline <svg in compact badge for ${c.status}`);
    assert.ok(compactHtml.includes(c.colorToken), `Expected ${c.colorToken} in badge for ${c.status}`);
    assert.ok(compactHtml.includes(`title="${c.tooltip}"`), `Expected title tooltip for ${c.status}`);
    assert.ok(!compactHtml.includes(`<span>${c.label}</span>`), `Compact badge for ${c.status} must be pure icon`);

    const fullHtml = renderToStaticMarkup(getDispatchStatusBadge(c.status, { compact: false }));
    assert.ok(fullHtml.includes('<svg') && fullHtml.includes(`<span>${c.label}</span>`));
  }

  // Uppercase variants map to identical canonical icons & tooltips
  assert.equal(resolveDispatchStatusMeta('UNCONFIRMED').tooltip, 'Unconfirmed — Awaiting dispatch review');
  assert.equal(resolveDispatchStatusMeta('CONFIRMED').tooltip, 'Confirmed — Ready for dispatch');
  assert.equal(resolveDispatchStatusMeta('DECLINED').tooltip, 'Declined');
  console.log('   ✅ Passed pure SVG icon status pills across all 12 lifecycle statuses.\n');
}

function testQueueColumnsSelectorAndMinWidth(): void {
  console.log('3️⃣  Testing Columns ▾ presets, storage round-trip, pinned Action & dynamic minWidth...');

  for (const [presetKey, cols] of [
    ['standard', DEFAULT_QUEUE_COLUMNS],
    ['full_desk', FULL_DESK_QUEUE_COLUMNS],
    ['compact_dock', COMPACT_DOCK_QUEUE_COLUMNS],
  ] as const) {
    const raw = serializeQueueColumns(cols);
    const parsed = parseStoredQueueColumns(raw);
    assert.deepEqual(parsed, [...cols]);
    assert.equal(resolveActiveQueueColumnPreset(parsed), presetKey);
  }

  assert.deepEqual(parseStoredQueueColumns(null), [...DEFAULT_QUEUE_COLUMNS]);
  assert.deepEqual(parseStoredQueueColumns('{bad-json'), [...DEFAULT_QUEUE_COLUMNS]);
  assert.deepEqual(parseStoredQueueColumns('["action"]'), [...DEFAULT_QUEUE_COLUMNS]);

  // 'action' stays pinned & last remaining non-action column cannot be unchecked
  assert.deepEqual(toggleQueueColumnSelection(DEFAULT_QUEUE_COLUMNS, 'action'), [...DEFAULT_QUEUE_COLUMNS]);
  const singleDataCol = parseStoredQueueColumns('["date_time"]');
  assert.deepEqual(singleDataCol, ['date_time', 'action']);
  assert.deepEqual(toggleQueueColumnSelection(singleDataCol, 'date_time'), ['date_time', 'action']);

  // Dynamic minWidth scales down strictly as columns are hidden
  const fullW = computeQueueTableMinWidthPx(FULL_DESK_QUEUE_COLUMNS);
  const stdW = computeQueueTableMinWidthPx(DEFAULT_QUEUE_COLUMNS);
  const compactW = computeQueueTableMinWidthPx(COMPACT_DOCK_QUEUE_COLUMNS);
  const minW = computeQueueTableMinWidthPx(['date_time', 'action']);
  assert.ok(fullW > stdW && stdW > compactW && compactW > minW);

  // Hiding columns prevents unnecessary Cards (Auto) fallback at 820px!
  const stdAt820 = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'auto', isDesktop: true, queueWidthPx: 820, baseMinTableWidthPx: stdW,
  });
  const compactAt820 = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'auto', isDesktop: true, queueWidthPx: 820, baseMinTableWidthPx: compactW,
  });
  assert.equal(stdAt820.effectiveDisplayLayout, 'cards');
  assert.equal(compactAt820.effectiveDisplayLayout, 'table');

  const colsDropdownSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueColumnsDropdown.tsx'),
    'utf8'
  );
  assert.equal(DISPATCH_QUEUE_COLUMNS_STORAGE_KEY, 'ct_dispatch_table_columns_v1');
  assert.ok(colsDropdownSrc.includes('createPortal'));
  assert.ok(colsDropdownSrc.includes('document.body'));
  assert.ok(colsDropdownSrc.includes('z-[99999]'));
  assert.ok(colsDropdownSrc.includes('data-ui-select-portal="true"'));
  assert.ok(colsDropdownSrc.includes('coords !== null'));
  assert.ok(colsDropdownSrc.includes('const initial = computeCoords();'));
  assert.equal(colsDropdownSrc.includes('type="checkbox"'), false);
  console.log('   ✅ Passed Columns ▾ portal selector, presets & dynamic minWidth scaling.\n');
}

function testMultiColumnSorting(): void {
  console.log('4️⃣  Testing cycleQueueColumnSort & sortQueueTripsByColumn across all columns...');

  // 3-click cycle on 'date' and 'price' + cross-column jump
  const d1 = cycleQueueColumnSort(DEFAULT_QUEUE_COLUMN_SORT, 'date');
  assert.deepEqual(d1, { column: 'date', direction: 'asc' });
  const d2 = cycleQueueColumnSort(d1, 'date');
  assert.deepEqual(d2, { column: 'date', direction: 'desc' });
  assert.deepEqual(cycleQueueColumnSort(d2, 'date'), { column: 'smart', direction: 'asc' });

  const p1 = cycleQueueColumnSort(DEFAULT_QUEUE_COLUMN_SORT, 'price');
  assert.deepEqual(p1, { column: 'price', direction: 'asc' });
  assert.deepEqual(cycleQueueColumnSort(p1, 'passenger'), { column: 'passenger', direction: 'asc' });
  const p2 = cycleQueueColumnSort(p1, 'price');
  assert.deepEqual(p2, { column: 'price', direction: 'desc' });
  assert.deepEqual(cycleQueueColumnSort(p2, 'price'), { column: 'smart', direction: 'asc' });

  const trips: Trip[] = [
    makeTrip('trip-30', {
      status: 'in_progress',
      scheduledPickupTime: '2026-11-24T18:00:00.000Z',
      passenger: { firstName: 'Zara', lastName: 'Cole', email: '', phone: '1', passengerCount: 1, luggageCount: 0 },
      pickupLocation: { address: '900 Olive Blvd' },
      dropoffLocation: { address: '300 Market St' },
      assignedDriverId: 'drv-2',
      vehicleTier: 'xl',
      pricing: { ...makeTrip('x').pricing, totalFare: 95 },
      payment: { method: 'cash', status: 'pending', amount: 95 },
    }),
    makeTrip('trip-10', {
      status: 'unconfirmed',
      scheduledPickupTime: '2026-11-24T12:00:00.000Z',
      passenger: { firstName: 'Aaron', lastName: 'Bell', email: '', phone: '2', passengerCount: 1, luggageCount: 0 },
      pickupLocation: { address: '100 Clayton Rd' },
      dropoffLocation: { address: '100 Airport Terminal' },
      assignedDriverId: 'drv-1',
      vehicleTier: 'sedan',
      pricing: { ...makeTrip('x').pricing, totalFare: 28.5 },
      payment: { method: 'account', status: 'pending', amount: 28.5 },
    }),
    makeTrip('trip-20', {
      status: 'assigned',
      scheduledPickupTime: '2026-11-24T15:00:00.000Z',
      passenger: { firstName: 'Maya', lastName: 'Lin', email: '', phone: '3', passengerCount: 1, luggageCount: 0 },
      pickupLocation: { address: '500 Conway Rd' },
      dropoffLocation: { address: '200 Forest Park' },
      assignedDriverId: null,
      vehicleTier: 'minivan',
      pricing: { ...makeTrip('x').pricing, totalFare: 62 },
      payment: { method: 'card', status: 'pending', amount: 62 },
    }),
  ];

  const sortOpts = {
    drivers: [
      { id: 'drv-1', formattedLabel: 'Cab #101 · Adam' },
      { id: 'drv-2', formattedLabel: 'Cab #204 · Victor' },
    ],
  };

  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'trip_id', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'trip_id', direction: 'desc' }).map((t) => t.id), ['trip-30', 'trip-20', 'trip-10']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'date', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'passenger', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'pickup', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'dropoff', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'driver', direction: 'asc' }, sortOpts).map((t) => t.id), ['trip-10', 'trip-30', 'trip-20']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'vehicle', direction: 'asc' }).map((t) => t.id), ['trip-30', 'trip-20', 'trip-10']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'price', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'price', direction: 'desc' }).map((t) => t.id), ['trip-30', 'trip-20', 'trip-10']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'payment', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'status', direction: 'asc' }).map((t) => t.id), ['trip-10', 'trip-20', 'trip-30']);
  assert.deepEqual(sortQueueTripsByColumn(trips, { column: 'status', direction: 'desc' }).map((t) => t.id), ['trip-30', 'trip-20', 'trip-10']);
  console.log('   ✅ Passed multi-column sorting across all 10 data columns.\n');
}

function testClickableTripIdsZeroSelectAndGuardrails(): void {
  console.log('5️⃣  Testing Clickable #TRIP_ID links, 0 native <select>, ceilings & immutable files...');

  const sidebarSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/workspace/DispatchLeftBookingSidebar.tsx'),
    'utf8'
  );
  assert.ok(
    sidebarSrc.includes("tripActions.onReview(activeEditTrip, 'details')") &&
      sidebarSrc.includes('title="Open Trip Details & Audit"')
  );

  const hudSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/map/MapRouteOverlayHud.tsx'),
    'utf8'
  );
  assert.ok(
    hudSrc.includes('onOpenTripDetails(activeRoute.tripId!)') &&
      hudSrc.includes('title="Open Trip Details & Audit"')
  );

  const tableViewSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  assert.ok(
    tableViewSrc.includes("visibleColSet.has('trip_id')") &&
      tableViewSrc.includes('Live ↺') &&
      tableViewSrc.includes('title="Open Trip Details & Audit"')
  );

  // Global Zero-Native-<select> Gate across all app/**/*.tsx
  const allTsx = collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/);
  assert.ok(allTsx.length >= 200);
  const selectOffenders = allTsx
    .filter((f) => /<select\b/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT_DIR, f));
  assert.deepEqual(selectOffenders, []);

  const ceilings: Array<[string, number]> = [
    ['app/routes/dispatch.tsx', 1600],
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/components/domain/dispatch/queue/TripQueueTableView.tsx', 615],
    ['app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx', 540],
    ['app/components/domain/dispatch/queue/TripQueueToolbar.tsx', 1150],
    ['app/components/domain/admin/rules/DispatchConsoleSettingsPanel.tsx', 400],
    ['app/components/domain/dispatch/queue/DispatchStatusBadge.tsx', 240],
    ['app/components/domain/dispatch/queue/trip-queue-columns.util.ts', 240],
    ['app/components/domain/dispatch/queue/TripQueueColumnsDropdown.tsx', 260],
    ['scripts/test-queue-columns-sorting-and-icons-phase66.ts', 380],
  ];
  for (const [rel, max] of ceilings) {
    const lines = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8').split(/\r?\n/).length;
    assert.ok(lines < max, `${rel} exceeded ceiling: ${lines} >= ${max}`);
  }

  const immutableGit = execSync(
    'git status --porcelain firestore.rules vercel.json app/components/domain/dispatch/DriverAssignDropdown.tsx',
    { cwd: ROOT_DIR, encoding: 'utf8' }
  ).trim();
  assert.equal(immutableGit, '', `Immutable files touched: ${immutableGit}`);

  const forbidden = ['HUD Now', '[Avail]', '[En Route]', '[Busy]', '[Break]', '[Off]'];
  for (const file of collectFiles(path.join(ROOT_DIR, 'app'), /\.(ts|tsx)$/)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const token of forbidden) {
      assert.equal(src.includes(token), false, `Forbidden "${token}" in ${path.relative(ROOT_DIR, file)}`);
    }
  }
  console.log('   ✅ Passed clickable #TRIP_ID links, 0 native <select>, ceilings & hygiene gates.\n');
}

function main(): void {
  console.log('🚀 Running Platform Phase 66 Queue Active Only, Icon Statuses, Columns, Sorting & #TRIP_ID Suite...\n');
  testActiveOnlyStatusFilterDefault();
  testPureIconStatusPills();
  testQueueColumnsSelectorAndMinWidth();
  testMultiColumnSorting();
  testClickableTripIdsZeroSelectAndGuardrails();
  console.log('🎉 ALL PHASE 66 VERIFICATION ASSERTIONS PASSED!');
}

main();
