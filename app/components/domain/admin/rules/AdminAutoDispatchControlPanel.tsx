import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Badge } from '../../../ui/Badge';
import {
  BoltIcon, CheckIcon, ClockIcon, PlaneIcon, ShieldCheckIcon, SlidersIcon, UsersIcon,
} from '../../../ui/Icons';
import { getOperatorService, type OperatorUser } from '../../../../core/services/operator.service';
import type {
  ActiveAutoDispatchStrategyMode, DispatchAutomationConfig, DispatchAutomationMode,
  DispatchExhaustionFallbackMode, DispatchRankingStrategy,
} from '../../../../core/types/config';
import type { ZoneGeofence } from '../../../../core/types/zone';
import { AdminAutoDispatchSimulator } from './AdminAutoDispatchSimulator';

export interface AdminAutoDispatchControlPanelProps {
  config: DispatchAutomationConfig;
  zones: ZoneGeofence[];
  isSaving: boolean;
  onChange: (updated: DispatchAutomationConfig) => void;
  onSave: () => void | Promise<void>;
}

const MODE_CARDS: ReadonlyArray<{
  mode: DispatchAutomationMode; title: string; badge: string; description: string;
  accent: 'blue' | 'emerald' | 'indigo' | 'amber';
}> = [
  {
    mode: 'manual_1tap', title: '1-Tap Manual', badge: 'Dispatcher Controlled', accent: 'blue',
    description: 'Dispatchers review and trigger offers manually per ride or click "Auto-Dispatch Ready (N)" on demand.',
  },
  {
    mode: 'sequential_cascade', title: 'Sequential 1-by-1 Cascade', badge: 'Ordered Rollover', accent: 'emerald',
    description: 'Offers 1 ranked driver at a time inside the Pre-Pickup Lead Window, rolling over automatically on decline or timeout.',
  },
  {
    mode: 'broadcast_pool', title: 'Top-K Broadcast Pool', badge: 'Simultaneous Race', accent: 'indigo',
    description: 'Offers top K (2–8) eligible drivers simultaneously; atomic first-accept wins the ride immediately.',
  },
  {
    mode: 'direct_auto_assign', title: 'Direct Auto-Assign (#1 Driver)', badge: 'Zero-Wait Assign', accent: 'amber',
    description: 'Immediately assigns the #1 ranked eligible driver with a frozen vehicle snapshot and instant push alert.',
  },
];

function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h.toString().padStart(2, '0')}:00 (${h12}:00 ${suffix})`;
}

export function AdminAutoDispatchControlPanel({
  config,
  zones,
  isSaving,
  onChange,
  onSave,
}: AdminAutoDispatchControlPanelProps) {
  const [operators, setOperators] = useState<OperatorUser[]>([]);

  useEffect(() => {
    const svc = getOperatorService();
    const unsub = svc.subscribeToOperators((ops) => {
      setOperators([...ops]);
    });
    svc
      .getOperators()
      .then((ops) => setOperators([...ops]))
      .catch(() => {});
    return () => unsub();
  }, []);

  const staffLeadWindowOperators = useMemo(() => {
    return operators
      .filter((op) => {
        if (op.isArchived || op.status === 'suspended') return false;
        const roleSet = new Set(op.roles || [op.role]);
        return roleSet.has('admin') || roleSet.has('dispatcher');
      })
      .sort((a, b) => {
        const aIsAdmin = (a.roles || [a.role]).includes('admin') ? 0 : 1;
        const bIsAdmin = (b.roles || [b.role]).includes('admin') ? 0 : 1;
        return aIsAdmin - bIsAdmin;
      });
  }, [operators]);

  const update = (partial: Partial<DispatchAutomationConfig>) => {
    const nextMode = partial.dispatchMode ?? config.dispatchMode;
    onChange({
      ...config,
      ...partial,
      dispatchMode: nextMode,
      autoOfferOnConfirm: nextMode !== 'manual_1tap',
    });
  };

  const isDispatcherAuthorized = (op: OperatorUser): boolean => {
    const list = config.authorizedLeadWindowDispatcherIds || [];
    const emailLower = (op.email || '').trim().toLowerCase();
    return list.some(
      (entry) =>
        entry === op.uid || (emailLower && String(entry).trim().toLowerCase() === emailLower)
    );
  };

  const toggleDispatcherAuthorization = (op: OperatorUser) => {
    const current = config.authorizedLeadWindowDispatcherIds || [];
    const emailLower = (op.email || '').trim().toLowerCase();
    const currentlyGranted = isDispatcherAuthorized(op);

    if (currentlyGranted) {
      update({
        authorizedLeadWindowDispatcherIds: current.filter(
          (entry) =>
            entry !== op.uid &&
            (!emailLower || String(entry).trim().toLowerCase() !== emailLower)
        ),
      });
    } else {
      update({
        authorizedLeadWindowDispatcherIds: Array.from(new Set([...current, op.uid])),
      });
    }
  };

  const modeBadgeLabel =
    config.dispatchMode === 'manual_1tap'
      ? '1-TAP MANUAL'
      : config.isPaused
      ? `PAUSED (${config.dispatchMode.replace(/_/g, ' ').toUpperCase()})`
      : `AUTO-PILOT: ${config.dispatchMode.replace(/_/g, ' ').toUpperCase()}`;

  return (
    <Card className="border-2 border-status-info-border shadow-xs overflow-hidden bg-surface-card">
      {/* Control Center Header */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-status-info-bg via-status-staged-bg/60 to-surface-subtle border-b border-status-info-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-blue-600 text-white rounded-xl shrink-0 shadow-xs">
            <BoltIcon className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-black text-fg-primary">
              Intelligent Auto-Dispatch Control Center &amp; Pre-Pickup Lead Window
            </h3>
            <p className="text-xs text-fg-secondary font-medium">
              Configure 4 assignment modes, Pre-Pickup Lead-Window gating, authorized dispatcher overrides, candidate guardrails, and live dry-run simulation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {config.dispatchMode !== 'manual_1tap' && (
            <button
              type="button"
              onClick={() =>
                update({
                  isPaused: !config.isPaused,
                  pausedAt: !config.isPaused ? new Date().toISOString() : undefined,
                })
              }
              className={`px-3 py-1 rounded-full text-[11px] font-extrabold border transition-colors cursor-pointer ${
                config.isPaused
                  ? 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border hover:bg-status-warning-bg-strong'
                  : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-500'
              }`}
            >
              {config.isPaused ? '⏸ Auto-Pilot Paused (Resume)' : '⚡ Auto-Pilot Active (Pause)'}
            </button>
          )}
          <Badge
            variant={
              config.dispatchMode === 'manual_1tap'
                ? 'primary'
                : config.isPaused
                ? 'warning'
                : 'success'
            }
            size="sm"
            className="font-mono text-[10px]"
          >
            {modeBadgeLabel}
          </Badge>
        </div>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* 1. 4 Assignment Mode Selector Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-fg-strong">
              1. Primary Dispatch Assignment Mode
            </span>
            <span className="text-[11px] text-fg-muted font-medium">
              Unconfirmed Tier-2 rides are never auto-dispatched until human review confirms them.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MODE_CARDS.map((card) => {
              const isSelected = config.dispatchMode === card.mode;
              const activeBorder =
                card.accent === 'emerald'
                  ? 'border-emerald-600 bg-status-success-bg/60'
                  : card.accent === 'indigo'
                  ? 'border-indigo-600 bg-status-staged-bg/60'
                  : card.accent === 'amber'
                  ? 'border-amber-500 bg-status-warning-bg/60'
                  : 'border-blue-600 bg-status-info-bg/60';
              const activePill =
                card.accent === 'emerald'
                  ? 'bg-emerald-600 text-white'
                  : card.accent === 'indigo'
                  ? 'bg-indigo-600 text-white'
                  : card.accent === 'amber'
                  ? 'bg-amber-600 text-white'
                  : 'bg-blue-600 text-white';

              return (
                <button
                  key={card.mode}
                  type="button"
                  onClick={() =>
                    update({
                      dispatchMode: card.mode,
                      ...(card.mode !== 'manual_1tap' ? { sweepExecutionMode: card.mode } : {}),
                    })
                  }
                  className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    isSelected ? `${activeBorder} shadow-2xs` : 'border-border-subtle bg-surface-card hover:bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-fg-primary">{card.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isSelected ? activePill : 'bg-surface-muted text-fg-secondary'
                      }`}
                    >
                      {isSelected ? 'Active' : card.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-secondary mt-1.5 leading-relaxed">
                    {card.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Sweep Execution Mode Selector when 1-Tap Manual is active */}
          {config.dispatchMode === 'manual_1tap' && (
            <div className="p-3.5 rounded-xl border border-status-info-border bg-status-info-bg/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold text-fg-primary block">
                  On-Demand &ldquo;⚡ Auto-Dispatch Ready (N)&rdquo; Sweep Strategy
                </span>
                <span className="text-[11px] text-fg-secondary">
                  Choose which execution strategy runs when a dispatcher clicks the 1-click Ready Sweep button in Trips Queue.
                </span>
              </div>
              <Select
                size="sm"
                fullWidth={false}
                value={config.sweepExecutionMode}
                onChange={(e) =>
                  update({ sweepExecutionMode: e.target.value as ActiveAutoDispatchStrategyMode })
                }
                className="shrink-0"
              >
                <option value="sequential_cascade">Sequential 1-by-1 Cascade</option>
                <option value="broadcast_pool">Top-K Broadcast Pool</option>
                <option value="direct_auto_assign">Direct Auto-Assign (#1 Driver)</option>
              </Select>
            </div>
          )}
        </div>

        {/* 2. Pre-Pickup Lead Window, Staged Release & Authorized Dispatcher RBAC */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fg-strong">
            <ClockIcon className="w-4 h-4 text-blue-600" />
            <span>2. Pre-Pickup Lead Window &amp; Authorized Dispatcher Permissions</span>
          </div>

          <div className="p-4 rounded-xl border border-status-info-border/80 bg-status-info-bg/25 space-y-4">
            {/* ASAP & Scheduled Eligibility Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="p-3 rounded-xl bg-surface-card border border-border-subtle flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoDispatchAsapRides}
                  onChange={(e) => update({ autoDispatchAsapRides: e.target.checked })}
                  className="mt-0.5 rounded text-blue-600"
                />
                <div>
                  <span className="text-xs font-extrabold text-fg-primary block">
                    Auto-Dispatch ASAP Rides
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    Immediate rides enter dispatch immediately upon confirmation.
                  </span>
                </div>
              </label>

              <label className="p-3 rounded-xl bg-surface-card border border-border-subtle flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoDispatchScheduledRides}
                  onChange={(e) => update({ autoDispatchScheduledRides: e.target.checked })}
                  className="mt-0.5 rounded text-blue-600"
                />
                <div>
                  <span className="text-xs font-extrabold text-fg-primary block">
                    Auto-Dispatch Scheduled Rides
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    Held in CONFIRMED until T &minus; Lead Window arrives.
                  </span>
                </div>
              </label>

              <label className="p-3 rounded-xl bg-surface-card border border-border-subtle flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoReleaseStagedDrivers}
                  onChange={(e) => update({ autoReleaseStagedDrivers: e.target.checked })}
                  className="mt-0.5 rounded text-blue-600"
                />
                <div>
                  <span className="text-xs font-extrabold text-fg-primary block">
                    Auto-Release Staged Drivers
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    Automatically release pre-planned drivers inside release window.
                  </span>
                </div>
              </label>
            </div>

            {/* Lead Window Sliders & Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-fg-strong">
                    Pre-Pickup Lead Window (15–240m)
                  </label>
                  <span className="font-mono text-xs font-black text-status-info-fg bg-status-info-bg px-2 py-0.5 rounded">
                    {config.scheduledDispatchLeadMinutes}m
                  </span>
                </div>
                <input
                  type="range" min={15} max={240} step={5} value={config.scheduledDispatchLeadMinutes}
                  onChange={(e) => update({ scheduledDispatchLeadMinutes: parseInt(e.target.value, 10) || 45 })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <Input
                  type="number" min="15" max="240" value={config.scheduledDispatchLeadMinutes}
                  onChange={(e) => update({ scheduledDispatchLeadMinutes: parseInt(e.target.value, 10) || 45 })}
                  className="text-xs h-8 bg-surface-subtle"
                />
                <span className="text-[10px] text-fg-muted block leading-snug">
                  Rides hours, days, weeks, or months ahead stay untouched in CONFIRMED until T &minus; {config.scheduledDispatchLeadMinutes}m.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-2">
                <label className="text-xs font-bold text-status-info-fg flex items-center gap-1">
                  <PlaneIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Airport Extra Lead Buffer (0–180m)</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  max="180"
                  value={config.airportExtraLeadMinutes}
                  onChange={(e) =>
                    update({
                      airportExtraLeadMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="text-xs h-8 bg-surface-subtle"
                />
                <span className="text-[10px] text-fg-muted block leading-snug">
                  STL / SUS / CPS airport rides enter dispatch at{' '}
                  <strong className="text-fg-strong">
                    T &minus; {config.scheduledDispatchLeadMinutes + config.airportExtraLeadMinutes}m
                  </strong>
                  .
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface-card border border-border-subtle space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-fg-strong">
                    Staged Driver Release (15–240m)
                  </label>
                  <span className="font-mono text-xs font-black text-status-staged-fg bg-status-staged-bg px-2 py-0.5 rounded">
                    {config.stagedAutoReleaseLeadMinutes}m
                  </span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={240}
                  step={5}
                  value={config.stagedAutoReleaseLeadMinutes}
                  onChange={(e) =>
                    update({ stagedAutoReleaseLeadMinutes: parseInt(e.target.value, 10) || 45 })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <Input
                  type="number"
                  min="15"
                  max="240"
                  value={config.stagedAutoReleaseLeadMinutes}
                  onChange={(e) =>
                    update({ stagedAutoReleaseLeadMinutes: parseInt(e.target.value, 10) || 45 })
                  }
                  className="text-xs h-8 bg-surface-subtle"
                />
                <span className="text-[10px] text-fg-muted block leading-snug">
                  Lead minutes prior to pickup when pre-planned drivers receive their live dispatch offer/assignment.
                </span>
              </div>
            </div>

            {/* Authorized Dispatchers Checklist */}
            <div className="p-3.5 rounded-xl bg-surface-card border border-border-subtle space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="text-xs font-extrabold text-fg-primary block">
                      Authorized Dispatchers (Lead-Window Control)
                    </span>
                    <span className="text-[11px] text-fg-muted">
                      Administrators always have access. Grant specific dispatchers permission to adjust Lead Windows from the Dispatch Console ⚙️ menu.
                    </span>
                  </div>
                </div>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-status-staged-bg text-status-staged-fg border border-status-staged-border">
                  {config.authorizedLeadWindowDispatcherIds.length} Dispatcher(s) Authorized
                </span>
              </div>

              {staffLeadWindowOperators.length === 0 ? (
                <p className="text-[11px] text-fg-muted italic">
                  No active administrator or dispatcher operator profiles found.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                  {staffLeadWindowOperators.map((op) => {
                    const roleSet = new Set(op.roles || [op.role]);
                    const isAdminOp = roleSet.has('admin');
                    const checked = isAdminOp || isDispatcherAuthorized(op);
                    const nameLabel =
                      op.displayName ||
                      [op.firstName, op.lastName].filter(Boolean).join(' ').trim() ||
                      op.email;

                    if (isAdminOp) {
                      return (
                        <div
                          key={op.uid}
                          className="p-2.5 rounded-xl border border-status-staged-border bg-status-staged-bg/50 text-status-staged-fg flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">{nameLabel}</span>
                            <span className="text-[10px] text-status-staged-fg/80 block truncate">
                              {op.email}
                            </span>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-status-staged-bg-strong text-status-staged-fg border border-status-staged-border text-[10px] font-bold whitespace-nowrap shrink-0">
                            ✓ Always Authorized (Admin)
                          </span>
                        </div>
                      );
                    }

                    return (
                      <label
                        key={op.uid}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          checked
                            ? 'border-indigo-400 bg-status-staged-bg/60 text-status-staged-fg'
                            : 'border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle text-fg-secondary'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDispatcherAuthorization(op)}
                            className="rounded text-indigo-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">{nameLabel}</span>
                            <span className="text-[10px] text-fg-muted block truncate">
                              {op.email}
                            </span>
                          </div>
                        </div>
                        {checked && (
                          <ShieldCheckIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Candidate Guardrails, Cascade/Pool Timing & Operating Schedule */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fg-strong">
            <SlidersIcon className="w-4 h-4 text-emerald-600" />
            <span>3. Candidate Guardrails, Pool/Cascade Timing &amp; Operating Schedule</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 p-4 rounded-xl border border-border-subtle bg-surface-subtle/50">
            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Candidate Ranking Strategy
              </label>
              <Select
                size="sm"
                value={config.rankingStrategy}
                onChange={(e) =>
                  update({ rankingStrategy: e.target.value as DispatchRankingStrategy })
                }
              >
                <option value="nearest_in_zone">Nearest Distance</option>
                <option value="longest_idle_in_zone">Longest Idle (Fair Queue)</option>
                <option value="highest_driver_score">Highest Driver Score</option>
              </Select>
              <label className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-fg-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.strictZoneFirst}
                  onChange={(e) => update({ strictZoneFirst: e.target.checked })}
                  className="rounded text-blue-600"
                />
                <span>Strict Pickup Zone First</span>
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Max Pickup Radius (0 = Unlimited)
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={config.maxPickupRadiusMiles}
                onChange={(e) =>
                  update({ maxPickupRadiusMiles: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                className="text-xs h-9 bg-surface-card"
              />
              <span className="text-[10px] text-fg-muted block">
                {config.maxPickupRadiusMiles === 0
                  ? 'Unlimited distance radius'
                  : `Excludes drivers > ${config.maxPickupRadiusMiles} mi away`}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Minimum Driver Score (0–100)
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={config.minDriverScore}
                onChange={(e) =>
                  update({ minDriverScore: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                className="text-xs h-9 bg-surface-card"
              />
              <span className="text-[10px] text-fg-muted block">
                {config.minDriverScore === 0
                  ? 'All active non-blacklisted scores eligible'
                  : `Requires score >= ${config.minDriverScore}`}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Max GPS Stale Seconds (0 = Allow No-GPS)
              </label>
              <Input
                type="number"
                min="0"
                max="3600"
                value={config.maxGpsStaleSeconds}
                onChange={(e) =>
                  update({ maxGpsStaleSeconds: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                className="text-xs h-9 bg-surface-card"
              />
              <span className="text-[10px] text-fg-muted block">
                {config.maxGpsStaleSeconds === 0
                  ? 'Allows on-duty drivers without GPS'
                  : `Requires GPS ping within ${config.maxGpsStaleSeconds}s`}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Offer Timeout per Step (15–180s)
              </label>
              <Input
                type="number"
                min="15"
                max="180"
                value={config.offerTimeoutSeconds}
                onChange={(e) =>
                  update({ offerTimeoutSeconds: parseInt(e.target.value, 10) || 45 })
                }
                className="text-xs h-9 bg-surface-card"
              />
              <span className="text-[10px] text-fg-muted block">
                Countdown before rolling over to next driver/batch.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Max Cascade / Batch Attempts (1–10)
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                value={config.maxCascadeAttempts}
                onChange={(e) =>
                  update({ maxCascadeAttempts: parseInt(e.target.value, 10) || 3 })
                }
                className="text-xs h-9 bg-surface-card"
              />
              <span className="text-[10px] text-fg-muted block">
                Sequential drivers or broadcast batches tried before exhaustion.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-status-staged-fg block">
                Broadcast Pool Size K (2–8 Cars)
              </label>
              <Input
                type="number"
                min="2"
                max="8"
                value={config.broadcastPoolSize}
                onChange={(e) =>
                  update({ broadcastPoolSize: parseInt(e.target.value, 10) || 3 })
                }
                className="text-xs h-9 bg-surface-card"
              />
              <span className="text-[10px] text-fg-muted block">
                Simultaneous drivers offered in Top-K Broadcast Pool mode.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-fg-secondary block">
                Fallback on Cascade Exhaustion
              </label>
              <Select
                size="sm"
                value={config.fallbackOnExhaustion}
                onChange={(e) =>
                  update({
                    fallbackOnExhaustion: e.target.value as DispatchExhaustionFallbackMode,
                  })
                }
              >
                <option value="alert_dispatch">Revert to CONFIRMED &amp; Alert Dispatch</option>
                <option value="broadcast_all_eligible">
                  Final Broadcast to All Eligible Drivers
                </option>
              </Select>
              <span className="text-[10px] text-fg-muted block">
                Action taken if all {config.maxCascadeAttempts} step(s) decline/timeout.
              </span>
            </div>
          </div>

          {/* Operating Hours Schedule & SLA Urgency Windows */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-card space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-fg-primary">
                  Auto-Pilot Operating Hours Schedule
                </span>
                <div className="inline-flex rounded-lg border border-border-subtle p-0.5 bg-surface-muted text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => update({ operatingHoursMode: 'always' })}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      config.operatingHoursMode === 'always'
                        ? 'bg-surface-card text-status-info-fg shadow-2xs'
                        : 'text-fg-secondary'
                    }`}
                  >
                    24/7 Always
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ operatingHoursMode: 'custom_window' })}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      config.operatingHoursMode === 'custom_window'
                        ? 'bg-surface-card text-status-staged-fg shadow-2xs'
                        : 'text-fg-secondary'
                    }`}
                  >
                    Custom Window
                  </button>
                </div>
              </div>

              {config.operatingHoursMode === 'custom_window' ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-fg-secondary block">
                      Window Start Hour
                    </label>
                    <Select
                      size="sm"
                      value={config.windowStartHour}
                      onChange={(e) =>
                        update({ windowStartHour: parseInt(e.target.value, 10) || 0 })
                      }
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {formatHourLabel(h)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-fg-secondary block">
                      Window End Hour
                    </label>
                    <Select
                      size="sm"
                      value={config.windowEndHour}
                      onChange={(e) =>
                        update({ windowEndHour: parseInt(e.target.value, 10) || 0 })
                      }
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {formatHourLabel(h)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-fg-muted">
                  Auto-Pilot operates continuously 24/7 whenever unpaused. Switch to Custom Window for overnight-only automation (e.g., 22:00–06:00).
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-xl border border-status-warning-border/80 bg-status-warning-bg/30 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-fg-strong block">
                  SLA Warning (Minutes)
                </label>
                <Input
                  type="number"
                  min="5"
                  max="720"
                  value={config.slaWarningMinutes}
                  onChange={(e) =>
                    update({ slaWarningMinutes: parseInt(e.target.value, 10) || 60 })
                  }
                  className="text-xs h-8 bg-surface-card"
                />
                <span className="text-[10px] text-fg-muted block">
                  Unassigned warning badge (default 60m).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-status-danger-fg block">
                  SLA Critical (Minutes)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={config.slaCriticalMinutes}
                  onChange={(e) =>
                    update({ slaCriticalMinutes: parseInt(e.target.value, 10) || 15 })
                  }
                  className="text-xs h-8 bg-surface-card"
                />
                <span className="text-[10px] text-fg-muted block">
                  Acoustic + SMS/Email alert (default 15m).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-status-info-fg block">
                  Airport Arrival Buffer (Min)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="180"
                  value={config.airportPickupBufferMinutes}
                  onChange={(e) =>
                    update({
                      airportPickupBufferMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="text-xs h-8 bg-surface-card"
                />
                <span className="text-[10px] text-fg-muted block">
                  Post-arrival buffer (default 30m).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-status-warning-fg block">
                  ASAP Grace (Minutes)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={config.asapUnassignedGraceMinutes}
                  onChange={(e) =>
                    update({ asapUnassignedGraceMinutes: parseInt(e.target.value, 10) || 15 })
                  }
                  className="text-xs h-8 bg-surface-card"
                />
                <span className="text-[10px] text-fg-muted block">
                  Orange before red (default 15m).
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Interactive Candidate Dry-Run Simulator */}
        <AdminAutoDispatchSimulator config={config} zones={zones} />

        {/* Save Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border-subtle text-[11px] text-fg-muted">
          <span>
            Active Lead Window: <strong className="text-fg-strong">{config.scheduledDispatchLeadMinutes}m</strong>{' '}
            standard ·{' '}
            <strong className="text-status-info-fg">
              {config.scheduledDispatchLeadMinutes + config.airportExtraLeadMinutes}m
            </strong>{' '}
            STL/SUS airport · SLA Critical at{' '}
            <strong className="text-status-danger-fg">{config.slaCriticalMinutes}m</strong>
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={isSaving}
            onClick={onSave}
            className="text-xs font-bold w-full sm:w-auto justify-center shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Dispatch Automation'}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
