import React, { useState, useMemo } from 'react';
import type { AppSettings, DynamicPricingConfig } from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { CheckIcon, SparklesIcon, ClockIcon } from '../../ui/Icons';

export interface AdminPricingTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

export function AdminPricingTab({ settings, onSave, isLoading = false }: AdminPricingTabProps) {
  const [pricing, setPricing] = useState<DynamicPricingConfig>({ ...settings.pricing });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Simulation parameters for real-time preview
  const [simDistance, setSimDistance] = useState<number>(10);
  const [simDuration, setSimDuration] = useState<number>(20);
  const [simAirport, setSimAirport] = useState<boolean>(false);

  // Simulated total calculation
  const simulatedFare = useMemo(() => {
    const base = Number(pricing.baseFare) || 0;
    const distanceFare = (Number(pricing.perMileRate) || 0) * simDistance;
    const timeFare = (Number(pricing.perMinuteRate) || 0) * simDuration;
    const variableFare = distanceFare + timeFare;
    const surge = Math.max(1.0, Number(pricing.surgeMultiplier) || 1.0);
    const subtotal = (base + variableFare) * surge;
    const airportFee = simAirport ? Number(pricing.airportFee) || 0 : 0;
    const minFare = Number(pricing.minimumFare) || 0;
    return Math.max(minFare, subtotal + airportFee);
  }, [pricing, simDistance, simDuration, simAirport]);

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
        multiStopFee: Math.max(0, Number(pricing.multiStopFee) || 5.00),
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

  const getSurgeBadge = (val: number) => {
    if (val <= 1.0) return <Badge variant="neutral">Normal (1.0x)</Badge>;
    if (val <= 1.25) return <Badge variant="info">Elevated ({val.toFixed(2)}x)</Badge>;
    if (val <= 1.5) return <Badge variant="warning">High Demand ({val.toFixed(2)}x)</Badge>;
    return <Badge variant="error">Peak Surge ({val.toFixed(2)}x)</Badge>;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {saveSuccess && (
        <Alert variant="success" title="Pricing Updated">
          New pricing rules and surge controls are now live and synced with Firestore.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Core Pricing Matrix */}
        <div className="lg:col-span-7 space-y-6">
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-900">Base Rates &amp; Mileage</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Core rate parameters used by the Pure Functional Pricing Pipeline for all generated quotes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Platform Base Fare ($)"
                  type="number"
                  step="0.25"
                  min="0"
                  value={pricing.baseFare}
                  onChange={(e) => setPricing((prev) => ({ ...prev, baseFare: parseFloat(e.target.value) || 0 }))}
                  helperText="Fixed flag-drop fee applied to every ride."
                  required
                />

                <Input
                  label="Rate Per Mile ($/mi)"
                  type="number"
                  step="0.05"
                  min="0"
                  value={pricing.perMileRate}
                  onChange={(e) => setPricing((prev) => ({ ...prev, perMileRate: parseFloat(e.target.value) || 0 }))}
                  helperText="Standard distance fee calculated from routing GPS."
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Rate Per Minute ($/min)"
                  type="number"
                  step="0.05"
                  min="0"
                  value={pricing.perMinuteRate ?? 0.35}
                  onChange={(e) => setPricing((prev) => ({ ...prev, perMinuteRate: parseFloat(e.target.value) || 0 }))}
                  helperText="Time in transit surcharge."
                />

                <Input
                  label="Minimum Fare Floor ($)"
                  type="number"
                  step="0.50"
                  min="0"
                  value={pricing.minimumFare ?? 10.00}
                  onChange={(e) => setPricing((prev) => ({ ...prev, minimumFare: parseFloat(e.target.value) || 0 }))}
                  helperText="Minimum guaranteed amount per trip."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Airport Terminal Surcharge ($)"
                  type="number"
                  step="0.50"
                  min="0"
                  value={pricing.airportFee}
                  onChange={(e) => setPricing((prev) => ({ ...prev, airportFee: parseFloat(e.target.value) || 0 }))}
                  helperText="Surcharge for airport pickups."
                  required
                />

                <Input
                  label="Multi-Stop Waypoint Fee ($/stop)"
                  type="number"
                  step="0.50"
                  min="0"
                  value={pricing.multiStopFee ?? 5.00}
                  onChange={(e) => setPricing((prev) => ({ ...prev, multiStopFee: parseFloat(e.target.value) || 0 }))}
                  helperText="Fee per intermediate stop."
                />
              </div>

              <Input
                label="Default Toll Surcharge ($)"
                type="number"
                step="0.50"
                min="0"
                value={pricing.defaultTolls ?? 0}
                onChange={(e) => setPricing((prev) => ({ ...prev, defaultTolls: parseFloat(e.target.value) || 0 }))}
                helperText="Default toll/bridge surcharge applied to standard routes if not customized."
              />
            </CardContent>
          </Card>

          {/* Real-time Surge Multiplier Controls */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-900">Manual Surge Control</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Instantly scale rates during adverse weather, sporting events, or regional driver shortages.
                  </CardDescription>
                </div>
                {getSurgeBadge(pricing.surgeMultiplier)}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Current Surge Multiplier: <span className="text-amber-600 font-bold text-sm">{pricing.surgeMultiplier.toFixed(2)}x</span>
                  </label>
                  <span className="text-xs text-slate-400">Range: 1.0x – 3.0x</span>
                </div>

                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.05"
                  value={pricing.surgeMultiplier}
                  onChange={(e) => setPricing((prev) => ({ ...prev, surgeMultiplier: parseFloat(e.target.value) || 1.0 }))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500">Quick Demand Presets:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Off-Peak (1.0x)', value: 1.0 },
                    { label: 'Rush Hour (1.25x)', value: 1.25 },
                    { label: 'Heavy Storm (1.50x)', value: 1.5 },
                    { label: 'NYE / Peak (2.00x)', value: 2.0 },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setPricing((prev) => ({ ...prev, surgeMultiplier: preset.value }))}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                        Math.abs(pricing.surgeMultiplier - preset.value) < 0.01
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Fare Calculator & Simulation */}
        <div className="lg:col-span-5 space-y-6">
          <Card variant="elevated" className="border-slate-200 shadow-xs sticky top-24">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-amber-500" />
                Live Fare Quote Simulator
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Test how your new rates calculate fares in real time before publishing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Simulation Inputs */}
              <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>Trip Distance: {simDistance} miles</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={simDistance}
                    onChange={(e) => setSimDistance(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>Duration: {simDuration} minutes</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="90"
                    step="5"
                    value={simDuration}
                    onChange={(e) => setSimDuration(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={simAirport}
                    onChange={(e) => setSimAirport(e.target.checked)}
                    className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-400"
                  />
                  <span>Simulate Airport Terminal Pickup (+${pricing.airportFee.toFixed(2)})</span>
                </label>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2 text-xs border-t border-slate-100 pt-4">
                <div className="flex justify-between text-slate-600">
                  <span>Base Fare:</span>
                  <span className="font-semibold">${pricing.baseFare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Distance ({simDistance} mi @ ${pricing.perMileRate.toFixed(2)}/mi):</span>
                  <span className="font-semibold">${(pricing.perMileRate * simDistance).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Time ({simDuration} min @ ${(pricing.perMinuteRate ?? 0.35).toFixed(2)}/min):</span>
                  <span className="font-semibold">${((pricing.perMinuteRate ?? 0.35) * simDuration).toFixed(2)}</span>
                </div>
                {pricing.surgeMultiplier > 1.0 && (
                  <div className="flex justify-between text-amber-600 font-semibold">
                    <span>Surge Multiplier:</span>
                    <span>{pricing.surgeMultiplier.toFixed(2)}x</span>
                  </div>
                )}
                {simAirport && (
                  <div className="flex justify-between text-slate-600">
                    <span>Airport Terminal Fee:</span>
                    <span className="font-semibold">${pricing.airportFee.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-900">Simulated Total:</span>
                  <span className="text-2xl font-extrabold text-slate-950 text-amber-600">
                    ${simulatedFare.toFixed(2)}
                  </span>
                </div>
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
                Save Pricing Rules
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </form>
  );
}
