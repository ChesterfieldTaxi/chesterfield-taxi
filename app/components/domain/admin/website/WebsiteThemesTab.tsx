import React, { useState } from 'react';
import type { AppSettings, BrandingConfig } from '../../../../core/types/config';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { CheckIcon, SparklesIcon, CarIcon, ShieldCheckIcon } from '../../../ui/Icons';

export interface WebsiteThemesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export interface ThemePreset {
  id: string;
  name: string;
  badge?: string;
  description: string;
  previewColors: string[];
  tokens: BrandingConfig;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'chesterfield_royal_blue',
    name: 'Chesterfield Royal (Current Main)',
    badge: 'Active Default',
    description: 'Clean high-trust metropolitan car service theme with vibrant royal blue primary, dark slate navbar, and rounded UI accents.',
    previewColors: ['#2563eb', '#0f172a', '#ffffff', '#3b82f6'],
    tokens: {
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      headingColor: '#0f172a',
      bodyTextColor: '#334155',
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
    id: 'executive_midnight_gold',
    name: 'Executive Midnight & Champagne Gold',
    badge: 'Chauffeur Luxury',
    description: 'Opulent executive limousine aesthetic featuring rich warm amber gold accents against an ultra-dark midnight obsidian canvas.',
    previewColors: ['#d97706', '#090d16', '#fef3c7', '#f59e0b'],
    tokens: {
      primaryColor: '#d97706',
      secondaryColor: '#090d16',
      headingFont: 'Outfit',
      bodyFont: 'Plus Jakarta Sans',
      headingColor: '#090d16',
      bodyTextColor: '#1f2937',
      mutedTextColor: '#6b7280',
      btnPrimaryBg: '#d97706',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#090d16',
      btnSecondaryText: '#fef3c7',
      btnBorderRadius: '6px',
      navbarBg: '#090d16',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'electric_sapphire',
    name: 'Electric Sapphire & Tech Cyan',
    badge: 'Modern On-Demand',
    description: 'High-energy contemporary ride-hail theme featuring brilliant sapphire blues, cyan glow highlights, and modern geometric styling.',
    previewColors: ['#1d4ed8', '#0f172a', '#06b6d4', '#e0f2fe'],
    tokens: {
      primaryColor: '#1d4ed8',
      secondaryColor: '#0f172a',
      headingFont: 'Plus Jakarta Sans',
      bodyFont: 'Inter',
      headingColor: '#0f172a',
      bodyTextColor: '#334155',
      mutedTextColor: '#64748b',
      btnPrimaryBg: '#1d4ed8',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#0f172a',
      btnSecondaryText: '#38bdf8',
      btnBorderRadius: '12px',
      navbarBg: '#0b1329',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'emerald_prestige',
    name: 'Emerald Prestige & Platinum',
    badge: 'Eco & Premium',
    description: 'Sophisticated eco-fleet aesthetic with lush deep emerald tones, platinum gray structure, and friendly rounded components.',
    previewColors: ['#059669', '#064e3b', '#f3f4f6', '#10b981'],
    tokens: {
      primaryColor: '#059669',
      secondaryColor: '#064e3b',
      headingFont: 'Outfit',
      bodyFont: 'Inter',
      headingColor: '#064e3b',
      bodyTextColor: '#374151',
      mutedTextColor: '#6b7280',
      btnPrimaryBg: '#059669',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#064e3b',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '10px',
      navbarBg: '#042f2e',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'vintage_metro_amber',
    name: 'Vintage Metro Taxi (Amber & Slate)',
    badge: 'Iconic Fleet',
    description: 'Traditional American metered cab visual identity with unmistakable yellow-amber livery and bold black typography.',
    previewColors: ['#f59e0b', '#0f172a', '#18181b', '#fef08a'],
    tokens: {
      primaryColor: '#f59e0b',
      secondaryColor: '#0f172a',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      headingColor: '#0f172a',
      bodyTextColor: '#27272a',
      mutedTextColor: '#71717a',
      btnPrimaryBg: '#f59e0b',
      btnPrimaryText: '#09090b',
      btnSecondaryBg: '#0f172a',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '8px',
      navbarBg: '#0f172a',
      cardBg: '#ffffff',
    },
  },
  {
    id: 'monochrome_obsidian',
    name: 'Monochrome Obsidian Minimalist',
    badge: 'High Contrast',
    description: 'Stark, razor-sharp architectural layout with zero-radius corners, pure black buttons, and graphite accents.',
    previewColors: ['#000000', '#18181b', '#ffffff', '#71717a'],
    tokens: {
      primaryColor: '#000000',
      secondaryColor: '#18181b',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      headingColor: '#000000',
      bodyTextColor: '#27272a',
      mutedTextColor: '#71717a',
      btnPrimaryBg: '#000000',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#18181b',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '0px',
      navbarBg: '#000000',
      cardBg: '#ffffff',
    },
  },
];

const GOOGLE_FONTS = ['Inter', 'Outfit', 'Plus Jakarta Sans', 'Lato', 'Cinzel', 'Roboto', 'Montserrat', 'Poppins'];

export function WebsiteThemesTab({ settings, onSave, isLoading }: WebsiteThemesTabProps) {
  const currentBranding: BrandingConfig = {
    primaryColor: settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || '#2563eb',
    secondaryColor: settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || '#0f172a',
    headingFont: settings.branding?.headingFont || COMPANY_CONFIG.headingFont || 'Inter',
    bodyFont: settings.branding?.bodyFont || COMPANY_CONFIG.bodyFont || 'Inter',
    headingColor: settings.branding?.headingColor || COMPANY_CONFIG.headingColor || '#0f172a',
    bodyTextColor: settings.branding?.bodyTextColor || COMPANY_CONFIG.bodyTextColor || '#334155',
    mutedTextColor: settings.branding?.mutedTextColor || COMPANY_CONFIG.mutedTextColor || '#64748b',
    btnPrimaryBg: settings.branding?.btnPrimaryBg || COMPANY_CONFIG.btnPrimaryBg || '#2563eb',
    btnPrimaryText: settings.branding?.btnPrimaryText || COMPANY_CONFIG.btnPrimaryText || '#ffffff',
    btnSecondaryBg: settings.branding?.btnSecondaryBg || COMPANY_CONFIG.btnSecondaryBg || '#0f172a',
    btnSecondaryText: settings.branding?.btnSecondaryText || COMPANY_CONFIG.btnSecondaryText || '#ffffff',
    btnBorderRadius: settings.branding?.btnBorderRadius || COMPANY_CONFIG.btnBorderRadius || '8px',
    navbarBg: settings.branding?.navbarBg || COMPANY_CONFIG.navbarBg || '#0f172a',
    cardBg: settings.branding?.cardBg || COMPANY_CONFIG.cardBg || '#ffffff',
  };

  const [branding, setBranding] = useState<BrandingConfig>(currentBranding);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('chesterfield_royal_blue');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleApplyPreset = (preset: ThemePreset) => {
    setSelectedPresetId(preset.id);
    setBranding({ ...preset.tokens });
  };

  const handleSaveTheme = async () => {
    await onSave({
      branding,
      updatedAt: new Date().toISOString(),
    });
    setSaveMessage('Theme and dynamic branding tokens successfully published!');
    setTimeout(() => setSaveMessage(null), 3500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
            Dynamic Branding &amp; Livery Engine
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Website Theme Gallery &amp; CSS Token Studio
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Choose from curated luxury presets or customize individual colors, typography, and button styles in real-time.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleSaveTheme}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-2"
        >
          <SparklesIcon className="w-4 h-4" />
          <span>{isLoading ? 'Publishing Changes...' : 'Save & Publish Theme'}</span>
        </Button>
      </div>

      {saveMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckIcon className="w-4 h-4 text-emerald-600" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Preset Theme Cards Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <span>🎨 Curated Theme Presets</span>
          <span className="text-xs font-semibold text-slate-500 lowercase">({THEME_PRESETS.length} available)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {THEME_PRESETS.map((preset) => {
            const isSelected =
              branding.primaryColor === preset.tokens.primaryColor &&
              branding.navbarBg === preset.tokens.navbarBg;

            return (
              <div
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`cursor-pointer p-5 rounded-2xl border transition-all text-left flex flex-col justify-between group ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {preset.name}
                    </span>
                    {preset.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {preset.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    {preset.description}
                  </p>

                  {/* Swatch Previews */}
                  <div className="flex items-center gap-2 mb-4">
                    {preset.previewColors.map((hex, idx) => (
                      <div
                        key={idx}
                        className="w-7 h-7 rounded-lg border border-black/10 shadow-xs"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                    <div className="text-[11px] font-mono text-slate-400 ml-2">
                      {preset.tokens.btnBorderRadius} radius
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Font: {preset.tokens.headingFont}</span>
                  <span
                    className={`font-bold inline-flex items-center gap-1 ${
                      isSelected ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'
                    }`}
                  >
                    {isSelected ? '✓ Active Theme' : 'Apply Preset →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Branding Studio: Live Token Customizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Fine-Grained Controls */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Fine-Grained Color &amp; Style Overrides
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Adjust individual CSS variables to fine-tune your bespoke white-label identity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Primary Brand Color */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">Primary Brand Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.primaryColor || '#2563eb'}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value, btnPrimaryBg: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                />
                <Input
                  value={branding.primaryColor || '#2563eb'}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value, btnPrimaryBg: e.target.value })}
                  className="font-mono text-xs uppercase"
                />
              </div>
              <span className="text-[10px] text-slate-500 block">Used for main CTAs, active highlights &amp; icons</span>
            </div>

            {/* Secondary Color */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">Secondary / Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.secondaryColor || '#0f172a'}
                  onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                />
                <Input
                  value={branding.secondaryColor || '#0f172a'}
                  onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
                  className="font-mono text-xs uppercase"
                />
              </div>
              <span className="text-[10px] text-slate-500 block">Used for contrast panels, badges &amp; subheaders</span>
            </div>

            {/* Navbar Background */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">Header / Navbar Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.navbarBg || '#0f172a'}
                  onChange={(e) => setBranding({ ...branding, navbarBg: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                />
                <Input
                  value={branding.navbarBg || '#0f172a'}
                  onChange={(e) => setBranding({ ...branding, navbarBg: e.target.value })}
                  className="font-mono text-xs uppercase"
                />
              </div>
              <span className="text-[10px] text-slate-500 block">Top navigation bar background tint</span>
            </div>

            {/* Button Border Radius */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">Button Border Radius</label>
              <select
                value={branding.btnBorderRadius || '8px'}
                onChange={(e) => setBranding({ ...branding, btnBorderRadius: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              >
                <option value="0px">Sharp Square (0px)</option>
                <option value="4px">Subtle Rounded (4px)</option>
                <option value="8px">Standard Modern (8px)</option>
                <option value="12px">Extra Rounded (12px)</option>
                <option value="9999px">Pill / Stadium (Full)</option>
              </select>
              <span className="text-[10px] text-slate-500 block">Global curvature on buttons and interactive tags</span>
            </div>

            {/* Typography: Heading Font */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">Headline Font Family</label>
              <select
                value={branding.headingFont || 'Inter'}
                onChange={(e) => setBranding({ ...branding, headingFont: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              >
                {GOOGLE_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 block">Applied to H1, H2, and title accents</span>
            </div>

            {/* Typography: Body Font */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">Body Font Family</label>
              <select
                value={branding.bodyFont || 'Inter'}
                onChange={(e) => setBranding({ ...branding, bodyFont: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              >
                {GOOGLE_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 block">Applied to paragraphs, tables &amp; inputs</span>
            </div>
          </div>
        </div>

        {/* Right: Live Interactive Card Preview */}
        <div className="lg:col-span-5 space-y-4 sticky top-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Live Real-Time Rendering Preview
            </span>

            {/* Mock Header */}
            <div
              style={{ backgroundColor: branding.navbarBg || '#0f172a' }}
              className="p-3.5 rounded-xl text-white flex items-center justify-between mb-4 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <div
                  style={{
                    backgroundColor: branding.primaryColor || '#2563eb',
                    borderRadius: branding.btnBorderRadius || '8px',
                  }}
                  className="w-7 h-7 flex items-center justify-center text-white text-xs font-bold"
                >
                  <CarIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">{COMPANY_CONFIG.name}</span>
              </div>
              <span
                style={{
                  backgroundColor: branding.primaryColor || '#2563eb',
                  borderRadius: branding.btnBorderRadius || '8px',
                  color: branding.btnPrimaryText || '#ffffff',
                }}
                className="text-[10px] font-bold px-2.5 py-1"
              >
                Book Now
              </span>
            </div>

            {/* Mock Hero Card */}
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                <span>Premier 24/7 Car Service</span>
              </div>

              <h4
                style={{
                  color: branding.headingColor || '#0f172a',
                  fontFamily: branding.headingFont || 'Inter',
                }}
                className="text-lg font-black leading-tight"
              >
                Dependable, Professional Taxi &amp; Executive Travel
              </h4>

              <p
                style={{
                  color: branding.bodyTextColor || '#334155',
                  fontFamily: branding.bodyFont || 'Inter',
                }}
                className="text-xs leading-relaxed"
              >
                Guaranteed upfront pricing, licensed chauffeurs, and instant airport dispatch to STL Lambert.
              </p>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  style={{
                    backgroundColor: branding.btnPrimaryBg || '#2563eb',
                    color: branding.btnPrimaryText || '#ffffff',
                    borderRadius: branding.btnBorderRadius || '8px',
                  }}
                  className="text-xs font-bold px-4 py-2 shadow-xs"
                >
                  Reserve Trip
                </button>
                <button
                  type="button"
                  style={{
                    borderRadius: branding.btnBorderRadius || '8px',
                  }}
                  className="text-xs font-bold px-3 py-2 border border-slate-300 bg-white text-slate-800"
                >
                  Rates &amp; Fleet
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Tokens will sync to <code>root.tsx</code></span>
              <span className="font-mono text-emerald-600 font-bold">● Active Sync</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
