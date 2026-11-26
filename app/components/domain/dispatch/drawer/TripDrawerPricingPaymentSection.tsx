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
      <div className="p-3.5 bg-surface-subtle rounded-xl border border-border-subtle space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-bold text-fg-strong uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <ShieldCheckIcon className="w-3.5 h-3.5 text-fg-secondary shrink-0" />
            <span>Manual Status Override</span>
          </div>
          <span className="text-[11px] text-fg-muted font-medium">
            Current:{' '}
            <strong className="text-fg-primary capitalize">
              {reviewTrip.status.toLowerCase() === 'pending'
                ? 'Confirmed'
                : reviewTrip.status.replace(/_/g, ' ')}
            </strong>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { status: 'confirmed', label: 'Confirmed' },
              { status: 'assigned', label: 'Assigned' },
              { status: 'en_route', label: 'En Route' },
              { status: 'arrived', label: 'Arrived' },
              { status: 'in_progress', label: 'In Progress' },
            ] as { status: TripStatus; label: string }[]
          ).map((step) => {
            const normCur = reviewTrip.status.toLowerCase();
            const isCurrent =
              normCur === step.status || (step.status === 'confirmed' && normCur === 'pending');
            return (
              <button
                key={step.status}
                type="button"
                disabled={isCurrent || isOverridingStatus}
                onClick={() => onManualStatusOverride(reviewTrip, step.status)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  isCurrent
                    ? 'bg-blue-600 text-white border-blue-600 cursor-default shadow-2xs'
                    : 'bg-surface-card text-fg-secondary border-border-strong hover:bg-status-info-bg hover:border-status-info-border hover:text-status-info-fg cursor-pointer disabled:opacity-50'
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
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-status-danger-bg hover:bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border transition-colors cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
            >
              <BanIcon className="w-3 h-3 shrink-0" />
              <span>Cancel Trip</span>
            </button>
          )}
        </div>
      </div>

      {/* Round-Trip Scope Option when Confirming */}
      {hasLinkedLeg && (
        <div className="p-3 bg-status-staged-bg/60 rounded-xl border border-status-staged-border space-y-2">
          <div className="font-bold text-status-staged-fg text-xs flex items-center justify-between">
            <span>Round-Trip Confirmation Scope:</span>
            <span className="text-[10px] text-status-staged-fg">Choose which legs to confirm</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                confirmScope === 'both'
                  ? 'bg-surface-card border-indigo-500 font-bold text-status-staged-fg shadow-2xs'
                  : 'bg-surface-card/50 border-indigo-100 text-status-staged-fg hover:bg-surface-card'
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
                  ? 'bg-surface-card border-indigo-500 font-bold text-status-staged-fg shadow-2xs'
                  : 'bg-surface-card/50 border-indigo-100 text-status-staged-fg hover:bg-surface-card'
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
            <div className="p-3.5 bg-status-success-bg/50 rounded-xl border border-status-success-border/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-bold text-status-success-fg uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <CreditCardIcon className="w-3.5 h-3.5 text-status-success-fg shrink-0" />
                  <span>1-Tap Passenger Pay Link (Apple Pay / Google Pay / Card)</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    isTripPaid
                      ? 'bg-emerald-600 text-white'
                      : payLinkState === 'open'
                      ? 'bg-status-info-bg-strong text-status-info-fg border border-status-info-border'
                      : payLinkState === 'refunded'
                      ? 'bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border'
                      : 'bg-surface-emphasis/80 text-fg-secondary'
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
                <div className="px-2.5 py-1.5 bg-surface-card border border-status-success-border rounded-lg font-mono text-[11px] text-fg-secondary truncate select-all">
                  {displayPayUrl}
                </div>
              )}

              {!isTripPaid ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={payLinkBusyAction !== null}
                    onClick={() => onTripPayLinkAction('copy')}
                    className="px-3 py-1.5 rounded-lg bg-surface-card hover:bg-status-success-bg border border-status-success-border text-status-success-fg font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {payLinkBusyAction === 'copy' ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-status-success-fg" />
                    ) : (
                      <CopyIcon className="w-3.5 h-3.5 text-status-success-fg shrink-0" />
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
                <div className="flex items-center justify-between text-xs text-status-success-fg">
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
                      className="px-2.5 py-1 rounded-lg bg-surface-card border border-status-success-border text-status-success-fg font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
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
      <div className="p-3.5 bg-status-info-bg/60 rounded-xl border border-status-info-border/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="font-bold text-status-info-fg uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <MailIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Email Delivery &amp; Confirmation</span>
          </div>
          <span className="text-[11px] text-fg-secondary font-medium truncate max-w-[280px]">
            Booking Email:{' '}
            <strong className="text-fg-primary font-mono">{reviewTrip.passenger.email}</strong>
          </span>
        </div>

        <div className="pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-fg-secondary">
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
              className="rounded border-border-strong text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Send confirmation to alternate / additional email address</span>
          </label>
        </div>

        {isOverrideEmailEnabled && (
          <div className="p-3 bg-surface-card border border-status-info-border rounded-lg space-y-2.5 animate-in fade-in duration-100">
            <div>
              <label className="block text-[11px] font-bold text-fg-secondary mb-1">
                Alternate Recipient Email Address:
              </label>
              <input
                type="email"
                value={overrideRecipientEmail}
                onChange={(e) => onOverrideRecipientEmailChange(e.target.value)}
                placeholder="e.g. assistant@company.com or travel@firm.com"
                className="w-full px-3 py-1.5 bg-surface-subtle border border-border-strong rounded-lg text-fg-primary text-xs focus:ring-1 focus:ring-blue-500 focus:bg-surface-card focus:outline-hidden font-mono"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-fg-secondary">
              <input
                type="checkbox"
                checked={shouldUpdatePassengerEmail}
                onChange={(e) => onShouldUpdatePassengerEmailChange(e.target.checked)}
                className="rounded border-border-strong text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Permanently update passenger's profile email in booking record</span>
            </label>
          </div>
        )}
      </div>
    </>
  );
}
