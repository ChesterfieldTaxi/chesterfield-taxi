/**
 * Pure Functional Prioritized Pricing Pipeline
 *
 * Composes the deterministic pricing steps into a zero-side-effect pipeline:
 * 1. Routing & Policy Rules (selects target tariff, collects fee waivers & deferred modifiers)
 * 2. Unified Tariff Engine (Taximeter / Corridor / Zip Matrix / Hourly -> Base Fare)
 * 3. Legacy Fallback Base/Distance/Time (only if no Tariff Profiles exist)
 * 4. Vehicle Pricing (Option A: governed via Tariffs, Surcharges & Rules)
 * 5. Rule Modifiers (post-tariff flat overrides, multipliers, adders, layered zone fees)
 * 6. Opt-In Admin Peak Surge (zero hidden hardcoded surge)
 * 7. Universal Customer Extras (Car Seats, Extra Pax, Stops, Oversized Cargo, Curb Wait, Custom Extras)
 * 8. Operational & Conditional Surcharges, Discounts, Manual Override & Ceiling Rounding
 */

import type { TripPricing } from '../../types';
import type {
  PricingConfig,
  PricingInput,
  PricingContext,
  PricingPipelineStep,
  PricingCalculationResult,
} from './types';
import {
  DEFAULT_PRICING_CONFIG,
  resolveRoutingRules,
  applyUnifiedTariffEngine,
  applyBaseFare,
  applyDistanceAndTimeRates,
  applyVehicleMultiplier,
  applyRuleModifiers,
  applySurgeMultiplier,
  applyConditionSurcharges,
  applySurchargesAndDiscounts,
  roundCurrency,
} from './rules';
import { getSurchargesConfig } from './surcharges.service';
import { getUniversalExtrasConfig } from './extras.service';
import { getTariffService } from './tariff.service';

/**
 * Quantizes any positive route distance up to the next 0.5 statute mile increment.
 */
function quantizeHalfMile(miles: number): number {
  if (!miles || miles <= 0 || isNaN(miles)) return 0;
  return Math.ceil((miles - 1e-9) * 2) / 2;
}

/**
 * Creates the initial immutable PricingContext from input and config.
 */
export function createInitialContext(
  input: PricingInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): PricingContext {
  const quantizedDistanceMiles = quantizeHalfMile(input.distanceMiles);
  return {
    input: Object.freeze({ ...input, distanceMiles: quantizedDistanceMiles }),
    config: Object.freeze({ ...config }),
    baseFare: 0,
    distanceFare: 0,
    timeFare: 0,
    vehicleMultiplier: 1.0,
    surgeMultiplier: 1.0,
    surcharges: [],
    discounts: [],
    lineItems: [],
    subtotal: 0,
    totalFare: 0,
    currency: config.currency ?? 'USD',
    auditTrail: [],
  };
}

/**
 * Standard prioritized pipeline steps array.
 */
export const DEFAULT_PIPELINE_STEPS: readonly PricingPipelineStep[] = [
  resolveRoutingRules,
  applyUnifiedTariffEngine,
  applyBaseFare,
  applyDistanceAndTimeRates,
  applyVehicleMultiplier,
  applyRuleModifiers,
  applySurgeMultiplier,
  applyConditionSurcharges,
  applySurchargesAndDiscounts,
] as const;

/**
 * Executes a sequence of pure pricing pipeline steps on a given context.
 */
export function pipePricing(
  initialContext: PricingContext,
  steps: readonly PricingPipelineStep[] = DEFAULT_PIPELINE_STEPS
): PricingContext {
  return steps.reduce<PricingContext>((currentContext, step) => step(currentContext), initialContext);
}

/**
 * Maps a completed PricingContext into the TripPricing data model expected by Firestore & UI.
 */
export function toTripPricing(context: PricingContext): TripPricing {
  const discountAmount = roundCurrency(
    context.discounts.reduce((sum, d) => sum + d.amount, 0)
  );

  const multiStopItem = context.surcharges.find((s) => s.name.toLowerCase().includes('stop'));
  const tollsItem = context.surcharges.find((s) => s.name.toLowerCase().includes('toll'));
  const airportItem = context.surcharges.find((s) => s.name.toLowerCase().includes('airport'));

  const tariffBase = roundCurrency(context.tariffBaseSubtotal ?? context.baseFare);

  return {
    baseFare: tariffBase,
    tariffBaseSubtotal: tariffBase,
    distanceMiles: context.input.distanceMiles,
    durationMinutes: context.input.durationMinutes,
    distanceRate: context.effectiveDistanceRate ?? context.config.perMileRate,
    timeRate: context.effectiveTimeRate ?? context.config.perMinuteRate,
    vehicleMultiplier: context.vehicleMultiplier,
    surgeMultiplier: context.surgeMultiplier,
    discountAmount,
    subtotal: tariffBase,
    totalFare: Math.ceil(context.totalFare),
    currency: context.currency,
    breakdown: [...context.lineItems],
    intermediateStopsCount: context.input.intermediateStopsCount || 0,
    multiStopSurcharge: multiStopItem ? multiStopItem.amount : 0,
    tollsFee: tollsItem ? tollsItem.amount : 0,
    airportSurcharge: airportItem ? airportItem.amount : 0,
    carSeatFee: context.carSeatFee || 0,
    passengerSurcharge: context.passengerSurcharge || 0,
    oversizedLuggageFee: context.oversizedLuggageFee || 0,
    customExtrasFee: context.customExtrasFee || 0,
    delayFee: context.delayFee || 0,
    appliedRuleNames: context.appliedRuleNames ? [...context.appliedRuleNames] : undefined,
    tariffProfileId: context.tariffProfileId,
    tariffProfileName: context.tariffProfileName,
    matchedCorridorId: context.matchedCorridorId,
    matchedCorridorName: context.matchedCorridorName,
    itemizedSurcharges: context.surcharges.map((s) => ({
      name: s.name,
      amount: s.amount,
      description: s.description,
    })),
  };
}

/**
 * Balances round-trip leg fares so that both outbound and return legs are priced identically
 * using the higher leg price, rounded up to the ceiling dollar.
 */
export function balanceRoundTripLegFares(
  outboundFare: number,
  returnFare: number
): {
  balancedLegFare: number;
  totalRoundTripFare: number;
} {
  const ceilOutbound = Math.ceil(outboundFare);
  const ceilReturn = Math.ceil(returnFare);
  const balancedLegFare = Math.max(ceilOutbound, ceilReturn);
  return {
    balancedLegFare,
    totalRoundTripFare: balancedLegFare * 2,
  };
}

/**
 * Pure Functional Pricing Engine entrypoint.
 */
export function calculateTripPricing(
  input: PricingInput,
  configOverride?: Partial<PricingConfig>,
  customSteps?: readonly PricingPipelineStep[]
): PricingCalculationResult {
  const config: PricingConfig = {
    ...DEFAULT_PRICING_CONFIG,
    tariffs: configOverride?.tariffs ?? getTariffService().getAllTariffProfiles(),
    universalExtras: configOverride?.universalExtras ?? getUniversalExtrasConfig(),
    surchargesCatalog: configOverride?.surchargesCatalog ?? getSurchargesConfig(),
    ...configOverride,
    vehicleMultipliers: {
      ...DEFAULT_PRICING_CONFIG.vehicleMultipliers,
      ...(configOverride?.vehicleMultipliers ?? {}),
    },
  };

  const initialContext = createInitialContext(input, config);
  const steps = customSteps ?? DEFAULT_PIPELINE_STEPS;
  const finalContext = pipePricing(initialContext, steps);

  return {
    pricing: toTripPricing(finalContext),
    context: finalContext,
    tariffProfileId: finalContext.tariffProfileId,
    matchedCorridorId: finalContext.matchedCorridorId,
  };
}

/**
 * Pricing Engine class wrapper for object-oriented dependency injection.
 */
export class PurePricingEngine {
  constructor(
    private readonly config: PricingConfig = DEFAULT_PRICING_CONFIG,
    private readonly steps: readonly PricingPipelineStep[] = DEFAULT_PIPELINE_STEPS
  ) {}

  public calculate(input: PricingInput): PricingCalculationResult {
    return calculateTripPricing(input, this.config, this.steps);
  }
}
