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
import { formatVehicleTierDisplay } from '../../../core/services/email/email-templates';

export interface DriverTripManifestProps {
  trip: Trip;
  adminVehicles?: VehicleTierConfig[];
  compact?: boolean;
}

export function resolveTripVehicleLabel(trip: Trip, adminVehicles?: VehicleTierConfig[]): string {
  const meta = (trip.metadata || {}) as Record<string, any>;
  if (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName.trim()) {
    return meta.vehicleDisplayName.trim();
  }
  const typeId = typeof meta.vehicleTypeId === 'string' ? meta.vehicleTypeId : undefined;
  if (typeId && adminVehicles?.length) {
    const match = adminVehicles.find((v) => v.id === typeId);
    if (match?.name) return match.name;
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
      label: 'Corporate Direct Bill',
      tone: 'purple',
      subtext: [corpOrg, billingPo ? `PO: ${billingPo}` : null].filter(Boolean).join(' · ') || undefined,
    };
  }
  if (method === 'cash') {
    return { label: 'Cash in Cab', tone: 'emerald' };
  }
  if (trip.payment?.status === 'authorized' && trip.payment?.paymentIntentId?.startsWith('pi_')) {
    return {
      label: trip.payment.cardLast4 ? `Card Pre-Auth •••• ${trip.payment.cardLast4}` : 'Card Pre-Auth Hold',
      tone: 'blue',
    };
  }
  return { label: 'Pay in Cab (Card / Cash)', tone: 'amber' };
}

export function DriverTripManifest({ trip, adminVehicles, compact = false }: DriverTripManifestProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
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
  const hasAviationInfo = Boolean(
    isPrivateAviation || airline || flightNumber || flightOrigin || legacyFlightNotes
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

  const badgeToneClasses: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/35',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  };

  const breakdown = Array.isArray(trip.pricing?.breakdown) ? trip.pricing.breakdown : [];

  return (
    <div className="space-y-2.5">
      {/* Primary Manifest Chips Row: Vehicle, Payment Method, Return Leg */}
      <div className="flex flex-wrap items-center gap-1.5">
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
      {hasAviationInfo && (
        <div className="bg-sky-950/35 border border-sky-700/40 rounded-2xl p-3 space-y-1 text-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400 block">
            {isPrivateAviation ? 'Private Aviation (FBO / Tail #)' : 'Commercial Flight Details'}
          </span>
          {isPrivateAviation ? (
            <div className="text-sky-100 space-y-0.5">
              {tailNumber && (
                <div>
                  <strong className="text-sky-300">Tail #:</strong> {tailNumber}
                </div>
              )}
              {fboFacility && (
                <div>
                  <strong className="text-sky-300">FBO Facility:</strong> {fboFacility}
                </div>
              )}
              {hasCheckedLuggage && (
                <div className="text-[11px] text-sky-200 font-semibold">Checked / Ramp Luggage Expected</div>
              )}
            </div>
          ) : (
            <div className="text-sky-100 space-y-0.5">
              {(airline || flightNumber) && (
                <div>
                  <strong className="text-sky-300">Flight:</strong> {airline} {flightNumber ? `#${flightNumber}` : ''}
                  {flightOrigin ? ` (from ${flightOrigin})` : ''}
                </div>
              )}
              {hasCheckedLuggage && (
                <div className="text-[11px] text-sky-200 font-semibold">Passenger Has Checked Luggage</div>
              )}
              {legacyFlightNotes && (
                <div className="text-[11px] text-sky-200">{legacyFlightNotes}</div>
              )}
            </div>
          )}
        </div>
      )}

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
