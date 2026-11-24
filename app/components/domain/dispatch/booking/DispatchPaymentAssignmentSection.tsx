import React from 'react';
import type {
  CorporateAccountConfig,
  CorporateAuthorizedRider,
  NamedPricingRule,
  SurchargesConfig,
  UniversalExtrasConfig,
} from '../../../../core/types/config';
import type { TripPricing } from '../../../../core/types/trip';
import type { PoValidationResult } from '../../../../core/services/corporate-account.service';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import {
  DEFAULT_DISPATCH_COMPANIES as DEFAULT_COMPANIES,
} from '../../../../core/hooks/booking';
import { DriverAssignDropdown } from '../queue/DriverAssignDropdown';
import { DispatchCorporateAccountCard } from './DispatchCorporateAccountCard';
import { DispatchWaiveFeesDropdown } from './DispatchWaiveFeesDropdown';
import {
  CreditCardIcon,
  LockIcon,
  ShieldCheckIcon,
} from '../../../ui/Icons';
import { Select } from '../../../ui/Select';

export interface DispatchPaymentAssignmentSectionProps {
  paymentMethod: 'cash' | 'card' | 'account';
  setPaymentMethod: (val: 'cash' | 'card' | 'account') => void;
  cardPaymentType: 'terminal' | 'payment_link' | 'card_on_file' | 'manual';
  setCardPaymentType: (val: 'terminal' | 'payment_link' | 'card_on_file' | 'manual') => void;
  cardholderName: string;
  setCardholderName: (val: string) => void;
  cardNumber: string;
  setCardNumber: (val: string) => void;
  cardExp: string;
  setCardExp: (val: string) => void;
  corporateAccount: string;
  setCorporateAccount: (val: string) => void;
  corporateAccountList: CorporateAccountConfig[];
  selectedCorporateAccount: CorporateAccountConfig | null;
  matchedCorporateAccount: CorporateAccountConfig | null;
  billingPo: string;
  setBillingPo: (val: string) => void;
  poValidation: PoValidationResult | null;
  allowPoOverride: boolean;
  setAllowPoOverride: (val: boolean) => void;
  authorizedBy: string;
  setAuthorizedBy: (val: string) => void;
  invoicingTerms?: string;
  setInvoicingTerms?: (val: string) => void;
  callerPhone?: string;
  passengerPhone?: string;
  passengerEmail?: string;
  bookerPhone?: string;
  bookerEmail?: string;
  enteredBookingPin?: string;
  setEnteredBookingPin?: (val: string) => void;
  onSelectAuthorizedRider?: (rider: CorporateAuthorizedRider) => void;
  selectedRuleId: string;
  setSelectedRuleId: (val: string) => void;
  setTariff: (val: string) => void;
  availableNamedRules: NamedPricingRule[];
  discount: string;
  setDiscount: (val: string) => void;
  manualDiscountDollars: string;
  setManualDiscountDollars: (val: string) => void;
  waiveAirportFee: boolean;
  setWaiveAirportFee: React.Dispatch<React.SetStateAction<boolean>>;
  waiveMultiStopFees: boolean;
  setWaiveMultiStopFees: React.Dispatch<React.SetStateAction<boolean>>;
  bypassSurge: boolean;
  setBypassSurge: React.Dispatch<React.SetStateAction<boolean>>;
  waivedSurchargeIds: string[];
  setWaivedSurchargeIds: (val: string[]) => void;
  waivedExtraKeys: string[];
  setWaivedExtraKeys: (val: string[]) => void;
  surchargesConfig?: SurchargesConfig | null;
  universalExtrasConfig?: UniversalExtrasConfig | null;
  outboundPricing?: TripPricing | null;
  company: string;
  setCompany: (val: string) => void;
  driverId: string;
  setDriverId: (val: string) => void;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  onChangeDriverAssignmentMode?: (mode: 'send_to_driver' | 'stage_hold') => void;
  isDriverAssigned?: boolean;
  fallbackAssignedLabel?: string | null;
  driverOptions: DriverRosterItem[];
  notesForAll: string;
  setNotesForAll: (val: string) => void;
  internalNotes: string;
  setInternalNotes: (val: string) => void;
}

export function DispatchPaymentAssignmentSection({
  paymentMethod,
  setPaymentMethod,
  cardPaymentType,
  setCardPaymentType,
  cardholderName,
  setCardholderName,
  cardNumber,
  setCardNumber,
  cardExp,
  setCardExp,
  corporateAccount,
  setCorporateAccount,
  corporateAccountList,
  selectedCorporateAccount,
  matchedCorporateAccount,
  billingPo,
  setBillingPo,
  poValidation,
  allowPoOverride,
  setAllowPoOverride,
  authorizedBy,
  setAuthorizedBy,
  callerPhone,
  passengerPhone,
  passengerEmail,
  bookerPhone,
  bookerEmail,
  enteredBookingPin,
  setEnteredBookingPin,
  onSelectAuthorizedRider,
  selectedRuleId,
  setSelectedRuleId,
  setTariff,
  availableNamedRules,
  discount,
  setDiscount,
  manualDiscountDollars,
  setManualDiscountDollars,
  waiveAirportFee,
  setWaiveAirportFee,
  waiveMultiStopFees,
  setWaiveMultiStopFees,
  bypassSurge,
  setBypassSurge,
  waivedSurchargeIds,
  setWaivedSurchargeIds,
  waivedExtraKeys,
  setWaivedExtraKeys,
  surchargesConfig,
  universalExtrasConfig,
  outboundPricing,
  company,
  setCompany,
  driverId,
  setDriverId,
  driverAssignmentMode = 'send_to_driver',
  onChangeDriverAssignmentMode,
  isDriverAssigned = false,
  fallbackAssignedLabel = null,
  driverOptions,
  notesForAll,
  setNotesForAll,
  internalNotes,
  setInternalNotes,
}: DispatchPaymentAssignmentSectionProps) {
  return (
    <>
      {/* Payment (Segmented) & Detailed Sub-Panels */}
      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
          Payment
        </label>
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 border border-slate-300 rounded-lg mb-2">
          {(['cash', 'card', 'account'] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setPaymentMethod(m)}
              className={`py-1.5 text-center rounded font-semibold capitalize transition-all ${
                paymentMethod === m
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {m === 'card' ? 'Credit Card' : m}
            </button>
          ))}
        </div>

        {/* PCI-Safe Credit Card Sub-Panel (Never collects raw 16-digit PAN or CVC) */}
        {paymentMethod === 'card' && (
          <div className="p-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-200/70 rounded">
              <button
                type="button"
                onClick={() => setCardPaymentType('terminal')}
                className={`py-1 px-1.5 flex items-center justify-center gap-1 rounded text-[10.5px] font-bold transition-all ${
                  cardPaymentType === 'terminal' || cardPaymentType === 'payment_link'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <CreditCardIcon className="w-3 h-3 shrink-0" />
                <span>Pay in Car (Card)</span>
              </button>
              <button
                type="button"
                onClick={() => setCardPaymentType('card_on_file')}
                className={`py-1 px-1.5 flex items-center justify-center gap-1 rounded text-[10.5px] font-bold transition-all ${
                  cardPaymentType === 'card_on_file' || cardPaymentType === 'manual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <LockIcon className="w-3 h-3 shrink-0" />
                <span>Card On File Reference</span>
              </button>
            </div>

            {(cardPaymentType === 'terminal' || cardPaymentType === 'payment_link') && (
              <div className="p-2 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
                Passenger will pay in the car using the driver&apos;s card reader at dropoff.
              </div>
            )}

            {(cardPaymentType === 'card_on_file' || cardPaymentType === 'manual') && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 flex items-center gap-1">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    PCI-Safe Reference Only — enter cardholder name &amp; last 4 digits (never full
                    PAN/CVC).
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Cardholder Name"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    placeholder="Last 4 Digits (e.g. 4242)"
                    maxLength={4}
                    value={cardNumber.replace(/\D/g, '').slice(-4)}
                    onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Exp MM/YY"
                    maxLength={5}
                    value={cardExp}
                    onChange={(e) => setCardExp(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Corporate Account 4-Signal Caller Verification Card (No Dispatcher Billing Cycle Selector) */}
        {paymentMethod === 'account' && (
          <DispatchCorporateAccountCard
            corporateAccount={corporateAccount}
            setCorporateAccount={setCorporateAccount}
            corporateAccountList={corporateAccountList}
            selectedCorporateAccount={selectedCorporateAccount}
            billingPo={billingPo}
            setBillingPo={setBillingPo}
            poValidation={poValidation}
            allowPoOverride={allowPoOverride}
            setAllowPoOverride={setAllowPoOverride}
            authorizedBy={authorizedBy}
            setAuthorizedBy={setAuthorizedBy}
            callerPhone={callerPhone}
            passengerPhone={passengerPhone}
            passengerEmail={passengerEmail}
            bookerPhone={bookerPhone}
            bookerEmail={bookerEmail}
            enteredBookingPin={enteredBookingPin}
            setEnteredBookingPin={setEnteredBookingPin}
            onSelectAuthorizedRider={onSelectAuthorizedRider}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="block text-[10px] text-slate-500 font-semibold">
                Pricing Rule / Tariff
              </span>
              {selectedRuleId && (
                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded">
                  Rule Active
                </span>
              )}
            </div>
            <Select
              size="sm"
              value={selectedRuleId}
              onChange={(e) => {
                setSelectedRuleId(e.target.value);
                const matched = availableNamedRules.find((r) => r.id === e.target.value);
                setTariff(matched ? matched.name : 'Standard');
              }}
            >
              <option value="">Auto (Dynamic Rules Matrix)</option>
              {availableNamedRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (
                  {r.modifier.type === 'flat_override'
                    ? `$${r.modifier.value.toFixed(2)} Flat`
                    : r.modifier.type === 'multiplier'
                    ? `${r.modifier.value}x`
                    : r.modifier.type === 'surcharge_flat'
                    ? `+$${r.modifier.value.toFixed(2)}`
                    : `+${r.modifier.value}%`}
                  )
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">
              Discount (% / $)
            </span>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <Select
                  size="sm"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                >
                  <option value="None">
                    {matchedCorporateAccount?.discountPercent
                      ? `Corp (${matchedCorporateAccount.discountPercent}%)`
                      : 'None'}
                  </option>
                  <option value="5%">5% Off</option>
                  <option value="10%">10% Off</option>
                  <option value="15%">15% Off</option>
                  <option value="20%">20% Off</option>
                </Select>
              </div>
              <div className="relative w-16 shrink-0">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                  -$
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={manualDiscountDollars}
                  onChange={(e) => setManualDiscountDollars(e.target.value)}
                  title="Flat dollar courtesy credit"
                  className="w-full pl-5 pr-1 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Dispatcher Fee Waivers Dropdown */}
        <DispatchWaiveFeesDropdown
          surchargesConfig={surchargesConfig}
          universalExtrasConfig={universalExtrasConfig}
          outboundPricing={outboundPricing}
          waivedSurchargeIds={waivedSurchargeIds}
          onWaivedSurchargeIdsChange={setWaivedSurchargeIds}
          waivedExtraKeys={waivedExtraKeys}
          onWaivedExtraKeysChange={setWaivedExtraKeys}
          waiveAirportFee={waiveAirportFee}
          setWaiveAirportFee={setWaiveAirportFee}
          waiveMultiStopFees={waiveMultiStopFees}
          setWaiveMultiStopFees={setWaiveMultiStopFees}
          bypassSurge={bypassSurge}
          setBypassSurge={setBypassSurge}
        />
      </div>

      {/* Assignment (Company & Driver) */}
      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
          Assignment
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Company</span>
            <Select
              size="sm"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              {DEFAULT_COMPANIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Driver</span>
            <DriverAssignDropdown
              value={driverId}
              drivers={driverOptions}
              onChange={(nextId) => setDriverId(nextId)}
              mode={driverAssignmentMode}
              isAssigned={isDriverAssigned}
              fallbackAssignedLabel={fallbackAssignedLabel}
              size="md"
              fullWidth
              ariaLabel="Assign driver"
            />
          </div>
        </div>

        {driverId !== 'unassigned' && onChangeDriverAssignmentMode && (
          <div className="mt-2 p-2 rounded-lg border border-slate-200 bg-slate-50/80 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Driver Delivery Mode
              </span>
              <div className="inline-flex rounded-lg bg-slate-200/85 p-0.5 border border-slate-300">
                <button
                  type="button"
                  onClick={() => onChangeDriverAssignmentMode('send_to_driver')}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-colors cursor-pointer ${
                    driverAssignmentMode === 'send_to_driver'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Send to Driver
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDriverAssignmentMode('stage_hold')}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-colors cursor-pointer ${
                    driverAssignmentMode === 'stage_hold'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📌 Stage (Hold)
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              {driverAssignmentMode === 'stage_hold'
                ? 'Held privately in Dispatch as a planned shift placeholder — zero driver visibility or alerts until sent.'
                : 'Assigns and sends live to the driver immediately on Book / Save.'}
            </p>
          </div>
        )}
      </div>

      {/* Notes (All & Internal) */}
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
            Notes for All
          </label>
          <textarea
            rows={2}
            placeholder="e.g., Gate code is #1234, side door pickup..."
            value={notesForAll}
            onChange={(e) => setNotesForAll(e.target.value)}
            className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
            Internal Notes (for dispatch only)
          </label>
          <textarea
            rows={2}
            placeholder="e.g., VIP client, medical escort..."
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>
      </div>
    </>
  );
}
