/**
 * Pricing Rules Service
 *
 * Manages named dynamic pricing rules in Firestore collection `/pricingRules`
 * with regional Chesterfield/St. Louis presets, real-time sync, offline caching,
 * and pure condition-based evaluation.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  type Firestore,
} from 'firebase/firestore';
import type { NamedPricingRule, PricingRuleTrigger, PricingRuleModifier } from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { doesVehicleMatchAllowedList } from './vehicle-matching';

const PRICING_RULES_STORAGE_KEY = 'chesterfield_taxi_pricing_rules';

export const DEFAULT_NAMED_PRICING_RULES: NamedPricingRule[] = [
  {
    id: 'rule-airport-transfer-flat',
    name: 'Airport Transfer Flat Rate (Lambert & Spirit)',
    description:
      'Directly applies Airport Flat Rate tariff when trip originates or terminates at Lambert (STL) or Spirit (SUS) airports.',
    priority: 95,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      isBidirectionalTransfer: true,
      zoneGroupIds: ['group-regional-aviation', 'group-airports'],
      zoneIds: ['zone-lambert-airport', 'zone-spirit-airport'],
    },
    modifier: {
      type: 'apply_tariff',
      value: 0,
      targetTariffId: 'tariff-airport-flat',
    },
  },
];

export interface RuleEvaluationInput {
  distanceMiles: number;
  durationMinutes?: number;
  pickupDate?: string; // "YYYY-MM-DD" (local wall-clock)
  pickupTime?: string; // "HH:MM" 24h
  zoneIds?: string[];
  originZoneId?: string;
  destinationZoneId?: string;
  isAirportPickup?: boolean;
  isAirportDropoff?: boolean;
  isAirportTrip?: boolean;
  zoneGroupIds?: string[];
  locationCollectionIds?: string[];
  accountType?: 'retail' | 'corporate' | 'vip';
  accountTags?: string[];
  vehicleTypeId?: string;
  vehicleTier?: string;
  vehicleType?: import('../../types/config').VehicleType;
  vehicleClass?: import('../../types/config').VehicleClass;
  corporateAccountId?: string;
  pickupZipCode?: string;
  dropoffZipCode?: string;
  selectedRuleId?: string;
  equipment?: {
    carSeats?: number;
    luggageCount?: number;
  };
  passengers?: number;
}

export interface EvaluatedRulesSummary {
  matchedRules: NamedPricingRule[];
  flatOverride?: number;
  multiplier: number;
  surchargeFlat: number;
  surchargePercent: number;
  baseFareOverride?: number;
  perMileRateOverride?: number;
  perMinuteRateOverride?: number;
  surchargeAdders?: import('../../types/config').RuleSurchargeAdder[];
  targetTariffId?: string;
  overruleExtras?: Partial<import('../../types/config').UniversalExtrasConfig>;
  overruleSurcharges?: Partial<import('../../types/config').SurchargesConfig>;
  layeredZoneFee?: number;
  stoppedProcessingByRule?: NamedPricingRule;
  auditTrail: string[];
}

export class PricingRulesService {
  private isConfigured: boolean;
  private db: Firestore | null = null;
  private cache: NamedPricingRule[] | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    if (this.isConfigured) {
      try {
        this.db = getFirestoreDb();
      } catch (err) {
        console.warn('[PricingRulesService] Failed to initialize Firestore db:', err);
      }
    }
  }

  private getCachedRules(): NamedPricingRule[] {
    if (this.cache !== null) {
      return [...this.cache];
    }
    if (typeof window === 'undefined') return DEFAULT_NAMED_PRICING_RULES;
    try {
      const raw = localStorage.getItem(PRICING_RULES_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.cache = parsed;
          return [...parsed];
        }
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_NAMED_PRICING_RULES;
  }

  private setCachedRules(rules: NamedPricingRule[]): void {
    this.cache = [...rules];
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PRICING_RULES_STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // Ignore storage errors
    }
  }

  public getAllRules(): NamedPricingRule[] {
    return this.getCachedRules().sort((a, b) => b.priority - a.priority);
  }

  public async getRules(): Promise<NamedPricingRule[]> {
    if (this.isConfigured && this.db) {
      try {
        const colRef = collection(this.db, 'pricingRules');
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty) {
          const rules: NamedPricingRule[] = [];
          snapshot.forEach((snap) => {
            rules.push({ id: snap.id, ...(snap.data() as Omit<NamedPricingRule, 'id'>) });
          });
          rules.sort((a, b) => b.priority - a.priority);
          this.setCachedRules(rules);
          return rules;
        }
      } catch (err) {
        console.warn('[PricingRulesService] Firestore query error, falling back to cache:', err);
      }
    }
    return this.getCachedRules().sort((a, b) => b.priority - a.priority);
  }

  public subscribeToRules(
    onUpdate: (rules: NamedPricingRule[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (this.isConfigured && this.db) {
      try {
        const colRef = collection(this.db, 'pricingRules');
        const q = query(colRef);
        return onSnapshot(
          q,
          (snapshot) => {
            const rules: NamedPricingRule[] = [];
            snapshot.forEach((snap) => {
              rules.push({ id: snap.id, ...(snap.data() as Omit<NamedPricingRule, 'id'>) });
            });
            rules.sort((a, b) => b.priority - a.priority);
            if (rules.length > 0) {
              this.setCachedRules(rules);
              onUpdate(rules);
            } else {
              // Respect explicit empty cache vs uninitialized first run
              const existing = this.getCachedRules().sort((a, b) => b.priority - a.priority);
              onUpdate(existing);
            }
          },
          (err) => {
            console.warn('[PricingRulesService] onSnapshot error:', err);
            onUpdate(this.getCachedRules().sort((a, b) => b.priority - a.priority));
            if (onError) onError(err);
          }
        );
      } catch (err) {
        console.warn('[PricingRulesService] subscribeToRules fallback:', err);
      }
    }

    onUpdate(this.getCachedRules().sort((a, b) => b.priority - a.priority));
    return () => {};
  }

  public async saveRule(rule: NamedPricingRule): Promise<NamedPricingRule> {
    const ruleId =
      rule.id ||
      `rule-${rule.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36)}`;

    const sanitizedRule: NamedPricingRule = {
      ...rule,
      id: ruleId,
      updatedAt: new Date().toISOString(),
      createdAt: rule.createdAt || new Date().toISOString(),
    };

    const current = this.getCachedRules();
    const existingIndex = current.findIndex((r) => r.id === ruleId);
    let updated: NamedPricingRule[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = sanitizedRule;
    } else {
      updated = [sanitizedRule, ...current];
    }
    updated.sort((a, b) => b.priority - a.priority);
    this.setCachedRules(updated);

    if (this.isConfigured && this.db) {
      try {
        const ruleRef = doc(this.db, 'pricingRules', ruleId);
        const payload = sanitizePayload(sanitizedRule);
        await setDoc(ruleRef, payload);
      } catch (err) {
        console.warn('[PricingRulesService] Firestore save error, kept in cache:', err);
      }
    }

    return sanitizedRule;
  }

  public async deleteRule(ruleId: string): Promise<void> {
    const current = this.getCachedRules();
    const updated = current.filter((r) => r.id !== ruleId);
    this.setCachedRules(updated);

    if (this.isConfigured && this.db) {
      try {
        const ruleRef = doc(this.db, 'pricingRules', ruleId);
        await deleteDoc(ruleRef);
      } catch (err) {
        console.warn('[PricingRulesService] Firestore delete error:', err);
      }
    }
  }

  public async resetToDefaults(): Promise<NamedPricingRule[]> {
    this.setCachedRules(DEFAULT_NAMED_PRICING_RULES);
    if (this.isConfigured && this.db) {
      try {
        for (const rule of DEFAULT_NAMED_PRICING_RULES) {
          const ruleRef = doc(this.db, 'pricingRules', rule.id);
          await setDoc(ruleRef, sanitizePayload(rule), { merge: true });
        }
      } catch (err) {
        console.warn('[PricingRulesService] Reset Firestore error:', err);
      }
    }
    return DEFAULT_NAMED_PRICING_RULES;
  }

  public async reorderRule(ruleId: string, direction: 'up' | 'down'): Promise<NamedPricingRule[]> {
    const current = [...this.getCachedRules()].sort((a, b) => b.priority - a.priority);
    const idx = current.findIndex((r) => r.id === ruleId);
    if (idx < 0) return current;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= current.length) return current;

    const tempPriority = current[idx].priority;
    current[idx].priority = current[targetIdx].priority;
    current[targetIdx].priority = tempPriority;

    if (current[idx].priority === current[targetIdx].priority) {
      if (direction === 'up') {
        current[idx].priority += 1;
      } else {
        current[idx].priority = Math.max(1, current[idx].priority - 1);
      }
    }

    current.sort((a, b) => b.priority - a.priority);
    this.setCachedRules(current);

    if (this.isConfigured && this.db) {
      try {
        await this.saveRule(current[idx]);
        await this.saveRule(current[targetIdx]);
      } catch (err) {
        console.warn('[PricingRulesService] Reorder Firestore error:', err);
      }
    }

    return current;
  }
}

/**
 * Resolves rule inheritance recursively.
 */
export function resolveRuleInheritance(
  rule: NamedPricingRule,
  allRules: NamedPricingRule[],
  visited: Set<string> = new Set<string>()
): NamedPricingRule {
  if (!rule.parentRuleId) {
    return { ...rule };
  }

  if (visited.has(rule.id)) {
    console.warn(`[PricingRules] Cycle detected in inheritance tree for rule: ${rule.id}`);
    return { ...rule };
  }

  const parentRule = allRules.find((r) => r.id === rule.parentRuleId);
  if (!parentRule) {
    return { ...rule };
  }

  const newVisited = new Set(visited);
  newVisited.add(rule.id);

  const resolvedParent = resolveRuleInheritance(parentRule, allRules, newVisited);

  const mergedTriggers: PricingRuleTrigger = {
    ...resolvedParent.triggers,
    ...rule.triggers,
    fromZoneId: rule.triggers.fromZoneId ?? resolvedParent.triggers.fromZoneId,
    toZoneId: rule.triggers.toZoneId ?? resolvedParent.triggers.toZoneId,
    zoneIds: rule.triggers.zoneIds?.length ? rule.triggers.zoneIds : resolvedParent.triggers.zoneIds,
    zoneGroupIds: rule.triggers.zoneGroupIds?.length
      ? rule.triggers.zoneGroupIds
      : resolvedParent.triggers.zoneGroupIds,
    locationCollectionIds: rule.triggers.locationCollectionIds?.length
      ? rule.triggers.locationCollectionIds
      : resolvedParent.triggers.locationCollectionIds,
    timeWindows: rule.triggers.timeWindows?.length
      ? rule.triggers.timeWindows
      : resolvedParent.triggers.timeWindows,
    daysOfWeek: rule.triggers.daysOfWeek?.length
      ? rule.triggers.daysOfWeek
      : resolvedParent.triggers.daysOfWeek,
    holidayDates: rule.triggers.holidayDates?.length
      ? rule.triggers.holidayDates
      : resolvedParent.triggers.holidayDates,
    accountTypes: rule.triggers.accountTypes?.length
      ? rule.triggers.accountTypes
      : resolvedParent.triggers.accountTypes,
    accountTags: rule.triggers.accountTags?.length
      ? rule.triggers.accountTags
      : resolvedParent.triggers.accountTags,
    vehicleTiers: rule.triggers.vehicleTiers?.length
      ? rule.triggers.vehicleTiers
      : resolvedParent.triggers.vehicleTiers,
    vehicleTypes: rule.triggers.vehicleTypes?.length
      ? rule.triggers.vehicleTypes
      : resolvedParent.triggers.vehicleTypes,
    vehicleClasses: rule.triggers.vehicleClasses?.length
      ? rule.triggers.vehicleClasses
      : resolvedParent.triggers.vehicleClasses,
    equipment: rule.triggers.equipment ?? resolvedParent.triggers.equipment,
    passengers: rule.triggers.passengers ?? resolvedParent.triggers.passengers,
  };

  const mergedModifier: PricingRuleModifier = {
    ...resolvedParent.modifier,
    ...rule.modifier,
    baseFareOverride:
      rule.modifier.overrideBaseFare === false
        ? resolvedParent.modifier.baseFareOverride
        : rule.modifier.baseFareOverride ?? resolvedParent.modifier.baseFareOverride,
    perMileRateOverride:
      rule.modifier.overrideRates === false
        ? resolvedParent.modifier.perMileRateOverride
        : rule.modifier.perMileRateOverride ?? resolvedParent.modifier.perMileRateOverride,
    perMinuteRateOverride:
      rule.modifier.overrideRates === false
        ? resolvedParent.modifier.perMinuteRateOverride
        : rule.modifier.perMinuteRateOverride ?? resolvedParent.modifier.perMinuteRateOverride,
    surchargeAdders:
      rule.modifier.overrideSurcharges === false
        ? resolvedParent.modifier.surchargeAdders
        : [
            ...(resolvedParent.modifier.surchargeAdders || []),
            ...(rule.modifier.surchargeAdders || []),
          ],
  };

  return {
    ...resolvedParent,
    ...rule,
    triggers: mergedTriggers,
    modifier: mergedModifier,
    stopProcessingOnMatch: rule.stopProcessingOnMatch ?? resolvedParent.stopProcessingOnMatch,
    allowDriverSelection: rule.allowDriverSelection ?? resolvedParent.allowDriverSelection,
  };
}

/**
 * Pure evaluation function for condition-based pricing rules.
 */
export function evaluateApplicablePricingRules(
  input: RuleEvaluationInput,
  rules: NamedPricingRule[]
): EvaluatedRulesSummary {
  const matchedRules: NamedPricingRule[] = [];
  const auditTrail: string[] = [];
  let stoppedProcessingByRule: NamedPricingRule | undefined = undefined;

  let dayOfWeek: number | undefined = undefined;
  const timeStr: string | undefined = input.pickupTime;

  if (input.pickupDate) {
    try {
      const parts = input.pickupDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        dayOfWeek = d.getDay();
      }
    } catch {
      // Ignore parse error
    }
  }

  if (input.selectedRuleId) {
    const rawRule = rules.find((r) => r.id === input.selectedRuleId && r.isActive);
    if (rawRule) {
      const manualRule = resolveRuleInheritance(rawRule, rules);
      matchedRules.push(manualRule);
      auditTrail.push(
        `Manual named rule selected: "${manualRule.name}" (${manualRule.modifier.type} = ${manualRule.modifier.value})`
      );
    }
  } else {
    const activeRules = rules.filter((r) => r.isActive).sort((a, b) => b.priority - a.priority);

    for (const rawRule of activeRules) {
      const rule = resolveRuleInheritance(rawRule, rules);
      const { triggers } = rule;
      let matches = true;

      const allTripZoneIds = [
        ...(input.zoneIds || []),
        ...(input.originZoneId ? [input.originZoneId] : []),
        ...(input.destinationZoneId ? [input.destinationZoneId] : []),
      ];

      // 0. Bidirectional Transfer check (e.g. Airport Transfer Rule)
      if (triggers.isBidirectionalTransfer) {
        const hasAnyZoneFilter =
          (triggers.zoneIds && triggers.zoneIds.length > 0) ||
          (triggers.zoneGroupIds && triggers.zoneGroupIds.length > 0);
        if (hasAnyZoneFilter) {
          let hasTransferMatch = false;
          if (triggers.zoneGroupIds && triggers.zoneGroupIds.length > 0) {
            if (input.zoneGroupIds?.some((gid) => triggers.zoneGroupIds!.includes(gid))) {
              hasTransferMatch = true;
            }
          }
          if (triggers.zoneIds && triggers.zoneIds.length > 0) {
            if (allTripZoneIds.some((zid) => triggers.zoneIds!.includes(zid))) {
              hasTransferMatch = true;
            }
          }
          if (
            (rule.id === 'rule-airport-transfer-flat' ||
              rule.modifier.targetTariffId === 'tariff-airport-flat') &&
            (input.isAirportPickup || input.isAirportDropoff || input.isAirportTrip)
          ) {
            hasTransferMatch = true;
          }
          if (!hasTransferMatch) {
            matches = false;
          }
        }
      }

      // 0b. Origin -> Destination Corridor check
      if (matches && triggers.fromZoneId) {
        const matchesOrigin =
          input.originZoneId === triggers.fromZoneId ||
          (input.zoneIds && input.zoneIds.length > 0 && input.zoneIds[0] === triggers.fromZoneId);
        if (!matchesOrigin) {
          matches = false;
        }
      }
      if (matches && triggers.toZoneId) {
        const matchesDest =
          input.destinationZoneId === triggers.toZoneId ||
          (input.zoneIds && input.zoneIds.length > 1 && input.zoneIds[1] === triggers.toZoneId) ||
          (input.zoneIds && input.zoneIds.includes(triggers.toZoneId));
        if (!matchesDest) {
          matches = false;
        }
      }

      // 1. Zone Geofence check (non-bidirectional)
      if (
        matches &&
        !triggers.isBidirectionalTransfer &&
        triggers.zoneIds &&
        triggers.zoneIds.length > 0
      ) {
        const hasZoneMatch = allTripZoneIds.some((zid) => triggers.zoneIds!.includes(zid));
        if (!hasZoneMatch) {
          matches = false;
        }
      }

      // 2. Zone Group check (non-bidirectional)
      if (
        matches &&
        !triggers.isBidirectionalTransfer &&
        triggers.zoneGroupIds &&
        triggers.zoneGroupIds.length > 0
      ) {
        const hasGroupMatch = input.zoneGroupIds?.some((gid) =>
          triggers.zoneGroupIds!.includes(gid)
        );
        if (!hasGroupMatch) {
          matches = false;
        }
      }

      // 3. Location Collection POI check
      if (matches && triggers.locationCollectionIds && triggers.locationCollectionIds.length > 0) {
        const hasCollMatch = input.locationCollectionIds?.some((cid) =>
          triggers.locationCollectionIds!.includes(cid)
        );
        if (!hasCollMatch) {
          matches = false;
        }
      }

      // 4. Distance range check
      if (matches && typeof triggers.minDistanceMiles === 'number') {
        if (input.distanceMiles < triggers.minDistanceMiles) {
          matches = false;
        }
      }
      if (matches && typeof triggers.maxDistanceMiles === 'number') {
        if (input.distanceMiles > triggers.maxDistanceMiles) {
          matches = false;
        }
      }

      // 5. Trip Duration range check
      if (
        matches &&
        typeof triggers.minDurationMinutes === 'number' &&
        input.durationMinutes !== undefined
      ) {
        if (input.durationMinutes < triggers.minDurationMinutes) {
          matches = false;
        }
      }
      if (
        matches &&
        typeof triggers.maxDurationMinutes === 'number' &&
        input.durationMinutes !== undefined
      ) {
        if (input.durationMinutes > triggers.maxDurationMinutes) {
          matches = false;
        }
      }

      // 6. Days of week check
      if (matches && triggers.daysOfWeek && triggers.daysOfWeek.length > 0) {
        if (dayOfWeek === undefined || !triggers.daysOfWeek.includes(dayOfWeek)) {
          matches = false;
        }
      }

      // 7. Time windows check
      if (matches && triggers.timeWindows && triggers.timeWindows.length > 0) {
        if (!timeStr) {
          matches = false;
        } else {
          const inWindow = triggers.timeWindows.some(
            (w) => timeStr >= w.start && timeStr <= w.end
          );
          if (!inWindow) matches = false;
        }
      }

      // 8. Holiday dates check
      if (matches && triggers.holidayDates && triggers.holidayDates.length > 0) {
        if (!input.pickupDate || !triggers.holidayDates.includes(input.pickupDate)) {
          matches = false;
        }
      }

      // 9. Account type check
      if (matches && triggers.accountTypes && triggers.accountTypes.length > 0) {
        if (!input.accountType || !triggers.accountTypes.includes(input.accountType)) {
          matches = false;
        }
      }

      // 10. Corporate account / Account tags check
      if (matches && triggers.accountTags && triggers.accountTags.length > 0) {
        const inputTags = new Set<string>([
          ...(input.accountTags || []),
          ...(input.corporateAccountId ? [input.corporateAccountId] : []),
        ]);
        const hasTagMatch = triggers.accountTags.some((tag) => inputTags.has(tag));
        if (!hasTagMatch) {
          matches = false;
        }
      }

      // 11. Unified Vehicle Match (empty array = matches ALL vehicles)
      const allowedVehicles = [
        ...(triggers.vehicleTypes || []),
        ...(triggers.vehicleTiers || []),
      ].filter(Boolean);
      if (matches && allowedVehicles.length > 0) {
        const vehicleMatched = doesVehicleMatchAllowedList(
          allowedVehicles,
          {
            vehicleTypeId: input.vehicleTypeId,
            vehicleType: input.vehicleType,
            vehicleTier: input.vehicleTier,
            vehicleClass: input.vehicleClass,
          },
          { allowAnyDispatch: false }
        );
        if (!vehicleMatched) {
          matches = false;
        }
      }

      // 11b. Service Class check (only when input explicitly provides vehicleClass)
      if (matches && triggers.vehicleClasses && triggers.vehicleClasses.length > 0 && input.vehicleClass) {
        if (!triggers.vehicleClasses.includes(input.vehicleClass)) {
          matches = false;
        }
      }

      // 12. Equipment filters check
      if (matches && triggers.equipment) {
        if (
          typeof triggers.equipment.minCarSeats === 'number' &&
          (input.equipment?.carSeats ?? 0) < triggers.equipment.minCarSeats
        ) {
          matches = false;
        }
        if (
          typeof triggers.equipment.minLuggage === 'number' &&
          (input.equipment?.luggageCount ?? 0) < triggers.equipment.minLuggage
        ) {
          matches = false;
        }
      }

      // 13. Passenger count filters check
      if (matches && triggers.passengers) {
        const passengerCount = input.passengers ?? 1;
        if (typeof triggers.passengers.min === 'number' && passengerCount < triggers.passengers.min) {
          matches = false;
        }
        if (typeof triggers.passengers.max === 'number' && passengerCount > triggers.passengers.max) {
          matches = false;
        }
      }

      if (matches) {
        matchedRules.push(rule);
        const parentNotice = rawRule.parentRuleId ? ` [↳ Inherits: ${rawRule.parentRuleId}]` : '';
        auditTrail.push(
          `Triggered Rule: "${rule.name}" (Priority ${rule.priority})${parentNotice} -> ${rule.modifier.type} ${rule.modifier.value}`
        );

        if (rule.stopProcessingOnMatch) {
          auditTrail.push(
            `Rule "${rule.name}" has [Stop Processing On Match] active. Skipping remaining lower-priority rules.`
          );
          stoppedProcessingByRule = rule;
          break;
        }
      }
    }
  }

  let flatOverride: number | undefined = undefined;
  let multiplier = 1.0;
  let surchargeFlat = 0;
  let surchargePercent = 0;
  let baseFareOverride: number | undefined = undefined;
  let perMileRateOverride: number | undefined = undefined;
  let perMinuteRateOverride: number | undefined = undefined;
  const surchargeAdders: import('../../types/config').RuleSurchargeAdder[] = [];
  let targetTariffId: string | undefined = undefined;
  let overruleExtras: Partial<import('../../types/config').UniversalExtrasConfig> | undefined =
    undefined;
  let overruleSurcharges: Partial<import('../../types/config').SurchargesConfig> | undefined =
    undefined;
  let layeredZoneFee = 0;

  for (const rule of matchedRules) {
    const {
      type,
      value,
      targetTariffId: tTariffId,
      baseFareOverride: bfo,
      perMileRateOverride: pmro,
      perMinuteRateOverride: ptmro,
      surchargeAdders: sAdders,
      overruleExtras: oExtras,
      overruleSurcharges: oSurcharges,
      layerZoneFee: lzFee,
    } = rule.modifier;

    if (tTariffId && !targetTariffId) {
      targetTariffId = tTariffId;
    }

    if (oExtras) {
      overruleExtras = { ...(overruleExtras || {}), ...oExtras };
    }

    if (oSurcharges) {
      overruleSurcharges = { ...(overruleSurcharges || {}), ...oSurcharges };
    }

    if (typeof lzFee === 'number' && lzFee > 0) {
      layeredZoneFee += lzFee;
    }

    if (type === 'flat_override') {
      if (flatOverride === undefined && typeof value === 'number' && value > 0) {
        flatOverride = value;
      }
    } else if (type === 'multiplier') {
      if (typeof value === 'number' && value > 0 && value !== 1) {
        multiplier *= value;
      }
    } else if (type === 'surcharge_flat') {
      if (typeof value === 'number' && value > 0) {
        surchargeFlat += value;
      }
    } else if (type === 'surcharge_percent') {
      if (typeof value === 'number' && value > 0) {
        surchargePercent += value;
      }
    }

    if (typeof bfo === 'number' && baseFareOverride === undefined) {
      baseFareOverride = bfo;
    }
    if (typeof pmro === 'number' && perMileRateOverride === undefined) {
      perMileRateOverride = pmro;
    }
    if (typeof ptmro === 'number' && perMinuteRateOverride === undefined) {
      perMinuteRateOverride = ptmro;
    }
    if (sAdders && sAdders.length > 0) {
      surchargeAdders.push(...sAdders);
    }
  }

  return {
    matchedRules,
    flatOverride,
    multiplier,
    surchargeFlat,
    surchargePercent,
    baseFareOverride,
    perMileRateOverride,
    perMinuteRateOverride,
    surchargeAdders,
    targetTariffId,
    overruleExtras,
    overruleSurcharges,
    layeredZoneFee,
    stoppedProcessingByRule,
    auditTrail,
  };
}

let pricingRulesServiceInstance: PricingRulesService | null = null;

export function getPricingRulesService(): PricingRulesService {
  if (!pricingRulesServiceInstance) {
    pricingRulesServiceInstance = new PricingRulesService();
  }
  return pricingRulesServiceInstance;
}
