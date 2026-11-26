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
    ? resolveStlTerminalInfo(
        airline,
        airportIataCode || 'STL',
        getAdminConfigService().getCachedSettings().customerBookingConfig
      )
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border">
          Cancelled
        </span>
      );
    }
    if (snap.status === 'diverted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border">
          Diverted
        </span>
      );
    }
    if (snap.status === 'landed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-status-info-bg-strong text-status-info-fg border border-status-info-border">
          Landed
        </span>
      );
    }
    if (snap.status === 'delayed' || (snap.delayMinutes || 0) >= 15) {
      const mins = Math.max(15, snap.delayMinutes || 0);
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border">
          Delayed +{mins}m
        </span>
      );
    }
    if (snap.isSimulatedFallback) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-status-staged-bg-strong text-status-staged-fg border border-status-staged-border">
          Terminal Verified
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-status-success-bg-strong text-status-success-fg border border-status-success-border">
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
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card border border-status-info-border text-[11px] font-bold text-fg-strong shadow-2xs">
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
              } rounded-full font-bold bg-surface-muted text-fg-secondary border border-border-strong cursor-not-allowed opacity-90`}
            >
              {eligibility.reason === 'outside_24h_window' ? (
                <>
                  <ClockIcon className="w-3 h-3 text-fg-muted shrink-0" />
                  <span>
                    Unlocks 24h before pickup{unlockTimeLabel ? ` (${unlockTimeLabel})` : ''}
                  </span>
                </>
              ) : (
                <>
                  <LockIcon className="w-3 h-3 text-fg-muted shrink-0" />
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
        <div className="text-[11px] text-status-danger-fg bg-status-danger-bg border border-status-danger-border rounded-lg px-2.5 py-1.5 font-semibold">
          {checkError}
        </div>
      )}

      {/* Checked Telemetry Inline Banner */}
      {activeTelemetry && (
        <div className="bg-surface-card border border-status-info-border rounded-xl p-2.5 space-y-1.5 shadow-2xs text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-black text-fg-primary">
                {activeTelemetry.flightIdent}
              </span>
              {renderStatusPill(activeTelemetry)}
              {activeTelemetry.originIata && (
                <span className="text-[11px] font-semibold text-fg-secondary">
                  {activeTelemetry.originIata}
                  {activeTelemetry.originCity ? ` (${activeTelemetry.originCity})` : ''} &rarr;{' '}
                  {activeTelemetry.destinationIata || airportIataCode}
                </span>
              )}
            </div>

            {(activeTelemetry.estimatedArrivalIso || activeTelemetry.scheduledArrivalIso) && (
              <span className="text-[11px] font-bold text-fg-secondary">
                Est. Arrival:{' '}
                <span className="font-mono text-fg-primary">
                  {new Date(
                    (activeTelemetry.estimatedArrivalIso || activeTelemetry.scheduledArrivalIso)!
                  ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-secondary">
            {activeTelemetry.terminal && (
              <span>
                <strong className="text-fg-primary">Terminal:</strong> {activeTelemetry.terminal}
              </span>
            )}
            {activeTelemetry.gate && (
              <span>
                <strong className="text-fg-primary">Gate:</strong> {activeTelemetry.gate}
              </span>
            )}
            {activeTelemetry.baggageClaim && (
              <span>
                <strong className="text-fg-primary">Baggage Belt:</strong>{' '}
                {activeTelemetry.baggageClaim}
              </span>
            )}
            {(terminalResolution?.pickupDoorGuidance || activeTelemetry.pickupDoorGuidance) && isPickupAirport && (
              <span className="text-status-info-fg font-semibold">
                Meet Driver: {terminalResolution?.pickupDoorGuidance || activeTelemetry.pickupDoorGuidance}
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
              ? 'bg-status-danger-bg border-status-danger-border text-status-danger-fg'
              : 'bg-status-warning-bg border-status-warning-border text-status-warning-fg'
          }`}
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5 text-status-warning-fg" />
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
    ? 'bg-surface-card/95 border-status-staged-border'
    : 'bg-status-info-bg/70 border-status-info-border';
  const inputBorder = isReturn ? 'border-status-staged-border' : 'border-status-info-border';
  const accentText = isReturn ? 'text-status-staged-fg' : 'text-status-info-fg';
  const badgeStyle = isReturn
    ? 'bg-status-staged-bg-strong text-status-staged-fg border border-status-staged-border'
    : 'bg-blue-200/80 text-status-info-fg';

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

  const isCommercialDropoff =
    detection.isDropoffAirport && !detection.isPickupAirport && !detection.isPrivateAviation;

  if (isCommercialDropoff) {
    const dropoffTermInfo = airline
      ? resolveStlTerminalInfo(
          airline,
          detection.airport?.iataCode || 'STL',
          getAdminConfigService().getCachedSettings().customerBookingConfig
        )
      : null;

    return (
      <div className={`p-3 border rounded-xl space-y-2 animate-in fade-in duration-200 ${containerColors}`}>
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 font-bold text-xs ${accentText}`}>
            <PlaneLandingIcon
              className={`w-3.5 h-3.5 ${isReturn ? 'text-indigo-600' : 'text-blue-600'} rotate-45`}
            />
            <span>
              {detection.airport?.iataCode || detection.airport?.name || 'Airport'} {isReturn ? 'Return ' : ''}Dropoff
            </span>
          </div>
          <span className="text-[10px] font-semibold text-fg-muted bg-surface-card px-2 py-0.5 rounded border border-border-subtle">
            Optional
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          <div className="sm:col-span-5">
            <Select
              searchable
              searchPlaceholder="Search airline or IATA code..."
              value={airline}
              options={[
                { value: '', label: 'Select Airline (Optional)' },
                ...MAJOR_AIRLINES.map((al) => ({
                  value: al.name,
                  label: `${al.name} (${al.code})`,
                  selectedLabel: al.code,
                })),
              ]}
              onValueChange={(val) => {
                if (val && !provideFlightInfo) {
                  onToggleProvideFlightInfo(true);
                }
                handleAirlineSelect(val);
              }}
              size="sm"
              triggerClassName={`border ${inputBorder} rounded-lg`}
            />
          </div>
          <div className="sm:col-span-7 text-[11px] text-fg-secondary leading-snug">
            {dropoffTermInfo ? (
              <span>
                <span className="font-bold text-fg-strong">{dropoffTermInfo.terminal || 'Terminal'}: </span>
                {dropoffTermInfo.pickupDoorGuidance}
              </span>
            ) : (
              <span>
                Select your airline for terminal dropoff door guidance (T1: AA, DL, UA · T2: WN, LH).
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

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
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-fg-strong bg-surface-card px-2.5 py-1 rounded-lg border border-border-subtle shadow-2xs">
            <input
              type="checkbox"
              checked={provideFlightInfo}
              onChange={(e) => onToggleProvideFlightInfo(e.target.checked)}
              className="rounded border-status-info-border text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            <span>
              {detection.isPickupAirport
                ? 'Track Inbound Flight'
                : 'Aviation Details'}
            </span>
          </label>
          {detection.isPrivateAviation && (
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${badgeStyle}`}>
              Private FBO
            </span>
          )}
        </div>
      </div>

      {detection.isDropoffAirport && (
        <div className="text-[11px] text-status-warning-fg bg-status-warning-bg/90 border border-status-warning-border rounded-lg p-2.5 flex items-start gap-1.5">
          <span className="font-bold text-status-warning-fg shrink-0">Note:</span>
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
                <label className="block text-[11px] text-fg-secondary font-semibold mb-1">
                  FBO Facility / Terminal
                </label>
                <input
                  type="text"
                  list={datalistId}
                  placeholder="e.g. Signature Aviation, TAC Air..."
                  value={fboFacility || ''}
                  onChange={(e) => onFboFacilityChange(e.target.value)}
                  className={`w-full px-3 py-2 bg-surface-card border ${inputBorder} rounded-lg text-base sm:text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                />
                <datalist id={datalistId}>
                  {fboFacilities.map((fbo) => (
                    <option key={fbo} value={fbo} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] text-fg-secondary font-semibold mb-1">
                  Aircraft Tail # {detection.isPickupAirport ? '(Required)' : '(Optional)'}
                </label>
                <input
                  type="text"
                  name={tailFieldName}
                  placeholder="e.g. N12345"
                  value={tailNumber || ''}
                  onChange={(e) => onTailNumberChange(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 bg-surface-card border ${
                    tailNumberError ? 'border-red-400 bg-status-danger-bg/40' : inputBorder
                  } rounded-lg text-base sm:text-sm uppercase font-mono font-bold text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                />
                {tailNumberError && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{tailNumberError}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-fg-secondary font-semibold mb-1">
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
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] text-fg-secondary font-semibold mb-1">
                    Airline
                  </label>
                  <Select
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
                    onValueChange={(val) => handleAirlineSelect(val)}
                    size="md"
                    triggerClassName={`border ${inputBorder} rounded-lg`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-fg-secondary font-semibold mb-1">
                    {detection.isPickupAirport ? 'Flight #' : 'Flight # (Opt)'}
                  </label>
                  <input
                    type="text"
                    name={flightFieldName}
                    inputMode="numeric"
                    pattern="[0-9]{1,4}"
                    maxLength={4}
                    placeholder="1234"
                    value={flightNumber}
                    onChange={(e) => handleFlightNumInput(e.target.value)}
                    className={`w-full px-2.5 py-2 bg-surface-card border ${
                      flightNumberError ? 'border-red-400 bg-status-danger-bg/40' : inputBorder
                    } rounded-lg text-base sm:text-sm font-mono font-bold text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                  />
                  {flightNumberError && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">{flightNumberError}</p>
                  )}
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[11px] text-fg-secondary font-semibold mb-1">
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

          <div className="pt-1.5 border-t border-status-info-border/60 text-xs text-fg-strong">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasCheckedLuggage}
                onChange={(e) => onHasCheckedLuggageChange(e.target.checked)}
                className="w-4 h-4 rounded border-status-info-border text-blue-600 focus:ring-blue-500"
              />
              <span>
                {detection.isPickupAirport
                  ? 'Checked baggage (we track your flight and wait as long as it takes)'
                  : 'Checked baggage to drop off at curbside'}
              </span>
            </label>
          </div>

          <div className="text-[11px] text-fg-secondary bg-surface-card/85 p-2.5 rounded-lg border border-blue-100 leading-relaxed">
            {detection.isPrivateAviation ? (
              <>
                <span className="font-bold text-fg-strong">Private Aviation FBO Pickup: </span>
                <span>
                  Your driver coordinates directly with the FBO front desk for ramp-side or lobby pickup.
                </span>
              </>
            ) : detection.isPickupAirport ? (
              <>
                <span className="font-bold text-fg-strong">STL Curbside Pickup: </span>
                <span>
                  {lambertPickupInstructions ||
                    'Terminal 1: Lower Level Exit Door 6 / Door 12 • Terminal 2 (Southwest / Lufthansa): Baggage Claim Exit Door 12. We monitor your flight in real time.'}
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-fg-strong">STL Departures Tip: </span>
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
