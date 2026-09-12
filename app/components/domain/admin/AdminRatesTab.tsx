import React, { useState, useMemo, useEffect } from 'react';
import type {
  AppSettings,
  DynamicPricingConfig,
  NamedPricingRule,
  StepIncrementTier,
  DelayRateConfig,
  ConditionSurchargeConfig,
  PricingRuleTrigger,
  PricingRuleModifier,
} from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { CheckIcon, SparklesIcon, ClockIcon, CarIcon, UserIcon } from '../../ui/Icons';
import {
  getPricingRulesService,
  DEFAULT_NAMED_PRICING_RULES,
} from '../../../core/services/pricing/pricing-rules.service';
import { calculateTripPricing } from '../../../core/services/pricing/pipeline';
import type { VehicleTier } from '../../../core/types/trip';
import { getZoneService } from '../../../core/services/zones/zone.service';
import type { ZoneGeofence } from '../../../core/types/zone';

export interface AdminRatesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

const DEFAULT_CONDITION_SURCHARGES: ConditionSurchargeConfig = {
  carSeatFeePerUnit: 5.00,
  passengerBaseAllowance: 2,
  extraPassengerFeePerHead: 3.00,
  vehicleTierSurcharges: {
    standard: { flat: 0, percent: 0 },
    premium: { flat: 15.00, percent: 0 },
    xl: { flat: 20.00, percent: 0 },
    wheelchair: { flat: 0, percent: 0 },
  },
  zoneSurcharges: {},
};

export function AdminRatesTab({ settings, onSave, isLoading = false }: AdminRatesTabProps) {
  // Rates Sub-section: 4 tabs
  const [activeSubTab, setActiveSubTab] = useState<'base' | 'named_rules' | 'step_increments' | 'condition_surcharges'>('base');

  const [pricing, setPricing] = useState<DynamicPricingConfig>({
    ...settings.pricing,
    flagDropIncludedMiles: settings.pricing.flagDropIncludedMiles ?? 1.5,
    useStepIncrements: settings.pricing.useStepIncrements ?? false,
    stepIncrementTiers: settings.pricing.stepIncrementTiers ?? [
      { id: 'tier-1', name: 'Initial Distance (0-5 mi)', startMiles: 0, endMiles: 5, stepMiles: 0.1, ratePerStep: 0.35 },
      { id: 'tier-2', name: 'Intermediate (5-15 mi)', startMiles: 5, endMiles: 15, stepMiles: 0.1, ratePerStep: 0.25 },
      { id: 'tier-3', name: 'Long Range (15-30 mi)', startMiles: 15, endMiles: 30, stepMiles: 0.1, ratePerStep: 0.20 },
      { id: 'tier-4', name: 'Extended Regional (30+ mi)', startMiles: 30, endMiles: 999, stepMiles: 0.1, ratePerStep: 0.15 },
    ],
    delayRate: settings.pricing.delayRate ?? {
      stepSeconds: 90,
      ratePerStep: 0.60,
      gracePeriodMinutes: 5,
    },
    conditionSurcharges: settings.pricing.conditionSurcharges ?? {
      carSeatFeePerUnit: 5.00,
      passengerBaseAllowance: 2,
      extraPassengerFeePerHead: 3.00,
      vehicleTierSurcharges: {
        standard: { flat: 0, percent: 0 },
        premium: { flat: 15.00, percent: 0 },
        xl: { flat: 20.00, percent: 0 },
        wheelchair: { flat: 0, percent: 0 },
      },
      zoneSurcharges: {},
    },
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Named Pricing Rules Repository state
  const [namedRules, setNamedRules] = useState<NamedPricingRule[]>(DEFAULT_NAMED_PRICING_RULES);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<NamedPricingRule | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [zones, setZones] = useState<ZoneGeofence[]>([]);

  // Simulator state
  const [simDistance, setSimDistance] = useState<number>(10);
  const [simDuration, setSimDuration] = useState<number>(20);
  const [simVehicleTier, setSimVehicleTier] = useState<VehicleTier>('standard');
  const [simAirport, setSimAirport] = useState<boolean>(false);
  const [simStops, setSimStops] = useState<number>(0);
  const [simCarSeats, setSimCarSeats] = useState<number>(0);
  const [simPassengers, setSimPassengers] = useState<number>(1);
  const [simDelayMinutes, setSimDelayMinutes] = useState<number>(0);
  const [simSelectedRuleId, setSimSelectedRuleId] = useState<string>('');

  // Subscribe to Firestore /pricingRules and /zones
  useEffect(() => {
    const rulesService = getPricingRulesService();
    const unsubscribeRules = rulesService.subscribeToRules((rules) => {
      setNamedRules(rules);
      setRulesLoading(false);
    });

    const zoneService = getZoneService();
    const unsubscribeZones = zoneService.subscribeToZones((loadedZones) => {
      setZones(loadedZones);
    });

    return () => {
      unsubscribeRules();
      unsubscribeZones();
    };
  }, []);

  // Live Pure Functional Pipeline Simulation
  const calculationResult = useMemo(() => {
    return calculateTripPricing(
      {
        distanceMiles: simDistance,
        durationMinutes: simDuration,
        vehicleTier: simVehicleTier,
        pickupDateTime: new Date().toISOString(),
        isAirportPickup: simAirport,
        intermediateStopsCount: simStops,
        carSeatsBreakdown: { total: simCarSeats },
        passengers: simPassengers,
        delayMinutes: simDelayMinutes,
        selectedRuleId: simSelectedRuleId || undefined,
      },
      {
        baseFare: Number(pricing.baseFare) || 5.0,
        perMileRate: Number(pricing.perMileRate) || 2.25,
        perMinuteRate: Number(pricing.perMinuteRate) || 0.35,
        minimumFare: Number(pricing.minimumFare) || 10.0,
        multiStopFee: Number(pricing.multiStopFee) || 5.0,
        airportSurcharge: simAirport ? Number(pricing.airportFee) || 4.0 : 0,
        manualSurgeMultiplier: Number(pricing.surgeMultiplier) || 1.0,
        flagDropIncludedMiles: Number(pricing.flagDropIncludedMiles) || 0,
        useStepIncrements: Boolean(pricing.useStepIncrements),
        stepIncrementTiers: pricing.stepIncrementTiers,
        delayRate: pricing.delayRate,
        conditionSurcharges: pricing.conditionSurcharges,
        namedPricingRules: namedRules,
      }
    );
  }, [
    pricing,
    namedRules,
    simDistance,
    simDuration,
    simVehicleTier,
    simAirport,
    simStops,
    simCarSeats,
    simPassengers,
    simDelayMinutes,
    simSelectedRuleId,
  ]);

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);

      const normalizedPricing: DynamicPricingConfig = {
        ...pricing,
        baseFare: Math.max(0, Number(pricing.baseFare) || 0),
        perMileRate: Math.max(0, Number(pricing.perMileRate) || 0),
        airportFee: Math.max(0, Number(pricing.airportFee) || 0),
        surgeMultiplier: Math.max(1.0, Number(pricing.surgeMultiplier) || 1.0),
        perMinuteRate: Math.max(0, Number(pricing.perMinuteRate) || 0),
        minimumFare: Math.max(0, Number(pricing.minimumFare) || 0),
        multiStopFee: Math.max(0, Number(pricing.multiStopFee) || 5.0),
        defaultTolls: Math.max(0, Number(pricing.defaultTolls) || 0),
        flagDropIncludedMiles: Math.max(0, Number(pricing.flagDropIncludedMiles) || 0),
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

  // Toggle Rule active
  const handleToggleRuleActive = async (rule: NamedPricingRule) => {
    const updated = { ...rule, isActive: !rule.isActive };
    const rulesService = getPricingRulesService();
    await rulesService.saveRule(updated);
  };

  // Toggle Rule Driver Selection
  const handleToggleDriverSelection = async (rule: NamedPricingRule) => {
    const updated = { ...rule, allowDriverSelection: !rule.allowDriverSelection };
    const rulesService = getPricingRulesService();
    await rulesService.saveRule(updated);
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to delete this pricing rule?')) return;
    const rulesService = getPricingRulesService();
    await rulesService.deleteRule(ruleId);
  };

  // Reset Rules to default
  const handleResetRulesToDefaults = async () => {
    if (!window.confirm('Reset all Named Pricing Rules to regional Chesterfield/St. Louis defaults?')) return;
    const rulesService = getPricingRulesService();
    await rulesService.resetToDefaults();
  };

  // Open modal to create a new rule
  const handleOpenCreateRule = () => {
    setEditingRule({
      id: '',
      name: '',
      description: '',
      priority: 50,
      isActive: true,
      allowDriverSelection: true,
      triggers: {},
      modifier: {
        type: 'flat_override',
        value: 30.00,
      },
    });
    setIsRuleModalOpen(true);
  };

  // Save rule from modal
  const handleSaveRuleModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !editingRule.name.trim()) return;

    try {
      setIsSaving(true);
      const rulesService = getPricingRulesService();
      await rulesService.saveRule(editingRule);
      setIsRuleModalOpen(false);
      setEditingRule(null);
    } catch (err) {
      console.error('Failed to save rule:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rates Top Sub-Navigation Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubTab('base')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeSubTab === 'base'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>⚡ Base &amp; Simulator</span>
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
              {namedRules.length}
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
            {pricing.useStepIncrements && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded-full">
                ON
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('condition_surcharges')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeSubTab === 'condition_surcharges'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🚼 Extras &amp; Equipment</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSaveSettings}
            isLoading={isSaving || isLoading}
            leftIcon={<CheckIcon className="w-4 h-4" />}
          >
            Save All Rates
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Pricing Matrix Updated">
          New pricing rules, brackets, and surcharges have been successfully saved to Firestore.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      {/* ─── SUB-TAB 1: BASE RATES & FARE SIMULATOR ─── */}
      {activeSubTab === 'base' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Base Parameters Column */}
          <div className="lg:col-span-7 space-y-6">
            <Card variant="elevated" className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-base text-slate-900 font-bold">Standard Flag Drop &amp; Mileage</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Core base parameters applied by the Pure Functional Pricing Pipeline for all generated trips.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Flag Drop Base Fare ($)
                    </label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={pricing.baseFare}
                      onChange={(e) => setPricing({ ...pricing, baseFare: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Starting charge upon passenger pickup.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Flag Drop Included Distance (mi)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={pricing.flagDropIncludedMiles ?? 1.5}
                      onChange={(e) => setPricing({ ...pricing, flagDropIncludedMiles: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Initial distance covered by the base fare before mileage rates apply.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Standard Rate Per Mile ($)
                    </label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      value={pricing.perMileRate}
                      onChange={(e) => setPricing({ ...pricing, perMileRate: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Default linear rate per statute mile driven.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Standard Rate Per Minute ($)
                    </label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      value={pricing.perMinuteRate || 0.35}
                      onChange={(e) => setPricing({ ...pricing, perMinuteRate: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Standard transit time fee per minute.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Absolute Minimum Fare Floor ($)
                    </label>
                    <Input
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.minimumFare}
                      onChange={(e) => setPricing({ ...pricing, minimumFare: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Minimum trip charge regardless of discounts.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Intermediate Stop Fee ($)
                    </label>
                    <Input
                      type="number"
                      step="1.00"
                      min="0"
                      value={pricing.multiStopFee || 5.0}
                      onChange={(e) => setPricing({ ...pricing, multiStopFee: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Fee per additional intermediate waypoint stop.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Airport Gate Access Fee ($)
                    </label>
                    <Input
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.airportFee}
                      onChange={(e) => setPricing({ ...pricing, airportFee: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Terminal curb fee for commercial airport runs.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Default Toll Allowance ($)
                    </label>
                    <Input
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.defaultTolls || 0}
                      onChange={(e) => setPricing({ ...pricing, defaultTolls: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Default bridge/highway toll pass-through.</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900">Manual Demand Surge Multiplier</div>
                      <div className="text-xs text-slate-500">Global multiplier applied across base and variable rates.</div>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        step="0.05"
                        min="1.0"
                        max="4.0"
                        value={pricing.surgeMultiplier || 1.0}
                        onChange={(e) => setPricing({ ...pricing, surgeMultiplier: parseFloat(e.target.value) || 1.0 })}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Simulator Column */}
          <div className="lg:col-span-5 space-y-6">
            <Card variant="elevated" className="border-blue-200 bg-linear-to-b from-blue-50/40 to-white shadow-xs">
              <CardHeader className="border-b border-blue-100 bg-blue-50/80">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-slate-900 font-bold flex items-center gap-1.5">
                      <SparklesIcon className="w-4 h-4 text-blue-600" />
                      Fare Matrix Simulator
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-600">
                      Real-time pure pipeline evaluation with live audit trail.
                    </CardDescription>
                  </div>
                  <Badge variant="info" size="md">
                    ${calculationResult.context.totalFare.toFixed(2)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Distance slider */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Trip Distance:</span>
                    <span className="font-mono text-blue-700 font-bold">{simDistance} miles</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="60"
                    step="0.5"
                    value={simDistance}
                    onChange={(e) => setSimDistance(parseFloat(e.target.value) || 1)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Duration slider */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Trip Duration:</span>
                    <span className="font-mono text-blue-700 font-bold">{simDuration} mins</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="90"
                    step="1"
                    value={simDuration}
                    onChange={(e) => setSimDuration(parseInt(e.target.value) || 5)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Vehicle Class */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Vehicle Class</label>
                    <select
                      value={simVehicleTier}
                      onChange={(e) => setSimVehicleTier(e.target.value as VehicleTier)}
                      className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 font-medium"
                    >
                      <option value="standard">Standard Sedan (1.0x)</option>
                      <option value="premium">Executive Black (1.5x)</option>
                      <option value="xl">XL Group Van (1.75x)</option>
                      <option value="wheelchair">WAV Accessibility (1.0x)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Named Rule Override</label>
                    <select
                      value={simSelectedRuleId}
                      onChange={(e) => setSimSelectedRuleId(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 font-medium"
                    >
                      <option value="">Auto-Evaluate Matching Rules</option>
                      {namedRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Delay & Extras row */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Car Seats</label>
                    <input
                      type="number"
                      min="0"
                      max="3"
                      value={simCarSeats}
                      onChange={(e) => setSimCarSeats(parseInt(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-md p-1.5 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Passengers</label>
                    <input
                      type="number"
                      min="1"
                      max="7"
                      value={simPassengers}
                      onChange={(e) => setSimPassengers(parseInt(e.target.value) || 1)}
                      className="w-full border border-slate-200 rounded-md p-1.5 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Wait Delay (m)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={simDelayMinutes}
                      onChange={(e) => setSimDelayMinutes(parseInt(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-md p-1.5 text-center font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={simAirport}
                      onChange={(e) => setSimAirport(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Airport Terminal Drop/Pickup
                  </label>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-slate-600">Stops:</span>
                    <button
                      type="button"
                      onClick={() => setSimStops((s) => Math.max(0, s - 1))}
                      className="w-6 h-6 rounded bg-slate-200 text-slate-700 font-bold"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold">{simStops}</span>
                    <button
                      type="button"
                      onClick={() => setSimStops((s) => Math.min(5, s + 1))}
                      className="w-6 h-6 rounded bg-slate-200 text-slate-700 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Audit Trail Log */}
                <div className="mt-4 p-3 bg-slate-900 rounded-xl text-slate-200 text-[11px] font-mono space-y-1.5 max-h-56 overflow-y-auto">
                  <div className="text-amber-400 font-bold text-xs border-b border-slate-800 pb-1 flex justify-between items-center">
                    <span>PIPELINE AUDIT TRACE</span>
                    <span>TOTAL: ${calculationResult.context.totalFare.toFixed(2)}</span>
                  </div>
                  {calculationResult.context.auditTrail.map((step) => (
                    <div key={step.stepNumber} className="flex justify-between items-start gap-2 py-0.5 border-b border-slate-800/40">
                      <div>
                        <span className="text-blue-400 font-bold">[{step.stepNumber}. {step.stepName}]</span>{' '}
                        <span className="text-slate-300">{step.description}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={step.appliedDelta >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {step.appliedDelta >= 0 ? `+$${step.appliedDelta.toFixed(2)}` : `-$${Math.abs(step.appliedDelta).toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 2: NAMED PRICING RULES (FIRESTORE CRUD) ─── */}
      {activeSubTab === 'named_rules' && (
        <div className="space-y-6">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Named Pricing Rules Repository
                  </h3>
                  <Badge variant="info" size="sm">
                    /pricingRules Firestore
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Priority-ordered condition-based pricing rules. Evaluated dynamically or selected manually by dispatchers and drivers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetRulesToDefaults}
                >
                  ↺ Reset Regional Defaults
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleOpenCreateRule}
                >
                  + Add Named Rule
                </Button>
              </div>
            </div>

            {rulesLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading rules repository...</div>
            ) : (
              <div className="space-y-3">
                {namedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-xl border transition-all ${
                      rule.isActive ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-slate-100 bg-slate-50/60 opacity-60'
                    } flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="p-2 rounded-lg bg-blue-50 text-blue-700 font-extrabold text-xs shrink-0">
                        #{rule.priority}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm">{rule.name}</h4>
                          <Badge
                            variant={
                              rule.modifier.type === 'flat_override'
                                ? 'success'
                                : rule.modifier.type === 'multiplier'
                                ? 'warning'
                                : 'info'
                            }
                            size="sm"
                          >
                            {rule.modifier.type === 'flat_override'
                              ? `$${rule.modifier.value.toFixed(2)} Flat Override`
                              : rule.modifier.type === 'multiplier'
                              ? `${rule.modifier.value}x Multiplier`
                              : rule.modifier.type === 'surcharge_flat'
                              ? `+$${rule.modifier.value.toFixed(2)} Surcharge`
                              : `+${rule.modifier.value}% Surcharge`}
                          </Badge>
                          {rule.allowDriverSelection && (
                            <Badge variant="neutral" size="sm">
                              Driver Selectable
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{rule.description}</p>

                        {/* Triggers summary tags */}
                        <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                          {rule.triggers.zoneIds && rule.triggers.zoneIds.length > 0 && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                              Zones: {rule.triggers.zoneIds.join(', ')}
                            </span>
                          )}
                          {typeof rule.triggers.maxDistanceMiles === 'number' && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                              Max Dist: {rule.triggers.maxDistanceMiles} mi
                            </span>
                          )}
                          {typeof rule.triggers.minDistanceMiles === 'number' && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                              Min Dist: {rule.triggers.minDistanceMiles} mi
                            </span>
                          )}
                          {rule.triggers.daysOfWeek && rule.triggers.daysOfWeek.length > 0 && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                              Days: {rule.triggers.daysOfWeek.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
                            </span>
                          )}
                          {rule.triggers.timeWindows && rule.triggers.timeWindows.length > 0 && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                              Times: {rule.triggers.timeWindows.map((tw) => `${tw.start}-${tw.end}`).join(', ')}
                            </span>
                          )}
                          {rule.triggers.accountTypes && rule.triggers.accountTypes.length > 0 && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                              Accounts: {rule.triggers.accountTypes.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 self-end md:self-center">
                      <div className="text-right">
                        <div className="text-[11px] font-bold text-slate-500">Driver Toggle</div>
                        <label className="relative inline-flex items-center cursor-pointer mt-0.5">
                          <input
                            type="checkbox"
                            checked={rule.allowDriverSelection}
                            onChange={() => handleToggleDriverSelection(rule)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600" />
                        </label>
                      </div>

                      <div className="text-right">
                        <div className="text-[11px] font-bold text-slate-500">Active</div>
                        <label className="relative inline-flex items-center cursor-pointer mt-0.5">
                          <input
                            type="checkbox"
                            checked={rule.isActive}
                            onChange={() => handleToggleRuleActive(rule)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                        </label>
                      </div>

                      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingRule({ ...rule });
                            setIsRuleModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── SUB-TAB 3: STEP INCREMENTS & DECAYING BRACKETS ─── */}
      {activeSubTab === 'step_increments' && (
        <div className="space-y-6">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Step-Wise Mileage &amp; Delay Rate Brackets
                  </h3>
                  <Badge variant={pricing.useStepIncrements ? 'success' : 'neutral'} size="sm">
                    {pricing.useStepIncrements ? 'Active in Pipeline' : 'Linear Rate Fallback'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configurable step increments (e.g. per 0.1 mile / per 90 sec wait time) with decaying bracket tiers for long-distance transit.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700">Enable Step Increments:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pricing.useStepIncrements}
                    onChange={(e) => setPricing({ ...pricing, useStepIncrements: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                </label>
              </div>
            </div>

            {/* Bracket Tiers Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Tier Name</th>
                    <th className="px-4 py-3">Start (mi)</th>
                    <th className="px-4 py-3">End (mi)</th>
                    <th className="px-4 py-3">Step Increment</th>
                    <th className="px-4 py-3">Rate / Step ($)</th>
                    <th className="px-4 py-3">Equivalent Rate / Mile</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricing.stepIncrementTiers?.map((tier, idx) => {
                    const equivPerMile = tier.stepMiles > 0 ? (tier.ratePerStep / tier.stepMiles) : 0;
                    return (
                      <tr key={tier.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <input
                            type="text"
                            value={tier.name}
                            onChange={(e) => {
                              const updated = [...(pricing.stepIncrementTiers || [])];
                              updated[idx] = { ...updated[idx], name: e.target.value };
                              setPricing({ ...pricing, stepIncrementTiers: updated });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 text-xs font-semibold w-48"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <input
                            type="number"
                            value={tier.startMiles}
                            onChange={(e) => {
                              const updated = [...(pricing.stepIncrementTiers || [])];
                              updated[idx] = { ...updated[idx], startMiles: parseFloat(e.target.value) || 0 };
                              setPricing({ ...pricing, stepIncrementTiers: updated });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 text-xs font-mono w-20"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <input
                            type="number"
                            value={tier.endMiles}
                            onChange={(e) => {
                              const updated = [...(pricing.stepIncrementTiers || [])];
                              updated[idx] = { ...updated[idx], endMiles: parseFloat(e.target.value) || 0 };
                              setPricing({ ...pricing, stepIncrementTiers: updated });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 text-xs font-mono w-20"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <input
                            type="number"
                            step="0.05"
                            value={tier.stepMiles}
                            onChange={(e) => {
                              const updated = [...(pricing.stepIncrementTiers || [])];
                              updated[idx] = { ...updated[idx], stepMiles: parseFloat(e.target.value) || 0.1 };
                              setPricing({ ...pricing, stepIncrementTiers: updated });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 text-xs font-mono w-20"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <input
                            type="number"
                            step="0.05"
                            value={tier.ratePerStep}
                            onChange={(e) => {
                              const updated = [...(pricing.stepIncrementTiers || [])];
                              updated[idx] = { ...updated[idx], ratePerStep: parseFloat(e.target.value) || 0 };
                              setPricing({ ...pricing, stepIncrementTiers: updated });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 text-xs font-mono w-20 font-bold text-blue-600"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">
                          ${equivPerMile.toFixed(2)} / mi
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (pricing.stepIncrementTiers || []).filter((_, i) => i !== idx);
                              setPricing({ ...pricing, stepIncrementTiers: updated });
                            }}
                            className="text-rose-600 hover:text-rose-800 text-xs font-bold"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const tiers = pricing.stepIncrementTiers || [];
                  const lastTier = tiers[tiers.length - 1];
                  const startMiles = lastTier ? lastTier.endMiles : 0;
                  const newTier: StepIncrementTier = {
                    id: `tier-${Date.now()}`,
                    name: `Extended Tier (${startMiles}+ mi)`,
                    startMiles,
                    endMiles: startMiles + 20,
                    stepMiles: 0.1,
                    ratePerStep: 0.15,
                  };
                  setPricing({ ...pricing, stepIncrementTiers: [...tiers, newTier] });
                }}
              >
                + Add Distance Bracket Tier
              </Button>
            </div>

            {/* Delay & Wait-time Config */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 mb-1">Delay &amp; Passenger Wait-Time Rate</h4>
              <p className="text-xs text-slate-500 mb-4">
                Charged during driver waiting periods at pickup or intermediate stops.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Grace Period (Minutes)</label>
                  <Input
                    type="number"
                    min="0"
                    value={pricing.delayRate?.gracePeriodMinutes ?? 5}
                    onChange={(e) =>
                      setPricing({
                        ...pricing,
                        delayRate: {
                          ...(pricing.delayRate || { stepSeconds: 90, ratePerStep: 0.60, gracePeriodMinutes: 5 }),
                          gracePeriodMinutes: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Free complimentary waiting time.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Step Seconds (Interval)</label>
                  <Input
                    type="number"
                    min="15"
                    step="15"
                    value={pricing.delayRate?.stepSeconds ?? 90}
                    onChange={(e) =>
                      setPricing({
                        ...pricing,
                        delayRate: {
                          ...(pricing.delayRate || { stepSeconds: 90, ratePerStep: 0.60, gracePeriodMinutes: 5 }),
                          stepSeconds: parseInt(e.target.value) || 90,
                        },
                      })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">e.g. 90 seconds per billing tick.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rate Per Step ($)</label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    value={pricing.delayRate?.ratePerStep ?? 0.60}
                    onChange={(e) =>
                      setPricing({
                        ...pricing,
                        delayRate: {
                          ...(pricing.delayRate || { stepSeconds: 90, ratePerStep: 0.60, gracePeriodMinutes: 5 }),
                          ratePerStep: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">e.g. $0.60 per 90 sec ($24.00/hour).</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── SUB-TAB 4: CONDITION SURCHARGES & EQUIPMENT ─── */}
      {activeSubTab === 'condition_surcharges' && (
        <div className="space-y-6">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-6">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h3 className="text-base font-extrabold text-slate-900">
                Condition-Based Surcharges &amp; Equipment
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Specialized fees for child safety seats, extra passengers, vehicle tier upgrades, and regional geofences.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Child Safety Car Seat Equipment */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚼</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Child Safety Seat Equipment</h4>
                    <p className="text-xs text-slate-500">Per-seat sanitizer and equipment fee.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fee Per Car Seat ($)</label>
                  <Input
                    type="number"
                    step="0.50"
                    min="0"
                    value={pricing.conditionSurcharges?.carSeatFeePerUnit ?? 5.00}
                    onChange={(e) =>
                      setPricing({
                        ...pricing,
                        conditionSurcharges: {
                          ...(pricing.conditionSurcharges ?? DEFAULT_CONDITION_SURCHARGES),
                          carSeatFeePerUnit: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Multiplied by total rear-facing, front-facing, and booster seats requested.</p>
                </div>
              </div>

              {/* Extra Passenger Headcount */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👥</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Passenger Headcount Allowance</h4>
                    <p className="text-xs text-slate-500">Incremental charge for additional passengers.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Base Allowance (Heads)</label>
                    <Input
                      type="number"
                      min="1"
                      max="6"
                      value={pricing.conditionSurcharges?.passengerBaseAllowance ?? 2}
                      onChange={(e) =>
                        setPricing({
                          ...pricing,
                          conditionSurcharges: {
                            ...(pricing.conditionSurcharges ?? DEFAULT_CONDITION_SURCHARGES),
                            passengerBaseAllowance: parseInt(e.target.value) || 1,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Extra Fee / Head ($)</label>
                    <Input
                      type="number"
                      step="0.50"
                      min="0"
                      value={pricing.conditionSurcharges?.extraPassengerFeePerHead ?? 3.00}
                      onChange={(e) =>
                        setPricing({
                          ...pricing,
                          conditionSurcharges: {
                            ...(pricing.conditionSurcharges ?? DEFAULT_CONDITION_SURCHARGES),
                            extraPassengerFeePerHead: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle Tier Surcharges */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 mb-1">Vehicle Tier Fixed / Percentage Surcharges</h4>
              <p className="text-xs text-slate-500 mb-4">
                Optional additive class fees applied on top of standard vehicle multipliers.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {(['standard', 'premium', 'xl', 'wheelchair'] as VehicleTier[]).map((tierKey) => {
                  const currentTier = pricing.conditionSurcharges?.vehicleTierSurcharges?.[tierKey] || { flat: 0, percent: 0 };
                  return (
                    <div key={tierKey} className="p-3 border border-slate-200 rounded-xl bg-white space-y-2">
                      <div className="font-bold text-slate-900 text-xs uppercase">{tierKey}</div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block">Flat Fee ($)</label>
                        <input
                          type="number"
                          step="1.00"
                          value={currentTier.flat}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const baseSurcharges = pricing.conditionSurcharges ?? DEFAULT_CONDITION_SURCHARGES;
                            setPricing({
                              ...pricing,
                              conditionSurcharges: {
                                ...baseSurcharges,
                                vehicleTierSurcharges: {
                                  ...(baseSurcharges.vehicleTierSurcharges || {}),
                                  [tierKey]: { ...currentTier, flat: val },
                                },
                              },
                            });
                          }}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block">Percentage (%)</label>
                        <input
                          type="number"
                          step="1.00"
                          value={currentTier.percent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const baseSurcharges = pricing.conditionSurcharges ?? DEFAULT_CONDITION_SURCHARGES;
                            setPricing({
                              ...pricing,
                              conditionSurcharges: {
                                ...baseSurcharges,
                                vehicleTierSurcharges: {
                                  ...(baseSurcharges.vehicleTierSurcharges || {}),
                                  [tierKey]: { ...currentTier, percent: val },
                                },
                              },
                            });
                          }}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1 font-mono"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL: CREATE / EDIT NAMED RULE ─── */}
      {isRuleModalOpen && editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingRule.id ? 'Edit Named Pricing Rule' : 'Create Named Pricing Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRuleModal} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Rule Name</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Spirit Airport Corporate Flat"
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingRule.description}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs"
                  placeholder="Explain when and why this rule triggers"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority (10-100)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={editingRule.priority}
                    onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 50 })}
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Higher numbers evaluated first.</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Modifier Action</label>
                  <select
                    value={editingRule.modifier.type}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        modifier: {
                          ...editingRule.modifier,
                          type: e.target.value as PricingRuleModifier['type'],
                        },
                      })
                    }
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white"
                  >
                    <option value="flat_override">Flat Rate Override ($)</option>
                    <option value="multiplier">Rate Multiplier (x)</option>
                    <option value="surcharge_flat">Flat Surcharge ($)</option>
                    <option value="surcharge_percent">Percent Surcharge (%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Modifier Value</label>
                <Input
                  type="number"
                  step="0.05"
                  required
                  value={editingRule.modifier.value}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      modifier: {
                        ...editingRule.modifier,
                        value: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>

              {/* Triggers section */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="font-bold text-slate-800 text-[11px] uppercase">Evaluation Triggers (Optional)</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Min Distance (mi)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editingRule.triggers.minDistanceMiles ?? ''}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          triggers: {
                            ...editingRule.triggers,
                            minDistanceMiles: e.target.value ? parseFloat(e.target.value) : undefined,
                          },
                        })
                      }
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Max Distance (mi)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editingRule.triggers.maxDistanceMiles ?? ''}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          triggers: {
                            ...editingRule.triggers,
                            maxDistanceMiles: e.target.value ? parseFloat(e.target.value) : undefined,
                          },
                        })
                      }
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                {zones.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Matching Zones</label>
                    <div className="flex flex-wrap gap-2">
                      {zones.map((zone) => {
                        const isChecked = editingRule.triggers.zoneIds?.includes(zone.id);
                        return (
                          <label key={zone.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const current = editingRule.triggers.zoneIds || [];
                                const updated = e.target.checked
                                  ? [...current, zone.id]
                                  : current.filter((zid) => zid !== zone.id);
                                setEditingRule({
                                  ...editingRule,
                                  triggers: { ...editingRule.triggers, zoneIds: updated },
                                });
                              }}
                              className="rounded text-blue-600"
                            />
                            {zone.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editingRule.allowDriverSelection}
                    onChange={(e) => setEditingRule({ ...editingRule, allowDriverSelection: e.target.checked })}
                    className="rounded text-amber-600"
                  />
                  Allow Driver Console Manual Selection
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editingRule.isActive}
                    onChange={(e) => setEditingRule({ ...editingRule, isActive: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  Active
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsRuleModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
                  Save Rule to Firestore
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
