import React, { useState, useEffect, useMemo } from 'react';
import type {
  TariffProfile,
  TariffRateModel,
  DistanceRoundingMode,
  FareRoundingMode,
} from '~/core/types/tariff';
import type { NamedPricingRule } from '~/core/types/config';
import {
  DEFAULT_RATE_ROUNDING,
  DEFAULT_RATE_CANCELLATION_POLICY,
} from '~/core/services/pricing/tariff.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  PlusIcon,
  TrashIcon,
  SearchIcon,
  CheckIcon,
  DollarSignIcon,
  ShieldCheckIcon,
  SlidersIcon,
  ClockIcon,
  AlertTriangleIcon,
} from '~/components/ui/Icons';
import { TaximeterEditor } from './TaximeterEditor';
import { ZipRateMatrixEditor } from './ZipRateMatrixEditor';
import { HourlyRateEditor } from './HourlyRateEditor';
import { CorridorEditor } from './CorridorEditor';

export interface RatesPanelProps {
  tariffs: TariffProfile[];
  rules?: NamedPricingRule[];
  onSaveTariff: (updated: TariffProfile) => Promise<void>;
  onDeleteTariff?: (id: string) => Promise<void>;
  onDraftChange?: (draft: TariffProfile | null) => void;
  onNavigateToRule?: (ruleId: string) => void;
  isSaving?: boolean;
}

function getRateBadgeLabel(t: TariffProfile): string {
  if (t.rateModel === 'zip_matrix') return 'ZIP MATRIX';
  if (t.rateModel === 'hourly') return 'HOURLY';
  if (t.rateModel === 'corridor') return 'CORRIDOR';
  const meter = t.taximeter || t.taximeterRate;
  const isMetered = (meter?.waitingRatePerStep || 0) > 0 || (meter?.startPrice || 0) > 0;
  return isMetered ? 'METERED' : 'STEPPED FLAT';
}

export function RatesPanel({
  tariffs,
  rules = [],
  onSaveTariff,
  onDeleteTariff,
  onDraftChange,
  onNavigateToRule,
  isSaving = false,
}: RatesPanelProps) {
  const [selectedTariffId, setSelectedTariffId] = useState<string>(tariffs[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedTariff = tariffs.find((t) => t.id === selectedTariffId) || tariffs[0];
  const [workingCopy, setWorkingCopy] = useState<TariffProfile | null>(
    selectedTariff ? JSON.parse(JSON.stringify(selectedTariff)) : null
  );

  const isDirty = useMemo(() => {
    if (!workingCopy || !selectedTariff) return false;
    return JSON.stringify(workingCopy) !== JSON.stringify(selectedTariff);
  }, [workingCopy, selectedTariff]);

  // Sync workingCopy when tariffs load or selection changes
  useEffect(() => {
    if (selectedTariff && (!workingCopy || workingCopy.id !== selectedTariff.id)) {
      setSelectedTariffId(selectedTariff.id);
      setWorkingCopy(JSON.parse(JSON.stringify(selectedTariff)));
      setConfirmDeleteId(null);
    }
  }, [selectedTariff, workingCopy?.id]);

  // Notify parent workspace of live draft for real-time simulator preview
  useEffect(() => {
    onDraftChange?.(isDirty ? workingCopy : null);
  }, [workingCopy, isDirty, onDraftChange]);

  const handleSelectTariff = (id: string) => {
    if (id === selectedTariffId) return;
    if (isDirty) {
      const ok = window.confirm(
        `You have unsaved changes on "${workingCopy?.name}". Discard them and switch rates?`
      );
      if (!ok) return;
    }
    setSelectedTariffId(id);
    setConfirmDeleteId(null);
    const target = tariffs.find((t) => t.id === id);
    if (target) {
      setWorkingCopy(JSON.parse(JSON.stringify(target)));
    }
  };

  const filteredTariffs = tariffs.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Rules targeting the currently selected Rate
  const linkedRules = useMemo(() => {
    if (!workingCopy) return [];
    return rules.filter((r) => r.modifier?.targetTariffId === workingCopy.id);
  }, [rules, workingCopy]);

  const handleSave = async () => {
    if (!workingCopy) return;
    // If marking this Rate as Default, clear isDefault on other Rates automatically
    if (workingCopy.isDefault) {
      const others = tariffs.filter((t) => t.id !== workingCopy.id && t.isDefault);
      for (const other of others) {
        await onSaveTariff({ ...other, isDefault: false });
      }
    }
    // Keep Rate clean of legacy hidden routing triggers & surcharge vetoes
    const cleaned: TariffProfile = {
      ...workingCopy,
      allowOperationalSurcharges: true,
      allowSurgeMultiplier: true,
      triggers: {},
      eligibleVehicleTypes: undefined,
      eligibleVehicleClasses: undefined,
      taximeterRate: workingCopy.taximeter,
      zipMatrixRates: workingCopy.zipMatrix,
      hourlyRate: workingCopy.hourlyConfig,
    };
    await onSaveTariff(cleaned);
    setWorkingCopy(JSON.parse(JSON.stringify(cleaned)));
    setSaveSuccessMsg(`Saved "${cleaned.name}"`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleDeleteCurrentTariff = async () => {
    if (!workingCopy || !onDeleteTariff) return;
    const deletedId = workingCopy.id;
    const deletedName = workingCopy.name;
    const nextTariff = tariffs.find((t) => t.id !== deletedId);
    await onDeleteTariff(deletedId);
    setConfirmDeleteId(null);
    if (nextTariff) {
      setSelectedTariffId(nextTariff.id);
      setWorkingCopy(JSON.parse(JSON.stringify(nextTariff)));
    } else {
      setSelectedTariffId('');
      setWorkingCopy(null);
    }
    setSaveSuccessMsg(`Deleted "${deletedName}"`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleAddNewTariff = async () => {
    const newId = `rate-${Date.now()}`;
    const newTariff: TariffProfile = {
      id: newId,
      name: `New Service Rate #${tariffs.length + 1}`,
      description: 'Base service fare calculation model',
      rateModel: 'taximeter',
      currency: 'USD',
      units: 'imperial',
      priority: 50,
      isActive: true,
      isDefault: tariffs.length === 0,
      rounding: { ...DEFAULT_RATE_ROUNDING },
      cancellationPolicy: { ...DEFAULT_RATE_CANCELLATION_POLICY },
      allowSurgeMultiplier: true,
      allowOperationalSurcharges: true,
      triggers: {},
      taximeter: {
        startPrice: 4.5,
        initialDistanceIncluded: 0.1,
        initialTimeIncluded: 0,
        primaryDistanceStep: 0.1,
        primaryDistanceRate: 0.3,
        primaryDistanceLimit: 999,
        thenDistanceStep: 0.1,
        thenDistanceRate: 0.3,
        freeTrafficMinutes: 5,
        waitingRatePerStep: 0.667,
        waitingStepSeconds: 60,
        minimumPrice: 20.0,
      },
      corridors: [],
      extras: {
        carSeatFeePerUnit: 10.0,
        passengerBaseAllowance: 1,
        extraPassengerFeePerHead: 1.0,
        customSurcharges: [],
      },
    };

    await onSaveTariff(newTariff);
    setSelectedTariffId(newId);
    setWorkingCopy(JSON.parse(JSON.stringify(newTariff)));
  };

  const handleModelChange = (newModel: TariffRateModel) => {
    if (!workingCopy) return;
    const next: TariffProfile = { ...workingCopy, rateModel: newModel };
    if (newModel === 'hourly' && !next.hourlyConfig) {
      next.hourlyConfig = {
        ratePerHour: 75,
        minimumHours: 2,
        includedMilesPerHour: 20,
        excessMileageRate: 2.5,
      };
    }
    if (newModel === 'zip_matrix' && !next.zipMatrix) {
      next.zipMatrix = [];
    }
    setWorkingCopy(next);
  };

  const currentRounding = workingCopy?.rounding || DEFAULT_RATE_ROUNDING;
  const currentCancel = workingCopy?.cancellationPolicy || DEFAULT_RATE_CANCELLATION_POLICY;

  return (
    <div className="flex flex-col lg:flex-row min-h-[620px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
      {/* Left Sidebar: Service Rates List */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-slate-50/80 shrink-0">
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSignIcon className="w-3.5 h-3.5 text-blue-600" />
              Service Rates ({tariffs.length})
            </h3>
            <Button
              type="button"
              size="sm"
              onClick={handleAddNewTariff}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 shadow-2xs cursor-pointer"
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

        <div className="flex-1 max-h-60 lg:max-h-none overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
          {filteredTariffs.map((t) => {
            const isSelected = t.id === selectedTariffId;
            const modelBadge = getRateBadgeLabel(t);
            const meter = t.taximeter || t.taximeterRate;
            const summaryLine =
              t.rateModel === 'zip_matrix'
                ? `${(t.zipMatrix || t.zipMatrixRates || []).length} zip flat rates`
                : t.rateModel === 'hourly'
                ? `$${(t.hourlyConfig?.ratePerHour ?? 75).toFixed(0)}/hr · min ${t.hourlyConfig?.minimumHours ?? 2}h`
                : t.rateModel === 'corridor'
                ? `${t.corridors?.length || 0} flat corridors`
                : `$${(meter?.startPrice ?? 0).toFixed(2)} base · $${(meter?.minimumPrice ?? 0).toFixed(0)} min · $${(meter?.primaryDistanceRate ?? 0).toFixed(3)}/${meter?.primaryDistanceStep ?? 0.1} mi`;

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
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span
                    className={`text-xs font-bold leading-tight ${
                      isSelected ? 'text-blue-950' : 'text-slate-900'
                    }`}
                  >
                    {t.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 border-slate-200 bg-slate-50 text-slate-600 shrink-0 font-bold"
                  >
                    {modelBadge}
                  </Badge>
                </div>

                <p className="text-[11px] text-slate-500 font-mono truncate">{summaryLine}</p>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    {t.rounding?.fareMode === 'exact_cents'
                      ? 'Exact cents'
                      : t.rounding?.fareMode === 'nearest_half_dollar'
                      ? 'Nearest $0.50'
                      : t.rounding?.fareMode === 'nearest_dollar'
                      ? 'Nearest $1'
                      : 'Round up $1'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {t.isDefault && (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
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

      {/* Main Editor Pane */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto custom-scrollbar min-w-0">
        {workingCopy ? (
          <div className="p-5 space-y-5">
            {/* Sticky-feeling Header & Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-950">{workingCopy.name}</h2>
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {workingCopy.id}
                  </span>
                  {isDirty && (
                    <Badge
                      variant="warning"
                      size="sm"
                      className="text-[10px] bg-amber-100 text-amber-800 border-amber-300"
                    >
                      Unsaved Draft
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Base fare formula, rounding settings, and no-show or cancellation fees. Zone rules and surcharges are managed in <strong>Pricing Rules</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {saveSuccessMsg && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    {saveSuccessMsg}
                  </span>
                )}

                {onDeleteTariff && tariffs.length > 1 && confirmDeleteId !== workingCopy.id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDeleteId(workingCopy.id)}
                    className="h-8 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 bg-white cursor-pointer"
                  >
                    <TrashIcon className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                )}

                {confirmDeleteId === workingCopy.id && (
                  <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                    <span className="text-[11px] font-semibold text-rose-800">Delete rate?</span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleDeleteCurrentTariff}
                      className="h-6 px-2 text-[11px] bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      className="h-6 px-2 text-[11px] bg-white"
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isDirty}
                  onClick={() => selectedTariff && setWorkingCopy(JSON.parse(JSON.stringify(selectedTariff)))}
                  className="h-8 text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Discard
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer"
                >
                  <CheckIcon className="w-3.5 h-3.5 mr-1" />
                  {isSaving ? 'Saving...' : 'Save Rate'}
                </Button>
              </div>
            </div>

            {/* 1. Identity, Calculation Model & Default Flag */}
            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Rate Name</label>
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
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Calculation Model</label>
                  <select
                    value={workingCopy.rateModel || 'taximeter'}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      handleModelChange(e.target.value as TariffRateModel)
                    }
                    className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
                  >
                    <option value="taximeter">Stepped Mileage / Taximeter</option>
                    <option value="hourly">Hourly Charter</option>
                    <option value="zip_matrix">Zip-Code Flat Matrix</option>
                    <option value="corridor">Zone-to-Zone Corridors</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Description</label>
                  <Input
                    type="text"
                    value={workingCopy.description || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({ ...workingCopy, description: e.target.value })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center gap-5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={workingCopy.isActive}
                      onChange={(e) => setWorkingCopy({ ...workingCopy, isActive: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0"
                    />
                    <span>Active Rate</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(workingCopy.isDefault)}
                      onChange={(e) => setWorkingCopy({ ...workingCopy, isDefault: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                    />
                    <span>Default Rate (used when no Rule selects another Rate)</span>
                  </label>
                </div>

                {/* Linked Rules Cross-Reference */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500">Routed by Rules:</span>
                  {linkedRules.length > 0 ? (
                    linkedRules.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onNavigateToRule?.(r.id)}
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
                      >
                        P{r.priority} · {r.name}
                      </button>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">
                      {workingCopy.isDefault ? 'Default fallback for all rides' : 'None yet (assign in Rules tab)'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Core Rate Model Editor */}
            <div>
              {(workingCopy.rateModel === 'taximeter' || !workingCopy.rateModel) && (
                <TaximeterEditor
                  taximeter={workingCopy.taximeter}
                  onChange={(updatedMeter) =>
                    setWorkingCopy({
                      ...workingCopy,
                      taximeter: updatedMeter,
                      taximeterRate: updatedMeter,
                    })
                  }
                />
              )}

              {workingCopy.rateModel === 'corridor' && (
                <CorridorEditor
                  corridors={workingCopy.corridors || []}
                  onChange={(updatedCorridors) =>
                    setWorkingCopy({ ...workingCopy, corridors: updatedCorridors })
                  }
                />
              )}

              {workingCopy.rateModel === 'zip_matrix' && (
                <ZipRateMatrixEditor
                  entries={workingCopy.zipMatrix || workingCopy.zipMatrixRates || []}
                  onChange={(updatedEntries) =>
                    setWorkingCopy({
                      ...workingCopy,
                      zipMatrix: updatedEntries,
                      zipMatrixRates: updatedEntries,
                    })
                  }
                />
              )}

              {workingCopy.rateModel === 'hourly' && (
                <HourlyRateEditor
                  hourlyConfig={workingCopy.hourlyConfig || workingCopy.hourlyRate}
                  onChange={(updatedHourly) =>
                    setWorkingCopy({
                      ...workingCopy,
                      hourlyConfig: updatedHourly,
                      hourlyRate: updatedHourly,
                    })
                  }
                />
              )}
            </div>

            {/* 3. Per-Rate Rounding Settings */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-2.5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <SlidersIcon className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Rounding Settings</span>
                </h3>
                <span className="text-[11px] text-slate-500">Applies specifically to trips billed on this Rate</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Distance Rounding</label>
                  <select
                    value={currentRounding.distanceMode}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        rounding: {
                          ...currentRounding,
                          distanceMode: e.target.value as DistanceRoundingMode,
                        },
                      })
                    }
                    className="w-full h-9 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 px-2.5 font-semibold"
                  >
                    <option value="exact">Exact Mileage (honors 0.1 mi steps)</option>
                    <option value="half_mile_up">Round Up to Next 0.5 Mile</option>
                    <option value="whole_mile_up">Round Up to Next Whole Mile (1.0 mi)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Controls whether route mileage is rounded before applying distance steps.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Final Fare Rounding</label>
                  <select
                    value={currentRounding.fareMode}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        rounding: {
                          ...currentRounding,
                          fareMode: e.target.value as FareRoundingMode,
                        },
                      })
                    }
                    className="w-full h-9 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 px-2.5 font-semibold"
                  >
                    <option value="ceil_dollar">Round Up to Whole Dollar ($1.00)</option>
                    <option value="nearest_dollar">Round to Nearest Whole Dollar ($1.00)</option>
                    <option value="nearest_half_dollar">Round to Nearest $0.50</option>
                    <option value="exact_cents">Exact Cents ($0.01 — no rounding)</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Applied once at the end of the quote after extras, surcharges, and discounts.
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Per-Rate No-Show & Late Cancellation Policy */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-2.5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>No-Show &amp; Late Cancellation Policy</span>
                </h3>
                <span className="text-[11px] text-slate-500">Protection fees tied to this Rate</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Free Cancellation Window (min)
                  </label>
                  <Input
                    type="number"
                    step="15"
                    min="0"
                    value={currentCancel.freeWindowMinutes}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        cancellationPolicy: {
                          ...currentCancel,
                          freeWindowMinutes: parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-9 text-xs font-semibold"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Minutes before scheduled pickup (e.g., 60 min)
                  </span>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Late Cancellation Fee ($)
                  </label>
                  <Input
                    type="number"
                    step="1.00"
                    min="0"
                    value={currentCancel.cancellationFee}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        cancellationPolicy: {
                          ...currentCancel,
                          cancellationFee: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-rose-800 h-9 text-xs font-bold"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Charged if canceled inside the free window
                  </span>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Passenger No-Show Fee ($)
                  </label>
                  <Input
                    type="number"
                    step="1.00"
                    min="0"
                    value={currentCancel.noShowFee}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        cancellationPolicy: {
                          ...currentCancel,
                          noShowFee: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-rose-800 h-9 text-xs font-bold"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Charged when passenger fails to appear at pickup
                  </span>
                </div>
              </div>
            </div>

            {!workingCopy.isDefault && linkedRules.length === 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This Rate is not set as Default and no Rule currently routes to it. Create a Rule in{' '}
                  <strong>Rules &amp; Routing</strong> to specify when this Rate should be used.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-12">
            Select a Rate from the left panel or click &ldquo;+ New Rate&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
