import React, { useState } from 'react';
import type { NamedPricingRule, VehicleType, VehicleClass } from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
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
} from '~/components/ui/Icons';

export interface PricingRulesPanelProps {
  rules: NamedPricingRule[];
  tariffs: TariffProfile[];
  onSaveRule: (rule: NamedPricingRule) => Promise<void>;
  onDeleteRule?: (id: string) => Promise<void>;
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

export function PricingRulesPanel({
  rules,
  tariffs,
  onSaveRule,
  onDeleteRule,
  isSaving = false,
}: PricingRulesPanelProps) {
  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    rules[0]?.id || 'rule-airport-transfer-flat'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const selectedRule = rules.find((r) => r.id === selectedRuleId) || rules[0];
  const [workingCopy, setWorkingCopy] = useState<NamedPricingRule | null>(
    selectedRule ? JSON.parse(JSON.stringify(selectedRule)) : null
  );

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

  const handleAddNewRule = () => {
    const newId = `rule-${Date.now()}`;
    const newRule: NamedPricingRule = {
      id: newId,
      name: 'New Pricing Rule',
      description: 'Routing and modifier rule',
      isActive: true,
      priority: 80,
      allowDriverSelection: false,
      stopProcessingOnMatch: false,
      triggers: {
        isBidirectionalTransfer: true,
        vehicleTypes: ['sedan', 'suv', 'minivan', 'van', 'wheelchair_wav'],
        vehicleClasses: ['standard', 'executive', 'xl', 'medical', 'delivery'],
      },
      modifier: {
        type: 'apply_tariff',
        value: 0,
        targetTariffId: tariffs[0]?.id || 'tariff-airport-flat',
      },
    };

    setWorkingCopy(newRule);
    setSelectedRuleId(newId);
  };

  const toggleTriggerVehicleType = (vt: VehicleType) => {
    if (!workingCopy) return;
    const current = workingCopy.triggers.vehicleTypes || [];
    const next = current.includes(vt)
      ? current.filter((x: string) => x !== vt)
      : [...current, vt];
    setWorkingCopy({
      ...workingCopy,
      triggers: { ...workingCopy.triggers, vehicleTypes: next },
    });
  };

  const toggleTriggerVehicleClass = (vc: VehicleClass) => {
    if (!workingCopy) return;
    const current = workingCopy.triggers.vehicleClasses || [];
    const next = current.includes(vc)
      ? current.filter((x: string) => x !== vc)
      : [...current, vc];
    setWorkingCopy({
      ...workingCopy,
      triggers: { ...workingCopy.triggers, vehicleClasses: next },
    });
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[640px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
      {/* Left Sub-Panel: Rule List (~280px) */}
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
              className="h-7 text-xs bg-purple-600 hover:bg-purple-500 text-white px-2.5 shadow-2xs"
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
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {rule.name}
                  </span>
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
                    <span className="truncate">{targetTariff?.name || 'Tariff Routing'}</span>
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
        </div>
      </div>

      {/* Center Sub-Panel: Granular Rule Editor */}
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
                    Connective pricing engine: routes trips to target tariffs, overrules extras, and manages rate layering.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectRule(workingCopy.id)}
                    className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-2xs"
                  >
                    <CheckIcon className="w-3.5 h-3.5 mr-1" />
                    Save Pricing Rule
                  </Button>
                </div>
              </div>

              {/* General Fields Grid */}
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
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Evaluation Priority (1 - 100)</label>
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

              {/* Switches: Active, Stop Processing on Match */}
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

            {/* Trigger Matrix Section */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MapPinIcon className="w-3.5 h-3.5 text-blue-600" />
                1. Trip Conditions & Triggers
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
                  <span>Bidirectional Transfer Trigger (Matches either Pickup OR Dropoff in target zones)</span>
                </label>
                <p className="text-[11px] text-blue-700 pl-5">
                  Allows 1 unified rule to handle inbound & outbound airport transfers simultaneously, replacing 12 separate TaxiCaller rules.
                </p>
              </div>

              {/* Target Zones & Accounts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Corporate Account Trigger</label>
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
                    <option value="corp-smoke-house">Smoke House Chesterfield (corp-smoke-house)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Target Zone / Airport Group</label>
                  <Input
                    type="text"
                    placeholder="e.g. zone-lambert-airport, zone-spirit-airport"
                    value={(workingCopy.triggers.zoneIds || []).join(', ')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          zoneIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className="bg-white border-slate-300 text-slate-900 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Vehicle Eligibility Checkboxes */}
              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1">Vehicle Physical Types:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {VEHICLE_TYPES.map((vt) => {
                      const isChecked = workingCopy.triggers.vehicleTypes?.includes(vt.id);
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

                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1">Vehicle Service Classes:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {VEHICLE_CLASSES.map((vc) => {
                      const isChecked = workingCopy.triggers.vehicleClasses?.includes(vc.id);
                      return (
                        <button
                          key={vc.id}
                          type="button"
                          onClick={() => toggleTriggerVehicleClass(vc.id)}
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

            {/* Actions & Modifiers Section */}
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <SlidersIcon className="w-3.5 h-3.5 text-emerald-600" />
                2. Actions, Target Tariff & Overrules
              </h3>

              {/* Target Tariff Dropdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">Target Tariff Profile</label>
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
                    <option value="">None (Keep Default Meter)</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.rateModel?.toUpperCase() || 'TAXIMETER'})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Routes matched trips directly into this tariff profile
                  </span>
                </div>

                {/* Layered Zone Flat Fee */}
                <div>
                  <label className="text-[11px] font-medium text-slate-700 block mb-1">
                    Layered Zone Fee ($) (Optional Add-on)
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
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    e.g. +$10.00 remote radius fee added on top of mileage
                  </span>
                </div>
              </div>

              {/* Overrule Universal Extras Grid */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Overrule Universal Extras (Overrides):
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={workingCopy.modifier.overruleExtras?.waiveCarSeatFee || false}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            overruleExtras: {
                              ...workingCopy.modifier.overruleExtras,
                              carSeatFeePerUnit: e.target.checked ? 0 : 10,
                              waiveCarSeatFee: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                    />
                    <span>Waive Child Safety Seat Fees (Free Seats)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={workingCopy.modifier.overruleExtras?.waiveExtraPaxFee || false}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            overruleExtras: {
                              ...workingCopy.modifier.overruleExtras,
                              extraPassengerFeePerHead: e.target.checked ? 0 : 1,
                              waiveExtraPaxFee: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                    />
                    <span>Waive Extra Passenger Headcount Fees</span>
                  </label>
                </div>
              </div>

              {/* Overrule Surcharges Grid */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Overrule Surcharges (Overrides):
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={workingCopy.modifier.overruleSurcharges?.waiveAirportFee || false}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            overruleSurcharges: {
                              ...workingCopy.modifier.overruleSurcharges,
                              airportGateFee: e.target.checked ? 0 : 4,
                              waiveAirportFee: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-slate-300 text-purple-600 focus:ring-0"
                    />
                    <span>Waive Airport Commercial Gate Fee</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs font-medium">
                    <input
                      type="checkbox"
                      checked={workingCopy.modifier.overruleSurcharges?.waiveRemoteFee || false}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            overruleSurcharges: {
                              ...workingCopy.modifier.overruleSurcharges,
                              outOfAreaRemoteFee: e.target.checked ? 0 : 15,
                              waiveRemoteFee: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-slate-300 text-purple-600 focus:ring-0"
                    />
                    <span>Waive Remote Service Radius Fee</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-12">
            Select a pricing rule from the left panel
          </div>
        )}
      </div>
    </div>
  );
}
