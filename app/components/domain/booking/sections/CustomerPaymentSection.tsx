import React from 'react';
import { Link } from 'react-router';
import type { TripPricing } from '../../../../core/types';
import type { CustomerBookingConfig } from '../../../../core/types/config';
import type { QuoteResponse } from '../../../../core/services/booking-service';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import {
  formatTime12h,
  type CorporatePortalBookingContext,
  type CustomerBookingFormState,
} from '../../../../core/hooks/booking';
import { StripePaymentInput } from '../../payments/StripePaymentInput';
import { PriceBreakdownPanel } from '../PriceBreakdownPanel';
import {
  BuildingIcon,
  CarIcon,
  ChevronDownIcon,
  ClockIcon,
  CreditCardIcon,
  DollarSignIcon,
  HistoryIcon,
  LuggageIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../../ui/Icons';

export interface CustomerPaymentSectionProps {
  form: CustomerBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerBookingFormState>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  bookingConfig: CustomerBookingConfig;
  stripeOnlineEnabled: boolean;
  stripePublishableKey: string;
  totalDisplayFare: number | null;
  corporatePortalContext?: CorporatePortalBookingContext;
}

export function CustomerPaymentSection({
  form,
  setForm,
  errors,
  setErrors,
  bookingConfig,
  stripeOnlineEnabled,
  stripePublishableKey,
  totalDisplayFare,
  corporatePortalContext,
}: CustomerPaymentSectionProps) {
  const allowed =
    bookingConfig.acceptedPaymentMethods && bookingConfig.acceptedPaymentMethods.length > 0
      ? bookingConfig.acceptedPaymentMethods
      : ['card', 'cash', 'account'];

  const allMethods = [
    {
      key: 'card' as const,
      label: stripeOnlineEnabled ? 'Card' : 'Card (In Car)',
      Icon: CreditCardIcon,
    },
    { key: 'cash' as const, label: 'Cash (In Car)', Icon: DollarSignIcon },
    { key: 'account' as const, label: 'Corporate', Icon: BuildingIcon },
  ];
  const methodsToRender = allMethods.filter((m) => allowed.includes(m.key));
  const colClass =
    methodsToRender.length === 1
      ? 'grid-cols-1'
      : methodsToRender.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-3';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:p-5 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center">
            4
          </span>
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">Payment Method</h2>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          {stripeOnlineEnabled ? 'Online or In Car' : 'Pay in Car'}
        </span>
      </div>

      <div className={`grid ${colClass} gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl`}>
        {methodsToRender.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                paymentMethod: m.key,
                cardPaymentType:
                  m.key === 'card' && stripeOnlineEnabled ? prev.cardPaymentType : 'terminal',
              }))
            }
            className={`py-2.5 px-2 text-center rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              form.paymentMethod === m.key
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <m.Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Credit Card Sub-panel */}
      {form.paymentMethod === 'card' && (
        <div className="space-y-2.5 animate-in fade-in duration-150">
          {stripeOnlineEnabled ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      cardPaymentType: 'terminal',
                      paymentToken: 'pay_in_cab',
                    }))
                  }
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                    form.cardPaymentType === 'terminal'
                      ? 'bg-blue-50 border-blue-500 text-blue-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  Pay Driver in Car
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      cardPaymentType: 'manual',
                    }))
                  }
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                    form.cardPaymentType === 'manual'
                      ? 'bg-blue-50 border-blue-500 text-blue-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  Pay Online by Card
                </button>
              </div>

              {form.cardPaymentType === 'manual' ? (
                <div data-field="paymentToken" className="space-y-1.5">
                  <StripePaymentInput
                    publishableKey={stripePublishableKey || undefined}
                    amount={totalDisplayFare || 0}
                    saveCardOnFile={form.saveCardOnFile}
                    onSaveCardChange={(save) =>
                      setForm((prev) => ({ ...prev, saveCardOnFile: save }))
                    }
                    onCardChange={({ token, brand, last4, complete, payInCab }) => {
                      setForm((prev) => ({
                        ...prev,
                        paymentToken: complete && token ? token : '',
                        cardBrand: brand || '',
                        cardLast4: last4 || '',
                        cardPaymentType: payInCab ? 'terminal' : prev.cardPaymentType,
                      }));
                      if (complete && errors.paymentToken) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.paymentToken;
                          return next;
                        });
                      }
                    }}
                  />
                  {errors.paymentToken && (
                    <p className="text-xs text-red-600 font-semibold">{errors.paymentToken}</p>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-2.5">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                      <span>Pay Driver in Car (Tap, Chip, or Swipe)</span>
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        No Upfront Charge
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Pay inside the car using Apple Pay, Google Pay, or any major card. Nothing is
                      charged upfront.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-2.5">
              <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                  <span>Pay Driver in Car (Tap, Chip, or Swipe)</span>
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    No Upfront Charge
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Pay securely inside the car using Apple Pay, Google Pay, or any major credit or
                  debit card. Nothing is charged upfront.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cash Sub-panel */}
      {form.paymentMethod === 'cash' && (
        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-center gap-2.5">
          <DollarSignIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Pay cash directly to your driver at the end of your ride. Exact change is appreciated.
          </span>
        </div>
      )}

      {/* Corporate Account Sub-panel */}
      {form.paymentMethod === 'account' && (
        <div
          className={`p-3.5 rounded-xl space-y-3 animate-in fade-in duration-150 ${
            corporatePortalContext
              ? 'bg-indigo-50/80 border border-indigo-200'
              : 'bg-amber-50/80 border border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5 ${
                corporatePortalContext ? 'text-indigo-950' : 'text-amber-900'
              }`}
            >
              <BuildingIcon className="w-3.5 h-3.5" />
              <span>
                {corporatePortalContext
                  ? 'Pre-Verified Corporate Direct Billing'
                  : 'Corporate Account'}
              </span>
            </span>
            {corporatePortalContext && (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                <ShieldCheckIcon className="w-3 h-3" />
                Verified • {corporatePortalContext.accountNumber}
              </span>
            )}
          </div>

          {!corporatePortalContext && (
            <div className="text-[11px] bg-white p-3 rounded-xl border border-amber-200 text-amber-900 flex items-start gap-2 shadow-2xs">
              <PhoneIcon className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold">Need account assistance?</span> Call 24/7 Dispatch
                at{' '}
                <a
                  href={`tel:${(COMPANY_CONFIG.phone?.primaryRaw || '+13147380100').replace(
                    /[^\d+]/g,
                    ''
                  )}`}
                  className="font-bold underline text-amber-950 hover:text-blue-700"
                >
                  {COMPANY_CONFIG.phone?.dispatch ||
                    COMPANY_CONFIG.phone?.primary ||
                    '(314) 738-0100'}
                </a>{' '}
                to verify or set up direct corporate billing.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <input
                type="text"
                name="corporateOrgName"
                placeholder="Organization / Company Name *"
                value={form.corporateOrgName}
                readOnly={Boolean(corporatePortalContext)}
                onChange={(e) => {
                  if (corporatePortalContext) return;
                  setForm((prev) => ({ ...prev, corporateOrgName: e.target.value }));
                  if (errors.corporateOrgName) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.corporateOrgName;
                      return next;
                    });
                  }
                }}
                required={form.paymentMethod === 'account'}
                className={`w-full px-3 py-2.5 border ${
                  corporatePortalContext
                    ? 'bg-slate-100 border-indigo-200 text-slate-700 font-semibold cursor-not-allowed'
                    : errors.corporateOrgName
                    ? 'bg-white border-red-400'
                    : 'bg-white border-amber-300'
                } rounded-xl text-base sm:text-sm`}
              />
              {errors.corporateOrgName && (
                <p className="text-xs text-red-600 font-semibold mt-1">{errors.corporateOrgName}</p>
              )}
            </div>
            <div>
              <input
                type="text"
                name="corporateAccountNumber"
                placeholder="Corporate Account # (or 'Pending Dispatch') *"
                value={form.corporateAccountNumber}
                readOnly={Boolean(corporatePortalContext)}
                onChange={(e) => {
                  if (corporatePortalContext) return;
                  setForm((prev) => ({ ...prev, corporateAccountNumber: e.target.value }));
                  if (errors.corporateAccountNumber) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.corporateAccountNumber;
                      return next;
                    });
                  }
                }}
                className={`w-full px-3 py-2.5 border ${
                  corporatePortalContext
                    ? 'bg-slate-100 border-indigo-200 text-indigo-900 font-mono font-bold cursor-not-allowed'
                    : errors.corporateAccountNumber
                    ? 'bg-white border-red-400'
                    : 'bg-white border-amber-300'
                } rounded-xl text-base sm:text-sm`}
              />
              {errors.corporateAccountNumber && (
                <p className="text-xs text-red-600 font-semibold mt-1">
                  {errors.corporateAccountNumber}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              placeholder={
                corporatePortalContext?.poRequired
                  ? 'Active PO Number (Required) *'
                  : 'Billing PO / Project Code (Optional)'
              }
              value={form.billingPo}
              onChange={(e) => setForm((prev) => ({ ...prev, billingPo: e.target.value }))}
              className={`w-full px-3 py-2.5 bg-white border ${
                corporatePortalContext
                  ? 'border-indigo-200 font-mono font-semibold'
                  : 'border-amber-300'
              } rounded-xl text-base sm:text-sm`}
            />
            <input
              type="text"
              placeholder="Authorized By (Manager Name)"
              value={form.authorizedBy}
              onChange={(e) => setForm((prev) => ({ ...prev, authorizedBy: e.target.value }))}
              className={`w-full px-3 py-2.5 bg-white border ${
                corporatePortalContext ? 'border-indigo-200' : 'border-amber-300'
              } rounded-xl text-base sm:text-sm`}
            />
          </div>
          {corporatePortalContext && (
            <div>
              <input
                type="text"
                placeholder="Department / Cost Center Tag (e.g. EXEC-100)"
                value={form.costCenter}
                onChange={(e) => setForm((prev) => ({ ...prev, costCenter: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface CustomerTripSummaryCardProps {
  form: CustomerBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerBookingFormState>>;
  bookingConfig: CustomerBookingConfig;
  editingTripId?: string;
  quote: QuoteResponse | null;
  isQuoteLoading: boolean;
  activeOutboundPricing: TripPricing | null;
  activeReturnPricing: TripPricing | null;
  outboundFare: number | null;
  returnFare: number | null;
  totalDisplayFare: number | null;
  showPriceBreakdown: boolean;
  setShowPriceBreakdown: React.Dispatch<React.SetStateAction<boolean>>;
  totalCarSeats: number;
  returnTotalCarSeats: number;
  totalOversizedCount: number;
  returnTotalOversizedCount: number;
  oversizedItemsSummary?: string;
  returnOversizedItemsSummary?: string;
  validationErrorCount: number;
  isSubmitting: boolean;
  getFriendlyVehicleName: (choice: string) => string;
}

export function CustomerTripSummaryCard({
  form,
  setForm,
  bookingConfig,
  editingTripId,
  quote,
  isQuoteLoading,
  activeOutboundPricing,
  activeReturnPricing,
  outboundFare,
  returnFare,
  totalDisplayFare,
  showPriceBreakdown,
  setShowPriceBreakdown,
  totalCarSeats,
  returnTotalCarSeats,
  totalOversizedCount,
  returnTotalOversizedCount,
  oversizedItemsSummary,
  returnOversizedItemsSummary,
  validationErrorCount,
  isSubmitting,
  getFriendlyVehicleName,
}: CustomerTripSummaryCardProps) {
  return (
    <div
      id="trip-summary-card"
      className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 sm:p-5 space-y-3 sm:space-y-4"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-extrabold text-slate-900 text-base">Trip Summary</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
          {editingTripId ? 'Editing Trip' : 'Estimated Quote'}
        </span>
      </div>

      {/* Itinerary Preview */}
      <div className="space-y-2.5 text-xs">
        <div className="flex items-start gap-2">
          <ClockIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">
              Pickup Time
            </span>
            <span className="font-semibold text-slate-800">
              {form.timingType === 'later'
                ? form.scheduledDate && form.scheduledTime
                  ? `${form.scheduledDate} at ${formatTime12h(form.scheduledTime)}`
                  : 'Select pickup date & time'
                : 'Immediate On-Demand (ASAP)'}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <MapPinIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <div className="flex-1 overflow-hidden">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Route</span>
            <p
              className="font-semibold text-slate-800 truncate"
              title={form.pickupAddress || 'Enter pickup'}
            >
              {form.pickupAddress || 'Select Pickup Location'}
            </p>
            {form.intermediateStops.length > 0 && (
              <p className="text-[10px] text-blue-600 font-medium">
                + {form.intermediateStops.length} intermediate stop(s)
              </p>
            )}
            <p
              className="font-semibold text-slate-800 truncate mt-0.5"
              title={form.dropoffAddress || 'Enter dropoff'}
            >
              &darr; {form.dropoffAddress || 'Select Dropoff Location'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <CarIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Vehicle</span>
            <span className="font-semibold text-slate-800">
              {bookingConfig.allowMultiVehicle && form.selectedVehicles.length > 1
                ? `${form.selectedVehicles.length} Vehicles (${form.selectedVehicles
                    .map((v) => getFriendlyVehicleName(v))
                    .join(', ')}) • ${form.passengers} ${
                    form.passengers === 1 ? 'Passenger' : 'Passengers'
                  } • ${form.bags} ${form.bags === 1 ? 'Bag' : 'Bags'}`
                : `${getFriendlyVehicleName(form.vehicleChoice)} • ${form.passengers} ${
                    form.passengers === 1 ? 'Passenger' : 'Passengers'
                  } • ${form.bags} ${form.bags === 1 ? 'Bag' : 'Bags'}`}
            </span>
          </div>
        </div>

        {form.returnTrip && (
          <div className="pt-2.5 mt-1 border-t border-indigo-100 space-y-2">
            <div className="flex items-start gap-2">
              <HistoryIcon className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-indigo-600 font-bold uppercase block">
                  Return Pickup
                </span>
                <span className="font-semibold text-slate-800">
                  {form.returnDate && form.returnTime
                    ? `${form.returnDate} at ${formatTime12h(form.returnTime)}`
                    : 'Select return date & time'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPinIcon className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
              <div className="flex-1 overflow-hidden">
                <span className="text-[10px] text-indigo-600 font-bold uppercase block">
                  Return Route
                </span>
                <p
                  className="font-semibold text-slate-800 truncate"
                  title={form.returnPickupAddress || 'Return pickup'}
                >
                  {form.returnPickupAddress || form.dropoffAddress || 'Select Return Pickup'}
                </p>
                {form.returnIntermediateStops.filter((s) => s.address?.trim()).length > 0 && (
                  <p className="text-[10px] text-indigo-600 font-medium">
                    + {form.returnIntermediateStops.filter((s) => s.address?.trim()).length} return
                    stop(s)
                  </p>
                )}
                <p
                  className="font-semibold text-slate-800 truncate mt-0.5"
                  title={form.returnDropoffAddress || 'Return dropoff'}
                >
                  &darr;{' '}
                  {form.returnDropoffAddress || form.pickupAddress || 'Select Return Dropoff'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <CarIcon className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] text-indigo-600 font-bold uppercase block">
                  Return Vehicle
                </span>
                <span className="font-semibold text-slate-800">
                  {bookingConfig.allowMultiVehicle && form.returnSelectedVehicles.length > 1
                    ? `${form.returnSelectedVehicles.length} Vehicles (${form.returnSelectedVehicles
                        .map((v) => getFriendlyVehicleName(v))
                        .join(', ')}) • ${form.returnPassengers} ${
                        form.returnPassengers === 1 ? 'Passenger' : 'Passengers'
                      } • ${form.returnBags} ${form.returnBags === 1 ? 'Bag' : 'Bags'}`
                    : `${getFriendlyVehicleName(form.returnVehicleChoice)} • ${
                        form.returnPassengers
                      } ${form.returnPassengers === 1 ? 'Passenger' : 'Passengers'} • ${
                        form.returnBags
                      } ${form.returnBags === 1 ? 'Bag' : 'Bags'}`}
                </span>
              </div>
            </div>

            {returnTotalCarSeats > 0 && (
              <div className="flex items-start gap-2">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] text-indigo-700 font-bold uppercase block">
                    Return Child Seats
                  </span>
                  <span className="font-semibold text-slate-800">
                    {returnTotalCarSeats} Seat(s) Requested
                  </span>
                </div>
              </div>
            )}

            {form.returnHasOversizedLuggage &&
              (returnTotalOversizedCount > 0 || form.returnOversizedLuggageNotes) && (
                <div className="flex items-start gap-2">
                  <LuggageIcon className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-indigo-700 font-bold uppercase block">
                      Return Oversized Items
                    </span>
                    <span className="font-semibold text-slate-800">
                      {returnOversizedItemsSummary || 'Oversized Items'}
                      {form.returnOversizedLuggageNotes
                        ? ` (${form.returnOversizedLuggageNotes})`
                        : ''}
                    </span>
                  </div>
                </div>
              )}
          </div>
        )}

        {totalCarSeats > 0 && (
          <div className="flex items-start gap-2">
            <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="text-[10px] text-blue-700 font-bold uppercase block">
                Child Safety Seats
              </span>
              <span className="font-semibold text-slate-800">
                {totalCarSeats} Seat(s) Requested
              </span>
            </div>
          </div>
        )}

        {form.hasOversizedLuggage && (totalOversizedCount > 0 || form.oversizedLuggageNotes) && (
          <div className="flex items-start gap-2">
            <LuggageIcon className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="text-[10px] text-blue-700 font-bold uppercase block">
                Oversized Items
              </span>
              <span className="font-semibold text-slate-800">
                {oversizedItemsSummary || 'Oversized Items'}
                {form.oversizedLuggageNotes ? ` (${form.oversizedLuggageNotes})` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Total Estimated Fare (desktop only; mobile uses the sticky bar) + Interactive Price Breakdown */}
      <div className="pt-3 border-t border-slate-200 space-y-2.5">
        <div className="hidden lg:flex items-baseline justify-between gap-2">
          <div>
            <span className="text-xs text-slate-600 font-extrabold uppercase block">
              {form.returnTrip ? 'Estimated Round-Trip' : 'Estimated Fare'}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Final fare confirmed by dispatch
            </span>
          </div>
          <div className="text-right">
            {isQuoteLoading ? (
              <div className="flex items-center gap-1.5 text-blue-600 font-bold text-sm">
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                <span>Calculating...</span>
              </div>
            ) : totalDisplayFare !== null ? (
              <span className="text-2xl font-mono font-black text-slate-950">
                ${totalDisplayFare.toFixed(2)}
              </span>
            ) : (
              <span className="text-xl font-mono font-bold text-slate-400">$--</span>
            )}
          </div>
        </div>

        {/* Price Breakdown Toggle Button */}
        <button
          type="button"
          onClick={() => setShowPriceBreakdown((prev) => !prev)}
          disabled={!quote && !isQuoteLoading}
          aria-expanded={showPriceBreakdown}
          className="w-full py-2 px-3 rounded-xl text-xs font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 flex items-center justify-between transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span>{showPriceBreakdown ? 'Hide Price Breakdown' : 'View Price Breakdown'}</span>
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${showPriceBreakdown ? 'rotate-180' : ''}`}
          />
        </button>

        {showPriceBreakdown && (
          <PriceBreakdownPanel
            outboundPricing={activeOutboundPricing}
            returnPricing={activeReturnPricing}
            outboundDisplayFare={outboundFare}
            returnDisplayFare={returnFare}
            totalDisplayFare={totalDisplayFare}
            isRoundTrip={form.returnTrip}
            vehicleLabel={getFriendlyVehicleName(form.vehicleChoice)}
            returnVehicleLabel={getFriendlyVehicleName(form.returnVehicleChoice)}
          />
        )}
      </div>

      {/* Agreements: SMS, Terms & Privacy */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5 text-xs text-slate-600">
        <label className="flex items-start gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.smsConsent}
            onChange={(e) => setForm((prev) => ({ ...prev, smsConsent: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
          />
          <span className="text-[11px] text-slate-600 leading-tight group-hover:text-slate-900">
            Send me text updates when my driver is on the way and arrives.
          </span>
        </label>

        <label className="flex items-start gap-2 cursor-pointer group">
          <input
            type="checkbox"
            required
            defaultChecked
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
          />
          <span className="text-[11px] text-slate-600 leading-tight group-hover:text-slate-900">
            I agree to the{' '}
            <Link
              to="/terms"
              target="_blank"
              className="font-semibold text-blue-600 underline hover:text-blue-800"
            >
              Terms and Conditions
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy"
              target="_blank"
              className="font-semibold text-blue-600 underline hover:text-blue-800"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </div>

      {/* Validation Error Summary */}
      {validationErrorCount > 0 && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold"
        >
          Please review {validationErrorCount} highlighted field
          {validationErrorCount > 1 ? 's' : ''} above before submitting.
        </div>
      )}

      {/* Primary CTA Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          backgroundColor: 'var(--brand-primary)',
          color: 'var(--btn-primary-text)',
        }}
        className="hidden lg:flex w-full py-3.5 px-4 hover:opacity-95 active:opacity-90 font-extrabold text-sm rounded-xl shadow-md transition-all items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <SpinnerIcon className="w-4 h-4 animate-spin" />
            <span>{editingTripId ? 'Saving Updates...' : 'Submitting Request...'}</span>
          </>
        ) : (
          <span>{editingTripId ? 'Save Trip Updates' : 'Request Ride'}</span>
        )}
      </button>
    </div>
  );
}

export interface CustomerMobileSubmitBarProps {
  embeddedInApp: boolean;
  returnTrip: boolean;
  totalDisplayFare: number | null;
  isQuoteLoading: boolean;
  isSubmitting: boolean;
  editingTripId?: string;
  onOpenBreakdownFromMobile: () => void;
}

export function CustomerMobileSubmitBar({
  embeddedInApp,
  returnTrip,
  totalDisplayFare,
  isQuoteLoading,
  isSubmitting,
  editingTripId,
  onOpenBreakdownFromMobile,
}: CustomerMobileSubmitBarProps) {
  return (
    <div
      className={`fixed left-0 right-0 z-30 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-2.5 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] flex items-center justify-between gap-3 ${
        embeddedInApp ? 'bottom-[64px] md:bottom-[72px]' : 'bottom-0'
      }`}
    >
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider truncate">
            {returnTrip ? 'Est. Round-Trip' : 'Estimated Fare'}
          </span>
          {totalDisplayFare !== null && !isQuoteLoading && (
            <button
              type="button"
              onClick={onOpenBreakdownFromMobile}
              className="text-[10px] font-bold text-blue-600 underline hover:text-blue-800 cursor-pointer shrink-0"
            >
              Breakdown
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          {isQuoteLoading ? (
            <span className="text-sm font-bold text-blue-600 flex items-center gap-1">
              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
              Calculating...
            </span>
          ) : totalDisplayFare !== null ? (
            <>
              <span className="text-lg font-mono font-black text-slate-950">
                ${totalDisplayFare.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">est.</span>
            </>
          ) : (
            <span className="text-xs font-semibold text-slate-500">Enter route for estimate</span>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          backgroundColor: 'var(--brand-primary)',
          color: 'var(--btn-primary-text)',
        }}
        className="px-5 py-3 hover:opacity-95 active:opacity-90 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
      >
        {isSubmitting ? (
          <>
            <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
            <span>{editingTripId ? 'Saving...' : 'Submitting...'}</span>
          </>
        ) : (
          <span>{editingTripId ? 'Save Updates' : 'Request Ride'}</span>
        )}
      </button>
    </div>
  );
}
