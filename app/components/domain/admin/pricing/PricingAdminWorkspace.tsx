import React, { useState, useMemo, useCallback } from 'react';
import type { AppSettings, ConfigAuditEntry, NamedPricingRule } from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
import type { PricingAuditEvent, PricingAuditFilterMode } from '~/core/types/pricing-audit';
import type { UniversalExtrasConfig } from '~/core/services/pricing/extras.service';
import type { SurchargesConfig } from '~/core/services/pricing/surcharges.service';

import { HistoryIcon, SlidersIcon } from '~/components/ui/Icons';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';

import { RatesPanel } from './rates/RatesPanel';
import { UniversalExtrasPanel } from './extras/UniversalExtrasPanel';
import { SurchargesPanel } from './surcharges/SurchargesPanel';
import { PricingRulesPanel } from './rules/PricingRulesPanel';
import { PersistentFareSimulator } from './simulator/PersistentFareSimulator';
import { PricingAuditDrawer } from './audit/PricingAuditDrawer';
import { PricingAuditPanel } from './audit/PricingAuditPanel';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';

import { getAdminConfigService } from '~/core/services/config/admin-config.service';
import { getTariffService, DEFAULT_TARIFF_PROFILES } from '~/core/services/pricing/tariff.service';
import {
  getPricingRulesService,
  DEFAULT_NAMED_PRICING_RULES,
} from '~/core/services/pricing/pricing-rules.service';
import {
  getUniversalExtrasConfig,
  saveUniversalExtrasConfig,
  getUniversalExtrasService,
  DEFAULT_UNIVERSAL_EXTRAS_CONFIG,
} from '~/core/services/pricing/extras.service';
import {
  getSurchargesConfig,
  saveSurchargesConfig,
  getSurchargesService,
  getSurchargeCatalogItems,
  DEFAULT_SURCHARGES_CONFIG,
} from '~/core/services/pricing/surcharges.service';
import {
  diffPricingRuleChange,
  diffSurchargesConfig,
  diffTariffChange,
  diffUniversalExtrasChange,
  getPricingAuditService,
  toConfigAuditEntries,
} from '~/core/services/pricing/pricing-audit.service';

export type PricingPillarTab = 'rates' | 'extras' | 'surcharges' | 'rules' | 'audit';

export interface PricingAdminWorkspaceProps {
  settings?: AppSettings;
  onSave?: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialTab?: PricingPillarTab;
}

export function PricingAdminWorkspace({
  settings,
  onSave,
  isLoading = false,
  initialTab = 'rates',
}: PricingAdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PricingPillarTab>(initialTab);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [focusedRuleId, setFocusedRuleId] = useState<string | null>(null);

  // Staff-only Pricing Audit Trail state (deterministic [] on SSR, hydrated in useEffect)
  const [auditEvents, setAuditEvents] = useState<PricingAuditEvent[]>([]);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState<boolean>(false);
  const [auditFilterMode, setAuditFilterMode] = useState<PricingAuditFilterMode>('all');
  const [auditSurchargeId, setAuditSurchargeId] = useState<string>('');

  // Live unsaved draft state from active panel so Simulator previews unsaved edits immediately
  const [draftTariff, setDraftTariff] = useState<TariffProfile | null>(null);
  const [draftExtras, setDraftExtras] = useState<UniversalExtrasConfig | null>(null);
  const [draftSurcharges, setDraftSurcharges] = useState<SurchargesConfig | null>(null);
  const [draftRule, setDraftRule] = useState<NamedPricingRule | null>(null);

  // Keep activeTab in sync with top admin navigation
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Pillar 1: Service Rates
  const [tariffs, setTariffs] = useState<TariffProfile[]>(() => {
    try {
      const list = getTariffService().getAllTariffProfiles().filter((t) => !t.isArchived);
      return list && list.length > 0 ? list : DEFAULT_TARIFF_PROFILES;
    } catch {
      return DEFAULT_TARIFF_PROFILES;
    }
  });

  // Pillar 2: Extras & Curb Wait
  const [universalExtras, setUniversalExtras] = useState<UniversalExtrasConfig>(() => {
    try {
      return getUniversalExtrasConfig();
    } catch {
      return DEFAULT_UNIVERSAL_EXTRAS_CONFIG;
    }
  });

  // Pillar 3: Surcharges Catalog (Firewall)
  const [surcharges, setSurcharges] = useState<SurchargesConfig>(() => {
    try {
      return getSurchargesConfig();
    } catch {
      return DEFAULT_SURCHARGES_CONFIG;
    }
  });

  // Pillar 4: Firewall Rules
  const [rules, setRules] = useState<NamedPricingRule[]>(() => {
    try {
      const list = getPricingRulesService().getAllRules();
      return list && list.length > 0 ? list : DEFAULT_NAMED_PRICING_RULES;
    } catch {
      return DEFAULT_NAMED_PRICING_RULES;
    }
  });

  // Subscribe LIVE to all 4 pricing pillars + staff-only PricingAuditService
  React.useEffect(() => {
    let mounted = true;
    const unsubTariffs = getTariffService().subscribeToTariffs((liveTariffs) => {
      if (!mounted) return;
      const activeList = liveTariffs.filter((t) => !t.isArchived);
      if (activeList.length > 0) setTariffs(activeList);
    });
    const unsubExtras = getUniversalExtrasService().subscribeToExtras((liveExtras) => {
      if (!mounted || !liveExtras) return;
      setUniversalExtras(liveExtras);
    });
    const unsubSurcharges = getSurchargesService().subscribeToSurcharges((liveSurcharges) => {
      if (!mounted || !liveSurcharges) return;
      setSurcharges(liveSurcharges);
    });
    const unsubRules = getPricingRulesService().subscribeToRules((liveRules) => {
      if (!mounted) return;
      if (liveRules && liveRules.length > 0) setRules(liveRules);
    });
    const unsubAudit = getPricingAuditService().subscribe((liveAuditEvents) => {
      if (!mounted) return;
      setAuditEvents(liveAuditEvents);
    });

    return () => {
      mounted = false;
      unsubTariffs();
      unsubExtras();
      unsubSurcharges();
      unsubRules();
      unsubAudit();
    };
  }, []);

  // Mirror pricing audit summaries into unified AppSettings.configAuditTrail
  const mirrorIntoAppSettingsTrail = useCallback(
    (entries: ConfigAuditEntry[]) => {
      if (entries.length === 0) return;
      const existingTrail =
        settings?.configAuditTrail ||
        getAdminConfigService().getCachedSettings().configAuditTrail ||
        [];
      const mergedMap = new Map<string, ConfigAuditEntry>();
      for (const entry of [...entries, ...existingTrail]) {
        if (entry?.id && !mergedMap.has(entry.id)) {
          mergedMap.set(entry.id, entry);
        }
      }
      const updatedTrail = Array.from(mergedMap.values()).slice(0, 100);
      if (settings && onSave) {
        onSave({ configAuditTrail: updatedTrail }).catch((err) =>
          console.warn('[PricingAdminWorkspace] Failed to mirror configAuditTrail via onSave:', err)
        );
      } else {
        getAdminConfigService()
          .updateSettings({ configAuditTrail: updatedTrail })
          .catch((err) =>
            console.warn('[PricingAdminWorkspace] Failed to mirror configAuditTrail:', err)
          );
      }
    },
    [settings, onSave]
  );

  const recordAndMirrorAuditEvents = useCallback(
    async (newEvents: PricingAuditEvent[]) => {
      if (!newEvents || newEvents.length === 0) return;
      const recorded = await getPricingAuditService().recordEvents(newEvents);
      if (recorded.length > 0) {
        mirrorIntoAppSettingsTrail(toConfigAuditEntries(recorded));
      }
    },
    [mirrorIntoAppSettingsTrail]
  );

  const handleUpdateAuditNote = useCallback(
    async (eventId: string, note: string) => {
      const updated = await getPricingAuditService().updateAuditEventNote(eventId, note);
      if (!updated) return;

      const existingTrail =
        settings?.configAuditTrail ||
        getAdminConfigService().getCachedSettings().configAuditTrail ||
        [];
      if (existingTrail.some((e) => e.id === eventId)) {
        const [mirroredUpdated] = toConfigAuditEntries([updated]);
        const nextTrail = existingTrail.map((e) => (e.id === eventId ? mirroredUpdated : e));
        if (settings && onSave) {
          onSave({ configAuditTrail: nextTrail }).catch(() => {});
        } else {
          getAdminConfigService()
            .updateSettings({ configAuditTrail: nextTrail })
            .catch(() => {});
        }
      }
    },
    [settings, onSave]
  );

  const handleOpenAuditDrawerAll = useCallback(() => {
    setAuditSurchargeId('');
    setAuditFilterMode('all');
    setIsAuditDrawerOpen(true);
  }, []);

  const handleOpenSurchargeAuditHistory = useCallback((surchargeId?: string) => {
    setAuditSurchargeId(surchargeId || '');
    setAuditFilterMode(surchargeId ? 'surcharges' : 'surcharges_on_off');
    setIsAuditDrawerOpen(true);
  }, []);

  // Cross-tab jump helper (e.g. clicking a Rule pill on a Surcharge or Rate card)
  const handleNavigateToRule = useCallback((ruleId?: string) => {
    if (ruleId) setFocusedRuleId(ruleId);
    setActiveTab('rules');
  }, []);

  // Save & Audit Handlers across all 4 Pricing Pillars
  const handleSaveTariff = async (updated: TariffProfile) => {
    const prevTariff = tariffs.find((t) => t.id === updated.id) || null;
    const events = diffTariffChange(prevTariff, updated);
    try {
      const svc = getTariffService();
      await svc.saveTariff(updated);
      setTariffs([...svc.getAllTariffProfiles().filter((t) => !t.isArchived)]);
      setDraftTariff(null);
      await recordAndMirrorAuditEvents(events);
    } catch (e) {
      console.error('Error saving rate profile:', e);
      setTariffs((prev) => {
        const exists = prev.some((t) => t.id === updated.id);
        return exists ? prev.map((t) => (t.id === updated.id ? updated : t)) : [...prev, updated];
      });
    }
  };

  const handleDeleteTariff = async (id: string) => {
    const prevTariff = tariffs.find((t) => t.id === id) || null;
    const events = diffTariffChange(prevTariff, null);
    try {
      const svc = getTariffService();
      await svc.deleteTariff(id);
      setTariffs([...svc.getAllTariffProfiles().filter((t) => !t.isArchived)]);
      setDraftTariff(null);
      await recordAndMirrorAuditEvents(events);
    } catch (e) {
      console.error('Error deleting rate profile:', e);
      setTariffs((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleSaveExtras = async (updated: UniversalExtrasConfig) => {
    const prevExtras = universalExtras;
    const events = diffUniversalExtrasChange(prevExtras, updated);
    try {
      await saveUniversalExtrasConfig(updated);
      setUniversalExtras(updated);
      setDraftExtras(null);
      const cached = settings || getAdminConfigService().getCachedSettings();
      const nextDriverApp = {
        ...(cached.driverAppConfig || {}),
        ...(typeof updated.intermediateStopFreeWaitingMinutes === 'number'
          ? { intermediateStopFreeWaitingMinutes: updated.intermediateStopFreeWaitingMinutes }
          : {}),
        intermediateStopExcessWaitRatePerMinute:
          updated.curbWaitingRatePerMinute ?? updated.waitingRatePerMinute ?? 0.5,
      };
      if (settings && onSave) {
        await onSave({ driverAppConfig: nextDriverApp as any });
      } else {
        await getAdminConfigService().updateSettings({ driverAppConfig: nextDriverApp as any });
      }
      await recordAndMirrorAuditEvents(events);
    } catch (e) {
      console.error('Error saving universal extras:', e);
      setUniversalExtras(updated);
    }
  };

  // Instant 1-click surcharge On/Off persistence + audit recording
  const handleToggleSurcharge = async (
    surchargeId: string,
    nextEnabled: boolean,
    note?: string
  ) => {
    const prevSurcharges = surcharges;
    const nextItems = getSurchargeCatalogItems(prevSurcharges).map((item) =>
      item.id === surchargeId ? { ...item, enabled: nextEnabled } : item
    );
    const nextSurcharges: SurchargesConfig = {
      ...prevSurcharges,
      catalogVersion: 2,
      items: nextItems,
    };
    const events = diffSurchargesConfig(
      prevSurcharges,
      nextSurcharges,
      getPricingAuditService().getEvents(),
      {
        note,
        noteForSurchargeId: surchargeId,
      }
    );

    await saveSurchargesConfig(nextSurcharges);
    setSurcharges(nextSurcharges);
    await recordAndMirrorAuditEvents(events);
  };

  const handleSaveSurcharges = async (
    updated: SurchargesConfig,
    notesBySurchargeId?: Record<string, string>
  ) => {
    const prevSurcharges = surcharges;
    const events = diffSurchargesConfig(
      prevSurcharges,
      updated,
      getPricingAuditService().getEvents(),
      { notesBySurchargeId }
    );
    try {
      await saveSurchargesConfig(updated);
      setSurcharges(updated);
      setDraftSurcharges(null);
      await recordAndMirrorAuditEvents(events);
    } catch (e) {
      console.error('Error saving surcharges:', e);
      setSurcharges(updated);
    }
  };

  const handleSaveRule = async (updated: NamedPricingRule) => {
    const prevRule = rules.find((r) => r.id === updated.id) || null;
    const events = diffPricingRuleChange(
      prevRule,
      updated,
      getPricingAuditService().getEvents()
    );
    try {
      const svc = getPricingRulesService();
      await svc.saveRule(updated);
      setRules([...svc.getAllRules()]);
      setDraftRule(null);
      await recordAndMirrorAuditEvents(events);
    } catch (e) {
      console.error('Error saving pricing rule:', e);
      setRules((prev) => {
        const exists = prev.some((r) => r.id === updated.id);
        return exists ? prev.map((r) => (r.id === updated.id ? updated : r)) : [updated, ...prev];
      });
    }
  };

  const handleDeleteRule = async (id: string) => {
    const prevRule = rules.find((r) => r.id === id) || null;
    const events = diffPricingRuleChange(prevRule, null, getPricingAuditService().getEvents());
    try {
      const svc = getPricingRulesService();
      await svc.deleteRule(id);
      setRules([...svc.getAllRules()]);
      setDraftRule(null);
      await recordAndMirrorAuditEvents(events);
    } catch (e) {
      console.error('Error deleting pricing rule:', e);
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // One-click lossless upgrade from pre-v2 Firestore surcharges to v2 Firewall Catalog + Rules
  const handleMigrateLegacyToFirewall = async () => {
    const prevSurcharges = surcharges;
    const v2Items = getSurchargeCatalogItems(prevSurcharges);
    const nextSurcharges: SurchargesConfig = {
      ...prevSurcharges,
      catalogVersion: 2,
      items: v2Items,
    };

    const migrationAuditBatch: PricingAuditEvent[] = [
      ...diffSurchargesConfig(
        prevSurcharges,
        nextSurcharges,
        getPricingAuditService().getEvents(),
        { isLegacyMigration: true }
      ),
    ];

    await saveSurchargesConfig(nextSurcharges);
    setSurcharges(nextSurcharges);
    setDraftSurcharges(null);

    const ruleSvc = getPricingRulesService();
    const existingIds = new Set(rules.map((r) => r.id));
    for (const defaultRule of DEFAULT_NAMED_PRICING_RULES) {
      if (!existingIds.has(defaultRule.id)) {
        const saved = await ruleSvc.saveRule(defaultRule);
        migrationAuditBatch.push(
          ...diffPricingRuleChange(null, saved, getPricingAuditService().getEvents())
        );
      } else if (defaultRule.id === 'rule-airport-transfer-flat') {
        const existing = rules.find((r) => r.id === defaultRule.id);
        if (
          existing &&
          (!existing.modifier.surchargeActions || existing.modifier.surchargeActions.length === 0)
        ) {
          const upgradedRule: NamedPricingRule = {
            ...existing,
            triggers: {
              ...existing.triggers,
              zoneMatchMode: 'any_end',
              isAirportOnly: true,
            },
            modifier: {
              ...existing.modifier,
              surchargeActions: defaultRule.modifier.surchargeActions,
              overruleSurcharges: undefined,
            },
          };
          const saved = await ruleSvc.saveRule(upgradedRule);
          migrationAuditBatch.push(
            ...diffPricingRuleChange(existing, saved, getPricingAuditService().getEvents())
          );
        }
      }
    }
    setRules([...ruleSvc.getAllRules()]);
    await recordAndMirrorAuditEvents(migrationAuditBatch);
  };

  // Merge active unsaved drafts into Simulator inputs for live preview!
  const simulatedTariffs = useMemo(() => {
    if (!draftTariff) return tariffs;
    return tariffs.map((t) => (t.id === draftTariff.id ? draftTariff : t));
  }, [tariffs, draftTariff]);

  const simulatedExtras = draftExtras || universalExtras;
  const simulatedSurcharges = draftSurcharges || surcharges;

  const simulatedRules = useMemo(() => {
    if (!draftRule) return rules;
    const exists = rules.some((r) => r.id === draftRule.id);
    return exists
      ? rules.map((r) => (r.id === draftRule.id ? draftRule : r))
      : [draftRule, ...rules];
  }, [rules, draftRule]);

  const hasUnsavedDraft = Boolean(draftTariff || draftExtras || draftSurcharges || draftRule);

  return (
    <div className="space-y-4">
      {/* Slim Utility Bar */}
      <div className="bg-surface-card border border-border-subtle/90 rounded-2xl px-4 py-2.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-fg-secondary">
          <span className="font-bold text-fg-primary mr-1.5">
            {activeTab === 'rates' && '1. Tariffs:'}
            {activeTab === 'extras' && '2. Extras & Wait:'}
            {activeTab === 'surcharges' && '3. Surcharges:'}
            {activeTab === 'rules' && '4. Pricing Rules:'}
            {activeTab === 'audit' && '5. Pricing Audit Log:'}
          </span>
          {activeTab === 'rates' &&
            'Base fare formulas, per-rate rounding settings, and no-show or cancellation fees.'}
          {activeTab === 'extras' &&
            'Optional rider add-ons (car seats, extra passengers, stops, oversized items) and pickup wait time.'}
          {activeTab === 'surcharges' &&
            'Master On/Off switch and default behavior (All Trips vs Rule-Only) for every surcharge.'}
          {activeTab === 'rules' &&
            'Automatic pricing rules connecting trip conditions to Rates, Surcharges, and Extras.'}
          {activeTab === 'audit' &&
            'Full staff-only provenance log across Tariffs, Extras, Surcharges On/Off toggles, and Pricing Rules.'}
        </p>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {hasUnsavedDraft && (
            <Badge
              variant="warning"
              size="sm"
              className="text-[10px] bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border"
            >
              Unsaved Draft Active
            </Badge>
          )}
          {activeTab !== 'audit' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenAuditDrawerAll}
              className="text-xs border-border-strong bg-surface-card text-fg-strong hover:bg-surface-subtle shadow-2xs shrink-0 cursor-pointer flex-1 sm:flex-none justify-center"
            >
              <HistoryIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              <span>Audit History</span>
              {auditEvents.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-surface-muted text-fg-secondary border border-border-subtle font-mono text-[10px] font-bold">
                  {auditEvents.length}
                </span>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsSimulatorOpen(true)}
            className="text-xs border-border-strong bg-surface-card text-fg-strong hover:bg-surface-subtle shadow-2xs shrink-0 cursor-pointer flex-1 sm:flex-none justify-center"
          >
            <SlidersIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            <span>Live Fare Preview</span>
          </Button>
        </div>
      </div>

      {/* Full-Width Main Pillar Workspace */}
      <div className="w-full min-w-0 space-y-6">
        {activeTab === 'rates' && (
          <RatesPanel
            tariffs={tariffs}
            rules={rules}
            onSaveTariff={handleSaveTariff}
            onDeleteTariff={handleDeleteTariff}
            onDraftChange={setDraftTariff}
            onNavigateToRule={handleNavigateToRule}
            isSaving={isLoading}
          />
        )}

        {activeTab === 'extras' && (
          <UniversalExtrasPanel
            extras={universalExtras}
            onSave={handleSaveExtras}
            onDraftChange={setDraftExtras}
            isSaving={isLoading}
          />
        )}

        {activeTab === 'surcharges' && (
          <SurchargesPanel
            surcharges={surcharges}
            rules={rules}
            onSave={handleSaveSurcharges}
            onToggleSurcharge={handleToggleSurcharge}
            auditEvents={auditEvents}
            onUpdateAuditNote={handleUpdateAuditNote}
            onOpenAuditHistory={handleOpenSurchargeAuditHistory}
            onDraftChange={setDraftSurcharges}
            onNavigateToRule={handleNavigateToRule}
            onMigrateLegacyToFirewall={handleMigrateLegacyToFirewall}
            isSaving={isLoading}
          />
        )}

        {activeTab === 'rules' && (
          <PricingRulesPanel
            rules={rules}
            tariffs={tariffs}
            surcharges={surcharges}
            vehicles={settings?.vehicles}
            corporateAccounts={settings?.corporateAccounts}
            initialSelectedRuleId={focusedRuleId}
            onSaveRule={handleSaveRule}
            onDeleteRule={handleDeleteRule}
            onDraftChange={setDraftRule}
            isSaving={isLoading}
          />
        )}

        {activeTab === 'audit' && (
          <PricingAuditPanel
            events={auditEvents}
            surcharges={surcharges}
            onUpdateNote={handleUpdateAuditNote}
            showHeader
          />
        )}
      </div>

      {/* Staff-Only Pricing & Surcharge Audit History Slide-Over Drawer */}
      <PricingAuditDrawer
        isOpen={isAuditDrawerOpen}
        onClose={() => setIsAuditDrawerOpen(false)}
        events={auditEvents}
        surcharges={surcharges}
        initialFilterMode={auditFilterMode}
        initialSurchargeId={auditSurchargeId}
        onUpdateNote={handleUpdateAuditNote}
      />

      {/* On-Demand Live Fare Preview Slide-Over Drawer (previews live unsaved drafts!) */}
      <AdminSlideOverDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        title="Live Fare Preview"
        subtitle="Test live fares across Rates, Extras, Surcharges & Pricing Rules"
        size="md"
      >
        <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-5 h-full">
          <PersistentFareSimulator
            tariffs={simulatedTariffs}
            rules={simulatedRules}
            universalExtras={simulatedExtras}
            surcharges={simulatedSurcharges}
            vehicles={settings?.vehicles}
            corporateAccounts={settings?.corporateAccounts}
            hasUnsavedDraft={hasUnsavedDraft}
            className="border-l-0"
          />
        </div>
      </AdminSlideOverDrawer>
    </div>
  );
}
