import React from 'react';
import type { InvoiceRecord } from '../../../../core/types/config';
import type { CorporateUnbilledTransaction } from '../../../../core/types/invoicing';
import type { ArStatusFilter, LedgerViewMode } from './useAdminInvoicingActions';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  FileTextIcon,
  PlusIcon,
  DownloadIcon,
  CheckIcon,
} from '../../../ui/Icons';

export interface InvoiceLedgerTableProps {
  invoices: InvoiceRecord[];
  unbilledTransactions: CorporateUnbilledTransaction[];
  selectedTxIds: string[];
  setSelectedTxIds: React.Dispatch<React.SetStateAction<string[]>>;
  arFilter: ArStatusFilter;
  setArFilter: React.Dispatch<React.SetStateAction<ArStatusFilter>>;
  ledgerViewMode: LedgerViewMode;
  setLedgerViewMode: React.Dispatch<React.SetStateAction<LedgerViewMode>>;
  totalUnbilledAR: number;
  unbilledCount: number;
  overdue30DaysCount: number;
  totalOverdue30Days: number;
  settledThisMonthCount: number;
  settledRevenueThisMonth: number;
  totalInvoiced: number;
  totalPaid: number;
  isSaving: boolean;
  payLinkInvoiceBusyId: string | null;
  onOpenNewInvoiceModal: () => void;
  onSelectInvoice: (inv: InvoiceRecord) => void;
  onExportARForQuickBooks: () => void;
  onMarkARPaidSettled: (targetTxIds?: string[]) => Promise<void>;
  onGenerateInvoiceFromAR: (targetTxs?: CorporateUnbilledTransaction[]) => Promise<void>;
  onInvoicePayLink: (inv: InvoiceRecord, mode: 'copy' | 'email') => Promise<void>;
  onInvoiceStatusUpdate: (
    invoiceId: string,
    newStatus: 'paid' | 'overdue' | 'issued' | 'draft'
  ) => Promise<void>;
}

export function InvoiceLedgerTable({
  invoices,
  unbilledTransactions,
  selectedTxIds,
  setSelectedTxIds,
  arFilter,
  setArFilter,
  ledgerViewMode,
  setLedgerViewMode,
  totalUnbilledAR,
  unbilledCount,
  overdue30DaysCount,
  totalOverdue30Days,
  settledThisMonthCount,
  settledRevenueThisMonth,
  totalInvoiced,
  totalPaid,
  isSaving,
  payLinkInvoiceBusyId,
  onOpenNewInvoiceModal,
  onSelectInvoice,
  onExportARForQuickBooks,
  onMarkARPaidSettled,
  onGenerateInvoiceFromAR,
  onInvoicePayLink,
  onInvoiceStatusUpdate,
}: InvoiceLedgerTableProps) {
  const filteredArTxs = unbilledTransactions.filter((tx) =>
    arFilter === 'all' ? true : tx.status === arFilter
  );
  const allVisibleSelected =
    filteredArTxs.length > 0 && selectedTxIds.length === filteredArTxs.length;

  return (
    <>
      {/* ─── Metric KPI Summary (Scoped cleanly to Ledger sub-tab only) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Total Unbilled AR */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-amber-300 transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">
              Unbilled AR
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
              Pending
            </span>
          </div>
          <span className="text-lg sm:text-2xl font-black text-slate-900 mt-1 block tabular-nums truncate">
            ${totalUnbilledAR.toFixed(2)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">
            {unbilledCount} unbilled ride{unbilledCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Card 2: Outstanding Invoices (>30 Days) */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-rose-300 transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider truncate">
              Overdue (&gt;30d)
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
              Aging AR
            </span>
          </div>
          <span className="text-lg sm:text-2xl font-black text-rose-600 mt-1 block tabular-nums truncate">
            ${totalOverdue30Days.toFixed(2)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">
            {overdue30DaysCount} past 30 days
          </span>
        </div>

        {/* Card 3: Settled Revenue This Month */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider truncate">
              Settled (MTD)
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              Reconciled
            </span>
          </div>
          <span className="text-lg sm:text-2xl font-black text-emerald-600 mt-1 block tabular-nums truncate">
            ${settledRevenueThisMonth.toFixed(2)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">
            {settledThisMonthCount} collected
          </span>
        </div>

        {/* Card 4: Total Invoiced (All-Time) */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider truncate">
              Total Invoiced
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
              All-Time
            </span>
          </div>
          <span className="text-lg sm:text-2xl font-black text-slate-900 mt-1 block tabular-nums truncate">
            ${totalInvoiced.toFixed(2)}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">
            {invoices.length} stmt · ${totalPaid.toFixed(0)} paid
          </span>
        </div>
      </div>

      {/* ─── Sub-View: Invoicing & Accounts Receivable Ledger ─── */}
      <div className="space-y-4">
        {/* Sub-view toggle & Batch Action Toolbar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          {/* View Mode Pill Switcher */}
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setLedgerViewMode('ar_ledger')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                ledgerViewMode === 'ar_ledger'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="sm:hidden">AR Ledger ({unbilledTransactions.length})</span>
              <span className="hidden sm:inline">AR Ledger &amp; Unbilled Trips ({unbilledTransactions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setLedgerViewMode('invoices')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                ledgerViewMode === 'invoices'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="sm:hidden">Invoices ({invoices.length})</span>
              <span className="hidden sm:inline">Generated Statements &amp; Invoices ({invoices.length})</span>
            </button>
          </div>

          {/* AR Actions (when in ar_ledger mode) */}
          {ledgerViewMode === 'ar_ledger' && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onExportARForQuickBooks}
                leftIcon={<DownloadIcon className="w-3.5 h-3.5 text-slate-600" />}
                className="text-xs font-bold text-slate-700 hover:text-slate-900 border-slate-300 hover:bg-slate-50 shadow-xs justify-center cursor-pointer"
              >
                <span className="sm:hidden">Export CSV</span>
                <span className="hidden sm:inline">Export CSV for QuickBooks</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving || (selectedTxIds.length === 0 && unbilledCount === 0)}
                onClick={() => onMarkARPaidSettled()}
                leftIcon={<CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
                className="text-xs font-bold text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 shadow-xs justify-center cursor-pointer"
              >
                <span className="sm:hidden">Settle {selectedTxIds.length > 0 ? `(${selectedTxIds.length})` : ''}</span>
                <span className="hidden sm:inline">Mark as Paid / Settled {selectedTxIds.length > 0 ? `(${selectedTxIds.length})` : ''}</span>
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSaving || (selectedTxIds.length === 0 && unbilledCount === 0)}
                onClick={() => onGenerateInvoiceFromAR()}
                leftIcon={<FileTextIcon className="w-3.5 h-3.5 text-white" />}
                className="col-span-2 sm:col-span-1 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm justify-center cursor-pointer"
              >
                Generate PDF Invoice {selectedTxIds.length > 0 ? `(${selectedTxIds.length})` : ''}
              </Button>
            </div>
          )}

          {/* Invoices Actions (when in invoices mode) */}
          {ledgerViewMode === 'invoices' && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onOpenNewInvoiceModal}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs w-full sm:w-auto justify-center cursor-pointer"
            >
              Create Direct Invoice
            </Button>
          )}
        </div>

        {/* ──── VIEW 1: Accounts Receivable Transactions Ledger ──── */}
        {ledgerViewMode === 'ar_ledger' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* Filter Sub-Tabs */}
            <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/50">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
                {(['all', 'unbilled', 'invoiced', 'settled'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setArFilter(mode)}
                    className={`px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      arFilter === mode
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    {mode === 'all' && `All (${unbilledTransactions.length})`}
                    {mode === 'unbilled' && `Unbilled (${unbilledCount})`}
                    {mode === 'invoiced' &&
                      `Invoiced (${unbilledTransactions.filter((t) => t.status === 'invoiced').length})`}
                    {mode === 'settled' &&
                      `Settled (${unbilledTransactions.filter((t) => t.status === 'settled').length})`}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 text-xs font-medium text-slate-500">
                <label className="md:hidden inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTxIds(filteredArTxs.map((t) => t.id));
                      } else {
                        setSelectedTxIds([]);
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Select All</span>
                </label>
                <div>
                  {selectedTxIds.length > 0 ? (
                    <span className="font-bold text-blue-600">{selectedTxIds.length} trip(s) selected</span>
                  ) : (
                    <span>Select rides to batch invoice</span>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile AR Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredArTxs.length === 0 ? (
                <div className="py-10 px-4 text-center text-slate-400 text-xs font-medium">
                  No corporate account transactions recorded yet.
                </div>
              ) : (
                filteredArTxs.map((tx) => {
                  const isSelected = selectedTxIds.includes(tx.id);
                  return (
                    <div
                      key={tx.id}
                      className={`p-3.5 space-y-2.5 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            aria-label={`Select transaction ${tx.id}`}
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTxIds([...selectedTxIds, tx.id]);
                              } else {
                                setSelectedTxIds(selectedTxIds.filter((id) => id !== tx.id));
                              }
                            }}
                            className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="font-extrabold text-slate-900 text-xs truncate">
                              {tx.corporateAccountName}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mt-0.5">
                              <span>{tx.pickupDate}</span>
                              <span>·</span>
                              <span>{tx.accountNumber || 'CORP-GEN'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-black font-mono text-slate-900 tabular-nums">
                            ${tx.totalAmount.toFixed(2)}
                          </div>
                          <Badge
                            variant={
                              tx.status === 'settled'
                                ? 'success'
                                : tx.status === 'invoiced'
                                ? 'default'
                                : 'warning'
                            }
                            size="sm"
                            className="font-bold uppercase text-[9px] mt-0.5"
                          >
                            {tx.status === 'unbilled' ? 'Unbilled' : tx.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="pl-6 space-y-1.5 text-xs">
                        <div className="font-semibold text-slate-800">{tx.passengerName}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {tx.pickupAddress.split(',')[0]} → {tx.dropoffAddress.split(',')[0]}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                          <span>Base ${tx.baseFare.toFixed(2)}</span>
                          <span>Tip ${tx.gratuity.toFixed(2)}</span>
                          <span>Tolls ${tx.tolls.toFixed(2)}</span>
                          <span>Wait ${tx.waitTimeFee.toFixed(2)}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="font-mono text-[10px]">
                            {tx.invoiceId ? (
                              <span className="font-bold text-blue-600">{tx.invoiceId}</span>
                            ) : (
                              <span className="text-slate-400 italic">Unbilled</span>
                            )}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {tx.status !== 'settled' && tx.status !== 'invoiced' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onGenerateInvoiceFromAR([tx])}
                                className="text-[11px] px-2.5 py-1 h-auto text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 font-bold cursor-pointer"
                              >
                                Invoice
                              </Button>
                            )}
                            {tx.status !== 'settled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onMarkARPaidSettled([tx.id])}
                                className="text-[11px] px-2.5 py-1 h-auto text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 font-bold cursor-pointer"
                              >
                                Settle
                              </Button>
                            )}
                            {tx.invoiceId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const foundInv = invoices.find((inv) => inv.id === tx.invoiceId);
                                  if (foundInv) onSelectInvoice(foundInv);
                                }}
                                className="text-[11px] px-2.5 py-1 h-auto text-slate-700 border-slate-200 font-bold cursor-pointer"
                              >
                                View
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Transactions Table (md+) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar min-w-full">
              <table className="w-full text-left text-xs min-w-[900px]">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all unbilled corporate transactions"
                        checked={allVisibleSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTxIds(filteredArTxs.map((t) => t.id));
                          } else {
                            setSelectedTxIds([]);
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Corporate Account</th>
                    <th className="px-4 py-3">Client &amp; Route</th>
                    <th className="px-4 py-3">Fare Breakdown</th>
                    <th className="px-4 py-3 text-right">Net Total</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Invoice Ref</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredArTxs.map((tx) => {
                    const isSelected = selectedTxIds.includes(tx.id);
                    return (
                      <tr
                        key={tx.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Select transaction ${tx.id}`}
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTxIds([...selectedTxIds, tx.id]);
                              } else {
                                setSelectedTxIds(selectedTxIds.filter((id) => id !== tx.id));
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                          {tx.pickupDate}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900 block">
                            {tx.corporateAccountName}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            Acct: {tx.accountNumber || 'CORP-GEN'}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <span className="font-bold text-slate-800 block truncate">
                            {tx.passengerName}
                          </span>
                          <span
                            className="text-[11px] text-slate-500 block truncate"
                            title={`${tx.pickupAddress} → ${tx.dropoffAddress}`}
                          >
                            {tx.pickupAddress.split(',')[0]} → {tx.dropoffAddress.split(',')[0]}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          <div className="font-mono text-[11px] space-y-0.5">
                            <div>Base: ${tx.baseFare.toFixed(2)} | Tip: ${tx.gratuity.toFixed(2)}</div>
                            <div className="text-[10px] text-slate-400">
                              Tolls: ${tx.tolls.toFixed(2)} | Wait: ${tx.waitTimeFee.toFixed(2)}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-black font-mono text-slate-900 whitespace-nowrap text-sm">
                          ${tx.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <Badge
                            variant={
                              tx.status === 'settled'
                                ? 'success'
                                : tx.status === 'invoiced'
                                ? 'default'
                                : 'warning'
                            }
                            size="sm"
                            className="font-bold uppercase text-[10px]"
                          >
                            {tx.status === 'unbilled' ? 'Unbilled AR' : tx.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {tx.invoiceId ? (
                            <span className="font-bold text-blue-600">{tx.invoiceId}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unbilled</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {tx.status !== 'settled' && tx.status !== 'invoiced' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onGenerateInvoiceFromAR([tx])}
                                className="text-[10px] px-2 py-1 text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 font-bold cursor-pointer"
                              >
                                Invoice
                              </Button>
                            )}
                            {tx.status !== 'settled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onMarkARPaidSettled([tx.id])}
                                className="text-[10px] px-2 py-1 text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 font-bold cursor-pointer"
                              >
                                Settle
                              </Button>
                            )}
                            {tx.invoiceId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const foundInv = invoices.find((inv) => inv.id === tx.invoiceId);
                                  if (foundInv) onSelectInvoice(foundInv);
                                }}
                                className="text-[10px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                              >
                                View
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredArTxs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                        No corporate account transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ──── VIEW 2: Invoiced Statements & Reconciled Statements ──── */}
        {ledgerViewMode === 'invoices' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* Mobile Invoice Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <div className="py-10 px-4 text-center text-slate-400 text-xs font-medium">
                  No statements or invoices issued yet.
                </div>
              ) : (
                invoices.map((inv) => (
                  <div key={inv.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-blue-700">
                            {inv.invoiceNumber}
                          </span>
                          <Badge
                            variant={
                              inv.status === 'paid'
                                ? 'success'
                                : inv.status === 'overdue'
                                ? 'error'
                                : 'warning'
                            }
                            size="sm"
                            className="font-bold uppercase text-[9px]"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                        <div className="font-extrabold text-slate-900 text-sm mt-0.5 truncate">
                          {inv.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{inv.customerEmail}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-black text-slate-900 font-mono tabular-nums">
                          ${inv.totalAmount.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 rounded-xl text-[11px]">
                      <div>
                        <span className="text-[9px] font-bold uppercase text-slate-400 block">Issued</span>
                        <span className="font-mono font-semibold text-slate-700">{inv.issuedDate}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold uppercase text-slate-400 block">Due Date</span>
                        <span className="font-mono font-semibold text-slate-700">{inv.dueDate}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {inv.status !== 'paid' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={payLinkInvoiceBusyId !== null}
                            onClick={() => onInvoicePayLink(inv, 'copy')}
                            className="text-xs py-1.5 h-auto text-blue-700 bg-blue-50 border-blue-200 font-bold justify-center cursor-pointer"
                          >
                            {payLinkInvoiceBusyId === `${inv.id}:copy` ? 'Copying...' : 'Copy Pay Link'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={payLinkInvoiceBusyId !== null}
                            onClick={() => onInvoicePayLink(inv, 'email')}
                            className="text-xs py-1.5 h-auto text-indigo-700 bg-indigo-50 border-indigo-200 font-bold justify-center cursor-pointer"
                          >
                            {payLinkInvoiceBusyId === `${inv.id}:email` ? 'Sending...' : 'Send Pay Link'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onInvoiceStatusUpdate(inv.id, 'paid')}
                            className="text-xs py-1.5 h-auto text-emerald-700 bg-emerald-50 border-emerald-300 font-bold justify-center cursor-pointer"
                          >
                            Mark Paid
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectInvoice(inv)}
                        className="flex-1 text-xs py-1.5 h-auto text-slate-700 border-slate-200 hover:bg-slate-50 font-bold justify-center cursor-pointer"
                      >
                        View &amp; Print
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Invoices Table (md+) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar min-w-full">
              <table className="w-full text-left text-xs min-w-[750px]">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Client / Organization</th>
                    <th className="px-4 py-3">Issued Date</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800 block">{inv.customerName}</span>
                        <span className="text-[11px] text-slate-500">{inv.customerEmail}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{inv.issuedDate}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{inv.dueDate}</td>
                      <td className="px-4 py-3 font-black text-slate-900 whitespace-nowrap">
                        ${inv.totalAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge
                          variant={
                            inv.status === 'paid'
                              ? 'success'
                              : inv.status === 'overdue'
                              ? 'error'
                              : 'warning'
                          }
                          size="sm"
                          className="font-bold uppercase text-[10px]"
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {inv.status !== 'paid' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={payLinkInvoiceBusyId !== null}
                                onClick={() => onInvoicePayLink(inv, 'copy')}
                                className="text-[10px] px-2 py-1 text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 font-bold cursor-pointer"
                              >
                                {payLinkInvoiceBusyId === `${inv.id}:copy` ? '...' : 'Pay Link'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={payLinkInvoiceBusyId !== null}
                                onClick={() => onInvoicePayLink(inv, 'email')}
                                className="text-[10px] px-2 py-1 text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 font-bold cursor-pointer"
                              >
                                {payLinkInvoiceBusyId === `${inv.id}:email` ? 'Sending...' : 'Send Pay Link'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onInvoiceStatusUpdate(inv.id, 'paid')}
                                className="text-[10px] px-2 py-1 text-emerald-700 bg-emerald-50 border-emerald-300 font-bold cursor-pointer"
                              >
                                Mark Paid
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onSelectInvoice(inv)}
                            className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                          >
                            View &amp; Print
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        No statements or invoices issued yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
