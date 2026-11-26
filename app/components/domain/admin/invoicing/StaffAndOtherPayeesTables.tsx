import React, { useState } from 'react';
import { Link } from 'react-router';
import type {
  BillingSettingsConfig,
  NormalizedBillingSettingsConfig,
  PayoutPayeeRecord,
  PayoutSettlementRecord,
  PayoutSettlementStatus,
} from '../../../../core/types/config';
import {
  computeOtherPayeeSettlement,
  type PayoutPeriodPreset,
  type StaffHoursInputValue,
  type StaffPayoutPreviewRow,
} from '../../../../core/services/payouts.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { DownloadIcon, ExternalLinkIcon, PlusIcon, TrashIcon } from '../../../ui/Icons';
import { PayoutSettlementHistoryTable } from './PayoutSettlementHistoryTable';
import { PayoutSettlementModal, type PayoutSettlementDraft } from './PayoutSettlementModal';

export interface StaffAndOtherPayeesTablesProps {
  mode: 'staff' | 'other';
  isSaving: boolean;
  billingDraft: NormalizedBillingSettingsConfig;
  setBillingDraft: React.Dispatch<React.SetStateAction<NormalizedBillingSettingsConfig>>;
  onSaveBillingPolicies: (patch?: Partial<BillingSettingsConfig>) => Promise<void>;
  payoutPeriod: PayoutPeriodPreset;
  setPayoutPeriod: React.Dispatch<React.SetStateAction<PayoutPeriodPreset>>;
  staffPreviews: StaffPayoutPreviewRow[];
  staffHoursMap: Record<string, StaffHoursInputValue>;
  setStaffHoursMap: React.Dispatch<React.SetStateAction<Record<string, StaffHoursInputValue>>>;
  customPayees: PayoutPayeeRecord[];
  otherPayeeInputs: Record<string, { volume: number; adjustments: number }>;
  setOtherPayeeInputs: React.Dispatch<
    React.SetStateAction<Record<string, { volume: number; adjustments: number }>>
  >;
  payoutSettlements: PayoutSettlementRecord[];
  onSaveCustomPayee: (payee: PayoutPayeeRecord) => Promise<void>;
  onDeleteCustomPayee: (payeeId: string) => Promise<void>;
  onRecordSettlement: (settlement: PayoutSettlementRecord) => Promise<void>;
  onUpdateSettlementStatus: (
    settlementId: string,
    nextStatus: PayoutSettlementStatus,
    referenceNumber?: string
  ) => Promise<void>;
  onExportPayoutsCsv: () => void;
}

const PERIOD_OPTIONS: Array<{ key: PayoutPeriodPreset; label: string }> = [
  { key: '7d', label: '7D' },
  { key: '14d', label: '14D' },
  { key: '30d', label: '30D' },
  { key: 'mtd', label: 'MTD' },
  { key: 'all', label: 'All' },
];

export function StaffAndOtherPayeesTables({
  mode,
  isSaving,
  billingDraft,
  setBillingDraft,
  onSaveBillingPolicies,
  payoutPeriod,
  setPayoutPeriod,
  staffPreviews,
  staffHoursMap,
  setStaffHoursMap,
  customPayees,
  otherPayeeInputs,
  setOtherPayeeInputs,
  payoutSettlements,
  onSaveCustomPayee,
  onDeleteCustomPayee,
  onRecordSettlement,
  onUpdateSettlementStatus,
  onExportPayoutsCsv,
}: StaffAndOtherPayeesTablesProps) {
  const [settlementDraft, setSettlementDraft] = useState<PayoutSettlementDraft | null>(null);
  const [editingPayee, setEditingPayee] = useState<Partial<PayoutPayeeRecord> | null>(null);

  const getStaffEntry = (uid: string) => {
    const raw = staffHoursMap[uid];
    if (typeof raw === 'number') return { hours: raw, adjustments: 0 };
    return { hours: raw?.hours || 0, adjustments: raw?.adjustments || 0 };
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface-card p-3.5 sm:p-4 rounded-2xl border border-border-subtle/90 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-xs font-bold text-fg-secondary">
            {mode === 'staff'
              ? `Staff & Dispatcher Payroll (${staffPreviews.length} active staff)`
              : `Affiliates, Contractors & Partner Payees (${customPayees.length} configured)`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-surface-muted p-1 rounded-xl border border-border-subtle text-[11px] font-bold">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPayoutPeriod(opt.key)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    payoutPeriod === opt.key
                      ? 'bg-surface-header text-white'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportPayoutsCsv}
              leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
              className="text-xs font-bold cursor-pointer"
            >
              Export Payouts CSV
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2 border-t border-border-faint text-[11px] text-fg-muted">
          <span>
            Paid settlements post automatically to QuickBooks GL (
            <code>{mode === 'staff' ? '5020-StaffPayroll' : '5030-VendorAffiliatePayout'}</code>).
          </span>
          <Link
            to="/app/admin?tab=integrations&sub=gateways"
            className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-status-staged-fg shrink-0"
          >
            <span>Manage payment &amp; comms credentials in Comms &amp; Integrations &rarr;</span>
            <ExternalLinkIcon className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {mode === 'staff' ? (
        <Card className="border border-border-subtle/90 shadow-xs overflow-hidden">
          <CardHeader className="pb-3 border-b border-border-faint flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-sm font-black text-fg-primary">
                Staff &amp; Dispatcher Payroll Settlements
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Shift hours &times; hourly rate + per-dispatched-booking bonus + adjustments.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-fg-secondary">Hourly ($):</span>
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
                className="w-16 h-8 px-2 bg-surface-card border border-border-strong rounded-lg font-mono"
              />
              <span className="font-bold text-fg-secondary">Bonus/Ride ($):</span>
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
                className="w-16 h-8 px-2 bg-surface-card border border-border-strong rounded-lg font-mono"
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
              <thead className="bg-surface-subtle border-b border-border-subtle text-[10px] font-bold uppercase text-fg-muted">
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
              <tbody className="divide-y divide-border-faint">
                {staffPreviews.map((st) => {
                  const curr = getStaffEntry(st.operatorId);
                  return (
                    <tr key={st.operatorId} className="hover:bg-surface-subtle/70">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-fg-primary">{st.operatorName}</div>
                        <div className="text-[10px] text-fg-muted font-mono">{st.operatorEmail}</div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-fg-secondary">{st.roleLabel}</td>
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
                          className="w-16 px-2 py-1 border border-border-strong rounded font-mono text-center"
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
                          className="w-16 px-2 py-1 border border-border-strong rounded font-mono text-center"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-status-success-fg">
                        ${st.netPayoutAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSettlementDraft({
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
                          className="text-[11px] font-bold text-status-staged-fg border-status-staged-border hover:bg-status-staged-bg cursor-pointer"
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
      ) : (
        <Card className="border border-border-subtle/90 shadow-xs">
          <CardHeader className="pb-3 border-b border-border-faint flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-black text-fg-primary">
                Affiliates, Concierges, Contractors &amp; Vendors
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Flat, percentage, or hourly partner settlements posted to{' '}
                <code>5030-VendorAffiliatePayout</code>.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="primary"
              leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
              onClick={() =>
                setEditingPayee({ defaultRateType: 'flat', defaultRateValue: 25, isActive: true })
              }
              className="text-xs font-bold"
            >
              Add Payee
            </Button>
          </CardHeader>
          <CardContent className="pt-3 space-y-2.5 text-xs">
            {customPayees.length === 0 ? (
              <div className="py-8 text-center text-fg-subtle">
                No custom payees configured yet. Click <strong>Add Payee</strong> to register an
                affiliate, hotel concierge, or fleet vendor.
              </div>
            ) : (
              customPayees.map((payee) => {
                const inp = otherPayeeInputs[payee.id] || { volume: 1, adjustments: 0 };
                const calc = computeOtherPayeeSettlement(payee, inp.volume, inp.adjustments);
                const today = new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={payee.id}
                    className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-fg-primary">{payee.name}</span>
                        <Badge variant="neutral" size="sm" className="text-[10px] uppercase">
                          {payee.category}
                        </Badge>
                        <span className="font-mono text-[11px] text-status-info-fg">
                          {payee.defaultRateType === 'percent'
                            ? `${payee.defaultRateValue}%`
                            : payee.defaultRateType === 'hourly'
                            ? `$${payee.defaultRateValue}/hr`
                            : `$${payee.defaultRateValue} flat`}
                        </span>
                      </div>
                      <div className="text-[11px] text-fg-muted truncate">
                        {[payee.email, payee.phone, payee.notes].filter(Boolean).join(' · ') ||
                          'Active partner payee'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[11px] text-fg-secondary font-semibold">
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
                        className="w-20 px-2 py-1 bg-surface-card border border-border-strong rounded font-mono"
                      />
                      <span className="font-mono font-black text-status-success-fg px-2">
                        =${calc.netPayoutAmount.toFixed(2)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSettlementDraft({
                            payeeType: 'other',
                            payeeId: payee.id,
                            payeeName: payee.name,
                            payeeRoleLabel: payee.category.toUpperCase(),
                            periodStart: today,
                            periodEnd: today,
                            hoursWorked:
                              payee.defaultRateType === 'hourly' ? inp.volume : undefined,
                            grossAmount: calc.grossAmount,
                            tipsOrBonusAmount: 0,
                            deductionsOrPlatformFee: 0,
                            adjustmentsAmount: calc.adjustmentsAmount,
                            netPayoutAmount: calc.netPayoutAmount,
                            status: 'paid',
                            paymentMethod: 'ach',
                          })
                        }
                        className="text-[11px] font-bold text-status-success-fg border-status-success-border hover:bg-status-success-bg cursor-pointer"
                      >
                        Record Settlement
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEditingPayee(payee)}
                        className="text-[11px] font-bold text-fg-secondary hover:text-blue-600 px-1.5 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomPayee(payee.id)}
                        className="p-1 text-fg-subtle hover:text-rose-600 cursor-pointer"
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
      )}

      <PayoutSettlementHistoryTable
        payoutSettlements={payoutSettlements}
        payeeTypeFilter={mode}
        isSaving={isSaving}
        onUpdateSettlementStatus={onUpdateSettlementStatus}
      />

      <PayoutSettlementModal
        settlementDraft={settlementDraft}
        onCloseSettlement={() => setSettlementDraft(null)}
        onConfirmSettlement={onRecordSettlement}
        editingPayee={editingPayee}
        onClosePayee={() => setEditingPayee(null)}
        onSavePayee={onSaveCustomPayee}
        isSaving={isSaving}
      />
    </div>
  );
}
