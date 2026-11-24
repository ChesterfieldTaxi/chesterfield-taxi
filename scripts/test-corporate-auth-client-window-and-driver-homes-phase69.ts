/**
 * Platform Phase 69 Automated Verification Suite
 * (`scripts/test-corporate-auth-client-window-and-driver-homes-phase69.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  evaluateCorporateCallerVerification,
  formatInheritedCorporateBillingTerms,
  isValidCorporateBookingPin,
  normalizeCorporateBookingPin,
  searchCorporateAccounts,
} from '../app/core/services/corporate-caller-auth.util';
import {
  CLIENT_TRIPS_PAGE_SIZE,
  buildNewTabValuesFromClientTrip,
  paginateClientTrips,
  resolveClientProfileData,
  shouldAutoOpenClientProfileOnCall,
} from '../app/components/domain/dispatch/client-trip-history.util';
import {
  DEFAULT_DISPATCH_MAP_PREFERENCES,
  parseDispatchMapPreferences,
  serializeDispatchMapPreferences,
} from '../app/core/hooks/dispatch/useDispatchMapPreferences';
import {
  buildDriverHomePinDataUrl,
  buildDriverHomesOverlayItems,
  formatDriverShiftScheduleSummary,
} from '../app/components/domain/dispatch/map/driver-homes-overlay.util';
import { Select, extractSelectOptionsFromChildren } from '../app/components/ui/Select';
import { AirportCityCombobox, resolveAirportComboboxFilterQuery } from '../app/components/domain/booking/AirportCityCombobox';
import { searchAirportCatalog } from '../app/core/config/airport-catalog';
import { validateDispatchCorporateSubmission } from '../app/core/hooks/booking/useCorporatePoVerification';
import {
  extractAirportIataCode,
  formatAirportCodeCity,
  resolveAirportDisplayValue,
} from '../app/core/config/airport-catalog';
import {
  DispatchStatusBadge,
  resolveDispatchStatusMeta,
} from '../app/components/domain/dispatch/queue/DispatchStatusBadge';
import type { CorporateAccountConfig, VehicleTierConfig } from '../app/core/types/config';
import type { ContactRecord } from '../app/core/services/customer/contact.service';
import type { LiveFleetDriver } from '../app/core/hooks/useDispatchFleet';
import type { Trip } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();
const readRel = (rel: string): string => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');

function collectFiles(dir: string, extRegex: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, extRegex));
    else if (entry.isFile() && extRegex.test(entry.name)) results.push(full);
  }
  return results;
}

function makeTrip(id: string, overrides: Partial<Trip> = {}): Trip {
  const nowIso = '2026-11-24T18:00:00.000Z';
  return {
    id,
    status: 'completed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-947',
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled',
    scheduledPickupTime: nowIso,
    passenger: {
      firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example',
      phone: '(314) 555-0144', passengerCount: 2, luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 10, distanceMiles: 18.5, durationMinutes: 24, distanceRate: 40, timeRate: 0,
      vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 50, totalFare: 58, currency: 'USD',
    },
    payment: { method: 'corporate', status: 'settled', amount: 58 },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

async function testCorporateCallerVerificationAndNoInvoicingSelector(): Promise<void> {
  console.log('1️⃣  Testing Corporate 4-Signal Caller Verification & Removed Invoicing Terms Selector...');
  assert.equal(normalizeCorporateBookingPin(' bayr-26! '), 'BAYR26');
  assert.equal(isValidCorporateBookingPin('BAYR26'), true);
  assert.equal(isValidCorporateBookingPin('A12'), false);
  assert.equal(isValidCorporateBookingPin('ABCDEFGHI'), false);
  assert.equal(formatInheritedCorporateBillingTerms('net60'), 'Net 60 Direct Bill');
  assert.equal(formatInheritedCorporateBillingTerms('immediate'), 'Immediate Direct Bill');

  const accounts: CorporateAccountConfig[] = [
    {
      id: 'corp-101', companyName: 'Bayer Crop Science', accountNumber: 'CORP-101', billingCycle: 'net60',
      creditLimit: 15000, billingContactName: 'Laura Vance', billingContactEmail: 'billing@bayer.example',
      billingContactPhone: '(314) 555-0100', discountPercent: 10, poRequired: true, bookingPin: 'BAYR26',
      currentPoNumber: 'PO-BAYR-9001', isActive: true,
      authorizedBookers: ['desk@bayer.example', '(314) 555-0199'],
      authorizedRiders: [
        { id: 'r-1', name: 'Dr. Alan Grant', phone: '(314) 555-0188', email: 'alan@bayer.example', department: 'Genomics', isVip: true },
      ],
      costCenters: ['CC-GENOMICS', 'CC-EXEC'],
      portalManagers: [
        { email: 'pm@bayer.example', name: 'Claire Dearing', provisionedAt: '2026-10-01T00:00:00Z', status: 'active' },
      ],
    },
    {
      id: 'corp-204', companyName: 'Mercy Hospital Executive', accountNumber: 'CORP-204', billingCycle: 'net30',
      creditLimit: 10000, billingContactName: 'Admin', billingContactEmail: 'ap@mercy.example',
      discountPercent: 5, poRequired: false, isActive: true,
    },
  ];

  assert.equal(searchCorporateAccounts(accounts, '101')[0]?.id, 'corp-101');
  assert.equal(searchCorporateAccounts(accounts, '#CORP-204')[0]?.id, 'corp-204');
  assert.equal(searchCorporateAccounts(accounts, 'mercy')[0]?.id, 'corp-204');

  const fullVerified = evaluateCorporateCallerVerification({
    account: accounts[0], callerPhone: '+1 (314) 555-0188', enteredPin: 'bayr26',
    selectedRiderId: 'r-1', selectedCostCenter: 'CC-GENOMICS',
    poValidation: { valid: true, status: 'valid', message: 'Verified' },
  });
  assert.equal(fullVerified.rosterMatched, true);
  assert.equal(fullVerified.rosterMatch.source, 'authorized_rider');
  assert.equal(fullVerified.rosterMatch.badgeLabel, '✓ Verified Roster Match');
  assert.equal(fullVerified.pinVerified, true);
  assert.equal(fullVerified.riderSelected, true);
  assert.equal(fullVerified.poVerified, true);
  assert.equal(fullVerified.verifiedSignalCount, 4);
  assert.equal(fullVerified.isVerifiedCaller, true);
  assert.equal(fullVerified.isBlocked, false);

  assert.equal(
    evaluateCorporateCallerVerification({ account: accounts[0], bookerEmail: 'PM@bayer.example' }).rosterMatch.source,
    'portal_manager'
  );
  assert.equal(
    evaluateCorporateCallerVerification({ account: accounts[0], callerPhone: '314-555-0100' }).rosterMatch.source,
    'billing_contact'
  );

  const badPin = evaluateCorporateCallerVerification({
    account: accounts[0], enteredPin: 'WRONG1',
    poValidation: { valid: true, status: 'valid', message: 'OK' },
  });
  assert.equal(badPin.pinStatus, 'mismatch');
  assert.equal(badPin.isBlocked, true);

  // PIN hard-blocks Dispatch submission (validator) and is wired through the submission hook + reset on Clear
  const pinBase = { corporateAccountList: accounts, corporateAccount: 'Bayer Crop Science', billingPo: 'PO-BAYR-9001', allowPoOverride: false, projectedFare: 50 };
  const pinBlocked = await validateDispatchCorporateSubmission({ ...pinBase, enteredBookingPin: 'WRONG1' });
  assert.equal(!pinBlocked.valid && pinBlocked.error.includes('VERBAL PIN MISMATCH'), true);
  assert.equal((await validateDispatchCorporateSubmission({ ...pinBase, enteredBookingPin: 'bayr26' })).valid, true);
  const subSrc = readRel('app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts');
  assert.equal(subSrc.includes('enteredBookingPin?: string;') && /projectedFare,\s*enteredBookingPin,\s*\}\)/.test(subSrc), true);
  const engSrc = readRel('app/components/domain/dispatch/DispatchBookingEngine.tsx');
  assert.equal(/useDispatchBookingSubmission\(\{\s*enteredBookingPin,/.test(engSrc) && engSrc.includes("setEnteredBookingPin('')"), true);

  for (const rel of [
    'app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx',
    'app/components/domain/dispatch/booking/DispatchCorporateAccountCard.tsx',
  ]) {
    const src = readRel(rel);
    assert.equal(src.includes('Invoicing Terms'), false, `${rel} must NOT contain dispatcher Invoicing Terms selector`);
    assert.equal(src.includes('Semi-Monthly Invoice') || src.includes('Monthly Statement'), false);
  }
  assert.equal(readRel('app/components/domain/dispatch/booking/DispatchCorporateAccountCard.tsx').includes('✓ Verified Roster Match'), true);
  assert.equal(readRel('app/components/domain/admin/corporate/CorporateAccountModals.tsx').includes('CorporateBookingPinModal'), true);
}

function testClientProfileWindowPaginationAndNewTabClone(): void {
  console.log('2️⃣  Testing Incoming-Call ClientProfileWindow (10+10 Pagination, Call Dedupe & Load into New Tab)...');
  assert.equal(CLIENT_TRIPS_PAGE_SIZE, 10);

  const contacts: ContactRecord[] = [{
    id: 'c-elena', name: 'Elena Vance', phone: '(314) 555-0144', email: 'elena@bayer.example',
    corporateAccountName: 'Bayer Crop Science', isVip: true, customerScore: 98, notes: 'Prefers quiet ride', updatedAt: 1,
  }];

  const manyTrips: Trip[] = Array.from({ length: 25 }, (_, idx) =>
    makeTrip(`trip-${String(idx + 1).padStart(2, '0')}`, {
      scheduledPickupTime: new Date(Date.UTC(2026, 10, 1 + idx, 14, 0, 0)).toISOString(),
      pricing: { ...makeTrip('x').pricing, totalFare: 40 + idx },
    })
  );

  const profile = resolveClientProfileData({ phone: '+13145550144', contacts, trips: manyTrips });
  assert.equal(profile.isExistingClient, true);
  assert.equal(profile.isVip, true);
  assert.equal(profile.corporateAccountName, 'Bayer Crop Science');
  assert.equal(profile.customerScore, 98);
  assert.equal(profile.totalTrips, 25);
  assert.equal(profile.sortedTrips[0]?.id, 'trip-25');

  const p1 = paginateClientTrips(profile.sortedTrips, 10);
  assert.deepEqual([p1.visibleTrips.length, p1.hasMore, p1.remainingCount, p1.nextVisibleCount], [10, true, 15, 20]);

  const p2 = paginateClientTrips(profile.sortedTrips, p1.nextVisibleCount);
  assert.deepEqual([p2.visibleTrips.length, p2.hasMore, p2.remainingCount], [20, true, 5]);

  const p3 = paginateClientTrips(profile.sortedTrips, p2.nextVisibleCount);
  assert.deepEqual([p3.visibleTrips.length, p3.hasMore], [25, false]);

  const seen = new Set<string>();
  assert.equal(shouldAutoOpenClientProfileOnCall({ phone: '314-555-0144', callSid: 'CALL_SID_101', seenCallKeys: seen, contacts, trips: manyTrips }).shouldOpen, true);
  assert.equal(shouldAutoOpenClientProfileOnCall({ phone: '314-555-0144', callSid: 'CALL_SID_101', seenCallKeys: seen, contacts, trips: manyTrips }).shouldOpen, false);
  assert.equal(shouldAutoOpenClientProfileOnCall({ phone: '314-555-9999', callSid: 'CALL_SID_NEW', seenCallKeys: seen, contacts, trips: manyTrips }).shouldOpen, false);
  // INCOMING_CALL (no callSid) -> CALL_ANSWERED (callSid) must not re-open; CALL_ENDED clear re-arms
  const ring = { phone: '314-555-0144', seenCallKeys: new Set<string>(), contacts, trips: manyTrips };
  assert.equal(shouldAutoOpenClientProfileOnCall(ring).shouldOpen, true);
  assert.equal(shouldAutoOpenClientProfileOnCall({ ...ring, callSid: 'CA_RING_ANSWER' }).shouldOpen, false);
  assert.equal(shouldAutoOpenClientProfileOnCall({ ...ring, callSid: 'CA_RING_ANSWER' }).shouldOpen, false);
  ring.seenCallKeys.clear();
  assert.equal(shouldAutoOpenClientProfileOnCall({ ...ring, callSid: 'CA_RING_2' }).shouldOpen, true);

  const cloned = buildNewTabValuesFromClientTrip(manyTrips[0]);
  assert.equal(cloned.passengerName, 'Elena Vance');
  assert.equal(cloned.pickupAddress.includes('Swingley Ridge'), true);

  const winSrc = readRel('app/components/domain/dispatch/ClientProfileWindow.tsx');
  assert.equal(winSrc.includes('id="client_profile"'), true);
  assert.equal(winSrc.includes('width: 540, height: 520'), true);
  assert.equal(winSrc.includes('Load into New Tab'), true);
  assert.equal(winSrc.includes('Load More Trips'), true);
  assert.equal(winSrc.includes("p.source === 'outbound_call'") && !winSrc.includes('if (!msg.payload?.callSid)'), true);
  assert.equal(readRel('app/core/services/telephony.service.ts').includes("source: 'outbound_call'"), true);
  assert.equal(readRel('app/core/services/workspace-bus.service.ts').includes("| 'outbound_call' |"), true);
  assert.equal(readRel('app/components/domain/dispatch/booking/DispatchPassengerCrmSection.tsx').includes('Client Profile'), true);
  assert.equal(readRel('app/components/domain/dispatch/CommsHub.tsx').includes('Client Profile'), true);
}

function testDriverHomesMapLayerAndPreferences(): void {
  console.log('3️⃣  Testing Driver Home Addresses & Layers ▾ -> Driver Homes...');
  assert.equal(DEFAULT_DISPATCH_MAP_PREFERENCES.showDriverHomesOverlay, false);
  const prefsRoundTrip = parseDispatchMapPreferences(serializeDispatchMapPreferences({ showDriverHomesOverlay: true }));
  assert.equal(prefsRoundTrip.showDriverHomesOverlay, true);

  const tiers: VehicleTierConfig[] = [
    { id: 'standard', name: 'Executive Sedan', baseMultiplier: 1, maxPassengers: 3, maxLuggage: 2, isActive: true },
    { id: 'minivan', name: 'Family Minivan', baseMultiplier: 1.3, maxPassengers: 6, maxLuggage: 5, isActive: true },
  ];

  const fleet: LiveFleetDriver[] = [
    {
      id: 'drv-947', name: 'Zakharya Rakhmanov', cabNumber: '947', status: 'available', vehicle: 'Car #947', tier: 'standard',
      phone: '314-915-1800', zone: 'Chesterfield', mapStatus: 'available', dutyStatus: 'on_duty', activeTrip: null,
      queuedTripsCount: 0, telemetry: null, gpsFreshness: 'none', lastSeenSeconds: null,
      homeAddress: '14323 Olive Blvd, Chesterfield, MO', homeCoordinates: { lat: 38.6742, lng: -90.5112 },
    },
    {
      id: 'drv-archived', name: 'Archived Driver', cabNumber: '800', status: 'offline', vehicle: 'Car #800', tier: 'minivan',
      phone: '314-555-0000', zone: 'Chesterfield', isArchived: true, mapStatus: 'offline', dutyStatus: 'off_duty', activeTrip: null,
      queuedTripsCount: 0, telemetry: null, gpsFreshness: 'none', lastSeenSeconds: null,
      homeAddress: '100 Main St', homeCoordinates: { lat: 38.65, lng: -90.5 },
    },
  ];

  const allHomeItems = buildDriverHomesOverlayItems(fleet, [], null, tiers);
  assert.equal(allHomeItems.length, 1);
  assert.equal(allHomeItems[0]?.cabLabel, '#947');
  assert.equal(allHomeItems[0]?.vehicleClassLabel, 'Executive Sedan');
  assert.equal(buildDriverHomesOverlayItems(fleet, ['minivan'], null, tiers).length, 0);
  assert.equal(formatDriverShiftScheduleSummary(null), 'Flexible / On-Demand Shift');

  const decodedPin = decodeURIComponent(buildDriverHomePinDataUrl('#947'));
  assert.equal(decodedPin.includes('>HOME<') && decodedPin.includes('>#947<'), true);
  assert.equal(readRel('app/components/domain/admin/operators/OperatorEditorDrawer.tsx').includes('label="Driver Home Address"'), true);
  assert.equal(readRel('app/components/domain/dispatch/map/MapLayersAndVehiclesToolbar.tsx').includes("label: 'Driver Homes'"), true);
  assert.equal(readRel('app/components/domain/dispatch/map/MapCustomOverlayInfoCard.tsx').includes('Open Driver Queue'), true);
  const opSrc = readRel('app/core/services/operator.service.ts');
  assert.equal((opSrc.match(/data\.homeCoordinates/g) || []).length >= 2 && (opSrc.match(/data\.schedule/g) || []).length >= 2, true);
  assert.equal(opSrc.includes('homeAddress: completeOperator.homeAddress ?? null'), true);
  assert.equal(readRel('app/components/domain/admin/operators/operator-provisioning.util.ts').includes('homeAddress: cleanHomeAddr || null'), true);
  assert.equal(readRel('app/core/services/corporate-account.service.ts').includes('deleteField()'), true);
}

function testCompactFlightCodesDarkerBadgesClearPromptAndPortal(): void {
  console.log('4️⃣  Testing Compact Flight Codes (WN / YYZ), Darker Badges, Sidebar Clear & FloatingWindow Portal...');
  const optExtracted = extractSelectOptionsFromChildren([
    React.createElement('option', { key: 'wn', value: 'Southwest Airlines', 'data-selected-label': 'WN' }, 'Southwest Airlines (WN)'),
    React.createElement('option', { key: 'plain', value: 'Plain' }, 'Plain Label'),
  ]);
  assert.equal(optExtracted[0]?.selectedLabel, 'WN');
  assert.equal('selectedLabel' in optExtracted[1], false);

  const selectHtml = renderToStaticMarkup(
    React.createElement(Select, {
      value: 'Southwest Airlines',
      options: [{ value: 'Southwest Airlines', label: 'Southwest Airlines (WN)', selectedLabel: 'WN' }],
    })
  );
  assert.equal(selectHtml.includes('>WN<'), true);
  assert.equal(selectHtml.includes('title="Southwest Airlines (WN)"'), true);

  for (const rel of [
    'app/components/domain/booking/FlightAssistanceCard.tsx',
    'app/components/domain/dispatch/booking/DispatchRoutingTimingSection.tsx',
    'app/components/domain/dispatch/booking/DispatchReturnRepeatSection.tsx',
  ]) {
    assert.equal(readRel(rel).includes('selectedLabel: al.code'), true, `${rel} must wire selectedLabel: al.code`);
  }

  assert.equal(formatAirportCodeCity({ iata: 'YYZ', city: 'Toronto' }), 'YYZ Toronto');
  assert.equal(resolveAirportDisplayValue('yyz'), 'YYZ Toronto');
  assert.equal(extractAirportIataCode('YYZ Toronto'), 'YYZ');
  assert.equal(resolveAirportComboboxFilterQuery('yyz', true, true), 'yyz');
  assert.equal(resolveAirportComboboxFilterQuery('yyz', true, false) + resolveAirportComboboxFilterQuery('yyz', false, true), '');
  assert.equal(searchAirportCatalog('yyz')[0]?.iata, 'YYZ');
  assert.equal(searchAirportCatalog('ord')[0]?.iata, 'ORD');
  const comboHtml = renderToStaticMarkup(
    React.createElement(AirportCityCombobox, { value: 'YYZ Toronto', onChange: () => {} })
  );
  assert.equal(comboHtml.includes('value="YYZ"'), true);
  assert.equal(comboHtml.includes('title="YYZ Toronto"'), true);

  assert.equal(resolveDispatchStatusMeta('completed').pillClass, 'bg-emerald-700 text-white border-emerald-800');
  assert.equal(resolveDispatchStatusMeta('cancelled').pillClass, 'bg-rose-800 text-white border-rose-900');
  const compBadge = renderToStaticMarkup(React.createElement(DispatchStatusBadge, { status: 'completed' }));
  const cancBadge = renderToStaticMarkup(React.createElement(DispatchStatusBadge, { status: 'cancelled' }));
  assert.equal(compBadge.includes('bg-emerald-700 text-white border-emerald-800'), true);
  assert.equal(cancBadge.includes('bg-rose-800 text-white border-rose-900'), true);

  const footerSrc = readRel('app/components/domain/dispatch/booking/DispatchBookingFooterBar.tsx');
  assert.equal(footerSrc.includes('ConfirmationModal'), false);
  assert.equal(footerSrc.includes('w-full z-30'), true);

  const fwSrc = readRel('app/components/ui/FloatingWindow.tsx');
  assert.equal(fwSrc.includes('createPortal'), true);
  assert.equal(fwSrc.includes('document.body'), true);
  assert.equal(fwSrc.includes('zIndex = 200'), true);
  assert.equal(readRel('app/components/domain/dispatch/map/hq-place-marker.util.ts').includes('findPlaceFromQuery'), true);
}

function testHygieneLineCeilingsAndImmutableFiles(): void {
  console.log('5️⃣  Testing 0 <select>, Line Ceilings & Immutable File Guardrails...');
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${rel} must contain 0 raw <select> tags`);
  }

  const ceilings: Array<[string, number]> = [
    ['app/routes/dispatch.tsx', 1600],
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/components/domain/dispatch/queue/TripQueueTableView.tsx', 615],
    ['app/components/domain/dispatch/queue/TripQueueToolbar.tsx', 1150],
    ['app/components/domain/dispatch/DispatchBookingEngine.tsx', 1800],
    ['app/components/domain/BookingEngineV2.tsx', 1350],
    ['app/components/domain/dispatch/CommsHub.tsx', 900],
    ['app/components/domain/booking/AirportCityCombobox.tsx', 280],
    ['app/components/domain/dispatch/map/useLiveMapCustomOverlays.ts', 430],
    ['app/core/services/corporate-caller-auth.util.ts', 240],
    ['app/components/domain/dispatch/booking/DispatchCorporateAccountCard.tsx', 320],
    ['app/components/domain/dispatch/ClientProfileWindow.tsx', 380],
    ['app/components/domain/dispatch/client-trip-history.util.ts', 180],
    ['app/components/domain/dispatch/map/driver-homes-overlay.util.ts', 240],
    ['scripts/test-corporate-auth-client-window-and-driver-homes-phase69.ts', 400],
  ];

  for (const [rel, maxLines] of ceilings) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }

  const gitStatus = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(gitStatus.includes('firestore.rules'), false, 'firestore.rules must remain untouched');
  assert.equal(gitStatus.includes('vercel.json'), false, 'vercel.json must remain untouched');
  assert.equal(gitStatus.includes('DriverAssignDropdown.tsx'), false, 'DriverAssignDropdown.tsx must remain untouched');
}

async function main(): Promise<void> {
  console.log('🚀 Running Platform Phase 69 Verification Suite...\n');
  await testCorporateCallerVerificationAndNoInvoicingSelector();
  testClientProfileWindowPaginationAndNewTabClone();
  testDriverHomesMapLayerAndPreferences();
  testCompactFlightCodesDarkerBadgesClearPromptAndPortal();
  testHygieneLineCeilingsAndImmutableFiles();
  console.log('\n✅ ALL PLATFORM PHASE 69 VERIFICATION CHECKS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
