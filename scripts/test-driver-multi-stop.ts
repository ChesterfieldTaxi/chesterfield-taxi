import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Trip } from '../app/core/types/trip';
import {
  buildMultiStopNavigationUrl,
  buildSinglePointNavigationUrl,
  formatNavTarget,
  isTripQuotedLocked,
  splitDriverExtras,
} from '../app/core/utils/driver-ui.util';
import {
  appendDriverExtraToTripPricing,
  buildArriveAtStopUpdate,
  buildCompleteStopUpdate,
  buildResetStopToPendingUpdate,
  buildSkipStopUpdate,
  buildStopWaitDriverExtra,
  computeStopWaitTimerState,
  normalizeTripStopProgress,
  summarizeTripStopProgress,
} from '../app/core/services/driver/driver-stop-progress';

function buildSampleMultiStopTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_phase53_01',
    status: 'assigned',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-23T15:00:00.000Z',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-101',
    pickupLocation: {
      address: '14848 Conway Rd, Chesterfield, MO 63017',
      coordinates: { lat: 38.6531, lng: -90.5341 },
      driverNotes: 'Main lobby',
    },
    intermediateStops: [
      {
        address: 'Chesterfield Mall, 291 Chesterfield Center, Chesterfield, MO 63017',
        coordinates: { lat: 38.6535, lng: -90.5612 },
        notes: 'Wait by pharmacy entrance',
      },
      {
        address: 'Mercy Hospital St. Louis, 615 S New Ballas Rd, St. Louis, MO 63141',
        coordinates: { lat: 38.6442, lng: -90.4437 },
      },
    ],
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
      driverNotes: 'Terminal 2 Departures',
    },
    passenger: {
      firstName: 'Marcus',
      lastName: 'Holloway',
      email: 'marcus@example.com',
      phone: '(314) 555-0148',
      passengerCount: 2,
      luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 15,
      distanceMiles: 23.8,
      durationMinutes: 38,
      distanceRate: 2.5,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 78.5,
      totalFare: 78.5,
      currency: 'USD',
      intermediateStopsCount: 2,
      multiStopSurcharge: 10,
      breakdown: [
        { id: 'base-fare', category: 'base', label: 'Base Fare', amount: 68.5 },
        { id: 'stops-fee', category: 'extra', label: '2 Intermediate Stops', amount: 10 },
      ],
    },
    payment: {
      method: 'card',
      status: 'authorized',
      amount: 78.5,
    },
    statusHistory: [],
    createdAt: '2026-11-23T12:00:00.000Z',
    updatedAt: '2026-11-23T12:00:00.000Z',
    ...overrides,
  };
}

function collectAppFiles(dirPath: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectAppFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx|md|json)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  console.log('=== Phase 53: Driver Multi-Stop Progression, Waypoints Nav & Free-Wait Timer Suite ===');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. formatNavTarget & buildSinglePointNavigationUrl (SSR-safe, no window)
  // ───────────────────────────────────────────────────────────────────────────
  assert.equal(
    formatNavTarget(' 14848 Conway Rd ', { lat: 38.6531, lng: -90.5341 }),
    '38.6531,-90.5341',
    'formatNavTarget must prefer finite lat,lng coordinates over raw address'
  );
  assert.equal(
    formatNavTarget('  14848 Conway Rd, Chesterfield, MO  ', { lat: Number.NaN, lng: -90.5 }),
    '14848 Conway Rd, Chesterfield, MO',
    'formatNavTarget must fall back to trimmed address when coordinates are non-finite'
  );
  assert.equal(formatNavTarget('   ', null), '');

  assert.equal(
    buildSinglePointNavigationUrl('Chesterfield Mall', 'google', { lat: 38.6535, lng: -90.5612 }),
    'https://www.google.com/maps/dir/?api=1&destination=38.6535%2C-90.5612&travelmode=driving'
  );
  assert.equal(
    buildSinglePointNavigationUrl('Chesterfield Mall, MO', 'apple', null),
    'https://maps.apple.com/?daddr=Chesterfield%20Mall%2C%20MO&dirflg=d'
  );
  assert.equal(
    buildSinglePointNavigationUrl('Chesterfield Mall, MO', 'waze', { lat: 38.6535, lng: -90.5612 }),
    'https://waze.com/ul?ll=38.6535%2C-90.5612&navigate=yes'
  );
  assert.equal(
    buildSinglePointNavigationUrl('Chesterfield Mall, MO', 'waze', null),
    'https://waze.com/ul?q=Chesterfield%20Mall%2C%20MO&navigate=yes'
  );
  console.log('✓ 1. formatNavTarget & buildSinglePointNavigationUrl verified across Google/Apple/Waze');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. buildMultiStopNavigationUrl (Coordinates & Raw Addresses across 3 Apps)
  // ───────────────────────────────────────────────────────────────────────────
  const prePickupTrip = buildSampleMultiStopTrip({ status: 'en_route' });
  const googlePrePickup = buildMultiStopNavigationUrl({
    trip: prePickupTrip,
    app: 'google',
  });
  assert.equal(googlePrePickup.mode, 'full_waypoints');
  const expectedPreWaypoints = encodeURIComponent(
    ['38.6531,-90.5341', '38.6535,-90.5612', '38.6442,-90.4437'].join('|')
  );
  assert.equal(
    googlePrePickup.url,
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      '38.7487,-90.37'
    )}&travelmode=driving&waypoints=${expectedPreWaypoints}`,
    'Pre-pickup Google Maps URL must include Pickup + all intermediate stops in &waypoints= and Dropoff as destination'
  );

  // In-progress with 0 completed stops -> Stop #1 | Stop #2 -> Dropoff
  const inProgressTrip = buildSampleMultiStopTrip({ status: 'in_progress' });
  const googleInProgressAllRemaining = buildMultiStopNavigationUrl({
    trip: inProgressTrip,
    app: 'google',
    completedStopIndices: new Set(),
  });
  assert.equal(googleInProgressAllRemaining.mode, 'full_waypoints');
  assert.equal(
    googleInProgressAllRemaining.url,
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      '38.7487,-90.37'
    )}&travelmode=driving&waypoints=${encodeURIComponent('38.6535,-90.5612|38.6442,-90.4437')}`
  );

  // In-progress with Stop #1 completed -> only Stop #2 in &waypoints=
  const googleAfterStop1 = buildMultiStopNavigationUrl({
    trip: inProgressTrip,
    app: 'google',
    completedStopIndices: new Set([0]),
  });
  assert.equal(googleAfterStop1.mode, 'full_waypoints');
  assert.equal(
    googleAfterStop1.url,
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      '38.7487,-90.37'
    )}&travelmode=driving&waypoints=${encodeURIComponent('38.6442,-90.4437')}`
  );

  // In-progress with all stops completed -> direct to destination without &waypoints=
  const googleAllDone = buildMultiStopNavigationUrl({
    trip: inProgressTrip,
    app: 'google',
    completedStopIndices: new Set([0, 1]),
  });
  assert.equal(googleAllDone.mode, 'full_waypoints');
  assert.equal(googleAllDone.targetLabel, 'Destination');
  assert.ok(!googleAllDone.url.includes('&waypoints='), 'No &waypoints= param once all stops are completed');
  assert.equal(
    googleAllDone.url,
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      '38.7487,-90.37'
    )}&travelmode=driving`
  );

  // Raw addresses (no coordinates) across Google, Apple, and Waze
  const addressOnlyTrip = buildSampleMultiStopTrip({
    status: 'in_progress',
    pickupLocation: { address: '100 Main St, Chesterfield, MO' },
    intermediateStops: [
      { address: '200 Olive Blvd, Creve Coeur, MO' },
      { address: '300 Forsyth Blvd, Clayton, MO' },
    ],
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO' },
  });

  const googleAddrUrl = buildMultiStopNavigationUrl({
    trip: addressOnlyTrip,
    app: 'google',
    completedStopIndices: new Set([0]),
  });
  assert.equal(
    googleAddrUrl.url,
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      '10701 Lambert International Blvd, St. Louis, MO'
    )}&travelmode=driving&waypoints=${encodeURIComponent('300 Forsyth Blvd, Clayton, MO')}`
  );

  // Apple Maps next-leg progression
  const applePrePickup = buildMultiStopNavigationUrl({ trip: prePickupTrip, app: 'apple' });
  assert.deepEqual(applePrePickup, {
    url: 'https://maps.apple.com/?daddr=38.6531%2C-90.5341&dirflg=d',
    mode: 'next_leg',
    targetLabel: 'Pickup',
  });

  const appleStop1 = buildMultiStopNavigationUrl({
    trip: inProgressTrip,
    app: 'apple',
    completedStopIndices: new Set(),
  });
  assert.deepEqual(appleStop1, {
    url: 'https://maps.apple.com/?daddr=38.6535%2C-90.5612&dirflg=d',
    mode: 'next_leg',
    targetLabel: 'Stop #1',
  });

  const appleStop2Addr = buildMultiStopNavigationUrl({
    trip: addressOnlyTrip,
    app: 'apple',
    completedStopIndices: new Set([0]),
  });
  assert.deepEqual(appleStop2Addr, {
    url: `https://maps.apple.com/?daddr=${encodeURIComponent(
      '300 Forsyth Blvd, Clayton, MO'
    )}&dirflg=d`,
    mode: 'next_leg',
    targetLabel: 'Stop #2',
  });

  const appleFinalDest = buildMultiStopNavigationUrl({
    trip: inProgressTrip,
    app: 'apple',
    completedStopIndices: new Set([0, 1]),
  });
  assert.deepEqual(appleFinalDest, {
    url: 'https://maps.apple.com/?daddr=38.7487%2C-90.37&dirflg=d',
    mode: 'next_leg',
    targetLabel: 'Destination',
  });

  // Waze next-leg progression (coords + raw address)
  const wazePrePickup = buildMultiStopNavigationUrl({ trip: prePickupTrip, app: 'waze' });
  assert.deepEqual(wazePrePickup, {
    url: 'https://waze.com/ul?ll=38.6531%2C-90.5341&navigate=yes',
    mode: 'next_leg',
    targetLabel: 'Pickup',
  });

  const wazeStop1Addr = buildMultiStopNavigationUrl({
    trip: addressOnlyTrip,
    app: 'waze',
    completedStopIndices: new Set(),
  });
  assert.deepEqual(wazeStop1Addr, {
    url: `https://waze.com/ul?q=${encodeURIComponent(
      '200 Olive Blvd, Creve Coeur, MO'
    )}&navigate=yes`,
    mode: 'next_leg',
    targetLabel: 'Stop #1',
  });

  const wazeFinalDest = buildMultiStopNavigationUrl({
    trip: inProgressTrip,
    app: 'waze',
    completedStopIndices: new Set([0, 1]),
  });
  assert.deepEqual(wazeFinalDest, {
    url: 'https://waze.com/ul?ll=38.7487%2C-90.37&navigate=yes',
    mode: 'next_leg',
    targetLabel: 'Destination',
  });
  console.log('✓ 2. buildMultiStopNavigationUrl verified across Google (&waypoints=), Apple Maps, and Waze');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. StopWaitTimer Exact Boundary Math & Custom UniversalExtrasConfig
  // ───────────────────────────────────────────────────────────────────────────
  const arrivedIso = '2026-11-23T15:10:00.000Z';
  const arrivedBaseMs = Date.parse(arrivedIso);
  const sampleArrivedEntry = {
    stopIndex: 0,
    address: 'Chesterfield Mall',
    status: 'arrived' as const,
    arrivedAt: arrivedIso,
  };

  const t0 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs);
  assert.equal(t0.elapsedSeconds, 0);
  assert.equal(t0.remainingFreeSeconds, 300);
  assert.equal(t0.isOverFreeWindow, false);
  assert.equal(t0.excessSeconds, 0);
  assert.equal(t0.excessBillableMinutes, 0);
  assert.equal(t0.suggestedWaitFee, 0);

  const t299 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 299_000);
  assert.equal(t299.elapsedSeconds, 299);
  assert.equal(t299.remainingFreeSeconds, 1);
  assert.equal(t299.isOverFreeWindow, false);
  assert.equal(t299.excessSeconds, 0);
  assert.equal(t299.excessBillableMinutes, 0);
  assert.equal(t299.suggestedWaitFee, 0);

  const t300 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 300_000);
  assert.equal(t300.elapsedSeconds, 300);
  assert.equal(t300.remainingFreeSeconds, 0);
  assert.equal(t300.isOverFreeWindow, false);
  assert.equal(t300.excessSeconds, 0);
  assert.equal(t300.excessBillableMinutes, 0);
  assert.equal(t300.suggestedWaitFee, 0);

  const t301 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 301_000);
  assert.equal(t301.elapsedSeconds, 301);
  assert.equal(t301.remainingFreeSeconds, 0);
  assert.equal(t301.isOverFreeWindow, true);
  assert.equal(t301.excessSeconds, 1);
  assert.equal(t301.excessBillableMinutes, 1);
  assert.equal(t301.suggestedWaitFee, 0.5);

  const t361 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 361_000);
  assert.equal(t361.elapsedSeconds, 361);
  assert.equal(t361.remainingFreeSeconds, 0);
  assert.equal(t361.isOverFreeWindow, true);
  assert.equal(t361.excessSeconds, 61);
  assert.equal(t361.excessBillableMinutes, 2);
  assert.equal(t361.suggestedWaitFee, 1.0);

  // Custom UniversalExtrasConfig: 3m free + $0.75/min
  const customExtras = {
    intermediateStopFreeWaitingMinutes: 3,
    curbWaitingRatePerMinute: 0.75,
  };
  const custom180 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 180_000, customExtras);
  assert.equal(custom180.isOverFreeWindow, false);
  assert.equal(custom180.excessBillableMinutes, 0);
  assert.equal(custom180.suggestedWaitFee, 0);

  const custom181 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 181_000, customExtras);
  assert.equal(custom181.isOverFreeWindow, true);
  assert.equal(custom181.excessBillableMinutes, 1);
  assert.equal(custom181.suggestedWaitFee, 0.75);

  const custom241 = computeStopWaitTimerState(sampleArrivedEntry, arrivedBaseMs + 241_000, customExtras);
  assert.equal(custom241.isOverFreeWindow, true);
  assert.equal(custom241.excessBillableMinutes, 2);
  assert.equal(custom241.suggestedWaitFee, 1.5);
  console.log('✓ 3. computeStopWaitTimerState exact boundary math verified (0s, 299s, 300s, 301s, 361s + custom config)');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Stop Progression Lifecycle, Fare Snapshot Integrity & Idempotency
  // ───────────────────────────────────────────────────────────────────────────
  let workingTrip = buildSampleMultiStopTrip({ status: 'in_progress' });
  assert.equal(isTripQuotedLocked(workingTrip), true);

  const initialSummary = summarizeTripStopProgress(workingTrip);
  assert.equal(initialSummary.totalStops, 2);
  assert.equal(initialSummary.completedCount, 0);
  assert.equal(initialSummary.allStopsCompleted, false);
  assert.equal(initialSummary.nextPendingEntry?.stopIndex, 0);

  // Arrive at Stop #1
  const arrivePatch = buildArriveAtStopUpdate(workingTrip, 0, arrivedIso);
  workingTrip = { ...workingTrip, ...arrivePatch };
  const afterArriveSummary = summarizeTripStopProgress(workingTrip);
  assert.equal(afterArriveSummary.activeArrivedEntry?.stopIndex, 0);
  assert.equal(afterArriveSummary.activeArrivedEntry?.status, 'arrived');

  // Complete Stop #1 at +361s (2m excess -> +$1.00 wait fee)
  const departStop1Iso = new Date(arrivedBaseMs + 361_000).toISOString();
  const complete1 = buildCompleteStopUpdate({
    trip: workingTrip,
    stopIndex: 0,
    nowIso: departStop1Iso,
    applySuggestedWaitFee: true,
  });
  assert.equal(complete1.waitFeeApplied, 1.0);
  assert.equal(complete1.waitFeeExtra?.name, 'Stop #1 Wait (2m past 5m free)');
  assert.equal(complete1.waitFeeExtra?.category, 'custom');

  workingTrip = { ...workingTrip, ...complete1.updates };
  assert.equal(workingTrip.pricing.totalFare, 79.5);
  assert.equal(workingTrip.pricing.driverExtrasTotal, 1.0);
  const breakdownSum = Number(
    (workingTrip.pricing.breakdown || []).reduce((s, li) => s + li.amount, 0).toFixed(2)
  );
  assert.equal(breakdownSum, 79.5, 'Canonical pricing.breakdown sum must equal totalFare');

  // Verify zero double-counting with splitDriverExtras / RideFareSnapshot math
  const splitAfterFee = splitDriverExtras(workingTrip);
  assert.equal(splitAfterFee.nonTollExtrasTotal, 1.0);
  assert.equal(splitAfterFee.allDriverExtrasTotal, 1.0);
  const derivedBaseRideFare = Number(
    (workingTrip.pricing.totalFare - splitAfterFee.allDriverExtrasTotal).toFixed(2)
  );
  assert.equal(derivedBaseRideFare, 78.5, 'Locked base ride fare must stay $78.50 (never double-counted)');

  // Duplicate waitFeeExtraId idempotency check
  const duplicateAttempt = buildCompleteStopUpdate({
    trip: workingTrip,
    stopIndex: 0,
    nowIso: departStop1Iso,
    applySuggestedWaitFee: true,
  });
  assert.equal(duplicateAttempt.waitFeeApplied, 0, 'Repeated completion must not double-bill wait fee');
  const directDupAppend = appendDriverExtraToTripPricing(
    workingTrip,
    buildStopWaitDriverExtra({
      tripId: workingTrip.id,
      stopNumber: 1,
      excessBillableMinutes: 2,
      freeMinutes: 5,
      amount: 1.0,
      nowIso: departStop1Iso,
    })
  );
  assert.equal(directDupAppend.added, false, 'appendDriverExtraToTripPricing must reject duplicate extra.id');

  // Skip Stop #2 -> allStopsCompleted becomes true & navigation routes directly to Destination
  const skip2Patch = buildSkipStopUpdate(workingTrip, 1, departStop1Iso);
  workingTrip = { ...workingTrip, ...skip2Patch };
  const afterSkipSummary = summarizeTripStopProgress(workingTrip);
  assert.equal(afterSkipSummary.completedCount, 2);
  assert.equal(afterSkipSummary.skippedCount, 1);
  assert.equal(afterSkipSummary.allStopsCompleted, true);
  assert.deepEqual([...afterSkipSummary.completedIndicesSet], [0, 1]);

  const autoDerivedNav = buildMultiStopNavigationUrl({ trip: workingTrip, app: 'waze' });
  assert.equal(
    autoDerivedNav.targetLabel,
    'Destination',
    'buildMultiStopNavigationUrl must auto-derive completed/skipped stops from trip.metadata.stopProgress'
  );

  // Undo Stop #1 -> reverses wait-fee extra cleanly back to $78.50
  const reset1Patch = buildResetStopToPendingUpdate(workingTrip, 0);
  workingTrip = { ...workingTrip, ...reset1Patch };
  assert.equal(workingTrip.pricing.totalFare, 78.5);
  assert.equal(workingTrip.pricing.driverExtras?.length ?? 0, 0);
  assert.equal(normalizeTripStopProgress(workingTrip)[0].status, 'pending');
  assert.equal(normalizeTripStopProgress(workingTrip)[0].waitFeeExtraId, undefined);
  console.log('✓ 4. Stop lifecycle, canonical pricing breakdown sync, Undo reversal, and waitFeeExtraId idempotency verified');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Source, Line-Budget & Immutable Infrastructure Guardrails
  // ───────────────────────────────────────────────────────────────────────────
  const rootDir = process.cwd();

  const driverRouteLines = fs
    .readFileSync(path.join(rootDir, 'app/routes/driver.tsx'), 'utf8')
    .split(/\r?\n/).length;
  assert.ok(
    driverRouteLines < 1900,
    `app/routes/driver.tsx must stay < 1900 lines (actual: ${driverRouteLines})`
  );

  const liveMeterLines = fs
    .readFileSync(path.join(rootDir, 'app/components/domain/driver/DriverLiveMeterCard.tsx'), 'utf8')
    .split(/\r?\n/).length;
  assert.ok(
    liveMeterLines < 1080,
    `DriverLiveMeterCard.tsx must stay < 1080 lines (actual: ${liveMeterLines})`
  );

  const offerSheetLines = fs
    .readFileSync(path.join(rootDir, 'app/components/domain/driver/DriverOfferSheet.tsx'), 'utf8')
    .split(/\r?\n/).length;
  assert.ok(
    offerSheetLines < 400,
    `DriverOfferSheet.tsx must stay < 400 lines (actual: ${offerSheetLines})`
  );

  // Zero modifications to firestore.rules and vercel.json
  const modifiedProtected = execSync('git status --porcelain -- firestore.rules vercel.json', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    modifiedProtected,
    '',
    `firestore.rules and vercel.json must remain untouched (git status: "${modifiedProtected}")`
  );

  // Zero "HUD Now" wording anywhere across app/
  const appFiles = collectAppFiles(path.join(rootDir, 'app'));
  const hudNowViolations: string[] = [];
  for (const filePath of appFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    if (/HUD\s+Now/i.test(stripped)) {
      hudNowViolations.push(path.relative(rootDir, filePath));
    }
  }
  assert.deepEqual(
    hudNowViolations,
    [],
    `Forbidden "HUD Now" wording found in: ${hudNowViolations.join(', ')}`
  );

  console.log(
    `✓ 5. Guardrails verified (driver.tsx=${driverRouteLines}L < 1900, DriverLiveMeterCard.tsx=${liveMeterLines}L < 1080, DriverOfferSheet.tsx=${offerSheetLines}L < 400, untouched firestore.rules & vercel.json, zero "HUD Now")`
  );
  console.log('ALL PHASE 53 DRIVER MULTI-STOP & FREE-WAIT TIMER TESTS PASSED! ✅');
}

main();
