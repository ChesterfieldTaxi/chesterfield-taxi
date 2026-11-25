/**
 * Unit Tests for Phase 78: Assignment Dropdown Status & Time-to-Pickup Urgency
 *
 * Run: npx tsx scripts/test-assignment-urgency.ts
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
} from '../app/core/types/config';
import {
  resolveAssignmentDropdownTone,
  resolveEffectivePickupMs,
} from '../app/core/services/dispatch/assignment-urgency.service';
import type { Trip } from '../app/core/types/trip';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    failed++;
  }
}

const BASE_NOW_MS = Date.parse('2026-11-25T18:00:00.000Z');
const minsFromNowIso = (mins: number) => new Date(BASE_NOW_MS + mins * 60_000).toISOString();

function makeTrip(overrides: Partial<Trip> = {}): Partial<Trip> {
  return {
    id: 'trip-test-1',
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    assignedDriverId: null,
    scheduledPickupTime: minsFromNowIso(120),
    createdAt: minsFromNowIso(-30),
    pickupLocation: { address: '123 Olive Blvd, Chesterfield, MO' },
    dropoffLocation: { address: '456 Clayton Rd, St. Louis, MO' },
    ...overrides,
  };
}

console.log('\n=== Phase 78: Assignment Urgency & Config Tests ===\n');

test('Config defaults and clamping for Phase 78 fields', () => {
  assert.equal(DEFAULT_DISPATCH_AUTOMATION_CONFIG.slaWarningMinutes, 60);
  assert.equal(DEFAULT_DISPATCH_AUTOMATION_CONFIG.slaCriticalMinutes, 15);
  assert.equal(DEFAULT_DISPATCH_AUTOMATION_CONFIG.airportPickupBufferMinutes, 30);
  assert.equal(DEFAULT_DISPATCH_AUTOMATION_CONFIG.asapUnassignedGraceMinutes, 15);

  const clampedLow = normalizeDispatchAutomationConfig({
    airportPickupBufferMinutes: -10,
    asapUnassignedGraceMinutes: 0,
  });
  assert.equal(clampedLow.airportPickupBufferMinutes, 0);
  assert.equal(clampedLow.asapUnassignedGraceMinutes, 1);

  const clampedHigh = normalizeDispatchAutomationConfig({
    airportPickupBufferMinutes: 999,
    asapUnassignedGraceMinutes: 999,
  });
  assert.equal(clampedHigh.airportPickupBufferMinutes, 180);
  assert.equal(clampedHigh.asapUnassignedGraceMinutes, 120);
});

test('resolveEffectivePickupMs uses flightTelemetry arrival + airportPickupBufferMinutes for airport trips', () => {
  const estArrival = minsFromNowIso(20);
  const airportTrip = makeTrip({
    pickupLocation: { address: 'Lambert St. Louis International Airport (STL)' },
    scheduledPickupTime: minsFromNowIso(10),
    flightTelemetry: {
      flightIdent: 'AA1234',
      airlineCode: 'AA',
      flightNumber: '1234',
      serviceDate: '2026-11-25',
      status: 'en_route',
      scheduledArrivalIso: minsFromNowIso(5),
      estimatedArrivalIso: estArrival,
      delayMinutes: 15,
      provider: 'fallback',
      isSimulatedFallback: true,
      checkedAt: BASE_NOW_MS.toString(),
      cacheExpiresAt: BASE_NOW_MS.toString(),
    },
  });

  // 20m + default 30m buffer = 50m from BASE_NOW_MS
  const effectiveMs = resolveEffectivePickupMs(airportTrip);
  assert.equal(effectiveMs, Date.parse(estArrival) + 30 * 60_000);

  // Custom 45m buffer
  const customMs = resolveEffectivePickupMs(airportTrip, { airportPickupBufferMinutes: 45 });
  assert.equal(customMs, Date.parse(estArrival) + 45 * 60_000);

  // Fallback to scheduledArrivalIso when estimatedArrivalIso missing
  const schedOnlyAirport = makeTrip({
    metadata: { isAirportTrip: true },
    scheduledPickupTime: minsFromNowIso(10),
    flightTelemetry: {
      ...airportTrip.flightTelemetry!,
      estimatedArrivalIso: undefined,
      scheduledArrivalIso: minsFromNowIso(25),
    },
  });
  assert.equal(
    resolveEffectivePickupMs(schedOnlyAirport),
    Date.parse(minsFromNowIso(25)) + 30 * 60_000
  );

  // Fallback to scheduledPickupTime when no flightTelemetry arrival ISO
  const noTelemetryAirport = makeTrip({
    metadata: { isAirportTrip: true },
    scheduledPickupTime: minsFromNowIso(40),
  });
  assert.equal(resolveEffectivePickupMs(noTelemetryAirport), Date.parse(minsFromNowIso(40)));
});

test('Staged trips resolve to staged_white', () => {
  const stagedByField = makeTrip({ plannedDriverId: 'drv-1', status: 'CONFIRMED' });
  assert.equal(
    resolveAssignmentDropdownTone(stagedByField, null, BASE_NOW_MS).tone,
    'staged_white'
  );

  const stagedByOption = makeTrip({ status: 'pending' });
  assert.equal(
    resolveAssignmentDropdownTone(stagedByOption, null, BASE_NOW_MS, { isStageMode: true }).tone,
    'staged_white'
  );
  assert.equal(
    resolveAssignmentDropdownTone(stagedByOption, null, BASE_NOW_MS, { hasStaged: true }).tone,
    'staged_white'
  );
});

test('Offered trips and active auto-offer cascades resolve to offered_purple', () => {
  const offeredStatus = makeTrip({ status: 'offered', scheduledPickupTime: minsFromNowIso(5) });
  assert.equal(
    resolveAssignmentDropdownTone(offeredStatus, null, BASE_NOW_MS).tone,
    'offered_purple'
  );

  const activeCascade = makeTrip({
    status: 'pending',
    offerCascade: {
      state: 'active',
      mode: 'sequential_cascade',
      activeOfferedDriverId: 'drv-1',
      offerStartedAt: minsFromNowIso(-1),
      offerExpiresAt: minsFromNowIso(1),
      timeoutSeconds: 45,
      cascadeAttempt: 1,
      maxAttempts: 3,
      attemptedDriverIds: ['drv-1'],
      strategy: 'nearest_in_zone',
    },
  });
  assert.equal(
    resolveAssignmentDropdownTone(activeCascade, null, BASE_NOW_MS).tone,
    'offered_purple'
  );
});

test('Assigned scheduled lifecycle stays assigned_green unless late pre-arrival', () => {
  // On-time assigned
  const onTimeAssigned = makeTrip({
    status: 'assigned',
    assignedDriverId: 'drv-1',
    scheduledPickupTime: minsFromNowIso(20),
  });
  assert.equal(
    resolveAssignmentDropdownTone(onTimeAssigned, null, BASE_NOW_MS).tone,
    'assigned_green'
  );

  // Late pre-arrival (assigned or en_route past pickup) -> critical_red
  const lateAssigned = makeTrip({
    status: 'assigned',
    assignedDriverId: 'drv-1',
    scheduledPickupTime: minsFromNowIso(-1),
  });
  assert.equal(
    resolveAssignmentDropdownTone(lateAssigned, null, BASE_NOW_MS).tone,
    'critical_red'
  );

  const lateEnRoute = makeTrip({
    status: 'en_route',
    assignedDriverId: 'drv-1',
    scheduledPickupTime: minsFromNowIso(-5),
  });
  assert.equal(
    resolveAssignmentDropdownTone(lateEnRoute, null, BASE_NOW_MS).tone,
    'critical_red'
  );

  // Arrived / in_progress / completed past pickup -> stays assigned_green
  for (const status of ['arrived', 'in_progress', 'completed'] as const) {
    const trip = makeTrip({
      status,
      assignedDriverId: 'drv-1',
      scheduledPickupTime: minsFromNowIso(-30),
    });
    assert.equal(
      resolveAssignmentDropdownTone(trip, null, BASE_NOW_MS).tone,
      'assigned_green',
      `Expected ${status} to remain assigned_green`
    );
  }
});

test('Unassigned scheduled trips follow blue (>60m) -> orange (<=60m) -> red (<=15m / overdue)', () => {
  for (const status of ['pending', 'CONFIRMED', 'UNCONFIRMED'] as const) {
    const farTrip = makeTrip({ status, scheduledPickupTime: minsFromNowIso(90) });
    assert.equal(
      resolveAssignmentDropdownTone(farTrip, null, BASE_NOW_MS).tone,
      'unassigned_blue'
    );

    const warnTrip = makeTrip({ status, scheduledPickupTime: minsFromNowIso(45) });
    assert.equal(
      resolveAssignmentDropdownTone(warnTrip, null, BASE_NOW_MS).tone,
      'warning_orange'
    );

    const critTrip = makeTrip({ status, scheduledPickupTime: minsFromNowIso(15) });
    assert.equal(
      resolveAssignmentDropdownTone(critTrip, null, BASE_NOW_MS).tone,
      'critical_red'
    );

    const overdueTrip = makeTrip({ status, scheduledPickupTime: minsFromNowIso(-10) });
    assert.equal(
      resolveAssignmentDropdownTone(overdueTrip, null, BASE_NOW_MS).tone,
      'critical_red'
    );
  }

  // Airport trip with arrival at +20m + 30m buffer = +50m -> warning_orange (not critical_red)
  const airportWarn = makeTrip({
    status: 'CONFIRMED',
    pickupLocation: { address: 'STL Airport Terminal 1' },
    scheduledPickupTime: minsFromNowIso(10),
    flightTelemetry: {
      flightIdent: 'WN400',
      airlineCode: 'WN',
      flightNumber: '400',
      serviceDate: '2026-11-25',
      status: 'en_route',
      estimatedArrivalIso: minsFromNowIso(20),
      delayMinutes: 0,
      provider: 'fallback',
      isSimulatedFallback: true,
      checkedAt: minsFromNowIso(-5),
      cacheExpiresAt: minsFromNowIso(25),
    },
  });
  assert.equal(
    resolveAssignmentDropdownTone(airportWarn, null, BASE_NOW_MS).tone,
    'warning_orange'
  );
});

test('ASAP trips: orange during grace window, red after grace, green when assigned', () => {
  const asapWithinGrace = makeTrip({
    bookingType: 'asap',
    status: 'pending',
    scheduledPickupTime: undefined,
    createdAt: minsFromNowIso(-10),
  });
  assert.equal(
    resolveAssignmentDropdownTone(asapWithinGrace, null, BASE_NOW_MS).tone,
    'warning_orange'
  );

  const asapAtGraceBoundary = makeTrip({
    bookingType: 'asap',
    status: 'CONFIRMED',
    scheduledPickupTime: undefined,
    createdAt: minsFromNowIso(-15),
  });
  assert.equal(
    resolveAssignmentDropdownTone(asapAtGraceBoundary, null, BASE_NOW_MS).tone,
    'warning_orange'
  );

  const asapPastGrace = makeTrip({
    bookingType: 'asap',
    status: 'pending',
    scheduledPickupTime: undefined,
    createdAt: minsFromNowIso(-16),
  });
  assert.equal(
    resolveAssignmentDropdownTone(asapPastGrace, null, BASE_NOW_MS).tone,
    'critical_red'
  );

  // Custom grace window (30m) keeps 20m-old ASAP trip in warning_orange
  assert.equal(
    resolveAssignmentDropdownTone(
      makeTrip({
        bookingType: 'asap',
        status: 'pending',
        scheduledPickupTime: undefined,
        createdAt: minsFromNowIso(-20),
      }),
      { asapUnassignedGraceMinutes: 30 },
      BASE_NOW_MS
    ).tone,
    'warning_orange'
  );

  // Assigned ASAP stays assigned_green even 90m after createdAt
  const assignedAsap = makeTrip({
    bookingType: 'asap',
    status: 'assigned',
    assignedDriverId: 'drv-2',
    scheduledPickupTime: undefined,
    createdAt: minsFromNowIso(-90),
  });
  assert.equal(
    resolveAssignmentDropdownTone(assignedAsap, null, BASE_NOW_MS).tone,
    'assigned_green'
  );
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
