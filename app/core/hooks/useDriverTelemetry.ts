/**
 * Driver Geolocation Telemetry Broadcaster
 *
 * Continuous shift-aware adaptive GPS telemetry broadcaster:
 * - Active trip (en_route | arrived | in_progress): 10s moving (> 5 mph), 15s stationary
 * - Available (on_duty, no active trip): 12s moving (> 5 mph), 30s idle
 * - On Break (on_break): 30s light GPS update so dispatch keeps live visibility
 * - Off Duty (off_duty): tracking stopped completely
 *
 * Dual-writes live GPS fixes to `drivers/{driverId}` (for fleet-wide Dispatch map
 * tracking across Available / En Route / Arrived / In Progress / Break) AND to
 * `trips/{tripId}` during active trips (for Customer Telemetry tracking).
 * Automatically derives compass heading from consecutive fixes when GPS hardware
 * omits `coords.heading`.
 */

import { useState, useEffect, useRef } from 'react';
import type { Trip, DriverTelemetryPing, GeoPoint } from '../types/trip';
import type { DriverDutyStatus } from '../types/driver';
import { getBookingService } from '../services/booking';
import { getDriverService } from '../services/driver.service';
import { getWorkspaceBus } from '../services/workspace-bus.service';

export interface UseDriverTelemetryOptions {
  trip: Trip | null;
  driverId?: string;
  dutyStatus?: DriverDutyStatus;
  isEnabled?: boolean;
}

export interface UseDriverTelemetryResult {
  currentTelemetry: DriverTelemetryPing | null;
  isTracking: boolean;
  isOffline: boolean;
  lastBroadcastAt: string | null;
  pendingOfflineBufferCount: number;
  gpsError: string | null;
  currentIntervalSeconds: number;
}

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Initial compass bearing in degrees [0, 360) from point A to point B.
 */
export function computeCompassBearing(from: GeoPoint, to: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

/**
 * Calculates adaptive broadcast interval based on vehicle speed, active trip, and duty status:
 * - Active trip moving (> 5 mph): 10,000 ms
 * - Active trip stationary/slow: 15,000 ms
 * - Available (on_duty) moving (> 5 mph): 12,000 ms
 * - Available idle or On Break: 30,000 ms
 */
export function getAdaptiveThrottleIntervalMs(
  speedMph: number,
  options?: { isActiveTrip?: boolean; dutyStatus?: DriverDutyStatus }
): number {
  const isActiveTrip = options?.isActiveTrip ?? true;
  const dutyStatus = options?.dutyStatus;

  if (isActiveTrip) {
    return speedMph > 5 ? 10000 : 15000;
  }
  if (dutyStatus === 'on_break') {
    return 30000;
  }
  return speedMph > 5 ? 12000 : 30000;
}

export function useDriverTelemetry({
  trip,
  driverId,
  dutyStatus = 'on_duty',
  isEnabled = true,
}: UseDriverTelemetryOptions): UseDriverTelemetryResult {
  const [currentTelemetry, setCurrentTelemetry] = useState<DriverTelemetryPing | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [lastBroadcastAt, setLastBroadcastAt] = useState<string | null>(null);
  const [pendingBufferCount, setPendingBufferCount] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [currentIntervalSeconds, setCurrentIntervalSeconds] = useState(15);

  const lastBroadcastMsRef = useRef<number>(0);
  const offlineBufferRef = useRef<DriverTelemetryPing[]>([]);
  const latestPingRef = useRef<DriverTelemetryPing | null>(null);
  const prevFixRef = useRef<GeoPoint | null>(null);
  const lastHeadingRef = useRef<number | undefined>(undefined);
  const watchIdRef = useRef<number | null>(null);
  const MAX_OFFLINE_BUFFER = 50;

  const isActiveTripState = Boolean(
    trip &&
      trip.id &&
      (trip.status === 'assigned' ||
        trip.status === 'accepted' ||
        trip.status === 'en_route' ||
        trip.status === 'arrived' ||
        trip.status === 'in_progress')
  );

  // Monitor network connectivity (Online / Offline)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOffline(false);
      if (offlineBufferRef.current.length > 0 && (driverId || trip?.id)) {
        const latestBuffered = offlineBufferRef.current[offlineBufferRef.current.length - 1];
        offlineBufferRef.current = [];
        setPendingBufferCount(0);

        try {
          if (driverId) {
            void getDriverService().updateDriverLocation(driverId, latestBuffered);
          }
          if (isActiveTripState && trip?.id) {
            const bookingService = getBookingService();
            if (bookingService?.updateTrip) {
              void bookingService.updateTrip(trip.id, {
                driverTelemetry: latestBuffered,
                currentLocation: latestBuffered,
              });
            }
          }
          getWorkspaceBus().publish('DRIVER_TELEMETRY_PING', {
            tripId: isActiveTripState ? trip?.id : undefined,
            driverId,
            dutyStatus,
            ...latestBuffered,
          });
          setLastBroadcastAt(new Date().toLocaleTimeString());
        } catch (err) {
          console.warn('[useDriverTelemetry] Error flushing offline buffer:', err);
        }
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [trip?.id, isActiveTripState, driverId, dutyStatus]);

  // Main Geolocation Tracking & Throttling Engine
  useEffect(() => {
    const shouldTrackShift =
      Boolean(driverId) && (dutyStatus === 'on_duty' || dutyStatus === 'on_break');

    if (!isEnabled || (!isActiveTripState && !shouldTrackShift)) {
      setIsTracking(false);
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    // Reset throttle on status transition so Dispatch sees the fresh state immediately
    lastBroadcastMsRef.current = 0;
    setIsTracking(true);
    setGpsError(null);

    const broadcastPing = (ping: DriverTelemetryPing) => {
      setCurrentTelemetry(ping);
      latestPingRef.current = ping;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineBufferRef.current.push({ ...ping, isOfflineBuffer: true });
        if (offlineBufferRef.current.length > MAX_OFFLINE_BUFFER) {
          offlineBufferRef.current = offlineBufferRef.current.slice(-MAX_OFFLINE_BUFFER);
        }
        setPendingBufferCount(offlineBufferRef.current.length);
        return;
      }

      const now = Date.now();
      const intervalMs = getAdaptiveThrottleIntervalMs(ping.speedMph || 0, {
        isActiveTrip: isActiveTripState,
        dutyStatus,
      });
      setCurrentIntervalSeconds(intervalMs / 1000);

      if (now - lastBroadcastMsRef.current < intervalMs && lastBroadcastMsRef.current !== 0) {
        return;
      }

      lastBroadcastMsRef.current = now;
      setLastBroadcastAt(new Date().toLocaleTimeString());

      try {
        // 1. Always update driver document for live fleet tracking (available / en_route / busy / break)
        if (driverId) {
          void getDriverService().updateDriverLocation(driverId, ping);
        }

        // 2. Also update active trip document for customer live telemetry tracking
        if (isActiveTripState && trip?.id) {
          const bookingService = getBookingService();
          if (bookingService?.updateTrip) {
            void bookingService.updateTrip(trip.id, {
              driverTelemetry: ping,
              currentLocation: ping,
            });
          }
        }

        // 3. Publish across browser tabs/windows for instant local dispatch updates
        getWorkspaceBus().publish('DRIVER_TELEMETRY_PING', {
          tripId: isActiveTripState ? trip?.id : undefined,
          driverId,
          dutyStatus,
          ...ping,
        });
      } catch (err) {
        console.warn('[useDriverTelemetry] Telemetry broadcast error:', err);
      }
    };

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const coords: GeoPoint = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };

            const rawSpeed = position.coords.speed;
            const speedMph =
              rawSpeed != null && !Number.isNaN(rawSpeed) && rawSpeed >= 0
                ? Number((rawSpeed * 2.23694).toFixed(1))
                : 0;

            // Use hardware compass heading if valid, otherwise compute from movement >= 15m
            let resolvedHeading: number | undefined = lastHeadingRef.current;
            const rawHeading = position.coords.heading;
            if (
              typeof rawHeading === 'number' &&
              !Number.isNaN(rawHeading) &&
              rawHeading >= 0 &&
              rawHeading <= 360
            ) {
              resolvedHeading = Math.round(rawHeading);
            } else if (prevFixRef.current && distanceMeters(prevFixRef.current, coords) >= 15) {
              resolvedHeading = computeCompassBearing(prevFixRef.current, coords);
            }

            if (typeof resolvedHeading === 'number') {
              lastHeadingRef.current = resolvedHeading;
            }
            if (!prevFixRef.current || distanceMeters(prevFixRef.current, coords) >= 15) {
              prevFixRef.current = coords;
            }

            const ping: DriverTelemetryPing = {
              coordinates: coords,
              speedMph,
              heading: resolvedHeading,
              accuracy: Math.round(position.coords.accuracy),
              timestamp: new Date(position.timestamp).toISOString(),
              status: isActiveTripState ? trip?.status : dutyStatus,
            };

            broadcastPing(ping);
          },
          (err) => {
            console.warn('[useDriverTelemetry] Geolocation watch error:', err.message);
            setGpsError(err.message);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000,
          }
        );

        watchIdRef.current = watchId;
      } catch (err: any) {
        console.warn('[useDriverTelemetry] Failed to initialize geolocation watch:', err);
        setGpsError(err?.message || 'GPS watch initialization failed');
      }
    } else {
      setGpsError('Geolocation API not supported on this device');
    }

    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
    };
  }, [trip?.id, trip?.status, isActiveTripState, driverId, dutyStatus, isEnabled]);

  return {
    currentTelemetry,
    isTracking,
    isOffline,
    lastBroadcastAt,
    pendingOfflineBufferCount: pendingBufferCount,
    gpsError,
    currentIntervalSeconds,
  };
}
