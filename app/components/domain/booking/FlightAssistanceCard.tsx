import React, { useState } from 'react';
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  LockIcon,
  PlaneLandingIcon,
  RefreshCwIcon,
  SpinnerIcon,
} from '../../ui/Icons';
import { Select } from '../../ui/Select';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { AirportCityCombobox } from './AirportCityCombobox';
import {
  extractAirportIataCode,
  resolveAirportDisplayValue,
} from '../../../core/config/airport-catalog';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { normalizeFlightTrackingPolicy } from '../../../core/types/config';
import {
  MAJOR_AIRLINES,
  evaluateFlightCheckEligibility,
  evaluateFlightPickupAlignment,
  parseFlightIdent,
  resolveStlTerminalInfo,
} from '../../../core/config/airports';
import type { FlightTelemetrySnapshot } from '../../../core/types/flight';
import {
  getFlightStatusService,
  resolveServiceDateYmd,
} from '../../../core/services/flight/flight-status.service';

export interface AirportDetectionResult {
  isAirportTrip: boolean;
  isPickupAirport: boolean;
  isDropoffAirport: boolean;
  isPrivateAviation?: boolean;
  airport?: {
    iataCode?: string;
    name?: string;
  } | null;
}

export interface FlightTelemetryCheckPanelProps {
  airline: string;
  flightNumber: string;
  flightOrigin: string;
  onFlightOriginChange: (val: string) => void;
  hasCheckedLuggage: boolean;
  isPickupAirport: boolean;
  isDropoffAirport?: boolean;
  airportIataCode?: string;
  serviceDate?: string;
  bookingType?: 'asap' | 'scheduled';
  scheduledPickupIso?: string;
  /** Defaults to false so customer/corporate forms never trigger paid aviation API lookups */
  allowLiveCheck?: boolean;
  flightTelemetry?: FlightTelemetrySnapshot | null;
  onFlightTelemetryChange?: (snapshot: FlightTelemetrySnapshot | null) => void;
  onApplyRecommendedPickupIso?: (recommendedIso: string) => void;
  compact?: boolean;
}

export function FlightTelemetryCheckPanel({
  airline,
  flightNumber,
  flightOrigin,
  onFlightOriginChange,
  hasCheckedLuggage,
  isPickupAirport,
  isDropoffAirport = false,
  airportIataCode = 'STL',
  serviceDate,
  bookingType,
  scheduledPickupIso,
  allowLiveCheck = false,
  flightTelemetry,
  onFlightTelemetryChange,
  onApplyRecommendedPickupIso,
  compact = false,
}: FlightTelemetryCheckPanelProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const parsedIdent = parseFlightIdent(airline, flightNumber);
  const terminalResolution = airline.trim()
    ? resolveStlTerminalInfo(airline, airportIataCode || 'STL')
    : null;

  const effectiveBookingType: 'asap' | 'scheduled' =
    bookingType || (scheduledPickupIso ? 'scheduled' : 'asap');

  const flightPolicy = normalizeFlightTrackingPolicy(
    getAdminConfigService().getCachedSettings().integrations?.flightTracking
  );

  const eligibility = evaluateFlightCheckEligibility(
    {
      isStaffContext: allowLiveCheck,
      bookingType: effectiveBookingType,
      scheduledPickupTime: scheduledPickupIso,
    },
    flightPolicy.flightLookupWindowHours
  );

  // Ensure displayed telemetry matches current airline + flight number
  const activeTelemetry =
    allowLiveCheck &&
    flightTelemetry &&
    parsedIdent.isValid &&
    flightTelemetry.flightIdent === parsedIdent.flightIdent
      ? flightTelemetry
      : null;

  const alignment =
    allowLiveCheck && isPickupAirport && activeTelemetry
      ? evaluateFlightPickupAlignment(activeTelemetry, scheduledPickupIso, {
          hasCheckedLuggage,
          delayThresholdMinutes: flightPolicy.delayAlertThresholdMinutes,
        })
      : null;

  const handleCheckStatus = async () => {
    if (!allowLiveCheck || !eligibility.eligible || !parsedIdent.isValid) return;
    setIsChecking(true);
    setCheckError(null);
    try {
      const effectiveDate =
        serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate)
          ? serviceDate
          : resolveServiceDateYmd(scheduledPickupIso);

      const res = await getFlightStatusService().checkFlightStatus({
        airline: parsedIdent.airlineCode,
        flightNumber: parsedIdent.flightNumber,
        serviceDate: effectiveDate,
        destinationIata: extractAirportIataCode(airportIataCode) || 'STL',
        originIata: extractAirportIataCode(flightOrigin) || undefined,
        scheduledPickupIso,
      });

      if (!res.success || !res.snapshot) {
        setCheckError(res.error || 'Unable to check flight status.');
        return;
      }

      onFlightTelemetryChange?.(res.snapshot);
      if (res.snapshot.originIata && !flightOrigin.trim()) {
        onFlightOriginChange(resolveAirportDisplayValue(res.snapshot.originIata));
      }
    } finally {
      setIsChecking(false);
    }
  };

  const renderStatusPill = (snap: FlightTelemetrySnapshot) => {
    if (snap.status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
          Cancelled
        </span>
      );
    }
    if (snap.status === 'diverted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
          Diverted
        </span>
      );
    }
    if (snap.status === 'landed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-sky-100 text-sky-800 border border-sky-300">
          Landed
        </span>
      );
    }
    if (snap.status === 'delayed' || (snap.delayMinutes || 0) >= 15) {
      const mins = Math.max(15, snap.delayMinutes || 0);
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
          Delayed +{mins}m
        </span>
      );
    }
    if (snap.isSimulatedFallback) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
          Terminal Verified
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
        On Time
      </span>
    );
  };

  if (!terminalResolution?.terminal && (!allowLiveCheck || !parsedIdent.isValid)) {
    return null;
  }

  const unlockTimeLabel =
    eligibility.unlocksAtIso && Number.isFinite(Date.parse(eligibility.unlocksAtIso))
      ? new Date(eligibility.unlocksAtIso).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return (
    <div className="space-y-2">
      {/* Instant STL Terminal & Exit Door Guidance Row + Staff-Only Live Check Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {terminalResolution && terminalResolution.terminal && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-[11px] font-bold text-slate-800 shadow-2xs">
            <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[10px] font-black">
              {terminalResolution.shortTerminal}
            </span>
            <span>
              {isDropoffAirport && !isPickupAirport
                ? `${terminalResolution.terminal} · Curbside Departures`
                : terminalResolution.pickupDoorGuidance}
            </span>
          </div>
        )}

        {allowLiveCheck && parsedIdent.isValid && (
          eligibility.eligible ? (
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={isChecking}
              className={`inline-flex items-center gap-1.5 ${
                compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
              } rounded-full font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white shadow-2xs active:scale-95 transition-all cursor-pointer`}
            >
              {isChecking ? (
                <>
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking {parsedIdent.flightIdent}...</span>
                </>
              ) : activeTelemetry ? (
                <>
                  <RefreshCwIcon className="w-3 h-3" />
                  <span>Recheck {parsedIdent.flightIdent}</span>
                </>
              ) : (
                <>
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>Check Flight Status</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled
              title={
                unlockTimeLabel
                  ? `Live flight lookup unlocks ${unlockTimeLabel}`
                  : eligibility.message || 'Live flight lookup locked'
              }
              className={`inline-flex items-center gap-1.5 ${
                compact ? 'px-2.5 py-1 text-[10.5px]' : 'px-3 py-1.5 text-xs'
              } rounded-full font-bold bg-slate-100 text-slate-600 border border-slate-300 cursor-not-allowed opacity-90`}
            >
              {eligibility.reason === 'outside_24h_window' ? (
                <>
                  <ClockIcon className="w-3 h-3 text-slate-500 shrink-0" />
                  <span>
                    Unlocks 24h before pickup{unlockTimeLabel ? ` (${unlockTimeLabel})` : ''}
                  </span>
                </>
              ) : (
                <>
                  <LockIcon className="w-3 h-3 text-slate-500 shrink-0" />
                  <span>
                    {eligibility.reason === 'past_window'
                      ? 'Pickup window passed (>12h)'
                      : eligibility.message || 'Flight check locked'}
                  </span>
                </>
              )}
            </button>
          )
        )}
      </div>

      {checkError && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 font-semibold">
          {checkError}
        </div>
      )}

      {/* Checked Telemetry Inline Banner */}
      {activeTelemetry && (
        <div className="bg-white border border-blue-200 rounded-xl p-2.5 space-y-1.5 shadow-2xs text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-black text-slate-900">
                {activeTelemetry.flightIdent}
              </span>
              {renderStatusPill(activeTelemetry)}
              {activeTelemetry.originIata && (
                <span className="text-[11px] font-semibold text-slate-600">
                  {activeTelemetry.originIata}
                  {activeTelemetry.originCity ? ` (${activeTelemetry.originCity})` : ''} &rarr;{' '}
                  {activeTelemetry.destinationIata || airportIataCode}
                </span>
              )}
            </div>

            {(activeTelemetry.estimatedArrivalIso || activeTelemetry.scheduledArrivalIso) && (
              <span className="text-[11px] font-bold text-slate-700">
                Est. Arrival:{' '}
                <span className="font-mono text-slate-900">
                  {new Date(
                    (activeTelemetry.estimatedArrivalIso || activeTelemetry.scheduledArrivalIso)!
                  ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700">
            {activeTelemetry.terminal && (
              <span>
                <strong className="text-slate-900">Terminal:</strong> {activeTelemetry.terminal}
              </span>
            )}
            {activeTelemetry.gate && (
              <span>
                <strong className="text-slate-900">Gate:</strong> {activeTelemetry.gate}
              </span>
            )}
            {activeTelemetry.baggageClaim && (
              <span>
                <strong className="text-slate-900">Baggage Belt:</strong>{' '}
                {activeTelemetry.baggageClaim}
              </span>
            )}
            {activeTelemetry.pickupDoorGuidance && isPickupAirport && (
              <span className="text-blue-800 font-semibold">
                Meet Driver: {activeTelemetry.pickupDoorGuidance}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Pickup Alignment Conflict / Significant Delay Warning + 1-Tap Recommended Time */}
      {alignment && !alignment.aligned && (
        <div
          className={`rounded-xl border p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            alignment.conflict === 'flight_cancelled'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div className="text-[11px] leading-snug">
              <span className="font-extrabold block">
                {alignment.conflict === 'pickup_before_arrival'
                  ? 'Pickup Time Precedes Flight Arrival'
                  : alignment.conflict === 'flight_cancelled'
                  ? 'Inbound Flight Cancelled'
                  : 'Flight Delay Detected'}
              </span>
              <span>{alignment.message}</span>
            </div>
          </div>

          {alignment.recommendedPickupIso && onApplyRecommendedPickupIso && (
            <button
              type="button"
              onClick={() => onApplyRecommendedPickupIso(alignment.recommendedPickupIso!)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              Use Recommended Pickup Time (
              {new Date(alignment.recommendedPickupIso).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
              )
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface FlightAssistanceCardProps {
  variant?: 'outbound' | 'return';
  detection: AirportDetectionResult;
  provideFlightInfo: boolean;
  onToggleProvideFlightInfo: (checked: boolean) => void;
  airline: string;
  onAirlineChange: (val: string) => void;
  flightNumber: string;
  onFlightNumberChange: (val: string) => void;
  flightOrigin: string;
  onFlightOriginChange: (val: string) => void;
  tailNumber?: string;
  onTailNumberChange: (val: string) => void;
  fboFacility?: string;
  onFboFacilityChange: (val: string) => void;
  hasCheckedLuggage: boolean;
  onHasCheckedLuggageChange: (checked: boolean) => void;
  fboFacilities: string[];
  lambertPickupInstructions?: string;
  flightNumberError?: string;
  tailNumberError?: string;
  serviceDate?: string;
  bookingType?: 'asap' | 'scheduled';
  scheduledPickupIso?: string;
  /** Defaults to false on customer/corporate forms so only local STL terminal routing is shown */
  allowLiveCheck?: boolean;
  flightTelemetry?: FlightTelemetrySnapshot | null;
  onFlightTelemetryChange?: (snapshot: FlightTelemetrySnapshot | null) => void;
  onApplyRecommendedPickupIso?: (recommendedIso: string) => void;
}

export function FlightAssistanceCard({
  variant = 'outbound',
  detection,
  provideFlightInfo,
  onToggleProvideFlightInfo,
  airline,
  onAirlineChange,
  flightNumber,
  onFlightNumberChange,
  flightOrigin,
  onFlightOriginChange,
  tailNumber,
  onTailNumberChange,
  fboFacility,
  onFboFacilityChange,
  hasCheckedLuggage,
  onHasCheckedLuggageChange,
  fboFacilities,
  lambertPickupInstructions,
  flightNumberError,
  tailNumberError,
  serviceDate,
  bookingType,
  scheduledPickupIso,
  allowLiveCheck = false,
  flightTelemetry,
  onFlightTelemetryChange,
  onApplyRecommendedPickupIso,
}: FlightAssistanceCardProps) {
  const isReturn = variant === 'return';
  const datalistId = isReturn ? 'return-fbo-list' : 'outbound-fbo-list';
  const flightFieldName = isReturn ? 'returnFlightNumber' : 'flightNumber';
  const tailFieldName = isReturn ? 'returnTailNumber' : 'tailNumber';

  const containerColors = isReturn
    ? 'bg-white/95 border-indigo-200'
    : 'bg-blue-50/70 border-blue-200';
  const inputBorder = isReturn ? 'border-indigo-200' : 'border-blue-200';
  const accentText = isReturn ? 'text-indigo-950' : 'text-blue-950';
  const badgeStyle = isReturn
    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
    : 'bg-blue-200/80 text-blue-900';

  const handleAirlineSelect = (val: string) => {
    onAirlineChange(val);
    const nextIdent = parseFlightIdent(val, flightNumber);
    if (flightTelemetry && flightTelemetry.flightIdent !== nextIdent.flightIdent) {
      onFlightTelemetryChange?.(null);
    }
  };

  const handleFlightNumInput = (rawVal: string) => {
    const clean = rawVal.replace(/\D/g, '').slice(0, 4);
    onFlightNumberChange(clean);
    const nextIdent = parseFlightIdent(airline, clean);
    if (flightTelemetry && flightTelemetry.flightIdent !== nextIdent.flightIdent) {
      onFlightTelemetryChange?.(null);
    }
  };

  return (
    <div className={`p-3.5 border rounded-xl space-y-3 animate-in fade-in duration-200 ${containerColors}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 font-bold text-xs ${accentText}`}>
          <PlaneLandingIcon
            className={`w-4 h-4 ${isReturn ? 'text-indigo-600' : 'text-blue-600'} ${
              detection.isDropoffAirport ? 'rotate-45' : ''
            }`}
          />
          <span>
            {detection.isPrivateAviation
              ? detection.isPickupAirport
                ? `${detection.airport?.iataCode || 'Private Airport'} ${isReturn ? 'Return ' : ''}Private Aviation Arrival`
                : `${detection.airport?.iataCode || 'Private Airport'} ${isReturn ? 'Return ' : ''}Private Aviation Dropoff`
              : detection.isPickupAirport
              ? `${detection.airport?.iataCode || 'Airport'} ${isReturn ? 'Return ' : ''}Arrival Details`
              : `${detection.airport?.iataCode || 'Airport'} ${isReturn ? 'Return ' : ''}Dropoff Details`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
            <input
              type="checkbox"
              checked={provideFlightInfo}
              onChange={(e) => onToggleProvideFlightInfo(e.target.checked)}
              className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            <span>
              {detection.isPickupAirport
                ? 'Track Inbound Flight'
                : detection.isPrivateAviation
                ? 'Aviation Details'
                : 'Provide Airline'}
            </span>
          </label>
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${badgeStyle}`}>
            {detection.isPrivateAviation
              ? 'Private FBO'
              : detection.isPickupAirport
              ? 'Live Flight Tracking'
              : 'Terminal Routing'}
          </span>
        </div>
      </div>

      {detection.isDropoffAirport && (
        <div className="text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200 rounded-lg p-2.5 flex items-start gap-1.5">
          <span className="font-bold text-amber-800 shrink-0">Note:</span>
          <span>
            Your driver arrives at your scheduled pickup time. Departing flights are not monitored for pickup adjustments.
          </span>
        </div>
      )}

      <CollapsibleSection isOpen={provideFlightInfo}>
        <div className="space-y-3 pt-0.5">
          {detection.isPrivateAviation ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                  FBO Facility / Terminal
                </label>
                <input
                  type="text"
                  list={datalistId}
                  placeholder="e.g. Signature Aviation, TAC Air..."
                  value={fboFacility || ''}
                  onChange={(e) => onFboFacilityChange(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border ${inputBorder} rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                />
                <datalist id={datalistId}>
                  {fboFacilities.map((fbo) => (
                    <option key={fbo} value={fbo} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                  Aircraft Tail # {detection.isPickupAirport ? '(Required)' : '(Optional)'}
                </label>
                <input
                  type="text"
                  name={tailFieldName}
                  placeholder="e.g. N12345"
                  value={tailNumber || ''}
                  onChange={(e) => onTailNumberChange(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 bg-white border ${
                    tailNumberError ? 'border-red-400 bg-red-50/40' : inputBorder
                  } rounded-lg text-base sm:text-sm uppercase font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                />
                {tailNumberError && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{tailNumberError}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                  {detection.isPickupAirport ? 'Origin Airport (Optional)' : 'Destination (Optional)'}
                </label>
                <AirportCityCombobox
                  value={flightOrigin}
                  onChange={onFlightOriginChange}
                  placeholder="e.g. TEB Teterboro, VNY, PWK"
                  preferPrivateFbo
                  borderClassName={inputBorder}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                    Airline {detection.isDropoffAirport ? '(Terminal Door)' : ''}
                  </label>
                  <Select
                    searchable
                    searchPlaceholder="Search airline or IATA code..."
                    value={airline}
                    onValueChange={(val) => handleAirlineSelect(val)}
                    size="md"
                    triggerClassName={`border ${inputBorder} rounded-lg`}
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
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                    {detection.isPickupAirport ? 'Flight # (1–4 digits)' : 'Flight # (Optional)'}
                  </label>
                  <input
                    type="text"
                    name={flightFieldName}
                    inputMode="numeric"
                    pattern="[0-9]{1,4}"
                    maxLength={4}
                    placeholder="e.g. 1234"
                    value={flightNumber}
                    onChange={(e) => handleFlightNumInput(e.target.value)}
                    className={`w-full px-3 py-2 bg-white border ${
                      flightNumberError ? 'border-red-400 bg-red-50/40' : inputBorder
                    } rounded-lg text-base sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                  />
                  {flightNumberError && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">{flightNumberError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                    {detection.isPickupAirport ? 'Departing From (Origin)' : 'Destination (Optional)'}
                  </label>
                  <AirportCityCombobox
                    value={flightOrigin}
                    onChange={onFlightOriginChange}
                    placeholder="e.g. YYZ Toronto, ORD, ATL"
                    borderClassName={inputBorder}
                  />
                </div>
              </div>

              <FlightTelemetryCheckPanel
                airline={airline}
                flightNumber={flightNumber}
                flightOrigin={flightOrigin}
                onFlightOriginChange={onFlightOriginChange}
                hasCheckedLuggage={hasCheckedLuggage}
                isPickupAirport={detection.isPickupAirport}
                isDropoffAirport={detection.isDropoffAirport}
                airportIataCode={detection.airport?.iataCode || 'STL'}
                serviceDate={serviceDate}
                bookingType={bookingType}
                scheduledPickupIso={scheduledPickupIso}
                allowLiveCheck={allowLiveCheck}
                flightTelemetry={flightTelemetry}
                onFlightTelemetryChange={onFlightTelemetryChange}
                onApplyRecommendedPickupIso={onApplyRecommendedPickupIso}
              />
            </>
          )}

          <div className="pt-1.5 border-t border-blue-200/60 text-xs text-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasCheckedLuggage}
                onChange={(e) => onHasCheckedLuggageChange(e.target.checked)}
                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                {detection.isPickupAirport
                  ? 'Checked baggage (we track your flight and wait as long as it takes)'
                  : 'Checked baggage to drop off at curbside'}
              </span>
            </label>
          </div>

          <div className="text-[11px] text-slate-600 bg-white/85 p-2.5 rounded-lg border border-blue-100 leading-relaxed">
            {detection.isPrivateAviation ? (
              <>
                <span className="font-bold text-slate-800">Private Aviation FBO Pickup: </span>
                <span>
                  Your driver coordinates directly with the FBO front desk for ramp-side or lobby pickup.
                </span>
              </>
            ) : detection.isPickupAirport ? (
              <>
                <span className="font-bold text-slate-800">STL Curbside Pickup: </span>
                <span>
                  {lambertPickupInstructions ||
                    'Terminal 1: Lower Level Exit Door 6 / Door 12 • Terminal 2 (Southwest / Lufthansa): Baggage Claim Exit Door 12. We monitor your flight in real time.'}
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-800">STL Departures Tip: </span>
                <span>
                  Terminal 1: American, Delta, United, Air Canada, Spirit, Frontier • Terminal 2: Southwest &amp; Lufthansa.
                </span>
              </>
            )}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
