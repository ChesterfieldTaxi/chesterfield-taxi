import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration
// Using environment variables for security
// Firebase configuration
// Using environment variables for security
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Debug: Check if config is loaded
console.log('Firebase Config Loaded:', {
    apiKey: firebaseConfig.apiKey ? 'Present' : 'Missing',
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
});

let app: FirebaseApp;
let db: Firestore;
let storage: FirebaseStorage;

try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    // Initialize Firestore
    db = getFirestore(app);
    // Initialize Storage
    storage = getStorage(app);
    console.log('Firebase Initialized Successfully');
} catch (error) {
    console.error('Firebase Initialization Error:', error);
    // Initialize with dummy values to prevent crash on import, but will fail on use
    // This is a tradeoff to allow the app to load even if firebase fails
    app = {} as FirebaseApp;
    db = {} as Firestore;
    storage = {} as FirebaseStorage;
}

export { db, storage };
export default app;
