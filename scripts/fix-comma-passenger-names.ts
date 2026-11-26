/**
 * Resumable Comma Passenger Name Normalization CLI (Phase 103)
 *
 * Scans `/contacts` and `/trips` in 500-doc cursor pages (`orderBy(documentId())` +
 * `startAfter`) with a JSON checkpoint in `reports/` so runs can pause and resume
 * safely within Firebase Spark-plan daily read/write limits.
 *
 * - `/contacts`: flips simple `"Last, First"` names to `"First Last"` and recomputes
 *   `nameSearchTokens`, `nameLower`, `letterBucket`, and `updatedAt` via
 *   `computeContactSearchFields`.
 * - `/trips`: flips simple `"Last, First"` `passengerName` (and `passenger.firstName`
 *   when `passenger.lastName` is empty) to `"First Last"`.
 * - Multi-comma or suffix/corporate names (`Jr.`, `Sr.`, `II`, `III`, `IV`, `PhD`,
 *   `MD`, `LLC`, `Inc`, `Corp`, `Ltd`, etc.) are left untouched and logged to
 *   `reports/passenger-name-skipped.json` for manual review.
 *
 * Usage:
 *   npx tsx scripts/fix-comma-passenger-names.ts --dry-run
 *   npx tsx scripts/fix-comma-passenger-names.ts --dry-run --max-docs 50
 *   npx tsx scripts/fix-comma-passenger-names.ts --commit --contacts-only
 *   npx tsx scripts/fix-comma-passenger-names.ts --commit --trips-only
 *   npx tsx scripts/fix-comma-passenger-names.ts --commit --reset-checkpoint
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  startAfter,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  computeContactSearchFields,
  type ContactRecord,
} from '../app/core/services/customer/contact.service';
import { sanitizePayload } from '../app/core/services/firestore-sanitizer';

const DEFAULT_CHECKPOINT_PATH = 'reports/passenger-name-checkpoint.json';
const DEFAULT_SKIPPED_REPORT_PATH = 'reports/passenger-name-skipped.json';
const MAX_BATCH_SIZE = 500;

const SUFFIX_OR_CORPORATE_TOKENS = new Set([
  'jr',
  'sr',
  'ii',
  'iii',
  'iv',
  'v',
  'phd',
  'ph.d',
  'md',
  'm.d',
  'llc',
  'l.l.c',
  'inc',
  'corp',
  'ltd',
  'pllc',
  'llp',
  'pc',
  'p.c',
  'dds',
  'esq',
]);

export type SkipReason = 'multiple_commas' | 'empty_segment' | 'suffix_or_corporate';

export interface FlipCommaNameResult {
  changed: boolean;
  value: string;
  skippedReason?: SkipReason;
}

/**
 * Pure helper that flips a simple `"Last, First"` name into `"First Last"`.
 * Returns `{ changed: false, value: raw }` when no comma is present, or sets
 * `skippedReason` when the string has multiple commas, an empty segment, or a
 * right-hand segment containing a personal suffix or corporate designator.
 */
export function flipCommaName(raw: string): FlipCommaNameResult {
  if (typeof raw !== 'string' || !raw.includes(',')) {
    return { changed: false, value: typeof raw === 'string' ? raw : '' };
  }

  const parts = raw.split(',');
  if (parts.length > 2) {
    return { changed: false, value: raw, skippedReason: 'multiple_commas' };
  }

  const left = parts[0].trim().replace(/\s+/g, ' ');
  const right = parts[1].trim().replace(/\s+/g, ' ');

  if (!left || !right) {
    return { changed: false, value: raw, skippedReason: 'empty_segment' };
  }

  const rightTokens = right.split(/\s+/);
  for (const token of rightTokens) {
    const normalized = token.toLowerCase().replace(/\.+$/g, '');
    if (SUFFIX_OR_CORPORATE_TOKENS.has(normalized)) {
      return { changed: false, value: raw, skippedReason: 'suffix_or_corporate' };
    }
  }

  return {
    changed: true,
    value: `${right} ${left}`,
  };
}

export interface SkippedPassengerNameEntry {
  collection: 'contacts' | 'trips';
  docId: string;
  field: string;
  rawName: string;
  reason: SkipReason;
}

interface CliOptions {
  commit: boolean;
  contactsOnly: boolean;
  tripsOnly: boolean;
  resetCheckpoint: boolean;
  checkpointPath: string;
  skippedReportPath: string;
  batchSize: number;
  maxDocs?: number;
  email?: string;
  password?: string;
}

interface MigrationCheckpoint {
  contactsCompleted: boolean;
  lastContactDocId: string | null;
  contactsScanned: number;
  contactsUpdated: number;
  contactsSkipped: number;
  tripsCompleted: boolean;
  lastTripDocId: string | null;
  tripsScanned: number;
  tripsUpdated: number;
  tripsSkipped: number;
  skippedEntries: SkippedPassengerNameEntry[];
  updatedAt: string;
}

function loadEnvFiles(): void {
  const rootDir = process.cwd();
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = path.join(rootDir, envFile);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`Invalid ${flag} value "${raw}". Expected a positive integer.`);
    process.exit(1);
  }
  return n;
}

function parseArgs(argv: string[]): CliOptions {
  let commit = false;
  let contactsOnly = false;
  let tripsOnly = false;
  let resetCheckpoint = false;
  let checkpointPath = DEFAULT_CHECKPOINT_PATH;
  let skippedReportPath = DEFAULT_SKIPPED_REPORT_PATH;
  let batchSize = MAX_BATCH_SIZE;
  let maxDocs: number | undefined;
  let email: string | undefined;
  let password: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--commit') {
      commit = true;
    } else if (arg === '--dry-run') {
      commit = false;
    } else if (arg === '--contacts-only') {
      contactsOnly = true;
    } else if (arg === '--trips-only') {
      tripsOnly = true;
    } else if (arg === '--reset-checkpoint') {
      resetCheckpoint = true;
    } else if (arg === '--checkpoint' && argv[i + 1]) {
      checkpointPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--checkpoint=')) {
      checkpointPath = arg.slice('--checkpoint='.length);
    } else if (arg === '--skipped-report' && argv[i + 1]) {
      skippedReportPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--skipped-report=')) {
      skippedReportPath = arg.slice('--skipped-report='.length);
    } else if (arg === '--batch-size' && argv[i + 1]) {
      batchSize = Math.min(MAX_BATCH_SIZE, parsePositiveInt(argv[i + 1], '--batch-size'));
      i += 1;
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = Math.min(
        MAX_BATCH_SIZE,
        parsePositiveInt(arg.slice('--batch-size='.length), '--batch-size')
      );
    } else if (arg === '--max-docs' && argv[i + 1]) {
      maxDocs = parsePositiveInt(argv[i + 1], '--max-docs');
      i += 1;
    } else if (arg.startsWith('--max-docs=')) {
      maxDocs = parsePositiveInt(arg.slice('--max-docs='.length), '--max-docs');
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

  return {
    commit,
    contactsOnly,
    tripsOnly,
    resetCheckpoint,
    checkpointPath,
    skippedReportPath,
    batchSize,
    maxDocs,
    email:
      email ||
      process.env.ADMIN_EMAIL ||
      process.env.VITE_ADMIN_EMAIL ||
      'admin@chesterfieldtaxi.com',
    password: password || process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD,
  };
}

function createEmptyCheckpoint(): MigrationCheckpoint {
  return {
    contactsCompleted: false,
    lastContactDocId: null,
    contactsScanned: 0,
    contactsUpdated: 0,
    contactsSkipped: 0,
    tripsCompleted: false,
    lastTripDocId: null,
    tripsScanned: 0,
    tripsUpdated: 0,
    tripsSkipped: 0,
    skippedEntries: [],
    updatedAt: new Date().toISOString(),
  };
}

function readCheckpoint(filePath: string, reset: boolean): MigrationCheckpoint {
  const abs = path.resolve(process.cwd(), filePath);
  if (!reset && fs.existsSync(abs)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, 'utf-8')) as MigrationCheckpoint;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.skippedEntries)) {
        return parsed;
      }
    } catch {
      // Fall back to fresh checkpoint
    }
  }
  return createEmptyCheckpoint();
}

function writeJsonFile(filePath: string, data: unknown): void {
  const abs = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(abs, JSON.stringify(data, null, 2), 'utf-8');
}

function saveCheckpoint(filePath: string, checkpoint: MigrationCheckpoint): void {
  checkpoint.updatedAt = new Date().toISOString();
  writeJsonFile(filePath, checkpoint);
}

function appendSkipped(
  checkpoint: MigrationCheckpoint,
  entry: SkippedPassengerNameEntry
): void {
  const exists = checkpoint.skippedEntries.some(
    (e) =>
      e.collection === entry.collection &&
      e.docId === entry.docId &&
      e.field === entry.field
  );
  if (!exists) {
    checkpoint.skippedEntries.push(entry);
  }
}

async function initFirestoreClient(opts: CliOptions): Promise<Firestore> {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN;

  if (!apiKey || !projectId) {
    console.error(
      'Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID in .env.local / .env.'
    );
    process.exit(1);
  }

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          apiKey,
          projectId,
          authDomain: authDomain || `${projectId}.firebaseapp.com`,
        });

  if (!opts.password) {
    console.error(
      `❌ Staff authentication is required by firestore.rules to read/write /contacts and /trips.\n` +
        `   Pass --email <admin-email> --password <password> (or set ADMIN_EMAIL & ADMIN_PASSWORD in .env.local).`
    );
    process.exit(1);
  }

  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, opts.email!, opts.password);
  console.log(`Authenticated staff session as ${opts.email}`);

  return getFirestore(app);
}

async function runMigration(): Promise<void> {
  loadEnvFiles();
  const opts = parseArgs(process.argv.slice(2));
  const checkpoint = readCheckpoint(opts.checkpointPath, opts.resetCheckpoint);
  const db = await initFirestoreClient(opts);

  console.log('\n=== Phase 103: Comma Passenger Name Normalization ===');
  console.log(`Mode:            ${opts.commit ? 'COMMIT (writing to Firestore)' : 'DRY-RUN (read-only preview)'}`);
  console.log(`Batch size:      ${opts.batchSize}`);
  console.log(`Max docs budget: ${opts.maxDocs ?? 'unlimited'}`);
  console.log(`Checkpoint file: ${opts.checkpointPath}`);
  console.log(`Skipped report:  ${opts.skippedReportPath}\n`);

  let docsBudgetUsed = 0;
  const isBudgetReached = (): boolean =>
    typeof opts.maxDocs === 'number' && docsBudgetUsed >= opts.maxDocs;

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 1: Normalize /contacts
  // ───────────────────────────────────────────────────────────────────────────
  if (!opts.tripsOnly && !checkpoint.contactsCompleted) {
    console.log(
      `[1/2] Scanning /contacts from cursor=${checkpoint.lastContactDocId || '<start>'}...`
    );
    const contactsColl = collection(db, 'contacts');

    while (!isBudgetReached()) {
      const remainingBudget =
        typeof opts.maxDocs === 'number'
          ? Math.min(opts.batchSize, Math.max(1, opts.maxDocs - docsBudgetUsed))
          : opts.batchSize;

      const pageQuery = checkpoint.lastContactDocId
        ? query(
            contactsColl,
            orderBy(documentId()),
            startAfter(checkpoint.lastContactDocId),
            limit(remainingBudget)
          )
        : query(contactsColl, orderBy(documentId()), limit(remainingBudget));

      const snap = await getDocs(pageQuery);
      if (snap.empty) {
        checkpoint.contactsCompleted = true;
        if (opts.commit) saveCheckpoint(opts.checkpointPath, checkpoint);
        console.log('  Contacts scan reached end of collection.');
        break;
      }

      docsBudgetUsed += snap.docs.length;
      checkpoint.contactsScanned += snap.docs.length;

      const batch = writeBatch(db);
      let mutationsInBatch = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as Partial<ContactRecord>;
        const rawName = typeof data.name === 'string' ? data.name : '';
        const flipped = flipCommaName(rawName);

        if (flipped.skippedReason) {
          checkpoint.contactsSkipped += 1;
          appendSkipped(checkpoint, {
            collection: 'contacts',
            docId: docSnap.id,
            field: 'name',
            rawName,
            reason: flipped.skippedReason,
          });
          continue;
        }

        if (flipped.changed) {
          const nextName = flipped.value;
          const computed = computeContactSearchFields({
            ...data,
            id: data.id || docSnap.id,
            name: nextName,
          });
          mutationsInBatch += 1;
          checkpoint.contactsUpdated += 1;

          if (opts.commit) {
            batch.set(
              doc(db, 'contacts', docSnap.id),
              sanitizePayload({
                id: data.id || docSnap.id,
                name: nextName,
                nameSearchTokens: computed.nameSearchTokens,
                nameLower: computed.nameLower,
                letterBucket: computed.letterBucket,
                updatedAt: Date.now(),
              }),
              { merge: true }
            );
          }
        }
      }

      if (opts.commit && mutationsInBatch > 0) {
        await batch.commit();
      }

      checkpoint.lastContactDocId = snap.docs[snap.docs.length - 1].id;
      if (snap.docs.length < remainingBudget) {
        checkpoint.contactsCompleted = true;
      }
      if (opts.commit) {
        saveCheckpoint(opts.checkpointPath, checkpoint);
      }

      console.log(
        `  Contacts page: scanned=${checkpoint.contactsScanned}, updated=${checkpoint.contactsUpdated}, skipped=${checkpoint.contactsSkipped}, cursor=${checkpoint.lastContactDocId}`
      );

      if (checkpoint.contactsCompleted) break;
    }
  } else if (!opts.tripsOnly) {
    console.log(
      `[1/2] Contacts already completed in checkpoint (scanned=${checkpoint.contactsScanned}, updated=${checkpoint.contactsUpdated}, skipped=${checkpoint.contactsSkipped}).`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 2: Normalize /trips
  // ───────────────────────────────────────────────────────────────────────────
  if (!opts.contactsOnly && !checkpoint.tripsCompleted && !isBudgetReached()) {
    console.log(
      `\n[2/2] Scanning /trips from cursor=${checkpoint.lastTripDocId || '<start>'}...`
    );
    const tripsColl = collection(db, 'trips');

    while (!isBudgetReached()) {
      const remainingBudget =
        typeof opts.maxDocs === 'number'
          ? Math.min(opts.batchSize, Math.max(1, opts.maxDocs - docsBudgetUsed))
          : opts.batchSize;

      const pageQuery = checkpoint.lastTripDocId
        ? query(
            tripsColl,
            orderBy(documentId()),
            startAfter(checkpoint.lastTripDocId),
            limit(remainingBudget)
          )
        : query(tripsColl, orderBy(documentId()), limit(remainingBudget));

      const snap = await getDocs(pageQuery);
      if (snap.empty) {
        checkpoint.tripsCompleted = true;
        if (opts.commit) saveCheckpoint(opts.checkpointPath, checkpoint);
        console.log('  Trips scan reached end of collection.');
        break;
      }

      docsBudgetUsed += snap.docs.length;
      checkpoint.tripsScanned += snap.docs.length;

      const batch = writeBatch(db);
      let mutationsInBatch = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        let docMutated = false;

        if (typeof data.passengerName === 'string' && data.passengerName.includes(',')) {
          const flipped = flipCommaName(data.passengerName);
          if (flipped.skippedReason) {
            checkpoint.tripsSkipped += 1;
            appendSkipped(checkpoint, {
              collection: 'trips',
              docId: docSnap.id,
              field: 'passengerName',
              rawName: data.passengerName,
              reason: flipped.skippedReason,
            });
          } else if (flipped.changed) {
            updates.passengerName = flipped.value;
            docMutated = true;
          }
        }

        const passenger =
          data.passenger && typeof data.passenger === 'object'
            ? (data.passenger as Record<string, unknown>)
            : null;
        if (
          passenger &&
          typeof passenger.firstName === 'string' &&
          passenger.firstName.includes(',') &&
          (!passenger.lastName || !String(passenger.lastName).trim())
        ) {
          const flipped = flipCommaName(passenger.firstName);
          if (flipped.skippedReason) {
            checkpoint.tripsSkipped += 1;
            appendSkipped(checkpoint, {
              collection: 'trips',
              docId: docSnap.id,
              field: 'passenger.firstName',
              rawName: passenger.firstName,
              reason: flipped.skippedReason,
            });
          } else if (flipped.changed) {
            const nameParts = flipped.value.split(/\s+/);
            updates.passenger = {
              ...passenger,
              firstName: nameParts[0] || flipped.value,
              lastName: nameParts.slice(1).join(' '),
            };
            docMutated = true;
          }
        }

        if (docMutated) {
          mutationsInBatch += 1;
          checkpoint.tripsUpdated += 1;
          if (opts.commit) {
            updates.updatedAt = new Date().toISOString();
            batch.set(doc(db, 'trips', docSnap.id), sanitizePayload(updates), { merge: true });
          }
        }
      }

      if (opts.commit && mutationsInBatch > 0) {
        await batch.commit();
      }

      checkpoint.lastTripDocId = snap.docs[snap.docs.length - 1].id;
      if (snap.docs.length < remainingBudget) {
        checkpoint.tripsCompleted = true;
      }
      if (opts.commit) {
        saveCheckpoint(opts.checkpointPath, checkpoint);
      }

      console.log(
        `  Trips page: scanned=${checkpoint.tripsScanned}, updated=${checkpoint.tripsUpdated}, skipped=${checkpoint.tripsSkipped}, cursor=${checkpoint.lastTripDocId}`
      );

      if (checkpoint.tripsCompleted) break;
    }
  } else if (!opts.contactsOnly && checkpoint.tripsCompleted) {
    console.log(
      `[2/2] Trips already completed in checkpoint (scanned=${checkpoint.tripsScanned}, updated=${checkpoint.tripsUpdated}, skipped=${checkpoint.tripsSkipped}).`
    );
  }

  writeJsonFile(opts.skippedReportPath, {
    generatedAt: new Date().toISOString(),
    mode: opts.commit ? 'commit' : 'dry-run',
    totalSkipped: checkpoint.skippedEntries.length,
    entries: checkpoint.skippedEntries,
  });

  if (isBudgetReached() && (!checkpoint.contactsCompleted || !checkpoint.tripsCompleted)) {
    console.log(
      `\nPaused cleanly at --max-docs=${opts.maxDocs}. Re-run the same command to resume from ${opts.checkpointPath}.`
    );
  } else {
    console.log('\nComma passenger name normalization run finished.');
  }
}

const isDirectRun = (() => {
  try {
    return Boolean(
      process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
    );
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
