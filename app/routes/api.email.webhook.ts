/**
 * Serverless Resource Route: Resend Inbound & Delivery Webhook (`/api/email/webhook`)
 *
 * - `POST /api/email/webhook`: Svix HMAC-SHA256 verified Resend inbound (`email.received` for
 *   `dispatch@chesterfieldtaxi.com`) and delivery status (`email.sent`, `email.delivered`,
 *   `email.bounced`, `email.complained`, `email.delivery_delayed`) webhook engine.
 * - `GET /api/email/webhook?diagnostics=1`: Authenticated staff readiness & mailbox diagnostics.
 * - `GET/POST /api/email/webhook?action=sync_emails`: Authenticated staff sync & Firestore flush.
 *
 * Strictly delegates to `dispatch-email.server.ts` so `api.email.webhook` compiles to a
 * `0.00 kB` client bundle.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  handleEmailWebhookGet,
  handleEmailWebhookPost,
} from '../core/services/email/dispatch-email.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleEmailWebhookGet(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleEmailWebhookPost(request);
}
