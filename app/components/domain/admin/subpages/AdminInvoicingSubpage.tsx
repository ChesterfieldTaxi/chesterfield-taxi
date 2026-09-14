import React, { useState, useEffect } from 'react';
import type {
  AppSettings,
  CorporateAccountConfig,
  InvoiceRecord,
} from '../../../../core/types/config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  SpinnerIcon,
  FileTextIcon,
  BuildingIcon,
  CreditCardIcon,
  PlusIcon,
} from '../../../ui/Icons';

export type InvoicingSubTab = 'ledger' | 'accounts' | 'gateways';

interface AdminInvoicingSubpageProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: InvoicingSubTab;
}

export function AdminInvoicingSubpage({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'ledger',
}: AdminInvoicingSubpageProps) {
  const [activeSub, setActiveSub] = useState<InvoicingSubTab>(initialSubTab || 'ledger');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSub(initialSubTab);
    }
  }, [initialSubTab]);

  // Invoices & Corporate state from settings
  const invoices = settings.invoices || [];
  const corporateAccounts = settings.corporateAccounts || [];

  // Local state for modal / forms
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isNewInvoiceModalOpen, setIsNewInvoiceModalOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // New Corporate Account Form State
  const [newCorpName, setNewCorpName] = useState('');
  const [newCorpAccountNum, setNewCorpAccountNum] = useState('');
  const [newCorpCycle, setNewCorpCycle] = useState<'net15' | 'net30' | 'net60' | 'immediate'>('net30');
  const [newCorpLimit, setNewCorpLimit] = useState(10000);
  const [newCorpContactName, setNewCorpContactName] = useState('');
  const [newCorpContactEmail, setNewCorpContactEmail] = useState('');
  const [newCorpDiscount, setNewCorpDiscount] = useState(10);
  const [newCorpPoRequired, setNewCorpPoRequired] = useState(false);

  // New Invoice Form State
  const [newInvCustomer, setNewInvCustomer] = useState('');
  const [newInvEmail, setNewInvEmail] = useState('');
  const [newInvCorpId, setNewInvCorpId] = useState('');
  const [newInvAmount, setNewInvAmount] = useState(150);
  const [newInvDescription, setNewInvDescription] = useState('Airport Executive Transport');
  const [newInvDueDays, setNewInvDueDays] = useState(30);

  // Payment Gateways config state
  const [stripeTerminalEnabled, setStripeTerminalEnabled] = useState(true);
  const [passCardSurcharge, setPassCardSurcharge] = useState(false);
  const [surchargePercent, setSurchargePercent] = useState(3.0);
  const [autoEmailReceipts, setAutoEmailReceipts] = useState(true);

  // Summary Metrics
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  const handleAddCorporateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCorpName || !newCorpContactEmail) return;

    try {
      setIsSaving(true);
      const newAccount: CorporateAccountConfig = {
        id: `corp-${Date.now().toString(36)}`,
        companyName: newCorpName,
        accountNumber: newCorpAccountNum || `CORP-${Date.now().toString().slice(-4)}`,
        billingCycle: newCorpCycle,
        creditLimit: newCorpLimit,
        billingContactName: newCorpContactName || 'Accounts Payable',
        billingContactEmail: newCorpContactEmail,
        discountPercent: newCorpDiscount,
        poRequired: newCorpPoRequired,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const updatedAccounts = [...corporateAccounts, newAccount];
      await onSave({ corporateAccounts: updatedAccounts });

      setSaveSuccessMessage(`Corporate account "${newCorpName}" successfully registered.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      setIsNewAccountModalOpen(false);

      // Reset form
      setNewCorpName('');
      setNewCorpAccountNum('');
      setNewCorpContactName('');
      setNewCorpContactEmail('');
    } catch (err: any) {
      console.error('Failed to add corporate account:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvCustomer || !newInvEmail) return;

    try {
      setIsSaving(true);
      const dueDate = new Date(Date.now() + newInvDueDays * 86400000).toISOString().slice(0, 10);
      const newInvoice: InvoiceRecord = {
        id: `inv-${Date.now().toString(36)}`,
        invoiceNumber: `INV-2026-${(invoices.length + 101).toString()}`,
        corporateAccountId: newInvCorpId || undefined,
        customerName: newInvCustomer,
        customerEmail: newInvEmail,
        tripIds: [],
        totalAmount: Number(newInvAmount),
        status: 'issued',
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate,
        lineItems: [{ description: newInvDescription, amount: Number(newInvAmount) }],
      };

      const updatedInvoices = [newInvoice, ...invoices];
      await onSave({ invoices: updatedInvoices });

      setSaveSuccessMessage(`Invoice #${newInvoice.invoiceNumber} created and dispatched.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      setIsNewInvoiceModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create invoice:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvoiceStatusUpdate = async (invoiceId: string, newStatus: 'paid' | 'overdue' | 'issued' | 'draft') => {
    try {
      setIsSaving(true);
      const updatedInvoices = invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              status: newStatus,
              paidDate: newStatus === 'paid' ? new Date().toISOString().slice(0, 10) : inv.paidDate,
            }
          : inv
      );
      await onSave({ invoices: updatedInvoices });
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice({
          ...selectedInvoice,
          status: newStatus,
        });
      }
      setSaveSuccessMessage(`Invoice marked as ${newStatus.toUpperCase()}.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update invoice status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Invoicing Contextual Action Bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="text-xs font-bold text-slate-700 px-2 flex items-center gap-2">
          {activeSub === 'ledger' && (
            <>
              <FileTextIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Invoices &amp; Billing Ledger ({invoices.length} invoices)</span>
            </>
          )}
          {activeSub === 'accounts' && (
            <>
              <BuildingIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Corporate Direct Billing ({corporateAccounts.length} clients)</span>
            </>
          )}
          {activeSub === 'gateways' && (
            <>
              <CreditCardIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Payment Gateway Terminals &amp; Processors</span>
            </>
          )}
        </div>

        {activeSub === 'ledger' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsNewInvoiceModalOpen(true)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm active:scale-95"
          >
            Generate Invoice
          </Button>
        )}

        {activeSub === 'accounts' && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsNewAccountModalOpen(true)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm active:scale-95"
          >
            Add Corporate Client
          </Button>
        )}
      </div>

      {saveSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {saveSuccessMessage}
        </Alert>
      )}

      {/* ─── Metric KPI Badges ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Invoiced (All-Time)
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            ${totalInvoiced.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">{invoices.length} total generated statements</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
            Collected Revenue
          </span>
          <span className="text-xl font-black text-emerald-600 mt-1 block">
            ${totalPaid.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">Paid and reconciled</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
            Outstanding / Net Accounts
          </span>
          <span className="text-xl font-black text-amber-600 mt-1 block">
            ${totalOutstanding.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">Awaiting payment reconciliation</span>
        </div>
      </div>

      {/* ─── Sub-View: Invoicing Ledger ─── */}
      {activeSub === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleInvoiceStatusUpdate(inv.id, 'paid')}
                            className="text-[10px] px-2 py-1 text-emerald-700 bg-emerald-50 border-emerald-300 font-bold"
                          >
                            Mark Paid
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedInvoice(inv)}
                          className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Sub-View: Corporate Accounts ─── */}
      {activeSub === 'accounts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {corporateAccounts.map((acc) => (
              <Card key={acc.id} className="border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-black text-slate-900">
                        {acc.companyName}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono font-bold text-blue-600">
                        {acc.accountNumber}
                      </CardDescription>
                    </div>
                    <Badge variant={acc.isActive ? 'success' : 'default'} size="sm" className="text-[10px]">
                      {acc.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Billing Terms:</span>
                    <span className="font-bold text-slate-800 uppercase">{acc.billingCycle}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Credit Limit:</span>
                    <span className="font-bold text-slate-800">${acc.creditLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Direct Discount:</span>
                    <span className="font-bold text-emerald-600">{acc.discountPercent}% Off</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">PO Required:</span>
                    <span className="font-bold text-slate-800">{acc.poRequired ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="pt-1 text-[11px] text-slate-500">
                    <p className="font-semibold text-slate-700">Contact: {acc.billingContactName}</p>
                    <p className="truncate">{acc.billingContactEmail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Sub-View: Payment Gateways & Terminals ─── */}
      {activeSub === 'gateways' && (
        <Card className="border border-slate-200/90 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Payment Processing & Surcharge Policies
            </CardTitle>
            <CardDescription className="text-xs">
              Configure in-vehicle mobile EMV terminals, credit card pre-authorizations, and surcharge passing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">In-Vehicle Contactless / Chip Terminals</span>
                  <input
                    type="checkbox"
                    checked={stripeTerminalEnabled}
                    onChange={(e) => setStripeTerminalEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Allows passengers to pay inside the cab using contactless card readers, Apple Pay, and Google Pay.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">Pass Processing Surcharge to Customer</span>
                  <input
                    type="checkbox"
                    checked={passCardSurcharge}
                    onChange={(e) => setPassCardSurcharge(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Adds an itemized {surchargePercent}% surcharge fee to credit card transactions.
                </p>
              </div>
            </div>

            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-blue-900 text-xs">Automatic Email Receipts</p>
                <p className="text-[11px] text-blue-700">
                  Dispatches tax receipts automatically upon trip completion.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoEmailReceipts}
                onChange={(e) => setAutoEmailReceipts(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Modal: New Corporate Account ─── */}
      {isNewAccountModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-900 text-base">Register Corporate Account</h3>
              <button
                type="button"
                onClick={() => setIsNewAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCorporateAccount} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Company / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newCorpName}
                  onChange={(e) => setNewCorpName(e.target.value)}
                  placeholder="e.g. Pfizer Chesterfield Labs"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Billing Terms</label>
                  <select
                    value={newCorpCycle}
                    onChange={(e) => setNewCorpCycle(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="net15">Net 15 Days</option>
                    <option value="net30">Net 30 Days</option>
                    <option value="net60">Net 60 Days</option>
                    <option value="immediate">Immediate Charge</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Credit Limit ($)</label>
                  <input
                    type="number"
                    value={newCorpLimit}
                    onChange={(e) => setNewCorpLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Billing Contact Name</label>
                  <input
                    type="text"
                    value={newCorpContactName}
                    onChange={(e) => setNewCorpContactName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Billing Email</label>
                  <input
                    type="email"
                    required
                    value={newCorpContactEmail}
                    onChange={(e) => setNewCorpContactEmail(e.target.value)}
                    placeholder="ap@company.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Contract Discount (%)</label>
                  <input
                    type="number"
                    value={newCorpDiscount}
                    onChange={(e) => setNewCorpDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="poReq"
                    checked={newCorpPoRequired}
                    onChange={(e) => setNewCorpPoRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <label htmlFor="poReq" className="font-bold text-slate-700">Require PO #</label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewAccountModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  className="bg-blue-600 text-white font-bold"
                >
                  {isSaving ? 'Registering...' : 'Save Corporate Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: New Invoice ─── */}
      {isNewInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-900 text-base">Generate Direct Invoice</h3>
              <button
                type="button"
                onClick={() => setIsNewInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Corporate Account (Optional)</label>
                <select
                  value={newInvCorpId}
                  onChange={(e) => {
                    setNewInvCorpId(e.target.value);
                    const corp = corporateAccounts.find((c) => c.id === e.target.value);
                    if (corp) {
                      setNewInvCustomer(corp.companyName);
                      setNewInvEmail(corp.billingContactEmail);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Custom / Direct Customer</option>
                  {corporateAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.accountNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Customer / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newInvCustomer}
                  onChange={(e) => setNewInvCustomer(e.target.value)}
                  placeholder="e.g. Bayer Travel Services"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Billing Email</label>
                <input
                  type="email"
                  required
                  value={newInvEmail}
                  onChange={(e) => setNewInvEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Invoice Total ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInvAmount}
                    onChange={(e) => setNewInvAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Payment Due In (Days)</label>
                  <input
                    type="number"
                    value={newInvDueDays}
                    onChange={(e) => setNewInvDueDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Primary Line Item Description</label>
                <input
                  type="text"
                  value={newInvDescription}
                  onChange={(e) => setNewInvDescription(e.target.value)}
                  placeholder="e.g. September Executive Airport Runs"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewInvoiceModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  className="bg-blue-600 text-white font-bold"
                >
                  {isSaving ? 'Issuing...' : 'Issue & Send Invoice'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
