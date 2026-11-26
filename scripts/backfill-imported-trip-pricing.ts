/**
 * Imported Trip Location & Pricing Backfill CLI (Phase 100)
 *
 * Hydrates missing coordinates, ZIP codes, place IDs, and fares on imported
 * $0.00 TaxiCaller trips in Firestore.
 *
 * Usage:
 *   npx tsx scripts/backfill-imported-trip-pricing.ts --dry-run
 *   npx tsx scripts/backfill-imported-trip-pricing.ts --dry-run --all --report reports/backfill-preview.csv
 *   npx tsx scripts/backfill-imported-trip-pricing.ts --commit --limit 50 --max-api-calls 120
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, query, where, writeBatch } from 'firebase/firestore';
import { sanitizePayload } from '../app/core/services/firestore-sanitizer';
import {
  DEFAULT_BACKFILL_AFTER_ISO,
  estimateBackfillPlan,
  executeBackfillPipeline,
  extractZipCodeFromAddress,
  selectEligibleTrips,
  type ContactSavedPlaceCandidate,
  type ResolvedAddressInfo,
} from '../app/core/services/booking/imported-trip-backfill.util';
import { ServerRouteService } from '../app/core/services/maps/server-route.service';
import { getAdminConfigService } from '../app/core/services/config/admin-config.service';
import { DEFAULT_SPECIAL_PLACES, type SpecialPlace } from '../app/core/services/places/special-places.service';
import { DEFAULT_TARIFF_PROFILES } from '../app/core/services/pricing/tariff.service';
import { DEFAULT_NAMED_PRICING_RULES } from '../app/core/services/pricing/pricing-rules.service';
import type { PricingConfig } from '../app/core/services/pricing/types';
import type { AppSettings, NamedPricingRule } from '../app/core/types/config';
import type { TariffProfile } from '../app/core/types/tariff';
import type { Trip } from '../app/core/types/trip';
import type { ContactRecord } from '../app/core/services/customer/contact.service';

function loadEnv(): void {
  const rootDir = process.cwd();
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = path.join(rootDir, envFile);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

interface CliArgs {
  commit: boolean;
  all: boolean;
  afterIso?: string;
  limit?: number;
  maxApiCalls: number;
  reportPath?: string;
  email?: string;
  password?: string;
}

function parsePositiveInt(raw: string | undefined, flagName: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`❌ Invalid ${flagName} value: "${raw}". Expected a positive integer.`);
    process.exit(1);
  }
  return parsed;
}

function parseCliArgs(argv: string[]): CliArgs {
  let commit = false;
  let all = false;
  let afterIso: string | undefined;
  let limit: number | undefined;
  let maxApiCalls = 200;
  let reportPath: string | undefined;
  let email: string | undefined;
  let password: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--commit') {
      commit = true;
    } else if (arg === '--dry-run') {
      commit = false;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--after' && argv[i + 1]) {
      afterIso = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--after=')) {
      afterIso = arg.slice('--after='.length);
    } else if (arg === '--limit' && argv[i + 1]) {
      limit = parsePositiveInt(argv[i + 1], '--limit');
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      limit = parsePositiveInt(arg.slice('--limit='.length), '--limit');
    } else if (arg === '--max-api-calls' && argv[i + 1]) {
      maxApiCalls = parsePositiveInt(argv[i + 1], '--max-api-calls');
      i += 1;
    } else if (arg.startsWith('--max-api-calls=')) {
      maxApiCalls = parsePositiveInt(arg.slice('--max-api-calls='.length), '--max-api-calls');
    } else if (arg === '--report' && argv[i + 1]) {
      reportPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length);
    } else if (arg === '--email' && argv[i + 1]) {
      email = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length);
    } else if (arg === '--password' && argv[i + 1]) {
      password = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--password=')) {
      password = arg.slice('--password='.length);
    }
  }

  return { commit, all, afterIso, limit, maxApiCalls, reportPath, email, password };
}

function escapeCsvCell(value: string | number | undefined): string {
  const raw = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function writeCsvReport(reportPath: string, trips: ReadonlyArray<Trip>): void {
  const resolved = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const header = [
    'tripId',
    'status',
    'scheduledPickupTime',
    'pickupAddress',
    'pickupZip',
    'pickupLat',
    'pickupLng',
    'dropoffAddress',
    'dropoffZip',
    'dropoffLat',
    'dropoffLng',
    'distanceMiles',
    'durationMinutes',
    'totalFare',
    'tariffProfileName',
  ].join(',');

  const lines = trips.map((t) =>
    [
      escapeCsvCell(t.id),
      escapeCsvCell(t.status),
      escapeCsvCell(t.scheduledPickupTime),
      escapeCsvCell(t.pickupLocation?.formattedAddress || t.pickupLocation?.address),
      escapeCsvCell(t.pickupLocation?.zipCode),
      escapeCsvCell(t.pickupLocation?.coordinates?.lat),
      escapeCsvCell(t.pickupLocation?.coordinates?.lng),
      escapeCsvCell(t.dropoffLocation?.formattedAddress || t.dropoffLocation?.address),
      escapeCsvCell(t.dropoffLocation?.zipCode),
      escapeCsvCell(t.dropoffLocation?.coordinates?.lat),
      escapeCsvCell(t.dropoffLocation?.coordinates?.lng),
      escapeCsvCell(t.pricing?.distanceMiles ?? 0),
      escapeCsvCell(t.pricing?.durationMinutes ?? 0),
      escapeCsvCell(t.pricing?.totalFare ?? 0),
      escapeCsvCell(t.pricing?.tariffProfileName),
    ].join(',')
  );

  fs.writeFileSync(resolved, [header, ...lines].join('\n'), 'utf-8');
  console.log(`📝 Wrote CSV report (${trips.length} trips) to: ${resolved}`);
}

async function initFirestoreClient(
  requireAuth: boolean,
  cliEmail?: string,
  cliPassword?: string
) {
  loadEnv();
  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
    projectId:
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      'chesterfield-taxi-1461f',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
  };

  console.log(`🔌 Connecting to Firebase Firestore (Project: ${firebaseConfig.projectId})...`);
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const adminEmail =
    cliEmail || process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || 'admin@chesterfieldtaxi.com';
  const adminPass =
    cliPassword || process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '';

  if (requireAuth && !adminPass) {
    console.error(
      `❌ Admin password required for --commit.\n` +
        `   Provide --email <admin-email> --password <password> or set ADMIN_EMAIL & ADMIN_PASSWORD in .env.local.`
    );
    process.exit(1);
  }

  if (adminPass) {
    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
    const auth = getAuth(app);
    const cred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    console.log(`🔑 Authenticated as ${cred.user.email}`);
  }

  return db;
}

function getGoogleMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
}

async function geocodeAddressWithGoogle(
  address: string,
  apiKey: string
): Promise<ResolvedAddressInfo | null> {
  if (!apiKey) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: Array<{ long_name?: string; types?: string[] }>;
    }>;
  };

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    return null;
  }

  const top = data.results[0];
  const loc = top.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    return null;
  }

  const postalComp = top.address_components?.find((c) => c.types?.includes('postal_code'));
  const zipCode =
    postalComp?.long_name?.slice(0, 5) || extractZipCodeFromAddress(top.formatted_address);

  return {
    coordinates: { lat: loc.lat, lng: loc.lng },
    formattedAddress: top.formatted_address,
    placeId: top.place_id,
    zipCode,
    source: 'geocoded',
  };
}

async function loadPricingConfigFromFirestore(
  db: ReturnType<typeof getFirestore>
): Promise<PricingConfig> {
  const adminConfigService = getAdminConfigService();
  let settings: AppSettings | undefined;

  try {
    const settingsSnap = await getDoc(doc(db, 'config', 'appSettings'));
    if (settingsSnap.exists()) {
      settings = settingsSnap.data() as AppSettings;
    }
  } catch (err) {
    console.warn('⚠️ Could not read config/appSettings, using defaults:', err);
  }

  const baseConfig = adminConfigService.toPricingConfig(settings);

  let tariffs: TariffProfile[] = [];
  try {
    const tariffSnap = await getDocs(collection(db, 'tariffs'));
    tariffs = tariffSnap.docs.map((d) => d.data() as TariffProfile);
  } catch (err) {
    console.warn('⚠️ Could not read tariffs collection, using defaults:', err);
  }

  let pricingRules: NamedPricingRule[] = [];
  try {
    const rulesSnap = await getDocs(collection(db, 'pricingRules'));
    pricingRules = rulesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NamedPricingRule, 'id'>),
    }));
  } catch (err) {
    console.warn('⚠️ Could not read pricingRules collection, using defaults:', err);
  }

  return {
    ...baseConfig,
    tariffs: tariffs.length > 0 ? tariffs : baseConfig.tariffs ?? DEFAULT_TARIFF_PROFILES,
    namedPricingRules:
      pricingRules.length > 0
        ? pricingRules
        : baseConfig.namedPricingRules ?? DEFAULT_NAMED_PRICING_RULES,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const scopeLabel = args.all
    ? 'ALL historical & upcoming $0.00 trips (--all)'
    : `Trips scheduled after ${args.afterIso || DEFAULT_BACKFILL_AFTER_ISO}`;

  console.log('\n===============================================================');
  console.log('🚕 CHESTERFIELD TAXI: IMPORTED TRIP LOCATION & PRICING BACKFILL');
  console.log(`   Mode:          ${args.commit ? 'COMMIT (Firestore Write)' : 'DRY-RUN (Zero API / Read-Only)'}`);
  console.log(`   Scope:         ${scopeLabel}`);
  console.log(`   Trip Limit:    ${args.limit ?? 'Unlimited'}`);
  console.log(`   Max API Calls: ${args.maxApiCalls}`);
  console.log('===============================================================\n');

  const db = await initFirestoreClient(args.commit, args.email, args.password);

  const [tripsSnap, specialPlacesSnap] = await Promise.all([
    getDocs(query(collection(db, 'trips'), where('pricing.totalFare', '==', 0))),
    getDocs(collection(db, 'specialPlaces')).catch(() => null),
  ]);

  const allTrips: Trip[] = tripsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Trip, 'id'>),
  }));

  const specialPlaces: SpecialPlace[] =
    specialPlacesSnap && !specialPlacesSnap.empty
      ? specialPlacesSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SpecialPlace, 'id'>),
        }))
      : DEFAULT_SPECIAL_PLACES;

  const selectedTrips = selectEligibleTrips(allTrips, {
    all: args.all,
    afterIso: args.afterIso,
    limit: args.limit,
  });

  // Only fetch contacts referenced by selectedTrips to minimize Firestore reads
  const uniqueCustomerIds = Array.from(
    new Set(selectedTrips.map((t) => t.customerId).filter((id): id is string => Boolean(id)))
  );
  const contactPlaces: ContactSavedPlaceCandidate[] = [];
  if (uniqueCustomerIds.length > 0) {
    const contactSnaps = await Promise.all(
      uniqueCustomerIds.map((cid) => getDoc(doc(db, 'contacts', cid)).catch(() => null))
    );
    for (const snap of contactSnaps) {
      if (!snap || !snap.exists()) continue;
      const contact = snap.data() as ContactRecord;
      for (const sp of contact.savedPlaces || []) {
        if (sp.coordinates && sp.address) {
          contactPlaces.push({
            address: sp.address,
            coordinates: sp.coordinates,
          });
        }
      }
    }
  }

  const estimate = estimateBackfillPlan(allTrips, selectedTrips, {
    specialPlaces,
    contactPlaces,
  });

  console.log('--- [BACKFILL ESTIMATE SUMMARY] ---');
  console.log(` • Total Firestore Trips Scanned:   ${estimate.totalTripsScanned.toLocaleString()}`);
  console.log(` • Eligible Trips Selected:         ${estimate.selectedTripsCount.toLocaleString()}`);
  console.log(` • Locally Resolved Locations:      ${estimate.locallyResolvedLocationsCount.toLocaleString()}`);
  console.log(` • Unique Addresses to Geocode:     ${estimate.estimatedGeocodingCalls.toLocaleString()}`);
  console.log(` • Unique Routes to Calculate:      ${estimate.estimatedDirectionsCalls.toLocaleString()}`);
  console.log(` • Estimated Total Google API Calls:${estimate.estimatedTotalApiCalls.toLocaleString()}`);

  if (estimate.uniqueAddressesToGeocode.length > 0) {
    console.log('\n--- [SAMPLE UNIQUE ADDRESSES TO GEOCODE (UP TO 5)] ---');
    for (const addr of estimate.uniqueAddressesToGeocode.slice(0, 5)) {
      console.log(` • ${addr}`);
    }
  }

  if (!args.commit) {
    if (args.reportPath) {
      writeCsvReport(args.reportPath, selectedTrips);
    }
    console.log('\n✅ Dry-run complete. Zero Google API calls made and zero Firestore writes performed.');
    console.log('   Re-run with --commit to geocode, calculate routes, and update Firestore.\n');
    return;
  }

  const googleApiKey = getGoogleMapsApiKey();
  if (!googleApiKey) {
    console.warn(
      '⚠️ No GOOGLE_MAPS_SERVER_API_KEY / GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY found.\n' +
        '   Geocoding will be skipped for unresolved addresses; ServerRouteService will use fallback estimation.'
    );
  }

  const pricingConfig = await loadPricingConfigFromFirestore(db);
  const routeService = new ServerRouteService();

  const result = await executeBackfillPipeline(selectedTrips, {
    localContext: { specialPlaces, contactPlaces },
    pricingConfig,
    maxApiCalls: args.maxApiCalls,
    geocodeAddress: googleApiKey
      ? (addr) => geocodeAddressWithGoogle(addr, googleApiKey)
      : undefined,
    calculateRoute: (origin, destination) =>
      routeService.calculateRoute({ origin, destination }),
  });

  console.log('\n--- [EXECUTION SUMMARY] ---');
  console.log(` • Trips Hydrated:                  ${result.hydratedTrips.length.toLocaleString()}`);
  console.log(` • Skipped (Cap / Invalid Route):   ${result.skippedDueToCapCount.toLocaleString()}`);
  console.log(` • Geocoding API Calls Made:        ${result.geocodingCallsMade.toLocaleString()}`);
  console.log(` • Directions API Calls Made:       ${result.directionsCallsMade.toLocaleString()}`);
  console.log(` • Total API Calls Made:            ${result.totalApiCallsMade.toLocaleString()} / ${args.maxApiCalls}`);

  if (args.reportPath) {
    writeCsvReport(args.reportPath, result.hydratedTrips);
  }

  if (result.hydratedTrips.length === 0) {
    console.log('\nℹ️ No trips hydrated; skipping Firestore batch write.\n');
    return;
  }

  const batchSize = 500;
  let committed = 0;
  console.log(`\n💾 Updating ${result.hydratedTrips.length.toLocaleString()} trips in Firestore in batches of ${batchSize}...`);

  for (let i = 0; i < result.hydratedTrips.length; i += batchSize) {
    const chunk = result.hydratedTrips.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const trip of chunk) {
      const ref = doc(db, 'trips', trip.id);
      const sanitized = sanitizePayload(trip, { mode: 'omit' });
      batch.set(ref, sanitized, { merge: true });
    }
    await batch.commit();
    committed += chunk.length;
    console.log(
      `   → Batch ${Math.floor(i / batchSize) + 1}: committed ${committed.toLocaleString()} / ${result.hydratedTrips.length.toLocaleString()}`
    );
  }

  console.log('\n🎉 Imported trip location & pricing backfill completed successfully!\n');
}

main().catch((err) => {
  console.error('❌ Fatal error during imported trip backfill:', err);
  process.exit(1);
});
