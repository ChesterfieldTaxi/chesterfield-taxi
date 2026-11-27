import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';

/**
 * Pre-Launch Firestore & Auth Test Record Cleanup CLI
 *
 * Defaults to DRY-RUN mode (no documents or Auth users are deleted/updated
 * unless `--execute` is passed).
 *
 * Usage:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
 *   npx tsx scripts/cleanup-prelaunch-test-data.ts
 *   npx tsx scripts/cleanup-prelaunch-test-data.ts --execute
 *
 * Optional flags:
 *   --key=<path>          Path to Firebase service account JSON
 *   --verbose             Print every queued document/user (default caps preview at 25)
 *   --include-all-trips   Queue ALL remaining `trips` (+ linked tracking docs) for deletion
 *   --remove-setup-auth   Delete `admin_setup@chesterfieldtaxi.com` and `*@example.com` Auth users (requires --execute)
 *   --execute             Actually perform deletions/updates (omit for dry run)
 */

const EXAMPLE_EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)*example\.com$/i;
const TEST_USER_FIRST_RE = /^Test\d*$/i;
const TEST_USER_FULL_RE = /^Test\d*\s+User$/i;
const SETUP_AUTH_EMAIL = 'admin_setup@chesterfieldtaxi.com';

const SCOPED_COMMS_AND_LEDGER_COLLECTIONS = [
  'contacts',
  'commsThreads',
  'commsEvents',
  'dispatchEmails',
  'dispatch_alerts',
  'inquiries',
  'applications',
  'invoices',
  'driverPayouts',
  'financialLedger',
  'unbilledTransactions',
] as const;

export interface CleanupCliOptions {
  execute: boolean;
  verbose: boolean;
  includeAllTrips: boolean;
  removeSetupAuth: boolean;
  keyArg?: string;
}

export function parseArgs(argv: string[]): CleanupCliOptions {
  const execute = argv.includes('--execute');
  const verbose = argv.includes('--verbose');
  const includeAllTrips = argv.includes('--include-all-trips');
  const removeSetupAuth = argv.includes('--remove-setup-auth');
  const keyArg = argv.find((a) => a.startsWith('--key='))?.slice('--key='.length);

  return { execute, verbose, includeAllTrips, removeSetupAuth, keyArg };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isTestOrExampleEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'test@example.com' || EXAMPLE_EMAIL_RE.test(normalized);
}

function isMockIdToken(id: string): boolean {
  const upper = id.toUpperCase();
  return (
    id.startsWith('MOCK-') ||
    id.startsWith('stress_') ||
    id.startsWith('drv-') ||
    id === 'corp-001' ||
    id === 'corp-002' ||
    id === 'corp-003' ||
    upper === 'CORP-BAY-902' ||
    upper === 'CORP-MRC-441' ||
    upper === 'CORP-DRY-108'
  );
}

/**
 * Pure classifier for `trips` documents.
 * Matches `MOCK-*`, `stress_*`, `passenger.email === 'test@example.com'`,
 * `pickupLocation.address === '123 Test St'`, `passenger.phone === '555-0100'`,
 * or `Test<N> User`.
 */
export function isMockTripRecord(docId: string, data: Record<string, unknown> = {}): boolean {
  if (docId.startsWith('MOCK-') || docId.startsWith('stress_')) {
    return true;
  }

  const passenger = asRecord(data.passenger);
  const pickupLocation = asRecord(data.pickupLocation);

  const email = asString(passenger.email).toLowerCase();
  if (email === 'test@example.com' || isTestOrExampleEmail(email)) {
    return true;
  }

  const address = asString(pickupLocation.address);
  if (address === '123 Test St') {
    return true;
  }

  const phone = asString(passenger.phone);
  if (phone === '555-0100') {
    return true;
  }

  const firstName = asString(passenger.firstName);
  const lastName = asString(passenger.lastName);
  if (lastName === 'User' && TEST_USER_FIRST_RE.test(firstName)) {
    return true;
  }

  const fullName = asString(passenger.name) || asString(data.passengerName);
  if (fullName && TEST_USER_FULL_RE.test(fullName)) {
    return true;
  }

  return false;
}

/**
 * Pure classifier for `drivers` documents.
 * Matches `drv-101`, `drv-*`, `demo-*` while preserving real operator UIDs.
 */
export function isMockDriverRecord(docId: string, data: Record<string, unknown> = {}): boolean {
  if (docId === 'drv-101' || docId.startsWith('drv-') || docId.startsWith('demo-')) {
    return true;
  }

  const email = asString(data.email);
  if (isTestOrExampleEmail(email)) {
    return true;
  }

  return false;
}

/**
 * Pure classifier for `corporateAccounts` and `corporateLookup` documents.
 * Matches `corp-001`, `CORP-BAY-902`, `archiveReason === 'Mock'`,
 * `*.example.com` billing/contact emails (including `billingContactEmail`),
 * or `corporateAccountId` matching a known mock corporate ID.
 */
export function isMockCorporateRecord(docId: string, data: Record<string, unknown> = {}): boolean {
  if (data.imported === true) {
    return false;
  }

  const upperId = docId.toUpperCase();
  if (docId === 'corp-001' || upperId === 'CORP-BAY-902') {
    return true;
  }

  const accountCode = asString(data.accountCode).toUpperCase();
  const accountNumber = asString(data.accountNumber).toUpperCase();
  const corporateId = asString(data.corporateId);
  const corporateAccountId = asString(data.corporateAccountId);
  if (
    corporateId === 'corp-001' ||
    corporateAccountId === 'corp-001' ||
    accountCode === 'CORP-BAY-902' ||
    accountNumber === 'CORP-BAY-902'
  ) {
    return true;
  }

  if (asString(data.archiveReason).toLowerCase() === 'mock') {
    return true;
  }

  const billing = asRecord(data.billing);
  const candidateEmails = [
    asString(data.billingEmail),
    asString(data.billingContactEmail),
    asString(data.email),
    asString(data.contactEmail),
    asString(billing.email),
  ];

  if (candidateEmails.some((e) => isTestOrExampleEmail(e))) {
    return true;
  }

  if (Array.isArray(data.authorizedBookers)) {
    for (const booker of data.authorizedBookers) {
      if (typeof booker === 'string' && isTestOrExampleEmail(booker)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Pure classifier for contacts, comms, inquiries, applications, and ledger collections.
 * Matches explicit test/demo markers: `test@example.com`, `@*.example.com`,
 * `555-0100`, `MOCK-`, `stress_`, `drv-`, `corp-001`.
 */
export function isMockContactOrCommsRecord(docId: string, data: Record<string, unknown> = {}): boolean {
  if (isMockIdToken(docId)) {
    return true;
  }

  const emailFields = [
    asString(data.email),
    asString(data.from),
    asString(data.to),
    asString(data.senderEmail),
    asString(data.recipientEmail),
    asString(data.billingEmail),
    asString(data.contactEmail),
    asString(data.customerEmail),
  ];
  if (emailFields.some((e) => isTestOrExampleEmail(e))) {
    return true;
  }

  const phoneFields = [
    asString(data.phone),
    asString(data.fromPhone),
    asString(data.toPhone),
    asString(data.customerPhone),
  ];
  if (phoneFields.some((p) => p === '555-0100')) {
    return true;
  }

  const idFields = [
    asString(data.tripId),
    asString(data.driverId),
    asString(data.corporateId),
    asString(data.corporateAccountId),
    asString(data.accountId),
    asString(data.invoiceId),
    asString(data.threadId),
  ];
  if (idFields.some((id) => id && isMockIdToken(id))) {
    return true;
  }

  const passenger = asRecord(data.passenger);
  if (
    isTestOrExampleEmail(asString(passenger.email)) ||
    asString(passenger.phone) === '555-0100'
  ) {
    return true;
  }

  return false;
}

function discoverServiceAccountPath(keyArg?: string): string | undefined {
  if (keyArg) return keyArg;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  const rootDir = process.cwd();
  const entries = fs.readdirSync(rootDir);
  const match = entries.find((name) => name.includes('firebase-adminsdk') && name.endsWith('.json'));
  return match ? path.join(rootDir, match) : undefined;
}

function initAdmin(keyArg?: string): void {
  if (getApps().length > 0) return;

  const keyPath = discoverServiceAccountPath(keyArg);
  if (!keyPath) {
    console.error(
      'Missing Firebase service account credentials.\n' +
      'Provide one of:\n' +
      '  1. --key=<path-to-service-account.json>\n' +
      '  2. $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"\n' +
      '  3. A local *firebase-adminsdk*.json file in the repo root'
    );
    process.exit(1);
  }

  const resolved = path.resolve(keyPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Service account file not found: ${resolved}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as ServiceAccount;
  initializeApp({ credential: cert(serviceAccount) });
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  const auth = getAuth();
  const users: UserRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

interface QueuedDoc {
  collection: string;
  id: string;
  reason: string;
  ref: DocumentReference;
}

function printQueuedGroup(label: string, items: QueuedDoc[], verbose: boolean): void {
  console.log(`\n${label}: ${items.length} document(s)`);
  const preview = verbose ? items : items.slice(0, 25);
  for (const item of preview) {
    console.log(`  [DEL] ${item.collection}/${item.id} (${item.reason})`);
  }
  if (!verbose && items.length > preview.length) {
    console.log(`  ... and ${items.length - preview.length} more (pass --verbose to list all)`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  initAdmin(options.keyArg);

  const db = getFirestore();
  const queuedDeletes: QueuedDoc[] = [];

  // 1. Trips + linked tripTracking / tripTrackingLookup
  const tripsSnap = await db.collection('trips').get();
  const targetTripIds = new Set<string>();
  const keptTrips: Array<{ id: string; label: string }> = [];

  for (const docSnap of tripsSnap.docs) {
    const data = docSnap.data();
    const isMock = options.includeAllTrips || isMockTripRecord(docSnap.id, data);
    if (isMock) {
      targetTripIds.add(docSnap.id);
      queuedDeletes.push({
        collection: 'trips',
        id: docSnap.id,
        reason: options.includeAllTrips ? '--include-all-trips' : 'mock/test trip',
        ref: docSnap.ref,
      });
    } else {
      const passenger = asRecord(data.passenger);
      keptTrips.push({
        id: docSnap.id,
        label: `${asString(passenger.firstName)} ${asString(passenger.lastName)}`.trim() || '(no name)',
      });
    }
  }

  if (targetTripIds.size > 0) {
    const trackingSnap = await db.collection('tripTracking').get();
    for (const docSnap of trackingSnap.docs) {
      const tripId = asString(docSnap.data().tripId);
      if (targetTripIds.has(docSnap.id) || (tripId && targetTripIds.has(tripId))) {
        queuedDeletes.push({
          collection: 'tripTracking',
          id: docSnap.id,
          reason: `linked to trip ${tripId || docSnap.id}`,
          ref: docSnap.ref,
        });
      }
    }

    const trackingLookupSnap = await db.collection('tripTrackingLookup').get();
    for (const docSnap of trackingLookupSnap.docs) {
      const tripId = asString(docSnap.data().tripId);
      if (targetTripIds.has(docSnap.id) || (tripId && targetTripIds.has(tripId))) {
        queuedDeletes.push({
          collection: 'tripTrackingLookup',
          id: docSnap.id,
          reason: `linked to trip ${tripId || docSnap.id}`,
          ref: docSnap.ref,
        });
      }
    }
  }

  console.log(`Trips analyzed: ${tripsSnap.size} total, ${keptTrips.length} kept, ${targetTripIds.size} queued for deletion.`);
  printQueuedGroup('Trips & Tracking', queuedDeletes.filter((d) => d.collection.startsWith('trip')), options.verbose);

  // 2. Drivers
  const driversSnap = await db.collection('drivers').get();
  const driverDeletes: QueuedDoc[] = [];
  for (const docSnap of driversSnap.docs) {
    if (isMockDriverRecord(docSnap.id, docSnap.data())) {
      const item: QueuedDoc = {
        collection: 'drivers',
        id: docSnap.id,
        reason: 'mock/demo driver',
        ref: docSnap.ref,
      };
      driverDeletes.push(item);
      queuedDeletes.push(item);
    }
  }
  printQueuedGroup(`Drivers (${driversSnap.size} total)`, driverDeletes, options.verbose);

  // 3. Corporate Accounts & Lookup
  const corpDeletes: QueuedDoc[] = [];
  const targetCorpIds = new Set<string>();
  const corpSnap = await db.collection('corporateAccounts').get();
  for (const docSnap of corpSnap.docs) {
    if (isMockCorporateRecord(docSnap.id, docSnap.data())) {
      targetCorpIds.add(docSnap.id);
      const item: QueuedDoc = {
        collection: 'corporateAccounts',
        id: docSnap.id,
        reason: 'mock/demo corporate record',
        ref: docSnap.ref,
      };
      corpDeletes.push(item);
      queuedDeletes.push(item);
    }
  }

  const corpLookupSnap = await db.collection('corporateLookup').get();
  for (const docSnap of corpLookupSnap.docs) {
    const data = docSnap.data();
    const linkedCorpId = asString(data.corporateAccountId) || asString(data.corporateId);
    if ((linkedCorpId && targetCorpIds.has(linkedCorpId)) || isMockCorporateRecord(docSnap.id, data)) {
      const item: QueuedDoc = {
        collection: 'corporateLookup',
        id: docSnap.id,
        reason: linkedCorpId ? `linked to ${linkedCorpId}` : 'mock/demo corporate lookup',
        ref: docSnap.ref,
      };
      corpDeletes.push(item);
      queuedDeletes.push(item);
    }
  }
  printQueuedGroup('Corporate Accounts & Lookup', corpDeletes, options.verbose);

  // 4. Contacts, Comms, Inquiries, Applications, Ledger
  const commsDeletes: QueuedDoc[] = [];
  for (const colName of SCOPED_COMMS_AND_LEDGER_COLLECTIONS) {
    const snap = await db.collection(colName).get();
    for (const docSnap of snap.docs) {
      if (isMockContactOrCommsRecord(docSnap.id, docSnap.data())) {
        const item: QueuedDoc = {
          collection: colName,
          id: docSnap.id,
          reason: 'test/demo marker',
          ref: docSnap.ref,
        };
        commsDeletes.push(item);
        queuedDeletes.push(item);
      }
    }
  }
  printQueuedGroup('Contacts, Comms & Financial Ledger', commsDeletes, options.verbose);

  // 4b. Check config/appSettings embedded corporateAccounts & invoices arrays
  const appSettingsRef = db.doc('config/appSettings');
  const appSettingsSnap = await appSettingsRef.get();
  let appSettingsUpdate: {
    corporateAccounts?: Array<Record<string, unknown>>;
    invoices?: Array<Record<string, unknown>>;
    removedCorpIds: string[];
    removedInvoiceIds: string[];
  } | null = null;

  if (appSettingsSnap.exists) {
    const appData = appSettingsSnap.data() || {};
    const existingCorps = Array.isArray(appData.corporateAccounts)
      ? (appData.corporateAccounts as Array<Record<string, unknown>>)
      : [];
    const existingInvoices = Array.isArray(appData.invoices)
      ? (appData.invoices as Array<Record<string, unknown>>)
      : [];

    const keptCorps: Array<Record<string, unknown>> = [];
    const removedCorpIds: string[] = [];
    for (const c of existingCorps) {
      const cid = asString(c.id);
      if (isMockCorporateRecord(cid, c)) {
        removedCorpIds.push(cid || '(unnamed)');
      } else {
        keptCorps.push(c);
      }
    }

    const keptInvoices: Array<Record<string, unknown>> = [];
    const removedInvoiceIds: string[] = [];
    for (const inv of existingInvoices) {
      const invId = asString(inv.id);
      if (isMockContactOrCommsRecord(invId, inv)) {
        removedInvoiceIds.push(invId || '(unnamed)');
      } else {
        keptInvoices.push(inv);
      }
    }

    if (removedCorpIds.length > 0 || removedInvoiceIds.length > 0) {
      appSettingsUpdate = {
        ...(removedCorpIds.length > 0 ? { corporateAccounts: keptCorps } : {}),
        ...(removedInvoiceIds.length > 0 ? { invoices: keptInvoices } : {}),
        removedCorpIds,
        removedInvoiceIds,
      };
    }
  }

  console.log('\nConfig (`config/appSettings`):');
  if (appSettingsUpdate) {
    console.log(
      `  [UPD] Remove ${appSettingsUpdate.removedCorpIds.length} mock corporateAccounts ` +
      `(${appSettingsUpdate.removedCorpIds.join(', ')}) and ` +
      `${appSettingsUpdate.removedInvoiceIds.length} mock invoices ` +
      `(${appSettingsUpdate.removedInvoiceIds.join(', ')})`
    );
  } else {
    console.log('  No mock corporateAccounts or invoices embedded in config/appSettings.');
  }

  // 5. Analytics KPI summary
  const kpiRef = db.doc('analytics/kpiSummary');
  const kpiSnap = await kpiRef.get();
  console.log('\nAnalytics KPI Summary (`analytics/kpiSummary`):');
  if (kpiSnap.exists) {
    console.log('  Current:', JSON.stringify(kpiSnap.data()));
  } else {
    console.log('  Document does not exist.');
  }

  // 6. Firebase Auth Setup / Example Account Check
  const allAuthUsers = await listAllAuthUsers();
  const setupAuthUsers = allAuthUsers.filter((u) => {
    const email = (u.email || '').trim().toLowerCase();
    return email === SETUP_AUTH_EMAIL || EXAMPLE_EMAIL_RE.test(email);
  });

  console.log(`\nFirebase Auth Setup / Example Accounts found: ${setupAuthUsers.length}`);
  for (const u of setupAuthUsers) {
    console.log(`  [AUTH] ${u.email || '(no email)'} (uid: ${u.uid})`);
  }
  if (setupAuthUsers.length > 0 && !options.removeSetupAuth) {
    console.log('  Note: Pass --remove-setup-auth --execute to delete these Auth accounts.');
  }

  if (!options.execute) {
    const configMsg = appSettingsUpdate ? ' and 1 config/appSettings update' : '';
    console.log(
      `\nDRY RUN complete. ${queuedDeletes.length} Firestore document(s)${configMsg} queued. ` +
      'No Firestore documents or Auth users were modified. Pass --execute to apply changes.'
    );
    return;
  }

  // Execute Firestore deletions
  let deleted = 0;
  let failed = 0;
  for (const item of queuedDeletes) {
    try {
      await db.recursiveDelete(item.ref);
      deleted++;
    } catch (err: unknown) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Failed ${item.collection}/${item.id}: ${message}`);
    }
  }
  console.log(`\nFirestore cleanup complete. Deleted ${deleted} document(s), failed ${failed}.`);

  if (appSettingsUpdate) {
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (appSettingsUpdate.corporateAccounts) {
      patch.corporateAccounts = appSettingsUpdate.corporateAccounts;
    }
    if (appSettingsUpdate.invoices) {
      patch.invoices = appSettingsUpdate.invoices;
    }
    await appSettingsRef.set(patch, { merge: true });
    console.log(
      `Updated config/appSettings: removed ${appSettingsUpdate.removedCorpIds.length} corporateAccounts, ` +
      `${appSettingsUpdate.removedInvoiceIds.length} invoices.`
    );
  }

  // Recompute / reset analytics/kpiSummary from remaining trips
  const remainingTripsSnap = await db.collection('trips').get();
  let completedTrips = 0;
  let cancelledTrips = 0;
  let totalRevenue = 0;

  for (const docSnap of remainingTripsSnap.docs) {
    const d = docSnap.data();
    const status = asString(d.status).toLowerCase();
    if (status === 'completed') {
      completedTrips++;
      const fare = typeof d.totalFare === 'number' ? d.totalFare : typeof d.estimatedFare === 'number' ? d.estimatedFare : 0;
      totalRevenue += fare;
    } else if (status === 'cancelled' || status === 'canceled') {
      cancelledTrips++;
    }
  }

  await kpiRef.set(
    {
      totalTrips: remainingTripsSnap.size,
      completedTrips,
      cancelledTrips,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`Updated analytics/kpiSummary for ${remainingTripsSnap.size} remaining trip(s).`);

  // Execute Auth deletions only when --remove-setup-auth --execute are both set
  if (options.removeSetupAuth && setupAuthUsers.length > 0) {
    const auth = getAuth();
    const result = await auth.deleteUsers(setupAuthUsers.map((u) => u.uid));
    console.log(`Auth cleanup: deleted=${result.successCount}, failed=${result.failureCount}`);
    for (const err of result.errors) {
      console.error(`  Failed uid=${setupAuthUsers[err.index]?.uid}: ${err.error.message}`);
    }
  }
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error('Pre-launch cleanup failed:', err);
    process.exit(1);
  });
}
