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
import type {
  NamedPricingRule,
  PricingRuleTrigger,
  PricingRuleModifier,
  RuleSurchargeAction,
  RuleExtraAction,
  RuleExtraTarget,
  RuleFareAdjustment,
} from '../../types/config';
import type { FirewallRuleTraceEntry } from './types';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { doesVehicleMatchAllowedList } from './vehicle-matching';
import { BUILTIN_SURCHARGE_IDS } from './surcharges.service';

const PRICING_RULES_STORAGE_KEY = 'chesterfield_taxi_pricing_rules';

export const DEFAULT_NAMED_PRICING_RULES: NamedPricingRule[] = [
  {
    id: 'rule-airport-transfer-flat',
    name: 'Airport Transfer Flat Rate (Lambert & Spirit)',
    description:
      'Applies Airport Flat Rate, attaches Airport Access Fee (when enabled), and waives Out-of-Area Remote Fee for STL & SUS airport transfers.',
    priority: 95,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      zoneMatchMode: 'any_end',
      isBidirectionalTransfer: true,
      isAirportOnly: true,
      zoneGroupIds: ['group-regional-aviation', 'group-airports'],
      zoneIds: ['zone-lambert-airport', 'zone-spirit-airport'],
    },
    modifier: {
      type: 'apply_tariff',
      value: 0,
      targetTariffId: 'tariff-airport-flat',
      surchargeActions: [
        { surchargeId: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS, action: 'apply' },
        { surchargeId: BUILTIN_SURCHARGE_IDS.REMOTE_AREA, action: 'waive' },
      ],
    },
  },
  {
    id: 'rule-suv-minivan-upgrade',
    name: 'SUV / Minivan Vehicle Upgrade',
    description: 'Applies the SUV / Minivan Upgrade Fee when a larger vehicle class is requested.',
    priority: 85,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      vehicleTypes: [
        'compact_suv',
        'midsize_suv',
        'minivan',
        'suv',
        'van',
        'xl',
        'wheelchair',
        'wheelchair_wav',
      ],
    },
    modifier: {
      type: 'apply_tariff',
      value: 0,
      surchargeActions: [
        { surchargeId: BUILTIN_SURCHARGE_IDS.SUV_MINIVAN_UPGRADE, action: 'apply' },
      ],
    },
  },
  {
    id: 'rule-remote-service-boundary',
    name: 'Out-of-Area Remote Service (> 15 mi)',
    description: 'Applies Out-of-Area Remote Service Fee for standard non-airport trips exceeding 15 miles.',
    priority: 70,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      minDistanceMiles: 15.01,
    },
    modifier: {
      type: 'apply_tariff',
      value: 0,
      surchargeActions: [
        { surchargeId: BUILTIN_SURCHARGE_IDS.REMOTE_AREA, action: 'apply' },
      ],
    },
  },
];

export interface RuleEvaluationInput {
  distanceMiles: number;
  durationMinutes?: number;
  pickupDate?: string; // "YYYY-MM-DD" (local wall-clock)
  pickupTime?: string; // "HH:MM" 24h
  zoneIds?: string[];
  originZoneIds?: string[];
  destinationZoneIds?: string[];
  originZoneId?: string;
  destinationZoneId?: string;
  isAirportPickup?: boolean;
  isAirportDropoff?: boolean;
  isAirportTrip?: boolean;
  isHourlyBooking?: boolean;
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
  carSeatsTotal?: number;
  passengers?: number;
}

export interface ResolvedSurchargeDirective extends RuleSurchargeAction {
  sourceRuleName: string;
  sourcePriority: number;
}

export interface ResolvedExtraDirective extends RuleExtraAction {
  sourceRuleName: string;
  sourcePriority: number;
}

export interface EvaluatedRulesSummary {
  matchedRules: NamedPricingRule[];
  ruleDecisions: FirewallRuleTraceEntry[];
  flatOverride?: number;
  multiplier: number;
  surchargeFlat: number;
  surchargePercent: number;
  discountFlat: number;
  discountPercent: number;
  baseFareOverride?: number;
  perMileRateOverride?: number;
  perMinuteRateOverride?: number;
  surchargeAdders?: import('../../types/config').RuleSurchargeAdder[];
  targetTariffId?: string;
  targetTariffRuleName?: string;
  resolvedSurchargeActions: Record<string, ResolvedSurchargeDirective>;
  resolvedExtraActions: Record<string, ResolvedExtraDirective>;
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
 * Evaluates whether a 24h "HH:MM" time string falls inside a window, including
 * overnight windows that wrap across midnight (e.g. "22:00" to "05:00").
 */
function isTimeInWindow(timeStr: string, start: string, end: string): boolean {
  if (start <= end) {
    return timeStr >= start && timeStr <= end;
  }
  // Overnight wrap (e.g. 22:00 -> 05:00)
  return timeStr >= start || timeStr <= end;
}

/**
 * Pure Firewall Evaluation function for condition-based pricing rules.
 * Evaluates active rules in strict top-down priority order (highest priority wins per target).
 */
export function evaluateApplicablePricingRules(
  input: RuleEvaluationInput,
  rules: NamedPricingRule[]
): EvaluatedRulesSummary {
  const matchedRules: NamedPricingRule[] = [];
  const ruleDecisions: FirewallRuleTraceEntry[] = [];
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

  const originZoneSet = new Set<string>([
    ...(input.originZoneIds || []),
    ...(input.originZoneId ? [input.originZoneId] : []),
  ]);
  const destZoneSet = new Set<string>([
    ...(input.destinationZoneIds || []),
    ...(input.destinationZoneId ? [input.destinationZoneId] : []),
  ]);
  const allTripZoneIds = Array.from(
    new Set<string>([
      ...(input.zoneIds || []),
      ...Array.from(originZoneSet),
      ...Array.from(destZoneSet),
    ])
  );
  const isAirportTrip = Boolean(
    input.isAirportPickup || input.isAirportDropoff || input.isAirportTrip
  );

  if (input.selectedRuleId) {
    const rawRule = rules.find((r) => r.id === input.selectedRuleId && r.isActive);
    if (rawRule) {
      const manualRule = resolveRuleInheritance(rawRule, rules);
      matchedRules.push(manualRule);
      ruleDecisions.push({
        ruleId: manualRule.id,
        ruleName: manualRule.name,
        priority: manualRule.priority,
        matched: true,
        reason: 'Manually selected by dispatcher/driver',
      });
      auditTrail.push(
        `Manual named rule selected: "${manualRule.name}" (Priority ${manualRule.priority})`
      );
    }
  } else {
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rawRule of sortedRules) {
      if (!rawRule.isActive) {
        ruleDecisions.push({
          ruleId: rawRule.id,
          ruleName: rawRule.name,
          priority: rawRule.priority,
          matched: false,
          reason: 'Rule disabled',
        });
        continue;
      }

      const rule = resolveRuleInheritance(rawRule, rules);
      const { triggers } = rule;
      let failReason: string | null = null;

      // 0a. Airport-only flag or legacy airport rule match
      const isLegacyAirportRule =
        rule.id === 'rule-airport-transfer-flat' ||
        (Boolean(triggers.isBidirectionalTransfer) &&
          rule.modifier.targetTariffId === 'tariff-airport-flat');

      if (!failReason && triggers.isAirportOnly) {
        const matchesAirportZone =
          Boolean(triggers.zoneIds?.some((zid) => allTripZoneIds.includes(zid))) ||
          Boolean(triggers.zoneGroupIds?.some((gid) => input.zoneGroupIds?.includes(gid)));
        if (!isAirportTrip && !matchesAirportZone) {
          failReason = 'Not an airport transfer';
        }
      }

      // 0b. Explicit Pickup / Dropoff / Corridor Zone Matching
      const mode = triggers.zoneMatchMode || (triggers.isBidirectionalTransfer ? 'any_end' : undefined);

      if (!failReason && triggers.pickupZoneIds && triggers.pickupZoneIds.length > 0) {
        const hitPickup = triggers.pickupZoneIds.some(
          (z) => originZoneSet.has(z) || (originZoneSet.size === 0 && input.zoneIds?.[0] === z)
        );
        if (!hitPickup) {
          failReason = 'Pickup outside required zone(s)';
        }
      }

      if (!failReason && triggers.dropoffZoneIds && triggers.dropoffZoneIds.length > 0) {
        const hitDropoff = triggers.dropoffZoneIds.some(
          (z) =>
            destZoneSet.has(z) ||
            (destZoneSet.size === 0 && input.zoneIds && input.zoneIds[1] === z)
        );
        if (!hitDropoff) {
          failReason = 'Dropoff outside required zone(s)';
        }
      }

      // Legacy Corridor fromZoneId -> toZoneId
      if (!failReason && triggers.fromZoneId) {
        const matchesOrigin =
          originZoneSet.has(triggers.fromZoneId) ||
          (originZoneSet.size === 0 && input.zoneIds?.[0] === triggers.fromZoneId);
        if (!matchesOrigin) {
          failReason = 'Origin zone did not match corridor';
        }
      }
      if (!failReason && triggers.toZoneId) {
        const matchesDest =
          destZoneSet.has(triggers.toZoneId) ||
          (destZoneSet.size === 0 && input.zoneIds?.includes(triggers.toZoneId));
        if (!matchesDest) {
          failReason = 'Destination zone did not match corridor';
        }
      }

      // 1. Zone / Zone Group check (respects zoneMatchMode: pickup_only, dropoff_only, any_end)
      const hasZoneIds = Boolean(triggers.zoneIds && triggers.zoneIds.length > 0);
      const hasZoneGroups = Boolean(triggers.zoneGroupIds && triggers.zoneGroupIds.length > 0);
      if (!failReason && (hasZoneIds || hasZoneGroups) && !triggers.isAirportOnly) {
        let hit = false;
        if (mode === 'pickup_only') {
          hit = Boolean(hasZoneIds && triggers.zoneIds!.some((zid) => originZoneSet.has(zid)));
        } else if (mode === 'dropoff_only') {
          hit = Boolean(hasZoneIds && triggers.zoneIds!.some((zid) => destZoneSet.has(zid)));
        } else {
          if (hasZoneIds && allTripZoneIds.some((zid) => triggers.zoneIds!.includes(zid))) {
            hit = true;
          }
          if (hasZoneGroups && input.zoneGroupIds?.some((gid) => triggers.zoneGroupIds!.includes(gid))) {
            hit = true;
          }
        }
        if (!hit && isLegacyAirportRule && isAirportTrip) {
          hit = true;
        }
        if (!hit) {
          failReason = 'Route outside target zone(s)';
        }
      }

      // 2. Location Collection POI check
      if (!failReason && triggers.locationCollectionIds && triggers.locationCollectionIds.length > 0) {
        const hasCollMatch = input.locationCollectionIds?.some((cid) =>
          triggers.locationCollectionIds!.includes(cid)
        );
        if (!hasCollMatch) {
          failReason = 'Route outside location collection';
        }
      }

      // 3. Hourly booking check
      if (!failReason && triggers.isHourlyBooking !== undefined) {
        if (Boolean(input.isHourlyBooking) !== triggers.isHourlyBooking) {
          failReason = triggers.isHourlyBooking ? 'Requires hourly charter' : 'Excludes hourly charter';
        }
      }

      // 4. Distance range check
      if (!failReason && typeof triggers.minDistanceMiles === 'number') {
        if (input.distanceMiles < triggers.minDistanceMiles) {
          failReason = `Distance ${input.distanceMiles.toFixed(1)} mi < min ${triggers.minDistanceMiles} mi`;
        }
      }
      if (!failReason && typeof triggers.maxDistanceMiles === 'number') {
        if (input.distanceMiles > triggers.maxDistanceMiles) {
          failReason = `Distance ${input.distanceMiles.toFixed(1)} mi > max ${triggers.maxDistanceMiles} mi`;
        }
      }

      // 5. Trip Duration range check
      if (
        !failReason &&
        typeof triggers.minDurationMinutes === 'number' &&
        input.durationMinutes !== undefined
      ) {
        if (input.durationMinutes < triggers.minDurationMinutes) {
          failReason = `Duration ${input.durationMinutes} min < min ${triggers.minDurationMinutes} min`;
        }
      }
      if (
        !failReason &&
        typeof triggers.maxDurationMinutes === 'number' &&
        input.durationMinutes !== undefined
      ) {
        if (input.durationMinutes > triggers.maxDurationMinutes) {
          failReason = `Duration ${input.durationMinutes} min > max ${triggers.maxDurationMinutes} min`;
        }
      }

      // 6. Days of week check (fail-closed when date missing)
      if (!failReason && triggers.daysOfWeek && triggers.daysOfWeek.length > 0) {
        if (dayOfWeek === undefined || !triggers.daysOfWeek.includes(dayOfWeek)) {
          failReason = dayOfWeek === undefined ? 'No pickup date provided' : 'Day of week did not match';
        }
      }

      // 7. Time windows check (fail-closed + supports overnight wrap e.g. 22:00-05:00)
      if (!failReason && triggers.timeWindows && triggers.timeWindows.length > 0) {
        if (!timeStr) {
          failReason = 'No pickup time provided';
        } else {
          const inWindow = triggers.timeWindows.some((w) => isTimeInWindow(timeStr, w.start, w.end));
          if (!inWindow) {
            failReason = `Time ${timeStr} outside schedule window`;
          }
        }
      }

      // 8. Holiday dates check
      if (!failReason && triggers.holidayDates && triggers.holidayDates.length > 0) {
        if (!input.pickupDate || !triggers.holidayDates.includes(input.pickupDate)) {
          failReason = 'Not a configured holiday date';
        }
      }

      // 9. Account type check
      if (!failReason && triggers.accountTypes && triggers.accountTypes.length > 0) {
        if (!input.accountType || !triggers.accountTypes.includes(input.accountType)) {
          failReason = 'Account type did not match';
        }
      }

      // 10. Corporate account / Account tags check
      if (!failReason && triggers.accountTags && triggers.accountTags.length > 0) {
        const inputTags = new Set<string>([
          ...(input.accountTags || []),
          ...(input.corporateAccountId ? [input.corporateAccountId] : []),
        ]);
        const hasTagMatch = triggers.accountTags.some((tag) => inputTags.has(tag));
        if (!hasTagMatch) {
          failReason = 'Corporate account did not match';
        }
      }

      // 11. Unified Vehicle Match (empty array = matches ALL vehicles)
      const allowedVehicles = [
        ...(triggers.vehicleTypes || []),
        ...(triggers.vehicleTiers || []),
      ].filter(Boolean);
      if (!failReason && allowedVehicles.length > 0) {
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
          failReason = 'Vehicle class did not match';
        }
      }

      // 11b. Service Class check (only when input explicitly provides vehicleClass)
      if (
        !failReason &&
        triggers.vehicleClasses &&
        triggers.vehicleClasses.length > 0 &&
        input.vehicleClass
      ) {
        if (!triggers.vehicleClasses.includes(input.vehicleClass)) {
          failReason = 'Service class did not match';
        }
      }

      // 12. Equipment filters check (checks BOTH carSeatsTotal and equipment.carSeats)
      if (!failReason && triggers.equipment) {
        const seatsCount = input.carSeatsTotal ?? input.equipment?.carSeats ?? 0;
        if (
          typeof triggers.equipment.minCarSeats === 'number' &&
          seatsCount < triggers.equipment.minCarSeats
        ) {
          failReason = `Car seats ${seatsCount} < min ${triggers.equipment.minCarSeats}`;
        }
        if (
          !failReason &&
          typeof triggers.equipment.minLuggage === 'number' &&
          (input.equipment?.luggageCount ?? 0) < triggers.equipment.minLuggage
        ) {
          failReason = `Luggage ${input.equipment?.luggageCount ?? 0} < min ${triggers.equipment.minLuggage}`;
        }
      }

      // 13. Passenger count filters check
      if (!failReason && triggers.passengers) {
        const passengerCount = input.passengers ?? 1;
        if (typeof triggers.passengers.min === 'number' && passengerCount < triggers.passengers.min) {
          failReason = `Passengers ${passengerCount} < min ${triggers.passengers.min}`;
        }
        if (
          !failReason &&
          typeof triggers.passengers.max === 'number' &&
          passengerCount > triggers.passengers.max
        ) {
          failReason = `Passengers ${passengerCount} > max ${triggers.passengers.max}`;
        }
      }

      if (!failReason) {
        matchedRules.push(rule);
        const parentNotice = rawRule.parentRuleId ? ` [Inherits: ${rawRule.parentRuleId}]` : '';
        auditTrail.push(`Matched Rule: "${rule.name}" (P${rule.priority})${parentNotice}`);
        ruleDecisions.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          matched: true,
          reason: 'All conditions matched',
          stoppedAfter: Boolean(rule.stopProcessingOnMatch),
        });

        if (rule.stopProcessingOnMatch) {
          auditTrail.push(
            `Rule "${rule.name}" stopped further lower-priority rule evaluation.`
          );
          stoppedProcessingByRule = rule;
          break;
        }
      } else {
        ruleDecisions.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          matched: false,
          reason: failReason,
        });
      }
    }
  }

  let flatOverride: number | undefined = undefined;
  let multiplier = 1.0;
  let surchargeFlat = 0;
  let surchargePercent = 0;
  let discountFlat = 0;
  let discountPercent = 0;
  let baseFareOverride: number | undefined = undefined;
  let perMileRateOverride: number | undefined = undefined;
  let perMinuteRateOverride: number | undefined = undefined;
  const surchargeAdders: import('../../types/config').RuleSurchargeAdder[] = [];
  let targetTariffId: string | undefined = undefined;
  let targetTariffRuleName: string | undefined = undefined;
  const resolvedSurchargeActions: Record<string, ResolvedSurchargeDirective> = {};
  const resolvedExtraActions: Record<string, ResolvedExtraDirective> = {};
  let overruleExtras: Partial<import('../../types/config').UniversalExtrasConfig> | undefined =
    undefined;
  let overruleSurcharges: Partial<import('../../types/config').SurchargesConfig> | undefined =
    undefined;
  let layeredZoneFee = 0;

  // Iterate highest-priority first: FIRST matching rule wins per target (strict firewall precedence!)
  for (const rule of matchedRules) {
    const {
      type,
      value,
      targetTariffId: tTariffId,
      surchargeActions,
      extraActions,
      fareAdjustment,
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
      targetTariffRuleName = rule.name;
    }

    // 1. Firewall v2 Surcharge Directives (highest priority wins per surchargeId)
    if (Array.isArray(surchargeActions)) {
      for (const act of surchargeActions) {
        if (!act.surchargeId) continue;
        if (!resolvedSurchargeActions[act.surchargeId]) {
          resolvedSurchargeActions[act.surchargeId] = {
            ...act,
            sourceRuleName: rule.name,
            sourcePriority: rule.priority,
          };
        }
      }
    }

    // 2. Translate legacy overruleSurcharges into firewall directives (highest priority wins!)
    if (oSurcharges) {
      overruleSurcharges = { ...oSurcharges, ...(overruleSurcharges || {}) };
      if (oSurcharges.waiveFuelSurcharge && !resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.FUEL]) {
        resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.FUEL] = {
          surchargeId: BUILTIN_SURCHARGE_IDS.FUEL,
          action: 'waive',
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      } else if (
        oSurcharges.isFuelSurchargeActive &&
        !resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.FUEL]
      ) {
        resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.FUEL] = {
          surchargeId: BUILTIN_SURCHARGE_IDS.FUEL,
          action: oSurcharges.fuelSurchargeAmount !== undefined ? 'override' : 'apply',
          overrideAmount: oSurcharges.fuelSurchargeAmount,
          overrideMode: oSurcharges.fuelSurchargeType,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }

      if (oSurcharges.waiveAirportFee && !resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS]) {
        resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS] = {
          surchargeId: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS,
          action: 'waive',
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      } else if (
        typeof oSurcharges.airportGateFee === 'number' &&
        oSurcharges.airportGateFee > 0 &&
        !resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS]
      ) {
        resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS] = {
          surchargeId: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS,
          action: 'override',
          overrideAmount: oSurcharges.airportGateFee,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }

      if (oSurcharges.waiveRemoteFee && !resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.REMOTE_AREA]) {
        resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.REMOTE_AREA] = {
          surchargeId: BUILTIN_SURCHARGE_IDS.REMOTE_AREA,
          action: 'waive',
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      } else if (
        typeof oSurcharges.outOfAreaRemoteFee === 'number' &&
        oSurcharges.outOfAreaRemoteFee > 0 &&
        !resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.REMOTE_AREA]
      ) {
        resolvedSurchargeActions[BUILTIN_SURCHARGE_IDS.REMOTE_AREA] = {
          surchargeId: BUILTIN_SURCHARGE_IDS.REMOTE_AREA,
          action: 'override',
          overrideAmount: oSurcharges.outOfAreaRemoteFee,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }
    }

    // 3. Firewall v2 Extra Directives (highest priority wins per extraKey)
    if (Array.isArray(extraActions)) {
      for (const act of extraActions) {
        if (!act.extraKey) continue;
        if (!resolvedExtraActions[act.extraKey]) {
          resolvedExtraActions[act.extraKey] = {
            ...act,
            sourceRuleName: rule.name,
            sourcePriority: rule.priority,
          };
        }
      }
    }

    // 4. Translate legacy overruleExtras into firewall extra directives (highest priority wins!)
    if (oExtras) {
      overruleExtras = { ...oExtras, ...(overruleExtras || {}) };
      if (oExtras.waiveCarSeatFee && !resolvedExtraActions.car_seat) {
        resolvedExtraActions.car_seat = {
          extraKey: 'car_seat',
          action: 'waive',
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      } else if (typeof oExtras.carSeatFeePerUnit === 'number' && !resolvedExtraActions.car_seat) {
        resolvedExtraActions.car_seat = {
          extraKey: 'car_seat',
          action: oExtras.carSeatFeePerUnit === 0 ? 'waive' : 'override',
          overrideAmount: oExtras.carSeatFeePerUnit,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }

      if (oExtras.waiveExtraPaxFee && !resolvedExtraActions.extra_passenger) {
        resolvedExtraActions.extra_passenger = {
          extraKey: 'extra_passenger',
          action: 'waive',
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      } else if (
        typeof oExtras.extraPassengerFeePerHead === 'number' &&
        !resolvedExtraActions.extra_passenger
      ) {
        resolvedExtraActions.extra_passenger = {
          extraKey: 'extra_passenger',
          action: oExtras.extraPassengerFeePerHead === 0 ? 'waive' : 'override',
          overrideAmount: oExtras.extraPassengerFeePerHead,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }

      if (
        typeof oExtras.intermediateStopFee === 'number' &&
        !resolvedExtraActions.intermediate_stop
      ) {
        resolvedExtraActions.intermediate_stop = {
          extraKey: 'intermediate_stop',
          action: oExtras.intermediateStopFee === 0 ? 'waive' : 'override',
          overrideAmount: oExtras.intermediateStopFee,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }

      const curbOverride = oExtras.curbWaitingRatePerMinute ?? oExtras.waitingRatePerMinute;
      if (typeof curbOverride === 'number' && !resolvedExtraActions.curb_wait) {
        resolvedExtraActions.curb_wait = {
          extraKey: 'curb_wait',
          action: curbOverride === 0 ? 'waive' : 'override',
          overrideAmount: curbOverride,
          sourceRuleName: rule.name,
          sourcePriority: rule.priority,
        };
      }
    }

    // 5. Base Fare Adjustment (new clean fareAdjustment OR legacy modifier.type)
    if (fareAdjustment && typeof fareAdjustment.value === 'number') {
      if (fareAdjustment.type === 'flat_override' && flatOverride === undefined && fareAdjustment.value > 0) {
        flatOverride = fareAdjustment.value;
      } else if (fareAdjustment.type === 'multiplier' && fareAdjustment.value > 0 && fareAdjustment.value !== 1) {
        multiplier *= fareAdjustment.value;
      } else if (fareAdjustment.type === 'discount_percent' && fareAdjustment.value > 0) {
        discountPercent += fareAdjustment.value;
      } else if (fareAdjustment.type === 'discount_flat' && fareAdjustment.value > 0) {
        discountFlat += fareAdjustment.value;
      }
    } else {
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
    ruleDecisions,
    flatOverride,
    multiplier,
    surchargeFlat,
    surchargePercent,
    discountFlat,
    discountPercent,
    baseFareOverride,
    perMileRateOverride,
    perMinuteRateOverride,
    surchargeAdders,
    targetTariffId,
    targetTariffRuleName,
    resolvedSurchargeActions,
    resolvedExtraActions,
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
