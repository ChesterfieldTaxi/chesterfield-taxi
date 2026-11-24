import {
  DEFAULT_OVERSIZED_BAG_CATEGORIES,
  type SurchargesConfig,
  type UniversalExtrasConfig,
} from '../../../../core/types/config';
import type { TripPricing } from '../../../../core/types/trip';
import {
  DEFAULT_SURCHARGES_CONFIG,
  getSurchargeCatalogItems,
} from '../../../../core/services/pricing/surcharges.service';
import { DEFAULT_UNIVERSAL_EXTRAS } from '../../../../core/services/pricing/extras.service';

export interface WaivableFeeOption {
  kind: 'surcharge' | 'extra';
  key: string;
  label: string;
  rateBadge: string;
  liveAppliedAmount: number;
}

/**
 * Builds the active-only Admin Surcharges (`s.enabled`) & active non-zero Admin Extras
 * catalog for the Dispatch `Waive Fees ▾` multi-select dropdown.
 */
export function buildActiveWaivableFeeOptions(params: {
  surchargesConfig?: SurchargesConfig | null;
  universalExtrasConfig?: UniversalExtrasConfig | null;
  outboundPricing?: TripPricing | null;
}): { surcharges: WaivableFeeOption[]; extras: WaivableFeeOption[]; all: WaivableFeeOption[] } {
  const breakdown = params.outboundPricing?.breakdown || [];
  const resolveLineAmt = (matcher: (id: string, sourceId?: string) => boolean): number =>
    breakdown
      .filter((li) => matcher(li.id, li.sourceId))
      .reduce((sum, li) => sum + (li.isWaived ? li.originalAmount ?? 0 : Math.max(0, li.amount)), 0);

  const catalogItems = getSurchargeCatalogItems(params.surchargesConfig || DEFAULT_SURCHARGES_CONFIG);
  const surcharges: WaivableFeeOption[] = catalogItems
    .filter((s) => s.enabled)
    .map((item) => {
      const rateBadge =
        item.mode === 'multiplier'
          ? `${item.amount.toFixed(2)}×`
          : item.mode === 'percent'
          ? `${item.amount}%`
          : item.mode === 'per_mile'
          ? `$${item.amount.toFixed(2)}/mi`
          : `$${item.amount.toFixed(2)}`;
      const liveAppliedAmount = resolveLineAmt(
        (id, src) => src === item.id || id === item.id || id === `${item.id}-waived`
      );
      return { kind: 'surcharge', key: item.id, label: item.name, rateBadge, liveAppliedAmount };
    });

  const ex = params.universalExtrasConfig || DEFAULT_UNIVERSAL_EXTRAS;
  const extras: WaivableFeeOption[] = [];

  if ((ex.intermediateStopFee ?? 0) > 0) {
    extras.push({
      kind: 'extra',
      key: 'intermediate_stop',
      label: 'Intermediate Stop Fee',
      rateBadge: `$${ex.intermediateStopFee.toFixed(2)}/stop`,
      liveAppliedAmount: resolveLineAmt((id) => id === 'extra-stops' || id === 'extra-stops-waived'),
    });
  }
  if ((ex.carSeatFeePerUnit ?? 0) > 0) {
    extras.push({
      kind: 'extra',
      key: 'car_seat',
      label: 'Child Safety Seats',
      rateBadge: `$${ex.carSeatFeePerUnit.toFixed(2)}/seat`,
      liveAppliedAmount: resolveLineAmt((id) => id === 'extra-car-seats' || id === 'extra-car-seats-waived'),
    });
  }
  if ((ex.extraPassengerFeePerHead ?? 0) > 0) {
    extras.push({
      kind: 'extra',
      key: 'extra_passenger',
      label: 'Additional Passenger Fee',
      rateBadge: `$${ex.extraPassengerFeePerHead.toFixed(2)}/pax`,
      liveAppliedAmount: resolveLineAmt((id) => id === 'extra-passengers' || id === 'extra-passengers-waived'),
    });
  }
  const oversizedCats =
    ex.oversizedBagsConfig && ex.oversizedBagsConfig.length > 0
      ? ex.oversizedBagsConfig
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;
  const positiveOversized = oversizedCats.filter((c) => c.fee > 0);
  if (positiveOversized.length > 0) {
    const minFee = Math.min(...positiveOversized.map((c) => c.fee));
    extras.push({
      kind: 'extra',
      key: 'oversized_cargo',
      label: 'Oversized Cargo / Equipment',
      rateBadge: `from $${minFee.toFixed(2)}`,
      liveAppliedAmount: resolveLineAmt((id) => id.startsWith('extra-oversized-')),
    });
  }
  const curbRate = ex.curbWaitingRatePerMinute ?? ex.waitingRatePerMinute ?? 0;
  if (curbRate > 0) {
    extras.push({
      kind: 'extra',
      key: 'curb_wait',
      label: 'Curb Waiting Fee',
      rateBadge: `$${curbRate.toFixed(2)}/min`,
      liveAppliedAmount: resolveLineAmt((id) => id === 'extra-curb-wait' || id === 'extra-curb-wait-waived'),
    });
  }
  for (const ce of ex.customExtras || []) {
    if (ce.isActive === false || ce.fee <= 0) continue;
    extras.push({
      kind: 'extra',
      key: `custom:${ce.id}`,
      label: ce.name,
      rateBadge: ce.isPerUnit ? `$${ce.fee.toFixed(2)}/unit` : `$${ce.fee.toFixed(2)}`,
      liveAppliedAmount: resolveLineAmt(
        (id) => id === `extra-custom-${ce.id}` || id === `extra-custom-${ce.id}-waived`
      ),
    });
  }

  return { surcharges, extras, all: [...surcharges, ...extras] };
}
