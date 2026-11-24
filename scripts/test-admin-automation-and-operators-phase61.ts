/**
 * Phase 61 Automated Verification Suite (`scripts/test-admin-automation-and-operators-phase61.ts`)
 *
 * Verifies:
 * 1. `normalizeDispatchConsoleConfig`, `normalizeStandingOrdersConfig` (`buildUsFederalHolidaysForYear`),
 *    and `normalizeDriverAppPoliciesConfig` (`mapDriverPolicyNavToPreferredApp`) defaults, bounds clamping,
 *    and `AdminConfigService` bidirectional persistence (`enableRealtimeRouting` & `UniversalExtrasService`).
 * 2. `evaluateDispatchBookingConflicts` with `conflictGuardEnabled: false` (`signature: 'disabled'`)
 *    and custom `nearbyWindowMinutes` (`45m` vs `120m`) & `tightTurnaroundMinutes` (`10m` vs `30m`).
 * 3. `standing-order.service.ts` automatically excluding `holidayCalendarDates` when `skipHolidays: true`
 *    and respecting `defaultHorizonDays`, `maxHorizonDays`, and `defaultAssignmentMode`.
 * 4. `buildPendingDriverUpdateAck` (`requireDriverUpdateAck: false` bypass) and `isDriverUpdateAckOverdue`
 *    threshold math (`unacknowledgedAlertMinutes`) + `classifyAdminTripExceptions` `isDriverAckOverdue`.
 * 5. `SUB_PAGES.operators` resolution in `resolveAdminTabAndSub` (`roster`, `permissions`, `driver-policies`, `onboarding`).
 * 6. Static architecture & hygiene guardrails:
 *    - `AdminRulesTab.tsx < 350`L; every new panel in `app/components/domain/admin/rules/` `< 450`L.
 *    - `AdminOperatorsTab.tsx < 350`L; every file in `app/components/domain/admin/operators/` `< 450`L.
 *    - `admin.tsx < 1,000`L, `dispatch.tsx < 1,600`L, `driver.tsx < 1,900`L, `DriverLiveMeterCard.tsx < 1,080`L.
 *    - `firestore.rules` and `vercel.json` untouched (`git status --porcelain firestore.rules vercel.json`).
 *    - Zero `"HUD Now"` and zero `'[Avail]'` / `'[En Route]'` / `'[Busy]'` / `'[Break]'` / `'[Off]'` strings across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildUsFederalHolidaysForYear,
  canOperatorConfigureLeadWindows,
  mapDriverPolicyNavToPreferredApp,
  normalizeDispatchConsoleConfig,
  normalizeDriverAppPoliciesConfig,
  normalizeStandingOrdersConfig,
} from '../app/core/types/config';
import { getAdminConfigService } from '../app/core/services/config/admin-config.service';
import { getUniversalExtrasService } from '../app/core/services/pricing/extras.service';
import { evaluateDispatchBookingConflicts } from '../app/core/services/dispatch/booking-conflict-checker.service';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import {
  createStandingOrderSeries,
  extendStandingOrderHorizon,
  registerStandingOrderFromDispatchBooking,
  resetStandingOrdersForTests,
  resolveTripLocalDate,
} from '../app/core/services/dispatch/standing-order.service';
import {
  buildPendingDriverUpdateAck,
  isDriverUpdateAckOverdue,
} from '../app/core/services/dispatch/trip-update-ack.service';
import { classifyAdminTripExceptions } from '../app/core/utils/admin-trips-exceptions.util';
import { SUB_PAGES, resolveAdminTabAndSub } from '../app/core/utils/admin-nav.util';
import type { Trip, TripPricing } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();

function collectAppTsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectAppTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const SAMPLE_PRICING: TripPricing = {
  baseFare: 10,
  distanceMiles: 16,
  durationMinutes: 25,
  distanceRate: 36,
  timeRate: 0,
  vehicleMultiplier: 1,
  surgeMultiplier: 1,
  discountAmount: 0,
  subtotal: 46,
  totalFare: 46,
  currency: 'USD',
};

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const nowIso = '2026-11-23T12:00:00.000Z';
  return {
    id: 'trip-p61-001',
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-24T15:00:00.000Z',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: { address: '16401 Swingley Ridge Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    passenger: {
      firstName: 'Elena',
      lastName: 'Rostova',
      email: 'elena@example.com',
      phone: '(314) 555-0188',
      passengerCount: 1,
      luggageCount: 1,
    },
    vehicleTier: 'standard',
    pricing: SAMPLE_PRICING,
    payment: { method: 'card', status: 'pending', amount: 46 },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

async function testConfigNormalizersAndBidirectionalSync(): Promise<void> {
  console.log('1️⃣  Testing Phase 61 Config Normalizers & Bidirectional Sync...');

  // 1a. DispatchConsoleSettingsConfig
  const defConsole = normalizeDispatchConsoleConfig(undefined, undefined);
  assert.equal(defConsole.conflictGuardEnabled, true);
  assert.equal(defConsole.nearbyWindowMinutes, 90);
  assert.equal(defConsole.tightTurnaroundMinutes, 15);
  assert.equal(defConsole.autoClearFormAfterCreate, true);
  assert.equal(defConsole.defaultQueueLayout, 'auto');
  assert.equal(defConsole.maxConcurrentDraftTabs, 8);
  assert.equal(defConsole.enableRealtimeRouting, false);

  const clampedConsole = normalizeDispatchConsoleConfig(
    {
      conflictGuardEnabled: false,
      nearbyWindowMinutes: 999,
      tightTurnaroundMinutes: 1,
      autoClearFormAfterCreate: false,
      defaultQueueLayout: 'compact',
      maxConcurrentDraftTabs: 50,
    },
    true
  );
  assert.equal(clampedConsole.conflictGuardEnabled, false);
  assert.equal(clampedConsole.nearbyWindowMinutes, 360);
  assert.equal(clampedConsole.tightTurnaroundMinutes, 5);
  assert.equal(clampedConsole.autoClearFormAfterCreate, false);
  assert.equal(clampedConsole.defaultQueueLayout, 'compact');
  assert.equal(clampedConsole.maxConcurrentDraftTabs, 20);
  assert.equal(clampedConsole.enableRealtimeRouting, true);

  // 1b. StandingOrdersGovernanceConfig + US Holiday Calendar
  const holidays2026 = buildUsFederalHolidaysForYear(2026);
  const dates2026 = new Map(holidays2026.map((h) => [h.name, h.date]));
  assert.equal(dates2026.get("New Year's Day"), '2026-01-01');
  assert.equal(dates2026.get('Memorial Day'), '2026-05-25');
  assert.equal(dates2026.get('Independence Day'), '2026-07-04');
  assert.equal(dates2026.get('Labor Day'), '2026-09-07');
  assert.equal(dates2026.get('Thanksgiving Day'), '2026-11-26');
  assert.equal(dates2026.get('Christmas Eve'), '2026-12-24');
  assert.equal(dates2026.get('Christmas Day'), '2026-12-25');

  const defStanding = normalizeStandingOrdersConfig(undefined);
  assert.equal(defStanding.defaultHorizonDays, 14);
  assert.equal(defStanding.maxHorizonDays, 60);
  assert.equal(defStanding.defaultAssignmentMode, 'stage_hold');
  assert.equal(defStanding.defaultSkipHolidays, true);
  assert.ok(defStanding.holidayCalendarDates.length >= 14);

  const customStanding = normalizeStandingOrdersConfig({
    defaultHorizonDays: 30,
    maxHorizonDays: 400,
    defaultAssignmentMode: 'send_to_driver',
    defaultSkipHolidays: false,
    holidayCalendarDates: [
      { date: '2026-12-31', name: "New Year's Eve" },
      { date: 'invalid-date', name: 'Bad' },
      { date: '2026-11-26', name: 'Thanksgiving' },
    ],
  });
  assert.equal(customStanding.defaultHorizonDays, 30);
  assert.equal(customStanding.maxHorizonDays, 180);
  assert.equal(customStanding.defaultAssignmentMode, 'send_to_driver');
  assert.equal(customStanding.defaultSkipHolidays, false);
  assert.deepEqual(
    customStanding.holidayCalendarDates.map((h) => h.date),
    ['2026-11-26', '2026-12-31']
  );

  // 1c. DriverAppPoliciesConfig + UniversalExtras fallback + Bidirectional Sync
  const defDriver = normalizeDriverAppPoliciesConfig(undefined, {
    intermediateStopFreeWaitingMinutes: 8,
    curbWaitingRatePerMinute: 0.75,
  });
  assert.equal(defDriver.intermediateStopFreeWaitingMinutes, 8);
  assert.equal(defDriver.intermediateStopExcessWaitRatePerMinute, 0.75);
  assert.equal(defDriver.requireDriverUpdateAck, true);
  assert.equal(defDriver.unacknowledgedAlertMinutes, 5);
  assert.equal(defDriver.enforceScreenWakeLockOnDuty, true);
  assert.equal(defDriver.enableAudibleOfferChime, true);
  assert.equal(defDriver.defaultNavigationProvider, 'google_maps');

  const clampedDriver = normalizeDriverAppPoliciesConfig({
    intermediateStopFreeWaitingMinutes: 99,
    intermediateStopExcessWaitRatePerMinute: 45,
    requireDriverUpdateAck: false,
    unacknowledgedAlertMinutes: 0,
    enforceScreenWakeLockOnDuty: false,
    enableAudibleOfferChime: false,
    defaultNavigationProvider: 'waze',
  });
  assert.equal(clampedDriver.intermediateStopFreeWaitingMinutes, 30);
  assert.equal(clampedDriver.intermediateStopExcessWaitRatePerMinute, 10);
  assert.equal(clampedDriver.requireDriverUpdateAck, false);
  assert.equal(clampedDriver.unacknowledgedAlertMinutes, 1);
  assert.equal(mapDriverPolicyNavToPreferredApp('apple_maps'), 'apple');
  assert.equal(mapDriverPolicyNavToPreferredApp('waze'), 'waze');
  assert.equal(mapDriverPolicyNavToPreferredApp('google_maps'), 'google');

  // Verify AdminConfigService.updateSettings syncs DriverAppPoliciesConfig -> UniversalExtrasService
  const cfgSvc = getAdminConfigService();
  const updatedSettings = await cfgSvc.updateSettings({
    dispatchConsoleConfig: {
      ...defConsole,
      enableRealtimeRouting: true,
    },
    driverAppConfig: {
      ...defDriver,
      intermediateStopFreeWaitingMinutes: 7,
      intermediateStopExcessWaitRatePerMinute: 0.85,
    },
  });
  assert.equal(updatedSettings.enableRealtimeRouting, true);
  const syncedExtras = getUniversalExtrasService().getCached();
  assert.equal(syncedExtras.intermediateStopFreeWaitingMinutes, 7);
  assert.equal(syncedExtras.curbWaitingRatePerMinute, 0.85);

  // Restore defaults cleanly
  await cfgSvc.updateSettings({
    enableRealtimeRouting: false,
    driverAppConfig: {
      intermediateStopFreeWaitingMinutes: 5,
      intermediateStopExcessWaitRatePerMinute: 0.5,
      requireDriverUpdateAck: true,
      unacknowledgedAlertMinutes: 5,
      enforceScreenWakeLockOnDuty: true,
      enableAudibleOfferChime: true,
      defaultNavigationProvider: 'google_maps',
    },
  });
}

function testConflictGuardOverrides(): void {
  console.log('2️⃣  Testing evaluateDispatchBookingConflicts with Live DispatchConsoleSettingsConfig...');

  const nowMs = new Date('2026-11-24T08:00:00').getTime();

  // Existing passenger trip at 10:00 (25m duration -> ends 10:25), assigned to drv-101
  const existingTrip = makeTrip({
    id: 'trip-existing-1000',
    scheduledPickupTime: new Date('2026-11-24T10:00:00').toISOString(),
    assignedDriverId: 'drv-101',
    status: 'assigned',
    pickupLocation: { address: '100 Main St, Chesterfield, MO' },
    dropoffLocation: { address: '500 Olive St, St. Louis, MO' },
  });

  // Candidate pickup at 11:05 (65m after 10:00; 40m after 10:25 dropoff):
  // - With nearbyWindowMinutes=45 -> NOT flagged as nearby (65 > 45)
  // - With nearbyWindowMinutes=120 -> FLAGGED as passenger_nearby_booking (65 <= 120)
  const narrowNearby = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-24',
    scheduledTime: '11:05',
    pickupAddress: '900 Clayton Rd, Clayton, MO',
    dropoffAddress: '200 Broadway, St. Louis, MO',
    estimatedDurationMinutes: 25,
    passengerName: 'Elena Rostova',
    phone: '(314) 555-0188',
    allTrips: [existingTrip],
    conflictConfig: { conflictGuardEnabled: true, nearbyWindowMinutes: 45 },
    nowMs,
  });
  assert.equal(narrowNearby.hasConflicts, false, '65m gap should pass when nearbyWindowMinutes = 45');

  const wideNearby = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-24',
    scheduledTime: '11:05',
    pickupAddress: '900 Clayton Rd, Clayton, MO',
    dropoffAddress: '200 Broadway, St. Louis, MO',
    estimatedDurationMinutes: 25,
    passengerName: 'Elena Rostova',
    phone: '(314) 555-0188',
    allTrips: [existingTrip],
    conflictConfig: { conflictGuardEnabled: true, nearbyWindowMinutes: 120 },
    nowMs,
  });
  assert.equal(wideNearby.hasConflicts, true, '65m gap must warn when nearbyWindowMinutes = 120');
  assert.ok(wideNearby.conflicts.some((c) => c.kind === 'passenger_nearby_booking'));

  // Driver tight turnaround: existingTrip ends at 10:25; candidate for DIFFERENT passenger at 10:45 (+20m buffer):
  // - tightTurnaroundMinutes = 10 -> OK (20m >= 10m)
  // - tightTurnaroundMinutes = 30 -> WARNING driver_tight_turnaround (20m < 30m)
  const tight10 = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-24',
    scheduledTime: '10:45',
    pickupAddress: '700 Market St, St. Louis, MO',
    dropoffAddress: '10701 Lambert International Blvd, St. Louis, MO',
    estimatedDurationMinutes: 25,
    passengerName: 'Marcus Vance',
    phone: '(314) 555-0999',
    driverId: 'drv-101',
    drivers: [{ id: 'drv-101', name: 'Mike T.', cabNumber: '101' }],
    allTrips: [existingTrip],
    conflictConfig: { conflictGuardEnabled: true, tightTurnaroundMinutes: 10 },
    nowMs,
  });
  assert.equal(tight10.hasConflicts, false, '+20m buffer should pass when tightTurnaroundMinutes = 10');

  const tight30 = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-24',
    scheduledTime: '10:45',
    pickupAddress: '700 Market St, St. Louis, MO',
    dropoffAddress: '10701 Lambert International Blvd, St. Louis, MO',
    estimatedDurationMinutes: 25,
    passengerName: 'Marcus Vance',
    phone: '(314) 555-0999',
    driverId: 'drv-101',
    drivers: [{ id: 'drv-101', name: 'Mike T.', cabNumber: '101' }],
    allTrips: [existingTrip],
    conflictConfig: { conflictGuardEnabled: true, tightTurnaroundMinutes: 30 },
    nowMs,
  });
  assert.equal(tight30.hasConflicts, true, '+20m buffer must warn when tightTurnaroundMinutes = 30');
  assert.ok(tight30.conflicts.some((c) => c.kind === 'driver_tight_turnaround'));

  // conflictGuardEnabled = false -> short-circuit even on exact duplicate!
  const disabledCheck = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-24',
    scheduledTime: '10:00',
    pickupAddress: '100 Main St, Chesterfield, MO',
    dropoffAddress: '500 Olive St, St. Louis, MO',
    estimatedDurationMinutes: 25,
    passengerName: 'Elena Rostova',
    phone: '(314) 555-0188',
    driverId: 'drv-101',
    allTrips: [existingTrip],
    conflictConfig: { conflictGuardEnabled: false },
    nowMs,
  });
  assert.equal(disabledCheck.hasConflicts, false);
  assert.equal(disabledCheck.signature, 'disabled');
}

async function testStandingOrderHolidayCalendarAndDefaults(): Promise<void> {
  console.log('3️⃣  Testing Standing Orders Holiday Calendar Exclusion & Governance Defaults...');

  resetStandingOrdersForTests();
  const bookingService = new MockBookingService();
  const nowMs = Date.parse('2026-11-23T12:00:00.000Z');

  const customGov = {
    defaultHorizonDays: 7 as const,
    maxHorizonDays: 30,
    defaultAssignmentMode: 'send_to_driver' as const,
    defaultSkipHolidays: true,
    holidayCalendarDates: [
      { date: '2026-11-26', name: 'Thanksgiving Day' },
      { date: '2026-11-27', name: 'Day After Thanksgiving' },
    ],
  };

  // Create series starting Mon 2026-11-23 with weekdays cadence, skipHolidays=true, and NO explicit preferredDriverMode
  const series = await createStandingOrderSeries({
    label: 'Holiday Commute Test',
    passenger: {
      firstName: 'David',
      lastName: 'Chen',
      phone: '(314) 555-0177',
      passengerCount: 1,
      luggageCount: 0,
    },
    route: {
      pickupLocation: { address: '400 Chesterfield Center, Chesterfield, MO' },
      dropoffLocation: { address: '800 N Lindbergh Blvd, Creve Coeur, MO' },
    },
    schedule: {
      startDate: '2026-11-23',
      pickupTime: '08:00',
      frequency: 'weekdays',
      skipDates: ['2026-11-25'], // Wed Nov 25 explicit skip
      skipHolidays: true,
    },
    standingOrdersConfig: customGov,
    vehicleTier: 'standard',
    pricingSnapshot: SAMPLE_PRICING,
    paymentMethod: 'account',
    preferredDriverId: 'drv-301',
    preferredDriverLabel: '#301 - Sarah K.',
    lastGeneratedDate: '2026-11-23',
    nowMs,
  });

  // Verify defaultAssignmentMode ('send_to_driver') applied and holiday dates merged into schedule.skipDates
  assert.equal(series.preferredDriverMode, 'send_to_driver');
  assert.deepEqual(series.schedule.skipDates, ['2026-11-25', '2026-11-26', '2026-11-27']);

  // Extend horizon WITHOUT passing extendDays or additionalOccurrences -> uses defaultHorizonDays = 7 (through 2026-11-30)!
  // Weekdays in (2026-11-24 .. 2026-11-30):
  // - Tue 2026-11-24 -> generated
  // - Wed 2026-11-25 -> skipped (explicit)
  // - Thu 2026-11-26 -> skipped (holidayCalendarDates)
  // - Fri 2026-11-27 -> skipped (holidayCalendarDates)
  // - Mon 2026-11-30 -> generated
  const extRes = await extendStandingOrderHorizon({
    seriesId: series.id,
    standingOrdersConfig: customGov,
    existingTrips: [],
    bookingService,
    nowMs,
  });

  const generatedDates = extRes.createdTrips.map((t) => resolveTripLocalDate(t));
  assert.deepEqual(generatedDates, ['2026-11-24', '2026-11-30']);
  assert.deepEqual(extRes.skippedDates, ['2026-11-25', '2026-11-26', '2026-11-27']);
  for (const t of extRes.createdTrips) {
    assert.equal(t.assignedDriverId, 'drv-301', 'send_to_driver defaultAssignmentMode must assign driver');
    assert.equal(t.status, 'assigned');
  }

  // Also verify registerStandingOrderFromDispatchBooking inherits defaultAssignmentMode ('stage_hold') & defaultSkipHolidays
  const primaryTrip = await bookingService.createBooking({
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-12-21T14:00:00.000Z',
    pickupLocation: { address: '100 Main St' },
    dropoffLocation: { address: '200 Market St' },
    passenger: { firstName: 'Amy', lastName: 'Lin', email: '', phone: '3145550111', passengerCount: 1, luggageCount: 0 },
    vehicleTier: 'standard',
    pricing: SAMPLE_PRICING,
    payment: { method: 'cash', status: 'pending', amount: 46 },
  });
  const regSeries = await registerStandingOrderFromDispatchBooking({
    primaryTrips: [primaryTrip],
    recurringOccurrences: [],
    passenger: primaryTrip.passenger,
    route: { pickupLocation: primaryTrip.pickupLocation, dropoffLocation: primaryTrip.dropoffLocation },
    schedule: {
      startDate: '2026-12-21',
      pickupTime: '08:00',
      frequency: 'weekdays',
      repeatDays: [],
      repeatWeeksPattern: 'all',
    },
    standingOrdersConfig: {
      defaultHorizonDays: 14,
      maxHorizonDays: 60,
      defaultAssignmentMode: 'stage_hold',
      defaultSkipHolidays: true,
      holidayCalendarDates: [{ date: '2026-12-25', name: 'Christmas Day' }],
    },
    vehicleTier: 'standard',
    pricingSnapshot: SAMPLE_PRICING,
    paymentMethod: 'cash',
    driverId: 'drv-301',
    driverLabel: '#301 - Sarah K.',
    bookingService,
  });
  assert.equal(regSeries.preferredDriverMode, 'stage_hold');
  assert.ok(regSeries.schedule.skipDates.includes('2026-12-25'));
  resetStandingOrdersForTests();
}

function testDriverAckPolicyAndOverdueThreshold(): void {
  console.log('4️⃣  Testing requireDriverUpdateAck Bypass & isDriverUpdateAckOverdue Threshold...');

  const updatedMs = Date.parse('2026-11-24T14:00:00.000Z');
  const beforeTrip = makeTrip({
    assignedDriverId: 'drv-101',
    status: 'assigned',
    pickupLocation: { address: '100 Main St, Chesterfield, MO' },
  });

  // When requireDriverUpdateAck === false -> returns null
  const bypassedAck = buildPendingDriverUpdateAck({
    before: beforeTrip,
    after: {
      ...beforeTrip,
      pickupLocation: { address: '999 Olive St, St. Louis, MO' },
    },
    updatedBy: 'dispatch@chesterfieldtaxi.com',
    requireDriverUpdateAck: false,
    nowMs: updatedMs,
  });
  assert.equal(bypassedAck, null, 'requireDriverUpdateAck: false must skip stamping pendingDriverUpdateAck');

  // When requireDriverUpdateAck === true -> builds structured PendingDriverUpdateAck
  const createdAck = buildPendingDriverUpdateAck({
    before: beforeTrip,
    after: {
      ...beforeTrip,
      pickupLocation: { address: '999 Olive St, St. Louis, MO' },
    },
    updatedBy: 'dispatch@chesterfieldtaxi.com',
    requireDriverUpdateAck: true,
    nowMs: updatedMs,
  });
  assert.ok(createdAck);
  assert.equal(createdAck.requiresAck, true);

  const tripWithPendingAck: Trip = {
    ...beforeTrip,
    metadata: { pendingDriverUpdateAck: createdAck },
  };

  // Threshold = 5 minutes:
  // - At +4m59s -> NOT overdue
  // - At +5m00s -> OVERDUE
  assert.equal(
    isDriverUpdateAckOverdue(tripWithPendingAck, 5, updatedMs + 4 * 60_000 + 59_000),
    false
  );
  assert.equal(
    isDriverUpdateAckOverdue(tripWithPendingAck, 5, updatedMs + 5 * 60_000),
    true
  );
  // Custom 15m threshold at +10m -> NOT overdue; at +15m -> OVERDUE
  assert.equal(
    isDriverUpdateAckOverdue(tripWithPendingAck, 15, updatedMs + 10 * 60_000),
    false
  );
  assert.equal(
    isDriverUpdateAckOverdue(tripWithPendingAck, 15, updatedMs + 15 * 60_000),
    true
  );

  // Verify classifyAdminTripExceptions exposes isDriverAckOverdue
  const classifiedOverdue = classifyAdminTripExceptions(tripWithPendingAck, {
    unacknowledgedAlertMinutes: 5,
    nowMs: updatedMs + 6 * 60_000,
  });
  assert.equal(classifiedOverdue.hasUnacknowledgedDriverAck, true);
  assert.equal(classifiedOverdue.isDriverAckOverdue, true);
}

function testOperatorsNavigationAndRbac(): void {
  console.log('5️⃣  Testing SUB_PAGES.operators Resolution & Lead-Window RBAC...');

  assert.deepEqual(
    SUB_PAGES.operators.map((s) => s.key),
    ['roster', 'permissions', 'driver-policies', 'onboarding']
  );

  for (const sub of ['roster', 'permissions', 'driver-policies', 'onboarding']) {
    assert.deepEqual(resolveAdminTabAndSub('operators', sub), {
      tab: 'operators',
      sub,
    });
    assert.deepEqual(resolveAdminTabAndSub('staff', sub), {
      tab: 'operators',
      sub,
    });
  }
  assert.deepEqual(resolveAdminTabAndSub('operators', 'unknown-sub'), {
    tab: 'operators',
    sub: 'roster',
  });

  // Verify canOperatorConfigureLeadWindows
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-1', email: 'desk@chesterfieldtaxi.com', roles: ['dispatcher'] },
      { authorizedLeadWindowDispatcherIds: ['desk@chesterfieldtaxi.com'] }
    ),
    true
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-2', email: 'other@chesterfieldtaxi.com', roles: ['dispatcher'] },
      { authorizedLeadWindowDispatcherIds: ['desk@chesterfieldtaxi.com'] }
    ),
    false
  );
}

function testArchitectureAndHygieneGuardrails(): void {
  console.log('6️⃣  Auditing Monolith Line Ceilings, Immutable Configs & Terminology Hygiene...');

  const explicitCeilings: Array<[string, number]> = [
    ['app/components/domain/admin/AdminRulesTab.tsx', 350],
    ['app/components/domain/admin/AdminOperatorsTab.tsx', 350],
    ['app/routes/admin.tsx', 1000],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
    ['app/components/domain/driver/DriverLiveMeterCard.tsx', 1080],
    ['app/components/domain/admin/rules/BookingIntakeRulesPanel.tsx', 450],
    ['app/components/domain/admin/rules/BookingRulesSimulatorCard.tsx', 350],
    ['app/components/domain/admin/rules/DispatchConsoleSettingsPanel.tsx', 400],
    ['app/components/domain/admin/rules/StandingOrderDefaultsPanel.tsx', 400],
    ['app/components/domain/admin/rules/AdminAutoDispatchControlPanel.tsx', 860],
    ['app/components/domain/admin/rules/AdminAutoDispatchSimulator.tsx', 545],
  ];

  for (const [relPath, maxLines] of explicitCeilings) {
    const absPath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absPath), true, `Expected file to exist: ${relPath}`);
    const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(lines < maxLines, `${relPath} exceeded line ceiling: ${lines} >= ${maxLines}`);
  }

  // Every file in app/components/domain/admin/operators/ must be < 450L
  const operatorsDir = path.join(ROOT_DIR, 'app/components/domain/admin/operators');
  const operatorFiles = fs
    .readdirSync(operatorsDir)
    .filter((name) => /\.(ts|tsx)$/.test(name));
  assert.ok(operatorFiles.length >= 5, 'Expected extracted operator modules');
  for (const file of operatorFiles) {
    const absPath = path.join(operatorsDir, file);
    const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lines < 450,
      `app/components/domain/admin/operators/${file} exceeded 450L ceiling: ${lines}`
    );
  }

  // Immutable files untouched
  const immutableStatus = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    immutableStatus,
    '',
    `firestore.rules and vercel.json must remain untouched, got: ${immutableStatus}`
  );

  // Zero forbidden strings across app/
  const forbiddenTokens = [
    'HUD Now',
    '[Avail]',
    '[En Route]',
    '[Busy]',
    '[Break]',
    '[Off]',
  ];
  for (const filePath of collectAppTsFiles(path.join(ROOT_DIR, 'app'))) {
    const src = fs.readFileSync(filePath, 'utf8');
    for (const token of forbiddenTokens) {
      assert.equal(
        src.includes(token),
        false,
        `Forbidden string "${token}" found in ${path.relative(ROOT_DIR, filePath)}`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log('🚀 Running Platform Phase 61 Automation Hub & Operators Decomposition Suite...\n');
  await testConfigNormalizersAndBidirectionalSync();
  testConflictGuardOverrides();
  await testStandingOrderHolidayCalendarAndDefaults();
  testDriverAckPolicyAndOverdueThreshold();
  testOperatorsNavigationAndRbac();
  testArchitectureAndHygieneGuardrails();
  console.log('\n✅ ALL PHASE 61 AUTOMATION HUB, DRIVER APP POLICIES & OPERATORS TESTS PASSED!');
}

main().catch((err) => {
  console.error('❌ Phase 61 Verification Failed:', err);
  process.exit(1);
});
