import type { PriceLineItem, TripPricing } from '../types';

const roundCents = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;

export function isRoundingLineItem(item?: Partial<PriceLineItem> | null): boolean {
  if (!item) return false;
  if (item.category === 'rounding' || item.sourceType === 'rounding') return true;
  return /^rounding$/i.test(String(item.label || '').trim());
}

function buildFallbackItemsFromPricing(pricing: Partial<TripPricing>): PriceLineItem[] {
  const baseSeed = pricing.tariffBaseSubtotal ?? pricing.subtotal ?? pricing.baseFare ?? pricing.totalFare ?? 0;
  const items: PriceLineItem[] = [
    { id: 'base-fare', category: 'base', label: 'Base Fare', amount: roundCents(baseSeed), sourceType: 'tariff' },
  ];
  for (const [idx, s] of (pricing.itemizedSurcharges || []).entries()) {
    const isWaived = s.amount === 0 && /\(waived\)/i.test(s.name || '');
    if (s.amount > 0 || isWaived) {
      items.push({
        id: `legacy-surcharge-${idx}`, category: 'surcharge', label: s.name,
        amount: roundCents(s.amount), isWaived, originalAmount: s.originalAmount, sourceType: 'surcharge',
      });
    }
  }
  if (typeof pricing.discountAmount === 'number' && pricing.discountAmount > 0) {
    items.push({
      id: 'legacy-discount', category: 'discount', label: 'Applied Discount',
      amount: -roundCents(pricing.discountAmount), sourceType: 'discount',
    });
  }
  return items;
}

/**
 * Strips all rounding/alignment items and folds any delta silently into `'base'` (`Base Fare`)
 * so `base -> extra -> surcharge -> discount` reconciles penny-for-penny (`<= $0.005`) to `targetTotalFare`.
 */
export function reconcileBreakdownWithoutRounding(
  items?: ReadonlyArray<PriceLineItem> | null,
  targetTotalFare?: number | null,
  fallbackPricing?: Partial<TripPricing> | null
): PriceLineItem[] {
  const hasExplicitTarget = typeof targetTotalFare === 'number' && Number.isFinite(targetTotalFare);
  const resolvedTarget = hasExplicitTarget
    ? roundCents(targetTotalFare as number)
    : typeof fallbackPricing?.totalFare === 'number' && Number.isFinite(fallbackPricing.totalFare)
    ? roundCents(fallbackPricing.totalFare)
    : null;

  const sourceItems: PriceLineItem[] =
    Array.isArray(items) && items.length > 0
      ? [...items]
      : fallbackPricing
      ? buildFallbackItemsFromPricing(fallbackPricing)
      : hasExplicitTarget
      ? [{ id: 'base-fare', category: 'base', label: 'Base Fare', amount: roundCents(targetTotalFare as number), sourceType: 'tariff' }]
      : [];

  if (sourceItems.length === 0) return [];

  let roundingSum = 0;
  const baseItems: PriceLineItem[] = [];
  const extraItems: PriceLineItem[] = [];
  const surchargeItems: PriceLineItem[] = [];
  const discountItems: PriceLineItem[] = [];

  for (const item of sourceItems) {
    if (!item) continue;
    if (isRoundingLineItem(item)) { roundingSum += Number(item.amount || 0); continue; }
    const amt = roundCents(item.amount);
    if (item.category === 'base') baseItems.push({ ...item, amount: amt });
    else if (item.category === 'extra') { if (amt !== 0 || item.isWaived) extraItems.push({ ...item, amount: amt }); }
    else if (item.category === 'surcharge') { if (amt !== 0 || item.isWaived) surchargeItems.push({ ...item, amount: amt }); }
    else if (item.category === 'discount' || amt < 0) { if (amt !== 0) discountItems.push({ ...item, category: 'discount', amount: amt }); }
    else if (amt !== 0) extraItems.push({ ...item, category: 'extra', amount: amt });
  }

  const rawBaseSum = baseItems.reduce((sum, li) => sum + li.amount, 0);
  const nonBaseSum = [...extraItems, ...surchargeItems, ...discountItems].reduce(
    (sum, li) => sum + (li.isWaived ? 0 : li.amount), 0
  );
  const reconciledBaseAmount = resolvedTarget !== null ? roundCents(resolvedTarget - nonBaseSum) : roundCents(rawBaseSum + roundingSum);
  const primaryBase = baseItems[0];
  const shouldEmitBase = baseItems.length > 0 || roundingSum !== 0 || resolvedTarget !== null;

  return [
    ...(shouldEmitBase
      ? [{
          ...(primaryBase || {}),
          id: primaryBase?.id || 'base-fare',
          category: 'base' as const,
          label: 'Base Fare',
          amount: reconciledBaseAmount,
          sourceType: primaryBase?.sourceType || 'tariff',
        }]
      : []),
    ...extraItems,
    ...surchargeItems,
    ...discountItems,
  ];
}
