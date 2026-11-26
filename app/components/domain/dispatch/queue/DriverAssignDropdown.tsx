import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FLEET_STATUS_COLORS } from '../../../../core/hooks/useDispatchFleet';
import {
  resolveAssignmentDropdownTone,
  type AssignmentDropdownTone,
} from '../../../../core/services/dispatch/assignment-urgency.service';
import type { DispatchAutomationConfig } from '../../../../core/types/config';
import type { LiveDriverMapStatus } from '../../../../core/types/driver';
import type { Trip } from '../../../../core/types/trip';
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  XIcon,
} from '../../../ui/Icons';

export interface DriverDropdownOptionItem {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  cabNumber?: string;
  assignedUnit?: string;
  vehicleUnit?: string;
  vehicle?: string;
  tier?: string;
  vehicleTier?: string;
  zone?: string;
  status?: string;
  dutyStatus?: string;
  mapStatus?: LiveDriverMapStatus;
  formattedLabel?: string;
  isBlacklisted?: boolean;
  isArchived?: boolean;
}

export interface DriverStatusVisualMeta {
  key: LiveDriverMapStatus;
  label: 'Available' | 'En Route' | 'Busy' | 'Break' | 'Offline';
  dotClass: string;
  pillClass: string;
  sortOrder: number;
  hex: string;
}

const DRIVER_STATUS_VISUALS: Record<LiveDriverMapStatus, DriverStatusVisualMeta> = {
  available: {
    key: 'available',
    label: 'Available',
    dotClass: 'w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20',
    pillClass: 'bg-status-success-bg text-status-success-fg border-status-success-border',
    sortOrder: 0,
    hex: FLEET_STATUS_COLORS.available.hex,
  },
  en_route: {
    key: 'en_route',
    label: 'En Route',
    dotClass: 'w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/20',
    pillClass: 'bg-status-info-bg text-status-info-fg border-status-info-border',
    sortOrder: 1,
    hex: FLEET_STATUS_COLORS.en_route.hex,
  },
  busy: {
    key: 'busy',
    label: 'Busy',
    dotClass: 'w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/20',
    pillClass: 'bg-status-danger-bg text-status-danger-fg border-status-danger-border',
    sortOrder: 2,
    hex: FLEET_STATUS_COLORS.busy.hex,
  },
  break: {
    key: 'break',
    label: 'Break',
    dotClass: 'w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20',
    pillClass: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
    sortOrder: 3,
    hex: FLEET_STATUS_COLORS.break.hex,
  },
  offline: {
    key: 'offline',
    label: 'Offline',
    dotClass: 'w-2.5 h-2.5 rounded-full bg-fg-subtle ring-2 ring-border-emphasis/20',
    pillClass: 'bg-surface-muted text-fg-secondary border-border-subtle',
    sortOrder: 4,
    hex: FLEET_STATUS_COLORS.offline.hex,
  },
};

export function resolveDriverStatusVisual(driver: DriverDropdownOptionItem): DriverStatusVisualMeta {
  if (driver.isBlacklisted || driver.zone === 'Suspended') {
    return DRIVER_STATUS_VISUALS.offline;
  }
  if (driver.mapStatus && DRIVER_STATUS_VISUALS[driver.mapStatus]) {
    return DRIVER_STATUS_VISUALS[driver.mapStatus];
  }
  if (driver.dutyStatus === 'on_break' || driver.status === 'break') {
    return DRIVER_STATUS_VISUALS.break;
  }
  if (driver.dutyStatus === 'off_duty' || driver.status === 'offline') {
    return DRIVER_STATUS_VISUALS.offline;
  }
  if (driver.status === 'on_trip') {
    return DRIVER_STATUS_VISUALS.busy;
  }
  if (driver.status === 'available' || driver.dutyStatus === 'on_duty') {
    return DRIVER_STATUS_VISUALS.available;
  }
  return DRIVER_STATUS_VISUALS.offline;
}

function isPlaceholderToken(raw?: string): boolean {
  if (!raw) return true;
  const norm = raw.trim().toLowerCase().replace(/^#/, '');
  return !norm || norm === 'unassigned' || norm === 'none' || norm === 'n/a' || norm === 'tbd';
}

export function extractDriverCabAndName(driver: DriverDropdownOptionItem): {
  cabBadge: string | null;
  displayName: string;
  triggerLabel: string;
  vehicleOrZoneMeta: string | null;
} {
  let cab: string | undefined;
  if (!isPlaceholderToken(driver.cabNumber)) {
    cab = driver.cabNumber!.trim().replace(/^#/, '');
  } else if (!isPlaceholderToken(driver.assignedUnit)) {
    const m = driver.assignedUnit!.trim().match(/#?(\d+[a-zA-Z]?)/);
    cab = m ? m[1] : undefined;
  } else if (!isPlaceholderToken(driver.vehicleUnit)) {
    const m = driver.vehicleUnit!.trim().match(/#?(\d+[a-zA-Z]?)/);
    cab = m ? m[1] : undefined;
  } else if (driver.vehicle) {
    const m = driver.vehicle.match(/#(\d+[a-zA-Z]?)/);
    cab = m ? m[1] : undefined;
  }

  const cabBadge = cab && !isPlaceholderToken(cab) ? `#${cab}` : null;

  const fullFromParts = [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim();
  const displayName =
    fullFromParts ||
    (driver.name || '').trim() ||
    (driver.formattedLabel || '').replace(/^#\S+[,\s·-]*/, '').trim() ||
    driver.id;

  const shortFirstName =
    driver.firstName?.trim() || displayName.split(/\s+/)[0] || displayName;

  const triggerLabel = cabBadge ? `${cabBadge} · ${shortFirstName}` : displayName;

  const rawVeh = (driver.vehicle || driver.vehicleUnit || driver.tier || driver.vehicleTier || '')
    .replace(/^Car\s*#\d+\s*/i, '')
    .trim();
  const rawZone =
    driver.zone &&
    driver.zone !== 'Unassigned' &&
    driver.zone !== 'Active' &&
    driver.zone !== 'Suspended'
      ? driver.zone.trim()
      : '';
  const vehicleOrZoneMeta =
    [rawVeh && !isPlaceholderToken(rawVeh) ? rawVeh : '', rawZone]
      .filter(Boolean)
      .join(' · ') || null;

  return {
    cabBadge,
    displayName,
    triggerLabel,
    vehicleOrZoneMeta,
  };
}

const ASSIGNMENT_TONE_CLASSES: Record<AssignmentDropdownTone, string> = {
  staged_white: 'bg-surface-card text-fg-primary border-slate-900 font-bold hover:bg-surface-subtle',
  offered_purple: 'bg-status-staged-bg text-status-staged-fg border-purple-400 font-bold hover:bg-status-staged-bg-strong/80',
  assigned_green:
    'bg-status-success-bg text-status-success-fg border-emerald-400 font-semibold hover:bg-status-success-bg-strong/80',
  unassigned_blue: 'bg-status-info-bg/90 text-status-info-fg border-status-info-border font-bold hover:bg-status-info-bg-strong/80',
  warning_orange: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border font-bold hover:bg-status-warning-bg-strong/80',
  critical_red: 'bg-status-danger-bg text-status-danger-fg border-rose-400 font-bold hover:bg-status-danger-bg-strong/80',
};

export interface DriverAssignDropdownProps {
  value: string;
  drivers: ReadonlyArray<DriverDropdownOptionItem>;
  onChange: (driverId: string) => void;
  trip?: Partial<Trip> | null;
  slaConfig?: Partial<DispatchAutomationConfig> | null;
  mode?: 'send_to_driver' | 'stage_hold';
  isAssigned?: boolean;
  fallbackAssignedLabel?: string | null;
  stagedDriverId?: string | null;
  stagedDriverLabel?: string | null;
  onSendStaged?: () => void;
  onClearStaged?: () => void;
  isSendBusy?: boolean;
  isCascadeExhausted?: boolean;
  cascadeExhaustedTooltip?: string | null;
  unassignedValue?: string;
  unassignedLabel?: string;
  size?: 'xs' | 'sm' | 'md';
  fullWidth?: boolean;
  maxWidthClass?: string;
  disabled?: boolean;
  isDesktop?: boolean;
  title?: string;
  ariaLabel?: string;
}

export function DriverAssignDropdown({
  value,
  drivers,
  onChange,
  trip,
  slaConfig,
  mode = 'send_to_driver',
  isAssigned = false,
  fallbackAssignedLabel,
  stagedDriverId,
  stagedDriverLabel,
  onSendStaged,
  onClearStaged,
  isSendBusy = false,
  isCascadeExhausted = false,
  cascadeExhaustedTooltip,
  unassignedValue = 'unassigned',
  unassignedLabel,
  size = 'sm',
  fullWidth = false,
  maxWidthClass,
  disabled = false,
  isDesktop = true,
  title,
  ariaLabel = 'Assign driver',
}: DriverAssignDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUpward: boolean;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hasStaged = Boolean(
    !isAssigned && stagedDriverId && stagedDriverId !== unassignedValue && stagedDriverId !== 'unassigned'
  );
  const isStageMode = mode === 'stage_hold' && !isAssigned;
  const effectiveValue = isAssigned
    ? value
    : hasStaged
    ? (stagedDriverId as string)
    : isStageMode
    ? value
    : unassignedValue;
  const isSelected = Boolean(
    effectiveValue && effectiveValue !== unassignedValue && effectiveValue !== 'unassigned'
  );
  const showSplitSend = hasStaged && Boolean(onSendStaged);
  const showExhaustedAlert = !isSelected && !isStageMode && Boolean(isCascadeExhausted);

  const selectedDriver = useMemo(
    () => (isSelected ? drivers.find((d) => d.id === effectiveValue) : undefined),
    [drivers, isSelected, effectiveValue]
  );

  const selectedVisual = useMemo(
    () => (selectedDriver ? resolveDriverStatusVisual(selectedDriver) : null),
    [selectedDriver]
  );

  const selectedParsed = useMemo(
    () => (selectedDriver ? extractDriverCabAndName(selectedDriver) : null),
    [selectedDriver]
  );

  const visibleDrivers = useMemo(() => {
    const base = drivers.filter((d) => !d.isArchived || d.id === effectiveValue);
    return base
      .map((drv, idx) => ({
        drv,
        idx,
        visual: resolveDriverStatusVisual(drv),
        parsed: extractDriverCabAndName(drv),
        isDisabled: Boolean(drv.isBlacklisted || drv.zone === 'Suspended'),
      }))
      .sort((a, b) => {
        if (a.isDisabled !== b.isDisabled) return a.isDisabled ? 1 : -1;
        if (a.visual.sortOrder !== b.visual.sortOrder) {
          return a.visual.sortOrder - b.visual.sortOrder;
        }
        return a.idx - b.idx;
      });
  }, [drivers, effectiveValue]);

  const filteredDrivers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleDrivers;
    return visibleDrivers.filter(({ drv, visual, parsed }) => {
      const haystack = [
        parsed.displayName,
        parsed.cabBadge || '',
        parsed.triggerLabel,
        parsed.vehicleOrZoneMeta || '',
        drv.cabNumber || '',
        drv.vehicle || '',
        drv.zone || '',
        drv.tier || '',
        visual.label,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleDrivers, searchQuery]);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const desiredWidth = Math.max(296, Math.min(350, Math.round(rect.width)));
    const menuWidth = Math.min(desiredWidth, Math.max(240, viewportWidth - 16));
    const estimatedHeight = visibleDrivers.length > 4 ? 320 : 220;
    const menuHeight = menuRef.current?.offsetHeight || estimatedHeight;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < menuHeight + 10 && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(Math.max(8, viewportHeight - menuHeight - 8), rect.bottom + 4);

    let left = rect.left;
    if (left + menuWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - menuWidth - 8);
    }
    if (left < 8) left = 8;

    return { top, left, width: menuWidth, openUpward };
  }, [visibleDrivers.length]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    const initial = calculatePosition();
    if (initial) setCoords(initial);
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const next = calculatePosition();
      if (next) setCoords(next);
    };

    const rafId = requestAnimationFrame(() => {
      updatePosition();
      if (isDesktop && visibleDrivers.length > 4) {
        searchInputRef.current?.focus({ preventScroll: true });
      }
    });

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeDropdown();
      }
    };

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isDesktop, visibleDrivers.length, calculatePosition, closeDropdown]);

  const sizeClasses =
    size === 'xs'
      ? `py-1 px-2 text-[11px] ${showSplitSend ? 'rounded-l-lg rounded-r-none' : 'rounded-lg'} gap-1.5`
      : size === 'md'
      ? `py-1.5 px-2.5 text-xs ${showSplitSend ? 'rounded-l-lg rounded-r-none' : 'rounded-lg'} gap-2 min-h-[34px]`
      : `py-1.5 px-2.5 text-[11.5px] ${showSplitSend ? 'rounded-l-lg rounded-r-none' : 'rounded-lg'} gap-1.5`;

  const toneResolution = useMemo(
    () =>
      resolveAssignmentDropdownTone(trip, slaConfig, nowMs, {
        hasStaged,
        isStageMode,
        isAssigned,
        isCascadeExhausted,
      }),
    [trip, slaConfig, nowMs, hasStaged, isStageMode, isAssigned, isCascadeExhausted]
  );

  const stateClasses = ASSIGNMENT_TONE_CLASSES[toneResolution.tone];

  const resolvedTriggerText = isSelected
    ? selectedParsed?.triggerLabel ||
      (hasStaged && stagedDriverLabel ? stagedDriverLabel.trim() : '') ||
      (fallbackAssignedLabel && fallbackAssignedLabel.trim()) ||
      `Driver #${effectiveValue.slice(-4)}`
    : isStageMode
    ? '📌 Stage Driver...'
    : unassignedLabel || 'Unassigned';

  const resolvedTooltip =
    showExhaustedAlert && cascadeExhaustedTooltip
      ? cascadeExhaustedTooltip
      : hasStaged
      ? `Staged hold: ${resolvedTriggerText} — click to change or clear stage, or click Send`
      : title ||
        (isStageMode
          ? 'Select driver to stage (Hold in Dispatch)'
          : 'Select driver to send immediately');

  return (
    <div
      className={`relative ${fullWidth ? 'w-full flex' : 'inline-flex'} items-stretch ${maxWidthClass || ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={resolvedTooltip}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        className={`${
          fullWidth ? 'flex-1 min-w-0' : 'max-w-full min-w-0'
        } border ${showSplitSend ? 'border-r-0' : ''} inline-flex items-center justify-between transition-all cursor-pointer outline-hidden focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${stateClasses} ${
          isOpen ? 'ring-2 ring-blue-500/25' : ''
        }`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          {isSelected ? (
            <>
              {(hasStaged || isStageMode) && <span className="shrink-0">📌</span>}
              <span
                className={`shrink-0 ${
                  selectedVisual
                    ? selectedVisual.dotClass
                    : 'w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20'
                }`}
                aria-hidden="true"
              />
            </>
          ) : showExhaustedAlert ? (
            <AlertTriangleIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          ) : null}
          <span className="truncate">{resolvedTriggerText}</span>
        </span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 shrink-0 opacity-75 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {showSplitSend && (
        <button
          type="button"
          disabled={disabled || isSendBusy}
          onClick={(e) => {
            e.stopPropagation();
            onSendStaged?.();
          }}
          className={`shrink-0 rounded-r-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black transition-colors cursor-pointer inline-flex items-center justify-center border border-indigo-600 ${
            size === 'xs'
              ? 'px-2 text-[10px]'
              : size === 'md'
              ? 'px-3 text-xs'
              : 'px-2.5 text-[11px]'
          }`}
          title={`Send to Driver (${resolvedTriggerText})`}
        >
          {isSendBusy ? '...' : 'Send'}
        </button>
      )}

      {isOpen &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom left' : 'top left',
            }}
            className="bg-surface-card rounded-xl shadow-2xl border border-border-subtle/95 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100 select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Header & Instant Search (when > 4 drivers) */}
            {visibleDrivers.length > 4 && (
              <div className="p-2 bg-surface-subtle/90 border-b border-border-faint">
                <div className="relative flex items-center">
                  <SearchIcon className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search driver, cab #, vehicle, zone..."
                    className="w-full pl-8 pr-7 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-xs text-fg-strong placeholder:text-fg-subtle outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-fg-subtle hover:text-fg-secondary cursor-pointer"
                      aria-label="Clear driver search"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mode & Exhausted Context Banner */}
            {(hasStaged || isStageMode || showExhaustedAlert) && (
              <div
                className={`px-3 py-1.5 border-b text-[10.5px] font-bold flex items-center justify-between gap-2 ${
                  showExhaustedAlert
                    ? 'bg-status-danger-bg text-status-danger-fg border-status-danger-border'
                    : 'bg-status-staged-bg/80 text-status-staged-fg border-status-staged-border'
                }`}
              >
                <span className="truncate">
                  {showExhaustedAlert
                    ? cascadeExhaustedTooltip || 'Auto-Offer Cascade exhausted'
                    : hasStaged
                    ? `📌 Staged Hold: ${resolvedTriggerText}`
                    : '📌 Hold Mode: Selecting stages driver'}
                </span>
                {hasStaged && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-surface-card border border-status-staged-border text-status-staged-fg shrink-0">
                    {isStageMode ? 'Pick = Swap Hold' : 'Pick = Send Live'}
                  </span>
                )}
              </div>
            )}

            {/* Top Action Row: Staged Quick Actions or Unassigned */}
            <div className="p-1 border-b border-border-faint space-y-0.5">
              {hasStaged && onSendStaged && (
                <button
                  type="button"
                  disabled={isSendBusy}
                  onClick={() => {
                    closeDropdown();
                    onSendStaged();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold transition-colors cursor-pointer"
                >
                  <span className="truncate">Send to {resolvedTriggerText} Now</span>
                  <span className="text-[10px] uppercase tracking-wider bg-white/20 px-1.5 py-0.2 rounded shrink-0">
                    Send
                  </span>
                </button>
              )}

              {hasStaged ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    if (onClearStaged) {
                      onClearStaged();
                    } else {
                      onChange(unassignedValue);
                    }
                    closeDropdown();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-status-danger-fg hover:bg-status-danger-bg font-bold transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <XIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Clear Staged Hold (Return to Unassigned)</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  role="option"
                  aria-selected={!isSelected}
                  onClick={() => {
                    onChange(unassignedValue);
                    closeDropdown();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    !isSelected
                      ? showExhaustedAlert
                        ? 'bg-status-danger-bg text-status-danger-fg font-bold'
                        : 'bg-status-info-bg/90 text-status-info-fg font-bold'
                      : 'text-fg-secondary hover:bg-surface-subtle font-semibold'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                        showExhaustedAlert
                          ? 'border-rose-400 bg-status-danger-bg-strong'
                          : 'border-blue-400 bg-status-info-bg-strong'
                      }`}
                    />
                    <span>{unassignedLabel || 'Unassigned'}</span>
                  </span>
                  {!isSelected && (
                    <CheckIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        showExhaustedAlert ? 'text-status-danger-fg' : 'text-status-info-fg'
                      }`}
                    />
                  )}
                </button>
              )}
            </div>

            {/* Scrollable Colored-Dot Driver Roster */}
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 p-1">
              {filteredDrivers.length === 0 ? (
                <div className="py-6 px-3 text-center text-fg-subtle text-[11px] font-medium">
                  No matching drivers found.
                </div>
              ) : (
                filteredDrivers.map(({ drv, visual, parsed, isDisabled }) => {
                  const isRowSelected = isSelected && drv.id === effectiveValue;
                  return (
                    <button
                      key={drv.id}
                      type="button"
                      role="option"
                      aria-selected={isRowSelected}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        onChange(drv.id);
                        closeDropdown();
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        isDisabled
                          ? 'opacity-45 cursor-not-allowed bg-surface-subtle/50'
                          : isRowSelected
                          ? 'bg-status-info-bg/90 text-status-info-fg cursor-pointer'
                          : 'hover:bg-surface-subtle text-fg-strong cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`shrink-0 ${visual.dotClass}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-xs text-fg-primary truncate">
                              {parsed.displayName}
                            </span>
                            {parsed.cabBadge && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-muted border border-border-subtle font-mono font-bold text-[10px] text-fg-secondary shrink-0">
                                {parsed.cabBadge}
                              </span>
                            )}
                          </div>
                          {parsed.vehicleOrZoneMeta && (
                            <div className="text-[10.5px] text-fg-muted truncate">
                              {parsed.vehicleOrZoneMeta}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${
                            isDisabled
                              ? 'bg-status-danger-bg text-status-danger-fg border-status-danger-border'
                              : visual.pillClass
                          }`}
                        >
                          {isDisabled
                            ? drv.isBlacklisted
                              ? 'Blocked'
                              : 'Suspended'
                            : visual.label}
                        </span>
                        {isRowSelected && (
                          <CheckIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
