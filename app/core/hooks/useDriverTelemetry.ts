/**
 * Driver Geolocation Telemetry Broadcaster
 * 
 * Adaptive GPS telemetry broadcaster with strict throttling:
 * - 15-second intervals when stationary or low speed (<= 15 mph)
 * - 10-second intervals when moving (> 15 mph)
 * 
 * Includes offline buffering, graceful network degradation,
 * and comprehensive cleanup of DOM listeners and geolocation watchers on unmount.
 */

import { useState, useEffect, useRef } from 'react';
import type { Trip, DriverTelemetryPing } from '../types/trip';
import { getBookingService } from '../services/booking';
import { getWorkspaceBus } from '../services/workspace-bus.service';

export interface UseDriverTelemetryOptions {
  trip: Trip | null;
  driverId?: string;
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
 * Calculates adaptive broadcast interval based on vehicle ground speed:
 * - > 15 mph: 10,000 ms (10 seconds)
 * - <= 15 mph: 15,000 ms (15 seconds)
 */
export function getAdaptiveThrottleIntervalMs(speedMph: number): number {
  return speedMph > 15 ? 10000 : 15000;
}

export function useDriverTelemetry({
  trip,
  driverId,
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
  const watchIdRef = useRef<number | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Monitor network connectivity (Online / Offline)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOffline(false);
      // Flush buffered location if available upon reconnecting
      if (offlineBufferRef.current.length > 0 && trip?.id) {
        const latestBuffered = offlineBufferRef.current[offlineBufferRef.current.length - 1];
        offlineBufferRef.current = [];
        setPendingBufferCount(0);

        try {
          const bookingService = getBookingService();
          if (bookingService?.updateTrip) {
            bookingService.updateTrip(trip.id, {
              driverTelemetry: latestBuffered,
              currentLocation: latestBuffered,
            });
          }
          getWorkspaceBus().publish('DRIVER_TELEMETRY_PING', {
            tripId: trip.id,
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
  }, [trip?.id]);

  // Main Geolocation Tracking & Throttling Engine
  useEffect(() => {
    // Only track during active in-flight trip phases
    const isActiveTripState =
      trip &&
      (trip.status === 'en_route' ||
        trip.status === 'arrived' ||
        trip.status === 'in_progress');

    if (!isEnabled || !isActiveTripState || !trip?.id) {
      setIsTracking(false);
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      return;
    }

    setIsTracking(true);
    setGpsError(null);

    const broadcastPing = (ping: DriverTelemetryPing) => {
      setCurrentTelemetry(ping);
      latestPingRef.current = ping;

      // If device is offline, buffer locally and do not flood network
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineBufferRef.current.push({ ...ping, isOfflineBuffer: true });
        setPendingBufferCount(offlineBufferRef.current.length);
        return;
      }

      const now = Date.now();
      const intervalMs = getAdaptiveThrottleIntervalMs(ping.speedMph || 0);
      setCurrentIntervalSeconds(intervalMs / 1000);

      // Enforce strict 10s or 15s throttle interval
      if (now - lastBroadcastMsRef.current < intervalMs && lastBroadcastMsRef.current !== 0) {
        return;
      }

      lastBroadcastMsRef.current = now;
      setLastBroadcastAt(new Date().toLocaleTimeString());

      try {
        const bookingService = getBookingService();
        if (bookingService?.updateTrip) {
          bookingService.updateTrip(trip.id, {
            driverTelemetry: ping,
            currentLocation: ping,
          });
        }

        getWorkspaceBus().publish('DRIVER_TELEMETRY_PING', {
          tripId: trip.id,
          driverId,
          ...ping,
        });
      } catch (err) {
        console.warn('[useDriverTelemetry] Telemetry broadcast error:', err);
      }
    };

    // Attempt HTML5 Geolocation API
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const rawSpeed = position.coords.speed;
            const speedMph =
              rawSpeed != null && rawSpeed >= 0
                ? Number((rawSpeed * 2.23694).toFixed(1))
                : 0;

            const ping: DriverTelemetryPing = {
              coordinates: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
              speedMph,
              heading: position.coords.heading ?? undefined,
              accuracy: Math.round(position.coords.accuracy),
              timestamp: new Date(position.timestamp).toISOString(),
              status: trip.status,
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

    // Safety unmount cleanup
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      setIsTracking(false);
    };
  }, [trip?.id, trip?.status, driverId, isEnabled]);

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
