/**
 * Lightweight Client-Side Route Cache Module
 * 
 * Uses browser sessionStorage (with resilient in-memory Map fallback for SSR
 * or restricted storage environments) to cache calculated driving routes.
 * 
 * Keyed by: originPlaceId_destPlaceId_waypoints
 * 
 * Ensures repeated queries for identical routes return instantly from memory/sessionStorage
 * with zero Google Directions API calls.
 */

import type { LiveRouteResult, RouteEndpointInput } from './live-routing.service';

const SESSION_STORAGE_PREFIX = 'ct_route_cache_';

export class RouteCache {
  private inMemoryCache = new Map<string, LiveRouteResult>();

  private isSessionStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    try {
      const testKey = '__ct_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generates a deterministic cache key formatted as:
   * originPlaceId_destPlaceId_waypoints
   */
  public buildKey(
    origin: RouteEndpointInput,
    destination: RouteEndpointInput,
    waypoints: RouteEndpointInput[] = [],
    originPlaceId?: string,
    destPlaceId?: string,
    waypointPlaceIds: string[] = []
  ): string {
    const originPart = originPlaceId?.trim() || this.formatEndpoint(origin);
    const destPart = destPlaceId?.trim() || this.formatEndpoint(destination);

    const waypointParts = waypoints.map((wp, idx) => {
      const wpPlaceId = waypointPlaceIds[idx];
      return wpPlaceId?.trim() || this.formatEndpoint(wp);
    });

    const waypointsKey = waypointParts.length > 0 ? waypointParts.join('_') : 'none';
    return `${originPart}_${destPart}_${waypointsKey}`.replace(/\s+/g, '+');
  }

  private formatEndpoint(point: RouteEndpointInput): string {
    if (typeof point === 'string') {
      return point.trim().toLowerCase();
    }
    if (typeof point === 'object' && point !== null && 'lat' in point && 'lng' in point) {
      const lat = typeof point.lat === 'function' ? (point.lat as () => number)() : point.lat;
      const lng = typeof point.lng === 'function' ? (point.lng as () => number)() : point.lng;
      return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    }
    return String(point);
  }

  /**
   * Retrieves a cached route result if available.
   */
  public get(key: string): LiveRouteResult | null {
    if (!key) return null;

    // 1. Check in-memory map first
    if (this.inMemoryCache.has(key)) {
      return this.inMemoryCache.get(key) || null;
    }

    // 2. Check sessionStorage
    if (this.isSessionStorageAvailable()) {
      try {
        const item = window.sessionStorage.getItem(SESSION_STORAGE_PREFIX + key);
        if (item) {
          const parsed = JSON.parse(item) as LiveRouteResult;
          this.inMemoryCache.set(key, parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('[RouteCache] Failed to read from sessionStorage:', err);
      }
    }

    return null;
  }

  /**
   * Stores a route result in cache.
   */
  public set(key: string, result: LiveRouteResult): void {
    if (!key || !result) return;

    this.inMemoryCache.set(key, result);

    if (this.isSessionStorageAvailable()) {
      try {
        window.sessionStorage.setItem(
          SESSION_STORAGE_PREFIX + key,
          JSON.stringify(result)
        );
      } catch (err) {
        console.warn('[RouteCache] Failed to write to sessionStorage:', err);
      }
    }
  }

  /**
   * Checks whether a route is present in cache.
   */
  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clears all cached routes from both in-memory map and sessionStorage.
   */
  public clear(): void {
    this.inMemoryCache.clear();
    if (this.isSessionStorageAvailable()) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(SESSION_STORAGE_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch (err) {
        console.warn('[RouteCache] Failed to clear sessionStorage:', err);
      }
    }
  }
}

export const routeCache = new RouteCache();
