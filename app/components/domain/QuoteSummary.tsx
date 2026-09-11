import React from 'react';
import type { QuoteResponse } from '../../core/services';
import { ClockIcon, MapPinIcon, ShieldCheckIcon, SpinnerIcon } from '../ui/Icons';
import { Card, CardContent } from '../ui/Card';

export interface QuoteSummaryProps {
  quote: QuoteResponse | null;
  isLoading?: boolean;
  className?: string;
}

export function QuoteSummary({ quote, isLoading = false, className = '' }: QuoteSummaryProps) {
  if (isLoading) {
    return (
      <Card variant="muted" className={`p-4 border-dashed animate-pulse ${className}`}>
        <div className="flex items-center justify-center gap-2.5 py-4 text-slate-500 text-sm">
          <SpinnerIcon className="w-5 h-5 animate-spin text-amber-500" />
          <span>Calculating live route & fare quote...</span>
        </div>
      </Card>
    );
  }

  if (!quote) {
    return (
      <div className={`p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center ${className}`}>
        <p className="text-xs text-slate-500">
          Enter pickup and dropoff destinations to calculate your live route distance and guaranteed fare quote.
        </p>
      </div>
    );
  }

  const { pricing, estimatedDistanceMiles, estimatedDurationMinutes } = quote;

  return (
    <Card variant="default" className={`overflow-hidden border-amber-200/80 shadow-sm ${className}`}>
      {/* Top Banner */}
      <div className="bg-amber-500/10 px-4 py-2.5 border-b border-amber-200/60 flex items-center justify-between text-xs">
        <span className="font-semibold text-amber-950 flex items-center gap-1.5">
          <ShieldCheckIcon className="w-4 h-4 text-amber-600" />
          Guaranteed Live Fare Quote
        </span>
        <span className="text-amber-800 text-[11px] font-medium">
          Pure Functional Engine
        </span>
      </div>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Estimated Distance & Time Metrics */}
        <div className="grid grid-cols-2 gap-2 text-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <MapPinIcon className="w-3 h-3 text-slate-400" /> Est. Distance
            </span>
            <span className="text-base font-bold text-slate-800 mt-0.5">
              {estimatedDistanceMiles.toFixed(1)} miles
            </span>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-slate-200">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ClockIcon className="w-3 h-3 text-slate-400" /> Est. Duration
            </span>
            <span className="text-base font-bold text-slate-800 mt-0.5">
              ~{Math.round(estimatedDurationMinutes)} mins
            </span>
          </div>
        </div>

        {/* Fare Breakdown Items */}
        <div className="space-y-1.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Base Dispatch Fare</span>
            <span className="font-medium text-slate-900">${pricing.baseFare.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Distance & Time ({estimatedDistanceMiles.toFixed(1)} mi)</span>
            <span className="font-medium text-slate-900">
              ${((pricing.distanceMiles * pricing.distanceRate) + (pricing.durationMinutes * pricing.timeRate)).toFixed(2)}
            </span>
          </div>
          {pricing.vehicleMultiplier !== 1 && (
            <div className="flex justify-between text-slate-600">
              <span>Vehicle Tier Multiplier</span>
              <span className="font-medium text-slate-900">{pricing.vehicleMultiplier}x</span>
            </div>
          )}
          {pricing.surgeMultiplier > 1 && (
            <div className="flex justify-between text-amber-700 font-medium">
              <span>Surge / Peak Multiplier</span>
              <span>{pricing.surgeMultiplier}x</span>
            </div>
          )}
          {pricing.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 font-semibold">
              <span>Promo / Voucher Discount</span>
              <span>-${pricing.discountAmount.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Total Price Display */}
        <div className="pt-3 border-t border-slate-100 flex items-baseline justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
              Total Quoted Fare
            </span>
            <span className="text-[11px] text-slate-400">Taxes & tolls included</span>
          </div>
          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              ${pricing.totalFare.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 ml-1 uppercase">{pricing.currency}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
