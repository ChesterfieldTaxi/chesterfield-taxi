/**
 * Platform Phase 50 Verification Suite:
 * Intelligent Auto-Dispatch Engine (4 Modes + Pre-Pickup Lead Window + `/api/auto-dispatch`),
 * Admin Control Center, RBAC Lead-Window Permissions & `Auto-Dispatch Ready (N)` Sweep
 * (`scripts/test-auto-dispatch-admin-controls.ts`)
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
  advanceOrExpireOfferCascade,
  evaluateAutoDispatchCandidates,
  executeAutoDispatch,
  getReadyForAutoDispatchTrips,
  isTripEligibleForAutoPilot,
  isTripWithinDispatchLeadWindow,
  isWithinAutoDispatchOperatingHours,
  runReadyAutoDispatchSweep,
  type AutoDispatchDriverInput,
} from '../app/core/services/dispatch';
import { handleAutoDispatchHttpRequest } from '../app/core/services/dispatch/auto-dispatch.server';
import { executeSlaDispatchCronCycle } from '../app/core/services/dispatch/sla-cron.server';

function makeTripInput(overrides: Partial<CreateTripInput> = {}): CreateTripInput {
  return {
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-22T18:00:00.000Z',
    passenger: {
      firstName: 'Claire',
      lastName: 'bennett',
      email: 'claire.bennett@example.com',
      phone: '(314) 555-0192',
      passengerCount: 2,
      luggageCount: 2,
    },
    pickupLocation: {
      address: '17057 N Outer 40 Rd, Chesterfield, MO 63005',
      coordinates: { lat: 38.6631, lng: -90.5771 }, // Inside zone-chesterfield-valley
    },
    dropoffLocation: {
      address: '800 N Lindbergh Blvd, Creve Coeur, MO 63167',
      coordinates: { lat: 38.6714, lng: -90.408 },
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5,
      distanceMiles: 11,
      durationMinutes: 16,
      distanceRate: 2.25,
      timeRate: 0.35,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 31.5,
      totalFare: 31.5,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'authorized',
      amount: 31.5,
    },
    ...overrides,
  };
}

async function main() {
  console.log('=== Phase 50: Intelligent Auto-Dispatch Engine & Pre-Pickup Lead Window Suite ===\n');

  const nowMs = Date.parse('2026-11-22T17:00:00.000Z');

  // ─────────────────────────────────────────────────────────────────────────
  // 1. BACKWARD-COMPATIBLE CONFIG NORMALIZATION & RBAC LEAD-WINDOW HELPER
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing normalizeDispatchAutomationConfig & canOperatorConfigureLeadWindows...');

  const defaultNorm = normalizeDispatchAutomationConfig(undefined);
  assert.equal(defaultNorm.dispatchMode, 'manual_1tap');
  assert.equal(defaultNorm.autoOfferOnConfirm, false);
  assert.equal(defaultNorm.sweepExecutionMode, 'sequential_cascade');
  assert.equal(defaultNorm.isPaused, false);
  assert.equal(defaultNorm.broadcastPoolSize, 3);
  assert.equal(defaultNorm.scheduledDispatchLeadMinutes, 45);
  assert.equal(defaultNorm.stagedAutoReleaseLeadMinutes, 45);
  assert.equal(defaultNorm.maxPickupRadiusMiles, 18);
  assert.equal(defaultNorm.strictZoneFirst, true);
  assert.equal(defaultNorm.minDriverScore, 0);
  assert.equal(defaultNorm.maxGpsStaleSeconds, 300);
  assert.equal(defaultNorm.operatingHoursMode, 'always');
  assert.equal(defaultNorm.windowStartHour, 22);
  assert.equal(defaultNorm.windowEndHour, 6);
  assert.equal(defaultNorm.fallbackOnExhaustion, 'alert_dispatch');

  // Legacy saved config without dispatchMode but autoOfferOnConfirm: true -> sequential_cascade
  const legacyAuto = normalizeDispatchAutomationConfig({ autoOfferOnConfirm: true });
  assert.equal(legacyAuto.dispatchMode, 'sequential_cascade');
  assert.equal(legacyAuto.autoOfferOnConfirm, true);
  assert.equal(legacyAuto.sweepExecutionMode, 'sequential_cascade');

  // Explicit mode synchronizes autoOfferOnConfirm & clamps bounds
  const poolClamped = normalizeDispatchAutomationConfig({
    dispatchMode: 'broadcast_pool',
    broadcastPoolSize: 99,
    scheduledDispatchLeadMinutes: 5,
    stagedAutoReleaseLeadMinutes: 999,
    maxPickupRadiusMiles: 250,
    minDriverScore: -10,
    maxGpsStaleSeconds: 99999,
    authorizedLeadWindowDispatcherIds: ['  disp-uid-1 ', '  NightLead@ChesterfieldTaxi.com  ', ''],
  });
  assert.equal(poolClamped.dispatchMode, 'broadcast_pool');
  assert.equal(poolClamped.autoOfferOnConfirm, true);
  assert.equal(poolClamped.sweepExecutionMode, 'broadcast_pool');
  assert.equal(poolClamped.broadcastPoolSize, 8);
  assert.equal(poolClamped.scheduledDispatchLeadMinutes, 15);
  assert.equal(poolClamped.stagedAutoReleaseLeadMinutes, 240);
  assert.equal(poolClamped.maxPickupRadiusMiles, 100);
  assert.equal(poolClamped.minDriverScore, 0);
  assert.equal(poolClamped.maxGpsStaleSeconds, 3600);
  assert.deepEqual(poolClamped.authorizedLeadWindowDispatcherIds, [
    'disp-uid-1',
    'nightlead@chesterfieldtaxi.com',
  ]);

  // RBAC: Admin true, listed dispatcher UID/email true, unlisted dispatcher false, driver false
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'adm-1', email: 'boss@chesterfieldtaxi.com', role: 'admin' },
      DEFAULT_DISPATCH_AUTOMATION_CONFIG
    ),
    true,
    'Admin must always be allowed to configure Lead Windows'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-uid-1', email: 'other@chesterfieldtaxi.com', role: 'dispatcher' },
      poolClamped
    ),
    true,
    'Listed dispatcher UID must be allowed to configure Lead Windows'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-uid-99', email: 'NightLead@ChesterfieldTaxi.com', roles: ['dispatcher'] },
      poolClamped
    ),
    true,
    'Listed dispatcher email (case-insensitive) must be allowed to configure Lead Windows'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-unlisted', email: 'daydesk@chesterfieldtaxi.com', role: 'dispatcher' },
      poolClamped
    ),
    false,
    'Unlisted dispatcher must NOT be allowed to configure Lead Windows'
  );
  assert.equal(
    canOperatorConfigureLeadWindows(
      { uid: 'disp-uid-1', email: 'nightlead@chesterfieldtaxi.com', role: 'driver' },
      poolClamped
    ),
    false,
    'Driver role must never be granted Lead-Window configuration rights'
  );
  console.log('   ✅ Config normalization & RBAC lead-window permissions verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CANDIDATE EVALUATION GUARDRAILS & EXCLUSION REASONS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing evaluateAutoDispatchCandidates guardrails & exclusion diagnostics...');

  const baseTrip: Trip = {
    ...(makeTripInput() as any),
    id: 'CT-EVAL-50',
    status: 'CONFIRMED',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    statusHistory: [],
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const evalDrivers: AutoDispatchDriverInput[] = [
    // In pickup zone (~2.2 mi away), score 88, fresh GPS
    {
      id: 'drv-in-zone',
      name: 'InZone Zakharya',
      cabNumber: '947',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 88,
      currentLocation: {
        coordinates: { lat: 38.645, lng: -90.605 },
        timestamp: new Date(nowMs - 20_000).toISOString(),
      },
    },
    // Outside pickup zone (~6.5 mi away), higher score 99, fresh GPS
    {
      id: 'drv-out-zone-high',
      name: 'OutZone Michael',
      cabNumber: '982',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 99,
      currentLocation: {
        coordinates: { lat: 38.655, lng: -90.45 },
        timestamp: new Date(nowMs - 15_000).toISOString(),
      },
    },
    // Excluded: Outside 18 mi maxPickupRadiusMiles (~24 mi away)
    {
      id: 'drv-too-far',
      name: 'Far Away Frank',
      cabNumber: '301',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 95,
      currentLocation: {
        coordinates: { lat: 38.627, lng: -90.12 },
        timestamp: new Date(nowMs - 10_000).toISOString(),
      },
    },
    // Excluded: Low score (72 < 85)
    {
      id: 'drv-low-score',
      name: 'Low Score Larry',
      cabNumber: '302',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 72,
      currentLocation: {
        coordinates: { lat: 38.663, lng: -90.577 },
        timestamp: new Date(nowMs - 10_000).toISOString(),
      },
    },
    // Excluded: Stale GPS (650s > 300s)
    {
      id: 'drv-stale-gps',
      name: 'Stale Signal Sam',
      cabNumber: '303',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 96,
      currentLocation: {
        coordinates: { lat: 38.663, lng: -90.577 },
        timestamp: new Date(nowMs - 650_000).toISOString(),
      },
    },
    // Excluded when maxGpsStaleSeconds > 0: No GPS at all
    {
      id: 'drv-no-gps',
      name: 'No GPS Nina',
      cabNumber: '304',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 93,
      zone: 'Chesterfield Valley',
    },
  ];

  const strictEval = evaluateAutoDispatchCandidates(
    baseTrip,
    evalDrivers,
    DEFAULT_ZONES,
    {
      rankingStrategy: 'highest_driver_score',
      strictZoneFirst: true,
      maxPickupRadiusMiles: 18,
      minDriverScore: 85,
      maxGpsStaleSeconds: 300,
    },
    { nowMs }
  );

  assert.deepEqual(
    strictEval.eligible.map((c) => c.driverId),
    ['drv-in-zone', 'drv-out-zone-high'],
    'strictZoneFirst=true ranks in-pickup-zone candidate #1 even when out-of-zone driver has higher score'
  );

  const exclusionCodes = new Map(strictEval.excluded.map((e) => [e.driverId, e.exclusionCode]));
  assert.equal(exclusionCodes.get('drv-too-far'), 'OUTSIDE_MAX_RADIUS');
  assert.equal(exclusionCodes.get('drv-low-score'), 'SCORE_BELOW_MINIMUM');
  assert.equal(exclusionCodes.get('drv-stale-gps'), 'GPS_TELEMETRY_STALE');
  assert.equal(exclusionCodes.get('drv-no-gps'), 'NO_GPS_TELEMETRY');

  // strictZoneFirst=false + maxGpsStaleSeconds=0 (allows no-GPS on-duty drivers)
  const relaxedEval = evaluateAutoDispatchCandidates(
    baseTrip,
    evalDrivers,
    DEFAULT_ZONES,
    {
      rankingStrategy: 'highest_driver_score',
      strictZoneFirst: false,
      maxPickupRadiusMiles: 18,
      minDriverScore: 85,
      maxGpsStaleSeconds: 0,
    },
    { nowMs }
  );
  assert.equal(
    relaxedEval.eligible[0].driverId,
    'drv-out-zone-high',
    'strictZoneFirst=false allows higher-score out-of-zone candidate to rank #1'
  );
  assert.ok(
    relaxedEval.eligible.some((c) => c.driverId === 'drv-no-gps'),
    'maxGpsStaleSeconds=0 permits on-duty drivers without GPS coordinates'
  );

  // Staged / plannedDriverId priority boost
  const plannedEval = evaluateAutoDispatchCandidates(
    { ...baseTrip, plannedDriverId: 'drv-out-zone-high' },
    evalDrivers,
    DEFAULT_ZONES,
    { strictZoneFirst: true, minDriverScore: 85 },
    { nowMs }
  );
  assert.equal(
    plannedEval.eligible[0].driverId,
    'drv-out-zone-high',
    'Trip with plannedDriverId boosts the staged driver to #1 when eligible'
  );
  console.log('   ✅ Candidate guardrails, exclusion reasons & plannedDriverId boost verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 3. OPERATING HOURS & PRE-PICKUP LEAD WINDOW GATING (3h / 2w / 2mo UNTOUCHED!)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Testing Operating Hours & Pre-Pickup Lead-Window gating...');

  // Daytime window 08:00–18:00
  const daytimeCfg = {
    operatingHoursMode: 'custom_window' as const,
    windowStartHour: 8,
    windowEndHour: 18,
  };
  assert.equal(isWithinAutoDispatchOperatingHours(daytimeCfg, new Date(2026, 10, 22, 10, 30)), true);
  assert.equal(isWithinAutoDispatchOperatingHours(daytimeCfg, new Date(2026, 10, 22, 19, 0)), false);

  // Overnight wrap-around window 22:00–06:00
  const overnightCfg = {
    operatingHoursMode: 'custom_window' as const,
    windowStartHour: 22,
    windowEndHour: 6,
  };
  assert.equal(isWithinAutoDispatchOperatingHours(overnightCfg, new Date(2026, 10, 22, 23, 15)), true);
  assert.equal(isWithinAutoDispatchOperatingHours(overnightCfg, new Date(2026, 10, 23, 2, 45)), true);
  assert.equal(isWithinAutoDispatchOperatingHours(overnightCfg, new Date(2026, 10, 23, 6, 0)), false);
  assert.equal(isWithinAutoDispatchOperatingHours(overnightCfg, new Date(2026, 10, 22, 14, 0)), false);

  // Lead-window test trips (scheduledDispatchLeadMinutes = 45m, airportExtraLeadMinutes = +15m -> 60m)
  const autoPilotCfg = normalizeDispatchAutomationConfig({
    dispatchMode: 'sequential_cascade',
    scheduledDispatchLeadMinutes: 45,
    airportExtraLeadMinutes: 15,
  });

  const asapTrip: Trip = {
    ...baseTrip,
    id: 'T-ASAP',
    bookingType: 'asap',
    scheduledPickupTime: undefined,
  };
  const dueIn30mTrip: Trip = {
    ...baseTrip,
    id: 'T-30M',
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(nowMs + 30 * 60_000).toISOString(),
  };
  const stlAirportDueIn55mTrip: Trip = {
    ...baseTrip,
    id: 'T-STL-55M',
    bookingType: 'scheduled',
    pickupLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    scheduledPickupTime: new Date(nowMs + 55 * 60_000).toISOString(),
  };
  const dueIn3HoursTrip: Trip = {
    ...baseTrip,
    id: 'T-3H-OUT',
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(nowMs + 3 * 60 * 60_000).toISOString(),
  };
  const dueIn2WeeksTrip: Trip = {
    ...baseTrip,
    id: 'T-2W-OUT',
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(nowMs + 14 * 24 * 60 * 60_000).toISOString(),
  };
  const dueIn2MonthsTrip: Trip = {
    ...baseTrip,
    id: 'T-2MO-OUT',
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(nowMs + 60 * 24 * 60 * 60_000).toISOString(),
  };
  const unconfirmedAsapTrip: Trip = {
    ...asapTrip,
    id: 'T-UNCONFIRMED',
    status: 'UNCONFIRMED',
  };

  assert.equal(isTripWithinDispatchLeadWindow(asapTrip, autoPilotCfg, nowMs), true);
  assert.equal(isTripWithinDispatchLeadWindow(dueIn30mTrip, autoPilotCfg, nowMs), true);
  assert.equal(isTripWithinDispatchLeadWindow(stlAirportDueIn55mTrip, autoPilotCfg, nowMs), true);
  assert.equal(isTripWithinDispatchLeadWindow(dueIn3HoursTrip, autoPilotCfg, nowMs), false);
  assert.equal(isTripWithinDispatchLeadWindow(dueIn2WeeksTrip, autoPilotCfg, nowMs), false);
  assert.equal(isTripWithinDispatchLeadWindow(dueIn2MonthsTrip, autoPilotCfg, nowMs), false);
  assert.equal(isTripWithinDispatchLeadWindow(unconfirmedAsapTrip, autoPilotCfg, nowMs), false);

  const mixedQueue = [
    dueIn2MonthsTrip,
    dueIn3HoursTrip,
    dueIn30mTrip,
    dueIn2WeeksTrip,
    asapTrip,
    stlAirportDueIn55mTrip,
    unconfirmedAsapTrip,
  ];

  for (const futureTrip of [dueIn3HoursTrip, dueIn2WeeksTrip, dueIn2MonthsTrip, unconfirmedAsapTrip]) {
    assert.equal(
      isTripEligibleForAutoPilot(futureTrip, autoPilotCfg, nowMs),
      false,
      `Trip ${futureTrip.id} must NEVER be eligible for Auto-Pilot`
    );
  }
  for (const readyTrip of [asapTrip, dueIn30mTrip, stlAirportDueIn55mTrip]) {
    assert.equal(
      isTripEligibleForAutoPilot(readyTrip, autoPilotCfg, nowMs),
      true,
      `Trip ${readyTrip.id} inside lead window MUST be eligible for Auto-Pilot`
    );
  }

  // Even when paused or in manual_1tap, getReadyForAutoDispatchTrips returns ONLY the 3 ready rides
  const readyWhenPaused = getReadyForAutoDispatchTrips(
    mixedQueue,
    { ...autoPilotCfg, isPaused: true },
    nowMs
  );
  assert.deepEqual(
    readyWhenPaused.map((t) => t.id),
    ['T-ASAP', 'T-30M', 'T-STL-55M'],
    'getReadyForAutoDispatchTrips includes ASAP + in-window rides while strictly excluding 3h, 2w, 2mo & UNCONFIRMED rides'
  );
  assert.equal(
    isTripEligibleForAutoPilot(asapTrip, { ...autoPilotCfg, isPaused: true }, nowMs),
    false,
    'Paused Auto-Pilot blocks automatic execution while keeping Ready Sweep available'
  );
  console.log('   ✅ Operating hours & Pre-Pickup Lead-Window gating (3h/2w/2mo untouched) verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 4. ALL 4 EXECUTION MODES + SWEEP + EXHAUSTION FALLBACK
  // ─────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing all 4 execution modes (manual_1tap sweep, sequential_cascade fallback, broadcast_pool, direct_auto_assign)...');

  const fleetCars: FleetCarConfig[] = [
    {
      id: 'fleet-401',
      unitNumber: 'Car #401',
      vehicleTypeId: 'standard',
      make: 'Toyota',
      model: 'Camry Hybrid',
      year: 2025,
      color: 'Silver',
      licensePlate: 'MO-401TX',
      vin: 'VIN401',
      mileage: 9200,
      status: 'active',
    },
  ];

  const fourDrivers: AutoDispatchDriverInput[] = [
    {
      id: 'd1',
      name: 'Driver One',
      cabNumber: '401',
      vehicleId: 'fleet-401',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 95,
      coordinates: { lat: 38.664, lng: -90.578 },
    },
    {
      id: 'd2',
      name: 'Driver Two',
      cabNumber: '402',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 93,
      coordinates: { lat: 38.66, lng: -90.582 },
    },
    {
      id: 'd3',
      name: 'Driver Three',
      cabNumber: '403',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 91,
      coordinates: { lat: 38.655, lng: -90.59 },
    },
    {
      id: 'd4',
      name: 'Driver Four',
      cabNumber: '404',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 89,
      coordinates: { lat: 38.65, lng: -90.595 },
    },
  ];

  // 4A. Mode 1: manual_1tap unattended noop + on-demand sweepExecutionMode
  const sweepBooking = new MockBookingService();
  const sReady1 = await sweepBooking.createBooking({
    ...makeTripInput({ id: 'SWEEP-READY-1', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'CONFIRMED',
  });
  const sReady2 = await sweepBooking.createBooking({
    ...makeTripInput({
      id: 'SWEEP-READY-2',
      scheduledPickupTime: new Date(nowMs + 25 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  const sFuture2Weeks = await sweepBooking.createBooking({
    ...makeTripInput({
      id: 'SWEEP-FUTURE-2W',
      scheduledPickupTime: new Date(nowMs + 14 * 24 * 60 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await sweepBooking.updateTrip(sReady1.id, { status: 'CONFIRMED' });
  await sweepBooking.updateTrip(sReady2.id, { status: 'CONFIRMED' });
  await sweepBooking.updateTrip(sFuture2Weeks.id, { status: 'CONFIRMED' });

  const allSweepTrips = await sweepBooking.getAllTrips();
  const manualNoop = await executeAutoDispatch({
    trip: allSweepTrips.find((t) => t.id === 'SWEEP-READY-1')!,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: { dispatchMode: 'manual_1tap', sweepExecutionMode: 'direct_auto_assign' },
    bookingService: sweepBooking,
    sendPush: false,
    nowMs,
  });
  assert.equal(manualNoop.outcome, 'noop', 'manual_1tap never auto-dispatches without explicit sweep/override');

  const sweepSummary = await runReadyAutoDispatchSweep({
    trips: allSweepTrips,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: {
      dispatchMode: 'manual_1tap',
      sweepExecutionMode: 'sequential_cascade',
      scheduledDispatchLeadMinutes: 45,
    },
    fleetVehicles: fleetCars,
    bookingService: sweepBooking,
    sendPush: false,
    nowMs,
  });
  assert.equal(sweepSummary.readyCount, 2);
  assert.equal(sweepSummary.dispatchedCount, 2);
  const afterSweep1 = (await sweepBooking.getBookingStatus('SWEEP-READY-1'))!.trip!;
  const afterSweep2 = (await sweepBooking.getBookingStatus('SWEEP-READY-2'))!.trip!;
  const afterSweepFuture = (await sweepBooking.getBookingStatus('SWEEP-FUTURE-2W'))!.trip!;
  assert.deepEqual(afterSweep1.offeredToIds, ['d1']);
  assert.deepEqual(
    afterSweep2.offeredToIds,
    ['d2'],
    'Sequential sweep updates activeTrips after each ride so d1 is never double-offered onto SWEEP-READY-2'
  );
  assert.equal(
    afterSweepFuture.status,
    'CONFIRMED',
    '2-week future ride remains completely untouched in CONFIRMED during Ready Sweep'
  );
  assert.equal(afterSweepFuture.offerCascade, undefined);

  // 4B. Mode 2: sequential_cascade + fallbackOnExhaustion: 'broadcast_all_eligible'
  const seqBooking = new MockBookingService();
  const seqSeed = await seqBooking.createBooking({
    ...makeTripInput({ id: 'SEQ-FBK-1', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'CONFIRMED',
  });
  await seqBooking.updateTrip(seqSeed.id, { status: 'CONFIRMED' });
  const seqConfig = {
    dispatchMode: 'sequential_cascade' as const,
    maxCascadeAttempts: 2,
    offerTimeoutSeconds: 30,
    fallbackOnExhaustion: 'broadcast_all_eligible' as const,
  };

  const seqStep1 = await executeAutoDispatch({
    trip: (await seqBooking.getBookingStatus('SEQ-FBK-1'))!.trip!,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: seqConfig,
    bookingService: seqBooking,
    sendPush: false,
    nowMs,
  });
  assert.deepEqual(seqStep1.trip.offeredToIds, ['d1']);

  const seqAfterDecline1 = await seqBooking.declineDriverOffer('SEQ-FBK-1', 'd1');
  const seqStep2 = await advanceOrExpireOfferCascade({
    trip: seqAfterDecline1,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: seqConfig,
    bookingService: seqBooking,
    sendPush: false,
    nowMs: nowMs + 5_000,
  });
  assert.equal(seqStep2.outcome, 'advanced');
  assert.deepEqual(seqStep2.trip.offeredToIds, ['d2']);

  // Step 2 (attempt 2/2) times out -> triggers broadcast_all_eligible to ['d3', 'd4']!
  const seqFallbackStep = await advanceOrExpireOfferCascade({
    trip: seqStep2.trip,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: seqConfig,
    bookingService: seqBooking,
    sendPush: false,
    nowMs: nowMs + 40_000,
  });
  assert.equal(seqFallbackStep.outcome, 'advanced');
  assert.equal(seqFallbackStep.trip.offerCascade?.fallbackBroadcastUsed, true);
  assert.equal(seqFallbackStep.trip.offerCascade?.mode, 'broadcast_pool');
  assert.deepEqual(seqFallbackStep.trip.offeredToIds, ['d3', 'd4']);

  // Fallback broadcast times out -> cleanly marks exhausted
  const seqFinalExhausted = await advanceOrExpireOfferCascade({
    trip: seqFallbackStep.trip,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: seqConfig,
    bookingService: seqBooking,
    sendPush: false,
    nowMs: nowMs + 75_000,
  });
  assert.equal(seqFinalExhausted.outcome, 'exhausted');
  assert.equal(seqFinalExhausted.trip.status, 'CONFIRMED');
  assert.deepEqual(seqFinalExhausted.trip.offeredToIds, []);

  // 4C. Mode 3: broadcast_pool (Top-K simultaneous offer, partial decline wait, atomic first-accept win, & batch rollover)
  const poolBooking = new MockBookingService();
  const poolSeed = await poolBooking.createBooking({
    ...makeTripInput({ id: 'POOL-WIN-1', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'CONFIRMED',
  });
  await poolBooking.updateTrip(poolSeed.id, { status: 'CONFIRMED' });
  const pushedDriverIds: string[] = [];

  const poolStart = await executeAutoDispatch({
    trip: (await poolBooking.getBookingStatus('POOL-WIN-1'))!.trip!,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: {
      dispatchMode: 'broadcast_pool',
      broadcastPoolSize: 3,
      offerTimeoutSeconds: 45,
      maxCascadeAttempts: 2,
    },
    bookingService: poolBooking,
    sendPush: (driverId) => {
      pushedDriverIds.push(driverId);
    },
    nowMs,
  });

  assert.equal(poolStart.outcome, 'offered');
  assert.equal(poolStart.trip.offerCascade?.mode, 'broadcast_pool');
  assert.deepEqual(poolStart.trip.offeredToIds, ['d1', 'd2', 'd3']);
  assert.deepEqual(poolStart.trip.offerCascade?.activeOfferedDriverIds, ['d1', 'd2', 'd3']);
  assert.deepEqual(pushedDriverIds, ['d1', 'd2', 'd3']);

  // Partial decline: d1 declines -> d2 & d3 remain offered, coordinator stays 'waiting'!
  const afterPoolPartialDecline = await poolBooking.declineDriverOffer('POOL-WIN-1', 'd1');
  assert.deepEqual(afterPoolPartialDecline.offeredToIds, ['d2', 'd3']);
  assert.deepEqual(afterPoolPartialDecline.offerCascade?.activeOfferedDriverIds, ['d2', 'd3']);

  const poolWaitCheck = await advanceOrExpireOfferCascade({
    trip: afterPoolPartialDecline,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: { dispatchMode: 'broadcast_pool', broadcastPoolSize: 3 },
    bookingService: poolBooking,
    sendPush: false,
    nowMs: nowMs + 12_000,
  });
  assert.equal(
    poolWaitCheck.outcome,
    'waiting',
    'broadcast_pool must stay waiting while at least 1 offered driver has not declined before timeout'
  );

  // Atomic win: d2 accepts -> clears offeredToIds, d3 cannot hijack!
  const poolClaimed = await poolBooking.acceptDriverOffer('POOL-WIN-1', 'd2');
  assert.equal(poolClaimed.status, 'assigned');
  assert.equal(poolClaimed.assignedDriverId, 'd2');
  assert.deepEqual(poolClaimed.offeredToIds, []);
  assert.equal(poolClaimed.offerCascade?.state, 'accepted');

  await assert.rejects(
    () => poolBooking.acceptDriverOffer('POOL-WIN-1', 'd3'),
    /already claimed/i,
    'Second driver attempting to accept an already-claimed pool offer must be rejected atomically'
  );

  // Pool timeout rollover: Batch 1 ['d1', 'd2'] times out -> rolls to Batch 2 ['d3', 'd4']
  const poolRollSeed = await poolBooking.createBooking({
    ...makeTripInput({ id: 'POOL-ROLL-1', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'CONFIRMED',
  });
  await poolBooking.updateTrip(poolRollSeed.id, { status: 'CONFIRMED' });
  const poolBatch1 = await executeAutoDispatch({
    trip: (await poolBooking.getBookingStatus('POOL-ROLL-1'))!.trip!,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: {
      dispatchMode: 'broadcast_pool',
      broadcastPoolSize: 2,
      offerTimeoutSeconds: 30,
      maxCascadeAttempts: 2,
    },
    bookingService: poolBooking,
    sendPush: false,
    nowMs,
  });
  assert.deepEqual(poolBatch1.trip.offeredToIds, ['d1', 'd2']);

  const poolBatch2 = await advanceOrExpireOfferCascade({
    trip: poolBatch1.trip,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: {
      dispatchMode: 'broadcast_pool',
      broadcastPoolSize: 2,
      offerTimeoutSeconds: 30,
      maxCascadeAttempts: 2,
    },
    bookingService: poolBooking,
    sendPush: false,
    nowMs: nowMs + 31_000,
  });
  assert.equal(poolBatch2.outcome, 'advanced');
  assert.deepEqual(poolBatch2.trip.offeredToIds, ['d3', 'd4']);

  // 4D. Mode 4: direct_auto_assign (#1 candidate assigned immediately + frozen assignedVehicle + DRIVER_ASSIGNED audit)
  const directBooking = new MockBookingService();
  const directSeed = await directBooking.createBooking({
    ...makeTripInput({ id: 'DIRECT-ASN-1', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'CONFIRMED',
  });
  await directBooking.updateTrip(directSeed.id, { status: 'CONFIRMED' });
  const directPushed: string[] = [];

  const directRes = await executeAutoDispatch({
    trip: (await directBooking.getBookingStatus('DIRECT-ASN-1'))!.trip!,
    drivers: fourDrivers,
    zones: DEFAULT_ZONES,
    config: { dispatchMode: 'direct_auto_assign', rankingStrategy: 'nearest_in_zone' },
    fleetVehicles: fleetCars,
    bookingService: directBooking,
    sendPush: (uid) => {
      directPushed.push(uid);
    },
    nowMs,
  });

  assert.equal(directRes.outcome, 'assigned');
  assert.equal(directRes.trip.status, 'assigned');
  assert.equal(directRes.trip.assignedDriverId, 'd1');
  assert.deepEqual(directRes.trip.offeredToIds, []);
  assert.equal(directRes.trip.assignedVehicle?.vehicleId, 'fleet-401');
  assert.equal(directRes.trip.assignedVehicle?.vehicleNumber, 'Car #401');
  assert.equal(directRes.trip.assignedVehicle?.licensePlate, 'MO-401TX');
  assert.ok(
    directRes.trip.auditLog?.some(
      (ev) => ev.action === 'DRIVER_ASSIGNED' && ev.actorRole === 'system'
    ),
    'direct_auto_assign must record a DRIVER_ASSIGNED TripAuditEvent with actorRole: "system"'
  );
  assert.deepEqual(directPushed, ['d1']);
  console.log('   ✅ All 4 assignment modes, sweep conflict prevention & exhaustion fallback verified.\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 5. SERVER-ISOLATED `/api/auto-dispatch`, CRON INTEGRATION & GUARDRAILS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Testing POST /api/auto-dispatch server isolation, cron integration & file budgets...');

  const apiBooking = new MockBookingService();
  const apiReadyAsap = await apiBooking.createBooking({
    ...makeTripInput({ id: 'API-READY-ASAP', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'CONFIRMED',
  });
  const apiFuture2Mo = await apiBooking.createBooking({
    ...makeTripInput({
      id: 'API-FUTURE-2MO',
      scheduledPickupTime: new Date(nowMs + 60 * 24 * 60 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  const apiUnconfirmed = await apiBooking.createBooking({
    ...makeTripInput({ id: 'API-UNCONF-1', bookingType: 'asap', scheduledPickupTime: undefined }),
    status: 'UNCONFIRMED',
  });
  await apiBooking.updateTrip(apiReadyAsap.id, { status: 'CONFIRMED' });
  await apiBooking.updateTrip(apiFuture2Mo.id, { status: 'CONFIRMED' });
  await apiBooking.updateTrip(apiUnconfirmed.id, { status: 'UNCONFIRMED' });

  // GET rejected with 405
  const getResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', { method: 'GET' }),
    { skipRateLimitForTests: true }
  );
  assert.equal(getResp.status, 405);

  // Invalid tripId rejected with 400
  const badResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: '../bad/id' }),
    }),
    { skipRateLimitForTests: true }
  );
  assert.equal(badResp.status, 400);

  const serverOpts = {
    nowMs,
    bookingServiceOverride: apiBooking,
    settingsOverride: {
      dispatchAutomation: normalizeDispatchAutomationConfig({
        dispatchMode: 'direct_auto_assign',
        scheduledDispatchLeadMinutes: 45,
      }),
      fleet: fleetCars,
    },
    driversOverride: fourDrivers,
    zonesOverride: [...DEFAULT_ZONES],
    skipRateLimitForTests: true,
  };

  // UNCONFIRMED trip is skipped server-side
  const unconfResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'API-UNCONF-1' }),
    }),
    serverOpts
  );
  const unconfJson = (await unconfResp.json()) as Record<string, any>;
  assert.equal(unconfJson.dispatched, false);
  assert.equal(unconfJson.outcome, 'skipped_ineligible');

  // 2-month future scheduled trip is skipped server-side
  const futureResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'API-FUTURE-2MO' }),
    }),
    serverOpts
  );
  const futureJson = (await futureResp.json()) as Record<string, any>;
  assert.equal(futureJson.dispatched, false);
  assert.equal(futureJson.outcome, 'skipped_ineligible');

  // Ready CONFIRMED ASAP trip is dispatched server-side with ZERO PII leaked in JSON
  const readyResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'API-READY-ASAP' }),
    }),
    serverOpts
  );
  const readyJson = (await readyResp.json()) as Record<string, any>;
  assert.equal(readyResp.status, 200);
  assert.equal(readyJson.dispatched, true);
  assert.equal(readyJson.outcome, 'assigned');
  assert.equal(readyJson.status, 'assigned');
  const rawResponseStr = JSON.stringify(readyJson);
  assert.ok(
    !rawResponseStr.includes('claire.bennett') && !rawResponseStr.includes('555-0192'),
    '/api/auto-dispatch response must never leak passenger PII'
  );

  // Idempotent second call on already-assigned trip skips cleanly
  const repeatResp = await handleAutoDispatchHttpRequest(
    new Request('http://localhost/api/auto-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'API-READY-ASAP' }),
    }),
    serverOpts
  );
  const repeatJson = (await repeatResp.json()) as Record<string, any>;
  assert.equal(repeatJson.dispatched, false);

  // SLA Cron cycle also dispatches eligible in-window rides while skipping 2-month future rides
  const cronReady = await apiBooking.createBooking({
    ...makeTripInput({
      id: 'CRON-WINDOW-30M',
      scheduledPickupTime: new Date(nowMs + 30 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await apiBooking.updateTrip(cronReady.id, { status: 'CONFIRMED' });

  const cronRes = await executeSlaDispatchCronCycle({
    nowMs,
    bookingServiceOverride: apiBooking,
    settingsOverride: {
      dispatchAutomation: normalizeDispatchAutomationConfig({
        dispatchMode: 'sequential_cascade',
        scheduledDispatchLeadMinutes: 45,
      }),
      fleet: fleetCars,
    },
    driversOverride: fourDrivers,
    zonesOverride: [...DEFAULT_ZONES],
  });
  assert.ok(cronRes.autoOfferedTripIds.includes('CRON-WINDOW-30M'));
  assert.ok(!cronRes.autoOfferedTripIds.includes('API-FUTURE-2MO'));

  // File & Security Guardrail Assertions
  const rootDir = process.cwd();
  const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  assert.equal(vercelJson.crons?.[0]?.schedule, '0 10 * * *');

  const lineBudgets: Array<{ rel: string; max: number }> = [
    { rel: 'app/components/domain/admin/AdminRulesTab.tsx', max: 1350 },
    { rel: 'app/core/services/dispatch/auto-dispatch.service.ts', max: 1200 },
    { rel: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', max: 900 },
    { rel: 'app/routes/dispatch.tsx', max: 1600 },
  ];
  for (const b of lineBudgets) {
    const lines = fs.readFileSync(path.join(rootDir, b.rel), 'utf8').split(/\r?\n/).length;
    assert.ok(
      lines < b.max,
      `Line budget exceeded for ${b.rel}: ${lines} lines >= ${b.max} lines`
    );
  }

  const clientAssetsDir = path.join(rootDir, 'build', 'client', 'assets');
  if (fs.existsSync(clientAssetsDir)) {
    const autoDispatchChunks = fs
      .readdirSync(clientAssetsDir)
      .filter((f) => /^api\.auto-dispatch.*\.js$/.test(f));
    if (autoDispatchChunks.length > 0) {
      for (const chunk of autoDispatchChunks) {
        const size = fs.statSync(path.join(clientAssetsDir, chunk)).size;
        assert.ok(
          size < 1024,
          `Client bundle chunk ${chunk} must be 0.00 kB (< 1024 bytes), got ${size} bytes`
        );
      }
    }
  }

  console.log('   ✅ /api/auto-dispatch isolation, cron integration & modular file budgets verified.\n');
  console.log('🎉 ALL PHASE 50 AUTO-DISPATCH & ADMIN CONTROL SUITE TESTS PASSED! ✅');
}

main().catch((err) => {
  console.error('\n💥 Phase 50 verification suite failed:', err);
  process.exit(1);
});
