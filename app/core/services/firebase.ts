/**
 * Centralized Firebase Client Initialization
 * 
 * Provides safe, singleton instances of Firebase App, Firestore, and Firebase Auth.
 * Detects whether valid Firebase environment variables are provided and handles
 * both SSR and client-side execution environments gracefully.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

export interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

function getEnvValue(key: string): string | undefined {
  // Check import.meta.env (Vite client)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  // Check process.env (Node / SSR)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
}

export function getResolvedFirebaseConfig(): FirebaseConfig {
  return {
    apiKey: getEnvValue('VITE_FIREBASE_API_KEY') || getEnvValue('FIREBASE_API_KEY'),
    authDomain: getEnvValue('VITE_FIREBASE_AUTH_DOMAIN') || getEnvValue('FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvValue('VITE_FIREBASE_PROJECT_ID') || getEnvValue('FIREBASE_PROJECT_ID') || 'chesterfield-taxi',
    storageBucket: getEnvValue('VITE_FIREBASE_STORAGE_BUCKET') || getEnvValue('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID') || getEnvValue('FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvValue('VITE_FIREBASE_APP_ID') || getEnvValue('FIREBASE_APP_ID'),
  };
}

export function isFirebaseConfigured(): boolean {
  const config = getResolvedFirebaseConfig();
  return Boolean(config.apiKey && config.projectId);
}

let appInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getFirebaseApp(customConfig?: FirebaseConfig): FirebaseApp {
  if (appInstance) {
    return appInstance;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
    return appInstance;
  }

  const resolved = {
    ...getResolvedFirebaseConfig(),
    ...customConfig,
  };

  // Provide safe fallback config for local development and build pipelines
  const safeConfig = {
    apiKey: resolved.apiKey || 'AIzaSyDemoPlaceholderChesterfieldTaxiKey',
    authDomain: resolved.authDomain || 'chesterfield-taxi.firebaseapp.com',
    projectId: resolved.projectId || 'chesterfield-taxi',
    storageBucket: resolved.storageBucket || 'chesterfield-taxi.appspot.com',
    messagingSenderId: resolved.messagingSenderId || '123456789012',
    appId: resolved.appId || '1:123456789012:web:demo1234567890',
  };

  appInstance = initializeApp(safeConfig);
  return appInstance;
}

export function getFirestoreDb(customConfig?: FirebaseConfig): Firestore {
  if (!firestoreInstance) {
    const app = getFirebaseApp(customConfig);
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

export function getFirebaseAuth(customConfig?: FirebaseConfig): Auth {
  if (!authInstance) {
    const app = getFirebaseApp(customConfig);
    authInstance = getAuth(app);
  }
  return authInstance;
}
