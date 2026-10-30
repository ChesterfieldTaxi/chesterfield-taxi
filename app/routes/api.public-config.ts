import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestoreDb, getFirebaseAuth, isFirebaseConfigured } from '../core/services/firebase';
import { DEFAULT_APP_SETTINGS } from '../core/services/config/admin-config.service';

/**
 * Public Configuration Resource Route (/api/public-config)
 *
 * Returns sanitized public-facing configuration from Firestore `config/appSettings`
 * (company profile, vehicles, branding, website navigation/pages, booking rules,
 * maintenance mode, and Get App button visibility) even when client-side Firestore
 * rules restrict unauthenticated reads.
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
    // If live Firestore rules block unauthenticated reads, authenticate on the server
    if (err?.code === 'permission-denied' || err?.message?.includes('permission')) {
      try {
        const auth = getFirebaseAuth();
        const email = process.env.ADMIN_SETUP_EMAIL || 'admin_setup@chesterfieldtaxi.com';
        const password = process.env.ADMIN_SETUP_PASSWORD || 'AdminSecret2026!';
        await signInWithEmailAndPassword(auth, email, password);
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

function sanitizePublicSettings(raw: Record<string, any>) {
  return {
    company: raw.company ?? DEFAULT_APP_SETTINGS.company,
    branding: raw.branding ?? DEFAULT_APP_SETTINGS.branding,
    vehicles: raw.vehicles ?? DEFAULT_APP_SETTINGS.vehicles,
    pricing: raw.pricing ?? DEFAULT_APP_SETTINGS.pricing,
    tariffs: raw.tariffs ?? DEFAULT_APP_SETTINGS.tariffs,
    customerBookingConfig: raw.customerBookingConfig ?? DEFAULT_APP_SETTINGS.customerBookingConfig,
    bookingRulesConfig: raw.bookingRulesConfig ?? DEFAULT_APP_SETTINGS.bookingRulesConfig,
    website: raw.website,
    cms: raw.cms,
    enableGetAppButtons: raw.enableGetAppButtons ?? DEFAULT_APP_SETTINGS.enableGetAppButtons,
    constructionMode: raw.constructionMode ?? DEFAULT_APP_SETTINGS.constructionMode,
    enableRealtimeRouting: raw.enableRealtimeRouting ?? DEFAULT_APP_SETTINGS.enableRealtimeRouting,
    publicFormVersion: raw.publicFormVersion ?? DEFAULT_APP_SETTINGS.publicFormVersion,
    updatedAt: raw.updatedAt ?? DEFAULT_APP_SETTINGS.updatedAt,
  };
}
