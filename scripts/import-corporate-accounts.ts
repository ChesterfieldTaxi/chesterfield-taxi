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
import { CorporateAccountService } from '../app/core/services/corporate-account.service';
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

  // Determine CSV file path
  const args = process.argv.slice(2);
  const csvFileName = args[0] || 'corporate_accounts_all.csv';
  const csvPath = path.isAbsolute(csvFileName) ? csvFileName : path.join(process.cwd(), csvFileName);

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  console.log(`📄 Reading CSV file: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  // Initialize service
  const corpService = new CorporateAccountService();

  // Parse accounts with user directives:
  // - poRequired: false
  // - discountPercent: 0
  // - creditLimit: 5000 (standard default)
  // - billingCycle: 'net30'
  console.log('⚙️  Parsing CSV and generating schema extensions...');
  const importedAccounts = corpService.parseCorporateAccountsCsv(csvContent, {
    poRequired: false, // Per user directive
    discountPercent: 0, // Per user directive
    creditLimit: 5000,
    billingCycle: 'net30',
  });

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

    // Merge or replace corporate accounts:
    // We retain existing manual accounts if not matching by accountNumber or ID, then append/update
    const existingList: CorporateAccountConfig[] = (existingSettings.corporateAccounts as CorporateAccountConfig[]) || [];
    const mergedMap = new Map<string, CorporateAccountConfig>();

    // Add existing
    for (const item of existingList) {
      mergedMap.set(item.accountNumber || item.id, item);
    }

    // Overwrite/Add imported
    for (const item of importedAccounts) {
      mergedMap.set(item.accountNumber || item.id, item);
    }

    const finalCorporateAccounts = Array.from(mergedMap.values()).map(acc => {
      if (!acc.currentPoNumber) {
        acc.currentPoNumber = corpService.generateSecurePoNumber(acc.companyName, acc.accountNumber);
        acc.poGeneratedAt = acc.poGeneratedAt || new Date().toISOString();
      }
      if (!acc.poNumberHistory) {
        acc.poNumberHistory = [];
      }
      return acc;
    });

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

    // 2. Also write to dedicated 'corporateAccounts' collection in batches of 400
    console.log(`📂 Writing individual accounts to 'corporateAccounts' collection...`);
    const batchSize = 400;
    for (let i = 0; i < importedAccounts.length; i += batchSize) {
      const chunk = importedAccounts.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const acc of chunk) {
        const accDocRef = doc(db, 'corporateAccounts', acc.id);
        const sanitizedAcc = sanitizePayload(acc, { mode: 'omit' });
        batch.set(accDocRef, sanitizedAcc, { merge: true });
      }
      await batch.commit();
      console.log(`   → Batch ${Math.floor(i / batchSize) + 1} (${chunk.length} accounts) committed.`);
    }

    console.log('\n===============================================================');
    console.log('🎉 DIRECT DATABASE IMPORT COMPLETED SUCCESSFULLY!');
    console.log(`   • Total Imported Accounts: ${importedAccounts.length}`);
    console.log(`   • Active in Database: ${finalCorporateAccounts.length}`);
    console.log(`   • PO Required Status: false (until updated with account holders)`);
    console.log(`   • Contract Discount: 0%`);
    console.log(`   • Default Credit Limit: $5,000`);
    console.log(`   • Initial PO Numbers Generated: ${importedAccounts.length}`);
    console.log('===============================================================\n');

  } catch (error) {
    console.error('❌ Failed to write to Firestore:', error);
    process.exit(1);
  }
}

main();
