/**
 * Serverless / SSR Resource Route: Payment Gateway & Processors
 * 
 * Securely handles Stripe / Square payment intent creation, tokenization,
 * and processor verification on the server side using private API keys.
 */

import type { ActionFunctionArgs } from 'react-router';

export interface PaymentApiRequest {
  action: 'create_intent' | 'verify_processor' | 'capture_intent';
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

    const stripeSecretKey =
      process.env.STRIPE_SECRET_KEY ||
      data.credentials?.stripeSecretKey?.trim() ||
      '';
    const squareAccessToken =
      process.env.SQUARE_ACCESS_TOKEN ||
      data.credentials?.squareAccessToken?.trim() ||
      '';

    // ─── 1. Verify Processor Connectivity ───
    if (data.action === 'verify_processor') {
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
      const amountInCents = Math.round((data.amount || 0) * 100);
      const currency = data.currency || 'usd';

      if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
        // Fallback to simulated client-side intent
        const mockIntentId = `pi_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return Response.json({
          success: true,
          simulated: true,
          clientSecret: `${mockIntentId}_secret_test`,
          paymentIntentId: mockIntentId,
          amount: data.amount,
          currency,
          message: 'Payment pre-authorization recorded in sandbox test mode.',
        });
      }

      const params = new URLSearchParams();
      params.append('amount', String(amountInCents));
      params.append('currency', currency);
      params.append('capture_method', 'manual'); // Pre-authorization hold
      if (data.tripId) {
        params.append('metadata[tripId]', data.tripId);
      }
      if (data.paymentMethodId) {
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

    // ─── 3. Capture Payment Intent ───
    if (data.action === 'capture_intent') {
      if (!data.paymentIntentId) {
        return Response.json(
          { success: false, error: 'paymentIntentId is required to capture payment.' },
          { status: 400 }
        );
      }

      if (!stripeSecretKey || data.paymentIntentId.startsWith('pi_mock_')) {
        return Response.json({
          success: true,
          simulated: true,
          status: 'succeeded',
          paymentIntentId: data.paymentIntentId,
          message: 'Payment captured in sandbox test mode.',
        });
      }

      const captureParams = new URLSearchParams();
      if (data.amount) {
        captureParams.append('amount_to_capture', String(Math.round(data.amount * 100)));
      }

      const captureResp = await fetch(
        `https://api.stripe.com/v1/payment_intents/${data.paymentIntentId}/capture`,
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
