/**
 * Phase 38 Verification Suite: Live Flight Status Tracking for STL & SUS Airport Pickups
 *
 * Tests:
 * 1. `parseFlightIdent` & `resolveStlTerminalInfo` (Southwest/Lufthansa -> Terminal 2,
 *    AA/DL/UA/AC -> Terminal 1, Spirit of St. Louis SUS & Downtown CPS -> Private FBO).
 * 2. Provider-agnostic normalization for `AeroDataBoxProvider`, `FlightAwareProvider`,
 *    and `FallbackScheduleProvider` (including upstream failure resilience).
 * 3. 15-minute cache deduplication (`airlineCode_flightNumber_serviceDate`), unauthenticated
 *    `forceRefresh` protection, authenticated staff `forceRefresh` bypass, TTL rollover,
 *    and strict IATA / YYYY-MM-DD validation.
 * 4. `evaluateFlightPickupAlignment` conflict detection (`pickup_before_arrival`,
 *    `significant_delay`, `flight_cancelled`, idempotent post-sync alignment) and
 *    1-tap pickup ETA adjustment (`syncTripPickupToFlightEta`) + `TripAuditEvent` recording
 *    + assigned driver push notification.
 * 5. `firestore.rules` invariants for `/flightStatusCache/{cacheKey}`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateFlightCheckEligibility,
  evaluateFlightPickupAlignment,
  parseFlightIdent,
  resolveStlTerminalInfo,
} from '../app/core/config/airports';
import {
  AeroDataBoxProvider,
  FLIGHT_CACHE_TTL_MS,
  FallbackScheduleProvider,
  FlightAwareProvider,
  getFlightIntegrationDiagnostics,
  handleFlightStatusGet,
  handleFlightStatusPost,
  isValidServiceDate,
  lookupFlightTelemetryServer,
  resetFlightTelemetryCacheForTests,
} from '../app/core/services/flight/flight-status.server';
import {
  FlightStatusService,
  evaluateFlightCheckEligibility as reExportedEligibility,
  resolveTripFlightBadge,
} from '../app/core/services/flight/flight-status.service';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';

async function runTests() {
  console.log('✈️  Running Phase 38 Flight Status Tracking Verification Suite...\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Flight Ident Normalization & Regional STL/SUS Terminal Intelligence
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing parseFlightIdent & resolveStlTerminalInfo...');

  const p1 = parseFlightIdent('WN', '1425');
  assert.equal(p1.isValid, true);
  assert.equal(p1.airlineCode, 'WN');
  assert.equal(p1.flightNumber, '1425');
  assert.equal(p1.flightIdent, 'WN1425');
  assert.equal(p1.airlineName, 'Southwest Airlines');

  const p2 = parseFlightIdent('Southwest Airlines (WN)', '#0425');
  assert.equal(p2.isValid, true);
  assert.equal(p2.airlineCode, 'WN');
  assert.equal(p2.flightNumber, '425');
  assert.equal(p2.flightIdent, 'WN425');

  const p3 = parseFlightIdent('', 'AA 2049');
  assert.equal(p3.isValid, true);
  assert.equal(p3.airlineCode, 'AA');
  assert.equal(p3.flightNumber, '2049');
  assert.equal(p3.flightIdent, 'AA2049');

  const p4 = parseFlightIdent('SWA1810', '');
  assert.equal(p4.isValid, true);
  assert.equal(p4.airlineCode, 'WN');
  assert.equal(p4.flightIdent, 'WN1810');

  const invalidIdent = parseFlightIdent('INVALID_CARRIER', '999999');
  assert.equal(invalidIdent.isValid, false);

  // STL Terminal 2: Southwest & Lufthansa
  const stlWn = resolveStlTerminalInfo('WN');
  assert.equal(stlWn.terminal, 'Terminal 2');
  assert.equal(stlWn.shortTerminal, 'STL T2');
  assert.equal(stlWn.pickupDoorGuidance, 'Terminal 2 · Baggage Claim Exit Door 12');

  const stlLh = resolveStlTerminalInfo('Lufthansa');
  assert.equal(stlLh.terminal, 'Terminal 2');
  assert.equal(stlLh.pickupDoorGuidance, 'Terminal 2 · Baggage Claim Exit Door 12');

  // STL Terminal 1: AA, DL, UA, AC, OO, YX
  for (const t1Code of ['AA', 'DL', 'UA', 'AS', 'NK', 'F9', 'AC', 'OO', 'YX']) {
    const info = resolveStlTerminalInfo(t1Code);
    assert.equal(info.terminal, 'Terminal 1', `Expected ${t1Code} -> Terminal 1`);
    assert.equal(
      info.pickupDoorGuidance,
      'Terminal 1 · Lower Level Exit Door 6 / Door 12',
      `Expected T1 curbside door guidance for ${t1Code}`
    );
  }

  // Spirit of St. Louis (SUS) & Downtown (CPS) Private FBO
  const susInfo = resolveStlTerminalInfo('Signature Aviation', 'SUS');
  assert.equal(susInfo.airportCode, 'SUS');
  assert.equal(susInfo.isPrivateFbo, true);
  assert.match(susInfo.pickupDoorGuidance, /Spirit of St\. Louis \(SUS\).*Private FBO/);

  const cpsInfo = resolveStlTerminalInfo('CPS');
  assert.equal(cpsInfo.airportCode, 'CPS');
  assert.equal(cpsInfo.isPrivateFbo, true);
  assert.match(cpsInfo.pickupDoorGuidance, /St\. Louis Downtown \(CPS\).*Private FBO/);

  console.log('   ✅ Passed ident parsing & STL/SUS/CPS terminal resolution.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Provider-Agnostic Adapters (AeroDataBox, FlightAware, Fallback)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing AeroDataBoxProvider, FlightAwareProvider & FallbackScheduleProvider...');

  let aeroRequestedUrl = '';
  let aeroHeaders: Record<string, string> = {};
  const mockAeroFetch: typeof fetch = async (input, init) => {
    aeroRequestedUrl = String(input);
    aeroHeaders = (init?.headers as Record<string, string>) || {};
    return new Response(
      JSON.stringify([
        {
          number: 'WN 1425',
          status: 'Delayed',
          airline: { name: 'Southwest Airlines', iata: 'WN' },
          departure: {
            airport: { iata: 'DEN', municipalityName: 'Denver' },
            scheduledTime: { utc: '2026-11-22T18:00:00Z' },
            revisedTime: { utc: '2026-11-22T18:38:00Z' },
          },
          arrival: {
            airport: { iata: 'STL', municipalityName: 'St. Louis' },
            scheduledTime: { utc: '2026-11-22T20:05:00Z' },
            revisedTime: { utc: '2026-11-22T20:47:00Z' },
            terminal: '2',
            gate: 'E18',
            baggageBelt: '3',
          },
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const aeroProvider = new AeroDataBoxProvider({
    apiKey: 'test_aerodatabox_key_12345',
    rapidApiHost: 'aerodatabox.p.rapidapi.com',
    fetchImpl: mockAeroFetch,
    nowFn: () => Date.parse('2026-11-22T17:00:00Z'),
  });
  assert.equal(aeroProvider.isConfigured(), true);

  const aeroSnap = await aeroProvider.lookupFlight({
    flightIdent: 'WN1425',
    airlineCode: 'WN',
    flightNumber: '1425',
    serviceDate: '2026-11-22',
    destinationIata: 'STL',
  });
  assert.ok(aeroSnap);
  assert.match(aeroRequestedUrl, /\/flights\/number\/WN1425\/2026-11-22/);
  assert.equal(aeroHeaders['x-rapidapi-key'], 'test_aerodatabox_key_12345');
  assert.equal(aeroSnap.provider, 'aerodatabox');
  assert.equal(aeroSnap.isSimulatedFallback, false);
  assert.equal(aeroSnap.status, 'delayed');
  assert.equal(aeroSnap.delayMinutes, 42);
  assert.equal(aeroSnap.originIata, 'DEN');
  assert.equal(aeroSnap.originCity, 'Denver');
  assert.equal(aeroSnap.destinationIata, 'STL');
  assert.equal(aeroSnap.terminal, 'Terminal 2');
  assert.equal(aeroSnap.gate, 'E18');
  assert.equal(aeroSnap.baggageClaim, '3');
  assert.equal(aeroSnap.pickupDoorGuidance, 'Terminal 2 · Baggage Claim Exit Door 12');

  let faRequestedUrl = '';
  let faHeaders: Record<string, string> = {};
  const mockFaFetch: typeof fetch = async (input, init) => {
    faRequestedUrl = String(input);
    faHeaders = (init?.headers as Record<string, string>) || {};
    return new Response(
      JSON.stringify({
        flights: [
          {
            ident: 'AAL2049',
            ident_iata: 'AA2049',
            status: 'Arrived / Gate Arrival',
            cancelled: false,
            diverted: false,
            arrival_delay: 0,
            scheduled_out: '2026-11-22T14:00:00Z',
            actual_out: '2026-11-22T13:58:00Z',
            scheduled_in: '2026-11-22T16:10:00Z',
            actual_in: '2026-11-22T16:05:00Z',
            origin: { code: 'KORD', code_iata: 'ORD', city: 'Chicago' },
            destination: { code: 'KSTL', code_iata: 'STL', city: 'St. Louis' },
            terminal_destination: '1',
            gate_destination: 'C9',
            baggage_claim: 'Carousel 4',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const faProvider = new FlightAwareProvider({
    apiKey: 'test_flightaware_key_67890',
    fetchImpl: mockFaFetch,
    nowFn: () => Date.parse('2026-11-22T16:12:00Z'),
  });
  assert.equal(faProvider.isConfigured(), true);

  const faSnap = await faProvider.lookupFlight({
    flightIdent: 'AA2049',
    airlineCode: 'AA',
    airlineName: 'American Airlines',
    flightNumber: '2049',
    serviceDate: '2026-11-22',
    destinationIata: 'STL',
  });
  assert.ok(faSnap);
  assert.match(faRequestedUrl, /\/flights\/AA2049$/);
  assert.equal(faHeaders['x-apikey'], 'test_flightaware_key_67890');
  assert.equal(faSnap.provider, 'flightaware');
  assert.equal(faSnap.isSimulatedFallback, false);
  assert.equal(faSnap.status, 'landed');
  assert.equal(faSnap.originIata, 'ORD');
  assert.equal(faSnap.terminal, 'Terminal 1');
  assert.equal(faSnap.gate, 'C9');
  assert.equal(faSnap.baggageClaim, 'Carousel 4');
  assert.equal(faSnap.pickupDoorGuidance, 'Terminal 1 · Lower Level Exit Door 6 / Door 12');

  const fallbackProvider = new FallbackScheduleProvider({
    nowFn: () => Date.parse('2026-11-22T12:00:00Z'),
  });
  const fbSnap = await fallbackProvider.lookupFlight({
    flightIdent: 'DL1192',
    airlineCode: 'DL',
    flightNumber: '1192',
    serviceDate: '2026-11-22',
    destinationIata: 'STL',
    originIata: 'ATL',
  });
  assert.equal(fbSnap.provider, 'fallback');
  assert.equal(fbSnap.isSimulatedFallback, true);
  assert.equal(fbSnap.terminal, 'Terminal 1');
  assert.equal(fbSnap.originIata, 'ATL');
  assert.equal(fbSnap.pickupDoorGuidance, 'Terminal 1 · Lower Level Exit Door 6 / Door 12');

  console.log('   ✅ Passed AeroDataBox, FlightAware & Fallback normalization.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. 15-Minute Cache Deduplication, Staff Force-Refresh & Input Validation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Testing 15-minute cache deduplication & staff-only forceRefresh...');

  resetFlightTelemetryCacheForTests();
  assert.equal(FLIGHT_CACHE_TTL_MS, 900_000);
  assert.equal(isValidServiceDate('2026-11-22'), true);
  assert.equal(isValidServiceDate('2026-02-31'), false);
  assert.equal(isValidServiceDate('11/22/2026'), false);

  const badDateLookup = await lookupFlightTelemetryServer(
    { airline: 'WN', flightNumber: '1425', serviceDate: '2026-02-31' },
    { skipFirestoreCache: true }
  );
  assert.equal(badDateLookup.success, false);
  assert.equal(badDateLookup.status, 400);

  let upstreamCallCount = 0;
  const countedFetch: typeof fetch = async (input, init) => {
    upstreamCallCount += 1;
    return mockAeroFetch(input, init);
  };

  const baseNow = Date.parse('2026-11-22T17:00:00Z');
  const testEnv = {
    AERODATABOX_API_KEY: 'live_key_for_cache_test',
    FLIGHTAWARE_API_KEY: '',
    FLIGHT_API_KEY: '',
  };

  // Call #1: Cold lookup -> hits upstream fetchImpl (count = 1)
  const firstLookup = await lookupFlightTelemetryServer(
    { airline: 'Southwest Airlines', flightNumber: '1425', serviceDate: '2026-11-22' },
    { env: testEnv, fetchImpl: countedFetch, nowMs: baseNow, skipFirestoreCache: true }
  );
  assert.equal(firstLookup.success, true);
  assert.equal(firstLookup.fromCache, false);
  assert.equal(firstLookup.cacheKey, 'WN_1425_2026-11-22');
  assert.equal(upstreamCallCount, 1);

  // Call #2 (5 mins later, different airline formatting "WN" + "1425"): served from 15-min cache (count still = 1)
  const secondLookup = await lookupFlightTelemetryServer(
    { airline: 'WN', flightNumber: '1425', serviceDate: '2026-11-22' },
    {
      env: testEnv,
      fetchImpl: countedFetch,
      nowMs: baseNow + 5 * 60_000,
      skipFirestoreCache: true,
    }
  );
  assert.equal(secondLookup.success, true);
  assert.equal(secondLookup.fromCache, true);
  assert.equal(upstreamCallCount, 1);

  // Call #3: Unauthenticated guest attempts forceRefresh: true -> ignored, served from cache (count still = 1)
  const unauthForceLookup = await lookupFlightTelemetryServer(
    { airline: 'WN', flightNumber: '1425', serviceDate: '2026-11-22' },
    {
      env: testEnv,
      fetchImpl: countedFetch,
      nowMs: baseNow + 6 * 60_000,
      forceRefresh: true,
      isStaffAuthorized: false,
      skipFirestoreCache: true,
    }
  );
  assert.equal(unauthForceLookup.success, true);
  assert.equal(unauthForceLookup.fromCache, true);
  assert.equal(upstreamCallCount, 1);

  // Call #4: Authenticated Dispatcher/Admin passes forceRefresh: true -> bypasses cache (count = 2)
  const staffForceLookup = await lookupFlightTelemetryServer(
    { airline: 'WN', flightNumber: '1425', serviceDate: '2026-11-22' },
    {
      env: testEnv,
      fetchImpl: countedFetch,
      nowMs: baseNow + 7 * 60_000,
      forceRefresh: true,
      isStaffAuthorized: true,
      skipFirestoreCache: true,
    }
  );
  assert.equal(staffForceLookup.success, true);
  assert.equal(staffForceLookup.fromCache, false);
  assert.equal(upstreamCallCount, 2);

  // Call #5: After 15m TTL expiration -> refreshes from upstream (count = 3)
  const expiredCacheLookup = await lookupFlightTelemetryServer(
    { airline: 'WN', flightNumber: '1425', serviceDate: '2026-11-22' },
    {
      env: testEnv,
      fetchImpl: countedFetch,
      nowMs: baseNow + 7 * 60_000 + FLIGHT_CACHE_TTL_MS + 1000,
      skipFirestoreCache: true,
    }
  );
  assert.equal(expiredCacheLookup.success, true);
  assert.equal(expiredCacheLookup.fromCache, false);
  assert.equal(upstreamCallCount, 3);

  // Upstream 503 resilience -> falls back cleanly to FallbackScheduleProvider
  const failingLookup = await lookupFlightTelemetryServer(
    { airline: 'UA', flightNumber: '812', serviceDate: '2026-11-22' },
    {
      env: testEnv,
      fetchImpl: async () => new Response('Service Unavailable', { status: 503 }),
      nowMs: baseNow,
      skipFirestoreCache: true,
    }
  );
  assert.equal(failingLookup.success, true);
  assert.equal(failingLookup.snapshot?.isSimulatedFallback, true);
  assert.equal(failingLookup.snapshot?.terminal, 'Terminal 1');

  const diag = getFlightIntegrationDiagnostics(testEnv);
  assert.equal(diag.activeProvider, 'aerodatabox');
  assert.equal(diag.liveApiConfigured, true);
  assert.equal(diag.cacheTtlMinutes, 15);

  console.log('   ✅ Passed 15-minute cache deduplication, staff forceRefresh & fallback resilience.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Pickup Alignment Conflict Detection & 1-Tap ETA Sync + TripAuditEvent
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing evaluateFlightPickupAlignment & 1-tap ETA adjustment + TripAuditEvent...');

  // Flight scheduled 20:05Z, delayed +42m to 20:47Z
  assert.ok(aeroSnap);

  // Scenario A: Passenger requested pickup at 20:25Z (20m after original 20:05Z landing, now BEFORE 20:47Z landing!)
  const conflictBefore = evaluateFlightPickupAlignment(
    aeroSnap,
    '2026-11-22T20:25:00.000Z',
    { hasCheckedLuggage: true } // 25m buffer -> recommended 21:12Z
  );
  assert.equal(conflictBefore.aligned, false);
  assert.equal(conflictBefore.conflict, 'pickup_before_arrival');
  assert.equal(conflictBefore.recommendedPickupIso, '2026-11-22T21:12:00.000Z');
  assert.equal(conflictBefore.driftMinutes, 47);

  // Scenario B: Cancelled flight
  const cancelledCheck = evaluateFlightPickupAlignment(
    { ...aeroSnap, status: 'cancelled' },
    '2026-11-22T20:25:00.000Z'
  );
  assert.equal(cancelledCheck.aligned, false);
  assert.equal(cancelledCheck.conflict, 'flight_cancelled');

  // Scenario C: Create mock airport pickup trip, assign driver, and run 1-tap `syncTripPickupToFlightEta`
  const mockBooking = new MockBookingService();
  const createdTrip = await mockBooking.createBooking({
    pickupLocation: {
      address: 'Lambert-St. Louis International Airport (STL), Terminal 2',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    dropoffLocation: {
      address: '16640 Chesterfield Grove Rd, Chesterfield, MO 63005',
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-22T20:30:00.000Z', // 25m buffer after original 20:05Z landing
    vehicleTier: 'standard',
    passenger: {
      firstName: 'Elena',
      lastName: 'Vance',
      email: 'elena@example.com',
      phone: '+13145550192',
      passengerCount: 2,
      luggageCount: 2,
    },
    pricing: {
      baseFare: 45,
      distanceMiles: 19.4,
      durationMinutes: 24,
      distanceRate: 2.25,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 45,
      totalFare: 45,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 45,
    },
    flightTelemetry: aeroSnap,
    metadata: {
      provideFlightInfo: true,
      airline: 'Southwest Airlines',
      flightNumber: '1425',
      hasCheckedLuggage: true,
      isAirportTrip: true,
      airportIataCode: 'STL',
    },
  });

  // Assign a driver so we verify driver push notification hook triggers
  const assignedTrip = await mockBooking.updateTripStatus!(createdTrip.id, 'assigned', {
    assignedDriverId: 'drv-flight-204',
    actorRole: 'admin',
    reason: 'Assigned to Cab #204',
  });

  const badgeBefore = resolveTripFlightBadge(assignedTrip);
  assert.equal(badgeBefore.hasFlight, true);
  assert.equal(badgeBefore.shortLabel, 'Delayed +42m');
  assert.equal(badgeBefore.tone, 'amber');

  let notifiedDriverId = '';
  let notifiedTitle = '';
  const flightSvc = new FlightStatusService();
  const syncResult = await flightSvc.syncTripPickupToFlightEta(assignedTrip, {
    actorId: 'disp-01',
    actorRole: 'dispatcher',
    bookingService: mockBooking,
    nowMs: Date.parse('2026-11-22T18:00:00.000Z'),
    notifyDriverFn: async (driverId, payload) => {
      notifiedDriverId = driverId;
      notifiedTitle = payload.title;
    },
  });

  assert.equal(syncResult.success, true);
  assert.equal(syncResult.driverNotified, true);
  assert.equal(notifiedDriverId, 'drv-flight-204');
  assert.match(notifiedTitle, /WN1425/);

  // Original buffer was 25m (20:30Z - 20:05Z), so new pickup = 20:47Z + 25m = 21:12Z (+42m shift!)
  assert.equal(syncResult.newScheduledPickupIso, '2026-11-22T21:12:00.000Z');
  assert.equal(syncResult.driftMinutes, 42);
  assert.ok(syncResult.updatedTrip);
  assert.equal(syncResult.updatedTrip.scheduledPickupTime, '2026-11-22T21:12:00.000Z');

  // Verify immutable TripAuditEvent (`STATUS_CHANGED`) appended
  const latestAudit =
    syncResult.updatedTrip.auditLog?.[syncResult.updatedTrip.auditLog.length - 1];
  assert.ok(latestAudit);
  assert.equal(latestAudit.action, 'STATUS_CHANGED');
  assert.equal(latestAudit.actorId, 'disp-01');
  assert.equal(latestAudit.referenceNumber, 'FLT-WN1425');
  assert.equal(latestAudit.fieldChanges?.[0]?.field, 'scheduledPickupTime');
  assert.equal(latestAudit.fieldChanges?.[0]?.oldValue, '2026-11-22T20:30:00.000Z');
  assert.equal(latestAudit.fieldChanges?.[0]?.newValue, '2026-11-22T21:12:00.000Z');

  // Verify idempotency: re-evaluating alignment after 1-tap sync reports aligned = true (`none`)
  const postSyncCheck = evaluateFlightPickupAlignment(
    syncResult.updatedTrip.flightTelemetry,
    syncResult.updatedTrip.scheduledPickupTime,
    { hasCheckedLuggage: true }
  );
  assert.equal(postSyncCheck.aligned, true);
  assert.equal(postSyncCheck.conflict, 'none');

  console.log('   ✅ Passed pickup alignment conflict detection, 1-tap ETA sync & TripAuditEvent.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Firestore Security Rules Verification (`/flightStatusCache/{cacheKey}`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Testing firestore.rules /flightStatusCache invariants...');

  const rulesSource = fs.readFileSync(
    path.resolve(process.cwd(), 'firestore.rules'),
    'utf8'
  );
  assert.match(rulesSource, /match \/flightStatusCache\/\{cacheKey\}/);
  const cacheRuleBlock = rulesSource.split('match /flightStatusCache/{cacheKey}')[1]?.split('match /')[0] || '';
  assert.match(cacheRuleBlock, /allow get:\s*if true;/);
  assert.match(cacheRuleBlock, /allow list:\s*if false;/);
  assert.match(cacheRuleBlock, /allow write:\s*if isDispatcher\(\);/);

  console.log('   ✅ Passed firestore.rules /flightStatusCache security assertions.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Phase 38.B: Staff-Only Auth, Confirmed-Only & 24-Hour Operational Window
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Testing Phase 38.B Quota & Operational Window Gates...');

  assert.equal(evaluateFlightCheckEligibility, reExportedEligibility);
  const refNow = Date.parse('2026-11-22T12:00:00.000Z');

  // 6a. Pure evaluateFlightCheckEligibility checks
  assert.deepEqual(
    evaluateFlightCheckEligibility({
      isStaffContext: false,
      status: 'CONFIRMED',
      bookingType: 'asap',
      nowMs: refNow,
    }),
    {
      eligible: false,
      reason: 'staff_only',
      message: 'Live flight status checks are restricted to Dispatch and Admin staff.',
    }
  );

  const unconfirmedElig = evaluateFlightCheckEligibility({
    isStaffContext: true,
    status: 'UNCONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-22T18:00:00.000Z',
    nowMs: refNow,
  });
  assert.equal(unconfirmedElig.eligible, false);
  assert.equal(unconfirmedElig.reason, 'unconfirmed');
  assert.equal(unconfirmedElig.message, 'Confirm booking first to enable live flight tracking.');

  for (const termStatus of ['completed', 'cancelled', 'DECLINED', 'declined'] as const) {
    const termElig = evaluateFlightCheckEligibility({
      isStaffContext: true,
      status: termStatus,
      bookingType: 'scheduled',
      scheduledPickupTime: '2026-11-22T18:00:00.000Z',
      nowMs: refNow,
    });
    assert.equal(termElig.eligible, false, `Expected ${termStatus} to be blocked`);
    assert.equal(termElig.reason, 'terminal_status');
  }

  // > 24h in future (30h ahead: 2026-11-23T18:00:00Z) -> unlocks at 2026-11-22T18:00:00Z
  const farFutureElig = evaluateFlightCheckEligibility({
    isStaffContext: true,
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-23T18:00:00.000Z',
    nowMs: refNow,
  });
  assert.equal(farFutureElig.eligible, false);
  assert.equal(farFutureElig.reason, 'outside_24h_window');
  assert.equal(farFutureElig.unlocksAtIso, '2026-11-22T18:00:00.000Z');

  // > 12h in past (15h ago: 2026-11-21T21:00:00Z) -> past_window
  const pastElig = evaluateFlightCheckEligibility({
    isStaffContext: true,
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-21T21:00:00.000Z',
    nowMs: refNow,
  });
  assert.equal(pastElig.eligible, false);
  assert.equal(pastElig.reason, 'past_window');

  // Within 24h CONFIRMED -> eligible
  const withinWindowElig = evaluateFlightCheckEligibility({
    isStaffContext: true,
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-23T10:00:00.000Z', // +22h
    nowMs: refNow,
  });
  assert.equal(withinWindowElig.eligible, true);

  // ASAP CONFIRMED -> eligible even if legacy scheduledPickupTime was far out
  const asapElig = evaluateFlightCheckEligibility({
    isStaffContext: true,
    status: 'CONFIRMED',
    bookingType: 'asap',
    scheduledPickupTime: '2026-11-29T10:00:00.000Z',
    nowMs: refNow,
  });
  assert.equal(asapElig.eligible, true);

  // Verify FlightStatusService.refreshTripFlightTelemetry blocks UNCONFIRMED trips client-side
  const unconfirmedRefresh = await flightSvc.refreshTripFlightTelemetry(
    { ...assignedTrip, status: 'UNCONFIRMED' },
    { nowMs: refNow }
  );
  assert.equal(unconfirmedRefresh.success, false);
  assert.equal(unconfirmedRefresh.code, 'unconfirmed');

  // 6b. Server-side 24h window guard in lookupFlightTelemetryServer (0 upstream fetch calls!)
  let guardedFetchCount = 0;
  const zeroAllowedFetch: typeof fetch = async () => {
    guardedFetchCount += 1;
    throw new Error('Upstream fetchImpl MUST NOT be called for out-of-window requests');
  };

  // Rejects scheduledPickupIso > 24h ahead (+36h)
  const over24hServer = await lookupFlightTelemetryServer(
    {
      airline: 'WN',
      flightNumber: '1425',
      serviceDate: '2026-11-23',
      scheduledPickupIso: '2026-11-24T00:00:00.000Z',
    },
    {
      env: testEnv,
      fetchImpl: zeroAllowedFetch,
      nowMs: refNow,
      skipFirestoreCache: true,
    }
  );
  assert.equal(over24hServer.success, false);
  assert.equal(over24hServer.status, 400);
  assert.equal(over24hServer.code, 'OUTSIDE_24H_WINDOW');
  assert.equal(over24hServer.unlocksAtIso, '2026-11-23T00:00:00.000Z');
  assert.equal(guardedFetchCount, 0);

  // Rejects distant future serviceDate (>= +2 calendar days) even when scheduledPickupIso is omitted
  const distantFutureDateServer = await lookupFlightTelemetryServer(
    {
      airline: 'AA',
      flightNumber: '2049',
      serviceDate: '2026-11-25', // +3 days from 2026-11-22
    },
    {
      env: testEnv,
      fetchImpl: zeroAllowedFetch,
      nowMs: refNow,
      skipFirestoreCache: true,
    }
  );
  assert.equal(distantFutureDateServer.success, false);
  assert.equal(distantFutureDateServer.status, 400);
  assert.equal(distantFutureDateServer.code, 'OUTSIDE_24H_WINDOW');
  assert.equal(guardedFetchCount, 0);

  // Rejects distant past serviceDate (<= -2 calendar days)
  const distantPastDateServer = await lookupFlightTelemetryServer(
    {
      airline: 'DL',
      flightNumber: '1192',
      serviceDate: '2026-11-19', // -3 days from 2026-11-22
    },
    {
      env: testEnv,
      fetchImpl: zeroAllowedFetch,
      nowMs: refNow,
      skipFirestoreCache: true,
    }
  );
  assert.equal(distantPastDateServer.success, false);
  assert.equal(distantPastDateServer.status, 400);
  assert.equal(distantPastDateServer.code, 'OUTSIDE_24H_WINDOW');
  assert.equal(guardedFetchCount, 0);

  // 6c. HTTP endpoint staff-only auth enforcement (`401` unauthenticated, `403` customer, `200` dispatcher)
  const unauthResp = await handleFlightStatusPost(
    new Request('https://chesterfieldtaxi.com/api/flight-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airline: 'WN', flightNumber: '1425', serviceDate: '2026-11-22' }),
    }),
    {
      enforceAuth: true,
      nowMs: refNow,
      authResolver: async () => ({
        authenticated: false,
        isAdminSecret: false,
        roles: [],
        isAdmin: false,
        isDispatcher: false,
        isDriver: false,
        isCorporateManager: false,
      }),
    }
  );
  assert.equal(unauthResp.status, 401);

  const customerResp = await handleFlightStatusGet(
    new Request(
      'https://chesterfieldtaxi.com/api/flight-status?airline=WN&flightNumber=1425&serviceDate=2026-11-22'
    ),
    {
      enforceAuth: true,
      nowMs: refNow,
      authResolver: async () => ({
        authenticated: true,
        isAdminSecret: false,
        uid: 'cust-101',
        email: 'rider@example.com',
        roles: ['customer'],
        isAdmin: false,
        isDispatcher: false,
        isDriver: false,
        isCorporateManager: false,
      }),
    }
  );
  assert.equal(customerResp.status, 403);

  const dispatcherResp = await handleFlightStatusPost(
    new Request('https://chesterfieldtaxi.com/api/flight-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airline: 'WN', flightNumber: '1425', serviceDate: '2026-11-22' }),
    }),
    {
      enforceAuth: true,
      nowMs: refNow,
      authResolver: async () => ({
        authenticated: true,
        isAdminSecret: false,
        uid: 'disp-01',
        email: 'dispatch@chesterfieldtaxi.com',
        roles: ['dispatcher'],
        isAdmin: false,
        isDispatcher: true,
        isDriver: false,
        isCorporateManager: false,
      }),
    }
  );
  assert.equal(dispatcherResp.status, 200);
  const dispatcherBody = (await dispatcherResp.json()) as { success?: boolean };
  assert.equal(dispatcherBody.success, true);

  console.log('   ✅ Passed Phase 38.B staff-only auth, confirmed-only & 24h operational window gates.\n');

  console.log('🎉 ALL PHASE 38 + 38.B FLIGHT STATUS TELEMETRY ASSERTIONS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Phase 38 Flight Status test failed:', err);
  process.exit(1);
});
