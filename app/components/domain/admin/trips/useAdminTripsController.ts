import { useState, useEffect, useMemo } from 'react';
import type { Trip, TripStatus } from '../../../../core/types/trip';
import {
  evaluateTripDriverLateStatus,
  useLiveClockNowMs,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import { getBookingService } from '../../../../core/services/booking';
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

export type TripsSubTab = 'dispatch' | 'standing-orders' | 'exceptions' | 'history';

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
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<DriverRosterItem[]>([]);
  const [appSettings, setAppSettings] = useState(() => getAdminConfigService().getCachedSettings());
  const [assignMode, setAssignMode] = useState<'send_to_driver' | 'stage_hold'>('send_to_driver');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const nowMs = useLiveClockNowMs(30_000);
  const [includeArchivedInHistory, setIncludeArchivedInHistory] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [auditModalTrip, setAuditModalTrip] = useState<Trip | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [openActionTripId, setOpenActionTripId] = useState<string | null>(null);

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

  useEffect(() => {
    setIsLoading(true);
    const service = getBookingService();
    if (service.subscribeToAllTrips) {
      return service.subscribeToAllTrips(
        (updatedTrips) => {
          setTrips(updatedTrips);
          setIsLoading(false);
          setSelectedTrip((prev) =>
            prev ? updatedTrips.find((t) => t.id === prev.id) || prev : null
          );
        },
        () => setIsLoading(false)
      );
    }
    if (service.getAllTrips) {
      service
        .getAllTrips()
        .then((data) => {
          setTrips(data);
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
      setTrips((prev) =>
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
    const term = searchTerm.trim().toLowerCase();
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
    [trips, searchTerm]
  );

  const exceptionTrips = useMemo(
    () =>
      filterBySearch(
        trips.filter((t) => !isArchivedTrip(t) && Boolean(exceptionByTripId[t.id]?.isException))
      ),
    [trips, exceptionByTripId, searchTerm]
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
  }, [trips, includeArchivedInHistory, statusFilter, searchTerm, nowMs]);

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
    drivers,
    vehicles: appSettings.vehicles,
    fleetCars: appSettings.fleet,
    assignMode,
    setAssignMode,
    isLoading,
    error,
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
    actionLoadingId,
    actionSuccessMessage,
    openActionTripId,
    setOpenActionTripId,
    isArchivedTrip,
    exceptionByTripId,
    activeQueueTrips,
    exceptionTrips,
    historyTrips,
    handleStatusTransition,
    handleDriverDropdownChange,
    handleSendStaged,
    handleClearStaged,
    handleResolveGuestChangeRequest,
    handleToggleArchiveTrip,
    handleExportCSV,
  };
}
