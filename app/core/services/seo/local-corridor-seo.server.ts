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

export function buildSitemapXmlResponse(request: Request): Response {
  const origin = resolveCanonicalSiteOrigin(request);
  const lastmodDate = new Date().toISOString().slice(0, 10);
  const body = generateSitemapXml({ origin, lastmodDate });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
