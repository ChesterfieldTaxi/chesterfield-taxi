import React, { useState } from 'react';
import type { AppSettings, CustomerBookingConfig } from '../../../core/types/config';
import { DEFAULT_CUSTOMER_BOOKING_CONFIG } from '../../../core/services/config/admin-config.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { InfoIcon, CarIcon } from '../../ui/Icons';

interface AdminLayoutTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export function AdminLayoutTab({ settings, onSave, isLoading }: AdminLayoutTabProps) {
  const [selectedVersion, setSelectedVersion] = useState<'v1' | 'v2'>(
    settings.publicFormVersion || 'v2'
  );

  // Form Feature Config State
  const initialConfig: CustomerBookingConfig = {
    ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
    ...(settings.customerBookingConfig || {}),
  };

  const [formConfig, setFormConfig] = useState<CustomerBookingConfig>(initialConfig);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
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

  const handleSaveFeatureConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingConfig(true);
      setSaveSuccess(false);
      setSaveError(null);

      await onSave({
        customerBookingConfig: formConfig,
        updatedAt: new Date().toISOString(),
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save customer form settings.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const togglePaymentMethod = (method: 'card' | 'cash' | 'account') => {
    setFormConfig((prev) => {
      const exists = prev.acceptedPaymentMethods.includes(method);
      let updated: Array<'card' | 'cash' | 'account'>;
      if (exists) {
        if (prev.acceptedPaymentMethods.length <= 1) return prev; // keep at least 1
        updated = prev.acceptedPaymentMethods.filter((m) => m !== method);
      } else {
        updated = [...prev.acceptedPaymentMethods, method];
      }
      return { ...prev, acceptedPaymentMethods: updated };
    });
  };

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <div>
        <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Public Customer Booking Form Settings
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Configure form features, multi-vehicle dispatch capabilities, group transport notes, and layout architecture for riders on <code>/book</code>.
        </p>
      </div>

      {/* ─── System Maintenance & Construction Mode Quick Control ─── */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        settings.constructionMode !== false
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-white border-slate-200/80 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              settings.constructionMode !== false ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-100 text-slate-600'
            }`}>
              <InfoIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900">System Maintenance &amp; Construction Mode</h3>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  settings.constructionMode !== false ? 'bg-amber-500 text-slate-950' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {settings.constructionMode !== false ? 'Active (ON)' : 'Disabled (Live)'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                When enabled, all customer booking routes show the Under Construction screen with direct phone dispatch ((314) 738-9921).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const currentMode = settings.constructionMode !== false;
              const nextVal = !currentMode;
              await onSave({
                constructionMode: nextVal,
                updatedAt: new Date().toISOString(),
              });
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer ${
              settings.constructionMode !== false
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {settings.constructionMode !== false ? 'Turn Maintenance Mode OFF' : 'Turn Maintenance Mode ON'}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Settings Saved Successfully">
          Configuration has been saved and synchronized across all active customer booking portals.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Update Failed">
          {saveError}
        </Alert>
      )}

      {/* ─── Section 1: Form Feature Controls & Multi-Vehicle Engine ─── */}
      <form onSubmit={handleSaveFeatureConfig} className="space-y-6">
        <Card variant="elevated" className="border border-slate-200 bg-white shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/60 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-100 text-blue-700 rounded-lg"><CarIcon className="w-5 h-5" /></span>
                <div>
                  <CardTitle className="text-base text-slate-900 font-bold">
                    Multi-Vehicle &amp; Group Booking Engine
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Control whether customers can reserve multiple vehicles or see a call/email inquiry notice.
                  </CardDescription>
                </div>
              </div>
              <Badge variant={formConfig.allowMultiVehicle ? 'info' : 'neutral'} size="sm">
                {formConfig.allowMultiVehicle ? 'Multi-Vehicle Enabled' : 'Single Vehicle (Call Notice)'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-6">
            {/* Toggle: Multi-Vehicle Enabled */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="space-y-0.5">
                <label className="text-sm font-bold text-slate-900 cursor-pointer flex items-center gap-2">
                  <span>Enable Multi-Vehicle Booking (+ Add Vehicle)</span>
                  {formConfig.allowMultiVehicle && (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </label>
                <p className="text-xs text-slate-500 max-w-xl">
                  When enabled, customers see the <strong>+ Add Vehicle</strong> selector matching the dispatch console, allowing them to reserve multiple cars in one booking. When disabled, customers select 1 vehicle and see a call/email assistance notice for groups.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={formConfig.allowMultiVehicle}
                  onChange={(e) => setFormConfig((prev) => ({ ...prev, allowMultiVehicle: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            {/* When Multi-Vehicle is Enabled */}
            {formConfig.allowMultiVehicle ? (
              <div className="p-4 bg-blue-50/50 border border-blue-200/80 rounded-xl space-y-3 animate-in fade-in duration-150">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                  Multi-Vehicle Parameters
                </div>
                <div className="max-w-xs">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maximum Vehicles Allowed per Customer Booking
                  </label>
                  <select
                    value={formConfig.maxVehiclesAllowed}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, maxVehiclesAllowed: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                  >
                    <option value={2}>2 Vehicles</option>
                    <option value={3}>3 Vehicles (Recommended)</option>
                    <option value={4}>4 Vehicles</option>
                    <option value={5}>5 Vehicles</option>
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Caps the number of cars a single customer can add on the web portal.
                  </span>
                </div>
              </div>
            ) : (
              /* When Multi-Vehicle is Disabled: Configure Call/Email Assistance Notice */
              <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <InfoIcon className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Multi-Vehicle Call/Email Assistance Notice Configuration
                  </span>
                </div>
                <p className="text-xs text-amber-900/80">
                  Because multi-vehicle self-serve is disabled, customers viewing vehicle preferences will see this contact card directing them to call or email dispatch for group/event bookings.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assistance Phone Number
                    </label>
                    <input
                      type="text"
                      value={formConfig.multiVehicleCallPhone || ''}
                      placeholder="(314) 738-9000"
                      onChange={(e) => setFormConfig((prev) => ({ ...prev, multiVehicleCallPhone: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assistance Email Address
                    </label>
                    <input
                      type="email"
                      value={formConfig.multiVehicleCallEmail || ''}
                      placeholder="dispatch@chesterfieldtaxi.com"
                      onChange={(e) => setFormConfig((prev) => ({ ...prev, multiVehicleCallEmail: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Notice Text <span className="text-slate-400 font-normal">(Optional override)</span>
                  </label>
                  <input
                    type="text"
                    value={formConfig.multiVehicleCustomNote || ''}
                    placeholder="Leave blank to use the standard default text"
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, multiVehicleCustomNote: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                {/* Live Customer Preview */}
                <div className="pt-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Customer Form Live Preview:
                  </span>
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                    <InfoIcon className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">
                        {formConfig.multiVehicleCustomNote || 'Need more than one vehicle for your party or event?'}
                      </p>
                      <p className="text-[11px] text-blue-700 mt-0.5">
                        Please contact our dispatch desk directly at{' '}
                        <span className="font-bold underline">
                          {formConfig.multiVehicleCallPhone || settings.company.phone || '(314) 738-9000'}
                        </span>{' '}
                        or{' '}
                        <span className="font-bold underline">
                          {formConfig.multiVehicleCallEmail || settings.company.email || 'dispatch@chesterfieldtaxi.com'}
                        </span>{' '}
                        to coordinate multi-vehicle transport.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Other Customer Form Feature Toggles ─── */}
            <div className="pt-4 border-t border-slate-200/80 space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Other Customer Form Feature Configurations
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Allow Immediate ASAP */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">
                      Immediate On-Demand (ASAP) Dispatch
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Allows riders to request immediate pickup without choosing a date/time.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.allowImmediateAsap}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, allowImmediateAsap: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 ml-3"
                  />
                </div>

                {/* Round Trip Booking */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">
                      Round Trip / Return Trip Booking
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Displays the return leg schedule and destination swap toggle.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.allowRoundTrip}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, allowRoundTrip: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 ml-3"
                  />
                </div>

                {/* Child Safety Seats */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">
                      Child Safety Seats Option
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Displays rear-facing, forward-facing, and booster seat counters.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.allowChildSafetySeats}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, allowChildSafetySeats: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 ml-3"
                  />
                </div>

                {/* Airport Flight Number Requirement */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">
                      Require Flight Number for Airport Pickups
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Makes flight number mandatory when STL airport is detected.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.requireFlightNumberForAirport}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, requireFlightNumberForAirport: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 ml-3"
                  />
                </div>
              </div>

              {/* Accepted Public Payment Methods */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                <span className="text-xs font-bold text-slate-900 block">
                  Accepted Public Payment Methods
                </span>
                <span className="text-[11px] text-slate-500 block mb-2">
                  Select which payment options are presented to web customers on the public booking portal:
                </span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={formConfig.acceptedPaymentMethods.includes('card')}
                      onChange={() => togglePaymentMethod('card')}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>💳 Credit / Debit Card (In-Vehicle Terminal or Card on File)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={formConfig.acceptedPaymentMethods.includes('cash')}
                      onChange={() => togglePaymentMethod('cash')}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>💵 Cash on Arrival</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={formConfig.acceptedPaymentMethods.includes('account')}
                      onChange={() => togglePaymentMethod('account')}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>🏢 Corporate Account Invoicing</span>
                  </label>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-[11px] text-slate-500">
              Changes sync immediately to all visitors on <code>/book</code>.
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSavingConfig}
              disabled={isSavingConfig}
            >
              Save Customer Form Configuration
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* ─── Section 2: Form Layout Version Selector ─── */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div>
          <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
            Public Form Layout Engine Version
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Select which architecture is rendered to public riders visiting <code>/book</code>.
          </p>
        </div>

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
                Modern single-page card architecture matching dispatch booking with real-time upfront fare preview and vehicle controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs text-slate-600">
              <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
                <li>Segmented [Now] / [Schedule] pickup control with 12h AM/PM</li>
                <li>Pickup / dropoff card with ✈ Flight Information subcard</li>
                <li>Multi-vehicle support (+ Add Vehicle) or call assistance note</li>
                <li>Visual vehicle cards (Sedan, SUV, Minivan)</li>
                <li>Special requests chips &amp; return trip toggle</li>
                <li>Sticky Trip Summary with guaranteed upfront fare</li>
              </ul>

              <div className="pt-2">
                <a
                  href="/book"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Open Live Customer Booking in New Tab ↗
                </a>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-emerald-600">
                ★ Standard for Customers
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
              </ul>
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
    </div>
  );
}
