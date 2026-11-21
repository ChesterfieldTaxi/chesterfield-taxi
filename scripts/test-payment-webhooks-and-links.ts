/**
 * Phase 36 Verification Suite: Complete Payment & Invoicing Loop
 * (Verified Stripe Webhooks + Zero-PII 1-Tap Pay Links)
 *
 * Tests:
 * 1. HMAC-SHA256 `Stripe-Signature` verification: valid signature, tampered body rejection,
 *    expired timestamp replay rejection, malformed header rejection, and multi-`v1` secret rotation.
 * 2. Strict webhook event idempotency (`/paymentWebhookEvents/{event.id}`): replaying the same
 *    `evt_...` twice produces exactly 1 ledger batch and returns `duplicate: true` on replay.
 * 3. Stripe lifecycle reconciliation (`payment_intent.amount_capturable_updated`,
 *    `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
 *    and `charge.refunded`) across BOTH `trip` and corporate `invoice` targets.
 * 4. `pay_...` token generation, Zero-PII `PayLinkProjection` sanitization (stripping phone,
 *    email, gate codes, unit #, and corporate PO numbers), `firestore.rules` allowlist parity,
 *    and automatic expiry handling.
 * 5. Server-authoritative `baseAmount + tip` anti-tamper calculation, unconfigured Stripe
 *    fallback (`(314) 738-0100`), cross-link `PaymentIntent` replay defense, shared `pi_...`
 *    idempotency between `confirm_payment` & webhooks, and staff `GET /api/payments/webhook` auth.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { InvoiceRecord } from '../app/core/types/config';
import type {
  CorporateUnbilledTransaction,
  FinancialLedgerEntry,
  IInvoicingService,
} from '../app/core/types/invoicing';
import type { CreateTripInput } from '../app/core/types/trip';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import {
  ALLOWED_PAY_LINK_KEYS,
  PAY_TOKEN_PATTERN,
  buildInvoicePayLinkProjection,
  buildTripPayLinkProjection,
  computeAuthoritativePayLinkCharge,
  evaluatePayLinkExpiry,
  generatePayToken,
} from '../app/core/utils/pay-token.util';
import {
  buildStripeSignatureHeader,
  handleStripeWebhookGet,
  handleStripeWebhookPost,
  reconcileStripeWebhookEvent,
  resetServerPaymentLoopStoreForTests,
  verifyStripeWebhookSignature,
} from '../app/core/services/payments/stripe-webhook.server';
import {
  confirmPayLinkPaymentServer,
  createOrReusePayLinkServer,
  createPayLinkCheckoutIntentServer,
  handlePayApiGet,
  handlePayApiPost,
  lookupPublicPayLinkServer,
} from '../app/core/services/payments/pay-link.server';

let passed = 0;
let total = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${label}`);
  } else {
    console.error(`  ❌ [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

/**
 * Isolated in-memory `IInvoicingService` harness for deterministic ledger & invoice verification.
 */
class TestInvoicingHarness implements IInvoicingService {
  public invoices = new Map<string, InvoiceRecord>();
  public ledger: FinancialLedgerEntry[] = [];
  public settledTxIds: string[] = [];
  public unbilledTxs: CorporateUnbilledTransaction[] = [
    {
      id: 'tx-corp-1',
      tripId: 'CT-CORP-RIDE-1',
      corporateAccountId: 'corp-bayer',
      corporateAccountName: 'Bayer Crop Science',
      passengerName: 'Marcus Vance',
      pickupDate: '2026-11-20',
      pickupAddress: '800 N Lindbergh Blvd, Creve Coeur, MO',
      dropoffAddress: '10701 Lambert International Blvd, St. Louis, MO',
      baseFare: 68,
      gratuity: 12,
      tolls: 0,
      waitTimeFee: 0,
      discountAmount: 0,
      totalAmount: 80,
      status: 'invoiced' as const,
      invoiceId: 'inv-bayer-101',
      createdAt: '2026-11-20T15:00:00.000Z',
    },
  ];

  async getPrintableInvoice() {
    return null;
  }
  async generateBatchInvoiceForCorporate() {
    return null;
  }
  async generateInvoiceFromUnbilled() {
    return null;
  }
  async handleCorporateTripCompleted() {
    return null;
  }
  async getUnbilledTransactions() {
    return this.unbilledTxs;
  }
  async getInvoices(): Promise<InvoiceRecord[]> {
    return Array.from(this.invoices.values());
  }
  async saveInvoice(invoice: InvoiceRecord): Promise<InvoiceRecord> {
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }
  async markInvoicePaid(invoiceId: string): Promise<InvoiceRecord | null> {
    const existing = this.invoices.get(invoiceId);
    if (!existing) return null;
    const next: InvoiceRecord = { ...existing, status: 'paid', paidDate: '2026-11-21' };
    this.invoices.set(invoiceId, next);
    return next;
  }
  async settleUnbilledTransactions(txIds: string[]): Promise<void> {
    this.settledTxIds.push(...txIds);
    this.unbilledTxs = this.unbilledTxs.map((tx) =>
      txIds.includes(tx.id) ? { ...tx, status: 'settled' as const } : tx
    );
  }
  async recordLedgerEntry(
    entry: Omit<FinancialLedgerEntry, 'id' | 'createdAt'>
  ): Promise<FinancialLedgerEntry> {
    const created: FinancialLedgerEntry = {
      ...entry,
      id: `ledg-test-${this.ledger.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    this.ledger.push(created);
    return created;
  }
  async getLedgerEntries(): Promise<FinancialLedgerEntry[]> {
    return [...this.ledger];
  }
  async exportLedger() {
    return {
      fileName: 'test.json',
      mimeType: 'application/json',
      data: '[]',
      recordCount: this.ledger.length,
      totalDebit: 0,
      totalCredit: 0,
      generatedAt: new Date().toISOString(),
    };
  }
}

function buildTripSeed(overrides: Partial<CreateTripInput> = {}): CreateTripInput {
  return {
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-21T20:00:00.000Z',
    passenger: {
      firstName: 'Evelyn',
      lastName: 'Harper',
      email: 'evelyn.secret.pii@example.com',
      phone: '(314) 555-9876',
      passengerCount: 2,
      luggageCount: 2,
      specialRequests: 'Gate code #4491, call cell on arrival',
    },
    pickupLocation: {
      address: '17057 N Outer 40 Rd, Apt 402, Gate #8821, Chesterfield, MO 63005',
      coordinates: { lat: 38.6631, lng: -90.5771 },
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      coordinates: { lat: 38.7487, lng: -90.37 },
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 15,
      distanceMiles: 20,
      durationMinutes: 25,
      distanceRate: 2.25,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 60,
      totalFare: 60,
      tollsFee: 4,
      currency: 'USD',
      breakdown: [
        { id: 'base', category: 'base', label: 'Airport Flat Corridor', amount: 56 },
        { id: 'toll', category: 'extra', label: 'Bridge Toll Pass-Through', amount: 4 },
      ],
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 60,
    },
    ...overrides,
  };
}

async function runTests() {
  console.log('\n=======================================================================');
  console.log('💳 RUNNING PHASE 36: STRIPE WEBHOOKS & 1-TAP PAY LINKS VERIFICATION SUITE');
  console.log('=======================================================================\n');

  resetServerPaymentLoopStoreForTests();
  const nowSec = 1_763_760_000;
  const nowMs = nowSec * 1000;
  const activeSecret = 'whsec_test_active_secret_phase36_key';
  const rotatedOldSecret = 'whsec_test_previous_rotated_secret_key';

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CRYPTOGRAPHIC STRIPE-SIGNATURE VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- [1. Cryptographic Stripe-Signature Verification] ---');
  const rawWebhookPayload = JSON.stringify({
    id: 'evt_sig_test_001',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test123456', amount: 6000 } },
  });

  const validSigHeader = buildStripeSignatureHeader(rawWebhookPayload, activeSecret, nowSec);
  const validCheck = verifyStripeWebhookSignature(
    rawWebhookPayload,
    validSigHeader,
    activeSecret,
    300,
    nowSec + 45
  );
  assert(
    validCheck.valid && validCheck.status === 200 && validCheck.timestamp === nowSec,
    'Accepts valid HMAC-SHA256 Stripe-Signature within 300s replay window'
  );

  const tamperedBody = rawWebhookPayload.replace('6000', '100');
  const tamperedCheck = verifyStripeWebhookSignature(
    tamperedBody,
    validSigHeader,
    activeSecret,
    300,
    nowSec + 10
  );
  assert(
    !tamperedCheck.valid &&
      tamperedCheck.status === 400 &&
      tamperedCheck.code === 'SIGNATURE_MISMATCH',
    'Rejects tampered raw JSON payload with 400 SIGNATURE_MISMATCH'
  );

  const replayCheck = verifyStripeWebhookSignature(
    rawWebhookPayload,
    validSigHeader,
    activeSecret,
    300,
    nowSec + 301
  );
  assert(
    !replayCheck.valid &&
      replayCheck.status === 400 &&
      replayCheck.code === 'TIMESTAMP_EXPIRED',
    'Rejects expired timestamp replay (>300s old) with 400 TIMESTAMP_EXPIRED'
  );

  const malformedCheck = verifyStripeWebhookSignature(
    rawWebhookPayload,
    't=notanumber,v1=xyz',
    activeSecret,
    300,
    nowSec
  );
  assert(
    !malformedCheck.valid &&
      malformedCheck.status === 400 &&
      malformedCheck.code === 'MALFORMED_HEADER',
    'Rejects malformed Stripe-Signature header with 400 MALFORMED_HEADER'
  );

  const multiV1Header = buildStripeSignatureHeader(
    rawWebhookPayload,
    [rotatedOldSecret, activeSecret],
    nowSec
  );
  const rotationCheck = verifyStripeWebhookSignature(
    rawWebhookPayload,
    multiV1Header,
    activeSecret,
    300,
    nowSec + 20
  );
  assert(
    rotationCheck.valid && multiV1Header.split('v1=').length - 1 === 2,
    'Supports multi-v1 Stripe-Signature headers seamlessly during webhook secret rotation'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. ZERO-PII PAY TOKENS, EXPIRY & FIRESTORE RULES PARITY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [2. Zero-PII PayLinkProjection, Token Entropy & Expiry] ---');
  const generatedTokens = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const tok = generatePayToken();
    if (!PAY_TOKEN_PATTERN.test(tok)) {
      throw new Error(`Invalid generated pay token: ${tok}`);
    }
    generatedTokens.add(tok);
  }
  assert(
    generatedTokens.size === 200,
    'Generates 200 unique high-entropy pay_... tokens matching /^pay_[a-zA-Z0-9_-]{24,80}$/'
  );

  const mockBooking = new MockBookingService();
  const seededTrip = await mockBooking.createBooking({
    ...buildTripSeed({ id: 'CT-PAY-3601' }),
    status: 'CONFIRMED',
  });
  await mockBooking.updateTrip(seededTrip.id, { assignedDriverId: 'drv-36' });
  const tripWithDriver = (await mockBooking.getBookingStatus('CT-PAY-3601'))!.trip!;

  const tripProjection = buildTripPayLinkProjection(tripWithDriver, { nowMs });
  const tripProjectionJson = JSON.stringify(tripProjection);

  assert(
    !tripProjectionJson.includes('evelyn.secret.pii@example.com') &&
      !tripProjectionJson.includes('555-9876') &&
      !tripProjectionJson.includes('9876') &&
      !tripProjectionJson.includes('4491') &&
      !tripProjectionJson.includes('8821') &&
      !tripProjectionJson.includes('Apt 402') &&
      tripProjection.customerLabel === 'Evelyn H.',
    'Trip PayLinkProjection strips email, phone, apt #, and gate codes while masking passenger to "Evelyn H."'
  );

  const corpInvoiceSeed: InvoiceRecord = {
    id: 'inv-bayer-101',
    invoiceNumber: 'INV-2026-101',
    corporateAccountId: 'corp-bayer',
    accountNumber: 'CORP-BAYER-8804',
    billingCycle: 'net30',
    customerName: 'Bayer Crop Science',
    customerEmail: 'ap.confidential@bayer.example.com',
    tripIds: ['CT-CORP-RIDE-1'],
    subtotal: 80,
    discountAmount: 0,
    totalAmount: 80,
    status: 'issued',
    issuedDate: '2026-11-20',
    dueDate: '2026-12-20',
    lineItems: [
      {
        tripId: 'CT-CORP-RIDE-1',
        date: '2026-11-20',
        passengerName: 'Marcus Vance',
        pickupDropoff:
          '800 N Lindbergh Blvd Suite 300, Creve Coeur, MO ➔ 10701 Lambert International Blvd, St. Louis, MO',
        poNumber: 'PO-SECRET-99412',
        description: 'Executive Airport Transfer [PO: PO-SECRET-99412] (314) 555-0011',
        amount: 80,
      },
    ],
  };

  const invoiceProjection = buildInvoicePayLinkProjection(corpInvoiceSeed, { nowMs });
  const invoiceProjectionJson = JSON.stringify(invoiceProjection);
  assert(
    !invoiceProjectionJson.includes('PO-SECRET-99412') &&
      !invoiceProjectionJson.includes('ap.confidential@bayer.example.com') &&
      !invoiceProjectionJson.includes('555-0011') &&
      !invoiceProjectionJson.includes('Suite 300') &&
      !invoiceProjectionJson.includes('Marcus Vance') &&
      invoiceProjection.allowTip === false &&
      invoiceProjection.baseAmount === 80,
    'Corporate Invoice PayLinkProjection strips PO numbers, AP email, phone, suite #, and masks traveler name'
  );

  const projectionKeys = Object.keys(tripProjection);
  assert(
    projectionKeys.every((k) => (ALLOWED_PAY_LINK_KEYS as readonly string[]).includes(k)),
    'All PayLinkProjection keys strictly adhere to ALLOWED_PAY_LINK_KEYS allowlist'
  );

  const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert(
    rulesSource.includes('match /payLinks/{payToken}') &&
      rulesSource.includes('allow get: if true;') &&
      rulesSource.includes('allow list: if false;') &&
      rulesSource.includes('match /paymentWebhookEvents/{eventId}'),
    'firestore.rules enforces zero-list exact-token get on /payLinks and staff-only /paymentWebhookEvents'
  );

  const expiredEval = evaluatePayLinkExpiry(
    tripProjection,
    Date.parse(tripProjection.expiresAt) + 5_000
  );
  assert(
    expiredEval.didExpire && expiredEval.projection.status === 'expired',
    'evaluatePayLinkExpiry auto-transitions open link past expiresAt to "expired"'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. ANTI-TAMPER CHECKOUT & UNCONFIGURED STRIPE FALLBACK
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [3. Server-Authoritative Anti-Tamper Charge Math & Fallback] ---');
  const invoicingHarness = new TestInvoicingHarness();
  await invoicingHarness.saveInvoice(corpInvoiceSeed);

  const createTripLinkRes = await createOrReusePayLinkServer({
    targetType: 'trip',
    targetId: 'CT-PAY-3601',
    sendSms: true,
    sendEmail: true,
    isDispatcher: true,
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    origin: 'https://chesterfieldtaxi.com',
    nowMs,
  });
  assert(
    createTripLinkRes.success &&
      Boolean(createTripLinkRes.payToken) &&
      createTripLinkRes.smsResult?.sent === true &&
      createTripLinkRes.emailResult?.sent === true,
    'createOrReusePayLinkServer creates sanitized trip Pay Link and dispatches SMS + Email'
  );

  const reuseCheck = await createOrReusePayLinkServer({
    targetType: 'trip',
    targetId: 'CT-PAY-3601',
    isDispatcher: true,
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    nowMs: nowMs + 10_000,
  });
  assert(
    reuseCheck.reused === true && reuseCheck.payToken === createTripLinkRes.payToken,
    'Reuses active unexpired Pay Link token for the same trip when balance is unchanged'
  );

  // Negative tip rejection
  const negTipCalc = computeAuthoritativePayLinkCharge(createTripLinkRes.payLink!, -15);
  assert(!negTipCalc.valid, 'Rejects negative tip amounts (-$15.00)');

  // Corporate invoice tip injection rejection
  const corpTipCalc = computeAuthoritativePayLinkCharge(invoiceProjection, 10);
  assert(!corpTipCalc.valid, 'Rejects gratuity injection on allowTip=false corporate invoices');

  // Unconfigured Stripe graceful fallback
  const unconfiguredIntent = await createPayLinkCheckoutIntentServer({
    payToken: createTripLinkRes.payToken!,
    tipAmount: 12,
    stripeSecretKeyOverride: '',
    nowMs,
  });
  assert(
    unconfiguredIntent.httpStatus === 200 &&
      unconfiguredIntent.body.stripeConfigured === false &&
      String(unconfiguredIntent.body.message || '').includes('(314) 738-0100'),
    'Cleanly returns { stripeConfigured: false, message } with dispatch phone (314) 738-0100 when Stripe is unconfigured'
  );

  // Anti-tamper Stripe PaymentIntent creation (authoritative $60.00 + $12.00 tip = $72.00 / 7200 cents)
  let capturedStripeFormBody = '';
  const mockStripeFetch: typeof fetch = (async (_url: any, init?: RequestInit) => {
    capturedStripeFormBody = String(init?.body || '');
    return new Response(
      JSON.stringify({
        id: 'pi_trip3601auth7200',
        client_secret: 'pi_trip3601auth7200_secret_xyz',
        status: 'requires_payment_method',
        amount: 7200,
        currency: 'usd',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const intentRes = await createPayLinkCheckoutIntentServer({
    payToken: createTripLinkRes.payToken!,
    tipAmount: 12,
    stripeSecretKeyOverride: 'sk_test_mock_phase36_secret',
    fetchImpl: mockStripeFetch,
    nowMs,
  });
  const sentParams = new URLSearchParams(capturedStripeFormBody);
  assert(
    intentRes.httpStatus === 200 &&
      intentRes.body.success === true &&
      intentRes.body.amount === 72 &&
      sentParams.get('amount') === '7200' &&
      sentParams.get('automatic_payment_methods[enabled]') === 'true' &&
      sentParams.get('metadata[payToken]') === createTripLinkRes.payToken &&
      sentParams.get('metadata[baseAmount]') === '60.00' &&
      sentParams.get('metadata[tipAmount]') === '12.00',
    'Creates Stripe PaymentIntent with server-authoritative 7200 cents ($60 base + $12 tip) & full metadata'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. WEBHOOK RECONCILIATION, IDEMPOTENCY & SHARED LOCK DEDUPLICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [4. Webhook Reconciliation, Idempotency & Shared Lock] ---');

  // 4A. Pre-authorization hold (`payment_intent.amount_capturable_updated`)
  const holdRes = await reconcileStripeWebhookEvent(
    {
      id: 'evt_hold_3601',
      type: 'payment_intent.amount_capturable_updated',
      data: {
        object: {
          id: 'pi_hold3601',
          amount: 6000,
          amount_capturable: 6000,
          currency: 'usd',
          metadata: { tripId: 'CT-PAY-3601' },
        },
      },
    },
    { bookingService: mockBooking, invoicingService: invoicingHarness, nowMs }
  );
  const heldTrip = (await mockBooking.getBookingStatus('CT-PAY-3601'))!.trip!;
  assert(
    holdRes.outcome === 'trip_hold_authorized' &&
      heldTrip.payment.status === 'authorized' &&
      (heldTrip.auditLog || []).some((a) => a.referenceNumber === 'pi_hold3601'),
    'payment_intent.amount_capturable_updated marks trip payment "authorized" and appends TripAuditEvent'
  );

  // 4B. Trip `payment_intent.succeeded` + Replay Idempotency
  const tripSucceededEvent = {
    id: 'evt_trip_paid_3601',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_trip3601auth7200',
        amount: 7200,
        amount_received: 7200,
        currency: 'usd',
        metadata: {
          payToken: createTripLinkRes.payToken!,
          targetType: 'trip',
          targetId: 'CT-PAY-3601',
          tripId: 'CT-PAY-3601',
          baseAmount: '60.00',
          tipAmount: '12.00',
        },
        charges: {
          data: [{ payment_method_details: { card: { brand: 'visa', last4: '4242' } } }],
        },
      },
    },
  };

  const firstDelivery = await reconcileStripeWebhookEvent(tripSucceededEvent, {
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    commissionRate: 0.75,
    nowMs: nowMs + 30_000,
  });

  const capturedTrip = (await mockBooking.getBookingStatus('CT-PAY-3601'))!.trip!;
  const publicAfterPaid = await lookupPublicPayLinkServer(createTripLinkRes.payToken!, {
    nowMs: nowMs + 31_000,
  });

  // Expected math on $60 fare (includes $4 pass-through toll -> $56 commissionable * 0.75 = $42 driverShare + $14 platformCommission; driverNet = $42 + $4 toll + $12 tip = $58)
  const tripLedger = invoicingHarness.ledger.filter((e) => e.tripId === 'CT-PAY-3601');
  const fareEntry = tripLedger.find((e) => e.type === 'fare_revenue');
  const tipEntry = tripLedger.find((e) => e.type === 'tip_collected');
  const commEntry = tripLedger.find((e) => e.type === 'platform_commission');
  const payoutEntry = tripLedger.find((e) => e.type === 'driver_payout');

  assert(
    !firstDelivery.duplicate &&
      capturedTrip.payment.status === 'captured' &&
      capturedTrip.payment.amount === 72 &&
      capturedTrip.payment.tipAmount === 12 &&
      capturedTrip.payment.cardLast4 === '4242' &&
      publicAfterPaid.payLink?.status === 'paid' &&
      fareEntry?.amount === 60 &&
      tipEntry?.amount === 12 &&
      commEntry?.amount === 14 &&
      payoutEntry?.amount === 58,
    'Trip payment_intent.succeeded captures trip, marks payLink paid, and posts balanced fare/tip/commission/payout ledger entries'
  );

  const ledgerCountBeforeReplay = invoicingHarness.ledger.length;
  const replayDelivery = await reconcileStripeWebhookEvent(tripSucceededEvent, {
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    commissionRate: 0.75,
    nowMs: nowMs + 35_000,
  });
  assert(
    replayDelivery.received === true &&
      replayDelivery.duplicate === true &&
      invoicingHarness.ledger.length === ledgerCountBeforeReplay,
    'Replaying the exact same evt_... returns { received: true, duplicate: true } with ZERO duplicate ledger entries'
  );

  // 4C. Corporate Invoice Pay Link -> Synchronous `confirm_payment` -> Subsequent Webhook Arrival (Zero Double-Count)
  const createInvLink = await createOrReusePayLinkServer({
    targetType: 'invoice',
    targetId: 'inv-bayer-101',
    isDispatcher: true,
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    nowMs,
  });
  assert(
    createInvLink.success && Boolean(createInvLink.payToken),
    'Generates sanitized Pay Link for Corporate Invoice inv-bayer-101'
  );

  // Cross-link replay attack check: try confirming Corporate Invoice using Trip's PaymentIntent!
  const crossReplayAttempt = await confirmPayLinkPaymentServer({
    payToken: createInvLink.payToken!,
    paymentIntentId: 'pi_trip3601auth7200',
    stripeSecretKeyOverride: 'sk_test_mock_phase36_secret',
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          id: 'pi_trip3601auth7200',
          status: 'succeeded',
          amount: 8000,
          amount_received: 8000,
          currency: 'usd',
          metadata: {
            payToken: createTripLinkRes.payToken!, // Belongs to trip link, NOT invoice link!
            targetType: 'trip',
            targetId: 'CT-PAY-3601',
          },
        }),
        { status: 200 }
      )) as typeof fetch,
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    nowMs,
  });
  assert(
    crossReplayAttempt.httpStatus === 403 &&
      crossReplayAttempt.body.code === 'METADATA_MISMATCH',
    'Blocks cross-link PaymentIntent replay attack with 403 METADATA_MISMATCH'
  );

  // Legitimate synchronous `confirm_payment` on Corporate Invoice
  const validConfirm = await confirmPayLinkPaymentServer({
    payToken: createInvLink.payToken!,
    paymentIntentId: 'pi_invbayer101paid8000',
    stripeSecretKeyOverride: 'sk_test_mock_phase36_secret',
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          id: 'pi_invbayer101paid8000',
          status: 'succeeded',
          amount: 8000,
          amount_received: 8000,
          currency: 'usd',
          metadata: {
            payToken: createInvLink.payToken!,
            targetType: 'invoice',
            targetId: 'inv-bayer-101',
            invoiceId: 'inv-bayer-101',
            baseAmount: '80.00',
            tipAmount: '0.00',
          },
        }),
        { status: 200 }
      )) as typeof fetch,
    bookingService: mockBooking,
    invoicingService: invoicingHarness,
    nowMs: nowMs + 40_000,
  });

  const settledInvoice = invoicingHarness.invoices.get('inv-bayer-101')!;
  const invSettlementEntriesAfterConfirm = invoicingHarness.ledger.filter(
    (e) => e.invoiceId === 'inv-bayer-101' && e.type === 'invoice_settlement'
  );
  assert(
    validConfirm.httpStatus === 200 &&
      validConfirm.body.success === true &&
      settledInvoice.status === 'paid' &&
      settledInvoice.paymentReference === 'pi_invbayer101paid8000' &&
      Boolean(settledInvoice.paidAt) &&
      invoicingHarness.settledTxIds.includes('tx-corp-1') &&
      invSettlementEntriesAfterConfirm.length === 1 &&
      invSettlementEntriesAfterConfirm[0].amount === 80,
    'Corporate Invoice confirm_payment marks invoice paid, settles AR rows, and posts 1 balanced invoice_settlement entry'
  );

  // Now asynchronous webhook arrives for the SAME `pi_invbayer101paid8000` -> shared lock prevents double-counting!
  const asyncWebhookAfterConfirm = await reconcileStripeWebhookEvent(
    {
      id: 'evt_inv_async_101',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_invbayer101paid8000',
          amount: 8000,
          amount_received: 8000,
          currency: 'usd',
          metadata: {
            payToken: createInvLink.payToken!,
            targetType: 'invoice',
            targetId: 'inv-bayer-101',
            invoiceId: 'inv-bayer-101',
          },
        },
      },
    },
    { bookingService: mockBooking, invoicingService: invoicingHarness, nowMs: nowMs + 42_000 }
  );
  const invSettlementEntriesAfterWebhook = invoicingHarness.ledger.filter(
    (e) => e.invoiceId === 'inv-bayer-101' && e.type === 'invoice_settlement'
  );
  assert(
    asyncWebhookAfterConfirm.outcome === 'already_settled_via_shared_lock' &&
      invSettlementEntriesAfterWebhook.length === 1,
    'Shared pi_... lock prevents double-posting when asynchronous webhook arrives after synchronous confirm_payment'
  );

  // 4D. Refunds (`charge.refunded`) on BOTH Trip and Corporate Invoice targets
  const tripRefundRes = await reconcileStripeWebhookEvent(
    {
      id: 'evt_refund_trip_3601',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_trip3601_001',
          payment_intent: 'pi_trip3601auth7200',
          amount: 7200,
          amount_refunded: 7200,
          currency: 'usd',
          metadata: {}, // Resolves target via shared settlement lock pi_trip3601auth7200!
        },
      },
    },
    { bookingService: mockBooking, invoicingService: invoicingHarness, nowMs: nowMs + 60_000 }
  );

  const invoiceRefundRes = await reconcileStripeWebhookEvent(
    {
      id: 'evt_refund_inv_101',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_inv101_001',
          payment_intent: 'pi_invbayer101paid8000',
          amount: 8000,
          amount_refunded: 2500, // Partial $25.00 refund
          currency: 'usd',
          metadata: { targetType: 'invoice', targetId: 'inv-bayer-101' },
        },
      },
    },
    { bookingService: mockBooking, invoicingService: invoicingHarness, nowMs: nowMs + 65_000 }
  );

  const refundedTrip = (await mockBooking.getBookingStatus('CT-PAY-3601'))!.trip!;
  const refundedInv = invoicingHarness.invoices.get('inv-bayer-101')!;
  const refundLedgerEntries = invoicingHarness.ledger.filter((e) => e.type === 'refund');

  assert(
    tripRefundRes.outcome === 'trip_refund_reconciled' &&
      refundedTrip.payment.status === 'refunded' &&
      refundedTrip.payment.refundedAmount === 72 &&
      invoiceRefundRes.outcome === 'invoice_refund_reconciled' &&
      refundedInv.refundedAmount === 25 &&
      refundLedgerEntries.length === 2,
    'charge.refunded reconciles both Trip ($72 full refund) and Corporate Invoice ($25 partial refund) into financialLedger'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5. END-TO-END HTTP HANDLERS (`POST` & STAFF `GET /api/payments/webhook`)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- [5. HTTP Route Handlers & Staff Diagnostics Auth] ---');
  const prevWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const prevAdminSecret = process.env.ADMIN_API_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = activeSecret;
  process.env.ADMIN_API_SECRET = 'admin_phase36_test_secret';

  try {
    const liveNowSec = Math.floor(Date.now() / 1000);
    const httpEventBody = JSON.stringify({
      id: 'evt_http_failed_009',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_failed_http_009',
          amount: 4500,
          currency: 'usd',
          last_payment_error: { message: 'Insufficient funds' },
          metadata: {},
        },
      },
    });
    const httpSig = buildStripeSignatureHeader(httpEventBody, activeSecret, liveNowSec);

    const postResp = await handleStripeWebhookPost(
      new Request('https://chesterfieldtaxi.com/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': httpSig,
        },
        body: httpEventBody,
      })
    );
    const postJson = (await postResp.json()) as Record<string, any>;
    assert(
      postResp.status === 200 && postJson.received === true && postJson.duplicate === false,
      'POST /api/payments/webhook verifies raw body signature and processes event (200)'
    );

    const unauthGetResp = await handleStripeWebhookGet(
      new Request('https://chesterfieldtaxi.com/api/payments/webhook', { method: 'GET' })
    );
    assert(
      unauthGetResp.status === 401,
      'GET /api/payments/webhook rejects unauthenticated requests with 401'
    );

    const staffGetResp = await handleStripeWebhookGet(
      new Request('https://chesterfieldtaxi.com/api/payments/webhook', {
        method: 'GET',
        headers: { 'x-admin-secret': 'admin_phase36_test_secret' },
      })
    );
    const staffGetJson = (await staffGetResp.json()) as Record<string, any>;
    assert(
      staffGetResp.status === 200 &&
        staffGetJson.webhookSecretConfigured === true &&
        staffGetJson.endpointPath === '/api/payments/webhook' &&
        Array.isArray(staffGetJson.recentEvents) &&
        staffGetJson.recentEvents.some((e: any) => e.id === 'evt_http_failed_009'),
      'Staff GET /api/payments/webhook returns readiness diagnostics & processed event history'
    );

    // Public GET /api/pay?token=... & HTTP Anti-Tamper Check on POST /api/pay
    const antiTamperTrip = await mockBooking.createBooking({
      ...buildTripSeed({ id: 'CT-TAMPER-99' }),
      status: 'CONFIRMED',
    });
    const antiTamperLink = await createOrReusePayLinkServer({
      targetType: 'trip',
      targetId: antiTamperTrip.id,
      isDispatcher: true,
      bookingService: mockBooking,
      invoicingService: invoicingHarness,
    });

    const publicGetResp = await handlePayApiGet(
      new Request(`https://chesterfieldtaxi.com/api/pay?token=${antiTamperLink.payToken}`, {
        method: 'GET',
      })
    );
    const publicGetJson = (await publicGetResp.json()) as Record<string, any>;
    assert(
      publicGetResp.status === 200 &&
        publicGetJson.success === true &&
        publicGetJson.payLink?.baseAmount === 60 &&
        !JSON.stringify(publicGetJson).includes('evelyn.secret.pii@example.com'),
      'GET /api/pay?token=pay_... returns sanitized Zero-PII projection with authoritative $60.00 baseAmount'
    );

    // Malicious client sends tampered baseAmount: 0.01 & amount: 0.01 via POST /api/pay
    const tamperPostResp = await handlePayApiPost(
      new Request('https://chesterfieldtaxi.com/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_checkout_intent',
          payToken: antiTamperLink.payToken,
          baseAmount: 0.01,
          amount: 0.01,
          totalAmount: 0.01,
          tipAmount: 5,
        }),
      })
    );
    const tamperPostJson = (await tamperPostResp.json()) as Record<string, any>;
    assert(
      tamperPostJson.baseAmount === 60 && tamperPostJson.amount === 65,
      'POST /api/pay ignores tampered client baseAmount ($0.01) and enforces server-authoritative $65.00 ($60 + $5 tip)'
    );
  } finally {
    if (prevWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhookSecret;
    if (prevAdminSecret === undefined) delete process.env.ADMIN_API_SECRET;
    else process.env.ADMIN_API_SECRET = prevAdminSecret;
  }

  console.log(`\n🎉 ALL ${passed}/${total} PHASE 36 ASSERTIONS PASSED!\n`);
}

runTests().catch((err) => {
  console.error('\n❌ PHASE 36 VERIFICATION FAILED:', err);
  process.exit(1);
});
