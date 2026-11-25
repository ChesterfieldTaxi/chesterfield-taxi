import type { LiveFleetDriver } from '../../hooks/useDispatchFleet';
import type { AppSettings } from '../../types/config';
import type { Trip } from '../../types/trip';
import { formatVehicleTier, formatVehicleTierDisplay } from '../../utils/vehicle-tier-format.util';
import { getEmailDispatchService } from '../email/resend-email.service';

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
        customerId: targetTrip.customerId ?? null,
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
        customerId: targetTrip.customerId ?? null,
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
        customerId: targetTrip.customerId ?? null,
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
