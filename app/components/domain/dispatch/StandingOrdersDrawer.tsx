import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PreferredDriverAssignmentMode, StandingOrderSeries } from '../../../core/types/standing-order';
import type { Trip } from '../../../core/types/trip';
import {
  assignPreferredDriverToSeries,
  cancelStandingOrderSeries,
  doesTripBelongToSeries,
  extendStandingOrderHorizon,
  fetchStandingOrderSeriesList,
  formatStandingOrderCadenceSummary,
  isFutureTrip,
  pauseStandingOrderSeries,
  resumeStandingOrderSeries,
  subscribeToStandingOrders,
  updateStandingOrderSkipDates,
} from '../../../core/services/dispatch/standing-order.service';
import type { AutoDispatchDriverInput } from '../../../core/services/dispatch/auto-dispatch-ranking';
import {
  formatDriverAssignmentLabel,
  getOperatorService,
  type DriverRosterItem,
} from '../../../core/services/operator.service';
import { getAdminAuthService } from '../../../core/services/auth/admin-auth.service';
import {
  CarIcon,
  CheckIcon,
  ClockIcon,
  PhoneIcon,
  RefreshCwIcon,
  SearchIcon,
  SpinnerIcon,
  UserIcon,
  XIcon,
} from '../../ui/Icons';

export interface StandingOrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  drivers?: ReadonlyArray<AutoDispatchDriverInput | DriverRosterItem>;
  initialSeriesId?: string | null;
}

type SeriesFilterTab = 'all' | 'active' | 'paused' | 'cancelled';

interface SeriesCardProps {
  series: StandingOrderSeries;
  trips: Trip[];
  drivers: Array<AutoDispatchDriverInput & Partial<DriverRosterItem>>;
  actorEmail: string;
  isBusy: boolean;
  onBusyChange: (seriesId: string | null) => void;
  onToast: (msg: string, variant?: 'success' | 'error') => void;
}

function resolveDriverDropdownLabel(d: AutoDispatchDriverInput & Partial<DriverRosterItem>): string {
  const formatted = formatDriverAssignmentLabel({
    name: d.name,
    cabNumber: d.cabNumber,
    assignedUnit: d.vehicleUnit,
    vehicle: d.vehicle,
    zone: d.zone,
    status: d.status,
    isBlacklisted: d.isBlacklisted,
  });
  return formatted || d.formattedLabel || d.name || d.id;
}

function StandingOrderSeriesCard({
  series,
  trips,
  drivers,
  actorEmail,
  isBusy,
  onBusyChange,
  onToast,
}: SeriesCardProps) {
  const [cancelFutureOnPause, setCancelFutureOnPause] = useState(false);
  const [pendingSkipDate, setPendingSkipDate] = useState('');
  const [cancelMatchingOnSkip, setCancelMatchingOnSkip] = useState(true);
  const [draftDriverId, setDraftDriverId] = useState<string>(series.preferredDriverId || '');
  const [draftDriverMode, setDraftDriverMode] = useState<'stage_hold' | 'send_to_driver'>(
    series.preferredDriverMode === 'send_to_driver' ? 'send_to_driver' : 'stage_hold'
  );

  useEffect(() => {
    setDraftDriverId(series.preferredDriverId || '');
    if (series.preferredDriverMode === 'send_to_driver' || series.preferredDriverMode === 'stage_hold') {
      setDraftDriverMode(series.preferredDriverMode);
    }
  }, [series.preferredDriverId, series.preferredDriverMode]);

  const linkedTrips = useMemo(
    () => trips.filter((t) => doesTripBelongToSeries(t, series)),
    [trips, series]
  );

  const upcomingOpenTrips = useMemo(
    () =>
      linkedTrips.filter(
        (t) =>
          isFutureTrip(t) &&
          !['completed', 'cancelled', 'declined', 'DECLINED'].includes(String(t.status || ''))
      ),
    [linkedTrips]
  );

  const passengerFullName =
    [series.passenger.firstName, series.passenger.lastName].filter(Boolean).join(' ') ||
    'Recurring Passenger';

  const statusBadgeClass =
    series.status === 'active'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : series.status === 'paused'
      ? 'bg-amber-100 text-amber-900 border-amber-300'
      : 'bg-rose-100 text-rose-800 border-rose-300';

  const handleTogglePauseResume = async () => {
    onBusyChange(series.id);
    try {
      if (series.status === 'active') {
        const res = await pauseStandingOrderSeries(series.id, {
          cancelFutureOpenTrips: cancelFutureOnPause,
          existingTrips: trips,
          actorName: actorEmail,
        });
        const cancelledNote =
          res.cancelledTripIds.length > 0
            ? ` (${res.cancelledTripIds.length} open future ${
                res.cancelledTripIds.length === 1 ? 'trip' : 'trips'
              } cancelled)`
            : '';
        onToast(`Paused series "${series.label}"${cancelledNote}.`, 'success');
      } else {
        await resumeStandingOrderSeries(series.id);
        onToast(`Resumed series "${series.label}" — status is now Active.`, 'success');
      }
    } catch (err: any) {
      onToast(err?.message || 'Failed updating series status.', 'error');
    } finally {
      onBusyChange(null);
    }
  };

  const handleCancelSeries = async () => {
    onBusyChange(series.id);
    try {
      const res = await cancelStandingOrderSeries(series.id, {
        cancelFutureOpenTrips: true,
        existingTrips: trips,
        actorName: actorEmail,
      });
      onToast(
        `Cancelled series "${series.label}" (${res.cancelledTripIds.length} open future rides cancelled).`,
        'success'
      );
    } catch (err: any) {
      onToast(err?.message || 'Failed cancelling series.', 'error');
    } finally {
      onBusyChange(null);
    }
  };

  const handleAddSkipDate = async () => {
    const clean = pendingSkipDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return;
    onBusyChange(series.id);
    try {
      const nextDates = Array.from(new Set([...(series.schedule.skipDates || []), clean])).sort();
      const res = await updateStandingOrderSkipDates(series.id, nextDates, {
        cancelMatchingOpenTrips: cancelMatchingOnSkip,
        existingTrips: trips,
        actorName: actorEmail,
      });
      setPendingSkipDate('');
      const cNote =
        res.cancelledTripIds.length > 0
          ? ` & cancelled ${res.cancelledTripIds.length} matching open ${
              res.cancelledTripIds.length === 1 ? 'trip' : 'trips'
            }`
          : '';
      onToast(`Added skip date ${clean}${cNote}.`, 'success');
    } catch (err: any) {
      onToast(err?.message || 'Failed updating skip dates.', 'error');
    } finally {
      onBusyChange(null);
    }
  };

  const handleRemoveSkipDate = async (dateToRemove: string) => {
    onBusyChange(series.id);
    try {
      const nextDates = (series.schedule.skipDates || []).filter((d) => d !== dateToRemove);
      await updateStandingOrderSkipDates(series.id, nextDates, {
        cancelMatchingOpenTrips: false,
        existingTrips: trips,
        actorName: actorEmail,
      });
      onToast(`Removed skip date ${dateToRemove}.`, 'success');
    } catch (err: any) {
      onToast(err?.message || 'Failed removing skip date.', 'error');
    } finally {
      onBusyChange(null);
    }
  };

  const handleApplyPreferredDriver = async (applyToFuture: boolean) => {
    onBusyChange(series.id);
    try {
      const matched = draftDriverId ? drivers.find((d) => d.id === draftDriverId) : undefined;
      const label = draftDriverId
        ? matched
          ? resolveDriverDropdownLabel(matched)
          : series.preferredDriverLabel || draftDriverId
        : null;
      const mode: PreferredDriverAssignmentMode = draftDriverId ? draftDriverMode : 'unassigned';

      const res = await assignPreferredDriverToSeries({
        seriesId: series.id,
        driverId: draftDriverId || null,
        driverLabel: label,
        mode,
        applyToExistingFutureTrips: applyToFuture,
        actorEmail,
        existingTrips: trips,
        drivers,
      });

      if (!draftDriverId) {
        onToast(
          applyToFuture
            ? `Cleared preferred driver (${res.updatedTripIds.length} open future trips unstaged/cleared).`
            : 'Cleared preferred driver on series.',
          'success'
        );
      } else {
        const modeDesc = mode === 'stage_hold' ? 'Staged (Hold)' : 'Send to Driver';
        onToast(
          applyToFuture
            ? `Saved preferred driver (${modeDesc}) & applied to ${res.updatedTripIds.length} open future ${
                res.updatedTripIds.length === 1 ? 'trip' : 'trips'
              }.`
            : `Saved preferred driver (${modeDesc}) for future horizon extensions.`,
          'success'
        );
      }
    } catch (err: any) {
      onToast(err?.message || 'Failed applying preferred driver.', 'error');
    } finally {
      onBusyChange(null);
    }
  };

  const handleExtendHorizon = async (opts: { extendDays?: number; additionalOccurrences?: number; label: string }) => {
    onBusyChange(series.id);
    try {
      const res = await extendStandingOrderHorizon({
        seriesId: series.id,
        extendDays: opts.extendDays,
        additionalOccurrences: opts.additionalOccurrences,
        existingTrips: trips,
        actorName: actorEmail,
      });
      const skipNote =
        res.skippedDates.length > 0
          ? ` (${res.skippedDates.length} skip ${
              res.skippedDates.length === 1 ? 'date' : 'dates'
            } excluded)`
          : '';
      if (res.createdTrips.length === 0) {
        onToast(
          `No new rides generated for ${opts.label} — check Until Date or already-scheduled horizon${skipNote}.`,
          'error'
        );
      } else {
        onToast(
          `Extended "${series.label}" (${opts.label}): ${res.createdTrips.length} new scheduled ${
            res.createdTrips.length === 1 ? 'ride' : 'rides'
          } generated${skipNote}.`,
          'success'
        );
      }
    } catch (err: any) {
      onToast(err?.message || 'Failed extending standing order horizon.', 'error');
    } finally {
      onBusyChange(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 space-y-3.5 transition-all hover:border-slate-300">
      {/* Header Row: Status Badge, Label, Series ID & Fare */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusBadgeClass}`}
            >
              {series.status}
            </span>
            <h4 className="font-extrabold text-sm text-slate-900 truncate">{series.label}</h4>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              #{series.id.slice(-8).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
              <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{passengerFullName}</span>
            </span>
            {series.passenger.phone && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600">
                <PhoneIcon className="w-3 h-3 text-slate-400 shrink-0" />
                <span>{series.passenger.phone}</span>
              </span>
            )}
            {series.corporateAccountName && (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold">
                Corp: {series.corporateAccountName}
                {series.billingPo ? ` · PO ${series.billingPo}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono font-black text-sm text-emerald-700">
            ${Number(series.pricingSnapshot?.totalFare || 0).toFixed(2)}
            <span className="text-[10px] font-sans font-semibold text-slate-500">/ride</span>
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">
            {series.vehicleDisplayName || series.vehicleTier || 'standard'} · {series.paymentMethod}
          </div>
        </div>
      </div>

      {/* Route & Cadence Summary Box */}
      <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-2.5 space-y-2 text-xs">
        <div className="space-y-1">
          <div className="flex items-start gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
            <span className="text-slate-800 font-medium line-clamp-1">
              {series.route.pickupLocation.address}
            </span>
          </div>
          {series.route.intermediateStops && series.route.intermediateStops.length > 0 && (
            <div className="pl-3.5 text-[11px] text-amber-800 font-semibold">
              + {series.route.intermediateStops.length}{' '}
              {series.route.intermediateStops.length === 1 ? 'Stop' : 'Stops'}:{' '}
              {series.route.intermediateStops.map((s) => s.address.split(',')[0]).join(' → ')}
            </div>
          )}
          <div className="flex items-start gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
            <span className="text-slate-800 font-medium line-clamp-1">
              {series.route.dropoffLocation.address}
            </span>
          </div>
        </div>

        <div className="pt-1.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-bold text-indigo-900">
            <ClockIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>{formatStandingOrderCadenceSummary(series)}</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-bold text-slate-700 text-[10.5px]">
              Upcoming Open: {upcomingOpenTrips.length}
            </span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-700 text-[10.5px]">
              Horizon: {series.lastGeneratedDate || series.schedule.startDate || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Control Row 1: 1-Click Pause / Resume Series */}
      {series.status !== 'cancelled' && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {series.status === 'active' ? (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleTogglePauseResume}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-2xs"
                >
                  ⏸ Pause Series
                </button>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={cancelFutureOnPause}
                    onChange={(e) => setCancelFutureOnPause(e.target.checked)}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  <span>Also cancel open future trips</span>
                </label>
              </>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleTogglePauseResume}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>Resume Series</span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleCancelSeries}
            className="text-[10.5px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer disabled:opacity-40"
          >
            Cancel Series
          </button>
        </div>
      )}

      {/* Control Row 2: Holiday / Skip Dates Manager */}
      <div className="p-2.5 rounded-xl bg-amber-50/40 border border-amber-200/80 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-extrabold text-[11px] text-amber-950 uppercase tracking-wide">
            Holiday / Skip Dates
          </span>
          <label className="inline-flex items-center gap-1.5 text-[10.5px] text-amber-900 font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={cancelMatchingOnSkip}
              onChange={(e) => setCancelMatchingOnSkip(e.target.checked)}
              className="rounded border-amber-300 text-amber-600"
            />
            <span>Cancel matching open trip if already generated</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={pendingSkipDate}
            onChange={(e) => setPendingSkipDate(e.target.value)}
            className="flex-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono text-slate-800"
            aria-label="Add skip date"
          />
          <button
            type="button"
            disabled={isBusy || !pendingSkipDate}
            onClick={handleAddSkipDate}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold text-[11px] transition-colors cursor-pointer shrink-0"
          >
            + Add Skip Date
          </button>
        </div>

        {series.schedule.skipDates && series.schedule.skipDates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {series.schedule.skipDates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[11px] font-mono font-bold text-amber-950"
              >
                <span>{d}</span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleRemoveSkipDate(d)}
                  className="text-slate-400 hover:text-rose-600 font-sans cursor-pointer leading-none"
                  title={`Remove skip date ${d}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10.5px] text-slate-500">No holiday or skip dates configured.</p>
        )}
      </div>

      {/* Control Row 3: Preferred Driver & Assignment Mode Control */}
      <div className="p-2.5 rounded-xl bg-indigo-50/40 border border-indigo-200/80 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-extrabold text-[11px] text-indigo-950 uppercase tracking-wide flex items-center gap-1">
            <CarIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span>Preferred Driver &amp; Delivery Mode</span>
          </span>
          {series.preferredDriverId && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-bold">
              {series.preferredDriverMode === 'stage_hold' ? '📌 Staged (Hold)' : 'Send to Driver'}:{' '}
              {series.preferredDriverLabel || series.preferredDriverId}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={draftDriverId}
            onChange={(e) => setDraftDriverId(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-indigo-300 text-xs font-semibold text-slate-800"
            aria-label="Preferred driver"
          >
            <option value="">Unassigned (Open Dispatch Queue)</option>
            {drivers
              .filter((d) => !d.isArchived && !d.isBlacklisted)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {resolveDriverDropdownLabel(d)}
                </option>
              ))}
          </select>

          <div className="inline-flex rounded-lg border border-indigo-300 bg-white p-0.5 shrink-0">
            <button
              type="button"
              disabled={!draftDriverId}
              onClick={() => setDraftDriverMode('stage_hold')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-colors cursor-pointer disabled:opacity-40 ${
                draftDriverMode === 'stage_hold'
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-800 hover:bg-indigo-50'
              }`}
              title="Stage Driver (Hold in Dispatch Shift Planner until released)"
            >
              📌 Hold (Stage)
            </button>
            <button
              type="button"
              disabled={!draftDriverId}
              onClick={() => setDraftDriverMode('send_to_driver')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-colors cursor-pointer disabled:opacity-40 ${
                draftDriverMode === 'send_to_driver'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Send to Driver immediately when generated"
            >
              Send to Driver
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => handleApplyPreferredDriver(false)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-900 font-bold text-[10.5px] transition-colors cursor-pointer disabled:opacity-40"
          >
            Save Default Only
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => handleApplyPreferredDriver(true)}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
          >
            Apply to Open Future Trips
          </button>
        </div>
      </div>

      {/* Control Row 4: 1-Click Extend Horizon */}
      {series.status !== 'cancelled' && (
        <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-extrabold text-[11px] text-emerald-950 uppercase tracking-wide block">
              Extend Standing Horizon
            </span>
            <span className="text-[10.5px] text-emerald-800">
              Generates non-duplicate rides after{' '}
              <strong className="font-mono">
                {series.lastGeneratedDate || series.schedule.startDate}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleExtendHorizon({ extendDays: 7, label: '+1 Week' })}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-extrabold text-[11px] transition-colors cursor-pointer disabled:opacity-40"
            >
              +1 Week
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleExtendHorizon({ extendDays: 14, label: '+2 Weeks' })}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-extrabold text-[11px] transition-colors cursor-pointer disabled:opacity-40"
            >
              +2 Weeks
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleExtendHorizon({ additionalOccurrences: 10, label: '+10 Rides' })}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
            >
              +10 Rides
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StandingOrdersDrawer({
  isOpen,
  onClose,
  trips,
  drivers: propDrivers,
  initialSeriesId,
}: StandingOrdersDrawerProps) {
  const [seriesList, setSeriesList] = useState<StandingOrderSeries[]>([]);
  const [fallbackDrivers, setFallbackDrivers] = useState<DriverRosterItem[]>([]);
  const [filterTab, setFilterTab] = useState<SeriesFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busySeriesId, setBusySeriesId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToStandingOrders((updated) => {
      setSeriesList(updated);
    });
    void fetchStandingOrderSeriesList().then((fetched) => setSeriesList(fetched));
    return unsub;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (propDrivers && propDrivers.length > 0) return;
    const opSvc = getOperatorService();
    setFallbackDrivers(opSvc.getDriverRoster());
    const unsub = opSvc.subscribeToDrivers((roster) => {
      setFallbackDrivers(roster);
    });
    return unsub;
  }, [isOpen, propDrivers]);

  useEffect(() => {
    if (isOpen && initialSeriesId) {
      setFilterTab('all');
      setSearchQuery(initialSeriesId);
    }
  }, [isOpen, initialSeriesId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const resolvedDrivers = useMemo(
    () =>
      ((propDrivers && propDrivers.length > 0 ? propDrivers : fallbackDrivers) as Array<
        AutoDispatchDriverInput & Partial<DriverRosterItem>
      >) || [],
    [propDrivers, fallbackDrivers]
  );

  const actorEmail = useMemo(() => {
    try {
      const user = getAdminAuthService().getCurrentUser();
      return user?.email || user?.displayName || 'Dispatcher';
    } catch {
      return 'Dispatcher';
    }
  }, [isOpen]);

  const showToast = (text: string, variant: 'success' | 'error' = 'success') => {
    setToast({ text, variant });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  // KPI metrics
  const activeSeriesCount = useMemo(
    () => seriesList.filter((s) => s.status === 'active').length,
    [seriesList]
  );

  const upcomingLinkedTripsCount = useMemo(() => {
    if (seriesList.length === 0) return 0;
    return trips.filter(
      (t) =>
        isFutureTrip(t) &&
        !['completed', 'cancelled', 'declined', 'DECLINED'].includes(String(t.status || '')) &&
        seriesList.some((s) => doesTripBelongToSeries(t, s))
    ).length;
  }, [trips, seriesList]);

  const stagedPreferredDriversCount = useMemo(
    () =>
      seriesList.filter(
        (s) =>
          s.status === 'active' &&
          Boolean(s.preferredDriverId) &&
          s.preferredDriverMode === 'stage_hold'
      ).length,
    [seriesList]
  );

  const filteredSeries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return seriesList.filter((s) => {
      if (filterTab !== 'all' && s.status !== filterTab) return false;
      if (!q) return true;
      const haystack = [
        s.id,
        s.label,
        s.passenger.firstName,
        s.passenger.lastName,
        s.passenger.phone,
        s.corporateAccountName || '',
        s.billingPo || '',
        s.route.pickupLocation?.address || '',
        s.route.dropoffLocation?.address || '',
        s.preferredDriverLabel || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [seriesList, filterTab, searchQuery]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-Over Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Standing Orders and Recurring Rides Series Manager"
        className="relative z-10 w-full max-w-2xl bg-slate-50 h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Top Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-base font-bold shrink-0 shadow-xs">
              🔁
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white truncate">
                Standing Orders &amp; Recurring Series
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                Manage recurring rides, holiday skip dates, staged preferred drivers &amp; rolling horizons
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close Standing Orders Drawer"
            aria-label="Close Standing Orders Drawer"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Summary KPI Pills */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 grid grid-cols-3 gap-2.5 shrink-0">
          <div className="px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
              Active Series
            </span>
            <span className="text-base font-black font-mono text-emerald-950">
              {activeSeriesCount}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
              Upcoming Linked Trips
            </span>
            <span className="text-base font-black font-mono text-blue-950">
              {upcomingLinkedTripsCount}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-indigo-50/80 border border-indigo-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">
              Staged Preferred Drivers
            </span>
            <span className="text-base font-black font-mono text-indigo-950">
              {stagedPreferredDriversCount}
            </span>
          </div>
        </div>

        {/* Filter Tabs + Search Bar */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
              {(
                [
                  { id: 'all', label: 'All', count: seriesList.length },
                  {
                    id: 'active',
                    label: 'Active',
                    count: seriesList.filter((s) => s.status === 'active').length,
                  },
                  {
                    id: 'paused',
                    label: 'Paused',
                    count: seriesList.filter((s) => s.status === 'paused').length,
                  },
                  {
                    id: 'cancelled',
                    label: 'Cancelled',
                    count: seriesList.filter((s) => s.status === 'cancelled').length,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterTab === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {busySeriesId && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700">
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing...</span>
              </span>
            )}
          </div>

          <div className="relative">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search passenger, phone, corporate account, address, series ID..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {toast && (
            <div
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                toast.variant === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-current opacity-70 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Series Cards List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {filteredSeries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto text-xl">
                <RefreshCwIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-extrabold text-slate-800">
                {seriesList.length === 0
                  ? 'No Standing Order Series Registered Yet'
                  : 'No Standing Orders Match Your Filter'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {seriesList.length === 0
                  ? 'Enable "Repeat / Recurring Ride" when creating a scheduled booking in Dispatch to automatically register a Managed Standing Order Series.'
                  : 'Try clearing the search query or switching status tabs above.'}
              </p>
            </div>
          ) : (
            filteredSeries.map((series) => (
              <StandingOrderSeriesCard
                key={series.id}
                series={series}
                trips={trips}
                drivers={resolvedDrivers}
                actorEmail={actorEmail}
                isBusy={busySeriesId === series.id}
                onBusyChange={setBusySeriesId}
                onToast={showToast}
              />
            ))
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}

export default StandingOrdersDrawer;
