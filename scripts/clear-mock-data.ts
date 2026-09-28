import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';

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

async function clearMockData() {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, 'admin_setup@chesterfieldtaxi.com', 'AdminSecret2026!');
  console.log('🔑 Authenticated with Firestore.');

  // 1. Process Trips
  const tripsSnap = await getDocs(collection(db, 'trips'));
  console.log(`\nAnalyzing ${tripsSnap.size} trips in Firestore...`);

  const toDeleteTripIds: string[] = [];
  const keptTrips: string[] = [];

  tripsSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const isMock =
      (d.passenger?.lastName === 'User' && (d.passenger?.firstName || '').startsWith('Test')) ||
      d.pickupLocation?.address === '123 Test St' ||
      docSnap.id.startsWith('MOCK-') ||
      docSnap.id.startsWith('stress_') ||
      d.passenger?.email === 'test@example.com';

    if (isMock) {
      toDeleteTripIds.push(docSnap.id);
    } else {
      keptTrips.push(`${docSnap.id} (${d.passenger?.firstName} ${d.passenger?.lastName} - ${d.pickupLocation?.address})`);
    }
  });

  console.log(`\n🛡️ KEEPING ${keptTrips.length} User-Created Trips:`);
  keptTrips.forEach((t) => console.log(`  ✓ ${t}`));

  console.log(`\n🗑️ DELETING ${toDeleteTripIds.length} Mock/Test Trips...`);
  for (const id of toDeleteTripIds) {
    await deleteDoc(doc(db, 'trips', id));
  }
  console.log(`✅ Successfully deleted ${toDeleteTripIds.length} mock trips from Firestore.`);

  // 2. Process Drivers in `drivers` collection
  console.log('\nAnalyzing `drivers` collection...');
  const driversSnap = await getDocs(collection(db, 'drivers'));
  for (const dDoc of driversSnap.docs) {
    if (dDoc.id === 'drv-101' || dDoc.id.startsWith('drv-') || dDoc.id.startsWith('demo-')) {
      console.log(`🗑️ Deleting mock driver doc: ${dDoc.id} (${dDoc.data()?.name})`);
      await deleteDoc(doc(db, 'drivers', dDoc.id));
    }
  }

  // 3. Ensure the 3 real drivers have active driver profile docs in `drivers` collection
  const realDrivers = [
    {
      id: 'Cc5jehhcxuWxUx7Z3WyXNBXZjCy1',
      name: 'Zakharya Rakhmanov',
      firstName: 'Zakharya',
      lastName: 'Rakhmanov',
      email: 'zakharya@chesterfieldtaxi.com',
      phone: '(314) 915-1800',
      vehicleUnit: 'Cab #947',
      cabNumber: '947',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      zone: 'Chesterfield Valley',
      driverScore: 98,
      status: 'active',
    },
    {
      id: 'ClUoGzOahXcnsIuNZ3kmP1wJ4aC3',
      name: 'Michael Vinnik',
      firstName: 'Michael',
      lastName: 'Vinnik',
      email: 'michael@chesterfieldtaxi.com',
      phone: '(314) 683-0585',
      vehicleUnit: 'Cab #982',
      cabNumber: '982',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      zone: 'Chesterfield Valley',
      driverScore: 98,
      status: 'active',
    },
    {
      id: 'xo56ECpoXcT83x6GRyzjzHqA0mc2',
      name: 'Wagnehu Mekonnen',
      firstName: 'Wagnehu',
      lastName: 'Mekonnen',
      email: 'wagnehu@chesterfieldtaxi.com',
      phone: '(314) 224-0008',
      vehicleUnit: 'Cab #47',
      cabNumber: '47',
      vehicleTier: 'standard',
      dutyStatus: 'on_duty',
      zone: 'Chesterfield Valley',
      driverScore: 98,
      status: 'active',
    },
  ];

  console.log('\nCreating/updating real driver profiles in `drivers` collection...');
  for (const driver of realDrivers) {
    await setDoc(doc(db, 'drivers', driver.id), driver, { merge: true });
    console.log(`✅ Synced real driver: ${driver.name} (Unit ${driver.vehicleUnit}, Phone ${driver.phone})`);
  }

  console.log('\n🎉 Live database cleanup and driver synchronization complete!');
}

clearMockData().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
