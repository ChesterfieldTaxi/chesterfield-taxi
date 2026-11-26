import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, ClockIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from './Icons';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatReadableDate(iso?: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return 'Select date';
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatReadableTime(hhmm?: string): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return 'Select time';
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  const period = hRaw >= 12 ? 'PM' : 'AM';
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h12}:${String(mRaw).padStart(2, '0')} ${period}`;
}

function usePortalPopoverPosition(
  isOpen: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  preferredWidth: number,
  fallbackHeight: number
) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 8,
    width: preferredWidth,
  });

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined' || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(preferredWidth, Math.max(220, window.innerWidth - 16));
    const popoverHeight = popoverRef.current?.offsetHeight || fallbackHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
    const top =
      rect.bottom + popoverHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - popoverHeight - 6)
        : rect.bottom + 6;
    setPos({ top, left, width: popoverWidth });
  }, [triggerRef, popoverRef, preferredWidth, fallbackHeight]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    const handleReposition = (e?: Event) => {
      if (e && popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return;
      }
      updatePosition();
    };
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePosition, popoverRef]);

  return pos;
}

export interface ModernDatePickerProps {
  id?: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  minDate?: string; // YYYY-MM-DD
  disabled?: boolean;
  error?: boolean;
  size?: 'sm' | 'md';
  placeholder?: string;
  className?: string;
}

/**
 * Reusable Executive Clean interactive Calendar Date Picker (Portal-anchored to escape clipping sidebars).
 */
export function ModernDatePicker({
  id,
  value,
  onChange,
  minDate,
  disabled = false,
  error = false,
  size = 'md',
  placeholder = 'Select date',
  className = '',
}: ModernDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const portalPos = usePortalPopoverPosition(isOpen, triggerRef, popoverRef, 288, 320);

  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const [viewMonth, setViewMonth] = useState<Date>(() => selectedDate || new Date());

  useEffect(() => {
    if (selectedDate) {
      setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ iso: toIsoDate(new Date(year, month, day)), day });
    }
    return cells;
  }, [viewMonth]);

  const todayIso = toIsoDate(new Date());
  const tomorrowIso = toIsoDate(new Date(Date.now() + 86400000));

  const triggerClasses =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs rounded-lg'
      : 'px-3 py-2.5 text-sm rounded-xl';

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-surface-card border font-medium text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 ${triggerClasses} ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-status-danger-border text-fg-primary'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 text-fg-primary'
            : 'border-border-strong hover:border-border-emphasis focus:border-blue-500 focus:ring-blue-500/20 text-fg-primary'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className={`truncate ${value ? 'text-fg-primary font-semibold' : 'text-fg-subtle'}`}>
            {value ? formatReadableDate(value) : placeholder}
          </span>
        </span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: portalPos.top,
              left: portalPos.left,
              width: portalPos.width,
            }}
            className="bg-surface-card rounded-2xl border border-border-subtle shadow-2xl p-3 z-[99999] space-y-2.5"
          >
            {/* Quick Chips */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={Boolean(minDate && todayIso < minDate)}
                onClick={() => {
                  onChange(todayIso);
                  setIsOpen(false);
                }}
                className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-40 ${
                  value === todayIso
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-surface-subtle hover:bg-status-info-bg text-fg-secondary border-border-subtle'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                disabled={Boolean(minDate && tomorrowIso < minDate)}
                onClick={() => {
                  onChange(tomorrowIso);
                  setIsOpen(false);
                }}
                className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-40 ${
                  value === tomorrowIso
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-surface-subtle hover:bg-status-info-bg text-fg-secondary border-border-subtle'
                }`}
              >
                Tomorrow
              </button>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() =>
                  setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                className="p-1 rounded-lg text-fg-muted hover:text-fg-primary hover:bg-surface-muted cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-xs font-extrabold text-fg-primary">
                {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() =>
                  setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
                className="p-1 rounded-lg text-fg-muted hover:text-fg-primary hover:bg-surface-muted cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-[10px] font-bold text-fg-subtle py-1">
                  {w}
                </div>
              ))}

              {/* Calendar Days */}
              {calendarCells.map((cell, idx) => {
                if (!cell) return <div key={`empty-${idx}`} className="h-8" />;
                const isSelected = cell.iso === value;
                const isToday = cell.iso === todayIso;
                const isDisabled = Boolean(minDate && cell.iso < minDate);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(cell.iso);
                      setIsOpen(false);
                    }}
                    className={`h-8 w-full rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : isToday
                        ? 'bg-status-info-bg text-status-info-fg border border-status-info-border font-bold hover:bg-status-info-bg-strong'
                        : 'text-fg-secondary hover:bg-surface-muted'
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export interface ModernTimePickerProps {
  id?: string;
  value: string; // HH:MM (24-hour)
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  size?: 'sm' | 'md';
  placeholder?: string;
  className?: string;
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES_5 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

/**
 * Reusable Executive Clean Time Picker (Portal-anchored to escape narrow sidebars).
 */
export function ModernTimePicker({
  id,
  value,
  onChange,
  disabled = false,
  error = false,
  size = 'md',
  placeholder = 'Select time',
  className = '',
}: ModernTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'hour' | 'minute' | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const portalPos = usePortalPopoverPosition(isOpen, triggerRef, popoverRef, 288, 250);

  const parsed = useMemo(() => {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) {
      return { hour12: 9, minute: '00', period: 'AM' as 'AM' | 'PM' };
    }
    const [h24, m] = value.split(':').map(Number);
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const roundedMin = String((Math.round(m / 5) * 5) % 60).padStart(2, '0');
    return { hour12, minute: roundedMin, period };
  }, [value]);

  const emitTime = (hour12: number, minute: string, period: 'AM' | 'PM') => {
    let h24 = hour12 % 12;
    if (period === 'PM') h24 += 12;
    onChange(`${String(h24).padStart(2, '0')}:${minute}`);
  };

  useEffect(() => {
    if (!isOpen) {
      setOpenDropdown(null);
      return;
    }

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
      setOpenDropdown(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openDropdown) setOpenDropdown(null);
        else setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, openDropdown]);

  const triggerClasses =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs rounded-lg'
      : 'px-3 py-2.5 text-sm rounded-xl';

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-surface-card border font-medium text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 ${triggerClasses} ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-status-danger-border text-fg-primary'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 text-fg-primary'
            : 'border-border-strong hover:border-border-emphasis focus:border-blue-500 focus:ring-blue-500/20 text-fg-primary'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ClockIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className={`truncate ${value ? 'text-fg-primary font-semibold' : 'text-fg-subtle'}`}>
            {value ? formatReadableTime(value) : placeholder}
          </span>
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-fg-subtle shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: portalPos.top,
              left: portalPos.left,
              width: portalPos.width,
            }}
            className="bg-surface-card rounded-2xl border border-border-subtle shadow-2xl z-[99999]"
          >
            {/* Live Time Readout Header */}
            <div className="px-3.5 py-2.5 bg-surface-subtle border-b border-border-subtle/80 rounded-t-2xl flex items-center justify-between">
              <span className="text-sm font-extrabold text-fg-primary font-mono tracking-tight">
                {parsed.hour12}:{parsed.minute}{' '}
                <span className="text-blue-600">{parsed.period}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>

            {/* Controls: [ Hour ▾ ] : [ Minute ▾ ] + AM/PM Separation */}
            <div className="p-3 space-y-3">
              <div className="flex items-end gap-2">
                {/* Hour Dropdown */}
                <div className="relative flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-subtle mb-1">
                    Hour
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdown((prev) => (prev === 'hour' ? null : 'hour'))
                    }
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      openDropdown === 'hour'
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-status-info-bg/40 text-status-info-fg'
                        : 'border-border-strong bg-surface-card hover:border-border-emphasis text-fg-primary'
                    }`}
                  >
                    <span className="font-mono text-sm">{parsed.hour12}</span>
                    <ChevronDownIcon
                      className={`w-4 h-4 text-fg-subtle transition-transform duration-200 ${
                        openDropdown === 'hour' ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </button>

                  {openDropdown === 'hour' && (
                    <div className="absolute left-0 right-0 mt-1.5 bg-surface-card border border-border-subtle rounded-xl shadow-xl py-1 max-h-48 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1 duration-150 custom-scrollbar">
                      {HOURS_12.map((h) => {
                        const active = parsed.hour12 === h;
                        return (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              emitTime(h, parsed.minute, parsed.period);
                              setOpenDropdown(null);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center justify-between ${
                              active
                                ? 'bg-blue-600 text-white font-bold'
                                : 'text-fg-secondary hover:bg-status-info-bg hover:text-status-info-fg'
                            }`}
                          >
                            <span>{h}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Centered Colon Separator */}
                <span className="pb-2 text-base font-black text-fg-subtle select-none">:</span>

                {/* Minute Dropdown (5-minute increments) */}
                <div className="relative flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-subtle mb-1">
                    Minute
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdown((prev) => (prev === 'minute' ? null : 'minute'))
                    }
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      openDropdown === 'minute'
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-status-info-bg/40 text-status-info-fg'
                        : 'border-border-strong bg-surface-card hover:border-border-emphasis text-fg-primary'
                    }`}
                  >
                    <span className="font-mono text-sm">{parsed.minute}</span>
                    <ChevronDownIcon
                      className={`w-4 h-4 text-fg-subtle transition-transform duration-200 ${
                        openDropdown === 'minute' ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </button>

                  {openDropdown === 'minute' && (
                    <div className="absolute left-0 right-0 mt-1.5 bg-surface-card border border-border-subtle rounded-xl shadow-xl py-1 max-h-48 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1 duration-150 custom-scrollbar">
                      {MINUTES_5.map((m) => {
                        const active = parsed.minute === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              emitTime(parsed.hour12, m, parsed.period);
                              setOpenDropdown(null);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center justify-between ${
                              active
                                ? 'bg-blue-600 text-white font-bold'
                                : 'text-fg-secondary hover:bg-status-info-bg hover:text-status-info-fg'
                            }`}
                          >
                            <span>{m}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Dedicated AM / PM Separation */}
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-subtle mb-1">
                  Period
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface-muted rounded-xl border border-border-subtle">
                  {(['AM', 'PM'] as const).map((p) => {
                    const active = parsed.period === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => emitTime(parsed.hour12, parsed.minute, p)}
                        className={`py-1.5 rounded-lg text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-fg-secondary hover:text-fg-primary'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
