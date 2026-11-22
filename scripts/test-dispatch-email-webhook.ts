/**
 * Platform Phase 40 (Wave 2 Phase 2) Verification Suite:
 * Single-Mailbox Dispatch Email Backend (`dispatch@chesterfieldtaxi.com`),
 * Resend Inbound Webhook & Outbound Thread Sync
 *
 * Verifies:
 * 1. `verifyResendWebhookSignature` (Svix HMAC-SHA256 + `crypto.timingSafeEqual`):
 *    valid `whsec_...` Base64 secret accepted, multi-signature header accepted,
 *    expired `svix-timestamp` rejected (`403`), tampered body rejected (`403`),
 *    and missing Svix headers rejected (`403`).
 * 2. Pure `email-booking-parser.ts`: `normalizeEmailSubject`, XSS `<script>`/`onerror=`/
 *    `javascript:` sanitization (`sanitizeDispatchEmailHtml`), `htmlToPlainText` fallback,
 *    and deterministic `extractSuggestedBookingFromEmail` classification across booking
 *    requests, receipt copy requests, website inquiries, and general inbox messages.
 * 3. `POST /api/email/webhook` (`email.received`) for `amanda.vance@bayer.com` ->
 *    `dispatch@chesterfieldtaxi.com`: mocked Resend Receiving API `/emails/receiving/{id}`
 *    fetch, XSS sanitization, STL Terminal 1 pickup + Bayer Campus dropoff + `DL1492` +
 *    `+13145550199` + `#BY-8821` extraction, `bookings` folder classification, linkage onto
 *    the exact same `CommsThread` as Amanda's `+13145550199` SMS/calls, single-mailbox
 *    unrelated-recipient filtering, and idempotent Svix retry deduplication.
 * 4. RFC-5322 `In-Reply-To` / `References` reply correlation + `email.delivered` and
 *    `email.bounced` webhook reconciliation across both `/dispatchEmails` and `/commsEvents`.
 * 5. Outbound `/api/send-email` (`direct` reply, `booking_confirmation`, `trip_receipt`,
 *    public `contact_inquiry`) recording `/dispatchEmails` and appending multi-channel
 *    `CommsEvent` entries while keeping internal `dispatcher_alert` off customer threads.
 * 6. Staff auth gates (`401`/`403` on unauthenticated/customer/driver `diagnostics=1` and
 *    `sync_emails`) + `firestore.rules` assertions for `/dispatchEmails` and
 *    `/emailWebhookEvents` + `vercel.json` Hobby cron preservation.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { VerifiedServerAuth } from '../app/core/services/auth/server-auth.server';
import {
  getCommsServerStore,
  ingestCommsEventServer,
  resetCommsServerStoreForTests,
} from '../app/core/services/comms/comms-thread.server';
import { getContactService } from '../app/core/services/customer/contact.service';
import {
  computeResendWebhookSignature,
  getDispatchEmailServerStore,
  handleEmailWebhookGet,
  handleEmailWebhookPost,
  handleSendEmailPost,
  resetDispatchEmailServerStoreForTests,
  verifyResendWebhookSignature,
} from '../app/core/services/email/dispatch-email.server';
import {
  extractSuggestedBookingFromEmail,
  htmlToPlainText,
  normalizeEmailSubject,
  sanitizeDispatchEmailHtml,
} from '../app/core/services/email/email-booking-parser';
import { DISPATCH_MAILBOX_ADDRESS } from '../app/core/types/dispatch-email';

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
  uid: 'uid_customer_40',
  email: 'rider@example.com',
  roles: ['customer'],
  isAdmin: false,
  isDispatcher: false,
  isDriver: false,
  isCorporateManager: false,
  rawToken: 'tok_customer_40',
};

const DRIVER_AUTH: VerifiedServerAuth = {
  authenticated: true,
  isAdminSecret: false,
  uid: 'uid_driver_204',
  email: 'driver204@chesterfieldtaxi.com',
  roles: ['driver'],
  isAdmin: false,
  isDispatcher: false,
  isDriver: true,
  isCorporateManager: false,
  rawToken: 'tok_driver_204',
};

const DISPATCHER_AUTH: VerifiedServerAuth = {
  authenticated: true,
  isAdminSecret: false,
  uid: 'uid_dispatch_40',
  email: 'dispatch@chesterfieldtaxi.com',
  roles: ['dispatcher'],
  isAdmin: false,
  isDispatcher: true,
  isDriver: false,
  isCorporateManager: false,
  rawToken: 'tok_dispatcher_40',
};

const TEST_SVIX_SECRET =
  'whsec_' + Buffer.from('phase40-chesterfield-resend-svix-key-32b').toString('base64');

const TEST_EMAIL_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  DISPATCH_MAILBOX_ADDRESS: 'dispatch@chesterfieldtaxi.com',
  RESEND_API_KEY: 're_test_live_phase40_key',
  RESEND_FROM_EMAIL: 'Chesterfield Taxi <dispatch@chesterfieldtaxi.com>',
  RESEND_WEBHOOK_SECRET: TEST_SVIX_SECRET,
};

function makeSignedWebhookRequest(params: {
  svixId: string;
  timestampSec: number;
  bodyObj: Record<string, any>;
  secret?: string;
  overrideSignature?: string;
}): Request {
  const rawBody = JSON.stringify(params.bodyObj);
  const sig =
    params.overrideSignature ??
    computeResendWebhookSignature(
      params.secret || TEST_SVIX_SECRET,
      params.svixId,
      params.timestampSec,
      rawBody
    );
  return new Request('https://chesterfield-taxi.vercel.app/api/email/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': params.svixId,
      'svix-timestamp': String(params.timestampSec),
      'svix-signature': sig,
    },
    body: rawBody,
  });
}

async function runTests() {
  console.log(
    '✉️  Running Phase 40 Single-Mailbox Dispatch Email, Resend Svix Webhook & Outbound Sync Suite...\n'
  );

  const contactService = getContactService();
  contactService.resetForTests();
  resetCommsServerStoreForTests();
  resetDispatchEmailServerStoreForTests();

  const fixedNowMs = Date.parse('2026-11-22T14:00:00.000Z');
  const fixedNowSec = Math.floor(fixedNowMs / 1000);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Svix Webhook Signature Verification (`verifyResendWebhookSignature`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing Svix HMAC-SHA256 webhook signature verification...');

  const sampleBody = JSON.stringify({
    type: 'email.received',
    data: { email_id: 'em_sig_test_1', to: ['dispatch@chesterfieldtaxi.com'] },
  });
  const validSig = computeResendWebhookSignature(
    TEST_SVIX_SECRET,
    'msg_svix_001',
    fixedNowSec,
    sampleBody
  );

  // Valid whsec_ Base64 signature accepted
  const sigOk = verifyResendWebhookSignature({
    rawBody: sampleBody,
    svixId: 'msg_svix_001',
    svixTimestamp: String(fixedNowSec),
    svixSignature: validSig,
    webhookSecret: TEST_SVIX_SECRET,
    nowSeconds: fixedNowSec,
  });
  assert.equal(sigOk.valid, true, 'Expected valid whsec_ Svix signature to pass');
  assert.equal(sigOk.status, 200);

  // Space-delimited multi-signature header during secret rotation accepted
  const rotatedOldSig = computeResendWebhookSignature(
    'whsec_' + Buffer.from('old-rotated-secret-bytes-000000').toString('base64'),
    'msg_svix_001',
    fixedNowSec,
    sampleBody
  );
  const multiSigOk = verifyResendWebhookSignature({
    rawBody: sampleBody,
    svixId: 'msg_svix_001',
    svixTimestamp: String(fixedNowSec),
    svixSignature: `${rotatedOldSig} ${validSig}`,
    webhookSecret: TEST_SVIX_SECRET,
    nowSeconds: fixedNowSec,
  });
  assert.equal(multiSigOk.valid, true, 'Expected multi-signature header with matching v1 to pass');

  // Expired svix-timestamp (> 300s replay window) rejected
  const expiredTs = fixedNowSec - 600;
  const expiredSig = computeResendWebhookSignature(
    TEST_SVIX_SECRET,
    'msg_svix_expired',
    expiredTs,
    sampleBody
  );
  const sigExpired = verifyResendWebhookSignature({
    rawBody: sampleBody,
    svixId: 'msg_svix_expired',
    svixTimestamp: String(expiredTs),
    svixSignature: expiredSig,
    webhookSecret: TEST_SVIX_SECRET,
    nowSeconds: fixedNowSec,
  });
  assert.equal(sigExpired.valid, false);
  assert.equal(sigExpired.status, 403);
  assert.equal(sigExpired.code, 'TIMESTAMP_EXPIRED');

  // Tampered body rejected with 403
  const tamperedBody = JSON.stringify({
    type: 'email.received',
    data: { email_id: 'em_sig_tampered', to: ['dispatch@chesterfieldtaxi.com'] },
  });
  const sigTampered = verifyResendWebhookSignature({
    rawBody: tamperedBody,
    svixId: 'msg_svix_001',
    svixTimestamp: String(fixedNowSec),
    svixSignature: validSig,
    webhookSecret: TEST_SVIX_SECRET,
    nowSeconds: fixedNowSec,
  });
  assert.equal(sigTampered.valid, false);
  assert.equal(sigTampered.status, 403);
  assert.equal(sigTampered.code, 'SIGNATURE_MISMATCH');

  // HTTP-level tampered body returns 403
  const tamperedHttpResp = await handleEmailWebhookPost(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'msg_svix_001',
        'svix-timestamp': String(fixedNowSec),
        'svix-signature': validSig,
      },
      body: tamperedBody,
    }),
    { env: TEST_EMAIL_ENV, nowMs: fixedNowMs, skipFirestore: true }
  );
  assert.equal(tamperedHttpResp.status, 403);

  // Missing Svix headers rejected with 403
  const sigMissing = verifyResendWebhookSignature({
    rawBody: sampleBody,
    svixId: '',
    svixTimestamp: String(fixedNowSec),
    svixSignature: validSig,
    webhookSecret: TEST_SVIX_SECRET,
    nowSeconds: fixedNowSec,
  });
  assert.equal(sigMissing.valid, false);
  assert.equal(sigMissing.status, 403);
  assert.equal(sigMissing.code, 'MISSING_HEADERS');

  const missingHeadersHttpResp = await handleEmailWebhookPost(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: sampleBody,
    }),
    { env: TEST_EMAIL_ENV, nowMs: fixedNowMs, skipFirestore: true }
  );
  assert.equal(missingHeadersHttpResp.status, 403);

  console.log('   ✓ Svix valid, multi-sig, expired, tampered (403), and missing-header checks passed.');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Pure Subject Normalization, HTML XSS Sanitizer & Booking Parser
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing pure HTML XSS sanitizer, subject normalizer & booking parser...');

  assert.equal(
    normalizeEmailSubject('Re: Fwd: FW:   Executive Transfer Request  '),
    'Executive Transfer Request'
  );
  assert.equal(
    normalizeEmailSubject('Re: [Website Inquiry - Airport Transfer] From John Doe'),
    'From John Doe'
  );

  const dirtyHtml = `
    <html><head><meta charset="utf-8"><style>body { background: url(javascript:alert(1)); }</style></head>
    <body>
      <script>window.stealCookies();</script>
      <iframe src="https://evil.example/phish"></iframe>
      <form action="https://evil.example"><input name="cc" /></form>
      <p onclick="alert('xss')" style="color: #0f172a; width: expression(alert(1));">
        Hello <strong>Chesterfield Dispatch</strong>!
      </p>
      <img src="x" onerror="alert('img-xss')" />
      <a href="javascript:alert('link-xss')">Malicious Link</a>
      <a href="data:text/html,<script>alert(1)</script>">Data Link</a>
      <a href="https://bayer.com/travel">Itinerary</a>
    </body></html>
  `;
  const cleanHtml = sanitizeDispatchEmailHtml(dirtyHtml);
  assert.ok(!cleanHtml.includes('<script'), 'Must strip <script> tags');
  assert.ok(!cleanHtml.includes('<iframe'), 'Must strip <iframe> tags');
  assert.ok(!cleanHtml.includes('<form'), 'Must strip <form> tags');
  assert.ok(!cleanHtml.includes('<style'), 'Must strip <style> blocks');
  assert.ok(!cleanHtml.includes('onclick'), 'Must strip inline onclick handlers');
  assert.ok(!cleanHtml.includes('onerror'), 'Must strip inline onerror handlers');
  assert.ok(!cleanHtml.includes('javascript:'), 'Must strip javascript: URIs');
  assert.ok(!cleanHtml.includes('data:text/html'), 'Must strip data:text/html URIs');
  assert.ok(!cleanHtml.includes('expression('), 'Must strip CSS expressions');
  assert.ok(cleanHtml.includes('<strong>Chesterfield Dispatch</strong>'), 'Must preserve clean formatting');
  assert.ok(
    cleanHtml.includes('href="https://bayer.com/travel" target="_blank" rel="noopener noreferrer"'),
    'Must preserve safe https link with rel="noopener noreferrer"'
  );

  const fallbackPlain = htmlToPlainText('<p>Line 1<br/>Line 2</p><ul><li>Bag 1</li></ul>');
  assert.ok(fallbackPlain.includes('Line 1\nLine 2'));
  assert.ok(fallbackPlain.includes('• Bag 1'));

  const receiptParsed = extractSuggestedBookingFromEmail({
    subject: 'Trip Receipt Copy Request - Ride from Chesterfield Commons to Clayton',
    textBody: 'Could you please resend my itemized PDF receipt for my expense report?',
    fromName: 'Marcus Sterling',
    fromEmail: 'marcus.sterling@gmail.com',
  });
  assert.equal(receiptParsed.folder, 'receipts');

  console.log('   ✓ Pure subject normalization, XSS sanitization & classification passed.');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. `email.received` Inbound Webhook + Receiving API + Multi-Channel Threading
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Testing email.received webhook, Receiving API fetch, booking parser & thread sync...');

  // Pre-seed an inbound SMS from Amanda Vance (+13145550199) so we verify multi-channel linkage!
  const smsSeed = await ingestCommsEventServer(
    {
      externalSid: 'SM_AMANDA_PHASE40_01',
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      contactPhone: '+13145550199',
      bodyText: 'Hi Dispatch, sending our VP flight itinerary by email now.',
      isUnread: true,
      timestampMs: fixedNowMs - 120_000,
    },
    { skipFirestore: true, nowMs: fixedNowMs - 120_000 }
  );
  const amandaThreadId = smsSeed.thread.id;
  assert.equal(amandaThreadId, 'thr_contact_pass_bayer_amanda');

  let receivingApiCalls = 0;
  const outboundResendPayloads: Array<Record<string, any>> = [];
  let resendSendCounter = 0;

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Mock Resend Receiving API: GET https://api.resend.com/emails/receiving/{id}
    if (url === 'https://api.resend.com/emails/receiving/re_in_amanda_001') {
      receivingApiCalls += 1;
      const authHeader = new Headers(init?.headers).get('Authorization');
      assert.equal(authHeader, `Bearer ${TEST_EMAIL_ENV.RESEND_API_KEY}`);
      return Response.json({
        object: 'email',
        id: 're_in_amanda_001',
        from: 'Amanda Vance <amanda.vance@bayer.com>',
        to: ['dispatch@chesterfieldtaxi.com'],
        subject:
          'Executive Transfer Request - STL Airport to Bayer Campus Chesterfield (Tomorrow 8:30 AM)',
        message_id: '<bayer-vp-msg-001@mail.bayer.com>',
        headers: {
          'Message-ID': '<bayer-vp-msg-001@mail.bayer.com>',
        },
        html: `
          <div>
            <script>evilPayload()</script>
            <img src="invalid" onerror="evilImg()" />
            <p>Hello Chesterfield Taxi Dispatch,</p>
            <p>We would like to request an executive sedan transfer tomorrow morning at 8:30 AM.</p>
            <ul>
              <li>Passenger: Amanda Vance</li>
              <li>Phone: (314) 555-0199</li>
              <li>Pickup: St. Louis Lambert International Airport (STL) Terminal 1 Exit 6</li>
              <li>Destination: Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017</li>
              <li>Arriving on Delta DL 1492 from ATL (scheduled 8:15 AM)</li>
              <li>Account: Bayer Corporate #BY-8821</li>
            </ul>
            <p><a href="https://bayer.com/itinerary">View Itinerary PDF</a></p>
          </div>
        `,
        text: `Hello Chesterfield Taxi Dispatch,

We would like to request an executive sedan transfer tomorrow morning at 8:30 AM.

• Passenger: Amanda Vance
• Phone: (314) 555-0199
• Pickup: St. Louis Lambert International Airport (STL) Terminal 1 Exit 6
• Destination: Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017
• Arriving on Delta DL 1492 from ATL (scheduled 8:15 AM)
• Account: Bayer Corporate #BY-8821`,
        attachments: [
          {
            id: 'att_itin_1',
            filename: 'VP-Itinerary.pdf',
            content_type: 'application/pdf',
            size: 48210,
          },
        ],
      });
    }

    // Mock Resend Outbound Send API: POST https://api.resend.com/emails
    if (url === 'https://api.resend.com/emails') {
      resendSendCounter += 1;
      const parsed = JSON.parse(String(init?.body || '{}'));
      outboundResendPayloads.push(parsed);
      return Response.json({
        id: `re_out_sent_${resendSendCounter}`,
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  // Send webhook WITHOUT inline html/text so Receiving API fetch is exercised
  const inboundWebhookBody = {
    type: 'email.received',
    created_at: new Date(fixedNowMs).toISOString(),
    data: {
      email_id: 're_in_amanda_001',
      from: 'Amanda Vance <amanda.vance@bayer.com>',
      to: ['dispatch@chesterfieldtaxi.com'],
      subject:
        'Executive Transfer Request - STL Airport to Bayer Campus Chesterfield (Tomorrow 8:30 AM)',
    },
  };

  const inboundResp = await handleEmailWebhookPost(
    makeSignedWebhookRequest({
      svixId: 'msg_svix_amanda_in_1',
      timestampSec: fixedNowSec,
      bodyObj: inboundWebhookBody,
    }),
    {
      env: TEST_EMAIL_ENV,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs,
      skipFirestore: true,
    }
  );
  assert.equal(inboundResp.status, 200);
  const inboundJson = (await inboundResp.json()) as Record<string, any>;
  assert.equal(inboundJson.success, true);
  assert.equal(inboundJson.duplicate, false);
  assert.equal(inboundJson.folder, 'bookings');
  assert.equal(inboundJson.category, 'booking_request');
  assert.equal(
    inboundJson.threadId,
    amandaThreadId,
    'Inbound email from amanda.vance@bayer.com must join Amanda’s +13145550199 CommsThread'
  );
  assert.equal(receivingApiCalls, 1, 'Expected 1 Resend Receiving API fetch');

  const emailStore = getDispatchEmailServerStore();
  const storedAmandaEmail = emailStore.emails.get('re_in_amanda_001');
  assert.ok(storedAmandaEmail, 'Expected DispatchEmailRecord in server store');
  assert.equal(storedAmandaEmail.toEmail, DISPATCH_MAILBOX_ADDRESS);
  assert.equal(storedAmandaEmail.fromEmail, 'amanda.vance@bayer.com');
  assert.equal(storedAmandaEmail.contactPhone, '+13145550199');
  assert.equal(storedAmandaEmail.corporateAccountNumber, '#BY-8821');
  assert.equal(storedAmandaEmail.rfcMessageId, '<bayer-vp-msg-001@mail.bayer.com>');
  assert.equal(storedAmandaEmail.attachments.length, 1);
  assert.equal(storedAmandaEmail.attachments[0].filename, 'VP-Itinerary.pdf');

  // Verify XSS sanitization on stored HTML
  assert.ok(!storedAmandaEmail.sanitizedHtmlBody.includes('<script'));
  assert.ok(!storedAmandaEmail.sanitizedHtmlBody.includes('onerror'));
  assert.ok(
    storedAmandaEmail.sanitizedHtmlBody.includes(
      'href="https://bayer.com/itinerary" target="_blank" rel="noopener noreferrer"'
    )
  );

  // Verify deterministic booking extraction
  assert.ok(storedAmandaEmail.suggestedBooking, 'Expected suggestedBooking populated');
  assert.equal(storedAmandaEmail.suggestedBooking.passengerPhone, '+13145550199');
  assert.ok(
    storedAmandaEmail.suggestedBooking.pickupLocation?.includes('Lambert International Airport (STL) Terminal 1'),
    'Expected STL Terminal 1 pickup address'
  );
  assert.ok(
    storedAmandaEmail.suggestedBooking.dropoffLocation?.includes('Bayer Crop Science Campus'),
    'Expected Bayer Campus dropoff address'
  );
  assert.ok(
    storedAmandaEmail.suggestedBooking.notes?.includes('DL1492'),
    'Expected flight DL1492 in suggestedBooking notes'
  );
  assert.ok(
    storedAmandaEmail.suggestedBooking.notes?.includes('#BY-8821'),
    'Expected corporate account #BY-8821 in suggestedBooking notes'
  );

  // Verify unified CommsThread state across SMS + Email
  const commsStore = getCommsServerStore();
  const unifiedAmandaThread = commsStore.threads.get(amandaThreadId);
  assert.ok(unifiedAmandaThread);
  assert.ok(unifiedAmandaThread.channels.includes('sms'));
  assert.ok(unifiedAmandaThread.channels.includes('email'));
  assert.equal(unifiedAmandaThread.unreadByChannel.sms, 1);
  assert.equal(unifiedAmandaThread.unreadByChannel.email, 1);
  assert.equal(unifiedAmandaThread.unreadCountTotal, 2);

  // Idempotent Svix retry with same svix-id
  const retryResp = await handleEmailWebhookPost(
    makeSignedWebhookRequest({
      svixId: 'msg_svix_amanda_in_1',
      timestampSec: fixedNowSec + 5,
      bodyObj: inboundWebhookBody,
    }),
    {
      env: TEST_EMAIL_ENV,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 5000,
      skipFirestore: true,
    }
  );
  const retryJson = (await retryResp.json()) as Record<string, any>;
  assert.equal(retryJson.duplicate, true, 'Expected Svix retry to be deduplicated');
  assert.equal(receivingApiCalls, 1, 'Expected zero additional Receiving API calls on retry');
  assert.equal(emailStore.emails.size, 1, 'Expected zero duplicate DispatchEmailRecord entries');

  // Unrelated recipient in production ignored cleanly
  const unrelatedBody = {
    type: 'email.received',
    data: {
      email_id: 're_in_unrelated_999',
      from: 'spam@example.org',
      to: ['sales@otherdomain.com'],
      subject: 'Unrelated alias',
    },
  };
  const unrelatedResp = await handleEmailWebhookPost(
    makeSignedWebhookRequest({
      svixId: 'msg_svix_unrelated_1',
      timestampSec: fixedNowSec + 10,
      bodyObj: unrelatedBody,
    }),
    {
      env: TEST_EMAIL_ENV,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 10_000,
      skipFirestore: true,
    }
  );
  const unrelatedJson = (await unrelatedResp.json()) as Record<string, any>;
  assert.equal(unrelatedJson.received, true);
  assert.equal(unrelatedJson.ignored, true);
  assert.equal(emailStore.emails.has('re_in_unrelated_999'), false);

  console.log(
    '   ✓ Inbound email.received, Receiving API hydration, XSS stripping, DL1492/#BY-8821 extraction, CommsThread linkage & retry dedupe passed.'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Outbound Direct Reply, RFC In-Reply-To Correlation & Delivery/Bounce Webhooks
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing RFC-5322 reply headers, In-Reply-To correlation & delivered/bounced reconciliation...');

  const directReplyResp = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        recipient: 'amanda.vance@bayer.com',
        subject: 'Re: Executive Transfer Request - STL Airport to Bayer Campus Chesterfield',
        html: '<p>Confirmed! Chauffeur Unit #204 will meet Amanda at STL Terminal 1 Exit 6.</p>',
        text: 'Confirmed! Chauffeur Unit #204 will meet Amanda at STL Terminal 1 Exit 6.',
        threadId: amandaThreadId,
        inReplyTo: storedAmandaEmail.rfcMessageId,
        tripId: 'CT-40101',
      }),
    }),
    {
      env: TEST_EMAIL_ENV,
      authResolver: async () => DISPATCHER_AUTH,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 30_000,
      skipFirestore: true,
    }
  );
  assert.equal(directReplyResp.status, 200);
  const directReplyJson = (await directReplyResp.json()) as Record<string, any>;
  assert.equal(directReplyJson.success, true);
  assert.equal(directReplyJson.threadId, amandaThreadId);
  assert.match(directReplyJson.rfcMessageId, /^<em_out_.*@chesterfieldtaxi\.com>$/);

  // Inspect outbound payload sent to Resend
  assert.equal(outboundResendPayloads.length, 1);
  const sentResendPayload = outboundResendPayloads[0];
  assert.equal(sentResendPayload.reply_to, DISPATCH_MAILBOX_ADDRESS);
  assert.equal(sentResendPayload.headers['Message-ID'], directReplyJson.rfcMessageId);
  assert.equal(sentResendPayload.headers['In-Reply-To'], '<bayer-vp-msg-001@mail.bayer.com>');
  assert.ok(sentResendPayload.headers.References.includes('<bayer-vp-msg-001@mail.bayer.com>'));

  // Reconcile `email.delivered` webhook against outbound email
  const deliveredWebhookResp = await handleEmailWebhookPost(
    makeSignedWebhookRequest({
      svixId: 'msg_svix_delivered_1',
      timestampSec: fixedNowSec + 40,
      bodyObj: {
        type: 'email.delivered',
        data: {
          email_id: directReplyJson.messageId, // `re_out_sent_1`
        },
      },
    }),
    {
      env: TEST_EMAIL_ENV,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 40_000,
      skipFirestore: true,
    }
  );
  const deliveredJson = (await deliveredWebhookResp.json()) as Record<string, any>;
  assert.equal(deliveredJson.matched, true);
  assert.equal(deliveredJson.deliveryStatus, 'delivered');
  assert.equal(emailStore.emails.get(directReplyJson.emailId)?.deliveryStatus, 'delivered');
  assert.equal(commsStore.events.get(directReplyJson.commsEventId)?.deliveryStatus, 'delivered');

  // Inbound follow-up from an unknown Bayer assistant correlated via RFC `In-Reply-To` -> joins Amanda's thread!
  const assistantReplyResp = await handleEmailWebhookPost(
    makeSignedWebhookRequest({
      svixId: 'msg_svix_assistant_reply_1',
      timestampSec: fixedNowSec + 50,
      bodyObj: {
        type: 'email.received',
        data: {
          email_id: 're_in_assistant_002',
          from: 'Bayer Travel Desk <travel.desk@bayer-assistant.example>',
          to: ['dispatch@chesterfieldtaxi.com'],
          subject: 'Re: Executive Transfer Request - STL Airport to Bayer Campus Chesterfield',
          in_reply_to: directReplyJson.rfcMessageId,
          references: `<bayer-vp-msg-001@mail.bayer.com> ${directReplyJson.rfcMessageId}`,
          text: 'Thank you! Please ask the driver to display a Bayer sign.',
          html: '<p>Thank you! Please ask the driver to display a Bayer sign.</p>',
        },
      },
    }),
    {
      env: TEST_EMAIL_ENV,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 50_000,
      skipFirestore: true,
    }
  );
  const assistantReplyJson = (await assistantReplyResp.json()) as Record<string, any>;
  assert.equal(
    assistantReplyJson.threadId,
    amandaThreadId,
    'Expected RFC In-Reply-To follow-up from alternate email to correlate onto Amanda’s thread'
  );
  assert.equal(emailStore.emails.get('re_in_assistant_002')?.tripId, 'CT-40101');

  // Send an email to a bad address and verify `email.bounced` updates both `/dispatchEmails` and `/commsEvents`
  const bounceTargetResp = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        recipient: 'typo.address@invalid-corp.example',
        subject: 'Ride Follow-up',
        html: '<p>Checking pickup details.</p>',
        text: 'Checking pickup details.',
      }),
    }),
    {
      env: TEST_EMAIL_ENV,
      authResolver: async () => DISPATCHER_AUTH,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 55_000,
      skipFirestore: true,
    }
  );
  const bounceTargetJson = (await bounceTargetResp.json()) as Record<string, any>;
  assert.equal(bounceTargetJson.success, true);

  const bouncedWebhookResp = await handleEmailWebhookPost(
    makeSignedWebhookRequest({
      svixId: 'msg_svix_bounced_1',
      timestampSec: fixedNowSec + 60,
      bodyObj: {
        type: 'email.bounced',
        data: {
          email_id: bounceTargetJson.messageId,
          bounce: {
            type: 'Permanent',
            subType: 'NoEmail',
            message: '550 5.1.1 The email account that you tried to reach does not exist.',
          },
        },
      },
    }),
    {
      env: TEST_EMAIL_ENV,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 60_000,
      skipFirestore: true,
    }
  );
  const bouncedJson = (await bouncedWebhookResp.json()) as Record<string, any>;
  assert.equal(bouncedJson.matched, true);
  assert.equal(bouncedJson.deliveryStatus, 'bounced');
  assert.ok(
    emailStore.emails.get(bounceTargetJson.emailId)?.deliveryError?.includes('550 5.1.1')
  );
  assert.equal(commsStore.events.get(bounceTargetJson.commsEventId)?.deliveryStatus, 'bounced');
  assert.ok(
    commsStore.events.get(bounceTargetJson.commsEventId)?.errorMessage?.includes('550 5.1.1')
  );

  console.log('   ✓ RFC reply headers, In-Reply-To correlation, delivered & bounced reconciliation passed.');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Outbound `/api/send-email` Structured Flows (`booking_confirmation`, `trip_receipt`, `contact_inquiry`, `dispatcher_alert`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Testing structured /api/send-email flows & dispatcher_alert non-pollution...');

  // 5A. `booking_confirmation`
  const confirmResp = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'booking_confirmation',
        payload: {
          tripId: 'CT-40200',
          passenger: {
            firstName: 'Amanda',
            lastName: 'Vance',
            email: 'amanda.vance@bayer.com',
            phone: '(314) 555-0199',
          },
          pickupAddress: 'St. Louis Lambert International Airport (STL)',
          dropoffAddress: '700 Chesterfield Pkwy W, Chesterfield, MO 63017',
          pickupTime: '2026-11-23T14:30:00.000Z',
          bookingType: 'scheduled',
          vehicleTier: 'premium',
          totalFare: 68.5,
          currency: 'USD',
          paymentMethod: 'corporate',
        },
      }),
    }),
    {
      env: TEST_EMAIL_ENV,
      authResolver: async () => UNAUTH, // Guest checkout allowed for booking_confirmation
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 70_000,
      skipFirestore: true,
    }
  );
  const confirmJson = (await confirmResp.json()) as Record<string, any>;
  assert.equal(confirmJson.success, true);
  assert.equal(confirmJson.threadId, amandaThreadId);
  assert.equal(emailStore.emails.get(confirmJson.emailId)?.folder, 'sent');
  assert.equal(emailStore.emails.get(confirmJson.emailId)?.category, 'booking_confirmation');
  assert.ok(commsStore.threads.get(amandaThreadId)?.linkedTripIds.includes('CT-40200'));

  // 5B. `trip_receipt` (Driver auth permitted -> folder: 'receipts')
  const receiptResp = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'trip_receipt',
        payload: {
          tripId: 'CT-40200',
          completedAt: '2026-11-23T15:10:00.000Z',
          passenger: {
            firstName: 'Amanda',
            lastName: 'Vance',
            email: 'amanda.vance@bayer.com',
            phone: '(314) 555-0199',
          },
          pickupAddress: 'St. Louis Lambert International Airport (STL)',
          dropoffAddress: '700 Chesterfield Pkwy W, Chesterfield, MO 63017',
          pickupTime: '2026-11-23T14:30:00.000Z',
          vehicleTier: 'premium',
          subtotalFare: 68.5,
          tipAmount: 13.7,
          grandTotal: 82.2,
          paymentMethod: 'corporate',
          poNumber: '#BY-8821',
        },
      }),
    }),
    {
      env: TEST_EMAIL_ENV,
      authResolver: async () => DRIVER_AUTH,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 80_000,
      skipFirestore: true,
    }
  );
  const receiptJson = (await receiptResp.json()) as Record<string, any>;
  assert.equal(receiptJson.success, true);
  assert.equal(emailStore.emails.get(receiptJson.emailId)?.folder, 'receipts');
  assert.equal(emailStore.emails.get(receiptJson.emailId)?.category, 'trip_receipt');
  assert.ok(commsStore.events.has(receiptJson.commsEventId));

  // 5C. Public `contact_inquiry` -> recorded as unread inbound `inquiries` / `website_inquiry` + `email_inbound` CommsEvent
  const inquiryResp = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact_inquiry',
        payload: {
          name: 'David Morales',
          email: 'david.morales@westcounty.example',
          phone: '(636) 555-0188',
          subject: 'Corporate Account Setup',
          tripId: 'CT-40999',
          message: 'Hello, we would like to open a monthly corporate account for 12 executives.',
        },
      }),
    }),
    {
      env: TEST_EMAIL_ENV,
      authResolver: async () => UNAUTH,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 90_000,
      skipFirestore: true,
    }
  );
  const inquiryJson = (await inquiryResp.json()) as Record<string, any>;
  assert.equal(inquiryJson.success, true);
  const storedInquiry = emailStore.emails.get(inquiryJson.emailId);
  assert.ok(storedInquiry);
  assert.equal(storedInquiry.direction, 'inbound');
  assert.equal(storedInquiry.folder, 'inquiries');
  assert.equal(storedInquiry.category, 'website_inquiry');
  assert.equal(storedInquiry.fromEmail, 'david.morales@westcounty.example');
  assert.equal(storedInquiry.contactPhone, '+16365550188');
  assert.equal(storedInquiry.tripId, 'CT-40999');
  assert.equal(storedInquiry.isUnread, true);

  const inquiryCommsEvt = commsStore.events.get(inquiryJson.commsEventId);
  assert.ok(inquiryCommsEvt);
  assert.equal(inquiryCommsEvt.eventType, 'email_inbound');
  assert.equal(inquiryCommsEvt.direction, 'inbound');
  assert.equal(inquiryCommsEvt.isUnread, true);
  assert.equal(commsStore.threads.get(inquiryJson.threadId)?.unreadByChannel.email, 1);

  // 5D. Internal `dispatcher_alert` -> sent via Resend, NEVER pollutes customer CommsThread
  const amandaEventsBeforeAlert = Array.from(commsStore.events.values()).filter(
    (e) => e.threadId === amandaThreadId
  ).length;
  const totalEmailsBeforeAlert = emailStore.emails.size;

  const alertResp = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dispatcher_alert',
        payload: {
          tripId: 'CT-40200',
          passengerName: 'Amanda Vance',
          passengerPhone: '(314) 555-0199',
          passengerEmail: 'amanda.vance@bayer.com',
          pickupAddress: 'St. Louis Lambert International Airport (STL)',
          dropoffAddress: '700 Chesterfield Pkwy W, Chesterfield, MO 63017',
          pickupTime: '2026-11-23T14:30:00.000Z',
          vehicleTier: 'premium',
          totalFare: 68.5,
          currency: 'USD',
          bookingType: 'scheduled',
          urgency: 'high',
        },
      }),
    }),
    {
      env: TEST_EMAIL_ENV,
      authResolver: async () => UNAUTH,
      fetchImpl: mockFetch,
      nowMs: fixedNowMs + 95_000,
      skipFirestore: true,
    }
  );
  const alertJson = (await alertResp.json()) as Record<string, any>;
  assert.equal(alertJson.success, true);
  const amandaEventsAfterAlert = Array.from(commsStore.events.values()).filter(
    (e) => e.threadId === amandaThreadId
  ).length;
  assert.equal(
    amandaEventsAfterAlert,
    amandaEventsBeforeAlert,
    'Internal dispatcher_alert must NOT pollute customer CommsThread'
  );
  assert.equal(
    emailStore.emails.size,
    totalEmailsBeforeAlert,
    'Internal dispatcher_alert must NOT pollute customer /dispatchEmails folders'
  );

  console.log(
    '   ✓ booking_confirmation, trip_receipt, contact_inquiry & dispatcher_alert isolation passed.'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Staff Auth Gates (`diagnostics=1`, `sync_emails`), `firestore.rules` & `vercel.json`
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Testing staff auth gates (401/403/200), firestore.rules & vercel.json...');

  // Unauthenticated diagnostics -> 401
  const diagUnauth = await handleEmailWebhookGet(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?diagnostics=1'),
    { env: TEST_EMAIL_ENV, authResolver: async () => UNAUTH, skipFirestore: true }
  );
  assert.equal(diagUnauth.status, 401);

  // Customer diagnostics -> 403
  const diagCustomer = await handleEmailWebhookGet(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?diagnostics=1'),
    { env: TEST_EMAIL_ENV, authResolver: async () => CUSTOMER_AUTH, skipFirestore: true }
  );
  assert.equal(diagCustomer.status, 403);

  // Driver diagnostics -> 403
  const diagDriver = await handleEmailWebhookGet(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?diagnostics=1'),
    { env: TEST_EMAIL_ENV, authResolver: async () => DRIVER_AUTH, skipFirestore: true }
  );
  assert.equal(diagDriver.status, 403);

  // Dispatcher diagnostics -> 200
  const diagStaff = await handleEmailWebhookGet(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?diagnostics=1'),
    { env: TEST_EMAIL_ENV, authResolver: async () => DISPATCHER_AUTH, skipFirestore: true }
  );
  assert.equal(diagStaff.status, 200);
  const diagJson = (await diagStaff.json()) as Record<string, any>;
  assert.equal(diagJson.mailboxAddress, DISPATCH_MAILBOX_ADDRESS);
  assert.equal(diagJson.endpointPath, '/api/email/webhook');
  assert.equal(diagJson.resendApiConfigured, true);
  assert.equal(diagJson.webhookSecretConfigured, true);
  assert.ok(diagJson.storedEmailCount >= 6);

  // sync_emails auth gates (GET & POST)
  const syncUnauth = await handleEmailWebhookGet(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?action=sync_emails'),
    { env: TEST_EMAIL_ENV, authResolver: async () => UNAUTH, skipFirestore: true }
  );
  assert.equal(syncUnauth.status, 401);

  const syncPostCustomer = await handleEmailWebhookPost(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?action=sync_emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    { env: TEST_EMAIL_ENV, authResolver: async () => CUSTOMER_AUTH, skipFirestore: true }
  );
  assert.equal(syncPostCustomer.status, 403);

  const syncStaff = await handleEmailWebhookPost(
    new Request('https://chesterfield-taxi.vercel.app/api/email/webhook?action=sync_emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    { env: TEST_EMAIL_ENV, authResolver: async () => DISPATCHER_AUTH, skipFirestore: true }
  );
  assert.equal(syncStaff.status, 200);
  const syncJson = (await syncStaff.json()) as Record<string, any>;
  assert.equal(syncJson.success, true);
  assert.equal(syncJson.mailboxAddress, DISPATCH_MAILBOX_ADDRESS);
  assert.ok(Array.isArray(syncJson.emails) && syncJson.emails.length >= 6);

  // Unauthenticated staff-only direct /api/send-email -> 403
  const directUnauth = await handleSendEmailPost(
    new Request('https://chesterfield-taxi.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'direct',
        recipient: 'amanda.vance@bayer.com',
        subject: 'Unauthorized Relay Attempt',
        html: '<p>Blocked</p>',
      }),
    }),
    { env: TEST_EMAIL_ENV, authResolver: async () => CUSTOMER_AUTH, skipFirestore: true }
  );
  assert.equal(directUnauth.status, 403);

  // Verify firestore.rules blocks
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.match(
    rulesText,
    /match\s+\/dispatchEmails\/\{emailId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isDispatcher\(\);/
  );
  assert.match(
    rulesText,
    /match\s+\/emailWebhookEvents\/\{eventId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isDispatcher\(\);/
  );

  // Verify vercel.json Hobby cron schedule untouched
  const vercelJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  );
  assert.equal(vercelJson.crons?.[0]?.schedule, '0 10 * * *');

  console.log('   ✓ Staff auth gates, firestore.rules & vercel.json checks passed.\n');
  console.log('✅ All Phase 40 Dispatch Email Backend & Resend Webhook assertions passed!');
}

runTests().catch((err) => {
  console.error('❌ Phase 40 verification failed:', err);
  process.exit(1);
});
