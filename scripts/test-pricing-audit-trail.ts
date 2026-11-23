/**
 * Phase 48 Automated Verification Suite:
 * Rates, Pricing Rules & Surcharge Enable/Disable Audit Trail
 * (`scripts/test-pricing-audit-trail.ts`)
 *
 * Run: `npx tsx scripts/test-pricing-audit-trail.ts`
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  BUILTIN_SURCHARGE_IDS,
  DEFAULT_SURCHARGES_CONFIG,
  getSurchargesService,
  saveSurchargesConfig,
} from '../app/core/services/pricing/surcharges.service';
import { DEFAULT_TARIFF_PROFILES } from '../app/core/services/pricing/tariff.service';
import { DEFAULT_NAMED_PRICING_RULES } from '../app/core/services/pricing/pricing-rules.service';
import {
  DEFAULT_UNIVERSAL_EXTRAS_CONFIG,
  getUniversalExtrasService,
  saveUniversalExtrasConfig,
} from '../app/core/services/pricing/extras.service';
import { sanitizePublicSettings, DEFAULT_APP_SETTINGS } from '../app/core/services/config/admin-config.service';
import {
  MAX_PRICING_AUDIT_EVENTS,
  diffPricingRuleChange,
  diffSurchargesConfig,
  diffTariffChange,
  diffUniversalExtrasChange,
  exportPricingAuditCsv,
  formatActiveDuration,
  getLatestSurchargeStatusMap,
  getPricingAuditService,
  toConfigAuditEntries,
} from '../app/core/services/pricing/pricing-audit.service';
import type { SurchargesConfig, NamedPricingRule, UniversalExtrasConfig } from '../app/core/types/config';
import type { TariffProfile } from '../app/core/types/tariff';

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

async function run() {
  console.log('🧪 Running Phase 48 Pricing & Surcharge Audit Trail Suite...\n');

  const auditSvc = getPricingAuditService();
  auditSvc.resetForTests();
  auditSvc.setActorOverrideForTests({
    operatorId: 'uid_dispatcher_alex_test',
    operatorName: 'Alex Mercer',
    operatorEmail: 'alex.mercer@chesterfieldtaxi.com',
    operatorRole: 'dispatcher',
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Active Duration Formatter & Surcharge Enable -> Disable Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  Testing surcharge_enabled -> surcharge_disabled lifecycle & activeDurationMinutes...');

  assert.equal(formatActiveDuration(undefined), '');
  assert.equal(formatActiveDuration(0), '< 1m');
  assert.equal(formatActiveDuration(0.3), '< 1m');
  assert.equal(formatActiveDuration(42), '42m');
  assert.equal(formatActiveDuration(120), '2h');
  assert.equal(formatActiveDuration(136), '2h 16m');
  assert.equal(formatActiveDuration(3 * 1440 + 4 * 60), '3d 4h');

  const baseSurcharges: SurchargesConfig = clone(DEFAULT_SURCHARGES_CONFIG);

  // Enable Peak Demand Surge at 17:00 UTC with an inline note
  const enabledSurcharges: SurchargesConfig = {
    ...clone(baseSurcharges),
    catalogVersion: 2,
    items: baseSurcharges.items!.map((it) =>
      it.id === BUILTIN_SURCHARGE_IDS.PEAK_SURGE ? { ...it, enabled: true } : it
    ),
  };

  const enableEvents = diffSurchargesConfig(
    baseSurcharges,
    enabledSurcharges,
    auditSvc.getEvents(),
    {
      note: 'Winter storm I-64',
      noteForSurchargeId: BUILTIN_SURCHARGE_IDS.PEAK_SURGE,
      nowIso: '2026-11-22T17:00:00.000Z',
    }
  );

  assert.equal(enableEvents.length, 1);
  assert.equal(enableEvents[0].action, 'surcharge_enabled');
  assert.equal(enableEvents[0].pillar, 'surcharges');
  assert.equal(enableEvents[0].targetId, BUILTIN_SURCHARGE_IDS.PEAK_SURGE);
  assert.equal(enableEvents[0].note, 'Winter storm I-64');
  assert.equal(enableEvents[0].operatorName, 'Alex Mercer');
  assert.equal(enableEvents[0].operatorEmail, 'alex.mercer@chesterfieldtaxi.com');
  assert.deepEqual(enableEvents[0].diffs, [
    { field: 'enabled', label: 'Enabled', before: false, after: true },
  ]);

  await auditSvc.recordEvents(enableEvents);

  // Disable Peak Demand Surge at 19:16 UTC (exact 136m = 2h 16m active window) WITHOUT an initial note
  const disabledSurcharges: SurchargesConfig = {
    ...clone(enabledSurcharges),
    items: enabledSurcharges.items!.map((it) =>
      it.id === BUILTIN_SURCHARGE_IDS.PEAK_SURGE ? { ...it, enabled: false } : it
    ),
  };

  const disableEvents = diffSurchargesConfig(
    enabledSurcharges,
    disabledSurcharges,
    auditSvc.getEvents(),
    {
      nowIso: '2026-11-22T19:16:00.000Z',
    }
  );

  assert.equal(disableEvents.length, 1);
  assert.equal(disableEvents[0].action, 'surcharge_disabled');
  assert.equal(disableEvents[0].activeDurationMinutes, 136);
  assert.equal(formatActiveDuration(disableEvents[0].activeDurationMinutes), '2h 16m');
  assert.equal(disableEvents[0].enabledSince, '2026-11-22T17:00:00.000Z');
  assert.ok(disableEvents[0].summary.includes('2h 16m'));
  assert.equal(disableEvents[0].note, undefined);

  await auditSvc.recordEvents(disableEvents);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Post-Toggle Note Update (`updateAuditEventNote`) & Provenance Lookup
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2️⃣  Testing post-toggle updateAuditEventNote & getLatestSurchargeStatusMap...');

  const updatedDisableEv = await auditSvc.updateAuditEventNote(
    disableEvents[0].id,
    'Roads cleared on I-64 West'
  );
  assert.ok(updatedDisableEv);
  assert.equal(updatedDisableEv.note, 'Roads cleared on I-64 West');

  const statusMap = auditSvc.getLatestSurchargeStatusMap();
  const surgeProv = statusMap[BUILTIN_SURCHARGE_IDS.PEAK_SURGE];
  assert.ok(surgeProv);
  assert.equal(surgeProv.latestToggleEvent?.id, disableEvents[0].id);
  assert.equal(surgeProv.latestToggleEvent?.action, 'surcharge_disabled');
  assert.equal(surgeProv.latestToggleEvent?.activeDurationMinutes, 136);
  assert.equal(surgeProv.latestToggleEvent?.note, 'Roads cleared on I-64 West');

  // Verify surcharge rate/policy update, custom creation, deletion & legacy migration diffs
  const modifiedSurcharges: SurchargesConfig = {
    ...clone(disabledSurcharges),
    items: [
      ...disabledSurcharges.items!.map((it) => {
        if (it.id === BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS) {
          return { ...it, amount: 5.5, defaultPolicy: 'universal' as const };
        }
        if (it.id === BUILTIN_SURCHARGE_IDS.PEAK_SURGE) {
          return { ...it, amount: 1.5 };
        }
        return it;
      }),
      {
        id: 'surcharge-holiday-eve',
        name: 'Holiday Eve Stipend',
        enabled: true,
        defaultPolicy: 'rule_only',
        mode: 'flat',
        amount: 12,
        isBuiltIn: false,
      },
    ],
  };

  const batchSurchargeDiffs = diffSurchargesConfig(
    disabledSurcharges,
    modifiedSurcharges,
    auditSvc.getEvents(),
    {
      notesBySurchargeId: {
        [BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS]: 'STL Terminal commission hike',
      },
      nowIso: '2026-11-22T20:00:00.000Z',
    }
  );
  assert.equal(batchSurchargeDiffs.length, 3);

  const airportUpdate = batchSurchargeDiffs.find(
    (e) => e.targetId === BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS
  );
  assert.ok(airportUpdate);
  assert.equal(airportUpdate.action, 'surcharge_updated');
  assert.equal(airportUpdate.note, 'STL Terminal commission hike');
  assert.deepEqual(airportUpdate.diffs, [
    { field: 'amount', label: 'Amount', before: '$4.00', after: '$5.50' },
    { field: 'defaultPolicy', label: 'Default Policy', before: 'rule_only', after: 'universal' },
  ]);

  const surgeAmountUpdate = batchSurchargeDiffs.find(
    (e) => e.targetId === BUILTIN_SURCHARGE_IDS.PEAK_SURGE
  );
  assert.ok(surgeAmountUpdate);
  assert.equal(surgeAmountUpdate.action, 'surcharge_updated');
  assert.deepEqual(surgeAmountUpdate.diffs, [
    { field: 'amount', label: 'Amount', before: '1.25×', after: '1.50×' },
  ]);

  const holidayCreated = batchSurchargeDiffs.find((e) => e.targetId === 'surcharge-holiday-eve');
  assert.ok(holidayCreated);
  assert.equal(holidayCreated.action, 'surcharge_created');

  // Delete custom surcharge
  const afterDeleteSurcharges: SurchargesConfig = {
    ...clone(modifiedSurcharges),
    items: modifiedSurcharges.items!.filter((i) => i.id !== 'surcharge-holiday-eve'),
  };
  const deleteSurchargeEvents = diffSurchargesConfig(
    modifiedSurcharges,
    afterDeleteSurcharges,
    auditSvc.getEvents(),
    { nowIso: '2026-11-22T20:05:00.000Z' }
  );
  assert.equal(deleteSurchargeEvents.length, 1);
  assert.equal(deleteSurchargeEvents[0].action, 'surcharge_deleted');

  // Legacy schema migration event
  const legacyRaw: SurchargesConfig = {
    ...clone(DEFAULT_SURCHARGES_CONFIG),
    catalogVersion: undefined,
  };
  const legacyMigEvents = diffSurchargesConfig(
    legacyRaw,
    DEFAULT_SURCHARGES_CONFIG,
    [],
    { isLegacyMigration: true, nowIso: '2026-11-22T20:06:00.000Z' }
  );
  assert.ok(legacyMigEvents.some((e) => e.action === 'surcharge_legacy_migrated'));

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Zero Noisy No-Op Events Across All 4 Pillars
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3️⃣  Verifying zero noisy audit events when saving unchanged configs...');

  assert.equal(
    diffSurchargesConfig(modifiedSurcharges, clone(modifiedSurcharges), auditSvc.getEvents()).length,
    0
  );
  assert.equal(
    diffTariffChange(DEFAULT_TARIFF_PROFILES[0], clone(DEFAULT_TARIFF_PROFILES[0])).length,
    0
  );
  assert.equal(
    diffPricingRuleChange(
      DEFAULT_NAMED_PRICING_RULES[0],
      clone(DEFAULT_NAMED_PRICING_RULES[0]),
      auditSvc.getEvents()
    ).length,
    0
  );
  assert.equal(
    diffUniversalExtrasChange(
      DEFAULT_UNIVERSAL_EXTRAS_CONFIG,
      clone(DEFAULT_UNIVERSAL_EXTRAS_CONFIG)
    ).length,
    0
  );

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Service Rates, Pricing Rules & Universal Extras Diffs
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4️⃣  Testing structured { before -> after } diffs across Rates, Rules & Extras...');

  // 4a. Tariff create / update / delete
  const baseMeterTariff: TariffProfile = clone(DEFAULT_TARIFF_PROFILES[1]); // METER
  const updatedMeterTariff: TariffProfile = {
    ...clone(baseMeterTariff),
    taximeter: {
      ...baseMeterTariff.taximeter,
      startPrice: 5.25,
      primaryDistanceRate: 0.325, // $3.25/mi
      minimumPrice: 12.0,
    },
    cancellationPolicy: {
      freeWindowMinutes: 60,
      cancellationFee: 25.0,
      noShowFee: 30.0,
    },
    rounding: {
      distanceMode: 'half_mile_up',
      fareMode: 'exact_cents',
    },
  };

  const tariffUpdateEvents = diffTariffChange(baseMeterTariff, updatedMeterTariff, {
    nowIso: '2026-11-22T20:10:00.000Z',
  });
  assert.equal(tariffUpdateEvents.length, 1);
  assert.equal(tariffUpdateEvents[0].action, 'tariff_updated');
  assert.ok(
    tariffUpdateEvents[0].diffs.some(
      (d) => d.field === 'baseFare' && d.before === '$4.50' && d.after === '$5.25'
    )
  );
  assert.ok(
    tariffUpdateEvents[0].diffs.some(
      (d) => d.field === 'perMileRate' && d.before === '$3.00/mi' && d.after === '$3.25/mi'
    )
  );
  assert.ok(
    tariffUpdateEvents[0].diffs.some(
      (d) => d.field === 'cancellationFee' && d.before === '$20.00' && d.after === '$25.00'
    )
  );
  assert.ok(
    tariffUpdateEvents[0].diffs.some(
      (d) =>
        d.field === 'roundingMode' &&
        d.before === 'exact / ceil_dollar' &&
        d.after === 'half_mile_up / exact_cents'
    )
  );

  const tariffCreatedEvents = diffTariffChange(null, updatedMeterTariff);
  assert.equal(tariffCreatedEvents[0].action, 'tariff_created');
  const tariffDeletedEvents = diffTariffChange(updatedMeterTariff, null);
  assert.equal(tariffDeletedEvents[0].action, 'tariff_deleted');

  // 4b. Pricing Rules: rule_enabled -> rule_disabled duration + surchargeActions diff
  const baseRule: NamedPricingRule = {
    ...clone(DEFAULT_NAMED_PRICING_RULES[0]),
    isActive: false,
  };
  const enabledRule: NamedPricingRule = {
    ...clone(baseRule),
    isActive: true,
  };
  const ruleEnableEv = diffPricingRuleChange(baseRule, enabledRule, [], {
    nowIso: '2026-11-22T08:00:00.000Z',
  });
  assert.equal(ruleEnableEv.length, 1);
  assert.equal(ruleEnableEv[0].action, 'rule_enabled');

  const disabledRuleAgain: NamedPricingRule = {
    ...clone(enabledRule),
    isActive: false,
  };
  const ruleDisableEv = diffPricingRuleChange(enabledRule, disabledRuleAgain, ruleEnableEv, {
    nowIso: '2026-11-22T09:05:00.000Z',
  });
  assert.equal(ruleDisableEv.length, 1);
  assert.equal(ruleDisableEv[0].action, 'rule_disabled');
  assert.equal(ruleDisableEv[0].activeDurationMinutes, 65);
  assert.equal(formatActiveDuration(ruleDisableEv[0].activeDurationMinutes), '1h 5m');

  const editedRuleActions: NamedPricingRule = {
    ...clone(enabledRule),
    priority: 98,
    modifier: {
      ...enabledRule.modifier,
      fareAdjustment: { type: 'multiplier', value: 1.2 },
      surchargeActions: [
        {
          surchargeId: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS,
          action: 'override',
          overrideAmount: 6.0,
          overrideMode: 'flat',
        },
      ],
    },
  };
  const ruleUpdateEv = diffPricingRuleChange(enabledRule, editedRuleActions, []);
  assert.equal(ruleUpdateEv.length, 1);
  assert.equal(ruleUpdateEv[0].action, 'rule_updated');
  assert.ok(ruleUpdateEv[0].diffs.some((d) => d.field === 'priority' && d.after === 98));
  assert.ok(ruleUpdateEv[0].diffs.some((d) => d.field === 'multiplier' && d.after === '1.20×'));
  assert.ok(
    ruleUpdateEv[0].diffs.some(
      (d) =>
        d.field === 'surchargeActions' &&
        String(d.after).includes('surcharge-airport-access: override ($6.00)')
    )
  );

  // 4c. Universal Extras diff + ConfigAuditEntry mirroring
  const nextExtras: UniversalExtrasConfig = {
    ...clone(DEFAULT_UNIVERSAL_EXTRAS_CONFIG),
    carSeatFeePerUnit: 12.0,
    curbWaitingGraceMinutes: 15,
    pickupGraceMinutes: 15,
    customExtras: [
      {
        id: 'extra-meet-greet',
        name: 'Inside Terminal Meet & Greet',
        fee: 20,
        isActive: true,
        showOnBookingForm: true,
      },
    ],
  };
  const extrasDiffEv = diffUniversalExtrasChange(DEFAULT_UNIVERSAL_EXTRAS_CONFIG, nextExtras, {
    note: 'Updated STL baggage claim meet & greet fee',
    nowIso: '2026-11-22T21:00:00.000Z',
  });
  assert.equal(extrasDiffEv.length, 1);
  assert.equal(extrasDiffEv[0].action, 'extras_updated');
  assert.ok(
    extrasDiffEv[0].diffs.some(
      (d) => d.field === 'carSeatFeePerUnit' && d.before === '$10.00' && d.after === '$12.00'
    )
  );
  assert.ok(
    extrasDiffEv[0].diffs.some(
      (d) => d.field === 'curbWaitingGraceMinutes' && d.before === '10 min' && d.after === '15 min'
    )
  );
  assert.ok(extrasDiffEv[0].diffs.some((d) => d.field === 'customExtras'));

  const mirroredConfigEntries = toConfigAuditEntries(extrasDiffEv);
  assert.equal(mirroredConfigEntries.length, 1);
  assert.equal(mirroredConfigEntries[0].tab, 'rates');
  assert.equal(mirroredConfigEntries[0].section, 'extras');
  assert.ok(mirroredConfigEntries[0].action.includes('Updated STL baggage claim meet & greet fee'));

  // ───────────────────────────────────────────────────────────────────────────
  // 5. RFC-4180 CSV Export & 500-Event Cap
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5️⃣  Testing RFC-4180 CSV escaping & 500-event cap...');

  await auditSvc.recordEvents(batchSurchargeDiffs);
  await auditSvc.updateAuditEventNote(
    airportUpdate.id,
    'Approved by "Ops Desk", Terminal 1 & 2\nEffective immediately'
  );

  const csv = exportPricingAuditCsv(auditSvc.getEvents());
  const lines = csv.split('\r\n');
  assert.equal(
    lines[0],
    'Timestamp,Pillar,Action,Item,Summary,Before/After Diffs,Active Duration,Note,Operator Name,Operator Email'
  );
  // Escaped double quotes + embedded comma + newline must follow RFC-4180
  assert.ok(
    csv.includes('"Approved by ""Ops Desk"", Terminal 1 & 2\nEffective immediately"'),
    'CSV must RFC-4180 escape quotes, commas, and newlines'
  );
  assert.ok(csv.includes('2h 16m'), 'CSV must include formatted Active Duration');

  // Verify 500-event retention cap
  const syntheticBulk = Array.from({ length: 520 }, (_, i) => ({
    ...enableEvents[0],
    id: `paud-bulk-${i}`,
    timestampMs: 1700000000000 + i * 1000,
    timestamp: new Date(1700000000000 + i * 1000).toISOString(),
  }));
  await auditSvc.recordEvents(syntheticBulk);
  assert.equal(auditSvc.getEvents().length, MAX_PRICING_AUDIT_EVENTS);

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Security & Privacy Verification: Zero PII in `/pricingConfig/*` & Firestore Rules
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6️⃣  Verifying zero PII in public /pricingConfig/* payloads & firestore.rules...');

  await saveSurchargesConfig(enabledSurcharges);
  await saveUniversalExtrasConfig(nextExtras);

  const persistedSurchargesJson = JSON.stringify(getSurchargesService().getCached());
  const persistedExtrasJson = JSON.stringify(getUniversalExtrasService().getCached());
  const publicSettingsJson = JSON.stringify(sanitizePublicSettings(DEFAULT_APP_SETTINGS));

  for (const [label, jsonPayload] of [
    ['/pricingConfig/surcharges', persistedSurchargesJson],
    ['/pricingConfig/universalExtras', persistedExtrasJson],
    ['/config/publicSettings', publicSettingsJson],
  ] as const) {
    assert.ok(
      !jsonPayload.includes('alex.mercer@chesterfieldtaxi.com'),
      `${label} must NEVER contain operator emails`
    );
    assert.ok(
      !jsonPayload.includes('uid_dispatcher_alex_test'),
      `${label} must NEVER contain operator UIDs`
    );
    assert.ok(
      !jsonPayload.includes('Alex Mercer'),
      `${label} must NEVER contain operator names`
    );
    assert.ok(
      !jsonPayload.includes('Winter storm I-64'),
      `${label} must NEVER contain internal audit notes`
    );
    assert.ok(
      !jsonPayload.includes('configAuditTrail'),
      `${label} must NEVER expose staff configAuditTrail`
    );
  }

  const firestoreRulesPath = path.join(process.cwd(), 'firestore.rules');
  const firestoreRules = fs.readFileSync(firestoreRulesPath, 'utf8');

  assert.match(
    firestoreRules,
    /match\s+\/pricingConfig\/\{document=\*\*\}\s*\{\s*allow\s+read:\s*if\s+true;\s*allow\s+write:\s*if\s+isDispatcher\(\);\s*\}/,
    'firestore.rules must keep /pricingConfig/{document=**} public-read and dispatcher-write'
  );
  assert.match(
    firestoreRules,
    /match\s+\/config\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isDispatcher\(\);\s*\}/,
    'firestore.rules must keep /config/{document=**} (hosting /config/pricingAuditLog) locked to isDispatcher()'
  );

  auditSvc.resetForTests();

  console.log('\n✅ All Phase 48 Pricing & Surcharge Audit Trail checks passed (100%)!');
}

run().catch((err) => {
  console.error('❌ Phase 48 test suite failed:', err);
  process.exit(1);
});
