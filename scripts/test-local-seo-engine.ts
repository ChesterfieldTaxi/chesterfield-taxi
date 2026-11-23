/**
 * Phase 58 Automated Verification Suite (`scripts/test-local-seo-engine.ts`)
 *
 * Verifies:
 * 1. Curated 8-corridor catalog (`LOCAL_SEO_CORRIDORS`), `getCorridorBySlug`, and `getRelatedCorridors`.
 * 2. `computeCorridorFareEstimates` across `outbound` & `inbound`, vehicle tier scaling (`Sedan <= Executive / XL SUV`),
 *    passenger capacity upgrades, and STL/SUS airport commercial access surcharge inclusion.
 * 3. `buildPrepopulatedBookUrl` -> `parseBookRouteQueryInitialValues` round-trip accuracy, SSR form state seeding,
 *    and malformed `NaN` / out-of-bounds / Null-Island coordinate rejection.
 * 4. `buildTaxiServiceJsonLd`, `buildFaqPageJsonLd`, `buildBreadcrumbListJsonLd`, and XSS-safe
 *    `serializeJsonLdScriptPayload` (`</script>` -> `\u003c/script\u003e`).
 * 5. `robots.txt.ts` & `sitemap.xml.ts` SSR resource loaders (`200`, headers, `Allow`/`Disallow`, all 8 corridor URLs).
 * 6. `service-areas.$corridorSlug.tsx`, `service-areas._index.tsx`, and `book.tsx` SSR loaders (`200` + `404` Response).
 * 7. Removal of static shadowing files (`public/robots.txt`, `public/sitemap.xml`), `0.00 kB` client route chunks,
 *    crawlable internal links (`Footer.tsx`, `services.tsx`), monolith line budgets, untouched `firestore.rules` &
 *    `vercel.json`, zero `"HUD Now"`, and zero bracketed status strings across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOCAL_SEO_CORRIDORS,
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  buildPrepopulatedBookUrl,
  buildTaxiServiceJsonLd,
  computeCorridorFareEstimates,
  generateRobotsTxt,
  generateSitemapXml,
  getCorridorBySlug,
  getRelatedCorridors,
  isValidGeoPoint,
  parseBookRouteQueryInitialValues,
  resolveCanonicalSiteOrigin,
  serializeJsonLdScriptPayload,
  type LocalSeoCorridor,
} from '../app/core/services/seo';
import { createInitialCustomerBookingFormState } from '../app/core/hooks/booking/useCustomerBookingSubmission';
import { loader as robotsLoader } from '../app/routes/robots.txt';
import { loader as sitemapLoader } from '../app/routes/sitemap.xml';
import { loader as corridorLoader } from '../app/routes/service-areas.$corridorSlug';
import { loader as hubLoader } from '../app/routes/service-areas._index';
import { loader as bookLoader } from '../app/routes/book';

const EXPECTED_SLUGS = [
  'chesterfield-to-stl-airport',
  'spirit-of-st-louis-airport-sus',
  'clayton-to-stl-airport',
  'town-and-country-car-service',
  'creve-coeur-executive-taxi',
  'wildwood-and-ellisville-taxi',
  'maryland-heights-westport-taxi',
  'downtown-st-louis-airport-transfer',
] as const;

function runCatalogAssertions(): void {
  console.log('1️⃣  Testing 8-Corridor Catalog, Coordinates, Landmarks, Pickup Guides & FAQs...');

  assert.equal(LOCAL_SEO_CORRIDORS.length, 8, 'Expected exactly 8 curated local SEO corridors');

  const actualSlugs = LOCAL_SEO_CORRIDORS.map((c) => c.slug);
  assert.equal(new Set(actualSlugs).size, 8, 'All corridor slugs must be unique');
  assert.deepEqual(actualSlugs, [...EXPECTED_SLUGS], 'Corridor slugs must match specification');

  for (const corridor of LOCAL_SEO_CORRIDORS) {
    assert.ok(corridor.shortTitle.trim().length > 5, `${corridor.slug}: missing shortTitle`);
    assert.ok(corridor.heroHeadline.trim().length > 10, `${corridor.slug}: missing heroHeadline`);
    assert.ok(corridor.metaTitle.trim().length > 15, `${corridor.slug}: missing metaTitle`);
    assert.ok(
      corridor.metaDescription.trim().length > 40,
      `${corridor.slug}: missing metaDescription`
    );
    assert.ok(
      ['airport', 'fbo', 'corporate', 'suburban'].includes(corridor.category),
      `${corridor.slug}: invalid category`
    );

    // Coordinate sanity within Greater St. Louis region
    assert.ok(
      isValidGeoPoint(corridor.outboundOrigin.coordinates),
      `${corridor.slug}: invalid origin coordinates`
    );
    assert.ok(
      isValidGeoPoint(corridor.outboundDestination.coordinates),
      `${corridor.slug}: invalid destination coordinates`
    );
    assert.ok(
      corridor.outboundOrigin.coordinates.lat > 38.0 &&
        corridor.outboundOrigin.coordinates.lat < 39.2 &&
        corridor.outboundOrigin.coordinates.lng > -91.2 &&
        corridor.outboundOrigin.coordinates.lng < -89.8,
      `${corridor.slug}: origin outside St. Louis metro bounds`
    );
    assert.ok(
      corridor.distanceMiles > 3 && corridor.distanceMiles < 60,
      `${corridor.slug}: unrealistic distanceMiles`
    );
    assert.ok(
      corridor.typicalDurationMinutes >= 10 && corridor.typicalDurationMinutes <= 90,
      `${corridor.slug}: unrealistic typicalDurationMinutes`
    );
    assert.ok(corridor.zipCodes.length >= 2, `${corridor.slug}: expected >= 2 ZIP codes`);
    assert.ok(corridor.landmarks.length >= 3, `${corridor.slug}: expected >= 3 landmarks`);
    assert.ok(
      corridor.pickupInstructions.length >= 3,
      `${corridor.slug}: expected >= 3 pickup instructions`
    );
    assert.ok(corridor.faqs.length >= 3, `${corridor.slug}: expected >= 3 FAQs`);
    for (const faq of corridor.faqs) {
      assert.ok(faq.question.trim().endsWith('?'), `${corridor.slug}: FAQ question should end with ?`);
      assert.ok(faq.answer.trim().length >= 30, `${corridor.slug}: FAQ answer too short`);
    }

    assert.equal(getCorridorBySlug(corridor.slug)?.slug, corridor.slug);
    assert.equal(getCorridorBySlug(`  ${corridor.slug.toUpperCase()} `)?.slug, corridor.slug);

    const related = getRelatedCorridors(corridor.slug, 3);
    assert.equal(related.length, 3);
    assert.ok(related.every((r) => r.slug !== corridor.slug));
  }

  assert.equal(getCorridorBySlug('unknown-corridor-xyz'), null);
  assert.equal(getCorridorBySlug(''), null);
  assert.equal(getCorridorBySlug(null), null);
}

function runFareEstimatorAssertions(): void {
  console.log('2️⃣  Testing Upfront Corridor Fare Estimator (Outbound/Inbound, Tiers & Airport Fee)...');

  const chesterfield = getCorridorBySlug('chesterfield-to-stl-airport')!;
  const spiritSus = getCorridorBySlug('spirit-of-st-louis-airport-sus')!;

  const outbound = computeCorridorFareEstimates({
    corridor: chesterfield,
    direction: 'outbound',
    passengers: 2,
  });
  const inbound = computeCorridorFareEstimates(chesterfield, 'inbound', 2);

  assert.equal(outbound.pickup.address, chesterfield.outboundOrigin.address);
  assert.equal(outbound.dropoff.address, chesterfield.outboundDestination.address);
  assert.equal(inbound.pickup.address, chesterfield.outboundDestination.address);
  assert.equal(inbound.dropoff.address, chesterfield.outboundOrigin.address);

  // Airport surcharge included for both STL and SUS corridors
  assert.equal(outbound.isAirportCorridor, true);
  assert.equal(outbound.airportCode, 'STL');
  assert.equal(outbound.airportSurcharge, 4);

  const susEst = computeCorridorFareEstimates({ corridor: spiritSus, direction: 'outbound' });
  assert.equal(susEst.isAirportCorridor, true);
  assert.equal(susEst.airportCode, 'SUS');
  assert.equal(susEst.airportSurcharge, 4);

  // Tier scaling: Sedan <= Executive and Sedan <= XL SUV
  const [sedan, exec, xlSuv] = outbound.tiers;
  assert.equal(sedan.tierId, 'standard');
  assert.equal(exec.tierId, 'premium');
  assert.equal(xlSuv.tierId, 'xl');
  assert.ok(
    sedan.estimatedFare <= exec.estimatedFare && exec.estimatedFare <= xlSuv.estimatedFare,
    `Expected Sedan (${sedan.estimatedFare}) <= Executive (${exec.estimatedFare}) <= XL SUV (${xlSuv.estimatedFare})`
  );
  assert.equal(outbound.startingFare, sedan.estimatedFare);
  assert.equal(outbound.recommendedTierId, 'standard');

  // 5 passengers exceeds 4-pax Sedan/Executive and recommends XL SUV
  const group5 = computeCorridorFareEstimates({
    corridor: chesterfield,
    direction: 'outbound',
    passengers: 5,
  });
  assert.equal(group5.tiers[0].fitsPassengers, false);
  assert.equal(group5.tiers[1].fitsPassengers, false);
  assert.equal(group5.tiers[2].fitsPassengers, true);
  assert.equal(group5.recommendedTierId, 'xl');
  assert.equal(group5.startingFare, group5.tiers[2].estimatedFare);

  // Non-airport corridor omits airport access surcharge
  const localOnlyCorridor: LocalSeoCorridor = {
    ...chesterfield,
    slug: 'local-west-county-test',
    outboundOrigin: {
      label: 'Wildwood Town Center',
      address: '16860 Main St, Wildwood, MO 63040',
      coordinates: { lat: 38.5809, lng: -90.6629 },
    },
    outboundDestination: {
      label: 'Plaza Frontenac',
      address: '1701 S Lindbergh Blvd, Frontenac, MO 63131',
      coordinates: { lat: 38.6328, lng: -90.4068 },
    },
  };
  const localEst = computeCorridorFareEstimates({ corridor: localOnlyCorridor });
  assert.equal(localEst.isAirportCorridor, false);
  assert.equal(localEst.airportSurcharge, 0);
  assert.equal(
    Number((outbound.tiers[0].estimatedFare - localEst.tiers[0].estimatedFare).toFixed(2)),
    4.0
  );

  // Custom Admin pricing settings honored
  const customEst = computeCorridorFareEstimates({
    corridor: chesterfield,
    direction: 'outbound',
    passengers: 1,
    settings: {
      pricing: {
        baseFare: 10,
        perMileRate: 3.0,
        perMinuteRate: 0.5,
        airportFee: 6.5,
        surgeMultiplier: 1.0,
        minimumFare: 25,
      },
      vehicles: [
        { id: 'standard', name: 'Sedan', baseMultiplier: 1.0, maxPassengers: 4, maxLuggage: 3 },
        { id: 'premium', name: 'Exec', baseMultiplier: 1.4, maxPassengers: 4, maxLuggage: 3 },
        { id: 'xl', name: 'SUV', baseMultiplier: 1.8, maxPassengers: 6, maxLuggage: 5 },
      ],
    },
  });
  // Base route = 10 + 20.4 * 3.0 + 26 * 0.5 = 10 + 61.2 + 13 = 84.2; + 6.5 airport = 90.7
  assert.equal(customEst.airportSurcharge, 6.5);
  assert.equal(customEst.tiers[0].estimatedFare, 90.7);
}

function runBookPrefillRoundTripAssertions(): void {
  console.log('3️⃣  Testing /book Prefill URL Builder, Query Sanitizer & Form State Seeding...');

  const corridor = getCorridorBySlug('clayton-to-stl-airport')!;
  const bookUrl = buildPrepopulatedBookUrl({
    pickupAddress: corridor.outboundOrigin.address,
    pickupCoordinates: corridor.outboundOrigin.coordinates,
    dropoffAddress: corridor.outboundDestination.address,
    dropoffCoordinates: corridor.outboundDestination.coordinates,
    vehicleChoice: 'suv',
    passengers: 4,
    timingType: 'later',
    driverNotes: 'Ritz-Carlton main valet circle',
  });

  assert.ok(bookUrl.startsWith('/book?'), `Expected /book?... URL, got ${bookUrl}`);
  const parsedUrl = new URL(`https://chesterfieldtaxi.com${bookUrl}`);
  const restored = parseBookRouteQueryInitialValues(parsedUrl.searchParams);

  assert.ok(restored, 'Expected restored BookingEngineV2InitialValues');
  assert.equal(restored.pickupAddress, corridor.outboundOrigin.address);
  assert.deepEqual(restored.pickupCoordinates, corridor.outboundOrigin.coordinates);
  assert.equal(restored.dropoffAddress, corridor.outboundDestination.address);
  assert.deepEqual(restored.dropoffCoordinates, corridor.outboundDestination.coordinates);
  assert.equal(restored.vehicleChoice, 'suv');
  assert.equal(restored.passengers, 4);
  assert.equal(restored.timingType, 'later');
  assert.equal(restored.driverNotes, 'Ritz-Carlton main valet circle');

  // Verify deterministic SSR + Hydration initial state seeding
  const seededForm = createInitialCustomerBookingFormState(restored);
  assert.equal(seededForm.pickupAddress, corridor.outboundOrigin.address);
  assert.deepEqual(seededForm.pickupCoordinates, corridor.outboundOrigin.coordinates);
  assert.equal(seededForm.dropoffAddress, corridor.outboundDestination.address);
  assert.deepEqual(seededForm.dropoffCoordinates, corridor.outboundDestination.coordinates);
  assert.equal(seededForm.vehicleChoice, 'suv');
  assert.deepEqual(seededForm.selectedVehicles, ['suv']);
  assert.equal(seededForm.isVehicleAutoAssigned, false);
  assert.equal(seededForm.passengers, 4);

  // Empty or unrelated query params -> returns undefined
  assert.equal(parseBookRouteQueryInitialValues(new URLSearchParams()), undefined);
  assert.equal(
    parseBookRouteQueryInitialValues(new URLSearchParams('utm_source=google&gclid=123')),
    undefined
  );

  // Malformed NaN / out-of-range / Null-Island coordinates & invalid enums rejected safely
  const malformed = parseBookRouteQueryInitialValues(
    new URLSearchParams({
      pickup: '  400 Chesterfield Center  ',
      pickupLat: 'NaN',
      pickupLng: '-90.55',
      dropoff: '10701 Lambert International Blvd',
      dropoffLat: '95.123', // > 90 invalid latitude
      dropoffLng: '-90.37',
      vehicle: 'spaceship',
      passengers: '-5',
      timing: 'invalid_mode',
    })
  );
  assert.ok(malformed);
  assert.equal(malformed.pickupAddress, '400 Chesterfield Center');
  assert.equal(malformed.pickupCoordinates, undefined);
  assert.equal(malformed.dropoffAddress, '10701 Lambert International Blvd');
  assert.equal(malformed.dropoffCoordinates, undefined);
  assert.equal(malformed.vehicleChoice, undefined);
  assert.equal(malformed.passengers, undefined);
  assert.equal(malformed.timingType, undefined);

  // Null Island (0, 0) rejected
  const nullIsland = parseBookRouteQueryInitialValues(
    new URLSearchParams({ pickupLat: '0', pickupLng: '0' })
  );
  assert.equal(nullIsland, undefined);

  // Overlong string length capped safely
  const longText = 'A'.repeat(600);
  const capped = parseBookRouteQueryInitialValues(new URLSearchParams({ pickup: longText }));
  assert.equal(capped?.pickupAddress?.length, 240);
}

function runJsonLdAndSerializationAssertions(): void {
  console.log('4️⃣  Testing JSON-LD Builders & XSS-Safe </script> Escaping...');

  const corridor = getCorridorBySlug('chesterfield-to-stl-airport')!;
  const origin = 'https://chesterfieldtaxi.com';
  const estimates = computeCorridorFareEstimates({ corridor });

  const taxiLd = buildTaxiServiceJsonLd({ corridor, origin, estimates }) as Record<string, any>;
  assert.equal(taxiLd['@context'], 'https://schema.org');
  assert.deepEqual(taxiLd['@type'], ['TaxiService', 'LocalBusiness']);
  assert.equal(taxiLd.url, 'https://chesterfieldtaxi.com/service-areas/chesterfield-to-stl-airport');
  assert.ok(typeof taxiLd.telephone === 'string' && taxiLd.telephone.length > 0);
  assert.ok(Array.isArray(taxiLd.areaServed) && taxiLd.areaServed.length > 0);
  assert.ok(typeof taxiLd.priceRange === 'string' && taxiLd.priceRange.startsWith('$'));
  assert.equal(taxiLd.openingHoursSpecification[0].opens, '00:00');
  assert.equal(taxiLd.openingHoursSpecification[0].closes, '23:59');
  assert.equal(taxiLd.potentialAction['@type'], 'ReserveAction');
  assert.ok(
    String(taxiLd.potentialAction.target.urlTemplate).startsWith(
      'https://chesterfieldtaxi.com/book?'
    )
  );

  const faqLd = buildFaqPageJsonLd(corridor.faqs) as Record<string, any>;
  assert.equal(faqLd['@type'], 'FAQPage');
  assert.equal(faqLd.mainEntity.length, corridor.faqs.length);
  assert.equal(faqLd.mainEntity[0]['@type'], 'Question');
  assert.equal(faqLd.mainEntity[0].acceptedAnswer['@type'], 'Answer');

  const breadLd = buildBreadcrumbListJsonLd([
    { name: 'Home', url: 'https://chesterfieldtaxi.com/' },
    { name: 'Service Areas', url: 'https://chesterfieldtaxi.com/service-areas' },
  ]) as Record<string, any>;
  assert.equal(breadLd['@type'], 'BreadcrumbList');
  assert.equal(breadLd.itemListElement[0].position, 1);
  assert.equal(breadLd.itemListElement[1].position, 2);

  // XSS </script> breakout neutralization
  const xssPayload = {
    note: '</script><script>window.__pwned = true & false</script>',
  };
  const serialized = serializeJsonLdScriptPayload(xssPayload);
  assert.ok(!serialized.includes('</script>'), 'Serialized JSON-LD must never contain raw </script>');
  assert.ok(!serialized.includes('<'), 'Serialized JSON-LD must escape all < characters');
  assert.ok(
    serialized.includes('\\u003c/script\\u003e'),
    'Expected </script> to be escaped as \\u003c/script\\u003e'
  );
  assert.deepEqual(JSON.parse(serialized), xssPayload, 'Escaped JSON-LD must remain valid JSON');
}

async function runResourceAndRouteLoadersAssertions(): Promise<void> {
  console.log('5️⃣  Testing Dynamic /robots.txt, /sitemap.xml & /service-areas SSR Loaders...');

  // Canonical origin resolution
  assert.equal(
    resolveCanonicalSiteOrigin(new Request('http://localhost:5173/robots.txt')),
    'https://chesterfieldtaxi.com'
  );
  assert.equal(
    resolveCanonicalSiteOrigin(new Request('https://rides.chesterfieldtaxi.com/robots.txt')),
    'https://rides.chesterfieldtaxi.com'
  );

  // /robots.txt loader
  const robotsRes = await robotsLoader({
    request: new Request('https://chesterfieldtaxi.com/robots.txt'),
    params: {},
    context: {},
  } as any);
  assert.equal(robotsRes.status, 200);
  assert.ok(robotsRes.headers.get('Content-Type')?.includes('text/plain'));
  assert.ok(robotsRes.headers.get('Cache-Control')?.includes('max-age=3600'));
  const robotsText = await robotsRes.text();
  assert.ok(robotsText.includes('Allow: /service-areas'));
  assert.ok(robotsText.includes('Disallow: /app'));
  assert.ok(robotsText.includes('Disallow: /pay/'));
  assert.ok(robotsText.includes('Disallow: /api/'));
  assert.ok(robotsText.includes('Disallow: /dispatch'));
  assert.ok(robotsText.includes('Disallow: /admin'));
  assert.ok(robotsText.includes('Sitemap: https://chesterfieldtaxi.com/sitemap.xml'));

  // /sitemap.xml loader
  const sitemapRes = await sitemapLoader({
    request: new Request('https://chesterfieldtaxi.com/sitemap.xml'),
    params: {},
    context: {},
  } as any);
  assert.equal(sitemapRes.status, 200);
  assert.ok(sitemapRes.headers.get('Content-Type')?.includes('application/xml'));
  const sitemapXml = await sitemapRes.text();
  assert.ok(sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(sitemapXml.includes('<loc>https://chesterfieldtaxi.com/service-areas</loc>'));
  for (const slug of EXPECTED_SLUGS) {
    assert.ok(
      sitemapXml.includes(`<loc>https://chesterfieldtaxi.com/service-areas/${slug}</loc>`),
      `Sitemap missing corridor URL for ${slug}`
    );
  }
  // Private/operational routes MUST NOT appear in sitemap
  for (const forbidden of ['/app/dispatch', '/app/driver', '/admin', '/pay/', '/api/', '/booking/status']) {
    assert.ok(!sitemapXml.includes(forbidden), `Sitemap must not expose ${forbidden}`);
  }

  // XML escaping in generateSitemapXml
  const xmlCheck = generateSitemapXml({ origin: 'https://chesterfieldtaxi.com', lastmodDate: '2026-11-23' });
  assert.ok(xmlCheck.includes('<lastmod>2026-11-23</lastmod>'));
  assert.ok(generateRobotsTxt('https://chesterfieldtaxi.com/').includes('Sitemap: https://chesterfieldtaxi.com/sitemap.xml'));

  // /service-areas hub loader
  const hubData = await hubLoader({
    request: new Request('https://chesterfieldtaxi.com/service-areas'),
    params: {},
    context: {},
  } as any);
  assert.equal(hubData.corridorSummaries.length, 8);

  // /service-areas/:corridorSlug valid 200 loader
  const validCorridorData = await corridorLoader({
    request: new Request('https://chesterfieldtaxi.com/service-areas/spirit-of-st-louis-airport-sus'),
    params: { corridorSlug: 'spirit-of-st-louis-airport-sus' },
    context: {},
  } as any);
  assert.equal(validCorridorData.corridor.slug, 'spirit-of-st-louis-airport-sus');
  assert.equal(validCorridorData.relatedCorridors.length, 3);

  // /service-areas/:corridorSlug invalid -> throws 404 Response
  let caught404: unknown = null;
  try {
    await corridorLoader({
      request: new Request('https://chesterfieldtaxi.com/service-areas/unknown-city-corridor'),
      params: { corridorSlug: 'unknown-city-corridor' },
      context: {},
    } as any);
  } catch (err) {
    caught404 = err;
  }
  assert.ok(caught404 instanceof Response, 'Expected corridorLoader to throw a Response on unknown slug');
  assert.equal((caught404 as Response).status, 404);

  // /book loader query prefill
  const bareBookData = await bookLoader({
    request: new Request('https://chesterfieldtaxi.com/book'),
    params: {},
    context: {},
  } as any);
  assert.equal(bareBookData.initialValues, undefined);

  const prefilledBookData = await bookLoader({
    request: new Request(
      'https://chesterfieldtaxi.com/book?pickup=400+Chesterfield+Center&pickupLat=38.6531&pickupLng=-90.5539&dropoff=STL+Airport&vehicle=suv&passengers=3'
    ),
    params: {},
    context: {},
  } as any);
  assert.equal(prefilledBookData.initialValues?.pickupAddress, '400 Chesterfield Center');
  assert.deepEqual(prefilledBookData.initialValues?.pickupCoordinates, {
    lat: 38.6531,
    lng: -90.5539,
  });
  assert.equal(prefilledBookData.initialValues?.vehicleChoice, 'suv');
  assert.equal(prefilledBookData.initialValues?.passengers, 3);
}

function runStaticAndBuildGuardrailAssertions(): void {
  console.log('6️⃣  Verifying Static Shadowing Removal, 0.00 kB Chunks, Links & Monolith Budgets...');

  const rootDir = process.cwd();

  // 1. Static shadowing files MUST NOT exist in public/ or build/client/
  assert.equal(
    fs.existsSync(path.join(rootDir, 'public/robots.txt')),
    false,
    'public/robots.txt must be deleted to prevent Vercel CDN static shadowing'
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'public/sitemap.xml')),
    false,
    'public/sitemap.xml must be deleted to prevent Vercel CDN static shadowing'
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'build/client/robots.txt')),
    false,
    'build/client/robots.txt must not exist as a static asset'
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'build/client/sitemap.xml')),
    false,
    'build/client/sitemap.xml must not exist as a static asset'
  );

  // 2. Verify 0.00 kB empty client chunks in build/client/assets/ after `npm run build`
  const clientAssetsDir = path.join(rootDir, 'build/client/assets');
  assert.ok(
    fs.existsSync(clientAssetsDir),
    'build/client/assets must exist (run `npm run build` before or alongside verification)'
  );
  const assetFiles = fs.readdirSync(clientAssetsDir);
  const robotsChunks = assetFiles.filter((f) => /^robots\.txt-.*\.js$/.test(f));
  const sitemapChunks = assetFiles.filter((f) => /^sitemap\.xml-.*\.js$/.test(f));
  assert.equal(robotsChunks.length, 1, `Expected 1 robots.txt-*.js chunk, got ${robotsChunks.join(', ')}`);
  assert.equal(sitemapChunks.length, 1, `Expected 1 sitemap.xml-*.js chunk, got ${sitemapChunks.join(', ')}`);
  for (const chunkName of [...robotsChunks, ...sitemapChunks]) {
    const sizeBytes = fs.statSync(path.join(clientAssetsDir, chunkName)).size;
    assert.ok(
      sizeBytes < 64,
      `Expected ${chunkName} to be a 0.00 kB empty client chunk (< 64B), got ${sizeBytes}B`
    );
  }

  // 3. Pure service file purity check
  const pureSeoSource = fs.readFileSync(
    path.join(rootDir, 'app/core/services/seo/local-corridor-seo.service.ts'),
    'utf8'
  );
  assert.ok(!/from\s+['"]react['"]/.test(pureSeoSource), 'Zero React imports in pure SEO service');
  assert.ok(!/\.server['"]/.test(pureSeoSource), 'Zero *.server imports in pure SEO service');
  assert.ok(!/from\s+['"]node:/.test(pureSeoSource), 'Zero node:* imports in pure SEO service');
  assert.ok(
    !/\b(?:document|localStorage|sessionStorage)\b/.test(pureSeoSource) &&
      !/\bwindow\.(?:document|localStorage|location|addEventListener)\b/.test(pureSeoSource),
    'Zero DOM globals in pure SEO service'
  );

  // 4. Verify crawlable internal links in Footer.tsx and services.tsx
  const footerSource = fs.readFileSync(
    path.join(rootDir, 'app/components/layout/Footer.tsx'),
    'utf8'
  );
  assert.ok(footerSource.includes("'/service-areas'"), 'Footer.tsx must link to /service-areas');
  assert.ok(
    footerSource.includes('/service-areas/chesterfield-to-stl-airport'),
    'Footer.tsx must link to Chesterfield <-> STL corridor'
  );
  assert.ok(
    footerSource.includes('/service-areas/spirit-of-st-louis-airport-sus'),
    'Footer.tsx must link to Spirit Airport (SUS) corridor'
  );

  const servicesSource = fs.readFileSync(path.join(rootDir, 'app/routes/services.tsx'), 'utf8');
  assert.ok(
    servicesSource.includes('/service-areas'),
    'services.tsx must link to /service-areas corridors'
  );

  // 5. Monolith line ceilings
  const lineCeilings: ReadonlyArray<{ relPath: string; maxLines: number }> = [
    { relPath: 'app/components/domain/admin/AdminDashboardTab.tsx', maxLines: 450 },
    { relPath: 'app/routes/admin.tsx', maxLines: 1000 },
    { relPath: 'app/routes/dispatch.tsx', maxLines: 1600 },
    { relPath: 'app/routes/driver.tsx', maxLines: 1900 },
    { relPath: 'app/components/domain/BookingEngineV2.tsx', maxLines: 1350 },
    { relPath: 'app/routes/book.tsx', maxLines: 200 },
    { relPath: 'app/components/domain/admin/AdminRulesTab.tsx', maxLines: 1350 },
  ];

  for (const item of lineCeilings) {
    const content = fs.readFileSync(path.join(rootDir, item.relPath), 'utf8');
    const lineCount = content.split(/\r?\n/).length;
    assert.ok(
      lineCount < item.maxLines,
      `${item.relPath} has ${lineCount} lines, exceeding ceiling < ${item.maxLines}`
    );
  }

  // 6. Immutable files untouched
  const immutableGitStatus = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    immutableGitStatus,
    '',
    `firestore.rules and vercel.json must remain untouched, got:\n${immutableGitStatus}`
  );

  // 7. Terminology & bracketed status hygiene across app/
  const forbiddenTokens = [
    'HUD ' + 'Now',
    '[' + 'Avail]',
    '[' + 'En Route]',
    '[' + 'Busy]',
    '[' + 'Break]',
    '[' + 'Off]',
  ];
  const violations: string[] = [];

  const scanAppDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanAppDir(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const tok of forbiddenTokens) {
          if (text.includes(tok)) {
            violations.push(`${path.relative(rootDir, fullPath)} contains forbidden "${tok}"`);
          }
        }
      }
    }
  };

  scanAppDir(path.join(rootDir, 'app'));
  assert.deepEqual(violations, [], `UI terminology violations found:\n${violations.join('\n')}`);
}

async function main(): Promise<void> {
  console.log('🚀 Running Phase 58 Local Airport & West County SEO Engine Verification Suite...\n');
  runCatalogAssertions();
  runFareEstimatorAssertions();
  runBookPrefillRoundTripAssertions();
  runJsonLdAndSerializationAssertions();
  await runResourceAndRouteLoadersAssertions();
  runStaticAndBuildGuardrailAssertions();
  console.log('\n✅ All Phase 58 Local SEO Engine & Guardrail assertions passed!');
}

main().catch((err) => {
  console.error('\n❌ Phase 58 verification failed:', err);
  process.exit(1);
});
