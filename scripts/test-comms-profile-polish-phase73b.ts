/**
 * Platform Phase 73.B (Wave 6 Phase 8.B) Automated Verification Suite:
 * Comms & `Profile` v2.1 Polish (`scripts/test-comms-profile-polish-phase73b.ts`)
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientProfileHeaderCard } from '../app/components/domain/dispatch/ClientProfileHeaderCard';
import { ClientProfileWindow, normalizeClientProfileTab, resolveClientProfileData } from '../app/components/domain/dispatch/ClientProfileWindow';
import { CommsHub } from '../app/components/domain/dispatch/CommsHub';
import { DispatchPassengerCrmSection } from '../app/components/domain/dispatch/booking/DispatchPassengerCrmSection';
import { CommsFilterToolbar } from '../app/components/domain/dispatch/comms/CommsFilterToolbar';
import { CommsBottomNewSmsSheet, NewSmsMessageModal } from '../app/components/domain/dispatch/comms/CommsModals';
import { SmsThreadPane } from '../app/components/domain/dispatch/comms/SmsThreadPane';
import { SoftphoneDialerPane } from '../app/components/domain/dispatch/comms/SoftphoneDialerPane';
import { buildActiveRideSmsPassengerChips, buildOmnichannelTimelineItems, resolveTripCabBadgeLabel } from '../app/components/domain/dispatch/comms/comms-timeline.util';
import { COMMS_ALL_VIEW_MODE_STORAGE_KEY, type InteractionEvent } from '../app/components/domain/dispatch/comms/comms-types';
import { buildUnifiedCommsThreadSummaries, filterCommsInteractionEvents, resolveCommsCrmContext, resolveTripFlightBadge, toggleCommsMultiFilter } from '../app/core/services/comms/comms-templates.service';
import { getContactService } from '../app/core/services/customer/contact.service';
import { getWorkspaceBus, type WorkspaceMessage } from '../app/core/services/workspace-bus.service';
import type { Trip } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();
const readRel = (rel: string): string => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
const NOW_MS = Date.UTC(2026, 10, 24, 18, 0, 0);
const noop = () => {};

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
  const iso = new Date(NOW_MS).toISOString();
  return {
    id, status: 'completed', offeredToIds: [], rejectedByIds: [], assignedDriverId: 'drv-947',
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled', scheduledPickupTime: iso,
    passenger: { firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example', phone: '(314) 555-0144', passengerCount: 2, luggageCount: 1 },
    vehicleTier: 'premium',
    pricing: { baseFare: 15, distanceMiles: 18, durationMinutes: 22, distanceRate: 45, timeRate: 0, vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 60, totalFare: 68.5, currency: 'USD' },
    payment: { method: 'corporate', status: 'settled', amount: 68.5 },
    statusHistory: [], createdAt: iso, updatedAt: iso, ...overrides,
  };
}

function testProfileRenameAndThreeTabClientProfileWindow(): void {
  console.log('1️⃣  Testing `Profile` Button Rename + 3-Tab ClientProfileWindow (Trips | Places | Contact) + [Thread] Jump...');
  assert.equal(normalizeClientProfileTab('overview'), 'trips');
  assert.equal(normalizeClientProfileTab('edit'), 'contact');
  assert.equal(normalizeClientProfileTab('trips'), 'trips');
  assert.equal(normalizeClientProfileTab('places'), 'places');
  assert.equal(normalizeClientProfileTab('contact'), 'contact');
  assert.equal(normalizeClientProfileTab(undefined), 'trips');

  const crmHtml = renderToStaticMarkup(
    React.createElement(DispatchPassengerCrmSection, {
      passengerName: 'Elena Vance', setPassengerName: noop, phone: '(314) 555-0144', setPhone: noop,
      email: 'elena@bayer.example', setEmail: noop, additionalPassengers: [], setAdditionalPassengers: noop,
      isBookerDifferent: false, setIsBookerDifferent: noop, contactName: '', setContactName: noop,
      contactPhone: '', setContactPhone: noop, contactEmail: '', setContactEmail: noop,
      contactRole: 'Other', setContactRole: noop, lookupTrips: [], corporateAccountList: [],
      setCorporateAccount: noop, setPaymentMethod: noop, setBillingPo: noop,
      pickupAddress: '', dropoffAddress: '', setPickupAddress: noop, setPickupCoordinates: noop,
      setDropoffAddress: noop, setDropoffCoordinates: noop, onAddPassenger: noop, onRemovePassenger: noop,
    })
  );
  assert.equal(crmHtml.includes('<span>Profile</span>') && !crmHtml.includes('<span>Client Profile</span>'), true);

  const svc = getContactService();
  svc.resetForTests();
  const saved = svc.upsertContact({
    name: 'Elena Vance', phone: '+13145550144', email: 'elena@bayer.example',
    isVip: true, corporateAccountName: 'Bayer Crop Science', homeAddress: '16625 Swingley Ridge Rd',
  });
  const pastTrip = makeTrip('TRP-7301', { status: 'completed', scheduledPickupTime: new Date(NOW_MS - 7_200_000).toISOString() });
  const activeTrip = makeTrip('TRP-7302', { status: 'assigned', scheduledPickupTime: new Date(NOW_MS + 3_600_000).toISOString() });

  const tripsTabHtml = renderToStaticMarkup(
    React.createElement(ClientProfileWindow, {
      trips: [pastTrip, activeTrip], initialOpen: true, initialTarget: { phone: '+13145550144' },
      initialTab: 'trips', onLoadTripIntoNewTab: noop, onCallClient: noop,
    })
  );
  for (const needle of ['>Trips<', '>Places<', '>Contact<', 'data-client-profile-thread-btn="true"', '>Thread<', '>Call<', 'Active &amp; Upcoming Rides (1)', 'Recent Trips (1 of 1)', 'Load into New Tab', '⇄ Book Return']) {
    assert.equal(tripsTabHtml.includes(needle), true, `Trips tab markup must include ${needle}`);
  }

  const placesTabHtml = renderToStaticMarkup(
    React.createElement(ClientProfileWindow, {
      trips: [pastTrip, activeTrip], initialOpen: true, initialTarget: { phone: '+13145550144' },
      initialTab: 'places', onLoadTripIntoNewTab: noop, onCallClient: noop,
    })
  );
  for (const needle of ['data-client-profile-thread-btn="true"', 'Saved &amp; Frequent Places', 'Set Pickup', 'Set Dropoff', '+ Save Place']) {
    assert.equal(placesTabHtml.includes(needle), true, `Places tab markup must include ${needle}`);
  }
  assert.equal(placesTabHtml.includes('Recent Trips ('), false, 'Places tab must only render Places content below header');

  const contactTabHtml = renderToStaticMarkup(
    React.createElement(ClientProfileWindow, {
      trips: [pastTrip, activeTrip], initialOpen: true, initialTarget: { phone: '+13145550144' },
      initialTab: 'contact', onLoadTripIntoNewTab: noop, onCallClient: noop,
    })
  );
  for (const needle of ['data-client-profile-thread-btn="true"', 'Home &amp; Work Addresses', 'Save Profile']) {
    assert.equal(contactTabHtml.includes(needle), true, `Contact tab markup must include ${needle}`);
  }

  const profile = resolveClientProfileData({ phone: '+13145550144', contacts: [saved], trips: [pastTrip] });
  const headerHtml = renderToStaticMarkup(React.createElement(ClientProfileHeaderCard, { profile, onCallClient: noop }));
  assert.equal(headerHtml.includes('data-client-profile-thread-btn="true"') && headerHtml.includes('>Thread<'), true);

  const busMessages: WorkspaceMessage[] = [];
  const unsub = getWorkspaceBus().subscribe((m) => busMessages.push(m));
  getWorkspaceBus().publish('OPEN_COMMS_THREAD', { phone: '+13145550144', email: 'elena@bayer.example' });
  getWorkspaceBus().publish('FOCUS_MODULE', { moduleKey: 'comms' });
  unsub();
  assert.deepEqual(busMessages.map((m) => m.type), ['OPEN_COMMS_THREAD', 'FOCUS_MODULE']);
  svc.resetForTests();
}

function testOpenTripDetailsBusCabFlightBadgesAndQuickName(): void {
  console.log('2️⃣  Testing OPEN_TRIP_DETAILS Bus, Clickable #TRIP_ID, #Cab & Flight Badges + Inline Quick-Name...');
  const received: WorkspaceMessage[] = [];
  const unsub = getWorkspaceBus().subscribe((m) => received.push(m));
  getWorkspaceBus().publish('OPEN_TRIP_DETAILS', { tripId: 'TRP-7302', initialTab: 'details' });
  unsub();
  assert.equal(received.length === 1 && received[0].type === 'OPEN_TRIP_DETAILS' && received[0].payload.tripId === 'TRP-7302', true);

  const syncSrc = readRel('app/core/hooks/dispatch/useDispatchWorkspaceSync.ts');
  assert.equal(syncSrc.includes("msg.type === 'OPEN_TRIP_DETAILS'") && syncSrc.includes("onOpenReviewModalRef.current?.(found, msg.payload.initialTab || 'details')"), true);
  assert.equal(readRel('app/routes/dispatch.tsx').includes('onOpenReviewModal: handleOpenReviewModal'), true);

  const drivers = [{ id: 'drv-947', name: 'Zak R', cabNumber: '947', phone: '+13149151800' }];
  assert.deepEqual(resolveTripCabBadgeLabel(makeTrip('t1', { assignedDriverId: 'drv-947' }), drivers), { label: '#947', tone: 'assigned' });
  assert.deepEqual(resolveTripCabBadgeLabel(makeTrip('t2', { assignedDriverId: null, plannedDriverId: 'drv-947' }), drivers), { label: '#947 staged', tone: 'staged' });
  assert.deepEqual(resolveTripCabBadgeLabel(makeTrip('t3', { assignedDriverId: null, plannedDriverId: undefined }), drivers), { label: 'Unassigned', tone: 'unassigned' });

  const delayedFlightTrip = makeTrip('TRP-7302', {
    status: 'en_route', assignedDriverId: 'drv-947',
    scheduledPickupTime: new Date(NOW_MS + 1_800_000).toISOString(),
    pickupLocation: { address: 'Lambert-St. Louis International Airport (STL), St. Louis, MO' },
    flightTelemetry: {
      flightIdent: 'DL1492', airlineCode: 'DL', airlineName: 'Delta Air Lines', flightNumber: '1492',
      serviceDate: '2026-11-24', status: 'delayed', delayMinutes: 40, originIata: 'ATL', destinationIata: 'STL',
      terminal: 'Terminal 1', provider: 'aerodatabox', isSimulatedFallback: false,
      checkedAt: new Date(NOW_MS).toISOString(), cacheExpiresAt: new Date(NOW_MS + 900_000).toISOString(),
    },
  });
  const stagedPastTrip = makeTrip('TRP-7301', {
    status: 'completed', assignedDriverId: null, plannedDriverId: 'drv-947',
    scheduledPickupTime: new Date(NOW_MS - 3_600_000).toISOString(),
  });
  assert.equal(resolveTripFlightBadge(delayedFlightTrip).hasFlight && resolveTripFlightBadge(delayedFlightTrip).label.includes('Delayed +40m'), true);

  const emailWithTrip: InteractionEvent = {
    id: 'em_trip_73b', type: 'email_inbound', contactName: '(314) 555-0144', contactPhone: '+13145550144',
    contactEmail: 'elena@bayer.example', contactType: 'passenger', tripId: 'TRP-7302',
    subject: 'Flight DL1492 Delay', timestamp: '11:55 AM', timestampMs: NOW_MS - 300_000, snippet: 'Landing at STL T1',
  };
  const crm = resolveCommsCrmContext({ phone: '+13145550144', trips: [stagedPastTrip, delayedFlightTrip], drivers });

  const threadHtml = renderToStaticMarkup(
    React.createElement(SmsThreadPane, {
      mode: 'thread', activeContactSummary: emailWithTrip, activeContactRecord: null, threadCrmContext: crm,
      trips: [stagedPastTrip, delayedFlightTrip], drivers, nowMs: NOW_MS,
      onBackFromThread: noop, onOpenContactEdit: noop, onBookContactRide: noop, onOpenTripDetails: noop,
      threadTab: 'all', onChangeThreadTab: noop, selectedInteractions: [emailWithTrip],
      playingCallId: null, onTogglePlayCall: noop, playingVoicemailId: null, onTogglePlayVoicemail: noop,
      playbackSpeed: 1, onCyclePlaybackSpeed: noop, onStartCall: noop, onConvertVoicemailToBooking: noop,
      smsReplyText: '', onChangeSmsReplyText: noop, isSendingSms: false, onSendSms: noop,
      smsStatusMessage: null, onSelectContact: noop, onOpenFreshNewMessageModal: noop,
    })
  );
  for (const needle of [
    'data-open-trip-details="TRP-7302"', 'data-open-trip-details="TRP-7301"',
    '>#947<', '>#947 staged<', 'Delayed +40m', 'data-quick-name-trigger="true"', '>Profile<',
  ]) {
    assert.equal(threadHtml.includes(needle), true, `Thread SSR markup must include ${needle}`);
  }
  assert.equal((threadHtml.match(/data-open-trip-details=/g) || []).length, 4, 'Pinned pill + 2 timeline trip cards + linked email card must all have clickable #TRIP_ID');

  const smsPaneSrc = readRel('app/components/domain/dispatch/comms/SmsThreadPane.tsx');
  assert.equal(smsPaneSrc.includes('data-quick-name-input="true"') && smsPaneSrc.includes('getContactService().upsertContact') && smsPaneSrc.includes('mergeThreadsForContact'), true);

  const dialerHtml = renderToStaticMarkup(
    React.createElement(SoftphoneDialerPane, {
      callStatus: 'idle', bookingToast: null, activeCallContact: null, activeCallPhone: null, dialpadNumber: '3145550144',
      onChangeDialpadNumber: noop, dialpadInputRef: { current: null }, callTimer: 0, isMuted: false, callNotice: null,
      showInCallKeypad: false, onToggleInCallKeypad: noop, onInCallBookRide: noop, onInCallSendLink: noop,
      onSendInCallDtmf: noop, onToggleMute: noop, onToggleHold: noop, onEndCall: noop, softphoneStatus: 'ready',
      operatorPhoneInput: '', onChangeOperatorPhoneInput: noop, isEditingOperatorPhone: false,
      onToggleEditingOperatorPhone: noop, onSaveOperatorPhone: noop, onCancelEditingOperatorPhone: noop,
      activeKeypadFeedback: null, onDialDigit: noop, onDeleteDialDigit: noop, onClearDialpad: noop,
      onStartCall: noop, drivers: [], callerCrmContext: crm,
    })
  );
  assert.equal(dialerHtml.includes('<span>Profile</span>') && !dialerHtml.includes('Client Profile'), true);
}

function testMultiSelectFiltersAndGroupedVsStreamAllTab(): void {
  console.log('3️⃣  Testing Multi-Select Filter ▾ (List & Thread) + Grouped | Stream All Tab Toggle...');
  assert.equal(COMMS_ALL_VIEW_MODE_STORAGE_KEY, 'ct_comms_all_view_mode');
  assert.deepEqual(toggleCommsMultiFilter(['sms'], 'trips'), ['sms', 'trips']);
  assert.deepEqual(toggleCommsMultiFilter(['sms', 'trips'], 'sms'), ['trips']);

  const trip = makeTrip('TRP-7301', { status: 'completed', scheduledPickupTime: new Date(NOW_MS - 1_800_000).toISOString() });
  const events: InteractionEvent[] = [
    { id: 'sms_1', type: 'sms_inbound', contactName: 'Elena Vance', contactPhone: '+13145550144', contactType: 'passenger', timestamp: '11:10 AM', timestampMs: NOW_MS - 3_600_000, snippet: 'Text 1' },
    { id: 'call_1', type: 'call_outbound', contactName: 'Elena Vance', contactPhone: '+13145550144', contactType: 'driver', timestamp: '11:20 AM', timestampMs: NOW_MS - 2_400_000, snippet: 'Call 1' },
    { id: 'em_1', type: 'email_inbound', contactName: 'Corp Desk', contactPhone: '+13145550999', contactEmail: 'corp@bayer.example', contactType: 'corporate', timestamp: '11:30 AM', timestampMs: NOW_MS - 1_200_000, snippet: 'Email 1' },
    { id: 'note_1', type: 'internal_note', contactName: 'Elena Vance', contactPhone: '+13145550144', contactType: 'passenger', timestamp: '11:40 AM', timestampMs: NOW_MS - 600_000, snippet: 'Note 1' },
  ];

  const smsAndTrips = buildOmnichannelTimelineItems({
    events, trips: [trip], contactPhone: '+13145550144', timelineFilters: ['sms', 'trips'], nowMs: NOW_MS,
  });
  assert.deepEqual(
    smsAndTrips.items.map((it) => (it.kind === 'trip' ? `trip:${it.trip.id}` : `evt:${it.event.id}`)),
    ['evt:sms_1', 'trip:TRP-7301']
  );
  const emptyMeansAll = buildOmnichannelTimelineItems({
    events, trips: [trip], contactPhone: '+13145550144', timelineFilters: [], nowMs: NOW_MS,
  });
  assert.equal(emptyMeansAll.items.length, 5);

  const callsAndEmails = filterCommsInteractionEvents(events, { channelFilters: ['calls', 'emails'] });
  assert.deepEqual(callsAndEmails.map((e) => e.id), ['call_1', 'em_1']);
  const corpOnly = filterCommsInteractionEvents(events, { contactFilters: ['corporate'] });
  assert.deepEqual(corpOnly.map((e) => e.id), ['em_1']);
  const groupedCallsEmails = buildUnifiedCommsThreadSummaries(events, [], { channelFilters: ['calls', 'emails'] });
  assert.equal(groupedCallsEmails.length, 2);

  const toolbarHtml = renderToStaticMarkup(
    React.createElement(CommsFilterToolbar, {
      searchQuery: '', onChangeSearchQuery: noop, channelFilters: ['calls', 'emails'],
      contactFilters: ['corporate'], filterUnreadOnly: false, onToggleUnreadOnly: noop,
      unreadCount: 2, onMarkAllRead: noop, onRefresh: noop, showAllViewModeToggle: true, allViewMode: 'grouped',
    })
  );
  assert.equal(toolbarHtml.includes('data-comms-all-view-toggle="true"') && toolbarHtml.includes('>Grouped<') && toolbarHtml.includes('>Stream<') && toolbarHtml.includes('>3<'), true);

  for (const rel of ['app/components/domain/dispatch/comms/CommsFilterToolbar.tsx', 'app/components/domain/dispatch/comms/SmsThreadPane.tsx']) {
    const src = readRel(rel);
    assert.equal(src.includes('w-3.5 h-3.5 rounded-[4px]') && src.includes('bg-blue-50/80 text-blue-700') && src.includes('>All<') && src.includes('>Clear<'), true, `${rel} must match MapLayersAndVehiclesToolbar checkbox parity`);
  }

  const groupedHubHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all', initialAllViewMode: 'grouped' }));
  const streamHubHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all', initialAllViewMode: 'stream' }));
  assert.equal(groupedHubHtml.includes('No Conversations Found') && streamHubHtml.includes('No communications match the active filter.'), true);
}

function testBottomNewSmsFabAndSheetWithActiveRideChips(): void {
  console.log('4️⃣  Testing Bottom-Right New SMS FAB + Dock-Bottom Slide-Up Sheet w/ Active-Ride Chips...');
  const activeTrip = makeTrip('TRP-7302', { status: 'en_route', scheduledPickupTime: new Date(NOW_MS + 900_000).toISOString() });
  const pastTrip = makeTrip('TRP-7301', {
    status: 'completed', passenger: { firstName: 'Old', lastName: 'Rider', email: '', phone: '(314) 555-0199', passengerCount: 1, luggageCount: 0 },
  });
  const chips = buildActiveRideSmsPassengerChips([pastTrip, activeTrip], NOW_MS);
  assert.equal(chips.length === 1 && chips[0].tripId === 'TRP-7302' && chips[0].passengerName === 'Elena Vance', true);

  const hubClosedHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all', trips: [activeTrip] }));
  assert.equal(hubClosedHtml.includes('data-comms-new-sms-fab="true"') && hubClosedHtml.includes('absolute bottom-3.5 right-3.5 z-30') && hubClosedHtml.includes('<span>New SMS</span>'), true);
  assert.equal(hubClosedHtml.includes('<span>New</span>'), false, 'Top-row + New button must be removed');
  assert.equal(hubClosedHtml.includes('data-comms-bottom-sms-sheet="true"'), false);

  const hubOpenSheetHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all', initialNewSmsSheetOpen: true, trips: [activeTrip] }));
  assert.equal(hubOpenSheetHtml.includes('data-comms-bottom-sms-sheet="true"') && hubOpenSheetHtml.includes('data-active-ride-sms-chip="TRP-7302"'), true);
  assert.equal(hubOpenSheetHtml.includes('data-comms-new-sms-fab="true"'), false, 'FAB hides while bottom sheet is open');

  const sheetHtml = renderToStaticMarkup(
    React.createElement(CommsBottomNewSmsSheet, {
      isOpen: true, trips: [activeTrip], nowMs: NOW_MS, newMsgError: null, msgContactSearch: '',
      newMsgRecipientPhone: '+13145550144', newMsgRecipientName: 'Elena Vance', newMsgBody: 'Car #947 arriving',
      isSendingNewMsg: false, isMsgContactDropdownOpen: false, filteredContactsForMsg: [],
      recipientCrmContext: resolveCommsCrmContext({ phone: '+13145550144', trips: [activeTrip] }),
      onInsertTrackingLink: noop, onInsertPayLink: noop, onRecipientInputChange: noop, onRecipientInputFocus: noop,
      onSelectContactOption: noop, onBodyChange: noop, onSelectPresetChip: noop, onOpenThread: noop, onSend: noop, onClose: noop,
    })
  );
  for (const needle of [
    'data-comms-bottom-sms-sheet="true"', 'absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl',
    'data-active-ride-sms-chip="TRP-7302"', 'Elena Vance · #TRP-7302', '+ Tracking', '+ Pay', '>Thread<', '>Send<',
  ]) {
    assert.equal(sheetHtml.includes(needle), true, `Bottom SMS sheet markup must include ${needle}`);
  }
  assert.equal(typeof NewSmsMessageModal, 'function', 'NewSmsMessageModal must remain exported');
}

function testCeilingsHygieneAndImmutableFiles(): void {
  console.log('5️⃣  Testing Line Ceilings, 0 <select>, 0 Blocking Overlays, 0 Secrets & Immutable Files...');
  const ceilings: Array<[string, number]> = [
    ['app/components/domain/dispatch/CommsHub.tsx', 360],
    ['app/components/domain/dispatch/comms/SmsThreadPane.tsx', 380],
    ['app/components/domain/dispatch/comms/CommsFilterToolbar.tsx', 250],
    ['app/components/domain/dispatch/comms/CommsModals.tsx', 250],
    ['app/components/domain/dispatch/ClientProfileWindow.tsx', 340],
    ['app/components/domain/dispatch/ClientProfileHeaderCard.tsx', 120],
    ['app/components/domain/dispatch/ClientProfileEditTab.tsx', 285],
    ['app/components/domain/dispatch/comms/comms-timeline.util.ts', 220],
    ['scripts/test-comms-profile-polish-phase73b.ts', 360],
  ];
  for (const [rel, maxLines] of ceilings) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }

  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${filePath} must have 0 <select>`);
  }

  const secretShapes = [/\bAC[0-9a-f]{32}\b/i, /\bSK[0-9a-f]{32}\b/i, /\bAP[0-9a-f]{32}\b/i, /AKIA[0-9A-Z]{16}/, /sk_(live|test)_[0-9A-Za-z]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  for (const [rel] of ceilings) {
    const src = readRel(rel);
    assert.equal(/bg-slate-950\/(60|65|35)|bg-slate-900\/50/.test(src), false, `${rel} must contain 0 blocking overlays`);
    if (rel.startsWith('app/')) assert.equal(/from\s+['"][^'"]*\.server['"]|from\s+['"]node:/.test(src), false);
    for (const re of secretShapes) assert.equal(re.test(src), false, `${rel} must contain 0 secret-shaped literals`);
  }

  const gitStatus = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(gitStatus.includes('firestore.rules'), false);
  assert.equal(gitStatus.includes('vercel.json'), false);
  assert.equal(gitStatus.includes('DriverAssignDropdown.tsx'), false);
}

console.log('🚀 Running Platform Phase 73.B Comms & Profile v2.1 Polish Verification Suite...\n');
testProfileRenameAndThreeTabClientProfileWindow();
testOpenTripDetailsBusCabFlightBadgesAndQuickName();
testMultiSelectFiltersAndGroupedVsStreamAllTab();
testBottomNewSmsFabAndSheetWithActiveRideChips();
testCeilingsHygieneAndImmutableFiles();
console.log('\n✅ ALL PLATFORM PHASE 73.B VERIFICATION CHECKS PASSED!');
