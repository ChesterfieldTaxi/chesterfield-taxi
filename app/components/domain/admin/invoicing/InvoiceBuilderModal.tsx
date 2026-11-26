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
          className="fixed inset-0 bg-surface-overlay/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewAccountModalOpen(false);
          }}
        >
          <div
            style={newAccountSheetDrag.sheetStyle}
            className="bg-surface-card rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl border-t sm:border border-border-subtle animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...newAccountSheetDrag.dragHandlers}
              className="px-5 pt-2.5 sm:pt-5 pb-3 border-b border-border-subtle shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex justify-between items-center">
                <h3 className="font-black text-fg-primary text-base">Register Corporate Account</h3>
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  aria-label="Close corporate account modal"
                  className="p-1.5 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={onAddCorporateAccount} className="p-5 overflow-y-auto space-y-3 text-xs">
              <div>
                <label className="font-bold text-fg-secondary block mb-1">Company / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newCorpName}
                  onChange={(e) => setNewCorpName(e.target.value)}
                  placeholder="e.g. Pfizer Chesterfield Labs"
                  className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-fg-secondary block mb-1">Billing Terms</label>
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
                  <label className="font-bold text-fg-secondary block mb-1">Credit Limit ($)</label>
                  <input
                    type="number"
                    value={newCorpLimit}
                    onChange={(e) => setNewCorpLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-fg-secondary block mb-1">Billing Contact Name</label>
                  <input
                    type="text"
                    value={newCorpContactName}
                    onChange={(e) => setNewCorpContactName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-fg-secondary block mb-1">Billing Email</label>
                  <input
                    type="email"
                    required
                    value={newCorpContactEmail}
                    onChange={(e) => setNewCorpContactEmail(e.target.value)}
                    placeholder="ap@company.com"
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-2">
                <div>
                  <label className="font-bold text-fg-secondary block mb-1">Contract Discount (%)</label>
                  <input
                    type="number"
                    value={newCorpDiscount}
                    onChange={(e) => setNewCorpDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg"
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
                  <label htmlFor="poReq" className="font-bold text-fg-secondary">Require PO #</label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
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
          className="fixed inset-0 bg-surface-overlay/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewInvoiceModalOpen(false);
          }}
        >
          <div
            style={newInvoiceSheetDrag.sheetStyle}
            className="bg-surface-card rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl border-t sm:border border-border-subtle animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...newInvoiceSheetDrag.dragHandlers}
              className="px-5 pt-2.5 sm:pt-5 pb-3 border-b border-border-subtle shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex justify-between items-center">
                <h3 className="font-black text-fg-primary text-base">Generate Direct Invoice</h3>
                <button
                  type="button"
                  onClick={() => setIsNewInvoiceModalOpen(false)}
                  aria-label="Close invoice modal"
                  className="p-1.5 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={onCreateInvoice} className="p-5 overflow-y-auto space-y-3 text-xs">
              <div>
                <label className="font-bold text-fg-secondary block mb-1">Select Corporate Account (Optional)</label>
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
                <label className="font-bold text-fg-secondary block mb-1">Client / Organization Name</label>
                <input
                  type="text"
                  required
                  value={newInvCustomer}
                  onChange={(e) => setNewInvCustomer(e.target.value)}
                  placeholder="e.g. Bayer Travel Services"
                  className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-fg-secondary block mb-1">Billing Email</label>
                <input
                  type="email"
                  required
                  value={newInvEmail}
                  onChange={(e) => setNewInvEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-fg-secondary block mb-1">Invoice Total ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInvAmount}
                    onChange={(e) => setNewInvAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-fg-secondary block mb-1">Payment Due In (Days)</label>
                  <input
                    type="number"
                    value={newInvDueDays}
                    onChange={(e) => setNewInvDueDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-fg-secondary block mb-1">Primary Line Item Description</label>
                <input
                  type="text"
                  value={newInvDescription}
                  onChange={(e) => setNewInvDescription(e.target.value)}
                  placeholder="e.g. September Executive Airport Runs"
                  className="w-full px-3 py-2 border border-border-subtle rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
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
          className="fixed inset-0 bg-surface-overlay/70 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedInvoice(null);
          }}
        >
          <div
            id="printable-invoice-modal"
            style={invoicePreviewSheetDrag.sheetStyle}
            className="bg-surface-card rounded-t-3xl sm:rounded-2xl max-w-3xl w-full max-h-[92dvh] sm:max-h-none overflow-y-auto p-5 sm:p-8 shadow-2xl border-t sm:border border-border-subtle space-y-5 sm:space-y-6 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 sm:my-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-8 print:shadow-none print:border-none print:max-h-none"
          >
            <div {...invoicePreviewSheetDrag.dragHandlers} className="touch-none sm:hidden print:hidden -mt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto" aria-hidden="true" />
            </div>
            {/* Header: Company & Invoice Metadata */}
            <div className="flex flex-wrap justify-between items-start border-b border-border-subtle pb-5 gap-4">
              <div>
                <h2 className="font-black text-2xl text-fg-primary tracking-tight">
                  {settings.company?.name || COMPANY_CONFIG.name}
                </h2>
                <p className="text-xs font-semibold text-fg-secondary mt-0.5">
                  Corporate Transportation &amp; Fleet Logistics Division
                </p>
                <p className="text-xs text-fg-muted mt-1">
                  {settings.company?.address || COMPANY_CONFIG.address.formatted}
                </p>
                <p className="text-xs text-fg-muted">
                  Phone: {settings.company?.phone || COMPANY_CONFIG.phone.dispatch} | Billing: {settings.company?.email || COMPANY_CONFIG.email.dispatch}
                </p>
                {(settings.billingSettings?.usdotNumber || settings.billingSettings?.taxId) && (
                  <p className="text-[11px] font-mono text-fg-subtle">
                    {settings.billingSettings?.usdotNumber ? `USDOT: ${settings.billingSettings.usdotNumber}` : ''}
                    {settings.billingSettings?.usdotNumber && settings.billingSettings?.taxId ? ' | ' : ''}
                    {settings.billingSettings?.taxId ? `Tax ID: ${settings.billingSettings.taxId}` : ''}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-widest block">
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
              <div className="p-4 bg-surface-subtle rounded-xl border border-border-faint space-y-1">
                <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                  Billed Corporate Account
                </span>
                <p className="font-black text-fg-primary text-sm mt-0.5">{selectedInvoice.customerName}</p>
                <p className="text-fg-secondary">{selectedInvoice.customerEmail}</p>
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-status-info-bg text-status-info-fg border border-status-info-border">
                    Acct #: {selectedInvoice.corporateAccountId || printableData?.corporateAccount?.accountNumber || 'CORP-GEN-104'}
                  </span>
                  <span className="text-[11px] text-fg-muted font-medium">Terms: Net 30 Days</span>
                </div>
              </div>

              <div className="p-4 bg-surface-subtle rounded-xl border border-border-faint space-y-1.5">
                <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                  Statement &amp; Cycle Dates
                </span>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Invoice Date:</span>
                  <span className="font-mono font-bold text-fg-strong">{selectedInvoice.issuedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Payment Due:</span>
                  <span className="font-mono font-bold text-fg-strong">{selectedInvoice.dueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Billing Cycle:</span>
                  <span className="font-mono font-bold text-fg-strong">
                    {printableData?.corporateAccount?.billingCycle || 'Monthly Net 30'}
                  </span>
                </div>
                {selectedInvoice.paidDate && (
                  <div className="flex justify-between text-emerald-600 font-bold border-t border-border-subtle pt-1">
                    <span>Reconciled Date:</span>
                    <span className="font-mono">{selectedInvoice.paidDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Itemized Trip Logs Table */}
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <div className="bg-surface-muted/70 px-4 py-2 border-b border-border-subtle flex justify-between items-center">
                <span className="text-[11px] font-bold text-fg-secondary uppercase tracking-wider">
                  Itemized Transportation Logs
                </span>
                <span className="text-[11px] font-mono text-fg-muted">
                  {printableData?.lineItems?.length || selectedInvoice.lineItems.length} Trip Record(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle border-b border-border-subtle text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Passenger</th>
                      <th className="px-4 py-2.5">Route / Service Description</th>
                      <th className="px-4 py-2.5 text-right">Fare</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-faint">
                    {printableData?.lineItems
                      ? printableData.lineItems.map((li, idx) => (
                          <tr key={idx} className="hover:bg-surface-subtle/50">
                            <td className="px-4 py-2.5 font-mono text-fg-secondary whitespace-nowrap">{li.date}</td>
                            <td className="px-4 py-2.5 font-bold text-fg-strong">{li.passengerName || selectedInvoice.customerName}</td>
                            <td className="px-4 py-2.5 text-fg-secondary">
                              <div>{li.description}</div>
                              {li.pickupDropoff && (
                                <div className="text-[11px] text-fg-muted font-mono mt-0.5">{li.pickupDropoff}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-fg-primary whitespace-nowrap">
                              ${li.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      : selectedInvoice.lineItems.map((li, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2.5 font-mono text-fg-secondary whitespace-nowrap">{selectedInvoice.issuedDate}</td>
                            <td className="px-4 py-2.5 font-bold text-fg-strong">{selectedInvoice.customerName}</td>
                            <td className="px-4 py-2.5 text-fg-secondary">{li.description}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-fg-primary whitespace-nowrap">
                              ${li.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                  <tfoot className="bg-surface-subtle/90 font-medium border-t border-border-subtle">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-fg-secondary">Subtotal:</td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-fg-primary">
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
                      <td colSpan={3} className="px-4 py-1.5 text-right text-fg-muted text-[11px]">
                        Sales &amp; Transit Tax (MO RS 144.030 Exempt):
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-fg-muted text-[11px]">
                        $0.00
                      </td>
                    </tr>
                    <tr className="border-t border-border-subtle bg-status-info-bg/50">
                      <td colSpan={3} className="px-4 py-3 text-right font-black text-fg-primary text-sm">
                        Total Balance Due:
                      </td>
                      <td className="px-4 py-3 text-right font-black text-base text-status-info-fg font-mono">
                        ${selectedInvoice.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Payment Terms & Remittance Bank Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-faint space-y-1">
                <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                  Bank / Remittance Details
                </span>
                <p className="font-bold text-fg-strong">
                  {printableData?.remittanceInfo?.bankName || 'ACH / Corporate Check Remittance'}
                </p>
                <p className="text-fg-secondary">
                  Payable To: {printableData?.remittanceInfo?.accountName || settings.company?.name || COMPANY_CONFIG.legalName}
                </p>
                <p className="font-mono text-fg-secondary text-[11px]">
                  Billing Desk: {printableData?.remittanceInfo?.billingEmail || settings.company?.email || COMPANY_CONFIG.email.dispatch}
                </p>
              </div>

              <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-faint space-y-1">
                <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                  Payment Remittance Terms
                </span>
                <p className="text-fg-secondary text-[11px] leading-relaxed">
                  Terms: {(selectedInvoice.billingCycle || printableData?.corporateAccount?.billingCycle || 'net30').toUpperCase()}. Please include invoice number{' '}
                  <span className="font-mono font-bold text-fg-strong">{selectedInvoice.invoiceNumber}</span> on all checks or electronic remittances.
                </p>
                <p className="text-fg-muted text-[10px]">
                  Mail checks to: {settings.company?.name || COMPANY_CONFIG.legalName}, {settings.company?.address || COMPANY_CONFIG.address.formatted}
                </p>
              </div>

              {/* 1-Tap Online Pay Link Remittance Footer (Printable PDF) */}
              {(printableData?.payLinkUrl || selectedInvoice.payLinkUrl || selectedInvoice.payToken) && (
                <div className="sm:col-span-2 p-3.5 bg-status-info-bg/70 rounded-xl border border-status-info-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-[10px] font-extrabold text-status-info-fg uppercase tracking-wider block">
                      1-Tap Online Card / Apple Pay / Google Pay Settlement
                    </span>
                    <div className="font-mono text-[11px] font-bold text-status-info-fg break-all select-all">
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
                        className="text-[11px] px-2.5 py-1 h-auto bg-surface-card border-status-info-border text-status-info-fg font-bold cursor-pointer"
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
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-border-subtle no-print">
              <div className="text-xs text-fg-subtle">
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
                  className="text-status-success-fg border-status-success-border bg-status-success-bg hover:bg-status-success-bg-strong font-bold cursor-pointer"
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
