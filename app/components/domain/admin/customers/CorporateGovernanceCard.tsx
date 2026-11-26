import React, { useState, useEffect } from 'react';
import {
  normalizeCorporatePortalPolicy,
  type AppSettings,
  type CorporatePortalGovernanceConfig,
} from '../../../../core/types/config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { CheckIcon, ShieldCheckIcon } from '../../../ui/Icons';

export interface CorporateGovernanceCardProps {
  settings: AppSettings;
  onSave?: (updates: Partial<AppSettings>) => Promise<void>;
}

export function CorporateGovernanceCard({
  settings,
  onSave,
}: CorporateGovernanceCardProps) {
  const [draft, setDraft] = useState<CorporatePortalGovernanceConfig>(() =>
    normalizeCorporatePortalPolicy(settings.corporatePortalPolicy)
  );
  const [regexInput, setRegexInput] = useState<string>(
    () => normalizeCorporatePortalPolicy(settings.corporatePortalPolicy).poFormatRegex || ''
  );
  const [regexError, setRegexError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const normalized = normalizeCorporatePortalPolicy(settings.corporatePortalPolicy);
    setDraft(normalized);
    setRegexInput(normalized.poFormatRegex || '');
    setRegexError(null);
  }, [settings.corporatePortalPolicy]);

  const handleSavePolicy = async () => {
    if (!onSave) return;
    const trimmedRegex = regexInput.trim();
    if (trimmedRegex) {
      try {
        new RegExp(trimmedRegex);
      } catch {
        setRegexError('Invalid regular expression syntax. Example: ^PO-[0-9]{4,10}$');
        return;
      }
    }
    setRegexError(null);
    setIsSaving(true);
    try {
      const nextPolicy = normalizeCorporatePortalPolicy({
        ...draft,
        poFormatRegex: trimmedRegex || undefined,
      });
      await onSave({ corporatePortalPolicy: nextPolicy });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border border-status-staged-border/80 bg-surface-card shadow-xs">
      <CardHeader className="pb-3 border-b border-border-faint">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-black text-fg-primary flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Global Corporate Portal &amp; PO Governance</span>
            </CardTitle>
            <CardDescription className="text-xs text-fg-muted">
              Controls self-service permissions on <code>/app/corporate</code> and company-wide PO format validation.
            </CardDescription>
          </div>
          {onSave && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              onClick={handleSavePolicy}
              leftIcon={<CheckIcon className="w-3.5 h-3.5" />}
              className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 cursor-pointer"
            >
              {savedNotice ? 'Policy Saved' : 'Save Governance'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-3.5 space-y-3 text-xs">
        {regexError && (
          <div className="p-2.5 rounded-xl bg-status-danger-bg border border-status-danger-border text-status-danger-fg font-semibold">
            {regexError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/80 flex items-start justify-between gap-2 cursor-pointer">
            <div>
              <span className="font-bold text-fg-primary block">Self-Manage Riders</span>
              <span className="text-[11px] text-fg-muted">
                Allow portal managers to add/remove authorized travelers
              </span>
            </div>
            <input
              type="checkbox"
              checked={draft.allowSelfManageRiders}
              onChange={(e) =>
                setDraft((p) => ({ ...p, allowSelfManageRiders: e.target.checked }))
              }
              className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
            />
          </label>

          <label className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/80 flex items-start justify-between gap-2 cursor-pointer">
            <div>
              <span className="font-bold text-fg-primary block">Self-Manage Locations</span>
              <span className="text-[11px] text-fg-muted">
                Allow portal managers to edit saved company places
              </span>
            </div>
            <input
              type="checkbox"
              checked={draft.allowSelfManageSavedLocations}
              onChange={(e) =>
                setDraft((p) => ({ ...p, allowSelfManageSavedLocations: e.target.checked }))
              }
              className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
            />
          </label>

          <label className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/80 flex items-start justify-between gap-2 cursor-pointer">
            <div>
              <span className="font-bold text-fg-primary block">Require PO by Default</span>
              <span className="text-[11px] text-fg-muted">
                Enforce PO numbers automatically on new corporate accounts
              </span>
            </div>
            <input
              type="checkbox"
              checked={draft.defaultRequirePoForNewAccounts}
              onChange={(e) =>
                setDraft((p) => ({ ...p, defaultRequirePoForNewAccounts: e.target.checked }))
              }
              className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
            />
          </label>

          <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-subtle/80 space-y-1">
            <label className="font-bold text-fg-primary block">
              PO Format Regex (Optional)
            </label>
            <input
              type="text"
              value={regexInput}
              onChange={(e) => setRegexInput(e.target.value)}
              placeholder="e.g. ^PO-[A-Z0-9-]{4,14}$"
              className="w-full px-2.5 py-1.5 bg-surface-card border border-border-strong rounded-lg text-xs font-mono text-fg-primary"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
