import React from 'react';
import type { TripPricing } from '../../../../core/types';
import type {
  BookingVehicleChoice as VehicleChoice,
  DispatchVehicleOption,
} from '../../../../core/hooks/booking';
import { PriceBreakdownPanel } from '../../booking/PriceBreakdownPanel';
import { ConfirmationModal } from '../../../ui/ConfirmationModal';
import {
  ChevronDownIcon,
  CopyIcon,
  MailIcon,
  PencilIcon,
  SpinnerIcon,
  XIcon,
} from '../../../ui/Icons';

export interface DispatchBookingFooterBarProps {
  isEditMode: boolean;
  isQuoting: boolean;
  isSubmitting: boolean;
  showPriceBreakdown: boolean;
  setShowPriceBreakdown: React.Dispatch<React.SetStateAction<boolean>>;
  outboundPricing: TripPricing | null;
  returnPricing: TripPricing | null;
  displayRoundTripFares: { outboundFare: number; returnLegFare: number; totalFare: number };
  returnTrip: boolean;
  repeat: boolean;
  repeatFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
  repeatDays: string[];
  selectedVehicles: Array<VehicleChoice>;
  returnVehicles: Array<VehicleChoice>;
  dispatchVehicleOptions: DispatchVehicleOption[];
  isFareOverridden: boolean;
  setIsFareOverridden: (val: boolean) => void;
  manualFare: string;
  setManualFare: (val: string) => void;
  email: string;
  sendEmailConfirmation: boolean;
  setSendEmailConfirmation: React.Dispatch<React.SetStateAction<boolean>>;
  isClearModalOpen: boolean;
  setIsClearModalOpen: (val: boolean) => void;
  onCopyBooking: () => void;
  onConfirmClear: () => void;
  onClear: () => void;
}

export function DispatchBookingFooterBar({
  isEditMode,
  isQuoting,
  isSubmitting,
  showPriceBreakdown,
  setShowPriceBreakdown,
  outboundPricing,
  returnPricing,
  displayRoundTripFares,
  returnTrip,
  repeat,
  repeatFrequency,
  repeatDays,
  selectedVehicles,
  returnVehicles,
  dispatchVehicleOptions,
  isFareOverridden,
  setIsFareOverridden,
  manualFare,
  setManualFare,
  email,
  sendEmailConfirmation,
  setSendEmailConfirmation,
  isClearModalOpen,
  setIsClearModalOpen,
  onCopyBooking,
  onConfirmClear,
  onClear,
}: DispatchBookingFooterBarProps) {
  const displayLeg1 = displayRoundTripFares.outboundFare;
  const displayLeg2 = displayRoundTripFares.returnLegFare;
  const displayTotal = displayRoundTripFares.totalFare;
  const primaryOpt = dispatchVehicleOptions.find((o) => o.key === selectedVehicles[0]);

  return (
    <>
      {/* Expandable Canonical Price Breakdown Drawer */}
      {showPriceBreakdown && (
        <div className="border-t border-slate-200 bg-white shrink-0 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] flex flex-col max-h-64">
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              Itemized Fare Breakdown
            </span>
            <button
              type="button"
              onClick={() => setShowPriceBreakdown(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              aria-label="Close fare breakdown"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-3 py-2.5 overflow-y-auto">
            <PriceBreakdownPanel
              outboundPricing={outboundPricing}
              returnPricing={returnPricing}
              outboundDisplayFare={displayLeg1}
              returnDisplayFare={returnTrip ? displayLeg2 : null}
              totalDisplayFare={displayTotal}
              isRoundTrip={returnTrip}
              vehicleLabel={primaryOpt?.label || String(selectedVehicles[0] || 'Standard')}
              returnVehicleLabel={
                dispatchVehicleOptions.find((o) => o.key === returnVehicles[0])?.label ||
                String(returnVehicles[0] || 'Standard')
              }
            />
          </div>
        </div>
      )}

      {/* Sticky Action Bar (Pinned Bottom) */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2.5 lg:py-2 flex items-center justify-between shrink-0 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] z-20 gap-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isFareOverridden ? (
              <div className="flex items-center gap-1">
                <span className="font-bold text-blue-600">$</span>
                <input
                  type="number"
                  step="1"
                  placeholder="0.00"
                  value={manualFare}
                  onChange={(e) => setManualFare(e.target.value)}
                  className="w-20 px-2 py-1 bg-white border border-blue-400 rounded-lg font-mono font-bold text-sm text-blue-700"
                  title={returnTrip ? 'Combined Round-Trip Override Total' : 'Manual Fare Override'}
                />
                <button
                  type="button"
                  onClick={() => setIsFareOverridden(false)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                >
                  Reset
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsFareOverridden(true);
                  setManualFare(displayTotal ? displayTotal.toFixed(2) : '');
                }}
                className="cursor-pointer group flex items-center gap-1 text-left"
                title="Tap to manually override fare"
              >
                <span className="text-lg font-mono font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-none">
                  ${displayTotal.toFixed(2)}
                </span>
                {isQuoting && <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                {repeat && (
                  <span className="text-[11px] font-bold text-indigo-600">
                    {repeatFrequency === 'daily'
                      ? '/ day'
                      : repeatFrequency === 'weekdays'
                      ? '/ wkday'
                      : repeatFrequency === 'weekly'
                      ? repeatDays.length > 1
                        ? `(${repeatDays.length}x/wk)`
                        : '/ wk'
                      : '/ trip'}
                  </span>
                )}
                <PencilIcon className="w-3 h-3 text-slate-400 group-hover:text-blue-500 shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPriceBreakdown((v) => !v)}
              className={`px-2 py-1 lg:px-1.5 lg:py-0.5 rounded-lg lg:rounded border text-[10px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                showPriceBreakdown
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Toggle itemized Admin Tariff fare breakdown"
            >
              <span>Details</span>
              <ChevronDownIcon
                className={`w-3 h-3 transition-transform ${
                  showPriceBreakdown ? 'rotate-0' : 'rotate-180'
                }`}
              />
            </button>
          </div>

          {returnTrip && (
            <div className="text-[10px] text-slate-500 font-medium truncate">
              Leg 1: ${displayLeg1.toFixed(2)} | Return: ${displayLeg2.toFixed(2)}
              {isFareOverridden && ' (Custom)'}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isEditMode && (
            <>
              {/* Mobile compact Email Confirm toggle pill */}
              <button
                type="button"
                onClick={() => setSendEmailConfirmation((v) => !v)}
                className={`sm:hidden w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  sendEmailConfirmation
                    ? 'bg-blue-50 border-blue-300 text-blue-600'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
                title={
                  sendEmailConfirmation
                    ? 'Email confirmation ON (tap to disable)'
                    : 'Email confirmation OFF (tap to enable)'
                }
                aria-label="Toggle email confirmation"
              >
                <MailIcon className="w-4 h-4" />
              </button>

              {/* Desktop Email Confirm checkbox */}
              <label
                className="hidden sm:flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 cursor-pointer select-none px-1.5 py-1 rounded-lg hover:bg-slate-100"
                title={
                  email.trim()
                    ? `Send confirmation email to ${email.trim()}`
                    : 'Enter passenger email above to send confirmation'
                }
              >
                <input
                  type="checkbox"
                  checked={sendEmailConfirmation}
                  onChange={(e) => setSendEmailConfirmation(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span>Email Confirm</span>
              </label>
            </>
          )}

          {isEditMode ? (
            <button
              type="button"
              onClick={onCopyBooking}
              className="px-2.5 sm:px-3 py-2 lg:py-1.5 rounded-xl lg:rounded-lg border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Create a new draft tab pre-populated with these trip details"
            >
              <CopyIcon className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Copy Booking</span>
              <span className="sm:hidden">Copy</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirmClear}
              className="px-2.5 sm:px-3 py-2 lg:py-1.5 rounded-xl lg:rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer"
              title="Clear all booking inputs"
            >
              Clear
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            title="Save booking (Ctrl+Enter)"
            className={`rounded-xl font-black text-white shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-[0.98] ${
              isEditMode
                ? 'px-3.5 sm:px-4 py-2 lg:py-1.5 bg-blue-600 hover:bg-blue-700 text-xs'
                : 'px-4 sm:px-6 py-2.5 lg:py-2 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30 text-sm'
            }`}
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{isEditMode ? 'Update' : 'Book'}</span>
            )}
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isClearModalOpen}
        title="Clear Booking Form"
        message="Are you sure you want to clear this booking form? All unsaved inputs will be reset to default values."
        confirmText="Clear Form"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={() => {
          onClear();
          setIsClearModalOpen(false);
        }}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </>
  );
}
