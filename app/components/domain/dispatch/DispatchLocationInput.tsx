/// <reference types="google.maps" />

import React, { useState, useRef, useEffect } from 'react';
import type { GeoPoint } from '../../../core/types';
import {
  loadGoogleMaps,
  isGoogleMapsReady,
  subscribeToGoogleMapsStatus,
  type GoogleMapsStatus,
} from '../../../core/services/maps/google-maps-loader';
import {
  useDebouncedPlacesAutocomplete,
  type AutocompletePredictionItem,
} from '../../../core/hooks/useDebouncedPlacesAutocomplete';

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

const REGIONAL_DISPATCH_LOCATIONS = [
  'Spirit of St. Louis Airport (SUS), Chesterfield, MO',
  'St. Louis Lambert International Airport (STL), St. Louis, MO',
  'Chesterfield Valley Shopping Center, Chesterfield, MO',
  'Chesterfield Mall / Downtown Chesterfield, MO',
  "St. Luke's Hospital, Chesterfield, MO",
  'Downtown St. Louis / Gateway Arch, St. Louis, MO',
  'Centene Community Ice Center, Maryland Heights, MO',
  'Town and Country Crossing, Town and Country, MO',
];

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
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>(() =>
    typeof window !== 'undefined' && isGoogleMapsReady() ? 'ready' : 'loading'
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Strict 300ms Debounced Places Query Engine
  const { predictions, isLoading, hasQuotaError, getPlaceDetails } =
    useDebouncedPlacesAutocomplete({
      inputValue,
      mapsStatus,
      debounceMs: 300,
      enabled: !disabled,
    });

  // Handle outside clicks to close dropdown
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

  const handleSelectRegional = (loc: string) => {
    setInputValue(loc);
    onChangeRef.current?.(loc);
    onPlaceSelectedRef.current?.({
      address: loc,
      formattedAddress: loc,
    });
    setIsOpen(false);
  };

  const filteredRegional = REGIONAL_DISPATCH_LOCATIONS.filter((loc) =>
    loc.toLowerCase().includes(inputValue.toLowerCase())
  );

  const hasLivePredictions =
    mapsStatus === 'ready' && !hasQuotaError && predictions.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    const currentCount = hasLivePredictions ? predictions.length : filteredRegional.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < currentCount - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : currentCount - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        if (hasLivePredictions && predictions[highlightedIndex]) {
          handleSelectPrediction(predictions[highlightedIndex]);
        } else if (filteredRegional[highlightedIndex]) {
          handleSelectRegional(filteredRegional[highlightedIndex]);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const dotColor =
    variant === 'pickup'
      ? 'bg-emerald-500 ring-emerald-200'
      : variant === 'dropoff'
      ? 'bg-rose-500 ring-rose-200'
      : 'bg-amber-500 ring-amber-200';

  return (
    <div ref={containerRef} className={`relative flex flex-col w-full ${className}`}>
      <div className="relative flex items-center w-full">
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
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.trim().length > 0) setIsOpen(true);
          }}
          className="w-full pl-8 pr-12 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 transition-colors"
        />

        {isLoading && (
          <div className="absolute right-7 flex items-center pointer-events-none">
            <span className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {inputValue && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setInputValue('');
              onChangeRef.current?.('');
              onPlaceSelectedRef.current?.({ address: '', coordinates: undefined });
              setIsOpen(false);
            }}
            className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs p-0.5 rounded-full"
          >
            ✕
          </button>
        )}
      </div>

      {/* Debounced Predictions / Regional Fallback Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg transition-all text-xs">
          {hasLivePredictions ? (
            predictions.map((pred, idx) => (
              <button
                key={pred.placeId}
                type="button"
                role="option"
                aria-selected={idx === highlightedIndex}
                onClick={() => handleSelectPrediction(pred)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full flex flex-col text-left px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                  idx === highlightedIndex
                    ? 'bg-blue-50 text-blue-900 font-medium'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="truncate font-medium">{pred.mainText}</span>
                {pred.secondaryText && (
                  <span className="truncate text-[10px] text-slate-400">{pred.secondaryText}</span>
                )}
              </button>
            ))
          ) : filteredRegional.length > 0 ? (
            filteredRegional.map((loc, idx) => (
              <button
                key={loc}
                type="button"
                role="option"
                aria-selected={idx === highlightedIndex}
                onClick={() => handleSelectRegional(loc)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full text-left px-2.5 py-1.5 rounded transition-colors cursor-pointer truncate ${
                  idx === highlightedIndex
                    ? 'bg-blue-50 text-blue-900 font-medium'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                {loc}
              </button>
            ))
          ) : (
            <div className="px-2.5 py-1.5 text-slate-400 italic">
              Press Enter to use "{inputValue}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
