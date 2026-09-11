import React, { useState } from 'react';
import type { AppSettings, CompanyConfig, BrandingConfig } from '../../../core/types/config';
import { Button } from '../../ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Alert } from '../../ui/Alert';
import { Badge } from '../../ui/Badge';
import { CheckIcon, SparklesIcon, CarIcon } from '../../ui/Icons';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export interface AdminGeneralTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

export function AdminGeneralTab({ settings, onSave, isLoading = false }: AdminGeneralTabProps) {
  const [company, setCompany] = useState<CompanyConfig>({ ...settings.company });
  const [branding, setBranding] = useState<BrandingConfig>({ ...settings.branding });
  const [publicFormVersion, setPublicFormVersion] = useState<'v1' | 'v2'>(
    settings.publicFormVersion || 'v2'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      await onSave({ company, branding, publicFormVersion });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save general & branding settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {saveSuccess && (
        <Alert variant="success" title="Settings Saved">
          Company, branding, and booking layout configuration updated and synced with Firestore.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Layout Versioning & Company Info */}
        <div className="lg:col-span-7 space-y-6">
          {/* Public Booking Form Layout Selector Card */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-amber-500" />
                    Public Booking Form Layout
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Select which booking portal layout is active for public customers visiting <code>/book</code>.
                  </CardDescription>
                </div>
                <Badge variant={publicFormVersion === 'v2' ? 'success' : 'default'} size="sm">
                  Layout {publicFormVersion.toUpperCase()} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option: Layout V2 */}
                <div
                  onClick={() => setPublicFormVersion('v2')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                    publicFormVersion === 'v2'
                      ? 'border-blue-600 bg-blue-50/30 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
                      Layout V2
                    </span>
                    {publicFormVersion === 'v2' && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Streamlined Single-Page
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Modern card stack with segmented pickup time, airport flight subcard, visual vehicle cards, and sticky emerald CTA.
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-600">
                      ★ Recommended
                    </span>
                    <a
                      href="/book?layout=v2"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-blue-600 hover:underline font-semibold"
                    >
                      Preview V2 ↗
                    </a>
                  </div>
                </div>

                {/* Option: Layout V1 */}
                <div
                  onClick={() => setPublicFormVersion('v1')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                    publicFormVersion === 'v1'
                      ? 'border-amber-500 bg-amber-50/30 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      Layout V1
                    </span>
                    {publicFormVersion === 'v1' && (
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Master Booking Engine
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Multi-section master engine featuring role configuration schemas, comprehensive routing details, and live contextual panel.
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Phase 15 Engine
                    </span>
                    <a
                      href="/book?layout=v1"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-amber-600 hover:underline font-semibold"
                    >
                      Preview V1 ↗
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Contact Information */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-900">Company Information</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Primary business contact info displayed across the booking portal and transactional receipts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Input
                label="Company Name"
                value={company.name}
                onChange={(e) => setCompany((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={COMPANY_CONFIG.name}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Dispatch Phone Number"
                  type="tel"
                  value={company.phone}
                  onChange={(e) => setCompany((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder={COMPANY_CONFIG.phone.dispatch}
                  required
                />
                <Input
                  label="Support / Dispatch Email"
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder={COMPANY_CONFIG.email.dispatch}
                  required
                />
              </div>

              <Input
                label="Headquarters Address"
                value={company.address}
                onChange={(e) => setCompany((prev) => ({ ...prev, address: e.target.value }))}
                placeholder={COMPANY_CONFIG.address.formatted}
                required
              />
            </CardContent>
          </Card>

          {/* Branding & Visual Identity */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-900">Branding &amp; Colors</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Configure primary and accent colors to customize the customer-facing booking portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Primary Brand Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                      className="w-11 h-11 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                    />
                    <Input
                      value={branding.primaryColor}
                      onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                      placeholder="#f59e0b"
                      className="font-mono text-sm uppercase"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Used for primary action buttons, active indicators, and highlights.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Secondary / Dark Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={branding.secondaryColor}
                      onChange={(e) => setBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                      className="w-11 h-11 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                    />
                    <Input
                      value={branding.secondaryColor}
                      onChange={(e) => setBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                      placeholder="#0f172a"
                      className="font-mono text-sm uppercase"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Used for dark headers, typography, and contrast elements.
                  </p>
                </div>
              </div>

              <Input
                label="Custom Logo URL (Optional)"
                value={branding.logoUrl || ''}
                onChange={(e) => setBranding((prev) => ({ ...prev, logoUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
                helperText="Leave blank to use the default Chesterfield Taxi vehicle insignia."
              />
            </CardContent>
          </Card>
        </div>

        {/* Live Branding Preview */}
        <div className="lg:col-span-5 space-y-6">
          <Card variant="elevated" className="border-slate-200 shadow-xs sticky top-24">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-amber-500" />
                Live Brand Preview
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Preview how your brand styling renders in the customer portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Header preview */}
              <div
                className="p-4 rounded-2xl border shadow-xs flex items-center justify-between"
                style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm"
                    style={{ backgroundColor: branding.primaryColor }}
                  >
                    <CarIcon className="w-5 h-5 text-slate-950" />
                  </div>
                  <div>
                    <h4
                      className="text-sm font-extrabold tracking-tight leading-none"
                      style={{ color: branding.secondaryColor }}
                    >
                      {company.name || 'Chesterfield Taxi'}
                    </h4>
                    <span
                      className="text-[10px] font-semibold tracking-wider uppercase leading-none"
                      style={{ color: branding.primaryColor }}
                    >
                      Car Service
                    </span>
                  </div>
                </div>

                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white"
                  style={{ backgroundColor: branding.secondaryColor }}
                >
                  {company.phone || COMPANY_CONFIG.phone.dispatch}
                </span>
              </div>

              {/* Button preview */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-500">Button Theme Samples:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 shadow-sm transition-transform active:scale-95"
                    style={{ backgroundColor: branding.primaryColor }}
                  >
                    Primary Action
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-transform active:scale-95"
                    style={{ backgroundColor: branding.secondaryColor }}
                  >
                    Dark Action
                  </button>
                </div>
              </div>

              {/* Contact summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-900">Customer Support Display:</div>
                <div>{company.email}</div>
                <div>{company.address}</div>
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
                Save General &amp; Branding
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </form>
  );
}
