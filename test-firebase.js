// Firebase Connection Test Script
import { db } from './src/firebase/config.js';
import { collection, getDocs } from 'firebase/firestore';

console.log('🔍 Testing Firebase Connection...\n');

// Test 1: Check environment variables
console.log('✅ Step 1: Environment Variables');
console.log('  Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID || '❌ MISSING');
console.log('  Auth Domain:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '❌ MISSING');
console.log('  API Key:', import.meta.env.VITE_FIREBASE_API_KEY ? '✅ Loaded' : '❌ MISSING');

// Test 2: Test Firestore connection
console.log('\n✅ Step 2: Firestore Connection');
try {
    const testCollection = collection(db, 'test_connection');
    await getDocs(testCollection);
    console.log('  ✅ Successfully connected to Firestore!');
} catch (error) {
    console.error('  ❌ Error connecting to Firestore:', error.message);
    process.exit(1);
}

// Test 3: Check pricing_rules collection
console.log('\n✅ Step 3: Pricing Rules Collection');
try {
    const pricingRulesRef = collection(db, 'pricing_rules');
    const snapshot = await getDocs(pricingRulesRef);

    if (snapshot.empty) {
        console.log('  ⚠️  Collection exists but is empty (expected before seeding)');
    } else {
        console.log(`  ✅ Found ${snapshot.size} document(s) in pricing_rules`);
        snapshot.forEach(doc => {
            console.log(`    - Document ID: ${doc.id}`);
        });
    }
} catch (error) {
    console.error('  ❌ Error accessing pricing_rules:', error.message);
}

console.log('\n🎉 Firebase verification complete!\n');
process.exit(0);
