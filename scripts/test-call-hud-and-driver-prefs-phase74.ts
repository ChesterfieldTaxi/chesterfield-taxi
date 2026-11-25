/**
 * Platform Phase 74 (Wave 6 Phase 9) Automated Verification Suite:
 * Call HUD Simplification, `Messages` Rename, Bottom `Keypad` FAB,
 * Explicit `Trips | Places | Profile` Window & Client Preferred/Excluded Drivers Engine
 * (`scripts/test-call-hud-and-driver-prefs-phase74.ts`)
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ClientDriverPreferencesCard,
  addExcludedDriver,
  addPreferredDriver,
  movePreferredDriver,
  removeExcludedDriver,
  removePreferredDriver,
} from '../app/components/domain/dispatch/ClientDriverPreferencesCard';
import { ClientProfileEditTab } from '../app/components/domain/dispatch/ClientProfileEditTab';
import { ClientProfileWindow, normalizeClientProfileTab, resolveClientProfileData } from '../app/components/domain/dispatch/ClientProfileWindow';
import { CommsHub } from '../app/components/domain/dispatch/CommsHub';
import { DispatchHeaderCallHud, formatHudCallTimer } from '../app/components/domain/dispatch/DispatchHeaderCallHud';
import { publishPassengerCandidateTripsProfile } from '../app/components/domain/dispatch/booking/DispatchPassengerCrmSection';
import { resolveTripClientDriverPreferencesMetadata } from '../app/components/domain/dispatch/booking/useDispatchBookingSubmission';
import { CommsComposerBar } from '../app/components/domain/dispatch/comms/CommsComposerBar';
import { MULTI_CHANNEL_FILTER_OPTS } from '../app/components/domain/dispatch/comms/CommsFilterToolbar';
import { CommsBottomNewSmsSheet } from '../app/components/domain/dispatch/comms/CommsModals';
import { SmsThreadPane, THREAD_TIMELINE_FILTER_OPTS } from '../app/components/domain/dispatch/comms/SmsThreadPane';
import { SoftphoneDialerPane } from '../app/components/domain/dispatch/comms/SoftphoneDialerPane';
import { getContactService, normalizeClientDriverPreferences } from '../app/core/services/customer/contact.service';
import { evaluateAutoDispatchCandidates, type AutoDispatchDriverInput } from '../app/core/services/dispatch/auto-dispatch-ranking';
import { getWorkspaceBus, type WorkspaceMessage } from '../app/core/services/workspace-bus.service';
import type { Trip } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();
const readRel = (rel: string): string => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
const NOW_MS = Date.UTC(2026, 10, 25, 7, 0, 0);
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
    id, status: 'pending', offeredToIds: [], rejectedByIds: [], assignedDriverId: null,
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017', coordinates: { lat: 38.663, lng: -90.577 } },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145', coordinates: { lat: 38.748, lng: -90.37 } },
    bookingType: 'asap', scheduledPickupTime: iso,
    passenger: { firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example', phone: '(314) 555-0144', passengerCount: 2, luggageCount: 1 },
    vehicleTier: 'standard',
    pricing: { baseFare: 15, distanceMiles: 18, durationMinutes: 22, distanceRate: 45, timeRate: 0, vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 60, totalFare: 68.5, currency: 'USD' },
    payment: { method: 'corporate', status: 'pending', amount: 68.5 },
    statusHistory: [], createdAt: iso, updatedAt: iso, ...overrides,
  };
}

function testFloatingCallPillRetiredMessagesRenameAndKeypadFabs(): void {
  console.log('1️⃣  Testing FloatingCallPill Deleted, Messages Rename & Context-Aware Keypad / New Message FABs...');
  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'app/components/domain/dispatch/FloatingCallPill.tsx')), false);
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.(ts|tsx)$/)) {
    assert.equal(fs.readFileSync(filePath, 'utf8').includes('FloatingCallPill'), false);
  }

  assert.equal(readRel('app/components/domain/dispatch/workspace/DispatchRightOperationsDock.tsx').includes('Phone &amp; Messages'), true);
  assert.equal(MULTI_CHANNEL_FILTER_OPTS.find((o) => o.value === 'messages')?.label, 'Messages');
  assert.equal(THREAD_TIMELINE_FILTER_OPTS.find((o) => o.value === 'sms')?.label, 'Messages');

  const popoutHubHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all', isPopout: true }));
  assert.equal(popoutHubHtml.includes('Phone &amp; Messages'), true);
  for (const tabLabel of ['>All<', '>Calls<', '>Messages<', '>VM<']) {
    assert.equal(popoutHubHtml.includes(tabLabel), true, `CommsHub must render ${tabLabel}`);
  }

  const allTabHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all' }));
  assert.equal(allTabHtml.includes('Phone &amp; Messages'), false, 'Docked CommsHub Row 1 hides duplicate title');
  assert.equal(allTabHtml.includes('data-comms-keypad-fab="true"') && allTabHtml.includes('<span>Keypad</span>'), true);
  assert.equal(allTabHtml.includes('data-comms-new-sms-fab="true"') && allTabHtml.includes('<span>New Message</span>'), true);

  const phoneTabHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'phone' }));
  assert.equal(phoneTabHtml.includes('data-comms-keypad-fab="true"'), true);
  assert.equal(phoneTabHtml.includes('data-comms-new-sms-fab="true"'), false);
  assert.equal(phoneTabHtml.includes('data-comms-calls-subtoggle="true"') && phoneTabHtml.includes('>Missed<'), true);

  const vmTabHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'voicemail' }));
  assert.equal(vmTabHtml.includes('data-comms-keypad-fab="true"'), true);
  assert.equal(vmTabHtml.includes('data-comms-new-sms-fab="true"'), false);

  const msgTabHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'messages' }));
  assert.equal(msgTabHtml.includes('data-comms-keypad-fab="true"'), false);
  assert.equal(msgTabHtml.includes('data-comms-new-sms-fab="true"') && msgTabHtml.includes('+ New Message'), true);

  const sheetHtml = renderToStaticMarkup(React.createElement(CommsBottomNewSmsSheet, {
    isOpen: true, newMsgError: null, msgContactSearch: '', newMsgRecipientPhone: '', newMsgRecipientName: '',
    newMsgBody: '', isSendingNewMsg: false, isMsgContactDropdownOpen: false, filteredContactsForMsg: [],
    onRecipientInputChange: noop, onRecipientInputFocus: noop, onSelectContactOption: noop,
    onBodyChange: noop, onSelectPresetChip: noop, onOpenThread: noop, onSend: noop, onClose: noop,
  }));
  assert.equal(sheetHtml.includes('<span>New Message</span>'), true);

  const composerHtml = renderToStaticMarkup(React.createElement(CommsComposerBar, {
    effectivePhone: '+13145550144', voiceOnlyMode: false, smsReplyText: '', onChangeSmsReplyText: noop,
    onSendSms: noop, isSendingSms: false, noteDraftText: '', onChangeNoteDraftText: noop, onAddInternalNote: noop,
  }));
  assert.equal(composerHtml.includes('>Message<') && composerHtml.includes('>Note<') && composerHtml.includes('placeholder="Message (314) 555-0144..."'), true);

  const idleDialerHtml = renderToStaticMarkup(React.createElement(SoftphoneDialerPane, {
    callStatus: 'idle', bookingToast: null, activeCallContact: null, activeCallPhone: null, dialpadNumber: '',
    onChangeDialpadNumber: noop, dialpadInputRef: { current: null }, callTimer: 0, isMuted: false, callNotice: null,
    showInCallKeypad: false, onToggleInCallKeypad: noop, onInCallBookRide: noop, onInCallSendLink: noop,
    onSendInCallDtmf: noop, onToggleMute: noop, onToggleHold: noop, onEndCall: noop, softphoneStatus: 'ready',
    operatorPhoneInput: '', onChangeOperatorPhoneInput: noop, isEditingOperatorPhone: false,
    onToggleEditingOperatorPhone: noop, onSaveOperatorPhone: noop, onCancelEditingOperatorPhone: noop,
    activeKeypadFeedback: null, onDialDigit: noop, onDeleteDialDigit: noop, onClearDialpad: noop,
    onStartCall: noop, drivers: [], onBackToHistory: noop,
  }));
  assert.equal(idleDialerHtml.includes('data-dialer-back-to-calls="true"') && idleDialerHtml.includes('← Calls'), true);
}

function testContextAwareDispatchHeaderCallHudFourStates(): void {
  console.log('2️⃣  Testing 4-State DispatchHeaderCallHud, Maximize Keypad Button & Non-Disruptive Calling...');
  assert.equal(formatHudCallTimer(125), '02:05');
  const hudSrc = readRel('app/components/domain/dispatch/DispatchHeaderCallHud.tsx');
  assert.equal(hudSrc.includes('playInboundCallRing'), false, 'Duplicate playInboundCallRing interval must be removed');
  for (const evt of ['ANSWER_INCOMING_CALL', 'REJECT_INCOMING_CALL', 'TOGGLE_CALL_MUTE', 'CALL_MUTE_CHANGED', 'SEND_CALL_DTMF', 'CALL_ENDED', 'OPEN_SOFTPHONE_KEYPAD', 'SOFTPHONE_VIEW_STATE_CHANGED']) {
    assert.equal(hudSrc.includes(evt), true, `DispatchHeaderCallHud must wire ${evt}`);
  }

  const contactSvc = getContactService();
  contactSvc.resetForTests();
  contactSvc.upsertContact({ name: 'Elena Vance', phone: '+13145550144', email: 'elena@bayer.example', isVip: true });

  // State 1: Incoming Call -> pill + auto-open Flydown Card
  const incomingHtml = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
    incomingCallAlert: { from: '+13145550144', callSid: 'CA_INC_74' },
    isPhoneDockActive: true, commsActiveTab: 'phone', commsCallsSubTab: 'keypad',
  }));
  for (const needle of ['data-call-hud-state="incoming"', 'data-call-hud-flydown="true"', 'Elena Vance', '>Answer<', '>Decline<', '>Book<', '>Trips<', '>Phone Dock<']) {
    assert.equal(incomingHtml.includes(needle), true, `Incoming state must include ${needle}`);
  }

  // State 2: Outgoing/Connected + Comms Dock Closed (!isPhoneDockActive) -> pill + auto-open Call in Progress Flydown
  const dockClosedHtml = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
    isPhoneDockActive: false, activeDockTab: 'none', activeCallStatus: 'connected',
    activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 125 },
    callDuration: 125, initialKeypadOpen: true,
  }));
  for (const needle of ['data-call-hud-state="active-dock-closed"', '● 02:05 · Elena Vance', 'data-maximize-keypad-btn="true"', 'data-call-hud-flydown="true"', 'Call in Progress', '>Mute<', '>Hold<', '>Keypad<', '>End Call<', '>Book<', '>Trips<', '>Open Phone Dock<', '>*<', '>#<']) {
    assert.equal(dockClosedHtml.includes(needle), true, `Active dock-closed state must include ${needle}`);
  }

  // State 3: Outgoing/Connected + isKeypadTabVisible -> completely hidden
  const keypadVisibleHtml = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
    isPhoneDockActive: true, commsActiveTab: 'phone', commsCallsSubTab: 'keypad',
    activeCallStatus: 'connected', activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 42 },
  }));
  assert.equal(keypadVisibleHtml, '', 'Header pill & flydown must hide completely when Phone -> Keypad is visible');

  // State 4: Outgoing/Connected + Switched Away from Keypad (Messages tab or Email/Drivers dock) -> compact pill, flydown closed by default
  const switchedCommsHtml = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
    isPhoneDockActive: true, commsActiveTab: 'messages', commsCallsSubTab: 'history',
    activeCallStatus: 'connected', activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 125 }, callDuration: 125,
  }));
  assert.equal(switchedCommsHtml.includes('data-call-hud-state="active-compact"') && switchedCommsHtml.includes('● 02:05 · Elena Vance') && switchedCommsHtml.includes('data-maximize-keypad-btn="true"'), true);
  assert.equal(switchedCommsHtml.includes('data-call-hud-flydown="true"'), false, 'Flydown must default closed when switched away from Keypad');

  const emailDockHtml = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
    isPhoneDockActive: false, activeDockTab: 'email',
    activeCallStatus: 'connected', activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 65 }, callDuration: 65,
  }));
  assert.equal(emailDockHtml.includes('data-call-hud-state="active-compact"') && !emailDockHtml.includes('data-call-hud-flydown="true"'), true);

  const busMsgs: WorkspaceMessage[] = [];
  const unsub = getWorkspaceBus().subscribe((m) => busMsgs.push(m));
  getWorkspaceBus().publish('START_SOFTPHONE_CALL', { to: '+13145550144', contactName: 'Elena Vance' });
  getWorkspaceBus().publish('OPEN_SOFTPHONE_KEYPAD', {});
  getWorkspaceBus().publish('SOFTPHONE_VIEW_STATE_CHANGED', { activeTab: 'phone', callsSubTab: 'keypad' });
  unsub();
  assert.deepEqual(busMsgs.map((m) => m.type), ['START_SOFTPHONE_CALL', 'OPEN_SOFTPHONE_KEYPAD', 'SOFTPHONE_VIEW_STATE_CHANGED']);

  assert.equal(readRel('app/core/hooks/dispatch/useDispatchTripTriageActions.ts').includes("publish('START_SOFTPHONE_CALL'"), true);
  const dispSrc = readRel('app/routes/dispatch.tsx');
  const mapCallBlock = dispSrc.split('stableCallDriverFromMap')[1]?.split('stableChangeDriverDutyStatus')[0] || '';
  assert.equal(mapCallBlock.includes("setActiveDockTab('phone')"), false, 'Map call must not force setActiveDockTab("phone")');
  contactSvc.resetForTests();
}

function testExplicitTripsPlacesProfileWindowAndBookingAutocomplete(): void {
  console.log('3️⃣  Testing Explicit Trips | Places | Profile Window, Zero Call Auto-Pop & Booking Autocomplete -> Trips...');
  assert.equal(normalizeClientProfileTab('overview'), 'trips');
  assert.equal(normalizeClientProfileTab('edit'), 'profile');
  assert.equal(normalizeClientProfileTab('contact'), 'profile');
  assert.equal(normalizeClientProfileTab('profile'), 'profile');
  assert.equal(normalizeClientProfileTab('places'), 'places');

  const winSrc = readRel('app/components/domain/dispatch/ClientProfileWindow.tsx');
  assert.equal(winSrc.includes("if (p.source === 'incoming_call' || p.source === 'answered_call' || p.source === 'outbound_call') return;"), true);
  assert.equal(winSrc.includes("msg.type === 'INCOMING_CALL'") || winSrc.includes("msg.type === 'CALL_INCOMING'") || winSrc.includes("msg.type === 'CALL_ANSWERED'"), false, 'ClientProfileWindow must not auto-open on call events');

  const winHtml = renderToStaticMarkup(React.createElement(ClientProfileWindow, {
    trips: [makeTrip('TRP-7401', { status: 'completed' })], initialOpen: true, initialTarget: { phone: '+13145550144' },
    initialTab: 'profile', onLoadTripIntoNewTab: noop,
  }));
  for (const needle of ['>Trips<', '>Places<', '>Profile<', 'Contact Info', 'Driver Priority &amp; Exclusions', 'Save Profile']) {
    assert.equal(winHtml.includes(needle), true, `Profile tab markup must include ${needle}`);
  }

  const captured: WorkspaceMessage[] = [];
  const unsub = getWorkspaceBus().subscribe((m) => captured.push(m));
  publishPassengerCandidateTripsProfile({ phone: '(314) 555-0144', email: 'elena@bayer.example', name: 'Elena Vance' });
  unsub();
  assert.equal(captured.length === 1 && captured[0].type === 'OPEN_CLIENT_PROFILE', true);
  assert.deepEqual(captured[0].payload, {
    phone: '(314) 555-0144', email: 'elena@bayer.example', name: 'Elena Vance', initialTab: 'trips', source: 'passenger_crm',
  });
}

function testClientPreferredAndExcludedDriversEngine(): void {
  console.log('4️⃣  Testing Preferred (#1..#N) & Excluded (Do Not Send) Drivers in ContactRecord & Auto-Dispatch...');
  let state = { preferredDriverIds: [] as string[], excludedDriverIds: [] as string[] };
  state = addPreferredDriver(state, 'drv-2');
  state = addPreferredDriver(state, 'drv-1');
  assert.deepEqual(state.preferredDriverIds, ['drv-2', 'drv-1']);

  state.preferredDriverIds = movePreferredDriver(state.preferredDriverIds, 1, 'up');
  assert.deepEqual(state.preferredDriverIds, ['drv-1', 'drv-2']);

  // Mutual exclusivity: excluding drv-1 removes it from preferredDriverIds
  state = addExcludedDriver(state, 'drv-1');
  assert.deepEqual(state, { preferredDriverIds: ['drv-2'], excludedDriverIds: ['drv-1'] });

  // Mutual exclusivity: preferring drv-1 removes it from excludedDriverIds
  state = addPreferredDriver(state, 'drv-1');
  assert.deepEqual(state, { preferredDriverIds: ['drv-2', 'drv-1'], excludedDriverIds: [] });
  assert.deepEqual(removePreferredDriver(['drv-2', 'drv-1'], 'drv-2'), ['drv-1']);
  assert.deepEqual(removeExcludedDriver(['drv-9', 'drv-8'], 'drv-9'), ['drv-8']);
  assert.deepEqual(normalizeClientDriverPreferences(['drv-a', 'drv-b', 'drv-a'], ['drv-b']), {
    preferredDriverIds: ['drv-a'], excludedDriverIds: ['drv-b'],
  });

  const svc = getContactService();
  svc.resetForTests();
  const saved = svc.upsertContact({
    name: 'Elena Vance', phone: '+13145550144', email: 'elena@bayer.example',
    preferredDriverIds: ['drv-far-pref1', 'drv-mid-pref2', 'drv-blocked'],
    excludedDriverIds: ['drv-blocked'],
  });
  assert.deepEqual(saved.preferredDriverIds, ['drv-far-pref1', 'drv-mid-pref2']);
  assert.deepEqual(saved.excludedDriverIds, ['drv-blocked']);

  const meta = resolveTripClientDriverPreferencesMetadata('(314) 555-0144', 'elena@bayer.example');
  assert.deepEqual(meta, {
    clientPreferredDriverIds: ['drv-far-pref1', 'drv-mid-pref2'],
    clientExcludedDriverIds: ['drv-blocked'],
  });

  const driversRoster = [
    { id: 'drv-blocked', name: 'Near Excluded', cabNumber: '101', status: 'available' as const, vehicle: 'Sedan', tier: 'standard', phone: '', zone: '' },
    { id: 'drv-regular', name: 'Near Regular', cabNumber: '202', status: 'available' as const, vehicle: 'Sedan', tier: 'standard', phone: '', zone: '' },
    { id: 'drv-mid-pref2', name: 'Mid Preferred 2', cabNumber: '303', status: 'available' as const, vehicle: 'Sedan', tier: 'standard', phone: '', zone: '' },
    { id: 'drv-far-pref1', name: 'Far Preferred 1', cabNumber: '404', status: 'available' as const, vehicle: 'Sedan', tier: 'standard', phone: '', zone: '' },
  ];
  const cardHtml = renderToStaticMarkup(React.createElement(ClientDriverPreferencesCard, {
    drivers: driversRoster, preferredDriverIds: saved.preferredDriverIds!, excludedDriverIds: saved.excludedDriverIds!, onChange: noop,
  }));
  for (const needle of ['>#1<', '>#2<', '#404, Far', '#303, Mid', 'Do Not Send', '#101, Near']) {
    assert.equal(cardHtml.includes(needle), true, `ClientDriverPreferencesCard must render ${needle}`);
  }

  const profile = resolveClientProfileData({ phone: '+13145550144', contacts: [saved], trips: [] });
  const editHtml = renderToStaticMarkup(React.createElement(ClientProfileEditTab, { profile, drivers: driversRoster }));
  assert.equal(editHtml.includes('Contact Info') && editHtml.includes('data-client-driver-preferences="true"'), true);

  const nowIso = new Date(NOW_MS).toISOString();
  const candidates: AutoDispatchDriverInput[] = [
    { id: 'drv-blocked', name: 'Near Excluded', cabNumber: '101', dutyStatus: 'on_duty', mapStatus: 'available', tier: 'standard', coordinates: { lat: 38.6631, lng: -90.5771 }, locationUpdatedAt: nowIso },
    { id: 'drv-regular', name: 'Near Regular', cabNumber: '202', dutyStatus: 'on_duty', mapStatus: 'available', tier: 'standard', coordinates: { lat: 38.664, lng: -90.578 }, locationUpdatedAt: nowIso },
    { id: 'drv-mid-pref2', name: 'Mid Preferred 2', cabNumber: '303', dutyStatus: 'on_duty', mapStatus: 'available', tier: 'standard', coordinates: { lat: 38.68, lng: -90.59 }, locationUpdatedAt: nowIso },
    { id: 'drv-far-pref1', name: 'Far Preferred 1', cabNumber: '404', dutyStatus: 'on_duty', mapStatus: 'available', tier: 'standard', coordinates: { lat: 38.70, lng: -90.61 }, locationUpdatedAt: nowIso },
  ];

  const evalRes = evaluateAutoDispatchCandidates(makeTrip('TRP-AUTO-1', { metadata: meta }), candidates, [], { rankingStrategy: 'nearest_in_zone' }, { nowMs: NOW_MS });
  assert.equal(evalRes.excluded.some((e) => e.driverId === 'drv-blocked' && e.exclusionCode === 'EXCLUDED_BY_CLIENT'), true);
  assert.deepEqual(evalRes.eligible.map((c) => c.driverId), ['drv-far-pref1', 'drv-mid-pref2', 'drv-regular']);
  assert.deepEqual([evalRes.eligible[0].preferredDriverRank, evalRes.eligible[1].preferredDriverRank, evalRes.eligible[2].preferredDriverRank], [1, 2, undefined]);

  // Explicit plannedDriverId overrides EXCLUDED_BY_CLIENT and sorts #1 ahead of preferredDriverRank
  const plannedRes = evaluateAutoDispatchCandidates(
    makeTrip('TRP-AUTO-2', { plannedDriverId: 'drv-blocked', metadata: meta }),
    candidates, [], { rankingStrategy: 'nearest_in_zone' }, { nowMs: NOW_MS }
  );
  assert.equal(plannedRes.excluded.some((e) => e.driverId === 'drv-blocked'), false);
  assert.deepEqual(plannedRes.eligible.map((c) => c.driverId), ['drv-blocked', 'drv-far-pref1', 'drv-mid-pref2', 'drv-regular']);
  svc.resetForTests();
}

function testCeilingsHygieneAndImmutableFiles(): void {
  console.log('5️⃣  Testing Line Ceilings, 0 <select>, 0 Blocking Overlays, 0 Secrets & Immutable Files...');
  const ceilings: Array<[string, number]> = [
    ['app/components/domain/dispatch/DispatchHeaderCallHud.tsx', 360],
    ['app/components/domain/dispatch/CommsHub.tsx', 360],
    ['app/components/domain/dispatch/comms/SoftphoneDialerPane.tsx', 260],
    ['app/components/domain/dispatch/ClientProfileWindow.tsx', 340],
    ['app/components/domain/dispatch/ClientDriverPreferencesCard.tsx', 160],
    ['app/components/domain/dispatch/ClientProfileEditTab.tsx', 285],
    ['scripts/test-call-hud-and-driver-prefs-phase74.ts', 360],
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

console.log('🚀 Running Platform Phase 74 Call HUD & Driver Preferences Verification Suite...\n');
testFloatingCallPillRetiredMessagesRenameAndKeypadFabs();
testContextAwareDispatchHeaderCallHudFourStates();
testExplicitTripsPlacesProfileWindowAndBookingAutocomplete();
testClientPreferredAndExcludedDriversEngine();
testCeilingsHygieneAndImmutableFiles();
console.log('\n✅ ALL PLATFORM PHASE 74 VERIFICATION CHECKS PASSED!');
