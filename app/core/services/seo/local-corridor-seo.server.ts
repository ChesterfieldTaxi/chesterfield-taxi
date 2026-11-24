import type { AppSettings } from '../../types/config';
import { loadPublicSettingsForServer } from '../config/public-settings.server';
import {
  generateRobotsTxt,
  generateSitemapXml,
  resolveCanonicalSiteOrigin,
} from './local-corridor-seo.service';

/**
 * Server-isolated Response builders for `/robots.txt` and `/sitemap.xml`.
 * Kept inside a `*.server.ts` module so `app/routes/robots.txt.ts` and
 * `app/routes/sitemap.xml.ts` emit `0.00 kB` empty client route chunks.
 */
export function buildRobotsTxtResponse(request: Request): Response {
  const origin = resolveCanonicalSiteOrigin(request);
  const body = generateRobotsTxt(origin);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

export async function buildSitemapXmlResponse(request: Request): Promise<Response> {
  const origin = resolveCanonicalSiteOrigin(request);
  const lastmodDate = new Date().toISOString().slice(0, 10);

  let settings: Partial<AppSettings> | undefined;
  try {
    const loaded = await Promise.race<Partial<AppSettings> | null>([
      loadPublicSettingsForServer(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    settings = loaded ?? undefined;
  } catch {
    settings = undefined;
  }

  const body = generateSitemapXml({ origin, lastmodDate, settings });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
