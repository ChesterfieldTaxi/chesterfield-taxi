/**
 * Pricing Configuration & Surcharge Enable/Disable Audit Trail Models (Phase 48)
 *
 * Security Invariant:
 * - Public pricing documents (`/pricingConfig/*`, `/tariffs/*`, `/pricingRules/*`) are
 *   world-readable (`allow read: if true;`) so guest booking flows can compute fares.
 * - Operator emails, names, UIDs, and operational audit notes MUST NEVER be stored in
 *   `/pricingConfig/*`.
 * - Full `PricingAuditEvent` records are persisted exclusively in `/config/pricingAuditLog`,
 *   which is restricted to authenticated staff (`isDispatcher()`) in `firestore.rules`.
 */

export type PricingAuditPillar = 'surcharges' | 'rates' | 'rules' | 'extras';

export type PricingAuditAction =
  | 'surcharge_enabled'
  | 'surcharge_disabled'
  | 'surcharge_created'
  | 'surcharge_updated'
  | 'surcharge_deleted'
  | 'surcharge_legacy_migrated'
  | 'tariff_created'
  | 'tariff_updated'
  | 'tariff_deleted'
  | 'rule_enabled'
  | 'rule_disabled'
  | 'rule_created'
  | 'rule_updated'
  | 'rule_deleted'
  | 'extras_updated';

export interface PricingFieldDiff {
  field: string;
  label: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface PricingAuditEvent {
  id: string;
  timestamp: string; // ISO 8601
  timestampMs: number;
  pillar: PricingAuditPillar;
  action: PricingAuditAction;
  targetId: string;
  targetName: string;
  summary: string;
  note?: string;
  activeDurationMinutes?: number;
  enabledSince?: string;
  diffs: PricingFieldDiff[];
  operatorId: string;
  operatorName: string;
  operatorEmail: string;
  operatorRole?: string;
}

export interface PricingAuditActor {
  operatorId: string;
  operatorName: string;
  operatorEmail: string;
  operatorRole?: string;
}

export interface PricingAuditLogDocument {
  events: PricingAuditEvent[];
  updatedAt: string;
}

export interface SurchargeProvenanceEntry {
  surchargeId: string;
  latestToggleEvent?: PricingAuditEvent;
  latestUpdateEvent?: PricingAuditEvent;
  latestEvent?: PricingAuditEvent;
}

export type PricingAuditFilterMode =
  | 'all'
  | 'surcharges_on_off'
  | 'surcharges'
  | 'rates'
  | 'rules'
  | 'extras';
