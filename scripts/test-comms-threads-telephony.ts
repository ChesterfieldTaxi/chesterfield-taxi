/**
 * Platform Phase 39 (Wave 2 Phase 1) Verification Suite:
 * Unified Multi-Channel Thread Engine, Serverless Telephony Persistence & Security Hardening
 *
 * Verifies:
 * 1. Unified contact & canonical thread resolution (`normalizeEmail`, `getContactByEmail`,
 *    `resolveUnifiedContact`, `resolveCanonicalThreadId`): inbound SMS from `+13145550199` +
 *    inbound/outbound email for `amanda.vance@bayer.com` + internal notes resolving to the
 *    exact same `CommsThread` with accurate `unreadByChannel` counters, plus automatic thread
 *    merging when previously separate phone-only and email-only threads become linked via
 *    contact save or trip creation.
 * 2. `verifyTwilioWebhookSignature`: valid HMAC-SHA1 signature accepted (including Vercel
 *    `x-forwarded-proto` / `x-forwarded-host` proxy reconstruction), tampered body/signature
 *    rejected (`403`), and missing `X-Twilio-Signature` header rejected (`403`) when enforced.
 * 3. Idempotent Twilio webhook ingestion (`incoming_sms`, `voicemail_recorded` +
 *    `voicemail_transcription` updating the existing voicemail event, `call_status_callback`,
 *    `call_recording_status`) with zero duplicate `CommsEvent` records on webhook retries.
 * 4. Security gates on `GET` & `POST /api/telephony`: unauthenticated `get_voice_token`,
 *    `list_messages`, `list_recordings`, `list_voicemails`, `sync_comms`, and unsigned
 *    `audio_proxy` return `401`/`403`, while signed `audio_proxy` URLs (`sig` + `exp`) and
 *    authenticated dispatcher requests succeed (`200`).
 * 5. `firestore.rules` staff-only rules for `/commsThreads`, `/commsEvents`, and
 *    `/telephonyWebhookEvents`, plus `vercel.json` Hobby cron preservation (`"0 10 * * *"`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { VerifiedServerAuth } from '../app/core/services/auth/server-auth.server';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import {
  getCommsServerStore,
  resetCommsServerStoreForTests,
} from '../app/core/services/comms/comms-thread.server';
import {
  commsEventToInteractionEvent,
  getCommsThreadService,
  interactionEventToCommsEvent,
} from '../app/core/services/comms/comms-thread.service';
import {
  buildSignedAudioProxyUrl,
  computeTwilioWebhookSignature,
  handleTelephonyGet,
  handleTelephonyPost,
  resetTelephonyGatewayStoreForTests,
  verifyTwilioWebhookSignature,
} from '../app/core/services/comms/telephony-gateway.server';
import {
  getContactService,
  normalizeEmail,
  resolveCanonicalThreadId,
  resolveUnifiedContact,
} from '../app/core/services/customer/contact.service';
import { getDispatchEmailService } from '../app/core/services/email/dispatch-email.service';
import {
  reconcileCommsEventStatus,
  reconcileCommsThreadStatus,
} from '../app/core/types/comms';
import { DISPATCH_MAILBOX_ADDRESS, buildDeterministicRfcMessageId, buildDispatchEmailCommsEventId } from '../app/core/types/dispatch-email';

const UNAUTH: VerifiedServerAuth = {
  authenticated: false,
  isAdminSecret: false,
  roles: [],
  isAdmin: false,
  isDispatcher: false,
  isDriver: false,
  isCorporateManager: false,
};

const CUSTOMER_AUTH: VerifiedServerAuth = {
  authenticated: true,
  isAdminSecret: false,
  uid: 'uid_customer_1',
  email: 'rider@example.com',
  roles: ['customer'],
  isAdmin: false,
  isDispatcher: false,
  isDriver: false,
  isCorporateManager: false,
  rawToken: 'tok_customer',
};

const DRIVER_AUTH: VerifiedServerAuth = {
  authenticated: true,
  isAdminSecret: false,
  uid: 'uid_driver_104',
  email: 'driver104@chesterfieldtaxi.com',
  roles: ['driver'],
  isAdmin: false,
  isDispatcher: false,
  isDriver: true,
  isCorporateManager: false,
  rawToken: 'tok_driver',
};

const DISPATCHER_AUTH: VerifiedServerAuth = {
  authenticated: true,
  isAdminSecret: false,
  uid: 'uid_dispatch_1',
  email: 'dispatch@chesterfieldtaxi.com',
  roles: ['dispatcher'],
  isAdmin: false,
  isDispatcher: true,
  isDriver: false,
  isCorporateManager: false,
  rawToken: 'tok_dispatcher',
};

const TEST_TWILIO_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  TWILIO_ACCOUNT_SID: 'AC_TEST_PHASE39_FIXTURE',
  TWILIO_AUTH_TOKEN: 'tw_secret_auth_token_phase39_test',
  TWILIO_PHONE_NUMBER: '+13147380100',
  TWILIO_API_KEY_SID: 'SK_TEST_PHASE39_FIXTURE',
  TWILIO_API_KEY_SECRET: 'api_secret_key_for_webrtc_jwt_test',
  TWILIO_TWIML_APP_SID: 'AP_TEST_PHASE39_FIXTURE',
  DISPATCH_FORWARDING_PHONE: '+13145550100',
  TELEPHONY_SIGNING_SECRET: 'audio_hmac_signing_secret_phase39',
};

async function runTests() {
  console.log('📞 Running Phase 39 Unified Multi-Channel Comms & Telephony Security Suite...\n');

  const contactService = getContactService();
  const commsService = getCommsThreadService();
  contactService.resetForTests();
  commsService.resetForTests();
  resetCommsServerStoreForTests();
  resetTelephonyGatewayStoreForTests();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Unified Contact Resolution, Multi-Channel Threading & Late Thread Merge
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing unified contact resolution, multi-channel rollups & thread merging...');

  assert.equal(normalizeEmail('  Amanda.Vance@Bayer.COM '), 'amanda.vance@bayer.com');
  assert.equal(
    normalizeEmail('Amanda Vance <Amanda.Vance@Bayer.com>'),
    'amanda.vance@bayer.com'
  );
  assert.equal(normalizeEmail('not-an-email'), '');

  const byPhone = contactService.getContactByPhone('+13145550199');
  const byEmail = contactService.getContactByEmail('AMANDA.VANCE@BAYER.COM');
  assert.ok(byPhone, 'Expected Amanda Vance profile by phone +13145550199');
  assert.ok(byEmail, 'Expected Amanda Vance profile by email amanda.vance@bayer.com');
  assert.equal(byPhone.id, byEmail.id, 'Phone and email must resolve to the exact same ContactRecord');

  const resFromPhone = resolveUnifiedContact({ phone: '+13145550199' });
  const resFromEmail = resolveUnifiedContact({ email: 'amanda.vance@bayer.com' });
  assert.equal(resFromPhone.threadId, resFromEmail.threadId);
  assert.equal(resFromPhone.contactName, 'Amanda Vance');
  assert.equal(resFromEmail.primaryPhone, '+13145550199');
  assert.equal(resFromPhone.primaryEmail, 'amanda.vance@bayer.com');

  // Record inbound SMS (+13145550199), inbound Email (amanda.vance@bayer.com), outbound Email, and Internal Note
  const smsIn = await commsService.recordCommsEvent(
    {
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      externalSid: 'SM_AMANDA_1',
      contactPhone: '+13145550199',
      snippet: 'Just landed at STL Terminal 1, heading to Exit 6.',
      bodyText: 'Just landed at STL Terminal 1, heading to Exit 6.',
      timestampMs: 1_700_000_001_000,
    },
    { skipFirestore: true }
  );

  const emailIn = await commsService.recordCommsEvent(
    {
      channel: 'email',
      direction: 'inbound',
      eventType: 'email_inbound',
      emailMessageId: 'em-bayer-01',
      contactEmail: 'amanda.vance@bayer.com',
      fromAddress: 'amanda.vance@bayer.com',
      toAddress: 'dispatch@chesterfieldtaxi.com',
      subject: 'Executive Transfer Request - STL to Bayer Campus',
      snippet: 'Executive sedan transfer tomorrow 8:30 AM',
      bodyText: 'Please arrange an executive sedan from STL Terminal 1 to Bayer Campus.',
      timestampMs: 1_700_000_002_000,
    },
    { skipFirestore: true }
  );

  const emailOut = await commsService.recordCommsEvent(
    {
      channel: 'email',
      direction: 'outbound',
      eventType: 'email_outbound',
      emailMessageId: 'sent-bayer-01',
      contactEmail: 'amanda.vance@bayer.com',
      fromAddress: 'dispatch@chesterfieldtaxi.com',
      toAddress: 'amanda.vance@bayer.com',
      subject: 'Re: Executive Transfer Request - STL to Bayer Campus',
      snippet: 'Confirmed! Car #104 assigned.',
      bodyText: 'Confirmed! Car #104 is assigned for 8:30 AM.',
      timestampMs: 1_700_000_003_000,
    },
    { skipFirestore: true }
  );

  const noteAdded = await commsService.addInternalNote({
    email: 'amanda.vance@bayer.com',
    bodyText: 'VIP Bayer corporate account — driver should greet with name sign.',
    actorName: 'Dispatcher Sarah',
    id: 'n_bayer_1',
    timestampMs: 1_700_000_004_000,
  });

  assert.equal(smsIn.event.id, 'sms_SM_AMANDA_1');
  assert.equal(emailIn.event.id, 'em_em-bayer-01');
  assert.equal(emailOut.event.id, 'em_sent-bayer-01');
  assert.equal(noteAdded.event.id, 'note_n_bayer_1');

  assert.equal(smsIn.thread.id, emailIn.thread.id, 'SMS and Email must share canonical CommsThread');
  assert.equal(emailOut.thread.id, smsIn.thread.id);
  assert.equal(noteAdded.thread.id, smsIn.thread.id);

  const amandaThread = commsService.getThreadById(smsIn.thread.id)!;
  assert.ok(amandaThread);
  assert.deepEqual(amandaThread.unreadByChannel, {
    sms: 1,
    call: 0,
    voicemail: 0,
    email: 1,
  });
  assert.equal(amandaThread.unreadCountTotal, 2);
  assert.ok(amandaThread.channels.includes('sms'));
  assert.ok(amandaThread.channels.includes('email'));
  assert.ok(amandaThread.channels.includes('note'));
  assert.equal(commsService.getThreadEvents(amandaThread.id).length, 4);

  // Adapter roundtrip check
  const interactionView = commsEventToInteractionEvent(emailIn.event, amandaThread);
  assert.equal(interactionView.type, 'email_inbound');
  assert.equal(interactionView.contactPhone, '+13145550199');
  assert.equal(interactionView.contactEmail, 'amanda.vance@bayer.com');
  const backToComms = interactionEventToCommsEvent(interactionView);
  assert.equal(backToComms.threadId, amandaThread.id);

  // Mark only SMS read -> email remains unread (1)
  const afterSmsRead = await commsService.markThreadRead(amandaThread.id, ['sms']);
  assert.ok(afterSmsRead);
  assert.deepEqual(afterSmsRead.unreadByChannel, {
    sms: 0,
    call: 0,
    voicemail: 0,
    email: 1,
  });
  assert.equal(afterSmsRead.unreadCountTotal, 1);

  // Late linkage Case A: phone-only thread + email-only thread merged via ContactService.saveContact
  const fragSms = await commsService.recordCommsEvent(
    {
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      externalSid: 'SM_JORDAN_PHONE_ONLY',
      contactPhone: '+16365550188',
      snippet: 'Do you have an SUV available at 6pm?',
    },
    { skipFirestore: true }
  );
  const fragEmail = await commsService.recordCommsEvent(
    {
      channel: 'email',
      direction: 'inbound',
      eventType: 'email_inbound',
      emailMessageId: 'em_jordan_email_only',
      contactEmail: 'jordan.blake@enterprise.com',
      subject: '6pm SUV Inquiry',
      snippet: 'Following up by email for 6pm SUV.',
    },
    { skipFirestore: true }
  );

  assert.notEqual(
    fragSms.thread.id,
    fragEmail.thread.id,
    'Before contact linkage, unknown phone and unknown email have separate threads'
  );
  assert.equal(fragSms.thread.id, resolveCanonicalThreadId({ phone: '+16365550188' }));
  assert.equal(fragEmail.thread.id, resolveCanonicalThreadId({ email: 'jordan.blake@enterprise.com' }));

  const savedJordan = contactService.saveContact({
    name: 'Jordan Blake',
    phone: '+16365550188',
    email: 'jordan.blake@enterprise.com',
  });
  const mergedJordan = await commsService.mergeThreadsForContact(savedJordan);
  assert.ok(mergedJordan, 'Expected merged canonical thread for Jordan Blake');
  assert.equal(mergedJordan.contactName, 'Jordan Blake');
  assert.ok(mergedJordan.phones.includes('+16365550188'));
  assert.ok(mergedJordan.emails.includes('jordan.blake@enterprise.com'));
  assert.deepEqual(mergedJordan.unreadByChannel, {
    sms: 1,
    call: 0,
    voicemail: 0,
    email: 1,
  });
  assert.equal(mergedJordan.unreadCountTotal, 2);
  assert.equal(commsService.getThreadById(fragSms.thread.id), null);
  assert.equal(commsService.getThreadById(fragEmail.thread.id), null);
  assert.equal(commsService.getThreadEvents(mergedJordan.id).length, 2);

  // Late linkage Case B: separate phone-only + email-only threads merged automatically via Trip creation
  const tripFragPhone = await commsService.recordCommsEvent(
    {
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      externalSid: 'SM_CLAIRE_1',
      contactPhone: '+16365550177',
      snippet: 'Booking ride from Spirit SUS airport.',
    },
    { skipFirestore: true }
  );
  const tripFragEmail = await commsService.recordCommsEvent(
    {
      channel: 'email',
      direction: 'inbound',
      eventType: 'email_inbound',
      emailMessageId: 'em_claire_1',
      contactEmail: 'claire.chen@mercy.net',
      subject: 'Spirit Airport Pickup',
      snippet: 'Itinerary attached for SUS pickup.',
    },
    { skipFirestore: true }
  );
  assert.notEqual(tripFragPhone.thread.id, tripFragEmail.thread.id);

  const mockBooking = new MockBookingService();
  const createdTrip = await mockBooking.createBooking({
    pickupLocation: { address: 'Spirit of St. Louis Airport (SUS), Chesterfield, MO' },
    dropoffLocation: { address: 'Mercy Hospital St. Louis, 615 S New Ballas Rd, St. Louis, MO' },
    bookingType: 'scheduled',
    scheduledPickupTime: new Date(Date.now() + 3_600_000).toISOString(),
    vehicleTier: 'premium',
    passenger: {
      firstName: 'Claire',
      lastName: 'Chen',
      phone: '(636) 555-0177',
      email: 'claire.chen@mercy.net',
      passengerCount: 1,
      luggageCount: 1,
    },
    pricing: {
      baseFare: 52,
      distanceMiles: 14.2,
      durationMinutes: 20,
      distanceRate: 2.25,
      timeRate: 0,
      vehicleMultiplier: 1.25,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 52,
      totalFare: 52,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 52,
    },
  });
  // Ensure async linkTripToThread settles
  const linkedClaireThread = await commsService.linkTripToThread({
    tripId: createdTrip.id,
    phone: '+16365550177',
    email: 'claire.chen@mercy.net',
    passengerName: 'Claire Chen',
  });
  assert.ok(linkedClaireThread);
  assert.ok(linkedClaireThread.linkedTripIds.includes(createdTrip.id));
  assert.equal(commsService.getThreadEvents(linkedClaireThread.id).length, 2);

  console.log('   ✅ Passed unified contact resolution, rollups & automatic thread merging.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Cryptographic `verifyTwilioWebhookSignature` Validation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing verifyTwilioWebhookSignature (valid, proxy-forwarded, tampered, missing)...');

  const webhookUrl = 'https://chesterfieldtaxi.vercel.app/api/telephony?action=incoming_sms';
  const smsFormParams: Record<string, string> = {
    MessageSid: 'SM9988776655',
    From: '+13145550199',
    To: '+13147380100',
    Body: 'Ready outside baggage claim Door 6.',
  };
  const validTwilioSig = computeTwilioWebhookSignature(
    TEST_TWILIO_ENV.TWILIO_AUTH_TOKEN,
    webhookUrl,
    smsFormParams
  );

  // Direct verification: valid
  const directValid = verifyTwilioWebhookSignature({
    url: webhookUrl,
    params: smsFormParams,
    signatureHeader: validTwilioSig,
    authToken: TEST_TWILIO_ENV.TWILIO_AUTH_TOKEN,
  });
  assert.equal(directValid.valid, true);
  assert.equal(directValid.status, 200);

  // Proxy-forwarded verification (internal http://localhost URL behind Vercel https proxy headers)
  const proxiedReq = new Request('http://127.0.0.1:3000/api/telephony?action=incoming_sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'chesterfieldtaxi.vercel.app',
      'X-Twilio-Signature': validTwilioSig,
    },
    body: new URLSearchParams(smsFormParams).toString(),
  });
  const proxiedCheck = verifyTwilioWebhookSignature({
    request: proxiedReq,
    params: smsFormParams,
    authToken: TEST_TWILIO_ENV.TWILIO_AUTH_TOKEN,
  });
  assert.equal(proxiedCheck.valid, true);

  // Tampered body -> 403
  const tamperedBodyCheck = verifyTwilioWebhookSignature({
    url: webhookUrl,
    params: { ...smsFormParams, Body: 'TAMPERED PAYLOAD' },
    signatureHeader: validTwilioSig,
    authToken: TEST_TWILIO_ENV.TWILIO_AUTH_TOKEN,
  });
  assert.equal(tamperedBodyCheck.valid, false);
  assert.equal(tamperedBodyCheck.status, 403);
  assert.equal(tamperedBodyCheck.code, 'SIGNATURE_MISMATCH');

  // Missing signature header via HTTP handler when enforced -> 403
  const unsignedWebhookReq = new Request(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(smsFormParams).toString(),
  });
  const unsignedWebhookRes = await handleTelephonyPost(unsignedWebhookReq, {
    env: TEST_TWILIO_ENV,
    enforceWebhookSignature: true,
    skipFirestore: true,
  });
  assert.equal(unsignedWebhookRes.status, 403);

  // Tampered signature header via HTTP handler when enforced -> 403
  const badSigWebhookReq = new Request(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': 'badSignatureBase64Value==',
    },
    body: new URLSearchParams(smsFormParams).toString(),
  });
  const badSigWebhookRes = await handleTelephonyPost(badSigWebhookReq, {
    env: TEST_TWILIO_ENV,
    enforceWebhookSignature: true,
    skipFirestore: true,
  });
  assert.equal(badSigWebhookRes.status, 403);

  console.log('   ✅ Passed X-Twilio-Signature HMAC-SHA1 verification & tamper rejection.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Idempotent Twilio Webhook Ingestion (`incoming_sms`, `voicemail`, `call_status`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Testing idempotent Twilio webhook ingestion & retry deduplication...');

  resetCommsServerStoreForTests();
  resetTelephonyGatewayStoreForTests();

  const makeSignedFormPost = (actionName: string, params: Record<string, string>) => {
    const targetUrl = `https://chesterfieldtaxi.vercel.app/api/telephony?action=${actionName}`;
    const sig = computeTwilioWebhookSignature(
      TEST_TWILIO_ENV.TWILIO_AUTH_TOKEN,
      targetUrl,
      params
    );
    return new Request(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Twilio-Signature': sig,
      },
      body: new URLSearchParams(params).toString(),
    });
  };

  // 3A. `incoming_sms` + duplicate webhook retry
  const smsRes1 = await handleTelephonyPost(makeSignedFormPost('incoming_sms', smsFormParams), {
    env: TEST_TWILIO_ENV,
    enforceWebhookSignature: true,
    skipFirestore: true,
    nowMs: 1_700_010_000_000,
  });
  assert.equal(smsRes1.status, 200);
  assert.match(await smsRes1.text(), /<Response\/>/);

  const smsResRetry = await handleTelephonyPost(
    makeSignedFormPost('incoming_sms', smsFormParams),
    {
      env: TEST_TWILIO_ENV,
      enforceWebhookSignature: true,
      skipFirestore: true,
      nowMs: 1_700_010_005_000,
    }
  );
  assert.equal(smsResRetry.status, 200);

  const serverStore = getCommsServerStore();
  assert.equal(serverStore.events.size, 1, 'Retry of incoming_sms must NOT create duplicate event');
  assert.ok(serverStore.events.has('sms_SM9988776655'));

  // 3B. `voicemail_recorded` followed by `voicemail_transcription` (plus retry)
  const vmRecordedParams = {
    CallSid: 'CA_VM_CALL_01',
    RecordingSid: 'RE_VM_REC_01',
    From: '+13145550199',
    To: '+13147380100',
    RecordingDuration: '42',
  };
  const vmRecRes = await handleTelephonyPost(
    makeSignedFormPost('voicemail_recorded', vmRecordedParams),
    {
      env: TEST_TWILIO_ENV,
      enforceWebhookSignature: true,
      skipFirestore: true,
      nowMs: 1_700_010_010_000,
    }
  );
  assert.equal(vmRecRes.status, 200);
  assert.equal(serverStore.events.size, 2);
  assert.ok(serverStore.events.has('vm_RE_VM_REC_01'));

  const vmTranscriptParams = {
    CallSid: 'CA_VM_CALL_01',
    RecordingSid: 'RE_VM_REC_01',
    From: '+13145550199',
    TranscriptionText: 'Hi Chesterfield Taxi, this is Amanda Vance requesting pickup at Door 6.',
  };
  const vmTransRes = await handleTelephonyPost(
    makeSignedFormPost('voicemail_transcription', vmTranscriptParams),
    {
      env: TEST_TWILIO_ENV,
      enforceWebhookSignature: true,
      skipFirestore: true,
      nowMs: 1_700_010_020_000,
    }
  );
  assert.equal(vmTransRes.status, 200);
  const vmTransJson = (await vmTransRes.json()) as any;
  assert.equal(vmTransJson.success, true);
  assert.equal(vmTransJson.updated, true);
  assert.equal(vmTransJson.eventId, 'vm_RE_VM_REC_01');
  assert.equal(
    serverStore.events.size,
    2,
    'voicemail_transcription must update existing vm_RE_VM_REC_01 in place without adding a 3rd event'
  );
  assert.equal(
    serverStore.events.get('vm_RE_VM_REC_01')?.transcription,
    vmTranscriptParams.TranscriptionText
  );

  // 3C. `call_status_callback` (missed call) + duplicate retry
  const missedCallParams = {
    CallSid: 'CA_MISSED_777',
    CallStatus: 'no-answer',
    From: '+13145550199',
    To: '+13147380100',
    CallDuration: '0',
    Direction: 'inbound',
  };
  const callStatRes1 = await handleTelephonyPost(
    makeSignedFormPost('call_status_callback', missedCallParams),
    {
      env: TEST_TWILIO_ENV,
      enforceWebhookSignature: true,
      skipFirestore: true,
      nowMs: 1_700_010_030_000,
    }
  );
  assert.equal(callStatRes1.status, 200);

  const callStatRetry = await handleTelephonyPost(
    makeSignedFormPost('call_status_callback', missedCallParams),
    {
      env: TEST_TWILIO_ENV,
      enforceWebhookSignature: true,
      skipFirestore: true,
      nowMs: 1_700_010_035_000,
    }
  );
  assert.equal(callStatRetry.status, 200);

  assert.equal(serverStore.events.size, 3);
  assert.equal(serverStore.events.get('call_CA_MISSED_777')?.eventType, 'call_missed');
  assert.equal(serverStore.threads.size, 1, 'All 3 events for +13145550199 belong to 1 thread');
  const serverAmandaThread = Array.from(serverStore.threads.values())[0];
  assert.equal(serverAmandaThread.contactName, 'Amanda Vance');
  assert.deepEqual(serverAmandaThread.unreadByChannel, {
    sms: 1,
    call: 1,
    voicemail: 1,
    email: 0,
  });
  assert.equal(serverAmandaThread.unreadCountTotal, 3);

  console.log('   ✅ Passed idempotent webhook ingestion, transcription update & rollup counts.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Security Gates on `GET` & `POST /api/telephony` + Signed `audio_proxy`
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing GET/POST /api/telephony staff auth gates & signed audio_proxy...');

  const protectedGetActions = [
    'get_voice_token',
    'list_messages',
    'list_recordings',
    'list_voicemails',
    'sync_comms',
  ];

  for (const act of protectedGetActions) {
    // Unauthenticated -> 401
    const unauthRes = await handleTelephonyGet(
      new Request(`https://chesterfieldtaxi.vercel.app/api/telephony?action=${act}`),
      {
        env: TEST_TWILIO_ENV,
        enforceAuth: true,
        authResolver: async () => UNAUTH,
        skipFirestore: true,
      }
    );
    assert.equal(unauthRes.status, 401, `Expected 401 for unauthenticated GET ${act}`);

    // Customer role -> 403
    const customerRes = await handleTelephonyGet(
      new Request(`https://chesterfieldtaxi.vercel.app/api/telephony?action=${act}`),
      {
        env: TEST_TWILIO_ENV,
        enforceAuth: true,
        authResolver: async () => CUSTOMER_AUTH,
        skipFirestore: true,
      }
    );
    assert.equal(customerRes.status, 403, `Expected 403 for customer GET ${act}`);

    // Driver role on dispatcher-only endpoints -> 403
    const driverRes = await handleTelephonyGet(
      new Request(`https://chesterfieldtaxi.vercel.app/api/telephony?action=${act}`),
      {
        env: TEST_TWILIO_ENV,
        enforceAuth: true,
        authResolver: async () => DRIVER_AUTH,
        skipFirestore: true,
      }
    );
    assert.equal(driverRes.status, 403, `Expected 403 for driver GET ${act}`);
  }

  // Unauthenticated POSTs -> 401
  for (const postAction of [
    'get_voice_token',
    'list_messages',
    'list_recordings',
    'list_voicemails',
    'sync_comms',
    'update_comms_status',
    'verify_credentials',
    'save_credentials',
    'make_call',
    'send_sms',
  ]) {
    const unauthPost = await handleTelephonyPost(
      new Request('https://chesterfieldtaxi.vercel.app/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: postAction, to: '+13145550199', body: 'Test' }),
      }),
      {
        env: TEST_TWILIO_ENV,
        enforceAuth: true,
        authResolver: async () => UNAUTH,
        skipFirestore: true,
      }
    );
    assert.equal(unauthPost.status, 401, `Expected 401 for unauthenticated POST ${postAction}`);
  }

  // Driver allowed on `send_sms` (`auth.isDispatcher || auth.isDriver`) -> 200
  const mockTwilioFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.includes('/Messages.json')) {
      return new Response(
        JSON.stringify({
          sid: 'SM_DRIVER_OUT_01',
          status: 'sent',
          to: '+13145550199',
          from: '+13147380100',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/Recordings/RE_VM_REC_01.mp3')) {
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }
    return new Response(JSON.stringify({ messages: [], recordings: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const driverSmsRes = await handleTelephonyPost(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_sms',
        to: '+13145550199',
        body: 'Your driver has arrived outside Terminal 1.',
      }),
    }),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DRIVER_AUTH,
      fetchImpl: mockTwilioFetch,
      skipFirestore: true,
    }
  );
  assert.equal(driverSmsRes.status, 200);

  // Authenticated Dispatcher `get_voice_token` & `sync_comms` -> 200
  const dispatcherTokenRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=get_voice_token'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      skipFirestore: true,
    }
  );
  assert.equal(dispatcherTokenRes.status, 200);
  const tokenJson = (await dispatcherTokenRes.json()) as any;
  assert.equal(tokenJson.success, true);
  assert.ok(typeof tokenJson.token === 'string' && tokenJson.token.length > 40);

  const fixedNowMs = 1_700_020_000_000;
  const syncRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=sync_comms'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      nowMs: fixedNowMs,
      skipFirestore: true,
    }
  );
  assert.equal(syncRes.status, 200);
  const syncJson = (await syncRes.json()) as any;
  assert.equal(syncJson.success, true);
  const syncedVm = syncJson.events.find((e: any) => e.id === 'vm_RE_VM_REC_01');
  assert.ok(syncedVm, 'Expected vm_RE_VM_REC_01 in sync_comms payload');
  assert.match(syncedVm.audioUrl, /action=audio_proxy.*recordingSid=RE_VM_REC_01.*exp=.*sig=/);

  // `audio_proxy` security matrix:
  // A. Unsigned & unauthenticated -> 401
  const unsignedAudioRes = await handleTelephonyGet(
    new Request(
      'https://chesterfieldtaxi.vercel.app/api/telephony?action=audio_proxy&recordingSid=RE_VM_REC_01'
    ),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => UNAUTH,
      fetchImpl: mockTwilioFetch,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(unsignedAudioRes.status, 401);

  // B. Tampered signature -> 403
  const tamperedAudioRes = await handleTelephonyGet(
    new Request(
      `https://chesterfieldtaxi.vercel.app${syncedVm.audioUrl.replace(/sig=[a-f0-9]+/, 'sig=deadbeef')}`
    ),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => UNAUTH,
      fetchImpl: mockTwilioFetch,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(tamperedAudioRes.status, 403);

  // C. Expired signature -> 403
  const expiredUrl = buildSignedAudioProxyUrl('RE_VM_REC_01', {
    nowMs: fixedNowMs - 7_200_000,
    ttlSeconds: 60,
    env: TEST_TWILIO_ENV,
  });
  const expiredAudioRes = await handleTelephonyGet(
    new Request(`https://chesterfieldtaxi.vercel.app${expiredUrl}`),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => UNAUTH,
      fetchImpl: mockTwilioFetch,
      nowMs: fixedNowMs,
    }
  );
  assert.equal(expiredAudioRes.status, 403);

  // D. Valid server-signed URL (NO Authorization header, matching HTML `<audio src="...">`) -> 200
  const signedAudioRes = await handleTelephonyGet(
    new Request(`https://chesterfieldtaxi.vercel.app${syncedVm.audioUrl}`),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => UNAUTH,
      fetchImpl: mockTwilioFetch,
      nowMs: fixedNowMs + 30_000,
    }
  );
  assert.equal(signedAudioRes.status, 200);
  assert.equal(signedAudioRes.headers.get('Content-Type'), 'audio/mpeg');
  const audioBytes = await signedAudioRes.arrayBuffer();
  assert.equal(audioBytes.byteLength, 5);

  console.log('   ✅ Passed GET/POST auth gates & HMAC-signed audio_proxy verification.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. `firestore.rules` & `vercel.json` Invariant Checks
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Verifying firestore.rules & vercel.json invariants...');

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  assert.match(
    rulesText,
    /match\s+\/commsThreads\/\{threadId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isDispatcher\(\);\s*\}/
  );
  assert.match(
    rulesText,
    /match\s+\/commsEvents\/\{eventId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isDispatcher\(\);\s*\}/
  );
  assert.match(
    rulesText,
    /match\s+\/telephonyWebhookEvents\/\{eventId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isDispatcher\(\);\s*\}/
  );

  const vercelJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  );
  assert.equal(vercelJson.crons?.[0]?.schedule, '0 10 * * *');

  console.log('   ✅ Passed firestore.rules & vercel.json assertions.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Phase 81: Status Persistence, `statusUpdatedAtMs` LWW, `update_comms_status` & Bidirectional Email Sync
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Testing Phase 81 status persistence, LWW tombstones, update_comms_status & email sync...');

  // 6A. Role gate on POST `update_comms_status` (403 for customer & driver)
  for (const nonDispatcherAuth of [CUSTOMER_AUTH, DRIVER_AUTH]) {
    const forbiddenStatusRes = await handleTelephonyPost(
      new Request('https://chesterfieldtaxi.vercel.app/api/telephony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_comms_status',
          eventIds: ['sms_SM9988776655'],
          isUnread: false,
        }),
      }),
      {
        env: TEST_TWILIO_ENV,
        enforceAuth: true,
        authResolver: async () => nonDispatcherAuth,
        skipFirestore: true,
      }
    );
    assert.equal(forbiddenStatusRes.status, 403, 'Expected 403 for non-dispatcher update_comms_status');
  }

  // 6B. Pure `statusUpdatedAtMs` LWW & sticky `isDeleted` tombstone invariants
  const baseEvt = serverStore.events.get('sms_SM9988776655')!;
  assert.ok(baseEvt);

  const readAt200 = reconcileCommsEventStatus(baseEvt, {
    ...baseEvt,
    isUnread: false,
    statusUpdatedAtMs: 200,
  });
  assert.equal(readAt200.isUnread, false);
  assert.equal(readAt200.statusUpdatedAtMs, 200);

  // Older sync payload (statusUpdatedAtMs: 100 or undefined) must NOT mark unread again
  const staleUnreadAt100 = reconcileCommsEventStatus(readAt200, {
    ...baseEvt,
    isUnread: true,
    statusUpdatedAtMs: 100,
  });
  assert.equal(staleUnreadAt100.isUnread, false);
  assert.equal(staleUnreadAt100.statusUpdatedAtMs, 200);

  const staleUnreadNoTs = reconcileCommsEventStatus(readAt200, {
    ...baseEvt,
    isUnread: true,
  });
  assert.equal(staleUnreadNoTs.isUnread, false);
  assert.equal(staleUnreadNoTs.statusUpdatedAtMs, 200);

  // Newer explicit mark-unread mutation (statusUpdatedAtMs: 300) wins LWW
  const unreadAt300 = reconcileCommsEventStatus(readAt200, {
    ...baseEvt,
    isUnread: true,
    statusUpdatedAtMs: 300,
  });
  assert.equal(unreadAt300.isUnread, true);
  assert.equal(unreadAt300.statusUpdatedAtMs, 300);

  // Sticky `isDeleted: true` tombstone wins even against newer non-deleted payloads
  const deletedAt400 = reconcileCommsEventStatus(unreadAt300, {
    ...unreadAt300,
    isDeleted: true,
    statusUpdatedAtMs: 400,
  });
  assert.equal(deletedAt400.isDeleted, true);
  assert.equal(deletedAt400.isUnread, false);

  const attemptedResurrectAt900 = reconcileCommsEventStatus(deletedAt400, {
    ...baseEvt,
    isDeleted: false,
    isUnread: true,
    statusUpdatedAtMs: 900,
  });
  assert.equal(attemptedResurrectAt900.isDeleted, true, 'isDeleted must remain a sticky tombstone');
  assert.equal(attemptedResurrectAt900.isUnread, false);

  const sampleThr = Array.from(serverStore.threads.values())[0]!;
  const archivedThrAt500 = reconcileCommsThreadStatus(sampleThr, {
    ...sampleThr,
    isArchived: true,
    statusUpdatedAtMs: 500,
  });
  assert.equal(archivedThrAt500.isArchived, true);
  const unarchivedThrAt600 = reconcileCommsThreadStatus(archivedThrAt500, {
    ...archivedThrAt500,
    isArchived: false,
    statusUpdatedAtMs: 600,
  });
  assert.equal(unarchivedThrAt600.isArchived, false);
  assert.equal(unarchivedThrAt600.statusUpdatedAtMs, 600);

  // 6C. End-to-End Read & Soft-Delete Persistence Across `update_comms_status`, `list_messages`, `list_voicemails`, and `sync_comms`
  resetCommsServerStoreForTests();
  resetTelephonyGatewayStoreForTests();
  commsService.resetForTests();

  const mockPhase81TwilioFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.includes('/Messages.json')) {
      return new Response(
        JSON.stringify({
          messages: [
            {
              sid: 'SM_P81_READ_KEEP',
              from: '+13145550199',
              to: '+13147380100',
              body: 'Please confirm my 7am pickup.',
              status: 'received',
              direction: 'inbound',
              date_sent: new Date(1_700_050_001_000).toUTCString(),
            },
            {
              sid: 'SM_P81_DELETE_ME',
              from: '+16365550144',
              to: '+13147380100',
              body: 'Wrong number test message.',
              status: 'received',
              direction: 'inbound',
              date_sent: new Date(1_700_050_002_000).toUTCString(),
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ recordings: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // Wire CommsThreadService mutations directly to `handleTelephonyPost` (`update_comms_status`)
  commsService.setServerSyncFetchForTests(async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const fullUrl = rawUrl.startsWith('http')
      ? rawUrl
      : `https://chesterfieldtaxi.vercel.app${rawUrl}`;
    return handleTelephonyPost(new Request(fullUrl, init), {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      fetchImpl: mockPhase81TwilioFetch,
      skipFirestore: true,
    });
  });

  // Ingest a voicemail webhook + fetch initial Twilio messages
  await handleTelephonyPost(
    makeSignedFormPost('voicemail_recorded', {
      CallSid: 'CA_P81_VM_01',
      RecordingSid: 'RE_P81_VM_01',
      From: '+16365550144',
      To: '+13147380100',
      RecordingDuration: '25',
    }),
    {
      env: TEST_TWILIO_ENV,
      enforceWebhookSignature: true,
      skipFirestore: true,
      nowMs: 1_700_050_003_000,
    }
  );

  const initialListMsgRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=list_messages'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      fetchImpl: mockPhase81TwilioFetch,
      skipFirestore: true,
      nowMs: 1_700_050_004_000,
    }
  );
  const initialListMsgJson = (await initialListMsgRes.json()) as any;
  assert.equal(initialListMsgJson.messages.length, 2);

  const initialSyncRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=sync_comms'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      skipFirestore: true,
      nowMs: 1_700_050_005_000,
    }
  );
  const initialSyncJson = (await initialSyncRes.json()) as any;
  commsService.hydrateFromServerSync({
    threads: initialSyncJson.threads,
    events: initialSyncJson.events,
  });
  assert.equal(commsService.getAllEvents().length, 3);
  assert.equal(commsService.getEventById('sms_SM_P81_READ_KEEP')?.isUnread, true);

  // Mark `sms_SM_P81_READ_KEEP` read and soft-delete `sms_SM_P81_DELETE_ME` + `vm_RE_P81_VM_01`
  await commsService.markEventsRead(['sms_SM_P81_READ_KEEP'], 1_700_050_010_000);
  await commsService.deleteEvents(['sms_SM_P81_DELETE_ME', 'vm_RE_P81_VM_01'], 1_700_050_011_000);

  assert.equal(serverStore.events.get('sms_SM_P81_READ_KEEP')?.isUnread, false);
  assert.equal(serverStore.events.get('sms_SM_P81_READ_KEEP')?.statusUpdatedAtMs, 1_700_050_010_000);
  assert.equal(serverStore.events.get('sms_SM_P81_DELETE_ME')?.isDeleted, true);
  assert.equal(serverStore.events.get('vm_RE_P81_VM_01')?.isDeleted, true);

  // Subsequent `list_messages` (Twilio still returns both SMS!) + `list_voicemails` + `sync_comms`
  // must NEVER resurrect deleted items or flip read SMS back to unread
  const afterListMsgRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=list_messages'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      fetchImpl: mockPhase81TwilioFetch,
      skipFirestore: true,
      nowMs: 1_700_050_020_000,
    }
  );
  const afterListMsgJson = (await afterListMsgRes.json()) as any;
  assert.equal(
    afterListMsgJson.messages.length,
    1,
    'Deleted SMS must not be resurrected by list_messages'
  );
  assert.equal(afterListMsgJson.messages[0].sid, 'SM_P81_READ_KEEP');
  assert.equal(
    afterListMsgJson.messages[0].isUnread,
    false,
    'Read SMS must remain read after list_messages sync'
  );

  const afterListVmRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=list_voicemails'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      skipFirestore: true,
      nowMs: 1_700_050_021_000,
    }
  );
  const afterListVmJson = (await afterListVmRes.json()) as any;
  assert.equal(
    afterListVmJson.voicemails.length,
    0,
    'Deleted voicemail must not be resurrected by list_voicemails'
  );

  // Simulate browser refresh: clear client CommsThreadService and re-hydrate from server `sync_comms`
  commsService.resetForTests();
  const refreshSyncRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=sync_comms'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      skipFirestore: true,
      nowMs: 1_700_050_025_000,
    }
  );
  const refreshSyncJson = (await refreshSyncRes.json()) as any;
  commsService.hydrateFromServerSync({
    threads: refreshSyncJson.threads,
    events: refreshSyncJson.events,
  });

  const visibleEventsAfterRefresh = commsService.getAllEvents();
  assert.equal(visibleEventsAfterRefresh.length, 1);
  assert.equal(visibleEventsAfterRefresh[0].id, 'sms_SM_P81_READ_KEEP');
  assert.equal(visibleEventsAfterRefresh[0].isUnread, false);
  assert.equal(commsService.isEventDeleted('sms_SM_P81_DELETE_ME'), true);
  assert.equal(commsService.isEventDeleted('vm_RE_P81_VM_01'), true);

  // Now delete the LAST remaining item so visible list becomes empty and verify empty state persists
  commsService.setServerSyncFetchForTests(async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const fullUrl = rawUrl.startsWith('http')
      ? rawUrl
      : `https://chesterfieldtaxi.vercel.app${rawUrl}`;
    return handleTelephonyPost(new Request(fullUrl, init), {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      fetchImpl: mockPhase81TwilioFetch,
      skipFirestore: true,
    });
  });
  await commsService.deleteEvents(['sms_SM_P81_READ_KEEP'], 1_700_050_030_000);
  assert.equal(commsService.getAllEvents().length, 0);

  commsService.resetForTests();
  const emptyRefreshRes = await handleTelephonyGet(
    new Request('https://chesterfieldtaxi.vercel.app/api/telephony?action=sync_comms'),
    {
      env: TEST_TWILIO_ENV,
      enforceAuth: true,
      authResolver: async () => DISPATCHER_AUTH,
      skipFirestore: true,
      nowMs: 1_700_050_035_000,
    }
  );
  const emptyRefreshJson = (await emptyRefreshRes.json()) as any;
  commsService.hydrateFromServerSync({
    threads: emptyRefreshJson.threads,
    events: emptyRefreshJson.events,
  });
  assert.equal(
    commsService.getAllEvents().length,
    0,
    'Deleting the last item must persist cleanly across refresh with zero resurrections'
  );

  // 6D. Bidirectional Status Sync Between `CommsThreadService` (`CommsHub`) & `DispatchEmailService` (`EmailDock`)
  const emailService = getDispatchEmailService();
  emailService.resetForTests();
  commsService.resetForTests();

  const biEmailId = 'em_p81_bi_01';
  const biCommsId = buildDispatchEmailCommsEventId(biEmailId);
  const biIso = new Date(1_700_060_000_000).toISOString();
  await emailService.upsertEmailRecord(
    {
      id: biEmailId,
      threadId: 'thr_contact_sample_p1',
      commsEventId: biCommsId,
      rfcMessageId: buildDeterministicRfcMessageId(biEmailId),
      references: [],
      normalizedSubject: 'Airport Sedan Tomorrow',
      direction: 'inbound',
      category: 'booking_request',
      folder: 'bookings',
      fromName: 'Amanda Vance',
      fromEmail: 'amanda.vance@bayer.com',
      toEmail: DISPATCH_MAILBOX_ADDRESS,
      subject: 'Airport Sedan Tomorrow',
      textBody: 'Need pickup at 9:00 AM from STL T1.',
      sanitizedHtmlBody: '<p>Need pickup at 9:00 AM from STL T1.</p>',
      snippet: 'Need pickup at 9:00 AM from STL T1.',
      attachments: [],
      deliveryStatus: 'received',
      isUnread: true,
      isStarred: false,
      createdAt: biIso,
      timestampMs: 1_700_060_000_000,
      updatedAt: biIso,
    },
    { skipFirestore: true }
  );

  assert.equal(commsService.getEventById(biCommsId)?.isUnread, true);
  assert.equal(emailService.getEmailById(biEmailId)?.isUnread, true);

  // CommsHub -> EmailDock: mark read
  await commsService.markEventsRead([biCommsId], 1_700_060_005_000);
  assert.equal(emailService.getEmailById(biEmailId)?.isUnread, false);

  // CommsHub -> EmailDock: mark unread
  await commsService.markEventsUnread([biCommsId], 1_700_060_006_000);
  assert.equal(emailService.getEmailById(biEmailId)?.isUnread, true);

  // CommsHub -> EmailDock: archive
  await commsService.archiveEvents([biCommsId], 1_700_060_007_000);
  assert.equal(emailService.getEmailById(biEmailId)?.folder, 'archive');
  assert.equal(emailService.getEmailById(biEmailId)?.isUnread, false);

  // CommsHub -> EmailDock: unarchive restores booking_request back to 'bookings'
  await commsService.unarchiveEvents([biCommsId], 1_700_060_008_000);
  assert.equal(emailService.getEmailById(biEmailId)?.folder, 'bookings');

  // CommsHub -> EmailDock: delete moves email to 'trash' and ensureCommsMirrorSynced never resurrects it
  await commsService.deleteEvents([biCommsId], 1_700_060_009_000);
  assert.equal(emailService.getEmailById(biEmailId)?.folder, 'trash');
  assert.equal(emailService.getEmailById(biEmailId)?.isUnread, false);
  await emailService.ensureCommsMirrorSynced();
  assert.equal(commsService.isEventDeleted(biCommsId), true);
  assert.equal(commsService.getAllEvents().length, 0);

  // 6E. Structural Guardrails (`STORAGE_KEY_INTERACTIONS` retired + auth-aware `onSnapshot` + fallback triggers)
  const syncHookSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'app/components/domain/dispatch/comms/useCommsInteractionSync.ts'),
    'utf8'
  );
  assert.equal(
    syncHookSrc.includes('STORAGE_KEY_INTERACTIONS'),
    false,
    'STORAGE_KEY_INTERACTIONS must be retired from useCommsInteractionSync.ts'
  );
  assert.ok(syncHookSrc.includes('visibilitychange'), 'Expected visibilitychange resync trigger');
  assert.ok(syncHookSrc.includes("'focus'"), 'Expected window focus resync trigger');
  assert.ok(syncHookSrc.includes("'online'"), 'Expected window online resync trigger');

  const commsSvcSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'app/core/services/comms/comms-thread.service.ts'),
    'utf8'
  );
  assert.ok(
    commsSvcSrc.includes('onAuthStateChanged'),
    'CommsThreadService must re-attach Firestore onSnapshot via onAuthStateChanged'
  );
  assert.ok(
    commsSvcSrc.includes('update_comms_status'),
    'CommsThreadService must sync status mutations via update_comms_status'
  );

  console.log('   ✅ Passed Phase 81 status persistence, LWW tombstones & bidirectional email sync.\n');
  console.log('🎉 All Phase 39 & Phase 81 Comms Threading & Telephony checks passed (100%)!');
}

runTests().catch((err) => {
  console.error('❌ Phase 39 verification failed:', err);
  process.exit(1);
});
