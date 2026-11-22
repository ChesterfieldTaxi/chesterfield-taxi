/**
 * Phase 37 Verification Suite: Corporate Client Self-Service Portal (`/app/corporate`)
 *
 * Verifies:
 * 1. Workspace Routing (`workspace-routing.util.ts`):
 *    - Single-role `corporate_manager` routes directly to `/app/corporate` (no picker).
 *    - `admin` superuser accesses all 5 workspaces including `/app/corporate`.
 *    - Regular `customer` is blocked from `/app/corporate`.
 *    - Legacy `/corporate` normalizes cleanly to `/app/corporate`.
 * 2. Multi-Tenant Isolation (`CorporatePortalService`):
 *    - Company A never sees Company B's trips, invoices, or printable statements.
 *    - Defense-in-depth CSV export strips cross-tenant trips even if passed in input.
 * 3. Firestore Security Rules (`firestore.rules`):
 *    - `/users/{userId}` blocks `corporateAccountId` & `corporateAccountNumber` on self-create and self-update.
 *    - `isCorporateManagerFor(accountId)` enforces `corporate_manager` + non-null matching `corporateAccountId`.
 *    - `/corporateAccounts/{accountId}` restricts `list` to `isDispatcher()` and restricts `corporate_manager`
 *      `update` strictly to safe self-service keys (never `creditLimit`, `discountPercent`, `billingCycle`, `accountNumber`, `isActive`).
 * 4. Credit-Limit Utilization Math, CSV Expense Export & Self-Service PO Rotation Audit Trail.
 * 5. Server Auth & 1-Tap Invoice Pay Link Generation (`/api/pay` `create_link`):
 *    - `corporate_manager` receives `403` on cross-tenant invoice and `trip` targets, and `200` on own company's invoice.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CorporateAccountConfig, InvoiceRecord } from '../app/core/types/config';
import type {
  CorporateUnbilledTransaction,
  FinancialLedgerEntry,
  IInvoicingService,
} from '../app/core/types/invoicing';
import type { CreateTripInput } from '../app/core/types/trip';
import {
  canAccessWorkspacePath,
  getAccessibleWorkspaces,
  normalizeAppRedirect,
  resolvePostAuthDestination,
  shouldPromptWorkspacePicker,
} from '../app/core/utils/workspace-routing.util';
import { MockBookingService } from '../app/core/services/booking/mock-booking.service';
import { CorporateAccountService } from '../app/core/services/corporate-account.service';
import {
  CorporatePortalService,
  computeCorporateCreditMetrics,
} from '../app/core/services/corporate-portal.service';
import { resetServerPaymentLoopStoreForTests } from '../app/core/services/payments/stripe-webhook.server';
import { handlePayApiPost } from '../app/core/services/payments/pay-link.server';
import { PAY_TOKEN_PATTERN } from '../app/core/utils/pay-token.util';
import type { VerifiedServerAuth } from '../app/core/services/auth/server-auth.server';

let passed = 0;
let total = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${label}`);
  } else {
    console.error(`  ❌ [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

class ScopedInvoicingHarness implements IInvoicingService {
  public invoices = new Map<string, InvoiceRecord>();
  public unbilledTxs: CorporateUnbilledTransaction[] = [];
  public ledger: FinancialLedgerEntry[] = [];

  async getPrintableInvoice() {
    return null;
  }
  async generateBatchInvoiceForCorporate() {
    return null;
  }
  async generateInvoiceFromUnbilled() {
    return null;
  }
  async handleCorporateTripCompleted() {
    return null;
  }
  async getUnbilledTransactions(corporateAccountId?: string) {
    if (corporateAccountId) {
      return this.unbilledTxs.filter((t) => t.corporateAccountId === corporateAccountId);
    }
    return this.unbilledTxs;
  }
  async getInvoices(): Promise<InvoiceRecord[]> {
    return Array.from(this.invoices.values());
  }
  async saveInvoice(invoice: InvoiceRecord): Promise<InvoiceRecord> {
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }
  async getCorporateAccountBalance(corporateAccountId: string): Promise<number> {
    return this.unbilledTxs
      .filter((t) => t.corporateAccountId === corporateAccountId && t.status === 'unbilled')
      .reduce((sum, t) => sum + t.totalAmount, 0);
  }
  async settleUnbilledTransactions(): Promise<void> {}
  async markInvoicePaid(invoiceId: string): Promise<InvoiceRecord | null> {
    const inv = this.invoices.get(invoiceId);
    if (!inv) return null;
    const next: InvoiceRecord = { ...inv, status: 'paid', paidDate: '2026-11-21' };
    this.invoices.set(invoiceId, next);
    return next;
  }
  async recordLedgerEntry(
    entry: Omit<FinancialLedgerEntry, 'id' | 'createdAt'>
  ): Promise<FinancialLedgerEntry> {
    const rec: FinancialLedgerEntry = {
      ...entry,
      id: `ledg-${this.ledger.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    this.ledger.push(rec);
    return rec;
  }
  async getLedgerEntries(): Promise<FinancialLedgerEntry[]> {
    return this.ledger;
  }
  async exportLedger() {
    return {
      fileName: 'test.csv',
      mimeType: 'text/csv',
      data: '',
      recordCount: 0,
      totalDebit: 0,
      totalCredit: 0,
      generatedAt: new Date().toISOString(),
    };
  }
}

async function runTests() {
  console.log('\n======================================================================');
  console.log('🏢 PHASE 37 VERIFICATION: CORPORATE CLIENT SELF-SERVICE PORTAL');
  console.log('======================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Workspace Routing & Access Guards
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Workspace Routing & RBAC Access Guards (`workspace-routing.util.ts`)');

  const corpManagerUser = {
    uid: 'uid-corp-mgr-1',
    roles: ['corporate_manager' as const],
  };
  const adminUser = {
    uid: 'uid-admin-1',
    roles: ['admin' as const],
  };
  const customerUser = {
    uid: 'uid-cust-1',
    roles: ['customer' as const],
  };

  const corpWorkspaces = getAccessibleWorkspaces(corpManagerUser);
  assert(
    corpWorkspaces.length === 1 && corpWorkspaces[0].id === 'corporate',
    'Single-role corporate_manager unlocks strictly 1 workspace (corporate)'
  );
  assert(
    !shouldPromptWorkspacePicker(corpManagerUser),
    'Single-role corporate_manager bypasses /app workspace picker'
  );
  assert(
    resolvePostAuthDestination(corpManagerUser) === '/app/corporate',
    'Single-role corporate_manager routes directly to /app/corporate on login'
  );
  assert(
    !canAccessWorkspacePath('/app/admin', corpManagerUser) &&
      !canAccessWorkspacePath('/app/dispatch', corpManagerUser) &&
      canAccessWorkspacePath('/app/corporate', corpManagerUser),
    'corporate_manager can access /app/corporate and is blocked from /app/admin & /app/dispatch'
  );

  const adminWorkspaces = getAccessibleWorkspaces(adminUser);
  assert(
    adminWorkspaces.length === 5 &&
      adminWorkspaces.some((w) => w.id === 'corporate' && w.path === '/app/corporate'),
    'Admin superuser accesses all 5 workspaces including /app/corporate'
  );

  assert(
    !canAccessWorkspacePath('/app/corporate', customerUser),
    'Regular customer is blocked from accessing /app/corporate'
  );
  assert(
    resolvePostAuthDestination(customerUser, { rawRedirect: '/app/corporate' }) ===
      '/app/passenger',
    'Regular customer attempting redirect=/app/corporate is safely routed to /app/passenger'
  );
  assert(
    normalizeAppRedirect('/corporate?tab=billing') === '/app/corporate?tab=billing',
    'Legacy /corporate redirect normalizes to /app/corporate preserving query params'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Firestore Security Rules Static Verification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n2️⃣  Firestore Multi-Tenant Security Rules (`firestore.rules`)');

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  assert(
    rulesText.includes('function isCorporateManagerFor(accountId)') &&
      rulesText.includes("hasUserRole('corporate_manager')") &&
      rulesText.includes('getUserData().corporateAccountId != null') &&
      rulesText.includes('getUserData().corporateAccountId == accountId'),
    'firestore.rules defines isCorporateManagerFor(accountId) with non-null tenant equality check'
  );

  const usersSection = rulesText.slice(
    rulesText.indexOf('match /users/{userId}'),
    rulesText.indexOf('match /trips/{tripId}')
  );
  assert(
    usersSection.includes("!('corporateAccountId' in request.resource.data)") &&
      usersSection.includes("!('corporateAccountNumber' in request.resource.data)"),
    '/users/{userId} allow create blocks self-binding corporateAccountId & corporateAccountNumber'
  );
  assert(
    usersSection.includes("'corporateAccountId'") &&
      usersSection.includes("'corporateAccountNumber'") &&
      usersSection.includes('affectedKeys().hasAny(['),
    '/users/{userId} allow update forbids self-mutation of corporateAccountId & corporateAccountNumber'
  );

  const corpAcctSection = rulesText.slice(
    rulesText.indexOf('match /corporateAccounts/{accountId}'),
    rulesText.indexOf('match /corporateLookup/{lookupKey}')
  );
  assert(
    corpAcctSection.includes('allow get: if isDispatcher() || isCorporateManagerFor(accountId);') &&
      corpAcctSection.includes('allow list: if isDispatcher();'),
    '/corporateAccounts/{accountId} allows get for corporate_manager of that account and restricts list to isDispatcher()'
  );

  const hasOnlyMatch = corpAcctSection.match(/hasOnly\(\[([\s\S]*?)\]\)/);
  const allowedSelfServiceKeysRaw = hasOnlyMatch ? hasOnlyMatch[1] : '';
  for (const forbiddenKey of [
    'creditLimit',
    'discountPercent',
    'billingCycle',
    'accountNumber',
    'isActive',
    'poRequired',
  ]) {
    assert(
      !allowedSelfServiceKeysRaw.includes(`'${forbiddenKey}'`),
      `/corporateAccounts/{accountId} corporate_manager update blocks mutation of '${forbiddenKey}'`
    );
  }

  assert(
    rulesText.includes('isCorporateManagerFor(request.resource.data.corporateAccountId)') &&
      rulesText.includes('isCorporateManagerFor(resource.data.corporateAccountId)'),
    '/trips/{tripId} & /invoices/{invoiceId} enforce isCorporateManagerFor(...) tenant isolation'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Multi-Tenant Isolation, Credit Utilization Math, CSV & PO Rotation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n3️⃣  Multi-Tenant Service Isolation, Credit Utilization, CSV & PO Rotation');

  const companyA: CorporateAccountConfig = {
    id: 'corp-alpha',
    companyName: 'Alpha BioTech St. Louis',
    accountNumber: 'CORP-ALPHA-100',
    billingCycle: 'net30',
    creditLimit: 10000,
    billingContactName: 'Alice Mercer',
    billingContactEmail: 'ap@alphabiotech.example.com',
    discountPercent: 0,
    poRequired: true,
    currentPoNumber: 'PO-ALB-111222',
    poGeneratedAt: '2026-11-01T08:00:00.000Z',
    poNumberHistory: [],
    isActive: true,
    authorizedBookers: ['ap@alphabiotech.example.com'],
    authorizedRiders: [
      {
        id: 'r-alpha-1',
        name: 'Dr. Alan Grant',
        email: 'alan@alphabiotech.example.com',
        phone: '(314) 555-0101',
        department: 'GENOMICS-01',
        isVip: true,
      },
    ],
    costCenters: ['GENOMICS-01', 'EXEC-TRAVEL'],
    savedCompanyLocations: [
      {
        id: 'loc-alpha-hq',
        label: 'Alpha HQ Chesterfield',
        address: '400 Chesterfield Pkwy W, Chesterfield, MO 63017',
      },
    ],
  };

  const companyB: CorporateAccountConfig = {
    id: 'corp-beta',
    companyName: 'Beta Logistics Group',
    accountNumber: 'CORP-BETA-200',
    billingCycle: 'net15',
    creditLimit: 5000,
    billingContactName: 'Bob Vance',
    billingContactEmail: 'billing@betalogistics.example.com',
    discountPercent: 0,
    poRequired: true,
    currentPoNumber: 'PO-BLG-999888',
    poGeneratedAt: '2026-11-01T08:00:00.000Z',
    poNumberHistory: [],
    isActive: true,
  };

  const bookingSvc = new MockBookingService();
  const invoicingSvc = new ScopedInvoicingHarness();
  const corpAcctSvc = new CorporateAccountService();

  const makeTripInput = (overrides: Partial<CreateTripInput>): CreateTripInput => ({
    pickupLocation: { address: '400 Chesterfield Pkwy W, Chesterfield, MO 63017' },
    dropoffLocation: { address: '10701 Lambert International Blvd, St. Louis, MO 63145' },
    bookingType: 'scheduled',
    scheduledPickupTime: new Date().toISOString(),
    vehicleTier: 'premium',
    passenger: {
      firstName: 'Alan',
      lastName: 'Grant',
      email: 'alan@alphabiotech.example.com',
      phone: '+13145550101',
      passengerCount: 1,
      luggageCount: 1,
    },
    pricing: {
      baseFare: 65,
      distanceMiles: 18,
      durationMinutes: 24,
      distanceRate: 2.5,
      timeRate: 0,
      vehicleMultiplier: 1.2,
      surgeMultiplier: 1,
      discountAmount: 0,
      subtotal: 120,
      totalFare: 120,
      currency: 'USD',
    },
    payment: {
      method: 'corporate',
      status: 'pending_invoice',
      amount: 120,
    },
    ...overrides,
  });

  // Company A: 1 completed unbilled ride ($250), 1 completed ALREADY-INVOICED ride ($400), 1 live upcoming ride ($180)
  const tripAUnbilled = await bookingSvc.createBooking(
    makeTripInput({
      id: 'CT-ALPHA-UNBILLED',
      corporateAccountId: 'corp-alpha',
      pricing: { ...makeTripInput({}).pricing, subtotal: 250, totalFare: 250 },
      payment: { method: 'corporate', status: 'pending_invoice', amount: 250, corporateAccountId: 'corp-alpha' },
      metadata: {
        corporateAccountId: 'corp-alpha',
        billingPo: 'PO-ALB-111222',
        costCenter: 'GENOMICS-01',
      },
    })
  );
  await bookingSvc.updateTrip!(tripAUnbilled.id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  const tripAInvoiced = await bookingSvc.createBooking(
    makeTripInput({
      id: 'CT-ALPHA-INVOICED',
      corporateAccountId: 'corp-alpha',
      pricing: { ...makeTripInput({}).pricing, subtotal: 400, totalFare: 400 },
      payment: { method: 'corporate', status: 'invoiced', amount: 400, corporateAccountId: 'corp-alpha' },
      metadata: { corporateAccountId: 'corp-alpha', billingPo: 'PO-ALB-111222' },
    })
  );
  await bookingSvc.updateTrip!(tripAInvoiced.id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  const tripALive = await bookingSvc.createBooking(
    makeTripInput({
      id: 'CT-ALPHA-LIVE',
      corporateAccountId: 'corp-alpha',
      passenger: {
        firstName: '=CMD("calc")', // Formula injection test payload
        lastName: 'Exec',
        email: 'exec@alphabiotech.example.com',
        phone: '+13145550102',
        passengerCount: 2,
        luggageCount: 2,
      },
      pricing: { ...makeTripInput({}).pricing, subtotal: 180, totalFare: 180 },
      payment: { method: 'corporate', status: 'pending', amount: 180, corporateAccountId: 'corp-alpha' },
      metadata: { corporateAccountId: 'corp-alpha', billingPo: 'PO-ALB-111222', costCenter: 'EXEC-TRAVEL' },
    })
  );

  // Company B: 1 ride ($999) + Retail Customer: 1 ride ($55)
  const tripB = await bookingSvc.createBooking(
    makeTripInput({
      id: 'CT-BETA-SECRET',
      corporateAccountId: 'corp-beta',
      pricing: { ...makeTripInput({}).pricing, subtotal: 999, totalFare: 999 },
      payment: { method: 'corporate', status: 'pending_invoice', amount: 999, corporateAccountId: 'corp-beta' },
      metadata: { corporateAccountId: 'corp-beta', billingPo: 'PO-BLG-999888' },
    })
  );
  await bookingSvc.createBooking(
    makeTripInput({
      id: 'CT-RETAIL-GUEST',
      payment: { method: 'card', status: 'captured', amount: 55 },
    })
  );

  // Invoices for Company A ($2,250 open issued + $500 already paid) & Company B ($1,800 open issued)
  const invAlphaOpen: InvoiceRecord = {
    id: 'inv-alpha-open',
    invoiceNumber: 'INV-2026-1001',
    corporateAccountId: 'corp-alpha',
    accountNumber: 'CORP-ALPHA-100',
    billingCycle: 'net30',
    customerName: 'Alpha BioTech St. Louis',
    customerEmail: 'ap@alphabiotech.example.com',
    tripIds: ['CT-ALPHA-INVOICED'],
    totalAmount: 2250,
    status: 'issued',
    issuedDate: '2026-11-01',
    dueDate: '2026-12-01',
    lineItems: [{ tripId: 'CT-ALPHA-INVOICED', description: 'Executive Transfers', amount: 2250 }],
  };
  const invAlphaPaid: InvoiceRecord = {
    id: 'inv-alpha-paid',
    invoiceNumber: 'INV-2026-0950',
    corporateAccountId: 'corp-alpha',
    accountNumber: 'CORP-ALPHA-100',
    customerName: 'Alpha BioTech St. Louis',
    customerEmail: 'ap@alphabiotech.example.com',
    tripIds: [],
    totalAmount: 500,
    status: 'paid',
    issuedDate: '2026-10-01',
    dueDate: '2026-10-31',
    paidDate: '2026-10-20',
    lineItems: [{ description: 'Prior Month Transfers', amount: 500 }],
  };
  const invBetaOpen: InvoiceRecord = {
    id: 'inv-beta-open',
    invoiceNumber: 'INV-2026-2001',
    corporateAccountId: 'corp-beta',
    accountNumber: 'CORP-BETA-200',
    billingCycle: 'net15',
    customerName: 'Beta Logistics Group',
    customerEmail: 'billing@betalogistics.example.com',
    tripIds: ['CT-BETA-SECRET'],
    totalAmount: 1800,
    status: 'issued',
    issuedDate: '2026-11-10',
    dueDate: '2026-11-25',
    lineItems: [{ tripId: 'CT-BETA-SECRET', description: 'Beta Logistics Runs', amount: 1800 }],
  };

  await invoicingSvc.saveInvoice(invAlphaOpen);
  await invoicingSvc.saveInvoice(invAlphaPaid);
  await invoicingSvc.saveInvoice(invBetaOpen);

  const portalSvc = new CorporatePortalService({
    accounts: [companyA, companyB],
    bookingService: bookingSvc,
    invoicingService: invoicingSvc,
    corporateAccountService: corpAcctSvc,
  });

  const alphaTrips = await portalSvc.getCorporateTrips('corp-alpha');
  assert(
    alphaTrips.length === 3 &&
      alphaTrips.every((t) => t.corporateAccountId === 'corp-alpha') &&
      !alphaTrips.some((t) => t.id === 'CT-BETA-SECRET' || t.id === 'CT-RETAIL-GUEST'),
    'getCorporateTrips("corp-alpha") returns strictly Company A trips (zero leakage from Company B or retail)'
  );

  const betaTrips = await portalSvc.getCorporateTrips('corp-beta');
  assert(
    betaTrips.length === 1 && betaTrips[0].id === 'CT-BETA-SECRET',
    'getCorporateTrips("corp-beta") returns strictly Company B trips'
  );

  const alphaInvoices = await portalSvc.getCorporateInvoices('corp-alpha');
  assert(
    alphaInvoices.length === 2 && !alphaInvoices.some((i) => i.id === 'inv-beta-open'),
    'getCorporateInvoices("corp-alpha") returns strictly Company A statements'
  );

  const crossTenantStatement = await portalSvc.getCorporatePrintableInvoice(
    'corp-alpha',
    'inv-beta-open'
  );
  assert(
    crossTenantStatement === null,
    'getCorporatePrintableInvoice("corp-alpha", "inv-beta-open") blocks cross-tenant statement access'
  );

  // Credit Limit Utilization Math:
  // openInvoiceBalance = $2,250 (invAlphaPaid $500 excluded), unbilledSpend = $250 (CT-ALPHA-INVOICED $400 excluded!)
  // totalExposure = $2,500 / $10,000 creditLimit => 25.0% utilization, availableCredit = $7,500
  const alphaSummary = await portalSvc.getCorporateDashboardSummary('corp-alpha');
  assert(
    alphaSummary.openInvoiceBalance === 2250 &&
      alphaSummary.unbilledSpend === 250 &&
      alphaSummary.totalExposure === 2500 &&
      alphaSummary.availableCredit === 7500 &&
      alphaSummary.creditUtilizationPercent === 25.0,
    'getCorporateDashboardSummary computes exact credit utilization ((2250 + 250) / 10000 = 25.0%) without double-counting invoiced trips'
  );
  assert(
    alphaSummary.activeRides.length === 1 && alphaSummary.activeRides[0].id === tripALive.id,
    'getCorporateDashboardSummary identifies active/upcoming company rides accurately'
  );

  const criticalMetrics = computeCorporateCreditMetrics({
    openInvoiceBalance: 7200,
    unbilledSpend: 1800,
    creditLimit: 10000,
  });
  assert(
    criticalMetrics.creditUtilizationPercent === 90 &&
      criticalMetrics.utilizationLevel === 'critical',
    'computeCorporateCreditMetrics classifies >= 85% utilization as critical'
  );

  // CSV Expense Export Formatting + Cross-Tenant Defense-in-Depth + Formula Injection Neutralization
  const csvExport = portalSvc.exportCorporateTripsCsv([...alphaTrips, tripB], companyA);
  const csvLines = csvExport.csvContent.split('\n');
  assert(
    csvLines[0] ===
      'Date,Trip ID,Traveler,Department/Cost Center,PO #,Pickup,Dropoff,Fare,Status',
    'exportCorporateTripsCsv outputs exact B2B accounting column headers'
  );
  assert(
    csvExport.rowCount === 3 && !csvExport.csvContent.includes('CT-BETA-SECRET'),
    'exportCorporateTripsCsv strips cross-tenant trips even if passed in input array'
  );
  assert(
    csvExport.csvContent.includes("'=CMD(\"\"calc\"\") Exec") &&
      csvExport.csvContent.includes('"400 Chesterfield Pkwy W, Chesterfield, MO 63017"'),
    'exportCorporateTripsCsv quotes commas per RFC 4180 and neutralizes spreadsheet formula injection'
  );

  // Team / Locations Update & Tamper Resistance
  const updatedAlpha = await portalSvc.updateCorporateTeamAndSettings('corp-alpha', {
    costCenters: ['GENOMICS-01', 'EXEC-TRAVEL', 'LAB-OPS'],
    ...({ creditLimit: 999999, discountPercent: 99, accountNumber: 'HACKED' } as any),
  });
  assert(
    Boolean(updatedAlpha.costCenters?.includes('LAB-OPS')) &&
      updatedAlpha.creditLimit === 10000 &&
      updatedAlpha.discountPercent === 0 &&
      updatedAlpha.accountNumber === 'CORP-ALPHA-100',
    'updateCorporateTeamAndSettings updates costCenters while preserving immutable creditLimit, discountPercent & accountNumber'
  );

  // Self-Service Anti-Fraud PO Rotation
  const poRotation = await portalSvc.rotateCorporatePoSelfService(
    'corp-alpha',
    'Former travel coordinator offboarded',
    'alice@alphabiotech.example.com'
  );
  assert(
    poRotation.oldPo === 'PO-ALB-111222' &&
      poRotation.newPo.startsWith('PO-') &&
      poRotation.newPo !== 'PO-ALB-111222' &&
      poRotation.account.poNumberHistory?.[0]?.poNumber === 'PO-ALB-111222' &&
      poRotation.account.poNumberHistory?.[0]?.rotatedBy === 'alice@alphabiotech.example.com',
    'rotateCorporatePoSelfService generates new active PO and records revoked PO in poNumberHistory audit trail'
  );

  const oldPoCheck = corpAcctSvc.validateCorporatePo(poRotation.account, 'PO-ALB-111222');
  const newPoCheck = corpAcctSvc.validateCorporatePo(poRotation.account, poRotation.newPo);
  assert(
    !oldPoCheck.valid &&
      oldPoCheck.status === 'expired_revoked' &&
      newPoCheck.valid &&
      newPoCheck.status === 'valid',
    'Rotated PO is immediately flagged as expired_revoked (anti-fraud) while new PO validates cleanly'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Corporate Manager Invoice 1-Tap Pay Link Generation (`POST /api/pay`)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n4️⃣  Corporate Manager 1-Tap Invoice Pay Link Isolation (`POST /api/pay`)');

  resetServerPaymentLoopStoreForTests();

  const alphaManagerAuth: VerifiedServerAuth = {
    authenticated: true,
    isAdminSecret: false,
    uid: 'uid-alpha-mgr',
    email: 'ap@alphabiotech.example.com',
    roles: ['corporate_manager'],
    isAdmin: false,
    isDispatcher: false,
    isDriver: false,
    isCorporateManager: true,
    corporateAccountId: 'corp-alpha',
    corporateAccountNumber: 'CORP-ALPHA-100',
  };

  const unboundManagerAuth: VerifiedServerAuth = {
    ...alphaManagerAuth,
    uid: 'uid-unbound-mgr',
    corporateAccountId: undefined,
  };

  // 4a. Cross-tenant invoice -> MUST return 403
  const crossTenantReq = new Request('https://chesterfieldtaxi.com/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_link',
      targetType: 'invoice',
      targetId: 'inv-beta-open',
    }),
  });
  const crossTenantResp = await handlePayApiPost(crossTenantReq, {
    authOverride: alphaManagerAuth,
    invoicingService: invoicingSvc,
    bookingService: bookingSvc,
  });
  assert(
    crossTenantResp.status === 403,
    'POST /api/pay create_link rejects cross-tenant invoice request from corporate_manager with 403',
    `Got status ${crossTenantResp.status}`
  );

  // 4b. Trip target by corporate_manager -> MUST return 403
  const tripTargetReq = new Request('https://chesterfieldtaxi.com/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_link',
      targetType: 'trip',
      targetId: tripALive.id,
    }),
  });
  const tripTargetResp = await handlePayApiPost(tripTargetReq, {
    authOverride: alphaManagerAuth,
    invoicingService: invoicingSvc,
    bookingService: bookingSvc,
  });
  assert(
    tripTargetResp.status === 403,
    'POST /api/pay create_link rejects non-invoice (trip) pay link creation by corporate_manager with 403'
  );

  // 4c. Unbound corporate_manager -> MUST return 403
  const unboundReq = new Request('https://chesterfieldtaxi.com/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_link',
      targetType: 'invoice',
      targetId: 'inv-alpha-open',
    }),
  });
  const unboundResp = await handlePayApiPost(unboundReq, {
    authOverride: unboundManagerAuth,
    invoicingService: invoicingSvc,
    bookingService: bookingSvc,
  });
  assert(
    unboundResp.status === 403,
    'POST /api/pay create_link rejects corporate_manager missing corporateAccountId with 403'
  );

  // 4d. Own company's invoice -> MUST succeed with 200 & valid pay_... token
  const ownInvoiceReq = new Request('https://chesterfieldtaxi.com/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_link',
      targetType: 'invoice',
      targetId: 'inv-alpha-open',
    }),
  });
  const ownInvoiceResp = await handlePayApiPost(ownInvoiceReq, {
    authOverride: alphaManagerAuth,
    invoicingService: invoicingSvc,
    bookingService: bookingSvc,
  });
  const ownInvoiceJson = (await ownInvoiceResp.json()) as any;
  assert(
    ownInvoiceResp.status === 200 &&
      ownInvoiceJson.success === true &&
      PAY_TOKEN_PATTERN.test(String(ownInvoiceJson.payToken || '')) &&
      ownInvoiceJson.payLink?.baseAmount === 2250 &&
      ownInvoiceJson.payLink?.allowTip === false,
    'POST /api/pay create_link returns 200 + zero-PII pay_... token for corporate_manager own company invoice'
  );

  console.log('\n======================================================================');
  console.log(`🎉 ALL ${passed}/${total} PHASE 37 CORPORATE PORTAL ASSERTIONS PASSED!`);
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('\n💥 Phase 37 Verification Suite Failed:', err);
  process.exit(1);
});
