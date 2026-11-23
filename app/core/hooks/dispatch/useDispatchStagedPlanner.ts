import React, { useState, useMemo, useCallback } from 'react';
import type { AdminUser } from '../../services/auth/admin-auth.service';
import {
  applyAutoStageSuggestions,
  clearStagedDriver,
  computeAutoStageSuggestions,
  executeAutoDispatch,
  formatShortTripNumber,
  hasStagedDriver,
  isTripEligibleForStaging,
  partitionTripsByStagedConflict,
  resolveStagedConflictStrategy,
  sendMultipleStagedTripsToDrivers,
  sendStagedTripToDriver,
  stageDriverForTrip,
  type AutoStageSuggestionItem,
  type StagedConflictResolutionStrategy,
} from '../../services/dispatch';
import { normalizeDispatchAutomationConfig, type AppSettings } from '../../types/config';
import type { Trip } from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import type { LiveFleetDriver } from '../useDispatchFleet';

export type DriverDispatchPlacementMode = 'send_to_driver' | 'stage_hold';

export interface StagedConflictModalState {
  isOpen: boolean;
  sourceLabel: string;
  targetTrips: Trip[];
  stagedTrips: Trip[];
  unstagedTrips: Trip[];
  clearSelectionOnComplete?: boolean;
}

export interface AutoStagePreviewModalState {
  isOpen: boolean;
  suggestions: AutoStageSuggestionItem[];
  unmatchedTripIds: string[];
}

export interface DispatchStagedPlannerController {
  queueAssignMode: DriverDispatchPlacementMode;
  setQueueAssignMode: (mode: DriverDispatchPlacementMode) => void;
  batchAssignMode: DriverDispatchPlacementMode;
  setBatchAssignMode: (mode: DriverDispatchPlacementMode) => void;
  driverPickerMode: DriverDispatchPlacementMode;
  setDriverPickerMode: (mode: DriverDispatchPlacementMode) => void;

  openScheduledUnstagedCount: number;
  stagedInFilteredCount: number;
  selectedStagedCount: number;
  selectedStageableCount: number;
  selectedAutoDispatchableCount: number;
  busyTripIds: ReadonlySet<string>;
  isAutoStaging: boolean;
  isResolvingConflict: boolean;

  stageTripDriver: (trip: Trip, driverId: string) => Promise<void>;
  clearTripStage: (trip: Trip, reason?: string) => Promise<void>;
  sendStagedTrip: (trip: Trip) => Promise<void>;
  sendAllStagedForDriver: (driverId: string) => Promise<void>;
  sendSelectedStagedTrips: () => Promise<void>;
  openBatchStageDriverModal: () => void;
  confirmBatchStageOrAssign: () => Promise<void>;

  autoStageModal: AutoStagePreviewModalState;
  openAutoStagePreview: () => void;
  closeAutoStageModal: () => void;
  confirmApplyAutoStageSuggestions: () => Promise<void>;

  conflictModal: StagedConflictModalState;
  closeConflictModal: () => void;
  resolveConflictModal: (strategy: StagedConflictResolutionStrategy) => Promise<void>;

  requestAutoOfferWithStagedCheck: (trip: Trip) => Promise<void>;
  requestReadySweepWithStagedCheck: () => Promise<void>;
  requestBatchAutoDispatchWithStagedCheck: () => Promise<void>;
}

export interface UseDispatchStagedPlannerParams {
  trips: Trip[];
  filteredTrips: Trip[];
  readyForAutoDispatchTrips: Trip[];
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  setReviewTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  drivers: LiveFleetDriver[];
  dispatchZones: ZoneGeofence[];
  settings: AppSettings;
  user: AdminUser | null;
  selectedTripIds: string[];
  setSelectedTripIds: React.Dispatch<React.SetStateAction<string[]>>;
  batchAssignDriverId: string;
  setBatchAssignDriverId: React.Dispatch<React.SetStateAction<string>>;
  setIsBatchAssignOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rawConfirmBatchAssign: () => Promise<void>;
  rawStartAutoOffer: (trip: Trip) => Promise<void>;
  rawRunAutoDispatchSweep: (options?: { includeExhausted?: boolean }) => Promise<void>;
  showDispatchToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export function useDispatchStagedPlanner({
  trips,
  filteredTrips,
  readyForAutoDispatchTrips,
  setTrips,
  setReviewTrip,
  drivers,
  dispatchZones,
  settings,
  user,
  selectedTripIds,
  setSelectedTripIds,
  batchAssignDriverId,
  setBatchAssignDriverId,
  setIsBatchAssignOpen,
  rawConfirmBatchAssign,
  rawStartAutoOffer,
  rawRunAutoDispatchSweep,
  showDispatchToast,
}: UseDispatchStagedPlannerParams): DispatchStagedPlannerController {
  // Deterministic SSR initial states (no Date.now / localStorage reads on initial render)
  const [queueAssignMode, setQueueAssignMode] =
    useState<DriverDispatchPlacementMode>('send_to_driver');
  const [batchAssignMode, setBatchAssignMode] =
    useState<DriverDispatchPlacementMode>('send_to_driver');
  const [driverPickerMode, setDriverPickerMode] =
    useState<DriverDispatchPlacementMode>('send_to_driver');

  const [busyTripIds, setBusyTripIds] = useState<Set<string>>(() => new Set());
  const [isAutoStaging, setIsAutoStaging] = useState<boolean>(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState<boolean>(false);

  const [autoStageModal, setAutoStageModal] = useState<AutoStagePreviewModalState>({
    isOpen: false,
    suggestions: [],
    unmatchedTripIds: [],
  });

  const [conflictModal, setConflictModal] = useState<StagedConflictModalState>({
    isOpen: false,
    sourceLabel: '',
    targetTrips: [],
    stagedTrips: [],
    unstagedTrips: [],
  });

  const actorName = useMemo(() => {
    if (!user) return 'Dispatcher';
    return user.displayName || user.email || user.uid || 'Dispatcher';
  }, [user]);

  const actorRole: 'admin' | 'dispatcher' = user?.role === 'admin' ? 'admin' : 'dispatcher';

  const markBusy = useCallback((tripId: string, busy: boolean) => {
    setBusyTripIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(tripId);
      else next.delete(tripId);
      return next;
    });
  }, []);

  const openScheduledUnstagedCount = useMemo(
    () =>
      filteredTrips.filter(
        (t) =>
          !t.assignedDriverId &&
          !t.plannedDriverId &&
          !t.isArchived &&
          !t.isBlacklisted &&
          Boolean(t.scheduledPickupTime) &&
          ['CONFIRMED', 'confirmed', 'accepted', 'pending'].includes(t.status)
      ).length,
    [filteredTrips]
  );

  const stagedInFilteredCount = useMemo(
    () => filteredTrips.filter((t) => hasStagedDriver(t)).length,
    [filteredTrips]
  );

  const selectedTrips = useMemo(
    () => trips.filter((t) => selectedTripIds.includes(t.id)),
    [trips, selectedTripIds]
  );

  const selectedStagedCount = useMemo(
    () => selectedTrips.filter((t) => hasStagedDriver(t)).length,
    [selectedTrips]
  );

  const selectedStageableCount = useMemo(
    () => selectedTrips.filter((t) => isTripEligibleForStaging(t)).length,
    [selectedTrips]
  );

  const selectedAutoDispatchableTrips = useMemo(
    () =>
      selectedTrips.filter(
        (t) =>
          !t.assignedDriverId &&
          !t.isArchived &&
          !t.isBlacklisted &&
          ['CONFIRMED', 'confirmed', 'pending'].includes(t.status) &&
          t.offerCascade?.state !== 'active'
      ),
    [selectedTrips]
  );

  const stageTripDriver = useCallback(
    async (trip: Trip, driverId: string) => {
      if (!driverId || driverId === 'unassigned') {
        if (hasStagedDriver(trip)) {
          markBusy(trip.id, true);
          try {
            const cleared = await clearStagedDriver({
              tripId: trip.id,
              trip,
              actorName,
              actorId: user?.uid,
              actorRole,
            });
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? cleared : t)));
            setReviewTrip((prev) => (prev && prev.id === trip.id ? cleared : prev));
            showDispatchToast(
              `Cleared staged driver on Trip #${formatShortTripNumber(trip.id)}.`,
              'info'
            );
          } finally {
            markBusy(trip.id, false);
          }
        }
        return;
      }

      const drv = drivers.find((d) => d.id === driverId);
      if (!drv) {
        showDispatchToast('Selected driver was not found.', 'error');
        return;
      }

      markBusy(trip.id, true);
      try {
        const updated = await stageDriverForTrip({
          tripId: trip.id,
          trip,
          driver: drv,
          actorName,
          actorId: user?.uid,
          actorRole,
        });
        setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? updated : prev));
        showDispatchToast(
          `📌 Staged ${updated.plannedDriverLabel || drv.name} on Trip #${formatShortTripNumber(
            trip.id
          )} (held in Dispatch — not sent to driver yet).`,
          'success'
        );
      } catch (err: unknown) {
        showDispatchToast(
          err instanceof Error ? err.message : 'Failed to stage driver on trip.',
          'error'
        );
      } finally {
        markBusy(trip.id, false);
      }
    },
    [drivers, actorName, user?.uid, actorRole, markBusy, setTrips, setReviewTrip, showDispatchToast]
  );

  const clearTripStage = useCallback(
    async (trip: Trip, reason?: string) => {
      if (!trip?.plannedDriverId) return;
      markBusy(trip.id, true);
      try {
        const cleared = await clearStagedDriver({
          tripId: trip.id,
          trip,
          actorName,
          actorId: user?.uid,
          actorRole,
          reason,
        });
        setTrips((prev) => prev.map((t) => (t.id === trip.id ? cleared : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? cleared : prev));
        showDispatchToast(
          `Unstaged driver placeholder from Trip #${formatShortTripNumber(trip.id)}.`,
          'info'
        );
      } catch (err: unknown) {
        showDispatchToast(
          err instanceof Error ? err.message : 'Failed to clear staged driver.',
          'error'
        );
      } finally {
        markBusy(trip.id, false);
      }
    },
    [actorName, user?.uid, actorRole, markBusy, setTrips, setReviewTrip, showDispatchToast]
  );

  const sendStagedTrip = useCallback(
    async (trip: Trip) => {
      if (!trip?.plannedDriverId) return;
      markBusy(trip.id, true);
      try {
        const res = await sendStagedTripToDriver({
          trip,
          drivers,
          actorName,
          actorId: user?.uid,
          actorRole,
          fleetVehicles: settings.fleet,
        });
        setTrips((prev) => prev.map((t) => (t.id === trip.id ? res.trip : t)));
        setReviewTrip((prev) => (prev && prev.id === trip.id ? res.trip : prev));
        showDispatchToast(
          `Sent Trip #${formatShortTripNumber(trip.id)} to ${res.driverLabel}.`,
          'success'
        );
      } catch (err: unknown) {
        showDispatchToast(
          err instanceof Error ? err.message : 'Failed to send staged trip to driver.',
          'error'
        );
      } finally {
        markBusy(trip.id, false);
      }
    },
    [
      drivers,
      actorName,
      user?.uid,
      actorRole,
      settings.fleet,
      markBusy,
      setTrips,
      setReviewTrip,
      showDispatchToast,
    ]
  );

  const sendAllStagedForDriver = useCallback(
    async (driverId: string) => {
      const driverStagedTrips = trips.filter(
        (t) => !t.assignedDriverId && t.plannedDriverId === driverId
      );
      if (driverStagedTrips.length === 0) return;

      const summary = await sendMultipleStagedTripsToDrivers({
        trips: driverStagedTrips,
        drivers,
        actorName,
        actorId: user?.uid,
        actorRole,
        fleetVehicles: settings.fleet,
      });

      if (summary.updatedTrips.length > 0) {
        const mapById = new Map(summary.updatedTrips.map((t) => [t.id, t]));
        setTrips((prev) => prev.map((t) => mapById.get(t.id) || t));
        setReviewTrip((prev) => (prev ? mapById.get(prev.id) || prev : null));
      }

      if (summary.sentCount > 0) {
        showDispatchToast(
          `Sent ${summary.sentCount} staged trip(s) to driver${
            summary.skippedOfflineOrInvalid > 0
              ? ` (${summary.skippedOfflineOrInvalid} skipped).`
              : '.'
          }`,
          'success'
        );
      } else {
        showDispatchToast('Could not send staged trips (driver unavailable or suspended).', 'error');
      }
    },
    [
      trips,
      drivers,
      actorName,
      user?.uid,
      actorRole,
      settings.fleet,
      setTrips,
      setReviewTrip,
      showDispatchToast,
    ]
  );

  const sendSelectedStagedTrips = useCallback(async () => {
    const stagedTargets = selectedTrips.filter((t) => hasStagedDriver(t));
    if (stagedTargets.length === 0) {
      showDispatchToast('None of the selected trips have a staged driver.', 'info');
      return;
    }

    const summary = await sendMultipleStagedTripsToDrivers({
      trips: stagedTargets,
      drivers,
      actorName,
      actorId: user?.uid,
      actorRole,
      fleetVehicles: settings.fleet,
    });

    if (summary.updatedTrips.length > 0) {
      const mapById = new Map(summary.updatedTrips.map((t) => [t.id, t]));
      setTrips((prev) => prev.map((t) => mapById.get(t.id) || t));
      setReviewTrip((prev) => (prev ? mapById.get(prev.id) || prev : null));
    }

    setSelectedTripIds([]);
    if (summary.sentCount > 0) {
      showDispatchToast(
        `Sent ${summary.sentCount} staged trip(s) to their planned drivers${
          summary.skippedOfflineOrInvalid > 0
            ? ` (${summary.skippedOfflineOrInvalid} skipped).`
            : '.'
        }`,
        'success'
      );
    } else {
      showDispatchToast('Unable to send selected staged trips.', 'error');
    }
  }, [
    selectedTrips,
    drivers,
    actorName,
    user?.uid,
    actorRole,
    settings.fleet,
    setTrips,
    setReviewTrip,
    setSelectedTripIds,
    showDispatchToast,
  ]);

  const openBatchStageDriverModal = useCallback(() => {
    if (selectedTripIds.length === 0) return;
    setBatchAssignMode('stage_hold');
    setBatchAssignDriverId(
      drivers.find((d) => !d.isBlacklisted && d.zone !== 'Suspended')?.id || ''
    );
    setIsBatchAssignOpen(true);
  }, [selectedTripIds.length, drivers, setBatchAssignDriverId, setIsBatchAssignOpen]);

  const confirmBatchStageOrAssign = useCallback(async () => {
    if (batchAssignMode === 'send_to_driver') {
      await rawConfirmBatchAssign();
      return;
    }

    if (selectedTripIds.length === 0 || !batchAssignDriverId) return;

    if (batchAssignDriverId === 'unassigned') {
      let clearedCount = 0;
      const updatedMap = new Map<string, Trip>();
      for (const trip of selectedTrips) {
        if (hasStagedDriver(trip)) {
          try {
            const cleared = await clearStagedDriver({
              tripId: trip.id,
              trip,
              actorName,
              actorId: user?.uid,
              actorRole,
            });
            updatedMap.set(trip.id, cleared);
            clearedCount++;
          } catch {}
        }
      }
      if (updatedMap.size > 0) {
        setTrips((prev) => prev.map((t) => updatedMap.get(t.id) || t));
        setReviewTrip((prev) => (prev ? updatedMap.get(prev.id) || prev : null));
      }
      setIsBatchAssignOpen(false);
      setSelectedTripIds([]);
      showDispatchToast(`Cleared staged driver from ${clearedCount} trip(s).`, 'info');
      return;
    }

    const drv = drivers.find((d) => d.id === batchAssignDriverId);
    if (!drv) {
      showDispatchToast('Selected driver was not found.', 'error');
      return;
    }

    let stagedCount = 0;
    const updatedMap = new Map<string, Trip>();
    for (const trip of selectedTrips) {
      if (!isTripEligibleForStaging(trip)) continue;
      try {
        const updated = await stageDriverForTrip({
          tripId: trip.id,
          trip,
          driver: drv,
          actorName,
          actorId: user?.uid,
          actorRole,
        });
        updatedMap.set(trip.id, updated);
        stagedCount++;
      } catch {}
    }

    if (updatedMap.size > 0) {
      setTrips((prev) => prev.map((t) => updatedMap.get(t.id) || t));
      setReviewTrip((prev) => (prev ? updatedMap.get(prev.id) || prev : null));
    }

    setIsBatchAssignOpen(false);
    setSelectedTripIds([]);
    if (stagedCount > 0) {
      showDispatchToast(
        `📌 Staged ${drv.formattedLabel || drv.name} on ${stagedCount} trip(s) (held in Dispatch).`,
        'success'
      );
    } else {
      showDispatchToast('Selected trips are already assigned or not stageable.', 'info');
    }
  }, [
    batchAssignMode,
    rawConfirmBatchAssign,
    selectedTripIds.length,
    batchAssignDriverId,
    selectedTrips,
    drivers,
    actorName,
    user?.uid,
    actorRole,
    setTrips,
    setReviewTrip,
    setIsBatchAssignOpen,
    setSelectedTripIds,
    showDispatchToast,
  ]);

  const openAutoStagePreview = useCallback(() => {
    const result = computeAutoStageSuggestions({
      trips: filteredTrips,
      allTrips: trips,
      drivers,
      settings,
    });
    setAutoStageModal({
      isOpen: true,
      suggestions: result.suggestions,
      unmatchedTripIds: result.unmatchedTripIds,
    });
  }, [filteredTrips, trips, drivers, settings]);

  const closeAutoStageModal = useCallback(() => {
    setAutoStageModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const confirmApplyAutoStageSuggestions = useCallback(async () => {
    if (autoStageModal.suggestions.length === 0 || isAutoStaging) return;
    setIsAutoStaging(true);
    try {
      const updated = await applyAutoStageSuggestions({
        suggestions: autoStageModal.suggestions,
        trips,
        drivers,
        actorName,
        actorId: user?.uid,
        actorRole,
      });

      if (updated.length > 0) {
        const mapById = new Map(updated.map((t) => [t.id, t]));
        setTrips((prev) => prev.map((t) => mapById.get(t.id) || t));
        setReviewTrip((prev) => (prev ? mapById.get(prev.id) || prev : null));
      }

      setAutoStageModal({ isOpen: false, suggestions: [], unmatchedTripIds: [] });
      showDispatchToast(
        `📌 Auto-staged ${updated.length} scheduled trip(s) with non-overlapping shift placeholders.`,
        'success'
      );
    } catch (err: unknown) {
      showDispatchToast(
        err instanceof Error ? err.message : 'Failed to apply auto-stage suggestions.',
        'error'
      );
    } finally {
      setIsAutoStaging(false);
    }
  }, [
    autoStageModal.suggestions,
    isAutoStaging,
    trips,
    drivers,
    actorName,
    user?.uid,
    actorRole,
    setTrips,
    setReviewTrip,
    showDispatchToast,
  ]);

  const dispatchArbitraryTripBatch = useCallback(
    async (targetBatch: Trip[]) => {
      if (targetBatch.length === 0) return { dispatchedCount: 0, exhaustedCount: 0 };
      const cfg = normalizeDispatchAutomationConfig(settings.dispatchAutomation);
      const effectiveMode =
        cfg.dispatchMode !== 'manual_1tap' ? cfg.dispatchMode : cfg.sweepExecutionMode;

      const workingMap = new Map<string, Trip>(trips.map((t) => [t.id, t]));
      for (const tb of targetBatch) {
        workingMap.set(tb.id, tb);
      }

      const updatedMap = new Map<string, Trip>();
      let dispatchedCount = 0;
      let exhaustedCount = 0;

      for (const item of targetBatch) {
        const latestItem = workingMap.get(item.id) || item;
        const step = await executeAutoDispatch({
          trip: latestItem,
          drivers,
          zones: dispatchZones,
          config: cfg,
          modeOverride: effectiveMode,
          fleetVehicles: settings.fleet,
          activeTrips: Array.from(workingMap.values()),
          vehicleTiers: settings.vehicles,
          actorRole,
          actorId: user?.uid,
        });
        workingMap.set(item.id, step.trip);
        updatedMap.set(item.id, step.trip);
        if (step.outcome === 'offered' || step.outcome === 'assigned') dispatchedCount++;
        if (step.outcome === 'exhausted') exhaustedCount++;
      }

      if (updatedMap.size > 0) {
        setTrips((prev) => prev.map((t) => updatedMap.get(t.id) || t));
        setReviewTrip((prev) => (prev ? updatedMap.get(prev.id) || prev : null));
      }

      return { dispatchedCount, exhaustedCount };
    },
    [
      settings.dispatchAutomation,
      settings.fleet,
      settings.vehicles,
      trips,
      drivers,
      dispatchZones,
      actorRole,
      user?.uid,
      setTrips,
      setReviewTrip,
    ]
  );

  const requestAutoOfferWithStagedCheck = useCallback(
    async (trip: Trip) => {
      const { stagedTrips, unstagedTrips } = partitionTripsByStagedConflict([trip]);
      if (stagedTrips.length > 0) {
        setConflictModal({
          isOpen: true,
          sourceLabel: `Trip #${formatShortTripNumber(trip.id)} Auto-Offer`,
          targetTrips: [trip],
          stagedTrips,
          unstagedTrips,
        });
        return;
      }
      await rawStartAutoOffer(trip);
    },
    [rawStartAutoOffer]
  );

  const requestReadySweepWithStagedCheck = useCallback(async () => {
    const { stagedTrips, unstagedTrips } = partitionTripsByStagedConflict(
      readyForAutoDispatchTrips
    );
    if (stagedTrips.length > 0) {
      setConflictModal({
        isOpen: true,
        sourceLabel: `Auto-Dispatch Ready (${readyForAutoDispatchTrips.length})`,
        targetTrips: readyForAutoDispatchTrips,
        stagedTrips,
        unstagedTrips,
      });
      return;
    }
    await rawRunAutoDispatchSweep();
  }, [readyForAutoDispatchTrips, rawRunAutoDispatchSweep]);

  const requestBatchAutoDispatchWithStagedCheck = useCallback(async () => {
    if (selectedAutoDispatchableTrips.length === 0) {
      showDispatchToast('Select open confirmed/pending trips to run Batch Auto-Dispatch.', 'info');
      return;
    }
    const { stagedTrips, unstagedTrips } = partitionTripsByStagedConflict(
      selectedAutoDispatchableTrips
    );
    if (stagedTrips.length > 0) {
      setConflictModal({
        isOpen: true,
        sourceLabel: `Batch Auto-Dispatch (${selectedAutoDispatchableTrips.length} Selected)`,
        targetTrips: selectedAutoDispatchableTrips,
        stagedTrips,
        unstagedTrips,
        clearSelectionOnComplete: true,
      });
      return;
    }

    const { dispatchedCount, exhaustedCount } = await dispatchArbitraryTripBatch(
      selectedAutoDispatchableTrips
    );
    setSelectedTripIds([]);
    showDispatchToast(
      dispatchedCount > 0
        ? `Batch Auto-Dispatched ${dispatchedCount} selected trip(s)${
            exhaustedCount > 0 ? ` (${exhaustedCount} exhausted)` : ''
          }.`
        : 'No eligible on-duty drivers matched the selected trips.',
      dispatchedCount > 0 ? 'success' : 'error'
    );
  }, [
    selectedAutoDispatchableTrips,
    dispatchArbitraryTripBatch,
    setSelectedTripIds,
    showDispatchToast,
  ]);

  const closeConflictModal = useCallback(() => {
    if (isResolvingConflict) return;
    setConflictModal((prev) => ({ ...prev, isOpen: false }));
  }, [isResolvingConflict]);

  const resolveConflictModal = useCallback(
    async (strategy: StagedConflictResolutionStrategy) => {
      if (isResolvingConflict || conflictModal.targetTrips.length === 0) return;
      setIsResolvingConflict(true);
      try {
        const res = await resolveStagedConflictStrategy({
          strategy,
          targetTrips: conflictModal.targetTrips,
          drivers,
          actorName,
          actorId: user?.uid,
          actorRole,
          fleetVehicles: settings.fleet,
        });

        const immediateUpdates = new Map<string, Trip>();
        for (const t of res.sentStagedTrips) immediateUpdates.set(t.id, t);
        for (const t of res.clearedStagedTrips) immediateUpdates.set(t.id, t);

        if (immediateUpdates.size > 0) {
          setTrips((prev) => prev.map((t) => immediateUpdates.get(t.id) || t));
          setReviewTrip((prev) => (prev ? immediateUpdates.get(prev.id) || prev : null));
        }

        const autoBatchRes = await dispatchArbitraryTripBatch(res.tripsForAutoDispatch);

        if (conflictModal.clearSelectionOnComplete) {
          setSelectedTripIds([]);
        }

        setConflictModal((prev) => ({ ...prev, isOpen: false }));

        if (strategy === 'keep_staged') {
          const sentN = res.sentStagedTrips.length;
          const autoN = autoBatchRes.dispatchedCount;
          showDispatchToast(
            `Sent ${sentN} staged trip(s) to their planned driver(s)${
              res.tripsForAutoDispatch.length > 0 ? ` and auto-dispatched ${autoN} unstaged trip(s)` : ''
            }.`,
            sentN > 0 || autoN > 0 ? 'success' : 'error'
          );
        } else if (strategy === 'skip_staged') {
          showDispatchToast(
            res.tripsForAutoDispatch.length > 0
              ? `Kept ${res.skippedStagedTrips.length} staged trip(s) held in Dispatch and auto-dispatched ${autoBatchRes.dispatchedCount} unstaged trip(s).`
              : `Kept ${res.skippedStagedTrips.length} staged trip(s) held in Dispatch untouched.`,
            'info'
          );
        } else {
          showDispatchToast(
            `Cleared ${res.clearedStagedTrips.length} staged placeholder(s) and ran fresh Auto-Dispatch (${autoBatchRes.dispatchedCount} dispatched).`,
            autoBatchRes.dispatchedCount > 0 ? 'success' : 'info'
          );
        }
      } catch (err: unknown) {
        showDispatchToast(
          err instanceof Error ? err.message : 'Failed to resolve staged driver conflict.',
          'error'
        );
      } finally {
        setIsResolvingConflict(false);
      }
    },
    [
      isResolvingConflict,
      conflictModal,
      drivers,
      actorName,
      user?.uid,
      actorRole,
      settings.fleet,
      setTrips,
      setReviewTrip,
      dispatchArbitraryTripBatch,
      setSelectedTripIds,
      showDispatchToast,
    ]
  );

  return {
    queueAssignMode,
    setQueueAssignMode,
    batchAssignMode,
    setBatchAssignMode,
    driverPickerMode,
    setDriverPickerMode,
    openScheduledUnstagedCount,
    stagedInFilteredCount,
    selectedStagedCount,
    selectedStageableCount,
    selectedAutoDispatchableCount: selectedAutoDispatchableTrips.length,
    busyTripIds,
    isAutoStaging,
    isResolvingConflict,
    stageTripDriver,
    clearTripStage,
    sendStagedTrip,
    sendAllStagedForDriver,
    sendSelectedStagedTrips,
    openBatchStageDriverModal,
    confirmBatchStageOrAssign,
    autoStageModal,
    openAutoStagePreview,
    closeAutoStageModal,
    confirmApplyAutoStageSuggestions,
    conflictModal,
    closeConflictModal,
    resolveConflictModal,
    requestAutoOfferWithStagedCheck,
    requestReadySweepWithStagedCheck,
    requestBatchAutoDispatchWithStagedCheck,
  };
}
