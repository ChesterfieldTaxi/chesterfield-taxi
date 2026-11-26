/**
 * Spark-Plan Data Pipeline One-Time Backfill & KPI Summary Seeding CLI (Phase 101)
 *
 * Resumable 500-doc `writeBatch` utility that:
 * 1. Populates normalized search fields (`phoneNormalized`, `emailLower`, `nameSearchTokens`,
 *    and numeric `updatedAt`) across `/contacts/{contactId}` (~9,000 docs).
 * 2. Streams `/trips/{tripId}` (~45,000 docs) in 500-doc cursor pages and seeds `/analytics/kpiSummary`.
 *
 * Persists a checkpoint after every 500-doc page so runs can be paused/resumed across
 * Firebase Spark-plan daily read/write limits without losing progress.
 *
 * Usage:
 *   npx tsx scripts/backfill-spark-indexes.ts --dry-run
 *   npx tsx scripts/backfill-spark-indexes.ts --commit --max-docs 40000
 *   npx tsx scripts/backfill-spark-indexes.ts --commit --contacts-only
 *   npx tsx scripts/backfill-spark-indexes.ts --commit --kpi-only
 */

import * as fs from 'fs';
import * as path from 'path';
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
  setDoc,
  startAfter,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  formatKpiDateKeyLocal,
  KPI_SUMMARY_COLLECTION,
  KPI_SUMMARY_DOC_ID,
  type KpiDailyBucket,
  type KpiSummaryDoc,
} from '../app/core/services/analytics/kpi-summary.service';
import {
  isCancelledOrDeclinedTrip,
  resolveTripOperationalTimestampMs,
} from '../app/core/services/analytics/operational-intelligence.service';
import {
  computeContactSearchFields,
  type ContactRecord,
} from '../app/core/services/customer/contact.service';
import { sanitizePayload } from '../app/core/services/firestore-sanitizer';
import type { Trip } from '../app/core/types/trip';

const DEFAULT_CHECKPOINT_PATH = 'reports/spark-backfill-checkpoint.json';
const MAX_BATCH_SIZE = 500;
const DAILY_RETENTION_DAYS = 90;

interface CliOptions {
  commit: boolean;
  contactsOnly: boolean;
  kpiOnly: boolean;
  resetCheckpoint: boolean;
  checkpointPath: string;
  batchSize: number;
  maxDocs?: number;
  email?: string;
  password?: string;
}

interface BackfillCheckpoint {
  contactsCompleted: boolean;
  lastContactDocId: string | null;
  contactsScanned: number;
  contactsUpdated: number;
  tripsCompleted: boolean;
  lastTripDocId: string | null;
  tripsScanned: number;
  kpiAccumulator: KpiSummaryDoc;
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
  let kpiOnly = false;
  let resetCheckpoint = false;
  let checkpointPath = DEFAULT_CHECKPOINT_PATH;
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
    } else if (arg === '--kpi-only') {
      kpiOnly = true;
    } else if (arg === '--reset-checkpoint') {
      resetCheckpoint = true;
    } else if (arg === '--checkpoint' && argv[i + 1]) {
      checkpointPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--checkpoint=')) {
      checkpointPath = arg.slice('--checkpoint='.length);
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
    kpiOnly,
    resetCheckpoint,
    checkpointPath,
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

function createEmptyCheckpoint(): BackfillCheckpoint {
  const nowIso = new Date().toISOString();
  return {
    contactsCompleted: false,
    lastContactDocId: null,
    contactsScanned: 0,
    contactsUpdated: 0,
    tripsCompleted: false,
    lastTripDocId: null,
    tripsScanned: 0,
    kpiAccumulator: {
      totalTrips: 0,
      completedTrips: 0,
      cancelledTrips: 0,
      activeOrPendingTrips: 0,
      grossBookedRevenue: 0,
      completedRevenue: 0,
      tipsTotal: 0,
      dailyBuckets: {},
      updatedAt: nowIso,
      seededAt: nowIso,
    },
    updatedAt: nowIso,
  };
}

function readCheckpoint(filePath: string, reset: boolean): BackfillCheckpoint {
  const abs = path.resolve(process.cwd(), filePath);
  if (!reset && fs.existsSync(abs)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, 'utf-8')) as BackfillCheckpoint;
      if (parsed && typeof parsed === 'object' && parsed.kpiAccumulator) {
        return parsed;
      }
    } catch {
      // Fall back to fresh checkpoint
    }
  }
  return createEmptyCheckpoint();
}

function saveCheckpoint(filePath: string, checkpoint: BackfillCheckpoint): void {
  const abs = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  checkpoint.updatedAt = new Date().toISOString();
  fs.writeFileSync(abs, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

function roundMoney(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number(val.toFixed(2));
}

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function accumulateTripIntoKpi(acc: KpiSummaryDoc, trip: Trip, retentionCutoffMs: number): void {
  if (!trip || trip.isArchived) return;

  acc.totalTrips += 1;
  const fare = roundMoney(
    Math.max(0, Number(trip.pricing?.totalFare ?? trip.payment?.amount ?? 0) || 0)
  );
  const tip = roundMoney(Math.max(0, Number(trip.payment?.tipAmount || 0) || 0));
  const isCancelled = isCancelledOrDeclinedTrip(trip);
  const isCompleted = !isCancelled && trip.status === 'completed';

  if (isCompleted) {
    acc.completedTrips += 1;
    acc.grossBookedRevenue = roundMoney(acc.grossBookedRevenue + fare);
    acc.completedRevenue = roundMoney(acc.completedRevenue + fare);
    acc.tipsTotal = roundMoney(acc.tipsTotal + tip);
  } else if (isCancelled) {
    acc.cancelledTrips += 1;
  } else {
    acc.activeOrPendingTrips += 1;
    acc.grossBookedRevenue = roundMoney(acc.grossBookedRevenue + fare);
    acc.tipsTotal = roundMoney(acc.tipsTotal + tip);
  }

  const opTs = resolveTripOperationalTimestampMs(trip);
  if (opTs !== null && opTs >= retentionCutoffMs) {
    const dateKey = formatKpiDateKeyLocal(opTs);
    const buckets = acc.dailyBuckets || (acc.dailyBuckets = {});
    const day: KpiDailyBucket = buckets[dateKey] || {
      trips: 0,
      completed: 0,
      cancelled: 0,
      grossRevenue: 0,
      completedRevenue: 0,
      tipsTotal: 0,
    };
    day.trips += 1;
    if (isCompleted) {
      day.completed += 1;
      day.grossRevenue = roundMoney(day.grossRevenue + fare);
      day.completedRevenue = roundMoney(day.completedRevenue + fare);
      day.tipsTotal = roundMoney(day.tipsTotal + tip);
    } else if (isCancelled) {
      day.cancelled += 1;
    } else {
      day.grossRevenue = roundMoney(day.grossRevenue + fare);
      day.tipsTotal = roundMoney(day.tipsTotal + tip);
    }
    buckets[dateKey] = day;
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
      `❌ Staff authentication is required by firestore.rules to read /contacts and /trips.\n` +
        `   Pass --email <admin-email> --password <password> (or set ADMIN_EMAIL & ADMIN_PASSWORD in .env.local).`
    );
    process.exit(1);
  }

  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, opts.email!, opts.password);
  console.log(`Authenticated staff session as ${opts.email}`);

  return getFirestore(app);
}

async function runBackfill(): Promise<void> {
  loadEnvFiles();
  const opts = parseArgs(process.argv.slice(2));
  const checkpoint = readCheckpoint(opts.checkpointPath, opts.resetCheckpoint);
  const db = await initFirestoreClient(opts);

  console.log('\n=== Phase 101: Spark-Plan Index & KPI Summary Backfill ===');
  console.log(`Mode:            ${opts.commit ? 'COMMIT (writing to Firestore)' : 'DRY-RUN (read-only preview)'}`);
  console.log(`Batch size:      ${opts.batchSize}`);
  console.log(`Max docs budget: ${opts.maxDocs ?? 'unlimited'}`);
  console.log(`Checkpoint file: ${opts.checkpointPath}\n`);

  let docsBudgetUsed = 0;
  const isBudgetReached = (): boolean =>
    typeof opts.maxDocs === 'number' && docsBudgetUsed >= opts.maxDocs;

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 1: Backfill Normalized Contact Search Fields (/contacts)
  // ───────────────────────────────────────────────────────────────────────────
  if (!opts.kpiOnly && !checkpoint.contactsCompleted) {
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
        console.log('  Contacts backfill reached end of collection.');
        break;
      }

      docsBudgetUsed += snap.docs.length;
      checkpoint.contactsScanned += snap.docs.length;

      const batch = writeBatch(db);
      let mutationsInBatch = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as Partial<ContactRecord>;
        const computed = computeContactSearchFields({
          ...data,
          id: data.id || docSnap.id,
        });
        const nextUpdatedAt =
          typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) && data.updatedAt > 0
            ? data.updatedAt
            : Date.now();

        const needsPatch =
          data.phoneNormalized !== computed.phoneNormalized ||
          data.emailLower !== computed.emailLower ||
          !arraysEqual(data.nameSearchTokens, computed.nameSearchTokens) ||
          typeof data.updatedAt !== 'number';

        if (needsPatch) {
          mutationsInBatch += 1;
          checkpoint.contactsUpdated += 1;
          if (opts.commit) {
            batch.set(
              doc(db, 'contacts', docSnap.id),
              sanitizePayload({
                id: data.id || docSnap.id,
                phoneNormalized: computed.phoneNormalized,
                emailLower: computed.emailLower,
                nameSearchTokens: computed.nameSearchTokens,
                updatedAt: nextUpdatedAt,
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
        `  Contacts page processed: scanned=${checkpoint.contactsScanned}, updated=${checkpoint.contactsUpdated}, cursor=${checkpoint.lastContactDocId}`
      );

      if (checkpoint.contactsCompleted) break;
    }
  } else if (!opts.kpiOnly) {
    console.log(
      `[1/2] Contacts backfill already marked completed in checkpoint (scanned=${checkpoint.contactsScanned}, updated=${checkpoint.contactsUpdated}).`
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 2: Stream /trips & Seed /analytics/kpiSummary
  // ───────────────────────────────────────────────────────────────────────────
  if (!opts.contactsOnly && !checkpoint.tripsCompleted && !isBudgetReached()) {
    console.log(
      `\n[2/2] Scanning /trips from cursor=${checkpoint.lastTripDocId || '<start>'} to seed analytics/kpiSummary...`
    );
    const tripsColl = collection(db, 'trips');
    const retentionCutoffMs = Date.now() - DAILY_RETENTION_DAYS * 86_400_000;

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
        break;
      }

      docsBudgetUsed += snap.docs.length;
      checkpoint.tripsScanned += snap.docs.length;

      for (const docSnap of snap.docs) {
        const raw = docSnap.data() as Trip;
        const trip: Trip = { ...raw, id: raw.id || docSnap.id };
        accumulateTripIntoKpi(checkpoint.kpiAccumulator, trip, retentionCutoffMs);
      }

      checkpoint.lastTripDocId = snap.docs[snap.docs.length - 1].id;
      if (snap.docs.length < remainingBudget) {
        checkpoint.tripsCompleted = true;
      }

      if (opts.commit) {
        saveCheckpoint(opts.checkpointPath, checkpoint);
      }

      console.log(
        `  Trips page processed: scanned=${checkpoint.tripsScanned}, totalNonArchived=${checkpoint.kpiAccumulator.totalTrips}, completed=${checkpoint.kpiAccumulator.completedTrips}, cursor=${checkpoint.lastTripDocId}`
      );

      if (checkpoint.tripsCompleted) break;
    }

    if (checkpoint.tripsCompleted) {
      const nowIso = new Date().toISOString();
      const finalSummary: KpiSummaryDoc = {
        ...checkpoint.kpiAccumulator,
        updatedAt: nowIso,
        seededAt: nowIso,
      };

      console.log('\nComputed KPI Summary:');
      console.log(
        JSON.stringify(
          {
            totalTrips: finalSummary.totalTrips,
            completedTrips: finalSummary.completedTrips,
            cancelledTrips: finalSummary.cancelledTrips,
            activeOrPendingTrips: finalSummary.activeOrPendingTrips,
            grossBookedRevenue: finalSummary.grossBookedRevenue,
            completedRevenue: finalSummary.completedRevenue,
            tipsTotal: finalSummary.tipsTotal,
            dailyBucketsCount: Object.keys(finalSummary.dailyBuckets || {}).length,
          },
          null,
          2
        )
      );

      if (opts.commit) {
        await setDoc(
          doc(db, KPI_SUMMARY_COLLECTION, KPI_SUMMARY_DOC_ID),
          sanitizePayload(finalSummary)
        );
        saveCheckpoint(opts.checkpointPath, checkpoint);
        console.log(`Seeded /${KPI_SUMMARY_COLLECTION}/${KPI_SUMMARY_DOC_ID} successfully.`);
      }
    }
  } else if (!opts.contactsOnly && checkpoint.tripsCompleted) {
    console.log(
      `[2/2] Trips KPI seeding already marked completed in checkpoint (scanned=${checkpoint.tripsScanned}).`
    );
  }

  if (isBudgetReached() && (!checkpoint.contactsCompleted || !checkpoint.tripsCompleted)) {
    console.log(
      `\nPaused cleanly at --max-docs=${opts.maxDocs}. Re-run the same command to resume from ${opts.checkpointPath}.`
    );
  } else {
    console.log('\nBackfill run finished.');
  }
}

runBackfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
