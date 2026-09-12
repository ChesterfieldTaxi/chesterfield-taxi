/// <reference types="google.maps" />

import React, { useState, useRef, useEffect, useId } from 'react';
import type { GeoPoint } from '../../core/types';
import {
  loadGoogleMaps,
  isGoogleMapsReady,
  getGoogleMapsStatus,
  subscribeToGoogleMapsStatus,
  ST_LOUIS_METRO_BOUNDS,
  type GoogleMapsStatus,
} from '../../core/services/maps/google-maps-loader';
import { MapPinIcon, FlagIcon, CheckIcon } from '../ui/Icons';

export interface PlaceSelectedDetails {
  address: string;
  formattedAddress?: string;
  placeId?: string;
  coordinates?: GeoPoint;
}

export interface LocationAutocompleteProps {
  name?: string;
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  onPlaceSelected?: (details: PlaceSelectedDetails) => void;
  required?: boolean;
  disabled?: boolean;
  icon?: 'map-pin' | 'flag';
  autoFocus?: boolean;
  className?: string;
}

const POPULAR_LOCATIONS = [
  'Chesterfield Valley Shopping Center, Chesterfield, MO',
  'Spirit of St. Louis Airport (SUS), Chesterfield, MO',
  'St. Louis Lambert International Airport (STL), St. Louis, MO',
  'Chesterfield Mall / Downtown Chesterfield, MO',
  "St. Luke's Hospital, Chesterfield, MO",
  'Chesterfield Amphitheater, Chesterfield, MO',
  'Faust Park / Butterfly House, Chesterfield, MO',
  'Downtown St. Louis / Gateway Arch, St. Louis, MO',
  'Town and Country Crossing, Town and Country, MO',
  'Centene Community Ice Center, Maryland Heights, MO',
];

export function LocationAutocomplete({
  name,
  label,
  placeholder = 'Enter address, venue, or airport...',
  helperText,
  error,
  value = '',
  onChange,
  onPlaceSelected,
  required,
  disabled = false,
  icon = 'map-pin',
  autoFocus = false,
  className = '',
}: LocationAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>(getGoogleMapsStatus());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // Stable callback references to prevent re-instantiating Autocomplete on every keystroke
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onPlaceSelectedRef = useRef(onPlaceSelected);
  onPlaceSelectedRef.current = onPlaceSelected;

  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const listId = `${generatedId}-list`;
  const errorId = `${generatedId}-error`;
  const helperId = `${generatedId}-helper`;

  // Sync external value with local input value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Subscribe to Google Maps API status
  useEffect(() => {
    // Attempt client load if browser environment
    loadGoogleMaps().catch((e) => {
      console.warn('[LocationAutocomplete] Google Maps load failed:', e);
    });

    const unsubscribe = subscribeToGoogleMapsStatus((status) => {
      setMapsStatus(status);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Initialize Google Places Autocomplete when API is ready
  useEffect(() => {
    if (disabled || mapsStatus !== 'ready' || !inputRef.current) {
      return;
    }

    // Guard against duplicate instantiation on the same input element
    if (autocompleteRef.current) {
      return;
    }

    try {
      if (typeof window.google?.maps?.places?.Autocomplete !== 'function') {
        return;
      }

      // Configure St. Louis Metro & West County bounding box
      const stlBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(ST_LOUIS_METRO_BOUNDS.south, ST_LOUIS_METRO_BOUNDS.west),
        new google.maps.LatLng(ST_LOUIS_METRO_BOUNDS.north, ST_LOUIS_METRO_BOUNDS.east)
      );

      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        bounds: stlBounds,
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'geometry', 'name', 'place_id'],
        strictBounds: false, // Biased toward St. Louis/West County, allows regional expansion
      });

      const listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const selectedAddress = place.formatted_address || place.name || '';

        if (selectedAddress) {
          setInputValue(selectedAddress);
          onChangeRef.current?.(selectedAddress);
          setIsOpen(false);

          let coordinates: GeoPoint | undefined;
          if (place.geometry?.location) {
            const loc = place.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number((loc as unknown as { lat: number }).lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number((loc as unknown as { lng: number }).lng);
            if (!isNaN(lat) && !isNaN(lng)) {
              coordinates = { lat, lng };
            }
          }

          console.log('[LocationAutocomplete] Place selected:', {
            inputName: name,
            address: selectedAddress,
            placeId: place.place_id,
            coordinates,
          });

          onPlaceSelectedRef.current?.({
            address: selectedAddress,
            formattedAddress: place.formatted_address || selectedAddress,
            placeId: place.place_id,
            coordinates,
          });
        }
      });

      autocompleteRef.current = autocomplete;
      listenerRef.current = listener;
    } catch (err) {
      console.warn('[LocationAutocomplete] Error initializing Google Places Autocomplete:', err);
    }

    return () => {
      if (listenerRef.current) {
        google.maps.event.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [mapsStatus, disabled]);

  // Defend against Google Maps disabling or hijacking the input on auth error (e.g. RefererNotAllowedMapError)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const restoreInput = () => {
      if (disabled) return;
      if (input.disabled || input.getAttribute('disabled') !== null) {
        input.removeAttribute('disabled');
        input.disabled = false;
      }
      if (input.classList.contains('gm-err-autocomplete')) {
        input.classList.remove('gm-err-autocomplete');
      }
      if (input.value === 'Oops! Something went wrong.') {
        input.value = inputValue;
      }
      if (input.placeholder === 'Oops! Something went wrong.') {
        input.placeholder = placeholder || '';
      }

      // Remove any injected Google error icons or overlays
      const parent = input.parentElement;
      if (parent) {
        const errorNodes = parent.querySelectorAll('.gm-err-icon, [class*="gm-err"]');
        errorNodes.forEach((node) => node.remove());
      }
    };

    if (mapsStatus === 'error') {
      restoreInput();
    }

    // Observe DOM mutations to prevent Google from greying out and disabling the input
    const observer = new MutationObserver(() => {
      if (!disabled && (input.disabled || input.classList.contains('gm-err-autocomplete') || input.value === 'Oops! Something went wrong.')) {
        restoreInput();
      }
    });

    observer.observe(input, {
      attributes: true,
      attributeFilter: ['disabled', 'class', 'placeholder'],
      subtree: false,
    });

    return () => {
      observer.disconnect();
    };
  }, [mapsStatus, disabled, inputValue, placeholder]);

  // Handle clicking outside for the fallback dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChangeRef.current?.(val);
    // Only open local fallback dropdown if Google Maps is NOT active
    if (mapsStatus !== 'ready') {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If user presses enter while selecting an autocomplete suggestion, prevent form submission
    if (e.key === 'Enter') {
      const pacContainer = document.querySelector('.pac-container') as HTMLElement | null;
      const isPacVisible = pacContainer && window.getComputedStyle(pacContainer).display !== 'none';
      if (isPacVisible) {
        e.preventDefault();
      }
    }
  };

  const handleSelectLocation = (loc: string) => {
    setInputValue(loc);
    onChangeRef.current?.(loc);
    onPlaceSelectedRef.current?.({
      address: loc,
      formattedAddress: loc,
    });
    setIsOpen(false);
  };

  const filteredLocations = POPULAR_LOCATIONS.filter((loc) =>
    loc.toLowerCase().includes(inputValue.toLowerCase())
  );

  const isGoogleLive = mapsStatus === 'ready';

  return (
    <div ref={containerRef} className={`relative w-full flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
          >
            {label}
            {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
          </label>
        )}

        {/* Live Google Maps Status Indicator */}
        {isGoogleLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Google Maps Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            St. Louis Region (Local Mode)
          </span>
        )}
      </div>

      <div className="relative flex items-center w-full">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
          {icon === 'flag' ? (
            <FlagIcon className="w-4 h-4 text-slate-500" />
          ) : (
            <MapPinIcon className="w-4 h-4 text-amber-500" />
          )}
        </div>

        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // Only trigger local list when Google Maps Autocomplete is NOT attached
            if (!isGoogleLive) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-expanded={isOpen}
          aria-autocomplete={isGoogleLive ? 'both' : 'list'}
          aria-controls={listId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={`w-full rounded-xl border bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-slate-200 hover:border-slate-300 focus:border-amber-500 focus:ring-amber-100'
          }`}
        />
      </div>

      {/* Local Fallback Suggestions Dropdown (active when Google Maps is not connected) */}
      {!isGoogleLive && isOpen && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition-all"
        >
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Suggested St. Louis & Chesterfield Locations</span>
            <span className="text-[10px] font-normal normal-case text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              Offline / Local Fallback
            </span>
          </div>

          {filteredLocations.length > 0 ? (
            filteredLocations.map((loc) => {
              const isSelected = inputValue.trim().toLowerCase() === loc.toLowerCase();
              return (
                <button
                  key={loc}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50 text-amber-900 font-medium'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPinIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{loc}</span>
                  </div>
                  {isSelected && <CheckIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500 italic">
              Press enter or keep typing custom address "{inputValue}"
            </div>
          )}
        </div>
      )}

      {error && (
        <p id={errorId} className="text-xs text-red-600 font-medium mt-0.5">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-xs text-slate-500 mt-0.5">
          {helperText}
        </p>
      )}
    </div>
  );
}
