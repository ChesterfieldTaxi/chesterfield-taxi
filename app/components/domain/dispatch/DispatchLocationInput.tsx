/// <reference types="google.maps" />

import React, { useState, useRef, useEffect } from 'react';
import type { GeoPoint } from '../../../core/types';
import {
  loadGoogleMaps,
  isGoogleMapsReady,
  subscribeToGoogleMapsStatus,
  ST_LOUIS_METRO_BOUNDS,
  type GoogleMapsStatus,
} from '../../../core/services/maps/google-maps-loader';

export interface PlaceSelectedDetails {
  address: string;
  formattedAddress?: string;
  placeId?: string;
  coordinates?: GeoPoint;
}

export interface DispatchLocationInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onPlaceSelected?: (details: PlaceSelectedDetails) => void;
  variant?: 'pickup' | 'dropoff' | 'stop';
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function DispatchLocationInput({
  placeholder = 'Enter address...',
  value = '',
  onChange,
  onPlaceSelected,
  variant = 'pickup',
  disabled = false,
  required = false,
  className = '',
}: DispatchLocationInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>(() => (typeof window !== 'undefined' && isGoogleMapsReady() ? 'ready' : 'loading'));
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onPlaceSelectedRef = useRef(onPlaceSelected);
  onPlaceSelectedRef.current = onPlaceSelected;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    loadGoogleMaps().catch((e) => console.warn('[DispatchLocationInput] Maps loader:', e));
    const unsub = subscribeToGoogleMapsStatus((status) => setMapsStatus(status));
    return unsub;
  }, []);

  useEffect(() => {
    if (disabled || mapsStatus !== 'ready' || !inputRef.current) return;
    if (autocompleteRef.current) return;

    try {
      if (typeof window.google?.maps?.places?.Autocomplete !== 'function') return;

      const stlBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(ST_LOUIS_METRO_BOUNDS.south, ST_LOUIS_METRO_BOUNDS.west),
        new google.maps.LatLng(ST_LOUIS_METRO_BOUNDS.north, ST_LOUIS_METRO_BOUNDS.east)
      );

      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        bounds: stlBounds,
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'geometry', 'name', 'place_id'],
        strictBounds: false,
      });

      const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const selectedAddress = place.formatted_address || place.name || '';
        if (selectedAddress) {
          setInputValue(selectedAddress);
          onChangeRef.current?.(selectedAddress);

          let coordinates: GeoPoint | undefined;
          if (place.geometry?.location) {
            const loc = place.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number((loc as any).lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number((loc as any).lng);
            if (!isNaN(lat) && !isNaN(lng)) {
              coordinates = { lat, lng };
            }
          }

          onPlaceSelectedRef.current?.({
            address: selectedAddress,
            formattedAddress: place.formatted_address,
            placeId: place.place_id,
            coordinates,
          });
        }
      });

      autocompleteRef.current = autocomplete;

      return () => {
        if (listener) google.maps.event.removeListener(listener);
        if (typeof google?.maps?.event?.clearInstanceListeners === 'function') {
          google.maps.event.clearInstanceListeners(autocomplete);
        }
        autocompleteRef.current = null;
      };
    } catch (e) {
      console.warn('[DispatchLocationInput] Autocomplete setup failed:', e);
    }
  }, [disabled, mapsStatus]);

  const dotColor =
    variant === 'pickup'
      ? 'bg-emerald-500 ring-emerald-200'
      : variant === 'dropoff'
      ? 'bg-rose-500 ring-rose-200'
      : 'bg-amber-500 ring-amber-200';

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <div className="absolute left-2.5 flex items-center pointer-events-none">
        <span className={`w-2.5 h-2.5 rounded-full ring-2 ${dotColor}`} />
      </div>

      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        required={required}
        value={inputValue}
        placeholder={placeholder}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChangeRef.current?.(e.target.value);
        }}
        className="w-full pl-8 pr-7 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 transition-colors"
      />

      {inputValue && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setInputValue('');
            onChangeRef.current?.('');
            onPlaceSelectedRef.current?.({ address: '', coordinates: undefined });
          }}
          className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs p-0.5 rounded-full"
        >
          ✕
        </button>
      )}
    </div>
  );
}
