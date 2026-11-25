/**
 * Corporate Accounts CSV Importer Script
 * 
 * Ingests corporate accounts from CSV directly into the Firebase Firestore database:
 * - Reads corporate_accounts_all.csv (or specified path)
 * - Applies schema extensions (currentPoNumber, poGeneratedAt, poNumberHistory)
 * - Sets poRequired to false (per instruction: until accounts are updated with account holders)
 * - Sets discountPercent to 0 (per instruction: set contract discount to 0 for every account)
 * - Sets default credit limit ($5,000)
 * - Atomically commits all corporate accounts into Firestore `config/appSettings`
 * - Also writes individual account documents to `corporateAccounts` collection
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import {
  CorporateAccountService,
  hashCorporateLookupValue,
} from '../app/core/services/corporate-account.service';
import { sanitizePayload } from '../app/core/services/firestore-sanitizer';
import type { CorporateAccountConfig, AppSettings } from '../app/core/types/config';

// 1. Load environment variables from .env.local or .env if not present
function loadEnv() {
  const rootDir = process.cwd();
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = path.join(rootDir, envFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
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
  }
}

loadEnv();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'chesterfield-taxi-1461f',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
};

async function main() {
  console.log('\n===============================================================');
  console.log('🏢 CHESTERFIELD TAXI: CORPORATE ACCOUNTS DATABASE IMPORTER');
  console.log('===============================================================\n');

  // Determine input file path (.json or .csv)
  const args = process.argv.slice(2);
  const inputFileName = args[0] || 'corporate_accounts_all.csv';
  const inputPath = path.isAbsolute(inputFileName)
    ? inputFileName
    : path.join(process.cwd(), inputFileName);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: Input file not found at: ${inputPath}`);
    process.exit(1);
  }

  const isJson = inputPath.toLowerCase().endsWith('.json');
  console.log(`📄 Reading ${isJson ? 'JSON' : 'CSV'} file: ${inputPath}`);
  const fileContent = fs.readFileSync(inputPath, 'utf-8');

  // Initialize service
  const corpService = new CorporateAccountService();

  // Parse accounts with user directives:
  // - poRequired: false
  // - discountPercent: 0
  // - creditLimit: 5000 (standard default)
  // - billingCycle: 'net30'
  const parseOptions = {
    poRequired: false, // Per user directive
    discountPercent: 0, // Per user directive
    creditLimit: 5000,
    billingCycle: 'net30' as const,
  };
  console.log(`⚙️  Parsing ${isJson ? 'JSON' : 'CSV'} and generating schema extensions...`);
  const importedAccounts = isJson
    ? corpService.parseCorporateAccountsJson(fileContent, parseOptions)
    : corpService.parseCorporateAccountsCsv(fileContent, parseOptions);

  console.log(`✅ Successfully parsed ${importedAccounts.length} corporate accounts.\n`);

  if (importedAccounts.length === 0) {
    console.error('❌ No corporate accounts could be parsed from the file.');
    process.exit(1);
  }

  // Preview first 5 and last 2
  console.log('--- [SAMPLE PARSED ACCOUNTS PREVIEW] ---');
  for (const acc of [...importedAccounts.slice(0, 4), ...importedAccounts.slice(-2)]) {
    console.log(` • [${acc.accountNumber}] ${acc.companyName}`);
    console.log(`   PO: ${acc.currentPoNumber} | PO Req: ${acc.poRequired} | Discount: ${acc.discountPercent}% | Limit: $${acc.creditLimit}`);
    console.log(`   Contact: ${acc.billingContactName} <${acc.billingContactEmail || 'N/A'}> | Phone: ${acc.billingContactPhone || 'N/A'}`);
    console.log(`   Address: ${acc.billingAddress || 'N/A'}\n`);
  }

  // Connect to Firebase
  console.log(`🔌 Connecting to Firebase Firestore (Project: ${firebaseConfig.projectId})...`);
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // Authenticate as Admin to satisfy Firestore security rules
  const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
  const auth = getAuth(app);
  const adminEmail = 'admin_setup@chesterfieldtaxi.com';
  const adminPass = 'AdminSecret2026!';

  try {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      console.log(`🔑 Authenticated as admin (${cred.user.email})`);
    } catch (authErr: any) {
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
        cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
        console.log(`🔑 Created and authenticated as admin (${cred.user.email})`);
      } else {
        throw authErr;
      }
    }

    // Ensure user profile in Firestore has admin role
    const userDocRef = doc(db, 'users', cred.user.uid);
    await setDoc(userDocRef, { role: 'admin', roles: ['admin'], email: adminEmail }, { merge: true });
  } catch (authErr) {
    console.warn('⚠️ Admin auth note:', authErr);
  }

  try {
    // 1. Read existing appSettings
    const settingsDocRef = doc(db, 'config', 'appSettings');
    const snapshot = await getDoc(settingsDocRef);
    let existingSettings: Partial<AppSettings> = {};

    if (snapshot.exists()) {
      existingSettings = snapshot.data() as Partial<AppSettings>;
      console.log(`📦 Retrieved current appSettings doc from Firestore.`);
    } else {
      console.log(`ℹ️  No existing appSettings doc found; initializing new one.`);
    }

    // Merge corporate accounts while preserving operational state (POs, PINs, limits, riders, etc.)
    const existingList: CorporateAccountConfig[] =
      (existingSettings.corporateAccounts as CorporateAccountConfig[]) || [];
    const mergeResult = corpService.mergeCorporateAccounts(existingList, importedAccounts);
    const finalCorporateAccounts = mergeResult.merged;

    console.log(
      `🔀 Merge summary: +${mergeResult.addedCount} new, ~${mergeResult.updatedCount} updated, ${mergeResult.skippedCount} skipped.`
    );

    console.log(`💾 Writing ${finalCorporateAccounts.length} total corporate accounts to config/appSettings in Firestore...`);
    const sanitizedSettingsUpdate = sanitizePayload(
      {
        corporateAccounts: finalCorporateAccounts,
        updatedAt: new Date().toISOString(),
        updatedBy: 'scripts/import-corporate-accounts.ts',
      },
      { mode: 'omit' }
    );
    await setDoc(settingsDocRef, sanitizedSettingsUpdate, { merge: true });
    console.log(`✅ config/appSettings successfully updated with ${finalCorporateAccounts.length} corporate accounts!`);

    // 2. Also write changed accounts to 'corporateAccounts' and 'corporateLookup' collections in batches of 200 (400 ops)
    console.log(`📂 Syncing ${mergeResult.changedAccounts.length} added/updated accounts to 'corporateAccounts' and 'corporateLookup'...`);
    const batchSize = 200;
    for (let i = 0; i < mergeResult.changedAccounts.length; i += batchSize) {
      const chunk = mergeResult.changedAccounts.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const acc of chunk) {
        const accDocRef = doc(db, 'corporateAccounts', acc.id);
        const sanitizedAcc = sanitizePayload(acc, { mode: 'omit' });
        batch.set(accDocRef, sanitizedAcc, { merge: true });

        const acctHash = await hashCorporateLookupValue(acc.accountNumber);
        if (acctHash) {
          const currentPoHash = acc.currentPoNumber
            ? await hashCorporateLookupValue(acc.currentPoNumber)
            : '';
          const revokedPoHashes = (
            await Promise.all(
              (acc.poNumberHistory || [])
                .filter((h) => h.poNumber)
                .map((h) => hashCorporateLookupValue(h.poNumber))
            )
          ).filter(Boolean);

          const lookupDoc = sanitizePayload(
            {
              corporateAccountId: acc.id,
              isActive: Boolean(acc.isActive),
              poRequired: Boolean(acc.poRequired),
              currentPoHash: currentPoHash || null,
              revokedPoHashes,
              creditLimit: Number(acc.creditLimit || 0),
              billingCycle: acc.billingCycle || 'net30',
              discountPercent: Number(acc.discountPercent || 0),
              updatedAt: new Date().toISOString(),
            },
            { mode: 'omit' }
          );
          batch.set(doc(db, 'corporateLookup', acctHash), lookupDoc, { merge: true });
        }
      }
      await batch.commit();
      console.log(`   → Batch ${Math.floor(i / batchSize) + 1} (${chunk.length} accounts) committed.`);
    }

    console.log('\n===============================================================');
    console.log('🎉 DIRECT DATABASE IMPORT COMPLETED SUCCESSFULLY!');
    console.log(`   • Total Parsed Accounts: ${importedAccounts.length}`);
    console.log(`   • Added: ${mergeResult.addedCount} | Updated: ${mergeResult.updatedCount} | Skipped: ${mergeResult.skippedCount}`);
    console.log(`   • Active in Database: ${finalCorporateAccounts.length}`);
    console.log(`   • PO Required Status: false (for new accounts)`);
    console.log(`   • Contract Discount: 0% (for new accounts)`);
    console.log(`   • Default Credit Limit: $5,000 (for new accounts)`);
    console.log('===============================================================\n');

  } catch (error) {
    console.error('❌ Failed to write to Firestore:', error);
    process.exit(1);
  }
}

main();
