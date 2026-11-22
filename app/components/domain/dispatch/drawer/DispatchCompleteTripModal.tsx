import React, { useState, useEffect } from 'react';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { getBookingService } from '../../../../core/services/booking';
import { getEmailDispatchService } from '../../../../core/services/email/resend-email.service';
import { getTelephonyService } from '../../../../core/services/telephony.service';
import { formatVehicleTierDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import { useBottomSheetDragToClose } from '../../../../core/hooks/useBottomSheetDragToClose';
import {
  BuildingIcon,
  CashIcon,
  CheckIcon,
  CreditCardIcon,
  DollarSignIcon,
  SpinnerIcon,
  XIcon,
} from '../../../ui/Icons';

export interface DispatchCompleteTripModalProps {
  isDesktop: boolean;
  user: AdminUser | null;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  completeTripTarget: Trip | null;
  completeModalOpenSeq: number;
  onTripsChange: React.Dispatch<React.SetStateAction<Trip[]>>;
  onReviewTripChange: React.Dispatch<React.SetStateAction<Trip | null>>;
  onCloseCompleteTripModal: () => void;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function DispatchCompleteTripModal({
  isDesktop,
  user,
  settings,
  drivers,
  completeTripTarget,
  completeModalOpenSeq,
  onTripsChange,
  onReviewTripChange,
  onCloseCompleteTripModal,
  onShowToast,
}: DispatchCompleteTripModalProps) {
  const [completeFareInput, setCompleteFareInput] = useState<string>('');
  const [completeTipInput, setCompleteTipInput] = useState<string>('0.00');
  const [completePaymentMethod, setCompletePaymentMethod] = useState<
    'cash' | 'card_terminal' | 'card_on_file' | 'corporate_account'
  >('cash');
  const [completeSendReceipt, setCompleteSendReceipt] = useState<boolean>(true);
  const [completeNotes, setCompleteNotes] = useState<string>('');
  const [isCompletingTrip, setIsCompletingTrip] = useState<boolean>(false);

  // Reset complete trip modal state whenever opened via handleOpenCompleteTripModal
  useEffect(() => {
    if (!completeTripTarget) return;
    setCompleteFareInput((completeTripTarget.pricing?.totalFare ?? 0).toFixed(2));
    setCompleteTipInput((completeTripTarget.payment?.tipAmount ?? 0).toFixed(2));
    const rawMethod = completeTripTarget.payment?.method;
    if (rawMethod === 'corporate' || rawMethod === 'account') {
      setCompletePaymentMethod('corporate_account');
    } else if (rawMethod === 'card') {
      setCompletePaymentMethod('card_terminal');
    } else {
      setCompletePaymentMethod('cash');
    }
    const autoReceipts = settings.billingSettings?.autoEmailReceipts !== false;
    setCompleteSendReceipt(Boolean(completeTripTarget.passenger?.email) && autoReceipts);
    setCompleteNotes('');
  }, [completeTripTarget?.id, completeModalOpenSeq]);

  const completeSheetDrag = useBottomSheetDragToClose({
    onClose: () => {
      if (!isCompletingTrip) onCloseCompleteTripModal();
    },
    disabled: isDesktop || isCompletingTrip,
  });

  const handleDispatchCompleteTrip = async () => {
    if (!completeTripTarget) return;
    const subtotalFare = Math.max(0, Number.parseFloat(completeFareInput) || 0);
    const tipAmount = Math.max(0, Number.parseFloat(completeTipInput) || 0);
    const grandTotal = Number((subtotalFare + tipAmount).toFixed(2));
    const trip = completeTripTarget;
    const nowIso = new Date().toISOString();
    const mappedPaymentMethod: 'cash' | 'card' | 'corporate' =
      completePaymentMethod === 'corporate_account'
        ? 'corporate'
        : completePaymentMethod === 'cash'
        ? 'cash'
        : 'card';
    const paymentStatus: 'paid' | 'pending' =
      completePaymentMethod === 'corporate_account' ? 'pending' : 'paid';

    setIsCompletingTrip(true);
    const bookingService = getBookingService();
    try {
      const updatedPricing = {
        ...(trip.pricing || {
          baseFare: subtotalFare,
          distanceFare: 0,
          timeFare: 0,
          surcharges: 0,
          distanceMiles: 0,
          durationMinutes: 0,
          currency: 'USD',
        }),
        totalFare: subtotalFare,
      };
      const updatedPayment = {
        ...(trip.payment || {}),
        method: mappedPaymentMethod,
        status: paymentStatus,
        amount: grandTotal,
        tipAmount,
        paidAt: nowIso,
      };
      const updatedMetadata = {
        ...(trip.metadata || {}),
        completedByDispatcher: user?.email || 'Dispatcher',
        dispatchCompletionPaymentType: completePaymentMethod,
        ...(completeNotes.trim() ? { dispatchCompletionNotes: completeNotes.trim() } : {}),
      };

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(trip.id, {
          pricing: updatedPricing,
          payment: updatedPayment,
          completedAt: nowIso,
          metadata: updatedMetadata,
        } as any);
      }

      if (bookingService.updateTripStatus) {
        const actorLabel = user?.email || 'Dispatcher';
        await bookingService.updateTripStatus(trip.id, 'completed', {
          actorRole: 'admin',
          reason: completeNotes.trim()
            ? `Completed via Dispatch Console (${actorLabel}): ${completeNotes.trim()}`
            : `Completed manually via Dispatch Console (${actorLabel})`,
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(trip.id, { status: 'completed' });
      }

      getTelephonyService()
        .closeMaskedSession(trip.id)
        .catch(() => {});

      let receiptDispatched = false;
      if (completeSendReceipt && trip.passenger?.email) {
        const meta = updatedMetadata as Record<string, any>;
        const assignedDriver = trip.assignedDriverId
          ? drivers.find((d) => d.id === trip.assignedDriverId)
          : undefined;
        await getEmailDispatchService()
          .sendTripReceipt({
            tripId: trip.id,
            completedAt: new Date(nowIso).toLocaleString(),
            passenger: {
              firstName: trip.passenger.firstName,
              lastName: trip.passenger.lastName,
              email: trip.passenger.email,
              phone: trip.passenger.phone,
            },
            pickupAddress: trip.pickupLocation?.address || '',
            intermediateStops: trip.intermediateStops?.map((s) => ({ address: s.address })),
            dropoffAddress: trip.dropoffLocation?.address || '',
            pickupTime:
              trip.actualPickupTime || trip.scheduledPickupTime
                ? new Date(trip.actualPickupTime || trip.scheduledPickupTime!).toLocaleString()
                : new Date(trip.createdAt).toLocaleString(),
            vehicleTier: trip.vehicleTier,
            vehicleDisplayName:
              (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName) ||
              formatVehicleTierDisplay(
                (meta.vehicleTypeId as string) || trip.vehicleTier,
                settings.vehicles,
                meta.vehicleDisplayName
              ),
            driverName:
              assignedDriver?.name ||
              (typeof meta.assignedDriverName === 'string' && meta.assignedDriverName) ||
              'Assigned Driver',
            vehicleUnit: assignedDriver?.cabNumber,
            distanceMiles: updatedPricing.distanceMiles,
            durationMinutes: updatedPricing.durationMinutes,
            subtotalFare,
            tipAmount,
            grandTotal,
            currency: updatedPricing.currency || 'USD',
            breakdown: updatedPricing.breakdown,
            paymentMethod: completePaymentMethod,
            cardLast4: trip.payment?.cardLast4,
            paymentStatus:
              completePaymentMethod === 'corporate_account' ? 'corporate_direct_bill' : 'paid',
            corporateAccountName: meta.corporateDetails?.corporateAccount || meta.corporateOrgName,
            poNumber: meta.corporateDetails?.billingPo || meta.billingPo,
            companySettings: {
              name: settings.company?.name,
              phone: settings.company?.phone,
              address: settings.company?.address,
              email: settings.company?.email,
            },
          })
          .then(() => {
            receiptDispatched = true;
          })
          .catch((emailErr) => {
            console.warn('[Dispatch] Receipt email failed:', emailErr);
          });
      }

      const nextTripPatch: Partial<Trip> = {
        status: 'completed',
        pricing: updatedPricing,
        payment: updatedPayment as any,
        completedAt: nowIso,
        metadata: updatedMetadata,
      };
      onTripsChange((prev) => prev.map((t) => (t.id === trip.id ? { ...t, ...nextTripPatch } : t)));
      onReviewTripChange((prev) =>
        prev && prev.id === trip.id ? { ...prev, ...nextTripPatch } : prev
      );
      onCloseCompleteTripModal();
      onShowToast(
        `Trip #${trip.id.slice(-6).toUpperCase()} completed ($${grandTotal.toFixed(2)})${
          receiptDispatched ? ' · Receipt emailed' : ''
        }.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to complete trip from dispatch console:', err);
      onShowToast('Failed to complete trip. Please try again.', 'error');
    } finally {
      setIsCompletingTrip(false);
    }
  };

  if (!completeTripTarget) {
    return null;
  }

  const parsedSubtotal = Math.max(0, Number.parseFloat(completeFareInput) || 0);
  const parsedTip = Math.max(0, Number.parseFloat(completeTipInput) || 0);
  const computedGrandTotal = Number((parsedSubtotal + parsedTip).toFixed(2));

  return (
    <div
      className="fixed inset-0 z-[125] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isCompletingTrip) onCloseCompleteTripModal();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={completeSheetDrag.sheetStyle}
        className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        <div
          {...completeSheetDrag.dragHandlers}
          className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 sm:pb-4 shrink-0 touch-none"
        >
          <div
            className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <h3 className="text-sm font-black tracking-tight">Complete Trip</h3>
                <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                  #{completeTripTarget.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {completeTripTarget.passenger?.firstName} {completeTripTarget.passenger?.lastName}
              </p>
            </div>
            <button
              type="button"
              disabled={isCompletingTrip}
              onClick={onCloseCompleteTripModal}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close complete trip modal"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
              <span className="text-slate-700 font-medium truncate">
                {completeTripTarget.pickupLocation?.address || 'Pickup'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
              <span className="text-slate-700 font-medium truncate">
                {completeTripTarget.dropoffLocation?.address || 'Dropoff'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Final Fare (USD)
              </label>
              <div className="relative">
                <DollarSignIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={completeFareInput}
                  onChange={(e) => setCompleteFareInput(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Tip / Gratuity (USD)
              </label>
              <div className="relative">
                <DollarSignIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={completeTipInput}
                  onChange={(e) => setCompleteTipInput(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Payment Settlement Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'cash', label: 'Cash (In Car)', icon: CashIcon },
                  { id: 'card_terminal', label: 'Card (In Car)', icon: CreditCardIcon },
                  { id: 'card_on_file', label: 'Card on File', icon: CreditCardIcon },
                  { id: 'corporate_account', label: 'Corporate Account', icon: BuildingIcon },
                ] as const
              ).map((opt) => {
                const IconComp = opt.icon;
                const active = completePaymentMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCompletePaymentMethod(opt.id)}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <IconComp
                      className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`}
                    />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Completion Note (Audit Log — Optional)
            </label>
            <input
              type="text"
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              placeholder="e.g. Driver lost cellular signal at airport dropoff"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={completeSendReceipt}
              disabled={!completeTripTarget.passenger?.email}
              onChange={(e) => setCompleteSendReceipt(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
            />
            <div className="min-w-0">
              <div className="font-bold text-slate-800">
                Send Official Receipt Email to Passenger
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                {completeTripTarget.passenger?.email
                  ? completeTripTarget.passenger.email
                  : 'No email address on file for this passenger'}
              </div>
            </div>
          </label>

          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900 text-white">
            <span className="text-xs font-semibold text-slate-300">Total Settled</span>
            <span className="text-base font-mono font-black text-emerald-400 tabular-nums">
              ${computedGrandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={isCompletingTrip}
            onClick={onCloseCompleteTripModal}
            className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCompletingTrip}
            onClick={handleDispatchCompleteTrip}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            {isCompletingTrip ? (
              <>
                <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Completing...</span>
              </>
            ) : (
              <>
                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Complete Trip</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
