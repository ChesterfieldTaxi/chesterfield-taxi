import React, { useState, useEffect, useMemo, useDeferredValue, useCallback } from 'react';
import type { Trip, TripStatus } from '../../../../core/types/trip';
import {
  evaluateTripDriverLateStatus,
  useLiveClockNowMs,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import { getBookingService } from '../../../../core/services/booking';
import { isFirebaseConfigured } from '../../../../core/services/firebase';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import { getAdminAuthService } from '../../../../core/services/auth/admin-auth.service';
import {
  getOperatorService,
  type DriverRosterItem,
} from '../../../../core/services/operator.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import {
  clearStagedDriverFromTrip,
  sendStagedTripToDriver,
  stageDriverForTrip,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import { resolveDispatcherGuestChangeDecision } from '../../../../core/services/tracking/guest-manage-ride';
import {
  classifyAdminTripExceptions,
  isAdminActiveQueueTrip,
  type ClassifiedAdminTripException,
} from '../../../../core/utils/admin-trips-exceptions.util';
import { escapeCsvCell } from '../../../../core/services/analytics';
import { notifyAdminTripStatusEmail } from './admin-trips-email.util';
import {
  ADMIN_TRIPS_PAGE_SIZES,
  paginateTrips,
} from './admin-trips-pagination.util';

export type TripsSubTab = 'dispatch' | 'standing-orders' | 'exceptions' | 'history';

const LOCAL_TRIPS_CACHE_KEY = 'chesterfield_taxi_mock_trips';
let cachedAdminTrips: Trip[] | null = null;

function readInitialCachedTrips(): Trip[] {
  if (cachedAdminTrips !== null) return cachedAdminTrips;
  if (isFirebaseConfigured()) return [];
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_TRIPS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Trip[]) : [];
  } catch {
    return [];
  }
}

function mergeTripLists(primary: ReadonlyArray<Trip>, secondary: ReadonlyArray<Trip>): Trip[] {
  const byId = new Map<string, Trip>();
  for (const t of secondary) {
    if (t?.id) byId.set(t.id, t);
  }
  for (const t of primary) {
    if (!t?.id) continue;
    const existing = byId.get(t.id);
    if (!existing) {
      byId.set(t.id, t);
    } else {
      const pMs = Date.parse(t.updatedAt || t.createdAt || '') || 0;
      const eMs = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
      if (pMs >= eMs) {
        byId.set(t.id, t);
      }
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function normalizeTripsSubTab(raw?: string): TripsSubTab {
  if (raw === 'standing-orders' || raw === 'exceptions' || raw === 'history') {
    return raw;
  }
  return 'dispatch';
}

export function useAdminTripsController(initialSubTab?: TripsSubTab | string) {
  const [activeSub, setActiveSub] = useState<TripsSubTab>(() =>
    normalizeTripsSubTab(initialSubTab)
  );
  const [activeWindowTrips, setActiveWindowTrips] = useState<Trip[]>(() =>
    readInitialCachedTrips()
  );
  const [historicalTrips, setHistoricalTrips] = useState<Trip[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState<boolean>(false);
  const [isFetchingHistoryPage, setIsFetchingHistoryPage] = useState<boolean>(false);

  const [drivers, setDrivers] = useState<DriverRosterItem[]>([]);
  const [appSettings, setAppSettings] = useState(() => getAdminConfigService().getCachedSettings());
  const [assignMode, setAssignMode] = useState<'send_to_driver' | 'stage_hold'>('send_to_driver');
  const [isLoading, setIsLoading] = useState(() => readInitialCachedTrips().length === 0);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(ADMIN_TRIPS_PAGE_SIZES[0]);
  const nowMs = useLiveClockNowMs(30_000);
  const [includeArchivedInHistory, setIncludeArchivedInHistory] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [auditModalTrip, setAuditModalTrip] = useState<Trip | null>(null);
  const [completeTripTarget, setCompleteTripTarget] = useState<Trip | null>(null);
  const [completeModalOpenSeq, setCompleteModalOpenSeq] = useState<number>(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [openActionTripId, setOpenActionTripId] = useState<string | null>(null);

  const trips = useMemo(
    () => mergeTripLists(activeWindowTrips, historicalTrips),
    [activeWindowTrips, historicalTrips]
  );

  const setTrips: React.Dispatch<React.SetStateAction<Trip[]>> = useCallback((updater) => {
    setActiveWindowTrips((prevActive) => {
      const combined = mergeTripLists(prevActive, historicalTrips);
      const nextList = typeof updater === 'function' ? updater(combined) : updater;
      cachedAdminTrips = nextList;
      return nextList;
    });
  }, [historicalTrips]);

  const openCompleteTripModal = (trip: Trip) => {
    setCompleteTripTarget(trip);
    setCompleteModalOpenSeq((s) => s + 1);
  };

  const closeCompleteTripModal = () => {
    setCompleteTripTarget(null);
  };

  useEffect(() => {
    setActiveSub(normalizeTripsSubTab(initialSubTab));
  }, [initialSubTab]);

  useEffect(() => {
    const opSvc = getOperatorService();
    setDrivers(opSvc.getDriverRoster());
    const unsubDrivers = opSvc.subscribeToDrivers((roster) => setDrivers(roster));
    const unsubSettings = getAdminConfigService().subscribeToSettings((next) => setAppSettings(next));
    return () => {
      unsubDrivers();
      unsubSettings();
    };
  }, []);

  // 1. Shared singleton Active-Window subscription for real-time dispatch & exceptions
  useEffect(() => {
    if (readInitialCachedTrips().length === 0) {
      setIsLoading(true);
    }
    const service = getBookingService();
    if (service.subscribeToActiveTrips) {
      return service.subscribeToActiveTrips(
        (updatedTrips) => {
          cachedAdminTrips = updatedTrips;
          setActiveWindowTrips(updatedTrips);
          setIsLoading(false);
          setSelectedTrip((prev) =>
            prev ? updatedTrips.find((t) => t.id === prev.id) || prev : null
          );
        },
        () => setIsLoading(false)
      );
    }
    if (service.getActiveAndUpcomingTrips) {
      service
        .getActiveAndUpcomingTrips({ limit: 500 })
        .then((data) => {
          cachedAdminTrips = data;
          setActiveWindowTrips(data);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Failed to fetch bookings.');
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  // 2. Cursor-paginated historical queries (`queryTripsPage`) when browsing `history`
  const resolvedHistoryQueryStatus = useMemo<TripStatus | 'all'>(() => {
    if (statusFilter === 'all' || statusFilter === 'late') return 'all';
    return statusFilter as TripStatus;
  }, [statusFilter]);

  useEffect(() => {
    if (activeSub !== 'history') return;
    const service = getBookingService();
    if (!service.queryTripsPage) return;

    let cancelled = false;
    setIsFetchingHistoryPage(true);
    service
      .queryTripsPage({
        limit: 50,
        cursor: null,
        status: resolvedHistoryQueryStatus,
        includeArchived: includeArchivedInHistory,
        orderField: 'createdAt',
        orderDirection: 'desc',
      })
      .then((res) => {
        if (cancelled) return;
        setHistoricalTrips(res.trips);
        setHistoryNextCursor(res.nextCursor);
        setHistoryHasMore(res.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsFetchingHistoryPage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSub, resolvedHistoryQueryStatus, includeArchivedInHistory]);

  const loadMoreHistory = useCallback(async () => {
    if (isFetchingHistoryPage || !historyHasMore || !historyNextCursor) return;
    const service = getBookingService();
    if (!service.queryTripsPage) return;

    setIsFetchingHistoryPage(true);
    try {
      const res = await service.queryTripsPage({
        limit: 50,
        cursor: historyNextCursor,
        status: resolvedHistoryQueryStatus,
        includeArchived: includeArchivedInHistory,
        orderField: 'createdAt',
        orderDirection: 'desc',
      });
      setHistoricalTrips((prev) => mergeTripLists(res.trips, prev));
      setHistoryNextCursor(res.nextCursor);
      setHistoryHasMore(res.hasMore);
    } finally {
      setIsFetchingHistoryPage(false);
    }
  }, [
    isFetchingHistoryPage,
    historyHasMore,
    historyNextCursor,
    resolvedHistoryQueryStatus,
    includeArchivedInHistory,
  ]);

  const actorEmail = useMemo(() => {
    const u = getAdminAuthService().getCurrentUser();
    return u?.email || u?.displayName || 'Admin';
  }, []);

  const showSuccess = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 5000);
  };

  const govService = getUniversalGovernanceService();
  const isArchivedTrip = (t: Trip) => Boolean(t.isArchived) || govService.isTripArchived(t.id);

  const exceptionByTripId = useMemo(() => {
    const cached = getAdminConfigService().getCachedSettings();
    const slaConfig = cached.dispatchAutomation;
    const unacknowledgedAlertMinutes = cached.driverAppConfig?.unacknowledgedAlertMinutes;
    const map: Record<string, ClassifiedAdminTripException> = {};
    for (const trip of trips) {
      map[trip.id] = classifyAdminTripExceptions(trip, {
        slaConfig,
        unacknowledgedAlertMinutes,
      });
    }
    return map;
  }, [trips]);

  const handleStatusTransition = async (
    tripId: string,
    newStatus: TripStatus,
    options?: { assignedDriverId?: string | null; reason?: string }
  ) => {
    try {
      setActionLoadingId(tripId);
      setError(null);
      const service = getBookingService();
      if (service.updateTripStatus) {
        const previousTrip = trips.find((t) => t.id === tripId);
        const updated = await service.updateTripStatus(tripId, newStatus, {
          ...(options as any),
          actorRole: 'admin',
          reason: options?.reason || `Admin updated trip to ${newStatus}`,
        });
        if (updated) {
          setHistoricalTrips((prev) =>
            prev.some((t) => t.id === updated.id)
              ? prev.map((t) => (t.id === updated.id ? updated : t))
              : prev
          );
        }
        const currentTrip = updated || previousTrip;
        const mailNote = currentTrip
          ? await notifyAdminTripStatusEmail({
              currentTrip,
              newStatus,
              previousStatus: previousTrip?.status || null,
              reason: options?.reason,
            })
          : '';
        showSuccess(`✓ Trip #${tripId.slice(-6).toUpperCase()} → ${newStatus}.${mailNote}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update trip status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDriverDropdownChange = async (trip: Trip, driverId: string) => {
    try {
      setActionLoadingId(trip.id);
      setError(null);
      const service = getBookingService();

      if (!driverId || driverId === 'unassigned') {
        if (trip.plannedDriverId && !trip.assignedDriverId) {
          await clearStagedDriverFromTrip({
            tripId: trip.id,
            trip,
            actorName: actorEmail,
            actorRole: 'admin',
          });
          showSuccess(`✓ Cleared staged driver hold on Trip #${trip.id.slice(-6).toUpperCase()}.`);
        } else if (service.updateTrip) {
          await service.updateTrip(trip.id, {
            assignedDriverId: null,
            status: 'confirmed',
            updatedAt: new Date().toISOString(),
          });
          showSuccess(`✓ Unassigned driver from Trip #${trip.id.slice(-6).toUpperCase()}.`);
        }
        return;
      }

      const matchedDriver = drivers.find((d) => d.id === driverId);
      if (!matchedDriver) return;

      if (!trip.assignedDriverId && assignMode === 'stage_hold') {
        await stageDriverForTrip({
          tripId: trip.id,
          trip,
          driver: matchedDriver as any,
          actorName: actorEmail,
          actorRole: 'admin',
        });
        showSuccess(
          `📌 Staged ${matchedDriver.name} on Trip #${trip.id.slice(-6).toUpperCase()} (held in Dispatch).`
        );
        return;
      }

      if (service.updateTrip) {
        const nextStatus: TripStatus =
          trip.status === 'accepted' ||
          trip.status === 'en_route' ||
          trip.status === 'arrived' ||
          trip.status === 'in_progress'
            ? trip.status
            : 'assigned';
        await service.updateTrip(trip.id, {
          status: nextStatus,
          assignedDriverId: matchedDriver.id,
          plannedDriverId: null,
          plannedDriverLabel: null,
          plannedAt: null,
          plannedBy: null,
          offeredToIds: [],
          metadata: {
            ...(trip.metadata || {}),
            assignedDriverName: matchedDriver.name,
            ...(matchedDriver.phone ? { assignedDriverPhone: matchedDriver.phone } : {}),
          },
          updatedAt: new Date().toISOString(),
        });
      } else if (service.updateTripStatus) {
        await service.updateTripStatus(trip.id, 'assigned', {
          assignedDriverId: matchedDriver.id,
          actorRole: 'admin',
        });
      }
      showSuccess(`✓ Sent Trip #${trip.id.slice(-6).toUpperCase()} to ${matchedDriver.name}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed updating driver assignment.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendStaged = async (trip: Trip) => {
    try {
      setActionLoadingId(trip.id);
      setError(null);
      const fleetVehicles = getAdminConfigService().getCachedSettings().fleet;
      const res = await sendStagedTripToDriver({
        trip,
        drivers: drivers as any,
        actorName: actorEmail,
        actorRole: 'admin',
        fleetVehicles,
      });
      showSuccess(`✓ Sent staged Trip #${trip.id.slice(-6).toUpperCase()} to ${res.driverLabel}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed sending staged trip to driver.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClearStaged = async (trip: Trip) => {
    try {
      setActionLoadingId(trip.id);
      setError(null);
      await clearStagedDriverFromTrip({
        tripId: trip.id,
        trip,
        actorName: actorEmail,
        actorRole: 'admin',
      });
      showSuccess(`✓ Cleared staged driver hold on Trip #${trip.id.slice(-6).toUpperCase()}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed clearing staged driver.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolveGuestChangeRequest = async (
    trip: Trip,
    decision: 'approve' | 'decline'
  ) => {
    try {
      setActionLoadingId(trip.id);
      setError(null);
      const resolved = resolveDispatcherGuestChangeDecision({
        trip,
        decision,
        actorEmail,
      });
      let savedTrip = resolved.updatedTrip;
      const service = getBookingService();
      if (service.updateTrip) {
        savedTrip = await service.updateTrip(trip.id, resolved.tripPatch);
      }
      setTrips((prev) => prev.map((t) => (t.id === savedTrip.id ? savedTrip : t)));
      if (selectedTrip?.id === savedTrip.id) {
        setSelectedTrip(savedTrip);
      }
      showSuccess(
        decision === 'approve'
          ? `✓ Approved rider /track change request on Trip #${trip.id.slice(-6).toUpperCase()}.`
          : `Declined rider /track change request on Trip #${trip.id.slice(-6).toUpperCase()}.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed resolving rider change request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleArchiveTrip = async (trip: Trip, currentArchiveState: boolean) => {
    try {
      setActionLoadingId(trip.id);
      await getUniversalGovernanceService().setArchiveStatus('trip', trip.id, !currentArchiveState);
      setActiveWindowTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, isArchived: !currentArchiveState } : t))
      );
      setHistoricalTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, isArchived: !currentArchiveState } : t))
      );
      showSuccess(
        !currentArchiveState
          ? `✓ Trip #${trip.id.slice(-6).toUpperCase()} moved to archive.`
          : `✓ Trip #${trip.id.slice(-6).toUpperCase()} restored from archive.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed updating archive status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filterBySearch = (list: Trip[]) => {
    const term = deferredSearchTerm.trim().toLowerCase();
    if (!term) return list;
    return list.filter((t) =>
      [
        t.id,
        t.passenger?.firstName,
        t.passenger?.lastName,
        t.passenger?.phone,
        t.passenger?.email,
        t.pickupLocation?.address,
        t.dropoffLocation?.address,
        t.assignedDriverId,
        t.plannedDriverLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  };

  const activeQueueTrips = useMemo(
    () => filterBySearch(trips.filter((t) => isAdminActiveQueueTrip(t, isArchivedTrip(t)))),
    [trips, deferredSearchTerm]
  );

  const exceptionTrips = useMemo(
    () =>
      filterBySearch(
        trips.filter((t) => !isArchivedTrip(t) && Boolean(exceptionByTripId[t.id]?.isException))
      ),
    [trips, exceptionByTripId, deferredSearchTerm]
  );

  const historyTrips = useMemo(() => {
    const base = trips.filter((t) => (includeArchivedInHistory ? true : !isArchivedTrip(t)));
    const statusFiltered =
      statusFilter === 'all'
        ? base
        : statusFilter === 'late'
        ? base.filter((t) => evaluateTripDriverLateStatus(t, nowMs).isLate)
        : base.filter((t) => t.status === statusFilter);
    return filterBySearch(statusFiltered);
  }, [trips, includeArchivedInHistory, statusFilter, deferredSearchTerm, nowMs]);

  useEffect(() => {
    setPage(1);
  }, [activeSub, deferredSearchTerm, statusFilter, includeArchivedInHistory, pageSize]);

  const currentTabTrips = useMemo(
    () =>
      activeSub === 'dispatch'
        ? activeQueueTrips
        : activeSub === 'exceptions'
        ? exceptionTrips
        : historyTrips,
    [activeSub, activeQueueTrips, exceptionTrips, historyTrips]
  );

  const canAdvanceRemoteHistory =
    activeSub === 'history' && historyHasMore && !deferredSearchTerm.trim();

  // Fetch the next 50-trip cursor batch on demand when the operator pages beyond loaded items
  useEffect(() => {
    const loadedPages = Math.max(1, Math.ceil(currentTabTrips.length / pageSize));
    if (canAdvanceRemoteHistory && page > loadedPages) {
      void loadMoreHistory();
    }
  }, [canAdvanceRemoteHistory, page, currentTabTrips.length, pageSize, loadMoreHistory]);

  const pagination = useMemo(() => {
    const base = paginateTrips(currentTabTrips, page, pageSize);
    if (!canAdvanceRemoteHistory) return base;
    const loadedPages = Math.max(1, Math.ceil(currentTabTrips.length / pageSize));
    return {
      ...base,
      totalPages: loadedPages + 1,
      totalItems: Math.max(base.totalItems, loadedPages * pageSize + 1),
    };
  }, [currentTabTrips, page, pageSize, canAdvanceRemoteHistory]);

  useEffect(() => {
    if (!canAdvanceRemoteHistory && page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [canAdvanceRemoteHistory, page, pagination.totalPages]);

  const handleExportCSV = () => {
    const sourceTrips =
      activeSub === 'dispatch'
        ? activeQueueTrips
        : activeSub === 'exceptions'
        ? exceptionTrips
        : historyTrips;
    const headers = ['Trip ID', 'Status', 'Date', 'Passenger', 'Phone', 'Pickup', 'Dropoff', 'Vehicle', 'Fare'];
    const rows = sourceTrips.map((t) =>
      [
        t.id,
        t.status,
        t.scheduledPickupTime || '',
        [t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') || 'Guest',
        t.passenger?.phone || '',
        t.pickupLocation?.address || '',
        t.dropoffLocation?.address || '',
        t.vehicleTier || '',
        (t.pricing?.totalFare || 0).toFixed(2),
      ].map(escapeCsvCell)
    );
    const csvBody = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', `chesterfield_trips_${activeSub}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  return {
    activeSub,
    trips,
    setTrips,
    drivers,
    appSettings,
    currentUser: getAdminAuthService().getCurrentUser(),
    vehicles: appSettings.vehicles,
    fleetCars: appSettings.fleet,
    assignMode,
    setAssignMode,
    isLoading,
    isFetchingHistoryPage,
    historyHasMore,
    loadMoreHistory,
    error,
    setError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    includeArchivedInHistory,
    setIncludeArchivedInHistory,
    selectedTrip,
    setSelectedTrip,
    auditModalTrip,
    setAuditModalTrip,
    completeTripTarget,
    completeModalOpenSeq,
    openCompleteTripModal,
    closeCompleteTripModal,
    showSuccess,
    actionLoadingId,
    actionSuccessMessage,
    openActionTripId,
    setOpenActionTripId,
    isArchivedTrip,
    exceptionByTripId,
    activeQueueTrips,
    exceptionTrips,
    historyTrips,
    paginatedTrips: pagination.items,
    pagination,
    pageSize,
    setPageSize,
    setPage,
    handleStatusTransition,
    handleDriverDropdownChange,
    handleSendStaged,
    handleClearStaged,
    handleResolveGuestChangeRequest,
    handleToggleArchiveTrip,
    handleExportCSV,
  };
}
