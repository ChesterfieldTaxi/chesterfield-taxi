import React, { useState, useMemo } from 'react';
import { Input } from '~/components/ui/Input';
import {
  CarIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  SlidersIcon,
  BoltIcon,
  PlaneIcon,
  PlaneLandingIcon,
} from '~/components/ui/Icons';
import { calculateTripPricing } from '~/core/services/pricing/pipeline';
import { getAdminConfigService } from '~/core/services/config/admin-config.service';
import { getZoneService, DEFAULT_ZONES } from '~/core/services/zones/zone.service';
import type { PricingConfig, PricingInput } from '~/core/services/pricing/types';
import type { TariffProfile } from '~/core/types/tariff';
import type {
  NamedPricingRule,
  UniversalExtrasConfig,
  SurchargesConfig,
  VehicleTierConfig,
  CorporateAccountConfig,
} from '~/core/types/config';

export interface PersistentFareSimulatorProps {
  tariffs: TariffProfile[];
  rules: NamedPricingRule[];
  universalExtras: UniversalExtrasConfig;
  surcharges: SurchargesConfig;
  vehicles?: VehicleTierConfig[];
  corporateAccounts?: CorporateAccountConfig[];
  hasUnsavedDraft?: boolean;
  className?: string;
}

export function PersistentFareSimulator({
  tariffs,
  rules,
  universalExtras,
  surcharges,
  vehicles,
  corporateAccounts,
  hasUnsavedDraft = false,
  className = '',
}: PersistentFareSimulatorProps) {
  const activeTariffs = useMemo(() => tariffs.filter((t) => !t.isArchived), [tariffs]);
  const availableZones = useMemo(() => {
    try {
      const z = getZoneService().getActiveZones();
      return z.length > 0 ? z : DEFAULT_ZONES;
    } catch {
      return DEFAULT_ZONES;
    }
  }, []);

  const simulatorVehicles = useMemo(() => {
    let source = vehicles;
    if (!source || source.length === 0) {
      try {
        source = getAdminConfigService().getCachedSettings()?.vehicles;
      } catch {
        source = [];
      }
    }
    const fleetList = (source || [])
      .filter((v) => !v.isArchived)
      .map((v) => ({ id: v.id, label: v.name || v.id }));

    const hasAny = fleetList.some((v) => v.id === 'any');
    return hasAny ? fleetList : [{ id: 'any', label: 'Any Vehicle' }, ...fleetList];
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

  // Simulator input state
  const [simulationTariffMode, setSimulationTariffMode] = useState<string>('auto');
  const [distanceMiles, setDistanceMiles] = useState<number>(20.0);
  const [durationMinutes, setDurationMinutes] = useState<number>(28);
  const [passengers, setPassengers] = useState<number>(1);
  const [intermediateStops, setIntermediateStops] = useState<number>(0);
  const [carSeatsCount, setCarSeatsCount] = useState<number>(0);
  const [curbWaitMinutes, setCurbWaitMinutes] = useState<number>(0);
  const [delayMinutes, setDelayMinutes] = useState<number>(0);
  const [pickupDate, setPickupDate] = useState<string>('2026-11-20');
  const [pickupTime, setPickupTime] = useState<string>('14:00');
  const [isHourly, setIsHourly] = useState<boolean>(false);
  const [hourlyHours, setHourlyHours] = useState<number>(2);
  const [corporateAccountId, setCorporateAccountId] = useState<string>('');
  const [originZoneId, setOriginZoneId] = useState<string>('zone-lambert-airport');
  const [destinationZoneId, setDestinationZoneId] = useState<string>('zone-chesterfield-valley');
  const [pickupZip, setPickupZip] = useState<string>('63145');
  const [dropoffZip, setDropoffZip] = useState<string>('63005');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('any');
  const [isAirportPickup, setIsAirportPickup] = useState<boolean>(true);
  const [showFirewallTrace, setShowFirewallTrace] = useState<boolean>(true);
  const [showAuditTrail, setShowAuditTrail] = useState<boolean>(false);

  // Quick Preset Handlers
  const applyPreset = (preset: 'airport' | 'meter' | 'spirit' | 'medical') => {
    switch (preset) {
      case 'airport':
        setSimulationTariffMode('auto');
        setDistanceMiles(20.0);
        setDurationMinutes(28);
        setPassengers(1);
        setIntermediateStops(0);
        setCarSeatsCount(0);
        setCurbWaitMinutes(0);
        setIsHourly(false);
        setCorporateAccountId('');
        setOriginZoneId('zone-lambert-airport');
        setDestinationZoneId('zone-chesterfield-valley');
        setPickupZip('63145');
        setDropoffZip('63005');
        setIsAirportPickup(true);
        break;
      case 'meter':
        setSimulationTariffMode('auto');
        setDistanceMiles(10.0);
        setDurationMinutes(18);
        setPassengers(1);
        setIntermediateStops(0);
        setCarSeatsCount(0);
        setCurbWaitMinutes(0);
        setIsHourly(false);
        setCorporateAccountId('');
        setOriginZoneId('');
        setDestinationZoneId('');
        setPickupZip('63017');
        setDropoffZip('63011');
        setIsAirportPickup(false);
        break;
      case 'spirit':
        setSimulationTariffMode('auto');
        setDistanceMiles(5.5);
        setDurationMinutes(12);
        setPassengers(2);
        setIntermediateStops(0);
        setCarSeatsCount(0);
        setCurbWaitMinutes(0);
        setIsHourly(false);
        setCorporateAccountId('');
        setOriginZoneId('zone-spirit-airport');
        setDestinationZoneId('');
        setPickupZip('63005');
        setDropoffZip('63017');
        setIsAirportPickup(true);
        break;
      case 'medical':
        setSimulationTariffMode('auto');
        setDistanceMiles(14.0);
        setDurationMinutes(22);
        setPassengers(1);
        setIntermediateStops(0);
        setCarSeatsCount(0);
        setCurbWaitMinutes(10);
        setIsHourly(false);
        setCorporateAccountId('');
        setOriginZoneId('');
        setDestinationZoneId('');
        setPickupZip('63017');
        setDropoffZip('63141');
        setIsAirportPickup(false);
        break;
    }
  };

  const baseInput: PricingInput = useMemo(
    () => ({
      distanceMiles: Number(distanceMiles) || 0,
      durationMinutes: Number(durationMinutes) || 0,
      passengers: Number(passengers) || 1,
      intermediateStopsCount: Number(intermediateStops) || 0,
      carSeatsBreakdown: carSeatsCount > 0 ? { booster: carSeatsCount } : undefined,
      curbWaitMinutes: Number(curbWaitMinutes) || 0,
      delayMinutes: Number(delayMinutes) || 0,
      pickupDateTime:
        pickupDate && pickupTime ? `${pickupDate}T${pickupTime}:00` : undefined,
      isHourlyBooking: isHourly,
      hourlyDurationHours: isHourly ? Number(hourlyHours) || 2 : undefined,
      corporateAccountId: corporateAccountId || undefined,
      accountTags: corporateAccountId ? [corporateAccountId] : undefined,
      originZoneIds: originZoneId ? [originZoneId] : [],
      destinationZoneIds: destinationZoneId ? [destinationZoneId] : [],
      originZoneId: originZoneId || undefined,
      destinationZoneId: destinationZoneId || undefined,
      zoneIds: [
        ...(originZoneId ? [originZoneId] : []),
        ...(destinationZoneId ? [destinationZoneId] : []),
      ],
      pickupZipCode: pickupZip || undefined,
      dropoffZipCode: dropoffZip || undefined,
      vehicleTypeId: selectedVehicleId,
      vehicleType: selectedVehicleId,
      vehicleTier: selectedVehicleId,
      isAirportPickup,
      isAirportTrip: isAirportPickup,
    }),
    [
      distanceMiles,
      durationMinutes,
      passengers,
      intermediateStops,
      carSeatsCount,
      curbWaitMinutes,
      delayMinutes,
      pickupDate,
      pickupTime,
      isHourly,
      hourlyHours,
      corporateAccountId,
      originZoneId,
      destinationZoneId,
      pickupZip,
      dropoffZip,
      selectedVehicleId,
      isAirportPickup,
    ]
  );

  const configOverride: Partial<PricingConfig> = useMemo(
    () => ({
      tariffs,
      activeTariffId: simulationTariffMode === 'auto' ? undefined : simulationTariffMode,
      namedPricingRules: rules,
      universalExtras,
      surchargesCatalog: surcharges,
    }),
    [tariffs, simulationTariffMode, rules, universalExtras, surcharges]
  );

  // Selected vehicle calculation
  const calculationResult = useMemo(() => {
    try {
      return calculateTripPricing(baseInput, configOverride);
    } catch (err) {
      console.error('Simulator calculation failed:', err);
      return null;
    }
  }, [baseInput, configOverride]);

  // All-Vehicle live comparison using exact Admin config
  const allVehiclePrices = useMemo(() => {
    return simulatorVehicles.map((v) => {
      try {
        const res = calculateTripPricing(
          {
            ...baseInput,
            vehicleTypeId: v.id,
            vehicleType: v.id,
            vehicleTier: v.id,
          },
          configOverride
        );
        return { id: v.id, label: v.label, totalFare: res.pricing.totalFare };
      } catch {
        return { id: v.id, label: v.label, totalFare: 0 };
      }
    });
  }, [simulatorVehicles, baseInput, configOverride]);

  const pricing = calculationResult?.pricing;
  const ctx = calculationResult?.context;
  const breakdownItems = pricing?.breakdown || [];

  return (
    <div className={`flex flex-col h-full bg-white lg:border-l border-slate-200 text-slate-900 ${className}`}>
      {/* Simulator Header */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 flex items-center justify-between bg-white/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
              <span>Live Fare Preview</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                LIVE
              </span>
              {hasUnsavedDraft && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  UNSAVED DRAFT
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500">Test fares across Rates, Extras, Surcharges &amp; Rules</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Rate Model Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Active Tariff Target
            </label>
            <span className="text-[10px] text-emerald-700 font-semibold truncate max-w-[160px]">
              {simulationTariffMode === 'auto'
                ? 'Smart Auto Match'
                : activeTariffs.find((t) => t.id === simulationTariffMode)?.name || simulationTariffMode}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSimulationTariffMode('auto')}
              className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-md transition-all text-center truncate cursor-pointer inline-flex items-center justify-center gap-1 ${
                simulationTariffMode === 'auto'
                  ? 'bg-slate-800 text-white shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-900 font-medium'
              }`}
            >
              <BoltIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Auto</span>
            </button>
            {activeTariffs.map((t) => {
              const isSelected = simulationTariffMode === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSimulationTariffMode(t.id);
                    if (t.id === 'tariff-airport-flat' || t.name.toLowerCase().includes('airport')) {
                      setIsAirportPickup(true);
                    } else if (t.id === 'tariff-point-to-point-meter') {
                      setIsAirportPickup(false);
                    }
                  }}
                  className={`flex-1 min-w-[78px] py-1.5 px-2 rounded-md transition-all text-center truncate cursor-pointer ${
                    isSelected
                      ? t.id === 'tariff-airport-flat' || t.name.toLowerCase().includes('airport')
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-slate-700 hover:text-slate-900 font-medium'
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preset Selector */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
            Quick Scenarios
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('airport')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <PlaneIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">Airport STL (20 mi)</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('meter')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <CarIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="truncate">City METER (10 mi)</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('spirit')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <PlaneLandingIcon className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">Airport Floor (5.5 mi)</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('medical')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Medical Trip</span>
            </button>
          </div>
        </div>

        {/* Fare Summary Display Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white border border-emerald-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-emerald-900 font-bold uppercase tracking-wide">
              Estimated Fare
            </span>
            <span className="text-2xl font-black tracking-tight text-emerald-900 font-mono">
              ${pricing ? pricing.totalFare.toFixed(2) : '0.00'}
            </span>
          </div>

          <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex flex-wrap gap-1.5 items-center">
            {ctx?.tariffProfileName ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                <CarIcon className="w-3 h-3" />
                {ctx.tariffProfileName}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">No Tariff Profile</span>
            )}

            {ctx?.appliedRuleNames &&
              ctx.appliedRuleNames.map((rName: string, idx: number) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 border border-purple-200"
                >
                  <ShieldCheckIcon className="w-2.5 h-2.5" />
                  {rName}
                </span>
              ))}
          </div>
        </div>

        {/* Real Admin Fleet Vehicle Comparison & Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
            Fleet Vehicle Price Comparison
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {allVehiclePrices.map((v) => {
              const isSelected = selectedVehicleId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`p-2 rounded-lg text-xs border text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                    isSelected
                      ? 'bg-blue-50 text-blue-900 border-blue-500 ring-1 ring-blue-500 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <span className="truncate">{v.label}</span>
                  <span className="font-mono font-extrabold text-slate-900 shrink-0">
                    ${v.totalFare.toFixed(0)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Canonical Customer Price Breakdown (Exact match to /book) */}
        {pricing && (
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
              Customer Price Breakdown
            </span>
            {breakdownItems.map((item) => {
              const isDiscount = item.category === 'discount' || item.amount < 0;
              const isBase = item.category === 'base';
              return (
                <div
                  key={item.id}
                  className={`flex justify-between gap-2 ${
                    isDiscount ? 'text-rose-700' : isBase ? 'text-slate-900 font-semibold' : 'text-slate-600'
                  }`}
                >
                  <span className="truncate">{isBase ? 'Base Fare' : item.label}</span>
                  <span className="font-mono font-semibold shrink-0">
                    {isDiscount
                      ? `-$${Math.abs(item.amount).toFixed(2)}`
                      : `$${item.amount.toFixed(2)}`}
                  </span>
                </div>
              );
            })}

            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
              <span>Estimated Total:</span>
              <span className="text-emerald-800 font-extrabold text-sm font-mono">
                ${pricing.totalFare.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Granular Trip Parameters */}
        <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
            Trip Inputs
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Distance (mi)</label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={distanceMiles}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDistanceMiles(parseFloat(e.target.value) || 0)
                }
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-medium"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Duration (min)</label>
              <Input
                type="number"
                step="1"
                min="0"
                value={durationMinutes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDurationMinutes(parseFloat(e.target.value) || 0)
                }
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Pickup Zip</label>
              <Input
                type="text"
                placeholder="e.g. 63005"
                value={pickupZip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPickupZip(e.target.value)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Dropoff Zip</label>
              <Input
                type="text"
                placeholder="e.g. 63011"
                value={dropoffZip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDropoffZip(e.target.value)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-1">Corporate Account</label>
            <select
              value={corporateAccountId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCorporateAccountId(e.target.value)}
              className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
            >
              <option value="">None (Retail / Public)</option>
              {activeCorporateAccounts.map((corp) => (
                <option key={corp.id} value={corp.id}>
                  {corp.companyName}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs text-slate-700 font-medium flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isHourly}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsHourly(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              Hourly Dedicated Charter
            </label>
            {isHourly && (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-16">
                  <Input
                    type="number"
                    min="1"
                    value={hourlyHours}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setHourlyHours(parseInt(e.target.value, 10) || 1)
                    }
                    className="h-7 text-xs bg-white border-slate-300 text-slate-900 text-center font-bold px-1.5"
                  />
                </div>
                <span className="text-[11px] text-slate-500">hrs</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-700 font-medium flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={originZoneId === 'zone-lambert-airport' || isAirportPickup}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const checked = e.target.checked;
                  setIsAirportPickup(checked);
                  setOriginZoneId(checked ? 'zone-lambert-airport' : '');
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              Airport Trip (STL / SUS)
            </label>
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-2">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
              Universal Extras
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Passengers</label>
                <Input
                  type="number"
                  min="1"
                  max="14"
                  value={passengers}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPassengers(parseInt(e.target.value, 10) || 1)
                  }
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Stops</label>
                <Input
                  type="number"
                  min="0"
                  value={intermediateStops}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setIntermediateStops(parseInt(e.target.value, 10) || 0)
                  }
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Child Seats</label>
                <Input
                  type="number"
                  min="0"
                  value={carSeatsCount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCarSeatsCount(parseInt(e.target.value, 10) || 0)
                  }
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Curb Wait (min)</label>
                <Input
                  type="number"
                  min="0"
                  value={curbWaitMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCurbWaitMinutes(parseInt(e.target.value, 10) || 0)
                  }
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Traffic Delay (min)</label>
                <Input
                  type="number"
                  min="0"
                  value={delayMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDelayMinutes(parseInt(e.target.value, 10) || 0)
                  }
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Pickup Date</label>
                <Input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono px-2"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Pickup Time</label>
                <Input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono px-2"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Pickup Zone</label>
                <select
                  value={originZoneId}
                  onChange={(e) => setOriginZoneId(e.target.value)}
                  className="w-full h-8 text-[11px] rounded-md bg-white border border-slate-300 px-1.5"
                >
                  <option value="">Any Zone</option>
                  {availableZones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Dropoff Zone</label>
                <select
                  value={destinationZoneId}
                  onChange={(e) => setDestinationZoneId(e.target.value)}
                  className="w-full h-8 text-[11px] rounded-md bg-white border border-slate-300 px-1.5"
                >
                  <option value="">Any Zone</option>
                  {availableZones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Applied Rules & Surcharges (Explain This Fare) */}
        {ctx?.firewallTrace && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowFirewallTrace(!showFirewallTrace)}
              className="w-full flex items-center justify-between text-xs text-slate-700 hover:text-slate-950 py-2 px-3 rounded-lg bg-blue-50/70 border border-blue-200 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-bold text-blue-900">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600" />
                Applied Rules &amp; Surcharges ({ctx.firewallTrace.ruleDecisions.filter((r) => r.matched).length} matched)
              </span>
              <ChevronRightIcon
                className={`w-3.5 h-3.5 text-blue-600 transform transition-transform ${showFirewallTrace ? 'rotate-90' : ''}`}
              />
            </button>

            {showFirewallTrace && (
              <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-2.5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Pricing Rules Checked (Top-Down)
                  </span>
                  <div className="space-y-1">
                    {ctx.firewallTrace.ruleDecisions.map((rd) => (
                      <div key={rd.ruleId} className="flex items-start justify-between gap-2 text-[10px]">
                        <span className={rd.matched ? 'font-bold text-emerald-800' : 'text-slate-500'}>
                          P{rd.priority} {rd.ruleName}
                        </span>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${
                            rd.matched
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200/70 text-slate-500'
                          }`}
                        >
                          {rd.matched ? 'MATCH' : rd.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Surcharges Status
                  </span>
                  <div className="space-y-1">
                    {ctx.firewallTrace.surchargeDecisions.map((sd) => (
                      <div key={sd.surchargeId} className="flex items-start justify-between gap-2 text-[10px]">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">{sd.surchargeName}</span>
                          <span className="text-[9px] text-slate-500 block">{sd.reason}</span>
                        </div>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded font-bold uppercase ${
                            sd.status === 'applied'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sd.status === 'waived'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-200/70 text-slate-500'
                          }`}
                        >
                          {sd.status === 'applied' ? `+$${sd.amount.toFixed(2)}` : sd.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Trail Accordion */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAuditTrail(!showAuditTrail)}
            className="w-full flex items-center justify-between text-xs text-slate-600 hover:text-slate-900 py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <SlidersIcon className="w-3.5 h-3.5 text-slate-500" />
              Engine Calculation Log ({ctx?.auditTrail.length || 0} steps)
            </span>
            <ChevronRightIcon
              className={`w-3.5 h-3.5 transform transition-transform ${showAuditTrail ? 'rotate-90' : ''}`}
            />
          </button>

          {showAuditTrail && ctx?.auditTrail && (
            <div className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[10px] space-y-2 max-h-56 overflow-y-auto custom-scrollbar text-slate-300">
              {ctx.auditTrail.map((step, idx: number) => (
                <div key={idx} className="border-b border-slate-800 pb-1.5 last:border-0 last:pb-0">
                  <div className="text-emerald-400 font-semibold break-words">
                    Step {step.stepNumber}: {step.stepName}
                  </div>
                  <div className="text-slate-400 whitespace-pre-wrap break-words">{step.description}</div>
                  <div className="text-slate-500 text-[9px] mt-0.5 flex justify-between">
                    <span>
                      Delta: {step.appliedDelta >= 0 ? `+$${step.appliedDelta.toFixed(2)}` : `-$${Math.abs(step.appliedDelta).toFixed(2)}`}
                    </span>
                    <span>Total: ${step.runningSubtotal.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
