import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type {
  CorporateAccountConfig,
  CreditLimitEnforcementMode,
  InvoiceRecord,
} from '../../../../core/types/config';
import type { CorporateUnbilledTransaction } from '../../../../core/types/invoicing';
import { computeCorporateCreditMetrics } from '../../../../core/services/corporate-portal.service';
import {
  ACCOUNTS_PER_PAGE,
  type CorporateBillingCycleOption,
  type InvoicingSubTab,
} from './useAdminInvoicingActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
  XIcon,
} from '../../../ui/Icons';
import { CorporateCsvImportModal } from '../corporate/CorporateAccountModals';

export interface CorporateAccountsPanelProps {
  activeSub: InvoicingSubTab;
  corporateAccounts: CorporateAccountConfig[];
  invoices: InvoiceRecord[];
  unbilledTransactions: CorporateUnbilledTransaction[];
  creditLimitEnforcement: CreditLimitEnforcementMode;
  isSaving: boolean;
  accountSearchTerm: string;
  setAccountSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  accountPage: number;
  setAccountPage: React.Dispatch<React.SetStateAction<number>>;
  isCsvModalOpen: boolean;
  setIsCsvModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onUpdateCreditLimitEnforcement: (mode: CreditLimitEnforcementMode) => Promise<void>;
  onUpdateFinancialTerms: (
    accountId: string,
    patch: { creditLimit: number; billingCycle: CorporateBillingCycleOption; discountPercent: number }
  ) => Promise<void>;
  onRunBatchInvoicing: (corp: CorporateAccountConfig) => Promise<void>;
  onCsvImportSuccess: (importedAccounts: CorporateAccountConfig[]) => Promise<void>;
}

export function CorporateAccountsPanel({
  activeSub, corporateAccounts, invoices, unbilledTransactions, creditLimitEnforcement, isSaving,
  accountSearchTerm, setAccountSearchTerm, accountPage, setAccountPage, isCsvModalOpen, setIsCsvModalOpen,
  onUpdateCreditLimitEnforcement, onUpdateFinancialTerms, onRunBatchInvoicing, onCsvImportSuccess,
}: CorporateAccountsPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedAccountId = (searchParams.get('accountId') || '').trim();

  const [editingTermsId, setEditingTermsId] = useState<string | null>(null);
  const [termsDraft, setTermsDraft] = useState<{
    creditLimit: number;
    billingCycle: CorporateBillingCycleOption;
    discountPercent: number;
  }>({ creditLimit: 5000, billingCycle: 'net30', discountPercent: 0 });

  if (activeSub !== 'accounts') return null;

  const clearAccountFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('accountId');
    setSearchParams(next, { replace: true });
  };

  const filteredCorporateAccounts = corporateAccounts.filter((acc) => {
    if (focusedAccountId && acc.id !== focusedAccountId && acc.accountNumber !== focusedAccountId) {
      return false;
    }
    if (!accountSearchTerm.trim()) return true;
    const q = accountSearchTerm.toLowerCase();
    return (
      acc.companyName.toLowerCase().includes(q) ||
      acc.accountNumber.toLowerCase().includes(q) ||
      Boolean(acc.billingContactEmail && acc.billingContactEmail.toLowerCase().includes(q))
    );
  });

  const totalAccountPages = Math.max(
    1,
    Math.ceil(filteredCorporateAccounts.length / ACCOUNTS_PER_PAGE)
  );
  const paginatedAccounts = filteredCorporateAccounts.slice(
    (accountPage - 1) * ACCOUNTS_PER_PAGE,
    accountPage * ACCOUNTS_PER_PAGE
  );

  const computeAccountMetrics = (acc: CorporateAccountConfig) => {
    const openInvoiceBalance = invoices
      .filter(
        (inv) =>
          (inv.corporateAccountId === acc.id || inv.accountNumber === acc.accountNumber) &&
          (inv.status === 'issued' || inv.status === 'overdue')
      )
      .reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);

    const unbilledSpend = unbilledTransactions
      .filter(
        (tx) =>
          (tx.corporateAccountId === acc.id || tx.corporateAccountName === acc.companyName) &&
          (tx.status === 'unbilled' || tx.status === 'pending_invoice')
      )
      .reduce((sum, tx) => sum + Number(tx.totalAmount || 0), 0);

    return computeCorporateCreditMetrics({
      openInvoiceBalance,
      unbilledSpend,
      creditLimit: acc.creditLimit,
    });
  };

  return (
    <div className="space-y-4">
      {/* ─── Global Credit Limit Enforcement & Search Bar ─── */}
      <div className="bg-surface-card p-3.5 sm:p-4 rounded-2xl border border-border-subtle/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder={`Search ${corporateAccounts.length} accounts by company or #...`}
              value={accountSearchTerm}
              onChange={(e) => {
                setAccountSearchTerm(e.target.value);
                setAccountPage(1);
              }}
              className="w-full pl-3 pr-8 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs text-fg-strong placeholder-fg-subtle focus:bg-surface-card focus:outline-hidden focus:border-blue-500"
            />
            {accountSearchTerm && (
              <button
                type="button"
                onClick={() => {
                  setAccountSearchTerm('');
                  setAccountPage(1);
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {focusedAccountId && (
            <button
              type="button"
              onClick={clearAccountFocus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-status-info-bg border border-status-info-border text-status-info-fg text-xs font-bold cursor-pointer shrink-0"
            >
              <span>Filtered: {focusedAccountId}</span>
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Credit Limit Enforcement Toggle + Cross-Link */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5">
          <div className="flex items-center gap-2 bg-surface-subtle px-2.5 py-1.5 rounded-xl border border-border-subtle text-xs">
            <ShieldCheckIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="font-bold text-fg-secondary">Credit Limit Policy:</span>
            <div className="inline-flex bg-surface-card p-0.5 rounded-lg border border-border-subtle">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onUpdateCreditLimitEnforcement('soft_warning')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                  creditLimitEnforcement === 'soft_warning'
                    ? 'bg-status-warning-bg-strong text-status-warning-fg'
                    : 'text-fg-muted hover:text-fg-strong'
                }`}
              >
                Soft Warning
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onUpdateCreditLimitEnforcement('hard_block')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                  creditLimitEnforcement === 'hard_block'
                    ? 'bg-rose-600 text-white'
                    : 'text-fg-muted hover:text-fg-strong'
                }`}
              >
                Hard Block
              </button>
            </div>
          </div>

          <Link
            to="/app/admin?tab=customers&sub=corporate"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface-card hover:bg-surface-subtle text-xs font-bold text-fg-secondary hover:text-status-info-fg transition-colors"
          >
            <span>Directory &amp; Portal Logins &rarr;</span>
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ─── Corporate Financial & Credit Terms Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedAccounts.map((acc) => {
          const metrics = computeAccountMetrics(acc);
          const isEditing = editingTermsId === acc.id;
          const barWidth = Math.min(100, Math.max(0, metrics.creditUtilizationPercent));
          const barColor =
            metrics.utilizationLevel === 'critical'
              ? 'bg-rose-500'
              : metrics.utilizationLevel === 'warning'
              ? 'bg-amber-500'
              : 'bg-emerald-500';

          return (
            <Card
              key={acc.id}
              className={`border shadow-xs transition-all flex flex-col justify-between ${
                focusedAccountId && (acc.id === focusedAccountId || acc.accountNumber === focusedAccountId)
                  ? 'border-blue-500 ring-2 ring-blue-500/15'
                  : 'border-border-subtle/90 hover:border-border-strong'
              }`}
            >
              <div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-black text-fg-primary line-clamp-1">
                        {acc.companyName}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono font-bold text-blue-600">
                        {acc.accountNumber} · {acc.billingCycle.toUpperCase()}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={acc.isActive ? 'success' : 'default'}
                      size="sm"
                      className="text-[10px]"
                    >
                      {acc.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  {/* Credit Utilization Progress Bar */}
                  <div className="p-3 bg-surface-subtle rounded-xl border border-border-subtle/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-fg-secondary">Credit Exposure</span>
                      <span className="font-mono font-black text-fg-primary">
                        ${metrics.totalExposure.toFixed(2)} / ${acc.creditLimit.toLocaleString()}
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-surface-emphasis overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-fg-muted">
                      <span>Unbilled: ${metrics.unbilledSpend.toFixed(2)}</span>
                      <span>Open Inv: ${metrics.openInvoiceBalance.toFixed(2)}</span>
                      <span className="font-bold text-fg-secondary">
                        {metrics.creditUtilizationPercent}%
                      </span>
                    </div>

                    {metrics.isOverLimit && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-status-danger-fg pt-0.5">
                        <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                        <span>
                          Over credit limit ({creditLimitEnforcement === 'hard_block' ? 'Blocked' : 'Warned'})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Financial Terms View vs Inline Editor */}
                  {isEditing ? (
                    <div className="p-3 bg-status-info-bg/50 rounded-xl border border-status-info-border space-y-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-fg-secondary block mb-0.5">Terms</label>
                          <Select
                            size="xs"
                            value={termsDraft.billingCycle}
                            onChange={(e) => setTermsDraft((d) => ({ ...d, billingCycle: e.target.value as CorporateBillingCycleOption }))}
                          >
                            <option value="immediate">Immediate</option>
                            <option value="net15">Net 15</option>
                            <option value="net30">Net 30</option>
                            <option value="net60">Net 60</option>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-fg-secondary block mb-0.5">Limit ($)</label>
                          <input
                            type="number"
                            min="0"
                            value={termsDraft.creditLimit}
                            onChange={(e) => setTermsDraft((d) => ({ ...d, creditLimit: Number(e.target.value) || 0 }))}
                            className="w-full px-2 py-1 bg-surface-card border border-border-strong rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-fg-secondary block mb-0.5">Disc (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={termsDraft.discountPercent}
                            onChange={(e) => setTermsDraft((d) => ({ ...d, discountPercent: Number(e.target.value) || 0 }))}
                            className="w-full px-2 py-1 bg-surface-card border border-border-strong rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingTermsId(null)} className="text-[10px] py-1 h-auto">
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          disabled={isSaving}
                          onClick={async () => {
                            await onUpdateFinancialTerms(acc.id, termsDraft);
                            setEditingTermsId(null);
                          }}
                          leftIcon={<CheckIcon className="w-3 h-3" />}
                          className="text-[10px] py-1 h-auto font-bold"
                        >
                          Save Terms
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 bg-surface-card rounded-xl border border-border-subtle/80 text-[11px]">
                      <div>
                        <span className="text-fg-subtle block text-[9px] uppercase font-bold">Cycle</span>
                        <span className="font-bold text-fg-strong uppercase">{acc.billingCycle}</span>
                      </div>
                      <div>
                        <span className="text-fg-subtle block text-[9px] uppercase font-bold">Credit Limit</span>
                        <span className="font-bold text-fg-strong">${acc.creditLimit.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-fg-subtle block text-[9px] uppercase font-bold">Discount</span>
                        <span className="font-bold text-emerald-600">{acc.discountPercent}% Off</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTermsId(acc.id);
                          setTermsDraft({
                            creditLimit: acc.creditLimit,
                            billingCycle: acc.billingCycle,
                            discountPercent: acc.discountPercent,
                          });
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:text-status-info-fg cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </CardContent>
              </div>

              <div className="p-4 pt-0 space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRunBatchInvoicing(acc)}
                  disabled={isSaving}
                  className="text-[11px] font-bold text-blue-600 border-status-info-border hover:bg-status-info-bg w-full cursor-pointer"
                >
                  Run Direct Batch Statement
                </Button>
              </div>
            </Card>
          );
        })}

        {filteredCorporateAccounts.length === 0 && (
          <div className="col-span-full py-12 text-center bg-surface-card rounded-2xl border border-border-subtle">
            <p className="text-fg-subtle font-medium text-xs">
              No corporate billing accounts matched your filter.
            </p>
          </div>
        )}
      </div>

      {totalAccountPages > 1 && (
        <div className="flex items-center justify-between bg-surface-card px-4 py-3 rounded-2xl border border-border-subtle/90 text-xs">
          <span className="text-fg-muted">Page {accountPage} of {totalAccountPages}</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setAccountPage((p) => Math.max(p - 1, 1))} disabled={accountPage === 1}>
              Previous
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAccountPage((p) => Math.min(p + 1, totalAccountPages))} disabled={accountPage === totalAccountPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      <CorporateCsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportSuccess={onCsvImportSuccess}
      />
    </div>
  );
}
