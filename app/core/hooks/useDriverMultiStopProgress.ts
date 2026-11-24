import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UniversalExtrasConfig } from '../types/config';
import type { Trip } from '../types/trip';
import { getBookingService } from '../services/booking';
import {
  getAdminConfigService,
  normalizeDriverAppPoliciesConfig,
} from '../services/config/admin-config.service';
import {
  DEFAULT_UNIVERSAL_EXTRAS,
  getUniversalExtrasService,
} from '../services/pricing/extras.service';
import {
  buildArriveAtStopUpdate,
  buildCompleteStopUpdate,
  buildResetStopToPendingUpdate,
  buildSkipStopUpdate,
  computeStopWaitTimerState,
  summarizeTripStopProgress,
  type StopWaitTimerState,
  type TripStopProgressSummary,
} from '../services/driver/driver-stop-progress';

export interface UseDriverMultiStopProgressParams {
  activeTrip: Trip | null;
  setAllDriverTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  onSuccessNotice?: (message: string) => void;
  onErrorNotice?: (message: string) => void;
}

export interface DriverMultiStopProgressController {
  extrasConfig: UniversalExtrasConfig;
  activeSummary: TripStopProgressSummary;
  activeWaitTimer: StopWaitTimerState;
  stopActionLoading: string | null;
  arriveAtStop: (trip: Trip, stopIndex: number) => Promise<void>;
  completeStopAndResume: (
    trip: Trip,
    stopIndex: number,
    opts?: { applySuggestedWaitFee?: boolean }
  ) => Promise<void>;
  skipStop: (trip: Trip, stopIndex: number) => Promise<void>;
  resetStopToPending: (trip: Trip, stopIndex: number) => Promise<void>;
}

export function useDriverMultiStopProgress({
  activeTrip,
  setAllDriverTrips,
  onSuccessNotice,
  onErrorNotice,
}: UseDriverMultiStopProgressParams): DriverMultiStopProgressController {
  const [baseExtrasConfig, setBaseExtrasConfig] =
    useState<UniversalExtrasConfig>(DEFAULT_UNIVERSAL_EXTRAS);
  const [driverAppOverrides, setDriverAppOverrides] = useState(() =>
    normalizeDriverAppPoliciesConfig(
      getAdminConfigService().getCachedSettings().driverAppConfig,
      DEFAULT_UNIVERSAL_EXTRAS
    )
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [stopActionLoading, setStopActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const svc = getUniversalExtrasService();
    const unsubExtras = svc.subscribeToExtras((cfg) => {
      setBaseExtrasConfig(cfg);
    });
    const unsubSettings = getAdminConfigService().subscribeToSettings((s) => {
      setDriverAppOverrides(
        normalizeDriverAppPoliciesConfig(s.driverAppConfig, svc.getCached())
      );
    });
    return () => {
      unsubExtras();
      if (typeof unsubSettings === 'function') unsubSettings();
    };
  }, []);

  const extrasConfig = useMemo<UniversalExtrasConfig>(
    () => ({
      ...baseExtrasConfig,
      intermediateStopFreeWaitingMinutes:
        driverAppOverrides.intermediateStopFreeWaitingMinutes ??
        baseExtrasConfig.intermediateStopFreeWaitingMinutes ??
        5,
      curbWaitingRatePerMinute:
        driverAppOverrides.intermediateStopExcessWaitRatePerMinute ??
        baseExtrasConfig.curbWaitingRatePerMinute ??
        0.5,
      waitingRatePerMinute:
        driverAppOverrides.intermediateStopExcessWaitRatePerMinute ??
        baseExtrasConfig.waitingRatePerMinute ??
        0.5,
    }),
    [baseExtrasConfig, driverAppOverrides]
  );

  const activeSummary = useMemo(() => summarizeTripStopProgress(activeTrip), [activeTrip]);

  const hasLiveArrivedStop =
    activeTrip?.status === 'in_progress' && Boolean(activeSummary.activeArrivedEntry);

  useEffect(() => {
    if (!hasLiveArrivedStop) return;
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [
    hasLiveArrivedStop,
    activeTrip?.id,
    activeSummary.activeArrivedEntry?.stopIndex,
    activeSummary.activeArrivedEntry?.arrivedAt,
  ]);

  const activeWaitTimer = useMemo(
    () => computeStopWaitTimerState(activeSummary.activeArrivedEntry, nowMs, extrasConfig),
    [activeSummary.activeArrivedEntry, nowMs, extrasConfig]
  );

  const persistStopUpdate = useCallback(
    async (
      trip: Trip,
      updates: Partial<Trip>,
      loadingKey: string,
      successMessage?: string
    ): Promise<void> => {
      const bookingService = getBookingService();
      const nowIso = new Date().toISOString();

      setStopActionLoading(loadingKey);
      setAllDriverTrips((prev) =>
        prev.map((item) =>
          item.id === trip.id
            ? {
                ...item,
                ...updates,
                updatedAt: nowIso,
              }
            : item
        )
      );

      try {
        if (bookingService.updateTrip) {
          const saved = await bookingService.updateTrip(trip.id, updates);
          if (saved?.id) {
            setAllDriverTrips((prev) =>
              prev.map((item) => (item.id === saved.id ? saved : item))
            );
          }
        }
        if (successMessage) {
          onSuccessNotice?.(successMessage);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Failed to update intermediate stop status.';
        onErrorNotice?.(msg);
      } finally {
        setStopActionLoading(null);
      }
    },
    [setAllDriverTrips, onSuccessNotice, onErrorNotice]
  );

  const arriveAtStop = useCallback(
    async (trip: Trip, stopIndex: number) => {
      const nowIso = new Date().toISOString();
      setNowMs(Date.parse(nowIso));
      const updates = buildArriveAtStopUpdate(trip, stopIndex, nowIso, extrasConfig);
      const displayNumber =
        summarizeTripStopProgress(trip).entries.findIndex((e) => e.stopIndex === stopIndex) + 1 ||
        stopIndex + 1;
      await persistStopUpdate(
        trip,
        updates,
        `arrive-${stopIndex}`,
        `Arrived at Stop #${displayNumber} — ${extrasConfig.intermediateStopFreeWaitingMinutes}m free wait timer started.`
      );
    },
    [extrasConfig, persistStopUpdate]
  );

  const completeStopAndResume = useCallback(
    async (trip: Trip, stopIndex: number, opts?: { applySuggestedWaitFee?: boolean }) => {
      const nowIso = new Date().toISOString();
      const displayNumber =
        summarizeTripStopProgress(trip).entries.findIndex((e) => e.stopIndex === stopIndex) + 1 ||
        stopIndex + 1;

      const { updates, waitFeeApplied } = buildCompleteStopUpdate({
        trip,
        stopIndex,
        nowIso,
        extrasConfig,
        applySuggestedWaitFee: opts?.applySuggestedWaitFee,
      });

      const notice =
        waitFeeApplied > 0
          ? `Stop #${displayNumber} completed (+$${waitFeeApplied.toFixed(2)} wait fee added). Resuming route.`
          : `Stop #${displayNumber} completed. Resuming route.`;

      await persistStopUpdate(trip, updates, `complete-${stopIndex}`, notice);
    },
    [extrasConfig, persistStopUpdate]
  );

  const skipStop = useCallback(
    async (trip: Trip, stopIndex: number) => {
      const nowIso = new Date().toISOString();
      const displayNumber =
        summarizeTripStopProgress(trip).entries.findIndex((e) => e.stopIndex === stopIndex) + 1 ||
        stopIndex + 1;
      const updates = buildSkipStopUpdate(trip, stopIndex, nowIso);
      await persistStopUpdate(
        trip,
        updates,
        `skip-${stopIndex}`,
        `Stop #${displayNumber} marked skipped.`
      );
    },
    [persistStopUpdate]
  );

  const resetStopToPending = useCallback(
    async (trip: Trip, stopIndex: number) => {
      const displayNumber =
        summarizeTripStopProgress(trip).entries.findIndex((e) => e.stopIndex === stopIndex) + 1 ||
        stopIndex + 1;
      const updates = buildResetStopToPendingUpdate(trip, stopIndex);
      await persistStopUpdate(
        trip,
        updates,
        `reset-${stopIndex}`,
        `Stop #${displayNumber} reset to pending.`
      );
    },
    [persistStopUpdate]
  );

  return {
    extrasConfig,
    activeSummary,
    activeWaitTimer,
    stopActionLoading,
    arriveAtStop,
    completeStopAndResume,
    skipStop,
    resetStopToPending,
  };
}
