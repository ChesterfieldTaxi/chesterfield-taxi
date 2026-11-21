import React from 'react';
import type {
  DayOfWeek,
  DriverProfile,
  DriverScheduleConfig,
} from '../../../core/types/driver';
import type { Trip } from '../../../core/types/trip';
import type { DriverPayoutRecord } from '../../../core/types/payment';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { formatLocalDateStr } from '../../../core/services/pricing/vehicle-matching';
import {
  CalendarIcon,
  DollarSignIcon,
  PhoneIcon,
  SpinnerIcon,
  XIcon,
} from '../../ui/Icons';

const DAYS_ORDER: { key: DayOfWeek; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

export interface DriverEarningsHistoryPaneProps {
  mode: 'earnings' | 'schedule';
  driver: DriverProfile | null;
  globalCommissionRate: number;
  payoutHistory: DriverPayoutRecord[];
  completedTrips: Trip[];
  // Schedule / working hours state & handlers
  scheduleConfig: DriverScheduleConfig;
  isScheduleDirty: boolean;
  newTimeOffStart: string;
  newTimeOffEnd: string;
  newTimeOffReason: string;
  isSavingSchedule: boolean;
  onToggleDay: (day: DayOfWeek) => void;
  onTimeChange: (day: DayOfWeek, field: 'startHour' | 'endHour', value: string) => void;
  onSetNewTimeOffStart: (date: string) => void;
  onSetNewTimeOffEnd: (date: string) => void;
  onSetNewTimeOffReason: (reason: string) => void;
  onAddTimeOff: () => void;
  onRemoveTimeOff: (id: string) => void;
  onSaveSchedule: () => void;
}

export const DriverEarningsHistoryPane = React.memo(function DriverEarningsHistoryPane({
  mode,
  driver,
  globalCommissionRate,
  payoutHistory,
  completedTrips,
  scheduleConfig,
  isScheduleDirty,
  newTimeOffStart,
  newTimeOffEnd,
  newTimeOffReason,
  isSavingSchedule,
  onToggleDay,
  onTimeChange,
  onSetNewTimeOffStart,
  onSetNewTimeOffEnd,
  onSetNewTimeOffReason,
  onAddTimeOff,
  onRemoveTimeOff,
  onSaveSchedule,
}: DriverEarningsHistoryPaneProps) {
  const todayStr = formatLocalDateStr(new Date());

  if (mode === 'earnings') {
    const todaysPayouts = payoutHistory.filter((p) => {
      const pDate = p.createdAt ? formatLocalDateStr(new Date(p.createdAt)) : '';
      return pDate === todayStr;
    });
    const todaysEarningsTotal = todaysPayouts.reduce(
      (sum, p) => sum + (p.driverShare + p.tipAmount + p.tollsReimbursed),
      0
    );
    const totalCompanyOwesDriver = payoutHistory
      .filter((p) => p.status === 'pending' && p.settlementDirection !== 'driver_owes_company')
      .reduce((sum, p) => sum + Math.max(0, p.netPayout), 0);
    const totalDriverOwesCompany = payoutHistory
      .filter((p) => p.status === 'pending' && p.settlementDirection === 'driver_owes_company')
      .reduce((sum, p) => sum + Number(p.companyCommissionOwed || p.platformFee || 0), 0);

    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSignIcon className="w-5 h-5 text-emerald-400" />
              Earnings &amp; Settlement History
            </h2>
            <p className="text-xs text-slate-400">
              Split: {Math.round((driver?.commissionRate ?? globalCommissionRate) * 100)}% Fare + 100% Tolls &amp; Tips
            </p>
          </div>
          <a
            href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
            className="px-3 py-2 min-h-[40px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-300 font-bold text-xs rounded-xl flex items-center gap-1.5"
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            <span>Dispatch</span>
          </a>
        </div>

        {/* KPI Summary Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Today Earned</span>
            <span className="text-lg font-black font-mono text-emerald-400">
              ${todaysEarningsTotal.toFixed(2)}
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Payout Due</span>
            <span className="text-lg font-black font-mono text-blue-400">
              ${totalCompanyOwesDriver.toFixed(2)}
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Cash Comm.</span>
            <span className="text-lg font-black font-mono text-amber-400">
              ${totalDriverOwesCompany.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payout Records List */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Recent Completed Settlements ({payoutHistory.length})
          </span>

          {payoutHistory.length === 0 && completedTrips.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              No completed rides recorded yet. Completed Cash, Card Terminal, and Corporate rides appear here automatically.
            </p>
          ) : (
            <div className="space-y-2">
              {payoutHistory.slice(0, 25).map((p) => {
                const isCash = p.settlementDirection === 'driver_owes_company' || p.paymentMethod === 'cash';
                return (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className="font-mono text-blue-300">{p.tripId}</span>
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                            isCash
                              ? 'bg-amber-500/20 text-amber-300'
                              : p.paymentMethod === 'corporate_account'
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {(p.paymentMethod || 'card').replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Gross ${p.totalFare.toFixed(2)}
                        {p.tipAmount > 0 ? ` · Tip $${p.tipAmount.toFixed(2)}` : ''}
                        {p.tollsReimbursed > 0 ? ` · Tolls $${p.tollsReimbursed.toFixed(2)}` : ''}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(p.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isCash ? (
                        <>
                          <span className="block text-[10px] text-amber-400 font-bold uppercase">Comm. Due</span>
                          <span className="text-sm font-black font-mono text-amber-300">
                            -${(p.companyCommissionOwed || p.platformFee).toFixed(2)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block text-[10px] text-emerald-400 font-bold uppercase">Net Payout</span>
                          <span className="text-sm font-black font-mono text-emerald-400">
                            +${p.netPayout.toFixed(2)}
                          </span>
                        </>
                      )}
                      <span className="text-[9px] uppercase font-bold text-slate-500 block">{p.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            Availability &amp; Working Hours
          </h2>
          <p className="text-xs text-slate-400">
            Configure shift hours and advance days off for dispatch scheduling.
          </p>
        </div>
        {isScheduleDirty && (
          <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
            Unsaved
          </span>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
          Regular Weekly Shift Hours
        </span>

        <div className="space-y-2">
          {DAYS_ORDER.map(({ key, label }) => {
            const dayConfig = scheduleConfig.weeklyHours?.[key] || {
              enabled: false,
              startHour: '08:00',
              endHour: '17:00',
            };
            return (
              <div
                key={key}
                className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  dayConfig.enabled
                    ? 'bg-slate-950/80 border-slate-700/80'
                    : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                }`}
              >
                <label
                  htmlFor={`day-${key}`}
                  className="flex items-center gap-3 cursor-pointer select-none min-h-[40px]"
                >
                  <input
                    type="checkbox"
                    checked={dayConfig.enabled}
                    onChange={() => onToggleDay(key)}
                    id={`day-${key}`}
                    className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                  />
                  <span className="text-xs font-bold text-white">{label}</span>
                </label>

                {dayConfig.enabled ? (
                  <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                    <input
                      type="time"
                      value={dayConfig.startHour}
                      onChange={(e) => onTimeChange(key, 'startHour', e.target.value)}
                      className="flex-1 sm:flex-initial bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-2 outline-none text-xs text-center"
                    />
                    <span className="text-slate-400 text-xs px-1 shrink-0">to</span>
                    <input
                      type="time"
                      value={dayConfig.endHour}
                      onChange={(e) => onTimeChange(key, 'endHour', e.target.value)}
                      className="flex-1 sm:flex-initial bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-2 outline-none text-xs text-center"
                    />
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500 font-semibold italic">Off-duty / Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
          Advance Notice Days Off
        </span>

        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">From Date</label>
              <input
                type="date"
                min={todayStr}
                value={newTimeOffStart}
                onChange={(e) => onSetNewTimeOffStart(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">To Date</label>
              <input
                type="date"
                min={newTimeOffStart || todayStr}
                value={newTimeOffEnd}
                onChange={(e) => onSetNewTimeOffEnd(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <input
            type="text"
            placeholder="Reason / Note (e.g. Doctor appt, Vacation)"
            value={newTimeOffReason}
            onChange={(e) => onSetNewTimeOffReason(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-600"
          />

          <button
            type="button"
            onClick={onAddTimeOff}
            className="w-full py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-400 font-bold text-xs rounded-xl cursor-pointer"
          >
            + Add Advance Notice Days Off
          </button>
        </div>

        {scheduleConfig.timeOffList && scheduleConfig.timeOffList.length > 0 ? (
          <div className="space-y-2 pt-1">
            {scheduleConfig.timeOffList.map((to) => (
              <div
                key={to.id}
                className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-white">
                    {to.startDate} to {to.endDate}
                  </div>
                  {to.reason && <p className="text-[11px] text-slate-400 mt-0.5">{to.reason}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveTimeOff(to.id)}
                  className="w-10 h-10 text-rose-400 hover:bg-rose-500/10 rounded-xl flex items-center justify-center cursor-pointer"
                  title="Remove time off"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No scheduled days off registered.</p>
        )}

        <div className="pt-3 border-t border-slate-800">
          <button
            type="button"
            disabled={isSavingSchedule}
            onClick={onSaveSchedule}
            className="w-full py-3.5 min-h-[48px] bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl shadow-xl cursor-pointer flex items-center justify-center gap-2"
          >
            {isSavingSchedule ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : null}
            <span>SAVE AVAILABILITY &amp; CALENDAR</span>
          </button>
        </div>
      </div>
    </section>
  );
});
