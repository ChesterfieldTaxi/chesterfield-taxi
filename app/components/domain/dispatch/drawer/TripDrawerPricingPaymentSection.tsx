import React from 'react';
import type { Trip, TripStatus } from '../../../../core/types/trip';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import {
  BanIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  MailIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../../ui/Icons';

export interface TripDrawerPricingPaymentSectionProps {
  reviewTrip: Trip;
  hasLinkedLeg: boolean;
  reviewDeclineMode: boolean;
  reviewClarifyMode: boolean;
  isOverridingStatus: boolean;
  confirmScope: 'both' | 'leg';
  onConfirmScopeChange: (scope: 'both' | 'leg') => void;
  payLinkBusyAction: 'copy' | 'sms' | 'email' | null;
  generatedPayUrl: string;
  onTripPayLinkAction: (mode: 'copy' | 'sms' | 'email') => void | Promise<void>;
  isOverrideEmailEnabled: boolean;
  onOverrideEmailEnabledChange: (enabled: boolean) => void;
  overrideRecipientEmail: string;
  onOverrideRecipientEmailChange: (email: string) => void;
  shouldUpdatePassengerEmail: boolean;
  onShouldUpdatePassengerEmailChange: (update: boolean) => void;
  onManualStatusOverride: (trip: Trip, nextStatus: TripStatus) => void | Promise<void>;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onPromptCancelTrip: (trip: Trip) => void;
}

export function TripDrawerPricingPaymentSection({
  reviewTrip,
  hasLinkedLeg,
  reviewDeclineMode,
  reviewClarifyMode,
  isOverridingStatus,
  confirmScope,
  onConfirmScopeChange,
  payLinkBusyAction,
  generatedPayUrl,
  onTripPayLinkAction,
  isOverrideEmailEnabled,
  onOverrideEmailEnabledChange,
  overrideRecipientEmail,
  onOverrideRecipientEmailChange,
  shouldUpdatePassengerEmail,
  onShouldUpdatePassengerEmailChange,
  onManualStatusOverride,
  onOpenCompleteTripModal,
  onPromptCancelTrip,
}: TripDrawerPricingPaymentSectionProps) {
  if (reviewDeclineMode || reviewClarifyMode) {
    return null;
  }

  const normStatus = reviewTrip.status.toLowerCase();
  const showPayLinkSection = normStatus !== 'cancelled' && normStatus !== 'declined';

  return (
    <>
      {/* Manual Trip Status Override (Dispatch Recovery Controls) */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <ShieldCheckIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>Manual Status Override</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Current:{' '}
            <strong className="text-slate-900 capitalize">
              {reviewTrip.status.replace(/_/g, ' ')}
            </strong>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { status: 'pending', label: 'Pending' },
              { status: 'confirmed', label: 'Confirmed' },
              { status: 'assigned', label: 'Assigned' },
              { status: 'en_route', label: 'En Route' },
              { status: 'arrived', label: 'Arrived' },
              { status: 'in_progress', label: 'In Progress' },
            ] as { status: TripStatus; label: string }[]
          ).map((step) => {
            const isCurrent = reviewTrip.status.toLowerCase() === step.status;
            return (
              <button
                key={step.status}
                type="button"
                disabled={isCurrent || isOverridingStatus}
                onClick={() => onManualStatusOverride(reviewTrip, step.status)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  isCurrent
                    ? 'bg-blue-600 text-white border-blue-600 cursor-default shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 cursor-pointer disabled:opacity-50'
                }`}
              >
                {step.label}
              </button>
            );
          })}
          {reviewTrip.status !== 'completed' && reviewTrip.status !== 'cancelled' && (
            <button
              type="button"
              disabled={isOverridingStatus}
              onClick={() => onOpenCompleteTripModal(reviewTrip)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs disabled:opacity-50"
            >
              <CheckIcon className="w-3 h-3 shrink-0" />
              <span>Complete Trip</span>
            </button>
          )}
          {reviewTrip.status !== 'cancelled' && reviewTrip.status !== 'completed' && (
            <button
              type="button"
              disabled={isOverridingStatus}
              onClick={() => onPromptCancelTrip(reviewTrip)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 transition-colors cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
            >
              <BanIcon className="w-3 h-3 shrink-0" />
              <span>Cancel Trip</span>
            </button>
          )}
        </div>
      </div>

      {/* Round-Trip Scope Option when Confirming */}
      {hasLinkedLeg && (
        <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-2">
          <div className="font-bold text-indigo-950 text-xs flex items-center justify-between">
            <span>Round-Trip Confirmation Scope:</span>
            <span className="text-[10px] text-indigo-700">Choose which legs to confirm</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                confirmScope === 'both'
                  ? 'bg-white border-indigo-500 font-bold text-indigo-950 shadow-2xs'
                  : 'bg-white/50 border-indigo-100 text-indigo-800 hover:bg-white'
              }`}
            >
              <input
                type="radio"
                name="confirmScope"
                value="both"
                checked={confirmScope === 'both'}
                onChange={() => onConfirmScopeChange('both')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Confirm Both Legs (Round Trip)</span>
            </label>
            <label
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                confirmScope === 'leg'
                  ? 'bg-white border-indigo-500 font-bold text-indigo-950 shadow-2xs'
                  : 'bg-white/50 border-indigo-100 text-indigo-800 hover:bg-white'
              }`}
            >
              <input
                type="radio"
                name="confirmScope"
                value="leg"
                checked={confirmScope === 'leg'}
                onChange={() => onConfirmScopeChange('leg')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Confirm This Leg Only (#{reviewTrip.id})</span>
            </label>
          </div>
        </div>
      )}

      {/* 1-Tap Pay Link (Copy / SMS / Email) */}
      {showPayLinkSection &&
        (() => {
          const payLinkState = getPayLinkService().getTripPayLinkDisplayState(reviewTrip);
          const isTripPaid = payLinkState === 'paid';
          const isCorpBill =
            reviewTrip.payment?.method === 'corporate' ||
            reviewTrip.payment?.method === 'account';
          const cachedToken = getPayLinkService().getTripCachedPayToken(reviewTrip);
          const displayPayUrl =
            generatedPayUrl ||
            (cachedToken ? getPayLinkService().buildPayUrl(cachedToken) : '');

          return (
            <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-bold text-emerald-950 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <CreditCardIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>1-Tap Passenger Pay Link (Apple Pay / Google Pay / Card)</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    isTripPaid
                      ? 'bg-emerald-600 text-white'
                      : payLinkState === 'open'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : payLinkState === 'refunded'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-slate-200/80 text-slate-700'
                  }`}
                >
                  {isTripPaid
                    ? 'Paid'
                    : payLinkState === 'open'
                    ? 'Link Open'
                    : payLinkState === 'refunded'
                    ? 'Refunded'
                    : isCorpBill
                    ? 'Corporate Direct Bill'
                    : 'Unpaid'}
                </span>
              </div>

              {displayPayUrl && (
                <div className="px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg font-mono text-[11px] text-slate-700 truncate select-all">
                  {displayPayUrl}
                </div>
              )}

              {!isTripPaid ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={payLinkBusyAction !== null}
                    onClick={() => onTripPayLinkAction('copy')}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {payLinkBusyAction === 'copy' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                    ) : (
                      <CopyIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    )}
                    <span>Copy Pay Link</span>
                  </button>

                  <button
                    type="button"
                    disabled={payLinkBusyAction !== null || !reviewTrip.passenger?.phone}
                    onClick={() => onTripPayLinkAction('sms')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {payLinkBusyAction === 'sms' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>Send Pay Link (SMS)</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      payLinkBusyAction !== null ||
                      (!reviewTrip.passenger?.email && !overrideRecipientEmail.trim())
                    }
                    onClick={() => onTripPayLinkAction('email')}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {payLinkBusyAction === 'email' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <MailIcon className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>Email Pay Link</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-emerald-800">
                  <span className="font-semibold">
                    Settled ($
                    {(reviewTrip.payment?.amount ?? reviewTrip.pricing?.totalFare ?? 0).toFixed(2)})
                    {reviewTrip.payment?.receiptNumber
                      ? ` · Receipt ${reviewTrip.payment.receiptNumber}`
                      : ''}
                  </span>
                  {displayPayUrl && (
                    <button
                      type="button"
                      onClick={() => onTripPayLinkAction('copy')}
                      className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                    >
                      <CopyIcon className="w-3 h-3" />
                      <span>Copy Receipt Link</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {/* Email Delivery & Recipient Override Options */}
      <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="font-bold text-blue-900 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <MailIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Email Delivery &amp; Confirmation</span>
          </div>
          <span className="text-[11px] text-slate-600 font-medium truncate max-w-[280px]">
            Booking Email:{' '}
            <strong className="text-slate-900 font-mono">{reviewTrip.passenger.email}</strong>
          </span>
        </div>

        <div className="pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={isOverrideEmailEnabled}
              onChange={(e) => {
                onOverrideEmailEnabledChange(e.target.checked);
                if (!e.target.checked) {
                  onOverrideRecipientEmailChange('');
                  onShouldUpdatePassengerEmailChange(false);
                }
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Send confirmation to alternate / additional email address</span>
          </label>
        </div>

        {isOverrideEmailEnabled && (
          <div className="p-3 bg-white border border-blue-300 rounded-lg space-y-2.5 animate-in fade-in duration-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Alternate Recipient Email Address:
              </label>
              <input
                type="email"
                value={overrideRecipientEmail}
                onChange={(e) => onOverrideRecipientEmailChange(e.target.value)}
                placeholder="e.g. assistant@company.com or travel@firm.com"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-blue-500 focus:bg-white focus:outline-hidden font-mono"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={shouldUpdatePassengerEmail}
                onChange={(e) => onShouldUpdatePassengerEmailChange(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Permanently update passenger's profile email in booking record</span>
            </label>
          </div>
        )}
      </div>
    </>
  );
}
