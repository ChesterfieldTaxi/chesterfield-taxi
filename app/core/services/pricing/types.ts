/**
 * Pricing Engine Types & Configuration Interfaces
 * 
 * Defines the context and configuration models for the pure functional
 * prioritized pricing pipeline.
 */

import type { VehicleTier, TripPricing } from '../../types';

export interface PricingConfig {
  /** Base fare applied to every trip */
  baseFare: number;
  /** Rate charged per mile driven */
  perMileRate: number;
  /** Rate charged per minute of travel */
  perMinuteRate: number;
  /** Absolute minimum fare floor */
  minimumFare: number;
  /** Multipliers mapped to each vehicle category */
  vehicleMultipliers: Record<string, number>;
  /** Optional vehicle-specific base fares override */
  vehicleBaseFares?: Record<string, number>;
  /** Optional vehicle-specific per-mile rates override */
  vehicleMileRates?: Record<string, number>;
  /** Optional distance tier rates */
  mileageTiers?: Array<{ maxMiles?: number; rate: number }>;
  /** Surcharge per intermediate waypoint stop */
  multiStopFee: number;
  /** Optional default toll amount */
  defaultTolls?: number;
  /** Fixed surcharge applied to airport pickups */
  airportSurcharge: number;
  /** Standard currency code (e.g. USD) */
  currency: string;
  /** Optional manual surge multiplier configured by admin */
  manualSurgeMultiplier?: number;
  /** Initial distance covered by base flag drop fee */
  flagDropIncludedMiles?: number;
  /** Whether step increment bracket pricing is active */
  useStepIncrements?: boolean;
  /** Decaying distance brackets with step increments */
  stepIncrementTiers?: import('../../types/config').StepIncrementTier[];
  /** Delay and wait-time rate config */
  delayRate?: import('../../types/config').DelayRateConfig;
  /** Condition-based surcharges for car seats, extra passengers, vehicle tiers, zones */
  conditionSurcharges?: import('../../types/config').ConditionSurchargeConfig;
  /** Named pricing rules to evaluate */
  namedPricingRules?: import('../../types/config').NamedPricingRule[];
  /** Phase 22: TaxiCaller-Style Unified Tariff Profiles */
  tariffs?: import('../../types/tariff').TariffProfile[];
  /** Optional active/selected tariff profile override */
  activeTariffId?: string;
}


export interface SurgeRule {
  name: string;
  description: string;
  multiplier: number;
  /** Evaluates if current trip date/time matches this surge rule */
  matches: (pickupDateTime: Date) => boolean;
}

export interface DiscountRule {
  code: string;
  type: 'percentage' | 'fixed';
  value: number; // e.g., 0.15 for 15% or 5.00 for $5.00
  minSpend?: number;
  description: string;
}

export interface PricingInput {
  /** Distance in statute miles calculated server-side */
  distanceMiles: number;
  /** Estimated duration in minutes calculated server-side */
  durationMinutes: number;
  /** Selected vehicle tier */
  vehicleTier: VehicleTier;
  /** Pickup datetime ISO string or Date */
  pickupDateTime: string | Date;
  /** Whether the pickup is at an airport terminal */
  isAirportPickup?: boolean;
  /** Optional promo or voucher code */
  promoCode?: string;
  /** Optional custom toll or fee additions */
  customTollsOrFees?: number;
  /** Toll fees amount */
  tolls?: number;
  /** Number of intermediate waypoint stops */
  intermediateStopsCount?: number;
  /** Dispatcher override: waive all intermediate stop fees */
  waiveMultiStopFees?: boolean;
  /** Dispatcher override: waive airport access fee */
  waiveAirportFee?: boolean;
  /** Dispatcher override: bypass surge multiplier (force 1.0x) */
  bypassSurge?: boolean;
  /** Dispatcher override: manual courtesy dollar discount */
  manualDiscount?: number;
  /** Dispatcher override: complete manual fare override */
  manualFareOverride?: number;
  /** Child safety car seat counts */
  carSeatsBreakdown?: {
    rearFacing?: number;
    frontFacing?: number;
    booster?: number;
    total?: number;
  };
  /** Total number of passengers */
  passengers?: number;
  /** Account category: retail, corporate, or vip */
  accountType?: 'retail' | 'corporate' | 'vip';
  /** Zone IDs matched by pickup/dropoff coordinates */
  zoneIds?: string[];
  /** Specific Origin Zone ID (for corridor matching) */
  originZoneId?: string;
  /** Specific Destination Zone ID (for corridor matching) */
  destinationZoneId?: string;
  /** Zone Group IDs matched by pickup/dropoff coordinates */
  zoneGroupIds?: string[];
  /** Location Collection IDs matched by proximity */
  locationCollectionIds?: string[];
  /** Specific account tags for corporate partner overrides */
  accountTags?: string[];
  /** Equipment counts (car seats, luggage) */
  equipment?: {
    carSeats?: number;
    luggageCount?: number;
  };
  /** Wait time or delay in minutes */
  delayMinutes?: number;
  /** Dispatcher or driver selected Named Pricing Rule ID */
  selectedRuleId?: string;
}

export interface SurchargeEntry {
  name: string;
  amount: number;
  description?: string;
}

export interface DiscountEntry {
  name: string;
  code: string;
  amount: number;
}

export interface CalculationAuditStep {
  stepNumber: number;
  stepName: string;
  description: string;
  appliedDelta: number;
  runningSubtotal: number;
}

/**
 * Immutable state context threaded through every step of the pricing pipeline.
 */
export interface PricingContext {
  // Input parameters (read-only)
  readonly input: Readonly<PricingInput>;
  readonly config: Readonly<PricingConfig>;

  // Fare components
  readonly baseFare: number;
  readonly distanceFare: number;
  readonly timeFare: number;
  readonly vehicleMultiplier: number;
  readonly surgeMultiplier: number;
  readonly surgeDescription?: string;

  // Additional fees & deductions
  readonly surcharges: ReadonlyArray<SurchargeEntry>;
  readonly discounts: ReadonlyArray<DiscountEntry>;

  // Running totals
  readonly subtotal: number;
  readonly totalFare: number;
  readonly currency: string;

  // Phase 19: Extended condition totals & audit
  readonly carSeatFee?: number;
  readonly passengerSurcharge?: number;
  readonly delayFee?: number;
  readonly appliedRuleNames?: ReadonlyArray<string>;

  // Phase 22: Unified Tariff Profile tracking
  readonly tariffProfileId?: string;
  readonly tariffProfileName?: string;
  readonly matchedCorridorId?: string;
  readonly matchedCorridorName?: string;

  // Step-by-step calculation trace for transparency and auditing
  readonly auditTrail: ReadonlyArray<CalculationAuditStep>;
}

/**
 * A pure step function that transforms a pricing context into a new pricing context.
 */
export type PricingPipelineStep = (context: PricingContext) => PricingContext;

export interface PricingCalculationResult {
  pricing: TripPricing;
  context: PricingContext;
  tariffProfileId?: string;
  matchedCorridorId?: string;
}
