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
  DEFAULT_UNIVERSAL_EXTRAS_CONFIG,
} from '~/core/services/pricing/extras.service';
import {
  getSurchargesConfig,
  saveSurchargesConfig,
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

  // Keep activeTab in sync with top admin navigation
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Pillar 1: Tariffs (strictly the 2 primary rates)
  const [tariffs, setTariffs] = useState<TariffProfile[]>(() => {
    try {
      const svc = getTariffService();
      const list = svc
        .getAllTariffProfiles()
        .filter((t) => t.id === 'tariff-airport-flat' || t.id === 'tariff-point-to-point-meter');
      return list && list.length === 2 ? list : DEFAULT_TARIFF_PROFILES;
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
      svc.saveTariffProfile(updated);
      setTariffs([
        ...svc
          .getAllTariffProfiles()
          .filter((t) => t.id !== 'tariff-smoke-house-rates' && t.id !== 'tariff-hourly-charter'),
      ]);
    } catch (e) {
      console.error('Error saving tariff profile:', e);
      setTariffs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    }
  };

  const handleDeleteTariff = async (id: string) => {
    try {
      const svc = getTariffService();
      svc.deleteTariffProfile(id);
      setTariffs([
        ...svc
          .getAllTariffProfiles()
          .filter((t) => t.id !== 'tariff-smoke-house-rates' && t.id !== 'tariff-hourly-charter'),
      ]);
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
      {/* Action banner with subtitle and simulator toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-5 py-3.5 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <DollarSignIcon className="w-4 h-4 text-emerald-600" />
            {activeTab === 'rates' && 'Tariffs & Pure Rate Models'}
            {activeTab === 'extras' && 'Universal Fleet Extras & Physical Add-ons'}
            {activeTab === 'surcharges' && 'Operational Surcharges & Access Fees'}
            {activeTab === 'rules' && 'Connective Pricing Rules & Zone Corridors'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeTab === 'rates' && 'Configure taximeter step increments, base flag drops, and contract matrices.'}
            {activeTab === 'extras' && 'Manage car seats, extra passenger fees, intermediate stops, and curb waiting grace.'}
            {activeTab === 'surcharges' && 'Manage commercial airport gate fees, surge multipliers, remote fees, and cancellations.'}
            {activeTab === 'rules' && 'Manage triggers connecting zones, corporate accounts, and trip attributes to tariffs.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
        <div className="flex-1 w-full min-w-0">
          {activeTab === 'rates' && (
            <RatesPanel
              tariffs={tariffs}
              vehicles={settings?.vehicles}
              onSaveTariff={handleSaveTariff}
              onDeleteTariff={handleDeleteTariff}
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

          {activeTab === 'surcharges' && (
            <SurchargesPanel
              surcharges={surcharges}
              tariffs={tariffs}
              vehicles={settings?.vehicles}
              onSave={handleSaveSurcharges}
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
