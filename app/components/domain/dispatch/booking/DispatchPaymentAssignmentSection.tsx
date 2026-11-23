import React from 'react';
import type {
  CorporateAccountConfig,
  NamedPricingRule,
} from '../../../../core/types/config';
import type { PoValidationResult } from '../../../../core/services/corporate-account.service';
import {
  formatDriverAssignmentLabel,
  type DriverRosterItem,
} from '../../../../core/services/operator.service';
import {
  DEFAULT_CORPORATE_ACCOUNTS,
  DEFAULT_DISPATCH_COMPANIES as DEFAULT_COMPANIES,
  getDriverStatusEmoji,
} from '../../../../core/hooks/booking';
import {
  AlertTriangleIcon,
  CheckIcon,
  CreditCardIcon,
  LockIcon,
  ShieldCheckIcon,
} from '../../../ui/Icons';

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
  invoicingTerms: string;
  setInvoicingTerms: (val: string) => void;
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
  company: string;
  setCompany: (val: string) => void;
  driverId: string;
  setDriverId: (val: string) => void;
  driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
  onChangeDriverAssignmentMode?: (mode: 'send_to_driver' | 'stage_hold') => void;
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
  invoicingTerms,
  setInvoicingTerms,
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
  company,
  setCompany,
  driverId,
  setDriverId,
  driverAssignmentMode = 'send_to_driver',
  onChangeDriverAssignmentMode,
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

        {/* Corporate Account Sub-Panel */}
        {paymentMethod === 'account' &&
          (() => {
            const selectedCorp = selectedCorporateAccount;

            return (
              <div className="p-2.5 mb-2 bg-amber-50/80 border border-amber-300 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                    Corporate Account Billing
                  </span>
                  {selectedCorp && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        selectedCorp.poRequired
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {selectedCorp.poRequired ? 'PO Required on Booking' : 'PO Optional'}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-slate-600 font-semibold">
                      Corporate Client
                    </span>
                    {selectedCorp && (
                      <span className="text-[10px] font-mono text-slate-500 font-semibold">
                        Acct #{selectedCorp.accountNumber} • Limit: $
                        {selectedCorp.creditLimit.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <select
                    value={corporateAccount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCorporateAccount(val);
                    }}
                    className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded text-xs text-slate-800 font-medium"
                  >
                    {corporateAccountList.length > 0
                      ? corporateAccountList.map((acc) => (
                          <option key={acc.id} value={acc.companyName}>
                            {acc.companyName} ({acc.accountNumber})
                            {acc.poRequired ? ' [PO REQ]' : ''}
                          </option>
                        ))
                      : DEFAULT_CORPORATE_ACCOUNTS.map((acc) => (
                          <option key={acc} value={acc}>
                            {acc}
                          </option>
                        ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-slate-600 font-semibold">
                        Billing PO / Code
                      </span>
                      {selectedCorp?.currentPoNumber && (
                        <span className="text-[9px] font-mono text-slate-500">
                          Active: {selectedCorp.currentPoNumber}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder={selectedCorp?.currentPoNumber || 'PO-XXXX'}
                      value={billingPo}
                      onChange={(e) => setBillingPo(e.target.value)}
                      className={`w-full px-2 py-1 bg-white border rounded text-xs font-mono font-bold ${
                        poValidation?.status === 'expired_revoked'
                          ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20'
                          : poValidation?.status === 'valid'
                          ? 'border-emerald-500 text-emerald-800'
                          : 'border-amber-300'
                      }`}
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                      Authorized By / Contact
                    </span>
                    <input
                      type="text"
                      placeholder="Dept Manager or Email"
                      value={authorizedBy}
                      onChange={(e) => setAuthorizedBy(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs"
                    />
                  </div>
                </div>

                {/* Live Anti-Fraud PO Validation Feedback */}
                {selectedCorp && billingPo.trim().length > 0 && (
                  <div className="text-[10px]">
                    {poValidation?.status === 'valid' && (
                      <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                        <CheckIcon className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                        <span className="font-semibold">Active Authorized PO verified.</span>
                      </div>
                    )}
                    {poValidation?.status === 'expired_revoked' && (
                      <div className="flex items-start gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-300 font-medium">
                        <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div>
                          <strong className="block font-bold">
                            FRAUD ALERT: REVOKED PO DETECTED
                          </strong>
                          <span>
                            PO &ldquo;{billingPo}&rdquo; was revoked/rotated on{' '}
                            {poValidation.revokedRecord?.rotatedAt
                              ? poValidation.revokedRecord.rotatedAt.slice(0, 10)
                              : 'previously'}
                            . This booking cannot proceed under this revoked authorization.
                          </span>
                        </div>
                      </div>
                    )}
                    {poValidation?.status === 'mismatch' && (
                      <div className="space-y-1.5 text-rose-800 bg-rose-50 px-2.5 py-2 rounded-lg border border-rose-300">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                          <span>
                            PO Mismatch — Active PO on file:{' '}
                            {selectedCorp.currentPoNumber || 'None'}.
                          </span>
                        </div>
                        {selectedCorp.poRequired && (
                          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700 cursor-pointer pt-0.5">
                            <input
                              type="checkbox"
                              checked={allowPoOverride}
                              onChange={(e) => setAllowPoOverride(e.target.checked)}
                              className="rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                            />
                            <span>
                              Supervisor Override: authorize mismatched PO (logged in audit trail)
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold mb-0.5">
                    Invoicing Terms
                  </span>
                  <select
                    value={invoicingTerms}
                    onChange={(e) => setInvoicingTerms(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs text-slate-800"
                  >
                    <option value="Net 30 Direct Bill">Net 30 Direct Bill</option>
                    <option value="Semi-Monthly Invoice">Semi-Monthly Invoice</option>
                    <option value="Monthly Statement">Monthly Statement</option>
                  </select>
                </div>
              </div>
            );
          })()}

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
            <select
              value={selectedRuleId}
              onChange={(e) => {
                setSelectedRuleId(e.target.value);
                const matched = availableNamedRules.find((r) => r.id === e.target.value);
                setTariff(matched ? matched.name : 'Standard');
              }}
              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 font-medium"
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
            </select>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">
              Discount (% / $)
            </span>
            <div className="flex items-center gap-1">
              <select
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="flex-1 px-1.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
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
              </select>
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

        {/* Dispatcher Fee Waivers */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {(
            [
              {
                label: 'Waive Airport Fee',
                active: waiveAirportFee,
                toggle: () => setWaiveAirportFee((v) => !v),
              },
              {
                label: 'Waive Stop Fees',
                active: waiveMultiStopFees,
                toggle: () => setWaiveMultiStopFees((v) => !v),
              },
              {
                label: 'Bypass Surge',
                active: bypassSurge,
                toggle: () => setBypassSurge((v) => !v),
              },
            ] as const
          ).map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.toggle}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                chip.active
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {chip.active ? '✓ ' : '+ '}
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Assignment (Company & Driver) */}
      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
          Assignment
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Company</span>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
            >
              {DEFAULT_COMPANIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Driver</span>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className={`w-full px-2 py-1.5 bg-white border rounded text-xs focus:ring-1 focus:ring-blue-500 ${
                driverId !== 'unassigned' && driverAssignmentMode === 'stage_hold'
                  ? 'border-dashed border-indigo-400 bg-indigo-50/40 text-indigo-950 font-semibold'
                  : 'border-slate-300 text-slate-800'
              }`}
            >
              <option value="unassigned">Unassigned</option>
              {driverOptions.map((d) => (
                <option
                  key={d.id}
                  value={d.id}
                  disabled={d.isBlacklisted || d.zone === 'Suspended'}
                >
                  {getDriverStatusEmoji(d)} {d.formattedLabel || formatDriverAssignmentLabel(d)}
                </option>
              ))}
            </select>
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
