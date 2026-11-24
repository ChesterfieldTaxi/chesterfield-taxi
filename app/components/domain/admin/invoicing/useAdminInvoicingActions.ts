import React, { useState, useEffect, useMemo } from 'react';
import type {
  AppSettings,
  CorporateAccountConfig,
  InvoiceRecord,
} from '../../../../core/types/config';
import type {
  FinancialLedgerEntry,
  AccountingExportFormat,
  PrintableInvoiceData,
  CorporateUnbilledTransaction,
} from '../../../../core/types/invoicing';
import { getInvoicingService } from '../../../../core/services/invoicing.service';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import { getCorporateAccountService } from '../../../../core/services/corporate-account.service';
import { getEmailDispatchService } from '../../../../core/services/email';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import { formatLocalDateStr } from '../../../../core/services/pricing/vehicle-matching';

export type InvoicingSubTab =
  | 'ledger'
  | 'accounts'
  | 'payouts'
  | 'accounting-sync'
  | 'gateways'
  | 'telephony';
export type CorporateBillingCycleOption = 'net15' | 'net30' | 'net60' | 'immediate';
export type CorporateAccountFilterMode = 'all' | 'po_enforced' | 'po_disabled';
export type LedgerPeriodFilter = 'all' | '30d' | '7d' | 'today';
export type ArStatusFilter = 'all' | 'unbilled' | 'invoiced' | 'settled';
export type LedgerViewMode = 'ar_ledger' | 'invoices';
export type ProcessorStatus = 'idle' | 'checking' | 'connected' | 'error';
export type TestCallStatus = 'idle' | 'calling' | 'success' | 'error';
export type TestSmsStatus = 'idle' | 'sending' | 'success' | 'error';

export interface AdminInvoicingSubpageProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: InvoicingSubTab;
}

export interface UseAdminInvoicingActionsParams {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  activeSub: InvoicingSubTab;
}

export const ACCOUNTS_PER_PAGE = 30;

function triggerBrowserDownload(data: BlobPart, mimeType: string, fileName: string) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function postAuthorizedJson(endpoint: string, payload: Record<string, unknown>): Promise<any> {
  const resp = await authorizedFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

export function useAdminInvoicingActions({
  settings,
  onSave,
  activeSub,
}: UseAdminInvoicingActionsParams) {
  // Invoices & Corporate state from settings + Firestore sync
  const [firestoreInvoices, setFirestoreInvoices] = useState<InvoiceRecord[]>([]);
  const invoices = useMemo(() => {
    const byId = new Map<string, InvoiceRecord>();
    (settings.invoices || []).forEach((inv) => byId.set(inv.id, inv));
    firestoreInvoices.forEach((inv) => byId.set(inv.id, inv));
    return Array.from(byId.values()).sort((a, b) =>
      (b.issuedDate || '').localeCompare(a.issuedDate || '')
    );
  }, [settings.invoices, firestoreInvoices]);
  const corporateAccounts = settings.corporateAccounts || [];

  // Local state for modals & feedback banners
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isNewInvoiceModalOpen, setIsNewInvoiceModalOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEmailingInvoice, setIsEmailingInvoice] = useState(false);
  const [payLinkInvoiceBusyId, setPayLinkInvoiceBusyId] = useState<string | null>(null);

  const showSuccess = (msg: string, ms = 3500) => {
    setSaveSuccessMessage(msg);
    setTimeout(() => setSaveSuccessMessage(null), ms);
  };

  const showError = (msg: string, ms = 5000) => {
    setActionErrorMessage(msg);
    setTimeout(() => setActionErrorMessage(null), ms);
  };

  // New Corporate Account Form State
  const [newCorpName, setNewCorpName] = useState('');
  const [newCorpAccountNum, setNewCorpAccountNum] = useState('');
  const [newCorpCycle, setNewCorpCycle] = useState<CorporateBillingCycleOption>('net30');
  const [newCorpLimit, setNewCorpLimit] = useState(10000);
  const [newCorpContactName, setNewCorpContactName] = useState('');
  const [newCorpContactEmail, setNewCorpContactEmail] = useState('');
  const [newCorpDiscount, setNewCorpDiscount] = useState(0);
  const [newCorpPoRequired, setNewCorpPoRequired] = useState(false);

  // Corporate PO Management & Search State
  const [selectedPoAccount, setSelectedPoAccount] = useState<CorporateAccountConfig | null>(null);
  const [isRegeneratePoOpen, setIsRegeneratePoOpen] = useState(false);
  const [isPoHistoryOpen, setIsPoHistoryOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [copiedPoId, setCopiedPoId] = useState<string | null>(null);
  const [accountSearchTerm, setAccountSearchTerm] = useState('');
  const [accountFilter, setAccountFilter] = useState<CorporateAccountFilterMode>('all');
  const [accountPage, setAccountPage] = useState(1);

  // New Invoice Form State
  const [newInvCustomer, setNewInvCustomer] = useState('');
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvCorpId, setNewInvCorpId] = useState('');
  const [newInvAmount, setNewInvAmount] = useState(150);
  const [newInvDescription, setNewInvDescription] = useState('Airport Executive Transport');
  const [newInvDueDays, setNewInvDueDays] = useState(30);

  // Payment Gateways & Billing Policies state (persisted to AppSettings.billingSettings & pricing.defaultDriverCommissionRate)
  const [stripeTerminalEnabled, setStripeTerminalEnabled] = useState(
    () => settings.billingSettings?.stripeTerminalEnabled ?? true
  );
  const [passCardSurcharge, setPassCardSurcharge] = useState(
    () => settings.billingSettings?.passCardSurcharge ?? false
  );
  const [surchargePercent, setSurchargePercent] = useState(
    () => settings.billingSettings?.surchargePercent ?? 3.0
  );
  const [autoEmailReceipts, setAutoEmailReceipts] = useState(
    () => settings.billingSettings?.autoEmailReceipts ?? true
  );
  const [driverCommissionPercent, setDriverCommissionPercent] = useState(
    () => Math.round(((settings.pricing?.defaultDriverCommissionRate ?? 0.75) * 100))
  );

  useEffect(() => {
    if (settings.billingSettings) {
      if (settings.billingSettings.stripeTerminalEnabled !== undefined) {
        setStripeTerminalEnabled(settings.billingSettings.stripeTerminalEnabled);
      }
      if (settings.billingSettings.passCardSurcharge !== undefined) {
        setPassCardSurcharge(settings.billingSettings.passCardSurcharge);
      }
      if (settings.billingSettings.surchargePercent !== undefined) {
        setSurchargePercent(settings.billingSettings.surchargePercent);
      }
      if (settings.billingSettings.autoEmailReceipts !== undefined) {
        setAutoEmailReceipts(settings.billingSettings.autoEmailReceipts);
      }
    }
    if (typeof settings.pricing?.defaultDriverCommissionRate === 'number') {
      setDriverCommissionPercent(Math.round(settings.pricing.defaultDriverCommissionRate * 100));
    }
  }, [settings.billingSettings, settings.pricing?.defaultDriverCommissionRate]);

  // Gateway, Telephony & QuickBooks Public Identifiers (SSR-deterministic defaults; hydrated on client mount)
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>('test');
  const [stripePk, setStripePk] = useState('');
  const [stripeSk, setStripeSk] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [stripeStatus, setStripeStatus] = useState<ProcessorStatus>('idle');
  const [stripeStatusMsg, setStripeStatusMsg] = useState<string | null>(null);

  const [squareAppId, setSquareAppId] = useState('');
  const [squareToken, setSquareToken] = useState('');
  const [squareLocId, setSquareLocId] = useState('');
  const [squareStatus, setSquareStatus] = useState<ProcessorStatus>('idle');
  const [squareStatusMsg, setSquareStatusMsg] = useState<string | null>(null);

  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioPhone, setTwilioPhone] = useState('+13147380100');
  const [twilioStatus, setTwilioStatus] = useState<ProcessorStatus>('idle');
  const [twilioStatusMsg, setTwilioStatusMsg] = useState<string | null>(null);

  const [testCallPhone, setTestCallPhone] = useState('');
  const [testCallStatus, setTestCallStatus] = useState<TestCallStatus>('idle');
  const [testCallMsg, setTestCallMsg] = useState<string | null>(null);

  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsBody, setTestSmsBody] = useState('Hello! Your Chesterfield Taxi ride is confirmed.');
  const [testSmsStatus, setTestSmsStatus] = useState<TestSmsStatus>('idle');
  const [testSmsMsg, setTestSmsMsg] = useState<string | null>(null);

  const [qbClientId, setQbClientId] = useState('');
  const [qbClientSecret, setQbClientSecret] = useState('');
  const [qbRealmId, setQbRealmId] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('ct_stripe_mode') === 'live') setStripeMode('live');
    const storedStripePk = localStorage.getItem('ct_stripe_pk');
    if (storedStripePk) setStripePk(storedStripePk);
    const storedSquareAppId = localStorage.getItem('ct_square_appid');
    if (storedSquareAppId) setSquareAppId(storedSquareAppId);
    const storedSquareLocId = localStorage.getItem('ct_square_locid');
    if (storedSquareLocId) setSquareLocId(storedSquareLocId);
    const storedTwilioSid = localStorage.getItem('ct_twilio_sid');
    if (storedTwilioSid) setTwilioSid(storedTwilioSid);
    const storedTwilioPhone = localStorage.getItem('ct_twilio_phone');
    if (storedTwilioPhone) setTwilioPhone(storedTwilioPhone);
    const storedQbClientId = localStorage.getItem('ct_qb_client_id');
    if (storedQbClientId) setQbClientId(storedQbClientId);
    const storedQbRealmId = localStorage.getItem('ct_qb_realm_id');
    if (storedQbRealmId) setQbRealmId(storedQbRealmId);
  }, []);

  // Accounting Sync, Ledger & AR State
  const [ledgerEntries, setLedgerEntries] = useState<FinancialLedgerEntry[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerPeriodFilter>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [printableData, setPrintableData] = useState<PrintableInvoiceData | null>(null);
  const [unbilledTransactions, setUnbilledTransactions] = useState<CorporateUnbilledTransaction[]>([]);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [arFilter, setArFilter] = useState<ArStatusFilter>('all');
  const [ledgerViewMode, setLedgerViewMode] = useState<LedgerViewMode>('ar_ledger');

  const fetchUnbilled = async () => {
    try {
      const invoicingService = getInvoicingService();
      const txs = await invoicingService.getUnbilledTransactions();
      setUnbilledTransactions(txs);
      if (invoicingService.getInvoices) {
        const invs = await invoicingService.getInvoices();
        setFirestoreInvoices(invs);
      }
    } catch (err) {
      console.error('Failed to load corporate AR transactions:', err);
    }
  };

  const fetchLedger = async () => {
    try {
      const entries = await getInvoicingService().getLedgerEntries();
      setLedgerEntries(entries);
    } catch (err) {
      console.error('Failed to load ledger entries:', err);
    }
  };

  useEffect(() => {
    fetchUnbilled();
    fetchLedger();
  }, [activeSub]);

  const ledgerStartDate = useMemo(() => {
    const now = new Date();
    if (ledgerFilter === 'today') return formatLocalDateStr(now);
    if (ledgerFilter === '7d') return formatLocalDateStr(new Date(now.getTime() - 7 * 86_400_000));
    if (ledgerFilter === '30d') return formatLocalDateStr(new Date(now.getTime() - 30 * 86_400_000));
    return undefined;
  }, [ledgerFilter]);

  const filteredLedgerEntries = useMemo(() => {
    if (!ledgerStartDate) return ledgerEntries;
    return ledgerEntries.filter((e) => e.date >= ledgerStartDate);
  }, [ledgerEntries, ledgerStartDate]);

  useEffect(() => {
    if (selectedInvoice) {
      const fetchPrintable = async () => {
        const invoicingService = getInvoicingService();
        let activeInv = selectedInvoice;

        // Auto-provision 1-tap Pay Link token for open corporate invoices so PDF remittance footer always includes it
        if (activeInv.status !== 'paid' && !activeInv.payToken) {
          const linkRes = await getPayLinkService().createOrGetInvoicePayLink(activeInv);
          if (linkRes.success && linkRes.payToken && linkRes.payUrl) {
            activeInv = { ...activeInv, payToken: linkRes.payToken, payLinkUrl: linkRes.payUrl };
            if (invoicingService.saveInvoice) {
              await invoicingService.saveInvoice(activeInv).catch(() => null);
            }
            setFirestoreInvoices((prev) => [
              activeInv,
              ...prev.filter((item) => item.id !== activeInv.id),
            ]);
            setSelectedInvoice((curr) => (curr && curr.id === activeInv.id ? activeInv : curr));
          }
        }

        const data = await invoicingService.getPrintableInvoice(activeInv.id);
        setPrintableData(
          data
            ? {
                ...data,
                payToken: activeInv.payToken || data.payToken,
                payLinkUrl: activeInv.payLinkUrl || data.payLinkUrl,
              }
            : null
        );
      };
      fetchPrintable();
    } else {
      setPrintableData(null);
    }
  }, [selectedInvoice?.id]);

  // Summary Metrics: AR & Aging Analytics
  const totalUnbilledAR = unbilledTransactions
    .filter((tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice')
    .reduce((sum, tx) => sum + tx.totalAmount, 0);
  const unbilledCount = unbilledTransactions.filter(
    (tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice'
  ).length;

  const nowMs = Date.now();
  const overdue30DaysInvoices = invoices.filter((inv) => {
    if (inv.status === 'paid') return false;
    const daysSinceIssue = (nowMs - new Date(inv.issuedDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceIssue > 30 || inv.status === 'overdue';
  });
  const totalOverdue30Days = overdue30DaysInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const settledThisMonthInvoices = invoices.filter(
    (inv) =>
      inv.status === 'paid' &&
      (inv.paidDate ? inv.paidDate.startsWith(currentMonthStr) : inv.issuedDate.startsWith(currentMonthStr))
  );
  const settledRevenueThisMonth = settledThisMonthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  const handleExport = async (format: AccountingExportFormat) => {
    try {
      setIsExporting(true);
      const exportData = await getInvoicingService().exportLedger(format, ledgerStartDate);
      triggerBrowserDownload(exportData.data, exportData.mimeType, exportData.fileName);
      showSuccess(`Successfully exported ${exportData.recordCount} transactions (${exportData.fileName})`);
    } catch (e: unknown) {
      console.error('Export error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleInvoicePayLink = async (inv: InvoiceRecord, mode: 'copy' | 'email') => {
    try {
      setPayLinkInvoiceBusyId(`${inv.id}:${mode}`);
      setActionErrorMessage(null);

      if (mode === 'email' && !inv.customerEmail) {
        showError('No billing email address is configured on this invoice.', 4000);
        return;
      }

      const res = await getPayLinkService().createOrGetInvoicePayLink(inv, {
        sendEmail: mode === 'email',
        recipientEmail: inv.customerEmail,
      });

      if (!res.success || !res.payToken || !res.payUrl) {
        showError(res.error || 'Failed to generate corporate invoice Pay Link.', 5000);
        return;
      }

      const patchedInv: InvoiceRecord = { ...inv, payToken: res.payToken, payLinkUrl: res.payUrl };
      const invoicingService = getInvoicingService();
      if (invoicingService.saveInvoice) {
        await invoicingService.saveInvoice(patchedInv).catch(() => null);
      }
      const nextInvoices = invoices.map((item) => (item.id === inv.id ? patchedInv : item));
      setFirestoreInvoices(nextInvoices);
      await onSave({ invoices: nextInvoices }).catch(() => null);

      if (selectedInvoice?.id === inv.id) {
        setSelectedInvoice(patchedInv);
        setPrintableData((prev) =>
          prev ? { ...prev, payToken: res.payToken, payLinkUrl: res.payUrl } : prev
        );
      }

      await navigator.clipboard?.writeText(res.payUrl).catch(() => {});

      if (mode === 'email') {
        if (res.emailResult?.sent) {
          showSuccess(`1-tap Pay Link emailed to ${inv.customerEmail} (and copied to clipboard).`, 4500);
        } else {
          setActionErrorMessage(
            res.emailResult?.error || 'Pay Link generated & copied, but email delivery failed.'
          );
        }
      } else {
        showSuccess(`Copied 1-tap Pay Link for Invoice ${inv.invoiceNumber} (${res.payUrl}).`, 4500);
      }
    } catch (err: any) {
      showError(err?.message || 'Error generating invoice Pay Link.', 5000);
    } finally {
      setPayLinkInvoiceBusyId(null);
    }
  };

  const handleEmailInvoice = async (inv: InvoiceRecord) => {
    if (!inv.customerEmail) {
      showError('No billing email address is set on this invoice.', 4000);
      return;
    }
    try {
      setIsEmailingInvoice(true);
      setActionErrorMessage(null);
      let resolvedPayUrl = inv.payLinkUrl;
      if (inv.status !== 'paid' && !resolvedPayUrl) {
        const payRes = await getPayLinkService().createOrGetInvoicePayLink(inv);
        if (payRes.success && payRes.payUrl) resolvedPayUrl = payRes.payUrl;
      }

      const res = await getEmailDispatchService().sendCorporateInvoice({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issuedDate: inv.issuedDate,
        dueDate: inv.dueDate,
        billingCycle: inv.billingCycle,
        customerName: inv.customerName,
        customerEmail: inv.customerEmail,
        accountNumber: inv.accountNumber,
        lineItems: inv.lineItems.map((li) => ({
          date: li.date || inv.issuedDate,
          passengerName: li.passengerName,
          description: li.description,
          poNumber: li.poNumber,
          amount: li.amount,
        })),
        subtotal: inv.subtotal ?? inv.totalAmount,
        discountAmount: inv.discountAmount ?? 0,
        totalAmount: inv.totalAmount,
        notes: inv.notes,
        payLinkUrl: inv.status !== 'paid' ? resolvedPayUrl : undefined,
        companySettings: {
          name: settings.company?.name,
          phone: settings.company?.phone,
          address: settings.company?.address,
          email: settings.company?.email,
        },
      });
      if (res.success) {
        showSuccess(`Invoice ${inv.invoiceNumber} emailed to ${inv.customerEmail}.`, 4000);
      } else {
        showError(res.error || 'Unable to deliver invoice email.', 5000);
      }
    } catch (err: any) {
      showError(err?.message || 'Network error emailing invoice.', 5000);
    } finally {
      setIsEmailingInvoice(false);
    }
  };

  const handleRunBatchInvoicing = async (corp: CorporateAccountConfig) => {
    try {
      setIsSaving(true);
      setActionErrorMessage(null);
      const accountUnbilled = unbilledTransactions.filter(
        (tx) =>
          (tx.corporateAccountId === corp.id || tx.corporateAccountName === corp.companyName) &&
          (tx.status === 'unbilled' || tx.status === 'pending_invoice')
      );

      if (accountUnbilled.length === 0) {
        showSuccess(`No unbilled corporate transactions found for ${corp.companyName}.`, 3500);
        return;
      }

      const batchInvoice = await getInvoicingService().generateInvoiceFromUnbilled(corp.id, accountUnbilled);
      if (batchInvoice) {
        const updatedInvoices = [batchInvoice, ...invoices.filter((i) => i.id !== batchInvoice.id)];
        await onSave({ invoices: updatedInvoices });
        await fetchUnbilled();
        await fetchLedger();
        setSelectedInvoice(batchInvoice);
        showSuccess(
          `Generated batch statement ${batchInvoice.invoiceNumber} (${accountUnbilled.length} trips) for ${corp.companyName}`,
          4000
        );
      }
    } catch (err: any) {
      console.error('Failed to run batch invoicing:', err);
      showError(err?.message || 'Failed to generate batch invoice.', 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateInvoiceFromAR = async (targetTxs?: CorporateUnbilledTransaction[]) => {
    try {
      setIsSaving(true);
      setActionErrorMessage(null);
      const rawPool =
        targetTxs ||
        (selectedTxIds.length > 0
          ? unbilledTransactions.filter((tx) => selectedTxIds.includes(tx.id))
          : unbilledTransactions.filter((tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice'));

      const pool = rawPool.filter((tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice');
      if (pool.length === 0) {
        showError('No unbilled corporate transactions selected.', 3500);
        return;
      }

      // Enforce single-corporation grouping so multiple corporate clients are never mixed on one invoice!
      const distinctCorps = new Set(pool.map((tx) => tx.corporateAccountId));
      if (distinctCorps.size > 1) {
        showError(
          `Selected rides belong to ${distinctCorps.size} different corporate accounts. Please select rides for one corporate client per invoice.`,
          5000
        );
        return;
      }

      const newInv = await getInvoicingService().generateInvoiceFromUnbilled(pool[0].corporateAccountId, pool);
      if (newInv) {
        const updatedInvoices = [newInv, ...invoices.filter((i) => i.id !== newInv.id)];
        await onSave({ invoices: updatedInvoices });
        await fetchUnbilled();
        await fetchLedger();
        setSelectedTxIds([]);
        setSelectedInvoice(newInv);
        showSuccess(`Successfully generated ${newInv.invoiceNumber} covering ${pool.length} corporate trip(s).`, 4000);
      }
    } catch (err: any) {
      console.error('Failed to generate invoice from AR:', err);
      showError(err?.message || 'Failed to generate invoice from AR.', 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkARPaidSettled = async (targetTxIds?: string[]) => {
    try {
      setIsSaving(true);
      setActionErrorMessage(null);
      const idsToSettle = targetTxIds || selectedTxIds;
      if (idsToSettle.length === 0) {
        showError('Please select one or more transactions to settle.', 3000);
        return;
      }
      const invoicingService = getInvoicingService();
      if (invoicingService.settleUnbilledTransactions) {
        await invoicingService.settleUnbilledTransactions(idsToSettle);
      }
      setUnbilledTransactions((prev) =>
        prev.map((t) => (idsToSettle.includes(t.id) ? { ...t, status: 'settled' as const } : t))
      );
      const linkedInvoiceIds = Array.from(
        new Set(
          unbilledTransactions
            .filter((t) => idsToSettle.includes(t.id) && t.invoiceId)
            .map((t) => t.invoiceId as string)
        )
      );

      for (const invId of linkedInvoiceIds) {
        await invoicingService.markInvoicePaid(invId);
      }
      if (linkedInvoiceIds.length > 0) {
        const today = formatLocalDateStr(new Date());
        const updated = invoices.map((inv) =>
          linkedInvoiceIds.includes(inv.id) ? { ...inv, status: 'paid' as const, paidDate: today } : inv
        );
        await onSave({ invoices: updated });
      }
      await fetchUnbilled();
      await fetchLedger();
      setSelectedTxIds([]);
      showSuccess(`Marked ${idsToSettle.length} transaction(s) as Settled / Paid.`, 3500);
    } catch (err) {
      console.error('Failed to settle transactions:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportARForQuickBooks = () => {
    try {
      const txsToExport = unbilledTransactions.filter((tx) =>
        arFilter === 'all' ? true : tx.status === arFilter
      );
      const headers = [
        'Transaction Date', 'Account Number', 'Corporate Client', 'Passenger Name',
        'Pickup Address', 'Dropoff Address', 'Base Fare', 'Gratuity', 'Tolls',
        'Wait Time', 'Discount', 'Net Total', 'Status', 'Invoice Number', 'QuickBooks Account Code',
      ];
      const rows = txsToExport.map((t) => [
        t.pickupDate,
        `"${t.accountNumber || ''}"`,
        `"${t.corporateAccountName || ''}"`,
        `"${t.passengerName || ''}"`,
        `"${(t.pickupAddress || '').replace(/"/g, '""')}"`,
        `"${(t.dropoffAddress || '').replace(/"/g, '""')}"`,
        t.baseFare.toFixed(2),
        t.gratuity.toFixed(2),
        t.tolls.toFixed(2),
        t.waitTimeFee.toFixed(2),
        t.discountAmount.toFixed(2),
        t.totalAmount.toFixed(2),
        t.status,
        t.invoiceId || 'Unbilled',
        '1200-AccountsReceivable',
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      triggerBrowserDownload(
        csvContent,
        'text/csv;charset=utf-8;',
        `QuickBooks_AR_Ledger_${new Date().toISOString().slice(0, 10)}.csv`
      );
      showSuccess(`Exported ${txsToExport.length} transactions for QuickBooks AR.`, 3000);
    } catch (err) {
      console.error('Export QuickBooks CSV error:', err);
    }
  };

  const handleAddCorporateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCorpName || !newCorpContactEmail) return;

    try {
      setIsSaving(true);
      const service = getCorporateAccountService();
      const accountNum = newCorpAccountNum || `CORP-${Date.now().toString().slice(-4)}`;
      const generatedPo = service.generateSecurePoNumber(newCorpName, accountNum);

      const newAccount: CorporateAccountConfig = {
        id: `corp-${Date.now().toString(36)}`,
        companyName: newCorpName,
        accountNumber: accountNum,
        billingCycle: newCorpCycle,
        creditLimit: newCorpLimit,
        billingContactName: newCorpContactName || 'Accounts Payable',
        billingContactEmail: newCorpContactEmail,
        discountPercent: newCorpDiscount,
        poRequired: newCorpPoRequired,
        currentPoNumber: generatedPo,
        poGeneratedAt: new Date().toISOString(),
        poNumberHistory: [],
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const updatedAccounts = [...corporateAccounts, newAccount];
      await onSave({ corporateAccounts: updatedAccounts });
      await service.syncAccountToFirestore(newAccount);

      showSuccess(`Corporate account "${newCorpName}" registered with initial PO: ${generatedPo}`, 3500);
      setIsNewAccountModalOpen(false);
      setNewCorpName('');
      setNewCorpAccountNum('');
      setNewCorpContactName('');
      setNewCorpContactEmail('');
    } catch (err: unknown) {
      console.error('Failed to add corporate account:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePoRequired = async (account: CorporateAccountConfig) => {
    try {
      setIsSaving(true);
      const nextRequired = !account.poRequired;
      const service = getCorporateAccountService();
      const updatedAccount: CorporateAccountConfig = {
        ...account,
        poRequired: nextRequired,
        currentPoNumber:
          account.currentPoNumber ||
          (nextRequired ? service.generateSecurePoNumber(account.companyName, account.accountNumber) : undefined),
        updatedAt: new Date().toISOString(),
      };
      const updatedAccounts = corporateAccounts.map((a) => (a.id === account.id ? updatedAccount : a));
      await onSave({ corporateAccounts: updatedAccounts });
      await service.syncAccountToFirestore(updatedAccount);
      showSuccess(`PO requirement for "${account.companyName}" is now ${nextRequired ? 'Enforced' : 'Optional'}.`, 3500);
    } catch (err: unknown) {
      console.error('Failed to toggle PO required:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePoRegenerateSuccess = async (updatedAccount: CorporateAccountConfig, newPo: string) => {
    const updatedAccounts = corporateAccounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a));
    await onSave({ corporateAccounts: updatedAccounts });
    await getCorporateAccountService().syncAccountToFirestore(updatedAccount);
    showSuccess(`PO Number for ${updatedAccount.companyName} successfully regenerated: ${newPo}`, 4000);
  };

  const handleCsvImportSuccess = async (importedAccounts: CorporateAccountConfig[]) => {
    const map = new Map<string, CorporateAccountConfig>();
    corporateAccounts.forEach((a) => map.set(a.accountNumber || a.id, a));
    importedAccounts.forEach((a) => map.set(a.accountNumber || a.id, a));
    await onSave({ corporateAccounts: Array.from(map.values()) });
    await getCorporateAccountService().syncAccountsBatchToFirestore(importedAccounts);
    showSuccess(`Successfully imported ${importedAccounts.length} corporate accounts into database!`, 4000);
  };

  const handleCopyPo = (po: string, id: string) => {
    navigator.clipboard.writeText(po);
    setCopiedPoId(id);
    setTimeout(() => setCopiedPoId(null), 2000);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvCustomer || !newInvEmail) return;

    try {
      setIsSaving(true);
      setActionErrorMessage(null);
      const issuedDate = formatLocalDateStr(new Date());
      const dueDate = new Date(Date.now() + newInvDueDays * 86400000).toISOString().slice(0, 10);
      const matchedCorp = newInvCorpId ? corporateAccounts.find((c) => c.id === newInvCorpId) : undefined;
      const newInvoice: InvoiceRecord = {
        id: `inv-${Date.now().toString(36)}`,
        invoiceNumber: `INV-${new Date().getFullYear()}-${(invoices.length + 101).toString()}`,
        corporateAccountId: newInvCorpId || undefined,
        accountNumber: matchedCorp?.accountNumber,
        billingCycle: matchedCorp?.billingCycle,
        customerName: newInvCustomer,
        customerEmail: newInvEmail,
        tripIds: [],
        subtotal: Number(newInvAmount),
        discountAmount: 0,
        totalAmount: Number(newInvAmount),
        status: 'issued',
        issuedDate,
        dueDate,
        lineItems: [
          {
            date: issuedDate,
            passengerName: newInvCustomer,
            description: newInvDescription,
            amount: Number(newInvAmount),
          },
        ],
      };

      const invoicingService = getInvoicingService();
      if (invoicingService.saveInvoice) await invoicingService.saveInvoice(newInvoice);
      await invoicingService.recordLedgerEntry({
        date: issuedDate,
        type: 'fare_revenue',
        corporateAccountId: newInvoice.corporateAccountId,
        invoiceId: newInvoice.id,
        amount: newInvoice.totalAmount,
        description: `Direct Invoice ${newInvoice.invoiceNumber} issued to ${newInvoice.customerName}`,
        accountCode: '1200-AccountsReceivable',
      });

      const updatedInvoices = [newInvoice, ...invoices.filter((i) => i.id !== newInvoice.id)];
      await onSave({ invoices: updatedInvoices });

      const emailRes = await getEmailDispatchService().sendCorporateInvoice({
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoice.invoiceNumber,
        issuedDate: newInvoice.issuedDate,
        dueDate: newInvoice.dueDate,
        billingCycle: newInvoice.billingCycle,
        customerName: newInvoice.customerName,
        customerEmail: newInvoice.customerEmail,
        accountNumber: newInvoice.accountNumber,
        lineItems: newInvoice.lineItems.map((li) => ({
          date: li.date || issuedDate,
          passengerName: li.passengerName,
          description: li.description,
          amount: li.amount,
        })),
        subtotal: newInvoice.subtotal ?? newInvoice.totalAmount,
        discountAmount: 0,
        totalAmount: newInvoice.totalAmount,
        companySettings: {
          name: settings.company?.name,
          phone: settings.company?.phone,
          address: settings.company?.address,
          email: settings.company?.email,
        },
      });

      await fetchUnbilled();
      await fetchLedger();

      showSuccess(
        emailRes.success
          ? `Invoice #${newInvoice.invoiceNumber} issued and emailed to ${newInvoice.customerEmail}.`
          : `Invoice #${newInvoice.invoiceNumber} saved (Email warning: ${emailRes.error || 'delivery offline'}).`,
        4500
      );
      setIsNewInvoiceModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create invoice:', err);
      showError(err?.message || 'Failed to create invoice.', 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvoiceStatusUpdate = async (
    invoiceId: string,
    newStatus: 'paid' | 'overdue' | 'issued' | 'draft'
  ) => {
    try {
      setIsSaving(true);
      setActionErrorMessage(null);
      const today = formatLocalDateStr(new Date());
      if (newStatus === 'paid') await getInvoicingService().markInvoicePaid(invoiceId);

      const updatedInvoices = invoices.map((inv) =>
        inv.id === invoiceId
          ? { ...inv, status: newStatus, paidDate: newStatus === 'paid' ? today : inv.paidDate }
          : inv
      );
      await onSave({ invoices: updatedInvoices });
      await fetchUnbilled();
      await fetchLedger();
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice({
          ...selectedInvoice,
          status: newStatus,
          paidDate: newStatus === 'paid' ? today : selectedInvoice.paidDate,
        });
      }
      showSuccess(`Invoice marked as ${newStatus.toUpperCase()}.`, 3000);
    } catch (err) {
      console.error('Failed to update invoice status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBillingPolicies = async () => {
    try {
      setIsSaving(true);
      const clampedCommission = Math.max(0.1, Math.min(0.99, Number((driverCommissionPercent / 100).toFixed(2))));
      await onSave({
        billingSettings: {
          ...(settings.billingSettings || {}),
          stripeTerminalEnabled,
          passCardSurcharge,
          surchargePercent: Number(surchargePercent) || 3.0,
          autoEmailReceipts,
        },
        pricing: { ...settings.pricing, defaultDriverCommissionRate: clampedCommission },
      });
      showSuccess('Payment policies, receipt automation, and driver commission rate saved.', 3500);
    } catch (err: any) {
      showError(err?.message || 'Failed to save payment policies.', 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiCredentials = (category: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ct_stripe_mode', stripeMode);
      localStorage.setItem('ct_stripe_pk', stripePk.trim());
      localStorage.setItem('ct_square_appid', squareAppId.trim());
      localStorage.setItem('ct_square_locid', squareLocId.trim());
      localStorage.setItem('ct_twilio_sid', twilioSid.trim());
      localStorage.setItem('ct_twilio_phone', twilioPhone.trim());
      localStorage.setItem('ct_qb_client_id', qbClientId.trim());
      localStorage.setItem('ct_qb_realm_id', qbRealmId.trim());
      ['ct_stripe_sk', 'ct_stripe_webhook', 'ct_square_token', 'ct_twilio_token', 'ct_qb_client_secret'].forEach(
        (k) => localStorage.removeItem(k)
      );
    }
    setStripeSk('');
    setStripeWebhookSecret('');
    setSquareToken('');
    setTwilioToken('');
    setQbClientSecret('');
    showSuccess(`${category} public identifiers saved. Secret keys remain managed via server environment variables.`, 3500);
  };

  const handleTestStripe = async () => {
    setStripeStatus('checking');
    setStripeStatusMsg('Authenticating with Stripe API...');
    try {
      const data = await postAuthorizedJson('/api/payments', {
        action: 'verify_processor',
        processor: 'stripe',
        credentials: { stripeSecretKey: stripeSk.trim() },
      });
      if (data.success) {
        setStripeStatus('connected');
        setStripeStatusMsg(data.message || 'Stripe connected successfully!');
      } else {
        setStripeStatus('error');
        setStripeStatusMsg(data.error || data.message || 'Stripe connection failed.');
      }
    } catch (err: any) {
      setStripeStatus('error');
      setStripeStatusMsg(err.message || 'Network error connecting to Stripe.');
    }
  };

  const handleTestSquare = async () => {
    setSquareStatus('checking');
    setSquareStatusMsg('Authenticating with Square API...');
    try {
      const data = await postAuthorizedJson('/api/payments', {
        action: 'verify_processor',
        processor: 'square',
        credentials: { squareAccessToken: squareToken.trim() },
      });
      if (data.success) {
        setSquareStatus('connected');
        setSquareStatusMsg(data.message || 'Square connected successfully!');
      } else {
        setSquareStatus('error');
        setSquareStatusMsg(data.error || data.message || 'Square connection failed.');
      }
    } catch (err: any) {
      setSquareStatus('error');
      setSquareStatusMsg(err.message || 'Network error connecting to Square.');
    }
  };

  const handleTestTwilioCreds = async () => {
    setTwilioStatus('checking');
    setTwilioStatusMsg('Connecting to Twilio Accounts API...');
    try {
      const data = await postAuthorizedJson('/api/telephony', {
        action: 'verify_credentials',
        credentials: { accountSid: twilioSid.trim(), authToken: twilioToken.trim(), phoneNumber: twilioPhone.trim() },
      });
      if (data.success) {
        setTwilioStatus('connected');
        setTwilioStatusMsg(data.message || 'Twilio account authenticated successfully!');
      } else {
        setTwilioStatus('error');
        setTwilioStatusMsg(data.error || data.message || 'Twilio authentication failed.');
      }
    } catch (err: any) {
      setTwilioStatus('error');
      setTwilioStatusMsg(err.message || 'Network error communicating with Twilio.');
    }
  };

  const handlePlaceTestCall = async () => {
    if (!testCallPhone.trim()) {
      setTestCallStatus('error');
      setTestCallMsg('Please enter a destination phone number to call.');
      return;
    }
    setTestCallStatus('calling');
    setTestCallMsg(`Placing outbound voice call to ${testCallPhone}...`);
    try {
      const data = await postAuthorizedJson('/api/telephony', {
        action: 'make_call',
        to: testCallPhone.trim(),
        credentials: { accountSid: twilioSid.trim(), authToken: twilioToken.trim(), phoneNumber: twilioPhone.trim() },
      });
      if (data.success) {
        setTestCallStatus('success');
        setTestCallMsg(data.message || `Call initiated! Call SID: ${data.callSid}. Your phone should ring shortly.`);
      } else {
        setTestCallStatus('error');
        setTestCallMsg(data.message || data.error || 'Failed to place call via Twilio.');
      }
    } catch (err: any) {
      setTestCallStatus('error');
      setTestCallMsg(err.message || 'Network error placing phone call.');
    }
  };

  const handleSendTestSms = async () => {
    if (!testSmsPhone.trim()) {
      setTestSmsStatus('error');
      setTestSmsMsg('Please enter a recipient phone number for the test SMS.');
      return;
    }
    setTestSmsStatus('sending');
    setTestSmsMsg(`Dispatching SMS to ${testSmsPhone}...`);
    try {
      const data = await postAuthorizedJson('/api/telephony', {
        action: 'send_sms',
        to: testSmsPhone.trim(),
        body: testSmsBody.trim(),
        credentials: { accountSid: twilioSid.trim(), authToken: twilioToken.trim(), phoneNumber: twilioPhone.trim() },
      });
      if (data.success) {
        setTestSmsStatus('success');
        setTestSmsMsg(data.message || `SMS sent! Message SID: ${data.messageSid}. Check your phone.`);
      } else {
        setTestSmsStatus('error');
        setTestSmsMsg(data.message || data.error || 'Failed to send SMS via Twilio.');
      }
    } catch (err: any) {
      setTestSmsStatus('error');
      setTestSmsMsg(err.message || 'Network error sending SMS.');
    }
  };

  return {
    invoices, corporateAccounts, selectedInvoice, setSelectedInvoice,
    isNewAccountModalOpen, setIsNewAccountModalOpen, isNewInvoiceModalOpen, setIsNewInvoiceModalOpen,
    saveSuccessMessage, actionErrorMessage, isSaving, isEmailingInvoice, payLinkInvoiceBusyId,
    newCorpName, setNewCorpName, newCorpAccountNum, setNewCorpAccountNum,
    newCorpCycle, setNewCorpCycle, newCorpLimit, setNewCorpLimit,
    newCorpContactName, setNewCorpContactName, newCorpContactEmail, setNewCorpContactEmail,
    newCorpDiscount, setNewCorpDiscount, newCorpPoRequired, setNewCorpPoRequired,
    selectedPoAccount, setSelectedPoAccount, isRegeneratePoOpen, setIsRegeneratePoOpen,
    isPoHistoryOpen, setIsPoHistoryOpen, isCsvModalOpen, setIsCsvModalOpen,
    copiedPoId, accountSearchTerm, setAccountSearchTerm, accountFilter, setAccountFilter, accountPage, setAccountPage,
    newInvCustomer, setNewInvCustomer, newInvEmail, setNewInvEmail, newInvCorpId, setNewInvCorpId,
    newInvAmount, setNewInvAmount, newInvDescription, setNewInvDescription, newInvDueDays, setNewInvDueDays,
    stripeTerminalEnabled, setStripeTerminalEnabled, passCardSurcharge, setPassCardSurcharge,
    surchargePercent, setSurchargePercent, autoEmailReceipts, setAutoEmailReceipts,
    driverCommissionPercent, setDriverCommissionPercent, stripeMode, setStripeMode,
    stripePk, setStripePk, stripeSk, setStripeSk, stripeWebhookSecret, setStripeWebhookSecret,
    stripeStatus, stripeStatusMsg, squareAppId, setSquareAppId, squareToken, setSquareToken,
    squareLocId, setSquareLocId, squareStatus, squareStatusMsg,
    twilioSid, setTwilioSid, twilioToken, setTwilioToken, twilioPhone, setTwilioPhone,
    twilioStatus, twilioStatusMsg, testCallPhone, setTestCallPhone, testCallStatus, testCallMsg,
    testSmsPhone, setTestSmsPhone, testSmsBody, setTestSmsBody, testSmsStatus, testSmsMsg,
    qbClientId, setQbClientId, qbClientSecret, setQbClientSecret, qbRealmId, setQbRealmId,
    ledgerFilter, setLedgerFilter, filteredLedgerEntries, isExporting, printableData,
    unbilledTransactions, selectedTxIds, setSelectedTxIds, arFilter, setArFilter,
    ledgerViewMode, setLedgerViewMode, totalUnbilledAR, unbilledCount,
    overdue30DaysInvoices, totalOverdue30Days, settledThisMonthInvoices, settledRevenueThisMonth,
    totalInvoiced, totalPaid, totalOutstanding,
    handleExport, handleInvoicePayLink, handleEmailInvoice, handleRunBatchInvoicing,
    handleGenerateInvoiceFromAR, handleMarkARPaidSettled, handleExportARForQuickBooks,
    handleAddCorporateAccount, handleTogglePoRequired, handlePoRegenerateSuccess,
    handleCsvImportSuccess, handleCopyPo, handleCreateInvoice, handleInvoiceStatusUpdate,
    handleSaveBillingPolicies, handleSaveApiCredentials, handleTestStripe, handleTestSquare,
    handleTestTwilioCreds, handlePlaceTestCall, handleSendTestSms,
  };
}

export type AdminInvoicingActionsState = ReturnType<typeof useAdminInvoicingActions>;
