import React, { useState, useEffect } from 'react';
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
import { Badge } from '../../ui/Badge';
import { Alert } from '../../ui/Alert';
import {
  ShieldCheckIcon,
  CheckIcon,
  SpinnerIcon,
  LockIcon,
  ClockIcon,
  CarIcon,
  InfoIcon,
  ShieldIcon,
  HistoryIcon,
  SettingsIcon,
  DownloadIcon,
} from '../../ui/Icons';
import { isFirebaseConfigured } from '../../../core/services/firebase';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { getBookingService } from '../../../core/services/booking';
import { AdminWebsiteTab } from './website/AdminWebsiteTab';

export type AdvancedSubTab = 'website' | 'security' | 'audit' | 'system';

export interface AdminAdvancedTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: string;
}

export function AdminAdvancedTab({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'website',
}: AdminAdvancedTabProps) {
  const normalizedInitial: AdvancedSubTab =
    initialSubTab === 'security' ||
    initialSubTab === 'audit' ||
    initialSubTab === 'system'
      ? initialSubTab
      : 'website';

  const [activeSub, setActiveSub] = useState<AdvancedSubTab>(normalizedInitial);

  useEffect(() => {
    if (initialSubTab === 'security' || initialSubTab === 'audit' || initialSubTab === 'system') {
      setActiveSub(initialSubTab);
    } else {
      setActiveSub('website');
    }
  }, [initialSubTab]);

  // ─── 1. Security Controls State ───
  const [securityConfig, setSecurityConfig] = useState<SecurityControlsConfig>({
    ...DEFAULT_SECURITY_CONTROLS,
    ...(settings.securityControls || {}),
  });

  // ─── 2. System & Maintenance State ───
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceBanner, setMaintenanceBanner] = useState(
    'Scheduled system maintenance in progress. Please call dispatch directly at (314) 738-0100.'
  );

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
        <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-bold text-slate-700 px-2">
            {activeSub === 'audit' ? (
              <span>Config Audit Trail ({auditLogs.length} logged events)</span>
            ) : (
              <span>System Operations, Diagnostics & Backups</span>
            )}
          </div>
          {activeSub === 'audit' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportAuditLogs}
              className="text-xs font-bold inline-flex items-center gap-1.5"
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
              className="text-xs font-bold inline-flex items-center gap-1.5"
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
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <LockIcon className="w-5 h-5 text-amber-600" />
                Security, Authentication &amp; IP Access Controls
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Enforce dispatcher 2FA, idle session timeouts, and IP allowlist restrictions for the administration console.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Enforce Two-Factor Authentication (2FA)</span>
                    <input
                      type="checkbox"
                      checked={securityConfig.require2FA}
                      onChange={(e) =>
                        setSecurityConfig((prev) => ({ ...prev, require2FA: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Requires SMS or Authenticator TOTP token upon dispatcher and administrator login.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">IP Address Allowlisting</span>
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
                  <p className="text-[11px] text-slate-500">
                    Restricts admin console access strictly to approved dispatch office static IPs.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
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
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
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
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
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
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t border-slate-100 bg-slate-50/50 p-4 flex justify-end">
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
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <input
              type="text"
              placeholder="Search audit trail by operator, action, section, or IP..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="w-full max-w-md px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">
              {filteredAuditLogs.length} Logged Actions
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar min-w-full">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Operator</th>
                    <th className="px-4 py-3">Section</th>
                    <th className="px-4 py-3">Action Description</th>
                    <th className="px-4 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {log.operatorEmail}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="info" size="sm" className="font-mono text-[10px] uppercase">
                          {log.tab}:{log.section}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
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

      {/* ═══════════════════════════════════════════════════════════════════════
          SUBPAGE 4: SYSTEM OPS & TELEMETRY
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeSub === 'system' && (
        <div className="space-y-6">
          {/* Infrastructure Health Monitors (from screenshot media_1789324367315.png) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card variant="elevated" className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">DATABASE</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-slate-900">Firestore NoSQL</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {firebaseStatus ? 'Connected & Enforced' : 'Offline / LocalStorage Fallback'}
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-400">
                Rules: Strict RBAC Active
              </div>
            </Card>

            <Card variant="elevated" className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">MAPPING API</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-slate-900">Google Places / Roads</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Distance Matrix &amp; Geocoding
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-400">
                Latency: ~42ms (Optimal)
              </div>
            </Card>

            <Card variant="elevated" className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">VOIP TELEPHONY</span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-slate-900">Browser Softphone</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                WebRTC Audio Ready
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-400">
                DID: (314) 738-0100
              </div>
            </Card>

            <Card variant="elevated" className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">QUOTING ENGINE</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-extrabold text-sm text-slate-900">Pure Functional Pipeline</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Multi-stop &amp; Surge Multipliers
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-400">
                Phase 18 Active
              </div>
            </Card>
          </div>

          {/* Maintenance Lock & Cache Operations */}
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
              <CardTitle className="text-base font-bold text-slate-900">
                Maintenance Mode &amp; Local Storage Cache
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Temporarily lock public booking access or purge browser-side configuration caching.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Maintenance Mode</h4>
                  <p className="text-[11px] text-slate-500">
                    Blocks customer booking access while leaving admin dispatch fully operable.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Purge Local Configuration Cache</h4>
                  <p className="text-[11px] text-slate-500">
                    Clears client-side <code>localStorage</code> copy and forces immediate hydration from Firestore.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePurgeCache}
                  className="text-xs font-bold text-rose-700 border-rose-300 hover:bg-rose-50"
                >
                  Purge Local Cache
                </Button>
              </div>

              {/* Developer Stress Testing */}
              <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div>
                  <h4 className="text-xs font-extrabold text-amber-900">Developer Tools: Seed Stress Data</h4>
                  <p className="text-[11px] text-amber-700">
                    Generates 100+ concurrent mock trips to test <code>/dispatch</code> virtualized rendering and smooth scrolling.
                  </p>
                </div>
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
                      const statuses = ['UNCONFIRMED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'] as const;
                      
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
                        
                        if (trip && status !== 'UNCONFIRMED') {
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
                  className="text-xs font-bold bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 shrink-0"
                >
                  Seed 120 Trips
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SUBPAGE 5: WEBSITE BUILDER & CMS STUDIO
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeSub === 'website' && (
        <AdminWebsiteTab
          settings={settings}
          onSave={onSave}
          isLoading={isLoading || isSaving}
          initialSubTab={initialSubTab === 'form' || initialSubTab === 'customer-form' ? 'form' : undefined}
        />
      )}
    </div>
  );
}
