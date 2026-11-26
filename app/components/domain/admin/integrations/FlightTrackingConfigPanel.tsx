import React, { useEffect, useState } from 'react';
import {
  DEFAULT_FLIGHT_TRACKING_POLICY,
  normalizeFlightTrackingPolicy,
  type AppSettings,
  type FlightPreferredProvider,
  type FlightTrackingPolicyConfig,
} from '../../../../core/types/config';
import { getFlightStatusService } from '../../../../core/services/flight/flight-status.service';
import type { FlightDiagnosticsSummary } from '../../../../core/types/flight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { PlaneIcon, RefreshCwIcon, ShieldCheckIcon, SpinnerIcon } from '../../../ui/Icons';

export interface FlightTrackingConfigPanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  onNotifySuccess: (message: string) => void;
  isLoading?: boolean;
}

const PROVIDER_OPTIONS: Array<{ value: FlightPreferredProvider; label: string; desc: string }> = [
  {
    value: 'auto',
    label: 'Auto Failover (Recommended)',
    desc: 'Uses AeroDataBox first, fails over to FlightAware AeroAPI v4, then STL/SUS terminal heuristic.',
  },
  {
    value: 'aerodatabox',
    label: 'AeroDataBox Primary',
    desc: 'Prioritizes AERODATABOX_API_KEY / FLIGHT_API_KEY before falling back.',
  },
  {
    value: 'flightaware',
    label: 'FlightAware AeroAPI v4 Primary',
    desc: 'Prioritizes FLIGHTAWARE_API_KEY for commercial & tail-number telemetry.',
  },
  {
    value: 'heuristic_only',
    label: 'Offline STL/SUS Terminal Heuristic Only',
    desc: 'Zero external paid API calls; resolves STL Terminal 1/2 doors & SUS FBO ramp deterministically.',
  },
];

export function FlightTrackingConfigPanel({
  settings,
  onSave,
  onNotifySuccess,
  isLoading = false,
}: FlightTrackingConfigPanelProps) {
  const [flightDiag, setFlightDiag] = useState<FlightDiagnosticsSummary | null>(null);
  const [isLoadingDiag, setIsLoadingDiag] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [policy, setPolicy] = useState<FlightTrackingPolicyConfig>(() =>
    normalizeFlightTrackingPolicy(settings.integrations?.flightTracking)
  );

  useEffect(() => {
    setPolicy(normalizeFlightTrackingPolicy(settings.integrations?.flightTracking));
  }, [settings.integrations?.flightTracking]);

  const refreshDiagnostics = async () => {
    setIsLoadingDiag(true);
    try {
      const diag = await getFlightStatusService().fetchDiagnostics();
      setFlightDiag(diag);
    } finally {
      setIsLoadingDiag(false);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  const handleSavePolicy = async () => {
    setIsSaving(true);
    try {
      const normalized = normalizeFlightTrackingPolicy(policy);
      await onSave({
        integrations: {
          ...settings.integrations,
          flightTracking: normalized,
        },
      });
      setPolicy(normalized);
      onNotifySuccess('Flight Tracking lookup window, cache TTL, provider priority, and delay threshold saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* CARD 1: FLIGHT TELEMETRY ADAPTER DIAGNOSTICS */}
      <Card className="rounded-2xl border-border-subtle">
        <CardHeader className="border-b border-border-faint pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
                <PlaneIcon className="w-5 h-5 text-blue-600 shrink-0" />
                <span>Flight Status Telemetry (AeroDataBox / FlightAware)</span>
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Provider-agnostic STL &amp; SUS arrival tracking, Terminal 1 / Terminal 2 curbside door routing, and 1-tap Dispatch ETA sync.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Badge variant={flightDiag?.liveApiConfigured ? 'success' : 'info'} className="font-bold">
                {flightDiag?.activeProvider === 'aerodatabox'
                  ? 'AeroDataBox Live'
                  : flightDiag?.activeProvider === 'flightaware'
                  ? 'FlightAware AeroAPI v4'
                  : 'STL Terminal Fallback Ready'}
              </Badge>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-status-success-bg border border-status-success-border text-status-success-fg font-bold text-[11px]">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{policy.cacheTtlMinutes}-Min Cache Shield</span>
              </span>
              <Button variant="outline" size="sm" onClick={refreshDiagnostics} disabled={isLoadingDiag}>
                {isLoadingDiag ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-subtle/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-fg-primary">AeroDataBox Adapter</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${flightDiag?.aeroDataBoxConfigured ? 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' : 'bg-surface-muted text-fg-secondary border-border-subtle'}`}>
                  {flightDiag?.aeroDataBoxConfigured ? 'Configured' : 'Env Key Unset'}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted">Server env <code className="font-mono">AERODATABOX_API_KEY</code> or <code className="font-mono">FLIGHT_API_KEY</code>.</p>
            </div>

            <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-subtle/70 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-fg-primary">FlightAware AeroAPI v4</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${flightDiag?.flightAwareConfigured ? 'bg-status-success-bg-strong text-status-success-fg border-status-success-border' : 'bg-surface-muted text-fg-secondary border-border-subtle'}`}>
                  {flightDiag?.flightAwareConfigured ? 'Configured' : 'Env Key Unset'}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted">Server env <code className="font-mono">FLIGHTAWARE_API_KEY</code>.</p>
            </div>

            <div className="p-3.5 rounded-xl border border-status-success-border bg-status-success-bg/50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-status-success-fg">Quota &amp; Rate Shield</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-card text-status-success-fg border border-status-success-border">
                  {flightDiag?.cachedEntriesCount ?? 0} Cached
                </span>
              </div>
              <p className="text-[11px] text-status-success-fg/80">Deduplicated via <code className="font-mono">/flightStatusCache</code>; forceRefresh staff-only.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-status-info-border bg-status-info-bg/50 text-xs text-fg-secondary">
            <strong className="text-fg-primary">Regional Airport Intelligence ({(flightDiag?.supportedAirports || ['STL', 'SUS', 'CPS']).join(' · ')}):</strong>{' '}
            Southwest &amp; Lufthansa mapped to <strong>STL Terminal 2 (Exit Door 12)</strong>; AA, DL, UA, AC &amp; commercial carriers mapped to{' '}
            <strong>STL Terminal 1 (Exit Door 6)</strong>; SUS &amp; CPS mapped to <strong>Private FBO Ramp</strong>.
          </div>
        </CardContent>
      </Card>

      {/* CARD 2: EDITABLE FLIGHT TRACKING POLICY CONTROLS */}
      <Card className="rounded-2xl border-border-subtle">
        <CardHeader className="border-b border-border-faint pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-fg-primary">
                Flight Lookup Window, Cache TTL &amp; Delay Alert Policy
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Live operational rules enforced across `/book`, `/api/flight-status`, and Dispatch Trip Drawers.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPolicy(DEFAULT_FLIGHT_TRACKING_POLICY)} className="text-xs font-bold">
                Reset Defaults
              </Button>
              <Button type="button" size="sm" onClick={handleSavePolicy} disabled={isSaving || isLoading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">
                {isSaving ? 'Saving...' : 'Save Flight Policy'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 space-y-1.5">
              <label className="text-xs font-bold text-fg-strong block">
                Live Lookup Window (Hours Ahead)
              </label>
              <input
                type="number"
                min={2}
                max={72}
                value={policy.flightLookupWindowHours}
                onChange={(e) => setPolicy({ ...policy, flightLookupWindowHours: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-border-strong bg-surface-card"
              />
              <p className="text-[11px] text-fg-muted">
                Clamped 2–72h (default 24h). Future bookings outside this window defer live API calls until inside the window.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 space-y-1.5">
              <label className="text-xs font-bold text-fg-strong block">
                Server Cache TTL (Minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={policy.cacheTtlMinutes}
                onChange={(e) => setPolicy({ ...policy, cacheTtlMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-border-strong bg-surface-card"
              />
              <p className="text-[11px] text-fg-muted">
                Clamped 1–120 min (default 15m). Protects monthly API quota across passenger &amp; dispatcher refreshes.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border-subtle bg-surface-subtle/50 space-y-1.5">
              <label className="text-xs font-bold text-fg-strong block">
                Delay Alert Threshold (Minutes)
              </label>
              <input
                type="number"
                min={5}
                max={180}
                value={policy.delayAlertThresholdMinutes}
                onChange={(e) => setPolicy({ ...policy, delayAlertThresholdMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-border-strong bg-surface-card"
              />
              <p className="text-[11px] text-fg-muted">
                Clamped 5–180 min (default 20m). Highlights delayed inbound flights in Dispatch &amp; recommends stage adjustment.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-fg-strong block">Preferred Telemetry Provider</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROVIDER_OPTIONS.map((opt) => {
                const active = policy.preferredProvider === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPolicy({ ...policy, preferredProvider: opt.value })}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                      active ? 'border-blue-500 bg-status-info-bg/40 ring-1 ring-blue-400' : 'border-border-subtle bg-surface-card hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-fg-primary">{opt.label}</div>
                    <div className="text-[11px] text-fg-muted mt-0.5">{opt.desc}</div>
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
