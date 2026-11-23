import type { LoaderFunctionArgs } from 'react-router';
import { buildSitemapXmlResponse } from '../core/services/seo/local-corridor-seo.server';

/**
 * Dynamic SSR Resource Route (`/sitemap.xml`)
 * Exports ONLY `loader` (`0.00 kB` client bundle).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  return buildSitemapXmlResponse(request);
}
