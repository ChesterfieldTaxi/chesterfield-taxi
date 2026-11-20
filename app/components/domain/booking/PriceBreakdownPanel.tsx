import React from 'react';
import type { PriceLineItem, TripPricing } from '../../../core/types';

export interface PriceBreakdownPanelProps {
  outboundPricing?: TripPricing | null;
  returnPricing?: TripPricing | null;
  outboundDisplayFare: number | null;
  returnDisplayFare: number | null;
  totalDisplayFare: number | null;
  isRoundTrip: boolean;
  vehicleLabel: string;
}

/**
 * Renders the canonical single-source-of-truth Price Breakdown produced by the
 * Admin Tariff & Pricing Engine (`pricing.breakdown[]`).
 *
 * Line order:
 * 1. Base Fare
 * 2. Customer Extras & Add-ons (each on its own line)
 * 3. Operational & Vehicle Surcharges (each on its own line)
 * 4. Discounts (if any)
 * 5. Rounding (only if percentage modifiers produced cents)
 * 6. Outbound / Return Leg Summary (if Round-Trip) & Estimated Total
 */
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

  // Canonical line items from the pricing engine; graceful fallback for legacy trips without breakdown[]
  const canonicalItems: PriceLineItem[] =
    outboundPricing.breakdown && outboundPricing.breakdown.length > 0
      ? outboundPricing.breakdown
      : [
          {
            id: 'base-fare',
            category: 'base',
            label: 'Base Fare',
            amount: outboundPricing.tariffBaseSubtotal ?? outboundPricing.subtotal ?? outboundPricing.baseFare,
          },
          ...(outboundPricing.itemizedSurcharges || [])
            .filter((s) => s.amount > 0)
            .map((s, i) => ({
              id: `legacy-surcharge-${i}`,
              category: 'surcharge' as const,
              label: s.name,
              amount: s.amount,
            })),
          ...(outboundPricing.discountAmount > 0
            ? [
                {
                  id: 'legacy-discount',
                  category: 'discount' as const,
                  label: 'Applied Discount',
                  amount: -outboundPricing.discountAmount,
                },
              ]
            : []),
        ];

  const baseLine = canonicalItems.find((item) => item.category === 'base');
  const extrasLines = canonicalItems.filter((item) => item.category === 'extra' && item.amount !== 0);
  const surchargeLines = canonicalItems.filter(
    (item) => item.category === 'surcharge' && item.amount !== 0
  );
  const discountLines = canonicalItems.filter(
    (item) => item.category === 'discount' && item.amount !== 0
  );
  const roundingLines = canonicalItems.filter(
    (item) => item.category === 'rounding' && item.amount !== 0
  );

  const orderedLines: PriceLineItem[] = [
    ...(baseLine ? [{ ...baseLine, label: 'Base Fare' }] : []),
    ...extrasLines,
    ...surchargeLines,
    ...discountLines,
    ...roundingLines,
  ];

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
        {orderedLines.map((item) => {
          const isDiscount = item.category === 'discount' || item.amount < 0;
          const isBase = item.category === 'base';

          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 ${
                isDiscount ? 'text-emerald-700 font-semibold' : ''
              }`}
            >
              <span className={isBase ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                {item.label}
              </span>
              <span
                className={`font-mono font-semibold shrink-0 ${
                  isDiscount ? 'text-emerald-700' : 'text-slate-900'
                }`}
              >
                {isDiscount
                  ? `-$${Math.abs(item.amount).toFixed(2)}`
                  : `$${item.amount.toFixed(2)}`}
              </span>
            </div>
          );
        })}
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
        Estimated upfront fare based on active tariff rules (gratuity optional). Final confirmed fare is sent in your dispatch confirmation email.
      </p>
    </div>
  );
}
