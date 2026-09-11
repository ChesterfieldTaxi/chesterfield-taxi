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
  applyBaseFare,
  applyDistanceAndTimeRates,
  applyVehicleMultiplier,
  applySurgeMultiplier,
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
 */
export const DEFAULT_PIPELINE_STEPS: readonly PricingPipelineStep[] = [
  applyBaseFare,
  applyDistanceAndTimeRates,
  applyVehicleMultiplier,
  applySurgeMultiplier,
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

  return {
    baseFare: context.baseFare,
    distanceMiles: context.input.distanceMiles,
    durationMinutes: context.input.durationMinutes,
    distanceRate: context.config.perMileRate,
    timeRate: context.config.perMinuteRate,
    vehicleMultiplier: context.vehicleMultiplier,
    surgeMultiplier: context.surgeMultiplier,
    discountAmount,
    subtotal: context.subtotal,
    totalFare: context.totalFare,
    currency: context.currency,
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
