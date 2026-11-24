/**
 * Phase 59 Automated Verification Suite (`scripts/test-admin-ia-phase59.ts`)
 *
 * Verifies:
 * 1. Locked-in 3-Group Admin IA (`ADMIN_NAV_GROUPS`), all 13 canonical tabs, all `SUB_PAGES`,
 *    every legacy URL alias in `resolveAdminTabAndSub`, and `admin.settings.tsx` 302 loader redirect.
 * 2. `CompanyConfig` & `LocalizationConfig` normalization/defaults (`12h`/`24h`, `mi`/`km`,
 *    `mph`/`kmh`, `F`/`C`, `is24x7`, `advanceBookingMaxDays`) & `formatLocalizationPreviewSample`.
 * 3. Unified `THEME_PRESETS` (all 6 presets) and `hydrateBrandingFromSettings`.
 * 4. Admin Trips active queue statuses, `canAdminCompleteTrip`, Stage/Hold service exports,
 *    and `classifyAdminTripExceptions` (SLA alerts, exhausted cascades, Phase 55 unacknowledged
 *    `pendingDriverUpdateAck`, Phase 56 `pendingGuestChangeRequest.status === 'pending'`, no-shows).
 * 5. Architecture & hygiene guardrails: `AdminLayoutTab.tsx` deleted & zero imports, monolith line
 *    ceilings, untouched `firestore.rules` & `vercel.json`, zero `"HUD Now"`, and zero bracketed
 *    status strings (`[Avail]`, `[En Route]`, `[Busy]`, `[Break]`, `[Off]`) across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_ADMIN_TABS,
  SUB_PAGES,
  resolveAdminTabAndSub,
} from '../app/core/utils/admin-nav.util';
import { ADMIN_NAV_GROUPS } from '../app/components/domain/admin/navigation/AdminSidebar';
import { loader as adminSettingsLoader } from '../app/routes/admin.settings';
import {
  formatLocalizationPreviewSample,
  normalizeCompanyConfig,
  normalizeLocalizationConfig,
} from '../app/core/types/config';
import {
  THEME_PRESETS,
  hydrateBrandingFromSettings,
} from '../app/components/domain/admin/website/theme-presets';
import {
  canAdminCompleteTrip,
  classifyAdminTripExceptions,
  isAdminActiveQueueTrip,
} from '../app/core/utils/admin-trips-exceptions.util';
import {
  clearStagedDriverFromTrip,
  sendStagedTripToDriver,
  stageDriverForTrip,
} from '../app/core/services/dispatch/staged-driver-planner.service';
import type { Trip } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();

function collectAppSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAppSourceFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function makeBaseTrip(overrides: Partial<Trip> = {}): Trip {
  const nowIso = '2026-11-23T18:00:00.000Z';
  return {
    id: 'trip-phase59-001',
    status: 'confirmed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: { address: '100 Chesterfield Pkwy, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-24T12:00:00.000Z',
    passenger: {
      firstName: 'Jordan',
      lastName: 'Taylor',
      email: 'jordan@example.com',
      phone: '(314) 555-0199',
      passengerCount: 2,
      luggageCount: 2,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 5,
      distanceMiles: 18.4,
      durationMinutes: 24,
      distanceRate: 41.4,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 46.4,
      totalFare: 50.4,
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'pending',
      amount: 50.4,
    },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

function testAdminNavigationAndLegacyRedirects(): void {
  console.log('1️⃣  Testing 3-Group Admin IA, 13 Primary Tabs, SUB_PAGES & Legacy URL Redirects...');

  assert.equal(ADMIN_NAV_GROUPS.length, 3, 'Expected exactly 3 Admin sidebar groups');
  assert.deepEqual(
    ADMIN_NAV_GROUPS.map((g) => g.title),
    ['Operations', 'Clients, Billing & Fleet', 'Website, Comms & System']
  );

  const sidebarKeys = ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));
  assert.equal(sidebarKeys.length, 13, 'Expected exactly 13 primary sidebar items');
  assert.deepEqual(sidebarKeys, [...CANONICAL_ADMIN_TABS]);

  // Verify sub-pages keys match specification
  assert.deepEqual(SUB_PAGES.dashboard.map((s) => s.key), ['overview', 'analytics', 'telemetry']);
  assert.deepEqual(SUB_PAGES.trips.map((s) => s.key), [
    'dispatch',
    'standing-orders',
    'exceptions',
    'history',
  ]);
  assert.deepEqual(SUB_PAGES.automation.map((s) => s.key), [
    'auto-dispatch',
    'intake-rules',
    'console',
    'standing-defaults',
  ]);
  assert.deepEqual(SUB_PAGES.customers.map((s) => s.key), ['directory', 'corporate']);
  assert.deepEqual(SUB_PAGES.invoicing.map((s) => s.key), [
    'ledger',
    'accounts',
    'payouts',
    'accounting-sync',
  ]);
  assert.deepEqual(SUB_PAGES.rates.map((s) => s.key), [
    'rates',
    'extras',
    'surcharges',
    'rules',
    'audit',
  ]);
  assert.deepEqual(SUB_PAGES.vehicles.map((s) => s.key), ['types', 'fleet']);
  assert.deepEqual(SUB_PAGES.zones.map((s) => s.key), ['zones', 'places', 'groups', 'blacklists']);
  assert.deepEqual(SUB_PAGES.operators.map((s) => s.key), [
    'roster',
    'permissions',
    'driver-policies',
    'onboarding',
  ]);
  assert.deepEqual(SUB_PAGES.website.map((s) => s.key), [
    'themes',
    'form',
    'seo',
    'pages',
    'layout',
    'navigation',
    'css',
  ]);
  assert.deepEqual(SUB_PAGES.integrations.map((s) => s.key), ['gateways', 'telephony', 'webhooks']);
  assert.deepEqual(SUB_PAGES.general.map((s) => s.key), ['profile', 'units']);
  assert.deepEqual(SUB_PAGES.advanced.map((s) => s.key), [
    'security',
    'audit',
    'archive',
    'system',
  ]);

  // Verify every canonical tab + every valid sub-page resolves cleanly
  for (const tab of CANONICAL_ADMIN_TABS) {
    const defaultResolved = resolveAdminTabAndSub(tab, null);
    assert.equal(defaultResolved.tab, tab);
    assert.equal(defaultResolved.sub, SUB_PAGES[tab][0].key);

    for (const subItem of SUB_PAGES[tab]) {
      const subResolved = resolveAdminTabAndSub(tab, subItem.key);
      assert.equal(subResolved.tab, tab);
      assert.equal(subResolved.sub, subItem.key);
    }
  }

  // Verify 100% of legacy URL aliases
  assert.deepEqual(resolveAdminTabAndSub('archive', null), {
    tab: 'advanced',
    sub: 'archive',
    archiveEntity: 'all',
  });
  assert.deepEqual(resolveAdminTabAndSub('archive', 'vehicles'), {
    tab: 'advanced',
    sub: 'archive',
    archiveEntity: 'vehicles',
  });
  assert.deepEqual(resolveAdminTabAndSub('trips', 'rules'), {
    tab: 'automation',
    sub: 'intake-rules',
  });
  assert.deepEqual(resolveAdminTabAndSub('trips', 'archive'), {
    tab: 'advanced',
    sub: 'archive',
    archiveEntity: 'trips',
  });
  assert.deepEqual(resolveAdminTabAndSub('general', 'studio'), {
    tab: 'website',
    sub: 'themes',
  });
  assert.deepEqual(resolveAdminTabAndSub('general', 'localization'), {
    tab: 'general',
    sub: 'units',
  });
  assert.deepEqual(resolveAdminTabAndSub('rules', null), {
    tab: 'automation',
    sub: 'auto-dispatch',
  });
  assert.deepEqual(resolveAdminTabAndSub('rules', 'intake-rules'), {
    tab: 'automation',
    sub: 'intake-rules',
  });
  assert.deepEqual(resolveAdminTabAndSub('financials', null), {
    tab: 'invoicing',
    sub: 'ledger',
  });
  assert.deepEqual(resolveAdminTabAndSub('financials', 'payouts'), {
    tab: 'invoicing',
    sub: 'payouts',
  });
  assert.deepEqual(resolveAdminTabAndSub('pricing', null), {
    tab: 'rates',
    sub: 'rates',
  });
  assert.deepEqual(resolveAdminTabAndSub('pricing', 'audit'), {
    tab: 'rates',
    sub: 'audit',
  });
  assert.deepEqual(resolveAdminTabAndSub('fleet', null), {
    tab: 'vehicles',
    sub: 'fleet',
  });
  assert.deepEqual(resolveAdminTabAndSub('staff', null), {
    tab: 'operators',
    sub: 'roster',
  });
  assert.deepEqual(resolveAdminTabAndSub('staff', 'onboarding'), {
    tab: 'operators',
    sub: 'onboarding',
  });
  assert.deepEqual(resolveAdminTabAndSub('bookings', null), {
    tab: 'trips',
    sub: 'dispatch',
  });
  assert.deepEqual(resolveAdminTabAndSub('form', null), {
    tab: 'website',
    sub: 'form',
  });
  assert.deepEqual(resolveAdminTabAndSub('layout', null), {
    tab: 'website',
    sub: 'layout',
  });
  assert.deepEqual(resolveAdminTabAndSub('advanced', 'website'), {
    tab: 'website',
    sub: 'themes',
  });
  assert.deepEqual(resolveAdminTabAndSub('advanced', 'form'), {
    tab: 'website',
    sub: 'form',
  });
  assert.deepEqual(resolveAdminTabAndSub('advanced', 'customer-form'), {
    tab: 'website',
    sub: 'form',
  });

  // Verify /app/admin/settings SSR 302 redirect
  const redirectResp = adminSettingsLoader();
  assert.equal(redirectResp.status, 302, 'admin.settings.tsx loader must return 302');
  assert.equal(redirectResp.headers.get('Location'), '/app/admin?tab=website&sub=form');
}

function testGeneralConfigAndThemeStudio(): void {
  console.log('2️⃣  Testing CompanyConfig, LocalizationConfig & Unified Theme Studio Presets...');

  const defaultCompany = normalizeCompanyConfig(undefined);
  assert.equal(defaultCompany.name, 'Chesterfield Taxi');
  assert.equal(defaultCompany.is24x7, true);
  assert.equal(defaultCompany.advanceBookingMaxDays, 90);
  assert.equal(defaultCompany.dispatchEmail, 'dispatch@chesterfieldtaxi.com');
  assert.equal(defaultCompany.operatingHoursLabel, 'Monday – Sunday: Open 24 Hours');

  const customCompany = normalizeCompanyConfig({
    name: 'West County Executive Car',
    legalEntityName: 'West County Executive Car LLC',
    is24x7: false,
    advanceBookingMaxDays: 180,
    operatingHoursLabel: 'Mon–Sun: 04:00 – 01:00',
  });
  assert.equal(customCompany.legalEntityName, 'West County Executive Car LLC');
  assert.equal(customCompany.is24x7, false);
  assert.equal(customCompany.advanceBookingMaxDays, 180);

  const defaultLoc = normalizeLocalizationConfig(undefined);
  assert.equal(defaultLoc.timeFormat, '12h');
  assert.equal(defaultLoc.distanceUnit, 'mi');
  assert.equal(defaultLoc.speedUnit, 'mph');
  assert.equal(defaultLoc.temperatureUnit, 'F');
  assert.equal(defaultLoc.currency, 'USD');
  assert.equal(defaultLoc.currencySymbol, '$');
  assert.equal(defaultLoc.defaultServiceRegion, 'Chesterfield & St. Louis Metro, MO');

  const metricLoc = normalizeLocalizationConfig({
    currency: 'EUR',
    timeFormat: '24h',
    dateFormat: 'YYYY-MM-DD',
    distanceUnit: 'km',
    speedUnit: 'kmh',
    temperatureUnit: 'C',
  });
  assert.equal(metricLoc.currencySymbol, '€');
  assert.equal(metricLoc.timeFormat, '24h');
  assert.equal(metricLoc.distanceUnit, 'km');
  assert.equal(metricLoc.speedUnit, 'kmh');
  assert.equal(metricLoc.temperatureUnit, 'C');

  const sample12 = formatLocalizationPreviewSample(defaultLoc);
  assert.equal(sample12.timeSample, '2:30 PM');
  assert.equal(sample12.distanceSample, '18.4 mi');
  assert.equal(sample12.speedSample, '55 mph');
  assert.equal(sample12.temperatureSample, '72°F');

  const sample24 = formatLocalizationPreviewSample(metricLoc);
  assert.equal(sample24.timeSample, '14:30');
  assert.equal(sample24.dateSample, '2026-11-23');
  assert.equal(sample24.distanceSample, '29.6 km');
  assert.equal(sample24.speedSample, '89 km/h');
  assert.equal(sample24.temperatureSample, '22°C');
  assert.equal(sample24.fareSample, '€45.00 EUR');

  // Verify Unified Theme Studio presets
  assert.equal(THEME_PRESETS.length, 6, 'Expected 6 reconciled curated theme presets');
  const expectedColors = ['#2563eb', '#f59e0b', '#d97706', '#1d4ed8', '#059669', '#000000'];
  assert.deepEqual(
    THEME_PRESETS.map((p) => p.tokens.primaryColor),
    expectedColors
  );
  const hydrated = hydrateBrandingFromSettings({} as any);
  assert.equal(hydrated.primaryColor, '#2563eb');
}

function testAdminTripsExceptionsAndParity(): void {
  console.log('3️⃣  Testing Admin Trips Active Queue, Completable Statuses & Exception Classifier...');

  assert.equal(typeof stageDriverForTrip, 'function');
  assert.equal(typeof sendStagedTripToDriver, 'function');
  assert.equal(typeof clearStagedDriverFromTrip, 'function');

  // Active queue & completable parity
  for (const st of [
    'pending',
    'confirmed',
    'offered',
    'assigned',
    'accepted',
    'en_route',
    'arrived',
    'in_progress',
    'unassigned_alert',
  ]) {
    const t = makeBaseTrip({ status: st as any });
    assert.equal(isAdminActiveQueueTrip(t, false), true, `${st} should be in Active Queue`);
  }
  assert.equal(isAdminActiveQueueTrip(makeBaseTrip({ status: 'completed' }), false), false);
  assert.equal(isAdminActiveQueueTrip(makeBaseTrip({ status: 'assigned' }), true), false);

  for (const st of ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress']) {
    assert.equal(canAdminCompleteTrip({ status: st as any }), true, `${st} must allow Complete Trip`);
  }
  assert.equal(canAdminCompleteTrip({ status: 'confirmed' }), false);
  assert.equal(canAdminCompleteTrip({ status: 'completed' }), false);

  const nowMs = Date.parse('2026-11-24T11:35:00.000Z'); // 25m before 12:00Z pickup -> critical SLA

  // 1. SLA critical unassigned alert
  const slaTrip = makeBaseTrip({ assignedDriverId: null });
  const slaEx = classifyAdminTripExceptions(slaTrip, { nowMs });
  assert.equal(slaEx.isException, true);
  assert.equal(slaEx.hasSlaOrCascadeAlert, true);
  assert.ok(slaEx.categories.includes('sla_unassigned'));

  // 2. Exhausted offer cascade
  const exhaustedTrip = makeBaseTrip({
    scheduledPickupTime: '2026-11-26T12:00:00.000Z',
    offerCascade: {
      state: 'exhausted',
      activeOfferedDriverId: null,
      offerStartedAt: '2026-11-24T10:00:00.000Z',
      offerExpiresAt: '2026-11-24T10:03:00.000Z',
      timeoutSeconds: 45,
      cascadeAttempt: 3,
      maxAttempts: 3,
      attemptedDriverIds: ['d1', 'd2', 'd3'],
      strategy: 'nearest_in_zone',
    },
  });
  const exhaustedEx = classifyAdminTripExceptions(exhaustedTrip, { nowMs });
  assert.equal(exhaustedEx.isCascadeExhausted, true);
  assert.ok(exhaustedEx.categories.includes('sla_unassigned'));

  // 3. Phase 56 Pending Rider /track Change Request
  const riderEditTrip = makeBaseTrip({
    assignedDriverId: 'driver-101',
    status: 'assigned',
    metadata: {
      pendingGuestChangeRequest: {
        requestId: 'gcr-100',
        status: 'pending',
        requestedAt: '2026-11-24T10:05:00.000Z',
        requestedPickupTime: '2026-11-24T13:30:00.000Z',
        customerReason: 'Flight delayed 90 minutes',
      },
    },
  });
  const riderEx = classifyAdminTripExceptions(riderEditTrip, { nowMs });
  assert.equal(riderEx.hasPendingRiderChangeRequest, true);
  assert.ok(riderEx.categories.includes('rider_change_request'));
  assert.ok(riderEx.riderChangeSummary?.includes('Flight delayed 90 minutes'));

  // 4. Phase 55 Unacknowledged Driver Update
  const driverAckTrip = makeBaseTrip({
    assignedDriverId: 'driver-104',
    status: 'assigned',
    metadata: {
      pendingDriverUpdateAck: {
        updateId: 'ack-200',
        updatedAt: '2026-11-24T10:10:00.000Z',
        updatedBy: 'dispatch@chesterfieldtaxi.com',
        source: 'dispatch_edit',
        changesSummary: ['Pickup time updated to 1:30 PM'],
        acknowledgedAt: null,
      },
    },
  });
  const ackEx = classifyAdminTripExceptions(driverAckTrip, { nowMs });
  assert.equal(ackEx.hasUnacknowledgedDriverAck, true);
  assert.ok(ackEx.categories.includes('driver_ack_pending'));

  // Acknowledged update should NOT flag driver_ack_pending
  const ackedTrip = makeBaseTrip({
    assignedDriverId: 'driver-104',
    status: 'assigned',
    metadata: {
      pendingDriverUpdateAck: {
        updateId: 'ack-201',
        updatedAt: '2026-11-24T10:10:00.000Z',
        acknowledgedAt: '2026-11-24T10:11:00.000Z',
        changesSummary: ['Pickup time updated'],
      },
    },
  });
  assert.equal(classifyAdminTripExceptions(ackedTrip, { nowMs }).hasUnacknowledgedDriverAck, false);

  // 5. Cancelled / Declined / No-Show
  const cancelledEx = classifyAdminTripExceptions(
    makeBaseTrip({ status: 'cancelled' }),
    { nowMs }
  );
  assert.equal(cancelledEx.isCancelledDeclinedOrNoShow, true);
  assert.ok(cancelledEx.categories.includes('cancelled_declined_noshow'));
}

function testArchitectureAndHygieneGuardrails(): void {
  console.log('4️⃣  Testing Line Ceilings, Deleted Orphan Files, Immutable Configs & UI Hygiene...');

  // 1. AdminLayoutTab.tsx must be deleted
  const orphanedLayoutTab = path.join(
    ROOT_DIR,
    'app/components/domain/admin/AdminLayoutTab.tsx'
  );
  assert.equal(
    fs.existsSync(orphanedLayoutTab),
    false,
    'Orphaned AdminLayoutTab.tsx must be deleted'
  );

  // 2. routes.ts keeps app/admin/settings route intact
  const routesContent = fs.readFileSync(path.join(ROOT_DIR, 'app/routes.ts'), 'utf8');
  assert.ok(
    routesContent.includes('route("app/admin/settings", "routes/admin.settings.tsx")'),
    'app/routes.ts must preserve route("app/admin/settings", "routes/admin.settings.tsx")'
  );

  // 3. Strict Monolith & Sub-Panel Line Ceilings
  const ceilings: Array<[string, number]> = [
    ['app/routes/admin.tsx', 1000],
    ['app/components/domain/admin/AdminGeneralTab.tsx', 450],
    ['app/components/domain/admin/general/CompanyProfilePanel.tsx', 450],
    ['app/components/domain/admin/general/LocalizationAndUnitsPanel.tsx', 450],
    ['app/components/domain/admin/website/WebsiteThemesTab.tsx', 450],
    ['app/components/domain/admin/website/BrandLivePreviewCanvas.tsx', 450],
    ['app/components/domain/admin/subpages/AdminTripsSubpage.tsx', 450],
    ['app/components/domain/admin/trips/useAdminTripsController.ts', 450],
    ['app/components/domain/admin/trips/AdminTripsTablePanel.tsx', 450],
    ['app/components/domain/admin/trips/AdminTripsExceptionsPanel.tsx', 450],
    ['app/components/domain/admin/trips/AdminTripDetailsSlideOver.tsx', 450],
    ['app/components/domain/admin/AdminAdvancedTab.tsx', 850],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
  ];

  for (const [relPath, maxLines] of ceilings) {
    const absPath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absPath), true, `Expected file to exist: ${relPath}`);
    const lineCount = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < maxLines,
      `${relPath} exceeded line ceiling: ${lineCount} >= ${maxLines}`
    );
  }

  // 4. Immutable files untouched
  const gitStatusImmutable = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitStatusImmutable,
    '',
    `firestore.rules and vercel.json must remain untouched, got: ${gitStatusImmutable}`
  );

  // 5. Terminology & zero AdminLayoutTab import scan across app/
  const appFiles = collectAppSourceFiles(path.join(ROOT_DIR, 'app'));
  const forbiddenTokens = [
    'AdminLayoutTab',
    'HUD Now',
    '[Avail]',
    '[En Route]',
    '[Busy]',
    '[Break]',
    '[Off]',
  ];

  for (const file of appFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const token of forbiddenTokens) {
      assert.equal(
        src.includes(token),
        false,
        `Forbidden string "${token}" found in ${path.relative(ROOT_DIR, file)}`
      );
    }
  }
}

function main(): void {
  console.log('🚀 Running Platform Phase 59 Admin IA & Workspace Parity Suite...\n');
  testAdminNavigationAndLegacyRedirects();
  testGeneralConfigAndThemeStudio();
  testAdminTripsExceptionsAndParity();
  testArchitectureAndHygieneGuardrails();
  console.log('\n✅ ALL PHASE 59 ADMIN IA, GENERAL, THEME STUDIO, ARCHIVE & TRIPS PARITY TESTS PASSED!');
}

main();
