// Seed pricing rules to Firestore
import dotenv from 'dotenv';
dotenv.config();

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { mockPricingRules } from './src/mocks/pricingRulesMock.js';

console.log('🌱 Seeding Pricing Rules to Firestore...\n');

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
    console.log('📤 Uploading pricing rules...');

    await setDoc(doc(db, 'pricing_rules', 'current'), mockPricingRules);

    console.log('✅ Pricing rules seeded successfully!');
    console.log('\n📋 Summary:');
    console.log(`  - Document ID: current`);
    console.log(`  - Version: ${mockPricingRules.version}`);
    console.log(`  - Trip Types: ${Object.keys(mockPricingRules.tripTypes).length}`);
    console.log(`  - Vehicle Types: ${Object.keys(mockPricingRules.vehicleModifiers).length}`);
    console.log(`  - Conditional Modifiers: ${mockPricingRules.conditionalModifiers.length}`);
    console.log('\n🎉 Firestore is ready to use!\n');

} catch (error) {
    console.error('❌ Error seeding pricing rules:', error);
    console.error('\n💡 This might be due to Firestore security rules.');
    console.error('   You can manually add the data via Firebase Console instead.\n');
    process.exit(1);
}

process.exit(0);
