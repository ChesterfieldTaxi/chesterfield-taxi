/**
 * Pure Functional Pricing Pipeline Rules & Steps
 *
 * Deterministic, single-source-of-truth pricing pipeline driven strictly by
 * Admin Rates & Tariffs configuration (Tariffs, Surcharges, Universal Extras,
 * and Named Pricing Rules).
 *
 * Every step appends canonical PriceLineItems to `context.lineItems` so that
 * `sum(lineItems.amount) === totalFare` across `/book`, Homepage Quick-Quote,
 * Booking Confirmation, and the Admin Fare Simulator.
 */

import type { PriceLineItem } from '../../types';
import { DEFAULT_OVERSIZED_BAG_CATEGORIES } from '../../types/config';
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
  evaluateZipMatrixFare,
  evaluateHourlyFare,
} from './tariff.service';
import { DEFAULT_UNIVERSAL_EXTRAS } from './extras.service';
import { DEFAULT_SURCHARGES_CONFIG } from './surcharges.service';
import { doesVehicleMatchAllowedList, formatLocalDateStr } from './vehicle-matching';

/**
 * Default fallback pricing configuration (used ONLY when no Tariff Profiles exist).
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  baseFare: 5.0,
  perMileRate: 2.25,
  perMinuteRate: 0.35,
  minimumFare: 10.0,
  vehicleMultipliers: {
    standard: 1.0,
    premium: 1.0,
    xl: 1.0,
    wheelchair: 1.0,
  },
  multiStopFee: 5.0,
  airportSurcharge: 4.0,
  currency: 'USD',
  flagDropIncludedMiles: 1.5,
  useStepIncrements: false,
  stepIncrementTiers: [],
  delayRate: {
    stepSeconds: 90,
    ratePerStep: 0.6,
    gracePeriodMinutes: 5,
  },
  conditionSurcharges: {
    carSeatFeePerUnit: 10.0,
    passengerBaseAllowance: 1,
    extraPassengerFeePerHead: 1.0,
    vehicleTierSurcharges: {},
    zoneSurcharges: {},
  },
  namedPricingRules: DEFAULT_NAMED_PRICING_RULES,
  tariffs: DEFAULT_TARIFF_PROFILES,
  universalExtras: DEFAULT_UNIVERSAL_EXTRAS,
  surchargesCatalog: DEFAULT_SURCHARGES_CONFIG,
};

/**
 * Hardcoded time-of-day surge rules have been intentionally removed.
 * Surge only applies when explicitly enabled in Admin Surcharges (`isPeakSurgeActive`)
 * or via an admin-configured conditional time-window surcharge / rule.
 */
export const DEFAULT_SURGE_RULES: readonly SurgeRule[] = [] as const;

/**
 * Standard Promotional Discount Rules.
 */
export const DEFAULT_DISCOUNTS: Record<string, DiscountRule> = {
  SAVE10: {
    code: 'SAVE10',
    type: 'percentage',
    value: 0.1,
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
    value: 5.0,
    minSpend: 15.0,
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
// STEP 1: Pre-Tariff Routing & Policy Rules (Target Tariff, Waivers, Deferred Modifiers)
// ----------------------------------------------------------------------------
export const resolveRoutingRules: PricingPipelineStep = (context) => {
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
    // Local wall-clock date (fixes UTC evening rollover bug)
    pickupDateStr = formatLocalDateStr(dt);
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
      isAirportPickup: context.input.isAirportPickup,
      isAirportDropoff: context.input.isAirportDropoff,
      isAirportTrip: context.input.isAirportTrip,
      zoneGroupIds: context.input.zoneGroupIds,
      locationCollectionIds: context.input.locationCollectionIds,
      accountType: context.input.accountType,
      accountTags: context.input.accountTags,
      vehicleTypeId: context.input.vehicleTypeId,
      vehicleTier: context.input.vehicleTier,
      vehicleType: context.input.vehicleType,
      vehicleClass: context.input.vehicleClass,
      corporateAccountId: context.input.corporateAccountId,
      pickupZipCode: context.input.pickupZipCode,
      dropoffZipCode: context.input.dropoffZipCode,
      selectedRuleId: context.input.selectedRuleId,
      equipment: context.input.equipment,
      passengers: context.input.passengers,
    },
    rules
  );

  if (evaluationResult.matchedRules.length === 0) {
    return context;
  }

  const appliedNames = evaluationResult.matchedRules.map((r) => r.name);

  return {
    ...context,
    appliedRuleNames: appliedNames,
    targetTariffId: evaluationResult.targetTariffId ?? context.targetTariffId,
    overruleExtras: evaluationResult.overruleExtras ?? context.overruleExtras,
    overruleSurcharges: evaluationResult.overruleSurcharges ?? context.overruleSurcharges,
    layeredZoneFee: evaluationResult.layeredZoneFee ?? context.layeredZoneFee,
    evaluatedRuleModifiers: {
      flatOverride: evaluationResult.flatOverride,
      multiplier: evaluationResult.multiplier,
      surchargeFlat: evaluationResult.surchargeFlat,
      surchargePercent: evaluationResult.surchargePercent,
      surchargeAdders: evaluationResult.surchargeAdders,
      matchedRuleNames: appliedNames,
      auditDetails: evaluationResult.auditTrail,
    },
    auditTrail: appendAudit(
      context.auditTrail,
      1,
      'Routing & Policy Rules',
      `Matched rule(s) [${appliedNames.join(', ')}]${evaluationResult.targetTariffId ? ` -> Target Tariff: ${evaluationResult.targetTariffId}` : ''}`,
      0,
      context.subtotal
    ),
  };
};

// Backward-compatible export alias
export const applyNamedPricingRules: PricingPipelineStep = resolveRoutingRules;

// ----------------------------------------------------------------------------
// STEP 2: Unified Tariff Profile Engine (Taximeter, Corridor, Zip Matrix, Hourly)
// ----------------------------------------------------------------------------
export const applyUnifiedTariffEngine: PricingPipelineStep = (context) => {
  const tariffs = context.config.tariffs;
  if (!tariffs || tariffs.length === 0) {
    return context;
  }

  const requestedTariffId = context.targetTariffId || context.config.activeTariffId;
  const candidateTariffs = requestedTariffId
    ? tariffs.filter((t) => t.id === requestedTariffId && !t.isArchived)
    : tariffs;
  const matchedProfile = matchTariffProfile(
    context.input,
    candidateTariffs.length > 0 ? candidateTariffs : tariffs
  );
  if (!matchedProfile) {
    return context;
  }

  const newSurcharges: SurchargeEntry[] = [...context.surcharges];
  const newLineItems: PriceLineItem[] = [...context.lineItems];

  const appendTariffCustomSurcharges = (baseAmount: number): number => {
    let added = 0;
    if (matchedProfile.extras?.customSurcharges) {
      for (const adder of matchedProfile.extras.customSurcharges) {
        const adderFee =
          adder.type === 'percent'
            ? roundCurrency(baseAmount * (adder.amount / 100))
            : roundCurrency(adder.amount);
        if (adderFee > 0) {
          newSurcharges.push({
            name: adder.name,
            amount: adderFee,
            description: `Tariff surcharge: ${adder.name}`,
          });
          newLineItems.push({
            id: `tariff-surcharge-${adder.id || adder.name}`,
            category: 'surcharge',
            label: adder.name,
            amount: adderFee,
            sourceType: 'tariff',
            sourceId: matchedProfile.id,
          });
          added = roundCurrency(added + adderFee);
        }
      }
    }
    return added;
  };

  // 1. Zip-Code Flat Rate Matrix
  const zipEntries =
    matchedProfile.zipMatrix && matchedProfile.zipMatrix.length > 0
      ? matchedProfile.zipMatrix
      : matchedProfile.zipMatrixRates;
  if (matchedProfile.rateModel === 'zip_matrix' || (zipEntries && zipEntries.length > 0)) {
    const zipResult = evaluateZipMatrixFare(
      matchedProfile,
      context.input.pickupZipCode,
      context.input.dropoffZipCode
    );
    if (zipResult) {
      const flatFare = roundCurrency(zipResult.subtotal);
      newLineItems.push({
        id: 'base-fare',
        category: 'base',
        label: 'Base Fare',
        detail: `${matchedProfile.name} (${zipResult.matchedEntry.zip})`,
        amount: flatFare,
        sourceType: 'zip_matrix',
        sourceId: matchedProfile.id,
      });
      const extraTariffFees = appendTariffCustomSurcharges(flatFare);
      const runningTotal = roundCurrency(flatFare + extraTariffFees);

      return {
        ...context,
        tariffProfileId: matchedProfile.id,
        tariffProfileName: matchedProfile.name,
        tariffBaseSubtotal: flatFare,
        baseFare: flatFare,
        distanceFare: 0,
        timeFare: 0,
        effectiveDistanceRate: 0,
        effectiveTimeRate: 0,
        driverPay: zipResult.matchedEntry.driverPay ?? zipResult.matchedEntry.customerCharge,
        surcharges: newSurcharges,
        lineItems: newLineItems,
        subtotal: flatFare,
        totalFare: runningTotal,
        auditTrail: appendAudit(
          context.auditTrail,
          2,
          `Tariff Profile: ${matchedProfile.name}`,
          zipResult.auditDetails.join(' | '),
          runningTotal,
          runningTotal
        ),
      };
    }
  }

  // 2. Hourly Charter
  if (matchedProfile.rateModel === 'hourly' || context.input.isHourlyBooking) {
    const hourlyResult = evaluateHourlyFare(
      matchedProfile,
      context.input.hourlyDurationHours ?? 2,
      context.input.distanceMiles
    );
    const hourlyFare = roundCurrency(hourlyResult.subtotal);
    newLineItems.push({
      id: 'base-fare',
      category: 'base',
      label: 'Base Fare',
      detail: `${matchedProfile.name} (${context.input.hourlyDurationHours ?? 2} hrs)`,
      amount: hourlyFare,
      sourceType: 'hourly',
      sourceId: matchedProfile.id,
    });
    const extraTariffFees = appendTariffCustomSurcharges(hourlyFare);
    const runningTotal = roundCurrency(hourlyFare + extraTariffFees);

    return {
      ...context,
      tariffProfileId: matchedProfile.id,
      tariffProfileName: matchedProfile.name,
      tariffBaseSubtotal: hourlyFare,
      baseFare: hourlyFare,
      distanceFare: 0,
      timeFare: 0,
      effectiveDistanceRate: 0,
      effectiveTimeRate: 0,
      surcharges: newSurcharges,
      lineItems: newLineItems,
      subtotal: hourlyFare,
      totalFare: runningTotal,
      auditTrail: appendAudit(
        context.auditTrail,
        2,
        `Tariff Profile: ${matchedProfile.name}`,
        hourlyResult.auditDetails.join(' | '),
        runningTotal,
        runningTotal
      ),
    };
  }

  // 3. Explicit Zone-to-Zone Flat Corridor
  const matchedCorridor = matchTariffCorridor(context.input, matchedProfile);
  if (matchedCorridor) {
    const flatFare = roundCurrency(matchedCorridor.flatPrice);
    newLineItems.push({
      id: 'base-fare',
      category: 'base',
      label: 'Base Fare',
      detail: matchedCorridor.name,
      amount: flatFare,
      sourceType: 'corridor',
      sourceId: matchedCorridor.id,
    });
    const extraTariffFees = appendTariffCustomSurcharges(flatFare);
    const runningTotal = roundCurrency(flatFare + extraTariffFees);

    return {
      ...context,
      tariffProfileId: matchedProfile.id,
      tariffProfileName: matchedProfile.name,
      matchedCorridorId: matchedCorridor.id,
      matchedCorridorName: matchedCorridor.name,
      tariffBaseSubtotal: flatFare,
      baseFare: flatFare,
      distanceFare: 0,
      timeFare: 0,
      effectiveDistanceRate: 0,
      effectiveTimeRate: 0,
      surcharges: newSurcharges,
      lineItems: newLineItems,
      subtotal: flatFare,
      totalFare: runningTotal,
      auditTrail: appendAudit(
        context.auditTrail,
        2,
        `Tariff Profile: ${matchedProfile.name}`,
        `Flat Corridor: ${matchedCorridor.name} ($${flatFare.toFixed(2)})${matchedCorridor.allowReturn ? ' [Bidirectional]' : ''}`,
        runningTotal,
        runningTotal
      ),
    };
  }

  // 4. Stepped Taximeter Rate Calculation
  const activeTaximeter = matchedProfile.taximeter || matchedProfile.taximeterRate;
  if (!activeTaximeter) {
    return context;
  }

  // Only in-transit traffic delay feeds the taximeter waiting clock;
  // pickup curb waiting (`curbWaitMinutes`) is billed once under Universal Extras.
  const delayDuration = context.input.delayMinutes ?? 0;
  const meterResult = evaluateTaximeterFare(
    activeTaximeter,
    context.input.distanceMiles,
    delayDuration
  );

  const tariffBase = roundCurrency(meterResult.subtotal);
  newLineItems.push({
    id: 'base-fare',
    category: 'base',
    label: 'Base Fare',
    detail: `${context.input.distanceMiles.toFixed(1)} mi`,
    amount: tariffBase,
    sourceType: 'tariff',
    sourceId: matchedProfile.id,
  });

  const extraTariffFees = appendTariffCustomSurcharges(tariffBase);
  const runningTotal = roundCurrency(tariffBase + extraTariffFees);

  return {
    ...context,
    tariffProfileId: matchedProfile.id,
    tariffProfileName: matchedProfile.name,
    tariffBaseSubtotal: tariffBase,
    baseFare: tariffBase,
    distanceFare: meterResult.distanceFare,
    timeFare: meterResult.delayFare,
    delayFee: meterResult.delayFare,
    effectiveDistanceRate: meterResult.effectivePerMileRate,
    effectiveTimeRate: meterResult.effectivePerMinuteRate,
    surcharges: newSurcharges,
    lineItems: newLineItems,
    subtotal: tariffBase,
    totalFare: runningTotal,
    auditTrail: appendAudit(
      context.auditTrail,
      2,
      `Tariff Profile: ${matchedProfile.name}`,
      `Taximeter: ${meterResult.auditDetails.join(' | ')}`,
      runningTotal,
      runningTotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 3A/3B: Legacy Fallback Base/Distance/Time (ONLY when no Tariffs configured)
// ----------------------------------------------------------------------------
export const applyBaseFare: PricingPipelineStep = (context) => {
  if (context.tariffProfileId) {
    return context;
  }
  const tier = context.input.vehicleTier || 'standard';
  const configuredBaseFare = context.config.vehicleBaseFares?.[tier] ?? context.config.baseFare;
  const baseFare = roundCurrency(configuredBaseFare);

  return {
    ...context,
    baseFare,
    tariffBaseSubtotal: baseFare,
    subtotal: baseFare,
    totalFare: baseFare,
    auditTrail: appendAudit(
      context.auditTrail,
      2,
      'Legacy Base Fare',
      `Fallback base fare $${baseFare.toFixed(2)}`,
      baseFare,
      baseFare
    ),
  };
};

export const applyDistanceAndTimeRates: PricingPipelineStep = (context) => {
  if (context.tariffProfileId) {
    return context;
  }
  const { distanceMiles, durationMinutes } = context.input;
  const { perMileRate, perMinuteRate, flagDropIncludedMiles } = context.config;
  const flagDropMiles = Math.max(0, flagDropIncludedMiles ?? 0);
  const billableDistance = Math.max(0, distanceMiles - flagDropMiles);
  const distanceFare = roundCurrency(billableDistance * perMileRate);
  const timeFare = roundCurrency(Math.max(0, durationMinutes) * perMinuteRate);
  const baseSubtotal = Math.ceil(roundCurrency(context.baseFare + distanceFare + timeFare));

  const lineItems: PriceLineItem[] = [
    ...context.lineItems,
    {
      id: 'base-fare',
      category: 'base',
      label: 'Base Fare',
      detail: `${distanceMiles.toFixed(1)} mi`,
      amount: baseSubtotal,
      sourceType: 'tariff',
    },
  ];

  return {
    ...context,
    distanceFare,
    timeFare,
    effectiveDistanceRate: perMileRate,
    effectiveTimeRate: perMinuteRate,
    tariffBaseSubtotal: baseSubtotal,
    subtotal: baseSubtotal,
    totalFare: baseSubtotal,
    lineItems,
    auditTrail: appendAudit(
      context.auditTrail,
      2,
      'Legacy Distance & Time',
      `${billableDistance.toFixed(1)} mi @ $${perMileRate.toFixed(2)}/mi + ${durationMinutes.toFixed(0)} min @ $${perMinuteRate.toFixed(2)}/min -> $${baseSubtotal.toFixed(2)}`,
      baseSubtotal - context.baseFare,
      baseSubtotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 4: Vehicle Multiplier (Option A: Governed by Rates & Tariffs, NOT Fleet Metadata)
// ----------------------------------------------------------------------------
export const applyVehicleMultiplier: PricingPipelineStep = (context) => {
  // Single Source of Truth (Option A): When active Admin Tariffs price the ride,
  // vehicle price differences come strictly from Tariffs, Conditional Surcharges,
  // or Pricing Rules—never hidden Fleet & Vehicles multipliers.
  if (context.tariffProfileId) {
    return {
      ...context,
      vehicleMultiplier: 1.0,
    };
  }

  return {
    ...context,
    vehicleMultiplier: 1.0,
  };
};

// ----------------------------------------------------------------------------
// STEP 5: Post-Tariff Named Pricing Rule Modifiers (Flat Override, Multiplier, Adders)
// ----------------------------------------------------------------------------
export const applyRuleModifiers: PricingPipelineStep = (context) => {
  const mods = context.evaluatedRuleModifiers;
  if (!mods || mods.matchedRuleNames.length === 0) {
    return context;
  }

  let currentTotal = context.totalFare;
  let currentBase = context.tariffBaseSubtotal ?? context.subtotal;
  let lineItems = [...context.lineItems];
  const newSurcharges: SurchargeEntry[] = [];
  let deltaTotal = 0;

  // 1. Flat Fare Override (replaces the Base Fare line item cleanly)
  if (typeof mods.flatOverride === 'number' && mods.flatOverride > 0) {
    const overrideVal = roundCurrency(mods.flatOverride);
    const baseDiff = roundCurrency(overrideVal - currentBase);
    currentBase = overrideVal;
    currentTotal = roundCurrency(currentTotal + baseDiff);
    deltaTotal = roundCurrency(deltaTotal + baseDiff);

    const existingBaseIdx = lineItems.findIndex((li) => li.category === 'base');
    const baseItem: PriceLineItem = {
      id: 'base-fare',
      category: 'base',
      label: 'Base Fare',
      detail: mods.matchedRuleNames[0],
      amount: overrideVal,
      sourceType: 'rule',
    };
    if (existingBaseIdx >= 0) {
      lineItems[existingBaseIdx] = baseItem;
    } else {
      lineItems = [baseItem, ...lineItems];
    }
  }

  // 2. Multiplier Modifier (applied to Base Fare)
  if (mods.multiplier && mods.multiplier !== 1.0) {
    const scaled = roundCurrency(currentBase * mods.multiplier);
    const multDelta = roundCurrency(scaled - currentBase);
    if (multDelta !== 0) {
      currentTotal = roundCurrency(currentTotal + multDelta);
      deltaTotal = roundCurrency(deltaTotal + multDelta);
      const label = `${mods.matchedRuleNames[0]} (${mods.multiplier.toFixed(2)}×)`;
      newSurcharges.push({
        name: label,
        amount: multDelta,
        description: mods.auditDetails.join('; '),
      });
      lineItems.push({
        id: 'rule-multiplier',
        category: multDelta < 0 ? 'discount' : 'surcharge',
        label,
        amount: multDelta,
        sourceType: 'rule',
      });
    }
  }

  // 3. Flat Surcharge from Rule
  if (mods.surchargeFlat > 0) {
    const fee = roundCurrency(mods.surchargeFlat);
    const label = mods.matchedRuleNames[0] || 'Pricing Rule Fee';
    newSurcharges.push({ name: label, amount: fee, description: mods.auditDetails.join('; ') });
    lineItems.push({
      id: 'rule-surcharge-flat',
      category: 'surcharge',
      label,
      amount: fee,
      sourceType: 'rule',
    });
    currentTotal = roundCurrency(currentTotal + fee);
    deltaTotal = roundCurrency(deltaTotal + fee);
  }

  // 4. Percentage Surcharge from Rule (calculated on Base Fare)
  if (mods.surchargePercent > 0) {
    const pctFee = roundCurrency(currentBase * (mods.surchargePercent / 100));
    if (pctFee > 0) {
      const label = `${mods.matchedRuleNames[0]} (+${mods.surchargePercent}%)`;
      newSurcharges.push({ name: label, amount: pctFee, description: mods.auditDetails.join('; ') });
      lineItems.push({
        id: 'rule-surcharge-pct',
        category: 'surcharge',
        label,
        amount: pctFee,
        sourceType: 'rule',
      });
      currentTotal = roundCurrency(currentTotal + pctFee);
      deltaTotal = roundCurrency(deltaTotal + pctFee);
    }
  }

  // 5. Rule Surcharge Adders
  if (mods.surchargeAdders && mods.surchargeAdders.length > 0) {
    for (const adder of mods.surchargeAdders) {
      const fee =
        adder.type === 'percent'
          ? roundCurrency(currentBase * (adder.amount / 100))
          : roundCurrency(adder.amount);
      if (fee > 0) {
        newSurcharges.push({ name: adder.name, amount: fee, description: 'Pricing rule adder' });
        lineItems.push({
          id: `rule-adder-${adder.id || adder.name}`,
          category: 'surcharge',
          label: adder.name,
          amount: fee,
          sourceType: 'rule',
        });
        currentTotal = roundCurrency(currentTotal + fee);
        deltaTotal = roundCurrency(deltaTotal + fee);
      }
    }
  }

  // 6. Layered Zone Fee from Rule
  if (context.layeredZoneFee && context.layeredZoneFee > 0) {
    const fee = roundCurrency(context.layeredZoneFee);
    const label = `${mods.matchedRuleNames[0]} — Zone Fee`;
    newSurcharges.push({ name: label, amount: fee, description: 'Rule layered zone fee' });
    lineItems.push({
      id: 'rule-layered-zone-fee',
      category: 'surcharge',
      label,
      amount: fee,
      sourceType: 'rule',
    });
    currentTotal = roundCurrency(currentTotal + fee);
    deltaTotal = roundCurrency(deltaTotal + fee);
  }

  if (deltaTotal === 0 && newSurcharges.length === 0) {
    return context;
  }

  return {
    ...context,
    tariffBaseSubtotal: currentBase,
    baseFare: currentBase,
    subtotal: currentBase,
    surcharges: [...context.surcharges, ...newSurcharges],
    lineItems,
    totalFare: currentTotal,
    auditTrail: appendAudit(
      context.auditTrail,
      3,
      'Pricing Rule Modifiers',
      `Applied rule modifier(s) from [${mods.matchedRuleNames.join(', ')}]: ${deltaTotal >= 0 ? '+' : '-'}$${Math.abs(deltaTotal).toFixed(2)}`,
      deltaTotal,
      currentTotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 6: Opt-In Admin Peak Demand Surge (Zero Hardcoded Automatic Surge)
// ----------------------------------------------------------------------------
export function createSurgeStep(
  rules: readonly SurgeRule[] = DEFAULT_SURGE_RULES
): PricingPipelineStep {
  return (context) => {
    if (context.input.bypassSurge) {
      return {
        ...context,
        surgeMultiplier: 1.0,
        surgeDescription: 'Surge waived by dispatcher override',
        auditTrail: appendAudit(
          context.auditTrail,
          4,
          'Peak Demand Surge',
          'Surge waived by dispatcher override (1.0x)',
          0,
          context.totalFare
        ),
      };
    }

    const matchedTariff = context.config.tariffs?.find((t) => t.id === context.tariffProfileId);
    if (matchedTariff && matchedTariff.allowSurgeMultiplier === false) {
      return {
        ...context,
        surgeMultiplier: 1.0,
        surgeDescription: `Surge exempt (${matchedTariff.name})`,
        auditTrail: appendAudit(
          context.auditTrail,
          4,
          'Peak Demand Surge',
          `Surge exempt under tariff: ${matchedTariff.name}`,
          0,
          context.totalFare
        ),
      };
    }

    const surchargesCatalog = context.config.surchargesCatalog || DEFAULT_SURCHARGES_CONFIG;
    const surgeTariffs = surchargesCatalog.surgeApplicableTariffs;
    const matchesSurgeTariff =
      !surgeTariffs ||
      surgeTariffs.length === 0 ||
      !context.tariffProfileId ||
      surgeTariffs.includes(context.tariffProfileId);

    let activeMultiplier = 1.0;
    let surgeName = '';

    // 1. Admin Surcharges Peak Surge Toggle (Primary authoritative switch)
    if (
      surchargesCatalog.isPeakSurgeActive &&
      matchesSurgeTariff &&
      typeof surchargesCatalog.peakSurgeMultiplier === 'number' &&
      surchargesCatalog.peakSurgeMultiplier > 1.0
    ) {
      activeMultiplier = surchargesCatalog.peakSurgeMultiplier;
      surgeName = `Peak Demand Surge (${activeMultiplier.toFixed(2)}×)`;
    }

    // 2. Explicit manual override if passed directly in configOverride
    if (
      typeof context.config.manualSurgeMultiplier === 'number' &&
      context.config.manualSurgeMultiplier > activeMultiplier
    ) {
      activeMultiplier = context.config.manualSurgeMultiplier;
      surgeName = `Active Surge Pricing (${activeMultiplier.toFixed(2)}×)`;
    }

    // 3. Optional caller-injected custom SurgeRule[] (DEFAULT_SURGE_RULES is empty)
    if (rules.length > 0) {
      const rawDate = context.input.pickupDateTime;
      const pickupDate =
        typeof rawDate === 'string'
          ? new Date(rawDate)
          : rawDate instanceof Date
          ? rawDate
          : new Date();
      for (const rule of rules) {
        if (rule.matches(pickupDate) && rule.multiplier > activeMultiplier) {
          activeMultiplier = rule.multiplier;
          surgeName = `${rule.name} (${activeMultiplier.toFixed(2)}×)`;
        }
      }
    }

    if (activeMultiplier <= 1.0) {
      return {
        ...context,
        surgeMultiplier: 1.0,
        auditTrail: appendAudit(
          context.auditTrail,
          4,
          'Peak Demand Surge',
          'No peak surge active (1.0x)',
          0,
          context.totalFare
        ),
      };
    }

    const baseAmount = context.tariffBaseSubtotal ?? context.subtotal;
    const delta = roundCurrency(baseAmount * (activeMultiplier - 1.0));
    const newTotal = roundCurrency(context.totalFare + delta);

    const surgeSurcharge: SurchargeEntry = {
      name: surgeName,
      amount: delta,
      description: `Admin peak demand surge (${activeMultiplier.toFixed(2)}× on $${baseAmount.toFixed(2)} base fare)`,
    };

    const surgeLineItem: PriceLineItem = {
      id: 'peak-demand-surge',
      category: 'surcharge',
      label: surgeName,
      amount: delta,
      sourceType: 'surcharge',
    };

    return {
      ...context,
      surgeMultiplier: activeMultiplier,
      surgeDescription: surgeName,
      surcharges: [...context.surcharges, surgeSurcharge],
      lineItems: [...context.lineItems, surgeLineItem],
      totalFare: newTotal,
      auditTrail: appendAudit(
        context.auditTrail,
        4,
        'Peak Demand Surge',
        `${surgeName}: +$${delta.toFixed(2)}`,
        delta,
        newTotal
      ),
    };
  };
}

export const applySurgeMultiplier: PricingPipelineStep = createSurgeStep(DEFAULT_SURGE_RULES);

// ----------------------------------------------------------------------------
// STEP 7: Universal Customer Extras (Car Seats, Extra Pax, Stops, Oversized Cargo, Curb Wait, Custom Extras)
// ----------------------------------------------------------------------------
export const applyConditionSurcharges: PricingPipelineStep = (context) => {
  const matchedTariff = context.config.tariffs?.find((t) => t.id === context.tariffProfileId);
  if (matchedTariff && (matchedTariff as any).allowCustomerAddons === false) {
    return context;
  }

  const newSurcharges: SurchargeEntry[] = [];
  const newLineItems: PriceLineItem[] = [];
  const extras = context.config.universalExtras || DEFAULT_UNIVERSAL_EXTRAS;
  const overrules = context.overruleExtras || {};
  let runningAdditions = 0;

  // 1. Child Safety Seats
  let carSeatFee = 0;
  const carSeatRate = overrules.waiveCarSeatFee
    ? 0
    : overrules.carSeatFeePerUnit ?? extras.carSeatFeePerUnit;
  if (carSeatRate > 0) {
    const breakdown = context.input.carSeatsBreakdown;
    const totalCarSeats = breakdown
      ? breakdown.total ??
        (breakdown.rearFacing ?? 0) + (breakdown.frontFacing ?? 0) + (breakdown.booster ?? 0)
      : context.input.equipment?.carSeats ?? 0;

    if (totalCarSeats > 0) {
      carSeatFee = roundCurrency(totalCarSeats * carSeatRate);
      const label = `Child Safety Seats (${totalCarSeats})`;
      newSurcharges.push({
        name: label,
        amount: carSeatFee,
        description: `$${carSeatRate.toFixed(2)} × ${totalCarSeats} seat(s)`,
      });
      newLineItems.push({
        id: 'extra-car-seats',
        category: 'extra',
        label,
        detail: `$${carSeatRate.toFixed(2)}/seat`,
        amount: carSeatFee,
        sourceType: 'extra',
      });
      runningAdditions = roundCurrency(runningAdditions + carSeatFee);
    }
  }

  // 2. Extra Passenger Allowance Fee
  let passengerSurcharge = 0;
  const allowance = overrules.passengerBaseAllowance ?? extras.passengerBaseAllowance;
  const perHeadFee = overrules.waiveExtraPaxFee
    ? 0
    : overrules.extraPassengerFeePerHead ?? extras.extraPassengerFeePerHead;
  const passengers = Math.max(0, context.input.passengers ?? 1);
  if (allowance !== undefined && perHeadFee > 0 && passengers > allowance) {
    const extraHeads = passengers - allowance;
    passengerSurcharge = roundCurrency(extraHeads * perHeadFee);
    const label = `Additional Passenger (+${extraHeads})`;
    newSurcharges.push({
      name: label,
      amount: passengerSurcharge,
      description: `$${perHeadFee.toFixed(2)}/head over ${allowance} passenger base`,
    });
    newLineItems.push({
      id: 'extra-passengers',
      category: 'extra',
      label,
      detail: `$${perHeadFee.toFixed(2)} each`,
      amount: passengerSurcharge,
      sourceType: 'extra',
    });
    runningAdditions = roundCurrency(runningAdditions + passengerSurcharge);
  }

  // 3. Intermediate Waypoints / Stops
  const stopsCount = Math.max(0, context.input.intermediateStopsCount ?? 0);
  if (stopsCount > 0) {
    const stopFeeRate = overrules.intermediateStopFee ?? extras.intermediateStopFee;
    if (context.input.waiveMultiStopFees || stopFeeRate === 0) {
      newSurcharges.push({
        name: `Intermediate Stops (${stopsCount} - Waived)`,
        amount: 0,
        description: 'Intermediate stop fee waived',
      });
    } else {
      const totalStopFee = roundCurrency(stopsCount * stopFeeRate);
      const label = `Intermediate Stops (${stopsCount})`;
      newSurcharges.push({
        name: label,
        amount: totalStopFee,
        description: `$${stopFeeRate.toFixed(2)} per stop`,
      });
      newLineItems.push({
        id: 'extra-stops',
        category: 'extra',
        label,
        detail: `$${stopFeeRate.toFixed(2)}/stop`,
        amount: totalStopFee,
        sourceType: 'extra',
      });
      runningAdditions = roundCurrency(runningAdditions + totalStopFee);
    }
  }

  // 4. Oversized Cargo & Special Equipment (Golf Clubs, Skis, Cargo Boxes, etc.)
  let oversizedLuggageFee = 0;
  const selectedOversized = context.input.oversizedBags;
  const oversizedCatalog =
    extras.oversizedBagsConfig && extras.oversizedBagsConfig.length > 0
      ? extras.oversizedBagsConfig
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;

  if (selectedOversized && typeof selectedOversized === 'object') {
    for (const [catId, rawCount] of Object.entries(selectedOversized)) {
      const count = Math.max(0, Math.floor(Number(rawCount) || 0));
      if (count <= 0) continue;
      const cat = oversizedCatalog.find((c) => c.id === catId);
      if (cat && cat.fee > 0) {
        const fee = roundCurrency(count * cat.fee);
        const label = count > 1 ? `${cat.label} (×${count})` : cat.label;
        newSurcharges.push({
          name: label,
          amount: fee,
          description: `Oversized cargo: $${cat.fee.toFixed(2)} × ${count}`,
        });
        newLineItems.push({
          id: `extra-oversized-${cat.id}`,
          category: 'extra',
          label,
          detail: count > 1 ? `$${cat.fee.toFixed(2)} each` : undefined,
          amount: fee,
          sourceType: 'extra',
          sourceId: cat.id,
        });
        oversizedLuggageFee = roundCurrency(oversizedLuggageFee + fee);
        runningAdditions = roundCurrency(runningAdditions + fee);
      }
    }
  }

  // 5. Curb Waiting Delay Fee (reads canonical + legacy alias field names)
  const curbWaitMins = context.input.curbWaitMinutes ?? 0;
  const graceMins =
    overrules.curbWaitingGraceMinutes ??
    overrules.pickupGraceMinutes ??
    extras.curbWaitingGraceMinutes ??
    extras.pickupGraceMinutes ??
    10;
  const curbRate =
    overrules.curbWaitingRatePerMinute ??
    overrules.waitingRatePerMinute ??
    extras.curbWaitingRatePerMinute ??
    extras.waitingRatePerMinute ??
    0;
  if (curbWaitMins > graceMins && curbRate > 0) {
    const billableMins = curbWaitMins - graceMins;
    const curbFee = roundCurrency(billableMins * curbRate);
    const label = `Curb Waiting (${billableMins} min)`;
    newSurcharges.push({
      name: label,
      amount: curbFee,
      description: `${billableMins} min past ${graceMins}m grace @ $${curbRate.toFixed(2)}/min`,
    });
    newLineItems.push({
      id: 'extra-curb-wait',
      category: 'extra',
      label,
      detail: `$${curbRate.toFixed(2)}/min`,
      amount: curbFee,
      sourceType: 'extra',
    });
    runningAdditions = roundCurrency(runningAdditions + curbFee);
  }

  // 6. Custom Bookable Fleet Extras (Customer-selected + legacy petCarrier flag)
  let customExtrasFee = 0;
  const selectedCustom = context.input.selectedCustomExtras || {};
  const catalogCustomExtras = extras.customExtras || [];

  for (const ce of catalogCustomExtras) {
    if (ce.isActive === false || ce.fee <= 0) continue;

    let qty = Math.max(0, Math.floor(Number(selectedCustom[ce.id]) || 0));
    if (
      qty === 0 &&
      ce.name.toLowerCase().includes('pet') &&
      Boolean((context.input.equipment as any)?.petCarrier)
    ) {
      qty = 1;
    }

    if (qty > 0) {
      const units = ce.isPerUnit ? qty : 1;
      const fee = roundCurrency(units * ce.fee);
      const label = units > 1 ? `${ce.name} (×${units})` : ce.name;
      newSurcharges.push({
        name: label,
        amount: fee,
        description: ce.description || `Extra service: ${ce.name}`,
      });
      newLineItems.push({
        id: `extra-custom-${ce.id}`,
        category: 'extra',
        label,
        detail: units > 1 ? `$${ce.fee.toFixed(2)} each` : undefined,
        amount: fee,
        sourceType: 'extra',
        sourceId: ce.id,
      });
      customExtrasFee = roundCurrency(customExtrasFee + fee);
      runningAdditions = roundCurrency(runningAdditions + fee);
    }
  }

  if (newSurcharges.length === 0) {
    return context;
  }

  const roundedDelta = roundCurrency(runningAdditions);
  const newTotal = roundCurrency(context.totalFare + roundedDelta);

  return {
    ...context,
    carSeatFee,
    passengerSurcharge,
    oversizedLuggageFee,
    customExtrasFee,
    surcharges: [...context.surcharges, ...newSurcharges],
    lineItems: [...context.lineItems, ...newLineItems],
    // Preserve pure tariff subtotal (never inflate subtotal with extras!)
    totalFare: newTotal,
    auditTrail: appendAudit(
      context.auditTrail,
      5,
      'Universal Extras & Add-Ons',
      `Applied ${newLineItems.length} extra(s): ${newLineItems.map((s) => `${s.label} (+$${s.amount.toFixed(2)})`).join(', ')}`,
      roundedDelta,
      newTotal
    ),
  };
};

// ----------------------------------------------------------------------------
// STEP 8: Operational & Conditional Surcharges, Discounts, Overrides & Rounding
// ----------------------------------------------------------------------------
export function createSurchargesAndDiscountsStep(
  availableDiscounts: Record<string, DiscountRule> = DEFAULT_DISCOUNTS
): PricingPipelineStep {
  return (context) => {
    const newSurcharges: SurchargeEntry[] = [];
    const newDiscounts: DiscountEntry[] = [];
    const newLineItems: PriceLineItem[] = [];
    let currentTotal = context.totalFare;
    const tariffBase = context.tariffBaseSubtotal ?? context.subtotal;

    const matchedTariff = context.config.tariffs?.find((t) => t.id === context.tariffProfileId);
    const allowOperationalSurcharges = matchedTariff
      ? matchedTariff.allowOperationalSurcharges !== false
      : true;

    const surchargesCatalog = context.config.surchargesCatalog || DEFAULT_SURCHARGES_CONFIG;
    const overrules = context.overruleSurcharges || {};

    // 1. Airport Commercial Access Fee
    const airportFeeRate = overrules.waiveAirportFee
      ? 0
      : overrules.airportGateFee ?? surchargesCatalog.airportGateFee ?? 4.0;
    const isAirport =
      context.input.isAirportPickup ||
      context.input.isAirportDropoff ||
      context.input.isAirportTrip ||
      (context.input.originZoneId &&
        surchargesCatalog.airportTargetZoneIds?.includes(context.input.originZoneId)) ||
      (context.input.destinationZoneId &&
        surchargesCatalog.airportTargetZoneIds?.includes(context.input.destinationZoneId));
    const airportTariffs = surchargesCatalog.airportFeeApplicableTariffs;
    const matchesAirportTariff =
      !airportTariffs ||
      airportTariffs.length === 0 ||
      !context.tariffProfileId ||
      airportTariffs.includes(context.tariffProfileId);

    if (
      isAirport &&
      allowOperationalSurcharges &&
      airportFeeRate > 0 &&
      matchesAirportTariff &&
      !overrules.waiveAirportFee &&
      !surchargesCatalog.waiveAirportFee
    ) {
      if (context.input.waiveAirportFee) {
        newSurcharges.push({
          name: 'Airport Commercial Access Fee (Waived)',
          amount: 0,
          description: 'Dispatcher waived airport access fee',
        });
      } else {
        const airportFee = roundCurrency(airportFeeRate);
        newSurcharges.push({
          name: 'Airport Commercial Access Fee',
          amount: airportFee,
          description: 'Airport commercial terminal access pass-through fee',
        });
        newLineItems.push({
          id: 'surcharge-airport',
          category: 'surcharge',
          label: 'Airport Commercial Access Fee',
          amount: airportFee,
          sourceType: 'surcharge',
        });
        currentTotal = roundCurrency(currentTotal + airportFee);
      }
    }

    // 2. Built-In Fuel / Gas Surcharge
    const isFuelActive =
      overrules.isFuelSurchargeActive ?? surchargesCatalog.isFuelSurchargeActive ?? false;
    const waiveFuel = overrules.waiveFuelSurcharge ?? surchargesCatalog.waiveFuelSurcharge ?? false;
    const fuelAmount = overrules.fuelSurchargeAmount ?? surchargesCatalog.fuelSurchargeAmount ?? 0;
    const fuelType = overrules.fuelSurchargeType ?? surchargesCatalog.fuelSurchargeType ?? 'flat';
    const fuelTariffs = surchargesCatalog.fuelSurchargeApplicableTariffs;
    const matchesFuelTariff =
      !fuelTariffs ||
      fuelTariffs.length === 0 ||
      !context.tariffProfileId ||
      fuelTariffs.includes(context.tariffProfileId);

    if (isFuelActive && !waiveFuel && allowOperationalSurcharges && fuelAmount > 0 && matchesFuelTariff) {
      const fuelFee =
        fuelType === 'per_mile'
          ? roundCurrency(fuelAmount * context.input.distanceMiles)
          : fuelType === 'percent'
          ? roundCurrency(tariffBase * (fuelAmount / 100))
          : roundCurrency(fuelAmount);

      if (fuelFee > 0) {
        const fuelDesc =
          fuelType === 'per_mile'
            ? `$${fuelAmount.toFixed(2)}/mi × ${context.input.distanceMiles.toFixed(1)} mi`
            : fuelType === 'percent'
            ? `${fuelAmount}% of base fare`
            : 'Flat fuel surcharge';
        newSurcharges.push({
          name: 'Fuel / Gas Surcharge',
          amount: fuelFee,
          description: fuelDesc,
        });
        newLineItems.push({
          id: 'surcharge-fuel',
          category: 'surcharge',
          label: 'Fuel / Gas Surcharge',
          detail: fuelType !== 'flat' ? fuelDesc : undefined,
          amount: fuelFee,
          sourceType: 'surcharge',
        });
        currentTotal = roundCurrency(currentTotal + fuelFee);
      }
    }

    // 3. Out-of-Area Remote Service Surcharge
    const remoteThreshold = surchargesCatalog.outOfAreaThresholdMiles ?? 15.0;
    const remoteFeeRate = overrules.waiveRemoteFee
      ? 0
      : overrules.outOfAreaRemoteFee ?? surchargesCatalog.outOfAreaRemoteFee ?? 0;
    const isAirportTrip = isAirport || context.tariffProfileId === 'tariff-airport-flat';
    const remoteTariffs = surchargesCatalog.remoteFeeApplicableTariffs;
    const matchesRemoteTariff =
      !remoteTariffs ||
      remoteTariffs.length === 0 ||
      !context.tariffProfileId ||
      remoteTariffs.includes(context.tariffProfileId);

    if (
      context.input.distanceMiles > remoteThreshold &&
      remoteFeeRate > 0 &&
      allowOperationalSurcharges &&
      matchesRemoteTariff &&
      !isAirportTrip &&
      !overrules.waiveRemoteFee &&
      !surchargesCatalog.waiveRemoteFee
    ) {
      const remoteFee = roundCurrency(remoteFeeRate);
      newSurcharges.push({
        name: 'Out-of-Area Remote Service Fee',
        amount: remoteFee,
        description: `Exceeds ${remoteThreshold} mi regional boundary`,
      });
      newLineItems.push({
        id: 'surcharge-remote',
        category: 'surcharge',
        label: 'Out-of-Area Service Fee',
        amount: remoteFee,
        sourceType: 'surcharge',
      });
      currentTotal = roundCurrency(currentTotal + remoteFee);
    }

    // 4. Tolls & Highway Surcharge
    const tollAmount =
      context.input.tolls ?? context.input.customTollsOrFees ?? context.config.defaultTolls ?? 0;
    if (tollAmount > 0) {
      const tollFee = roundCurrency(tollAmount);
      newSurcharges.push({
        name: 'Tolls & Highway Surcharge',
        amount: tollFee,
        description: 'Bridge, express lane, and highway toll fees',
      });
      newLineItems.push({
        id: 'surcharge-tolls',
        category: 'surcharge',
        label: 'Estimated Tolls',
        amount: tollFee,
        sourceType: 'surcharge',
      });
      currentTotal = roundCurrency(currentTotal + tollFee);
    }

    // 5. Custom Conditional Surcharges (Vehicle Tier Upgrades, Time Windows, Distance, Days, Zones)
    if (surchargesCatalog.customSurcharges && surchargesCatalog.customSurcharges.length > 0) {
      for (const custom of surchargesCatalog.customSurcharges) {
        if (!custom.isActive) continue;

        // Applicable tariffs check
        if (custom.applicableTariffIds && custom.applicableTariffIds.length > 0) {
          if (context.tariffProfileId && !custom.applicableTariffIds.includes(context.tariffProfileId)) {
            continue;
          }
        }

        const triggers = custom.triggers;
        const allowedVehicles = [
          ...(triggers?.vehicleTiers || []),
          ...(triggers?.vehicleTypes || []),
          ...(custom.applicableVehicleTypes || []),
        ].filter(Boolean);

        if (allowedVehicles.length > 0) {
          const matchesVehicle = doesVehicleMatchAllowedList(
            allowedVehicles,
            {
              vehicleTypeId: context.input.vehicleTypeId,
              vehicleType: context.input.vehicleType,
              vehicleTier: context.input.vehicleTier,
              vehicleClass: context.input.vehicleClass,
            },
            { allowAnyDispatch: false }
          );
          if (!matchesVehicle) continue;
        }

        if (triggers) {
          if (
            triggers.minDistanceMiles !== undefined &&
            context.input.distanceMiles < triggers.minDistanceMiles
          ) {
            continue;
          }
          if (
            triggers.maxDistanceMiles !== undefined &&
            context.input.distanceMiles > triggers.maxDistanceMiles
          ) {
            continue;
          }

          if (triggers.timeWindow && context.input.pickupDateTime) {
            const tripDate = new Date(context.input.pickupDateTime);
            const hour = tripDate.getHours();
            const { startHour, endHour } = triggers.timeWindow;
            if (startHour <= endHour) {
              if (hour < startHour || hour >= endHour) continue;
            } else {
              if (hour < startHour && hour >= endHour) continue;
            }
          }

          if (
            triggers.daysOfWeek &&
            triggers.daysOfWeek.length > 0 &&
            context.input.pickupDateTime
          ) {
            const tripDate = new Date(context.input.pickupDateTime);
            const day = tripDate.getDay();
            if (!triggers.daysOfWeek.includes(day)) continue;
          }

          if (triggers.zoneIds && triggers.zoneIds.length > 0) {
            const zoneMatches =
              (context.input.originZoneId &&
                triggers.zoneIds.includes(context.input.originZoneId)) ||
              (context.input.destinationZoneId &&
                triggers.zoneIds.includes(context.input.destinationZoneId)) ||
              (context.input.zoneIds &&
                context.input.zoneIds.some((z) => triggers.zoneIds?.includes(z)));
            if (!zoneMatches) continue;
          }
        }

        const fee =
          custom.type === 'percent'
            ? roundCurrency(tariffBase * (custom.amount / 100))
            : custom.type === 'per_mile'
            ? roundCurrency(custom.amount * context.input.distanceMiles)
            : roundCurrency(custom.amount);

        if (fee > 0) {
          newSurcharges.push({
            name: custom.name,
            amount: fee,
            description: custom.description || `${custom.name}: $${fee.toFixed(2)}`,
          });
          newLineItems.push({
            id: `surcharge-custom-${custom.id}`,
            category: 'surcharge',
            label: custom.name,
            detail:
              custom.type === 'percent'
                ? `${custom.amount}%`
                : custom.type === 'per_mile'
                ? `$${custom.amount.toFixed(2)}/mi`
                : undefined,
            amount: fee,
            sourceType: 'surcharge',
            sourceId: custom.id,
          });
          currentTotal = roundCurrency(currentTotal + fee);
        }
      }
    }

    // 6. Dispatcher Courtesy / Corporate Percentage Discount
    let totalDiscountAmount = 0;
    if (
      typeof context.input.manualDiscountPercent === 'number' &&
      context.input.manualDiscountPercent > 0 &&
      context.input.manualDiscountPercent <= 100
    ) {
      const pct = context.input.manualDiscountPercent;
      const pctDiscount = Math.min(roundCurrency(currentTotal * (pct / 100)), currentTotal);
      if (pctDiscount > 0) {
        const label = context.input.manualDiscountLabel || `Courtesy Discount (${pct}%)`;
        totalDiscountAmount = roundCurrency(totalDiscountAmount + pctDiscount);
        newDiscounts.push({
          name: label,
          code: 'PERCENT_DISCOUNT',
          amount: pctDiscount,
        });
        newLineItems.push({
          id: 'discount-percent',
          category: 'discount',
          label,
          amount: -pctDiscount,
          sourceType: 'discount',
        });
        currentTotal = roundCurrency(currentTotal - pctDiscount);
      }
    }

    if (context.input.manualDiscount && context.input.manualDiscount > 0) {
      const discountVal = Math.min(roundCurrency(context.input.manualDiscount), currentTotal);
      if (discountVal > 0) {
        const label = context.input.manualDiscountLabel || 'Dispatcher Courtesy Discount';
        totalDiscountAmount = roundCurrency(totalDiscountAmount + discountVal);
        newDiscounts.push({
          name: label,
          code: 'DISPATCHER_CREDIT',
          amount: discountVal,
        });
        newLineItems.push({
          id: 'discount-courtesy',
          category: 'discount',
          label,
          amount: -discountVal,
          sourceType: 'discount',
        });
        currentTotal = roundCurrency(currentTotal - discountVal);
      }
    }

    // 7. Promotional Discounts
    if (context.input.promoCode) {
      const codeKey = context.input.promoCode.trim().toUpperCase();
      const discountRule = availableDiscounts[codeKey];
      if (discountRule) {
        const canApply = !discountRule.minSpend || currentTotal >= discountRule.minSpend;
        if (canApply) {
          let discountVal =
            discountRule.type === 'percentage'
              ? roundCurrency(currentTotal * discountRule.value)
              : roundCurrency(discountRule.value);
          discountVal = Math.min(discountVal, currentTotal);
          if (discountVal > 0) {
            totalDiscountAmount = roundCurrency(totalDiscountAmount + discountVal);
            newDiscounts.push({
              name: discountRule.description,
              code: discountRule.code,
              amount: discountVal,
            });
            newLineItems.push({
              id: `discount-promo-${discountRule.code}`,
              category: 'discount',
              label: `Promo (${discountRule.code})`,
              detail: discountRule.description,
              amount: -discountVal,
              sourceType: 'discount',
            });
            currentTotal = roundCurrency(currentTotal - discountVal);
          }
        }
      }
    }

    // 8. Manual Fare Override (Dispatcher Override)
    if (
      typeof context.input.manualFareOverride === 'number' &&
      context.input.manualFareOverride >= 0
    ) {
      const overrideFare = Math.ceil(context.input.manualFareOverride);
      const overrideLines: PriceLineItem[] = [
        {
          id: 'base-fare',
          category: 'base',
          label: 'Base Fare',
          detail: 'Dispatcher agreed rate',
          amount: overrideFare,
          sourceType: 'rule',
        },
      ];
      return {
        ...context,
        tariffBaseSubtotal: overrideFare,
        baseFare: overrideFare,
        surcharges: [...context.surcharges, ...newSurcharges],
        discounts: [...context.discounts, ...newDiscounts],
        lineItems: overrideLines,
        subtotal: overrideFare,
        totalFare: overrideFare,
        auditTrail: appendAudit(
          context.auditTrail,
          6,
          'Dispatcher Fare Override',
          `Manual total fare override applied ($${overrideFare.toFixed(2)})`,
          overrideFare - context.totalFare,
          overrideFare
        ),
      };
    }

    // 9. Legacy Minimum Fare Floor (ONLY if no active Tariff Profile priced the trip)
    if (!context.tariffProfileId) {
      const minFare = context.config.minimumFare;
      if (currentTotal < minFare) {
        const minAdj = roundCurrency(minFare - currentTotal);
        currentTotal = minFare;
        newSurcharges.push({
          name: 'Minimum Fare Adjustment',
          amount: minAdj,
          description: `Minimum fare floor ($${minFare.toFixed(2)})`,
        });
        newLineItems.push({
          id: 'legacy-min-floor',
          category: 'surcharge',
          label: 'Minimum Fare Adjustment',
          amount: minAdj,
          sourceType: 'surcharge',
        });
      }
    }

    // 10. Ceiling Dollar Rounding (only when percentage fees/discounts leave fractional cents)
    const ceilFare = Math.ceil(currentTotal);
    if (ceilFare > currentTotal) {
      const roundingAdj = roundCurrency(ceilFare - currentTotal);
      newLineItems.push({
        id: 'rounding-dollar',
        category: 'rounding',
        label: 'Rounding',
        amount: roundingAdj,
        sourceType: 'rounding',
      });
      currentTotal = ceilFare;
    }

    const finalFare = roundCurrency(currentTotal);
    const delta = roundCurrency(finalFare - context.totalFare);

    return {
      ...context,
      surcharges: [...context.surcharges, ...newSurcharges],
      discounts: [...context.discounts, ...newDiscounts],
      lineItems: [...context.lineItems, ...newLineItems],
      totalFare: finalFare,
      auditTrail: appendAudit(
        context.auditTrail,
        6,
        'Surcharges & Discounts',
        `Applied ${newSurcharges.length} surcharge(s) and ${newDiscounts.length} discount(s) -> Final Total $${finalFare.toFixed(2)}`,
        delta,
        finalFare
      ),
    };
  };
}

export const applySurchargesAndDiscounts: PricingPipelineStep =
  createSurchargesAndDiscountsStep(DEFAULT_DISCOUNTS);
