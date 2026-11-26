import React from 'react';
import type {
  OperationalIntelligenceSnapshot,
  PercentDeltaResult,
} from '../../../../core/services/analytics';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import type { Trip } from '../../../../core/types/trip';
import { Badge } from '../../../ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import {
  AlertTriangleIcon,
  DollarSignIcon,
  FileTextIcon,
  FlagIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  ZapIcon,
} from '../../../ui/Icons';

export interface ExecutiveOverviewPanelProps {
  snapshot: OperationalIntelligenceSnapshot;
  allTrips: ReadonlyArray<Trip>;
  drivers: ReadonlyArray<DriverRosterItem>;
  isLoading: boolean;
  onNavigateTab: (tabKey: 'trips' | 'rates' | 'invoicing' | 'operators') => void;
}

function DeltaPill({
  delta,
  show,
}: {
  delta: PercentDeltaResult;
  show: boolean;
}) {
  if (!show || delta.deltaPercent === null) return null;
  const isUp = delta.direction === 'up';
  const isDown = delta.direction === 'down';
  const sign = delta.deltaPercent > 0 ? '+' : '';
  const cls = isUp
    ? 'bg-status-success-bg text-status-success-fg border-status-success-border'
    : isDown
    ? 'bg-status-danger-bg text-status-danger-fg border-status-danger-border'
    : 'bg-surface-muted text-fg-secondary border-border-subtle';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold tabular-nums ${cls}`}
      title="Comparison vs prior equivalent window"
    >
      {sign}
      {delta.deltaPercent}%
    </span>
  );
}

export function ExecutiveOverviewPanel({
  snapshot,
  allTrips,
  drivers,
  isLoading,
  onNavigateTab,
}: ExecutiveOverviewPanelProps) {
  const {
    window: activeWindow,
    hasPriorPeriodComparison,
    totalTripsCount,
    completedCount,
    activeDispatchedCount,
    pendingCount,
    cancelledCount,
    sla,
    autoDispatch,
    revenue,
    seriesAndBoards,
    deltas,
  } = snapshot;

  // Live unassigned / at-risk action banner across open workspace trips
  const liveOpenPendingTrips = allTrips.filter(
    (t) =>
      !t.isArchived &&
      (t.status === 'pending' ||
        t.status === 'unconfirmed' ||
        t.status === 'UNCONFIRMED' ||
        (!t.assignedDriverId && (t.status === 'CONFIRMED' || t.status === 'confirmed')))
  );
  const livePendingCount = liveOpenPendingTrips.length;
  const atRiskScheduledCount = sla.openUnassignedScheduledAtRiskCount;

  // Recent 6 bookings from filtered window (falling back to latest overall if window empty)
  const sourceForRecent = snapshot.periodTrips.length > 0 ? snapshot.periodTrips : allTrips;
  const recentTrips = [...sourceForRecent]
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
    .slice(0, 6);

  // Live fleet roster capacity
  const totalDrivers = drivers.length;
  const availableDrivers = drivers.filter((d) => d.status === 'available').length;
  const onTripDrivers = drivers.filter((d) => d.status === 'on_trip').length;

  // Chronological bar chart scaling
  const timeSeries = seriesAndBoards.timeSeries;
  const maxBucketRevenue = Math.max(...timeSeries.map((b) => b.revenue), 50);
  const nonZeroBuckets = timeSeries.filter((b) => b.trips > 0 || b.revenue > 0);
  const avgBucketRevenue =
    timeSeries.length > 0 ? revenue.grossBookedRevenue / Math.max(1, timeSeries.length) : 0;

  const varianceText =
    sla.evaluatedScheduledCount === 0
      ? 'No due scheduled rides'
      : sla.avgPickupVarianceMinutes <= 0
      ? `${Math.abs(sla.avgPickupVarianceMinutes)}m early avg`
      : `+${sla.avgPickupVarianceMinutes}m late avg`;

  return (
    <div className="space-y-5">
      {/* ─── Unassigned / At-Risk Action Banner ─── */}
      {(livePendingCount > 0 || atRiskScheduledCount > 0) && (
        <div
          className={`bg-surface-card border border-border-subtle/90 border-l-4 ${
            atRiskScheduledCount > 0 ? 'border-l-rose-500' : 'border-l-amber-500'
          } rounded-2xl p-3.5 sm:p-4 shadow-xs`}
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  atRiskScheduledCount > 0
                    ? 'bg-status-danger-bg border-status-danger-border text-rose-600'
                    : 'bg-status-warning-bg border-status-warning-border text-amber-600'
                }`}
              >
                <AlertTriangleIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-fg-primary text-sm tracking-tight">
                    {livePendingCount} Unassigned Booking{livePendingCount === 1 ? '' : 's'} Awaiting Dispatch
                  </h3>
                  {atRiskScheduledCount > 0 ? (
                    <Badge variant="danger" size="sm">
                      {atRiskScheduledCount} SLA At-Risk
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      Action Needed
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-fg-muted mt-0.5 truncate">
                  {liveOpenPendingTrips[0] ? (
                    <>
                      Latest request:{' '}
                      <strong className="text-fg-secondary">
                        {liveOpenPendingTrips[0]?.passenger?.firstName || 'Client'}
                      </strong>{' '}
                      from{' '}
                      <span className="font-mono text-[11px] text-fg-secondary">
                        {liveOpenPendingTrips[0]?.pickupLocation?.address?.slice(0, 52) ||
                          'Chesterfield, MO'}
                      </span>
                    </>
                  ) : (
                    'Scheduled pickups inside warning/critical SLA window require driver assignment.'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('trips')}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors shrink-0 text-center cursor-pointer"
            >
              Open Active Queue
            </button>
          </div>
        </div>
      )}

      {/* ─── 4 Executive KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Period Bookings & Completion */}
        <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-3.5 sm:p-4 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted truncate">
              Period Bookings
            </span>
            <span className="p-1.5 rounded-lg bg-status-info-bg text-blue-600 shrink-0">
              <FileTextIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline flex-wrap gap-2">
            <span className="text-2xl sm:text-3xl font-black text-fg-primary tabular-nums">
              {isLoading ? '...' : totalTripsCount}
            </span>
            <DeltaPill delta={deltas.bookings} show={hasPriorPeriodComparison} />
          </div>
          <div className="mt-2 text-[11px] text-fg-muted truncate">
            <strong className="text-emerald-600">{completedCount}</strong> done ·{' '}
            <strong className="text-blue-600">{activeDispatchedCount}</strong> active ·{' '}
            <strong className="text-amber-600">{pendingCount}</strong> open
          </div>
        </Card>

        {/* Card 2: Gross & Settled Revenue */}
        <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-3.5 sm:p-4 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted truncate">
              Gross &amp; Settled Revenue
            </span>
            <span className="p-1.5 rounded-lg bg-status-success-bg text-emerald-600 shrink-0">
              <DollarSignIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline flex-wrap gap-2">
            <span className="text-2xl sm:text-3xl font-black text-fg-primary tabular-nums">
              ${revenue.grossBookedRevenue.toFixed(0)}
            </span>
            <DeltaPill delta={deltas.grossRevenue} show={hasPriorPeriodComparison} />
          </div>
          <div className="mt-2 text-[11px] text-fg-muted truncate">
            Settled <strong className="text-status-success-fg">${revenue.completedRevenue.toFixed(0)}</strong> ·
            Pipeline <strong>${revenue.scheduledPipelineRevenue.toFixed(0)}</strong> · Avg{' '}
            <strong>${revenue.avgFare.toFixed(0)}</strong>
          </div>
        </Card>

        {/* Card 3: On-Time Pickup SLA % */}
        <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-3.5 sm:p-4 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted truncate">
              On-Time Pickup SLA
            </span>
            <span className="p-1.5 rounded-lg bg-status-staged-bg text-indigo-600 shrink-0">
              <ShieldCheckIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline flex-wrap gap-2">
            <span className="text-2xl sm:text-3xl font-black text-fg-primary tabular-nums">
              {sla.onTimeRatePercent !== null ? `${sla.onTimeRatePercent}%` : '—'}
            </span>
            <DeltaPill delta={deltas.onTimeSla} show={hasPriorPeriodComparison} />
            {sla.onTimeRatePercent === null && (
              <span className="text-[11px] font-semibold text-fg-subtle">0 due scheduled</span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-fg-muted truncate">
            <strong>
              {sla.onTimeCount}/{sla.evaluatedScheduledCount}
            </strong>{' '}
            on-time · {varianceText}
            {sla.slaCriticalCount + sla.slaOverdueCount > 0 && (
              <span className="text-rose-600 font-bold">
                {' '}
                · {sla.slaCriticalCount + sla.slaOverdueCount} alert
              </span>
            )}
          </div>
        </Card>

        {/* Card 4: Auto-Dispatch Efficiency */}
        <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs p-3.5 sm:p-4 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted truncate">
              Auto-Dispatch Efficiency
            </span>
            <span className="p-1.5 rounded-lg bg-status-warning-bg text-amber-600 shrink-0">
              <ZapIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline flex-wrap gap-2">
            <span className="text-2xl sm:text-3xl font-black text-fg-primary tabular-nums">
              {autoDispatch.totalCascadesTriggered > 0
                ? `${autoDispatch.firstAttemptAcceptRatePercent}%`
                : `${autoDispatch.currentlyStagedCount} Staged`}
            </span>
            <DeltaPill delta={deltas.firstAttemptAccept} show={hasPriorPeriodComparison} />
          </div>
          <div className="mt-2 text-[11px] text-fg-muted truncate">
            1st-offer accept · Exhausted{' '}
            <strong className={autoDispatch.exhaustedCascades > 0 ? 'text-rose-600' : 'text-fg-secondary'}>
              {autoDispatch.exhaustionRatePercent}%
            </strong>{' '}
            · <strong className="text-indigo-600">{autoDispatch.currentlyStagedCount}</strong> staged
          </div>
        </Card>
      </div>

      {/* ─── Chronological Revenue & Volume Chart + Lifecycle Distribution ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Chronological Bar Chart */}
        <Card
          variant="elevated"
          className="lg:col-span-2 border-border-subtle bg-surface-card shadow-xs p-4 sm:p-5 flex flex-col justify-between"
        >
          <CardHeader className="p-0 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm font-bold text-fg-primary">
                Chronological Revenue &amp; Trip Volume ({activeWindow.bucketGranularity === 'hour' ? 'Hourly' : activeWindow.bucketGranularity === 'month' ? 'Monthly' : 'Daily'})
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                True calendar-bucketed fares ({activeWindow.label}) — hover any bar for exact breakdown
              </CardDescription>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-status-success-fg bg-status-success-bg px-2.5 py-0.5 rounded-lg border border-status-success-border whitespace-nowrap">
                ${revenue.tipsTotal.toFixed(0)} Tips
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto custom-scrollbar pb-1">
              <div
                className="h-46 flex items-end gap-1 sm:gap-1.5 pt-6 pb-2 px-1 border-b border-border-faint"
                style={{ minWidth: timeSeries.length > 14 ? `${timeSeries.length * 28}px` : '100%' }}
              >
                {timeSeries.map((bucket, idx) => {
                  const barHeightPercent =
                    bucket.revenue > 0
                      ? Math.max(12, Math.round((bucket.revenue / maxBucketRevenue) * 100))
                      : bucket.trips > 0
                      ? 8
                      : 3;
                  const showEveryNth =
                    timeSeries.length > 20 ? idx % 3 === 0 || idx === timeSeries.length - 1 : true;

                  return (
                    <div
                      key={bucket.key}
                      className="flex-1 flex flex-col items-center gap-1 group min-w-[18px] relative"
                      title={`${bucket.label} (${bucket.key}): $${bucket.revenue.toFixed(2)} gross ($${bucket.completedRevenue.toFixed(2)} settled) · ${bucket.trips} trip${bucket.trips === 1 ? '' : 's'}`}
                    >
                      <span className="text-[9px] font-bold text-fg-secondary opacity-0 group-hover:opacity-100 transition-opacity tabular-nums whitespace-nowrap pointer-events-none">
                        {bucket.revenue > 0 ? `$${bucket.revenue.toFixed(0)}` : `${bucket.trips}`}
                      </span>
                      <div className="w-full bg-surface-muted rounded-t-md h-32 flex items-end overflow-hidden">
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${
                            bucket.revenue > 0
                              ? 'bg-gradient-to-t from-blue-700 to-blue-500 group-hover:from-amber-600 group-hover:to-amber-400'
                              : 'bg-surface-emphasis/80'
                          }`}
                          style={{ height: `${barHeightPercent}%` }}
                        />
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-semibold text-fg-muted truncate max-w-full h-3.5">
                        {showEveryNth ? bucket.label : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-blue-600" />
                  <span>Booked Fares ({nonZeroBuckets.length} active buckets)</span>
                </span>
              </span>
              <span className="tabular-nums">
                Avg per {activeWindow.bucketGranularity}:{' '}
                <strong className="text-fg-strong">${avgBucketRevenue.toFixed(2)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Trip Lifecycle Distribution + Fleet Capacity */}
        <Card
          variant="elevated"
          className="border-border-subtle bg-surface-card shadow-xs p-4 sm:p-5 flex flex-col justify-between"
        >
          <div>
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-sm font-bold text-fg-primary">
                Trip Lifecycle Distribution
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Reservation status mix inside {activeWindow.label}
              </CardDescription>
            </CardHeader>

            <div className="space-y-3">
              {[
                {
                  label: 'Completed',
                  count: completedCount,
                  dotCls: 'bg-emerald-500',
                  barCls: 'bg-emerald-500',
                },
                {
                  label: 'Active Dispatched',
                  count: activeDispatchedCount,
                  dotCls: 'bg-blue-500',
                  barCls: 'bg-blue-500',
                },
                {
                  label: 'Open / Pending',
                  count: pendingCount,
                  dotCls: 'bg-amber-500',
                  barCls: 'bg-amber-500',
                },
                {
                  label: 'Cancelled / Declined',
                  count: cancelledCount,
                  dotCls: 'bg-rose-400',
                  barCls: 'bg-rose-400',
                },
              ].map((row) => {
                const pct =
                  totalTripsCount > 0 ? Math.round((row.count / totalTripsCount) * 100) : 0;
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-fg-secondary flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${row.dotCls}`} /> {row.label}
                      </span>
                      <span className="font-bold text-fg-primary tabular-nums">
                        {row.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.barCls} rounded-full transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border-faint flex items-center justify-between text-xs">
            <span className="text-fg-muted">
              Live Fleet: <strong className="text-status-success-fg">{availableDrivers}</strong> open ·{' '}
              <strong className="text-status-info-fg">{onTripDrivers}</strong> on trip /{' '}
              <strong>{totalDrivers}</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('operators')}
              className="text-[11px] font-bold text-blue-600 hover:text-status-info-fg cursor-pointer"
            >
              Roster →
            </button>
          </div>
        </Card>
      </div>

      {/* ─── Recent Bookings & Live Queue Preview ─── */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs flex flex-col overflow-hidden">
        <CardHeader className="border-b border-border-faint p-4 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-fg-primary">
              Recent Bookings &amp; Live Queue Preview
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted">
              Latest reservations across Chesterfield, West County, and St. Louis airports
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('trips')}
            className="text-xs font-bold text-blue-600 hover:text-status-info-fg shrink-0 cursor-pointer"
          >
            View All Trips →
          </button>
        </CardHeader>

        <CardContent className="p-0 min-w-full">
          {isLoading ? (
            <div className="p-8 text-center text-fg-subtle flex items-center justify-center gap-2">
              <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs">Loading live trip queue...</span>
            </div>
          ) : recentTrips.length === 0 ? (
            <div className="p-8 text-center text-fg-subtle text-xs">
              No bookings registered yet.
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-border-faint">
                {recentTrips.map((trip) => {
                  const fare = Number(trip.pricing?.totalFare || trip.payment?.amount || 0);
                  const passengerName = trip.passenger
                    ? `${trip.passenger.firstName || ''} ${trip.passenger.lastName || ''}`.trim() ||
                      'Guest Client'
                    : 'Guest Client';
                  const passengerPhone = trip.passenger?.phone || '';
                  const pickup = trip.pickupLocation?.address || 'Pickup not specified';
                  const dropoff = trip.dropoffLocation?.address || 'Dropoff not specified';

                  return (
                    <div
                      key={trip.id}
                      onClick={() => onNavigateTab('trips')}
                      className="p-3.5 space-y-2 active:bg-surface-subtle transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-extrabold text-fg-primary text-xs truncate">
                            {passengerName}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-fg-subtle mt-0.5">
                            <span>#{trip.id.slice(0, 8)}</span>
                            {passengerPhone && (
                              <>
                                <span>·</span>
                                <span className="text-fg-muted">{passengerPhone}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-black text-xs text-fg-primary tabular-nums">
                            ${fare > 0 ? fare.toFixed(2) : '--'}
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              trip.status === 'completed'
                                ? 'bg-status-success-bg-strong text-status-success-fg'
                                : trip.status === 'assigned' || trip.status === 'offered'
                                ? 'bg-status-info-bg-strong text-status-info-fg'
                                : trip.status === 'pending'
                                ? 'bg-status-warning-bg-strong text-status-warning-fg'
                                : 'bg-surface-muted text-fg-secondary'
                            }`}
                          >
                            {trip.status}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] bg-surface-subtle p-2 rounded-xl border border-border-faint">
                        <div className="flex items-center gap-1.5 text-fg-strong font-medium">
                          <MapPinIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{pickup}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-fg-muted">
                          <FlagIcon className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="truncate">{dropoff}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (md+) */}
              <div className="hidden md:block overflow-x-auto custom-scrollbar min-w-full">
                <table className="w-full text-left text-xs divide-y divide-border-faint min-w-[620px]">
                  <thead className="bg-surface-subtle text-fg-muted font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Trip ID</th>
                      <th className="px-4 py-2.5">Client</th>
                      <th className="px-4 py-2.5">Route</th>
                      <th className="px-4 py-2.5">Fare</th>
                      <th className="px-4 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-faint">
                    {recentTrips.map((trip) => {
                      const fare = Number(trip.pricing?.totalFare || trip.payment?.amount || 0);
                      const passengerName = trip.passenger
                        ? `${trip.passenger.firstName || ''} ${trip.passenger.lastName || ''}`.trim() ||
                          'Guest Client'
                        : 'Guest Client';
                      const passengerPhone = trip.passenger?.phone || '';
                      const pickup = trip.pickupLocation?.address || 'Pickup address not specified';
                      const dropoff =
                        trip.dropoffLocation?.address || 'Dropoff address not specified';

                      return (
                        <tr
                          key={trip.id}
                          onClick={() => onNavigateTab('trips')}
                          className="hover:bg-surface-subtle/80 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 font-mono text-[11px] text-fg-muted whitespace-nowrap">
                            #{trip.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-fg-primary">
                            <div>{passengerName}</div>
                            {passengerPhone && (
                              <div className="text-[10px] text-fg-subtle font-mono">
                                {passengerPhone}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-fg-secondary max-w-sm space-y-1">
                            <div className="flex items-center gap-1.5 font-medium text-fg-strong">
                              <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">{pickup}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-fg-muted text-[11px]">
                              <FlagIcon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span className="truncate">{dropoff}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-fg-primary tabular-nums">
                            ${fare > 0 ? fare.toFixed(2) : '--'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                trip.status === 'completed'
                                  ? 'bg-status-success-bg-strong text-status-success-fg'
                                  : trip.status === 'assigned' || trip.status === 'offered'
                                  ? 'bg-status-info-bg-strong text-status-info-fg'
                                  : trip.status === 'pending'
                                  ? 'bg-status-warning-bg-strong text-status-warning-fg'
                                  : 'bg-surface-muted text-fg-secondary'
                              }`}
                            >
                              {trip.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
