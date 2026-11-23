/**
 * Automated Verification Suite — Platform Phase 55 (Wave 4 Phase 6)
 * Assigned-Trip Edit Preservation, Driver Update Notification + Acknowledgement Loop
 * & Modern Portal-Anchored `DriverAssignDropdown` UI
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { Trip, TripStatus } from '../app/core/types/trip';
import {
  buildAcknowledgeTripUpdatePatch,
  buildPendingDriverUpdateAck,
  computeAssignedTripEditDiff,
  getPendingDriverUpdateAck,
  hasAcknowledgedDriverUpdate,
  hasUnacknowledgedDriverUpdate,
  resolveAssignedTripEditPreservation,
} from '../app/core/services/dispatch/trip-update-ack.service';
import { formatDriverTripUpdatedPayload } from '../app/core/services/notifications/push-notification.service';
import {
  applySavedDraftOverlayToDispatchState,
  hydrateInitialTripIntoDispatchState,
  type DispatchHydrationSetters,
} from '../app/components/domain/dispatch/booking/useDispatchBookingSubmission';
import {
  extractDriverCabAndName,
  resolveDriverStatusVisual,
} from '../app/components/domain/dispatch/queue/DriverAssignDropdown';

function createSampleAssignedTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-phase55-1001',
    status: 'accepted',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-947',
    pickupLocation: {
      address: '16401 Swingley Ridge Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6631, lng: -90.5771 },
      notes: 'Lobby entrance',
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    intermediateStops: [],
    driverNotes: 'Lobby entrance',
    flightNotes: '[Flight: Delta #DL1492]',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-12-10T21:00:00.000Z',
    passenger: {
      firstName: 'Elena',
      lastName: 'Vance',
      email: 'elena@example.com',
      phone: '(314) 555-0192',
      passengerCount: 2,
      luggageCount: 2,
      specialRequests: 'Quiet Ride',
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 48,
      distanceMiles: 19.4,
      durationMinutes: 24,
      distanceRate: 2.2,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 48,
      totalFare: 48,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 48,
    },
    statusHistory: [
      {
        from: null,
        to: 'CONFIRMED',
        timestamp: '2026-12-10T18:00:00.000Z',
        actorRole: 'admin',
      },
      {
        from: 'CONFIRMED',
        to: 'assigned',
        timestamp: '2026-12-10T18:05:00.000Z',
        actorRole: 'admin',
      },
      {
        from: 'assigned',
        to: 'accepted',
        timestamp: '2026-12-10T18:06:00.000Z',
        actorId: 'drv-947',
        actorRole: 'driver',
      },
    ],
    auditLog: [],
    createdAt: '2026-12-10T18:00:00.000Z',
    updatedAt: '2026-12-10T18:06:00.000Z',
    metadata: {
      assignedDriverName: 'Zakharya Rakhmanov',
      assignedDriverPhone: '(314) 915-1800',
      airline: 'Delta',
      flightNumber: 'DL1492',
      gateCode: '#4410',
      internalNotes: 'VIP corporate account',
    },
    ...overrides,
  };
}

function createMockHydrationHarness(): {
  state: Record<string, any>;
  setters: DispatchHydrationSetters;
} {
  const state: Record<string, any> = {
    driverId: 'unassigned',
    driverAssignmentMode: 'send_to_driver',
  };
  const noop = () => {};
  const setters: DispatchHydrationSetters = {
    setTimingType: (v) => (state.timingType = v),
    setScheduledDate: (v) => (state.scheduledDate = v),
    setScheduledTime: (v) => (state.scheduledTime = v),
    setPickupAddress: (v) => (state.pickupAddress = v),
    setPickupCoordinates: noop,
    setPickupPlaceId: noop,
    setDropoffAddress: (v) => (state.dropoffAddress = v),
    setDropoffCoordinates: noop,
    setDropoffPlaceId: noop,
    setIntermediateStops: (v) => (state.intermediateStops = v),
    setPassengerName: (v) => (state.passengerName = v),
    setPhone: (v) => (state.phone = v),
    setEmail: (v) => (state.email = v),
    setAdditionalPassengers: noop,
    setIsBookerDifferent: noop,
    setContactName: noop,
    setContactPhone: noop,
    setContactEmail: noop,
    setContactRole: noop,
    setPassengers: (v) => (state.passengers = v),
    setCarryOnBags: noop,
    setCheckedBags: noop,
    setBags: (v) => (state.bags = v),
    setHasOversizedLuggage: noop,
    setOversizedBags: noop,
    setOversizedLuggageNotes: noop,
    setShowSpecialRequests: noop,
    setSpecialRequestFlags: noop,
    setGateCode: (v) => (state.gateCode = v),
    setSelectedCustomExtras: noop,
    setCarSeats: noop,
    setRearFacingCount: noop,
    setFrontFacingCount: noop,
    setBoosterCount: noop,
    setSelectedVehicles: noop,
    setPaymentMethod: noop,
    setCardPaymentType: noop,
    setCardholderName: noop,
    setCardNumber: noop,
    setCardExp: noop,
    setCorporateAccount: noop,
    setBillingPo: noop,
    setAuthorizedBy: noop,
    setInvoicingTerms: noop,
    setSendEmailConfirmation: noop,
    setTariff: noop,
    setSelectedRuleId: noop,
    setDiscount: noop,
    setManualDiscountDollars: noop,
    setWaiveAirportFee: noop,
    setWaiveMultiStopFees: noop,
    setBypassSurge: noop,
    setCompany: noop,
    setDriverId: (v) => (state.driverId = v),
    setDriverAssignmentMode: (v) => (state.driverAssignmentMode = v),
    setNotesForAll: (v) => (state.notesForAll = v),
    setInternalNotes: (v) => (state.internalNotes = v),
    setReturnTrip: noop,
    setReturnPickupAddress: noop,
    setReturnPickupCoordinates: noop,
    setReturnDropoffAddress: noop,
    setReturnDropoffCoordinates: noop,
    setReturnIntermediateStops: noop,
    setReturnDate: noop,
    setReturnTime: noop,
    setReturnPassengers: noop,
    setReturnCarryOnBags: noop,
    setReturnCheckedBags: noop,
    setReturnBags: noop,
    setReturnHasOversizedLuggage: noop,
    setReturnOversizedBags: noop,
    setReturnOversizedLuggageNotes: noop,
    setReturnCarSeats: noop,
    setReturnRearFacing: noop,
    setReturnFrontFacing: noop,
    setReturnBooster: noop,
    setReturnVehicles: noop,
    setAutoCreateReturnTrip: noop,
    setRepeat: noop,
    setRepeatFrequency: noop,
    setRepeatDays: noop,
    setRepeatOccurrences: noop,
    setRepeatUntilDate: noop,
    setRepeatWeeksPattern: noop,
    setRepeatSkipDates: noop,
    setEstimatedFare: noop,
    setReturnEstimatedFare: noop,
    setManualFare: noop,
    setIsFareOverridden: noop,
    setOutboundPricing: noop,
    setEstimatedDistanceMiles: noop,
    setEstimatedDurationMinutes: noop,
    setProvideFlightInfo: noop,
    setAirline: noop,
    setFlightNumber: noop,
    setFlightOrigin: noop,
    setTailNumber: noop,
    setFboFacility: noop,
    setHasCheckedLuggage: noop,
    setOutboundFlightTelemetry: noop,
    setReturnProvideFlightInfo: noop,
    setReturnAirline: noop,
    setReturnFlightNumber: noop,
    setReturnFlightOrigin: noop,
    setReturnTailNumber: noop,
    setReturnFboFacility: noop,
    setReturnHasCheckedLuggage: noop,
  };
  return { state, setters };
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

async function main() {
  console.log('🚀 Running Phase 55 Verification Suite (Assigned-Trip Edit Preservation, Driver Ack Loop & DriverAssignDropdown)...\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Assigned-Trip Edit Preservation & Stale localStorage Draft Guard
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Verifying Assigned-Trip Edit Preservation across active lifecycle states & stale draft overlays...');

  const activeStatuses: TripStatus[] = [
    'assigned',
    'accepted',
    'en_route',
    'arrived',
    'in_progress',
  ];

  for (const activeStatus of activeStatuses) {
    const trip = createSampleAssignedTrip({ status: activeStatus, assignedDriverId: 'drv-947' });

    // Even if formDriverId was stale 'unassigned' or mode was 'stage_hold', without explicit user change it MUST preserve!
    const preserved = resolveAssignedTripEditPreservation({
      initialTrip: trip,
      formDriverId: 'unassigned',
      driverAssignmentMode: 'stage_hold',
      driverExplicitlyChangedByUser: false,
    });

    assert.equal(
      preserved.assignedDriverId,
      'drv-947',
      `Must preserve assignedDriverId on ${activeStatus} edit`
    );
    assert.equal(
      preserved.status,
      activeStatus,
      `Must preserve active lifecycle status '${activeStatus}' on edit`
    );
    assert.equal(preserved.isStagingSelectedDriver, false);
    assert.equal(preserved.retainedSameAssignedDriver, true);
    assert.equal(preserved.shouldClearPendingUpdateAck, false);
  }

  // Verify hydration + stale localStorage draft overlay guard
  {
    const assignedTrip = createSampleAssignedTrip({ status: 'en_route', assignedDriverId: 'drv-947' });
    const { state, setters } = createMockHydrationHarness();
    const explicitRef = { current: false };

    hydrateInitialTripIntoDispatchState(assignedTrip, setters, {
      vehicleCapacities: { standard: { maxPassengers: 4, maxBags: 3 } },
      dispatchVehicleOptions: [{ key: 'standard', label: 'Sedan', maxPassengers: 4, maxBags: 3 }],
    });
    assert.equal(state.driverId, 'drv-947');
    assert.equal(state.driverAssignmentMode, 'send_to_driver');

    // Stale pre-assignment localStorage draft has driverId: 'unassigned' and driverAssignmentMode: 'stage_hold'
    applySavedDraftOverlayToDispatchState(
      {
        _editTripId: assignedTrip.id,
        driverId: 'unassigned',
        driverAssignmentMode: 'stage_hold',
        notesForAll: 'Updated curb note',
      },
      setters,
      undefined,
      { initialTrip: assignedTrip, driverExplicitlyChangedByUserRef: explicitRef }
    );
    assert.equal(
      state.driverId,
      'drv-947',
      'Stale localStorage unassigned overlay MUST NOT overwrite live initialTrip.assignedDriverId'
    );
    assert.equal(
      state.driverAssignmentMode,
      'send_to_driver',
      'Stale localStorage stage_hold overlay MUST NOT overwrite send_to_driver on assigned trip'
    );
    assert.equal(explicitRef.current, false);

    // Explicit unassign in saved draft (_explicitlyUnassigned: true) IS honored
    applySavedDraftOverlayToDispatchState(
      {
        _editTripId: assignedTrip.id,
        driverId: 'unassigned',
        _explicitlyUnassigned: true,
      },
      setters,
      undefined,
      { initialTrip: assignedTrip, driverExplicitlyChangedByUserRef: explicitRef }
    );
    assert.equal(state.driverId, 'unassigned');
    assert.equal(explicitRef.current, true);
  }

  // Explicit dispatcher unassignment cleanly unassigns and reverts active status to CONFIRMED
  {
    const acceptedTrip = createSampleAssignedTrip({ status: 'accepted', assignedDriverId: 'drv-947' });
    const unassignedRes = resolveAssignedTripEditPreservation({
      initialTrip: acceptedTrip,
      formDriverId: 'unassigned',
      driverAssignmentMode: 'send_to_driver',
      driverExplicitlyChangedByUser: true,
    });
    assert.equal(unassignedRes.assignedDriverId, null);
    assert.equal(unassignedRes.status, 'CONFIRMED');
    assert.equal(unassignedRes.retainedSameAssignedDriver, false);
    assert.equal(unassignedRes.shouldClearPendingUpdateAck, true);
  }

  // Explicit dispatcher reassignment (drv-947 -> drv-982) assigns new driver cleanly & clears stale ack
  {
    const acceptedTrip = createSampleAssignedTrip({ status: 'accepted', assignedDriverId: 'drv-947' });
    const reassignedRes = resolveAssignedTripEditPreservation({
      initialTrip: acceptedTrip,
      formDriverId: 'drv-982',
      driverAssignmentMode: 'send_to_driver',
      driverExplicitlyChangedByUser: true,
    });
    assert.equal(reassignedRes.assignedDriverId, 'drv-982');
    assert.equal(reassignedRes.status, 'assigned');
    assert.equal(reassignedRes.retainedSameAssignedDriver, false);
    assert.equal(reassignedRes.shouldClearPendingUpdateAck, true);
  }

  console.log('   ✅ Assigned-trip edit preservation & stale draft overlay guard verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. computeAssignedTripEditDiff Accuracy & No-Op Save Behavior
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Verifying computeAssignedTripEditDiff across operational fields & no-op saves...');

  const baseTrip = createSampleAssignedTrip();

  // No-op save (including dispatch-only internalNotes modification) -> empty array []
  const noOpDiff = computeAssignedTripEditDiff(baseTrip, {
    pickupLocation: { ...baseTrip.pickupLocation },
    dropoffLocation: { ...baseTrip.dropoffLocation },
    intermediateStops: [],
    passenger: { ...baseTrip.passenger },
    vehicleTier: baseTrip.vehicleTier,
    bookingType: baseTrip.bookingType,
    scheduledPickupTime: baseTrip.scheduledPickupTime,
    driverNotes: baseTrip.driverNotes,
    flightNotes: baseTrip.flightNotes,
    pricing: { ...baseTrip.pricing },
    metadata: {
      ...baseTrip.metadata,
      internalNotes: 'Dispatcher-only private billing note changed',
    },
  });
  assert.deepEqual(noOpDiff, [], 'No-op / internalNotes-only edit must produce [] diff');

  // Multi-field operational modification
  const multiDiff = computeAssignedTripEditDiff(baseTrip, {
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-12-10T21:30:00.000Z',
    pickupLocation: {
      address: '400 S Woods Mill Rd, Chesterfield, MO 63017',
      notes: 'Valet circle by East Entrance',
    },
    intermediateStops: [{ address: '291 Chesterfield Mall, Chesterfield, MO 63017' }],
    dropoffLocation: {
      address: 'Terminal 2 Departures, St. Louis Lambert Airport',
    },
    passenger: {
      ...baseTrip.passenger,
      passengerCount: 4,
      luggageCount: 5,
      specialRequests: 'Quiet Ride, Car Seats: 1 Booster',
    },
    vehicleTier: 'xl',
    pricing: {
      ...baseTrip.pricing,
      totalFare: 76.5,
    },
    driverNotes: 'Valet circle by East Entrance',
    flightNotes: '[Flight: Southwest #WN408]',
    metadata: {
      ...baseTrip.metadata,
      airline: 'Southwest',
      flightNumber: 'WN408',
      gateCode: '#9921',
    },
  });

  assert.ok(multiDiff.some((d) => d.startsWith('Pickup time:')), 'Must detect pickup time change');
  assert.ok(multiDiff.some((d) => d.startsWith('Pickup:')), 'Must detect pickup address change');
  assert.ok(
    multiDiff.some((d) => d.includes('Added Stop #1') && d.includes('Chesterfield Mall')),
    'Must detect added intermediate stop'
  );
  assert.ok(multiDiff.some((d) => d.startsWith('Dropoff:')), 'Must detect dropoff address change');
  assert.ok(multiDiff.includes('Passengers: 2 → 4'), 'Must detect passenger count change');
  assert.ok(multiDiff.includes('Luggage: 2 → 5 bags'), 'Must detect luggage count change');
  assert.ok(multiDiff.some((d) => d.startsWith('Vehicle tier:')), 'Must detect vehicle tier change');
  assert.ok(multiDiff.includes('Fare: $48.00 → $76.50'), 'Must detect fare change');
  assert.ok(multiDiff.some((d) => d.startsWith('Notes:')), 'Must detect driver notes change');
  assert.ok(
    multiDiff.some((d) => d.startsWith('Special requests:')),
    'Must detect specialRequests change'
  );
  assert.ok(multiDiff.includes('Gate code: #9921'), 'Must detect gate code change');
  assert.ok(
    multiDiff.some((d) => d.startsWith('Flight:') && d.includes('WN408')),
    'Must detect flight number/airline change'
  );

  console.log('   ✅ computeAssignedTripEditDiff verified across all operational fields.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PendingDriverUpdateAck Lifecycle & Push Notification Payload
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Verifying PendingDriverUpdateAck lifecycle & driver push notification payload...');

  const ackNowMs = 1796937000000;
  const pendingAck = buildPendingDriverUpdateAck({
    before: baseTrip,
    after: {
      scheduledPickupTime: '2026-12-10T21:45:00.000Z',
      intermediateStops: [{ address: 'Chesterfield Commons, Chesterfield, MO' }],
    },
    updatedBy: 'dispatch@chesterfieldtaxi.com',
    source: 'dispatch_edit',
    nowMs: ackNowMs,
  });

  assert.ok(pendingAck, 'buildPendingDriverUpdateAck must return non-null ack when operational fields change');
  assert.ok(pendingAck.revisionId.startsWith(`upd_${ackNowMs}_`));
  assert.equal(pendingAck.requiresAck, true);
  assert.equal(pendingAck.acknowledgedAt, null);
  assert.equal(pendingAck.updatedBy, 'dispatch@chesterfieldtaxi.com');
  assert.equal(pendingAck.source, 'dispatch_edit');
  assert.equal(pendingAck.changesSummary.length, 2);

  // Returns null on terminal trips or unassigned trips
  assert.equal(
    buildPendingDriverUpdateAck({
      before: createSampleAssignedTrip({ status: 'completed' }),
      after: { driverNotes: 'Changed after completion' },
      updatedBy: 'dispatch@chesterfieldtaxi.com',
    }),
    null,
    'Completed trips must not emit PendingDriverUpdateAck'
  );
  assert.equal(
    buildPendingDriverUpdateAck({
      before: createSampleAssignedTrip({ assignedDriverId: null, status: 'CONFIRMED' }),
      after: { driverNotes: 'Changed while unassigned' },
      updatedBy: 'dispatch@chesterfieldtaxi.com',
    }),
    null,
    'Unassigned trips must not emit PendingDriverUpdateAck'
  );

  const tripWithPendingAck: Trip = {
    ...baseTrip,
    metadata: {
      ...baseTrip.metadata,
      pendingDriverUpdateAck: pendingAck,
    },
  };

  assert.equal(hasUnacknowledgedDriverUpdate(tripWithPendingAck), true);
  assert.equal(hasAcknowledgedDriverUpdate(tripWithPendingAck), false);

  // Verify push notification payload
  const pushPayload = formatDriverTripUpdatedPayload(tripWithPendingAck, pendingAck);
  assert.equal(
    pushPayload.tag,
    `ct-driver-trip-update-${tripWithPendingAck.id}-${pendingAck.revisionId}`
  );
  assert.equal(pushPayload.requireInteraction, true);
  assert.equal(pushPayload.url, '/app/driver');
  assert.ok(pushPayload.title.includes('Elena Vance'));
  assert.ok(pushPayload.body.includes('Chesterfield Commons'));

  // Driver acknowledges update
  const ackIso = '2026-12-10T18:20:00.000Z';
  const ackPatch = buildAcknowledgeTripUpdatePatch(tripWithPendingAck, 'drv-947', ackIso);

  // Verify Firestore security rules compliance: only allowed driver fields ('metadata', 'auditLog', 'updatedAt')
  const patchedKeys = Object.keys(ackPatch).sort();
  assert.deepEqual(
    patchedKeys,
    ['auditLog', 'metadata', 'updatedAt'],
    'Driver ack patch must touch strictly metadata, auditLog, and updatedAt for firestore.rules compatibility'
  );

  const acknowledgedTrip: Trip = {
    ...tripWithPendingAck,
    ...ackPatch,
  };
  assert.equal(hasUnacknowledgedDriverUpdate(acknowledgedTrip), false);
  assert.equal(hasAcknowledgedDriverUpdate(acknowledgedTrip), true);

  const resolvedAckAfter = getPendingDriverUpdateAck(acknowledgedTrip);
  assert.equal(resolvedAckAfter?.requiresAck, false);
  assert.equal(resolvedAckAfter?.acknowledgedAt, ackIso);
  assert.equal(resolvedAckAfter?.acknowledgedByDriverId, 'drv-947');
  assert.equal(acknowledgedTrip.auditLog?.length, 1);
  assert.equal(acknowledgedTrip.auditLog?.[0]?.action, 'STATUS_CHANGED');
  assert.equal(acknowledgedTrip.auditLog?.[0]?.actorRole, 'driver');
  assert.ok(
    acknowledgedTrip.auditLog?.[0]?.context?.includes('Driver acknowledged dispatch trip update')
  );

  console.log('   ✅ PendingDriverUpdateAck lifecycle & notification payload verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. DriverAssignDropdown Visual Status Mapping & Label Extraction
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Verifying DriverAssignDropdown status circles & label helpers...');

  const availVisual = resolveDriverStatusVisual({
    id: 'd1',
    mapStatus: 'available',
    cabNumber: '947',
    name: 'Zakharya Rakhmanov',
  });
  assert.equal(availVisual.label, 'Available');
  assert.ok(availVisual.dotClass.includes('bg-emerald-500'));

  const enRouteVisual = resolveDriverStatusVisual({ id: 'd2', mapStatus: 'en_route' });
  assert.equal(enRouteVisual.label, 'En Route');
  assert.ok(enRouteVisual.dotClass.includes('bg-blue-500'));

  const busyVisual = resolveDriverStatusVisual({ id: 'd3', mapStatus: 'busy' });
  assert.equal(busyVisual.label, 'Busy');
  assert.ok(busyVisual.dotClass.includes('bg-rose-500'));

  const breakVisual = resolveDriverStatusVisual({ id: 'd4', mapStatus: 'break' });
  assert.equal(breakVisual.label, 'Break');
  assert.ok(breakVisual.dotClass.includes('bg-amber-500'));

  const offVisual = resolveDriverStatusVisual({ id: 'd5', mapStatus: 'offline' });
  assert.equal(offVisual.label, 'Offline');
  assert.ok(offVisual.dotClass.includes('bg-slate-400'));

  const parsedDriver = extractDriverCabAndName({
    id: 'd1',
    firstName: 'Zakharya',
    lastName: 'Rakhmanov',
    cabNumber: '947',
    vehicle: 'Car #947 SUV',
    zone: 'Chesterfield',
  });
  assert.equal(parsedDriver.cabBadge, '#947');
  assert.equal(parsedDriver.displayName, 'Zakharya Rakhmanov');
  assert.equal(parsedDriver.triggerLabel, '#947 · Zakharya');

  console.log('   ✅ DriverAssignDropdown status circles & label helpers verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Static Source, Zero Bracket Strings, Portal Wiring & Line Budget Guardrails
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Auditing static guardrails, zero bracket strings, portal dropdown wiring & line budgets...');

  const rootDir = process.cwd();
  const appFiles = collectFilesRecursively(path.join(rootDir, 'app'), /\.(ts|tsx)$/);
  assert.ok(appFiles.length > 50, 'Expected to scan app/ TypeScript source files');

  const forbiddenBracketTokens = ['[Avail]', '[En Route]', '[Busy]', '[Break]', '[Off]'];

  for (const filePath of appFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(rootDir, filePath);

    for (const token of forbiddenBracketTokens) {
      assert.ok(
        !content.includes(token),
        `Forbidden legacy bracket status string "${token}" found in ${relPath}`
      );
    }

    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.ok(
      !/HUD\s+Now/i.test(stripped),
      `Forbidden "HUD Now" wording found in ${relPath}`
    );
  }

  // Verify DriverAssignDropdown uses createPortal + bg-emerald-500
  const dropdownSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/DriverAssignDropdown.tsx'),
    'utf8'
  );
  assert.ok(dropdownSrc.includes('createPortal'), 'DriverAssignDropdown.tsx must use createPortal');
  assert.ok(
    dropdownSrc.includes('bg-emerald-500'),
    'DriverAssignDropdown.tsx must render bg-emerald-500 status dots'
  );

  // Verify DriverAssignDropdown is wired into all 5 required consumers
  const requiredDropdownConsumers = [
    'app/components/domain/dispatch/queue/TripQueueTableView.tsx',
    'app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx',
    'app/components/domain/dispatch/queue/TripQueueCompactList.tsx',
    'app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx',
    'app/components/domain/dispatch/StandingOrdersDrawer.tsx',
  ];
  for (const consumerRel of requiredDropdownConsumers) {
    const src = fs.readFileSync(path.join(rootDir, consumerRel), 'utf8');
    assert.ok(
      src.includes('DriverAssignDropdown'),
      `${consumerRel} must wire DriverAssignDropdown`
    );
  }

  // Verify DispatchLeftBookingSidebar passes liveTrip
  const leftSidebarSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/workspace/DispatchLeftBookingSidebar.tsx'),
    'utf8'
  );
  assert.ok(
    leftSidebarSrc.includes('trip={liveTrip}'),
    'DispatchLeftBookingSidebar.tsx must pass liveTrip into MemoizedDraftBookingPane'
  );

  // Verify TripQueueTableView invariants: exact 10 <th> columns, min-w-[900px], title="Send to Driver"
  const tableViewSrc = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx'),
    'utf8'
  );
  const thCount = (tableViewSrc.match(/<th\b/g) || []).length;
  assert.equal(thCount, 10, `TripQueueTableView.tsx must keep exact 10 <th> columns, got ${thCount}`);
  assert.ok(
    tableViewSrc.includes('min-w-[900px]'),
    'TripQueueTableView.tsx must preserve min-w-[900px]'
  );
  assert.ok(
    tableViewSrc.includes('title="Send to Driver"'),
    'TripQueueTableView.tsx must preserve title="Send to Driver"'
  );

  // Verify untouched firestore.rules & vercel.json
  const gitPorcelain = execSync('git status --porcelain -- firestore.rules vercel.json', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitPorcelain,
    '',
    `firestore.rules and vercel.json must remain untouched! Got: ${gitPorcelain}`
  );

  // Verify strict monolith line-count budgets
  const lineBudgets: Array<{ rel: string; max: number }> = [
    { rel: 'app/routes/dispatch.tsx', max: 1600 },
    { rel: 'app/routes/driver.tsx', max: 1900 },
    { rel: 'app/components/domain/driver/DriverLiveMeterCard.tsx', max: 1080 },
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

  console.log('\n🎉 ALL PHASE 55 ASSIGNED-TRIP EDIT PRESERVATION, DRIVER ACK & DROPDOWN TESTS PASSED! ✅');
}

main().catch((err) => {
  console.error('\n💥 Phase 55 verification suite failed:', err);
  process.exit(1);
});
