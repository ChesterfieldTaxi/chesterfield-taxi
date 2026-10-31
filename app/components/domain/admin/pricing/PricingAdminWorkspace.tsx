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

  // Hydrate all 4 pricing pillars from Firestore on mount
  React.useEffect(() => {
    let mounted = true;
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
          const filtered = cloudTariffs.filter(
            (t) => t.id !== 'tariff-smoke-house-rates' && t.id !== 'tariff-hourly-charter'
          );
          if (filtered.length > 0) setTariffs(filtered);
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
    };
  }, []);

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

  const activeCustomSurchargesCount = (surcharges.customSurcharges || []).filter((s) => s.isActive).length;
  const activeRulesCount = rules.filter((r) => r.isActive).length;

  return (
    <div className="space-y-4">
      {/* Structured 4-Stage Pricing Pipeline Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Pillar 1: Base Tariffs & Stepped Meter */}
          <button
            type="button"
            onClick={() => setActiveTab('rates')}
            className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'rates'
                ? 'bg-emerald-50/90 border-emerald-500 shadow-2xs ring-1 ring-emerald-500/30'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                <DollarSignIcon className="w-3.5 h-3.5" />
                1. Tariffs &amp; Meter Tiers
              </span>
              <Badge variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-700">
                {tariffs.length} Models
              </Badge>
            </div>
            <p className="text-xs font-bold text-slate-900">Stepped Increments &amp; Flat Rates</p>
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              Flag drop, stepped distance brackets (0.2 mi), &amp; STL flat matrix
            </p>
          </button>

          {/* Pillar 2: Surcharges & Fuel Recovery */}
          <button
            type="button"
            onClick={() => setActiveTab('surcharges')}
            className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'surcharges'
                ? 'bg-amber-50/90 border-amber-500 shadow-2xs ring-1 ring-amber-500/30'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                <ZapIcon className="w-3.5 h-3.5" />
                2. Surcharges &amp; Gas Fee
              </span>
              <div className="flex items-center gap-1">
                {surcharges.isFuelSurchargeActive && (
                  <Badge variant="outline" className="text-[9px] bg-orange-100 border-orange-300 text-orange-800">
                    Fuel ON
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-700">
                  {activeCustomSurchargesCount} Custom
                </Badge>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-900">Built-In Fuel, Airport &amp; Surge</p>
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              Gas surcharge, ${(surcharges.airportGateFee ?? 4).toFixed(2)} STL gate, surge &amp; custom rules
            </p>
          </button>

          {/* Pillar 3: Universal Fleet Extras */}
          <button
            type="button"
            onClick={() => setActiveTab('extras')}
            className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'extras'
                ? 'bg-blue-50/90 border-blue-500 shadow-2xs ring-1 ring-blue-500/30'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1">
                <SparklesIcon className="w-3.5 h-3.5" />
                3. Universal Fleet Extras
              </span>
              <Badge variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-700">
                5 Add-ons
              </Badge>
            </div>
            <p className="text-xs font-bold text-slate-900">Seats, Extra Pax &amp; Stops</p>
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              ${universalExtras.carSeatFeePerUnit}/seat, +${universalExtras.extraPassengerFeePerHead}/pax, ${universalExtras.intermediateStopFee}/stop
            </p>
          </button>

          {/* Pillar 4: Connective Rules & Zone Routing */}
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeTab === 'rules'
                ? 'bg-purple-50/90 border-purple-500 shadow-2xs ring-1 ring-purple-500/30'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1">
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                4. Rules &amp; Conditions
              </span>
              <Badge variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-700">
                {activeRulesCount} Active
              </Badge>
            </div>
            <p className="text-xs font-bold text-slate-900">Conditions, Zones &amp; Actions</p>
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              Bidirectional zone triggers, corporate overrides &amp; waivers
            </p>
          </button>
        </div>

        {/* Action sub-bar with context & simulator toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 px-1">
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
