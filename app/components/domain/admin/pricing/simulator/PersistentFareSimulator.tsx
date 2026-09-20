import React, { useState, useMemo } from 'react';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Badge } from '~/components/ui/Badge';
import {
  CarIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  SlidersIcon,
} from '~/components/ui/Icons';
import { calculateTripPricing } from '~/core/services/pricing/pipeline';
import type { PricingConfig, PricingInput } from '~/core/services/pricing/types';
import type { TariffProfile } from '~/core/types/tariff';
import type {
  NamedPricingRule,
  VehicleType,
  VehicleClass,
  UniversalExtrasConfig,
  SurchargesConfig,
} from '~/core/types/config';

export interface PersistentFareSimulatorProps {
  tariffs: TariffProfile[];
  rules: NamedPricingRule[];
  universalExtras: UniversalExtrasConfig;
  surcharges: SurchargesConfig;
  className?: string;
}

export function PersistentFareSimulator({
  tariffs,
  rules,
  universalExtras,
  surcharges,
  className = '',
}: PersistentFareSimulatorProps) {
  // Simulator input state
  const [simulationTariffMode, setSimulationTariffMode] = useState<
    'auto' | 'tariff-airport-flat' | 'tariff-point-to-point-meter'
  >('tariff-airport-flat');
  const [distanceMiles, setDistanceMiles] = useState<number>(20.0);
  const [durationMinutes, setDurationMinutes] = useState<number>(28);
  const [passengers, setPassengers] = useState<number>(1);
  const [intermediateStops, setIntermediateStops] = useState<number>(0);
  const [carSeatsCount, setCarSeatsCount] = useState<number>(0);
  const [curbWaitMinutes, setCurbWaitMinutes] = useState<number>(0);
  const [isHourly, setIsHourly] = useState<boolean>(false);
  const [hourlyHours, setHourlyHours] = useState<number>(2);
  const [corporateAccountId, setCorporateAccountId] = useState<string>('');
  const [originZoneId, setOriginZoneId] = useState<string>('zone-lambert-airport');
  const [destinationZoneId, setDestinationZoneId] = useState<string>('zone-chesterfield-valley');
  const [pickupZip, setPickupZip] = useState<string>('63145');
  const [dropoffZip, setDropoffZip] = useState<string>('63005');
  const [vehicleType, setVehicleType] = useState<VehicleType>('sedan');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('standard');
  const [isAirportPickup, setIsAirportPickup] = useState<boolean>(true);
  const [showAuditTrail, setShowAuditTrail] = useState<boolean>(false);

  // Quick Preset Handlers
  const applyPreset = (preset: 'airport' | 'meter' | 'spirit' | 'medical') => {
    switch (preset) {
      case 'airport':
        setSimulationTariffMode('tariff-airport-flat');
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
        setSimulationTariffMode('tariff-point-to-point-meter');
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
        setSimulationTariffMode('tariff-airport-flat');
        setDistanceMiles(6.0);
        setDurationMinutes(12);
        setPassengers(1);
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
        setSimulationTariffMode('tariff-point-to-point-meter');
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

  // Run live calculation pipeline
  const calculationResult = useMemo(() => {
    const input: PricingInput = {
      distanceMiles: Number(distanceMiles) || 0,
      durationMinutes: Number(durationMinutes) || 0,
      passengers: Number(passengers) || 1,
      intermediateStopsCount: Number(intermediateStops) || 0,
      carSeatsBreakdown: carSeatsCount > 0 ? { booster: carSeatsCount } : undefined,
      curbWaitMinutes: Number(curbWaitMinutes) || 0,
      isHourlyBooking: isHourly,
      hourlyDurationHours: isHourly ? Number(hourlyHours) || 2 : undefined,
      corporateAccountId: corporateAccountId || undefined,
      originZoneId: originZoneId || undefined,
      destinationZoneId: destinationZoneId || undefined,
      zoneIds: [
        ...(originZoneId ? [originZoneId] : []),
        ...(destinationZoneId ? [destinationZoneId] : []),
      ],
      pickupZipCode: pickupZip || undefined,
      dropoffZipCode: dropoffZip || undefined,
      vehicleType,
      vehicleTier: vehicleType === 'suv' ? 'xl' : vehicleType === 'van' ? 'wheelchair' : 'standard',
      vehicleClass,
      isAirportPickup,
    };

    const configOverride: Partial<PricingConfig> = {
      tariffs,
      activeTariffId: simulationTariffMode === 'auto' ? undefined : simulationTariffMode,
      namedPricingRules: rules,
      universalExtras,
      surchargesCatalog: surcharges,
    };

    try {
      return calculateTripPricing(input, configOverride);
    } catch (err) {
      console.error('Simulator calculation failed:', err);
      return null;
    }
  }, [
    simulationTariffMode,
    distanceMiles,
    durationMinutes,
    passengers,
    intermediateStops,
    carSeatsCount,
    curbWaitMinutes,
    isHourly,
    hourlyHours,
    corporateAccountId,
    originZoneId,
    destinationZoneId,
    pickupZip,
    dropoffZip,
    vehicleType,
    vehicleClass,
    isAirportPickup,
    tariffs,
    rules,
    universalExtras,
    surcharges,
  ]);

  const ctx = calculationResult?.context;
  const isSmokeHouseAccount = corporateAccountId === 'corp-smoke-house' || corporateAccountId === 'smoke-house';

  return (
    <div className={`flex flex-col h-full bg-white border-l border-slate-200 text-slate-900 ${className}`}>
      {/* Simulator Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Fare Simulator
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                LIVE
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">Real-time 4-pillar audit engine</p>
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
            <span className="text-[10px] text-emerald-700 font-semibold">
              {simulationTariffMode === 'tariff-airport-flat'
                ? 'Airport Flat ($51 @ 20mi)'
                : simulationTariffMode === 'tariff-point-to-point-meter'
                ? 'Statutory METER'
                : 'Smart Auto Match'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setSimulationTariffMode('tariff-airport-flat');
                setIsAirportPickup(true);
              }}
              className={`py-1.5 px-2 rounded-md transition-all text-center truncate cursor-pointer ${
                simulationTariffMode === 'tariff-airport-flat'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-900 font-medium'
              }`}
            >
              ✈️ Airport
            </button>
            <button
              type="button"
              onClick={() => {
                setSimulationTariffMode('tariff-point-to-point-meter');
                setIsAirportPickup(false);
              }}
              className={`py-1.5 px-2 rounded-md transition-all text-center truncate cursor-pointer ${
                simulationTariffMode === 'tariff-point-to-point-meter'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-900 font-medium'
              }`}
            >
              ⏱️ METER
            </button>
            <button
              type="button"
              onClick={() => setSimulationTariffMode('auto')}
              className={`py-1.5 px-2 rounded-md transition-all text-center truncate cursor-pointer ${
                simulationTariffMode === 'auto'
                  ? 'bg-slate-800 text-white shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-900 font-medium'
              }`}
            >
              ⚡ Auto
            </button>
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
              <span>✈️</span>
              <span className="truncate">Airport STL</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('meter')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <span>🚕</span>
              <span className="truncate">City METER</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('spirit')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <span>🛬</span>
              <span className="truncate">Spirit SUS</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('medical')}
              className="px-2.5 py-1.5 text-xs text-left rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-colors flex items-center gap-1.5 truncate cursor-pointer font-medium"
            >
              <span>🏥</span>
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
            <span className="text-2xl font-black tracking-tight text-emerald-900">
              ${ctx?.totalFare !== undefined ? ctx.totalFare.toFixed(2) : '0.00'}
            </span>
          </div>

          {/* Matched Profile & Rule tags */}
          <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex flex-wrap gap-1.5 items-center">
            {ctx?.tariffProfileName ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                <CarIcon className="w-3 h-3" />
                {ctx.tariffProfileName}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">No Tariff Profile</span>
            )}

            {ctx?.appliedRuleNames && ctx.appliedRuleNames.map((rName: string, idx: number) => (
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

        {/* Granular Trip Parameters */}
        <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
            Trip Inputs
          </span>

          {/* Distance & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Distance (mi)</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={distanceMiles}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDistanceMiles(parseFloat(e.target.value) || 0)}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDurationMinutes(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-medium"
              />
            </div>
          </div>

          {/* Quick Distance Presets */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider shrink-0">Preset:</span>
            {[
              { label: '10 mi ($28 floor)', miles: 10.0 },
              { label: '15 mi ($39)', miles: 15.0 },
              { label: '18.5 mi ($48)', miles: 18.5 },
              { label: '20 mi ($51)', miles: 20.0 },
              { label: '25 mi ($63)', miles: 25.0 },
              { label: '30 mi ($74)', miles: 30.0 },
            ].map((q) => (
              <button
                key={q.miles}
                type="button"
                onClick={() => setDistanceMiles(q.miles)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  Math.abs(distanceMiles - q.miles) < 0.05
                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 font-medium'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Vehicle Fleet Type Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-600 block">Vehicle Fleet Type</label>
              {vehicleType !== 'sedan' && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  +$10 Upgrade Fee
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'sedan', label: 'Sedan', sub: 'Standard' },
                { id: 'suv', label: 'SUV', sub: '+$10 Fee' },
                { id: 'van', label: 'Van / WAV', sub: '+$10 Fee' },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicleType(v.id as any)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border text-center transition-all cursor-pointer ${
                    vehicleType === v.id
                      ? 'bg-blue-50 text-blue-800 border-blue-400 ring-1 ring-blue-400'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div>{v.label}</div>
                  <div className="text-[9px] font-normal text-slate-500">{v.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Zip Codes (for Smoke House / Matrix matching) */}
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

          {/* Corporate Account */}
          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-1">Corporate Account</label>
            <select
              value={corporateAccountId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCorporateAccountId(e.target.value)}
              className="w-full h-8 text-xs rounded-md bg-white border border-slate-300 text-slate-900 px-2 font-medium"
            >
              <option value="">None (Retail / Public)</option>
              <option value="corp-smoke-house">Smoke House Chesterfield (2023 Agreement)</option>
            </select>
          </div>

          {/* Hourly Charter Checkbox */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
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
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="1"
                  value={hourlyHours}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHourlyHours(parseInt(e.target.value, 10) || 1)}
                  className="w-16 h-7 text-xs bg-white border-slate-300 text-slate-900 text-center font-bold"
                />
                <span className="text-[11px] text-slate-500">hrs</span>
              </div>
            )}
          </div>

          {/* Airport Origin Zone Toggle */}
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
              Lambert Airport Origin (STL)
            </label>
          </div>

          {/* Extras: Passengers, Stops, Seats, Curb Wait */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
              Universal Add-ons & Extras
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Passengers</label>
                <Input
                  type="number"
                  min="1"
                  max="14"
                  value={passengers}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassengers(parseInt(e.target.value, 10) || 1)}
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Waypoints / Stops</label>
                <Input
                  type="number"
                  min="0"
                  value={intermediateStops}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntermediateStops(parseInt(e.target.value, 10) || 0)}
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Child Safety Seats</label>
                <Input
                  type="number"
                  min="0"
                  value={carSeatsCount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCarSeatsCount(parseInt(e.target.value, 10) || 0)}
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-600 block mb-0.5">Curb Wait (min)</label>
                <Input
                  type="number"
                  min="0"
                  value={curbWaitMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurbWaitMinutes(parseInt(e.target.value, 10) || 0)}
                  className="h-7 text-xs bg-white border-slate-300 text-slate-900 font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Itemized Breakdown List */}
        {ctx && (
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
              Price Breakdown
            </span>
            <div className="flex justify-between text-slate-600">
              <span>Base / Tariff Subtotal:</span>
              <span className="text-slate-900 font-semibold">${ctx.subtotal.toFixed(2)}</span>
            </div>

            {ctx.surcharges.map((s, idx: number) => (
              <div key={idx} className="flex justify-between text-slate-600">
                <span className="truncate pr-2">+ {s.name}:</span>
                <span className="text-emerald-700 font-semibold">${s.amount.toFixed(2)}</span>
              </div>
            ))}

            {ctx.discounts.map((d, idx: number) => (
              <div key={idx} className="flex justify-between text-slate-600">
                <span className="truncate pr-2">- {d.name}:</span>
                <span className="text-rose-700 font-semibold">-${d.amount.toFixed(2)}</span>
              </div>
            ))}

            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
              <span>Total:</span>
              <span className="text-emerald-800 font-extrabold text-sm">${ctx.totalFare.toFixed(2)}</span>
            </div>
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
                  <div className="text-emerald-400 font-semibold">
                    Step {step.stepNumber}: {step.stepName}
                  </div>
                  <div className="text-slate-400 whitespace-pre-wrap">{step.description}</div>
                  <div className="text-slate-500 text-[9px] mt-0.5 flex justify-between">
                    <span>Delta: {step.appliedDelta >= 0 ? `+$${step.appliedDelta.toFixed(2)}` : `-$${Math.abs(step.appliedDelta).toFixed(2)}`}</span>
                    <span>Subtotal: ${step.runningSubtotal.toFixed(2)}</span>
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
