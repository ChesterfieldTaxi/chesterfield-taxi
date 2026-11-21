/**
 * Invoicing & Accounting Ledger Types
 * 
 * Defines contracts for B2B corporate billing cycles, automated batch invoice runs,
 * printable PDF generation, and accounting ledger export (QuickBooks CSV / JSON).
 */

import type { InvoiceRecord, CorporateAccountConfig } from './config';
import type { Trip } from './trip';

export type LedgerEntryType =
  | 'fare_revenue'
  | 'invoice_settlement'
  | 'tip_collected'
  | 'driver_payout'
  | 'platform_commission'
  | 'toll_reimbursement'
  | 'cancellation_fee'
  | 'refund';

export interface FinancialLedgerEntry {
  id: string;
  date: string; // ISO 8601 YYYY-MM-DD
  type: LedgerEntryType;
  tripId?: string;
  invoiceId?: string;
  corporateAccountId?: string;
  driverId?: string;
  amount: number;
  description: string;
  accountCode: string; // e.g. "4010-FareRevenue", "5010-DriverPayout", "2020-TollsReimbursement"
  createdAt: string;
}

export type AccountingExportFormat = 'quickbooks_csv' | 'quickbooks_iif' | 'general_ledger_json';

export interface AccountingSyncExport {
  fileName: string;
  mimeType: string;
  data: string;
  recordCount: number;
  totalDebit: number;
  totalCredit: number;
  generatedAt: string;
}

export interface PdfInvoiceLineItem {
  tripId?: string;
  date: string;
  description: string;
  passengerName?: string;
  pickupDropoff?: string;
  poNumber?: string;
  amount: number;
}

export interface PrintableInvoiceData {
  invoiceNumber: string;
  issuedDate: string;
  dueDate: string;
  corporateAccount?: CorporateAccountConfig;
  customerName: string;
  customerEmail: string;
  billingAddress?: string;
  status: 'draft' | 'issued' | 'paid' | 'overdue';
  paidDate?: string;
  paidAt?: string;
  paymentReference?: string;
  payToken?: string;
  payLinkUrl?: string;
  lineItems: PdfInvoiceLineItem[];
  subtotal: number;
  discountAmount?: number;
  totalAmount: number;
  notes?: string;
  remittanceInfo: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    routingNumber: string;
    dispatchPhone: string;
    billingEmail: string;
  };
}

export interface CorporateBatchBillingResult {
  corporateAccountId: string;
  companyName: string;
  invoicesGenerated: number;
  totalBilledAmount: number;
  tripsCount: number;
  invoiceIds: string[];
}

export interface CorporateUnbilledTransaction {
  id: string;
  tripId: string;
  corporateAccountId: string;
  corporateAccountName: string;
  accountNumber?: string;
  passengerName: string;
  passengerPhone?: string;
  pickupDate: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleDisplayName?: string;
  poNumber?: string;
  authorizedBy?: string;
  baseFare: number;
  gratuity: number;
  tolls: number;
  waitTimeFee: number;
  discountAmount: number;
  discountAlreadyApplied?: boolean;
  totalAmount: number;
  status: 'unbilled' | 'pending_invoice' | 'invoiced' | 'paid' | 'settled';
  invoiceId?: string;
  createdAt: string;
}

export interface IInvoicingService {
  /**
   * Generates a printable PDF data structure and print layout for an invoice.
   */
  getPrintableInvoice(invoiceId: string): Promise<PrintableInvoiceData | null>;

  /**
   * Automatically consolidates unbilled completed trips for a corporate account
   * into a newly issued InvoiceRecord.
   */
  generateBatchInvoiceForCorporate(
    corporateAccountId: string,
    unbilledTrips: Trip[]
  ): Promise<InvoiceRecord | null>;

  /**
   * Generates a consolidated invoice from specific selected unbilled corporate transactions.
   */
  generateInvoiceFromUnbilled(
    corporateAccountId: string,
    unbilledTransactions: CorporateUnbilledTransaction[]
  ): Promise<InvoiceRecord | null>;

  /**
   * Records a completed corporate account trip into the unbilled AR queue
   * and verifies credit availability.
   */
  handleCorporateTripCompleted(
    trip: Trip,
    corporateAccount?: CorporateAccountConfig
  ): Promise<CorporateUnbilledTransaction | null>;

  /**
   * Retrieves all corporate unbilled transactions, optionally filtered by corporateAccountId.
   */
  getUnbilledTransactions(corporateAccountId?: string): Promise<CorporateUnbilledTransaction[]>;

  /**
   * Retrieves persisted invoices from Firestore / settings cache.
   */
  getInvoices?(): Promise<InvoiceRecord[]>;

  /**
   * Persists a direct/manual invoice to Firestore & balanced AR ledger.
   */
  saveInvoice?(invoice: InvoiceRecord): Promise<InvoiceRecord>;

  /**
   * Computes current open accounts receivable balance for a corporate account.
   */
  getCorporateAccountBalance?(corporateAccountId: string): Promise<number>;

  /**
   * Marks an issued invoice as paid / settled and records corresponding ledger entries.
   */
  markInvoicePaid(invoiceId: string): Promise<InvoiceRecord | null>;

  /**
   * Marks specific unbilled/invoiced AR rows as settled (and settles linked invoices).
   */
  settleUnbilledTransactions?(txIds: string[]): Promise<void>;

  /**
   * Records a balanced transaction entry into the financial ledger.
   */
  recordLedgerEntry(entry: Omit<FinancialLedgerEntry, 'id' | 'createdAt'>): Promise<FinancialLedgerEntry>;

  /**
   * Retrieves ledger entries filtered by date range and type.
   */
  getLedgerEntries(filter?: {
    startDate?: string;
    endDate?: string;
    type?: LedgerEntryType;
    corporateAccountId?: string;
  }): Promise<FinancialLedgerEntry[]>;

  /**
   * Exports ledger transactions formatted for QuickBooks (CSV/IIF) or General Ledger JSON.
   */
  exportLedger(
    format: AccountingExportFormat,
    startDate?: string,
    endDate?: string
  ): Promise<AccountingSyncExport>;
}
