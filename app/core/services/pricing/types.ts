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
  /** Fixed surcharge applied to airport pickups */
  airportSurcharge: number;
  /** Standard currency code (e.g. USD) */
  currency: string;
  /** Optional manual surge multiplier configured by admin */
  manualSurgeMultiplier?: number;
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
}
