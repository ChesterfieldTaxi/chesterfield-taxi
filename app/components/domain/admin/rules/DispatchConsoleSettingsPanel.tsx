import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Badge } from '../../../ui/Badge';
import {
  CheckIcon,
  CompassIcon,
  ShieldCheckIcon,
  SlidersIcon,
  SpinnerIcon,
} from '../../../ui/Icons';
import type {
  DispatchAutomationConfig,
  DispatchConsoleSettingsConfig,
  DispatchQueueLayoutMode,
} from '../../../../core/types/config';

export interface DispatchConsoleSettingsPanelProps {
  consoleConfig: DispatchConsoleSettingsConfig;
  dispatchAutomation: DispatchAutomationConfig;
  isSaving: boolean;
  onChangeConsoleConfig: (next: DispatchConsoleSettingsConfig) => void;
  onChangeAutomation: (next: DispatchAutomationConfig) => void;
  onSave: () => void | Promise<void>;
}

const QUEUE_LAYOUT_OPTIONS: Array<{
  value: DispatchQueueLayoutMode;
  label: string;
  hint: string;
}> = [
  { value: 'auto', label: 'Auto (Responsive)', hint: 'Switches Table ↔ Cards below 920px' },
  { value: 'table', label: '10-Column Table', hint: 'Always keep dense dispatcher table' },
  { value: 'cards', label: 'Tactical Cards', hint: 'Multi-line route & status cards' },
  { value: 'compact', label: 'Compact List', hint: 'High-density single-row queue' },
];

export function DispatchConsoleSettingsPanel({
  consoleConfig,
  dispatchAutomation,
  isSaving,
  onChangeConsoleConfig,
  onChangeAutomation,
  onSave,
}: DispatchConsoleSettingsPanelProps) {
  const updateConsole = (partial: Partial<DispatchConsoleSettingsConfig>) => {
    onChangeConsoleConfig({ ...consoleConfig, ...partial });
  };

  return (
    <div className="space-y-6">
      {/* 1. Duplicate & Future Schedule Conflict Guard */}
      <Card className="border border-slate-200 shadow-xs bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                <span>Duplicate &amp; Future Schedule Conflict Guard</span>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Live pre-submission checks in <code>/app/dispatch</code> for duplicate passenger bookings and driver turnaround overlaps.
              </p>
            </div>
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
              Save Console Policy
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-5 text-xs">
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-blue-200 bg-blue-50/40 cursor-pointer">
            <div>
              <span className="font-extrabold text-slate-900 block text-xs">
                Enable Dispatch Booking Conflict Guard
              </span>
              <span className="text-[11px] text-slate-600 mt-0.5 block">
                Warns dispatchers before creating duplicate passenger rides, overlapping trips, or conflicting driver shift assignments.
              </span>
            </div>
            <input
              type="checkbox"
              checked={consoleConfig.conflictGuardEnabled}
              onChange={(e) => updateConsole({ conflictGuardEnabled: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded text-blue-600 cursor-pointer"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="font-bold text-slate-800 block mb-1">
                Passenger Nearby Ride Window (Minutes)
              </label>
              <Input
                type="number"
                min={15}
                max={360}
                disabled={!consoleConfig.conflictGuardEnabled}
                value={consoleConfig.nearbyWindowMinutes}
                onChange={(e) =>
                  updateConsole({
                    nearbyWindowMinutes: parseInt(e.target.value, 10) || 90,
                  })
                }
                className="bg-white h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Clamped 15–360m (default 90m). Flags another scheduled ride for the same passenger.
              </span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="font-bold text-slate-800 block mb-1">
                Driver Tight-Turnaround Buffer (Minutes)
              </label>
              <Input
                type="number"
                min={5}
                max={120}
                disabled={!consoleConfig.conflictGuardEnabled}
                value={consoleConfig.tightTurnaroundMinutes}
                onChange={(e) =>
                  updateConsole({
                    tightTurnaroundMinutes: parseInt(e.target.value, 10) || 15,
                  })
                }
                className="bg-white h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Clamped 5–120m (default 15m). Warns when assigned/staged legs leave less turnaround gap.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Dispatch Workspace Defaults & Live Map Polylines */}
      <Card className="border border-slate-200 shadow-xs bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                <SlidersIcon className="w-5 h-5 text-indigo-600" />
                <span>Workspace Ergonomics &amp; Live Map Route Polylines</span>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Default queue presentation, draft tab capacity, post-create reset, and Google Directions road polylines.
              </p>
            </div>
            {consoleConfig.enableRealtimeRouting ? (
              <Badge
                variant="success"
                className="self-start sm:self-auto bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[11px]"
              >
                Live Directions Active
              </Badge>
            ) : (
              <Badge
                variant="warning"
                className="self-start sm:self-auto bg-amber-50 text-amber-700 border-amber-200 font-bold text-[11px]"
              >
                Zero-Cost Mock Curvature
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-5 text-xs">
          {/* Default Queue Layout */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 block">
              Default Queue Layout (Fallback Before Local Operator Preference)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {QUEUE_LAYOUT_OPTIONS.map((opt) => {
                const selected = consoleConfig.defaultQueueLayout === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateConsole({ defaultQueueLayout: opt.value })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-extrabold text-slate-900 flex items-center justify-between">
                      <span>{opt.label}</span>
                      {selected && <CheckIcon className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-slate-900 block">
                  Auto-Clear Booking Form After Create
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Clears passenger &amp; route fields immediately after creating a new trip so the desk is ready for the next call.
                </span>
              </div>
              <input
                type="checkbox"
                checked={consoleConfig.autoClearFormAfterCreate}
                onChange={(e) => updateConsole({ autoClearFormAfterCreate: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-blue-600 cursor-pointer"
              />
            </label>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="font-bold text-slate-900 block mb-1">
                Max Concurrent Draft Tabs (2–20)
              </label>
              <Input
                type="number"
                min={2}
                max={20}
                value={consoleConfig.maxConcurrentDraftTabs}
                onChange={(e) =>
                  updateConsole({
                    maxConcurrentDraftTabs: parseInt(e.target.value, 10) || 8,
                  })
                }
                className="bg-white h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Maximum simultaneous booking/edit tabs open in the Dispatch left sidebar (default 8).
              </span>
            </div>
          </div>

          {/* Relocated Live Map Route Polylines (`enableRealtimeRouting`) */}
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 cursor-pointer">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CompassIcon className="w-4 h-4 text-indigo-600" />
                <span className="font-extrabold text-slate-900">
                  Live Google Maps Route Polylines &amp; Road Mileage (<code>enableRealtimeRouting</code>)
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                When enabled, route quotes and live Dispatch map polylines compute turn-by-turn road mileage and real-time traffic via Google Directions API. When disabled, offline Haversine curvature (&times;1.25) is used to save API usage in non-production environments.
              </p>
            </div>
            <input
              type="checkbox"
              checked={consoleConfig.enableRealtimeRouting}
              onChange={(e) => updateConsole({ enableRealtimeRouting: e.target.checked })}
              className="w-5 h-5 mt-0.5 rounded text-indigo-600 cursor-pointer shrink-0"
            />
          </label>

          {/* SLA Thresholds */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <label className="font-bold text-slate-800 block mb-1">SLA Warning Lead (Minutes)</label>
              <Input
                type="number"
                min={5}
                max={720}
                value={dispatchAutomation.slaWarningMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    slaWarningMinutes: parseInt(e.target.value, 10) || 60,
                  })
                }
                className="bg-white h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Amber warning badge threshold</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <label className="font-bold text-slate-800 block mb-1">SLA Critical Lead (Minutes)</label>
              <Input
                type="number"
                min={1}
                max={720}
                value={dispatchAutomation.slaCriticalMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    slaCriticalMinutes: parseInt(e.target.value, 10) || 30,
                  })
                }
                className="bg-white h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Critical alert badge threshold</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <label className="font-bold text-slate-800 block mb-1">Airport Extra Buffer (Minutes)</label>
              <Input
                type="number"
                min={0}
                max={180}
                value={dispatchAutomation.airportExtraLeadMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    airportExtraLeadMinutes: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="bg-white h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Added for STL / SUS / CPS pickups</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
