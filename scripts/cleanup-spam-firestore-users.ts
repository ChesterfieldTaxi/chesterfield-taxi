import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Bulk-deletes Firestore `users` documents except those matching the protected
 * email allowlist (or, by default, UIDs that still exist in Firebase Auth).
 *
 * Defaults to DRY-RUN mode (no documents are deleted unless `--execute` is passed).
 *
 * Usage:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
 *   npx tsx scripts/cleanup-spam-firestore-users.ts
 *   npx tsx scripts/cleanup-spam-firestore-users.ts --execute
 *
 * Optional flags:
 *   --key=<path>       Path to Firebase service account JSON (alternative to GOOGLE_APPLICATION_CREDENTIALS)
 *   --keep=a@b.com,... Additional comma-separated emails to preserve
 *   --ignore-auth      Only use the email allowlist (do not auto-keep docs whose ID exists in Firebase Auth)
 *   --verbose          Print every document queued for deletion
 *   --execute          Actually delete the queued Firestore documents (omit for dry run)
 */

// Verify the 3rd address before running with --execute ("zemene@zemenemuche@gmail.com" has two @ signs).
const DEFAULT_PROTECTED_EMAILS = [
  'admin@chesterfieldtaxi.com',
  'dispatch@chesterfieldtaxi.com',
  'zemene@zemenemuche.com',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv: string[]) {
  const execute = argv.includes('--execute');
  const verbose = argv.includes('--verbose');
  const ignoreAuth = argv.includes('--ignore-auth');
  const keyArg = argv.find((a) => a.startsWith('--key='))?.slice('--key='.length);
  const keepArg = argv.find((a) => a.startsWith('--keep='))?.slice('--keep='.length);
  const extraKeep = keepArg
    ? keepArg.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];

  return { execute, verbose, ignoreAuth, keyArg, extraKeep };
}

function initAdmin(keyArg?: string) {
  if (getApps().length > 0) return;

  const keyPath = keyArg || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.error(
      'Missing Firebase service account credentials.\n' +
      '1. Firebase Console -> Project Settings -> Service accounts -> Generate new private key\n' +
      '2. Save the JSON outside this repo and run:\n' +
      '   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"\n' +
      '   npx tsx scripts/cleanup-spam-firestore-users.ts'
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

async function getRemainingAuthUids(): Promise<Set<string>> {
  const auth = getAuth();
  const uids = new Set<string>();
  let nextPageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const u of page.users) uids.add(u.uid);
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return uids;
}

async function main() {
  const { execute, verbose, ignoreAuth, keyArg, extraKeep } = parseArgs(process.argv.slice(2));
  const protectedEmails = new Set([
    ...DEFAULT_PROTECTED_EMAILS.map((e) => e.trim().toLowerCase()),
    ...extraKeep,
  ]);

  const invalidProtected = [...protectedEmails].filter((e) => !EMAIL_RE.test(e));
  if (invalidProtected.length > 0) {
    console.warn(`WARNING: Protected email list contains invalid address(es): ${invalidProtected.join(', ')}`);
    if (execute) {
      console.error('Aborting --execute until all protected emails are valid.');
      process.exit(1);
    }
  }

  initAdmin(keyArg);

  const authUids = ignoreAuth ? new Set<string>() : await getRemainingAuthUids();
  if (!ignoreAuth) {
    console.log(`Loaded ${authUids.size} remaining Firebase Auth UID(s) to preserve.`);
  }

  const db = getFirestore();
  console.log('Fetching Firestore `users` documents...');
  const snapshot = await db.collection('users').get();

  const toKeep: Array<{ id: string; email: string; reason: string }> = [];
  const toDelete: Array<{ id: string; email: string; ref: FirebaseFirestore.DocumentReference }> = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';

    if (email && protectedEmails.has(email)) {
      toKeep.push({ id: docSnap.id, email, reason: 'protected email' });
    } else if (!ignoreAuth && authUids.has(docSnap.id)) {
      toKeep.push({ id: docSnap.id, email: email || '(no email)', reason: 'exists in Auth' });
    } else {
      toDelete.push({ id: docSnap.id, email: email || '(no email)', ref: docSnap.ref });
    }
  }

  console.log(`\nTotal Firestore users docs: ${snapshot.size}`);
  console.log(`Protected (keep): ${toKeep.length}`);
  for (const item of toKeep) {
    console.log(`  [KEEP] ${item.email} (docId: ${item.id}, reason: ${item.reason})`);
  }

  console.log(`\nQueued for deletion: ${toDelete.length}`);
  const preview = verbose ? toDelete : toDelete.slice(0, 25);
  for (const item of preview) {
    console.log(`  [DEL]  ${item.email} (docId: ${item.id})`);
  }
  if (!verbose && toDelete.length > preview.length) {
    console.log(`  ... and ${toDelete.length - preview.length} more (pass --verbose to list all)`);
  }

  if (!execute) {
    console.log('\nDRY RUN complete. No Firestore documents were deleted. Pass --execute to delete the queued documents.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const item of toDelete) {
    try {
      await db.recursiveDelete(item.ref);
      deleted++;
      if (deleted % 50 === 0 || deleted === toDelete.length) {
        console.log(`Deleted ${deleted}/${toDelete.length} document(s)...`);
      }
    } catch (err: any) {
      failed++;
      console.error(`  Failed docId=${item.id}: ${err?.message || err}`);
    }
  }

  console.log(`\nDone. Deleted ${deleted} document(s), failed ${failed}.`);
}

main().catch((err) => {
  console.error('Firestore cleanup failed:', err);
  process.exit(1);
});
