import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getAdminAuthService } from '../../../../core/services/auth/admin-auth.service';
import {
  DEFAULT_DRIVER_APP_POLICIES_CONFIG,
  getAdminConfigService,
  normalizeDriverAppPoliciesConfig,
} from '../../../../core/services/config/admin-config.service';
import {
  getUniversalExtrasService,
  saveUniversalExtrasConfig,
} from '../../../../core/services/pricing/extras.service';
import type {
  ConfigAuditEntry,
  DriverAppPoliciesConfig,
  DriverDefaultNavigationProvider,
} from '../../../../core/types/config';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import {
  BellIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  CompassIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../../ui/Icons';

export interface DriverAppPoliciesPanelProps {
  onFlashSuccess: (msg: string) => void;
  onFlashError: (msg: string) => void;
}

const NAV_PROVIDERS: Array<{
  value: DriverDefaultNavigationProvider;
  label: string;
  hint: string;
}> = [
  {
    value: 'google_maps',
    label: 'Google Maps',
    hint: 'Supports full multi-stop &waypoints= route chains',
  },
  {
    value: 'apple_maps',
    label: 'Apple Maps',
    hint: 'Native iOS turn-by-turn next-leg navigation',
  },
  {
    value: 'waze',
    label: 'Waze',
    hint: 'Live crowd-sourced traffic & hazard routing',
  },
];

export function DriverAppPoliciesPanel({
  onFlashSuccess,
  onFlashError,
}: DriverAppPoliciesPanelProps) {
  const [policy, setPolicy] = useState<DriverAppPoliciesConfig>(() =>
    normalizeDriverAppPoliciesConfig(
      getAdminConfigService().getCachedSettings().driverAppConfig ||
        DEFAULT_DRIVER_APP_POLICIES_CONFIG,
      getUniversalExtrasService().getCached()
    )
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const extrasSvc = getUniversalExtrasService();
    const unsubSettings = getAdminConfigService().subscribeToSettings((s) => {
      setPolicy(normalizeDriverAppPoliciesConfig(s.driverAppConfig, extrasSvc.getCached()));
    });
    const unsubExtras = extrasSvc.subscribeToExtras((ext) => {
      const cached = getAdminConfigService().getCachedSettings();
      setPolicy(normalizeDriverAppPoliciesConfig(cached.driverAppConfig, ext));
    });
    return () => {
      if (typeof unsubSettings === 'function') unsubSettings();
      unsubExtras();
    };
  }, []);

  const update = (partial: Partial<DriverAppPoliciesConfig>) => {
    setPolicy((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const normalized = normalizeDriverAppPoliciesConfig(policy);
      setPolicy(normalized);

      // Sync UniversalExtrasConfig bidirectionally so Pricing Extras & Driver HUD match 100%
      const currentExtras = getUniversalExtrasService().getCached();
      await saveUniversalExtrasConfig({
        ...currentExtras,
        intermediateStopFreeWaitingMinutes: normalized.intermediateStopFreeWaitingMinutes,
        curbWaitingRatePerMinute: normalized.intermediateStopExcessWaitRatePerMinute,
        waitingRatePerMinute: normalized.intermediateStopExcessWaitRatePerMinute,
      });

      const cached = getAdminConfigService().getCachedSettings();
      const actor = getAdminAuthService().getCurrentUser();
      const auditEntry: ConfigAuditEntry = {
        id: `aud-driver-policy-${Date.now()}`,
        timestamp: new Date().toISOString(),
        operatorId: actor?.uid || actor?.email || 'admin',
        operatorEmail: actor?.email || 'admin@chesterfieldtaxi.com',
        tab: 'operators',
        section: 'driver-policies',
        action: `Saved Driver App Policies (freeWait=${normalized.intermediateStopFreeWaitingMinutes}m, rate=$${normalized.intermediateStopExcessWaitRatePerMinute.toFixed(2)}/m, requireAck=${normalized.requireDriverUpdateAck}, nav=${normalized.defaultNavigationProvider})`,
        ipAddress: 'console',
      };

      await getAdminConfigService().updateSettings({
        driverAppConfig: normalized,
        configAuditTrail: [auditEntry, ...(cached.configAuditTrail || [])].slice(0, 200),
      });

      onFlashSuccess('Driver App Policies saved and synchronized with Pricing Extras & /app/driver.');
    } catch (err: any) {
      onFlashError(err?.message || 'Failed to save Driver App Policies.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Multi-Stop Free-Wait Timer & Excess Wait Billing */}
      <Card className="border border-border-subtle bg-surface-card shadow-xs">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-fg-primary flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-amber-600" />
                <span>Multi-Stop Free-Wait Countdown &amp; Overtime Billing</span>
              </CardTitle>
              <p className="text-xs text-fg-muted mt-0.5">
                Live countdown and suggested wait-fee rates on <code>/app/driver</code> intermediate stops (synced bidirectionally with Pricing Extras).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/app/admin?tab=rates&sub=extras"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle bg-surface-card hover:bg-surface-subtle text-xs font-bold text-fg-secondary"
              >
                <span>Extras &amp; Wait</span>
                <ExternalLinkIcon className="w-3.5 h-3.5 text-fg-subtle" />
              </Link>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs font-bold px-4 py-2 cursor-pointer"
              >
                {isSaving ? (
                  <SpinnerIcon className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <CheckIcon className="w-4 h-4 mr-1.5" />
                )}
                Save Driver Policies
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-surface-subtle rounded-xl border border-border-subtle">
            <label className="font-bold text-fg-primary block mb-1">
              Intermediate Stop Free-Wait Allowance (Minutes, 0–30)
            </label>
            <Input
              type="number"
              min={0}
              max={30}
              value={policy.intermediateStopFreeWaitingMinutes}
              onChange={(e) =>
                update({
                  intermediateStopFreeWaitingMinutes: Math.max(
                    0,
                    parseInt(e.target.value, 10) || 0
                  ),
                })
              }
              className="bg-surface-card h-9 text-xs font-mono"
            />
            <span className="text-[10px] text-fg-muted mt-1 block">
              Included free curb-wait countdown when a driver taps &ldquo;Arrived at Stop #k&rdquo; (default 5m).
            </span>
          </div>

          <div className="p-4 bg-surface-subtle rounded-xl border border-border-subtle">
            <label className="font-bold text-fg-primary block mb-1">
              Excess Stop Wait Rate ($ / Minute, $0–$10)
            </label>
            <Input
              type="number"
              step="0.05"
              min={0}
              max={10}
              value={policy.intermediateStopExcessWaitRatePerMinute}
              onChange={(e) =>
                update({
                  intermediateStopExcessWaitRatePerMinute: Math.max(
                    0,
                    parseFloat(e.target.value) || 0
                  ),
                })
              }
              className="bg-surface-card h-9 text-xs font-mono"
            />
            <span className="text-[10px] text-fg-muted mt-1 block">
              Suggested per-minute wait fee past the free window, synced with <code>UniversalExtrasConfig</code> (default $0.50/min).
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 2. Assigned-Edit Driver Update Ack & Shift Hardware Policies */}
      <Card className="border border-border-subtle bg-surface-card shadow-xs">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <CardTitle className="text-base font-black text-fg-primary flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
            <span>Assigned-Trip Edit Acknowledgement, Wake Lock &amp; Navigation</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start justify-between gap-3 p-4 bg-status-warning-bg/50 border border-status-warning-border rounded-xl cursor-pointer">
              <div>
                <span className="font-extrabold text-fg-primary block">
                  Require 1-Tap Driver Update Acknowledgement
                </span>
                <span className="text-[11px] text-fg-secondary mt-0.5 block">
                  When Dispatch edits time, stops, route, or notes on an assigned trip, prompts the driver to tap &ldquo;Acknowledge Update&rdquo;.
                </span>
              </div>
              <input
                type="checkbox"
                checked={policy.requireDriverUpdateAck}
                onChange={(e) => update({ requireDriverUpdateAck: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-amber-600 cursor-pointer"
              />
            </label>

            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="font-bold text-fg-primary block mb-1">
                Unacknowledged Update Overdue Alert (Minutes, 1–60)
              </label>
              <Input
                type="number"
                min={1}
                max={60}
                disabled={!policy.requireDriverUpdateAck}
                value={policy.unacknowledgedAlertMinutes}
                onChange={(e) =>
                  update({
                    unacknowledgedAlertMinutes: parseInt(e.target.value, 10) || 5,
                  })
                }
                className="bg-surface-card h-9 text-xs font-mono"
              />
              <span className="text-[10px] text-fg-muted mt-1 block">
                Highlights an Overdue Ack alert in <code>Trips &rarr; Exceptions</code> when unacknowledged past this window.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start justify-between gap-3 p-4 bg-surface-subtle border border-border-subtle rounded-xl cursor-pointer">
              <div className="flex items-start gap-2.5">
                <CarIcon className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-fg-primary block">
                    Enforce Screen Wake Lock While On-Duty
                  </span>
                  <span className="text-[11px] text-fg-muted mt-0.5 block">
                    Keeps the driver&apos;s phone display awake automatically while <code>on_duty</code> so offers and GPS telemetry stay live.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={policy.enforceScreenWakeLockOnDuty}
                onChange={(e) => update({ enforceScreenWakeLockOnDuty: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-emerald-600 cursor-pointer shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-4 bg-surface-subtle border border-border-subtle rounded-xl cursor-pointer">
              <div className="flex items-start gap-2.5">
                <BellIcon className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-fg-primary block">
                    Enable Audible Incoming Offer Chime
                  </span>
                  <span className="text-[11px] text-fg-muted mt-0.5 block">
                    Plays the repeating high-clarity acoustic chime cadence when a live ride offer arrives on <code>/app/driver</code>.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={policy.enableAudibleOfferChime}
                onChange={(e) => update({ enableAudibleOfferChime: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-blue-600 cursor-pointer shrink-0"
              />
            </label>
          </div>

          {/* Default Navigation App */}
          <div className="space-y-2 pt-2 border-t border-border-faint">
            <label className="font-bold text-fg-primary flex items-center gap-1.5">
              <CompassIcon className="w-4 h-4 text-indigo-600" />
              <span>Default Fleet Navigation App (Fallback Before Driver Local Choice)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {NAV_PROVIDERS.map((nav) => {
                const selected = policy.defaultNavigationProvider === nav.value;
                return (
                  <button
                    key={nav.value}
                    type="button"
                    onClick={() => update({ defaultNavigationProvider: nav.value })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-blue-600 bg-status-info-bg/70 ring-1 ring-blue-500/20'
                        : 'border-border-subtle bg-surface-card hover:border-border-strong'
                    }`}
                  >
                    <div className="font-extrabold text-fg-primary flex items-center justify-between">
                      <span>{nav.label}</span>
                      {selected && <CheckIcon className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <div className="text-[10px] text-fg-muted mt-1">{nav.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
