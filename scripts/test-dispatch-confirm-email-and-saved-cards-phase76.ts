/**
 * Platform Phase 76 Verification Suite (< 350 lines)
 * Verifies:
 * 1. Dispatcher-created bookings (`createdByRole === 'dispatcher'`) across Cash, Card & unrated
 *    guest create `status === 'CONFIRMED'` (never `'UNCONFIRMED'`), while enforcing `BLACKLIST_BLOCK`.
 * 2. `resolveDispatchConfirmationRecipient` priority chain, `await`ed `sendBookingConfirmation` +
 *    `result.success` inspection, and `DispatchBookingFooterBar` `(no email)` indicator.
 * 3. `ContactService` PCI-safe `savedPaymentMethods` CRUD, `saved-cards.server.ts` auth/validation +
 *    off-session charge, `card_setup` Pay Link round-trip, and SSR rendering of vault UI surfaces.
 * 4. 0 `<select>`, line ceilings, 0 blocking overlays, 0 secrets, and untouched immutable files.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ClientProfileEditTab } from '../app/components/domain/dispatch/ClientProfileEditTab';
import { ClientSavedCardsCard } from '../app/components/domain/dispatch/ClientSavedCardsCard';
import { resolveClientProfileData } from '../app/components/domain/dispatch/client-trip-history.util';
import { DispatchBookingFooterBar } from '../app/components/domain/dispatch/booking/DispatchBookingFooterBar';
import { DispatchPaymentAssignmentSection } from '../app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection';
import { resolveDispatchConfirmationRecipient } from '../app/components/domain/dispatch/booking/useDispatchBookingSubmission';
import { DispatchCompleteTripModal } from '../app/components/domain/dispatch/drawer/DispatchCompleteTripModal';
import type { VerifiedServerAuth } from '../app/core/services/auth/server-auth.server';
import { FirebaseBookingService, getBookingService } from '../app/core/services/booking';
import { getAdminConfigService } from '../app/core/services/config/admin-config.service';
import { getContactService, resolveCompletableStripeSavedCard } from '../app/core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../app/core/services/governance/universal-governance.service';
import {
  confirmCardSetupPayLinkServer,
  createOrReusePayLinkServer,
  createPayLinkCheckoutIntentServer,
} from '../app/core/services/payments/pay-link.server';
import {
  handleChargeSavedMethodServer,
  handleCreateSetupIntentServer,
  handleListSavedMethodsServer,
} from '../app/core/services/payments/saved-cards.server';
import { resetServerPaymentLoopStoreForTests } from '../app/core/services/payments/stripe-webhook.server';
import type { CreateTripInput, Trip } from '../app/core/types/trip';
import { ALLOWED_PAY_LINK_KEYS, buildCardSetupPayLinkProjection } from '../app/core/utils/pay-token.util';

const ROOT_DIR = process.cwd();
const noop = () => {};
const readRel = (rel: string) => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');

function collectFiles(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, ext, out);
    else if (ext.test(entry.name)) out.push(full);
  }
  return out;
}

function makeCreateInput(overrides: Partial<CreateTripInput> = {}): CreateTripInput {
  return {
    bookingType: 'asap',
    pickupLocation: { address: '16401 Swingley Ridge Rd, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    passenger: { firstName: 'Guest', lastName: 'Caller', phone: '+13145550188', email: '', passengerCount: 1, luggageCount: 1 },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 48, distanceMiles: 18, durationMinutes: 22, distanceRate: 2.5, timeRate: 0,
      vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 48, totalFare: 48, currency: 'USD',
    },
    payment: { method: 'cash', status: 'pending', amount: 48 },
    metadata: { createdByRole: 'dispatcher', channel: 'dispatch' },
    ...overrides,
  };
}

async function testDispatcherDirectConfirmedAndBlacklistGuard(): Promise<void> {
  console.log('1️⃣  Testing Dispatcher Direct CONFIRMED Status (Cash, Card, Unrated Guest) + Blacklist Block...');
  const mockSvc = getBookingService({ forceMock: true });
  const fbSvc = new FirebaseBookingService({
    apiKey: 'demo-key',
    projectId: 'chesterfield-taxi-test',
    appId: '1:000:web:000',
    skipNetworkPersistence: true,
  });

  for (const svc of [mockSvc, fbSvc]) {
    const cashTrip = await svc.createBooking(makeCreateInput({ payment: { method: 'cash', status: 'pending', amount: 48 } }));
    assert.equal(cashTrip.status, 'CONFIRMED', 'Dispatcher Cash booking must NEVER be UNCONFIRMED');
    assert.equal(cashTrip.statusHistory[0]?.actorRole, 'dispatcher');
    assert.equal(cashTrip.statusHistory[0]?.reason, 'Booked & confirmed directly via Dispatch Console');
    assert.equal(cashTrip.auditLog?.[0]?.action, 'AUTO_CONFIRMED');

    const cardTrip = await svc.createBooking(
      makeCreateInput({ payment: { method: 'card', status: 'pending', amount: 62 }, passenger: { firstName: 'New', lastName: 'Guest', phone: '+13145550189', email: '', passengerCount: 2, luggageCount: 2 } })
    );
    assert.equal(cardTrip.status, 'CONFIRMED', 'Dispatcher Card unrated guest booking must be CONFIRMED');

    const webCashTrip = await svc.createBooking(makeCreateInput({ metadata: { createdByRole: 'passenger', channel: 'web' } }));
    assert.equal(webCashTrip.status, 'UNCONFIRMED', 'Public web cash booking must still require review');
  }

  const gov = getUniversalGovernanceService();
  const origCheck = gov.isPassengerBlacklisted.bind(gov);
  (gov as any).isPassengerBlacklisted = async (phone?: string) =>
    phone === '+13145559999' ? { isBlacklisted: true, reason: 'Fraudulent chargeback history' } : origCheck(phone);
  try {
    for (const svc of [mockSvc, fbSvc]) {
      await assert.rejects(
        () => svc.createBooking(makeCreateInput({ passenger: { firstName: 'Bad', lastName: 'Actor', phone: '+13145559999', email: '', passengerCount: 1, luggageCount: 0 } })),
        /Booking Blocked:/,
        'BLACKLIST_BLOCK must still reject blacklisted riders on dispatcher bookings'
      );
    }
  } finally {
    (gov as any).isPassengerBlacklisted = origCheck;
  }

  const subSrc = readRel('app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts');
  assert.equal((subSrc.match(/status:\s*'CONFIRMED'/g) || []).length >= 4, true, 'All dispatcher createBooking inputs must set status: CONFIRMED');
}

function testEmailRecipientResolutionAndAwaitedSubmission(): void {
  console.log('2️⃣  Testing resolveDispatchConfirmationRecipient, awaited sendBookingConfirmation & (no email) badge...');
  const contactSvc = getContactService();
  contactSvc.resetForTests();

  const historyTrip = {
    id: 'TRP-HIST-1', createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-20T10:05:00.000Z',
    passenger: { firstName: 'Clara', lastName: 'Bell', phone: '(314) 555-0177', email: 'clara.history@example.com', passengerCount: 1, luggageCount: 0 },
  } as Trip;

  assert.deepEqual(
    resolveDispatchConfirmationRecipient({ email: '  ', phone: '+13145550177', lookupTrips: [historyTrip] }),
    { recipientEmail: 'clara.history@example.com', passengerEmail: 'clara.history@example.com', source: 'trip_history' }
  );

  contactSvc.upsertContact({ name: 'Clara Bell', phone: '+13145550177', email: 'clara.crm@example.com' });
  assert.deepEqual(
    resolveDispatchConfirmationRecipient({ email: '', phone: '(314) 555-0177', lookupTrips: [historyTrip] }),
    { recipientEmail: 'clara.crm@example.com', passengerEmail: 'clara.crm@example.com', source: 'crm_contact' }
  );

  assert.deepEqual(
    resolveDispatchConfirmationRecipient({ email: '', isBookerDifferent: true, contactEmail: 'concierge@ritz.example', phone: '+13145550177', lookupTrips: [historyTrip] }),
    { recipientEmail: 'concierge@ritz.example', passengerEmail: 'clara.crm@example.com', source: 'booker' }
  );

  assert.deepEqual(
    resolveDispatchConfirmationRecipient({ email: 'direct@passenger.example', isBookerDifferent: true, contactEmail: 'concierge@ritz.example', phone: '+13145550177' }),
    { recipientEmail: 'direct@passenger.example', passengerEmail: 'direct@passenger.example', source: 'passenger' }
  );

  assert.deepEqual(
    resolveDispatchConfirmationRecipient({ email: '', phone: '+13145550000', lookupTrips: [] }),
    { recipientEmail: '', passengerEmail: '', source: 'none' }
  );

  const subSrc = readRel('app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts');
  const sendIdx = subSrc.indexOf('await getEmailDispatchService().sendBookingConfirmation(');
  const resetIdx = subSrc.indexOf('onResetAfterCreate?.()');
  assert.equal(sendIdx > 0 && resetIdx > sendIdx, true, 'sendBookingConfirmation must be awaited BEFORE onResetAfterCreate');
  assert.equal(subSrc.includes('if (emailResult.success)') && subSrc.includes('emailResult.error'), true);
  assert.equal(subSrc.includes('Trip confirmed — no email on file to send confirmation'), true);

  const baseFooterProps = {
    isEditMode: false, isQuoting: false, isSubmitting: false, showPriceBreakdown: false, setShowPriceBreakdown: noop as any,
    outboundPricing: null, returnPricing: null, displayRoundTripFares: { outboundFare: 48, returnLegFare: 0, totalFare: 48 },
    returnTrip: false, repeat: false, repeatFrequency: 'daily' as const, repeatDays: [], selectedVehicles: ['any'], returnVehicles: ['any'],
    dispatchVehicleOptions: [], isFareOverridden: false, setIsFareOverridden: noop, manualFare: '', setManualFare: noop,
    sendEmailConfirmation: true, setSendEmailConfirmation: noop as any, isClearModalOpen: false, setIsClearModalOpen: noop,
    onCopyBooking: noop, onConfirmClear: noop, onClear: noop,
  };
  const footerNoEmail = renderToStaticMarkup(React.createElement(DispatchBookingFooterBar, { ...baseFooterProps, email: '', hasResolvedRecipientEmail: false }));
  const footerHasEmail = renderToStaticMarkup(React.createElement(DispatchBookingFooterBar, { ...baseFooterProps, email: '', hasResolvedRecipientEmail: true, resolvedRecipientEmail: 'clara.crm@example.com' }));
  assert.equal(footerNoEmail.includes('(no email)') && footerNoEmail.includes('data-email-confirm-no-email="true"'), true);
  assert.equal(footerHasEmail.includes('data-email-confirm-no-email="true"'), false);
  contactSvc.resetForTests();
}

async function testSavedCardsVaultServerAndUiSurfaces(): Promise<void> {
  console.log('3️⃣  Testing ContactService Vault CRUD, saved-cards.server.ts, card_setup PayLink & SSR UI...');
  const svc = getContactService();
  svc.resetForTests();
  const c0 = svc.upsertContact({ name: 'Arthur Pendelton', phone: '+13145550155', email: 'arthur@pendelton.example' });

  const c1 = svc.upsertSavedPaymentMethod(c0.id, {
    brand: 'Visa', last4: '4111222233334242', expMonth: 8, expYear: 28, cardholderName: 'Arthur Pendelton', mode: 'reference_only',
    ...({ cvc: '999', pan: '4111222233334242' } as any),
  })!;
  assert.equal(c1.savedPaymentMethods?.length === 1 && c1.savedPaymentMethods[0].last4 === '4242' && c1.savedPaymentMethods[0].expYear === 2028, true);
  assert.equal(JSON.stringify(c1).includes('4111222233334242') || JSON.stringify(c1).includes('999'), false, 'Zero full PAN or CVC allowed');

  const c1Dup = svc.upsertSavedPaymentMethod(c0.id, { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028, mode: 'reference_only' })!;
  assert.equal(c1Dup.savedPaymentMethods?.length, 1, 'Duplicate card must update in place');

  const c2 = svc.upsertSavedPaymentMethod(c0.id, {
    id: 'pm_cardVisaVault987654', brand: 'mastercard', last4: '8899', expMonth: 11, expYear: 2029,
    cardholderName: 'Arthur Pendelton', mode: 'stripe_pm', stripeCustomerId: 'cus_ArthurVault12345', isDefault: true,
  })!;
  assert.equal(c2.stripeCustomerId === 'cus_ArthurVault12345' && c2.savedPaymentMethods?.filter((m) => m.isDefault).length === 1, true);
  assert.equal(c2.savedPaymentMethods?.find((m) => m.isDefault)?.id, 'pm_cardVisaVault987654');

  const firstRefId = c2.savedPaymentMethods!.find((m) => m.mode === 'reference_only')!.id;
  assert.equal(svc.setDefaultSavedPaymentMethod(c0.id, firstRefId)?.savedPaymentMethods?.find((m) => m.isDefault)?.id, firstRefId);
  const c4 = svc.removeSavedPaymentMethod(c0.id, firstRefId)!;
  assert.equal(c4.savedPaymentMethods?.length === 1 && c4.savedPaymentMethods[0].isDefault, true);

  const unauth: VerifiedServerAuth = { authenticated: false, isAdmin: false, isDispatcher: false, isDriver: false, isCorporateManager: false, isAdminSecret: false, roles: [] };
  const staffAuth: VerifiedServerAuth = { authenticated: true, uid: 'disp_1', isAdmin: false, isDispatcher: true, isDriver: false, isCorporateManager: false, isAdminSecret: false, roles: ['dispatcher'] };
  const fakeKey = ['sk', 'test', 'MockUnitTestOnlyKey000'].join('_');

  assert.equal((await handleChargeSavedMethodServer({ auth: unauth, enforceAuth: true, stripeSecretKey: fakeKey, stripeCustomerId: 'cus_ArthurVault12345', paymentMethodId: 'pm_cardVisaVault987654', amount: 55 })).httpStatus, 401);
  assert.equal((await handleListSavedMethodsServer({ auth: staffAuth, enforceAuth: true, stripeSecretKey: fakeKey, stripeCustomerId: 'bad_id' })).httpStatus, 400);
  assert.equal((await handleChargeSavedMethodServer({ auth: staffAuth, enforceAuth: true, stripeSecretKey: fakeKey, stripeCustomerId: 'cus_ArthurVault12345', paymentMethodId: 'pm_cardVisaVault987654', amount: 2 })).httpStatus, 400);

  let capturedFormBody = '';
  const mockStripeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    capturedFormBody = String(init?.body || '');
    if (url.includes('/v1/customers')) return Response.json({ id: 'cus_NewVaultedClient01' });
    if (url.includes('/v1/setup_intents/seti_')) {
      return Response.json({
        id: 'seti_MockSetupIntent123', status: 'succeeded', customer: 'cus_NewVaultedClient01',
        payment_method: { id: 'pm_VaultedViaPayLink88', card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2028 }, billing_details: { name: 'Arthur P.' } },
      });
    }
    if (url.includes('/v1/setup_intents')) return Response.json({ id: 'seti_MockSetupIntent123', client_secret: 'seti_MockSetupIntent123_secret_abc' });
    return Response.json({ id: 'pi_OffSessionCharge999', status: 'succeeded', amount: 6450, currency: 'usd', payment_method: { card: { brand: 'mastercard', last4: '8899' } } });
  };

  assert.equal((await handleCreateSetupIntentServer({ stripeSecretKey: fakeKey, name: 'Arthur', fetchImpl: mockStripeFetch })).body.stripeCustomerId, 'cus_NewVaultedClient01');
  const okCharge = await handleChargeSavedMethodServer({
    auth: staffAuth, enforceAuth: true, stripeSecretKey: fakeKey, stripeCustomerId: 'cus_ArthurVault12345',
    paymentMethodId: 'pm_cardVisaVault987654', amount: 64.5, tripId: 'TRP-76', fetchImpl: mockStripeFetch,
  });
  assert.equal(okCharge.httpStatus === 200 && okCharge.body.paymentIntentId === 'pi_OffSessionCharge999', true);
  assert.equal(capturedFormBody.includes('off_session=true') && capturedFormBody.includes('confirm=true'), true);

  resetServerPaymentLoopStoreForTests();
  const setupProj = buildCardSetupPayLinkProjection({ contactId: c0.id, contactName: 'Arthur Pendelton', contactPhone: '+13145550155', contactEmail: 'arthur@pendelton.example' });
  assert.equal(setupProj.targetType === 'card_setup' && setupProj.baseAmount === 0 && !setupProj.allowTip, true);
  assert.equal(JSON.stringify(setupProj).includes('5550155') || JSON.stringify(setupProj).includes('arthur@'), false);
  for (const k of Object.keys(setupProj)) assert.equal(ALLOWED_PAY_LINK_KEYS.includes(k as any), true);

  const linkRes = await createOrReusePayLinkServer({ targetType: 'card_setup', targetId: c0.id, contactName: 'Arthur Pendelton', isDispatcher: true });
  assert.equal(linkRes.success && Boolean(linkRes.payToken), true);
  const setupCheckout = await createPayLinkCheckoutIntentServer({ payToken: linkRes.payToken!, stripeSecretKeyOverride: fakeKey, fetchImpl: mockStripeFetch });
  assert.equal(setupCheckout.body.mode === 'setup' && setupCheckout.body.setupIntentId === 'seti_MockSetupIntent123', true);
  const confirmedSetup = await confirmCardSetupPayLinkServer({ payToken: linkRes.payToken!, setupIntentId: 'seti_MockSetupIntent123', stripeSecretKeyOverride: fakeKey, fetchImpl: mockStripeFetch });
  assert.equal(confirmedSetup.httpStatus === 200 && confirmedSetup.body.payLink.status === 'paid', true);
  assert.equal(svc.getContactById(c0.id)?.savedPaymentMethods?.some((m) => m.id === 'pm_VaultedViaPayLink88' && m.isDefault), true);

  const updatedArthur = svc.getContactById(c0.id)!;
  const savedCardHtml = renderToStaticMarkup(React.createElement(ClientSavedCardsCard, { contactId: updatedArthur.id, contactName: updatedArthur.name, savedMethods: updatedArthur.savedPaymentMethods }));
  for (const needle of ['Visa •••• 4242 · 08/28 · Default', 'Stripe Vault', 'Send Card Setup Link', '+ Add Reference']) {
    assert.equal(savedCardHtml.includes(needle), true, `ClientSavedCardsCard must render "${needle}"`);
  }
  const editTabHtml = renderToStaticMarkup(React.createElement(ClientProfileEditTab, { profile: resolveClientProfileData({ phone: updatedArthur.phone, contacts: [updatedArthur], trips: [] }) }));
  assert.equal(editTabHtml.includes('data-client-saved-cards="true"'), true);

  const paymentSecHtml = renderToStaticMarkup(React.createElement(DispatchPaymentAssignmentSection, {
    paymentMethod: 'card', setPaymentMethod: noop, cardPaymentType: 'card_on_file', setCardPaymentType: noop,
    cardholderName: '', setCardholderName: noop, cardNumber: '', setCardNumber: noop, cardExp: '', setCardExp: noop,
    passengerPhone: updatedArthur.phone, corporateAccount: '', setCorporateAccount: noop, corporateAccountList: [],
    selectedCorporateAccount: null, matchedCorporateAccount: null, billingPo: '', setBillingPo: noop, poValidation: null,
    allowPoOverride: false, setAllowPoOverride: noop, authorizedBy: '', setAuthorizedBy: noop, selectedRuleId: '',
    setSelectedRuleId: noop, setTariff: noop, availableNamedRules: [], discount: 'None', setDiscount: noop,
    manualDiscountDollars: '', setManualDiscountDollars: noop, waiveAirportFee: false, setWaiveAirportFee: noop as any,
    waiveMultiStopFees: false, setWaiveMultiStopFees: noop as any, bypassSurge: false, setBypassSurge: noop as any,
    waivedSurchargeIds: [], setWaivedSurchargeIds: noop, waivedExtraKeys: [], setWaivedExtraKeys: noop,
    company: 'Chesterfield Taxi', setCompany: noop, driverId: 'unassigned', setDriverId: noop, driverOptions: [],
    notesForAll: '', setNotesForAll: noop, internalNotes: '', setInternalNotes: noop,
  }));
  assert.equal(paymentSecHtml.includes('data-dispatch-saved-card-select="true"') && paymentSecHtml.includes('Visa •••• 4242 · 08/28 (Default)'), true);

  assert.equal(resolveCompletableStripeSavedCard({ phone: updatedArthur.phone })?.paymentMethodId, 'pm_VaultedViaPayLink88');
  const completeTripHtml = renderToStaticMarkup(React.createElement(DispatchCompleteTripModal, {
    user: null, settings: getAdminConfigService().getCachedSettings(), drivers: [],
    completeTripTarget: {
      id: 'TRP-COMP-76', status: 'in_progress', bookingType: 'asap', offeredToIds: [], rejectedByIds: [], assignedDriverId: null,
      pickupLocation: { address: '1 Main St' }, dropoffLocation: { address: '2 Oak Ave' },
      passenger: { firstName: 'Arthur', lastName: 'P', phone: updatedArthur.phone, email: updatedArthur.email!, passengerCount: 1, luggageCount: 0 },
      vehicleTier: 'standard', pricing: { baseFare: 52, distanceMiles: 12, durationMinutes: 18, distanceRate: 2.5, timeRate: 0, vehicleMultiplier: 1, surgeMultiplier: 1, discountAmount: 0, subtotal: 52, totalFare: 52, currency: 'USD' },
      payment: { method: 'card', status: 'pending', amount: 52, vaultedCardId: 'pm_VaultedViaPayLink88' },
      metadata: { cardDetails: { cardPaymentType: 'card_on_file', savedPaymentMethodId: 'pm_VaultedViaPayLink88', stripeCustomerId: 'cus_NewVaultedClient01' } },
      statusHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as Trip,
    completeModalOpenSeq: 1, onTripsChange: noop as any, onCloseCompleteTripModal: noop, onShowToast: noop,
  }));
  assert.equal(completeTripHtml.includes('data-complete-charge-saved-card="true"') && completeTripHtml.includes('Charge Saved Card'), true);
  svc.resetForTests();
}

function testHygieneCeilingsAndImmutableFiles(): void {
  console.log('4️⃣  Testing Ceilings, 0 <select>, 0 Blocking Overlays, 0 Secrets & Immutable Files...');
  const ceilings: Array<[string, number]> = [
    ['app/components/domain/dispatch/ClientSavedCardsCard.tsx', 210],
    ['app/components/domain/dispatch/ClientProfileEditTab.tsx', 285],
    ['app/components/domain/dispatch/drawer/DispatchCompleteTripModal.tsx', 435],
    ['app/routes/dispatch.tsx', 1600],
    ['scripts/test-dispatch-confirm-email-and-saved-cards-phase76.ts', 350],
  ];
  for (const [rel, maxLines] of ceilings) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${filePath} must have 0 <select>`);
  }
  const secretShapes = [/\bAC[0-9a-f]{32}\b/i, /\bSK[0-9a-f]{32}\b/i, /\bAP[0-9a-f]{32}\b/i, /AKIA[0-9A-Z]{16}/, /sk_(live|test)_[0-9A-Za-z]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  const checkedClientFiles = [
    'app/components/domain/dispatch/ClientSavedCardsCard.tsx', 'app/components/domain/dispatch/ClientProfileEditTab.tsx',
    'app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx', 'app/components/domain/dispatch/booking/DispatchBookingFooterBar.tsx',
    'app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts', 'app/components/domain/dispatch/drawer/DispatchCompleteTripModal.tsx',
    'app/core/services/customer/contact.service.ts', 'app/core/utils/pay-token.util.ts',
  ];
  for (const rel of checkedClientFiles) {
    const src = readRel(rel);
    assert.equal(/bg-slate-950\/(60|65|35)/.test(src), false, `${rel} must have 0 blocking overlays`);
    assert.equal(/from\s+['"][^'"]*\.server['"]|from\s+['"]node:/.test(src), false, `${rel} must have 0 server/node imports`);
    for (const re of secretShapes) assert.equal(re.test(src), false, `${rel} must have 0 secrets`);
  }
  const gitStatus = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(gitStatus.includes('firestore.rules') || gitStatus.includes('vercel.json') || gitStatus.includes('DriverAssignDropdown.tsx'), false);
}

async function main() {
  console.log('🚀 Running Platform Phase 76 Verification Suite...\n');
  await testDispatcherDirectConfirmedAndBlacklistGuard();
  testEmailRecipientResolutionAndAwaitedSubmission();
  await testSavedCardsVaultServerAndUiSurfaces();
  testHygieneCeilingsAndImmutableFiles();
  console.log('\n✅ ALL PLATFORM PHASE 76 VERIFICATION CHECKS PASSED!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Phase 76 verification failed:', err);
    process.exit(1);
  });
