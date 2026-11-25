/**
 * Server-Isolated Saved Payment Methods Vault (`saved-cards.server.ts`)
 *
 * Strictly server-only (`*.server.ts` -> `0.00 kB` client bundle).
 * Handles PCI-DSS Level 1 tokenized Stripe Customer + SetupIntent vaulting,
 * staff-authenticated PaymentMethod listing, and off-session saved card settlement.
 * Never accepts or persists raw PAN or CVC values.
 */

import type { VerifiedServerAuth } from '../auth/server-auth.server';
import type { ClientSavedPaymentMethod } from '../customer/contact.service';
import { isFirebaseConfigured } from '../firebase';
import {
  getServiceAccountDatastoreToken,
  patchFirestoreDocumentRest,
} from './stripe-webhook.server';

export const STRIPE_CUS_ID_PATTERN = /^cus_[a-zA-Z0-9]{6,64}$/;
export const STRIPE_PM_ID_PATTERN = /^pm_[a-zA-Z0-9]{6,64}$/;
export const STRIPE_SETI_ID_PATTERN = /^seti_[a-zA-Z0-9]{6,64}$/;

export interface StripeCustomerResolutionResult {
  success: boolean;
  stripeCustomerId?: string;
  error?: string;
}

export async function findOrCreateStripeCustomerServer(params: {
  stripeSecretKey: string;
  stripeCustomerId?: string;
  contactId?: string;
  name?: string;
  email?: string;
  phone?: string;
  fetchImpl?: typeof fetch;
}): Promise<StripeCustomerResolutionResult> {
  const existingCus = String(params.stripeCustomerId || '').trim();
  if (existingCus && STRIPE_CUS_ID_PATTERN.test(existingCus)) {
    return { success: true, stripeCustomerId: existingCus };
  }

  const fetchFn = params.fetchImpl || fetch;
  const form = new URLSearchParams();
  if (params.name?.trim()) form.append('name', params.name.trim().slice(0, 120));
  if (params.email?.trim()) form.append('email', params.email.trim().slice(0, 120));
  if (params.phone?.trim()) form.append('phone', params.phone.trim().slice(0, 40));
  if (params.contactId?.trim()) {
    form.append('metadata[contactId]', params.contactId.trim().slice(0, 64));
  }

  try {
    const resp = await fetchFn('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok || !json?.id || !STRIPE_CUS_ID_PATTERN.test(String(json.id))) {
      return {
        success: false,
        error: json?.error?.message || 'Unable to create Stripe customer vault profile.',
      };
    }
    return { success: true, stripeCustomerId: String(json.id) };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error communicating with Stripe customer API.',
    };
  }
}

export async function handleCreateSetupIntentServer(params: {
  stripeSecretKey: string;
  stripeCustomerId?: string;
  contactId?: string;
  name?: string;
  email?: string;
  phone?: string;
  payToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ httpStatus: number; body: Record<string, any> }> {
  const key = String(params.stripeSecretKey || '').trim();
  if (!key || !key.startsWith('sk_')) {
    return {
      httpStatus: 503,
      body: {
        success: false,
        stripeDisabled: true,
        error:
          'Online Stripe card vaulting is not configured on this server. Save a 4-digit card reference instead.',
      },
    };
  }

  const cusRes = await findOrCreateStripeCustomerServer({
    stripeSecretKey: key,
    stripeCustomerId: params.stripeCustomerId,
    contactId: params.contactId,
    name: params.name,
    email: params.email,
    phone: params.phone,
    fetchImpl: params.fetchImpl,
  });

  if (!cusRes.success || !cusRes.stripeCustomerId) {
    return {
      httpStatus: 400,
      body: { success: false, error: cusRes.error || 'Failed to resolve Stripe customer.' },
    };
  }

  const fetchFn = params.fetchImpl || fetch;
  const form = new URLSearchParams();
  form.append('customer', cusRes.stripeCustomerId);
  form.append('usage', 'off_session');
  form.append('payment_method_types[0]', 'card');
  if (params.contactId?.trim()) {
    form.append('metadata[contactId]', params.contactId.trim().slice(0, 64));
  }
  if (params.payToken?.trim()) {
    form.append('metadata[payToken]', params.payToken.trim().slice(0, 80));
  }

  try {
    const resp = await fetchFn('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok || !json?.client_secret || !json?.id) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: json?.error?.message || 'Failed to create Stripe SetupIntent.',
        },
      };
    }

    return {
      httpStatus: 200,
      body: {
        success: true,
        clientSecret: String(json.client_secret),
        setupIntentId: String(json.id),
        stripeCustomerId: cusRes.stripeCustomerId,
      },
    };
  } catch (err: any) {
    return {
      httpStatus: 502,
      body: {
        success: false,
        error: err?.message || 'Network error creating Stripe SetupIntent.',
      },
    };
  }
}

export async function handleListSavedMethodsServer(params: {
  auth: VerifiedServerAuth;
  enforceAuth: boolean;
  stripeSecretKey: string;
  stripeCustomerId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ httpStatus: number; body: Record<string, any> }> {
  if (params.enforceAuth && !params.auth.isDispatcher) {
    return {
      httpStatus: params.auth.authenticated ? 403 : 401,
      body: {
        success: false,
        error: 'Unauthorized: Dispatcher or Administrator sign-in required.',
      },
    };
  }

  const cusId = String(params.stripeCustomerId || '').trim();
  if (!STRIPE_CUS_ID_PATTERN.test(cusId)) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        error: 'Valid Stripe customer ID (cus_...) is required.',
      },
    };
  }

  const key = String(params.stripeSecretKey || '').trim();
  if (!key || !key.startsWith('sk_')) {
    return {
      httpStatus: 503,
      body: {
        success: false,
        stripeDisabled: true,
        stripeCustomerId: cusId,
        methods: [],
        error: 'Stripe secret key is not configured on the server.',
      },
    };
  }

  const fetchFn = params.fetchImpl || fetch;
  try {
    const resp = await fetchFn(
      `https://api.stripe.com/v1/payment_methods?customer=${encodeURIComponent(cusId)}&type=card`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      }
    );
    const json = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok || !Array.isArray(json?.data)) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: json?.error?.message || 'Unable to list saved Stripe payment methods.',
        },
      };
    }

    const methods: ClientSavedPaymentMethod[] = json.data
      .filter((pm: any) => pm?.id && STRIPE_PM_ID_PATTERN.test(String(pm.id)) && pm?.card?.last4)
      .map((pm: any, index: number) => ({
        id: String(pm.id),
        brand: String(pm.card.brand || 'card').toLowerCase(),
        last4: String(pm.card.last4).slice(-4),
        expMonth: Math.min(12, Math.max(1, Number(pm.card.exp_month) || 12)),
        expYear: Number(pm.card.exp_year) || 2030,
        cardholderName: pm.billing_details?.name ? String(pm.billing_details.name) : undefined,
        isDefault: index === 0,
        mode: 'stripe_pm' as const,
        stripeCustomerId: cusId,
        addedAt: pm.created
          ? new Date(Number(pm.created) * 1000).toISOString()
          : new Date().toISOString(),
      }));

    return {
      httpStatus: 200,
      body: {
        success: true,
        stripeCustomerId: cusId,
        methods,
      },
    };
  } catch (err: any) {
    return {
      httpStatus: 502,
      body: {
        success: false,
        error: err?.message || 'Network error listing saved payment methods.',
      },
    };
  }
}

export async function handleChargeSavedMethodServer(params: {
  auth: VerifiedServerAuth;
  enforceAuth: boolean;
  stripeSecretKey: string;
  stripeCustomerId?: string;
  paymentMethodId?: string;
  amount?: unknown;
  currency?: string;
  tripId?: string;
  description?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ httpStatus: number; body: Record<string, any> }> {
  if (params.enforceAuth && !params.auth.isDispatcher) {
    return {
      httpStatus: params.auth.authenticated ? 403 : 401,
      body: {
        success: false,
        error:
          'Unauthorized: Dispatcher or Administrator sign-in required to charge a saved payment method.',
      },
    };
  }

  const cusId = String(params.stripeCustomerId || '').trim();
  if (!STRIPE_CUS_ID_PATTERN.test(cusId)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'Valid Stripe customer ID (cus_...) is required.' },
    };
  }

  const pmId = String(params.paymentMethodId || '').trim();
  if (!STRIPE_PM_ID_PATTERN.test(pmId)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'Valid Stripe paymentMethodId (pm_...) is required.' },
    };
  }

  const rawAmount = Number(params.amount);
  if (!Number.isFinite(rawAmount) || rawAmount < 5 || rawAmount > 10000) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        error: 'Invalid charge amount for saved payment method ($5.00 - $10,000.00).',
      },
    };
  }

  const currency = String(params.currency || 'usd').toLowerCase();
  if (currency !== 'usd') {
    return {
      httpStatus: 400,
      body: { success: false, error: `Unsupported currency: ${currency}.` },
    };
  }

  const key = String(params.stripeSecretKey || '').trim();
  if (!key || !key.startsWith('sk_')) {
    return {
      httpStatus: 503,
      body: {
        success: false,
        stripeDisabled: true,
        fallback: 'reference_settlement',
        error: 'Stripe secret key is not configured on the server.',
      },
    };
  }

  const amountInCents = Math.round(rawAmount * 100);
  const form = new URLSearchParams();
  form.append('amount', String(amountInCents));
  form.append('currency', currency);
  form.append('customer', cusId);
  form.append('payment_method', pmId);
  form.append('off_session', 'true');
  form.append('confirm', 'true');
  form.append('expand[0]', 'payment_method');
  if (params.tripId?.trim()) {
    form.append('metadata[tripId]', params.tripId.trim().slice(0, 64));
  }
  if (params.description?.trim()) {
    form.append('description', params.description.trim().slice(0, 160));
  }

  const fetchFn = params.fetchImpl || fetch;
  try {
    const resp = await fetchFn('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok || !json?.id) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: json?.error?.message || 'Saved card off-session charge was declined by Stripe.',
        },
      };
    }

    const pmCard =
      json?.payment_method?.card || json?.charges?.data?.[0]?.payment_method_details?.card;

    return {
      httpStatus: 200,
      body: {
        success: true,
        paymentIntentId: String(json.id),
        status: String(json.status || 'succeeded'),
        amount: Number((Number(json.amount ?? amountInCents) / 100).toFixed(2)),
        currency,
        brand: typeof pmCard?.brand === 'string' ? pmCard.brand.toLowerCase() : undefined,
        last4: typeof pmCard?.last4 === 'string' ? pmCard.last4.slice(-4) : undefined,
      },
    };
  } catch (err: any) {
    return {
      httpStatus: 502,
      body: {
        success: false,
        error: err?.message || 'Network error charging saved payment method.',
      },
    };
  }
}

export async function verifySetupIntentAndExtractMethodServer(params: {
  setupIntentId: string;
  expectedPayToken?: string;
  contactId?: string;
  stripeSecretKey: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  httpStatus: number;
  body: Record<string, any>;
  savedMethod?: ClientSavedPaymentMethod;
}> {
  const cleanSeti = String(params.setupIntentId || '').trim();
  if (!STRIPE_SETI_ID_PATTERN.test(cleanSeti)) {
    return {
      httpStatus: 400,
      body: { success: false, error: 'Valid Stripe setupIntentId (seti_...) is required.' },
    };
  }

  const key = String(params.stripeSecretKey || '').trim();
  if (!key || !key.startsWith('sk_')) {
    return {
      httpStatus: 503,
      body: { success: false, stripeDisabled: true, error: 'Stripe gateway is not configured.' },
    };
  }

  const fetchFn = params.fetchImpl || fetch;
  try {
    const resp = await fetchFn(
      `https://api.stripe.com/v1/setup_intents/${encodeURIComponent(cleanSeti)}?expand[]=payment_method`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      }
    );
    const json = (await resp.json().catch(() => ({}))) as Record<string, any>;
    if (!resp.ok || !json?.id) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: json?.error?.message || 'Unable to verify SetupIntent with Stripe.',
        },
      };
    }

    if (String(json.status || '') !== 'succeeded') {
      return {
        httpStatus: 400,
        body: {
          success: false,
          status: json.status,
          error: `SetupIntent status is "${json.status}" (expected succeeded).`,
        },
      };
    }

    const metaToken = String(json.metadata?.payToken || '').trim();
    if (params.expectedPayToken && metaToken && metaToken !== params.expectedPayToken) {
      return {
        httpStatus: 403,
        body: {
          success: false,
          code: 'METADATA_MISMATCH',
          error: 'SetupIntent does not belong to this card setup link.',
        },
      };
    }

    const pmObj = typeof json.payment_method === 'object' ? json.payment_method : null;
    const pmId = String(pmObj?.id || json.payment_method || '').trim();
    const cusId = String(
      typeof json.customer === 'object' ? json.customer?.id : json.customer || ''
    ).trim();
    if (!STRIPE_PM_ID_PATTERN.test(pmId)) {
      return {
        httpStatus: 400,
        body: { success: false, error: 'Verified SetupIntent did not yield a valid pm_... token.' },
      };
    }

    const savedMethod: ClientSavedPaymentMethod = {
      id: pmId,
      brand: String(pmObj?.card?.brand || 'card').toLowerCase(),
      last4: String(pmObj?.card?.last4 || '0000').slice(-4),
      expMonth: Math.min(12, Math.max(1, Number(pmObj?.card?.exp_month) || 12)),
      expYear: Number(pmObj?.card?.exp_year) || 2030,
      cardholderName: pmObj?.billing_details?.name
        ? String(pmObj.billing_details.name)
        : undefined,
      isDefault: true,
      mode: 'stripe_pm',
      ...(STRIPE_CUS_ID_PATTERN.test(cusId) ? { stripeCustomerId: cusId } : {}),
      addedAt: new Date().toISOString(),
    };

    if (params.contactId && isFirebaseConfigured()) {
      const saToken = await getServiceAccountDatastoreToken();
      if (saToken) {
        await patchFirestoreDocumentRest(
          'contacts',
          params.contactId,
          {
            ...(STRIPE_CUS_ID_PATTERN.test(cusId) ? { stripeCustomerId: cusId } : {}),
            updatedAt: Date.now(),
          },
          saToken,
          false
        ).catch(() => null);
      }
    }

    return {
      httpStatus: 200,
      body: {
        success: true,
        setupIntentId: cleanSeti,
        stripeCustomerId: STRIPE_CUS_ID_PATTERN.test(cusId) ? cusId : undefined,
        savedMethod,
      },
      savedMethod,
    };
  } catch (err: any) {
    return {
      httpStatus: 502,
      body: {
        success: false,
        error: err?.message || 'Network error verifying SetupIntent with Stripe.',
      },
    };
  }
}
