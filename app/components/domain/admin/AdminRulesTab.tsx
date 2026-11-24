import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import {
  ShieldCheckIcon,
  SpinnerIcon,
  CheckIcon,
  AlertTriangleIcon,
  ClockIcon,
  SlidersIcon,
  LockIcon,
  UserIcon,
  CarIcon,
  SparklesIcon,
  MapPinIcon,
  DollarSignIcon,
  CompassIcon,
  InfoIcon,
  RepeatIcon,
  PlaneIcon,
  MoonIcon,
  SunIcon,
  BanIcon,
  StarIcon,
  BoltIcon,
} from '../../ui/Icons';
import {
  BookingRulesEngine,
  type BookingRulesConfig,
  type BookingExecutionMode,
  type ModularTierConfig,
  type RuleLocationMode,
  type RuleTimeMode,
  type RulePaymentMethod,
  DEFAULT_BOOKING_RULES_CONFIG,
} from '../../../core/services/bookingRulesEngine';
import {
  getAdminConfigService,
  DEFAULT_CUSTOMER_BOOKING_CONFIG,
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
} from '../../../core/services/config/admin-config.service';
import { getAdminAuthService } from '../../../core/services/auth/admin-auth.service';
import type { ConfigAuditEntry, DispatchAutomationConfig } from '../../../core/types/config';
import { getZoneService } from '../../../core/services/zones/zone.service';
import type { ZoneGeofence } from '../../../core/types/zone';
import { AdminAutoDispatchControlPanel } from './rules/AdminAutoDispatchControlPanel';
import { ModularTierCard } from './rules/ModularTierCard';

export type AutomationSectionTab =
  | 'auto-dispatch'
  | 'intake-rules'
  | 'console'
  | 'standing-defaults';

export interface AdminRulesTabProps {
  initialSection?: AutomationSectionTab | string;
}

function normalizeAutomationSection(raw?: string): AutomationSectionTab {
  if (
    raw === 'auto-dispatch' ||
    raw === 'intake-rules' ||
    raw === 'console' ||
    raw === 'standing-defaults'
  ) {
    return raw;
  }
  return 'auto-dispatch';
}

export function AdminRulesTab({ initialSection = 'auto-dispatch' }: AdminRulesTabProps = {}) {
  const [activeSection, setActiveSection] = useState<AutomationSectionTab>(() =>
    normalizeAutomationSection(initialSection)
  );

  useEffect(() => {
    setActiveSection(normalizeAutomationSection(initialSection));
  }, [initialSection]);

  const [config, setConfig] = useState<BookingRulesConfig>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    const raw = cached.bookingRulesConfig;
    return {
      ...DEFAULT_BOOKING_RULES_CONFIG,
      ...(raw || {}),
      tier1: {
        ...DEFAULT_BOOKING_RULES_CONFIG.tier1,
        ...(raw?.tier1 || {}),
      },
      tier2: {
        ...DEFAULT_BOOKING_RULES_CONFIG.tier2,
        ...(raw?.tier2 || {}),
      },
      tier3: {
        ...DEFAULT_BOOKING_RULES_CONFIG.tier3,
        ...(raw?.tier3 || {}),
      },
    };
  });

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
  const [dispatchAutomation, setDispatchAutomation] = useState<DispatchAutomationConfig>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    return normalizeDispatchAutomationConfig(
      cached.dispatchAutomation || DEFAULT_DISPATCH_AUTOMATION_CONFIG
    );
  });
  const [alertDismissMinutes, setAlertDismissMinutes] = useState<number>(() => {
    const cached = getAdminConfigService().getCachedSettings();
    return cached.fleetAlertsConfig?.autoDismissMinutes ?? 60;
  });

  // ─── Real-Time Interactive Simulator State ───
  const [simCustomerScore, setSimCustomerScore] = useState<number>(85);
  const [simIsUnratedGuest, setSimIsUnratedGuest] = useState<boolean>(false);
  const [simPickupZoneId, setSimPickupZoneId] = useState<string>('any');
  const [simDropoffZoneId, setSimDropoffZoneId] = useState<string>('any');
  const [simPickupHour, setSimPickupHour] = useState<number>(14);
  const [simFare, setSimFare] = useState<number>(45);
  const [simPaymentMethod, setSimPaymentMethod] = useState<RulePaymentMethod>('prepaid');
  const [simReturnBooked, setSimReturnBooked] = useState<boolean>(false);
  const [simSeparateContact, setSimSeparateContact] = useState<boolean>(false);
  const [simHasStops, setSimHasStops] = useState<boolean>(false);
  const [simMultipleVehicles, setSimMultipleVehicles] = useState<boolean>(false);
  const [simVehicleTier, setSimVehicleTier] = useState<string>('standard');

  useEffect(() => {
    const zService = getZoneService();
    zService
      .getZones()
      .then((res) => {
        setZones(res.filter((z) => z.isActive && !z.isArchived));
      })
      .catch(() => {});

    const unsub = getAdminConfigService().subscribeToSettings((s) => {
      if (s.bookingRulesConfig) {
        setConfig({
          ...DEFAULT_BOOKING_RULES_CONFIG,
          ...s.bookingRulesConfig,
          tier1: {
            ...DEFAULT_BOOKING_RULES_CONFIG.tier1,
            ...(s.bookingRulesConfig?.tier1 || {}),
          },
          tier2: {
            ...DEFAULT_BOOKING_RULES_CONFIG.tier2,
            ...(s.bookingRulesConfig?.tier2 || {}),
          },
          tier3: {
            ...DEFAULT_BOOKING_RULES_CONFIG.tier3,
            ...(s.bookingRulesConfig?.tier3 || {}),
          },
        });
      }
      if (s.customerBookingConfig?.lambertPickupInstructions !== undefined) {
        setLambertInstructions(s.customerBookingConfig.lambertPickupInstructions);
      }
      if (s.dispatchAutomation) {
        setDispatchAutomation(normalizeDispatchAutomationConfig(s.dispatchAutomation));
      }
      if (s.fleetAlertsConfig?.autoDismissMinutes !== undefined) {
        setAlertDismissMinutes(s.fleetAlertsConfig.autoDismissMinutes);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      // Sync backward compatibility fields
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
      setDispatchAutomation(normalizedAutomation);

      const currentActor = getAdminAuthService().getCurrentUser();
      const auditEntry: ConfigAuditEntry = {
        id: `aud-autodispatch-${Date.now()}`,
        timestamp: new Date().toISOString(),
        operatorId: currentActor?.uid || currentActor?.email || 'admin',
        operatorEmail: currentActor?.email || 'admin@chesterfieldtaxi.com',
        tab: 'rules',
        section: 'auto_dispatch',
        action: `Saved Auto-Dispatch Control Center (mode: ${normalizedAutomation.dispatchMode}, leadWindow: ${normalizedAutomation.scheduledDispatchLeadMinutes}m)`,
        ipAddress: 'console',
        changes: {
          dispatchMode: { before: prevAutomation.dispatchMode, after: normalizedAutomation.dispatchMode },
          scheduledDispatchLeadMinutes: {
            before: prevAutomation.scheduledDispatchLeadMinutes,
            after: normalizedAutomation.scheduledDispatchLeadMinutes,
          },
          isPaused: { before: prevAutomation.isPaused, after: normalizedAutomation.isPaused },
        },
      };

      await getAdminConfigService().updateSettings({
        bookingRulesConfig: syncConfig,
        dispatchAutomation: normalizedAutomation,
        fleetAlertsConfig: { autoDismissMinutes: alertDismissMinutes },
        configAuditTrail: [auditEntry, ...(cachedSettings.configAuditTrail || [])].slice(0, 200),
        customerBookingConfig: {
          ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
          ...(cachedSettings.customerBookingConfig || {}),
          lambertPickupInstructions: lambertInstructions,
        },
      });
      setSaveStatus('Booking rules & dispatch automation settings saved and active.');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      console.error('Failed to save booking rules:', err);
      setSaveStatus('Error saving booking rules: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Real-Time Simulation Calculation ───
  const simResult = useMemo(() => {
    const engine = new BookingRulesEngine(config);

    const scheduledDate = new Date();
    scheduledDate.setHours(simPickupHour, 0, 0, 0);

    const isPickupAirport = simPickupZoneId === 'airport';
    const isDropoffAirport = simDropoffZoneId === 'airport';
    const isPickupProhibited = simPickupZoneId === 'prohibited';
    const isDropoffProhibited = simDropoffZoneId === 'prohibited';

    return engine.evaluateBookingRequest(
      {
        fare: simFare,
        fareEstimate: simFare,
        scheduledPickupTime: scheduledDate.toISOString(),
        paymentMethod: simPaymentMethod,
        hasReturnTrip: simReturnBooked,
        hasSeparateContactPerson: simSeparateContact,
        hasIntermediateStops: simHasStops,
        multipleVehiclesRequested: simMultipleVehicles,
        vehicleTier: simVehicleTier as any,
        pickupZoneId: simPickupZoneId !== 'any' ? simPickupZoneId : undefined,
        dropoffZoneId: simDropoffZoneId !== 'any' ? simDropoffZoneId : undefined,
        isPickupAirport,
        isDropoffAirport,
        isPickupProhibited,
        isDropoffProhibited,
        pickupAirportCode: isPickupAirport ? 'STL' : undefined,
      },
      simIsUnratedGuest
        ? undefined
        : ({
            id: 'sim-customer-1',
            email: 'sim@example.com',
            phone: '314-555-0199',
            fullName: 'Simulated Passenger',
            customerScore: simCustomerScore,
            isBlacklisted: false,
          } as any)
    );
  }, [
    config,
    simCustomerScore,
    simIsUnratedGuest,
    simPickupZoneId,
    simDropoffZoneId,
    simPickupHour,
    simFare,
    simPaymentMethod,
    simReturnBooked,
    simSeparateContact,
    simHasStops,
    simMultipleVehicles,
    simVehicleTier,
  ]);

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      {saveStatus && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold ${
            saveStatus.includes('Error')
              ? 'bg-rose-50 text-rose-800 border-rose-300'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}
        >
          {saveStatus}
        </div>
      )}

      {/* ─── SECTION 1: AUTO-PILOT & LEAD WINDOWS ─── */}
      {activeSection === 'auto-dispatch' && (
        <AdminAutoDispatchControlPanel
          config={dispatchAutomation}
          zones={zones}
          isSaving={isSaving}
          onChange={setDispatchAutomation}
          onSave={handleSave}
        />
      )}

      {/* ─── SECTION 2: CONSOLE & CONFLICT GUARD ─── */}
      {activeSection === 'console' && (
        <Card className="border border-slate-200 shadow-xs bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                  <span>Console SLA Thresholds &amp; Staged Shift Conflict Guard</span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure unassigned scheduled pickup SLA alerts, airport buffer lead windows, and tactical alert retention.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs font-bold px-4 py-2"
              >
                {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin mr-1.5" /> : <CheckIcon className="w-4 h-4 mr-1.5" />}
                Save Console Policy
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="font-bold text-slate-800 block mb-1">SLA Warning Lead (Minutes)</label>
                <Input
                  type="number"
                  min={5}
                  max={720}
                  value={dispatchAutomation.slaWarningMinutes}
                  onChange={(e) =>
                    setDispatchAutomation((prev) => ({
                      ...prev,
                      slaWarningMinutes: parseInt(e.target.value, 10) || 60,
                    }))
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
                    setDispatchAutomation((prev) => ({
                      ...prev,
                      slaCriticalMinutes: parseInt(e.target.value, 10) || 30,
                    }))
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
                    setDispatchAutomation((prev) => ({
                      ...prev,
                      airportExtraLeadMinutes: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="bg-white h-9 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Added for STL / SUS / CPS pickups</span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="font-bold text-slate-800 block mb-1">Tactical Alert Auto-Dismiss</label>
                <select
                  value={alertDismissMinutes}
                  onChange={(e) => setAlertDismissMinutes(parseInt(e.target.value, 10) || 60)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour (Default)</option>
                  <option value={120}>2 Hours</option>
                  <option value={240}>4 Hours</option>
                  <option value={0}>Never Auto-Dismiss</option>
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">Dispatch console alert TTL</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── SECTION 3: STANDING ORDER DEFAULTS ─── */}
      {activeSection === 'standing-defaults' && (
        <Card className="border border-slate-200 shadow-xs bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                  <RepeatIcon className="w-5 h-5 text-emerald-600" />
                  <span>Standing Order &amp; Staged Preferred Driver Defaults</span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Default pre-pickup auto-release lead windows for staged recurring series and shift holds.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs font-bold px-4 py-2"
              >
                {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin mr-1.5" /> : <CheckIcon className="w-4 h-4 mr-1.5" />}
                Save Standing Defaults
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start justify-between gap-3 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl cursor-pointer">
                <div>
                  <span className="font-extrabold text-slate-900 block">Auto-Release Staged Preferred Drivers</span>
                  <span className="text-[11px] text-slate-600 mt-0.5 block">
                    Automatically send staged recurring/shift trips to their planned driver once inside the lead window.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={dispatchAutomation.autoReleaseStagedDrivers}
                  onChange={(e) =>
                    setDispatchAutomation((prev) => ({
                      ...prev,
                      autoReleaseStagedDrivers: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 mt-0.5 rounded text-emerald-600"
                />
              </label>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="font-extrabold text-slate-900 block mb-1">
                  Staged Auto-Release Lead Window (Minutes)
                </label>
                <Input
                  type="number"
                  min={15}
                  max={240}
                  value={dispatchAutomation.stagedAutoReleaseLeadMinutes}
                  onChange={(e) =>
                    setDispatchAutomation((prev) => ({
                      ...prev,
                      stagedAutoReleaseLeadMinutes: parseInt(e.target.value, 10) || 45,
                    }))
                  }
                  className="bg-white h-9 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Clamped 15–240 minutes prior to scheduled pickup (default 45m).
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── SECTION 4: BOOKING INTAKE RULES & 3-TIER SIMULATOR ─── */}
      {activeSection === 'intake-rules' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">
                  <SlidersIcon className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Booking Intake Rules</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Set conditions for Auto-Confirm, Dispatcher Review, and Blocked Bookings.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 text-xs font-bold shadow-xs cursor-pointer"
              >
                {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                Save Booking Rules
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {/* TIER 1: AUTO-CONFIRM */}
            <ModularTierCard
              tierKey="tier1"
              tierNumber={1}
              title="Tier 1: Auto-Confirm"
              subtitle="Trips meeting all Tier 1 rules are confirmed automatically without dispatcher review."
              colorTheme="emerald"
              config={config.tier1}
              zones={zones}
              onChange={(t1) => setConfig({ ...config, tier1: t1 })}
            />

            {/* TIER 2: REQUIRE REVIEW */}
            <ModularTierCard
              tierKey="tier2"
              tierNumber={2}
              title="Tier 2: Require Dispatcher Review"
              subtitle="Trips matching any Tier 2 rule are placed in the dispatch review queue."
              colorTheme="amber"
              config={config.tier2}
              zones={zones}
              onChange={(t2) => setConfig({ ...config, tier2: t2 })}
            />

            {/* TIER 3: BLACKLIST & SECURITY BLOCK */}
            <ModularTierCard
              tierKey="tier3"
              tierNumber={3}
              title="Tier 3: Block Booking"
              subtitle="Trips matching any Tier 3 rule are automatically blocked and logged."
              colorTheme="rose"
              config={config.tier3}
              zones={zones}
              onChange={(t3) => setConfig({ ...config, tier3: t3 })}
            />

            {/* AIRPORT RULES & CURBSIDE PICKUP INSTRUCTIONS CARD */}
            <div className="p-5 bg-white border border-blue-200 rounded-2xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                    <PlaneIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      STL Lambert Airport Curbside Pickup Instructions
                    </h3>
                    <p className="text-xs text-slate-500">
                      Curbside doors, terminal baggage claim instructions, or driver meetup points shown to passengers in confirmation emails and receipts when pickup is STL Lambert Airport.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 uppercase tracking-wider self-start sm:self-auto">
                  Airport Rules
                </span>
              </div>

              <textarea
                rows={3}
                value={lambertInstructions}
                onChange={(e) => setLambertInstructions(e.target.value)}
                placeholder="e.g. Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Your driver tracks flight arrivals in real time."
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>Synced automatically with Website → Booking &amp; /track → Airport Rules.</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="text-xs font-bold w-full sm:w-auto justify-center shrink-0"
                >
                  Save Airport Description
                </Button>
              </div>
            </div>
          </div>

          {/* ─── LIVE EVALUATION SANDBOX & SIMULATOR ─── */}
          <Card className="border-2 border-indigo-200 shadow-md overflow-hidden bg-slate-50/60">
        <div className="p-4 sm:p-5 bg-indigo-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-800 rounded-xl text-indigo-200 shrink-0">
              <SparklesIcon className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black">Live 3-Tier Evaluation Sandbox &amp; Simulator</h3>
              <p className="text-xs text-indigo-200">
                Test ride parameters instantly against all configured tiers in real time.
              </p>
            </div>
          </div>
          <Badge variant="primary" size="sm" className="self-start sm:self-auto shrink-0 bg-indigo-700 text-indigo-100 border-indigo-500 font-mono">
            REAL-TIME EXECUTION
          </Badge>
        </div>

        <CardContent className="p-4 sm:p-6 space-y-6">
          {/* Simulator Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
            {/* Client Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Client Score</span>
                <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                  {simIsUnratedGuest ? 'Unrated' : (
                    <>
                      <StarIcon className="w-3 h-3 text-blue-600" />
                      <span>{simCustomerScore}</span>
                    </>
                  )}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                disabled={simIsUnratedGuest}
                value={simCustomerScore}
                onChange={(e) => setSimCustomerScore(parseInt(e.target.value) || 0)}
                className="w-full accent-blue-600 cursor-pointer disabled:opacity-40"
              />
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 pt-1">
                <input
                  type="checkbox"
                  checked={simIsUnratedGuest}
                  onChange={(e) => setSimIsUnratedGuest(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Simulate 1st-Time Guest Rider</span>
              </label>
            </div>

            {/* Separated Pickup Location */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Pickup Location</span>
              <select
                value={simPickupZoneId}
                onChange={(e) => setSimPickupZoneId(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="any">Standard Service Area</option>
                <option value="airport">STL Airport Terminal</option>
                <option value="prohibited">Prohibited Geofence Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Separated Dropoff Location */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Dropoff Location</span>
              <select
                value={simDropoffZoneId}
                onChange={(e) => setSimDropoffZoneId(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="any">Standard Service Area</option>
                <option value="airport">STL Airport Terminal</option>
                <option value="prohibited">Prohibited Geofence Zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pickup Hour */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Pickup Hour</span>
                <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                  {simPickupHour.toString().padStart(2, '0')}:00
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="23"
                value={simPickupHour}
                onChange={(e) => setSimPickupHour(parseInt(e.target.value) || 0)}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                {simPickupHour >= 23 || simPickupHour < 4 ? (
                  <>
                    <MoonIcon className="w-3 h-3 text-indigo-500" />
                    <span>Late Night Window</span>
                  </>
                ) : (
                  <>
                    <SunIcon className="w-3 h-3 text-amber-500" />
                    <span>Standard Operating Hours</span>
                  </>
                )}
              </span>
            </div>

            {/* Estimated Fare */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Estimated Fare ($)</span>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-bold">$</span>
                <Input
                  type="number"
                  min="0"
                  value={simFare}
                  onChange={(e) => setSimFare(parseFloat(e.target.value) || 0)}
                  className="text-xs h-9 pl-6 bg-slate-50"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Payment Method</span>
              <select
                value={simPaymentMethod}
                onChange={(e) => setSimPaymentMethod(e.target.value as RulePaymentMethod)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="prepaid">Prepaid In-App</option>
                <option value="corporate">Corporate Account</option>
                <option value="card">Credit Card (In-Car)</option>
                <option value="cash">Cash on Board</option>
                <option value="voucher">Voucher / Invoiced</option>
              </select>
            </div>

            {/* Vehicle Tier */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Vehicle Class Tier</span>
              <select
                value={simVehicleTier}
                onChange={(e) => setSimVehicleTier(e.target.value)}
                className="w-full text-xs font-semibold py-2 px-2.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-800"
              >
                <option value="standard">Standard Sedan</option>
                <option value="premium">Executive Premium</option>
                <option value="xl">XL SUV (6-Passenger)</option>
                <option value="wheelchair">Wheelchair WAV</option>
              </select>
            </div>

            {/* Operational Flags Toggles */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-bold text-slate-700 block">Trip Complexity Flags:</span>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simReturnBooked}
                    onChange={(e) => setSimReturnBooked(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Return Booked</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simSeparateContact}
                    onChange={(e) => setSimSeparateContact(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>3rd Party Booker</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simHasStops}
                    onChange={(e) => setSimHasStops(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Multi-Stops</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simMultipleVehicles}
                    onChange={(e) => setSimMultipleVehicles(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>2+ Cars</span>
                </label>
              </div>
            </div>
          </div>

          {/* Real-Time Evaluation Result Card */}
          <div className="p-5 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-slate-50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                  Simulated Evaluation Verdict
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {simResult.mode === 'AUTO_CONFIRM' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-emerald-600 text-white shadow-xs">
                      <CheckIcon className="w-4 h-4" />
                      AUTO-CONFIRM (PASS-THROUGH)
                    </span>
                  )}
                  {simResult.mode === 'REQUIRE_REVIEW' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-amber-500 text-white shadow-xs">
                      <AlertTriangleIcon className="w-4 h-4" />
                      FLAGGED FOR DISPATCH REVIEW
                    </span>
                  )}
                  {simResult.mode === 'BLACKLIST_BLOCK' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black bg-rose-600 text-white shadow-xs">
                      <LockIcon className="w-4 h-4" />
                      BLACKLIST BLOCK (403 REJECTED)
                    </span>
                  )}
                </div>
              </div>

              {/* Matched Rule Tags */}
              <div className="flex flex-wrap gap-1.5">
                {(simResult.matchedRuleTags || []).map((tag) => (
                  <Badge key={tag} variant="neutral" size="sm" className="font-mono text-[10px] bg-white border-slate-300">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Detailed Reason */}
            <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs text-slate-700 font-medium">
              <span className="font-bold text-slate-900 block mb-0.5">Decision Rationale:</span>
              {simResult.reason || 'All parameters satisfy automatic confirmation criteria.'}
            </div>

            {/* Quick 3-Tier Summary Status Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-indigo-100/80 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-600">Tier 3 (Security Block):</span>
                {simResult.mode === 'BLACKLIST_BLOCK' ? (
                  <span className="font-black text-rose-600 inline-flex items-center gap-1">
                    <BanIcon className="w-3.5 h-3.5" />
                    TRIGGERED
                  </span>
                ) : (
                  <span className="font-bold text-emerald-600 inline-flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    CLEAR
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-600">Tier 2 (Review Queue):</span>
                {simResult.mode === 'REQUIRE_REVIEW' ? (
                  <span className="font-black text-amber-600 inline-flex items-center gap-1">
                    <AlertTriangleIcon className="w-3.5 h-3.5" />
                    HELD FOR REVIEW
                  </span>
                ) : (
                  <span className="font-bold text-emerald-600 inline-flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    BYPASSED
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-600">Tier 1 (Auto-Confirm):</span>
                {simResult.mode === 'AUTO_CONFIRM' ? (
                  <span className="font-black text-emerald-600 inline-flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    CONFIRMED
                  </span>
                ) : (
                  <span className="font-bold text-slate-400">— NOT ELIGIBLE</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
