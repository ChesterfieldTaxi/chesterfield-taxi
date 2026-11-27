import React, { useState } from 'react';
import type { GeoPoint, TripPricing } from '../../../../core/types';
import type { OversizedBagCategory } from '../../../../core/types/config';
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import {
  MAJOR_AIRLINES,
  parseFlightIdent,
  resolveStlTerminalInfo,
  type AirportDetectionResult,
} from '../../../../core/config/airports';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import {
  DAYS_OF_WEEK,
  DISPATCH_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  stepLuggageCount,
  type BookingVehicleChoice as VehicleChoice,
  type DispatchVehicleOption,
  type UseBookingWaypointsResult,
  type VehicleCapacityInfo,
} from '../../../../core/hooks/booking';
import { DispatchVehicleSelectorList } from './DispatchVehicleSelectorList';
import { DispatchLocationInput } from '../DispatchLocationInput';
import { AirportCityCombobox } from '../../booking/AirportCityCombobox';
import { FlightTelemetryCheckPanel } from '../../booking/FlightAssistanceCard';
import { ModernDatePicker, ModernTimePicker } from '../../../ui/ModernDateTimePicker';
import { CollapsibleSection } from '../../../ui/CollapsibleSection';
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
    <div className="pt-2 border-t border-border-subtle space-y-2">
      {/* Return Trip (Full Route, Details & Vehicles) */}
      <div>
        {hasLinkedTrip ? (
          <div className="p-3 bg-status-staged-bg/90 border border-status-staged-border rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 select-none opacity-80 cursor-not-allowed">
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  className="rounded border-border-strong text-indigo-600 cursor-not-allowed"
                />
                <span className="font-bold text-status-staged-fg text-xs">
                  {isReturnRide ? 'Return Leg (Round Trip)' : 'Outbound Leg (Round Trip)'}
                </span>
              </label>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-status-staged-bg-strong text-status-staged-fg inline-flex items-center gap-1">
                <LockIcon className="w-3 h-3 shrink-0" />
                <span>Linked Round-Trip</span>
              </span>
            </div>

            <div className="text-xs text-status-staged-fg leading-relaxed">
              {isReturnRide ? (
                <p>
                  This booking represents the <strong>return leg</strong> of a round-trip. Linked to
                  primary outbound trip{' '}
                  <span className="font-mono font-bold bg-status-staged-bg-strong/70 px-1 py-0.5 rounded">
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
                  <span className="font-mono font-bold bg-status-staged-bg-strong/70 px-1 py-0.5 rounded">
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
                className="rounded border-border-strong text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="font-bold text-fg-strong">Return Trip (Round Trip)</span>
            </label>

            {returnTrip && (
              <div className="mt-1.5 p-2.5 bg-status-staged-bg/70 border border-status-staged-border rounded-lg space-y-2.5">
                <div className="text-[10px] font-bold text-status-staged-fg tracking-wide uppercase flex items-center gap-1">
                  <RepeatIcon className="w-3 h-3 text-status-staged-fg shrink-0" />
                  <span>RETURN LEG SPECIFICATIONS</span>
                </div>

                {/* Return Route Locations */}
                <div className="p-2 bg-surface-card border border-status-staged-border rounded-lg shadow-sm space-y-2">
                  <div className="relative flex items-center gap-2">
                    <button
                      type="button"
                      title="Swap Return Pickup and Dropoff"
                      onClick={onSwapReturnRoute}
                      className="p-1 text-fg-subtle hover:text-indigo-600 hover:bg-status-staged-bg rounded transition-colors self-center text-sm font-bold"
                    >
                      ↕
                    </button>
                    <div className="flex-1 space-y-1.5">
                      <DispatchLocationInput
                        placeholder="Return Pickup Location"
                        value={returnPickupAddress}
                        variant="pickup"
                        includeDispatchOnly
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
                            includeDispatchOnly
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
                            className="text-fg-subtle hover:text-red-500 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <DispatchLocationInput
                        placeholder="Return Dropoff Location"
                        value={returnDropoffAddress}
                        variant="dropoff"
                        includeDispatchOnly
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
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-100 text-[11px] text-fg-muted font-medium">
                    <div>
                      Estimate:{' '}
                      <span className="font-bold text-fg-secondary">
                        {returnEstimatedDurationMinutes} min
                      </span>
                      ,{' '}
                      <span className="font-bold text-fg-secondary">
                        {returnEstimatedDistanceMiles} mi
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!returnAirportDetection.isAirportTrip && !returnProvideFlightInfo && (
                        <button
                          type="button"
                          onClick={() => setReturnProvideFlightInfo(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-staged-bg hover:bg-status-staged-bg-strong text-status-staged-fg font-bold text-xs border border-status-staged-border transition-all shadow-2xs active:scale-95"
                        >
                          <PlaneIcon className="w-3.5 h-3.5 text-indigo-600" />
                          <span>+ Flight Info</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={returnWaypoints.addStop}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-staged-bg hover:bg-status-staged-bg-strong text-status-staged-fg font-bold text-xs border border-status-staged-border transition-all shadow-2xs active:scale-95"
                      >
                        <PlusIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Add stop</span>
                      </button>
                    </div>
                  </div>

                  {/* Return Flight / Aviation Details Box */}
                  <CollapsibleSection
                    isOpen={returnAirportDetection.isAirportTrip || returnProvideFlightInfo}
                  >
                    {returnAirportDetection.isDropoffAirport &&
                    !returnAirportDetection.isPickupAirport &&
                    !returnAirportDetection.isPrivateAviation ? (
                      <div className="p-2.5 bg-surface-card/90 border border-status-staged-border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-status-staged-fg font-bold text-xs">
                            <PlaneLandingIcon className="w-3.5 h-3.5 text-indigo-600 rotate-45" />
                            <span>
                              {returnAirportDetection.airport?.shortName || 'Airport'} Return Dropoff
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-fg-muted bg-surface-subtle px-1.5 py-0.5 rounded border border-border-subtle">
                            Optional
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <div className="sm:col-span-5">
                            <Select
                              size="xs"
                              searchable
                              searchPlaceholder="Search airline or IATA code..."
                              value={returnAirline}
                              options={[
                                { value: '', label: 'Select Airline (Optional)' },
                                ...MAJOR_AIRLINES.map((al) => ({
                                  value: al.name,
                                  label: `${al.name} (${al.code})`,
                                  selectedLabel: al.code,
                                })),
                              ]}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v && !returnProvideFlightInfo) setReturnProvideFlightInfo(true);
                                setReturnAirline(v);
                                if (returnFlightTelemetry) setReturnFlightTelemetry(null);
                              }}
                              triggerClassName="border-status-staged-border"
                            />
                          </div>
                          <div className="sm:col-span-7 text-[11px] text-fg-secondary leading-snug">
                            {returnAirline ? (
                              <span>
                                <span className="font-bold text-fg-strong">
                                  {resolveStlTerminalInfo(
                                    returnAirline,
                                    returnAirportDetection.airport?.iataCode || 'STL',
                                    getAdminConfigService().getCachedSettings().customerBookingConfig
                                  ).terminal || 'Terminal'}
                                  :{' '}
                                </span>
                                {
                                  resolveStlTerminalInfo(
                                    returnAirline,
                                    returnAirportDetection.airport?.iataCode || 'STL',
                                    getAdminConfigService().getCachedSettings().customerBookingConfig
                                  ).pickupDoorGuidance
                                }
                              </span>
                            ) : (
                              <span>
                                Select airline for terminal dropoff door hint (T1: AA, DL, UA · T2: WN, LH).
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                    <div className="p-3 bg-surface-card/90 border border-status-staged-border rounded-lg space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-status-staged-fg font-bold text-xs">
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
                          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-status-staged-fg bg-surface-card px-2 py-0.5 rounded border border-status-staged-border shadow-2xs">
                            <input
                              type="checkbox"
                              checked={returnProvideFlightInfo}
                              onChange={(e) => setReturnProvideFlightInfo(e.target.checked)}
                              className="rounded border-status-staged-border text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                            />
                            <span>
                              {returnAirportDetection.isPickupAirport
                                ? 'Track Inbound Flight'
                                : 'Provide Aviation Details'}
                            </span>
                          </label>
                          {returnAirportDetection.isPrivateAviation && (
                            <span className="text-[10px] bg-status-staged-bg-strong text-status-staged-fg px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                              <PlaneIcon className="w-3 h-3 shrink-0" />
                              <span>Private Aviation (FBO)</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <CollapsibleSection isOpen={returnProvideFlightInfo}>
                        <div className="space-y-2 pt-0.5">
                          {returnAirportDetection.isPrivateAviation ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                                  FBO Facility
                                </span>
                                <input
                                  type="text"
                                  list="dispatch-return-fbo-list"
                                  placeholder="e.g. Signature Flight Support"
                                  value={returnFboFacility}
                                  onChange={(e) => setReturnFboFacility(e.target.value)}
                                  className="w-full px-2 py-1 bg-surface-card border border-status-staged-border rounded text-xs text-fg-strong"
                                />
                                <datalist id="dispatch-return-fbo-list">
                                  {COMMON_FBO_FACILITIES.map((fbo) => (
                                    <option key={fbo} value={fbo} />
                                  ))}
                                </datalist>
                              </div>
                              <div>
                                <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                                  Tail #
                                </span>
                                <input
                                  type="text"
                                  placeholder="e.g. N12345"
                                  value={returnTailNumber}
                                  onChange={(e) =>
                                    setReturnTailNumber(e.target.value.toUpperCase())
                                  }
                                  className="w-full px-2 py-1 bg-surface-card border border-status-staged-border rounded text-xs uppercase font-mono font-bold"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                                  {returnAirportDetection.isPickupAirport
                                    ? 'Origin'
                                    : 'Destination'}
                                </span>
                                <AirportCityCombobox
                                  size="xs"
                                  preferPrivateFbo
                                  value={returnFlightOrigin}
                                  onChange={setReturnFlightOrigin}
                                  placeholder="e.g. TEB Teterboro"
                                  borderClassName="border-status-staged-border"
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                <div className="sm:col-span-5">
                                  <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                                    Airline
                                  </span>
                                  <Select
                                    size="xs"
                                    searchable
                                    searchPlaceholder="Search airline or IATA code..."
                                    value={returnAirline}
                                    options={[
                                      { value: '', label: 'Select Airline' },
                                      ...MAJOR_AIRLINES.map((al) => ({
                                        value: al.name,
                                        label: `${al.name} (${al.code})`,
                                        selectedLabel: al.code,
                                      })),
                                    ]}
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
                                    triggerClassName="border-status-staged-border"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                                    Flight #
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{1,4}"
                                    maxLength={4}
                                    placeholder="1234"
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
                                    className="w-full px-2 py-1 bg-surface-card border border-status-staged-border rounded text-xs font-mono font-bold"
                                  />
                                </div>
                                <div className="sm:col-span-5">
                                  <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                                    {returnAirportDetection.isPickupAirport
                                      ? 'Origin'
                                      : 'Destination'}
                                  </span>
                                  <AirportCityCombobox
                                    size="xs"
                                    value={returnFlightOrigin}
                                    onChange={setReturnFlightOrigin}
                                    placeholder="e.g. YYZ Toronto"
                                    borderClassName="border-status-staged-border"
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

                          <div className="flex items-center justify-between pt-1 border-t border-status-staged-border/60 text-[11px] text-status-staged-fg">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={returnHasCheckedLuggage}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setReturnHasCheckedLuggage(checked);
                                  setReturnCheckedBags(
                                    checked ? Math.max(1, returnCheckedBags) : 0
                                  );
                                }}
                                className="rounded border-status-staged-border text-indigo-600"
                              />
                              <span>Checked Baggage</span>
                            </label>
                          </div>
                        </div>
                      </CollapsibleSection>
                    </div>
                    )}
                  </CollapsibleSection>
                </div>

                {/* Return Date & Time */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <span className="block text-[9px] text-status-staged-fg font-semibold mb-0.5">
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
                    <span className="block text-[9px] text-status-staged-fg font-semibold mb-0.5">
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
                <div className="p-2 bg-surface-card border border-status-staged-border rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-status-staged-fg uppercase tracking-wide">
                      Return Passengers &amp; Luggage
                    </span>
                    <span className="text-fg-muted font-medium">
                      Max {returnTotalMaxPassengers}{' '}
                      {returnTotalMaxPassengers === 1 ? 'Passenger' : 'Passengers'} •{' '}
                      {returnTotalMaxBags} {returnTotalMaxBags === 1 ? 'Bag' : 'Bags'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Return Passengers */}
                    <div className="p-1.5 bg-status-staged-bg/40 border border-indigo-100 rounded-lg flex flex-col justify-between gap-1 min-w-0">
                      <div className="flex items-center justify-center gap-1 text-status-staged-fg text-[10.5px] min-w-0">
                        <UserIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span className="font-bold truncate">Passengers</span>
                      </div>
                      <div className="flex items-center justify-between gap-0.5">
                        <button
                          type="button"
                          aria-label="Decrease return passengers"
                          disabled={returnPassengers <= 1}
                          onClick={() => setReturnPassengers((p) => Math.max(1, p - 1))}
                          className="w-6 h-6 rounded-md bg-surface-card hover:bg-surface-muted border border-status-staged-border font-bold flex items-center justify-center text-fg-secondary text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          &minus;
                        </button>
                        <span className="min-w-[1.1rem] text-center font-extrabold text-xs text-fg-primary">
                          {returnPassengers}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase return passengers"
                          onClick={() => setReturnPassengers((p) => p + 1)}
                          className="w-6 h-6 rounded-md bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg text-xs leading-none cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Return Carry-on */}
                    <div className="p-1.5 bg-status-staged-bg/40 border border-indigo-100 rounded-lg flex flex-col justify-between gap-1 min-w-0">
                      <div className="flex items-center justify-center gap-1 text-status-staged-fg text-[10.5px] min-w-0">
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
                          className="w-6 h-6 rounded-md bg-surface-card hover:bg-surface-muted border border-status-staged-border font-bold flex items-center justify-center text-fg-secondary text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          &minus;
                        </button>
                        <span className="min-w-[1.1rem] text-center font-extrabold text-xs text-fg-primary">
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
                          className="w-6 h-6 rounded-md bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Return Checked */}
                    <div className="p-1.5 bg-status-staged-bg/40 border border-indigo-100 rounded-lg flex flex-col justify-between gap-1 min-w-0">
                      <div className="flex items-center justify-center gap-1 text-status-staged-fg text-[10.5px] min-w-0">
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
                          className="w-6 h-6 rounded-md bg-surface-card hover:bg-surface-muted border border-status-staged-border font-bold flex items-center justify-center text-fg-secondary text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          &minus;
                        </button>
                        <span className="min-w-[1.1rem] text-center font-extrabold text-xs text-fg-primary">
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
                          className="w-6 h-6 rounded-md bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg text-xs leading-none disabled:opacity-40 cursor-pointer shrink-0"
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
                        ? 'bg-status-staged-bg/80 border-status-staged-border'
                        : 'bg-surface-subtle border-border-subtle hover:bg-surface-muted/70'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-strong">
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
                        className="rounded border-status-staged-border text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Return Oversized Cargo (Golf / Skis)</span>
                    </span>
                    {returnHasOversizedLuggage && returnTotalOversizedCount > 0 && (
                      <span className="text-[10px] font-bold text-status-staged-fg bg-surface-card px-1.5 py-0.5 rounded border border-status-staged-border">
                        {returnTotalOversizedCount} item{returnTotalOversizedCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </label>

                  <CollapsibleSection isOpen={returnHasOversizedLuggage}>
                    <div className="p-2 bg-surface-subtle border border-border-subtle rounded-lg space-y-1.5">
                      {oversizedCategories.map((cat) => {
                        const count = returnOversizedBags[cat.id] || 0;
                        return (
                          <div
                            key={`disp-ret-ov-${cat.id}`}
                            className="flex items-center justify-between gap-2 text-[11px] bg-surface-card px-2 py-1.5 rounded border border-border-subtle"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-semibold text-fg-strong">{cat.label}</span>
                              {cat.fee > 0 && (
                                <span className="text-[10px] font-bold text-status-success-fg">
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
                                className="w-5 h-5 rounded bg-surface-muted hover:bg-surface-emphasis border border-border-strong font-bold flex items-center justify-center text-fg-secondary disabled:opacity-40 cursor-pointer"
                              >
                                &minus;
                              </button>
                              <span className="w-4 text-center font-bold text-fg-primary">
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
                                className="w-5 h-5 rounded bg-status-staged-bg hover:bg-status-staged-bg-strong border border-status-staged-border font-bold flex items-center justify-center text-status-staged-fg disabled:opacity-40 cursor-pointer"
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
                        className="w-full px-2 py-1.5 bg-surface-card border border-border-strong rounded text-[11px] text-fg-strong placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </CollapsibleSection>
                </div>

                {/* Return Car Seats Toggle & Counters */}
                <div className="p-2 bg-surface-card border border-status-staged-border rounded space-y-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-status-staged-fg font-medium">
                    <input
                      type="checkbox"
                      checked={returnCarSeats}
                      onChange={(e) => onToggleReturnCarSeats(e.target.checked)}
                      className="rounded border-status-staged-border text-indigo-600"
                    />
                    <span>Return Car Seats Required</span>
                  </label>

                  <CollapsibleSection isOpen={returnCarSeats}>
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[10px]">
                      <div className="p-1 bg-status-staged-bg/50 rounded border border-indigo-100 text-center">
                        <div className="text-fg-secondary font-semibold mb-0.5">Rear-Facing</div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReturnRearFacing((c) => Math.max(0, c - 1))}
                            className="w-4 h-4 rounded bg-surface-card border"
                          >
                            -
                          </button>
                          <span className="font-bold">{returnRearFacing}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setReturnRearFacing((c) => Math.min(carSeatLimits.maxRearFacing, c + 1))
                            }
                            className="w-4 h-4 rounded bg-surface-card border"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="p-1 bg-status-staged-bg/50 rounded border border-indigo-100 text-center">
                        <div className="text-fg-secondary font-semibold mb-0.5">Front-Facing</div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReturnFrontFacing((c) => Math.max(0, c - 1))}
                            className="w-4 h-4 rounded bg-surface-card border"
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
                            className="w-4 h-4 rounded bg-surface-card border"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="p-1 bg-status-staged-bg/50 rounded border border-indigo-100 text-center">
                        <div className="text-fg-secondary font-semibold mb-0.5">Booster</div>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReturnBooster((c) => Math.max(0, c - 1))}
                            className="w-4 h-4 rounded bg-surface-card border"
                          >
                            -
                          </button>
                          <span className="font-bold">{returnBooster}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setReturnBooster((c) => Math.min(carSeatLimits.maxBooster, c + 1))
                            }
                            className="w-4 h-4 rounded bg-surface-card border"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </CollapsibleSection>
                </div>

                {/* Return Vehicles Section */}
                <DispatchVehicleSelectorList
                  vehicles={returnVehicles}
                  dispatchVehicleOptions={dispatchVehicleOptions}
                  vehicleCapacities={vehicleCapacities}
                  activeAdminVehicleIds={activeAdminVehicleIds}
                  vehicleQuotes={returnVehicleQuotes}
                  passengers={returnPassengers}
                  disabled={isCompleted || isCancelled}
                  title="Return Vehicles"
                  accent="indigo"
                  onAddVehicle={onAddReturnVehicle}
                  onRemoveVehicle={onRemoveReturnVehicle}
                  onUpdateVehicleChoice={onUpdateReturnVehicle}
                />

                <label className="flex items-center gap-2 cursor-pointer text-status-staged-fg text-[11px] select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={autoCreateReturnTrip}
                    onChange={(e) => setAutoCreateReturnTrip(e.target.checked)}
                    className="rounded border-status-staged-border text-indigo-600"
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
              className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
            />
            <span className="font-bold text-fg-strong">Repeat / Recurring Ride</span>
          </span>
          <span className="text-[9.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded bg-status-success-bg-strong text-status-success-fg border border-status-success-border">
            Standing Order Series
          </span>
        </label>

        {repeat && (
          <div className="mt-1.5 p-2.5 bg-status-success-bg/70 border border-status-success-border rounded-lg space-y-2">
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold text-status-success-fg flex items-center justify-between">
                <span className="inline-flex items-center gap-1">
                  <RefreshCwIcon className="w-3 h-3 text-status-success-fg shrink-0" />
                  <span>MANAGED STANDING ORDER SERIES</span>
                </span>
                {returnTrip && (
                  <span className="text-[9px] bg-emerald-200 text-status-success-fg px-1.5 py-0.2 rounded font-bold">
                    Repeats Round Trip
                  </span>
                )}
              </div>
              <p className="text-[10px] text-status-success-fg/90 leading-snug">
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
                      ? 'bg-surface-card text-status-success-fg shadow-xs'
                      : 'text-status-success-fg'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>

            {/* Days Selector */}
            <div>
              <span className="block text-[9px] text-status-success-fg font-semibold mb-1">
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
                          : 'bg-surface-card border border-status-success-border text-status-success-fg hover:bg-status-success-bg-strong'
                      }`}
                    >
                      {day[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Until Date Picker & Weeks Dropdown (All, Odd, Even) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-status-success-border/70">
              <div>
                <span className="block text-[9px] text-status-success-fg font-semibold mb-0.5">
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
                <span className="block text-[9px] text-status-success-fg font-semibold mb-0.5">
                  Weeks Pattern
                </span>
                <Select
                  size="sm"
                  value={repeatWeeksPattern}
                  onChange={(e) =>
                    setRepeatWeeksPattern(e.target.value as 'all' | 'odd' | 'even')
                  }
                  triggerClassName="border-status-success-border"
                >
                  <option value="all">All Weeks</option>
                  <option value="odd">Odd Weeks</option>
                  <option value="even">Even Weeks</option>
                </Select>
              </div>
            </div>

            {/* Occurrences Stepper */}
            <div className="flex items-center justify-between pt-1 border-t border-status-success-border/70">
              <span className="text-[10px] font-semibold text-status-success-fg">Estimated Rides</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRepeatOccurrences(Math.max(2, repeatOccurrences - 1))}
                  className="w-5 h-5 rounded bg-surface-card border border-status-success-border font-bold flex items-center justify-center text-status-success-fg"
                >
                  -
                </button>
                <span className="text-xs font-bold text-status-success-fg">
                  {repeatOccurrences} rides
                </span>
                <button
                  type="button"
                  onClick={() => setRepeatOccurrences(Math.min(60, repeatOccurrences + 1))}
                  className="w-5 h-5 rounded bg-surface-card border border-status-success-border font-bold flex items-center justify-center text-status-success-fg"
                >
                  +
                </button>
              </div>
            </div>

            {/* Holiday / Skip Dates Picker */}
            <div className="pt-1.5 border-t border-status-success-border/70 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-bold text-status-success-fg">
                  Holiday / Skip Dates (Optional)
                </span>
                {repeatSkipDates.length > 0 && (
                  <span className="text-[9px] font-mono font-bold text-status-success-fg bg-surface-card px-1.5 py-0.2 rounded border border-status-success-border">
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
                  className="flex-1 px-2 py-1 bg-surface-card border border-status-success-border rounded text-[11px] font-mono text-fg-strong"
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
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-card border border-status-success-border text-[10px] font-mono font-bold text-status-success-fg"
                    >
                      <span>{d}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkipDate(d)}
                        className="text-fg-subtle hover:text-rose-600 font-sans cursor-pointer leading-none"
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
