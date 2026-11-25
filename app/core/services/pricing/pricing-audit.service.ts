/**
 * Pricing Configuration & Surcharge Enable/Disable Audit Service (Phase 48)
 *
 * Provides:
 * 1. Pure deterministic diff calculators across all 4 pricing pillars:
 *    - `diffSurchargesConfig` (with `activeDurationMinutes` & `enabledSince` on `surcharge_disabled`)
 *    - `diffTariffChange`
 *    - `diffPricingRuleChange` (with `activeDurationMinutes` & `enabledSince` on `rule_disabled`)
 *    - `diffUniversalExtrasChange`
 * 2. Pure formatting & RFC-4180 CSV export utilities:
 *    - `formatActiveDuration`
 *    - `exportPricingAuditCsv`
 *    - `getLatestSurchargeStatusMap`
 *    - `toConfigAuditEntries`
 * 3. Staff-only persistence & real-time sync (`PricingAuditService`):
 *    - Persists in `/config/pricingAuditLog` (restricted to `isDispatcher()` in `firestore.rules`)
 *      plus `localStorage` (`ct_pricing_audit_log_v1`), capped to the latest 500 events.
 *    - Zero operator PII or audit notes are ever written to public `/pricingConfig/*`.
 */

import { doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import type {
  ConfigAuditEntry,
  NamedPricingRule,
  PricingRuleModifier,
  PricingRuleTrigger,
  RuleExtraAction,
  RuleSurchargeAction,
  SurchargeCalcMode,
  SurchargeCatalogItem,
  SurchargesConfig,
  UniversalExtrasConfig,
} from '../../types/config';
import { DEFAULT_OVERSIZED_BAG_CATEGORIES } from '../../types/config';
import type { TariffProfile } from '../../types/tariff';
import type {
  PricingAuditAction,
  PricingAuditActor,
  PricingAuditEvent,
  PricingAuditLogDocument,
  PricingAuditPillar,
  PricingFieldDiff,
  SurchargeProvenanceEntry,
} from '../../types/pricing-audit';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { getAdminAuthService } from '../auth/admin-auth.service';
import { getSurchargeCatalogItems } from './surcharges.service';
import { normalizeTariffProfile } from './tariff.service';
import { getRoleColumn } from './zip-matrix-schema.service';

export const PRICING_AUDIT_STORAGE_KEY = 'ct_pricing_audit_log_v1';
export const MAX_PRICING_AUDIT_EVENTS = 500;

let auditEventSeq = 0;

function generateAuditEventId(prefix: string, timestampMs: number): string {
  auditEventSeq = (auditEventSeq + 1) % 1_000_000;
  return `paud-${prefix}-${timestampMs.toString(36)}-${auditEventSeq.toString(36)}`;
}

function parseTimestamp(nowIso?: string): { iso: string; ms: number } {
  if (nowIso) {
    const parsed = Date.parse(nowIso);
    if (Number.isFinite(parsed)) {
      return { iso: new Date(parsed).toISOString(), ms: parsed };
    }
  }
  const ms = Date.now();
  return { iso: new Date(ms).toISOString(), ms };
}

function normalizeOptionalNote(note?: string): string | undefined {
  if (typeof note !== 'string') return undefined;
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function formatSurchargeValue(
  item: Pick<SurchargeCatalogItem, 'mode' | 'amount'>
): string {
  const amt = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : 0;
  if (item.mode === 'multiplier') return `${amt.toFixed(2)}×`;
  if (item.mode === 'percent') return `+${amt}%`;
  if (item.mode === 'per_mile') return `$${amt.toFixed(2)}/mi`;
  return `$${amt.toFixed(2)}`;
}

/**
 * Formats an active duration in minutes into a concise operational string
 * (e.g. `< 1m`, `42m`, `2h 16m`, `3d 4h`).
 */
export function formatActiveDuration(minutes?: number): string {
  if (minutes === undefined || minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return '';
  }
  const rounded = Math.round(minutes);
  if (rounded < 1) return '< 1m';
  if (rounded < 60) return `${rounded}m`;
  if (rounded < 1440) {
    const hours = Math.floor(rounded / 60);
    const remMinutes = rounded % 60;
    return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(rounded / 1440);
  const remHours = Math.floor((rounded % 1440) / 60);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function resolveEventTimestampMs(ev: Pick<PricingAuditEvent, 'timestamp' | 'timestampMs'>): number {
  if (typeof ev.timestampMs === 'number' && Number.isFinite(ev.timestampMs)) {
    return ev.timestampMs;
  }
  const parsed = Date.parse(ev.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findMostRecentPriorEnabledEvent(
  existingEvents: PricingAuditEvent[],
  targetId: string,
  enabledAction: 'surcharge_enabled' | 'rule_enabled',
  createdAction: 'surcharge_created' | 'rule_created',
  nowMs: number
): PricingAuditEvent | null {
  if (!Array.isArray(existingEvents) || existingEvents.length === 0) return null;

  let bestEnabled: PricingAuditEvent | null = null;
  let bestEnabledMs = -1;

  for (const ev of existingEvents) {
    if (ev.targetId !== targetId) continue;
    const evMs = resolveEventTimestampMs(ev);
    if (evMs > nowMs) continue;

    if (ev.action === enabledAction && evMs > bestEnabledMs) {
      bestEnabled = ev;
      bestEnabledMs = evMs;
    }
  }

  if (bestEnabled) return bestEnabled;

  // Fallback: if the item was created already enabled and never explicitly toggled on afterward
  for (const ev of existingEvents) {
    if (ev.targetId !== targetId || ev.action !== createdAction) continue;
    const evMs = resolveEventTimestampMs(ev);
    if (evMs > nowMs) continue;
    const wasCreatedEnabled = ev.diffs?.some(
      (d) => (d.field === 'enabled' || d.field === 'isActive') && d.after === true
    );
    if (wasCreatedEnabled && evMs > bestEnabledMs) {
      bestEnabled = ev;
      bestEnabledMs = evMs;
    }
  }

  return bestEnabled;
}

export function resolveCurrentPricingAuditActor(
  override?: Partial<PricingAuditActor> | null
): PricingAuditActor {
  let base: PricingAuditActor = {
    operatorId: 'staff-admin',
    operatorName: 'Admin Operator',
    operatorEmail: 'admin@chesterfieldtaxi.com',
    operatorRole: 'admin',
  };

  try {
    const user = getAdminAuthService().getCurrentUser();
    if (user) {
      const email = user.email || 'dispatch@chesterfieldtaxi.com';
      const fallbackName = email.includes('@') ? email.split('@')[0] : 'Staff Operator';
      base = {
        operatorId: user.uid || email,
        operatorName: user.displayName || fallbackName,
        operatorEmail: email,
        operatorRole: user.role || user.roles?.[0] || 'admin',
      };
    }
  } catch {
    // Safe fallback in Node test environments or unconfigured contexts
  }

  if (!override) return base;
  return {
    operatorId: override.operatorId || base.operatorId,
    operatorName: override.operatorName || base.operatorName,
    operatorEmail: override.operatorEmail || base.operatorEmail,
    operatorRole: override.operatorRole ?? base.operatorRole,
  };
}

function buildAuditEvent(params: {
  prefix: string;
  nowIso?: string;
  pillar: PricingAuditPillar;
  action: PricingAuditAction;
  targetId: string;
  targetName: string;
  summary: string;
  note?: string;
  activeDurationMinutes?: number;
  enabledSince?: string;
  diffs: PricingFieldDiff[];
  actor?: Partial<PricingAuditActor>;
}): PricingAuditEvent {
  const { iso, ms } = parseTimestamp(params.nowIso);
  const actor = getPricingAuditService().resolveActor(params.actor);
  const cleanNote = normalizeOptionalNote(params.note);

  return {
    id: generateAuditEventId(params.prefix, ms),
    timestamp: iso,
    timestampMs: ms,
    pillar: params.pillar,
    action: params.action,
    targetId: params.targetId,
    targetName: params.targetName,
    summary: params.summary,
    ...(cleanNote ? { note: cleanNote } : {}),
    ...(params.activeDurationMinutes !== undefined
      ? { activeDurationMinutes: params.activeDurationMinutes }
      : {}),
    ...(params.enabledSince ? { enabledSince: params.enabledSince } : {}),
    diffs: params.diffs,
    operatorId: actor.operatorId,
    operatorName: actor.operatorName,
    operatorEmail: actor.operatorEmail,
    ...(actor.operatorRole ? { operatorRole: actor.operatorRole } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Surcharges Catalog Diff Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffSurchargesOptions {
  note?: string;
  noteForSurchargeId?: string;
  notesBySurchargeId?: Record<string, string>;
  nowIso?: string;
  actor?: Partial<PricingAuditActor>;
  isLegacyMigration?: boolean;
}

export function diffSurchargesConfig(
  prev: SurchargesConfig,
  next: SurchargesConfig,
  existingEvents: PricingAuditEvent[] = [],
  options?: DiffSurchargesOptions
): PricingAuditEvent[] {
  const { iso, ms: nowMs } = parseTimestamp(options?.nowIso);
  const prevItems = getSurchargeCatalogItems(prev);
  const nextItems = getSurchargeCatalogItems(next);

  const prevMap = new Map<string, SurchargeCatalogItem>(prevItems.map((i) => [i.id, i]));
  const nextMap = new Map<string, SurchargeCatalogItem>(nextItems.map((i) => [i.id, i]));

  const resolveNoteForItem = (surchargeId: string): string | undefined => {
    const mapped = options?.notesBySurchargeId?.[surchargeId];
    if (typeof mapped === 'string' && mapped.trim()) {
      return mapped.trim();
    }
    if (
      options?.note &&
      options.note.trim() &&
      (!options.noteForSurchargeId || options.noteForSurchargeId === surchargeId)
    ) {
      return options.note.trim();
    }
    return undefined;
  };

  const emitted: PricingAuditEvent[] = [];

  // Check created & updated/toggled items in catalog order
  for (const nextItem of nextItems) {
    const prevItem = prevMap.get(nextItem.id);
    const itemNote = resolveNoteForItem(nextItem.id);

    if (!prevItem) {
      const diffs: PricingFieldDiff[] = [
        { field: 'enabled', label: 'Enabled', before: null, after: nextItem.enabled },
        { field: 'amount', label: 'Amount', before: null, after: formatSurchargeValue(nextItem) },
        { field: 'mode', label: 'Calculation Mode', before: null, after: nextItem.mode },
        {
          field: 'defaultPolicy',
          label: 'Default Policy',
          before: null,
          after: nextItem.defaultPolicy,
        },
      ];
      if (nextItem.description) {
        diffs.push({
          field: 'description',
          label: 'Description',
          before: null,
          after: nextItem.description,
        });
      }

      emitted.push(
        buildAuditEvent({
          prefix: 'sur',
          nowIso: iso,
          pillar: 'surcharges',
          action: 'surcharge_created',
          targetId: nextItem.id,
          targetName: nextItem.name,
          summary: `Created surcharge ${nextItem.name} (${formatSurchargeValue(nextItem)})`,
          note: itemNote,
          diffs,
          actor: options?.actor,
        })
      );
      continue;
    }

    const diffs: PricingFieldDiff[] = [];

    if (prevItem.enabled !== nextItem.enabled) {
      diffs.push({
        field: 'enabled',
        label: 'Enabled',
        before: prevItem.enabled,
        after: nextItem.enabled,
      });
    }

    if (prevItem.name !== nextItem.name) {
      diffs.push({
        field: 'name',
        label: 'Name',
        before: prevItem.name,
        after: nextItem.name,
      });
    }

    if (prevItem.mode !== nextItem.mode) {
      diffs.push({
        field: 'mode',
        label: 'Calculation Mode',
        before: prevItem.mode,
        after: nextItem.mode,
      });
    }

    if (prevItem.amount !== nextItem.amount || prevItem.mode !== nextItem.mode) {
      diffs.push({
        field: 'amount',
        label: 'Amount',
        before: formatSurchargeValue(prevItem),
        after: formatSurchargeValue(nextItem),
      });
    }

    if (prevItem.defaultPolicy !== nextItem.defaultPolicy) {
      diffs.push({
        field: 'defaultPolicy',
        label: 'Default Policy',
        before: prevItem.defaultPolicy,
        after: nextItem.defaultPolicy,
      });
    }

    const prevDesc = (prevItem.description || '').trim();
    const nextDesc = (nextItem.description || '').trim();
    if (prevDesc !== nextDesc) {
      diffs.push({
        field: 'description',
        label: 'Description',
        before: prevDesc || null,
        after: nextDesc || null,
      });
    }

    if (diffs.length === 0) continue;

    if (prevItem.enabled !== nextItem.enabled) {
      if (nextItem.enabled) {
        emitted.push(
          buildAuditEvent({
            prefix: 'sur',
            nowIso: iso,
            pillar: 'surcharges',
            action: 'surcharge_enabled',
            targetId: nextItem.id,
            targetName: nextItem.name,
            summary: `Enabled ${nextItem.name} (${formatSurchargeValue(nextItem)})`,
            note: itemNote,
            diffs,
            actor: options?.actor,
          })
        );
      } else {
        const priorEnabled = findMostRecentPriorEnabledEvent(
          existingEvents,
          nextItem.id,
          'surcharge_enabled',
          'surcharge_created',
          nowMs
        );
        let activeDurationMinutes: number | undefined;
        let enabledSince: string | undefined;

        if (priorEnabled) {
          const enabledAtMs = resolveEventTimestampMs(priorEnabled);
          activeDurationMinutes = Math.max(0, Math.round((nowMs - enabledAtMs) / 60_000));
          enabledSince = priorEnabled.timestamp;
        }

        const durationLabel =
          activeDurationMinutes !== undefined
            ? ` after ${formatActiveDuration(activeDurationMinutes)}`
            : '';

        emitted.push(
          buildAuditEvent({
            prefix: 'sur',
            nowIso: iso,
            pillar: 'surcharges',
            action: 'surcharge_disabled',
            targetId: nextItem.id,
            targetName: nextItem.name,
            summary: `Disabled ${nextItem.name}${durationLabel}`,
            note: itemNote,
            activeDurationMinutes,
            enabledSince,
            diffs,
            actor: options?.actor,
          })
        );
      }
    } else {
      const changedLabels = diffs.map((d) => d.label).join(', ');
      emitted.push(
        buildAuditEvent({
          prefix: 'sur',
          nowIso: iso,
          pillar: 'surcharges',
          action: 'surcharge_updated',
          targetId: nextItem.id,
          targetName: nextItem.name,
          summary: `Updated ${nextItem.name} (${changedLabels})`,
          note: itemNote,
          diffs,
          actor: options?.actor,
        })
      );
    }
  }

  // Check deleted items
  for (const prevItem of prevItems) {
    if (!nextMap.has(prevItem.id)) {
      const itemNote = resolveNoteForItem(prevItem.id);
      emitted.push(
        buildAuditEvent({
          prefix: 'sur',
          nowIso: iso,
          pillar: 'surcharges',
          action: 'surcharge_deleted',
          targetId: prevItem.id,
          targetName: prevItem.name,
          summary: `Deleted surcharge ${prevItem.name} (${formatSurchargeValue(prevItem)})`,
          note: itemNote,
          diffs: [
            {
              field: 'amount',
              label: 'Amount',
              before: formatSurchargeValue(prevItem),
              after: null,
            },
            {
              field: 'enabled',
              label: 'Enabled',
              before: prevItem.enabled,
              after: null,
            },
          ],
          actor: options?.actor,
        })
      );
    }
  }

  // Track explicit pre-v2 -> v2 firewall schema upgrade
  if (options?.isLegacyMigration && prev.catalogVersion !== 2 && next.catalogVersion === 2) {
    emitted.push(
      buildAuditEvent({
        prefix: 'sur',
        nowIso: iso,
        pillar: 'surcharges',
        action: 'surcharge_legacy_migrated',
        targetId: 'surcharges_catalog',
        targetName: 'Surcharges Catalog (v2 Firewall)',
        summary: `Migrated legacy surcharges schema to v2 Firewall Catalog (${nextItems.length} items)`,
        note: options?.note,
        diffs: [
          {
            field: 'catalogVersion',
            label: 'Catalog Schema Version',
            before: prev.catalogVersion ?? 1,
            after: 2,
          },
        ],
        actor: options?.actor,
      })
    );
  }

  return emitted;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Service Rates (TariffProfile) Diff Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffTariffOptions {
  note?: string;
  nowIso?: string;
  actor?: Partial<PricingAuditActor>;
}

function summarizeStepTiers(t: TariffProfile): string {
  const incs = t.taximeter?.intermediateIncrements || [];
  if (incs.length === 0) return 'None';
  return `${incs.length} tier${incs.length === 1 ? '' : 's'} (${incs
    .map((inc) => `≤${inc.upToDistance}mi @$${inc.ratePerStep.toFixed(3)}/${inc.stepDistance}mi`)
    .join(', ')})`;
}

function summarizeCorridors(t: TariffProfile): string {
  const corridors = t.corridors || [];
  if (corridors.length === 0) return 'None';
  return `${corridors.length} corridor${corridors.length === 1 ? '' : 's'} (${corridors
    .map(
      (c) =>
        `${c.name || c.id}: $${(c.flatPrice ?? 0).toFixed(2)}${c.allowReturn ? ' (2-way)' : ''}`
    )
    .join(', ')})`;
}

function summarizeZipMatrix(t: TariffProfile): string {
  const rows = t.zipMatrixRows || [];
  const zipCol = getRoleColumn(t.zipMatrixColumns, 'zip');
  const priceCol = getRoleColumn(t.zipMatrixColumns, 'price');
  if (rows.length === 0 || !zipCol || !priceCol) return 'None';
  return `${rows.length} zip${rows.length === 1 ? '' : 's'} (${rows
    .map((r) => {
      const price = r.values[priceCol.key];
      return `${String(r.values[zipCol.key] ?? '')}: $${(typeof price === 'number' ? price : 0).toFixed(2)}`;
    })
    .join(', ')})`;
}

function extractTariffMetrics(raw: TariffProfile) {
  const t = normalizeTariffProfile(raw);
  const meter = t.taximeter || t.taximeterRate;
  const hourly = t.hourlyConfig || t.hourlyRate;
  const step = meter?.primaryDistanceStep || 0.1;
  const perMile = meter ? Number(((meter.primaryDistanceRate ?? 0) / step).toFixed(3)) : 0;
  const thenStep = meter?.thenDistanceStep || 0.1;
  const thenPerMile = meter ? Number(((meter.thenDistanceRate ?? 0) / thenStep).toFixed(3)) : 0;
  const waitSecs = meter?.waitingStepSeconds || 60;
  const waitPerMin =
    meter && (meter.waitingRatePerStep ?? 0) > 0
      ? Number((((meter.waitingRatePerStep ?? 0) / waitSecs) * 60).toFixed(2))
      : 0;

  const formatMoney = (v: number) => `$${v.toFixed(2)}`;
  const formatRatePerMile = (v: number) =>
    Number.isInteger(v * 100) ? `$${v.toFixed(2)}/mi` : `$${v.toFixed(3)}/mi`;

  return {
    name: t.name,
    isActive: Boolean(t.isActive),
    isDefault: Boolean(t.isDefault),
    pricingMethod: t.rateModel || 'taximeter',
    baseFare: formatMoney(meter?.startPrice ?? 0),
    initialDistanceIncluded: `${meter?.initialDistanceIncluded ?? 0} mi`,
    perMileRate: formatRatePerMile(perMile),
    primaryDistanceLimit: `${meter?.primaryDistanceLimit ?? 0} mi`,
    thenDistanceRate: formatRatePerMile(thenPerMile),
    minimumFare: formatMoney(meter?.minimumPrice ?? 0),
    waitTimeRatePerMinute: `${formatMoney(waitPerMin)}/min`,
    gracePeriodMinutes: `${meter?.freeTrafficMinutes ?? 0} min`,
    stepTiers: summarizeStepTiers(t),
    hourlyRate: hourly ? `${formatMoney(hourly.ratePerHour)}/hr` : null,
    hourlyMinimumHours: hourly ? `${hourly.minimumHours} hr` : null,
    hourlyIncludedMiles:
      hourly?.includedMilesPerHour !== undefined ? `${hourly.includedMilesPerHour} mi/hr` : null,
    hourlyExcessMileageRate:
      hourly?.excessMileageRate !== undefined ? `${formatMoney(hourly.excessMileageRate)}/mi` : null,
    cancellationWindowMinutes: `${t.cancellationPolicy?.freeWindowMinutes ?? 60} min`,
    cancellationFee: formatMoney(t.cancellationPolicy?.cancellationFee ?? 0),
    noShowFee: formatMoney(t.cancellationPolicy?.noShowFee ?? 0),
    roundingMode: `${t.rounding?.distanceMode || 'exact'} / ${t.rounding?.fareMode || 'ceil_dollar'}`,
    corridors: summarizeCorridors(t),
    zipMatrix: summarizeZipMatrix(t),
  };
}

export function diffTariffChange(
  prev: TariffProfile | null,
  next: TariffProfile | null,
  options?: DiffTariffOptions
): PricingAuditEvent[] {
  if (!prev && !next) return [];

  if (!prev && next) {
    const m = extractTariffMetrics(next);
    const diffs: PricingFieldDiff[] = [
      { field: 'pricingMethod', label: 'Pricing Method', before: null, after: m.pricingMethod },
      { field: 'baseFare', label: 'Base Fare', before: null, after: m.baseFare },
      { field: 'perMileRate', label: 'Per-Mile Rate', before: null, after: m.perMileRate },
      { field: 'minimumFare', label: 'Minimum Fare', before: null, after: m.minimumFare },
    ];
    if (m.hourlyRate) {
      diffs.push({ field: 'hourlyRate', label: 'Hourly Rate', before: null, after: m.hourlyRate });
    }
    return [
      buildAuditEvent({
        prefix: 'tar',
        nowIso: options?.nowIso,
        pillar: 'rates',
        action: 'tariff_created',
        targetId: next.id,
        targetName: next.name,
        summary: `Created rate profile ${next.name} (${m.pricingMethod})`,
        note: options?.note,
        diffs,
        actor: options?.actor,
      }),
    ];
  }

  if (prev && !next) {
    const m = extractTariffMetrics(prev);
    return [
      buildAuditEvent({
        prefix: 'tar',
        nowIso: options?.nowIso,
        pillar: 'rates',
        action: 'tariff_deleted',
        targetId: prev.id,
        targetName: prev.name,
        summary: `Deleted rate profile ${prev.name}`,
        note: options?.note,
        diffs: [
          {
            field: 'pricingMethod',
            label: 'Pricing Method',
            before: m.pricingMethod,
            after: null,
          },
          { field: 'baseFare', label: 'Base Fare', before: m.baseFare, after: null },
        ],
        actor: options?.actor,
      }),
    ];
  }

  // Update comparison (`prev && next`)
  const p = extractTariffMetrics(prev!);
  const n = extractTariffMetrics(next!);

  const fieldDefs: Array<{ key: keyof typeof p; label: string }> = [
    { key: 'name', label: 'Rate Name' },
    { key: 'isActive', label: 'Active Status' },
    { key: 'isDefault', label: 'Default Rate' },
    { key: 'pricingMethod', label: 'Pricing Method' },
    { key: 'baseFare', label: 'Base Fare' },
    { key: 'initialDistanceIncluded', label: 'Initial Distance Included' },
    { key: 'perMileRate', label: 'Per-Mile Rate' },
    { key: 'primaryDistanceLimit', label: 'Primary Bracket Limit' },
    { key: 'thenDistanceRate', label: 'Open-Ended Rate' },
    { key: 'minimumFare', label: 'Minimum Fare' },
    { key: 'waitTimeRatePerMinute', label: 'Wait Time Rate' },
    { key: 'gracePeriodMinutes', label: 'Grace Period' },
    { key: 'stepTiers', label: 'Step Tiers' },
    { key: 'hourlyRate', label: 'Hourly Rate' },
    { key: 'hourlyMinimumHours', label: 'Hourly Minimum' },
    { key: 'hourlyIncludedMiles', label: 'Hourly Included Miles' },
    { key: 'hourlyExcessMileageRate', label: 'Hourly Excess Mileage' },
    { key: 'cancellationWindowMinutes', label: 'Cancellation Window' },
    { key: 'cancellationFee', label: 'Cancellation Fee' },
    { key: 'noShowFee', label: 'No-Show Fee' },
    { key: 'roundingMode', label: 'Rounding Mode' },
    { key: 'corridors', label: 'Flat Corridors' },
    { key: 'zipMatrix', label: 'Zip Matrix' },
  ];

  const diffs: PricingFieldDiff[] = [];
  for (const def of fieldDefs) {
    if (p[def.key] !== n[def.key]) {
      diffs.push({
        field: def.key,
        label: def.label,
        before: p[def.key],
        after: n[def.key],
      });
    }
  }

  if (diffs.length === 0) return [];

  const headline = diffs
    .slice(0, 3)
    .map((d) => d.label)
    .join(', ');

  return [
    buildAuditEvent({
      prefix: 'tar',
      nowIso: options?.nowIso,
      pillar: 'rates',
      action: 'tariff_updated',
      targetId: next!.id,
      targetName: next!.name,
      summary: `Updated ${next!.name} (${headline}${diffs.length > 3 ? ` +${diffs.length - 3} more` : ''})`,
      note: options?.note,
      diffs,
      actor: options?.actor,
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pricing Rules Diff Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffPricingRuleOptions {
  note?: string;
  nowIso?: string;
  actor?: Partial<PricingAuditActor>;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function summarizeRuleTriggers(tr?: PricingRuleTrigger): string {
  if (!tr) return 'All trips';
  const parts: string[] = [];

  if (tr.isAirportOnly) parts.push('Airport transfers');
  if (tr.isHourlyBooking !== undefined) {
    parts.push(tr.isHourlyBooking ? 'Hourly charter only' : 'Non-hourly only');
  }

  const zones = [...(tr.zoneIds || [])].sort();
  const pickupZones = [...(tr.pickupZoneIds || []), ...(tr.fromZoneId ? [tr.fromZoneId] : [])].sort();
  const dropoffZones = [...(tr.dropoffZoneIds || []), ...(tr.toZoneId ? [tr.toZoneId] : [])].sort();
  const groups = [...(tr.zoneGroupIds || [])].sort();
  const collections = [...(tr.locationCollectionIds || [])].sort();

  if (pickupZones.length > 0 || dropoffZones.length > 0) {
    parts.push(
      `Corridor(${pickupZones.join('|') || 'any'} -> ${dropoffZones.join('|') || 'any'})`
    );
  } else if (zones.length > 0) {
    parts.push(`Zones[${tr.zoneMatchMode || 'any_end'}]: ${zones.join(', ')}`);
  }
  if (groups.length > 0) parts.push(`ZoneGroups: ${groups.join(', ')}`);
  if (collections.length > 0) parts.push(`POIs: ${collections.join(', ')}`);

  if (tr.minDistanceMiles !== undefined || tr.maxDistanceMiles !== undefined) {
    parts.push(
      `Distance: ${tr.minDistanceMiles ?? 0}–${tr.maxDistanceMiles ?? '∞'} mi`
    );
  }
  if (tr.minDurationMinutes !== undefined || tr.maxDurationMinutes !== undefined) {
    parts.push(
      `Duration: ${tr.minDurationMinutes ?? 0}–${tr.maxDurationMinutes ?? '∞'} min`
    );
  }
  if (tr.daysOfWeek && tr.daysOfWeek.length > 0) {
    parts.push(
      `Days: ${[...tr.daysOfWeek]
        .sort((a, b) => a - b)
        .map((d) => DAY_LABELS[d] ?? String(d))
        .join(', ')}`
    );
  }
  if (tr.timeWindows && tr.timeWindows.length > 0) {
    parts.push(
      `Time: ${tr.timeWindows.map((w) => `${w.start}-${w.end}`).join(', ')}`
    );
  }
  if (tr.holidayDates && tr.holidayDates.length > 0) {
    parts.push(`Holidays: ${[...tr.holidayDates].sort().join(', ')}`);
  }
  if (tr.accountTypes && tr.accountTypes.length > 0) {
    parts.push(`Accounts: ${[...tr.accountTypes].sort().join(', ')}`);
  }
  if (tr.accountTags && tr.accountTags.length > 0) {
    parts.push(`Tags: ${[...tr.accountTags].sort().join(', ')}`);
  }

  const vehicles = Array.from(
    new Set([...(tr.vehicleTypes || []), ...(tr.vehicleTiers || [])].map((v) => v.toLowerCase()))
  ).sort();
  if (vehicles.length > 0) {
    parts.push(`Vehicles: ${vehicles.join(', ')}`);
  }
  if (tr.vehicleClasses && tr.vehicleClasses.length > 0) {
    parts.push(`Classes: ${[...tr.vehicleClasses].sort().join(', ')}`);
  }
  if (tr.equipment?.minCarSeats || tr.equipment?.minLuggage) {
    parts.push(
      `Equipment(seats≥${tr.equipment.minCarSeats ?? 0}, bags≥${tr.equipment.minLuggage ?? 0})`
    );
  }
  if (tr.passengers?.min !== undefined || tr.passengers?.max !== undefined) {
    parts.push(`Pax: ${tr.passengers?.min ?? 1}–${tr.passengers?.max ?? '∞'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'All trips';
}

function normalizeSurchargeActionsForDiff(mod?: PricingRuleModifier): RuleSurchargeAction[] {
  if (!mod) return [];
  const actions: RuleSurchargeAction[] = Array.isArray(mod.surchargeActions)
    ? mod.surchargeActions.filter((a) => Boolean(a?.surchargeId))
    : [];

  if (actions.length === 0 && mod.overruleSurcharges) {
    if (mod.overruleSurcharges.waiveFuelSurcharge) {
      actions.push({ surchargeId: 'surcharge-fuel', action: 'waive' });
    }
    if (mod.overruleSurcharges.waiveAirportFee) {
      actions.push({ surchargeId: 'surcharge-airport-access', action: 'waive' });
    }
    if (mod.overruleSurcharges.waiveRemoteFee) {
      actions.push({ surchargeId: 'surcharge-remote-area', action: 'waive' });
    }
  }
  return actions;
}

function summarizeSurchargeActions(mod?: PricingRuleModifier): string {
  const actions = normalizeSurchargeActionsForDiff(mod);
  if (actions.length === 0) return 'None';
  return actions
    .map((a) => {
      if (a.action === 'override' && typeof a.overrideAmount === 'number') {
        const mode: SurchargeCalcMode = a.overrideMode || 'flat';
        return `${a.surchargeId}: override (${formatSurchargeValue({
          mode,
          amount: a.overrideAmount,
        })})`;
      }
      return `${a.surchargeId}: ${a.action}`;
    })
    .join(', ');
}

function summarizeExtraActions(mod?: PricingRuleModifier): string {
  if (!mod) return 'None';
  const actions: RuleExtraAction[] = Array.isArray(mod.extraActions)
    ? mod.extraActions.filter((a) => Boolean(a?.extraKey))
    : [];
  if (actions.length === 0 && mod.overruleExtras) {
    if (mod.overruleExtras.waiveCarSeatFee) {
      actions.push({ extraKey: 'car_seat', action: 'waive' });
    }
    if (mod.overruleExtras.waiveExtraPaxFee) {
      actions.push({ extraKey: 'extra_passenger', action: 'waive' });
    }
  }
  if (actions.length === 0) return 'None';
  return actions
    .map((a) =>
      a.action === 'override' && typeof a.overrideAmount === 'number'
        ? `${a.extraKey}: override ($${a.overrideAmount.toFixed(2)})`
        : `${a.extraKey}: ${a.action}`
    )
    .join(', ');
}

function extractRuleModifierMetrics(mod?: PricingRuleModifier) {
  const fa = mod?.fareAdjustment;
  const flatRateOverride =
    fa?.type === 'flat_override'
      ? `$${fa.value.toFixed(2)}`
      : mod?.type === 'flat_override' && mod.value
      ? `$${mod.value.toFixed(2)}`
      : null;

  const multiplier =
    fa?.type === 'multiplier'
      ? `${fa.value.toFixed(2)}×`
      : mod?.type === 'multiplier' && mod.value && mod.value !== 1
      ? `${mod.value.toFixed(2)}×`
      : null;

  const additiveParts: string[] = [];
  if (fa?.type === 'discount_flat') additiveParts.push(`-$${fa.value.toFixed(2)}`);
  if (fa?.type === 'discount_percent') additiveParts.push(`-${fa.value}%`);
  if (!fa && mod?.type === 'surcharge_flat' && mod.value) {
    additiveParts.push(`+$${mod.value.toFixed(2)}`);
  }
  if (!fa && mod?.type === 'surcharge_percent' && mod.value) {
    additiveParts.push(`+${mod.value}%`);
  }
  if (typeof mod?.layerZoneFee === 'number' && mod.layerZoneFee > 0) {
    additiveParts.push(`+$${mod.layerZoneFee.toFixed(2)} zone fee`);
  }
  if (typeof mod?.baseFareOverride === 'number') {
    additiveParts.push(`Base $${mod.baseFareOverride.toFixed(2)}`);
  }
  if (typeof mod?.perMileRateOverride === 'number') {
    additiveParts.push(`$${mod.perMileRateOverride.toFixed(2)}/mi`);
  }
  if (typeof mod?.perMinuteRateOverride === 'number') {
    additiveParts.push(`$${mod.perMinuteRateOverride.toFixed(2)}/min`);
  }
  if (mod?.surchargeAdders && mod.surchargeAdders.length > 0) {
    additiveParts.push(
      mod.surchargeAdders
        .map((sa) => `${sa.name}: ${sa.type === 'percent' ? `+${sa.amount}%` : `+$${sa.amount.toFixed(2)}`}`)
        .join(', ')
    );
  }

  return {
    tariffId: mod?.targetTariffId || null,
    flatRateOverride,
    multiplier,
    additiveFee: additiveParts.length > 0 ? additiveParts.join(', ') : null,
    surchargeActions: summarizeSurchargeActions(mod),
    extraActions: summarizeExtraActions(mod),
  };
}

export function diffPricingRuleChange(
  prev: NamedPricingRule | null,
  next: NamedPricingRule | null,
  existingEvents: PricingAuditEvent[] = [],
  options?: DiffPricingRuleOptions
): PricingAuditEvent[] {
  if (!prev && !next) return [];
  const { iso, ms: nowMs } = parseTimestamp(options?.nowIso);

  if (!prev && next) {
    const mod = extractRuleModifierMetrics(next.modifier);
    const diffs: PricingFieldDiff[] = [
      { field: 'isActive', label: 'Active', before: null, after: Boolean(next.isActive) },
      { field: 'priority', label: 'Priority', before: null, after: next.priority },
      {
        field: 'triggers',
        label: 'Triggers',
        before: null,
        after: summarizeRuleTriggers(next.triggers),
      },
    ];
    if (mod.tariffId) {
      diffs.push({ field: 'tariffId', label: 'Target Rate', before: null, after: mod.tariffId });
    }
    if (mod.surchargeActions !== 'None') {
      diffs.push({
        field: 'surchargeActions',
        label: 'Surcharge Actions',
        before: null,
        after: mod.surchargeActions,
      });
    }
    return [
      buildAuditEvent({
        prefix: 'rul',
        nowIso: iso,
        pillar: 'rules',
        action: 'rule_created',
        targetId: next.id,
        targetName: next.name,
        summary: `Created pricing rule ${next.name} (P${next.priority})`,
        note: options?.note,
        diffs,
        actor: options?.actor,
      }),
    ];
  }

  if (prev && !next) {
    return [
      buildAuditEvent({
        prefix: 'rul',
        nowIso: iso,
        pillar: 'rules',
        action: 'rule_deleted',
        targetId: prev.id,
        targetName: prev.name,
        summary: `Deleted pricing rule ${prev.name} (P${prev.priority})`,
        note: options?.note,
        diffs: [
          { field: 'priority', label: 'Priority', before: prev.priority, after: null },
          { field: 'isActive', label: 'Active', before: Boolean(prev.isActive), after: null },
        ],
        actor: options?.actor,
      }),
    ];
  }

  const prevRule = prev!;
  const nextRule = next!;
  const prevMod = extractRuleModifierMetrics(prevRule.modifier);
  const nextMod = extractRuleModifierMetrics(nextRule.modifier);

  const diffs: PricingFieldDiff[] = [];

  if (Boolean(prevRule.isActive) !== Boolean(nextRule.isActive)) {
    diffs.push({
      field: 'isActive',
      label: 'Rule Active',
      before: Boolean(prevRule.isActive),
      after: Boolean(nextRule.isActive),
    });
  }
  if (prevRule.name !== nextRule.name) {
    diffs.push({ field: 'name', label: 'Rule Name', before: prevRule.name, after: nextRule.name });
  }
  if (prevRule.priority !== nextRule.priority) {
    diffs.push({
      field: 'priority',
      label: 'Priority',
      before: prevRule.priority,
      after: nextRule.priority,
    });
  }
  if (Boolean(prevRule.stopProcessingOnMatch) !== Boolean(nextRule.stopProcessingOnMatch)) {
    diffs.push({
      field: 'stopProcessingOnMatch',
      label: 'Stop Processing on Match',
      before: Boolean(prevRule.stopProcessingOnMatch),
      after: Boolean(nextRule.stopProcessingOnMatch),
    });
  }
  if (Boolean(prevRule.allowDriverSelection) !== Boolean(nextRule.allowDriverSelection)) {
    diffs.push({
      field: 'allowDriverSelection',
      label: 'Allow Manual Selection',
      before: Boolean(prevRule.allowDriverSelection),
      after: Boolean(nextRule.allowDriverSelection),
    });
  }

  const prevTriggers = summarizeRuleTriggers(prevRule.triggers);
  const nextTriggers = summarizeRuleTriggers(nextRule.triggers);
  if (prevTriggers !== nextTriggers) {
    diffs.push({
      field: 'triggers',
      label: 'Triggers',
      before: prevTriggers,
      after: nextTriggers,
    });
  }

  if (prevMod.tariffId !== nextMod.tariffId) {
    diffs.push({
      field: 'tariffId',
      label: 'Target Rate',
      before: prevMod.tariffId,
      after: nextMod.tariffId,
    });
  }
  if (prevMod.flatRateOverride !== nextMod.flatRateOverride) {
    diffs.push({
      field: 'flatRateOverride',
      label: 'Flat Rate Override',
      before: prevMod.flatRateOverride,
      after: nextMod.flatRateOverride,
    });
  }
  if (prevMod.multiplier !== nextMod.multiplier) {
    diffs.push({
      field: 'multiplier',
      label: 'Multiplier',
      before: prevMod.multiplier,
      after: nextMod.multiplier,
    });
  }
  if (prevMod.additiveFee !== nextMod.additiveFee) {
    diffs.push({
      field: 'additiveFee',
      label: 'Additive Fee / Discount',
      before: prevMod.additiveFee,
      after: nextMod.additiveFee,
    });
  }
  if (prevMod.surchargeActions !== nextMod.surchargeActions) {
    diffs.push({
      field: 'surchargeActions',
      label: 'Surcharge Actions',
      before: prevMod.surchargeActions,
      after: nextMod.surchargeActions,
    });
  }
  if (prevMod.extraActions !== nextMod.extraActions) {
    diffs.push({
      field: 'extraActions',
      label: 'Extra Actions',
      before: prevMod.extraActions,
      after: nextMod.extraActions,
    });
  }

  if (diffs.length === 0) return [];

  if (Boolean(prevRule.isActive) !== Boolean(nextRule.isActive)) {
    if (nextRule.isActive) {
      return [
        buildAuditEvent({
          prefix: 'rul',
          nowIso: iso,
          pillar: 'rules',
          action: 'rule_enabled',
          targetId: nextRule.id,
          targetName: nextRule.name,
          summary: `Enabled rule ${nextRule.name} (P${nextRule.priority})`,
          note: options?.note,
          diffs,
          actor: options?.actor,
        }),
      ];
    }

    const priorEnabled = findMostRecentPriorEnabledEvent(
      existingEvents,
      nextRule.id,
      'rule_enabled',
      'rule_created',
      nowMs
    );
    let activeDurationMinutes: number | undefined;
    let enabledSince: string | undefined;

    if (priorEnabled) {
      const enabledAtMs = resolveEventTimestampMs(priorEnabled);
      activeDurationMinutes = Math.max(0, Math.round((nowMs - enabledAtMs) / 60_000));
      enabledSince = priorEnabled.timestamp;
    }

    const durationSuffix =
      activeDurationMinutes !== undefined
        ? ` after ${formatActiveDuration(activeDurationMinutes)}`
        : '';

    return [
      buildAuditEvent({
        prefix: 'rul',
        nowIso: iso,
        pillar: 'rules',
        action: 'rule_disabled',
        targetId: nextRule.id,
        targetName: nextRule.name,
        summary: `Disabled rule ${nextRule.name}${durationSuffix}`,
        note: options?.note,
        activeDurationMinutes,
        enabledSince,
        diffs,
        actor: options?.actor,
      }),
    ];
  }

  const headline = diffs
    .slice(0, 3)
    .map((d) => d.label)
    .join(', ');

  return [
    buildAuditEvent({
      prefix: 'rul',
      nowIso: iso,
      pillar: 'rules',
      action: 'rule_updated',
      targetId: nextRule.id,
      targetName: nextRule.name,
      summary: `Updated rule ${nextRule.name} (${headline}${diffs.length > 3 ? ` +${diffs.length - 3} more` : ''})`,
      note: options?.note,
      diffs,
      actor: options?.actor,
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Universal Extras Diff Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffUniversalExtrasOptions {
  note?: string;
  nowIso?: string;
  actor?: Partial<PricingAuditActor>;
}

function summarizeOversizedBags(cfg: UniversalExtrasConfig): string {
  const list =
    Array.isArray(cfg.oversizedBagsConfig) && cfg.oversizedBagsConfig.length > 0
      ? cfg.oversizedBagsConfig
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;
  return list
    .map(
      (cat) =>
        `${cat.label}: $${(cat.fee ?? 0).toFixed(2)}${cat.requiresUpgrade ? ' (SUV+)' : ''}`
    )
    .join(', ');
}

function summarizeCustomExtras(cfg: UniversalExtrasConfig): string {
  const list = cfg.customExtras || [];
  if (list.length === 0) return 'None';
  return list
    .map(
      (ce) =>
        `${ce.name}: $${(ce.fee ?? 0).toFixed(2)}${ce.isPerUnit ? '/unit' : ''} [${
          ce.isActive !== false ? 'Active' : 'Disabled'
        }, ${ce.showOnBookingForm !== false ? '/book' : 'Dispatch'}]`
    )
    .join(', ');
}

function extractExtrasMetrics(cfg: UniversalExtrasConfig) {
  const grace = cfg.curbWaitingGraceMinutes ?? cfg.pickupGraceMinutes ?? 10;
  const waitRate = cfg.curbWaitingRatePerMinute ?? cfg.waitingRatePerMinute ?? 0.5;
  return {
    carSeatFeePerUnit: `$${(cfg.carSeatFeePerUnit ?? 10).toFixed(2)}`,
    carSeatAutoUpgradeVehicleType: Boolean(cfg.carSeatAutoUpgradeVehicleType ?? true),
    passengerBaseAllowance: cfg.passengerBaseAllowance ?? 1,
    extraPassengerFeePerHead: `$${(cfg.extraPassengerFeePerHead ?? 1).toFixed(2)}`,
    intermediateStopFee: `$${(cfg.intermediateStopFee ?? 5).toFixed(2)}`,
    intermediateStopFreeWaitingMinutes: `${cfg.intermediateStopFreeWaitingMinutes ?? 5} min`,
    curbWaitingGraceMinutes: `${grace} min`,
    curbWaitingRatePerMinute: `$${waitRate.toFixed(2)}/min`,
    petFee: `$${(cfg.petFee ?? 0).toFixed(2)}`,
    waiveCarSeatFee: Boolean(cfg.waiveCarSeatFee),
    waiveExtraPaxFee: Boolean(cfg.waiveExtraPaxFee),
    oversizedBagsConfig: summarizeOversizedBags(cfg),
    customExtras: summarizeCustomExtras(cfg),
  };
}

export function diffUniversalExtrasChange(
  prev: UniversalExtrasConfig,
  next: UniversalExtrasConfig,
  options?: DiffUniversalExtrasOptions
): PricingAuditEvent[] {
  const p = extractExtrasMetrics(prev);
  const n = extractExtrasMetrics(next);

  const defs: Array<{ key: keyof typeof p; label: string }> = [
    { key: 'carSeatFeePerUnit', label: 'Child Seat Fee' },
    { key: 'carSeatAutoUpgradeVehicleType', label: 'Child Seat Auto-Upgrade' },
    { key: 'passengerBaseAllowance', label: 'Included Passengers' },
    { key: 'extraPassengerFeePerHead', label: 'Extra Passenger Fee' },
    { key: 'intermediateStopFee', label: 'Additional Stop Fee' },
    { key: 'intermediateStopFreeWaitingMinutes', label: 'Stop Free Wait' },
    { key: 'curbWaitingGraceMinutes', label: 'Curb Grace Window' },
    { key: 'curbWaitingRatePerMinute', label: 'Curb Wait Rate' },
    { key: 'petFee', label: 'Pet Fee' },
    { key: 'waiveCarSeatFee', label: 'Waive Child Seat Fee' },
    { key: 'waiveExtraPaxFee', label: 'Waive Extra Passenger Fee' },
    { key: 'oversizedBagsConfig', label: 'Oversized Cargo' },
    { key: 'customExtras', label: 'Custom Add-Ons' },
  ];

  const diffs: PricingFieldDiff[] = [];
  for (const def of defs) {
    if (p[def.key] !== n[def.key]) {
      diffs.push({
        field: def.key,
        label: def.label,
        before: p[def.key],
        after: n[def.key],
      });
    }
  }

  if (diffs.length === 0) return [];

  const headline = diffs
    .slice(0, 3)
    .map((d) => d.label)
    .join(', ');

  return [
    buildAuditEvent({
      prefix: 'ext',
      nowIso: options?.nowIso,
      pillar: 'extras',
      action: 'extras_updated',
      targetId: 'universal_extras',
      targetName: 'Universal Extras & Curb Wait',
      summary: `Updated Universal Extras (${headline}${diffs.length > 3 ? ` +${diffs.length - 3} more` : ''})`,
      note: options?.note,
      diffs,
      actor: options?.actor,
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Provenance Map, ConfigAuditEntry Mirroring & RFC-4180 CSV Export
// ─────────────────────────────────────────────────────────────────────────────

function escapeRfc4180Cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports `PricingAuditEvent[]` into an RFC-4180 compliant CSV string with
 * properly escaped double quotes, commas, and multiline notes.
 */
export function exportPricingAuditCsv(events: PricingAuditEvent[]): string {
  const header = [
    'Timestamp',
    'Pillar',
    'Action',
    'Item',
    'Summary',
    'Before/After Diffs',
    'Active Duration',
    'Note',
    'Operator Name',
    'Operator Email',
  ];

  const rows = [header.map(escapeRfc4180Cell).join(',')];

  for (const ev of events) {
    const diffText = (ev.diffs || [])
      .map((d) => `${d.label}: ${d.before ?? '—'} -> ${d.after ?? '—'}`)
      .join('; ');
    const durationText =
      ev.activeDurationMinutes !== undefined
        ? formatActiveDuration(ev.activeDurationMinutes)
        : '';

    const cells = [
      ev.timestamp,
      ev.pillar,
      ev.action,
      ev.targetName,
      ev.summary,
      diffText,
      durationText,
      ev.note || '',
      ev.operatorName,
      ev.operatorEmail,
    ];
    rows.push(cells.map(escapeRfc4180Cell).join(','));
  }

  return rows.join('\r\n');
}

/**
 * Fast O(N) lookup indexing each surcharge's latest enable/disable event,
 * latest configuration update event, and overall most recent event.
 */
export function getLatestSurchargeStatusMap(
  events: PricingAuditEvent[]
): Record<string, SurchargeProvenanceEntry> {
  const map: Record<string, SurchargeProvenanceEntry> = {};
  if (!Array.isArray(events) || events.length === 0) return map;

  const sorted = [...events]
    .filter((ev) => ev.pillar === 'surcharges' && ev.targetId)
    .sort((a, b) => resolveEventTimestampMs(b) - resolveEventTimestampMs(a));

  for (const ev of sorted) {
    if (!map[ev.targetId]) {
      map[ev.targetId] = {
        surchargeId: ev.targetId,
        latestEvent: ev,
      };
    }
    const entry = map[ev.targetId];
    if (
      !entry.latestToggleEvent &&
      (ev.action === 'surcharge_enabled' || ev.action === 'surcharge_disabled')
    ) {
      entry.latestToggleEvent = ev;
    }
    if (
      !entry.latestUpdateEvent &&
      (ev.action === 'surcharge_updated' || ev.action === 'surcharge_created')
    ) {
      entry.latestUpdateEvent = ev;
    }
  }

  return map;
}

/**
 * Converts `PricingAuditEvent[]` into `ConfigAuditEntry[]` records for mirroring
 * into `AppSettings.configAuditTrail` (`/config/appSettings`).
 */
export function toConfigAuditEntries(events: PricingAuditEvent[]): ConfigAuditEntry[] {
  return events.map((ev) => {
    const changes: Record<string, { before: any; after: any }> = {};
    for (const d of ev.diffs || []) {
      changes[d.field] = { before: d.before, after: d.after };
    }
    if (ev.note) {
      changes.auditNote = { before: null, after: ev.note };
    }
    return {
      id: ev.id,
      timestamp: ev.timestamp,
      operatorId: ev.operatorId,
      operatorEmail: ev.operatorEmail,
      tab: 'rates',
      section: ev.pillar,
      action: ev.note ? `${ev.summary} [Note: ${ev.note}]` : ev.summary,
      ipAddress: 'staff-console',
      changes,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Staff-Only Persistence & Real-Time Sync Singleton (`PricingAuditService`)
// ─────────────────────────────────────────────────────────────────────────────

function sortAndCapAuditEvents(list: PricingAuditEvent[]): PricingAuditEvent[] {
  const byId = new Map<string, PricingAuditEvent>();
  for (const item of list) {
    if (!item || !item.id) continue;
    byId.set(item.id, item);
  }
  return Array.from(byId.values())
    .sort((a, b) => resolveEventTimestampMs(b) - resolveEventTimestampMs(a))
    .slice(0, MAX_PRICING_AUDIT_EVENTS);
}

export class PricingAuditService {
  private eventsCache: PricingAuditEvent[] | null = null;
  private actorOverride: PricingAuditActor | null = null;
  private subscribers = new Set<(events: PricingAuditEvent[]) => void>();
  private firestoreUnsub: (() => void) | null = null;
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    if (this.isConfigured) {
      try {
        this.db = getFirestoreDb();
      } catch {
        this.db = null;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === PRICING_AUDIT_STORAGE_KEY) {
          this.eventsCache = this.readFromLocalStorage();
          this.notifySubscribers();
        }
      });
    }
  }

  public setActorOverrideForTests(actor: PricingAuditActor | null): void {
    this.actorOverride = actor;
  }

  public resolveActor(override?: Partial<PricingAuditActor>): PricingAuditActor {
    if (this.actorOverride) {
      return {
        operatorId: override?.operatorId || this.actorOverride.operatorId,
        operatorName: override?.operatorName || this.actorOverride.operatorName,
        operatorEmail: override?.operatorEmail || this.actorOverride.operatorEmail,
        operatorRole: override?.operatorRole ?? this.actorOverride.operatorRole,
      };
    }
    return resolveCurrentPricingAuditActor(override);
  }

  private readFromLocalStorage(): PricingAuditEvent[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(PRICING_AUDIT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return sortAndCapAuditEvents(parsed as PricingAuditEvent[]);
      }
      if (parsed && Array.isArray(parsed.events)) {
        return sortAndCapAuditEvents(parsed.events as PricingAuditEvent[]);
      }
    } catch {
      // Ignore corrupt local storage entries
    }
    return [];
  }

  private writeToLocalStorage(events: PricingAuditEvent[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(PRICING_AUDIT_STORAGE_KEY, JSON.stringify(events));
    } catch {
      // Ignore storage quota errors
    }
  }

  private notifySubscribers(): void {
    const snapshot = this.getEvents();
    this.subscribers.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.warn('[PricingAuditService] Subscriber callback error:', err);
      }
    });
  }

  public getEvents(): PricingAuditEvent[] {
    if (this.eventsCache === null) {
      this.eventsCache = this.readFromLocalStorage();
    }
    return this.eventsCache.map((ev) => ({
      ...ev,
      diffs: Array.isArray(ev.diffs) ? ev.diffs.map((d) => ({ ...d })) : [],
    }));
  }

  public getLatestSurchargeStatusMap(
    events?: PricingAuditEvent[]
  ): Record<string, SurchargeProvenanceEntry> {
    return getLatestSurchargeStatusMap(events ?? this.getEvents());
  }

  private ensureFirestoreSubscription(): void {
    if (this.firestoreUnsub || !this.isConfigured || !this.db || typeof window === 'undefined') {
      return;
    }

    try {
      const ref = doc(this.db, 'config', 'pricingAuditLog');
      this.firestoreUnsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as Partial<PricingAuditLogDocument>;
          if (!Array.isArray(data?.events)) return;

          // Merge remote & local events cleanly (remote wins on matching event IDs so note updates sync live)
          const local = this.eventsCache ?? this.readFromLocalStorage();
          const mergedMap = new Map<string, PricingAuditEvent>();
          for (const ev of local) {
            if (ev?.id) mergedMap.set(ev.id, ev);
          }
          for (const ev of data.events) {
            if (ev?.id) mergedMap.set(ev.id, ev);
          }

          const merged = sortAndCapAuditEvents(Array.from(mergedMap.values()));
          this.eventsCache = merged;
          this.writeToLocalStorage(merged);
          this.notifySubscribers();
        },
        (err) => {
          // Graceful local fallback when offline or unauthenticated
          console.warn('[PricingAuditService] Firestore listener fallback:', err?.message || err);
        }
      );
    } catch (err) {
      console.warn('[PricingAuditService] Failed to attach Firestore listener:', err);
    }
  }

  public subscribe(cb: (events: PricingAuditEvent[]) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getEvents());
    this.ensureFirestoreSubscription();

    // One-time initial hydrate if Firebase is configured on server/test without active listener
    if (this.isConfigured && this.db && !this.firestoreUnsub && typeof window !== 'undefined') {
      getDoc(doc(this.db, 'config', 'pricingAuditLog'))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<PricingAuditLogDocument>;
            if (Array.isArray(data?.events)) {
              const merged = sortAndCapAuditEvents([
                ...(this.eventsCache ?? []),
                ...data.events,
              ]);
              this.eventsCache = merged;
              this.writeToLocalStorage(merged);
              this.notifySubscribers();
            }
          }
        })
        .catch(() => {});
    }

    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0 && this.firestoreUnsub) {
        this.firestoreUnsub();
        this.firestoreUnsub = null;
      }
    };
  }

  private async persistToFirestore(events: PricingAuditEvent[]): Promise<void> {
    if (!this.isConfigured || !this.db) return;
    try {
      const ref = doc(this.db, 'config', 'pricingAuditLog');
      const payload: PricingAuditLogDocument = {
        events: events.slice(0, MAX_PRICING_AUDIT_EVENTS),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(ref, sanitizePayload(payload));
    } catch (err) {
      console.warn('[PricingAuditService] Firestore persist fallback to local cache:', err);
    }
  }

  public async recordEvents(
    newEvents: PricingAuditEvent[],
    actorOverride?: Partial<PricingAuditActor>
  ): Promise<PricingAuditEvent[]> {
    if (!Array.isArray(newEvents) || newEvents.length === 0) return [];

    const resolvedActor = actorOverride ? this.resolveActor(actorOverride) : null;
    const stamped = newEvents.map((ev) => {
      const cleanNote = normalizeOptionalNote(ev.note);
      const base: PricingAuditEvent = {
        ...ev,
        note: cleanNote,
        operatorId: resolvedActor?.operatorId || ev.operatorId,
        operatorName: resolvedActor?.operatorName || ev.operatorName,
        operatorEmail: resolvedActor?.operatorEmail || ev.operatorEmail,
        operatorRole: resolvedActor?.operatorRole ?? ev.operatorRole,
      };
      if (!base.note) delete base.note;
      if (!base.operatorRole) delete base.operatorRole;
      return base;
    });

    const current = this.getEvents();
    const merged = sortAndCapAuditEvents([...stamped, ...current]);
    this.eventsCache = merged;
    this.writeToLocalStorage(merged);
    this.notifySubscribers();

    await this.persistToFirestore(merged);
    return stamped;
  }

  public async updateAuditEventNote(
    eventId: string,
    note: string
  ): Promise<PricingAuditEvent | null> {
    if (!eventId) return null;
    const current = this.getEvents();
    const idx = current.findIndex((ev) => ev.id === eventId);
    if (idx < 0) return null;

    const cleanNote = normalizeOptionalNote(note);
    const updatedEvent: PricingAuditEvent = {
      ...current[idx],
    };
    if (cleanNote) {
      updatedEvent.note = cleanNote;
    } else {
      delete updatedEvent.note;
    }

    const updatedList = [...current];
    updatedList[idx] = updatedEvent;
    const capped = sortAndCapAuditEvents(updatedList);

    this.eventsCache = capped;
    this.writeToLocalStorage(capped);
    this.notifySubscribers();

    await this.persistToFirestore(capped);
    return { ...updatedEvent };
  }

  public resetForTests(): void {
    this.eventsCache = [];
    this.actorOverride = null;
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(PRICING_AUDIT_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    this.notifySubscribers();
  }
}

let pricingAuditServiceInstance: PricingAuditService | null = null;

export function getPricingAuditService(): PricingAuditService {
  if (!pricingAuditServiceInstance) {
    pricingAuditServiceInstance = new PricingAuditService();
  }
  return pricingAuditServiceInstance;
}
