import React, { useState, useRef, useEffect, useId } from 'react';
import { MapPinIcon, FlagIcon, CheckIcon } from '../ui/Icons';

export interface LocationAutocompleteProps {
  name?: string;
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
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
];

export function LocationAutocomplete({
  name,
  label,
  placeholder = 'Enter address, venue, or airport...',
  helperText,
  error,
  value = '',
  onChange,
  required,
  disabled = false,
  icon = 'map-pin',
  autoFocus = false,
  className = '',
}: LocationAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const listId = `${generatedId}-list`;
  const errorId = `${generatedId}-error`;
  const helperId = `${generatedId}-helper`;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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
    onChange?.(val);
    setIsOpen(true);
  };

  const handleSelectLocation = (loc: string) => {
    setInputValue(loc);
    onChange?.(loc);
    setIsOpen(false);
  };

  const filteredLocations = POPULAR_LOCATIONS.filter((loc) =>
    loc.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div ref={containerRef} className={`relative w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          {label}
          {required && <span className="text-amber-600 ml-1" title="Required">*</span>}
        </label>
      )}

      <div className="relative flex items-center w-full">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
          {icon === 'flag' ? (
            <FlagIcon className="w-4 h-4 text-slate-500" />
          ) : (
            <MapPinIcon className="w-4 h-4 text-amber-500" />
          )}
        </div>

        <input
          id={inputId}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-expanded={isOpen}
          aria-autocomplete="list"
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

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition-all"
        >
          <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Suggested Chesterfield Locations
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
