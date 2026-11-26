import React, { useState } from 'react';
import { Link } from 'react-router';
import type {
  BillingSettingsConfig,
  NormalizedBillingSettingsConfig,
  PayoutPayeeRecord,
  PayoutPayeeType,
  PayoutSettlementRecord,
  PayoutSettlementStatus,
} from '../../../../core/types/config';
import type {
  DriverEarningsRollupRow,
  PayoutPeriodPreset,
  StaffHoursInputValue,
  StaffPayoutPreviewRow,
} from '../../../../core/services/payouts.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { CheckIcon, DownloadIcon, ExternalLinkIcon } from '../../../ui/Icons';
import { PayoutSettlementModal, type PayoutSettlementDraft } from './PayoutSettlementModal';
import { StaffAndOtherPayeesTables } from './StaffAndOtherPayeesTables';
import { PayoutSettlementHistoryTable } from './PayoutSettlementHistoryTable';

export interface DriverPayoutsPanelProps {
  isSaving: boolean;
  billingDraft: NormalizedBillingSettingsConfig;
  setBillingDraft: React.Dispatch<React.SetStateAction<NormalizedBillingSettingsConfig>>;
  onSaveBillingPolicies: (patch?: Partial<BillingSettingsConfig>) => Promise<void>;
  activePayeeTab: PayoutPayeeType;
  setActivePayeeTab: React.Dispatch<React.SetStateAction<PayoutPayeeType>>;
  payoutPeriod: PayoutPeriodPreset;
  setPayoutPeriod: React.Dispatch<React.SetStateAction<PayoutPeriodPreset>>;
  driverRollups: DriverEarningsRollupRow[];
  driverCommissionOverrides: Record<string, number>;
  setDriverCommissionOverrides: React.Dispatch<React.SetStateAction<Record<string, number>>>;
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

export function DriverPayoutsPanel({
  isSaving,
  billingDraft,
  setBillingDraft,
  onSaveBillingPolicies,
  activePayeeTab,
  setActivePayeeTab,
  payoutPeriod,
  setPayoutPeriod,
  driverRollups,
  driverCommissionOverrides,
  setDriverCommissionOverrides,
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
}: DriverPayoutsPanelProps) {
  const [settlementDraft, setSettlementDraft] = useState<PayoutSettlementDraft | null>(null);
  const [editingPayee, setEditingPayee] = useState<Partial<PayoutPayeeRecord> | null>(null);

  return (
    <div className="space-y-4">
      {/* ─── 3-Pill Payee Switcher + Period Selector + Comms & Integrations Link ─── */}
      <div className="bg-surface-card p-3.5 sm:p-4 rounded-2xl border border-border-subtle/90 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="grid grid-cols-3 sm:inline-flex bg-surface-muted p-1 rounded-xl border border-border-subtle text-xs font-bold">
            {(
              [
                ['driver', `Drivers (${driverRollups.length})`],
                ['staff', `Staff & Dispatchers (${staffPreviews.length})`],
                ['other', `Other Payees (${customPayees.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivePayeeTab(key)}
                className={`px-3 py-1.5 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                  activePayeeTab === key
                    ? 'bg-surface-card text-status-info-fg shadow-xs font-extrabold'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
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
            Paid settlements post automatically to QuickBooks GL (<code>5010</code> / <code>5020</code> / <code>5030</code>).
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

      {/* ─── Tab 1: Drivers Rollup Table ─── */}
      {activePayeeTab === 'driver' && (
        <Card className="border border-border-subtle/90 shadow-xs overflow-hidden">
          <CardHeader className="pb-3 border-b border-border-faint flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-sm font-black text-fg-primary">
                Driver Earnings Rollup &amp; Commission Split
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Drivers retain {billingDraft.driverDefaultCommissionPercent}% of base/wait/extras plus 100% of tips &amp; tolls.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-fg-secondary">Default Driver %:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={billingDraft.driverDefaultCommissionPercent}
                onChange={(e) =>
                  setBillingDraft((p) => ({
                    ...p,
                    driverDefaultCommissionPercent: Number(e.target.value) || 0,
                  }))
                }
                className="w-16 h-8 px-2 bg-surface-card border border-border-strong rounded-lg text-xs font-mono font-bold"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={isSaving}
                onClick={() => onSaveBillingPolicies()}
                leftIcon={<CheckIcon className="w-3.5 h-3.5" />}
                className="text-xs font-bold"
              >
                Save Default
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="bg-surface-subtle border-b border-border-subtle text-[10px] font-bold uppercase text-fg-muted">
                <tr>
                  <th className="px-4 py-2.5">Driver</th>
                  <th className="px-3 py-2.5 text-right">Trips</th>
                  <th className="px-3 py-2.5 text-right">Gross Fares</th>
                  <th className="px-3 py-2.5 text-center">Share %</th>
                  <th className="px-3 py-2.5 text-right">Tips + Tolls (100%)</th>
                  <th className="px-3 py-2.5 text-right">Platform Fee</th>
                  <th className="px-3 py-2.5 text-right">Settled</th>
                  <th className="px-3 py-2.5 text-right">Net Due</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-faint">
                {driverRollups.map((row) => (
                  <tr key={row.driverId} className="hover:bg-surface-subtle/70">
                    <td className="px-4 py-2.5 font-bold text-fg-primary">
                      {row.driverName}{' '}
                      {row.cabNumber && (
                        <span className="font-mono text-[11px] text-blue-600">#{row.cabNumber}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{row.tripCount}</td>
                    <td className="px-3 py-2.5 text-right font-mono">${row.grossFares.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={driverCommissionOverrides[row.driverId] ?? row.commissionPercent}
                        onChange={(e) =>
                          setDriverCommissionOverrides((prev) => ({
                            ...prev,
                            [row.driverId]: Number(e.target.value) || 0,
                          }))
                        }
                        className="w-14 px-1.5 py-1 border border-border-subtle rounded text-center font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-status-success-fg">
                      ${(row.tips + row.tollsReimbursed).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-fg-muted">
                      ${row.platformFee.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-fg-muted">
                      ${row.alreadySettledAmount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-black text-status-success-fg">
                      ${row.netPayout.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSettlementDraft({
                            payeeType: 'driver',
                            payeeId: row.driverId,
                            payeeName: row.driverName,
                            payeeRoleLabel: row.cabNumber ? `Driver #${row.cabNumber}` : 'Driver',
                            periodStart: row.periodStart,
                            periodEnd: row.periodEnd,
                            tripCount: row.tripCount,
                            grossAmount: row.driverFareShare,
                            tipsOrBonusAmount: Number((row.tips + row.tollsReimbursed).toFixed(2)),
                            deductionsOrPlatformFee: row.alreadySettledAmount,
                            adjustmentsAmount: 0,
                            netPayoutAmount: row.netPayout,
                            status: 'paid',
                            paymentMethod: 'ach',
                          })
                        }
                        className="text-[11px] font-bold text-status-info-fg border-status-info-border hover:bg-status-info-bg cursor-pointer"
                      >
                        Record Payout
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ─── Tabs 2 & 3: Staff & Other Payees ─── */}
      <StaffAndOtherPayeesTables
        activePayeeTab={activePayeeTab}
        isSaving={isSaving}
        billingDraft={billingDraft}
        setBillingDraft={setBillingDraft}
        onSaveBillingPolicies={onSaveBillingPolicies}
        staffPreviews={staffPreviews}
        staffHoursMap={staffHoursMap}
        setStaffHoursMap={setStaffHoursMap}
        customPayees={customPayees}
        otherPayeeInputs={otherPayeeInputs}
        setOtherPayeeInputs={setOtherPayeeInputs}
        onOpenSettlementDraft={setSettlementDraft}
        onEditPayee={setEditingPayee}
        onDeleteCustomPayee={onDeleteCustomPayee}
      />

      {/* ─── Unified Settlement History Table ─── */}
      <PayoutSettlementHistoryTable
        payoutSettlements={payoutSettlements}
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
