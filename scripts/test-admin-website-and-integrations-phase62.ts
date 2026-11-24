/**
 * Phase 62 Automated Verification Suite (`scripts/test-admin-website-and-integrations-phase62.ts`)
 *
 * Verifies:
 * 1. Public Corporate Checkout Gate (`allowPublicCorporateCheckout`, `resolveRetailAcceptedPaymentMethods`,
 *    `resolveAllowedCustomerPaymentMethod` preserving `corporatePortalContext`, and `validatePublicCorporateCheckoutGate`).
 * 2. Guest `/track` Self-Service Policy Controls (`normalizeGuestSelfServicePolicy`, `evaluateGuestManageEligibility`,
 *    and `evaluateGuestCancellationPolicy` across `enableGuestSelfService`, `allowGuestNotesAndFlightEdits`,
 *    `allowGuestPreDispatchRouteTimeEdits`, `guestDirectEditMinLeadMinutes`, `allowGuestAssignedChangeRequests`,
 *    and `allowGuestCancellation`).
 * 3. Local SEO Corridor Manager (`normalizeLocalSeoConfig`, `getResolvedLocalSeoCorridors`, `getResolvedCorridorBySlug`,
 *    and `buildSitemapXml` across `enabled: false`, `featured: true`, and custom headline/meta/FAQ overrides).
 * 4. Flight Tracking, Canned SMS & Dispatch Email Policies (`normalizeFlightTrackingPolicy` + `evaluateFlightCheckEligibility`
 *    with `12h` vs `48h` windows, `getResolvedCannedSmsTemplates` + `interpolateCommsSmsTemplate` overrides/custom additions,
 *    and `normalizeDispatchEmailPolicy` + `isInboundEmailSenderBlocked` + `appendOutboundEmailSignature`).
 * 5. `SUB_PAGES.integrations` 5-subtab resolution & `AdminConfigService` secret-stripping / `sanitizePublicSettings` safety.
 * 6. Static architecture & hygiene guardrails:
 *    - `AdminIntegrationsSubpage.tsx < 300`L; every file in `app/components/domain/admin/integrations/` `< 450`L.
 *    - `WebsiteFormControlsTab.tsx < 450`L, `GuestSelfServicePolicyCard.tsx < 350`L, `WebsiteLocalSeoPanel.tsx < 450`L, `AdminWebsiteTab.tsx < 360`L.
 *    - `admin.tsx < 1,000`L, `dispatch.tsx < 1,600`L, `driver.tsx < 1,900`L, `BookingEngineV2.tsx < 1,350`L.
 *    - `firestore.rules` and `vercel.json` untouched (`git status --porcelain firestore.rules vercel.json`).
 *    - Zero `"HUD Now"` and zero `'[Avail]'` / `'[En Route]'` / `'[Busy]'` / `'[Break]'` / `'[Off]'` strings across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  isInboundEmailSenderBlocked,
  normalizeCannedSmsTemplates,
  normalizeDispatchEmailPolicy,
  normalizeFlightTrackingPolicy,
  normalizeGuestSelfServicePolicy,
  normalizeLocalSeoConfig,
  resolveAllowedCustomerPaymentMethod,
  resolveRetailAcceptedPaymentMethods,
  validatePublicCorporateCheckoutGate,
  type AppSettings,
} from '../app/core/types/config';
import {
  DEFAULT_CUSTOMER_BOOKING_CONFIG,
  getAdminConfigService,
  sanitizePublicSettings,
} from '../app/core/services/config/admin-config.service';
import {
  evaluateGuestCancellationPolicy,
  evaluateGuestManageEligibility,
} from '../app/core/services/tracking/guest-manage-ride';
import {
  LOCAL_SEO_CORRIDORS,
  buildSitemapXml,
  getResolvedCorridorBySlug,
  getResolvedLocalSeoCorridors,
} from '../app/core/services/seo/local-corridor-seo.service';
import { evaluateFlightCheckEligibility } from '../app/core/config/airports';
import {
  buildInterpolatedCommsSmsChips,
  getResolvedCannedSmsTemplates,
  interpolateCommsSmsTemplate,
} from '../app/core/services/comms/comms-templates.service';
import { appendOutboundEmailSignature } from '../app/core/services/email/dispatch-email.service';
import { SUB_PAGES, resolveAdminTabAndSub } from '../app/core/utils/admin-nav.util';
import type { Trip, TripPricing } from '../app/core/types/trip';

const ROOT_DIR = process.cwd();

function collectAppTsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectAppTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const SAMPLE_PRICING: TripPricing = {
  baseFare: 12,
  distanceMiles: 18,
  durationMinutes: 24,
  distanceRate: 40,
  timeRate: 0,
  vehicleMultiplier: 1,
  surgeMultiplier: 1,
  discountAmount: 0,
  subtotal: 52,
  totalFare: 52,
  currency: 'USD',
};

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const nowIso = '2026-11-24T12:00:00.000Z';
  return {
    id: 'trip-p62-001',
    status: 'CONFIRMED',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-24T16:00:00.000Z',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    pickupLocation: { address: '400 Chesterfield Center, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    passenger: {
      firstName: 'Jordan',
      lastName: 'Hayes',
      email: 'jordan@example.com',
      phone: '(314) 555-0192',
      passengerCount: 1,
      luggageCount: 1,
    },
    vehicleTier: 'standard',
    pricing: SAMPLE_PRICING,
    payment: { method: 'card', status: 'pending', amount: 52 },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

function testPublicCorporateCheckoutGate(): void {
  console.log('1️⃣  Testing Public Corporate Checkout Gate & /app/corporate Preservation...');

  // Default public booking config excludes 'account' and disables public corporate checkout
  assert.equal(DEFAULT_CUSTOMER_BOOKING_CONFIG.allowPublicCorporateCheckout, false);
  assert.deepEqual(DEFAULT_CUSTOMER_BOOKING_CONFIG.acceptedPaymentMethods, ['card', 'cash']);

  // Even if legacy array contained 'account', allowPublicCorporateCheckout: false strips it on retail
  assert.deepEqual(
    resolveRetailAcceptedPaymentMethods({
      acceptedPaymentMethods: ['card', 'cash', 'account'],
      allowPublicCorporateCheckout: false,
    }),
    ['card', 'cash']
  );

  // When allowPublicCorporateCheckout: true, 'account' is exposed on retail
  assert.deepEqual(
    resolveRetailAcceptedPaymentMethods({
      acceptedPaymentMethods: ['card', 'cash'],
      allowPublicCorporateCheckout: true,
    }),
    ['card', 'cash', 'account']
  );

  // CRITICAL GUARD: /app/corporate (hasCorporatePortalContext: true) NEVER clamps 'account' to 'card'
  assert.equal(
    resolveAllowedCustomerPaymentMethod({
      currentMethod: 'account',
      bookingConfig: { acceptedPaymentMethods: ['card', 'cash'], allowPublicCorporateCheckout: false },
      hasCorporatePortalContext: true,
    }),
    'account'
  );

  // On public /book (hasCorporatePortalContext: false), 'account' clamps cleanly to 'card' when gated
  assert.equal(
    resolveAllowedCustomerPaymentMethod({
      currentMethod: 'account',
      bookingConfig: { acceptedPaymentMethods: ['card', 'cash'], allowPublicCorporateCheckout: false },
      hasCorporatePortalContext: false,
    }),
    'card'
  );

  // Submission gate rejects tampered 'account' submission on /book when gate is OFF
  const blockedRetail = validatePublicCorporateCheckoutGate({
    paymentMethod: 'account',
    bookingConfig: { allowPublicCorporateCheckout: false, acceptedPaymentMethods: ['card', 'cash'] },
    hasCorporatePortalContext: false,
  });
  assert.equal(blockedRetail.allowed, false);
  assert.ok(blockedRetail.error?.includes('/app/corporate'));

  // Submission gate allows /app/corporate unconditionally
  const allowedCorpPortal = validatePublicCorporateCheckoutGate({
    paymentMethod: 'account',
    bookingConfig: { allowPublicCorporateCheckout: false, acceptedPaymentMethods: ['card', 'cash'] },
    hasCorporatePortalContext: true,
  });
  assert.equal(allowedCorpPortal.allowed, true);
}

function testGuestSelfServicePolicies(): void {
  console.log('2️⃣  Testing Guest /track Self-Service Policy Controls...');

  const defPolicy = normalizeGuestSelfServicePolicy(undefined);
  assert.equal(defPolicy.enableGuestSelfService, true);
  assert.equal(defPolicy.allowGuestNotesAndFlightEdits, true);
  assert.equal(defPolicy.allowGuestPreDispatchRouteTimeEdits, true);
  assert.equal(defPolicy.guestDirectEditMinLeadMinutes, 30);
  assert.equal(defPolicy.allowGuestAssignedChangeRequests, true);
  assert.equal(defPolicy.allowGuestCancellation, true);
  assert.equal(defPolicy.maxLookupAttemptsPer5Min, 5);

  const clamped = normalizeGuestSelfServicePolicy({
    guestDirectEditMinLeadMinutes: 9999,
    maxLookupAttemptsPer5Min: 1,
  });
  assert.equal(clamped.guestDirectEditMinLeadMinutes, 720);
  assert.equal(clamped.maxLookupAttemptsPer5Min, 3);

  const nowMs = Date.parse('2026-11-24T12:00:00.000Z');
  const unassignedSoonTrip = makeTrip({
    status: 'CONFIRMED',
    assignedDriverId: null,
    scheduledPickupTime: '2026-11-24T12:45:00.000Z', // +45m away
  });

  // 2a. Master kill-switch
  const disabledAll = evaluateGuestManageEligibility(
    unassignedSoonTrip,
    { enableGuestSelfService: false },
    nowMs
  );
  assert.equal(disabledAll.canSelfManage, false);
  assert.equal(disabledAll.canEditNotesFlight, false);
  assert.equal(disabledAll.canModifyTimeRoute, false);
  assert.equal(disabledAll.canCancel, false);
  assert.equal(disabledAll.routeTimeMode, 'locked');

  // 2b. Notes & Flight disabled, pre-dispatch route/time still allowed (45m >= default 30m -> auto_apply)
  const noNotes = evaluateGuestManageEligibility(
    unassignedSoonTrip,
    { allowGuestNotesAndFlightEdits: false },
    nowMs
  );
  assert.equal(noNotes.canEditNotesFlight, false);
  assert.equal(noNotes.canModifyTimeRoute, true);
  assert.equal(noNotes.routeTimeMode, 'auto_apply');

  // 2c. guestDirectEditMinLeadMinutes = 60m when pickup is 45m away -> switches from 'auto_apply' to 'request_approval'
  const insideLeadWindowApproval = evaluateGuestManageEligibility(
    unassignedSoonTrip,
    { guestDirectEditMinLeadMinutes: 60, allowGuestAssignedChangeRequests: true },
    nowMs
  );
  assert.equal(insideLeadWindowApproval.canModifyTimeRoute, true);
  assert.equal(insideLeadWindowApproval.routeTimeMode, 'request_approval');

  // And if allowGuestAssignedChangeRequests is ALSO false inside lead window -> 'locked'
  const insideLeadWindowLocked = evaluateGuestManageEligibility(
    unassignedSoonTrip,
    { guestDirectEditMinLeadMinutes: 60, allowGuestAssignedChangeRequests: false },
    nowMs
  );
  assert.equal(insideLeadWindowLocked.canModifyTimeRoute, false);
  assert.equal(insideLeadWindowLocked.routeTimeMode, 'locked');

  // 2d. Assigned trip with allowGuestAssignedChangeRequests: false
  const assignedTrip = makeTrip({
    status: 'assigned',
    assignedDriverId: 'drv-101',
    scheduledPickupTime: '2026-11-24T15:00:00.000Z',
  });
  const assignedNoReq = evaluateGuestManageEligibility(
    assignedTrip,
    { allowGuestAssignedChangeRequests: false },
    nowMs
  );
  assert.equal(assignedNoReq.canModifyTimeRoute, false);
  assert.equal(assignedNoReq.routeTimeMode, 'locked');
  assert.equal(assignedNoReq.canEditNotesFlight, true);

  // 2e. allowGuestCancellation: false blocks both eligibility & cancellation policy evaluator
  const noCancelElig = evaluateGuestManageEligibility(
    unassignedSoonTrip,
    { allowGuestCancellation: false },
    nowMs
  );
  assert.equal(noCancelElig.canCancel, false);

  const noCancelEval = evaluateGuestCancellationPolicy({
    trip: unassignedSoonTrip,
    policy: { allowGuestCancellation: false },
    nowMs,
  });
  assert.equal(noCancelEval.canCancel, false);
}

function testLocalSeoCorridorsAndSitemap(): void {
  console.log('3️⃣  Testing Local SEO Corridors Overrides, Featured Ordering & Sitemap Exclusion...');

  const defaultList = getResolvedLocalSeoCorridors();
  assert.equal(defaultList.length, 8);
  assert.equal(LOCAL_SEO_CORRIDORS.length, 8);

  const defaultXml = buildSitemapXml('https://chesterfieldtaxi.com');
  assert.ok(defaultXml.includes('/service-areas/downtown-st-louis-airport-transfer'));
  assert.ok(defaultXml.includes('/service-areas/wildwood-and-ellisville-taxi'));

  const customSettings: Partial<AppSettings> = {
    localSeoConfig: normalizeLocalSeoConfig({
      corridorOverrides: {
        'downtown-st-louis-airport-transfer': {
          enabled: false,
        },
        'wildwood-and-ellisville-taxi': {
          enabled: true,
          featured: true,
          customHeroHeadline: 'Wildwood 24/7 Guaranteed STL Airport Car Service',
          customFaqs: [
            {
              question: 'Do you stage drivers in Wildwood before 5 AM?',
              answer: 'Yes, pre-booked Wildwood rides are staged ahead of your pickup window.',
            },
          ],
        },
      },
    }),
  };

  // Disabled corridor resolves to null (triggering 404 in /service-areas/:corridorSlug)
  assert.equal(
    getResolvedCorridorBySlug('downtown-st-louis-airport-transfer', customSettings),
    null
  );

  // Visible hub list excludes disabled (7 corridors) and puts featured Wildwood corridor FIRST!
  const activeCorridors = getResolvedLocalSeoCorridors(customSettings);
  assert.equal(activeCorridors.length, 7);
  assert.equal(activeCorridors[0].slug, 'wildwood-and-ellisville-taxi');
  assert.equal(activeCorridors[0].featured, true);
  assert.equal(activeCorridors[0].hasCustomOverrides, true);
  assert.equal(
    activeCorridors[0].heroHeadline,
    'Wildwood 24/7 Guaranteed STL Airport Car Service'
  );
  assert.equal(activeCorridors[0].faqs.length, 1);
  assert.equal(
    activeCorridors[0].faqs[0].question,
    'Do you stage drivers in Wildwood before 5 AM?'
  );

  // Admin manager list (includeDisabled: true) still shows all 8
  const adminAllCorridors = getResolvedLocalSeoCorridors(customSettings, {
    includeDisabled: true,
  });
  assert.equal(adminAllCorridors.length, 8);

  // Sitemap XML automatically excludes disabled corridor while retaining active ones
  const filteredXml = buildSitemapXml('https://chesterfieldtaxi.com', customSettings);
  assert.equal(
    filteredXml.includes('/service-areas/downtown-st-louis-airport-transfer'),
    false
  );
  assert.equal(
    filteredXml.includes('/service-areas/wildwood-and-ellisville-taxi'),
    true
  );
}

function testIntegrationsPolicies(): void {
  console.log('4️⃣  Testing Flight Window Policy, Canned SMS Templates & Dispatch Email Governance...');

  // 4a. FlightTrackingPolicyConfig + evaluateFlightCheckEligibility (12h vs 48h)
  const defFlight = normalizeFlightTrackingPolicy(undefined);
  assert.equal(defFlight.flightLookupWindowHours, 24);
  assert.equal(defFlight.cacheTtlMinutes, 15);
  assert.equal(defFlight.preferredProvider, 'auto');
  assert.equal(defFlight.delayAlertThresholdMinutes, 20);

  const clampedFlight = normalizeFlightTrackingPolicy({
    flightLookupWindowHours: 100,
    cacheTtlMinutes: 0,
    preferredProvider: 'flightaware',
    delayAlertThresholdMinutes: 2,
  });
  assert.equal(clampedFlight.flightLookupWindowHours, 72);
  assert.equal(clampedFlight.cacheTtlMinutes, 1);
  assert.equal(clampedFlight.preferredProvider, 'flightaware');
  assert.equal(clampedFlight.delayAlertThresholdMinutes, 5);

  const nowMs = Date.parse('2026-11-24T12:00:00.000Z');
  const pickupIn18h = new Date(nowMs + 18 * 3_600_000).toISOString();
  const pickupIn36h = new Date(nowMs + 36 * 3_600_000).toISOString();

  // With 12h window, +18h pickup is blocked
  const check12h = evaluateFlightCheckEligibility(
    {
      status: 'CONFIRMED',
      bookingType: 'scheduled',
      scheduledPickupTime: pickupIn18h,
      isStaffContext: true,
      nowMs,
    },
    12
  );
  assert.equal(check12h.eligible, false);
  assert.equal(check12h.reason, 'outside_24h_window');

  // With 48h window, +36h pickup is eligible!
  const check48h = evaluateFlightCheckEligibility(
    {
      status: 'CONFIRMED',
      bookingType: 'scheduled',
      scheduledPickupTime: pickupIn36h,
      isStaffContext: true,
      nowMs,
    },
    48
  );
  assert.equal(check48h.eligible, true);

  // 4b. Canned SMS Templates overrides & custom template interpolation
  const smsSettings: Partial<AppSettings> = {
    integrations: {
      cannedSmsTemplates: normalizeCannedSmsTemplates({
        builtInOverrides: {
          payment_link: { enabled: false },
          driver_en_route: {
            label: 'VIP Chauffeur En Route',
            bodyTemplate:
              'Hello {passengerFirstName}, chauffeur {driverName} is on the way! Track: {trackingUrl}',
          },
        },
        customTemplates: [
          {
            id: 'stl_southwest_door12',
            label: 'Southwest Door 12 Greeting',
            category: 'airport',
            bodyTemplate:
              'Hi {passengerFirstName}, {driverName} will meet you at {pickupDoor}. Map: {trackingUrl}',
            enabled: true,
          },
        ],
      }),
    },
  };

  const activeTemplates = getResolvedCannedSmsTemplates(smsSettings);
  // 6 built-in - 1 disabled + 1 custom = 6 active
  assert.equal(activeTemplates.length, 6);
  assert.equal(
    activeTemplates.some((t) => t.id === 'payment_link'),
    false
  );
  const customTpl = activeTemplates.find((t) => t.id === 'stl_southwest_door12');
  assert.ok(customTpl);

  const chips = buildInterpolatedCommsSmsChips(
    {
      firstName: 'Claire',
      driverName: 'Devon',
      carUnit: '207',
      airlineCode: 'WN',
      airportCode: 'STL',
      trackingUrl: 'https://chesterfieldtaxi.com/track?ref=CT-99',
    },
    smsSettings
  );
  const enRouteChip = chips.find((c) => c.id === 'driver_en_route');
  assert.equal(
    enRouteChip?.text,
    'Hello Claire, chauffeur Devon is on the way! Track: https://chesterfieldtaxi.com/track?ref=CT-99'
  );
  const swChip = chips.find((c) => c.id === 'stl_southwest_door12');
  assert.ok(swChip?.text.includes('Claire'));
  assert.ok(swChip?.text.includes('STL Terminal 2 Exit Door 12'));
  assert.equal(/\{[^}]*\}/.test(swChip?.text || ''), false);

  // Verify direct interpolateCommsSmsTemplate string call
  assert.equal(
    interpolateCommsSmsTemplate('Hi {passengerFirstName}!', { passengerName: 'Alex Morgan' }),
    'Hi Alex!'
  );

  // 4c. DispatchEmailPolicyConfig + blocked sender check + signature append
  const emailPolicy = normalizeDispatchEmailPolicy({
    inboundParseToBookingDraft: false,
    outboundSignature: 'Chesterfield Executive Desk · (314) 738-0100',
    blockedSenderList: ['SpamBot@Example.com', '*@junk-mailer.org', 'promo.net'],
    autoAckInboundBookingEmails: true,
  });
  assert.equal(emailPolicy.inboundParseToBookingDraft, false);
  assert.equal(emailPolicy.autoAckInboundBookingEmails, true);
  assert.deepEqual(emailPolicy.blockedSenderList, [
    'spambot@example.com',
    '@junk-mailer.org',
    '@promo.net',
  ]);

  assert.equal(isInboundEmailSenderBlocked('SpamBot@example.com', emailPolicy), true);
  assert.equal(
    isInboundEmailSenderBlocked('"Marketing" <blast@sub.junk-mailer.org>', emailPolicy),
    true
  );
  assert.equal(isInboundEmailSenderBlocked('offer@promo.net', emailPolicy), true);
  assert.equal(isInboundEmailSenderBlocked('vip@bayer.com', emailPolicy), false);

  const signedOnce = appendOutboundEmailSignature(
    'Your 6:00 AM airport sedan is confirmed.',
    emailPolicy.outboundSignature
  );
  assert.ok(signedOnce.includes('Chesterfield Executive Desk · (314) 738-0100'));
  // Idempotent when called again
  assert.equal(
    appendOutboundEmailSignature(signedOnce, emailPolicy.outboundSignature),
    signedOnce
  );
}

async function testNavigationAndPublicSanitization(): Promise<void> {
  console.log('5️⃣  Testing SUB_PAGES.integrations 5-Subtab Resolution & Secret Stripping...');

  assert.deepEqual(
    SUB_PAGES.integrations.map((s) => s.key),
    ['gateways', 'telephony', 'email', 'flights', 'webhooks']
  );

  for (const sub of ['gateways', 'telephony', 'email', 'flights', 'webhooks']) {
    assert.deepEqual(resolveAdminTabAndSub('integrations', sub), {
      tab: 'integrations',
      sub,
    });
  }
  assert.deepEqual(resolveAdminTabAndSub('integrations', 'invalid-sub'), {
    tab: 'integrations',
    sub: 'gateways',
  });

  const configSvc = getAdminConfigService();
  const updated = await configSvc.updateSettings({
    localSeoConfig: {
      corridorOverrides: {
        'clayton-to-stl-airport': { featured: true },
      },
    },
    integrations: {
      payments: {
        stripe: {
          mode: 'test',
          publishableKey: 'pk_mock_123',
          secretKey: 'MOCK_SECRET_SHOULD_BE_STRIPPED',
          webhookSecret: 'MOCK_WHSEC_SHOULD_BE_STRIPPED',
        },
      },
      telephony: {
        provider: 'twilio',
        accountSid: 'AC_MOCK_TEST_SID',
        phoneNumber: '+13147380100',
        authToken: 'SHOULD_BE_STRIPPED',
        apiKeySecret: 'SHOULD_BE_STRIPPED',
      },
    },
  });

  // Secret fields stripped from persisted AppSettings
  assert.equal((updated.integrations?.payments?.stripe as any)?.secretKey, undefined);
  assert.equal((updated.integrations?.payments?.stripe as any)?.webhookSecret, undefined);
  assert.equal((updated.integrations?.telephony as any)?.authToken, undefined);
  assert.equal((updated.integrations?.telephony as any)?.apiKeySecret, undefined);

  // sanitizePublicSettings includes localSeoConfig & customerBookingConfig, and NEVER leaks integrations
  const pub = sanitizePublicSettings(updated) as Record<string, unknown>;
  assert.equal('integrations' in pub, false);
  assert.ok(pub.localSeoConfig);
  assert.ok(pub.customerBookingConfig);
}

function testArchitectureAndHygieneGuardrails(): void {
  console.log('6️⃣  Auditing Monolith Line Ceilings, Immutable Configs & Terminology Hygiene...');

  const explicitCeilings: Array<[string, number]> = [
    ['app/components/domain/admin/subpages/AdminIntegrationsSubpage.tsx', 300],
    ['app/components/domain/admin/integrations/PaymentGatewaysPanel.tsx', 420],
    ['app/components/domain/admin/integrations/TelephonyAndSmsTemplatesPanel.tsx', 440],
    ['app/components/domain/admin/integrations/DispatchEmailConfigPanel.tsx', 360],
    ['app/components/domain/admin/integrations/FlightTrackingConfigPanel.tsx', 380],
    ['app/components/domain/admin/integrations/WebhooksAndPushPanel.tsx', 380],
    ['app/components/domain/admin/website/WebsiteFormControlsTab.tsx', 450],
    ['app/components/domain/admin/website/GuestSelfServicePolicyCard.tsx', 350],
    ['app/components/domain/admin/website/WebsiteLocalSeoPanel.tsx', 450],
    ['app/components/domain/admin/website/AdminWebsiteTab.tsx', 360],
    ['app/routes/admin.tsx', 1000],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
    ['app/components/domain/BookingEngineV2.tsx', 1350],
  ];

  for (const [relPath, maxLines] of explicitCeilings) {
    const absPath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absPath), true, `Expected file to exist: ${relPath}`);
    const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(lines < maxLines, `${relPath} exceeded line ceiling: ${lines} >= ${maxLines}`);
  }

  // Every file in app/components/domain/admin/integrations/ must be < 450L
  const integrationsDir = path.join(ROOT_DIR, 'app/components/domain/admin/integrations');
  const integrationFiles = fs
    .readdirSync(integrationsDir)
    .filter((name) => /\.(ts|tsx)$/.test(name));
  assert.ok(integrationFiles.length >= 5, 'Expected extracted integration panels');
  for (const file of integrationFiles) {
    const absPath = path.join(integrationsDir, file);
    const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lines < 450,
      `app/components/domain/admin/integrations/${file} exceeded 450L ceiling: ${lines}`
    );
  }

  // Immutable files untouched
  const immutableStatus = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    immutableStatus,
    '',
    `firestore.rules and vercel.json must remain untouched, got: ${immutableStatus}`
  );

  // Zero forbidden strings across app/
  const forbiddenTokens = [
    'HUD Now',
    '[Avail]',
    '[En Route]',
    '[Busy]',
    '[Break]',
    '[Off]',
  ];
  for (const filePath of collectAppTsFiles(path.join(ROOT_DIR, 'app'))) {
    const src = fs.readFileSync(filePath, 'utf8');
    for (const token of forbiddenTokens) {
      assert.equal(
        src.includes(token),
        false,
        `Forbidden string "${token}" found in ${path.relative(ROOT_DIR, filePath)}`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log('🚀 Running Platform Phase 62 Website/SEO Controls & Integrations Decomposition Suite...\n');
  testPublicCorporateCheckoutGate();
  testGuestSelfServicePolicies();
  testLocalSeoCorridorsAndSitemap();
  testIntegrationsPolicies();
  await testNavigationAndPublicSanitization();
  testArchitectureAndHygieneGuardrails();
  console.log('\n✅ ALL PHASE 62 WEBSITE, LOCAL SEO, /TRACK & INTEGRATIONS TESTS PASSED!');
}

main().catch((err) => {
  console.error('❌ Phase 62 Verification Failed:', err);
  process.exit(1);
});
