import React, { useState } from 'react';
import type { UniversalExtrasConfig, CustomFleetExtra } from '~/core/services/pricing/extras.service';
import type { OversizedBagCategory } from '~/core/types/config';
import { DEFAULT_OVERSIZED_BAG_CATEGORIES } from '~/core/services/config/admin-config.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  BabyIcon,
  UsersIcon,
  MapPinIcon,
  ClockIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  SlidersIcon,
  ShieldCheckIcon,
  LuggageIcon,
} from '~/components/ui/Icons';

export interface UniversalExtrasPanelProps {
  extras: UniversalExtrasConfig;
  onSave: (updated: UniversalExtrasConfig) => Promise<void>;
  isSaving?: boolean;
}

export function UniversalExtrasPanel({
  extras,
  onSave,
  isSaving = false,
}: UniversalExtrasPanelProps) {
  const [workingCopy, setWorkingCopy] = useState<UniversalExtrasConfig>(
    JSON.parse(JSON.stringify(extras))
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Custom Extra form state
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customFee, setCustomFee] = useState(10.0);
  const [customDescription, setCustomDescription] = useState('');

  const updateField = <K extends keyof UniversalExtrasConfig>(field: K, val: any) => {
    setWorkingCopy({
      ...workingCopy,
      [field]: val,
    });
  };

  const oversizedList: OversizedBagCategory[] =
    workingCopy.oversizedBagsConfig && workingCopy.oversizedBagsConfig.length > 0
      ? workingCopy.oversizedBagsConfig
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;

  const handleUpdateOversizedCategory = (index: number, updates: Partial<OversizedBagCategory>) => {
    const list = [...oversizedList];
    list[index] = { ...list[index], ...updates };
    updateField('oversizedBagsConfig', list);
  };

  const handleSave = async () => {
    await onSave(workingCopy);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleAddCustomExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const newExtra: CustomFleetExtra = {
      id: `extra-${Date.now()}`,
      name: customName.trim(),
      description: customDescription.trim() || undefined,
      fee: Number(customFee) || 0,
      isPerUnit: true,
      isActive: true,
    };

    setWorkingCopy({
      ...workingCopy,
      customExtras: [...(workingCopy.customExtras || []), newExtra],
    });

    setIsAddingCustom(false);
    setCustomName('');
    setCustomDescription('');
  };

  const handleRemoveCustomExtra = (id: string) => {
    setWorkingCopy({
      ...workingCopy,
      customExtras: (workingCopy.customExtras || []).filter((ce) => ce.id !== id),
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="p-4.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-emerald-600" />
              Universal Extras & Services
            </h2>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]">
              Fleet-Wide
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Fleet-wide standardized physical add-ons, passenger headcount, intermediate stops, and curb waiting grace. Pricing rules can override these per account or zone.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saveSuccess && (
            <span className="text-xs text-emerald-700 flex items-center gap-1 font-semibold mr-2">
              <CheckIcon className="w-3.5 h-3.5" />
              Saved successfully!
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-2xs"
          >
            <CheckIcon className="w-3.5 h-3.5 mr-1" />
            Save Extras Configuration
          </Button>
        </div>
      </div>

      {/* 4 Core Operational Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Child Safety Seats */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-pink-50 text-pink-700 border border-pink-200">
                <BabyIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Child Safety Seats</h3>
                <p className="text-[11px] text-slate-500">Rear-facing, Toddler & Boosters</p>
              </div>
            </div>
            <span className="text-base font-bold text-emerald-700">
              ${workingCopy.carSeatFeePerUnit.toFixed(2)} / seat
            </span>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Fee per Child Seat ($)</label>
              <Input
                type="number"
                step="1.00"
                min="0"
                value={workingCopy.carSeatFeePerUnit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('carSeatFeePerUnit', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Standard charge is $10.00 per car seat requested
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 text-[11px] text-blue-900 flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Trips requesting child seats automatically upgrade vehicle classification to SUV or Minivan.
              </span>
            </div>
          </div>
        </div>

        {/* 2. Extra Passengers */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Extra Passenger Headcount</h3>
                <p className="text-[11px] text-slate-500">Headcount fees above free base</p>
              </div>
            </div>
            <span className="text-base font-bold text-emerald-700">
              ${workingCopy.extraPassengerFeePerHead.toFixed(2)} / pax
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Free Base Allowance</label>
              <Input
                type="number"
                step="1"
                min="1"
                value={workingCopy.passengerBaseAllowance}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('passengerBaseAllowance', parseInt(e.target.value, 10) || 1)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                1st passenger included for free
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Fee per Additional Pax ($)</label>
              <Input
                type="number"
                step="0.50"
                min="0"
                value={workingCopy.extraPassengerFeePerHead}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('extraPassengerFeePerHead', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                TaxiCaller rate: $1.00 per additional passenger
              </span>
            </div>
          </div>
        </div>

        {/* 3. Intermediate Waypoints & Stops */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                <MapPinIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Intermediate Stops</h3>
                <p className="text-[11px] text-slate-500">Multi-stop passenger routing</p>
              </div>
            </div>
            <span className="text-base font-bold text-emerald-700">
              ${workingCopy.intermediateStopFee.toFixed(2)} / stop
            </span>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Fee per Intermediate Waypoint ($)</label>
              <Input
                type="number"
                step="1.00"
                min="0"
                value={workingCopy.intermediateStopFee}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('intermediateStopFee', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Standard charge is $5.00 per intermediate stop
              </span>
            </div>
          </div>
        </div>

        {/* 4. Curb Pickup Grace & Waiting Delay */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <ClockIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Curb Waiting & Grace Period</h3>
                <p className="text-[11px] text-slate-500">Driver arrival curb grace and delay</p>
              </div>
            </div>
            <span className="text-base font-bold text-amber-700">
              ${(workingCopy.waitingRatePerMinute ?? workingCopy.curbWaitingRatePerMinute ?? 0.50).toFixed(2)} / min
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Curb Grace Period (min)</label>
              <Input
                type="number"
                step="1"
                min="0"
                value={workingCopy.pickupGraceMinutes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('pickupGraceMinutes', parseInt(e.target.value, 10) || 0)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                10 minutes free courtesy grace
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Wait Delay Rate ($/min)</label>
              <Input
                type="number"
                step="0.05"
                min="0"
                value={workingCopy.waitingRatePerMinute}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('waitingRatePerMinute', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                $0.50/min for time exceeding grace
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Oversized Baggage & Special Cargo Rules */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                <LuggageIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Oversized Cargo & Vehicle Upgrades</h3>
                <p className="text-[11px] text-slate-500">Configure itemized baggage counters, fees, and automatic vehicle upgrade triggers</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={workingCopy.oversizedAutoUpgradeVehicleType !== false}
                onChange={(e) => updateField('oversizedAutoUpgradeVehicleType', e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Enable Auto-Upgrade to SUV/Van</span>
            </label>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            {oversizedList.map((cat, idx) => (
              <div
                key={cat.id || idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200 items-center text-xs"
              >
                <div className="sm:col-span-5 font-bold text-slate-900 flex items-center gap-2">
                  <span>{cat.label}</span>
                </div>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Fee:</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1.5 text-slate-400 font-semibold">$</span>
                    <Input
                      type="number"
                      step="1.00"
                      min="0"
                      value={cat.fee}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleUpdateOversizedCategory(idx, { fee: parseFloat(e.target.value) || 0 })
                      }
                      className="h-7 pl-5 text-xs bg-white border-slate-300 text-slate-900"
                    />
                  </div>
                </div>
                <div className="sm:col-span-4 flex items-center justify-end gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700 font-semibold select-none">
                    <input
                      type="checkbox"
                      checked={cat.requiresUpgrade}
                      onChange={(e) =>
                        handleUpdateOversizedCategory(idx, { requiresUpgrade: e.target.checked })
                      }
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Force SUV/Van Upgrade</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

      {/* 6. Custom Fleet Extras Catalog */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <SlidersIcon className="w-4 h-4 text-blue-600" />
              Custom Fleet Extras Catalog
            </h3>
            <p className="text-xs text-slate-500">
              Additional optional services selectable during booking (e.g. Pet transport, Luggage assist).
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsAddingCustom(!isAddingCustom)}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-600 shadow-xs"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1 text-white" />
            Add Custom Extra
          </Button>
        </div>

        {/* Add custom extra form */}
        {isAddingCustom && (
          <form onSubmit={handleAddCustomExtra} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800">New Extra Service</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Name</label>
                <Input
                  type="text"
                  placeholder="e.g. Pet on Board"
                  required
                  value={customName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomName(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-300 text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Fee ($)</label>
                <Input
                  type="number"
                  step="1.00"
                  value={customFee}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomFee(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs bg-white border-slate-300 text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-0.5">Description</label>
                <Input
                  type="text"
                  placeholder="Optional details"
                  value={customDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomDescription(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-300 text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingCustom(false)}
                className="text-xs border-slate-300 bg-white text-slate-700"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                Add to Catalog
              </Button>
            </div>
          </form>
        )}

        {/* Custom extras list */}
        <div className="space-y-2">
          {workingCopy.customExtras && workingCopy.customExtras.length > 0 ? (
            workingCopy.customExtras.map((extra) => (
              <div
                key={extra.id}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-semibold text-slate-800">{extra.name}</span>
                  {extra.description && (
                    <p className="text-[11px] text-slate-500">{extra.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-emerald-700">${extra.fee.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomExtra(extra.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-xs text-slate-400">
              No custom fleet extras configured. Click "+ Add Custom Extra" to create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
