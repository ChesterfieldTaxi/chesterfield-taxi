import React, { useState } from 'react';
import type { AppSettings, CompanyConfig, BrandingConfig, LocalizationConfig } from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { CheckIcon, SparklesIcon, CarIcon, ClockIcon } from '../../ui/Icons';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export interface AdminGeneralTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

const DEFAULT_BRANDING: BrandingConfig = {
  primaryColor: COMPANY_CONFIG.primaryColor || '#f59e0b',
  secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a',
  headingFont: COMPANY_CONFIG.headingFont || 'Inter',
  bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
  headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
  bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
  mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
  btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#f59e0b',
  btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#020617',
  btnSecondaryBg: COMPANY_CONFIG.btnSecondaryBg || '#0f172a',
  btnSecondaryText: COMPANY_CONFIG.btnSecondaryText || '#ffffff',
  btnBorderRadius: COMPANY_CONFIG.btnBorderRadius || '8px',
  navbarBg: COMPANY_CONFIG.navbarBg || '#0f172a',
  cardBg: COMPANY_CONFIG.cardBg || '#ffffff',
  logoUrl: '',
};

interface PalettePreset {
  id: string;
  name: string;
  description: string;
  tokens: Partial<BrandingConfig>;
}

const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'chesterfield',
    name: 'Chesterfield Amber & Slate (Default)',
    description: 'Iconic metropolitan taxi identity with vibrant amber accents and high-contrast slate navy.',
    tokens: {
      primaryColor: '#f59e0b',
      secondaryColor: '#0f172a',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      headingColor: '#0f172a',
      bodyTextColor: '#334155',
      mutedTextColor: '#64748b',
      btnPrimaryBg: '#f59e0b',
      btnPrimaryText: '#020617',
      btnSecondaryBg: '#0f172a',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '8px',
      navbarBg: '#0f172a',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'midnight_navy',
    name: 'Executive Midnight Blue',
    description: 'Sophisticated corporate luxury livery with modern Outfit typography and sapphire highlights.',
    tokens: {
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      headingFont: 'Outfit',
      bodyFont: 'Plus Jakarta Sans',
      headingColor: '#0f172a',
      bodyTextColor: '#1e293b',
      mutedTextColor: '#64748b',
      btnPrimaryBg: '#2563eb',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#0f172a',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '8px',
      navbarBg: '#0f172a',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'gold_charcoal',
    name: 'Luxury Gold & Charcoal',
    description: 'Premium black-car aesthetic with elegant Cinzel serif headings and gold metallic buttons.',
    tokens: {
      primaryColor: '#d97706',
      secondaryColor: '#18181b',
      headingFont: 'Cinzel',
      bodyFont: 'Lato',
      headingColor: '#18181b',
      bodyTextColor: '#27272a',
      mutedTextColor: '#71717a',
      btnPrimaryBg: '#d97706',
      btnPrimaryText: '#09090b',
      btnSecondaryBg: '#18181b',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '4px',
      navbarBg: '#18181b',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'emerald_fleet',
    name: 'Modern Emerald & Platinum',
    description: 'Eco-forward electric livery featuring rounded buttons and vivid emerald green styling.',
    tokens: {
      primaryColor: '#059669',
      secondaryColor: '#111827',
      headingFont: 'Plus Jakarta Sans',
      bodyFont: 'Plus Jakarta Sans',
      headingColor: '#111827',
      bodyTextColor: '#374151',
      mutedTextColor: '#6b7280',
      btnPrimaryBg: '#059669',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#111827',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '12px',
      navbarBg: '#111827',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'monochrome',
    name: 'Minimalist Monochrome',
    description: 'Sharp architectural black-and-white theme with zero-radius square edges.',
    tokens: {
      primaryColor: '#000000',
      secondaryColor: '#1f2937',
      headingFont: 'Inter',
      bodyFont: 'Roboto',
      headingColor: '#000000',
      bodyTextColor: '#374151',
      mutedTextColor: '#6b7280',
      btnPrimaryBg: '#000000',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#374151',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '0px',
      navbarBg: '#000000',
      cardBg: '#ffffff',
    },
  },
];

const HEADING_FONTS = [
  'Inter',
  'Outfit',
  'Montserrat',
  'Plus Jakarta Sans',
  'Playfair Display',
  'Cinzel',
  'System UI',
];

const BODY_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Plus Jakarta Sans',
  'System UI',
];

const RADIUS_OPTIONS = ['0px', '4px', '8px', '12px', '16px', '9999px'];

export function AdminGeneralTab({ settings, onSave, isLoading = false }: AdminGeneralTabProps) {
  // Navigation Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'studio' | 'profile'>('studio');

  // Company and Localization State
  const [company, setCompany] = useState<CompanyConfig>({ ...settings.company });
  const [localization, setLocalization] = useState<LocalizationConfig>({
    currency: settings.localization?.currency || 'USD',
    currencySymbol: settings.localization?.currencySymbol || '$',
    timezone: settings.localization?.timezone || 'America/Chicago',
    timeFormat: settings.localization?.timeFormat || '12h',
    dateFormat: settings.localization?.dateFormat || 'MM/DD/YYYY',
  });
  const [operatingSchedule, setOperatingSchedule] = useState({
    is24x7: true,
    dispatchNotes: '24/7 continuous dispatch coverage across Chesterfield and Greater St. Louis.',
    phoneSupportHours: '24 Hours / 7 Days a Week',
  });
  const [publicFormVersion, setPublicFormVersion] = useState<'v1' | 'v2'>(
    settings.publicFormVersion || 'v2'
  );

  // Dynamic Branding Studio State (Decoupled Draft vs Published)
  const initialBranding: BrandingConfig = {
    ...DEFAULT_BRANDING,
    ...(settings.branding || {}),
  };
  const [publishedBranding, setPublishedBranding] = useState<BrandingConfig>(initialBranding);
  const [draftBranding, setDraftBranding] = useState<BrandingConfig>(initialBranding);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState<boolean>(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Status banners
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Update draft branding helper
  const updateDraft = (updates: Partial<BrandingConfig>) => {
    setDraftBranding((prev) => ({ ...prev, ...updates }));
    setHasUnpublishedChanges(true);
  };

  // Apply a preset
  const handleApplyPreset = (preset: PalettePreset) => {
    setDraftBranding((prev) => ({ ...prev, ...preset.tokens }));
    setHasUnpublishedChanges(true);
  };

  // Discard draft changes and revert to published
  const handleDiscardDraft = () => {
    setDraftBranding({ ...publishedBranding });
    setHasUnpublishedChanges(false);
  };

  // Reset to Chesterfield Taxi default brand
  const handleResetDefaults = () => {
    setDraftBranding({ ...DEFAULT_BRANDING });
    setHasUnpublishedChanges(true);
  };

  // Publish Branding Changes to Site-Wide
  const handlePublishBranding = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(null);
      setSaveError(null);

      await onSave({
        branding: draftBranding,
      });

      setPublishedBranding({ ...draftBranding });
      setHasUnpublishedChanges(false);
      setSaveSuccess('Branding tokens successfully published site-wide! CSS custom properties have been refreshed.');
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to publish branding to site-wide.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save General Profile and Localization settings
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccess(null);
      setSaveError(null);

      await onSave({
        company,
        localization,
        publicFormVersion,
      });

      setSaveSuccess('Company profile and regional localization saved successfully.');
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save company profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // Parse radius numeric value for slider
  const radiusNum = parseInt(draftBranding.btnBorderRadius || '8', 10) || 0;

  // Scoped CSS styles for live preview canvas
  const canvasStyles: React.CSSProperties = {
    '--color-primary': draftBranding.primaryColor,
    '--color-secondary': draftBranding.secondaryColor,
    '--brand-primary': draftBranding.primaryColor,
    '--brand-secondary': draftBranding.secondaryColor,
    '--font-heading': `'${draftBranding.headingFont || 'Inter'}', sans-serif`,
    '--font-body': `'${draftBranding.bodyFont || 'Inter'}', sans-serif`,
    '--color-heading': draftBranding.headingColor || '#0f172a',
    '--color-text-main': draftBranding.bodyTextColor || '#334155',
    '--color-text-muted': draftBranding.mutedTextColor || '#64748b',
    '--btn-primary-bg': draftBranding.btnPrimaryBg || '#f59e0b',
    '--btn-primary-text': draftBranding.btnPrimaryText || '#020617',
    '--btn-secondary-bg': draftBranding.btnSecondaryBg || '#0f172a',
    '--btn-secondary-text': draftBranding.btnSecondaryText || '#ffffff',
    '--btn-radius': draftBranding.btnBorderRadius || '8px',
    '--navbar-bg': draftBranding.navbarBg || '#0f172a',
    '--card-bg': draftBranding.cardBg || '#ffffff',
  } as React.CSSProperties;

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('studio')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'studio'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <SparklesIcon className="w-4 h-4 text-amber-300" />
            <span>🎨 Dynamic Branding Studio</span>
            {hasUnpublishedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Unpublished changes" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'profile'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🏢 Business Profile &amp; Localization</span>
          </button>
        </div>

        {activeSubTab === 'studio' && (
          <div className="flex items-center gap-2">
            {hasUnpublishedChanges ? (
              <Badge variant="warning" size="sm">
                ⚠️ Live Canvas (Draft Isolating)
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                ✓ Published &amp; Synced Site-Wide
              </Badge>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isSaving || isLoading}
              onClick={handlePublishBranding}
              disabled={!hasUnpublishedChanges && isSaving}
              leftIcon={<CheckIcon className="w-4 h-4" />}
            >
              Publish Changes to Site-Wide
            </Button>
          </div>
        )}
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Success">
          {saveSuccess}
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Error">
          {saveError}
        </Alert>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 1: DYNAMIC BRANDING STUDIO (SIDE-BY-SIDE EDITOR & CANVAS) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: STUDIO CONTROLS (5 COLS) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Quick Theme Presets */}
            <Card variant="elevated" className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
                <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                  <span className="text-base">🪄</span>
                  Curated Brand Presets
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Select a ready-to-use color and font palette to jumpstart your theme.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {PALETTE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/30 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 group-hover:text-blue-700">
                        {preset.name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                        {preset.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <div
                        className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: preset.tokens.primaryColor }}
                        title="Primary Color"
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: preset.tokens.secondaryColor }}
                        title="Secondary Color"
                      />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Typography Controls */}
            <Card variant="elevated" className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
                <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                  <span className="text-base">🔤</span>
                  Typography &amp; Text Colors
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Select heading and body fonts, plus text contrast colors.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Font Families */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Heading Font
                    </label>
                    <select
                      value={draftBranding.headingFont || 'Inter'}
                      onChange={(e) => updateDraft({ headingFont: e.target.value })}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    >
                      {HEADING_FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Body Font
                    </label>
                    <select
                      value={draftBranding.bodyFont || 'Inter'}
                      onChange={(e) => updateDraft({ bodyFont: e.target.value })}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    >
                      {BODY_FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Text Colors */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Heading Color
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={draftBranding.headingColor || '#0f172a'}
                        onChange={(e) => updateDraft({ headingColor: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        type="text"
                        value={draftBranding.headingColor || '#0f172a'}
                        onChange={(e) => updateDraft({ headingColor: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Body Text
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={draftBranding.bodyTextColor || '#334155'}
                        onChange={(e) => updateDraft({ bodyTextColor: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        type="text"
                        value={draftBranding.bodyTextColor || '#334155'}
                        onChange={(e) => updateDraft({ bodyTextColor: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Muted Text
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={draftBranding.mutedTextColor || '#64748b'}
                        onChange={(e) => updateDraft({ mutedTextColor: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        type="text"
                        value={draftBranding.mutedTextColor || '#64748b'}
                        onChange={(e) => updateDraft({ mutedTextColor: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Buttons & Border Radius */}
            <Card variant="elevated" className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
                <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                  <span className="text-base">🔘</span>
                  Buttons &amp; Corner Radius
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Customize button fills, labels, and global border curvature.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Primary Button Colors */}
                <div>
                  <span className="font-bold text-slate-800 block mb-1.5">Primary Button</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Background</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={draftBranding.btnPrimaryBg || '#f59e0b'}
                          onChange={(e) => updateDraft({ btnPrimaryBg: e.target.value, primaryColor: e.target.value })}
                          className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={draftBranding.btnPrimaryBg || '#f59e0b'}
                          onChange={(e) => updateDraft({ btnPrimaryBg: e.target.value, primaryColor: e.target.value })}
                          className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Text Color</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={draftBranding.btnPrimaryText || '#020617'}
                          onChange={(e) => updateDraft({ btnPrimaryText: e.target.value })}
                          className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={draftBranding.btnPrimaryText || '#020617'}
                          onChange={(e) => updateDraft({ btnPrimaryText: e.target.value })}
                          className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secondary Button Colors */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-800 block mb-1.5">Secondary Button</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Background</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={draftBranding.btnSecondaryBg || '#0f172a'}
                          onChange={(e) => updateDraft({ btnSecondaryBg: e.target.value, secondaryColor: e.target.value })}
                          className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={draftBranding.btnSecondaryBg || '#0f172a'}
                          onChange={(e) => updateDraft({ btnSecondaryBg: e.target.value, secondaryColor: e.target.value })}
                          className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Text Color</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={draftBranding.btnSecondaryText || '#ffffff'}
                          onChange={(e) => updateDraft({ btnSecondaryText: e.target.value })}
                          className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={draftBranding.btnSecondaryText || '#ffffff'}
                          onChange={(e) => updateDraft({ btnSecondaryText: e.target.value })}
                          className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Button Border Radius Slider & Pills */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800">Corner Radius</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">
                      {draftBranding.btnBorderRadius || '8px'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="1"
                    value={radiusNum > 24 ? 24 : radiusNum}
                    onChange={(e) => updateDraft({ btnBorderRadius: `${e.target.value}px` })}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 mt-2">
                    {RADIUS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateDraft({ btnBorderRadius: opt })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                          draftBranding.btnBorderRadius === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt === '9999px' ? 'Pill' : opt}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Surfaces & Navigation */}
            <Card variant="elevated" className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
                <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                  <span className="text-base">🖥️</span>
                  Surfaces &amp; Structural Backgrounds
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Configure navbar and card background styling.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Navbar Background
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={draftBranding.navbarBg || '#0f172a'}
                        onChange={(e) => updateDraft({ navbarBg: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        type="text"
                        value={draftBranding.navbarBg || '#0f172a'}
                        onChange={(e) => updateDraft({ navbarBg: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Card / Surface Fill
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={draftBranding.cardBg || '#ffffff'}
                        onChange={(e) => updateDraft({ cardBg: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        type="text"
                        value={draftBranding.cardBg || '#ffffff'}
                        onChange={(e) => updateDraft({ cardBg: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-slate-300 text-[11px] font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Custom Logo URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={draftBranding.logoUrl || ''}
                    onChange={(e) => updateDraft({ logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="w-full h-8 px-2.5 rounded border border-slate-300 text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Leave blank to display the signature Chesterfield vehicle monogram.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 p-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  disabled={!hasUnpublishedChanges}
                  className="text-xs text-slate-600 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  Discard Draft
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs text-slate-600 hover:text-blue-600 font-medium"
                >
                  Reset Defaults
                </button>
              </CardFooter>
            </Card>
          </div>

          {/* RIGHT COLUMN: ISOLATED LIVE PREVIEW CANVAS (7 COLS) */}
          <div className="lg:col-span-7 sticky top-24 space-y-3">
            {/* Canvas Header Bar */}
            <div className="bg-slate-900 text-white px-4 py-2.5 rounded-t-2xl flex items-center justify-between text-xs shadow-md">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                </div>
                <span className="text-slate-400 font-mono text-[11px] ml-2">
                  Live Preview Canvas (Isolated Scope)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-slate-800 p-0.5 rounded-lg flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      previewDevice === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      previewDevice === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    Mobile
                  </button>
                </div>
              </div>
            </div>

            {/* Canvas Outer Wrapper with Scoped CSS Custom Properties */}
            <div
              className={`mx-auto bg-slate-100 rounded-b-2xl border-x border-b border-slate-300 overflow-hidden shadow-lg transition-all ${
                previewDevice === 'mobile' ? 'max-w-sm' : 'w-full'
              }`}
              style={canvasStyles}
            >
              {/* Mock Navigation Bar */}
              <div
                className="px-4 py-3 border-b flex items-center justify-between transition-colors"
                style={{ backgroundColor: 'var(--navbar-bg)', borderColor: 'rgba(255,255,255,0.1)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm transition-all"
                    style={{
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                      borderRadius: 'var(--btn-radius)',
                    }}
                  >
                    🚕
                  </div>
                  <div>
                    <h3
                      className="text-xs font-black tracking-tight leading-none text-white"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {company.name || 'Chesterfield Taxi'}
                    </h3>
                    <span
                      className="text-[9px] font-semibold tracking-wider uppercase leading-none"
                      style={{ color: 'var(--btn-primary-bg)' }}
                    >
                      Car Service
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1 text-[11px] font-bold shadow-2xs transition-all"
                    style={{
                      backgroundColor: 'var(--btn-primary-bg)',
                      color: 'var(--btn-primary-text)',
                      borderRadius: 'var(--btn-radius)',
                    }}
                  >
                    Call (314) 738-0100
                  </button>
                </div>
              </div>

              {/* Mock Hero & Booking Component */}
              <div className="p-5 space-y-4">
                {/* Hero Headline */}
                <div className="text-center space-y-1">
                  <h2
                    className="text-lg font-black tracking-tight"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-heading)',
                    }}
                  >
                    Reliable Chesterfield &amp; Airport Transportation
                  </h2>
                  <p
                    className="text-xs max-w-md mx-auto"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: 'var(--color-text-main)',
                    }}
                  >
                    Continuous 24/7 service with flight tracking, child car safety seats, and corporate accounts.
                  </p>
                </div>

                {/* Mock Booking Surface Card */}
                <div
                  className="p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 transition-colors"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                  }}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span
                      className="font-bold text-xs"
                      style={{
                        fontFamily: 'var(--font-heading)',
                        color: 'var(--color-heading)',
                      }}
                    >
                      Instant Rate Estimator
                    </span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5"
                      style={{
                        backgroundColor: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                        borderRadius: 'var(--btn-radius)',
                      }}
                    >
                      Guaranteed Fixed Rate
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span
                        className="text-[9px] uppercase font-bold block"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        Pickup Location
                      </span>
                      <span
                        className="font-semibold truncate block"
                        style={{ color: 'var(--color-text-main)' }}
                      >
                        Chesterfield Mall
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span
                        className="text-[9px] uppercase font-bold block"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        Dropoff Destination
                      </span>
                      <span
                        className="font-semibold truncate block"
                        style={{ color: 'var(--color-text-main)' }}
                      >
                        St. Louis Lambert Airport (STL)
                      </span>
                    </div>
                  </div>

                  {/* Estimated Fare Row */}
                  <div className="flex items-center justify-between p-2.5 bg-slate-50/70 rounded-lg border border-slate-100">
                    <div>
                      <span
                        className="text-xs font-bold block"
                        style={{ color: 'var(--color-heading)' }}
                      >
                        Estimated Total:
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        18.4 mi &bull; 24 min trip
                      </span>
                    </div>
                    <div
                      className="text-base font-extrabold font-mono"
                      style={{ color: 'var(--color-heading)' }}
                    >
                      $45.00
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      className="w-full py-2 text-xs font-bold shadow-2xs transition-all active:scale-98"
                      style={{
                        backgroundColor: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                        borderRadius: 'var(--btn-radius)',
                        fontFamily: 'var(--font-heading)',
                      }}
                    >
                      Book Ride Now &rarr;
                    </button>
                    <button
                      type="button"
                      className="w-full py-2 text-xs font-bold shadow-2xs transition-all active:scale-98"
                      style={{
                        backgroundColor: 'var(--btn-secondary-bg)',
                        color: 'var(--btn-secondary-text)',
                        borderRadius: 'var(--btn-radius)',
                        fontFamily: 'var(--font-heading)',
                      }}
                    >
                      Corporate Portal
                    </button>
                  </div>
                </div>

                {/* Tokens Inspection Bar */}
                <div className="p-2.5 rounded-lg bg-slate-200/70 border border-slate-300/60 text-[10px] space-y-1">
                  <div className="flex items-center justify-between text-slate-700 font-bold">
                    <span>Active Draft Tokens:</span>
                    <span className="font-mono">Radius: {draftBranding.btnBorderRadius}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 text-slate-600 font-mono">
                    <div>Heading: {draftBranding.headingFont}</div>
                    <div>Body: {draftBranding.bodyFont}</div>
                    <div className="flex items-center gap-1">
                      <span>Primary:</span>
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: draftBranding.btnPrimaryBg }} />
                      <span>{draftBranding.btnPrimaryBg}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>Secondary:</span>
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: draftBranding.btnSecondaryBg }} />
                      <span>{draftBranding.btnSecondaryBg}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Publish Banner */}
            {hasUnpublishedChanges && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-900 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>You have unpublished style changes in this preview.</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="px-2.5 py-1 text-slate-700 hover:text-red-700 font-bold text-[11px]"
                  >
                    Discard
                  </button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handlePublishBranding}
                    isLoading={isSaving}
                  >
                    Publish Site-Wide
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SUB-TAB 2: COMPANY PROFILE & REGIONAL LOCALIZATION */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Business Profile */}
            <div className="lg:col-span-7 space-y-6">
              <Card variant="elevated" className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                    <span className="text-lg">🏢</span>
                    Company Details &amp; Business Profile
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Official business credentials rendered on invoices, email receipts, and driver manifests.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Display Brand Name"
                      value={company.name}
                      onChange={(e) => setCompany((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Chesterfield Taxi & Car Service"
                      required
                    />
                    <Input
                      label="Legal Entity Name"
                      value={company.name ? `${company.name} LLC` : 'Chesterfield Taxi LLC'}
                      disabled
                      helperText="Registered with Missouri Secretary of State"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Primary Dispatch Telephone"
                      value={company.phone}
                      onChange={(e) => setCompany((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="(314) 738-0100"
                      required
                    />
                    <Input
                      label="Customer Support Email"
                      type="email"
                      value={company.email}
                      onChange={(e) => setCompany((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="dispatch@chesterfieldtaxi.com"
                      required
                    />
                  </div>

                  <Input
                    label="Physical Headquarters Address"
                    value={company.address}
                    onChange={(e) => setCompany((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder={COMPANY_CONFIG.address.formatted}
                    required
                  />
                </CardContent>
              </Card>

              {/* Operating Hours */}
              <Card variant="elevated" className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-amber-500" />
                        Operating Hours &amp; Availability
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Fleet operational hours displayed to riders.
                      </CardDescription>
                    </div>
                    <Badge variant="success" size="sm">
                      24/7/365 Continuous
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                        ✓
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900">
                          Continuous 24-Hour Operations
                        </h4>
                        <p className="text-[11px] text-slate-600">
                          Dispatchers and on-call drivers respond 24/7 for early airport departures.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={operatingSchedule.is24x7}
                        onChange={(e) =>
                          setOperatingSchedule((prev) => ({ ...prev, is24x7: e.target.checked }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-800 block mb-1">Weekly Service Schedule</span>
                      <p className="text-slate-600 text-[11px]">
                        Monday – Sunday: Open 24 Hours
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-800 block mb-1">Airport Advance Booking</span>
                      <p className="text-slate-600 text-[11px]">
                        Reservations accepted up to 90 days in advance
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Localization */}
            <div className="lg:col-span-5 space-y-6">
              <Card variant="elevated" className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                    <span className="text-lg">🌐</span>
                    Regional Localization &amp; Currency
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Configure operational timezone and currency formatting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4 text-xs">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Operational Timezone
                    </label>
                    <select
                      value={localization.timezone}
                      onChange={(e) =>
                        setLocalization((prev) => ({ ...prev, timezone: e.target.value }))
                      }
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-medium text-slate-900"
                    >
                      <option value="America/Chicago">America/Chicago (Central Time - St. Louis)</option>
                      <option value="America/New_York">America/New_York (Eastern Time)</option>
                      <option value="America/Denver">America/Denver (Mountain Time)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Currency Symbol &amp; Code
                    </label>
                    <select
                      value={localization.currency}
                      onChange={(e) =>
                        setLocalization((prev) => ({
                          ...prev,
                          currency: e.target.value,
                          currencySymbol: e.target.value === 'EUR' ? '€' : e.target.value === 'GBP' ? '£' : '$',
                        }))
                      }
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-medium text-slate-900"
                    >
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="CAD">CAD ($) - Canadian Dollar</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date Display Format
                    </label>
                    <select
                      value={localization.dateFormat}
                      onChange={(e) =>
                        setLocalization((prev) => ({ ...prev, dateFormat: e.target.value }))
                      }
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-medium text-slate-900"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (ISO Format)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                    </select>
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/50 p-4 border-t border-slate-100 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSaving || isLoading}
                    leftIcon={<CheckIcon className="w-4 h-4" />}
                  >
                    Save Business Profile
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
