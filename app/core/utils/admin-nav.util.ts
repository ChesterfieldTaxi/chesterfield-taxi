/**
 * Pure Admin Information Architecture & Legacy URL Aliasing Helper (`admin-nav.util.ts` — Phase 59)
 *
 * Centralizes the 13 primary Admin modules, their sub-page hierarchies (`SUB_PAGES`),
 * and 100% deterministic resolution of legacy query bookmarks (`resolveAdminTabAndSub`).
 * Zero React or DOM dependencies for SSR, client routing, and unit-test parity.
 */

export type AdminPrimaryTabKey =
  | 'dashboard'
  | 'trips'
  | 'automation'
  | 'passengers'
  | 'corporate'
  | 'invoicing'
  | 'rates'
  | 'vehicles'
  | 'zones'
  | 'operators'
  | 'website'
  | 'integrations'
  | 'general'
  | 'advanced';

export type AdminLegacyTabAlias =
  | 'customers'
  | 'financials'
  | 'archive'
  | 'rules'
  | 'form'
  | 'pricing'
  | 'fleet'
  | 'staff'
  | 'bookings'
  | 'layout';

export type AdminTabKey = AdminPrimaryTabKey | AdminLegacyTabAlias;

export interface AdminSubPageItem {
  key: string;
  label: string;
}

export const SUB_PAGES: Record<string, AdminSubPageItem[]> = {
  // Group 1 — Operations
  dashboard: [
    { key: 'overview', label: 'Overview' },
    { key: 'analytics', label: 'Analytics & SLA' },
    { key: 'telemetry', label: 'System Health' },
  ],
  trips: [
    { key: 'dispatch', label: 'Active Queue' },
    { key: 'standing-orders', label: 'Standing Orders' },
    { key: 'exceptions', label: 'Exceptions & Rider Edits' },
    { key: 'history', label: 'Trip History' },
  ],
  automation: [
    { key: 'auto-dispatch', label: 'Auto-Pilot & Lead Windows' },
    { key: 'intake-rules', label: 'Booking Intake Rules' },
    { key: 'console', label: 'Console & Conflict Guard' },
    { key: 'standing-defaults', label: 'Standing Order Defaults' },
  ],

  // Group 2 — Clients, Billing & Fleet
  passengers: [],
  corporate: [],
  invoicing: [
    { key: 'ledger', label: 'Invoices & AR Ledger' },
    { key: 'accounts', label: 'Corporate Billing' },
    { key: 'payouts', label: 'Driver, Staff & Other Payouts' },
    { key: 'accounting-sync', label: 'Policy & QuickBooks' },
  ],
  financials: [
    { key: 'ledger', label: 'Invoices & AR Ledger' },
    { key: 'accounts', label: 'Corporate Billing' },
    { key: 'payouts', label: 'Driver, Staff & Other Payouts' },
    { key: 'accounting-sync', label: 'Policy & QuickBooks' },
  ],
  rates: [
    { key: 'rates', label: 'Tariffs' },
    { key: 'extras', label: 'Extras & Wait' },
    { key: 'surcharges', label: 'Surcharges' },
    { key: 'rules', label: 'Pricing Rules' },
    { key: 'audit', label: 'Pricing Audit Log' },
  ],
  vehicles: [
    { key: 'types', label: 'Vehicle Types' },
    { key: 'fleet', label: 'Cars' },
  ],
  zones: [
    { key: 'zones', label: 'Zones' },
    { key: 'places', label: 'Places' },
    { key: 'groups', label: 'Groups' },
    { key: 'blacklists', label: 'Exclusions' },
  ],
  operators: [
    { key: 'roster', label: 'Roster' },
    { key: 'permissions', label: 'Role & Lead-Window Access' },
    { key: 'driver-policies', label: 'Driver App Policies' },
    { key: 'onboarding', label: 'Applications' },
  ],

  // Group 3 — Website, Comms & System
  website: [
    { key: 'themes', label: 'Themes & Branding' },
    { key: 'form', label: 'Booking & /track' },
    { key: 'seo', label: 'Service Areas & SEO' },
    { key: 'pages', label: 'Pages' },
    { key: 'layout', label: 'Page Sections' },
    { key: 'navigation', label: 'Header & Footer' },
    { key: 'css', label: 'Custom CSS' },
  ],
  integrations: [
    { key: 'gateways', label: 'Payments' },
    { key: 'telephony', label: 'Phone, SMS & Templates' },
    { key: 'email', label: 'Dispatch Email' },
    { key: 'flights', label: 'Flight Tracking' },
    { key: 'webhooks', label: 'Push & Webhooks' },
  ],
  general: [
    { key: 'profile', label: 'Company Info & Hours' },
    { key: 'units', label: 'Time, Units & Regional' },
  ],
  advanced: [
    { key: 'security', label: 'Access & Roles' },
    { key: 'audit', label: 'Activity Log' },
    { key: 'archive', label: 'Universal Archive' },
    { key: 'system', label: 'Maintenance' },
  ],
};

export const CANONICAL_ADMIN_TABS: readonly AdminPrimaryTabKey[] = [
  'dashboard',
  'trips',
  'automation',
  'passengers',
  'corporate',
  'invoicing',
  'rates',
  'vehicles',
  'zones',
  'operators',
  'website',
  'integrations',
  'general',
  'advanced',
] as const;

const CANONICAL_TAB_SET = new Set<string>(CANONICAL_ADMIN_TABS);

export interface ResolvedAdminRouteState {
  tab: AdminPrimaryTabKey;
  sub: string;
  archiveEntity?: string;
}

function resolveValidSubOrFallback(
  tab: AdminPrimaryTabKey,
  candidateSub?: string,
  explicitFallback?: string
): string {
  const list = SUB_PAGES[tab] || [];
  if (candidateSub && list.some((item) => item.key === candidateSub)) {
    return candidateSub;
  }
  if (explicitFallback) return explicitFallback;
  return list[0]?.key || '';
}

function resolveRatesSub(candidateSub?: string): string {
  if (!candidateSub) return 'rates';
  if (candidateSub === 'tariffs' || candidateSub === 'base' || candidateSub === 'step_increments') {
    return 'rates';
  }
  if (candidateSub === 'condition_surcharges') {
    return 'extras';
  }
  if (candidateSub === 'named_rules') {
    return 'rules';
  }
  return resolveValidSubOrFallback('rates', candidateSub, 'rates');
}

/**
 * Deterministically resolves any incoming `?tab=...&sub=...` Admin Console query pair
 * (including legacy deep-links & retired tabs) into a canonical `{ tab, sub, archiveEntity? }`.
 */
export function resolveAdminTabAndSub(
  rawTab?: string | null,
  rawSub?: string | null,
  rawEntity?: string | null
): ResolvedAdminRouteState {
  const tabInput = String(rawTab || '')
    .trim()
    .toLowerCase();
  const subInput =
    String(rawSub || '')
      .trim()
      .toLowerCase() || undefined;
  const entityInput =
    String(rawEntity || '')
      .trim()
      .toLowerCase() || undefined;

  // 1. Legacy Archive primary tab -> System & Governance -> Universal Archive
  if (tabInput === 'archive') {
    return {
      tab: 'advanced',
      sub: 'archive',
      archiveEntity: subInput || entityInput || 'all',
    };
  }

  // 2. Legacy Trips sub-routes moved to Automation or System Archive
  if ((tabInput === 'trips' || tabInput === 'bookings') && subInput === 'rules') {
    return {
      tab: 'automation',
      sub: 'intake-rules',
    };
  }
  if ((tabInput === 'trips' || tabInput === 'bookings') && subInput === 'archive') {
    return {
      tab: 'advanced',
      sub: 'archive',
      archiveEntity: 'trips',
    };
  }

  // 3. Legacy General sub-routes
  if (tabInput === 'general' && subInput === 'studio') {
    return {
      tab: 'website',
      sub: 'themes',
    };
  }
  if (tabInput === 'general' && subInput === 'localization') {
    return {
      tab: 'general',
      sub: 'units',
    };
  }

  // 4. Legacy Advanced website/form sub-routes -> Website, Brand & SEO
  if (
    tabInput === 'advanced' &&
    (subInput === 'website' || subInput === 'form' || subInput === 'customer-form')
  ) {
    return {
      tab: 'website',
      sub: subInput === 'website' ? 'themes' : 'form',
    };
  }

  // 5. Legacy Primary Tab Aliases
  if (tabInput === 'customers') {
    if (subInput === 'corporate') {
      return {
        tab: 'corporate',
        sub: '',
      };
    }
    return {
      tab: 'passengers',
      sub: '',
    };
  }
  if (tabInput === 'rules') {
    return {
      tab: 'automation',
      sub: resolveValidSubOrFallback('automation', subInput, 'auto-dispatch'),
    };
  }
  if (tabInput === 'financials') {
    return {
      tab: 'invoicing',
      sub: resolveValidSubOrFallback('invoicing', subInput, 'ledger'),
    };
  }
  if (tabInput === 'pricing') {
    return {
      tab: 'rates',
      sub: resolveRatesSub(subInput),
    };
  }
  if (tabInput === 'fleet') {
    return {
      tab: 'vehicles',
      sub: 'fleet',
    };
  }
  if (tabInput === 'staff') {
    return {
      tab: 'operators',
      sub: resolveValidSubOrFallback('operators', subInput, 'roster'),
    };
  }
  if (tabInput === 'bookings') {
    return {
      tab: 'trips',
      sub: resolveValidSubOrFallback('trips', subInput, 'dispatch'),
    };
  }
  if (tabInput === 'form') {
    return {
      tab: 'website',
      sub: 'form',
    };
  }
  if (tabInput === 'layout') {
    return {
      tab: 'website',
      sub: 'layout',
    };
  }

  // 6. Canonical Primary Tabs
  if (tabInput === 'rates') {
    return {
      tab: 'rates',
      sub: resolveRatesSub(subInput),
    };
  }

  if (CANONICAL_TAB_SET.has(tabInput)) {
    const canonicalTab = tabInput as AdminPrimaryTabKey;
    const resolvedSub = resolveValidSubOrFallback(canonicalTab, subInput);
    if (canonicalTab === 'advanced' && resolvedSub === 'archive') {
      return {
        tab: 'advanced',
        sub: 'archive',
        archiveEntity: entityInput || 'all',
      };
    }
    return {
      tab: canonicalTab,
      sub: resolvedSub,
    };
  }

  // 7. Default fallback -> Dashboard Overview
  return {
    tab: 'dashboard',
    sub: 'overview',
  };
}
