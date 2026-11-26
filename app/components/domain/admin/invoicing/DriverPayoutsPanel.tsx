import React, { useState } from 'react';
import { Link } from 'react-router';
import {
  ALL_COMMISSIONABLE_FARE_COMPONENTS,
  COMMISSIONABLE_COMPONENT_LABELS,
  type BillingSettingsConfig,
  type CommissionableFareComponent,
  type NormalizedBillingSettingsConfig,
  type PayoutPayeeRecord,
  type PayoutSettlementRecord,
  type PayoutSettlementStatus,
} from '../../../../core/types/config';
import type { DriverPayoutType, FlatPayoutPeriod } from '../../../../core/types/driver';
import type {
  DriverEarningsRollupRow,
  DriverPayoutOverrideInput,
  PayoutPeriodPreset,
} from '../../../../core/services/payouts.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { CheckIcon, DownloadIcon, ExternalLinkIcon } from '../../../ui/Icons';
import { PayoutSettlementModal, type PayoutSettlementDraft } from './PayoutSettlementModal';
import { PayoutSettlementHistoryTable } from './PayoutSettlementHistoryTable';

export interface DriverPayoutsPanelProps {
  isSaving: boolean;
  billingDraft: NormalizedBillingSettingsConfig;
  setBillingDraft: React.Dispatch<React.SetStateAction<NormalizedBillingSettingsConfig>>;
  onSaveBillingPolicies: (patch?: Partial<BillingSettingsConfig>) => Promise<void>;
  payoutPeriod: PayoutPeriodPreset;
  setPayoutPeriod: React.Dispatch<React.SetStateAction<PayoutPeriodPreset>>;
  driverRollups: DriverEarningsRollupRow[];
  driverPayoutOverrides: Record<string, DriverPayoutOverrideInput>;
  onUpdateDriverPayoutOverride: (
    driverId: string,
    patch: Partial<DriverPayoutOverrideInput>
  ) => void;
  onSaveDriverPayoutSettings: (
    driverId: string,
    patch?: Partial<DriverPayoutOverrideInput>
  ) => Promise<void>;
  payoutSettlements: PayoutSettlementRecord[];
  onSaveCustomPayee: (payee: PayoutPayeeRecord) => Promise<void>;
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

const FLAT_PERIOD_OPTIONS: ReadonlyArray<{ key: FlatPayoutPeriod; label: string }> = [
  { key: 'day', label: '/ day' },
  { key: 'week', label: '/ wk' },
  { key: 'month', label: '/ mo' },
];

const PAYMENT_SPLIT_FIELDS: ReadonlyArray<{
  key: 'cash' | 'card' | 'account';
  label: string;
  shortLabel: string;
}> = [
  { key: 'cash', label: 'Cash %', shortLabel: 'Cash' },
  { key: 'card', label: 'Card %', shortLabel: 'Card' },
  { key: 'account', label: 'Account %', shortLabel: 'Acct' },
];

export function DriverPayoutsPanel({
  isSaving,
  billingDraft,
  setBillingDraft,
  onSaveBillingPolicies,
  payoutPeriod,
  setPayoutPeriod,
  driverRollups,
  driverPayoutOverrides,
  onUpdateDriverPayoutOverride,
  onSaveDriverPayoutSettings,
  payoutSettlements,
  onSaveCustomPayee,
  onRecordSettlement,
  onUpdateSettlementStatus,
  onExportPayoutsCsv,
}: DriverPayoutsPanelProps) {
  const [settlementDraft, setSettlementDraft] = useState<PayoutSettlementDraft | null>(null);

  const toggleCommissionableComponent = (comp: CommissionableFareComponent) => {
    setBillingDraft((prev) => {
      const exists = prev.commissionableComponents.includes(comp);
      const next = exists
        ? prev.commissionableComponents.filter((c) => c !== comp)
        : [...prev.commissionableComponents, comp];
      return {
        ...prev,
        commissionableComponents: next,
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* ─── Subpage Header + Period Selector + CSV Export ─── */}
      <div className="bg-surface-card p-3.5 sm:p-4 rounded-2xl border border-border-subtle/90 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-xs font-bold text-fg-secondary">
            Driver Payouts &amp; Lease Settlements ({driverRollups.length} active drivers)
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
            Paid driver settlements post automatically to QuickBooks GL (
            <code>5010-DriverPayout</code>).
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

      {/* ─── Commission & Base Policy Card ─── */}
      <Card className="border border-border-subtle/90 shadow-xs">
        <CardHeader className="pb-3 border-b border-border-faint flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <CardTitle className="text-sm font-black text-fg-primary">
              Commission Rules, Ownership Tiers &amp; Commissionable Base
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted">
              Precedence: Driver Override &rarr; Payment-Type % &rarr; Car Ownership % &rarr;
              Universal %.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={isSaving}
            onClick={() => onSaveBillingPolicies()}
            leftIcon={<CheckIcon className="w-3.5 h-3.5" />}
            className="text-xs font-bold shrink-0"
          >
            Save Commission Rules
          </Button>
        </CardHeader>

        <CardContent className="pt-3.5 space-y-4 text-xs">
          {/* Row 1: Universal %, Owner-Operator %, Company-Owned % */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface-subtle p-2.5 rounded-xl border border-border-subtle/80 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-fg-primary">Universal %</div>
                <div className="text-[10px] text-fg-muted">Fallback driver share</div>
              </div>
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
                className="w-16 h-8 px-2 bg-surface-card border border-border-strong rounded-lg text-xs font-mono font-bold text-center"
              />
            </div>

            <div className="bg-surface-subtle p-2.5 rounded-xl border border-border-subtle/80 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-fg-primary">Owner-Operator %</div>
                <div className="text-[10px] text-fg-muted">Blank = Universal %</div>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                placeholder={`${billingDraft.driverDefaultCommissionPercent}`}
                value={billingDraft.ownerOperatorCommissionPercent ?? ''}
                onChange={(e) =>
                  setBillingDraft((p) => ({
                    ...p,
                    ownerOperatorCommissionPercent:
                      e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="w-16 h-8 px-2 bg-surface-card border border-border-strong rounded-lg text-xs font-mono font-bold text-center"
              />
            </div>

            <div className="bg-surface-subtle p-2.5 rounded-xl border border-border-subtle/80 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-fg-primary">Company-Owned %</div>
                <div className="text-[10px] text-fg-muted">Fleet vehicle share</div>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                placeholder={`${billingDraft.driverDefaultCommissionPercent}`}
                value={billingDraft.companyOwnedCommissionPercent ?? ''}
                onChange={(e) =>
                  setBillingDraft((p) => ({
                    ...p,
                    companyOwnedCommissionPercent:
                      e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                className="w-16 h-8 px-2 bg-surface-card border border-border-strong rounded-lg text-xs font-mono font-bold text-center"
              />
            </div>
          </div>

          {/* Row 2: Commissionable Base Multi-Select Pills */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-fg-secondary">
                Commissionable Base Components (Percent Mode)
              </span>
              <span className="text-[11px] text-fg-muted">
                Excluded Tips &amp; Tolls pass through 100% to driver; other excluded items stay
                with company.
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COMMISSIONABLE_FARE_COMPONENTS.map((comp) => {
                const active = billingDraft.commissionableComponents.includes(comp);
                return (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => toggleCommissionableComponent(comp)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-status-info-bg text-status-info-fg border-status-info-border'
                        : 'bg-surface-muted text-fg-muted border-border-subtle hover:text-fg-primary'
                    }`}
                  >
                    {active ? '✓ ' : ''}
                    {COMMISSIONABLE_COMPONENT_LABELS[comp]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Payment-Type Split */}
          <div className="pt-2.5 border-t border-border-faint flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={billingDraft.usePaymentTypeCommissionSplit}
                onChange={(e) =>
                  setBillingDraft((p) => ({
                    ...p,
                    usePaymentTypeCommissionSplit: e.target.checked,
                  }))
                }
                className="rounded border-border-strong accent-blue-600 cursor-pointer"
              />
              <span className="font-bold text-fg-primary">
                Enable Payment-Type Commission Split (Cash / Card / Corporate Account)
              </span>
            </label>

            {billingDraft.usePaymentTypeCommissionSplit && (
              <div className="flex flex-wrap items-center gap-2.5">
                {PAYMENT_SPLIT_FIELDS.map((field) => (
                  <div key={field.key} className="inline-flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-fg-secondary">{field.label}:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder={`${billingDraft.driverDefaultCommissionPercent}`}
                      value={billingDraft.paymentTypeCommissionPercents[field.key] ?? ''}
                      onChange={(e) =>
                        setBillingDraft((p) => ({
                          ...p,
                          paymentTypeCommissionPercents: {
                            ...p.paymentTypeCommissionPercents,
                            [field.key]:
                              e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                      className="w-14 h-7 px-1.5 bg-surface-card border border-border-strong rounded font-mono text-xs text-center font-bold"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Driver Earnings Rollup Table ─── */}
      <Card className="border border-border-subtle/90 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-border-faint">
          <CardTitle className="text-sm font-black text-fg-primary">
            Driver Earnings &amp; Lease Rollup
          </CardTitle>
          <CardDescription className="text-xs text-fg-muted">
            Configure individual driver Percent commission or Flat (day / week / month) lease fees.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[920px]">
            <thead className="bg-surface-subtle border-b border-border-subtle text-[10px] font-bold uppercase text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Driver &amp; Ownership</th>
                <th className="px-2.5 py-2.5 text-right">Trips</th>
                <th className="px-2.5 py-2.5 text-right">Gross Fares</th>
                <th className="px-2.5 py-2.5 text-center">Mode</th>
                <th className="px-3 py-2.5 text-center">Share % / Flat Lease</th>
                <th className="px-2.5 py-2.5 text-right">Tips / Tolls</th>
                <th className="px-2.5 py-2.5 text-right">Platform / Lease</th>
                <th className="px-2.5 py-2.5 text-right">Settled</th>
                <th className="px-2.5 py-2.5 text-right">Net Balance</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-faint">
              {driverRollups.map((row) => {
                const rowOverride = driverPayoutOverrides[row.driverId];
                const hasPendingRuleEdit = Boolean(rowOverride);
                return (
                  <tr key={row.driverId} className="hover:bg-surface-subtle/70">
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-fg-primary flex items-center gap-1.5 flex-wrap">
                        <span>{row.driverName}</span>
                        {row.cabNumber && (
                          <span className="font-mono text-[11px] text-blue-600">
                            #{row.cabNumber}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5">
                        <Badge
                          variant={row.carOwnership === 'company_owned' ? 'warning' : 'neutral'}
                          size="sm"
                          className="text-[9px] uppercase"
                        >
                          {row.carOwnership === 'company_owned'
                            ? 'Company-Owned'
                            : 'Owner-Operator'}
                        </Badge>
                      </div>
                    </td>

                    <td className="px-2.5 py-2.5 text-right font-mono">{row.tripCount}</td>

                    <td className="px-2.5 py-2.5 text-right font-mono">
                      ${row.grossFares.toFixed(2)}
                    </td>

                    <td className="px-2.5 py-2.5 text-center">
                      <div className="inline-flex bg-surface-muted p-0.5 rounded-lg border border-border-subtle text-[10px] font-bold">
                        {(['percent', 'flat'] as const).map((modeKey: DriverPayoutType) => (
                          <button
                            key={modeKey}
                            type="button"
                            onClick={() =>
                              onUpdateDriverPayoutOverride(row.driverId, { payoutType: modeKey })
                            }
                            className={`px-2 py-0.5 rounded-md capitalize cursor-pointer ${
                              row.payoutType === modeKey
                                ? 'bg-surface-card text-fg-primary shadow-2xs font-extrabold'
                                : 'text-fg-muted hover:text-fg-primary'
                            }`}
                          >
                            {modeKey}
                          </button>
                        ))}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      {row.payoutType === 'flat' ? (
                        <div className="inline-flex items-center gap-1">
                          <span className="text-[11px] font-mono text-fg-muted">$</span>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            value={rowOverride?.flatPayoutAmount ?? row.flatPayoutAmount}
                            onChange={(e) =>
                              onUpdateDriverPayoutOverride(row.driverId, {
                                flatPayoutAmount: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-16 px-1.5 py-1 bg-surface-card border border-border-subtle rounded text-center font-mono text-xs"
                          />
                          <select
                            value={rowOverride?.flatPayoutPeriod ?? row.flatPayoutPeriod}
                            onChange={(e) =>
                              onUpdateDriverPayoutOverride(row.driverId, {
                                flatPayoutPeriod: e.target.value as FlatPayoutPeriod,
                              })
                            }
                            className="px-1.5 py-1 bg-surface-card border border-border-subtle rounded text-[11px] font-semibold cursor-pointer"
                          >
                            {FLAT_PERIOD_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : billingDraft.usePaymentTypeCommissionSplit ? (
                        <div className="inline-flex items-center gap-1">
                          {PAYMENT_SPLIT_FIELDS.map((pf) => (
                            <div key={pf.key} className="flex flex-col items-center">
                              <span className="text-[9px] text-fg-muted font-bold uppercase">
                                {pf.shortLabel}
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                placeholder={`${row.effectivePaymentTypePercents[pf.key]}`}
                                value={
                                  rowOverride?.paymentTypeCommissionRates?.[pf.key] ?? ''
                                }
                                onChange={(e) =>
                                  onUpdateDriverPayoutOverride(row.driverId, {
                                    paymentTypeCommissionRates: {
                                      [pf.key]:
                                        e.target.value === '' ? null : Number(e.target.value),
                                    },
                                  })
                                }
                                className="w-12 px-1 py-0.5 bg-surface-card border border-border-subtle rounded text-center font-mono text-[11px]"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={rowOverride?.commissionPercent ?? row.commissionPercent}
                            onChange={(e) =>
                              onUpdateDriverPayoutOverride(row.driverId, {
                                commissionPercent:
                                  e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            className="w-14 px-1.5 py-1 bg-surface-card border border-border-subtle rounded text-center font-mono text-xs"
                          />
                          <span className="text-[11px] font-mono text-fg-muted">%</span>
                        </div>
                      )}
                    </td>

                    <td className="px-2.5 py-2.5 text-right font-mono text-status-success-fg">
                      <div>${row.tips.toFixed(2)} tips</div>
                      <div className="text-[10px] text-fg-muted">
                        +${row.tollsReimbursed.toFixed(2)} tolls
                      </div>
                    </td>

                    <td className="px-2.5 py-2.5 text-right font-mono text-fg-muted">
                      <div>${row.platformFee.toFixed(2)}</div>
                      {row.payoutType === 'flat' && (
                        <div className="text-[10px] text-fg-subtle">{row.calendarDays}d span</div>
                      )}
                    </td>

                    <td className="px-2.5 py-2.5 text-right font-mono text-fg-muted">
                      ${row.alreadySettledAmount.toFixed(2)}
                    </td>

                    <td className="px-2.5 py-2.5 text-right font-mono">
                      {row.owesCompanyAmount > 0 ? (
                        <div>
                          <span className="font-black text-rose-600">
                            -${row.owesCompanyAmount.toFixed(2)}
                          </span>
                          <div className="text-[9px] font-bold uppercase text-rose-600">
                            Driver Owes
                          </div>
                        </div>
                      ) : (
                        <span className="font-black text-status-success-fg">
                          ${row.netPayout.toFixed(2)}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {hasPendingRuleEdit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={isSaving}
                            onClick={() => onSaveDriverPayoutSettings(row.driverId)}
                            className="text-[10px] py-1 px-2 h-auto font-bold cursor-pointer"
                          >
                            Save Rule
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={row.owesCompanyAmount > 0}
                          onClick={() =>
                            setSettlementDraft({
                              payeeType: 'driver',
                              payeeId: row.driverId,
                              payeeName: row.driverName,
                              payeeRoleLabel: row.cabNumber
                                ? `Driver #${row.cabNumber}`
                                : 'Driver',
                              periodStart: row.periodStart,
                              periodEnd: row.periodEnd,
                              tripCount: row.tripCount,
                              grossAmount: row.driverFareShare,
                              tipsOrBonusAmount: row.tips,
                              deductionsOrPlatformFee:
                                row.payoutType === 'flat'
                                  ? row.platformFee
                                  : row.alreadySettledAmount,
                              adjustmentsAmount: row.tollsReimbursed,
                              netPayoutAmount: row.netPayout,
                              status: 'paid',
                              paymentMethod: 'ach',
                            })
                          }
                          className="text-[11px] font-bold text-status-info-fg border-status-info-border hover:bg-status-info-bg cursor-pointer"
                        >
                          {row.owesCompanyAmount > 0 ? 'Lease Due' : 'Record Payout'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ─── Driver Settlement History Table ─── */}
      <PayoutSettlementHistoryTable
        payoutSettlements={payoutSettlements}
        payeeTypeFilter="driver"
        isSaving={isSaving}
        onUpdateSettlementStatus={onUpdateSettlementStatus}
      />

      <PayoutSettlementModal
        settlementDraft={settlementDraft}
        onCloseSettlement={() => setSettlementDraft(null)}
        onConfirmSettlement={onRecordSettlement}
        editingPayee={null}
        onClosePayee={() => {}}
        onSavePayee={onSaveCustomPayee}
        isSaving={isSaving}
      />
    </div>
  );
}
