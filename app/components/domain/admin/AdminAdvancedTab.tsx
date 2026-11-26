import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import type {
  AppSettings,
  SecurityControlsConfig,
  ConfigAuditEntry,
} from '../../../core/types/config';
import {
  DEFAULT_SECURITY_CONTROLS,
} from '../../../core/services/config/admin-config.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Badge } from '../../ui/Badge';
import { Alert } from '../../ui/Alert';
import {
  CheckIcon,
  SpinnerIcon,
  LockIcon,
  DownloadIcon,
} from '../../ui/Icons';
import { isFirebaseConfigured } from '../../../core/services/firebase';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { getBookingService } from '../../../core/services/booking';
import { AdminArchiveTab } from './AdminArchiveTab';

export type AdvancedSubTab = 'security' | 'audit' | 'archive' | 'system';

export interface AdminAdvancedTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: string;
  archiveEntity?: string;
}

function normalizeAdvancedSubTab(raw?: string): AdvancedSubTab {
  if (raw === 'security' || raw === 'audit' || raw === 'archive' || raw === 'system') {
    return raw;
  }
  return 'security';
}

export function AdminAdvancedTab({
  settings,
  onSave,
  isLoading: _isLoading = false,
  initialSubTab = 'security',
  archiveEntity = 'all',
}: AdminAdvancedTabProps) {
  const [activeSub, setActiveSub] = useState<AdvancedSubTab>(() =>
    normalizeAdvancedSubTab(initialSubTab)
  );

  useEffect(() => {
    setActiveSub(normalizeAdvancedSubTab(initialSubTab));
  }, [initialSubTab]);

  // ─── 1. Security Controls State ───
  const [securityConfig, setSecurityConfig] = useState<SecurityControlsConfig>({
    ...DEFAULT_SECURITY_CONTROLS,
    ...(settings.securityControls || {}),
  });

  // ─── 2. System & Maintenance State ───
  const [maintenanceMode, setMaintenanceMode] = useState(settings.constructionMode ?? true);
  const [maintenanceBanner, setMaintenanceBanner] = useState(
    'Scheduled system maintenance in progress. Please call dispatch directly at (314) 738-0100.'
  );
  const [alertDismissMinutes, setAlertDismissMinutes] = useState<number>(
    settings.fleetAlertsConfig?.autoDismissMinutes ?? 60
  );
  const [realtimeRouting, setRealtimeRouting] = useState<boolean>(
    settings.enableRealtimeRouting ?? COMPANY_CONFIG.enableRealtimeRouting ?? false
  );

  useEffect(() => {
    if (settings.constructionMode !== undefined) {
      setMaintenanceMode(settings.constructionMode);
    }
  }, [settings.constructionMode]);

  useEffect(() => {
    if (settings.enableRealtimeRouting !== undefined) {
      setRealtimeRouting(settings.enableRealtimeRouting);
    }
  }, [settings.enableRealtimeRouting]);

  const [enableGetAppButtons, setEnableGetAppButtons] = useState<boolean>(
    settings.enableGetAppButtons ?? COMPANY_CONFIG.enableGetAppButtons ?? false
  );

  useEffect(() => {
    if (settings.enableGetAppButtons !== undefined) {
      setEnableGetAppButtons(settings.enableGetAppButtons);
    }
  }, [settings.enableGetAppButtons]);

  useEffect(() => {
    if (settings.fleetAlertsConfig?.autoDismissMinutes !== undefined) {
      setAlertDismissMinutes(settings.fleetAlertsConfig.autoDismissMinutes);
    }
  }, [settings.fleetAlertsConfig?.autoDismissMinutes]);

  // Status feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Audit search & filter
  const [auditSearch, setAuditSearch] = useState('');
  const auditLogs: ConfigAuditEntry[] = settings.configAuditTrail || [];

  const firebaseStatus = isFirebaseConfigured();

  // Save Security Controls
  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccessMessage(null);
      setSaveError(null);

      await onSave({
        securityControls: securityConfig,
        updatedAt: new Date().toISOString(),
      });

      setSaveSuccessMessage('Security and session access controls updated.');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update security controls.');
    } finally {
      setIsSaving(false);
    }
  };


  // Export Audit Logs
  const handleExportAuditLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chesterfield_config_audit_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export Full Configuration Backup
  const handleExportFullConfig = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chesterfield_full_config_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Purge Local Storage Cache
  const handlePurgeCache = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('chesterfield_taxi_app_settings');
      setSaveSuccessMessage('Local offline cache purged. Refreshing configuration from Firestore...');
      setTimeout(() => window.location.reload(), 1500);
    }
  };


  // Filtered audit logs
  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.operatorEmail.toLowerCase().includes(q) ||
      log.section.toLowerCase().includes(q) ||
      log.tab.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Contextual Action Bar for Audit / System Export */}
      {(activeSub === 'audit' || activeSub === 'system') && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-surface-card p-3 sm:p-2.5 rounded-2xl border border-border-subtle/80 shadow-xs">
          <div className="text-xs font-bold text-fg-secondary px-1 sm:px-2">
            {activeSub === 'audit' ? (
              <span>Config Audit Trail ({auditLogs.length} logged events)</span>
            ) : (
              <span>System Operations, Diagnostics &amp; Backups</span>
            )}
          </div>
          {activeSub === 'audit' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportAuditLogs}
              className="w-full sm:w-auto justify-center text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Export Audit Log (JSON)</span>
            </Button>
          )}

          {activeSub === 'system' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportFullConfig}
              className="w-full sm:w-auto justify-center text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Export Full System Config</span>
            </Button>
          )}
        </div>
      )}

      {saveSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {saveSuccessMessage}
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" className="animate-in fade-in text-xs">
          {saveError}
        </Alert>
      )}



      {/* ═══════════════════════════════════════════════════════════════════════
          SUBPAGE 2: SECURITY & ACCESS CONTROLS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeSub === 'security' && (
        <form onSubmit={handleSaveSecurity} className="space-y-6">
          <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
            <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
              <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
                <LockIcon className="w-5 h-5 text-amber-600" />
                Security, Authentication &amp; IP Access Controls
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Enforce dispatcher 2FA, idle session timeouts, and IP allowlist restrictions for the administration console.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fg-primary text-xs">Enforce Two-Factor Authentication (2FA)</span>
                    <input
                      type="checkbox"
                      checked={securityConfig.require2FA}
                      onChange={(e) =>
                        setSecurityConfig((prev) => ({ ...prev, require2FA: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-fg-muted">
                    Requires SMS or Authenticator TOTP token upon dispatcher and administrator login.
                  </p>
                </div>

                <div className="p-4 bg-surface-subtle border border-border-subtle rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fg-primary text-xs">IP Address Allowlisting</span>
                    <input
                      type="checkbox"
                      checked={securityConfig.enableIpAllowlist || false}
                      onChange={(e) =>
                        setSecurityConfig((prev) => ({
                          ...prev,
                          enableIpAllowlist: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-fg-muted">
                    Restricts admin console access strictly to approved dispatch office static IPs.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
                  <label className="text-xs font-bold text-fg-strong block mb-1">
                    Idle Session Timeout (Minutes)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="480"
                    value={securityConfig.sessionTimeoutMinutes}
                    onChange={(e) =>
                      setSecurityConfig((prev) => ({
                        ...prev,
                        sessionTimeoutMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold"
                  />
                </div>

                <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
                  <label className="text-xs font-bold text-fg-strong block mb-1">
                    Max Failed Login Attempts
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="10"
                    value={securityConfig.maxFailedLoginAttempts}
                    onChange={(e) =>
                      setSecurityConfig((prev) => ({
                        ...prev,
                        maxFailedLoginAttempts: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold"
                  />
                </div>

                <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
                  <label className="text-xs font-bold text-fg-strong block mb-1">
                    Password Expiration (Days)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="365"
                    value={securityConfig.passwordExpiryDays}
                    onChange={(e) =>
                      setSecurityConfig((prev) => ({
                        ...prev,
                        passwordExpiryDays: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t border-border-faint bg-surface-subtle/50 p-4 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2"
              >
                {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Security Configuration
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SUBPAGE 3: CONFIGURATION AUDIT TRAIL
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeSub === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-surface-card p-3 rounded-2xl border border-border-subtle shadow-xs">
            <input
              type="text"
              placeholder="Search audit trail by operator, action, section, or IP..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="w-full sm:max-w-md px-3.5 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs font-medium focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-fg-muted font-semibold whitespace-nowrap self-end sm:self-auto">
              {filteredAuditLogs.length} Logged Actions
            </span>
          </div>

          <div className="bg-surface-card rounded-2xl border border-border-subtle/80 shadow-xs overflow-hidden">
            {/* Mobile Audit Cards (< md) */}
            <div className="md:hidden divide-y divide-border-faint">
              {filteredAuditLogs.map((log) => (
                <div key={log.id} className="p-3.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <Badge variant="info" size="sm" className="font-mono text-[10px] uppercase">
                      {log.tab}:{log.section}
                    </Badge>
                    <span className="font-mono text-[10px] text-fg-subtle">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-fg-strong leading-snug">
                    {log.action}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-fg-muted">
                    <span className="font-semibold text-fg-secondary truncate">{log.operatorEmail}</span>
                    <span className="font-mono text-[10px] text-fg-subtle">{log.ipAddress}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Audit Table (md+) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar min-w-full">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-surface-subtle/80 border-b border-border-subtle text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Operator</th>
                    <th className="px-4 py-3">Section</th>
                    <th className="px-4 py-3">Action Description</th>
                    <th className="px-4 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-subtle/70 transition-colors">
                      <td className="px-4 py-3 font-mono text-fg-muted whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-fg-primary whitespace-nowrap">
                        {log.operatorEmail}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="info" size="sm" className="font-mono text-[10px] uppercase">
                          {log.tab}:{log.section}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary font-medium">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-fg-subtle whitespace-nowrap">
                        {log.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUBPAGE: UNIVERSAL ARCHIVE ─── */}
      {activeSub === 'archive' && (
        <AdminArchiveTab initialSubTab={archiveEntity || 'all'} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SUBPAGE 4: SYSTEM OPS & TELEMETRY
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeSub === 'system' && (
        <div className="space-y-6">
          {/* Infrastructure Health Monitors (from screenshot media_1789324367315.png) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card variant="elevated" className="border-border-subtle bg-surface-card p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">DATABASE</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-fg-primary">Cloud Database</div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                {firebaseStatus ? 'Connected & Synced' : 'Offline / Local Fallback'}
              </div>
              <div className="mt-2 text-[10px] font-mono text-fg-subtle">
                Access Controls Active
              </div>
            </Card>

            <Card variant="elevated" className="border-border-subtle bg-surface-card p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">MAPPING API</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-fg-primary">Google Places / Roads</div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                Distance &amp; Address Lookup
              </div>
              <div className="mt-2 text-[10px] font-mono text-fg-subtle">
                Latency: ~42ms (Optimal)
              </div>
            </Card>

            <Card variant="elevated" className="border-border-subtle bg-surface-card p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">PHONE &amp; SMS</span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-fg-primary">Dispatch Softphone</div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                Browser Audio Ready
              </div>
              <div className="mt-2 text-[10px] font-mono text-fg-subtle">
                Line: (314) 738-0100
              </div>
            </Card>

            <Card variant="elevated" className="border-border-subtle bg-surface-card p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">PRICING</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-fg-primary">Live Fare Calculator</div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                Rates, Extras &amp; Surcharges
              </div>
              <div className="mt-2 text-[10px] font-mono text-fg-subtle">
                Active
              </div>
            </Card>
          </div>

          {/* Relocated Cross-Link: Live Map Route Polylines (`enableRealtimeRouting`) */}
          <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-fg-primary">
                    Routing Engine &amp; Live Google Maps Polylines
                  </h4>
                  {realtimeRouting ? (
                    <Badge
                      variant="success"
                      className="bg-status-success-bg text-status-success-fg border-status-success-border font-bold text-[10px]"
                    >
                      Live Directions Active
                    </Badge>
                  ) : (
                    <Badge
                      variant="warning"
                      className="bg-status-warning-bg text-status-warning-fg border-status-warning-border font-bold text-[10px]"
                    >
                      Mock Curvature Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-fg-muted">
                  Live Map Route Polylines (<code>enableRealtimeRouting</code>), Conflict Guard windows, and Dispatch workspace defaults now live under <strong>Dispatch &amp; Automation &rarr; Console &amp; Conflict Guard</strong>.
                </p>
              </div>
              <Link
                to="/app/admin?tab=automation&sub=console"
                className="inline-flex items-center justify-center px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 transition-colors"
              >
                Configure in Console &amp; Conflict Guard &rarr;
              </Link>
            </CardContent>
          </Card>

          {/* Maintenance Lock & Cache Operations */}
          <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
            <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
              <CardTitle className="text-base font-bold text-fg-primary">
                Maintenance Mode &amp; Local Storage Cache
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Temporarily lock public booking access or purge browser-side configuration caching.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 bg-surface-subtle border border-border-subtle rounded-xl">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-fg-primary">Maintenance Mode</h4>
                  <p className="text-[11px] text-fg-muted">
                    Blocks client booking access while leaving admin dispatch fully operable.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={async (e) => {
                    const nextVal = e.target.checked;
                    setMaintenanceMode(nextVal);
                    try {
                      await onSave({
                        constructionMode: nextVal,
                        updatedAt: new Date().toISOString(),
                      });
                    } catch (err) {
                      console.error('Failed to update construction mode:', err);
                    }
                  }}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer shrink-0"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-surface-subtle border border-border-subtle rounded-xl">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-fg-primary">Purge Local Configuration Cache</h4>
                  <p className="text-[11px] text-fg-muted">
                    Clears client-side <code>localStorage</code> copy and forces immediate hydration from Firestore.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePurgeCache}
                  className="w-full sm:w-auto justify-center shrink-0 text-xs font-bold text-status-danger-fg border-status-danger-border hover:bg-status-danger-bg"
                >
                  Purge Local Cache
                </Button>
              </div>

              {/* Fleet Tactical Alerts Retention & Auto-Dismiss Duration */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-surface-subtle border border-border-subtle rounded-xl">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-fg-primary">Fleet Tactical Alerts Auto-Dismiss Retention</h4>
                  <p className="text-[11px] text-fg-muted">
                    Automatically dismisses non-pinned tactical alerts from the Dispatch Console after a specified duration (1 hour default).
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <Select
                    size="sm"
                    fullWidth={false}
                    value={alertDismissMinutes}
                    onChange={async (e) => {
                      const mins = parseInt(e.target.value, 10);
                      setAlertDismissMinutes(mins);
                      await onSave({
                        fleetAlertsConfig: { autoDismissMinutes: mins },
                      });
                      try {
                        localStorage.setItem('chesterfield_alerts_ttl_minutes', String(mins));
                      } catch {}
                    }}
                    className="w-full sm:w-auto"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour (Default)</option>
                    <option value={120}>2 Hours</option>
                    <option value={240}>4 Hours</option>
                    <option value={720}>12 Hours</option>
                    <option value={1440}>24 Hours</option>
                    <option value={0}>Never Auto-Dismiss</option>
                  </Select>
                </div>
              </div>

              {/* Developer Stress Testing */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-status-warning-bg border border-status-warning-border rounded-xl">
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-status-warning-fg">Developer Tools: Seed Stress Data</h4>
                  <p className="text-[11px] text-status-warning-fg">
                    Generates 100+ concurrent mock trips to test <code>/dispatch</code> virtualized rendering and smooth scrolling.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!confirm("Are you sure you want to seed 120 mock trips? This will execute client-side booking creations and push to Firestore.")) return;
                      
                      // Show some basic UI feedback or console log for progress
                      console.log('Starting client-side stress seed...');
                      
                      try {
                        const service = getBookingService();
                        const statuses = ['unconfirmed', 'confirmed', 'assigned', 'in_progress', 'completed', 'declined'] as const;
                        
                        const baseTrip = {
                          pickupLocation: { address: '123 Test St', coordinates: { lat: 38.6, lng: -90.5 } },
                          dropoffLocation: { address: '456 Dest Ave', coordinates: { lat: 38.7, lng: -90.4 } },
                          bookingType: 'asap' as const,
                          vehicleTier: 'standard' as const,
                          passenger: {
                            firstName: 'Test',
                            lastName: 'User',
                            email: 'test@example.com',
                            phone: '555-0100',
                            passengerCount: 1,
                            luggageCount: 0,
                          },
                          pricing: {
                            baseFare: 5.0,
                            distanceMiles: 1,
                            durationMinutes: 5,
                            distanceRate: 15.0,
                            timeRate: 0,
                            totalFare: 20.0,
                            vehicleMultiplier: 1,
                            surgeMultiplier: 1,
                            discountAmount: 0,
                            subtotal: 20.0,
                            currency: 'USD'
                          },
                          payment: {
                            method: 'card' as const,
                            status: 'pending' as const,
                            amount: 20.0
                          }
                        };

                        let successCount = 0;
                        for (let i = 0; i < 120; i++) {
                          const status = statuses[i % statuses.length];
                          const trip = await service.createBooking({
                            ...baseTrip,
                            passenger: {
                              ...baseTrip.passenger,
                              firstName: `Test${i}`,
                            }
                          });
                          
                          if (trip && status !== 'unconfirmed') {
                            if (service.updateTripStatus) {
                              await service.updateTripStatus(trip.id, status as any, { actorRole: 'system' });
                            }
                          }
                          successCount++;
                          if (successCount % 20 === 0) console.log(`Seeded ${successCount}/120 trips...`);
                        }
                        alert(`Successfully seeded ${successCount} trips directly via Booking Service!`);
                      } catch (err) {
                        console.error("Seeding error", err);
                        alert("Error seeding data. Check console for details.");
                      }
                    }}
                    className="text-xs font-bold bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border hover:bg-status-warning-bg-strong"
                  >
                    Seed 120 Trips
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!confirm("Are you sure you want to purge mock stress trips? Real user bookings will be kept.")) return;
                      try {
                        if (typeof window !== 'undefined' && window.localStorage) {
                          const raw = window.localStorage.getItem('chesterfield_taxi_mock_trips');
                          if (raw) {
                            const parsed = JSON.parse(raw);
                            const kept = parsed.filter((t: any) => 
                              !(t.passenger?.lastName === 'User' && (t.passenger?.firstName || '').startsWith('Test')) &&
                              t.pickupLocation?.address !== '123 Test St' &&
                              !t.id?.startsWith('MOCK-')
                            );
                            window.localStorage.setItem('chesterfield_taxi_mock_trips', JSON.stringify(kept));
                          }
                        }

                        if (isFirebaseConfigured()) {
                          const { getFirestore, collection, getDocs, doc, deleteDoc } = await import('firebase/firestore');
                          const { getFirebaseApp } = await import('../../../core/services/firebase');
                          const db = getFirestore(getFirebaseApp());
                          const snap = await getDocs(collection(db, 'trips'));
                          let deleted = 0;
                          for (const d of snap.docs) {
                            const data = d.data();
                            const isMock =
                              (data.passenger?.lastName === 'User' && (data.passenger?.firstName || '').startsWith('Test')) ||
                              data.pickupLocation?.address === '123 Test St' ||
                              d.id.startsWith('MOCK-') ||
                              d.id.startsWith('stress_');
                            if (isMock) {
                              await deleteDoc(doc(db, 'trips', d.id));
                              deleted++;
                            }
                          }
                          try {
                            await deleteDoc(doc(db, 'drivers', 'drv-101'));
                          } catch {}

                          alert(`Purged ${deleted} mock trips from Firestore. All real bookings preserved!`);
                        } else {
                          alert('Purged local mock trips. All real bookings preserved!');
                        }
                        window.location.reload();
                      } catch (err) {
                        console.error('Error purging mock trips:', err);
                        alert('Error purging mock trips. Check console for details.');
                      }
                    }}
                    className="text-xs font-bold bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border hover:bg-rose-200"
                  >
                    Purge Mock Trips
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
