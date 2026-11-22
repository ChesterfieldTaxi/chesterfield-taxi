import { loadPublicSettingsForServer } from '../core/services/config/public-settings.server';

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
