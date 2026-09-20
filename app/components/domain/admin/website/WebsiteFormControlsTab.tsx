import React, { useState } from 'react';
import type { AppSettings, CustomerBookingConfig } from '../../../../core/types/config';
import { DEFAULT_CUSTOMER_BOOKING_CONFIG } from '../../../../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { Badge } from '../../../ui/Badge';
import { Alert } from '../../../ui/Alert';
import {
  CarIcon,
  ClockIcon,
  ShieldCheckIcon,
  CheckIcon,
  CreditCardIcon,
  InfoIcon,
  PlaneLandingIcon,
} from '../../../ui/Icons';

export interface WebsiteFormControlsTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export function WebsiteFormControlsTab({
  settings,
  onSave,
  isLoading,
}: WebsiteFormControlsTabProps) {
  const [formConfig, setFormConfig] = useState<CustomerBookingConfig>({
    ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
    ...(settings.customerBookingConfig || {}),
  });

  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayPhone =
    formConfig.multiVehicleCallPhone || COMPANY_CONFIG.phone.dispatch || '(314) 738-0100';
  const displayEmail =
    formConfig.multiVehicleCallEmail || COMPANY_CONFIG.email.dispatch || 'dispatch@chesterfieldtaxi.com';

  const togglePaymentMethod = (method: 'card' | 'cash' | 'account') => {
    setFormConfig((prev) => {
      const exists = prev.acceptedPaymentMethods.includes(method);
      let updated: ('card' | 'cash' | 'account')[];
      if (exists) {
        if (prev.acceptedPaymentMethods.length <= 1) return prev;
        updated = prev.acceptedPaymentMethods.filter((m) => m !== method);
      } else {
        updated = [...prev.acceptedPaymentMethods, method];
      }
      return { ...prev, acceptedPaymentMethods: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaveSuccessMessage(null);
      setSaveError(null);

      await onSave({
        customerBookingConfig: formConfig,
        updatedAt: new Date().toISOString(),
      });

      setSaveSuccessMessage('Customer booking form configurations successfully published.');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save customer form settings.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
            Online Booking Engine Rules
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Customer Booking Form Controls &amp; Policies
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Govern passenger self-service capabilities, fleet selection limits, lead times, and airport flight tracking.
          </p>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-2"
        >
          <CheckIcon className="w-4 h-4" />
          <span>{isLoading ? 'Saving...' : 'Save Form Controls'}</span>
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
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <CarIcon className="w-5 h-5 text-blue-600" />
                Multi-Vehicle Dispatch &amp; Large Party Assistance
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Configure customer self-service vehicle addition or automatic routing to dispatch for group transport.
              </CardDescription>
            </div>
            <Badge
              variant={formConfig.allowMultiVehicle ? 'success' : 'default'}
              size="sm"
              className="font-bold text-[10px]"
            >
              {formConfig.allowMultiVehicle ? 'Multi-Vehicle Allowed' : 'Dispatch Assistance Notice'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <div className="flex items-start justify-between p-4 rounded-xl border border-blue-200/80 bg-blue-50/30">
            <div className="space-y-1 pr-4">
              <h4 className="text-xs font-extrabold text-slate-900">
                Allow Customers to Select Multiple Vehicles on <code>/book</code>
              </h4>
              <p className="text-[11px] text-slate-600">
                When enabled, riders see the <strong>&ldquo;+ Add Vehicle&rdquo;</strong> button to book multiple sedans/SUVs simultaneously in a single reservation. When disabled, customers see an advisory note to call or email dispatch.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={formConfig.allowMultiVehicle}
                onChange={(e) =>
                  setFormConfig((prev) => ({ ...prev, allowMultiVehicle: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {formConfig.allowMultiVehicle ? (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900">
                    Maximum Vehicles per Customer Booking
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Limits simultaneous fleet allocation per single checkout.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) => ({
                        ...prev,
                        maxVehiclesAllowed: Math.max(2, prev.maxVehiclesAllowed - 1),
                      }))
                    }
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center shadow-xs"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-slate-900 text-base w-6 text-center">
                    {formConfig.maxVehiclesAllowed}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) => ({
                        ...prev,
                        maxVehiclesAllowed: Math.min(10, prev.maxVehiclesAllowed + 1),
                      }))
                    }
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center shadow-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Dispatch Phone for Assistance
                  </label>
                  <Input
                    value={formConfig.multiVehicleCallPhone || ''}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        multiVehicleCallPhone: e.target.value,
                      }))
                    }
                    placeholder={COMPANY_CONFIG.phone.dispatch}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Dispatch Email for Assistance
                  </label>
                  <Input
                    value={formConfig.multiVehicleCallEmail || ''}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        multiVehicleCallEmail: e.target.value,
                      }))
                    }
                    placeholder={COMPANY_CONFIG.email.dispatch}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Custom Assistance Note (Optional Override)
                </label>
                <textarea
                  rows={2}
                  value={formConfig.multiVehicleCustomNote || ''}
                  onChange={(e) =>
                    setFormConfig((prev) => ({
                      ...prev,
                      multiVehicleCustomNote: e.target.value,
                    }))
                  }
                  placeholder="Need more than 1 vehicle? Call or email dispatch for group discounts and coordinated multi-vehicle arrivals."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                  Live Customer Notice Preview (Rendered on <code>/book</code>)
                </span>
                <div className="flex items-start gap-2.5 text-xs text-amber-900">
                  <span className="text-base shrink-0">ℹ️</span>
                  <div>
                    <p className="font-semibold">
                      {formConfig.multiVehicleCustomNote || (
                        <>
                          Need more than 1 vehicle? For group travel or multi-car bookings, please call our 24/7 dispatch at{' '}
                          <strong className="underline">{displayPhone}</strong> or email{' '}
                          <strong className="underline">{displayEmail}</strong>.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Scheduling Windows & Airport Rules */}
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-amber-600" />
            Scheduling Windows, Lead Times &amp; Flight Tracking
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Operational boundaries for immediate ASAP requests, scheduled advance pickups, and airport delay grace periods.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Allow On-Demand ASAP Rides
              </label>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">Immediate pickup option</span>
                <input
                  type="checkbox"
                  checked={formConfig.allowImmediateAsap}
                  onChange={(e) =>
                    setFormConfig((prev) => ({ ...prev, allowImmediateAsap: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Min Advance Notice (Minutes)
              </label>
              <input
                type="number"
                min="15"
                max="1440"
                step="15"
                value={formConfig.minAdvanceNoticeMinutes}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    minAdvanceNoticeMinutes: Number(e.target.value),
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Lead time for scheduled trips</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Max Advance Booking (Days)
              </label>
              <input
                type="number"
                min="7"
                max="365"
                value={formConfig.maxAdvanceBookingDays || 90}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    maxAdvanceBookingDays: Number(e.target.value),
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Future calendar limit</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                ASAP Search Radius (Miles)
              </label>
              <input
                type="number"
                min="5"
                max="100"
                value={formConfig.asapSearchRadiusMiles || 25}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    asapSearchRadiusMiles: Number(e.target.value),
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Geographic limit for ASAP calls</span>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Card 3: STL Lambert Airport Rules & Curbside Description */}
      <Card variant="elevated" className="border-blue-200 bg-white shadow-xs">
        <CardHeader className="border-b border-blue-100 bg-blue-50/50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-base font-extrabold text-blue-950 flex items-center gap-2">
              <PlaneLandingIcon className="w-5 h-5 text-blue-600" />
              STL Lambert Airport Rules &amp; Curbside Pickup Description
            </CardTitle>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto">
              Airport Automation
            </span>
          </div>
          <CardDescription className="text-xs text-blue-800/80">
            Configure automated flight tracking, complimentary grace windows, terminal pickup meet points, and customer confirmation email instructions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Require Flight # for Airports</label>
                <input
                  type="checkbox"
                  checked={formConfig.requireFlightNumberForAirport}
                  onChange={(e) =>
                    setFormConfig((prev) => ({
                      ...prev,
                      requireFlightNumberForAirport: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">STL Lambert &amp; Spirit transfers</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Airport Meet &amp; Greet Preference
              </label>
              <select
                value={formConfig.airportMeetAndGreetOptions || 'curbside'}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    airportMeetAndGreetOptions: e.target.value as any,
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white"
              >
                <option value="curbside">Curbside Pickup Only</option>
                <option value="baggage_claim">Baggage Claim Inside Escort</option>
                <option value="both">Customer Choice at Booking</option>
              </select>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Flight Delay Grace Period (Mins)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                step="5"
                value={formConfig.flightDelayGraceMinutes || 45}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    flightDelayGraceMinutes: Number(e.target.value),
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">Complimentary airport wait time</span>
            </div>
          </div>

          {/* Lambert Airport Pickup Location Description */}
          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-blue-950 block">
                STL Lambert Airport Pickup Location Description (Curbside &amp; Baggage Claim)
              </label>
              <span className="text-[10px] text-blue-700 font-bold bg-white px-2.5 py-0.5 rounded border border-blue-200 shadow-2xs">
                Email &amp; Confirmation Notice
              </span>
            </div>
            <p className="text-[11px] text-blue-900 leading-relaxed font-medium">
              Curbside doors, terminal baggage claim instructions, or specific chauffeur meetup points shown to passengers on the confirmation screen and transactional emails when pickup is STL Lambert Airport.
            </p>
            <textarea
              rows={3}
              value={formConfig.lambertPickupInstructions ?? 'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.'}
              onChange={(e) =>
                setFormConfig((prev) => ({
                  ...prev,
                  lambertPickupInstructions: e.target.value,
                }))
              }
              placeholder="e.g. Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2..."
              className="w-full px-3 py-2 border border-blue-200 rounded-lg text-xs text-slate-900 leading-relaxed bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Equipment, Child Seats & Cancellation Penalties */}
      <Card variant="elevated" className="border-slate-200 bg-white shadow-xs">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
          <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-emerald-600" />
            Equipment Add-ons, Child Safety Seats &amp; Cancellation Terms
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Child seat inventory fees, return trip incentives, and cancellation thresholds.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Child Safety Seats</label>
                <input
                  type="checkbox"
                  checked={formConfig.allowChildSafetySeats}
                  onChange={(e) =>
                    setFormConfig((prev) => ({
                      ...prev,
                      allowChildSafetySeats: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>
              {formConfig.allowChildSafetySeats && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Fee per unit:</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs font-bold">$</span>
                    <input
                      type="number"
                      value={formConfig.carSeatRentalFeePerUnit || 10}
                      onChange={(e) =>
                        setFormConfig((prev) => ({
                          ...prev,
                          carSeatRentalFeePerUnit: Number(e.target.value),
                        }))
                      }
                      className="w-16 px-1.5 py-0.5 border border-slate-200 rounded text-xs font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Round Trip Booking</label>
                <input
                  type="checkbox"
                  checked={formConfig.allowRoundTrip}
                  onChange={(e) =>
                    setFormConfig((prev) => ({
                      ...prev,
                      allowRoundTrip: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>
              {formConfig.allowRoundTrip && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Return discount (%):</span>
                  <input
                    type="number"
                    min="0"
                    max="25"
                    value={formConfig.roundTripDiscountPercent || 5}
                    onChange={(e) =>
                      setFormConfig((prev) => ({
                        ...prev,
                        roundTripDiscountPercent: Number(e.target.value),
                      }))
                    }
                    className="w-16 px-1.5 py-0.5 border border-slate-200 rounded text-xs font-bold mt-0.5"
                  />
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Free Cancellation (Mins)
              </label>
              <input
                type="number"
                min="30"
                max="1440"
                step="30"
                value={formConfig.freeCancellationWindowMinutes || 120}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    freeCancellationWindowMinutes: Number(e.target.value),
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Full refund window</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Card Pre-Auth Threshold ($)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={formConfig.cardPreAuthThresholdAmount || 100}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    cardPreAuthThresholdAmount: Number(e.target.value),
                  }))
                }
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Fares above require card on file</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl">
            <span className="text-xs font-bold text-slate-800 block mb-2">
              Accepted Customer Payment Methods:
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={formConfig.acceptedPaymentMethods.includes('card')}
                  onChange={() => togglePaymentMethod('card')}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span>💳 Credit / Debit Card (Online Pre-Auth)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={formConfig.acceptedPaymentMethods.includes('cash')}
                  onChange={() => togglePaymentMethod('cash')}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span>💵 Cash to Driver in Cab</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={formConfig.acceptedPaymentMethods.includes('account')}
                  onChange={() => togglePaymentMethod('account')}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span>🏢 Corporate Direct Billing Account</span>
              </label>
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-slate-100 bg-slate-50/50 p-4 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            className="text-xs font-bold"
          >
            {isLoading ? 'Saving Changes...' : 'Save Customer Booking Form Controls'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
