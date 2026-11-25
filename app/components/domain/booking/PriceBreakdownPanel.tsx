import React from 'react';
import type { PriceLineItem, TripPricing } from '../../../core/types';
import { reconcileBreakdownWithoutRounding } from '../../../core/utils/fare-breakdown.util';

export interface PriceBreakdownPanelProps {
  outboundPricing?: TripPricing | null;
  returnPricing?: TripPricing | null;
  outboundDisplayFare: number | null;
  returnDisplayFare: number | null;
  totalDisplayFare: number | null;
  isRoundTrip: boolean;
  vehicleLabel: string;
  returnVehicleLabel?: string;
}

/**
 * Helper to build clean, rounding-free itemized breakdown lines whose sum
 * always reconciles to `targetDisplayFare` by folding any rounding/ceiling
 * adjustment silently into Base Fare.
 */
function buildCleanBreakdownLines(
  pricing: TripPricing,
  targetDisplayFare: number | null
): PriceLineItem[] {
  return reconcileBreakdownWithoutRounding(pricing.breakdown, targetDisplayFare, pricing);
}

/**
 * Renders the canonical single-source-of-truth Price Breakdown produced by the
 * Admin Tariff & Pricing Engine (`pricing.breakdown[]`).
 * Rounding adjustments are folded into Base Fare so customers see clean, reconciled totals.
 */
export function PriceBreakdownPanel({
  outboundPricing,
  returnPricing,
  outboundDisplayFare,
  returnDisplayFare,
  totalDisplayFare,
  isRoundTrip,
  vehicleLabel,
  returnVehicleLabel,
}: PriceBreakdownPanelProps) {
  if (!outboundPricing || totalDisplayFare === null) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
        Enter pickup and dropoff addresses to view an itemized fare breakdown.
      </div>
    );
  }

  const outboundLines = buildCleanBreakdownLines(outboundPricing, outboundDisplayFare);
  const effectiveReturnFare = returnDisplayFare ?? outboundDisplayFare;
  const returnLines =
    isRoundTrip && returnPricing
      ? buildCleanBreakdownLines(returnPricing, effectiveReturnFare)
      : [];

  return (
    <div
      id="trip-price-breakdown"
      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 gap-2">
        <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px]">
          {isRoundTrip ? 'Outbound Fare Breakdown' : 'Estimated Fare Breakdown'}
        </span>
        <span className="text-[10px] font-semibold text-slate-500 truncate">
          {outboundPricing.matchedCorridorName || outboundPricing.tariffProfileName || vehicleLabel}
        </span>
      </div>

      <div className="space-y-1.5 text-slate-700">
        {outboundLines.map((item) => {
          const isWaived = Boolean(item.isWaived || (item.amount === 0 && /\(waived\)/i.test(item.label)));
          const isDiscount = item.category === 'discount' || item.amount < 0;
          const isBase = item.category === 'base';

          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 ${
                isDiscount || isWaived ? 'text-emerald-700 font-semibold' : ''
              }`}
            >
              <span className={isBase ? 'font-semibold text-slate-900' : isWaived ? 'text-emerald-700' : 'text-slate-700'}>
                {item.label}
              </span>
              <span
                className={`font-mono font-semibold shrink-0 inline-flex items-center gap-1.5 ${
                  isDiscount || isWaived ? 'text-emerald-700' : 'text-slate-900'
                }`}
              >
                {isWaived ? (
                  <>
                    {typeof item.originalAmount === 'number' && item.originalAmount > 0 && (
                      <span className="line-through text-slate-400 font-normal">
                        ${item.originalAmount.toFixed(2)}
                      </span>
                    )}
                    <span>$0.00</span>
                  </>
                ) : isDiscount ? (
                  `-$${Math.abs(item.amount).toFixed(2)}`
                ) : (
                  `$${item.amount.toFixed(2)}`
                )}
              </span>
            </div>
          );
        })}
      </div>

      {isRoundTrip && (
        <div className="pt-2 border-t border-slate-200 space-y-2 text-slate-700">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Outbound Subtotal</span>
            <span className="font-mono font-bold text-slate-900">
              ${(outboundDisplayFare ?? 0).toFixed(2)}
            </span>
          </div>

          {returnLines.length > 0 ? (
            <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-indigo-900 uppercase tracking-wider text-[10px]">
                  Return Leg {returnPricing ? `(${returnPricing.distanceMiles.toFixed(1)} mi)` : ''}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 truncate">
                  {returnPricing?.matchedCorridorName ||
                    returnPricing?.tariffProfileName ||
                    returnVehicleLabel ||
                    vehicleLabel}
                </span>
              </div>

              {returnLines.map((item) => {
                const isWaived = Boolean(item.isWaived || (item.amount === 0 && /\(waived\)/i.test(item.label)));
                const isDiscount = item.category === 'discount' || item.amount < 0;
                const isBase = item.category === 'base';
                return (
                  <div
                    key={`ret-${item.id}`}
                    className={`flex items-center justify-between gap-2 ${
                      isDiscount || isWaived ? 'text-emerald-700 font-semibold' : ''
                    }`}
                  >
                    <span className={isBase ? 'font-semibold text-slate-900' : isWaived ? 'text-emerald-700' : 'text-slate-700'}>
                      {item.label}
                    </span>
                    <span
                      className={`font-mono font-semibold shrink-0 inline-flex items-center gap-1.5 ${
                        isDiscount || isWaived ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {isWaived ? (
                        <>
                          {typeof item.originalAmount === 'number' && item.originalAmount > 0 && (
                            <span className="line-through text-slate-400 font-normal">
                              ${item.originalAmount.toFixed(2)}
                            </span>
                          )}
                          <span>$0.00</span>
                        </>
                      ) : isDiscount ? (
                        `-$${Math.abs(item.amount).toFixed(2)}`
                      ) : (
                        `$${item.amount.toFixed(2)}`
                      )}
                    </span>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-1">
                <span className="font-bold text-indigo-900">Return Subtotal</span>
                <span className="font-mono font-bold text-indigo-950">
                  ${(effectiveReturnFare ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                Return Leg {returnPricing ? `(${returnPricing.distanceMiles.toFixed(1)} mi)` : '(est.)'}
              </span>
              <span className="font-mono font-semibold text-slate-900">
                ${(effectiveReturnFare ?? 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-slate-300 flex items-center justify-between font-extrabold text-slate-950">
        <span>{isRoundTrip ? 'Estimated Round-Trip Total' : 'Estimated Total'}</span>
        <span className="font-mono text-sm">${totalDisplayFare.toFixed(2)}</span>
      </div>

      <p className="text-[10.5px] text-slate-500 leading-snug">
        Estimated upfront fare based on active tariff rules (gratuity optional). Final confirmed fare is sent in your dispatch confirmation email.
      </p>
    </div>
  );
}
