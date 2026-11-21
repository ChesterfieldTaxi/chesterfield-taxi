/**
 * Phase 35 Verification Suite: Scheduled-Ride SLA Monitor & Auto-Dispatch / Offer Cascade
 *
 * Tests:
 * 1. DispatchAutomationConfig defaults (`autoOfferOnConfirm: false`) & clamping bounds.
 * 2. Defense-in-depth notification URL guard (`public/sw.js` & `app/routes/api.push.ts`).
 * 3. Pure candidate ranking across all 3 strategies (`nearest_in_zone`, `longest_idle_in_zone`,
 *    `highest_driver_score`) and all exclusion filters (off-duty, break, busy, grounded vehicle,
 *    blacklisted, capacity/tier mismatch, `rejectedByIds`, `attemptedDriverIds`).
 * 4. Multi-step sequential offer cascade rollover on driver decline & timeout, clean exhaustion
 *    fallback after `maxCascadeAttempts`, driver atomic acceptance, and dispatcher cancellation.
 * 5. Firestore security rule compatibility (`offerCascade` permitted in offered-driver diff keys).
 * 6. Scheduled-Ride SLA urgency classification (`normal`, `warning`, `critical`, `overdue`)
 *    including STL & SUS airport extra lead buffer + idempotent serverless cron execution.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
  type FleetCarConfig,
} from '../app/core/types/config';
import type { CreateTripInput, Trip } from '../app/core/types/trip';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import { DEFAULT_ZONES } from '../app/core/services/zones/zone.service';
import {
  advanceOrExpireOfferCascade,
  cancelOfferCascade,
  evaluateTripSlaUrgency,
  rankAutoDispatchCandidates,
  scanUpcomingUnassignedSlaTrips,
  startOfferCascade,
  type AutoDispatchDriverInput,
} from '../app/core/services/dispatch';
import { executeSlaDispatchCronCycle } from '../app/core/services/dispatch/sla-cron.server';

let passed = 0;
let total = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${label}`);
  } else {
    console.error(`  ❌ [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

function buildBaseTripInput(overrides: Partial<CreateTripInput> = {}): CreateTripInput {
  return {
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-21T18:00:00.000Z',
    passenger: {
      firstName: 'Evelyn',
      lastName: 'Harper',
      email: 'evelyn.harper@example.com',
      phone: '(314) 555-0142',
      passengerCount: 2,
      luggageCount: 2,
    },
    pickupLocation: {
      address: '17057 N Outer 40 Rd, Chesterfield, MO 63005',
      coordinates: { lat: 38.6631, lng: -90.5771 }, // Inside zone-chesterfield-valley (radius 5.0 mi)
    },
    dropoffLocation: {
      address: '700 Clark Ave, St. Louis, MO 63102',
      coordinates: { lat: 38.6226, lng: -90.1928 },
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5,
      distanceMiles: 22,
      durationMinutes: 26,
      distanceRate: 2.25,
      timeRate: 0.35,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 54.5,
      totalFare: 54.5,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'authorized',
      amount: 54.5,
    },
    ...overrides,
  };
}

async function runTests() {
  console.log('\n=====================================================================');
  console.log('🚦 RUNNING PHASE 35: AUTO-DISPATCH CASCADE & SCHEDULED SLA TEST SUITE');
  console.log('=====================================================================\n');

  const nowMs = Date.parse('2026-11-21T17:00:00.000Z');

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CONFIG DEFAULTS & CLAMPING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- [1. Config Defaults & Clamping] ---');
  assert(
    DEFAULT_DISPATCH_AUTOMATION_CONFIG.autoOfferOnConfirm === false,
    'Locked-in product default sets autoOfferOnConfirm = false (1-tap dispatcher initiated)'
  );
  assert(
    DEFAULT_DISPATCH_AUTOMATION_CONFIG.rankingStrategy === 'nearest_in_zone' &&
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.offerTimeoutSeconds === 45 &&
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.maxCascadeAttempts === 3 &&
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.slaWarningMinutes === 60 &&
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.slaCriticalMinutes === 30 &&
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.airportExtraLeadMinutes === 15,
    'Default DispatchAutomationConfig matches exact specification'
  );

  const clampedLow = normalizeDispatchAutomationConfig({
    offerTimeoutSeconds: 3,
    maxCascadeAttempts: 0,
    slaCriticalMinutes: 40,
    slaWarningMinutes: 20,
  });
  assert(
    clampedLow.offerTimeoutSeconds === 15 &&
      clampedLow.maxCascadeAttempts === 1 &&
      clampedLow.slaWarningMinutes === 40,
    'Clamps offerTimeoutSeconds >= 15s, maxCascadeAttempts >= 1, and slaWarningMinutes >= slaCriticalMinutes'
  );

  const clampedHigh = normalizeDispatchAutomationConfig({
    offerTimeoutSeconds: 999,
    maxCascadeAttempts: 50,
  });
  assert(
    clampedHigh.offerTimeoutSeconds === 180 && clampedHigh.maxCascadeAttempts === 10,
    'Clamps offerTimeoutSeconds <= 180s and maxCascadeAttempts <= 10'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. DEFENSE-IN-DEPTH RELATIVE URL GUARD (SW + API.PUSH)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [2. Defense-in-Depth Notification URL Guard] ---');
  const swSource = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const pushRouteSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/routes/api.push.ts'),
    'utf8'
  );

  assert(
    swSource.includes("rawUrl.startsWith('/') && !rawUrl.startsWith('//')") &&
      pushRouteSource.includes("rawUrl.startsWith('/') && !rawUrl.startsWith('//')"),
    'Both public/sw.js and app/routes/api.push.ts enforce same-origin relative path guard'
  );

  let capturedNotificationData: any = null;
  const swSandbox: Record<string, any> = {
    self: {
      location: { origin: 'https://chesterfieldtaxi.com' },
      skipWaiting: () => {},
      clients: { claim: () => {}, matchAll: async () => [], openWindow: async () => null },
      registration: {
        showNotification: async (_title: string, opts: any) => {
          capturedNotificationData = opts?.data;
        },
      },
      addEventListener: (type: string, handler: Function) => {
        swSandbox.__listeners[type] = handler;
      },
    },
    caches: {
      open: async () => ({ addAll: async () => {}, match: async () => null, put: async () => {} }),
      keys: async () => [],
      delete: async () => false,
    },
    URL,
    Response,
    Promise,
    Set,
    Date,
    Array,
    String,
    Boolean,
    __listeners: {} as Record<string, Function>,
  };
  vm.runInNewContext(swSource, swSandbox);

  await swSandbox.__listeners.push({
    data: { json: () => ({ title: 'Test', body: 'Malicious URL', url: '//evil.example/phish' }) },
    waitUntil: (p: Promise<unknown>) => p,
  });
  assert(
    capturedNotificationData?.url === '/app/driver',
    'Service Worker rejects protocol-relative "//evil.example" URL and falls back to "/app/driver"'
  );

  await swSandbox.__listeners.push({
    data: { json: () => ({ title: 'Test', body: 'External URL', url: 'https://evil.example' }) },
    waitUntil: (p: Promise<unknown>) => p,
  });
  assert(
    capturedNotificationData?.url === '/app/driver',
    'Service Worker rejects cross-origin "https://evil.example" URL and falls back to "/app/driver"'
  );

  await swSandbox.__listeners.push({
    data: { json: () => ({ title: 'Test', body: 'Valid Dispatch URL', url: '/app/dispatch?tripId=T1' }) },
    waitUntil: (p: Promise<unknown>) => p,
  });
  assert(
    capturedNotificationData?.url === '/app/dispatch?tripId=T1',
    'Service Worker preserves valid same-origin relative path "/app/dispatch?tripId=T1"'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. CANDIDATE RANKING & EXCLUSION FILTERS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [3. Candidate Ranking & Exclusion Filters] ---');
  const fleetVehicles: FleetCarConfig[] = [
    {
      id: 'veh-201',
      unitNumber: 'Car #201',
      vehicleTypeId: 'standard',
      make: 'Toyota',
      model: 'Camry',
      year: 2024,
      color: 'Silver',
      licensePlate: 'MO-201',
      vin: 'VIN201',
      mileage: 12000,
      status: 'active',
    },
    {
      id: 'veh-202',
      unitNumber: 'Car #202',
      vehicleTypeId: 'xl',
      make: 'Chevrolet',
      model: 'Suburban',
      year: 2024,
      color: 'Black',
      licensePlate: 'MO-202',
      vin: 'VIN202',
      mileage: 18000,
      status: 'active',
    },
    {
      id: 'veh-203',
      unitNumber: 'Car #203',
      vehicleTypeId: 'xl',
      make: 'Ford',
      model: 'Expedition',
      year: 2023,
      color: 'White',
      licensePlate: 'MO-203',
      vin: 'VIN203',
      mileage: 32000,
      status: 'active',
    },
    {
      id: 'veh-grounded',
      unitNumber: 'Car #299',
      vehicleTypeId: 'standard',
      make: 'Honda',
      model: 'Accord',
      year: 2021,
      color: 'Blue',
      licensePlate: 'MO-299',
      vin: 'VIN299',
      mileage: 85000,
      status: 'maintenance',
      groundedReason: 'Brake service',
    },
  ];

  const driverPool: AutoDispatchDriverInput[] = [
    // Eligible #1: In Chesterfield Valley zone, ~0.4 mi away, idle 15m, score 88, Sedan
    {
      id: 'drv-near-zone',
      name: 'Mike T.',
      cabNumber: '201',
      vehicleId: 'veh-201',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 88,
      idleSince: new Date(nowMs - 15 * 60_000).toISOString(),
      coordinates: { lat: 38.666, lng: -90.58 },
    },
    // Eligible #2: In Chesterfield Valley zone, ~2.1 mi away, idle 95m (longest idle!), score 92, XL SUV
    {
      id: 'drv-idle-zone',
      name: 'Sarah K.',
      cabNumber: '202',
      vehicleId: 'veh-202',
      vehicleTier: 'xl',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 92,
      idleSince: new Date(nowMs - 95 * 60_000).toISOString(),
      coordinates: { lat: 38.645, lng: -90.605 },
    },
    // Eligible #3: Outside Chesterfield Valley zone (Downtown STL ~20 mi away), idle 120m, score 99 (highest score!), XL SUV
    {
      id: 'drv-high-score-out',
      name: 'David R.',
      cabNumber: '203',
      vehicleId: 'veh-203',
      vehicleTier: 'xl',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 99,
      idleSince: new Date(nowMs - 120 * 60_000).toISOString(),
      coordinates: { lat: 38.627, lng: -90.1994 },
    },
    // Excluded: Off duty
    {
      id: 'drv-off-duty',
      name: 'Off Duty Dan',
      cabNumber: '204',
      vehicleTier: 'standard',
      dutyStatus: 'off_duty',
      mapStatus: 'offline',
      driverScore: 100,
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    // Excluded: On break
    {
      id: 'drv-on-break',
      name: 'Break Brian',
      cabNumber: '205',
      vehicleTier: 'standard',
      dutyStatus: 'on_break',
      mapStatus: 'break',
      driverScore: 100,
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    // Excluded: Busy on active trip
    {
      id: 'drv-busy',
      name: 'Busy Bella',
      cabNumber: '206',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'busy',
      currentTripId: 'trip-active-99',
      driverScore: 100,
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    // Excluded: Blacklisted driver
    {
      id: 'drv-blacklisted',
      name: 'Blocked Bob',
      cabNumber: '207',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      isBlacklisted: true,
      driverScore: 100,
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    // Excluded: Grounded fleet vehicle
    {
      id: 'drv-grounded-veh',
      name: 'Grounded Greg',
      cabNumber: '299',
      vehicleId: 'veh-grounded',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 100,
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    // Excluded: Already in rejectedByIds
    {
      id: 'drv-rejected',
      name: 'Rejected Ray',
      cabNumber: '208',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      mapStatus: 'available',
      driverScore: 100,
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
  ];

  const baseTrip: Trip = {
    ...(buildBaseTripInput() as any),
    id: 'CT-RANK-1',
    status: 'CONFIRMED',
    offeredToIds: [],
    rejectedByIds: ['drv-rejected'],
    assignedDriverId: null,
    statusHistory: [],
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const nearestRanked = rankAutoDispatchCandidates(
    baseTrip,
    driverPool,
    DEFAULT_ZONES,
    { rankingStrategy: 'nearest_in_zone' },
    { fleetVehicles, nowMs }
  );
  assert(
    nearestRanked.length === 3,
    `Exclusion filters strip off-duty, break, busy, blacklisted, grounded-vehicle & rejected drivers (got ${nearestRanked.length} eligible)`
  );
  assert(
    nearestRanked[0].driverId === 'drv-near-zone' &&
      nearestRanked[1].driverId === 'drv-idle-zone' &&
      nearestRanked[2].driverId === 'drv-high-score-out',
    `Strategy "nearest_in_zone" orders [${nearestRanked.map((c) => c.driverId).join(', ')}]`
  );

  const longestIdleRanked = rankAutoDispatchCandidates(
    baseTrip,
    driverPool,
    DEFAULT_ZONES,
    { rankingStrategy: 'longest_idle_in_zone' },
    { fleetVehicles, nowMs }
  );
  assert(
    longestIdleRanked[0].driverId === 'drv-idle-zone' &&
      longestIdleRanked[1].driverId === 'drv-near-zone' &&
      longestIdleRanked[2].driverId === 'drv-high-score-out',
    `Strategy "longest_idle_in_zone" prioritizes longest-waiting in-zone driver first [${longestIdleRanked.map((c) => c.driverId).join(', ')}]`
  );

  const highestScoreRanked = rankAutoDispatchCandidates(
    baseTrip,
    driverPool,
    DEFAULT_ZONES,
    { rankingStrategy: 'highest_driver_score' },
    { fleetVehicles, nowMs }
  );
  assert(
    highestScoreRanked[0].driverId === 'drv-high-score-out' &&
      highestScoreRanked[1].driverId === 'drv-idle-zone' &&
      highestScoreRanked[2].driverId === 'drv-near-zone',
    `Strategy "highest_driver_score" orders by score descending [${highestScoreRanked.map((c) => c.driverId).join(', ')}]`
  );

  // Capacity & SUV Upgrade Filter Check (5 passengers + 4 bags -> excludes standard sedan drv-near-zone)
  const largePartyTrip: Trip = {
    ...baseTrip,
    passenger: {
      ...baseTrip.passenger,
      passengerCount: 5,
      luggageCount: 4,
    },
  };
  const largePartyRanked = rankAutoDispatchCandidates(
    largePartyTrip,
    driverPool,
    DEFAULT_ZONES,
    { rankingStrategy: 'nearest_in_zone' },
    { fleetVehicles, nowMs }
  );
  assert(
    largePartyRanked.length === 2 &&
      largePartyRanked.every((c) => c.driverId !== 'drv-near-zone'),
    'Capacity & SUV upgrade filter excludes standard 4-pax sedan for 5-passenger / 4-bag trip'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. MULTI-STEP CASCADE LIFECYCLE (DECLINE -> TIMEOUT -> EXHAUSTION & ACCEPT)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [4. Sequential Offer Cascade Lifecycle] ---');
  const mockBooking = new MockBookingService();
  const createdCascadeTrip = await mockBooking.createBooking({
    ...buildBaseTripInput({ id: 'CT-CASCADE-1' }),
    status: 'CONFIRMED',
  });
  // Ensure clean CONFIRMED starting state
  await mockBooking.updateTrip(createdCascadeTrip.id, { status: 'CONFIRMED' });
  const freshTrip = (await mockBooking.getBookingStatus(createdCascadeTrip.id))!.trip!;

  const cascadeConfig = {
    autoOfferOnConfirm: false,
    rankingStrategy: 'nearest_in_zone' as const,
    offerTimeoutSeconds: 45,
    maxCascadeAttempts: 2,
    slaWarningMinutes: 60,
    slaCriticalMinutes: 30,
    airportExtraLeadMinutes: 15,
  };

  const cascadeDrivers = driverPool.filter((d) => d.id !== 'drv-rejected');

  // Step 1: Start Offer Cascade -> offers to drv-near-zone (Attempt 1/2)
  const step1 = await startOfferCascade({
    trip: freshTrip,
    drivers: cascadeDrivers,
    zones: DEFAULT_ZONES,
    config: cascadeConfig,
    fleetVehicles,
    bookingService: mockBooking,
    sendPush: false,
    nowMs,
  });

  assert(
    step1.outcome === 'offered' &&
      step1.trip.status === 'offered' &&
      step1.trip.offeredToIds.length === 1 &&
      step1.trip.offeredToIds[0] === 'drv-near-zone' &&
      step1.trip.offerCascade?.state === 'active' &&
      step1.trip.offerCascade?.cascadeAttempt === 1 &&
      step1.trip.offerCascade?.maxAttempts === 2,
    'Cascade Step 1 offers exclusively to top candidate (drv-near-zone, attempt 1/2)'
  );

  // While within timeout and not declined, coordinator waits
  const waitingCheck = await advanceOrExpireOfferCascade({
    trip: step1.trip,
    drivers: cascadeDrivers,
    zones: DEFAULT_ZONES,
    config: cascadeConfig,
    fleetVehicles,
    bookingService: mockBooking,
    sendPush: false,
    nowMs: nowMs + 15_000,
  });
  assert(waitingCheck.outcome === 'waiting', 'Coordinator waits while offer is still active before timeout');

  // Driver #1 declines offer -> clears activeOfferedDriverId & adds to rejectedByIds
  const afterDecline = await mockBooking.declineDriverOffer(step1.trip.id, 'drv-near-zone', 'Too far');
  assert(
    afterDecline.offerCascade?.activeOfferedDriverId === null &&
      afterDecline.rejectedByIds.includes('drv-near-zone'),
    'declineDriverOffer clears offerCascade.activeOfferedDriverId and records drv-near-zone in rejectedByIds'
  );

  // Coordinator immediately rolls over to Step 2 (drv-idle-zone, Attempt 2/2)
  const tStep2Ms = nowMs + 16_000;
  const step2 = await advanceOrExpireOfferCascade({
    trip: afterDecline,
    drivers: cascadeDrivers,
    zones: DEFAULT_ZONES,
    config: cascadeConfig,
    fleetVehicles,
    bookingService: mockBooking,
    sendPush: false,
    nowMs: tStep2Ms,
  });
  assert(
    step2.outcome === 'advanced' &&
      step2.trip.status === 'offered' &&
      step2.trip.offeredToIds.length === 1 &&
      step2.trip.offeredToIds[0] === 'drv-idle-zone' &&
      step2.trip.offerCascade?.cascadeAttempt === 2 &&
      step2.trip.offerCascade?.attemptedDriverIds.length === 2,
    'Cascade Step 2 rolls over cleanly to next candidate (drv-idle-zone, attempt 2/2) on decline'
  );

  // Step 2 times out after 45s -> hits maxCascadeAttempts (2) -> Exhausted!
  const stepExhausted = await advanceOrExpireOfferCascade({
    trip: step2.trip,
    drivers: cascadeDrivers,
    zones: DEFAULT_ZONES,
    config: cascadeConfig,
    fleetVehicles,
    bookingService: mockBooking,
    sendPush: false,
    nowMs: tStep2Ms + 46_000,
  });
  assert(
    stepExhausted.outcome === 'exhausted' &&
      stepExhausted.trip.offerCascade?.state === 'exhausted' &&
      stepExhausted.trip.status === 'CONFIRMED' &&
      stepExhausted.trip.offeredToIds.length === 0 &&
      stepExhausted.trip.rejectedByIds.includes('drv-idle-zone'),
    'Cascade transitions to "exhausted", reverts status to "CONFIRMED", and clears offeredToIds after maxCascadeAttempts'
  );

  // Test Accept & Cancel flows on a second trip
  const acceptTripSeed = await mockBooking.createBooking({
    ...buildBaseTripInput({ id: 'CT-CASCADE-ACCEPT' }),
    status: 'CONFIRMED',
  });
  await mockBooking.updateTrip(acceptTripSeed.id, { status: 'CONFIRMED' });
  const acceptStart = await startOfferCascade({
    trip: (await mockBooking.getBookingStatus(acceptTripSeed.id))!.trip!,
    drivers: cascadeDrivers,
    zones: DEFAULT_ZONES,
    config: { ...cascadeConfig, maxCascadeAttempts: 3 },
    fleetVehicles,
    bookingService: mockBooking,
    sendPush: false,
    nowMs,
  });

  const cancelledRes = await cancelOfferCascade({
    trip: acceptStart.trip,
    bookingService: mockBooking,
    nowMs: nowMs + 5_000,
  });
  assert(
    cancelledRes.outcome === 'cancelled' &&
      cancelledRes.trip.offerCascade?.state === 'cancelled' &&
      cancelledRes.trip.offeredToIds.length === 0 &&
      cancelledRes.trip.status === 'CONFIRMED',
    'cancelOfferCascade cancels active cascade and restores CONFIRMED unassigned state'
  );

  const restartForAccept = await startOfferCascade({
    trip: cancelledRes.trip,
    drivers: cascadeDrivers,
    zones: DEFAULT_ZONES,
    config: { ...cascadeConfig, maxCascadeAttempts: 3 },
    fleetVehicles,
    bookingService: mockBooking,
    sendPush: false,
    nowMs: nowMs + 10_000,
  });
  const acceptedTrip = await mockBooking.acceptDriverOffer(
    restartForAccept.trip.id,
    restartForAccept.candidate!.driverId
  );
  assert(
    acceptedTrip.status === 'assigned' &&
      acceptedTrip.assignedDriverId === 'drv-near-zone' &&
      acceptedTrip.offeredToIds.length === 0 &&
      acceptedTrip.offerCascade?.state === 'accepted',
    'acceptDriverOffer atomically assigns claiming driver and marks offerCascade.state = "accepted"'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5. FIRESTORE SECURITY RULES COMPATIBILITY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [5. Firestore Security Rules Compatibility] ---');
  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert(
    firestoreRules.includes("'offerCascade'") && firestoreRules.includes("'slaStatus'"),
    'firestore.rules offered-driver affectedKeys().hasOnly(...) includes offerCascade and slaStatus'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 6. SCHEDULED-RIDE SLA MONITOR & SERVERLESS CRON IDEMPOTENCY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [6. Scheduled-Ride SLA Monitor & Airport Lead Buffer] ---');
  const slaCfg = DEFAULT_DISPATCH_AUTOMATION_CONFIG; // warn: 60m, crit: 30m, airport: +15m

  const makeTimedTrip = (
    id: string,
    offsetMinutes: number,
    pickupAddress = '16000 Swingley Ridge Rd, Chesterfield, MO 63017',
    dropoffAddress = '100 N Broadway, St. Louis, MO 63102',
    extra: Partial<Trip> = {}
  ): Trip => ({
    ...baseTrip,
    id,
    pickupLocation: { address: pickupAddress },
    dropoffLocation: { address: dropoffAddress },
    scheduledPickupTime: new Date(nowMs + offsetMinutes * 60_000).toISOString(),
    ...extra,
  });

  const evalNormal = evaluateTripSlaUrgency(makeTimedTrip('SLA-NORM', 90), slaCfg, nowMs);
  const evalWarn = evaluateTripSlaUrgency(makeTimedTrip('SLA-WARN', 42), slaCfg, nowMs);
  const evalCrit = evaluateTripSlaUrgency(makeTimedTrip('SLA-CRIT', 18), slaCfg, nowMs);
  const evalOverdue = evaluateTripSlaUrgency(makeTimedTrip('SLA-OVER', -8), slaCfg, nowMs);

  assert(evalNormal.level === 'normal', 'Local scheduled ride 90m away classifies as "normal"');
  assert(
    evalWarn.level === 'warning' && evalWarn.badgeLabel === 'Due in 42m',
    `Local scheduled ride 42m away classifies as "warning" (${evalWarn.badgeLabel})`
  );
  assert(
    evalCrit.level === 'critical' && evalCrit.badgeLabel === 'CRITICAL • 18m',
    `Local scheduled ride 18m away classifies as "critical" (${evalCrit.badgeLabel})`
  );
  assert(
    evalOverdue.level === 'overdue' && evalOverdue.badgeLabel === 'OVERDUE • 8m',
    `Local scheduled ride 8m past pickup classifies as "overdue" (${evalOverdue.badgeLabel})`
  );

  // Airport Extra Lead Buffer (+15m -> Warning <= 75m, Critical <= 45m)
  const stl40m = evaluateTripSlaUrgency(
    makeTimedTrip(
      'SLA-STL-40',
      40,
      '10701 Lambert International Blvd, St. Louis, MO 63145',
      'Chesterfield, MO'
    ),
    slaCfg,
    nowMs
  );
  const sus70m = evaluateTripSlaUrgency(
    makeTimedTrip(
      'SLA-SUS-70',
      70,
      'Chesterfield, MO',
      'Spirit of St. Louis Airport (SUS), 18260 Edison Ave'
    ),
    slaCfg,
    nowMs
  );
  assert(
    stl40m.isAirportTrip &&
      stl40m.airportCode === 'STL' &&
      stl40m.effectiveCriticalMinutes === 45 &&
      stl40m.level === 'critical',
    'STL Lambert Airport trip 40m away applies +15m buffer (45m threshold) and classifies as "critical"'
  );
  assert(
    sus70m.isAirportTrip &&
      sus70m.airportCode === 'SUS' &&
      sus70m.effectiveWarningMinutes === 75 &&
      sus70m.level === 'warning',
    'SUS Spirit Airport trip 70m away applies +15m buffer (75m threshold) and classifies as "warning"'
  );

  // Assigned trips are not flagged as unassigned SLA risks
  const assignedCheck = evaluateTripSlaUrgency(
    makeTimedTrip('SLA-ASSIGNED', 15, undefined, undefined, {
      status: 'assigned',
      assignedDriverId: 'drv-near-zone',
    }),
    slaCfg,
    nowMs
  );
  assert(!assignedCheck.isEligible, 'Assigned scheduled ride is excluded from unassigned SLA alerts');

  const batchScan = scanUpcomingUnassignedSlaTrips(
    [
      makeTimedTrip('T-NORM', 120),
      makeTimedTrip('T-WARN', 50),
      makeTimedTrip('T-CRIT', 20),
      makeTimedTrip('T-OVER', -5),
    ],
    slaCfg,
    { nowMs }
  );
  assert(
    batchScan.overdueCount === 1 &&
      batchScan.criticalCount === 1 &&
      batchScan.warningCount === 1 &&
      batchScan.normalCount === 1 &&
      batchScan.atRiskTrips[0].trip.id === 'T-OVER',
    'scanUpcomingUnassignedSlaTrips aggregates counts and sorts overdue -> critical -> warning'
  );

  // Serverless Cron Idempotency & Vercel Cron Configuration Check
  const cronMockBooking = new MockBookingService();
  const critCronTrip = await cronMockBooking.createBooking({
    ...buildBaseTripInput({
      id: 'CT-CRON-CRIT-1',
      scheduledPickupTime: new Date(nowMs + 20 * 60_000).toISOString(),
    }),
    status: 'CONFIRMED',
  });
  await cronMockBooking.updateTrip(critCronTrip.id, { status: 'CONFIRMED' });

  const cronRun1 = await executeSlaDispatchCronCycle({
    nowMs,
    bookingServiceOverride: cronMockBooking,
    settingsOverride: { dispatchAutomation: slaCfg },
    driversOverride: driverPool,
    zonesOverride: [...DEFAULT_ZONES],
  });
  assert(
    cronRun1.newlyAlertedTripIds.includes('CT-CRON-CRIT-1') &&
      cronRun1.skippedAlreadyNotifiedCount === 0,
    'First SLA cron cycle alerts unattended critical trip and stamps slaStatus.criticalNotifiedAt'
  );

  const stampedTrip = (await cronMockBooking.getBookingStatus('CT-CRON-CRIT-1'))!.trip!;
  assert(
    Boolean(stampedTrip.slaStatus?.criticalNotifiedAt),
    'Trip document persists slaStatus.criticalNotifiedAt timestamp'
  );

  const cronRun2 = await executeSlaDispatchCronCycle({
    nowMs: nowMs + 60_000,
    bookingServiceOverride: cronMockBooking,
    settingsOverride: { dispatchAutomation: slaCfg },
    driversOverride: driverPool,
    zonesOverride: [...DEFAULT_ZONES],
  });
  assert(
    cronRun2.newlyAlertedTripIds.length === 0 && cronRun2.skippedAlreadyNotifiedCount >= 1,
    'Second SLA cron cycle is strictly idempotent and never double-alerts the same critical trip'
  );

  const vercelConfig = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  );
  assert(
    Array.isArray(vercelConfig.crons) &&
      vercelConfig.crons.some(
        (c: any) => c.path === '/api/cron/sla-dispatch' && c.schedule === '*/5 * * * *'
      ),
    'vercel.json registers /api/cron/sla-dispatch on a 5-minute cron schedule'
  );

  console.log(`\n🎉 ALL ${passed}/${total} PHASE 35 ASSERTIONS PASSED!\n`);
}

runTests().catch((err) => {
  console.error('\n💥 Phase 35 verification failed:', err);
  process.exit(1);
});
