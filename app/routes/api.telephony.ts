/**
 * Serverless / SSR Resource Route: Telephony & Twilio Gateway (`/api/telephony`)
 *
 * Thin `loader`/`action` wrapper delegating strictly to `telephony-gateway.server.ts`
 * so all `twilio` SDK, `node:crypto`, and secret credential logic stay isolated on the
 * server and `api.telephony` compiles to a `0.00 kB` client bundle.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  handleTelephonyGet,
  handleTelephonyPost,
} from '../core/services/comms/telephony-gateway.server';

export type {
  StoredSms,
  StoredVoicemail,
  TelephonyActionName,
  TelephonyApiRequest,
} from '../core/services/comms/telephony-gateway.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleTelephonyGet(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleTelephonyPost(request);
}
