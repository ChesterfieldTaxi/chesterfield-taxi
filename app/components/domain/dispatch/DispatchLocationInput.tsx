/// <reference types="google.maps" />

import React, { useState, useRef, useEffect, useId } from 'react';
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
  name?: string;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onPlaceSelected?: (details: PlaceSelectedDetails) => void;
  variant?: 'pickup' | 'dropoff' | 'stop';
  size?: 'compact' | 'comfortable';
  showCurrentLocationButton?: boolean;
  hasError?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

interface RegionalPresetLocation {
  address: string;
  coordinates: GeoPoint;
}

const REGIONAL_DISPATCH_LOCATIONS: RegionalPresetLocation[] = [
  {
    address: 'St. Louis Lambert International Airport (STL), St. Louis, MO',
    coordinates: { lat: 38.7487, lng: -90.37 },
  },
  {
    address: 'Spirit of St. Louis Airport (SUS), Chesterfield, MO',
    coordinates: { lat: 38.6621, lng: -90.652 },
  },
  {
    address: 'Chesterfield Valley Shopping Center, Chesterfield, MO',
    coordinates: { lat: 38.6685, lng: -90.5797 },
  },
  {
    address: 'Chesterfield Mall / Downtown Chesterfield, MO',
    coordinates: { lat: 38.6531, lng: -90.5625 },
  },
  {
    address: "St. Luke's Hospital, Chesterfield, MO",
    coordinates: { lat: 38.6458, lng: -90.5091 },
  },
  {
    address: 'Downtown St. Louis / Gateway Arch, St. Louis, MO',
    coordinates: { lat: 38.6247, lng: -90.1848 },
  },
  {
    address: 'Centene Community Ice Center, Maryland Heights, MO',
    coordinates: { lat: 38.7248, lng: -90.4648 },
  },
  {
    address: 'Town and Country Crossing, Town and Country, MO',
    coordinates: { lat: 38.6295, lng: -90.4712 },
  },
];

export function DispatchLocationInput({
  name,
  id,
  ariaLabel,
  placeholder = 'Enter address...',
  value = '',
  onChange,
  onPlaceSelected,
  variant = 'pickup',
  size = 'compact',
  showCurrentLocationButton = false,
  hasError = false,
  disabled = false,
  required = false,
  className = '',
}: DispatchLocationInputProps) {
  const autoId = useId();
  const listboxId = `${id || name || autoId}-listbox`;
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
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

  // Handle outside clicks / touches to close dropdown
  useEffect(() => {
    function handlePointerDownOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocateError(null);
    setInputValue(val);
    onChangeRef.current?.(val);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelectPrediction = async (prediction: AutocompletePredictionItem) => {
    setLocateError(null);
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

  const handleSelectRegional = (loc: RegionalPresetLocation) => {
    setLocateError(null);
    setInputValue(loc.address);
    onChangeRef.current?.(loc.address);
    onPlaceSelectedRef.current?.({
      address: loc.address,
      formattedAddress: loc.address,
      coordinates: loc.coordinates,
    });
    setIsOpen(false);
  };

  const handleConfirmFreeformAddress = (rawAddr: string) => {
    const trimmed = rawAddr.trim();
    if (!trimmed) return;
    setIsOpen(false);

    // Attempt live geocode so freeform typed addresses still get verified coordinates & placeId
    if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        geocoder.geocode({ address: trimmed }, (results: any[] | null, status: string) => {
          if (status === 'OK' && results && results[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            const formatted = results[0].formatted_address || trimmed;
            setInputValue(formatted);
            onChangeRef.current?.(formatted);
            onPlaceSelectedRef.current?.({
              address: formatted,
              formattedAddress: formatted,
              placeId: results[0].place_id,
              coordinates: { lat: loc.lat(), lng: loc.lng() },
            });
            return;
          }
          onPlaceSelectedRef.current?.({
            address: trimmed,
            formattedAddress: trimmed,
          });
        });
        return;
      } catch {}
    }

    onPlaceSelectedRef.current?.({
      address: trimmed,
      formattedAddress: trimmed,
    });
  };

  const handleUseCurrentLocation = () => {
    if (disabled || isLocating) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('Location services are unavailable in this browser.');
      return;
    }

    setIsLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: GeoPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const finishWithAddress = (addr: string, placeId?: string) => {
          setInputValue(addr);
          onChangeRef.current?.(addr);
          onPlaceSelectedRef.current?.({
            address: addr,
            formattedAddress: addr,
            placeId,
            coordinates: coords,
          });
          setIsOpen(false);
          setIsLocating(false);
        };

        if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
          const geocoder = new (window as any).google.maps.Geocoder();
          geocoder.geocode(
            { location: coords },
            (results: any[] | null, status: string) => {
              if (status === 'OK' && results && results[0]?.formatted_address) {
                finishWithAddress(results[0].formatted_address, results[0].place_id);
              } else {
                finishWithAddress(`Current Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
              }
            }
          );
        } else {
          finishWithAddress(`Current Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocateError('Location permission denied. Please enter your pickup address.');
        } else {
          setLocateError('Could not detect location. Please type your pickup address.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const filteredRegional = REGIONAL_DISPATCH_LOCATIONS.filter((loc) =>
    inputValue.trim().length === 0
      ? true
      : loc.address.toLowerCase().includes(inputValue.toLowerCase())
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
      } else if (inputValue.trim()) {
        e.preventDefault();
        handleConfirmFreeformAddress(inputValue);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const dotColor =
    variant === 'pickup'
      ? 'bg-emerald-500 ring-status-success-border'
      : variant === 'dropoff'
      ? 'bg-rose-500 ring-status-danger-border'
      : 'bg-amber-500 ring-status-warning-border';

  const isComfortable = size === 'comfortable';
  const showLocateBtn = showCurrentLocationButton && !inputValue && !disabled;

  return (
    <div ref={containerRef} className={`relative flex flex-col w-full ${className}`}>
      <div className="relative flex items-center w-full">
        <div className={`absolute ${isComfortable ? 'left-3.5' : 'left-2.5'} flex items-center pointer-events-none`}>
          <span className={`w-2.5 h-2.5 rounded-full ring-2 ${dotColor}`} />
        </div>

        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-label={ariaLabel || placeholder}
          aria-autocomplete="list"
          aria-expanded={isOpen && !disabled}
          aria-controls={listboxId}
          autoComplete="off"
          disabled={disabled}
          required={required}
          value={inputValue}
          placeholder={placeholder}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          className={`w-full bg-surface-card border transition-colors focus:outline-none placeholder-slate-400 ${
            isComfortable
              ? `pl-9 ${showLocateBtn ? 'pr-24' : 'pr-11'} py-2.5 text-base sm:text-sm rounded-xl text-fg-primary`
              : 'pl-8 pr-12 py-1.5 text-xs rounded text-fg-strong'
          } ${
            hasError
              ? 'border-red-400 bg-status-danger-bg/30 focus:ring-2 focus:ring-red-500/30 focus:border-red-500'
              : 'border-border-strong focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500'
          }`}
        />

        {(isLoading || isLocating) && (
          <div className={`absolute ${inputValue ? 'right-9' : 'right-3'} flex items-center pointer-events-none`}>
            <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {showLocateBtn && !isLocating && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            title="Use my current GPS location"
            aria-label="Use my current location"
            className="absolute right-2 px-2 py-1 rounded-lg text-[11px] font-bold text-blue-600 bg-status-info-bg hover:bg-status-info-bg-strong border border-status-info-border/80 transition-colors cursor-pointer flex items-center gap-1"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            <span>GPS</span>
          </button>
        )}

        {inputValue && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear address"
            onClick={() => {
              setLocateError(null);
              setInputValue('');
              onChangeRef.current?.('');
              onPlaceSelectedRef.current?.({ address: '', coordinates: undefined });
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className={`absolute ${
              isComfortable ? 'right-2 w-7 h-7' : 'right-1.5 w-6 h-6'
            } flex items-center justify-center text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted rounded-full text-xs transition-colors cursor-pointer`}
          >
            ✕
          </button>
        )}
      </div>

      {locateError && (
        <p className="text-[11px] text-status-warning-fg font-medium mt-1 ml-1">{locateError}</p>
      )}

      {/* Debounced Predictions / Regional Quick-Pick Dropdown */}
      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className={`absolute z-50 left-0 right-0 top-full mt-1 max-h-60 overflow-auto rounded-xl border border-border-subtle bg-surface-card p-1.5 shadow-xl transition-all ${
            isComfortable ? 'text-sm sm:text-xs' : 'text-xs'
          }`}
        >
          {hasLivePredictions ? (
            predictions.map((pred, idx) => (
              <button
                key={pred.placeId}
                type="button"
                role="option"
                aria-selected={idx === highlightedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectPrediction(pred);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full flex flex-col text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  idx === highlightedIndex
                    ? 'bg-status-info-bg text-status-info-fg font-semibold'
                    : 'hover:bg-surface-subtle text-fg-secondary'
                }`}
              >
                <span className="truncate font-semibold">{pred.mainText}</span>
                {pred.secondaryText && (
                  <span className="truncate text-[11px] text-fg-muted">{pred.secondaryText}</span>
                )}
              </button>
            ))
          ) : filteredRegional.length > 0 ? (
            <>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                {inputValue.trim().length === 0 ? 'Popular St. Louis & Chesterfield Locations' : 'Matching Locations'}
              </div>
              {filteredRegional.map((loc, idx) => (
                <button
                  key={loc.address}
                  type="button"
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectRegional(loc);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer truncate ${
                    idx === highlightedIndex
                      ? 'bg-status-info-bg text-status-info-fg font-semibold'
                      : 'hover:bg-surface-subtle text-fg-secondary'
                  }`}
                >
                  {loc.address}
                </button>
              ))}
              {inputValue.trim().length >= 3 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleConfirmFreeformAddress(inputValue);
                  }}
                  className="w-full text-left px-3 py-2 mt-0.5 border-t border-border-faint text-blue-600 hover:bg-status-info-bg font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Use &ldquo;{inputValue.trim()}&rdquo; as address
                </button>
              )}
            </>
          ) : inputValue.trim().length > 0 ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleConfirmFreeformAddress(inputValue);
              }}
              className="w-full text-left px-3 py-2 text-blue-600 hover:bg-status-info-bg font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Use &ldquo;{inputValue.trim()}&rdquo; as address
            </button>
          ) : null}

          {(mapsStatus === 'error' || hasQuotaError) && (
            <div className="mt-1 px-2.5 py-1.5 bg-surface-subtle border-t border-border-subtle rounded-b-lg text-[11px] text-fg-secondary flex items-center justify-between">
              <span>Type your full street address or choose a popular hub above.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
