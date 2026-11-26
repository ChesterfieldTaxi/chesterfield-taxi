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
    <div className="bg-surface-card border border-border-subtle/90 rounded-2xl shadow-xs p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between border-b border-border-faint pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
            2
          </span>
          <h2 className="text-sm font-extrabold text-fg-primary tracking-tight">
            Passengers, Luggage &amp; Vehicle
          </h2>
        </div>
        <span className="text-xs text-fg-muted font-semibold">
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
            className={`p-2 sm:p-2.5 bg-surface-subtle border ${
              errors.passengers ? 'border-red-400 bg-status-danger-bg/30' : 'border-border-subtle'
            } rounded-xl flex flex-col justify-between gap-1.5 min-w-0`}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 text-fg-secondary text-[11px] sm:text-xs min-w-0">
              <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fg-muted shrink-0" />
              <span className="font-bold text-fg-strong truncate">Passengers</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Decrease passengers"
                disabled={form.passengers <= 1}
                onClick={() =>
                  setForm((prev) => ({ ...prev, passengers: Math.max(1, prev.passengers - 1) }))
                }
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-card hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                &minus;
              </button>
              <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-fg-primary">
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
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border font-bold flex items-center justify-center text-status-info-fg text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Carry-on Bags */}
          <div
            data-field="bags"
            className={`p-2 sm:p-2.5 bg-surface-subtle border ${
              errors.bags ? 'border-red-400 bg-status-danger-bg/30' : 'border-border-subtle'
            } rounded-xl flex flex-col justify-between gap-1.5 min-w-0`}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 text-fg-secondary text-[11px] sm:text-xs min-w-0">
              <LuggageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fg-muted shrink-0" />
              <span className="font-bold text-fg-strong truncate">Carry-on</span>
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
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-card hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                &minus;
              </button>
              <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-fg-primary">
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
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border font-bold flex items-center justify-center text-status-info-fg disabled:opacity-40 text-sm leading-none cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Checked Bags */}
          <div className="p-2 sm:p-2.5 bg-surface-subtle border border-border-subtle rounded-xl flex flex-col justify-between gap-1.5 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-1 text-fg-secondary text-[11px] sm:text-xs min-w-0">
              <LuggageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fg-muted shrink-0" />
              <span className="font-bold text-fg-strong truncate">Checked</span>
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
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-card hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
              >
                &minus;
              </button>
              <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-fg-primary">
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
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border font-bold flex items-center justify-center text-status-info-fg disabled:opacity-40 text-sm leading-none cursor-pointer shrink-0"
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
                  ? 'bg-status-info-bg/70 border-status-info-border'
                  : 'bg-surface-subtle border-border-subtle hover:bg-surface-muted/70'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-fg-strong">
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
                  className="w-4 h-4 rounded border-border-strong text-blue-600 focus:ring-blue-500"
                />
                <span>Oversized Items (Golf / Skis)</span>
              </span>
              {form.hasOversizedLuggage && totalOversizedCount > 0 && (
                <span className="text-[10px] font-bold text-status-info-fg bg-surface-card px-2 py-0.5 rounded-md border border-status-info-border">
                  {totalOversizedCount} item{totalOversizedCount > 1 ? 's' : ''}
                </span>
              )}
            </label>
          )}

          {bookingConfig.allowChildSafetySeats && (
            <label
              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                form.carSeats
                  ? 'bg-status-warning-bg/80 border-status-warning-border'
                  : 'bg-surface-subtle border-border-subtle hover:bg-surface-muted/70'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-fg-strong">
                <input
                  type="checkbox"
                  checked={form.carSeats}
                  onChange={(e) => onToggleCarSeats(e.target.checked)}
                  className="w-4 h-4 rounded border-border-strong text-blue-600 focus:ring-blue-500"
                />
                <span>Child Safety Seats</span>
              </span>
              {form.carSeats && (
                <span className="text-[10px] font-bold text-status-warning-fg bg-surface-card px-2 py-0.5 rounded-md border border-status-warning-border">
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
          <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-2.5">
            <div className="text-[11px] text-fg-secondary font-medium">
              Select oversized items so we send a car with enough space:
            </div>

            <div className="space-y-1.5">
              {oversizedCategories.map((cat) => {
                const count = form.oversizedBags[cat.id] || 0;
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between text-xs bg-surface-card p-2.5 rounded-xl border border-border-subtle"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-fg-strong">{cat.label}</span>
                      {cat.requiresUpgrade && (
                        <span className="text-[10px] font-bold text-status-warning-fg bg-status-warning-bg px-1.5 py-0.5 rounded border border-status-warning-border">
                          Requires SUV/Van
                        </span>
                      )}
                      {cat.fee > 0 && (
                        <span className="text-[11px] font-bold text-status-success-fg">
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
                        className="w-8 h-8 rounded-lg bg-surface-muted hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm disabled:opacity-40 cursor-pointer"
                      >
                        &minus;
                      </button>
                      <span className="w-5 text-center font-bold text-fg-primary">{count}</span>
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
                        className="w-8 h-8 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border font-bold flex items-center justify-center text-status-info-fg disabled:opacity-40 text-sm cursor-pointer"
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
              className="w-full px-3 py-2 bg-surface-card border border-border-strong rounded-xl text-base sm:text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
        </CollapsibleSection>

        {/* Expanded Car Seats Panel (Single deduplicated Missouri statutory notice) */}
        <CollapsibleSection isOpen={Boolean(bookingConfig.allowChildSafetySeats && form.carSeats)}>
          <div className="p-3.5 bg-status-warning-bg/70 border border-status-warning-border rounded-xl space-y-2.5">
            <div className="p-2.5 bg-status-warning-bg-strong/80 border border-status-warning-border/80 rounded-lg text-[11px] text-status-warning-fg leading-snug">
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
                className="flex items-center justify-between gap-2 text-xs bg-surface-card/90 p-2.5 rounded-xl border border-status-warning-border/80"
              >
                <div>
                  <span className="font-bold text-fg-primary">{seat.label}</span>
                  <span className="text-fg-secondary block sm:inline sm:ml-1.5 text-[11px]">
                    {seat.sub}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={`Decrease ${seat.label} seats`}
                    disabled={seat.count <= 0}
                    onClick={seat.onDec}
                    className="w-8 h-8 rounded-lg bg-surface-card border border-status-warning-border font-bold flex items-center justify-center text-fg-secondary text-sm disabled:opacity-40 cursor-pointer"
                  >
                    &minus;
                  </button>
                  <span className="w-5 text-center font-extrabold text-fg-primary">
                    {seat.count}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${seat.label} seats`}
                    disabled={
                      seat.count >= seat.max || totalCarSeats >= carSeatLimits.maxTotalCarSeats
                    }
                    onClick={seat.onInc}
                    className="w-8 h-8 rounded-lg bg-status-warning-bg-strong hover:bg-status-warning-bg-strong border border-status-warning-border font-bold flex items-center justify-center text-status-warning-fg text-sm disabled:opacity-40 cursor-pointer"
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
          <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-fg-secondary">
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
                        ? 'bg-status-info-bg/70 border-status-info-border'
                        : 'bg-surface-card border-border-subtle hover:bg-surface-subtle'
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
                        className="mt-0.5 w-4 h-4 rounded border-border-strong text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-fg-strong flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{extra.name}</span>
                          {extra.fee > 0 && (
                            <span className="text-[11px] font-bold text-status-success-fg">
                              +${extra.fee.toFixed(2)}
                              {extra.isPerUnit ? '/ea' : ''}
                            </span>
                          )}
                        </div>
                        {extra.description && (
                          <p className="text-[10.5px] text-fg-muted leading-tight mt-0.5">
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
                          className="w-7 h-7 rounded-lg bg-surface-card border border-border-strong font-bold flex items-center justify-center text-fg-secondary cursor-pointer"
                        >
                          &minus;
                        </button>
                        <span className="w-4 text-center font-bold text-fg-primary">{qty}</span>
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
                          className="w-7 h-7 rounded-lg bg-status-info-bg border border-status-info-border font-bold flex items-center justify-center text-status-info-fg cursor-pointer"
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
      <div className="pt-3 border-t border-border-faint space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-fg-strong">
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
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs">
              <span className="text-fg-secondary font-medium">
                Total Capacity:{' '}
                <strong className="text-fg-primary">{totalMaxPassengers} Passengers</strong> &bull;{' '}
                <strong className="text-fg-primary">{totalMaxBags} Bags</strong>
              </span>
              <span className="text-[11px] text-fg-muted">
                {form.selectedVehicles.length} of max {bookingConfig.maxVehiclesAllowed || 3}{' '}
                vehicle(s)
              </span>
            </div>

            {form.selectedVehicles.map((vChoice, idx) => (
              <div
                key={idx}
                className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-xs text-fg-strong">Vehicle #{idx + 1}</span>
                  </div>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => onRemoveVehicle(idx)}
                      className="text-xs text-red-600 hover:text-status-danger-fg font-semibold cursor-pointer"
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
                            ? 'bg-surface-card border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-surface-card/70 border-border-subtle hover:bg-surface-card text-fg-secondary'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-fg-primary">{tier.name}</span>
                          {liveTierPrice !== null ? (
                            <span className="text-xs font-mono font-extrabold text-status-info-fg">
                              ${liveTierPrice}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-fg-muted font-medium">
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
              <div className="p-2.5 bg-status-info-bg/80 border border-status-info-border rounded-xl text-xs text-status-info-fg flex items-center gap-2">
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
                        ? 'bg-surface-muted border-border-subtle opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'bg-status-info-bg/80 border-blue-600 shadow-sm ring-2 ring-blue-500/20 cursor-pointer'
                        : 'bg-surface-card border-border-subtle hover:border-status-info-border hover:bg-surface-subtle cursor-pointer'
                    }`}
                  >
                    <div>
                      {tier.imageUrl ? (
                        <div className="w-full h-16 sm:h-24 mb-2 rounded-lg overflow-hidden bg-surface-muted border border-border-subtle/80">
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
                            <span className="font-extrabold text-fg-primary text-sm">
                              {tier.name}
                            </span>
                            {tier.badge && (
                              <span className="text-[10px] font-bold text-status-info-fg bg-status-info-bg-strong px-1.5 py-0.5 rounded">
                                {tier.badge}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {liveTierPrice !== null && !isRestricted ? (
                            <div className="flex flex-col items-end">
                              <span className="text-sm font-mono font-black text-fg-primary">
                                ${liveTierPrice}
                              </span>
                              <span className="text-[9px] text-fg-muted font-semibold uppercase">
                                est.{form.returnTrip ? '/trip' : ''}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {tier.description && (
                        <p className="text-[11px] text-fg-muted mb-2 leading-snug">
                          {tier.description}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-fg-secondary font-semibold mt-2 pt-2 border-t border-border-faint">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1">
                            <UserIcon className="w-3.5 h-3.5 text-fg-subtle" />
                            {tier.maxPassengers} Passengers
                          </span>
                          <span>&bull;</span>
                          <span className="inline-flex items-center gap-1">
                            <LuggageIcon className="w-3.5 h-3.5 text-fg-subtle" />
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
                        <div className="mt-2 text-[10px] text-status-danger-fg font-semibold bg-status-danger-bg p-1.5 rounded-lg border border-status-danger-border text-center">
                          {restrictionReason}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Compact Multi-Vehicle Note */}
            <p className="text-[11px] text-fg-muted pt-1">
              Need multiple vehicles for a group or event? Call dispatch at{' '}
              <a
                href={`tel:${(
                  bookingConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.primaryRaw
                ).replace(/[^\d+]/g, '')}`}
                className="font-bold text-status-info-fg underline hover:text-status-info-fg"
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
