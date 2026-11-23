/**
 * Serverless Resource Route: Unattended Customer Booking Auto-Dispatch (`/api/auto-dispatch`)
 *
 * Strictly server-isolated (`0.00 kB` client bundle chunk) — delegates all rate-limiting,
 * authoritative Firestore REST verification, Pre-Pickup Lead-Window checks, and 4-mode
 * execution to `app/core/services/dispatch/auto-dispatch.server.ts`.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { handleAutoDispatchHttpRequest } from '../core/services/dispatch/auto-dispatch.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleAutoDispatchHttpRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleAutoDispatchHttpRequest(request);
}
