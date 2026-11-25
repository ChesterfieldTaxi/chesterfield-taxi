/**
 * Platform Phase 73 (Wave 6 Phase 8) Automated Verification Suite:
 * Clean-Slate Dispatch Comms Dock v2 Rebuild (`scripts/test-comms-dock-v2-rebuild-phase73.ts`)
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommsHub } from '../app/components/domain/dispatch/CommsHub';
import { CommsComposerBar } from '../app/components/domain/dispatch/comms/CommsComposerBar';
import { SmsThreadPane } from '../app/components/domain/dispatch/comms/SmsThreadPane';
import { SoftphoneDialerPane } from '../app/components/domain/dispatch/comms/SoftphoneDialerPane';
import { VoicemailCallLogPane } from '../app/components/domain/dispatch/comms/VoicemailCallLogPane';
import {
  buildOmnichannelTimelineItems,
  buildReturnTripDraftPayload,
  cleanCommsEmailSnippet,
  hasPlayableCallAudio,
} from '../app/components/domain/dispatch/comms/comms-timeline.util';
import type { InteractionEvent } from '../app/components/domain/dispatch/comms/comms-types';
import { resolveCommsCrmContext } from '../app/core/services/comms/comms-templates.service';
import { getContactService } from '../app/core/services/customer/contact.service';
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

const NOW_MS = Date.UTC(2026, 10, 24, 18, 0, 0);

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

function testLegacyBloatRetirementAndSoftphoneFixes(): void {
  console.log('1️⃣  Testing Retired Legacy Comms Bloat Files, 0 Imports & Softphone Bug Fixes...');
  for (const rel of [
    'app/components/domain/dispatch/comms/CommsCrmContextBanner.tsx',
    'app/components/domain/dispatch/comms/CommsRowActionSheet.tsx',
    'app/components/domain/dispatch/comms/CommsBatchActionBar.tsx',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, rel)), false, `${rel} must be deleted`);
  }
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.(ts|tsx)$/)) {
    assert.equal(/CommsCrmContextBanner|CommsRowActionSheet|CommsBatchActionBar/.test(fs.readFileSync(filePath, 'utf8')), false);
  }
  const softphoneSrc = readRel('app/components/domain/dispatch/comms/useTwilioSoftphoneDevice.ts');
  assert.equal(softphoneSrc.includes('creds.apiKeySecret'), false, 'handleStartCall must NOT gate WebRTC on creds.apiKeySecret');
  assert.equal(softphoneSrc.includes("if (!activeDevice && softphoneStatus !== 'error')"), true);
  assert.equal(/recordingSid:\s*(twCallSid|resData\.callSid)/.test(softphoneSrc), false, 'CallSid must NOT be written into recordingSid');
  assert.equal(softphoneSrc.includes('callSid: twCallSid || undefined'), true);
  assert.equal(softphoneSrc.includes("i.type === 'call_inbound' ? 'Inbound Call' : 'Outbound Call'"), true);
}

function testAudioGuardAndEmailSnippetCleaner(): void {
  console.log('2️⃣  Testing hasPlayableCallAudio & cleanCommsEmailSnippet...');
  assert.equal(hasPlayableCallAudio(null), false);
  assert.equal(hasPlayableCallAudio({ type: 'call_outbound', recordingSid: 'CA0123456789abcdef0123456789abcdef' }), false);
  assert.equal(hasPlayableCallAudio({ type: 'call_inbound', recordingSid: '' }), false);
  assert.equal(hasPlayableCallAudio({ type: 'call_inbound', recordingSid: 'RE0123456789abcdef0123456789abcdef' }), true);
  assert.equal(hasPlayableCallAudio({ type: 'call_outbound', audioUrl: '/api/telephony?action=audio_proxy&recordingSid=RE_1' }), true);
  assert.equal(hasPlayableCallAudio({ type: 'voicemail', recordingSid: 'RE_VM_SHORT_ID' }), true);

  const cleaned = cleanCommsEmailSnippet('====================\n  CHESTERFIELD TAXI  \n--------------------\n  Flight DL1492   Gate A14 \n====');
  assert.equal(cleaned, 'CHESTERFIELD TAXI Flight DL1492 Gate A14');
  assert.equal(cleaned.includes('====') || cleaned.includes('----'), false);
  assert.equal(cleanCommsEmailSnippet(''), '');
}

function testOmnichannelTimelineBuilder(): void {
  console.log('3️⃣  Testing buildOmnichannelTimelineItems (Trip Matching, pinnedUpcomingTrip & Channel Filters)...');
  const pastTrip = makeTrip('TRP-7301', { status: 'completed', scheduledPickupTime: new Date(NOW_MS - 7_200_000).toISOString() });
  const soonTrip = makeTrip('TRP-7302', { status: 'assigned', scheduledPickupTime: new Date(NOW_MS + 3_600_000).toISOString() });
  const laterTrip = makeTrip('TRP-7303', {
    status: 'confirmed',
    passenger: { firstName: 'Elena', lastName: 'Vance', email: 'ELENA@BAYER.EXAMPLE', phone: '', passengerCount: 1, luggageCount: 0 },
    scheduledPickupTime: new Date(NOW_MS + 86_400_000).toISOString(),
  });
  const byIdTrip = makeTrip('TRP-7304', {
    status: 'cancelled', customerId: 'cust_elena_73',
    passenger: { firstName: 'Guest', lastName: 'Rider', email: '', phone: '+16365559999', passengerCount: 1, luggageCount: 0 },
    scheduledPickupTime: new Date(NOW_MS - 1_800_000).toISOString(),
  });
  const unrelatedTrip = makeTrip('TRP-OTHER', {
    status: 'assigned',
    passenger: { firstName: 'Other', lastName: 'Person', email: 'other@example.com', phone: '+13145559876', passengerCount: 1, luggageCount: 0 },
  });

  const events: InteractionEvent[] = [
    { id: 'sms_in_1', type: 'sms_inbound', contactName: 'Elena Vance', contactPhone: '+13145550144', contactType: 'passenger', timestamp: '11:30 AM', timestampMs: NOW_MS - 3_600_000, snippet: 'Landed at STL' },
    { id: 'call_out_1', type: 'call_outbound', contactName: 'Elena Vance', contactPhone: '+13145550144', contactType: 'passenger', timestamp: '11:45 AM', timestampMs: NOW_MS - 900_000, snippet: 'Outbound Call (0:42)' },
  ];

  const allRes = buildOmnichannelTimelineItems({
    events, trips: [unrelatedTrip, laterTrip, pastTrip, soonTrip, byIdTrip],
    contactPhone: '314-555-0144', contactEmail: 'elena@bayer.example', contactId: 'cust_elena_73', threadTab: 'all', nowMs: NOW_MS,
  });
  assert.equal(allRes.matchedTrips.length, 4);
  assert.equal(allRes.pinnedUpcomingTrip?.id, 'TRP-7302');
  assert.deepEqual(
    allRes.items.map((it) => (it.kind === 'trip' ? `trip:${it.trip.id}` : `evt:${it.event.id}`)),
    ['trip:TRP-7301', 'evt:sms_in_1', 'trip:TRP-7304', 'evt:call_out_1', 'trip:TRP-7302', 'trip:TRP-7303']
  );

  const tripsOnly = buildOmnichannelTimelineItems({ events, trips: [pastTrip, soonTrip], contactPhone: '+13145550144', threadTab: 'trips', nowMs: NOW_MS });
  assert.equal(tripsOnly.items.length === 2 && tripsOnly.items.every((i) => i.kind === 'trip'), true);

  const smsOnly = buildOmnichannelTimelineItems({ events, trips: [pastTrip, soonTrip], contactPhone: '+13145550144', threadTab: 'sms', nowMs: NOW_MS });
  assert.deepEqual(smsOnly.items.map((i) => (i.kind === 'event' ? i.event.id : '')), ['sms_in_1']);

  const terminalOnly = buildOmnichannelTimelineItems({ events: [], trips: [pastTrip, byIdTrip], contactPhone: '+13145550144', contactId: 'cust_elena_73', nowMs: NOW_MS });
  assert.equal(terminalOnly.pinnedUpcomingTrip, null);

  const retPayload = buildReturnTripDraftPayload(pastTrip, NOW_MS);
  assert.equal(retPayload.pickupAddress, pastTrip.dropoffLocation.address);
  assert.equal(retPayload.dropoffAddress, pastTrip.pickupLocation.address);
}

function testSsrMarkupOmnichannelV2AndVoiceOnlyComposer(): void {
  console.log('4️⃣  Testing SSR Markup (1-Bar Header, Pinned Pill, Trip Card, 0 Unrecorded Audio Bars, Clean Email & Voice-Only)...');
  const contactSvc = getContactService();
  contactSvc.resetForTests();
  const contact = contactSvc.saveContact({ id: 'cust_elena_ssr', name: 'Elena Vance', phone: '+13145550144', email: 'elena@bayer.example', isVip: true, corporateAccountName: 'Bayer Crop Science' });
  const pastTrip = makeTrip('TRP-7301', { status: 'completed', scheduledPickupTime: new Date(NOW_MS - 3_600_000).toISOString() });
  const upcomingTrip = makeTrip('TRP-7302', { status: 'en_route', scheduledPickupTime: new Date(NOW_MS + 1_800_000).toISOString() });
  const crm = resolveCommsCrmContext({ phone: '+13145550144', contact, trips: [pastTrip, upcomingTrip], drivers: [] });

  const unrecordedCall: InteractionEvent = {
    id: 'call_unrec_73', type: 'call_outbound', contactName: 'Elena Vance', contactPhone: '+13145550144',
    contactType: 'passenger', timestamp: '11:50 AM', timestampMs: NOW_MS - 600_000, durationSeconds: 52,
    audioDuration: '0:52', callSid: 'CA0123456789abcdef0123456789abcdef', snippet: 'Outbound Call (0:52)',
  };
  const emailEvt: InteractionEvent = {
    id: 'em_73', type: 'email_inbound', contactName: 'Elena Vance', contactPhone: '+13145550144',
    contactEmail: 'elena@bayer.example', contactType: 'passenger', subject: 'STL Pickup Confirmation',
    timestamp: '11:55 AM', timestampMs: NOW_MS - 300_000, snippet: '==========\n Meet at Terminal 1 Door 6 \n----------',
  };

  const noop = () => {};
  const threadHtml = renderToStaticMarkup(
    React.createElement(SmsThreadPane, {
      mode: 'thread', activeContactSummary: unrecordedCall, activeContactRecord: contact, threadCrmContext: crm,
      trips: [pastTrip, upcomingTrip], nowMs: NOW_MS, voiceOnlyMode: false,
      onBackFromThread: noop, onOpenContactEdit: noop, onBookContactRide: noop, onOpenContactEmailInDock: noop,
      onOpenTripById: noop, onFocusTripOnMap: noop, onRebookLastRide: noop, threadTab: 'all', onChangeThreadTab: noop,
      selectedInteractions: [unrecordedCall, emailEvt], playingCallId: null, onTogglePlayCall: noop,
      playingVoicemailId: null, onTogglePlayVoicemail: noop, playbackSpeed: 1, onCyclePlaybackSpeed: noop,
      onStartCall: noop, onConvertVoicemailToBooking: noop, onOpenEmailInDock: noop,
      smsReplyText: '', onChangeSmsReplyText: noop, isSendingSms: false, onSendSms: noop, smsStatusMessage: null,
      onSelectContact: noop, onOpenFreshNewMessageModal: noop,
    })
  );

  for (const needle of [
    'data-comms-thread-header="v2"', 'Elena Vance', '(314) 555-0144', '>VIP<', '>Call<', '>Book<', '>Client Profile<', '>Filter<',
    'data-pinned-upcoming-trip="TRP-7302"', '#TRP-7302', '>Edit<', '>Map<',
    'data-timeline-trip-card="TRP-7301"', '#TRP-7301', '$68.50', '⇄ Return',
    'data-call-row="call_unrec_73"', 'Outbound Call', '0:52',
    'data-email-card="em_73"', 'Meet at Terminal 1 Door 6', 'Open in Email ↗',
  ]) {
    assert.equal(threadHtml.includes(needle), true, `Thread SSR markup must include ${needle}`);
  }
  assert.equal(threadHtml.includes('data-call-audio-player="true"'), false, 'Unrecorded call must render 0 audio player bars');
  assert.equal(threadHtml.includes('Carrier Alert') || threadHtml.includes('====') || threadHtml.includes('----'), false);

  const voiceOnlyHtml = renderToStaticMarkup(
    React.createElement(CommsComposerBar, {
      effectivePhone: '+13145550144', voiceOnlyMode: true, smsReplyText: '', onChangeSmsReplyText: noop,
      onSendSms: noop, isSendingSms: false, noteDraftText: '', onChangeNoteDraftText: noop, onAddInternalNote: noop,
    })
  );
  assert.equal(voiceOnlyHtml.includes('data-composer-mode="note"') && voiceOnlyHtml.includes('Voice-Only'), true);

  const recordedCall: InteractionEvent = { ...unrecordedCall, id: 'call_rec_73', recordingSid: 'RE0123456789abcdef0123456789abcdef' };
  const callLogHtml = renderToStaticMarkup(
    React.createElement(VoicemailCallLogPane, {
      mode: 'call_history', items: [unrecordedCall, recordedCall], playingVoicemailId: null, onTogglePlayVoicemail: noop,
      playingCallId: null, onTogglePlayCall: noop, playbackSpeed: 1, onCyclePlaybackSpeed: noop,
      onStartCall: noop, onSelectContact: noop, onConvertVoicemailToBooking: noop,
    })
  );
  assert.equal((callLogHtml.match(/data-call-audio-player="true"/g) || []).length, 1);

  const hubHtml = renderToStaticMarkup(React.createElement(CommsHub, { initialTab: 'all', trips: [upcomingTrip] }));
  assert.equal(hubHtml.includes('data-comms-row="header"') && hubHtml.includes('data-comms-row="toolbar"'), true);

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
  assert.equal(dialerHtml.includes('Elena Vance') && dialerHtml.includes('>Book<') && dialerHtml.includes('Client Profile'), true);
  contactSvc.resetForTests();
}

function testCeilingsGuardrailsAndImmutableFiles(): void {
  console.log('5️⃣  Testing Line Ceilings, Portal z-[260], 0 <select>, 0 Overlays, 0 Secrets & Immutable Files...');
  const ceilings: Array<[string, number]> = [
    ['app/components/domain/dispatch/CommsHub.tsx', 360],
    ['app/components/domain/dispatch/comms/SmsThreadPane.tsx', 380],
    ['app/components/domain/dispatch/comms/CommsComposerBar.tsx', 250],
    ['app/components/domain/dispatch/comms/CommsFilterToolbar.tsx', 250],
    ['app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx', 340],
    ['app/components/domain/dispatch/comms/SoftphoneDialerPane.tsx', 340],
    ['app/components/domain/dispatch/comms/useCommsMessagingAndContacts.ts', 380],
    ['app/components/domain/dispatch/comms/CommsModals.tsx', 220],
    ['app/components/domain/dispatch/comms/comms-timeline.util.ts', 220],
    ['scripts/test-comms-dock-v2-rebuild-phase73.ts', 360],
  ];
  for (const [rel, maxLines] of ceilings) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }

  for (const rel of [
    'app/components/domain/dispatch/comms/CommsFilterToolbar.tsx',
    'app/components/domain/dispatch/comms/CommsComposerBar.tsx',
    'app/components/domain/dispatch/comms/SmsThreadPane.tsx',
  ]) {
    const src = readRel(rel);
    assert.equal(src.includes('createPortal') && src.includes('z-[260]') && src.includes('rounded-xl shadow-xl ring-1 ring-slate-900/5'), true);
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

console.log('🚀 Running Platform Phase 73 Comms Dock v2 Rebuild Verification Suite...\n');
testLegacyBloatRetirementAndSoftphoneFixes();
testAudioGuardAndEmailSnippetCleaner();
testOmnichannelTimelineBuilder();
testSsrMarkupOmnichannelV2AndVoiceOnlyComposer();
testCeilingsGuardrailsAndImmutableFiles();
console.log('\n✅ ALL PLATFORM PHASE 73 VERIFICATION CHECKS PASSED!');
