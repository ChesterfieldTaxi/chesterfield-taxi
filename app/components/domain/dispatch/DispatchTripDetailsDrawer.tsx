import React, { useState, useEffect } from 'react';
import type { AdminUser } from '../../../core/services/auth/admin-auth.service';
import type { AppSettings, NamedPricingRule } from '../../../core/types/config';
import type { Trip, TripStatus, TripAuditEvent } from '../../../core/types/trip';
import { getBookingService } from '../../../core/services/booking';
import { getPricingRulesService } from '../../../core/services/pricing';
import { getEmailDispatchService } from '../../../core/services/email/resend-email.service';
import { formatVehicleTier, formatVehicleTierDisplay } from '../../../core/services/email/email-templates';
import { getTelephonyService } from '../../../core/services/telephony.service';
import { formatDriverAssignmentLabel } from '../../../core/services/operator.service';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import type { LiveFleetDriver } from '../../../core/hooks/useDispatchFleet';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';
import { FloatingWindow } from '../../ui/FloatingWindow';
import { TripAuditModal, TripAuditTimeline } from '../admin/TripAuditModal';
import { PriceBreakdownPanel } from '../booking/PriceBreakdownPanel';
import {
  DispatchCascadePill,
  DispatchSlaBadge,
  canTripTriggerAutoOffer,
  isTripCascadeActive,
} from './DispatchCascadeSlaBadges';
import { evaluateTripSlaUrgency } from '../../../core/services/dispatch/sla-monitor.service';
import { getPayLinkService } from '../../../core/services/payments/pay-link.service';
import {
  BoltIcon,
  XIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  RepeatIcon,
  CheckIcon,
  AlertTriangleIcon,
  PhoneIcon,
  MailIcon,
  ChatBubbleLeftRightIcon,
  PlaneIcon,
  LuggageIcon,
  SparklesIcon,
  CarIcon,
  BanIcon,
  AlertCircleIcon,
  SpinnerIcon,
  RefreshCwIcon,
  CopyIcon,
  PencilIcon,
  DollarSignIcon,
  CashIcon,
  CreditCardIcon,
  BuildingIcon,
} from '../../ui/Icons';

export function getContextualEmailMeta(status?: string): {
  label: string;
  shortLabel: string;
  kind: 'receipt' | 'status' | 'confirmation';
} {
  const norm = (status || '').toLowerCase();
  if (norm === 'completed') return { label: 'Send Receipt Email', shortLabel: 'Send Receipt', kind: 'receipt' };
  if (norm === 'en_route') return { label: 'Send En Route Email', shortLabel: 'En Route Email', kind: 'status' };
  if (norm === 'arrived') return { label: 'Send Arrived Email', shortLabel: 'Arrived Email', kind: 'status' };
  if (norm === 'in_progress') return { label: 'Send Status Update', shortLabel: 'Status Email', kind: 'status' };
  if (norm === 'cancelled' || norm === 'declined') {
    return { label: 'Send Cancellation Notice', shortLabel: 'Cancel Notice', kind: 'status' };
  }
  return { label: 'Send Confirmation Email', shortLabel: 'Send Confirmation', kind: 'confirmation' };
}

export async function sendDispatchContextualTripEmail(params: {
  targetTrip: Trip;
  drivers: LiveFleetDriver[];
  settings: AppSettings;
  recipientOverride?: string;
  onAlert?: (alert: { type: 'success' | 'error'; message: string }) => void;
  onToast: (text: string, type: 'success' | 'error' | 'info') => void;
}): Promise<void> {
  const { targetTrip, drivers, settings, recipientOverride, onAlert, onToast } = params;
  const metaInfo = getContextualEmailMeta(targetTrip.status);
  const recipientEmail = recipientOverride || targetTrip.passenger?.email;

  if (!recipientEmail) {
    const msg = 'No passenger email on file. Add an email or enable alternate recipient override.';
    onAlert?.({ type: 'error', message: msg });
    onToast(msg, 'error');
    return;
  }

  try {
    const emailService = getEmailDispatchService();
    const tripMeta = (targetTrip.metadata || {}) as Record<string, any>;
    const assignedDriver = targetTrip.assignedDriverId
      ? drivers.find((d) => d.id === targetTrip.assignedDriverId)
      : undefined;
    const vehicleDisplayName =
      (typeof tripMeta.vehicleDisplayName === 'string' && tripMeta.vehicleDisplayName) ||
      formatVehicleTierDisplay(
        (tripMeta.vehicleTypeId as string) || targetTrip.vehicleTier,
        settings.vehicles,
        tripMeta.vehicleDisplayName
      );
    const pickupTimeStr =
      targetTrip.actualPickupTime || targetTrip.scheduledPickupTime
        ? new Date(targetTrip.actualPickupTime || targetTrip.scheduledPickupTime!).toLocaleString()
        : 'Immediate Ride (ASAP)';

    let result: { success: boolean; error?: string } = { success: false, error: 'Unsupported email action' };

    if (metaInfo.kind === 'receipt') {
      const subtotalFare = targetTrip.pricing?.totalFare ?? 0;
      const tipAmount = targetTrip.payment?.tipAmount ?? 0;
      const grandTotal = Number((subtotalFare + tipAmount).toFixed(2));
      const rawMethod = targetTrip.payment?.method;
      const paymentMethod: 'cash' | 'card_terminal' | 'card_on_file' | 'corporate_account' =
        rawMethod === 'corporate' || rawMethod === 'account'
          ? 'corporate_account'
          : rawMethod === 'card'
          ? 'card_terminal'
          : 'cash';

      result = await emailService.sendTripReceipt({
        tripId: targetTrip.id,
        completedAt: new Date(targetTrip.completedAt || Date.now()).toLocaleString(),
        passenger: {
          firstName: targetTrip.passenger?.firstName || 'Valued',
          lastName: targetTrip.passenger?.lastName || 'Passenger',
          email: recipientEmail,
          phone: targetTrip.passenger?.phone,
        },
        pickupAddress: targetTrip.pickupLocation?.address || '',
        intermediateStops: targetTrip.intermediateStops?.map((s) => ({ address: s.address })),
        dropoffAddress: targetTrip.dropoffLocation?.address || '',
        pickupTime: pickupTimeStr,
        vehicleTier: targetTrip.vehicleTier,
        vehicleDisplayName,
        driverName:
          assignedDriver?.name ||
          (typeof tripMeta.assignedDriverName === 'string' && tripMeta.assignedDriverName) ||
          'Assigned Driver',
        vehicleUnit: assignedDriver?.cabNumber,
        distanceMiles: targetTrip.pricing?.distanceMiles,
        durationMinutes: targetTrip.pricing?.durationMinutes,
        subtotalFare,
        tipAmount,
        grandTotal,
        currency: targetTrip.pricing?.currency || 'USD',
        breakdown: targetTrip.pricing?.breakdown,
        paymentMethod,
        cardLast4: targetTrip.payment?.cardLast4,
        paymentStatus: paymentMethod === 'corporate_account' ? 'corporate_direct_bill' : 'paid',
        corporateAccountName: tripMeta.corporateDetails?.corporateAccount || tripMeta.corporateOrgName,
        poNumber: tripMeta.corporateDetails?.billingPo || tripMeta.billingPo,
        companySettings: {
          name: settings.company?.name,
          phone: settings.company?.phone,
          address: settings.company?.address,
          email: settings.company?.email,
        },
      });
    } else if (metaInfo.kind === 'confirmation') {
      const resolvedVehTier =
        (tripMeta.vehicleTypeId as string) ||
        targetTrip.vehicleTier ||
        (tripMeta.vehiclePreference as string) ||
        'standard';
      const resolvedVehName = formatVehicleTier(
        resolvedVehTier,
        settings.vehicles,
        tripMeta.vehicleDisplayName as string | undefined
      );
      result = await emailService.sendBookingConfirmation({
        tripId: targetTrip.id,
        trackingToken: targetTrip.trackingToken,
        status: targetTrip.status || 'CONFIRMED',
        passenger: {
          firstName: targetTrip.passenger.firstName,
          lastName: targetTrip.passenger.lastName,
          email: recipientEmail,
          phone: targetTrip.passenger.phone,
        },
        recipientEmailOverride: recipientOverride,
        pickupAddress: targetTrip.pickupLocation.address,
        intermediateStops: targetTrip.intermediateStops?.map((s) => ({ address: s.address, notes: s.notes })),
        dropoffAddress: targetTrip.dropoffLocation.address,
        dropoffNotes: targetTrip.dropoffLocation.notes,
        pickupTime:
          targetTrip.bookingType === 'scheduled' && targetTrip.scheduledPickupTime
            ? new Date(targetTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
        bookingType: targetTrip.bookingType,
        vehicleTier: resolvedVehTier,
        vehicleDisplayName: resolvedVehName,
        passengerCount: targetTrip.passenger.passengerCount,
        luggageCount: targetTrip.passenger.luggageCount,
        totalFare: targetTrip.pricing?.totalFare || 0,
        breakdown: targetTrip.pricing?.breakdown,
        currency: targetTrip.pricing?.currency || 'USD',
        paymentMethod: targetTrip.payment?.method || 'cash',
        companySettings: {
          name: settings.company?.name,
          phone: settings.company?.phone,
          address: settings.company?.address,
          email: settings.company?.email,
        },
      });
    } else {
      result = await emailService.sendStatusUpdateNotification({
        tripId: targetTrip.id,
        trackingToken: targetTrip.trackingToken,
        passenger: {
          firstName: targetTrip.passenger?.firstName || 'Valued',
          lastName: targetTrip.passenger?.lastName || 'Passenger',
          email: recipientEmail,
          phone: targetTrip.passenger?.phone,
        },
        newStatus: targetTrip.status,
        pickupAddress: targetTrip.pickupLocation?.address || '',
        dropoffAddress: targetTrip.dropoffLocation?.address || '',
        pickupTime: pickupTimeStr,
        vehicleTier: targetTrip.vehicleTier,
        vehicleDisplayName,
        driverInfo: assignedDriver
          ? {
              name: assignedDriver.name,
              phone: assignedDriver.phone,
              vehicleModel: assignedDriver.vehicle,
            }
          : undefined,
        companySettings: {
          name: settings.company?.name,
          phone: settings.company?.phone,
          address: settings.company?.address,
          email: settings.company?.email,
        },
      });
    }

    if (!result.success) {
      const errMsg = result.error || `Failed to send ${metaInfo.shortLabel.toLowerCase()}.`;
      onAlert?.({ type: 'error', message: errMsg });
      onToast(errMsg, 'error');
      return;
    }

    const successMsg = `${metaInfo.label.replace(/^Send /, '')} sent to ${recipientEmail}.`;
    onAlert?.({ type: 'success', message: successMsg });
    onToast(successMsg, 'success');
  } catch (err: any) {
    const errMsg = err?.message || 'Failed to send email.';
    onAlert?.({ type: 'error', message: errMsg });
    onToast(errMsg, 'error');
  }
}

export interface DispatchTripDetailsDrawerProps {
  isDesktop: boolean;
  user: AdminUser | null;
  settings: AppSettings;
  trips: Trip[];
  onTripsChange: React.Dispatch<React.SetStateAction<Trip[]>>;
  drivers: LiveFleetDriver[];

  // Review / Details FloatingWindow
  reviewTrip: Trip | null;
  reviewOpenSeq: number;
  reviewModalTab: 'details' | 'audit';
  onReviewModalTabChange: (tab: 'details' | 'audit') => void;
  onReviewTripChange: React.Dispatch<React.SetStateAction<Trip | null>>;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;

  // Audit Trail Modal
  auditTrailTrip: Trip | null;
  onCloseAuditTrailTrip: () => void;

  // Driver Fare Override Modal
  driverModalTrip: Trip | null;
  driverModalOpenSeq: number;
  onCloseDriverModal: () => void;

  // Complete Trip Modal
  completeTripTarget: Trip | null;
  completeModalOpenSeq: number;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onCloseCompleteTripModal: () => void;

  // Shared callbacks
  onQuickAssignDriver: (tripId: string, driverId: string) => void | Promise<void>;
  onStartAutoOffer?: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer?: (trip: Trip) => void | Promise<void>;
  onPromptCancelTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onCloneBookingFromReview: (trip: Trip) => void;
  onEditTripFromReview: (trip: Trip) => void;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function DispatchTripDetailsDrawer({
  isDesktop,
  user,
  settings,
  trips,
  onTripsChange,
  drivers,
  reviewTrip,
  reviewOpenSeq,
  reviewModalTab,
  onReviewModalTabChange,
  onReviewTripChange,
  onOpenReviewModal,
  auditTrailTrip,
  onCloseAuditTrailTrip,
  driverModalTrip,
  driverModalOpenSeq,
  onCloseDriverModal,
  completeTripTarget,
  completeModalOpenSeq,
  onOpenCompleteTripModal,
  onCloseCompleteTripModal,
  onQuickAssignDriver,
  onStartAutoOffer,
  onCancelAutoOffer,
  onPromptCancelTrip,
  onReactivateTrip,
  onCloneBookingFromReview,
  onEditTripFromReview,
  onShowToast,
}: DispatchTripDetailsDrawerProps) {
  // Review Modal internal form state
  const [reviewDeclineMode, setReviewDeclineMode] = useState<boolean>(false);
  const [reviewClarifyMode, setReviewClarifyMode] = useState<boolean>(false);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState<string>('No driver availability for requested time');
  const [declineScope, setDeclineScope] = useState<'leg' | 'both'>('leg');
  const [confirmScope, setConfirmScope] = useState<'both' | 'leg'>('both');
  const [reviewCustomNotes, setReviewCustomNotes] = useState<string>('');
  const [clarifyTopic, setClarifyTopic] = useState<string>('Pickup or Dropoff location details');
  const [clarifyMessage, setClarifyMessage] = useState<string>('');
  const [isProcessingReview, setIsProcessingReview] = useState<boolean>(false);
  const [reviewAlert, setReviewAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [overrideRecipientEmail, setOverrideRecipientEmail] = useState<string>('');
  const [isOverrideEmailEnabled, setIsOverrideEmailEnabled] = useState<boolean>(false);
  const [shouldUpdatePassengerEmail, setShouldUpdatePassengerEmail] = useState<boolean>(false);
  const [isOverridingStatus, setIsOverridingStatus] = useState<boolean>(false);
  const [payLinkBusyAction, setPayLinkBusyAction] = useState<'copy' | 'sms' | 'email' | null>(null);
  const [generatedPayUrl, setGeneratedPayUrl] = useState<string>('');

  // Driver Fare Console internal state
  const [driverPermittedRules, setDriverPermittedRules] = useState<NamedPricingRule[]>([]);
  const [selectedDriverRuleId, setSelectedDriverRuleId] = useState<string>('');
  const [driverManualFare, setDriverManualFare] = useState<string>('');
  const [driverOverrideReason, setDriverOverrideReason] = useState<string>('');
  const [isApplyingDriverFare, setIsApplyingDriverFare] = useState<boolean>(false);
  const [driverFareTab, setDriverFareTab] = useState<'rule' | 'flat'>('rule');

  // Complete Trip Modal internal state
  const [completeFareInput, setCompleteFareInput] = useState<string>('');
  const [completeTipInput, setCompleteTipInput] = useState<string>('0.00');
  const [completePaymentMethod, setCompletePaymentMethod] = useState<'cash' | 'card_terminal' | 'card_on_file' | 'corporate_account'>('cash');
  const [completeSendReceipt, setCompleteSendReceipt] = useState<boolean>(true);
  const [completeNotes, setCompleteNotes] = useState<string>('');
  const [isCompletingTrip, setIsCompletingTrip] = useState<boolean>(false);

  // Subscribe to Driver Permitted Pricing Rules
  useEffect(() => {
    const unsub = getPricingRulesService().subscribeToRules((rules) => {
      setDriverPermittedRules(rules.filter((r) => r.isActive && r.allowDriverSelection));
    });
    return () => unsub();
  }, []);

  // Reset review modal state whenever opened via handleOpenReviewModal
  useEffect(() => {
    if (!reviewTrip) return;
    setReviewDeclineMode(false);
    setReviewClarifyMode(false);
    setSelectedDeclineReason('No driver availability for requested time');
    setDeclineScope('leg');
    setConfirmScope('both');
    setReviewCustomNotes('');
    setClarifyTopic('Pickup or Dropoff location details');
    setClarifyMessage('');
    setReviewAlert(null);
    setOverrideRecipientEmail('');
    setIsOverrideEmailEnabled(false);
    setShouldUpdatePassengerEmail(false);
    const cachedToken = getPayLinkService().getTripCachedPayToken(reviewTrip);
    setGeneratedPayUrl(cachedToken ? getPayLinkService().buildPayUrl(cachedToken) : '');
  }, [reviewTrip?.id, reviewOpenSeq]);

  // Reset driver fare modal state whenever opened via handleOpenDriverModal
  useEffect(() => {
    if (!driverModalTrip) return;
    setSelectedDriverRuleId('');
    setDriverManualFare(driverModalTrip.pricing?.totalFare ? driverModalTrip.pricing.totalFare.toFixed(2) : '');
    setDriverOverrideReason('');
    setDriverFareTab('rule');
  }, [driverModalTrip?.id, driverModalOpenSeq]);

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

  const driverFareSheetDrag = useBottomSheetDragToClose({
    onClose: onCloseDriverModal,
    disabled: isDesktop,
  });

  const completeSheetDrag = useBottomSheetDragToClose({
    onClose: () => {
      if (!isCompletingTrip) onCloseCompleteTripModal();
    },
    disabled: isDesktop || isCompletingTrip,
  });

  const handleTripPayLinkAction = async (mode: 'copy' | 'sms' | 'email') => {
    if (!reviewTrip) return;
    setPayLinkBusyAction(mode);
    try {
      const payLinkService = getPayLinkService();
      const targetEmail =
        isOverrideEmailEnabled && overrideRecipientEmail.trim()
          ? overrideRecipientEmail.trim()
          : reviewTrip.passenger?.email;

      if (mode === 'sms' && !reviewTrip.passenger?.phone) {
        onShowToast('Passenger phone number is missing on this trip.', 'error');
        return;
      }
      if (mode === 'email' && !targetEmail) {
        onShowToast('Passenger email address is missing on this trip.', 'error');
        return;
      }

      const res = await payLinkService.createOrGetTripPayLink(reviewTrip, {
        sendSms: mode === 'sms',
        recipientPhone: reviewTrip.passenger?.phone,
        sendEmail: mode === 'email',
        recipientEmail: targetEmail,
      });

      if (!res.success || !res.payLink || !res.payUrl) {
        onShowToast(res.error || 'Failed to generate 1-tap Pay Link.', 'error');
        return;
      }

      setGeneratedPayUrl(res.payUrl);

      const nextStatus = res.payLink.status;
      const patchTrip = (t: Trip): Trip => ({
        ...t,
        payment: {
          ...t.payment,
          payToken: res.payLink!.payToken,
          payLinkStatus: nextStatus,
        },
        metadata: {
          ...(t.metadata || {}),
          payToken: res.payLink!.payToken,
          payLinkUrl: res.payUrl,
          payLinkStatus: nextStatus,
        },
      });

      onReviewTripChange((prev) => (prev && prev.id === reviewTrip.id ? patchTrip(prev) : prev));
      onTripsChange((prev) => prev.map((t) => (t.id === reviewTrip.id ? patchTrip(t) : t)));

      if (mode === 'copy') {
        await navigator.clipboard?.writeText(res.payUrl);
        onShowToast(`Copied 1-tap Pay Link for Trip #${reviewTrip.id}.`, 'success');
      } else if (mode === 'sms') {
        if (res.smsResult?.sent) {
          onShowToast(
            `Sent 1-tap Pay Link via SMS to ${reviewTrip.passenger.phone}.`,
            'success'
          );
        } else {
          await navigator.clipboard?.writeText(res.payUrl).catch(() => {});
          onShowToast(
            res.smsResult?.error || 'SMS gateway unavailable; Pay Link copied to clipboard.',
            'info'
          );
        }
      } else if (mode === 'email') {
        if (res.emailResult?.sent) {
          onShowToast(`Emailed 1-tap Pay Link to ${targetEmail}.`, 'success');
        } else {
          onShowToast(res.emailResult?.error || 'Failed to deliver Pay Link email.', 'error');
        }
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Unable to process Pay Link action.', 'error');
    } finally {
      setPayLinkBusyAction(null);
    }
  };

  const handleConfirmTrip = async () => {
    if (!reviewTrip) return;
    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      const bookingService = getBookingService();
      const reviewMeta = (reviewTrip.metadata || {}) as Record<string, any>;
      const emailService = getEmailDispatchService();

      const linkedLegId =
        (reviewMeta.hasReturnTrip && reviewMeta.returnTripId) ||
        (reviewMeta.isReturnRide && reviewMeta.linkedTripId) ||
        reviewTrip.linkedReturnTripId ||
        reviewTrip.linkedTripId;

      const shouldConfirmBoth = Boolean(confirmScope === 'both' && linkedLegId);
      const linkedTripObj = shouldConfirmBoth ? trips.find((t) => t.id === linkedLegId) : null;

      const targetOverride = (isOverrideEmailEnabled && overrideRecipientEmail.trim()) ? overrideRecipientEmail.trim() : undefined;

      if (targetOverride && shouldUpdatePassengerEmail && bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          passenger: {
            ...reviewTrip.passenger,
            email: targetOverride,
          },
        });
      }

      if (bookingService.updateTripStatus) {
        await bookingService.updateTripStatus(reviewTrip.id, 'CONFIRMED', {
          actorRole: 'admin',
          reason: shouldConfirmBoth ? 'Dispatcher accepted round-trip web booking' : 'Dispatcher accepted web booking leg',
        });
        if (shouldConfirmBoth && linkedLegId) {
          await bookingService.updateTripStatus(linkedLegId, 'CONFIRMED', {
            actorRole: 'admin',
            reason: `Dispatcher accepted round-trip leg linked to #${reviewTrip.id}`,
          });
        }
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, { status: 'CONFIRMED' });
        if (shouldConfirmBoth && linkedLegId) {
          await bookingService.updateTrip(linkedLegId, { status: 'CONFIRMED' });
        }
      }

      const outboundFlightDetails = (reviewMeta.flightNumber || reviewMeta.airline || reviewMeta.airlineName || reviewMeta.tailNumber)
        ? {
            flightNumber: reviewMeta.flightNumber ? String(reviewMeta.flightNumber) : undefined,
            airlineName: (reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode) ? String(reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode) : undefined,
            departureAirport: reviewMeta.flightOrigin || reviewMeta.departureAirport ? String(reviewMeta.flightOrigin || reviewMeta.departureAirport) : undefined,
            tailNumber: reviewMeta.tailNumber ? String(reviewMeta.tailNumber) : undefined,
            fboFacility: reviewMeta.fboFacility ? String(reviewMeta.fboFacility) : undefined,
            isPrivateAviation: Boolean(reviewMeta.isPrivateAviation || reviewMeta.tailNumber || reviewMeta.fboFacility),
            hasCheckedLuggage: Boolean(reviewMeta.hasCheckedLuggage),
            isAirportTrip: Boolean(reviewMeta.isAirportTrip),
          }
        : undefined;

      const returnTripPayload = linkedTripObj
        ? {
            tripId: linkedTripObj.id,
            pickupAddress: linkedTripObj.pickupLocation.address,
            dropoffAddress: linkedTripObj.dropoffLocation.address,
            pickupTime:
              linkedTripObj.bookingType === 'scheduled' && linkedTripObj.scheduledPickupTime
                ? new Date(linkedTripObj.scheduledPickupTime).toLocaleString()
                : 'Scheduled Return',
            vehicleTier:
              (linkedTripObj.metadata as any)?.vehicleTypeId ||
              linkedTripObj.vehicleTier ||
              'standard',
            passengerCount: linkedTripObj.passenger?.passengerCount,
            luggageCount: linkedTripObj.passenger?.luggageCount,
            totalFare: linkedTripObj.pricing?.totalFare || 0,
            flightDetails: ((linkedTripObj.metadata as any)?.flightNumber || (linkedTripObj.metadata as any)?.tailNumber) ? {
              airlineName: (linkedTripObj.metadata as any)?.airlineName || (linkedTripObj.metadata as any)?.airline,
              flightNumber: (linkedTripObj.metadata as any)?.flightNumber,
              departureAirport: (linkedTripObj.metadata as any)?.departureAirport || (linkedTripObj.metadata as any)?.flightOrigin,
              tailNumber: (linkedTripObj.metadata as any)?.tailNumber,
              fboFacility: (linkedTripObj.metadata as any)?.fboFacility,
              isPrivateAviation: Boolean((linkedTripObj.metadata as any)?.isPrivateAviation || (linkedTripObj.metadata as any)?.tailNumber),
              hasCheckedLuggage: Boolean((linkedTripObj.metadata as any)?.hasCheckedLuggage),
              isAirportTrip: Boolean((linkedTripObj.metadata as any)?.isAirportTrip),
            } : undefined,
          }
        : undefined;

      const resolvedVehTier =
        (reviewMeta.vehicleTypeId as string) ||
        reviewTrip.vehicleTier ||
        (reviewMeta.vehiclePreference as string) ||
        'standard';
      const resolvedVehName = formatVehicleTier(
        resolvedVehTier,
        settings.vehicles,
        reviewMeta.vehicleDisplayName as string | undefined
      );
      const effectiveConfirmedEmail = (targetOverride || reviewTrip.passenger.email || '').trim();

      const emailResult = effectiveConfirmedEmail
        ? await emailService.sendBookingConfirmation({
            tripId: reviewTrip.id,
            trackingToken: reviewTrip.trackingToken,
            status: 'CONFIRMED',
            passenger: {
              firstName: reviewTrip.passenger.firstName,
              lastName: reviewTrip.passenger.lastName,
              email: targetOverride && shouldUpdatePassengerEmail ? targetOverride : reviewTrip.passenger.email,
              phone: reviewTrip.passenger.phone,
            },
            recipientEmailOverride: targetOverride,
            pickupAddress: reviewTrip.pickupLocation.address,
            intermediateStops: reviewTrip.intermediateStops?.map((s) => ({ address: s.address, notes: s.notes })),
            dropoffAddress: reviewTrip.dropoffLocation.address,
            dropoffNotes: reviewTrip.dropoffLocation.notes,
            pickupTime:
              reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
                ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
                : 'Immediate Ride (ASAP)',
            bookingType: reviewTrip.bookingType,
            vehicleTier: resolvedVehTier,
            vehicleDisplayName: resolvedVehName,
            passengerCount: reviewTrip.passenger.passengerCount,
            luggageCount: reviewTrip.passenger.luggageCount,
            contactPerson: reviewMeta.contactPerson
              ? (reviewMeta.contactPerson as any)
              : (reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName)
              ? {
                  isBookerDifferent: Boolean(reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName),
                  contactName: reviewMeta.bookerName || reviewMeta.contactName,
                  contactPhone: reviewMeta.bookerPhone || reviewMeta.contactPhone,
                  contactEmail: reviewMeta.bookerEmail || reviewMeta.contactEmail,
                  contactRole: reviewMeta.bookerRole || reviewMeta.contactRole,
                }
              : undefined,
            carSeatsBreakdown: reviewMeta.carSeatsBreakdown ? (reviewMeta.carSeatsBreakdown as any) : undefined,
            additionalPassengers: reviewMeta.additionalPassengers ? (reviewMeta.additionalPassengers as any) : undefined,
            totalFare: reviewTrip.pricing?.totalFare || 0,
            breakdown: reviewTrip.pricing?.breakdown,
            tariffProfileName:
              reviewTrip.pricing?.matchedCorridorName || reviewTrip.pricing?.tariffProfileName,
            currency: reviewTrip.pricing?.currency || 'USD',
            paymentMethod: reviewTrip.payment?.method || 'cash',
            specialRequests: reviewTrip.passenger.specialRequests,
            oversizedBags: reviewMeta.oversizedBags as Record<string, number> | undefined,
            oversizedItemsSummary: reviewMeta.oversizedItemsSummary as string | undefined,
            customExtrasSummary: reviewMeta.customExtrasSummary as string | undefined,
            pickupNotes: (reviewMeta.pickupLocationDescription as string | undefined) || reviewTrip.pickupLocation.notes,
            flightDetails: outboundFlightDetails,
            returnTripDetails: shouldConfirmBoth ? returnTripPayload : undefined,
            companySettings: {
              name: settings.company?.name,
              phone: settings.company?.phone,
              address: settings.company?.address,
              email: settings.company?.email,
            },
          })
        : { success: true, skipped: true, error: undefined as string | undefined };

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '2001';
      const emailRef = `EML-${numPart}-${Math.floor(100 + Math.random() * 900)}`;
      const confRef = `CNF-${numPart}`;

      let latestAuditLog = reviewTrip.auditLog || [];
      try {
        const fresh = await bookingService.getBookingStatus(reviewTrip.id);
        if (fresh?.trip?.auditLog) latestAuditLog = fresh.trip.auditLog;
      } catch {}

      const newAuditEvents: TripAuditEvent[] = [
        ...latestAuditLog,
        {
          action: 'STATUS_CHANGED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: confRef,
          context: shouldConfirmBoth
            ? `Dispatcher confirmed round-trip (#${reviewTrip.id} & #${linkedLegId})`
            : 'Dispatcher confirmed reservation',
        },
        ...(effectiveConfirmedEmail
          ? [
              {
                action: 'EMAIL_LOGGED' as const,
                timestamp: nowIso,
                actorRole: 'system' as const,
                referenceNumber: emailRef,
                context: emailResult.success
                  ? `Dispatched confirmation receipt & live tracking link to ${effectiveConfirmedEmail}${targetOverride ? ' (Alternate Override)' : ''}`
                  : `Confirmation email delivery failed for ${effectiveConfirmedEmail}: ${emailResult.error || 'Email service error'}`,
              },
            ]
          : []),
      ];

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          status: 'CONFIRMED',
          auditLog: newAuditEvents,
          ...(targetOverride && shouldUpdatePassengerEmail
            ? { passenger: { ...reviewTrip.passenger, email: targetOverride } }
            : {}),
        });
        if (shouldConfirmBoth && linkedLegId) {
          let latestLinkedAudit = linkedTripObj?.auditLog || [];
          try {
            const freshLinked = await bookingService.getBookingStatus(linkedLegId);
            if (freshLinked?.trip?.auditLog) latestLinkedAudit = freshLinked.trip.auditLog;
          } catch {}
          const linkedAudit: TripAuditEvent[] = [
            ...latestLinkedAudit,
            {
              action: 'STATUS_CHANGED',
              timestamp: nowIso,
              actorRole: 'dispatcher',
              referenceNumber: `CNF-${linkedLegId.replace(/[^0-9]/g, '').slice(-4) || '2002'}`,
              context: `Confirmed as part of round-trip reservation with #${reviewTrip.id}`,
            },
          ];
          await bookingService.updateTrip(linkedLegId, {
            status: 'CONFIRMED',
            auditLog: linkedAudit,
          });
        }
      }

      const updatedConfirmedTrip: Trip = {
        ...reviewTrip,
        status: 'CONFIRMED' as TripStatus,
        auditLog: newAuditEvents,
        ...(targetOverride && shouldUpdatePassengerEmail
          ? { passenger: { ...reviewTrip.passenger, email: targetOverride } }
          : {}),
      };

      onTripsChange((prev) =>
        prev.map((t) => {
          if (t.id === reviewTrip.id) {
            return updatedConfirmedTrip;
          }
          if (shouldConfirmBoth && t.id === linkedLegId) {
            return { ...t, status: 'CONFIRMED' as TripStatus };
          }
          return t;
        })
      );
      onReviewTripChange(updatedConfirmedTrip);

      if (
        settings.dispatchAutomation?.autoOfferOnConfirm &&
        !updatedConfirmedTrip.assignedDriverId &&
        onStartAutoOffer
      ) {
        void Promise.resolve(onStartAutoOffer(updatedConfirmedTrip)).catch(() => {});
        if (shouldConfirmBoth && linkedTripObj && !linkedTripObj.assignedDriverId) {
          void Promise.resolve(
            onStartAutoOffer({ ...linkedTripObj, status: 'CONFIRMED' })
          ).catch(() => {});
        }
      }

      if (!emailResult.success) {
        setReviewAlert({
          type: 'error',
          message: `Booking #${reviewTrip.id} confirmed, but email delivery failed: ${emailResult.error || 'Email service error'}`,
        });
        return;
      }

      setReviewAlert({
        type: 'success',
        message: shouldConfirmBoth
          ? `Round-trip reservations #${reviewTrip.id} & #${linkedLegId} confirmed! Confirmation dispatched to ${effectiveConfirmedEmail}.`
          : `Booking #${reviewTrip.id} confirmed! Confirmation email dispatched to ${effectiveConfirmedEmail}.`,
      });
      setTimeout(() => {
        onReviewTripChange(null);
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to confirm trip:', err);
      setReviewAlert({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to confirm trip.',
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!reviewTrip) return;
    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      const bookingService = getBookingService();
      const reviewMeta = (reviewTrip.metadata || {}) as Record<string, any>;
      const emailService = getEmailDispatchService();

      const linkedLegId =
        (reviewMeta.hasReturnTrip && reviewMeta.returnTripId) ||
        (reviewMeta.isReturnRide && reviewMeta.linkedTripId) ||
        reviewTrip.linkedReturnTripId ||
        reviewTrip.linkedTripId;

      const shouldIncludeReturn = Boolean(confirmScope === 'both' && linkedLegId);
      const linkedTripObj = shouldIncludeReturn ? trips.find((t) => t.id === linkedLegId) : null;

      const targetOverride = (isOverrideEmailEnabled && overrideRecipientEmail.trim()) ? overrideRecipientEmail.trim() : undefined;

      if (targetOverride && shouldUpdatePassengerEmail && bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          passenger: {
            ...reviewTrip.passenger,
            email: targetOverride,
          },
        });
      }

      const outboundFlightDetails = (reviewMeta.flightNumber || reviewMeta.airline || reviewMeta.airlineName || reviewMeta.tailNumber)
        ? {
            flightNumber: reviewMeta.flightNumber ? String(reviewMeta.flightNumber) : undefined,
            airlineName: (reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode) ? String(reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode) : undefined,
            departureAirport: reviewMeta.flightOrigin || reviewMeta.departureAirport ? String(reviewMeta.flightOrigin || reviewMeta.departureAirport) : undefined,
            tailNumber: reviewMeta.tailNumber ? String(reviewMeta.tailNumber) : undefined,
            fboFacility: reviewMeta.fboFacility ? String(reviewMeta.fboFacility) : undefined,
            isPrivateAviation: Boolean(reviewMeta.isPrivateAviation || reviewMeta.tailNumber || reviewMeta.fboFacility),
            hasCheckedLuggage: Boolean(reviewMeta.hasCheckedLuggage),
            isAirportTrip: Boolean(reviewMeta.isAirportTrip),
          }
        : undefined;

      const returnTripPayload = linkedTripObj
        ? {
            tripId: linkedTripObj.id,
            pickupAddress: linkedTripObj.pickupLocation.address,
            dropoffAddress: linkedTripObj.dropoffLocation.address,
            pickupTime:
              linkedTripObj.bookingType === 'scheduled' && linkedTripObj.scheduledPickupTime
                ? new Date(linkedTripObj.scheduledPickupTime).toLocaleString()
                : 'Scheduled Return',
            vehicleTier:
              (linkedTripObj.metadata as any)?.vehicleTypeId ||
              linkedTripObj.vehicleTier ||
              'standard',
            passengerCount: linkedTripObj.passenger?.passengerCount,
            luggageCount: linkedTripObj.passenger?.luggageCount,
            totalFare: linkedTripObj.pricing?.totalFare || 0,
            flightDetails: ((linkedTripObj.metadata as any)?.flightNumber || (linkedTripObj.metadata as any)?.tailNumber) ? {
              airlineName: (linkedTripObj.metadata as any)?.airlineName || (linkedTripObj.metadata as any)?.airline,
              flightNumber: (linkedTripObj.metadata as any)?.flightNumber,
              departureAirport: (linkedTripObj.metadata as any)?.departureAirport || (linkedTripObj.metadata as any)?.flightOrigin,
              tailNumber: (linkedTripObj.metadata as any)?.tailNumber,
              fboFacility: (linkedTripObj.metadata as any)?.fboFacility,
              isPrivateAviation: Boolean((linkedTripObj.metadata as any)?.isPrivateAviation || (linkedTripObj.metadata as any)?.tailNumber),
              hasCheckedLuggage: Boolean((linkedTripObj.metadata as any)?.hasCheckedLuggage),
              isAirportTrip: Boolean((linkedTripObj.metadata as any)?.isAirportTrip),
            } : undefined,
          }
        : undefined;

      const effectiveRecipient = (targetOverride || reviewTrip.passenger.email || '').trim();
      if (!effectiveRecipient) {
        setReviewAlert({
          type: 'error',
          message: 'No passenger email on file. Enable "Override Recipient Email" to send a copy.',
        });
        return;
      }

      const resolvedVehTier =
        (reviewMeta.vehicleTypeId as string) ||
        reviewTrip.vehicleTier ||
        (reviewMeta.vehiclePreference as string) ||
        'standard';
      const resolvedVehName = formatVehicleTier(
        resolvedVehTier,
        settings.vehicles,
        reviewMeta.vehicleDisplayName as string | undefined
      );

      const emailResult = await emailService.sendBookingConfirmation({
        tripId: reviewTrip.id,
        trackingToken: reviewTrip.trackingToken,
        status: reviewTrip.status || 'CONFIRMED',
        passenger: {
          firstName: reviewTrip.passenger.firstName,
          lastName: reviewTrip.passenger.lastName,
          email: targetOverride && shouldUpdatePassengerEmail ? targetOverride : reviewTrip.passenger.email,
          phone: reviewTrip.passenger.phone,
        },
        recipientEmailOverride: targetOverride,
        pickupAddress: reviewTrip.pickupLocation.address,
        intermediateStops: reviewTrip.intermediateStops?.map((s) => ({ address: s.address, notes: s.notes })),
        dropoffAddress: reviewTrip.dropoffLocation.address,
        dropoffNotes: reviewTrip.dropoffLocation.notes,
        pickupTime:
          reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
            ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
        bookingType: reviewTrip.bookingType,
        vehicleTier: resolvedVehTier,
        vehicleDisplayName: resolvedVehName,
        passengerCount: reviewTrip.passenger.passengerCount,
        luggageCount: reviewTrip.passenger.luggageCount,
        contactPerson: reviewMeta.contactPerson
          ? (reviewMeta.contactPerson as any)
          : (reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName)
          ? {
              isBookerDifferent: Boolean(reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName),
              contactName: reviewMeta.bookerName || reviewMeta.contactName,
              contactPhone: reviewMeta.bookerPhone || reviewMeta.contactPhone,
              contactEmail: reviewMeta.bookerEmail || reviewMeta.contactEmail,
              contactRole: reviewMeta.bookerRole || reviewMeta.contactRole,
            }
          : undefined,
        carSeatsBreakdown: reviewMeta.carSeatsBreakdown ? (reviewMeta.carSeatsBreakdown as any) : undefined,
        additionalPassengers: reviewMeta.additionalPassengers ? (reviewMeta.additionalPassengers as any) : undefined,
        totalFare: reviewTrip.pricing?.totalFare || 0,
        breakdown: reviewTrip.pricing?.breakdown,
        tariffProfileName:
          reviewTrip.pricing?.matchedCorridorName || reviewTrip.pricing?.tariffProfileName,
        currency: reviewTrip.pricing?.currency || 'USD',
        paymentMethod: reviewTrip.payment?.method || 'cash',
        specialRequests: reviewTrip.passenger.specialRequests,
        oversizedBags: reviewMeta.oversizedBags as Record<string, number> | undefined,
        oversizedItemsSummary: reviewMeta.oversizedItemsSummary as string | undefined,
        customExtrasSummary: reviewMeta.customExtrasSummary as string | undefined,
        pickupNotes: (reviewMeta.pickupLocationDescription as string | undefined) || reviewTrip.pickupLocation.notes,
        flightDetails: outboundFlightDetails,
        returnTripDetails: shouldIncludeReturn ? returnTripPayload : undefined,
        companySettings: {
          name: settings.company?.name,
          phone: settings.company?.phone,
          address: settings.company?.address,
          email: settings.company?.email,
        },
      });

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '2001';
      const emailRef = `EML-${numPart}-${Math.floor(100 + Math.random() * 900)}`;

      const newAuditEvents: TripAuditEvent[] = [
        ...(reviewTrip.auditLog || []),
        {
          action: 'EMAIL_LOGGED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: emailRef,
          context: emailResult.success
            ? `Resent confirmation email to ${effectiveRecipient}${targetOverride ? ' (Alternate Override)' : ''}`
            : `Resend confirmation email failed for ${effectiveRecipient}: ${emailResult.error || 'Email service error'}`,
        },
      ];

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          auditLog: newAuditEvents,
          ...(targetOverride && shouldUpdatePassengerEmail
            ? { passenger: { ...reviewTrip.passenger, email: targetOverride } }
            : {}),
        });
      }

      if (!emailResult.success) {
        setReviewAlert({
          type: 'error',
          message: emailResult.error || 'Failed to resend confirmation email.',
        });
        return;
      }

      const updatedTripObj: Trip = {
        ...reviewTrip,
        auditLog: newAuditEvents,
        ...(targetOverride && shouldUpdatePassengerEmail
          ? { passenger: { ...reviewTrip.passenger, email: targetOverride } }
          : {}),
      };

      onReviewTripChange(updatedTripObj);
      onTripsChange((prev) => prev.map((t) => (t.id === reviewTrip.id ? updatedTripObj : t)));
      setReviewAlert({
        type: 'success',
        message: `Confirmation email resent successfully to ${effectiveRecipient}.`,
      });
    } catch (err: any) {
      console.error('[DispatchReview] Failed to resend confirmation email:', err);
      setReviewAlert({
        type: 'error',
        message: err.message || 'Failed to resend confirmation email.',
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleSendContextualTripEmail = async () => {
    if (!reviewTrip) return;
    const metaInfo = getContextualEmailMeta(reviewTrip.status);
    if (metaInfo.kind === 'confirmation') {
      await handleResendConfirmation();
      return;
    }

    const targetOverride =
      isOverrideEmailEnabled && overrideRecipientEmail.trim()
        ? overrideRecipientEmail.trim()
        : undefined;

    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      await sendDispatchContextualTripEmail({
        targetTrip: reviewTrip,
        drivers,
        settings,
        recipientOverride: targetOverride,
        onAlert: setReviewAlert,
        onToast: onShowToast,
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleDeclineTrip = async () => {
    if (!reviewTrip) return;
    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      const reviewMeta = (reviewTrip.metadata || {}) as Record<string, any>;
      const isReturnRide = Boolean(reviewMeta.isReturnRide || reviewMeta.linkedTripId);
      const linkedLegId =
        (reviewMeta.hasReturnTrip && reviewMeta.returnTripId) ||
        (reviewMeta.isReturnRide && reviewMeta.linkedTripId) ||
        reviewTrip.linkedReturnTripId ||
        reviewTrip.linkedTripId;

      const hasLinkedLeg = Boolean(linkedLegId);
      const shouldDeclineBoth = hasLinkedLeg && declineScope === 'both';

      const legScopeParam: 'outbound' | 'return' | 'roundtrip' | undefined = hasLinkedLeg
        ? (shouldDeclineBoth ? 'roundtrip' : (isReturnRide ? 'return' : 'outbound'))
        : undefined;

      const reasonToSave =
        selectedDeclineReason === 'Custom reason'
          ? reviewCustomNotes.trim() || 'Trip request declined by dispatch'
          : selectedDeclineReason;

      const bookingService = getBookingService();
      if (bookingService.updateTripStatus) {
        await bookingService.updateTripStatus(reviewTrip.id, 'DECLINED', {
          actorRole: 'admin',
          reason: reasonToSave,
        });
        if (shouldDeclineBoth && linkedLegId) {
          await bookingService.updateTripStatus(linkedLegId, 'DECLINED', {
            actorRole: 'admin',
            reason: `Round-trip cancelled by dispatch: ${reasonToSave}`,
          });
        }
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, { status: 'DECLINED' });
        if (shouldDeclineBoth && linkedLegId) {
          await bookingService.updateTrip(linkedLegId, { status: 'DECLINED' });
        }
      }

      const emailService = getEmailDispatchService();
      const declineEmailResult = await emailService.sendBookingDeclined({
        tripId: reviewTrip.id,
        passenger: {
          firstName: reviewTrip.passenger.firstName,
          lastName: reviewTrip.passenger.lastName,
          email: reviewTrip.passenger.email,
          phone: reviewTrip.passenger.phone,
        },
        pickupAddress: reviewTrip.pickupLocation.address,
        dropoffAddress: reviewTrip.dropoffLocation.address,
        pickupTime:
          reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
            ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
        vehicleTier: reviewTrip.vehicleTier,
        reason: selectedDeclineReason,
        customNotes: reviewCustomNotes.trim() || undefined,
        legScope: legScopeParam,
        linkedTripId: hasLinkedLeg && !shouldDeclineBoth ? linkedLegId : undefined,
      });

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '3001';
      const emailRef = `EML-${numPart}-${Math.floor(100 + Math.random() * 900)}`;
      const decRef = `DEC-${numPart}`;

      let latestDeclineAudit = reviewTrip.auditLog || [];
      try {
        const fresh = await bookingService.getBookingStatus(reviewTrip.id);
        if (fresh?.trip?.auditLog) latestDeclineAudit = fresh.trip.auditLog;
      } catch {}

      const newAuditEvents: TripAuditEvent[] = [
        ...latestDeclineAudit,
        {
          action: 'STATUS_CHANGED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: decRef,
          context: `Dispatcher declined booking (${legScopeParam || 'single'}): ${reasonToSave}`,
        },
        {
          action: 'EMAIL_LOGGED',
          timestamp: nowIso,
          actorRole: 'system',
          referenceNumber: emailRef,
          context: declineEmailResult.success
            ? `Sent decline notice email to ${reviewTrip.passenger.email}`
            : `Decline notice email failed for ${reviewTrip.passenger.email}: ${declineEmailResult.error || 'Email service error'}`,
        },
      ];

      if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          status: 'DECLINED',
          auditLog: newAuditEvents,
        });
        if (shouldDeclineBoth && linkedLegId) {
          let latestLinkedAudit = trips.find((t) => t.id === linkedLegId)?.auditLog || [];
          try {
            const freshLinked = await bookingService.getBookingStatus(linkedLegId);
            if (freshLinked?.trip?.auditLog) latestLinkedAudit = freshLinked.trip.auditLog;
          } catch {}
          const linkedAudit: TripAuditEvent[] = [
            ...latestLinkedAudit,
            {
              action: 'STATUS_CHANGED',
              timestamp: nowIso,
              actorRole: 'dispatcher',
              referenceNumber: `DEC-${linkedLegId.replace(/[^0-9]/g, '').slice(-4) || '3002'}`,
              context: `Round-trip leg declined along with #${reviewTrip.id}: ${reasonToSave}`,
            },
          ];
          await bookingService.updateTrip(linkedLegId, {
            status: 'DECLINED',
            auditLog: linkedAudit,
          });
        }
      }

      onTripsChange((prev) =>
        prev.map((t) => {
          if (t.id === reviewTrip.id) {
            return { ...t, status: 'DECLINED' as TripStatus, auditLog: newAuditEvents };
          }
          if (shouldDeclineBoth && t.id === linkedLegId) {
            return { ...t, status: 'DECLINED' as TripStatus };
          }
          return t;
        })
      );

      setReviewAlert({
        type: 'success',
        message: shouldDeclineBoth
          ? `Round-trip reservations #${reviewTrip.id} & #${linkedLegId} declined. Notification email sent to ${reviewTrip.passenger.email}.`
          : `Booking #${reviewTrip.id} declined. Notification email sent to ${reviewTrip.passenger.email}.`,
      });
      setTimeout(() => {
        onReviewTripChange(null);
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to decline trip:', err);
      setReviewAlert({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to decline trip.',
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleSendClarificationRequest = async () => {
    if (!reviewTrip) return;
    if (!clarifyMessage.trim()) {
      setReviewAlert({
        type: 'error',
        message: 'Please provide a clear question or description for the passenger.',
      });
      return;
    }
    setIsProcessingReview(true);
    setReviewAlert(null);
    try {
      const emailService = getEmailDispatchService();
      const reviewMeta = (reviewTrip.metadata || {}) as Record<string, any>;
      const isReturn = Boolean(reviewMeta.isReturnRide || reviewMeta.linkedTripId);
      const legScopeVal = (reviewMeta.hasReturnTrip || reviewMeta.isReturnRide)
        ? (isReturn ? 'return' : 'outbound')
        : undefined;

      const clarifyEmailResult = await emailService.sendClarificationRequest({
        tripId: reviewTrip.id,
        passenger: {
          firstName: reviewTrip.passenger.firstName,
          lastName: reviewTrip.passenger.lastName,
          email: reviewTrip.passenger.email,
          phone: reviewTrip.passenger.phone,
        },
        pickupAddress: reviewTrip.pickupLocation.address,
        dropoffAddress: reviewTrip.dropoffLocation.address,
        pickupTime:
          reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
            ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
            : 'Immediate Ride (ASAP)',
        clarificationTopic: clarifyTopic,
        customMessage: clarifyMessage.trim(),
        legScope: legScopeVal as any,
        companySettings: {
          name: settings.company?.name || COMPANY_CONFIG.name,
          phone: settings.company?.phone || COMPANY_CONFIG.phone.primary || COMPANY_CONFIG.phone.dispatch,
          address: settings.company?.address || COMPANY_CONFIG.address.formatted,
          email: settings.company?.email || COMPANY_CONFIG.email.dispatch || COMPANY_CONFIG.email.support,
        },
      });

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '4001';
      if (!clarifyEmailResult.success) {
        throw new Error(clarifyEmailResult.error || 'Failed to send clarification request email.');
      }
      const reqRef = `REQ-${numPart}`;
      const newAuditEvents: TripAuditEvent[] = [
        ...(reviewTrip.auditLog || []),
        {
          action: 'EMAIL_LOGGED',
          timestamp: nowIso,
          actorRole: 'dispatcher',
          referenceNumber: reqRef,
          context: `Clarification request sent to ${reviewTrip.passenger.email}: [${clarifyTopic}] ${clarifyMessage.trim()}`,
        },
      ];

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          auditLog: newAuditEvents,
        });
      }

      onTripsChange((prev) =>
        prev.map((t) => (t.id === reviewTrip.id ? ({ ...t, auditLog: newAuditEvents }) : t))
      );

      setReviewAlert({
        type: 'success',
        message: `Clarification request emailed to ${reviewTrip.passenger.email}.`,
      });
      setReviewClarifyMode(false);
      setClarifyMessage('');
    } catch (err: unknown) {
      console.error('Failed to send clarification request:', err);
      setReviewAlert({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send clarification request.',
      });
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleManualStatusOverride = async (trip: Trip, nextStatus: TripStatus) => {
    if (trip.status === nextStatus) return;
    if (nextStatus === 'completed') {
      onOpenCompleteTripModal(trip);
      return;
    }
    if (nextStatus === 'cancelled') {
      onPromptCancelTrip(trip);
      return;
    }
    setIsOverridingStatus(true);
    const bookingService = getBookingService();
    try {
      if (bookingService.updateTripStatus) {
        const actorLabel = user?.email || 'Dispatcher';
        await bookingService.updateTripStatus(trip.id, nextStatus, {
          actorRole: 'admin',
          reason: `Manual status override by ${actorLabel} (${trip.status} -> ${nextStatus})`,
        });
      } else if (bookingService.updateTrip) {
        await bookingService.updateTrip(trip.id, { status: nextStatus });
      }
      onTripsChange((prev) => prev.map((t) => (t.id === trip.id ? { ...t, status: nextStatus } : t)));
      onReviewTripChange((prev) => (prev && prev.id === trip.id ? { ...prev, status: nextStatus } : prev));
      const pretty = nextStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      onShowToast(`Trip #${trip.id.slice(-6).toUpperCase()} status set to ${pretty}.`, 'success');
    } catch (err) {
      console.error('Manual status override failed:', err);
      onShowToast('Failed to update trip status.', 'error');
    } finally {
      setIsOverridingStatus(false);
    }
  };

  const handleApplyDriverPricingRule = async () => {
    if (!driverModalTrip) return;
    const rule = driverPermittedRules.find((r) => r.id === selectedDriverRuleId);
    if (!rule) return;

    setIsApplyingDriverFare(true);
    try {
      let newFare = driverModalTrip.pricing?.totalFare || 0;
      if (rule.modifier.type === 'flat_override') {
        newFare = rule.modifier.value;
      } else if (rule.modifier.type === 'multiplier') {
        newFare = Math.round(newFare * rule.modifier.value * 100) / 100;
      } else if (rule.modifier.type === 'surcharge_flat') {
        newFare = Math.round((newFare + rule.modifier.value) * 100) / 100;
      } else if (rule.modifier.type === 'surcharge_percent') {
        newFare = Math.round((newFare * (1 + rule.modifier.value / 100)) * 100) / 100;
      }

      const existingRules = driverModalTrip.pricing?.appliedRuleNames || [];
      const updatedRules = Array.from(new Set([...existingRules, rule.name]));

      const updates: Partial<Trip> = {
        pricing: {
          ...driverModalTrip.pricing,
          totalFare: newFare,
          appliedRuleNames: updatedRules,
        },
        payment: {
          ...driverModalTrip.payment,
          amount: newFare,
        },
        metadata: {
          ...driverModalTrip.metadata,
          driverAppliedRule: {
            ruleId: rule.id,
            ruleName: rule.name,
            appliedAt: new Date().toISOString(),
          },
        },
      };

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(driverModalTrip.id, updates);
      }

      onTripsChange((prev) =>
        prev.map((t) => (t.id === driverModalTrip.id ? ({ ...t, ...updates } as Trip) : t))
      );
      onCloseDriverModal();
    } catch (err) {
      console.error('Failed to apply driver pricing rule:', err);
    } finally {
      setIsApplyingDriverFare(false);
    }
  };

  const handleApplyDriverFlatOverride = async () => {
    if (!driverModalTrip || !driverManualFare) return;
    const fareVal = parseFloat(driverManualFare);
    if (isNaN(fareVal) || fareVal <= 0) return;

    setIsApplyingDriverFare(true);
    try {
      const existingRules = driverModalTrip.pricing?.appliedRuleNames || [];
      const updatedRules = Array.from(new Set([...existingRules, `Driver Override: $${fareVal.toFixed(2)}`]));

      const updates: Partial<Trip> = {
        pricing: {
          ...driverModalTrip.pricing,
          totalFare: fareVal,
          appliedRuleNames: updatedRules,
        },
        payment: {
          ...driverModalTrip.payment,
          amount: fareVal,
        },
        metadata: {
          ...driverModalTrip.metadata,
          driverFareOverride: {
            originalFare: driverModalTrip.pricing?.totalFare,
            overrideFare: fareVal,
            reason: driverOverrideReason || 'Driver manual flat override',
            appliedAt: new Date().toISOString(),
          },
        },
      };

      const bookingService = getBookingService();
      if (bookingService.updateTrip) {
        await bookingService.updateTrip(driverModalTrip.id, updates);
      }

      onTripsChange((prev) =>
        prev.map((t) => (t.id === driverModalTrip.id ? ({ ...t, ...updates } as Trip) : t))
      );
      onCloseDriverModal();
    } catch (err) {
      console.error('Failed to apply driver flat override:', err);
    } finally {
      setIsApplyingDriverFare(false);
    }
  };

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
      onReviewTripChange((prev) => (prev && prev.id === trip.id ? { ...prev, ...nextTripPatch } : prev));
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

  return (
    <>
      {/* Driver Fare Adjustment & Permitted Rules Modal */}
      {driverModalTrip && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={onCloseDriverModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={driverFareSheetDrag.sheetStyle}
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-w-lg w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div
              {...driverFareSheetDrag.dragHandlers}
              className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 sm:pb-4 shrink-0 touch-none"
            >
              <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-amber-400 font-bold text-sm inline-flex items-center gap-1.5">
                      <BoltIcon className="w-4 h-4 shrink-0" />
                      <span>Driver Fare Console</span>
                    </span>
                    <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      Trip #{driverModalTrip.id.slice(-6).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Passenger: {driverModalTrip.passenger?.firstName} {driverModalTrip.passenger?.lastName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseDriverModal}
                  className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label="Close fare console"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Trip Snapshot */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pickup</div>
                <div className="text-slate-800 font-medium truncate" title={driverModalTrip.pickupLocation.address}>
                  {driverModalTrip.pickupLocation.address}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Dropoff</div>
                <div className="text-slate-800 font-medium truncate" title={driverModalTrip.dropoffLocation.address}>
                  {driverModalTrip.dropoffLocation.address}
                </div>
              </div>
              <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-600 font-medium">
                  Current Trip Total Fare:
                </span>
                <span className="text-sm font-extrabold text-blue-700 font-mono">
                  ${driverModalTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            {/* Tabs: Permitted Rule vs Manual Flat Override */}
            <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setDriverFareTab('rule')}
                className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
                  driverFareTab === 'rule'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Apply Permitted Rule
              </button>
              <button
                type="button"
                onClick={() => setDriverFareTab('flat')}
                className={`flex-1 py-1.5 text-center font-bold rounded-lg transition-all cursor-pointer ${
                  driverFareTab === 'flat'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Flat Fare Override
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              {driverFareTab === 'rule' ? (
                <div className="space-y-3">
                  <p className="text-slate-600 text-xs">
                    Select an authorized pricing rule permitted for in-car or on-trip driver selection:
                  </p>

                  {driverPermittedRules.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-center text-xs">
                      No pricing rules are currently flagged for driver selection in the Admin Rates Tab.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {driverPermittedRules.map((rule) => {
                        const isSelected = selectedDriverRuleId === rule.id;
                        return (
                          <div
                            key={rule.id}
                            onClick={() => setSelectedDriverRuleId(rule.id)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/70 shadow-2xs'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{rule.name}</span>
                              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-100 text-blue-800">
                                {rule.modifier.type === 'flat_override'
                                  ? `$${rule.modifier.value.toFixed(2)} Flat`
                                  : rule.modifier.type === 'multiplier'
                                  ? `${rule.modifier.value}x Multiplier`
                                  : rule.modifier.type === 'surcharge_flat'
                                  ? `+$${rule.modifier.value.toFixed(2)}`
                                  : `+${rule.modifier.value}%`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">{rule.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedDriverRuleId && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs">
                      <span className="font-bold">Calculated Preview: </span>
                      {(() => {
                        const r = driverPermittedRules.find((x) => x.id === selectedDriverRuleId);
                        if (!r) return null;
                        let calc = driverModalTrip.pricing?.totalFare || 0;
                        if (r.modifier.type === 'flat_override') calc = r.modifier.value;
                        else if (r.modifier.type === 'multiplier') calc = calc * r.modifier.value;
                        else if (r.modifier.type === 'surcharge_flat') calc = calc + r.modifier.value;
                        else if (r.modifier.type === 'surcharge_percent') calc = calc * (1 + r.modifier.value / 100);
                        return (
                          <span className="font-bold font-mono text-emerald-700">
                            New Fare: ${calc.toFixed(2)}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-600 text-xs">
                    Manually override the total fare for this trip. This will be recorded with driver audit metadata:
                  </p>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Flat Fare Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={driverManualFare}
                      onChange={(e) => setDriverManualFare(e.target.value)}
                      placeholder="e.g. 45.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Reason / Notes (Optional)</label>
                    <input
                      type="text"
                      value={driverOverrideReason}
                      onChange={(e) => setDriverOverrideReason(e.target.value)}
                      placeholder="e.g. Severe weather detour, agreed customer flat"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onCloseDriverModal}
                className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              {driverFareTab === 'rule' ? (
                <button
                  type="button"
                  disabled={!selectedDriverRuleId || isApplyingDriverFare}
                  onClick={handleApplyDriverPricingRule}
                  className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                >
                  {isApplyingDriverFare ? 'Applying...' : 'Apply Rule to Trip'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!driverManualFare || isApplyingDriverFare}
                  onClick={handleApplyDriverFlatOverride}
                  className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                >
                  {isApplyingDriverFare ? 'Applying...' : 'Apply Flat Fare'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DISPATCHER REVIEW ACTION MODAL (UNCONFIRMED Bookings & Trip Details)
      ───────────────────────────────────────────────────────────── */}
      {reviewTrip && (() => {
        const isUnconfirmedTrip = reviewTrip.status === 'UNCONFIRMED' || reviewTrip.status === 'unconfirmed';
        const tripMeta = (reviewTrip.metadata || {}) as Record<string, any>;
        const carSeatsBreakdown = (tripMeta.carSeatsBreakdown || {}) as {
          rearFacing?: number;
          frontFacing?: number;
          booster?: number;
        };
        const bookerName = tripMeta.bookerName ? String(tripMeta.bookerName) : null;
        const bookerPhone = tripMeta.bookerPhone ? String(tripMeta.bookerPhone) : null;
        const corporateOrgName = tripMeta.corporateOrgName ? String(tripMeta.corporateOrgName) : null;
        const flightNumber = tripMeta.flightNumber ? String(tripMeta.flightNumber) : null;
        const airline = tripMeta.airline || tripMeta.airlineName ? String(tripMeta.airline || tripMeta.airlineName) : '';
        const flightOrigin = tripMeta.flightOrigin || tripMeta.departureAirport ? String(tripMeta.flightOrigin || tripMeta.departureAirport) : null;
        const tailNumber = tripMeta.tailNumber ? String(tripMeta.tailNumber) : null;
        const fboFacility = tripMeta.fboFacility ? String(tripMeta.fboFacility) : null;
        const isPrivateAviation = Boolean(tripMeta.isPrivateAviation || tailNumber || fboFacility);
        const hasCheckedLuggage = Boolean(tripMeta.hasCheckedLuggage);
        const isReturnRide = Boolean(tripMeta.isReturnRide || tripMeta.linkedTripId);
        const hasReturnTrip = Boolean(tripMeta.hasReturnTrip || tripMeta.returnTripId);
        const returnTripId = tripMeta.returnTripId ? String(tripMeta.returnTripId) : null;
        const linkedTripId = tripMeta.linkedTripId ? String(tripMeta.linkedTripId) : null;
        const linkedLegId = isReturnRide ? linkedTripId : returnTripId;
        const hasLinkedLeg = Boolean(linkedLegId);
        const luggageType = tripMeta.luggageType ? String(tripMeta.luggageType) : 'Standard';
        const oversizedLuggageNotes = tripMeta.oversizedLuggageNotes ? String(tripMeta.oversizedLuggageNotes) : null;
        const hasOversizedLuggage = Boolean(tripMeta.hasOversizedLuggage);

        return (
          <FloatingWindow
            id={`trip_review_details_${reviewTrip.id}`}
            isOpen={Boolean(reviewTrip)}
            onClose={() => onReviewTripChange(null)}
            title={isUnconfirmedTrip ? 'Review Web Booking' : 'Trip Details & History'}
            subtitle={`Trip #${reviewTrip.id} • Created ${new Date(reviewTrip.createdAt || Date.now()).toLocaleTimeString()}`}
            icon={
              isUnconfirmedTrip ? (
                <DocumentTextIcon className="w-4 h-4 text-blue-400" />
              ) : (
                <ShieldCheckIcon className="w-4 h-4 text-purple-400" />
              )
            }
            headerExtra={
              <div className="flex items-center gap-1.5 flex-wrap mr-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  isUnconfirmedTrip
                    ? 'bg-amber-400 text-slate-950 animate-pulse'
                    : (reviewTrip.status || '').toUpperCase() === 'CONFIRMED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : (reviewTrip.status === 'cancelled' || reviewTrip.status === 'declined' || reviewTrip.status === 'DECLINED')
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}>
                  {reviewTrip.status}
                </span>
                {isReturnRide ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500 text-white uppercase tracking-wider">
                    <RepeatIcon className="w-3 h-3" />
                    <span>Return Leg {linkedTripId ? `(#${linkedTripId})` : ''}</span>
                  </span>
                ) : hasReturnTrip ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500 text-white uppercase tracking-wider">
                    <RepeatIcon className="w-3 h-3" />
                    <span>Outbound Leg {returnTripId ? `(Return #${returnTripId})` : ''}</span>
                  </span>
                ) : null}
              </div>
            }
            initialSize={{ width: 840, height: 740 }}
            minWidth={520}
            minHeight={420}
            hasBackdrop={false}
            isDraggable={true}
            isResizable={true}
            isMinimizable={true}
            isMaximizable={true}
            zIndex={120}
          >
            {/* Navigation Tabs Header */}
            <div className="bg-slate-900/95 px-4 sm:px-6 border-b border-slate-800 flex items-center gap-2 shrink-0 sticky top-0 z-10 overflow-x-auto">
              <button
                type="button"
                onClick={() => onReviewModalTabChange('details')}
                className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  reviewModalTab === 'details'
                    ? 'border-blue-500 text-white bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <DocumentTextIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>Booking Details</span>
              </button>
              <button
                type="button"
                onClick={() => onReviewModalTabChange('audit')}
                className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                  reviewModalTab === 'audit'
                    ? 'border-purple-500 text-white bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>Audit Trail</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                  {reviewTrip.auditLog?.length || 0}
                </span>
              </button>
            </div>

            {/* Notification alert banner */}
            {reviewAlert && (
              <div
                className={`px-5 py-3 text-xs font-bold flex items-center gap-2 shrink-0 ${
                  reviewAlert.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                    : 'bg-red-50 text-red-800 border-b border-red-200'
                }`}
              >
                {reviewAlert.type === 'success' ? (
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{reviewAlert.message}</span>
              </div>
            )}

            {/* Modal Content */}
            {reviewModalTab === 'audit' ? (
              <div className="p-6 overflow-y-auto flex-1">
                <TripAuditTimeline trip={reviewTrip} hideSummaryBar={false} />
              </div>
            ) : (
              <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
                {/* Linked Multi-Car Convoy Banner Card */}
                {(() => {
                  const mMeta = (reviewTrip.metadata || {}) as Record<string, any>;
                  const mcGroupId =
                    reviewTrip.multiCarGroupId ||
                    (typeof mMeta.multiCarGroupId === 'string' ? mMeta.multiCarGroupId : undefined);
                  const mcTotal = Number(
                    reviewTrip.multiCarTotal || mMeta.multiCarTotal || reviewTrip.vehicleCount || 1
                  );
                  const mcIndex = Number(reviewTrip.multiCarIndex || mMeta.multiCarIndex || 1);
                  if (!(mcGroupId || reviewTrip.multipleVehiclesRequested) || mcTotal <= 1) return null;

                  const siblingTrips = mcGroupId
                    ? trips
                        .filter((t) => t.multiCarGroupId === mcGroupId)
                        .sort((a, b) => (a.multiCarIndex || 0) - (b.multiCarIndex || 0))
                    : [];
                  const associates = Array.isArray(reviewTrip.multiCarAssociates)
                    ? [...reviewTrip.multiCarAssociates].sort((a, b) => (a.carIndex || 0) - (b.carIndex || 0))
                    : [];
                  const totalPax = Number(mMeta.multiCarTotalPassengers || 0);
                  const totalBags = Number(mMeta.multiCarTotalBags || 0);
                  const orderTotalFare =
                    typeof mMeta.multiCarOrderTotalFare === 'number' ? mMeta.multiCarOrderTotalFare : undefined;

                  return (
                    <div className="bg-violet-50/90 border border-violet-200 rounded-xl p-3.5 space-y-2.5 text-violet-950 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white">
                            Multi-Car · Car {mcIndex} of {mcTotal}
                          </span>
                          {mcGroupId && (
                            <span className="font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded border border-violet-200 text-violet-900">
                              {mcGroupId}
                            </span>
                          )}
                          {(totalPax > 0 || totalBags > 0) && (
                            <span className="text-[11px] font-semibold text-violet-800">
                              Combined Party: {totalPax || reviewTrip.passenger?.passengerCount || 1} {(totalPax || reviewTrip.passenger?.passengerCount || 1) === 1 ? 'Passenger' : 'Passengers'}
                              {totalBags > 0 ? ` · ${totalBags} ${totalBags === 1 ? 'Bag' : 'Bags'}` : ''}
                            </span>
                          )}
                        </div>
                        {typeof orderTotalFare === 'number' && (
                          <span className="text-xs font-mono font-extrabold text-violet-900">
                            Order Total: ${orderTotalFare.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {(siblingTrips.length > 0 || associates.length > 0) && (
                        <div className="space-y-1.5">
                          {(siblingTrips.length > 0
                            ? siblingTrips.map((st, idx) => ({
                                tripId: st.id,
                                carIndex: st.multiCarIndex || idx + 1,
                                driverName:
                                  (st.metadata as any)?.assignedDriverName ||
                                  drivers.find((d) => d.id === st.assignedDriverId)?.name ||
                                  (st.assignedDriverId ? `Driver ${st.assignedDriverId.slice(-4)}` : 'Unassigned'),
                                vehicleUnit:
                                  st.assignedVehicle?.vehicleNumber ||
                                  drivers.find((d) => d.id === st.assignedDriverId)?.cabNumber,
                                vehicleLabel: formatVehicleTierDisplay(
                                  (st.metadata as any)?.vehicleTypeId || st.vehicleTier,
                                  settings.vehicles,
                                  (st.metadata as any)?.vehicleDisplayName
                                ),
                                status: st.status,
                                fare: st.pricing?.totalFare,
                                tripObj: st,
                              }))
                            : associates.map((a) => ({
                                tripId: a.tripId,
                                carIndex: a.carIndex,
                                driverName:
                                  a.driverName ||
                                  (a.driverId ? `Driver ${a.driverId.slice(-4)}` : 'Unassigned'),
                                vehicleUnit: a.vehicleUnit,
                                vehicleLabel: formatVehicleTierDisplay(
                                  a.vehicleTier,
                                  settings.vehicles,
                                  a.vehicleDisplayName
                                ),
                                status: a.status || 'pending',
                                fare: undefined as number | undefined,
                                tripObj: trips.find((t) => t.id === a.tripId),
                              }))
                          ).map((car) => {
                            const isCurrent = car.tripId === reviewTrip.id;
                            return (
                              <div
                                key={car.tripId}
                                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-[11px] ${
                                  isCurrent
                                    ? 'bg-violet-100/80 border-violet-300'
                                    : 'bg-white border-violet-200/80'
                                }`}
                              >
                                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-violet-700">
                                    Car {car.carIndex}/{mcTotal}
                                  </span>
                                  <span className="font-bold text-slate-900">{car.driverName}</span>
                                  {car.vehicleUnit && car.vehicleUnit.toLowerCase() !== 'unassigned' && (
                                    <span className="font-mono text-[10px] text-slate-500">
                                      ({car.vehicleUnit})
                                    </span>
                                  )}
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                    {car.vehicleLabel}
                                  </span>
                                  {typeof car.fare === 'number' && (
                                    <span className="font-mono font-bold text-emerald-700">
                                      ${car.fare.toFixed(2)}
                                    </span>
                                  )}
                                  {isCurrent && (
                                    <span className="text-[9px] font-black uppercase text-violet-700">
                                      (Viewing)
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                    {car.status}
                                  </span>
                                  {!isCurrent && car.tripObj && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenReviewModal(car.tripObj!, reviewModalTab)}
                                      className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-700 text-white font-bold text-[10px] transition-colors cursor-pointer"
                                    >
                                      Switch →
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Linked Round-Trip Banner Card */}
                {hasLinkedLeg && (
                  <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        <RepeatIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-indigo-900 flex items-center gap-1.5">
                          <span>{isReturnRide ? 'Round-Trip Return Leg' : 'Round-Trip Outbound Leg'}</span>
                          <span className="bg-indigo-200/80 text-indigo-800 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                            Linked Leg #{linkedLegId}
                          </span>
                        </div>
                        <div className="text-[11px] text-indigo-700">
                          {isReturnRide
                            ? 'This ride was booked together with an outbound leg.'
                            : 'This ride has a linked return leg booked in the same reservation.'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const linked = trips.find((t) => t.id === linkedLegId);
                        if (linked) {
                          onOpenReviewModal(linked, reviewModalTab);
                        } else {
                          window.open(`/app/dispatch?tripId=${linkedLegId}`, '_blank');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shrink-0 shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>↗ Switch to {isReturnRide ? 'Outbound Leg' : 'Return Leg'} #{linkedLegId}</span>
                    </button>
                  </div>
                )}

                {/* Customer & Route Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Passenger Card */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Customer Details</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {reviewTrip.passenger.firstName} {reviewTrip.passenger.lastName}
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a href={`tel:${reviewTrip.passenger.phone}`} className="hover:underline font-mono text-blue-600">
                          {reviewTrip.passenger.phone}
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MailIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a href={`mailto:${reviewTrip.passenger.email}`} className="hover:underline font-mono text-blue-600">
                          {reviewTrip.passenger.email}
                        </a>
                      </div>
                      {bookerName && (
                        <div className="pt-1 text-[11px] text-slate-500">
                          <span className="font-semibold">Booker:</span> {bookerName} ({bookerPhone || 'No phone'})
                        </div>
                      )}
                      {corporateOrgName && (
                        <div className="pt-1 text-[11px] text-slate-500">
                          <span className="font-semibold">Corporate:</span> {corporateOrgName}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timing & Vehicle */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Schedule & Vehicle</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {reviewTrip.bookingType === 'scheduled' && reviewTrip.scheduledPickupTime
                        ? new Date(reviewTrip.scheduledPickupTime).toLocaleString()
                        : 'Immediate Dispatch (ASAP)'}
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <div>
                        <span className="font-semibold">Vehicle Class: </span>
                        <span className="font-bold text-slate-800">
                          {formatVehicleTier(
                            (reviewTrip.metadata as any)?.vehicleTypeId ||
                              reviewTrip.vehicleTier ||
                              (reviewTrip.metadata as any)?.vehiclePreference ||
                              'standard',
                            settings.vehicles,
                            (reviewTrip.metadata as any)?.vehicleDisplayName
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Estimated Fare: </span>
                        <span className="font-mono font-extrabold text-emerald-700 text-sm">
                          ${reviewTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>{' '}
                        <span className="text-[10px] text-slate-500 uppercase">({reviewTrip.payment?.method || 'Cash'})</span>
                      </div>
                      {(flightNumber || airline || tailNumber || fboFacility) && (
                        <div className="p-2.5 bg-blue-50/90 rounded-lg border border-blue-200 text-[11px] text-blue-950 space-y-1">
                          {isPrivateAviation ? (
                            <>
                              <div className="font-bold flex items-center gap-1.5 text-blue-900">
                                <PlaneIcon className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                <span>Private Aviation / FBO:</span>
                                <span className="font-extrabold text-blue-950">{fboFacility || 'Private Aviation'}</span>
                              </div>
                              {tailNumber && (
                                <div className="text-blue-800">
                                  Tail Number: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200">{tailNumber}</span>
                                </div>
                              )}
                              {flightOrigin && (
                                <div className="text-blue-800">
                                  Origin / FBO Base: <span className="font-semibold">{flightOrigin}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="font-bold flex items-center gap-1.5 text-blue-900">
                                <PlaneIcon className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                <span>Commercial Flight: {airline || 'Airline'} #{flightNumber || 'N/A'}</span>
                              </div>
                              {flightOrigin && (
                                <div className="text-blue-800">
                                  Departing From: <span className="font-semibold">{flightOrigin}</span>
                                </div>
                              )}
                              <div>
                                Checked Luggage: <span className="font-semibold">{hasCheckedLuggage ? 'Yes (Baggage Claim)' : 'No'}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Route */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Route</div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-800">Pickup: </span>
                        <span className="text-slate-700">{reviewTrip.pickupLocation.address}</span>
                      </div>
                    </div>
                    {reviewTrip.intermediateStops && reviewTrip.intermediateStops.length > 0 && (
                      <div className="pl-4 space-y-1 text-[11px] text-slate-600 border-l-2 border-slate-200 ml-1">
                        {reviewTrip.intermediateStops.map((stop, i) => (
                          <div key={i}>Stop {i + 1}: {stop.address}</div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-800">Dropoff: </span>
                        <span className="text-slate-700">{reviewTrip.dropoffLocation.address}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Equipment & Child Seats Breakdown */}
                <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2">
                  <div className="font-bold text-amber-900 uppercase tracking-wider text-[10px] flex items-center justify-between">
                    <span>Safety Equipment & Luggage Specification</span>
                    <span className="font-mono text-amber-700">
                      Passengers: {reviewTrip.passenger.passengerCount} • Luggage: {reviewTrip.passenger.luggageCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Infant (Rear)</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {carSeatsBreakdown.rearFacing ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Toddler (Front)</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {carSeatsBreakdown.frontFacing ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Youth Booster</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {carSeatsBreakdown.booster ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-100 text-center">
                      <div className="text-[10px] text-slate-500">Luggage Type</div>
                      <div className="font-bold text-xs capitalize text-slate-900 truncate">
                        {luggageType}
                      </div>
                    </div>
                  </div>
                  {(hasOversizedLuggage || tripMeta.oversizedItemsSummary) && (
                    <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-300 text-xs text-amber-950 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5">
                          <LuggageIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Oversized Cargo Breakdown:</span>
                        </span>
                        <span className="text-[10px] bg-amber-200 font-bold px-1.5 py-0.5 rounded text-amber-900 uppercase">
                          Special Cargo
                        </span>
                      </div>
                      <div className="font-semibold text-amber-900">
                        {tripMeta.oversizedItemsSummary || 'Special Oversized Cargo Declared'}
                      </div>
                      {oversizedLuggageNotes && (
                        <div className="text-[11px] text-amber-800 italic">
                          Notes: {oversizedLuggageNotes}
                        </div>
                      )}
                    </div>
                  )}
                  {tripMeta.customExtrasSummary && (
                    <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-950 space-y-0.5">
                      <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <SparklesIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Selected Extras &amp; Add-Ons</span>
                      </div>
                      <div className="font-semibold text-emerald-800">{String(tripMeta.customExtrasSummary)}</div>
                    </div>
                  )}
                  {reviewTrip.pricing && (
                    <PriceBreakdownPanel
                      outboundPricing={reviewTrip.pricing}
                      returnPricing={null}
                      outboundDisplayFare={reviewTrip.pricing.totalFare}
                      returnDisplayFare={null}
                      totalDisplayFare={reviewTrip.pricing.totalFare}
                      isRoundTrip={false}
                      vehicleLabel={formatVehicleTier(
                        (reviewTrip.metadata as any)?.vehicleTypeId || reviewTrip.vehicleTier || 'standard',
                        settings.vehicles,
                        (reviewTrip.metadata as any)?.vehicleDisplayName
                      )}
                    />
                  )}
                  {reviewTrip.passenger.specialRequests && (
                    <div className="p-2 bg-white rounded-lg border border-amber-200 text-[11px] text-slate-700">
                      <span className="font-bold">Special Requests: </span>
                      {reviewTrip.passenger.specialRequests}
                    </div>
                  )}
                </div>

                {/* Driver Operator Assignment */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <CarIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>Assigned Driver Operator</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <DispatchSlaBadge
                        sla={evaluateTripSlaUrgency(reviewTrip, settings.dispatchAutomation)}
                      />
                      <DispatchCascadePill
                        trip={reviewTrip}
                        onCancel={
                          onCancelAutoOffer ? () => onCancelAutoOffer(reviewTrip) : undefined
                        }
                      />
                      {reviewTrip.assignedDriverId ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                          Assigned
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                          <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                          <span>Unassigned</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={reviewTrip.assignedDriverId || 'unassigned'}
                      onChange={(e) => {
                        const newDriverId = e.target.value;
                        onQuickAssignDriver(reviewTrip.id, newDriverId);
                        onReviewTripChange((prev) =>
                          prev
                            ? {
                                ...prev,
                                assignedDriverId: newDriverId === 'unassigned' ? null : newDriverId,
                              }
                            : null
                        );
                      }}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer focus:ring-1 focus:ring-blue-500 shadow-2xs"
                    >
                      <option value="unassigned">Unassigned (No driver assigned)</option>
                      {drivers.map((drv) => (
                        <option
                          key={drv.id}
                          value={drv.id}
                          disabled={drv.isBlacklisted || drv.zone === 'Suspended'}
                        >
                          {drv.formattedLabel || formatDriverAssignmentLabel(drv)}
                        </option>
                      ))}
                    </select>

                    {isTripCascadeActive(reviewTrip) && onCancelAutoOffer ? (
                      <button
                        type="button"
                        onClick={() => onCancelAutoOffer(reviewTrip)}
                        className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      >
                        <XIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>Cancel Cascade</span>
                      </button>
                    ) : canTripTriggerAutoOffer(reviewTrip) && onStartAutoOffer ? (
                      <button
                        type="button"
                        onClick={() => onStartAutoOffer(reviewTrip)}
                        className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                        title="Rank eligible on-duty drivers and start sequential offer cascade"
                      >
                        <BoltIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {reviewTrip.offerCascade?.state === 'exhausted'
                            ? 'Retry Auto-Offer'
                            : 'Auto-Offer Best Driver'}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Manual Trip Status Override (Dispatch Recovery Controls) */}
                {!reviewDeclineMode && !reviewClarifyMode && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>Manual Status Override</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Current: <strong className="text-slate-900 capitalize">{reviewTrip.status.replace(/_/g, ' ')}</strong>
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
                            onClick={() => handleManualStatusOverride(reviewTrip, step.status)}
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
                )}

                {/* Round-Trip Scope Option when Confirming */}
                {hasLinkedLeg && !reviewDeclineMode && !reviewClarifyMode && (
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
                          onChange={() => setConfirmScope('both')}
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
                          onChange={() => setConfirmScope('leg')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Confirm This Leg Only (#{reviewTrip.id})</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 1-Tap Pay Link (Copy / SMS / Email) */}
                {!reviewDeclineMode &&
                  !reviewClarifyMode &&
                  reviewTrip.status.toLowerCase() !== 'cancelled' &&
                  reviewTrip.status.toLowerCase() !== 'declined' && (() => {
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
                              onClick={() => handleTripPayLinkAction('copy')}
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
                              onClick={() => handleTripPayLinkAction('sms')}
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
                              onClick={() => handleTripPayLinkAction('email')}
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
                              Settled (${(reviewTrip.payment?.amount ?? reviewTrip.pricing?.totalFare ?? 0).toFixed(2)})
                              {reviewTrip.payment?.receiptNumber
                                ? ` · Receipt ${reviewTrip.payment.receiptNumber}`
                                : ''}
                            </span>
                            {displayPayUrl && (
                              <button
                                type="button"
                                onClick={() => handleTripPayLinkAction('copy')}
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
                {!reviewDeclineMode && !reviewClarifyMode && (
                  <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-blue-900 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <MailIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>Email Delivery &amp; Confirmation</span>
                      </div>
                      <span className="text-[11px] text-slate-600 font-medium truncate max-w-[280px]">
                        Booking Email: <strong className="text-slate-900 font-mono">{reviewTrip.passenger.email}</strong>
                      </span>
                    </div>

                    <div className="pt-0.5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={isOverrideEmailEnabled}
                          onChange={(e) => {
                            setIsOverrideEmailEnabled(e.target.checked);
                            if (!e.target.checked) {
                              setOverrideRecipientEmail('');
                              setShouldUpdatePassengerEmail(false);
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
                            onChange={(e) => setOverrideRecipientEmail(e.target.value)}
                            placeholder="e.g. assistant@company.com or travel@firm.com"
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-blue-500 focus:bg-white focus:outline-hidden font-mono"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={shouldUpdatePassengerEmail}
                            onChange={(e) => setShouldUpdatePassengerEmail(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span>Permanently update passenger's profile email in booking record</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Decline View (if toggled) */}
                {reviewDeclineMode && (
                  <div className="p-4 bg-red-50 rounded-xl border border-red-200 space-y-3 animate-in fade-in duration-100">
                    <div className="font-bold text-red-900 flex items-center justify-between">
                      <span>Select Reason for Declining Booking</span>
                      <span className="text-[10px] text-red-700">Passenger will receive rejection notification</span>
                    </div>

                    <div className="space-y-1.5">
                      {[
                        'No driver availability for requested time',
                        'Outside standard operating service area',
                        'Vehicle class unavailable',
                        'Insufficient advance notice',
                        'Customer requested cancellation',
                        'Custom reason',
                      ].map((reason) => (
                        <label
                          key={reason}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                            selectedDeclineReason === reason
                              ? 'bg-white border-red-400 font-bold text-red-950 shadow-2xs'
                              : 'bg-red-50/50 border-red-100 text-red-800 hover:bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="declineReason"
                            value={reason}
                            checked={selectedDeclineReason === reason}
                            onChange={(e) => setSelectedDeclineReason(e.target.value)}
                            className="text-red-600 focus:ring-red-500"
                          />
                          <span>{reason}</span>
                        </label>
                      ))}
                    </div>

                    {hasLinkedLeg && (
                      <div className="pt-2 border-t border-red-200">
                        <label className="block text-red-900 font-bold mb-1.5 text-xs">
                          Round-Trip Decline Scope:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                              declineScope === 'leg'
                                ? 'bg-white border-red-400 font-bold text-red-950 shadow-2xs'
                                : 'bg-red-50/40 border-red-100 text-red-800 hover:bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name="declineScope"
                              value="leg"
                              checked={declineScope === 'leg'}
                              onChange={() => setDeclineScope('leg')}
                              className="text-red-600 focus:ring-red-500"
                            />
                            <span>Decline this leg only (keep #{linkedLegId} active)</span>
                          </label>
                          <label
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                              declineScope === 'both'
                                ? 'bg-white border-red-400 font-bold text-red-950 shadow-2xs'
                                : 'bg-red-50/40 border-red-100 text-red-800 hover:bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name="declineScope"
                              value="both"
                              checked={declineScope === 'both'}
                              onChange={() => setDeclineScope('both')}
                              className="text-red-600 focus:ring-red-500"
                            />
                            <span>Decline entire round trip (cancel both legs)</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        {selectedDeclineReason === 'Custom reason'
                          ? 'Custom Explanation (Required for passenger email):'
                          : 'Additional Notes / Guidance (Optional):'}
                      </label>
                      <textarea
                        rows={2}
                        value={reviewCustomNotes}
                        onChange={(e) => setReviewCustomNotes(e.target.value)}
                        placeholder={
                          selectedDeclineReason === 'Custom reason'
                            ? 'Explain why this ride request cannot be serviced...'
                            : 'Optional note to customer...'
                        }
                        className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}

                {/* Clarification Request View (if toggled) */}
                {reviewClarifyMode && (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3 animate-in fade-in duration-100">
                    <div className="font-bold text-amber-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertCircleIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Request More Information / Clarification</span>
                      </span>
                      <span className="text-[10px] text-amber-700">Passenger will receive action-required email</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-slate-700 font-semibold text-xs">
                        Select Inquiry Topic:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {[
                          'Pickup or Dropoff location details',
                          'Flight / FBO / Aircraft tail number',
                          'Scheduled pickup timing confirmation',
                          'Passenger count / Luggage capacity',
                          'Child safety seat requirements',
                          'Other / Custom inquiry',
                        ].map((topic) => (
                          <label
                            key={topic}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                              clarifyTopic === topic
                                ? 'bg-white border-amber-400 font-bold text-amber-950 shadow-2xs'
                                : 'bg-amber-50/50 border-amber-100 text-amber-800 hover:bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name="clarifyTopic"
                              value={topic}
                              checked={clarifyTopic === topic}
                              onChange={(e) => setClarifyTopic(e.target.value)}
                              className="text-amber-600 focus:ring-amber-500"
                            />
                            <span>{topic}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Message to Passenger (Required):
                      </label>
                      <textarea
                        rows={3}
                        value={clarifyMessage}
                        onChange={(e) => setClarifyMessage(e.target.value)}
                        placeholder={`Please specify what details are needed from ${reviewTrip.passenger.firstName}...`}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                      />
                      <div className="text-[11px] text-amber-700 mt-1">
                        The passenger will receive an email prompting them to reply or call dispatch directly.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => onReviewTripChange(null)}
                disabled={isProcessingReview}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Close
              </button>

              {reviewModalTab === 'audit' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onReviewModalTabChange('details')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    View Booking Details
                  </button>
                  {!isUnconfirmedTrip && (() => {
                    const ctxEmail = getContextualEmailMeta(reviewTrip.status);
                    return (
                      <button
                        type="button"
                        disabled={isProcessingReview}
                        onClick={handleSendContextualTripEmail}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isProcessingReview ? (
                          <>
                            <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <MailIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{ctxEmail.label}</span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {!reviewDeclineMode && !reviewClarifyMode ? (
                    <>
                      {isUnconfirmedTrip ? (
                        <>
                          <button
                            type="button"
                            disabled={isProcessingReview}
                            onClick={() => {
                              setReviewDeclineMode(true);
                              setReviewClarifyMode(false);
                            }}
                            className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Decline...
                          </button>
                          <button
                            type="button"
                            disabled={isProcessingReview}
                            onClick={() => {
                              setReviewClarifyMode(true);
                              setReviewDeclineMode(false);
                            }}
                            className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>Request Info...</span>
                          </button>
                          <button
                            type="button"
                            disabled={isProcessingReview}
                            onClick={handleConfirmTrip}
                            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isProcessingReview ? (
                              <>
                                <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                                <span>Confirming...</span>
                              </>
                            ) : (
                              <>
                                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {hasLinkedLeg && confirmScope === 'both'
                                    ? 'Confirm Round-Trip Bookings'
                                    : 'Confirm & Accept Booking'}
                                </span>
                              </>
                            )}
                          </button>
                        </>
                      ) : (() => {
                        const normStatus = (reviewTrip.status || '').toLowerCase();
                        const isCancelledOrDeclined = normStatus === 'cancelled' || normStatus === 'declined';
                        const isCompletedStatus = normStatus === 'completed';
                        const isInProgressStatus = normStatus === 'in_progress';
                        const ctxEmail = getContextualEmailMeta(reviewTrip.status);
                        return (
                          <>
                            {isCancelledOrDeclined ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isProcessingReview}
                                  onClick={() => onReactivateTrip(reviewTrip)}
                                  className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <RefreshCwIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span>Reactivate Trip</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isProcessingReview}
                                  onClick={() => {
                                    const target = reviewTrip;
                                    onReviewTripChange(null);
                                    onCloneBookingFromReview(target);
                                  }}
                                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <CopyIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span>Copy Booking</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isProcessingReview}
                                  onClick={() => {
                                    const target = reviewTrip;
                                    onReviewTripChange(null);
                                    onEditTripFromReview(target);
                                  }}
                                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <PencilIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                  <span>{isCompletedStatus ? 'Edit Details' : 'Edit Trip'}</span>
                                </button>

                                {isInProgressStatus && (
                                  <button
                                    type="button"
                                    disabled={isProcessingReview}
                                    onClick={() => onOpenCompleteTripModal(reviewTrip)}
                                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                                    <span>Complete Trip</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={isProcessingReview}
                                  onClick={handleSendContextualTripEmail}
                                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  {isProcessingReview ? (
                                    <>
                                      <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                                      <span>Sending...</span>
                                    </>
                                  ) : (
                                    <>
                                      <MailIcon className="w-3.5 h-3.5 shrink-0" />
                                      <span>
                                        {isOverrideEmailEnabled && overrideRecipientEmail.trim()
                                          ? `${ctxEmail.shortLabel} → ${overrideRecipientEmail.trim()}`
                                          : ctxEmail.label}
                                      </span>
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : reviewDeclineMode ? (
                    <>
                      <button
                        type="button"
                        disabled={isProcessingReview}
                        onClick={() => setReviewDeclineMode(false)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={
                          isProcessingReview ||
                          (selectedDeclineReason === 'Custom reason' && !reviewCustomNotes.trim())
                        }
                        onClick={handleDeclineTrip}
                        className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingReview ? (
                          <>
                            <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                            <span>Declining...</span>
                          </>
                        ) : (
                          <span>Send Rejection & Decline Trip</span>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isProcessingReview}
                        onClick={() => setReviewClarifyMode(false)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={isProcessingReview || !clarifyMessage.trim()}
                        onClick={handleSendClarificationRequest}
                        className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingReview ? (
                          <>
                            <SpinnerIcon className="w-4 h-4 animate-spin text-white" />
                            <span>Sending Email...</span>
                          </>
                        ) : (
                          <span>Send Clarification Email</span>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </FloatingWindow>
        );
      })()}

      {/* Audit Trail Drawer Modal */}
      {auditTrailTrip && (
        <TripAuditModal
          trip={auditTrailTrip}
          onClose={onCloseAuditTrailTrip}
        />
      )}

      {/* ─── Dispatch Console: Complete Trip Modal ─── */}
      {completeTripTarget && (() => {
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
                <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
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
                          <IconComp className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
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
                    <div className="font-bold text-slate-800">Send Official Receipt Email to Passenger</div>
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
      })()}
    </>
  );
}
