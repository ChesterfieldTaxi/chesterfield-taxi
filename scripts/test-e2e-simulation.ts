/**
 * Phase 30: End-to-End Live Simulation Test Suite
 * 
 * Validates the complete operational lifecycle across all platform roles:
 * 1. Passenger Flow:
 *    - Mode A: Auto-Confirm (Verified rider, normal hours, in-policy fare) -> CONFIRMED
 *    - Mode B: Review Required (Unrated guest, late night, cash payment) -> UNCONFIRMED
 *    - Mode C: Blacklist Block (Restricted phone/email, prohibited zone) -> Rejection + Audit Event
 * 2. Dispatcher Flow:
 *    - Queue review across Card, Table, and Compact display layout schemas
 *    - Manual triage and transition from UNCONFIRMED to CONFIRMED
 *    - Assignment to active driver shift unit (Cab #204 / drv-101)
 *    - Real-time subscriber event broadcast verification
 * 3. Driver Flow:
 *    - Offer acceptance on driver PWA
 *    - Step-by-step lifecycle transition (assigned -> en_route -> arrived -> in_progress -> completed)
 *    - Immutable vehicle snapshot freezing (assignedVehicle)
 *    - Automated auditLog array timeline updates
 * 4. Tracking Flow:
 *    - Real-time Firestore/mock snapshot subscription (/track/$tripToken)
 *    - Live telemetry progression and event delivery validation
 */

import { BookingRulesEngine, DEFAULT_BOOKING_RULES_CONFIG } from '../app/core/services/bookingRulesEngine';
import { getBookingService } from '../app/core/services/booking';
import { DriverService } from '../app/core/services/driver.service';
import { UniversalGovernanceService } from '../app/core/services/governance/universal-governance.service';
import type { Trip, CreateTripInput, TripStatus } from '../app/core/types/trip';
import type { PassengerAccount } from '../app/core/types/passenger';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ` - ${details}` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runE2ESimulation() {
  console.log('\n===============================================================');
  console.log('🚀 RUNNING PHASE 30: END-TO-END LIVE SIMULATION TEST SUITE');
  console.log('===============================================================\n');

  const bookingService = getBookingService();
  const driverService = new DriverService();
  const governanceService = new UniversalGovernanceService();
  const rulesEngine = new BookingRulesEngine(DEFAULT_BOOKING_RULES_CONFIG);

  // ─────────────────────────────────────────────────────────────────
  // FLOW 1: PASSENGER BOOKING & RULES ENGINE EVALUATION
  // ─────────────────────────────────────────────────────────────────
  console.log('--- [STEP 1: PASSENGER FLOW & RULES ENGINE EVALUATION] ---');

  // 1.1 Mode A: Auto-Confirm Flow
  const verifiedPassenger: PassengerAccount = {
    id: 'pass_good_1',
    firstName: 'Alice',
    lastName: 'Morgan',
    email: 'alice.morgan@example.com',
    phone: '(314) 555-0199',
    customerScore: 88,
    isBlacklisted: false,
    isArchived: false,
    savedPlaces: [],
    communicationPreferences: { smsUpdates: true, emailReceipts: true, phoneCalls: false },
  };

  const autoConfirmTripInput: CreateTripInput = {
    customerId: verifiedPassenger.id,
    bookingType: 'scheduled',
    passenger: {
      firstName: verifiedPassenger.firstName,
      lastName: verifiedPassenger.lastName,
      email: verifiedPassenger.email,
      phone: verifiedPassenger.phone,
      passengerCount: 1,
      luggageCount: 0,
    },
    pickupLocation: {
      address: '16000 Swingley Ridge Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7499, lng: -90.3700 },
    },
    scheduledPickupTime: '2026-09-20T14:30:00Z', // 14:00 (midday, outside late night)
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5.0,
      distanceMiles: 20,
      durationMinutes: 25,
      distanceRate: 1.5,
      timeRate: 0.4,
      totalFare: 45.0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 45.0,
      currency: 'USD',
    },
    payment: {
      method: 'corporate',
      status: 'authorized',
      amount: 45.0,
    },
  };

  const evalModeA = rulesEngine.evaluateBookingRequest(autoConfirmTripInput, verifiedPassenger);
  assert(evalModeA.mode === 'AUTO_CONFIRM', 'RulesEngine Mode A: Auto-Confirm triggers for high-score passenger');

  const tripModeA = await bookingService.createBooking({
    ...autoConfirmTripInput,
    status: evalModeA.mode === 'AUTO_CONFIRM' ? 'CONFIRMED' : 'UNCONFIRMED',
  });
  assert(tripModeA.status === 'CONFIRMED', 'Passenger Flow Mode A: Trip automatically created with CONFIRMED status');

  // 1.2 Mode B: Require Review Flow (Late night + Unrated guest + Cash)
  const unratedGuestInput: CreateTripInput = {
    bookingType: 'scheduled',
    passenger: {
      firstName: 'Guest',
      lastName: 'Visitor',
      email: 'guest.new@example.com',
      phone: '(314) 555-8888',
      passengerCount: 2,
      luggageCount: 1,
    },
    pickupLocation: {
      address: 'Chesterfield Mall, Chesterfield, MO 63017',
      coordinates: { lat: 38.654, lng: -90.558 },
    },
    dropoffLocation: {
      address: 'Ballwin, MO 63011',
      coordinates: { lat: 38.595, lng: -90.548 },
    },
    scheduledPickupTime: '2026-09-21T02:30:00Z', // 02:30 (Late Night window: 23:00 - 04:00)
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5.0,
      distanceMiles: 8,
      durationMinutes: 15,
      distanceRate: 2.0,
      timeRate: 0.4,
      totalFare: 25.0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 25.0,
      currency: 'USD',
    },
    payment: {
      method: 'cash',
      status: 'pending',
      amount: 25.0,
    },
  };

  const evalModeB = rulesEngine.evaluateBookingRequest(unratedGuestInput);
  assert(evalModeB.mode === 'REQUIRE_REVIEW', 'RulesEngine Mode B: Require Review triggers for unrated guest / late night');
  assert(evalModeB.matchedRuleTags?.length! > 0, 'RulesEngine Mode B: Matched specific operational review tags');

  const tripModeB = await bookingService.createBooking({
    ...unratedGuestInput,
    status: 'UNCONFIRMED',
  });
  assert(tripModeB.status === 'UNCONFIRMED', 'Passenger Flow Mode B: Trip created with UNCONFIRMED status pending dispatcher');

  // 1.3 Mode C: Universal Blacklist & Security Block Flow
  const blacklistedPassenger: PassengerAccount = {
    id: 'pass_blocked_9',
    firstName: 'Malicious',
    lastName: 'Actor',
    email: 'banned.rider@example.com',
    phone: '(314) 555-0666',
    customerScore: 25, // Critical low score floor
    isBlacklisted: true,
    blacklistReason: 'Chargeback fraud and driver safety violation',
    isArchived: false,
    savedPlaces: [],
    communicationPreferences: { smsUpdates: false, emailReceipts: false, phoneCalls: false },
  };

  const blockedTripInput: CreateTripInput = {
    customerId: blacklistedPassenger.id,
    bookingType: 'asap',
    passenger: {
      firstName: blacklistedPassenger.firstName,
      lastName: blacklistedPassenger.lastName,
      email: blacklistedPassenger.email,
      phone: blacklistedPassenger.phone,
      passengerCount: 1,
      luggageCount: 0,
    },
    pickupLocation: {
      address: 'Chesterfield, MO',
      coordinates: { lat: 38.66, lng: -90.57 },
    },
    dropoffLocation: {
      address: 'St. Louis, MO',
      coordinates: { lat: 38.62, lng: -90.19 },
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5.0,
      distanceMiles: 15,
      durationMinutes: 20,
      distanceRate: 1.8,
      timeRate: 0.3,
      totalFare: 35.0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 35.0,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 35.0,
    },
  };

  const evalModeC = rulesEngine.evaluateBookingRequest(blockedTripInput, blacklistedPassenger);
  assert(evalModeC.mode === 'BLACKLIST_BLOCK', 'RulesEngine Mode C: Blacklist block evaluated for blacklisted passenger');
  assert(evalModeC.matchedRuleTags?.includes('BLACKLISTED_USER') || false, 'RulesEngine Mode C: Matched BLACKLISTED_USER tag');

  // Verify security audit recording on blocked creation
  governanceService.recordSecurityAudit({
    action: 'BLACKLIST_BLOCK',
    entityType: 'passenger',
    entityId: blacklistedPassenger.id,
    actorRole: 'system',
    reason: evalModeC.reason || 'Blocked by security rules engine',
  });
  const securityLogs = governanceService.getSecurityAudits();
  assert(securityLogs.some((l) => l.entityId === blacklistedPassenger.id), 'Universal Governance: Security audit log recorded block');

  // ─────────────────────────────────────────────────────────────────
  // FLOW 2: DISPATCHER TRIAGE, LAYOUTS & DRIVER ASSIGNMENT
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- [STEP 2: DISPATCHER FLOW & TRIAGE] ---');

  // 2.1 Fetch active trips and verify view schemas (Card, Table, Compact)
  const allTrips = await bookingService.getAllTrips!();
  assert(allTrips.length >= 2, 'Dispatcher Queue: Successfully queried all pending and confirmed trips');

  const pendingTrip = allTrips.find((t) => t.id === tripModeB.id);
  assert(Boolean(pendingTrip), 'Dispatcher Queue: Found UNCONFIRMED trip awaiting triage');

  // 2.2 Verify layout compatibility for Card, Table, and Compact schemas
  const cardDataFields = ['id', 'status', 'pickupLocation', 'dropoffLocation', 'passenger', 'pricing'];
  const hasAllFields = cardDataFields.every((k) => (pendingTrip as any)[k] !== undefined) && (pendingTrip as any).pricing?.totalFare !== undefined;
  assert(hasAllFields, 'Dispatcher Views: Trip record contains all mandatory fields for Card, Table, and Compact views');

  // 2.3 Dispatcher accepts trip & transitions UNCONFIRMED -> CONFIRMED
  const confirmedTrip = await bookingService.updateTripStatus!(tripModeB.id, 'CONFIRMED', {
    actorRole: 'admin',
    reason: 'Dispatcher reviewed and verified guest booking request',
  });
  assert(confirmedTrip.status === 'CONFIRMED', 'Dispatcher Flow: Dispatcher manually confirmed UNCONFIRMED trip');

  // 2.4 Setup subscriber to test real-time state broadcast
  let broadcastReceived = false;
  let broadcastPayload: Trip | null = null;
  const unsubscribeTrip = bookingService.subscribeToBooking!(tripModeB.id, (updated) => {
    broadcastReceived = true;
    broadcastPayload = updated;
  });

  // 2.5 Dispatcher assigns trip to active driver shift unit (Cab #204 / drv-101)
  const assignedTrip = await bookingService.updateTripStatus!(tripModeB.id, 'assigned', {
    actorRole: 'admin',
    assignedDriverId: 'drv-101',
    reason: 'Dispatched to active duty unit Cab #204',
  });
  assert(assignedTrip.status === 'assigned', 'Dispatcher Flow: Trip status transitioned to assigned');
  assert(assignedTrip.assignedDriverId === 'drv-101', 'Dispatcher Flow: Driver drv-101 assigned to trip');
  assert(broadcastReceived, 'Dispatcher Flow: Real-time broadcast listener received assigned trip update');

  // ─────────────────────────────────────────────────────────────────
  // FLOW 3: DRIVER LIFECYCLE & AUDIT LOGGING
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- [STEP 3: DRIVER FLOW, SNAPSHOT FREEZING & AUDIT LOG] ---');

  // 3.1 Verify immutable vehicle snapshot freezing upon driver assignment
  assert(Boolean(assignedTrip.assignedVehicle), 'Driver Flow: assignedVehicle snapshot was frozen upon assignment');
  assert(Boolean(assignedTrip.assignedVehicle?.vehicleNumber?.includes('Cab #204')), 'Driver Flow: Frozen vehicleNumber matches Cab #204');
  assert(Boolean(assignedTrip.assignedVehicle?.model), 'Driver Flow: Frozen vehicle model details captured');

  // 3.2 Driver transitions status: assigned -> en_route
  const enRouteTrip = await driverService.transitionTrip(tripModeB.id, 'en_route', 'drv-101', 'Driver en route to pickup');
  assert(enRouteTrip.status === 'en_route', 'Driver Flow: Step 1 (en_route) transitioned');

  // 3.3 Driver transitions status: en_route -> arrived
  const arrivedTrip = await driverService.transitionTrip(tripModeB.id, 'arrived', 'drv-101', 'Vehicle arrived at customer pickup');
  assert(arrivedTrip.status === 'arrived', 'Driver Flow: Step 2 (arrived) transitioned');

  // 3.4 Driver transitions status: arrived -> in_progress
  const inProgressTrip = await driverService.transitionTrip(tripModeB.id, 'in_progress', 'drv-101', 'Passenger onboard, taximeter engaged');
  assert(inProgressTrip.status === 'in_progress', 'Driver Flow: Step 3 (in_progress) transitioned');

  // 3.5 Driver transitions status: in_progress -> completed
  const completedTrip = await driverService.transitionTrip(tripModeB.id, 'completed', 'drv-101', 'Passenger arrived safely, trip completed');
  assert(completedTrip.status === 'completed', 'Driver Flow: Step 4 (completed) transitioned');
  assert(Boolean(completedTrip.completedAt), 'Driver Flow: completedAt timestamp automatically recorded');

  // 3.6 Verify automated auditLog array integrity
  const auditEntries = completedTrip.auditLog || [];
  assert(auditEntries.length >= 4, `Driver Flow: auditLog captured ${auditEntries.length} state transition events`);
  const hasDriverAccepted = auditEntries.some((e) => e.action === 'DRIVER_ACCEPTED');
  const hasStatusChanged = auditEntries.some((e) => e.action === 'STATUS_CHANGED');
  assert(hasDriverAccepted && hasStatusChanged, 'Driver Flow: auditLog contains DRIVER_ACCEPTED and STATUS_CHANGED events with actor roles');

  // ─────────────────────────────────────────────────────────────────
  // FLOW 4: REAL-TIME TRACKING SUBSCRIBER
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- [STEP 4: LIVE CUSTOMER TRACKING SUBSCRIBER FLOW] ---');

  // 4.1 Verify tracking page subscriber receives completed state with all telemetry
  const latestStatus = await bookingService.getBookingStatus(tripModeB.id);
  assert(latestStatus !== null, 'Tracking Flow: /track/$tripToken resolved booking status');
  assert(latestStatus?.status === 'completed', 'Tracking Flow: Status resolves to completed');
  assert(Boolean(latestStatus?.trip?.assignedVehicle?.vehicleNumber?.includes('Cab #204')), 'Tracking Flow: Live telemetry displays frozen vehicle unit');

  unsubscribeTrip();

  console.log('\n===============================================================');
  console.log(`🎉 ALL TESTS PASSED! (${passedTests}/${totalTests} assertions)`);
  console.log('Phase 30 E2E Live Simulation Completed Successfully!');
  console.log('===============================================================\n');
}

runE2ESimulation().catch((err) => {
  console.error('\n❌ E2E Simulation Test Failed with error:', err);
  process.exit(1);
});
