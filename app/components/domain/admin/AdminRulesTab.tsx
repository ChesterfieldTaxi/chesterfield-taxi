import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { CheckIcon, ClockIcon, SpinnerIcon } from '../../ui/Icons';
import { DEFAULT_BOOKING_RULES_CONFIG, type BookingRulesConfig } from '../../../core/services/bookingRulesEngine';
import {
  DEFAULT_CUSTOMER_BOOKING_CONFIG,
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  DEFAULT_DISPATCH_CONSOLE_CONFIG,
  DEFAULT_STANDING_ORDERS_CONFIG,
  getAdminConfigService,
  normalizeDispatchAutomationConfig,
  normalizeDispatchConsoleConfig,
  normalizeStandingOrdersConfig,
} from '../../../core/services/config/admin-config.service';
import { getAdminAuthService } from '../../../core/services/auth/admin-auth.service';
import type {
  ConfigAuditEntry,
  DispatchAutomationConfig,
  DispatchConsoleSettingsConfig,
  StandingOrdersGovernanceConfig,
} from '../../../core/types/config';
import { getZoneService } from '../../../core/services/zones/zone.service';
import type { ZoneGeofence } from '../../../core/types/zone';
import { AdminAutoDispatchControlPanel } from './rules/AdminAutoDispatchControlPanel';
import { BookingIntakeRulesPanel } from './rules/BookingIntakeRulesPanel';
import { DispatchConsoleSettingsPanel } from './rules/DispatchConsoleSettingsPanel';
import { StandingOrderDefaultsPanel } from './rules/StandingOrderDefaultsPanel';

export type AutomationSectionTab = 'auto-dispatch' | 'intake-rules' | 'console' | 'standing-defaults';

export interface AdminRulesTabProps {
  initialSection?: AutomationSectionTab | string;
}

function normalizeAutomationSection(raw?: string): AutomationSectionTab {
  if (raw === 'auto-dispatch' || raw === 'intake-rules' || raw === 'console' || raw === 'standing-defaults') {
    return raw;
  }
  return 'auto-dispatch';
}

function hydrateBookingRules(raw?: Partial<BookingRulesConfig> | null): BookingRulesConfig {
  return {
    ...DEFAULT_BOOKING_RULES_CONFIG,
    ...(raw || {}),
    tier1: { ...DEFAULT_BOOKING_RULES_CONFIG.tier1, ...(raw?.tier1 || {}) },
    tier2: { ...DEFAULT_BOOKING_RULES_CONFIG.tier2, ...(raw?.tier2 || {}) },
    tier3: { ...DEFAULT_BOOKING_RULES_CONFIG.tier3, ...(raw?.tier3 || {}) },
  };
}

export function AdminRulesTab({ initialSection = 'auto-dispatch' }: AdminRulesTabProps = {}) {
  const [activeSection, setActiveSection] = useState<AutomationSectionTab>(() => normalizeAutomationSection(initialSection));
  useEffect(() => { setActiveSection(normalizeAutomationSection(initialSection)); }, [initialSection]);

  const [config, setConfig] = useState<BookingRulesConfig>(() =>
    hydrateBookingRules(getAdminConfigService().getCachedSettings().bookingRulesConfig)
  );
  const [zones, setZones] = useState<ZoneGeofence[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [lambertInstructions, setLambertInstructions] = useState<string>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    return (
      cached.customerBookingConfig?.lambertPickupInstructions ||
      'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Your driver tracks flight arrivals in real time.'
    );
  });
  const [dispatchAutomation, setDispatchAutomation] = useState<DispatchAutomationConfig>(() =>
    normalizeDispatchAutomationConfig(
      getAdminConfigService().getCachedSettings().dispatchAutomation || DEFAULT_DISPATCH_AUTOMATION_CONFIG
    )
  );
  const [consoleConfig, setConsoleConfig] = useState<DispatchConsoleSettingsConfig>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    return normalizeDispatchConsoleConfig(cached.dispatchConsoleConfig || DEFAULT_DISPATCH_CONSOLE_CONFIG, cached.enableRealtimeRouting);
  });
  const [standingConfig, setStandingConfig] = useState<StandingOrdersGovernanceConfig>(() =>
    normalizeStandingOrdersConfig(getAdminConfigService().getCachedSettings().standingOrdersConfig || DEFAULT_STANDING_ORDERS_CONFIG)
  );
  const [alertDismissMinutes, setAlertDismissMinutes] = useState<number>(
    () => getAdminConfigService().getCachedSettings().fleetAlertsConfig?.autoDismissMinutes ?? 60
  );

  useEffect(() => {
    getZoneService().getZones().then((res) => setZones(res.filter((z) => z.isActive && !z.isArchived))).catch(() => {});
    const unsub = getAdminConfigService().subscribeToSettings((s) => {
      if (s.bookingRulesConfig) setConfig(hydrateBookingRules(s.bookingRulesConfig));
      if (s.customerBookingConfig?.lambertPickupInstructions !== undefined) setLambertInstructions(s.customerBookingConfig.lambertPickupInstructions);
      if (s.dispatchAutomation) setDispatchAutomation(normalizeDispatchAutomationConfig(s.dispatchAutomation));
      setConsoleConfig(normalizeDispatchConsoleConfig(s.dispatchConsoleConfig, s.enableRealtimeRouting));
      setStandingConfig(normalizeStandingOrdersConfig(s.standingOrdersConfig));
      if (s.fleetAlertsConfig?.autoDismissMinutes !== undefined) setAlertDismissMinutes(s.fleetAlertsConfig.autoDismissMinutes);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const syncConfig: BookingRulesConfig = {
        ...config,
        minimumCustomerScoreForAutoConfirm: config.tier1.customerScoreMin ?? 70,
        minimumDriverScoreForPremium: config.tier2.minDriverScoreForPremium ?? 85,
        lateNightReviewRequired: config.tier2.timeMode === 'late_night',
        lateNightStartHour: config.tier2.startHour ?? 23,
        lateNightEndHour: config.tier2.endHour ?? 4,
        blacklistEnabled: config.tier3.enabled ?? true,
      };

      const cachedSettings = getAdminConfigService().getCachedSettings();
      const prevAutomation = normalizeDispatchAutomationConfig(cachedSettings.dispatchAutomation);
      const normalizedAutomation = normalizeDispatchAutomationConfig(dispatchAutomation);
      const normalizedConsole = normalizeDispatchConsoleConfig(consoleConfig, consoleConfig.enableRealtimeRouting);
      const normalizedStanding = normalizeStandingOrdersConfig(standingConfig);

      setDispatchAutomation(normalizedAutomation);
      setConsoleConfig(normalizedConsole);
      setStandingConfig(normalizedStanding);

      const currentActor = getAdminAuthService().getCurrentUser();
      const auditEntry: ConfigAuditEntry = {
        id: `aud-automation-${Date.now()}`,
        timestamp: new Date().toISOString(),
        operatorId: currentActor?.uid || currentActor?.email || 'admin',
        operatorEmail: currentActor?.email || 'admin@chesterfieldtaxi.com',
        tab: 'automation',
        section: activeSection,
        action: `Saved Dispatch & Automation (${activeSection}: mode=${normalizedAutomation.dispatchMode}, conflictGuard=${normalizedConsole.conflictGuardEnabled}, horizon=${normalizedStanding.defaultHorizonDays}d)`,
        ipAddress: 'console',
        changes: {
          dispatchMode: { before: prevAutomation.dispatchMode, after: normalizedAutomation.dispatchMode },
          scheduledDispatchLeadMinutes: { before: prevAutomation.scheduledDispatchLeadMinutes, after: normalizedAutomation.scheduledDispatchLeadMinutes },
        },
      };

      await getAdminConfigService().updateSettings({
        bookingRulesConfig: syncConfig,
        dispatchAutomation: normalizedAutomation,
        dispatchConsoleConfig: normalizedConsole,
        enableRealtimeRouting: normalizedConsole.enableRealtimeRouting,
        standingOrdersConfig: normalizedStanding,
        fleetAlertsConfig: { autoDismissMinutes: alertDismissMinutes },
        configAuditTrail: [auditEntry, ...(cachedSettings.configAuditTrail || [])].slice(0, 200),
        customerBookingConfig: {
          ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
          ...(cachedSettings.customerBookingConfig || {}),
          lambertPickupInstructions: lambertInstructions,
        },
      });
      setSaveStatus('Dispatch & Automation policies saved and synced live.');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus('Error saving settings: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      {saveStatus && (
        <div className={`p-4 rounded-xl border text-xs font-bold ${saveStatus.includes('Error') ? 'bg-status-danger-bg text-status-danger-fg border-status-danger-border' : 'bg-status-success-bg text-status-success-fg border-status-success-border'}`}>
          {saveStatus}
        </div>
      )}

      {activeSection === 'auto-dispatch' && (
        <div className="space-y-6">
          <AdminAutoDispatchControlPanel
            config={dispatchAutomation} zones={zones} isSaving={isSaving}
            onChange={setDispatchAutomation} onSave={handleSave}
          />
          <Card className="border border-border-subtle bg-surface-card shadow-xs">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <ClockIcon className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-extrabold text-fg-primary block">Fleet Tactical Alerts Auto-Dismiss Timer</span>
                  <span className="text-[11px] text-fg-muted">Automatically dismisses non-pinned Dispatch Console tactical alerts after the selected TTL.</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select size="sm" fullWidth={false} value={alertDismissMinutes} onChange={(e) => setAlertDismissMinutes(parseInt(e.target.value, 10) || 0)}>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour (Default)</option>
                  <option value={120}>2 Hours</option>
                  <option value={240}>4 Hours</option>
                  <option value={0}>Never Auto-Dismiss</option>
                </Select>
                <Button size="sm" variant="outline" disabled={isSaving} onClick={handleSave} className="h-9 text-xs font-bold cursor-pointer">
                  {isSaving ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5 mr-1" />} Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === 'intake-rules' && (
        <BookingIntakeRulesPanel
          config={config} zones={zones} lambertInstructions={lambertInstructions} isSaving={isSaving}
          onChangeConfig={setConfig} onChangeLambertInstructions={setLambertInstructions} onSave={handleSave}
        />
      )}

      {activeSection === 'console' && (
        <DispatchConsoleSettingsPanel
          consoleConfig={consoleConfig} dispatchAutomation={dispatchAutomation} isSaving={isSaving}
          onChangeConsoleConfig={setConsoleConfig} onChangeAutomation={setDispatchAutomation} onSave={handleSave}
        />
      )}

      {activeSection === 'standing-defaults' && (
        <StandingOrderDefaultsPanel
          standingConfig={standingConfig} dispatchAutomation={dispatchAutomation} isSaving={isSaving}
          onChangeStandingConfig={setStandingConfig} onChangeAutomation={setDispatchAutomation} onSave={handleSave}
        />
      )}
    </div>
  );
}
