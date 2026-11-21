import React, { useState, useMemo, useCallback } from 'react';
import type { AppSettings, NamedPricingRule } from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
import type { UniversalExtrasConfig } from '~/core/services/pricing/extras.service';
import type { SurchargesConfig } from '~/core/services/pricing/surcharges.service';

import { SlidersIcon } from '~/components/ui/Icons';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';

import { RatesPanel } from './rates/RatesPanel';
import { UniversalExtrasPanel } from './extras/UniversalExtrasPanel';
import { SurchargesPanel } from './surcharges/SurchargesPanel';
import { PricingRulesPanel } from './rules/PricingRulesPanel';
import { PersistentFareSimulator } from './simulator/PersistentFareSimulator';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';

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

export type PricingPillarTab = 'rates' | 'extras' | 'surcharges' | 'rules';

export interface PricingAdminWorkspaceProps {
  settings?: AppSettings;
  onSave?: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialTab?: PricingPillarTab;
}

export function PricingAdminWorkspace({
  settings,
  isLoading = false,
  initialTab = 'rates',
}: PricingAdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PricingPillarTab>(initialTab);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [focusedRuleId, setFocusedRuleId] = useState<string | null>(null);

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

  // Subscribe LIVE to all 4 pricing pillars from Firestore
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

    return () => {
      mounted = false;
      unsubTariffs();
      unsubExtras();
      unsubSurcharges();
      unsubRules();
    };
  }, []);

  // Cross-tab jump helper (e.g. clicking a Rule pill on a Surcharge or Rate card)
  const handleNavigateToRule = useCallback((ruleId?: string) => {
    if (ruleId) setFocusedRuleId(ruleId);
    setActiveTab('rules');
  }, []);

  // Save Handlers
  const handleSaveTariff = async (updated: TariffProfile) => {
    try {
      const svc = getTariffService();
      await svc.saveTariff(updated);
      setTariffs([...svc.getAllTariffProfiles().filter((t) => !t.isArchived)]);
      setDraftTariff(null);
    } catch (e) {
      console.error('Error saving rate profile:', e);
      setTariffs((prev) => {
        const exists = prev.some((t) => t.id === updated.id);
        return exists ? prev.map((t) => (t.id === updated.id ? updated : t)) : [...prev, updated];
      });
    }
  };

  const handleDeleteTariff = async (id: string) => {
    try {
      const svc = getTariffService();
      await svc.deleteTariff(id);
      setTariffs([...svc.getAllTariffProfiles().filter((t) => !t.isArchived)]);
      setDraftTariff(null);
    } catch (e) {
      console.error('Error deleting rate profile:', e);
      setTariffs((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleSaveExtras = async (updated: UniversalExtrasConfig) => {
    try {
      await saveUniversalExtrasConfig(updated);
      setUniversalExtras(updated);
      setDraftExtras(null);
    } catch (e) {
      console.error('Error saving universal extras:', e);
      setUniversalExtras(updated);
    }
  };

  const handleSaveSurcharges = async (updated: SurchargesConfig) => {
    try {
      await saveSurchargesConfig(updated);
      setSurcharges(updated);
      setDraftSurcharges(null);
    } catch (e) {
      console.error('Error saving surcharges:', e);
      setSurcharges(updated);
    }
  };

  const handleSaveRule = async (updated: NamedPricingRule) => {
    try {
      const svc = getPricingRulesService();
      await svc.saveRule(updated);
      setRules([...svc.getAllRules()]);
      setDraftRule(null);
    } catch (e) {
      console.error('Error saving pricing rule:', e);
      setRules((prev) => {
        const exists = prev.some((r) => r.id === updated.id);
        return exists ? prev.map((r) => (r.id === updated.id ? updated : r)) : [updated, ...prev];
      });
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const svc = getPricingRulesService();
      await svc.deleteRule(id);
      setRules([...svc.getAllRules()]);
      setDraftRule(null);
    } catch (e) {
      console.error('Error deleting pricing rule:', e);
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // One-click lossless upgrade from pre-v2 Firestore surcharges to v2 Firewall Catalog + Rules
  const handleMigrateLegacyToFirewall = async () => {
    const v2Items = getSurchargeCatalogItems(surcharges);
    await handleSaveSurcharges({
      ...surcharges,
      catalogVersion: 2,
      items: v2Items,
    });
    const ruleSvc = getPricingRulesService();
    const existingIds = new Set(rules.map((r) => r.id));
    for (const defaultRule of DEFAULT_NAMED_PRICING_RULES) {
      if (!existingIds.has(defaultRule.id)) {
        await ruleSvc.saveRule(defaultRule);
      } else if (defaultRule.id === 'rule-airport-transfer-flat') {
        const existing = rules.find((r) => r.id === defaultRule.id);
        if (existing && (!existing.modifier.surchargeActions || existing.modifier.surchargeActions.length === 0)) {
          await ruleSvc.saveRule({
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
          });
        }
      }
    }
    setRules([...ruleSvc.getAllRules()]);
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
      <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          <span className="font-bold text-slate-900 mr-1.5">
            {activeTab === 'rates' && '1. Rates:'}
            {activeTab === 'extras' && '2. Extras:'}
            {activeTab === 'surcharges' && '3. Surcharges:'}
            {activeTab === 'rules' && '4. Pricing Rules:'}
          </span>
          {activeTab === 'rates' &&
            'Base fare formulas, per-rate rounding settings, and no-show or cancellation fees.'}
          {activeTab === 'extras' &&
            'Optional rider add-ons (car seats, extra passengers, stops, oversized items) and pickup wait time.'}
          {activeTab === 'surcharges' &&
            'Master On/Off switch and default behavior (All Trips vs Rule-Only) for every surcharge.'}
          {activeTab === 'rules' &&
            'Automatic pricing rules connecting trip conditions to Rates, Surcharges, and Extras.'}
        </p>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          {hasUnsavedDraft && (
            <Badge
              variant="warning"
              size="sm"
              className="text-[10px] bg-amber-100 text-amber-800 border-amber-300"
            >
              Unsaved Draft Active
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsSimulatorOpen(true)}
            className="text-xs border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-2xs shrink-0 cursor-pointer flex-1 sm:flex-none justify-center"
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
      </div>

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
