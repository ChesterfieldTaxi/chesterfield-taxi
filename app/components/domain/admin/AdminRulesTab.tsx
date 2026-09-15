import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
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
} from '../../ui/Icons';
import {
  BookingRulesEngine,
  type BookingRulesConfig,
  type BookingExecutionMode,
  DEFAULT_BOOKING_RULES_CONFIG,
} from '../../../core/services/bookingRulesEngine';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { getZoneService } from '../../../core/services/zones/zone.service';
import type { ZoneGeofence } from '../../../core/types/zone';

export function AdminRulesTab() {
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

  // ─── Live Simulator State ───
  const [simCustomerScore, setSimCustomerScore] = useState<number>(85);
  const [simIsBlacklisted, setSimIsBlacklisted] = useState<boolean>(false);
  const [simIsNewCustomer, setSimIsNewCustomer] = useState<boolean>(false);
  const [simHour, setSimHour] = useState<number>(14);
  const [simFare, setSimFare] = useState<number>(45);
  const [simTier, setSimTier] = useState<'standard' | 'premium'>('standard');
  const [simDriverScore, setSimDriverScore] = useState<number>(90);
  const [simLocationRisk, setSimLocationRisk] = useState<'normal' | 'sensitive' | 'prohibited'>('normal');

  useEffect(() => {
    const unsubscribe = getAdminConfigService().subscribeToSettings((settings) => {
      if (settings.bookingRulesConfig) {
        const raw = settings.bookingRulesConfig;
        setConfig({
          ...DEFAULT_BOOKING_RULES_CONFIG,
          ...raw,
          tier1: { ...DEFAULT_BOOKING_RULES_CONFIG.tier1, ...(raw.tier1 || {}) },
          tier2: { ...DEFAULT_BOOKING_RULES_CONFIG.tier2, ...(raw.tier2 || {}) },
          tier3: { ...DEFAULT_BOOKING_RULES_CONFIG.tier3, ...(raw.tier3 || {}) },
        });
      }
    });

    try {
      const zService = getZoneService();
      setZones(zService.getActiveZones());
    } catch {
      // zones fallback
    }

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      // Sync backward compatibility fields
      const syncConfig: BookingRulesConfig = {
        ...config,
        minimumCustomerScoreForAutoConfirm: config.tier1.minCustomerScore ?? 70,
        minimumDriverScoreForPremium: config.tier2.minimumDriverScoreForPremium ?? config.tier2.minDriverScoreForPremium ?? 85,
        lateNightReviewRequired: config.tier2.lateNightReviewRequired ?? config.tier2.lateNightEnabled ?? true,
        lateNightStartHour: config.tier2.lateNightStartHour ?? 23,
        lateNightEndHour: config.tier2.lateNightEndHour ?? 4,
        blacklistEnabled: config.tier3.enabled ?? true,
      };

      await getAdminConfigService().updateSettings({
        bookingRulesConfig: syncConfig,
      });
      setSaveStatus('Booking rules successfully saved and active.');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus('Failed to save rules: ' + (err?.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Evaluate the simulation against current config
  const simEngine = useMemo(() => new BookingRulesEngine(config), [config]);

  const simResult = useMemo(() => {
    const pickupDate = new Date();
    pickupDate.setHours(simHour, 0, 0, 0);

    const isProhibited = simLocationRisk === 'prohibited';
    const isSensitive = simLocationRisk === 'sensitive';

    return simEngine.evaluateBookingRequest(
      {
        vehicleTier: simTier,
        scheduledPickupTime: pickupDate.toISOString(),
        fareEstimate: simFare,
        pickupLocation: isProhibited
          ? { address: 'Simulated High-Risk Zone', coordinates: { lat: 38.6631, lng: -90.5771 } }
          : { address: '123 Main St, Chesterfield, MO', coordinates: { lat: 38.65, lng: -90.55 } },
      },
      {
        id: 'sim-passenger',
        customerScore: simCustomerScore,
        isBlacklisted: simIsBlacklisted,
        blacklistReason: simIsBlacklisted ? 'Flagged for payment fraud / administrative blacklist' : undefined,
        totalTrips: simIsNewCustomer ? 0 : 12,
      } as any,
      {
        driverId: 'sim-driver',
        driverScore: simDriverScore,
      } as any,
      isProhibited
        ? [
            {
              id: 'sim-zone',
              name: 'Prohibited Incident Zone',
              coordinates: { lat: 38.6631, lng: -90.5771 },
              radiusMiles: 2,
              action: 'BLACKLIST_BLOCK',
              isActive: true,
              reasonCode: 'Prohibited spatial safety zone',
            } as any,
          ]
        : isSensitive
        ? [
            {
              id: 'sensitive-zone',
              name: 'High Demand Entertainment Strip',
              coordinates: { lat: 38.65, lng: -90.55 },
              radiusMiles: 1,
              action: 'REQUIRE_REVIEW',
              isActive: true,
              reasonCode: 'Sensitive congestion zone',
            } as any,
          ]
        : []
    );
  }, [
    simEngine,
    simCustomerScore,
    simIsBlacklisted,
    simIsNewCustomer,
    simHour,
    simFare,
    simTier,
    simDriverScore,
    simLocationRisk,
  ]);

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">3-Tier Conditional Booking Rules Engine</h2>
              <p className="text-xs text-slate-500 font-medium">
                Tripartite decision matrix with isolated, dedicated controls for Customer Score, Locations, Operating Time, and Safety Thresholds.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <span
              className={`text-xs font-bold ${
                saveStatus.startsWith('Failed') ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {saveStatus}
            </span>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
          >
            {isSaving && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSaving ? 'Saving...' : 'Save All Tier Rules'}</span>
          </Button>
        </div>
      </div>

      {/* ─── The 3-Tier Lifecycle Overview ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tier 1 Overview */}
        <div className="bg-emerald-50/70 border-2 border-emerald-300/80 rounded-2xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
              Tier 1
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-200"></span>
          </div>
          <h4 className="text-sm font-black text-emerald-950 flex items-center gap-1.5">
            <CheckIcon className="w-4 h-4 text-emerald-600" />
            <span>Auto-Confirm (Mode A)</span>
          </h4>
          <p className="text-xs text-emerald-800/90">
            Pass-through automation for trusted riders in allowed zones and daytime windows. Status becomes <strong>CONFIRMED</strong> immediately.
          </p>
        </div>

        {/* Tier 2 Overview */}
        <div className="bg-amber-50/70 border-2 border-amber-300/80 rounded-2xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
              Tier 2
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-200"></span>
          </div>
          <h4 className="text-sm font-black text-amber-950 flex items-center gap-1.5">
            <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
            <span>Require Review (Mode B)</span>
          </h4>
          <p className="text-xs text-amber-800/90">
            Held in dispatcher review queue. Triggered by low scores, late night hours, high fares, or sensitive zones. Status is <strong>UNCONFIRMED</strong>.
          </p>
        </div>

        {/* Tier 3 Overview */}
        <div className="bg-rose-50/70 border-2 border-rose-300/80 rounded-2xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-300">
              Tier 3
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-200"></span>
          </div>
          <h4 className="text-sm font-black text-rose-950 flex items-center gap-1.5">
            <LockIcon className="w-4 h-4 text-rose-600" />
            <span>Blacklist Block (Mode C)</span>
          </h4>
          <p className="text-xs text-rose-800/90">
            Hard security block (403 Forbidden). Triggered by suspended accounts, grounded vehicles, severe score floors, or prohibited spatial geofences.
          </p>
        </div>
      </div>

      {/* ─── ISOLATED CONTROLS: TIER 1 (AUTO-CONFIRM) ─── */}
      <Card variant="elevated" className="border-2 border-emerald-300 bg-emerald-50/20 shadow-xs">
        <CardHeader className="bg-emerald-100/60 border-b border-emerald-200 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-emerald-700 text-white">
                Tier 1 Controls
              </span>
              <CardTitle className="text-base font-black text-emerald-950">
                Auto-Confirm Policy &amp; Direct Pass-Through
              </CardTitle>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-950 cursor-pointer">
              <input
                type="checkbox"
                checked={config.tier1.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tier1: { ...config.tier1, enabled: e.target.checked },
                  })
                }
                className="rounded accent-emerald-600 w-4 h-4"
              />
              <span>Enable Tier 1 Auto-Confirm</span>
            </label>
          </div>
          <p className="text-xs text-emerald-800/80 mt-1">
            Specify isolated score requirements, allowable operating locations, operating schedule hours, and ticket size caps for automatic approval.
          </p>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Control 1: Customer Score */}
            <div className="p-4 bg-white rounded-xl border border-emerald-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-emerald-600" />
                  <span>Customer Score Control</span>
                </span>
                <span className="text-xs font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ≥ {config.tier1.minCustomerScore}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.tier1.minCustomerScore}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tier1: { ...config.tier1, minCustomerScore: parseInt(e.target.value) || 0 },
                  })
                }
                className="w-full accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0 (All Riders)</span>
                <span>Cutoff: {config.tier1.minCustomerScore}</span>
                <span>100 (VIP only)</span>
              </div>
              <label className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tier1.excludeNewCustomers}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier1: { ...config.tier1, excludeNewCustomers: e.target.checked },
                    })
                  }
                  className="rounded accent-emerald-600"
                />
                <span>Hold 1st-time riders for Tier 2 Review</span>
              </label>
            </div>

            {/* Control 2: Pickup / Dropoff Locations */}
            <div className="p-4 bg-white rounded-xl border border-emerald-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPinIcon className="w-4 h-4 text-emerald-600" />
                  <span>Location Scope Control</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  {config.tier1.locationScope === 'anywhere' ? 'Anywhere' : 'Whitelisted Only'}
                </span>
              </div>
              <select
                value={config.tier1.locationScope}
                onChange={(e: any) =>
                  setConfig({
                    ...config,
                    tier1: { ...config.tier1, locationScope: e.target.value },
                  })
                }
                className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
              >
                <option value="anywhere">Anywhere (All Operational Zones)</option>
                <option value="whitelisted_zones_only">Restricted to Whitelisted Zones Only</option>
              </select>
              <p className="text-[11px] text-slate-500">
                {config.tier1.locationScope === 'anywhere'
                  ? 'All standard zones allow instant auto-confirmation.'
                  : 'Trips with origins outside selected zones drop to Tier 2 review.'}
              </p>
            </div>

            {/* Control 3: Time Windows & Fare Caps */}
            <div className="p-4 bg-white rounded-xl border border-emerald-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ClockIcon className="w-4 h-4 text-emerald-600" />
                  <span>Time &amp; Fare Thresholds</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  {config.tier1.operatingHours === '24_7' ? '24/7 All Hours' : 'Custom Hours'}
                </span>
              </div>
              <select
                value={config.tier1.operatingHours}
                onChange={(e: any) =>
                  setConfig({
                    ...config,
                    tier1: { ...config.tier1, operatingHours: e.target.value },
                  })
                }
                className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
              >
                <option value="24_7">24/7 Continuous (Day &amp; Night)</option>
                <option value="custom_window">Custom Daytime Hours Window</option>
              </select>

              {config.tier1.operatingHours === 'custom_window' && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Start Hour</span>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={config.tier1.customWindowStartHour ?? 5}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          tier1: {
                            ...config.tier1,
                            customWindowStartHour: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      className="text-xs h-7 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-0.5">End Hour</span>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={config.tier1.customWindowEndHour ?? 23}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          tier1: {
                            ...config.tier1,
                            customWindowEndHour: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      className="text-xs h-7 font-mono font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Max Instant Fare Cap:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                  <span>$</span>
                  <Input
                    type="number"
                    min="10"
                    max="1000"
                    value={config.tier1.maxTripFare ?? 250}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tier1: { ...config.tier1, maxTripFare: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-16 h-7 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── ISOLATED CONTROLS: TIER 2 (REQUIRE REVIEW) ─── */}
      <Card variant="elevated" className="border-2 border-amber-300 bg-amber-50/20 shadow-xs">
        <CardHeader className="bg-amber-100/60 border-b border-amber-200 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-amber-700 text-white">
                Tier 2 Controls
              </span>
              <CardTitle className="text-base font-black text-amber-950">
                Require Review &amp; Dispatcher Queue Policy
              </CardTitle>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={config.tier2.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tier2: { ...config.tier2, enabled: e.target.checked },
                  })
                }
                className="rounded accent-amber-600 w-4 h-4"
              />
              <span>Enable Tier 2 Review Holds</span>
            </label>
          </div>
          <p className="text-xs text-amber-800/80 mt-1">
            Configure risk factors that place bookings into the active dispatcher review holding queue for manual inspection.
          </p>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Control 1: Score & Rider Triggers */}
            <div className="p-4 bg-white rounded-xl border border-amber-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-amber-600" />
                  <span>Rider Score Review Threshold</span>
                </span>
                <span className="text-xs font-mono font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  &lt; {config.tier1.minCustomerScore}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Any passenger with customer rating between {config.tier3.hardScoreFloor} and{' '}
                {config.tier1.minCustomerScore} is held for dispatch review.
              </p>
              <label className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tier2.triggerOnNewCustomers}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier2: { ...config.tier2, triggerOnNewCustomers: e.target.checked },
                    })
                  }
                  className="rounded accent-amber-600"
                />
                <span>Hold unverified phone / new accounts</span>
              </label>
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium">Min Driver Score for Premium:</span>
                  <span className="font-mono font-bold text-blue-600">
                    {config.tier2.minimumDriverScoreForPremium} / 100
                  </span>
                </div>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={config.tier2.minimumDriverScoreForPremium}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier2: {
                        ...config.tier2,
                        minimumDriverScoreForPremium: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                  className="text-xs h-7 font-mono font-bold"
                />
              </div>
            </div>

            {/* Control 2: Sensitive Locations */}
            <div className="p-4 bg-white rounded-xl border border-amber-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPinIcon className="w-4 h-4 text-amber-600" />
                  <span>Sensitive Location Flagging</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-amber-700">
                  {config.tier2.flagSensitiveLocations ? 'Active' : 'Disabled'}
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tier2.flagSensitiveLocations}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier2: { ...config.tier2, flagSensitiveLocations: e.target.checked },
                    })
                  }
                  className="rounded accent-amber-600"
                />
                <span>Flag pickups/dropoffs in sensitive zones</span>
              </label>
              <p className="text-[11px] text-slate-500">
                Rides touching high-volume entertainment corridors or crowded venues are flagged with{' '}
                <code className="text-amber-700 font-mono font-bold">#SENSITIVE_ZONE</code> for dispatcher coordination.
              </p>
            </div>

            {/* Control 3: Late Night Windows & High Value */}
            <div className="p-4 bg-white rounded-xl border border-amber-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                  <span>Late Night Review Window</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-amber-700">
                  {config.tier2.lateNightReviewRequired ? 'Enforced' : 'Off'}
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tier2.lateNightReviewRequired}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier2: { ...config.tier2, lateNightReviewRequired: e.target.checked },
                    })
                  }
                  className="rounded accent-amber-600"
                />
                <span>Require review for late-night rides</span>
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Start Hour (24h)</span>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={config.tier2.lateNightStartHour}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tier2: {
                          ...config.tier2,
                          lateNightStartHour: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="text-xs h-7 font-mono font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-0.5">End Hour (24h)</span>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={config.tier2.lateNightEndHour}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tier2: {
                          ...config.tier2,
                          lateNightEndHour: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="text-xs h-7 font-mono font-bold"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Flag High Fare (&gt;$):</span>
                <Input
                  type="number"
                  min="20"
                  max="2000"
                  value={config.tier2.highValueFareThreshold ?? 150}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier2: {
                        ...config.tier2,
                        highValueFareThreshold: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-16 h-7 text-xs font-mono font-bold"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── ISOLATED CONTROLS: TIER 3 (BLACKLIST BLOCK) ─── */}
      <Card variant="elevated" className="border-2 border-rose-300 bg-rose-50/20 shadow-xs">
        <CardHeader className="bg-rose-100/60 border-b border-rose-200 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-rose-700 text-white">
                Tier 3 Controls
              </span>
              <CardTitle className="text-base font-black text-rose-950">
                Universal Blacklist &amp; Security Rejection Policy
              </CardTitle>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-rose-950 cursor-pointer">
              <input
                type="checkbox"
                checked={config.tier3.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tier3: { ...config.tier3, enabled: e.target.checked },
                  })
                }
                className="rounded accent-rose-600 w-4 h-4"
              />
              <span>Enable Tier 3 Hard Block</span>
            </label>
          </div>
          <p className="text-xs text-rose-800/80 mt-1">
            Zero-tolerance security controls. Immediate 403 Forbidden with immutable audit logging on security violations.
          </p>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Control 1: Hard Score Floor */}
            <div className="p-4 bg-white rounded-xl border border-rose-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-rose-600" />
                  <span>Hard Customer Score Floor</span>
                </span>
                <span className="text-xs font-mono font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  &lt; {config.tier3.hardScoreFloor}
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tier3.hardScoreFloorEnabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier3: { ...config.tier3, hardScoreFloorEnabled: e.target.checked },
                    })
                  }
                  className="rounded accent-rose-600"
                />
                <span>Auto-block severely low scores</span>
              </label>
              <input
                type="range"
                min="0"
                max="50"
                value={config.tier3.hardScoreFloor}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    tier3: { ...config.tier3, hardScoreFloor: parseInt(e.target.value) || 0 },
                  })
                }
                className="w-full accent-rose-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0 (Absolute minimum)</span>
                <span>Cutoff: {config.tier3.hardScoreFloor}</span>
                <span>50</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Any booking from a user below this rating is automatically rejected with a 403 response.
              </p>
            </div>

            {/* Control 2: Prohibited Exclusion Zones */}
            <div className="p-4 bg-white rounded-xl border border-rose-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPinIcon className="w-4 h-4 text-rose-600" />
                  <span>Prohibited Geofence Zones</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-rose-700">
                  {config.tier3.blockProhibitedZones ? 'Active' : 'Off'}
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.tier3.blockProhibitedZones}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tier3: { ...config.tier3, blockProhibitedZones: e.target.checked },
                    })
                  }
                  className="rounded accent-rose-600"
                />
                <span>Block prohibited spatial exclusion zones</span>
              </label>
              <p className="text-[11px] text-slate-500">
                Trips starting or ending inside zones marked as <em>Blacklisted / Prohibited</em> are instantly blocked.
              </p>
            </div>

            {/* Control 3: Governance Entities & Audit Logging */}
            <div className="p-4 bg-white rounded-xl border border-rose-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheckIcon className="w-4 h-4 text-rose-600" />
                  <span>Governance &amp; Audit Trail</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-rose-700">Audit Active</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.tier3.blockBlacklistedCustomers}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tier3: { ...config.tier3, blockBlacklistedCustomers: e.target.checked },
                      })
                    }
                    className="rounded accent-rose-600"
                  />
                  <span>Block suspended passenger accounts</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.tier3.blockGroundedVehicles}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tier3: { ...config.tier3, blockGroundedVehicles: e.target.checked },
                      })
                    }
                    className="rounded accent-rose-600"
                  />
                  <span>Block grounded fleet vehicles</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.tier3.logSecurityAudit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tier3: { ...config.tier3, logSecurityAudit: e.target.checked },
                      })
                    }
                    className="rounded accent-rose-600"
                  />
                  <span>Log immutable security audit trail</span>
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Interactive 3-Tier Sandbox / Simulator ─── */}
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/30 shadow-md">
        <CardHeader className="pb-3 border-b border-indigo-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-indigo-600" />
              <CardTitle className="text-base font-black text-slate-900">
                Interactive 3-Tier Rule Evaluation Simulator
              </CardTitle>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
              Live Real-Time Engine
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Simulate any booking scenario below to verify which Tier the Booking Rules Engine assigns in real-time.
          </p>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Simulation Controls */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer Score */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Customer Score</span>
                    </label>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded ${
                        simCustomerScore >= config.tier1.minCustomerScore
                          ? 'bg-emerald-100 text-emerald-800'
                          : simCustomerScore >= (config.tier3.hardScoreFloor ?? 40)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      ★ {simCustomerScore} / 100
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={simCustomerScore}
                    onChange={(e) => setSimCustomerScore(parseInt(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>0 (Blocked &lt; {config.tier3.hardScoreFloor ?? 40})</span>
                    <span className="text-amber-600 font-bold">Review</span>
                    <span className="text-emerald-600 font-bold">Pass ≥ {config.tier1.minCustomerScore}</span>
                  </div>
                </div>

                {/* Pickup Time of Day */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pickup Time (Hour)</span>
                    </label>
                    <span className="text-xs font-black font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-800">
                      {String(simHour).padStart(2, '0')}:00
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="23"
                    value={simHour}
                    onChange={(e) => setSimHour(parseInt(e.target.value))}
                    className="w-full accent-amber-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>00:00 (Late Night)</span>
                    <span>12:00 (Standard)</span>
                    <span>23:00</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Fare and Zone selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Simulated Fare */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <DollarSignIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Trip Fare Estimate</span>
                    </label>
                    <span className="text-xs font-mono font-bold text-slate-800">${simFare}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="400"
                    step="5"
                    value={simFare}
                    onChange={(e) => setSimFare(parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>$10</span>
                    <span>Tier 2 Cap: ${config.tier2.highValueFareThreshold}</span>
                    <span>$400</span>
                  </div>
                </div>

                {/* Spatial Zone Type */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1 shadow-2xs">
                  <label className="text-xs font-bold text-slate-700 block">Pickup / Dropoff Spatial Zone</label>
                  <select
                    value={simLocationRisk}
                    onChange={(e: any) => setSimLocationRisk(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                  >
                    <option value="normal">Normal Operational Zone</option>
                    <option value="sensitive">Sensitive Congestion Zone (Flagged)</option>
                    <option value="prohibited">Prohibited Incident Exclusion Zone (Blocked)</option>
                  </select>
                </div>
              </div>

              {/* Toggles Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Blacklisted Passenger */}
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    simIsBlacklisted
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">Blacklisted User</span>
                    <input
                      type="checkbox"
                      checked={simIsBlacklisted}
                      onChange={(e) => setSimIsBlacklisted(e.target.checked)}
                      className="rounded accent-rose-600"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Simulate suspended phone/email</span>
                </label>

                {/* First-time Passenger */}
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    simIsNewCustomer
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">1st-Time Customer</span>
                    <input
                      type="checkbox"
                      checked={simIsNewCustomer}
                      onChange={(e) => setSimIsNewCustomer(e.target.checked)}
                      className="rounded accent-amber-600"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Unverified new rider</span>
                </label>

                {/* Service Class */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Service Class</label>
                  <select
                    value={simTier}
                    onChange={(e: any) => setSimTier(e.target.value)}
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                  >
                    <option value="standard">Standard Sedan</option>
                    <option value="premium">Premium Chauffeur</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Simulation Results Display Panel */}
            <div className="lg:col-span-5">
              <div
                className={`p-5 rounded-2xl border-2 transition-all space-y-4 shadow-sm ${
                  simResult.mode === 'AUTO_CONFIRM'
                    ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950'
                    : simResult.mode === 'REQUIRE_REVIEW'
                    ? 'bg-amber-50/80 border-amber-400 text-amber-950'
                    : 'bg-rose-50/80 border-rose-400 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between border-b pb-3 border-slate-200/60">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                    Engine Evaluation Result
                  </span>
                  <Badge
                    variant={
                      simResult.mode === 'AUTO_CONFIRM'
                        ? 'success'
                        : simResult.mode === 'REQUIRE_REVIEW'
                        ? 'warning'
                        : 'danger'
                    }
                    size="sm"
                    className="font-black text-xs"
                  >
                    {simResult.mode}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="text-lg font-black flex items-center gap-2">
                    {simResult.mode === 'AUTO_CONFIRM' && <CheckIcon className="w-5 h-5 text-emerald-600" />}
                    {simResult.mode === 'REQUIRE_REVIEW' && (
                      <AlertTriangleIcon className="w-5 h-5 text-amber-600" />
                    )}
                    {simResult.mode === 'BLACKLIST_BLOCK' && <LockIcon className="w-5 h-5 text-rose-600" />}
                    <span>
                      {simResult.mode === 'AUTO_CONFIRM' && 'Tier 1: Approved'}
                      {simResult.mode === 'REQUIRE_REVIEW' && 'Tier 2: Hold For Review'}
                      {simResult.mode === 'BLACKLIST_BLOCK' && 'Tier 3: Hard Block'}
                    </span>
                  </div>
                  <div className="text-xs font-medium leading-relaxed opacity-90">
                    {simResult.reason}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-300/50 text-xs">
                  {simResult.matchedRuleTags && simResult.matchedRuleTags.length > 0 && (
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider block opacity-75 mb-1">
                        Matched Rule Tags:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {simResult.matchedRuleTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-white/80 border border-slate-300 shadow-2xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] font-semibold opacity-80 pt-1">
                    {simResult.mode === 'AUTO_CONFIRM' &&
                      'Trip status set to CONFIRMED. Drivers notified immediately.'}
                    {simResult.mode === 'REQUIRE_REVIEW' &&
                      'Trip status set to UNCONFIRMED. Placed in Dispatch Active Queue for human review.'}
                    {simResult.mode === 'BLACKLIST_BLOCK' &&
                      'Throws 403 Forbidden. Immutable security audit log recorded under ct_security_audit_v1.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
