/**
 * Platform Phase 72 Automated Verification Suite
 * (`scripts/test-floating-call-pill-and-nonblocking-windows-phase72.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_FLOATING_CALL_PILL_POSITION,
  FLOATING_CALL_PILL_STORAGE_KEY,
  FloatingCallPill,
  clampFloatingCallPillPosition,
  formatFloatingCallTimer,
  parseStoredFloatingCallPillPosition,
  serializeFloatingCallPillPosition,
} from '../app/components/domain/dispatch/FloatingCallPill';
import { ClientProfileEditTab } from '../app/components/domain/dispatch/ClientProfileEditTab';
import { ClientProfileWindow, resolveClientProfileData } from '../app/components/domain/dispatch/ClientProfileWindow';
import { DispatchBookingConflictModal } from '../app/components/domain/dispatch/booking/DispatchBookingConflictGuard';
import { AgentPhoneSetupModal } from '../app/components/domain/dispatch/comms/SoftphoneDialerPane';
import { NewSmsMessageModal } from '../app/components/domain/dispatch/comms/SmsThreadPane';
import { getContactService } from '../app/core/services/customer/contact.service';
import { getWorkspaceBus, type WorkspaceMessage } from '../app/core/services/workspace-bus.service';
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

function makeSampleTrip(id: string): Trip {
  const iso = '2026-11-24T18:00:00.000Z';
  return {
    id,
    status: 'completed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-947',
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled',
    scheduledPickupTime: iso,
    passenger: { firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example', phone: '(314) 555-0144', passengerCount: 2, luggageCount: 1 },
    vehicleTier: 'standard',
    pricing: { baseFare: 10, distanceMiles: 18, durationMinutes: 22, distanceRate: 40, timeRate: 0, vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 50, totalFare: 55, currency: 'USD' },
    payment: { method: 'corporate', status: 'settled', amount: 55 },
    statusHistory: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

function testFloatingCallPillModesPositionAndBannerRemoval(): void {
  console.log('1️⃣  Testing FloatingCallPill SSR Modes, Position Clamping & Banner/Dock Removal...');
  assert.equal(FLOATING_CALL_PILL_STORAGE_KEY, 'ct_floating_call_pill_pos_v1');
  assert.deepEqual(DEFAULT_FLOATING_CALL_PILL_POSITION, { top: 58, right: 16 });
  assert.equal(formatFloatingCallTimer(0), '00:00');
  assert.equal(formatFloatingCallTimer(125), '02:05');

  const vp = { width: 1280, height: 800 };
  assert.deepEqual(clampFloatingCallPillPosition({ top: -50, right: -20 }, vp), { top: 8, right: 8 });
  assert.deepEqual(clampFloatingCallPillPosition({ top: 9999, right: 9999 }, vp), { top: 716, right: 940 });
  assert.deepEqual(parseStoredFloatingCallPillPosition(serializeFloatingCallPillPosition({ top: 72.4, right: 24.6 }), vp), { top: 72, right: 25 });
  assert.equal(parseStoredFloatingCallPillPosition('invalid-json', vp), null);

  const contactSvc = getContactService();
  contactSvc.resetForTests();
  contactSvc.saveContact({ name: 'Elena Vance', phone: '+13145550144', email: 'elena@bayer.example', isVip: true });
  contactSvc.saveContact({ name: 'Blocked Caller', phone: '+13145550198', isBlacklisted: true });

  assert.equal(renderToStaticMarkup(React.createElement(FloatingCallPill, { incomingCallAlert: null, activeCallStatus: 'idle', activeCallMeta: null, callDuration: 0 })), '');

  const ringVipHtml = renderToStaticMarkup(
    React.createElement(FloatingCallPill, { incomingCallAlert: { from: '+13145550144', callSid: 'CA_RING_VIP' }, activeCallStatus: 'idle', activeCallMeta: null, callDuration: 0 })
  );
  for (const needle of ['data-floating-call-pill="ringing"', 'z-[260]', 'Elena Vance', '(314) 555-0144', '>VIP<', '>Profile<', '>Decline<', '>Answer<']) {
    assert.equal(ringVipHtml.includes(needle), true, `Ringing pill markup must include ${needle}`);
  }

  const ringDriverHtml = renderToStaticMarkup(
    React.createElement(FloatingCallPill, {
      incomingCallAlert: { from: '+13149151800' },
      activeCallStatus: 'idle',
      activeCallMeta: null,
      callDuration: 0,
      drivers: [{ id: 'drv-947', name: 'Zak R', cabNumber: '947', status: 'available', vehicle: 'Car', tier: 'standard', phone: '314-915-1800', zone: 'West' }],
    })
  );
  assert.equal(ringDriverHtml.includes('>Driver<') && ringDriverHtml.includes('Zak R (#947)'), true);

  const ringBlockedHtml = renderToStaticMarkup(
    React.createElement(FloatingCallPill, { incomingCallAlert: { from: '+13145550198' }, activeCallStatus: 'idle', activeCallMeta: null, callDuration: 0 })
  );
  assert.equal(ringBlockedHtml.includes('>Blacklist<'), true);

  const liveHtml = renderToStaticMarkup(
    React.createElement(FloatingCallPill, {
      incomingCallAlert: null,
      activeCallStatus: 'connected',
      activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 125 },
      callDuration: 125,
      initialMuted: true,
      initialKeypadOpen: true,
    })
  );
  for (const needle of ['data-floating-call-pill="live"', '● 02:05', 'Elena Vance', '>Mute<', '>Keypad<', '>Profile<', '>Thread<', '>End<', '>*<', '>#<']) {
    assert.equal(liveHtml.includes(needle), true, `Live call pill markup must include ${needle}`);
  }
  contactSvc.resetForTests();

  assert.equal(readRel('app/components/domain/dispatch/workspace/DispatchDesktopTopHeader.tsx').includes('Incoming Softphone Call'), false);
  const commsSrc = readRel('app/components/domain/dispatch/CommsHub.tsx');
  assert.equal(commsSrc.includes('Incoming Softphone Call'), false);
  assert.equal(commsSrc.includes('Client Profile') && commsSrc.includes('flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden'), true);
  assert.equal(readRel('app/routes/dispatch.tsx').includes('<FloatingCallPill'), true);

  const syncSrc = readRel('app/core/hooks/dispatch/useDispatchWorkspaceSync.ts');
  const incomingBlock = syncSrc.split("msg.type === 'INCOMING_CALL'")[1]?.split("msg.type === 'INCOMING_CALL_DISMISSED'")[0] || '';
  assert.equal(incomingBlock.includes("setActiveDockTab('phone')"), false, 'INCOMING_CALL must NOT force setActiveDockTab("phone")');
}

function testEndCallIdempotencyAndSoftphoneBusEvents(): void {
  console.log('2️⃣  Testing Idempotent handleEndCall Guard, Single postCallFetchTimerRef & Softphone Bus Events...');
  const busSrc = readRel('app/core/services/workspace-bus.service.ts');
  for (const needle of ['TOGGLE_CALL_MUTE:', 'SEND_CALL_DTMF:', 'CALL_MUTE_CHANGED:', "initialTab?: 'overview' | 'edit'"]) {
    assert.equal(busSrc.includes(needle), true, `workspace-bus.service.ts must define ${needle}`);
  }

  const received: WorkspaceMessage[] = [];
  const unsub = getWorkspaceBus().subscribe((m) => received.push(m));
  getWorkspaceBus().publish('TOGGLE_CALL_MUTE', { muted: true });
  getWorkspaceBus().publish('CALL_MUTE_CHANGED', { isMuted: true });
  getWorkspaceBus().publish('SEND_CALL_DTMF', { digit: '5' });
  unsub();
  assert.deepEqual(received.map((m) => m.type), ['TOGGLE_CALL_MUTE', 'CALL_MUTE_CHANGED', 'SEND_CALL_DTMF']);

  const softphoneSrc = readRel('app/components/domain/dispatch/comms/useTwilioSoftphoneDevice.ts');
  for (const needle of [
    'isEndingCallRef',
    'endedCallSidsRef',
    'postCallFetchTimerRef',
    "callStatus === 'idle' && !activeCallRef.current && !incomingCallRef.current",
    'clearTimeout(postCallFetchTimerRef.current)',
    "msg.type === 'TOGGLE_CALL_MUTE'",
    "msg.type === 'SEND_CALL_DTMF'",
    "workspaceBus.publish('CALL_MUTE_CHANGED'",
  ]) {
    assert.equal(softphoneSrc.includes(needle), true, `useTwilioSoftphoneDevice.ts must include ${needle}`);
  }
}

function testUnifiedClientProfileEditTabAndRetiredContactModal(): void {
  console.log('3️⃣  Testing Unified ClientProfileWindow (Overview & Trips | Edit Profile) & Retired comms-ContactModal...');
  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'app/components/domain/dispatch/comms/comms-ContactModal.tsx')), false);
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.(ts|tsx)$/)) {
    assert.equal(/comms-ContactModal|CommsContactModal/.test(fs.readFileSync(filePath, 'utf8')), false);
  }

  const corpAccounts: CorporateAccountConfig[] = [{
    id: 'corp-101', companyName: 'Bayer Crop Science', accountNumber: 'CORP-101', billingCycle: 'net60',
    creditLimit: 15000, billingContactName: 'Laura Vance', billingContactEmail: 'billing@bayer.example', discountPercent: 10, poRequired: true, isActive: true,
  }];

  const svc = getContactService();
  svc.resetForTests();
  const saved = svc.upsertContact({
    name: 'Elena Vance', phone: '(314) 555-0144', email: 'elena@bayer.example', isVip: true, vipReason: 'Executive Board',
    corporateAccountId: 'corp-101', corporateAccountNumber: 'CORP-101', corporateAccountName: 'Bayer Crop Science',
    billingDepartment: 'Genomics', defaultPoNumber: 'PO-9001', homeAddress: '16625 Swingley Ridge Rd', workAddress: '800 N Lindbergh Blvd', notes: 'Gate #4412',
  });
  assert.equal(saved.corporateAccountName, 'Bayer Crop Science');
  const unlinked = svc.upsertContact({ id: saved.id, name: saved.name, phone: saved.phone, corporateAccountId: '', corporateAccountNumber: '', corporateAccountName: '' });
  assert.equal(unlinked.corporateAccountName, '');

  const profile = resolveClientProfileData({ phone: '+13145550144', contacts: svc.getAllContacts(), trips: [makeSampleTrip('trip-7201')] });
  const editHtml = renderToStaticMarkup(React.createElement(ClientProfileEditTab, { profile, corporateAccounts: corpAccounts }));
  for (const needle of ['VIP Priority Client', 'role="switch"', 'Phones &amp; Digital Contact', 'Add Phone', 'Corporate Account &amp; Billing', 'Home &amp; Work Addresses', 'Wheelchair Ramp (WAV)', 'Save Profile']) {
    assert.equal(editHtml.includes(needle), true, `ClientProfileEditTab markup must include ${needle}`);
  }

  const winOverviewHtml = renderToStaticMarkup(
    React.createElement(ClientProfileWindow, { trips: [makeSampleTrip('trip-7201')], corporateAccounts: corpAccounts, initialOpen: true, initialTarget: { phone: '+13145550144' }, initialTab: 'overview', onLoadTripIntoNewTab: () => {} })
  );
  assert.equal(winOverviewHtml.includes('Overview &amp; Trips') && winOverviewHtml.includes('Edit Profile') && winOverviewHtml.includes('Recent Trips (1 of 1)'), true);

  const winEditHtml = renderToStaticMarkup(
    React.createElement(ClientProfileWindow, { trips: [makeSampleTrip('trip-7201')], corporateAccounts: corpAccounts, initialOpen: true, initialTarget: { phone: '+13145550144' }, initialTab: 'edit', onLoadTripIntoNewTab: () => {} })
  );
  assert.equal(winEditHtml.includes('Save Profile') && winEditHtml.includes('VIP Priority Client'), true);
  assert.equal(readRel('app/components/domain/dispatch/ClientProfileWindow.tsx').includes("p.initialTab === 'edit' ? 'edit' : 'overview'"), true);
  assert.equal(readRel('app/components/domain/dispatch/comms/useCommsMessagingAndContacts.ts').includes("initialTab: 'edit'"), true);
  svc.resetForTests();
}

function testNonBlockingFloatingWindowsSweep(): void {
  console.log('4️⃣  Testing Console-Wide Non-Blocking FloatingWindow (hasBackdrop={false}) Sweep...');
  for (const rel of [
    'app/components/domain/dispatch/booking/DispatchBookingConflictGuard.tsx',
    'app/components/domain/dispatch/drawer/DispatchCompleteTripModal.tsx',
    'app/components/domain/dispatch/drawer/DispatchDriverFareModal.tsx',
    'app/components/domain/dispatch/queue/DispatchTripQueueSheets.tsx',
    'app/components/domain/dispatch/DispatchDriverRosterPane.tsx',
    'app/components/domain/dispatch/StagedDriverConflictModal.tsx',
    'app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx',
    'app/components/domain/dispatch/comms/CommsModals.tsx',
    'app/components/domain/dispatch/comms/SoftphoneDialerPane.tsx',
    'app/components/domain/dispatch/comms/SmsThreadPane.tsx',
    'app/components/domain/dispatch/email/EmailMessageListPane.tsx',
    'app/routes/dispatch.tsx',
  ]) {
    assert.equal(/bg-slate-950\/(60|65|35)|bg-slate-900\/50/.test(readRel(rel)), false, `${rel} must contain 0 blocking dark backdrop overlays`);
  }

  assert.equal(readRel('app/components/domain/dispatch/booking/DispatchBookingConflictGuard.tsx').includes('id="dispatch_conflict_guard"'), true);
  assert.equal(readRel('app/components/domain/dispatch/drawer/DispatchCompleteTripModal.tsx').includes('id="dispatch_complete_trip"'), true);
  assert.equal(readRel('app/components/domain/dispatch/drawer/DispatchDriverFareModal.tsx').includes('id="dispatch_driver_fare"'), true);

  const conflictHtml = renderToStaticMarkup(
    React.createElement(DispatchBookingConflictModal, {
      isOpen: true, isEditMode: false, isSubmitting: false, onCancel: () => {}, onConfirmBookAnyway: () => {},
      conflicts: [{ id: 'c1', severity: 'critical', kind: 'passenger_time_overlap', leg: 'outbound', conflictingTripId: 't9', conflictingTripNumber: 'TRIP99', conflictingTrip: makeSampleTrip('t9'), title: 'Overlapping Ride', description: 'Within 15m', pickupTimeLabel: '2:30 PM', routeLabel: 'Chesterfield -> STL' }],
    })
  );
  assert.equal(conflictHtml.includes('pointer-events-none') && conflictHtml.includes('Book Anyway'), true);

  const agentModalHtml = renderToStaticMarkup(
    React.createElement(AgentPhoneSetupModal, {
      isOpen: true, pendingCallTarget: { phone: '+13145550144', name: 'Elena Vance' }, setupAgentPhoneInput: '', setupAgentPhoneError: null,
      onChangeSetupAgentPhoneInput: () => {}, onSaveAndCall: () => {}, onClose: () => {},
    })
  );
  assert.equal(agentModalHtml.includes('pointer-events-none') && agentModalHtml.includes('Set Dispatcher Line'), true);

  const newSmsHtml = renderToStaticMarkup(
    React.createElement(NewSmsMessageModal, {
      isOpen: true, newMsgError: null, msgContactSearch: '', newMsgRecipientPhone: '+13145550144', newMsgRecipientName: 'Elena Vance',
      newMsgBody: 'Driver arriving', isSendingNewMsg: false, isMsgContactDropdownOpen: false, filteredContactsForMsg: [],
      onRecipientInputChange: () => {}, onRecipientInputFocus: () => {}, onSelectContactOption: () => {}, onBodyChange: () => {},
      onSelectPresetChip: () => {}, onOpenThread: () => {}, onSend: () => {}, onClose: () => {},
    })
  );
  assert.equal(newSmsHtml.includes('pointer-events-none') && newSmsHtml.includes('New Text Message'), true);
}

function testGuardrailsCeilingsAndImmutableFiles(): void {
  console.log('5️⃣  Testing 0 <select>, Secret Hygiene, Line Ceilings & Untouched Immutable Files...');
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${rel} must contain 0 raw <select> tags`);
  }

  const secretShapes = [/\bAC[0-9a-f]{32}\b/i, /\bSK[0-9a-f]{32}\b/i, /\bAP[0-9a-f]{32}\b/i, /AKIA[0-9A-Z]{16}/, /sk_(live|test)_[0-9A-Za-z]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  for (const rel of [
    'app/components/domain/dispatch/FloatingCallPill.tsx',
    'app/components/domain/dispatch/ClientProfileEditTab.tsx',
    'app/components/domain/dispatch/ClientProfileWindow.tsx',
    'app/components/domain/dispatch/CommsHub.tsx',
    'app/routes/dispatch.tsx',
    'scripts/test-floating-call-pill-and-nonblocking-windows-phase72.ts',
  ]) {
    const src = readRel(rel);
    for (const re of secretShapes) assert.equal(re.test(src), false, `${rel} must contain 0 secret-shaped literals`);
  }

  const ceilings: Array<[string, number]> = [
    ['app/routes/dispatch.tsx', 1600],
    ['app/components/domain/dispatch/ClientProfileWindow.tsx', 360],
    ['app/components/domain/dispatch/CommsHub.tsx', 900],
    ['app/components/domain/dispatch/FloatingCallPill.tsx', 300],
    ['app/components/domain/dispatch/ClientProfileEditTab.tsx', 340],
    ['scripts/test-floating-call-pill-and-nonblocking-windows-phase72.ts', 360],
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
  console.log('🚀 Running Platform Phase 72 Verification Suite...\n');
  testFloatingCallPillModesPositionAndBannerRemoval();
  testEndCallIdempotencyAndSoftphoneBusEvents();
  testUnifiedClientProfileEditTabAndRetiredContactModal();
  testNonBlockingFloatingWindowsSweep();
  testGuardrailsCeilingsAndImmutableFiles();
  console.log('\n✅ ALL PLATFORM PHASE 72 VERIFICATION CHECKS PASSED!');
}

main();
