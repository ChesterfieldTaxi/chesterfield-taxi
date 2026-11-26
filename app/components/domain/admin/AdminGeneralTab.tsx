import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../../../core/types/config';
import { useTheme } from '../../../hooks/useTheme';
import { AppearanceToggle } from '../../ui/AppearanceToggle';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { CompanyProfilePanel } from './general/CompanyProfilePanel';
import { LocalizationAndUnitsPanel } from './general/LocalizationAndUnitsPanel';

export type GeneralSubTab = 'profile' | 'units';

export interface AdminGeneralTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
  initialSubTab?: GeneralSubTab | 'localization' | string;
  uid?: string | null;
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
  uid = null,
}: AdminGeneralTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<GeneralSubTab>(() =>
    normalizeGeneralSubTab(initialSubTab)
  );
  const { preference: themePreference, setPreference: setThemePreference } = useTheme({
    uid,
    applyToDom: false,
  });

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

      <Card className="border border-border-subtle shadow-xs bg-surface-card">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black text-fg-primary">
                Console Appearance
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted mt-0.5">
                Choose Light, Dark, or System appearance for the Admin and Dispatch consoles.
              </CardDescription>
            </div>
            <span className="text-xs font-semibold text-fg-muted capitalize">
              {themePreference}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <AppearanceToggle
            variant="selector"
            preference={themePreference}
            onChange={setThemePreference}
            className="max-w-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
}
