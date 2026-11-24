/**
 * Phase 60 Automated Verification Suite (`scripts/test-admin-clients-and-billing-phase60.ts`)
 *
 * Verifies:
 * 1. `normalizeCorporatePortalPolicy` & `normalizeBillingSettingsConfig` defaults & bounds clamping.
 * 2. `poFormatRegex` validation (`validatePoFormatRegex` & `validateCorporatePo`) and
 *    `creditLimitEnforcement` (`'soft_warning'` vs `'hard_block'`) in `corporate-account.service.ts`
 *    and `validateDispatchCorporateSubmission` (`useCorporatePoVerification.ts`).
 * 3. `pay-token.util.ts` (`resolvePayLinkPolicyDefaults`, `buildTripPayLinkProjection`,
 *    `buildInvoicePayLinkProjection`) honoring custom `payLinkExpiryHours` and `allowTip` defaults
 *    from `BillingSettingsConfig`.
 * 4. Pure Multi-Role Payouts Engine (`payouts.service.ts`): `computeDriverEarningsRollup`,
 *    `computeStaffPayoutPreview`, `computeOtherPayeeSettlement`, GL journal entry generation
 *    (`driver_payout`, `staff_payout`, `vendor_payout`) + QuickBooks IIF/CSV balance parity,
 *    and formula-safe `exportPayoutsCsv`.
 * 5. Static architecture & UI hygiene guardrails:
 *    - `AdminCustomersSubpage.tsx < 450`L and every file under `app/components/domain/admin/customers/` `< 450`L.
 *    - `AdminInvoicingSubpage.tsx < 400`L, `DriverPayoutsPanel.tsx < 450`L, `PayoutSettlementModal.tsx < 400`L,
 *      `BillingPolicyAndQuickBooksPanel.tsx < 400`L, `CorporateAccountsPanel.tsx < 450`L,
 *      `useAdminInvoicingActions.ts < 650`L.
 *    - Zero `twilioSid` / `stripeSk` / `squareToken` duplicate credential state inside `DriverPayoutsPanel.tsx`
 *      or `useAdminInvoicingActions.ts`.
 *    - `firestore.rules` and `vercel.json` untouched (`git status --porcelain firestore.rules vercel.json`).
 *    - Zero `"HUD Now"` and zero `'[Avail]'` / `'[En Route]'` / `'[Busy]'` / `'[Break]'` / `'[Off]'` strings across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeBillingSettingsConfig,
  normalizeCorporatePortalPolicy,
  type CorporateAccountConfig,
  type InvoiceRecord,
  type PayoutPayeeRecord,
  type PayoutSettlementRecord,
} from '../app/core/types/config';
import {
  evaluateCorporateCreditLimit,
  getCorporateAccountService,
  validatePoFormatRegex,
} from '../app/core/services/corporate-account.service';
import { validateDispatchCorporateSubmission } from '../app/core/hooks/booking/useCorporatePoVerification';
import {
  buildInvoicePayLinkProjection,
  buildTripPayLinkProjection,
  resolvePayLinkPolicyDefaults,
} from '../app/core/utils/pay-token.util';
import {
  buildPayoutLedgerEntry,
  computeDriverEarningsRollup,
  computeOtherPayeeSettlement,
  computeStaffPayoutPreview,
  exportPayoutsCsv,
} from '../app/core/services/payouts.service';
import { getInvoicingService } from '../app/core/services/invoicing.service';
import type { Trip } from '../app/core/types/trip';
import type { OperatorUser } from '../app/core/services/operator.service';

const ROOT_DIR = process.cwd();

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function makeCompletedTrip(overrides: Partial<Trip> = {}): Trip {
  const nowIso = '2026-11-20T15:00:00.000Z';
  return {
    id: 'trip-p60-001',
    status: 'completed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-101',
    pickupLocation: { address: '400 Chesterfield Center, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-11-20T14:30:00.000Z',
    completedAt: nowIso,
    passenger: {
      firstName: 'Claire',
      lastName: 'Bennett',
      email: 'claire@example.com',
      phone: '(314) 555-0144',
      passengerCount: 1,
      luggageCount: 1,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 10,
      distanceMiles: 20,
      durationMinutes: 25,
      distanceRate: 50,
      timeRate: 0,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      discountAmount: 0,
      tollsFee: 4,
      subtotal: 60,
      totalFare: 64, // $60 commissionable fare + $4 pass-through toll
      currency: 'USD',
    },
    payment: {
      method: 'card',
      status: 'captured',
      amount: 76, // $64 totalFare + $12 tip
      tipAmount: 12,
      tollsAmount: 4,
    },
    statusHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

function makeCorporateAccount(
  overrides: Partial<CorporateAccountConfig> = {}
): CorporateAccountConfig {
  return {
    id: 'corp-bayer-01',
    companyName: 'Bayer Crop Science',
    accountNumber: 'CORP-1001',
    billingCycle: 'net30',
    creditLimit: 1000,
    billingContactName: 'Accounts Payable',
    billingContactEmail: 'ap@bayer.example.com',
    discountPercent: 5,
    poRequired: true,
    currentPoNumber: 'PO-202611',
    poNumberHistory: [
      {
        poNumber: 'PO-202501',
        generatedAt: '2025-01-01T00:00:00.000Z',
        rotatedAt: '2026-06-01T00:00:00.000Z',
        rotatedBy: 'admin@chesterfieldtaxi.com',
        reason: 'Annual rotation',
      },
    ],
    isActive: true,
    ...overrides,
  };
}

function testConfigNormalizers(): void {
  console.log('1️⃣  Testing CorporatePortalGovernanceConfig & BillingSettingsConfig Normalizers...');

  // Defaults for CorporatePortalGovernanceConfig
  const defaultPortal = normalizeCorporatePortalPolicy(undefined);
  assert.equal(defaultPortal.allowSelfManageRiders, true);
  assert.equal(defaultPortal.allowSelfManageSavedLocations, true);
  assert.equal(defaultPortal.defaultRequirePoForNewAccounts, true);
  assert.equal(defaultPortal.poFormatRegex, undefined);
  assert.equal(defaultPortal.creditLimitEnforcement, 'soft_warning');

  // Invalid regex stripped safely, valid hard_block & booleans preserved
  const invalidRegexPortal = normalizeCorporatePortalPolicy({
    allowSelfManageRiders: false,
    allowSelfManageSavedLocations: false,
    defaultRequirePoForNewAccounts: false,
    poFormatRegex: '[unclosed-regex(',
    creditLimitEnforcement: 'hard_block',
  });
  assert.equal(invalidRegexPortal.allowSelfManageRiders, false);
  assert.equal(invalidRegexPortal.allowSelfManageSavedLocations, false);
  assert.equal(invalidRegexPortal.defaultRequirePoForNewAccounts, false);
  assert.equal(invalidRegexPortal.poFormatRegex, undefined);
  assert.equal(invalidRegexPortal.creditLimitEnforcement, 'hard_block');

  const validRegexPortal = normalizeCorporatePortalPolicy({
    poFormatRegex: '  ^PO-[0-9]{4,10}$  ',
  });
  assert.equal(validRegexPortal.poFormatRegex, '^PO-[0-9]{4,10}$');

  // Defaults for BillingSettingsConfig
  const defaultBilling = normalizeBillingSettingsConfig(undefined);
  assert.equal(defaultBilling.payLinkExpiryHours, 72);
  assert.equal(defaultBilling.payLinkAllowTipOnTrips, true);
  assert.equal(defaultBilling.payLinkAllowTipOnInvoices, false);
  assert.equal(defaultBilling.autoSendPayLinkReceiptSms, true);
  assert.equal(defaultBilling.driverDefaultCommissionPercent, 75);
  assert.equal(defaultBilling.staffDispatcherHourlyRate, 24);
  assert.equal(defaultBilling.staffPerBookingBonusAmount, 0);

  // Clamping edge values
  const clampedLow = normalizeBillingSettingsConfig({
    payLinkExpiryHours: -5,
    driverDefaultCommissionPercent: -20,
    surchargePercent: -3,
    staffDispatcherHourlyRate: -10,
    staffPerBookingBonusAmount: -2,
    remittanceAccountLast4: '987654321',
  });
  assert.equal(clampedLow.payLinkExpiryHours, 1);
  assert.equal(clampedLow.driverDefaultCommissionPercent, 0);
  assert.equal(clampedLow.surchargePercent, 0);
  assert.equal(clampedLow.staffDispatcherHourlyRate, 0);
  assert.equal(clampedLow.staffPerBookingBonusAmount, 0);
  assert.equal(clampedLow.remittanceAccountLast4, '4321');

  const clampedHigh = normalizeBillingSettingsConfig({
    payLinkExpiryHours: 9999,
    driverDefaultCommissionPercent: 145,
    surchargePercent: 80,
    payLinkAllowTipOnTrips: false,
    payLinkAllowTipOnInvoices: true,
    staffDispatcherHourlyRate: 28.5,
    staffPerBookingBonusAmount: 2.25,
  });
  assert.equal(clampedHigh.payLinkExpiryHours, 720);
  assert.equal(clampedHigh.driverDefaultCommissionPercent, 100);
  assert.equal(clampedHigh.surchargePercent, 15);
  assert.equal(clampedHigh.payLinkAllowTipOnTrips, false);
  assert.equal(clampedHigh.payLinkAllowTipOnInvoices, true);
  assert.equal(clampedHigh.staffDispatcherHourlyRate, 28.5);
  assert.equal(clampedHigh.staffPerBookingBonusAmount, 2.25);
}

async function testPoRegexAndCreditLimitGovernance(): Promise<void> {
  console.log('2️⃣  Testing PO Format Regex & Credit Limit Enforcement (Soft Warning vs Hard Block)...');

  // Pure regex helper
  assert.equal(validatePoFormatRegex('ANYTHING', '').valid, true);
  assert.equal(validatePoFormatRegex('PO-202611', '^PO-[0-9]{4,10}$').valid, true);
  const badFmt = validatePoFormatRegex('BAD-PO', '^PO-[0-9]{4,10}$');
  assert.equal(badFmt.valid, false);
  assert.ok(badFmt.error?.includes('^PO-[0-9]{4,10}$'));

  const corpService = getCorporateAccountService();
  const corp = makeCorporateAccount();

  // Revoked PO anti-fraud detection
  const revokedRes = corpService.validateCorporatePo(corp, 'PO-202501', {
    poFormatRegex: '^PO-[0-9]{4,10}$',
  });
  assert.equal(revokedRes.valid, false);
  assert.equal(revokedRes.status, 'expired_revoked');

  // Regex format failure
  const regexFailRes = corpService.validateCorporatePo(corp, 'INV-999', {
    poFormatRegex: '^PO-[0-9]{4,10}$',
  });
  assert.equal(regexFailRes.valid, false);
  assert.equal(regexFailRes.formatError, true);

  // Valid PO matching both regex and currentPoNumber
  const validRes = corpService.validateCorporatePo(corp, 'PO-202611', {
    poFormatRegex: '^PO-[0-9]{4,10}$',
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.status, 'valid');

  // Pure credit-limit evaluator
  const underLimit = evaluateCorporateCreditLimit({
    creditLimit: 1000,
    currentBalance: 600,
    projectedFare: 250,
    enforcement: 'hard_block',
    companyName: corp.companyName,
  });
  assert.equal(underLimit.allowed, true);
  assert.equal(underLimit.isOverLimit, false);

  const softOver = evaluateCorporateCreditLimit({
    creditLimit: 1000,
    currentBalance: 850,
    projectedFare: 250,
    enforcement: 'soft_warning',
    companyName: corp.companyName,
  });
  assert.equal(softOver.allowed, true);
  assert.equal(softOver.isOverLimit, true);
  assert.equal(softOver.overageAmount, 100);
  assert.ok(softOver.warning?.includes('CREDIT LIMIT WARNING'));

  const hardOver = evaluateCorporateCreditLimit({
    creditLimit: 1000,
    currentBalance: 850,
    projectedFare: 250,
    enforcement: 'hard_block',
    companyName: corp.companyName,
  });
  assert.equal(hardOver.allowed, false);
  assert.equal(hardOver.isOverLimit, true);
  assert.equal(hardOver.overageAmount, 100);
  assert.ok(hardOver.error?.includes('CREDIT LIMIT EXCEEDED'));

  // End-to-end dispatch submission validator (`useCorporatePoVerification.ts`)
  const dispatchSoft = await validateDispatchCorporateSubmission({
    corporateAccountList: [corp],
    corporateAccount: corp.id,
    billingPo: 'PO-202611',
    allowPoOverride: false,
    projectedFare: 250,
    poFormatRegex: '^PO-[0-9]{4,10}$',
    creditLimitEnforcement: 'soft_warning',
    openBalanceOverride: 850,
  });
  assert.equal(dispatchSoft.valid, true);
  if (dispatchSoft.valid) {
    assert.equal(dispatchSoft.isOverCreditLimit, true);
    assert.ok(dispatchSoft.warning?.includes('CREDIT LIMIT WARNING'));
  }

  const dispatchHard = await validateDispatchCorporateSubmission({
    corporateAccountList: [corp],
    corporateAccount: corp.id,
    billingPo: 'PO-202611',
    allowPoOverride: false,
    projectedFare: 250,
    poFormatRegex: '^PO-[0-9]{4,10}$',
    creditLimitEnforcement: 'hard_block',
    openBalanceOverride: 850,
  });
  assert.equal(dispatchHard.valid, false);
  if (!dispatchHard.valid) {
    assert.equal(dispatchHard.isOverCreditLimit, true);
    assert.ok(dispatchHard.error.includes('CREDIT LIMIT EXCEEDED'));
  }

  const dispatchBadRegex = await validateDispatchCorporateSubmission({
    corporateAccountList: [corp],
    corporateAccount: corp.id,
    billingPo: 'WRONG-FORMAT',
    allowPoOverride: false,
    projectedFare: 50,
    poFormatRegex: '^PO-[0-9]{4,10}$',
    creditLimitEnforcement: 'soft_warning',
    openBalanceOverride: 0,
  });
  assert.equal(dispatchBadRegex.valid, false);
}

function testPayLinkPolicyDefaults(): void {
  console.log('3️⃣  Testing 1-Tap Pay Link Expiry & Tip Policies (`pay-token.util.ts`)...');

  const nowMs = Date.parse('2026-11-23T12:00:00.000Z');
  const trip = makeCompletedTrip({
    payment: { method: 'card', status: 'pending', amount: 64 },
  });
  const invoice: InvoiceRecord = {
    id: 'inv-p60-001',
    invoiceNumber: 'INV-2026-6001',
    corporateAccountId: 'corp-bayer-01',
    accountNumber: 'CORP-1001',
    customerName: 'Bayer Crop Science',
    customerEmail: 'ap@bayer.example.com',
    issuedDate: '2026-11-20',
    dueDate: '2026-12-20',
    subtotal: 240,
    discountAmount: 0,
    totalAmount: 240,
    status: 'issued',
    tripIds: ['trip-p60-001'],
    lineItems: [
      {
        tripId: 'trip-p60-001',
        date: '2026-11-20',
        description: 'Executive Airport Transfer',
        amount: 240,
      },
    ],
  };

  // Default policy: 72h expiry, allowTip=true for trips, allowTip=false for invoices
  const defaultTripLink = buildTripPayLinkProjection(trip, { nowMs });
  assert.equal(defaultTripLink.allowTip, true);
  assert.equal(defaultTripLink.expiresAt, new Date(nowMs + 72 * 3_600_000).toISOString());

  const defaultInvLink = buildInvoicePayLinkProjection(invoice, { nowMs });
  assert.equal(defaultInvLink.allowTip, false);
  assert.equal(defaultInvLink.expiresAt, new Date(nowMs + 72 * 3_600_000).toISOString());

  // Custom BillingSettingsConfig policy: 24h expiry, trip tip OFF, invoice tip ON
  const customBilling = {
    payLinkExpiryHours: 24,
    payLinkAllowTipOnTrips: false,
    payLinkAllowTipOnInvoices: true,
  };

  const customTripLink = buildTripPayLinkProjection(trip, {
    nowMs,
    billingSettings: customBilling,
  });
  assert.equal(customTripLink.allowTip, false);
  assert.equal(customTripLink.expiresAt, new Date(nowMs + 24 * 3_600_000).toISOString());

  const customInvLink = buildInvoicePayLinkProjection(invoice, {
    nowMs,
    billingSettings: customBilling,
  });
  assert.equal(customInvLink.allowTip, true);
  assert.equal(customInvLink.expiresAt, new Date(nowMs + 24 * 3_600_000).toISOString());

  // Extreme hours clamped to 1..720
  const clampedMax = resolvePayLinkPolicyDefaults('invoice', { payLinkExpiryHours: 5000 }, { nowMs });
  assert.equal(clampedMax.expiresInHours, 720);
  const clampedMin = resolvePayLinkPolicyDefaults('trip', { payLinkExpiryHours: 0 }, { nowMs });
  assert.equal(clampedMin.expiresInHours, 1);
}

async function testMultiRolePayoutsAndQuickBooksExport(): Promise<void> {
  console.log('4️⃣  Testing Pure Multi-Role Payouts Engine, GL Journal Codes & Formula-Safe CSV...');

  // Verify payouts.service.ts is 100% pure (zero React/DOM/Firebase/Node fs imports)
  const payoutsSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/core/services/payouts.service.ts'),
    'utf8'
  );
  for (const forbiddenImport of ['react', 'firebase', 'node:fs', 'window.', 'document.']) {
    assert.equal(
      payoutsSrc.includes(forbiddenImport),
      false,
      `payouts.service.ts must remain pure; found "${forbiddenImport}"`
    );
  }

  const nowMs = Date.parse('2026-11-23T18:00:00.000Z');
  const drivers = [
    { id: 'drv-101', name: 'Marcus Vance', cabNumber: '101' },
    { id: 'drv-102', name: 'Elena Rostova', cabNumber: '102' },
  ];

  const trips: Trip[] = [
    // Driver 101 Trip 1: $60 fare + $4 toll + $12 tip
    makeCompletedTrip({
      id: 'trip-1',
      assignedDriverId: 'drv-101',
      completedAt: '2026-11-21T14:00:00.000Z',
      metadata: { dispatchedBy: 'op-disp-1' },
    }),
    // Driver 101 Trip 2: $40 fare + $0 toll + $8 tip
    makeCompletedTrip({
      id: 'trip-2',
      assignedDriverId: 'drv-101',
      completedAt: '2026-11-22T10:00:00.000Z',
      pricing: {
        baseFare: 10,
        distanceMiles: 12,
        durationMinutes: 18,
        distanceRate: 30,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        tollsFee: 0,
        subtotal: 40,
        totalFare: 40,
        currency: 'USD',
      },
      payment: { method: 'card', status: 'captured', amount: 48, tipAmount: 8, tollsAmount: 0 },
      metadata: { dispatchedByEmail: 'dispatcher@chesterfieldtaxi.com' },
    }),
    // Cancelled trip — must be ignored by both driver & staff rollups
    makeCompletedTrip({
      id: 'trip-cancelled',
      status: 'cancelled',
      assignedDriverId: 'drv-101',
      completedAt: '2026-11-22T12:00:00.000Z',
      metadata: { dispatchedBy: 'op-disp-1' },
    }),
    // Out-of-window trip (60 days ago) — must be excluded from 7d window
    makeCompletedTrip({
      id: 'trip-old',
      assignedDriverId: 'drv-102',
      completedAt: '2026-09-10T12:00:00.000Z',
      scheduledPickupTime: '2026-09-10T11:30:00.000Z',
    }),
  ];

  // Existing $25 partial paid settlement for drv-101 in window
  const existingSettlements: PayoutSettlementRecord[] = [
    {
      id: 'stl-drv-partial',
      payeeType: 'driver',
      payeeId: 'drv-101',
      payeeName: 'Marcus Vance',
      payeeRoleLabel: 'Driver · Cab #101 (75%)',
      periodStart: '2026-11-16',
      periodEnd: '2026-11-23',
      tripCount: 1,
      grossAmount: 40,
      tipsOrBonusAmount: 0,
      deductionsOrPlatformFee: 10,
      adjustmentsAmount: -5,
      netPayoutAmount: 25,
      status: 'paid',
      paymentMethod: 'ach',
      referenceNumber: 'ACH-001',
      paidAt: '2026-11-22T18:00:00.000Z',
      createdAt: '2026-11-22T18:00:00.000Z',
    },
  ];

  const driverRollup = computeDriverEarningsRollup(
    trips,
    drivers,
    75,
    { preset: '7d', nowMs, settlements: existingSettlements }
  );

  const d101 = driverRollup.find((r) => r.driverId === 'drv-101');
  assert.ok(d101, 'Expected drv-101 in rollup');
  assert.equal(d101.tripCount, 2);
  assert.equal(d101.grossFares, 100); // $60 + $40
  assert.equal(d101.tips, 20); // $12 + $8 (100% pass-through)
  assert.equal(d101.tollsReimbursed, 4); // $4 (100% pass-through)
  assert.equal(d101.driverFareShare, 75); // 75% of $100
  assert.equal(d101.platformFee, 25); // 25% of $100
  assert.equal(d101.totalEarned, 99); // $75 + $20 + $4
  assert.equal(d101.alreadySettledAmount, 25);
  assert.equal(d101.netPayout, 74); // $99 - $25

  const d102 = driverRollup.find((r) => r.driverId === 'drv-102');
  assert.ok(d102);
  assert.equal(d102.tripCount, 0);
  assert.equal(d102.netPayout, 0);

  // Staff & Dispatchers preview
  const operators: OperatorUser[] = [
    {
      uid: 'op-disp-1',
      email: 'dispatcher@chesterfieldtaxi.com',
      displayName: 'Hannah Cole',
      role: 'dispatcher',
      roles: ['dispatcher'],
      status: 'active',
    },
    {
      uid: 'op-driver-only',
      email: 'driveronly@chesterfieldtaxi.com',
      displayName: 'Driver Only',
      role: 'driver',
      roles: ['driver'],
      status: 'active',
    },
  ];

  const staffPreview = computeStaffPayoutPreview(
    operators,
    trips,
    { 'op-disp-1': 40 },
    { staffDispatcherHourlyRate: 25, staffPerBookingBonusAmount: 2.5 },
    { preset: '7d', nowMs },
    { 'op-disp-1': 15 }
  );
  assert.equal(staffPreview.length, 1, 'Pure drivers should be excluded from Staff Payouts');
  assert.equal(staffPreview[0].operatorId, 'op-disp-1');
  assert.equal(staffPreview[0].hoursWorked, 40);
  assert.equal(staffPreview[0].baseWageAmount, 1000); // 40 * $25
  assert.equal(staffPreview[0].dispatchedTripsCount, 2); // matched by uid and email, cancelled excluded
  assert.equal(staffPreview[0].bookingBonusAmount, 5); // 2 * $2.50
  assert.equal(staffPreview[0].adjustmentsAmount, 15);
  assert.equal(staffPreview[0].netPayoutAmount, 1020); // $1000 + $5 + $15

  // Other Payees ('flat' | 'percent' | 'hourly')
  const affiliatePayee: PayoutPayeeRecord = {
    id: 'payee-ritz',
    name: 'Ritz-Carlton Concierge Desk',
    category: 'concierge',
    defaultRateType: 'percent',
    defaultRateValue: 10,
    isActive: true,
  };
  const pctSettlement = computeOtherPayeeSettlement(affiliatePayee, 1250, 25);
  assert.equal(pctSettlement.grossAmount, 125);
  assert.equal(pctSettlement.netPayoutAmount, 150);

  const mechanicPayee: PayoutPayeeRecord = {
    id: 'payee-mech',
    name: 'West County Fleet Garage',
    category: 'vendor',
    defaultRateType: 'hourly',
    defaultRateValue: 85,
    isActive: true,
  };
  const hourlySettlement = computeOtherPayeeSettlement(mechanicPayee, 6, 40);
  assert.equal(hourlySettlement.grossAmount, 510);
  assert.equal(hourlySettlement.netPayoutAmount, 550);

  const contractorPayee: PayoutPayeeRecord = {
    id: 'payee-sub',
    name: 'Metro Chauffeur Affiliate',
    category: 'contractor',
    defaultRateType: 'flat',
    defaultRateValue: 95,
    isActive: true,
  };
  const flatSettlement = computeOtherPayeeSettlement(contractorPayee, 3, -10);
  assert.equal(flatSettlement.grossAmount, 285);
  assert.equal(flatSettlement.netPayoutAmount, 275);

  // GL Journal Entry Mapping (`5010-DriverPayout`, `5020-StaffPayroll`, `5030-VendorAffiliatePayout`) + QuickBooks Sync
  const staffSettlementRecord: PayoutSettlementRecord = {
    id: 'stl-staff-01',
    payeeType: 'staff',
    payeeId: 'op-disp-1',
    payeeName: 'Hannah Cole',
    payeeRoleLabel: 'Dispatcher',
    periodStart: '2026-11-16',
    periodEnd: '2026-11-23',
    hoursWorked: 40,
    tripCount: 2,
    grossAmount: 1000,
    tipsOrBonusAmount: 5,
    deductionsOrPlatformFee: 0,
    adjustmentsAmount: 15,
    netPayoutAmount: 1020,
    status: 'paid',
    paymentMethod: 'payroll',
    referenceNumber: 'ADP-8821',
    paidAt: '2026-11-23T18:00:00.000Z',
    createdAt: '2026-11-23T18:00:00.000Z',
  };

  const vendorSettlementRecord: PayoutSettlementRecord = {
    id: 'stl-vendor-01',
    payeeType: 'other',
    payeeId: 'payee-ritz',
    payeeName: '=CMD|\' /C calc\'!A0 Ritz Concierge', // Formula injection test string!
    payeeRoleLabel: 'Concierge (percent)',
    periodStart: '2026-11-16',
    periodEnd: '2026-11-23',
    grossAmount: 125,
    tipsOrBonusAmount: 0,
    deductionsOrPlatformFee: 0,
    adjustmentsAmount: 25,
    netPayoutAmount: 150,
    status: 'paid',
    paymentMethod: 'check',
    referenceNumber: '+CHK-900',
    notes: '@bonus-note',
    paidAt: '2026-11-23T18:00:00.000Z',
    createdAt: '2026-11-23T18:00:00.000Z',
  };

  const drvEntry = buildPayoutLedgerEntry(existingSettlements[0], '2026-11-23');
  const staffEntry = buildPayoutLedgerEntry(staffSettlementRecord, '2026-11-23');
  const vendorEntry = buildPayoutLedgerEntry(vendorSettlementRecord, '2026-11-23');

  assert.equal(drvEntry.type, 'driver_payout');
  assert.equal(drvEntry.accountCode, '5010-DriverPayout');
  assert.equal(staffEntry.type, 'staff_payout');
  assert.equal(staffEntry.accountCode, '5020-StaffPayroll');
  assert.equal(vendorEntry.type, 'vendor_payout');
  assert.equal(vendorEntry.accountCode, '5030-VendorAffiliatePayout');

  const invService = getInvoicingService();
  await invService.recordLedgerEntry(drvEntry);
  await invService.recordLedgerEntry(staffEntry);
  await invService.recordLedgerEntry(vendorEntry);

  const iifExport = await invService.exportLedger('quickbooks_iif', '2026-11-23', '2026-11-23');
  assert.equal(iifExport.totalDebit, 1195);
  const iifAmountSum = iifExport.data
    .split(/\r?\n/)
    .filter((line) => line.startsWith('TRNS\t') || line.startsWith('SPL\t'))
    .reduce((sum, line) => sum + Number(line.split('\t')[6] || 0), 0);
  assert.equal(
    Number(iifAmountSum.toFixed(2)),
    0,
    'Every QuickBooks IIF TRNS + SPL double-entry block must sum to 0.00'
  );
  assert.ok(iifExport.data.includes('5010-DriverPayout'));
  assert.ok(iifExport.data.includes('5020-StaffPayroll'));
  assert.ok(iifExport.data.includes('5030-VendorAffiliatePayout'));
  assert.ok(iifExport.data.includes('1010-OperatingCash'));

  // Formula-safe CSV export check
  const csvExport = exportPayoutsCsv(
    [existingSettlements[0], staffSettlementRecord, vendorSettlementRecord],
    nowMs
  );
  assert.equal(csvExport.rowCount, 3);
  assert.equal(csvExport.totalNetPayout, 1195); // 25 + 1020 + 150
  assert.ok(
    csvExport.csvContent.includes(",'=CMD|"),
    'Formula-leading "=" must be neutralized via leading single quote in CSV cell'
  );
  assert.ok(
    csvExport.csvContent.includes(",'+CHK-900,"),
    'Formula-leading "+" must be neutralized via leading single quote in CSV cell'
  );
  assert.ok(
    csvExport.csvContent.includes(",'@bonus-note"),
    'Formula-leading "@" must be neutralized via leading single quote in CSV cell'
  );
}

function testArchitectureAndHygieneGuardrails(): void {
  console.log('5️⃣  Testing Phase 60 Monolith Line Ceilings, Dead Credential Removal & Hygiene...');

  // 1. Explicit monolith & sub-panel line ceilings
  const strictCeilings: Array<[string, number]> = [
    ['app/components/domain/admin/subpages/AdminCustomersSubpage.tsx', 450],
    ['app/components/domain/admin/subpages/AdminInvoicingSubpage.tsx', 400],
    ['app/components/domain/admin/invoicing/DriverPayoutsPanel.tsx', 450],
    ['app/components/domain/admin/invoicing/PayoutSettlementModal.tsx', 400],
    ['app/components/domain/admin/invoicing/BillingPolicyAndQuickBooksPanel.tsx', 400],
    ['app/components/domain/admin/invoicing/CorporateAccountsPanel.tsx', 450],
    ['app/components/domain/admin/invoicing/useAdminInvoicingActions.ts', 650],
    ['app/routes/admin.tsx', 1000],
    ['app/components/domain/admin/AdminGeneralTab.tsx', 450],
    ['app/components/domain/admin/subpages/AdminTripsSubpage.tsx', 450],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
  ];

  for (const [relPath, maxLines] of strictCeilings) {
    const absPath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absPath), true, `Expected file to exist: ${relPath}`);
    const lineCount = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < maxLines,
      `${relPath} exceeded line ceiling: ${lineCount} >= ${maxLines}`
    );
  }

  // 2. Every file under app/components/domain/admin/customers/ must be < 450 lines
  const customersDir = path.join(ROOT_DIR, 'app/components/domain/admin/customers');
  const customerFiles = collectTsFiles(customersDir);
  assert.ok(customerFiles.length >= 6, 'Expected decomposed sub-panels in admin/customers/');
  for (const file of customerFiles) {
    const lineCount = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < 450,
      `${path.relative(ROOT_DIR, file)} exceeded 450L ceiling: ${lineCount}L`
    );
  }

  // 3. Zero duplicate Stripe/Square/Twilio credential state inside DriverPayoutsPanel.tsx & useAdminInvoicingActions.ts
  const payoutsPanelSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/admin/invoicing/DriverPayoutsPanel.tsx'),
    'utf8'
  );
  const invoicingActionsSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/admin/invoicing/useAdminInvoicingActions.ts'),
    'utf8'
  );
  for (const deadToken of ['twilioSid', 'stripeSk', 'squareToken', 'twilioToken', 'stripePk']) {
    assert.equal(
      payoutsPanelSrc.includes(deadToken),
      false,
      `Duplicate credential token "${deadToken}" must not exist in DriverPayoutsPanel.tsx`
    );
    assert.equal(
      invoicingActionsSrc.includes(deadToken),
      false,
      `Duplicate credential token "${deadToken}" must not exist in useAdminInvoicingActions.ts`
    );
  }
  assert.ok(
    payoutsPanelSrc.includes('/app/admin?tab=integrations&sub=gateways'),
    'DriverPayoutsPanel.tsx should include subtle link to Comms & Integrations'
  );

  // 4. Verify Corporate Directory <-> Corporate Billing deep-links
  const corpDirSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/admin/customers/CorporateDirectoryPanel.tsx'),
    'utf8'
  );
  assert.ok(
    corpDirSrc.includes('/app/admin?tab=invoicing&sub=accounts&accountId='),
    'CorporateDirectoryPanel.tsx must deep-link to Billing & Credit (?tab=invoicing&sub=accounts&accountId=...)'
  );
  const corpBillingSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/admin/invoicing/CorporateAccountsPanel.tsx'),
    'utf8'
  );
  assert.ok(
    corpBillingSrc.includes('/app/admin?tab=customers&sub=corporate'),
    'CorporateAccountsPanel.tsx must cross-link back to Corporate Directory (?tab=customers&sub=corporate)'
  );

  // 5. Immutable files untouched
  const gitStatusImmutable = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitStatusImmutable,
    '',
    `firestore.rules and vercel.json must remain untouched, got: ${gitStatusImmutable}`
  );

  // 6. Terminology & UI hygiene scan across app/
  const appFiles = collectTsFiles(path.join(ROOT_DIR, 'app'));
  const forbiddenUiStrings = [
    'HUD Now',
    '[Avail]',
    '[En Route]',
    '[Busy]',
    '[Break]',
    '[Off]',
  ];

  for (const file of appFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const token of forbiddenUiStrings) {
      assert.equal(
        src.includes(token),
        false,
        `Forbidden string "${token}" found in ${path.relative(ROOT_DIR, file)}`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log('🚀 Running Platform Phase 60 Clients & Corporate + Billing & Payouts Suite...\n');
  testConfigNormalizers();
  await testPoRegexAndCreditLimitGovernance();
  testPayLinkPolicyDefaults();
  await testMultiRolePayoutsAndQuickBooksExport();
  testArchitectureAndHygieneGuardrails();
  console.log('\n✅ ALL PHASE 60 CLIENTS & CORPORATE + BILLING & PAYOUTS TESTS PASSED!');
}

main().catch((err) => {
  console.error('\n❌ Phase 60 test suite failed:', err);
  process.exit(1);
});
