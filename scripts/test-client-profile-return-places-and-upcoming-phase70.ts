/**
 * Platform Phase 70 Automated Verification Suite
 * (`scripts/test-client-profile-return-places-and-upcoming-phase70.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildPopulateDraftPayloadFromClientPlace,
  buildReturnTabValuesFromClientTrip,
  normalizeClonedDraftTiming,
  partitionClientActiveUpcomingAndPastTrips,
  resolveClientSavedAndFrequentPlaces,
} from '../app/components/domain/dispatch/client-profile-workflows.util';
import {
  buildNewTabValuesFromClientTrip,
  resolveClientProfileData,
} from '../app/components/domain/dispatch/client-trip-history.util';
import {
  ClientSavedPlacesSection,
  ClientUpcomingRidesStrip,
} from '../app/components/domain/dispatch/ClientProfileSections';
import {
  mergePopulateBookingIntoDraftForm,
  resolvePopulatePassengerMode,
} from '../app/core/hooks/dispatch/dispatch-workspace.util';
import { getContactService, normalizePlaceAddressKey } from '../app/core/services/customer/contact.service';
import { formatLocalDateStr } from '../app/core/services/pricing/vehicle-matching';
import type { ContactRecord } from '../app/core/services/customer/contact.service';
import type { CorporateAccountConfig } from '../app/core/types/config';
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

const NOW_MS = new Date(2026, 10, 24, 12, 3, 0).getTime(); // local 12:03 -> rounds to 12:05
const NOW_DATE = formatLocalDateStr(new Date(NOW_MS));
const PAST_ISO = new Date(2026, 9, 1, 8, 30, 0).toISOString();
const FUTURE_ISO = new Date(2026, 10, 26, 9, 45, 0).toISOString();

function makeTrip(id: string, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    status: 'completed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017', coordinates: { lat: 38.65, lng: -90.55 } },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145', coordinates: { lat: 38.74, lng: -90.37 } },
    bookingType: 'scheduled',
    scheduledPickupTime: PAST_ISO,
    passenger: {
      firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example',
      phone: '(314) 555-0144', passengerCount: 2, luggageCount: 3,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 10, distanceMiles: 18.5, durationMinutes: 24, distanceRate: 40, timeRate: 0,
      vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 50, totalFare: 58, currency: 'USD',
    },
    payment: { method: 'corporate', status: 'settled', amount: 58 },
    statusHistory: [],
    createdAt: PAST_ISO,
    updatedAt: PAST_ISO,
    ...overrides,
  } as Trip;
}

function testReturnAndFutureSafeClone(): void {
  console.log('1️⃣  Testing ⇄ Book Return + Future-Safe Same-Direction Clone Timing...');
  const stopA = { address: '1 Stop A St', coordinates: { lat: 38.6, lng: -90.5 } };
  const stopB = { address: '2 Stop B St', coordinates: { lat: 38.7, lng: -90.4 } };
  const trip = makeTrip('trip-ret-1', {
    pickupLocation: { address: '700 Airport Rd, Chesterfield, MO', coordinates: { lat: 38.65, lng: -90.55 }, placeId: 'pid-pickup' },
    dropoffLocation: { address: '15 Maple Ave, Clayton, MO', coordinates: { lat: 38.64, lng: -90.33 }, placeId: 'pid-dropoff' },
    intermediateStops: [stopA, stopB],
    metadata: {
      corporateDetails: { corporateAccount: 'Bayer Crop Science', billingPo: 'PO-BAYR-9001', authorizedBy: 'L. Vance', invoicingTerms: 'Net 60 Direct Bill' },
    },
  });
  const ret = buildReturnTabValuesFromClientTrip(trip, NOW_MS);
  assert.deepEqual([ret.pickupAddress, ret.dropoffAddress], ['15 Maple Ave, Clayton, MO', '700 Airport Rd, Chesterfield, MO']);
  assert.deepEqual([ret.pickupCoordinates, ret.dropoffCoordinates], [{ lat: 38.64, lng: -90.33 }, { lat: 38.65, lng: -90.55 }]);
  assert.deepEqual([ret.pickupPlaceId, ret.dropoffPlaceId], ['pid-dropoff', 'pid-pickup']);
  assert.deepEqual(ret.intermediateStops.map((s) => s.address), ['2 Stop B St', '1 Stop A St']);
  assert.deepEqual(trip.intermediateStops?.map((s) => s.address), ['1 Stop A St', '2 Stop B St'], 'source trip must not be mutated');
  assert.deepEqual([ret.timingType, ret.scheduledDate, ret.scheduledTime], ['asap', NOW_DATE, '12:05']);
  assert.deepEqual([ret.provideFlightInfo, ret.airline, ret.flightNumber, ret.flightOrigin], [false, '', '', '']);
  assert.deepEqual([ret.passengerName, ret.phone, ret.passengers, ret.bags, ret.paymentMethod, ret.vehicle], ['Elena Vance', '(314) 555-0144', 2, 3, 'account', 'standard']);
  assert.deepEqual([ret.corporateDetails.corporateAccount, ret.corporateDetails.billingPo], ['Bayer Crop Science', 'PO-BAYR-9001']);
  // Returning from an airport keeps airport pickup (no forced clearing to false)
  const airportTrip = makeTrip('trip-ret-2');
  const retFromAirport = buildReturnTabValuesFromClientTrip(airportTrip, NOW_MS);
  assert.equal(retFromAirport.pickupAddress.includes('Lambert'), true);
  assert.equal(retFromAirport.provideFlightInfo === false, false);
  // Same-direction clone: past -> asap today; future preserved
  const pastClone = buildNewTabValuesFromClientTrip(trip, NOW_MS);
  assert.equal(pastClone.timingType, 'asap');
  assert.equal(pastClone.scheduledDate, NOW_DATE);
  assert.equal(pastClone.scheduledTime, '12:05');
  assert.equal(pastClone.pickupAddress, '700 Airport Rd, Chesterfield, MO');
  const futureTrip = makeTrip('trip-fut-1', { scheduledPickupTime: FUTURE_ISO, status: 'assigned' });
  const futureClone = buildNewTabValuesFromClientTrip(futureTrip, NOW_MS);
  assert.equal(futureClone.timingType, 'later');
  assert.equal(futureClone.scheduledDate, formatLocalDateStr(new Date(FUTURE_ISO)));
  assert.equal(normalizeClonedDraftTiming(futureClone, futureTrip, NOW_MS), futureClone);
  assert.equal(buildReturnTabValuesFromClientTrip(futureTrip, NOW_MS).timingType, 'asap');
  // Backward compatible with the Phase 69 single-argument call
  assert.equal(buildNewTabValuesFromClientTrip(makeTrip('compat')).passengerName, 'Elena Vance');
}

function testPartitionActiveUpcomingAndPast(): void {
  console.log('2️⃣  Testing Active & Upcoming vs Past Partition...');
  const t = (id: string, status: string, iso: string) =>
    makeTrip(id, { status: status as Trip['status'], scheduledPickupTime: iso, createdAt: iso });
  const sorted = [
    t('p-completed-new', 'completed', new Date(2026, 10, 20).toISOString()),
    t('a-assigned-late', 'assigned', new Date(2026, 10, 28).toISOString()),
    t('p-cancelled', 'cancelled', new Date(2026, 10, 18).toISOString()),
    t('a-unconfirmed-soon', 'unconfirmed', new Date(2026, 10, 25).toISOString()),
    t('a-in-progress', 'in_progress', new Date(2026, 10, 24, 11).toISOString()),
    t('p-declined', 'declined', new Date(2026, 10, 10).toISOString()),
    t('a-en-route', 'en_route', new Date(2026, 10, 24, 11, 30).toISOString()),
    t('p-completed-old', 'completed', new Date(2026, 9, 1).toISOString()),
  ];
  const { activeUpcomingTrips, pastTrips } = partitionClientActiveUpcomingAndPastTrips(sorted, NOW_MS);
  assert.deepEqual(
    activeUpcomingTrips.map((x) => x.id),
    ['a-in-progress', 'a-en-route', 'a-unconfirmed-soon', 'a-assigned-late'],
    'live statuses first, then soonest-first'
  );
  assert.deepEqual(
    pastTrips.map((x) => x.id),
    ['p-completed-new', 'p-cancelled', 'p-declined', 'p-completed-old'],
    'terminal trips newest-first'
  );
  assert.equal(activeUpcomingTrips.length + pastTrips.length, sorted.length);
  assert.equal(partitionClientActiveUpcomingAndPastTrips([], NOW_MS).pastTrips.length, 0);
}

function testSavedPlacesResolverAndContactService(): void {
  console.log('3️⃣  Testing Saved & Frequent Places + ContactService saveContactPlace / removeContactPlace...');
  const corp: CorporateAccountConfig = {
    id: 'corp-101', companyName: 'Bayer Crop Science', accountNumber: 'CORP-101', billingCycle: 'net60',
    creditLimit: 15000, billingContactName: 'Laura', billingContactEmail: 'billing@bayer.example',
    discountPercent: 10, poRequired: false, isActive: true,
    savedCompanyLocations: [
      { id: 'l1', label: 'Main Lobby', address: '500 Bayer Blvd, Creve Coeur, MO', notes: 'Lobby desk' },
      { id: 'l2', label: 'Gate B', address: '600 Gate Rd, Creve Coeur, MO', notes: 'Badge required at gate' },
    ],
  };
  const contact: ContactRecord = {
    id: 'c-elena', name: 'Elena Vance', phone: '(314) 555-0144', corporateAccountName: 'Bayer Crop Science',
    homeAddress: '123 Main St, Chesterfield, MO', workAddress: '500 Bayer Blvd Creve Coeur MO',
    savedPlaces: [
      { id: 'sp-gym', label: 'Gym', category: 'favorite', address: '1 Fit St, Chesterfield, MO', notes: 'Side door' },
      { id: 'sp-home', label: 'Mom', category: 'other', address: '123 MAIN ST., Chesterfield, MO' },
    ],
    updatedAt: 1,
  };
  const trips = [
    makeTrip('f1'), makeTrip('f2'), makeTrip('f3'),
    makeTrip('f4', { pickupLocation: { address: '9 Rare Rd, Ballwin, MO' }, dropoffLocation: { address: '8 Once Ct, Ballwin, MO' } }),
  ];
  const places = resolveClientSavedAndFrequentPlaces({
    contact, corporateAccounts: [corp], corporateAccountName: 'Bayer Crop Science', sortedTrips: trips,
  });
  assert.deepEqual(places.slice(0, 2).map((p) => [p.id, p.source, p.removable]), [['sp-gym', 'saved', true], ['sp-home', 'saved', true]]);
  assert.equal(places.filter((p) => normalizePlaceAddressKey(p.address) === '123 main st chesterfield mo').length, 1, 'home deduped vs saved place');
  const work = places.find((p) => p.id === 'contact_work');
  assert.equal(work?.source, 'contact_field');
  assert.equal(work?.removable, false);
  assert.equal(places.some((p) => p.label === 'Main Lobby'), false, 'corporate Main Lobby deduped vs workAddress');
  const gate = places.find((p) => p.source === 'corporate');
  assert.deepEqual([gate?.label, gate?.notes, gate?.category], ['Gate B', 'Badge required at gate', 'company']);
  const freq = places.filter((p) => p.source === 'frequent');
  assert.equal(freq[0]?.tripCount, 3);
  assert.deepEqual(freq[0]?.coordinates, { lat: 38.65, lng: -90.55 });
  assert.equal(places.length <= 6, true);
  assert.equal(places.indexOf(gate!) < places.indexOf(freq[0]!), true, 'corporate before frequent');
  assert.equal(
    resolveClientSavedAndFrequentPlaces({ sortedTrips: trips, maxItems: 1 }).length, 1);
  assert.equal(
    resolveClientSavedAndFrequentPlaces({ contact, corporateAccounts: [{ ...corp, isActive: false }], sortedTrips: [] })
      .some((p) => p.source === 'corporate'), false);
  const svc = getContactService();
  svc.resetForTests();
  let events = 0;
  const unsub = svc.subscribe(() => { events += 1; });
  const created = svc.saveContactPlace(
    { phone: '+13145559001', name: 'Walk In' },
    { label: 'Home', category: 'home', address: '12 Oak Ln, Chesterfield, MO', coordinates: { lat: 38.6, lng: -90.5 } }
  );
  assert.equal(created.homeAddress, '12 Oak Ln, Chesterfield, MO');
  assert.equal(created.savedPlaces?.length, 1);
  assert.equal(created.name, 'Walk In');
  const again = svc.saveContactPlace(
    { contactId: created.id },
    { label: 'Home (new label)', category: 'home', address: '12 OAK LN., Chesterfield MO' }
  );
  assert.equal(again.id, created.id);
  assert.equal(again.savedPlaces?.length, 1, 'dedupe by normalized address');
  assert.equal(again.savedPlaces?.[0]?.label, 'Home (new label)');
  const withWork = svc.saveContactPlace({ phone: '314-555-9001' }, { label: 'Work', category: 'work', address: '77 Office Park Dr' });
  assert.equal(withWork.id, created.id);
  assert.deepEqual([withWork.workAddress, withWork.savedPlaces?.length], ['77 Office Park Dr', 2]);
  assert.equal(svc.getContactById(created.id)?.savedPlaces?.length, 2);
  assert.equal(svc.removeContactPlace(created.id, 'nope'), null);
  assert.equal(svc.removeContactPlace('missing-contact', 'x'), null);
  const afterRemove = svc.removeContactPlace(created.id, withWork.savedPlaces![1].id);
  assert.deepEqual([afterRemove?.savedPlaces?.length, afterRemove?.workAddress], [1, '']);
  assert.equal(events >= 4, true, 'ContactService listeners notified on every change');
  unsub();
  svc.resetForTests();
}

function testPopulatePayloadAndMergePolicy(): void {
  console.log('4️⃣  Testing Set Pickup / Set Dropoff Payload + onlyFillEmptyPassenger Merge...');
  const contact: ContactRecord = {
    id: 'c-elena', name: 'Elena Vance', phone: '(314) 555-0144', email: 'elena@bayer.example',
    corporateAccountName: 'Bayer Crop Science', defaultPoNumber: 'PO-BAYR-9001', updatedAt: 1,
  };
  const profile = resolveClientProfileData({ phone: '+13145550144', contacts: [contact], trips: [makeTrip('x1')] });
  const place = {
    id: 'corp_l2', label: 'Gate B', category: 'company' as const, source: 'corporate' as const,
    address: '600 Gate Rd, Creve Coeur, MO', coordinates: { lat: 38.7, lng: -90.4 }, notes: 'Badge required at gate', removable: false,
  };
  const pickupPayload = buildPopulateDraftPayloadFromClientPlace(place, 'pickup', profile);
  assert.equal(pickupPayload.pickupAddress, place.address);
  assert.deepEqual(pickupPayload.pickupCoordinates, place.coordinates);
  assert.equal('dropoffAddress' in pickupPayload, false);
  assert.deepEqual(
    [pickupPayload.passengerName, pickupPayload.passengerEmail, pickupPayload.corporateAccount, pickupPayload.billingPo, pickupPayload.onlyFillEmptyPassenger, pickupPayload.notes],
    ['Elena Vance', 'elena@bayer.example', 'Bayer Crop Science', 'PO-BAYR-9001', true, 'Badge required at gate']
  );
  const dropPayload = buildPopulateDraftPayloadFromClientPlace(place, 'dropoff', profile);
  assert.equal(dropPayload.dropoffAddress, place.address);
  assert.equal('pickupAddress' in dropPayload, false);
  // Blank draft: passenger + corporate hydrate
  const blank = mergePopulateBookingIntoDraftForm({}, pickupPayload);
  assert.deepEqual([blank.passengerName, blank.email, blank.corporateDetails.corporateAccount, blank.corporateDetails.billingPo, blank.paymentMethod],
    ['Elena Vance', 'elena@bayer.example', 'Bayer Crop Science', 'PO-BAYR-9001', 'account']);
  assert.equal(blank.pickupAddress, place.address);
  assert.equal(blank.internalNotes, 'Badge required at gate');
  // Busy draft with a different passenger: passenger + corporate untouched, endpoint + notes applied
  const busyDraft = {
    passengerName: 'Marcus Other', phone: '(314) 555-7777', email: 'marcus@example.test', dropoffAddress: 'Existing Dropoff',
    corporateDetails: { corporateAccount: 'Mercy Hospital', billingPo: 'PO-M-1', authorizedBy: '', invoicingTerms: 'Net 30 Direct Bill' },
    paymentMethod: 'account' as const,
  };
  assert.equal(resolvePopulatePassengerMode(busyDraft, pickupPayload), 'keep_current');
  const busy = mergePopulateBookingIntoDraftForm(busyDraft as any, pickupPayload);
  assert.deepEqual([busy.passengerName, busy.phone, busy.email], ['Marcus Other', '(314) 555-7777', 'marcus@example.test']);
  assert.deepEqual([busy.corporateDetails.corporateAccount, busy.corporateDetails.billingPo], ['Mercy Hospital', 'PO-M-1']);
  assert.equal(busy.pickupAddress, place.address);
  assert.deepEqual(busy.pickupCoordinates, place.coordinates);
  assert.equal(busy.dropoffAddress, 'Existing Dropoff');
  assert.equal(busy.internalNotes, 'Badge required at gate');
  assert.equal(mergePopulateBookingIntoDraftForm(busy, pickupPayload).internalNotes, 'Badge required at gate', 'notes not duplicated on repeat click');
  // Same passenger already on draft: keeps entered values, fills empty fields
  const same = { passengerName: 'Elena Vance', phone: '314-555-0144', email: '' };
  assert.equal(resolvePopulatePassengerMode(same, pickupPayload), 'fill_empty');
  const sameMerged = mergePopulateBookingIntoDraftForm(same as any, pickupPayload);
  assert.deepEqual([sameMerged.passengerName, sameMerged.phone, sameMerged.email], ['Elena Vance', '314-555-0144', 'elena@bayer.example']);
  // Backward compatible: callers without the flag still overwrite
  const legacy = mergePopulateBookingIntoDraftForm(busyDraft as any, { passengerName: 'Elena Vance', pickupAddress: 'X' });
  assert.equal(resolvePopulatePassengerMode(busyDraft, { passengerName: 'Elena Vance' }), 'overwrite');
  assert.equal(legacy.passengerName, 'Elena Vance');
}

function testSsrAndSourceWiring(): void {
  console.log('5️⃣  Testing SSR Markup + Source Wiring...');
  const active = [
    makeTrip('act-1', { status: 'assigned', assignedDriverId: 'drv-1', scheduledPickupTime: FUTURE_ISO }),
    makeTrip('act-2', { status: 'unconfirmed', bookingType: 'asap', scheduledPickupTime: undefined }),
  ];
  const noop = () => {};
  const stripHtml = renderToStaticMarkup(React.createElement(ClientUpcomingRidesStrip, {
    trips: active, nowMs: NOW_MS, onOpenTripDetails: noop, onEditTrip: noop, onFocusTripOnMap: noop,
    drivers: [{ id: 'drv-1', name: 'Zak R', cabNumber: '947', status: 'available', vehicle: 'Car', tier: 'standard', phone: '', zone: '' }],
  }));
  assert.equal(stripHtml.includes('Active &amp; Upcoming Rides (2)'), true);
  assert.equal(stripHtml.includes('>Edit<') && stripHtml.includes('>Map<'), true);
  assert.equal(stripHtml.includes('ASAP') && stripHtml.includes('#947'), true);
  assert.equal(renderToStaticMarkup(React.createElement(ClientUpcomingRidesStrip, { trips: [] })), '');
  const placesHtml = renderToStaticMarkup(React.createElement(ClientSavedPlacesSection, {
    contactId: 'c-1', identity: { phone: '3145550144' }, onSetEndpoint: noop,
    places: [
      { id: 'a', label: 'Home', category: 'home', source: 'contact_field', address: '1 A St', removable: false },
      { id: 'b', label: 'Gym', category: 'favorite', source: 'saved', address: '2 B St', notes: 'Side door', removable: true },
      { id: 'c', label: 'Gate', category: 'company', source: 'corporate', address: '3 C St', removable: false },
      { id: 'd', label: 'Depot', category: 'frequent', source: 'frequent', address: '4 D St', tripCount: 3, removable: false },
    ],
  }));
  for (const needle of ['Saved &amp; Frequent Places', 'Set Pickup', 'Set Dropoff', '+ Save Place', 'Company', 'Frequent ×3', 'Side door', 'Remove saved place']) {
    assert.equal(placesHtml.includes(needle), true, `places markup must include ${needle}`);
  }
  assert.equal((placesHtml.match(/Remove saved place"/g) || []).length, 2, 'only removable places show ✕ (title + aria-label on 1 place)');
  const win = readRel('app/components/domain/dispatch/ClientProfileWindow.tsx');
  for (const needle of [
    'Load into New Tab', 'Load More Trips', '⇄ Book Return', 'buildReturnTabValuesFromClientTrip(trip, nowMs)',
    'buildNewTabValuesFromClientTrip(trip, nowMs)', "getWorkspaceBus().publish('POPULATE_BOOKING', payload)",
    'onPopulateBookingDraft?.(payload)', 'paginateClientTrips(pastTrips, visibleCount)', '<ClientUpcomingRidesStrip', '<ClientSavedPlacesSection',
  ]) assert.equal(win.includes(needle), true, `ClientProfileWindow must include ${needle}`);
  assert.equal(win.indexOf('<ClientSavedPlacesSection') < win.indexOf('Recent Trips ('), true, 'sections mounted above Past Trips');
  const sections = readRel('app/components/domain/dispatch/ClientProfileSections.tsx');
  for (const needle of ['<Select', 'size="xs"', '<LocationAutocomplete', 'saveContactPlace', 'removeContactPlace', "'favorite'", '✓ ${title}', 'Active &amp; Upcoming Rides']) {
    assert.equal(sections.includes(needle), true, `ClientProfileSections must include ${needle}`);
  }
  const workflows = readRel('app/components/domain/dispatch/client-profile-workflows.util.ts');
  assert.equal(/from 'react(-dom)?(\/[^']*)?'/.test(workflows) || /\b(window|document)\./.test(workflows), false, 'workflows util stays React/DOM free');
  const disp = readRel('app/routes/dispatch.tsx');
  for (const needle of ['corporateAccounts={settings.corporateAccounts}', 'onEditTrip={stableEditTripFromWorkspace}', 'onFocusTripOnMap={stableFocusTripOnMapFromWorkspace}', 'onPopulateBookingDraft={stableCommsPopulateBooking}']) {
    assert.equal(disp.includes(needle), true, `dispatch.tsx must wire ${needle}`);
  }
  assert.equal(readRel('app/core/services/workspace-bus.service.ts').includes('onlyFillEmptyPassenger?: boolean'), true);
  const sync = readRel('app/components/domain/dispatch/booking/useDispatchDraftSync.ts');
  assert.equal(sync.includes('resolvePopulatePassengerMode(curPax, payload)'), true, 'engine bus listener honours onlyFillEmptyPassenger');
  const contactSrc = readRel('app/core/services/customer/contact.service.ts');
  assert.equal(contactSrc.includes("export type ContactSavedPlaceCategory = 'home' | 'work' | 'airport' | 'medical' | 'favorite' | 'other'"), true);
}

function testHygieneLineCeilingsAndImmutableFiles(): void {
  console.log('6️⃣  Testing 0 <select>, Secret Hygiene, Line Ceilings & Immutable File Guardrails...');
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${rel} must contain 0 raw <select> tags`);
  }
  const secretShapes = [/AKIA[0-9A-Z]{16}/, /sk_(live|test)_[0-9A-Za-z]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AIza[0-9A-Za-z_-]{30,}/, /ghp_[0-9A-Za-z]{30,}/];
  for (const rel of [
    'app/components/domain/dispatch/client-profile-workflows.util.ts', 'app/components/domain/dispatch/ClientProfileSections.tsx',
    'app/components/domain/dispatch/ClientProfileWindow.tsx', 'scripts/test-client-profile-return-places-and-upcoming-phase70.ts',
  ]) {
    const src = readRel(rel);
    for (const re of secretShapes) assert.equal(re.test(src), false, `${rel} must not contain secret-shaped literals`);
  }
  const ceilings: Array<[string, number]> = [
    ['app/routes/dispatch.tsx', 1600], ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/components/domain/dispatch/queue/TripQueueTableView.tsx', 615], ['app/components/domain/dispatch/queue/TripQueueToolbar.tsx', 1150],
    ['app/components/domain/dispatch/DispatchBookingEngine.tsx', 1800], ['app/components/domain/BookingEngineV2.tsx', 1350],
    ['app/components/domain/dispatch/CommsHub.tsx', 900], ['app/components/domain/booking/AirportCityCombobox.tsx', 280],
    ['app/components/domain/dispatch/map/useLiveMapCustomOverlays.ts', 430], ['app/core/services/corporate-caller-auth.util.ts', 240],
    ['app/components/domain/dispatch/booking/DispatchCorporateAccountCard.tsx', 320], ['app/components/domain/dispatch/map/driver-homes-overlay.util.ts', 240],
    ['scripts/test-corporate-auth-client-window-and-driver-homes-phase69.ts', 400], ['app/components/domain/dispatch/ClientProfileWindow.tsx', 380],
    ['app/components/domain/dispatch/client-trip-history.util.ts', 180], ['app/components/domain/dispatch/client-profile-workflows.util.ts', 240],
    ['app/components/domain/dispatch/ClientProfileSections.tsx', 320], ['scripts/test-client-profile-return-places-and-upcoming-phase70.ts', 400],
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

function main(): void {
  console.log('🚀 Running Platform Phase 70 Verification Suite...\n');
  testReturnAndFutureSafeClone();
  testPartitionActiveUpcomingAndPast();
  testSavedPlacesResolverAndContactService();
  testPopulatePayloadAndMergePolicy();
  testSsrAndSourceWiring();
  testHygieneLineCeilingsAndImmutableFiles();
  console.log('\n✅ ALL PLATFORM PHASE 70 VERIFICATION CHECKS PASSED!');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
