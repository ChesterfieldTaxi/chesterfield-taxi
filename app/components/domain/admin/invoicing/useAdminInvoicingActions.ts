import React, { useState, useEffect, useMemo } from 'react';
import {
  normalizeBillingSettingsConfig,
  normalizeCorporatePortalPolicy,
  type AppSettings,
  type BillingSettingsConfig,
  type CorporateAccountConfig,
  type CreditLimitEnforcementMode,
  type InvoiceRecord,
  type NormalizedBillingSettingsConfig,
} from '../../../../core/types/config';
import type {
  FinancialLedgerEntry,
  AccountingExportFormat,
  PrintableInvoiceData,
  CorporateUnbilledTransaction,
  LedgerEntryType,
} from '../../../../core/types/invoicing';
import { getInvoicingService } from '../../../../core/services/invoicing.service';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import { getCorporateAccountService } from '../../../../core/services/corporate-account.service';
import { formatLocalDateStr } from '../../../../core/services/pricing/vehicle-matching';
import {
  buildQuickBooksArCsv,
  dispatchCorporateInvoiceEmailWithPayLink,
  triggerInvoicingBrowserDownload,
} from './invoicing-helpers.util';
import { useAdminPayoutsController } from './useAdminPayoutsController';

export type InvoicingSubTab =
  | 'ledger'
  | 'accounts'
  | 'driver-payouts'
  | 'staff-payouts'
  | 'other-payees'
  | 'payouts'
  | 'accounting-sync';
export type CorporateBillingCycleOption = 'net15' | 'net30' | 'net60' | 'immediate';
export type CorporateAccountFilterMode = 'all' | 'po_enforced' | 'po_disabled';
export type LedgerPeriodFilter = 'all' | '30d' | '7d' | 'today';
export type LedgerEntryTypeFilter = 'all' | LedgerEntryType;
export type ArStatusFilter = 'all' | 'unbilled' | 'invoiced' | 'settled';
export type LedgerViewMode = 'ar_ledger' | 'invoices';

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

export function useAdminInvoicingActions({
  settings,
  onSave,
  activeSub,
}: UseAdminInvoicingActionsParams) {
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
  const portalPolicy = useMemo(
    () => normalizeCorporatePortalPolicy(settings.corporatePortalPolicy),
    [settings.corporatePortalPolicy]
  );

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

  const [newCorpName, setNewCorpName] = useState('');
  const [newCorpCycle, setNewCorpCycle] = useState<CorporateBillingCycleOption>('net30');
  const [newCorpLimit, setNewCorpLimit] = useState(10000);
  const [newCorpContactName, setNewCorpContactName] = useState('');
  const [newCorpContactEmail, setNewCorpContactEmail] = useState('');
  const [newCorpDiscount, setNewCorpDiscount] = useState(0);
  const [newCorpPoRequired, setNewCorpPoRequired] = useState(
    portalPolicy.defaultRequirePoForNewAccounts
  );
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [accountSearchTerm, setAccountSearchTerm] = useState('');
  const [accountPage, setAccountPage] = useState(1);

  const [newInvCustomer, setNewInvCustomer] = useState('');
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvCorpId, setNewInvCorpId] = useState('');
  const [newInvAmount, setNewInvAmount] = useState(150);
  const [newInvDescription, setNewInvDescription] = useState('Airport Executive Transport');
  const [newInvDueDays, setNewInvDueDays] = useState(30);

  const [billingDraft, setBillingDraft] = useState<NormalizedBillingSettingsConfig>(() =>
    normalizeBillingSettingsConfig({
      ...(settings.billingSettings || {}),
      driverDefaultCommissionPercent:
        settings.billingSettings?.driverDefaultCommissionPercent ??
        Math.round((settings.pricing?.defaultDriverCommissionRate ?? 0.75) * 100),
    })
  );

  useEffect(() => {
    setBillingDraft(
      normalizeBillingSettingsConfig({
        ...(settings.billingSettings || {}),
        driverDefaultCommissionPercent:
          settings.billingSettings?.driverDefaultCommissionPercent ??
          Math.round((settings.pricing?.defaultDriverCommissionRate ?? 0.75) * 100),
      })
    );
  }, [settings.billingSettings, settings.pricing?.defaultDriverCommissionRate]);

  const [ledgerEntries, setLedgerEntries] = useState<FinancialLedgerEntry[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerPeriodFilter>('all');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<LedgerEntryTypeFilter>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [printableData, setPrintableData] = useState<PrintableInvoiceData | null>(null);
  const [unbilledTransactions, setUnbilledTransactions] = useState<CorporateUnbilledTransaction[]>([]);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [arFilter, setArFilter] = useState<ArStatusFilter>('all');
  const [ledgerViewMode, setLedgerViewMode] = useState<LedgerViewMode>('ar_ledger');

  const fetchUnbilled = async () => {
    try {
      const invoicingService = getInvoicingService();
      setUnbilledTransactions(await invoicingService.getUnbilledTransactions());
      if (invoicingService.getInvoices) {
        setFirestoreInvoices(await invoicingService.getInvoices());
      }
    } catch (err) {
      console.error('Failed to load corporate AR transactions:', err);
    }
  };

  const fetchLedger = async () => {
    try {
      setLedgerEntries(await getInvoicingService().getLedgerEntries());
    } catch (err) {
      console.error('Failed to load ledger entries:', err);
    }
  };

  useEffect(() => {
    fetchUnbilled();
    fetchLedger();
  }, [activeSub]);

  const payouts = useAdminPayoutsController({
    settings,
    billingDraft,
    activeSub,
    isActivePayoutsSub:
      activeSub === 'driver-payouts' ||
      activeSub === 'staff-payouts' ||
      activeSub === 'other-payees' ||
      activeSub === 'payouts',
    onSave,
    setIsSaving,
    showSuccess,
    onLedgerRefresh: fetchLedger,
  });

  const ledgerStartDate = useMemo(() => {
    const now = new Date();
    if (ledgerFilter === 'today') return formatLocalDateStr(now);
    if (ledgerFilter === '7d') return formatLocalDateStr(new Date(now.getTime() - 7 * 86_400_000));
    if (ledgerFilter === '30d') return formatLocalDateStr(new Date(now.getTime() - 30 * 86_400_000));
    return undefined;
  }, [ledgerFilter]);

  const filteredLedgerEntries = useMemo(
    () =>
      ledgerEntries.filter((e) => {
        if (ledgerStartDate && e.date < ledgerStartDate) return false;
        if (ledgerTypeFilter !== 'all' && e.type !== ledgerTypeFilter) return false;
        return true;
      }),
    [ledgerEntries, ledgerStartDate, ledgerTypeFilter]
  );

  useEffect(() => {
    if (!selectedInvoice) {
      setPrintableData(null);
      return;
    }
    const fetchPrintable = async () => {
      const invoicingService = getInvoicingService();
      let activeInv = selectedInvoice;
      if (activeInv.status !== 'paid' && !activeInv.payToken) {
        const linkRes = await getPayLinkService().createOrGetInvoicePayLink(activeInv, {
          expiresInHours: billingDraft.payLinkExpiryHours,
          allowTip: billingDraft.payLinkAllowTipOnInvoices,
          billingSettings: billingDraft,
        });
        if (linkRes.success && linkRes.payToken && linkRes.payUrl) {
          activeInv = { ...activeInv, payToken: linkRes.payToken, payLinkUrl: linkRes.payUrl };
          if (invoicingService.saveInvoice) await invoicingService.saveInvoice(activeInv).catch(() => null);
          setFirestoreInvoices((prev) => [activeInv, ...prev.filter((item) => item.id !== activeInv.id)]);
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
  }, [selectedInvoice?.id]);

  const totalUnbilledAR = unbilledTransactions
    .filter((tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice')
    .reduce((sum, tx) => sum + tx.totalAmount, 0);
  const unbilledCount = unbilledTransactions.filter(
    (tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice'
  ).length;
  const nowMs = Date.now();
  const overdue30DaysInvoices = invoices.filter(
    (inv) =>
      inv.status !== 'paid' &&
      ((nowMs - new Date(inv.issuedDate).getTime()) / 86_400_000 > 30 || inv.status === 'overdue')
  );
  const totalOverdue30Days = overdue30DaysInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const settledThisMonthInvoices = invoices.filter(
    (inv) =>
      inv.status === 'paid' &&
      (inv.paidDate ? inv.paidDate.startsWith(currentMonthStr) : inv.issuedDate.startsWith(currentMonthStr))
  );
  const settledRevenueThisMonth = settledThisMonthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const handleExport = async (format: AccountingExportFormat) => {
    try {
      setIsExporting(true);
      const exportData = await getInvoicingService().exportLedger(format, ledgerStartDate);
      triggerInvoicingBrowserDownload(exportData.data, exportData.mimeType, exportData.fileName);
      showSuccess(`Exported ${exportData.recordCount} ledger records (${exportData.fileName}).`);
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
        expiresInHours: billingDraft.payLinkExpiryHours,
        allowTip: billingDraft.payLinkAllowTipOnInvoices,
        billingSettings: billingDraft,
        sendEmail: mode === 'email',
        recipientEmail: inv.customerEmail,
      });
      if (!res.success || !res.payToken || !res.payUrl) {
        showError(res.error || 'Failed to generate corporate invoice Pay Link.', 5000);
        return;
      }
      const patchedInv: InvoiceRecord = { ...inv, payToken: res.payToken, payLinkUrl: res.payUrl };
      const invoicingService = getInvoicingService();
      if (invoicingService.saveInvoice) await invoicingService.saveInvoice(patchedInv).catch(() => null);
      const nextInvoices = invoices.map((item) => (item.id === inv.id ? patchedInv : item));
      setFirestoreInvoices(nextInvoices);
      await onSave({ invoices: nextInvoices }).catch(() => null);
      if (selectedInvoice?.id === inv.id) {
        setSelectedInvoice(patchedInv);
        setPrintableData((p) => (p ? { ...p, payToken: res.payToken, payLinkUrl: res.payUrl } : p));
      }
      await navigator.clipboard?.writeText(res.payUrl).catch(() => {});
      if (mode === 'email') {
        if (res.emailResult?.sent) {
          showSuccess(`1-tap Pay Link emailed to ${inv.customerEmail} (and copied).`, 4500);
        } else {
          showError(res.emailResult?.error || 'Pay Link copied, but email delivery failed.');
        }
      } else {
        showSuccess(`Copied 1-tap Pay Link for Invoice ${inv.invoiceNumber}.`, 4000);
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
      const res = await dispatchCorporateInvoiceEmailWithPayLink({ inv, settings, billingDraft });
      if (res.success) showSuccess(`Invoice ${inv.invoiceNumber} emailed to ${inv.customerEmail}.`, 4000);
      else showError(res.error || 'Unable to deliver invoice email.', 5000);
    } catch (err: any) {
      showError(err?.message || 'Network error emailing invoice.', 5000);
    } finally {
      setIsEmailingInvoice(false);
    }
  };

  const handleRunBatchInvoicing = async (corp: CorporateAccountConfig) => {
    try {
      setIsSaving(true);
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
        await onSave({ invoices: [batchInvoice, ...invoices.filter((i) => i.id !== batchInvoice.id)] });
        await fetchUnbilled();
        await fetchLedger();
        setSelectedInvoice(batchInvoice);
        showSuccess(`Generated batch statement ${batchInvoice.invoiceNumber} for ${corp.companyName}.`, 4000);
      }
    } catch (err: any) {
      showError(err?.message || 'Failed to generate batch invoice.', 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateInvoiceFromAR = async (targetTxs?: CorporateUnbilledTransaction[]) => {
    try {
      setIsSaving(true);
      const rawPool =
        targetTxs ||
        (selectedTxIds.length > 0
          ? unbilledTransactions.filter((tx) => selectedTxIds.includes(tx.id))
          : unbilledTransactions.filter((tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice'));
      const pool = rawPool.filter((tx) => tx.status === 'unbilled' || tx.status === 'pending_invoice');
      if (pool.length === 0) return showError('No unbilled corporate transactions selected.', 3500);
      if (new Set(pool.map((tx) => tx.corporateAccountId)).size > 1) {
        return showError('Please select rides for one corporate client per invoice.', 5000);
      }
      const newInv = await getInvoicingService().generateInvoiceFromUnbilled(pool[0].corporateAccountId, pool);
      if (newInv) {
        await onSave({ invoices: [newInv, ...invoices.filter((i) => i.id !== newInv.id)] });
        await fetchUnbilled();
        await fetchLedger();
        setSelectedTxIds([]);
        setSelectedInvoice(newInv);
        showSuccess(`Generated ${newInv.invoiceNumber} (${pool.length} trips).`, 4000);
      }
    } catch (err: any) {
      showError(err?.message || 'Failed to generate invoice from AR.', 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkARPaidSettled = async (targetTxIds?: string[]) => {
    try {
      setIsSaving(true);
      const idsToSettle = targetTxIds || selectedTxIds;
      if (idsToSettle.length === 0) return showError('Select one or more transactions to settle.', 3000);
      const invoicingService = getInvoicingService();
      if (invoicingService.settleUnbilledTransactions) await invoicingService.settleUnbilledTransactions(idsToSettle);
      const linkedInvoiceIds = Array.from(
        new Set(
          unbilledTransactions.filter((t) => idsToSettle.includes(t.id) && t.invoiceId).map((t) => t.invoiceId as string)
        )
      );
      for (const invId of linkedInvoiceIds) await invoicingService.markInvoicePaid(invId);
      if (linkedInvoiceIds.length > 0) {
        const today = formatLocalDateStr(new Date());
        await onSave({
          invoices: invoices.map((inv) =>
            linkedInvoiceIds.includes(inv.id) ? { ...inv, status: 'paid' as const, paidDate: today } : inv
          ),
        });
      }
      await fetchUnbilled();
      await fetchLedger();
      setSelectedTxIds([]);
      showSuccess(`Marked ${idsToSettle.length} transaction(s) as Settled / Paid.`, 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportARForQuickBooks = () => {
    const txsToExport = unbilledTransactions.filter((tx) => (arFilter === 'all' ? true : tx.status === arFilter));
    triggerInvoicingBrowserDownload(
      buildQuickBooksArCsv(txsToExport),
      'text/csv;charset=utf-8;',
      `QuickBooks_AR_Ledger_${new Date().toISOString().slice(0, 10)}.csv`
    );
    showSuccess(`Exported ${txsToExport.length} AR transactions for QuickBooks.`, 3000);
  };

  const handleAddCorporateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCorpName || !newCorpContactEmail) return;
    try {
      setIsSaving(true);
      const service = getCorporateAccountService();
      const accountNum = `CORP-${Date.now().toString().slice(-4)}`;
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
        currentPoNumber: service.generateSecurePoNumber(newCorpName, accountNum),
        poGeneratedAt: new Date().toISOString(),
        poNumberHistory: [],
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      await onSave({ corporateAccounts: [...corporateAccounts, newAccount] });
      await service.syncAccountToFirestore(newAccount);
      showSuccess(`Corporate account "${newCorpName}" registered.`, 3500);
      setIsNewAccountModalOpen(false);
      setNewCorpName('');
      setNewCorpContactName('');
      setNewCorpContactEmail('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCorporateFinancialTerms = async (
    accountId: string,
    patch: { creditLimit: number; billingCycle: CorporateBillingCycleOption; discountPercent: number }
  ) => {
    try {
      setIsSaving(true);
      const target = corporateAccounts.find((a) => a.id === accountId);
      if (!target) return;
      const updated: CorporateAccountConfig = {
        ...target,
        creditLimit: Math.max(0, Number(patch.creditLimit) || 0),
        billingCycle: patch.billingCycle,
        discountPercent: Math.min(100, Math.max(0, Number(patch.discountPercent) || 0)),
        updatedAt: new Date().toISOString(),
      };
      await onSave({ corporateAccounts: corporateAccounts.map((a) => (a.id === accountId ? updated : a)) });
      await getCorporateAccountService().syncAccountToFirestore(updated);
      showSuccess(`Updated financial terms for ${updated.companyName}.`, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCreditLimitEnforcement = async (mode: CreditLimitEnforcementMode) => {
    try {
      setIsSaving(true);
      await onSave({ corporatePortalPolicy: { ...portalPolicy, creditLimitEnforcement: mode } });
      showSuccess(`Credit limit policy set to ${mode === 'hard_block' ? 'Hard Block' : 'Soft Warning'}.`, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCsvImportSuccess = async (importedAccounts: CorporateAccountConfig[]) => {
    const map = new Map<string, CorporateAccountConfig>();
    corporateAccounts.forEach((a) => map.set(a.accountNumber || a.id, a));
    importedAccounts.forEach((a) => map.set(a.accountNumber || a.id, a));
    await onSave({ corporateAccounts: Array.from(map.values()) });
    await getCorporateAccountService().syncAccountsBatchToFirestore(importedAccounts);
    showSuccess(`Imported ${importedAccounts.length} corporate accounts.`, 4000);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvCustomer || !newInvEmail) return;
    try {
      setIsSaving(true);
      const issuedDate = formatLocalDateStr(new Date());
      const dueDate = new Date(Date.now() + newInvDueDays * 86_400_000).toISOString().slice(0, 10);
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
        lineItems: [{ date: issuedDate, passengerName: newInvCustomer, description: newInvDescription, amount: Number(newInvAmount) }],
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
      await onSave({ invoices: [newInvoice, ...invoices.filter((i) => i.id !== newInvoice.id)] });
      await fetchUnbilled();
      await fetchLedger();
      showSuccess(`Invoice #${newInvoice.invoiceNumber} created.`, 3500);
      setIsNewInvoiceModalOpen(false);
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
      const today = formatLocalDateStr(new Date());
      if (newStatus === 'paid') await getInvoicingService().markInvoicePaid(invoiceId);
      await onSave({
        invoices: invoices.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, status: newStatus, paidDate: newStatus === 'paid' ? today : inv.paidDate }
            : inv
        ),
      });
      await fetchUnbilled();
      await fetchLedger();
      showSuccess(`Invoice marked as ${newStatus.toUpperCase()}.`, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBillingPolicies = async (patch?: Partial<BillingSettingsConfig>) => {
    try {
      setIsSaving(true);
      const mergedBilling = normalizeBillingSettingsConfig({ ...billingDraft, ...(patch || {}) });
      setBillingDraft(mergedBilling);
      const clampedCommissionRate = Number(
        Math.min(1, Math.max(0, mergedBilling.driverDefaultCommissionPercent / 100)).toFixed(2)
      );
      await onSave({
        billingSettings: mergedBilling,
        pricing: { ...settings.pricing, defaultDriverCommissionRate: clampedCommissionRate },
      });
      showSuccess('Billing, 1-Tap Pay Link, and payout commission policies saved.', 3500);
    } catch (err: any) {
      showError(err?.message || 'Failed to save billing policies.', 4000);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    invoices, corporateAccounts, portalPolicy, selectedInvoice, setSelectedInvoice,
    isNewAccountModalOpen, setIsNewAccountModalOpen, isNewInvoiceModalOpen, setIsNewInvoiceModalOpen,
    saveSuccessMessage, actionErrorMessage, isSaving, isEmailingInvoice, payLinkInvoiceBusyId,
    newCorpName, setNewCorpName, newCorpCycle, setNewCorpCycle, newCorpLimit, setNewCorpLimit,
    newCorpContactName, setNewCorpContactName, newCorpContactEmail, setNewCorpContactEmail,
    newCorpDiscount, setNewCorpDiscount, newCorpPoRequired, setNewCorpPoRequired,
    isCsvModalOpen, setIsCsvModalOpen, accountSearchTerm, setAccountSearchTerm, accountPage, setAccountPage,
    newInvCustomer, setNewInvCustomer, newInvEmail, setNewInvEmail, newInvCorpId, setNewInvCorpId,
    newInvAmount, setNewInvAmount, newInvDescription, setNewInvDescription, newInvDueDays, setNewInvDueDays,
    billingDraft, setBillingDraft, ledgerFilter, setLedgerFilter, ledgerTypeFilter, setLedgerTypeFilter,
    filteredLedgerEntries, isExporting, printableData, unbilledTransactions, selectedTxIds, setSelectedTxIds,
    arFilter, setArFilter, ledgerViewMode, setLedgerViewMode, totalUnbilledAR, unbilledCount,
    overdue30DaysInvoices, totalOverdue30Days, settledThisMonthInvoices, settledRevenueThisMonth,
    totalInvoiced, totalPaid,
    ...payouts,
    handleExport, handleInvoicePayLink, handleEmailInvoice, handleRunBatchInvoicing,
    handleGenerateInvoiceFromAR, handleMarkARPaidSettled, handleExportARForQuickBooks,
    handleAddCorporateAccount, handleUpdateCorporateFinancialTerms, handleUpdateCreditLimitEnforcement,
    handleCsvImportSuccess, handleCreateInvoice, handleInvoiceStatusUpdate, handleSaveBillingPolicies,
  };
}

export type AdminInvoicingActionsState = ReturnType<typeof useAdminInvoicingActions>;
