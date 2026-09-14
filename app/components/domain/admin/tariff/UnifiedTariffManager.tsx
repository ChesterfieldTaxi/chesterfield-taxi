import React, { useState, useMemo } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type {
  TariffProfile,
  TariffCorridor,
  TariffTaximeterRate,
  TariffDistanceIncrement,
  TariffGroup,
  TariffInheritanceConfig,
} from '../../../../core/types/tariff';
import { DEFAULT_TARIFF_PROFILES, getTariffService, resolveTariffProfile } from '../../../../core/services/pricing/tariff.service';
import { calculateTripPricing } from '../../../../core/services/pricing/pipeline';
import type { VehicleTier } from '../../../../core/types/trip';
import type { ZoneGeofence, ZoneGroup, LocationCollection } from '../../../../core/types/zone';
import { Button } from '../../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Input } from '../../../ui/Input';
import { Alert } from '../../../ui/Alert';
import { Badge } from '../../../ui/Badge';
import {
  CheckIcon,
  PlusIcon,
  TrashIcon,
  SlidersIcon,
  ZapIcon,
  CarIcon,
  DownloadIcon,
  LayersIcon,
  DollarSignIcon,
  XIcon,
  AlertTriangleIcon,
} from '../../../ui/Icons';

export interface UnifiedTariffManagerProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  zones: ZoneGeofence[];
  zoneGroups: ZoneGroup[];
  locationCollections: LocationCollection[];
  onOpenRulesDrawer?: () => void;
  onOpenZonesTab?: () => void;
}

export function UnifiedTariffManager({
  settings,
  onSave,
  isLoading = false,
  zones,
  zoneGroups,
  locationCollections,
  onOpenRulesDrawer,
  onOpenZonesTab,
}: UnifiedTariffManagerProps) {
  // Tariffs list state
  const [tariffs, setTariffs] = useState<TariffProfile[]>(() => {
    return settings.tariffs && settings.tariffs.length > 0
      ? settings.tariffs
      : DEFAULT_TARIFF_PROFILES;
  });

  // Tariff Groups state
  const [tariffGroups, setTariffGroups] = useState<TariffGroup[]>(() => {
    return settings.tariffGroups && settings.tariffGroups.length > 0
      ? settings.tariffGroups
      : [
          {
            id: 'group-metro',
            name: 'Standard Metro Fleet',
            description: 'Standard urban and suburban metered tariffs',
            tariffIds: ['tariff-standard-flat', 'tariff-meter'],
            isActive: true,
          },
          {
            id: 'group-xl',
            name: 'MiniVan & High Capacity',
            description: 'Tariffs targeting group transit and large cargo',
            tariffIds: ['tariff-minivan-flat', 'tariff-minivan-meter'],
            isActive: true,
          },
        ];
  });

  const [selectedTariffId, setSelectedTariffId] = useState<string>(() => {
    const list = settings.tariffs && settings.tariffs.length > 0 ? settings.tariffs : DEFAULT_TARIFF_PROFILES;
    return list[0]?.id || 'tariff-standard-flat';
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Group manager modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Estimates / Simulator Toggle
  const [showSimulator, setShowSimulator] = useState(true);

  // New corridor inline state
  const [newCorridorName, setNewCorridorName] = useState('');
  const [newCorridorFromZone, setNewCorridorFromZone] = useState('');
  const [newCorridorToZone, setNewCorridorToZone] = useState('');
  const [newCorridorPrice, setNewCorridorPrice] = useState<number>(45.0);
  const [newCorridorReturn, setNewCorridorReturn] = useState(true);
  const [newCorridorRank, setNewCorridorRank] = useState<number>(90);

  // New custom extra state
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraAmount, setNewExtraAmount] = useState<number>(4.0);
  const [newExtraType, setNewExtraType] = useState<'flat' | 'percent'>('flat');

  // Simulator state
  const [simDistance, setSimDistance] = useState<number>(18.5);
  const [simDuration, setSimDuration] = useState<number>(24);
  const [simDelayMinutes, setSimDelayMinutes] = useState<number>(0);
  const [simVehicleTier, setSimVehicleTier] = useState<VehicleTier>('standard');
  const [simOriginZoneId, setSimOriginZoneId] = useState<string>('zone-chesterfield-valley');
  const [simDestinationZoneId, setSimDestinationZoneId] = useState<string>('zone-lambert-airport');
  const [simLocationCollectionId, setSimLocationCollectionId] = useState<string>('');
  const [simCarSeats, setSimCarSeats] = useState<number>(0);
  const [simPassengers, setSimPassengers] = useState<number>(1);
  const [simAirport, setSimAirport] = useState<boolean>(true);

  // Dynamic admin-configured vehicle classes
  const availableVehicles = useMemo(() => {
    if (settings.vehicles && settings.vehicles.length > 0) {
      return settings.vehicles.map((v) => ({ id: v.id, label: v.name }));
    }
    return [
      { id: 'standard', label: 'Sedan / Standard' },
      { id: 'premium', label: 'Executive Luxury' },
      { id: 'xl', label: 'MiniVan / XL' },
      { id: 'wheelchair', label: 'WAV Wheelchair' },
    ];
  }, [settings.vehicles]);

  // Active Tariff Profile (raw)
  const activeProfile = useMemo(() => {
    return tariffs.find((t) => t.id === selectedTariffId) || tariffs[0] || DEFAULT_TARIFF_PROFILES[0];
  }, [tariffs, selectedTariffId]);

  // Active Tariff Profile (resolved with parent inheritance if applicable)
  const resolvedActiveProfile = useMemo(() => {
    return resolveTariffProfile(activeProfile, tariffs);
  }, [activeProfile, tariffs]);

  // Parent profile if inheritance is active
  const parentProfile = useMemo(() => {
    if (!activeProfile.parentTariffId) return undefined;
    return tariffs.find((t) => t.id === activeProfile.parentTariffId);
  }, [activeProfile.parentTariffId, tariffs]);

  // Update a field in the active tariff profile
  const updateActiveProfile = (updater: (prev: TariffProfile) => TariffProfile) => {
    setTariffs((prev) =>
      prev.map((t) => (t.id === activeProfile.id ? updater(t) : t))
    );
  };

  // Add a new Tariff Profile
  const handleCreateTariff = () => {
    const newId = `tariff-${Date.now().toString(36)}`;
    const newProfile: TariffProfile = {
      id: newId,
      name: `Custom Tariff ${tariffs.length + 1}`,
      currency: 'USD',
      units: 'imperial',
      fareIncrement: 2.50,
      priority: Math.max(10, 90 - tariffs.length * 5),
      isActive: true,
      isDefault: false,
      triggers: {
        vehicleTiers: availableVehicles.slice(0, 1).map((v) => v.id),
      },
      taximeter: {
        startPrice: 5.00,
        initialDistanceIncluded: 0,
        initialTimeIncluded: 0,
        primaryDistanceStep: 0.1,
        primaryDistanceRate: 0.250,
        primaryDistanceLimit: 20.0,
        intermediateIncrements: [],
        thenDistanceStep: 0.1,
        thenDistanceRate: 0.225,
        freeTrafficMinutes: 5.0,
        waitingRatePerStep: 0.60,
        waitingStepSeconds: 90,
        minimumPrice: 15.00,
      },
      corridors: [],
      extras: {
        carSeatFeePerUnit: 5.00,
        passengerBaseAllowance: 2,
        extraPassengerFeePerHead: 3.00,
        customSurcharges: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTariffs((prev) => [...prev, newProfile]);
    setSelectedTariffId(newId);
  };

  // Delete a Tariff Profile (Prominent Big Red Delete button action)
  const handleDeleteTariff = (tariffId: string) => {
    if (tariffs.length <= 1) {
      alert('Cannot delete the only remaining Tariff Profile.');
      return;
    }
    const target = tariffs.find((t) => t.id === tariffId);
    if (window.confirm(`Are you sure you want to permanently delete "${target?.name || 'this tariff'}"?`)) {
      const remaining = tariffs.filter((t) => t.id !== tariffId);
      // Clean up child inheritance references
      const cleaned = remaining.map((t) => {
        if (t.parentTariffId === tariffId) {
          const { parentTariffId, inheritance, ...rest } = t;
          return rest as TariffProfile;
        }
        return t;
      });
      setTariffs(cleaned);
      if (selectedTariffId === tariffId) {
        setSelectedTariffId(cleaned[0].id);
      }
    }
  };

  // Intermediate Increments: Add a new tier
  const handleAddIntermediateIncrement = () => {
    const existingIncrements = activeProfile.taximeter.intermediateIncrements || [];
    const highestLimit = existingIncrements.length > 0
      ? Math.max(...existingIncrements.map((i) => i.upToDistance))
      : activeProfile.taximeter.primaryDistanceLimit;

    const newInc: TariffDistanceIncrement = {
      id: `inc-${Date.now().toString(36)}`,
      name: `Tier ${existingIncrements.length + 2} (${highestLimit.toFixed(0)} - ${(highestLimit + 15).toFixed(0)} mi)`,
      upToDistance: highestLimit + 15,
      stepDistance: 0.1,
      ratePerStep: Number((activeProfile.taximeter.primaryDistanceRate * 0.95).toFixed(3)),
    };

    updateActiveProfile((prev) => ({
      ...prev,
      taximeter: {
        ...prev.taximeter,
        intermediateIncrements: [...(prev.taximeter.intermediateIncrements || []), newInc].sort(
          (a, b) => a.upToDistance - b.upToDistance
        ),
      },
    }));
  };

  // Intermediate Increments: Remove a tier
  const handleDeleteIntermediateIncrement = (incrementId: string) => {
    updateActiveProfile((prev) => ({
      ...prev,
      taximeter: {
        ...prev.taximeter,
        intermediateIncrements: (prev.taximeter.intermediateIncrements || []).filter(
          (i) => i.id !== incrementId
        ),
      },
    }));
  };

  // Intermediate Increments: Update tier field
  const handleUpdateIntermediateIncrement = (
    incrementId: string,
    updates: Partial<TariffDistanceIncrement>
  ) => {
    updateActiveProfile((prev) => ({
      ...prev,
      taximeter: {
        ...prev.taximeter,
        intermediateIncrements: (prev.taximeter.intermediateIncrements || []).map((i) =>
          i.id === incrementId ? { ...i, ...updates } : i
        ),
      },
    }));
  };

  // Add Corridor to active profile
  const handleAddCorridor = () => {
    if (!newCorridorName.trim()) {
      alert('Please enter a corridor name (e.g. "Chesterfield ➔ Lambert Airport")');
      return;
    }
    const newCorridor: TariffCorridor = {
      id: `corridor-${Date.now().toString(36)}`,
      name: newCorridorName.trim(),
      fromZoneId: newCorridorFromZone || undefined,
      toZoneId: newCorridorToZone || undefined,
      flatPrice: Number(newCorridorPrice.toFixed(2)),
      allowReturn: newCorridorReturn,
      priorityRank: newCorridorRank,
    };

    updateActiveProfile((prev) => ({
      ...prev,
      corridors: [...prev.corridors, newCorridor],
    }));

    setNewCorridorName('');
    setNewCorridorPrice(45.0);
  };

  // Delete Corridor
  const handleDeleteCorridor = (corridorId: string) => {
    updateActiveProfile((prev) => ({
      ...prev,
      corridors: prev.corridors.filter((c) => c.id !== corridorId),
    }));
  };

  // Add Extra Surcharge to active profile
  const handleAddExtra = () => {
    if (!newExtraName.trim() || newExtraAmount <= 0) return;
    const newExtra = {
      id: `extra-${Date.now().toString(36)}`,
      name: newExtraName.trim(),
      amount: Number(newExtraAmount.toFixed(2)),
      type: newExtraType,
    };
    updateActiveProfile((prev) => ({
      ...prev,
      extras: {
        ...prev.extras,
        customSurcharges: [...(prev.extras.customSurcharges || []), newExtra],
      },
    }));
    setNewExtraName('');
    setNewExtraAmount(4.0);
  };

  // Remove Extra Surcharge
  const handleDeleteExtra = (extraId: string) => {
    updateActiveProfile((prev) => ({
      ...prev,
      extras: {
        ...prev.extras,
        customSurcharges: (prev.extras.customSurcharges || []).filter((e) => e.id !== extraId),
      },
    }));
  };

  // Export corridors to JSON
  const handleExportCorridors = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activeProfile.corridors, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${activeProfile.name.toLowerCase().replace(/\s+/g, '_')}_corridors.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Add new Tariff Group
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: TariffGroup = {
      id: `group-${Date.now().toString(36)}`,
      name: newGroupName.trim(),
      description: newGroupDesc.trim() || undefined,
      tariffIds: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setTariffGroups((prev) => [...prev, newGroup]);
    setNewGroupName('');
    setNewGroupDesc('');
  };

  // Delete Tariff Group
  const handleDeleteGroup = (groupId: string) => {
    setTariffGroups((prev) => prev.filter((g) => g.id !== groupId));
    // Remove group reference from tariffs
    setTariffs((prev) =>
      prev.map((t) => (t.groupId === groupId ? { ...t, groupId: undefined } : t))
    );
  };

  // Save all tariffs & groups
  const handleSaveAllTariffs = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 1. Save to TariffService (Firestore /tariffs + localStorage)
      const service = getTariffService();
      for (const t of tariffs) {
        await service.saveTariff(t);
      }

      // 2. Persist in appSettings config
      await onSave({
        tariffs,
        tariffGroups,
        pricing: {
          ...settings.pricing,
          baseFare: activeProfile.taximeter.startPrice,
          perMileRate: Number((activeProfile.taximeter.primaryDistanceRate * 10).toFixed(2)),
          minimumFare: activeProfile.taximeter.minimumPrice,
        },
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('[UnifiedTariffManager] Save failed:', err);
      setSaveError(err.message || 'Failed to save tariff profiles to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // Live Pure Functional Pipeline Simulation
  const calculationResult = useMemo(() => {
    return calculateTripPricing(
      {
        distanceMiles: simDistance,
        durationMinutes: simDuration,
        delayMinutes: simDelayMinutes,
        vehicleTier: simVehicleTier,
        pickupDateTime: new Date().toISOString(),
        isAirportPickup: simAirport,
        originZoneId: simOriginZoneId || undefined,
        destinationZoneId: simDestinationZoneId || undefined,
        zoneIds: [
          ...(simOriginZoneId ? [simOriginZoneId] : []),
          ...(simDestinationZoneId ? [simDestinationZoneId] : []),
        ].filter(Boolean),
        locationCollectionIds: simLocationCollectionId ? [simLocationCollectionId] : undefined,
        carSeatsBreakdown: { total: simCarSeats },
        passengers: simPassengers,
      },
      {
        tariffs, // Pass current live editable state of tariffs
      }
    );
  }, [
    tariffs,
    simDistance,
    simDuration,
    simDelayMinutes,
    simVehicleTier,
    simOriginZoneId,
    simDestinationZoneId,
    simLocationCollectionId,
    simCarSeats,
    simPassengers,
    simAirport,
  ]);

  // Highest limit across primary + intermediate increments
  const effectiveHighestLimit = useMemo(() => {
    const incs = activeProfile.taximeter.intermediateIncrements || [];
    if (incs.length === 0) return activeProfile.taximeter.primaryDistanceLimit;
    return Math.max(...incs.map((i) => i.upToDistance));
  }, [activeProfile.taximeter]);

  return (
    <div className="space-y-6">
      {/* ─── TOP HEADER BAR ─── */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tariff Engine</div>
            <div className="text-base font-extrabold text-white flex items-center gap-2">
              <span>{activeProfile.name}</span>
              {activeProfile.isDefault && (
                <Badge variant="warning" className="text-[10px] uppercase font-bold py-0.5 px-2">
                  Default
                </Badge>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-700 hidden sm:block" />

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Currency</div>
            <div className="text-sm font-semibold text-emerald-400">US Dollar ($)</div>
          </div>

          <div className="h-8 w-px bg-slate-700 hidden sm:block" />

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Taximeter Fare Increment</div>
            <div className="text-sm font-semibold text-amber-300">
              ${activeProfile.fareIncrement?.toFixed(2) || '2.50'}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-700 hidden sm:block" />

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Units</div>
            <div className="text-sm font-semibold text-blue-300">Imperial (Miles / Yards)</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenRulesDrawer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenRulesDrawer}
              className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold"
            >
              Condition rules
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsGroupModalOpen(true)}
            className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            Tariff groups ({tariffGroups.length})
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const el = document.getElementById('tariff-extras-card');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            Extras
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSimulator(!showSimulator)}
            className={`text-xs font-bold transition-all ${
              showSimulator
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            Estimates
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSaveAllTariffs}
            isLoading={isSaving || isLoading}
            leftIcon={<CheckIcon className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            Save All Tariffs
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Tariffs Updated">
          All Tariff Profiles, Intermediate Increments, Corridors, and Groups have been saved.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Error">
          {saveError}
        </Alert>
      )}

      {/* ─── PROFILE TABS ROW (Clean pills without accidental delete button) ─── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {tariffs.map((tariff) => {
          const isSelected = tariff.id === selectedTariffId;
          const groupName = tariffGroups.find((g) => g.id === tariff.groupId)?.name;
          return (
            <button
              key={tariff.id}
              type="button"
              onClick={() => setSelectedTariffId(tariff.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl select-none text-xs font-bold transition-all border-t-2 text-left ${
                isSelected
                  ? 'bg-white text-slate-900 border-blue-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span>{tariff.name}</span>
              {groupName && (
                <span className="text-[9px] bg-slate-200/80 text-slate-700 px-1 py-0.2 rounded">
                  {groupName}
                </span>
              )}
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                tariff.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
              }`}>
                #{tariff.priority}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleCreateTariff}
          className="flex items-center gap-1.5 px-3 py-2 rounded-t-xl bg-slate-50 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 text-slate-600 hover:text-blue-700 text-xs font-bold transition-all"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>New Tariff</span>
        </button>
      </div>

      {/* ─── ACTIVE TARIFF WORKSPACE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Editor Column */}
        <div className={showSimulator ? 'lg:col-span-7 space-y-6' : 'lg:col-span-12 space-y-6'}>
          {/* Section 1: Profile Meta, Group & Inheritance */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Profile Configuration: {activeProfile.name}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Rule triggers, group classification, and priority rank determining when this tariff applies.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeProfile.isActive}
                      onChange={(e) =>
                        updateActiveProfile((prev) => ({ ...prev, isActive: e.target.checked }))
                      }
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Active Profile</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!activeProfile.isDefault}
                      onChange={(e) => {
                        const isDef = e.target.checked;
                        setTariffs((prev) =>
                          prev.map((t) => ({
                            ...t,
                            isDefault: t.id === activeProfile.id ? isDef : false,
                          }))
                        );
                      }}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                    />
                    <span>Default Tariff</span>
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tariff Name</label>
                  <Input
                    value={activeProfile.name}
                    onChange={(e) => updateActiveProfile((prev) => ({ ...prev, name: e.target.value }))}
                    className="text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Priority Rank (1-100)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={activeProfile.priority}
                    onChange={(e) =>
                      updateActiveProfile((prev) => ({
                        ...prev,
                        priority: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="text-xs font-bold font-mono"
                  />
                </div>
              </div>

              {/* Group Classification & Tariff Inheritance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <LayersIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Tariff Group</span>
                  </label>
                  <select
                    value={activeProfile.groupId || ''}
                    onChange={(e) =>
                      updateActiveProfile((prev) => ({
                        ...prev,
                        groupId: e.target.value || undefined,
                      }))
                    }
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-medium"
                  >
                    <option value="">None (Independent Tariff)</option>
                    {tariffGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Inherit from Parent Tariff</label>
                  <select
                    value={activeProfile.parentTariffId || ''}
                    onChange={(e) => {
                      const parentId = e.target.value || undefined;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        parentTariffId: parentId,
                        inheritance: parentId
                          ? prev.inheritance || {
                              overrideTaximeter: false,
                              overrideCorridors: false,
                              overrideExtras: false,
                              overrideTriggers: false,
                            }
                          : undefined,
                      }));
                    }}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-medium"
                  >
                    <option value="">None (No Inheritance)</option>
                    {tariffs
                      .filter((t) => t.id !== activeProfile.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (Priority #{t.priority})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Inheritance Override Toggles if parent is assigned */}
              {activeProfile.parentTariffId && parentProfile && (
                <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2">
                  <div className="text-xs font-bold text-indigo-950 flex items-center justify-between">
                    <span>Inheritance Overrides from "{parentProfile.name}"</span>
                    <span className="text-[10px] bg-indigo-200/80 text-indigo-900 px-2 py-0.5 rounded-full">
                      Parent Linked
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeProfile.inheritance?.overrideTaximeter ?? false}
                        onChange={(e) =>
                          updateActiveProfile((prev) => ({
                            ...prev,
                            inheritance: {
                              ...prev.inheritance,
                              overrideTaximeter: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span>Override Taximeter</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeProfile.inheritance?.overrideCorridors ?? false}
                        onChange={(e) =>
                          updateActiveProfile((prev) => ({
                            ...prev,
                            inheritance: {
                              ...prev.inheritance,
                              overrideCorridors: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span>Override Corridors</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeProfile.inheritance?.overrideExtras ?? false}
                        onChange={(e) =>
                          updateActiveProfile((prev) => ({
                            ...prev,
                            inheritance: {
                              ...prev.inheritance,
                              overrideExtras: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span>Override Extras</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Target Admin-Configured Vehicle Classes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CarIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Target Vehicle Classes ({availableVehicles.length} available)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableVehicles.map((v) => {
                    const activeTiers = activeProfile.triggers.vehicleTiers || [];
                    const isChecked = activeTiers.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          const updated = isChecked
                            ? activeTiers.filter((t) => t !== v.id)
                            : [...activeTiers, v.id];
                          updateActiveProfile((prev) => ({
                            ...prev,
                            triggers: { ...prev.triggers, vehicleTiers: updated },
                          }));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isChecked
                            ? 'bg-blue-50 text-blue-800 border-blue-300 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isChecked ? '✓ ' : '+ '}
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Section 2: Taximeter Step Brackets with Intermediate Increments */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <SlidersIcon className="w-4 h-4 text-amber-500" />
                  <span>Taximeter Step Brackets</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Step-increment distance brackets, intermediate tiers, and delay rates applied when no flat corridor matches.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Formula Preview Box */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs space-y-1.5 border border-slate-800 shadow-inner">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5 mb-2 font-sans font-bold">
                  <span>ACTIVE TAXIMETER FORMULA</span>
                  <span className="text-[10px] text-amber-400">
                    {1 + (activeProfile.taximeter.intermediateIncrements?.length || 0) + 1} DISTANCE TIERS
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">start price: </span>
                  <span className="text-emerald-400 font-bold font-mono">
                    ${activeProfile.taximeter.startPrice.toFixed(3)}
                  </span>
                  <span className="text-slate-400"> for first </span>
                  <span className="text-blue-300 font-bold">
                    {(activeProfile.taximeter.initialDistanceIncluded * 1760).toFixed(0)} y
                  </span>
                  <span className="text-slate-400"> ({activeProfile.taximeter.initialDistanceIncluded.toFixed(1)} mi)</span>
                </div>

                {/* Primary Bracket */}
                <div>
                  <span className="text-slate-400">primary distance: </span>
                  <span className="text-amber-300 font-bold font-mono">
                    ${activeProfile.taximeter.primaryDistanceRate.toFixed(3)}
                  </span>
                  <span className="text-slate-400"> per </span>
                  <span className="text-blue-300 font-bold">
                    {(activeProfile.taximeter.primaryDistanceStep * 1760).toFixed(0)} y
                  </span>
                  <span className="text-slate-400"> for </span>
                  <span className="text-blue-300 font-bold">
                    {(activeProfile.taximeter.primaryDistanceLimit * 1760).toFixed(0)} y
                  </span>
                  <span className="text-slate-400"> (0 - {activeProfile.taximeter.primaryDistanceLimit.toFixed(1)} mi)</span>
                </div>

                {/* Intermediate Increments */}
                {(activeProfile.taximeter.intermediateIncrements || []).map((inc, idx) => (
                  <div key={inc.id} className="pl-2 border-l border-slate-700">
                    <span className="text-slate-400">increment tier {idx + 1}: </span>
                    <span className="text-cyan-300 font-bold font-mono">
                      ${inc.ratePerStep.toFixed(3)}
                    </span>
                    <span className="text-slate-400"> per </span>
                    <span className="text-blue-300 font-bold">
                      {(inc.stepDistance * 1760).toFixed(0)} y
                    </span>
                    <span className="text-slate-400"> up to </span>
                    <span className="text-blue-300 font-bold">
                      {(inc.upToDistance * 1760).toFixed(0)} y
                    </span>
                    <span className="text-slate-400"> ({inc.upToDistance.toFixed(1)} mi)</span>
                  </div>
                ))}

                {/* Then Open-Ended Tier */}
                <div>
                  <span className="text-slate-400">then: </span>
                  <span className="text-purple-300 font-bold font-mono">
                    ${activeProfile.taximeter.thenDistanceRate.toFixed(3)}
                  </span>
                  <span className="text-slate-400"> per </span>
                  <span className="text-blue-300 font-bold">
                    {(activeProfile.taximeter.thenDistanceStep * 1760).toFixed(0)} y
                  </span>
                  <span className="text-slate-400"> (after {effectiveHighestLimit.toFixed(1)} mi open-ended)</span>
                </div>

                <div className="pt-1 border-t border-slate-800 flex flex-wrap gap-4 text-[11px]">
                  <div>
                    <span className="text-slate-400">free traffic: </span>
                    <span className="text-cyan-300 font-bold">
                      {(activeProfile.taximeter.freeTrafficMinutes * 60).toFixed(0)}s grace
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">waiting rate: </span>
                    <span className="text-amber-300 font-bold">
                      ${activeProfile.taximeter.waitingRatePerStep.toFixed(2)}/{activeProfile.taximeter.waitingStepSeconds}s
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">minimum floor: </span>
                    <span className="text-rose-400 font-bold">
                      ${activeProfile.taximeter.minimumPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Flag drop & Floor controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Flag Drop Start Price ($)</label>
                  <Input
                    type="number"
                    step="0.25"
                    value={activeProfile.taximeter.startPrice}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        taximeter: { ...prev.taximeter, startPrice: val },
                      }));
                    }}
                    className="text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Initial Included Miles</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={activeProfile.taximeter.initialDistanceIncluded}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        taximeter: { ...prev.taximeter, initialDistanceIncluded: val },
                      }));
                    }}
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Minimum Price Floor ($)</label>
                  <Input
                    type="number"
                    step="0.5"
                    value={activeProfile.taximeter.minimumPrice}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        taximeter: { ...prev.taximeter, minimumPrice: val },
                      }));
                    }}
                    className="text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Primary Bracket Controls */}
              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-3">
                <div className="text-xs font-bold text-amber-900">
                  Primary Bracket (0 to {activeProfile.taximeter.primaryDistanceLimit} mi)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">Rate ($/step)</label>
                    <Input
                      type="number"
                      step="0.005"
                      value={activeProfile.taximeter.primaryDistanceRate}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, primaryDistanceRate: val },
                        }));
                      }}
                      className="text-xs font-mono font-bold text-amber-800"
                    />
                    <div className="text-[10px] text-slate-500 font-mono">
                      = ${(activeProfile.taximeter.primaryDistanceRate * 10).toFixed(2)}/mile
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">Step Size (mi)</label>
                    <Input
                      type="number"
                      step="0.05"
                      value={activeProfile.taximeter.primaryDistanceStep}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0.1;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, primaryDistanceStep: val },
                        }));
                      }}
                      className="text-xs font-mono"
                    />
                    <div className="text-[10px] text-slate-500 font-mono">
                      = {(activeProfile.taximeter.primaryDistanceStep * 1760).toFixed(0)} yards
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">Upper Distance Limit (mi)</label>
                    <Input
                      type="number"
                      step="1"
                      value={activeProfile.taximeter.primaryDistanceLimit}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 20;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, primaryDistanceLimit: val },
                        }));
                      }}
                      className="text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Intermediate Increments List */}
              {(activeProfile.taximeter.intermediateIncrements || []).length > 0 && (
                <div className="space-y-3 pt-1">
                  <div className="text-xs font-bold text-slate-800">
                    Intermediate Increment Brackets (Between Primary &amp; Then)
                  </div>
                  {(activeProfile.taximeter.intermediateIncrements || []).map((inc, idx) => (
                    <div
                      key={inc.id}
                      className="p-3 bg-cyan-50/40 border border-cyan-200 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-cyan-950">
                        <span>Tier {idx + 2}: {inc.name || `Up to ${inc.upToDistance} mi`}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteIntermediateIncrement(inc.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                          title="Remove Increment Tier"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">Rate ($/step)</label>
                          <Input
                            type="number"
                            step="0.005"
                            value={inc.ratePerStep}
                            onChange={(e) =>
                              handleUpdateIntermediateIncrement(inc.id, {
                                ratePerStep: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="text-xs font-mono font-bold text-cyan-900"
                          />
                          <div className="text-[10px] text-slate-500 font-mono">
                            = ${(inc.ratePerStep * 10).toFixed(2)}/mile
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">Step Size (mi)</label>
                          <Input
                            type="number"
                            step="0.05"
                            value={inc.stepDistance}
                            onChange={(e) =>
                              handleUpdateIntermediateIncrement(inc.id, {
                                stepDistance: parseFloat(e.target.value) || 0.1,
                              })
                            }
                            className="text-xs font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">Up To Distance (mi)</label>
                          <Input
                            type="number"
                            step="1"
                            value={inc.upToDistance}
                            onChange={(e) =>
                              handleUpdateIntermediateIncrement(inc.id, {
                                upToDistance: parseFloat(e.target.value) || 30,
                              })
                            }
                            className="text-xs font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Increment Tier Button placed directly between Primary (+ any intermediate increments) and Then */}
              <div className="pt-0.5 pb-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddIntermediateIncrement}
                  leftIcon={<PlusIcon className="w-3.5 h-3.5 text-blue-600" />}
                  className="w-full py-2.5 text-xs font-bold border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50/60 text-blue-700 flex items-center justify-center gap-1.5 transition-all"
                >
                  Add Increment Tier (Between Primary &amp; Then)
                </Button>
              </div>

              {/* "Then" Open-Ended Tier */}
              <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-lg space-y-3">
                <div className="text-xs font-bold text-purple-900">
                  "Then" Open-Ended Bracket (Applied after {effectiveHighestLimit.toFixed(1)} mi to infinity)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">"Then" Rate ($/step)</label>
                    <Input
                      type="number"
                      step="0.005"
                      value={activeProfile.taximeter.thenDistanceRate}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, thenDistanceRate: val },
                        }));
                      }}
                      className="text-xs font-mono font-bold text-purple-800"
                    />
                    <div className="text-[10px] text-slate-500 font-mono">
                      = ${(activeProfile.taximeter.thenDistanceRate * 10).toFixed(2)}/mile
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">"Then" Step Size (mi)</label>
                    <Input
                      type="number"
                      step="0.05"
                      value={activeProfile.taximeter.thenDistanceStep}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0.1;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, thenDistanceStep: val },
                        }));
                      }}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Waiting & Traffic Delays */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Free Traffic Delay Allowance (min)</label>
                  <Input
                    type="number"
                    step="1"
                    value={activeProfile.taximeter.freeTrafficMinutes}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        taximeter: { ...prev.taximeter, freeTrafficMinutes: val },
                      }));
                    }}
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Waiting ($/step &amp; sec interval)</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.05"
                      value={activeProfile.taximeter.waitingRatePerStep}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, waitingRatePerStep: val },
                        }));
                      }}
                      className="text-xs font-mono font-bold w-1/2"
                      placeholder="$"
                    />
                    <Input
                      type="number"
                      step="10"
                      value={activeProfile.taximeter.waitingStepSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 90;
                        updateActiveProfile((prev) => ({
                          ...prev,
                          taximeter: { ...prev.taximeter, waitingStepSeconds: val },
                        }));
                      }}
                      className="text-xs font-mono w-1/2"
                      placeholder="sec"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Flat Tariff Matrix (From / To Corridors) */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Flat Tariff Matrix</span>
                    <Badge variant="info" className="text-[10px] font-mono py-0.2 px-1.5">
                      {activeProfile.corridors.length} Corridors
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Origin to Destination zone pairs billed at fixed flat rates with bidirectional return trip toggle.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportCorridors}
                    disabled={activeProfile.corridors.length === 0}
                    leftIcon={<DownloadIcon className="w-3.5 h-3.5 text-slate-500" />}
                    className="text-xs font-semibold"
                  >
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Existing Corridors Table */}
              {activeProfile.corridors.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2 border-b border-slate-200">Rank</th>
                        <th className="px-3 py-2 border-b border-slate-200">Name</th>
                        <th className="px-3 py-2 border-b border-slate-200">From</th>
                        <th className="px-3 py-2 border-b border-slate-200">To</th>
                        <th className="px-3 py-2 border-b border-slate-200 text-right">Flat Price</th>
                        <th className="px-3 py-2 border-b border-slate-200 text-center">Return</th>
                        <th className="px-3 py-2 border-b border-slate-200 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {activeProfile.corridors.map((corridor) => {
                        const fromLabel =
                          zones.find((z) => z.id === corridor.fromZoneId)?.name ||
                          locationCollections.find((c) => c.id === corridor.fromLocationCollectionId)?.name ||
                          corridor.fromZoneId ||
                          'Any / All';
                        const toLabel =
                          zones.find((z) => z.id === corridor.toZoneId)?.name ||
                          locationCollections.find((c) => c.id === corridor.toLocationCollectionId)?.name ||
                          corridor.toZoneId ||
                          'Any / All';

                        return (
                          <tr key={corridor.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2.5 font-mono text-slate-600">
                              #{corridor.priorityRank ?? 90}
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-900">{corridor.name}</td>
                            <td className="px-3 py-2.5 text-blue-700 font-semibold">{fromLabel}</td>
                            <td className="px-3 py-2.5 text-emerald-700 font-semibold">{toLabel}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                              ${corridor.flatPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  corridor.allowReturn
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {corridor.allowReturn ? '⇄ Two-Way' : '→ One-Way'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCorridor(corridor.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                                title="Remove Corridor"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 text-xs">
                  No flat corridors defined in this tariff profile. Trips will be metered via taximeter step rates.
                </div>
              )}

              {/* Add New Corridor Inline Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Create Fixed Flat Corridor</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Corridor Name</label>
                    <Input
                      placeholder="e.g. Chesterfield Valley ➔ Lambert Airport"
                      value={newCorridorName}
                      onChange={(e) => setNewCorridorName(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Flat Price ($)</label>
                    <Input
                      type="number"
                      step="0.5"
                      value={newCorridorPrice}
                      onChange={(e) => setNewCorridorPrice(parseFloat(e.target.value) || 0)}
                      className="text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Rank</label>
                    <Input
                      type="number"
                      value={newCorridorRank}
                      onChange={(e) => setNewCorridorRank(parseInt(e.target.value) || 90)}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Origin (From)</label>
                    <select
                      value={newCorridorFromZone}
                      onChange={(e) => setNewCorridorFromZone(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-medium"
                    >
                      <option value="">Any / General Origin</option>
                      <optgroup label="Geofence Zones">
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </optgroup>
                      {locationCollections.length > 0 && (
                        <optgroup label="Location Collections / POIs">
                          {locationCollections.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Destination (To)</label>
                    <select
                      value={newCorridorToZone}
                      onChange={(e) => setNewCorridorToZone(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-medium"
                    >
                      <option value="">Any / General Destination</option>
                      <optgroup label="Geofence Zones">
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </optgroup>
                      {locationCollections.length > 0 && (
                        <optgroup label="Location Collections / POIs">
                          {locationCollections.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCorridorReturn}
                        onChange={(e) => setNewCorridorReturn(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                      />
                      <span>Allow Return (⇄)</span>
                    </label>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleAddCorridor}
                      leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                    >
                      Add Corridor
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Extras & Surcharges */}
          <Card id="tariff-extras-card" variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSignIcon className="w-4 h-4 text-emerald-600" />
                <span>Tariff Extras &amp; Surcharges</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Child car safety seats, extra passenger thresholds, and gate access surcharges.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Child Seat Fee ($/unit)</label>
                  <Input
                    type="number"
                    step="0.5"
                    value={activeProfile.extras.carSeatFeePerUnit}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        extras: { ...prev.extras, carSeatFeePerUnit: val },
                      }));
                    }}
                    className="text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Pax Included in Base</label>
                  <Input
                    type="number"
                    min="1"
                    max="8"
                    value={activeProfile.extras.passengerBaseAllowance}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 2;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        extras: { ...prev.extras, passengerBaseAllowance: val },
                      }));
                    }}
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Extra Pax Fee ($/head)</label>
                  <Input
                    type="number"
                    step="0.5"
                    value={activeProfile.extras.extraPassengerFeePerHead}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateActiveProfile((prev) => ({
                        ...prev,
                        extras: { ...prev.extras, extraPassengerFeePerHead: val },
                      }));
                    }}
                    className="text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Custom Surcharges List */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="text-xs font-bold text-slate-800">Custom Tariff Adders</div>
                {activeProfile.extras.customSurcharges && activeProfile.extras.customSurcharges.length > 0 ? (
                  <div className="space-y-2">
                    {activeProfile.extras.customSurcharges.map((extra) => (
                      <div
                        key={extra.id}
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        <span className="font-bold text-slate-800">{extra.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-900">
                            {extra.type === 'percent' ? `${extra.amount}%` : `$${extra.amount.toFixed(2)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteExtra(extra.id)}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs italic">No custom extras defined for this tariff.</div>
                )}

                {/* Add Extra form */}
                <div className="flex items-center gap-2 pt-2">
                  <Input
                    placeholder="Extra Name (e.g. Lambert Gate Fee)"
                    value={newExtraName}
                    onChange={(e) => setNewExtraName(e.target.value)}
                    className="text-xs flex-1"
                  />
                  <Input
                    type="number"
                    step="0.5"
                    value={newExtraAmount}
                    onChange={(e) => setNewExtraAmount(parseFloat(e.target.value) || 0)}
                    className="text-xs font-mono font-bold w-24"
                    placeholder="Amount"
                  />
                  <select
                    value={newExtraType}
                    onChange={(e) => setNewExtraType(e.target.value as any)}
                    className="text-xs border border-slate-200 rounded-lg p-2 font-semibold bg-white"
                  >
                    <option value="flat">Flat ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddExtra}
                    leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                    className="text-xs font-bold"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── DANGER ZONE: BIG RED DELETE BUTTON AT THE BOTTOM OF THE PAGE ─── */}
          <div className="p-5 bg-rose-50/70 border border-rose-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                <AlertTriangleIcon className="w-4 h-4 text-rose-600" />
                <span>Delete Tariff Profile</span>
              </div>
              <div className="text-xs text-rose-700 mt-0.5">
                Permanently delete "{activeProfile.name}" from your active pricing calculation and database.
              </div>
            </div>
            <Button
              type="button"
              variant="danger"
              size="lg"
              disabled={tariffs.length <= 1}
              onClick={() => handleDeleteTariff(activeProfile.id)}
              leftIcon={<TrashIcon className="w-4 h-4" />}
              className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-6 py-3 shadow-sm shrink-0"
            >
              Delete This Tariff Profile
            </Button>
          </div>
        </div>

        {/* ─── ESTIMATES & LIVE SIMULATOR COLUMN ─── */}
        {showSimulator && (
          <div className="lg:col-span-5 space-y-6">
            <Card variant="elevated" className="border-slate-200 shadow-md sticky top-6">
              <CardHeader className="bg-slate-900 text-white rounded-t-xl pb-3 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-extrabold text-white flex items-center gap-2">
                      <ZapIcon className="w-4 h-4 text-amber-400" />
                      <span>Live Fare Simulator</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Evaluates live tariffs and corridor matrices instantly.
                    </CardDescription>
                  </div>
                  <Badge variant="warning" className="text-[10px] font-bold">
                    Pure Pipeline
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-4">
                {/* Simulated Trip Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Origin Zone (Pickup)</label>
                    <select
                      value={simOriginZoneId}
                      onChange={(e) => setSimOriginZoneId(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white font-medium"
                    >
                      <option value="">General (No Zone)</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Destination Zone</label>
                    <select
                      value={simDestinationZoneId}
                      onChange={(e) => setSimDestinationZoneId(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white font-medium"
                    >
                      <option value="">General (No Zone)</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Distance (mi)</label>
                    <Input
                      type="number"
                      step="0.5"
                      value={simDistance}
                      onChange={(e) => setSimDistance(parseFloat(e.target.value) || 0)}
                      className="text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Duration (min)</label>
                    <Input
                      type="number"
                      step="1"
                      value={simDuration}
                      onChange={(e) => setSimDuration(parseFloat(e.target.value) || 0)}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Delay / Wait</label>
                    <Input
                      type="number"
                      step="1"
                      value={simDelayMinutes}
                      onChange={(e) => setSimDelayMinutes(parseFloat(e.target.value) || 0)}
                      className="text-xs font-mono"
                      placeholder="0 min"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Vehicle Class</label>
                    <select
                      value={simVehicleTier}
                      onChange={(e) => setSimVehicleTier(e.target.value as VehicleTier)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white font-medium"
                    >
                      {availableVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Passengers</label>
                    <Input
                      type="number"
                      min="1"
                      max="8"
                      value={simPassengers}
                      onChange={(e) => setSimPassengers(parseInt(e.target.value) || 1)}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">Car Seats</label>
                    <Input
                      type="number"
                      min="0"
                      max="4"
                      value={simCarSeats}
                      onChange={(e) => setSimCarSeats(parseInt(e.target.value) || 0)}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Calculation Output Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Calculated Total Fare
                    </span>
                    <span className="text-2xl font-black font-mono text-slate-900">
                      ${calculationResult.pricing.totalFare.toFixed(2)}
                    </span>
                  </div>

                  {/* Matched Profile Badge */}
                  <div className="p-2 bg-blue-50/70 border border-blue-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                      <span>Tariff Profile:</span>
                      <span className="font-mono text-[11px] bg-blue-200/80 px-2 py-0.5 rounded-full">
                        {calculationResult.context.tariffProfileName || 'Default Standard'}
                      </span>
                    </div>

                    {calculationResult.context.matchedCorridorName ? (
                      <div className="text-[11px] text-purple-900 font-semibold flex items-center gap-1">
                        <span>Corridor:</span>
                        <span className="font-bold">{calculationResult.context.matchedCorridorName}</span>
                        <span className="text-[10px] bg-purple-100 text-purple-800 px-1 rounded">FLAT FARE</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-600">
                        Evaluated via Taximeter Step Increments &amp; Decay Brackets.
                      </div>
                    )}
                  </div>

                  {/* Audit Trail Steps */}
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Itemized Audit Trail ({calculationResult.context.auditTrail.length} steps)
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 text-[11px] pr-1">
                      {calculationResult.context.auditTrail.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between p-1.5 rounded bg-white border border-slate-100 font-mono text-[10px]"
                        >
                          <div className="flex-1 pr-2">
                            <span className="font-bold text-slate-800">{step.stepName}: </span>
                            <span className="text-slate-600">{step.description}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-slate-900">
                              {step.appliedDelta >= 0 ? `+$${step.appliedDelta.toFixed(2)}` : `-$${Math.abs(step.appliedDelta).toFixed(2)}`}
                            </div>
                            <div className="text-slate-400 text-[9px]">${step.runningSubtotal.toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ─── TARIFF GROUPS MODAL ─── */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Manage Tariff Groups</h3>
                <p className="text-xs text-slate-500">Group related tariff profiles for organized fleet dispatch.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Existing Groups */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Active Groups ({tariffGroups.length})
                </div>
                {tariffGroups.length > 0 ? (
                  <div className="space-y-2">
                    {tariffGroups.map((g) => {
                      const count = tariffs.filter((t) => t.groupId === g.id).length;
                      return (
                        <div
                          key={g.id}
                          className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900">{g.name}</div>
                            {g.description && (
                              <div className="text-[11px] text-slate-500">{g.description}</div>
                            )}
                            <div className="text-[10px] text-blue-600 font-semibold mt-0.5">
                              {count} tariff{count === 1 ? '' : 's'} assigned
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(g.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                            title="Delete Group"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">No groups defined.</div>
                )}
              </div>

              {/* Add New Group Form */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Create New Tariff Group</span>
                </div>
                <Input
                  placeholder="Group Name (e.g. Airport Fleet Tariffs)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Description (Optional)"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="text-xs"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  className="text-xs font-bold w-full"
                >
                  Create Group
                </Button>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsGroupModalOpen(false)}
                className="text-xs font-bold"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
