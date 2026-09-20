/**
 * Pure Functional Prioritized Pricing Pipeline
 * 
 * Composes the individual pricing transformation steps into a deterministic,
 * zero-side-effect pipeline.
 * 
 * Pipeline sequence:
 * 1. Base Fare Calculation
 * 2. Distance & Time Rate Application
 * 3. Vehicle Multiplier Application
 * 4. Surge / Time-of-day Multiplier
 * 5. Discounts & Surcharges Deductions
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
  applyUnifiedTariffEngine,
  applyBaseFare,
  applyDistanceAndTimeRates,
  applyVehicleMultiplier,
  applySurgeMultiplier,
  applyConditionSurcharges,
  applyNamedPricingRules,
  applySurchargesAndDiscounts,
  roundCurrency,
} from './rules';

/**
 * Creates the initial immutable PricingContext from input and config.
 */
export function createInitialContext(
  input: PricingInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): PricingContext {
  return {
    input: Object.freeze({ ...input }),
    config: Object.freeze({ ...config }),
    baseFare: 0,
    distanceFare: 0,
    timeFare: 0,
    vehicleMultiplier: 1.0,
    surgeMultiplier: 1.0,
    surcharges: [],
    discounts: [],
    subtotal: 0,
    totalFare: 0,
    currency: config.currency ?? 'USD',
    auditTrail: [],
  };
}

/**
 * Standard prioritized pipeline steps array.
 * Step 1: Named Pricing Rules (Intelligent routing: Airport flat transfer rule, vehicle triggers, overrule flags)
 * Step 2: Unified Tariff Profiles (Taximeter step rates, Smoke House zip-matrix, Hourly charter)
 * Steps 3-4: Fallback Base Fare and Distance/Time Rates (if no tariff profile active)
 * Steps 5-8: Overlays (Vehicle multiplier, Surge, Universal Extras, Surcharges & Discounts)
 */
export const DEFAULT_PIPELINE_STEPS: readonly PricingPipelineStep[] = [
  applyNamedPricingRules,
  applyUnifiedTariffEngine,
  applyBaseFare,
  applyDistanceAndTimeRates,
  applyVehicleMultiplier,
  applySurgeMultiplier,
  applyConditionSurcharges,
  applySurchargesAndDiscounts,
] as const;


/**
 * Executes a sequence of pure pricing pipeline steps on a given context.
 * Pure reducer with zero mutations and zero side effects.
 */
export function pipePricing(
  initialContext: PricingContext,
  steps: readonly PricingPipelineStep[] = DEFAULT_PIPELINE_STEPS
): PricingContext {
  return steps.reduce<PricingContext>((currentContext, step) => step(currentContext), initialContext);
}

/**
 * Maps a completed PricingContext into the TripPricing data model expected by Firestore.
 */
export function toTripPricing(context: PricingContext): TripPricing {
  const discountAmount = roundCurrency(
    context.discounts.reduce((sum, d) => sum + d.amount, 0)
  );

  const multiStopItem = context.surcharges.find((s) => s.name.toLowerCase().includes('stop'));
  const tollsItem = context.surcharges.find((s) => s.name.toLowerCase().includes('toll'));
  const airportItem = context.surcharges.find((s) => s.name.toLowerCase().includes('airport'));

  return {
    baseFare: context.baseFare,
    distanceMiles: context.input.distanceMiles,
    durationMinutes: context.input.durationMinutes,
    distanceRate: context.config.perMileRate,
    timeRate: context.config.perMinuteRate,
    vehicleMultiplier: context.vehicleMultiplier,
    surgeMultiplier: context.surgeMultiplier,
    discountAmount,
    subtotal: Math.ceil(context.subtotal),
    totalFare: Math.ceil(context.totalFare),
    currency: context.currency,
    intermediateStopsCount: context.input.intermediateStopsCount || 0,
    multiStopSurcharge: multiStopItem ? multiStopItem.amount : 0,
    tollsFee: tollsItem ? tollsItem.amount : 0,
    airportSurcharge: airportItem ? airportItem.amount : 0,
    carSeatFee: context.carSeatFee || 0,
    passengerSurcharge: context.passengerSurcharge || 0,
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
 * Balances round-trip leg fares so that both the outbound and return legs
 * are priced identically using the higher price of the two legs, rounded up
 * to the ceiling dollar.
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
 * 
 * Takes raw trip routing details and returns a deterministic price breakdown
 * along with the complete step-by-step audit trail.
 */
export function calculateTripPricing(
  input: PricingInput,
  configOverride?: Partial<PricingConfig>,
  customSteps?: readonly PricingPipelineStep[]
): PricingCalculationResult {
  const config: PricingConfig = {
    ...DEFAULT_PRICING_CONFIG,
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
 * Pricing Engine class wrapper for object-oriented dependency injection if preferred.
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
