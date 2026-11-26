import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Badge } from '../../../ui/Badge';
import { Select } from '../../../ui/Select';
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
  DispatchDefaultQueueStatusFilter,
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
      <Card className="border border-border-subtle shadow-xs bg-surface-card">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-fg-primary flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                <span>Duplicate &amp; Future Schedule Conflict Guard</span>
              </CardTitle>
              <p className="text-xs text-fg-muted mt-0.5">
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
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-status-info-border bg-status-info-bg/40 cursor-pointer">
            <div>
              <span className="font-extrabold text-fg-primary block text-xs">
                Enable Dispatch Booking Conflict Guard
              </span>
              <span className="text-[11px] text-fg-secondary mt-0.5 block">
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
            <div className="p-4 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">
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
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">
                Clamped 15–360m (default 90m). Flags another scheduled ride for the same passenger.
              </span>
            </div>

            <div className="p-4 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">
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
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">
                Clamped 5–120m (default 15m). Warns when assigned/staged legs leave less turnaround gap.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Dispatch Workspace Defaults & Live Map Polylines */}
      <Card className="border border-border-subtle shadow-xs bg-surface-card">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-black text-fg-primary flex items-center gap-2">
                <SlidersIcon className="w-5 h-5 text-indigo-600" />
                <span>Workspace Ergonomics &amp; Live Map Route Polylines</span>
              </CardTitle>
              <p className="text-xs text-fg-muted mt-0.5">
                Default queue presentation, draft tab capacity, post-create reset, and Google Directions road polylines.
              </p>
            </div>
            {consoleConfig.enableRealtimeRouting ? (
              <Badge
                variant="success"
                className="self-start sm:self-auto bg-status-success-bg text-status-success-fg border-status-success-border font-bold text-[11px]"
              >
                Live Directions Active
              </Badge>
            ) : (
              <Badge
                variant="warning"
                className="self-start sm:self-auto bg-status-warning-bg text-status-warning-fg border-status-warning-border font-bold text-[11px]"
              >
                Zero-Cost Mock Curvature
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-5 text-xs">
          {/* Default Queue Layout */}
          <div className="space-y-2">
            <label className="font-bold text-fg-strong block">
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
                        ? 'border-blue-600 bg-status-info-bg/70 ring-1 ring-blue-500/20'
                        : 'border-border-subtle bg-surface-card hover:border-border-strong'
                    }`}
                  >
                    <div className="font-extrabold text-fg-primary flex items-center justify-between">
                      <span>{opt.label}</span>
                      {selected && <CheckIcon className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <div className="text-[10px] text-fg-muted mt-0.5">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex items-start justify-between gap-3 p-4 bg-surface-subtle border border-border-subtle rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-fg-primary block">
                  Auto-Clear Booking Form After Create
                </span>
                <span className="text-[11px] text-fg-muted mt-0.5 block">
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

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-bold text-fg-primary block mb-1">
                Default Queue Status Filter
              </label>
              <Select
                size="sm"
                value={consoleConfig.defaultQueueStatusFilter || 'active_only'}
                onValueChange={(val) =>
                  updateConsole({
                    defaultQueueStatusFilter: val as DispatchDefaultQueueStatusFilter,
                  })
                }
              >
                <option value="active_only">Active Only (Hide Closed)</option>
                <option value="all">All Statuses (Include Closed)</option>
              </Select>
              <span className="text-[10px] text-fg-muted mt-1 block">
                Active Only hides Completed, Cancelled &amp; Declined on initial load.
              </span>
            </div>

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-bold text-fg-primary block mb-1">
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
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">
                Maximum simultaneous booking/edit tabs open in the Dispatch left sidebar (default 8).
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex items-start justify-between gap-3 p-4 bg-surface-subtle border border-border-subtle rounded-xl cursor-pointer">
              <div>
                <span className="font-bold text-fg-primary block">
                  Show Queue Flight Badge
                </span>
                <span className="text-[11px] text-fg-muted mt-0.5 block">
                  Display flight number &amp; origin/terminal badge on Trips Queue rows.
                </span>
              </div>
              <input
                type="checkbox"
                checked={consoleConfig.showQueueFlightBadge !== false}
                onChange={(e) => updateConsole({ showQueueFlightBadge: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-blue-600 cursor-pointer"
              />
            </label>

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-bold text-fg-primary block mb-1">
                Flight Badge Format
              </label>
              <Select
                size="sm"
                value={consoleConfig.flightBadgeFormat || 'ident_from_origin'}
                onValueChange={(val) =>
                  updateConsole({
                    flightBadgeFormat: val as DispatchConsoleSettingsConfig['flightBadgeFormat'],
                  })
                }
              >
                <option value="ident_from_origin">WN#1234 from SLC</option>
                <option value="ident_terminal">WN#1234 · STL T2</option>
                <option value="origin_only">SLC (Origin Only)</option>
              </Select>
              <span className="text-[10px] text-fg-muted mt-1 block">
                Default label format in Trips Queue (dispatchers can override locally).
              </span>
            </div>

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-bold text-fg-primary block mb-1">
                Flight Badge Placement
              </label>
              <Select
                size="sm"
                value={consoleConfig.flightBadgePlacement || 'stacked'}
                onValueChange={(val) =>
                  updateConsole({
                    flightBadgePlacement: val as DispatchConsoleSettingsConfig['flightBadgePlacement'],
                  })
                }
              >
                <option value="stacked">Stacked Under Pickup Time</option>
                <option value="inline">Inline Next to Pickup Time</option>
              </Select>
              <span className="text-[10px] text-fg-muted mt-1 block">
                Stacked keeps flight info under the timestamp; inline keeps rows compact.
              </span>
            </div>
          </div>

          {/* Relocated Live Map Route Polylines (`enableRealtimeRouting`) */}
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-status-staged-border bg-status-staged-bg/40 cursor-pointer">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CompassIcon className="w-4 h-4 text-indigo-600" />
                <span className="font-extrabold text-fg-primary">
                  Live Google Maps Route Polylines &amp; Road Mileage (<code>enableRealtimeRouting</code>)
                </span>
              </div>
              <p className="text-[11px] text-fg-secondary leading-relaxed">
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

          {/* Baseline Dispatch Map Custom Overlay Defaults (All OFF by default) */}
          <div className="space-y-2 pt-2 border-t border-border-faint">
            <label className="font-bold text-fg-strong block">
              Default Dispatch Map Overlays (Fallback Before Local Operator Preference)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(
                [
                  { key: 'defaultShowZonesOverlay', label: 'Zones Overlay', hint: 'Service zone polygons & circles' },
                  { key: 'defaultShowTrafficOverlay', label: 'Live Traffic', hint: 'Google real-time road speeds' },
                  { key: 'defaultShowPlacesOverlay', label: 'Places & Hubs', hint: 'Airports, hotels, hospitals & POIs' },
                  { key: 'defaultShowExclusionsOverlay', label: 'Exclusions', hint: 'Blocked & review safety circles' },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="p-3 rounded-xl border border-border-subtle bg-surface-subtle/70 hover:bg-surface-subtle flex items-start justify-between gap-2 cursor-pointer"
                >
                  <div>
                    <span className="font-extrabold text-fg-primary block">{item.label}</span>
                    <span className="text-[10px] text-fg-muted mt-0.5 block">{item.hint}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(consoleConfig[item.key])}
                    onChange={(e) => updateConsole({ [item.key]: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded text-indigo-600 cursor-pointer shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* SLA Thresholds */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2 border-t border-border-faint">
            <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">SLA Warning Lead (Minutes)</label>
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
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">Amber warning badge threshold</span>
            </div>

            <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">SLA Critical Lead (Minutes)</label>
              <Input
                type="number"
                min={1}
                max={720}
                value={dispatchAutomation.slaCriticalMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    slaCriticalMinutes: parseInt(e.target.value, 10) || 15,
                  })
                }
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">Critical alert badge threshold</span>
            </div>

            <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">Airport Extra Buffer (Minutes)</label>
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
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">Added for STL / SUS / CPS pickups</span>
            </div>

            <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">Airport Arrival Buffer (Minutes)</label>
              <Input
                type="number"
                min={0}
                max={180}
                value={dispatchAutomation.airportPickupBufferMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    airportPickupBufferMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">Added after flight arrival (default 30m)</span>
            </div>

            <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle">
              <label className="font-bold text-fg-strong block mb-1">ASAP Unassigned Grace (Minutes)</label>
              <Input
                type="number"
                min={1}
                max={120}
                value={dispatchAutomation.asapUnassignedGraceMinutes}
                onChange={(e) =>
                  onChangeAutomation({
                    ...dispatchAutomation,
                    asapUnassignedGraceMinutes: parseInt(e.target.value, 10) || 15,
                  })
                }
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">Orange grace before red (default 15m)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
