import React from 'react';
import type { GeoPoint } from '../../../../core/types';
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import {
  MAJOR_AIRLINES,
  parseFlightIdent,
  type AirportDetectionResult,
} from '../../../../core/config/airports';
import {
  DISPATCH_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  type UseBookingWaypointsResult,
} from '../../../../core/hooks/booking';
import { DispatchLocationInput } from '../DispatchLocationInput';
import { AirportCityCombobox } from '../../booking/AirportCityCombobox';
import { FlightTelemetryCheckPanel } from '../../booking/FlightAssistanceCard';
import { ModernDatePicker, ModernTimePicker } from '../../../ui/ModernDateTimePicker';
import { CollapsibleSection } from '../../../ui/CollapsibleSection';
import { LockIcon, PlaneIcon, PlaneLandingIcon, PlusIcon } from '../../../ui/Icons';
import { Select } from '../../../ui/Select';

export interface DispatchRoutingTimingSectionProps {
  isEditMode: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  draftSavedAt: number | null;
  timingType: 'asap' | 'later';
  setTimingType: (val: 'asap' | 'later') => void;
  scheduledDate: string;
  setScheduledDate: (val: string) => void;
  scheduledTime: string;
  setScheduledTime: (val: string) => void;
  pickupAddress: string;
  setPickupAddress: (val: string) => void;
  setPickupCoordinates: (val: GeoPoint | undefined) => void;
  setPickupPlaceId: (val: string | undefined) => void;
  dropoffAddress: string;
  setDropoffAddress: (val: string) => void;
  setDropoffCoordinates: (val: GeoPoint | undefined) => void;
  setDropoffPlaceId: (val: string | undefined) => void;
  intermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
  outboundWaypoints: UseBookingWaypointsResult<{
    address: string;
    coordinates?: GeoPoint;
    placeId?: string;
  }>;
  estimatedDurationMinutes: number;
  estimatedDistanceMiles: number;
  airportDetection: AirportDetectionResult;
  provideFlightInfo: boolean;
  setProvideFlightInfo: (val: boolean) => void;
  airline: string;
  setAirline: (val: string) => void;
  flightNumber: string;
  setFlightNumber: (val: string) => void;
  flightOrigin: string;
  setFlightOrigin: (val: string) => void;
  tailNumber: string;
  setTailNumber: (val: string) => void;
  fboFacility: string;
  setFboFacility: (val: string) => void;
  hasCheckedLuggage: boolean;
  setHasCheckedLuggage: (val: boolean) => void;
  outboundFlightTelemetry: FlightTelemetrySnapshot | null;
  setOutboundFlightTelemetry: (val: FlightTelemetrySnapshot | null) => void;
  onSwapRoute: () => void;
}

export function DispatchRoutingTimingSection({
  isEditMode,
  isCompleted,
  isCancelled,
  draftSavedAt,
  timingType,
  setTimingType,
  scheduledDate,
  setScheduledDate,
  scheduledTime,
  setScheduledTime,
  pickupAddress,
  setPickupAddress,
  setPickupCoordinates,
  setPickupPlaceId,
  dropoffAddress,
  setDropoffAddress,
  setDropoffCoordinates,
  setDropoffPlaceId,
  intermediateStops,
  outboundWaypoints,
  estimatedDurationMinutes,
  estimatedDistanceMiles,
  airportDetection,
  provideFlightInfo,
  setProvideFlightInfo,
  airline,
  setAirline,
  flightNumber,
  setFlightNumber,
  flightOrigin,
  setFlightOrigin,
  tailNumber,
  setTailNumber,
  fboFacility,
  setFboFacility,
  hasCheckedLuggage,
  setHasCheckedLuggage,
  outboundFlightTelemetry,
  setOutboundFlightTelemetry,
  onSwapRoute,
}: DispatchRoutingTimingSectionProps) {
  return (
    <>
      {/* Timing Selector (Reverted clean pill switch design) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-fg-strong text-xs">Pickup Time</span>
            {(isCompleted || isCancelled) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-muted text-fg-secondary border border-border-subtle">
                <LockIcon className="w-2.5 h-2.5 shrink-0" />
                <span>Locked</span>
              </span>
            )}
            {draftSavedAt && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-success-bg text-status-success-fg border border-status-success-border"
                title="Form data is auto-saved locally so you won't lose work on reload"
              >
                {isEditMode ? 'Edits cached' : 'Draft saved'}
              </span>
            )}
          </div>
          <span className="text-[10px] text-fg-subtle font-medium">
            {timingType === 'later' ? 'Scheduled reservation' : 'On-demand dispatch'}
          </span>
        </div>

        <div
          className={`flex items-center gap-2 ${
            isCompleted || isCancelled ? 'opacity-60 pointer-events-none select-none' : ''
          }`}
        >
          <label className="flex items-center gap-1.5 cursor-pointer shrink-0 select-none font-semibold text-fg-secondary text-xs">
            <input
              type="checkbox"
              checked={timingType === 'later'}
              disabled={isCompleted || isCancelled}
              onChange={(e) => setTimingType(e.target.checked ? 'later' : 'asap')}
              className="sr-only"
            />
            <div
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                timingType === 'later' ? 'bg-blue-600' : 'bg-surface-strong'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-surface-card shadow-sm transition-transform ${
                  timingType === 'later' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
            <span>Later</span>
          </label>

          {timingType === 'later' ? (
            <div className="grid grid-cols-2 gap-1.5 flex-1 animate-in fade-in duration-150">
              <ModernDatePicker size="sm" value={scheduledDate} onChange={setScheduledDate} />
              <ModernTimePicker size="sm" value={scheduledTime} onChange={setScheduledTime} />
            </div>
          ) : (
            <div className="flex-1 px-3 py-1.5 bg-surface-muted border border-border-subtle rounded text-fg-muted text-xs font-medium">
              ASAP (Live / Immediate)
            </div>
          )}
        </div>
      </div>

      {/* Routing Section (Outbound) */}
      <div>
        <label className="block text-[11px] font-bold text-fg-secondary uppercase tracking-wide mb-1">
          Route
        </label>

        <div className="p-2 bg-surface-card border border-border-subtle rounded-lg shadow-sm space-y-2">
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              title="Swap Pickup and Dropoff"
              onClick={onSwapRoute}
              className="p-1 text-fg-subtle hover:text-blue-600 hover:bg-surface-muted rounded transition-colors self-center text-sm font-bold"
            >
              ↕
            </button>
            <div className="flex-1 space-y-1.5">
              <DispatchLocationInput
                placeholder="Pickup Location"
                value={pickupAddress}
                variant="pickup"
                disabled={isCancelled}
                onChange={(val) => {
                  setPickupAddress(val);
                  setPickupPlaceId(undefined);
                }}
                onPlaceSelected={(p) => {
                  setPickupAddress(p.address);
                  setPickupCoordinates(p.coordinates);
                  setPickupPlaceId(p.placeId);
                }}
                required
              />

              {intermediateStops.map((stop, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <DispatchLocationInput
                    placeholder={`Stop #${idx + 1}`}
                    value={stop.address}
                    variant="stop"
                    disabled={isCancelled}
                    onChange={(val) =>
                      outboundWaypoints.updateStopAt(idx, { address: val, placeId: undefined })
                    }
                    onPlaceSelected={(p) =>
                      outboundWaypoints.replaceStopAt(idx, {
                        address: p.address,
                        coordinates: p.coordinates,
                        placeId: p.placeId,
                      })
                    }
                  />
                  <button
                    type="button"
                    disabled={isCancelled}
                    onClick={() => outboundWaypoints.removeStopAt(idx)}
                    className="text-fg-subtle hover:text-red-500 px-1 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <DispatchLocationInput
                placeholder="Dropoff Location"
                value={dropoffAddress}
                variant="dropoff"
                disabled={isCancelled}
                onChange={(val) => {
                  setDropoffAddress(val);
                  setDropoffPlaceId(undefined);
                }}
                onPlaceSelected={(p) => {
                  setDropoffAddress(p.address);
                  setDropoffCoordinates(p.coordinates);
                  setDropoffPlaceId(p.placeId);
                }}
                required
              />
            </div>
          </div>

          {/* Route Stats & Add Stop */}
          <div className="flex items-center justify-between pt-1 border-t border-border-faint text-[11px] text-fg-muted font-medium">
            <div>
              Estimate:{' '}
              <span className="font-bold text-fg-secondary">{estimatedDurationMinutes} min</span>,{' '}
              <span className="font-bold text-fg-secondary">{estimatedDistanceMiles} mi</span>
            </div>
            <div className="flex items-center gap-2">
              {!airportDetection.isAirportTrip && !provideFlightInfo && (
                <button
                  type="button"
                  onClick={() => setProvideFlightInfo(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong text-sky-700 font-bold text-xs border border-status-info-border transition-all shadow-2xs active:scale-95"
                >
                  <PlaneIcon className="w-3.5 h-3.5 text-sky-600" />
                  <span>+ Flight Info</span>
                </button>
              )}
              <button
                type="button"
                onClick={outboundWaypoints.addStop}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg font-bold text-xs border border-status-info-border transition-all shadow-2xs active:scale-95"
              >
                <PlusIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Add stop</span>
              </button>
            </div>
          </div>

          {/* Outbound Flight / Aviation Details Box */}
          <CollapsibleSection isOpen={airportDetection.isAirportTrip || provideFlightInfo}>
            <div className="p-3 bg-status-info-bg/70 border border-status-info-border rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-status-info-fg font-bold text-xs">
                  <PlaneLandingIcon
                    className={`w-4 h-4 text-blue-600 ${
                      airportDetection.isDropoffAirport ? 'rotate-45' : ''
                    }`}
                  />
                  <span>
                    {airportDetection.isPrivateAviation
                      ? airportDetection.isPickupAirport
                        ? `${
                            airportDetection.airport?.iataCode || 'Private Airport'
                          } Private Aviation Arrival`
                        : `${
                            airportDetection.airport?.iataCode || 'Private Airport'
                          } Private Aviation Dropoff`
                      : airportDetection.isPickupAirport
                      ? `${airportDetection.airport?.iataCode || 'Airport'} Arrival Details`
                      : `${airportDetection.airport?.iataCode || 'Airport'} Dropoff Details`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-semibold text-status-info-fg bg-surface-card/90 px-2 py-0.5 rounded border border-status-info-border shadow-2xs">
                    <input
                      type="checkbox"
                      checked={provideFlightInfo}
                      onChange={(e) => setProvideFlightInfo(e.target.checked)}
                      className="rounded border-status-info-border text-blue-600 focus:ring-blue-500 w-3 h-3"
                    />
                    <span>
                      {airportDetection.isPickupAirport
                        ? 'Track Inbound Flight'
                        : airportDetection.isPrivateAviation
                        ? 'Provide Aviation Details'
                        : 'Provide Airline'}
                    </span>
                  </label>
                  <span className="text-[10px] bg-blue-200/80 text-status-info-fg px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                    {airportDetection.isPrivateAviation ? (
                      <>
                        <PlaneIcon className="w-3 h-3 shrink-0" />
                        <span>Private Aviation (FBO)</span>
                      </>
                    ) : airportDetection.isPickupAirport ? (
                      'Arrival Tracking'
                    ) : (
                      'Terminal Routing'
                    )}
                  </span>
                </div>
              </div>

              <CollapsibleSection isOpen={provideFlightInfo}>
                <div className="space-y-2 pt-0.5">
                  {airportDetection.isPrivateAviation ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                          FBO Facility
                        </span>
                        <input
                          type="text"
                          list="dispatch-outbound-fbo-list"
                          placeholder="e.g. Signature Flight Support"
                          value={fboFacility}
                          onChange={(e) => setFboFacility(e.target.value)}
                          className="w-full px-2 py-1 bg-surface-card border border-status-info-border rounded text-xs text-fg-strong"
                        />
                        <datalist id="dispatch-outbound-fbo-list">
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
                          value={tailNumber}
                          onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                          className="w-full px-2 py-1 bg-surface-card border border-status-info-border rounded text-xs uppercase font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                          {airportDetection.isPickupAirport ? 'Origin' : 'Destination'}
                        </span>
                        <AirportCityCombobox
                          size="xs"
                          preferPrivateFbo
                          value={flightOrigin}
                          onChange={setFlightOrigin}
                          placeholder="e.g. TEB Teterboro"
                          borderClassName="border-status-info-border"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                            Airline
                          </span>
                          <Select
                            size="xs"
                            searchable
                            searchPlaceholder="Search airline or IATA code..."
                            value={airline}
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
                              setAirline(v);
                              const next = parseFlightIdent(v, flightNumber);
                              if (
                                outboundFlightTelemetry &&
                                outboundFlightTelemetry.flightIdent !== next.flightIdent
                              ) {
                                setOutboundFlightTelemetry(null);
                              }
                            }}
                            triggerClassName="border-status-info-border"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                            Flight #
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{1,4}"
                            maxLength={4}
                            placeholder="e.g. 1234"
                            value={flightNumber}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setFlightNumber(val);
                              const next = parseFlightIdent(airline, val);
                              if (
                                outboundFlightTelemetry &&
                                outboundFlightTelemetry.flightIdent !== next.flightIdent
                              ) {
                                setOutboundFlightTelemetry(null);
                              }
                            }}
                            className="w-full px-2 py-1 bg-surface-card border border-status-info-border rounded text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] text-fg-secondary font-semibold mb-0.5">
                            {airportDetection.isPickupAirport ? 'Origin' : 'Destination'}
                          </span>
                          <AirportCityCombobox
                            size="xs"
                            value={flightOrigin}
                            onChange={setFlightOrigin}
                            placeholder="e.g. YYZ Toronto"
                            borderClassName="border-status-info-border"
                          />
                        </div>
                      </div>

                      <FlightTelemetryCheckPanel
                        compact
                        allowLiveCheck={true}
                        airline={airline}
                        flightNumber={flightNumber}
                        flightOrigin={flightOrigin}
                        onFlightOriginChange={setFlightOrigin}
                        hasCheckedLuggage={hasCheckedLuggage}
                        isPickupAirport={airportDetection.isPickupAirport}
                        isDropoffAirport={airportDetection.isDropoffAirport}
                        airportIataCode={airportDetection.airport?.iataCode || 'STL'}
                        serviceDate={scheduledDate}
                        bookingType={timingType === 'asap' ? 'asap' : 'scheduled'}
                        scheduledPickupIso={
                          timingType === 'later' && scheduledDate
                            ? (() => {
                                const d = new Date(
                                  `${scheduledDate}T${scheduledTime || '12:00'}:00`
                                );
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
                          setTimingType('later');
                          setScheduledDate(`${yyyy}-${mm}-${dd}`);
                          setScheduledTime(`${hh}:${min}`);
                        }}
                      />
                    </>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-status-info-border/60 text-[11px] text-status-info-fg">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasCheckedLuggage}
                        onChange={(e) => setHasCheckedLuggage(e.target.checked)}
                        className="rounded border-status-info-border text-blue-600"
                      />
                      <span>Checked Baggage</span>
                    </label>
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </>
  );
}
