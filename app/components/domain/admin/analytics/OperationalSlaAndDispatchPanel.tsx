import React from 'react';
import type {
  AutoDispatchIntelligenceMetrics,
  DispatchChannelKey,
  SlaPerformanceMetrics,
} from '../../../../core/services/analytics';
import { Badge } from '../../../ui/Badge';
import { Card, CardDescription, CardTitle } from '../../../ui/Card';
import {
  AlertTriangleIcon,
  ClockIcon,
  RepeatIcon,
  ShieldCheckIcon,
  ZapIcon,
} from '../../../ui/Icons';

export interface OperationalSlaAndDispatchPanelProps {
  sla: SlaPerformanceMetrics;
  autoDispatch: AutoDispatchIntelligenceMetrics;
  onNavigateTab: (tabKey: 'trips' | 'rates' | 'invoicing' | 'operators') => void;
}

const CHANNEL_BAR_STYLES: Record<DispatchChannelKey, string> = {
  sequential_cascade: 'bg-blue-600',
  broadcast_pool: 'bg-cyan-600',
  direct_auto_assign: 'bg-emerald-600',
  staged_release: 'bg-indigo-600',
  manual_assign: 'bg-surface-strong',
};

export function OperationalSlaAndDispatchPanel({
  sla,
  autoDispatch,
  onNavigateTab,
}: OperationalSlaAndDispatchPanelProps) {
  const varianceDisplay =
    sla.evaluatedScheduledCount === 0
      ? '—'
      : sla.avgPickupVarianceMinutes <= 0
      ? `${Math.abs(sla.avgPickupVarianceMinutes)}m early`
      : `+${sla.avgPickupVarianceMinutes}m late`;

  const ackStats = autoDispatch.driverUpdateAckStats;
  const guestStats = autoDispatch.guestSelfServiceStats;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* ─── Card 1: SLA & Cancellation Reliability ─── */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-fg-primary flex items-center gap-1.5">
              <ShieldCheckIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Operational SLA &amp; Cancellation Policy</span>
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted mt-0.5">
              Scheduled pickup punctuality ({sla.onTimeGraceMinutes}m grace), escalation alerts &amp; /track policy fees
            </CardDescription>
          </div>
          <Badge
            variant={
              sla.onTimeRatePercent === null
                ? 'neutral'
                : sla.onTimeRatePercent >= 90
                ? 'success'
                : sla.onTimeRatePercent >= 75
                ? 'warning'
                : 'danger'
            }
            size="sm"
          >
            {sla.onTimeRatePercent !== null ? `${sla.onTimeRatePercent}% On-Time` : 'No Due Rides'}
          </Badge>
        </div>

        {/* Punctuality & Escalation KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              On-Time / Late
            </div>
            <div className="mt-1 text-base font-black text-fg-primary tabular-nums">
              <span className="text-emerald-600">{sla.onTimeCount}</span>
              <span className="text-slate-300 mx-1">/</span>
              <span className={sla.lateCount > 0 ? 'text-rose-600' : 'text-fg-secondary'}>
                {sla.lateCount}
              </span>
            </div>
            <div className="text-[10px] text-fg-muted mt-0.5">
              {sla.evaluatedScheduledCount} evaluated
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Avg Variance
            </div>
            <div
              className={`mt-1 text-base font-black tabular-nums ${
                sla.avgPickupVarianceMinutes > sla.onTimeGraceMinutes
                  ? 'text-rose-600'
                  : sla.avgPickupVarianceMinutes <= 0
                  ? 'text-status-success-fg'
                  : 'text-fg-primary'
              }`}
            >
              {varianceDisplay}
            </div>
            <div className="text-[10px] text-fg-muted mt-0.5">vs scheduled pickup</div>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              SLA Risk Tiers
            </div>
            <div className="mt-1 text-xs font-extrabold text-fg-strong tabular-nums flex items-center gap-1.5 flex-wrap">
              <span className="text-amber-600" title="Warning">
                W:{sla.slaWarningCount}
              </span>
              <span>·</span>
              <span className="text-rose-600" title="Critical">
                C:{sla.slaCriticalCount}
              </span>
              <span>·</span>
              <span className="text-status-danger-fg" title="Overdue">
                O:{sla.slaOverdueCount}
              </span>
            </div>
            <div className="text-[10px] text-fg-muted mt-0.5">
              {sla.warningAlertsSentCount + sla.criticalAlertsSentCount} alerts sent
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Open At-Risk
            </div>
            <div
              className={`mt-1 text-base font-black tabular-nums ${
                sla.openUnassignedScheduledAtRiskCount > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {sla.openUnassignedScheduledAtRiskCount}
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('trips')}
              className="text-[10px] font-bold text-blue-600 hover:underline mt-0.5 cursor-pointer"
            >
              Inspect Queue →
            </button>
          </div>
        </div>

        {/* Cancellation Policy Breakdown */}
        <div className="p-3.5 rounded-2xl bg-surface-subtle/80 border border-border-subtle/80 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-fg-strong flex items-center gap-1.5">
              <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
              <span>
                Cancellation Breakdown ({sla.totalCancelledOrDeclined} total ·{' '}
                {sla.cancellationRatePercent}%)
              </span>
            </span>
            <span className="text-[11px] font-bold text-fg-secondary tabular-nums">
              /track Late &amp; No-Show Previews:{' '}
              <strong className="text-fg-primary">
                ${sla.previewedCancellationFeesTotal.toFixed(2)}
              </strong>{' '}
              ({sla.previewedCancellationFeesCount})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {[
              { label: 'Passenger', val: sla.cancelledByBreakdown.passenger },
              { label: 'Dispatch', val: sla.cancelledByBreakdown.dispatcher },
              { label: 'Driver', val: sla.cancelledByBreakdown.driver },
              { label: 'System', val: sla.cancelledByBreakdown.system },
              { label: '/track Self-Svc', val: sla.guestTrackCancellationsCount },
            ].map((item) => (
              <div
                key={item.label}
                className="px-2 py-1.5 rounded-xl bg-surface-card border border-border-subtle/80"
              >
                <div className="text-xs font-black text-fg-primary tabular-nums">{item.val}</div>
                <div className="text-[10px] font-semibold text-fg-muted truncate">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ─── Card 2: Auto-Dispatch & Wave 4 Workflow Funnel ─── */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-fg-primary flex items-center gap-1.5">
              <ZapIcon className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Auto-Dispatch &amp; Wave 4 Workflow Intelligence</span>
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted mt-0.5">
              Assignment channel mix, offer cascade conversion &amp; Wave 4 workflow adoption
            </CardDescription>
          </div>
          <span className="text-[11px] font-bold text-status-info-fg bg-status-info-bg px-2.5 py-0.5 rounded-lg border border-status-info-border tabular-nums shrink-0">
            {autoDispatch.totalDispatchedOrOffered} Dispatched
          </span>
        </div>

        {/* 5-Channel Horizontal Funnel */}
        <div className="space-y-2">
          {autoDispatch.channelBreakdown.map((ch) => (
            <div key={ch.channel}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-fg-secondary">{ch.label}</span>
                <span className="font-bold text-fg-primary tabular-nums">
                  {ch.count} ({ch.sharePercent}%)
                </span>
              </div>
              <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${CHANNEL_BAR_STYLES[ch.channel]} rounded-full transition-all duration-300`}
                  style={{ width: `${Math.min(100, ch.sharePercent)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Offer Cascade Funnel Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase text-fg-subtle">1st-Attempt Win</div>
            <div className="text-sm font-black text-status-success-fg tabular-nums mt-0.5">
              {autoDispatch.firstAttemptAcceptRatePercent}%
            </div>
            <div className="text-[10px] text-fg-muted">
              {autoDispatch.firstAttemptAcceptCount}/{autoDispatch.totalCascadesTriggered} cascades
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase text-fg-subtle">Exhaustion Rate</div>
            <div
              className={`text-sm font-black tabular-nums mt-0.5 ${
                autoDispatch.exhaustedCascades > 0 ? 'text-rose-600' : 'text-fg-strong'
              }`}
            >
              {autoDispatch.exhaustionRatePercent}%
            </div>
            <div className="text-[10px] text-fg-muted">
              {autoDispatch.exhaustedCascades} exhausted
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/70">
            <div className="text-[10px] font-bold uppercase text-fg-subtle">Avg Offer Resp</div>
            <div className="text-sm font-black text-fg-primary tabular-nums mt-0.5 flex items-center gap-1">
              <ClockIcon className="w-3 h-3 text-blue-600" />
              <span>
                {autoDispatch.avgOfferResponseSeconds !== null
                  ? `${autoDispatch.avgOfferResponseSeconds}s`
                  : '—'}
              </span>
            </div>
            <div className="text-[10px] text-fg-muted">
              {autoDispatch.avgAttemptsPerAcceptedCascade > 0
                ? `${autoDispatch.avgAttemptsPerAcceptedCascade} tries/accept`
                : 'No cascades yet'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-status-staged-bg/60 border border-status-staged-border/70">
            <div className="text-[10px] font-bold uppercase text-indigo-500">Staged &amp; Series</div>
            <div className="text-sm font-black text-status-staged-fg tabular-nums mt-0.5 flex items-center gap-1">
              <RepeatIcon className="w-3 h-3 text-indigo-600" />
              <span>
                {autoDispatch.currentlyStagedCount} / {autoDispatch.standingOrderTripsCount}
              </span>
            </div>
            <div className="text-[10px] text-status-staged-fg">Staged holds / Series rides</div>
          </div>
        </div>

        {/* Wave 4 Adoption Footer: Driver Update Ack + /track Guest Change Requests */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-fg-strong">Driver Update Ack Loop</div>
              <div className="text-[11px] text-fg-muted">
                {ackStats.acknowledgedCount}/{ackStats.totalUpdatesSent} acked ·{' '}
                {ackStats.pendingAckCount} pending
                {ackStats.avgAckLatencySeconds !== null ? ` · ~${ackStats.avgAckLatencySeconds}s` : ''}
              </div>
            </div>
            <span className="text-xs font-black text-status-success-fg bg-status-success-bg px-2 py-1 rounded-lg border border-status-success-border tabular-nums shrink-0">
              {ackStats.ackRatePercent}%
            </span>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-fg-strong">/track Rider Self-Service</div>
              <div className="text-[11px] text-fg-muted">
                {guestStats.approvedChangeRequests} approved · {guestStats.declinedChangeRequests}{' '}
                declined ·{' '}
                <strong
                  className={
                    guestStats.pendingChangeRequests > 0 ? 'text-status-staged-fg' : 'text-fg-secondary'
                  }
                >
                  {guestStats.pendingChangeRequests} pending
                </strong>
              </div>
            </div>
            <span className="text-xs font-black text-status-staged-fg bg-status-staged-bg px-2 py-1 rounded-lg border border-status-staged-border tabular-nums shrink-0">
              {guestStats.guestModifiedTripsCount} edits
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
