import type { LoaderFunctionArgs } from 'react-router';
import { buildRobotsTxtResponse } from '../core/services/seo/local-corridor-seo.server';

/**
 * Dynamic SSR Resource Route (`/robots.txt`)
 * Exports ONLY `loader` (`0.00 kB` client bundle).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  return buildRobotsTxtResponse(request);
}
