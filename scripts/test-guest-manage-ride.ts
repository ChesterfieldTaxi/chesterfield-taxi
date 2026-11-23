/**
 * Automated Verification Suite — Platform Phase 56 (Wave 4 Phase 7)
 * Self-Service Guest "Manage My Ride" on `/track/:tripToken`
 * (Instant Notes/Flight #, Pre-Dispatch Auto-Edit vs Assigned Dispatcher Approval,
 * Policy-Aware Cancellation & Phase 55 Driver Update Ack Integration)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { IBookingService } from '../app/core/services/booking-service';
import {
  getPendingDriverUpdateAck,
  hasUnacknowledgedDriverUpdate,
} from '../app/core/services/dispatch/trip-update-ack.service';
import {
  applyInstantGuestDetailsUpdate,
  evaluateGuestCancellationPolicy,
  evaluateGuestManageEligibility,
  getPendingGuestChangeRequest,
  hasPendingGuestChangeRequest,
  resolveDispatcherGuestChangeDecision,
} from '../app/core/services/tracking/guest-manage-ride';
import {
  handleGuestManageRidePost,
  resetServerGuestTrackingStoreForTests,
  resolvePublicTrackingByTokenServer,
} from '../app/core/services/tracking/guest-manage-ride.server';
import {
  buildPublicTrackingProjection,
  generateTrackingToken,
  sanitizePublicAddressDisplay,
  sanitizePublicTrackingProjection,
} from '../app/core/utils/tracking-token.util';
import type { CreateTripInput, Trip, TripStatus } from '../app/core/types/trip';
import { loader as trackApiLoader } from '../app/routes/api.track';

class InMemoryTestBookingService implements IBookingService {
  private store = new Map<string, Trip>();

  seedTrip(trip: Trip): void {
    this.store.set(trip.id, structuredClone(trip));
  }

  getStoredTrip(tripId: string): Trip | undefined {
    const found = this.store.get(tripId);
    return found ? structuredClone(found) : undefined;
  }

  async calculateQuote(): Promise<any> {
    throw new Error('Not needed in unit harness');
  }

  async createBooking(_payload: CreateTripInput): Promise<Trip> {
    throw new Error('Not needed in unit harness');
  }

  async getBookingStatus(bookingId: string) {
    const t = this.store.get(bookingId);
    if (!t) return null;
    return {
      tripId: t.id,
      status: t.status,
      assignedDriverId: t.assignedDriverId,
      estimatedPickupTime: t.scheduledPickupTime,
      trip: structuredClone(t),
    };
  }

  async getAllTrips(): Promise<Trip[]> {
    return Array.from(this.store.values()).map((t) => structuredClone(t));
  }

  async cancelBooking(
    bookingId: string,
    reason?: string,
    cancelledBy: 'passenger' | 'driver' | 'admin' | 'system' = 'passenger'
  ): Promise<Trip> {
    const existing = this.store.get(bookingId);
    if (!existing) throw new Error(`Trip ${bookingId} not found`);
    const next: Trip = {
      ...existing,
      status: 'cancelled',
      cancellationReason: reason,
      cancelledBy,
      assignedDriverId: null,
      offeredToIds: [],
      updatedAt: new Date().toISOString(),
    };
    this.store.set(bookingId, next);
    return structuredClone(next);
  }

  async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip> {
    const existing = this.store.get(tripId);
    if (!existing) throw new Error(`Trip ${tripId} not found`);
    const merged: Trip = {
      ...existing,
      ...updates,
      updatedAt: updates.updatedAt || new Date().toISOString(),
    };
    this.store.set(tripId, merged);
    return structuredClone(merged);
  }
}

function createSampleTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'CT-5600-1001',
    trackingToken: generateTrackingToken(),
    corporateAccountId: 'corp-secret-acct-99',
    status: 'CONFIRMED',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: {
      address: '16401 Swingley Ridge Rd, Apt 4B, Gate Code #4410, Chesterfield, MO 63017',
      coordinates: { lat: 38.6631, lng: -90.5771 },
      notes: 'East Lobby by fountain. Gate code #4410, call (314) 555-0192',
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, Suite 210, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    intermediateStops: [
      {
        address: '8000 Forsyth Blvd #1200, Clayton, MO 63105',
        coordinates: { lat: 38.6501, lng: -90.3399 },
      },
    ],
    driverNotes: 'East Lobby by fountain. Gate code #4410, call (314) 555-0192',
    flightNotes: '[Flight: Delta #DL1492]',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-12-15T18:00:00.000Z',
    passenger: {
      firstName: 'Elena',
      lastName: 'VanceSecretLastName',
      email: 'elena.secret@corp-example.com',
      phone: '(314) 555-0192',
      passengerCount: 2,
      luggageCount: 2,
      specialRequests: 'Quiet Ride',
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 10,
      distanceMiles: 20,
      durationMinutes: 25,
      distanceRate: 2.0,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 50,
      totalFare: 50,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 50,
    },
    statusHistory: [
      {
        from: null,
        to: 'CONFIRMED',
        timestamp: '2026-12-15T12:00:00.000Z',
        actorRole: 'admin',
      },
    ],
    auditLog: [],
    createdAt: '2026-12-15T12:00:00.000Z',
    updatedAt: '2026-12-15T12:00:00.000Z',
    metadata: {
      assignedDriverName: 'Zakharya Rakhmanov',
      assignedDriverPhone: '(314) 915-1800',
      airline: 'Delta',
      flightNumber: 'DL1492',
      gateCode: '4410',
      poNumber: 'PO-SECRET-88912',
      billingPo: 'PO-SECRET-88912',
      corporateAccountNumber: 'CORP-99410',
    },
    ...overrides,
  };
}

function collectFilesRecursively(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function runTests(): Promise<void> {
  console.log('🧪 Starting Phase 56 Self-Service Guest "Manage My Ride" Verification Suite...\n');

  resetServerGuestTrackingStoreForTests();
  const bookingService = new InMemoryTestBookingService();
  const fixedNowMs = Date.parse('2026-12-15T14:00:00.000Z'); // 4 hours (240m) before 18:00Z pickup

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Zero-PII Invariant on `buildPublicTrackingProjection` & `GET /api/track`
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Verifying Zero-PII invariant on buildPublicTrackingProjection & GET /api/track...');
  const piiTrip = createSampleTrip({
    assignedDriverId: 'drv-101',
    status: 'accepted',
    metadata: {
      assignedDriverName: 'Zakharya Rakhmanov',
      assignedDriverPhone: '(314) 915-1800',
      airline: 'Delta',
      flightNumber: 'DL1492',
      gateCode: '#4410',
      poNumber: 'PO-SECRET-88912',
      billingPo: 'PO-SECRET-88912',
      corporateAccountNumber: 'CORP-99410',
      pendingGuestChangeRequest: {
        requestId: 'gcr_test_1',
        status: 'pending',
        requestedAt: '2026-12-15T14:05:00.000Z',
        requestedPickupAddress: '500 Market St, Apt 9C, Gate #7788, St. Louis, MO',
        requestedDropoffAddress: '10701 Lambert International Blvd, Suite 210, St. Louis, MO',
        estimatedNewFare: 62.5,
        customerReason: 'Call me at 314-555-0192',
        resolvedBy: 'dispatcher.secret@chesterfieldtaxi.com',
      },
    },
  });
  bookingService.seedTrip(piiTrip);

  const projection = buildPublicTrackingProjection(piiTrip);
  assert.ok(projection, 'buildPublicTrackingProjection must return non-null projection');
  const projectionJson = JSON.stringify(projection);

  const forbiddenLeaks = [
    'VanceSecretLastName',
    'elena.secret@corp-example.com',
    '555-0192',
    '5550192',
    '915-1800',
    'Rakhmanov', // driver last name must never leak
    '4410', // raw gateCode digits
    '7788', // raw gate digits in pendingGuestChangeSummary
    '9C', // apt number in pendingGuestChangeSummary
    '210', // suite number
    '1200', // intermediate stop unit number
    'PO-SECRET-88912',
    'CORP-99410',
    'corp-secret-acct-99',
    'dispatcher.secret@chesterfieldtaxi.com',
  ];

  for (const secret of forbiddenLeaks) {
    assert.equal(
      projectionJson.includes(secret),
      false,
      `ZERO-PII VIOLATION: "${secret}" leaked into PublicTripTrackingProjection JSON!`
    );
  }

  assert.equal(projection.hasGateCode, true, 'hasGateCode boolean must be true');
  assert.equal(projection.flightSummary, 'Delta #DL1492');
  assert.equal(projection.assignedDriverFirstName, 'Zakharya');
  assert.equal(projection.totalFare, 50);
  assert.equal(projection.canSelfManage, true);
  assert.equal(projection.pendingGuestChangeSummary?.status, 'pending');
  assert.equal(
    sanitizePublicAddressDisplay('16401 Swingley Ridge Rd, Apt 4B, Gate Code #4410, Chesterfield, MO'),
    '16401 Swingley Ridge Rd, Chesterfield, MO'
  );

  // Also verify server resolver + GET /api/track loader sanitization
  const serverProj = await resolvePublicTrackingByTokenServer(piiTrip.trackingToken!, {
    bookingServiceOverride: bookingService,
  });
  assert.ok(serverProj);
  const getResp = await trackApiLoader({
    request: new Request(
      `http://localhost/api/track?token=${encodeURIComponent(piiTrip.trackingToken!)}`,
      { headers: { 'x-forwarded-for': '198.51.100.11' } }
    ),
    params: {},
    context: {},
  } as any);
  assert.equal(getResp.status, 200);
  const getJson = (await getResp.json()) as any;
  assert.equal(getJson.success, true);
  const getJsonStr = JSON.stringify(getJson);
  for (const secret of forbiddenLeaks) {
    assert.equal(
      getJsonStr.includes(secret),
      false,
      `ZERO-PII VIOLATION: "${secret}" leaked via GET /api/track!`
    );
  }
  console.log('   ✓ Zero-PII projection & GET /api/track verified clean.');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Phone Last-4 Security Gate & Brute-Force Rate Limiter
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Verifying wrong phoneLast4 rejection (403) & IP+token rate-limit guard...');
  const protectedTrip = createSampleTrip({
    id: 'CT-5600-1002',
    trackingToken: generateTrackingToken(),
    status: 'CONFIRMED',
    assignedDriverId: null,
  });
  bookingService.seedTrip(protectedTrip);

  for (const writeIntent of ['update_notes_flight', 'modify_time_route', 'confirm_cancel'] as const) {
    const wrongResp = await handleGuestManageRidePost(
      new Request('http://localhost/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.40',
        },
        body: JSON.stringify({
          intent: writeIntent,
          trackingToken: protectedTrip.trackingToken,
          phoneLast4: '9999', // actual is 0192
          driverNotes: 'Unauthorized attempt',
          scheduledPickupTime: '2026-12-15T19:00:00.000Z',
          reason: 'Unauthorized cancel',
        }),
      }),
      {
        bookingServiceOverride: bookingService,
        nowMs: fixedNowMs,
      }
    );
    assert.equal(
      wrongResp.status,
      403,
      `Wrong phoneLast4 on "${writeIntent}" must return HTTP 403 (got ${wrongResp.status})`
    );
    const wrongBody = (await wrongResp.json()) as any;
    assert.equal(wrongBody.success, false);
    assert.equal(wrongBody.code, 'PHONE_VERIFICATION_FAILED');
  }

  // Verify rate-limit kicks in after 8 attempts from the same IP + token
  const bruteIp = '203.0.113.99';
  let hitRateLimit429 = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const r = await handleGuestManageRidePost(
      new Request('http://localhost/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': bruteIp,
        },
        body: JSON.stringify({
          intent: 'update_notes_flight',
          trackingToken: protectedTrip.trackingToken,
          phoneLast4: '0000',
          driverNotes: 'Brute force test',
        }),
      }),
      {
        bookingServiceOverride: bookingService,
        nowMs: fixedNowMs,
      }
    );
    if (r.status === 429) {
      hitRateLimit429 = true;
      break;
    }
  }
  assert.equal(hitRateLimit429, true, 'Per-IP+token rate limiter must reject brute-force attempts with 429');
  console.log('   ✓ Wrong phoneLast4 rejected (403) across all write intents & 429 rate-limiter active.');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Instant `update_notes_flight` (Unassigned vs Assigned Phase 55 Driver Ack)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Verifying instant update_notes_flight (unassigned vs assigned driver Ack loop)...');
  const unassignedNotesTrip = createSampleTrip({
    id: 'CT-5600-1003',
    trackingToken: generateTrackingToken(),
    status: 'CONFIRMED',
    assignedDriverId: null,
  });
  bookingService.seedTrip(unassignedNotesTrip);

  const notesRespUnassigned = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'update_notes_flight',
        trackingToken: unassignedNotesTrip.trackingToken,
        phoneLast4: '0192',
        driverNotes: 'Standing outside Terminal 1 Door 6',
        gateCode: '#8821',
        airline: 'Southwest',
        flightNumber: 'WN2045',
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(notesRespUnassigned.status, 200);
  const notesJsonUnassigned = (await notesRespUnassigned.json()) as any;
  assert.equal(notesJsonUnassigned.success, true);
  assert.equal(notesJsonUnassigned.driverNotified, false);
  assert.equal(notesJsonUnassigned.tracking.flightSummary, 'Southwest #WN2045');
  assert.equal(notesJsonUnassigned.tracking.hasGateCode, true);
  assert.equal(JSON.stringify(notesJsonUnassigned.tracking).includes('8821'), false);

  const savedUnassigned = bookingService.getStoredTrip(unassignedNotesTrip.id)!;
  assert.equal(savedUnassigned.driverNotes, 'Standing outside Terminal 1 Door 6');
  assert.equal((savedUnassigned.metadata as any).gateCode, '#8821');
  assert.equal((savedUnassigned.metadata as any).flightNumber, 'WN2045');
  assert.equal(getPendingDriverUpdateAck(savedUnassigned), null);

  // Now verify on an `accepted` assigned trip -> stamps `pendingDriverUpdateAck` (`source: 'guest_manage_ride'`)
  const assignedNotesTrip = createSampleTrip({
    id: 'CT-5600-1004',
    trackingToken: generateTrackingToken(),
    status: 'accepted',
    assignedDriverId: 'drv-101',
  });
  bookingService.seedTrip(assignedNotesTrip);

  const notesRespAssigned = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'update_notes_flight',
        trackingToken: assignedNotesTrip.trackingToken,
        phoneLast4: '0192',
        driverNotes: 'Waiting by Baggage Claim Carousel 4',
        gateCode: '#9012',
        airline: 'United',
        flightNumber: 'UA512',
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs + 5_000,
    }
  );
  assert.equal(notesRespAssigned.status, 200);
  const notesJsonAssigned = (await notesRespAssigned.json()) as any;
  assert.equal(notesJsonAssigned.success, true);
  assert.equal(notesJsonAssigned.driverNotified, true);

  const savedAssigned = bookingService.getStoredTrip(assignedNotesTrip.id)!;
  assert.equal(hasUnacknowledgedDriverUpdate(savedAssigned), true);
  const driverAck = getPendingDriverUpdateAck(savedAssigned);
  assert.ok(driverAck, 'pendingDriverUpdateAck must be stamped on assigned trip');
  assert.equal(driverAck.source, 'guest_manage_ride');
  assert.equal(driverAck.requiresAck, true);
  assert.equal(driverAck.updatedBy, 'Passenger (/track)');
  assert.ok(driverAck.changesSummary.some((s) => s.includes('Notes:')));
  assert.ok(driverAck.changesSummary.some((s) => s.includes('Gate code:')));
  assert.ok(driverAck.changesSummary.some((s) => s.includes('Flight')));
  console.log('   ✓ Instant notes/gate/flight updates & Phase 55 Driver Ack integration verified.');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. `modify_time_route`: Pre-Dispatch Auto-Apply vs Assigned Dispatcher Approval
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Verifying modify_time_route (Pre-Dispatch Auto-Apply vs Assigned Request + Approve/Decline)...');
  const preDispatchTrip = createSampleTrip({
    id: 'CT-5600-1005',
    trackingToken: generateTrackingToken(),
    status: 'CONFIRMED',
    assignedDriverId: null,
  });
  bookingService.seedTrip(preDispatchTrip);

  const newSchedIso = '2026-12-15T19:30:00.000Z';
  const autoEditResp = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'modify_time_route',
        trackingToken: preDispatchTrip.trackingToken,
        phoneLast4: '0192',
        scheduledPickupTime: newSchedIso,
        pickupAddress: '1 Ritz-Carlton Dr, Clayton, MO 63105',
        pickupCoordinates: { lat: 38.6531, lng: -90.3365 },
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(autoEditResp.status, 200);
  const autoEditJson = (await autoEditResp.json()) as any;
  assert.equal(autoEditJson.success, true);
  assert.equal(autoEditJson.mode, 'auto_applied');
  assert.equal(autoEditJson.tracking.scheduledPickupTime, newSchedIso);
  assert.equal(autoEditJson.tracking.pickupDisplay, '1 Ritz-Carlton Dr, Clayton, MO 63105');

  const storedAutoEdited = bookingService.getStoredTrip(preDispatchTrip.id)!;
  assert.equal(storedAutoEdited.scheduledPickupTime, newSchedIso);
  assert.equal(storedAutoEdited.pickupLocation.address, '1 Ritz-Carlton Dr, Clayton, MO 63105');
  assert.equal(storedAutoEdited.status, 'CONFIRMED');
  assert.notEqual(
    storedAutoEdited.pricing.totalFare,
    50,
    'Proportional fare re-estimation should update fare when coordinates change significantly'
  );

  // Also verify pre-dispatch late-night/airport modification triggers `evaluateBookingRules` -> `UNCONFIRMED`
  const lateNightAutoResp = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'modify_time_route',
        trackingToken: preDispatchTrip.trackingToken,
        phoneLast4: '0192',
        scheduledPickupTime: '2026-12-16T07:30:00.000Z', // 1:30 AM CST (late-night review window)
        pickupAddress: '10701 Lambert International Blvd, St. Louis, MO 63145', // Airport pickup review trigger
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(lateNightAutoResp.status, 200);
  const lateNightAutoJson = (await lateNightAutoResp.json()) as any;
  assert.equal(lateNightAutoJson.mode, 'auto_applied');
  assert.equal(
    lateNightAutoJson.status,
    'UNCONFIRMED',
    'Airport/late-night pre-dispatch modification must transition status to UNCONFIRMED for review'
  );

  // Assigned trip (`accepted`, `assignedDriverId: 'drv-101'`) -> `pending_approval`
  const assignedRouteTrip = createSampleTrip({
    id: 'CT-5600-1006',
    trackingToken: generateTrackingToken(),
    status: 'accepted',
    assignedDriverId: 'drv-101',
  });
  bookingService.seedTrip(assignedRouteTrip);

  const reqSchedIso = '2026-12-15T20:15:00.000Z';
  const reqEditResp = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'modify_time_route',
        trackingToken: assignedRouteTrip.trackingToken,
        phoneLast4: '0192',
        scheduledPickupTime: reqSchedIso,
        pickupAddress: '7701 Forsyth Blvd, Clayton, MO 63105',
        pickupCoordinates: { lat: 38.6508, lng: -90.3358 },
        customerReason: 'Meeting extended by 45 minutes',
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs + 10_000,
    }
  );
  assert.equal(reqEditResp.status, 200);
  const reqEditJson = (await reqEditResp.json()) as any;
  assert.equal(reqEditJson.success, true);
  assert.equal(reqEditJson.mode, 'pending_approval');
  assert.equal(reqEditJson.tracking.pendingGuestChangeSummary?.status, 'pending');

  const storedPendingTrip = bookingService.getStoredTrip(assignedRouteTrip.id)!;
  // Live driver route/time MUST remain untouched while pending!
  assert.equal(storedPendingTrip.scheduledPickupTime, assignedRouteTrip.scheduledPickupTime);
  assert.equal(storedPendingTrip.pickupLocation.address, assignedRouteTrip.pickupLocation.address);
  assert.equal(storedPendingTrip.assignedDriverId, 'drv-101');
  assert.equal(storedPendingTrip.status, 'accepted');
  assert.equal(hasPendingGuestChangeRequest(storedPendingTrip), true);
  assert.equal(hasUnacknowledgedDriverUpdate(storedPendingTrip), false);

  // Test Dispatcher DECLINE decision (preserves original route/time, marks 'declined', no driver ack)
  const declinedOutcome = resolveDispatcherGuestChangeDecision({
    trip: storedPendingTrip,
    decision: 'decline',
    actorEmail: 'dispatch@chesterfieldtaxi.com',
    resolutionNote: 'Driver already booked at 8:30 PM',
    nowMs: fixedNowMs + 20_000,
  });
  assert.equal(declinedOutcome.resolvedRequest.status, 'declined');
  assert.equal(declinedOutcome.pendingDriverUpdateAck, null);
  assert.equal(
    declinedOutcome.updatedTrip.pickupLocation.address,
    assignedRouteTrip.pickupLocation.address
  );
  assert.equal(
    declinedOutcome.updatedTrip.scheduledPickupTime,
    assignedRouteTrip.scheduledPickupTime
  );

  // Test Dispatcher APPROVE decision (applies requested route/time + stamps Phase 55 Driver Update Ack!)
  const approvedOutcome = resolveDispatcherGuestChangeDecision({
    trip: storedPendingTrip,
    decision: 'approve',
    actorEmail: 'dispatch@chesterfieldtaxi.com',
    resolutionNote: 'Confirmed with driver Zakharya',
    nowMs: fixedNowMs + 30_000,
  });
  assert.equal(approvedOutcome.resolvedRequest.status, 'approved');
  assert.equal(approvedOutcome.updatedTrip.scheduledPickupTime, reqSchedIso);
  assert.equal(
    approvedOutcome.updatedTrip.pickupLocation.address,
    '7701 Forsyth Blvd, Clayton, MO 63105'
  );
  assert.equal(approvedOutcome.updatedTrip.assignedDriverId, 'drv-101');
  assert.equal(approvedOutcome.updatedTrip.status, 'accepted');
  assert.ok(
    approvedOutcome.pendingDriverUpdateAck,
    'Approving passenger change request must stamp PendingDriverUpdateAck for the assigned driver'
  );
  assert.equal(approvedOutcome.pendingDriverUpdateAck.source, 'guest_manage_ride');
  assert.equal(approvedOutcome.pendingDriverUpdateAck.requiresAck, true);

  // Also verify driver 'arrived' locks route/time modification
  const arrivedEligibility = evaluateGuestManageEligibility({
    status: 'arrived',
    assignedDriverId: 'drv-101',
    bookingType: 'scheduled',
    scheduledPickupTime: reqSchedIso,
  });
  assert.equal(arrivedEligibility.canModifyTimeRoute, false);
  assert.equal(arrivedEligibility.routeTimeMode, 'locked');
  assert.equal(arrivedEligibility.canEditNotesFlight, true);
  assert.equal(arrivedEligibility.canCancel, true);
  console.log('   ✓ Pre-dispatch auto-apply & assigned 1-tap Dispatcher Approve/Decline verified.');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. `evaluateGuestCancellationPolicy` & `confirm_cancel` Across All Policy Tiers
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Verifying evaluateGuestCancellationPolicy & confirm_cancel across all policy tiers...');
  const sampleConfig = {
    freeCancellationWindowMinutes: 120,
    lateCancellationFeePercent: 25,
    noShowFeeAmount: 50,
  };

  // Tier A: Free pre-dispatch ($0)
  const freePolicy = evaluateGuestCancellationPolicy({
    trip: createSampleTrip({
      status: 'CONFIRMED',
      assignedDriverId: null,
      scheduledPickupTime: '2026-12-15T18:00:00.000Z', // 240m away
    }),
    bookingConfig: sampleConfig,
    nowMs: fixedNowMs,
  });
  assert.equal(freePolicy.canCancel, true);
  assert.equal(freePolicy.isFreeCancellation, true);
  assert.equal(freePolicy.cancellationFeeAmount, 0);
  assert.equal(freePolicy.policyTier, 'free_pre_dispatch');

  // Tier B: Late scheduled window (45m before pickup -> 25% of $80 = $20.00)
  const lateTrip = createSampleTrip({
    id: 'CT-5600-1007',
    trackingToken: generateTrackingToken(),
    status: 'assigned',
    assignedDriverId: 'drv-205',
    plannedDriverId: 'drv-205',
    offeredToIds: ['drv-205'],
    scheduledPickupTime: new Date(fixedNowMs + 45 * 60_000).toISOString(),
    pricing: {
      ...createSampleTrip().pricing,
      subtotal: 80,
      totalFare: 80,
    },
  });
  bookingService.seedTrip(lateTrip);

  const latePolicy = evaluateGuestCancellationPolicy({
    trip: lateTrip,
    bookingConfig: sampleConfig,
    nowMs: fixedNowMs,
  });
  assert.equal(latePolicy.canCancel, true);
  assert.equal(latePolicy.isFreeCancellation, false);
  assert.equal(latePolicy.cancellationFeeAmount, 20);
  assert.equal(latePolicy.policyTier, 'late_window_fee');

  // Preview endpoint requires no phoneLast4
  const previewResp = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'preview_cancel',
        trackingToken: lateTrip.trackingToken,
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      bookingConfigOverride: sampleConfig,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(previewResp.status, 200);
  const previewJson = (await previewResp.json()) as any;
  assert.equal(previewJson.policy.cancellationFeeAmount, 20);

  // Confirm cancel on lateTrip
  const cancelResp = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'confirm_cancel',
        trackingToken: lateTrip.trackingToken,
        phoneLast4: '0192',
        reason: 'Flight inbound cancelled by airline',
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      bookingConfigOverride: sampleConfig,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(cancelResp.status, 200);
  const cancelJson = (await cancelResp.json()) as any;
  assert.equal(cancelJson.success, true);
  assert.equal(cancelJson.policy.cancellationFeeAmount, 20);
  assert.equal(cancelJson.tracking.status, 'cancelled');
  assert.equal(cancelJson.tracking.canSelfManage, false);

  const cancelledStored = bookingService.getStoredTrip(lateTrip.id)!;
  assert.equal(cancelledStored.status, 'cancelled');
  assert.equal(cancelledStored.cancelledBy, 'passenger');
  assert.equal(cancelledStored.assignedDriverId, null);
  assert.equal(cancelledStored.plannedDriverId, null);
  assert.deepEqual(cancelledStored.offeredToIds, []);
  assert.equal((cancelledStored.metadata as any).guestCancellationPolicy.cancellationFeeAmount, 20);

  // Tier C: Driver 'arrived' -> noShowFeeAmount ($50)
  const arrivedPolicy = evaluateGuestCancellationPolicy({
    trip: createSampleTrip({
      status: 'arrived',
      assignedDriverId: 'drv-101',
    }),
    bookingConfig: sampleConfig,
    nowMs: fixedNowMs,
  });
  assert.equal(arrivedPolicy.canCancel, true);
  assert.equal(arrivedPolicy.policyTier, 'driver_arrived_no_show_fee');
  assert.equal(arrivedPolicy.cancellationFeeAmount, 50);

  // Tier D: 'in_progress' -> locked (`canCancel === false` + HTTP 409 on confirm_cancel)
  const inProgressTrip = createSampleTrip({
    id: 'CT-5600-1008',
    trackingToken: generateTrackingToken(),
    status: 'in_progress' as TripStatus,
    assignedDriverId: 'drv-101',
  });
  bookingService.seedTrip(inProgressTrip);

  const inProgressPolicy = evaluateGuestCancellationPolicy({
    trip: inProgressTrip,
    bookingConfig: sampleConfig,
    nowMs: fixedNowMs,
  });
  assert.equal(inProgressPolicy.canCancel, false);
  assert.equal(inProgressPolicy.policyTier, 'locked_in_progress');

  const lockedCancelResp = await handleGuestManageRidePost(
    new Request('http://localhost/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'confirm_cancel',
        trackingToken: inProgressTrip.trackingToken,
        phoneLast4: '0192',
      }),
    }),
    {
      bookingServiceOverride: bookingService,
      bookingConfigOverride: sampleConfig,
      skipRateLimitForTests: true,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(lockedCancelResp.status, 409);
  console.log('   ✓ All cancellation policy tiers & confirm_cancel transitions verified.');

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Static, Bundle Isolation & Monolith Line-Budget Guardrails
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Verifying static guardrails, bundle isolation & monolith line budgets...');
  const rootDir = process.cwd();

  // Untouched firestore.rules & vercel.json
  const gitDiffProtected = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitDiffProtected.includes('firestore.rules'),
    false,
    'firestore.rules MUST NOT be modified!'
  );
  assert.equal(
    gitDiffProtected.includes('vercel.json'),
    false,
    'vercel.json MUST NOT be modified!'
  );

  // Monolith line budgets
  const lineBudgets: Array<{ relPath: string; maxLines: number }> = [
    { relPath: 'app/routes/dispatch.tsx', maxLines: 1600 },
    { relPath: 'app/routes/driver.tsx', maxLines: 1900 },
    { relPath: 'app/routes/booking.status.tsx', maxLines: 800 },
    { relPath: 'app/components/domain/driver/DriverLiveMeterCard.tsx', maxLines: 1080 },
    { relPath: 'app/components/domain/dispatch/LiveFleetMap.tsx', maxLines: 1350 },
    { relPath: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', maxLines: 900 },
    { relPath: 'app/components/domain/dispatch/DispatchBookingEngine.tsx', maxLines: 1800 },
    { relPath: 'app/components/domain/admin/AdminRulesTab.tsx', maxLines: 1350 },
  ];

  for (const { relPath, maxLines } of lineBudgets) {
    const abs = path.join(rootDir, relPath);
    const count = fs.readFileSync(abs, 'utf8').split(/\r?\n/).length;
    assert.ok(
      count < maxLines,
      `${relPath} exceeded line budget (${count} >= ${maxLines})`
    );
  }

  // Verify guest-manage-ride.server.ts writes strictly toFirestoreClientRuleProjection to /tripTracking
  const guestServerSource = fs.readFileSync(
    path.join(rootDir, 'app/core/services/tracking/guest-manage-ride.server.ts'),
    'utf8'
  );
  assert.ok(
    guestServerSource.includes('toFirestoreClientRuleProjection(rawProjection)'),
    'guest-manage-ride.server.ts must persist strictly 18-key toFirestoreClientRuleProjection to /tripTracking so client SDK merges never fail firestore.rules'
  );

  // Verify Phase 56.B Dispatch UX Polish invariants (4-state dropdown, universal TripActionDropdown, z-index hierarchy)
  const confirmModalSource = fs.readFileSync(
    path.join(rootDir, 'app/components/ui/ConfirmationModal.tsx'),
    'utf8'
  );
  assert.ok(
    confirmModalSource.includes('zIndex = 150'),
    'ConfirmationModal.tsx must default zIndex to 150 above Trip Details & Audit (120)'
  );
  for (const universalSurface of [
    'app/components/domain/dispatch/DriverQueueWindow.tsx',
    'app/components/domain/dispatch/workspace/DispatchLeftBookingSidebar.tsx',
    'app/components/domain/dispatch/DispatchTripDetailsDrawer.tsx',
  ]) {
    const surfaceSrc = fs.readFileSync(path.join(rootDir, universalSurface), 'utf8');
    assert.ok(
      surfaceSrc.includes('TripActionDropdown'),
      `${universalSurface} must mount TripActionDropdown for universal lifecycle actions`
    );
  }

  // Verify `api.track.ts` only exports `loader` and `action` (resource route -> 0.00 kB client chunk)
  const apiTrackSource = fs.readFileSync(path.join(rootDir, 'app/routes/api.track.ts'), 'utf8');
  assert.equal(
    /export\s+default\s+/.test(apiTrackSource),
    false,
    'app/routes/api.track.ts must NOT export a default client component'
  );
  assert.equal(
    /clientLoader|clientAction/.test(apiTrackSource),
    false,
    'app/routes/api.track.ts must NOT export clientLoader or clientAction'
  );

  // If `build/client/assets` exists, verify any `api.track-*.js` client chunk is 0 bytes / empty
  const clientAssetsDir = path.join(rootDir, 'build', 'client', 'assets');
  if (fs.existsSync(clientAssetsDir)) {
    const apiTrackChunks = fs
      .readdirSync(clientAssetsDir)
      .filter((f) => /^api\.track-.*\.js$/i.test(f));
    for (const chunkName of apiTrackChunks) {
      const chunkPath = path.join(clientAssetsDir, chunkName);
      const chunkBytes = fs.statSync(chunkPath).size;
      const chunkTrimmed = fs.readFileSync(chunkPath, 'utf8').trim();
      assert.equal(
        chunkTrimmed.length,
        0,
        `Client chunk ${chunkName} must contain zero client JS code (found ${chunkBytes} bytes: ${chunkTrimmed.slice(0, 80)})`
      );
      assert.equal(
        (chunkBytes / 1024).toFixed(2),
        '0.00',
        `Client chunk ${chunkName} must be 0.00 kB (found ${chunkBytes} bytes)`
      );
    }
  }

  // Verify zero `"HUD Now"` (in executable/UI strings) and zero `'[Avail]'` / `'[En Route]'` / `'[Busy]'` / `'[Break]'` / `'[Off]'` in `app/`
  const allAppFiles = collectFilesRecursively(path.join(rootDir, 'app'), /\.(ts|tsx)$/);
  const forbiddenBracketTokens = [
    '[Avail]',
    '[En Route]',
    '[Busy]',
    '[Break]',
    '[Off]',
  ];
  for (const file of allAppFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(rootDir, file);
    for (const token of forbiddenBracketTokens) {
      assert.equal(
        content.includes(token),
        false,
        `Forbidden string "${token}" found in ${relPath}`
      );
    }
    const strippedComments = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.equal(
      /HUD\s+Now/i.test(strippedComments),
      false,
      `Forbidden "HUD Now" wording found in ${relPath}`
    );
  }

  // Verify 10-column table invariant in TripQueueTableView.tsx
  const tableSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  const thCount = (tableSource.match(/<th\b/g) || []).length;
  assert.equal(thCount, 10, `TripQueueTableView.tsx must preserve 10 <th> columns, got ${thCount}`);
  assert.ok(
    tableSource.includes('min-w-[900px]'),
    'TripQueueTableView.tsx must preserve min-w-[900px]'
  );
  assert.ok(
    tableSource.includes('📝 Rider Edit Req'),
    'TripQueueTableView.tsx must render 📝 Rider Edit Req pill'
  );

  const cardsSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx'),
    'utf8'
  );
  assert.ok(
    cardsSource.includes('📝 Rider Edit Req'),
    'TripQueueCardsGrid.tsx must render 📝 Rider Edit Req pill'
  );

  const drawerSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/drawer/TripDrawerOverviewSection.tsx'),
    'utf8'
  );
  assert.ok(
    drawerSource.includes('Approve &amp; Notify Driver') ||
      drawerSource.includes('Approve & Notify Driver'),
    'TripDrawerOverviewSection.tsx must render 1-tap Approve & Notify Driver button'
  );

  console.log('   ✓ All static, bundle-isolation & monolith line-budget guardrails passed!\n');
  console.log('✅ Phase 56 Self-Service Guest "Manage My Ride" Suite: ALL CHECKS PASSED!');
}

runTests().catch((err) => {
  console.error('\n❌ Phase 56 Verification Suite FAILED:', err);
  process.exit(1);
});
