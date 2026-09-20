import React, { useState } from 'react';
import type { TariffProfile, TariffRateModel, TariffTaximeterRate } from '~/core/types/tariff';
import type { VehicleType, VehicleClass } from '~/core/types/config';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  DollarSignIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  SearchIcon,
  SlidersIcon,
  ClockIcon,
} from '~/components/ui/Icons';
import { TaximeterEditor } from './TaximeterEditor';
import { ZipRateMatrixEditor } from './ZipRateMatrixEditor';
import { HourlyRateEditor } from './HourlyRateEditor';
import { DEFAULT_TARIFF_PROFILES } from '~/core/services/pricing/tariff.service';

export interface RatesPanelProps {
  tariffs: TariffProfile[];
  onSaveTariff: (tariff: TariffProfile) => Promise<void>;
  onDeleteTariff?: (id: string) => Promise<void>;
  isSaving?: boolean;
}

const VEHICLE_TYPES: { id: VehicleType; label: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
  { id: 'minivan', label: 'Minivan' },
  { id: 'van', label: 'Van / Shuttle' },
  { id: 'wheelchair_wav', label: 'WAV Wheelchair' },
];

const VEHICLE_CLASSES: { id: VehicleClass; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'executive', label: 'Executive' },
  { id: 'xl', label: 'XL 6-Pax' },
  { id: 'medical', label: 'Medical Non-Emergency' },
  { id: 'delivery', label: 'Delivery / Courier' },
];

export function RatesPanel({
  tariffs,
  onSaveTariff,
  onDeleteTariff,
  isSaving = false,
}: RatesPanelProps) {
  // Strictly show only the 2 primary rates (Airport Flat Rate and METER)
  const primaryTariffs = tariffs.filter(
    (t) => t.id === 'tariff-airport-flat' || t.id === 'tariff-point-to-point-meter'
  );
  const visibleTariffs = primaryTariffs.length > 0 ? primaryTariffs : DEFAULT_TARIFF_PROFILES;

  const [selectedTariffId, setSelectedTariffId] = useState<string>(
    visibleTariffs[0]?.id || 'tariff-airport-flat'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const selectedTariff = visibleTariffs.find((t) => t.id === selectedTariffId) || visibleTariffs[0];
  const [workingCopy, setWorkingCopy] = useState<TariffProfile | null>(
    selectedTariff ? JSON.parse(JSON.stringify(selectedTariff)) : null
  );

  // If tariffs change or selectedTariff changes, ensure workingCopy is synchronized
  React.useEffect(() => {
    if (selectedTariff && (!workingCopy || workingCopy.id !== selectedTariff.id)) {
      setWorkingCopy(JSON.parse(JSON.stringify(selectedTariff)));
    }
  }, [selectedTariff]);

  const handleSelectTariff = (id: string) => {
    setSelectedTariffId(id);
    const target = visibleTariffs.find((t) => t.id === id);
    if (target) {
      setWorkingCopy(JSON.parse(JSON.stringify(target)));
    }
  };

  const filteredTariffs = visibleTariffs.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!workingCopy) return;
    await onSaveTariff(workingCopy);
    setSaveSuccessMsg(`Saved tariff "${workingCopy.name}" successfully!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleAddNewTariff = () => {
    const newId = `tariff-custom-${Date.now()}`;
    const taximeterConfig: TariffTaximeterRate = {
      startPrice: 4.50,
      initialDistanceIncluded: 0.1,
      initialTimeIncluded: 0,
      primaryDistanceLimit: 999,
      primaryDistanceStep: 0.1,
      primaryDistanceRate: 0.300,
      thenDistanceStep: 0.1,
      thenDistanceRate: 0.300,
      freeTrafficMinutes: 0,
      waitingStepSeconds: 60,
      waitingRatePerStep: 0.667,
      minimumPrice: 4.50,
    };

    const newTariff: TariffProfile = {
      id: newId,
      name: 'New Custom Rate',
      description: 'Custom tariff rate profile',
      rateModel: 'taximeter',
      currency: 'USD',
      units: 'imperial',
      isActive: true,
      priority: 50,
      isDefault: false,
      allowSurgeMultiplier: true,
      allowOperationalSurcharges: true,
      eligibleVehicleTypes: ['sedan', 'suv', 'minivan'],
      eligibleVehicleClasses: ['standard', 'executive'],
      triggers: {},
      taximeter: taximeterConfig,
      taximeterRate: taximeterConfig,
      corridors: [],
      extras: {
        carSeatFeePerUnit: 10,
        passengerBaseAllowance: 1,
        extraPassengerFeePerHead: 0,
        customSurcharges: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setWorkingCopy(newTariff);
    setSelectedTariffId(newId);
  };

  const toggleVehicleType = (vt: VehicleType) => {
    if (!workingCopy) return;
    const current = workingCopy.eligibleVehicleTypes || [];
    const next = current.includes(vt)
      ? current.filter((x: string) => x !== vt)
      : [...current, vt];
    setWorkingCopy({ ...workingCopy, eligibleVehicleTypes: next });
  };

  const toggleVehicleClass = (vc: VehicleClass) => {
    if (!workingCopy) return;
    const current = workingCopy.eligibleVehicleClasses || [];
    const next = current.includes(vc)
      ? current.filter((x: string) => x !== vc)
      : [...current, vc];
    setWorkingCopy({ ...workingCopy, eligibleVehicleClasses: next });
  };

  // Safe taximeter resolution
  const resolvedTaximeter: TariffTaximeterRate = (workingCopy?.taximeterRate || workingCopy?.taximeter) ?? {
    startPrice: 4.50,
    initialDistanceIncluded: 0.1,
    initialTimeIncluded: 0,
    primaryDistanceLimit: 999,
    primaryDistanceStep: 0.1,
    primaryDistanceRate: 0.300,
    thenDistanceStep: 0.1,
    thenDistanceRate: 0.300,
    freeTrafficMinutes: 0,
    waitingStepSeconds: 60,
    waitingRatePerStep: 0.667,
    minimumPrice: 4.50,
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[640px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
      {/* Left Sub-Panel: Tariff List (~280px) */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-slate-50/80 shrink-0">
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSignIcon className="w-3.5 h-3.5 text-blue-600" />
              Tariff Rates ({visibleTariffs.length})
            </h3>
            <Button
              type="button"
              size="sm"
              onClick={handleAddNewTariff}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 shadow-2xs"
            >
              <PlusIcon className="w-3 h-3 mr-1" />
              New Rate
            </Button>
          </div>
          <div className="relative">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search rates..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="h-7.5 text-xs pl-7.5 bg-white border-slate-200 text-slate-800 w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
          {filteredTariffs.map((t) => {
            const isSelected = t.id === selectedTariffId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTariff(t.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-400 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {t.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 font-mono shrink-0 uppercase ${
                      isSelected
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t.rateModel || 'METER'}
                  </Badge>
                </div>

                <div className="text-[11px] font-mono font-medium text-slate-600 mb-2">
                  {t.id === 'tariff-airport-flat' ? (
                    <span>$0.00 base · $28.00 min · $0.255/0.1 mi</span>
                  ) : (
                    <span>$4.50 first 0.1 mi · $0.300/0.1 mi</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-1.5">
                  <span className="font-mono">Priority: {t.priority}</span>
                  <div className="flex items-center gap-1.5">
                    {t.isDefault && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.2 rounded">
                        Default
                      </span>
                    )}
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        t.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center Sub-Panel: Granular Rate Editor */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto custom-scrollbar">
        {workingCopy ? (
          <div className="p-6 space-y-6">
            {/* Save Notification Toast */}
            {saveSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckIcon className="w-4 h-4 text-emerald-600" />
                  {saveSuccessMsg}
                </span>
              </div>
            )}

            {/* 1. Profile Header Strip */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{workingCopy.name}</h2>
                  <Badge variant="outline" className="text-[10px] font-mono text-slate-600 border-slate-300 bg-white">
                    ID: {workingCopy.id}
                  </Badge>
                  {workingCopy.isDefault && (
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
                      Default Fallback
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Base fare, minimum price floor, stepped increments, and waiting delay rates.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectTariff(workingCopy.id)}
                  className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-2xs"
                >
                  <CheckIcon className="w-3.5 h-3.5 mr-1" />
                  Save Tariff
                </Button>
              </div>
            </div>

            {/* 2. Core Statutory Rates (Base, Min Floor, Steps, Waiting) Front and Center! */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSignIcon className="w-3.5 h-3.5 text-emerald-600" />
                  Statutory Rate Configuration & Taximeter Steps
                </h3>
                <span className="text-[11px] text-slate-500">
                  Flag drop, minimum price floor, distance steps & waiting delay
                </span>
              </div>

              {workingCopy.rateModel === 'taximeter' && (
                <TaximeterEditor
                  taximeter={resolvedTaximeter}
                  onChange={(updated) =>
                    setWorkingCopy({
                      ...workingCopy,
                      taximeter: updated,
                      taximeterRate: updated,
                    })
                  }
                />
              )}

              {workingCopy.rateModel === 'zip_matrix' && (
                <ZipRateMatrixEditor
                  entries={workingCopy.zipMatrixRates || []}
                  onChange={(updated) =>
                    setWorkingCopy({ ...workingCopy, zipMatrixRates: updated })
                  }
                />
              )}

              {workingCopy.rateModel === 'hourly' && (
                <HourlyRateEditor
                  hourlyConfig={workingCopy.hourlyRate}
                  onChange={(updated) =>
                    setWorkingCopy({ ...workingCopy, hourlyRate: updated })
                  }
                />
              )}
            </div>

            {/* 3. Secondary: Vehicle Eligibility & Policies */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vehicle Eligibility & Tariff Policies
                </h4>
                <span className="text-[11px] text-slate-500">Secondary configuration</span>
              </div>

              {/* General Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Tariff Name</label>
                  <Input
                    type="text"
                    value={workingCopy.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({ ...workingCopy, name: e.target.value })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Calculation Model</label>
                  <select
                    value={workingCopy.rateModel}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        rateModel: e.target.value as TariffRateModel,
                      })
                    }
                    className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
                  >
                    <option value="taximeter">Taximeter (Stepped Miles)</option>
                    <option value="zip_matrix">Zip Matrix</option>
                    <option value="hourly">Hourly Charter</option>
                    <option value="corridor">Corridor (Fixed Zones)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Evaluation Priority</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={workingCopy.priority}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        priority: parseInt(e.target.value, 10) || 50,
                      })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-700 block mb-1">Description</label>
                <Input
                  type="text"
                  value={workingCopy.description || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setWorkingCopy({ ...workingCopy, description: e.target.value })
                  }
                  className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                />
              </div>

              {/* Switches: Active, Default, Surcharges & Surge */}
              <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.isActive}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({ ...workingCopy, isActive: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-0"
                  />
                  <span>Active Tariff</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.isDefault || false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({ ...workingCopy, isDefault: e.target.checked })
                    }
                    className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                  />
                  <span>Default Fallback Tariff</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.allowSurgeMultiplier !== false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        allowSurgeMultiplier: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-amber-600 focus:ring-0"
                  />
                  <span>Allow Surge Multiplier</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.allowOperationalSurcharges !== false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        allowOperationalSurcharges: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-purple-600 focus:ring-0"
                  />
                  <span>Allow Operational Surcharges</span>
                </label>
              </div>

              {/* Dual Vehicle Classifications */}
              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1">Eligible Physical Vehicle Types:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {VEHICLE_TYPES.map((vt) => {
                      const isChecked = workingCopy.eligibleVehicleTypes?.includes(vt.id);
                      return (
                        <button
                          key={vt.id}
                          type="button"
                          onClick={() => toggleVehicleType(vt.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          {vt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1">Eligible Service Classes:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {VEHICLE_CLASSES.map((vc) => {
                      const isChecked = workingCopy.eligibleVehicleClasses?.includes(vc.id);
                      return (
                        <button
                          key={vc.id}
                          type="button"
                          onClick={() => toggleVehicleClass(vc.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          {vc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-12">
            Select a tariff profile from the left panel to configure rates
          </div>
        )}
      </div>
    </div>
  );
}
