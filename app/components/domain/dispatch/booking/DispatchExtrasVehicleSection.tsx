import React from 'react';
import type { TripPricing } from '../../../../core/types';
import type {
  OversizedBagCategory,
  UniversalExtrasConfig,
} from '../../../../core/types/config';
import {
  isVehicleChoiceSelected,
  resolveVehicleEngineId,
  stepLuggageCount,
  type BookingVehicleChoice as VehicleChoice,
  type DispatchVehicleOption,
  type VehicleCapacityInfo,
} from '../../../../core/hooks/booking';
import {
  LuggageIcon,
  MusicNoteIcon,
  PawPrintIcon,
  UserIcon,
  VolumeXIcon,
} from '../../../ui/Icons';

export interface DispatchExtrasVehicleSectionProps {
  isCompleted: boolean;
  isCancelled: boolean;
  passengers: number;
  carryOnBags: number;
  setCarryOnBags: (val: number) => void;
  checkedBags: number;
  setCheckedBags: (val: number) => void;
  setBags: (val: number) => void;
  totalMaxPassengers: number;
  totalMaxBags: number;
  hasOversizedLuggage: boolean;
  setHasOversizedLuggage: (val: boolean) => void;
  oversizedBags: Record<string, number>;
  setOversizedBags: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  oversizedLuggageNotes: string;
  setOversizedLuggageNotes: (val: string) => void;
  oversizedCategories: OversizedBagCategory[];
  totalOversizedCount: number;
  carSeats: boolean;
  rearFacingCount: number;
  setRearFacingCount: React.Dispatch<React.SetStateAction<number>>;
  frontFacingCount: number;
  setFrontFacingCount: React.Dispatch<React.SetStateAction<number>>;
  boosterCount: number;
  setBoosterCount: React.Dispatch<React.SetStateAction<number>>;
  totalCarSeats: number;
  carSeatLimits: {
    maxRearFacing: number;
    maxFrontFacing: number;
    maxBooster: number;
    maxTotalCarSeats: number;
  };
  universalExtrasConfig: UniversalExtrasConfig;
  selectedCustomExtras: Record<string, number>;
  setSelectedCustomExtras: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  showSpecialRequests: boolean;
  setShowSpecialRequests: React.Dispatch<React.SetStateAction<boolean>>;
  specialRequestFlags: {
    petFriendly: boolean;
    quietRide: boolean;
    musicOk: boolean;
  };
  setSpecialRequestFlags: React.Dispatch<
    React.SetStateAction<{
      petFriendly: boolean;
      quietRide: boolean;
      musicOk: boolean;
    }>
  >;
  gateCode: string;
  setGateCode: (val: string) => void;
  selectedVehicles: Array<VehicleChoice>;
  dispatchVehicleOptions: DispatchVehicleOption[];
  vehicleCapacities: Record<string, VehicleCapacityInfo>;
  activeAdminVehicleIds: string[];
  vehicleQuotes: Record<string, TripPricing>;
  onIncrementPassengers: () => void;
  onDecrementPassengers: () => void;
  onToggleCarSeats: (checked: boolean) => void;
  onAddVehicle: () => void;
  onRemoveVehicle: (index: number) => void;
  onUpdateVehicleChoice: (index: number, choice: VehicleChoice) => void;
}

export function DispatchExtrasVehicleSection({
  isCompleted,
  isCancelled,
  passengers,
  carryOnBags,
  setCarryOnBags,
  checkedBags,
  setCheckedBags,
  setBags,
  totalMaxPassengers,
  totalMaxBags,
  hasOversizedLuggage,
  setHasOversizedLuggage,
  oversizedBags,
  setOversizedBags,
  oversizedLuggageNotes,
  setOversizedLuggageNotes,
  oversizedCategories,
  totalOversizedCount,
  carSeats,
  rearFacingCount,
  setRearFacingCount,
  frontFacingCount,
  setFrontFacingCount,
  boosterCount,
  setBoosterCount,
  totalCarSeats,
  carSeatLimits,
  universalExtrasConfig,
  selectedCustomExtras,
  setSelectedCustomExtras,
  showSpecialRequests,
  setShowSpecialRequests,
  specialRequestFlags,
  setSpecialRequestFlags,
  gateCode,
  setGateCode,
  selectedVehicles,
  dispatchVehicleOptions,
  vehicleCapacities,
  activeAdminVehicleIds,
  vehicleQuotes,
  onIncrementPassengers,
  onDecrementPassengers,
  onToggleCarSeats,
  onAddVehicle,
  onRemoveVehicle,
  onUpdateVehicleChoice,
}: DispatchExtrasVehicleSectionProps) {
  return (
    <>
      {/* Trip Details (Pax, Bags, Car Seats with 3-tier counters) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
            Trip Details
          </label>
          <span className="text-[10px] text-slate-500 font-medium">
            Capacity: Max {totalMaxPassengers}{' '}
            {totalMaxPassengers === 1 ? 'Passenger' : 'Passengers'} • {totalMaxBags}{' '}
            {totalMaxBags === 1 ? 'Bag' : 'Bags'}
          </span>
        </div>

        <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2.5">
          {/* Compact 3-Column Steppers: Passengers, Carry-on & Checked */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Passengers */}
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1.5 min-w-0">
              <div className="flex items-center justify-center gap-1 text-slate-700 text-[11px] min-w-0">
                <UserIcon className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="font-bold text-slate-800 truncate">Passengers</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label="Decrease passengers"
                  disabled={passengers <= 1}
                  onClick={onDecrementPassengers}
                  className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                >
                  &minus;
                </button>
                <span className="min-w-[1.25rem] text-center font-extrabold text-xs text-slate-900">
                  {passengers}
                </span>
                <button
                  type="button"
                  aria-label="Increase passengers"
                  onClick={onIncrementPassengers}
                  title="Increments passengers. Auto-upgrades vehicles if capacity exceeded."
                  className="w-6 h-6 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 text-xs leading-none cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </div>

            {/* Carry-on Bags */}
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1.5 min-w-0">
              <div className="flex items-center justify-center gap-1 text-slate-700 text-[11px] min-w-0">
                <LuggageIcon className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="font-bold text-slate-800 truncate">Carry-on</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label="Decrease carry-on bags"
                  disabled={carryOnBags <= 0}
                  onClick={() => {
                    const stepped = stepLuggageCount(
                      carryOnBags,
                      checkedBags,
                      'carryOn',
                      -1,
                      totalMaxBags
                    );
                    setCarryOnBags(stepped.carryOnBags);
                    setBags(stepped.bags);
                  }}
                  className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                >
                  &minus;
                </button>
                <span className="min-w-[1.25rem] text-center font-extrabold text-xs text-slate-900">
                  {carryOnBags}
                </span>
                <button
                  type="button"
                  aria-label="Increase carry-on bags"
                  disabled={carryOnBags + checkedBags >= totalMaxBags}
                  onClick={() => {
                    const stepped = stepLuggageCount(
                      carryOnBags,
                      checkedBags,
                      'carryOn',
                      1,
                      totalMaxBags
                    );
                    setCarryOnBags(stepped.carryOnBags);
                    setBags(stepped.bags);
                  }}
                  className="w-6 h-6 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </div>

            {/* Checked Bags */}
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1.5 min-w-0">
              <div className="flex items-center justify-center gap-1 text-slate-700 text-[11px] min-w-0">
                <LuggageIcon className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="font-bold text-slate-800 truncate">Checked</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label="Decrease checked bags"
                  disabled={checkedBags <= 0}
                  onClick={() => {
                    const stepped = stepLuggageCount(
                      carryOnBags,
                      checkedBags,
                      'checked',
                      -1,
                      totalMaxBags
                    );
                    setCheckedBags(stepped.checkedBags);
                    setBags(stepped.bags);
                  }}
                  className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                >
                  &minus;
                </button>
                <span className="min-w-[1.25rem] text-center font-extrabold text-xs text-slate-900">
                  {checkedBags}
                </span>
                <button
                  type="button"
                  aria-label="Increase checked bags"
                  disabled={carryOnBags + checkedBags >= totalMaxBags}
                  onClick={() => {
                    const stepped = stepLuggageCount(
                      carryOnBags,
                      checkedBags,
                      'checked',
                      1,
                      totalMaxBags
                    );
                    setCheckedBags(stepped.checkedBags);
                    setBags(stepped.bags);
                  }}
                  className="w-6 h-6 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Extras Row (Oversized Cargo + Car Seats) */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-1 gap-1.5">
              <label
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer select-none transition-colors ${
                  hasOversizedLuggage
                    ? 'bg-blue-50/70 border-blue-300'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                }`}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={hasOversizedLuggage}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasOversizedLuggage(checked);
                      if (!checked) {
                        setOversizedBags({});
                        setOversizedLuggageNotes('');
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Oversized Cargo (Golf / Skis)</span>
                </span>
                {hasOversizedLuggage && totalOversizedCount > 0 && (
                  <span className="text-[10px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200">
                    {totalOversizedCount} item{totalOversizedCount > 1 ? 's' : ''}
                  </span>
                )}
              </label>

              {/* Expanded Oversized Cargo Panel */}
              {hasOversizedLuggage && (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 animate-in fade-in duration-150">
                  <div className="text-[10px] text-slate-500 font-medium">
                    Select oversized equipment so the right cargo space is dispatched:
                  </div>
                  <div className="space-y-1">
                    {oversizedCategories.map((cat) => {
                      const count = oversizedBags[cat.id] || 0;
                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between gap-2 text-[11px] bg-white px-2 py-1.5 rounded border border-slate-200"
                        >
                          <div className="flex items-center gap-1 flex-wrap min-w-0">
                            <span className="font-semibold text-slate-800">{cat.label}</span>
                            {cat.requiresUpgrade && (
                              <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                SUV/Van
                              </span>
                            )}
                            {cat.fee > 0 && (
                              <span className="text-[10px] font-bold font-mono text-emerald-700">
                                +${cat.fee.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              aria-label={`Decrease ${cat.label}`}
                              disabled={count <= 0}
                              onClick={() =>
                                setOversizedBags((prev) => ({
                                  ...prev,
                                  [cat.id]: Math.max(0, (prev[cat.id] || 0) - 1),
                                }))
                              }
                              className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                            >
                              &minus;
                            </button>
                            <span className="w-4 text-center font-bold text-slate-800">{count}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${cat.label}`}
                              disabled={count >= (cat.maxCount || 4)}
                              onClick={() =>
                                setOversizedBags((prev) => ({
                                  ...prev,
                                  [cat.id]: Math.min(cat.maxCount || 4, (prev[cat.id] || 0) + 1),
                                }))
                              }
                              className="w-5 h-5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    placeholder="Additional cargo notes (e.g. dimensions, fragile instruments)"
                    value={oversizedLuggageNotes}
                    onChange={(e) => setOversizedLuggageNotes(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <label
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer select-none transition-colors ${
                  carSeats
                    ? 'bg-amber-50/80 border-amber-300'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                }`}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={carSeats}
                    onChange={(e) => onToggleCarSeats(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Child Safety Seats</span>
                </span>
                {carSeats && (
                  <span className="text-[10px] font-bold text-amber-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                    {totalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                  </span>
                )}
              </label>
            </div>

            {/* 3 Car Seat Counters: Rear-Facing, Front-Facing, Booster */}
            {carSeats && (
              <div className="p-2 bg-amber-50/60 border border-amber-200 rounded-lg space-y-1.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="text-slate-700">
                    <span className="font-semibold">Rear-Facing</span> (Infant)
                    <span className="text-[10px] text-slate-400 ml-1">
                      max {carSeatLimits.maxRearFacing}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRearFacingCount((c) => Math.max(0, c - 1))}
                      className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold text-slate-800">
                      {rearFacingCount}
                    </span>
                    <button
                      type="button"
                      disabled={
                        rearFacingCount >= carSeatLimits.maxRearFacing ||
                        totalCarSeats >= carSeatLimits.maxTotalCarSeats
                      }
                      onClick={() =>
                        setRearFacingCount((c) => Math.min(carSeatLimits.maxRearFacing, c + 1))
                      }
                      className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <div className="text-slate-700">
                    <span className="font-semibold">Front-Facing</span> (Toddler)
                    <span className="text-[10px] text-slate-400 ml-1">
                      max {carSeatLimits.maxFrontFacing}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFrontFacingCount((c) => Math.max(0, c - 1))}
                      className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold text-slate-800">
                      {frontFacingCount}
                    </span>
                    <button
                      type="button"
                      disabled={
                        frontFacingCount >= carSeatLimits.maxFrontFacing ||
                        totalCarSeats >= carSeatLimits.maxTotalCarSeats
                      }
                      onClick={() =>
                        setFrontFacingCount((c) => Math.min(carSeatLimits.maxFrontFacing, c + 1))
                      }
                      className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <div className="text-slate-700">
                    <span className="font-semibold">Booster</span> (Youth)
                    <span className="text-[10px] text-slate-400 ml-1">
                      max {carSeatLimits.maxBooster}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBoosterCount((c) => Math.max(0, c - 1))}
                      className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold text-slate-800">{boosterCount}</span>
                    <button
                      type="button"
                      disabled={
                        boosterCount >= carSeatLimits.maxBooster ||
                        totalCarSeats >= carSeatLimits.maxTotalCarSeats
                      }
                      onClick={() =>
                        setBoosterCount((c) => Math.min(carSeatLimits.maxBooster, c + 1))
                      }
                      className="w-5 h-5 rounded bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Custom Bookable Extras */}
            {universalExtrasConfig?.customExtras &&
              universalExtrasConfig.customExtras.filter((e) => e.isActive).length > 0 && (
                <div className="space-y-1 pt-1.5 border-t border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Extras &amp; Add-Ons
                  </span>
                  {universalExtrasConfig.customExtras
                    .filter((e) => e.isActive)
                    .map((extra) => {
                      const qty = selectedCustomExtras[extra.id] || 0;
                      const maxQty = extra.isPerUnit ? 4 : 1;
                      return (
                        <div key={extra.id} className="flex items-center justify-between text-[11px]">
                          <div className="min-w-0 pr-2">
                            <span className="font-semibold text-slate-700">{extra.name}</span>
                            <span className="text-[10px] font-mono text-slate-500 ml-1">
                              (+${extra.fee.toFixed(2)})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCustomExtras((prev) => {
                                  const next = { ...prev };
                                  const nq = Math.max(0, (next[extra.id] || 0) - 1);
                                  if (nq === 0) delete next[extra.id];
                                  else next[extra.id] = nq;
                                  return next;
                                })
                              }
                              className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                            >
                              -
                            </button>
                            <span className="w-4 text-center font-bold text-slate-800">{qty}</span>
                            <button
                              type="button"
                              disabled={qty >= maxQty}
                              onClick={() =>
                                setSelectedCustomExtras((prev) => ({
                                  ...prev,
                                  [extra.id]: Math.min(maxQty, (prev[extra.id] || 0) + 1),
                                }))
                              }
                              className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

            {/* Collapsible Special Requests & Gate Code Toggle */}
            <div className="pt-1.5 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => setShowSpecialRequests((prev) => !prev)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span>Special Requests &amp; Gate Code</span>
                  <span className="font-normal text-slate-400">(Optional)</span>
                  {(Object.values(specialRequestFlags).some(Boolean) ||
                    Boolean(gateCode.trim())) && (
                    <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      {Object.values(specialRequestFlags).filter(Boolean).length +
                        (gateCode.trim() ? 1 : 0)}{' '}
                      active
                    </span>
                  )}
                </span>
                <span className="text-blue-600 font-bold text-[10px]">
                  {showSpecialRequests ? 'Hide ▲' : 'Add ▾'}
                </span>
              </button>

              {showSpecialRequests && (
                <div className="space-y-2 p-2 bg-slate-50 border border-slate-200 rounded-lg animate-in fade-in duration-150">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { key: 'petFriendly', label: 'Pet-Friendly', Icon: PawPrintIcon },
                        { key: 'quietRide', label: 'Quiet Ride', Icon: VolumeXIcon },
                        { key: 'musicOk', label: 'Music OK', Icon: MusicNoteIcon },
                      ] as const
                    ).map((item) => {
                      const active = specialRequestFlags[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() =>
                            setSpecialRequestFlags((prev) => ({
                              ...prev,
                              [item.key]: !prev[item.key],
                            }))
                          }
                          className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <item.Icon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                      Subdivision / Gate Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. #1234 or Call box"
                      value={gateCode}
                      onChange={(e) => setGateCode(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vehicles (Multi-Vehicle Selector with Inline Choices & Add/Remove) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
            Vehicles ({selectedVehicles.length})
          </label>
          <button
            type="button"
            onClick={onAddVehicle}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
          >
            + Add Vehicle
          </button>
        </div>

        <div className="space-y-1.5">
          {selectedVehicles.map((vChoice, idx) => (
            <div
              key={idx}
              className="p-1.5 bg-white border border-slate-300 rounded-lg shadow-2xs flex items-center gap-2"
            >
              <span className="text-[10px] font-bold text-slate-400 w-5">#{idx + 1}</span>
              <div className="flex-1 flex flex-wrap gap-1 p-0.5 bg-slate-100 rounded">
                {dispatchVehicleOptions.map((opt) => {
                  const isSelected = isVehicleChoiceSelected(vChoice, opt.key, 'wheelchair');
                  const simulatedVehicles = [...selectedVehicles];
                  simulatedVehicles[idx] = opt.key;
                  const simulatedCapacity = simulatedVehicles.reduce(
                    (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
                    0
                  );
                  const isCapacityInsufficient = simulatedCapacity < passengers;

                  const engineId = resolveVehicleEngineId(opt.key, activeAdminVehicleIds);
                  const livePrice = vehicleQuotes[engineId]?.totalFare;

                  return (
                    <button
                      type="button"
                      key={opt.key}
                      disabled={isCapacityInsufficient || isCompleted || isCancelled}
                      onClick={() => onUpdateVehicleChoice(idx, opt.key)}
                      title={
                        isCapacityInsufficient
                          ? `${opt.label} fleet capacity (${simulatedCapacity}p) is insufficient for ${passengers} passengers. Requires larger vehicle or additional vehicles.`
                          : `${opt.label} (${opt.maxPassengers}p / ${opt.maxBags}b)${
                              livePrice ? ` • $${Math.ceil(livePrice)}` : ''
                            }`
                      }
                      className={`flex-1 min-w-[64px] py-1 text-center rounded text-[11px] font-bold transition-all truncate px-1.5 ${
                        isCapacityInsufficient
                          ? 'opacity-35 cursor-not-allowed bg-slate-100 text-slate-400'
                          : isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      <span>{opt.label}</span>{' '}
                      <span className="text-[9px] opacity-80">({opt.maxPassengers}p)</span>
                      {typeof livePrice === 'number' && livePrice > 0 && (
                        <span
                          className={`block text-[10px] font-mono font-extrabold leading-tight ${
                            isSelected ? 'text-blue-100' : 'text-emerald-700'
                          }`}
                        >
                          ${Math.ceil(livePrice)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedVehicles.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveVehicle(idx)}
                  className="p-1 text-slate-400 hover:text-red-500 rounded"
                  title="Remove vehicle"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
