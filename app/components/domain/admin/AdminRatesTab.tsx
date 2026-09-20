import React from 'react';
import type { AppSettings } from '../../../core/types/config';
import { PricingAdminWorkspace, type PricingPillarTab } from './pricing/PricingAdminWorkspace';

export interface AdminRatesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?:
    | 'rates'
    | 'tariffs'
    | 'base'
    | 'extras'
    | 'condition_surcharges'
    | 'surcharges'
    | 'rules'
    | 'named_rules'
    | 'step_increments';
}

/**
 * AdminRatesTab
 *
 * Modern 4-Pillar Pricing & Tariff Management Workspace:
 * 1. Rates (Tariff Profiles: Taximeter, Zip Rate Matrix, Hourly Charter)
 * 2. Extras & Services (Car seats, extra passengers, stops, curb waiting)
 * 3. Surcharges (Airport gate fee, surge, remote radius, cancellations)
 * 4. Rules & Routing (Bidirectional airport transfers, overrules, rate layering)
 * Docked: Persistent Live Fare Simulator & Engine Audit Trail
 */
export function AdminRatesTab({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'rates',
}: AdminRatesTabProps) {
  let mappedTab: PricingPillarTab = 'rates';

  if (initialSubTab === 'extras' || initialSubTab === 'condition_surcharges') {
    mappedTab = 'extras';
  } else if (initialSubTab === 'surcharges') {
    mappedTab = 'surcharges';
  } else if (initialSubTab === 'rules' || initialSubTab === 'named_rules') {
    mappedTab = 'rules';
  } else {
    mappedTab = 'rates';
  }

  return (
    <PricingAdminWorkspace
      settings={settings}
      onSave={onSave}
      isLoading={isLoading}
      initialTab={mappedTab}
    />
  );
}
