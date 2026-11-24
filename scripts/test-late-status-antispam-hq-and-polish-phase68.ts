/**
 * Platform Phase 68 Automated Verification Suite
 * (`scripts/test-late-status-antispam-hq-and-polish-phase68.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ACTIVE_QUEUE_STATUS_KEYS,
  ALL_QUEUE_STATUS_KEYS,
  DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
  evaluateTripDriverLateStatus,
  matchesQueueStatusFilter,
  sortDispatchQueueTrips,
  sortQueueTripsByColumn,
} from '../app/core/hooks/dispatch/dispatch-workspace.util';
import {
  DispatchStatusBadge,
  getDispatchStatusBadge,
} from '../app/components/domain/dispatch/queue/DispatchStatusBadge';
import {
  PUBLIC_BOOKING_MIN_DWELL_MS,
  VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR,
  hasSpamConsonantMash,
  hasValidResolvedCoordinates,
  isLikelyGibberishOrNumericName,
  isLocalhostDevHost,
  isPublicBookingBotSubmission,
  shouldBlockBookingUnderMaintenance,
} from '../app/core/utils/security-sanitizer.util';
import {
  MAJOR_AIRPORTS,
  resolveAirportDisplayValue,
  searchAirportCatalog,
} from '../app/core/config/airport-catalog';
import {
  DEFAULT_HEADQUARTERS_FALLBACK_COORDS,
  buildHeadquartersPinDataUrl,
  resolveHeadquartersCoordinates,
  resolveHeadquartersOverlayPlace,
} from '../app/components/domain/dispatch/map/useLiveMapCustomOverlays';
import { normalizeCompanyConfig } from '../app/core/types/config';
import { CollapsibleSection } from '../app/components/ui/CollapsibleSection';
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
    status: 'assigned',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-101',
    pickupLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    dropoffLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017' },
    bookingType: 'scheduled',
    scheduledPickupTime: nowIso,
    passenger: {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: 'sarah@example.com',
      phone: '(314) 555-0192',
      passengerCount: 2,
      luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 10,
      distanceMiles: 18.5,
      durationMinutes: 24,
      distanceRate: 40,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 50,
      totalFare: 54,
      currency: 'USD',
    },
    payment: { method: 'card', status: 'pending', amount: 54 },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

function testDerivedLateStatusAndFlightDelayExemption(): void {
  console.log('1️⃣  Testing Derived Late Driver Pickup Status & Flight-Delay Exemption...');
  const baseMs = Date.parse('2026-11-24T18:00:00.000Z');

  // Within +60s grace window -> not late
  assert.deepEqual(evaluateTripDriverLateStatus(makeTrip('t-grace'), baseMs + 60_000), {
    isLate: false,
    lateMinutes: 0,
  });

  // Assigned / Accepted / En Route past +60s -> Late
  for (const status of ['assigned', 'accepted', 'en_route'] as const) {
    const res = evaluateTripDriverLateStatus(makeTrip(`t-${status}`, { status }), baseMs + 8 * 60_000);
    assert.deepEqual(res, { isLate: true, lateMinutes: 8 });
  }

  // Unassigned, arrived, in_progress, completed, or missing scheduledPickupTime -> never Late
  assert.equal(evaluateTripDriverLateStatus(makeTrip('t-unassigned', { assignedDriverId: null }), baseMs + 600_000).isLate, false);
  for (const status of ['unconfirmed', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled'] as const) {
    assert.equal(evaluateTripDriverLateStatus(makeTrip(`t-non-${status}`, { status }), baseMs + 600_000).isLate, false);
  }
  assert.equal(
    evaluateTripDriverLateStatus(makeTrip('t-no-sched', { scheduledPickupTime: undefined }), baseMs + 600_000).isLate,
    false
  );

  // Flight-Delay Exemptions
  const delayedTelemetryTrip = makeTrip('t-flt-delayed', {
    flightTelemetry: {
      flightIdent: 'AC8801',
      status: 'delayed',
      delayMinutes: 35,
      checkedAt: '2026-11-24T17:45:00.000Z',
      provider: 'flightaware',
    } as any,
  });
  assert.equal(evaluateTripDriverLateStatus(delayedTelemetryTrip, baseMs + 20 * 60_000).isLate, false);

  const metaDelayedTrip = makeTrip('t-meta-delayed', { metadata: { flightDelayed: true } as any });
  assert.equal(evaluateTripDriverLateStatus(metaDelayedTrip, baseMs + 25 * 60_000).isLate, false);

  // Delayed flight that has landed: exempt inside shifted pickup window, Late once past shifted window + 60s
  const landedDelayedTrip = makeTrip('t-landed-delayed', {
    flightTelemetry: {
      flightIdent: 'WN1420',
      status: 'landed',
      delayMinutes: 20,
      checkedAt: '2026-11-24T18:10:00.000Z',
      provider: 'flightaware',
    } as any,
  });
  assert.equal(evaluateTripDriverLateStatus(landedDelayedTrip, baseMs + 20 * 60_000 + 30_000).isLate, false);
  assert.equal(evaluateTripDriverLateStatus(landedDelayedTrip, baseMs + 25 * 60_000).isLate, true);

  // Filter keys, backward-compatible string & Trip matching, and sorting priority
  assert.equal(ALL_QUEUE_STATUS_KEYS[0], 'late');
  assert.equal(ACTIVE_QUEUE_STATUS_KEYS[0], 'late');
  const lateTrip = makeTrip('t-late-sort', { status: 'en_route' });
  const onTimeAsap = makeTrip('t-asap', {
    status: 'confirmed',
    assignedDriverId: null,
    bookingType: 'asap',
    scheduledPickupTime: undefined,
    createdAt: '2026-11-24T18:05:00.000Z',
  });
  assert.equal(matchesQueueStatusFilter(lateTrip, 'late', baseMs + 10 * 60_000), true);
  assert.equal(matchesQueueStatusFilter(lateTrip, DEFAULT_ACTIVE_ONLY_STATUS_FILTER, baseMs + 10 * 60_000), true);
  assert.equal(matchesQueueStatusFilter('confirmed', 'confirmed'), true);
  assert.equal(matchesQueueStatusFilter('completed', DEFAULT_ACTIVE_ONLY_STATUS_FILTER), false);

  const smartSorted = sortDispatchQueueTrips([onTimeAsap, lateTrip], 'smart', baseMs + 10 * 60_000);
  assert.equal(smartSorted[0].id, 't-late-sort');
  const statusSorted = sortQueueTripsByColumn(
    [onTimeAsap, lateTrip],
    { column: 'status', direction: 'asc' },
    { nowMs: baseMs + 10 * 60_000 }
  );
  assert.equal(statusSorted[0].id, 't-late-sort');

  // DispatchStatusBadge & getDispatchStatusBadge markup
  const badgeHtml = renderToStaticMarkup(
    React.createElement(DispatchStatusBadge, {
      status: lateTrip.status,
      trip: lateTrip,
      nowMs: baseMs + 12 * 60_000,
      compact: false,
    })
  );
  assert.equal(badgeHtml.includes('bg-rose-600 text-white border-rose-700 animate-pulse'), true);
  assert.equal(badgeHtml.includes('Late (+12m) — En Route'), true);
  const helperHtml = renderToStaticMarkup(
    getDispatchStatusBadge(lateTrip.status, { trip: lateTrip, nowMs: baseMs + 5 * 60_000 })
  );
  assert.equal(helperHtml.includes('Late (+5m) — En Route'), true);
}

function testLocalhostMaintenanceBypassAndAntiSpamShield(): void {
  console.log('2️⃣  Testing Localhost Maintenance Bypass & Multi-Layer /book Anti-Spam Shield...');
  assert.equal(isLocalhostDevHost('localhost'), true);
  assert.equal(isLocalhostDevHost('localhost:5173'), true);
  assert.equal(isLocalhostDevHost('127.0.0.1'), true);
  assert.equal(isLocalhostDevHost('127.0.0.1:3000'), true);
  assert.equal(isLocalhostDevHost('[::1]'), true);
  assert.equal(isLocalhostDevHost('[::1]:5173'), true);
  assert.equal(isLocalhostDevHost('chesterfieldtaxi.com'), false);
  assert.equal(isLocalhostDevHost(''), false);
  assert.equal(isLocalhostDevHost(undefined), false);

  for (const rel of ['app/routes/layout.tsx', 'app/routes/app.tsx']) {
    const src = readRel(rel);
    assert.equal(src.includes('isLocalhostDevHost'), true, `${rel} must export/use isLocalhostDevHost`);
    assert.equal(src.includes('Live Site: Maintenance ON'), true, `${rel} must render maintenance bypass pill`);
  }

  assert.equal(PUBLIC_BOOKING_MIN_DWELL_MS, 4000);
  assert.equal(isPublicBookingBotSubmission({ websiteUrl: 'https://spam.example', mountedAtMs: 0, submittedAtMs: 9000 }), true);
  assert.equal(isPublicBookingBotSubmission({ websiteUrl: '', mountedAtMs: 1000, submittedAtMs: 3500 }), true);
  assert.equal(isPublicBookingBotSubmission({ websiteUrl: '', mountedAtMs: 1000, submittedAtMs: 5500 }), false);

  assert.equal(shouldBlockBookingUnderMaintenance({ constructionMode: true, hostname: 'chesterfieldtaxi.com' }), true);
  assert.equal(shouldBlockBookingUnderMaintenance({ constructionMode: true, hostname: 'localhost' }), false);
  assert.equal(
    shouldBlockBookingUnderMaintenance({ constructionMode: true, hostname: 'chesterfieldtaxi.com', userRole: 'admin' }),
    false
  );

  assert.equal(VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR, 'Please select a verified address from the autocomplete suggestions');
  assert.equal(hasValidResolvedCoordinates(undefined), false);
  assert.equal(hasValidResolvedCoordinates({ lat: 0, lng: 0 }), false);
  assert.equal(hasValidResolvedCoordinates({ lat: 38.7487, lng: -90.37 }), true);

  for (const spamName of ['9137066615', 'Wqssvb', 'Ftwwk', 'RUGtjxocusfzjdcKXRoX']) {
    assert.equal(
      isLikelyGibberishOrNumericName(spamName) || hasSpamConsonantMash(spamName),
      true,
      `Expected spam name "${spamName}" to be rejected`
    );
  }
  for (const validName of ['Sarah Jenkins', 'Christopher Armstrong', 'Krzysztof Przybylski', 'David Ng']) {
    assert.equal(isLikelyGibberishOrNumericName(validName), false, `Expected real name "${validName}" to pass`);
    assert.equal(hasSpamConsonantMash(validName), false);
  }

  const bookingV2Src = readRel('app/components/domain/BookingEngineV2.tsx');
  assert.equal(bookingV2Src.includes('hp_company_sec_field'), false);
  assert.equal(bookingV2Src.includes('name="websiteUrl"'), true);
  assert.equal(bookingV2Src.includes("clipPath: 'inset(50%)'"), true);
  assert.equal(bookingV2Src.includes('autoComplete="new-password"'), true);
}

function testInlineAirportComboboxAndHeadquartersPin(): void {
  console.log('3️⃣  Testing >= 145 STL-Connected MAJOR_AIRPORTS, Inline AirportCityCombobox & HQ Map Pin...');
  assert.equal(MAJOR_AIRPORTS.length >= 145, true, `Expected >= 145 airports, got ${MAJOR_AIRPORTS.length}`);
  const uniqueCodes = new Set(MAJOR_AIRPORTS.map((a) => a.iata));
  assert.equal(uniqueCodes.size, MAJOR_AIRPORTS.length, 'Every MAJOR_AIRPORTS entry must have a unique IATA code');

  const requiredStlConnections = [
    'YYZ', 'STL', 'SUS', 'CPS', 'BLV', 'ALN', 'ORD', 'MDW', 'DFW', 'DAL', 'ATL', 'DEN', 'CLT', 'JFK', 'LGA', 'EWR',
    'DEC', 'SPI', 'CGI', 'UIN', 'MWA', 'OWB', 'FOD', 'BRL', 'TBN',
    'CUN', 'PUJ', 'MBJ', 'SJD', 'PVR', 'NAS', 'GCM', 'FRA', 'LHR', 'TEB', 'VNY',
  ];
  for (const code of requiredStlConnections) {
    assert.equal(uniqueCodes.has(code), true, `Missing required STL-connected airport ${code}`);
  }
  assert.equal(resolveAirportDisplayValue('yyz'), 'YYZ Toronto');
  assert.equal(resolveAirportDisplayValue('CYYZ'), 'YYZ Toronto');
  assert.equal(searchAirportCatalog('Marion')[0]?.iata, 'MWA');
  assert.equal(searchAirportCatalog('Frankfurt')[0]?.iata, 'FRA');

  const comboSrc = readRel('app/components/domain/booking/AirportCityCombobox.tsx');
  assert.equal(comboSrc.includes('<input'), true);
  assert.equal(comboSrc.includes('role="combobox"'), true);
  assert.equal(comboSrc.includes('createPortal'), true);
  assert.equal(comboSrc.includes('z-[99999]'), true);
  assert.equal(comboSrc.includes('coords !== null'), true);
  assert.equal(comboSrc.includes('type="checkbox"'), false);

  // Headquarters (HQ) coordinate & marker resolution
  const normCompany = normalizeCompanyConfig({
    name: 'Chesterfield Taxi',
    address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017',
    headquartersCoordinates: { lat: 38.6652, lng: -90.5784 },
  });
  assert.deepEqual(normCompany.headquartersCoordinates, { lat: 38.6652, lng: -90.5784 });
  assert.deepEqual(resolveHeadquartersCoordinates(normCompany), { lat: 38.6652, lng: -90.5784 });
  assert.deepEqual(
    resolveHeadquartersCoordinates({ address: 'Custom HQ' }, { lat: 38.65, lng: -90.55 }),
    { lat: 38.65, lng: -90.55 }
  );
  assert.deepEqual(resolveHeadquartersCoordinates(null, null), DEFAULT_HEADQUARTERS_FALLBACK_COORDS);

  const hqOverlay = resolveHeadquartersOverlayPlace(normCompany);
  assert.equal(hqOverlay.id, 'company-hq');
  assert.equal(hqOverlay.category, 'hq');
  assert.equal(hqOverlay.name.includes('Headquarters (HQ)'), true);
  const hqSvgUrl = buildHeadquartersPinDataUrl();
  assert.equal(decodeURIComponent(hqSvgUrl).includes('>HQ<'), true);
  assert.equal(readRel('app/components/domain/admin/general/CompanyProfilePanel.tsx').includes('<LocationAutocomplete'), true);
}

function testTrackPickersCollapsibleSectionAndPaymentSymmetry(): void {
  console.log('4️⃣  Testing /track Custom Pickers + Pulsing Button, <CollapsibleSection> & Card/Cash Symmetry...');
  const guestSrc = readRel('app/components/domain/tracking/GuestManageRidePanel.tsx');
  assert.equal(guestSrc.includes('type="date"'), false, 'GuestManageRidePanel must have 0 raw type="date" inputs');
  assert.equal(guestSrc.includes('type="time"'), false, 'GuestManageRidePanel must have 0 raw type="time" inputs');
  assert.equal(guestSrc.includes('<ModernDatePicker'), true);
  assert.equal(guestSrc.includes('<ModernTimePicker'), true);
  assert.equal(
    guestSrc.includes('bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold ring-2 ring-amber-400/60'),
    true
  );

  const closedHtml = renderToStaticMarkup(
    React.createElement(CollapsibleSection, {
      isOpen: false,
      children: React.createElement('div', null, 'Cargo'),
    })
  );
  const openHtml = renderToStaticMarkup(
    React.createElement(CollapsibleSection, {
      isOpen: true,
      children: React.createElement('div', null, 'Cargo'),
    })
  );
  assert.equal(closedHtml.includes('grid transition-[grid-template-rows,opacity] duration-200 ease-out'), true);
  assert.equal(closedHtml.includes('grid-rows-[0fr] opacity-0'), true);
  assert.equal(openHtml.includes('grid-rows-[1fr] opacity-100'), true);

  for (const rel of [
    'app/components/domain/booking/FlightAssistanceCard.tsx',
    'app/components/domain/booking/sections/CustomerRouteTimingSection.tsx',
    'app/components/domain/booking/sections/CustomerVehicleExtrasSection.tsx',
    'app/components/domain/booking/sections/CustomerReturnTripSection.tsx',
    'app/components/domain/dispatch/booking/DispatchRoutingTimingSection.tsx',
    'app/components/domain/dispatch/booking/DispatchExtrasVehicleSection.tsx',
    'app/components/domain/dispatch/booking/DispatchReturnRepeatSection.tsx',
  ]) {
    assert.equal(readRel(rel).includes('<CollapsibleSection'), true, `${rel} must use <CollapsibleSection>`);
  }

  const paymentSrc = readRel('app/components/domain/booking/sections/CustomerPaymentSection.tsx');
  assert.equal(paymentSrc.includes('Pay Driver in Cash at Dropoff'), true);
  const noUpfrontMatches = paymentSrc.match(/No Upfront Charge/g) || [];
  assert.equal(noUpfrontMatches.length >= 3, true, 'Both Card (In Car) and Cash (In Car) must show No Upfront Charge pill');
}

function testGlobalHygieneLineCeilingsAndImmutableFiles(): void {
  console.log('5️⃣  Testing 0 <select>, Line Ceilings & Immutable File Guardrails...');
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${rel} must contain 0 raw <select> tags`);
  }

  const lineBudgets: Array<[string, number]> = [
    ['app/routes/dispatch.tsx', 1600],
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/components/domain/dispatch/queue/TripQueueTableView.tsx', 615],
    ['app/components/domain/dispatch/queue/TripQueueToolbar.tsx', 1150],
    ['app/components/domain/dispatch/DispatchBookingEngine.tsx', 1800],
    ['app/components/domain/BookingEngineV2.tsx', 1350],
    ['app/core/config/airport-catalog.ts', 320],
    ['app/components/domain/booking/AirportCityCombobox.tsx', 280],
    ['app/components/domain/admin/trips/AdminTripsTablePanel.tsx', 420],
    ['app/components/domain/dispatch/map/useLiveMapCustomOverlays.ts', 430],
    ['app/components/domain/dispatch/map/hq-place-marker.util.ts', 420],
    ['app/components/domain/dispatch/queue/DispatchStatusBadge.tsx', 240],
    ['app/components/ui/CollapsibleSection.tsx', 90],
    ['scripts/test-late-status-antispam-hq-and-polish-phase68.ts', 420],
  ];
  for (const [rel, maxLines] of lineBudgets) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }

  const gitStatus = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(gitStatus.includes('firestore.rules'), false, 'firestore.rules must remain untouched');
  assert.equal(gitStatus.includes('vercel.json'), false, 'vercel.json must remain untouched');
  assert.equal(gitStatus.includes('DriverAssignDropdown.tsx'), false, 'DriverAssignDropdown.tsx must remain untouched');
}

function main(): void {
  console.log('🚀 Running Platform Phase 68 Verification Suite...\n');
  testDerivedLateStatusAndFlightDelayExemption();
  testLocalhostMaintenanceBypassAndAntiSpamShield();
  testInlineAirportComboboxAndHeadquartersPin();
  testTrackPickersCollapsibleSectionAndPaymentSymmetry();
  testGlobalHygieneLineCeilingsAndImmutableFiles();
  console.log('\n✅ ALL PLATFORM PHASE 68 VERIFICATION CHECKS PASSED!');
}

main();
