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
import { evaluateApplicablePricingRules, DEFAULT_NAMED_PRICING_RULES } from './pricing-rules.service';
import {
  DEFAULT_TARIFF_PROFILES,
  matchTariffProfile,
  matchTariffCorridor,
  evaluateTaximeterFare,
} from './tariff.service';

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
  // Phase 19 Condition-Based Pricing Matrix additions
  flagDropIncludedMiles: 1.5,
  useStepIncrements: false,
  stepIncrementTiers: [
    { id: 'tier-1', name: 'Initial Distance (0-5 mi)', startMiles: 0, endMiles: 5, stepMiles: 0.1, ratePerStep: 0.35 },
    { id: 'tier-2', name: 'Intermediate (5-15 mi)', startMiles: 5, endMiles: 15, stepMiles: 0.1, ratePerStep: 0.25 },
    { id: 'tier-3', name: 'Long Range (15-30 mi)', startMiles: 15, endMiles: 30, stepMiles: 0.1, ratePerStep: 0.20 },
    { id: 'tier-4', name: 'Extended Regional (30+ mi)', startMiles: 30, endMiles: 999, stepMiles: 0.1, ratePerStep: 0.15 },
  ],
  delayRate: {
    stepSeconds: 90,
    ratePerStep: 0.60,
    gracePeriodMinutes: 5,
  },
  conditionSurcharges: {
    carSeatFeePerUnit: 5.00,
    passengerBaseAllowance: 2,
    extraPassengerFeePerHead: 3.00,
    vehicleTierSurcharges: {
      standard: { flat: 0, percent: 0 },
      premium: { flat: 15.00, percent: 0 },
      xl: { flat: 20.00, percent: 0 },
      wheelchair: { flat: 0, percent: 0 },
    },
    zoneSurcharges: {},
  },
  namedPricingRules: DEFAULT_NAMED_PRICING_RULES,
  tariffs: DEFAULT_TARIFF_PROFILES,
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
// STEP 0: TaxiCaller-Style Unified Tariff Profile Evaluation
// ----------------------------------------------------------------------------
export const applyUnifiedTariffEngine: PricingPipelineStep = (context) => {
  const tariffs = context.config.tariffs;
  if (!tariffs || tariffs.length === 0) {
    return context;
  }

  // 1. Match highest priority active TariffProfile (honoring activeTariffId or vehicle/schedule)
  const candidateTariffs = context.config.activeTariffId
    ? tariffs.filter((t) => t.id === context.config.activeTariffId)
    : tariffs;
  const matchedProfile = matchTariffProfile(context.input, candidateTariffs.length > 0 ? candidateTariffs : tariffs);
  if (!matchedProfile) {
    return context;
  }

  // 2. Check if trip matches an explicit From/To Flat Corridor inside that profile
  const matchedCorridor = matchTariffCorridor(context.input, matchedProfile);
  if (matchedCorridor) {
    const flatFare = roundCurrency(matchedCorridor.flatPrice);
    let currentSubtotal = flatFare;
    const newSurcharges: SurchargeEntry[] = [...context.surcharges];

    // Evaluate child safety car seats
    let carSeatFee = 0;
    const carSeatRate = matchedProfile.extras?.carSeatFeePerUnit ?? context.config.conditionSurcharges?.carSeatFeePerUnit ?? 0;
    if (carSeatRate > 0) {
      const breakdown = context.input.carSeatsBreakdown;
      const totalCarSeats = breakdown
        ? (breakdown.total ?? ((breakdown.rearFacing ?? 0) + (breakdown.frontFacing ?? 0) + (breakdown.booster ?? 0)))
        : (context.input.equipment?.carSeats ?? 0);
      if (totalCarSeats > 0) {
        carSeatFee = roundCurrency(totalCarSeats * carSeatRate);
        newSurcharges.push({
          name: `Child Safety Seats (${totalCarSeats})`,
          amount: carSeatFee,
          description: `$${carSeatRate.toFixed(2)} x ${totalCarSeats} seat(s)`,
        });
        currentSubtotal = roundCurrency(currentSubtotal + carSeatFee);
      }
    }

    // Evaluate custom surcharges from profile
    if (matchedProfile.extras?.customSurcharges) {
      for (const adder of matchedProfile.extras.customSurcharges) {
        const adderFee = adder.type === 'percent'
          ? roundCurrency(flatFare * (adder.amount / 100))
          : roundCurrency(adder.amount);
        newSurcharges.push({
          name: adder.name,
          amount: adderFee,
          description: `Tariff surcharge: ${adder.name}`,
        });
        currentSubtotal = roundCurrency(currentSubtotal + adderFee);
      }
    }

    const auditTrail = appendAudit(
      context.auditTrail,
      1,
      `Tariff Profile: ${matchedProfile.name}`,
      `Flat Corridor: ${matchedCorridor.name} ($${flatFare.toFixed(2)})${matchedCorridor.allowReturn ? ' [Bidirectional]' : ''}`,
      flatFare,
      currentSubtotal
    );

    return {
      ...context,
      tariffProfileId: matchedProfile.id,
      tariffProfileName: matchedProfile.name,
      matchedCorridorId: matchedCorridor.id,
      matchedCorridorName: matchedCorridor.name,
      baseFare: 0,
      distanceFare: 0,
      timeFare: 0,
      carSeatFee,
      surcharges: newSurcharges,
      subtotal: currentSubtotal,
      totalFare: currentSubtotal,
      auditTrail,
    };
  }

  // 3. Taximeter Step Bracket Calculation
  const totalDuration = context.input.durationMinutes + (context.input.delayMinutes ?? 0);
  const meterResult = evaluateTaximeterFare(
    matchedProfile.taximeter,
    context.input.distanceMiles,
    totalDuration
  );

  let currentSubtotal = meterResult.subtotal;
  const newSurcharges: SurchargeEntry[] = [...context.surcharges];

  // Evaluate extras: car seats
  let carSeatFee = 0;
  const carSeatRate = matchedProfile.extras?.carSeatFeePerUnit ?? context.config.conditionSurcharges?.carSeatFeePerUnit ?? 0;
  if (carSeatRate > 0) {
    const breakdown = context.input.carSeatsBreakdown;
    const totalCarSeats = breakdown
      ? (breakdown.total ?? ((breakdown.rearFacing ?? 0) + (breakdown.frontFacing ?? 0) + (breakdown.booster ?? 0)))
      : (context.input.equipment?.carSeats ?? 0);
    if (totalCarSeats > 0) {
      carSeatFee = roundCurrency(totalCarSeats * carSeatRate);
      newSurcharges.push({
        name: `Child Safety Seats (${totalCarSeats})`,
        amount: carSeatFee,
        description: `$${carSeatRate.toFixed(2)} x ${totalCarSeats} seat(s)`,
      });
      currentSubtotal = roundCurrency(currentSubtotal + carSeatFee);
    }
  }

  // Evaluate extras: extra passengers over base allowance
  let passengerSurcharge = 0;
  const allowance = matchedProfile.extras?.passengerBaseAllowance ?? context.config.conditionSurcharges?.passengerBaseAllowance;
  const perHeadFee = matchedProfile.extras?.extraPassengerFeePerHead ?? context.config.conditionSurcharges?.extraPassengerFeePerHead;
  if (allowance !== undefined && perHeadFee && perHeadFee > 0) {
    const paxCount = typeof context.input.passengers === 'number' ? context.input.passengers : 1;
    if (paxCount > allowance) {
      const extraPax = paxCount - allowance;
      passengerSurcharge = roundCurrency(extraPax * perHeadFee);
      newSurcharges.push({
        name: `Additional Passengers (${extraPax})`,
        amount: passengerSurcharge,
        description: `$${perHeadFee.toFixed(2)}/head over ${allowance} base allowance`,
      });
      currentSubtotal = roundCurrency(currentSubtotal + passengerSurcharge);
    }
  }

  // Evaluate custom surcharges from profile
  if (matchedProfile.extras?.customSurcharges) {
    for (const adder of matchedProfile.extras.customSurcharges) {
      const adderFee = adder.type === 'percent'
        ? roundCurrency(meterResult.subtotal * (adder.amount / 100))
        : roundCurrency(adder.amount);
      newSurcharges.push({
        name: adder.name,
        amount: adderFee,
        description: `Tariff surcharge: ${adder.name}`,
      });
      currentSubtotal = roundCurrency(currentSubtotal + adderFee);
    }
  }

  const auditTrail = appendAudit(
    context.auditTrail,
    1,
    `Tariff Profile: ${matchedProfile.name}`,
    `Taximeter: ${meterResult.auditDetails.join(' | ')}`,
    meterResult.subtotal,
    currentSubtotal
  );

  return {
    ...context,
    tariffProfileId: matchedProfile.id,
    tariffProfileName: matchedProfile.name,
    baseFare: meterResult.baseFare,
    distanceFare: meterResult.distanceFare,
    timeFare: meterResult.delayFare,
    delayFee: meterResult.delayFare,
    carSeatFee,
    passengerSurcharge,
    surcharges: newSurcharges,
    subtotal: currentSubtotal,
    totalFare: currentSubtotal,
    auditTrail,
  };
};

// ----------------------------------------------------------------------------
// STEP 1: Base Fare Calculation (with Flag Drop Distance Allowance)
// ----------------------------------------------------------------------------
export const applyBaseFare: PricingPipelineStep = (context) => {
  if (context.tariffProfileId) {
    return context;
  }
  const tier = context.input.vehicleTier;
  const configuredBaseFare =
    context.config.vehicleBaseFares?.[tier] ?? context.config.baseFare;
  const baseFare = roundCurrency(configuredBaseFare);
  const flagDropMiles = Math.max(0, context.config.flagDropIncludedMiles ?? 0);
  const newSubtotal = baseFare;

  const desc = flagDropMiles > 0
    ? `Applied platform flag drop base fare of $${baseFare.toFixed(2)} (covers first ${flagDropMiles} mi)${context.config.vehicleBaseFares?.[tier] ? ` (${tier.toUpperCase()} tier)` : ''}`
    : `Applied platform base fare of $${baseFare.toFixed(2)}${context.config.vehicleBaseFares?.[tier] ? ` (${tier.toUpperCase()} tier)` : ''}`;

  return {
    ...context,
    baseFare,
    subtotal: newSubtotal,
    totalFare: newSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      1,
      'Base Fare',
      desc,
      baseFare,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 2: Distance & Time Rate Application (Decaying Step Increments & Delays)
// ----------------------------------------------------------------------------
export const applyDistanceAndTimeRates: PricingPipelineStep = (context) => {
  if (context.tariffProfileId) {
    return context;
  }
  const { distanceMiles, durationMinutes, vehicleTier, delayMinutes } = context.input;
  const {
    perMileRate,
    perMinuteRate,
    vehicleMileRates,
    mileageTiers,
    flagDropIncludedMiles,
    useStepIncrements,
    stepIncrementTiers,
    delayRate,
  } = context.config;

  const flagDropMiles = Math.max(0, flagDropIncludedMiles ?? 0);
  const billableDistance = Math.max(0, distanceMiles - flagDropMiles);
  const effectivePerMileRate = vehicleMileRates?.[vehicleTier] ?? perMileRate;

  let distanceFare = 0;
  let distanceAuditDesc = '';

  if (useStepIncrements && stepIncrementTiers && stepIncrementTiers.length > 0) {
    // Decaying Bracket Tiers with step increments (e.g. 0.1 mi per step)
    let remainingMiles = billableDistance;
    const bracketSummaries: string[] = [];
    const sortedTiers = [...stepIncrementTiers].sort((a, b) => a.startMiles - b.startMiles);

    for (const tier of sortedTiers) {
      if (remainingMiles <= 0) break;
      const tierCapacity = (tier.isOpenEnded || tier.endMiles === Infinity)
        ? Infinity
        : Math.max(0, tier.endMiles - tier.startMiles);
      const milesInTier = Math.min(remainingMiles, tierCapacity);

      if (milesInTier > 0) {
        const stepSize = Math.max(0.01, tier.stepMiles || 0.1);
        const steps = Math.ceil(roundCurrency(milesInTier / stepSize));
        const tierCost = roundCurrency(steps * tier.ratePerStep);
        distanceFare += tierCost;
        remainingMiles -= milesInTier;
        bracketSummaries.push(
          `${tier.name}: ${milesInTier.toFixed(1)} mi (${steps}x ${stepSize}mi @ $${tier.ratePerStep.toFixed(2)}) = $${tierCost.toFixed(2)}`
        );
      }
    }
    distanceFare = roundCurrency(distanceFare);
    distanceAuditDesc = bracketSummaries.join('; ') || `${billableDistance.toFixed(1)} mi = $0.00`;
  } else if (mileageTiers && mileageTiers.length > 0) {
    let remainingMiles = billableDistance;
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
    distanceAuditDesc = `${billableDistance.toFixed(2)} billable mi (tiers) = $${distanceFare.toFixed(2)}`;
  } else {
    distanceFare = roundCurrency(billableDistance * effectivePerMileRate);
    distanceAuditDesc = `${billableDistance.toFixed(2)} billable mi @ $${effectivePerMileRate.toFixed(2)}/mi = $${distanceFare.toFixed(2)}`;
  }

  // Duration & Delay / wait-time calculation
  const timeFare = roundCurrency(Math.max(0, durationMinutes) * perMinuteRate);
  let delayFare = 0;
  let delayDesc = '';

  const totalDelayMinutes = Math.max(0, delayMinutes ?? 0);
  if (totalDelayMinutes > 0 && delayRate) {
    const grace = delayRate.gracePeriodMinutes ?? 0;
    const excessMinutes = Math.max(0, totalDelayMinutes - grace);
    if (excessMinutes > 0) {
      const stepSecs = Math.max(1, delayRate.stepSeconds || 90);
      const delaySteps = Math.ceil((excessMinutes * 60) / stepSecs);
      delayFare = roundCurrency(delaySteps * delayRate.ratePerStep);
      delayDesc = ` + Delay ${excessMinutes.toFixed(1)} min (${delaySteps}x ${stepSecs}s @ $${delayRate.ratePerStep.toFixed(2)}) = $${delayFare.toFixed(2)}`;
    }
  }

  const combinedTimeAndDelayFare = roundCurrency(timeFare + delayFare);
  const delta = roundCurrency(distanceFare + combinedTimeAndDelayFare);
  const newSubtotal = roundCurrency(context.subtotal + delta);

  return {
    ...context,
    distanceFare,
    timeFare: combinedTimeAndDelayFare,
    delayFee: delayFare,
    subtotal: newSubtotal,
    totalFare: newSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      2,
      'Distance & Time Rates',
      `${distanceAuditDesc} + ${durationMinutes.toFixed(0)} min travel @ $${perMinuteRate.toFixed(2)}/min ($${timeFare.toFixed(2)})${delayDesc}`,
      delta,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 3: Vehicle Multiplier Application
// ----------------------------------------------------------------------------
export const applyVehicleMultiplier: PricingPipelineStep = (context) => {
  if (context.tariffProfileId) {
    return context;
  }
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
// STEP 5: Condition-Based Surcharges (Car Seats, Extra Passengers, Zones)
// ----------------------------------------------------------------------------
export const applyConditionSurcharges: PricingPipelineStep = (context) => {
  if (context.tariffProfileId) {
    return context;
  }
  const newSurcharges: SurchargeEntry[] = [];
  const cfg = context.config.conditionSurcharges;
  let runningAdditions = 0;

  // 1. Child safety car seat equipment fee
  let carSeatFee = 0;
  if (cfg?.carSeatFeePerUnit && cfg.carSeatFeePerUnit > 0) {
    const breakdown = context.input.carSeatsBreakdown;
    const totalCarSeats = breakdown
      ? (breakdown.total ?? ((breakdown.rearFacing ?? 0) + (breakdown.frontFacing ?? 0) + (breakdown.booster ?? 0)))
      : 0;

    if (totalCarSeats > 0) {
      carSeatFee = roundCurrency(totalCarSeats * cfg.carSeatFeePerUnit);
      newSurcharges.push({
        name: `Child Safety Seats (${totalCarSeats})`,
        amount: carSeatFee,
        description: `$${cfg.carSeatFeePerUnit.toFixed(2)} equipment fee x ${totalCarSeats} seat(s)`,
      });
      runningAdditions += carSeatFee;
    }
  }

  // 2. Extra passenger allowance fee
  let passengerSurcharge = 0;
  const passengers = Math.max(0, context.input.passengers ?? 0);
  if (
    cfg?.passengerBaseAllowance !== undefined &&
    cfg?.extraPassengerFeePerHead &&
    cfg.extraPassengerFeePerHead > 0 &&
    passengers > cfg.passengerBaseAllowance
  ) {
    const extraHeads = passengers - cfg.passengerBaseAllowance;
    passengerSurcharge = roundCurrency(extraHeads * cfg.extraPassengerFeePerHead);
    newSurcharges.push({
      name: `Additional Passenger Fee (+${extraHeads})`,
      amount: passengerSurcharge,
      description: `$${cfg.extraPassengerFeePerHead.toFixed(2)}/head over ${cfg.passengerBaseAllowance} passenger base allowance`,
    });
    runningAdditions += passengerSurcharge;
  }

  // 3. Vehicle tier specific surcharges
  const tier = context.input.vehicleTier;
  if (cfg?.vehicleTierSurcharges?.[tier]) {
    const tierSurcharge = cfg.vehicleTierSurcharges[tier];
    if (tierSurcharge.flat > 0) {
      newSurcharges.push({
        name: `${tier.toUpperCase()} Vehicle Premium`,
        amount: roundCurrency(tierSurcharge.flat),
        description: `Fixed vehicle class surcharge for ${tier}`,
      });
      runningAdditions += tierSurcharge.flat;
    }
    if (tierSurcharge.percent > 0) {
      const pctAmount = roundCurrency(context.subtotal * (tierSurcharge.percent / 100));
      newSurcharges.push({
        name: `${tier.toUpperCase()} Class Fee (${tierSurcharge.percent}%)`,
        amount: pctAmount,
        description: `${tierSurcharge.percent}% vehicle tier adder`,
      });
      runningAdditions += pctAmount;
    }
  }

  // 4. Zone surcharges
  if (cfg?.zoneSurcharges && context.input.zoneIds?.length) {
    for (const zid of context.input.zoneIds) {
      const zoneSurcharge = cfg.zoneSurcharges[zid];
      if (zoneSurcharge) {
        if (zoneSurcharge.flat > 0) {
          newSurcharges.push({
            name: `Zone Surcharge (${zid})`,
            amount: roundCurrency(zoneSurcharge.flat),
            description: `Regional geofence operational adder`,
          });
          runningAdditions += zoneSurcharge.flat;
        }
        if (zoneSurcharge.percent > 0) {
          const pctAmount = roundCurrency(context.subtotal * (zoneSurcharge.percent / 100));
          newSurcharges.push({
            name: `Zone Surcharge (${zoneSurcharge.percent}%)`,
            amount: pctAmount,
            description: `${zoneSurcharge.percent}% regional zone adder`,
          });
          runningAdditions += pctAmount;
        }
      }
    }
  }

  if (newSurcharges.length === 0) {
    return context;
  }

  const roundedDelta = roundCurrency(runningAdditions);
  const newSubtotal = roundCurrency(context.subtotal + roundedDelta);

  return {
    ...context,
    carSeatFee,
    passengerSurcharge,
    surcharges: [...context.surcharges, ...newSurcharges],
    subtotal: newSubtotal,
    totalFare: newSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      5,
      'Condition Surcharges & Extras',
      `Applied ${newSurcharges.length} condition surcharge(s): ${newSurcharges.map((s) => `${s.name} (+$${s.amount.toFixed(2)})`).join(', ')}`,
      roundedDelta,
      newSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 6: Named Pricing Rules Matrix (Dynamic Evaluation & Driver Selection)
// ----------------------------------------------------------------------------
export const applyNamedPricingRules: PricingPipelineStep = (context) => {
  const rules = context.config.namedPricingRules;
  if (!rules || rules.length === 0) {
    return context;
  }

  let pickupDateStr: string | undefined;
  let pickupTimeStr: string | undefined;

  const dt =
    typeof context.input.pickupDateTime === 'string'
      ? new Date(context.input.pickupDateTime)
      : context.input.pickupDateTime;

  if (dt && !isNaN(dt.getTime())) {
    pickupDateStr = dt.toISOString().split('T')[0];
    const hours = String(dt.getHours()).padStart(2, '0');
    const mins = String(dt.getMinutes()).padStart(2, '0');
    pickupTimeStr = `${hours}:${mins}`;
  }

  const evaluationResult = evaluateApplicablePricingRules(
    {
      distanceMiles: context.input.distanceMiles,
      durationMinutes: context.input.durationMinutes,
      pickupDate: pickupDateStr,
      pickupTime: pickupTimeStr,
      zoneIds: context.input.zoneIds,
      originZoneId: context.input.originZoneId,
      destinationZoneId: context.input.destinationZoneId,
      zoneGroupIds: context.input.zoneGroupIds,
      locationCollectionIds: context.input.locationCollectionIds,
      accountType: context.input.accountType,
      accountTags: context.input.accountTags,
      vehicleTier: context.input.vehicleTier,
      selectedRuleId: context.input.selectedRuleId,
      equipment: context.input.equipment,
      passengers: context.input.passengers,
    },
    rules
  );

  if (evaluationResult.matchedRules.length === 0) {
    return context;
  }

  let currentSubtotal = context.subtotal;
  const appliedNames = evaluationResult.matchedRules.map((r) => r.name);
  const newSurcharges: SurchargeEntry[] = [];

  // Flat override takes precedence
  if (typeof evaluationResult.flatOverride === 'number') {
    const overrideVal = roundCurrency(evaluationResult.flatOverride);
    const delta = roundCurrency(overrideVal - currentSubtotal);
    currentSubtotal = overrideVal;

    return {
      ...context,
      appliedRuleNames: appliedNames,
      subtotal: currentSubtotal,
      totalFare: currentSubtotal,
      auditTrail: appendAudit(
        context.auditTrail,
        6,
        'Named Pricing Rule: Flat Fare Corridor',
        `Enforced flat corridor rule: ${appliedNames[0]} ($${overrideVal.toFixed(2)})`,
        delta,
        currentSubtotal
      ),
    };
  }

  let multiplierDelta = 0;
  if (evaluationResult.multiplier !== 1.0) {
    const scaled = roundCurrency(currentSubtotal * evaluationResult.multiplier);
    multiplierDelta = roundCurrency(scaled - currentSubtotal);
    currentSubtotal = scaled;
  }

  let additiveSurcharges = 0;
  if (evaluationResult.surchargeFlat > 0) {
    newSurcharges.push({
      name: 'Named Rule Surcharge',
      amount: roundCurrency(evaluationResult.surchargeFlat),
      description: evaluationResult.auditTrail.join('; '),
    });
    additiveSurcharges += evaluationResult.surchargeFlat;
  }

  if (evaluationResult.surchargePercent > 0) {
    const pctFee = roundCurrency(currentSubtotal * (evaluationResult.surchargePercent / 100));
    newSurcharges.push({
      name: `Named Rule Adder (${evaluationResult.surchargePercent}%)`,
      amount: pctFee,
      description: evaluationResult.auditTrail.join('; '),
    });
    additiveSurcharges += pctFee;
  }

  if (evaluationResult.surchargeAdders && evaluationResult.surchargeAdders.length > 0) {
    for (const adder of evaluationResult.surchargeAdders) {
      newSurcharges.push({
        name: adder.name,
        amount: roundCurrency(adder.amount),
        description: 'Inherited rule surcharge adder',
      });
      additiveSurcharges += adder.amount;
    }
  }

  const totalDelta = roundCurrency(multiplierDelta + additiveSurcharges);
  currentSubtotal = roundCurrency(currentSubtotal + additiveSurcharges);

  return {
    ...context,
    appliedRuleNames: appliedNames,
    surcharges: [...context.surcharges, ...newSurcharges],
    subtotal: currentSubtotal,
    totalFare: currentSubtotal,
    auditTrail: appendAudit(
      context.auditTrail,
      6,
      'Named Pricing Rules Matrix',
      `Applied named rule(s) [${appliedNames.join(', ')}]: ${evaluationResult.auditTrail.join(', ')}`,
      totalDelta,
      currentSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 7: Surcharges & Discount Deductions
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
