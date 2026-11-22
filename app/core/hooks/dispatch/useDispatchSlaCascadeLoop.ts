import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { AdminUser } from '../../services/auth/admin-auth.service';
import { getBookingService } from '../../services/booking';
import type { AppSettings } from '../../types/config';
import type { Trip } from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import type { LiveFleetDriver } from '../useDispatchFleet';
import {
  advanceOrExpireOfferCascade,
  buildTripSlaStatusPatch,
  cancelOfferCascade,
  scanUpcomingUnassignedSlaTrips,
  startOfferCascade,
} from '../../services/dispatch';
import type { SlaScanSummary } from '../../services/dispatch/sla-monitor.service';
import { soundNotificationService } from '../../services/sound-notification.service';
import { pushNotificationService } from '../../services/notifications/push-notification.service';

export interface UseDispatchSlaCascadeLoopParams {
  trips: Trip[];
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  setReviewTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  drivers: LiveFleetDriver[];
  dispatchZones: ZoneGeofence[];
  settings: AppSettings;
  user: AdminUser | null;
  showDispatchToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export interface UseDispatchSlaCascadeLoopResult {
  slaSummary: SlaScanSummary;
  handleStartAutoOffer: (trip: Trip) => Promise<void>;
  handleCancelAutoOffer: (trip: Trip) => Promise<void>;
  autoOfferStartedIdsRef: React.MutableRefObject<Set<string>>;
  autoOfferContextRef: React.MutableRefObject<{
    autoOfferOnConfirm: boolean;
    handleStartAutoOffer: (trip: Trip) => Promise<void>;
  }>;
}

/**
 * Periodic SLA urgency scanner (15s UI refresh + 3s coordinator tick) and
 * sequential auto-offer cascade start / cancel / expiration loop.
 */
export function useDispatchSlaCascadeLoop({
  trips,
  setTrips,
  setReviewTrip,
  drivers,
  dispatchZones,
  settings,
  user,
  showDispatchToast,
}: UseDispatchSlaCascadeLoopParams): UseDispatchSlaCascadeLoopResult {
  // Deterministic SSR initial timestamp (0 = scan uses default Date.now() once hydrated)
  const [slaClockTick, setSlaClockTick] = useState<number>(0);
  const inFlightCascadeIdsRef = useRef<Set<string>>(new Set());
  const slaNotifiedLevelsRef = useRef<Map<string, 'warning' | 'critical'>>(new Map());
  const autoOfferStartedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSlaClockTick(Date.now());
    const interval = setInterval(() => {
      setSlaClockTick(Date.now());
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const slaSummary = useMemo(
    () =>
      scanUpcomingUnassignedSlaTrips(trips, settings.dispatchAutomation, {
        nowMs: slaClockTick > 0 ? slaClockTick : undefined,
      }),
    [trips, settings.dispatchAutomation, slaClockTick]
  );

  const handleStartAutoOffer = useCallback(
    async (trip: Trip) => {
      if (!trip?.id || inFlightCascadeIdsRef.current.has(trip.id)) return;
      inFlightCascadeIdsRef.current.add(trip.id);
      autoOfferStartedIdsRef.current.add(trip.id);

      try {
        const res = await startOfferCascade({
          trip,
          drivers,
          zones: dispatchZones,
          config: settings.dispatchAutomation,
          fleetVehicles: settings.fleet,
          activeTrips: trips,
          vehicleTiers: settings.vehicles,
          actorRole: user?.role === 'admin' ? 'admin' : 'dispatcher',
          actorId: user?.uid,
        });

        setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));

        if (res.outcome === 'offered' && res.candidate) {
          showDispatchToast(
            `Offering Trip #${trip.id.slice(-6).toUpperCase()} to ${res.candidate.driverLabel} (Step 1/${
              res.trip.offerCascade?.maxAttempts || 3
            } · ${res.trip.offerCascade?.timeoutSeconds || 45}s).`,
            'info'
          );
        } else if (res.outcome === 'exhausted') {
          showDispatchToast(
            `Auto-Offer Cascade: No eligible available drivers matched Trip #${trip.id
              .slice(-6)
              .toUpperCase()}.`,
            'error'
          );
        }
      } catch (err) {
        console.error('[Dispatch] Failed to start Auto-Offer Cascade:', err);
        showDispatchToast('Failed to start Auto-Offer Cascade.', 'error');
      } finally {
        inFlightCascadeIdsRef.current.delete(trip.id);
      }
    },
    [
      drivers,
      dispatchZones,
      settings.dispatchAutomation,
      settings.fleet,
      settings.vehicles,
      trips,
      user,
      setTrips,
      setReviewTrip,
      showDispatchToast,
    ]
  );

  const handleCancelAutoOffer = useCallback(
    async (trip: Trip) => {
      if (!trip?.id || inFlightCascadeIdsRef.current.has(trip.id)) return;
      inFlightCascadeIdsRef.current.add(trip.id);

      try {
        const res = await cancelOfferCascade({
          trip,
          actorRole: user?.role === 'admin' ? 'admin' : 'dispatcher',
          actorId: user?.uid,
        });

        setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));
        showDispatchToast(
          `Offer cascade cancelled for Trip #${trip.id.slice(-6).toUpperCase()}.`,
          'info'
        );
      } catch (err) {
        console.error('[Dispatch] Failed to cancel Offer Cascade:', err);
        showDispatchToast('Failed to cancel Offer Cascade.', 'error');
      } finally {
        inFlightCascadeIdsRef.current.delete(trip.id);
      }
    },
    [user, setTrips, setReviewTrip, showDispatchToast]
  );

  const autoOfferContextRef = useRef({
    autoOfferOnConfirm: Boolean(settings.dispatchAutomation?.autoOfferOnConfirm),
    handleStartAutoOffer,
  });
  autoOfferContextRef.current = {
    autoOfferOnConfirm: Boolean(settings.dispatchAutomation?.autoOfferOnConfirm),
    handleStartAutoOffer,
  };

  const coordinatorStateRef = useRef({
    trips,
    drivers,
    dispatchZones,
    settings,
    showDispatchToast,
  });
  coordinatorStateRef.current = {
    trips,
    drivers,
    dispatchZones,
    settings,
    showDispatchToast,
  };

  useEffect(() => {
    const runCoordinatorTick = () => {
      const {
        trips: latestTrips,
        drivers: latestDrivers,
        dispatchZones: latestZones,
        settings: latestSettings,
        showDispatchToast: toastFn,
      } = coordinatorStateRef.current;

      if (!latestTrips || latestTrips.length === 0) return;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const bookingSvc = getBookingService();

      // 1. Evaluate Scheduled SLA threshold transitions (once per trip into warning / critical)
      const currentSlaScan = scanUpcomingUnassignedSlaTrips(
        latestTrips,
        latestSettings.dispatchAutomation,
        { nowMs }
      );

      for (const { trip, sla } of currentSlaScan.atRiskTrips) {
        if (!slaNotifiedLevelsRef.current.has(trip.id)) {
          if (trip.slaStatus?.criticalNotifiedAt) {
            slaNotifiedLevelsRef.current.set(trip.id, 'critical');
          } else if (trip.slaStatus?.warningNotifiedAt) {
            slaNotifiedLevelsRef.current.set(trip.id, 'warning');
          }
        }

        const prevLevel = slaNotifiedLevelsRef.current.get(trip.id);

        if ((sla.level === 'critical' || sla.level === 'overdue') && prevLevel !== 'critical') {
          slaNotifiedLevelsRef.current.set(trip.id, 'critical');
          soundNotificationService.playSlaWarningChime();
          void pushNotificationService.notifyDispatchAlert({
            title: `SLA ${sla.level.toUpperCase()}: Trip #${trip.id.slice(-6).toUpperCase()} (${
              sla.badgeLabel
            })`,
            body: `Unassigned scheduled ride: ${trip.pickupLocation?.address || 'Pickup'} → ${
              trip.dropoffLocation?.address || 'Destination'
            }`,
            url: `/app/dispatch?tripId=${encodeURIComponent(trip.id)}`,
            tag: `ct-sla-crit-${trip.id}`,
            requireInteraction: true,
          });
          toastFn(
            `SLA ${sla.level.toUpperCase()}: Scheduled Trip #${trip.id.slice(-6).toUpperCase()} (${
              sla.badgeLabel
            }) is unassigned!`,
            'error'
          );

          if (bookingSvc.updateTrip && !trip.slaStatus?.criticalNotifiedAt) {
            const nextSla = buildTripSlaStatusPatch(trip.slaStatus, sla, {
              warningNotifiedAt: trip.slaStatus?.warningNotifiedAt || nowIso,
              criticalNotifiedAt: nowIso,
            });
            bookingSvc.updateTrip(trip.id, { slaStatus: nextSla }).catch(() => {});
          }
        } else if (sla.level === 'warning' && !prevLevel) {
          slaNotifiedLevelsRef.current.set(trip.id, 'warning');
          soundNotificationService.playSlaWarningChime();
          void pushNotificationService.notifyDispatchAlert({
            title: `SLA Warning: Trip #${trip.id.slice(-6).toUpperCase()} (${sla.badgeLabel})`,
            body: `Unassigned scheduled pickup: ${trip.pickupLocation?.address || 'Pickup'}`,
            url: `/app/dispatch?tripId=${encodeURIComponent(trip.id)}`,
            tag: `ct-sla-warn-${trip.id}`,
          });

          if (bookingSvc.updateTrip && !trip.slaStatus?.warningNotifiedAt) {
            const nextSla = buildTripSlaStatusPatch(trip.slaStatus, sla, {
              warningNotifiedAt: nowIso,
            });
            bookingSvc.updateTrip(trip.id, { slaStatus: nextSla }).catch(() => {});
          }
        }
      }

      // 2. Advance or Expire Active Offer Cascades
      for (const trip of latestTrips) {
        const cascade = trip.offerCascade;
        if (!cascade || cascade.state !== 'active') continue;
        if (inFlightCascadeIdsRef.current.has(trip.id)) continue;

        const activeDriverId = cascade.activeOfferedDriverId;
        const wasDeclined =
          !activeDriverId ||
          !Array.isArray(trip.offeredToIds) ||
          !trip.offeredToIds.includes(activeDriverId) ||
          (Array.isArray(trip.rejectedByIds) && trip.rejectedByIds.includes(activeDriverId));
        const expiresMs = Date.parse(cascade.offerExpiresAt);
        const isExpired = Number.isFinite(expiresMs) && nowMs >= expiresMs;
        const isAccepted = Boolean(trip.assignedDriverId);

        if (!wasDeclined && !isExpired && !isAccepted) {
          continue;
        }

        inFlightCascadeIdsRef.current.add(trip.id);
        advanceOrExpireOfferCascade({
          trip,
          drivers: latestDrivers,
          zones: latestZones,
          config: latestSettings.dispatchAutomation,
          fleetVehicles: latestSettings.fleet,
          activeTrips: latestTrips,
          vehicleTiers: latestSettings.vehicles,
          nowMs,
        })
          .then((res) => {
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
            setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));

            if (res.outcome === 'advanced' && res.candidate) {
              toastFn(
                `Cascade Step ${res.trip.offerCascade?.cascadeAttempt}/${
                  res.trip.offerCascade?.maxAttempts
                }: Rolled over Trip #${trip.id.slice(-6).toUpperCase()} to ${res.candidate.driverLabel}.`,
                'info'
              );
            } else if (res.outcome === 'exhausted') {
              soundNotificationService.playSlaWarningChime();
              void pushNotificationService.notifyDispatchAlert({
                title: `Offer Cascade Exhausted — Trip #${trip.id.slice(-6).toUpperCase()}`,
                body: `No driver accepted after ${
                  res.trip.offerCascade?.attemptedDriverIds.length || 0
                } attempt(s). Manual assignment needed.`,
                url: `/app/dispatch?tripId=${encodeURIComponent(trip.id)}`,
                tag: `ct-cascade-exhausted-${trip.id}`,
                requireInteraction: true,
              });
              toastFn(
                `Offer Cascade exhausted for Trip #${trip.id
                  .slice(-6)
                  .toUpperCase()} — assign a driver manually.`,
                'error'
              );
            }
          })
          .catch((err) => {
            console.warn('[Dispatch] Cascade coordinator tick warning:', err);
          })
          .finally(() => {
            inFlightCascadeIdsRef.current.delete(trip.id);
          });
      }
    };

    runCoordinatorTick();
    const interval = setInterval(runCoordinatorTick, 3000);
    return () => clearInterval(interval);
  }, [trips, setTrips, setReviewTrip]);

  return {
    slaSummary,
    handleStartAutoOffer,
    handleCancelAutoOffer,
    autoOfferStartedIdsRef,
    autoOfferContextRef,
  };
}
