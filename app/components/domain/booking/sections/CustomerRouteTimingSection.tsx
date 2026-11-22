import React from 'react';
import type { CustomerBookingConfig } from '../../../../core/types/config';
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import type { AirportDetectionResult } from '../../../../core/config/airports';
import type { QuoteResponse } from '../../../../core/services/booking-service';
import {
  CUSTOMER_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  type BookingWaypointItem as WaypointItem,
  type CustomerBookingFormState,
} from '../../../../core/hooks/booking';
import {
  DispatchLocationInput,
  type PlaceSelectedDetails,
} from '../../dispatch/DispatchLocationInput';
import { FlightAssistanceCard } from '../FlightAssistanceCard';
import { ModernDatePicker, ModernTimePicker } from '../../../ui/ModernDateTimePicker';
import {
  BoltIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  SpinnerIcon,
  XIcon,
} from '../../../ui/Icons';

export interface CustomerRouteTimingSectionProps {
  form: CustomerBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerBookingFormState>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  bookingConfig: CustomerBookingConfig;
  todayLocalDate: string;
  quote: QuoteResponse | null;
  isQuoteLoading: boolean;
  quoteError: string | null;
  airportDetection: AirportDetectionResult;
  outboundFlightTelemetry: FlightTelemetrySnapshot | null;
  setOutboundFlightTelemetry: React.Dispatch<React.SetStateAction<FlightTelemetrySnapshot | null>>;
  onSwapRoute: () => void;
  onAddStop: () => void;
  onUpdateStop: (id: string, patch: Partial<WaypointItem>) => void;
  onRemoveStop: (id: string) => void;
}

export function CustomerRouteTimingSection({
  form,
  setForm,
  errors,
  setErrors,
  bookingConfig,
  todayLocalDate,
  quote,
  isQuoteLoading,
  quoteError,
  airportDetection,
  outboundFlightTelemetry,
  setOutboundFlightTelemetry,
  onSwapRoute,
  onAddStop,
  onUpdateStop,
  onRemoveStop,
}: CustomerRouteTimingSectionProps) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
            1
          </span>
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
            Pickup Time &amp; Route
          </h2>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          {form.timingType === 'later' ? 'Scheduled Ride' : 'On-Demand Dispatch'}
        </span>
      </div>

      {/* Segmented Timing Switcher */}
      <div className="space-y-2.5">
        {bookingConfig.allowImmediateAsap ? (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, timingType: 'asap' }))}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                form.timingType === 'asap'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BoltIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Ride Now (ASAP)</span>
            </button>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, timingType: 'later' }))}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                form.timingType === 'later'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Schedule for Later</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold">
            <ClockIcon className="w-4 h-4 text-blue-600" />
            <span>Advance Scheduled Pickup</span>
          </div>
        )}

        {form.timingType === 'later' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-in fade-in duration-150">
            <div>
              <label
                htmlFor="scheduledDate"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Pickup Date
              </label>
              <ModernDatePicker
                id="scheduledDate"
                value={form.scheduledDate}
                minDate={todayLocalDate}
                error={Boolean(errors.scheduledDate)}
                onChange={(val) => {
                  setForm((prev) => ({ ...prev, scheduledDate: val }));
                  if (errors.scheduledDate || errors.scheduledTime) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.scheduledDate;
                      delete next.scheduledTime;
                      return next;
                    });
                  }
                }}
              />
              {errors.scheduledDate && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">
                  {errors.scheduledDate}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="scheduledTime"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Pickup Time
              </label>
              <ModernTimePicker
                id="scheduledTime"
                value={form.scheduledTime}
                error={Boolean(errors.scheduledTime)}
                onChange={(val) => {
                  setForm((prev) => ({ ...prev, scheduledTime: val }));
                  if (errors.scheduledTime) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.scheduledTime;
                      return next;
                    });
                  }
                }}
              />
              {errors.scheduledTime && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">
                  {errors.scheduledTime}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="px-3.5 py-2.5 bg-blue-50 border border-blue-200/80 rounded-xl text-blue-900 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <BoltIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Immediate Dispatch (Nearest Available Vehicle)</span>
            </span>
            <span className="text-[11px] text-blue-700 font-medium">
              Typical arrival 15–25 mins
            </span>
          </div>
        )}

        {errors.scheduledTime && (
          <p className="text-xs text-red-600 font-semibold">{errors.scheduledTime}</p>
        )}
      </div>

      {/* Route & Stops Container */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            title="Swap Pickup and Dropoff"
            aria-label="Swap Pickup and Dropoff"
            onClick={onSwapRoute}
            className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors self-center text-sm font-bold shrink-0 shadow-2xs cursor-pointer"
          >
            ↕
          </button>

          <div className="flex-1 space-y-2.5 min-w-0">
            {/* Pickup Address */}
            <div>
              <DispatchLocationInput
                name="pickupAddress"
                size="comfortable"
                showCurrentLocationButton={true}
                hasError={Boolean(errors.pickupAddress)}
                placeholder="Pickup Location (e.g. 17000 Baxter Rd, Chesterfield)"
                value={form.pickupAddress}
                variant="pickup"
                onChange={(addr) => {
                  setForm((prev) => ({ ...prev, pickupAddress: addr }));
                  if (errors.pickupAddress) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.pickupAddress;
                      return next;
                    });
                  }
                }}
                onPlaceSelected={(p: PlaceSelectedDetails) => {
                  setForm((prev) => ({
                    ...prev,
                    pickupAddress: p.address,
                    pickupCoordinates: p.coordinates,
                    pickupPlaceId: p.placeId,
                  }));
                  if (errors.pickupAddress) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.pickupAddress;
                      return next;
                    });
                  }
                }}
                required
              />
              {errors.pickupAddress && (
                <p className="text-xs text-red-600 font-semibold mt-1 ml-1">
                  {errors.pickupAddress}
                </p>
              )}
            </div>

            {/* Intermediate Stops */}
            {form.intermediateStops.map((stop, idx) => (
              <div key={stop.id} className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                  <DispatchLocationInput
                    size="comfortable"
                    placeholder={`Intermediate Stop #${idx + 1}`}
                    value={stop.address}
                    variant="stop"
                    onChange={(val) => onUpdateStop(stop.id, { address: val })}
                    onPlaceSelected={(p: PlaceSelectedDetails) => {
                      onUpdateStop(stop.id, {
                        address: p.address,
                        coordinates: p.coordinates,
                        placeId: p.placeId,
                      });
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveStop(stop.id)}
                  className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Remove stop"
                  aria-label={`Remove stop ${idx + 1}`}
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Dropoff Address */}
            <div>
              <DispatchLocationInput
                name="dropoffAddress"
                size="comfortable"
                hasError={Boolean(errors.dropoffAddress)}
                placeholder="Dropoff Destination (e.g. Lambert St. Louis Airport)"
                value={form.dropoffAddress}
                variant="dropoff"
                onChange={(addr) => {
                  setForm((prev) => ({ ...prev, dropoffAddress: addr }));
                  if (errors.dropoffAddress) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.dropoffAddress;
                      return next;
                    });
                  }
                }}
                onPlaceSelected={(p: PlaceSelectedDetails) => {
                  setForm((prev) => ({
                    ...prev,
                    dropoffAddress: p.address,
                    dropoffCoordinates: p.coordinates,
                    dropoffPlaceId: p.placeId,
                  }));
                  if (errors.dropoffAddress) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.dropoffAddress;
                      return next;
                    });
                  }
                }}
                required
              />
              {errors.dropoffAddress && (
                <p className="text-xs text-red-600 font-semibold mt-1 ml-1">
                  {errors.dropoffAddress}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Route Stats, Quote Error & Add Stop Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            {isQuoteLoading ? (
              <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                <span>Calculating route estimate...</span>
              </div>
            ) : quoteError ? (
              <span className="text-amber-700 font-semibold">{quoteError}</span>
            ) : quote ? (
              <div>
                Est. Route:{' '}
                <span className="font-bold text-slate-800">
                  {quote.pricing.durationMinutes} min
                </span>{' '}
                &bull;{' '}
                <span className="font-bold text-slate-800">
                  {quote.pricing.distanceMiles.toFixed(1)} mi
                </span>
              </div>
            ) : (
              <span>Enter pickup &amp; dropoff for live route estimate</span>
            )}
          </div>

          {form.intermediateStops.length < 5 && (
            <button
              type="button"
              onClick={onAddStop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Add Stop</span>
            </button>
          )}
        </div>
      </div>

      {/* Outbound Airport Assistance Card (Only shown when an airport is detected in pickup/dropoff) */}
      {airportDetection.isAirportTrip && (
        <FlightAssistanceCard
          variant="outbound"
          detection={airportDetection}
          provideFlightInfo={form.provideFlightInfo}
          onToggleProvideFlightInfo={(checked) =>
            setForm((prev) => ({ ...prev, provideFlightInfo: checked }))
          }
          airline={form.airline}
          onAirlineChange={(val) => setForm((prev) => ({ ...prev, airline: val }))}
          flightNumber={form.flightNumber}
          onFlightNumberChange={(val) => {
            setForm((prev) => ({ ...prev, flightNumber: val }));
            if (errors.flightNumber) {
              setErrors((prev) => {
                const copy = { ...prev };
                delete copy.flightNumber;
                return copy;
              });
            }
          }}
          flightOrigin={form.flightOrigin}
          onFlightOriginChange={(val) => setForm((prev) => ({ ...prev, flightOrigin: val }))}
          tailNumber={form.tailNumber}
          onTailNumberChange={(val) => {
            setForm((prev) => ({ ...prev, tailNumber: val }));
            if (errors.tailNumber) {
              setErrors((prev) => {
                const copy = { ...prev };
                delete copy.tailNumber;
                return copy;
              });
            }
          }}
          fboFacility={form.fboFacility}
          onFboFacilityChange={(val) => setForm((prev) => ({ ...prev, fboFacility: val }))}
          hasCheckedLuggage={form.hasCheckedLuggage}
          onHasCheckedLuggageChange={(checked) =>
            setForm((prev) => ({ ...prev, hasCheckedLuggage: checked }))
          }
          fboFacilities={COMMON_FBO_FACILITIES}
          lambertPickupInstructions={bookingConfig.lambertPickupInstructions}
          flightNumberError={errors.flightNumber}
          tailNumberError={errors.tailNumber}
          allowLiveCheck={false}
          serviceDate={form.scheduledDate || todayLocalDate}
          scheduledPickupIso={
            form.timingType === 'later' && form.scheduledDate && form.scheduledTime
              ? (() => {
                  const d = new Date(`${form.scheduledDate}T${form.scheduledTime}:00`);
                  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
                })()
              : undefined
          }
          flightTelemetry={outboundFlightTelemetry}
          onFlightTelemetryChange={setOutboundFlightTelemetry}
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
              timingType: 'later',
              scheduledDate: `${yyyy}-${mm}-${dd}`,
              scheduledTime: `${hh}:${min}`,
            }));
          }}
        />
      )}
    </div>
  );
}
