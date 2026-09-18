import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, limit, query } from 'firebase/firestore';

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

async function verify() {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, 'admin_setup@chesterfieldtaxi.com', 'AdminSecret2026!');
  console.log('🔑 Authenticated as admin.');

  const docRef = doc(db, 'config', 'appSettings');
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    const data = snap.data();
    const corps = data.corporateAccounts || [];
    console.log(`✅ config/appSettings exists! Total corporate accounts: ${corps.length}`);
    console.log(`   First account: [${corps[0].accountNumber}] ${corps[0].companyName} (PO: ${corps[0].currentPoNumber}, PO Req: ${corps[0].poRequired}, Discount: ${corps[0].discountPercent}%)`);
    console.log(`   Middle account: [${corps[150]?.accountNumber}] ${corps[150]?.companyName} (PO: ${corps[150]?.currentPoNumber}, PO Req: ${corps[150]?.poRequired}, Discount: ${corps[150]?.discountPercent}%)`);
    console.log(`   Last account: [${corps[corps.length - 1].accountNumber}] ${corps[corps.length - 1].companyName} (PO: ${corps[corps.length - 1].currentPoNumber})`);
  } else {
    console.error('❌ config/appSettings not found');
  }

  // Also check top-level corporateAccounts collection
  const q = query(collection(db, 'corporateAccounts'), limit(5));
  const collSnap = await getDocs(q);
  console.log(`✅ corporateAccounts collection accessible! Sample documents found: ${collSnap.size}`);
}

verify();
