import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

/**
 * Bulk-deletes Firebase Authentication users except those in the protected allowlist.
 *
 * Defaults to DRY-RUN mode (no users are deleted unless `--execute` is passed).
 *
 * Usage:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
 *   npx tsx scripts/cleanup-spam-auth-users.ts
 *   npx tsx scripts/cleanup-spam-auth-users.ts --execute
 *
 * Optional flags:
 *   --key=<path>       Path to Firebase service account JSON (alternative to GOOGLE_APPLICATION_CREDENTIALS)
 *   --keep=a@b.com,... Additional comma-separated emails to preserve
 *   --verbose          Print every user queued for deletion
 *   --execute          Actually delete the non-protected users (omit for dry run)
 */

// Verify the 3rd address before running with --execute ("zemene@zemenemuche@gmail.com" has two @ signs).
const DEFAULT_PROTECTED_EMAILS = [
  'admin@chesterfieldtaxi.com',
  'dispatch@chesterfieldtaxi.com',
  'zemene@zemenemuche.com',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DELETE_BATCH_SIZE = 1000;

function parseArgs(argv: string[]) {
  const execute = argv.includes('--execute');
  const verbose = argv.includes('--verbose');
  const keyArg = argv.find((a) => a.startsWith('--key='))?.slice('--key='.length);
  const keepArg = argv.find((a) => a.startsWith('--keep='))?.slice('--keep='.length);
  const extraKeep = keepArg
    ? keepArg.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];

  return { execute, verbose, keyArg, extraKeep };
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
      '   npx tsx scripts/cleanup-spam-auth-users.ts'
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

async function main() {
  const { execute, verbose, keyArg, extraKeep } = parseArgs(process.argv.slice(2));
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

  console.log('Fetching all Firebase Authentication users...');
  const allUsers = await listAllAuthUsers();

  const toKeep: UserRecord[] = [];
  const toDelete: UserRecord[] = [];

  for (const user of allUsers) {
    const email = (user.email || '').trim().toLowerCase();
    if (email && protectedEmails.has(email)) {
      toKeep.push(user);
    } else {
      toDelete.push(user);
    }
  }

  console.log(`\nTotal Auth users: ${allUsers.length}`);
  console.log(`Protected (keep): ${toKeep.length}`);
  for (const u of toKeep) {
    console.log(`  [KEEP] ${u.email || '(no email)'} (uid: ${u.uid})`);
  }

  console.log(`\nQueued for deletion: ${toDelete.length}`);
  const preview = verbose ? toDelete : toDelete.slice(0, 25);
  for (const u of preview) {
    console.log(`  [DEL]  ${u.email || '(no email)'} (uid: ${u.uid}, created: ${u.metadata.creationTime})`);
  }
  if (!verbose && toDelete.length > preview.length) {
    console.log(`  ... and ${toDelete.length - preview.length} more (pass --verbose to list all)`);
  }

  if (!execute) {
    console.log('\nDRY RUN complete. No users were deleted. Pass --execute to delete the queued users.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  const auth = getAuth();
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < toDelete.length; i += DELETE_BATCH_SIZE) {
    const batch = toDelete.slice(i, i + DELETE_BATCH_SIZE);
    const result = await auth.deleteUsers(batch.map((u) => u.uid));
    deleted += result.successCount;
    failed += result.failureCount;
    for (const err of result.errors) {
      console.error(`  Failed uid=${batch[err.index]?.uid}: ${err.error.message}`);
    }
    console.log(`Processed batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1}: deleted=${result.successCount}, failed=${result.failureCount}`);
  }

  console.log(`\nDone. Deleted ${deleted} user(s), failed ${failed}.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
