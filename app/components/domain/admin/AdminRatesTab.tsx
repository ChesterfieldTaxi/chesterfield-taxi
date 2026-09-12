import React, { useState, useMemo } from 'react';
import type { AppSettings, DynamicPricingConfig } from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { CheckIcon, SparklesIcon, ClockIcon } from '../../ui/Icons';

export interface AdminRatesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

interface NamedPricingRule {
  id: string;
  name: string;
  description: string;
  triggerType: 'time_window' | 'airport' | 'zone' | 'corporate';
  condition: string;
  modifierType: 'flat_override' | 'multiplier' | 'surcharge';
  value: number;
  priority: number;
  isActive: boolean;
}

interface StepIncrementTier {
  id: string;
  minMiles: number;
  maxMiles: number | null;
  ratePerMile: number;
  label: string;
  isPopular?: boolean;
}

export function AdminRatesTab({ settings, onSave, isLoading = false }: AdminRatesTabProps) {
  // Rates Sub-section: 'base' | 'named_rules' | 'step_increments'
  const [activeSubTab, setActiveSubTab] = useState<'base' | 'named_rules' | 'step_increments'>('base');

  const [pricing, setPricing] = useState<DynamicPricingConfig>({ ...settings.pricing });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Simulation parameters for real-time preview
  const [simDistance, setSimDistance] = useState<number>(10);
  const [simDuration, setSimDuration] = useState<number>(20);
  const [simAirport, setSimAirport] = useState<boolean>(false);
  const [simStops, setSimStops] = useState<number>(0);

  // Phase 19 Ready: Named Pricing Rules Shell Mock/Template Data
  const [namedRules, setNamedRules] = useState<NamedPricingRule[]>([
    {
      id: 'rule-airport-flat-sus',
      name: 'Spirit Airport Flat Corridor',
      description: 'Pre-negotiated flat rate for private executive terminal transfers between SUS and Chesterfield hotels.',
      triggerType: 'airport',
      condition: 'Origin or Destination == SUS Airport',
      modifierType: 'flat_override',
      value: 35.0,
      priority: 1,
      isActive: true,
    },
    {
      id: 'rule-rush-hour',
      name: 'I-64 Corridor Morning Rush Surge',
      description: 'Automated 1.25x demand modifier during peak weekday morning commuting window.',
      triggerType: 'time_window',
      condition: 'Mon-Fri 06:30 - 09:00',
      modifierType: 'multiplier',
      value: 1.25,
      priority: 2,
      isActive: true,
    },
    {
      id: 'rule-weekend-late-night',
      name: 'Weekend Late-Night Safe Ride Surcharge',
      description: 'Flat +$5.00 safety and premium driver stipend for early morning weekend pickups.',
      triggerType: 'time_window',
      condition: 'Fri-Sun 00:00 - 04:00',
      modifierType: 'surcharge',
      value: 5.0,
      priority: 3,
      isActive: true,
    },
    {
      id: 'rule-corporate-centene',
      name: 'Corporate Preferred Account Tier',
      description: '10% volume loyalty discount for verified Centene & Monsanto corporate billing IDs.',
      triggerType: 'corporate',
      condition: 'Corporate Account Tagged',
      modifierType: 'multiplier',
      value: 0.9,
      priority: 4,
      isActive: false,
    },
  ]);

  // Phase 19 Ready: Step Increment Tiers Shell
  const [stepTiers, setStepTiers] = useState<StepIncrementTier[]>([
    { id: 'tier-1', minMiles: 0, maxMiles: 5, ratePerMile: 3.5, label: 'Short-Haul Local (0–5 mi)' },
    { id: 'tier-2', minMiles: 5, maxMiles: 15, ratePerMile: 2.5, label: 'Mid-County Standard (5–15 mi)', isPopular: true },
    { id: 'tier-3', minMiles: 15, maxMiles: 30, ratePerMile: 2.15, label: 'Regional Transit (15–30 mi)' },
    { id: 'tier-4', minMiles: 30, maxMiles: null, ratePerMile: 1.85, label: 'Long-Haul Interstate (30+ mi)' },
  ]);

  // Simulated total calculation
  const simulatedFare = useMemo(() => {
    const base = Number(pricing.baseFare) || 0;
    const distanceFare = (Number(pricing.perMileRate) || 0) * simDistance;
    const timeFare = (Number(pricing.perMinuteRate) || 0) * simDuration;
    const variableFare = distanceFare + timeFare;
    const surge = Math.max(1.0, Number(pricing.surgeMultiplier) || 1.0);
    const subtotal = (base + variableFare) * surge;
    const airportFee = simAirport ? Number(pricing.airportFee) || 0 : 0;
    const multiStopFee = simStops * (Number(pricing.multiStopFee) || 5.0);
    const tolls = Number(pricing.defaultTolls) || 0;
    const minFare = Number(pricing.minimumFare) || 0;
    return Math.max(minFare, subtotal + airportFee + multiStopFee + tolls);
  }, [pricing, simDistance, simDuration, simAirport, simStops]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);

      const normalizedPricing: DynamicPricingConfig = {
        baseFare: Math.max(0, Number(pricing.baseFare) || 0),
        perMileRate: Math.max(0, Number(pricing.perMileRate) || 0),
        airportFee: Math.max(0, Number(pricing.airportFee) || 0),
        surgeMultiplier: Math.max(1.0, Number(pricing.surgeMultiplier) || 1.0),
        perMinuteRate: Math.max(0, Number(pricing.perMinuteRate) || 0),
        minimumFare: Math.max(0, Number(pricing.minimumFare) || 0),
        multiStopFee: Math.max(0, Number(pricing.multiStopFee) || 5.0),
        defaultTolls: Math.max(0, Number(pricing.defaultTolls) || 0),
      };

      await onSave({ pricing: normalizedPricing });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update pricing configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRuleActive = (ruleId: string) => {
    setNamedRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, isActive: !r.isActive } : r))
    );
  };

  const getSurgeBadge = (val: number) => {
    if (val <= 1.0) return <Badge variant="neutral">Normal (1.0x)</Badge>;
    if (val <= 1.25) return <Badge variant="info">Elevated ({val.toFixed(2)}x)</Badge>;
    if (val <= 1.5) return <Badge variant="warning">High Demand ({val.toFixed(2)}x)</Badge>;
    return <Badge variant="error">Peak Surge ({val.toFixed(2)}x)</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Rates Top Sub-Navigation Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        {/* Sub-navigation Pills */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubTab('base')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'base'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚡ Live Base Rates
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('named_rules')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeSubTab === 'named_rules'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📜 Named Rules</span>
            <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded-full">
              Preview
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('step_increments')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeSubTab === 'step_increments'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📈 Step Increments</span>
            <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.2 rounded-full">
              Preview
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Pricing &amp; Fare Engine
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Rates Updated">
          New pricing rules and surge controls are now live and synced with Firestore.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      {/* ─── SECTION 1: LIVE BASE RATES ─── */}
      {activeSubTab === 'base' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Core Pricing Matrix */}
            <div className="lg:col-span-7 space-y-6">
              <Card variant="elevated" className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-lg text-slate-900">Base Rates &amp; Mileage</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Core rate parameters applied by the Pure Functional Pricing Pipeline for all generated quotes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Initial Base Fare ($)"
                      type="number"
                      step="0.25"
                      min="0"
                      value={pricing.baseFare}
                      onChange={(e) =>
                        setPricing((prev) => ({ ...prev, baseFare: parseFloat(e.target.value) || 0 }))
                      }
                      helperText="Flag drop fee applied before transit distance"
                      required
                    />

                    <Input
                      label="Per-Mile Rate ($/mi)"
                      type="number"
                      step="0.05"
                      min="0"
                      value={pricing.perMileRate}
                      onChange={(e) =>
                        setPricing((prev) => ({ ...prev, perMileRate: parseFloat(e.target.value) || 0 }))
                      }
                      helperText="Standard rate calculated via road mileage"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Per-Minute Rate ($/min)"
                      type="number"
                      step="0.05"
                      min="0"
                      value={pricing.perMinuteRate ?? 0.35}
                      onChange={(e) =>
                        setPricing((prev) => ({ ...prev, perMinuteRate: parseFloat(e.target.value) || 0 }))
                      }
                      helperText="Traffic delay and waiting time charge"
                    />

                    <Input
                      label="Minimum Fare Floor ($)"
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.minimumFare ?? 10.0}
                      onChange={(e) =>
                        setPricing((prev) => ({ ...prev, minimumFare: parseFloat(e.target.value) || 0 }))
                      }
                      helperText="Minimum amount charged for short trips"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <Input
                      label="Airport Commercial Gate Surcharge ($)"
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.airportFee}
                      onChange={(e) =>
                        setPricing((prev) => ({ ...prev, airportFee: parseFloat(e.target.value) || 0 }))
                      }
                      helperText="Lambert STL / SUS terminal commercial fee"
                      required
                    />

                    <Input
                      label="Intermediate Stop Surcharge ($/stop)"
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.multiStopFee ?? 5.0}
                      onChange={(e) =>
                        setPricing((prev) => ({ ...prev, multiStopFee: parseFloat(e.target.value) || 0 }))
                      }
                      helperText="Fee per intermediate waypoint"
                    />
                  </div>

                  <Input
                    label="Default Highway Tolls ($)"
                    type="number"
                    step="0.50"
                    min="0"
                    value={pricing.defaultTolls ?? 0}
                    onChange={(e) =>
                      setPricing((prev) => ({ ...prev, defaultTolls: parseFloat(e.target.value) || 0 }))
                    }
                    helperText="Default toll amount (bridge/turnpike) automatically added unless waived"
                  />
                </CardContent>
              </Card>

              {/* Dynamic Demand / Surge Control Card */}
              <Card variant="elevated" className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                        <ClockIcon className="w-5 h-5 text-amber-500" />
                        Peak Demand &amp; Surge Multiplier
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">
                        Real-time rate multiplier during bad weather, flight delays, or severe rush hours.
                      </CardDescription>
                    </div>
                    {getSurgeBadge(pricing.surgeMultiplier)}
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700">Surge Multiplier Scale:</span>
                      <span className="text-base font-black text-amber-600">
                        {pricing.surgeMultiplier.toFixed(2)}x
                      </span>
                    </div>

                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.05"
                      value={pricing.surgeMultiplier}
                      onChange={(e) =>
                        setPricing((prev) => ({
                          ...prev,
                          surgeMultiplier: parseFloat(e.target.value) || 1.0,
                        }))
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />

                    <div className="flex justify-between text-[11px] text-slate-400 mt-2 font-mono">
                      <span>1.0x (Normal)</span>
                      <span>1.5x (Busy)</span>
                      <span>2.0x (High)</span>
                      <span>3.0x (Severe)</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {[1.0, 1.25, 1.5, 2.0].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPricing((prev) => ({ ...prev, surgeMultiplier: preset }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          pricing.surgeMultiplier === preset
                            ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {preset === 1.0 ? 'Reset Normal (1.0x)' : `${preset}x Preset`}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Live Fare Simulator */}
            <div className="lg:col-span-5 space-y-6">
              <Card variant="elevated" className="border-slate-200 shadow-xs sticky top-24">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-amber-500" />
                    Live Quote Simulator
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Verify how your rate changes compute in the customer quoting engine.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Estimated Passenger Fare
                    </span>
                    <div className="text-3xl font-black text-amber-400 mt-1">
                      ${simulatedFare.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-2">
                      <span>{simDistance} miles</span> &bull;
                      <span>{simDuration} mins</span>
                      {simAirport && <span>&bull; + Airport Fee</span>}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-slate-700 mb-1 font-semibold">
                        <span>Simulated Road Distance:</span>
                        <span>{simDistance} miles</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="60"
                        step="1"
                        value={simDistance}
                        onChange={(e) => setSimDistance(parseInt(e.target.value) || 1)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-700 mb-1 font-semibold">
                        <span>Simulated Travel Time:</span>
                        <span>{simDuration} mins</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="90"
                        step="5"
                        value={simDuration}
                        onChange={(e) => setSimDuration(parseInt(e.target.value) || 5)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Airport Pickup/Dropoff</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simAirport}
                          onChange={(e) => setSimAirport(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Intermediate Stops</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSimStops((s) => Math.max(0, s - 1))}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-xs font-bold"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{simStops}</span>
                        <button
                          type="button"
                          onClick={() => setSimStops((s) => Math.min(5, s + 1))}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Formula Breakdown */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                    <div className="font-bold text-slate-800">Formula Breakdown:</div>
                    <div className="flex justify-between">
                      <span>Base Flagdrop:</span>
                      <span>${(Number(pricing.baseFare) || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance ({simDistance} mi @ ${pricing.perMileRate}/mi):</span>
                      <span>${((Number(pricing.perMileRate) || 0) * simDistance).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Time ({simDuration} min @ ${pricing.perMinuteRate || 0.35}/min):</span>
                      <span>${((Number(pricing.perMinuteRate) || 0.35) * simDuration).toFixed(2)}</span>
                    </div>
                    {pricing.surgeMultiplier > 1.0 && (
                      <div className="flex justify-between text-amber-600 font-semibold">
                        <span>Surge Multiplier:</span>
                        <span>{pricing.surgeMultiplier.toFixed(2)}x</span>
                      </div>
                    )}
                    {simAirport && (
                      <div className="flex justify-between text-blue-600">
                        <span>Airport Fee:</span>
                        <span>+${(Number(pricing.airportFee) || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {simStops > 0 && (
                      <div className="flex justify-between text-indigo-600">
                        <span>Waypoints ({simStops} @ ${pricing.multiStopFee || 5}):</span>
                        <span>+${(simStops * (Number(pricing.multiStopFee) || 5)).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/50 p-4 border-t border-slate-100 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSaving || isLoading}
                    leftIcon={<CheckIcon className="w-4 h-4" />}
                  >
                    Save &amp; Deploy Rates
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </form>
      )}

      {/* ─── SECTION 2: NAMED PRICING RULES SHELL (PHASE 19 READY) ─── */}
      {activeSubTab === 'named_rules' && (
        <div className="space-y-6">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Named Pricing Rules Engine
                  </h3>
                  <Badge variant="info" size="sm">
                    Phase 19 Target
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-configured priority rules evaluated in runtime sequence against trip context (time, zone, corporate accounts).
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => alert('Phase 19 Feature: Add Custom Named Rule will be wired in Phase 19.')}
              >
                + New Rule Shell
              </Button>
            </div>

            <div className="space-y-3">
              {namedRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-all bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="p-2 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs shrink-0">
                      #{rule.priority}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{rule.name}</h4>
                        <Badge
                          variant={
                            rule.modifierType === 'flat_override'
                              ? 'success'
                              : rule.modifierType === 'multiplier'
                              ? 'warning'
                              : 'default'
                          }
                          size="sm"
                        >
                          {rule.modifierType === 'flat_override'
                            ? `$${rule.value.toFixed(2)} Flat`
                            : rule.modifierType === 'multiplier'
                            ? `${rule.value}x Multiplier`
                            : `+$${rule.value.toFixed(2)} Surcharge`}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{rule.description}</p>
                      <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-2">
                        <span>Condition:</span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                          {rule.condition}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <span
                      className={`text-xs font-semibold ${
                        rule.isActive ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {rule.isActive ? 'Active' : 'Disabled'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.isActive}
                        onChange={() => toggleRuleActive(rule.id)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── SECTION 3: STEP INCREMENT TABLES SHELL (PHASE 19 READY) ─── */}
      {activeSubTab === 'step_increments' && (
        <div className="space-y-6">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Step-Wise Mileage &amp; Distance Increment Tables
                  </h3>
                  <Badge variant="neutral" size="sm">
                    Phase 19 Target
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Allows progressive tiered per-mile rates as route distance increases, offering competitive long-haul rates.
                </p>
              </div>

              <Badge variant="warning" size="sm">
                Preview Mode
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Distance Bracket</th>
                    <th className="px-4 py-3">Min Distance</th>
                    <th className="px-4 py-3">Max Distance</th>
                    <th className="px-4 py-3">Marginal Rate / Mile</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stepTiers.map((tier) => (
                    <tr key={tier.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                        <span>{tier.label}</span>
                        {tier.isPopular && <Badge variant="info" size="sm">Baseline</Badge>}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono">{tier.minMiles} mi</td>
                      <td className="px-4 py-3 text-slate-700 font-mono">
                        {tier.maxMiles !== null ? `${tier.maxMiles} mi` : '∞ (Unlimited)'}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-blue-600 font-mono text-sm">
                        ${tier.ratePerMile.toFixed(2)} / mi
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active in Model
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <span className="font-bold text-slate-900 block mb-1">Phase 19 Integration Note:</span>
              <p>
                In Phase 19, this table will connect to the Pure Functional Pricing Pipeline to compute cumulative integral brackets (e.g., first 5 miles at $3.50/mi, next 10 miles at $2.50/mi, remainder at $2.15/mi).
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
