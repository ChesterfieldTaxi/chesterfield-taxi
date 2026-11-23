import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { AdminUser } from '../../services/auth/admin-auth.service';
import { getBookingService } from '../../services/booking';
import {
  canOperatorConfigureLeadWindows,
  getAdminConfigService,
  normalizeDispatchAutomationConfig,
} from '../../services/config/admin-config.service';
import type { AppSettings, ConfigAuditEntry } from '../../types/config';
import type { Trip } from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import type { LiveFleetDriver } from '../useDispatchFleet';
import {
  advanceOrExpireOfferCascade,
  buildTripSlaStatusPatch,
  cancelOfferCascade,
  executeAutoDispatch,
  formatShortTripNumber,
  getDueStagedTripsForAutoRelease,
  getReadyForAutoDispatchTrips,
  isTripEligibleForAutoPilot,
  releaseDueStagedTrips,
  runReadyAutoDispatchSweep,
  scanUpcomingUnassignedSlaTrips,
  shouldAdvanceActiveCascade,
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
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  user: AdminUser | null;
  showDispatchToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  onPublishTacticalAlert?: (text: string, toLabel?: string) => void;
}

export interface UseDispatchSlaCascadeLoopResult {
  slaSummary: SlaScanSummary;
  readyForAutoDispatchTrips: Trip[];
  isRunningReadySweep: boolean;
  handleStartAutoOffer: (trip: Trip) => Promise<void>;
  handleCancelAutoOffer: (trip: Trip) => Promise<void>;
  handleRunAutoDispatchSweep: (options?: { includeExhausted?: boolean }) => Promise<void>;
  handleToggleAutoPilotPause: () => Promise<void>;
  handleUpdateDispatchLeadWindows: (updates: {
    scheduledDispatchLeadMinutes: number;
    airportExtraLeadMinutes: number;
    autoReleaseStagedDrivers?: boolean;
    stagedAutoReleaseLeadMinutes?: number;
  }) => Promise<void>;
  autoOfferStartedIdsRef: React.MutableRefObject<Set<string>>;
  autoOfferContextRef: React.MutableRefObject<{
    autoOfferOnConfirm: boolean;
    isEligibleForAutoPilot: (trip: Trip) => boolean;
    handleStartAutoOffer: (trip: Trip) => Promise<void>;
  }>;
}

/**
 * Periodic SLA urgency scanner (15s UI refresh + 3s coordinator tick),
 * Pre-Pickup Lead-Window Auto-Pilot coordinator, and 1-click Ready Sweep controller.
 */
export function useDispatchSlaCascadeLoop({
  trips,
  setTrips,
  setReviewTrip,
  drivers,
  dispatchZones,
  settings,
  setSettings,
  user,
  showDispatchToast,
  onPublishTacticalAlert,
}: UseDispatchSlaCascadeLoopParams): UseDispatchSlaCascadeLoopResult {
  // Deterministic SSR initial timestamp (0 = scan uses default Date.now() once hydrated)
  const [slaClockTick, setSlaClockTick] = useState<number>(0);
  const [isRunningReadySweep, setIsRunningReadySweep] = useState<boolean>(false);
  const inFlightCascadeIdsRef = useRef<Set<string>>(new Set());
  const inFlightStagedReleaseRef = useRef<boolean>(false);
  const stagedReleaseAlertedKeysRef = useRef<Set<string>>(new Set());
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

  const readyForAutoDispatchTrips = useMemo(
    () =>
      getReadyForAutoDispatchTrips(
        trips,
        settings.dispatchAutomation,
        slaClockTick > 0 ? slaClockTick : undefined
      ),
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

        if (res.outcome === 'assigned' && res.candidate) {
          showDispatchToast(
            `Auto-assigned Trip #${trip.id.slice(-6).toUpperCase()} to ${res.candidate.driverLabel}.`,
            'success'
          );
        } else if (res.outcome === 'offered' && res.candidate) {
          const poolCount = res.offeredCandidates?.length || 1;
          if (res.mode === 'broadcast_pool' && poolCount > 1) {
            showDispatchToast(
              `Broadcast Trip #${trip.id.slice(-6).toUpperCase()} to Top-${poolCount} pool (${
                res.trip.offerCascade?.timeoutSeconds || 45
              }s window).`,
              'info'
            );
          } else {
            showDispatchToast(
              `Offering Trip #${trip.id.slice(-6).toUpperCase()} to ${
                res.candidate.driverLabel
              } (Step 1/${res.trip.offerCascade?.maxAttempts || 3} · ${
                res.trip.offerCascade?.timeoutSeconds || 45
              }s).`,
              'info'
            );
          }
        } else if (res.outcome === 'exhausted') {
          showDispatchToast(
            `Auto-Dispatch: No eligible available drivers matched Trip #${trip.id
              .slice(-6)
              .toUpperCase()}.`,
            'error'
          );
        }
      } catch (err) {
        console.error('[Dispatch] Failed to start Auto-Dispatch:', err);
        showDispatchToast('Failed to start Auto-Dispatch.', 'error');
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

  const handleRunAutoDispatchSweep = useCallback(
    async (options?: { includeExhausted?: boolean }) => {
      if (isRunningReadySweep) return;
      setIsRunningReadySweep(true);
      try {
        const summary = await runReadyAutoDispatchSweep({
          trips,
          drivers,
          zones: dispatchZones,
          config: settings.dispatchAutomation,
          fleetVehicles: settings.fleet,
          vehicleTiers: settings.vehicles,
          actorRole: user?.role === 'admin' ? 'admin' : 'dispatcher',
          actorId: user?.uid,
          includeExhausted: options?.includeExhausted,
          nowMs: Date.now(),
        });

        if (summary.readyCount === 0) {
          showDispatchToast(
            'No open trips are currently inside the Pre-Pickup Lead Window.',
            'info'
          );
          return;
        }

        const updatedById = new Map(summary.updatedTrips.map((t) => [t.id, t]));
        setTrips((prev) => prev.map((t) => updatedById.get(t.id) || t));
        setReviewTrip((prev) => (prev ? updatedById.get(prev.id) || prev : null));

        for (const r of summary.results) {
          autoOfferStartedIdsRef.current.add(r.trip.id);
        }

        if (summary.dispatchedCount > 0 && summary.exhaustedCount > 0) {
          showDispatchToast(
            `Auto-dispatched ${summary.dispatchedCount} ready trip(s); ${summary.exhaustedCount} had no eligible drivers.`,
            'info'
          );
        } else if (summary.dispatchedCount > 0) {
          showDispatchToast(
            `Auto-dispatched ${summary.dispatchedCount} ready trip(s) via ${summary.mode.replace(
              /_/g,
              ' '
            )}.`,
            'success'
          );
        } else {
          showDispatchToast(
            `Sweep checked ${summary.readyCount} ready trip(s) — 0 eligible on-duty drivers matched.`,
            'error'
          );
        }
      } catch (err) {
        console.error('[Dispatch] Ready Auto-Dispatch sweep failed:', err);
        showDispatchToast('Failed to run Auto-Dispatch Ready sweep.', 'error');
      } finally {
        setIsRunningReadySweep(false);
      }
    },
    [
      isRunningReadySweep,
      trips,
      drivers,
      dispatchZones,
      settings.dispatchAutomation,
      settings.fleet,
      settings.vehicles,
      user,
      setTrips,
      setReviewTrip,
      showDispatchToast,
    ]
  );

  const handleToggleAutoPilotPause = useCallback(async () => {
    const prevConfig = normalizeDispatchAutomationConfig(settings.dispatchAutomation);
    if (prevConfig.dispatchMode === 'manual_1tap') return;

    const nextPaused = !prevConfig.isPaused;
    const nowIso = new Date().toISOString();
    const actorIdentity = user?.email || user?.uid || 'dispatcher';

    const nextConfig = normalizeDispatchAutomationConfig({
      ...prevConfig,
      isPaused: nextPaused,
      pausedAt: nextPaused ? nowIso : undefined,
      pausedBy: nextPaused ? actorIdentity : undefined,
    });

    const auditEntry: ConfigAuditEntry = {
      id: `aud-autopilot-${Date.now()}`,
      timestamp: nowIso,
      operatorId: user?.uid || actorIdentity,
      operatorEmail: user?.email || actorIdentity,
      tab: 'rules',
      section: 'auto_dispatch',
      action: nextPaused
        ? `Paused Auto-Pilot (${prevConfig.dispatchMode}) from Dispatch Console`
        : `Resumed Auto-Pilot (${prevConfig.dispatchMode}) from Dispatch Console`,
      ipAddress: 'dispatch_console',
      changes: {
        isPaused: { before: prevConfig.isPaused, after: nextPaused },
      },
    };

    try {
      const updatedSettings = await getAdminConfigService().updateSettings({
        dispatchAutomation: nextConfig,
        configAuditTrail: [auditEntry, ...(settings.configAuditTrail || [])].slice(0, 200),
      });
      setSettings?.(updatedSettings);
      showDispatchToast(
        nextPaused
          ? 'Auto-Pilot paused. Open rides remain ready for 1-click sweep or manual triage.'
          : `Auto-Pilot resumed (${nextConfig.dispatchMode.replace(/_/g, ' ')}).`,
        nextPaused ? 'info' : 'success'
      );
    } catch (err) {
      console.error('[Dispatch] Failed to toggle Auto-Pilot pause:', err);
      showDispatchToast('Failed to update Auto-Pilot state.', 'error');
    }
  }, [settings.dispatchAutomation, settings.configAuditTrail, user, setSettings, showDispatchToast]);

  const handleUpdateDispatchLeadWindows = useCallback(
    async (updates: {
      scheduledDispatchLeadMinutes: number;
      airportExtraLeadMinutes: number;
      autoReleaseStagedDrivers?: boolean;
      stagedAutoReleaseLeadMinutes?: number;
    }) => {
      const prevConfig = normalizeDispatchAutomationConfig(settings.dispatchAutomation);
      if (!canOperatorConfigureLeadWindows(user, prevConfig)) {
        showDispatchToast(
          'Only Administrators or authorized dispatchers can adjust Lead Windows.',
          'error'
        );
        return;
      }

      const nextConfig = normalizeDispatchAutomationConfig({
        ...prevConfig,
        scheduledDispatchLeadMinutes: updates.scheduledDispatchLeadMinutes,
        airportExtraLeadMinutes: updates.airportExtraLeadMinutes,
        ...(updates.autoReleaseStagedDrivers !== undefined
          ? { autoReleaseStagedDrivers: updates.autoReleaseStagedDrivers }
          : {}),
        ...(updates.stagedAutoReleaseLeadMinutes !== undefined
          ? { stagedAutoReleaseLeadMinutes: updates.stagedAutoReleaseLeadMinutes }
          : {}),
      });

      const nowIso = new Date().toISOString();
      const actorIdentity = user?.email || user?.uid || 'dispatcher';
      const auditEntry: ConfigAuditEntry = {
        id: `aud-leadwin-${Date.now()}`,
        timestamp: nowIso,
        operatorId: user?.uid || actorIdentity,
        operatorEmail: user?.email || actorIdentity,
        tab: 'rules',
        section: 'auto_dispatch',
        action: `Updated Lead Windows (${nextConfig.scheduledDispatchLeadMinutes}m standard · +${nextConfig.airportExtraLeadMinutes}m airport · Staged Auto-Release ${nextConfig.autoReleaseStagedDrivers ? `${nextConfig.stagedAutoReleaseLeadMinutes}m` : 'Off'}) from Dispatch Console`,
        ipAddress: 'dispatch_console',
        changes: {
          scheduledDispatchLeadMinutes: {
            before: prevConfig.scheduledDispatchLeadMinutes,
            after: nextConfig.scheduledDispatchLeadMinutes,
          },
          airportExtraLeadMinutes: {
            before: prevConfig.airportExtraLeadMinutes,
            after: nextConfig.airportExtraLeadMinutes,
          },
          autoReleaseStagedDrivers: {
            before: prevConfig.autoReleaseStagedDrivers,
            after: nextConfig.autoReleaseStagedDrivers,
          },
          stagedAutoReleaseLeadMinutes: {
            before: prevConfig.stagedAutoReleaseLeadMinutes,
            after: nextConfig.stagedAutoReleaseLeadMinutes,
          },
        },
      };

      try {
        const updatedSettings = await getAdminConfigService().updateSettings({
          dispatchAutomation: nextConfig,
          configAuditTrail: [auditEntry, ...(settings.configAuditTrail || [])].slice(0, 200),
        });
        setSettings?.(updatedSettings);
        showDispatchToast(
          `Saved Lead Windows (${nextConfig.scheduledDispatchLeadMinutes}m · Staged Release: ${
            nextConfig.autoReleaseStagedDrivers
              ? `${nextConfig.stagedAutoReleaseLeadMinutes}m`
              : 'Off'
          }).`,
          'success'
        );
      } catch (err) {
        console.error('[Dispatch] Failed to save Lead Window:', err);
        showDispatchToast('Failed to save Pre-Pickup Lead Window.', 'error');
      }
    },
    [settings.dispatchAutomation, settings.configAuditTrail, user, setSettings, showDispatchToast]
  );

  const normalizedAutoConfig = useMemo(
    () => normalizeDispatchAutomationConfig(settings.dispatchAutomation),
    [settings.dispatchAutomation]
  );

  const autoOfferContextRef = useRef({
    autoOfferOnConfirm: normalizedAutoConfig.dispatchMode !== 'manual_1tap' && !normalizedAutoConfig.isPaused,
    isEligibleForAutoPilot: (trip: Trip) =>
      isTripEligibleForAutoPilot(trip, normalizedAutoConfig),
    handleStartAutoOffer,
  });
  autoOfferContextRef.current = {
    autoOfferOnConfirm: normalizedAutoConfig.dispatchMode !== 'manual_1tap' && !normalizedAutoConfig.isPaused,
    isEligibleForAutoPilot: (trip: Trip) =>
      isTripEligibleForAutoPilot(trip, normalizedAutoConfig),
    handleStartAutoOffer,
  };

  const coordinatorStateRef = useRef({
    trips,
    drivers,
    dispatchZones,
    settings,
    showDispatchToast,
    onPublishTacticalAlert,
  });
  coordinatorStateRef.current = {
    trips,
    drivers,
    dispatchZones,
    settings,
    showDispatchToast,
    onPublishTacticalAlert,
  };

  useEffect(() => {
    const runCoordinatorTick = () => {
      const {
        trips: latestTrips,
        drivers: latestDrivers,
        dispatchZones: latestZones,
        settings: latestSettings,
        showDispatchToast: toastFn,
        onPublishTacticalAlert: publishAlertFn,
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

      // 2. Advance or Expire Active Offer Cascades (Sequential & Top-K Broadcast Pool)
      for (const trip of latestTrips) {
        if (!shouldAdvanceActiveCascade(trip, nowMs)) continue;
        if (inFlightCascadeIdsRef.current.has(trip.id)) continue;

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
              const poolSize = res.offeredCandidates?.length || 1;
              if (res.mode === 'broadcast_pool' && poolSize > 1) {
                toastFn(
                  `Broadcast Pool Batch ${res.trip.offerCascade?.cascadeAttempt}: Offered Trip #${trip.id
                    .slice(-6)
                    .toUpperCase()} to ${poolSize} drivers.`,
                  'info'
                );
              } else {
                toastFn(
                  `Cascade Step ${res.trip.offerCascade?.cascadeAttempt}/${
                    res.trip.offerCascade?.maxAttempts
                  }: Rolled over Trip #${trip.id.slice(-6).toUpperCase()} to ${
                    res.candidate.driverLabel
                  }.`,
                  'info'
                );
              }
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

      // 2.5. Staged Driver Auto-Release Window Pass (Phase 51)
      if (!inFlightStagedReleaseRef.current) {
        const dueStaged = getDueStagedTripsForAutoRelease(
          latestTrips,
          latestSettings.dispatchAutomation,
          nowMs
        ).filter((t) => !inFlightCascadeIdsRef.current.has(t.id));

        if (dueStaged.length > 0) {
          inFlightStagedReleaseRef.current = true;
          releaseDueStagedTrips({
            trips: latestTrips,
            drivers: latestDrivers,
            settings: latestSettings,
            actorName: 'Staged Auto-Release',
            nowMs,
          })
            .then((relRes) => {
              if (relRes.releasedTrips.length > 0) {
                const releasedMap = new Map(relRes.releasedTrips.map((t) => [t.id, t]));
                setTrips((prev) => prev.map((t) => releasedMap.get(t.id) || t));
                setReviewTrip((prev) => (prev ? releasedMap.get(prev.id) || prev : null));

                for (const rt of relRes.releasedTrips) {
                  const prevLabel =
                    (rt.metadata as Record<string, any> | undefined)
                      ?.previouslyPlannedDriverLabel ||
                    (rt.metadata as Record<string, any> | undefined)?.assignedDriverName ||
                    rt.assignedDriverId ||
                    'driver';
                  toastFn(
                    `Auto-released staged Trip #${formatShortTripNumber(rt.id)} to ${prevLabel}.`,
                    'success'
                  );
                }
              }

              for (const alert of relRes.alerts) {
                const dedupKey = `${alert.tripId}:${alert.driverId}:${alert.reason}`;
                if (stagedReleaseAlertedKeysRef.current.has(dedupKey)) continue;
                stagedReleaseAlertedKeysRef.current.add(dedupKey);

                soundNotificationService.playSlaWarningChime();
                toastFn(alert.message, 'error');
                publishAlertFn?.(alert.message, 'Staged Auto-Release');
                void pushNotificationService.notifyDispatchAlert({
                  title: `Staged Driver Alert — Trip #${formatShortTripNumber(alert.tripId)}`,
                  body: alert.message,
                  url: `/app/dispatch?tripId=${encodeURIComponent(alert.tripId)}`,
                  tag: `ct-staged-alert-${alert.tripId}-${alert.reason}`,
                  requireInteraction: true,
                });
              }
            })
            .catch((err) => {
              console.warn('[Dispatch] Staged auto-release tick warning:', err);
            })
            .finally(() => {
              inFlightStagedReleaseRef.current = false;
            });
        }
      }

      // 3. Auto-Pilot Continuous Pre-Pickup Lead-Window Sweep (when active & unpaused)
      if (latestDrivers.length > 0) {
        for (const trip of latestTrips) {
          if (inFlightCascadeIdsRef.current.has(trip.id)) continue;
          // Trips with an active staged driver placeholder are managed by Staged Auto-Release above
          if (trip.plannedDriverId) continue;
          if (!isTripEligibleForAutoPilot(trip, latestSettings.dispatchAutomation, nowMs)) {
            continue;
          }

          inFlightCascadeIdsRef.current.add(trip.id);
          autoOfferStartedIdsRef.current.add(trip.id);
          executeAutoDispatch({
            trip,
            drivers: latestDrivers,
            zones: latestZones,
            config: latestSettings.dispatchAutomation,
            fleetVehicles: latestSettings.fleet,
            activeTrips: latestTrips,
            vehicleTiers: latestSettings.vehicles,
            actorRole: 'system',
            nowMs,
          })
            .then((res) => {
              setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
              setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));

              if (res.outcome === 'assigned' && res.candidate) {
                toastFn(
                  `Auto-Pilot assigned Trip #${trip.id.slice(-6).toUpperCase()} to ${
                    res.candidate.driverLabel
                  }.`,
                  'success'
                );
              } else if (res.outcome === 'offered' && res.candidate) {
                const count = res.offeredCandidates?.length || 1;
                toastFn(
                  res.mode === 'broadcast_pool' && count > 1
                    ? `Auto-Pilot broadcast Trip #${trip.id
                        .slice(-6)
                        .toUpperCase()} to ${count} drivers.`
                    : `Auto-Pilot offered Trip #${trip.id.slice(-6).toUpperCase()} to ${
                        res.candidate.driverLabel
                      }.`,
                  'info'
                );
              }
            })
            .catch((err) => {
              console.warn('[Dispatch] Auto-Pilot coordinator tick warning:', err);
            })
            .finally(() => {
              inFlightCascadeIdsRef.current.delete(trip.id);
            });
        }
      }
    };

    runCoordinatorTick();
    const interval = setInterval(runCoordinatorTick, 3000);
    return () => clearInterval(interval);
  }, [trips, setTrips, setReviewTrip]);

  return {
    slaSummary,
    readyForAutoDispatchTrips,
    isRunningReadySweep,
    handleStartAutoOffer,
    handleCancelAutoOffer,
    handleRunAutoDispatchSweep,
    handleToggleAutoPilotPause,
    handleUpdateDispatchLeadWindows,
    autoOfferStartedIdsRef,
    autoOfferContextRef,
  };
}
