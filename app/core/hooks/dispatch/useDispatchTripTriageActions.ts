import React, { useCallback } from 'react';
import { getAdminAuthService } from '../../services/auth/admin-auth.service';
import { authorizedFetch } from '../../services/auth/auth-headers';
import { getBookingService } from '../../services/booking';
import { isTripEligibleForAutoPilot } from '../../services/dispatch/auto-dispatch-ranking';
import { getEmailDispatchService } from '../../services/email/resend-email.service';
import type { DriverRosterItem } from '../../services/operator.service';
import { formatLocalDateStr } from '../../services/pricing/vehicle-matching';
import { getTelephonyService, sanitizePhoneNumber } from '../../services/telephony.service';
import type { AppSettings } from '../../types/config';
import type { Trip, TripStatus } from '../../types/trip';
import { formatVehicleTier, formatVehicleTierDisplay } from '../../utils/vehicle-tier-format.util';
import type { LiveFleetDriver } from '../useDispatchFleet';
import type { DraftTab } from './dispatch-workspace.util';

const TERMINAL_BATCH_STATUSES = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

export function getBatchCompletableTrips(
  trips: ReadonlyArray<Trip>,
  selectedTripIds: ReadonlyArray<string>
): Trip[] {
  if (selectedTripIds.length === 0) return [];
  const selectedSet = new Set(selectedTripIds);
  return trips.filter(
    (t) => selectedSet.has(t.id) && !TERMINAL_BATCH_STATUSES.has(String(t.status || ''))
  );
}

export interface ConfirmModalConfigState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
}

export interface UseDispatchTripTriageActionsParams {
  trips: Trip[];
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  drivers: LiveFleetDriver[];
  settings: AppSettings;
  selectedTripIds: string[];
  setSelectedTripIds: React.Dispatch<React.SetStateAction<string[]>>;
  batchAssignDriverId: string;
  setBatchAssignDriverId: React.Dispatch<React.SetStateAction<string>>;
  setIsBatchAssignOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReviewTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  setConfirmModalConfig: React.Dispatch<React.SetStateAction<ConfirmModalConfigState>>;
  activeDraftId: string;
  setDrafts: React.Dispatch<React.SetStateAction<DraftTab[]>>;
  dialedNumber: string;
  setDialedNumber: React.Dispatch<React.SetStateAction<string>>;
  setActiveCallStatus: React.Dispatch<React.SetStateAction<'idle' | 'calling' | 'connected'>>;
  handleStartAutoOffer: (trip: Trip) => Promise<void>;
  showDispatchToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export function useDispatchTripTriageActions({
  trips,
  setTrips,
  drivers,
  settings,
  selectedTripIds,
  setSelectedTripIds,
  batchAssignDriverId,
  setBatchAssignDriverId,
  setIsBatchAssignOpen,
  setReviewTrip,
  setConfirmModalConfig,
  activeDraftId,
  setDrafts,
  dialedNumber,
  setDialedNumber,
  setActiveCallStatus,
  handleStartAutoOffer,
  showDispatchToast,
}: UseDispatchTripTriageActionsParams) {
  const handleBatchConfirmTrips = useCallback(async () => {
    if (selectedTripIds.length === 0) return;
    const bookingService = getBookingService();
    const tripsToConfirm = trips.filter(
      (t) =>
        selectedTripIds.includes(t.id) &&
        t.status !== 'CONFIRMED' &&
        t.status !== 'confirmed' &&
        t.status !== 'completed'
    );
    if (tripsToConfirm.length === 0) {
      showDispatchToast('All selected trip(s) are already confirmed or completed.', 'info');
      return;
    }
    try {
      const emailService = getEmailDispatchService();
      for (const t of tripsToConfirm) {
        if (bookingService.updateTripStatus) {
          await bookingService.updateTripStatus(t.id, 'CONFIRMED', {
            actorRole: 'admin',
            reason: 'Batch confirmed by dispatcher',
          });
        } else if (bookingService.updateTrip) {
          await bookingService.updateTrip(t.id, { status: 'CONFIRMED' });
        }

        if (t.passenger?.email) {
          try {
            const meta = (t.metadata || {}) as Record<string, any>;
            const resolvedTier =
              (meta.vehicleTypeId as string) ||
              t.vehicleTier ||
              (meta.vehiclePreference as string) ||
              'standard';
            emailService
              .sendBookingConfirmation({
                tripId: t.id,
                trackingToken: t.trackingToken,
                status: 'CONFIRMED',
                passenger: {
                  firstName: t.passenger.firstName,
                  lastName: t.passenger.lastName,
                  email: t.passenger.email,
                  phone: t.passenger.phone,
                },
                pickupAddress: t.pickupLocation?.address || '',
                intermediateStops: t.intermediateStops?.map((s) => ({
                  address: s.address,
                  notes: s.notes,
                })),
                dropoffAddress: t.dropoffLocation?.address || '',
                dropoffNotes: t.dropoffLocation?.notes,
                pickupTime:
                  t.bookingType === 'scheduled' && t.scheduledPickupTime
                    ? new Date(t.scheduledPickupTime).toLocaleString()
                    : 'Immediate Ride (ASAP)',
                bookingType: t.bookingType,
                vehicleTier: resolvedTier,
                vehicleDisplayName: formatVehicleTier(
                  resolvedTier,
                  settings.vehicles,
                  meta.vehicleDisplayName as string | undefined
                ),
                passengerCount: t.passenger?.passengerCount,
                luggageCount: t.passenger?.luggageCount,
                contactPerson: meta.contactPerson
                  ? (meta.contactPerson as any)
                  : meta.isBookerDifferent || meta.bookerName || meta.contactName
                  ? {
                      isBookerDifferent: Boolean(
                        meta.isBookerDifferent || meta.bookerName || meta.contactName
                      ),
                      contactName: meta.bookerName || meta.contactName,
                      contactPhone: meta.bookerPhone || meta.contactPhone,
                      contactEmail: meta.bookerEmail || meta.contactEmail,
                      contactRole: meta.bookerRole || meta.contactRole,
                    }
                  : undefined,
                carSeatsBreakdown: meta.carSeatsBreakdown ? (meta.carSeatsBreakdown as any) : undefined,
                additionalPassengers: meta.additionalPassengers
                  ? (meta.additionalPassengers as any)
                  : undefined,
                totalFare: t.pricing?.totalFare || 0,
                breakdown: t.pricing?.breakdown,
                tariffProfileName: t.pricing?.matchedCorridorName || t.pricing?.tariffProfileName,
                currency: t.pricing?.currency || 'USD',
                paymentMethod: t.payment?.method || 'cash',
                specialRequests: t.passenger?.specialRequests,
                oversizedBags: meta.oversizedBags as Record<string, number> | undefined,
                oversizedItemsSummary: meta.oversizedItemsSummary as string | undefined,
                customExtrasSummary: meta.customExtrasSummary as string | undefined,
                pickupNotes:
                  (meta.pickupLocationDescription as string | undefined) || t.pickupLocation?.notes,
                companySettings: {
                  name: settings.company?.name,
                  phone: settings.company?.phone,
                  address: settings.company?.address,
                  email: settings.company?.email,
                },
                flightDetails:
                  meta.flightNumber || meta.airline || meta.airlineName || meta.tailNumber
                    ? {
                        flightNumber: meta.flightNumber ? String(meta.flightNumber) : undefined,
                        airlineName:
                          meta.airlineName || meta.airline || meta.airlineCode
                            ? String(meta.airlineName || meta.airline || meta.airlineCode)
                            : undefined,
                        departureAirport:
                          meta.flightOrigin || meta.departureAirport
                            ? String(meta.flightOrigin || meta.departureAirport)
                            : undefined,
                        tailNumber: meta.tailNumber ? String(meta.tailNumber) : undefined,
                        fboFacility: meta.fboFacility ? String(meta.fboFacility) : undefined,
                        isPrivateAviation: Boolean(meta.isPrivateAviation || meta.tailNumber),
                        hasCheckedLuggage: Boolean(meta.hasCheckedLuggage),
                        isAirportTrip: Boolean(meta.isAirportTrip),
                      }
                    : undefined,
              })
              .catch((err) => console.warn('[Dispatch] Batch confirmation email error:', err));
          } catch (e) {
            console.warn('[Dispatch] Batch confirmation email skipped:', e);
          }
        }
      }
      setTrips((prev) =>
        prev.map((t) =>
          selectedTripIds.includes(t.id) ? { ...t, status: 'CONFIRMED' as TripStatus } : t
        )
      );
      setSelectedTripIds([]);
      showDispatchToast(`Confirmed ${tripsToConfirm.length} selected trip(s).`, 'success');

      for (const t of tripsToConfirm) {
        const confirmedCandidate: Trip = { ...t, status: 'CONFIRMED' };
        if (isTripEligibleForAutoPilot(confirmedCandidate, settings.dispatchAutomation)) {
          void handleStartAutoOffer(confirmedCandidate);
        }
      }
    } catch (err) {
      console.error('Failed to batch confirm trips:', err);
      showDispatchToast('Failed to batch confirm selected trips. Please try again.', 'error');
    }
  }, [
    selectedTripIds,
    trips,
    settings,
    setTrips,
    setSelectedTripIds,
    showDispatchToast,
    handleStartAutoOffer,
  ]);

  const handleBatchAssignDriver = useCallback(() => {
    if (selectedTripIds.length === 0) return;
    setBatchAssignDriverId(drivers.find((d) => d.mapStatus === 'available')?.id || '');
    setIsBatchAssignOpen(true);
  }, [selectedTripIds.length, drivers, setBatchAssignDriverId, setIsBatchAssignOpen]);

  const handleQuickAssignDriver = useCallback(
    async (tripId: string, driverId: string) => {
      const isUnassigning = !driverId || driverId === 'unassigned';
      const tripToUpdate = trips.find((t) => t.id === tripId);
      if (!tripToUpdate) return;

      const nextStatus: TripStatus = isUnassigning
        ? tripToUpdate.status === 'assigned'
          ? 'pending'
          : tripToUpdate.status
        : ['pending', 'unconfirmed', 'UNCONFIRMED', 'CONFIRMED', 'confirmed'].includes(
            tripToUpdate.status
          )
        ? 'assigned'
        : tripToUpdate.status;

      const drvObj = isUnassigning ? undefined : drivers.find((d) => d.id === driverId);
      const hadStagedDriver = Boolean(!isUnassigning && tripToUpdate.plannedDriverId);
      const updates: Partial<Trip> = {
        assignedDriverId: isUnassigning ? null : driverId,
        status: nextStatus,
        ...(isUnassigning
          ? {}
          : {
              offeredToIds: [],
              ...(hadStagedDriver
                ? {
                    plannedDriverId: null,
                    plannedDriverLabel: null,
                    plannedAt: null,
                    plannedBy: null,
                  }
                : {}),
            }),
        ...(!isUnassigning && tripToUpdate.offerCascade?.state === 'active'
          ? {
              offerCascade: {
                ...tripToUpdate.offerCascade,
                state: 'accepted',
                activeOfferedDriverId: driverId,
                activeOfferedDriverName: drvObj?.formattedLabel || drvObj?.name,
              },
            }
          : {}),
        ...(drvObj
          ? {
              metadata: {
                ...(tripToUpdate.metadata || {}),
                assignedDriverName: drvObj.name,
                assignedDriverPhone: drvObj.phone,
                ...(hadStagedDriver
                  ? {
                      previouslyPlannedDriverId: tripToUpdate.plannedDriverId,
                      previouslyPlannedDriverLabel: tripToUpdate.plannedDriverLabel,
                    }
                  : {}),
              },
            }
          : {}),
      };

      const bookingService = getBookingService();
      try {
        if (bookingService.updateTripStatus && nextStatus !== tripToUpdate.status && !isUnassigning) {
          await bookingService.updateTripStatus(tripId, nextStatus, {
            assignedDriverId: driverId,
            actorRole: 'admin',
            reason: `Assigned to driver ${driverId} by dispatcher`,
          });
          if (hadStagedDriver && bookingService.updateTrip) {
            await bookingService.updateTrip(tripId, {
              plannedDriverId: null,
              plannedDriverLabel: null,
              plannedAt: null,
              plannedBy: null,
              metadata: updates.metadata,
            });
          }
        } else if (bookingService.updateTrip) {
          await bookingService.updateTrip(tripId, updates);
        }
        setTrips((prev) => prev.map((t) => (t.id === tripId ? ({ ...t, ...updates } as Trip) : t)));
        const drv = drivers.find((d) => d.id === driverId);
        showDispatchToast(
          isUnassigning
            ? `Trip #${tripId.slice(-6)} unassigned.`
            : `Assigned ${drv?.formattedLabel || drv?.name || 'driver'} to Trip #${tripId.slice(-6)}.`,
          'success'
        );
      } catch (err) {
        console.error('Failed to quick-assign driver:', err);
        showDispatchToast('Failed to assign driver. Please try again.', 'error');
        throw err;
      }
    },
    [trips, drivers, setTrips, showDispatchToast]
  );

  const handleConfirmBatchAssign = useCallback(async () => {
    if (selectedTripIds.length === 0 || !batchAssignDriverId) return;
    let successCount = 0;
    for (const tripId of selectedTripIds) {
      try {
        await handleQuickAssignDriver(tripId, batchAssignDriverId);
        successCount += 1;
      } catch {}
    }
    setIsBatchAssignOpen(false);
    setSelectedTripIds([]);
    const drv = drivers.find((d) => d.id === batchAssignDriverId);
    showDispatchToast(
      `Assigned ${drv?.formattedLabel || drv?.name || 'driver'} to ${successCount} trip(s).`,
      'success'
    );
  }, [
    selectedTripIds,
    batchAssignDriverId,
    handleQuickAssignDriver,
    setIsBatchAssignOpen,
    setSelectedTripIds,
    drivers,
    showDispatchToast,
  ]);

  const handleBatchExportCsv = useCallback(() => {
    if (selectedTripIds.length === 0) return;
    const selectedTrips = trips.filter((t) => selectedTripIds.includes(t.id));
    if (selectedTrips.length === 0) return;

    const headers = [
      'Trip ID',
      'Status',
      'Booking Type',
      'Pickup Time',
      'Passenger Name',
      'Passenger Phone',
      'Pickup Address',
      'Dropoff Address',
      'Vehicle Tier',
      'Total Fare',
      'Assigned Driver',
    ];

    const rows = selectedTrips.map((t) => [
      `"${t.id}"`,
      `"${t.status}"`,
      `"${t.bookingType || 'scheduled'}"`,
      `"${t.scheduledPickupTime || 'ASAP'}"`,
      `"${[t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}"`,
      `"${t.passenger?.phone || ''}"`,
      `"${(t.pickupLocation?.address || '').replace(/"/g, '""')}"`,
      `"${(t.dropoffLocation?.address || '').replace(/"/g, '""')}"`,
      `"${t.vehicleTier || 'standard'}"`,
      `"$${(t.pricing?.totalFare || 0).toFixed(2)}"`,
      `"${t.assignedDriverId || 'Unassigned'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trips_export_${formatLocalDateStr(new Date())}_${selectedTrips.length}_trips.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [selectedTripIds, trips]);

  const handleBatchCompleteTrips = useCallback(() => {
    if (selectedTripIds.length === 0) return;
    const completableTrips = getBatchCompletableTrips(trips, selectedTripIds);
    if (completableTrips.length === 0) {
      showDispatchToast('All selected trip(s) are already completed or cancelled.', 'info');
      return;
    }

    const skippedCount = selectedTripIds.length - completableTrips.length;
    const totalFareSum = completableTrips.reduce(
      (sum, t) => sum + Math.max(0, t.pricing?.totalFare ?? 0) + Math.max(0, t.payment?.tipAmount ?? 0),
      0
    );
    const autoReceipts = settings.billingSettings?.autoEmailReceipts !== false;

    setConfirmModalConfig({
      isOpen: true,
      title: `Complete ${completableTrips.length} Selected ${
        completableTrips.length === 1 ? 'Trip' : 'Trips'
      }`,
      message: `Mark ${completableTrips.length} trip(s) as Completed ($${totalFareSum.toFixed(
        2
      )} total)?${
        skippedCount > 0 ? ` (${skippedCount} already-closed trip(s) will be skipped.)` : ''
      }${
        autoReceipts
          ? ' Receipts will be emailed automatically to passengers with email on file.'
          : ''
      }`,
      confirmText: `Complete ${completableTrips.length} ${
        completableTrips.length === 1 ? 'Trip' : 'Trips'
      }`,
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        const bookingService = getBookingService();
        const emailService = getEmailDispatchService();
        const telephonyService = getTelephonyService();
        const nowIso = new Date().toISOString();
        let actorLabel = 'Dispatcher';
        try {
          const current = getAdminAuthService().getCurrentUser?.();
          if (current?.email) actorLabel = current.email;
        } catch {}

        const completedPatches = new Map<string, Partial<Trip>>();
        let completedCount = 0;
        let grandTotalSum = 0;

        try {
          for (const trip of completableTrips) {
            const subtotalFare = Math.max(0, trip.pricing?.totalFare ?? 0);
            const tipAmount = Math.max(0, trip.payment?.tipAmount ?? 0);
            const grandTotal = Number((subtotalFare + tipAmount).toFixed(2));
            const rawMethod = trip.payment?.method;
            const mappedPaymentMethod: 'cash' | 'card' | 'corporate' =
              rawMethod === 'corporate' || rawMethod === 'account'
                ? 'corporate'
                : rawMethod === 'card'
                ? 'card'
                : 'cash';
            const paymentStatus: 'paid' | 'pending' =
              mappedPaymentMethod === 'corporate' ? 'pending' : 'paid';
            const completionPaymentType =
              mappedPaymentMethod === 'corporate'
                ? 'corporate_account'
                : mappedPaymentMethod === 'card'
                ? 'card_terminal'
                : 'cash';

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
              completedByDispatcher: actorLabel,
              dispatchCompletionPaymentType: completionPaymentType,
              batchCompleted: true,
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
              await bookingService.updateTripStatus(trip.id, 'completed', {
                actorRole: 'admin',
                reason: `Batch completed via Dispatch Console (${actorLabel})`,
              });
            } else if (bookingService.updateTrip) {
              await bookingService.updateTrip(trip.id, { status: 'completed' });
            }

            telephonyService.closeMaskedSession(trip.id).catch(() => {});

            if (autoReceipts && trip.passenger?.email) {
              const meta = updatedMetadata as Record<string, any>;
              const assignedDriver = trip.assignedDriverId
                ? drivers.find((d) => d.id === trip.assignedDriverId)
                : undefined;
              emailService
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
                  paymentMethod: completionPaymentType,
                  cardLast4: trip.payment?.cardLast4,
                  paymentStatus:
                    mappedPaymentMethod === 'corporate' ? 'corporate_direct_bill' : 'paid',
                  corporateAccountName:
                    meta.corporateDetails?.corporateAccount || meta.corporateOrgName,
                  poNumber: meta.corporateDetails?.billingPo || meta.billingPo,
                  companySettings: {
                    name: settings.company?.name,
                    phone: settings.company?.phone,
                    address: settings.company?.address,
                    email: settings.company?.email,
                  },
                })
                .catch((err) => console.warn('[Dispatch] Batch receipt email skipped:', err));
            }

            completedPatches.set(trip.id, {
              status: 'completed',
              pricing: updatedPricing,
              payment: updatedPayment as any,
              completedAt: nowIso,
              metadata: updatedMetadata,
            });
            completedCount += 1;
            grandTotalSum += grandTotal;
          }

          setTrips((prev) =>
            prev.map((t) => {
              const patch = completedPatches.get(t.id);
              return patch ? ({ ...t, ...patch } as Trip) : t;
            })
          );
          setReviewTrip((prev) => {
            if (!prev) return prev;
            const patch = completedPatches.get(prev.id);
            return patch ? ({ ...prev, ...patch } as Trip) : prev;
          });
          setSelectedTripIds([]);
          showDispatchToast(
            `Completed ${completedCount} trip(s) ($${grandTotalSum.toFixed(2)} total).`,
            'success'
          );
        } catch (err) {
          console.error('Failed to batch complete trips:', err);
          showDispatchToast('Failed to complete selected trips. Please try again.', 'error');
        }
      },
    });
  }, [
    selectedTripIds,
    trips,
    drivers,
    settings,
    setConfirmModalConfig,
    setTrips,
    setReviewTrip,
    setSelectedTripIds,
    showDispatchToast,
  ]);

  const handleBatchCancelTrips = useCallback(() => {
    if (selectedTripIds.length === 0) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Batch Cancel Bookings',
      message: `Are you sure you want to cancel the ${selectedTripIds.length} selected trip(s)? Any assigned drivers will be notified.`,
      confirmText: 'Cancel Trips',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        const bookingService = getBookingService();
        try {
          for (const id of selectedTripIds) {
            if (bookingService.updateTripStatus) {
              await bookingService.updateTripStatus(id, 'cancelled', {
                actorRole: 'admin',
                reason: 'Batch cancellation by dispatcher',
              });
            } else if (bookingService.updateTrip) {
              await bookingService.updateTrip(id, { status: 'cancelled' });
            }
          }
          setTrips((prev) =>
            prev.map((t) =>
              selectedTripIds.includes(t.id) ? { ...t, status: 'cancelled' as TripStatus } : t
            )
          );
          setReviewTrip((prev) =>
            prev && selectedTripIds.includes(prev.id)
              ? { ...prev, status: 'cancelled' as TripStatus }
              : prev
          );
          setSelectedTripIds([]);
        } catch (err) {
          console.error('Failed to batch cancel trips:', err);
        }
      },
    });
  }, [selectedTripIds, setConfirmModalConfig, setTrips, setReviewTrip, setSelectedTripIds]);

  const handlePromptCancelTrip = useCallback(
    (trip: Trip) => {
      setConfirmModalConfig({
        isOpen: true,
        title: `Cancel Trip #${trip.id.slice(0, 8)}`,
        message: `Are you sure you want to cancel the booking for ${
          trip.passenger?.firstName || 'Guest'
        } ${trip.passenger?.lastName || ''}? Any assigned driver will be notified.`,
        confirmText: 'Cancel Trip',
        confirmVariant: 'danger',
        onConfirm: async () => {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          const bookingService = getBookingService();
          try {
            if (bookingService.updateTripStatus) {
              await bookingService.updateTripStatus(trip.id, 'cancelled', {
                actorRole: 'admin',
                reason: 'Cancelled by dispatcher from Actions Menu',
              });
            } else if (bookingService.updateTrip) {
              await bookingService.updateTrip(trip.id, { status: 'cancelled' });
            }
            setTrips((prev) =>
              prev.map((t) =>
                t.id === trip.id
                  ? {
                      ...t,
                      status: 'cancelled' as TripStatus,
                      assignedDriverId: null,
                      plannedDriverId: null,
                      plannedDriverLabel: null,
                    }
                  : t
              )
            );
            setReviewTrip((prev) =>
              prev && prev.id === trip.id
                ? {
                    ...prev,
                    status: 'cancelled' as TripStatus,
                    assignedDriverId: null,
                    plannedDriverId: null,
                    plannedDriverLabel: null,
                  }
                : prev
            );
            showDispatchToast(`Trip #${trip.id.slice(-6).toUpperCase()} cancelled.`, 'info');
          } catch (err) {
            console.error('Failed to cancel trip:', err);
            showDispatchToast('Failed to cancel trip.', 'error');
          }
        },
      });
    },
    [setConfirmModalConfig, setTrips, setReviewTrip, showDispatchToast]
  );

  const handleReactivateTrip = useCallback(
    async (trip: Trip) => {
      const bookingService = getBookingService();
      try {
        if (bookingService.updateTripStatus) {
          await bookingService.updateTripStatus(trip.id, 'pending', {
            actorRole: 'admin',
            reason: 'Reactivated by dispatcher from Actions Menu',
          });
        } else if (bookingService.updateTrip) {
          await bookingService.updateTrip(trip.id, { status: 'pending' });
        }
        setTrips((prev) =>
          prev.map((t) => (t.id === trip.id ? { ...t, status: 'pending' as TripStatus } : t))
        );
        setReviewTrip((prev) =>
          prev && prev.id === trip.id ? { ...prev, status: 'pending' as TripStatus } : prev
        );
        showDispatchToast(
          `Trip #${trip.id.slice(-6).toUpperCase()} reactivated to Pending.`,
          'success'
        );
      } catch (err) {
        console.error('Failed to reactivate trip:', err);
        showDispatchToast('Failed to reactivate trip.', 'error');
      }
    },
    [setTrips, setReviewTrip, showDispatchToast]
  );

  const handleSignOut = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
        localStorage.removeItem('chesterfield_taxi_admin_session');
      } catch {}
    }
    try {
      getAdminAuthService().signOut().catch(() => {});
    } catch {}
    window.location.href = '/app/login?message=logged_out';
  }, []);

  const handleAssignDriverToDraft = useCallback(
    (driver: DriverRosterItem) => {
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                formValues: {
                  ...(draft.formValues || {}),
                  driverId: driver.id,
                } as any,
              }
            : draft
        )
      );
      showDispatchToast(
        `Selected ${driver.formattedLabel || driver.name} for active draft.`,
        'info'
      );
    },
    [activeDraftId, setDrafts, showDispatchToast]
  );

  const handleReorderDriverQueue = useCallback(
    async (_driverId: string, reorderedTripIds: string[]) => {
      const bookingService = getBookingService();
      const updatePromises = reorderedTripIds.map((id, index) => {
        const order = index + 1;
        const existing = trips.find((t) => t.id === id);
        const updates: Partial<Trip> = {
          queueOrder: order,
          metadata: {
            ...(existing?.metadata || {}),
            driverQueueOrder: order,
          },
        };
        return bookingService.updateTrip
          ? bookingService.updateTrip(id, updates)
          : Promise.resolve(null as any);
      });

      const previousTrips = trips;
      setTrips((prev) =>
        prev.map((t) => {
          const idx = reorderedTripIds.indexOf(t.id);
          return idx !== -1
            ? {
                ...t,
                queueOrder: idx + 1,
                metadata: { ...(t.metadata || {}), driverQueueOrder: idx + 1 },
              }
            : t;
        })
      );

      try {
        await Promise.all(updatePromises);
      } catch (err) {
        setTrips(previousTrips);
        console.error('Failed to persist reordered driver queue:', err);
        showDispatchToast('Failed to save queue order — reverted.', 'error');
        throw err;
      }
    },
    [trips, setTrips, showDispatchToast]
  );

  const handleStartCall = useCallback(
    async (targetNum?: string, peerName?: string) => {
      const numToCall = targetNum || dialedNumber;
      if (!numToCall) return;
      setDialedNumber(numToCall);
      setActiveCallStatus('calling');

      try {
        getTelephonyService().startSoftphoneCall(numToCall, peerName);
      } catch (e) {
        console.warn('Softphone call initiation warning:', e);
      }

      try {
        await authorizedFetch('/api/telephony', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'make_call',
            to: sanitizePhoneNumber(numToCall),
          }),
        });
      } catch (err) {
        console.warn('Telephony endpoint error:', err);
      }

      setActiveCallStatus('connected');
    },
    [dialedNumber, setDialedNumber, setActiveCallStatus]
  );

  return {
    handleBatchConfirmTrips,
    handleBatchAssignDriver,
    handleQuickAssignDriver,
    handleConfirmBatchAssign,
    handleBatchCompleteTrips,
    handleBatchExportCsv,
    handleBatchCancelTrips,
    handlePromptCancelTrip,
    handleReactivateTrip,
    handleSignOut,
    handleAssignDriverToDraft,
    handleReorderDriverQueue,
    handleStartCall,
  };
}
