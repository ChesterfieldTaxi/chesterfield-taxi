/**
 * Platform Phase 54 Verification Suite:
 * Standing Orders & Recurring Rides Series Manager (`/standingOrders/{seriesId}`,
 * Pause/Resume, Skip/Holiday Dates, Preferred/Staged Driver Assignment & Horizon Extension)
 * (`scripts/test-standing-orders.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { generateRecurringDates } from '../app/core/hooks/booking/booking-form.utils';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import {
  assignPreferredDriverToSeries,
  createStandingOrderSeries,
  extendStandingOrderHorizon,
  getStandingOrderSeriesById,
  getStandingOrderSeriesList,
  pauseStandingOrderSeries,
  registerStandingOrderFromDispatchBooking,
  resetStandingOrdersForTests,
  resolveTripLocalDate,
  resumeStandingOrderSeries,
  updateStandingOrderSkipDates,
} from '../app/core/services/dispatch/standing-order.service';
import type { AutoDispatchDriverInput } from '../app/core/services/dispatch/auto-dispatch-ranking';
import type { CreateTripInput, Trip, TripPricing } from '../app/core/types/trip';

async function mustGetTrip(svc: MockBookingService, tripId: string): Promise<Trip> {
  const res = await svc.getBookingStatus(tripId);
  assert.ok(res?.trip, `Expected trip ${tripId} to exist`);
  return res.trip;
}

const SAMPLE_PRICING: TripPricing = {
  baseFare: 10,
  distanceMiles: 18.4,
  durationMinutes: 26,
  distanceRate: 2.25,
  timeRate: 0.35,
  vehicleMultiplier: 1,
  surgeMultiplier: 1,
  discountAmount: 0,
  subtotal: 58.5,
  totalFare: 58.5,
  currency: 'USD',
  breakdown: [{ id: 'base-fare', category: 'base', label: 'Base Fare', amount: 58.5 }],
};

function makeTripInput(
  localDateStr: string,
  timeStr: string,
  overrides: Partial<CreateTripInput> = {}
): CreateTripInput {
  return {
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(`${localDateStr}T${timeStr}:00`).toISOString(),
    passenger: {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: 'sarah.jenkins@example.com',
      phone: '(314) 555-0192',
      passengerCount: 1,
      luggageCount: 1,
    },
    pickupLocation: {
      address: '16401 Swingley Ridge Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    dropoffLocation: {
      address: 'Mercy Hospital St. Louis, 615 S New Ballas Rd, St. Louis, MO 63141',
      coordinates: { lat: 38.6442, lng: -90.4437 },
    },
    vehicleTier: 'standard',
    pricing: SAMPLE_PRICING,
    payment: {
      method: 'account',
      status: 'pending',
      amount: 58.5,
      corporateAccountId: 'corp-mercy-01',
    },
    ...overrides,
    metadata: {
      createdByRole: 'dispatcher',
      ...(overrides.metadata || {}),
    },
  };
}

function collectFilesRecursively(dir: string, extRegex: RegExp): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFilesRecursively(full, extRegex));
    } else if (extRegex.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

async function main() {
  console.log(
    '=== Phase 54: Standing Orders & Recurring Rides Series Manager Verification Suite ===\n'
  );

  const nowMs = Date.parse('2026-11-23T09:00:00.000Z');
  resetStandingOrdersForTests();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. generateRecurringDates: daily, weekdays, weekly, custom, odd/even, skipDates, maxCap
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing generateRecurringDates (cadences, odd/even weeks, skipDates, maxCap)...');

  // Legacy 5-arg backward compatibility: daily
  const dailyDates = generateRecurringDates('2026-11-23', 'daily', [], 4);
  assert.deepEqual(dailyDates, ['2026-11-24', '2026-11-25', '2026-11-26']);

  // Weekdays across weekend
  const weekdayDates = generateRecurringDates('2026-11-26', 'weekdays', [], 4); // Thu Nov 26
  assert.deepEqual(weekdayDates, ['2026-11-27', '2026-11-30', '2026-12-01']);

  // Weekly on Monday
  const weeklyDates = generateRecurringDates('2026-11-23', 'weekly', ['Mon'], 4);
  assert.deepEqual(weeklyDates, ['2026-11-30', '2026-12-07', '2026-12-14']);

  // Custom Mon/Wed/Fri
  const customDates = generateRecurringDates('2026-11-23', 'custom', ['Mon', 'Wed', 'Fri'], 5);
  assert.deepEqual(customDates, ['2026-11-25', '2026-11-27', '2026-11-30', '2026-12-02']);

  // Even weeks pattern (weekIndex % 2 === 0 -> every 2 weeks on anchor cadence)
  const evenWeekMondays = generateRecurringDates(
    '2026-11-23',
    'weekly',
    ['Mon'],
    4,
    undefined,
    { repeatWeeksPattern: 'even' }
  );
  assert.deepEqual(evenWeekMondays, ['2026-12-07', '2026-12-21', '2027-01-04']);

  // Odd weeks pattern (weekIndex % 2 === 1 -> off-week relative to anchor week 0)
  const oddWeekMondays = generateRecurringDates(
    '2026-11-23',
    'weekly',
    ['Mon'],
    4,
    undefined,
    { repeatWeeksPattern: 'odd' }
  );
  assert.deepEqual(oddWeekMondays, ['2026-11-30', '2026-12-14', '2026-12-28']);

  // Skip dates (Thanksgiving Thu 2026-11-26 & Black Friday 2026-11-27)
  const skippedHolidayDates = generateRecurringDates(
    '2026-11-23',
    'weekdays',
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    5,
    undefined,
    { skipDates: ['2026-11-26', '2026-11-27'] }
  );
  assert.deepEqual(skippedHolidayDates, [
    '2026-11-24',
    '2026-11-25',
    '2026-11-30',
    '2026-12-01',
  ]);

  // maxCap up to 60 + includeStartDate
  const extended35 = generateRecurringDates('2026-12-01', 'daily', [], 35, undefined, {
    maxCap: 60,
    includeStartDate: true,
  });
  assert.equal(extended35.length, 35);
  assert.equal(extended35[0], '2026-12-01');
  console.log('   ✅ generateRecurringDates verified across all patterns & exclusions.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. createStandingOrderSeries, pauseStandingOrderSeries & resumeStandingOrderSeries
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing createStandingOrderSeries, pause (with/without cancel) & resume...');

  const bookingService = new MockBookingService();

  // Seed 4 trips for Series A:
  // - trip1: completed in the past (MUST NEVER be cancelled)
  // - trip2: in_progress right now (MUST NEVER be cancelled)
  // - trip3: future open CONFIRMED unassigned (SHOULD be cancelled when cancelFutureOpenTrips=true)
  // - trip4: future open pending unassigned (SHOULD be cancelled when cancelFutureOpenTrips=true)
  let trip1 = await bookingService.createBooking(
    makeTripInput('2026-11-20', '07:30', { status: 'CONFIRMED' })
  );
  trip1 = await bookingService.updateTrip!(trip1.id, {
    status: 'completed',
    assignedDriverId: 'drv-101',
  });

  let trip2 = await bookingService.createBooking(
    makeTripInput('2026-11-23', '08:30', { status: 'CONFIRMED' })
  );
  trip2 = await bookingService.updateTrip!(trip2.id, {
    status: 'in_progress',
    assignedDriverId: 'drv-101',
  });

  let trip3 = await bookingService.createBooking(
    makeTripInput('2026-11-25', '07:30', { status: 'CONFIRMED' })
  );
  trip3 = await bookingService.updateTrip!(trip3.id, { status: 'CONFIRMED' });
  let trip4 = await bookingService.createBooking(
    makeTripInput('2026-11-27', '07:30', { status: 'pending' })
  );
  trip4 = await bookingService.updateTrip!(trip4.id, { status: 'pending' });

  const seriesA = await createStandingOrderSeries({
    label: 'Sarah Jenkins — Dialysis Commute',
    passenger: {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      phone: '(314) 555-0192',
      email: 'sarah.jenkins@example.com',
      passengerCount: 1,
      luggageCount: 1,
    },
    route: {
      pickupLocation: trip3.pickupLocation,
      dropoffLocation: trip3.dropoffLocation,
    },
    schedule: {
      startDate: '2026-11-20',
      pickupTime: '07:30',
      frequency: 'custom',
      repeatDays: ['Mon', 'Wed', 'Fri'],
      repeatWeeksPattern: 'all',
      skipDates: [],
    },
    vehicleTier: 'standard',
    vehicleDisplayName: 'Sedan',
    pricingSnapshot: SAMPLE_PRICING,
    paymentMethod: 'account',
    corporateAccountId: 'corp-mercy-01',
    corporateAccountName: 'Mercy Hospital St. Louis',
    billingPo: 'PO-54001',
    generatedTripIds: [trip1.id, trip2.id, trip3.id, trip4.id],
    lastGeneratedDate: '2026-11-27',
    createdBy: 'dispatch@chesterfieldtaxi.com',
    nowMs,
  });

  assert.ok(seriesA.id.startsWith('so_'));
  assert.equal(seriesA.status, 'active');
  assert.equal(seriesA.preferredDriverMode, 'unassigned');
  assert.equal(getStandingOrderSeriesList().length, 1);

  // Stamp metadata.standingOrderId on trips 1..4
  for (const [idx, t] of [trip1, trip2, trip3, trip4].entries()) {
    await bookingService.updateTrip!(t.id, {
      metadata: {
        ...(t.metadata || {}),
        standingOrderId: seriesA.id,
        standingOrderLabel: seriesA.label,
        recurringOccurrenceIndex: idx + 1,
      },
    });
  }

  // 2a. Pause WITHOUT canceling future open trips
  const pausedKeep = await pauseStandingOrderSeries(seriesA.id, 'Temporary hold', {
    cancelFutureOpenTrips: false,
    bookingService,
    nowMs,
  });
  assert.equal(pausedKeep.status, 'paused');
  assert.ok(pausedKeep.pausedAt);
  assert.equal(pausedKeep.cancelledTripIds.length, 0);

  const checkTrip3AfterSoftPause = await mustGetTrip(bookingService, trip3.id);
  assert.equal(checkTrip3AfterSoftPause.status, 'CONFIRMED');

  // Resume series
  const resumedA = await resumeStandingOrderSeries(seriesA.id, { nowMs: nowMs + 5000 });
  assert.equal(resumedA.status, 'active');
  assert.equal(resumedA.pausedAt, null);

  // 2b. Pause WITH cancelFutureOpenTrips = true (must cancel trip3 & trip4, preserve trip1 & trip2!)
  const pausedCancel = await pauseStandingOrderSeries(seriesA.id, 'Holiday clinic closure', {
    cancelFutureOpenTrips: true,
    bookingService,
    nowMs,
  });
  assert.equal(pausedCancel.status, 'paused');
  assert.deepEqual(pausedCancel.cancelledTripIds.sort(), [trip3.id, trip4.id].sort());

  const afterCompleted = await mustGetTrip(bookingService, trip1.id);
  const afterInProgress = await mustGetTrip(bookingService, trip2.id);
  const afterOpen3 = await mustGetTrip(bookingService, trip3.id);
  const afterOpen4 = await mustGetTrip(bookingService, trip4.id);
  assert.equal(afterCompleted.status, 'completed', 'Completed trip must NOT be cancelled');
  assert.equal(afterInProgress.status, 'in_progress', 'In-progress trip must NOT be cancelled');
  assert.equal(afterOpen3.status, 'cancelled', 'Future CONFIRMED unassigned trip must be cancelled');
  assert.equal(afterOpen4.status, 'cancelled', 'Future pending unassigned trip must be cancelled');

  await resumeStandingOrderSeries(seriesA.id, { nowMs: nowMs + 10_000 });
  console.log('   ✅ Pause/Resume & selective open-future trip cancellation verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. updateStandingOrderSkipDates: cancel matching open future trips on newly skipped dates
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Testing updateStandingOrderSkipDates (holiday skip & matching open cancellation)...');

  let dec01Trip = await bookingService.createBooking(
    makeTripInput('2026-12-01', '07:30', {
      status: 'CONFIRMED',
      metadata: { standingOrderId: seriesA.id, standingOrderDate: '2026-12-01' },
    })
  );
  dec01Trip = await bookingService.updateTrip!(dec01Trip.id, { status: 'CONFIRMED' });

  let dec02HolidayTrip = await bookingService.createBooking(
    makeTripInput('2026-12-02', '07:30', {
      status: 'CONFIRMED',
      metadata: { standingOrderId: seriesA.id, standingOrderDate: '2026-12-02' },
    })
  );
  dec02HolidayTrip = await bookingService.updateTrip!(dec02HolidayTrip.id, {
    status: 'CONFIRMED',
  });

  let dec04Trip = await bookingService.createBooking(
    makeTripInput('2026-12-04', '07:30', {
      status: 'CONFIRMED',
      metadata: { standingOrderId: seriesA.id, standingOrderDate: '2026-12-04' },
    })
  );
  dec04Trip = await bookingService.updateTrip!(dec04Trip.id, { status: 'CONFIRMED' });

  const skipRes = await updateStandingOrderSkipDates(
    seriesA.id,
    ['2026-12-02', '2026-12-09'],
    {
      cancelMatchingOpenTrips: true,
      bookingService,
      nowMs,
    }
  );
  assert.deepEqual(skipRes.schedule.skipDates, ['2026-12-02', '2026-12-09']);
  assert.deepEqual(skipRes.cancelledTripIds, [dec02HolidayTrip.id]);

  assert.equal((await mustGetTrip(bookingService, dec01Trip.id)).status, 'CONFIRMED');
  assert.equal((await mustGetTrip(bookingService, dec02HolidayTrip.id)).status, 'cancelled');
  assert.equal((await mustGetTrip(bookingService, dec04Trip.id)).status, 'CONFIRMED');
  console.log('   ✅ updateStandingOrderSkipDates verified (cancelled 2026-12-02, kept Dec 01 & Dec 04).\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. assignPreferredDriverToSeries ('stage_hold' zero /app/driver leak + clear)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing assignPreferredDriverToSeries (stage_hold bulk staging & clean clear)...');

  const driverCarlos: AutoDispatchDriverInput = {
    id: 'drv-204',
    name: 'Carlos Alvarez',
    cabNumber: '204',
    vehicleUnit: 'Car #204',
    vehicleTier: 'standard',
    dutyStatus: 'on_duty',
    mapStatus: 'available',
  };

  const stagedSeriesRes = await assignPreferredDriverToSeries({
    seriesId: seriesA.id,
    driverId: driverCarlos.id,
    driverLabel: '#204 - Carlos Alvarez',
    mode: 'stage_hold',
    applyToExistingFutureTrips: true,
    actorEmail: 'dispatch@chesterfieldtaxi.com',
    drivers: [driverCarlos],
    bookingService,
    nowMs,
  });

  assert.equal(stagedSeriesRes.preferredDriverId, 'drv-204');
  assert.equal(stagedSeriesRes.preferredDriverMode, 'stage_hold');
  assert.deepEqual(
    stagedSeriesRes.updatedTripIds.sort(),
    [dec01Trip.id, dec04Trip.id].sort()
  );

  for (const openId of [dec01Trip.id, dec04Trip.id]) {
    const t = await mustGetTrip(bookingService, openId);
    assert.equal(t.plannedDriverId, 'drv-204', 'Open future series trip must have plannedDriverId');
    assert.equal(
      t.assignedDriverId,
      null,
      'ZERO /app/driver LEAK: assignedDriverId must remain null in stage_hold mode'
    );
    assert.deepEqual(t.offeredToIds, [], 'offeredToIds must remain empty when staged');
  }

  // Clear preferred driver & unstage open future trips
  const clearedSeriesRes = await assignPreferredDriverToSeries({
    seriesId: seriesA.id,
    driverId: null,
    driverLabel: null,
    mode: 'unassigned',
    applyToExistingFutureTrips: true,
    actorEmail: 'dispatch@chesterfieldtaxi.com',
    bookingService,
    nowMs: nowMs + 15_000,
  });
  assert.equal(clearedSeriesRes.preferredDriverId, null);
  assert.equal(clearedSeriesRes.preferredDriverMode, 'unassigned');
  assert.equal((await mustGetTrip(bookingService, dec01Trip.id)).plannedDriverId, null);

  // Re-apply Carlos in stage_hold for Step 5 horizon extension verification!
  await assignPreferredDriverToSeries({
    seriesId: seriesA.id,
    driverId: driverCarlos.id,
    driverLabel: '#204 - Carlos Alvarez',
    mode: 'stage_hold',
    applyToExistingFutureTrips: true,
    actorEmail: 'dispatch@chesterfieldtaxi.com',
    drivers: [driverCarlos],
    bookingService,
    nowMs: nowMs + 20_000,
  });
  console.log('   ✅ assignPreferredDriverToSeries verified (zero /app/driver leak & clean clear).\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. extendStandingOrderHorizon: non-duplicate next N trips, skipDates & auto-staging
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Testing extendStandingOrderHorizon (dedup, skipDates, auto-staging)...');

  // Current active series trips include Dec 01 and Dec 04 (Mon/Wed/Fri cadence, skipDates has 2026-12-09).
  // Let's also pre-seed an active trip on 2026-12-07 (Mon) to prove deduplication skips Dec 07!
  await bookingService.createBooking(
    makeTripInput('2026-12-07', '07:30', {
      status: 'CONFIRMED',
      metadata: { standingOrderId: seriesA.id, standingOrderDate: '2026-12-07' },
    })
  );

  const existingBeforeExtend = await bookingService.getAllTrips!();

  // Latest date on series is 2026-12-07 (Mon).
  // Next Mon/Wed/Fri dates after 2026-12-07:
  // - Wed 2026-12-09 -> in skipDates! (must be skipped & reported in skippedDates)
  // - Fri 2026-12-11 -> generated #1
  // - Mon 2026-12-14 -> generated #2
  // - Wed 2026-12-16 -> generated #3
  const horizonRes = await extendStandingOrderHorizon({
    seriesId: seriesA.id,
    additionalOccurrences: 3,
    existingTrips: existingBeforeExtend,
    bookingService,
    actorName: 'dispatch@chesterfieldtaxi.com',
    nowMs: nowMs + 30_000,
  });

  assert.equal(horizonRes.createdTrips.length, 3);
  assert.deepEqual(horizonRes.skippedDates, ['2026-12-09']);
  const createdDates = horizonRes.createdTrips.map((t) => resolveTripLocalDate(t));
  assert.deepEqual(createdDates, ['2026-12-11', '2026-12-14', '2026-12-16']);

  for (const ct of horizonRes.createdTrips) {
    assert.equal((ct.metadata as any)?.standingOrderId, seriesA.id);
    assert.equal(ct.plannedDriverId, 'drv-204', 'Extended trip must auto-stage preferredDriverId');
    assert.equal(ct.assignedDriverId, null, 'Extended staged trip must keep assignedDriverId null');
  }

  const refreshedSeriesA = getStandingOrderSeriesById(seriesA.id);
  assert.equal(refreshedSeriesA?.lastGeneratedDate, '2026-12-16');

  // Re-running extendStandingOrderHorizon again for +2 occurrences advances cleanly after 2026-12-16 -> Dec 18 (Fri), Dec 21 (Mon)
  const secondExtend = await extendStandingOrderHorizon({
    seriesId: seriesA.id,
    additionalOccurrences: 2,
    existingTrips: await bookingService.getAllTrips!(),
    bookingService,
    nowMs: nowMs + 35_000,
  });
  assert.deepEqual(
    secondExtend.createdTrips.map((t) => resolveTripLocalDate(t)),
    ['2026-12-18', '2026-12-21']
  );

  // Verify registerStandingOrderFromDispatchBooking helper
  const primaryDispatchTrip = await bookingService.createBooking(
    makeTripInput('2026-12-01', '09:00')
  );
  const occDispatchTrip = await bookingService.createBooking(
    makeTripInput('2026-12-08', '09:00')
  );
  const bookedSeries = await registerStandingOrderFromDispatchBooking({
    primaryTrips: [primaryDispatchTrip],
    recurringOccurrences: [{ date: '2026-12-08', trips: [occDispatchTrip] }],
    passenger: primaryDispatchTrip.passenger,
    route: {
      pickupLocation: primaryDispatchTrip.pickupLocation,
      dropoffLocation: primaryDispatchTrip.dropoffLocation,
    },
    schedule: {
      startDate: '2026-12-01',
      pickupTime: '09:00',
      frequency: 'weekly',
      repeatDays: ['Tue'],
      repeatWeeksPattern: 'all',
      skipDates: ['2026-12-15'],
    },
    vehicleTier: 'standard',
    pricingSnapshot: SAMPLE_PRICING,
    paymentMethod: 'account',
    driverId: driverCarlos.id,
    driverLabel: '#204 - Carlos Alvarez',
    driverAssignmentMode: 'stage_hold',
    createdBy: 'dispatch@chesterfieldtaxi.com',
    bookingService,
  });
  assert.equal((primaryDispatchTrip.metadata as any)?.standingOrderId, bookedSeries.id);
  const updatedOcc = await mustGetTrip(bookingService, occDispatchTrip.id);
  assert.equal((updatedOcc.metadata as any)?.standingOrderId, bookedSeries.id);
  assert.equal(updatedOcc.plannedDriverId, 'drv-204');
  assert.equal(updatedOcc.assignedDriverId, null);
  console.log('   ✅ extendStandingOrderHorizon & booking registration helper verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Static Source, Budget, Firestore Rules, Vercel Cron & Zero "HUD Now" Guardrails
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Auditing line budgets, untouched firestore.rules & vercel.json, and zero "HUD Now"...');

  const rootDir = process.cwd();
  const appFiles = collectFilesRecursively(path.join(rootDir, 'app'), /\.(ts|tsx)$/);
  assert.ok(appFiles.length > 50, 'Expected to scan app/ TypeScript source files');

  for (const filePath of appFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.ok(
      !/HUD\s+Now/i.test(stripped),
      `Forbidden "HUD Now" wording found in ${path.relative(rootDir, filePath)}`
    );
  }

  // Verify StandingOrdersDrawer is lazily mounted in DispatchDesktopTopHeader.tsx & AdminTripsSubpage.tsx
  const topHeaderSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/workspace/DispatchDesktopTopHeader.tsx'),
    'utf8'
  );
  assert.ok(
    topHeaderSrc.includes("import('../StandingOrdersDrawer')"),
    'DispatchDesktopTopHeader.tsx must React.lazy-mount StandingOrdersDrawer'
  );

  const adminTripsSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/admin/subpages/AdminTripsSubpage.tsx'),
    'utf8'
  );
  assert.ok(
    adminTripsSrc.includes("import('../../dispatch/StandingOrdersDrawer')"),
    'AdminTripsSubpage.tsx must React.lazy-mount StandingOrdersDrawer'
  );

  // Verify firestore.rules & vercel.json are completely untouched in git working tree
  const gitPorcelain = execSync('git status --porcelain -- firestore.rules vercel.json', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitPorcelain,
    '',
    `firestore.rules and vercel.json must remain untouched! Got: ${gitPorcelain}`
  );

  const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  assert.equal(vercelJson.crons?.[0]?.schedule, '0 10 * * *');

  // Verify strict monolith line-count budgets
  const lineBudgets: Array<{ rel: string; max: number }> = [
    { rel: 'app/routes/dispatch.tsx', max: 1600 },
    { rel: 'app/routes/driver.tsx', max: 1900 },
    { rel: 'app/components/domain/dispatch/LiveFleetMap.tsx', max: 1350 },
    { rel: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', max: 900 },
    { rel: 'app/components/domain/dispatch/DispatchBookingEngine.tsx', max: 1800 },
    { rel: 'app/components/domain/admin/AdminRulesTab.tsx', max: 1350 },
  ];

  for (const b of lineBudgets) {
    const lines = fs.readFileSync(path.join(rootDir, b.rel), 'utf8').split(/\r?\n/).length;
    assert.ok(
      lines < b.max,
      `Line budget exceeded for ${b.rel}: ${lines} lines >= ${b.max} lines`
    );
    console.log(`   📏 ${b.rel}: ${lines} / ${b.max} lines`);
  }

  resetStandingOrdersForTests();
  console.log('\n🎉 ALL PHASE 54 STANDING ORDERS & RECURRING SERIES TESTS PASSED! ✅');
}

main().catch((err) => {
  console.error('\n💥 Phase 54 verification suite failed:', err);
  process.exit(1);
});
