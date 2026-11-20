/**
 * Serverless / SSR Resource Route: Payment Gateway & Processors
 *
 * Securely handles Stripe / Square payment intent creation, capture, and
 * processor verification on the server side using private API keys.
 *
 * Security controls:
 * - `verify_processor` requires verified Dispatcher/Admin auth; client credentials
 *   are never accepted in production.
 * - `capture_intent` requires verified Driver or Dispatcher/Admin auth, strictly
 *   validates `paymentIntentId` against `/^pi_[a-zA-Z0-9]+$/`, and never returns
 *   fake simulated capture success when Stripe is unconfigured.
 * - `create_intent` is rate-limited per IP, validates amount bounds/currency, and
 *   cleanly directs callers to Pay-in-Cab when Stripe is disabled.
 */

import type { ActionFunctionArgs } from 'react-router';
import { isFirebaseConfigured } from '../core/services/firebase';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
  verifyServerRequestAuth,
} from '../core/services/auth/server-auth.server';

export interface PaymentApiRequest {
  action: 'create_intent' | 'verify_processor' | 'capture_intent' | 'cancel_intent';
  processor?: 'stripe' | 'square';
  amount?: number; // In dollars (e.g. 45.50)
  currency?: string;
  tripId?: string;
  paymentMethodId?: string;
  paymentIntentId?: string;
  credentials?: {
    stripeSecretKey?: string;
    squareAccessToken?: string;
    squareLocationId?: string;
  };
}

const STRIPE_PI_PATTERN = /^pi_[a-zA-Z0-9]{8,64}$/;
const ALLOWED_CURRENCIES = new Set(['usd']);

export async function loader() {
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')
  );
  const rawPublishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  const stripePublishableKey = rawPublishableKey.startsWith('pk_') ? rawPublishableKey : undefined;
  const stripeWebhookConfigured = Boolean(
    process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')
  );
  const squareConfigured = Boolean(process.env.SQUARE_ACCESS_TOKEN);

  return Response.json({
    success: true,
    stripeConfigured,
    stripePublishableKey,
    stripeWebhookConfigured,
    squareConfigured,
    defaultCheckoutMode: stripeConfigured ? 'stripe_or_in_cab' : 'pay_in_cab',
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  try {
    const data = (await request.json()) as PaymentApiRequest;
    if (!data || !data.action) {
      return Response.json(
        { success: false, error: 'Malformed request: "action" is required.' },
        { status: 400 }
      );
    }

    const auth = await verifyServerRequestAuth(request);
    const enforceAuth = process.env.NODE_ENV === 'production' || isFirebaseConfigured();
    const isProduction = process.env.NODE_ENV === 'production';

    // Never permit untrusted client credentials in production
    const allowCustomCredentials =
      data.action === 'verify_processor' && !isProduction && (auth.isDispatcher || !enforceAuth);

    const stripeSecretKey =
      process.env.STRIPE_SECRET_KEY ||
      (allowCustomCredentials ? data.credentials?.stripeSecretKey?.trim() : '') ||
      '';
    const squareAccessToken =
      process.env.SQUARE_ACCESS_TOKEN ||
      (allowCustomCredentials ? data.credentials?.squareAccessToken?.trim() : '') ||
      '';

    // ─── 1. Verify Processor Connectivity (Staff Only) ───
    if (data.action === 'verify_processor') {
      if (enforceAuth && !auth.isDispatcher) {
        return Response.json(
          { success: false, error: 'Unauthorized: Administrator or Dispatcher sign-in required.' },
          { status: 403 }
        );
      }

      const targetProcessor = data.processor || 'stripe';

      if (targetProcessor === 'stripe') {
        if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
          return Response.json({
            success: false,
            configured: false,
            processor: 'stripe',
            message:
              'Stripe secret key not configured or invalid (must begin with sk_live_ or sk_test_).',
          });
        }

        try {
          const resp = await fetch('https://api.stripe.com/v1/balance', {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
            },
          });
          const result = (await resp.json()) as any;

          if (resp.ok) {
            const isLive = stripeSecretKey.startsWith('sk_live_');
            return Response.json({
              success: true,
              configured: true,
              processor: 'stripe',
              mode: isLive ? 'live' : 'test',
              message: `Stripe connection successful (${isLive ? 'Live Production Mode' : 'Test Sandbox Mode'}).`,
            });
          } else {
            return Response.json({
              success: false,
              configured: false,
              processor: 'stripe',
              error: result.error?.message || 'Stripe authentication failed',
            });
          }
        } catch (err: any) {
          return Response.json({
            success: false,
            configured: false,
            processor: 'stripe',
            error: err.message || 'Network error communicating with Stripe',
          });
        }
      }

      if (targetProcessor === 'square') {
        if (!squareAccessToken) {
          return Response.json({
            success: false,
            configured: false,
            processor: 'square',
            message: 'Square Access Token not configured.',
          });
        }

        try {
          const resp = await fetch('https://connect.squareup.com/v2/locations', {
            headers: {
              Authorization: `Bearer ${squareAccessToken}`,
              'Content-Type': 'application/json',
            },
          });
          const result = (await resp.json()) as any;

          if (resp.ok && result.locations) {
            return Response.json({
              success: true,
              configured: true,
              processor: 'square',
              locationCount: result.locations.length,
              message: `Square connection successful (${result.locations.length} locations found).`,
            });
          } else {
            return Response.json({
              success: false,
              configured: false,
              processor: 'square',
              error: result.errors?.[0]?.detail || 'Square authentication failed',
            });
          }
        } catch (err: any) {
          return Response.json({
            success: false,
            configured: false,
            processor: 'square',
            error: err.message || 'Network error communicating with Square',
          });
        }
      }
    }

    // ─── 2. Create Payment Intent (Stripe) ───
    if (data.action === 'create_intent') {
      const clientIp = getRequestClientIp(request);
      if (!auth.isDispatcher && !checkRateLimit(`pay_create:${clientIp}`, 20, 5 * 60_000)) {
        return Response.json(
          { success: false, error: 'Too many payment requests. Please wait a moment and try again.' },
          { status: 429 }
        );
      }

      const rawAmount = Number(data.amount || 0);
      if (!Number.isFinite(rawAmount) || rawAmount < 5 || rawAmount > 10000) {
        return Response.json(
          { success: false, error: 'Invalid fare amount for payment intent ($5.00 - $10,000.00).' },
          { status: 400 }
        );
      }

      const currency = String(data.currency || 'usd').toLowerCase();
      if (!ALLOWED_CURRENCIES.has(currency)) {
        return Response.json(
          { success: false, error: `Unsupported currency: ${currency}.` },
          { status: 400 }
        );
      }

      // Cross-check fare bounds when caller is authenticated and references an existing Trip
      if (data.tripId && auth.rawToken) {
        const tripDoc = await fetchFirestoreDocumentRest('trips', data.tripId, auth.rawToken);
        const quotedFare = Number(tripDoc?.pricing?.totalFare);
        if (Number.isFinite(quotedFare) && quotedFare > 0 && rawAmount > quotedFare * 2 + 250) {
          return Response.json(
            { success: false, error: 'Requested charge amount exceeds allowable trip fare bounds.' },
            { status: 400 }
          );
        }
      }

      const amountInCents = Math.round(rawAmount * 100);

      if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
        return Response.json(
          {
            success: false,
            stripeDisabled: true,
            fallback: 'pay_in_cab',
            error:
              'Online card pre-authorization is currently disabled. Please select "Pay Driver in Cab (Cash / Terminal)".',
          },
          { status: 503 }
        );
      }

      const params = new URLSearchParams();
      params.append('amount', String(amountInCents));
      params.append('currency', currency);
      params.append('capture_method', 'manual');
      if (data.tripId) {
        params.append('metadata[tripId]', String(data.tripId).slice(0, 64));
      }
      if (data.paymentMethodId && /^pm_[a-zA-Z0-9]+$/.test(data.paymentMethodId)) {
        params.append('payment_method', data.paymentMethodId);
      }

      const stripeResp = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const stripeResult = (await stripeResp.json()) as any;

      if (stripeResp.ok) {
        return Response.json({
          success: true,
          simulated: false,
          clientSecret: stripeResult.client_secret,
          paymentIntentId: stripeResult.id,
          status: stripeResult.status,
          amount: stripeResult.amount / 100,
          currency: stripeResult.currency,
        });
      } else {
        return Response.json(
          {
            success: false,
            error: stripeResult.error?.message || 'Failed to create Stripe payment intent',
          },
          { status: 400 }
        );
      }
    }

    // ─── 3. Capture Payment Intent (Driver or Staff Only) ───
    if (data.action === 'capture_intent') {
      if (enforceAuth && !auth.isDispatcher && !auth.isDriver) {
        return Response.json(
          { success: false, error: 'Unauthorized: Driver or Dispatcher authentication required to capture payments.' },
          { status: 403 }
        );
      }

      const paymentIntentId = String(data.paymentIntentId || '').trim();
      if (!paymentIntentId || !STRIPE_PI_PATTERN.test(paymentIntentId)) {
        return Response.json(
          { success: false, error: 'Valid Stripe paymentIntentId (pi_...) is required to capture payment.' },
          { status: 400 }
        );
      }

      if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
        return Response.json(
          {
            success: false,
            stripeDisabled: true,
            fallback: 'pay_in_cab',
            error:
              'Online Stripe capture is not configured on the server. Settle via Pay-in-Cab (Cash, External Card Terminal, or Corporate Account).',
          },
          { status: 503 }
        );
      }

      const captureParams = new URLSearchParams();
      if (data.amount !== undefined) {
        const amt = Number(data.amount);
        if (!Number.isFinite(amt) || amt <= 0 || amt > 10000) {
          return Response.json(
            { success: false, error: 'Invalid capture amount.' },
            { status: 400 }
          );
        }
        captureParams.append('amount_to_capture', String(Math.round(amt * 100)));
      }

      const captureResp = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: captureParams.toString(),
        }
      );

      const captureResult = (await captureResp.json()) as any;

      if (captureResp.ok) {
        return Response.json({
          success: true,
          simulated: false,
          status: captureResult.status,
          paymentIntentId: captureResult.id,
        });
      } else {
        return Response.json(
          {
            success: false,
            error: captureResult.error?.message || 'Failed to capture payment',
          },
          { status: 400 }
        );
      }
    }

    // ─── 4. Cancel / Release Pre-Auth Hold (Driver or Staff Only) ───
    if (data.action === 'cancel_intent') {
      if (enforceAuth && !auth.isDispatcher && !auth.isDriver) {
        return Response.json(
          { success: false, error: 'Unauthorized: Staff or Driver authentication required to release holds.' },
          { status: 403 }
        );
      }

      const paymentIntentId = String(data.paymentIntentId || '').trim();
      if (!paymentIntentId || !STRIPE_PI_PATTERN.test(paymentIntentId)) {
        return Response.json(
          { success: false, error: 'Valid Stripe paymentIntentId (pi_...) is required.' },
          { status: 400 }
        );
      }

      if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
        return Response.json(
          { success: false, stripeDisabled: true, error: 'Stripe is not configured on the server.' },
          { status: 503 }
        );
      }

      const cancelResp = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
          },
        }
      );

      const cancelResult = (await cancelResp.json()) as any;
      if (cancelResp.ok) {
        return Response.json({
          success: true,
          status: cancelResult.status,
          paymentIntentId: cancelResult.id,
        });
      } else {
        return Response.json(
          { success: false, error: cancelResult.error?.message || 'Failed to cancel payment intent' },
          { status: 400 }
        );
      }
    }

    return Response.json(
      { success: false, error: `Unsupported payment action: ${data.action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.payments] Server error:', errorMessage);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
