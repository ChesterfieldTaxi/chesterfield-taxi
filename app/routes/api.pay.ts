/**
 * Serverless Resource Route: Zero-PII 1-Tap Pay Links (`/api/pay`)
 *
 * - `GET /api/pay?token=pay_...`: IP rate-limited public lookup returning the
 *   sanitized `PayLinkProjection` + `{ stripeConfigured, stripePublishableKey }`
 *   (auto-transitioning expired open links).
 * - `POST /api/pay`:
 *   - `create_link` (authenticated Dispatcher/Admin/Driver)
 *   - `create_checkout_intent` (rate-limited public server-authoritative intent)
 *   - `confirm_payment` (rate-limited public server-verified Stripe settlement)
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { handlePayApiGet, handlePayApiPost } from '../core/services/payments/pay-link.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handlePayApiGet(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handlePayApiPost(request);
}
