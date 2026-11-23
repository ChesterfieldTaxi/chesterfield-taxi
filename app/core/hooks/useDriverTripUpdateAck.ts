import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriverDutyStatus } from '../types/driver';
import type { Trip } from '../types/trip';
import { getBookingService } from '../services/booking';
import {
  buildAcknowledgeTripUpdatePatch,
  getPendingDriverUpdateAck,
  hasUnacknowledgedDriverUpdate,
} from '../services/dispatch/trip-update-ack.service';
import { pushNotificationService } from '../services/notifications/push-notification.service';
import { soundNotificationService } from '../services/sound-notification.service';

export interface UseDriverTripUpdateAckParams {
  driverId?: string | null;
  dutyStatus?: DriverDutyStatus;
  allDriverTrips: Trip[];
  setAllDriverTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  onSuccessNotice?: (message: string) => void;
  onErrorNotice?: (message: string) => void;
}

export interface DriverTripUpdateAckController {
  acknowledgingTripId: string | null;
  unacknowledgedTrips: Trip[];
  acknowledgeTripUpdate: (trip: Trip) => Promise<void>;
}

/**
 * Watches assigned driver trips for unacknowledged Dispatch / Guest modifications,
 * triggers acoustic alert chime + Web Push notification once per unseen `revisionId`
 * while `on_duty` (or actively in-progress), and exposes `acknowledgeTripUpdate(trip)`.
 */
export function useDriverTripUpdateAck({
  driverId,
  dutyStatus,
  allDriverTrips,
  setAllDriverTrips,
  onSuccessNotice,
  onErrorNotice,
}: UseDriverTripUpdateAckParams): DriverTripUpdateAckController {
  const [acknowledgingTripId, setAcknowledgingTripId] = useState<string | null>(null);
  const seenRevisionIdsRef = useRef<Set<string>>(new Set());

  const unacknowledgedTrips = useMemo(() => {
    if (!driverId) return [];
    return allDriverTrips.filter(
      (trip) => trip.assignedDriverId === driverId && hasUnacknowledgedDriverUpdate(trip)
    );
  }, [allDriverTrips, driverId]);

  useEffect(() => {
    if (!driverId || unacknowledgedTrips.length === 0) return;

    const shouldEmitAlerts =
      dutyStatus === 'on_duty' ||
      unacknowledgedTrips.some((t) =>
        ['en_route', 'arrived', 'in_progress'].includes(t.status)
      );

    if (!shouldEmitAlerts) {
      return;
    }

    let firedNewRevision = false;

    for (const trip of unacknowledgedTrips) {
      const ack = getPendingDriverUpdateAck(trip);
      if (!ack) continue;
      const seenKey = `${trip.id}:${ack.revisionId}`;
      if (seenRevisionIdsRef.current.has(seenKey)) continue;

      seenRevisionIdsRef.current.add(seenKey);
      firedNewRevision = true;
      void pushNotificationService.notifyDriverTripUpdated(trip, ack);
    }

    if (firedNewRevision) {
      soundNotificationService.playAlertChime();
    }
  }, [driverId, dutyStatus, unacknowledgedTrips]);

  const acknowledgeTripUpdate = useCallback(
    async (trip: Trip): Promise<void> => {
      if (!driverId || !trip?.id) return;
      const ack = getPendingDriverUpdateAck(trip);
      if (ack) {
        seenRevisionIdsRef.current.add(`${trip.id}:${ack.revisionId}`);
      }

      const nowIso = new Date().toISOString();
      const patch = buildAcknowledgeTripUpdatePatch(trip, driverId, nowIso);

      setAcknowledgingTripId(trip.id);
      setAllDriverTrips((prev) =>
        prev.map((item) => (item.id === trip.id ? ({ ...item, ...patch } as Trip) : item))
      );

      try {
        const bookingService = getBookingService();
        if (bookingService.updateTrip) {
          const saved = await bookingService.updateTrip(trip.id, patch);
          if (saved?.id) {
            setAllDriverTrips((prev) =>
              prev.map((item) => (item.id === saved.id ? saved : item))
            );
          }
        }
        onSuccessNotice?.('Trip changes acknowledged.');
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Failed to acknowledge trip update.';
        onErrorNotice?.(msg);
      } finally {
        setAcknowledgingTripId(null);
      }
    },
    [driverId, setAllDriverTrips, onSuccessNotice, onErrorNotice]
  );

  return {
    acknowledgingTripId,
    unacknowledgedTrips,
    acknowledgeTripUpdate,
  };
}
