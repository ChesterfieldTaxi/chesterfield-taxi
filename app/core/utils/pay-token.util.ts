/**
 * Zero-PII 1-Tap Pay Link Token, Projection Sanitization & Anti-Tamper Charge Utilities
 *
 * Mirrors `/tripTracking` security guarantees:
 * - High-entropy URL-safe tokens matching `/^pay_[a-zA-Z0-9_-]{24,80}$/`.
 * - Public `/payLinks/{payToken}` projections expose ONLY sanitized checkout fields
 *   (masked customer/company label, reference `#`, sanitized route or invoice period
 *   summary, sanitized line items, authoritative `baseAmount`, `currency`, `allowTip`,
 *   `status`, `expiresAt`, `paidAt`, `receiptNumber`) — NEVER full passenger phone,
 *   email, gate codes, unit/apt numbers, or corporate PO history.
 * - Pure Web Crypto / TypeScript implementation with zero `node:crypto` imports so it
 *   can be safely shared across server routes, domain services, and client bundles.
 */

import {
  normalizeBillingSettingsConfig,
  type BillingSettingsConfig,
  type InvoiceRecord,
} from '../types/config';
import type { Trip } from '../types/trip';
import { sanitizePublicAddressDisplay } from './tracking-token.util';

export const PAY_TOKEN_PATTERN = /^pay_[a-zA-Z0-9_-]{24,80}$/;

export type PayLinkTargetType = 'trip' | 'invoice';

export type PayLinkStatus = 'open' | 'paid' | 'expired' | 'cancelled' | 'refunded';

export interface PayLinkLineItem {
  label: string;
  detail?: string;
  amount: number;
}

/**
 * Strictly allowlisted Zero-PII public Pay Link document stored in `/payLinks/{payToken}`
 * and returned by `GET /api/pay?token=pay_...`.
 */
export interface PayLinkProjection {
  payToken: string;
  targetType: PayLinkTargetType;
  targetId: string;
  referenceNumber: string;
  customerLabel: string;
  summaryLabel: string;
  pickupDisplay?: string;
  dropoffDisplay?: string;
  serviceDate?: string;
  billingPeriod?: string;
  lineItems: PayLinkLineItem[];
  baseAmount: number;
  tipAmount?: number;
  totalPaidAmount?: number;
  currency: string;
  allowTip: boolean;
  status: PayLinkStatus;
  expiresAt: string;
  paidAt?: string;
  receiptNumber?: string;
  cardBrand?: string;
  cardLast4?: string;
  createdAt: string;
  updatedAt: string;
}

/** Alias used by server-side Pay Link persistence */
export type PayLinkRecord = PayLinkProjection;

/**
 * Exact allowlist of keys permitted in `/payLinks/{payToken}` (must match `firestore.rules`).
 */
export const ALLOWED_PAY_LINK_KEYS: readonly (keyof PayLinkProjection)[] = [
  'payToken',
  'targetType',
  'targetId',
  'referenceNumber',
  'customerLabel',
  'summaryLabel',
  'pickupDisplay',
  'dropoffDisplay',
  'serviceDate',
  'billingPeriod',
  'lineItems',
  'baseAmount',
  'tipAmount',
  'totalPaidAmount',
  'currency',
  'allowTip',
  'status',
  'expiresAt',
  'paidAt',
  'receiptNumber',
  'cardBrand',
  'cardLast4',
  'createdAt',
  'updatedAt',
] as const;

const URL_SAFE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generates a high-entropy URL-safe Pay Link token (160+ bits) matching `PAY_TOKEN_PATTERN`.
 */
export function generatePayToken(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(28);
    globalThis.crypto.getRandomValues(bytes);
    let chars = '';
    for (let i = 0; i < bytes.length; i++) {
      chars += URL_SAFE_ALPHABET[bytes[i] % URL_SAFE_ALPHABET.length];
    }
    return `pay_${chars}`;
  }

  let fallback = '';
  while (fallback.length < 32) {
    fallback += Math.random().toString(36).slice(2);
  }
  return `pay_${fallback.slice(0, 32)}`;
}

export function isValidPayToken(token: unknown): token is string {
  return typeof token === 'string' && PAY_TOKEN_PATTERN.test(token.trim());
}

/**
 * Generates a clean human-readable receipt number from a PaymentIntent or token.
 */
export function buildPayReceiptNumber(seedId: string): string {
  const clean = String(seedId || '')
    .replace(/^(pi_|pay_|ch_)/i, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  const suffix = clean.slice(-8) || Date.now().toString(36).slice(-8).toUpperCase();
  return `RCT-${suffix}`;
}

/**
 * Scrubs any accidental emails, phone numbers, gate codes, or corporate PO numbers
 * from public-facing labels/details.
 */
export function scrubPublicPayText(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    // Strip emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted]')
    // Strip US / international phone numbers
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[redacted]')
    // Strip PO numbers (e.g. PO #12345, PO: CORP-991, [PO: ...])
    .replace(/\[?\bPO\s*(?:number|num|#|[-:])\s*[a-zA-Z0-9_-]+\]?/gi, '')
    // Strip gate/apt/unit codes
    .replace(/\b(?:gate\s*code|access\s*code|door\s*code|pin\s*code|apt|apartment|unit|suite|ste)\s*[:#-]?\s*[a-zA-Z0-9-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

/**
 * Masks a passenger's full name to "First L." (never exposing full surname, email, or phone).
 */
export function maskPassengerLabel(firstName?: string | null, lastName?: string | null): string {
  const cleanFirst = scrubPublicPayText(firstName).split(/\s+/)[0] || '';
  const cleanLast = scrubPublicPayText(lastName).trim();
  if (!cleanFirst && !cleanLast) return 'Valued Passenger';
  if (!cleanFirst) return `${cleanLast.charAt(0).toUpperCase()}.`;
  if (!cleanLast) return cleanFirst;
  return `${cleanFirst} ${cleanLast.charAt(0).toUpperCase()}.`;
}

/**
 * Masks an arbitrary full name string ("Evelyn Harper" -> "Evelyn H.").
 */
export function maskFullNameString(fullName?: string | null): string {
  const cleaned = scrubPublicPayText(fullName);
  if (!cleaned) return 'Traveler';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

/**
 * Formats a corporate organization label with masked account last-2/4 (no PO numbers or emails).
 */
export function formatCorporateCustomerLabel(
  companyName?: string | null,
  accountNumber?: string | null
): string {
  const safeCompany = scrubPublicPayText(companyName) || 'Corporate Account';
  const cleanAcct = String(accountNumber || '').replace(/[^a-zA-Z0-9]/g, '');
  if (cleanAcct.length >= 2) {
    return `${safeCompany} (Acct ••${cleanAcct.slice(-4)})`;
  }
  return safeCompany;
}

/**
 * Sanitizes a single line item for public display.
 */
export function sanitizePayLinkLineItem(item: {
  label?: string;
  detail?: string;
  amount?: number;
}): PayLinkLineItem {
  const label = scrubPublicPayText(item.label) || 'Transportation Service';
  const rawDetail = item.detail ? scrubPublicPayText(item.detail) : '';
  const numAmount = Number(item.amount ?? 0);
  const amount = Number.isFinite(numAmount) ? Number(numAmount.toFixed(2)) : 0;

  return rawDetail ? { label, detail: rawDetail, amount } : { label, amount };
}

/**
 * Resolves clamped Pay Link expiry hours (`1..720`, default `72`) and `allowTip` policy
 * from `BillingSettingsConfig` with optional per-call overrides.
 */
export function resolvePayLinkPolicyDefaults(
  targetType: PayLinkTargetType,
  billingSettings?: Partial<BillingSettingsConfig> | null,
  overrides?: {
    expiresInHours?: number;
    allowTip?: boolean;
    nowMs?: number;
  }
): {
  expiresInHours: number;
  allowTip: boolean;
  expiresAt: string;
} {
  const nowMs = overrides?.nowMs ?? Date.now();
  const normalized = normalizeBillingSettingsConfig(billingSettings);
  const rawHours =
    overrides?.expiresInHours !== undefined && Number.isFinite(Number(overrides.expiresInHours))
      ? Number(overrides.expiresInHours)
      : normalized.payLinkExpiryHours;
  const expiresInHours = Math.min(720, Math.max(1, Math.round(rawHours)));
  const defaultAllowTip =
    targetType === 'invoice'
      ? normalized.payLinkAllowTipOnInvoices
      : normalized.payLinkAllowTipOnTrips;
  const allowTip =
    overrides?.allowTip !== undefined ? Boolean(overrides.allowTip) : defaultAllowTip;

  return {
    expiresInHours,
    allowTip,
    expiresAt: new Date(nowMs + expiresInHours * 3_600_000).toISOString(),
  };
}

/**
 * Builds a Zero-PII `PayLinkProjection` for an individual Trip.
 */
export function buildTripPayLinkProjection(
  trip: Trip,
  options?: {
    payToken?: string;
    expiresInHours?: number;
    allowTip?: boolean;
    billingSettings?: Partial<BillingSettingsConfig> | null;
    nowMs?: number;
  }
): PayLinkProjection {
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const policy = resolvePayLinkPolicyDefaults('trip', options?.billingSettings, {
    expiresInHours: options?.expiresInHours,
    allowTip: options?.allowTip,
    nowMs,
  });
  const expiresAt = policy.expiresAt;
  const payToken =
    options?.payToken && isValidPayToken(options.payToken)
      ? options.payToken.trim()
      : generatePayToken();

  const pickupDisplay = sanitizePublicAddressDisplay(trip.pickupLocation?.address);
  const dropoffDisplay = sanitizePublicAddressDisplay(trip.dropoffLocation?.address);
  const customerLabel = maskPassengerLabel(trip.passenger?.firstName, trip.passenger?.lastName);
  const referenceNumber = trip.id.startsWith('#') ? trip.id : `#${trip.id}`;

  // Authoritative ride subtotal before tip: prefer metered/quoted totalFare + any uncaptured driver extras
  const quotedOrMeteredTotal = Number(
    trip.pricing?.meterCalculatedFare && trip.pricing.meterCalculatedFare > 0 && !trip.pricing?.totalFare
      ? trip.pricing.meterCalculatedFare
      : trip.pricing?.totalFare ?? trip.payment?.amount ?? 0
  );

  // Build sanitized itemized breakdown
  const rawLineItems: PayLinkLineItem[] = [];
  if (Array.isArray(trip.pricing?.breakdown) && trip.pricing.breakdown.length > 0) {
    for (const b of trip.pricing.breakdown) {
      rawLineItems.push(
        sanitizePayLinkLineItem({
          label: b.label,
          detail: b.detail,
          amount: b.amount,
        })
      );
    }
  } else {
    rawLineItems.push(
      sanitizePayLinkLineItem({
        label: 'Ride Fare',
        detail: `${pickupDisplay} → ${dropoffDisplay}`,
        amount: quotedOrMeteredTotal,
      })
    );
  }

  // Include any post-quote driver/meter extras not yet in breakdown
  const breakdownSum = Number(rawLineItems.reduce((s, li) => s + li.amount, 0).toFixed(2));
  const extrasList = trip.pricing?.driverExtras || trip.meterExtras || [];
  let addedExtras = 0;
  if (Array.isArray(extrasList) && extrasList.length > 0 && Math.abs(breakdownSum - quotedOrMeteredTotal) < 0.05) {
    // Check whether breakdown already includes driverExtras
    const hasDriverExtraLine = (trip.pricing?.breakdown || []).some((b) =>
      String(b.id || '').startsWith('driver-extra')
    );
    if (!hasDriverExtraLine) {
      for (const ex of extrasList) {
        const exAmt = Number(ex.amount || 0);
        if (exAmt > 0) {
          addedExtras += exAmt;
          rawLineItems.push(
            sanitizePayLinkLineItem({
              label: ex.name || 'Trip Extra',
              amount: exAmt,
            })
          );
        }
      }
    }
  }

  const computedBase = Number(Math.max(0, quotedOrMeteredTotal + addedExtras).toFixed(2));
  const serviceDate = (
    trip.actualPickupTime ||
    trip.scheduledPickupTime ||
    trip.createdAt ||
    nowIso
  ).slice(0, 10);

  const isAlreadyPaid =
    trip.payment?.status === 'captured' || trip.payment?.status === 'settled';
  const existingTip = Number(trip.payment?.tipAmount || 0);

  return sanitizePayLinkProjection({
    payToken,
    targetType: 'trip',
    targetId: trip.id,
    referenceNumber,
    customerLabel,
    summaryLabel: `${pickupDisplay} → ${dropoffDisplay}`,
    pickupDisplay,
    dropoffDisplay,
    serviceDate,
    lineItems: rawLineItems,
    baseAmount: computedBase,
    tipAmount: isAlreadyPaid ? existingTip : undefined,
    totalPaidAmount: isAlreadyPaid
      ? Number((trip.payment?.amount || computedBase + existingTip).toFixed(2))
      : undefined,
    currency: (trip.pricing?.currency || 'USD').toUpperCase(),
    allowTip: policy.allowTip,
    status: isAlreadyPaid ? 'paid' : 'open',
    expiresAt,
    paidAt: isAlreadyPaid ? trip.payment?.paidAt || nowIso : undefined,
    receiptNumber:
      trip.payment?.receiptNumber ||
      (isAlreadyPaid && trip.payment?.paymentIntentId
        ? buildPayReceiptNumber(trip.payment.paymentIntentId)
        : undefined),
    cardBrand: trip.payment?.cardBrand,
    cardLast4: trip.payment?.cardLast4,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

/**
 * Builds a Zero-PII `PayLinkProjection` for a B2B Corporate Invoice.
 * Never exposes corporate PO numbers, PO history, or passenger phone/email.
 */
export function buildInvoicePayLinkProjection(
  invoice: InvoiceRecord,
  options?: {
    payToken?: string;
    expiresInHours?: number;
    allowTip?: boolean;
    billingSettings?: Partial<BillingSettingsConfig> | null;
    nowMs?: number;
  }
): PayLinkProjection {
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const policy = resolvePayLinkPolicyDefaults('invoice', options?.billingSettings, {
    expiresInHours: options?.expiresInHours,
    allowTip: options?.allowTip,
    nowMs,
  });
  const expiresAt = policy.expiresAt;
  const payToken =
    options?.payToken && isValidPayToken(options.payToken)
      ? options.payToken.trim()
      : generatePayToken();

  const customerLabel = formatCorporateCustomerLabel(invoice.customerName, invoice.accountNumber);
  const referenceNumber = invoice.invoiceNumber || invoice.id;
  const billingPeriod = `Issued ${invoice.issuedDate} · Due ${invoice.dueDate}`;

  const sanitizedItems: PayLinkLineItem[] = (invoice.lineItems || []).map((li, idx) => {
    const maskedPax = li.passengerName ? maskFullNameString(li.passengerName) : undefined;
    const cleanRoute = li.pickupDropoff
      ? li.pickupDropoff
          .split(/\s*(?:➔|->|→)\s*/)
          .map((part) => sanitizePublicAddressDisplay(part))
          .join(' → ')
      : undefined;

    const label = li.date
      ? `${li.date} · Ride ${li.tripId ? `#${li.tripId.slice(-6).toUpperCase()}` : `#${idx + 1}`}`
      : `Statement Item #${idx + 1}`;
    const detail = cleanRoute
      ? `${maskedPax ? `${maskedPax} · ` : ''}${cleanRoute}`
      : scrubPublicPayText(li.description);

    return sanitizePayLinkLineItem({
      label,
      detail,
      amount: li.amount,
    });
  });

  if (sanitizedItems.length === 0) {
    sanitizedItems.push(
      sanitizePayLinkLineItem({
        label: `Statement ${referenceNumber}`,
        detail: billingPeriod,
        amount: invoice.totalAmount,
      })
    );
  }

  const baseAmount = Number(Math.max(0, Number(invoice.totalAmount || 0)).toFixed(2));
  const isPaid = invoice.status === 'paid';

  return sanitizePayLinkProjection({
    payToken,
    targetType: 'invoice',
    targetId: invoice.id,
    referenceNumber,
    customerLabel,
    summaryLabel: `Invoice ${referenceNumber} (${billingPeriod})`,
    serviceDate: invoice.issuedDate,
    billingPeriod,
    lineItems: sanitizedItems,
    baseAmount,
    totalPaidAmount: isPaid ? baseAmount : undefined,
    currency: 'USD',
    allowTip: policy.allowTip,
    status: isPaid ? 'paid' : 'open',
    expiresAt,
    paidAt: isPaid ? invoice.paidAt || (invoice.paidDate ? `${invoice.paidDate}T12:00:00.000Z` : nowIso) : undefined,
    receiptNumber:
      invoice.receiptNumber ||
      (isPaid && invoice.paymentReference ? buildPayReceiptNumber(invoice.paymentReference) : undefined),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

/**
 * Defense-in-depth output sanitizer guaranteeing that ONLY allowlisted Zero-PII
 * fields exist on a `PayLinkProjection` before Firestore persistence or HTTP response.
 */
export function sanitizePayLinkProjection(doc: Record<string, any>): PayLinkProjection {
  const validStatuses: readonly PayLinkStatus[] = ['open', 'paid', 'expired', 'cancelled', 'refunded'];
  const rawStatus = String(doc.status || 'open') as PayLinkStatus;
  const status: PayLinkStatus = validStatuses.includes(rawStatus) ? rawStatus : 'open';
  const targetType: PayLinkTargetType = doc.targetType === 'invoice' ? 'invoice' : 'trip';

  const rawItems = Array.isArray(doc.lineItems) ? doc.lineItems : [];
  const lineItems: PayLinkLineItem[] = rawItems.map((item: any) =>
    sanitizePayLinkLineItem({
      label: item?.label || item?.description,
      detail: item?.detail,
      amount: item?.amount,
    })
  );

  const baseAmountNum = Number(doc.baseAmount ?? 0);
  const baseAmount = Number.isFinite(baseAmountNum) && baseAmountNum >= 0
    ? Number(baseAmountNum.toFixed(2))
    : 0;

  const out: PayLinkProjection = {
    payToken: String(doc.payToken || '').trim(),
    targetType,
    targetId: String(doc.targetId || '').trim(),
    referenceNumber: scrubPublicPayText(doc.referenceNumber) || String(doc.targetId || ''),
    customerLabel: scrubPublicPayText(doc.customerLabel) || 'Valued Client',
    summaryLabel: scrubPublicPayText(doc.summaryLabel) || 'Chesterfield Taxi Service',
    lineItems,
    baseAmount,
    currency: String(doc.currency || 'USD').toUpperCase().slice(0, 3),
    allowTip: Boolean(doc.allowTip),
    status,
    expiresAt: String(doc.expiresAt || new Date(Date.now() + 72 * 3_600_000).toISOString()),
    createdAt: String(doc.createdAt || new Date().toISOString()),
    updatedAt: String(doc.updatedAt || new Date().toISOString()),
  };

  if (typeof doc.pickupDisplay === 'string' && doc.pickupDisplay.trim()) {
    out.pickupDisplay = sanitizePublicAddressDisplay(scrubPublicPayText(doc.pickupDisplay));
  }
  if (typeof doc.dropoffDisplay === 'string' && doc.dropoffDisplay.trim()) {
    out.dropoffDisplay = sanitizePublicAddressDisplay(scrubPublicPayText(doc.dropoffDisplay));
  }
  if (typeof doc.serviceDate === 'string' && doc.serviceDate.trim()) {
    out.serviceDate = scrubPublicPayText(doc.serviceDate).slice(0, 32);
  }
  if (typeof doc.billingPeriod === 'string' && doc.billingPeriod.trim()) {
    out.billingPeriod = scrubPublicPayText(doc.billingPeriod).slice(0, 80);
  }
  if (doc.tipAmount !== undefined && doc.tipAmount !== null && Number.isFinite(Number(doc.tipAmount))) {
    out.tipAmount = Number(Math.max(0, Number(doc.tipAmount)).toFixed(2));
  }
  if (
    doc.totalPaidAmount !== undefined &&
    doc.totalPaidAmount !== null &&
    Number.isFinite(Number(doc.totalPaidAmount))
  ) {
    out.totalPaidAmount = Number(Math.max(0, Number(doc.totalPaidAmount)).toFixed(2));
  }
  if (typeof doc.paidAt === 'string' && doc.paidAt.trim()) {
    out.paidAt = doc.paidAt.trim();
  }
  if (typeof doc.receiptNumber === 'string' && doc.receiptNumber.trim()) {
    out.receiptNumber = scrubPublicPayText(doc.receiptNumber).slice(0, 40);
  }
  if (typeof doc.cardBrand === 'string' && doc.cardBrand.trim()) {
    out.cardBrand = scrubPublicPayText(doc.cardBrand).toLowerCase().slice(0, 24);
  }
  if (typeof doc.cardLast4 === 'string' && /^\d{4}$/.test(doc.cardLast4.trim())) {
    out.cardLast4 = doc.cardLast4.trim();
  }

  return out;
}

/**
 * Evaluates whether an open Pay Link has passed `expiresAt` and auto-transitions
 * its status to `'expired'`. Already `'paid'`, `'cancelled'`, or `'refunded'` links are preserved.
 */
export function evaluatePayLinkExpiry(
  projection: PayLinkProjection,
  nowMs: number = Date.now()
): { projection: PayLinkProjection; didExpire: boolean } {
  if (projection.status !== 'open') {
    return { projection, didExpire: false };
  }
  const expiresMs = Date.parse(projection.expiresAt);
  if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
    return {
      projection: {
        ...projection,
        status: 'expired',
        updatedAt: new Date(nowMs).toISOString(),
      },
      didExpire: true,
    };
  }
  return { projection, didExpire: false };
}

export interface AuthoritativeChargeCalculation {
  valid: boolean;
  baseAmount: number;
  tipAmount: number;
  chargeAmount: number;
  amountInCents: number;
  currency: string;
  error?: string;
}

/**
 * Anti-tamper server charge calculator:
 * - Reads `baseAmount` exclusively from the server-stored `PayLinkProjection` (NEVER client input).
 * - Rejects negative, NaN, or excessive gratuity values.
 * - Enforces `tipAmount = 0` when `allowTip === false` (rejecting non-zero tips if supplied).
 */
export function computeAuthoritativePayLinkCharge(
  payLink: Pick<PayLinkProjection, 'baseAmount' | 'allowTip' | 'currency'>,
  rawClientTipAmount?: unknown
): AuthoritativeChargeCalculation {
  const authoritativeBase = Number(payLink.baseAmount);
  const currency = String(payLink.currency || 'USD').toLowerCase();

  if (!Number.isFinite(authoritativeBase) || authoritativeBase < 1 || authoritativeBase > 50_000) {
    return {
      valid: false,
      baseAmount: 0,
      tipAmount: 0,
      chargeAmount: 0,
      amountInCents: 0,
      currency,
      error: 'Invalid authoritative balance on payment link ($1.00 – $50,000.00).',
    };
  }

  const cleanBase = Number(authoritativeBase.toFixed(2));

  let parsedTip = 0;
  if (rawClientTipAmount !== undefined && rawClientTipAmount !== null && rawClientTipAmount !== '') {
    const numTip = typeof rawClientTipAmount === 'number' ? rawClientTipAmount : Number(rawClientTipAmount);
    if (!Number.isFinite(numTip) || numTip < 0) {
      return {
        valid: false,
        baseAmount: cleanBase,
        tipAmount: 0,
        chargeAmount: cleanBase,
        amountInCents: Math.round(cleanBase * 100),
        currency,
        error: 'Tip amount must be a non-negative number ($0.00 or greater).',
      };
    }
    parsedTip = Number(numTip.toFixed(2));
  }

  if (!payLink.allowTip && parsedTip > 0) {
    return {
      valid: false,
      baseAmount: cleanBase,
      tipAmount: 0,
      chargeAmount: cleanBase,
      amountInCents: Math.round(cleanBase * 100),
      currency,
      error: 'Gratuity cannot be added to this corporate statement link.',
    };
  }

  const maxAllowedTip = Math.max(500, cleanBase * 2);
  if (parsedTip > maxAllowedTip) {
    return {
      valid: false,
      baseAmount: cleanBase,
      tipAmount: 0,
      chargeAmount: cleanBase,
      amountInCents: Math.round(cleanBase * 100),
      currency,
      error: `Tip amount exceeds maximum permitted gratuity ($${maxAllowedTip.toFixed(2)}).`,
    };
  }

  const chargeAmount = Number((cleanBase + parsedTip).toFixed(2));
  const amountInCents = Math.round(chargeAmount * 100);

  return {
    valid: true,
    baseAmount: cleanBase,
    tipAmount: parsedTip,
    chargeAmount,
    amountInCents,
    currency,
  };
}
