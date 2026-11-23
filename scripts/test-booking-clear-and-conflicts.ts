import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Trip } from '../app/core/types/trip';
import {
  evaluateDispatchBookingConflicts,
  type AutoDispatchDriverInput,
} from '../app/core/services/dispatch';

function makeExistingTrip(overrides: Partial<Trip> & { id: string }): Trip {
  return {
    id: overrides.id,
    status: overrides.status ?? 'CONFIRMED',
    bookingType: overrides.bookingType ?? 'scheduled',
    scheduledPickupTime: overrides.scheduledPickupTime,
    plannedDriverId: overrides.plannedDriverId ?? null,
    assignedDriverId: overrides.assignedDriverId ?? null,
    offeredToIds: [],
    rejectedByIds: [],
    multiCarGroupId: overrides.multiCarGroupId,
    pickupLocation: overrides.pickupLocation ?? {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
    },
    dropoffLocation: overrides.dropoffLocation ?? {
      address: 'Monarch Chesterfield Levee Trail, Chesterfield, MO',
    },
    passenger: overrides.passenger ?? {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: 'sjenkins@bayer.com',
      phone: '(314) 738-9921',
      passengerCount: 1,
      luggageCount: 0,
    },
    vehicleTier: 'standard',
    pricing: overrides.pricing ?? {
      baseFare: 15,
      distanceMiles: 23.5,
      durationMinutes: 25,
      distanceRate: 2.25,
      timeRate: 0.35,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 71,
      totalFare: 71,
      currency: 'USD',
    },
    payment: { method: 'card', status: 'pending', amount: 71 },
    statusHistory: [],
    createdAt: overrides.createdAt ?? '2026-11-23T06:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-11-23T06:00:00.000Z',
  };
}

function main() {
  console.log(
    '=== Phase 52.B: Post-Booking Auto-Clear & Future-Trip Conflict Guard Suite ===\n'
  );

  // Use local wall-clock Date construction so scheduledDate + scheduledTime align deterministically
  const baseLocal = new Date(2026, 10, 24, 9, 0, 0, 0); // Nov 24, 2026 09:00 local
  const nowMs = baseLocal.getTime();

  const driver104: AutoDispatchDriverInput = {
    id: 'drv-104',
    name: 'Alex Mercer',
    cabNumber: '104',
    vehicleUnit: 'Car #104',
    vehicleTier: 'standard',
    dutyStatus: 'on_duty',
    mapStatus: 'available',
  };

  // 1. Exact Duplicate ASAP Booking Detection (Sarah Jenkins screenshot scenario)
  const existingAsap = makeExistingTrip({
    id: 'TRIP-SARAH-ASAP-1',
    status: 'UNCONFIRMED',
    bookingType: 'asap',
    createdAt: new Date(nowMs - 2 * 60_000).toISOString(),
  });

  const asapDupCheck = evaluateDispatchBookingConflicts({
    timingType: 'asap',
    pickupAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
    dropoffAddress: 'Monarch Chesterfield Levee Trail, Chesterfield, MO',
    passengerName: 'Sarah Jenkins',
    phone: '314-738-9921',
    email: 'sjenkins@bayer.com',
    allTrips: [existingAsap],
    nowMs,
  });
  assert.equal(asapDupCheck.hasConflicts, true);
  assert.equal(asapDupCheck.hasCriticalConflicts, true);
  assert.equal(asapDupCheck.conflicts[0].kind, 'exact_duplicate');
  assert.equal(asapDupCheck.conflicts[0].conflictingTripId, 'TRIP-SARAH-ASAP-1');
  console.log('✓ 1. Exact duplicate ASAP booking flagged as critical conflict');

  // 2. Future Scheduled Passenger Overlap, Nearby Warning & Non-Conflicting Separation
  const future2pmIso = new Date(2026, 10, 25, 14, 0, 0, 0).toISOString(); // Nov 25 14:00 (30m ride)
  const existingFuture = makeExistingTrip({
    id: 'TRIP-SARAH-FUT-2PM',
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: future2pmIso,
    pricing: {
      baseFare: 15,
      distanceMiles: 20,
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
  });

  // 14:15 different route -> overlaps [14:00, 14:30] -> passenger_time_overlap (critical)
  const overlapCheck = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-25',
    scheduledTime: '14:15',
    pickupAddress: '800 N Lindbergh Blvd, Creve Coeur, MO',
    dropoffAddress: '100 N Broadway, St. Louis, MO',
    passengerName: 'Sarah Jenkins',
    phone: '(314) 738-9921',
    allTrips: [existingFuture],
    nowMs,
  });
  assert.equal(overlapCheck.hasCriticalConflicts, true);
  assert.equal(overlapCheck.conflicts[0].kind, 'passenger_time_overlap');

  // 15:10 -> 70m after 14:00 -> passenger_nearby_booking (warning)
  const nearbyCheck = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-25',
    scheduledTime: '15:10',
    pickupAddress: '800 N Lindbergh Blvd, Creve Coeur, MO',
    dropoffAddress: '100 N Broadway, St. Louis, MO',
    passengerName: 'Sarah Jenkins',
    phone: '(314) 738-9921',
    allTrips: [existingFuture],
    nowMs,
  });
  assert.equal(nearbyCheck.hasConflicts, true);
  assert.equal(nearbyCheck.hasCriticalConflicts, false);
  assert.equal(nearbyCheck.conflicts[0].kind, 'passenger_nearby_booking');

  // 18:00 -> 4 hours later -> 0 conflicts
  const clearLaterCheck = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-25',
    scheduledTime: '18:00',
    pickupAddress: '800 N Lindbergh Blvd, Creve Coeur, MO',
    dropoffAddress: '100 N Broadway, St. Louis, MO',
    passengerName: 'Sarah Jenkins',
    phone: '(314) 738-9921',
    allTrips: [existingFuture],
    nowMs,
  });
  assert.equal(clearLaterCheck.hasConflicts, false);

  // Cancelled / Completed / Stale old trips must NOT trigger false positives
  const cancelledDup = makeExistingTrip({
    id: 'TRIP-CANCELLED',
    status: 'cancelled',
    bookingType: 'scheduled',
    scheduledPickupTime: future2pmIso,
  });
  const stalePastAsap = makeExistingTrip({
    id: 'TRIP-STALE-YESTERDAY',
    status: 'UNCONFIRMED',
    bookingType: 'asap',
    createdAt: new Date(nowMs - 24 * 3600_000).toISOString(),
  });
  const noFalsePositives = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-25',
    scheduledTime: '14:00',
    pickupAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
    dropoffAddress: 'Monarch Chesterfield Levee Trail, Chesterfield, MO',
    passengerName: 'Sarah Jenkins',
    phone: '(314) 738-9921',
    allTrips: [cancelledDup, stalePastAsap],
    nowMs,
  });
  assert.equal(noFalsePositives.hasConflicts, false);

  // Edit mode excludes the trip being edited (and its convoy group)
  const selfEditCheck = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-25',
    scheduledTime: '14:00',
    pickupAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
    dropoffAddress: 'Monarch Chesterfield Levee Trail, Chesterfield, MO',
    passengerName: 'Sarah Jenkins',
    phone: '(314) 738-9921',
    allTrips: [existingFuture],
    excludeTripId: 'TRIP-SARAH-FUT-2PM',
    nowMs,
  });
  assert.equal(selfEditCheck.hasConflicts, false);
  console.log('✓ 2. Future passenger overlap, nearby warning, stale/cancelled ignore & edit self-exclusion verified');

  // 3. Return Leg Future Conflict Detection
  const returnLegConflict = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-25',
    scheduledTime: '08:00',
    pickupAddress: 'Monarch Chesterfield Levee Trail, Chesterfield, MO',
    dropoffAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
    passengerName: 'Sarah Jenkins',
    phone: '(314) 738-9921',
    returnTrip: true,
    autoCreateReturnTrip: true,
    returnDate: '2026-11-25',
    returnTime: '14:05',
    returnPickupAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
    returnDropoffAddress: 'Monarch Chesterfield Levee Trail, Chesterfield, MO',
    allTrips: [existingFuture],
    nowMs,
  });
  assert.equal(returnLegConflict.hasCriticalConflicts, true);
  assert.equal(returnLegConflict.conflicts[0].leg, 'return');
  console.log('✓ 3. Round-trip return-leg future conflict detection verified');

  // 4. Selected Driver / Staged Driver Future Schedule Overlap & Tight Turnaround
  const driverStagedAt3pm = makeExistingTrip({
    id: 'TRIP-DRV104-3PM',
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(2026, 10, 26, 15, 0, 0, 0).toISOString(), // Nov 26 15:00 (30m)
    plannedDriverId: 'drv-104',
    passenger: {
      firstName: 'David',
      lastName: 'Miller',
      email: 'dmiller@example.com',
      phone: '(314) 555-0199',
      passengerCount: 1,
      luggageCount: 1,
    },
    pricing: {
      baseFare: 15,
      distanceMiles: 18,
      durationMinutes: 30,
      distanceRate: 2.25,
      timeRate: 0.35,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 58,
      totalFare: 58,
      currency: 'USD',
    },
  });

  // Different passenger booking Car #104 at 14:45 (30m ride -> ends 15:15, overruns 15:00 staged ride!)
  const drvOverlap = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-26',
    scheduledTime: '14:45',
    estimatedDurationMinutes: 30,
    pickupAddress: '16401 Swingley Ridge Rd, Chesterfield, MO',
    dropoffAddress: 'Clayton, MO',
    passengerName: 'Elena Vance',
    phone: '(314) 555-0777',
    driverId: 'drv-104',
    driverAssignmentMode: 'stage_hold',
    drivers: [driver104],
    allTrips: [driverStagedAt3pm],
    nowMs,
  });
  assert.equal(drvOverlap.hasCriticalConflicts, true);
  assert.equal(drvOverlap.conflicts[0].kind, 'driver_schedule_overlap');

  // Booking Car #104 at 15:38 (+8m after 15:30 dropoff -> tight turnaround warning)
  const drvTight = evaluateDispatchBookingConflicts({
    timingType: 'later',
    scheduledDate: '2026-11-26',
    scheduledTime: '15:38',
    estimatedDurationMinutes: 25,
    pickupAddress: 'Clayton, MO',
    dropoffAddress: 'Chesterfield, MO',
    passengerName: 'Elena Vance',
    phone: '(314) 555-0777',
    driverId: 'drv-104',
    driverAssignmentMode: 'stage_hold',
    drivers: [driver104],
    allTrips: [driverStagedAt3pm],
    nowMs,
  });
  assert.equal(drvTight.hasConflicts, true);
  assert.equal(drvTight.hasCriticalConflicts, false);
  assert.equal(drvTight.conflicts[0].kind, 'driver_tight_turnaround');
  console.log('✓ 4. Driver / staged-driver future schedule overlap & tight turnaround checks verified');

  // 5. Source Guardrails: Post-Booking Auto-Clear & Monolith Budgets
  const rootDir = process.cwd();
  const subSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts'),
    'utf8'
  );
  assert.ok(
    subSrc.includes('onResetAfterCreate?.()'),
    'useDispatchBookingSubmission.ts must invoke onResetAfterCreate after creating a booking'
  );

  const engineLines = fs
    .readFileSync(path.join(rootDir, 'app/components/domain/dispatch/DispatchBookingEngine.tsx'), 'utf8')
    .split(/\r?\n/).length;
  const dispatchLines = fs
    .readFileSync(path.join(rootDir, 'app/routes/dispatch.tsx'), 'utf8')
    .split(/\r?\n/).length;
  assert.ok(engineLines < 1800, `DispatchBookingEngine.tsx exceeded budget: ${engineLines}`);
  assert.ok(dispatchLines < 1600, `dispatch.tsx exceeded budget: ${dispatchLines}`);
  console.log(
    `✓ 5. Auto-clear wiring & monolith budgets verified (DispatchBookingEngine=${engineLines}L/<1800L, dispatch.tsx=${dispatchLines}L/<1600L)`
  );

  console.log('\n🎉 ALL PHASE 52.B POST-BOOKING CLEAR & CONFLICT GUARD TESTS PASSED! ✅');
}

main();
