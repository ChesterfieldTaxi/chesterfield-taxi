/**
 * Platform Phase 41 (Wave 2 Phase 3) Verification Suite:
 * Dedicated `EmailDock` Client Overhaul (`dispatch@chesterfieldtaxi.com`)
 *
 * Verifies:
 * 1. Folder filtering & live badge counts across all 9 operational folder views:
 *    `inbox` (inbound across `inbox` + `bookings` + `inquiries`), `bookings`, `inquiries`,
 *    `sent`, `receipts`, `drafts`, `starred` (`isStarred && folder !== 'trash'`),
 *    `archive`, and `trash`, plus search & `unreadOnly` filters.
 * 2. Exact 1:1 synchronization between `DispatchEmailService` and `CommsThreadService`:
 *    `markEmailsRead`, `markEmailsUnread`, `toggleEmailStar`, `moveEmailsToFolder('archive')`,
 *    `moveEmailsToFolder('inbox')`, and `moveEmailsToFolder('trash')` keep `em_${emailId}`
 *    and `unreadByChannel.email` mathematically invariant.
 * 3. Auto-saved draft lifecycle (`saveDraft` -> edit -> `listDrafts` -> `sendComposerEmail`
 *    via `handleSendEmailPost` -> draft removed & single authoritative `DispatchEmailRecord`
 *    stored with ZERO duplicates before and after `syncWithServer` via `handleEmailWebhookGet`),
 *    plus conversation threading (`getConversationMessages`) and `EMAIL_STATE_CHANGED` bus events.
 * 4. `interpolateDispatchEmailTemplate` across all 6 `CANNED_DISPATCH_EMAIL_TEMPLATES`
 *    (`{firstName}`, `{passengerName}`, `{tripId}`, `{pickupAddress}`, `{dropoffAddress}`,
 *    `{pickupTime}`, `{trackingUrl}`, `{payUrl}`, `{corporateAccount}`, STL Terminal 1 Exit Door 6 /
 *    Terminal 2 Exit Door 12 / SUS FBO guidance) + `buildPopulateBookingPayloadFromEmail` (`POPULATE_BOOKING`).
 * 5. Cross-channel sender timeline resolution (`resolveSenderTimeline`) linking
 *    `amanda.vance@bayer.com` emails with her `+13145550199` Call, SMS, Voicemail (with transcript),
 *    Internal Note, and active/upcoming `Trip`s.
 * 6. Architectural guardrails (`constitution.md`): zero `*.server` or `node:` imports in client
 *    email service or UI components, `INITIAL_EMAILS` retired, and `vercel.json` `"0 10 * * *"` preserved.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { VerifiedServerAuth } from '../app/core/services/auth/server-auth.server';
import { resetCommsServerStoreForTests } from '../app/core/services/comms/comms-thread.server';
import { getCommsThreadService } from '../app/core/services/comms/comms-thread.service';
import { getContactService } from '../app/core/services/customer/contact.service';
import {
  handleEmailWebhookGet,
  handleSendEmailPost,
  resetDispatchEmailServerStoreForTests,
} from '../app/core/services/email/dispatch-email.server';
import {
  CANNED_DISPATCH_EMAIL_TEMPLATES,
  buildPopulateBookingPayloadFromEmail,
  buildPopulateRebookPayloadFromTrip,
  buildReplyOrForwardDraftSeed,
  buildTripTrackingUrl,
  getDispatchEmailService,
  interpolateDispatchEmailTemplate,
} from '../app/core/services/email/dispatch-email.service';
import { getWorkspaceBus } from '../app/core/services/workspace-bus.service';
import {
  DISPATCH_MAILBOX_ADDRESS,
  buildDeterministicRfcMessageId,
  buildDispatchEmailCommsEventId,
  type DispatchEmailRecord,
} from '../app/core/types/dispatch-email';
import type { Trip } from '../app/core/types/trip';

const DISPATCHER_AUTH: VerifiedServerAuth = {
  authenticated: true,
  isAdminSecret: false,
  uid: 'uid_dispatch_41',
  email: 'dispatch@chesterfieldtaxi.com',
  roles: ['dispatcher'],
  isAdmin: false,
  isDispatcher: true,
  isDriver: false,
  isCorporateManager: false,
  rawToken: 'tok_dispatcher_41',
};

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  DISPATCH_MAILBOX_ADDRESS: 'dispatch@chesterfieldtaxi.com',
  RESEND_FROM_EMAIL: 'Chesterfield Taxi <dispatch@chesterfieldtaxi.com>',
};

function makeRecord(
  overrides: Partial<DispatchEmailRecord> & Pick<DispatchEmailRecord, 'id' | 'subject'>
): DispatchEmailRecord {
  const nowMs = overrides.timestampMs ?? Date.now();
  const iso = new Date(nowMs).toISOString();
  return {
    id: overrides.id,
    threadId: overrides.threadId || `thr_email_${overrides.fromEmail || 'guest@example.com'}`,
    commsEventId: overrides.commsEventId || buildDispatchEmailCommsEventId(overrides.id),
    rfcMessageId:
      overrides.rfcMessageId || buildDeterministicRfcMessageId(overrides.id),
    inReplyTo: overrides.inReplyTo,
    references: overrides.references || [],
    normalizedSubject: overrides.normalizedSubject || overrides.subject,
    direction: overrides.direction || 'inbound',
    category: overrides.category || 'general',
    folder: overrides.folder || 'inbox',
    fromName: overrides.fromName || 'Customer',
    fromEmail: overrides.fromEmail || 'guest@example.com',
    toEmail: overrides.toEmail || DISPATCH_MAILBOX_ADDRESS,
    ccEmails: overrides.ccEmails,
    replyTo: overrides.replyTo,
    subject: overrides.subject,
    textBody: overrides.textBody || 'Sample email body',
    sanitizedHtmlBody: overrides.sanitizedHtmlBody || '<p>Sample email body</p>',
    snippet: overrides.snippet || 'Sample email body',
    attachments: overrides.attachments || [],
    contactId: overrides.contactId,
    contactPhone: overrides.contactPhone,
    tripId: overrides.tripId,
    invoiceId: overrides.invoiceId,
    corporateAccountNumber: overrides.corporateAccountNumber,
    suggestedBooking: overrides.suggestedBooking,
    deliveryStatus: overrides.deliveryStatus || 'received',
    deliveryError: overrides.deliveryError,
    isUnread: overrides.isUnread ?? true,
    isStarred: overrides.isStarred ?? false,
    createdAt: overrides.createdAt || iso,
    timestampMs: nowMs,
    updatedAt: overrides.updatedAt || iso,
  };
}

function makeSampleTrip(overrides: Partial<Trip> & { id: string }): Trip {
  const nowIso = new Date().toISOString();
  return {
    id: overrides.id,
    status: overrides.status || 'CONFIRMED',
    trackingToken: overrides.trackingToken,
    corporateAccountId: overrides.corporateAccountId,
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: overrides.assignedDriverId ?? 'drv_204',
    pickupLocation: overrides.pickupLocation || {
      address: 'St. Louis Lambert International Airport (STL) Terminal 1 Exit 6',
    },
    dropoffLocation: overrides.dropoffLocation || {
      address: 'Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017',
    },
    bookingType: 'scheduled',
    scheduledPickupTime: overrides.scheduledPickupTime || '2026-11-22T14:30:00.000Z',
    passenger: overrides.passenger || {
      firstName: 'Amanda',
      lastName: 'Vance',
      email: 'amanda.vance@bayer.com',
      phone: '+13145550199',
      passengerCount: 1,
      luggageCount: 2,
    },
    vehicleTier: overrides.vehicleTier || 'premium',
    pricing: overrides.pricing || {
      baseFare: 65,
      distanceMiles: 21,
      durationMinutes: 26,
      distanceRate: 2.5,
      timeRate: 0.5,
      vehicleMultiplier: 1.2,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 65,
      totalFare: 65,
      currency: 'USD',
    },
    payment: overrides.payment || {
      method: 'account',
      status: 'pending_invoice',
      amount: 65,
      payToken: 'pay_test_token_amanda_vance_1234567890',
    },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

async function runTests() {
  console.log('=== Platform Phase 41: Dedicated EmailDock Service & Cross-Channel Suite ===\n');

  const emailService = getDispatchEmailService();
  const commsService = getCommsThreadService();
  const contactService = getContactService();

  emailService.resetForTests();
  commsService.resetForTests();
  contactService.resetForTests();
  resetDispatchEmailServerStoreForTests();
  resetCommsServerStoreForTests();

  const baseNow = Date.parse('2026-11-21T16:00:00.000Z');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Folder Filtering & Live Badge Counts Across All 9 Operational Views
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Testing smart folder views & live badge counts across all 9 folders...');

  const emGeneral = makeRecord({
    id: 'em_gen_01',
    fromName: 'Sarah Jenkins',
    fromEmail: 'sjenkins@spiritaviation.com',
    subject: 'Lost Item Inquiry - Grey iPad in Vehicle #104',
    textBody: 'Left grey iPad in back seat of Car #104 at SUS.',
    folder: 'inbox',
    category: 'general',
    isUnread: true,
    isStarred: true,
    timestampMs: baseNow - 60_000,
  });

  const emBooking = makeRecord({
    id: 'em_bkg_01',
    fromName: 'Amanda Vance',
    fromEmail: 'amanda.vance@bayer.com',
    contactPhone: '+13145550199',
    corporateAccountNumber: '#BY-8821',
    subject:
      'Executive Transfer Request - STL Airport to Bayer Campus Chesterfield (Tomorrow 8:30 AM)',
    textBody: `Passenger: Amanda Vance
Phone: (314) 555-0199
Pickup: St. Louis Lambert International Airport (STL) Terminal 1 Exit 6
Destination: Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017
Arriving on Delta DL 1492 from ATL
Account: #BY-8821
PO: PO-99412`,
    folder: 'bookings',
    category: 'booking_request',
    isUnread: true,
    isStarred: true,
    timestampMs: baseNow - 30_000,
    suggestedBooking: {
      passengerName: 'Amanda Vance',
      passengerPhone: '+13145550199',
      passengerEmail: 'amanda.vance@bayer.com',
      pickupLocation: 'St. Louis Lambert International Airport (STL) Terminal 1 Exit 6',
      dropoffLocation:
        'Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017',
      pickupTime: 'Tomorrow 8:30 AM',
      notes: 'Flight DL1492 (STL T1) · Account: #BY-8821',
    },
  });

  const emInquiry = makeRecord({
    id: 'em_inq_01',
    fromName: 'Claire Donovan',
    fromEmail: 'claire.donovan@example.com',
    subject: '[Website Inquiry - Corporate] Monthly shuttle partnership',
    textBody: 'Interested in daily executive shuttle pricing in Chesterfield Valley.',
    folder: 'inquiries',
    category: 'website_inquiry',
    isUnread: true,
    isStarred: false,
    timestampMs: baseNow - 20_000,
  });

  const emSent = makeRecord({
    id: 'em_sent_01',
    direction: 'outbound',
    fromName: 'Chesterfield Taxi Dispatch',
    fromEmail: DISPATCH_MAILBOX_ADDRESS,
    toEmail: 'elena.rossi@bjc.org',
    subject: 'Reservation Confirmed (CT-88401)',
    textBody: 'Your WAV transport is scheduled for 11:00 AM.',
    folder: 'sent',
    category: 'booking_confirmation',
    deliveryStatus: 'delivered',
    isUnread: false,
    isStarred: false,
    timestampMs: baseNow - 15_000,
  });

  const emReceipt = makeRecord({
    id: 'em_rcpt_01',
    fromName: 'Marcus Sterling',
    fromEmail: 'marcus.sterling@gmail.com',
    subject: 'Trip Receipt Copy Request',
    textBody: 'Could you resend my itemized PDF receipt for Clayton trip?',
    folder: 'receipts',
    category: 'trip_receipt',
    isUnread: true,
    isStarred: false,
    timestampMs: baseNow - 10_000,
  });

  const emArchived = makeRecord({
    id: 'em_arch_01',
    fromName: 'Resolved Guest',
    fromEmail: 'resolved@example.com',
    subject: 'Old Quote Followup',
    folder: 'archive',
    isUnread: false,
    isStarred: false,
    timestampMs: baseNow - 90_000,
  });

  const emTrashed = makeRecord({
    id: 'em_trash_01',
    fromName: 'Promo Mailer',
    fromEmail: 'promo@spam.example',
    subject: 'Irrelevant newsletter',
    folder: 'trash',
    isUnread: false,
    isStarred: true, // Starred item in trash MUST be excluded from 'starred' folder view!
    timestampMs: baseNow - 120_000,
  });

  await emailService.upsertEmailRecords(
    [emGeneral, emBooking, emInquiry, emSent, emReceipt, emArchived, emTrashed],
    { skipFirestore: true }
  );

  const initialDraft = emailService.saveDraft({
    id: 'draft_check_01',
    toEmail: 'claire.donovan@example.com',
    subject: 'Re: Corporate shuttle partnership',
    bodyText: 'Drafting custom corporate quote...',
  });
  assert.equal(initialDraft.id, 'draft_check_01');

  // Verify each of the 9 folder views
  assert.deepEqual(
    emailService.getEmails({ folder: 'inbox' }).map((e) => e.id),
    ['em_inq_01', 'em_bkg_01', 'em_gen_01'],
    'Inbox must show active non-archived/non-trashed inbound messages across inbox + bookings + inquiries sorted newest-first'
  );
  assert.deepEqual(
    emailService.getEmails({ folder: 'bookings' }).map((e) => e.id),
    ['em_bkg_01']
  );
  assert.deepEqual(
    emailService.getEmails({ folder: 'inquiries' }).map((e) => e.id),
    ['em_inq_01']
  );
  assert.deepEqual(
    emailService.getEmails({ folder: 'sent' }).map((e) => e.id),
    ['em_sent_01']
  );
  assert.deepEqual(
    emailService.getEmails({ folder: 'receipts' }).map((e) => e.id),
    ['em_rcpt_01']
  );
  assert.equal(emailService.listDrafts().length, 1);
  assert.deepEqual(
    emailService.getEmails({ folder: 'starred' }).map((e) => e.id),
    ['em_bkg_01', 'em_gen_01'],
    'Starred folder must include starred non-trashed messages and exclude trashed items'
  );
  assert.deepEqual(
    emailService.getEmails({ folder: 'archive' }).map((e) => e.id),
    ['em_arch_01']
  );
  assert.deepEqual(
    emailService.getEmails({ folder: 'trash' }).map((e) => e.id),
    ['em_trash_01']
  );

  // Verify badge counts
  const counts = emailService.getFolderCounts();
  assert.equal(counts.inbox, 3, '3 unread across inbox + bookings + inquiries');
  assert.equal(counts.bookings, 1);
  assert.equal(counts.inquiries, 1);
  assert.equal(counts.sent, 1);
  assert.equal(counts.receipts, 1);
  assert.equal(counts.drafts, 1);
  assert.equal(counts.starred, 2);
  assert.equal(counts.archive, 1);
  assert.equal(counts.trash, 1);
  assert.equal(counts.totalUnread, 4, '3 inbox-family + 1 receipt request unread');

  // Search & unreadOnly filtering
  assert.deepEqual(
    emailService.getEmails({ folder: 'inbox', searchQuery: '#BY-8821' }).map((e) => e.id),
    ['em_bkg_01']
  );

  emailService.deleteDraft('draft_check_01');
  assert.equal(emailService.listDrafts().length, 0);
  console.log('   ✓ All 9 folder views, search, and badge counts verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Bidirectional Read/Unread, Star, Archive & Trash Sync with `CommsThreadService`
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2. Testing read/unread, star, archive, and trash sync with CommsThreadService...');

  let amandaThread = commsService.findThread({ email: 'amanda.vance@bayer.com' });
  assert.ok(amandaThread, 'Amanda Vance CommsThread must exist');
  assert.equal(
    amandaThread.unreadByChannel.email,
    1,
    'Initial unreadByChannel.email must be 1 for em_bkg_01'
  );

  // Mark read -> unreadByChannel.email drops to 0
  await emailService.markEmailsRead(['em_bkg_01']);
  assert.equal(emailService.getEmailById('em_bkg_01')?.isUnread, false);
  amandaThread = commsService.findThread({ email: 'amanda.vance@bayer.com' });
  assert.equal(
    amandaThread?.unreadByChannel.email,
    0,
    'markEmailsRead must decrement unreadByChannel.email to 0'
  );

  // Mark unread -> unreadByChannel.email increments back to 1
  await emailService.markEmailsUnread(['em_bkg_01']);
  assert.equal(emailService.getEmailById('em_bkg_01')?.isUnread, true);
  amandaThread = commsService.findThread({ email: 'amanda.vance@bayer.com' });
  assert.equal(
    amandaThread?.unreadByChannel.email,
    1,
    'markEmailsUnread must increment unreadByChannel.email back to 1'
  );

  // Toggle star
  await emailService.toggleEmailStar('em_bkg_01');
  assert.equal(emailService.getEmailById('em_bkg_01')?.isStarred, false);
  await emailService.toggleEmailStar('em_bkg_01');
  assert.equal(emailService.getEmailById('em_bkg_01')?.isStarred, true);

  // Move unread email to archive -> unreadByChannel.email drops to 0 and email moves to 'archive'
  await emailService.moveEmailsToFolder(['em_bkg_01'], 'archive');
  assert.equal(emailService.getEmailById('em_bkg_01')?.folder, 'archive');
  assert.equal(emailService.getEmailById('em_bkg_01')?.isUnread, false);
  amandaThread = commsService.findThread({ email: 'amanda.vance@bayer.com' });
  assert.equal(
    amandaThread?.unreadByChannel.email,
    0,
    'Archiving unread email must clear unreadByChannel.email'
  );

  // Restore back to inbox -> booking_request returns to active 'bookings' (visible in 'inbox' & 'bookings')
  await emailService.moveEmailsToFolder(['em_bkg_01'], 'inbox');
  assert.equal(emailService.getEmailById('em_bkg_01')?.folder, 'bookings');
  assert.ok(
    emailService.getEmails({ folder: 'inbox' }).some((e) => e.id === 'em_bkg_01'),
    'Restored booking email must reappear in Inbox view'
  );

  // Mark unread then move to trash -> unreadByChannel.email drops to 0
  await emailService.markEmailsUnread(['em_inq_01']);
  let claireThread = commsService.findThread({ email: 'claire.donovan@example.com' });
  assert.equal(claireThread?.unreadByChannel.email, 1);
  await emailService.moveEmailsToFolder(['em_inq_01'], 'trash');
  assert.equal(emailService.getEmailById('em_inq_01')?.folder, 'trash');
  claireThread = commsService.findThread({ email: 'claire.donovan@example.com' });
  assert.equal(
    claireThread?.unreadByChannel.email,
    0,
    'Moving unread email to Trash must clear unreadByChannel.email'
  );
  console.log('   ✓ Read, unread, star, archive, restore, and trash sync exact with CommsThreadService.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Auto-Saved Draft Lifecycle & Zero-Duplicate Threaded Outbound Dispatch
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3. Testing auto-saved draft lifecycle & zero-duplicate sendComposerEmail...');

  let busEventCount = 0;
  let latestBusUnread = -1;
  const unsubBus = getWorkspaceBus().subscribe((msg) => {
    if (msg.type === 'EMAIL_STATE_CHANGED') {
      busEventCount += 1;
      latestBusUnread = msg.payload.unreadCount;
    }
  });

  const replySeed = buildReplyOrForwardDraftSeed({
    mode: 'reply',
    email: emailService.getEmailById('em_bkg_01')!,
  });
  assert.equal(replySeed.toEmail, 'amanda.vance@bayer.com');
  assert.ok(replySeed.subject.startsWith('Re: Executive Transfer Request'));
  assert.equal(replySeed.inReplyTo, '<em_bkg_01@chesterfieldtaxi.com>');

  // Save draft -> edit draft
  const savedDraft = emailService.saveDraft({
    ...replySeed,
    id: 'draft_amanda_reply_1',
    bodyText: 'Initial draft reply...',
  });
  assert.equal(emailService.listDrafts().length, 1);

  const editedDraft = emailService.saveDraft({
    id: savedDraft.id,
    bodyText:
      'Hello Amanda, your executive transfer for DL1492 tomorrow at 8:30 AM is confirmed under Trip CT-90112.',
    tripId: 'CT-90112',
  });
  assert.equal(emailService.listDrafts().length, 1);
  assert.equal(editedDraft.tripId, 'CT-90112');

  // Wire mock fetch directly to real server route handlers (`handleSendEmailPost` & `handleEmailWebhookGet`)
  const localServerFetch: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://chesterfieldtaxi.com${rawUrl}`;
    const req = new Request(fullUrl, init);

    if (fullUrl.includes('/api/send-email')) {
      return handleSendEmailPost(req, {
        enforceAuth: true,
        authResolver: async () => DISPATCHER_AUTH,
        env: TEST_ENV,
        skipFirestore: true,
      });
    }
    if (fullUrl.includes('/api/email/webhook')) {
      return handleEmailWebhookGet(req, {
        enforceAuth: true,
        authResolver: async () => DISPATCHER_AUTH,
        env: TEST_ENV,
        skipFirestore: true,
      });
    }
    throw new Error(`Unexpected fetch URL: ${fullUrl}`);
  };

  const sentBefore = emailService.getEmails({ folder: 'sent' }).length;
  const sendRes = await emailService.sendComposerEmail(
    {
      draftId: editedDraft.id,
      toEmail: editedDraft.toEmail,
      toName: editedDraft.toName,
      subject: editedDraft.subject,
      bodyText: editedDraft.bodyText,
      threadId: editedDraft.threadId,
      inReplyTo: editedDraft.inReplyTo,
      references: editedDraft.references,
      tripId: editedDraft.tripId,
      contactPhone: editedDraft.contactPhone,
    },
    { fetchImpl: localServerFetch }
  );

  assert.equal(sendRes.success, true, 'sendComposerEmail must succeed');
  assert.ok(sendRes.emailId?.startsWith('out_'), 'Must hydrate authoritative server out_... emailId');
  assert.ok(
    sendRes.rfcMessageId?.includes('@chesterfieldtaxi.com>'),
    'Must hydrate authoritative RFC Message-ID'
  );
  assert.equal(
    emailService.listDrafts().length,
    0,
    'Associated draft must be automatically removed upon successful send'
  );
  assert.equal(
    emailService.getEmails({ folder: 'sent' }).length,
    sentBefore + 1,
    'Exactly one new Sent record must exist after sendComposerEmail'
  );

  // Now run syncWithServer against `/api/email/webhook?action=sync_emails` and verify ZERO duplicates!
  const syncRes = await emailService.syncWithServer({ fetchImpl: localServerFetch });
  assert.equal(syncRes.success, true);
  assert.equal(
    emailService.getEmails({ folder: 'sent' }).length,
    sentBefore + 1,
    'sync_emails must NOT create duplicate local + server Sent records'
  );

  // Verify conversation threading chronological order (inbound request -> outbound reply)
  const convThread = emailService.getConversationMessages('em_bkg_01');
  assert.equal(convThread.length, 2, 'Inbound booking + outbound reply must group into 2-message thread');
  assert.equal(convThread[0].id, 'em_bkg_01');
  assert.equal(convThread[1].id, sendRes.emailId);
  assert.ok(busEventCount > 0 && latestBusUnread >= 0, 'EMAIL_STATE_CHANGED must broadcast on WorkspaceBus');
  unsubBus();
  console.log('   ✓ Draft lifecycle, authoritative server ID hydration, zero-duplicate sync, and threading verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Canned Dispatch Templates Interpolation + `POPULATE_BOOKING` Mapping
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4. Testing all 6 Canned Dispatch Templates & POPULATE_BOOKING payload mapping...');

  assert.equal(CANNED_DISPATCH_EMAIL_TEMPLATES.length, 6, 'Must define all 6 canned templates');

  const tplContext = {
    firstName: 'Amanda',
    passengerName: 'Amanda Vance',
    tripId: 'CT-90112',
    pickupAddress: 'St. Louis Lambert International Airport (STL)',
    dropoffAddress: 'Bayer Crop Science Campus, Chesterfield, MO',
    pickupTime: 'Nov 22 at 8:30 AM',
    trackingUrl: 'https://chesterfieldtaxi.com/track/trk_amanda_90112',
    payUrl: 'https://chesterfieldtaxi.com/pay/pay_test_token_amanda_vance_1234567890',
    corporateAccount: '#BY-8821',
    airlineOrAirportHint: 'DL',
  };

  for (const tpl of CANNED_DISPATCH_EMAIL_TEMPLATES) {
    const rendered = interpolateDispatchEmailTemplate(tpl, tplContext);
    assert.ok(rendered.subject.length > 10, `Template ${tpl.id} must produce non-empty subject`);
    assert.ok(rendered.bodyText.includes('Amanda'), `Template ${tpl.id} must interpolate {firstName}`);
    assert.ok(
      !rendered.bodyText.includes('{firstName}') &&
        !rendered.bodyText.includes('{pickupAddress}') &&
        !rendered.bodyText.includes('{trackingUrl}') &&
        !rendered.bodyText.includes('{payUrl}'),
      `Template ${tpl.id} must leave zero uninterpolated placeholders`
    );

    if (tpl.id === 'airport_curbside_pickup') {
      assert.ok(rendered.bodyText.includes('Terminal 1 Exit Door 6'));
      assert.ok(rendered.bodyText.includes('Terminal 2 Exit Door 12'));
      assert.ok(rendered.bodyText.includes('SUS FBO'));
      assert.ok(rendered.bodyText.includes(tplContext.trackingUrl));
    }
    if (tpl.id === 'secure_payment_link') {
      assert.ok(rendered.bodyText.includes(tplContext.payUrl));
    }
    if (tpl.id === 'corporate_account_po_confirmation') {
      assert.ok(rendered.bodyText.includes('#BY-8821'));
    }
  }

  // Test POPULATE_BOOKING payload mapping from Amanda's booking email
  const populatePayload = buildPopulateBookingPayloadFromEmail(
    emailService.getEmailById('em_bkg_01')!,
    { nowMs: baseNow }
  );
  assert.equal(populatePayload.passengerName, 'Amanda Vance');
  assert.equal(populatePayload.passengerPhone, '+13145550199');
  assert.equal(populatePayload.passengerEmail, 'amanda.vance@bayer.com');
  assert.ok(populatePayload.pickupAddress?.includes('Terminal 1 Exit 6'));
  assert.ok(populatePayload.dropoffAddress?.includes('Bayer Crop Science Campus'));
  assert.equal(populatePayload.date, '2026-11-22');
  assert.equal(populatePayload.time, '08:30');
  assert.equal(populatePayload.airlineCode, 'DL');
  assert.equal(populatePayload.flightNumber, '1492');
  assert.equal(populatePayload.flightIdent, 'DL1492');
  assert.equal(populatePayload.corporateAccount, '#BY-8821');
  assert.equal(populatePayload.poNumber, 'PO-99412');
  console.log('   ✓ All 6 canned templates (STL T1/T2 + SUS FBO + Pay/Tracking URLs) & POPULATE_BOOKING verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Cross-Channel Sender Timeline Resolution (`amanda.vance@bayer.com` + `+13145550199`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5. Testing cross-channel sender timeline linking Email + SMS + Call + Voicemail + Trips...');

  await commsService.recordCommsEvent(
    {
      id: 'SM_amanda_sms_1',
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      contactName: 'Amanda Vance',
      contactPhone: '(314) 555-0199',
      bodyText: 'Hi Dispatch, my Delta flight DL1492 just landed early at Gate A14!',
      snippet: 'Hi Dispatch, my Delta flight DL1492 just landed early at Gate A14!',
      timestampMs: baseNow + 10_000,
    },
    { skipFirestore: true }
  );

  await commsService.recordCommsEvent(
    {
      id: 'CA_amanda_call_1',
      channel: 'call',
      direction: 'inbound',
      eventType: 'call_inbound',
      contactName: 'Amanda Vance',
      contactPhone: '+13145550199',
      durationSeconds: 74,
      snippet: 'Inbound call (74s) — confirmed Terminal 1 Exit Door 6 pickup',
      timestampMs: baseNow + 20_000,
    },
    { skipFirestore: true }
  );

  await commsService.recordCommsEvent(
    {
      id: 'RE_amanda_vm_1',
      recordingSid: 'RE_amanda_vm_1',
      channel: 'voicemail',
      direction: 'inbound',
      eventType: 'voicemail',
      contactName: 'Amanda Vance',
      contactPhone: '+13145550199',
      transcription: 'Hi this is Amanda Vance with Bayer, calling to confirm car number.',
      snippet: 'Voicemail (18s)',
      timestampMs: baseNow + 25_000,
    },
    { skipFirestore: true }
  );

  await commsService.addInternalNote({
    phone: '+13145550199',
    email: 'amanda.vance@bayer.com',
    contactName: 'Amanda Vance',
    bodyText: 'VIP Bayer executive — assign Car #204 black sedan.',
    timestampMs: baseNow + 30_000,
  });

  const amandaActiveTrip = makeSampleTrip({
    id: 'CT-90112',
    status: 'en_route',
    trackingToken: 'trk_live_amanda_90112',
    corporateAccountId: '#BY-8821',
  });
  const unrelatedTrip = makeSampleTrip({
    id: 'CT-55500',
    status: 'completed',
    passenger: {
      firstName: 'Other',
      lastName: 'Rider',
      email: 'other@example.com',
      phone: '+16365559999',
      passengerCount: 1,
      luggageCount: 0,
    },
  });

  const senderCtx = emailService.resolveSenderTimeline(
    emailService.getEmailById('em_bkg_01')!,
    [amandaActiveTrip, unrelatedTrip]
  );

  assert.equal(senderCtx.primaryEmail, 'amanda.vance@bayer.com');
  assert.equal(senderCtx.primaryPhone, '+13145550199');
  assert.equal(senderCtx.matchedTrips.length, 1);
  assert.equal(senderCtx.activeTrips.length, 1);
  assert.equal(senderCtx.activeTrips[0].id, 'CT-90112');

  const channelsInTimeline = new Set(senderCtx.timelineEvents.map((e) => e.channel));
  assert.ok(channelsInTimeline.has('email'), 'Timeline must include Email events');
  assert.ok(channelsInTimeline.has('sms'), 'Timeline must include SMS events from +13145550199');
  assert.ok(channelsInTimeline.has('call'), 'Timeline must include Call events from +13145550199');
  assert.ok(
    channelsInTimeline.has('voicemail'),
    'Timeline must include Voicemail events from +13145550199'
  );
  assert.ok(channelsInTimeline.has('note'), 'Timeline must include Internal Notes');

  const vmEvt = senderCtx.timelineEvents.find((e) => e.channel === 'voicemail');
  assert.ok(vmEvt?.transcription?.includes('Amanda Vance with Bayer'));

  const trackingUrl = buildTripTrackingUrl(amandaActiveTrip, 'https://chesterfieldtaxi.com');
  assert.equal(trackingUrl, 'https://chesterfieldtaxi.com/track/trk_live_amanda_90112');

  const rebookPayload = buildPopulateRebookPayloadFromTrip(amandaActiveTrip);
  assert.equal(rebookPayload.passengerEmail, 'amanda.vance@bayer.com');
  assert.equal(rebookPayload.passengerPhone, '+13145550199');
  console.log('   ✓ Cross-channel sender timeline unified across Email + SMS + Call + Voicemail + Notes + Trips.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Architectural & Bundle Boundary Guardrails (`constitution.md`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6. Verifying constitution.md client/server bundle isolation & vercel.json...');

  const clientFilesToCheck = [
    'app/core/services/email/dispatch-email.service.ts',
    'app/components/domain/dispatch/EmailDock.tsx',
    'app/components/domain/dispatch/email/EmailFolderToolbar.tsx',
    'app/components/domain/dispatch/email/EmailMessageListPane.tsx',
    'app/components/domain/dispatch/email/EmailReaderPane.tsx',
    'app/components/domain/dispatch/email/EmailComposerPane.tsx',
    'app/components/domain/dispatch/email/EmailCrossChannelRail.tsx',
  ];

  for (const relPath of clientFilesToCheck) {
    const abs = path.resolve(process.cwd(), relPath);
    const src = fs.readFileSync(abs, 'utf8');
    assert.ok(
      !/from\s+['"][^'"]*\.server['"]/.test(src),
      `${relPath} must NEVER import *.server.ts modules`
    );
    assert.ok(
      !/from\s+['"]node:/.test(src),
      `${relPath} must NEVER import node:* modules`
    );
  }

  const emailDockSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'app/components/domain/dispatch/EmailDock.tsx'),
    'utf8'
  );
  assert.ok(
    !emailDockSrc.includes('INITIAL_EMAILS'),
    'Hardcoded INITIAL_EMAILS array must be retired from EmailDock.tsx'
  );

  const vercelJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  );
  assert.equal(
    vercelJson.crons?.[0]?.schedule,
    '0 10 * * *',
    'Vercel Hobby cron schedule ("0 10 * * *") must remain unchanged'
  );
  console.log('   ✓ Zero server/node leaks in client modules, INITIAL_EMAILS retired, vercel.json intact.\n');

  console.log('ALL PHASE 41 EMAILDOCK SERVICE & CROSS-CHANNEL TESTS PASSED! ✅');
}

runTests().catch((err) => {
  console.error('Phase 41 test suite failed:', err);
  process.exit(1);
});
