/// <reference types="google.maps" />

/**
 * Client-Side Google Maps API Loader & Regional Configuration
 * 
 * Safely loads the Google Maps JavaScript API client-side using @googlemaps/js-api-loader
 * with key `VITE_GOOGLE_MAPS_API_KEY`.
 * 
 * Provides:
 * 1. Safe SSR execution check (never attempts DOM injection during server rendering).
 * 2. Transparent fallback state ('unconfigured') when no API key is present or when rate-limited.
 * 3. St. Louis Metro & West County regional bounds for Places Autocomplete biasing.
 * 4. Reactive status change listeners for UI indicator badges and fallbacks.
 */

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

declare global {
  interface Window {
    google?: typeof google;
  }
}

export type GoogleMapsStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

export interface RegionalLatLng {
  lat: number;
  lng: number;
}

export interface RegionalBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Chesterfield, MO Regional Center (Chesterfield Airport Rd Corridor)
 */
export const CHESTERFIELD_CENTER: RegionalLatLng = {
  lat: 38.6631,
  lng: -90.5771,
};

/**
 * St. Louis Metropolitan & West County Regional Bounding Box
 * 
 * Encompasses:
 * - West: Spirit of St. Louis Airport (SUS), Chesterfield Valley, Wildwood (-90.85°W)
 * - East: Gateway Arch, Downtown Corridor, St. Louis Downtown Airport (CPS) (-90.10°W)
 * - North: St. Louis Lambert International Airport (STL), St. Charles, Hazelwood (38.90°N)
 * - South: Eureka, Fenton, Kirkwood, South County (38.35°N)
 */
export const ST_LOUIS_METRO_BOUNDS: RegionalBounds = {
  south: 38.35,
  west: -90.85,
  north: 38.90,
  east: -90.10,
};

/**
 * Extracts the Google Maps API key from Vite environment or node process.
 */
export function getGoogleMapsApiKey(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY).trim();
    }
  } catch {
    // Ignore in non-Vite environments
  }

  try {
    if (typeof process !== 'undefined' && process.env) {
      return String(process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
    }
  } catch {
    // Ignore in non-Node environments
  }

  return '';
}

// Module-level singleton state
let currentStatus: GoogleMapsStatus = 'unconfigured';
let lastErrorMessage: string | null = null;
let loadPromise: Promise<typeof google | null> | null = null;
type StatusListener = (status: GoogleMapsStatus, error: string | null) => void;
const listeners = new Set<StatusListener>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(currentStatus, lastErrorMessage);
    } catch (e) {
      console.error('[GoogleMapsLoader] Listener error:', e);
    }
  }
}

/**
 * Returns current lifecycle status of the Google Maps API.
 */
export function getGoogleMapsStatus(): GoogleMapsStatus {
  if (typeof window === 'undefined') {
    return 'unconfigured';
  }
  // If window.google is already available, mark as ready
  if (typeof window.google?.maps?.places?.Autocomplete === 'function') {
    return 'ready';
  }
  return currentStatus;
}

/**
 * Returns the last error message encountered if in 'error' status.
 */
export function getGoogleMapsError(): string | null {
  return lastErrorMessage;
}

/**
 * Checks whether the Google Maps API and its Places library are fully loaded.
 */
export function isGoogleMapsReady(): boolean {
  return typeof window !== 'undefined' && typeof window.google?.maps?.places?.Autocomplete === 'function';
}

/**
 * Subscribes a callback to Google Maps loader status updates.
 * Returns an unsubscribe teardown function.
 */
export function subscribeToGoogleMapsStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  // Immediately dispatch current status
  listener(getGoogleMapsStatus(), lastErrorMessage);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Initiates client-side loading of the Google Maps JavaScript API with Places, Routes, and Geometry.
 * Safe to call repeatedly; reuses the active promise.
 */
export async function loadGoogleMaps(): Promise<typeof google | null> {
  // SSR Guard
  if (typeof window === 'undefined') {
    currentStatus = 'unconfigured';
    return null;
  }

  // Already loaded in global window
  if (isGoogleMapsReady()) {
    currentStatus = 'ready';
    return window.google;
  }

  // Check API key availability
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    currentStatus = 'unconfigured';
    lastErrorMessage = 'No Google Maps API Key found (VITE_GOOGLE_MAPS_API_KEY). Running in local fallback mode.';
    notifyListeners();
    return null;
  }

  // Return existing in-flight promise if loading
  if (loadPromise) {
    return loadPromise;
  }

  currentStatus = 'loading';
  lastErrorMessage = null;
  notifyListeners();

  try {
    setOptions({
      key: apiKey,
      v: 'weekly',
      region: 'US',
    });
  } catch (err) {
    console.warn('[GoogleMapsLoader] Error configuring options:', err);
  }

  loadPromise = (async () => {
    try {
      await Promise.all([
        importLibrary('places'),
        importLibrary('routes'),
        importLibrary('geometry'),
      ]);
      currentStatus = 'ready';
      lastErrorMessage = null;
      notifyListeners();
      return window.google ?? null;
    } catch (err: unknown) {
      currentStatus = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      lastErrorMessage = `Google Maps failed to load: ${msg}`;
      console.warn('[GoogleMapsLoader]', lastErrorMessage);
      loadPromise = null;
      notifyListeners();
      return null;
    }
  })();

  return loadPromise;
}
