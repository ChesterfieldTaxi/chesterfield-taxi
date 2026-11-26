import React, { useState } from 'react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import {
  CalendarIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  RepeatIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../../ui/Icons';
import {
  buildUsFederalHolidaysForYear,
  type DispatchAutomationConfig,
  type StandingOrderDefaultHorizonDays,
  type StandingOrdersGovernanceConfig,
} from '../../../../core/types/config';

export interface StandingOrderDefaultsPanelProps {
  standingConfig: StandingOrdersGovernanceConfig;
  dispatchAutomation: DispatchAutomationConfig;
  isSaving: boolean;
  onChangeStandingConfig: (next: StandingOrdersGovernanceConfig) => void;
  onChangeAutomation: (next: DispatchAutomationConfig) => void;
  onSave: () => void | Promise<void>;
}

export function StandingOrderDefaultsPanel({
  standingConfig,
  dispatchAutomation,
  isSaving,
  onChangeStandingConfig,
  onChangeAutomation,
  onSave,
}: StandingOrderDefaultsPanelProps) {
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const updateStanding = (partial: Partial<StandingOrdersGovernanceConfig>) => {
    onChangeStandingConfig({ ...standingConfig, ...partial });
  };

  const handleAddHoliday = () => {
    const cleanDate = newHolidayDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return;
    const cleanName = newHolidayName.trim() || 'Observed Holiday';
    const filtered = standingConfig.holidayCalendarDates.filter((h) => h.date !== cleanDate);
    const next = [...filtered, { date: cleanDate, name: cleanName }].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    updateStanding({ holidayCalendarDates: next });
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const handleRemoveHoliday = (dateStr: string) => {
    updateStanding({
      holidayCalendarDates: standingConfig.holidayCalendarDates.filter((h) => h.date !== dateStr),
    });
  };

  const handleLoadUsFederalHolidays = () => {
    const baseYear = new Date().getFullYear();
    const presets = [
      ...buildUsFederalHolidaysForYear(baseYear),
      ...buildUsFederalHolidaysForYear(baseYear + 1),
    ];
    const byDate = new Map(standingConfig.holidayCalendarDates.map((h) => [h.date, h]));
    for (const preset of presets) {
      byDate.set(preset.date, preset);
    }
    const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    updateStanding({ holidayCalendarDates: merged });
  };

  return (
    <div className="space-y-6">
      {/* 1. Standing Order Horizon & Preferred Driver Defaults */}
      <Card className="border border-border-subtle shadow-xs bg-surface-card">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-fg-primary flex items-center gap-2">
                <RepeatIcon className="w-5 h-5 text-emerald-600" />
                <span>Standing Order &amp; Staged Preferred Driver Defaults</span>
              </CardTitle>
              <p className="text-xs text-fg-muted mt-0.5">
                Default rolling horizon windows, preferred driver staging mode, and automatic pre-pickup release.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/app/admin?tab=trips&sub=standing-orders"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle bg-surface-card hover:bg-surface-subtle text-xs font-bold text-fg-secondary transition-colors"
              >
                <span>Open Standing Orders</span>
                <ExternalLinkIcon className="w-3.5 h-3.5 text-fg-subtle" />
              </Link>
              <Button
                variant="primary"
                onClick={onSave}
                disabled={isSaving}
                className="text-xs font-bold px-4 py-2 cursor-pointer"
              >
                {isSaving ? (
                  <SpinnerIcon className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <CheckIcon className="w-4 h-4 mr-1.5" />
                )}
                Save Standing Defaults
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-5 text-xs">
          {/* Horizon Defaults */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl space-y-2">
              <label className="font-extrabold text-fg-primary block">
                Default Generation Horizon
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([7, 14, 30] as StandingOrderDefaultHorizonDays[]).map((days) => {
                  const active = standingConfig.defaultHorizonDays === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => updateStanding({ defaultHorizonDays: days })}
                      className={`py-2 px-3 rounded-lg border font-extrabold text-xs transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-surface-card text-fg-secondary border-border-strong hover:bg-surface-muted'
                      }`}
                    >
                      {days} Days
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] text-fg-muted block">
                Default rolling window used when extending a series without an explicit occurrence count.
              </span>
            </div>

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-extrabold text-fg-primary block mb-1">
                Max Horizon Ceiling (Days, 7–180)
              </label>
              <Input
                type="number"
                min={7}
                max={180}
                value={standingConfig.maxHorizonDays}
                onChange={(e) =>
                  updateStanding({ maxHorizonDays: parseInt(e.target.value, 10) || 60 })
                }
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">
                Upper cap on trips/days generated in a single horizon extension batch (default 60).
              </span>
            </div>
          </div>

          {/* Default Preferred Driver Mode */}
          <div className="space-y-2">
            <label className="font-extrabold text-fg-primary block">
              Default Preferred Driver Assignment Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => updateStanding({ defaultAssignmentMode: 'stage_hold' })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  standingConfig.defaultAssignmentMode === 'stage_hold'
                    ? 'border-indigo-500 bg-status-staged-bg/70 ring-1 ring-indigo-500/20'
                    : 'border-border-subtle bg-surface-card hover:border-border-strong'
                }`}
              >
                <div className="font-extrabold text-fg-primary flex items-center justify-between">
                  <span>📌 Stage / Hold in Dispatch (Recommended)</span>
                  {standingConfig.defaultAssignmentMode === 'stage_hold' && (
                    <CheckIcon className="w-4 h-4 text-indigo-600" />
                  )}
                </div>
                <p className="text-[11px] text-fg-secondary mt-1">
                  Reserves the preferred driver on the Dispatch Shift Planner with zero Driver App visibility until inside the auto-release lead window.
                </p>
              </button>

              <button
                type="button"
                onClick={() => updateStanding({ defaultAssignmentMode: 'send_to_driver' })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  standingConfig.defaultAssignmentMode === 'send_to_driver'
                    ? 'border-emerald-600 bg-status-success-bg/70 ring-1 ring-emerald-500/20'
                    : 'border-border-subtle bg-surface-card hover:border-border-strong'
                }`}
              >
                <div className="font-extrabold text-fg-primary flex items-center justify-between">
                  <span>Send to Driver Immediately</span>
                  {standingConfig.defaultAssignmentMode === 'send_to_driver' && (
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-[11px] text-fg-secondary mt-1">
                  Assigns generated future rides directly to the preferred driver&apos;s Scheduled queue immediately.
                </p>
              </button>
            </div>
          </div>

          {/* Staged Auto-Release Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border-faint">
            <label className="flex items-start justify-between gap-3 p-4 bg-status-success-bg/50 border border-status-success-border rounded-xl cursor-pointer">
              <div>
                <span className="font-extrabold text-fg-primary block">
                  Auto-Release Staged Preferred Drivers
                </span>
                <span className="text-[11px] text-fg-secondary mt-0.5 block">
                  Automatically send staged recurring/shift trips to their planned driver once inside the lead window.
                </span>
              </div>
              <input
                type="checkbox"
                checked={dispatchAutomation.autoReleaseStagedDrivers}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    autoReleaseStagedDrivers: e.target.checked,
                  })
                }
                className="w-4 h-4 mt-0.5 rounded text-emerald-600 cursor-pointer"
              />
            </label>

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-extrabold text-fg-primary block mb-1">
                Staged Auto-Release Lead Window (Minutes)
              </label>
              <Input
                type="number"
                min={15}
                max={240}
                value={dispatchAutomation.stagedAutoReleaseLeadMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    stagedAutoReleaseLeadMinutes: parseInt(e.target.value, 10) || 45,
                  })
                }
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">
                Clamped 15–240 minutes prior to scheduled pickup (default 45m).
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Shared Holiday Skip Calendar */}
      <Card className="border border-border-subtle shadow-xs bg-surface-card">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-fg-primary flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-amber-600" />
                <span>Shared Holiday Skip Calendar</span>
              </CardTitle>
              <p className="text-xs text-fg-muted mt-0.5">
                Automatically excluded on recurring commute, medical dialysis, and school/corporate shuttle series when Holiday Skip is enabled.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadUsFederalHolidays}
              className="text-xs font-bold bg-surface-card cursor-pointer shrink-0"
            >
              Load US Federal Holidays
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4 text-xs">
          <label className="flex items-start justify-between gap-3 p-3.5 bg-status-warning-bg/60 border border-status-warning-border rounded-xl cursor-pointer">
            <div>
              <span className="font-extrabold text-fg-primary block">
                Exclude Holiday Calendar Dates by Default on New Series
              </span>
              <span className="text-[11px] text-fg-secondary mt-0.5 block">
                Merges the dates below into <code>skipDates</code> automatically when registering or extending holiday-aware Standing Orders.
              </span>
            </div>
            <input
              type="checkbox"
              checked={standingConfig.defaultSkipHolidays}
              onChange={(e) => updateStanding({ defaultSkipHolidays: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded text-amber-600 cursor-pointer"
            />
          </label>

          {/* Add Holiday Form */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 p-3.5 bg-surface-subtle border border-border-subtle rounded-xl">
            <div className="w-full sm:w-44">
              <label className="font-bold text-fg-secondary block mb-1 text-[11px]">
                Holiday Date (YYYY-MM-DD)
              </label>
              <Input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="bg-surface-card h-9 text-xs font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="font-bold text-fg-secondary block mb-1 text-[11px]">
                Holiday Label
              </label>
              <Input
                type="text"
                placeholder="e.g. Thanksgiving Day / Clinic Closure"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                className="bg-surface-card h-9 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={handleAddHoliday}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(newHolidayDate.trim())}
              className="h-9 px-4 text-xs font-bold shrink-0 cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 mr-1" />
              Add Date
            </Button>
          </div>

          {/* Holiday Chips / List */}
          {standingConfig.holidayCalendarDates.length === 0 ? (
            <div className="p-6 text-center text-fg-subtle border border-dashed border-border-subtle rounded-xl">
              No shared holiday dates configured. Click &ldquo;Load US Federal Holidays&rdquo; or add a custom date above.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {standingConfig.holidayCalendarDates.map((item) => (
                <div
                  key={item.date}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-extrabold text-xs text-fg-primary">
                      {item.date}
                    </div>
                    <div className="text-[11px] text-fg-secondary truncate">{item.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveHoliday(item.date)}
                    className="p-1.5 rounded-lg text-fg-subtle hover:text-rose-600 hover:bg-status-danger-bg transition-colors cursor-pointer shrink-0"
                    title={`Remove ${item.date}`}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
