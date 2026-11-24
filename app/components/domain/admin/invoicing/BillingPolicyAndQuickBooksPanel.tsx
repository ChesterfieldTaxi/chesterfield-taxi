import React from 'react';
import { Link } from 'react-router';
import type {
  BillingSettingsConfig,
  NormalizedBillingSettingsConfig,
} from '../../../../core/types/config';
import type {
  AccountingExportFormat,
  FinancialLedgerEntry,
} from '../../../../core/types/invoicing';
import type {
  LedgerEntryTypeFilter,
  LedgerPeriodFilter,
} from './useAdminInvoicingActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { CheckIcon, CreditCardIcon, DownloadIcon, ExternalLinkIcon } from '../../../ui/Icons';

export interface BillingPolicyAndQuickBooksPanelProps {
  isSaving: boolean;
  isExporting: boolean;
  billingDraft: NormalizedBillingSettingsConfig;
  setBillingDraft: React.Dispatch<React.SetStateAction<NormalizedBillingSettingsConfig>>;
  onSaveBillingPolicies: (patch?: Partial<BillingSettingsConfig>) => Promise<void>;
  ledgerFilter: LedgerPeriodFilter;
  setLedgerFilter: React.Dispatch<React.SetStateAction<LedgerPeriodFilter>>;
  ledgerTypeFilter: LedgerEntryTypeFilter;
  setLedgerTypeFilter: React.Dispatch<React.SetStateAction<LedgerEntryTypeFilter>>;
  filteredLedgerEntries: FinancialLedgerEntry[];
  onExportLedger: (format: AccountingExportFormat) => Promise<void>;
}

const EXPIRY_PRESETS = [
  { hours: 24, label: '24h' },
  { hours: 48, label: '48h' },
  { hours: 72, label: '72h' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
];

export function BillingPolicyAndQuickBooksPanel({
  isSaving, isExporting, billingDraft, setBillingDraft, onSaveBillingPolicies,
  ledgerFilter, setLedgerFilter, ledgerTypeFilter, setLedgerTypeFilter, filteredLedgerEntries, onExportLedger,
}: BillingPolicyAndQuickBooksPanelProps) {
  return (
    <div className="space-y-5">
      {/* ─── Card 1: 1-Tap Pay Link, Card & Remittance Policies ─── */}
      <Card className="border border-slate-200/90 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4 text-blue-600" />
              <span>1-Tap Pay Link, Card &amp; Remittance Policies</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Controls default <code>/pay/:payToken</code> expiration, gratuity prompts, card surcharges, and invoice remittance bank info.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            onClick={() => onSaveBillingPolicies()}
            leftIcon={<CheckIcon className="w-3.5 h-3.5" />}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0 cursor-pointer"
          >
            Save Billing Policies
          </Button>
        </CardHeader>

        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
              <label className="font-bold text-slate-900 block">1-Tap Pay Link Expiry (Hours)</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXPIRY_PRESETS.map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => setBillingDraft((d) => ({ ...d, payLinkExpiryHours: p.hours }))}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      billingDraft.payLinkExpiryHours === p.hours
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={billingDraft.payLinkExpiryHours}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, payLinkExpiryHours: Number(e.target.value) || 72 }))}
                  className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-bold text-slate-900">Allow Tip on Trip Pay Links</span>
                <input
                  type="checkbox"
                  checked={billingDraft.payLinkAllowTipOnTrips}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, payLinkAllowTipOnTrips: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer pt-1.5 border-t border-slate-200/60">
                <span className="font-bold text-slate-900">Allow Tip on Corporate Invoices</span>
                <input
                  type="checkbox"
                  checked={billingDraft.payLinkAllowTipOnInvoices}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, payLinkAllowTipOnInvoices: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </label>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-bold text-slate-900">Auto-Email Tax Receipts</span>
                <input
                  type="checkbox"
                  checked={billingDraft.autoEmailReceipts}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, autoEmailReceipts: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer pt-1.5 border-t border-slate-200/60">
                <span className="font-bold text-slate-900">Auto-SMS Pay Link Receipts</span>
                <input
                  type="checkbox"
                  checked={billingDraft.autoSendPayLinkReceiptSms}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, autoSendPayLinkReceiptSms: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 cursor-pointer">
              <div>
                <span className="font-bold text-slate-900 block">In-Vehicle Contactless Terminals</span>
                <span className="text-[11px] text-slate-500">Enable Apple Pay, Google Pay, and chip readers</span>
              </div>
              <input
                type="checkbox"
                checked={billingDraft.stripeTerminalEnabled}
                onChange={(e) => setBillingDraft((d) => ({ ...d, stripeTerminalEnabled: e.target.checked }))}
                className="w-4 h-4 rounded text-blue-600 shrink-0"
              />
            </label>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={billingDraft.passCardSurcharge}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, passCardSurcharge: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <div>
                  <span className="font-bold text-slate-900 block">Pass Card Processing Surcharge</span>
                  <span className="text-[11px] text-slate-500">Itemized % added to card transactions</span>
                </div>
              </label>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="15"
                  value={billingDraft.surchargePercent}
                  onChange={(e) => setBillingDraft((d) => ({ ...d, surchargePercent: Number(e.target.value) || 0 }))}
                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono"
                />
                <span className="font-bold text-slate-700">%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Remittance Bank</label>
              <input
                type="text"
                value={billingDraft.remittanceBankName || ''}
                onChange={(e) => setBillingDraft((d) => ({ ...d, remittanceBankName: e.target.value }))}
                placeholder="Commerce Bank"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Account Name</label>
              <input
                type="text"
                value={billingDraft.remittanceAccountName || ''}
                onChange={(e) => setBillingDraft((d) => ({ ...d, remittanceAccountName: e.target.value }))}
                placeholder="Chesterfield Taxi LLC"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">ABA Routing #</label>
              <input
                type="text"
                value={billingDraft.remittanceRoutingNumber || ''}
                onChange={(e) => setBillingDraft((d) => ({ ...d, remittanceRoutingNumber: e.target.value }))}
                placeholder="081000210"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Acct Last 4</label>
              <input
                type="text"
                maxLength={4}
                value={billingDraft.remittanceAccountLast4 || ''}
                onChange={(e) => setBillingDraft((d) => ({ ...d, remittanceAccountLast4: e.target.value }))}
                placeholder="4829"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">USDOT #</label>
              <input
                type="text"
                value={billingDraft.usdotNumber || ''}
                onChange={(e) => setBillingDraft((d) => ({ ...d, usdotNumber: e.target.value }))}
                placeholder="USDOT-..."
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Federal Tax ID</label>
              <input
                type="text"
                value={billingDraft.taxId || ''}
                onChange={(e) => setBillingDraft((d) => ({ ...d, taxId: e.target.value }))}
                placeholder="XX-XXXXXXX"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <Link
              to="/app/admin?tab=integrations&sub=gateways"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
            >
              <span>Manage payment &amp; telephony API credentials in Comms &amp; Integrations &rarr;</span>
              <ExternalLinkIcon className="w-3 h-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ─── Card 2: General Ledger & QuickBooks Sync ─── */}
      <Card className="border border-slate-200/90 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-black text-slate-900">
              General Ledger &amp; QuickBooks Sync
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Balanced double-entry journal for fares, AR settlements, commissions, and driver/staff/vendor payouts.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Select
              size="sm"
              fullWidth={false}
              value={ledgerTypeFilter}
              onChange={(e) => setLedgerTypeFilter(e.target.value as LedgerEntryTypeFilter)}
            >
              <option value="all">All Entry Types</option>
              <option value="fare_revenue">Fare Revenue (4010 / 1200)</option>
              <option value="invoice_settlement">Invoice Settlement (1010)</option>
              <option value="driver_payout">Driver Payout (5010)</option>
              <option value="staff_payout">Staff Payroll (5020)</option>
              <option value="vendor_payout">Vendor / Affiliate Payout (5030)</option>
              <option value="platform_commission">Platform Commission (4020)</option>
            </Select>

            <Select
              size="sm"
              fullWidth={false}
              value={ledgerFilter}
              onChange={(e) => setLedgerFilter(e.target.value as LedgerPeriodFilter)}
            >
              <option value="all">All Periods</option>
              <option value="30d">Last 30 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="today">Today</option>
            </Select>

            <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={() => onExportLedger('quickbooks_csv')} leftIcon={<DownloadIcon className="w-3.5 h-3.5" />} className="text-xs font-semibold">
              QB CSV
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={() => onExportLedger('quickbooks_iif')} leftIcon={<DownloadIcon className="w-3.5 h-3.5" />} className="text-xs font-semibold">
              QB IIF
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={isExporting} onClick={() => onExportLedger('general_ledger_json')} leftIcon={<DownloadIcon className="w-3.5 h-3.5" />} className="text-xs font-bold">
              GL JSON
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[740px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Account Code</th>
                <th className="px-3 py-2.5">Ref / ID</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right">Debit ($)</th>
                <th className="px-4 py-2.5 text-right">Credit ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedgerEntries.map((entry) => {
                const isCredit = entry.type === 'fare_revenue' || entry.type === 'platform_commission';
                return (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">{entry.date}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold uppercase">
                        {entry.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">{entry.accountCode}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-blue-600">
                      {entry.tripId || entry.invoiceId || entry.driverId || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{entry.description}</td>
                    <td className="px-3 py-2.5 font-mono text-right text-rose-600 font-bold">
                      {!isCredit ? `$${entry.amount.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-right text-emerald-600 font-bold">
                      {isCredit ? `$${entry.amount.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {filteredLedgerEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No ledger journal entries recorded for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
