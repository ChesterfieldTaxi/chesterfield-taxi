/**
 * Driver Trip Manifest Component
 *
 * Renders the complete operational booking manifest inside Driver HUD cards
 * (Active, Offers, and Scheduled) so drivers never arrive blind:
 * - Admin custom vehicle tier name
 * - Payment method & Corporate Account / PO badge
 * - Return-leg indicator
 * - Car seat counts & types (rear-facing / front-facing / booster, even when fee-waived)
 * - Oversized cargo & Admin custom bookable extras
 * - Private Aviation (Tail # & FBO) and Commercial Flight (Airline, Flight #, Origin, Checked Bags)
 * - Booker vs Passenger contact info
 * - Pickup Apt/Unit, Gate Code, special requests, and top-level driver notes
 * - Expandable canonical `pricing.breakdown[]`
 */

import React, { useState } from 'react';
import type { Trip } from '../../../core/types/trip';
import type { VehicleTierConfig } from '../../../core/types/config';
import { formatVehicleTierDisplay } from '../../../core/utils/vehicle-tier-format.util';
import { reconcileBreakdownWithoutRounding } from '../../../core/utils/fare-breakdown.util';
import { resolveStlTerminalInfo } from '../../../core/config/airports';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { resolveTripFlightBadge } from '../../../core/services/flight/flight-status.service';

export interface DriverTripManifestProps {
  trip: Trip;
  adminVehicles?: VehicleTierConfig[];
  compact?: boolean;
}

export function resolveTripVehicleLabel(trip: Trip, adminVehicles?: VehicleTierConfig[]): string {
  const meta = (trip.metadata || {}) as Record<string, any>;
  if (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName.trim()) {
    const trimmed = meta.vehicleDisplayName.trim();
    if (trimmed.toLowerCase() === 'any' || trimmed.toLowerCase().startsWith('any vehicle')) {
      return 'Any';
    }
    return trimmed;
  }
  const typeId = typeof meta.vehicleTypeId === 'string' ? meta.vehicleTypeId : undefined;
  if (typeId) {
    if (typeId.toLowerCase() === 'any') return 'Any';
    if (adminVehicles?.length) {
      const match = adminVehicles.find((v) => v.id === typeId);
      if (match?.name) return match.name;
    }
  }
  return formatVehicleTierDisplay(trip.vehicleTier, adminVehicles);
}

export function resolveTripPaymentBadge(trip: Trip): {
  label: string;
  tone: 'emerald' | 'blue' | 'amber' | 'purple';
  subtext?: string;
} {
  const meta = (trip.metadata || {}) as Record<string, any>;
  const method = trip.payment?.method;
  const corpOrg = meta.corporateOrgName || meta.corporateDetails?.companyName;
  const billingPo = meta.billingPo || meta.corporateDetails?.billingPo;

  if (method === 'account' || method === 'corporate') {
    return {
      label: 'Corporate Account',
      tone: 'purple',
      subtext: [corpOrg, billingPo ? `PO: ${billingPo}` : null].filter(Boolean).join(' · ') || undefined,
    };
  }
  if (method === 'cash') {
    return { label: 'Cash (In Car)', tone: 'emerald' };
  }
  if (trip.payment?.status === 'authorized' && trip.payment?.paymentIntentId?.startsWith('pi_')) {
    return {
      label: trip.payment.cardLast4 ? `Card Pre-Auth •••• ${trip.payment.cardLast4}` : 'Card Pre-Auth Hold',
      tone: 'blue',
    };
  }
  return { label: 'Pay in Car (Card or Cash)', tone: 'amber' };
}

export function DriverTripManifest({ trip, adminVehicles, compact = false }: DriverTripManifestProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showMultiCarDetails, setShowMultiCarDetails] = useState(false);
  const meta = (trip.metadata || {}) as Record<string, any>;

  const vehicleLabel = resolveTripVehicleLabel(trip, adminVehicles);
  const payBadge = resolveTripPaymentBadge(trip);

  // Car Seats Breakdown (works even when fee is $0 / waived)
  const carSeats = meta.carSeatsBreakdown as
    | { rearFacing?: number; frontFacing?: number; booster?: number; total?: number }
    | undefined;
  const rearCount = Number(carSeats?.rearFacing || 0);
  const frontCount = Number(carSeats?.frontFacing || 0);
  const boosterCount = Number(carSeats?.booster || 0);
  const totalCarSeats = Number(carSeats?.total || rearCount + frontCount + boosterCount || meta.carSeatsCount || 0);
  const carSeatParts: string[] = [];
  if (rearCount > 0) carSeatParts.push(`${rearCount} Rear-Facing`);
  if (frontCount > 0) carSeatParts.push(`${frontCount} Front-Facing`);
  if (boosterCount > 0) carSeatParts.push(`${boosterCount} Booster`);
  const carSeatSummary =
    carSeatParts.length > 0
      ? carSeatParts.join(', ')
      : totalCarSeats > 0
      ? `${totalCarSeats} Car Seat${totalCarSeats > 1 ? 's' : ''}`
      : trip.pricing?.carSeatFee && trip.pricing.carSeatFee > 0
      ? 'Car Seat Requested'
      : '';

  // Oversized Cargo & Custom Extras
  const oversizedSummary =
    (typeof meta.oversizedItemsSummary === 'string' && meta.oversizedItemsSummary.trim()) ||
    (typeof meta.oversizedLuggageNotes === 'string' && meta.oversizedLuggageNotes.trim()) ||
    (meta.hasOversizedLuggage ? 'Oversized Cargo / Equipment' : '');
  const customExtrasSummary =
    typeof meta.customExtrasSummary === 'string' && meta.customExtrasSummary.trim()
      ? meta.customExtrasSummary.trim()
      : '';

  // Private Aviation vs Commercial Flight (reads structured metadata AND legacy flightNotes)
  const isPrivateAviation = Boolean(meta.isPrivateAviation || meta.tailNumber || meta.fboFacility);
  const tailNumber = typeof meta.tailNumber === 'string' ? meta.tailNumber.trim() : '';
  const fboFacility = typeof meta.fboFacility === 'string' ? meta.fboFacility.trim() : '';
  const airline = typeof (meta.airline || meta.airlineName) === 'string' ? String(meta.airline || meta.airlineName).trim() : '';
  const flightNumber = typeof meta.flightNumber === 'string' ? meta.flightNumber.trim() : '';
  const flightOrigin = typeof (meta.flightOrigin || meta.departureAirport) === 'string'
    ? String(meta.flightOrigin || meta.departureAirport).trim()
    : '';
  const hasCheckedLuggage = Boolean(meta.hasCheckedLuggage);
  const legacyFlightNotes = typeof trip.flightNotes === 'string' ? trip.flightNotes.trim() : '';
  const flightBadge = resolveTripFlightBadge(trip);
  const hasAviationInfo = Boolean(
    isPrivateAviation ||
      airline ||
      flightNumber ||
      flightOrigin ||
      legacyFlightNotes ||
      trip.flightTelemetry ||
      flightBadge.hasFlight
  );

  // Booker vs Passenger contact
  const bookerName =
    (meta.isBookingForSomeoneElse && meta.bookerName) ||
    trip.contactPerson?.name ||
    '';
  const bookerPhone =
    (meta.isBookingForSomeoneElse && meta.bookerPhone) ||
    trip.contactPerson?.phone ||
    '';
  const bookerRole = typeof meta.bookerRole === 'string' ? meta.bookerRole : '';

  // Access, Gate Code, Unit/Apt, Special Requests & Notes
  const unitOrApt = trip.pickupLocation?.unitOrApt?.trim() || '';
  const gateCode = typeof meta.gateCode === 'string' ? meta.gateCode.trim() : '';
  const specialRequests = trip.passenger?.specialRequests?.trim() || '';
  const topDriverNotes = trip.driverNotes?.trim() || '';
  const isReturnRide = Boolean(trip.isReturnRide || meta.isReturnRide);
  const hasReturnTrip = Boolean(trip.hasReturnTrip || trip.linkedReturnTripId);

  // Multi-Car Convoy & Associate Drivers awareness (reads top-level fields OR metadata fallback)
  const resolvedMultiCarGroupId = trip.multiCarGroupId || (typeof meta.multiCarGroupId === 'string' ? meta.multiCarGroupId : undefined);
  const multiCarTotal = Number(trip.multiCarTotal || meta.multiCarTotal || trip.vehicleCount || 1);
  const multiCarIndex = Number(trip.multiCarIndex || meta.multiCarIndex || 1);
  const isMultiCar = Boolean((resolvedMultiCarGroupId || trip.multipleVehiclesRequested) && multiCarTotal > 1);
  const multiCarAssociates = Array.isArray(trip.multiCarAssociates) ? trip.multiCarAssociates : [];
  const otherAssociates = multiCarAssociates
    .filter((a) => a.tripId !== trip.id)
    .sort((a, b) => (a.carIndex || 0) - (b.carIndex || 0));
  const multiCarTotalPax = Number(meta.multiCarTotalPassengers || 0);

  const formatAssociateStatus = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'en_route':
        return { label: 'En Route', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'arrived':
        return { label: 'Arrived', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'in_progress':
        return { label: 'On Trip', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'completed':
        return { label: 'Completed', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'assigned':
      case 'accepted':
        return { label: 'Assigned', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' };
      case 'cancelled':
      case 'declined':
        return { label: 'Cancelled', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      default:
        return { label: 'Unassigned', cls: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const badgeToneClasses: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/35',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  };

  const breakdown =
    Array.isArray(trip.pricing?.breakdown) && trip.pricing.breakdown.length > 0
      ? reconcileBreakdownWithoutRounding(trip.pricing.breakdown, trip.pricing?.totalFare, trip.pricing)
      : [];

  return (
    <div className="space-y-2.5">
      {/* Primary Manifest Chips Row: Multi-Car Convoy, Vehicle, Payment Method, Return Leg */}
      <div className="flex flex-wrap items-center gap-1.5">
        {trip.bookingCategory === 'package' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
            <span>PACKAGE</span>
            {trip.packageDetails?.description && (
              <span className="font-semibold normal-case text-amber-200/90">
                · {trip.packageDetails.description}
              </span>
            )}
          </span>
        )}
        {isMultiCar && (
          <button
            type="button"
            onClick={() => setShowMultiCarDetails((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-violet-600/25 hover:bg-violet-600/35 text-violet-200 border border-violet-500/50 transition-colors cursor-pointer"
            title="Toggle multi-car convoy & associate drivers details"
          >
            <span>MULTI-CAR</span>
            <span>·</span>
            <span>Car {multiCarIndex} of {multiCarTotal}</span>
          </button>
        )}
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-white border border-slate-700">
          <span>Vehicle:</span>
          <span className="text-blue-300">{vehicleLabel}</span>
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${badgeToneClasses[payBadge.tone]}`}
        >
          <span>{payBadge.label}</span>
          {payBadge.subtext && <span className="opacity-85">({payBadge.subtext})</span>}
        </span>
        {isReturnRide && (
          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            Return Leg
          </span>
        )}
        {hasReturnTrip && !isReturnRide && (
          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-slate-800 text-slate-300 border border-slate-700">
            Round-Trip Outbound
          </span>
        )}
      </div>

      {/* Collapsible Multi-Car Convoy & Associate Drivers Toggle */}
      {isMultiCar && (
        <div className="bg-violet-950/40 border border-violet-600/45 rounded-2xl overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowMultiCarDetails((v) => !v)}
            className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-violet-900/25 transition-colors cursor-pointer"
          >
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-violet-200">
                Multi-Car Order · Car {multiCarIndex} of {multiCarTotal}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-200 border border-violet-500/35 shrink-0">
                {multiCarAssociates.filter((a) => Boolean(a.driverId)).length}/{multiCarTotal} Assigned
              </span>
            </div>
            <span className="text-[11px] font-bold text-violet-300 shrink-0">
              {showMultiCarDetails ? 'Hide ▲' : 'Associates ▼'}
            </span>
          </button>

          {showMultiCarDetails && (
            <div className="px-3 pb-3 pt-2 border-t border-violet-800/50 space-y-2 animate-in fade-in duration-150">
              <div className="text-[11px] text-violet-200/80">
                {resolvedMultiCarGroupId ? `Group ${resolvedMultiCarGroupId}` : 'Linked Multi-Vehicle Order'}
                {multiCarTotalPax > 0 ? ` · ${multiCarTotalPax} total party passengers across ${multiCarTotal} vehicles` : ''}
              </div>

              {otherAssociates.length > 0 ? (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300/90 block">
                    Associate Drivers ({otherAssociates.length})
                  </span>
                  {otherAssociates.map((assoc) => {
                    const statusBadge = formatAssociateStatus(assoc.status);
                    const cleanPhone = assoc.driverPhone ? assoc.driverPhone.replace(/[^\d+]/g, '') : '';
                    return (
                      <div
                        key={assoc.tripId}
                        className="flex items-center justify-between gap-2 bg-slate-950/60 border border-violet-800/40 rounded-xl px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 border border-violet-500/30 shrink-0">
                              Car {assoc.carIndex}/{multiCarTotal}
                            </span>
                            <span className="font-bold text-white truncate">
                              {assoc.driverName || (assoc.driverId ? `Driver ${assoc.driverId.slice(-4)}` : 'Awaiting Assignment')}
                            </span>
                            {assoc.vehicleUnit && (
                              <span className="text-[10px] font-mono text-blue-300 shrink-0">
                                ({assoc.vehicleUnit})
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {assoc.vehicleDisplayName || assoc.vehicleTier || 'Standard Vehicle'}
                            {assoc.vehicleModel ? ` · ${assoc.vehicleModel}` : ''}
                            {assoc.licensePlate ? ` · ${assoc.licensePlate}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.cls}`}
                          >
                            {statusBadge.label}
                          </span>
                          {cleanPhone && (
                            <a
                              href={`tel:${cleanPhone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-colors"
                              title={`Call associate driver ${assoc.driverName || ''}`}
                            >
                              Call
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-violet-200/80">
                  Coordinate curbside pickup with dispatch — {multiCarTotal - 1} associate vehicle{multiCarTotal - 1 === 1 ? '' : 's'} assigned separately.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Equipment, Cargo, Car Seats & Custom Extras Alert Strip */}
      {(carSeatSummary || oversizedSummary || customExtrasSummary) && (
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-3 space-y-1.5 text-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block">
            Required Equipment &amp; Extras
          </span>
          {carSeatSummary && (
            <div className="text-amber-100">
              <strong className="text-amber-300">Child Safety Seats:</strong> {carSeatSummary}
            </div>
          )}
          {oversizedSummary && (
            <div className="text-amber-100">
              <strong className="text-amber-300">Oversized Cargo:</strong> {oversizedSummary}
            </div>
          )}
          {customExtrasSummary && (
            <div className="text-amber-100">
              <strong className="text-amber-300">Booked Extras:</strong> {customExtrasSummary}
            </div>
          )}
        </div>
      )}

      {/* Aviation / Flight Information */}
      {hasAviationInfo && (() => {
        const snap = trip.flightTelemetry;
        const termInfo = resolveStlTerminalInfo(
          snap?.airlineCode || airline || fboFacility,
          snap?.destinationIata || (typeof meta.airportIataCode === 'string' ? meta.airportIataCode : undefined),
          getAdminConfigService().getCachedSettings().customerBookingConfig
        );
        const pillToneMap: Record<typeof flightBadge.tone, string> = {
          emerald: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
          amber: 'bg-amber-500/25 text-amber-200 border-amber-400/50',
          rose: 'bg-rose-500/25 text-rose-200 border-rose-400/50',
          blue: 'bg-sky-500/25 text-sky-200 border-sky-400/45',
          slate: 'bg-slate-800 text-slate-200 border-slate-600',
        };
        const doorGuidance =
          termInfo.pickupDoorGuidance || flightBadge.pickupDoorGuidance || snap?.pickupDoorGuidance;

        return (
          <div className="bg-sky-950/35 border border-sky-700/40 rounded-2xl p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400">
                {isPrivateAviation ? 'Private Aviation (FBO / Tail #)' : 'Live Flight & Terminal Manifest'}
              </span>
              {flightBadge.hasFlight && flightBadge.shortLabel && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${
                    pillToneMap[flightBadge.tone]
                  }`}
                >
                  {flightBadge.shortLabel}
                </span>
              )}
            </div>

            {isPrivateAviation ? (
              <div className="text-sky-100 space-y-1">
                {tailNumber && (
                  <div>
                    <strong className="text-sky-300">Tail #:</strong>{' '}
                    <span className="font-mono font-bold">{tailNumber}</span>
                  </div>
                )}
                {fboFacility && (
                  <div>
                    <strong className="text-sky-300">FBO Facility:</strong> {fboFacility}
                  </div>
                )}
                {doorGuidance && (
                  <div className="text-[11px] font-bold text-emerald-300 bg-slate-950/60 border border-sky-800/50 rounded-lg px-2.5 py-1.5">
                    Ramp / Lobby Guidance: {doorGuidance}
                  </div>
                )}
                {hasCheckedLuggage && (
                  <div className="text-[11px] text-sky-200 font-semibold">Checked / Ramp Luggage Expected</div>
                )}
              </div>
            ) : (
              <div className="text-sky-100 space-y-1">
                {(snap?.flightIdent || airline || flightNumber) && (
                  <div>
                    <strong className="text-sky-300">Flight:</strong>{' '}
                    {snap?.airlineName || airline}{' '}
                    {snap?.flightIdent
                      ? `(${snap.flightIdent})`
                      : flightNumber
                      ? `#${flightNumber}`
                      : ''}
                    {snap?.originIata || flightOrigin
                      ? ` · from ${snap?.originIata || flightOrigin}${
                          snap?.originCity ? ` (${snap.originCity})` : ''
                        }`
                      : ''}
                  </div>
                )}

                {(snap?.estimatedArrivalIso || snap?.scheduledArrivalIso) && (
                  <div>
                    <strong className="text-sky-300">Est. Arrival:</strong>{' '}
                    <span className="font-mono font-bold text-white">
                      {new Date(
                        (snap.estimatedArrivalIso || snap.scheduledArrivalIso)!
                      ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {((snap?.terminal || termInfo.terminal) || snap?.gate || snap?.baggageClaim) && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {(snap?.terminal || termInfo.terminal) && (
                      <span className="px-2 py-0.5 rounded bg-sky-900/60 border border-sky-700/60 text-sky-100 font-bold text-[11px]">
                        {snap?.terminal || termInfo.terminal}
                      </span>
                    )}
                    {snap?.gate && (
                      <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-200 font-semibold text-[11px]">
                        Gate {snap.gate}
                      </span>
                    )}
                    {snap?.baggageClaim && (
                      <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-200 font-semibold text-[11px]">
                        Baggage Belt {snap.baggageClaim}
                      </span>
                    )}
                  </div>
                )}

                {doorGuidance && (
                  <div className="text-[11px] font-bold text-emerald-300 bg-slate-950/70 border border-emerald-700/40 rounded-lg px-2.5 py-1.5">
                    Curbside Door: {doorGuidance}
                  </div>
                )}

                {hasCheckedLuggage && (
                  <div className="text-[11px] text-sky-200 font-semibold">Passenger Has Checked Luggage</div>
                )}
                {legacyFlightNotes && (
                  <div className="text-[11px] text-sky-200/90">{legacyFlightNotes}</div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Access Codes, Booker Contact, Special Requests & Notes */}
      {(unitOrApt || gateCode || bookerName || specialRequests || topDriverNotes) && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-1.5 text-xs">
          {(unitOrApt || gateCode) && (
            <div className="flex flex-wrap gap-2">
              {unitOrApt && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold">
                  Apt / Unit: {unitOrApt}
                </span>
              )}
              {gateCode && (
                <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 font-bold">
                  Gate Code: {gateCode}
                </span>
              )}
            </div>
          )}
          {bookerName && (
            <div className="text-slate-300">
              <strong className="text-blue-300">Booked By{bookerRole ? ` (${bookerRole})` : ''}:</strong>{' '}
              {bookerName}
              {bookerPhone ? ` · ${bookerPhone}` : ''}
            </div>
          )}
          {specialRequests && (
            <div className="text-slate-300">
              <strong className="text-indigo-300">Preferences:</strong> {specialRequests}
            </div>
          )}
          {topDriverNotes && (
            <div className="text-slate-200 leading-relaxed whitespace-pre-wrap">
              <strong className="text-blue-400">Dispatch / Driver Notes:</strong> {topDriverNotes}
            </div>
          )}
        </div>
      )}

      {/* Expandable Canonical Fare Breakdown */}
      {!compact && breakdown.length > 0 && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-300 hover:bg-slate-900/80 cursor-pointer min-h-[44px]"
          >
            <span>
              Fare Breakdown ({breakdown.length} item{breakdown.length === 1 ? '' : 's'})
              {trip.pricing?.tariffProfileName ? ` · ${trip.pricing.tariffProfileName}` : ''}
            </span>
            <span className="text-blue-400">{showBreakdown ? 'Hide ▲' : 'Show ▼'}</span>
          </button>
          {showBreakdown && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-800/80 space-y-1.5 text-xs">
              {breakdown.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-slate-300">
                  <div className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {item.detail && (
                      <span className="text-[10px] text-slate-500 block">{item.detail}</span>
                    )}
                  </div>
                  <span
                    className={`font-mono font-bold shrink-0 ${
                      item.amount < 0 ? 'text-emerald-400' : 'text-slate-100'
                    }`}
                  >
                    {item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`}
                  </span>
                </div>
              ))}
              <div className="pt-1.5 mt-1.5 border-t border-slate-800 flex justify-between font-black text-white">
                <span>Total Fare</span>
                <span className="font-mono text-blue-400">
                  ${(trip.pricing?.totalFare || 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
