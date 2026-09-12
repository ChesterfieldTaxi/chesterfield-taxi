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
  multiStopFee: 5.00,
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
  const tier = context.input.vehicleTier;
  const configuredBaseFare =
    context.config.vehicleBaseFares?.[tier] ?? context.config.baseFare;
  const baseFare = roundCurrency(configuredBaseFare);
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
      `Applied platform base fare of $${baseFare.toFixed(2)}${context.config.vehicleBaseFares?.[tier] ? ` (${tier.toUpperCase()} tier)` : ''}`,
      baseFare,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 2: Distance & Time Rate Application
// ----------------------------------------------------------------------------
export const applyDistanceAndTimeRates: PricingPipelineStep = (context) => {
  const { distanceMiles, durationMinutes, vehicleTier } = context.input;
  const { perMileRate, perMinuteRate, vehicleMileRates, mileageTiers } = context.config;

  const effectivePerMileRate = vehicleMileRates?.[vehicleTier] ?? perMileRate;

  let distanceFare = 0;
  if (mileageTiers && mileageTiers.length > 0) {
    let remainingMiles = Math.max(0, distanceMiles);
    let prevMax = 0;
    for (const tier of mileageTiers) {
      const tierMax = tier.maxMiles ?? Infinity;
      const bracketMiles = Math.min(remainingMiles, tierMax - prevMax);
      if (bracketMiles > 0) {
        distanceFare += bracketMiles * tier.rate;
        remainingMiles -= bracketMiles;
        prevMax = tierMax;
      }
      if (remainingMiles <= 0) break;
    }
    distanceFare = roundCurrency(distanceFare);
  } else {
    distanceFare = roundCurrency(Math.max(0, distanceMiles) * effectivePerMileRate);
  }

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
      `${distanceMiles.toFixed(2)} mi @ $${effectivePerMileRate.toFixed(2)}/mi ($${distanceFare.toFixed(2)}) + ${durationMinutes.toFixed(0)} min @ $${perMinuteRate.toFixed(2)}/min ($${timeFare.toFixed(2)})`,
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
    // Check if dispatcher explicitly bypassed surge
    if (context.input.bypassSurge) {
      return {
        ...context,
        surgeMultiplier: 1.0,
        surgeDescription: 'Surge waived by dispatcher override',
        auditTrail: appendAudit(
          context.auditTrail,
          4,
          'Surge / Time-of-Day',
          'Surge rate waived by dispatcher override (1.0x enforced)',
          0,
          context.subtotal
        ),
      };
    }

    const pickupDate =
      typeof context.input.pickupDateTime === 'string'
        ? new Date(context.input.pickupDateTime)
        : context.input.pickupDateTime;

    // Find the highest applicable surge rule
    let matchedRule: SurgeRule | undefined;
    let highestMultiplier = context.config.manualSurgeMultiplier ?? 1.0;

    if (highestMultiplier > 1.0) {
      matchedRule = {
        name: 'Active Surge Pricing',
        description: `Admin manual surge rate applied (${highestMultiplier.toFixed(2)}x)`,
        multiplier: highestMultiplier,
        matches: () => true,
      };
    }

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

    // 1. Multi-stop waypoint surcharge
    const stopsCount = Math.max(0, context.input.intermediateStopsCount ?? 0);
    if (stopsCount > 0) {
      const perStopFee = context.config.multiStopFee ?? 5.00;
      if (context.input.waiveMultiStopFees) {
        newSurcharges.push({
          name: `Multi-Stop Surcharge (${stopsCount} stop${stopsCount > 1 ? 's' : ''} - Waived)`,
          amount: 0,
          description: `Dispatcher waived $${(stopsCount * perStopFee).toFixed(2)} fee for ${stopsCount} intermediate stop(s)`,
        });
      } else {
        const totalStopFee = roundCurrency(stopsCount * perStopFee);
        newSurcharges.push({
          name: `Multi-Stop Surcharge (${stopsCount} stop${stopsCount > 1 ? 's' : ''})`,
          amount: totalStopFee,
          description: `$${perStopFee.toFixed(2)} per intermediate waypoint`,
        });
        currentSubtotal = roundCurrency(currentSubtotal + totalStopFee);
      }
    }

    // 2. Airport surcharge
    if (context.input.isAirportPickup && context.config.airportSurcharge > 0) {
      const airportFee = roundCurrency(context.config.airportSurcharge);
      if (context.input.waiveAirportFee) {
        newSurcharges.push({
          name: 'Airport Terminal Access Fee (Waived)',
          amount: 0,
          description: 'Dispatcher waived airport commercial terminal fee',
        });
      } else {
        newSurcharges.push({
          name: 'Airport Terminal Access Fee',
          amount: airportFee,
          description: 'Mandatory airport commercial terminal fee',
        });
        currentSubtotal = roundCurrency(currentSubtotal + airportFee);
      }
    }

    // 3. Tolls & highway surcharge
    const tollAmount =
      context.input.tolls ??
      context.input.customTollsOrFees ??
      context.config.defaultTolls ??
      0;
    if (tollAmount > 0) {
      const tollFee = roundCurrency(tollAmount);
      newSurcharges.push({
        name: 'Tolls & Highway Surcharge',
        amount: tollFee,
        description: 'Bridge, express lane, and highway toll fees',
      });
      currentSubtotal = roundCurrency(currentSubtotal + tollFee);
    }

    // 4. Dispatcher Courtesy Discount
    let totalDiscountAmount = 0;
    if (context.input.manualDiscount && context.input.manualDiscount > 0) {
      const discountVal = Math.min(roundCurrency(context.input.manualDiscount), currentSubtotal);
      totalDiscountAmount = roundCurrency(totalDiscountAmount + discountVal);
      newDiscounts.push({
        name: 'Dispatcher Courtesy Discount',
        code: 'DISPATCHER_CREDIT',
        amount: discountVal,
      });
      currentSubtotal = roundCurrency(currentSubtotal - discountVal);
    }

    // 5. Promotional discounts
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
          totalDiscountAmount = roundCurrency(totalDiscountAmount + discountVal);

          newDiscounts.push({
            name: discountRule.description,
            code: discountRule.code,
            amount: discountVal,
          });
          currentSubtotal = roundCurrency(currentSubtotal - discountVal);
        }
      }
    }

    // 6. Manual Fare Override check (Dispatcher Override)
    if (
      typeof context.input.manualFareOverride === 'number' &&
      context.input.manualFareOverride >= 0
    ) {
      const overrideFare = roundCurrency(context.input.manualFareOverride);
      return {
        ...context,
        surcharges: [...context.surcharges, ...newSurcharges],
        discounts: [...context.discounts, ...newDiscounts],
        subtotal: overrideFare,
        totalFare: overrideFare,
        auditTrail: appendAudit(
          context.auditTrail,
          5,
          'Dispatcher Fare Override',
          `Manual total fare override applied ($${overrideFare.toFixed(2)})`,
          overrideFare - context.subtotal,
          overrideFare
        ),
      };
    }

    // 7. Enforce minimum fare floor
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
