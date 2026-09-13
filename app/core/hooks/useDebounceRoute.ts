/**
 * Debounce & Routing Trigger Guarding Hooks & Helpers
 * 
 * Provides:
 * 1. An 800ms debounce hook for Google Directions API / quote recalculations.
 * 2. Explicit execution guards ensuring API requests ONLY fire when both origin
 *    and destination possess valid Google place_ids or explicit Lat/Lng coordinates.
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Checks whether an endpoint has either a valid Google place_id or explicit GPS coordinates.
 */
export function hasValidRoutingEndpoint(
  endpoint: unknown,
  placeId?: string
): boolean {
  // 1. Explicit place_id passed or embedded
  if (typeof placeId === 'string' && placeId.trim().length >= 5) {
    return true;
  }

  if (!endpoint) return false;

  // 2. Object with placeId or place_id property
  if (typeof endpoint === 'object' && endpoint !== null) {
    const obj = endpoint as Record<string, unknown>;
    if (typeof obj.placeId === 'string' && obj.placeId.trim().length >= 5) {
      return true;
    }
    if (typeof obj.place_id === 'string' && (obj.place_id as string).trim().length >= 5) {
      return true;
    }

    // 3. Object with explicit lat/lng coordinates
    if ('lat' in obj && 'lng' in obj) {
      const lat = typeof obj.lat === 'function' ? (obj.lat as () => unknown)() : obj.lat;
      const lng = typeof obj.lng === 'function' ? (obj.lng as () => unknown)() : obj.lng;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        return true;
      }
    }
  }

  // 4. String with explicit lat,lng format (e.g. "38.6631, -90.5771")
  if (typeof endpoint === 'string') {
    const trimmed = endpoint.trim();
    const latLngPattern = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
    if (latLngPattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that both origin and destination endpoints satisfy the execution guard.
 */
export function hasValidRoutePair(
  origin: unknown,
  destination: unknown,
  originPlaceId?: string,
  destPlaceId?: string
): boolean {
  return (
    hasValidRoutingEndpoint(origin, originPlaceId) &&
    hasValidRoutingEndpoint(destination, destPlaceId)
  );
}

/**
 * Custom hook that runs an effect only after an 800ms debounce quiet period.
 */
export function useDebouncedRouteEffect(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  delay = 800
): void {
  const cleanupRef = useRef<void | (() => void)>(undefined);

  useEffect(() => {
    const handler = setTimeout(() => {
      cleanupRef.current = effect();
    }, delay);

    return () => {
      clearTimeout(handler);
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

/**
 * Custom hook providing a debounced callback function (defaults to 800ms).
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay = 800
): (...args: Parameters<T>) => void {
  const callbackRef = useRef<T>(callback);
  callbackRef.current = callback;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}
