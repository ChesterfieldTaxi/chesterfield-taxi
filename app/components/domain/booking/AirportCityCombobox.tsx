import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  extractAirportIataCode,
  resolveAirportDisplayValue,
  searchAirportCatalog,
  type AirportCatalogEntry,
} from '../../../core/config/airport-catalog';
import { CheckIcon, ChevronDownIcon } from '../../ui/Icons';

export interface AirportCityComboboxProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md';
  preferPrivateFbo?: boolean;
  borderClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

/**
 * Live autocomplete query: unfiltered default list until the user actually types (1-4 chars included),
 * so "y" / "yyz" / "ord" filter immediately instead of freezing on the default list.
 */
export function resolveAirportComboboxFilterQuery(
  value: string,
  isFocused: boolean,
  isDirtySinceFocus: boolean
): string {
  return !isFocused || !isDirtySinceFocus ? '' : String(value || '').trim();
}

export function AirportCityCombobox({
  value,
  onChange,
  placeholder = 'e.g. YYZ, ORD, ATL',
  size = 'md',
  preferPrivateFbo = false,
  borderClassName = 'border-status-info-border',
  disabled = false,
  ariaLabel = 'Airport or city',
}: AirportCityComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDirtySinceFocus, setIsDirtySinceFocus] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedIata = useMemo(() => extractAirportIataCode(value), [value]);
  const fullHoverTitle = useMemo(() => resolveAirportDisplayValue(value), [value]);
  const effectiveInputValue = isFocused ? value : extractAirportIataCode(value) || value;

  const filterQuery = useMemo(
    () => resolveAirportComboboxFilterQuery(value, isFocused, isDirtySinceFocus),
    [value, isFocused, isDirtySinceFocus]
  );

  const matches = useMemo(
    () => searchAirportCatalog(filterQuery, 30, { preferPrivateFbo }),
    [filterQuery, preferPrivateFbo]
  );

  const computeCoords = useCallback((): PopoverCoords | null => {
    if (typeof window === 'undefined' || !triggerWrapRef.current) return null;
    const rect = triggerWrapRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
    const estHeight = popoverRef.current?.offsetHeight || 240;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estHeight + 10 && rect.top > spaceBelow;
    const top = openUpward
      ? Math.max(8, rect.top - estHeight - 4)
      : Math.min(window.innerHeight - estHeight - 8, rect.bottom + 4);
    return { top, left, width, openUpward };
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setCoords(null);
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const initial = computeCoords();
    if (initial) setCoords(initial);
    setActiveIndex(0);
    setIsOpen(true);
  }, [computeCoords, disabled]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      setCoords(null);
      return;
    }
    const updatePos = () => {
      const next = computeCoords();
      if (next) setCoords(next);
    };
    updatePos();
    const raf = window.requestAnimationFrame(updatePos);
    const onReposition = (e?: Event) => {
      if (e && popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      updatePos();
    };
    const onOutsideMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || triggerWrapRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      closeDropdown();
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    document.addEventListener('mousedown', onOutsideMouseDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      document.removeEventListener('mousedown', onOutsideMouseDown);
    };
  }, [isOpen, computeCoords, closeDropdown]);

  const handleSelectEntry = (entry: AirportCatalogEntry) => {
    setIsDirtySinceFocus(false);
    onChange(entry.iata);
    closeDropdown();
  };

  const handleBlur = () => {
    setIsFocused(false);
    setIsDirtySinceFocus(false);
    closeDropdown();
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    const compactCode = extractAirportIataCode(trimmed);
    const resolvedDisplay = resolveAirportDisplayValue(trimmed);
    if (compactCode && (/^[A-Za-z0-9]{3,4}$/.test(trimmed) || resolvedDisplay !== trimmed)) {
      if (compactCode !== value) onChange(compactCode);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isOpen) { e.preventDefault(); e.stopPropagation(); closeDropdown(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) openDropdown();
      else if (matches.length > 0) setActiveIndex((prev) => (prev + 1) % matches.length);
    } else if (e.key === 'ArrowUp' && isOpen && matches.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' && isOpen && matches[activeIndex]) {
      e.preventDefault();
      handleSelectEntry(matches[activeIndex]);
    }
  };

  const sizeClass =
    size === 'xs'
      ? 'pl-2 pr-11 py-1 text-xs rounded'
      : size === 'sm'
      ? 'pl-2.5 pr-12 py-1.5 text-xs rounded-lg'
      : 'pl-3 pr-12 py-2 text-base sm:text-sm rounded-lg';

  return (
    <>
      <div ref={triggerWrapRef} className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          disabled={disabled}
          value={effectiveInputValue}
          title={fullHoverTitle || undefined}
          placeholder={placeholder}
          onFocus={() => { setIsFocused(true); setIsDirtySinceFocus(false); openDropdown(); }}
          onBlur={handleBlur}
          onChange={(e) => { setIsDirtySinceFocus(true); onChange(e.target.value); setActiveIndex(0); if (!isOpen) openDropdown(); }}
          onKeyDown={handleKeyDown}
          className={`w-full bg-surface-card border ${borderClassName} ${sizeClass} font-mono font-bold text-fg-primary placeholder:font-sans placeholder:text-fg-subtle placeholder:font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50`}
        />
        <span className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              title="Clear airport"
              onMouseDown={(e) => { e.preventDefault(); setIsDirtySinceFocus(false); onChange(''); setActiveIndex(0); inputRef.current?.focus(); }}
              className="text-fg-subtle hover:text-fg-secondary px-1 py-0.5 text-[11px] font-bold leading-none cursor-pointer"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Toggle airport suggestions"
            onMouseDown={(e) => {
              e.preventDefault();
              if (isOpen) closeDropdown();
              else { inputRef.current?.focus(); openDropdown(); }
            }}
            className="p-0.5 text-fg-subtle hover:text-fg-secondary cursor-pointer disabled:pointer-events-none"
          >
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </button>
        </span>
      </div>

      {isOpen && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            data-ui-select-portal="true"
            style={{
              position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
              transformOrigin: coords.openUpward ? 'bottom left' : 'top left',
            }}
            className="bg-surface-card rounded-xl shadow-xl border border-border-subtle/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-border-faint select-none z-[99999]"
          >
            <div className="max-h-56 overflow-y-auto custom-scrollbar py-0.5">
              {matches.map((entry, idx) => {
                const isSelected = selectedIata === entry.iata;
                const isHighlighted = idx === activeIndex;
                return (
                  <button
                    key={entry.iata}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectEntry(entry); }}
                    className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-status-info-bg/80 text-status-info-fg font-bold' : isHighlighted ? 'bg-status-info-bg/80 text-status-info-fg' : 'text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-extrabold text-[11px]">{entry.iata}</span>
                        <span className="truncate font-semibold">{entry.city}</span>
                        {entry.isPrivateFbo && (
                          <span className="px-1 rounded bg-surface-muted text-fg-secondary text-[9px] font-bold shrink-0">FBO</span>
                        )}
                      </div>
                      <div className="text-[10px] text-fg-subtle truncate">{entry.name}</div>
                    </div>
                    {isSelected && <CheckIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
              {matches.length === 0 && (
                <div className="px-3 py-2.5 text-center text-[11px] text-fg-muted">
                  Press Tab or continue typing to keep custom airport <strong className="font-semibold text-fg-strong">{value.trim()}</strong>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
