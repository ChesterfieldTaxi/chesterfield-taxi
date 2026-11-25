/**
 * Platform Phase 42 (Wave 2 Phase 4) Verification Suite:
 * `CommsHub` Multi-Channel Thread UI/UX, Canned SMS Templates & Live Caller CRM Context
 *
 * Verifies:
 * 1. `interpolateCommsSmsTemplate` across all 6 `CANNED_DISPATCH_SMS_TEMPLATES`
 *    (`driver_en_route`, `driver_arrived`, `airport_curbside`, `reservation_confirmed`,
 *    `payment_link`, `flight_checkin`), verifying `{firstName}`, `{passengerName}`,
 *    `{tripId}`, `{pickupTime}`, `{pickupShort}`, `{dropoffShort}`, `{driverName}`,
 *    `{carUnit}`, `{trackingUrl}`, `{payUrl}`, STL Terminal 1 Exit Door 6 /
 *    Terminal 2 Exit Door 12 / SUS FBO guidance (`resolveStlTerminalInfo`), and
 *    ZERO leftover `{...}` placeholders when optional fields are omitted.
 * 2. `resolveCommsCrmContext` verifying VIP, Blacklist, Corporate Account,
 *    Accessibility badges, active trip + assigned driver `Car #` + flight delay badge
 *    resolution (`resolveTripFlightBadge`), cached `payToken`/`payUrl`, live dialpad
 *    trip-only caller lookup, and `Rebook Last Ride` (`POPULATE_BOOKING`) payload generation.
 * 3. Multi-channel thread list & timeline interleaving across
 *    `SMS + Call + Voicemail + Email + Internal Note` (including `DispatchEmailService` ->
 *    `CommsThreadService` mirror sync without `EmailDock`, email-only threads, phone+email
 *    unified threads, channel filtering across `all`/`calls`/`voicemail`/`messages`/`emails`/`notes`,
 *    email delivery status pills, and `OPEN_EMAIL_MESSAGE` / `OPEN_COMMS_THREAD` bus routing).
 * 4. Architectural guardrails (`constitution.md`): zero `*.server` or `node:` imports in
 *    `comms` client services/components, retired static SMS chips, and `vercel.json`
 *    `"0 10 * * *"` cron preserved.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANNED_DISPATCH_SMS_TEMPLATES,
  COMMS_ALL_CHANNEL_FILTER_OPTIONS,
  buildInterpolatedCommsSmsChips,
  buildUnifiedCommsThreadSummaries,
   commsEventToInteractionEvent,
  filterCommsInteractionEvents,
  formatCommsCarUnit,
  getCommsThreadService,
  interpolateCommsSmsTemplate,
  resolveCommsCrmContext,
  resolveCommsEmailDeliveryBadge,
  resolveInteractionSelectorTarget,
} from '../app/core/services/comms';
import { getContactService } from '../app/core/services/customer/contact.service';
import { getDispatchEmailService } from '../app/core/services/email/dispatch-email.service';
import { getWorkspaceBus, type WorkspaceMessage } from '../app/core/services/workspace-bus.service';
import {
  DISPATCH_MAILBOX_ADDRESS,
  buildDeterministicRfcMessageId,
  buildDispatchEmailCommsEventId,
  type DispatchEmailRecord,
} from '../app/core/types/dispatch-email';
import type { DriverProfile } from '../app/core/types/driver';
import type { Trip } from '../app/core/types/trip';

function makeTrip(overrides: Partial<Trip> & { id: string }): Trip {
  const nowIso = new Date().toISOString();
  return {
    id: overrides.id,
    status: overrides.status || 'en_route',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: overrides.assignedDriverId ?? null,
    assignedVehicle: overrides.assignedVehicle,
    corporateAccountId: overrides.corporateAccountId,
    trackingToken: overrides.trackingToken,
    isBlacklisted: overrides.isBlacklisted,
    blacklistReason: overrides.blacklistReason,
    pickupLocation: overrides.pickupLocation || {
      address: 'Lambert-St. Louis International Airport (STL), St. Louis, MO',
    },
    dropoffLocation: overrides.dropoffLocation || {
      address: '700 Chesterfield Pkwy W, Chesterfield, MO 63017',
    },
    bookingType: overrides.bookingType || 'scheduled',
    scheduledPickupTime:
      overrides.scheduledPickupTime || new Date(Date.now() + 45 * 60_000).toISOString(),
    completedAt: overrides.completedAt,
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
      baseFare: 55,
      distanceMiles: 19.5,
      durationMinutes: 24,
      distanceRate: 2.5,
      timeRate: 0.5,
      vehicleMultiplier: 1.25,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 68,
      totalFare: 68,
      currency: 'USD',
    },
    payment: overrides.payment || {
      method: 'card',
      status: 'pending',
      amount: 68,
    },
    flightTelemetry: overrides.flightTelemetry,
    statusHistory: [],
    createdAt: overrides.createdAt || nowIso,
    updatedAt: overrides.updatedAt || nowIso,
    metadata: overrides.metadata,
  };
}

function makeEmailRecord(
  overrides: Partial<DispatchEmailRecord> & Pick<DispatchEmailRecord, 'id' | 'subject'>
): DispatchEmailRecord {
  const ts = overrides.timestampMs ?? Date.now();
  const iso = new Date(ts).toISOString();
  return {
    id: overrides.id,
    threadId: overrides.threadId || 'thr_email_test',
    commsEventId: overrides.commsEventId || buildDispatchEmailCommsEventId(overrides.id),
    rfcMessageId: overrides.rfcMessageId || buildDeterministicRfcMessageId(overrides.id),
    references: overrides.references || [],
    normalizedSubject: overrides.normalizedSubject || overrides.subject,
    direction: overrides.direction || 'inbound',
    category: overrides.category || 'booking_request',
    folder: overrides.folder || 'bookings',
    fromName: overrides.fromName || 'Customer',
    fromEmail: overrides.fromEmail || 'customer@example.com',
    toEmail: overrides.toEmail || DISPATCH_MAILBOX_ADDRESS,
    subject: overrides.subject,
    textBody: overrides.textBody || 'Email body text',
    sanitizedHtmlBody: overrides.sanitizedHtmlBody || '<p>Email body text</p>',
    snippet: overrides.snippet || 'Email body text',
    attachments: [],
    contactId: overrides.contactId,
    contactPhone: overrides.contactPhone,
    tripId: overrides.tripId,
    suggestedBooking: overrides.suggestedBooking,
    deliveryStatus: overrides.deliveryStatus || 'received',
    deliveryError: overrides.deliveryError,
    isUnread: overrides.isUnread ?? true,
    isStarred: overrides.isStarred ?? false,
    createdAt: iso,
    timestampMs: ts,
    updatedAt: iso,
  };
}

async function runVerification() {
  console.log('=== Platform Phase 42 Verification: CommsHub Multi-Channel UI/UX, Canned SMS & CRM ===\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Canned SMS Templates & Pure Variable Interpolation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Verifying CANNED_DISPATCH_SMS_TEMPLATES & interpolateCommsSmsTemplate...');

  const expectedIds = [
    'driver_en_route',
    'driver_arrived',
    'airport_curbside',
    'reservation_confirmed',
    'payment_link',
    'flight_checkin',
  ];
  assert.deepEqual(
    CANNED_DISPATCH_SMS_TEMPLATES.map((t) => t.id),
    expectedIds,
    'All 6 config-driven canned SMS templates must be registered in order'
  );

  assert.equal(formatCommsCarUnit('104'), 'Car #104');
  assert.equal(formatCommsCarUnit('#104'), 'Car #104');
  assert.equal(formatCommsCarUnit('Car #104'), 'Car #104');
  assert.equal(formatCommsCarUnit('car 208'), 'Car #208');
  assert.equal(formatCommsCarUnit(''), undefined);

  const fullContext = {
    firstName: 'Amanda',
    passengerName: 'Amanda Vance',
    tripId: 'TRP-4201',
    pickupTime: '8:30 AM',
    pickupShort: 'STL Terminal 1',
    dropoffShort: 'Bayer Campus Chesterfield',
    driverName: 'Marcus',
    carUnit: '104',
    trackingUrl: 'https://chesterfieldtaxi.com/track/trk_live_4201',
    payUrl: 'https://chesterfieldtaxi.com/pay/pay_live_4201_abcdefghijklmnop',
    airlineCode: 'DL',
    airportCode: 'STL',
  };

  const enRouteSms = interpolateCommsSmsTemplate('driver_en_route', fullContext);
  assert.ok(enRouteSms.includes('Amanda'));
  assert.ok(enRouteSms.includes('Marcus'));
  assert.ok(enRouteSms.includes('Car #104'));
  assert.ok(!enRouteSms.includes('Car #Car #'));
  assert.ok(enRouteSms.includes('8:30 AM'));
  assert.ok(enRouteSms.includes('https://chesterfieldtaxi.com/track/trk_live_4201'));
  assert.ok(!/\{[^}]*\}/.test(enRouteSms));

  const arrivedSms = interpolateCommsSmsTemplate('driver_arrived', fullContext);
  assert.ok(arrivedSms.includes('Car #104'));
  assert.ok(arrivedSms.includes('arrived curbside'));
  assert.ok(arrivedSms.includes('https://chesterfieldtaxi.com/track/trk_live_4201'));
  assert.ok(!/\{[^}]*\}/.test(arrivedSms));

  // Airport Curbside: STL Terminal 1 (Delta DL) vs STL Terminal 2 (Southwest WN) vs SUS FBO
  const stlT1Sms = interpolateCommsSmsTemplate('airport_curbside', {
    ...fullContext,
    airlineCode: 'DL',
    airportCode: 'STL',
  });
  assert.ok(
    stlT1Sms.includes('Terminal 1 Exit Door 6'),
    `Expected STL T1 Exit Door 6 in: ${stlT1Sms}`
  );
  assert.ok(stlT1Sms.includes('Car #104'));
  assert.ok(stlT1Sms.includes('https://chesterfieldtaxi.com/track/trk_live_4201'));

  const stlT2Sms = interpolateCommsSmsTemplate('airport_curbside', {
    ...fullContext,
    airlineCode: 'WN',
    airportCode: 'STL',
  });
  assert.ok(
    stlT2Sms.includes('Terminal 2 Exit Door 12'),
    `Expected STL T2 Exit Door 12 in: ${stlT2Sms}`
  );

  const susFboSms = interpolateCommsSmsTemplate('airport_curbside', {
    ...fullContext,
    airlineCode: undefined,
    airportCode: 'SUS',
    pickupAddress: 'Signature Aviation, Spirit of St. Louis Airport (SUS), Chesterfield, MO',
  });
  assert.ok(susFboSms.includes('SUS FBO'), `Expected SUS FBO in: ${susFboSms}`);

  const confirmedSms = interpolateCommsSmsTemplate('reservation_confirmed', fullContext);
  assert.ok(confirmedSms.includes('TRP-4201'));
  assert.ok(confirmedSms.includes('8:30 AM'));
  assert.ok(confirmedSms.includes('Bayer Campus Chesterfield'));
  assert.ok(confirmedSms.includes('https://chesterfieldtaxi.com/track/trk_live_4201'));

  const paySms = interpolateCommsSmsTemplate('payment_link', fullContext);
  assert.ok(paySms.includes('TRP-4201'));
  assert.ok(paySms.includes('https://chesterfieldtaxi.com/pay/pay_live_4201_abcdefghijklmnop'));

  const flightCheckinSms = interpolateCommsSmsTemplate('flight_checkin', fullContext);
  assert.ok(flightCheckinSms.includes('Amanda'));
  assert.ok(flightCheckinSms.includes('luggage'));
  assert.ok(flightCheckinSms.includes('Car #104'));

  // Zero leftover `{...}` tokens when ALL optional fields are missing + custom `{passengerName}` / unknown token
  for (const tpl of CANNED_DISPATCH_SMS_TEMPLATES) {
    const fallbackRendered = interpolateCommsSmsTemplate(tpl, {});
    assert.ok(fallbackRendered.length > 20);
    assert.equal(
      /\{[^}]*\}/.test(fallbackRendered),
      false,
      `Template ${tpl.id} left raw placeholder in fallback mode: ${fallbackRendered}`
    );
  }
  const customTokenCheck = interpolateCommsSmsTemplate(
    'Passenger {passengerName} ({unknownPlaceholder}) from {pickupShort} to {dropoffShort}',
    {}
  );
  assert.equal(/\{[^}]*\}/.test(customTokenCheck), false);
  assert.ok(customTokenCheck.includes('Valued Passenger'));
  console.log('   ✓ All 6 canned SMS templates, STL T1/T2 + SUS FBO guidance & zero-leftover fallbacks verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Unified Caller / Thread CRM Context Resolver (`resolveCommsCrmContext`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2. Verifying resolveCommsCrmContext (VIP, Blacklist, Corporate, Accessibility, Flight Delay & Rebook)...');

  const contactService = getContactService();
  const commsService = getCommsThreadService();
  commsService.resetForTests();

  const vipCorpContact = contactService.saveContact({
    id: 'cust_phase42_amanda',
    name: 'Amanda Vance',
    firstName: 'Amanda',
    lastName: 'Vance',
    phone: '+13145550199',
    mobilePhone: '+13145550199',
    email: 'amanda.vance@bayer.com',
    corporateAccountId: 'corp_bayer_01',
    corporateAccountName: 'Bayer Crop Science',
    corporateAccountNumber: 'BY-8821',
    defaultPoNumber: 'PO-2026-STL',
    isVip: true,
    vipReason: 'Executive Travel Coordinator',
    preferredVehicleTier: 'premium',
    accessibilityNeeds: {
      wheelchair: true,
      walker: true,
      serviceAnimal: true,
      extraAssistance: true,
    },
    notes: 'Prefers bottled water',
    internalDispatcherNotes: 'Direct-bill Bayer executive account',
    tripCount: 14,
    customerScore: 98,
    isBlacklisted: false,
  });

  const blacklistedContact = contactService.saveContact({
    id: 'cust_phase42_blocked',
    name: 'Victor Chargeback',
    phone: '+13145550999',
    isBlacklisted: true,
    blacklistReason: 'Fraudulent card dispute — cash prepay prohibited',
  });

  const sampleDrivers: DriverProfile[] = [
    {
      id: 'drv_104',
      name: 'Marcus Reid',
      cabNumber: '104',
      vehicleUnit: '104',
      phone: '+13145550804',
      dutyStatus: 'on_duty',
      vehicleTier: 'premium',
    },
  ];

  // Valid payToken (24+ alnum chars after `pay_`)
  const validPayToken = 'pay_4201aabbccddeeff001122334455';

  const activeAirportTrip = makeTrip({
    id: 'TRP-4201',
    customerId: vipCorpContact.id,
    status: 'en_route',
    assignedDriverId: 'drv_104',
    trackingToken: 'trk_4201_xyz',
    corporateAccountId: 'corp_bayer_01',
    payment: {
      method: 'corporate',
      status: 'pending',
      amount: 74,
      payToken: validPayToken,
      payLinkStatus: 'open',
    },
    flightTelemetry: {
      flightIdent: 'DL1492',
      airlineCode: 'DL',
      airlineName: 'Delta Air Lines',
      flightNumber: '1492',
      serviceDate: '2026-11-22',
      status: 'delayed',
      delayMinutes: 35,
      originIata: 'ATL',
      destinationIata: 'STL',
      terminal: 'Terminal 1',
      gate: 'A14',
      baggageClaim: 'Carousel 3',
      pickupDoorGuidance: 'Terminal 1 · Lower Level Exit Door 6 / Door 12',
      provider: 'aerodatabox',
      isSimulatedFallback: false,
      checkedAt: new Date().toISOString(),
      cacheExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    },
  });

  const completedTrip = makeTrip({
    id: 'TRP-4190',
    customerId: vipCorpContact.id,
    status: 'completed',
    completedAt: new Date(Date.now() - 86_400_000).toISOString(),
    pickupLocation: { address: '700 Chesterfield Pkwy W, Chesterfield, MO 63017' },
    dropoffLocation: { address: 'Lambert-St. Louis International Airport (STL), St. Louis, MO' },
    vehicleTier: 'premium',
  });

  const crmAmanda = resolveCommsCrmContext({
    phone: '(314) 555-0199',
    trips: [completedTrip, activeAirportTrip],
    drivers: sampleDrivers,
    originOverride: 'https://chesterfieldtaxi.com',
  });

  assert.equal(crmAmanda.hasKnownContext, true);
  assert.equal(crmAmanda.isKnownContact, true);
  assert.equal(crmAmanda.contactName, 'Amanda Vance');
  assert.equal(crmAmanda.firstName, 'Amanda');
  assert.equal(crmAmanda.primaryPhone, '+13145550199');
  assert.equal(crmAmanda.primaryEmail, 'amanda.vance@bayer.com');
  assert.equal(crmAmanda.isVip, true);
  assert.equal(crmAmanda.vipReason, 'Executive Travel Coordinator');
  assert.equal(crmAmanda.isBlacklisted, false);
  assert.equal(crmAmanda.corporateAccountName, 'Bayer Crop Science');
  assert.equal(crmAmanda.corporateAccountNumber, 'BY-8821');
  assert.equal(crmAmanda.preferredVehicleTier, 'premium');
  assert.equal(crmAmanda.preferredVehicleLabel, 'Executive Sedan');
  assert.deepEqual(crmAmanda.accessibilityBadges, [
    'Wheelchair WAV',
    'Folding Walker',
    'Service Animal',
    'Extra Assistance',
  ]);
  assert.equal(crmAmanda.tripCount, 14);
  assert.equal(crmAmanda.customerScore, 98);
  assert.ok(crmAmanda.internalNotes?.includes('Direct-bill Bayer executive account'));

  // Active trip + driver Car # + flight delay badge + trackingUrl + payUrl
  assert.equal(crmAmanda.activeTrips.length, 1);
  const activeSummary = crmAmanda.activeTrips[0];
  assert.equal(activeSummary.tripId, 'TRP-4201');
  assert.equal(activeSummary.statusLabel, 'Driver En Route');
  assert.equal(activeSummary.driverName, 'Marcus Reid');
  assert.equal(activeSummary.carUnit, 'Car #104');
  assert.equal(activeSummary.trackingUrl, 'https://chesterfieldtaxi.com/track/trk_4201_xyz');
  assert.equal(activeSummary.cachedPayToken, validPayToken);
  assert.equal(activeSummary.payUrl, `https://chesterfieldtaxi.com/pay/${validPayToken}`);
  assert.ok(activeSummary.flightBadge?.hasFlight);
  assert.equal(activeSummary.flightBadge?.tone, 'amber');
  assert.ok(activeSummary.flightBadge?.label.includes('Delayed +35m'));

  // Rebook Last Ride payload
  assert.equal(crmAmanda.lastCompletedTrip?.id, 'TRP-4190');
  assert.ok(crmAmanda.rebookPayload);
  assert.equal(crmAmanda.rebookPayload?.passengerName, 'Amanda Vance');
  assert.equal(crmAmanda.rebookPayload?.pickupAddress, '700 Chesterfield Pkwy W, Chesterfield, MO 63017');
  assert.equal(
    crmAmanda.rebookPayload?.dropoffAddress,
    'Lambert-St. Louis International Airport (STL), St. Louis, MO'
  );
  assert.equal(crmAmanda.rebookPayload?.corporateAccountNumber, 'BY-8821');
  assert.equal(crmAmanda.rebookPayload?.billingPo, 'PO-2026-STL');

  // Dynamic chips from CRM templateContext
  const amandaChips = buildInterpolatedCommsSmsChips(crmAmanda.templateContext);
  assert.equal(amandaChips.length, 6);
  assert.ok(amandaChips[0].text.includes('Car #104'));
  assert.ok(amandaChips[0].text.includes('https://chesterfieldtaxi.com/track/trk_4201_xyz'));
  assert.ok(amandaChips[4].text.includes(`https://chesterfieldtaxi.com/pay/${validPayToken}`));

  // Blacklisted contact check
  const crmBlocked = resolveCommsCrmContext({
    phone: blacklistedContact.phone,
    trips: [],
    drivers: sampleDrivers,
  });
  assert.equal(crmBlocked.isBlacklisted, true);
  assert.equal(crmBlocked.blacklistReason, 'Fraudulent card dispute — cash prepay prohibited');

  // Dialpad live lookup for a trip-only caller (no saved ContactRecord yet)
  const webGuestTrip = makeTrip({
    id: 'TRP-4299',
    status: 'CONFIRMED',
    passenger: {
      firstName: 'Liam',
      lastName: ' Novak',
      email: 'liam.novak@example.org',
      phone: '+16365550777',
      passengerCount: 2,
      luggageCount: 1,
    },
  });
  const dialpadTripOnlyCrm = resolveCommsCrmContext({
    phone: '636-555-0777',
    trips: [webGuestTrip],
    drivers: sampleDrivers,
  });
  assert.equal(dialpadTripOnlyCrm.hasKnownContext, true);
  assert.equal(dialpadTripOnlyCrm.isKnownContact, false);
  assert.equal(dialpadTripOnlyCrm.contactName, 'Liam Novak');
  assert.equal(dialpadTripOnlyCrm.activeTrips[0]?.tripId, 'TRP-4299');

  // Partial 3-digit dialpad entry should not false-match
  const partialDialpadCrm = resolveCommsCrmContext({
    phone: '314',
    trips: [activeAirportTrip, webGuestTrip],
    drivers: sampleDrivers,
  });
  assert.equal(partialDialpadCrm.hasKnownContext, false);
  console.log('   ✓ resolveCommsCrmContext verified across VIP, Blacklist, Flight Delay, Rebook & live dialpad.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Multi-Channel Thread List, Timeline Interleaving, Filtering & Bus Routing
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3. Verifying multi-channel thread list, timeline interleaving, filtering & WorkspaceBus...');

  commsService.resetForTests();
  const emailService = getDispatchEmailService();

  const baseTs = Date.now() - 60_000;

  // Seed DispatchEmailService with an inbound email for Amanda (phone+email) AND an email-only guest
  await emailService.upsertEmailRecord(
    makeEmailRecord({
      id: 'em_amanda_42',
      threadId: `thr_contact_${vipCorpContact.id}`,
      fromName: 'Amanda Vance',
      fromEmail: 'amanda.vance@bayer.com',
      contactPhone: '+13145550199',
      subject: 'Flight DL 1492 Delay Update',
      textBody: 'Our VP flight DL 1492 is delayed 35 mins into STL T1.',
      tripId: 'TRP-4201',
      deliveryStatus: 'received',
      isUnread: true,
      timestampMs: baseTs + 4_000,
    }),
    { syncComms: false, skipFirestore: true, skipBroadcast: true }
  );

  await emailService.upsertEmailRecord(
    makeEmailRecord({
      id: 'em_email_only_42',
      threadId: 'thr_email_guest.only@example.com',
      fromName: 'Clara EmailOnly',
      fromEmail: 'guest.only@example.com',
      subject: 'Conference Shuttle Inquiry',
      textBody: 'Requesting quote from Ritz-Carlton Clayton to STL.',
      deliveryStatus: 'received',
      isUnread: true,
      timestampMs: baseTs + 5_500,
    }),
    { syncComms: false, skipFirestore: true, skipBroadcast: true }
  );

  // Simulate CommsHub mounting BEFORE EmailDock: `ensureCommsMirrorSynced()` mirrors emails into CommsThreadService
  await emailService.ensureCommsMirrorSynced();

  // Add Call, Voicemail, SMS, and Internal Note onto Amanda's thread, plus a phone-only SMS thread
  await commsService.recordCommsEvent(
    {
      id: 'CA_42_01',
      channel: 'call',
      direction: 'inbound',
      eventType: 'call_inbound',
      contactPhone: '+13145550199',
      contactName: 'Amanda Vance',
      durationSeconds: 95,
      audioDuration: '1:35',
      snippet: 'Inbound Call (1:35)',
      isUnread: false,
      timestampMs: baseTs + 1_000,
    },
    { skipFirestore: true, skipBroadcast: true }
  );

  await commsService.recordCommsEvent(
    {
      id: 'RE_42_02',
      recordingSid: 'RE_42_02',
      channel: 'voicemail',
      direction: 'inbound',
      eventType: 'voicemail',
      contactPhone: '+13145550199',
      contactName: 'Amanda Vance',
      audioDuration: '0:28',
      transcription: 'Hi, checking on Car 104 for STL Terminal 1.',
      snippet: 'Voicemail: Hi, checking on Car 104...',
      isUnread: true,
      timestampMs: baseTs + 2_000,
    },
    { skipFirestore: true, skipBroadcast: true }
  );

  await commsService.recordCommsEvent(
    {
      id: 'SM_42_03',
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      contactPhone: '+13145550199',
      contactName: 'Amanda Vance',
      snippet: 'Just landed at STL Terminal 1.',
      bodyText: 'Just landed at STL Terminal 1.',
      isUnread: true,
      timestampMs: baseTs + 3_000,
    },
    { skipFirestore: true, skipBroadcast: true }
  );

  await commsService.addInternalNote({
    id: 'NT_42_05',
    phone: '+13145550199',
    email: 'amanda.vance@bayer.com',
    contactName: 'Amanda Vance',
    bodyText: 'Confirmed Marcus (Car #104) staging at STL T1 Exit Door 6.',
    actorName: 'Dispatcher Sarah',
    timestampMs: baseTs + 5_000,
  });

  await commsService.recordCommsEvent(
    {
      id: 'SM_42_PHONE_ONLY',
      channel: 'sms',
      direction: 'inbound',
      eventType: 'sms_inbound',
      contactPhone: '+16365550188',
      contactName: 'Phone Only Rider',
      snippet: 'Need a cab at Chesterfield Mall.',
      isUnread: false,
      timestampMs: baseTs + 2_500,
    },
    { skipFirestore: true, skipBroadcast: true }
  );

  const threads = commsService.getThreads();
  const interactionEvents = commsService.getInteractionEvents();

  // Verify unified conversation rows (Amanda phone+email, Clara email-only, Phone-only rider)
  const convRows = buildUnifiedCommsThreadSummaries(interactionEvents, threads);
  const amandaRow = convRows.find((r) => r.primaryEmail === 'amanda.vance@bayer.com');
  const emailOnlyRow = convRows.find((r) => r.primaryEmail === 'guest.only@example.com');
  const phoneOnlyRow = convRows.find((r) => r.primaryPhone === '+16365550188');

  assert.ok(amandaRow, 'Unified phone+email thread row should exist for Amanda Vance');
  assert.equal(amandaRow.primaryPhone, '+13145550199');
  assert.equal(amandaRow.selectorTarget, '+13145550199');
  assert.deepEqual(amandaRow.channels, ['sms', 'call', 'voicemail', 'email', 'note']);
  assert.equal(amandaRow.unreadCountTotal, 3); // 1 SMS + 1 VM + 1 Email (Internal Note + Call are read)
  assert.deepEqual(amandaRow.unreadByChannel, { sms: 1, call: 0, voicemail: 1, email: 1 });

  assert.ok(emailOnlyRow, 'Email-only thread row should be selectable in SmsThreadPane list');
  assert.equal(emailOnlyRow.primaryPhone, undefined);
  assert.equal(emailOnlyRow.selectorTarget, 'guest.only@example.com');
  assert.deepEqual(emailOnlyRow.channels, ['email']);
  assert.equal(emailOnlyRow.unreadCountTotal, 1);
  assert.equal(
    resolveInteractionSelectorTarget(emailOnlyRow.latestEvent),
    'guest.only@example.com'
  );

  assert.ok(phoneOnlyRow, 'Phone-only thread row should exist');
  assert.equal(phoneOnlyRow.selectorTarget, '+16365550188');
  assert.deepEqual(phoneOnlyRow.channels, ['sms']);

  // Verify chronological timeline interleaving inside Amanda's thread
  const amandaThreadEvents = commsService.getThreadEvents(amandaRow.threadId);
  assert.deepEqual(
    amandaThreadEvents.map((e) => e.channel),
    ['call', 'voicemail', 'sms', 'email', 'note'],
    'Thread timeline must interleave Call -> Voicemail -> SMS -> Email -> Internal Note chronologically'
  );
  const adaptedEmailEvt = commsEventToInteractionEvent(amandaThreadEvents[3], threads[0]);
  assert.equal(adaptedEmailEvt.tripId, 'TRP-4201');

  // Verify All tab channel filter options & filtering across all 6 channels
  assert.deepEqual(
    COMMS_ALL_CHANNEL_FILTER_OPTIONS.map((o) => o.value),
    ['all', 'calls', 'voicemail', 'messages', 'emails', 'notes']
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, { channelFilter: 'all' }).length,
    7
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, { channelFilter: 'calls' }).length,
    1
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, { channelFilter: 'voicemail' }).length,
    1
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, { channelFilter: 'messages' }).length,
    2
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, { channelFilter: 'emails' }).length,
    2
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, { channelFilter: 'notes' }).length,
    1
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, {
      channelFilter: 'all',
      searchQuery: 'guest.only@example.com',
    }).length,
    1
  );
  assert.equal(
    filterCommsInteractionEvents(interactionEvents, {
      channelFilter: 'all',
      searchQuery: 'TRP-4201',
    }).length,
    1
  );

  // Verify Email delivery status badge descriptors
  assert.deepEqual(resolveCommsEmailDeliveryBadge('received', 'inbound'), {
    status: 'received',
    label: 'Received',
    tone: 'slate',
    isWarning: false,
  });
  assert.deepEqual(resolveCommsEmailDeliveryBadge('sent', 'outbound'), {
    status: 'sent',
    label: 'Sent',
    tone: 'blue',
    isWarning: false,
  });
  assert.deepEqual(resolveCommsEmailDeliveryBadge('delivered', 'outbound'), {
    status: 'delivered',
    label: 'Delivered',
    tone: 'emerald',
    isWarning: false,
  });
  assert.equal(resolveCommsEmailDeliveryBadge('bounced', 'outbound').isWarning, true);
  assert.equal(resolveCommsEmailDeliveryBadge('failed', 'outbound').isWarning, true);

  // Verify WorkspaceBus cross-dock routing (`OPEN_EMAIL_MESSAGE` & `OPEN_COMMS_THREAD`)
  const bus = getWorkspaceBus();
  const receivedBusEvents: WorkspaceMessage[] = [];
  const unsubBus = bus.subscribe((msg) => receivedBusEvents.push(msg));

  bus.publish('OPEN_EMAIL_MESSAGE', {
    emailMessageId: 'em_amanda_42',
    threadId: amandaRow.threadId,
    senderEmail: 'amanda.vance@bayer.com',
  });
  bus.publish('FOCUS_MODULE', { moduleKey: 'email' });
  bus.publish('OPEN_COMMS_THREAD', {
    threadId: emailOnlyRow.threadId,
    email: 'guest.only@example.com',
    tab: 'emails',
  });
  unsubBus();

  assert.equal(receivedBusEvents.length, 3);
  assert.equal(receivedBusEvents[0].type, 'OPEN_EMAIL_MESSAGE');
  assert.equal(receivedBusEvents[0].payload.emailMessageId, 'em_amanda_42');
  assert.equal(receivedBusEvents[1].type, 'FOCUS_MODULE');
  assert.equal(receivedBusEvents[1].payload.moduleKey, 'email');
  assert.equal(receivedBusEvents[2].type, 'OPEN_COMMS_THREAD');
  assert.equal(receivedBusEvents[2].payload.email, 'guest.only@example.com');
  console.log('   ✓ Multi-channel thread list, chronological interleaving, channel filters & bus routing verified.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Architectural Guardrails (`constitution.md` & `vercel.json`)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4. Verifying constitution.md bundle boundaries & vercel.json cron schedule...');

  const rootDir = process.cwd();
  const clientFilesToCheck = [
    'app/core/services/comms/comms-templates.service.ts',
    'app/core/services/comms/comms-thread.service.ts',
    'app/core/services/comms/index.ts',
    'app/components/domain/dispatch/CommsHub.tsx',
    'app/components/domain/dispatch/comms/CommsCrmContextBanner.tsx',
    'app/components/domain/dispatch/comms/CommsFilterToolbar.tsx',
    'app/components/domain/dispatch/comms/SmsThreadPane.tsx',
    'app/components/domain/dispatch/comms/SoftphoneDialerPane.tsx',
    'app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx',
    'app/components/domain/dispatch/ClientProfileEditTab.tsx',
    'app/components/domain/dispatch/comms/comms-types.ts',
  ];

  for (const relPath of clientFilesToCheck) {
    const absPath = path.join(rootDir, relPath);
    assert.ok(fs.existsSync(absPath), `Expected file to exist: ${relPath}`);
    const src = fs.readFileSync(absPath, 'utf8');
    assert.equal(
      /from\s+['"][^'"]*\.server['"]/.test(src),
      false,
      `Forbidden *.server import found in client module ${relPath}`
    );
    assert.equal(
      /from\s+['"]node:/.test(src),
      false,
      `Forbidden node:* import found in client module ${relPath}`
    );
  }

  const smsPaneSource = fs.readFileSync(
    path.join(rootDir, 'app/components/domain/dispatch/comms/SmsThreadPane.tsx'),
    'utf8'
  );
  assert.equal(
    smsPaneSource.includes('NEW_SMS_PRESET_CHIPS'),
    false,
    'Static NEW_SMS_PRESET_CHIPS array must be retired in favor of CANNED_DISPATCH_SMS_TEMPLATES'
  );
  assert.equal(
    smsPaneSource.includes('Your cab is 5 minutes away.'),
    false,
    'Hardcoded static SMS template string must be retired in SmsThreadPane.tsx'
  );

  const vercelJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8')
  ) as { crons?: Array<{ path: string; schedule: string }> };
  assert.equal(
    vercelJson.crons?.[0]?.schedule,
    '0 10 * * *',
    'Vercel Hobby cron schedule ("0 10 * * *") must remain untouched'
  );

  console.log('   ✓ Zero *.server / node:* client imports, static chips retired & vercel.json preserved.\n');
  console.log('✅ ALL PHASE 42 COMMS HUB MULTI-CHANNEL VERIFICATION CHECKS PASSED!');
}

runVerification().catch((err) => {
  console.error('❌ Phase 42 verification failed:', err);
  process.exit(1);
});
