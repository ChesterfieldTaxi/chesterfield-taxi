/**
 * Serverless Scheduled SLA Monitor & Offer Cascade Cron (`/api/cron/sla-dispatch`)
 *
 * Schedule: Every 5 minutes (`* /5 * * * *` in `vercel.json`)
 * Methods: `GET` (Vercel Cron) and `POST` (Manual / Webhook trigger)
 *
 * Delegates all server-only authentication, Firestore REST queries, idempotent
 * `criticalNotifiedAt` stamping, email/SMS dispatch, and cascade maintenance to
 * `app/core/services/dispatch/sla-cron.server.ts`.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { handleCronHttpRequest } from '../core/services/dispatch/sla-cron.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleCronHttpRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleCronHttpRequest(request);
}
