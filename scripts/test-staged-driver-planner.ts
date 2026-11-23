/**
 * Platform Phase 51 Verification Suite:
 * Staged Driver Shift Planner (`plannedDriverId`), `DriverQueueWindow` Turnaround/Overlap Checker,
 * `Send to Driver` / `Send` Actions, Authorized-Dispatcher Auto-Release Window & Staged Override Prompt
 * (`scripts/test-staged-driver-planner.ts`)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  canOperatorConfigureLeadWindows,
  normalizeDispatchAutomationConfig,
  type FleetCarConfig,
} from '../app/core/types/config';
import type { CreateTripInput, Trip } from '../app/core/types/trip';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import { DEFAULT_ZONES } from '../app/core/services/zones/zone.service';
import {
  applyAutoStageSuggestions,
  clearStagedDriver,
  computeAutoStageSuggestions,
  computeDriverScheduleTimeline,
  getDueStagedTripsForAutoRelease,
  hasStagedDriver,
  isTripEligibleForStaging,
  partitionTripsByStagedConflict,
  releaseDueStagedTrips,
  resolveStagedConflictStrategy,
  sendMultipleStagedTripsToDrivers,
  sendStagedTripToDriver,
  stageDriverForTrip,
  type AutoDispatchDriverInput,
} from '../app/core/services/dispatch';
import { handleAutoDispatchHttpRequest } from '../app/core/services/dispatch/auto-dispatch.server';
import { executeSlaDispatchCronCycle } from '../app/core/services/dispatch/sla-cron.server';

function makeTripInput(overrides: Partial<CreateTripInput> = {}): CreateTripInput {
  return {
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-23T15:00:00.000Z',
    passenger: {
      firstName: 'Nadia',
      lastName: 'Kowalski',
      email: 'nadia.kowalski@example.com',
      phone: '(314) 555-0148',
      passengerCount: 2,
      luggageCount: 2,
    },
    pickupLocation: {
      address: '16401 Swingley Ridge Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    dropoffLocation: {
      address: '100 N Broadway, St. Louis, MO 63102',
      coordinates: { lat: 38.6275, lng: -90.1892 },
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5,
      distanceMiles: 22,
      durationMinutes: 30,
      distanceRate: 2.25,
      timeRate: 0.35,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 65,
      totalFare: 65,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'authorized',
      amount: 65,
    },
    ...overrides,
  };
}

function collectFilesRecursively(dir: string, extRegex: RegExp): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
    '=== Phase 51: Staged Driver Shift Planner, Turnaround Checker & Auto-Release Suite ===\n'
  );

  const nowMs = Date.parse('2026-11-23T12:00:00.000Z');

  const fleetVehicles: FleetCarConfig[] = [
    {
      id: 'car-104',
      unitNumber: 'Car #104',
      make: 'Toyota',
      model: 'Camry Hybrid',
      year: 2025,
      licensePlate: 'MO-104CT',
      vin: '4T1B21HK0SU104000',
      mileage: 18400,
      color: 'Silver',
      vehicleTypeId: 'standard',
      status: 'active',
    },
    {
      id: 'car-208',
      unitNumber: 'Car #208',
      make: 'Chevrolet',
      model: 'Suburban',
      year: 2025,
      licensePlate: 'MO-208CT',
      vin: '1GNSKCKD9SR208000',
      mileage: 22100,
      color: 'Black',
      vehicleTypeId: 'suv',
      status: 'active',
    },
    {
      id: 'car-309',
      unitNumber: 'Car #309',
      make: 'Honda',
      model: 'Accord',
      year: 2024,
      licensePlate: 'MO-309CT',
      vin: '1HGCV1F34RA309000',
      mileage: 39500,
      color: 'White',
      vehicleTypeId: 'standard',
      status: 'maintenance',
      groundedReason: 'Brake service',
    },
  ];

  const driverAlex: AutoDispatchDriverInput = {
    id: 'drv-104',
    name: 'Alex Mercer',
    cabNumber: '104',
    vehicleUnit: 'Car #104',
    vehicleTier: 'standard',
    dutyStatus: 'on_duty',
    mapStatus: 'available',
    driverScore: 94,
    phone: '+13145550104',
    currentLocation: {
      coordinates: { lat: 38.661, lng: -90.575 },
      timestamp: new Date(nowMs - 15_000).toISOString(),
    },
  };

  const driverBrianna: AutoDispatchDriverInput = {
    id: 'drv-208',
    name: 'Brianna Cole',
    cabNumber: '208',
    vehicleUnit: 'Car #208',
    vehicleTier: 'suv',
    dutyStatus: 'off_duty',
    mapStatus: 'offline',
    driverScore: 91,
    phone: '+13145550208',
  };

  const driverBlacklisted: AutoDispatchDriverInput = {
    id: 'drv-999',
    name: 'Suspended Sam',
    cabNumber: '999',
    vehicleTier: 'standard',
    dutyStatus: 'on_duty',
    mapStatus: 'available',
    isBlacklisted: true,
  };

  const driverGroundedCar: AutoDispatchDriverInput = {
    id: 'drv-309',
    name: 'Grounded Greg',
    cabNumber: '309',
    vehicleUnit: 'Car #309',
    vehicleTier: 'standard',
    dutyStatus: 'on_duty',
    mapStatus: 'available',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. ZERO `/app/driver` LEAK: STAGING & UNSTAGING PLACEHOLDERS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing stageDriverForTrip, clearStagedDriver & zero /app/driver leak...');

  const bookingSvc = new MockBookingService();
  const createdOpen = await bookingSvc.createBooking({
    ...makeTripInput({
      id: 'TRIP-STAGE-4821',
      scheduledPickupTime: new Date(nowMs + 4 * 3600_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await bookingSvc.updateTrip(createdOpen.id, { status: 'CONFIRMED' });
  const freshOpen = (await bookingSvc.getBookingStatus(createdOpen.id))!.trip;

  assert.equal(isTripEligibleForStaging(freshOpen), true);
  assert.equal(
    isTripEligibleForStaging({ ...freshOpen, assignedDriverId: 'drv-104' }),
    false,
    'Already assigned trip must not be stageable'
  );
  assert.equal(
    isTripEligibleForStaging({ ...freshOpen, status: 'in_progress' }),
    false,
    'Active in-progress trip must not be stageable'
  );
  assert.equal(
    isTripEligibleForStaging({ ...freshOpen, status: 'completed' }),
    false,
    'Completed trip must not be stageable'
  );

  // Blacklisted driver cannot be staged
  await assert.rejects(
    () =>
      stageDriverForTrip({
        tripId: freshOpen.id,
        trip: freshOpen,
        driver: driverBlacklisted,
        actorName: 'Dana Dispatch',
        bookingService: bookingSvc,
        nowMs,
      }),
    /suspended or blacklisted/i
  );

  const stagedTrip = await stageDriverForTrip({
    tripId: freshOpen.id,
    trip: freshOpen,
    driver: driverAlex,
    actorName: 'Dana Dispatch',
    actorId: 'uid-dana',
    actorRole: 'dispatcher',
    bookingService: bookingSvc,
    nowMs,
  });

  assert.equal(stagedTrip.plannedDriverId, 'drv-104');
  assert.ok(
    stagedTrip.plannedDriverLabel?.includes('104') &&
      stagedTrip.plannedDriverLabel?.includes('Alex'),
    `Expected formatted plannedDriverLabel, got: ${stagedTrip.plannedDriverLabel}`
  );
  assert.equal(stagedTrip.plannedAt, new Date(nowMs).toISOString());
  assert.equal(stagedTrip.plannedBy, 'Dana Dispatch');
  // Non-negotiable zero /app/driver leak invariants:
  assert.equal(stagedTrip.assignedDriverId, null, 'Staging MUST keep assignedDriverId === null');
  assert.deepEqual(stagedTrip.offeredToIds, [], 'Staging MUST keep offeredToIds === []');
  assert.equal(hasStagedDriver(stagedTrip), true);

  const stagedAudit = stagedTrip.auditLog?.at(-1);
  assert.equal(stagedAudit?.action, 'DRIVER_STAGED');
  assert.ok(
    stagedAudit?.context?.includes('Staged #104 (Alex) as planned driver — held in Dispatch'),
    `Unexpected audit summary: ${stagedAudit?.context}`
  );

  // Unstage clears all 4 fields and logs DRIVER_UNSTAGED
  const unstagedTrip = await clearStagedDriver({
    tripId: stagedTrip.id,
    trip: stagedTrip,
    actorName: 'Dana Dispatch',
    reason: 'Shift swap requested',
    bookingService: bookingSvc,
    nowMs: nowMs + 60_000,
  });
  assert.equal(unstagedTrip.plannedDriverId, null);
  assert.equal(unstagedTrip.plannedDriverLabel, null);
  assert.equal(unstagedTrip.plannedAt, null);
  assert.equal(unstagedTrip.plannedBy, null);
  assert.equal(hasStagedDriver(unstagedTrip), false);
  assert.equal(unstagedTrip.auditLog?.at(-1)?.action, 'DRIVER_UNSTAGED');

  console.log('   ✅ Staging & unstaging verified with zero /app/driver assignment/offer leak.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SEND TO DRIVER (`sendStagedTripToDriver` & BATCH SEND)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing sendStagedTripToDriver (direct_assign + offer_first + batch)...');

  const restaged = await stageDriverForTrip({
    tripId: unstagedTrip.id,
    trip: unstagedTrip,
    driver: driverAlex,
    actorName: 'Dana Dispatch',
    bookingService: bookingSvc,
    nowMs: nowMs + 120_000,
  });

  // Grounded fleet vehicle rejection check
  const groundedStagedTrip: Trip = {
    ...restaged,
    id: 'TRIP-GROUNDED-309',
    plannedDriverId: driverGroundedCar.id,
    plannedDriverLabel: '#309 (Grounded Greg)',
  };
  await assert.rejects(
    () =>
      sendStagedTripToDriver({
        trip: groundedStagedTrip,
        drivers: [driverAlex, driverGroundedCar],
        fleetVehicles,
        actorName: 'Dana Dispatch',
        bookingService: bookingSvc,
        sendPush: false,
        nowMs,
      }),
    /unavailable/i
  );

  const pushedPayloads: Array<{ driverId: string; tripId: string }> = [];
  const sentDirect = await sendStagedTripToDriver({
    trip: restaged,
    drivers: [driverAlex, driverBrianna],
    fleetVehicles,
    actorName: 'Dana Dispatch',
    actorId: 'uid-dana',
    mode: 'direct_assign',
    bookingService: bookingSvc,
    sendPush: async (targetDriverId, pushedTrip) => {
      pushedPayloads.push({ driverId: targetDriverId, tripId: pushedTrip.id });
    },
    nowMs: nowMs + 180_000,
  });

  assert.equal(sentDirect.mode, 'direct_assign');
  assert.equal(sentDirect.driverId, 'drv-104');
  assert.equal(sentDirect.trip.assignedDriverId, 'drv-104');
  assert.equal(sentDirect.trip.status, 'assigned');
  assert.equal(sentDirect.trip.plannedDriverId, null);
  assert.equal(sentDirect.trip.plannedDriverLabel, null);
  assert.equal(sentDirect.trip.plannedAt, null);
  assert.equal(sentDirect.trip.plannedBy, null);
  assert.equal(sentDirect.trip.assignedVehicle?.vehicleNumber, 'Car #104');
  assert.equal(sentDirect.trip.assignedVehicle?.licensePlate, 'MO-104CT');
  assert.equal(sentDirect.trip.metadata?.previouslyPlannedDriverId, 'drv-104');
  assert.equal(sentDirect.trip.auditLog?.at(-1)?.action, 'DRIVER_ASSIGNED');
  assert.equal(pushedPayloads.length, 1);
  assert.deepEqual(pushedPayloads[0], { driverId: 'drv-104', tripId: restaged.id });

  // offer_first mode verification
  const offerCandidate = await bookingSvc.createBooking({
    ...makeTripInput({ id: 'TRIP-OFFER-MODE-1' }),
    status: 'CONFIRMED',
  });
  const stagedForOffer = await stageDriverForTrip({
    tripId: offerCandidate.id,
    driver: driverAlex,
    actorName: 'Dana Dispatch',
    bookingService: bookingSvc,
    nowMs,
  });
  const sentOffer = await sendStagedTripToDriver({
    trip: stagedForOffer,
    drivers: [driverAlex],
    actorName: 'Dana Dispatch',
    mode: 'offer_first',
    bookingService: bookingSvc,
    sendPush: false,
    nowMs,
  });
  assert.equal(sentOffer.mode, 'offer_first');
  assert.equal(sentOffer.trip.status, 'offered');
  assert.equal(sentOffer.trip.assignedDriverId, null);
  assert.deepEqual(sentOffer.trip.offeredToIds, ['drv-104']);
  assert.equal(sentOffer.trip.plannedDriverId, null);
  assert.equal(sentOffer.trip.auditLog?.at(-1)?.action, 'DISPATCH_OFFERED');

  // Batch sendMultipleStagedTripsToDrivers with requireOnDuty: true skips off-duty Brianna & sends on-duty Alex
  const batchA = await stageDriverForTrip({
    tripId: (
      await bookingSvc.createBooking({ ...makeTripInput({ id: 'BATCH-STG-A' }), status: 'CONFIRMED' })
    ).id,
    driver: driverAlex,
    actorName: 'Dana',
    bookingService: bookingSvc,
    nowMs,
  });
  const batchB = await stageDriverForTrip({
    tripId: (
      await bookingSvc.createBooking({
        ...makeTripInput({ id: 'BATCH-STG-B', vehicleTier: 'suv' }),
        status: 'CONFIRMED',
      })
    ).id,
    driver: driverBrianna, // off_duty
    actorName: 'Dana',
    bookingService: bookingSvc,
    nowMs,
  });

  const batchRes = await sendMultipleStagedTripsToDrivers({
    trips: [batchA, batchB],
    drivers: [driverAlex, driverBrianna],
    fleetVehicles,
    actorName: 'Dana',
    requireOnDuty: true,
    bookingService: bookingSvc,
    sendPush: false,
    nowMs,
  });
  assert.equal(batchRes.sentCount, 1);
  assert.equal(batchRes.skippedOfflineOrInvalid, 1);
  assert.equal(batchRes.updatedTrips[0].id, 'BATCH-STG-A');

  console.log('   ✅ sendStagedTripToDriver (direct_assign, offer_first & batch) verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 3. CHRONOLOGICAL TIMELINE & TURNAROUND / OVERLAP SANITY CHECKER
  // ─────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Testing computeDriverScheduleTimeline (ok, tight_turnaround & overlap)...');

  // Leg 1 (Assigned): 13:00 -> 13:30 (30m duration) -> 'ok' (first leg)
  // Leg 2 (Staged):   13:55 -> 14:25 (30m duration, +25m buffer after 13:30) -> 'ok'
  // Leg 3 (Staged):   14:33 -> 15:03 (30m duration, +8m buffer after 14:25)  -> 'tight_turnaround'
  // Leg 4 (Assigned): 14:50 -> 15:20 (30m duration, -13m overlap with 15:03) -> 'overlap'
  const leg1: Trip = {
    ...(makeTripInput({
      scheduledPickupTime: '2026-11-23T13:00:00.000Z',
    }) as any),
    id: 'TIMELINE-LEG-1',
    status: 'assigned',
    assignedDriverId: 'drv-104',
    plannedDriverId: null,
    offeredToIds: [],
    rejectedByIds: [],
    statusHistory: [],
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const leg2: Trip = {
    ...leg1,
    id: 'TIMELINE-LEG-2',
    status: 'CONFIRMED',
    assignedDriverId: null,
    plannedDriverId: 'drv-104',
    plannedDriverLabel: '#104 (Alex)',
    scheduledPickupTime: '2026-11-23T13:55:00.000Z',
  };

  const leg3Tight: Trip = {
    ...leg1,
    id: 'TIMELINE-LEG-3',
    status: 'CONFIRMED',
    assignedDriverId: null,
    plannedDriverId: 'drv-104',
    plannedDriverLabel: '#104 (Alex)',
    scheduledPickupTime: '2026-11-23T14:33:00.000Z',
  };

  const leg4Overlap: Trip = {
    ...leg1,
    id: 'TIMELINE-LEG-4',
    status: 'assigned',
    assignedDriverId: 'drv-104',
    plannedDriverId: null,
    scheduledPickupTime: '2026-11-23T14:50:00.000Z',
  };

  const ignoredCancelled: Trip = {
    ...leg1,
    id: 'TIMELINE-CANCELLED',
    status: 'cancelled',
    assignedDriverId: null,
    plannedDriverId: 'drv-104',
    scheduledPickupTime: '2026-11-23T13:10:00.000Z',
  };

  const timeline = computeDriverScheduleTimeline(
    'drv-104',
    [leg4Overlap, leg2, ignoredCancelled, leg3Tight, leg1],
    { tightBufferMinutes: 15, nowMs }
  );

  assert.equal(timeline.items.length, 4, 'Cancelled trip must be excluded from driver timeline');
  assert.equal(timeline.assignedCount, 2);
  assert.equal(timeline.stagedCount, 2);
  assert.equal(timeline.tightTurnaroundCount, 1);
  assert.equal(timeline.overlapCount, 1);

  assert.deepEqual(
    timeline.items.map((i) => ({
      id: i.trip.id,
      state: i.assignmentState,
      buffer: i.bufferMinutesAfterPrior,
      conflict: i.conflictStatus,
    })),
    [
      { id: 'TIMELINE-LEG-1', state: 'assigned', buffer: null, conflict: 'ok' },
      { id: 'TIMELINE-LEG-2', state: 'staged', buffer: 25, conflict: 'ok' },
      { id: 'TIMELINE-LEG-3', state: 'staged', buffer: 8, conflict: 'tight_turnaround' },
      { id: 'TIMELINE-LEG-4', state: 'assigned', buffer: -13, conflict: 'overlap' },
    ]
  );

  console.log('   ✅ computeDriverScheduleTimeline chronological interleaving & conflict flags verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 4. AUTO-STAGE SUGGESTIONS (`computeAutoStageSuggestions` & APPLY)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing computeAutoStageSuggestions non-overlapping shift pairing...');

  // Existing assigned ride on Alex: 16:00 -> 16:30
  const alexExisting: Trip = {
    ...leg1,
    id: 'AUTO-EXIST-ALEX',
    status: 'assigned',
    assignedDriverId: 'drv-104',
    scheduledPickupTime: '2026-11-23T16:00:00.000Z',
  };

  // Open ride 1 at 16:15 (30m): overlaps Alex (16:00-16:30), so MUST pick Brianna (SUV covers standard)!
  const open1: Trip = {
    ...leg1,
    id: 'AUTO-OPEN-1',
    status: 'CONFIRMED',
    assignedDriverId: null,
    plannedDriverId: null,
    scheduledPickupTime: '2026-11-23T16:15:00.000Z',
  };

  // Open ride 2 at 16:50 (30m): +20m after Alex's 16:30 dropoff (>= 15m), while Brianna finishes at 16:45 (+5m tight!) -> MUST pick Alex!
  const open2: Trip = {
    ...leg1,
    id: 'AUTO-OPEN-2',
    status: 'CONFIRMED',
    assignedDriverId: null,
    plannedDriverId: null,
    scheduledPickupTime: '2026-11-23T16:50:00.000Z',
  };

  // Open ride 3 at 17:00 (30m): overlaps BOTH Alex (16:50-17:20) and Brianna (tight/overlap if paired, wait Brianna finished 16:45 -> 17:00 is +15m exact!).
  // Let's make Open ride 3 at 16:55 so Brianna only has +10m (<15m tight) and Alex is busy (16:50-17:20) -> MUST land in unmatchedTripIds!
  const open3Unmatchable: Trip = {
    ...leg1,
    id: 'AUTO-OPEN-3-CONFLICT',
    status: 'CONFIRMED',
    assignedDriverId: null,
    plannedDriverId: null,
    scheduledPickupTime: '2026-11-23T16:55:00.000Z',
  };

  const suggestionRes = computeAutoStageSuggestions({
    trips: [open2, open3Unmatchable, open1],
    allTrips: [alexExisting, open1, open2, open3Unmatchable],
    drivers: [driverAlex, driverBrianna, driverBlacklisted],
    settings: { fleet: fleetVehicles },
    tightBufferMinutes: 15,
    nowMs,
  });

  assert.equal(suggestionRes.suggestions.length, 2);
  assert.equal(suggestionRes.suggestions[0].tripId, 'AUTO-OPEN-1');
  assert.equal(suggestionRes.suggestions[0].driverId, 'drv-208'); // Brianna (off-duty future shift OK, non-overlapping)
  assert.equal(suggestionRes.suggestions[1].tripId, 'AUTO-OPEN-2');
  assert.equal(suggestionRes.suggestions[1].driverId, 'drv-104'); // Alex (+20m buffer >= 15m)
  assert.deepEqual(suggestionRes.unmatchedTripIds, ['AUTO-OPEN-3-CONFLICT']);

  const autoApplySvc = new MockBookingService();
  for (const t of [open1, open2]) {
    await autoApplySvc.createBooking({
      ...makeTripInput({ id: t.id, scheduledPickupTime: t.scheduledPickupTime }),
      status: 'CONFIRMED',
    });
  }
  const openSnapshot = await autoApplySvc.getAllTrips();
  const appliedStaged = await applyAutoStageSuggestions({
    suggestions: suggestionRes.suggestions,
    trips: openSnapshot,
    drivers: [driverAlex, driverBrianna],
    actorName: 'Shift Planner',
    bookingService: autoApplySvc,
    nowMs,
  });
  assert.equal(appliedStaged.length, 2);
  for (const st of appliedStaged) {
    assert.ok(st.plannedDriverId);
    assert.equal(st.assignedDriverId, null, 'Auto-Stage MUST NOT assign live driver');
    assert.deepEqual(st.offeredToIds, [], 'Auto-Stage MUST NOT populate offeredToIds');
  }

  console.log('   ✅ computeAutoStageSuggestions & applyAutoStageSuggestions verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 5. CONFLICT PARTITIONING & 3 STAGED OVERRIDE MODAL STRATEGIES
  // ─────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Testing partitionTripsByStagedConflict & all 3 conflict strategies...');

  const conflictSvc = new MockBookingService();
  const cStagedRaw = await conflictSvc.createBooking({
    ...makeTripInput({ id: 'CONFLICT-STAGED-1' }),
    status: 'CONFIRMED',
  });
  const cUnstagedRaw = await conflictSvc.createBooking({
    ...makeTripInput({ id: 'CONFLICT-OPEN-2' }),
    status: 'CONFIRMED',
  });
  const cStaged = await stageDriverForTrip({
    tripId: cStagedRaw.id,
    driver: driverAlex,
    actorName: 'Dana',
    bookingService: conflictSvc,
    nowMs,
  });
  const cUnstaged = (await conflictSvc.getBookingStatus(cUnstagedRaw.id))!.trip;

  const partitioned = partitionTripsByStagedConflict([cStaged, cUnstaged]);
  assert.deepEqual(
    partitioned.stagedTrips.map((t) => t.id),
    ['CONFLICT-STAGED-1']
  );
  assert.deepEqual(
    partitioned.unstagedTrips.map((t) => t.id),
    ['CONFLICT-OPEN-2']
  );

  // Strategy A: skip_staged -> leaves staged untouched, returns only unstaged for Auto-Dispatch
  const skipRes = await resolveStagedConflictStrategy({
    strategy: 'skip_staged',
    targetTrips: [cStaged, cUnstaged],
    drivers: [driverAlex],
    actorName: 'Dana',
    bookingService: conflictSvc,
    sendPush: false,
    nowMs,
  });
  assert.equal(skipRes.skippedStagedTrips.length, 1);
  assert.equal(skipRes.sentStagedTrips.length, 0);
  assert.deepEqual(
    skipRes.tripsForAutoDispatch.map((t) => t.id),
    ['CONFLICT-OPEN-2']
  );
  assert.equal(
    (await conflictSvc.getBookingStatus('CONFLICT-STAGED-1'))!.trip.plannedDriverId,
    'drv-104'
  );

  // Strategy B: override_staged -> clears plannedDriverId & returns ALL trips for fresh Auto-Dispatch
  const overrideRes = await resolveStagedConflictStrategy({
    strategy: 'override_staged',
    targetTrips: [cStaged, cUnstaged],
    drivers: [driverAlex],
    actorName: 'Dana',
    bookingService: conflictSvc,
    sendPush: false,
    nowMs,
  });
  assert.equal(overrideRes.clearedStagedTrips.length, 1);
  assert.equal(overrideRes.clearedStagedTrips[0].plannedDriverId, null);
  assert.deepEqual(
    overrideRes.tripsForAutoDispatch.map((t) => t.id),
    ['CONFLICT-STAGED-1', 'CONFLICT-OPEN-2']
  );

  // Strategy C: keep_staged -> sends staged trip directly to planned driver & returns unstaged for Auto-Dispatch
  const restagedForKeep = await stageDriverForTrip({
    tripId: 'CONFLICT-STAGED-1',
    driver: driverAlex,
    actorName: 'Dana',
    bookingService: conflictSvc,
    nowMs,
  });
  const keepRes = await resolveStagedConflictStrategy({
    strategy: 'keep_staged',
    targetTrips: [restagedForKeep, cUnstaged],
    drivers: [driverAlex],
    fleetVehicles,
    actorName: 'Dana',
    bookingService: conflictSvc,
    sendPush: false,
    nowMs,
  });
  assert.equal(keepRes.sentStagedTrips.length, 1);
  assert.equal(keepRes.sentStagedTrips[0].assignedDriverId, 'drv-104');
  assert.equal(keepRes.sentStagedTrips[0].plannedDriverId, null);
  assert.deepEqual(
    keepRes.tripsForAutoDispatch.map((t) => t.id),
    ['CONFLICT-OPEN-2']
  );

  console.log('   ✅ keep_staged, skip_staged, and override_staged strategies verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 6. LEAD-WINDOW AUTO-RELEASE (`releaseDueStagedTrips`, `/api/auto-dispatch`, CRON)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Testing Staged Auto-Release Lead Window, offline/conflict alerts & server loops...');

  const releaseSvc = new MockBookingService();

  // 1) Due staged trip (T+30m <= 45m) with on_duty Alex -> should auto-release!
  const dueOnlineRaw = await releaseSvc.createBooking({
    ...makeTripInput({
      id: 'REL-DUE-ONLINE',
      scheduledPickupTime: new Date(nowMs + 30 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await releaseSvc.updateTrip(dueOnlineRaw.id, { status: 'CONFIRMED' });
  await stageDriverForTrip({
    tripId: dueOnlineRaw.id,
    driver: driverAlex,
    actorName: 'Dana',
    bookingService: releaseSvc,
    nowMs,
  });

  // 2) Due staged trip (T+25m <= 45m) with off_duty Brianna -> should emit staged_driver_offline alert & stay staged!
  const dueOfflineRaw = await releaseSvc.createBooking({
    ...makeTripInput({
      id: 'REL-DUE-OFFLINE',
      vehicleTier: 'suv',
      scheduledPickupTime: new Date(nowMs + 25 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await releaseSvc.updateTrip(dueOfflineRaw.id, { status: 'CONFIRMED' });
  await stageDriverForTrip({
    tripId: dueOfflineRaw.id,
    driver: driverBrianna,
    actorName: 'Dana',
    bookingService: releaseSvc,
    nowMs,
  });

  // 3) Due staged trip (T+35m <= 45m) on Alex that OVERLAPS with REL-DUE-ONLINE (T+30m..T+60m) -> staged_driver_conflict!
  const dueConflictRaw = await releaseSvc.createBooking({
    ...makeTripInput({
      id: 'REL-DUE-OVERLAP',
      scheduledPickupTime: new Date(nowMs + 35 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await releaseSvc.updateTrip(dueConflictRaw.id, { status: 'CONFIRMED' });
  await stageDriverForTrip({
    tripId: dueConflictRaw.id,
    driver: driverAlex,
    actorName: 'Dana',
    bookingService: releaseSvc,
    nowMs,
  });

  // 4) Airport staged trip at T+55m (45m + 15m airportExtra = 60m) vs Non-airport staged trip at T+55m (> 45m)
  const airportStagedRaw = await releaseSvc.createBooking({
    ...makeTripInput({
      id: 'REL-AIRPORT-55M',
      pickupLocation: {
        address: 'Lambert Airport Terminal 1, 10701 Lambert International Blvd, St. Louis, MO 63145',
        coordinates: { lat: 38.7422, lng: -90.3658 },
      },
      scheduledPickupTime: new Date(nowMs + 55 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await releaseSvc.updateTrip(airportStagedRaw.id, { status: 'CONFIRMED' });
  await stageDriverForTrip({
    tripId: airportStagedRaw.id,
    driver: driverBrianna,
    actorName: 'Dana',
    bookingService: releaseSvc,
    nowMs,
  });

  const futureStagedRaw = await releaseSvc.createBooking({
    ...makeTripInput({
      id: 'REL-FUTURE-55M',
      scheduledPickupTime: new Date(nowMs + 55 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await releaseSvc.updateTrip(futureStagedRaw.id, { status: 'CONFIRMED' });
  await stageDriverForTrip({
    tripId: futureStagedRaw.id,
    driver: driverAlex,
    actorName: 'Dana',
    bookingService: releaseSvc,
    nowMs,
  });

  const autoReleaseConfig = normalizeDispatchAutomationConfig({
    dispatchMode: 'direct_auto_assign',
    autoReleaseStagedDrivers: true,
    stagedAutoReleaseLeadMinutes: 45,
    airportExtraLeadMinutes: 15,
    isPaused: false,
  });

  const allBeforeRelease = await releaseSvc.getAllTrips();

  // Disabled or paused returns empty due list
  assert.equal(
    getDueStagedTripsForAutoRelease(
      allBeforeRelease,
      { ...autoReleaseConfig, autoReleaseStagedDrivers: false },
      nowMs
    ).length,
    0
  );
  assert.equal(
    getDueStagedTripsForAutoRelease(
      allBeforeRelease,
      { ...autoReleaseConfig, isPaused: true },
      nowMs
    ).length,
    0
  );

  const dueList = getDueStagedTripsForAutoRelease(allBeforeRelease, autoReleaseConfig, nowMs);
  const dueIds = dueList.map((t) => t.id);
  assert.ok(dueIds.includes('REL-DUE-ONLINE'));
  assert.ok(dueIds.includes('REL-DUE-OFFLINE'));
  assert.ok(dueIds.includes('REL-DUE-OVERLAP'));
  assert.ok(dueIds.includes('REL-AIRPORT-55M'), 'Airport staged trip at T+55m must include +15m buffer');
  assert.ok(!dueIds.includes('REL-FUTURE-55M'), 'Non-airport staged trip at T+55m must stay held');

  const releaseOutcome = await releaseDueStagedTrips({
    trips: allBeforeRelease,
    drivers: [driverAlex, driverBrianna],
    settings: {
      dispatchAutomation: autoReleaseConfig,
      fleet: fleetVehicles,
    },
    bookingService: releaseSvc,
    sendPush: false,
    nowMs,
  });

  assert.equal(releaseOutcome.releasedTrips.length, 1);
  assert.equal(releaseOutcome.releasedTrips[0].id, 'REL-DUE-ONLINE');
  assert.equal(releaseOutcome.releasedTrips[0].assignedDriverId, 'drv-104');
  assert.equal(releaseOutcome.releasedTrips[0].plannedDriverId, null);

  const offlineAlert = releaseOutcome.alerts.find((a) => a.tripId === 'REL-DUE-OFFLINE');
  assert.ok(offlineAlert, 'Expected staged_driver_offline alert for Brianna');
  assert.equal(offlineAlert?.reason, 'staged_driver_offline');
  assert.ok(offlineAlert?.message.includes('Send anyway or Re-assign'));

  const conflictAlert = releaseOutcome.alerts.find((a) => a.tripId === 'REL-DUE-OVERLAP');
  assert.ok(conflictAlert, 'Expected staged_driver_conflict alert for overlapping Alex ride');
  assert.equal(conflictAlert?.reason, 'staged_driver_conflict');

  // Verify held rides were NOT silently dropped or reassigned
  assert.equal(
    (await releaseSvc.getBookingStatus('REL-DUE-OFFLINE'))!.trip.plannedDriverId,
    'drv-208'
  );
  assert.equal(
    (await releaseSvc.getBookingStatus('REL-FUTURE-55M'))!.trip.plannedDriverId,
    'drv-104'
  );

  // Server `/api/auto-dispatch` & SLA cron integration for staged rides
  const serverFutureResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'REL-FUTURE-55M' }),
    }),
    {
      nowMs,
      bookingServiceOverride: releaseSvc,
      settingsOverride: { dispatchAutomation: autoReleaseConfig, fleet: fleetVehicles },
      driversOverride: [driverAlex, driverBrianna],
      zonesOverride: [...DEFAULT_ZONES],
      skipRateLimitForTests: true,
    }
  );
  const serverFutureJson = (await serverFutureResp.json()) as Record<string, any>;
  assert.equal(serverFutureJson.dispatched, false);
  assert.equal(serverFutureJson.outcome, 'skipped_ineligible');

  // Advance clock +20m so REL-FUTURE-55M is now T+35m (inside 45m window) and run SLA cron cycle!
  // Also make REL-DUE-ONLINE completed so Alex is conflict-free at T+35m
  await releaseSvc.updateTrip('REL-DUE-ONLINE', { status: 'completed' });
  await releaseSvc.updateTrip('REL-DUE-OVERLAP', { status: 'cancelled' });

  const cronOutcome = await executeSlaDispatchCronCycle({
    nowMs: nowMs + 20 * 60_000,
    bookingServiceOverride: releaseSvc,
    settingsOverride: { dispatchAutomation: autoReleaseConfig, fleet: fleetVehicles },
    driversOverride: [driverAlex, driverBrianna],
    zonesOverride: [...DEFAULT_ZONES],
  });
  assert.ok(
    cronOutcome.stagedReleasedTripIds.includes('REL-FUTURE-55M'),
    'Cron cycle must auto-release due staged trip when staged driver is on_duty'
  );
  assert.ok(
    cronOutcome.stagedReleaseAlerts.length >= 1,
    'Cron cycle must report tactical alert for due staged trip with offline driver'
  );

  console.log('   ✅ Lead-Window auto-release, offline/overlap alerts & server/cron loops verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 7. RBAC LEAD-WINDOW PERMISSIONS (`super_admin`, `admin`, AUTHORIZED DISPATCHER)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('7️⃣  Testing canOperatorConfigureLeadWindows RBAC matrix...');

  const rbacCfg = normalizeDispatchAutomationConfig({
    ...DEFAULT_DISPATCH_AUTOMATION_CONFIG,
    authorizedLeadWindowDispatcherIds: ['disp-lead-42', 'shiftlead@chesterfieldtaxi.com'],
  });

  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'sa-1', email: 'founder@chesterfieldtaxi.com', role: 'super_admin' },
      rbacCfg
    ),
    true,
    'super_admin must be permitted to configure Lead Windows'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'adm-1', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
      rbacCfg
    ),
    true,
    'admin must be permitted to configure Lead Windows'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-lead-42', email: 'any@chesterfieldtaxi.com', role: 'dispatcher' },
      rbacCfg
    ),
    true,
    'Authorized dispatcher UID must be permitted'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-other', email: 'ShiftLead@ChesterfieldTaxi.com', role: 'dispatcher' },
      rbacCfg
    ),
    true,
    'Authorized dispatcher email (case-insensitive) must be permitted'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-regular', email: 'desk2@chesterfieldtaxi.com', role: 'dispatcher' },
      rbacCfg
    ),
    false,
    'Unlisted dispatcher must NOT be permitted'
  );

  console.log('   ✅ RBAC Lead-Window permission matrix verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 8. STATIC GUARDRAILS: ZERO "HUD Now", FIRESTORE RULES, CRON & BUDGETS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('8️⃣  Auditing UI wording ("Send to Driver" / zero "HUD Now"), firestore.rules & budgets...');

  const rootDir = process.cwd();
  const appFiles = collectFilesRecursively(path.join(rootDir, 'app'), /\.(ts|tsx)$/);
  assert.ok(appFiles.length > 50, 'Expected to scan app/ TypeScript source files');

  for (const filePath of appFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    // Strip single-line and block comments before checking user-facing wording
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.ok(
      !/HUD\s+Now/i.test(stripped),
      `Forbidden "HUD Now" wording found in ${path.relative(rootDir, filePath)}`
    );
  }

  // Verify "Send to Driver" & concise "Send" (`title="Send to Driver"`) exist in key components
  const driverQueueSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/DriverQueueWindow.tsx'),
    'utf8'
  );
  assert.ok(driverQueueSrc.includes('Send to Driver'));
  assert.ok(driverQueueSrc.includes('Send All Staged'));

  const tableViewSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  assert.ok(tableViewSrc.includes('title="Send to Driver"'));
  const thCount = (tableViewSrc.match(/<th\b/g) || []).length;
  assert.equal(thCount, 10, `TripQueueTableView.tsx must keep exact 10 <th> columns, got ${thCount}`);

  // Verify firestore.rules does NOT expose plannedDriverId to drivers
  const firestoreRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  assert.ok(
    !firestoreRules.includes('plannedDriverId'),
    'firestore.rules must NOT grant driver read access via plannedDriverId'
  );

  // Verify vercel.json cron remains strictly "0 10 * * *"
  const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  assert.equal(vercelJson.crons?.[0]?.schedule, '0 10 * * *');

  // Verify strict monolith line-count budgets
  const lineBudgets: Array<{ rel: string; max: number }> = [
    { rel: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', max: 900 },
    { rel: 'app/routes/dispatch.tsx', max: 1600 },
    { rel: 'app/components/domain/admin/AdminRulesTab.tsx', max: 1350 },
    { rel: 'app/components/domain/dispatch/LiveFleetMap.tsx', max: 1350 },
  ];

  for (const b of lineBudgets) {
    const lines = fs.readFileSync(path.join(rootDir, b.rel), 'utf8').split(/\r?\n/).length;
    assert.ok(
      lines < b.max,
      `Line budget exceeded for ${b.rel}: ${lines} lines >= ${b.max} lines`
    );
    console.log(`   📏 ${b.rel}: ${lines} / ${b.max} lines`);
  }

  console.log('\n🎉 ALL PHASE 51 STAGED DRIVER PLANNER & AUTO-RELEASE SUITE TESTS PASSED! ✅');
}

main().catch((err) => {
  console.error('\n💥 Phase 51 verification suite failed:', err);
  process.exit(1);
});
