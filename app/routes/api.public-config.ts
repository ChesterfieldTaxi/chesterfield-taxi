import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestoreDb, getFirebaseAuth, isFirebaseConfigured } from '../core/services/firebase';
import { DEFAULT_APP_SETTINGS, sanitizePublicSettings } from '../core/services/config/admin-config.service';

/**
 * Public Configuration Resource Route (/api/public-config)
 *
 * Returns strictly sanitized public-facing configuration (company profile,
 * vehicles, branding, pricing, tariffs, website/CMS, booking rules).
 * NEVER includes corporateAccounts (PO codes), invoices, or configAuditTrail.
 */
export async function loader() {
  if (!isFirebaseConfigured()) {
    return Response.json(
      {
        success: true,
        settings: sanitizePublicSettings(DEFAULT_APP_SETTINGS),
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }

  const db = getFirestoreDb();

  // 1. Prefer the dedicated zero-PII `config/publicSettings` document
  try {
    const publicSnap = await getDoc(doc(db, 'config', 'publicSettings'));
    if (publicSnap.exists()) {
      return Response.json(
        {
          success: true,
          settings: sanitizePublicSettings(publicSnap.data()),
        },
        {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }
  } catch (err) {
    console.warn('[/api/public-config] Could not read config/publicSettings:', err);
  }

  // 2. Fallback to `config/appSettings` (always stripped via sanitizePublicSettings)
  const docRef = doc(db, 'config', 'appSettings');
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return Response.json(
        {
          success: true,
          settings: sanitizePublicSettings(snap.data()),
        },
        {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
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
          return Response.json(
            {
              success: true,
              settings: sanitizePublicSettings(authSnap.data()),
            },
            {
              headers: { 'Cache-Control': 'no-store, max-age=0' },
            }
          );
        }
      } catch (authErr) {
        console.warn('[/api/public-config] Server-side fallback read failed:', authErr);
      }
    }
  }

  return Response.json(
    {
      success: true,
      settings: sanitizePublicSettings(DEFAULT_APP_SETTINGS),
    },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
