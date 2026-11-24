import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../../../core/types/config';
import { CompanyProfilePanel } from './general/CompanyProfilePanel';
import { LocalizationAndUnitsPanel } from './general/LocalizationAndUnitsPanel';

export type GeneralSubTab = 'profile' | 'units';

export interface AdminGeneralTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: GeneralSubTab | 'localization' | string;
}

function normalizeGeneralSubTab(raw?: string): GeneralSubTab {
  if (raw === 'units' || raw === 'localization') {
    return 'units';
  }
  return 'profile';
}

export function AdminGeneralTab({
  settings,
  onSave,
  isLoading = false,
  initialSubTab = 'profile',
}: AdminGeneralTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<GeneralSubTab>(() =>
    normalizeGeneralSubTab(initialSubTab)
  );

  useEffect(() => {
    setActiveSubTab(normalizeGeneralSubTab(initialSubTab));
  }, [initialSubTab]);

  return (
    <div className="space-y-6">
      {activeSubTab === 'profile' ? (
        <CompanyProfilePanel
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      ) : (
        <LocalizationAndUnitsPanel
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
