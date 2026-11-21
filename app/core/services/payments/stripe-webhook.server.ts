/**
 * Server-Isolated Verified Stripe Webhook & Payment Reconciliation Engine (`stripe-webhook.server.ts`)
 *
 * Strictly server-only (`*.server.ts`): uses `node:crypto` HMAC-SHA256 + `crypto.timingSafeEqual`
 * and never enters client bundles.
 *
 * Capabilities:
 * 1. Raw-body `Stripe-Signature` verification (`verifyStripeWebhookSignature`) with multi-`v1`
 *    secret rotation support and configurable timestamp replay protection (`toleranceSeconds = 300`).
 * 2. Strict event-level idempotency via `/paymentWebhookEvents/{event.id}` (Firestore REST +
 *    server memory cache) returning `{ received: true, duplicate: true }` on replays.
 * 3. Shared settlement-level idempotency (`pi_${paymentIntentId}`) shared with `/api/pay`
 *    `confirm_payment` so synchronous UI confirmations and asynchronous Stripe webhooks
 *    NEVER double-post ledger entries or double-settle trips/invoices.
 * 4. Automated reconciliation across `payment_intent.amount_capturable_updated`,
 *    `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
 *    and `charge.refunded`.
 * 5. Authenticated staff `GET /api/payments/webhook` diagnostics loader.
 */

import crypto from 'node:crypto';
import type { InvoiceRecord } from '../../types/config';
import type { FinancialLedgerEntry } from '../../types/invoicing';
import type { Trip, TripAuditEvent } from '../../types/trip';
import {
  buildPayReceiptNumber,
  isValidPayToken,
  sanitizePayLinkProjection,
  type PayLinkProjection,
} from '../../utils/pay-token.util';
import {
  fetchFirestoreDocumentRest,
  parseFirestoreRestFields,
  verifyServerRequestAuth,
} from '../auth/server-auth.server';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { getAdminConfigService } from '../config/admin-config.service';
import { getResolvedFirebaseConfig, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { getInvoicingService } from '../invoicing.service';
import type { IInvoicingService } from '../../types/invoicing';
import { formatLocalDateStr } from '../pricing/vehicle-matching';

export const SUBSCRIBED_STRIPE_WEBHOOK_EVENTS = [
  'payment_intent.amount_capturable_updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.refunded',
] as const;

export type SubscribedStripeEventType = (typeof SUBSCRIBED_STRIPE_WEBHOOK_EVENTS)[number];

export interface StripeWebhookSignatureResult {
  valid: boolean;
  status: number;
  timestamp?: number;
  code?: 'MISSING_SECRET' | 'MISSING_HEADER' | 'MALFORMED_HEADER' | 'TIMESTAMP_EXPIRED' | 'SIGNATURE_MISMATCH';
  error?: string;
}

export interface StripeWebhookEventPayload {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  data: {
    object: Record<string, any>;
  };
}

export interface ProcessedWebhookEventRecord {
  id: string;
  eventType: string;
  paymentIntentId?: string;
  chargeId?: string;
  targetType?: 'trip' | 'invoice';
  targetId?: string;
  payToken?: string;
  amount?: number;
  currency?: string;
  outcome: string;
  livemode: boolean;
  processedAt: string;
}

export interface PaymentSettlementLockRecord {
  lockId: string; // pi_${paymentIntentId}
  paymentIntentId: string;
  targetType: 'trip' | 'invoice';
  targetId: string;
  payToken?: string;
  baseAmount: number;
  tipAmount: number;
  totalAmount: number;
  receiptNumber: string;
  cardBrand?: string;
  cardLast4?: string;
  settledAt: string;
  ledgerEntryIds: string[];
}

interface ServerPaymentLoopStore {
  webhookEvents: Map<string, ProcessedWebhookEventRecord>;
  settlementLocks: Map<string, PaymentSettlementLockRecord>;
  payLinks: Map<string, PayLinkProjection>;
  payLinkTokenByTarget: Map<string, string>; // `${targetType}:${targetId}` -> payToken
}

const paymentLoopStore: ServerPaymentLoopStore = ((globalThis as any).__ct_payment_loop_store ||= {
  webhookEvents: new Map<string, ProcessedWebhookEventRecord>(),
  settlementLocks: new Map<string, PaymentSettlementLockRecord>(),
  payLinks: new Map<string, PayLinkProjection>(),
  payLinkTokenByTarget: new Map<string, string>(),
});

export function getServerPaymentLoopStore(): ServerPaymentLoopStore {
  return paymentLoopStore;
}

export function resetServerPaymentLoopStoreForTests(): void {
  paymentLoopStore.webhookEvents.clear();
  paymentLoopStore.settlementLocks.clear();
  paymentLoopStore.payLinks.clear();
  paymentLoopStore.payLinkTokenByTarget.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Service Account Firestore REST Helpers (Optional Privileged Write Mode)
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceAccountShape {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

let cachedDatastoreToken: { token: string; expiresAt: number } | null = null;

export async function getServiceAccountDatastoreToken(): Promise<string | null> {
  if (cachedDatastoreToken && Date.now() < cachedDatastoreToken.expiresAt - 60_000) {
    return cachedDatastoreToken.token;
  }

  const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawSa) return null;

  try {
    const sa = JSON.parse(rawSa) as ServiceAccountShape;
    if (!sa.client_email || !sa.private_key) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimB64 = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      })
    ).toString('base64url');

    const unsigned = `${headerB64}.${claimB64}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const sig = signer.sign(sa.private_key, 'base64url');

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${sig}`,
      }).toString(),
    });

    if (!resp.ok) return null;
    const json = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedDatastoreToken = {
      token: json.access_token,
      expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
    };
    return json.access_token;
  } catch {
    return null;
  }
}

export function encodeFirestoreRestValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => encodeFirestoreRestValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreRestValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export async function patchFirestoreDocumentRest(
  collectionPath: string,
  docId: string,
  payload: Record<string, unknown>,
  bearerToken?: string,
  replaceFullDoc: boolean = false
): Promise<boolean> {
  const { projectId } = getResolvedFirebaseConfig();
  if (!projectId || !docId || !bearerToken || !isFirebaseConfigured()) return false;

  const clean = sanitizePayload(payload) as Record<string, unknown>;
  const keys = Object.keys(clean).filter((k) => clean[k] !== undefined);
  if (keys.length === 0) return true;

  const encodedDoc = docId.split('/').map(encodeURIComponent).join('/');
  const maskQuery = replaceFullDoc
    ? ''
    : `?${keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')}`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${collectionPath}/${encodedDoc}${maskQuery}`;

  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    fields[key] = encodeFirestoreRestValue(clean[key]);
  }

  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function listFirestoreCollectionRest<T>(
  collectionPath: string,
  bearerToken?: string,
  pageSize: number = 50
): Promise<T[] | null> {
  const { projectId } = getResolvedFirebaseConfig();
  if (!projectId || !bearerToken || !isFirebaseConfigured()) return null;

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${encodeURIComponent(collectionPath)}?pageSize=${pageSize}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      documents?: Array<{ name?: string; fields?: Record<string, unknown> }>;
    };
    if (!Array.isArray(json.documents)) return [];
    return json.documents.map((d) => {
      const parsed = parseFirestoreRestFields(d.fields as Record<string, any>);
      const docId = d.name?.split('/').pop() || '';
      return {
        ...parsed,
        id: parsed.id || docId,
      } as T;
    });
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cryptographic Stripe-Signature Verification (HMAC-SHA256 + timingSafeEqual)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies Stripe's `Stripe-Signature` header against the raw unparsed request body:
 * - Parses `t=<unix_seconds>` and one or more `v1=<hex_hmac_sha256>` signatures
 *   (supporting active webhook signing secret rotation).
 * - Rejects missing/malformed headers or timestamps outside `toleranceSeconds` (`400`).
 * - Computes `HMAC-SHA256(webhookSecret, "${timestamp}.${rawBody}")` and checks
 *   every `v1` candidate using constant-time `crypto.timingSafeEqual`.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookSecret: string | null | undefined,
  toleranceSeconds: number = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): StripeWebhookSignatureResult {
  const cleanSecret = String(webhookSecret || '').trim();
  if (!cleanSecret) {
    return {
      valid: false,
      status: 503,
      code: 'MISSING_SECRET',
      error: 'STRIPE_WEBHOOK_SECRET is not configured on the server.',
    };
  }

  if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
    return {
      valid: false,
      status: 400,
      code: 'MISSING_HEADER',
      error: 'Missing Stripe-Signature header.',
    };
  }

  let timestampStr = '';
  const v1Signatures: string[] = [];

  for (const rawPart of signatureHeader.split(',')) {
    const part = rawPart.trim();
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key === 't' && !timestampStr) {
      timestampStr = value;
    } else if (key === 'v1' && /^[a-fA-F0-9]{64}$/.test(value)) {
      v1Signatures.push(value.toLowerCase());
    }
  }

  if (!timestampStr || !/^\d+$/.test(timestampStr) || v1Signatures.length === 0) {
    return {
      valid: false,
      status: 400,
      code: 'MALFORMED_HEADER',
      error: 'Malformed Stripe-Signature header (expected t=<timestamp>,v1=<hex_hmac>).',
    };
  }

  const timestamp = Number(timestampStr);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return {
      valid: false,
      status: 400,
      code: 'MALFORMED_HEADER',
      error: 'Invalid timestamp in Stripe-Signature header.',
    };
  }

  if (toleranceSeconds > 0 && Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return {
      valid: false,
      status: 400,
      timestamp,
      code: 'TIMESTAMP_EXPIRED',
      error: `Stripe webhook timestamp outside allowable ${toleranceSeconds}s replay tolerance window.`,
    };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedDigest = crypto
    .createHmac('sha256', cleanSecret)
    .update(signedPayload, 'utf8')
    .digest();

  let signatureMatched = false;
  for (const candidateHex of v1Signatures) {
    const candidateBuf = Buffer.from(candidateHex, 'hex');
    if (
      candidateBuf.length === expectedDigest.length &&
      crypto.timingSafeEqual(candidateBuf, expectedDigest)
    ) {
      signatureMatched = true;
    }
  }

  if (!signatureMatched) {
    return {
      valid: false,
      status: 400,
      timestamp,
      code: 'SIGNATURE_MISMATCH',
      error: 'Stripe webhook HMAC-SHA256 signature verification failed.',
    };
  }

  return {
    valid: true,
    status: 200,
    timestamp,
  };
}

/**
 * Helper for tests & webhook simulation: builds a valid `Stripe-Signature` header.
 */
export function buildStripeSignatureHeader(
  rawBody: string,
  secrets: string | string[],
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const secretList = Array.isArray(secrets) ? secrets : [secrets];
  const v1Parts = secretList.map((sec) => {
    const hex = crypto
      .createHmac('sha256', sec)
      .update(`${timestampSeconds}.${rawBody}`, 'utf8')
      .digest('hex');
    return `v1=${hex}`;
  });
  return [`t=${timestampSeconds}`, ...v1Parts].join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Shared Payment Settlement & Webhook Reconciliation Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentReconciliationDependencies {
  bookingService?: IBookingService;
  invoicingService?: IInvoicingService;
  bearerToken?: string;
  commissionRate?: number;
  nowMs?: number;
}

function extractCardMetadata(stripeObj: Record<string, any>): {
  cardBrand?: string;
  cardLast4?: string;
} {
  const chargeCard =
    stripeObj?.charges?.data?.[0]?.payment_method_details?.card ||
    stripeObj?.payment_method_details?.card ||
    stripeObj?.card;
  const cardBrand =
    typeof chargeCard?.brand === 'string' && chargeCard.brand.trim()
      ? chargeCard.brand.trim().toLowerCase()
      : undefined;
  const cardLast4 =
    typeof chargeCard?.last4 === 'string' && /^\d{4}$/.test(chargeCard.last4.trim())
      ? chargeCard.last4.trim()
      : undefined;
  return { cardBrand, cardLast4 };
}

async function resolvePayLinkServerRecord(
  payToken: string,
  bearerToken?: string
): Promise<PayLinkProjection | null> {
  if (!isValidPayToken(payToken)) return null;
  const inMem = paymentLoopStore.payLinks.get(payToken);
  if (isFirebaseConfigured()) {
    const remote = await fetchFirestoreDocumentRest('payLinks', payToken, bearerToken);
    if (remote && remote.payToken) {
      const cleanRemote = sanitizePayLinkProjection(remote);
      if (!inMem || cleanRemote.updatedAt >= inMem.updatedAt || cleanRemote.status === 'paid') {
        paymentLoopStore.payLinks.set(payToken, cleanRemote);
        paymentLoopStore.payLinkTokenByTarget.set(
          `${cleanRemote.targetType}:${cleanRemote.targetId}`,
          payToken
        );
        return cleanRemote;
      }
    }
  }
  return inMem || null;
}

async function savePayLinkServerRecord(
  projection: PayLinkProjection,
  bearerToken?: string
): Promise<PayLinkProjection> {
  const clean = sanitizePayLinkProjection(projection);
  paymentLoopStore.payLinks.set(clean.payToken, clean);
  paymentLoopStore.payLinkTokenByTarget.set(`${clean.targetType}:${clean.targetId}`, clean.payToken);
  if (bearerToken) {
    await patchFirestoreDocumentRest(
      'payLinks',
      clean.payToken,
      clean as unknown as Record<string, unknown>,
      bearerToken,
      true
    );
  }
  return clean;
}

async function loadTripRecord(
  tripId: string,
  bookingService: IBookingService,
  bearerToken?: string
): Promise<Trip | null> {
  if (!tripId) return null;
  if (bearerToken && isFirebaseConfigured()) {
    const doc = await fetchFirestoreDocumentRest('trips', tripId, bearerToken);
    if (doc && (doc.id || doc.pickupLocation)) {
      return { ...(doc as any), id: doc.id || tripId } as Trip;
    }
  }
  const statusRes = await bookingService.getBookingStatus(tripId).catch(() => null);
  return statusRes?.trip || null;
}

async function saveTripPatch(
  tripId: string,
  currentTrip: Trip | null,
  updates: Partial<Trip>,
  bookingService: IBookingService,
  bearerToken?: string
): Promise<Trip | null> {
  if (bearerToken && isFirebaseConfigured()) {
    await patchFirestoreDocumentRest(
      'trips',
      tripId,
      updates as Record<string, unknown>,
      bearerToken,
      false
    );
  }
  if (bookingService.updateTrip && currentTrip) {
    return await bookingService.updateTrip(tripId, updates).catch(() => ({
      ...currentTrip,
      ...updates,
    }));
  }
  return currentTrip ? { ...currentTrip, ...updates } : null;
}

async function loadInvoiceRecord(
  invoiceId: string,
  invoicingService: IInvoicingService,
  bearerToken?: string
): Promise<InvoiceRecord | null> {
  if (!invoiceId) return null;
  if (bearerToken && isFirebaseConfigured()) {
    const doc = await fetchFirestoreDocumentRest('invoices', invoiceId, bearerToken);
    if (doc && (doc.id || doc.invoiceNumber)) {
      return { ...(doc as any), id: doc.id || invoiceId } as InvoiceRecord;
    }
  }
  if (invoicingService.getInvoices) {
    const all = await invoicingService.getInvoices();
    const hit = all.find((i) => i.id === invoiceId);
    if (hit) return hit;
  }
  return null;
}

async function saveInvoiceRecord(
  invoice: InvoiceRecord,
  invoicingService: IInvoicingService,
  bearerToken?: string
): Promise<InvoiceRecord> {
  if (bearerToken && isFirebaseConfigured()) {
    await patchFirestoreDocumentRest(
      'invoices',
      invoice.id,
      invoice as unknown as Record<string, unknown>,
      bearerToken,
      false
    );
  }
  if (invoicingService.saveInvoice) {
    await invoicingService.saveInvoice(invoice).catch(() => invoice);
  }
  return invoice;
}

async function recordServerLedgerEntry(
  deterministicId: string,
  entry: Omit<FinancialLedgerEntry, 'id' | 'createdAt'>,
  invoicingService: IInvoicingService,
  bearerToken?: string,
  nowIso: string = new Date().toISOString()
): Promise<FinancialLedgerEntry> {
  const existingEntries = await invoicingService.getLedgerEntries().catch(() => []);
  const alreadyInService = existingEntries.find(
    (e) =>
      e.id === deterministicId ||
      (e.type === entry.type &&
        e.description === entry.description &&
        ((entry.tripId && e.tripId === entry.tripId) ||
          (entry.invoiceId && e.invoiceId === entry.invoiceId)))
  );
  if (alreadyInService) {
    return alreadyInService;
  }

  const created = await invoicingService.recordLedgerEntry(entry);
  if (bearerToken && isFirebaseConfigured()) {
    await patchFirestoreDocumentRest(
      'financialLedger',
      deterministicId,
      {
        ...entry,
        id: deterministicId,
        createdAt: nowIso,
      },
      bearerToken,
      true
    );
  }
  return created;
}

async function checkSettlementLockExists(
  lockId: string,
  bearerToken?: string
): Promise<PaymentSettlementLockRecord | null> {
  const mem = paymentLoopStore.settlementLocks.get(lockId);
  if (mem) return mem;

  if (bearerToken && isFirebaseConfigured()) {
    const remote = await fetchFirestoreDocumentRest('paymentWebhookEvents', lockId, bearerToken);
    if (remote && remote.paymentIntentId) {
      const hydrated: PaymentSettlementLockRecord = {
        lockId,
        paymentIntentId: String(remote.paymentIntentId),
        targetType: remote.targetType === 'invoice' ? 'invoice' : 'trip',
        targetId: String(remote.targetId || ''),
        payToken: typeof remote.payToken === 'string' ? remote.payToken : undefined,
        baseAmount: Number(remote.baseAmount || 0),
        tipAmount: Number(remote.tipAmount || 0),
        totalAmount: Number(remote.totalAmount || 0),
        receiptNumber: String(remote.receiptNumber || buildPayReceiptNumber(String(remote.paymentIntentId))),
        cardBrand: typeof remote.cardBrand === 'string' ? remote.cardBrand : undefined,
        cardLast4: typeof remote.cardLast4 === 'string' ? remote.cardLast4 : undefined,
        settledAt: String(remote.settledAt || new Date().toISOString()),
        ledgerEntryIds: Array.isArray(remote.ledgerEntryIds) ? remote.ledgerEntryIds : [],
      };
      paymentLoopStore.settlementLocks.set(lockId, hydrated);
      return hydrated;
    }
  }
  return null;
}

async function persistSettlementLock(
  lock: PaymentSettlementLockRecord,
  bearerToken?: string
): Promise<void> {
  paymentLoopStore.settlementLocks.set(lock.lockId, lock);
  if (bearerToken && isFirebaseConfigured()) {
    await patchFirestoreDocumentRest(
      'paymentWebhookEvents',
      lock.lockId,
      {
        ...lock,
        kind: 'settlement_lock',
      },
      bearerToken,
      true
    );
  }
}

/**
 * Shared idempotent settlement reconciler invoked by BOTH:
 * - `POST /api/pay` (`confirm_payment` synchronous verification)
 * - `POST /api/payments/webhook` (`payment_intent.succeeded` / `requires_capture`)
 *
 * Uses shared idempotency key `pi_${paymentIntentId}` so ledger entries and
 * status transitions NEVER double-count regardless of arrival order.
 */
export async function settleVerifiedPaymentIntent(
  params: {
    paymentIntentId: string;
    stripeStatus: 'succeeded' | 'requires_capture';
    amountDollars: number;
    currency?: string;
    payToken?: string;
    targetType?: 'trip' | 'invoice';
    targetId?: string;
    baseAmount?: number;
    tipAmount?: number;
    cardBrand?: string;
    cardLast4?: string;
    source: 'webhook' | 'pay_link_confirm';
  },
  deps?: PaymentReconciliationDependencies
): Promise<{
  alreadySettled: boolean;
  targetType?: 'trip' | 'invoice';
  targetId?: string;
  payLink?: PayLinkProjection | null;
  receiptNumber: string;
  ledgerEntriesCreated: number;
}> {
  const nowMs = deps?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const todayDate = formatLocalDateStr(new Date(nowMs));
  const bookingService = deps?.bookingService || getBookingService();
  const invoicingService = deps?.invoicingService || getInvoicingService();
  const restToken = deps?.bearerToken || (await getServiceAccountDatastoreToken()) || undefined;

  const lockId = `pi_${params.paymentIntentId}`;
  const receiptNumber = buildPayReceiptNumber(params.paymentIntentId);

  // Resolve PayLink if payToken is provided
  let payLink: PayLinkProjection | null = null;
  if (params.payToken && isValidPayToken(params.payToken)) {
    payLink = await resolvePayLinkServerRecord(params.payToken, restToken);
  }

  const resolvedTargetType: 'trip' | 'invoice' | undefined =
    params.targetType || payLink?.targetType;
  const resolvedTargetId: string | undefined =
    params.targetId || payLink?.targetId;

  // Resolve linked payToken by target if webhook came from a non-link PI or lacked payToken in metadata
  const resolvedPayToken =
    params.payToken ||
    payLink?.payToken ||
    (resolvedTargetType && resolvedTargetId
      ? paymentLoopStore.payLinkTokenByTarget.get(`${resolvedTargetType}:${resolvedTargetId}`)
      : undefined);

  if (!payLink && resolvedPayToken && isValidPayToken(resolvedPayToken)) {
    payLink = await resolvePayLinkServerRecord(resolvedPayToken, restToken);
  }

  // Handle pre-auth hold (`requires_capture`) without capturing ledger revenue yet
  if (params.stripeStatus === 'requires_capture') {
    if (resolvedTargetType === 'trip' && resolvedTargetId) {
      const trip = await loadTripRecord(resolvedTargetId, bookingService, restToken);
      const auditEvent: TripAuditEvent = {
        action: 'STATUS_CHANGED',
        timestamp: nowIso,
        actorRole: 'system',
        referenceType: 'payment',
        referenceNumber: params.paymentIntentId,
        notes: `Stripe pre-authorization hold confirmed ($${params.amountDollars.toFixed(2)}).`,
      };
      await saveTripPatch(
        resolvedTargetId,
        trip,
        {
          payment: {
            ...(trip?.payment || { method: 'card', amount: params.amountDollars }),
            method: 'card',
            status: 'authorized',
            paymentIntentId: params.paymentIntentId,
            preAuthHoldAmount: params.amountDollars,
            cardBrand: params.cardBrand || trip?.payment?.cardBrand,
            cardLast4: params.cardLast4 || trip?.payment?.cardLast4,
          },
          auditLog: [...(trip?.auditLog || []), auditEvent],
          updatedAt: nowIso,
        },
        bookingService,
        restToken
      );
    }

    return {
      alreadySettled: false,
      targetType: resolvedTargetType,
      targetId: resolvedTargetId,
      payLink,
      receiptNumber,
      ledgerEntriesCreated: 0,
    };
  }

  // Check shared settlement lock `pi_${paymentIntentId}`
  const existingLock = await checkSettlementLockExists(lockId, restToken);
  if (existingLock) {
    // Ensure payLink reflects paid state if looked up
    if (payLink && payLink.status !== 'paid') {
      payLink = await savePayLinkServerRecord(
        {
          ...payLink,
          status: 'paid',
          tipAmount: existingLock.tipAmount,
          totalPaidAmount: existingLock.totalAmount,
          paidAt: existingLock.settledAt,
          receiptNumber: existingLock.receiptNumber,
          cardBrand: existingLock.cardBrand || payLink.cardBrand,
          cardLast4: existingLock.cardLast4 || payLink.cardLast4,
          updatedAt: nowIso,
        },
        restToken
      );
    }
    return {
      alreadySettled: true,
      targetType: existingLock.targetType,
      targetId: existingLock.targetId,
      payLink,
      receiptNumber: existingLock.receiptNumber,
      ledgerEntriesCreated: 0,
    };
  }

  const tipAmount = Number(Math.max(0, Number(params.tipAmount ?? 0)).toFixed(2));
  const totalAmount = Number(Math.max(0, Number(params.amountDollars || 0)).toFixed(2));
  const baseAmount =
    params.baseAmount !== undefined && Number.isFinite(Number(params.baseAmount))
      ? Number(Math.max(0, Number(params.baseAmount)).toFixed(2))
      : Number(Math.max(0, totalAmount - tipAmount).toFixed(2));

  // Update PayLink projection to `paid`
  if (payLink) {
    payLink = await savePayLinkServerRecord(
      {
        ...payLink,
        status: 'paid',
        tipAmount: payLink.allowTip ? tipAmount : undefined,
        totalPaidAmount: totalAmount,
        paidAt: nowIso,
        receiptNumber,
        cardBrand: params.cardBrand || payLink.cardBrand,
        cardLast4: params.cardLast4 || payLink.cardLast4,
        updatedAt: nowIso,
      },
      restToken
    );
  }

  const createdLedgerIds: string[] = [];

  // ─── Target A: Individual Passenger Trip ───
  if (resolvedTargetType === 'trip' && resolvedTargetId) {
    const trip = await loadTripRecord(resolvedTargetId, bookingService, restToken);
    const auditEvent: TripAuditEvent = {
      action: 'PAYMENT_SETTLED',
      timestamp: nowIso,
      actorRole: 'system',
      referenceType: 'payment',
      referenceNumber: receiptNumber,
      notes: `Stripe payment settled (${params.source}): $${totalAmount.toFixed(2)}${
        tipAmount > 0 ? ` (includes $${tipAmount.toFixed(2)} tip)` : ''
      } [${params.paymentIntentId}].`,
    };

    await saveTripPatch(
      resolvedTargetId,
      trip,
      {
        payment: {
          ...(trip?.payment || { method: 'card', amount: totalAmount }),
          method: 'card',
          status: 'captured',
          amount: totalAmount,
          tipAmount,
          paymentIntentId: params.paymentIntentId,
          transactionId: params.paymentIntentId,
          paidAt: nowIso,
          receiptNumber,
          payToken: resolvedPayToken || trip?.payment?.payToken,
          payLinkStatus: 'paid',
          cardBrand: params.cardBrand || trip?.payment?.cardBrand,
          cardLast4: params.cardLast4 || trip?.payment?.cardLast4,
        },
        metadata: {
          ...(trip?.metadata || {}),
          ...(resolvedPayToken ? { payToken: resolvedPayToken, payLinkStatus: 'paid' } : {}),
        },
        auditLog: [...(trip?.auditLog || []), auditEvent],
        updatedAt: nowIso,
      },
      bookingService,
      restToken
    );

    // Compute balanced commission split (respecting 100% pass-through for tolls & tips)
    const cachedSettings = getAdminConfigService().getCachedSettings();
    const rawRate =
      deps?.commissionRate ?? cachedSettings?.pricing?.defaultDriverCommissionRate ?? 0.75;
    const commissionRate =
      Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 1 ? rawRate : 0.75;

    const fareSubtotal = Number(Math.max(0, totalAmount - tipAmount).toFixed(2));
    const tollsAmount = Number(
      Math.max(0, Number(trip?.pricing?.tollsFee ?? trip?.payment?.tollsAmount ?? 0)).toFixed(2)
    );
    const commissionableGross = Number(Math.max(0, fareSubtotal - tollsAmount).toFixed(2));
    const driverShare = Number((commissionableGross * commissionRate).toFixed(2));
    const platformCommission = Number((commissionableGross - driverShare).toFixed(2));
    const driverNetPayout = Number((driverShare + tollsAmount + tipAmount).toFixed(2));
    const tripShort = resolvedTargetId.slice(-8).toUpperCase();
    const cleanPi = params.paymentIntentId.replace(/[^a-zA-Z0-9_-]/g, '');

    if (fareSubtotal > 0) {
      const e1 = await recordServerLedgerEntry(
        `ledg_${cleanPi}_fare`,
        {
          date: todayDate,
          type: 'fare_revenue',
          tripId: resolvedTargetId,
          driverId: trip?.assignedDriverId || undefined,
          amount: fareSubtotal,
          description: `Stripe captured ride fare – Trip #${tripShort} (${receiptNumber})`,
          accountCode: '4010-FareRevenue',
        },
        invoicingService,
        restToken,
        nowIso
      );
      createdLedgerIds.push(e1.id);
    }

    if (tipAmount > 0) {
      const e2 = await recordServerLedgerEntry(
        `ledg_${cleanPi}_tip`,
        {
          date: todayDate,
          type: 'tip_collected',
          tripId: resolvedTargetId,
          driverId: trip?.assignedDriverId || undefined,
          amount: tipAmount,
          description: `Stripe passenger gratuity – Trip #${tripShort} (${receiptNumber})`,
          accountCode: '2010-DriverTipsPayable',
        },
        invoicingService,
        restToken,
        nowIso
      );
      createdLedgerIds.push(e2.id);
    }

    if (platformCommission > 0) {
      const e3 = await recordServerLedgerEntry(
        `ledg_${cleanPi}_comm`,
        {
          date: todayDate,
          type: 'platform_commission',
          tripId: resolvedTargetId,
          driverId: trip?.assignedDriverId || undefined,
          amount: platformCommission,
          description: `Platform commission split (${Math.round((1 - commissionRate) * 100)}%) – Trip #${tripShort}`,
          accountCode: '4020-PlatformCommission',
        },
        invoicingService,
        restToken,
        nowIso
      );
      createdLedgerIds.push(e3.id);
    }

    if (driverNetPayout > 0) {
      const e4 = await recordServerLedgerEntry(
        `ledg_${cleanPi}_payout`,
        {
          date: todayDate,
          type: 'driver_payout',
          tripId: resolvedTargetId,
          driverId: trip?.assignedDriverId || undefined,
          amount: driverNetPayout,
          description: `Driver settlement payable – Trip #${tripShort} (${receiptNumber})`,
          accountCode: '5010-DriverPayout',
        },
        invoicingService,
        restToken,
        nowIso
      );
      createdLedgerIds.push(e4.id);
    }

    await persistSettlementLock(
      {
        lockId,
        paymentIntentId: params.paymentIntentId,
        targetType: 'trip',
        targetId: resolvedTargetId,
        payToken: resolvedPayToken,
        baseAmount,
        tipAmount,
        totalAmount,
        receiptNumber,
        cardBrand: params.cardBrand,
        cardLast4: params.cardLast4,
        settledAt: nowIso,
        ledgerEntryIds: createdLedgerIds,
      },
      restToken
    );

    return {
      alreadySettled: false,
      targetType: 'trip',
      targetId: resolvedTargetId,
      payLink,
      receiptNumber,
      ledgerEntriesCreated: createdLedgerIds.length,
    };
  }

  // ─── Target B: Corporate B2B Invoice ───
  if (resolvedTargetType === 'invoice' && resolvedTargetId) {
    const invoice = await loadInvoiceRecord(resolvedTargetId, invoicingService, restToken);
    const settledAmount = totalAmount > 0 ? totalAmount : Number(invoice?.totalAmount || baseAmount);
    const updatedInvoice: InvoiceRecord = {
      ...(invoice || {
        id: resolvedTargetId,
        invoiceNumber: resolvedTargetId,
        customerName: payLink?.customerLabel || 'Corporate Partner',
        customerEmail: '',
        tripIds: [],
        totalAmount: settledAmount,
        issuedDate: todayDate,
        dueDate: todayDate,
        lineItems: [],
      }),
      status: 'paid',
      paidDate: todayDate,
      paidAt: nowIso,
      paymentReference: params.paymentIntentId,
      receiptNumber,
      payToken: resolvedPayToken || invoice?.payToken,
    };

    await saveInvoiceRecord(updatedInvoice, invoicingService, restToken);

    // Settle linked corporate AR transactions
    if (invoicingService.settleUnbilledTransactions) {
      const allTxs = await invoicingService.getUnbilledTransactions().catch(() => []);
      const matchingTxIds = allTxs
        .filter(
          (tx) =>
            tx.invoiceId === resolvedTargetId ||
            (Array.isArray(updatedInvoice.tripIds) && updatedInvoice.tripIds.includes(tx.tripId))
        )
        .map((tx) => tx.id);
      if (matchingTxIds.length > 0) {
        await invoicingService.settleUnbilledTransactions(matchingTxIds).catch(() => {});
      }
    }

    const cleanPi = params.paymentIntentId.replace(/[^a-zA-Z0-9_-]/g, '');
    const invLedger = await recordServerLedgerEntry(
      `ledg_${cleanPi}_inv`,
      {
        date: todayDate,
        type: 'invoice_settlement',
        corporateAccountId: updatedInvoice.corporateAccountId,
        invoiceId: resolvedTargetId,
        amount: settledAmount,
        description: `Stripe B2B AR settlement for Invoice ${updatedInvoice.invoiceNumber} (${receiptNumber})`,
        accountCode: '1010-OperatingCash',
      },
      invoicingService,
      restToken,
      nowIso
    );
    createdLedgerIds.push(invLedger.id);

    await persistSettlementLock(
      {
        lockId,
        paymentIntentId: params.paymentIntentId,
        targetType: 'invoice',
        targetId: resolvedTargetId,
        payToken: resolvedPayToken,
        baseAmount: settledAmount,
        tipAmount: 0,
        totalAmount: settledAmount,
        receiptNumber,
        cardBrand: params.cardBrand,
        cardLast4: params.cardLast4,
        settledAt: nowIso,
        ledgerEntryIds: createdLedgerIds,
      },
      restToken
    );

    return {
      alreadySettled: false,
      targetType: 'invoice',
      targetId: resolvedTargetId,
      payLink,
      receiptNumber,
      ledgerEntriesCreated: createdLedgerIds.length,
    };
  }

  return {
    alreadySettled: false,
    targetType: resolvedTargetType,
    targetId: resolvedTargetId,
    payLink,
    receiptNumber,
    ledgerEntriesCreated: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stripe Event Router & Strict Webhook Event Idempotency
// ─────────────────────────────────────────────────────────────────────────────

async function getProcessedWebhookEvent(
  eventId: string,
  bearerToken?: string
): Promise<ProcessedWebhookEventRecord | null> {
  const mem = paymentLoopStore.webhookEvents.get(eventId);
  if (mem) return mem;

  if (bearerToken && isFirebaseConfigured()) {
    const remote = await fetchFirestoreDocumentRest('paymentWebhookEvents', eventId, bearerToken);
    if (remote && remote.eventType) {
      const rec: ProcessedWebhookEventRecord = {
        id: eventId,
        eventType: String(remote.eventType),
        paymentIntentId: typeof remote.paymentIntentId === 'string' ? remote.paymentIntentId : undefined,
        chargeId: typeof remote.chargeId === 'string' ? remote.chargeId : undefined,
        targetType: remote.targetType === 'invoice' ? 'invoice' : remote.targetType === 'trip' ? 'trip' : undefined,
        targetId: typeof remote.targetId === 'string' ? remote.targetId : undefined,
        payToken: typeof remote.payToken === 'string' ? remote.payToken : undefined,
        amount: typeof remote.amount === 'number' ? remote.amount : undefined,
        currency: typeof remote.currency === 'string' ? remote.currency : undefined,
        outcome: String(remote.outcome || 'processed'),
        livemode: Boolean(remote.livemode),
        processedAt: String(remote.processedAt || new Date().toISOString()),
      };
      paymentLoopStore.webhookEvents.set(eventId, rec);
      return rec;
    }
  }
  return null;
}

async function saveProcessedWebhookEvent(
  record: ProcessedWebhookEventRecord,
  bearerToken?: string
): Promise<void> {
  paymentLoopStore.webhookEvents.set(record.id, record);
  if (bearerToken && isFirebaseConfigured()) {
    await patchFirestoreDocumentRest(
      'paymentWebhookEvents',
      record.id,
      record as unknown as Record<string, unknown>,
      bearerToken,
      true
    );
  }
}

/**
 * Reconciles a verified Stripe webhook event idempotently.
 */
export async function reconcileStripeWebhookEvent(
  event: StripeWebhookEventPayload,
  deps?: PaymentReconciliationDependencies
): Promise<{
  received: boolean;
  duplicate: boolean;
  eventId: string;
  eventType: string;
  outcome: string;
  targetType?: 'trip' | 'invoice';
  targetId?: string;
  ledgerEntriesCreated?: number;
}> {
  const nowMs = deps?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const todayDate = formatLocalDateStr(new Date(nowMs));
  const bookingService = deps?.bookingService || getBookingService();
  const invoicingService = deps?.invoicingService || getInvoicingService();
  const restToken = deps?.bearerToken || (await getServiceAccountDatastoreToken()) || undefined;

  const eventId = String(event?.id || '').trim();
  const eventType = String(event?.type || '').trim();
  const obj = (event?.data?.object || {}) as Record<string, any>;

  if (!eventId || !eventType) {
    throw new Error('Malformed Stripe event payload: missing id or type.');
  }

  // Strict event-level idempotency check (`/paymentWebhookEvents/{event.id}`)
  const existingEvent = await getProcessedWebhookEvent(eventId, restToken);
  if (existingEvent) {
    return {
      received: true,
      duplicate: true,
      eventId,
      eventType,
      outcome: existingEvent.outcome,
      targetType: existingEvent.targetType,
      targetId: existingEvent.targetId,
      ledgerEntriesCreated: 0,
    };
  }

  const metadata = (obj.metadata || {}) as Record<string, any>;
  const rawPayToken = typeof metadata.payToken === 'string' ? metadata.payToken.trim() : undefined;
  const resolvedTripId =
    (typeof metadata.tripId === 'string' && metadata.tripId.trim()) ||
    (metadata.targetType === 'trip' && typeof metadata.targetId === 'string'
      ? metadata.targetId.trim()
      : '');
  const resolvedInvoiceId =
    (typeof metadata.invoiceId === 'string' && metadata.invoiceId.trim()) ||
    (metadata.targetType === 'invoice' && typeof metadata.targetId === 'string'
      ? metadata.targetId.trim()
      : '');

  let targetType: 'trip' | 'invoice' | undefined = resolvedTripId
    ? 'trip'
    : resolvedInvoiceId
    ? 'invoice'
    : metadata.targetType === 'invoice'
    ? 'invoice'
    : metadata.targetType === 'trip'
    ? 'trip'
    : undefined;
  let targetId: string | undefined = resolvedTripId || resolvedInvoiceId || undefined;
  let outcome = 'ignored_unsubscribed_event';
  let ledgerEntriesCreated = 0;

  // ─── 1. Pre-Authorization Hold Ready (`payment_intent.amount_capturable_updated`) ───
  if (eventType === 'payment_intent.amount_capturable_updated') {
    const amountCents = Number(obj.amount_capturable ?? obj.amount ?? 0);
    const amountDollars = Number((amountCents / 100).toFixed(2));
    const { cardBrand, cardLast4 } = extractCardMetadata(obj);

    const settleRes = await settleVerifiedPaymentIntent(
      {
        paymentIntentId: String(obj.id || ''),
        stripeStatus: 'requires_capture',
        amountDollars,
        currency: String(obj.currency || 'usd'),
        payToken: rawPayToken,
        targetType: targetType || 'trip',
        targetId,
        cardBrand,
        cardLast4,
        source: 'webhook',
      },
      { ...deps, bearerToken: restToken, nowMs }
    );
    targetType = settleRes.targetType;
    targetId = settleRes.targetId;
    outcome = 'trip_hold_authorized';
  }

  // ─── 2. Payment Captured / Succeeded (`payment_intent.succeeded`) ───
  else if (eventType === 'payment_intent.succeeded') {
    const amountCents = Number(obj.amount_received ?? obj.amount ?? 0);
    const amountDollars = Number((amountCents / 100).toFixed(2));
    const tipAmount = metadata.tipAmount !== undefined ? Number(metadata.tipAmount) : 0;
    const baseAmount =
      metadata.baseAmount !== undefined
        ? Number(metadata.baseAmount)
        : Number(Math.max(0, amountDollars - tipAmount).toFixed(2));
    const { cardBrand, cardLast4 } = extractCardMetadata(obj);

    const settleRes = await settleVerifiedPaymentIntent(
      {
        paymentIntentId: String(obj.id || ''),
        stripeStatus: 'succeeded',
        amountDollars,
        currency: String(obj.currency || 'usd'),
        payToken: rawPayToken,
        targetType,
        targetId,
        baseAmount,
        tipAmount,
        cardBrand,
        cardLast4,
        source: 'webhook',
      },
      { ...deps, bearerToken: restToken, nowMs }
    );
    targetType = settleRes.targetType;
    targetId = settleRes.targetId;
    ledgerEntriesCreated = settleRes.ledgerEntriesCreated;
    outcome = settleRes.alreadySettled
      ? 'already_settled_via_shared_lock'
      : targetType === 'invoice'
      ? 'invoice_settled'
      : 'trip_payment_captured';
  }

  // ─── 3. Payment Failed / Canceled (`payment_intent.payment_failed` | `payment_intent.canceled`) ───
  else if (
    eventType === 'payment_intent.payment_failed' ||
    eventType === 'payment_intent.canceled'
  ) {
    const piId = String(obj.id || '');
    const isCanceled = eventType === 'payment_intent.canceled';
    const reason =
      String(obj.last_payment_error?.message || obj.cancellation_reason || '').trim() ||
      (isCanceled ? 'Stripe PaymentIntent canceled' : 'Card payment declined by issuer');

    if (targetType === 'trip' && targetId) {
      const trip = await loadTripRecord(targetId, bookingService, restToken);
      const alreadyPaid =
        trip?.payment?.status === 'captured' || trip?.payment?.status === 'settled';
      const auditEvent: TripAuditEvent = {
        action: 'STATUS_CHANGED',
        timestamp: nowIso,
        actorRole: 'system',
        referenceType: 'payment',
        referenceNumber: piId,
        notes: isCanceled
          ? `Stripe PaymentIntent canceled: ${reason}`
          : `Stripe payment attempt failed: ${reason}`,
      };
      await saveTripPatch(
        targetId,
        trip,
        {
          payment: alreadyPaid
            ? trip!.payment
            : {
                ...(trip?.payment || {
                  method: 'card',
                  amount: Number(trip?.pricing?.totalFare || 0),
                }),
                status: isCanceled ? 'pending' : 'failed',
                paymentIntentId: piId || trip?.payment?.paymentIntentId,
              },
          auditLog: [...(trip?.auditLog || []), auditEvent],
          updatedAt: nowIso,
        },
        bookingService,
        restToken
      );
      outcome = isCanceled ? 'trip_payment_canceled_logged' : 'trip_payment_failed_logged';
    } else if (targetType === 'invoice' && targetId) {
      // Never corrupt open balance or already-paid corporate invoice status
      const invoice = await loadInvoiceRecord(targetId, invoicingService, restToken);
      if (invoice && invoice.status !== 'paid') {
        const failureNote = `[${nowIso.slice(0, 10)}] Stripe ${
          isCanceled ? 'canceled' : 'failed'
        } (${piId}): ${reason}`;
        await saveInvoiceRecord(
          {
            ...invoice,
            notes: invoice.notes ? `${invoice.notes}\n${failureNote}` : failureNote,
          },
          invoicingService,
          restToken
        );
      }
      outcome = isCanceled ? 'invoice_payment_canceled_logged' : 'invoice_payment_failed_logged';
    } else {
      outcome = isCanceled ? 'payment_canceled_unlinked' : 'payment_failed_unlinked';
    }
  }

  // ─── 4. Charge Refunded (`charge.refunded`) ───
  else if (eventType === 'charge.refunded') {
    const chargeId = String(obj.id || `ch_${eventId}`);
    const linkedPiId = typeof obj.payment_intent === 'string' ? obj.payment_intent.trim() : '';
    const refundedCents = Number(obj.amount_refunded ?? obj.amount ?? 0);
    const refundedDollars = Number((refundedCents / 100).toFixed(2));
    const totalChargeCents = Number(obj.amount ?? refundedCents);
    const isFullRefund = refundedCents >= totalChargeCents && refundedCents > 0;

    // Fallback resolution via settlement lock if Stripe Charge metadata didn't repeat targetId
    let lockRef: PaymentSettlementLockRecord | null = null;
    if ((!targetType || !targetId) && linkedPiId) {
      lockRef = await checkSettlementLockExists(`pi_${linkedPiId}`, restToken);
      if (lockRef) {
        targetType = lockRef.targetType;
        targetId = lockRef.targetId;
      }
    }

    const effectivePayToken =
      rawPayToken ||
      lockRef?.payToken ||
      (targetType && targetId
        ? paymentLoopStore.payLinkTokenByTarget.get(`${targetType}:${targetId}`)
        : undefined);

    if (effectivePayToken && isValidPayToken(effectivePayToken) && isFullRefund) {
      const existingLink = await resolvePayLinkServerRecord(effectivePayToken, restToken);
      if (existingLink) {
        await savePayLinkServerRecord(
          {
            ...existingLink,
            status: 'refunded',
            updatedAt: nowIso,
          },
          restToken
        );
      }
    }

    const cleanChargeKey = `${chargeId}_${refundedCents}`.replace(/[^a-zA-Z0-9_-]/g, '');

    if (targetType === 'trip' && targetId) {
      const trip = await loadTripRecord(targetId, bookingService, restToken);
      const auditEvent: TripAuditEvent = {
        action: 'PAYMENT_SETTLED',
        timestamp: nowIso,
        actorRole: 'system',
        referenceType: 'payment',
        referenceNumber: chargeId,
        notes: `Stripe refund processed: -$${refundedDollars.toFixed(2)} (${
          isFullRefund ? 'full refund' : 'partial refund'
        }).`,
      };
      await saveTripPatch(
        targetId,
        trip,
        {
          payment: {
            ...(trip?.payment || { method: 'card', amount: refundedDollars }),
            status: isFullRefund ? 'refunded' : trip?.payment?.status || 'captured',
            refundedAmount: refundedDollars,
            refundedAt: nowIso,
            ...(isFullRefund && effectivePayToken ? { payLinkStatus: 'refunded' } : {}),
          },
          metadata: {
            ...(trip?.metadata || {}),
            refundedAmount: refundedDollars,
            refundedAt: nowIso,
            lastRefundChargeId: chargeId,
          },
          auditLog: [...(trip?.auditLog || []), auditEvent],
          updatedAt: nowIso,
        },
        bookingService,
        restToken
      );

      if (refundedDollars > 0) {
        await recordServerLedgerEntry(
          `ledg_ref_${cleanChargeKey}`,
          {
            date: todayDate,
            type: 'refund',
            tripId: targetId,
            driverId: trip?.assignedDriverId || undefined,
            amount: refundedDollars,
            description: `Stripe refund issued – Trip #${targetId.slice(-8).toUpperCase()} (${chargeId})`,
            accountCode: '4090-RefundsAndAllowances',
          },
          invoicingService,
          restToken,
          nowIso
        );
        ledgerEntriesCreated++;
      }
      outcome = 'trip_refund_reconciled';
    } else if (targetType === 'invoice' && targetId) {
      const invoice = await loadInvoiceRecord(targetId, invoicingService, restToken);
      if (invoice) {
        const refundNote = `[${todayDate}] Stripe refund processed: $${refundedDollars.toFixed(2)} (${chargeId})`;
        await saveInvoiceRecord(
          {
            ...invoice,
            refundedAmount: refundedDollars,
            refundedAt: nowIso,
            notes: invoice.notes ? `${invoice.notes}\n${refundNote}` : refundNote,
          },
          invoicingService,
          restToken
        );
      }

      if (refundedDollars > 0) {
        await recordServerLedgerEntry(
          `ledg_ref_${cleanChargeKey}`,
          {
            date: todayDate,
            type: 'refund',
            corporateAccountId: invoice?.corporateAccountId,
            invoiceId: targetId,
            amount: refundedDollars,
            description: `Stripe corporate invoice refund – Invoice ${
              invoice?.invoiceNumber || targetId
            } (${chargeId})`,
            accountCode: '4090-RefundsAndAllowances',
          },
          invoicingService,
          restToken,
          nowIso
        );
        ledgerEntriesCreated++;
      }
      outcome = 'invoice_refund_reconciled';
    } else if (refundedDollars > 0) {
      await recordServerLedgerEntry(
        `ledg_ref_${cleanChargeKey}`,
        {
          date: todayDate,
          type: 'refund',
          amount: refundedDollars,
          description: `Stripe unlinked charge refund (${chargeId})`,
          accountCode: '4090-RefundsAndAllowances',
        },
        invoicingService,
        restToken,
        nowIso
      );
      ledgerEntriesCreated++;
      outcome = 'unlinked_refund_reconciled';
    }
  }

  const amountSummary =
    typeof obj.amount_refunded === 'number' && eventType === 'charge.refunded'
      ? Number((obj.amount_refunded / 100).toFixed(2))
      : typeof obj.amount_received === 'number' && obj.amount_received > 0
      ? Number((obj.amount_received / 100).toFixed(2))
      : typeof obj.amount === 'number'
      ? Number((obj.amount / 100).toFixed(2))
      : undefined;

  await saveProcessedWebhookEvent(
    {
      id: eventId,
      eventType,
      paymentIntentId:
        eventType.startsWith('payment_intent.')
          ? String(obj.id || '')
          : typeof obj.payment_intent === 'string'
          ? obj.payment_intent
          : undefined,
      chargeId: eventType.startsWith('charge.') ? String(obj.id || '') : undefined,
      targetType,
      targetId,
      payToken: rawPayToken,
      amount: amountSummary,
      currency: typeof obj.currency === 'string' ? obj.currency.toUpperCase() : 'USD',
      outcome,
      livemode: Boolean(event.livemode),
      processedAt: nowIso,
    },
    restToken
  );

  return {
    received: true,
    duplicate: false,
    eventId,
    eventType,
    outcome,
    targetType,
    targetId,
    ledgerEntriesCreated,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HTTP Route Handlers (`POST /api/payments/webhook` & Staff `GET`)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleStripeWebhookPost(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { received: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  // MUST read raw body text prior to JSON parsing for cryptographic HMAC verification
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';

  const verification = verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret, 300);
  if (!verification.valid) {
    return Response.json(
      {
        received: false,
        code: verification.code,
        error: verification.error || 'Webhook signature verification failed.',
      },
      { status: verification.status }
    );
  }

  let parsedEvent: StripeWebhookEventPayload;
  try {
    parsedEvent = JSON.parse(rawBody) as StripeWebhookEventPayload;
  } catch {
    return Response.json(
      { received: false, error: 'Invalid JSON in Stripe webhook body.' },
      { status: 400 }
    );
  }

  if (!parsedEvent || typeof parsedEvent.id !== 'string' || typeof parsedEvent.type !== 'string') {
    return Response.json(
      { received: false, error: 'Malformed Stripe event structure.' },
      { status: 400 }
    );
  }

  try {
    const result = await reconcileStripeWebhookEvent(parsedEvent);
    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api.payments.webhook] Reconciliation error:', message);
    return Response.json(
      { received: false, error: 'Webhook reconciliation failed.' },
      { status: 500 }
    );
  }
}

/**
 * Authenticated staff `GET /api/payments/webhook` diagnostics loader
 * (Dispatcher / Admin only via `verifyServerRequestAuth`).
 */
export async function handleStripeWebhookGet(request: Request): Promise<Response> {
  const auth = await verifyServerRequestAuth(request);
  const enforceAuth =
    process.env.NODE_ENV === 'production' ||
    isFirebaseConfigured() ||
    Boolean(process.env.ADMIN_API_SECRET?.trim());

  if (enforceAuth && !auth.isDispatcher) {
    return Response.json(
      {
        success: false,
        error: 'Unauthorized: Dispatcher or Administrator sign-in required for webhook diagnostics.',
      },
      { status: auth.authenticated ? 403 : 401 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
  const webhookSecretConfigured = Boolean(webhookSecret && webhookSecret.startsWith('whsec_'));
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const stripeConfigured = Boolean(stripeSecretKey && stripeSecretKey.startsWith('sk_'));
  const stripeMode = stripeSecretKey.startsWith('sk_live_')
    ? 'live'
    : stripeConfigured
    ? 'test'
    : 'unconfigured';

  const restToken = auth.rawToken || (await getServiceAccountDatastoreToken()) || undefined;
  const byId = new Map<string, ProcessedWebhookEventRecord>();

  for (const [id, rec] of paymentLoopStore.webhookEvents.entries()) {
    if (rec.eventType) byId.set(id, rec);
  }

  if (restToken && isFirebaseConfigured()) {
    const remoteDocs = await listFirestoreCollectionRest<Record<string, any>>(
      'paymentWebhookEvents',
      restToken,
      40
    );
    if (Array.isArray(remoteDocs)) {
      for (const doc of remoteDocs) {
        if (doc.kind === 'settlement_lock' || String(doc.id || '').startsWith('pi_')) continue;
        if (doc.id && doc.eventType) {
          byId.set(String(doc.id), {
            id: String(doc.id),
            eventType: String(doc.eventType),
            paymentIntentId: doc.paymentIntentId,
            chargeId: doc.chargeId,
            targetType: doc.targetType,
            targetId: doc.targetId,
            payToken: doc.payToken,
            amount: typeof doc.amount === 'number' ? doc.amount : undefined,
            currency: doc.currency || 'USD',
            outcome: String(doc.outcome || 'processed'),
            livemode: Boolean(doc.livemode),
            processedAt: String(doc.processedAt || ''),
          });
        }
      }
    }
  }

  const recentEvents = Array.from(byId.values())
    .sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''))
    .slice(0, 25);

  return Response.json(
    {
      success: true,
      endpointPath: '/api/payments/webhook',
      webhookSecretConfigured,
      stripeConfigured,
      stripeMode,
      toleranceSeconds: 300,
      subscribedEvents: [...SUBSCRIBED_STRIPE_WEBHOOK_EVENTS],
      totalProcessedCount: byId.size,
      recentEvents,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
