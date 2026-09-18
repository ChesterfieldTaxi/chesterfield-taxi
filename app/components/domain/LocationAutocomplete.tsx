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
} from '../../core/services/maps';
import {
  useDebouncedPlacesAutocomplete,
  type AutocompletePredictionItem,
} from '../../core/hooks/useDebouncedPlacesAutocomplete';
import { MapPinIcon, FlagIcon, CheckIcon, SpinnerIcon } from '../ui/Icons';

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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stable callback references
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

  // Strict 300ms Debounced Autocomplete Query Engine
  const { predictions, isLoading, hasQuotaError, getPlaceDetails } =
    useDebouncedPlacesAutocomplete({
      inputValue,
      mapsStatus,
      debounceMs: 300,
      enabled: !disabled,
    });

  // Defend against Google Maps disabling or hijacking the input on auth error
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

    if (mapsStatus === 'error' || hasQuotaError) {
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
  }, [mapsStatus, hasQuotaError, disabled, inputValue, placeholder]);

  // Handle clicking outside to dismiss suggestions dropdown
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
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    if (inputValue.trim().length > 0 || filteredPopularLocations.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelectPrediction = async (prediction: AutocompletePredictionItem) => {
    setInputValue(prediction.description);
    onChangeRef.current?.(prediction.description);
    setIsOpen(false);

    const details = await getPlaceDetails(prediction.placeId);
    if (details) {
      setInputValue(details.formattedAddress || details.address);
      onPlaceSelectedRef.current?.(details);
    } else {
      onPlaceSelectedRef.current?.({
        address: prediction.description,
        formattedAddress: prediction.description,
        placeId: prediction.placeId,
      });
    }
  };

  const handleSelectPopularLocation = (loc: string) => {
    setInputValue(loc);
    onChangeRef.current?.(loc);
    onPlaceSelectedRef.current?.({
      address: loc,
      formattedAddress: loc,
    });
    setIsOpen(false);
  };

  const filteredPopularLocations = POPULAR_LOCATIONS.filter((loc) =>
    loc.toLowerCase().includes(inputValue.toLowerCase())
  );

  const hasLivePredictions =
    mapsStatus === 'ready' && !hasQuotaError && predictions.length > 0;
  const isGoogleLive = mapsStatus === 'ready' && !hasQuotaError;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    const currentItemsCount = hasLivePredictions
      ? predictions.length
      : filteredPopularLocations.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < currentItemsCount - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : currentItemsCount - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        if (hasLivePredictions && predictions[highlightedIndex]) {
          handleSelectPrediction(predictions[highlightedIndex]);
        } else if (filteredPopularLocations[highlightedIndex]) {
          handleSelectPopularLocation(filteredPopularLocations[highlightedIndex]);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isPickup = icon === 'map-pin';

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-slate-700 mb-1"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
          {isPickup ? (
            <MapPinIcon className="w-4 h-4 text-emerald-600" />
          ) : (
            <FlagIcon className="w-4 h-4 text-amber-600" />
          )}
        </div>

        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
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

        {isLoading && (
          <div className="absolute right-3.5 flex items-center pointer-events-none text-slate-400">
            <SpinnerIcon className="w-4 h-4 animate-spin text-amber-500" />
          </div>
        )}
      </div>

      {/* Debounced Google Places & Regional Fallback Suggestions Dropdown */}
      {isOpen && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition-all"
        >
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>
              {hasLivePredictions
                ? 'Google Places Predictions (300ms Debounced)'
                : 'Suggested Regional Locations'}
            </span>
            <span
              className={`text-[10px] font-normal normal-case px-1.5 py-0.5 rounded ${
                hasLivePredictions
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-amber-700 bg-amber-50'
              }`}
            >
              {hasLivePredictions
                ? 'Live Places'
                : hasQuotaError
                ? 'Quota Limit Fallback'
                : 'Offline / Regional'}
            </span>
          </div>

          {hasLivePredictions ? (
            predictions.map((pred, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={pred.placeId}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onClick={() => handleSelectPrediction(pred)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs rounded-lg transition-colors cursor-pointer ${
                    isHighlighted
                      ? 'bg-amber-50 text-amber-900 font-medium'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPinIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <div className="flex flex-col min-w-0 truncate">
                      <span className="truncate font-semibold text-slate-900">{pred.mainText}</span>
                      {pred.secondaryText && (
                        <span className="truncate text-[11px] text-slate-500">{pred.secondaryText}</span>
                      )}
                    </div>
                  </div>
                  {inputValue.trim().toLowerCase() === pred.description.toLowerCase() && (
                    <CheckIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                </button>
              );
            })
          ) : filteredPopularLocations.length > 0 ? (
            filteredPopularLocations.map((loc, idx) => {
              const isSelected = inputValue.trim().toLowerCase() === loc.toLowerCase();
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={loc}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onClick={() => handleSelectPopularLocation(loc)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs rounded-lg transition-colors cursor-pointer ${
                    isHighlighted || isSelected
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
              Press Enter or keep typing custom address "{inputValue}"
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
