import React, { useState } from 'react';
import type { AppSettings } from '~/core/types/config';
import type { TariffProfile } from '~/core/types/tariff';
import type { NamedPricingRule } from '~/core/types/config';
import type { UniversalExtrasConfig } from '~/core/services/pricing/extras.service';
import type { SurchargesConfig } from '~/core/services/pricing/surcharges.service';

import {
  DollarSignIcon,
  SparklesIcon,
  ZapIcon,
  ShieldCheckIcon,
  SlidersIcon,
  ChevronRightIcon,
  CheckIcon,
} from '~/components/ui/Icons';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';

import { RatesPanel } from './rates/RatesPanel';
import { UniversalExtrasPanel } from './extras/UniversalExtrasPanel';
import { SurchargesPanel } from './surcharges/SurchargesPanel';
import { PricingRulesPanel } from './rules/PricingRulesPanel';
import { PersistentFareSimulator } from './simulator/PersistentFareSimulator';

import { getTariffService, DEFAULT_TARIFF_PROFILES } from '~/core/services/pricing/tariff.service';
import { getPricingRulesService, DEFAULT_NAMED_PRICING_RULES } from '~/core/services/pricing/pricing-rules.service';
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
  onSave,
  isLoading = false,
  initialTab = 'rates',
}: PricingAdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PricingPillarTab>(initialTab);
  const [isSimulatorCollapsed, setIsSimulatorCollapsed] = useState<boolean>(false);
  const [combineFeesAndExtras, setCombineFeesAndExtras] = useState<boolean>(false);

  // Keep activeTab in sync with top admin navigation
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Hydrate all 4 pricing pillars from Firestore on mount & subscribe to live tariff updates
  React.useEffect(() => {
    let mounted = true;
    const unsubscribeTariffs = getTariffService().subscribeToTariffs((liveTariffs) => {
      if (!mounted) return;
      const activeList = liveTariffs.filter((t) => !t.isArchived);
      if (activeList.length > 0) {
        setTariffs(activeList);
      }
    });

    (async () => {
      try {
        const [cloudTariffs, cloudExtras, cloudSurcharges, cloudRules] = await Promise.all([
          getTariffService().getTariffs().catch(() => null),
          getUniversalExtrasService().getExtras().catch(() => null),
          getSurchargesService().getSurcharges().catch(() => null),
          getPricingRulesService().getRules().catch(() => null),
        ]);
        if (!mounted) return;
        if (cloudTariffs && cloudTariffs.length > 0) {
          const activeList = cloudTariffs.filter((t) => !t.isArchived);
          if (activeList.length > 0) setTariffs(activeList);
        }
        if (cloudExtras) setUniversalExtras(cloudExtras);
        if (cloudSurcharges) setSurcharges(cloudSurcharges);
        if (cloudRules && cloudRules.length > 0) setRules(cloudRules);
      } catch (e) {
        console.warn('[PricingAdminWorkspace] Failed to hydrate pricing pillars from cloud:', e);
      }
    })();
    return () => {
      mounted = false;
      unsubscribeTariffs();
    };
  }, []);

  // Pillar 1: Tariffs (all active admin-created tariffs)
  const [tariffs, setTariffs] = useState<TariffProfile[]>(() => {
    try {
      const svc = getTariffService();
      const list = svc.getAllTariffProfiles().filter((t) => !t.isArchived);
      return list && list.length > 0 ? list : DEFAULT_TARIFF_PROFILES;
    } catch {
      return DEFAULT_TARIFF_PROFILES;
    }
  });

  // Pillar 2: Extras
  const [universalExtras, setUniversalExtras] = useState<UniversalExtrasConfig>(() => {
    try {
      return getUniversalExtrasConfig();
    } catch {
      return DEFAULT_UNIVERSAL_EXTRAS_CONFIG;
    }
  });

  // Pillar 3: Surcharges
  const [surcharges, setSurcharges] = useState<SurchargesConfig>(() => {
    try {
      return getSurchargesConfig();
    } catch {
      return DEFAULT_SURCHARGES_CONFIG;
    }
  });

  // Pillar 4: Rules
  const [rules, setRules] = useState<NamedPricingRule[]>(() => {
    try {
      const svc = getPricingRulesService();
      const list = svc.getAllRules();
      return list && list.length > 0 ? list : DEFAULT_NAMED_PRICING_RULES;
    } catch {
      return DEFAULT_NAMED_PRICING_RULES;
    }
  });

  // Save Handlers
  const handleSaveTariff = async (updated: TariffProfile) => {
    try {
      const svc = getTariffService();
      await svc.saveTariff(updated);
      setTariffs([...svc.getAllTariffProfiles().filter((t) => !t.isArchived)]);
    } catch (e) {
      console.error('Error saving tariff profile:', e);
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
    } catch (e) {
      console.error('Error deleting tariff profile:', e);
      setTariffs((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleSaveExtras = async (updated: UniversalExtrasConfig) => {
    try {
      saveUniversalExtrasConfig(updated);
      setUniversalExtras(updated);
    } catch (e) {
      console.error('Error saving universal extras:', e);
      setUniversalExtras(updated);
    }
  };

  const handleSaveSurcharges = async (updated: SurchargesConfig) => {
    try {
      saveSurchargesConfig(updated);
      setSurcharges(updated);
    } catch (e) {
      console.error('Error saving surcharges:', e);
      setSurcharges(updated);
    }
  };

  const handleSaveRule = async (updated: NamedPricingRule) => {
    try {
      const svc = getPricingRulesService();
      svc.saveRule(updated);
      setRules([...svc.getAllRules()]);
    } catch (e) {
      console.error('Error saving pricing rule:', e);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const svc = getPricingRulesService();
      svc.deleteRule(id);
      setRules([...svc.getAllRules()]);
    } catch (e) {
      console.error('Error deleting pricing rule:', e);
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Context & Utility Toolbar (no duplicate sub-navigation cards) */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">
            {activeTab === 'rates' && 'Tariffs & Stepped Distance Rate Tiers:'}
            {activeTab === 'surcharges' && 'Built-In Fuel Surcharge, Operational & Conditional Surcharges:'}
            {activeTab === 'extras' && 'Universal Passenger & Equipment Add-Ons:'}
            {activeTab === 'rules' && 'Rule Conditions, Zone Triggers & Tariff Actions:'}
          </span>
          <span>
            {activeTab === 'rates' && 'Configure stepped distance increments (e.g. first 1/5 mi + stepped mileage tiers) and flat airport matrices.'}
            {activeTab === 'surcharges' && 'Manage built-in gas/fuel surcharge, airport gate fee, peak demand multiplier, and custom vehicle/distance surcharges.'}
            {activeTab === 'extras' && 'Configure car seats, extra passenger headcount fees, intermediate stops, and curb waiting time.'}
            {activeTab === 'rules' && 'Connect service zones, vehicle classes, and corporate accounts to target tariffs and fee waivers.'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(activeTab === 'surcharges' || activeTab === 'extras') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCombineFeesAndExtras(!combineFeesAndExtras)}
              className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              {combineFeesAndExtras ? 'Single Pillar View' : 'Show Surcharges + Extras Together'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsSimulatorCollapsed(!isSimulatorCollapsed)}
            className="text-xs border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            <SlidersIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            {isSimulatorCollapsed ? 'Show Fare Simulator' : 'Hide Simulator'}
          </Button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Main Pillar View */}
        <div className="flex-1 w-full min-w-0 space-y-6">
          {activeTab === 'rates' && (
            <RatesPanel
              tariffs={tariffs}
              vehicles={settings?.vehicles}
              onSaveTariff={handleSaveTariff}
              onDeleteTariff={handleDeleteTariff}
              isSaving={isLoading}
            />
          )}

          {(activeTab === 'surcharges' || (combineFeesAndExtras && activeTab === 'extras')) && (
            <SurchargesPanel
              surcharges={surcharges}
              tariffs={tariffs}
              vehicles={settings?.vehicles}
              onSave={handleSaveSurcharges}
              isSaving={isLoading}
            />
          )}

          {(activeTab === 'extras' || (combineFeesAndExtras && activeTab === 'surcharges')) && (
            <UniversalExtrasPanel
              extras={universalExtras}
              onSave={handleSaveExtras}
              isSaving={isLoading}
            />
          )}

          {activeTab === 'rules' && (
            <PricingRulesPanel
              rules={rules}
              tariffs={tariffs}
              onSaveRule={handleSaveRule}
              onDeleteRule={handleDeleteRule}
              isSaving={isLoading}
            />
          )}
        </div>

        {/* Docked Fare Simulator Panel */}
        {!isSimulatorCollapsed && (
          <div className="w-full lg:w-96 shrink-0 lg:sticky lg:top-4">
            <PersistentFareSimulator
              tariffs={tariffs}
              rules={rules}
              universalExtras={universalExtras}
              surcharges={surcharges}
            />
          </div>
        )}
      </div>
    </div>
  );
}
