import React, { useState, useEffect } from 'react';
import type {
  CustomPayeeCategory,
  CustomPayeeRateType,
  PayoutPayeeRecord,
  PayoutPaymentMethod,
  PayoutSettlementRecord,
  PayoutSettlementStatus,
} from '../../../../core/types/config';
import { resolvePayoutLedgerMapping } from '../../../../core/services/payouts.service';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { Button } from '../../../ui/Button';
import { CheckIcon, PlusIcon } from '../../../ui/Icons';

export type PayoutSettlementDraft = Omit<PayoutSettlementRecord, 'id' | 'createdAt'>;

export interface PayoutSettlementModalProps {
  settlementDraft: PayoutSettlementDraft | null;
  onCloseSettlement: () => void;
  onConfirmSettlement: (record: PayoutSettlementRecord) => Promise<void>;
  editingPayee: Partial<PayoutPayeeRecord> | null;
  onClosePayee: () => void;
  onSavePayee: (payee: PayoutPayeeRecord) => Promise<void>;
  isSaving: boolean;
}

export function PayoutSettlementModal({
  settlementDraft,
  onCloseSettlement,
  onConfirmSettlement,
  editingPayee,
  onClosePayee,
  onSavePayee,
  isSaving,
}: PayoutSettlementModalProps) {
  const [status, setStatus] = useState<PayoutSettlementStatus>('paid');
  const [paymentMethod, setPaymentMethod] = useState<PayoutPaymentMethod>('ach');
  const [adjustments, setAdjustments] = useState(0);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [payeeName, setPayeeName] = useState('');
  const [payeeCategory, setPayeeCategory] = useState<CustomPayeeCategory>('affiliate');
  const [payeeEmail, setPayeeEmail] = useState('');
  const [payeePhone, setPayeePhone] = useState('');
  const [rateType, setRateType] = useState<CustomPayeeRateType>('flat');
  const [rateValue, setRateValue] = useState(25);
  const [payeeNotes, setPayeeNotes] = useState('');
  const [payeeActive, setPayeeActive] = useState(true);

  useEffect(() => {
    if (!settlementDraft) return;
    setStatus(settlementDraft.status || 'paid');
    setPaymentMethod(settlementDraft.paymentMethod || 'ach');
    setAdjustments(settlementDraft.adjustmentsAmount || 0);
    setReferenceNumber(settlementDraft.referenceNumber || '');
    setNotes(settlementDraft.notes || '');
  }, [settlementDraft]);

  useEffect(() => {
    if (!editingPayee) return;
    setPayeeName(editingPayee.name || '');
    setPayeeCategory(editingPayee.category || 'affiliate');
    setPayeeEmail(editingPayee.email || '');
    setPayeePhone(editingPayee.phone || '');
    setRateType(editingPayee.defaultRateType || 'flat');
    setRateValue(editingPayee.defaultRateValue ?? 25);
    setPayeeNotes(editingPayee.notes || '');
    setPayeeActive(editingPayee.isActive !== false);
  }, [editingPayee]);

  const baseNetExAdj = settlementDraft
    ? Number((settlementDraft.netPayoutAmount - (settlementDraft.adjustmentsAmount || 0)).toFixed(2))
    : 0;
  const computedNet = Math.max(0, Number((baseNetExAdj + (Number(adjustments) || 0)).toFixed(2)));

  return (
    <>
      {/* ─── Slide-Over 1: Record Payout Settlement ─── */}
      <AdminSlideOverDrawer
        isOpen={Boolean(settlementDraft)}
        onClose={onCloseSettlement}
        title={settlementDraft ? `Record Payout: ${settlementDraft.payeeName}` : 'Record Payout'}
        subtitle={
          settlementDraft
            ? `${settlementDraft.payeeRoleLabel} · ${settlementDraft.periodStart} – ${settlementDraft.periodEnd}`
            : ''
        }
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" size="md" onClick={onCloseSettlement}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isSaving}
              onClick={async () => {
                if (!settlementDraft) return;
                const nowIso = new Date().toISOString();
                await onConfirmSettlement({
                  ...settlementDraft,
                  id: `stl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                  adjustmentsAmount: Number(adjustments) || 0,
                  netPayoutAmount: computedNet,
                  status,
                  paymentMethod,
                  referenceNumber: referenceNumber.trim() || undefined,
                  notes: notes.trim() || undefined,
                  paidAt: status === 'paid' ? nowIso : undefined,
                  createdAt: nowIso,
                });
                onCloseSettlement();
              }}
              leftIcon={<CheckIcon className="w-4 h-4" />}
              className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Confirm ${computedNet.toFixed(2)} Settlement
            </Button>
          </>
        }
      >
        {settlementDraft && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Gross Base / Share</span>
                <span className="font-mono text-white">${settlementDraft.grossAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Pass-Through Tips / Tolls / Bonus</span>
                <span className="font-mono text-emerald-400">
                  +${settlementDraft.tipsOrBonusAmount.toFixed(2)}
                </span>
              </div>
              {settlementDraft.deductionsOrPlatformFee > 0 && (
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Platform Commission / Prior Settled</span>
                  <span className="font-mono text-amber-300">
                    ${settlementDraft.deductionsOrPlatformFee.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="font-bold text-xs">Authoritative Net Payout</span>
                <span className="font-mono text-lg font-black text-emerald-400">
                  ${computedNet.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Settlement Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PayoutSettlementStatus)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="paid">Paid Immediately (Posts GL)</option>
                  <option value="approved">Approved (Ready to Pay)</option>
                  <option value="pending">Pending Review</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PayoutPaymentMethod)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="ach">ACH Direct Deposit</option>
                  <option value="zelle">Zelle / Instant Transfer</option>
                  <option value="payroll">Payroll Run</option>
                  <option value="check">Company Check</option>
                  <option value="cash">Cash Disbursement</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Adjustments ($ +/-)</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustments}
                  onChange={(e) => setAdjustments(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Reference / Check #</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="ACH-90421 / Chk #1082"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Disbursement Memo</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional memo for QuickBooks General Ledger..."
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800">
              GL Account Mapping:{' '}
              <strong className="font-mono">
                {resolvePayoutLedgerMapping(settlementDraft.payeeType).accountCode}
              </strong>{' '}
              (offset <strong className="font-mono">1010-OperatingCash</strong> when marked Paid).
            </div>
          </div>
        )}
      </AdminSlideOverDrawer>

      {/* ─── Slide-Over 2: Add / Edit Custom Payee (Affiliate, Contractor, Vendor, Concierge) ─── */}
      <AdminSlideOverDrawer
        isOpen={Boolean(editingPayee)}
        onClose={onClosePayee}
        title={editingPayee?.id ? 'Edit Payee' : 'Add Custom Payee'}
        subtitle="Manage affiliates, hotel concierges, sub-contracted chauffeurs, and fleet vendors"
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" size="md" onClick={onClosePayee}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isSaving}
              disabled={!payeeName.trim()}
              onClick={async () => {
                if (!payeeName.trim()) return;
                await onSavePayee({
                  id: editingPayee?.id || `payee-${Date.now().toString(36)}`,
                  name: payeeName.trim(),
                  category: payeeCategory,
                  email: payeeEmail.trim() || undefined,
                  phone: payeePhone.trim() || undefined,
                  defaultRateType: rateType,
                  defaultRateValue: Math.max(0, Number(rateValue) || 0),
                  notes: payeeNotes.trim() || undefined,
                  isActive: payeeActive,
                });
                onClosePayee();
              }}
              leftIcon={<PlusIcon className="w-4 h-4" />}
              className="font-bold"
            >
              Save Payee
            </Button>
          </>
        }
      >
        {editingPayee && (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Payee / Vendor Name *</label>
              <input
                type="text"
                required
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                placeholder="e.g. Ritz-Carlton Concierge Desk / Midwest Fleet Care"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={payeeCategory}
                  onChange={(e) => setPayeeCategory(e.target.value as CustomPayeeCategory)}
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="affiliate">Affiliate</option>
                  <option value="concierge">Concierge</option>
                  <option value="contractor">Contractor</option>
                  <option value="vendor">Vendor / Mechanic</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Rate Type</label>
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as CustomPayeeRateType)}
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="flat">Flat ($)</option>
                  <option value="percent">Percent (%)</option>
                  <option value="hourly">Hourly ($/hr)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Default Rate</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={rateValue}
                  onChange={(e) => setRateValue(Number(e.target.value) || 0)}
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Email</label>
                <input
                  type="email"
                  value={payeeEmail}
                  onChange={(e) => setPayeeEmail(e.target.value)}
                  placeholder="billing@partner.com"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Phone</label>
                <input
                  type="tel"
                  value={payeePhone}
                  onChange={(e) => setPayeePhone(e.target.value)}
                  placeholder="(314) 555-0180"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Notes</label>
              <input
                type="text"
                value={payeeNotes}
                onChange={(e) => setPayeeNotes(e.target.value)}
                placeholder="Payment instructions, 1099 / W-9 notes..."
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={payeeActive}
                onChange={(e) => setPayeeActive(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="font-bold text-slate-800">Active Payee</span>
            </label>
          </div>
        )}
      </AdminSlideOverDrawer>
    </>
  );
}
