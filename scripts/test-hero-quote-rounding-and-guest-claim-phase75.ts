/**
 * Platform Phase 75 (User Phase 76) Automated Verification Suite
 * (`scripts/test-hero-quote-rounding-and-guest-claim-phase75.ts`)
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { BookingConfirmation } from '../app/components/domain/BookingConfirmation';
import { GuestAccountActivationCard } from '../app/components/domain/booking/GuestAccountActivationCard';
import { PriceBreakdownPanel } from '../app/components/domain/booking/PriceBreakdownPanel';
import { DispatchHeaderCallHud } from '../app/components/domain/dispatch/DispatchHeaderCallHud';
import {
  DispatchCompleteTripModal,
  combineLocalCompletionDateTimeToIso,
  resolveScheduledDropoffParts,
  toLocalCompletionDateTimeParts,
} from '../app/components/domain/dispatch/drawer/DispatchCompleteTripModal';
import { DriverTripManifest } from '../app/components/domain/driver/DriverTripManifest';
import { buildPersistedPricing } from '../app/core/hooks/booking/booking-form.utils';
import { buildPerVehiclePricingSpecs } from '../app/core/services/booking/multi-car.util';
import { DEFAULT_APP_SETTINGS } from '../app/core/services/config/admin-config.service';
import {
  renderBookingConfirmedEmail,
  renderBookingRequestReceivedEmail,
  renderStatusUpdateEmail,
  renderTripReceiptEmail,
  shouldRenderGuestSignupCta,
} from '../app/core/services/email/email-templates';
import { calculateTripPricing } from '../app/core/services/pricing/pipeline';
import { DEFAULT_TARIFF_PROFILES } from '../app/core/services/pricing/tariff.service';
import { getLatestSoftphoneViewState, getWorkspaceBus, resetSoftphoneViewStateForTests } from '../app/core/services/workspace-bus.service';
import type { PriceLineItem, Trip } from '../app/core/types';
import { isRoundingLineItem, reconcileBreakdownWithoutRounding } from '../app/core/utils/fare-breakdown.util';
import { buildGuestAccountSignupHref, claimGuestTripsForUser, parseClaimTripIds } from '../app/core/utils/guest-trip-claim.util';
import { buildTripPayLinkProjection } from '../app/core/utils/pay-token.util';
import IndexRoute from '../app/routes/_index';

const ROOT_DIR = process.cwd();
const readRel = (rel: string): string => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
const noop = () => {};

function collectFiles(dir: string, extRegex: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, extRegex));
    else if (entry.isFile() && extRegex.test(entry.name)) results.push(full);
  }
  return results;
}

function makeTrip(id: string, overrides: Partial<Trip> = {}): Trip {
  const iso = '2026-11-25T15:00:00.000Z';
  return {
    id, status: 'CONFIRMED', offeredToIds: [], rejectedByIds: [], assignedDriverId: null,
    pickupLocation: { address: '16625 Swingley Ridge Rd, Chesterfield, MO 63017', coordinates: { lat: 38.663, lng: -90.577 } },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145', coordinates: { lat: 38.748, lng: -90.37 } },
    bookingType: 'scheduled', scheduledPickupTime: iso,
    passenger: { firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example', phone: '(314) 555-0144', passengerCount: 2, luggageCount: 1 },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 42.35, distanceMiles: 20.2, durationMinutes: 28, distanceRate: 0, timeRate: 0,
      vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 46.35, totalFare: 47, currency: 'USD',
      breakdown: [
        { id: 'base-fare', category: 'base', label: 'Base Fare', amount: 42.35, sourceType: 'tariff' },
        { id: 'airport-fee', category: 'surcharge', label: 'Airport Access', amount: 4, sourceType: 'surcharge' },
        { id: 'rounding-dollar', category: 'rounding', label: 'Rounding', amount: 0.65, sourceType: 'rounding' },
      ],
    },
    payment: { method: 'card', status: 'pending', amount: 47 },
    statusHistory: [], createdAt: iso, updatedAt: iso, ...overrides,
  };
}

function testCallHudFrame1KeypadSync(): void {
  console.log('1️⃣  Testing Frame-1 Call HUD Keypad Sync (Zero Initial Pill Flash)...');
  resetSoftphoneViewStateForTests();
  assert.equal(getLatestSoftphoneViewState(), null);

  getWorkspaceBus().publish('SOFTPHONE_VIEW_STATE_CHANGED', { activeTab: 'phone', callsSubTab: 'keypad' });
  assert.deepEqual(getLatestSoftphoneViewState(), { activeTab: 'phone', callsSubTab: 'keypad' });

  for (const callMode of ['calling', 'connected'] as const) {
    const html = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
      isPhoneDockActive: true, commsActiveTab: 'all', commsCallsSubTab: 'history',
      activeCallStatus: callMode, activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 3 },
    }));
    assert.equal(html, '', `Call HUD must return null on frame 1 during ${callMode} when Phone -> Keypad is active`);
  }

  getWorkspaceBus().publish('SOFTPHONE_VIEW_STATE_CHANGED', { activeTab: 'messages', callsSubTab: 'history' });
  const compactHtml = renderToStaticMarkup(React.createElement(DispatchHeaderCallHud, {
    isPhoneDockActive: true, commsActiveTab: 'phone', commsCallsSubTab: 'keypad',
    activeCallStatus: 'connected', activeCallMeta: { contactName: 'Elena Vance', phoneNumber: '+13145550144', duration: 15 }, callDuration: 15,
  }));
  assert.equal(compactHtml.includes('data-call-hud-state="active-compact"'), true);
  assert.equal(readRel('app/components/domain/dispatch/CommsHub.tsx').includes('onTabChange?.(activeTab)'), true);
  resetSoftphoneViewStateForTests();
}

function testCompleteTripModalDriverAndDateTime(): void {
  console.log('2️⃣  Testing DispatchCompleteTripModal Searchable Driver Select & Completion Date/Time...');
  assert.deepEqual(toLocalCompletionDateTimeParts(new Date(2026, 10, 25, 14, 13, 0)), { date: '2026-11-25', time: '14:15' });
  assert.equal(new Date(combineLocalCompletionDateTimeToIso('2026-11-25', '14:15')).getFullYear(), 2026);

  const trip = makeTrip('trp_Comp75a', { plannedDriverId: 'drv-404' });
  assert.notEqual(resolveScheduledDropoffParts(trip), null);

  const html = renderToStaticMarkup(React.createElement(DispatchCompleteTripModal, {
    user: { uid: 'disp-1', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher', roles: ['dispatcher'] },
    settings: DEFAULT_APP_SETTINGS,
    drivers: [{ id: 'drv-404', name: 'Michael Stone', firstName: 'Michael', cabNumber: '404', status: 'available', vehicle: 'Sedan', tier: 'standard', phone: '+13145550900', zone: '' }],
    completeTripTarget: trip, completeModalOpenSeq: 1,
    onTripsChange: noop as any, onReviewTripChange: noop as any, onCloseCompleteTripModal: noop, onShowToast: noop,
  }));
  for (const needle of ['data-complete-trip-driver="true"', '#404, Michael', 'data-complete-trip-datetime="true"', '>Now<', '>Scheduled Dropoff<']) {
    assert.equal(html.includes(needle), true, `DispatchCompleteTripModal must render ${needle}`);
  }
  const adminSubSrc = readRel('app/components/domain/admin/subpages/AdminTripsSubpage.tsx');
  assert.equal(adminSubSrc.includes('<DispatchCompleteTripModal') && adminSubSrc.includes('openCompleteTripModal'), true);
  assert.equal(adminSubSrc.includes("handleStatusTransition(t.id, 'completed')"), false);
}

function testLandingPageHeroLockedHeightNoBreakdown(): void {
  console.log('3️⃣  Testing Landing Page Hero 0px Locked-Height Fare Slot & 0 Breakdown Toggles...');
  const heroSrc = readRel('app/routes/_index.tsx');
  for (const banned of ['showBreakdown', 'Price Breakdown', 'Hide Breakdown']) {
    assert.equal(heroSrc.includes(banned), false, `_index.tsx must not contain ${banned}`);
  }
  for (const required of ['h-[68px] min-h-[68px] max-h-[68px]', 'data-hero-fare-slot="true"', 'Enter pickup &amp; dropoff above', 'Calculating optimal route...', 'Confirmed by dispatch']) {
    assert.equal(heroSrc.includes(required), true, `_index.tsx must contain ${required}`);
  }
  const idleHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(IndexRoute)));
  assert.equal(idleHtml.includes('data-hero-fare-slot="true"') && idleHtml.includes('data-hero-fare-state="idle"') && idleHtml.includes('$—'), true);
}

function testPlatformWideZeroRoundingAndPennyExactTotals(): void {
  console.log('4️⃣  Testing Platform-Wide 0 Rounding Line Items & Penny-Exact Totals...');
  const dirtyItems: PriceLineItem[] = [
    { id: 'b', category: 'base', label: 'Airport Base', amount: 42.35, sourceType: 'tariff' },
    { id: 'e', category: 'extra', label: 'Child Seat', amount: 10, sourceType: 'extra' },
    { id: 's1', category: 'surcharge', label: 'Airport Access', amount: 4, sourceType: 'surcharge' },
    { id: 'sw', category: 'surcharge', label: 'Night Fee (Waived)', amount: 0, isWaived: true, originalAmount: 5, sourceType: 'surcharge' },
    { id: 'd', category: 'discount', label: 'VIP 10%', amount: -5.64, sourceType: 'discount' },
    { id: 'r', category: 'rounding', label: 'Rounding', amount: 0.29, sourceType: 'rounding' },
  ];
  const clean = reconcileBreakdownWithoutRounding(dirtyItems, 51);
  assert.equal(clean.some((i) => isRoundingLineItem(i) || /rounding/i.test(i.label)), false);
  assert.equal(clean.some((i) => i.isWaived === true), true);
  assert.deepEqual(clean.map((i) => i.category), ['base', 'extra', 'surcharge', 'surcharge', 'discount']);
  assert.equal(Math.abs(clean.reduce((acc, i) => acc + (i.isWaived ? 0 : i.amount), 0) - 51) <= 0.005, true);

  for (const fareMode of ['ceil_dollar', 'nearest_dollar', 'nearest_half_dollar', 'exact_cents'] as const) {
    const tariffs = DEFAULT_TARIFF_PROFILES.map((t) => ({ ...t, rounding: { distanceMode: 'exact' as const, fareMode } }));
    const calc = calculateTripPricing({ distanceMiles: 11.3, durationMinutes: 19, passengers: 2, isAirportPickup: true, originZoneId: 'zone-lambert-airport' }, { tariffs });
    const bd = calc.pricing.breakdown || [];
    assert.equal(bd.some((i) => isRoundingLineItem(i) || /rounding/i.test(i.label)), false);
    assert.equal(Math.abs(bd.reduce((s, i) => s + (i.isWaived ? 0 : i.amount), 0) - calc.pricing.totalFare) <= 0.005, true);
    assert.equal(calc.context.auditTrail.some((a) => a.stepName === 'Surcharges, Discounts & Rounding'), true);
  }
  assert.equal(readRel('app/components/domain/admin/pricing/rates/RatesPanel.tsx').includes('ceil_dollar'), true);

  const sampleTrip = makeTrip('trp_RoundCheck75');
  const multiSpecs = buildPerVehiclePricingSpecs({
    selectedVehicles: ['sedan', 'suv'], resolveTier: (c) => c, resolveDisplayName: (c) => c.toUpperCase(),
    vehicleQuotes: { sedan: sampleTrip.pricing, suv: { ...sampleTrip.pricing, totalFare: 58.2 } },
    primaryPricing: sampleTrip.pricing, distanceMiles: 20.2, durationMinutes: 28, combinedTargetFare: 107, isFareOverridden: false,
  });
  for (const spec of multiSpecs) {
    const bd = spec.pricing.breakdown || [];
    assert.equal(bd.some((i) => isRoundingLineItem(i) || /rounding/i.test(i.label)), false);
    assert.equal(Math.abs(bd.reduce((s, i) => s + i.amount, 0) - spec.fare) <= 0.005, true);
  }

  const persisted = buildPersistedPricing(sampleTrip.pricing, 49, 20.2, 28, false);
  assert.equal((persisted.breakdown || []).some((i) => isRoundingLineItem(i)), false);
  assert.equal(Math.abs((persisted.breakdown || []).reduce((s, i) => s + i.amount, 0) - 49) <= 0.005, true);

  const panelHtml = renderToStaticMarkup(React.createElement(PriceBreakdownPanel, {
    outboundPricing: sampleTrip.pricing, outboundDisplayFare: 47, returnDisplayFare: null, totalDisplayFare: 47, isRoundTrip: false, vehicleLabel: 'Sedan',
  }));
  assert.equal(/rounding/i.test(panelHtml), false);
  assert.equal(panelHtml.includes('$43.00') && panelHtml.includes('$4.00') && panelHtml.includes('$47.00'), true);

  const manifestHtml = renderToStaticMarkup(React.createElement(DriverTripManifest, { trip: sampleTrip }));
  assert.equal(/rounding/i.test(manifestHtml) === false && manifestHtml.includes('Fare Breakdown (2 items)'), true);

  const payProj = buildTripPayLinkProjection(sampleTrip);
  assert.equal(payProj.lineItems.some((li) => /rounding/i.test(li.label)), false);
  assert.equal(Math.abs(payProj.lineItems.reduce((s, li) => s + li.amount, 0) - payProj.baseAmount) <= 0.005, true);
}

async function testGuestClaimActivationAndEmails(): Promise<void> {
  console.log('5️⃣  Testing Exact-Case Guest Claim, GuestAccountActivationCard & Transactional Email CTAs...');
  assert.deepEqual(parseClaimTripIds(' ct_7kQp9xLm , #trp_Ret88b , ct_7kQp9xLm '), ['ct_7kQp9xLm', 'trp_Ret88b']);
  const href = buildGuestAccountSignupHref({
    baseUrl: 'https://chesterfieldtaxi.com/', tripIds: ['ct_7kQp9xLm', 'trp_Ret88b'],
    email: 'elena@bayer.example', name: 'Elena Vance', phone: '(314) 555-0144',
  });
  assert.equal(href.includes('claimTrip=ct_7kQp9xLm%2Ctrp_Ret88b'), true);

  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const claimRes = await claimGuestTripsForUser('uid_elena_99', 'ct_7kQp9xLm,trp_Ret88b', {
    updateTrip: async (id, patch) => { updates.push({ id, patch }); },
  });
  assert.deepEqual(claimRes.claimedIds, ['ct_7kQp9xLm', 'trp_Ret88b']);
  assert.deepEqual(updates, [
    { id: 'ct_7kQp9xLm', patch: { customerId: 'uid_elena_99', userId: 'uid_elena_99' } },
    { id: 'trp_Ret88b', patch: { customerId: 'uid_elena_99', userId: 'uid_elena_99' } },
  ]);
  assert.equal(readRel('app/routes/app.register.tsx').includes('claimTripId.toUpperCase()'), false);
  assert.equal(readRel('app/routes/app.login.tsx').includes('claimTrip.toUpperCase()'), false);

  const guestTrip = makeTrip('ct_GuestAbC1', { customerId: undefined, metadata: { hasReturnTrip: true, returnTripId: 'ct_RetXyZ2', returnFare: 47 } });
  const cardHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(GuestAccountActivationCard, { trip: guestTrip })));
  for (const needle of ['Activate Free Account &amp; Save Ride', 'Continue with Google', '>Sign in<', 'elena@bayer.example', 'data-claim-trip-ids="ct_GuestAbC1,ct_RetXyZ2"']) {
    assert.equal(cardHtml.includes(needle), true, `GuestAccountActivationCard must render ${needle}`);
  }

  const confirmGuestHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(BookingConfirmation, { trip: guestTrip, onBookAnother: noop })));
  assert.equal(confirmGuestHtml.includes('data-guest-activation-card="true"'), true);
  assert.equal(confirmGuestHtml.indexOf('data-guest-activation-card="true"') < confirmGuestHtml.indexOf('What Happens Next?'), true);

  const confirmUserHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(BookingConfirmation, { trip: makeTrip('ct_User1', { customerId: 'uid_existing' }), onBookAnother: noop })));
  assert.equal(confirmUserHtml.includes('data-guest-activation-card="true"'), false);

  assert.equal(shouldRenderGuestSignupCta({ tripId: 'ct_AbC', customerId: null }), true);
  assert.equal(shouldRenderGuestSignupCta({ tripId: 'ct_AbC', customerId: 'uid_1' }), false);
  assert.equal(shouldRenderGuestSignupCta({ tripId: 'ct_AbC', customerId: null, newStatus: 'cancelled' }), false);
  assert.equal(shouldRenderGuestSignupCta({ tripId: 'ct_AbC', customerId: null, newStatus: 'declined' }), false);

  const baseEmailPayload = {
    tripId: 'ct_AbC99',
    passenger: { firstName: 'Elena', lastName: 'Vance', email: 'elena@bayer.example', phone: '3145550144' },
    pickupAddress: '16625 Swingley Ridge Rd', dropoffAddress: '10701 Lambert International Blvd',
    pickupTime: 'Nov 25, 3:00 PM', bookingType: 'scheduled' as const, vehicleTier: 'standard',
    totalFare: 47, breakdown: guestTrip.pricing.breakdown, currency: 'USD', paymentMethod: 'card',
  };
  const reqGuest = renderBookingRequestReceivedEmail({ ...baseEmailPayload, customerId: null });
  const reqUser = renderBookingRequestReceivedEmail({ ...baseEmailPayload, customerId: 'uid_1' });
  assert.equal(reqGuest.html.includes('claimTrip=ct_AbC99') && reqGuest.text.includes('claimTrip=ct_AbC99') && !/rounding/i.test(reqGuest.html), true);
  assert.equal(reqUser.html.includes('data-guest-signup-cta="true"'), false);

  const confGuest = renderBookingConfirmedEmail({ ...baseEmailPayload, customerId: null });
  const confUser = renderBookingConfirmedEmail({ ...baseEmailPayload, customerId: 'uid_1' });
  assert.equal(confGuest.html.includes('claimTrip=ct_AbC99') && !/rounding/i.test(confGuest.html), true);
  assert.equal(confUser.html.includes('data-guest-signup-cta="true"'), false);

  const statusEnRoute = renderStatusUpdateEmail({ ...baseEmailPayload, customerId: null, newStatus: 'en_route' });
  const statusCancelled = renderStatusUpdateEmail({ ...baseEmailPayload, customerId: null, newStatus: 'cancelled' });
  assert.equal(statusEnRoute.html.includes('claimTrip=ct_AbC99') && statusEnRoute.text.includes('claimTrip=ct_AbC99'), true);
  assert.equal(statusCancelled.html.includes('data-guest-signup-cta="true"'), false);

  const recGuest = renderTripReceiptEmail({ ...baseEmailPayload, customerId: null, completedAt: 'Nov 25, 3:35 PM', subtotalFare: 47, grandTotal: 55, tipAmount: 8 });
  const recUser = renderTripReceiptEmail({ ...baseEmailPayload, customerId: 'uid_1', completedAt: 'Nov 25, 3:35 PM', subtotalFare: 47, grandTotal: 55, tipAmount: 8 });
  assert.equal(recGuest.html.includes('claimTrip=ct_AbC99') && recGuest.text.includes('claimTrip=ct_AbC99') && !/rounding/i.test(recGuest.html), true);
  assert.equal(recUser.html.includes('data-guest-signup-cta="true"'), false);
}

function testHygieneCeilingsAndImmutableFiles(): void {
  console.log('6️⃣  Testing Ceilings, 0 <select>, 0 Blocking Overlays, 0 Secrets & Immutable Files...');
  const ceilings: Array<[string, number]> = [
    ['app/components/domain/dispatch/drawer/DispatchCompleteTripModal.tsx', 435],
    ['app/core/utils/fare-breakdown.util.ts', 120],
    ['app/core/utils/guest-trip-claim.util.ts', 120],
    ['app/components/domain/booking/GuestAccountActivationCard.tsx', 230],
    ['app/components/domain/dispatch/DispatchHeaderCallHud.tsx', 360],
    ['app/components/domain/dispatch/CommsHub.tsx', 360],
    ['scripts/test-hero-quote-rounding-and-guest-claim-phase75.ts', 350],
  ];
  for (const [rel, maxLines] of ceilings) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }
  assert.equal(/react|document|window|node:/.test(readRel('app/core/utils/fare-breakdown.util.ts')), false);

  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${filePath} must have 0 <select>`);
  }

  const secretShapes = [/\bAC[0-9a-f]{32}\b/i, /\bSK[0-9a-f]{32}\b/i, /\bAP[0-9a-f]{32}\b/i, /AKIA[0-9A-Z]{16}/, /sk_(live|test)_[0-9A-Za-z]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  for (const [rel] of ceilings) {
    const src = readRel(rel);
    assert.equal(/bg-slate-950\/(60|65|35)/.test(src), false, `${rel} must contain 0 blocking overlays`);
    if (rel.startsWith('app/')) assert.equal(/from\s+['"][^'"]*\.server['"]|from\s+['"]node:/.test(src), false);
    for (const re of secretShapes) assert.equal(re.test(src), false, `${rel} must contain 0 secret-shaped literals`);
  }

  const gitStatus = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(gitStatus.includes('firestore.rules'), false);
  assert.equal(gitStatus.includes('vercel.json'), false);
  assert.equal(gitStatus.includes('DriverAssignDropdown.tsx'), false);
}

async function main() {
  console.log('🚀 Running Platform Phase 75 Verification Suite...\n');
  testCallHudFrame1KeypadSync();
  testCompleteTripModalDriverAndDateTime();
  testLandingPageHeroLockedHeightNoBreakdown();
  testPlatformWideZeroRoundingAndPennyExactTotals();
  await testGuestClaimActivationAndEmails();
  testHygieneCeilingsAndImmutableFiles();
  console.log('\n✅ ALL PLATFORM PHASE 75 VERIFICATION CHECKS PASSED!');
}

main().catch((err) => {
  console.error('❌ Phase 75 verification failed:', err);
  process.exit(1);
});
