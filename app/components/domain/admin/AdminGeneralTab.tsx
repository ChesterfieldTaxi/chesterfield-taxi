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

export function AdminGeneralTab({ settings, onSave, isLoading = false }: AdminGeneralTabProps) {
  const [company, setCompany] = useState<CompanyConfig>({ ...settings.company });
  const [branding, setBranding] = useState<BrandingConfig>({ ...settings.branding });
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      await onSave({
        company,
        branding,
        localization,
        publicFormVersion,
      });
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
          Company profile, localization, operating hours, and branding configurations synced with Firestore.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Save Failed">
          {saveError}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Company Details, Localization & Operating Hours */}
        <div className="lg:col-span-7 space-y-6">
          {/* Company Details Card */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                    <span className="text-xl">🏢</span>
                    Company Details &amp; Business Profile
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Official business information rendered on quotes, emails, and passenger SMS.
                  </CardDescription>
                </div>
                <Badge variant="default" size="sm">
                  Active Entity
                </Badge>
              </div>
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
                  value="Chesterfield Taxi LLC"
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

          {/* Localization & Regional Settings */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                <span className="text-xl">🌐</span>
                Regional Localization &amp; Currency
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Timezone and monetary formatting for customer receipts and trip logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Operational Timezone
                  </label>
                  <select
                    value={localization.timezone}
                    onChange={(e) =>
                      setLocalization((prev) => ({ ...prev, timezone: e.target.value }))
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="America/Chicago">America/Chicago (Central Time - St. Louis)</option>
                    <option value="America/New_York">America/New_York (Eastern Time)</option>
                    <option value="America/Denver">America/Denver (Mountain Time)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    All pickup dates and dispatch timestamps are anchored to this timezone.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD ($) - US Dollar</option>
                    <option value="CAD">CAD ($) - Canadian Dollar</option>
                    <option value="EUR">EUR (€) - Euro</option>
                    <option value="GBP">GBP (£) - British Pound</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Standard billing currency across all customer payment gateways.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Time Display Format
                  </label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="timeFormat"
                        checked={localization.timeFormat === '12h'}
                        onChange={() => setLocalization((prev) => ({ ...prev, timeFormat: '12h' }))}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>12-Hour (e.g. 02:30 PM)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="timeFormat"
                        checked={localization.timeFormat === '24h'}
                        onChange={() => setLocalization((prev) => ({ ...prev, timeFormat: '24h' }))}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>24-Hour (14:30)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Date Display Format
                  </label>
                  <select
                    value={localization.dateFormat}
                    onChange={(e) =>
                      setLocalization((prev) => ({ ...prev, dateFormat: e.target.value }))
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO Format)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Operating Hours Card */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                    <ClockIcon className="w-5 h-5 text-amber-500" />
                    Operating Hours &amp; Availability
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Fleet operational hours published to riders and search engines.
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
                      Continuous 24-Hour Operations Enabled
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Dispatchers and on-call drivers respond around the clock for early flights and late night airport arrivals.
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

        {/* Right Column: Branding & Dynamic Theme Preview */}
        <div className="lg:col-span-5 space-y-6">
          {/* Branding & Visual Identity */}
          <Card variant="elevated" className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-amber-500" />
                Branding &amp; Colors
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Primary and accent colors injected dynamically into CSS custom variables.
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
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="w-11 h-11 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                    />
                    <Input
                      value={branding.primaryColor}
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      placeholder="#f59e0b"
                      className="font-mono text-sm uppercase"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Used for primary buttons, active pills, and brand badges.
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
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))
                      }
                      className="w-11 h-11 rounded-xl border border-slate-300 cursor-pointer p-1 bg-white shadow-xs"
                    />
                    <Input
                      value={branding.secondaryColor}
                      onChange={(e) =>
                        setBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))
                      }
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

          {/* Live Dynamic Brand Preview Card */}
          <Card
            variant="elevated"
            className="border-slate-200 shadow-xs sticky top-24"
            style={
              {
                '--color-primary': branding.primaryColor,
                '--color-secondary': branding.secondaryColor,
                '--brand-primary': branding.primaryColor,
                '--brand-secondary': branding.secondaryColor,
              } as React.CSSProperties
            }
          >
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
                    Book Now &rarr;
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-transform active:scale-95"
                    style={{ backgroundColor: branding.secondaryColor }}
                  >
                    Dispatcher Portal
                  </button>
                </div>
              </div>

              {/* Contact summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-900">Rider Receipt Information:</div>
                <div>{company.email}</div>
                <div>{company.address}</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {localization.timezone} &bull; Currency: {localization.currency}
                </div>
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
