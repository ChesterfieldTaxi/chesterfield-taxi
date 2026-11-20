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
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';

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
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);

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
      await saveUniversalExtrasConfig(updated);
      setUniversalExtras(updated);
    } catch (e) {
      console.error('Error saving universal extras:', e);
      setUniversalExtras(updated);
    }
  };

  const handleSaveSurcharges = async (updated: SurchargesConfig) => {
    try {
      await saveSurchargesConfig(updated);
      setSurcharges(updated);
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
    } catch (e) {
      console.error('Error deleting pricing rule:', e);
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Slim Utility Bar: Reclaims 384px by docking Fare Simulator into a Slide-Over Drawer */}
      <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          <span className="font-bold text-slate-900 mr-1.5">
            {activeTab === 'rates' && 'Tariffs & Stepped Rates:'}
            {activeTab === 'surcharges' && 'Operational & Conditional Surcharges:'}
            {activeTab === 'extras' && 'Universal Extras & Equipment:'}
            {activeTab === 'rules' && 'Pricing Rules & Routing:'}
          </span>
          {activeTab === 'rates' && 'Stepped mileage tiers, hourly charters, and flat airport matrices.'}
          {activeTab === 'surcharges' && 'Fuel surcharge, airport access fee, peak demand, and vehicle upgrades.'}
          {activeTab === 'extras' && 'Car seats, extra passengers, stops, waiting time, and oversized cargo.'}
          {activeTab === 'rules' && 'Connect zones, vehicle classes, and corporate accounts to target tariffs.'}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsSimulatorOpen(true)}
          className="text-xs border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-2xs shrink-0"
        >
          <SlidersIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
          <span>Test Fare Simulator</span>
        </Button>
      </div>

      {/* Full-Width Main Pillar Workspace */}
      <div className="w-full min-w-0 space-y-6">
        {activeTab === 'rates' && (
          <RatesPanel
            tariffs={tariffs}
            vehicles={settings?.vehicles}
            onSaveTariff={handleSaveTariff}
            onDeleteTariff={handleDeleteTariff}
            isSaving={isLoading}
          />
        )}

        {activeTab === 'surcharges' && (
          <SurchargesPanel
            surcharges={surcharges}
            tariffs={tariffs}
            vehicles={settings?.vehicles}
            onSave={handleSaveSurcharges}
            isSaving={isLoading}
          />
        )}

        {activeTab === 'extras' && (
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
            vehicles={settings?.vehicles}
            corporateAccounts={settings?.corporateAccounts}
            onSaveRule={handleSaveRule}
            onDeleteRule={handleDeleteRule}
            isSaving={isLoading}
          />
        )}
      </div>

      {/* On-Demand Slide-Over Fare Simulator Drawer */}
      <AdminSlideOverDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        title="Live Fare Simulator"
        subtitle="Test real-time quotes across tariffs, surcharges, extras, and vehicle classes"
        size="lg"
      >
        <PersistentFareSimulator
          tariffs={tariffs}
          rules={rules}
          universalExtras={universalExtras}
          surcharges={surcharges}
          vehicles={settings?.vehicles}
          corporateAccounts={settings?.corporateAccounts}
        />
      </AdminSlideOverDrawer>
    </div>
  );
}
