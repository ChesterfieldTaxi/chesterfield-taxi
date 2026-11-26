/**
 * Phase 90 Automated Verification Suite:
 * Comms Hub Pastel Avatars, Unified 2-Row Entries, Inline Voicemail Expand & 5s Thread Entry Glow
 * (`scripts/test-comms-phase90-unified-rows-and-glow.ts`)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommsContactAvatar } from '../app/components/domain/dispatch/comms/CommsContactAvatar';
import { SmsThreadPane } from '../app/components/domain/dispatch/comms/SmsThreadPane';
import { VoicemailCallLogPane } from '../app/components/domain/dispatch/comms/VoicemailCallLogPane';
import {
  COMMS_AVATAR_PASTEL_PALETTE,
  resolveContactAvatarSpec,
} from '../app/components/domain/dispatch/comms/comms-timeline.util';
import type { InteractionEvent } from '../app/components/domain/dispatch/comms/comms-types';
import type { CommsConversationRowSummary } from '../app/core/services/comms/comms-templates.service';

const ROOT_DIR = process.cwd();
const readRel = (rel: string): string => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
const NOW_MS = Date.UTC(2026, 10, 25, 18, 0, 0);
const noop = () => {};

function testPastelAvatarDeterminismAndFallbacks(): void {
  console.log('1️⃣  Testing COMMS_AVATAR_PASTEL_PALETTE & resolveContactAvatarSpec...');
  assert.equal(COMMS_AVATAR_PASTEL_PALETTE.length, 8);

  const spec1 = resolveContactAvatarSpec({
    name: 'Jane Doe',
    phone: '+1 (314) 555-0144',
    email: 'jane@example.com',
  });
  const spec2 = resolveContactAvatarSpec({
    name: 'Jane Doe',
    phone: '314-555-0144',
    email: 'JANE@EXAMPLE.COM',
  });
  assert.equal(spec1.initials, 'JD');
  assert.equal(spec1.toneClass, spec2.toneClass, 'Same normalized 10-digit phone must yield identical pastel tone');
  assert.equal(spec1.paletteIndex, spec2.paletteIndex);

  const singleWord = resolveContactAvatarSpec({ name: 'Jane', phone: '+13145550199' });
  assert.equal(singleWord.initials, 'J');

  const multiWord = resolveContactAvatarSpec({ name: 'Jane Marie Doe', phone: '+13145550199' });
  assert.equal(multiWord.initials, 'JD');

  for (const unsavedName of ['+13145550144', '(314) 555-0144', 'elena@bayer.example', 'Unknown Caller', '']) {
    const unsavedSpec = resolveContactAvatarSpec({ name: unsavedName, phone: '+13145550144' });
    assert.equal(unsavedSpec.initials, null, `Expected null initials for "${unsavedName}"`);
  }
}

function testCommsContactAvatarMarkup(): void {
  console.log('2️⃣  Testing CommsContactAvatar markup & data-row-checkbox...');
  const initialsHtml = renderToStaticMarkup(
    React.createElement(CommsContactAvatar, {
      name: 'Elena Vance',
      phone: '+13145550144',
      rowKey: 'evt_test_1',
      isSelected: false,
      isSelectionMode: false,
      onToggleSelect: noop,
    })
  );
  assert.equal(initialsHtml.includes('w-8 h-8 rounded-full'), true);
  assert.equal(initialsHtml.includes('data-avatar-initials="EV"'), true);
  assert.equal(initialsHtml.includes('>EV<'), true);
  assert.equal(initialsHtml.includes('data-row-checkbox="evt_test_1"'), true);

  const iconFallbackHtml = renderToStaticMarkup(
    React.createElement(CommsContactAvatar, {
      name: 'Unknown Caller',
      phone: '+13145550188',
      rowKey: 'evt_test_2',
    })
  );
  assert.equal(iconFallbackHtml.includes('data-avatar-initials="icon"'), true);
  assert.equal(iconFallbackHtml.includes('<svg'), true);
}

function testUnifiedTwoRowLogsAndInlineVoicemailToggle(): void {
  console.log('3️⃣  Testing unified min-h-[52px] 2-row entries & voicemail ▾ toggle...');
  const vmEvent: InteractionEvent = {
    id: 'vm_test_fixture_1',
    type: 'voicemail',
    contactName: 'Jane Doe',
    contactPhone: '+13145550144',
    contactType: 'passenger',
    timestamp: '2:15 PM',
    timestampMs: NOW_MS - 120_000,
    snippet: 'Need a ride to Lambert',
    transcription: 'Hi dispatch, this is Jane Doe. Please pick me up at 16625 Swingley Ridge Rd for Terminal 2.',
    audioDuration: '0:24',
    recordingSid: 'RE_TEST_FIXTURE_ONLY',
    audioUrl: '/api/telephony?action=recording&sid=RE_TEST_FIXTURE_ONLY',
    isUnread: true,
  };
  const callEvent: InteractionEvent = {
    id: 'call_test_fixture_1',
    type: 'call_inbound',
    contactName: 'Elena Vance',
    contactPhone: '+13145550155',
    contactType: 'passenger',
    timestamp: '2:10 PM',
    timestampMs: NOW_MS - 300_000,
    snippet: 'Inbound call',
    durationSeconds: 102,
    recordingSid: 'CA_TEST_FIXTURE_ONLY',
    audioUrl: '/api/telephony?action=recording&sid=CA_TEST_FIXTURE_ONLY',
  };
  const missedEvent: InteractionEvent = {
    id: 'call_test_fixture_2',
    type: 'call_missed',
    contactName: '(314) 555-0199',
    contactPhone: '+13145550199',
    contactType: 'passenger',
    timestamp: '1:55 PM',
    timestampMs: NOW_MS - 600_000,
    snippet: 'Missed call',
  };

  const logHtml = renderToStaticMarkup(
    React.createElement(VoicemailCallLogPane, {
      mode: 'all',
      items: [vmEvent, callEvent, missedEvent],
      playingVoicemailId: null,
      onTogglePlayVoicemail: noop,
      playingCallId: null,
      onTogglePlayCall: noop,
      playbackSpeed: 1,
      onCyclePlaybackSpeed: noop,
      onStartCall: noop,
      onSelectContact: noop,
      onConvertVoicemailToBooking: noop,
      onToggleSelectRow: noop,
      onToggleRowReadStatus: noop,
    })
  );

  assert.equal(logHtml.includes('min-h-[52px] px-3 py-1.5'), true);
  assert.equal(logHtml.includes('data-call-log-row="call_test_fixture_1"'), true);
  assert.equal(logHtml.includes('data-call-audio-player="true"'), true);
  assert.equal(logHtml.includes('data-voicemail-expand-toggle="vm_test_fixture_1"'), true);
  assert.equal(logHtml.includes('Inbound Call · 1:42'), true);
  assert.equal(logHtml.includes('Missed Call'), true);
  assert.equal(logHtml.includes('data-avatar-initials="JD"'), true);
  assert.equal(logHtml.includes('data-avatar-initials="EV"'), true);
  assert.equal(logHtml.includes('data-avatar-initials="icon"'), true);
  assert.equal(logHtml.includes('group-hover:opacity-0'), true, 'Timestamp fades on hover for read toggle');
  assert.equal(logHtml.includes('opacity-0 group-hover:opacity-100'), true, 'Mark read/unread overlays on hover');
  assert.equal(logHtml.includes('aria-label="Call Elena Vance"'), true, 'Call action uses icon button');
  assert.equal(logHtml.includes('>Call<'), false, 'Call action should be icon-only without text label');

  const listRow: CommsConversationRowSummary = {
    threadId: 'thr_test_1',
    selectorTarget: '+13145550144',
    latestEvent: vmEvent,
    contactName: 'Jane Doe',
    contactType: 'passenger',
    primaryPhone: '+13145550144',
    displayPhone: '(314) 555-0144',
    isVip: false,
    isBlacklisted: false,
    channels: ['voicemail'],
    channelCounts: { sms: 0, call: 0, voicemail: 1, email: 0, note: 0 },
    unreadCountTotal: 1,
    unreadByChannel: { sms: 0, call: 0, voicemail: 1, email: 0 },
  };
  const listHtml = renderToStaticMarkup(
    React.createElement(SmsThreadPane, {
      mode: 'list',
      onBackFromThread: noop,
      onOpenContactEdit: noop,
      onBookContactRide: noop,
      threadTab: 'all',
      onChangeThreadTab: noop,
      selectedInteractions: [],
      playingCallId: null,
      onTogglePlayCall: noop,
      playingVoicemailId: null,
      onTogglePlayVoicemail: noop,
      playbackSpeed: 1,
      onCyclePlaybackSpeed: noop,
      onStartCall: noop,
      onConvertVoicemailToBooking: noop,
      smsReplyText: '',
      onChangeSmsReplyText: noop,
      isSendingSms: false,
      onSendSms: noop,
      smsStatusMessage: null,
      conversationRows: [listRow],
      onSelectContact: noop,
      onOpenFreshNewMessageModal: noop,
      onToggleSelectRow: noop,
    })
  );
  assert.equal(listHtml.includes('data-avatar-initials="JD"'), true);
  assert.equal(listHtml.includes('data-voicemail-expand-toggle="vm_test_fixture_1"'), true);
}

function testThreadGlowAndFocusContract(): void {
  console.log('4️⃣  Testing Thread mode data-timeline-event-id, 5s glow, & focus wiring...');
  const smsEvt: InteractionEvent = {
    id: 'sms_test_fixture_1',
    type: 'sms_inbound',
    contactName: 'Jane Doe',
    contactPhone: '+13145550144',
    contactType: 'passenger',
    timestamp: '2:20 PM',
    timestampMs: NOW_MS - 60_000,
    snippet: 'On my way down now',
    bodyText: 'On my way down now',
  };
  const vmEvt: InteractionEvent = {
    id: 'vm_test_fixture_2',
    type: 'voicemail',
    contactName: 'Jane Doe',
    contactPhone: '+13145550144',
    contactType: 'passenger',
    timestamp: '2:18 PM',
    timestampMs: NOW_MS - 90_000,
    snippet: 'Voicemail',
    transcription: 'Please call me back when the driver arrives at the lobby.',
    audioDuration: '0:15',
  };

  const threadHtml = renderToStaticMarkup(
    React.createElement(SmsThreadPane, {
      mode: 'thread',
      activeContactSummary: smsEvt,
      onBackFromThread: noop,
      onOpenContactEdit: noop,
      onBookContactRide: noop,
      threadTab: 'all',
      onChangeThreadTab: noop,
      selectedInteractions: [vmEvt, smsEvt],
      highlightedEvent: { eventId: 'sms_test_fixture_1', nonce: 1 },
      playingCallId: null,
      onTogglePlayCall: noop,
      playingVoicemailId: null,
      onTogglePlayVoicemail: noop,
      playbackSpeed: 1,
      onCyclePlaybackSpeed: noop,
      onStartCall: noop,
      onConvertVoicemailToBooking: noop,
      smsReplyText: '',
      onChangeSmsReplyText: noop,
      isSendingSms: false,
      onSendSms: noop,
      smsStatusMessage: null,
      onSelectContact: noop,
      onOpenFreshNewMessageModal: noop,
    })
  );

  assert.equal(threadHtml.includes('data-timeline-event-id="sms_test_fixture_1"'), true);
  assert.equal(threadHtml.includes('data-timeline-highlighted="true"'), true);
  assert.equal(threadHtml.includes('ring-2 ring-amber-400'), true);
  assert.equal(threadHtml.includes('data-timeline-event-id="vm_test_fixture_2"'), true);
  assert.equal(threadHtml.includes('data-voicemail-expand-toggle="vm_test_fixture_2"'), true);

  const hookSrc = readRel('app/components/domain/dispatch/comms/useCommsMessagingAndContacts.ts');
  assert.equal(hookSrc.includes('selectContactWithFocus'), true);
  assert.equal(hookSrc.includes('5000'), true);
  assert.equal(hookSrc.includes('skipNextBottomScrollRef'), true);

  const paneSrc = readRel('app/components/domain/dispatch/comms/SmsThreadPane.tsx');
  assert.equal(paneSrc.includes("scrollIntoView({ behavior: 'smooth', block: 'center' })"), true);

  const hubSrc = readRel('app/components/domain/dispatch/CommsHub.tsx');
  assert.equal(hubSrc.includes('data-comms-keypad-fab="true"'), true);
  assert.equal(hubSrc.includes('data-comms-new-sms-fab="true"'), true);
  assert.equal(hubSrc.includes('<span>Keypad</span>'), false, 'Keypad FAB should be icon-only');
  assert.equal(hubSrc.includes('<span>New Message</span>'), false, 'New Message FAB should be icon-only');
  assert.equal(hubSrc.includes('<ChatBubbleLeftRightIcon className="w-4 h-4" />'), true, 'New Message FAB uses bubble icon');
}

testPastelAvatarDeterminismAndFallbacks();
testCommsContactAvatarMarkup();
testUnifiedTwoRowLogsAndInlineVoicemailToggle();
testThreadGlowAndFocusContract();
console.log('✅ Phase 90 verification passed!');
