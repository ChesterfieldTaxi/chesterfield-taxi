import React from 'react';
import type {
  BillingSettingsConfig,
  NormalizedBillingSettingsConfig,
  PayoutPayeeRecord,
  PayoutPayeeType,
} from '../../../../core/types/config';
import {
  computeOtherPayeeSettlement,
  type StaffHoursInputValue,
  type StaffPayoutPreviewRow,
} from '../../../../core/services/payouts.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { PlusIcon, TrashIcon } from '../../../ui/Icons';
import type { PayoutSettlementDraft } from './PayoutSettlementModal';

export interface StaffAndOtherPayeesTablesProps {
  activePayeeTab: PayoutPayeeType;
  isSaving: boolean;
  billingDraft: NormalizedBillingSettingsConfig;
  setBillingDraft: React.Dispatch<React.SetStateAction<NormalizedBillingSettingsConfig>>;
  onSaveBillingPolicies: (patch?: Partial<BillingSettingsConfig>) => Promise<void>;
  staffPreviews: StaffPayoutPreviewRow[];
  staffHoursMap: Record<string, StaffHoursInputValue>;
  setStaffHoursMap: React.Dispatch<React.SetStateAction<Record<string, StaffHoursInputValue>>>;
  customPayees: PayoutPayeeRecord[];
  otherPayeeInputs: Record<string, { volume: number; adjustments: number }>;
  setOtherPayeeInputs: React.Dispatch<
    React.SetStateAction<Record<string, { volume: number; adjustments: number }>>
  >;
  onOpenSettlementDraft: (draft: PayoutSettlementDraft) => void;
  onEditPayee: (payee: Partial<PayoutPayeeRecord>) => void;
  onDeleteCustomPayee: (payeeId: string) => Promise<void>;
}

export function StaffAndOtherPayeesTables({
  activePayeeTab,
  isSaving,
  billingDraft,
  setBillingDraft,
  onSaveBillingPolicies,
  staffPreviews,
  staffHoursMap,
  setStaffHoursMap,
  customPayees,
  otherPayeeInputs,
  setOtherPayeeInputs,
  onOpenSettlementDraft,
  onEditPayee,
  onDeleteCustomPayee,
}: StaffAndOtherPayeesTablesProps) {
  const getStaffEntry = (uid: string) => {
    const raw = staffHoursMap[uid];
    if (typeof raw === 'number') return { hours: raw, adjustments: 0 };
    return { hours: raw?.hours || 0, adjustments: raw?.adjustments || 0 };
  };

  if (activePayeeTab === 'staff') {
    return (
      <Card className="border border-slate-200/90 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <CardTitle className="text-sm font-black text-slate-900">
              Staff &amp; Dispatcher Payroll Settlements
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Shift hours &times; hourly rate + per-dispatched-booking bonus + adjustments.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-700">Hourly ($):</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={billingDraft.staffDispatcherHourlyRate}
              onChange={(e) =>
                setBillingDraft((p) => ({
                  ...p,
                  staffDispatcherHourlyRate: Number(e.target.value) || 0,
                }))
              }
              className="w-16 h-8 px-2 bg-white border border-slate-300 rounded-lg font-mono"
            />
            <span className="font-bold text-slate-700">Bonus/Ride ($):</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={billingDraft.staffPerBookingBonusAmount}
              onChange={(e) =>
                setBillingDraft((p) => ({
                  ...p,
                  staffPerBookingBonusAmount: Number(e.target.value) || 0,
                }))
              }
              className="w-16 h-8 px-2 bg-white border border-slate-300 rounded-lg font-mono"
            />
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={isSaving}
              onClick={() => onSaveBillingPolicies()}
              className="text-xs font-bold"
            >
              Save Rates
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Operator</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5 text-center">Shift Hours</th>
                <th className="px-3 py-2.5 text-right">Dispatched Rides</th>
                <th className="px-3 py-2.5 text-center">Adjustments ($)</th>
                <th className="px-3 py-2.5 text-right">Net Preview</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffPreviews.map((st) => {
                const curr = getStaffEntry(st.operatorId);
                return (
                  <tr key={st.operatorId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-slate-900">{st.operatorName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{st.operatorEmail}</div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{st.roleLabel}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={curr.hours}
                        onChange={(e) =>
                          setStaffHoursMap((prev) => ({
                            ...prev,
                            [st.operatorId]: { ...curr, hours: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-16 px-2 py-1 border border-slate-300 rounded font-mono text-center"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {st.dispatchedTripsCount} (+${st.bookingBonusAmount.toFixed(2)})
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        step="1"
                        value={curr.adjustments}
                        onChange={(e) =>
                          setStaffHoursMap((prev) => ({
                            ...prev,
                            [st.operatorId]: { ...curr, adjustments: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-16 px-2 py-1 border border-slate-300 rounded font-mono text-center"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-700">
                      ${st.netPayoutAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onOpenSettlementDraft({
                            payeeType: 'staff',
                            payeeId: st.operatorId,
                            payeeName: st.operatorName,
                            payeeRoleLabel: st.roleLabel,
                            periodStart: st.periodStart,
                            periodEnd: st.periodEnd,
                            hoursWorked: st.hoursWorked,
                            tripCount: st.dispatchedTripsCount,
                            grossAmount: st.baseWageAmount,
                            tipsOrBonusAmount: st.bookingBonusAmount,
                            deductionsOrPlatformFee: st.alreadySettledAmount,
                            adjustmentsAmount: st.adjustmentsAmount,
                            netPayoutAmount: st.netPayoutAmount,
                            status: 'paid',
                            paymentMethod: 'payroll',
                          })
                        }
                        className="text-[11px] font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50 cursor-pointer"
                      >
                        Record Staff Payout
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    );
  }

  if (activePayeeTab !== 'other') return null;

  return (
    <Card className="border border-slate-200/90 shadow-xs">
      <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-black text-slate-900">
            Affiliates, Concierges, Contractors &amp; Vendors
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Flat, percentage, or hourly partner settlements posted to <code>5030-VendorAffiliatePayout</code>.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="primary"
          leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
          onClick={() => onEditPayee({ defaultRateType: 'flat', defaultRateValue: 25, isActive: true })}
          className="text-xs font-bold"
        >
          Add Payee
        </Button>
      </CardHeader>
      <CardContent className="pt-3 space-y-2.5 text-xs">
        {customPayees.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            No custom payees configured yet. Click <strong>Add Payee</strong> to register an affiliate, hotel concierge, or fleet vendor.
          </div>
        ) : (
          customPayees.map((payee) => {
            const inp = otherPayeeInputs[payee.id] || { volume: 1, adjustments: 0 };
            const calc = computeOtherPayeeSettlement(payee, inp.volume, inp.adjustments);
            const today = new Date().toISOString().slice(0, 10);
            return (
              <div
                key={payee.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{payee.name}</span>
                    <Badge variant="neutral" size="sm" className="text-[10px] uppercase">
                      {payee.category}
                    </Badge>
                    <span className="font-mono text-[11px] text-blue-700">
                      {payee.defaultRateType === 'percent'
                        ? `${payee.defaultRateValue}%`
                        : payee.defaultRateType === 'hourly'
                        ? `$${payee.defaultRateValue}/hr`
                        : `$${payee.defaultRateValue} flat`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {[payee.email, payee.phone, payee.notes].filter(Boolean).join(' · ') || 'Active partner payee'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-slate-600 font-semibold">
                    {payee.defaultRateType === 'percent'
                      ? 'Base Vol ($):'
                      : payee.defaultRateType === 'hourly'
                      ? 'Hours:'
                      : 'Units:'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={inp.volume}
                    onChange={(e) =>
                      setOtherPayeeInputs((p) => ({
                        ...p,
                        [payee.id]: { ...inp, volume: Number(e.target.value) || 0 },
                      }))
                    }
                    className="w-20 px-2 py-1 bg-white border border-slate-300 rounded font-mono"
                  />
                  <span className="font-mono font-black text-emerald-700 px-2">
                    =${calc.netPayoutAmount.toFixed(2)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onOpenSettlementDraft({
                        payeeType: 'other',
                        payeeId: payee.id,
                        payeeName: payee.name,
                        payeeRoleLabel: payee.category.toUpperCase(),
                        periodStart: today,
                        periodEnd: today,
                        hoursWorked: payee.defaultRateType === 'hourly' ? inp.volume : undefined,
                        grossAmount: calc.grossAmount,
                        tipsOrBonusAmount: 0,
                        deductionsOrPlatformFee: 0,
                        adjustmentsAmount: calc.adjustmentsAmount,
                        netPayoutAmount: calc.netPayoutAmount,
                        status: 'paid',
                        paymentMethod: 'ach',
                      })
                    }
                    className="text-[11px] font-bold text-emerald-700 border-emerald-300 hover:bg-emerald-50 cursor-pointer"
                  >
                    Record Settlement
                  </Button>
                  <button
                    type="button"
                    onClick={() => onEditPayee(payee)}
                    className="text-[11px] font-bold text-slate-600 hover:text-blue-600 px-1.5 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCustomPayee(payee.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    title="Remove payee"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
