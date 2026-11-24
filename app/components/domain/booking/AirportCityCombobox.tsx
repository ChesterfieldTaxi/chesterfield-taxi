import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  extractAirportIataCode,
  formatAirportCodeCity,
  resolveAirportDisplayValue,
  searchAirportCatalog,
  type AirportCatalogEntry,
} from '../../../core/config/airport-catalog';
import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon } from '../../ui/Icons';

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

interface PopoverCoords { top: number; left: number; width: number; openUpward: boolean; }

export function AirportCityCombobox({
  value, onChange, placeholder = 'e.g. YYZ Toronto, ORD, ATL', size = 'md',
  preferPrivateFbo = false, borderClassName = 'border-blue-200', disabled = false,
  ariaLabel = 'Select airport or city',
}: AirportCityComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const displayValue = useMemo(() => resolveAirportDisplayValue(value), [value]);
  const selectedIata = useMemo(() => extractAirportIataCode(value), [value]);
  const matches = useMemo(
    () => searchAirportCatalog(query, 30, { preferPrivateFbo }),
    [query, preferPrivateFbo]
  );

  const customFallbackCode = useMemo(() => {
    const trimmed = query.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(trimmed)) return null;
    const exact = matches.some(
      (m) => m.iata.toUpperCase() === trimmed || m.icao.toUpperCase() === trimmed
    );
    return exact ? null : trimmed;
  }, [query, matches]);

  const totalOptions = matches.length + (customFallbackCode ? 1 : 0);

  const computeCoords = useCallback((): PopoverCoords | null => {
    if (typeof window === 'undefined' || !triggerWrapRef.current) return null;
    const rect = triggerWrapRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
    const estHeight = popoverRef.current?.offsetHeight || 280;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estHeight + 10 && rect.top > spaceBelow;
    const top = openUpward
      ? Math.max(8, rect.top - estHeight - 4)
      : Math.min(window.innerHeight - estHeight - 8, rect.bottom + 4);
    return { top, left, width, openUpward };
  }, []);

  const closeDropdown = useCallback(() => { setIsOpen(false); setCoords(null); setQuery(''); }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const initial = computeCoords();
    if (initial) setCoords(initial);
    setQuery('');
    setActiveIndex(0);
    setIsOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 10);
  }, [computeCoords, disabled]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') { setCoords(null); return; }
    const updatePos = () => { const next = computeCoords(); if (next) setCoords(next); };
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

  const handleSelectEntry = (entry: AirportCatalogEntry) => { onChange(formatAirportCodeCity(entry)); closeDropdown(); };
  const handleSelectCustom = (code: string) => { onChange(code.trim().toUpperCase()); closeDropdown(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
    } else if (e.key === 'ArrowDown' && totalOptions > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % totalOptions);
    } else if (e.key === 'ArrowUp' && totalOptions > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex < matches.length && matches[activeIndex]) handleSelectEntry(matches[activeIndex]);
      else if (customFallbackCode) handleSelectCustom(customFallbackCode);
    }
  };

  const sizeClass =
    size === 'xs'
      ? 'px-2 py-1 text-xs rounded'
      : size === 'sm'
      ? 'px-2.5 py-1.5 text-xs rounded-lg'
      : 'px-3 py-2 text-base sm:text-sm rounded-lg';

  return (
    <>
      <div ref={triggerWrapRef} className="relative w-full">
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          onClick={() => (isOpen ? closeDropdown() : openDropdown())}
          onKeyDown={handleKeyDown}
          className={`w-full bg-white border ${borderClassName} ${sizeClass} flex items-center justify-between gap-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50 cursor-pointer`}
        >
          <span className={`truncate ${displayValue ? 'font-semibold text-slate-900' : 'text-slate-400 font-normal'}`}>
            {displayValue || placeholder}
          </span>
          <span className="inline-flex items-center gap-1 shrink-0">
            {displayValue && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                title="Clear airport"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                className="text-slate-400 hover:text-slate-700 px-0.5 text-[11px] font-bold leading-none"
              >
                ✕
              </span>
            )}
            <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </span>
        </button>
      </div>

      {isOpen &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            data-ui-select-portal="true"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              transformOrigin: coords.openUpward ? 'bottom left' : 'top left',
            }}
            className="bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none z-[99999]"
          >
            <div className="px-2.5 py-1.5 bg-slate-50/60">
              <div className="relative">
                <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  placeholder="Search IATA, city, or airport..."
                  onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-7 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto custom-scrollbar py-0.5">
              {matches.map((entry, idx) => {
                const isSelected = selectedIata === entry.iata;
                const isHighlighted = idx === activeIndex;
                return (
                  <button
                    key={entry.iata}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelectEntry(entry)}
                    className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 text-blue-700 font-bold'
                        : isHighlighted
                        ? 'bg-blue-50/80 text-blue-700'
                        : 'text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-extrabold text-[11px]">{entry.iata}</span>
                        <span className="truncate font-semibold">{entry.city}</span>
                        {entry.isPrivateFbo && (
                          <span className="px-1 rounded bg-slate-100 text-slate-600 text-[9px] font-bold shrink-0">FBO</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{entry.name}</div>
                    </div>
                    {isSelected && <CheckIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}

              {customFallbackCode && (
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(matches.length)}
                  onClick={() => handleSelectCustom(customFallbackCode)}
                  className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left cursor-pointer ${
                    activeIndex === matches.length ? 'bg-blue-50/80 text-blue-700 font-bold' : 'text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                  }`}
                >
                  <span>Use custom regional code <strong className="font-mono">{customFallbackCode}</strong></span>
                </button>
              )}

              {totalOptions === 0 && (
                <div className="px-3 py-3 text-center text-[11px] text-slate-400">
                  No matching airports — type a 3–4 letter code (e.g. K79)
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
