import React, { useState } from 'react';
import type { AppSettings } from '../../../core/types/config';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';

interface AdminLayoutTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export function AdminLayoutTab({ settings, onSave, isLoading }: AdminLayoutTabProps) {
  const [selectedVersion, setSelectedVersion] = useState<'v1' | 'v2'>(
    settings.publicFormVersion || 'v2'
  );
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSwitchLayout = async (version: 'v1' | 'v2') => {
    try {
      setSaveSuccess(false);
      setSaveError(null);
      setSelectedVersion(version);

      await onSave({
        publicFormVersion: version,
        updatedAt: new Date().toISOString(),
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update form layout version.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">
          Public Customer Booking Form Layout
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Select which booking experience the public portal serves to riders visiting <code>/book</code>.
        </p>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Layout Updated">
          Public booking form switched to <strong>Layout {selectedVersion.toUpperCase()}</strong>.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Update Failed">
          {saveError}
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Layout V2 Card (Modern Streamlined Single-Page) */}
        <Card
          variant="elevated"
          className={`border-2 transition-all ${
            selectedVersion === 'v2'
              ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/20 shadow-md'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <CardHeader className="border-b border-slate-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2.5 py-1 rounded-md">
                Layout V2 (Recommended)
              </span>
              {selectedVersion === 'v2' ? (
                <Badge variant="success" size="sm">
                  ● Currently Active
                </Badge>
              ) : (
                <span className="text-xs text-slate-400 font-medium">Inactive</span>
              )}
            </div>
            <CardTitle className="text-base text-slate-900 mt-2">
              Streamlined Single-Page Flow
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Modern single-page card architecture with segmented time picker, flight radar subcard, visual vehicle cards, and emerald Book Ride CTA.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs text-slate-600">
            <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
              <li>Segmented [Now] / [Schedule] pickup control</li>
              <li>Pickup / dropoff card with ✈ Flight Information subcard</li>
              <li>Stepper counters for Passengers and Luggage</li>
              <li>Visual vehicle cards (Sedan, SUV, Minivan)</li>
              <li>Special requests chips &amp; return trip toggle</li>
              <li>Sticky bottom total with green "Book Ride" CTA</li>
            </ul>

            <div className="pt-2">
              <a
                href="/book?layout=v2"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Open Live V2 Preview in New Tab ↗
              </a>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-[11px] font-semibold text-emerald-600">
              ★ Recommended for Customers
            </span>
            <Button
              type="button"
              variant={selectedVersion === 'v2' ? 'secondary' : 'primary'}
              size="sm"
              isLoading={isLoading && selectedVersion === 'v2'}
              onClick={() => handleSwitchLayout('v2')}
              disabled={selectedVersion === 'v2' || isLoading}
            >
              {selectedVersion === 'v2' ? 'Active Version' : 'Activate Layout V2'}
            </Button>
          </CardFooter>
        </Card>

        {/* Layout V1 Card (Legacy Multi-Step Wizard) */}
        <Card
          variant="elevated"
          className={`border-2 transition-all ${
            selectedVersion === 'v1'
              ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/20 shadow-md'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <CardHeader className="border-b border-slate-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                Layout V1
              </span>
              {selectedVersion === 'v1' ? (
                <Badge variant="success" size="sm">
                  ● Currently Active
                </Badge>
              ) : (
                <span className="text-xs text-slate-400 font-medium">Inactive</span>
              )}
            </div>
            <CardTitle className="text-base text-slate-900 mt-2">
              4-Step Linear Wizard Flow
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Traditional multi-step booking engine with step tabs (1: Route &rarr; 2: Vehicle &rarr; 3: Details &rarr; 4: Payment).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs text-slate-600">
            <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
              <li>Step indicator bar at top (4 sequential steps)</li>
              <li>Separate screens for route selection and vehicle choice</li>
              <li>Detailed summary step before confirmation</li>
              <li>Standard form inputs with validation</li>
              <li>Card and Cash on Delivery payment options</li>
            </ul>

            <div className="pt-2">
              <a
                href="/book?layout=v1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Open Live V1 Preview in New Tab ↗
              </a>
            </div>
          </CardContent>
          <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-[11px] text-slate-500">
              Legacy Linear Wizard
            </span>
            <Button
              type="button"
              variant={selectedVersion === 'v1' ? 'secondary' : 'primary'}
              size="sm"
              isLoading={isLoading && selectedVersion === 'v1'}
              onClick={() => handleSwitchLayout('v1')}
              disabled={selectedVersion === 'v1' || isLoading}
            >
              {selectedVersion === 'v1' ? 'Active Version' : 'Activate Layout V1'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
