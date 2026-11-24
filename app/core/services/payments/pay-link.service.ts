/**
 * 1-Tap Pay Link & Webhook Diagnostics Client/Domain Service (`pay-link.service.ts`)
 *
 * Strictly adheres to `constitution.md`:
 * - Zero `node:crypto` imports (safe for all browser & SSR bundles).
 * - Encapsulates all `/api/pay`, `/api/payments/webhook`, and Firestore `/payLinks`
 *   interactions so React UI components remain declarative and free of domain logic.
 */

import { doc, setDoc } from 'firebase/firestore';
import {
  normalizeBillingSettingsConfig,
  type BillingSettingsConfig,
  type InvoiceRecord,
} from '../../types/config';
import type { Trip } from '../../types/trip';
import {
  isValidPayToken,
  sanitizePayLinkProjection,
  type PayLinkProjection,
} from '../../utils/pay-token.util';
import { authorizedFetch } from '../auth/auth-headers';
import { getAdminConfigService } from '../config/admin-config.service';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

export interface CreatePayLinkOptions {
  sendSms?: boolean;
  recipientPhone?: string;
  sendEmail?: boolean;
  recipientEmail?: string;
  expiresInHours?: number;
  allowTip?: boolean;
  billingSettings?: Partial<BillingSettingsConfig> | null;
}

export interface CreatePayLinkResult {
  success: boolean;
  error?: string;
  reused?: boolean;
  payToken?: string;
  payUrl?: string;
  payLink?: PayLinkProjection;
  smsResult?: { sent: boolean; simulated: boolean; recipient?: string; error?: string };
  emailResult?: { sent: boolean; simulated?: boolean; recipient?: string; error?: string };
}

export interface PublicPayLinkLookupResult {
  success: boolean;
  error?: string;
  payLink?: PayLinkProjection;
  stripeConfigured: boolean;
  stripePublishableKey?: string;
}

export interface CreateCheckoutIntentResult {
  success: boolean;
  stripeConfigured: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  amount?: number;
  baseAmount?: number;
  tipAmount?: number;
  currency?: string;
  message?: string;
  error?: string;
  code?: string;
  payLink?: PayLinkProjection;
}

export interface ConfirmPayLinkResult {
  success: boolean;
  alreadySettled?: boolean;
  receiptNumber?: string;
  payLink?: PayLinkProjection;
  error?: string;
  status?: string;
}

export interface WebhookDiagnosticsSummary {
  success: boolean;
  endpointPath: string;
  webhookSecretConfigured: boolean;
  stripeConfigured: boolean;
  stripeMode: 'live' | 'test' | 'unconfigured';
  toleranceSeconds: number;
  subscribedEvents: string[];
  totalProcessedCount: number;
  recentEvents: Array<{
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
  }>;
  error?: string;
}

class PayLinkService {
  /**
   * Resolves any existing cached `payToken` on a Trip record.
   */
  getTripCachedPayToken(trip?: Trip | null): string | undefined {
    if (!trip) return undefined;
    const meta = (trip.metadata || {}) as Record<string, any>;
    const token =
      trip.payment?.payToken ||
      (typeof meta.payToken === 'string' ? meta.payToken : undefined);
    return token && isValidPayToken(token) ? token : undefined;
  }

  /**
   * Resolves the effective status of a Trip's payment/pay link (`paid` | `open` | `refunded` | `none`).
   */
  getTripPayLinkDisplayState(trip?: Trip | null): 'paid' | 'open' | 'refunded' | 'none' {
    if (!trip) return 'none';
    if (trip.payment?.status === 'refunded' || trip.payment?.payLinkStatus === 'refunded') {
      return 'refunded';
    }
    if (
      trip.payment?.status === 'captured' ||
      trip.payment?.status === 'settled' ||
      trip.payment?.payLinkStatus === 'paid'
    ) {
      return 'paid';
    }
    if (this.getTripCachedPayToken(trip)) {
      return 'open';
    }
    return 'none';
  }

  /**
   * Builds a full shareable `/pay/:payToken` URL in browser or SSR contexts.
   */
  buildPayUrl(payToken: string): string {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://chesterfieldtaxi.com';
    return `${origin}/pay/${encodeURIComponent(payToken)}`;
  }

  /**
   * Creates or reuses an active 1-tap Pay Link for a Trip (Dispatcher/Admin/Driver).
   */
  async createOrGetTripPayLink(
    trip: Trip,
    options?: CreatePayLinkOptions
  ): Promise<CreatePayLinkResult> {
    try {
      const policy = normalizeBillingSettingsConfig(
        options?.billingSettings ?? getAdminConfigService().getCachedSettings().billingSettings
      );
      const resp = await authorizedFetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_link',
          targetType: 'trip',
          targetId: trip.id,
          expiresInHours: options?.expiresInHours ?? policy.payLinkExpiryHours,
          allowTip: options?.allowTip ?? policy.payLinkAllowTipOnTrips,
          sendSms: options?.sendSms,
          recipientPhone: options?.recipientPhone || trip.passenger?.phone,
          sendEmail: options?.sendEmail,
          recipientEmail: options?.recipientEmail || trip.passenger?.email,
          tripSnapshot: !isFirebaseConfigured() ? trip : undefined,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as CreatePayLinkResult;
      if (!resp.ok || !data.success || !data.payLink) {
        return {
          success: false,
          error: data.error || 'Unable to generate trip payment link.',
        };
      }

      // Mirror sanitized projection to Firestore client SDK when authenticated as staff/driver
      if (isFirebaseConfigured() && typeof window !== 'undefined' && data.payLink.payToken) {
        try {
          const db = getFirestoreDb();
          if (db) {
            const cleanProjection = sanitizePayLinkProjection(data.payLink);
            await setDoc(
              doc(db, 'payLinks', cleanProjection.payToken),
              sanitizePayload(cleanProjection),
              { merge: true }
            ).catch(() => {});
          }
        } catch {
          // Non-blocking sync
        }
      }

      return data;
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error generating trip payment link.',
      };
    }
  }

  /**
   * Creates or reuses an active 1-tap Pay Link for a Corporate Invoice (Dispatcher/Admin).
   */
  async createOrGetInvoicePayLink(
    invoice: InvoiceRecord,
    options?: CreatePayLinkOptions
  ): Promise<CreatePayLinkResult> {
    try {
      const policy = normalizeBillingSettingsConfig(
        options?.billingSettings ?? getAdminConfigService().getCachedSettings().billingSettings
      );
      const resp = await authorizedFetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_link',
          targetType: 'invoice',
          targetId: invoice.id,
          expiresInHours: options?.expiresInHours ?? policy.payLinkExpiryHours,
          allowTip: options?.allowTip ?? policy.payLinkAllowTipOnInvoices,
          sendSms: options?.sendSms,
          recipientPhone: options?.recipientPhone,
          sendEmail: options?.sendEmail,
          recipientEmail: options?.recipientEmail || invoice.customerEmail,
          invoiceSnapshot: !isFirebaseConfigured() ? invoice : undefined,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as CreatePayLinkResult;
      if (!resp.ok || !data.success || !data.payLink) {
        return {
          success: false,
          error: data.error || 'Unable to generate invoice payment link.',
        };
      }

      if (isFirebaseConfigured() && typeof window !== 'undefined' && data.payLink.payToken) {
        try {
          const db = getFirestoreDb();
          if (db) {
            const cleanProjection = sanitizePayLinkProjection(data.payLink);
            await setDoc(
              doc(db, 'payLinks', cleanProjection.payToken),
              sanitizePayload(cleanProjection),
              { merge: true }
            ).catch(() => {});
          }
        } catch {
          // Non-blocking sync
        }
      }

      return data;
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error generating invoice payment link.',
      };
    }
  }

  /**
   * Public lookup (`GET /api/pay?token=pay_...`) returning sanitized `PayLinkProjection`.
   */
  async fetchPublicPayLink(payToken: string): Promise<PublicPayLinkLookupResult> {
    if (!isValidPayToken(payToken)) {
      return {
        success: false,
        error: 'Invalid payment link.',
        stripeConfigured: false,
      };
    }

    try {
      const resp = await fetch(`/api/pay?token=${encodeURIComponent(payToken.trim())}`, {
        headers: { Accept: 'application/json' },
      });
      const data = (await resp.json().catch(() => ({}))) as PublicPayLinkLookupResult;
      if (!resp.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Payment link not found or expired.',
          stripeConfigured: Boolean(data.stripeConfigured),
        };
      }
      return data;
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unable to load payment details right now.',
        stripeConfigured: false,
      };
    }
  }

  /**
   * Creates a server-authoritative Stripe `PaymentIntent` for a Pay Link.
   */
  async createCheckoutIntent(
    payToken: string,
    tipAmount: number = 0
  ): Promise<CreateCheckoutIntentResult> {
    try {
      const resp = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_checkout_intent',
          payToken,
          tipAmount: Math.max(0, Number(tipAmount.toFixed(2))),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as CreateCheckoutIntentResult;
      return data;
    } catch (err: any) {
      return {
        success: false,
        stripeConfigured: false,
        error: err?.message || 'Network error starting checkout.',
      };
    }
  }

  /**
   * Verifies a completed Stripe `PaymentIntent` on the server and settles the Pay Link.
   */
  async confirmPayment(
    payToken: string,
    paymentIntentId: string
  ): Promise<ConfirmPayLinkResult> {
    try {
      const resp = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_payment',
          payToken,
          paymentIntentId,
        }),
      });
      return (await resp.json().catch(() => ({
        success: false,
        error: 'Unexpected response confirming payment.',
      }))) as ConfirmPayLinkResult;
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error confirming payment.',
      };
    }
  }

  /**
   * Fetches staff-only Stripe webhook readiness & recent processed events (`/api/payments/webhook`).
   */
  async fetchWebhookDiagnostics(): Promise<WebhookDiagnosticsSummary> {
    try {
      const resp = await authorizedFetch('/api/payments/webhook', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await resp.json().catch(() => ({}))) as WebhookDiagnosticsSummary;
      if (!resp.ok || !data.success) {
        return {
          success: false,
          endpointPath: '/api/payments/webhook',
          webhookSecretConfigured: false,
          stripeConfigured: false,
          stripeMode: 'unconfigured',
          toleranceSeconds: 300,
          subscribedEvents: [],
          totalProcessedCount: 0,
          recentEvents: [],
          error: data.error || 'Unable to load Stripe webhook diagnostics.',
        };
      }
      return data;
    } catch (err: any) {
      return {
        success: false,
        endpointPath: '/api/payments/webhook',
        webhookSecretConfigured: false,
        stripeConfigured: false,
        stripeMode: 'unconfigured',
        toleranceSeconds: 300,
        subscribedEvents: [],
        totalProcessedCount: 0,
        recentEvents: [],
        error: err?.message || 'Network error loading webhook diagnostics.',
      };
    }
  }
}

let payLinkServiceInstance: PayLinkService | null = null;

export function getPayLinkService(): PayLinkService {
  if (!payLinkServiceInstance) {
    payLinkServiceInstance = new PayLinkService();
  }
  return payLinkServiceInstance;
}
