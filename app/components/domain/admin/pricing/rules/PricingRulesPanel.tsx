import React, { useState, useEffect, useMemo } from 'react';
import type {
  NamedPricingRule,
  VehicleType,
  VehicleTierConfig,
  CorporateAccountConfig,
  PricingRuleModifier,
} from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
import type { ZoneGeofence } from '~/core/types/zone';
import { getAdminConfigService } from '~/core/services/config/admin-config.service';
import { getZoneService, DEFAULT_ZONES } from '~/core/services/zones/zone.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  ShieldCheckIcon,
  PlusIcon,
  CheckIcon,
  SearchIcon,
  MapPinIcon,
  SlidersIcon,
  TrashIcon,
} from '~/components/ui/Icons';

export interface PricingRulesPanelProps {
  rules: NamedPricingRule[];
  tariffs: TariffProfile[];
  vehicles?: VehicleTierConfig[];
  corporateAccounts?: CorporateAccountConfig[];
  onSaveRule: (rule: NamedPricingRule) => Promise<void>;
  onDeleteRule?: (id: string) => Promise<void>;
  isSaving?: boolean;
}

const FALLBACK_VEHICLE_TYPES: { id: VehicleType; label: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
  { id: 'minivan', label: 'Minivan' },
  { id: 'van', label: 'Van / Shuttle' },
  { id: 'wheelchair_wav', label: 'WAV Wheelchair' },
];

export function PricingRulesPanel({
  rules,
  tariffs,
  vehicles,
  corporateAccounts,
  onSaveRule,
  onDeleteRule,
  isSaving = false,
}: PricingRulesPanelProps) {
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
        .map((v) => ({ id: v.id, label: v.name || v.id }));
    }
    return FALLBACK_VEHICLE_TYPES;
  }, [vehicles]);

  const activeCorporateAccounts = useMemo(() => {
    let source = corporateAccounts;
    if (!source || source.length === 0) {
      try {
        source = getAdminConfigService().getCachedSettings()?.corporateAccounts;
      } catch {
        source = [];
      }
    }
    return (source || []).filter((c) => c.isActive !== false);
  }, [corporateAccounts]);

  const [selectedRuleId, setSelectedRuleId] = useState<string>(rules[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [availableZones, setAvailableZones] = useState<ZoneGeofence[]>(() => {
    try {
      const active = getZoneService().getActiveZones();
      return active.length > 0 ? active : DEFAULT_ZONES;
    } catch {
      return DEFAULT_ZONES;
    }
  });

  useEffect(() => {
    try {
      const unsub = getZoneService().subscribeToZones((zones) => {
        const active = zones.filter((z) => z.isActive && !z.isArchived);
        if (active.length > 0) setAvailableZones(active);
      });
      return () => unsub();
    } catch {
      return undefined;
    }
  }, []);

  const selectedRule = rules.find((r) => r.id === selectedRuleId) || rules[0] || null;
  const [workingCopy, setWorkingCopy] = useState<NamedPricingRule | null>(
    selectedRule ? JSON.parse(JSON.stringify(selectedRule)) : null
  );

  // Sync workingCopy when Firestore rules hydrate or selection changes
  useEffect(() => {
    if (selectedRule && (!workingCopy || workingCopy.id !== selectedRule.id)) {
      setSelectedRuleId(selectedRule.id);
      setWorkingCopy(JSON.parse(JSON.stringify(selectedRule)));
    } else if (!selectedRule && rules.length === 0) {
      setWorkingCopy(null);
    }
  }, [selectedRule, rules.length]);

  const handleSelectRule = (id: string) => {
    setSelectedRuleId(id);
    const target = rules.find((r) => r.id === id);
    if (target) {
      setWorkingCopy(JSON.parse(JSON.stringify(target)));
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!workingCopy) return;
    await onSaveRule(workingCopy);
    setSaveSuccessMsg(`Saved rule "${workingCopy.name}" successfully!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleDeleteCurrentRule = async () => {
    if (!workingCopy || !onDeleteRule) return;
    const deletedId = workingCopy.id;
    const deletedName = workingCopy.name;
    const nextRule = rules.find((r) => r.id !== deletedId);
    await onDeleteRule(deletedId);
    if (nextRule) {
      setSelectedRuleId(nextRule.id);
      setWorkingCopy(JSON.parse(JSON.stringify(nextRule)));
    } else {
      setSelectedRuleId('');
      setWorkingCopy(null);
    }
    setSaveSuccessMsg(`Deleted rule "${deletedName}"`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleAddNewRule = async () => {
    const newId = `rule-${Date.now()}`;
    const newRule: NamedPricingRule = {
      id: newId,
      name: `New Pricing Rule #${rules.length + 1}`,
      description: 'Automated tariff routing and fee modifier rule',
      isActive: true,
      priority: 80,
      allowDriverSelection: false,
      stopProcessingOnMatch: false,
      triggers: {
        isBidirectionalTransfer: false,
        // Empty vehicle arrays = matches ALL fleet vehicles by default
        vehicleTypes: [],
        vehicleClasses: [],
      },
      modifier: {
        type: 'apply_tariff',
        value: 0,
        targetTariffId: tariffs[0]?.id || 'tariff-airport-flat',
      },
    };

    setWorkingCopy(newRule);
    setSelectedRuleId(newId);
    await onSaveRule(newRule);
  };

  const getWorkingVehicleTypes = (r: NamedPricingRule): string[] => {
    return Array.from(
      new Set([...(r.triggers.vehicleTypes || []), ...(r.triggers.vehicleTiers || [])])
    );
  };

  const toggleTriggerVehicleType = (vtId: string) => {
    if (!workingCopy) return;
    const current = getWorkingVehicleTypes(workingCopy);
    const next = current.some((x) => x.toLowerCase() === vtId.toLowerCase())
      ? current.filter((x) => x.toLowerCase() !== vtId.toLowerCase())
      : [...current, vtId];
    setWorkingCopy({
      ...workingCopy,
      triggers: {
        ...workingCopy.triggers,
        vehicleTypes: next,
        vehicleTiers: undefined,
      },
    });
  };

  const toggleExtraWaiver = (field: 'waiveCarSeatFee' | 'waiveExtraPaxFee', checked: boolean) => {
    if (!workingCopy) return;
    const nextOverrule = { ...(workingCopy.modifier.overruleExtras || {}) };
    if (checked) {
      nextOverrule[field] = true;
    } else {
      delete nextOverrule[field];
      if (field === 'waiveCarSeatFee') delete nextOverrule.carSeatFeePerUnit;
      if (field === 'waiveExtraPaxFee') delete nextOverrule.extraPassengerFeePerHead;
    }
    setWorkingCopy({
      ...workingCopy,
      modifier: {
        ...workingCopy.modifier,
        overruleExtras: Object.keys(nextOverrule).length > 0 ? nextOverrule : undefined,
      },
    });
  };

  const toggleSurchargeWaiver = (
    field: 'waiveAirportFee' | 'waiveRemoteFee' | 'waiveFuelSurcharge',
    checked: boolean
  ) => {
    if (!workingCopy) return;
    const nextOverrule = { ...(workingCopy.modifier.overruleSurcharges || {}) };
    if (checked) {
      nextOverrule[field] = true;
    } else {
      delete nextOverrule[field];
      if (field === 'waiveAirportFee') delete nextOverrule.airportGateFee;
      if (field === 'waiveRemoteFee') delete nextOverrule.outOfAreaRemoteFee;
    }
    setWorkingCopy({
      ...workingCopy,
      modifier: {
        ...workingCopy.modifier,
        overruleSurcharges: Object.keys(nextOverrule).length > 0 ? nextOverrule : undefined,
      },
    });
  };

  const modifierType = workingCopy?.modifier.type || 'apply_tariff';

  return (
    <div className="flex flex-col lg:flex-row min-h-[640px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
      {/* Left Sub-Panel: Rule List */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-slate-50/80 shrink-0">
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-600" />
              Pricing Rules ({rules.length})
            </h3>
            <Button
              type="button"
              size="sm"
              onClick={handleAddNewRule}
              className="h-7 text-xs bg-purple-600 hover:bg-purple-500 text-white px-2.5 shadow-2xs cursor-pointer"
            >
              <PlusIcon className="w-3 h-3 mr-1" />
              New Rule
            </Button>
          </div>
          <div className="relative">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="h-7.5 text-xs pl-7.5 bg-white border-slate-200 text-slate-800 w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
          {filteredRules.map((rule) => {
            const isSelected = rule.id === selectedRuleId;
            const targetTariff = tariffs.find((t) => t.id === rule.modifier.targetTariffId);

            return (
              <button
                key={rule.id}
                type="button"
                onClick={() => handleSelectRule(rule.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-purple-50/90 border-purple-400 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-slate-900 truncate">{rule.name}</span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 bg-purple-50 text-purple-800 border-purple-300 shrink-0 font-mono"
                  >
                    P:{rule.priority}
                  </Badge>
                </div>

                <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                  {rule.description || 'Automated tariff routing and override rule'}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-1.5">
                  <div className="flex items-center gap-1 text-blue-700 truncate font-medium">
                    <span>↳</span>
                    <span className="truncate">
                      {rule.modifier.type === 'flat_override'
                        ? `Flat $${rule.modifier.value}`
                        : rule.modifier.type === 'multiplier'
                        ? `${rule.modifier.value}× Fare`
                        : rule.modifier.type === 'surcharge_flat'
                        ? `+$${rule.modifier.value}`
                        : rule.modifier.type === 'surcharge_percent'
                        ? `+${rule.modifier.value}%`
                        : targetTariff?.name || 'Tariff Routing'}
                    </span>
                  </div>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      rule.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                </div>
              </button>
            );
          })}

          {filteredRules.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400">
              No pricing rules configured. Click &ldquo;+ New Rule&rdquo; to create one.
            </div>
          )}
        </div>
      </div>

      {/* Center Sub-Panel: Granular Rule Editor */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto custom-scrollbar">
        {workingCopy ? (
          <div className="p-6 space-y-6">
            {saveSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckIcon className="w-4 h-4 text-emerald-600" />
                  {saveSuccessMsg}
                </span>
              </div>
            )}

            {/* Rule Header Card */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">{workingCopy.name}</h2>
                    <Badge variant="outline" className="text-[10px] font-mono text-slate-600 border-slate-300 bg-white">
                      ID: {workingCopy.id}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    IF trip matches conditions below → THEN route to target tariff, apply modifiers, or waive specific fees.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {onDeleteRule && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteCurrentRule}
                      disabled={isSaving}
                      className="text-xs border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300 shadow-2xs cursor-pointer"
                    >
                      <TrashIcon className="w-3.5 h-3.5 mr-1" />
                      Delete
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectRule(workingCopy.id)}
                    className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-2xs cursor-pointer"
                  >
                    <CheckIcon className="w-3.5 h-3.5 mr-1" />
                    Save Pricing Rule
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-3 border-t border-slate-200">
                <div className="md:col-span-3">
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Rule Name</label>
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
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Evaluation Priority (1 - 100)
                  </label>
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

              <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.isActive}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({ ...workingCopy, isActive: e.target.checked })
                    }
                    className="rounded border-slate-300 text-purple-600 focus:ring-0"
                  />
                  <span>Active Rule</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.stopProcessingOnMatch || false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        stopProcessingOnMatch: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-amber-600 focus:ring-0"
                  />
                  <span>Stop Processing Further Rules on Match</span>
                </label>
              </div>
            </div>

            {/* 1. Trigger Matrix Section */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MapPinIcon className="w-3.5 h-3.5 text-blue-600" />
                1. IF — Trip Conditions &amp; Triggers
              </h3>

              {/* Bidirectional Transfer Trigger */}
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-900">
                  <input
                    type="checkbox"
                    checked={workingCopy.triggers.isBidirectionalTransfer || false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          isBidirectionalTransfer: e.target.checked,
                        },
                      })
                    }
                    className="rounded border-blue-400 text-blue-600 focus:ring-0"
                  />
                  <span>Bidirectional Transfer Trigger (Matches either Pickup OR Dropoff in selected zones)</span>
                </label>
                <p className="text-[11px] text-blue-700 pl-5">
                  Ideal for airport transfers — 1 unified rule handles both inbound &amp; outbound airport trips.
                </p>
              </div>

              {/* Target Zones & Corporate Accounts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Corporate Account Trigger
                  </label>
                  <select
                    value={(workingCopy.triggers.accountTags || [])[0] || ''}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          accountTags: e.target.value ? [e.target.value] : [],
                        },
                      })
                    }
                    className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
                  >
                    <option value="">Any / Public Retail Trips</option>
                    {activeCorporateAccounts.map((corp) => (
                      <option key={corp.id} value={corp.id}>
                        {corp.companyName} ({corp.accountNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Target Service Zones (Leave empty for all zones)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. zone-lambert-airport, zone-spirit-airport"
                    value={(workingCopy.triggers.zoneIds || []).join(', ')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          zoneIds: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                  {availableZones.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {availableZones.map((z) => {
                        const currentZones = workingCopy.triggers.zoneIds || [];
                        const isSelected = currentZones.includes(z.id);
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => {
                              const nextZones = isSelected
                                ? currentZones.filter((id) => id !== z.id)
                                : [...currentZones, z.id];
                              setWorkingCopy({
                                ...workingCopy,
                                triggers: {
                                  ...workingCopy.triggers,
                                  zoneIds: nextZones,
                                },
                              });
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                            }`}
                            title={`${z.name} (${z.id})`}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: isSelected ? '#ffffff' : z.color || '#3b82f6' }}
                            />
                            {z.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Distance Triggers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200/80">
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Min Trip Distance (miles, optional)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="No minimum"
                    value={workingCopy.triggers.minDistanceMiles ?? ''}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          minDistanceMiles: e.target.value === '' ? undefined : parseFloat(e.target.value),
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Max Trip Distance (miles, optional)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="No maximum"
                    value={workingCopy.triggers.maxDistanceMiles ?? ''}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          maxDistanceMiles: e.target.value === '' ? undefined : parseFloat(e.target.value),
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Fleet Vehicle Eligibility (Uses REAL Admin Vehicles) */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  Restrict to Fleet Vehicle Types (Leave empty for All Vehicles):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          vehicleTypes: [],
                          vehicleTiers: undefined,
                          vehicleClasses: [],
                        },
                      })
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                      getWorkingVehicleTypes(workingCopy).length === 0
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    All Vehicles
                  </button>
                  {activeVehicles.map((vt) => {
                    const isChecked = getWorkingVehicleTypes(workingCopy).some(
                      (id) => id.toLowerCase() === vt.id.toLowerCase()
                    );
                    return (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => toggleTriggerVehicleType(vt.id)}
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
            </div>

            {/* 2. Actions & Modifiers Section */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <SlidersIcon className="w-3.5 h-3.5 text-emerald-600" />
                2. THEN — Target Tariff, Fare Modifier &amp; Fee Waivers
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Primary Rule Action
                  </label>
                  <select
                    value={modifierType}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        modifier: {
                          ...workingCopy.modifier,
                          type: e.target.value as PricingRuleModifier['type'],
                        },
                      })
                    }
                    className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-semibold"
                  >
                    <option value="apply_tariff">Route to Target Tariff</option>
                    <option value="flat_override">Flat Base Fare Override ($)</option>
                    <option value="surcharge_flat">Add Flat Surcharge ($)</option>
                    <option value="surcharge_percent">Add Percentage Surcharge (%)</option>
                    <option value="multiplier">Multiply Base Fare (×)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Target Tariff Profile
                  </label>
                  <select
                    value={workingCopy.modifier.targetTariffId || ''}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        modifier: {
                          ...workingCopy.modifier,
                          targetTariffId: e.target.value || undefined,
                        },
                      })
                    }
                    className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
                  >
                    <option value="">Auto-Match Tariff</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.rateModel?.toUpperCase() || 'TAXIMETER'})
                      </option>
                    ))}
                  </select>
                </div>

                {modifierType !== 'apply_tariff' ? (
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 block mb-1">
                      {modifierType === 'flat_override'
                        ? 'Flat Override Amount ($)'
                        : modifierType === 'multiplier'
                        ? 'Multiplier (e.g. 1.25)'
                        : modifierType === 'surcharge_percent'
                        ? 'Percentage (%)'
                        : 'Flat Surcharge Amount ($)'}
                    </label>
                    <Input
                      type="number"
                      step={modifierType === 'multiplier' ? '0.05' : '1'}
                      min="0"
                      value={workingCopy.modifier.value ?? 0}
                      onChange={(e) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            value: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-bold"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 block mb-1">
                      Optional Layered Zone Fee ($)
                    </label>
                    <Input
                      type="number"
                      step="1.00"
                      min="0"
                      value={workingCopy.modifier.layerZoneFee || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            layerZoneFee: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="bg-white border-slate-300 text-slate-900 h-8 text-xs font-semibold"
                    />
                  </div>
                )}
              </div>

              {/* Clean Fee Waivers (Unchecking removes override rather than hardcoding stale defaults) */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Fee Waivers When This Rule Matches:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(workingCopy.modifier.overruleExtras?.waiveCarSeatFee)}
                      onChange={(e) => toggleExtraWaiver('waiveCarSeatFee', e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                    />
                    <span>Waive Child Safety Seat Fees</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(workingCopy.modifier.overruleExtras?.waiveExtraPaxFee)}
                      onChange={(e) => toggleExtraWaiver('waiveExtraPaxFee', e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                    />
                    <span>Waive Extra Passenger Fees</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(workingCopy.modifier.overruleSurcharges?.waiveAirportFee)}
                      onChange={(e) => toggleSurchargeWaiver('waiveAirportFee', e.target.checked)}
                      className="rounded border-slate-300 text-purple-600 focus:ring-0"
                    />
                    <span>Waive Airport Commercial Gate Fee</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(workingCopy.modifier.overruleSurcharges?.waiveRemoteFee)}
                      onChange={(e) => toggleSurchargeWaiver('waiveRemoteFee', e.target.checked)}
                      className="rounded border-slate-300 text-purple-600 focus:ring-0"
                    />
                    <span>Waive Remote Service Radius Fee</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(workingCopy.modifier.overruleSurcharges?.waiveFuelSurcharge)}
                      onChange={(e) => toggleSurchargeWaiver('waiveFuelSurcharge', e.target.checked)}
                      className="rounded border-slate-300 text-purple-600 focus:ring-0"
                    />
                    <span>Waive Built-In Fuel / Gas Surcharge</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-12">
            Select a pricing rule from the left panel or click &ldquo;+ New Rule&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
