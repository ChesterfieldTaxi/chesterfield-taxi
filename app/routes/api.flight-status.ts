/**
 * Serverless Resource Route: Live Flight Status Telemetry (`/api/flight-status`)
 *
 * - `GET /api/flight-status?diagnostics=1`: Authenticated staff readiness & cache diagnostics.
 * - `GET /api/flight-status?airline=WN&flightNumber=1425&serviceDate=YYYY-MM-DD`:
 *   Rate-limited 15-minute cached STL/SUS flight lookup.
 * - `POST /api/flight-status`: Rate-limited flight lookup & staff-only `forceRefresh`
 *   cache bypass (`0.00 kB` client bundle via `flight-status.server.ts`).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  handleFlightStatusGet,
  handleFlightStatusPost,
} from '../core/services/flight/flight-status.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleFlightStatusGet(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleFlightStatusPost(request);
}
