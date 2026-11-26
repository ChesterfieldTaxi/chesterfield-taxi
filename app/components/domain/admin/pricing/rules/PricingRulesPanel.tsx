import React, { useState, useEffect, useMemo } from 'react';
import type {
  NamedPricingRule,
  VehicleType,
  VehicleTierConfig,
  CorporateAccountConfig,
  SurchargesConfig,
  SurchargeCalcMode,
  RuleSurchargeAction,
  RuleExtraAction,
  RuleExtraTarget,
  RuleFareAdjustment,
  RuleZoneMatchMode,
} from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
import type { ZoneGeofence } from '~/core/types/zone';
import { getAdminConfigService } from '~/core/services/config/admin-config.service';
import { getZoneService, DEFAULT_ZONES } from '~/core/services/zones/zone.service';
import { getSurchargeCatalogItems } from '~/core/services/pricing/surcharges.service';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Badge } from '~/components/ui/Badge';
import {
  ShieldCheckIcon,
  PlusIcon,
  CheckIcon,
  SearchIcon,
  MapPinIcon,
  SlidersIcon,
  TrashIcon,
  ZapIcon,
  ClockIcon,
  SparklesIcon,
} from '~/components/ui/Icons';

export interface PricingRulesPanelProps {
  rules: NamedPricingRule[];
  tariffs: TariffProfile[];
  surcharges: SurchargesConfig;
  vehicles?: VehicleTierConfig[];
  corporateAccounts?: CorporateAccountConfig[];
  initialSelectedRuleId?: string | null;
  onSaveRule: (rule: NamedPricingRule) => Promise<void>;
  onDeleteRule?: (id: string) => Promise<void>;
  onDraftChange?: (draft: NamedPricingRule | null) => void;
  isSaving?: boolean;
}

const FALLBACK_VEHICLE_TYPES: { id: VehicleType; label: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
  { id: 'minivan', label: 'Minivan' },
  { id: 'van', label: 'Van / Shuttle' },
  { id: 'wheelchair_wav', label: 'WAV Wheelchair' },
];

const DAYS_OF_WEEK = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

const EXTRA_TARGETS: { id: RuleExtraTarget; label: string }[] = [
  { id: 'car_seat', label: 'Child Safety Seats' },
  { id: 'extra_passenger', label: 'Extra Passengers' },
  { id: 'intermediate_stop', label: 'Additional Stops' },
  { id: 'curb_wait', label: 'Pickup Curb Wait ($/min)' },
];

/** Normalizes any legacy rule fields (overruleSurcharges/overruleExtras) into clean v2 arrays for editing */
function normalizeRuleForEditor(rule: NamedPricingRule): NamedPricingRule {
  const copy: NamedPricingRule = JSON.parse(JSON.stringify(rule));
  const sActions: RuleSurchargeAction[] = Array.isArray(copy.modifier.surchargeActions)
    ? [...copy.modifier.surchargeActions]
    : [];

  const os = copy.modifier.overruleSurcharges;
  if (os && sActions.length === 0) {
    if (os.waiveFuelSurcharge) sActions.push({ surchargeId: 'surcharge-fuel', action: 'waive' });
    if (os.waiveAirportFee) sActions.push({ surchargeId: 'surcharge-airport-access', action: 'waive' });
    if (os.waiveRemoteFee) sActions.push({ surchargeId: 'surcharge-remote-area', action: 'waive' });
  }

  const eActions: RuleExtraAction[] = Array.isArray(copy.modifier.extraActions)
    ? [...copy.modifier.extraActions]
    : [];
  const oe = copy.modifier.overruleExtras;
  if (oe && eActions.length === 0) {
    if (oe.waiveCarSeatFee) eActions.push({ extraKey: 'car_seat', action: 'waive' });
    if (oe.waiveExtraPaxFee) eActions.push({ extraKey: 'extra_passenger', action: 'waive' });
  }

  let fareAdj = copy.modifier.fareAdjustment;
  if (!fareAdj && copy.modifier.type !== 'apply_tariff' && copy.modifier.value) {
    if (copy.modifier.type === 'flat_override') {
      fareAdj = { type: 'flat_override', value: copy.modifier.value };
    } else if (copy.modifier.type === 'multiplier' && copy.modifier.value !== 1) {
      fareAdj = { type: 'multiplier', value: copy.modifier.value };
    }
  }

  copy.modifier = {
    ...copy.modifier,
    surchargeActions: sActions,
    extraActions: eActions,
    fareAdjustment: fareAdj,
  };
  return copy;
}

export function PricingRulesPanel({
  rules,
  tariffs,
  surcharges,
  vehicles,
  corporateAccounts,
  initialSelectedRuleId,
  onSaveRule,
  onDeleteRule,
  onDraftChange,
  isSaving = false,
}: PricingRulesPanelProps) {
  const catalogSurcharges = useMemo(() => getSurchargeCatalogItems(surcharges), [surcharges]);

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
    return (source || []).filter((c) => c.isActive !== false && !c.isArchived);
  }, [corporateAccounts]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => b.priority - a.priority),
    [rules]
  );

  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    initialSelectedRuleId || sortedRules[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  // Honor deep-link navigation from Rates / Surcharges tabs
  useEffect(() => {
    if (initialSelectedRuleId && rules.some((r) => r.id === initialSelectedRuleId)) {
      setSelectedRuleId(initialSelectedRuleId);
      const target = rules.find((r) => r.id === initialSelectedRuleId);
      if (target) setWorkingCopy(normalizeRuleForEditor(target));
    }
  }, [initialSelectedRuleId, rules]);

  const selectedRule = sortedRules.find((r) => r.id === selectedRuleId) || sortedRules[0] || null;
  const baselineNormalized = useMemo(
    () => (selectedRule ? normalizeRuleForEditor(selectedRule) : null),
    [selectedRule]
  );
  const [workingCopy, setWorkingCopy] = useState<NamedPricingRule | null>(
    baselineNormalized ? JSON.parse(JSON.stringify(baselineNormalized)) : null
  );

  useEffect(() => {
    if (baselineNormalized && (!workingCopy || workingCopy.id !== baselineNormalized.id)) {
      setSelectedRuleId(baselineNormalized.id);
      setWorkingCopy(JSON.parse(JSON.stringify(baselineNormalized)));
      setConfirmDeleteId(null);
    } else if (!baselineNormalized && sortedRules.length === 0) {
      setWorkingCopy(null);
    }
  }, [baselineNormalized, workingCopy?.id, sortedRules.length]);

  const isDirty = useMemo(() => {
    if (!workingCopy || !baselineNormalized) return false;
    return JSON.stringify(workingCopy) !== JSON.stringify(baselineNormalized);
  }, [workingCopy, baselineNormalized]);

  useEffect(() => {
    onDraftChange?.(isDirty ? workingCopy : null);
  }, [workingCopy, isDirty, onDraftChange]);

  const handleSelectRule = (id: string) => {
    if (id === selectedRuleId) return;
    if (isDirty) {
      const ok = window.confirm(
        `You have unsaved changes on "${workingCopy?.name}". Discard them and switch rules?`
      );
      if (!ok) return;
    }
    setSelectedRuleId(id);
    setConfirmDeleteId(null);
    const target = sortedRules.find((r) => r.id === id);
    if (target) {
      setWorkingCopy(normalizeRuleForEditor(target));
    }
  };

  const filteredRules = sortedRules.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!workingCopy) return;
    // Strip stale legacy fields so v2 firewall directives are the sole source of truth
    const cleaned: NamedPricingRule = {
      ...workingCopy,
      modifier: {
        type: 'apply_tariff',
        value: 0,
        targetTariffId: workingCopy.modifier.targetTariffId || undefined,
        surchargeActions: (workingCopy.modifier.surchargeActions || []).filter((a) => a.surchargeId),
        extraActions: (workingCopy.modifier.extraActions || []).filter((a) => a.extraKey),
        fareAdjustment: workingCopy.modifier.fareAdjustment,
        overruleSurcharges: undefined,
        overruleExtras: undefined,
        layerZoneFee: undefined,
      },
    };
    await onSaveRule(cleaned);
    setWorkingCopy(normalizeRuleForEditor(cleaned));
    setSaveSuccessMsg(`Saved "${cleaned.name}"`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleDeleteCurrentRule = async () => {
    if (!workingCopy || !onDeleteRule) return;
    const deletedId = workingCopy.id;
    const deletedName = workingCopy.name;
    const nextRule = sortedRules.find((r) => r.id !== deletedId);
    await onDeleteRule(deletedId);
    setConfirmDeleteId(null);
    if (nextRule) {
      setSelectedRuleId(nextRule.id);
      setWorkingCopy(normalizeRuleForEditor(nextRule));
    } else {
      setSelectedRuleId('');
      setWorkingCopy(null);
    }
    setSaveSuccessMsg(`Deleted "${deletedName}"`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleAddNewRule = async () => {
    const newId = `rule-${Date.now()}`;
    const newRule: NamedPricingRule = {
      id: newId,
      name: `New Pricing Rule #${rules.length + 1}`,
      description: 'Set Rate, Surcharges, and Extras when trip conditions match',
      isActive: true,
      priority: 60,
      allowDriverSelection: false,
      stopProcessingOnMatch: false,
      triggers: {
        vehicleTypes: [],
      },
      modifier: {
        type: 'apply_tariff',
        value: 0,
        targetTariffId: undefined, // Never accidentally force Airport Flat Rate!
        surchargeActions: [],
        extraActions: [],
      },
    };

    await onSaveRule(newRule);
    setSelectedRuleId(newId);
    setWorkingCopy(normalizeRuleForEditor(newRule));
  };

  // Helpers for triggers & actions
  const getWorkingVehicleTypes = (r: NamedPricingRule): string[] =>
    Array.from(new Set([...(r.triggers.vehicleTypes || []), ...(r.triggers.vehicleTiers || [])]));

  const toggleVehicle = (vtId: string) => {
    if (!workingCopy) return;
    const cur = getWorkingVehicleTypes(workingCopy);
    const next = cur.some((x) => x.toLowerCase() === vtId.toLowerCase())
      ? cur.filter((x) => x.toLowerCase() !== vtId.toLowerCase())
      : [...cur, vtId];
    setWorkingCopy({
      ...workingCopy,
      triggers: { ...workingCopy.triggers, vehicleTypes: next, vehicleTiers: undefined },
    });
  };

  const toggleDay = (dayId: number) => {
    if (!workingCopy) return;
    const cur = workingCopy.triggers.daysOfWeek || [];
    const next = cur.includes(dayId) ? cur.filter((d) => d !== dayId) : [...cur, dayId].sort();
    setWorkingCopy({
      ...workingCopy,
      triggers: { ...workingCopy.triggers, daysOfWeek: next.length > 0 ? next : undefined },
    });
  };

  const toggleZoneInArray = (field: 'zoneIds' | 'pickupZoneIds' | 'dropoffZoneIds', zId: string) => {
    if (!workingCopy) return;
    const cur = workingCopy.triggers[field] || [];
    const next = cur.includes(zId) ? cur.filter((x) => x !== zId) : [...cur, zId];
    setWorkingCopy({
      ...workingCopy,
      triggers: { ...workingCopy.triggers, [field]: next.length > 0 ? next : undefined },
    });
  };

  const currentZoneMode: 'none' | RuleZoneMatchMode = (() => {
    if (!workingCopy) return 'none';
    const tr = workingCopy.triggers;
    if (tr.zoneMatchMode) return tr.zoneMatchMode;
    if (tr.pickupZoneIds?.length || tr.dropoffZoneIds?.length || tr.fromZoneId || tr.toZoneId) {
      return 'corridor';
    }
    if (tr.zoneIds?.length || tr.isBidirectionalTransfer) return 'any_end';
    return 'none';
  })();

  const handleZoneModeChange = (mode: 'none' | RuleZoneMatchMode) => {
    if (!workingCopy) return;
    if (mode === 'none') {
      setWorkingCopy({
        ...workingCopy,
        triggers: {
          ...workingCopy.triggers,
          zoneMatchMode: undefined,
          isBidirectionalTransfer: false,
          zoneIds: undefined,
          pickupZoneIds: undefined,
          dropoffZoneIds: undefined,
          fromZoneId: undefined,
          toZoneId: undefined,
        },
      });
    } else {
      setWorkingCopy({
        ...workingCopy,
        triggers: {
          ...workingCopy.triggers,
          zoneMatchMode: mode,
          isBidirectionalTransfer: mode === 'any_end',
        },
      });
    }
  };

  const activeTimeWindow = workingCopy?.triggers.timeWindows?.[0];

  const handleToggleTimeWindow = (enabled: boolean) => {
    if (!workingCopy) return;
    setWorkingCopy({
      ...workingCopy,
      triggers: {
        ...workingCopy.triggers,
        timeWindows: enabled ? [{ start: '22:00', end: '05:00' }] : undefined,
      },
    });
  };

  // Surcharge Actions CRUD
  const surchargeActions = workingCopy?.modifier.surchargeActions || [];

  const handleAddSurchargeAction = () => {
    if (!workingCopy || catalogSurcharges.length === 0) return;
    const unused = catalogSurcharges.find(
      (s) => !surchargeActions.some((a) => a.surchargeId === s.id)
    );
    const chosen = unused || catalogSurcharges[0];
    const defaultAct: RuleSurchargeAction['action'] =
      chosen.defaultPolicy === 'universal' ? 'waive' : 'apply';
    setWorkingCopy({
      ...workingCopy,
      modifier: {
        ...workingCopy.modifier,
        surchargeActions: [
          ...surchargeActions,
          { surchargeId: chosen.id, action: defaultAct },
        ],
      },
    });
  };

  const handleUpdateSurchargeAction = (index: number, patch: Partial<RuleSurchargeAction>) => {
    if (!workingCopy) return;
    const next = [...surchargeActions];
    next[index] = { ...next[index], ...patch };
    setWorkingCopy({
      ...workingCopy,
      modifier: { ...workingCopy.modifier, surchargeActions: next },
    });
  };

  const handleRemoveSurchargeAction = (index: number) => {
    if (!workingCopy) return;
    setWorkingCopy({
      ...workingCopy,
      modifier: {
        ...workingCopy.modifier,
        surchargeActions: surchargeActions.filter((_, i) => i !== index),
      },
    });
  };

  // Extra Actions CRUD
  const extraActions = workingCopy?.modifier.extraActions || [];

  const handleAddExtraAction = () => {
    if (!workingCopy) return;
    const unused = EXTRA_TARGETS.find((e) => !extraActions.some((a) => a.extraKey === e.id));
    const chosen = unused || EXTRA_TARGETS[0];
    setWorkingCopy({
      ...workingCopy,
      modifier: {
        ...workingCopy.modifier,
        extraActions: [...extraActions, { extraKey: chosen.id, action: 'waive' }],
      },
    });
  };

  const handleUpdateExtraAction = (index: number, patch: Partial<RuleExtraAction>) => {
    if (!workingCopy) return;
    const next = [...extraActions];
    next[index] = { ...next[index], ...patch };
    setWorkingCopy({
      ...workingCopy,
      modifier: { ...workingCopy.modifier, extraActions: next },
    });
  };

  const handleRemoveExtraAction = (index: number) => {
    if (!workingCopy) return;
    setWorkingCopy({
      ...workingCopy,
      modifier: {
        ...workingCopy.modifier,
        extraActions: extraActions.filter((_, i) => i !== index),
      },
    });
  };

  const fareAdj = workingCopy?.modifier.fareAdjustment;

  const handleFareAdjTypeChange = (val: string) => {
    if (!workingCopy) return;
    if (val === 'none') {
      setWorkingCopy({
        ...workingCopy,
        modifier: { ...workingCopy.modifier, fareAdjustment: undefined },
      });
      return;
    }
    const type = val as RuleFareAdjustment['type'];
    const defaultVal =
      type === 'multiplier' ? 1.15 : type === 'discount_percent' ? 10 : type === 'flat_override' ? 50 : 5;
    setWorkingCopy({
      ...workingCopy,
      modifier: { ...workingCopy.modifier, fareAdjustment: { type, value: defaultVal } },
    });
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[640px] border border-border-subtle rounded-xl overflow-hidden bg-surface-card shadow-xs">
      {/* Left Sidebar: Priority-Ordered Firewall Rules List */}
      <div className="w-full lg:w-76 border-b lg:border-b-0 lg:border-r border-border-subtle flex flex-col bg-surface-subtle/80 shrink-0">
        <div className="p-3.5 border-b border-border-subtle space-y-2.5 bg-surface-card">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-fg-strong uppercase tracking-wider flex items-center gap-1.5">
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
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2 text-fg-subtle" />
            <Input
              type="text"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7.5 text-xs pl-7.5 bg-surface-card border-border-subtle text-fg-strong w-full"
            />
          </div>
          <p className="text-[10px] text-fg-subtle">
            Checked top-to-bottom. Highest priority wins on conflicts.
          </p>
        </div>

        <div className="flex-1 max-h-60 lg:max-h-none overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
          {filteredRules.map((rule) => {
            const isSelected = rule.id === selectedRuleId;
            const targetRate = tariffs.find((t) => t.id === rule.modifier.targetTariffId);
            const normalized = normalizeRuleForEditor(rule);
            const sCount = normalized.modifier.surchargeActions?.length || 0;
            const eCount = normalized.modifier.extraActions?.length || 0;

            return (
              <button
                key={rule.id}
                type="button"
                onClick={() => handleSelectRule(rule.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-status-staged-bg/90 border-purple-400 shadow-2xs'
                    : 'bg-surface-card border-border-subtle hover:border-border-strong'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span
                    className={`text-xs font-bold leading-tight ${
                      isSelected ? 'text-purple-950' : 'text-fg-primary'
                    }`}
                  >
                    {rule.name}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-muted text-fg-secondary border border-border-subtle shrink-0">
                    P{rule.priority}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                  {targetRate && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-info-bg text-status-info-fg border border-status-info-border">
                      Rate: {targetRate.name}
                    </span>
                  )}
                  {sCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-success-bg text-status-success-fg border border-status-success-border">
                      {sCount} Surcharge{sCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {eCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-warning-bg text-status-warning-fg border border-status-warning-border">
                      {eCount} Extra{eCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {rule.stopProcessingOnMatch && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-status-danger-bg text-status-danger-fg border border-status-danger-border">
                      STOP
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border-faint">
                  <span className="text-[10px] text-fg-subtle">
                    {rule.isActive ? 'Active' : 'Disabled'}
                  </span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      rule.isActive ? 'bg-emerald-500' : 'bg-surface-strong'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Editor Pane */}
      <div className="flex-1 flex flex-col bg-surface-card overflow-y-auto custom-scrollbar min-w-0">
        {workingCopy ? (
          <div className="p-5 space-y-5">
            {/* Header & Save Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-subtle">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-fg-primary">{workingCopy.name}</h2>
                  <Badge variant="outline" className="text-[10px] font-mono bg-status-staged-bg text-status-staged-fg border-status-staged-border">
                    Priority {workingCopy.priority}
                  </Badge>
                  {isDirty && (
                    <Badge variant="warning" size="sm" className="text-[10px] bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border">
                      Unsaved Draft
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  Choose which <strong>Rate</strong>, <strong>Surcharges</strong> (apply/waive/override), and <strong>Extras</strong> apply when trip conditions match.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {saveSuccessMsg && (
                  <span className="text-xs font-semibold text-status-success-fg bg-status-success-bg px-2.5 py-1 rounded-lg border border-status-success-border flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    {saveSuccessMsg}
                  </span>
                )}

                {onDeleteRule && confirmDeleteId !== workingCopy.id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDeleteId(workingCopy.id)}
                    className="h-8 text-xs border-status-danger-border text-status-danger-fg hover:bg-status-danger-bg bg-surface-card cursor-pointer"
                  >
                    <TrashIcon className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                )}

                {confirmDeleteId === workingCopy.id && (
                  <div className="flex items-center gap-1.5 bg-status-danger-bg border border-status-danger-border rounded-lg px-2 py-1">
                    <span className="text-[11px] font-semibold text-status-danger-fg">Delete rule?</span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleDeleteCurrentRule}
                      className="h-6 px-2 text-[11px] bg-rose-600 text-white"
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      className="h-6 px-2 text-[11px] bg-surface-card"
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
                  onClick={() =>
                    baselineNormalized &&
                    setWorkingCopy(JSON.parse(JSON.stringify(baselineNormalized)))
                  }
                  className="h-8 text-xs border-border-strong bg-surface-card text-fg-secondary cursor-pointer"
                >
                  Discard
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white shadow-2xs cursor-pointer"
                >
                  <CheckIcon className="w-3.5 h-3.5 mr-1" />
                  {isSaving ? 'Saving...' : 'Save Rule'}
                </Button>
              </div>
            </div>

            {/* Rule Identity & Priority */}
            <div className="p-4 rounded-xl bg-surface-subtle/80 border border-border-subtle space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">Rule Name</label>
                  <Input
                    type="text"
                    value={workingCopy.name}
                    onChange={(e) => setWorkingCopy({ ...workingCopy, name: e.target.value })}
                    className="h-8 text-xs bg-surface-card font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                    Priority (1–100)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={workingCopy.priority}
                    onChange={(e) =>
                      setWorkingCopy({ ...workingCopy, priority: parseInt(e.target.value, 10) || 50 })
                    }
                    className="h-8 text-xs bg-surface-card font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">Description</label>
                  <Input
                    type="text"
                    value={workingCopy.description || ''}
                    onChange={(e) => setWorkingCopy({ ...workingCopy, description: e.target.value })}
                    className="h-8 text-xs bg-surface-card"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-2.5 border-t border-border-subtle/80 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-fg-secondary font-medium">
                  <input
                    type="checkbox"
                    checked={workingCopy.isActive}
                    onChange={(e) => setWorkingCopy({ ...workingCopy, isActive: e.target.checked })}
                    className="rounded border-border-strong text-emerald-600"
                  />
                  <span>Rule Active</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-fg-secondary font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(workingCopy.stopProcessingOnMatch)}
                    onChange={(e) =>
                      setWorkingCopy({ ...workingCopy, stopProcessingOnMatch: e.target.checked })
                    }
                    className="rounded border-border-strong text-rose-600"
                  />
                  <span>Stop checking lower-priority rules when matched</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-fg-secondary font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(workingCopy.allowDriverSelection)}
                    onChange={(e) =>
                      setWorkingCopy({ ...workingCopy, allowDriverSelection: e.target.checked })
                    }
                    className="rounded border-border-strong text-blue-600"
                  />
                  <span>Allow manual selection in Dispatch / Driver</span>
                </label>
              </div>
            </div>

            {/* 1. IF — CONDITIONS */}
            <div className="p-3.5 sm:p-4.5 rounded-xl bg-surface-card border border-border-subtle shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border-faint pb-2.5">
                <h3 className="text-xs font-bold text-fg-primary uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-status-staged-bg-strong text-purple-700 inline-flex items-center justify-center text-[11px] shrink-0">
                    IF
                  </span>
                  <span>Conditions (All configured conditions must match)</span>
                </h3>
                <span className="text-[11px] text-fg-muted">Leave a condition empty to match any</span>
              </div>

              {/* A. Location & Airport Conditions */}
              <div className="p-3.5 rounded-lg bg-surface-subtle border border-border-subtle/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg-strong flex items-center gap-1.5">
                    <MapPinIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Location / Service Zones</span>
                  </span>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-status-info-fg cursor-pointer bg-status-info-bg border border-status-info-border px-2.5 py-1 rounded-lg">
                      <input
                        type="checkbox"
                        checked={Boolean(workingCopy.triggers.isAirportOnly)}
                        onChange={(e) =>
                          setWorkingCopy({
                            ...workingCopy,
                            triggers: {
                              ...workingCopy.triggers,
                              isAirportOnly: e.target.checked || undefined,
                            },
                          })
                        }
                        className="rounded border-status-info-border text-blue-600 shrink-0"
                      />
                      <span>Airport Transfer Only (STL / SUS)</span>
                    </label>

                    <Select
                      size="sm"
                      fullWidth={false}
                      value={currentZoneMode}
                      onChange={(e) => handleZoneModeChange(e.target.value as any)}
                      className="w-full sm:w-auto"
                    >
                      <option value="none">Any Location (No Zone Filter)</option>
                      <option value="any_end">Either Pickup or Dropoff in Zone(s)</option>
                      <option value="pickup_only">Pickup Only in Zone(s)</option>
                      <option value="dropoff_only">Dropoff Only in Zone(s)</option>
                      <option value="corridor">Corridor (Specific Pickup → Dropoff Zones)</option>
                    </Select>
                  </div>
                </div>

                {currentZoneMode !== 'none' && currentZoneMode !== 'corridor' && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {availableZones.map((z) => {
                      const active = (workingCopy.triggers.zoneIds || []).includes(z.id);
                      return (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => toggleZoneInArray('zoneIds', z.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-surface-card border-border-strong text-fg-secondary hover:border-border-emphasis'
                          }`}
                        >
                          {z.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentZoneMode === 'corridor' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="p-2.5 rounded-lg bg-surface-card border border-border-subtle space-y-1.5">
                      <span className="text-[11px] font-semibold text-status-success-fg block">
                        Pickup (Origin) Zone(s):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {availableZones.map((z) => {
                          const active = (workingCopy.triggers.pickupZoneIds || []).includes(z.id);
                          return (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => toggleZoneInArray('pickupZoneIds', z.id)}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${
                                active
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-surface-subtle border-border-subtle text-fg-secondary'
                              }`}
                            >
                              {z.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-card border border-border-subtle space-y-1.5">
                      <span className="text-[11px] font-semibold text-status-danger-fg block">
                        Dropoff (Destination) Zone(s):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {availableZones.map((z) => {
                          const active = (workingCopy.triggers.dropoffZoneIds || []).includes(z.id);
                          return (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => toggleZoneInArray('dropoffZoneIds', z.id)}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${
                                active
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-surface-subtle border-border-subtle text-fg-secondary'
                              }`}
                            >
                              {z.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* B. Vehicles */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-fg-secondary block">
                  Fleet Vehicle Types (Leave on &ldquo;All Vehicles&rdquo; to apply regardless of vehicle)
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
                          vehicleClasses: undefined,
                        },
                      })
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${
                      getWorkingVehicleTypes(workingCopy).length === 0
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-surface-card border-border-strong text-fg-secondary hover:border-border-emphasis'
                    }`}
                  >
                    All Vehicles
                  </button>
                  {activeVehicles.map((vt) => {
                    const active = getWorkingVehicleTypes(workingCopy).some(
                      (x) => x.toLowerCase() === vt.id.toLowerCase()
                    );
                    return (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => toggleVehicle(vt.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-surface-card border-border-strong text-fg-secondary hover:border-border-emphasis'
                        }`}
                      >
                        {vt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* C. Schedule (Days of Week + Overnight-Safe Time Window) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border-faint">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-fg-secondary flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5 text-fg-muted" />
                    Days of Week (Optional — empty = every day)
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {DAYS_OF_WEEK.map((d) => {
                      const active = (workingCopy.triggers.daysOfWeek || []).includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDay(d.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold border cursor-pointer ${
                            active
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-surface-card border-border-strong text-fg-secondary hover:border-border-emphasis'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-fg-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(activeTimeWindow)}
                      onChange={(e) => handleToggleTimeWindow(e.target.checked)}
                      className="rounded border-border-strong text-purple-600"
                    />
                    <span>Restrict to Time Window (24h, supports overnight e.g. 22:00 → 05:00)</span>
                  </label>
                  {activeTimeWindow && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Input
                        type="time"
                        value={activeTimeWindow.start}
                        onChange={(e) =>
                          setWorkingCopy({
                            ...workingCopy,
                            triggers: {
                              ...workingCopy.triggers,
                              timeWindows: [{ start: e.target.value, end: activeTimeWindow.end }],
                            },
                          })
                        }
                        className="h-8 text-xs bg-surface-card font-mono"
                      />
                      <span className="text-xs text-fg-subtle font-semibold text-center shrink-0">to</span>
                      <Input
                        type="time"
                        value={activeTimeWindow.end}
                        onChange={(e) =>
                          setWorkingCopy({
                            ...workingCopy,
                            triggers: {
                              ...workingCopy.triggers,
                              timeWindows: [{ start: activeTimeWindow.start, end: e.target.value }],
                            },
                          })
                        }
                        className="h-8 text-xs bg-surface-card font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* D. Distance, Corporate Account & Hourly */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-border-faint">
                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                    Min Distance (mi)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Any"
                    value={workingCopy.triggers.minDistanceMiles ?? ''}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          minDistanceMiles:
                            e.target.value === '' ? undefined : parseFloat(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs bg-surface-card font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                    Max Distance (mi)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Any"
                    value={workingCopy.triggers.maxDistanceMiles ?? ''}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          maxDistanceMiles:
                            e.target.value === '' ? undefined : parseFloat(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs bg-surface-card font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                    Corporate Account
                  </label>
                  <Select
                    size="sm"
                    value={workingCopy.triggers.accountTags?.[0] || ''}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        triggers: {
                          ...workingCopy.triggers,
                          accountTags: e.target.value ? [e.target.value] : undefined,
                        },
                      })
                    }
                  >
                    <option value="">All Customers (Retail &amp; Corporate)</option>
                    {activeCorporateAccounts.map((corp) => (
                      <option key={corp.id} value={corp.id}>
                        {corp.companyName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-fg-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={workingCopy.triggers.isHourlyBooking === true}
                      onChange={(e) =>
                        setWorkingCopy({
                          ...workingCopy,
                          triggers: {
                            ...workingCopy.triggers,
                            isHourlyBooking: e.target.checked ? true : undefined,
                          },
                        })
                      }
                      className="rounded border-border-strong text-blue-600"
                    />
                    <span>Hourly Charters Only</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 2. THEN — PRICING ACTIONS */}
            <div className="p-3.5 sm:p-4.5 rounded-xl bg-surface-card border border-border-subtle shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border-faint pb-2.5">
                <h3 className="text-xs font-bold text-fg-primary uppercase tracking-wider flex items-center gap-2">
                  <span className="px-1.5 h-5 rounded-full bg-status-success-bg-strong text-status-success-fg inline-flex items-center justify-center text-[10px] shrink-0">
                    THEN
                  </span>
                  <span>Set Rate, Surcharges, Extras &amp; Adjustments</span>
                </h3>
                <span className="text-[11px] text-fg-muted">Combine any actions in one rule</span>
              </div>

              {/* A. Select Service Rate + Optional Base Adjustment */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                    Use Service Rate
                  </label>
                  <Select
                    size="sm"
                    value={workingCopy.modifier.targetTariffId || ''}
                    onChange={(e) =>
                      setWorkingCopy({
                        ...workingCopy,
                        modifier: {
                          ...workingCopy.modifier,
                          targetTariffId: e.target.value || undefined,
                        },
                      })
                    }
                  >
                    <option value="">Keep Default / Lower-Priority Rate</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                    Base Fare Adjustment (Optional)
                  </label>
                  <Select
                    size="sm"
                    value={fareAdj?.type || 'none'}
                    onChange={(e) => handleFareAdjTypeChange(e.target.value)}
                  >
                    <option value="none">None (Use Rate Formula)</option>
                    <option value="flat_override">Flat Base Fare Override ($)</option>
                    <option value="discount_percent">Base Fare Discount (%)</option>
                    <option value="discount_flat">Flat Discount ($)</option>
                    <option value="multiplier">Base Fare Multiplier (×)</option>
                  </Select>
                </div>

                {fareAdj && (
                  <div>
                    <label className="text-[11px] font-semibold text-fg-secondary block mb-1">
                      {fareAdj.type === 'flat_override'
                        ? 'Fixed Base Fare ($)'
                        : fareAdj.type === 'discount_percent'
                        ? 'Discount (%)'
                        : fareAdj.type === 'discount_flat'
                        ? 'Discount Amount ($)'
                        : 'Multiplier (e.g. 1.20)'}
                    </label>
                    <Input
                      type="number"
                      step={fareAdj.type === 'multiplier' ? '0.05' : '1'}
                      min="0"
                      value={fareAdj.value}
                      onChange={(e) =>
                        setWorkingCopy({
                          ...workingCopy,
                          modifier: {
                            ...workingCopy.modifier,
                            fareAdjustment: {
                              ...fareAdj,
                              value: parseFloat(e.target.value) || 0,
                            },
                          },
                        })
                      }
                      className="h-9 text-xs bg-surface-card font-mono font-bold"
                    />
                  </div>
                )}
              </div>

              {/* B. Surcharge Actions (APPLY / WAIVE / OVERRIDE) */}
              <div className="p-3.5 rounded-xl bg-surface-subtle border border-border-subtle/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-fg-primary flex items-center gap-1.5">
                      <ZapIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Surcharge Rules &amp; Exceptions</span>
                    </span>
                    <p className="text-[11px] text-fg-muted">
                      Turn on <strong>Rule-Only</strong> surcharges (APPLY), waive <strong>All-Trips</strong> surcharges (WAIVE), or override their amount.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSurchargeAction}
                    className="w-full sm:w-auto justify-center h-8 sm:h-7.5 text-xs bg-surface-card border-border-strong text-fg-strong cursor-pointer shrink-0"
                  >
                    <PlusIcon className="w-3 h-3 mr-1 text-emerald-600" />
                    Add Surcharge Rule
                  </Button>
                </div>

                {surchargeActions.length === 0 ? (
                  <p className="text-[11px] text-fg-subtle italic py-2">
                    No surcharge exceptions — all surcharges follow their default Universal / Rule-Only policy.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {surchargeActions.map((act, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-surface-card border border-border-subtle flex flex-wrap items-center gap-2"
                      >
                        <div className="w-full sm:w-auto flex-1 sm:min-w-[180px]">
                          <Select
                            size="sm"
                            value={act.surchargeId}
                            onChange={(e) =>
                              handleUpdateSurchargeAction(idx, { surchargeId: e.target.value })
                            }
                          >
                            {catalogSurcharges.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.defaultPolicy === 'universal' ? 'Universal' : 'Rule-Only'})
                              </option>
                            ))}
                          </Select>
                        </div>

                        <Select
                          size="sm"
                          fullWidth={false}
                          value={act.action}
                          onChange={(e) => {
                            const nextAction = e.target.value as RuleSurchargeAction['action'];
                            const ref = catalogSurcharges.find((s) => s.id === act.surchargeId);
                            handleUpdateSurchargeAction(idx, {
                              action: nextAction,
                              overrideAmount:
                                nextAction === 'override' ? act.overrideAmount ?? ref?.amount ?? 5 : undefined,
                              overrideMode:
                                nextAction === 'override' ? act.overrideMode ?? ref?.mode ?? 'flat' : undefined,
                            });
                          }}
                          triggerClassName={`font-bold ${
                            act.action === 'waive'
                              ? 'bg-status-danger-bg border-status-danger-border text-status-danger-fg'
                              : act.action === 'override'
                              ? 'bg-status-warning-bg border-status-warning-border text-status-warning-fg'
                              : 'bg-status-success-bg border-status-success-border text-status-success-fg'
                          }`}
                        >
                          <option value="apply">APPLY (Include)</option>
                          <option value="waive">WAIVE (Exclude)</option>
                          <option value="override">OVERRIDE Amount</option>
                        </Select>

                        {act.action === 'override' && (
                          <>
                            <Select
                              size="sm"
                              fullWidth={false}
                              value={act.overrideMode || 'flat'}
                              onChange={(e) =>
                                handleUpdateSurchargeAction(idx, {
                                  overrideMode: e.target.value as SurchargeCalcMode,
                                })
                              }
                            >
                              <option value="flat">Flat $</option>
                              <option value="per_mile">$/mi</option>
                              <option value="percent">%</option>
                              <option value="multiplier">× Mult</option>
                            </Select>
                            <div className="w-24 shrink-0">
                              <Input
                                type="number"
                                step="0.25"
                                min="0"
                                value={act.overrideAmount ?? 0}
                                onChange={(e) =>
                                  handleUpdateSurchargeAction(idx, {
                                    overrideAmount: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="h-8 text-xs font-mono font-bold bg-surface-card px-2"
                              />
                            </div>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveSurchargeAction(idx)}
                          className="p-1.5 rounded text-fg-subtle hover:text-rose-600 hover:bg-status-danger-bg cursor-pointer ml-auto sm:ml-0"
                          title="Remove surcharge action"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* C. Extra Overrides & Waivers */}
              <div className="p-3.5 rounded-xl bg-surface-subtle border border-border-subtle/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-fg-primary flex items-center gap-1.5">
                      <SparklesIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Extra Overrides &amp; Waivers</span>
                    </span>
                    <p className="text-[11px] text-fg-muted">
                      Optionally waive or customize Car Seat, Extra Passenger, Stop, or Curb Wait pricing when this rule matches.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddExtraAction}
                    className="w-full sm:w-auto justify-center h-8 sm:h-7.5 text-xs bg-surface-card border-border-strong text-fg-strong cursor-pointer shrink-0"
                  >
                    <PlusIcon className="w-3 h-3 mr-1 text-amber-600" />
                    Add Extra Override
                  </Button>
                </div>

                {extraActions.length === 0 ? (
                  <p className="text-[11px] text-fg-subtle italic py-1.5">
                    No extra overrides — standard Extras catalog pricing applies.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {extraActions.map((act, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-surface-card border border-border-subtle flex flex-wrap items-center gap-2"
                      >
                        <div className="w-full sm:w-auto flex-1 sm:min-w-[180px]">
                          <Select
                            size="sm"
                            value={act.extraKey}
                            onChange={(e) =>
                              handleUpdateExtraAction(idx, {
                                extraKey: e.target.value as RuleExtraTarget,
                              })
                            }
                          >
                            {EXTRA_TARGETS.map((et) => (
                              <option key={et.id} value={et.id}>
                                {et.label}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <Select
                          size="sm"
                          fullWidth={false}
                          value={act.action}
                          onChange={(e) => {
                            const nextAction = e.target.value as RuleExtraAction['action'];
                            handleUpdateExtraAction(idx, {
                              action: nextAction,
                              overrideAmount: nextAction === 'override' ? act.overrideAmount ?? 0 : undefined,
                            });
                          }}
                          triggerClassName={`font-bold ${
                            act.action === 'waive'
                              ? 'bg-status-danger-bg border-status-danger-border text-status-danger-fg'
                              : 'bg-status-warning-bg border-status-warning-border text-status-warning-fg'
                          }`}
                        >
                          <option value="waive">WAIVE ($0)</option>
                          <option value="override">OVERRIDE ($)</option>
                        </Select>

                        {act.action === 'override' && (
                          <div className="w-24 shrink-0">
                            <Input
                              type="number"
                              step="0.50"
                              min="0"
                              value={act.overrideAmount ?? 0}
                              onChange={(e) =>
                                handleUpdateExtraAction(idx, {
                                  overrideAmount: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="h-8 text-xs font-mono font-bold bg-surface-card px-2"
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveExtraAction(idx)}
                          className="p-1.5 rounded text-fg-subtle hover:text-rose-600 hover:bg-status-danger-bg cursor-pointer ml-auto sm:ml-0"
                          title="Remove extra override"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-fg-subtle text-sm p-12">
            Select a Rule from the left panel or click &ldquo;+ New Rule&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
