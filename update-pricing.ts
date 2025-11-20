// Update existing pricing rules document with full data
import dotenv from 'dotenv';
dotenv.config();

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, setDoc } from 'firebase/firestore';
import { mockPricingRules } from './src/mocks/pricingRulesMock.js';

console.log('📤 Updating pricing rules in Firestore...\n');

// Initialize Firebase
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

try {
    console.log('🔄 Updating existing document with full pricing data...');

    // Use setDoc with merge option to update existing document
    const docRef = doc(db, 'pricing_rules', 'current');
    await setDoc(docRef, mockPricingRules, { merge: true });

    console.log('✅ Pricing rules updated successfully!');
    console.log('\n📋 Summary:');
    console.log(`  - Document ID: current`);
    console.log(`  - Version: ${mockPricingRules.version}`);
    console.log(`  - Trip Types: ${Object.keys(mockPricingRules.tripTypes).length}`);
    console.log(`  - Vehicle Types: ${Object.keys(mockPricingRules.vehicleModifiers).length}`);
    console.log(`  - Conditional Modifiers: ${mockPricingRules.conditionalModifiers.length}`);
    console.log('\n🎉 Firestore is ready to use!\n');

} catch (error) {
    console.error('❌ Error updating pricing rules:', error.message);
    console.error('\n💡 Manual alternative:');
    console.error('   1. Go to Firebase Console → Firestore');
    console.error('   2. Click on pricing_rules → current document');
    console.error('   3. Click "⋮" menu → "Edit document"');
    console.error('   4. Copy-paste the JSON from pricing-rules.json\n');
    process.exit(1);
}

process.exit(0);
