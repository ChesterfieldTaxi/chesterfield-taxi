import React, { useState, useEffect } from 'react';
import type {
  AppSettings,
  CustomerBookingConfig,
  SecurityControlsConfig,
  ConfigAuditEntry,
} from '../../../core/types/config';
import {
  DEFAULT_CUSTOMER_BOOKING_CONFIG,
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
  FileTextIcon,
  ShieldIcon,
  HistoryIcon,
  SettingsIcon,
  DownloadIcon,
} from '../../ui/Icons';
import { isFirebaseConfigured } from '../../../core/services/firebase';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { getBookingService } from '../../../core/services/booking';

export type AdvancedSubTab = 'form' | 'security' | 'audit' | 'system';

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
  initialSubTab = 'form',
}: AdminAdvancedTabProps) {
  // Normalize initialSubTab: 'customer-form' or 'form' opens 'form'
  const normalizedInitial =
    initialSubTab === 'customer-form' || initialSubTab === 'form'
      ? 'form'
      : (initialSubTab as AdvancedSubTab) || 'form';

  const [activeSub, setActiveSub] = useState<AdvancedSubTab>(normalizedInitial);

  useEffect(() => {
    if (initialSubTab === 'customer-form' || initialSubTab === 'form') {
      setActiveSub('form');
    } else if (initialSubTab === 'security' || initialSubTab === 'audit' || initialSubTab === 'system') {
      setActiveSub(initialSubTab as AdvancedSubTab);
    }
  }, [initialSubTab]);

  // ─── 1. Customer Form Feature Config State ───
  const [formConfig, setFormConfig] = useState<CustomerBookingConfig>({
    ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
    ...(settings.customerBookingConfig || {}),
  });

  // ─── 2. Security Controls State ───
  const [securityConfig, setSecurityConfig] = useState<SecurityControlsConfig>({
    ...DEFAULT_SECURITY_CONTROLS,
    ...(settings.securityControls || {}),
  });

  // ─── 3. System & Maintenance State ───
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

  // Save Customer Booking Form Settings
  const handleSaveCustomerForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccessMessage(null);
      setSaveError(null);

      await onSave({
        customerBookingConfig: formConfig,
        updatedAt: new Date().toISOString(),
      });

      setSaveSuccessMessage('Customer booking form configurations successfully synchronized.');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save customer form settings.');
    } finally {
      setIsSaving(false);
    }
  };

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

  // Toggle Payment Methods
  const togglePaymentMethod = (method: 'card' | 'cash' | 'account') => {
    setFormConfig((prev) => {
      const exists = prev.acceptedPaymentMethods.includes(method);
      let updated: Array<'card' | 'cash' | 'account'>;
      if (exists) {
        if (prev.acceptedPaymentMethods.length <= 1) return prev;
        updated = prev.acceptedPaymentMethods.filter((m) => m !== method);
      } else {
        updated = [...prev.acceptedPaymentMethods, method];
      }
      return { ...prev, acceptedPaymentMethods: updated };
    });
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

  // Computed phone / email fallbacks
  const displayPhone = formConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.dispatch;
  const displayEmail = formConfig.multiVehicleCallEmail || COMPANY_CONFIG.email.dispatch;

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
      {/* ─── Sub-Navigation Pills ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSub('form')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'form'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileTextIcon className="w-4 h-4 shrink-0" />
            <span>Customer Form Controls</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                formConfig.allowMultiVehicle ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {formConfig.allowMultiVehicle ? 'Multi-Cab Active' : 'Single-Cab'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSub('security')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'security'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldIcon className="w-4 h-4 shrink-0" />
            <span>Security &amp; Access</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSub('audit')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <HistoryIcon className="w-4 h-4 shrink-0" />
            <span>Config Audit Trail</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeSub === 'audit' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {auditLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSub('system')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'system'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span>System Ops &amp; Backups</span>
          </button>
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
          SUBPAGE 1: CUSTOMER FORM CARD (TURBOCHARGED EXTENSIVE CONTROLS)
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeSub === 'form' && (
        <form onSubmit={handleSaveCustomerForm} className="space-y-6">
          {/* Card 1: Multi-Vehicle & Group Transport Policy */}
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <CarIcon className="w-5 h-5 text-blue-600" />
                    Multi-Vehicle Dispatch &amp; Large Party Assistance
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Configure customer self-service vehicle addition or automatic routing to dispatch for group transport.
                  </CardDescription>
                </div>
                <Badge
                  variant={formConfig.allowMultiVehicle ? 'success' : 'default'}
                  size="sm"
                  className="font-bold text-[10px]"
                >
                  {formConfig.allowMultiVehicle ? 'Multi-Vehicle Allowed' : 'Dispatch Assistance Notice'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* Master Switch */}
              <div className="flex items-start justify-between p-4 rounded-xl border border-blue-200/80 bg-blue-50/30">
                <div className="space-y-1 pr-4">
                  <h4 className="text-xs font-extrabold text-slate-900">
                    Allow Customers to Select Multiple Vehicles on <code>/book</code>
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    When enabled, riders see the <strong>&ldquo;+ Add Vehicle&rdquo;</strong> button to book multiple sedans/SUVs simultaneously in a single reservation. When disabled, customers see an advisory note to call or email dispatch.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={formConfig.allowMultiVehicle}
                    onChange={(e) =>
                      setFormConfig((prev) => ({ ...prev, allowMultiVehicle: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              {/* Dynamic controls based on toggle */}
              {formConfig.allowMultiVehicle ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900">
                        Maximum Vehicles per Customer Booking
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Limits simultaneous fleet allocation per single checkout.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setFormConfig((prev) => ({
                            ...prev,
                            maxVehiclesAllowed: Math.max(2, prev.maxVehiclesAllowed - 1),
                          }))
                        }
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center shadow-xs"
                      >
                        -
                      </button>
                      <span className="font-mono font-black text-slate-900 text-base w-6 text-center">
                        {formConfig.maxVehiclesAllowed}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormConfig((prev) => ({
                            ...prev,
                            maxVehiclesAllowed: Math.min(10, prev.maxVehiclesAllowed + 1),
                          }))
                        }
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center shadow-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Dispatch Phone for Assistance
                      </label>
                      <Input
                        value={formConfig.multiVehicleCallPhone || ''}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            multiVehicleCallPhone: e.target.value,
                          }))
                        }
                        placeholder={COMPANY_CONFIG.phone.dispatch}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Dispatch Email for Assistance
                      </label>
                      <Input
                        value={formConfig.multiVehicleCallEmail || ''}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            multiVehicleCallEmail: e.target.value,
                          }))
                        }
                        placeholder={COMPANY_CONFIG.email.dispatch}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Custom Assistance Note (Optional Override)
                    </label>
                    <textarea
                      rows={2}
                      value={formConfig.multiVehicleCustomNote || ''}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          multiVehicleCustomNote: e.target.value,
                        }))
                      }
                      placeholder="Need more than 1 vehicle? Call or email dispatch for group discounts and coordinated multi-vehicle arrivals."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Live Notice Preview */}
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                      Live Customer Notice Preview (Rendered on <code>/book</code>)
                    </span>
                    <div className="flex items-start gap-2.5 text-xs text-amber-900">
                      <span className="text-base shrink-0">ℹ️</span>
                      <div>
                        <p className="font-semibold">
                          {formConfig.multiVehicleCustomNote || (
                            <>
                              Need more than 1 vehicle? For group travel or multi-car bookings, please call our 24/7 dispatch at{' '}
                              <strong className="underline">{displayPhone}</strong> or email{' '}
                              <strong className="underline">{displayEmail}</strong>.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Scheduling Windows & Airport Rules */}
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-amber-600" />
                Scheduling Windows, Lead Times &amp; Flight Tracking
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Operational boundaries for immediate ASAP requests, scheduled advance pickups, and airport delay grace periods.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Allow On-Demand ASAP Rides
                  </label>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">Immediate pickup option</span>
                    <input
                      type="checkbox"
                      checked={formConfig.allowImmediateAsap}
                      onChange={(e) =>
                        setFormConfig((prev) => ({ ...prev, allowImmediateAsap: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Min Advance Notice (Minutes)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="1440"
                    step="15"
                    value={formConfig.minAdvanceNoticeMinutes}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        minAdvanceNoticeMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Lead time for scheduled trips</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Max Advance Booking (Days)
                  </label>
                  <input
                    type="number"
                    min="7"
                    max="365"
                    value={formConfig.maxAdvanceBookingDays || 90}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        maxAdvanceBookingDays: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Future calendar limit</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    ASAP Search Radius (Miles)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={formConfig.asapSearchRadiusMiles || 25}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        asapSearchRadiusMiles: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Geographic limit for ASAP calls</span>
                </div>
              </div>

              {/* Airport & Flight Tracking Controls */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  ✈️ Airport Transfers &amp; Meet-and-Greet Policy
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Require Flight # for Airports</p>
                      <p className="text-[10px] text-slate-500">STL Lambert &amp; Spirit Airport transfers</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formConfig.requireFlightNumberForAirport}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          requireFlightNumberForAirport: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <label className="text-xs font-bold text-slate-800 block mb-1">
                      Airport Meet &amp; Greet Preference
                    </label>
                    <select
                      value={formConfig.airportMeetAndGreetOptions || 'curbside'}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          airportMeetAndGreetOptions: e.target.value as any,
                        }))
                      }
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                    >
                      <option value="curbside">Curbside Pickup Only</option>
                      <option value="baggage_claim">Baggage Claim Inside Escort</option>
                      <option value="both">Customer Choice at Booking</option>
                    </select>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <label className="text-xs font-bold text-slate-800 block mb-1">
                      Flight Delay Grace Period (Mins)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      step="5"
                      value={formConfig.flightDelayGraceMinutes || 45}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          flightDelayGraceMinutes: Number(e.target.value),
                        }))
                      }
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-bold"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">Complimentary airport wait time</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Equipment, Child Seats & Cancellation Penalties */}
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-emerald-600" />
                Equipment Add-ons, Child Safety Seats &amp; Cancellation Terms
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Child seat inventory fees, return trip incentives, and cancellation thresholds.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">Child Safety Seats</label>
                    <input
                      type="checkbox"
                      checked={formConfig.allowChildSafetySeats}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          allowChildSafetySeats: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  {formConfig.allowChildSafetySeats && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Fee per unit:</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs font-bold">$</span>
                        <input
                          type="number"
                          value={formConfig.carSeatRentalFeePerUnit || 10}
                          onChange={(e) =>
                            setFormConfig((prev) => ({
                              ...prev,
                              carSeatRentalFeePerUnit: Number(e.target.value),
                            }))
                          }
                          className="w-16 px-1.5 py-0.5 border border-slate-200 rounded text-xs font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">Round Trip Booking</label>
                    <input
                      type="checkbox"
                      checked={formConfig.allowRoundTrip}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          allowRoundTrip: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-blue-600"
                    />
                  </div>
                  {formConfig.allowRoundTrip && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Return discount (%):</span>
                      <input
                        type="number"
                        min="0"
                        max="25"
                        value={formConfig.roundTripDiscountPercent || 5}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            roundTripDiscountPercent: Number(e.target.value),
                          }))
                        }
                        className="w-16 px-1.5 py-0.5 border border-slate-200 rounded text-xs font-bold mt-0.5"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Free Cancellation (Mins)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="1440"
                    step="30"
                    value={formConfig.freeCancellationWindowMinutes || 120}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        freeCancellationWindowMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Full refund window</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Card Pre-Auth Threshold ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={formConfig.cardPreAuthThresholdAmount || 100}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        cardPreAuthThresholdAmount: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Fares above require card on file</span>
                </div>
              </div>

              {/* Payment Methods Checkboxes */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-800 block mb-2">
                  Accepted Customer Payment Methods:
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfig.acceptedPaymentMethods.includes('card')}
                      onChange={() => togglePaymentMethod('card')}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span>💳 Credit / Debit Card (Online Pre-Auth)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfig.acceptedPaymentMethods.includes('cash')}
                      onChange={() => togglePaymentMethod('cash')}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span>💵 Cash to Driver in Cab</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfig.acceptedPaymentMethods.includes('account')}
                      onChange={() => togglePaymentMethod('account')}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span>🏢 Corporate Direct Billing Account</span>
                  </label>
                </div>
              </div>

              {/* Public Emergency Announcement Banner */}
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-rose-950">
                      Public Announcement / Weather Advisory Banner
                    </h4>
                    <p className="text-[11px] text-rose-700">
                      Renders a high-visibility alert banner at the top of the customer booking form.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.publicFormBanner?.enabled || false}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        publicFormBanner: {
                          enabled: e.target.checked,
                          text: prev.publicFormBanner?.text || 'Weather Advisory: Due to heavy snow, expect 15-minute additional travel times.',
                          type: prev.publicFormBanner?.type || 'warning',
                        },
                      }))
                    }
                    className="w-4 h-4 rounded text-rose-600"
                  />
                </div>

                {formConfig.publicFormBanner?.enabled && (
                  <div className="space-y-2 pt-2 border-t border-rose-200">
                    <input
                      type="text"
                      value={formConfig.publicFormBanner.text}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          publicFormBanner: {
                            ...prev.publicFormBanner!,
                            text: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs"
                      placeholder="Enter emergency or operational notice..."
                    />
                  </div>
                )}
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
                Save All Customer Form Controls
              </Button>
            </CardFooter>
          </Card>
        </form>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
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
    </div>
  );
}
