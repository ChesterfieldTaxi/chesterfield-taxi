import React from 'react';
import type {
  CustomerBookingConfig,
  OversizedBagCategory,
  UniversalExtrasConfig,
  VehicleTierConfig,
} from '../../../../core/types/config';

type CustomBookableExtraItem = NonNullable<UniversalExtrasConfig['customExtras']>[number];
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import type { AirportDetectionResult } from '../../../../core/config/airports';
import type { QuoteResponse } from '../../../../core/services/booking-service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import {
  CUSTOMER_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  evaluateCustomerTierRestriction,
  isVehicleChoiceSelected,
  stepLuggageCount,
  type BookingStopPoint,
  type BookingVehicleChoice as CustomerVehicleChoice,
  type CustomerBookingFormState,
} from '../../../../core/hooks/booking';
import {
  DispatchLocationInput,
  type PlaceSelectedDetails,
} from '../../dispatch/DispatchLocationInput';
import { FlightAssistanceCard } from '../FlightAssistanceCard';
import { CollapsibleSection } from '../../../ui/CollapsibleSection';
import { ModernDatePicker, ModernTimePicker } from '../../../ui/ModernDateTimePicker';
import {
  ArrowLeftRightIcon,
  CheckIcon,
  LuggageIcon,
  PlusIcon,
  SpinnerIcon,
  UserIcon,
  XIcon,
} from '../../../ui/Icons';

export interface CustomerReturnTripSectionProps {
  form: CustomerBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerBookingFormState>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  bookingConfig: CustomerBookingConfig;
  todayLocalDate: string;
  activeVehicleTiers: VehicleTierConfig[];
  oversizedCategories: OversizedBagCategory[];
  bookableCustomExtras: CustomBookableExtraItem[];
  returnTotalMaxPassengers: number;
  returnTotalMaxBags: number;
  returnTotalCarSeats: number;
  returnTotalOversizedCount: number;
  returnOversizedRequiresUpgrade: boolean;
  returnAirportDetection: AirportDetectionResult;
  returnFlightTelemetry: FlightTelemetrySnapshot | null;
  setReturnFlightTelemetry: React.Dispatch<React.SetStateAction<FlightTelemetrySnapshot | null>>;
  returnQuote: QuoteResponse | null;
  isReturnQuoteLoading: boolean;
  returnFare: number | null;
  onToggleReturnTrip: () => void;
  onSwapReturnRoute: () => void;
  onAddReturnStop: () => void;
  onUpdateReturnStop: (index: number, patch: Partial<BookingStopPoint>) => void;
  onRemoveReturnStop: (index: number) => void;
  onToggleReturnCarSeats: (checked: boolean) => void;
  onAddReturnVehicle: () => void;
  onRemoveReturnVehicle: (index: number) => void;
  onUpdateReturnVehicleChoice: (index: number, choice: CustomerVehicleChoice) => void;
  estimateReturnTierDisplayFare: (tier: VehicleTierConfig) => number | null;
}

export function CustomerReturnTripSection({
  form,
  setForm,
  errors,
  setErrors,
  bookingConfig,
  todayLocalDate,
  activeVehicleTiers,
  oversizedCategories,
  bookableCustomExtras,
  returnTotalMaxPassengers,
  returnTotalMaxBags,
  returnTotalCarSeats,
  returnTotalOversizedCount,
  returnOversizedRequiresUpgrade,
  returnAirportDetection,
  returnFlightTelemetry,
  setReturnFlightTelemetry,
  returnQuote,
  isReturnQuoteLoading,
  returnFare,
  onToggleReturnTrip,
  onSwapReturnRoute,
  onAddReturnStop,
  onUpdateReturnStop,
  onRemoveReturnStop,
  onToggleReturnCarSeats,
  onAddReturnVehicle,
  onRemoveReturnVehicle,
  onUpdateReturnVehicleChoice,
  estimateReturnTierDisplayFare,
}: CustomerReturnTripSectionProps) {
  if (!bookingConfig.allowRoundTrip) {
    return null;
  }

  const { carSeatLimits } = COMPANY_CONFIG;

  return (
    <div
      className={`bg-surface-card rounded-2xl shadow-xs p-3 sm:p-5 space-y-3 sm:space-y-4 border transition-colors ${
        form.returnTrip ? 'border-status-staged-border ring-1 ring-indigo-100' : 'border-border-subtle/90'
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={form.returnTrip}
        onClick={onToggleReturnTrip}
        className={`w-full p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer active:scale-[0.99] ${
          form.returnTrip
            ? 'bg-status-staged-bg/90 border-indigo-500 shadow-2xs'
            : 'bg-gradient-to-r from-status-staged-bg/50 to-status-info-bg/40 border-status-staged-border hover:border-indigo-400'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              form.returnTrip
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-card border border-status-staged-border text-indigo-600'
            }`}
          >
            <ArrowLeftRightIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold text-fg-primary text-xs sm:text-sm">
                Add Return Trip
              </span>
              {form.returnTrip && (
                <span className="text-[10px] font-extrabold text-status-staged-fg bg-surface-card px-2 py-0.5 rounded-full border border-status-staged-border">
                  Round Trip
                </span>
              )}
            </div>
            <p className="text-[11px] text-fg-secondary truncate">
              {form.returnTrip
                ? 'Customize return route, schedule, passengers & vehicle'
                : 'Schedule your return ride now in one booking'}
            </p>
          </div>
        </div>

        <span
          aria-hidden="true"
          className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
            form.returnTrip ? 'bg-indigo-600 justify-end' : 'bg-surface-strong justify-start'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-surface-card shadow-xs" />
        </span>
      </button>

      {form.returnTrip && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* 1. Return Date, Time & Route (with Stops + Swap) */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="returnDate"
                  className="block text-[11px] text-fg-secondary font-bold mb-1"
                >
                  Return Date
                </label>
                <ModernDatePicker
                  id="returnDate"
                  value={form.returnDate}
                  minDate={form.scheduledDate || todayLocalDate || undefined}
                  error={Boolean(errors.returnDate)}
                  onChange={(val) => setForm((prev) => ({ ...prev, returnDate: val }))}
                />
                {errors.returnDate && (
                  <p className="text-xs text-red-600 font-semibold mt-1">{errors.returnDate}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="returnTime"
                  className="block text-[11px] text-fg-secondary font-bold mb-1"
                >
                  Return Time
                </label>
                <ModernTimePicker
                  id="returnTime"
                  value={form.returnTime}
                  error={Boolean(errors.returnTime)}
                  onChange={(val) => setForm((prev) => ({ ...prev, returnTime: val }))}
                />
                {errors.returnTime && (
                  <p className="text-xs text-red-600 font-semibold mt-1">{errors.returnTime}</p>
                )}
              </div>
            </div>

            {/* Return Route Card (Pickup, Intermediate Stops, Dropoff, Swap, Add Stop) */}
            <div className="p-3 bg-surface-subtle/90 border border-border-subtle/90 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-fg-secondary uppercase tracking-wider">
                  Return Route
                </span>
                <button
                  type="button"
                  title="Swap Return Route"
                  onClick={onSwapReturnRoute}
                  className="inline-flex items-center gap-1 text-xs font-bold text-status-staged-fg hover:text-status-staged-fg cursor-pointer"
                >
                  <ArrowLeftRightIcon className="w-3.5 h-3.5" />
                  <span>Swap Route</span>
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <DispatchLocationInput
                    name="returnPickupAddress"
                    size="comfortable"
                    hasError={Boolean(errors.returnPickupAddress)}
                    placeholder="Return Pickup Location"
                    value={form.returnPickupAddress}
                    variant="pickup"
                    onChange={(addr) =>
                      setForm((prev) => ({
                        ...prev,
                        returnPickupAddress: addr,
                        returnPickupCoordinates: undefined,
                      }))
                    }
                    onPlaceSelected={(p: PlaceSelectedDetails) => {
                      setForm((prev) => ({
                        ...prev,
                        returnPickupAddress: p.address,
                        returnPickupCoordinates: p.coordinates,
                      }));
                    }}
                    required={form.returnTrip}
                  />
                  {errors.returnPickupAddress && (
                    <p className="text-xs text-red-600 font-semibold mt-1">
                      {errors.returnPickupAddress}
                    </p>
                  )}
                </div>

                {/* Return Intermediate Stops */}
                {form.returnIntermediateStops.map((stop, idx) => (
                  <div key={stop.id || `ret-stop-${idx}`} className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <DispatchLocationInput
                        size="comfortable"
                        placeholder={`Return Stop #${idx + 1}`}
                        value={stop.address}
                        variant="stop"
                        onChange={(val) => onUpdateReturnStop(idx, { address: val })}
                        onPlaceSelected={(p: PlaceSelectedDetails) => {
                          onUpdateReturnStop(idx, {
                            address: p.address,
                            coordinates: p.coordinates,
                            placeId: p.placeId,
                          });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveReturnStop(idx)}
                      className="w-9 h-9 flex items-center justify-center text-fg-subtle hover:text-red-600 hover:bg-status-danger-bg rounded-xl transition-colors cursor-pointer shrink-0"
                      title="Remove return stop"
                      aria-label={`Remove return stop ${idx + 1}`}
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <div>
                  <DispatchLocationInput
                    name="returnDropoffAddress"
                    size="comfortable"
                    hasError={Boolean(errors.returnDropoffAddress)}
                    placeholder="Return Dropoff Location"
                    value={form.returnDropoffAddress}
                    variant="dropoff"
                    onChange={(addr) =>
                      setForm((prev) => ({
                        ...prev,
                        returnDropoffAddress: addr,
                        returnDropoffCoordinates: undefined,
                      }))
                    }
                    onPlaceSelected={(p: PlaceSelectedDetails) => {
                      setForm((prev) => ({
                        ...prev,
                        returnDropoffAddress: p.address,
                        returnDropoffCoordinates: p.coordinates,
                      }));
                    }}
                    required={form.returnTrip}
                  />
                  {errors.returnDropoffAddress && (
                    <p className="text-xs text-red-600 font-semibold mt-1">
                      {errors.returnDropoffAddress}
                    </p>
                  )}
                </div>
              </div>

              {/* Return Route Stats + Add Stop Action */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle text-xs text-fg-muted font-medium">
                <div className="flex items-center gap-1.5">
                  {isReturnQuoteLoading ? (
                    <div className="flex items-center gap-1.5 text-indigo-600 font-semibold">
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                      <span>Calculating return route...</span>
                    </div>
                  ) : returnQuote ? (
                    <div>
                      Est. Return:{' '}
                      <span className="font-bold text-fg-strong">
                        {returnQuote.pricing.durationMinutes} min
                      </span>{' '}
                      &bull;{' '}
                      <span className="font-bold text-fg-strong">
                        {returnQuote.pricing.distanceMiles.toFixed(1)} mi
                      </span>
                    </div>
                  ) : (
                    <span>Enter return route for live estimate</span>
                  )}
                </div>

                {form.returnIntermediateStops.length < 5 && (
                  <button
                    type="button"
                    onClick={onAddReturnStop}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-card hover:bg-status-staged-bg text-status-staged-fg font-bold text-xs border border-status-staged-border shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <PlusIcon className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Add Stop</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. Return Airport Assistance (Immediately under Return Route — strictly gated on airport detection) */}
            <CollapsibleSection isOpen={returnAirportDetection.isAirportTrip}>
              <FlightAssistanceCard
                variant="return"
                detection={returnAirportDetection}
                provideFlightInfo={form.returnProvideFlightInfo}
                onToggleProvideFlightInfo={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    returnProvideFlightInfo: checked,
                    returnFlightInfoDismissed: !checked,
                  }))
                }
                airline={form.returnAirline}
                onAirlineChange={(val) => setForm((prev) => ({ ...prev, returnAirline: val }))}
                flightNumber={form.returnFlightNumber}
                onFlightNumberChange={(val) => {
                  setForm((prev) => ({ ...prev, returnFlightNumber: val }));
                  if (errors.returnFlightNumber) {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.returnFlightNumber;
                      return copy;
                    });
                  }
                }}
                flightOrigin={form.returnFlightOrigin}
                onFlightOriginChange={(val) =>
                  setForm((prev) => ({ ...prev, returnFlightOrigin: val }))
                }
                tailNumber={form.returnTailNumber}
                onTailNumberChange={(val) => {
                  setForm((prev) => ({ ...prev, returnTailNumber: val }));
                  if (errors.returnTailNumber) {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.returnTailNumber;
                      return copy;
                    });
                  }
                }}
                fboFacility={form.returnFboFacility}
                onFboFacilityChange={(val) =>
                  setForm((prev) => ({ ...prev, returnFboFacility: val }))
                }
                hasCheckedLuggage={form.returnHasCheckedLuggage}
                onHasCheckedLuggageChange={(checked) =>
                  setForm((prev) => ({ ...prev, returnHasCheckedLuggage: checked }))
                }
                fboFacilities={COMMON_FBO_FACILITIES}
                lambertPickupInstructions={bookingConfig.lambertPickupInstructions}
                flightNumberError={errors.returnFlightNumber}
                tailNumberError={errors.returnTailNumber}
                allowLiveCheck={false}
                serviceDate={form.returnDate || form.scheduledDate || todayLocalDate}
                scheduledPickupIso={
                  form.returnDate && form.returnTime
                    ? (() => {
                        const d = new Date(`${form.returnDate}T${form.returnTime}:00`);
                        return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
                      })()
                    : undefined
                }
                flightTelemetry={returnFlightTelemetry}
                onFlightTelemetryChange={setReturnFlightTelemetry}
                onApplyRecommendedPickupIso={(recIso) => {
                  const d = new Date(recIso);
                  if (!Number.isFinite(d.getTime())) return;
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  const hh = String(d.getHours()).padStart(2, '0');
                  const min = String(d.getMinutes()).padStart(2, '0');
                  setForm((prev) => ({
                    ...prev,
                    returnDate: `${yyyy}-${mm}-${dd}`,
                    returnTime: `${hh}:${min}`,
                  }));
                }}
              />
            </CollapsibleSection>
          </div>

          {/* 3. Return Passengers, Carry-on & Checked Bags (Identical 3-col compact steppers) */}
          <div className="pt-3 border-t border-border-faint space-y-3">
            <span className="text-xs font-extrabold text-fg-primary block">
              Return Passengers &amp; Luggage
            </span>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
              {/* Return Passengers */}
              <div
                data-field="returnPassengers"
                className={`p-2 sm:p-2.5 bg-surface-subtle border ${
                  errors.returnPassengers ? 'border-red-400 bg-status-danger-bg/30' : 'border-border-subtle'
                } rounded-xl flex flex-col justify-between gap-1.5 min-w-0`}
              >
                <div className="flex items-center justify-center sm:justify-start gap-1 text-fg-secondary text-[11px] sm:text-xs min-w-0">
                  <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fg-muted shrink-0" />
                  <span className="font-bold text-fg-strong truncate">Passengers</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    aria-label="Decrease return passengers"
                    disabled={form.returnPassengers <= 1}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        returnPassengers: Math.max(1, prev.returnPassengers - 1),
                      }))
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-card hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    &minus;
                  </button>
                  <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-fg-primary">
                    {form.returnPassengers}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase return passengers"
                    disabled={form.returnPassengers >= returnTotalMaxPassengers}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        returnPassengers: Math.min(
                          returnTotalMaxPassengers,
                          prev.returnPassengers + 1
                        ),
                      }))
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Return Carry-on Bags */}
              <div
                data-field="returnBags"
                className={`p-2 sm:p-2.5 bg-surface-subtle border ${
                  errors.returnBags ? 'border-red-400 bg-status-danger-bg/30' : 'border-border-subtle'
                } rounded-xl flex flex-col justify-between gap-1.5 min-w-0`}
              >
                <div className="flex items-center justify-center sm:justify-start gap-1 text-fg-secondary text-[11px] sm:text-xs min-w-0">
                  <LuggageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fg-muted shrink-0" />
                  <span className="font-bold text-fg-strong truncate">Carry-on</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    aria-label="Decrease return carry-on bags"
                    disabled={form.returnCarryOnBags <= 0}
                    onClick={() =>
                      setForm((prev) => {
                        const stepped = stepLuggageCount(
                          prev.returnCarryOnBags,
                          prev.returnCheckedBags,
                          'carryOn',
                          -1,
                          returnTotalMaxBags
                        );
                        return {
                          ...prev,
                          returnCarryOnBags: stepped.carryOnBags,
                          returnBags: stepped.bags,
                        };
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-card hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    &minus;
                  </button>
                  <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-fg-primary">
                    {form.returnCarryOnBags}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase return carry-on bags"
                    disabled={form.returnCarryOnBags + form.returnCheckedBags >= returnTotalMaxBags}
                    onClick={() =>
                      setForm((prev) => {
                        const stepped = stepLuggageCount(
                          prev.returnCarryOnBags,
                          prev.returnCheckedBags,
                          'carryOn',
                          1,
                          returnTotalMaxBags
                        );
                        return {
                          ...prev,
                          returnCarryOnBags: stepped.carryOnBags,
                          returnBags: stepped.bags,
                        };
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Return Checked Bags */}
              <div className="p-2 sm:p-2.5 bg-surface-subtle border border-border-subtle rounded-xl flex flex-col justify-between gap-1.5 min-w-0">
                <div className="flex items-center justify-center sm:justify-start gap-1 text-fg-secondary text-[11px] sm:text-xs min-w-0">
                  <LuggageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fg-muted shrink-0" />
                  <span className="font-bold text-fg-strong truncate">Checked</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    aria-label="Decrease return checked bags"
                    disabled={form.returnCheckedBags <= 0}
                    onClick={() =>
                      setForm((prev) => {
                        const stepped = stepLuggageCount(
                          prev.returnCarryOnBags,
                          prev.returnCheckedBags,
                          'checked',
                          -1,
                          returnTotalMaxBags
                        );
                        return {
                          ...prev,
                          returnCheckedBags: stepped.checkedBags,
                          returnBags: stepped.bags,
                        };
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-card hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    &minus;
                  </button>
                  <span className="min-w-[1.25rem] text-center font-extrabold text-xs sm:text-sm text-fg-primary">
                    {form.returnCheckedBags}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase return checked bags"
                    disabled={form.returnCarryOnBags + form.returnCheckedBags >= returnTotalMaxBags}
                    onClick={() =>
                      setForm((prev) => {
                        const stepped = stepLuggageCount(
                          prev.returnCarryOnBags,
                          prev.returnCheckedBags,
                          'checked',
                          1,
                          returnTotalMaxBags
                        );
                        return {
                          ...prev,
                          returnCheckedBags: stepped.checkedBags,
                          returnBags: stepped.bags,
                        };
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg text-sm leading-none disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {errors.returnPassengers && (
              <p className="text-xs text-red-600 font-semibold">{errors.returnPassengers}</p>
            )}
            {errors.returnBags && (
              <p className="text-xs text-red-600 font-semibold">{errors.returnBags}</p>
            )}

            {/* 4. Return Collapsible Extras Row (Oversized Cargo + Child Safety Seats) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {bookingConfig.allowOversizedLuggage !== false && (
                <label
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    form.returnHasOversizedLuggage
                      ? 'bg-status-staged-bg/70 border-status-staged-border'
                      : 'bg-surface-subtle border-border-subtle hover:bg-surface-muted/70'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-fg-strong">
                    <input
                      type="checkbox"
                      checked={form.returnHasOversizedLuggage}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          returnHasOversizedLuggage: checked,
                          returnOversizedBags: checked ? prev.returnOversizedBags : {},
                        }));
                      }}
                      className="w-4 h-4 rounded border-border-strong text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Oversized Items (Golf / Skis)</span>
                  </span>
                  {form.returnHasOversizedLuggage && returnTotalOversizedCount > 0 && (
                    <span className="text-[10px] font-bold text-status-staged-fg bg-surface-card px-2 py-0.5 rounded-md border border-status-staged-border">
                      {returnTotalOversizedCount} item
                      {returnTotalOversizedCount > 1 ? 's' : ''}
                    </span>
                  )}
                </label>
              )}

              {bookingConfig.allowChildSafetySeats && (
                <label
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    form.returnCarSeats
                      ? 'bg-status-warning-bg/80 border-status-warning-border'
                      : 'bg-surface-subtle border-border-subtle hover:bg-surface-muted/70'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-fg-strong">
                    <input
                      type="checkbox"
                      checked={form.returnCarSeats}
                      onChange={(e) => onToggleReturnCarSeats(e.target.checked)}
                      className="w-4 h-4 rounded border-border-strong text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Child Safety Seats</span>
                  </span>
                  {form.returnCarSeats && (
                    <span className="text-[10px] font-bold text-status-warning-fg bg-surface-card px-2 py-0.5 rounded-md border border-status-warning-border">
                      {returnTotalCarSeats} / {carSeatLimits.maxTotalCarSeats} max
                    </span>
                  )}
                </label>
              )}
            </div>

            {/* Expanded Return Oversized Items Panel */}
            <CollapsibleSection
              isOpen={bookingConfig.allowOversizedLuggage !== false && form.returnHasOversizedLuggage}
            >
              <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-2.5">
                <div className="text-[11px] text-fg-secondary font-medium">
                  Select return oversized items so we send a car with enough space:
                </div>

                <div className="space-y-1.5">
                  {oversizedCategories.map((cat) => {
                    const count = form.returnOversizedBags[cat.id] || 0;
                    return (
                      <div
                        key={`ret-over-${cat.id}`}
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
                            aria-label={`Decrease return ${cat.label}`}
                            disabled={count <= 0}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                returnOversizedBags: {
                                  ...prev.returnOversizedBags,
                                  [cat.id]: Math.max(
                                    0,
                                    (prev.returnOversizedBags[cat.id] || 0) - 1
                                  ),
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
                            aria-label={`Increase return ${cat.label}`}
                            disabled={count >= (cat.maxCount || 4)}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                returnOversizedBags: {
                                  ...prev.returnOversizedBags,
                                  [cat.id]: Math.min(
                                    cat.maxCount || 4,
                                    (prev.returnOversizedBags[cat.id] || 0) + 1
                                  ),
                                },
                              }))
                            }
                            className="w-8 h-8 rounded-lg bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg disabled:opacity-40 text-sm cursor-pointer"
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
                  placeholder="Additional return cargo notes (e.g. dimensions, fragile instruments)"
                  value={form.returnOversizedLuggageNotes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, returnOversizedLuggageNotes: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-surface-card border border-border-strong rounded-xl text-base sm:text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                />
              </div>
            </CollapsibleSection>

            {/* Expanded Return Car Seats Panel */}
            <CollapsibleSection
              isOpen={Boolean(bookingConfig.allowChildSafetySeats && form.returnCarSeats)}
            >
              <div className="p-3 bg-status-warning-bg/70 border border-status-warning-border rounded-xl space-y-2">
                <div className="p-2 bg-status-warning-bg-strong/80 border border-status-warning-border/80 rounded-lg text-[11px] text-status-warning-fg leading-snug">
                  <span className="font-bold">
                    Missouri Child Passenger Safety Law (RSMo § 307.179):{' '}
                  </span>
                  All fleet seats are commercially sanitized and require SUV or Minivan capacity.
                </div>
                {[
                  {
                    label: 'Rear-Facing',
                    sub: 'Infant (Birth–2 yrs, 5–40 lbs)',
                    count: form.returnRearFacing,
                    max: carSeatLimits.maxRearFacing,
                    onDec: () =>
                      setForm((prev) => ({
                        ...prev,
                        returnRearFacing: Math.max(0, prev.returnRearFacing - 1),
                      })),
                    onInc: () =>
                      setForm((prev) => ({
                        ...prev,
                        returnRearFacing: Math.min(
                          carSeatLimits.maxRearFacing,
                          prev.returnRearFacing + 1
                        ),
                      })),
                  },
                  {
                    label: 'Front-Facing',
                    sub: 'Toddler (5-pt harness, 22–65 lbs)',
                    count: form.returnFrontFacing,
                    max: carSeatLimits.maxFrontFacing,
                    onDec: () =>
                      setForm((prev) => ({
                        ...prev,
                        returnFrontFacing: Math.max(0, prev.returnFrontFacing - 1),
                      })),
                    onInc: () =>
                      setForm((prev) => ({
                        ...prev,
                        returnFrontFacing: Math.min(
                          carSeatLimits.maxFrontFacing,
                          prev.returnFrontFacing + 1
                        ),
                      })),
                  },
                  {
                    label: 'Youth Booster',
                    sub: 'Belt-positioning (40–100 lbs)',
                    count: form.returnBooster,
                    max: carSeatLimits.maxBooster,
                    onDec: () =>
                      setForm((prev) => ({
                        ...prev,
                        returnBooster: Math.max(0, prev.returnBooster - 1),
                      })),
                    onInc: () =>
                      setForm((prev) => ({
                        ...prev,
                        returnBooster: Math.min(
                          carSeatLimits.maxBooster,
                          prev.returnBooster + 1
                        ),
                      })),
                  },
                ].map((seat) => (
                  <div
                    key={`ret-seat-${seat.label}`}
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
                        aria-label={`Decrease return ${seat.label} seats`}
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
                        aria-label={`Increase return ${seat.label} seats`}
                        disabled={
                          seat.count >= seat.max ||
                          returnTotalCarSeats >= carSeatLimits.maxTotalCarSeats
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

            {/* Return Admin-Configured Optional Bookable Extras */}
            {bookableCustomExtras.length > 0 && (
              <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-fg-secondary">
                  Return Optional Add-On Services
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {bookableCustomExtras.map((extra) => {
                    const qty = form.returnSelectedCustomExtras[extra.id] || 0;
                    const isChecked = qty > 0;
                    return (
                      <div
                        key={`ret-extra-${extra.id}`}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                          isChecked
                            ? 'bg-status-staged-bg/70 border-status-staged-border'
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
                                returnSelectedCustomExtras: {
                                  ...prev.returnSelectedCustomExtras,
                                  [extra.id]: checked
                                    ? Math.max(1, prev.returnSelectedCustomExtras[extra.id] || 1)
                                    : 0,
                                },
                              }));
                            }}
                            className="mt-0.5 w-4 h-4 rounded border-border-strong text-indigo-600 focus:ring-indigo-500 shrink-0"
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
                              aria-label={`Decrease return ${extra.name}`}
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  returnSelectedCustomExtras: {
                                    ...prev.returnSelectedCustomExtras,
                                    [extra.id]: Math.max(
                                      0,
                                      (prev.returnSelectedCustomExtras[extra.id] || 1) - 1
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
                              aria-label={`Increase return ${extra.name}`}
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  returnSelectedCustomExtras: {
                                    ...prev.returnSelectedCustomExtras,
                                    [extra.id]: Math.min(
                                      10,
                                      (prev.returnSelectedCustomExtras[extra.id] || 0) + 1
                                    ),
                                  },
                                }))
                              }
                              className="w-7 h-7 rounded-lg bg-status-staged-bg border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg cursor-pointer"
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

          {/* 5. Return Vehicle Selection (Identical 2-col mobile / 3-col desktop + multi-vehicle support) */}
          {activeVehicleTiers.length > 0 && (
            <div className="pt-3 border-t border-border-faint space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-fg-strong">
                  Choose Return Vehicle{' '}
                  {bookingConfig.allowMultiVehicle &&
                    `(${form.returnSelectedVehicles.length} vehicle${
                      form.returnSelectedVehicles.length > 1 ? 's' : ''
                    })`}
                </span>
                {bookingConfig.allowMultiVehicle && (
                  <button
                    type="button"
                    disabled={
                      form.returnSelectedVehicles.length >= (bookingConfig.maxVehiclesAllowed || 3)
                    }
                    onClick={onAddReturnVehicle}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-40 cursor-pointer"
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
                      Return Capacity:{' '}
                      <strong className="text-fg-primary">
                        {returnTotalMaxPassengers} Passengers
                      </strong>{' '}
                      &bull; <strong className="text-fg-primary">{returnTotalMaxBags} Bags</strong>
                    </span>
                    <span className="text-[11px] text-fg-muted">
                      {form.returnSelectedVehicles.length} of max{' '}
                      {bookingConfig.maxVehiclesAllowed || 3} vehicle(s)
                    </span>
                  </div>

                  {form.returnSelectedVehicles.map((vChoice, idx) => (
                    <div
                      key={`ret-mv-${idx}`}
                      className="p-3 bg-surface-subtle border border-border-subtle rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-xs text-fg-strong">
                            Return Vehicle #{idx + 1}
                          </span>
                        </div>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => onRemoveReturnVehicle(idx)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-status-danger-fg font-semibold cursor-pointer"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {activeVehicleTiers.map((tier) => {
                          const isSelected = isVehicleChoiceSelected(vChoice, tier.id, 'xl');
                          const liveRetPrice = estimateReturnTierDisplayFare(tier);

                          return (
                            <button
                              key={`ret-mv-${idx}-${tier.id}`}
                              type="button"
                              onClick={() =>
                                onUpdateReturnVehicleChoice(idx, tier.id as CustomerVehicleChoice)
                              }
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-surface-card border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                                  : 'bg-surface-card/70 border-border-subtle hover:bg-surface-card text-fg-secondary'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-xs font-bold text-fg-primary">
                                  {tier.name}
                                </span>
                                {liveRetPrice !== null && (
                                  <span className="text-xs font-mono font-extrabold text-status-staged-fg">
                                    ${liveRetPrice}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-fg-muted">
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
                  {returnOversizedRequiresUpgrade && (
                    <div className="p-2.5 bg-status-staged-bg/80 border border-status-staged-border rounded-xl text-xs text-status-staged-fg flex items-center gap-2">
                      <span className="font-bold">Vehicle Upgrade:</span>
                      <span>Return oversized items require SUV or Minivan space.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                    {activeVehicleTiers.map((tier) => {
                      const { isRestricted, restrictionReason } = evaluateCustomerTierRestriction({
                        tier,
                        passengers: form.returnPassengers,
                        totalLuggage: form.returnCarryOnBags + form.returnCheckedBags,
                        totalCarSeats: returnTotalCarSeats,
                        oversizedRequiresUpgrade: returnOversizedRequiresUpgrade,
                        oversizedReasonLabel: 'Requires SUV/Van (Oversized cargo)',
                      });
                      const isSelected = isVehicleChoiceSelected(
                        form.returnVehicleChoice,
                        tier.id,
                        'xl'
                      );
                      const liveReturnTierPrice = estimateReturnTierDisplayFare(tier);

                      return (
                        <button
                          key={`ret-tier-${tier.id}`}
                          type="button"
                          disabled={isRestricted}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              returnVehicleChoice: tier.id as CustomerVehicleChoice,
                              returnSelectedVehicles: [tier.id as CustomerVehicleChoice],
                            }))
                          }
                          className={`p-2.5 sm:p-3.5 rounded-xl border text-left transition-all relative group flex flex-col justify-between ${
                            isRestricted
                              ? 'bg-surface-muted border-border-subtle opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-status-staged-bg/80 border-indigo-600 shadow-sm ring-2 ring-indigo-500/20 cursor-pointer'
                              : 'bg-surface-card border-border-subtle hover:border-status-staged-border hover:bg-surface-subtle cursor-pointer'
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
                                    (e.currentTarget.parentElement as HTMLElement).style.display =
                                      'none';
                                  }}
                                />
                              </div>
                            ) : null}

                            <div className="flex items-start justify-between gap-1.5 mb-1">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="font-extrabold text-fg-primary text-xs sm:text-sm leading-tight">
                                    {tier.name}
                                  </span>
                                  {tier.badge && (
                                    <span className="text-[10px] font-bold text-status-staged-fg bg-status-staged-bg-strong px-1.5 py-0.5 rounded">
                                      {tier.badge}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                {liveReturnTierPrice !== null && !isRestricted ? (
                                  <div className="flex flex-col items-end">
                                    <span className="text-sm font-mono font-black text-fg-primary">
                                      ${liveReturnTierPrice}
                                    </span>
                                    <span className="text-[9px] text-fg-muted font-semibold uppercase">
                                      est./leg
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
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-0.5">
                                  <UserIcon className="w-3 h-3 text-fg-subtle" />
                                  {tier.maxPassengers}
                                </span>
                                <span>&bull;</span>
                                <span className="inline-flex items-center gap-0.5">
                                  <LuggageIcon className="w-3 h-3 text-fg-subtle" />
                                  {tier.maxLuggage}
                                </span>
                              </div>
                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
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
                </>
              )}
            </div>
          )}

          {/* Return Trip Fare Bar */}
          <div className="flex items-center justify-between text-xs font-semibold text-status-staged-fg bg-status-staged-bg/70 px-3 py-2 rounded-xl border border-status-staged-border/80">
            <span>Return Trip Estimated Fare</span>
            <span className="font-mono font-extrabold text-sm">
              {isReturnQuoteLoading
                ? 'Calculating...'
                : returnFare !== null
                ? `$${returnFare.toFixed(2)}`
                : returnQuote
                ? `$${Math.ceil(returnQuote.pricing.totalFare).toFixed(2)}`
                : '$--'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
