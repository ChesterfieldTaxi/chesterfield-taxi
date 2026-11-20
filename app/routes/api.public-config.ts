import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestoreDb, getFirebaseAuth, isFirebaseConfigured } from '../core/services/firebase';
import { DEFAULT_APP_SETTINGS, sanitizePublicSettings } from '../core/services/config/admin-config.service';
import type { AppSettings } from '../core/types/config';

/**
 * Shared server-side loader helper that fetches the sanitized public-facing
 * configuration (`config/publicSettings`) from Firestore with safe fallback.
 */
export async function loadPublicSettingsForServer(): Promise<Partial<AppSettings>> {
  if (!isFirebaseConfigured()) {
    return sanitizePublicSettings(DEFAULT_APP_SETTINGS);
  }

  const db = getFirestoreDb();

  // 1. Prefer the dedicated zero-PII `config/publicSettings` document
  try {
    const publicSnap = await getDoc(doc(db, 'config', 'publicSettings'));
    if (publicSnap.exists()) {
      return sanitizePublicSettings(publicSnap.data());
    }
  } catch (err) {
    console.warn('[/api/public-config] Could not read config/publicSettings:', err);
  }

  // 2. Fallback to `config/appSettings` (always stripped via sanitizePublicSettings)
  const docRef = doc(db, 'config', 'appSettings');
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return sanitizePublicSettings(snap.data());
    }
  } catch (err: any) {
    if (
      (err?.code === 'permission-denied' || err?.message?.includes('permission')) &&
      process.env.ADMIN_SETUP_EMAIL &&
      process.env.ADMIN_SETUP_PASSWORD
    ) {
      try {
        const auth = getFirebaseAuth();
        await signInWithEmailAndPassword(
          auth,
          process.env.ADMIN_SETUP_EMAIL,
          process.env.ADMIN_SETUP_PASSWORD
        );
        const authSnap = await getDoc(docRef);
        if (authSnap.exists()) {
          return sanitizePublicSettings(authSnap.data());
        }
      } catch (authErr) {
        console.warn('[/api/public-config] Server-side fallback read failed:', authErr);
      }
    }
  }

  return sanitizePublicSettings(DEFAULT_APP_SETTINGS);
}

/**
 * Public Configuration Resource Route (/api/public-config)
 *
 * Returns strictly sanitized public-facing configuration (company profile,
 * vehicles, branding, pricing, tariffs, website/CMS, booking rules).
 * NEVER includes corporateAccounts (PO codes), invoices, or configAuditTrail.
 */
export async function loader() {
  const settings = await loadPublicSettingsForServer();
  return Response.json(
    {
      success: true,
      settings,
    },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
