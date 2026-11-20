/**
 * Unified Live Dispatch Fleet Hook
 *
 * Merges three real-time sources without subscription churn:
 * 1. OperatorService (`users` collection): driver identity, cab #, phone, score, governance
 * 2. DriverService (`drivers` collection): live `dutyStatus` (on_duty | on_break | off_duty) & `currentLocation`
 * 3. Trips (`trips` collection) + WorkspaceBus: active trip phase & instant cross-tab GPS pings
 *
 * Derives Option C CAD status:
 * - `available` (Green):  on_duty, not currently en_route / arrived / in_progress
 * - `en_route`  (Blue):   actively en_route to pickup
 * - `busy`      (Red):    arrived at pickup or trip in_progress
 * - `break`     (Yellow): on_break (still emitting light 30s GPS)
 * - `offline`   (Slate):  off_duty or suspended
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getOperatorService, type DriverRosterItem } from '../services/operator.service';
import { getDriverService } from '../services/driver.service';
import { getWorkspaceBus, type WorkspaceMessage } from '../services/workspace-bus.service';
import type { DriverDutyStatus, DriverProfile, LiveDriverMapStatus } from '../types/driver';
import type { DriverTelemetryPing, Trip } from '../types/trip';

export type GpsFreshness = 'live' | 'stale' | 'none';

export interface LiveFleetDriver extends DriverRosterItem {
  mapStatus: LiveDriverMapStatus;
  dutyStatus: DriverDutyStatus;
  activeTrip: Trip | null;
  activeTripStatus?: 'en_route' | 'arrived' | 'in_progress';
  queuedTripsCount: number;
  telemetry: DriverTelemetryPing | null;
  gpsFreshness: GpsFreshness;
  lastSeenSeconds: number | null;
}

const STALE_GPS_THRESHOLD_SECONDS = 180; // 3 minutes

function isValidCoord(ping?: DriverTelemetryPing | null): ping is DriverTelemetryPing {
  return Boolean(
    ping &&
      ping.coordinates &&
      typeof ping.coordinates.lat === 'number' &&
      typeof ping.coordinates.lng === 'number' &&
      !Number.isNaN(ping.coordinates.lat) &&
      !Number.isNaN(ping.coordinates.lng) &&
      (ping.coordinates.lat !== 0 || ping.coordinates.lng !== 0)
  );
}

function pickLatestTelemetry(
  ...candidates: Array<DriverTelemetryPing | null | undefined>
): DriverTelemetryPing | null {
  let best: DriverTelemetryPing | null = null;
  let bestMs = -1;
  for (const ping of candidates) {
    if (!isValidCoord(ping)) continue;
    const ms = ping.timestamp ? Date.parse(ping.timestamp) : 0;
    const validMs = Number.isFinite(ms) ? ms : 0;
    if (!best || validMs >= bestMs) {
      best = ping;
      bestMs = validMs;
    }
  }
  return best;
}

export function getMapStatusLabel(
  mapStatus: LiveDriverMapStatus,
  activeTripStatus?: 'en_route' | 'arrived' | 'in_progress'
): string {
  switch (mapStatus) {
    case 'available':
      return 'Available';
    case 'en_route':
      return 'En Route';
    case 'busy':
      return activeTripStatus === 'arrived' ? 'Arrived' : 'In Progress';
    case 'break':
      return 'On Break';
    case 'offline':
      return 'Offline';
  }
}

export const FLEET_STATUS_COLORS: Record<
  LiveDriverMapStatus,
  {
    hex: string;
    darkHex: string;
    ringHex: string;
    label: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  available: {
    hex: '#10b981',
    darkHex: '#047857',
    ringHex: '#a7f3d0',
    label: 'Available',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  en_route: {
    hex: '#2563eb',
    darkHex: '#1d4ed8',
    ringHex: '#bfdbfe',
    label: 'En Route',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-600',
  },
  busy: {
    hex: '#ef4444',
    darkHex: '#b91c1c',
    ringHex: '#fecaca',
    label: 'Arrived / In Progress',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
  },
  break: {
    hex: '#eab308',
    darkHex: '#a16207',
    ringHex: '#fef08a',
    label: 'On Break',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    dotClass: 'bg-amber-400',
  },
  offline: {
    hex: '#64748b',
    darkHex: '#334155',
    ringHex: '#cbd5e1',
    label: 'Offline',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
  },
};

export function useDispatchFleet(trips: Trip[]) {
  const [baseRoster, setBaseRoster] = useState<DriverRosterItem[]>(() =>
    getOperatorService().getDriverRoster()
  );
  const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverProfile>>({});
  const [busTelemetry, setBusTelemetry] = useState<Record<string, DriverTelemetryPing>>({});
  const [busDutyOverrides, setBusDutyOverrides] = useState<Record<string, DriverDutyStatus>>({});
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  // 1. Subscribe once to OperatorService roster (no dependency on `trips`!)
  useEffect(() => {
    const unsub = getOperatorService().subscribeToDrivers((roster) => {
      setBaseRoster(roster);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe once to Firestore `drivers` collection for live dutyStatus + currentLocation
  useEffect(() => {
    const unsub = getDriverService().subscribeToAllDrivers((profiles) => {
      setDriverProfiles(profiles);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe once to WorkspaceBus for instant cross-tab GPS pings & duty toggles
  useEffect(() => {
    const bus = getWorkspaceBus();
    const unsub = bus.subscribe((msg: WorkspaceMessage) => {
      if (msg.type === 'DRIVER_TELEMETRY_PING') {
        const p = msg.payload;
        if (p?.driverId && p.coordinates) {
          const ping: DriverTelemetryPing = {
            coordinates: p.coordinates,
            speedMph: p.speedMph,
            heading: p.heading,
            accuracy: p.accuracy,
            timestamp: p.timestamp || new Date().toISOString(),
            status: p.status,
            isOfflineBuffer: p.isOfflineBuffer,
          };
          setBusTelemetry((prev) => ({ ...prev, [p.driverId!]: ping }));
          if (p.dutyStatus) {
            setBusDutyOverrides((prev) => ({ ...prev, [p.driverId!]: p.dutyStatus! }));
          }
        }
      } else if (msg.type === 'DRIVER_STATUS_UPDATE') {
        const p = msg.payload;
        if (p?.driverId) {
          const duty: DriverDutyStatus =
            p.dutyStatus ||
            (p.status === 'break'
              ? 'on_break'
              : p.status === 'offline'
              ? 'off_duty'
              : 'on_duty');
          setBusDutyOverrides((prev) => ({ ...prev, [p.driverId]: duty }));
        }
      }
    });
    return unsub;
  }, []);

  // 4. Refresh freshness clock every 15s so "12s ago" / stale badges stay accurate
  useEffect(() => {
    const interval = setInterval(() => setClockTick(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  // 5. Merge into canonical LiveFleetDriver[]
  const fleet = useMemo<LiveFleetDriver[]>(() => {
    const nowMs = clockTick;

    return baseRoster.map((drv) => {
      const profile = driverProfiles[drv.id];

      // Determine driver's active in-flight trip (priority: in_progress > arrived > en_route)
      const driverTrips = trips.filter(
        (t) =>
          t.assignedDriverId === drv.id &&
          !['completed', 'cancelled', 'declined', 'DECLINED'].includes(t.status)
      );

      const inProgressTrip = driverTrips.find((t) => t.status === 'in_progress') || null;
      const arrivedTrip = driverTrips.find((t) => t.status === 'arrived') || null;
      const enRouteTrip = driverTrips.find((t) => t.status === 'en_route') || null;

      const activeTrip = inProgressTrip || arrivedTrip || enRouteTrip;
      const activeTripStatus: 'en_route' | 'arrived' | 'in_progress' | undefined = inProgressTrip
        ? 'in_progress'
        : arrivedTrip
        ? 'arrived'
        : enRouteTrip
        ? 'en_route'
        : undefined;

      // Queued trips = upcoming assigned/accepted trips not yet en_route/arrived/in_progress
      const queuedTripsCount = driverTrips.filter(
        (t) => !activeTrip || t.id !== activeTrip.id
      ).length;

      // Resolve authoritative dutyStatus
      const isSuspended = drv.zone === 'Suspended' || Boolean(drv.isBlacklisted);
      const rawDuty: DriverDutyStatus = isSuspended
        ? 'off_duty'
        : busDutyOverrides[drv.id] ||
          profile?.dutyStatus ||
          (drv.status === 'offline'
            ? 'off_duty'
            : drv.status === 'break'
            ? 'on_break'
            : 'on_duty');

      // Derive Option C mapStatus
      let mapStatus: LiveDriverMapStatus;
      if (activeTripStatus === 'in_progress' || activeTripStatus === 'arrived') {
        mapStatus = 'busy';
      } else if (activeTripStatus === 'en_route') {
        mapStatus = 'en_route';
      } else if (rawDuty === 'off_duty') {
        mapStatus = 'offline';
      } else if (rawDuty === 'on_break') {
        mapStatus = 'break';
      } else {
        mapStatus = 'available';
      }

      // Backward-compatible legacy roster status
      const legacyStatus: DriverRosterItem['status'] =
        mapStatus === 'busy' || mapStatus === 'en_route'
          ? 'on_trip'
          : mapStatus === 'break'
          ? 'break'
          : mapStatus === 'offline'
          ? 'offline'
          : 'available';

      // Latest GPS telemetry across driver doc, active trip, and cross-tab bus
      const telemetry = pickLatestTelemetry(
        profile?.currentLocation,
        activeTrip?.driverTelemetry,
        activeTrip?.currentLocation,
        busTelemetry[drv.id]
      );

      let lastSeenSeconds: number | null = null;
      let gpsFreshness: GpsFreshness = 'none';
      if (telemetry) {
        const tsMs = telemetry.timestamp ? Date.parse(telemetry.timestamp) : NaN;
        if (Number.isFinite(tsMs)) {
          lastSeenSeconds = Math.max(0, Math.round((nowMs - tsMs) / 1000));
          gpsFreshness =
            lastSeenSeconds <= STALE_GPS_THRESHOLD_SECONDS ? 'live' : 'stale';
        } else {
          gpsFreshness = 'live';
        }
      }

      return {
        ...drv,
        vehicle: profile?.vehicleUnit || drv.vehicle,
        tier: profile?.vehicleTier || drv.tier,
        zone: profile?.zone || drv.zone,
        status: legacyStatus,
        currentTripId: activeTrip?.id,
        mapStatus,
        dutyStatus: rawDuty,
        activeTrip,
        activeTripStatus,
        queuedTripsCount,
        telemetry,
        gpsFreshness,
        lastSeenSeconds,
      };
    });
  }, [baseRoster, driverProfiles, busTelemetry, busDutyOverrides, trips, clockTick]);

  // Persist dispatcher status change to Firestore `drivers/{driverId}`
  const setDriverDutyStatus = useCallback(
    async (driverId: string, newDuty: DriverDutyStatus) => {
      setBusDutyOverrides((prev) => ({ ...prev, [driverId]: newDuty }));
      try {
        await getDriverService().setDutyStatus(newDuty, driverId);
      } catch (err) {
        console.warn('[useDispatchFleet] Failed to persist duty status:', err);
        throw err;
      }
    },
    []
  );

  const statusCounts = useMemo(() => {
    const counts = {
      all: 0,
      available: 0,
      en_route: 0,
      busy: 0,
      break: 0,
      offline: 0,
      withGps: 0,
    };
    for (const d of fleet) {
      if (d.isBlacklisted) continue;
      counts[d.mapStatus] += 1;
      if (d.mapStatus !== 'offline') counts.all += 1;
      if (d.telemetry) counts.withGps += 1;
    }
    return counts;
  }, [fleet]);

  return {
    fleet,
    statusCounts,
    setDriverDutyStatus,
  };
}
