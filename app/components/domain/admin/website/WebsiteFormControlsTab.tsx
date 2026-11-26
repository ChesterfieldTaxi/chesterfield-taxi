import React, { useState } from 'react';
import { Link } from 'react-router';
import {
  normalizeGuestSelfServicePolicy,
  type AppSettings,
  type CustomerBookingConfig,
} from '../../../../core/types/config';
import { DEFAULT_CUSTOMER_BOOKING_CONFIG } from '../../../../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Select } from '../../../ui/Select';
import { Badge } from '../../../ui/Badge';
import { Alert } from '../../../ui/Alert';
import { BuildingIcon, CarIcon, CashIcon, CheckIcon, ClockIcon, CreditCardIcon, InfoIcon, PlaneLandingIcon, ShieldCheckIcon } from '../../../ui/Icons';
import { GuestSelfServicePolicyCard } from './GuestSelfServicePolicyCard';

export interface WebsiteFormControlsTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export function WebsiteFormControlsTab({ settings, onSave, isLoading }: WebsiteFormControlsTabProps) {
  const [formConfig, setFormConfig] = useState<CustomerBookingConfig>(() => ({
    ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
    ...(settings.customerBookingConfig || {}),
    allowPublicCorporateCheckout: Boolean(settings.customerBookingConfig?.allowPublicCorporateCheckout),
    guestSelfServicePolicy: normalizeGuestSelfServicePolicy(
      settings.customerBookingConfig?.guestSelfServicePolicy
    ),
  }));

  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayPhone = formConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.dispatch || '(314) 738-0100';
  const displayEmail =
    formConfig.multiVehicleCallEmail || COMPANY_CONFIG.email.dispatch || 'dispatch@chesterfieldtaxi.com';

  const toggleRetailPaymentMethod = (method: 'card' | 'cash') => {
    setFormConfig((prev) => {
      const retailList = prev.acceptedPaymentMethods.filter(
        (m): m is 'card' | 'cash' => m === 'card' || m === 'cash'
      );
      const exists = retailList.includes(method);
      if (exists && retailList.length <= 1) return prev;
      const nextRetail = exists ? retailList.filter((m) => m !== method) : [...retailList, method];
      const nextMethods: Array<'card' | 'cash' | 'account'> = prev.allowPublicCorporateCheckout
        ? [...nextRetail, 'account']
        : nextRetail;
      return { ...prev, acceptedPaymentMethods: nextMethods };
    });
  };

  const handleTogglePublicCorporateGate = (enabled: boolean) => {
    setFormConfig((prev) => {
      const baseRetail = prev.acceptedPaymentMethods.filter(
        (m): m is 'card' | 'cash' => m === 'card' || m === 'cash'
      );
      const safeRetail = baseRetail.length > 0 ? baseRetail : (['card', 'cash'] as const);
      return {
        ...prev,
        allowPublicCorporateCheckout: enabled,
        acceptedPaymentMethods: enabled ? [...safeRetail, 'account'] : [...safeRetail],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaveSuccessMessage(null);
      setSaveError(null);
      await onSave({ customerBookingConfig: formConfig, updatedAt: new Date().toISOString() });
      setSaveSuccessMessage('Booking form & /track self-service policies published.');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save client form settings.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-card p-4 sm:p-6 rounded-2xl border border-border-subtle shadow-xs">
        <div className="min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
            Online Booking &amp; Self-Service Governance
          </span>
          <h2 className="text-lg sm:text-xl font-extrabold text-fg-primary mt-0.5">
            Client Booking Form, Corporate Portal Gate &amp; /track Controls
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Configure retail checkout payment gates, group vehicle rules, scheduling lead windows, STL airport curbside instructions, and <code>/track</code> rider self-service.
          </p>
        </div>
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full sm:w-auto justify-center shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-2"
        >
          <CheckIcon className="w-4 h-4" />
          <span>{isLoading ? 'Saving...' : 'Save Form & /track Controls'}</span>
        </Button>
      </div>

      {saveSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {saveSuccessMessage}
        </Alert>
      )}
      {saveError && (
        <Alert variant="error" className="animate-in fade-in text-xs">
          {saveError}
        </Alert>
      )}

      {/* Card 1: Multi-Vehicle & Group Transport Policy */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
            <div>
              <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
                <CarIcon className="w-5 h-5 text-blue-600 shrink-0" />
                <span>Multi-Vehicle Dispatch &amp; Large Party Assistance</span>
              </CardTitle>
              <CardDescription className="text-xs text-fg-muted mt-0.5">
                Configure client multi-car selection on <code>/book</code> or automatic group transport routing to Dispatch.
              </CardDescription>
            </div>
            <Badge variant={formConfig.allowMultiVehicle ? 'success' : 'default'} size="sm" className="font-bold text-[10px] self-start shrink-0">
              {formConfig.allowMultiVehicle ? 'Multi-Vehicle Allowed' : 'Dispatch Assistance Notice'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-status-info-border/80 bg-status-info-bg/30">
            <div className="space-y-0.5 min-w-0">
              <h4 className="text-xs font-extrabold text-fg-primary">
                Allow Clients to Select Multiple Vehicles on <code>/book</code>
              </h4>
              <p className="text-[11px] text-fg-secondary">
                Shows <strong>&ldquo;+ Add Vehicle&rdquo;</strong> when enabled, or displays an assistance callout with your dispatch contact info when disabled.
              </p>
            </div>
            <input
              type="checkbox"
              checked={formConfig.allowMultiVehicle}
              onChange={(e) => setFormConfig((prev) => ({ ...prev, allowMultiVehicle: e.target.checked }))}
              className="w-4 h-4 rounded text-blue-600 mt-1 shrink-0 cursor-pointer"
            />
          </div>

          {formConfig.allowMultiVehicle ? (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border-subtle bg-surface-subtle/60">
              <div>
                <h4 className="text-xs font-extrabold text-fg-primary">Max Vehicles per Booking</h4>
                <p className="text-[11px] text-fg-muted">Limits simultaneous cars per checkout (2–10).</p>
              </div>
              <input
                type="number"
                min={2}
                max={10}
                value={formConfig.maxVehiclesAllowed}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    maxVehiclesAllowed: Math.min(10, Math.max(2, Number(e.target.value) || 3)),
                  }))
                }
                className="w-20 px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-mono font-bold bg-surface-card text-center"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-fg-secondary block mb-1">Dispatch Assistance Phone</label>
                  <Input
                    value={formConfig.multiVehicleCallPhone || ''}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, multiVehicleCallPhone: e.target.value }))}
                    placeholder={COMPANY_CONFIG.phone.dispatch}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-fg-secondary block mb-1">Dispatch Assistance Email</label>
                  <Input
                    value={formConfig.multiVehicleCallEmail || ''}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, multiVehicleCallEmail: e.target.value }))}
                    placeholder={COMPANY_CONFIG.email.dispatch}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                value={formConfig.multiVehicleCustomNote || ''}
                onChange={(e) => setFormConfig((prev) => ({ ...prev, multiVehicleCustomNote: e.target.value }))}
                placeholder={`Need more than 1 vehicle? Call ${displayPhone} or email ${displayEmail} for coordinated multi-car dispatch.`}
                className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-xl text-xs font-medium focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Scheduling Windows & STL Lambert Airport Rules */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-4 sm:p-5">
          <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Scheduling Windows &amp; STL Airport Pickup Rules</span>
          </CardTitle>
          <CardDescription className="text-xs text-fg-muted">
            Operational lead times, ASAP radius, flight number requirement, and STL Lambert curbside guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-fg-strong block">Allow ASAP Rides</span>
                <span className="text-[10px] text-fg-muted">On-demand pickup</span>
              </div>
              <input type="checkbox" checked={formConfig.allowImmediateAsap} onChange={(e) => setFormConfig((prev) => ({ ...prev, allowImmediateAsap: e.target.checked }))} className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer" />
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="text-xs font-bold text-fg-strong block mb-1">Min Advance Notice (Mins)</label>
              <input type="number" min={15} max={1440} step={15} value={formConfig.minAdvanceNoticeMinutes} onChange={(e) => setFormConfig((prev) => ({ ...prev, minAdvanceNoticeMinutes: Number(e.target.value) }))} className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold bg-surface-card" />
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="text-xs font-bold text-fg-strong block mb-1">Max Advance (Days)</label>
              <input type="number" min={7} max={365} value={formConfig.maxAdvanceBookingDays || 90} onChange={(e) => setFormConfig((prev) => ({ ...prev, maxAdvanceBookingDays: Number(e.target.value) }))} className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold bg-surface-card" />
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="text-xs font-bold text-fg-strong block mb-1">ASAP Radius (Miles)</label>
              <input type="number" min={5} max={100} value={formConfig.asapSearchRadiusMiles || 25} onChange={(e) => setFormConfig((prev) => ({ ...prev, asapSearchRadiusMiles: Number(e.target.value) }))} className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold bg-surface-card" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-fg-strong flex items-center gap-1">
                  <PlaneLandingIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Require Flight #</span>
                </span>
                <span className="text-[10px] text-fg-muted">STL &amp; SUS pickups</span>
              </div>
              <input type="checkbox" checked={formConfig.requireFlightNumberForAirport} onChange={(e) => setFormConfig((prev) => ({ ...prev, requireFlightNumberForAirport: e.target.checked }))} className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer" />
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="text-xs font-bold text-fg-strong block mb-1">Meet &amp; Greet Mode</label>
              <Select size="sm" value={formConfig.airportMeetAndGreetOptions || 'curbside'} onChange={(e) => setFormConfig((prev) => ({ ...prev, airportMeetAndGreetOptions: e.target.value as any }))}>
                <option value="curbside">Curbside Pickup Only</option>
                <option value="baggage_claim">Baggage Claim Escort</option>
                <option value="both">Client Choice</option>
              </Select>
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="text-xs font-bold text-fg-strong block mb-1">Flight Delay Grace (Mins)</label>
              <input type="number" min={0} max={120} step={5} value={formConfig.flightDelayGraceMinutes || 45} onChange={(e) => setFormConfig((prev) => ({ ...prev, flightDelayGraceMinutes: Number(e.target.value) }))} className="w-full px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-bold bg-surface-card" />
            </div>
          </div>

          <div className="p-3.5 bg-status-info-bg/60 border border-status-info-border rounded-xl space-y-1.5">
            <label className="text-xs font-bold text-status-info-fg block">
              STL Lambert Airport Pickup Instructions (Confirmation Screen &amp; Emails)
            </label>
            <textarea
              rows={2}
              value={formConfig.lambertPickupInstructions ?? ''}
              onChange={(e) => setFormConfig((prev) => ({ ...prev, lambertPickupInstructions: e.target.value }))}
              className="w-full px-3 py-2 border border-status-info-border rounded-lg text-xs text-fg-primary bg-surface-card focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Retail Payment Methods & Corporate Portal Gate */}
      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
        <CardHeader className="border-b border-border-faint bg-surface-subtle/50 p-4 sm:p-5">
          <CardTitle className="text-base font-extrabold text-fg-primary flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Equipment, Retail Payment Options &amp; Corporate Portal Gate</span>
          </CardTitle>
          <CardDescription className="text-xs text-fg-muted">
            Child safety seats, round-trip toggles, retail checkout methods, and B2B Corporate Portal enforcement.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg-strong">Child Safety Seats</span>
              <input
                type="checkbox"
                checked={formConfig.allowChildSafetySeats}
                onChange={(e) => setFormConfig((prev) => ({ ...prev, allowChildSafetySeats: e.target.checked }))}
                className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer"
              />
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg-strong">Round Trip Booking</span>
              <input
                type="checkbox"
                checked={formConfig.allowRoundTrip}
                onChange={(e) => setFormConfig((prev) => ({ ...prev, allowRoundTrip: e.target.checked }))}
                className="w-4 h-4 rounded text-blue-600 shrink-0 cursor-pointer"
              />
            </div>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-xl">
              <label className="text-xs font-bold text-fg-strong block mb-1">Card Pre-Auth Threshold ($)</label>
              <input
                type="number"
                min={0}
                step={10}
                value={formConfig.cardPreAuthThresholdAmount || 100}
                onChange={(e) => setFormConfig((prev) => ({ ...prev, cardPreAuthThresholdAmount: Number(e.target.value) }))}
                className="w-full px-2.5 py-1 border border-border-subtle rounded-lg text-xs font-bold bg-surface-card"
              />
            </div>
          </div>

          <div className="p-3.5 bg-surface-subtle/80 border border-border-subtle rounded-xl space-y-2">
            <span className="text-xs font-bold text-fg-strong block">
              Retail Checkout Payment Methods (<code>/book</code> &amp; <code>/app/passenger</code>):
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={formConfig.acceptedPaymentMethods.includes('card')}
                  onChange={() => toggleRetailPaymentMethod('card')}
                  className="w-4 h-4 rounded text-blue-600 shrink-0"
                />
                <CreditCardIcon className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                <span>Credit / Debit Card</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={formConfig.acceptedPaymentMethods.includes('cash')}
                  onChange={() => toggleRetailPaymentMethod('cash')}
                  className="w-4 h-4 rounded text-blue-600 shrink-0"
                />
                <CashIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Cash (Pay Driver in Car)</span>
              </label>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-status-staged-border bg-status-staged-bg/40 flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-extrabold text-fg-primary flex items-center gap-1.5">
                  <BuildingIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Allow Public Corporate Account Checkout on <code>/book</code></span>
                </h4>
                <Badge variant={formConfig.allowPublicCorporateCheckout ? 'warning' : 'success'} size="sm" className="text-[10px] font-bold">
                  {formConfig.allowPublicCorporateCheckout ? 'Public Account Tab Enabled' : 'Gated to /app/corporate (Recommended)'}
                </Badge>
              </div>
              <p className="text-[11px] text-fg-secondary leading-relaxed">
                Default <strong>OFF</strong>: self-service corporate rides authenticate through{' '}
                <Link to="/app/corporate" className="font-bold text-status-staged-fg underline">
                  /app/corporate
                </Link>{' '}
                with locked PO &amp; credit governance, while internal operators on <code>/app/dispatch</code> always retain full <code>Account</code> billing.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(formConfig.allowPublicCorporateCheckout)}
              onChange={(e) => handleTogglePublicCorporateGate(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 mt-1 shrink-0 cursor-pointer"
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 4: Guest /track Self-Service Policy Card */}
      <GuestSelfServicePolicyCard
        policy={formConfig.guestSelfServicePolicy}
        onChange={(nextPolicy) => setFormConfig((prev) => ({ ...prev, guestSelfServicePolicy: nextPolicy }))}
      />

      <Card variant="elevated" className="border-border-subtle bg-surface-card shadow-xs">
        <CardFooter className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-fg-muted flex items-center gap-1.5">
            <InfoIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Changes sync live to <code>config/publicSettings</code> for <code>/book</code> &amp; <code>/track</code>.</span>
          </span>
          <Button type="submit" variant="primary" disabled={isLoading} className="w-full sm:w-auto justify-center text-xs font-bold">
            {isLoading ? 'Saving Changes...' : 'Save Form & /track Policies'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
