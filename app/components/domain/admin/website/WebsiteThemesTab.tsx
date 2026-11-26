import React, { useState, useEffect } from 'react';
import type { AppSettings, BrandingConfig } from '../../../../core/types/config';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Badge } from '../../../ui/Badge';
import { AlertTriangleIcon, CheckIcon, PaletteIcon, SparklesIcon } from '../../../ui/Icons';
import { BrandLivePreviewCanvas } from './BrandLivePreviewCanvas';
import {
  FONT_OPTIONS,
  RADIUS_OPTIONS,
  THEME_PRESETS,
  hydrateBrandingFromSettings,
  type ThemePreset,
} from './theme-presets';

export { THEME_PRESETS, type ThemePreset };

export interface WebsiteThemesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export function WebsiteThemesTab({ settings, onSave, isLoading }: WebsiteThemesTabProps) {
  const [publishedBranding, setPublishedBranding] = useState<BrandingConfig>(() =>
    hydrateBrandingFromSettings(settings)
  );
  const [draftBranding, setDraftBranding] = useState<BrandingConfig>(() =>
    hydrateBrandingFromSettings(settings)
  );
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const hydrated = hydrateBrandingFromSettings(settings);
    setPublishedBranding(hydrated);
    if (!hasUnpublishedChanges) {
      setDraftBranding(hydrated);
    }
  }, [settings.branding]);

  const updateDraft = (updates: Partial<BrandingConfig>) => {
    setDraftBranding((prev) => ({ ...prev, ...updates }));
    setHasUnpublishedChanges(true);
  };

  const handleApplyPreset = (preset: ThemePreset) => {
    setDraftBranding((prev) => ({
      ...preset.tokens,
      logoUrl: prev.logoUrl || '',
    }));
    setHasUnpublishedChanges(true);
  };

  const handleDiscardDraft = () => {
    setDraftBranding({ ...publishedBranding });
    setHasUnpublishedChanges(false);
  };

  const handleResetDefaults = () => {
    setDraftBranding({
      ...THEME_PRESETS[0].tokens,
      logoUrl: draftBranding.logoUrl || '',
    });
    setHasUnpublishedChanges(true);
  };

  const handlePublishBranding = async () => {
    try {
      setIsPublishing(true);
      await onSave({
        branding: draftBranding,
        updatedAt: new Date().toISOString(),
      });
      setPublishedBranding({ ...draftBranding });
      setHasUnpublishedChanges(false);
      setSaveMessage('Brand tokens & theme published site-wide!');
      setTimeout(() => setSaveMessage(null), 4000);
    } finally {
      setIsPublishing(false);
    }
  };

  const colorPickers: Array<{
    key: keyof BrandingConfig;
    label: string;
    syncKey?: keyof BrandingConfig;
  }> = [
    { key: 'primaryColor', label: 'Primary Brand', syncKey: 'btnPrimaryBg' },
    { key: 'secondaryColor', label: 'Secondary / Accent', syncKey: 'btnSecondaryBg' },
    { key: 'navbarBg', label: 'Navbar Background' },
    { key: 'cardBg', label: 'Card Surface' },
    { key: 'btnPrimaryBg', label: 'Primary Button Bg' },
    { key: 'btnPrimaryText', label: 'Primary Button Text' },
    { key: 'headingColor', label: 'Heading Text' },
    { key: 'bodyTextColor', label: 'Body Text' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Unified Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-card p-4 sm:px-5 sm:py-4 rounded-2xl border border-border-subtle/80 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Unified Brand &amp; Theme Studio
            </span>
            {hasUnpublishedChanges ? (
              <Badge variant="warning" size="sm" className="inline-flex items-center gap-1">
                <AlertTriangleIcon className="w-3 h-3" />
                <span>Draft Preview</span>
              </Badge>
            ) : (
              <Badge variant="success" size="sm" className="inline-flex items-center gap-1">
                <CheckIcon className="w-3 h-3" />
                <span>Synced Site-Wide</span>
              </Badge>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-extrabold text-fg-primary mt-0.5">
            Themes, Colors, Typography &amp; Logo
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasUnpublishedChanges && (
            <Button type="button" variant="outline" size="sm" onClick={handleDiscardDraft}>
              Discard Draft
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isPublishing || isLoading}
            onClick={handlePublishBranding}
            leftIcon={<SparklesIcon className="w-4 h-4" />}
          >
            Publish Site-Wide
          </Button>
        </div>
      </div>

      {saveMessage && (
        <div className="p-3.5 bg-status-success-bg border border-status-success-border text-status-success-fg rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Curated Presets Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-fg-strong uppercase tracking-wider flex items-center gap-2">
          <PaletteIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Curated Brand Presets ({THEME_PRESETS.length})</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {THEME_PRESETS.map((preset) => {
            const isSelected =
              draftBranding.primaryColor === preset.tokens.primaryColor &&
              draftBranding.navbarBg === preset.tokens.navbarBg &&
              draftBranding.btnBorderRadius === preset.tokens.btnBorderRadius;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`cursor-pointer p-4 rounded-2xl border transition-all text-left flex flex-col justify-between group ${
                  isSelected
                    ? 'border-blue-600 bg-status-info-bg/40 ring-2 ring-blue-600 shadow-xs'
                    : 'border-border-subtle bg-surface-card hover:border-border-strong'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-xs font-extrabold text-fg-primary group-hover:text-blue-600">
                      {preset.name}
                    </span>
                    {preset.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-muted text-fg-secondary border border-border-subtle shrink-0">
                        {preset.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-fg-muted leading-snug mb-3">{preset.description}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border-faint">
                  <div className="flex items-center gap-1.5">
                    {preset.previewColors.map((hex, i) => (
                      <span
                        key={i}
                        className="w-5 h-5 rounded-md border border-black/10 inline-block"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-blue-600">
                    {isSelected ? '✓ Active' : 'Preview →'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Side-by-Side Granular Token Controls + Live Preview Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Granular Tokens (6 cols) */}
        <div className="lg:col-span-6 bg-surface-card p-4 sm:p-5 rounded-2xl border border-border-subtle shadow-xs space-y-5 text-xs">
          <div className="flex items-center justify-between border-b border-border-faint pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-fg-primary">Granular Brand Tokens</h3>
              <p className="text-[11px] text-fg-muted">Typography, corner radius, colors &amp; logo URL</p>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-[11px] font-bold text-fg-muted hover:text-blue-600 cursor-pointer"
            >
              Reset Defaults
            </button>
          </div>

          {/* Fonts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-fg-secondary block mb-1">Heading Font</label>
              <Select
                size="sm"
                value={draftBranding.headingFont || 'Inter'}
                onChange={(e) => updateDraft({ headingFont: e.target.value })}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="font-bold text-fg-secondary block mb-1">Body Font</label>
              <Select
                size="sm"
                value={draftBranding.bodyFont || 'Inter'}
                onChange={(e) => updateDraft({ bodyFont: e.target.value })}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Button Border Radius */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-fg-secondary">Button Corner Radius</span>
              <span className="font-mono font-bold text-blue-600">{draftBranding.btnBorderRadius}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateDraft({ btnBorderRadius: opt })}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    draftBranding.btnBorderRadius === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-surface-subtle text-fg-secondary border-border-subtle hover:bg-surface-muted'
                  }`}
                >
                  {opt === '9999px' ? 'Pill' : opt}
                </button>
              ))}
            </div>
          </div>

          {/* Color Tokens Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border-faint">
            {colorPickers.map(({ key, label, syncKey }) => {
              const val = (draftBranding[key] as string) || '#0f172a';
              return (
                <div key={key} className="p-2.5 bg-surface-subtle rounded-xl border border-border-subtle">
                  <label className="text-[11px] font-bold text-fg-secondary block mb-1">{label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={val}
                      onChange={(e) =>
                        updateDraft({
                          [key]: e.target.value,
                          ...(syncKey ? { [syncKey]: e.target.value } : {}),
                        })
                      }
                      className="w-8 h-8 rounded-lg border border-border-strong cursor-pointer p-0.5 bg-surface-card shrink-0"
                    />
                    <Input
                      value={val}
                      onChange={(e) =>
                        updateDraft({
                          [key]: e.target.value,
                          ...(syncKey ? { [syncKey]: e.target.value } : {}),
                        })
                      }
                      className="h-8 font-mono text-[11px] uppercase min-w-0 bg-surface-card"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom Logo URL */}
          <div className="pt-1 border-t border-border-faint">
            <Input
              label="Custom Brand Logo URL (Optional)"
              type="url"
              value={draftBranding.logoUrl || ''}
              onChange={(e) => updateDraft({ logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              helperText="Leave blank to render the default Chesterfield vehicle monogram"
            />
          </div>
        </div>

        {/* Right: Sticky Live Preview Canvas (6 cols) */}
        <div className="lg:col-span-6 lg:sticky lg:top-24">
          <BrandLivePreviewCanvas
            draftBranding={draftBranding}
            companyName={settings.company?.name || COMPANY_CONFIG.name}
            companyPhone={settings.company?.phone || COMPANY_CONFIG.phone.dispatch}
            hasUnpublishedChanges={hasUnpublishedChanges}
            isSaving={isPublishing || isLoading}
            onDiscardDraft={handleDiscardDraft}
            onPublishBranding={handlePublishBranding}
          />
        </div>
      </div>
    </div>
  );
}
