/**
 * Pure Functional Pricing Pipeline Rules & Steps
 * 
 * Each pipeline step is a pure function that accepts a PricingContext
 * and returns a newly transformed PricingContext with zero side effects.
 * 
 * Pipeline Steps:
 * 1. Base Fare Calculation
 * 2. Distance & Time Rate Application
 * 3. Vehicle Multiplier Application
 * 4. Surge / Time-of-day Multiplier Application
 * 5. Surcharges & Discounts Deductions
 */

import type {
  PricingConfig,
  PricingContext,
  PricingPipelineStep,
  SurgeRule,
  DiscountRule,
  SurchargeEntry,
  DiscountEntry,
  CalculationAuditStep,
} from './types';

/**
 * Default production pricing configuration.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  baseFare: 5.00,
  perMileRate: 2.25,
  perMinuteRate: 0.35,
  minimumFare: 10.00,
  vehicleMultipliers: {
    standard: 1.0,
    premium: 1.5,
    xl: 1.75,
    wheelchair: 1.0, // Equitable accessibility
  },
  airportSurcharge: 4.00,
  currency: 'USD',
};

/**
 * Standard Time-of-Day Surge Rules.
 */
export const DEFAULT_SURGE_RULES: readonly SurgeRule[] = [
  {
    name: 'Weekend Night Surge',
    description: 'High late-night weekend demand (Fri/Sat 21:00 - 03:00)',
    multiplier: 1.30,
    matches: (date: Date) => {
      const day = date.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
      const hour = date.getHours();
      const isFridayNight = day === 5 && hour >= 21;
      const isSaturdayLateNight = day === 6 && (hour < 3 || hour >= 21);
      const isSundayEarlyMorning = day === 0 && hour < 3;
      return isFridayNight || isSaturdayLateNight || isSundayEarlyMorning;
    },
  },
  {
    name: 'Weekday Evening Rush',
    description: 'Evening peak transit hours (Mon-Fri 16:30 - 19:00)',
    multiplier: 1.25,
    matches: (date: Date) => {
      const day = date.getDay();
      const hour = date.getHours();
      const minute = date.getMinutes();
      const totalMinutes = hour * 60 + minute;
      const isWeekday = day >= 1 && day <= 5;
      return isWeekday && totalMinutes >= 16 * 60 + 30 && totalMinutes <= 19 * 60;
    },
  },
  {
    name: 'Weekday Morning Commute',
    description: 'Morning commuter rush (Mon-Fri 07:00 - 09:30)',
    multiplier: 1.20,
    matches: (date: Date) => {
      const day = date.getDay();
      const hour = date.getHours();
      const minute = date.getMinutes();
      const totalMinutes = hour * 60 + minute;
      const isWeekday = day >= 1 && day <= 5;
      return isWeekday && totalMinutes >= 7 * 60 && totalMinutes <= 9 * 60 + 30;
    },
  },
  {
    name: 'Late Night Safe Travel',
    description: 'Overnight operating surcharge (23:00 - 05:00)',
    multiplier: 1.15,
    matches: (date: Date) => {
      const hour = date.getHours();
      return hour >= 23 || hour < 5;
    },
  },
] as const;

/**
 * Standard Promotional Discount Rules.
 */
export const DEFAULT_DISCOUNTS: Record<string, DiscountRule> = {
  SAVE10: {
    code: 'SAVE10',
    type: 'percentage',
    value: 0.10,
    description: '10% off your ride',
  },
  CHESTERFIELD: {
    code: 'CHESTERFIELD',
    type: 'percentage',
    value: 0.15,
    description: '15% Chesterfield community resident discount',
  },
  WELCOME5: {
    code: 'WELCOME5',
    type: 'fixed',
    value: 5.00,
    minSpend: 15.00,
    description: '$5.00 off rides over $15.00',
  },
};

/**
 * Pure utility to round numeric monetary values to standard 2 decimal places.
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Pure helper to append an audit entry to the immutable calculation trail.
 */
function appendAudit(
  trail: ReadonlyArray<CalculationAuditStep>,
  stepNumber: number,
  stepName: string,
  description: string,
  appliedDelta: number,
  runningSubtotal: number
): ReadonlyArray<CalculationAuditStep> {
  const newEntry: CalculationAuditStep = {
    stepNumber,
    stepName,
    description,
    appliedDelta: roundCurrency(appliedDelta),
    runningSubtotal: roundCurrency(runningSubtotal),
  };
  return [...trail, newEntry];
}

// ----------------------------------------------------------------------------
// STEP 1: Base Fare Calculation
// ----------------------------------------------------------------------------
export const applyBaseFare: PricingPipelineStep = (context) => {
  const baseFare = roundCurrency(context.config.baseFare);
  const newSubtotal = baseFare;

  return {
    ...context,
    baseFare,
    subtotal: newSubtotal,
    totalFare: newSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      1,
      'Base Fare',
      `Applied platform base fare of $${baseFare.toFixed(2)}`,
      baseFare,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 2: Distance & Time Rate Application
// ----------------------------------------------------------------------------
export const applyDistanceAndTimeRates: PricingPipelineStep = (context) => {
  const { distanceMiles, durationMinutes } = context.input;
  const { perMileRate, perMinuteRate } = context.config;

  const distanceFare = roundCurrency(Math.max(0, distanceMiles) * perMileRate);
  const timeFare = roundCurrency(Math.max(0, durationMinutes) * perMinuteRate);

  const delta = distanceFare + timeFare;
  const newSubtotal = roundCurrency(context.subtotal + delta);

  return {
    ...context,
    distanceFare,
    timeFare,
    subtotal: newSubtotal,
    totalFare: newSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      2,
      'Distance & Time Rates',
      `${distanceMiles.toFixed(2)} mi @ $${perMileRate.toFixed(2)}/mi ($${distanceFare.toFixed(2)}) + ${durationMinutes.toFixed(0)} min @ $${perMinuteRate.toFixed(2)}/min ($${timeFare.toFixed(2)})`,
      delta,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 3: Vehicle Multiplier Application
// ----------------------------------------------------------------------------
export const applyVehicleMultiplier: PricingPipelineStep = (context) => {
  const tier = context.input.vehicleTier;
  const multiplier = context.config.vehicleMultipliers[tier] ?? 1.0;

  // The vehicle multiplier scales the mileage and duration fare
  const variableFare = context.distanceFare + context.timeFare;
  const scaledVariableFare = roundCurrency(variableFare * multiplier);
  const delta = roundCurrency(scaledVariableFare - variableFare);

  const newSubtotal = roundCurrency(context.baseFare + scaledVariableFare);

  return {
    ...context,
    vehicleMultiplier: multiplier,
    subtotal: newSubtotal,
    totalFare: newSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      3,
      'Vehicle Tier Multiplier',
      `Applied ${tier.toUpperCase()} multiplier (${multiplier}x) to mileage & time components`,
      delta,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 4: Surge / Time-of-day Multiplier Application
// ----------------------------------------------------------------------------
export function createSurgeStep(
  rules: readonly SurgeRule[] = DEFAULT_SURGE_RULES
): PricingPipelineStep {
  return (context) => {
    const pickupDate =
      typeof context.input.pickupDateTime === 'string'
        ? new Date(context.input.pickupDateTime)
        : context.input.pickupDateTime;

    // Find the highest applicable surge rule
    let matchedRule: SurgeRule | undefined;
    let highestMultiplier = 1.0;

    for (const rule of rules) {
      if (rule.matches(pickupDate) && rule.multiplier > highestMultiplier) {
        highestMultiplier = rule.multiplier;
        matchedRule = rule;
      }
    }

    if (highestMultiplier <= 1.0 || !matchedRule) {
      return {
        ...context,
        surgeMultiplier: 1.0,
        auditTrail: appendAudit(
          context.auditTrail,
          4,
          'Surge / Time-of-Day',
          'Standard off-peak demand (1.0x)',
          0,
          context.subtotal
        ),
      };
    }

    const unscaledSubtotal = context.subtotal;
    const scaledSubtotal = roundCurrency(unscaledSubtotal * highestMultiplier);
    const delta = roundCurrency(scaledSubtotal - unscaledSubtotal);

    return {
      ...context,
      surgeMultiplier: highestMultiplier,
      surgeDescription: matchedRule.name,
      subtotal: scaledSubtotal,
      totalFare: scaledSubtotal,
      auditTrail: appendAudit(
        context.auditTrail,
        4,
        'Surge / Time-of-Day',
        `${matchedRule.name} (${highestMultiplier}x): ${matchedRule.description}`,
        delta,
        scaledSubtotal
      ),
    };
  };
}

export const applySurgeMultiplier: PricingPipelineStep = createSurgeStep(DEFAULT_SURGE_RULES);

// ----------------------------------------------------------------------------
// STEP 5: Surcharges & Discount Deductions
// ----------------------------------------------------------------------------
export function createSurchargesAndDiscountsStep(
  availableDiscounts: Record<string, DiscountRule> = DEFAULT_DISCOUNTS
): PricingPipelineStep {
  return (context) => {
    const newSurcharges: SurchargeEntry[] = [];
    const newDiscounts: DiscountEntry[] = [];
    let currentSubtotal = context.subtotal;

    // 1. Airport surcharge
    if (context.input.isAirportPickup && context.config.airportSurcharge > 0) {
      const airportFee = roundCurrency(context.config.airportSurcharge);
      newSurcharges.push({
        name: 'Airport Terminal Access Fee',
        amount: airportFee,
        description: 'Mandatory airport commercial terminal fee',
      });
      currentSubtotal = roundCurrency(currentSubtotal + airportFee);
    }

    // 2. Custom tolls / fees
    if (context.input.customTollsOrFees && context.input.customTollsOrFees > 0) {
      const tollFee = roundCurrency(context.input.customTollsOrFees);
      newSurcharges.push({
        name: 'Tolls & Highway Surcharge',
        amount: tollFee,
      });
      currentSubtotal = roundCurrency(currentSubtotal + tollFee);
    }

    // 3. Promotional discounts
    let totalDiscountAmount = 0;
    if (context.input.promoCode) {
      const codeKey = context.input.promoCode.trim().toUpperCase();
      const discountRule = availableDiscounts[codeKey];

      if (discountRule) {
        const canApply =
          !discountRule.minSpend || currentSubtotal >= discountRule.minSpend;

        if (canApply) {
          let discountVal = 0;
          if (discountRule.type === 'percentage') {
            discountVal = roundCurrency(currentSubtotal * discountRule.value);
          } else {
            discountVal = roundCurrency(discountRule.value);
          }

          // Discount cannot exceed current subtotal
          discountVal = Math.min(discountVal, currentSubtotal);
          totalDiscountAmount = discountVal;

          newDiscounts.push({
            name: discountRule.description,
            code: discountRule.code,
            amount: discountVal,
          });
          currentSubtotal = roundCurrency(currentSubtotal - discountVal);
        }
      }
    }

    // 4. Enforce minimum fare floor
    const minFare = context.config.minimumFare;
    let minFareAdjustment = 0;
    if (currentSubtotal < minFare) {
      minFareAdjustment = roundCurrency(minFare - currentSubtotal);
      currentSubtotal = minFare;
      newSurcharges.push({
        name: 'Minimum Fare Adjustment',
        amount: minFareAdjustment,
        description: `Enforced minimum fare floor ($${minFare.toFixed(2)})`,
      });
    }

    const finalFare = roundCurrency(currentSubtotal);
    const delta = roundCurrency(
      newSurcharges.reduce((acc, s) => acc + s.amount, 0) - totalDiscountAmount
    );

    return {
      ...context,
      surcharges: [...context.surcharges, ...newSurcharges],
      discounts: [...context.discounts, ...newDiscounts],
      subtotal: context.subtotal,
      totalFare: finalFare,
      auditTrail: appendAudit(
        context.auditTrail,
        5,
        'Surcharges & Discounts',
        `Applied ${newSurcharges.length} surcharge(s) (+$${newSurcharges.reduce((sum, s) => sum + s.amount, 0).toFixed(2)}) and ${newDiscounts.length} discount(s) (-$${totalDiscountAmount.toFixed(2)}) with minimum fare floor ($${minFare.toFixed(2)})`,
        delta,
        finalFare
      ),
    };
  };
}

export const applySurchargesAndDiscounts: PricingPipelineStep =
  createSurchargesAndDiscountsStep(DEFAULT_DISCOUNTS);
