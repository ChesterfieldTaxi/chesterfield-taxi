import React from 'react';
import type { Trip } from '../../../core/types/trip';
import type { DriverPayoutRecord, DriverSettlementMethod } from '../../../core/types/payment';
import type { BottomSheetDragHandlers } from '../../../core/hooks/useBottomSheetDragToClose';
import type { RideFareSnapshot } from '../../../core/utils/driver-ui.util';
import { CheckIcon, ShieldCheckIcon, SpinnerIcon, XIcon } from '../../ui/Icons';

export interface DriverPaymentTerminalModalProps {
  isOpen: boolean;
  modalTrip: Trip | null;
  fareSnapshot: RideFareSnapshot;
  stripeOnlineEnabled: boolean;
  settlementMethod: DriverSettlementMethod;
  cardLast4Input: string;
  tipSelection: number | 'custom';
  customTipValue: string;
  isProcessingPayment: boolean;
  completedPayoutReceipt: DriverPayoutRecord | null;
  sheetStyle: React.CSSProperties;
  dragHandlers: BottomSheetDragHandlers;
  onClose: () => void;
  onReturnToShift: () => void;
  onSetSettlementMethod: (method: DriverSettlementMethod) => void;
  onSetCardLast4Input: (value: string) => void;
  onSetTipSelection: (tip: number | 'custom') => void;
  onSetCustomTipValue: (value: string) => void;
  onProcessPayment: () => void;
}

export const DriverPaymentTerminalModal = React.memo(function DriverPaymentTerminalModal({
  isOpen,
  modalTrip,
  fareSnapshot: snap,
  stripeOnlineEnabled,
  settlementMethod,
  cardLast4Input,
  tipSelection,
  customTipValue,
  isProcessingPayment,
  completedPayoutReceipt,
  sheetStyle,
  dragHandlers,
  onClose,
  onReturnToShift,
  onSetSettlementMethod,
  onSetCardLast4Input,
  onSetTipSelection,
  onSetCustomTipValue,
  onProcessPayment,
}: DriverPaymentTerminalModalProps) {
  if (!isOpen || !modalTrip) return null;

  let calculatedTip = 0;
  if (tipSelection === 'custom') {
    calculatedTip = Math.max(0, Number((parseFloat(customTipValue) || 0).toFixed(2)));
  } else if (typeof tipSelection === 'number' && tipSelection > 0) {
    calculatedTip = Number(((snap.subtotalFare * tipSelection) / 100).toFixed(2));
  }
  const grandTotal = Number((snap.subtotalFare + calculatedTip).toFixed(2));
  const hasStripePreAuth =
    stripeOnlineEnabled &&
    modalTrip.payment?.status === 'authorized' &&
    Boolean(modalTrip.payment?.paymentIntentId?.startsWith('pi_'));
  const meta = (modalTrip.metadata || {}) as Record<string, any>;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isProcessingPayment && !completedPayoutReceipt) {
          onClose();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl px-5 sm:px-6 pt-2.5 sm:pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 w-full max-w-md shadow-2xl flex flex-col gap-5 text-white max-h-[92dvh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        <div {...dragHandlers} className="py-1.5 -mt-1.5 touch-none sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto" aria-hidden="true" />
        </div>
        {completedPayoutReceipt ? (
          /* RECONCILED RECEIPT & DRIVER SETTLEMENT SUMMARY (ZERO DOUBLE-COUNT!) */
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
              <CheckIcon className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Ride Completed &amp; Reconciled</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Settled via {(completedPayoutReceipt.paymentMethod || 'card_terminal').replace('_', ' ').toUpperCase()}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Base Ride Fare:</span>
                <span className="font-mono text-slate-200">
                  ${(completedPayoutReceipt.baseFareAmount ?? completedPayoutReceipt.totalFare).toFixed(2)}
                </span>
              </div>
              {(completedPayoutReceipt.nonTollExtrasAmount || 0) > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>Non-Toll Extras (Split):</span>
                  <span className="font-mono font-bold">
                    +${(completedPayoutReceipt.nonTollExtrasAmount || 0).toFixed(2)}
                  </span>
                </div>
              )}
              {completedPayoutReceipt.tollsReimbursed > 0 && (
                <div className="flex justify-between text-blue-400">
                  <span>Tolls (100% Pass-Through):</span>
                  <span className="font-mono font-bold">
                    +${completedPayoutReceipt.tollsReimbursed.toFixed(2)}
                  </span>
                </div>
              )}
              {completedPayoutReceipt.tipAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Gratuity / Tip (100% Driver):</span>
                  <span className="font-mono font-bold">+${completedPayoutReceipt.tipAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-slate-800 pt-2 flex justify-between font-black text-sm text-white">
                <span>Passenger Grand Total:</span>
                <span className="font-mono">${completedPayoutReceipt.totalFare.toFixed(2)}</span>
              </div>
            </div>

            {completedPayoutReceipt.settlementDirection === 'driver_owes_company' ? (
              <div className="bg-amber-950/50 border border-amber-700/70 rounded-2xl p-4 text-left space-y-1.5 text-xs">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Cash Ride Settlement
                </span>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-300">Cash Collected in Car:</span>
                  <span className="text-base font-black text-white font-mono">
                    ${(completedPayoutReceipt.driverCashCollected || completedPayoutReceipt.totalFare).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-amber-300 font-semibold">
                    Company Commission Owed ({Math.round((1 - (completedPayoutReceipt.commissionRate ?? 0.75)) * 100)}%):
                  </span>
                  <span className="text-xl font-black text-amber-400 font-mono">
                    ${(completedPayoutReceipt.companyCommissionOwed || completedPayoutReceipt.platformFee).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-amber-500/80">Ref: {completedPayoutReceipt.id}</p>
              </div>
            ) : (
              <div className="bg-emerald-950/50 border border-emerald-800/80 rounded-2xl p-4 text-left space-y-1.5 text-xs">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Driver Net Payout Logged
                </span>
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    ${completedPayoutReceipt.netPayout.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-emerald-300 font-semibold">
                    ({Math.round((completedPayoutReceipt.commissionRate ?? 0.75) * 100)}% Fare + 100% Tolls/Tip)
                  </span>
                </div>
                <p className="text-[10px] font-mono text-emerald-500/80">
                  Payout Ref: {completedPayoutReceipt.id} · {completedPayoutReceipt.status.toUpperCase()}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onReturnToShift}
              className="w-full py-3.5 min-h-[48px] bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl shadow-lg cursor-pointer"
            >
              Return to Shift
            </button>
          </div>
        ) : (
          /* PAY-IN-CAR SETTLEMENT PROMPT */
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-black text-base text-white">Trip Checkout</h4>
                <p className="text-[11px] text-slate-400">Trip {modalTrip.id} · Select payment &amp; tip</p>
              </div>
              <button
                type="button"
                disabled={isProcessingPayment}
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer shrink-0"
                aria-label="Close checkout modal"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Accurate Breakdown Box */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>{snap.isQuotedLocked ? 'Quoted Ride Fare' : 'Metered Ride Fare'}:</span>
                  <span className="font-mono text-white font-bold">${snap.baseRideFare.toFixed(2)}</span>
                </div>
                {snap.nonTollExtrasTotal > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Added Extras (Split):</span>
                    <span className="font-mono text-white">+${snap.nonTollExtrasTotal.toFixed(2)}</span>
                  </div>
                )}
                {snap.tollsTotal > 0 && (
                  <div className="flex justify-between text-blue-300">
                    <span>Tolls (100% Driver):</span>
                    <span className="font-mono">+${snap.tollsTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-1.5 border-t border-slate-800 flex justify-between font-black text-sm text-white">
                  <span>Subtotal Before Tip</span>
                  <span className="font-mono">${snap.subtotalFare.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Payment Method:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onSetSettlementMethod('card_terminal')}
                    className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                      settlementMethod === 'card_terminal'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    Card (In Car)
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetSettlementMethod('cash')}
                    className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                      settlementMethod === 'cash'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    Cash (In Car)
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetSettlementMethod('corporate_account')}
                    className={`py-2.5 px-2 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                      settlementMethod === 'corporate_account'
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    Corporate Account
                  </button>
                </div>

                {hasStripePreAuth && (
                  <button
                    type="button"
                    onClick={() => onSetSettlementMethod('stripe_preauth')}
                    className={`w-full py-2.5 px-3 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer ${
                      settlementMethod === 'stripe_preauth'
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-slate-800 border-slate-700 text-indigo-300'
                    }`}
                  >
                    Capture Online Card Hold
                    {modalTrip.payment?.cardLast4 ? ` (•••• ${modalTrip.payment.cardLast4})` : ''}
                  </button>
                )}

                {settlementMethod === 'card_terminal' && (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">Card Last 4 (optional):</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="1234"
                      value={cardLast4Input}
                      onChange={(e) => onSetCardLast4Input(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-center font-mono text-white outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {settlementMethod === 'corporate_account' && (
                  <div className="bg-purple-950/40 border border-purple-800/60 rounded-xl p-3 text-xs text-purple-200">
                    <strong>Corporate Account:</strong>{' '}
                    {meta.corporateOrgName || meta.corporateDetails?.companyName || 'Corporate Account'}
                    {meta.billingPo || meta.corporateDetails?.billingPo
                      ? ` · PO #${meta.billingPo || meta.corporateDetails?.billingPo}`
                      : ''}
                    <span className="block text-[11px] text-purple-300/80 mt-0.5">
                      No payment collected in the car — billed to the corporate account.
                    </span>
                  </div>
                )}
              </div>

              {/* Tip Selection */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Gratuity / Tip (100% Driver):
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'No Tip', value: 0 },
                    { label: '15%', value: 15 },
                    { label: '20%', value: 20 },
                    { label: '25%', value: 25 },
                  ].map((opt) => {
                    const isSelected = tipSelection === opt.value;
                    const tipValue = opt.value > 0 ? (snap.subtotalFare * opt.value) / 100 : 0;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onSetTipSelection(opt.value)}
                        className={`py-2.5 px-1 min-h-[48px] rounded-xl text-center border font-bold text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        <div>{opt.label}</div>
                        {opt.value > 0 && (
                          <div className="text-[10px] font-normal opacity-80 font-mono">
                            +${tipValue.toFixed(2)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSetTipSelection('custom')}
                    className={`py-2.5 px-3 min-h-[44px] rounded-xl border text-xs font-bold cursor-pointer shrink-0 ${
                      tipSelection === 'custom'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    Custom Tip ($)
                  </button>
                  {tipSelection === 'custom' && (
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      placeholder="e.g. 5.00"
                      value={customTipValue}
                      onChange={(e) => onSetCustomTipValue(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 font-mono"
                      autoFocus
                    />
                  )}
                </div>
              </div>

              {/* Grand Total */}
              <div className="bg-blue-950/40 border border-blue-800/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
                    {settlementMethod === 'cash'
                      ? 'Cash to Collect'
                      : settlementMethod === 'corporate_account'
                      ? 'Total to Bill Account'
                      : 'Total to Charge'}
                  </span>
                  <span className="text-xs text-slate-400">Includes fare, extras, tolls &amp; tip</span>
                </div>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  ${grandTotal.toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                disabled={isProcessingPayment}
                onClick={onProcessPayment}
                className="w-full py-4 min-h-[54px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-xl cursor-pointer flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <>
                    <SpinnerIcon className="w-5 h-5 animate-spin" />
                    <span>Finalizing Settlement...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="w-5 h-5" />
                    <span>
                      {settlementMethod === 'cash'
                        ? 'Confirm Cash Collected & Complete'
                        : settlementMethod === 'corporate_account'
                        ? 'Log Corporate Direct Bill & Complete'
                        : settlementMethod === 'stripe_preauth'
                        ? 'Capture Stripe Pre-Auth & Complete'
                        : 'Confirm Card Terminal & Complete'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
