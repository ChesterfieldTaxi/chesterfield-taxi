import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// 1. Read environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    value = value.trim().replace(/^['"](.*)['"]$/, '$1');
    env[match[1]] = value;
  }
});

const app = initializeApp({
  apiKey: env['VITE_FIREBASE_API_KEY'],
  authDomain: env['VITE_FIREBASE_AUTH_DOMAIN'],
  projectId: env['VITE_FIREBASE_PROJECT_ID'],
});
const db = getFirestore(app);
const auth = getAuth(app);

// Two main Unified Tariffs
export const STANDARD_FLAT_RATE = {
  id: 'tariff-standard-flat',
  name: 'Standard Flat Rate',
  currency: 'USD',
  units: 'imperial',
  fareIncrement: 0.1,
  priority: 90,
  isActive: true,
  isDefault: true,
  triggers: {
    vehicleTiers: ['standard', 'sedan', 'premium'],
  },
  taximeter: {
    startPrice: 0.0,
    initialDistanceIncluded: 0,
    initialTimeIncluded: 0,
    primaryDistanceStep: 0.1, // 176 yards
    primaryDistanceRate: 0.255, // $0.255/0.1 mi ($2.55/mi)
    primaryDistanceLimit: 20.0, // First 20 miles
    thenDistanceStep: 0.1,
    thenDistanceRate: 0.23, // $0.23/0.1 mi ($2.30/mi after 20 mi)
    freeTrafficMinutes: 9999,
    waitingRatePerStep: 0.0, // No traffic overcharge
    waitingStepSeconds: 90,
    minimumPrice: 28.0, // $28 minimum
  },
  corridors: [],
  extras: {
    carSeatFeePerUnit: 10.0, // $10 per car seat
    passengerBaseAllowance: 1, // First passenger free
    extraPassengerFeePerHead: 1.0, // $1 for each additional passenger
    customSurcharges: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const MINIVAN_FLAT_RATE = {
  id: 'tariff-minivan-flat',
  name: 'MiniVan Flat Rate',
  currency: 'USD',
  units: 'imperial',
  fareIncrement: 0.1,
  priority: 85,
  isActive: true,
  isDefault: false,
  triggers: {
    vehicleTiers: ['xl', 'van', 'suv', 'wheelchair'],
  },
  taximeter: {
    startPrice: 10.0, // $10 extra for suv and minivan vehicle classes
    initialDistanceIncluded: 0,
    initialTimeIncluded: 0,
    primaryDistanceStep: 0.1,
    primaryDistanceRate: 0.255, // $0.255/0.1 mi
    primaryDistanceLimit: 20.0,
    thenDistanceStep: 0.1,
    thenDistanceRate: 0.23, // $0.23/0.1 mi
    freeTrafficMinutes: 9999,
    waitingRatePerStep: 0.0, // No traffic overcharge
    waitingStepSeconds: 90,
    minimumPrice: 28.0, // $28 minimum
  },
  corridors: [],
  extras: {
    carSeatFeePerUnit: 10.0, // $10 per car seat
    passengerBaseAllowance: 1, // First passenger free
    extraPassengerFeePerHead: 1.0, // $1 for each additional passenger
    customSurcharges: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function runMigration() {
  console.log('--- STARTING DATABASE CLEANUP & TARIFF MIGRATION ---');

  // Authenticate as Admin
  console.log('1. Authenticating as admin_setup@chesterfieldtaxi.com...');
  await signInWithEmailAndPassword(auth, 'admin_setup@chesterfieldtaxi.com', 'AdminSecret2026!');
  console.log('   Authenticated successfully.');

  // Purge pricingRules
  console.log('2. Purging existing pricing rules from Firestore...');
  const rulesSnap = await getDocs(collection(db, 'pricingRules'));
  console.log(`   Found ${rulesSnap.size} rules in "pricingRules". Deleting...`);
  for (const docSnap of rulesSnap.docs) {
    await deleteDoc(doc(db, 'pricingRules', docSnap.id));
    console.log(`   Deleted pricing rule: ${docSnap.id}`);
  }

  // Purge pricing_rules if any exist
  try {
    const legacyRulesSnap = await getDocs(collection(db, 'pricing_rules'));
    console.log(`   Found ${legacyRulesSnap.size} rules in legacy "pricing_rules". Deleting...`);
    for (const docSnap of legacyRulesSnap.docs) {
      await deleteDoc(doc(db, 'pricing_rules', docSnap.id));
      console.log(`   Deleted legacy pricing rule: ${docSnap.id}`);
    }
  } catch (e) {
    console.log('   Legacy pricing_rules collection empty or inaccessible.');
  }

  // Purge existing tariffs
  console.log('3. Purging existing tariffs from Firestore...');
  const tariffsSnap = await getDocs(collection(db, 'tariffs'));
  console.log(`   Found ${tariffsSnap.size} existing tariffs in "tariffs". Deleting...`);
  for (const docSnap of tariffsSnap.docs) {
    await deleteDoc(doc(db, 'tariffs', docSnap.id));
    console.log(`   Deleted tariff: ${docSnap.id}`);
  }

  // Provision Standard Flat Rate
  console.log('4. Provisioning "Standard Flat Rate" into Firestore...');
  await setDoc(doc(db, 'tariffs', STANDARD_FLAT_RATE.id), STANDARD_FLAT_RATE);
  console.log('   Provisioned Standard Flat Rate successfully.');

  // Provision MiniVan Flat Rate
  console.log('5. Provisioning "MiniVan Flat Rate" into Firestore...');
  await setDoc(doc(db, 'tariffs', MINIVAN_FLAT_RATE.id), MINIVAN_FLAT_RATE);
  console.log('   Provisioned MiniVan Flat Rate successfully.');

  // Verify
  console.log('6. Verifying database state:');
  const verifyTariffs = await getDocs(collection(db, 'tariffs'));
  console.log(`   Tariffs in DB (${verifyTariffs.size}):`);
  verifyTariffs.forEach((d) => {
    const data = d.data();
    console.log(`     - [${d.id}] ${data.name}: $${data.taximeter.startPrice} start, $${data.taximeter.minimumPrice} min, $${data.taximeter.primaryDistanceRate}/step`);
  });

  const verifyRules = await getDocs(collection(db, 'pricingRules'));
  console.log(`   Pricing rules in DB: ${verifyRules.size}`);

  console.log('--- DATABASE MIGRATION COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
