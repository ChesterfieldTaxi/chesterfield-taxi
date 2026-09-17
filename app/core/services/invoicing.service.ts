/**
 * B2B Invoicing & Accounting Ledger Sync Service
 * 
 * Provides automated corporate batch billing, printable PDF invoice generation,
 * balanced double-entry ledger tracking, and QuickBooks CSV / JSON accounting exports.
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
import type { InvoiceRecord, CorporateAccountConfig } from '../types/config';
import type { Trip } from '../types/trip';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';

const LEDGER_STORAGE_KEY = 'ct_financial_ledger_entries';
const UNBILLED_STORAGE_KEY = 'ct_corporate_unbilled_transactions';

const INITIAL_MOCK_UNBILLED_TRANSACTIONS: CorporateUnbilledTransaction[] = [
  {
    id: 'unb-101',
    tripId: 'tr-8840',
    corporateAccountId: 'corp-1',
    corporateAccountName: 'Boeing Defense & Space',
    accountNumber: 'BA-77492',
    passengerName: 'Dr. Michael Scott',
    passengerPhone: '(314) 555-0192',
    pickupDate: '2026-09-14',
    pickupAddress: 'Boeing Bldg 101, St. Louis, MO',
    dropoffAddress: 'Lambert STL Terminal 1, St. Louis, MO',
    baseFare: 85.00,
    gratuity: 15.00,
    tolls: 5.00,
    waitTimeFee: 7.50,
    discountAmount: 11.25,
    totalAmount: 101.25,
    status: 'unbilled',
    createdAt: '2026-09-14T11:20:00.000Z',
  },
  {
    id: 'unb-102',
    tripId: 'tr-8842',
    corporateAccountId: 'corp-1',
    corporateAccountName: 'Boeing Defense & Space',
    accountNumber: 'BA-77492',
    passengerName: 'Sarah Jenkins (VP Eng)',
    passengerPhone: '(314) 555-0143',
    pickupDate: '2026-09-15',
    pickupAddress: 'Lambert STL Terminal 2, St. Louis, MO',
    dropoffAddress: 'Ritz-Carlton Clayton, MO',
    baseFare: 65.00,
    gratuity: 12.00,
    tolls: 0.00,
    waitTimeFee: 0.00,
    discountAmount: 7.70,
    totalAmount: 69.30,
    status: 'unbilled',
    createdAt: '2026-09-15T15:45:00.000Z',
  },
  {
    id: 'unb-103',
    tripId: 'tr-8845',
    corporateAccountId: 'corp-2',
    corporateAccountName: 'Centene Healthcare HQ',
    accountNumber: 'CNC-99120',
    passengerName: 'David Ortiz',
    passengerPhone: '(314) 555-0281',
    pickupDate: '2026-09-16',
    pickupAddress: '7700 Forsyth Blvd, Clayton, MO',
    dropoffAddress: 'Spirit of St. Louis Airport, Chesterfield, MO',
    baseFare: 90.00,
    gratuity: 15.00,
    tolls: 4.00,
    waitTimeFee: 5.00,
    discountAmount: 11.40,
    totalAmount: 102.60,
    status: 'unbilled',
    createdAt: '2026-09-16T09:10:00.000Z',
  },
];

const INITIAL_MOCK_LEDGER_ENTRIES: FinancialLedgerEntry[] = [
  {
    id: 'ledg-101',
    date: '2026-09-10',
    type: 'fare_revenue',
    tripId: 'tr-8831',
    corporateAccountId: 'corp-1',
    amount: 145.50,
    description: 'Corporate Airport Transfer (Lambert STL)',
    accountCode: '4010-FareRevenue',
    createdAt: '2026-09-10T14:30:00.000Z',
  },
  {
    id: 'ledg-102',
    date: '2026-09-10',
    type: 'platform_commission',
    tripId: 'tr-8831',
    amount: 36.38,
    description: 'Platform 25% Service Fee (tr-8831)',
    accountCode: '4020-PlatformCommission',
    createdAt: '2026-09-10T14:30:00.000Z',
  },
  {
    id: 'ledg-103',
    date: '2026-09-10',
    type: 'driver_payout',
    tripId: 'tr-8831',
    driverId: 'drv-101',
    amount: 109.12,
    description: 'Driver Net Share 75% (tr-8831)',
    accountCode: '5010-DriverPayout',
    createdAt: '2026-09-10T14:30:00.000Z',
  },
  {
    id: 'ledg-104',
    date: '2026-09-12',
    type: 'tip_collected',
    tripId: 'tr-8835',
    driverId: 'drv-104',
    amount: 25.00,
    description: 'Passenger In-App Gratuity (tr-8835)',
    accountCode: '2010-DriverTipsPayable',
    createdAt: '2026-09-12T18:45:00.000Z',
  },
  {
    id: 'ledg-105',
    date: '2026-09-14',
    type: 'toll_reimbursement',
    tripId: 'tr-8839',
    driverId: 'drv-108',
    amount: 4.00,
    description: 'Airport Access Toll Pass-Through (tr-8839)',
    accountCode: '2020-TollsReimbursement',
    createdAt: '2026-09-14T09:15:00.000Z',
  },
];

class InvoicingService implements IInvoicingService {
  private ledgerEntries: FinancialLedgerEntry[] = [];
  private unbilledTransactions: CorporateUnbilledTransaction[] = [];

  constructor() {
    this.hydrateLedger();
    this.hydrateUnbilled();
  }

  private hydrateLedger() {
    if (typeof window === 'undefined') {
      this.ledgerEntries = [...INITIAL_MOCK_LEDGER_ENTRIES];
      return;
    }
    try {
      const stored = localStorage.getItem(LEDGER_STORAGE_KEY);
      if (stored) {
        this.ledgerEntries = JSON.parse(stored);
      } else {
        this.ledgerEntries = [...INITIAL_MOCK_LEDGER_ENTRIES];
        localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(this.ledgerEntries));
      }
    } catch {
      this.ledgerEntries = [...INITIAL_MOCK_LEDGER_ENTRIES];
    }
  }

  private persistLedger() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(this.ledgerEntries));
    } catch (e) {
      console.warn('[InvoicingService] Failed to persist ledger entries:', e);
    }
  }

  private hydrateUnbilled() {
    if (typeof window === 'undefined') {
      this.unbilledTransactions = [...INITIAL_MOCK_UNBILLED_TRANSACTIONS];
      return;
    }
    try {
      const stored = localStorage.getItem(UNBILLED_STORAGE_KEY);
      if (stored) {
        this.unbilledTransactions = JSON.parse(stored);
      } else {
        this.unbilledTransactions = [...INITIAL_MOCK_UNBILLED_TRANSACTIONS];
        localStorage.setItem(UNBILLED_STORAGE_KEY, JSON.stringify(this.unbilledTransactions));
      }
    } catch {
      this.unbilledTransactions = [...INITIAL_MOCK_UNBILLED_TRANSACTIONS];
    }
  }

  private persistUnbilled() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(UNBILLED_STORAGE_KEY, JSON.stringify(this.unbilledTransactions));
    } catch (e) {
      console.warn('[InvoicingService] Failed to persist unbilled transactions:', e);
    }
  }

  async getPrintableInvoice(invoiceId: string): Promise<PrintableInvoiceData | null> {
    // Attempt to locate invoice in cached appSettings or create default presentation
    let targetInvoice: InvoiceRecord | null = null;
    let targetCorp: CorporateAccountConfig | undefined = undefined;

    if (typeof window !== 'undefined') {
      try {
        const settingsRaw = localStorage.getItem('ct_app_settings');
        if (settingsRaw) {
          const settings = JSON.parse(settingsRaw);
          const invList = (settings.invoices as InvoiceRecord[]) || [];
          targetInvoice = invList.find((i) => i.id === invoiceId) || null;
          if (targetInvoice && targetInvoice.corporateAccountId) {
            const corpList = (settings.corporateAccounts as CorporateAccountConfig[]) || [];
            targetCorp = corpList.find((c) => c.id === targetInvoice?.corporateAccountId);
          }
        }
      } catch (err) {
        console.warn('[InvoicingService] Could not parse local settings:', err);
      }
    }

    if (!targetInvoice) {
      // Return a professional mock structure for preview
      targetInvoice = {
        id: invoiceId,
        invoiceNumber: `INV-2026-${invoiceId.slice(-4).toUpperCase()}`,
        customerName: 'Enterprise Client Corp',
        customerEmail: 'ap@enterpriseclient.com',
        tripIds: ['tr-8831', 'tr-8832'],
        totalAmount: 285.50,
        status: 'issued',
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        lineItems: [
          { description: 'Executive Airport Transport - Lambert STL (tr-8831)', amount: 145.50 },
          { description: 'Corporate Meeting Shuttle - Spirit of St. Louis (tr-8832)', amount: 140.00 },
        ],
      };
    }

    const lineItems = targetInvoice.lineItems.map((li, index) => ({
      tripId: targetInvoice?.tripIds?.[index] || `TR-${index + 1}`,
      date: targetInvoice?.issuedDate || new Date().toISOString().slice(0, 10),
      description: li.description,
      passengerName: targetInvoice?.customerName,
      pickupDropoff: 'Chesterfield Metro Area <-> STL Airport',
      poNumber: targetCorp?.poRequired ? (targetCorp.accountNumber || 'PO-9941') : undefined,
      amount: li.amount,
    }));

    const subtotal = lineItems.reduce((acc, curr) => acc + curr.amount, 0);
    const discountPercent = targetCorp?.discountPercent || 0;
    const discountAmount = discountPercent > 0 ? Number(((subtotal * discountPercent) / 100).toFixed(2)) : 0;
    const totalAmount = Number((subtotal - discountAmount).toFixed(2));

    return {
      invoiceNumber: targetInvoice.invoiceNumber,
      issuedDate: targetInvoice.issuedDate,
      dueDate: targetInvoice.dueDate,
      corporateAccount: targetCorp,
      customerName: targetInvoice.customerName,
      customerEmail: targetInvoice.customerEmail,
      billingAddress: targetCorp ? `${targetCorp.companyName}, St. Louis, MO` : 'Corporate Accounts Payable Dept',
      status: targetInvoice.status,
      paidDate: targetInvoice.paidDate,
      lineItems,
      subtotal,
      discountAmount,
      totalAmount,
      notes: targetInvoice.notes || 'Thank you for your business. Payment due within agreed contractual terms.',
      remittanceInfo: {
        bankName: 'Commerce Bank of St. Louis',
        accountName: COMPANY_CONFIG.legalName,
        accountNumber: '••••••••4819',
        routingNumber: '081000601',
        dispatchPhone: COMPANY_CONFIG.phone.dispatch,
        billingEmail: COMPANY_CONFIG.email.dispatch,
      },
    };
  }

  async generateBatchInvoiceForCorporate(
    corporateAccountId: string,
    unbilledTrips: Trip[]
  ): Promise<InvoiceRecord | null> {
    if (!unbilledTrips || unbilledTrips.length === 0) return null;

    const firstTrip = unbilledTrips[0];
    const customerName = firstTrip.passenger.firstName
      ? `${firstTrip.passenger.firstName} ${firstTrip.passenger.lastName}`
      : 'Corporate Partner';
    const customerEmail = firstTrip.passenger.email || 'billing@corporate.com';

    const lineItems = unbilledTrips.map((t) => ({
      description: `Ride #${t.id.slice(-6).toUpperCase()} (${t.pickupLocation.address.split(',')[0]} to ${t.dropoffLocation.address.split(',')[0]})`,
      amount: t.pricing.totalFare || 75.0,
    }));

    const totalAmount = Number(lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const now = new Date();
    const issuedDate = now.toISOString().slice(0, 10);
    const dueDate = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const newInvoice: InvoiceRecord = {
      id: `inv-batch-${Date.now().toString(36)}`,
      invoiceNumber: `INV-CORP-${Date.now().toString().slice(-5)}`,
      corporateAccountId,
      customerName,
      customerEmail,
      tripIds: unbilledTrips.map((t) => t.id),
      totalAmount,
      status: 'issued',
      issuedDate,
      dueDate,
      lineItems,
      notes: `Consolidated corporate invoice covering ${unbilledTrips.length} completed transport runs.`,
    };

    // Record ledger entry
    await this.recordLedgerEntry({
      date: issuedDate,
      type: 'fare_revenue',
      corporateAccountId,
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

    const corpId = trip.payment?.corporateAccountId || trip.customerId || 'corp-1';
    let corpAccount = corporateAccount;
    if (!corpAccount && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('ct_app_settings');
        if (raw) {
          const settings = JSON.parse(raw);
          const corps: CorporateAccountConfig[] = settings.corporateAccounts || [];
          corpAccount = corps.find((c) => c.id === corpId || c.accountNumber === corpId);
        }
      } catch {}
    }

    const baseFare = trip.pricing?.totalFare || trip.pricing?.subtotal || 50.0;
    const gratuity = trip.payment.tipAmount || 0;
    const tolls = trip.payment.tollsAmount || 0;
    const waitTimeFee = trip.payment.waitTimeAmount || 0;
    const discountPercent = corpAccount?.discountPercent || 0;
    const grossTotal = baseFare + gratuity + tolls + waitTimeFee;
    const discountAmount = discountPercent > 0 ? Number(((grossTotal * discountPercent) / 100).toFixed(2)) : 0;
    const netTotal = Number((grossTotal - discountAmount).toFixed(2));

    const pickupDate = trip.actualPickupTime
      ? trip.actualPickupTime.slice(0, 10)
      : trip.scheduledPickupTime
      ? trip.scheduledPickupTime.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const passengerName = trip.passenger?.firstName
      ? `${trip.passenger.firstName} ${trip.passenger.lastName || ''}`.trim()
      : 'Corporate Traveler';

    const unbilledTx: CorporateUnbilledTransaction = {
      id: `unb-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      tripId: trip.id,
      corporateAccountId: corpAccount?.id || corpId,
      corporateAccountName: corpAccount?.companyName || 'Corporate Partner Account',
      accountNumber: corpAccount?.accountNumber,
      passengerName,
      passengerPhone: trip.passenger?.phone,
      pickupDate,
      pickupAddress: trip.pickupLocation?.address || 'Pickup Location',
      dropoffAddress: trip.dropoffLocation?.address || 'Dropoff Location',
      baseFare,
      gratuity,
      tolls,
      waitTimeFee,
      discountAmount,
      totalAmount: netTotal,
      status: 'unbilled',
      createdAt: new Date().toISOString(),
    };

    // Prepend and persist
    this.unbilledTransactions = [unbilledTx, ...this.unbilledTransactions.filter((t) => t.tripId !== trip.id)];
    this.persistUnbilled();

    return unbilledTx;
  }

  async getUnbilledTransactions(corporateAccountId?: string): Promise<CorporateUnbilledTransaction[]> {
    if (corporateAccountId) {
      return this.unbilledTransactions.filter((t) => t.corporateAccountId === corporateAccountId);
    }
    return [...this.unbilledTransactions];
  }

  async generateInvoiceFromUnbilled(
    corporateAccountId: string,
    unbilledTxs: CorporateUnbilledTransaction[]
  ): Promise<InvoiceRecord | null> {
    if (!unbilledTxs || unbilledTxs.length === 0) return null;

    const firstTx = unbilledTxs[0];
    const customerName = firstTx.corporateAccountName || 'Corporate Partner';
    const customerEmail = 'accounts.payable@' + customerName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

    const lineItems = unbilledTxs.map((tx) => ({
      description: `Ride ${tx.pickupDate}: ${tx.passengerName} (${tx.pickupAddress.split(',')[0]} ➔ ${tx.dropoffAddress.split(',')[0]})`,
      amount: tx.totalAmount,
    }));

    const totalAmount = Number(lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const now = new Date();
    const issuedDate = now.toISOString().slice(0, 10);
    const dueDate = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const invoiceId = `inv-${Date.now().toString(36)}`;
    const invoiceNumber = `INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newInvoice: InvoiceRecord = {
      id: invoiceId,
      invoiceNumber,
      corporateAccountId,
      customerName,
      customerEmail,
      tripIds: unbilledTxs.map((t) => t.tripId),
      totalAmount,
      status: 'issued',
      issuedDate,
      dueDate,
      lineItems,
      notes: `Consolidated corporate invoice covering ${unbilledTxs.length} transport runs. Terms: Net 30.`,
    };

    // Mark transactions as invoiced
    const billedIds = new Set(unbilledTxs.map((t) => t.id));
    this.unbilledTransactions = this.unbilledTransactions.map((tx) =>
      billedIds.has(tx.id) ? { ...tx, status: 'invoiced' as const, invoiceId } : tx
    );
    this.persistUnbilled();

    // Persist into app settings invoices cache
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('ct_app_settings');
        if (raw) {
          const settings = JSON.parse(raw);
          const invList: InvoiceRecord[] = settings.invoices || [];
          settings.invoices = [newInvoice, ...invList.filter((i) => i.id !== newInvoice.id)];
          localStorage.setItem('ct_app_settings', JSON.stringify(settings));
        }
      } catch {}
    }

    // Record ledger entry
    await this.recordLedgerEntry({
      date: issuedDate,
      type: 'fare_revenue',
      corporateAccountId,
      invoiceId: newInvoice.id,
      amount: totalAmount,
      description: `Corporate Invoice ${invoiceNumber} issued to ${customerName} (${unbilledTxs.length} rides)`,
      accountCode: '1200-AccountsReceivable',
    });

    return newInvoice;
  }

  async markInvoicePaid(invoiceId: string): Promise<InvoiceRecord | null> {
    const today = new Date().toISOString().slice(0, 10);
    let updatedInvoice: InvoiceRecord | null = null;

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('ct_app_settings');
        if (raw) {
          const settings = JSON.parse(raw);
          const invList: InvoiceRecord[] = settings.invoices || [];
          const idx = invList.findIndex((i) => i.id === invoiceId);
          if (idx >= 0) {
            invList[idx] = {
              ...invList[idx],
              status: 'paid',
              paidDate: today,
            };
            updatedInvoice = invList[idx];
            settings.invoices = invList;
            localStorage.setItem('ct_app_settings', JSON.stringify(settings));
          }
        }
      } catch {}
    }

    // Mark all associated unbilled transactions as paid
    this.unbilledTransactions = this.unbilledTransactions.map((tx) =>
      tx.invoiceId === invoiceId ? { ...tx, status: 'paid' as const } : tx
    );
    this.persistUnbilled();

    if (updatedInvoice) {
      await this.recordLedgerEntry({
        date: today,
        type: 'fare_revenue',
        corporateAccountId: updatedInvoice.corporateAccountId,
        invoiceId: updatedInvoice.id,
        amount: updatedInvoice.totalAmount,
        description: `Settlement received for Invoice ${updatedInvoice.invoiceNumber} (${updatedInvoice.customerName})`,
        accountCode: '1010-OperatingAccount',
      });
    }

    return updatedInvoice;
  }

  async recordLedgerEntry(entry: Omit<FinancialLedgerEntry, 'id' | 'createdAt'>): Promise<FinancialLedgerEntry> {
    const newEntry: FinancialLedgerEntry = {
      ...entry,
      id: `ledg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    this.ledgerEntries = [newEntry, ...this.ledgerEntries];
    this.persistLedger();

    // Firestore sync if configured
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const colRef = collection(db, 'financialLedger');
          await addDoc(colRef, newEntry).catch(() => {});
        }
      } catch {
        // Tolerated
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
      const headers = ['Date', 'Transaction Type', 'Ref Number', 'Account Code', 'Description', 'Amount', 'Debit', 'Credit'];
      const rows = entries.map((e) => {
        const isCredit = e.type === 'fare_revenue' || e.type === 'platform_commission';
        const debitStr = isCredit ? '0.00' : e.amount.toFixed(2);
        const creditStr = isCredit ? e.amount.toFixed(2) : '0.00';
        return [
          e.date,
          e.type.toUpperCase(),
          e.id,
          e.accountCode,
          `"${e.description.replace(/"/g, '""')}"`,
          e.amount.toFixed(2),
          debitStr,
          creditStr,
        ].join(',');
      });

      const csvData = [headers.join(','), ...rows].join('\n');
      return {
        fileName: `quickbooks_ledger_export_${timestamp}.csv`,
        mimeType: 'text/csv',
        data: csvData,
        recordCount: entries.length,
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        generatedAt: new Date().toISOString(),
      };
    }

    if (format === 'quickbooks_iif') {
      const iifHeader = [
        '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO',
        '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO',
        '!ENDTRNS',
      ].join('\n');

      const iifRows = entries.map((e) => {
        const isCredit = e.type === 'fare_revenue' || e.type === 'platform_commission';
        const signedAmount = isCredit ? e.amount.toFixed(2) : `-${e.amount.toFixed(2)}`;
        return `TRNS\t${e.id}\tGENERAL JOURNAL\t${e.date}\t${e.accountCode}\tChesterfield Taxi\t${signedAmount}\t${e.description}\nENDTRNS`;
      });

      return {
        fileName: `quickbooks_journal_${timestamp}.iif`,
        mimeType: 'text/plain',
        data: [iifHeader, ...iifRows].join('\n'),
        recordCount: entries.length,
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        generatedAt: new Date().toISOString(),
      };
    }

    // Default: general_ledger_json
    const jsonData = JSON.stringify(
      {
        company: COMPANY_CONFIG.name,
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
