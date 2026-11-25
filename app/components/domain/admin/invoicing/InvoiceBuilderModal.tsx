import React, { useCallback } from 'react';
import { useBottomSheetDragToClose } from '../../../../core/hooks/useBottomSheetDragToClose';
import type {
  AppSettings,
  CorporateAccountConfig,
  InvoiceRecord,
} from '../../../../core/types/config';
import type { PrintableInvoiceData } from '../../../../core/types/invoicing';
import type { CorporateBillingCycleOption } from './useAdminInvoicingActions';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { XIcon } from '../../../ui/Icons';

export interface InvoiceBuilderModalProps {
  settings: AppSettings;
  corporateAccounts: CorporateAccountConfig[];
  isSaving: boolean;
  isEmailingInvoice: boolean;
  payLinkInvoiceBusyId: string | null;
  // New Corporate Account Modal
  isNewAccountModalOpen: boolean;
  setIsNewAccountModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newCorpName: string;
  setNewCorpName: React.Dispatch<React.SetStateAction<string>>;
  newCorpCycle: CorporateBillingCycleOption;
  setNewCorpCycle: React.Dispatch<React.SetStateAction<CorporateBillingCycleOption>>;
  newCorpLimit: number;
  setNewCorpLimit: React.Dispatch<React.SetStateAction<number>>;
  newCorpContactName: string;
  setNewCorpContactName: React.Dispatch<React.SetStateAction<string>>;
  newCorpContactEmail: string;
  setNewCorpContactEmail: React.Dispatch<React.SetStateAction<string>>;
  newCorpDiscount: number;
  setNewCorpDiscount: React.Dispatch<React.SetStateAction<number>>;
  newCorpPoRequired: boolean;
  setNewCorpPoRequired: React.Dispatch<React.SetStateAction<boolean>>;
  onAddCorporateAccount: (e: React.FormEvent) => Promise<void>;
  // New Invoice Modal
  isNewInvoiceModalOpen: boolean;
  setIsNewInvoiceModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newInvCorpId: string;
  setNewInvCorpId: React.Dispatch<React.SetStateAction<string>>;
  newInvCustomer: string;
  setNewInvCustomer: React.Dispatch<React.SetStateAction<string>>;
  newInvEmail: string;
  setNewInvEmail: React.Dispatch<React.SetStateAction<string>>;
  newInvAmount: number;
  setNewInvAmount: React.Dispatch<React.SetStateAction<number>>;
  newInvDueDays: number;
  setNewInvDueDays: React.Dispatch<React.SetStateAction<number>>;
  newInvDescription: string;
  setNewInvDescription: React.Dispatch<React.SetStateAction<string>>;
  onCreateInvoice: (e: React.FormEvent) => Promise<void>;
  // Printable PDF Invoice Preview Modal
  selectedInvoice: InvoiceRecord | null;
  setSelectedInvoice: React.Dispatch<React.SetStateAction<InvoiceRecord | null>>;
  printableData: PrintableInvoiceData | null;
  onInvoicePayLink: (inv: InvoiceRecord, mode: 'copy' | 'email') => Promise<void>;
  onEmailInvoice: (inv: InvoiceRecord) => Promise<void>;
}

export function InvoiceBuilderModal({
  settings,
  corporateAccounts,
  isSaving,
  isEmailingInvoice,
  payLinkInvoiceBusyId,
  isNewAccountModalOpen,
  setIsNewAccountModalOpen,
  newCorpName,
  setNewCorpName,
  newCorpCycle,
  setNewCorpCycle,
  newCorpLimit,
  setNewCorpLimit,
  newCorpContactName,
  setNewCorpContactName,
  newCorpContactEmail,
  setNewCorpContactEmail,
  newCorpDiscount,
  setNewCorpDiscount,
  newCorpPoRequired,
  setNewCorpPoRequired,
  onAddCorporateAccount,
  isNewInvoiceModalOpen,
  setIsNewInvoiceModalOpen,
  newInvCorpId,
  setNewInvCorpId,
  newInvCustomer,
  setNewInvCustomer,
  newInvEmail,
  setNewInvEmail,
  newInvAmount,
  setNewInvAmount,
  newInvDueDays,
  setNewInvDueDays,
  newInvDescription,
  setNewInvDescription,
  onCreateInvoice,
  selectedInvoice,
  setSelectedInvoice,
  printableData,
  onInvoicePayLink,
  onEmailInvoice,
}: InvoiceBuilderModalProps) {
  const dismissNewAccountModal = useCallback(
    () => setIsNewAccountModalOpen(false),
    [setIsNewAccountModalOpen]
  );
  const dismissNewInvoiceModal = useCallback(
    () => setIsNewInvoiceModalOpen(false),
    [setIsNewInvoiceModalOpen]
  );
  const dismissInvoicePreview = useCallback(
    () => setSelectedInvoice(null),
    [setSelectedInvoice]
  );

  const newAccountSheetDrag = useBottomSheetDragToClose({ onClose: dismissNewAccountModal });
  const newInvoiceSheetDrag = useBottomSheetDragToClose({ onClose: dismissNewInvoiceModal });
  const invoicePreviewSheetDrag = useBottomSheetDragToClose({ onClose: dismissInvoicePreview });

  return (
    <>
      {/* ─── Modal: New Corporate Account (Drag-down sheet on mobile) ─── */}
      {isNewAccountModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewAccountModalOpen(false);
          }}
        >
          <div
            style={newAccountSheetDrag.sheetStyle}
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl border-t sm:border border-slate-200 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...newAccountSheetDrag.dragHandlers}
              className="px-5 pt-2.5 sm:pt-5 pb-3 border-b border-slate-200 shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex justify-between items-center">
                <h3 className="font-black text-slate-900 text-base">Register Corporate Account</h3>
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  aria-label="Close corporate account modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={onAddCorporateAccount} className="p-5 overflow-y-auto space-y-3 text-xs">
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
                  <Select
                    size="sm"
                    value={newCorpCycle}
                    onChange={(e) => setNewCorpCycle(e.target.value as CorporateBillingCycleOption)}
                  >
                    <option value="net15">Net 15 Days</option>
                    <option value="net30">Net 30 Days</option>
                    <option value="net60">Net 60 Days</option>
                    <option value="immediate">Immediate Charge</option>
                  </Select>
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

      {/* ─── Modal: New Invoice (Drag-down sheet on mobile) ─── */}
      {isNewInvoiceModalOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewInvoiceModalOpen(false);
          }}
        >
          <div
            style={newInvoiceSheetDrag.sheetStyle}
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl border-t sm:border border-slate-200 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...newInvoiceSheetDrag.dragHandlers}
              className="px-5 pt-2.5 sm:pt-5 pb-3 border-b border-slate-200 shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex justify-between items-center">
                <h3 className="font-black text-slate-900 text-base">Generate Direct Invoice</h3>
                <button
                  type="button"
                  onClick={() => setIsNewInvoiceModalOpen(false)}
                  aria-label="Close invoice modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={onCreateInvoice} className="p-5 overflow-y-auto space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Corporate Account (Optional)</label>
                <Select
                  size="sm"
                  value={newInvCorpId}
                  onChange={(e) => {
                    setNewInvCorpId(e.target.value);
                    const corp = corporateAccounts.find((c) => c.id === e.target.value);
                    if (corp) {
                      setNewInvCustomer(corp.companyName);
                      setNewInvEmail(corp.billingContactEmail);
                    }
                  }}
                >
                  <option value="">Custom / Direct Client</option>
                  {corporateAccounts
                    .filter((c) => !c.isArchived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.accountNumber})
                      </option>
                    ))}
                </Select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Client / Organization Name</label>
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

      {/* ─── Modal: Printable PDF Invoice Preview (Drag-down sheet on mobile) ─── */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedInvoice(null);
          }}
        >
          <div
            id="printable-invoice-modal"
            style={invoicePreviewSheetDrag.sheetStyle}
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-3xl w-full max-h-[92dvh] sm:max-h-none overflow-y-auto p-5 sm:p-8 shadow-2xl border-t sm:border border-slate-200 space-y-5 sm:space-y-6 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 sm:my-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-8 print:shadow-none print:border-none print:max-h-none"
          >
            <div {...invoicePreviewSheetDrag.dragHandlers} className="touch-none sm:hidden print:hidden -mt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto" aria-hidden="true" />
            </div>
            {/* Header: Company & Invoice Metadata */}
            <div className="flex flex-wrap justify-between items-start border-b border-slate-200 pb-5 gap-4">
              <div>
                <h2 className="font-black text-2xl text-slate-900 tracking-tight">
                  {settings.company?.name || COMPANY_CONFIG.name}
                </h2>
                <p className="text-xs font-semibold text-slate-600 mt-0.5">
                  Corporate Transportation &amp; Fleet Logistics Division
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {settings.company?.address || COMPANY_CONFIG.address.formatted}
                </p>
                <p className="text-xs text-slate-500">
                  Phone: {settings.company?.phone || COMPANY_CONFIG.phone.dispatch} | Billing: {settings.company?.email || COMPANY_CONFIG.email.dispatch}
                </p>
                {(settings.billingSettings?.usdotNumber || settings.billingSettings?.taxId) && (
                  <p className="text-[11px] font-mono text-slate-400">
                    {settings.billingSettings?.usdotNumber ? `USDOT: ${settings.billingSettings.usdotNumber}` : ''}
                    {settings.billingSettings?.usdotNumber && settings.billingSettings?.taxId ? ' | ' : ''}
                    {settings.billingSettings?.taxId ? `Tax ID: ${settings.billingSettings.taxId}` : ''}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Invoice / Statement
                </span>
                <span className="font-mono text-lg font-black text-blue-600 block mt-0.5">
                  {selectedInvoice.invoiceNumber}
                </span>
                <Badge
                  variant={
                    selectedInvoice.status === 'paid'
                      ? 'success'
                      : selectedInvoice.status === 'overdue'
                      ? 'error'
                      : 'warning'
                  }
                  size="sm"
                  className="font-bold uppercase text-[10px] mt-1.5"
                >
                  {selectedInvoice.status}
                </Badge>
              </div>
            </div>

            {/* Account & Billing Cycle Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Billed Corporate Account
                </span>
                <p className="font-black text-slate-900 text-sm mt-0.5">{selectedInvoice.customerName}</p>
                <p className="text-slate-600">{selectedInvoice.customerEmail}</p>
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Acct #: {selectedInvoice.corporateAccountId || printableData?.corporateAccount?.accountNumber || 'CORP-GEN-104'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">Terms: Net 30 Days</span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Statement &amp; Cycle Dates
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Date:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedInvoice.issuedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Due:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedInvoice.dueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Billing Cycle:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {printableData?.corporateAccount?.billingCycle || 'Monthly Net 30'}
                  </span>
                </div>
                {selectedInvoice.paidDate && (
                  <div className="flex justify-between text-emerald-600 font-bold border-t border-slate-200 pt-1">
                    <span>Reconciled Date:</span>
                    <span className="font-mono">{selectedInvoice.paidDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Itemized Trip Logs Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Itemized Transportation Logs
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {printableData?.lineItems?.length || selectedInvoice.lineItems.length} Trip Record(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Passenger</th>
                      <th className="px-4 py-2.5">Route / Service Description</th>
                      <th className="px-4 py-2.5 text-right">Fare</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printableData?.lineItems
                      ? printableData.lineItems.map((li, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">{li.date}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-800">{li.passengerName || selectedInvoice.customerName}</td>
                            <td className="px-4 py-2.5 text-slate-700">
                              <div>{li.description}</div>
                              {li.pickupDropoff && (
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">{li.pickupDropoff}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              ${li.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      : selectedInvoice.lineItems.map((li, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">{selectedInvoice.issuedDate}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-800">{selectedInvoice.customerName}</td>
                            <td className="px-4 py-2.5 text-slate-700">{li.description}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              ${li.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                  <tfoot className="bg-slate-50/90 font-medium border-t border-slate-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-slate-600">Subtotal:</td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-slate-900">
                        ${(printableData?.subtotal || selectedInvoice.totalAmount).toFixed(2)}
                      </td>
                    </tr>
                    {(printableData?.discountAmount ?? 0) > 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-1.5 text-right text-emerald-600">
                          Corporate Contract Discount:
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono font-bold text-emerald-600">
                          -${printableData!.discountAmount!.toFixed(2)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3} className="px-4 py-1.5 text-right text-slate-500 text-[11px]">
                        Sales &amp; Transit Tax (MO RS 144.030 Exempt):
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-slate-500 text-[11px]">
                        $0.00
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200 bg-blue-50/50">
                      <td colSpan={3} className="px-4 py-3 text-right font-black text-slate-900 text-sm">
                        Total Balance Due:
                      </td>
                      <td className="px-4 py-3 text-right font-black text-base text-blue-700 font-mono">
                        ${selectedInvoice.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Payment Terms & Remittance Bank Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Bank / Remittance Details
                </span>
                <p className="font-bold text-slate-800">
                  {printableData?.remittanceInfo?.bankName || 'ACH / Corporate Check Remittance'}
                </p>
                <p className="text-slate-600">
                  Payable To: {printableData?.remittanceInfo?.accountName || settings.company?.name || COMPANY_CONFIG.legalName}
                </p>
                <p className="font-mono text-slate-700 text-[11px]">
                  Billing Desk: {printableData?.remittanceInfo?.billingEmail || settings.company?.email || COMPANY_CONFIG.email.dispatch}
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Payment Remittance Terms
                </span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Terms: {(selectedInvoice.billingCycle || printableData?.corporateAccount?.billingCycle || 'net30').toUpperCase()}. Please include invoice number{' '}
                  <span className="font-mono font-bold text-slate-800">{selectedInvoice.invoiceNumber}</span> on all checks or electronic remittances.
                </p>
                <p className="text-slate-500 text-[10px]">
                  Mail checks to: {settings.company?.name || COMPANY_CONFIG.legalName}, {settings.company?.address || COMPANY_CONFIG.address.formatted}
                </p>
              </div>

              {/* 1-Tap Online Pay Link Remittance Footer (Printable PDF) */}
              {(printableData?.payLinkUrl || selectedInvoice.payLinkUrl || selectedInvoice.payToken) && (
                <div className="sm:col-span-2 p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider block">
                      1-Tap Online Card / Apple Pay / Google Pay Settlement
                    </span>
                    <div className="font-mono text-[11px] font-bold text-blue-950 break-all select-all">
                      {printableData?.payLinkUrl ||
                        selectedInvoice.payLinkUrl ||
                        getPayLinkService().buildPayUrl(selectedInvoice.payToken!)}
                    </div>
                  </div>
                  {selectedInvoice.status !== 'paid' && (
                    <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={payLinkInvoiceBusyId !== null}
                        onClick={() => onInvoicePayLink(selectedInvoice, 'copy')}
                        className="text-[11px] px-2.5 py-1 h-auto bg-white border-blue-300 text-blue-800 font-bold cursor-pointer"
                      >
                        Copy Link
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={payLinkInvoiceBusyId !== null}
                        onClick={() => onInvoicePayLink(selectedInvoice, 'email')}
                        className="text-[11px] px-2.5 py-1 h-auto bg-blue-600 border-blue-600 text-white hover:bg-blue-700 font-bold cursor-pointer"
                      >
                        Email Pay Link
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Controls (Hidden in Print Mode) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200 no-print">
              <div className="text-xs text-slate-400">
                {settings.company?.name || COMPANY_CONFIG.name} Billing Division
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedInvoice(null)}
                  className="cursor-pointer"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isEmailingInvoice}
                  onClick={() => onEmailInvoice(selectedInvoice)}
                  className="text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 font-bold cursor-pointer"
                >
                  {isEmailingInvoice ? 'Emailing...' : 'Email Statement'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-xs"
                >
                  Print / Save PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
