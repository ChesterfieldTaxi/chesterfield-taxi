import React from 'react';
import type { RevenueAttributionMetrics } from '../../../../core/services/analytics';
import { Badge } from '../../../ui/Badge';
import { Card, CardDescription, CardTitle } from '../../../ui/Card';
import {
  BuildingIcon,
  CashIcon,
  CreditCardIcon,
  DollarSignIcon,
  LinkIcon,
  MapPinIcon,
  TagIcon,
} from '../../../ui/Icons';

export interface SurchargeRevenueAttributionPanelProps {
  revenue: RevenueAttributionMetrics;
  onNavigateTab: (tabKey: 'trips' | 'rates' | 'invoicing' | 'operators') => void;
}

function formatAuditShortTimestamp(iso?: string): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const dt = new Date(ms);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAuditActionReadable(action?: string): string {
  if (!action) return '';
  return action.replace(/_/g, ' ');
}

export function SurchargeRevenueAttributionPanel({
  revenue,
  onNavigateTab,
}: SurchargeRevenueAttributionPanelProps) {
  const grossPositiveComponents = Math.max(
    revenue.baseAndDistanceRevenue + revenue.surchargesRevenue + revenue.extrasAndWaitRevenue,
    1
  );
  const baseShare = Math.round((revenue.baseAndDistanceRevenue / grossPositiveComponents) * 100);
  const surShare = Math.round((revenue.surchargesRevenue / grossPositiveComponents) * 100);
  const extShare = Math.max(0, 100 - baseShare - surShare);

  const mix = revenue.paymentMethodMix;

  return (
    <div className="space-y-5">
      {/* ─── Canonical Revenue Waterfall + Payment Method Mix Strip ─── */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-fg-primary flex items-center gap-1.5">
              <DollarSignIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Canonical Fare Revenue Waterfall &amp; Settlement Mix</span>
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted mt-0.5">
              Excludes cancelled &amp; declined bookings · Reconciles Base/Distance, Surcharges, Extras/Wait, Tips &amp; Discounts
            </CardDescription>
          </div>
          <div className="text-xs font-bold text-fg-secondary bg-surface-muted px-3 py-1 rounded-xl tabular-nums self-start sm:self-auto">
            Gross Booked: <strong className="text-fg-primary">${revenue.grossBookedRevenue.toFixed(2)}</strong> ({revenue.billableTripsCount} rides)
          </div>
        </div>

        {/* Proportional Waterfall Stacked Bar */}
        {revenue.grossBookedRevenue > 0 && (
          <div className="h-3 w-full rounded-full bg-surface-muted overflow-hidden flex">
            <div
              className="bg-blue-600 h-full transition-all"
              style={{ width: `${baseShare}%` }}
              title={`Base & Distance: $${revenue.baseAndDistanceRevenue.toFixed(2)}`}
            />
            <div
              className="bg-amber-500 h-full transition-all"
              style={{ width: `${surShare}%` }}
              title={`Surcharges & Rules: $${revenue.surchargesRevenue.toFixed(2)}`}
            />
            <div
              className="bg-purple-500 h-full transition-all"
              style={{ width: `${extShare}%` }}
              title={`Extras & Stop-Wait: $${revenue.extrasAndWaitRevenue.toFixed(2)}`}
            />
          </div>
        )}

        {/* 5 Waterfall Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Base &amp; Distance</span>
            </div>
            <div className="mt-1 text-base font-black text-fg-primary tabular-nums">
              ${revenue.baseAndDistanceRevenue.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Surcharges</span>
            </div>
            <div className="mt-1 text-base font-black text-fg-primary tabular-nums">
              ${revenue.surchargesRevenue.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Extras &amp; Stop-Wait</span>
            </div>
            <div className="mt-1 text-base font-black text-fg-primary tabular-nums">
              ${revenue.extrasAndWaitRevenue.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-status-success-bg/60 border border-status-success-border/80">
            <div className="text-[10px] font-bold uppercase text-status-success-fg">Driver Tips</div>
            <div className="mt-1 text-base font-black text-status-success-fg tabular-nums">
              +${revenue.tipsTotal.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-status-danger-bg/50 border border-status-danger-border/70 col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold uppercase text-rose-600">Discounts</div>
            <div className="mt-1 text-base font-black text-status-danger-fg tabular-nums">
              -${revenue.discountsTotal.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Payment Method Mix Pills */}
        <div className="pt-2 border-t border-border-faint grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle/70 text-xs">
            <span className="font-semibold text-fg-secondary flex items-center gap-1.5">
              <CreditCardIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Card ({mix.card.count})</span>
            </span>
            <span className="font-black text-fg-primary tabular-nums">
              ${mix.card.revenue.toFixed(0)} ({mix.card.sharePercent}%)
            </span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle/70 text-xs">
            <span className="font-semibold text-fg-secondary flex items-center gap-1.5">
              <CashIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Cash ({mix.cash.count})</span>
            </span>
            <span className="font-black text-fg-primary tabular-nums">
              ${mix.cash.revenue.toFixed(0)} ({mix.cash.sharePercent}%)
            </span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle/70 text-xs">
            <span className="font-semibold text-fg-secondary flex items-center gap-1.5">
              <BuildingIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Corporate ({mix.corporate.count})</span>
            </span>
            <span className="font-black text-fg-primary tabular-nums">
              ${mix.corporate.revenue.toFixed(0)} ({mix.corporate.sharePercent}%)
            </span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-status-info-bg/60 border border-status-info-border/80 text-xs">
            <span className="font-semibold text-status-info-fg flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>1-Tap Pay Links ({mix.settledPayLinks.count})</span>
            </span>
            <span className="font-black text-status-info-fg tabular-nums">
              ${mix.settledPayLinks.revenue.toFixed(0)} paid
            </span>
          </div>
        </div>
      </Card>

      {/* ─── Surcharge & Pricing Rule Attribution Table + Corridors Card ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Surcharge & Rule Attribution Table */}
        <Card
          variant="elevated"
          className="lg:col-span-2 border-border-subtle bg-surface-card shadow-xs overflow-hidden flex flex-col"
        >
          <div className="p-4 sm:p-5 border-b border-border-faint flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-fg-primary flex items-center gap-1.5">
                <TagIcon className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Surcharge &amp; Pricing Rule Attribution</span>
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted mt-0.5">
                Itemized surcharge yield correlated with live /config/pricingAuditLog provenance
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('rates')}
              className="text-xs font-bold text-blue-600 hover:text-status-info-fg self-start sm:self-auto shrink-0 cursor-pointer"
            >
              Manage Rates &amp; Rules →
            </button>
          </div>

          {revenue.surchargeAttributionRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-fg-subtle">
              No surcharges or pricing rules attributed in this window.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs divide-y divide-border-faint min-w-[560px]">
                <thead className="bg-surface-subtle text-fg-muted font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Surcharge / Rule</th>
                    <th className="px-3 py-2.5 text-right">Trips</th>
                    <th className="px-3 py-2.5 text-right">Attributed $</th>
                    <th className="px-3 py-2.5 text-right">Share</th>
                    <th className="px-4 py-2.5">Live State &amp; Audit Provenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {revenue.surchargeAttributionRows.map((row) => (
                    <tr key={row.key} className="hover:bg-surface-subtle/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-fg-primary flex items-center gap-1.5 flex-wrap">
                          <span>{row.name}</span>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-muted text-fg-muted">
                            {row.itemType === 'rule' ? 'Rule' : 'Surcharge'}
                          </span>
                        </div>
                        {row.avgAmountPerTrip > 0 && (
                          <div className="text-[10px] text-fg-subtle mt-0.5 tabular-nums">
                            Avg ${row.avgAmountPerTrip.toFixed(2)} / trip
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-fg-secondary tabular-nums">
                        {row.tripCount}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-fg-primary tabular-nums">
                        ${row.attributedRevenue.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-blue-600 tabular-nums">
                        {row.sharePercent}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant={
                              row.currentState === 'enabled'
                                ? 'success'
                                : row.currentState === 'disabled'
                                ? 'neutral'
                                : 'info'
                            }
                            size="sm"
                          >
                            {row.currentState === 'enabled'
                              ? 'Enabled'
                              : row.currentState === 'disabled'
                              ? 'Disabled'
                              : 'Custom'}
                          </Badge>
                          {row.lastAuditAction && (
                            <span
                              className="text-[10px] text-fg-muted truncate max-w-[210px]"
                              title={
                                row.lastAuditNote
                                  ? `${formatAuditActionReadable(row.lastAuditAction)} — Note: ${row.lastAuditNote}`
                                  : formatAuditActionReadable(row.lastAuditAction)
                              }
                            >
                              {formatAuditShortTimestamp(row.lastAuditTimestamp)}
                              {row.lastActor ? ` · ${row.lastActor}` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top Corridors & Tariffs Card */}
        <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-4 sm:p-5 space-y-3.5">
          <div>
            <CardTitle className="text-sm font-bold text-fg-primary flex items-center gap-1.5">
              <MapPinIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Top Corridors &amp; Tariffs</span>
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted mt-0.5">
              Regional airport corridors, flat tariffs &amp; local West County demand
            </CardDescription>
          </div>

          {revenue.corridorAttributionRows.length === 0 ? (
            <div className="py-6 text-center text-xs text-fg-subtle">
              No active or completed corridor trips in this period.
            </div>
          ) : (
            <div className="space-y-2.5">
              {revenue.corridorAttributionRows.slice(0, 6).map((c) => (
                <div
                  key={c.key}
                  className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-fg-primary truncate">{c.name}</div>
                      <div className="text-[11px] text-fg-muted tabular-nums">
                        {c.tripCount} trip{c.tripCount === 1 ? '' : 's'} · Avg $
                        {c.avgFare.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-fg-primary tabular-nums">
                        ${c.grossRevenue.toFixed(0)}
                      </div>
                      <div className="text-[10px] font-bold text-blue-600 tabular-nums">
                        {c.sharePercent}%
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-emphasis/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.min(100, c.sharePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
