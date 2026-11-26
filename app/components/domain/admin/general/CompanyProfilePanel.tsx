import React, { useState, useEffect } from 'react';
import {
  normalizeCompanyConfig,
  type AppSettings,
  type NormalizedCompanyConfig,
} from '../../../../core/types/config';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { LocationAutocomplete } from '../../LocationAutocomplete';
import { Button } from '../../../ui/Button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../../ui/Card';
import { Input } from '../../../ui/Input';
import { Alert } from '../../../ui/Alert';
import { Badge } from '../../../ui/Badge';
import { BuildingIcon, CheckIcon, ClockIcon } from '../../../ui/Icons';

export interface CompanyProfilePanelProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading?: boolean;
}

export function CompanyProfilePanel({
  settings,
  onSave,
  isLoading = false,
}: CompanyProfilePanelProps) {
  const [company, setCompany] = useState<NormalizedCompanyConfig>(() =>
    normalizeCompanyConfig(settings.company)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setCompany(normalizeCompanyConfig(settings.company));
  }, [settings.company]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setIsSaving(true);
      setSaveSuccess(null);
      setSaveError(null);
      let candidate = company;
      if (
        !candidate.headquartersCoordinates &&
        candidate.address.trim() &&
        typeof window !== 'undefined' &&
        (window as any).google?.maps?.Geocoder
      ) {
        try {
          const geocoder = new (window as any).google.maps.Geocoder();
          const geocoded = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
            geocoder.geocode(
              { address: candidate.address.trim() },
              (results: any[] | null, status: string) => {
                if (status === 'OK' && results?.[0]?.geometry?.location) {
                  const loc = results[0].geometry.location;
                  resolve({ lat: loc.lat(), lng: loc.lng() });
                } else {
                  resolve(null);
                }
              }
            );
          });
          if (geocoded) {
            candidate = { ...candidate, headquartersCoordinates: geocoded };
          }
        } catch {}
      }

      const normalized = normalizeCompanyConfig(candidate);
      setCompany(normalized);

      await onSave({
        company: normalized,
        customerBookingConfig: settings.customerBookingConfig
          ? {
              ...settings.customerBookingConfig,
              maxAdvanceBookingDays: normalized.advanceBookingMaxDays,
            }
          : undefined,
      });

      setSaveSuccess('Company credentials, dispatch emails, and operating hours saved.');
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save company profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Contextual Top Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-surface-card p-3 sm:px-4 sm:py-2.5 rounded-2xl border border-border-subtle/80 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <BuildingIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-fg-secondary truncate">
            Company Identity, Dispatch Contacts &amp; Operating Hours
          </span>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          isLoading={isSaving || isLoading}
          leftIcon={<CheckIcon className="w-4 h-4" />}
          className="w-full sm:w-auto justify-center shrink-0"
        >
          Save Company Info &amp; Hours
        </Button>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Saved">
          {saveSuccess}
        </Alert>
      )}
      {saveError && (
        <Alert variant="error" title="Error">
          {saveError}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Official Business Credentials */}
        <div className="lg:col-span-7">
          <Card variant="elevated" className="border-border-subtle shadow-xs">
            <CardHeader className="border-b border-border-faint bg-surface-subtle/50">
              <CardTitle className="text-base text-fg-primary flex items-center gap-2">
                <BuildingIcon className="w-4 h-4 text-blue-600" />
                Company Details &amp; Legal Identity
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted">
                Rendered on corporate invoices, passenger email receipts, /track pages, and public footer.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Display Brand Name"
                  value={company.name}
                  onChange={(e) => setCompany((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Chesterfield Taxi"
                  required
                />
                <Input
                  label="Legal Entity Name"
                  value={company.legalEntityName}
                  onChange={(e) =>
                    setCompany((prev) => ({ ...prev, legalEntityName: e.target.value }))
                  }
                  placeholder="Chesterfield Taxi & Transportation LLC"
                  helperText="Printed on B2B corporate statements and tax receipts"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Primary Dispatch Phone"
                  value={company.phone}
                  onChange={(e) => setCompany((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="(314) 738-0100"
                  required
                />
                <Input
                  label="Client Support Email"
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="support@chesterfieldtaxi.com"
                  required
                />
                <Input
                  label="Dispatch Inbox Email"
                  type="email"
                  value={company.dispatchEmail}
                  onChange={(e) =>
                    setCompany((prev) => ({ ...prev, dispatchEmail: e.target.value }))
                  }
                  placeholder="dispatch@chesterfieldtaxi.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <LocationAutocomplete
                  label="Physical Headquarters Address"
                  icon="map-pin"
                  value={company.address}
                  onChange={(val) =>
                    setCompany((prev) => ({
                      ...prev,
                      address: val,
                      headquartersCoordinates: undefined,
                    }))
                  }
                  onPlaceSelected={(details) =>
                    setCompany((prev) => ({
                      ...prev,
                      address: details.formattedAddress || details.address,
                      headquartersCoordinates: details.coordinates,
                    }))
                  }
                  placeholder={COMPANY_CONFIG.address.formatted}
                  required
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
                  <span>
                    Displayed on Contact &amp; Support page, structured LocalBusiness JSON-LD, receipts, and Dispatch HQ Map Pin.
                  </span>
                  {company.headquartersCoordinates && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-header text-amber-300 font-mono text-[10px] font-bold">
                      HQ Pin: {company.headquartersCoordinates.lat.toFixed(4)},{' '}
                      {company.headquartersCoordinates.lng.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-surface-subtle/50 px-5 py-3.5 border-t border-border-faint flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSaving || isLoading}
                leftIcon={<CheckIcon className="w-4 h-4" />}
              >
                Save Company Details
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right: Operating Hours & Advance Booking Horizon */}
        <div className="lg:col-span-5">
          <Card variant="elevated" className="border-border-subtle shadow-xs">
            <CardHeader className="border-b border-border-faint bg-surface-subtle/50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base text-fg-primary flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-amber-500 shrink-0" />
                    Operating Hours &amp; Horizon
                  </CardTitle>
                  <CardDescription className="text-xs text-fg-muted">
                    Public schedule label and advance reservation ceiling.
                  </CardDescription>
                </div>
                <Badge
                  variant={company.is24x7 ? 'success' : 'warning'}
                  size="sm"
                  className="shrink-0"
                >
                  {company.is24x7 ? '24/7/365 Active' : 'Scheduled Hours'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-status-success-bg/60 border border-status-success-border">
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-fg-primary">
                    24/7 Continuous Operations
                  </h4>
                  <p className="text-[11px] text-fg-secondary mt-0.5">
                    Dispatchers and drivers operate round-the-clock for early STL &amp; SUS flights.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={company.is24x7}
                    onChange={(e) =>
                      setCompany((prev) => ({ ...prev, is24x7: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-emphasis peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-card after:border-border-strong after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                </label>
              </div>

              <Input
                label="Operating Hours Display Label"
                value={company.operatingHoursLabel}
                onChange={(e) =>
                  setCompany((prev) => ({ ...prev, operatingHoursLabel: e.target.value }))
                }
                placeholder="Monday – Sunday: Open 24 Hours"
                helperText="Shown in website footer and customer support cards"
              />

              <Input
                label="Advance Booking Max Days"
                type="number"
                min={1}
                max={365}
                value={company.advanceBookingMaxDays}
                onChange={(e) =>
                  setCompany((prev) => ({
                    ...prev,
                    advanceBookingMaxDays: Math.max(1, Math.min(365, Number(e.target.value) || 90)),
                  }))
                }
                helperText="Maximum days ahead a rider can pre-schedule an airport or local trip"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
