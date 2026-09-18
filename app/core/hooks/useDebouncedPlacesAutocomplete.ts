/**
 * Debounced Google Places Autocomplete Hook
 * 
 * Enforces a strict 300ms debounce on keystrokes before calling Google Places API,
 * drastically reducing billable API requests and eliminating high-frequency query flooding.
 * 
 * Provides graceful UI degradation when offline or when Google Maps API quotas are exhausted.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ST_LOUIS_METRO_BOUNDS,
  type GoogleMapsStatus,
} from '../services/maps/google-maps-loader';
import type { GeoPoint } from '../types/trip';

export interface AutocompletePredictionItem {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetailsResult {
  address: string;
  formattedAddress?: string;
  placeId?: string;
  coordinates?: GeoPoint;
}

export interface UseDebouncedPlacesAutocompleteOptions {
  inputValue: string;
  mapsStatus: GoogleMapsStatus;
  debounceMs?: number; // strict 300ms by default
  enabled?: boolean;
}

export function useDebouncedPlacesAutocomplete({
  inputValue,
  mapsStatus,
  debounceMs = 300,
  enabled = true,
}: UseDebouncedPlacesAutocompleteOptions) {
  const [predictions, setPredictions] = useState<AutocompletePredictionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasQuotaError, setHasQuotaError] = useState(false);

  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize Google Places services once mapsStatus is 'ready'
  useEffect(() => {
    if (typeof window === 'undefined' || mapsStatus !== 'ready') return;

    try {
      if (
        window.google?.maps?.places?.AutocompleteService &&
        !autocompleteServiceRef.current
      ) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (
        window.google?.maps?.places?.PlacesService &&
        !placesServiceRef.current
      ) {
        placesServiceRef.current = new window.google.maps.places.PlacesService(
          document.createElement('div')
        );
      }
    } catch (err) {
      console.warn('[useDebouncedPlacesAutocomplete] Init error:', err);
    }

    return () => {
      // Clean up references on unmount
      autocompleteServiceRef.current = null;
      placesServiceRef.current = null;
    };
  }, [mapsStatus]);

  // Debounced Place Predictions Fetcher
  useEffect(() => {
    // Clear any previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const query = inputValue.trim();

    // Reset if query is too short or autocomplete is disabled
    if (!enabled || query.length < 2 || mapsStatus !== 'ready') {
      setPredictions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Enforce strict 300ms quiet period before hitting Google Places API
    debounceTimerRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        setIsLoading(false);
        return;
      }

      try {
        const stlBounds = new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(ST_LOUIS_METRO_BOUNDS.south, ST_LOUIS_METRO_BOUNDS.west),
          new window.google.maps.LatLng(ST_LOUIS_METRO_BOUNDS.north, ST_LOUIS_METRO_BOUNDS.east)
        );

        autocompleteServiceRef.current.getPlacePredictions(
          {
            input: query,
            bounds: stlBounds,
            componentRestrictions: { country: 'us' },
          },
          (results, status) => {
            setIsLoading(false);

            if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
              setHasQuotaError(false);
              const mapped: AutocompletePredictionItem[] = results.map((r) => ({
                placeId: r.place_id,
                description: r.description,
                mainText: r.structured_formatting?.main_text || r.description,
                secondaryText: r.structured_formatting?.secondary_text || '',
              }));
              setPredictions(mapped);
            } else if (
              status === window.google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT ||
              status === window.google.maps.places.PlacesServiceStatus.REQUEST_DENIED
            ) {
              console.warn('[useDebouncedPlacesAutocomplete] Places API quota or permission error:', status);
              setHasQuotaError(true);
              setPredictions([]);
            } else {
              setPredictions([]);
            }
          }
        );
      } catch (err) {
        console.warn('[useDebouncedPlacesAutocomplete] Query error:', err);
        setIsLoading(false);
        setPredictions([]);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [inputValue, mapsStatus, enabled, debounceMs]);

  // Fetch Place Details (coordinates & address) upon user selection
  const getPlaceDetails = useCallback(
    (placeId: string): Promise<PlaceDetailsResult | null> => {
      return new Promise((resolve) => {
        if (!placesServiceRef.current || !window.google?.maps) {
          resolve(null);
          return;
        }

        try {
          placesServiceRef.current.getDetails(
            {
              placeId,
              fields: ['formatted_address', 'geometry', 'name', 'place_id'],
            },
            (place, status) => {
              if (
                status === window.google.maps.places.PlacesServiceStatus.OK &&
                place
              ) {
                const address = place.formatted_address || place.name || '';
                let coordinates: GeoPoint | undefined;

                if (place.geometry?.location) {
                  const loc = place.geometry.location;
                  const lat = typeof loc.lat === 'function' ? loc.lat() : Number((loc as any).lat);
                  const lng = typeof loc.lng === 'function' ? loc.lng() : Number((loc as any).lng);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    coordinates = { lat, lng };
                  }
                }

                resolve({
                  address,
                  formattedAddress: place.formatted_address || address,
                  placeId: place.place_id,
                  coordinates,
                });
              } else {
                console.warn('[useDebouncedPlacesAutocomplete] getDetails status:', status);
                resolve(null);
              }
            }
          );
        } catch (err) {
          console.warn('[useDebouncedPlacesAutocomplete] getDetails exception:', err);
          resolve(null);
        }
      });
    },
    []
  );

  return {
    predictions,
    isLoading,
    hasQuotaError,
    getPlaceDetails,
  };
}
