import React, { useState, useEffect, useMemo } from 'react';
import type { UniversalExtrasConfig, CustomFleetExtra } from '~/core/services/pricing/extras.service';
import { type OversizedBagCategory, DEFAULT_OVERSIZED_BAG_CATEGORIES } from '~/core/types/config';
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
  EditIcon,
  LuggageIcon,
} from '~/components/ui/Icons';

export interface UniversalExtrasPanelProps {
  extras: UniversalExtrasConfig;
  onSave: (updated: UniversalExtrasConfig) => Promise<void>;
  onDraftChange?: (draft: UniversalExtrasConfig | null) => void;
  isSaving?: boolean;
}

export function UniversalExtrasPanel({
  extras,
  onSave,
  onDraftChange,
  isSaving = false,
}: UniversalExtrasPanelProps) {
  const [workingCopy, setWorkingCopy] = useState<UniversalExtrasConfig>(() =>
    JSON.parse(JSON.stringify(extras))
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync when persisted extras change
  useEffect(() => {
    setWorkingCopy(JSON.parse(JSON.stringify(extras)));
  }, [extras]);

  const isDirty = useMemo(
    () => JSON.stringify(workingCopy) !== JSON.stringify(extras),
    [workingCopy, extras]
  );

  useEffect(() => {
    onDraftChange?.(isDirty ? workingCopy : null);
  }, [workingCopy, isDirty, onDraftChange]);

  // New/Edit Custom Extra state
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customFee, setCustomFee] = useState(10.0);
  const [customDescription, setCustomDescription] = useState('');
  const [customIsPerUnit, setCustomIsPerUnit] = useState(false);
  const [customShowOnBooking, setCustomShowOnBooking] = useState(true);

  // Add new Oversized Cargo category state
  const [isAddingCargo, setIsAddingCargo] = useState(false);
  const [newCargoLabel, setNewCargoLabel] = useState('');
  const [newCargoFee, setNewCargoFee] = useState(15);
  const [newCargoUpgrade, setNewCargoUpgrade] = useState(true);

  const updateField = <K extends keyof UniversalExtrasConfig>(field: K, val: any) => {
    setWorkingCopy((prev) => ({
      ...prev,
      [field]: val,
    }));
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

  const handleAddCargoCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCargoLabel.trim()) return;
    const id = newCargoLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '') || `cargo_${Date.now()}`;
    const next: OversizedBagCategory[] = [
      ...oversizedList,
      {
        id,
        label: newCargoLabel.trim(),
        fee: Number(newCargoFee) || 0,
        requiresUpgrade: newCargoUpgrade,
        maxCount: 4,
      },
    ];
    updateField('oversizedBagsConfig', next);
    setNewCargoLabel('');
    setNewCargoFee(15);
    setNewCargoUpgrade(true);
    setIsAddingCargo(false);
  };

  const handleRemoveCargoCategory = (index: number) => {
    const next = oversizedList.filter((_, i) => i !== index);
    updateField('oversizedBagsConfig', next);
  };

  const handleSave = async () => {
    await onSave(workingCopy);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const resetCustomForm = () => {
    setIsAddingCustom(false);
    setEditingCustomId(null);
    setCustomName('');
    setCustomFee(10.0);
    setCustomDescription('');
    setCustomIsPerUnit(false);
    setCustomShowOnBooking(true);
  };

  const openEditCustomExtra = (ce: CustomFleetExtra) => {
    setEditingCustomId(ce.id);
    setCustomName(ce.name);
    setCustomFee(ce.fee);
    setCustomDescription(ce.description || '');
    setCustomIsPerUnit(Boolean(ce.isPerUnit));
    setCustomShowOnBooking(ce.showOnBookingForm !== false);
    setIsAddingCustom(true);
  };

  const handleSaveCustomExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const current = workingCopy.customExtras || [];
    let updatedList: CustomFleetExtra[];
    if (editingCustomId) {
      updatedList = current.map((ce) =>
        ce.id === editingCustomId
          ? {
              ...ce,
              name: customName.trim(),
              description: customDescription.trim() || undefined,
              fee: Number(customFee) || 0,
              isPerUnit: customIsPerUnit,
              showOnBookingForm: customShowOnBooking,
            }
          : ce
      );
    } else {
      const newExtra: CustomFleetExtra = {
        id: `extra-${Date.now()}`,
        name: customName.trim(),
        description: customDescription.trim() || undefined,
        fee: Number(customFee) || 0,
        isPerUnit: customIsPerUnit,
        isActive: true,
        showOnBookingForm: customShowOnBooking,
      };
      updatedList = [...current, newExtra];
    }

    updateField('customExtras', updatedList);
    resetCustomForm();
  };

  const handleToggleCustomExtraField = (
    id: string,
    field: 'isActive' | 'showOnBookingForm' | 'isPerUnit'
  ) => {
    updateField(
      'customExtras',
      (workingCopy.customExtras || []).map((ce) =>
        ce.id === id ? { ...ce, [field]: !(ce[field] !== false) } : ce
      )
    );
  };

  const handleRemoveCustomExtra = (id: string) => {
    updateField(
      'customExtras',
      (workingCopy.customExtras || []).filter((ce) => ce.id !== id)
    );
  };

  const graceMins = workingCopy.curbWaitingGraceMinutes ?? workingCopy.pickupGraceMinutes ?? 10;
  const waitRate = workingCopy.curbWaitingRatePerMinute ?? workingCopy.waitingRatePerMinute ?? 0.67;

  return (
    <div className="space-y-5">
      {/* Header Save Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Extras &amp; User-Selected Services</h2>
            {isDirty && (
              <Badge
                variant="warning"
                size="sm"
                className="text-[10px] bg-amber-100 text-amber-800 border-amber-300"
              >
                Unsaved Changes
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Single source of truth for optional services passengers choose on <code>/book</code> &amp; Dispatch, plus pickup curb wait time. Any Extra can be waived or overridden per condition in <strong>Rules</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              <CheckIcon className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isDirty}
            onClick={() => setWorkingCopy(JSON.parse(JSON.stringify(extras)))}
            className="h-8 text-xs border-slate-300 bg-white text-slate-700 cursor-pointer"
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer"
          >
            <CheckIcon className="w-3.5 h-3.5 mr-1" />
            {isSaving ? 'Saving...' : 'Save Extras'}
          </Button>
        </div>
      </div>

      {/* 4 Core Extra Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Child Safety Seats */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <BabyIcon className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Child Safety Seats</h3>
                <p className="text-[11px] text-slate-500">Infant, toddler &amp; booster seat rentals</p>
              </div>
            </div>
            <span className="text-base font-bold font-mono text-blue-700">
              ${(workingCopy.carSeatFeePerUnit ?? 10).toFixed(2)}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="text-xs font-medium text-slate-700 block mb-1">Fee per Child Seat ($)</label>
            <Input
              type="number"
              step="1.00"
              min="0"
              value={workingCopy.carSeatFeePerUnit ?? 10}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateField('carSeatFeePerUnit', parseFloat(e.target.value) || 0)
              }
              className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
            />
          </div>
        </div>

        {/* 2. Extra Passenger Headcount */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                <UsersIcon className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Extra Passengers</h3>
                <p className="text-[11px] text-slate-500">Per-head surcharge above included riders</p>
              </div>
            </div>
            <span className="text-base font-bold font-mono text-emerald-700">
              +${(workingCopy.extraPassengerFeePerHead ?? 1).toFixed(2)}/pax
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Included Free Riders</label>
              <Input
                type="number"
                step="1"
                min="1"
                value={workingCopy.passengerBaseAllowance ?? 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('passengerBaseAllowance', parseInt(e.target.value, 10) || 1)
                }
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Fee per Extra Pax ($)</label>
              <Input
                type="number"
                step="0.50"
                min="0"
                value={workingCopy.extraPassengerFeePerHead ?? 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('extraPassengerFeePerHead', parseFloat(e.target.value) || 0)
                }
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
            </div>
          </div>
        </div>

        {/* 3. Intermediate Stops */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
                <MapPinIcon className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Additional Stops</h3>
                <p className="text-[11px] text-slate-500">Customer-added intermediate waypoints</p>
              </div>
            </div>
            <span className="text-base font-bold font-mono text-purple-700">
              +${(workingCopy.intermediateStopFee ?? 5).toFixed(2)}/stop
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="text-xs font-medium text-slate-700 block mb-1">Fee per Stop ($)</label>
            <Input
              type="number"
              step="1.00"
              min="0"
              value={workingCopy.intermediateStopFee ?? 5}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateField('intermediateStopFee', parseFloat(e.target.value) || 0)
              }
              className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
            />
          </div>
        </div>

        {/* 4. Pickup Curb Wait Time (kept in Extras per design decision) */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                <ClockIcon className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pickup Curb Wait Time</h3>
                <p className="text-[11px] text-slate-500">Extra wait time past pickup grace window</p>
              </div>
            </div>
            <span className="text-base font-bold font-mono text-amber-700">
              ${waitRate.toFixed(2)}/min
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Free Grace Window (min)</label>
              <Input
                type="number"
                step="1"
                min="0"
                value={graceMins}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = parseInt(e.target.value, 10) || 0;
                  setWorkingCopy((prev) => ({
                    ...prev,
                    curbWaitingGraceMinutes: v,
                    pickupGraceMinutes: v,
                  }));
                }}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Wait Rate ($/min)</label>
              <Input
                type="number"
                step="0.05"
                min="0"
                value={waitRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = parseFloat(e.target.value) || 0;
                  setWorkingCopy((prev) => ({
                    ...prev,
                    curbWaitingRatePerMinute: v,
                    waitingRatePerMinute: v,
                  }));
                }}
                className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Oversized Cargo & Special Equipment */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <LuggageIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Oversized Cargo &amp; Special Gear</h3>
              <p className="text-[11px] text-slate-500">
                Items shown in the customer &amp; dispatch booking forms; checking &ldquo;Requires SUV/Van&rdquo; enforces a larger vehicle automatically.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAddingCargo(!isAddingCargo)}
            className="h-7.5 text-xs border-slate-300 bg-white text-slate-700 cursor-pointer shrink-0"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1" />
            Add Cargo Item
          </Button>
        </div>

        {isAddingCargo && (
          <form
            onSubmit={handleAddCargoCategory}
            className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-end gap-2.5"
          >
            <div className="flex-1 w-full">
              <label className="text-[11px] font-medium text-slate-700 block mb-1">Item Name</label>
              <Input
                type="text"
                required
                placeholder="e.g., Double Stroller / Wheelchair"
                value={newCargoLabel}
                onChange={(e) => setNewCargoLabel(e.target.value)}
                className="h-8 text-xs bg-white"
              />
            </div>
            <div className="w-full sm:w-28">
              <label className="text-[11px] font-medium text-slate-700 block mb-1">Fee ($)</label>
              <Input
                type="number"
                step="1"
                min="0"
                value={newCargoFee}
                onChange={(e) => setNewCargoFee(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs bg-white font-mono"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium h-8 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={newCargoUpgrade}
                onChange={(e) => setNewCargoUpgrade(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Requires SUV/Van</span>
            </label>
            <Button type="submit" size="sm" className="h-8 text-xs bg-indigo-600 text-white shrink-0">
              Add
            </Button>
          </form>
        )}

        <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg overflow-hidden">
          {oversizedList.map((cat, idx) => (
            <div
              key={cat.id}
              className="p-3 bg-white hover:bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex-1 min-w-0">
                <Input
                  type="text"
                  value={cat.label}
                  onChange={(e) => handleUpdateOversizedCategory(idx, { label: e.target.value })}
                  className="h-7.5 text-xs font-semibold text-slate-900 bg-transparent border-transparent hover:border-slate-300 focus:bg-white focus:border-blue-400 px-1.5"
                />
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Fee ($):</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={cat.fee}
                    onChange={(e) =>
                      handleUpdateOversizedCategory(idx, { fee: parseFloat(e.target.value) || 0 })
                    }
                    className="w-20 h-7.5 text-xs font-mono font-bold text-right bg-white"
                  />
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(cat.requiresUpgrade)}
                    onChange={(e) =>
                      handleUpdateOversizedCategory(idx, { requiresUpgrade: e.target.checked })
                    }
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Requires SUV/Van</span>
                </label>

                <button
                  type="button"
                  onClick={() => handleRemoveCargoCategory(idx)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Remove item"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Custom Bookable Fleet Extras */}
      <div className="p-4.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <SparklesIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Custom Bookable Add-Ons</h3>
              <p className="text-[11px] text-slate-500">
                Optional services (Meet &amp; Greet, Pet Transport, Red Carpet, etc.) selectable by riders or dispatch.
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetCustomForm();
              setIsAddingCustom(true);
            }}
            className="h-7.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shrink-0"
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1" />
            Add Custom Extra
          </Button>
        </div>

        {isAddingCustom && (
          <form
            onSubmit={handleSaveCustomExtra}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {editingCustomId ? 'Edit Custom Extra' : 'New Custom Extra'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-700 block mb-1">Service Name</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g., Airport Meet & Greet"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-700 block mb-1">Fee ($)</label>
                <Input
                  type="number"
                  step="0.50"
                  min="0"
                  value={customFee}
                  onChange={(e) => setCustomFee(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs bg-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-700 block mb-1">Description (Optional)</label>
                <Input
                  type="text"
                  placeholder="Short note shown to passengers"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={customShowOnBooking}
                    onChange={(e) => setCustomShowOnBooking(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Show on Public Booking Form (/book)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={customIsPerUnit}
                    onChange={(e) => setCustomIsPerUnit(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Allow Quantity (Per-Unit Pricing)</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetCustomForm}
                  className="h-7.5 text-xs bg-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-7.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {editingCustomId ? 'Update Extra' : 'Add Extra'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {(workingCopy.customExtras || []).length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            No custom add-ons yet. Click &ldquo;Add Custom Extra&rdquo; to offer optional services like Airport Meet &amp; Greet or Pet Transport.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg overflow-hidden">
            {(workingCopy.customExtras || []).map((ce) => (
              <div
                key={ce.id}
                className="p-3 bg-white hover:bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">{ce.name}</span>
                    <span className="text-xs font-mono font-bold text-emerald-700">
                      +${ce.fee.toFixed(2)}
                      {ce.isPerUnit ? ' / unit' : ''}
                    </span>
                  </div>
                  {ce.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{ce.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleCustomExtraField(ce.id, 'showOnBookingForm')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                      ce.showOnBookingForm !== false
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {ce.showOnBookingForm !== false ? 'On /book' : 'Dispatch Only'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleCustomExtraField(ce.id, 'isActive')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                      ce.isActive !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {ce.isActive !== false ? 'Active' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditCustomExtra(ce)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                    title="Edit Extra"
                  >
                    <EditIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomExtra(ce.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Delete Extra"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
