/**
 * Serverless / SSR Resource Route: Resend Outbound Email Gateway (`/api/send-email`)
 *
 * Thin `loader`/`action` wrapper delegating strictly to `dispatch-email.server.ts` so
 * all `node:crypto` RFC Message-ID generation, Resend dispatch, `/dispatchEmails`
 * persistence, and unified multi-channel `CommsThread` sync remain server-only and
 * `api.send-email` compiles to a `0.00 kB` client bundle.
 */

import type { ActionFunctionArgs } from 'react-router';
import {
  handleSendEmailGet,
  handleSendEmailPost,
} from '../core/services/email/dispatch-email.server';

export async function action({ request }: ActionFunctionArgs) {
  return handleSendEmailPost(request);
}

export async function loader() {
  return handleSendEmailGet();
}
