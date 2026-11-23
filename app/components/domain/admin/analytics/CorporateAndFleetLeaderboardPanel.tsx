import React from 'react';
import type {
  TimeSeriesAndLeaderboardsResult,
  VehicleClassDemandRow,
} from '../../../../core/services/analytics';
import { Badge } from '../../../ui/Badge';
import { Card, CardDescription, CardTitle } from '../../../ui/Card';
import {
  BuildingIcon,
  CarIcon,
  ClockIcon,
  MapPinIcon,
  TrophyIcon,
} from '../../../ui/Icons';

export interface CorporateAndFleetLeaderboardPanelProps {
  boards: TimeSeriesAndLeaderboardsResult;
  onNavigateTab: (tabKey: 'trips' | 'rates' | 'invoicing' | 'operators') => void;
}

const VEHICLE_BAR_COLORS: Record<VehicleClassDemandRow['tierKey'], string> = {
  standard: 'bg-blue-600',
  executive: 'bg-emerald-600',
  xl: 'bg-amber-500',
  wav: 'bg-purple-600',
};

export function CorporateAndFleetLeaderboardPanel({
  boards,
  onNavigateTab,
}: CorporateAndFleetLeaderboardPanelProps) {
  return (
    <div className="space-y-5">
      {/* ─── Row 1: Top Drivers Leaderboard + Top Corporate B2B Accounts ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Top Drivers Leaderboard */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <TrophyIcon className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Top Drivers Performance Leaderboard</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Completed rides, settled fares, tips earned, declined offers &amp; On-Time SLA %
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('operators')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0 cursor-pointer"
            >
              Drivers Roster →
            </button>
          </div>

          {boards.driverLeaderboard.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No driver activity recorded in this window yet.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs divide-y divide-slate-100 min-w-[520px]">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Driver</th>
                    <th className="px-2.5 py-2.5 text-right">Done</th>
                    <th className="px-2.5 py-2.5 text-right">Gross Fare</th>
                    <th className="px-2.5 py-2.5 text-right">Tips</th>
                    <th className="px-2.5 py-2.5 text-right">Declined</th>
                    <th className="px-4 py-2.5 text-right">On-Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {boards.driverLeaderboard.slice(0, 8).map((drv, idx) => (
                    <tr key={drv.driverId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-extrabold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <span>{drv.driverName}</span>
                              {drv.cabNumber && (
                                <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  #{drv.cabNumber}
                                </span>
                              )}
                            </div>
                            {drv.activeTrips > 0 && (
                              <div className="text-[10px] text-emerald-600 font-semibold">
                                {drv.activeTrips} active right now
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-3 text-right font-bold text-slate-800 tabular-nums">
                        {drv.completedTrips}
                      </td>
                      <td className="px-2.5 py-3 text-right font-black text-slate-900 tabular-nums">
                        ${drv.grossFare.toFixed(2)}
                      </td>
                      <td className="px-2.5 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                        ${drv.tipsEarned.toFixed(2)}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums">
                        <span
                          className={
                            drv.declinedOffersCount > 0
                              ? 'font-bold text-rose-600'
                              : 'text-slate-400'
                          }
                        >
                          {drv.declinedOffersCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {drv.onTimeRatePercent !== null ? (
                          <Badge
                            variant={drv.onTimeRatePercent >= 90 ? 'success' : 'warning'}
                            size="sm"
                          >
                            {drv.onTimeRatePercent}%
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top Corporate Accounts B2B Leaderboard */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <BuildingIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Top Corporate Accounts (B2B Spend)</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Enterprise account volume, gross spend, average fare &amp; unbilled invoice queue
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('invoicing')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0 cursor-pointer"
            >
              Open Invoicing →
            </button>
          </div>

          {boards.corporateLeaderboard.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No B2B corporate account rides recorded in this window.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs divide-y divide-slate-100 min-w-[480px]">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Corporate Account</th>
                    <th className="px-3 py-2.5 text-right">Trips</th>
                    <th className="px-3 py-2.5 text-right">Gross Spend</th>
                    <th className="px-3 py-2.5 text-right">Avg Fare</th>
                    <th className="px-4 py-2.5 text-right">Unbilled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {boards.corporateLeaderboard.slice(0, 8).map((corp) => (
                    <tr key={corp.accountKey} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900">{corp.accountName}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">
                        {corp.tripCount}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-slate-900 tabular-nums">
                        ${corp.grossRevenue.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600 tabular-nums">
                        ${corp.avgFare.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {corp.pendingInvoiceCount > 0 ? (
                          <Badge variant="warning" size="sm">
                            {corp.pendingInvoiceCount} pending
                          </Badge>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-600">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ─── Row 2: Vehicle Class Demand + Pickup Zones + Real Peak Dispatch Windows ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Vehicle Class Demand */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4 sm:p-5 space-y-3.5">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <CarIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Vehicle Class Demand</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Passenger fleet tier preference &amp; revenue mix
            </CardDescription>
          </div>

          <div className="space-y-3 text-xs">
            {boards.vehicleClassBreakdown.map((v) => (
              <div key={v.tierKey}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-slate-700 truncate">{v.label}</span>
                  <span className="font-black text-slate-900 tabular-nums shrink-0">
                    {v.sharePercent}% ({v.tripCount})
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${VEHICLE_BAR_COLORS[v.tierKey]} rounded-full transition-all`}
                    style={{ width: `${Math.min(100, v.sharePercent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Pickup Zones / Cities */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4 sm:p-5 space-y-3.5">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <MapPinIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Top Origination Zones</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Highest-volume pickup municipalities &amp; terminals
            </CardDescription>
          </div>

          {boards.zoneBreakdown.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No pickup zone data in selected window.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {boards.zoneBreakdown.slice(0, 6).map((z) => (
                <div
                  key={z.zoneKey}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{z.zoneLabel}</div>
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      ${z.grossRevenue.toFixed(0)} gross
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <span className="font-black text-slate-900">{z.tripCount}</span>
                    <span className="text-[10px] text-blue-600 font-bold ml-1">
                      ({z.sharePercent}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Real Data-Driven Peak Dispatch Windows */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4 sm:p-5 space-y-3.5">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Peak Dispatch Windows</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Computed from actual period pickup timestamps
            </CardDescription>
          </div>

          <div className="space-y-2 text-xs">
            {boards.hourlyDemand.map((block) => (
              <div
                key={block.key}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 truncate">{block.label}</div>
                  <div className="text-[10px] font-mono text-slate-500">{block.timeRange}</div>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div className="font-black text-slate-900">
                    {block.tripCount} ride{block.tripCount === 1 ? '' : 's'} ({block.sharePercent}%)
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Avg ${block.avgFare.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
