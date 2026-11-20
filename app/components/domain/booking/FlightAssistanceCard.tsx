import React from 'react';
import { PlaneLandingIcon } from '../../ui/Icons';
import { MAJOR_AIRLINES } from '../../../core/config/airports';

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
            Your chauffeur arrives at your scheduled pickup time. Departing flights are not monitored for pickup adjustments.
          </span>
        </div>
      )}

      {provideFlightInfo && (
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
                <input
                  type="text"
                  placeholder="e.g. TEB, VNY, PWK"
                  value={flightOrigin}
                  onChange={(e) => onFlightOriginChange(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 bg-white border ${inputBorder} rounded-lg text-base sm:text-sm uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                  Airline {detection.isDropoffAirport ? '(Terminal Door)' : ''}
                </label>
                <select
                  value={airline}
                  onChange={(e) => onAirlineChange(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border ${inputBorder} rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                >
                  <option value="">Select Airline</option>
                  {MAJOR_AIRLINES.map((al) => (
                    <option key={al.code} value={al.name}>
                      {al.name} ({al.code})
                    </option>
                  ))}
                </select>
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
                  onChange={(e) => onFlightNumberChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
                <input
                  type="text"
                  placeholder="e.g. ORD, ATL, DEN"
                  value={flightOrigin}
                  onChange={(e) => onFlightOriginChange(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 bg-white border ${inputBorder} rounded-lg text-base sm:text-sm uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25`}
                />
              </div>
            </div>
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
                  Your chauffeur coordinates directly with the FBO front desk for ramp-side or lobby greeting.
                </span>
              </>
            ) : detection.isPickupAirport ? (
              <>
                <span className="font-bold text-slate-800">STL Curbside Pickup: </span>
                <span>
                  {lambertPickupInstructions ||
                    'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. We monitor your flight in real time and wait as long as it takes.'}
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-800">STL Departures Tip: </span>
                <span>
                  Terminal 1: American, Delta, United, Spirit, Frontier • Terminal 2: Southwest Airlines.
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
