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
  FirewallSurchargeTraceEntry,
} from './types';
import { evaluateApplicablePricingRules, DEFAULT_NAMED_PRICING_RULES } from './pricing-rules.service';
import {
  DEFAULT_TARIFF_PROFILES,
  DEFAULT_RATE_ROUNDING,
  matchTariffProfile,
  matchTariffCorridor,
  evaluateTaximeterFare,
  evaluateZipMatrixFare,
  evaluateHourlyFare,
  applyFareRounding,
} from './tariff.service';
import { DEFAULT_UNIVERSAL_EXTRAS } from './extras.service';
import {
  DEFAULT_SURCHARGES_CONFIG,
  BUILTIN_SURCHARGE_IDS,
  getSurchargeCatalogItems,
} from './surcharges.service';
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

  const breakdown = context.input.carSeatsBreakdown;
  const carSeatsTotal = breakdown
    ? breakdown.total ??
      (breakdown.rearFacing ?? 0) + (breakdown.frontFacing ?? 0) + (breakdown.booster ?? 0)
    : context.input.equipment?.carSeats ?? 0;

  const evaluationResult = evaluateApplicablePricingRules(
    {
      distanceMiles: context.input.distanceMiles,
      durationMinutes: context.input.durationMinutes,
      pickupDate: pickupDateStr,
      pickupTime: pickupTimeStr,
      zoneIds: context.input.zoneIds,
      originZoneIds: context.input.originZoneIds,
      destinationZoneIds: context.input.destinationZoneIds,
      originZoneId: context.input.originZoneId,
      destinationZoneId: context.input.destinationZoneId,
      isAirportPickup: context.input.isAirportPickup,
      isAirportDropoff: context.input.isAirportDropoff,
      isAirportTrip: context.input.isAirportTrip,
      isHourlyBooking: context.input.isHourlyBooking,
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
      carSeatsTotal,
      passengers: context.input.passengers,
    },
    rules
  );

  const firewallTrace = {
    ruleDecisions: evaluationResult.ruleDecisions,
    selectedRateSource: evaluationResult.targetTariffId
      ? ('rule' as const)
      : context.config.activeTariffId
      ? ('explicit' as const)
      : ('default' as const),
    selectedRateRuleName: evaluationResult.targetTariffRuleName,
    surchargeDecisions: [],
  };

  if (evaluationResult.matchedRules.length === 0) {
    return {
      ...context,
      firewallTrace,
    };
  }

  const appliedNames = evaluationResult.matchedRules.map((r) => r.name);

  return {
    ...context,
    appliedRuleNames: appliedNames,
    targetTariffId: evaluationResult.targetTariffId ?? context.targetTariffId,
    resolvedSurchargeActions: evaluationResult.resolvedSurchargeActions,
    resolvedExtraActions: evaluationResult.resolvedExtraActions,
    overruleExtras: evaluationResult.overruleExtras ?? context.overruleExtras,
    overruleSurcharges: evaluationResult.overruleSurcharges ?? context.overruleSurcharges,
    layeredZoneFee: evaluationResult.layeredZoneFee ?? context.layeredZoneFee,
    firewallTrace,
    evaluatedRuleModifiers: {
      flatOverride: evaluationResult.flatOverride,
      multiplier: evaluationResult.multiplier,
      surchargeFlat: evaluationResult.surchargeFlat,
      surchargePercent: evaluationResult.surchargePercent,
      discountFlat: evaluationResult.discountFlat,
      discountPercent: evaluationResult.discountPercent,
      surchargeAdders: evaluationResult.surchargeAdders,
      matchedRuleNames: appliedNames,
      auditDetails: evaluationResult.auditTrail,
    },
    auditTrail: appendAudit(
      context.auditTrail,
      1,
      'Pricing Rules (Firewall)',
      `Matched rule(s) [${appliedNames.join(', ')}]${evaluationResult.targetTariffId ? ` -> Rate: ${evaluationResult.targetTariffId}` : ''}`,
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

  const requestedTariffId = context.config.activeTariffId || context.targetTariffId;
  const matchedProfile = matchTariffProfile(context.input, tariffs, requestedTariffId);
  if (!matchedProfile) {
    return context;
  }
  const rateRounding = matchedProfile.rounding || DEFAULT_RATE_ROUNDING;
  const nextFirewallTrace = context.firewallTrace
    ? {
        ...context.firewallTrace,
        selectedRateSource: context.config.activeTariffId
          ? ('explicit' as const)
          : context.targetTariffId
          ? ('rule' as const)
          : ('default' as const),
      }
    : undefined;

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
        rateRounding,
        firewallTrace: nextFirewallTrace,
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
      rateRounding,
      firewallTrace: nextFirewallTrace,
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
      rateRounding,
      firewallTrace: nextFirewallTrace,
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
  // pickup curb waiting (`curbWaitMinutes`) is billed once under Extras.
  const delayDuration = context.input.delayMinutes ?? 0;
  const meterResult = evaluateTaximeterFare(
    activeTaximeter,
    context.input.distanceMiles,
    delayDuration,
    rateRounding.distanceMode
  );

  const tariffBase = roundCurrency(meterResult.subtotal);
  newLineItems.push({
    id: 'base-fare',
    category: 'base',
    label: 'Base Fare',
    detail: `${meterResult.effectiveDistanceMiles.toFixed(1)} mi`,
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
    rateRounding,
    firewallTrace: nextFirewallTrace,
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
  const newDiscounts: DiscountEntry[] = [];
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

  // 2. Multiplier Modifier (applied to Base Fare; <1.0 goes to discounts, >1.0 goes to surcharges)
  if (mods.multiplier && mods.multiplier !== 1.0) {
    const scaled = roundCurrency(currentBase * mods.multiplier);
    const multDelta = roundCurrency(scaled - currentBase);
    if (multDelta !== 0) {
      currentTotal = roundCurrency(currentTotal + multDelta);
      deltaTotal = roundCurrency(deltaTotal + multDelta);
      const label = `${mods.matchedRuleNames[0]} (${mods.multiplier.toFixed(2)}×)`;
      if (multDelta < 0) {
        newDiscounts.push({
          name: label,
          code: 'RULE_MULTIPLIER',
          amount: Math.abs(multDelta),
        });
      } else {
        newSurcharges.push({
          name: label,
          amount: multDelta,
          description: mods.auditDetails.join('; '),
        });
      }
      lineItems.push({
        id: 'rule-multiplier',
        category: multDelta < 0 ? 'discount' : 'surcharge',
        label,
        amount: multDelta,
        sourceType: 'rule',
      });
    }
  }

  // 2b. Direct Rule Percentage / Flat Discounts (from fareAdjustment)
  if (mods.discountPercent && mods.discountPercent > 0) {
    const discAmt = Math.min(roundCurrency(currentBase * (mods.discountPercent / 100)), currentTotal);
    if (discAmt > 0) {
      const label = `${mods.matchedRuleNames[0]} (-${mods.discountPercent}%)`;
      newDiscounts.push({ name: label, code: 'RULE_DISCOUNT_PCT', amount: discAmt });
      lineItems.push({
        id: 'rule-discount-pct',
        category: 'discount',
        label,
        amount: -discAmt,
        sourceType: 'rule',
      });
      currentTotal = roundCurrency(currentTotal - discAmt);
      deltaTotal = roundCurrency(deltaTotal - discAmt);
    }
  }

  if (mods.discountFlat && mods.discountFlat > 0) {
    const discAmt = Math.min(roundCurrency(mods.discountFlat), currentTotal);
    if (discAmt > 0) {
      const label = `${mods.matchedRuleNames[0]} (-$${discAmt.toFixed(2)})`;
      newDiscounts.push({ name: label, code: 'RULE_DISCOUNT_FLAT', amount: discAmt });
      lineItems.push({
        id: 'rule-discount-flat',
        category: 'discount',
        label,
        amount: -discAmt,
        sourceType: 'rule',
      });
      currentTotal = roundCurrency(currentTotal - discAmt);
      deltaTotal = roundCurrency(deltaTotal - discAmt);
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

  if (deltaTotal === 0 && newSurcharges.length === 0 && newDiscounts.length === 0) {
    return context;
  }

  return {
    ...context,
    tariffBaseSubtotal: currentBase,
    baseFare: currentBase,
    subtotal: currentBase,
    surcharges: [...context.surcharges, ...newSurcharges],
    discounts: [...context.discounts, ...newDiscounts],
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
// STEP 6: Caller-Injected Legacy Surge Rules (Admin Peak Surge now runs cleanly in Step 8 Firewall)
// ----------------------------------------------------------------------------
export function createSurgeStep(
  rules: readonly SurgeRule[] = DEFAULT_SURGE_RULES
): PricingPipelineStep {
  return (context) => {
    if (context.input.bypassSurge || rules.length === 0) {
      return context;
    }

    let activeMultiplier = 1.0;
    let surgeName = '';

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

    if (activeMultiplier <= 1.0) {
      return context;
    }

    const baseAmount = context.tariffBaseSubtotal ?? context.subtotal;
    const delta = roundCurrency(baseAmount * (activeMultiplier - 1.0));
    const newTotal = roundCurrency(context.totalFare + delta);

    return {
      ...context,
      surgeMultiplier: activeMultiplier,
      surgeDescription: surgeName,
      surcharges: [
        ...context.surcharges,
        {
          name: surgeName,
          amount: delta,
          description: `Custom surge rule (${activeMultiplier.toFixed(2)}× on $${baseAmount.toFixed(2)})`,
        },
      ],
      lineItems: [
        ...context.lineItems,
        {
          id: 'peak-demand-surge',
          category: 'surcharge',
          label: surgeName,
          amount: delta,
          sourceType: 'surcharge',
        },
      ],
      totalFare: newTotal,
      auditTrail: appendAudit(
        context.auditTrail,
        4,
        'Custom Surge Rule',
        `${surgeName}: +$${delta.toFixed(2)}`,
        delta,
        newTotal
      ),
    };
  };
}

export const applySurgeMultiplier: PricingPipelineStep = createSurgeStep(DEFAULT_SURGE_RULES);

// ----------------------------------------------------------------------------
// STEP 7: Universal Customer Extras & Curb Wait (Respects Firewall Rule Extra Directives)
// ----------------------------------------------------------------------------
export const applyConditionSurcharges: PricingPipelineStep = (context) => {
  const newSurcharges: SurchargeEntry[] = [];
  const newLineItems: PriceLineItem[] = [];
  const extras = context.config.universalExtras || DEFAULT_UNIVERSAL_EXTRAS;
  const overrules = context.overruleExtras || {};
  const extraDirectives = context.resolvedExtraActions || {};
  let runningAdditions = 0;

  // 1. Child Safety Seats
  let carSeatFee = 0;
  const carSeatDir = extraDirectives.car_seat;
  const carSeatRate =
    carSeatDir?.action === 'waive' || overrules.waiveCarSeatFee
      ? 0
      : carSeatDir?.action === 'override' && typeof carSeatDir.overrideAmount === 'number'
      ? carSeatDir.overrideAmount
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
  const extraPaxDir = extraDirectives.extra_passenger;
  const allowance = overrules.passengerBaseAllowance ?? extras.passengerBaseAllowance;
  const perHeadFee =
    extraPaxDir?.action === 'waive' || overrules.waiveExtraPaxFee
      ? 0
      : extraPaxDir?.action === 'override' && typeof extraPaxDir.overrideAmount === 'number'
      ? extraPaxDir.overrideAmount
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
    const stopDir = extraDirectives.intermediate_stop;
    const stopFeeRate =
      stopDir?.action === 'waive'
        ? 0
        : stopDir?.action === 'override' && typeof stopDir.overrideAmount === 'number'
        ? stopDir.overrideAmount
        : overrules.intermediateStopFee ?? extras.intermediateStopFee;
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

  // 5. Curb Waiting Delay Fee (reads canonical + legacy alias field names + Firewall Extra Directive)
  const curbWaitMins = context.input.curbWaitMinutes ?? 0;
  const curbDir = extraDirectives.curb_wait;
  const graceMins =
    overrules.curbWaitingGraceMinutes ??
    overrules.pickupGraceMinutes ??
    extras.curbWaitingGraceMinutes ??
    extras.pickupGraceMinutes ??
    10;
  const curbRate =
    curbDir?.action === 'waive'
      ? 0
      : curbDir?.action === 'override' && typeof curbDir.overrideAmount === 'number'
      ? curbDir.overrideAmount
      : overrules.curbWaitingRatePerMinute ??
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
// STEP 8: Firewall Surcharges, Tolls, Discounts, Manual Override & Per-Rate Rounding
// ----------------------------------------------------------------------------
export function createSurchargesAndDiscountsStep(
  availableDiscounts: Record<string, DiscountRule> = DEFAULT_DISCOUNTS
): PricingPipelineStep {
  return (context) => {
    const newSurcharges: SurchargeEntry[] = [];
    const newDiscounts: DiscountEntry[] = [];
    const newLineItems: PriceLineItem[] = [];
    const surchargeDecisions: FirewallSurchargeTraceEntry[] = [];
    let currentTotal = context.totalFare;
    let resolvedSurgeMultiplier = context.surgeMultiplier;
    let resolvedSurgeDescription = context.surgeDescription;
    const tariffBase = context.tariffBaseSubtotal ?? context.subtotal;

    const surchargesCatalog = context.config.surchargesCatalog || DEFAULT_SURCHARGES_CONFIG;
    const catalogItems = getSurchargeCatalogItems(surchargesCatalog);
    const directives = context.resolvedSurchargeActions || {};
    const activeRules = (context.config.namedPricingRules || []).filter((r) => r.isActive);

    const isAirport = Boolean(
      context.input.isAirportPickup ||
        context.input.isAirportDropoff ||
        context.input.isAirportTrip ||
        (context.input.originZoneId &&
          surchargesCatalog.airportTargetZoneIds?.includes(context.input.originZoneId)) ||
        (context.input.destinationZoneId &&
          surchargesCatalog.airportTargetZoneIds?.includes(context.input.destinationZoneId))
    );

    // Helper: check if ANY active rule explicitly manages a surchargeId (if so, legacy auto-conditions stand down)
    const isManagedByAnyRule = (surchargeId: string): boolean =>
      activeRules.some((r) =>
        r.modifier.surchargeActions?.some((a) => a.surchargeId === surchargeId)
      );

    // Helper: lossless zero-downtime fallback for unmigrated pre-v2 Firestore surcharges
    const matchesLegacyAutoCondition = (
      item: (typeof catalogItems)[number]
    ): boolean => {
      const legacy = item.legacyAutoCondition;
      if (!legacy) return false;
      if (legacy.kind === 'airport') {
        return isAirport;
      }
      if (legacy.kind === 'remote_distance') {
        const threshold = legacy.remoteThresholdMiles ?? 15.0;
        return context.input.distanceMiles > threshold && !isAirport;
      }
      if (legacy.kind === 'custom_triggers' && legacy.customTriggers) {
        const triggers = legacy.customTriggers;
        const allowedVehicles = [
          ...(triggers.vehicleTiers || []),
          ...(triggers.vehicleTypes || []),
        ].filter(Boolean);
        if (allowedVehicles.length > 0) {
          const ok = doesVehicleMatchAllowedList(
            allowedVehicles,
            {
              vehicleTypeId: context.input.vehicleTypeId,
              vehicleType: context.input.vehicleType,
              vehicleTier: context.input.vehicleTier,
              vehicleClass: context.input.vehicleClass,
            },
            { allowAnyDispatch: false }
          );
          if (!ok) return false;
        }
        if (
          triggers.minDistanceMiles !== undefined &&
          context.input.distanceMiles < triggers.minDistanceMiles
        ) {
          return false;
        }
        if (
          triggers.maxDistanceMiles !== undefined &&
          context.input.distanceMiles > triggers.maxDistanceMiles
        ) {
          return false;
        }
        if (triggers.timeWindow) {
          if (!context.input.pickupDateTime) return false;
          const tripDate = new Date(context.input.pickupDateTime);
          const hour = tripDate.getHours();
          const { startHour, endHour } = triggers.timeWindow;
          if (startHour <= endHour) {
            if (hour < startHour || hour >= endHour) return false;
          } else {
            if (hour < startHour && hour >= endHour) return false;
          }
        }
        if (triggers.daysOfWeek && triggers.daysOfWeek.length > 0) {
          if (!context.input.pickupDateTime) return false;
          const tripDate = new Date(context.input.pickupDateTime);
          if (!triggers.daysOfWeek.includes(tripDate.getDay())) return false;
        }
        if (triggers.zoneIds && triggers.zoneIds.length > 0) {
          const allZones = new Set<string>([
            ...(context.input.zoneIds || []),
            ...(context.input.originZoneIds || []),
            ...(context.input.destinationZoneIds || []),
            ...(context.input.originZoneId ? [context.input.originZoneId] : []),
            ...(context.input.destinationZoneId ? [context.input.destinationZoneId] : []),
          ]);
          if (!triggers.zoneIds.some((z) => allZones.has(z))) return false;
        }
        return true;
      }
      return false;
    };

    // 1. Evaluate every Surcharge in the Firewall Catalog
    for (const item of catalogItems) {
      // Master Kill Switch
      if (!item.enabled) {
        surchargeDecisions.push({
          surchargeId: item.id,
          surchargeName: item.name,
          defaultPolicy: item.defaultPolicy,
          status: 'disabled',
          reason: 'Master switch disabled',
          amount: 0,
        });
        continue;
      }

      // Explicit Dispatcher Overrides (Surge Bypass / Airport Waiver)
      if (item.id === BUILTIN_SURCHARGE_IDS.PEAK_SURGE && context.input.bypassSurge) {
        surchargeDecisions.push({
          surchargeId: item.id,
          surchargeName: item.name,
          defaultPolicy: item.defaultPolicy,
          status: 'waived',
          reason: 'Bypassed by dispatcher override',
          amount: 0,
        });
        continue;
      }
      if (item.id === BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS && context.input.waiveAirportFee) {
        newSurcharges.push({
          name: `${item.name} (Waived)`,
          amount: 0,
          description: 'Dispatcher waived airport access fee',
        });
        surchargeDecisions.push({
          surchargeId: item.id,
          surchargeName: item.name,
          defaultPolicy: item.defaultPolicy,
          status: 'waived',
          reason: 'Waived by dispatcher override',
          amount: 0,
        });
        continue;
      }

      // Firewall Policy Resolution: Highest-priority Rule Directive -> Default Policy -> Legacy Migration Fallback
      const directive = directives[item.id];
      let shouldApply = false;
      let decisionReason = '';
      let effectiveMode = item.mode;
      let effectiveAmount = item.amount;

      if (directive) {
        if (directive.action === 'waive') {
          surchargeDecisions.push({
            surchargeId: item.id,
            surchargeName: item.name,
            defaultPolicy: item.defaultPolicy,
            status: 'waived',
            reason: `Waived by Rule "${directive.sourceRuleName}" (P${directive.sourcePriority})`,
            amount: 0,
          });
          continue;
        }
        shouldApply = true;
        if (directive.action === 'override') {
          if (typeof directive.overrideAmount === 'number') {
            effectiveAmount = directive.overrideAmount;
          }
          if (directive.overrideMode) {
            effectiveMode = directive.overrideMode;
          }
          decisionReason = `Overridden by Rule "${directive.sourceRuleName}" (P${directive.sourcePriority})`;
        } else {
          decisionReason = `Applied by Rule "${directive.sourceRuleName}" (P${directive.sourcePriority})`;
        }
      } else if (item.defaultPolicy === 'universal') {
        shouldApply = true;
        decisionReason = 'Universal (Applies to all rides by default)';
      } else {
        // defaultPolicy === 'rule_only'
        if (
          surchargesCatalog.catalogVersion !== 2 &&
          item.legacyAutoCondition &&
          !isManagedByAnyRule(item.id) &&
          matchesLegacyAutoCondition(item)
        ) {
          shouldApply = true;
          decisionReason = 'Legacy auto-condition (unmigrated Firestore doc)';
        } else {
          surchargeDecisions.push({
            surchargeId: item.id,
            surchargeName: item.name,
            defaultPolicy: item.defaultPolicy,
            status: 'skipped',
            reason: 'Rule-Only (no matching rule applied it)',
            amount: 0,
          });
          continue;
        }
      }

      if (!shouldApply) continue;

      let fee = 0;
      let detail: string | undefined;
      if (effectiveMode === 'multiplier') {
        if (effectiveAmount > 1.0) {
          fee = roundCurrency(tariffBase * (effectiveAmount - 1.0));
          detail = `${effectiveAmount.toFixed(2)}× of base fare`;
          if (item.id === BUILTIN_SURCHARGE_IDS.PEAK_SURGE) {
            resolvedSurgeMultiplier = effectiveAmount;
            resolvedSurgeDescription = `${item.name} (${effectiveAmount.toFixed(2)}×)`;
          }
        }
      } else if (effectiveMode === 'per_mile') {
        fee = roundCurrency(effectiveAmount * context.input.distanceMiles);
        detail = `$${effectiveAmount.toFixed(2)}/mi × ${context.input.distanceMiles.toFixed(1)} mi`;
      } else if (effectiveMode === 'percent') {
        fee = roundCurrency(tariffBase * (effectiveAmount / 100));
        detail = `${effectiveAmount}% of base fare`;
      } else {
        fee = roundCurrency(effectiveAmount);
      }

      if (fee > 0) {
        const displayLabel =
          effectiveMode === 'multiplier' ? `${item.name} (${effectiveAmount.toFixed(2)}×)` : item.name;
        newSurcharges.push({
          name: displayLabel,
          amount: fee,
          description: detail || item.description || decisionReason,
        });
        newLineItems.push({
          id: item.id,
          category: 'surcharge',
          label: displayLabel,
          detail,
          amount: fee,
          sourceType: 'surcharge',
          sourceId: item.id,
        });
        currentTotal = roundCurrency(currentTotal + fee);
        surchargeDecisions.push({
          surchargeId: item.id,
          surchargeName: item.name,
          defaultPolicy: item.defaultPolicy,
          status: 'applied',
          reason: decisionReason,
          amount: fee,
        });
      } else {
        surchargeDecisions.push({
          surchargeId: item.id,
          surchargeName: item.name,
          defaultPolicy: item.defaultPolicy,
          status: 'skipped',
          reason: `${decisionReason} (amount resolved to $0.00)`,
          amount: 0,
        });
      }
    }

    // 2. Tolls & Highway Surcharge
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

    // 3. Dispatcher Courtesy / Corporate Percentage Discount
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

    // 4. Promotional Discounts
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

    const updatedFirewallTrace = context.firewallTrace
      ? {
          ...context.firewallTrace,
          surchargeDecisions,
        }
      : {
          ruleDecisions: [],
          selectedRateSource: context.tariffProfileId ? ('default' as const) : ('default' as const),
          surchargeDecisions,
        };

    // 5. Manual Fare Override (Dispatcher Override — clears contradictory itemized surcharges/discounts)
    if (
      typeof context.input.manualFareOverride === 'number' &&
      context.input.manualFareOverride >= 0
    ) {
      const overrideFare = applyFareRounding(
        context.input.manualFareOverride,
        context.rateRounding?.fareMode ?? 'ceil_dollar'
      );
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
        surcharges: [],
        discounts: [],
        lineItems: overrideLines,
        subtotal: overrideFare,
        totalFare: overrideFare,
        firewallTrace: updatedFirewallTrace,
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

    // 6. Legacy Minimum Fare Floor (ONLY if no active Rate Profile priced the trip)
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

    // 7. Per-Rate Final Fare Rounding Policy (exact_cents | nearest_half_dollar | nearest_dollar | ceil_dollar)
    const fareRoundingMode = context.rateRounding?.fareMode ?? 'ceil_dollar';
    const roundedFare = applyFareRounding(currentTotal, fareRoundingMode);
    const roundingAdj = roundCurrency(roundedFare - currentTotal);
    if (roundingAdj !== 0) {
      newLineItems.push({
        id: 'rounding-dollar',
        category: 'rounding',
        label: 'Rounding',
        detail:
          fareRoundingMode === 'ceil_dollar'
            ? 'Round up to whole dollar'
            : fareRoundingMode === 'nearest_dollar'
            ? 'Nearest dollar'
            : 'Nearest $0.50',
        amount: roundingAdj,
        sourceType: 'rounding',
      });
      currentTotal = roundedFare;
    }

    const finalFare = roundCurrency(currentTotal);
    const delta = roundCurrency(finalFare - context.totalFare);

    return {
      ...context,
      surgeMultiplier: resolvedSurgeMultiplier,
      surgeDescription: resolvedSurgeDescription,
      surcharges: [...context.surcharges, ...newSurcharges],
      discounts: [...context.discounts, ...newDiscounts],
      lineItems: [...context.lineItems, ...newLineItems],
      totalFare: finalFare,
      firewallTrace: updatedFirewallTrace,
      auditTrail: appendAudit(
        context.auditTrail,
        6,
        'Surcharges, Discounts & Rounding',
        `Applied ${surchargeDecisions.filter((d) => d.status === 'applied').length} surcharge(s) and ${newDiscounts.length} discount(s) (${fareRoundingMode}) -> Final Total $${finalFare.toFixed(2)}`,
        delta,
        finalFare
      ),
    };
  };
}

export const applySurchargesAndDiscounts: PricingPipelineStep =
  createSurchargesAndDiscountsStep(DEFAULT_DISCOUNTS);
