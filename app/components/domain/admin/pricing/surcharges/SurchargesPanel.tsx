import React, { useState, useEffect, useMemo } from 'react';
import type { SurchargesConfig, CustomSurchargeItem, CustomSurchargeTrigger, VehicleTierConfig } from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
import { getAdminConfigService } from '~/core/services/config/admin-config.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  ZapIcon,
  ShieldCheckIcon,
  ClockIcon,
  MapPinIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  SlidersIcon,
} from '~/components/ui/Icons';

export interface SurchargesPanelProps {
  surcharges: SurchargesConfig;
  tariffs: TariffProfile[];
  vehicles?: VehicleTierConfig[];
  onSave: (updated: SurchargesConfig) => Promise<void>;
  isSaving?: boolean;
}

const FALLBACK_VEHICLES = [
  { id: 'sedan', label: 'Executive Sedan' },
  { id: 'suv', label: 'SUV (XL)' },
  { id: 'minivan', label: 'Minivan' },
  { id: 'van', label: 'Van / Shuttle' },
  { id: 'wheelchair', label: 'WAV Wheelchair' },
];

export function SurchargesPanel({
  surcharges,
  tariffs,
  vehicles,
  onSave,
  isSaving = false,
}: SurchargesPanelProps) {
  const activeVehicles = useMemo(() => {
    let source = vehicles;
    if (!source || source.length === 0) {
      try {
        source = getAdminConfigService().getCachedSettings()?.vehicles;
      } catch {
        source = [];
      }
    }
    if (source && source.length > 0) {
      return source
        .filter((v) => !v.isArchived)
        .map((v) => ({
          id: v.id,
          label: v.name || v.id,
        }));
    }
    return FALLBACK_VEHICLES;
  }, [vehicles]);
  const normalizeConfig = (cfg: SurchargesConfig): SurchargesConfig => {
    const copy = JSON.parse(JSON.stringify(cfg));
    copy.airportGateFee = copy.airportGateFee ?? copy.airportCommercialGateFee ?? 4.0;
    copy.airportCommercialGateFee = copy.airportGateFee;
    copy.peakSurgeMultiplier = copy.peakSurgeMultiplier ?? 1.25;
    copy.outOfAreaRemoteFee = copy.outOfAreaRemoteFee ?? copy.remoteServiceFlatFee ?? 15.0;
    copy.remoteServiceFlatFee = copy.outOfAreaRemoteFee;
    copy.outOfAreaThresholdMiles = copy.outOfAreaThresholdMiles ?? copy.remoteBoundaryDistanceMiles ?? 15.0;
    copy.remoteBoundaryDistanceMiles = copy.outOfAreaThresholdMiles;
    copy.cancellationFeeWithinOneHour = copy.cancellationFeeWithinOneHour ?? copy.cancellationFee ?? 28.0;
    copy.cancellationFee = copy.cancellationFeeWithinOneHour;
    copy.cancellationWindowMinutes = copy.cancellationWindowMinutes ?? 60;
    copy.noShowFee = copy.noShowFee ?? 28.0;
    return copy;
  };

  const [workingCopy, setWorkingCopy] = useState<SurchargesConfig>(() =>
    normalizeConfig(surcharges)
  );

  useEffect(() => {
    setWorkingCopy(normalizeConfig(surcharges));
  }, [surcharges]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Custom Surcharge Editor Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState<number>(10.0);
  const [formType, setFormType] = useState<'flat' | 'percent'>('flat');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formTariffs, setFormTariffs] = useState<string[]>([]);
  const [formVehicleTiers, setFormVehicleTiers] = useState<string[]>([]);
  const [formMinDistance, setFormMinDistance] = useState<string>('');
  const [formMaxDistance, setFormMaxDistance] = useState<string>('');
  const [formHasTimeWindow, setFormHasTimeWindow] = useState(false);
  const [formStartHour, setFormStartHour] = useState<number>(22);
  const [formEndHour, setFormEndHour] = useState<number>(5);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormAmount(10.0);
    setFormType('flat');
    setFormIsActive(true);
    setFormTariffs(tariffs.map((t) => t.id));
    setFormVehicleTiers(['suv', 'minivan', 'van', 'wheelchair']);
    setFormMinDistance('');
    setFormMaxDistance('');
    setFormHasTimeWindow(false);
    setFormStartHour(22);
    setFormEndHour(5);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: CustomSurchargeItem) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormDescription(item.description || '');
    setFormAmount(item.amount);
    setFormType(item.type);
    setFormIsActive(item.isActive);
    setFormTariffs(item.applicableTariffIds || tariffs.map((t) => t.id));
    setFormVehicleTiers(item.triggers?.vehicleTiers || item.applicableVehicleTypes || []);
    setFormMinDistance(item.triggers?.minDistanceMiles !== undefined ? String(item.triggers.minDistanceMiles) : '');
    setFormMaxDistance(item.triggers?.maxDistanceMiles !== undefined ? String(item.triggers.maxDistanceMiles) : '');
    if (item.triggers?.timeWindow) {
      setFormHasTimeWindow(true);
      setFormStartHour(item.triggers.timeWindow.startHour);
      setFormEndHour(item.triggers.timeWindow.endHour);
    } else {
      setFormHasTimeWindow(false);
      setFormStartHour(22);
      setFormEndHour(5);
    }
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const triggers: CustomSurchargeTrigger = {};
    if (formVehicleTiers.length > 0) {
      triggers.vehicleTiers = [...formVehicleTiers];
      if (formVehicleTiers.includes('suv')) triggers.vehicleTiers.push('xl');
      if (formVehicleTiers.includes('wheelchair')) triggers.vehicleTiers.push('wheelchair_wav');
    }
    if (formMinDistance.trim() !== '') {
      triggers.minDistanceMiles = parseFloat(formMinDistance);
    }
    if (formMaxDistance.trim() !== '') {
      triggers.maxDistanceMiles = parseFloat(formMaxDistance);
    }
    if (formHasTimeWindow) {
      triggers.timeWindow = {
        startHour: Number(formStartHour),
        endHour: Number(formEndHour),
      };
    }

    const newItem: CustomSurchargeItem = {
      id: editingId || `surcharge-${Date.now()}`,
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      amount: Number(formAmount) || 0,
      type: formType,
      isActive: formIsActive,
      applicableTariffIds: formTariffs.length > 0 ? formTariffs : undefined,
      triggers: Object.keys(triggers).length > 0 ? triggers : undefined,
    };

    const currentList = workingCopy.customSurcharges || [];
    const nextList = editingId
      ? currentList.map((item) => (item.id === editingId ? newItem : item))
      : [...currentList, newItem];

    setWorkingCopy({
      ...workingCopy,
      customSurcharges: nextList,
    });
    setIsModalOpen(false);
  };

  const handleToggleSurchargeActive = (id: string) => {
    const nextList = (workingCopy.customSurcharges || []).map((item) =>
      item.id === id ? { ...item, isActive: !item.isActive } : item
    );
    setWorkingCopy({ ...workingCopy, customSurcharges: nextList });
  };

  const handleDeleteSurcharge = (id: string) => {
    const nextList = (workingCopy.customSurcharges || []).filter((item) => item.id !== id);
    setWorkingCopy({ ...workingCopy, customSurcharges: nextList });
  };

  const updateField = <K extends keyof SurchargesConfig>(field: K, val: any) => {
    setWorkingCopy({
      ...workingCopy,
      [field]: val,
    });
  };

  const handleSave = async () => {
    const payload: SurchargesConfig = {
      ...workingCopy,
      airportGateFee: workingCopy.airportGateFee ?? workingCopy.airportCommercialGateFee ?? 4.0,
      airportCommercialGateFee: workingCopy.airportGateFee ?? workingCopy.airportCommercialGateFee ?? 4.0,
      peakSurgeMultiplier: workingCopy.peakSurgeMultiplier ?? 1.25,
      outOfAreaRemoteFee: workingCopy.outOfAreaRemoteFee ?? workingCopy.remoteServiceFlatFee ?? 15.0,
      remoteServiceFlatFee: workingCopy.outOfAreaRemoteFee ?? workingCopy.remoteServiceFlatFee ?? 15.0,
      outOfAreaThresholdMiles: workingCopy.outOfAreaThresholdMiles ?? workingCopy.remoteBoundaryDistanceMiles ?? 15.0,
      remoteBoundaryDistanceMiles: workingCopy.outOfAreaThresholdMiles ?? workingCopy.remoteBoundaryDistanceMiles ?? 15.0,
      cancellationFeeWithinOneHour: workingCopy.cancellationFeeWithinOneHour ?? workingCopy.cancellationFee ?? 28.0,
      cancellationFee: workingCopy.cancellationFeeWithinOneHour ?? workingCopy.cancellationFee ?? 28.0,
      cancellationWindowMinutes: workingCopy.cancellationWindowMinutes ?? 60,
      noShowFee: workingCopy.noShowFee ?? 28.0,
    };
    await onSave(payload);
    setWorkingCopy(payload);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const toggleApplicableTariff = (surchargeKey: 'airport' | 'surge' | 'remote', tariffId: string) => {
    const listKey =
      surchargeKey === 'airport'
        ? 'airportFeeApplicableTariffs'
        : surchargeKey === 'surge'
        ? 'surgeApplicableTariffs'
        : 'remoteFeeApplicableTariffs';

    const currentList = (workingCopy as any)[listKey] || [];
    const nextList = currentList.includes(tariffId)
      ? currentList.filter((id: string) => id !== tariffId)
      : [...currentList, tariffId];

    updateField(listKey as any, nextList);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="p-4.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ZapIcon className="w-4 h-4 text-amber-500" />
              Surcharges & Operational Fees
            </h2>
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
              Surcharges
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational gate fees, remote radius fees, temporal surge multipliers, and cancellation protections. Configure which tariffs each surcharge applies to.
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
            Save Surcharges
          </Button>
        </div>
      </div>

      {/* 4 Core Surcharge Cards */}
      <div className="space-y-4">
        {/* 1. Airport Commercial Access Fee */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                <MapPinIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Airport Commercial Access Fee</h3>
                <p className="text-[11px] text-slate-500">Lambert International (STL) airport commercial terminal gate fee</p>
              </div>
            </div>
            <span className="text-base font-bold text-emerald-700">
              ${(workingCopy.airportGateFee ?? workingCopy.airportCommercialGateFee ?? 4.00).toFixed(2)} flat
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Gate Fee Amount ($)</label>
              <Input
                type="number"
                step="0.50"
                min="0"
                value={workingCopy.airportGateFee ?? workingCopy.airportCommercialGateFee ?? 4.00}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 0;
                  setWorkingCopy((prev) => ({
                    ...prev,
                    airportGateFee: val,
                    airportCommercialGateFee: val,
                  }));
                }}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Standard STL airport authority pass-through charge (${(workingCopy.airportGateFee ?? workingCopy.airportCommercialGateFee ?? 4.00).toFixed(2)})
              </span>
            </div>

            {/* Applicable Tariffs */}
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5">Applicable Tariff Rates:</label>
              <div className="flex flex-wrap gap-2">
                {tariffs.map((t) => {
                  const isChecked = (workingCopy.airportFeeApplicableTariffs || ['tariff-airport-flat']).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleApplicableTariff('airport', t.id)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isChecked
                          ? 'bg-blue-50 border-blue-400 text-blue-900 font-medium'
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-blue-600' : 'bg-slate-300'}`} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Peak Demand Surge Multiplier */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <ZapIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Peak Demand Surge Multiplier</h3>
                <p className="text-[11px] text-slate-500">Dynamic multiplier applied during peak congestion windows</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-amber-700">
                {(workingCopy.peakSurgeMultiplier ?? 1.25).toFixed(2)}x
              </span>
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  workingCopy.isPeakSurgeActive ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Surge Multiplier</label>
              <Input
                type="number"
                step="0.05"
                min="1.0"
                max="3.0"
                value={workingCopy.peakSurgeMultiplier ?? 1.25}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('peakSurgeMultiplier', parseFloat(e.target.value) || 1.0)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                {(workingCopy.peakSurgeMultiplier ?? 1.25) > 1
                  ? `${(workingCopy.peakSurgeMultiplier ?? 1.25).toFixed(2)}x (+${Math.round(((workingCopy.peakSurgeMultiplier ?? 1.25) - 1) * 100)}% peak premium)`
                  : '1.00x (Standard fare, no surge applied)'}
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-2">Surge State</label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={workingCopy.isPeakSurgeActive}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('isPeakSurgeActive', e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-0"
                />
                <span>Surge Currently Active</span>
              </label>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Contract rates (Smoke House) are always exempt
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5">Applicable Tariff Rates:</label>
              <div className="flex flex-wrap gap-2">
                {tariffs.map((t) => {
                  const isChecked = (workingCopy.surgeApplicableTariffs || [
                    'tariff-airport-flat',
                    'tariff-point-to-point-meter',
                  ]).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleApplicableTariff('surge', t.id)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isChecked
                          ? 'bg-amber-50 border-amber-400 text-amber-900 font-medium'
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-amber-500' : 'bg-slate-300'}`} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Out-of-Area Remote Service Fee */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Out-of-Area Remote Service Fee</h3>
                <p className="text-[11px] text-slate-500">Flat operational fee when trip distance exceeds regional service boundary</p>
              </div>
            </div>
            <span className="text-base font-bold text-emerald-700">
              ${(workingCopy.outOfAreaRemoteFee ?? workingCopy.remoteServiceFlatFee ?? 15.00).toFixed(2)} flat
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Boundary Distance (mi)</label>
              <Input
                type="number"
                step="1.0"
                min="5"
                value={workingCopy.outOfAreaThresholdMiles ?? workingCopy.remoteBoundaryDistanceMiles ?? 15}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 15;
                  setWorkingCopy((prev) => ({
                    ...prev,
                    outOfAreaThresholdMiles: val,
                    remoteBoundaryDistanceMiles: val,
                  }));
                }}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Triggered when trip distance exceeds {workingCopy.outOfAreaThresholdMiles ?? workingCopy.remoteBoundaryDistanceMiles ?? 15} miles
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Remote Service Fee ($)</label>
              <Input
                type="number"
                step="1.00"
                min="0"
                value={workingCopy.outOfAreaRemoteFee ?? workingCopy.remoteServiceFlatFee ?? 15.00}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 0;
                  setWorkingCopy((prev) => ({
                    ...prev,
                    outOfAreaRemoteFee: val,
                    remoteServiceFlatFee: val,
                  }));
                }}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Standard remote dispatch fee (${(workingCopy.outOfAreaRemoteFee ?? workingCopy.remoteServiceFlatFee ?? 15.00).toFixed(2)})
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5">Applicable Tariff Rates:</label>
              <div className="flex flex-wrap gap-2">
                {tariffs.map((t) => {
                  const isChecked = (workingCopy.remoteFeeApplicableTariffs || [
                    'tariff-airport-flat',
                    'tariff-point-to-point-meter',
                  ]).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleApplicableTariff('remote', t.id)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isChecked
                          ? 'bg-purple-50 border-purple-400 text-purple-900 font-medium'
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-purple-500' : 'bg-slate-300'}`} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Cancellation & No-Show Protection */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                <ClockIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cancellation & No-Show Protection</h3>
                <p className="text-[11px] text-slate-500">Driver compensation protections for late cancellations and customer no-shows</p>
              </div>
            </div>
            <span className="text-base font-bold text-rose-700">
              ${(workingCopy.cancellationFeeWithinOneHour ?? workingCopy.cancellationFee ?? 28.00).toFixed(2)} fee
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Cancellation Window (min)</label>
              <Input
                type="number"
                step="5"
                min="5"
                value={workingCopy.cancellationWindowMinutes ?? 60}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('cancellationWindowMinutes', parseInt(e.target.value, 10) || 60)}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                {workingCopy.cancellationWindowMinutes ?? 60} min (if cancelled within window of pickup)
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Cancellation Fee ($)</label>
              <Input
                type="number"
                step="1.00"
                min="0"
                value={workingCopy.cancellationFeeWithinOneHour ?? workingCopy.cancellationFee ?? 28.00}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 0;
                  setWorkingCopy((prev) => ({
                    ...prev,
                    cancellationFeeWithinOneHour: val,
                    cancellationFee: val,
                  }));
                }}
                className="bg-white border-slate-300 text-rose-700 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                ${(workingCopy.cancellationFeeWithinOneHour ?? workingCopy.cancellationFee ?? 28.00).toFixed(2)} minimum fare floor protection
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">No-Show Fee ($)</label>
              <Input
                type="number"
                step="1.00"
                min="0"
                value={workingCopy.noShowFee ?? 28.00}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('noShowFee', parseFloat(e.target.value) || 0)}
                className="bg-white border-slate-300 text-rose-700 h-8 text-xs font-semibold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Driver on scene, passenger fails to appear (${(workingCopy.noShowFee ?? 28.00).toFixed(2)})
              </span>
            </div>
          </div>
        </div>

        {/* 5. Custom & Conditional Surcharges Section */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <SlidersIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Custom &amp; Conditional Surcharges</h3>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]">
                    {(workingCopy.customSurcharges || []).length} Configured
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  Custom fees triggered by vehicle tier (e.g. SUV/Minivan $10 fee), trip distance, time-of-day, or zones.
                </p>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleOpenCreate}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-2xs cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 mr-1" />
              Add Surcharge
            </Button>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            {(!workingCopy.customSurcharges || workingCopy.customSurcharges.length === 0) ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No custom surcharges configured. Click &ldquo;+ Add Surcharge&rdquo; to define a conditional fee.
              </div>
            ) : (
              workingCopy.customSurcharges.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-lg border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    item.isActive ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{item.name}</span>
                      <span className="text-xs font-bold text-emerald-700">
                        {item.type === 'percent' ? `+${item.amount}%` : `+$${item.amount.toFixed(2)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleSurchargeActive(item.id)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold cursor-pointer border ${
                          item.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-slate-200 text-slate-600 border-slate-300'
                        }`}
                      >
                        {item.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-slate-500">{item.description}</p>
                    )}

                    {/* Condition Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {item.triggers?.vehicleTiers && item.triggers.vehicleTiers.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-medium">
                          Vehicles: {item.triggers.vehicleTiers.map((tId) => {
                            const found = activeVehicles.find((av) => av.id.toLowerCase() === tId.toLowerCase());
                            return found ? found.label : tId.toUpperCase();
                          }).join(', ')}
                        </Badge>
                      )}
                      {item.triggers?.minDistanceMiles !== undefined && (
                        <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-medium">
                          Min Distance: &gt; {item.triggers.minDistanceMiles} mi
                        </Badge>
                      )}
                      {item.triggers?.timeWindow && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-medium">
                          Hours: {item.triggers.timeWindow.startHour}:00 - {item.triggers.timeWindow.endHour}:00
                        </Badge>
                      )}
                      {item.applicableTariffIds && item.applicableTariffIds.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 font-medium">
                          {item.applicableTariffIds.length} Tariff{item.applicableTariffIds.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                      title="Edit Surcharge"
                    >
                      <EditIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSurcharge(item.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer border border-slate-200"
                      title="Delete Surcharge"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Surcharge Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingId ? 'Edit Surcharge' : 'Create New Surcharge'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Surcharge Name *</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. SUV / Minivan Upgrade Fee"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">Description</label>
                <Input
                  type="text"
                  placeholder="e.g. $10 fee for SUV and Minivan capacity"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Fee Amount *</label>
                  <Input
                    type="number"
                    step="0.50"
                    min="0"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(parseFloat(e.target.value) || 0)}
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Fee Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
                  >
                    <option value="flat">Flat Dollar ($)</option>
                    <option value="percent">Percentage (%)</option>
                  </select>
                </div>
              </div>

              {/* Vehicle Conditions */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Trigger on Vehicle Types (Leave empty for all vehicles):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {activeVehicles.map((v) => {
                    const isSelected = formVehicleTiers.some((id) => id.toLowerCase() === v.id.toLowerCase());
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setFormVehicleTiers(
                            isSelected
                              ? formVehicleTiers.filter((id) => id.toLowerCase() !== v.id.toLowerCase())
                              : [...formVehicleTiers, v.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Distance Conditions */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Min Distance (mi)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Optional"
                    value={formMinDistance}
                    onChange={(e) => setFormMinDistance(e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Max Distance (mi)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Optional"
                    value={formMaxDistance}
                    onChange={(e) => setFormMaxDistance(e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Time Window Condition */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formHasTimeWindow}
                    onChange={(e) => setFormHasTimeWindow(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">Restrict to Time Window (e.g. Late Night)</span>
                </label>

                {formHasTimeWindow && (
                  <div className="grid grid-cols-2 gap-3 pl-5">
                    <div>
                      <label className="text-[11px] text-slate-600 block mb-1">Start Hour (0–23)</label>
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={formStartHour}
                        onChange={(e) => setFormStartHour(parseInt(e.target.value, 10) || 0)}
                        className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-600 block mb-1">End Hour (0–23)</label>
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={formEndHour}
                        onChange={(e) => setFormEndHour(parseInt(e.target.value, 10) || 0)}
                        className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Applicable Tariffs */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">Applicable Tariffs:</label>
                <div className="flex flex-wrap gap-1.5">
                  {tariffs.map((t) => {
                    const isSelected = formTariffs.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setFormTariffs(
                            isSelected
                              ? formTariffs.filter((id) => id !== t.id)
                              : [...formTariffs, t.id]
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs border-slate-300 text-slate-700 bg-white cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer"
                >
                  {editingId ? 'Update Surcharge' : 'Add Surcharge'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
