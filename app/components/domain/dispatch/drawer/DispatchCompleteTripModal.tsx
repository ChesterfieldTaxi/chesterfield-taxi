import React, { useEffect, useMemo, useState } from 'react';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import { getBookingService } from '../../../../core/services/booking';
import {
  formatCardBrandLabel,
  resolveCompletableStripeSavedCard,
} from '../../../../core/services/customer/contact.service';
import { getEmailDispatchService } from '../../../../core/services/email/resend-email.service';
import { formatDriverAssignmentLabel, type DriverRosterItem } from '../../../../core/services/operator.service';
import { getTelephonyService } from '../../../../core/services/telephony.service';
import type { AppSettings } from '../../../../core/types/config';
import type { PaymentStatus, Trip } from '../../../../core/types/trip';
import { formatVehicleTierDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import { FloatingWindow } from '../../../ui/FloatingWindow';
import { BuildingIcon, CashIcon, CheckIcon, CreditCardIcon, DollarSignIcon, LockIcon, SpinnerIcon } from '../../../ui/Icons';
import { ModernDatePicker, ModernTimePicker } from '../../../ui/ModernDateTimePicker';
import { Select, type SelectOption } from '../../../ui/Select';

export function toLocalCompletionDateTimeParts(dateInput?: Date | string | number): { date: string; time: string } {
  const parsed = dateInput !== undefined ? new Date(dateInput) : new Date();
  const baseMs = Number.isFinite(parsed.getTime()) ? parsed.getTime() : Date.now();
  const r = new Date(Math.round(baseMs / (5 * 60_000)) * (5 * 60_000));
  return {
    date: `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`,
    time: `${String(r.getHours()).padStart(2, '0')}:${String(r.getMinutes()).padStart(2, '0')}`,
  };
}

export function resolveScheduledDropoffParts(
  trip?: Pick<Trip, 'scheduledPickupTime' | 'pricing'> | null
): { date: string; time: string } | null {
  if (!trip?.scheduledPickupTime) return null;
  const pickupMs = Date.parse(trip.scheduledPickupTime);
  if (!Number.isFinite(pickupMs)) return null;
  return toLocalCompletionDateTimeParts(pickupMs + Math.max(0, Number(trip.pricing?.durationMinutes || 0)) * 60_000);
}

export function combineLocalCompletionDateTimeToIso(dateStr: string, timeStr: string, fallbackNow?: Date): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && /^\d{2}:\d{2}$/.test(timeStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const combined = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (Number.isFinite(combined.getTime())) return combined.toISOString();
  }
  return (fallbackNow || new Date()).toISOString();
}

export interface DispatchCompleteTripModalProps {
  isDesktop?: boolean;
  user: AdminUser | null;
  settings: AppSettings;
  drivers: ReadonlyArray<DriverRosterItem>;
  completeTripTarget: Trip | null;
  completeModalOpenSeq: number;
  onTripsChange: React.Dispatch<React.SetStateAction<Trip[]>>;
  onReviewTripChange?: React.Dispatch<React.SetStateAction<Trip | null>>;
  onCloseCompleteTripModal: () => void;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function DispatchCompleteTripModal({
  user, settings, drivers, completeTripTarget, completeModalOpenSeq,
  onTripsChange, onReviewTripChange, onCloseCompleteTripModal, onShowToast,
}: DispatchCompleteTripModalProps) {
  const initialNow = toLocalCompletionDateTimeParts();
  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    () => completeTripTarget?.assignedDriverId || completeTripTarget?.plannedDriverId || ''
  );
  const [completeDate, setCompleteDate] = useState<string>(initialNow.date);
  const [completeTime, setCompleteTime] = useState<string>(initialNow.time);
  const [completeFareInput, setCompleteFareInput] = useState<string>(
    () => (completeTripTarget?.pricing?.totalFare ?? 0).toFixed(2)
  );
  const [completeTipInput, setCompleteTipInput] = useState<string>(
    () => (completeTripTarget?.payment?.tipAmount ?? 0).toFixed(2)
  );
  const [completePaymentMethod, setCompletePaymentMethod] = useState<
    'cash' | 'card_terminal' | 'card_on_file' | 'corporate_account'
  >(() => {
    const raw = completeTripTarget?.payment?.method;
    const ct = (completeTripTarget?.metadata as any)?.cardDetails?.cardPaymentType;
    return raw === 'corporate' || raw === 'account' ? 'corporate_account'
      : raw === 'card' && (ct === 'card_on_file' || Boolean(completeTripTarget?.payment?.vaultedCardId)) ? 'card_on_file'
      : raw === 'card' ? 'card_terminal' : 'cash';
  });
  const [completeSendReceipt, setCompleteSendReceipt] = useState<boolean>(true);
  const [completeNotes, setCompleteNotes] = useState<string>('');
  const [chargeSavedCardNow, setChargeSavedCardNow] = useState<boolean>(true);
  const [isCompletingTrip, setIsCompletingTrip] = useState<boolean>(false);

  const stripeSavedCard = useMemo(
    () => completeTripTarget ? resolveCompletableStripeSavedCard({
      tripMetadata: completeTripTarget.metadata as Record<string, any> | undefined,
      vaultedCardId: completeTripTarget.payment?.vaultedCardId,
      phone: completeTripTarget.passenger?.phone, email: completeTripTarget.passenger?.email,
    }) : null,
    [completeTripTarget]
  );

  useEffect(() => {
    if (!completeTripTarget) return;
    setSelectedDriverId(completeTripTarget.assignedDriverId || completeTripTarget.plannedDriverId || '');
    const nowParts = toLocalCompletionDateTimeParts();
    setCompleteDate(nowParts.date);
    setCompleteTime(nowParts.time);
    setCompleteFareInput((completeTripTarget.pricing?.totalFare ?? 0).toFixed(2));
    setCompleteTipInput((completeTripTarget.payment?.tipAmount ?? 0).toFixed(2));
    const rawMethod = completeTripTarget.payment?.method;
    const metaCardType = (completeTripTarget.metadata as any)?.cardDetails?.cardPaymentType;
    setCompletePaymentMethod(
      rawMethod === 'corporate' || rawMethod === 'account' ? 'corporate_account'
      : rawMethod === 'card' && (metaCardType === 'card_on_file' || Boolean(completeTripTarget.payment?.vaultedCardId)) ? 'card_on_file'
      : rawMethod === 'card' ? 'card_terminal' : 'cash'
    );
    setChargeSavedCardNow(true);
    const autoReceipts = settings.billingSettings?.autoEmailReceipts !== false;
    setCompleteSendReceipt(Boolean(completeTripTarget.passenger?.email) && autoReceipts);
    setCompleteNotes('');
  }, [completeTripTarget?.id, completeModalOpenSeq]);

  const driverOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: 'unassigned', label: 'Unassigned / Partner' }];
    for (const drv of drivers) {
      if (!drv?.id || ((drv.isArchived || drv.isBlacklisted) && drv.id !== selectedDriverId)) continue;
      opts.push({ value: drv.id, label: drv.formattedLabel || formatDriverAssignmentLabel(drv), subtitle: drv.name || undefined });
    }
    return opts;
  }, [drivers, selectedDriverId]);

  const scheduledDropoffParts = useMemo(
    () => resolveScheduledDropoffParts(completeTripTarget),
    [completeTripTarget?.scheduledPickupTime, completeTripTarget?.pricing?.durationMinutes]
  );

  const handleDispatchCompleteTrip = async () => {
    if (!completeTripTarget) return;
    const subtotalFare = Math.max(0, Number.parseFloat(completeFareInput) || 0);
    const tipAmount = Math.max(0, Number.parseFloat(completeTipInput) || 0);
    const grandTotal = Number((subtotalFare + tipAmount).toFixed(2));
    const trip = completeTripTarget;
    const completedAtIso = combineLocalCompletionDateTimeToIso(completeDate, completeTime);
    const completedAtFormatted = new Date(completedAtIso).toLocaleString();
    const resolvedDriverId = selectedDriverId && selectedDriverId !== 'unassigned' ? selectedDriverId : null;
    const selectedDriver = resolvedDriverId ? drivers.find((d) => d.id === resolvedDriverId) : undefined;
    const mappedPaymentMethod: 'cash' | 'card' | 'corporate' =
      completePaymentMethod === 'corporate_account' ? 'corporate' : completePaymentMethod === 'cash' ? 'cash' : 'card';
    let paymentStatus: PaymentStatus = completePaymentMethod === 'corporate_account' ? 'pending' : 'settled';
    let chargedPiId: string | undefined;
    let settledBrand = trip.payment?.cardBrand || stripeSavedCard?.brand;
    let settledLast4 = trip.payment?.cardLast4 || stripeSavedCard?.last4;

    setIsCompletingTrip(true);
    const bookingService = getBookingService();
    try {
      if (completePaymentMethod === 'card_on_file' && chargeSavedCardNow && stripeSavedCard && grandTotal >= 5) {
        const resp = await authorizedFetch('/api/payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'charge_saved_method', stripeCustomerId: stripeSavedCard.stripeCustomerId,
            paymentMethodId: stripeSavedCard.paymentMethodId, amount: grandTotal, currency: 'usd', tripId: trip.id,
          }),
        });
        const chargeJson = (await resp.json().catch(() => ({}))) as Record<string, any>;
        if (resp.ok && chargeJson.success) {
          paymentStatus = 'captured';
          chargedPiId = chargeJson.paymentIntentId;
          settledBrand = chargeJson.brand || settledBrand;
          settledLast4 = chargeJson.last4 || settledLast4;
        } else if (!chargeJson.stripeDisabled) {
          onShowToast(chargeJson.error || 'Saved card charge declined. Uncheck Charge Saved Card for reference settlement.', 'error');
          setIsCompletingTrip(false);
          return;
        }
      }
      const updatedPricing = {
        ...(trip.pricing || {
          baseFare: subtotalFare, distanceFare: 0, timeFare: 0, surcharges: 0,
          distanceMiles: 0, durationMinutes: 0, currency: 'USD',
        }),
        totalFare: subtotalFare,
      };
      const updatedPayment = {
        ...(trip.payment || {}),
        method: mappedPaymentMethod, status: paymentStatus, amount: grandTotal, tipAmount, paidAt: completedAtIso,
        ...(chargedPiId ? { paymentIntentId: chargedPiId } : {}),
        ...(settledBrand ? { cardBrand: settledBrand } : {}),
        ...(settledLast4 ? { cardLast4: settledLast4 } : {}),
      };
      const nextMeta: Record<string, any> = {
        ...(trip.metadata || {}),
        completedByDispatcher: user?.email || 'Dispatcher',
        dispatchCompletionPaymentType: completePaymentMethod,
        ...(completeNotes.trim() ? { dispatchCompletionNotes: completeNotes.trim() } : {}),
      };
      if (resolvedDriverId) {
        if (selectedDriver?.name) nextMeta.assignedDriverName = selectedDriver.name;
        if (selectedDriver?.phone) nextMeta.assignedDriverPhone = selectedDriver.phone;
      } else {
        delete nextMeta.assignedDriverName;
        delete nextMeta.assignedDriverPhone;
      }

      const driverAssignmentPatch = resolvedDriverId
        ? { assignedDriverId: resolvedDriverId, plannedDriverId: null, plannedDriverLabel: null, plannedAt: null, plannedBy: null }
        : { assignedDriverId: null };

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(trip.id, {
          ...driverAssignmentPatch, pricing: updatedPricing, payment: updatedPayment,
          completedAt: completedAtIso, metadata: nextMeta,
        } as any);
      }

      if (bookingService.updateTripStatus) {
        const actorLabel = user?.email || 'Dispatcher';
        const auditBase = `Completed via Dispatch Console (${actorLabel}) at ${completedAtFormatted}`;
        await bookingService.updateTripStatus(trip.id, 'completed', {
          actorRole: 'admin',
          ...(resolvedDriverId ? { assignedDriverId: resolvedDriverId } : {}),
          reason: completeNotes.trim() ? `${auditBase}: ${completeNotes.trim()}` : auditBase,
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(trip.id, { status: 'completed' });
      }

      getTelephonyService().closeMaskedSession(trip.id).catch(() => {});

      let receiptDispatched = false;
      if (completeSendReceipt && trip.passenger?.email) {
        await getEmailDispatchService()
          .sendTripReceipt({
            tripId: trip.id,
            customerId: trip.customerId ?? null,
            completedAt: completedAtFormatted,
            passenger: {
              firstName: trip.passenger.firstName, lastName: trip.passenger.lastName,
              email: trip.passenger.email, phone: trip.passenger.phone,
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
              (typeof nextMeta.vehicleDisplayName === 'string' && nextMeta.vehicleDisplayName) ||
              formatVehicleTierDisplay((nextMeta.vehicleTypeId as string) || trip.vehicleTier, settings.vehicles, nextMeta.vehicleDisplayName),
            driverName:
              selectedDriver?.name ||
              (resolvedDriverId && typeof nextMeta.assignedDriverName === 'string' && nextMeta.assignedDriverName) ||
              (resolvedDriverId ? 'Assigned Driver' : 'Unassigned / Partner'),
            vehicleUnit: selectedDriver?.cabNumber,
            distanceMiles: updatedPricing.distanceMiles,
            durationMinutes: updatedPricing.durationMinutes,
            subtotalFare, tipAmount, grandTotal,
            currency: updatedPricing.currency || 'USD',
            breakdown: updatedPricing.breakdown,
            paymentMethod: completePaymentMethod,
            cardLast4: trip.payment?.cardLast4,
            paymentStatus: completePaymentMethod === 'corporate_account' ? 'corporate_direct_bill' : 'paid',
            corporateAccountName: nextMeta.corporateDetails?.corporateAccount || nextMeta.corporateOrgName,
            poNumber: nextMeta.corporateDetails?.billingPo || nextMeta.billingPo,
            companySettings: {
              name: settings.company?.name, phone: settings.company?.phone,
              address: settings.company?.address, email: settings.company?.email,
            },
          })
          .then(() => { receiptDispatched = true; })
          .catch((emailErr) => { console.warn('[Dispatch] Receipt email failed:', emailErr); });
      }

      const nextTripPatch: Partial<Trip> = {
        status: 'completed', ...driverAssignmentPatch, pricing: updatedPricing,
        payment: updatedPayment as any, completedAt: completedAtIso, metadata: nextMeta,
      };
      onTripsChange((prev) => prev.map((t) => (t.id === trip.id ? { ...t, ...nextTripPatch } : t)));
      onReviewTripChange?.((prev) => (prev && prev.id === trip.id ? { ...prev, ...nextTripPatch } : prev));
      onCloseCompleteTripModal();
      onShowToast(
        `Trip #${trip.id.slice(-6).toUpperCase()} completed ($${grandTotal.toFixed(2)})${receiptDispatched ? ' · Receipt emailed' : ''}.`,
        'success'
      );
    } catch (err) {
      console.error('Failed to complete trip from dispatch console:', err);
      onShowToast('Failed to complete trip. Please try again.', 'error');
    } finally {
      setIsCompletingTrip(false);
    }
  };

  if (!completeTripTarget) return null;

  const parsedSubtotal = Math.max(0, Number.parseFloat(completeFareInput) || 0);
  const parsedTip = Math.max(0, Number.parseFloat(completeTipInput) || 0);
  const computedGrandTotal = Number((parsedSubtotal + parsedTip).toFixed(2));

  return (
    <FloatingWindow
      id="dispatch_complete_trip"
      isOpen={Boolean(completeTripTarget)}
      onClose={() => { if (!isCompletingTrip) onCloseCompleteTripModal(); }}
      hasBackdrop={false}
      title={`Complete Trip · #${completeTripTarget.id.slice(-6).toUpperCase()}`}
      subtitle={`${completeTripTarget.passenger?.firstName || ''} ${completeTripTarget.passenger?.lastName || ''}`.trim() || 'Passenger Settlement'}
      icon={<CheckIcon className="w-4 h-4 text-emerald-400" />}
      initialSize={{ width: 470, height: 640 }}
      autoHeight
      minWidth={380}
      minHeight={380}
      zIndex={225}
      footer={
        <div className="px-4 sm:px-5 py-3 bg-surface-subtle flex items-center justify-end gap-2">
          <button type="button" disabled={isCompletingTrip} onClick={onCloseCompleteTripModal} className="px-4 py-2 rounded-xl border border-border-strong text-xs font-bold text-fg-secondary hover:bg-surface-muted cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={isCompletingTrip} onClick={handleDispatchCompleteTrip} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5">
            {isCompletingTrip ? (<><SpinnerIcon className="w-3.5 h-3.5 animate-spin text-white" /><span>Completing...</span></>) : (<><CheckIcon className="w-3.5 h-3.5 shrink-0" /><span>Complete Trip</span></>)}
          </button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-3.5 text-xs">
        <div className="p-2.5 bg-surface-card rounded-xl border border-border-subtle space-y-1">
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
            <span className="text-fg-secondary font-medium truncate">{completeTripTarget.pickupLocation?.address || 'Pickup'}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
            <span className="text-fg-secondary font-medium truncate">{completeTripTarget.dropoffLocation?.address || 'Dropoff'}</span>
          </div>
        </div>

        <div data-complete-trip-driver="true">
          <Select label="Completing Driver" size="sm" searchable={true} searchPlaceholder="Search driver or cab #..." options={driverOptions} value={selectedDriverId || 'unassigned'} onValueChange={setSelectedDriverId} />
        </div>

        <div data-complete-trip-datetime="true" className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-fg-secondary">Completion Date &amp; Time</label>
            <div className="inline-flex items-center gap-1">
              <button type="button" onClick={() => { const p = toLocalCompletionDateTimeParts(); setCompleteDate(p.date); setCompleteTime(p.time); }} className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-surface-muted hover:bg-status-info-bg text-fg-secondary hover:text-status-info-fg border border-border-subtle cursor-pointer">Now</button>
              {scheduledDropoffParts && (
                <button type="button" onClick={() => { setCompleteDate(scheduledDropoffParts.date); setCompleteTime(scheduledDropoffParts.time); }} className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg border border-status-info-border cursor-pointer">Scheduled Dropoff</button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ModernDatePicker size="sm" value={completeDate} onChange={setCompleteDate} />
            <ModernTimePicker size="sm" value={completeTime} onChange={setCompleteTime} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-fg-secondary mb-1">Final Fare (USD)</label>
            <div className="relative">
              <DollarSignIcon className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
              <input type="number" step="0.01" min="0" value={completeFareInput} onChange={(e) => setCompleteFareInput(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-surface-card border border-border-strong rounded-xl text-sm font-mono font-bold text-fg-primary focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-fg-secondary mb-1">Tip / Gratuity (USD)</label>
            <div className="relative">
              <DollarSignIcon className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
              <input type="number" step="0.01" min="0" value={completeTipInput} onChange={(e) => setCompleteTipInput(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-surface-card border border-border-strong rounded-xl text-sm font-mono font-bold text-fg-primary focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-fg-secondary mb-1.5">Payment Settlement Method</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'cash', label: 'Cash (In Car)', icon: CashIcon },
              { id: 'card_terminal', label: 'Card (In Car)', icon: CreditCardIcon },
              { id: 'card_on_file', label: 'Card on File', icon: CreditCardIcon },
              { id: 'corporate_account', label: 'Corporate Account', icon: BuildingIcon },
            ] as const).map((opt) => {
              const IconComp = opt.icon;
              const active = completePaymentMethod === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCompletePaymentMethod(opt.id)}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    active ? 'bg-status-success-bg border-emerald-500 text-status-success-fg ring-1 ring-emerald-500' : 'bg-surface-card border-border-subtle text-fg-secondary hover:bg-surface-subtle'
                  }`}
                >
                  <IconComp className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-fg-subtle'}`} />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
          {completePaymentMethod === 'card_on_file' && stripeSavedCard && (
            <label data-complete-charge-saved-card="true" className="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-status-success-bg/80 border border-status-success-border cursor-pointer">
              <span className="inline-flex items-center gap-1.5 font-bold text-status-success-fg">
                <input type="checkbox" checked={chargeSavedCardNow} onChange={(e) => setChargeSavedCardNow(e.target.checked)} className="rounded border-emerald-400 text-emerald-600 w-3.5 h-3.5" />
                <LockIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Charge Saved Card ({formatCardBrandLabel(stripeSavedCard.brand)} •••• {stripeSavedCard.last4})</span>
              </span>
              <span className="text-[10px] font-extrabold text-status-success-fg bg-surface-card px-1.5 py-0.5 rounded border border-status-success-border">Stripe Vault</span>
            </label>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-fg-secondary mb-1">Completion Note (Audit Log — Optional)</label>
          <input type="text" value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} placeholder="e.g. Driver lost cellular signal at airport dropoff" className="w-full px-3 py-2 bg-surface-card border border-border-strong rounded-xl text-xs text-fg-strong focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" />
        </div>

        <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-status-info-bg/70 border border-status-info-border/80 cursor-pointer">
          <input type="checkbox" checked={completeSendReceipt} disabled={!completeTripTarget.passenger?.email} onChange={(e) => setCompleteSendReceipt(e.target.checked)} className="mt-0.5 rounded border-border-strong text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50" />
          <div className="min-w-0">
            <div className="font-bold text-fg-strong">Send Official Receipt Email to Passenger</div>
            <div className="text-[11px] text-fg-secondary truncate">{completeTripTarget.passenger?.email || 'No email address on file for this passenger'}</div>
          </div>
        </label>

        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface-header text-white">
          <span className="text-xs font-semibold text-slate-300">Total Settled</span>
          <span className="text-base font-mono font-black text-emerald-400 tabular-nums">${computedGrandTotal.toFixed(2)}</span>
        </div>
      </div>
    </FloatingWindow>
  );
}
