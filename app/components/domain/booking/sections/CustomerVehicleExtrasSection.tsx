import React from 'react';
import type {
  CustomerBookingConfig,
  OversizedBagCategory,
  UniversalExtrasConfig,
  VehicleTierConfig,
} from '../../../../core/types/config';

type CustomBookableExtraItem = NonNullable<UniversalExtrasConfig['customExtras']>[number];
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import {
  evaluateCustomerTierRestriction,
  isVehicleChoiceSelected,
  stepLuggageCount,
  type BookingVehicleChoice as CustomerVehicleChoice,
  type CustomerBookingFormState,
} from '../../../../core/hooks/booking';
import { CollapsibleSection } from '../../../ui/CollapsibleSection';
import { CheckIcon, LuggageIcon, PlusIcon, UserIcon } from '../../../ui/Icons';

export interface CustomerVehicleExtrasSectionProps {
  form: CustomerBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerBookingFormState>>;
  errors: Record<string, string>;
  bookingConfig: CustomerBookingConfig;
  activeVehicleTiers: VehicleTierConfig[];
  oversizedCategories: OversizedBagCategory[];
  bookableCustomExtras: CustomBookableExtraItem[];
  totalMaxPassengers: number;
  totalMaxBags: number;
  totalCarSeats: number;
  totalOversizedCount: number;
  oversizedRequiresUpgrade: boolean;
  onToggleCarSeats: (checked: boolean) => void;
  onAddVehicle: () => void;
  onRemoveVehicle: (index: number) => void;
  onUpdateVehicleChoice: (index: number, choice: CustomerVehicleChoice) => void;
  estimateTierDisplayFare: (tier: VehicleTierConfig) => number | null;
}

export function CustomerVehicleExtrasSection({
  form,
  setForm,
  errors,
  bookingConfig,
  activeVehicleTiers,
  oversizedCategories,
  bookableCustomExtras,
  totalMaxPassengers,
  totalMaxBags,
  totalCarSeats,
  totalOversizedCount,
  oversizedRequiresUpgrade,
  onToggleCarSeats,
  onAddVehicle,
  onRemoveVehicle,
  onUpdateVehicleChoice,
  estimateTierDisplayFare,
}: CustomerVehicleExtrasSectionProps) {
  const { carSeatLimits } = COMPANY_CONFIG;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
            2
          </span>
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
            Passengers, Luggage &amp; Vehicle
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-semibold">
          {form.passengers} {form.passengers === 1 ? 'Passenger' : 'Passengers'} &bull;{' '}
          {form.carryOnBags + form.checkedBags}{' '}
          {form.carryOnBags + form.checkedBags === 1 ? 'Bag' : 'Bags'}
        </span>
      </div>

      <div className="space-y-3">
        {/* Passengers & Bags Row — Compact 3-column stepper cards on all screens */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
          {/* Passengers Counter */}
          <div
            data-field="passengers"
            className={`p-2 sm:p-2.5 bg-slate-50 border ${
              errors.passengers ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
            } rounded-xl flex flex-col justify-between gap-1.5 min-w-0`}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 text-slate-700 text-[11px] sm:text-xs min-w-0">
              <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
              <span className="font-bold text-slate-800 truncate">Passengers</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Decrease passengers"
                disabled={form.passengers <= 1}
                onClick={() =>
                  setForm((prev) => ({ ...prev, passengers: Math.max(1, prev.passengers - 1) }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                &minus;
              </button>
              <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-slate-900">
                {form.passengers}
              </span>
              <button
                type="button"
                aria-label="Increase passengers"
                disabled={form.passengers >= totalMaxPassengers}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    passengers: Math.min(totalMaxPassengers, prev.passengers + 1),
                  }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Carry-on Bags */}
          <div
            data-field="bags"
            className={`p-2 sm:p-2.5 bg-slate-50 border ${
              errors.bags ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
            } rounded-xl flex flex-col justify-between gap-1.5 min-w-0`}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 text-slate-700 text-[11px] sm:text-xs min-w-0">
              <LuggageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
              <span className="font-bold text-slate-800 truncate">Carry-on</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Decrease carry-on bags"
                disabled={form.carryOnBags <= 0}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    ...stepLuggageCount(
                      prev.carryOnBags,
                      prev.checkedBags,
                      'carryOn',
                      -1,
                      totalMaxBags
                    ),
                  }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                &minus;
              </button>
              <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-slate-900">
                {form.carryOnBags}
              </span>
              <button
                type="button"
                aria-label="Increase carry-on bags"
                disabled={form.carryOnBags + form.checkedBags >= totalMaxBags}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    ...stepLuggageCount(
                      prev.carryOnBags,
                      prev.checkedBags,
                      'carryOn',
                      1,
                      totalMaxBags
                    ),
                  }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-sm leading-none cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Checked Bags */}
          <div className="p-2 sm:p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1.5 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-1 text-slate-700 text-[11px] sm:text-xs min-w-0">
              <LuggageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
              <span className="font-bold text-slate-800 truncate">Checked</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Decrease checked bags"
                disabled={form.checkedBags <= 0}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    ...stepLuggageCount(
                      prev.carryOnBags,
                      prev.checkedBags,
                      'checked',
                      -1,
                      totalMaxBags
                    ),
                  }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                &minus;
              </button>
              <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-slate-900">
                {form.checkedBags}
              </span>
              <button
                type="button"
                aria-label="Increase checked bags"
                disabled={form.carryOnBags + form.checkedBags >= totalMaxBags}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    ...stepLuggageCount(
                      prev.carryOnBags,
                      prev.checkedBags,
                      'checked',
                      1,
                      totalMaxBags
                    ),
                  }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-sm leading-none cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {errors.passengers && (
          <p className="text-xs text-red-600 font-semibold">{errors.passengers}</p>
        )}
        {errors.bags && <p className="text-xs text-red-600 font-semibold">{errors.bags}</p>}

        {/* Collapsible Extras Row (Oversized Cargo + Child Safety Seats) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {bookingConfig.allowOversizedLuggage !== false && (
            <label
              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                form.hasOversizedLuggage
                  ? 'bg-blue-50/70 border-blue-300'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.hasOversizedLuggage}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((prev) => ({
                      ...prev,
                      hasOversizedLuggage: checked,
                      oversizedBags: checked ? prev.oversizedBags : {},
                    }));
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Oversized Items (Golf / Skis)</span>
              </span>
              {form.hasOversizedLuggage && totalOversizedCount > 0 && (
                <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                  {totalOversizedCount} item{totalOversizedCount > 1 ? 's' : ''}
                </span>
              )}
            </label>
          )}

          {bookingConfig.allowChildSafetySeats && (
            <label
              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                form.carSeats
                  ? 'bg-amber-50/80 border-amber-300'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.carSeats}
                  onChange={(e) => onToggleCarSeats(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Child Safety Seats</span>
              </span>
              {form.carSeats && (
                <span className="text-[10px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                  {totalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                </span>
              )}
            </label>
          )}
        </div>

        {/* Expanded Oversized Items Panel */}
        <CollapsibleSection
          isOpen={bookingConfig.allowOversizedLuggage !== false && form.hasOversizedLuggage}
        >
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="text-[11px] text-slate-600 font-medium">
              Select oversized items so we send a car with enough space:
            </div>

            <div className="space-y-1.5">
              {oversizedCategories.map((cat) => {
                const count = form.oversizedBags[cat.id] || 0;
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-slate-200"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-800">{cat.label}</span>
                      {cat.requiresUpgrade && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          Requires SUV/Van
                        </span>
                      )}
                      {cat.fee > 0 && (
                        <span className="text-[11px] font-bold text-emerald-700">
                          +${cat.fee.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label={`Decrease ${cat.label}`}
                        disabled={count <= 0}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            oversizedBags: {
                              ...prev.oversizedBags,
                              [cat.id]: Math.max(0, (prev.oversizedBags[cat.id] || 0) - 1),
                            },
                          }))
                        }
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 text-sm disabled:opacity-40 cursor-pointer"
                      >
                        &minus;
                      </button>
                      <span className="w-5 text-center font-bold text-slate-900">{count}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${cat.label}`}
                        disabled={count >= (cat.maxCount || 4)}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            oversizedBags: {
                              ...prev.oversizedBags,
                              [cat.id]: Math.min(
                                cat.maxCount || 4,
                                (prev.oversizedBags[cat.id] || 0) + 1
                              ),
                            },
                          }))
                        }
                        className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 font-bold flex items-center justify-center text-blue-700 disabled:opacity-40 text-sm cursor-pointer"
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
              value={form.oversizedLuggageNotes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, oversizedLuggageNotes: e.target.value }))
              }
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
        </CollapsibleSection>

        {/* Expanded Car Seats Panel (Single deduplicated Missouri statutory notice) */}
        <CollapsibleSection isOpen={Boolean(bookingConfig.allowChildSafetySeats && form.carSeats)}>
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
            <div className="p-2.5 bg-amber-100/80 border border-amber-300/80 rounded-lg text-[11px] text-amber-950 leading-snug">
              <span className="font-bold">
                Missouri Child Passenger Safety Law (RSMo § 307.179):{' '}
              </span>
              Children under 4 or under 40 lbs require an approved car seat; children ages 4–7 and
              under 80 lbs or 4&apos;9&quot; require a booster seat. All fleet seats are
              commercially sanitized.
            </div>

            {[
              {
                label: 'Rear-Facing',
                sub: 'Infant (Birth–2 yrs, 5–40 lbs)',
                count: form.rearFacingCount,
                max: carSeatLimits.maxRearFacing,
                onDec: () =>
                  setForm((prev) => ({
                    ...prev,
                    rearFacingCount: Math.max(0, prev.rearFacingCount - 1),
                  })),
                onInc: () =>
                  setForm((prev) => ({
                    ...prev,
                    rearFacingCount: Math.min(
                      carSeatLimits.maxRearFacing,
                      prev.rearFacingCount + 1
                    ),
                  })),
              },
              {
                label: 'Front-Facing',
                sub: 'Toddler (5-pt harness, 22–65 lbs)',
                count: form.frontFacingCount,
                max: carSeatLimits.maxFrontFacing,
                onDec: () =>
                  setForm((prev) => ({
                    ...prev,
                    frontFacingCount: Math.max(0, prev.frontFacingCount - 1),
                  })),
                onInc: () =>
                  setForm((prev) => ({
                    ...prev,
                    frontFacingCount: Math.min(
                      carSeatLimits.maxFrontFacing,
                      prev.frontFacingCount + 1
                    ),
                  })),
              },
              {
                label: 'Youth Booster',
                sub: 'Belt-positioning (40–100 lbs)',
                count: form.boosterCount,
                max: carSeatLimits.maxBooster,
                onDec: () =>
                  setForm((prev) => ({
                    ...prev,
                    boosterCount: Math.max(0, prev.boosterCount - 1),
                  })),
                onInc: () =>
                  setForm((prev) => ({
                    ...prev,
                    boosterCount: Math.min(carSeatLimits.maxBooster, prev.boosterCount + 1),
                  })),
              },
            ].map((seat) => (
              <div
                key={seat.label}
                className="flex items-center justify-between gap-2 text-xs bg-white/90 p-2.5 rounded-xl border border-amber-200/80"
              >
                <div>
                  <span className="font-bold text-slate-900">{seat.label}</span>
                  <span className="text-slate-600 block sm:inline sm:ml-1.5 text-[11px]">
                    {seat.sub}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={`Decrease ${seat.label} seats`}
                    disabled={seat.count <= 0}
                    onClick={seat.onDec}
                    className="w-8 h-8 rounded-lg bg-white border border-amber-300 font-bold flex items-center justify-center text-slate-700 text-sm disabled:opacity-40 cursor-pointer"
                  >
                    &minus;
                  </button>
                  <span className="w-5 text-center font-extrabold text-slate-900">
                    {seat.count}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${seat.label} seats`}
                    disabled={
                      seat.count >= seat.max || totalCarSeats >= carSeatLimits.maxTotalCarSeats
                    }
                    onClick={seat.onInc}
                    className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 font-bold flex items-center justify-center text-amber-950 text-sm disabled:opacity-40 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Admin-Configured Optional Bookable Extras */}
        {bookableCustomExtras.length > 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Optional Add-On Services
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {bookableCustomExtras.map((extra) => {
                const qty = form.selectedCustomExtras[extra.id] || 0;
                const isChecked = qty > 0;
                return (
                  <div
                    key={extra.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                      isChecked
                        ? 'bg-blue-50/70 border-blue-300'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((prev) => ({
                            ...prev,
                            selectedCustomExtras: {
                              ...prev.selectedCustomExtras,
                              [extra.id]: checked
                                ? Math.max(1, prev.selectedCustomExtras[extra.id] || 1)
                                : 0,
                            },
                          }));
                        }}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{extra.name}</span>
                          {extra.fee > 0 && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              +${extra.fee.toFixed(2)}
                              {extra.isPerUnit ? '/ea' : ''}
                            </span>
                          )}
                        </div>
                        {extra.description && (
                          <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
                            {extra.description}
                          </p>
                        )}
                      </div>
                    </label>

                    {extra.isPerUnit && isChecked && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-label={`Decrease ${extra.name}`}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              selectedCustomExtras: {
                                ...prev.selectedCustomExtras,
                                [extra.id]: Math.max(
                                  0,
                                  (prev.selectedCustomExtras[extra.id] || 1) - 1
                                ),
                              },
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-bold flex items-center justify-center text-slate-700 cursor-pointer"
                        >
                          &minus;
                        </button>
                        <span className="w-4 text-center font-bold text-slate-900">{qty}</span>
                        <button
                          type="button"
                          aria-label={`Increase ${extra.name}`}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              selectedCustomExtras: {
                                ...prev.selectedCustomExtras,
                                [extra.id]: Math.min(
                                  10,
                                  (prev.selectedCustomExtras[extra.id] || 0) + 1
                                ),
                              },
                            }))
                          }
                          className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-300 font-bold flex items-center justify-center text-blue-700 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Vehicle Selection Subsection */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800">
            Choose Vehicle{' '}
            {bookingConfig.allowMultiVehicle &&
              `(${form.selectedVehicles.length} vehicle${
                form.selectedVehicles.length > 1 ? 's' : ''
              })`}
          </span>
          {bookingConfig.allowMultiVehicle && (
            <button
              type="button"
              disabled={form.selectedVehicles.length >= (bookingConfig.maxVehiclesAllowed || 3)}
              onClick={onAddVehicle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Add Vehicle</span>
            </button>
          )}
        </div>

        {bookingConfig.allowMultiVehicle ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-600 font-medium">
                Total Capacity:{' '}
                <strong className="text-slate-900">{totalMaxPassengers} Passengers</strong> &bull;{' '}
                <strong className="text-slate-900">{totalMaxBags} Bags</strong>
              </span>
              <span className="text-[11px] text-slate-500">
                {form.selectedVehicles.length} of max {bookingConfig.maxVehiclesAllowed || 3}{' '}
                vehicle(s)
              </span>
            </div>

            {form.selectedVehicles.map((vChoice, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-xs text-slate-800">Vehicle #{idx + 1}</span>
                  </div>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => onRemoveVehicle(idx)}
                      className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {activeVehicleTiers.map((tier) => {
                    const isSelected = isVehicleChoiceSelected(vChoice, tier.id, 'xl');
                    const liveTierPrice = estimateTierDisplayFare(tier);

                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => onUpdateVehicleChoice(idx, tier.id as CustomerVehicleChoice)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-white/70 border-slate-200 hover:bg-white text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-slate-900">{tier.name}</span>
                          {liveTierPrice !== null ? (
                            <span className="text-xs font-mono font-extrabold text-blue-700">
                              ${liveTierPrice}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {tier.maxPassengers} Passengers &bull; {tier.maxLuggage} Bags
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {oversizedRequiresUpgrade && (
              <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                <span className="font-bold">Vehicle Upgrade:</span>
                <span>Oversized items require SUV or Minivan space.</span>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {activeVehicleTiers.map((tier) => {
                const { isRestricted, restrictionReason } = evaluateCustomerTierRestriction({
                  tier,
                  passengers: form.passengers,
                  totalLuggage: form.carryOnBags + form.checkedBags,
                  totalCarSeats,
                  oversizedRequiresUpgrade,
                  oversizedReasonLabel: 'Requires SUV/Van (Oversized items)',
                });
                const isSelected = isVehicleChoiceSelected(form.vehicleChoice, tier.id, 'xl');
                const liveTierPrice = estimateTierDisplayFare(tier);

                return (
                  <button
                    key={tier.id}
                    type="button"
                    disabled={isRestricted}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        vehicleChoice: tier.id as CustomerVehicleChoice,
                        selectedVehicles: [tier.id as CustomerVehicleChoice],
                        isVehicleAutoAssigned: false,
                      }))
                    }
                    className={`p-2.5 sm:p-3.5 rounded-xl border text-left transition-all relative group flex flex-col justify-between ${
                      isRestricted
                        ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'bg-blue-50/80 border-blue-600 shadow-sm ring-2 ring-blue-500/20 cursor-pointer'
                        : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div>
                      {tier.imageUrl ? (
                        <div className="w-full h-16 sm:h-24 mb-2 rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80">
                          <img
                            src={tier.imageUrl}
                            alt={tier.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : null}

                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {tier.name}
                            </span>
                            {tier.badge && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                {tier.badge}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {liveTierPrice !== null && !isRestricted ? (
                            <div className="flex flex-col items-end">
                              <span className="text-sm font-mono font-black text-slate-950">
                                ${liveTierPrice}
                              </span>
                              <span className="text-[9px] text-slate-500 font-semibold uppercase">
                                est.{form.returnTrip ? '/trip' : ''}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {tier.description && (
                        <p className="text-[11px] text-slate-500 mb-2 leading-snug">
                          {tier.description}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold mt-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            {tier.maxPassengers} Passengers
                          </span>
                          <span>&bull;</span>
                          <span className="inline-flex items-center gap-1">
                            <LuggageIcon className="w-3.5 h-3.5 text-slate-400" />
                            {tier.maxLuggage} Bags
                          </span>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <CheckIcon className="w-3 h-3" />
                          </span>
                        )}
                      </div>

                      {isRestricted && (
                        <div className="mt-2 text-[10px] text-red-700 font-semibold bg-red-50 p-1.5 rounded-lg border border-red-200 text-center">
                          {restrictionReason}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Compact Multi-Vehicle Note */}
            <p className="text-[11px] text-slate-500 pt-1">
              Need multiple vehicles for a group or event? Call dispatch at{' '}
              <a
                href={`tel:${(
                  bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primaryRaw
                ).replace(/[^\d+]/g, '')}`}
                className="font-bold text-blue-700 underline hover:text-blue-900"
              >
                {bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primary}
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
