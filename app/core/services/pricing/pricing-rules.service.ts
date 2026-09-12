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

const PRICING_RULES_STORAGE_KEY = 'chesterfield_taxi_pricing_rules';

export const DEFAULT_NAMED_PRICING_RULES: NamedPricingRule[] = [
  {
    id: 'rule-spirit-airport-corridor',
    name: 'Spirit Airport (SUS) Corporate Flat Corridor',
    description: 'Direct flat rate between Spirit of St. Louis Airport / Chesterfield Airport corridor and local district.',
    priority: 95,
    isActive: true,
    allowDriverSelection: true,
    triggers: {
      zoneIds: ['zone-spirit-airport', 'zone-chesterfield-valley'],
      maxDistanceMiles: 15,
    },
    modifier: {
      type: 'flat_override',
      value: 35.00,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'rule-lambert-terminal-drop',
    name: 'Lambert Airport (STL) Terminal Gate Fee',
    description: 'Mandatory commercial terminal fee adder for STL passenger drop-off and terminal curb arrivals.',
    priority: 90,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      zoneIds: ['zone-lambert-airport'],
    },
    modifier: {
      type: 'surcharge_flat',
      value: 5.00,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'rule-rush-hour-peak',
    name: 'Weekday Rush Hour Peak Commute',
    description: 'Automated 1.20x peak congestion rate during morning (07:00-09:30) and evening (16:30-18:30) business hours.',
    priority: 85,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      daysOfWeek: [1, 2, 3, 4, 5],
      timeWindows: [
        { start: '07:00', end: '09:30' },
        { start: '16:30', end: '18:30' },
      ],
    },
    modifier: {
      type: 'multiplier',
      value: 1.20,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'rule-late-night-safety',
    name: 'Late Night Weekend Safety Stipend',
    description: 'Special weekend driver incentive for midnight to 4 AM late-night safe passenger transit.',
    priority: 80,
    isActive: true,
    allowDriverSelection: true,
    triggers: {
      daysOfWeek: [0, 5, 6],
      timeWindows: [
        { start: '00:00', end: '04:00' },
        { start: '23:00', end: '23:59' },
      ],
    },
    modifier: {
      type: 'surcharge_flat',
      value: 8.00,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'rule-corporate-preferred',
    name: 'Corporate Preferred Account Rate',
    description: 'Exclusive 10% rate reduction for verified corporate direct bill accounts.',
    priority: 75,
    isActive: true,
    allowDriverSelection: true,
    triggers: {
      accountTypes: ['corporate'],
    },
    modifier: {
      type: 'multiplier',
      value: 0.90,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'rule-long-distance-highway',
    name: 'Long-Distance Regional Interstate Tier',
    description: 'Volume discount for continuous regional highway trips exceeding 30 miles.',
    priority: 70,
    isActive: true,
    allowDriverSelection: false,
    triggers: {
      minDistanceMiles: 30,
    },
    modifier: {
      type: 'multiplier',
      value: 0.88,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'rule-holiday-surge',
    name: 'Major Holiday Operations Surcharge',
    description: 'Flat holiday service adder for Thanksgiving, Christmas Eve/Day, and New Year Eve/Day.',
    priority: 88,
    isActive: true,
    allowDriverSelection: true,
    triggers: {
      holidayDates: [
        '2026-11-26', // Thanksgiving 2026
        '2026-12-24', // Christmas Eve 2026
        '2026-12-25', // Christmas Day 2026
        '2026-12-31', // New Year's Eve 2026
        '2027-01-01', // New Year's Day 2027
      ],
    },
    modifier: {
      type: 'surcharge_flat',
      value: 12.00,
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

export interface RuleEvaluationInput {
  distanceMiles: number;
  pickupDate?: string; // "YYYY-MM-DD"
  pickupTime?: string; // "HH:MM" 24h
  zoneIds?: string[];
  accountType?: 'retail' | 'corporate' | 'vip';
  vehicleTier?: string;
  selectedRuleId?: string;
}

export interface EvaluatedRulesSummary {
  matchedRules: NamedPricingRule[];
  flatOverride?: number;
  multiplier: number;
  surchargeFlat: number;
  surchargePercent: number;
  auditTrail: string[];
}

export class PricingRulesService {
  private isConfigured: boolean;
  private db: Firestore | null = null;

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
    if (typeof window === 'undefined') return DEFAULT_NAMED_PRICING_RULES;
    try {
      const raw = localStorage.getItem(PRICING_RULES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_NAMED_PRICING_RULES;
  }

  private setCachedRules(rules: NamedPricingRule[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PRICING_RULES_STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // Ignore storage errors
    }
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
            if (rules.length > 0) {
              rules.sort((a, b) => b.priority - a.priority);
              this.setCachedRules(rules);
              onUpdate(rules);
            } else {
              const cached = this.getCachedRules().sort((a, b) => b.priority - a.priority);
              onUpdate(cached);
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

    if (this.isConfigured && this.db) {
      try {
        const ruleRef = doc(this.db, 'pricingRules', ruleId);
        const payload = sanitizePayload(sanitizedRule);
        await setDoc(ruleRef, payload, { merge: true });
      } catch (err) {
        console.warn('[PricingRulesService] Firestore save error, saving to cache:', err);
      }
    }

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
    return sanitizedRule;
  }

  public async deleteRule(ruleId: string): Promise<void> {
    if (this.isConfigured && this.db) {
      try {
        const ruleRef = doc(this.db, 'pricingRules', ruleId);
        await deleteDoc(ruleRef);
      } catch (err) {
        console.warn('[PricingRulesService] Firestore delete error:', err);
      }
    }

    const current = this.getCachedRules();
    const updated = current.filter((r) => r.id !== ruleId);
    this.setCachedRules(updated);
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
}

/**
 * Pure evaluation function for condition-based pricing rules.
 * Runs with 0 side-effects.
 */
export function evaluateApplicablePricingRules(
  input: RuleEvaluationInput,
  rules: NamedPricingRule[]
): EvaluatedRulesSummary {
  const matchedRules: NamedPricingRule[] = [];
  const auditTrail: string[] = [];

  // Parse time and day of week
  let dayOfWeek: number | undefined = undefined;
  let timeStr: string | undefined = input.pickupTime;

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

  // If a specific rule is selected manually (e.g. by dispatcher or driver)
  if (input.selectedRuleId) {
    const manualRule = rules.find((r) => r.id === input.selectedRuleId && r.isActive);
    if (manualRule) {
      matchedRules.push(manualRule);
      auditTrail.push(`Manual named rule selected: "${manualRule.name}" (${manualRule.modifier.type} = ${manualRule.modifier.value})`);
    }
  } else {
    // Dynamic rule evaluation sorted by priority
    const activeRules = rules.filter((r) => r.isActive).sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      const { triggers } = rule;
      let matches = true;

      // 1. Zone Geofence check
      if (triggers.zoneIds && triggers.zoneIds.length > 0) {
        const hasZoneMatch = input.zoneIds?.some((zid) => triggers.zoneIds!.includes(zid));
        if (!hasZoneMatch) {
          matches = false;
        }
      }

      // 2. Distance range check
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

      // 3. Days of week check
      if (matches && triggers.daysOfWeek && triggers.daysOfWeek.length > 0) {
        if (dayOfWeek === undefined || !triggers.daysOfWeek.includes(dayOfWeek)) {
          matches = false;
        }
      }

      // 4. Time windows check
      if (matches && triggers.timeWindows && triggers.timeWindows.length > 0) {
        if (!timeStr) {
          matches = false;
        } else {
          const inWindow = triggers.timeWindows.some((w) => {
            return timeStr! >= w.start && timeStr! <= w.end;
          });
          if (!inWindow) matches = false;
        }
      }

      // 5. Holiday dates check
      if (matches && triggers.holidayDates && triggers.holidayDates.length > 0) {
        if (!input.pickupDate || !triggers.holidayDates.includes(input.pickupDate)) {
          matches = false;
        }
      }

      // 6. Account type check
      if (matches && triggers.accountTypes && triggers.accountTypes.length > 0) {
        if (!input.accountType || !triggers.accountTypes.includes(input.accountType)) {
          matches = false;
        }
      }

      // 7. Vehicle tier check
      if (matches && triggers.vehicleTiers && triggers.vehicleTiers.length > 0) {
        if (!input.vehicleTier || !triggers.vehicleTiers.includes(input.vehicleTier)) {
          matches = false;
        }
      }

      if (matches) {
        matchedRules.push(rule);
        auditTrail.push(`Triggered Rule: "${rule.name}" (Priority ${rule.priority}) -> ${rule.modifier.type} ${rule.modifier.value}`);
      }
    }
  }

  // Calculate cumulative effects:
  // Flat override takes precedence (highest priority rule with flat_override)
  let flatOverride: number | undefined = undefined;
  let multiplier = 1.0;
  let surchargeFlat = 0;
  let surchargePercent = 0;

  for (const rule of matchedRules) {
    const { type, value } = rule.modifier;
    if (type === 'flat_override') {
      if (flatOverride === undefined) {
        flatOverride = value;
      }
    } else if (type === 'multiplier') {
      multiplier *= value;
    } else if (type === 'surcharge_flat') {
      surchargeFlat += value;
    } else if (type === 'surcharge_percent') {
      surchargePercent += value;
    }
  }

  return {
    matchedRules,
    flatOverride,
    multiplier,
    surchargeFlat,
    surchargePercent,
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
