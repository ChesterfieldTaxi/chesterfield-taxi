import React, { useState } from 'react';
import type { GeoPoint, TripPricing } from '../../../../core/types';
import type { OversizedBagCategory } from '../../../../core/types/config';
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import {
  MAJOR_AIRLINES,
  parseFlightIdent,
  type AirportDetectionResult,
} from '../../../../core/config/airports';
import {
  DAYS_OF_WEEK,
  DISPATCH_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  isVehicleChoiceSelected,
  resolveVehicleEngineId,
  stepLuggageCount,
  type BookingVehicleChoice as VehicleChoice,
  type DispatchVehicleOption,
  type UseBookingWaypointsResult,
  type VehicleCapacityInfo,
} from '../../../../core/hooks/booking';
import { DispatchLocationInput } from '../DispatchLocationInput';
import { FlightTelemetryCheckPanel } from '../../booking/FlightAssistanceCard';
import { ModernDatePicker, ModernTimePicker } from '../../../ui/ModernDateTimePicker';
import {
  LockIcon,
  LuggageIcon,
  PlaneIcon,
  PlaneLandingIcon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  UserIcon,
} from '../../../ui/Icons';
import { Select } from '../../../ui/Select';

export interface DispatchReturnRepeatSectionProps {
  isCompleted: boolean;
  isCancelled: boolean;
  hasLinkedTrip: boolean;
  isReturnRide: boolean;
  linkedTripId?: string;
  returnScheduledTime?: string;
  onOpenLinkedTrip?: (linkedTripId: string) => void;
  scheduledDate: string;
  returnTrip: boolean;
  setReturnTrip: (val: boolean) => void;
  returnPickupAddress: string;
  setReturnPickupAddress: (val: string) => void;
  setReturnPickupCoordinates: (val: GeoPoint | undefined) => void;
  returnDropoffAddress: string;
  setReturnDropoffAddress: (val: string) => void;
  setReturnDropoffCoordinates: (val: GeoPoint | undefined) => void;
  returnIntermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
  returnWaypoints: UseBookingWaypointsResult<{
    address: string;
    coordinates?: GeoPoint;
    placeId?: string;
  }>;
  returnEstimatedDurationMinutes: number;
  returnEstimatedDistanceMiles: number;
  returnAirportDetection: AirportDetectionResult;
  returnProvideFlightInfo: boolean;
  setReturnProvideFlightInfo: (val: boolean) => void;
  returnAirline: string;
  setReturnAirline: (val: string) => void;
  returnFlightNumber: string;
  setReturnFlightNumber: (val: string) => void;
  returnFlightOrigin: string;
  setReturnFlightOrigin: (val: string) => void;
  returnTailNumber: string;
  setReturnTailNumber: (val: string) => void;
  returnFboFacility: string;
  setReturnFboFacility: (val: string) => void;
  returnHasCheckedLuggage: boolean;
  setReturnHasCheckedLuggage: (val: boolean) => void;
  returnFlightTelemetry: FlightTelemetrySnapshot | null;
  setReturnFlightTelemetry: (val: FlightTelemetrySnapshot | null) => void;
  returnDate: string;
  setReturnDate: (val: string) => void;
  returnTime: string;
  setReturnTime: (val: string) => void;
  returnPassengers: number;
  setReturnPassengers: React.Dispatch<React.SetStateAction<number>>;
  returnCarryOnBags: number;
  setReturnCarryOnBags: (val: number) => void;
  returnCheckedBags: number;
  setReturnCheckedBags: (val: number) => void;
  setReturnBags: (val: number) => void;
  returnTotalMaxPassengers: number;
  returnTotalMaxBags: number;
  returnHasOversizedLuggage: boolean;
  setReturnHasOversizedLuggage: (val: boolean) => void;
  returnOversizedBags: Record<string, number>;
  setReturnOversizedBags: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  returnOversizedLuggageNotes: string;
  setReturnOversizedLuggageNotes: (val: string) => void;
  returnTotalOversizedCount: number;
  oversizedCategories: OversizedBagCategory[];
  returnCarSeats: boolean;
  returnRearFacing: number;
  setReturnRearFacing: React.Dispatch<React.SetStateAction<number>>;
  returnFrontFacing: number;
  setReturnFrontFacing: React.Dispatch<React.SetStateAction<number>>;
  returnBooster: number;
  setReturnBooster: React.Dispatch<React.SetStateAction<number>>;
  carSeatLimits: {
    maxRearFacing: number;
    maxFrontFacing: number;
    maxBooster: number;
    maxTotalCarSeats: number;
  };
  returnVehicles: Array<VehicleChoice>;
  dispatchVehicleOptions: DispatchVehicleOption[];
  vehicleCapacities: Record<string, VehicleCapacityInfo>;
  activeAdminVehicleIds: string[];
  returnVehicleQuotes: Record<string, TripPricing>;
  autoCreateReturnTrip: boolean;
  setAutoCreateReturnTrip: (val: boolean) => void;
  repeat: boolean;
  setRepeat: (val: boolean) => void;
  repeatFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
  setRepeatFrequency: (val: 'daily' | 'weekdays' | 'weekly' | 'custom') => void;
  repeatDays: string[];
  setRepeatDays: (val: string[]) => void;
  repeatOccurrences: number;
  setRepeatOccurrences: (val: number) => void;
  repeatUntilDate: string;
  setRepeatUntilDate: (val: string) => void;
  repeatWeeksPattern: 'all' | 'odd' | 'even';
  setRepeatWeeksPattern: (val: 'all' | 'odd' | 'even') => void;
  repeatSkipDates?: string[];
  setRepeatSkipDates?: (val: string[]) => void;
  onSwapReturnRoute: () => void;
  onToggleReturnCarSeats: (checked: boolean) => void;
  onAddReturnVehicle: () => void;
  onRemoveReturnVehicle: (index: number) => void;
  onUpdateReturnVehicle: (index: number, choice: VehicleChoice) => void;
  onToggleRepeatDay: (day: string) => void;
}

export function DispatchReturnRepeatSection({
  isCompleted,
  isCancelled,
  hasLinkedTrip,
  isReturnRide,
  linkedTripId,
  returnScheduledTime,
  onOpenLinkedTrip,
  scheduledDate,
  returnTrip,
  setReturnTrip,
  returnPickupAddress,
  setReturnPickupAddress,
  setReturnPickupCoordinates,
  returnDropoffAddress,
  setReturnDropoffAddress,
  setReturnDropoffCoordinates,
  returnIntermediateStops,
  returnWaypoints,
  returnEstimatedDurationMinutes,
  returnEstimatedDistanceMiles,
  returnAirportDetection,
  returnProvideFlightInfo,
  setReturnProvideFlightInfo,
  returnAirline,
  setReturnAirline,
  returnFlightNumber,
  setReturnFlightNumber,
  returnFlightOrigin,
  setReturnFlightOrigin,
  returnTailNumber,
  setReturnTailNumber,
  returnFboFacility,
  setReturnFboFacility,
  returnHasCheckedLuggage,
  setReturnHasCheckedLuggage,
  returnFlightTelemetry,
  setReturnFlightTelemetry,
  returnDate,
  setReturnDate,
  returnTime,
  setReturnTime,
  returnPassengers,
  setReturnPassengers,
  returnCarryOnBags,
  setReturnCarryOnBags,
  returnCheckedBags,
  setReturnCheckedBags,
  setReturnBags,
  returnTotalMaxPassengers,
  returnTotalMaxBags,
  returnHasOversizedLuggage,
  setReturnHasOversizedLuggage,
  returnOversizedBags,
  setReturnOversizedBags,
  returnOversizedLuggageNotes,
  setReturnOversizedLuggageNotes,
  returnTotalOversizedCount,
  oversizedCategories,
  returnCarSeats,
  returnRearFacing,
  setReturnRearFacing,
  returnFrontFacing,
  setReturnFrontFacing,
  returnBooster,
  setReturnBooster,
  carSeatLimits,
  returnVehicles,
  dispatchVehicleOptions,
  vehicleCapacities,
  activeAdminVehicleIds,
  returnVehicleQuotes,
  autoCreateReturnTrip,
  setAutoCreateReturnTrip,
  repeat,
  setRepeat,
  repeatFrequency,
  setRepeatFrequency,
  repeatDays,
  setRepeatDays,
  repeatOccurrences,
  setRepeatOccurrences,
  repeatUntilDate,
  setRepeatUntilDate,
  repeatWeeksPattern,
  setRepeatWeeksPattern,
  repeatSkipDates = [],
  setRepeatSkipDates,
  onSwapReturnRoute,
  onToggleReturnCarSeats,
  onAddReturnVehicle,
  onRemoveReturnVehicle,
  onUpdateReturnVehicle,
  onToggleRepeatDay,
}: DispatchReturnRepeatSectionProps) {
  const [pendingSkipDate, setPendingSkipDate] = useState('');

  const handleAddSkipDate = () => {
    const trimmed = pendingSkipDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return;
    const next = Array.from(new Set([...repeatSkipDates, trimmed])).sort();
    setRepeatSkipDates?.(next);
    setPendingSkipDate('');
  };

  const handleRemoveSkipDate = (dateToRemove: string) => {
    setRepeatSkipDates?.(repeatSkipDates.filter((d) => d !== dateToRemove));
  };

  return (
    <div className="pt-2 border-t border-slate-200 space-y-2">
      {/* Return Trip (Full Route, Details & Vehicles) */}
      <div>
        {hasLinkedTrip ? (
          <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 select-none opacity-80 cursor-not-allowed">
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  className="rounded border-slate-300 text-indigo-600 cursor-not-allowed"
                />
                <span className="font-bold text-indigo-950 text-xs">
                  {isReturnRide ? 'Return Leg (Round Trip)' : 'Outbound Leg (Round Trip)'}
                </span>
              </label>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 inline-flex items-center gap-1">
                <LockIcon className="w-3 h-3 shrink-0" />
                <span>Linked Round-Trip</span>
              </span>
            </div>

            <div className="text-xs text-indigo-900 leading-relaxed">
              {isReturnRide ? (
                <p>
                  This booking represents the <strong>return leg</strong> of a round-trip. Linked to
                  primary outbound trip{' '}
                  <span className="font-mono font-bold bg-indigo-100/70 px-1 py-0.5 rounded">
                    #{linkedTripId?.slice(0, 8) || linkedTripId}
                  </span>
                  .
                </p>
              ) : (
                <p>
                  Linked return leg exists
                  {returnScheduledTime
                    ? ` scheduled for ${new Date(returnScheduledTime).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}{' '}
                  (Trip{' '}
                  <span className="font-mono font-bold bg-indigo-100/70 px-1 py-0.5 rounded">
                    #{linkedTripId?.slice(0, 8) || linkedTripId}
                  </span>
                  ).
                </p>
              )}
            </div>

            {linkedTripId && (
              <button
                type="button"
                onClick={() => {
                  onOpenLinkedTrip?.(linkedTripId);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs active:scale-98"
              >
                <span>
                  ↗ {isReturnRide ? 'Open Outbound Leg in New Tab' : 'Open Return Leg in New Tab'}
                </span>
              </button>
            )}
          </div>
        ) : (
          <>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={returnTrip}
                disabled={isCompleted || isCancelled}
                onChange={(e) => setReturnTrip(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="font-bold text-slate-800">Return Trip (Round Trip)</span>
            </label>

            {returnTrip && (
              <div className="mt-1.5 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2.5">
                <div className="text-[10px] font-bold text-indigo-900 tracking-wide uppercase flex items-center gap-1">
                  <RepeatIcon className="w-3 h-3 text-indigo-700 shrink-0" />
                  <span>RETURN LEG SPECIFICATIONS</span>
                </div>

                {/* Return Route Locations */}
                <div className="p-2 bg-white border border-indigo-200 rounded-lg shadow-sm space-y-2">
                  <div className="relative flex items-center gap-2">
                    <button
                      type="button"
                      title="Swap Return Pickup and Dropoff"
                      onClick={onSwapReturnRoute}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors self-center text-sm font-bold"
                    >
                      ↕
                    </button>
                    <div className="flex-1 space-y-1.5">
                      <DispatchLocationInput
                        placeholder="Return Pickup Location"
                        value={returnPickupAddress}
                        variant="pickup"
                        onChange={setReturnPickupAddress}
                        onPlaceSelected={(p) => {
                          setReturnPickupAddress(p.address);
                          setReturnPickupCoordinates(p.coordinates);
                        }}
                        required
                      />

                      {returnIntermediateStops.map((stop, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <DispatchLocationInput
                            placeholder={`Return Stop #${idx + 1}`}
                            value={stop.address}
                            variant="stop"
                            onChange={(val) =>
                              returnWaypoints.updateStopAt(idx, { address: val })
                            }
                            onPlaceSelected={(p) =>
                              returnWaypoints.replaceStopAt(idx, {
                                address: p.address,
                                coordinates: p.coordinates,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => returnWaypoints.removeStopAt(idx)}
                            className="text-slate-400 hover:text-red-500 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <DispatchLocationInput
                        placeholder="Return Dropoff Location"
                        value={returnDropoffAddress}
                        variant="dropoff"
                        onChange={setReturnDropoffAddress}
                        onPlaceSelected={(p) => {
                          setReturnDropoffAddress(p.address);
                          setReturnDropoffCoordinates(p.coordinates);
                        }}
                        required
                      />
                    </div>
                  </div>

                  {/* Return Route Stats & Add Stop */}
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-100 text-[11px] text-slate-500 font-medium">
                    <div>
                      Estimate:{' '}
                      <span className="font-bold text-slate-700">
                        {returnEstimatedDurationMinutes} min
                      </span>
                      ,{' '}
                      <span className="font-bold text-slate-700">
                        {returnEstimatedDistanceMiles} mi
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!returnAirportDetection.isAirportTrip && !returnProvideFlightInfo && (
                        <button
                          type="button"
                          onClick={() => setReturnProvideFlightInfo(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-all shadow-2xs active:scale-95"
                        >
                          <PlaneIcon className="w-3.5 h-3.5 text-indigo-600" />
                          <span>+ Flight Info</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={returnWaypoints.addStop}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-all shadow-2xs active:scale-95"
                      >
                        <PlusIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Add stop</span>
                      </button>
                    </div>
                  </div>

                  {/* Return Flight / Aviation Details Box */}
                  {(returnAirportDetection.isAirportTrip || returnProvideFlightInfo) && (
                    <div className="p-3 bg-white/90 border border-indigo-200 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                          <PlaneLandingIcon
                            className={`w-4 h-4 text-indigo-600 ${
                              returnAirportDetection.isDropoffAirport ? 'rotate-45' : ''
                            }`}
                          />
                          <span>
                            {returnAirportDetection.isPrivateAviation
                              ? returnAirportDetection.isPickupAirport
                                ? `${
                                    returnAirportDetection.airport?.iataCode || 'Private Airport'
                                  } Return Private Aviation Arrival`
                                : `${
                                    returnAirportDetection.airport?.iataCode || 'Private Airport'
                                  } Return Private Aviation Dropoff`
                              : returnAirportDetection.isPickupAirport
                              ? `${
                                  returnAirportDetection.airport?.iataCode || 'Airport'
                                } Return Arrival Details`
                              : `${
                                  returnAirportDetection.airport?.iataCode || 'Airport'
                                } Return Dropoff Details`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200 shadow-2xs">
                            <input
                              type="checkbox"
                              checked={returnProvideFlightInfo}
                              onChange={(e) => setReturnProvideFlightInfo(e.target.checked)}
                              className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                            />
                            <span>
                              {returnAirportDetection.isPickupAirport
                                ? 'Track Inbound Flight'
                                : returnAirportDetection.isPrivateAviation
                                ? 'Provide Aviation Details'
                                : 'Provide Airline'}
                            </span>
                          </label>
                          <span className="text-[10px] bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                            {returnAirportDetection.isPrivateAviation ? (
                              <>
                                <PlaneIcon className="w-3 h-3 shrink-0" />
                                <span>Private Aviation (FBO)</span>
                              </>
                            ) : returnAirportDetection.isPickupAirport ? (
                              'Arrival Tracking'
                            ) : (
                              'Terminal Routing'
                            )}
                          </span>
                        </div>
                      </div>

                      {returnProvideFlightInfo && (
                        <div className="space-y-2 pt-0.5">
                          {returnAirportDetection.isPrivateAviation ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                  FBO Facility
                                </span>
                                <input
                                  type="text"
                                  list="dispatch-return-fbo-list"
                                  placeholder="e.g. Signature Flight Support"
                                  value={returnFboFacility}
                                  onChange={(e) => setReturnFboFacility(e.target.value)}
                                  className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs text-slate-800"
                                />
                                <datalist id="dispatch-return-fbo-list">
                                  {COMMON_FBO_FACILITIES.map((fbo) => (
                                    <option key={fbo} value={fbo} />
                                  ))}
                                </datalist>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                  Tail #
                                </span>
                                <input
                                  type="text"
                                  placeholder="e.g. N12345"
                                  value={returnTailNumber}
                                  onChange={(e) =>
                                    setReturnTailNumber(e.target.value.toUpperCase())
                                  }
                                  className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase font-mono font-bold"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                  {returnAirportDetection.isPickupAirport
                                    ? 'Origin'
                                    : 'Destination'}
                                </span>
                                <input
                                  type="text"
                                  placeholder="e.g. TEB, VNY, PWK"
                                  value={returnFlightOrigin}
                                  onChange={(e) =>
                                    setReturnFlightOrigin(e.target.value.toUpperCase())
                                  }
                                  className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase"
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    Airline
                                  </span>
                                  <Select
                                    size="xs"
                                    searchable
                                    searchPlaceholder="Search airline or IATA code..."
                                    value={returnAirline}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setReturnAirline(v);
                                      const next = parseFlightIdent(v, returnFlightNumber);
                                      if (
                                        returnFlightTelemetry &&
                                        returnFlightTelemetry.flightIdent !== next.flightIdent
                                      ) {
                                        setReturnFlightTelemetry(null);
                                      }
                                    }}
                                    triggerClassName="border-indigo-200"
                                  >
                                    <option value="">Select Airline</option>
                                    {MAJOR_AIRLINES.map((al) => (
                                      <option key={al.code} value={al.name}>
                                        {al.name} ({al.code})
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    Flight #
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{1,4}"
                                    maxLength={4}
                                    placeholder="e.g. 1234"
                                    value={returnFlightNumber}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                      setReturnFlightNumber(val);
                                      const next = parseFlightIdent(returnAirline, val);
                                      if (
                                        returnFlightTelemetry &&
                                        returnFlightTelemetry.flightIdent !== next.flightIdent
                                      ) {
                                        setReturnFlightTelemetry(null);
                                      }
                                    }}
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs font-mono font-bold"
                                  />
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport
                                      ? 'Origin'
                                      : 'Destination'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. ORD, ATL, DEN"
                                    value={returnFlightOrigin}
                                    onChange={(e) =>
                                      setReturnFlightOrigin(e.target.value.toUpperCase())
                                    }
                                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs uppercase"
                                  />
                                </div>
                              </div>

                              <FlightTelemetryCheckPanel
                                compact
                                allowLiveCheck={true}
                                airline={returnAirline}
                                flightNumber={returnFlightNumber}
                                flightOrigin={returnFlightOrigin}
                                onFlightOriginChange={setReturnFlightOrigin}
                                hasCheckedLuggage={returnHasCheckedLuggage}
                                isPickupAirport={returnAirportDetection.isPickupAirport}
                                isDropoffAirport={returnAirportDetection.isDropoffAirport}
                                airportIataCode={returnAirportDetection.airport?.iataCode || 'STL'}
                                serviceDate={returnDate || scheduledDate}
                                bookingType="scheduled"
                                scheduledPickupIso={
                                  returnDate
                                    ? (() => {
                                        const d = new Date(
                                          `${returnDate}T${returnTime || '12:00'}:00`
                                        );
                                        return Number.isFinite(d.getTime())
                                          ? d.toISOString()
                                          : undefined;
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
                                  setReturnDate(`${yyyy}-${mm}-${dd}`);
                                  setReturnTime(`${hh}:${min}`);
                                }}
                              />
                            </>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-indigo-200/60 text-[11px] text-indigo-950">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={returnHasCheckedLuggage}
                                onChange={(e) => setReturnHasCheckedLuggage(e.target.checked)}
                                className="rounded border-indigo-300 text-indigo-600"
                              />
                              <span>Checked Baggage</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Return Date & Time */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <span className="block text-[9px] text-indigo-700 font-semibold mb-0.5">
                      Return Date
                    </span>
                    <ModernDatePicker
                      size="sm"
                      value={returnDate}
                      minDate={scheduledDate || undefined}
                      onChange={(val) => setReturnDate(val)}
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] text-indigo-700 font-semibold mb-0.5">
                      Return Time
                    </span>
                    <ModernTimePicker
                      size="sm"
                      value={returnTime}
                      onChange={(val) => setReturnTime(val)}
                    />
                  </div>
                </div>

                {/* Return Trip Details: Compact 3-Column Passengers, Carry-on & Checked Steppers */}
                <div className="p-2 bg-white border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-indigo-900 uppercase tracking-wide">
                      Return Passengers &amp; Luggage
                    </span>
                    <span className="text-slate-500 font-medium">
                      Max {returnTotalMaxPassengers}{' '}
                      {returnTotalMaxPassengers === 1 ? 'Passenger' : 'Passengers'} •{' '}
                      {returnTotalMaxBags} {returnTotalMaxBags === 1 ? 'Bag' : 'Bags'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Return Passengers */}
                    <div className="p-1.5 bg-indigo-50/40 border border-indigo-100 rounded-lg flex flex-col justify-between gap-1 min-w-0">
                      <div className="flex items-center justify-center gap-1 text-indigo-950 text-[10.5px] min-w-0">
                        <UserIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span className="font-bold truncate">Passengers</span>
                      </div>
                      <div className="flex items-center justify-between gap-0.5">
                        <button
                          type="button"
                          aria-label="Decrease return passengers"
                          disabled={returnPassengers <= 1}
                          onClick={() => setReturnPassengers((p) => Math.max(1, p - 1))}
                          className="w-6 h-6 rounded-md bg-white hover:bg-slate-100 border border-indigo-200 font-bold flex items-center justify-center text-slate-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          &minus;
                        </button>
                        <span className="min-w-[1.1rem] text-center font-extrabold text-xs text-slate-900">
                          {returnPassengers}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase return passengers"
                          onClick={() => setReturnPassengers((p) => p + 1)}
                          className="w-6 h-6 rounded-md bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 font-bold flex items-center justify-center text-indigo-700 text-xs leading-none cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Return Carry-on */}
                    <div className="p-1.5 bg-indigo-50/40 border border-indigo-100 rounded-lg flex flex-col justify-between gap-1 min-w-0">
                      <div className="flex items-center justify-center gap-1 text-indigo-950 text-[10.5px] min-w-0">
                        <LuggageIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span className="font-bold truncate">Carry-on</span>
                      </div>
                      <div className="flex items-center justify-between gap-0.5">
                        <button
                          type="button"
                          aria-label="Decrease return carry-on bags"
                          disabled={returnCarryOnBags <= 0}
                          onClick={() => {
                            const stepped = stepLuggageCount(
                              returnCarryOnBags,
                              returnCheckedBags,
                              'carryOn',
                              -1,
                              returnTotalMaxBags
                            );
                            setReturnCarryOnBags(stepped.carryOnBags);
                            setReturnBags(stepped.bags);
                          }}
                          className="w-6 h-6 rounded-md bg-white hover:bg-slate-100 border border-indigo-200 font-bold flex items-center justify-center text-slate-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          &minus;
                        </button>
                        <span className="min-w-[1.1rem] text-center font-extrabold text-xs text-slate-900">
                          {returnCarryOnBags}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase return carry-on bags"
                          disabled={returnCarryOnBags + returnCheckedBags >= returnTotalMaxBags}
                          onClick={() => {
                            const stepped = stepLuggageCount(
                              returnCarryOnBags,
                              returnCheckedBags,
                              'carryOn',
                              1,
                              returnTotalMaxBags
                            );
                            setReturnCarryOnBags(stepped.carryOnBags);
                            setReturnBags(stepped.bags);
                          }}
                          className="w-6 h-6 rounded-md bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 font-bold flex items-center justify-center text-indigo-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Return Checked */}
                    <div className="p-1.5 bg-indigo-50/40 border border-indigo-100 rounded-lg flex flex-col justify-between gap-1 min-w-0">
                      <div className="flex items-center justify-center gap-1 text-indigo-950 text-[10.5px] min-w-0">
                        <LuggageIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span className="font-bold truncate">Checked</span>
                      </div>
                      <div className="flex items-center justify-between gap-0.5">
                        <button
                          type="button"
                          aria-label="Decrease return checked bags"
                          disabled={returnCheckedBags <= 0}
                          onClick={() => {
                            const stepped = stepLuggageCount(
                              returnCarryOnBags,
                              returnCheckedBags,
                              'checked',
                              -1,
                              returnTotalMaxBags
                            );
                            setReturnCheckedBags(stepped.checkedBags);
                            setReturnBags(stepped.bags);
                          }}
                          className="w-6 h-6 rounded-md bg-white hover:bg-slate-100 border border-indigo-200 font-bold flex items-center justify-center text-slate-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          &minus;
                        </button>
                        <span className="min-w-[1.1rem] text-center font-extrabold text-xs text-slate-900">
                          {returnCheckedBags}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase return checked bags"
                          disabled={returnCarryOnBags + returnCheckedBags >= returnTotalMaxBags}
                          onClick={() => {
                            const stepped = stepLuggageCount(
                              returnCarryOnBags,
                              returnCheckedBags,
                              'checked',
                              1,
                              returnTotalMaxBags
                            );
                            setReturnCheckedBags(stepped.checkedBags);
                            setReturnBags(stepped.bags);
                          }}
                          className="w-6 h-6 rounded-md bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 font-bold flex items-center justify-center text-indigo-700 text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Return Oversized Cargo Toggle & Panel */}
                  <label
                    className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border cursor-pointer select-none transition-colors ${
                      returnHasOversizedLuggage
                        ? 'bg-indigo-50/80 border-indigo-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={returnHasOversizedLuggage}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setReturnHasOversizedLuggage(checked);
                          if (!checked) {
                            setReturnOversizedBags({});
                            setReturnOversizedLuggageNotes('');
                          }
                        }}
                        className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Return Oversized Cargo (Golf / Skis)</span>
                    </span>
                    {returnHasOversizedLuggage && returnTotalOversizedCount > 0 && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                        {returnTotalOversizedCount} item{returnTotalOversizedCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </label>

                  {returnHasOversizedLuggage && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 animate-in fade-in duration-150">
                      {oversizedCategories.map((cat) => {
                        const count = returnOversizedBags[cat.id] || 0;
                        return (
                          <div
                            key={`disp-ret-ov-${cat.id}`}
                            className="flex items-center justify-between gap-2 text-[11px] bg-white px-2 py-1.5 rounded border border-slate-200"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-semibold text-slate-800">{cat.label}</span>
                              {cat.fee > 0 && (
                                <span className="text-[10px] font-bold text-emerald-700">
                                  +${cat.fee.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={count <= 0}
                                onClick={() =>
                                  setReturnOversizedBags((prev) => ({
                                    ...prev,
                                    [cat.id]: Math.max(0, (prev[cat.id] || 0) - 1),
                                  }))
                                }
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700 disabled:opacity-40 cursor-pointer"
                              >
                                &minus;
                              </button>
                              <span className="w-4 text-center font-bold text-slate-900">
                                {count}
                              </span>
                              <button
                                type="button"
                                disabled={count >= (cat.maxCount || 4)}
                                onClick={() =>
                                  setReturnOversizedBags((prev) => ({
                                    ...prev,
                                    [cat.id]: Math.min(cat.maxCount || 4, (prev[cat.id] || 0) + 1),
                                  }))
                                }
                                className="w-5 h-5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 font-bold flex items-center justify-center text-indigo-700 disabled:opacity-40 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <input
                        type="text"
                        placeholder="Return cargo notes (e.g. dimensions, fragile instruments)"
                        value={returnOversizedLuggageNotes}
                        onChange={(e) => setReturnOversizedLuggageNotes(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>

                {/* Return Car Seats Toggle & Counters */}
                <div className="p-2 bg-white border border-indigo-200 rounded space-y-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-indigo-900 font-medium">
                    <input
                      type="checkbox"
                      checked={returnCarSeats}
                      onChange={(e) => onToggleReturnCarSeats(e.target.checked)}
                      className="rounded border-indigo-300 text-indigo-600"
                    />
                    <span>Return Car Seats Required</span>
                  </label>

                  {returnCarSeats && (
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[10px]">
                      <div className="p-1 bg-indigo-50/50 rounded border border-indigo-100 text-center">
                        <div className="text-slate-600 font-semibold mb-0.5">Rear-Facing</div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReturnRearFacing((c) => Math.max(0, c - 1))}
                            className="w-4 h-4 rounded bg-white border"
                          >
                            -
                          </button>
                          <span className="font-bold">{returnRearFacing}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setReturnRearFacing((c) => Math.min(carSeatLimits.maxRearFacing, c + 1))
                            }
                            className="w-4 h-4 rounded bg-white border"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="p-1 bg-indigo-50/50 rounded border border-indigo-100 text-center">
                        <div className="text-slate-600 font-semibold mb-0.5">Front-Facing</div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReturnFrontFacing((c) => Math.max(0, c - 1))}
                            className="w-4 h-4 rounded bg-white border"
                          >
                            -
                          </button>
                          <span className="font-bold">{returnFrontFacing}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setReturnFrontFacing((c) =>
                                Math.min(carSeatLimits.maxFrontFacing, c + 1)
                              )
                            }
                            className="w-4 h-4 rounded bg-white border"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="p-1 bg-indigo-50/50 rounded border border-indigo-100 text-center">
                        <div className="text-slate-600 font-semibold mb-0.5">Booster</div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReturnBooster((c) => Math.max(0, c - 1))}
                            className="w-4 h-4 rounded bg-white border"
                          >
                            -
                          </button>
                          <span className="font-bold">{returnBooster}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setReturnBooster((c) => Math.min(carSeatLimits.maxBooster, c + 1))
                            }
                            className="w-4 h-4 rounded bg-white border"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Return Vehicles Section */}
                <div className="p-2 bg-white border border-indigo-200 rounded space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                    <span>Return Vehicles ({returnVehicles.length})</span>
                    <button
                      type="button"
                      onClick={onAddReturnVehicle}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800"
                    >
                      + Add Vehicle
                    </button>
                  </div>
                  {returnVehicles.map((rv, rIdx) => (
                    <div key={rIdx} className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-400 font-bold text-[9px]">#{rIdx + 1}</span>
                      <div className="flex-1 flex flex-wrap gap-1 p-0.5 bg-slate-100 rounded">
                        {dispatchVehicleOptions.map((opt) => {
                          const isSelected = isVehicleChoiceSelected(rv, opt.key, 'wheelchair');
                          const simulatedReturnVehicles = [...returnVehicles];
                          simulatedReturnVehicles[rIdx] = opt.key;
                          const simulatedReturnCapacity = simulatedReturnVehicles.reduce(
                            (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
                            0
                          );
                          const isReturnCapacityInsufficient =
                            simulatedReturnCapacity < returnPassengers;

                          const retEngineId = resolveVehicleEngineId(
                            opt.key,
                            activeAdminVehicleIds
                          );
                          const retLivePrice = returnVehicleQuotes[retEngineId]?.totalFare;

                          return (
                            <button
                              type="button"
                              key={opt.key}
                              disabled={isReturnCapacityInsufficient}
                              onClick={() => onUpdateReturnVehicle(rIdx, opt.key)}
                              title={
                                isReturnCapacityInsufficient
                                  ? `${opt.label} fleet capacity (${simulatedReturnCapacity}p) is insufficient for ${returnPassengers} passengers.`
                                  : `${opt.label} (${opt.maxPassengers}p / ${opt.maxBags}b)${
                                      retLivePrice ? ` • $${Math.ceil(retLivePrice)}` : ''
                                    }`
                              }
                              className={`flex-1 min-w-[54px] py-0.5 px-1 text-center rounded text-[10px] font-bold transition-all truncate ${
                                isReturnCapacityInsufficient
                                  ? 'opacity-35 cursor-not-allowed bg-slate-100 text-slate-400'
                                  : isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {typeof retLivePrice === 'number' && retLivePrice > 0 && (
                                <span
                                  className={`block text-[9.5px] font-mono font-extrabold ${
                                    isSelected ? 'text-indigo-100' : 'text-emerald-700'
                                  }`}
                                >
                                  ${Math.ceil(retLivePrice)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {returnVehicles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveReturnVehicle(rIdx)}
                          className="text-slate-400 hover:text-red-500 px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-indigo-900 text-[11px] select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={autoCreateReturnTrip}
                    onChange={(e) => setAutoCreateReturnTrip(e.target.checked)}
                    className="rounded border-indigo-300 text-indigo-600"
                  />
                  <span className="font-semibold">
                    Automatically generate linked return booking in queue
                  </span>
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {/* Repeat / Recurring (Standing Order Series + Skip Dates) */}
      <div>
        <label className="flex items-center justify-between gap-1.5 cursor-pointer select-none">
          <span className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-bold text-slate-800">Repeat / Recurring Ride</span>
          </span>
          <span className="text-[9.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
            Standing Order Series
          </span>
        </label>

        {repeat && (
          <div className="mt-1.5 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold text-emerald-900 flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <RefreshCwIcon className="w-3 h-3 text-emerald-700 shrink-0" />
                  <span>MANAGED STANDING ORDER SERIES</span>
                </span>
                {returnTrip && (
                  <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded font-bold">
                    Repeats Round Trip
                  </span>
                )}
              </div>
              <p className="text-[10px] text-emerald-800/90 leading-snug">
                Automatically registers a Managed Standing Order Series with skip-date/holiday
                exclusions, preferred staged driver hold, and 1-click horizon extension.
              </p>
            </div>

            {/* Frequency Pills */}
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-emerald-200/50 rounded">
              {(['daily', 'weekdays', 'weekly'] as const).map((freq) => (
                <button
                  type="button"
                  key={freq}
                  onClick={() => {
                    setRepeatFrequency(freq);
                    if (freq === 'weekdays') {
                      setRepeatDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                    } else if (freq === 'daily') {
                      setRepeatDays(DAYS_OF_WEEK);
                    }
                  }}
                  className={`py-1 text-center rounded text-[10px] font-bold capitalize transition-all ${
                    repeatFrequency === freq
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-emerald-700'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>

            {/* Days Selector */}
            <div>
              <span className="block text-[9px] text-emerald-800 font-semibold mb-1">
                Active Days
              </span>
              <div className="flex items-center gap-1">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = repeatDays.includes(day);
                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => onToggleRepeatDay(day)}
                      className={`w-7 h-6 rounded text-[10px] font-bold transition-all ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {day[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Until Date Picker & Weeks Dropdown (All, Odd, Even) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
              <div>
                <span className="block text-[9px] text-emerald-800 font-semibold mb-0.5">
                  Until Date
                </span>
                <ModernDatePicker
                  size="sm"
                  value={repeatUntilDate}
                  minDate={scheduledDate || undefined}
                  onChange={(val) => setRepeatUntilDate(val)}
                />
              </div>
              <div>
                <span className="block text-[9px] text-emerald-800 font-semibold mb-0.5">
                  Weeks Pattern
                </span>
                <Select
                  size="sm"
                  value={repeatWeeksPattern}
                  onChange={(e) =>
                    setRepeatWeeksPattern(e.target.value as 'all' | 'odd' | 'even')
                  }
                  triggerClassName="border-emerald-300"
                >
                  <option value="all">All Weeks</option>
                  <option value="odd">Odd Weeks</option>
                  <option value="even">Even Weeks</option>
                </Select>
              </div>
            </div>

            {/* Occurrences Stepper */}
            <div className="flex items-center justify-between pt-1 border-t border-emerald-200/70">
              <span className="text-[10px] font-semibold text-emerald-800">Estimated Rides</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRepeatOccurrences(Math.max(2, repeatOccurrences - 1))}
                  className="w-5 h-5 rounded bg-white border border-emerald-300 font-bold flex items-center justify-center text-emerald-800"
                >
                  -
                </button>
                <span className="text-xs font-bold text-emerald-900">
                  {repeatOccurrences} rides
                </span>
                <button
                  type="button"
                  onClick={() => setRepeatOccurrences(Math.min(60, repeatOccurrences + 1))}
                  className="w-5 h-5 rounded bg-white border border-emerald-300 font-bold flex items-center justify-center text-emerald-800"
                >
                  +
                </button>
              </div>
            </div>

            {/* Holiday / Skip Dates Picker */}
            <div className="pt-1.5 border-t border-emerald-200/70 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-bold text-emerald-900">
                  Holiday / Skip Dates (Optional)
                </span>
                {repeatSkipDates.length > 0 && (
                  <span className="text-[9px] font-mono font-bold text-emerald-800 bg-white px-1.5 py-0.2 rounded border border-emerald-200">
                    {repeatSkipDates.length} excluded
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={pendingSkipDate}
                  min={scheduledDate || undefined}
                  onChange={(e) => setPendingSkipDate(e.target.value)}
                  className="flex-1 px-2 py-1 bg-white border border-emerald-300 rounded text-[11px] font-mono text-slate-800"
                  aria-label="Holiday or skip date"
                />
                <button
                  type="button"
                  disabled={!pendingSkipDate}
                  onClick={handleAddSkipDate}
                  className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-[10px] transition-colors cursor-pointer shrink-0"
                >
                  + Skip Date
                </button>
              </div>
              {repeatSkipDates.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {repeatSkipDates.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white border border-emerald-300 text-[10px] font-mono font-bold text-emerald-900"
                    >
                      <span>{d}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkipDate(d)}
                        className="text-slate-400 hover:text-rose-600 font-sans cursor-pointer leading-none"
                        title={`Remove skip date ${d}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
