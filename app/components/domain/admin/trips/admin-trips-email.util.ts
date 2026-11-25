import type { Trip, TripStatus } from '../../../../core/types/trip';
import { getEmailDispatchService } from '../../../../core/services/email';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import { formatVehicleTier } from '../../../../core/utils/vehicle-tier-format.util';

export async function notifyAdminTripStatusEmail(params: {
  currentTrip: Trip;
  newStatus: TripStatus;
  previousStatus: TripStatus | null;
  reason?: string;
}): Promise<string> {
  const { currentTrip, newStatus, previousStatus, reason } = params;
  if (!currentTrip.passenger?.email) return '';

  try {
    const emailService = getEmailDispatchService();
    const cachedSettings = getAdminConfigService().getCachedSettings();
    const meta = (currentTrip.metadata || {}) as Record<string, any>;
    const resolvedVehName = formatVehicleTier(
      currentTrip.vehicleTier || 'standard',
      cachedSettings.vehicles,
      typeof meta.vehicleDisplayName === 'string' ? meta.vehicleDisplayName : undefined
    );
    const formattedPickupTime =
      currentTrip.bookingType === 'scheduled' && currentTrip.scheduledPickupTime
        ? new Date(currentTrip.scheduledPickupTime).toLocaleString()
        : 'Immediate Ride (ASAP)';
    const companySettings = {
      name: cachedSettings.company?.name,
      phone: cachedSettings.company?.phone,
      address: cachedSettings.company?.address,
      email: cachedSettings.company?.email,
    };

    let sendResult;
    if (newStatus === 'CONFIRMED' || newStatus === 'confirmed') {
      sendResult = await emailService.sendBookingConfirmation({
        tripId: currentTrip.id,
        customerId: currentTrip.customerId ?? null,
        trackingToken: currentTrip.trackingToken,
        status: 'CONFIRMED',
        passenger: {
          firstName: currentTrip.passenger?.firstName || 'Valued',
          lastName: currentTrip.passenger?.lastName || 'Customer',
          email: currentTrip.passenger?.email || '',
          phone: currentTrip.passenger?.phone || '',
        },
        pickupAddress: currentTrip.pickupLocation?.address || 'Pickup Address',
        intermediateStops: currentTrip.intermediateStops?.map((s) => ({
          address: s.address,
          notes: s.notes,
        })),
        dropoffAddress: currentTrip.dropoffLocation?.address || 'Dropoff Address',
        dropoffNotes: currentTrip.dropoffLocation?.notes,
        pickupTime: formattedPickupTime,
        bookingType: currentTrip.bookingType || 'scheduled',
        vehicleTier: currentTrip.vehicleTier || 'standard',
        vehicleDisplayName: resolvedVehName,
        passengerCount: currentTrip.passenger?.passengerCount,
        luggageCount: currentTrip.passenger?.luggageCount,
        totalFare: currentTrip.pricing?.totalFare || 0,
        breakdown: currentTrip.pricing?.breakdown,
        tariffProfileName:
          currentTrip.pricing?.matchedCorridorName || currentTrip.pricing?.tariffProfileName,
        currency: currentTrip.pricing?.currency || 'USD',
        paymentMethod: currentTrip.payment?.method || 'cash',
        specialRequests: currentTrip.passenger?.specialRequests,
        companySettings,
      });
    } else if (newStatus === 'DECLINED' || newStatus === 'declined') {
      sendResult = await emailService.sendBookingDeclined({
        tripId: currentTrip.id,
        passenger: {
          firstName: currentTrip.passenger?.firstName || 'Valued',
          lastName: currentTrip.passenger?.lastName || 'Customer',
          email: currentTrip.passenger?.email || '',
          phone: currentTrip.passenger?.phone || '',
        },
        pickupAddress: currentTrip.pickupLocation?.address || 'Pickup Address',
        dropoffAddress: currentTrip.dropoffLocation?.address || 'Dropoff Address',
        pickupTime: formattedPickupTime,
        vehicleTier: currentTrip.vehicleTier || 'standard',
        vehicleDisplayName: resolvedVehName,
        reason: reason || 'Unable to accommodate request',
        companySettings,
      });
    } else {
      sendResult = await emailService.sendStatusUpdateNotification({
        tripId: currentTrip.id,
        customerId: currentTrip.customerId ?? null,
        trackingToken: currentTrip.trackingToken,
        passenger: {
          firstName: currentTrip.passenger?.firstName || 'Valued',
          lastName: currentTrip.passenger?.lastName || 'Customer',
          email: currentTrip.passenger?.email || '',
          phone: currentTrip.passenger?.phone || '',
        },
        newStatus,
        previousStatus,
        pickupAddress: currentTrip.pickupLocation?.address || 'Pickup Address',
        dropoffAddress: currentTrip.dropoffLocation?.address || 'Dropoff Address',
        pickupTime: formattedPickupTime,
        vehicleTier: currentTrip.vehicleTier || 'standard',
        vehicleDisplayName: resolvedVehName,
        statusReason: reason,
        companySettings,
      });
    }

    if (sendResult?.success) {
      return ` Notification email sent to ${currentTrip.passenger.email}.`;
    }
    if (sendResult?.error) {
      return ` (Email warning: ${sendResult.error})`;
    }
    return '';
  } catch (mailErr: any) {
    return ` (Email offline: ${mailErr?.message || 'Check RESEND_API_KEY'})`;
  }
}
