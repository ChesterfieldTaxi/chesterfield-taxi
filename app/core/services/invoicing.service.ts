/**
 * B2B Invoicing & Accounting Ledger Sync Service
 *
 * Production-grade corporate AR queue, single-discount invariant billing,
 * Firestore persistence (`unbilledTransactions`, `invoices`, `financialLedger`),
 * printable invoice data with real trip snapshots, and balanced double-entry
 * QuickBooks CSV / IIF / JSON exports.
 */

import type {
  FinancialLedgerEntry,
  AccountingExportFormat,
  AccountingSyncExport,
  PrintableInvoiceData,
  IInvoicingService,
  LedgerEntryType,
  CorporateUnbilledTransaction,
} from '../types/invoicing';
import type {
  InvoiceRecord,
  InvoiceLineItemRecord,
  CorporateAccountConfig,
  AppSettings,
} from '../types/config';
import type { Trip } from '../types/trip';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { sanitizePayload } from './firestore-sanitizer';
import { getAdminConfigService } from './config/admin-config.service';
import { formatLocalDateStr } from './pricing/vehicle-matching';

const LEDGER_STORAGE_KEY = 'ct_financial_ledger_entries';
const UNBILLED_STORAGE_KEY = 'ct_corporate_unbilled_transactions';
const INVOICES_STORAGE_KEY = 'ct_corporate_invoices_cache';

const INITIAL_DEMO_UNBILLED_TRANSACTIONS: CorporateUnbilledTransaction[] = [
  {
    id: 'unb-demo-101',
    tripId: 'tr-demo-8840',
    corporateAccountId: 'corp-1',
    corporateAccountName: 'Demo Corporate Partner',
    accountNumber: 'CORP-DEMO-01',
    passengerName: 'Demo Executive',
    passengerPhone: '(314) 555-0192',
    pickupDate: '2026-09-14',
    pickupAddress: '100 Chesterfield Business Pkwy, Chesterfield, MO',
    dropoffAddress: 'Lambert STL Terminal 1, St. Louis, MO',
    baseFare: 85.0,
    gratuity: 15.0,
    tolls: 5.0,
    waitTimeFee: 0.0,
    discountAmount: 8.5,
    discountAlreadyApplied: false,
    totalAmount: 96.5,
    status: 'unbilled',
    createdAt: '2026-09-14T11:20:00.000Z',
  },
];

const INITIAL_DEMO_LEDGER_ENTRIES: FinancialLedgerEntry[] = [];

/**
 * Pure helper: computes invoice due date from issued date & billing cycle.
 */
export function computeInvoiceDueDate(
  issuedDateIso: string,
  billingCycle?: CorporateAccountConfig['billingCycle']
): string {
  const daysMap: Record<string, number> = {
    immediate: 0,
    net15: 15,
    net30: 30,
    net60: 60,
  };
  const offsetDays = billingCycle ? (daysMap[billingCycle] ?? 30) : 30;
  const baseMs = new Date(`${issuedDateIso}T12:00:00Z`).getTime();
  const safeBaseMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(safeBaseMs + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pure helper: computes corporate billing amounts with strict single-discount
 * enforcement and pass-through protection for tolls & gratuity (never discounted).
 */
export function calculateCorporateTransactionAmounts(
  trip: Trip,
  corporateAccount?: CorporateAccountConfig
): {
  baseFare: number;
  waitTimeFee: number;
  tolls: number;
  gratuity: number;
  discountAmount: number;
  discountAlreadyApplied: boolean;
  totalAmount: number;
} {
  const driverTollSum = (trip.pricing?.driverExtras || [])
    .filter((ex) => ex.category === 'toll')
    .reduce((sum, ex) => sum + Number(ex.amount || 0), 0);

  const tollsInPricing = Number(
    Math.max(driverTollSum, Number(trip.pricing?.tollsFee || 0)).toFixed(2)
  );
  const paymentTolls = Number(trip.payment?.tollsAmount || 0);
  const tolls = Number(Math.max(tollsInPricing, paymentTolls).toFixed(2));
  const uncapturedTollsDelta = Math.max(0, Number((paymentTolls - tollsInPricing).toFixed(2)));

  const waitInPricing = Number(trip.pricing?.delayFee || 0);
  const paymentWait = Number(trip.payment?.waitTimeAmount || 0);
  const waitTimeFee = Number(Math.max(waitInPricing, paymentWait).toFixed(2));
  const uncapturedWaitDelta = Math.max(0, Number((paymentWait - waitInPricing).toFixed(2)));

  const gratuity = Math.max(0, Number((trip.payment?.tipAmount || 0).toFixed(2)));

  const rawPricingTotal = Number(trip.pricing?.totalFare ?? trip.pricing?.subtotal ?? 0);
  const rideTotalBeforeTip = Number(
    Math.max(0, rawPricingTotal + uncapturedTollsDelta + uncapturedWaitDelta).toFixed(2)
  );

  // Detect if a corporate/promo discount was ALREADY applied during quoting
  const existingDiscount = Math.max(0, Number(trip.pricing?.discountAmount || 0));
  const hasBreakdownDiscount = Boolean(
    trip.pricing?.breakdown?.some((item) => item.category === 'discount' && item.amount < 0)
  );
  const discountAlreadyApplied = existingDiscount > 0 || hasBreakdownDiscount;

  // Discountable base excludes pass-through tolls and tips
  const discountableBase = Math.max(0, Number((rideTotalBeforeTip - tolls).toFixed(2)));

  let discountAmount = 0;
  let netRideSubtotal = rideTotalBeforeTip;

  if (discountAlreadyApplied) {
    // Preserve recorded discount for reporting, NEVER subtract a second time
    discountAmount =
      existingDiscount > 0
        ? existingDiscount
        : Number(
            (trip.pricing?.breakdown || [])
              .filter((item) => item.category === 'discount' && item.amount < 0)
              .reduce((sum, item) => sum + Math.abs(item.amount), 0)
              .toFixed(2)
          );
    netRideSubtotal = rideTotalBeforeTip;
  } else {
    const discountPercent = Math.max(0, Math.min(100, Number(corporateAccount?.discountPercent || 0)));
    if (discountPercent > 0 && discountableBase > 0) {
      discountAmount = Number(((discountableBase * discountPercent) / 100).toFixed(2));
      netRideSubtotal = Number(Math.max(0, rideTotalBeforeTip - discountAmount).toFixed(2));
    }
  }

  const baseFare = Math.max(0, Number((rideTotalBeforeTip - tolls - waitTimeFee).toFixed(2)));
  const totalAmount = Number((netRideSubtotal + gratuity).toFixed(2));

  return {
    baseFare,
    waitTimeFee,
    tolls,
    gratuity,
    discountAmount,
    discountAlreadyApplied,
    totalAmount,
  };
}

/**
 * Resolves the balancing double-entry offset GL account for QuickBooks IIF exports.
 */
function resolveOffsetAccountCode(entry: FinancialLedgerEntry): string {
  switch (entry.type) {
    case 'fare_revenue':
      return entry.accountCode === '1200-AccountsReceivable'
        ? '4010-FareRevenue'
        : '1010-OperatingCash';
    case 'invoice_settlement':
      return '1200-AccountsReceivable';
    case 'platform_commission':
      return entry.accountCode === '1250-DriverCommissionReceivable'
        ? '4020-PlatformCommission'
        : '1010-OperatingCash';
    case 'driver_payout':
      return '1010-OperatingCash';
    case 'tip_collected':
      return '1010-OperatingCash';
    case 'toll_reimbursement':
      return '1010-OperatingCash';
    case 'cancellation_fee':
      return '1010-OperatingCash';
    case 'refund':
      return '1010-OperatingCash';
    default:
      return '1010-OperatingCash';
  }
}

/**
 * Pure helper: builds balanced double-entry QuickBooks IIF journal blocks.
 * Every TRNS + SPL pair strictly sums to 0.00!
 */
export function buildQuickBooksIifJournal(
  entries: FinancialLedgerEntry[],
  companyName: string = COMPANY_CONFIG.name
): string {
  const iifHeader = [
    '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO',
    '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO',
    '!ENDTRNS',
  ].join('\n');

  const safeCompany = companyName.replace(/[\t\r\n]+/g, ' ').trim();

  const blocks = entries.map((e) => {
    const safeDesc = (e.description || '').replace(/[\t\r\n]+/g, ' ').trim();
    const isDebitPrimary =
      e.type === 'driver_payout' ||
      e.type === 'refund' ||
      e.type === 'invoice_settlement' ||
      e.accountCode.startsWith('1');
    const trnsAmount = isDebitPrimary ? e.amount.toFixed(2) : (-Math.abs(e.amount)).toFixed(2);
    const splAmount = isDebitPrimary ? (-Math.abs(e.amount)).toFixed(2) : Math.abs(e.amount).toFixed(2);
    const offsetAcct = resolveOffsetAccountCode(e);

    return [
      `TRNS\t${e.id}\tGENERAL JOURNAL\t${e.date}\t${e.accountCode}\t${safeCompany}\t${trnsAmount}\t${safeDesc}`,
      `SPL\t${e.id}-OFF\tGENERAL JOURNAL\t${e.date}\t${offsetAcct}\t${safeCompany}\t${splAmount}\tOffset: ${safeDesc}`,
      'ENDTRNS',
    ].join('\n');
  });

  return [iifHeader, ...blocks].join('\n');
}

class InvoicingService implements IInvoicingService {
  private ledgerEntries: FinancialLedgerEntry[] = [];
  private unbilledTransactions: CorporateUnbilledTransaction[] = [];
  private invoicesCache: InvoiceRecord[] = [];

  constructor() {
    this.hydrateLocalCaches();
  }

  private getSafeSettings(): AppSettings {
    return getAdminConfigService().getCachedSettings();
  }

  private hydrateLocalCaches() {
    if (typeof window === 'undefined') {
      if (!isFirebaseConfigured()) {
        this.ledgerEntries = [...INITIAL_DEMO_LEDGER_ENTRIES];
        this.unbilledTransactions = [...INITIAL_DEMO_UNBILLED_TRANSACTIONS];
      }
      return;
    }

    const useDemoFallback = !isFirebaseConfigured();

    try {
      const storedLedger = localStorage.getItem(LEDGER_STORAGE_KEY);
      if (storedLedger) {
        this.ledgerEntries = JSON.parse(storedLedger);
      } else if (useDemoFallback) {
        this.ledgerEntries = [...INITIAL_DEMO_LEDGER_ENTRIES];
      }
    } catch {
      this.ledgerEntries = [];
    }

    try {
      const storedUnbilled = localStorage.getItem(UNBILLED_STORAGE_KEY);
      if (storedUnbilled) {
        this.unbilledTransactions = JSON.parse(storedUnbilled);
      } else if (useDemoFallback) {
        this.unbilledTransactions = [...INITIAL_DEMO_UNBILLED_TRANSACTIONS];
      }
    } catch {
      this.unbilledTransactions = [];
    }

    try {
      const storedInvoices = localStorage.getItem(INVOICES_STORAGE_KEY);
      if (storedInvoices) {
        this.invoicesCache = JSON.parse(storedInvoices);
      }
    } catch {
      this.invoicesCache = [];
    }
  }

  private persistLedgerLocal() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(this.ledgerEntries));
    } catch (e) {
      console.warn('[InvoicingService] Failed to persist ledger entries locally:', e);
    }
  }

  private persistUnbilledLocal() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(UNBILLED_STORAGE_KEY, JSON.stringify(this.unbilledTransactions));
    } catch (e) {
      console.warn('[InvoicingService] Failed to persist unbilled transactions locally:', e);
    }
  }

  private persistInvoicesLocal() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(this.invoicesCache));
    } catch (e) {
      console.warn('[InvoicingService] Failed to persist invoices locally:', e);
    }
  }

  private async lookupCorporateAccount(
    corpIdOrNumber?: string
  ): Promise<CorporateAccountConfig | undefined> {
    if (!corpIdOrNumber) return undefined;
    const key = corpIdOrNumber.trim().toLowerCase();
    const settings = this.getSafeSettings();
    const fromSettings = (settings.corporateAccounts || []).find(
      (c) =>
        c.id.toLowerCase() === key ||
        c.accountNumber.toLowerCase() === key ||
        c.companyName.toLowerCase() === key
    );
    if (fromSettings) return fromSettings;

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const snap = await getDoc(doc(db, 'corporateAccounts', corpIdOrNumber));
          if (snap.exists()) {
            return { id: snap.id, ...(snap.data() as any) } as CorporateAccountConfig;
          }
        }
      } catch {
        // Ignore read error
      }
    }
    return undefined;
  }

  async getInvoices(): Promise<InvoiceRecord[]> {
    const settingsInvoices = this.getSafeSettings().invoices || [];
    const byId = new Map<string, InvoiceRecord>();

    settingsInvoices.forEach((inv) => byId.set(inv.id, inv));
    this.invoicesCache.forEach((inv) => byId.set(inv.id, inv));

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const snap = await getDocs(collection(db, 'invoices'));
          snap.forEach((d) => {
            const inv = { id: d.id, ...(d.data() as any) } as InvoiceRecord;
            byId.set(inv.id, inv);
          });
        }
      } catch (err) {
        console.warn('[InvoicingService] Firestore invoices read warning:', err);
      }
    }

    const merged = Array.from(byId.values()).sort((a, b) =>
      (b.issuedDate || '').localeCompare(a.issuedDate || '')
    );
    this.invoicesCache = merged;
    this.persistInvoicesLocal();
    return merged;
  }

  async saveInvoice(invoice: InvoiceRecord): Promise<InvoiceRecord> {
    this.invoicesCache = [invoice, ...this.invoicesCache.filter((i) => i.id !== invoice.id)];
    this.persistInvoicesLocal();

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          await setDoc(doc(db, 'invoices', invoice.id), sanitizePayload(invoice), { merge: true });
        }
      } catch (err) {
        console.warn('[InvoicingService] Firestore invoice write warning:', err);
      }
    }
    return invoice;
  }

  async getPrintableInvoice(invoiceId: string): Promise<PrintableInvoiceData | null> {
    const allInvoices = await this.getInvoices();
    const targetInvoice = allInvoices.find((i) => i.id === invoiceId) || null;
    if (!targetInvoice) {
      return null;
    }

    const targetCorp = await this.lookupCorporateAccount(
      targetInvoice.corporateAccountId || targetInvoice.accountNumber
    );
    const settings = this.getSafeSettings();
    const billing = settings.billingSettings;
    const company = settings.company;

    // Cross-reference stored AR rows for any legacy invoices missing rich lineItem metadata
    const allTxs = await this.getUnbilledTransactions();
    const txByTripId = new Map<string, CorporateUnbilledTransaction>();
    allTxs.forEach((t) => txByTripId.set(t.tripId, t));

    const lineItems = targetInvoice.lineItems.map((li, index) => {
      const tripId = li.tripId || targetInvoice.tripIds?.[index];
      const matchedTx = tripId ? txByTripId.get(tripId) : undefined;
      return {
        tripId: tripId || undefined,
        date: li.date || matchedTx?.pickupDate || targetInvoice.issuedDate,
        description: li.description,
        passengerName: li.passengerName || matchedTx?.passengerName || targetInvoice.customerName,
        pickupDropoff:
          li.pickupDropoff ||
          (matchedTx ? `${matchedTx.pickupAddress} ➔ ${matchedTx.dropoffAddress}` : undefined),
        poNumber: li.poNumber || matchedTx?.poNumber || (targetCorp?.poRequired ? targetCorp.currentPoNumber : undefined),
        amount: Number(li.amount || 0),
      };
    });

    // Strict Single-Discount Invariant: NEVER subtract discountPercent again on already-net line items!
    const lineItemSum = Number(lineItems.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2));
    const recordedDiscount = Number(targetInvoice.discountAmount || 0);
    const totalAmount = Number((targetInvoice.totalAmount ?? lineItemSum).toFixed(2));
    const subtotal = Number(
      (targetInvoice.subtotal !== undefined
        ? targetInvoice.subtotal
        : recordedDiscount > 0 && Math.abs(lineItemSum - totalAmount) < 0.02
        ? totalAmount + recordedDiscount
        : lineItemSum
      ).toFixed(2)
    );

    return {
      invoiceNumber: targetInvoice.invoiceNumber,
      issuedDate: targetInvoice.issuedDate,
      dueDate: targetInvoice.dueDate,
      corporateAccount: targetCorp,
      customerName: targetInvoice.customerName,
      customerEmail: targetInvoice.customerEmail,
      billingAddress:
        targetCorp?.billingAddress ||
        (targetCorp ? targetCorp.companyName : 'Accounts Payable'),
      status: targetInvoice.status,
      paidDate: targetInvoice.paidDate,
      lineItems,
      subtotal,
      discountAmount: recordedDiscount,
      totalAmount,
      notes:
        targetInvoice.notes ||
        'Thank you for your business. Payment due within agreed contractual terms.',
      remittanceInfo: {
        bankName: billing?.remittanceBankName || 'ACH / Check Remittance',
        accountName: billing?.remittanceAccountName || company?.name || COMPANY_CONFIG.legalName,
        accountNumber: billing?.remittanceAccountLast4
          ? `••••••••${billing.remittanceAccountLast4}`
          : 'Available upon request',
        routingNumber: billing?.remittanceRoutingNumber || 'Contact billing desk',
        dispatchPhone: company?.phone || COMPANY_CONFIG.phone.dispatch,
        billingEmail: company?.email || COMPANY_CONFIG.email.dispatch,
      },
    };
  }

  async generateBatchInvoiceForCorporate(
    corporateAccountId: string,
    unbilledTrips: Trip[]
  ): Promise<InvoiceRecord | null> {
    if (!unbilledTrips || unbilledTrips.length === 0) return null;

    const corpAccount = await this.lookupCorporateAccount(corporateAccountId);
    const customerName =
      corpAccount?.companyName ||
      `${unbilledTrips[0].passenger?.firstName || ''} ${unbilledTrips[0].passenger?.lastName || ''}`.trim() ||
      'Corporate Partner';
    const customerEmail =
      corpAccount?.billingContactEmail ||
      unbilledTrips[0].passenger?.email ||
      COMPANY_CONFIG.email.dispatch;

    const allTxs = await this.getUnbilledTransactions();
    const txByTripId = new Map<string, CorporateUnbilledTransaction>();
    allTxs.forEach((tx) => txByTripId.set(tx.tripId, tx));

    const lineItems: InvoiceLineItemRecord[] = unbilledTrips.map((t) => {
      const existingTx = txByTripId.get(t.id);
      const calc = existingTx
        ? {
            baseFare: existingTx.baseFare,
            waitTimeFee: existingTx.waitTimeFee,
            tolls: existingTx.tolls,
            gratuity: existingTx.gratuity,
            discountAmount: existingTx.discountAmount,
            totalAmount: existingTx.totalAmount,
          }
        : calculateCorporateTransactionAmounts(t, corpAccount);
      const meta = (t.metadata || {}) as Record<string, any>;
      const pickupDate =
        existingTx?.pickupDate ||
        (t.actualPickupTime || t.scheduledPickupTime || t.createdAt || '').slice(0, 10) ||
        formatLocalDateStr(new Date());
      const paxName =
        existingTx?.passengerName ||
        `${t.passenger?.firstName || ''} ${t.passenger?.lastName || ''}`.trim() ||
        'Corporate Traveler';
      const poNumber =
        existingTx?.poNumber ||
        meta.corporateDetails?.billingPo ||
        meta.billingPo ||
        undefined;

      return {
        tripId: t.id,
        date: pickupDate,
        passengerName: paxName,
        pickupDropoff: `${t.pickupLocation.address} ➔ ${t.dropoffLocation.address}`,
        poNumber,
        vehicleDisplayName:
          existingTx?.vehicleDisplayName ||
          (typeof meta.vehicleDisplayName === 'string' ? meta.vehicleDisplayName : undefined),
        description: `Ride #${t.id.slice(-6).toUpperCase()}: ${paxName} (${t.pickupLocation.address.split(',')[0]} ➔ ${t.dropoffLocation.address.split(',')[0]})`,
        baseFare: calc.baseFare,
        waitTimeFee: calc.waitTimeFee,
        tolls: calc.tolls,
        gratuity: calc.gratuity,
        discountAmount: calc.discountAmount,
        amount: calc.totalAmount,
      };
    });

    const totalAmount = Number(lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const totalDiscount = Number(
      lineItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0).toFixed(2)
    );
    const subtotal = Number((totalAmount + totalDiscount).toFixed(2));
    const issuedDate = formatLocalDateStr(new Date());
    const dueDate = computeInvoiceDueDate(issuedDate, corpAccount?.billingCycle);
    const invoiceId = `inv-batch-${Date.now().toString(36)}`;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

    const newInvoice: InvoiceRecord = {
      id: invoiceId,
      invoiceNumber,
      corporateAccountId: corpAccount?.id || corporateAccountId,
      accountNumber: corpAccount?.accountNumber,
      billingCycle: corpAccount?.billingCycle || 'net30',
      customerName,
      customerEmail,
      tripIds: unbilledTrips.map((t) => t.id),
      subtotal,
      discountAmount: totalDiscount,
      totalAmount,
      status: 'issued',
      issuedDate,
      dueDate,
      lineItems,
      notes: `Consolidated corporate invoice covering ${unbilledTrips.length} completed transport run(s). Terms: ${(corpAccount?.billingCycle || 'net30').toUpperCase()}.`,
    };

    // Persist invoice & atomically mark matched AR transactions as invoiced (prevents double-billing!)
    await this.saveInvoice(newInvoice);

    const includedTripIds = new Set(unbilledTrips.map((t) => t.id));
    const updatedTxs: CorporateUnbilledTransaction[] = [];
    this.unbilledTransactions = this.unbilledTransactions.map((tx) => {
      if (includedTripIds.has(tx.tripId) && (tx.status === 'unbilled' || tx.status === 'pending_invoice')) {
        const next = { ...tx, status: 'invoiced' as const, invoiceId };
        updatedTxs.push(next);
        return next;
      }
      return tx;
    });
    this.persistUnbilledLocal();

    if (isFirebaseConfigured() && updatedTxs.length > 0) {
      const db = getFirestoreDb();
      if (db) {
        await Promise.all(
          updatedTxs.map((tx) =>
            setDoc(
              doc(db, 'unbilledTransactions', tx.id),
              sanitizePayload({ status: 'invoiced', invoiceId }),
              { merge: true }
            ).catch(() => {})
          )
        );
      }
    }

    await this.recordLedgerEntry({
      date: issuedDate,
      type: 'fare_revenue',
      corporateAccountId: newInvoice.corporateAccountId,
      invoiceId: newInvoice.id,
      amount: totalAmount,
      description: `B2B Batch Statement ${newInvoice.invoiceNumber} (${unbilledTrips.length} trips)`,
      accountCode: '1200-AccountsReceivable',
    });

    return newInvoice;
  }

  async handleCorporateTripCompleted(
    trip: Trip,
    corporateAccount?: CorporateAccountConfig
  ): Promise<CorporateUnbilledTransaction | null> {
    if (!trip || (trip.payment?.method !== 'account' && trip.payment?.method !== 'corporate')) {
      return null;
    }

    const meta = (trip.metadata || {}) as Record<string, any>;
    const corpLookupKey =
      trip.payment?.corporateAccountId ||
      meta.corporateAccountId ||
      meta.corporateAccountNumber ||
      meta.corporateDetails?.corporateAccount ||
      meta.corporateOrgName;

    const corpAccount = corporateAccount || (await this.lookupCorporateAccount(corpLookupKey));
    const resolvedCorpId = corpAccount?.id || corpLookupKey || 'unlinked-corporate';

    const amounts = calculateCorporateTransactionAmounts(trip, corpAccount);

    const pickupDate = trip.actualPickupTime
      ? trip.actualPickupTime.slice(0, 10)
      : trip.scheduledPickupTime
      ? trip.scheduledPickupTime.slice(0, 10)
      : formatLocalDateStr(new Date());

    const passengerName = trip.passenger?.firstName
      ? `${trip.passenger.firstName} ${trip.passenger.lastName || ''}`.trim()
      : 'Corporate Traveler';

    const poNumber =
      meta.corporateDetails?.billingPo || meta.billingPo || undefined;
    const authorizedBy =
      meta.corporateDetails?.authorizedBy || meta.authorizedBy || undefined;

    // Deterministic doc ID per trip prevents duplicate AR entries on retry
    const txId = `unb-${trip.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const unbilledTx: CorporateUnbilledTransaction = {
      id: txId,
      tripId: trip.id,
      corporateAccountId: resolvedCorpId,
      corporateAccountName:
        corpAccount?.companyName || meta.corporateOrgName || 'Corporate Partner Account',
      accountNumber: corpAccount?.accountNumber || meta.corporateAccountNumber,
      passengerName,
      passengerPhone: trip.passenger?.phone,
      pickupDate,
      pickupAddress: trip.pickupLocation?.address || 'Pickup Location',
      dropoffAddress: trip.dropoffLocation?.address || 'Dropoff Location',
      vehicleDisplayName:
        typeof meta.vehicleDisplayName === 'string' ? meta.vehicleDisplayName : undefined,
      poNumber,
      authorizedBy,
      baseFare: amounts.baseFare,
      gratuity: amounts.gratuity,
      tolls: amounts.tolls,
      waitTimeFee: amounts.waitTimeFee,
      discountAmount: amounts.discountAmount,
      discountAlreadyApplied: amounts.discountAlreadyApplied,
      totalAmount: amounts.totalAmount,
      status: 'unbilled',
      createdAt: new Date().toISOString(),
    };

    this.unbilledTransactions = [
      unbilledTx,
      ...this.unbilledTransactions.filter((t) => t.tripId !== trip.id),
    ];
    this.persistUnbilledLocal();

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          await setDoc(doc(db, 'unbilledTransactions', txId), sanitizePayload(unbilledTx), {
            merge: true,
          });
        }
      } catch (err) {
        console.warn('[InvoicingService] Firestore unbilledTransactions write warning:', err);
      }
    }

    return unbilledTx;
  }

  async getUnbilledTransactions(corporateAccountId?: string): Promise<CorporateUnbilledTransaction[]> {
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const q = corporateAccountId
            ? query(
                collection(db, 'unbilledTransactions'),
                where('corporateAccountId', '==', corporateAccountId)
              )
            : collection(db, 'unbilledTransactions');
          const snap = await getDocs(q);
          const remote: CorporateUnbilledTransaction[] = [];
          snap.forEach((d) => {
            remote.push({ id: d.id, ...(d.data() as any) } as CorporateUnbilledTransaction);
          });
          remote.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          if (!corporateAccountId) {
            this.unbilledTransactions = remote;
            this.persistUnbilledLocal();
          }
          return remote;
        }
      } catch (err) {
        console.warn('[InvoicingService] Firestore unbilledTransactions read warning:', err);
      }
    }

    if (corporateAccountId) {
      return this.unbilledTransactions.filter((t) => t.corporateAccountId === corporateAccountId);
    }
    return [...this.unbilledTransactions];
  }

  async getCorporateAccountBalance(corporateAccountId: string): Promise<number> {
    const txs = await this.getUnbilledTransactions(corporateAccountId);
    const openAr = txs
      .filter((t) => t.status === 'unbilled' || t.status === 'pending_invoice' || t.status === 'invoiced')
      .reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    return Number(openAr.toFixed(2));
  }

  async generateInvoiceFromUnbilled(
    corporateAccountId: string,
    unbilledTxs: CorporateUnbilledTransaction[]
  ): Promise<InvoiceRecord | null> {
    if (!unbilledTxs || unbilledTxs.length === 0) return null;

    // Enforce single-corporation grouping so Client A's rides can NEVER be billed to Client B
    const distinctCorpIds = new Set(unbilledTxs.map((t) => t.corporateAccountId));
    if (distinctCorpIds.size > 1) {
      throw new Error(
        'Selected transactions belong to multiple corporate clients. Please select transactions for one corporate account per invoice.'
      );
    }

    const billableTxs = unbilledTxs.filter(
      (t) => t.status === 'unbilled' || t.status === 'pending_invoice'
    );
    if (billableTxs.length === 0) {
      throw new Error('All selected transactions have already been invoiced or settled.');
    }

    const resolvedCorpId = billableTxs[0].corporateAccountId || corporateAccountId;
    const corpAccount = await this.lookupCorporateAccount(resolvedCorpId);

    const customerName =
      corpAccount?.companyName || billableTxs[0].corporateAccountName || 'Corporate Partner';
    const customerEmail =
      corpAccount?.billingContactEmail || COMPANY_CONFIG.email.dispatch;

    const lineItems: InvoiceLineItemRecord[] = billableTxs.map((tx) => ({
      tripId: tx.tripId,
      date: tx.pickupDate,
      passengerName: tx.passengerName,
      pickupDropoff: `${tx.pickupAddress} ➔ ${tx.dropoffAddress}`,
      poNumber: tx.poNumber,
      vehicleDisplayName: tx.vehicleDisplayName,
      authorizedBy: tx.authorizedBy,
      baseFare: tx.baseFare,
      gratuity: tx.gratuity,
      tolls: tx.tolls,
      waitTimeFee: tx.waitTimeFee,
      discountAmount: tx.discountAmount,
      description: `Ride ${tx.pickupDate}: ${tx.passengerName} (${tx.pickupAddress.split(',')[0]} ➔ ${tx.dropoffAddress.split(',')[0]})`,
      amount: Number(tx.totalAmount || 0),
    }));

    const totalAmount = Number(lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const totalDiscount = Number(
      billableTxs.reduce((sum, tx) => sum + Number(tx.discountAmount || 0), 0).toFixed(2)
    );
    const subtotal = Number((totalAmount + totalDiscount).toFixed(2));
    const issuedDate = formatLocalDateStr(new Date());
    const dueDate = computeInvoiceDueDate(issuedDate, corpAccount?.billingCycle);
    const invoiceId = `inv-${Date.now().toString(36)}`;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newInvoice: InvoiceRecord = {
      id: invoiceId,
      invoiceNumber,
      corporateAccountId: corpAccount?.id || resolvedCorpId,
      accountNumber: corpAccount?.accountNumber || billableTxs[0].accountNumber,
      billingCycle: corpAccount?.billingCycle || 'net30',
      customerName,
      customerEmail,
      tripIds: billableTxs.map((t) => t.tripId),
      subtotal,
      discountAmount: totalDiscount,
      totalAmount,
      status: 'issued',
      issuedDate,
      dueDate,
      lineItems,
      notes: `Consolidated corporate invoice covering ${billableTxs.length} transport run(s). Terms: ${(corpAccount?.billingCycle || 'net30').toUpperCase()}.`,
    };

    await this.saveInvoice(newInvoice);

    // Mark AR transactions as invoiced in memory, localStorage, and Firestore
    const billedIds = new Set(billableTxs.map((t) => t.id));
    this.unbilledTransactions = this.unbilledTransactions.map((tx) =>
      billedIds.has(tx.id) ? { ...tx, status: 'invoiced' as const, invoiceId } : tx
    );
    this.persistUnbilledLocal();

    if (isFirebaseConfigured()) {
      const db = getFirestoreDb();
      if (db) {
        await Promise.all(
          billableTxs.map((tx) =>
            setDoc(
              doc(db, 'unbilledTransactions', tx.id),
              sanitizePayload({ status: 'invoiced', invoiceId }),
              { merge: true }
            ).catch(() => {})
          )
        );
      }
    }

    await this.recordLedgerEntry({
      date: issuedDate,
      type: 'fare_revenue',
      corporateAccountId: newInvoice.corporateAccountId,
      invoiceId: newInvoice.id,
      amount: totalAmount,
      description: `Corporate Invoice ${invoiceNumber} issued to ${customerName} (${billableTxs.length} rides)`,
      accountCode: '1200-AccountsReceivable',
    });

    return newInvoice;
  }

  async settleUnbilledTransactions(txIds: string[]): Promise<void> {
    if (!txIds.length) return;
    const idSet = new Set(txIds);
    this.unbilledTransactions = this.unbilledTransactions.map((tx) =>
      idSet.has(tx.id) ? { ...tx, status: 'settled' as const } : tx
    );
    this.persistUnbilledLocal();

    if (isFirebaseConfigured()) {
      const db = getFirestoreDb();
      if (db) {
        await Promise.all(
          txIds.map((id) =>
            setDoc(
              doc(db, 'unbilledTransactions', id),
              sanitizePayload({ status: 'settled' }),
              { merge: true }
            ).catch(() => {})
          )
        );
      }
    }
  }

  async markInvoicePaid(invoiceId: string): Promise<InvoiceRecord | null> {
    const today = formatLocalDateStr(new Date());
    const allInvoices = await this.getInvoices();
    const existing = allInvoices.find((i) => i.id === invoiceId);
    if (!existing) return null;

    if (existing.status === 'paid') {
      return existing;
    }

    const updatedInvoice: InvoiceRecord = {
      ...existing,
      status: 'paid',
      paidDate: today,
    };

    await this.saveInvoice(updatedInvoice);

    // Mark all associated AR transactions as settled
    const linkedTxIds: string[] = [];
    this.unbilledTransactions = this.unbilledTransactions.map((tx) => {
      if (tx.invoiceId === invoiceId || existing.tripIds?.includes(tx.tripId)) {
        linkedTxIds.push(tx.id);
        return { ...tx, status: 'settled' as const, invoiceId };
      }
      return tx;
    });
    this.persistUnbilledLocal();

    if (isFirebaseConfigured() && linkedTxIds.length > 0) {
      const db = getFirestoreDb();
      if (db) {
        await Promise.all(
          linkedTxIds.map((id) =>
            updateDoc(doc(db, 'unbilledTransactions', id), {
              status: 'settled',
              invoiceId,
            }).catch(() => {})
          )
        );
      }
    }

    // Record balanced Cash / AR settlement (NEVER double-counts fare_revenue!)
    await this.recordLedgerEntry({
      date: today,
      type: 'invoice_settlement',
      corporateAccountId: updatedInvoice.corporateAccountId,
      invoiceId: updatedInvoice.id,
      amount: updatedInvoice.totalAmount,
      description: `Cash settlement received for Invoice ${updatedInvoice.invoiceNumber} (${updatedInvoice.customerName})`,
      accountCode: '1010-OperatingCash',
    });

    return updatedInvoice;
  }

  async recordLedgerEntry(
    entry: Omit<FinancialLedgerEntry, 'id' | 'createdAt'>
  ): Promise<FinancialLedgerEntry> {
    const newEntry: FinancialLedgerEntry = {
      ...entry,
      id: `ledg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    this.ledgerEntries = [newEntry, ...this.ledgerEntries];
    this.persistLedgerLocal();

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          await setDoc(doc(db, 'financialLedger', newEntry.id), sanitizePayload(newEntry));
        }
      } catch {
        // Tolerated offline
      }
    }

    return newEntry;
  }

  async getLedgerEntries(filter?: {
    startDate?: string;
    endDate?: string;
    type?: LedgerEntryType;
    corporateAccountId?: string;
  }): Promise<FinancialLedgerEntry[]> {
    let result = [...this.ledgerEntries];

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const snap = await getDocs(
            query(collection(db, 'financialLedger'), orderBy('createdAt', 'desc'))
          );
          const remote: FinancialLedgerEntry[] = [];
          snap.forEach((d) => {
            remote.push({ id: d.id, ...(d.data() as any) } as FinancialLedgerEntry);
          });
          this.ledgerEntries = remote;
          this.persistLedgerLocal();
          result = remote;
        }
      } catch (err) {
        console.warn('[InvoicingService] Firestore financialLedger read warning:', err);
      }
    }

    if (filter?.startDate) {
      result = result.filter((e) => e.date >= filter.startDate!);
    }
    if (filter?.endDate) {
      result = result.filter((e) => e.date <= filter.endDate!);
    }
    if (filter?.type) {
      result = result.filter((e) => e.type === filter.type);
    }
    if (filter?.corporateAccountId) {
      result = result.filter((e) => e.corporateAccountId === filter.corporateAccountId);
    }

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }

  async exportLedger(
    format: AccountingExportFormat,
    startDate?: string,
    endDate?: string
  ): Promise<AccountingSyncExport> {
    const entries = await this.getLedgerEntries({ startDate, endDate });
    const companyName = this.getSafeSettings().company?.name || COMPANY_CONFIG.name;

    let totalDebit = 0;
    let totalCredit = 0;
    entries.forEach((e) => {
      if (e.type === 'fare_revenue' || e.type === 'platform_commission') {
        totalCredit += e.amount;
      } else {
        totalDebit += e.amount;
      }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'quickbooks_csv') {
      const headers = [
        'Date',
        'Transaction Type',
        'Ref Number',
        'Account Code',
        'Offset Account',
        'Description',
        'Amount',
        'Debit',
        'Credit',
      ];
      const rows = entries.map((e) => {
        const isCredit = e.type === 'fare_revenue' || e.type === 'platform_commission';
        const debitStr = isCredit ? '0.00' : e.amount.toFixed(2);
        const creditStr = isCredit ? e.amount.toFixed(2) : '0.00';
        return [
          e.date,
          e.type.toUpperCase(),
          e.id,
          e.accountCode,
          resolveOffsetAccountCode(e),
          `"${e.description.replace(/"/g, '""')}"`,
          e.amount.toFixed(2),
          debitStr,
          creditStr,
        ].join(',');
      });

      return {
        fileName: `quickbooks_ledger_export_${timestamp}.csv`,
        mimeType: 'text/csv',
        data: [headers.join(','), ...rows].join('\n'),
        recordCount: entries.length,
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        generatedAt: new Date().toISOString(),
      };
    }

    if (format === 'quickbooks_iif') {
      return {
        fileName: `quickbooks_journal_${timestamp}.iif`,
        mimeType: 'text/plain',
        data: buildQuickBooksIifJournal(entries, companyName),
        recordCount: entries.length,
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        generatedAt: new Date().toISOString(),
      };
    }

    const jsonData = JSON.stringify(
      {
        company: companyName,
        currency: 'USD',
        exportDate: new Date().toISOString(),
        filters: { startDate, endDate },
        totals: {
          records: entries.length,
          debit: Number(totalDebit.toFixed(2)),
          credit: Number(totalCredit.toFixed(2)),
        },
        transactions: entries,
      },
      null,
      2
    );

    return {
      fileName: `general_ledger_${timestamp}.json`,
      mimeType: 'application/json',
      data: jsonData,
      recordCount: entries.length,
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      generatedAt: new Date().toISOString(),
    };
  }
}

let invoicingServiceInstance: InvoicingService | null = null;

export function getInvoicingService(): IInvoicingService {
  if (!invoicingServiceInstance) {
    invoicingServiceInstance = new InvoicingService();
  }
  return invoicingServiceInstance;
}
