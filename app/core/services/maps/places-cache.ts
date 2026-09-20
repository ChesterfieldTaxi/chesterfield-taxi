/**
 * Lightweight Client-Side Google Places Cache Module
 * 
 * Provides high-efficiency client-side caching for:
 * 1. Autocomplete Predictions (in-memory Map with 30-minute TTL)
 * 2. Place Details (in-memory Map + sessionStorage persistence)
 * 
 * Drastically reduces billable Google Places API requests by serving repeated
 * queries and identical place selections instantly with zero network roundtrips.
 */

import type { AutocompletePredictionItem, PlaceDetailsResult } from '../../hooks/useDebouncedPlacesAutocomplete';

const DETAILS_STORAGE_PREFIX = 'ct_places_details_';
const DEFAULT_PREDICTIONS_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedPredictionsEntry {
  timestamp: number;
  predictions: AutocompletePredictionItem[];
}

export class PlacesCache {
  private predictionsCache = new Map<string, CachedPredictionsEntry>();
  private detailsCache = new Map<string, PlaceDetailsResult>();
  private predictionsTtlMs: number;

  constructor(predictionsTtlMs: number = DEFAULT_PREDICTIONS_TTL_MS) {
    this.predictionsTtlMs = predictionsTtlMs;
  }

  private isSessionStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    try {
      const testKey = '__ct_places_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  public normalizeQuery(query: string): string {
    return (query || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Retrieves cached autocomplete predictions if available and not expired.
   */
  public getPredictions(rawQuery: string): AutocompletePredictionItem[] | null {
    const key = this.normalizeQuery(rawQuery);
    if (!key || key.length < 2) return null;

    const entry = this.predictionsCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.predictionsTtlMs) {
      this.predictionsCache.delete(key);
      return null;
    }

    return entry.predictions;
  }

  /**
   * Caches autocomplete predictions for a given query string.
   */
  public setPredictions(rawQuery: string, predictions: AutocompletePredictionItem[]): void {
    const key = this.normalizeQuery(rawQuery);
    if (!key || key.length < 2) return;

    this.predictionsCache.set(key, {
      timestamp: Date.now(),
      predictions,
    });
  }

  /**
   * Retrieves place details (coordinates, address, name) from memory or sessionStorage.
   */
  public getDetails(placeId: string): PlaceDetailsResult | null {
    if (!placeId) return null;

    // 1. Check in-memory cache
    if (this.detailsCache.has(placeId)) {
      return this.detailsCache.get(placeId) || null;
    }

    // 2. Check sessionStorage
    if (this.isSessionStorageAvailable()) {
      try {
        const item = window.sessionStorage.getItem(`${DETAILS_STORAGE_PREFIX}${placeId}`);
        if (item) {
          const parsed = JSON.parse(item) as PlaceDetailsResult;
          this.detailsCache.set(placeId, parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('[PlacesCache] Failed to read from sessionStorage:', err);
      }
    }

    return null;
  }

  /**
   * Caches place details into in-memory cache and sessionStorage.
   */
  public setDetails(placeId: string, result: PlaceDetailsResult): void {
    if (!placeId || !result) return;

    this.detailsCache.set(placeId, result);

    if (this.isSessionStorageAvailable()) {
      try {
        window.sessionStorage.setItem(
          `${DETAILS_STORAGE_PREFIX}${placeId}`,
          JSON.stringify(result)
        );
      } catch (err) {
        console.warn('[PlacesCache] Failed to write to sessionStorage:', err);
      }
    }
  }

  /**
   * Clears in-memory caches and removes place details from sessionStorage.
   */
  public clear(): void {
    this.predictionsCache.clear();
    this.detailsCache.clear();

    if (this.isSessionStorageAvailable()) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(DETAILS_STORAGE_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch (err) {
        console.warn('[PlacesCache] Failed to clear sessionStorage:', err);
      }
    }
  }

  /**
   * Returns current statistics for monitoring and debugging.
   */
  public getStats(): { predictionsCount: number; detailsCount: number } {
    return {
      predictionsCount: this.predictionsCache.size,
      detailsCount: this.detailsCache.size,
    };
  }
}

export const placesCache = new PlacesCache();
