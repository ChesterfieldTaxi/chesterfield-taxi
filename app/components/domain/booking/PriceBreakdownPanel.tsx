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
      <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl text-xs text-fg-muted">
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
      className="p-3.5 bg-surface-subtle border border-border-subtle rounded-xl space-y-2.5 text-xs animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between border-b border-border-subtle pb-2 gap-2">
        <span className="font-extrabold text-fg-primary uppercase tracking-wider text-[10px]">
          {isRoundTrip ? 'Outbound Fare Breakdown' : 'Estimated Fare Breakdown'}
        </span>
        <span className="text-[10px] font-semibold text-fg-muted truncate">
          {outboundPricing.matchedCorridorName || outboundPricing.tariffProfileName || vehicleLabel}
        </span>
      </div>

      <div className="space-y-1.5 text-fg-secondary">
        {outboundLines.map((item) => {
          const isWaived = Boolean(item.isWaived || (item.amount === 0 && /\(waived\)/i.test(item.label)));
          const isDiscount = item.category === 'discount' || item.amount < 0;
          const isBase = item.category === 'base';

          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 ${
                isDiscount || isWaived ? 'text-status-success-fg font-semibold' : ''
              }`}
            >
              <span className={isBase ? 'font-semibold text-fg-primary' : isWaived ? 'text-status-success-fg' : 'text-fg-secondary'}>
                {item.label}
              </span>
              <span
                className={`font-mono font-semibold shrink-0 inline-flex items-center gap-1.5 ${
                  isDiscount || isWaived ? 'text-status-success-fg' : 'text-fg-primary'
                }`}
              >
                {isWaived ? (
                  <>
                    {typeof item.originalAmount === 'number' && item.originalAmount > 0 && (
                      <span className="line-through text-fg-subtle font-normal">
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
        <div className="pt-2 border-t border-border-subtle space-y-2 text-fg-secondary">
          <div className="flex items-center justify-between">
            <span className="font-bold text-fg-strong">Outbound Subtotal</span>
            <span className="font-mono font-bold text-fg-primary">
              ${(outboundDisplayFare ?? 0).toFixed(2)}
            </span>
          </div>

          {returnLines.length > 0 ? (
            <div className="pt-2 border-t border-border-subtle/80 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-status-staged-fg uppercase tracking-wider text-[10px]">
                  Return Leg {returnPricing ? `(${returnPricing.distanceMiles.toFixed(1)} mi)` : ''}
                </span>
                <span className="text-[10px] font-semibold text-fg-muted truncate">
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
                      isDiscount || isWaived ? 'text-status-success-fg font-semibold' : ''
                    }`}
                  >
                    <span className={isBase ? 'font-semibold text-fg-primary' : isWaived ? 'text-status-success-fg' : 'text-fg-secondary'}>
                      {item.label}
                    </span>
                    <span
                      className={`font-mono font-semibold shrink-0 inline-flex items-center gap-1.5 ${
                        isDiscount || isWaived ? 'text-status-success-fg' : 'text-fg-primary'
                      }`}
                    >
                      {isWaived ? (
                        <>
                          {typeof item.originalAmount === 'number' && item.originalAmount > 0 && (
                            <span className="line-through text-fg-subtle font-normal">
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
                <span className="font-bold text-status-staged-fg">Return Subtotal</span>
                <span className="font-mono font-bold text-status-staged-fg">
                  ${(effectiveReturnFare ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                Return Leg {returnPricing ? `(${returnPricing.distanceMiles.toFixed(1)} mi)` : '(est.)'}
              </span>
              <span className="font-mono font-semibold text-fg-primary">
                ${(effectiveReturnFare ?? 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-border-strong flex items-center justify-between font-extrabold text-fg-primary">
        <span>{isRoundTrip ? 'Estimated Round-Trip Total' : 'Estimated Total'}</span>
        <span className="font-mono text-sm">${totalDisplayFare.toFixed(2)}</span>
      </div>

      <p className="text-[10.5px] text-fg-muted leading-snug">
        Estimated upfront fare based on active tariff rules (gratuity optional). Final confirmed fare is sent in your dispatch confirmation email.
      </p>
    </div>
  );
}
