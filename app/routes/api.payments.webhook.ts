/**
 * Serverless Resource Route: Verified Stripe Webhooks (`/api/payments/webhook`)
 *
 * - `POST`: Reads raw payload (`await request.text()`), verifies cryptographic
 *   HMAC-SHA256 `Stripe-Signature` header (`crypto.timingSafeEqual` + 300s replay window),
 *   enforces strict `/paymentWebhookEvents/{event.id}` idempotency, and reconciles
 *   Trip holds, Trip captures, Corporate Invoice settlements, failures, and refunds.
 * - `GET`: Authenticated staff diagnostics (Dispatcher / Admin only via `verifyServerRequestAuth`).
 *
 * All `node:crypto` and reconciliation logic lives in `stripe-webhook.server.ts`
 * so the client bundle chunk remains strictly `0.00 kB`.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  handleStripeWebhookGet,
  handleStripeWebhookPost,
} from '../core/services/payments/stripe-webhook.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleStripeWebhookGet(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleStripeWebhookPost(request);
}
