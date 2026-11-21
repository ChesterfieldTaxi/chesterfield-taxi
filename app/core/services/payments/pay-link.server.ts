/**
 * Server-Isolated 1-Tap Pay Link Engine (`pay-link.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) consumed by `app/routes/api.pay.ts`,
 * `app/routes/pay.$payToken.tsx` SSR loader, and verification suites.
 *
 * Security Invariants:
 * - Zero-PII public lookups (`GET /api/pay?token=pay_...`) return ONLY sanitized
 *   `PayLinkProjection` fields and auto-expire links past `expiresAt`.
 * - Anti-Tamper Checkout (`create_checkout_intent`): NEVER trusts client-supplied
 *   base fares or invoice totals; reads `baseAmount` exclusively from the stored
 *   `PayLinkProjection` and validates `tipAmount >= 0`.
 * - Server-Verified Settlement (`confirm_payment`): Verifies `PaymentIntent` status,
 *   `metadata.payToken`, and charged amount directly against the Stripe REST API
 *   before marking paid, sharing `pi_${paymentIntentId}` idempotency with
 *   `stripe-webhook.server.ts`.
 */

import { COMPANY_CONFIG } from '../../../config/companyConfig';
import type { InvoiceRecord } from '../../types/config';
import type { Trip } from '../../types/trip';
import {
  buildInvoicePayLinkProjection,
  buildTripPayLinkProjection,
  computeAuthoritativePayLinkCharge,
  evaluatePayLinkExpiry,
  isValidPayToken,
  sanitizePayLinkProjection,
  type PayLinkProjection,
  type PayLinkTargetType,
} from '../../utils/pay-token.util';
import { sanitizeToE164, validatePhoneNumber } from '../../utils/phone';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
  verifyServerRequestAuth,
} from '../auth/server-auth.server';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { ResendEmailService } from '../email/resend-email.service';
import { isFirebaseConfigured } from '../firebase';
import { getInvoicingService } from '../invoicing.service';
import type { IInvoicingService } from '../../types/invoicing';
import {
  getServerPaymentLoopStore,
  getServiceAccountDatastoreToken,
  patchFirestoreDocumentRest,
  settleVerifiedPaymentIntent,
} from './stripe-webhook.server';

const STRIPE_PI_PATTERN = /^pi_[a-zA-Z0-9]{8,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getStripeGatewayServerStatus(customStripeSecretKey?: string): {
  stripeConfigured: boolean;
  stripeSecretKey: string;
  stripePublishableKey?: string;
} {
  const stripeSecretKey = (customStripeSecretKey ?? process.env.STRIPE_SECRET_KEY ?? '').trim();
  const stripeConfigured = Boolean(stripeSecretKey && stripeSecretKey.startsWith('sk_'));
  const rawPk = (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  const stripePublishableKey = rawPk.startsWith('pk_') ? rawPk : undefined;

  return {
    stripeConfigured,
    stripeSecretKey,
    stripePublishableKey,
  };
}

function resolveRequestOrigin(request?: Request): string {
  if (request) {
    try {
      const u = new URL(request.url);
      if (u.origin && u.origin !== 'null') return u.origin;
    } catch {
      // Fallback below
    }
  }
  return process.env.PUBLIC_APP_URL?.trim() || 'https://chesterfieldtaxi.com';
}

async function sendPayLinkSmsServer(
  toPhoneRaw: string,
  message: string
): Promise<{ sent: boolean; simulated: boolean; recipient?: string; error?: string }> {
  const validation = validatePhoneNumber(toPhoneRaw);
  if (!validation.isValid) {
    return {
      sent: false,
      simulated: false,
      error: validation.error || 'Invalid recipient mobile number.',
    };
  }

  const to = sanitizeToE164(validation.e164);
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
  const from = sanitizeToE164(process.env.TWILIO_PHONE_NUMBER?.trim() || '+13142281454');

  if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
    console.info(`[api.pay] [SIMULATED SMS] To ${to}: ${message}`);
    return { sent: true, simulated: true, recipient: to };
  }

  try {
    const basicAuth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
      }
    );
    if (!resp.ok) {
      const errJson = (await resp.json().catch(() => ({}))) as any;
      return {
        sent: false,
        simulated: false,
        recipient: to,
        error: errJson?.message || 'Twilio SMS delivery failed.',
      };
    }
    return { sent: true, simulated: false, recipient: to };
  } catch (err: any) {
    return {
      sent: false,
      simulated: false,
      recipient: to,
      error: err?.message || 'Network error sending SMS.',
    };
  }
}

async function sendPayLinkEmailServer(params: {
  recipientEmail: string;
  payLink: PayLinkProjection;
  payUrl: string;
}): Promise<{ sent: boolean; simulated?: boolean; recipient?: string; error?: string }> {
  const recipient = params.recipientEmail.trim();
  if (!EMAIL_PATTERN.test(recipient)) {
    return { sent: false, error: 'Invalid recipient email address.' };
  }

  const { payLink, payUrl } = params;
  const companyName = COMPANY_CONFIG.name;
  const companyPhone = COMPANY_CONFIG.phone.dispatch;
  const isInvoice = payLink.targetType === 'invoice';
  const subject = isInvoice
    ? `Payment Link: Invoice ${payLink.referenceNumber} ($${payLink.baseAmount.toFixed(2)}) | ${companyName}`
    : `1-Tap Pay Link: Ride ${payLink.referenceNumber} ($${payLink.baseAmount.toFixed(2)}) | ${companyName}`;

  const itemRowsHtml = payLink.lineItems
    .slice(0, 12)
    .map(
      (li) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #0f172a;">
          <div style="font-weight: 600;">${escapeHtml(li.label)}</div>
          ${
            li.detail
              ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(li.detail)}</div>`
              : ''
          }
        </td>
        <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #0f172a; white-space: nowrap;">
          $${li.amount.toFixed(2)}
        </td>
      </tr>`
    )
    .join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 28px 14px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 20px 24px;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #93c5fd;">
            ${escapeHtml(companyName)} &middot; Secure 1-Tap Checkout
          </div>
          <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">
            ${isInvoice ? `Corporate Statement ${escapeHtml(payLink.referenceNumber)}` : `Ride Payment ${escapeHtml(payLink.referenceNumber)}`}
          </h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #334155; line-height: 1.55;">
            Hello <strong>${escapeHtml(payLink.customerLabel)}</strong>, use the secure link below to review and complete payment via Apple Pay, Google Pay, or card.
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">
              ${isInvoice ? 'Statement Summary' : 'Trip Route'}
            </div>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 4px;">
              ${escapeHtml(payLink.summaryLabel)}
            </div>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 16px;">
            <tbody>
              ${itemRowsHtml}
              <tr>
                <td style="padding-top: 12px; font-size: 14px; font-weight: 800; color: #0f172a;">
                  ${payLink.allowTip ? 'Amount Due (Before Optional Tip)' : 'Total Balance Due'}
                </td>
                <td align="right" style="padding-top: 12px; font-size: 20px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #1d4ed8;">
                  $${payLink.baseAmount.toFixed(2)} ${escapeHtml(payLink.currency)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style="text-align: center; margin: 22px 0;">
            <a href="${escapeHtml(payUrl)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 800; text-decoration: none; padding: 13px 28px; border-radius: 12px;">
              Pay $${payLink.baseAmount.toFixed(2)} Securely &rarr;
            </a>
            <div style="font-size: 11px; color: #64748b; margin-top: 10px; word-break: break-all;">
              ${escapeHtml(payUrl)}
            </div>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 12px; color: #64748b; line-height: 1.5;">
            Questions or assistance? Call 24/7 Dispatch at <strong>${escapeHtml(companyPhone)}</strong> and reference <strong>${escapeHtml(payLink.referenceNumber)}</strong>.
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    `${companyName} - Secure Payment Request`,
    `Reference: ${payLink.referenceNumber}`,
    `Summary: ${payLink.summaryLabel}`,
    `Amount Due: $${payLink.baseAmount.toFixed(2)} ${payLink.currency}`,
    `Pay Online: ${payUrl}`,
    `24/7 Dispatch: ${companyPhone}`,
  ].join('\n');

  const emailService = new ResendEmailService();
  const res = await emailService.sendDirect({
    recipient,
    subject,
    html,
    text,
  });

  return {
    sent: res.success,
    simulated: res.simulated,
    recipient,
    error: res.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Public Sanitized PayLink Lookup (with Auto-Expiry Transition)
// ─────────────────────────────────────────────────────────────────────────────

export async function lookupPublicPayLinkServer(
  payToken: string,
  options?: { nowMs?: number }
): Promise<{
  found: boolean;
  payLink: PayLinkProjection | null;
  stripeConfigured: boolean;
  stripePublishableKey?: string;
}> {
  const gateway = getStripeGatewayServerStatus();
  const cleanToken = String(payToken || '').trim();
  if (!isValidPayToken(cleanToken)) {
    return {
      found: false,
      payLink: null,
      stripeConfigured: gateway.stripeConfigured,
      stripePublishableKey: gateway.stripePublishableKey,
    };
  }

  const store = getServerPaymentLoopStore();
  let candidate: PayLinkProjection | null = store.payLinks.get(cleanToken) || null;

  if (isFirebaseConfigured()) {
    // Public `get: if true` rule permits unauthenticated exact-token Firestore REST lookup
    const remote = await fetchFirestoreDocumentRest('payLinks', cleanToken);
    if (remote && remote.payToken) {
      const sanitizedRemote = sanitizePayLinkProjection(remote);
      if (
        !candidate ||
        sanitizedRemote.status === 'paid' ||
        sanitizedRemote.updatedAt >= candidate.updatedAt
      ) {
        candidate = sanitizedRemote;
      }
    }
  }

  if (!candidate) {
    return {
      found: false,
      payLink: null,
      stripeConfigured: gateway.stripeConfigured,
      stripePublishableKey: gateway.stripePublishableKey,
    };
  }

  const { projection, didExpire } = evaluatePayLinkExpiry(candidate, options?.nowMs ?? Date.now());
  const sanitized = sanitizePayLinkProjection(projection);
  store.payLinks.set(cleanToken, sanitized);
  store.payLinkTokenByTarget.set(`${sanitized.targetType}:${sanitized.targetId}`, cleanToken);

  if (didExpire && isFirebaseConfigured()) {
    const saToken = await getServiceAccountDatastoreToken();
    if (saToken) {
      await patchFirestoreDocumentRest(
        'payLinks',
        cleanToken,
        sanitized as unknown as Record<string, unknown>,
        saToken,
        true
      );
    }
  }

  return {
    found: true,
    payLink: sanitized,
    stripeConfigured: gateway.stripeConfigured,
    stripePublishableKey: gateway.stripePublishableKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Staff / Driver Pay Link Creation & Optional SMS/Email Delivery
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePayLinkServerInput {
  targetType: PayLinkTargetType;
  targetId: string;
  expiresInHours?: number;
  sendSms?: boolean;
  recipientPhone?: string;
  sendEmail?: boolean;
  recipientEmail?: string;
  origin?: string;
  bearerToken?: string;
  callerUid?: string;
  isDispatcher?: boolean;
  isDriver?: boolean;
  /** Used only in local dev / offline tests when Firestore is not configured */
  tripSnapshot?: Trip;
  /** Used only in local dev / offline tests when Firestore is not configured */
  invoiceSnapshot?: InvoiceRecord;
  bookingService?: IBookingService;
  invoicingService?: IInvoicingService;
  nowMs?: number;
}

export async function createOrReusePayLinkServer(input: CreatePayLinkServerInput): Promise<{
  success: boolean;
  status: number;
  error?: string;
  reused?: boolean;
  payToken?: string;
  payUrl?: string;
  payLink?: PayLinkProjection;
  smsResult?: { sent: boolean; simulated: boolean; recipient?: string; error?: string };
  emailResult?: { sent: boolean; simulated?: boolean; recipient?: string; error?: string };
}> {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const targetType: PayLinkTargetType = input.targetType === 'invoice' ? 'invoice' : 'trip';
  const targetId = String(input.targetId || '').trim();

  if (!targetId) {
    return { success: false, status: 400, error: 'Valid targetId is required to create a pay link.' };
  }

  if (targetType === 'invoice' && input.isDriver && !input.isDispatcher) {
    return {
      success: false,
      status: 403,
      error: 'Forbidden: Only Dispatchers or Administrators may generate corporate invoice pay links.',
    };
  }

  const restToken =
    (await getServiceAccountDatastoreToken()) || input.bearerToken || undefined;
  const bookingService = input.bookingService || getBookingService();
  const invoicingService = input.invoicingService || getInvoicingService();
  const store = getServerPaymentLoopStore();
  const origin = (input.origin || 'https://chesterfieldtaxi.com').replace(/\/+$/, '');

  let resolvedPhone = input.recipientPhone?.trim() || '';
  let resolvedEmail = input.recipientEmail?.trim() || '';
  let existingTokenHint = store.payLinkTokenByTarget.get(`${targetType}:${targetId}`) || '';
  let freshProjection: PayLinkProjection;
  let loadedTrip: Trip | null = null;
  let loadedInvoice: InvoiceRecord | null = null;

  if (targetType === 'trip') {
    if (restToken && isFirebaseConfigured()) {
      const doc = await fetchFirestoreDocumentRest('trips', targetId, restToken);
      if (doc && (doc.id || doc.pickupLocation)) {
        loadedTrip = { ...(doc as any), id: doc.id || targetId } as Trip;
      }
    }
    if (!loadedTrip) {
      const localRes = await bookingService.getBookingStatus(targetId).catch(() => null);
      loadedTrip = localRes?.trip || (!isFirebaseConfigured() ? input.tripSnapshot || null : null);
    }
    if (!loadedTrip) {
      return { success: false, status: 404, error: `Trip #${targetId} was not found.` };
    }

    if (
      input.isDriver &&
      !input.isDispatcher &&
      input.callerUid &&
      loadedTrip.assignedDriverId &&
      loadedTrip.assignedDriverId !== input.callerUid
    ) {
      return {
        success: false,
        status: 403,
        error: 'Forbidden: Drivers can only generate pay links for their own assigned trip.',
      };
    }

    if (!resolvedPhone) resolvedPhone = loadedTrip.passenger?.phone || '';
    if (!resolvedEmail) resolvedEmail = loadedTrip.passenger?.email || '';
    if (!existingTokenHint) {
      const meta = (loadedTrip.metadata || {}) as Record<string, any>;
      existingTokenHint =
        loadedTrip.payment?.payToken ||
        (typeof meta.payToken === 'string' ? meta.payToken : '') ||
        '';
    }

    freshProjection = buildTripPayLinkProjection(loadedTrip, {
      expiresInHours: input.expiresInHours,
      nowMs,
    });
  } else {
    if (restToken && isFirebaseConfigured()) {
      const doc = await fetchFirestoreDocumentRest('invoices', targetId, restToken);
      if (doc && (doc.id || doc.invoiceNumber)) {
        loadedInvoice = { ...(doc as any), id: doc.id || targetId } as InvoiceRecord;
      }
    }
    if (!loadedInvoice && invoicingService.getInvoices) {
      const all = await invoicingService.getInvoices().catch(() => []);
      loadedInvoice = all.find((i) => i.id === targetId) || null;
    }
    if (!loadedInvoice && !isFirebaseConfigured() && input.invoiceSnapshot) {
      loadedInvoice = input.invoiceSnapshot;
    }
    if (!loadedInvoice) {
      return { success: false, status: 404, error: `Invoice ${targetId} was not found.` };
    }

    if (!resolvedEmail) resolvedEmail = loadedInvoice.customerEmail || '';
    if (!existingTokenHint && loadedInvoice.payToken) {
      existingTokenHint = loadedInvoice.payToken;
    }

    freshProjection = buildInvoicePayLinkProjection(loadedInvoice, {
      expiresInHours: input.expiresInHours,
      nowMs,
    });
  }

  if (freshProjection.baseAmount <= 0) {
    return {
      success: false,
      status: 400,
      error: 'Cannot generate a payment link for a $0.00 balance.',
    };
  }

  // Reuse active open link when token exists, has not expired, and baseAmount matches
  let activePayLink: PayLinkProjection | null = null;
  let reused = false;

  if (existingTokenHint && isValidPayToken(existingTokenHint)) {
    const existingLookup = await lookupPublicPayLinkServer(existingTokenHint, { nowMs });
    if (
      existingLookup.found &&
      existingLookup.payLink &&
      existingLookup.payLink.targetType === targetType &&
      existingLookup.payLink.targetId === targetId &&
      ((existingLookup.payLink.status === 'open' &&
        Math.abs(existingLookup.payLink.baseAmount - freshProjection.baseAmount) < 0.01) ||
        existingLookup.payLink.status === 'paid')
    ) {
      activePayLink = existingLookup.payLink;
      reused = true;
    }
  }

  if (!activePayLink) {
    activePayLink = sanitizePayLinkProjection(freshProjection);
    store.payLinks.set(activePayLink.payToken, activePayLink);
    store.payLinkTokenByTarget.set(`${targetType}:${targetId}`, activePayLink.payToken);

    if (restToken && isFirebaseConfigured()) {
      await patchFirestoreDocumentRest(
        'payLinks',
        activePayLink.payToken,
        activePayLink as unknown as Record<string, unknown>,
        restToken,
        true
      );
    }

    const generatedPayUrl = `${origin}/pay/${activePayLink.payToken}`;

    // Cache token reference onto target Trip or Invoice
    if (targetType === 'trip' && loadedTrip) {
      const tripPatch: Partial<Trip> = {
        payment: {
          ...loadedTrip.payment,
          payToken: activePayLink.payToken,
          payLinkStatus: activePayLink.status,
        },
        metadata: {
          ...(loadedTrip.metadata || {}),
          payToken: activePayLink.payToken,
          payLinkUrl: generatedPayUrl,
          payLinkStatus: activePayLink.status,
        },
        updatedAt: nowIso,
      };
      if (restToken && isFirebaseConfigured()) {
        await patchFirestoreDocumentRest(
          'trips',
          targetId,
          tripPatch as Record<string, unknown>,
          restToken,
          false
        );
      }
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(targetId, tripPatch).catch(() => null);
      }
    } else if (targetType === 'invoice' && loadedInvoice) {
      const updatedInv: InvoiceRecord = {
        ...loadedInvoice,
        payToken: activePayLink.payToken,
        payLinkUrl: generatedPayUrl,
      };
      if (restToken && isFirebaseConfigured()) {
        await patchFirestoreDocumentRest(
          'invoices',
          targetId,
          { payToken: activePayLink.payToken, payLinkUrl: generatedPayUrl },
          restToken,
          false
        );
      }
      if (invoicingService.saveInvoice) {
        await invoicingService.saveInvoice(updatedInv).catch(() => null);
      }
    }
  }

  const payUrl = `${origin}/pay/${activePayLink.payToken}`;

  let smsResult:
    | { sent: boolean; simulated: boolean; recipient?: string; error?: string }
    | undefined;
  let emailResult:
    | { sent: boolean; simulated?: boolean; recipient?: string; error?: string }
    | undefined;

  if (input.sendSms && activePayLink.status === 'open') {
    const smsBody =
      targetType === 'invoice'
        ? `Chesterfield Taxi: Pay Invoice ${activePayLink.referenceNumber} ($${activePayLink.baseAmount.toFixed(2)}) securely online: ${payUrl}`
        : `Chesterfield Taxi: Pay securely for Ride ${activePayLink.referenceNumber} ($${activePayLink.baseAmount.toFixed(2)}) with Apple Pay, Google Pay, or Card: ${payUrl}`;
    smsResult = await sendPayLinkSmsServer(resolvedPhone, smsBody);
  }

  if (input.sendEmail && activePayLink.status === 'open') {
    emailResult = await sendPayLinkEmailServer({
      recipientEmail: resolvedEmail,
      payLink: activePayLink,
      payUrl,
    });
  }

  return {
    success: true,
    status: 200,
    reused,
    payToken: activePayLink.payToken,
    payUrl,
    payLink: activePayLink,
    smsResult,
    emailResult,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Server-Authoritative Checkout Intent (`create_checkout_intent`)
// ─────────────────────────────────────────────────────────────────────────────

export async function createPayLinkCheckoutIntentServer(params: {
  payToken: string;
  tipAmount?: unknown;
  stripeSecretKeyOverride?: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<{
  httpStatus: number;
  body: Record<string, any>;
}> {
  const cleanToken = String(params.payToken || '').trim();
  if (!isValidPayToken(cleanToken)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'Invalid payment link token.' },
    };
  }

  const lookup = await lookupPublicPayLinkServer(cleanToken, { nowMs: params.nowMs });
  if (!lookup.found || !lookup.payLink) {
    return {
      httpStatus: 404,
      body: { success: false, error: 'Payment link not found.' },
    };
  }

  const payLink = lookup.payLink;
  if (payLink.status === 'paid') {
    return {
      httpStatus: 409,
      body: {
        success: false,
        code: 'ALREADY_PAID',
        error: 'This payment link has already been settled.',
        payLink,
      },
    };
  }

  if (payLink.status !== 'open') {
    return {
      httpStatus: 410,
      body: {
        success: false,
        code: 'LINK_INACTIVE',
        error: `This payment link is ${payLink.status} and can no longer accept payment. Please call Chesterfield Taxi Dispatch at (314) 738-0100.`,
        payLink,
      },
    };
  }

  // Anti-Tamper Charge Calculation: NEVER trusts client baseAmount or totalAmount
  const chargeCalc = computeAuthoritativePayLinkCharge(payLink, params.tipAmount);
  if (!chargeCalc.valid) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        code: 'INVALID_CHARGE',
        error: chargeCalc.error || 'Invalid payment or tip amount.',
      },
    };
  }

  const gateway = getStripeGatewayServerStatus(params.stripeSecretKeyOverride);
  if (!gateway.stripeConfigured) {
    return {
      httpStatus: 200,
      body: {
        success: false,
        stripeConfigured: false,
        baseAmount: chargeCalc.baseAmount,
        tipAmount: chargeCalc.tipAmount,
        amount: chargeCalc.chargeAmount,
        message:
          'Online card processing is not currently active. Please pay your driver directly in the car or call Chesterfield Taxi Dispatch at (314) 738-0100.',
      },
    };
  }

  const formParams = new URLSearchParams();
  formParams.append('amount', String(chargeCalc.amountInCents));
  formParams.append('currency', chargeCalc.currency);
  formParams.append('automatic_payment_methods[enabled]', 'true');
  formParams.append(
    'description',
    `Chesterfield Taxi ${payLink.targetType === 'invoice' ? 'Invoice' : 'Trip'} ${payLink.referenceNumber}`
  );
  formParams.append('metadata[payToken]', payLink.payToken);
  formParams.append('metadata[targetType]', payLink.targetType);
  formParams.append('metadata[targetId]', payLink.targetId);
  if (payLink.targetType === 'trip') {
    formParams.append('metadata[tripId]', payLink.targetId);
  } else {
    formParams.append('metadata[invoiceId]', payLink.targetId);
  }
  formParams.append('metadata[baseAmount]', chargeCalc.baseAmount.toFixed(2));
  formParams.append('metadata[tipAmount]', chargeCalc.tipAmount.toFixed(2));

  const fetchFn = params.fetchImpl || fetch;
  try {
    const resp = await fetchFn('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateway.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParams.toString(),
    });
    const stripeJson = (await resp.json()) as Record<string, any>;

    if (!resp.ok || !stripeJson?.client_secret) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          stripeConfigured: true,
          error: stripeJson?.error?.message || 'Unable to initialize Stripe checkout intent.',
        },
      };
    }

    return {
      httpStatus: 200,
      body: {
        success: true,
        stripeConfigured: true,
        clientSecret: stripeJson.client_secret,
        paymentIntentId: stripeJson.id,
        amount: chargeCalc.chargeAmount,
        baseAmount: chargeCalc.baseAmount,
        tipAmount: chargeCalc.tipAmount,
        currency: payLink.currency,
      },
    };
  } catch (err: any) {
    return {
      httpStatus: 502,
      body: {
        success: false,
        stripeConfigured: true,
        error: err?.message || 'Network error communicating with Stripe gateway.',
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Server-Verified Payment Confirmation (`confirm_payment`)
// ─────────────────────────────────────────────────────────────────────────────

export async function confirmPayLinkPaymentServer(params: {
  payToken: string;
  paymentIntentId: string;
  stripeSecretKeyOverride?: string;
  fetchImpl?: typeof fetch;
  bookingService?: IBookingService;
  invoicingService?: IInvoicingService;
  nowMs?: number;
}): Promise<{
  httpStatus: number;
  body: Record<string, any>;
}> {
  const cleanToken = String(params.payToken || '').trim();
  const cleanPiId = String(params.paymentIntentId || '').trim();

  if (!isValidPayToken(cleanToken)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'Invalid payment link token.' },
    };
  }

  if (!STRIPE_PI_PATTERN.test(cleanPiId)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'Valid Stripe paymentIntentId (pi_...) is required.' },
    };
  }

  const lookup = await lookupPublicPayLinkServer(cleanToken, { nowMs: params.nowMs });
  if (!lookup.found || !lookup.payLink) {
    return {
      httpStatus: 404,
      body: { success: false, error: 'Payment link not found.' },
    };
  }

  const payLink = lookup.payLink;
  if (payLink.status === 'paid') {
    return {
      httpStatus: 200,
      body: {
        success: true,
        alreadySettled: true,
        payLink,
        receiptNumber: payLink.receiptNumber,
      },
    };
  }

  const gateway = getStripeGatewayServerStatus(params.stripeSecretKeyOverride);
  if (!gateway.stripeConfigured) {
    return {
      httpStatus: 503,
      body: {
        success: false,
        stripeConfigured: false,
        error: 'Stripe payment gateway is not configured on the server.',
      },
    };
  }

  const fetchFn = params.fetchImpl || fetch;
  let piJson: Record<string, any>;
  try {
    const resp = await fetchFn(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(cleanPiId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${gateway.stripeSecretKey}`,
        },
      }
    );
    piJson = (await resp.json()) as Record<string, any>;
    if (!resp.ok || !piJson?.id) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: piJson?.error?.message || 'Unable to verify PaymentIntent with Stripe.',
        },
      };
    }
  } catch (err: any) {
    return {
      httpStatus: 502,
      body: {
        success: false,
        error: err?.message || 'Network error verifying PaymentIntent with Stripe.',
      },
    };
  }

  const piStatus = String(piJson.status || '');
  if (piStatus !== 'succeeded' && piStatus !== 'requires_capture') {
    return {
      httpStatus: 400,
      body: {
        success: false,
        status: piStatus,
        error: `PaymentIntent status is "${piStatus}" (expected succeeded or requires_capture).`,
      },
    };
  }

  // Anti-Tamper Cross-Link & Amount Verification
  const metaPayToken = String(piJson.metadata?.payToken || '').trim();
  const metaTargetId = String(piJson.metadata?.targetId || '').trim();
  if (metaPayToken !== cleanToken || (metaTargetId && metaTargetId !== payLink.targetId)) {
    return {
      httpStatus: 403,
      body: {
        success: false,
        code: 'METADATA_MISMATCH',
        error: 'PaymentIntent does not belong to this payment link.',
      },
    };
  }

  const verifiedCents = Number(piJson.amount_received ?? piJson.amount ?? 0);
  const minExpectedCents = Math.round(payLink.baseAmount * 100);
  if (!Number.isFinite(verifiedCents) || verifiedCents < minExpectedCents) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        code: 'AMOUNT_MISMATCH',
        error: 'Verified Stripe PaymentIntent amount is lower than the authoritative balance.',
      },
    };
  }

  const verifiedDollars = Number((verifiedCents / 100).toFixed(2));
  const verifiedTip = Number(
    Math.max(
      0,
      piJson.metadata?.tipAmount !== undefined
        ? Number(piJson.metadata.tipAmount)
        : verifiedDollars - payLink.baseAmount
    ).toFixed(2)
  );

  const chargeCard = piJson?.charges?.data?.[0]?.payment_method_details?.card;
  const settled = await settleVerifiedPaymentIntent(
    {
      paymentIntentId: cleanPiId,
      stripeStatus: piStatus as 'succeeded' | 'requires_capture',
      amountDollars: verifiedDollars,
      currency: String(piJson.currency || 'usd'),
      payToken: cleanToken,
      targetType: payLink.targetType,
      targetId: payLink.targetId,
      baseAmount: payLink.baseAmount,
      tipAmount: payLink.allowTip ? verifiedTip : 0,
      cardBrand: typeof chargeCard?.brand === 'string' ? chargeCard.brand : undefined,
      cardLast4: typeof chargeCard?.last4 === 'string' ? chargeCard.last4 : undefined,
      source: 'pay_link_confirm',
    },
    {
      bookingService: params.bookingService,
      invoicingService: params.invoicingService,
      nowMs: params.nowMs,
    }
  );

  return {
    httpStatus: 200,
    body: {
      success: true,
      alreadySettled: settled.alreadySettled,
      receiptNumber: settled.receiptNumber,
      payLink: settled.payLink || payLink,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. HTTP Route Handlers for `app/routes/api.pay.ts`
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePayApiGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').trim();

  if (!isValidPayToken(token)) {
    return Response.json(
      { success: false, error: 'Valid payment link token (pay_...) is required.' },
      { status: 400 }
    );
  }

  const clientIp = getRequestClientIp(request);
  if (!checkRateLimit(`pay_get:${clientIp}`, 60, 60_000)) {
    return Response.json(
      { success: false, error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429 }
    );
  }

  const res = await lookupPublicPayLinkServer(token);
  if (!res.found || !res.payLink) {
    return Response.json(
      {
        success: false,
        error: 'Payment link not found.',
        stripeConfigured: res.stripeConfigured,
      },
      { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  return Response.json(
    {
      success: true,
      payLink: res.payLink,
      stripeConfigured: res.stripeConfigured,
      stripePublishableKey: res.stripePublishableKey,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function handlePayApiPost(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  let body: Record<string, any>;
  try {
    body = (await request.json()) as Record<string, any>;
  } catch {
    return Response.json(
      { success: false, error: 'Malformed JSON request body.' },
      { status: 400 }
    );
  }

  const action = String(body?.action || '').trim();
  if (!action) {
    return Response.json(
      { success: false, error: 'Malformed request: "action" is required.' },
      { status: 400 }
    );
  }

  const clientIp = getRequestClientIp(request);

  // ─── Action 1: `create_link` (Authenticated Dispatcher / Admin / Driver) ───
  if (action === 'create_link') {
    const auth = await verifyServerRequestAuth(request);
    const enforceAuth =
      process.env.NODE_ENV === 'production' ||
      isFirebaseConfigured() ||
      Boolean(process.env.ADMIN_API_SECRET?.trim());

    if (enforceAuth && !auth.isDispatcher && !auth.isDriver) {
      return Response.json(
        {
          success: false,
          error: 'Unauthorized: Dispatcher, Administrator, or Driver sign-in required.',
        },
        { status: auth.authenticated ? 403 : 401 }
      );
    }

    const createRes = await createOrReusePayLinkServer({
      targetType: body.targetType === 'invoice' ? 'invoice' : 'trip',
      targetId: String(body.targetId || ''),
      expiresInHours: body.expiresInHours !== undefined ? Number(body.expiresInHours) : undefined,
      sendSms: Boolean(body.sendSms),
      recipientPhone: typeof body.recipientPhone === 'string' ? body.recipientPhone : undefined,
      sendEmail: Boolean(body.sendEmail),
      recipientEmail: typeof body.recipientEmail === 'string' ? body.recipientEmail : undefined,
      origin: resolveRequestOrigin(request),
      bearerToken: auth.rawToken,
      callerUid: auth.uid,
      isDispatcher: auth.isDispatcher || !enforceAuth,
      isDriver: auth.isDriver,
      tripSnapshot: !isFirebaseConfigured() ? body.tripSnapshot : undefined,
      invoiceSnapshot: !isFirebaseConfigured() ? body.invoiceSnapshot : undefined,
    });

    if (!createRes.success) {
      return Response.json(
        { success: false, error: createRes.error || 'Unable to generate payment link.' },
        { status: createRes.status }
      );
    }

    return Response.json(createRes, { status: 200 });
  }

  // ─── Action 2: `create_checkout_intent` (Rate-Limited Public Action) ───
  if (action === 'create_checkout_intent') {
    const payToken = String(body.payToken || '').trim();
    if (!checkRateLimit(`pay_intent:${clientIp}:${payToken.slice(0, 24)}`, 15, 5 * 60_000)) {
      return Response.json(
        {
          success: false,
          error: 'Too many checkout attempts. Please wait a moment and try again.',
        },
        { status: 429 }
      );
    }

    const intentRes = await createPayLinkCheckoutIntentServer({
      payToken,
      tipAmount: body.tipAmount,
    });

    return Response.json(intentRes.body, { status: intentRes.httpStatus });
  }

  // ─── Action 3: `confirm_payment` (Rate-Limited Public Action) ───
  if (action === 'confirm_payment') {
    const payToken = String(body.payToken || '').trim();
    if (!checkRateLimit(`pay_confirm:${clientIp}:${payToken.slice(0, 24)}`, 20, 5 * 60_000)) {
      return Response.json(
        {
          success: false,
          error: 'Too many confirmation attempts. Please wait a moment and try again.',
        },
        { status: 429 }
      );
    }

    const confirmRes = await confirmPayLinkPaymentServer({
      payToken,
      paymentIntentId: String(body.paymentIntentId || ''),
    });

    return Response.json(confirmRes.body, { status: confirmRes.httpStatus });
  }

  return Response.json(
    { success: false, error: `Unsupported pay action: ${action}` },
    { status: 400 }
  );
}
