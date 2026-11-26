/**
 * TaxiCaller Historical Clients JSON Importer (Zero-AI CLI)
 *
 * Reads all *.json exports in `clients_history/` (or `--dir`), filters out test/Smoke House
 * noise and invalid phones, deduplicates repeat customers, extracts gate codes, aggregates
 * frequent saved places, links corporate accounts, and batch-upserts into Firestore `contacts`.
 *
 * Usage:
 *   npx tsx scripts/import-clients-history.ts --dry-run
 *   npx tsx scripts/import-clients-history.ts --dry-run --report reports/clients-preview.csv
 *   npx tsx scripts/import-clients-history.ts --commit
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, writeBatch } from 'firebase/firestore';
import { sanitizePayload } from '../app/core/services/firestore-sanitizer';
import {
  extractTaxiCallerRows,
  transformTaxiCallerRows,
  type TaxiCallerClientRow,
  type TaxiCallerExportPayload,
} from '../app/core/services/customer/taxicaller-import.util';
import type { ContactRecord } from '../app/core/services/customer/contact.service';
import type { AppSettings, CorporateAccountConfig } from '../app/core/types/config';

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
  dir: string;
  reportPath?: string;
  email?: string;
  password?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  let commit = false;
  let dir = 'clients_history';
  let reportPath: string | undefined;
  let email: string | undefined;
  let password: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--commit') {
      commit = true;
    } else if (arg === '--dry-run') {
      commit = false;
    } else if (arg === '--dir' && argv[i + 1]) {
      dir = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--dir=')) {
      dir = arg.slice('--dir='.length);
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

  return { commit, dir, reportPath, email, password };
}

function escapeCsvCell(value: string | number | undefined): string {
  const raw = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function writeCsvReport(reportPath: string, contacts: ReadonlyArray<ContactRecord>): void {
  const resolved = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const header = [
    'id',
    'name',
    'phone',
    'email',
    'tripCount',
    'corporateAccountNumber',
    'corporateAccountName',
    'homeAddress',
    'savedPlacesCount',
    'notes',
  ].join(',');

  const lines = contacts.map((c) =>
    [
      escapeCsvCell(c.id),
      escapeCsvCell(c.name),
      escapeCsvCell(c.phone),
      escapeCsvCell(c.email),
      escapeCsvCell(c.tripCount ?? 0),
      escapeCsvCell(c.corporateAccountNumber),
      escapeCsvCell(c.corporateAccountName),
      escapeCsvCell(c.homeAddress),
      escapeCsvCell(c.savedPlaces?.length ?? 0),
      escapeCsvCell(c.notes),
    ].join(',')
  );

  fs.writeFileSync(resolved, [header, ...lines].join('\n'), 'utf-8');
  console.log(`📝 Wrote CSV preview report (${contacts.length} contacts) to: ${resolved}`);
}

async function initFirestoreAdmin(cliEmail?: string, cliPassword?: string) {
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

  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  const auth = getAuth(app);
  const adminEmail =
    cliEmail || process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || 'admin@chesterfieldtaxi.com';
  const adminPass =
    cliPassword || process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '';

  if (!adminPass) {
    console.error(
      `❌ Admin password required for --commit.\n` +
        `   Provide --email <admin-email> --password <password> or set ADMIN_EMAIL & ADMIN_PASSWORD in .env.local.\n` +
        `   (Note: firestore.rules requires 'admin@chesterfieldtaxi.com' or a user with role 'admin'.)`
    );
    process.exit(1);
  }

  const cred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log(`🔑 Authenticated as ${cred.user.email}`);

  return db;
}

async function loadCorporateAccountsFromFirestore(
  db: ReturnType<typeof getFirestore>
): Promise<CorporateAccountConfig[]> {
  const byId = new Map<string, CorporateAccountConfig>();

  try {
    const snap = await getDocs(collection(db, 'corporateAccounts'));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as CorporateAccountConfig | undefined;
      if (data?.accountNumber) {
        byId.set(data.id || docSnap.id, { ...data, id: data.id || docSnap.id });
      }
    });
  } catch (err) {
    console.warn('⚠️ Could not read corporateAccounts collection:', err);
  }

  if (byId.size === 0) {
    try {
      const settingsSnap = await getDoc(doc(db, 'config', 'appSettings'));
      if (settingsSnap.exists()) {
        const settings = settingsSnap.data() as Partial<AppSettings>;
        for (const acc of settings.corporateAccounts || []) {
          if (acc?.accountNumber) byId.set(acc.id, acc);
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not read config/appSettings corporateAccounts:', err);
    }
  }

  return Array.from(byId.values());
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const targetDir = path.isAbsolute(args.dir)
    ? args.dir
    : path.join(process.cwd(), args.dir);

  console.log('\n===============================================================');
  console.log('🚕 CHESTERFIELD TAXI: TAXICALLER HISTORICAL CLIENT IMPORTER');
  console.log(`   Mode: ${args.commit ? 'COMMIT (Firestore Write)' : 'DRY-RUN (Read-Only)'}`);
  console.log(`   Directory: ${targetDir}`);
  console.log('===============================================================\n');

  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const jsonFiles = fs
    .readdirSync(targetDir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort();

  if (jsonFiles.length === 0) {
    console.error(`❌ No .json files found in ${targetDir}`);
    process.exit(1);
  }

  console.log(`📂 Found ${jsonFiles.length} TaxiCaller JSON files.`);

  const allRows: TaxiCallerClientRow[] = [];
  for (const fileName of jsonFiles) {
    const filePath = path.join(targetDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as TaxiCallerExportPayload | TaxiCallerClientRow[];
    const rows = extractTaxiCallerRows(parsed);
    allRows.push(...rows);
  }

  console.log(`📄 Loaded ${allRows.length.toLocaleString()} total raw trip rows.`);

  let db: ReturnType<typeof getFirestore> | null = null;
  let corporateAccounts: CorporateAccountConfig[] = [];

  if (args.commit) {
    db = await initFirestoreAdmin(args.email, args.password);
    corporateAccounts = await loadCorporateAccountsFromFirestore(db);
    console.log(`🏢 Loaded ${corporateAccounts.length} corporate accounts from Firestore.`);
  }

  const { contacts, trips, stats } = transformTaxiCallerRows(allRows, {
    corporateAccounts,
  });

  console.log('\n--- [TRANSFORMATION SUMMARY] ---');
  console.log(` • Total Raw Rows:              ${stats.totalRows.toLocaleString()}`);
  console.log(` • Noise Rows Filtered:         ${stats.filteredNoiseRows.toLocaleString()}`);
  console.log(` • Invalid/Short Phones:        ${stats.filteredInvalidPhoneRows.toLocaleString()}`);
  console.log(` • Unique Valid Phones:         ${stats.uniquePhones.toLocaleString()}`);
  console.log(` • Excluded (1 trip, no email/acct): ${stats.excludedSingleTripCount.toLocaleString()}`);
  console.log(` • Included Contacts:           ${stats.includedContactsCount.toLocaleString()}`);
  console.log(` • Corporate Account Tagged:    ${stats.corporateLinkedCount.toLocaleString()}`);
  console.log(` • Gate Codes Extracted:        ${stats.gateCodeCount.toLocaleString()}`);
  console.log(` • Saved Places Aggregated:     ${stats.savedPlacesCount.toLocaleString()}`);
  console.log(` • Constructed Trips (1-10/ea): ${stats.constructedTripsCount.toLocaleString()}`);

  const topPreview = [...contacts]
    .sort((a, b) => (b.tripCount || 0) - (a.tripCount || 0))
    .slice(0, 5);
  console.log('\n--- [TOP 5 REPEAT CLIENTS PREVIEW] ---');
  for (const c of topPreview) {
    console.log(
      ` • ${c.name} (${c.phone}) | Trips: ${c.tripCount} | Email: ${c.email || 'N/A'} | Acct: ${c.corporateAccountNumber || 'N/A'}`
    );
    if (c.homeAddress) console.log(`   Home: ${c.homeAddress}`);
    if (c.notes) console.log(`   Notes: ${c.notes}`);
  }

  if (args.reportPath) {
    writeCsvReport(args.reportPath, contacts);
  }

  if (!args.commit) {
    console.log('\n✅ Dry-run complete. Re-run with --commit to upsert into Firestore `contacts`.\n');
    return;
  }

  if (!db) {
    console.error('❌ Firestore instance unavailable.');
    process.exit(1);
  }

  const batchSize = 500;
  let committed = 0;
  console.log(`\n💾 Upserting ${contacts.length.toLocaleString()} contacts to Firestore in batches of ${batchSize}...`);

  for (let i = 0; i < contacts.length; i += batchSize) {
    const chunk = contacts.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const contact of chunk) {
      const ref = doc(db, 'contacts', contact.id);
      const sanitized = sanitizePayload(contact, { mode: 'omit' });
      batch.set(ref, sanitized, { merge: true });
    }
    await batch.commit();
    committed += chunk.length;
    console.log(
      `   → Batch ${Math.floor(i / batchSize) + 1}: committed ${committed.toLocaleString()} / ${contacts.length.toLocaleString()}`
    );
  }

  console.log(
    `\n💾 Upserting ${trips.length.toLocaleString()} historical trips to Firestore in batches of ${batchSize}...`
  );
  let committedTrips = 0;
  for (let i = 0; i < trips.length; i += batchSize) {
    const chunk = trips.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const trip of chunk) {
      const ref = doc(db, 'trips', trip.id);
      const sanitized = sanitizePayload(trip, { mode: 'omit' });
      batch.set(ref, sanitized, { merge: true });
    }
    await batch.commit();
    committedTrips += chunk.length;
    console.log(
      `   → Trip Batch ${Math.floor(i / batchSize) + 1}: committed ${committedTrips.toLocaleString()} / ${trips.length.toLocaleString()}`
    );
  }

  console.log('\n🎉 Firestore `contacts` and `trips` import completed successfully!\n');
}

main().catch((err) => {
  console.error('❌ Fatal error during TaxiCaller client import:', err);
  process.exit(1);
});
