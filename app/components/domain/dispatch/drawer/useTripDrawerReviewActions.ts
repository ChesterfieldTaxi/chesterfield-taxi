import React, { useState, useEffect } from 'react';
import type { AdminUser } from '../../../../core/services/auth/admin-auth.service';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip, TripAuditEvent, TripStatus } from '../../../../core/types/trip';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import { getBookingService } from '../../../../core/services/booking';
import { getEmailDispatchService } from '../../../../core/services/email/resend-email.service';
import { formatVehicleTier } from '../../../../core/utils/vehicle-tier-format.util';
import {
  getContextualEmailMeta,
  sendDispatchContextualTripEmail,
} from '../../../../core/services/dispatch/dispatch-trip-email.util';
import { isTripEligibleForAutoPilot } from '../../../../core/services/dispatch/auto-dispatch-ranking';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import { getFlightStatusService } from '../../../../core/services/flight/flight-status.service';

export interface UseTripDrawerReviewActionsParams {
  user: AdminUser | null;
  settings: AppSettings;
  trips: Trip[];
  drivers: LiveFleetDriver[];
  reviewTrip: Trip | null;
  reviewOpenSeq: number;
  onTripsChange: React.Dispatch<React.SetStateAction<Trip[]>>;
  onReviewTripChange: React.Dispatch<React.SetStateAction<Trip | null>>;
  onStartAutoOffer?: (trip: Trip) => void | Promise<void>;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onPromptCancelTrip: (trip: Trip) => void;
  onShowToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function useTripDrawerReviewActions({
  user,
  settings,
  trips,
  drivers,
  reviewTrip,
  reviewOpenSeq,
  onTripsChange,
  onReviewTripChange,
  onStartAutoOffer,
  onOpenCompleteTripModal,
  onPromptCancelTrip,
  onShowToast,
}: UseTripDrawerReviewActionsParams) {
  const [reviewDeclineMode, setReviewDeclineMode] = useState<boolean>(false);
  const [reviewClarifyMode, setReviewClarifyMode] = useState<boolean>(false);
  const [selectedDeclineReason, setSelectedDeclineReason] = useState<string>(
    'No driver availability for requested time'
  );
  const [declineScope, setDeclineScope] = useState<'leg' | 'both'>('leg');
  const [confirmScope, setConfirmScope] = useState<'both' | 'leg'>('both');
  const [reviewCustomNotes, setReviewCustomNotes] = useState<string>('');
  const [clarifyTopic, setClarifyTopic] = useState<string>('Pickup or Dropoff location details');
  const [clarifyMessage, setClarifyMessage] = useState<string>('');
  const [isProcessingReview, setIsProcessingReview] = useState<boolean>(false);
  const [reviewAlert, setReviewAlert] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [overrideRecipientEmail, setOverrideRecipientEmail] = useState<string>('');
  const [isOverrideEmailEnabled, setIsOverrideEmailEnabled] = useState<boolean>(false);
  const [shouldUpdatePassengerEmail, setShouldUpdatePassengerEmail] = useState<boolean>(false);
  const [isOverridingStatus, setIsOverridingStatus] = useState<boolean>(false);
  const [payLinkBusyAction, setPayLinkBusyAction] = useState<'copy' | 'sms' | 'email' | null>(null);
  const [generatedPayUrl, setGeneratedPayUrl] = useState<string>('');
  const [isRefreshingFlight, setIsRefreshingFlight] = useState<boolean>(false);
  const [isSyncingFlightEta, setIsSyncingFlightEta] = useState<boolean>(false);

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

  const handleRefreshTripFlight = async (targetTrip: Trip) => {
    setIsRefreshingFlight(true);
    try {
      const res = await getFlightStatusService().refreshTripFlightTelemetry(targetTrip, {
        forceRefresh: true,
      });
      if (!res.success || !res.updatedTrip || !res.snapshot) {
        onShowToast(res.error || 'Unable to refresh flight status.', 'error');
        return;
      }
      onReviewTripChange(res.updatedTrip);
      onTripsChange((prev) =>
        prev.map((t) => (t.id === res.updatedTrip!.id ? res.updatedTrip! : t))
      );
      const statusMsg =
        res.snapshot.status === 'delayed' || res.snapshot.delayMinutes >= 15
          ? `Delayed +${Math.max(15, res.snapshot.delayMinutes)}m`
          : res.snapshot.status === 'landed'
          ? 'Landed'
          : res.snapshot.status === 'cancelled'
          ? 'Cancelled'
          : res.snapshot.isSimulatedFallback
          ? `Verified · ${res.snapshot.terminal || 'STL'}`
          : `On Time · ${res.snapshot.terminal || 'STL'}`;
      onShowToast(`Flight ${res.snapshot.flightIdent} refreshed (${statusMsg}).`, 'success');
    } finally {
      setIsRefreshingFlight(false);
    }
  };

  const handleAdjustPickupToFlightEta = async (targetTrip: Trip) => {
    setIsSyncingFlightEta(true);
    try {
      const actorRole: 'admin' | 'dispatcher' = user?.roles?.includes('admin')
        ? 'admin'
        : 'dispatcher';
      const res = await getFlightStatusService().syncTripPickupToFlightEta(targetTrip, {
        actorId: user?.uid || user?.email || 'dispatch',
        actorRole,
      });
      if (!res.success || !res.updatedTrip || !res.newScheduledPickupIso) {
        onShowToast(res.error || 'Failed to sync pickup time to flight ETA.', 'error');
        return;
      }
      onReviewTripChange(res.updatedTrip);
      onTripsChange((prev) =>
        prev.map((t) => (t.id === res.updatedTrip!.id ? res.updatedTrip! : t))
      );
      const timeLabel = new Date(res.newScheduledPickupIso).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      const driverSuffix = res.driverNotified
        ? ' Assigned driver push notification sent.'
        : '';
      onShowToast(
        `Pickup adjusted to ${timeLabel}${
          res.driftMinutes ? ` (${res.driftMinutes > 0 ? '+' : ''}${res.driftMinutes}m)` : ''
        }.${driverSuffix}`,
        'success'
      );
    } finally {
      setIsSyncingFlightEta(false);
    }
  };

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

      const targetOverride =
        isOverrideEmailEnabled && overrideRecipientEmail.trim()
          ? overrideRecipientEmail.trim()
          : undefined;

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
          reason: shouldConfirmBoth
            ? 'Dispatcher accepted round-trip web booking'
            : 'Dispatcher accepted web booking leg',
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

      const outboundFlightDetails =
        reviewMeta.flightNumber ||
        reviewMeta.airline ||
        reviewMeta.airlineName ||
        reviewMeta.tailNumber
          ? {
              flightNumber: reviewMeta.flightNumber ? String(reviewMeta.flightNumber) : undefined,
              airlineName:
                reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode
                  ? String(reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode)
                  : undefined,
              departureAirport:
                reviewMeta.flightOrigin || reviewMeta.departureAirport
                  ? String(reviewMeta.flightOrigin || reviewMeta.departureAirport)
                  : undefined,
              tailNumber: reviewMeta.tailNumber ? String(reviewMeta.tailNumber) : undefined,
              fboFacility: reviewMeta.fboFacility ? String(reviewMeta.fboFacility) : undefined,
              isPrivateAviation: Boolean(
                reviewMeta.isPrivateAviation || reviewMeta.tailNumber || reviewMeta.fboFacility
              ),
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
            flightDetails:
              (linkedTripObj.metadata as any)?.flightNumber ||
              (linkedTripObj.metadata as any)?.tailNumber
                ? {
                    airlineName:
                      (linkedTripObj.metadata as any)?.airlineName ||
                      (linkedTripObj.metadata as any)?.airline,
                    flightNumber: (linkedTripObj.metadata as any)?.flightNumber,
                    departureAirport:
                      (linkedTripObj.metadata as any)?.departureAirport ||
                      (linkedTripObj.metadata as any)?.flightOrigin,
                    tailNumber: (linkedTripObj.metadata as any)?.tailNumber,
                    fboFacility: (linkedTripObj.metadata as any)?.fboFacility,
                    isPrivateAviation: Boolean(
                      (linkedTripObj.metadata as any)?.isPrivateAviation ||
                        (linkedTripObj.metadata as any)?.tailNumber
                    ),
                    hasCheckedLuggage: Boolean((linkedTripObj.metadata as any)?.hasCheckedLuggage),
                    isAirportTrip: Boolean((linkedTripObj.metadata as any)?.isAirportTrip),
                  }
                : undefined,
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
              email:
                targetOverride && shouldUpdatePassengerEmail
                  ? targetOverride
                  : reviewTrip.passenger.email,
              phone: reviewTrip.passenger.phone,
            },
            recipientEmailOverride: targetOverride,
            pickupAddress: reviewTrip.pickupLocation.address,
            intermediateStops: reviewTrip.intermediateStops?.map((s) => ({
              address: s.address,
              notes: s.notes,
            })),
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
              : reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName
              ? {
                  isBookerDifferent: Boolean(
                    reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName
                  ),
                  contactName: reviewMeta.bookerName || reviewMeta.contactName,
                  contactPhone: reviewMeta.bookerPhone || reviewMeta.contactPhone,
                  contactEmail: reviewMeta.bookerEmail || reviewMeta.contactEmail,
                  contactRole: reviewMeta.bookerRole || reviewMeta.contactRole,
                }
              : undefined,
            carSeatsBreakdown: reviewMeta.carSeatsBreakdown
              ? (reviewMeta.carSeatsBreakdown as any)
              : undefined,
            additionalPassengers: reviewMeta.additionalPassengers
              ? (reviewMeta.additionalPassengers as any)
              : undefined,
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
            pickupNotes:
              (reviewMeta.pickupLocationDescription as string | undefined) ||
              reviewTrip.pickupLocation.notes,
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
                  ? `Dispatched confirmation receipt & live tracking link to ${effectiveConfirmedEmail}${
                      targetOverride ? ' (Alternate Override)' : ''
                    }`
                  : `Confirmation email delivery failed for ${effectiveConfirmedEmail}: ${
                      emailResult.error || 'Email service error'
                    }`,
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

      if (onStartAutoOffer) {
        if (isTripEligibleForAutoPilot(updatedConfirmedTrip, settings.dispatchAutomation)) {
          void Promise.resolve(onStartAutoOffer(updatedConfirmedTrip)).catch(() => {});
        }
        if (
          shouldConfirmBoth &&
          linkedTripObj &&
          isTripEligibleForAutoPilot(
            { ...linkedTripObj, status: 'CONFIRMED' },
            settings.dispatchAutomation
          )
        ) {
          void Promise.resolve(
            onStartAutoOffer({ ...linkedTripObj, status: 'CONFIRMED' })
          ).catch(() => {});
        }
      }

      if (!emailResult.success) {
        setReviewAlert({
          type: 'error',
          message: `Booking #${reviewTrip.id} confirmed, but email delivery failed: ${
            emailResult.error || 'Email service error'
          }`,
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

      const targetOverride =
        isOverrideEmailEnabled && overrideRecipientEmail.trim()
          ? overrideRecipientEmail.trim()
          : undefined;

      if (targetOverride && shouldUpdatePassengerEmail && bookingService.updateTrip) {
        await bookingService.updateTrip(reviewTrip.id, {
          passenger: {
            ...reviewTrip.passenger,
            email: targetOverride,
          },
        });
      }

      const outboundFlightDetails =
        reviewMeta.flightNumber ||
        reviewMeta.airline ||
        reviewMeta.airlineName ||
        reviewMeta.tailNumber
          ? {
              flightNumber: reviewMeta.flightNumber ? String(reviewMeta.flightNumber) : undefined,
              airlineName:
                reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode
                  ? String(reviewMeta.airlineName || reviewMeta.airline || reviewMeta.airlineCode)
                  : undefined,
              departureAirport:
                reviewMeta.flightOrigin || reviewMeta.departureAirport
                  ? String(reviewMeta.flightOrigin || reviewMeta.departureAirport)
                  : undefined,
              tailNumber: reviewMeta.tailNumber ? String(reviewMeta.tailNumber) : undefined,
              fboFacility: reviewMeta.fboFacility ? String(reviewMeta.fboFacility) : undefined,
              isPrivateAviation: Boolean(
                reviewMeta.isPrivateAviation || reviewMeta.tailNumber || reviewMeta.fboFacility
              ),
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
            flightDetails:
              (linkedTripObj.metadata as any)?.flightNumber ||
              (linkedTripObj.metadata as any)?.tailNumber
                ? {
                    airlineName:
                      (linkedTripObj.metadata as any)?.airlineName ||
                      (linkedTripObj.metadata as any)?.airline,
                    flightNumber: (linkedTripObj.metadata as any)?.flightNumber,
                    departureAirport:
                      (linkedTripObj.metadata as any)?.departureAirport ||
                      (linkedTripObj.metadata as any)?.flightOrigin,
                    tailNumber: (linkedTripObj.metadata as any)?.tailNumber,
                    fboFacility: (linkedTripObj.metadata as any)?.fboFacility,
                    isPrivateAviation: Boolean(
                      (linkedTripObj.metadata as any)?.isPrivateAviation ||
                        (linkedTripObj.metadata as any)?.tailNumber
                    ),
                    hasCheckedLuggage: Boolean((linkedTripObj.metadata as any)?.hasCheckedLuggage),
                    isAirportTrip: Boolean((linkedTripObj.metadata as any)?.isAirportTrip),
                  }
                : undefined,
          }
        : undefined;

      const effectiveRecipient = (targetOverride || reviewTrip.passenger.email || '').trim();
      if (!effectiveRecipient) {
        setReviewAlert({
          type: 'error',
          message:
            'No passenger email on file. Enable "Override Recipient Email" to send a copy.',
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
          email:
            targetOverride && shouldUpdatePassengerEmail
              ? targetOverride
              : reviewTrip.passenger.email,
          phone: reviewTrip.passenger.phone,
        },
        recipientEmailOverride: targetOverride,
        pickupAddress: reviewTrip.pickupLocation.address,
        intermediateStops: reviewTrip.intermediateStops?.map((s) => ({
          address: s.address,
          notes: s.notes,
        })),
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
          : reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName
          ? {
              isBookerDifferent: Boolean(
                reviewMeta.isBookerDifferent || reviewMeta.bookerName || reviewMeta.contactName
              ),
              contactName: reviewMeta.bookerName || reviewMeta.contactName,
              contactPhone: reviewMeta.bookerPhone || reviewMeta.contactPhone,
              contactEmail: reviewMeta.bookerEmail || reviewMeta.contactEmail,
              contactRole: reviewMeta.bookerRole || reviewMeta.contactRole,
            }
          : undefined,
        carSeatsBreakdown: reviewMeta.carSeatsBreakdown
          ? (reviewMeta.carSeatsBreakdown as any)
          : undefined,
        additionalPassengers: reviewMeta.additionalPassengers
          ? (reviewMeta.additionalPassengers as any)
          : undefined,
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
        pickupNotes:
          (reviewMeta.pickupLocationDescription as string | undefined) ||
          reviewTrip.pickupLocation.notes,
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
            ? `Resent confirmation email to ${effectiveRecipient}${
                targetOverride ? ' (Alternate Override)' : ''
              }`
            : `Resend confirmation email failed for ${effectiveRecipient}: ${
                emailResult.error || 'Email service error'
              }`,
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
        ? shouldDeclineBoth
          ? 'roundtrip'
          : isReturnRide
          ? 'return'
          : 'outbound'
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
            : `Decline notice email failed for ${reviewTrip.passenger.email}: ${
                declineEmailResult.error || 'Email service error'
              }`,
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
      const legScopeVal =
        reviewMeta.hasReturnTrip || reviewMeta.isReturnRide
          ? isReturn
            ? 'return'
            : 'outbound'
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
          phone:
            settings.company?.phone ||
            COMPANY_CONFIG.phone.primary ||
            COMPANY_CONFIG.phone.dispatch,
          address: settings.company?.address || COMPANY_CONFIG.address.formatted,
          email:
            settings.company?.email ||
            COMPANY_CONFIG.email.dispatch ||
            COMPANY_CONFIG.email.support,
        },
      });

      const nowIso = new Date().toISOString();
      const numPart = reviewTrip.id.replace(/[^0-9]/g, '').slice(-4) || '4001';
      if (!clarifyEmailResult.success) {
        throw new Error(
          clarifyEmailResult.error || 'Failed to send clarification request email.'
        );
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
        prev.map((t) => (t.id === reviewTrip.id ? { ...t, auditLog: newAuditEvents } : t))
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
      onTripsChange((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, status: nextStatus } : t))
      );
      onReviewTripChange((prev) =>
        prev && prev.id === trip.id ? { ...prev, status: nextStatus } : prev
      );
      const pretty = nextStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      onShowToast(`Trip #${trip.id.slice(-6).toUpperCase()} status set to ${pretty}.`, 'success');
    } catch (err) {
      console.error('Manual status override failed:', err);
      onShowToast('Failed to update trip status.', 'error');
    } finally {
      setIsOverridingStatus(false);
    }
  };

  return {
    reviewDeclineMode,
    setReviewDeclineMode,
    reviewClarifyMode,
    setReviewClarifyMode,
    selectedDeclineReason,
    setSelectedDeclineReason,
    declineScope,
    setDeclineScope,
    confirmScope,
    setConfirmScope,
    reviewCustomNotes,
    setReviewCustomNotes,
    clarifyTopic,
    setClarifyTopic,
    clarifyMessage,
    setClarifyMessage,
    isProcessingReview,
    reviewAlert,
    overrideRecipientEmail,
    setOverrideRecipientEmail,
    isOverrideEmailEnabled,
    setIsOverrideEmailEnabled,
    shouldUpdatePassengerEmail,
    setShouldUpdatePassengerEmail,
    isOverridingStatus,
    payLinkBusyAction,
    generatedPayUrl,
    isRefreshingFlight,
    isSyncingFlightEta,
    handleRefreshTripFlight,
    handleAdjustPickupToFlightEta,
    handleTripPayLinkAction,
    handleConfirmTrip,
    handleSendContextualTripEmail,
    handleDeclineTrip,
    handleSendClarificationRequest,
    handleManualStatusOverride,
  };
}
