import React from 'react';
import type { TripPricing } from '../../../core/types';

export interface PriceBreakdownPanelProps {
  outboundPricing?: TripPricing | null;
  returnPricing?: TripPricing | null;
  outboundDisplayFare: number | null;
  returnDisplayFare: number | null;
  totalDisplayFare: number | null;
  isRoundTrip: boolean;
  vehicleLabel: string;
}

export function PriceBreakdownPanel({
  outboundPricing,
  returnPricing,
  outboundDisplayFare,
  returnDisplayFare,
  totalDisplayFare,
  isRoundTrip,
  vehicleLabel,
}: PriceBreakdownPanelProps) {
  if (!outboundPricing || totalDisplayFare === null) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
        Enter pickup and dropoff addresses to view an itemized fare breakdown.
      </div>
    );
  }

  const distanceCharge = Math.max(0, outboundPricing.distanceMiles * outboundPricing.distanceRate);
  const timeCharge = Math.max(0, outboundPricing.durationMinutes * outboundPricing.timeRate);
  const hasMultiplier = outboundPricing.vehicleMultiplier && outboundPricing.vehicleMultiplier > 1.01;
  const hasSurge = outboundPricing.surgeMultiplier && outboundPricing.surgeMultiplier > 1.01;

  return (
    <div
      id="trip-price-breakdown"
      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px]">
          Estimated Fare Breakdown
        </span>
        <span className="text-[10px] font-semibold text-slate-500">
          {outboundPricing.matchedCorridorName || outboundPricing.tariffProfileName || vehicleLabel}
        </span>
      </div>

      <div className="space-y-1.5 text-slate-700">
        <div className="flex items-center justify-between">
          <span>Base Flag-Drop Fare</span>
          <span className="font-mono font-semibold text-slate-900">
            ${outboundPricing.baseFare.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span>
            Distance ({outboundPricing.distanceMiles.toFixed(1)} mi &times; ${outboundPricing.distanceRate.toFixed(2)}/mi)
          </span>
          <span className="font-mono font-semibold text-slate-900">
            ${distanceCharge.toFixed(2)}
          </span>
        </div>

        {timeCharge > 0 && (
          <div className="flex items-center justify-between">
            <span>
              Est. Transit Time ({Math.round(outboundPricing.durationMinutes)} min)
            </span>
            <span className="font-mono font-semibold text-slate-900">
              ${timeCharge.toFixed(2)}
            </span>
          </div>
        )}

        {hasMultiplier && (
          <div className="flex items-center justify-between text-blue-800">
            <span>Vehicle Class ({vehicleLabel})</span>
            <span className="font-mono font-semibold">
              {outboundPricing.vehicleMultiplier.toFixed(2)}&times;
            </span>
          </div>
        )}

        {hasSurge && (
          <div className="flex items-center justify-between text-amber-800">
            <span>Peak Demand Multiplier</span>
            <span className="font-mono font-semibold">
              {outboundPricing.surgeMultiplier.toFixed(2)}&times;
            </span>
          </div>
        )}

        {Boolean(outboundPricing.airportSurcharge && outboundPricing.airportSurcharge > 0) && (
          <div className="flex items-center justify-between">
            <span>Airport Facility / Gate Fee</span>
            <span className="font-mono font-semibold text-slate-900">
              ${Number(outboundPricing.airportSurcharge).toFixed(2)}
            </span>
          </div>
        )}

        {Boolean(outboundPricing.multiStopSurcharge && outboundPricing.multiStopSurcharge > 0) && (
          <div className="flex items-center justify-between">
            <span>Intermediate Stops ({outboundPricing.intermediateStopsCount || 1})</span>
            <span className="font-mono font-semibold text-slate-900">
              ${Number(outboundPricing.multiStopSurcharge).toFixed(2)}
            </span>
          </div>
        )}

        {Boolean(outboundPricing.carSeatFee && outboundPricing.carSeatFee > 0) && (
          <div className="flex items-center justify-between">
            <span>Sanitized Child Safety Seats</span>
            <span className="font-mono font-semibold text-slate-900">
              ${Number(outboundPricing.carSeatFee).toFixed(2)}
            </span>
          </div>
        )}

        {Boolean(outboundPricing.passengerSurcharge && outboundPricing.passengerSurcharge > 0) && (
          <div className="flex items-center justify-between">
            <span>Extra Passenger Fee</span>
            <span className="font-mono font-semibold text-slate-900">
              ${Number(outboundPricing.passengerSurcharge).toFixed(2)}
            </span>
          </div>
        )}

        {Boolean(outboundPricing.tollsFee && outboundPricing.tollsFee > 0) && (
          <div className="flex items-center justify-between">
            <span>Estimated Tolls</span>
            <span className="font-mono font-semibold text-slate-900">
              ${Number(outboundPricing.tollsFee).toFixed(2)}
            </span>
          </div>
        )}

        {outboundPricing.itemizedSurcharges?.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <span>{item.name}</span>
            <span className="font-mono font-semibold text-slate-900">
              ${item.amount.toFixed(2)}
            </span>
          </div>
        ))}

        {outboundPricing.discountAmount > 0 && (
          <div className="flex items-center justify-between text-emerald-700 font-semibold">
            <span>Applied Discount</span>
            <span className="font-mono">-${outboundPricing.discountAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      {isRoundTrip && (
        <div className="pt-2 border-t border-slate-200 space-y-1 text-slate-700">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Outbound Leg (est.)</span>
            <span className="font-mono font-semibold text-slate-900">
              ${(outboundDisplayFare ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              Return Leg {returnPricing ? `(${returnPricing.distanceMiles.toFixed(1)} mi)` : '(est.)'}
            </span>
            <span className="font-mono font-semibold text-slate-900">
              ${(returnDisplayFare ?? outboundDisplayFare ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-slate-300 flex items-center justify-between font-extrabold text-slate-950">
        <span>{isRoundTrip ? 'Estimated Round-Trip Total' : 'Estimated Total'}</span>
        <span className="font-mono text-sm">${totalDisplayFare.toFixed(2)}</span>
      </div>

      <p className="text-[10.5px] text-slate-500 leading-snug">
        Estimated upfront fare rounded to nearest dollar (gratuity optional). Final confirmed fare is sent in your dispatch confirmation email.
      </p>
    </div>
  );
}
