import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ACTIVE_QUEUE_STATUS_KEYS,
  DEFAULT_ACTIVE_ONLY_STATUS_FILTER,
  computeNextStatusFilterOnUnconfirmedToggle,
  isUnconfirmedQuickFilterActive,
  parseStatusFilterSelection,
  serializeStatusFilterSelection,
  type CanonicalQueueStatusKey,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  TableCellsIcon,
} from '../../../ui/Icons';
import { TABLE_OVERFLOW_MIN_WIDTH_PX, type QueueFilterType } from './trip-queue-layout.util';

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  key: CanonicalQueueStatusKey;
  label: string;
  dotClass: string;
}> = [
  { key: 'late', label: 'Late', dotClass: 'bg-rose-600' },
  { key: 'confirmed', label: 'Confirmed', dotClass: 'bg-emerald-500' },
  { key: 'offered', label: 'Offered', dotClass: 'bg-sky-500' },
  { key: 'assigned', label: 'Assigned', dotClass: 'bg-blue-600' },
  { key: 'accepted', label: 'Accepted', dotClass: 'bg-purple-500' },
  { key: 'en_route', label: 'En Route', dotClass: 'bg-indigo-500' },
  { key: 'arrived', label: 'Arrived', dotClass: 'bg-orange-500' },
  { key: 'in_progress', label: 'In Progress', dotClass: 'bg-teal-500' },
  { key: 'completed', label: 'Completed', dotClass: 'bg-emerald-700' },
  { key: 'cancelled', label: 'Cancelled', dotClass: 'bg-rose-500' },
  { key: 'declined', label: 'Declined', dotClass: 'bg-fg-subtle' },
];

export const QUEUE_FILTER_MENU_ITEMS: ReadonlyArray<{ key: QueueFilterType; label: string }> = [
  { key: 'driver', label: 'Driver' },
  { key: 'has_staged_driver', label: 'Staged Only' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'company', label: 'Company' },
  { key: 'payment_type', label: 'Payment Type' },
  { key: 'tariff', label: 'Tariff' },
  { key: 'has_car_seat', label: 'Has Car Seat' },
  { key: 'has_stops', label: 'Has Stops' },
];

const PORTAL_MENU_SHELL_CLASS =
  'bg-surface-card rounded-xl shadow-xl border border-border-subtle/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-border-faint select-none z-[99999]';
const PORTAL_HEADER_STRIP_CLASS =
  'px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/60 rounded-t-xl min-h-[28px]';

export function MenuCheckIndicator({ checked, indeterminate = false }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-blue-600 border-blue-600 text-white' : indeterminate ? 'bg-status-info-bg border-blue-500 text-blue-600' : 'bg-surface-card border-border-strong'
      }`}
    >
      {checked ? <CheckIcon className="w-2.5 h-2.5 stroke-[3]" /> : indeterminate ? <span className="w-2 h-0.5 bg-blue-600 rounded-full" /> : null}
    </span>
  );
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export function usePortalDropdownPosition(params: {
  isOpen: boolean;
  onClose: () => void;
  menuWidth: number;
  estimatedHeight: number;
  align?: 'left' | 'right';
}) {
  const { isOpen, onClose, menuWidth, estimatedHeight, align = 'left' } = params;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; bottom: number; left: number; openUpward: boolean } | null>(null);

  const computeCoords = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return null;
    const rect = triggerEl.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || estimatedHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const openUpward = spaceBelow < menuHeight + 10 && rect.top > spaceBelow;
    const top = openUpward ? Math.max(8, rect.top - menuHeight - 4) : Math.min(vh - menuHeight - 8, rect.bottom + 4);
    const bottom = Math.max(8, vh - rect.top + 4);

    let left = align === 'right' ? rect.right - menuWidth : rect.left;
    if (align === 'right' && left < 8) left = Math.max(8, rect.left);
    if (left + menuWidth > vw - 8) left = Math.max(8, vw - menuWidth - 8);
    if (left < 8) left = 8;
    return { top, bottom, left, openUpward };
  }, [menuWidth, estimatedHeight, align]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) { setCoords(null); return; }
    const initial = computeCoords();
    if (initial) setCoords(initial);
    const raf = requestAnimationFrame(() => {
      const next = computeCoords();
      if (next) setCoords(next);
    });
    const handleReposition = (e?: Event) => {
      if (e?.type === 'scroll' && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      const next = computeCoords();
      if (next) setCoords(next);
    };
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current && !triggerRef.current.contains(target) && menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };

    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, computeCoords]);

  return { triggerRef, menuRef, coords, setCoords, computeCoords };
}

export interface TripStatusMultiSelectDropdownProps {
  statusFilter: string;
  unconfirmedCount?: number;
  showTriggerUnconfirmedBadge?: boolean;
  showUnconfirmedOption?: boolean;
  isExternalUnconfirmedActive?: boolean;
  onToggleUnconfirmedQuickFilter?: () => void;
  onStatusFilterChange: (nextStatusFilter: string) => void;
}

export function TripStatusMultiSelectDropdown({
  statusFilter,
  unconfirmedCount = 0,
  showTriggerUnconfirmedBadge = true,
  showUnconfirmedOption = true,
  isExternalUnconfirmedActive = false,
  onToggleUnconfirmedQuickFilter,
  onStatusFilterChange,
}: TripStatusMultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen, onClose: closeMenu, menuWidth: 232, estimatedHeight: 372, align: 'left',
  });

  const prevNonUnconfirmedStatusRef = useRef<string>(DEFAULT_ACTIVE_ONLY_STATUS_FILTER);
  const isLegacyUnconfirmedOnly = isUnconfirmedQuickFilterActive(statusFilter);
  const isUnconfirmedRowActive = isExternalUnconfirmedActive || isLegacyUnconfirmedOnly;
  useEffect(() => {
    if (!isLegacyUnconfirmedOnly && statusFilter) {
      prevNonUnconfirmedStatusRef.current = statusFilter;
    }
  }, [isLegacyUnconfirmedOnly, statusFilter]);

  const handleToggleUnconfirmedQuickFilter = () => {
    if (onToggleUnconfirmedQuickFilter) {
      onToggleUnconfirmedQuickFilter();
      return;
    }
    const { nextStatusFilter, savedPreviousFilter } = computeNextStatusFilterOnUnconfirmedToggle(
      statusFilter,
      prevNonUnconfirmedStatusRef.current
    );
    prevNonUnconfirmedStatusRef.current = savedPreviousFilter;
    onStatusFilterChange(nextStatusFilter);
  };

  const selectedSet = parseStatusFilterSelection(statusFilter);
  const lifecycleSelectedCount = isLegacyUnconfirmedOnly
    ? 0
    : STATUS_FILTER_OPTIONS.filter((o) => selectedSet.has(o.key)).length;
  const allSelected = !isLegacyUnconfirmedOnly && lifecycleSelectedCount === STATUS_FILTER_OPTIONS.length;
  const noneSelected = !isLegacyUnconfirmedOnly && lifecycleSelectedCount === 0;
  const someSelected = !isLegacyUnconfirmedOnly && lifecycleSelectedCount > 0 && !allSelected;
  const isNeutral = allSelected;

  const isActivePresetSelected =
    !isLegacyUnconfirmedOnly &&
    selectedSet.size === ACTIVE_QUEUE_STATUS_KEYS.length &&
    ACTIVE_QUEUE_STATUS_KEYS.every((k) => selectedSet.has(k));

  const buttonLabel = isLegacyUnconfirmedOnly
    ? 'Unconfirmed'
    : isNeutral
    ? 'All Status'
    : isActivePresetSelected
    ? 'Active Only'
    : noneSelected
    ? 'Status (0)'
    : lifecycleSelectedCount === 1
    ? STATUS_FILTER_OPTIONS.find((o) => selectedSet.has(o.key))?.label || 'Status (1)'
    : `Status (${lifecycleSelectedCount})`;

  const toggleStatusKey = (key: CanonicalQueueStatusKey) => {
    if (isLegacyUnconfirmedOnly) {
      onStatusFilterChange(serializeStatusFilterSelection([key]));
      return;
    }
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const nextLifecycleCount = STATUS_FILTER_OPTIONS.filter((o) => next.has(o.key)).length;
    if (nextLifecycleCount === STATUS_FILTER_OPTIONS.length) onStatusFilterChange('all');
    else if (nextLifecycleCount === 0) onStatusFilterChange('none');
    else onStatusFilterChange(serializeStatusFilterSelection(next));
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setCoords(null);
      setIsOpen(false);
    } else {
      if (isExternalUnconfirmedActive && !showUnconfirmedOption && onToggleUnconfirmedQuickFilter) {
        onToggleUnconfirmedQuickFilter();
      }
      const initial = computeCoords();
      if (initial) setCoords(initial);
      setIsOpen(true);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef} type="button" onClick={handleTriggerClick}
        className={`h-7 px-2 sm:px-2.5 border rounded-lg text-xs shadow-2xs cursor-pointer flex items-center gap-1.5 max-w-[155px] sm:max-w-[185px] transition-all ${
          isOpen ? 'bg-status-info-bg border-blue-400 text-status-info-fg font-bold ring-2 ring-blue-500/20'
            : isExternalUnconfirmedActive ? 'bg-surface-muted/80 hover:bg-surface-muted border-border-subtle text-fg-subtle hover:text-fg-secondary font-medium opacity-75'
            : isLegacyUnconfirmedOnly ? 'bg-status-danger-bg border-rose-400 text-status-danger-fg font-bold'
            : isActivePresetSelected ? 'bg-surface-card hover:bg-surface-subtle border-border-strong text-fg-secondary font-semibold'
            : !isNeutral ? 'bg-status-info-bg border-blue-500 text-status-info-fg font-bold'
            : 'bg-surface-card hover:bg-surface-subtle border-border-strong text-fg-secondary font-semibold'
        }`}
        title={
          isExternalUnconfirmedActive
            ? `Unconfirmed quick-filter is active (saved status filter: ${buttonLabel}) — select a status to switch`
            : unconfirmedCount > 0
            ? `Filter trips by lifecycle status (${unconfirmedCount} unconfirmed awaiting review)`
            : 'Filter trips by lifecycle status'
        }
        aria-haspopup="true" aria-expanded={isOpen}
      >
        {isActivePresetSelected && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isExternalUnconfirmedActive ? 'bg-surface-strong' : 'bg-emerald-500'
            }`}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{buttonLabel}</span>
        {showTriggerUnconfirmedBadge && unconfirmedCount > 0 && (
          <span
            className="min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9.5px] font-black tabular-nums inline-flex items-center justify-center leading-none shrink-0"
            aria-label={`${unconfirmedCount} unconfirmed`}
          >
            {unconfirmedCount}
          </span>
        )}
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-fg-subtle'}`} />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef} data-ui-select-portal="true"
            style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`, width: '232px', zIndex: 99999, transformOrigin: coords.openUpward ? 'bottom left' : 'top left' }}
            onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            className={PORTAL_MENU_SHELL_CLASS}
          >
            <div className={PORTAL_HEADER_STRIP_CLASS}>
              <button
                type="button" onClick={() => onStatusFilterChange(allSelected ? 'none' : 'all')}
                className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-fg-secondary hover:text-status-info-fg cursor-pointer"
              >
                <MenuCheckIndicator checked={allSelected} indeterminate={someSelected} />
                <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <button
                type="button" onClick={() => onStatusFilterChange(serializeStatusFilterSelection(ACTIVE_QUEUE_STATUS_KEYS))}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-colors normal-case tracking-normal ${
                  isActivePresetSelected && !isExternalUnconfirmedActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface-card hover:bg-status-info-bg text-status-info-fg border-status-info-border'
                }`}
                title="Check only live/open statuses (hide Completed, Cancelled, Declined)"
              >
                Active Only
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              {showUnconfirmedOption && (
                <button
                  type="button"
                  onClick={handleToggleUnconfirmedQuickFilter}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer border-b border-border-faint mb-0.5 ${
                    isUnconfirmedRowActive
                      ? 'font-bold text-status-danger-fg bg-status-danger-bg/90 hover:bg-status-danger-bg-strong/70'
                      : 'font-semibold text-fg-secondary hover:bg-status-danger-bg/60 hover:text-status-danger-fg'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <MenuCheckIndicator checked={isUnconfirmedRowActive} />
                    <span className="w-2 h-2 rounded-full shrink-0 bg-rose-600" />
                    <span className="truncate">Unconfirmed</span>
                  </span>
                  {unconfirmedCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black tabular-nums inline-flex items-center justify-center leading-none shrink-0">
                      {unconfirmedCount}
                    </span>
                  )}
                </button>
              )}

              {STATUS_FILTER_OPTIONS.map((opt) => {
                const checked = !isLegacyUnconfirmedOnly && selectedSet.has(opt.key);
                return (
                  <button
                    key={opt.key} type="button" onClick={() => toggleStatusKey(opt.key)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                      checked ? 'font-bold text-status-info-fg bg-status-info-bg/80 hover:bg-status-info-bg-strong/70' : 'font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MenuCheckIndicator checked={checked} />
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                      <span className="truncate">{opt.label}</span>
                    </span>
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

export interface TripAddFilterDropdownProps {
  activeFilterKeys: QueueFilterType[];
  onActiveFilterKeysChange: (keys: QueueFilterType[]) => void;
  compactMobile?: boolean;
}

export function TripAddFilterDropdown({
  activeFilterKeys,
  onActiveFilterKeysChange,
  compactMobile = false,
}: TripAddFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen, onClose: closeMenu, menuWidth: 204, estimatedHeight: 280, align: 'left',
  });

  const toggleFilterKey = (key: QueueFilterType) => {
    onActiveFilterKeysChange(
      activeFilterKeys.includes(key) ? activeFilterKeys.filter((k) => k !== key) : [...activeFilterKeys, key]
    );
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) { setCoords(null); setIsOpen(false); }
    else { const initial = computeCoords(); if (initial) setCoords(initial); setIsOpen(true); }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef} type="button" onClick={handleTriggerClick}
        className={`flex items-center gap-1 border rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer ${
          compactMobile ? 'px-2.5 py-0.5 h-6' : 'px-2.5 py-1 h-7'
        } ${
          isOpen ? 'bg-status-info-bg border-blue-400 text-status-info-fg ring-2 ring-blue-500/20'
            : activeFilterKeys.length > 0 ? 'border-blue-400 bg-status-info-bg/70 text-status-info-fg hover:bg-status-info-bg'
            : 'bg-surface-card hover:bg-surface-subtle border-border-strong text-fg-secondary'
        }`}
        title="Add or toggle queue filters" aria-haspopup="true" aria-expanded={isOpen}
      >
        <FunnelIcon className={`w-3.5 h-3.5 shrink-0 ${isOpen ? 'text-blue-600' : 'text-fg-muted'}`} />
        <span>{compactMobile ? '+ Filter' : 'Filter'}</span>
        {activeFilterKeys.length > 0 && (
          <span className="px-1.5 py-0.1 rounded-full bg-blue-600 text-white text-[9.5px] font-black">{activeFilterKeys.length}</span>
        )}
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-fg-subtle'}`} />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef} data-ui-select-portal="true"
            style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`, width: '204px', zIndex: 99999, transformOrigin: coords.openUpward ? 'bottom left' : 'top left' }}
            onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
            className={PORTAL_MENU_SHELL_CLASS}
          >
            <div className={PORTAL_HEADER_STRIP_CLASS}>
              <span>Queue Filters</span>
              <button
                type="button" disabled={activeFilterKeys.length === 0} onClick={() => onActiveFilterKeysChange([])}
                className="text-[10px] font-bold text-rose-600 hover:text-status-danger-fg disabled:opacity-40 disabled:pointer-events-none cursor-pointer normal-case tracking-normal"
              >
                Clear
              </button>
            </div>

            <div className="py-1">
              {QUEUE_FILTER_MENU_ITEMS.map((item) => {
                const active = activeFilterKeys.includes(item.key);
                return (
                  <button
                    key={item.key} type="button" onClick={() => toggleFilterKey(item.key)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                      active ? 'font-bold text-status-info-fg bg-status-info-bg/80 hover:bg-status-info-bg-strong/70' : 'font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MenuCheckIndicator checked={active} />
                      <span className="truncate">{item.label}</span>
                    </span>
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

export interface TripQueueLayoutDropdownProps {
  displayLayout: DisplayLayout;
  effectiveDisplayLayout: DisplayLayout;
  isAutoCardsFallback: boolean;
  effectiveMinTableWidthPx?: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDisplayLayoutChange: (layout: DisplayLayout) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function TripQueueLayoutDropdown({
  displayLayout,
  effectiveDisplayLayout,
  isAutoCardsFallback,
  effectiveMinTableWidthPx = TABLE_OVERFLOW_MIN_WIDTH_PX,
  isOpen,
  onOpenChange,
  onDisplayLayoutChange,
  containerRef,
}: TripQueueLayoutDropdownProps) {
  const closeMenu = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen, onClose: closeMenu, menuWidth: 212, estimatedHeight: 192, align: 'right',
  });

  const layoutTriggerLabel =
    displayLayout === 'auto'
      ? isAutoCardsFallback ? 'Cards (Auto)' : 'Table (Auto)'
      : effectiveDisplayLayout === 'cards' ? 'Cards'
      : effectiveDisplayLayout === 'table' ? 'Table'
      : 'Compact';

  const layoutTriggerTooltip =
    displayLayout === 'auto'
      ? isAutoCardsFallback
        ? `Auto Layout: switched to Cards because Trips table would overflow horizontally (${effectiveMinTableWidthPx}px needed). Select "Table" to force 10-column table.`
        : 'Auto Layout (Table ↔ Cards): showing Table while wide enough.'
      : `Queue Layout: ${layoutTriggerLabel}. Click to change.`;

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) { setCoords(null); onOpenChange(false); }
    else {
      const initial = computeCoords();
      if (initial) setCoords(initial);
      onOpenChange(true);
    }
  };

  const selectMode = (mode: DisplayLayout) => {
    onDisplayLayoutChange(mode);
    setCoords(null);
    onOpenChange(false);
  };

  const items: ReadonlyArray<{ mode: DisplayLayout; label: string; sublabel?: string; icon: React.ReactNode }> = [
    { mode: 'auto', label: 'Auto', sublabel: 'Table ↔ Cards', icon: <BoltIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" /> },
    { mode: 'table', label: 'Table', icon: <TableCellsIcon className="w-3.5 h-3.5 text-fg-muted shrink-0" /> },
    { mode: 'cards', label: 'Cards', icon: <Squares2X2Icon className="w-3.5 h-3.5 text-fg-muted shrink-0" /> },
    { mode: 'compact', label: 'Compact', icon: <ListBulletIcon className="w-3.5 h-3.5 text-fg-muted shrink-0" /> },
  ];

  return (
    <div className="hidden lg:block relative shrink-0" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 border rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer h-7 ${
          isOpen
            ? 'bg-status-info-bg border-blue-400 text-status-info-fg ring-2 ring-blue-500/20'
            : isAutoCardsFallback
            ? 'bg-status-info-bg/80 hover:bg-status-info-bg border-status-info-border text-status-info-fg'
            : 'bg-surface-card hover:bg-surface-subtle border-border-strong text-fg-secondary'
        }`}
        title={layoutTriggerTooltip}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {effectiveDisplayLayout === 'cards' ? (
          <Squares2X2Icon className={`w-3.5 h-3.5 ${isOpen || isAutoCardsFallback ? 'text-blue-600' : 'text-fg-secondary'}`} />
        ) : effectiveDisplayLayout === 'table' ? (
          <TableCellsIcon className={`w-3.5 h-3.5 ${isOpen ? 'text-blue-600' : 'text-fg-secondary'}`} />
        ) : (
          <ListBulletIcon className={`w-3.5 h-3.5 ${isOpen ? 'text-blue-600' : 'text-fg-secondary'}`} />
        )}
        <span className="hidden sm:inline">{layoutTriggerLabel}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-fg-subtle'}`} />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            data-ui-select-portal="true"
            role="listbox"
            aria-label="Queue Layout"
            style={{
              position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`,
              width: '212px', zIndex: 99999, transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={PORTAL_MENU_SHELL_CLASS}
          >
            <div className={PORTAL_HEADER_STRIP_CLASS}>
              <span>Queue Layout</span>
            </div>

            <div className="py-1">
              {items.map((item) => {
                const isSelected = displayLayout === item.mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectMode(item.mode)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                      isSelected ? 'font-bold text-status-info-fg bg-status-info-bg/80 hover:bg-status-info-bg-strong/70' : 'font-semibold text-fg-secondary hover:bg-status-info-bg/80 hover:text-status-info-fg'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.icon}
                      <div className="min-w-0">
                        <div className="truncate leading-tight">{item.label}</div>
                        {item.sublabel && <div className="text-[10px] font-normal text-fg-subtle leading-tight">{item.sublabel}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.mode === 'auto' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-status-info-bg-strong/80 text-status-info-fg text-[10px] font-bold">
                          {isAutoCardsFallback ? 'Cards' : 'Table'}
                        </span>
                      )}
                      {isSelected && <CheckIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </div>
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

export interface TripQueueAssignmentDropdownProps {
  effectiveDisplayLayout: DisplayLayout;
  stagedPlanner?: DispatchStagedPlannerController;
  readyAutoDispatchCount?: number;
  isRunningAutoDispatchSweep?: boolean;
  onRunAutoDispatchSweep?: () => void | Promise<void>;
  isManualOrPaused?: boolean;
  effectiveSweepMode?: string;
  scheduledDispatchLeadMinutes?: number;
}

/**
 * Compact `Assign: Send/Hold ▾` trigger + portal popover consolidating
 * Queue Assign Mode (`Send | 📌 Hold`), `📌 Auto-Stage Open (N)`, and `⚡ Auto-Dispatch Ready (N)`.
 */
export function TripQueueAssignmentDropdown({
  effectiveDisplayLayout,
  stagedPlanner,
  readyAutoDispatchCount = 0,
  isRunningAutoDispatchSweep = false,
  onRunAutoDispatchSweep,
  isManualOrPaused = false,
  effectiveSweepMode = 'manual_1tap',
  scheduledDispatchLeadMinutes = 45,
}: TripQueueAssignmentDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen,
    onClose: closeMenu,
    menuWidth: 252,
    estimatedHeight: 172,
    align: 'right',
  });

  const openStagedCount = stagedPlanner?.openScheduledUnstagedCount ?? 0;
  const hasAutoStageReady = Boolean(stagedPlanner && openStagedCount > 0);
  const hasAutoDispatchReady = Boolean(readyAutoDispatchCount > 0 && onRunAutoDispatchSweep);
  const hasAssignModeToggle = Boolean(stagedPlanner && effectiveDisplayLayout !== 'table');
  const totalActionCount = (hasAutoStageReady ? openStagedCount : 0) + (hasAutoDispatchReady ? readyAutoDispatchCount : 0);

  if (!hasAssignModeToggle && !hasAutoStageReady && !hasAutoDispatchReady) {
    return null;
  }

  const isHoldMode = stagedPlanner?.queueAssignMode === 'stage_hold';
  const triggerLabel = hasAssignModeToggle
    ? isHoldMode
      ? 'Assign: Hold'
      : 'Assign: Send'
    : 'Assign';

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setCoords(null);
      setIsOpen(false);
    } else {
      const initial = computeCoords();
      if (initial) setCoords(initial);
      setIsOpen(true);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={`h-7 px-2 sm:px-2.5 border rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
          isOpen
            ? 'bg-status-staged-bg border-indigo-400 text-status-staged-fg ring-2 ring-indigo-500/20'
            : isHoldMode || totalActionCount > 0
            ? 'bg-status-staged-bg/80 hover:bg-status-staged-bg-strong/70 border-status-staged-border text-status-staged-fg'
            : 'bg-surface-card hover:bg-surface-subtle border-border-strong text-fg-secondary'
        }`}
        title="Assignment mode, auto-staging & auto-dispatch sweep"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="truncate">{triggerLabel}</span>
        {totalActionCount > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9.5px] font-black tabular-nums inline-flex items-center justify-center leading-none shrink-0">
            {totalActionCount}
          </span>
        )}
        <ChevronDownIcon
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-indigo-600' : 'text-fg-subtle'
          }`}
        />
      </button>

      {isOpen &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            data-ui-select-portal="true"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: '252px',
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={PORTAL_MENU_SHELL_CLASS}
          >
            <div className={PORTAL_HEADER_STRIP_CLASS}>
              <span>Assignment &amp; Dispatch</span>
            </div>

            <div className="p-2 space-y-2">
              {hasAssignModeToggle && stagedPlanner && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-fg-secondary">Queue Mode</span>
                  <div className="inline-flex items-center rounded-lg border border-border-strong bg-surface-card p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => stagedPlanner.setQueueAssignMode('send_to_driver')}
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold cursor-pointer transition-colors ${
                        stagedPlanner.queueAssignMode === 'send_to_driver'
                          ? 'bg-surface-header text-white'
                          : 'text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => stagedPlanner.setQueueAssignMode('stage_hold')}
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold cursor-pointer transition-colors ${
                        stagedPlanner.queueAssignMode === 'stage_hold'
                          ? 'bg-indigo-600 text-white'
                          : 'text-fg-secondary hover:text-status-staged-fg'
                      }`}
                    >
                      📌 Hold
                    </button>
                  </div>
                </div>
              )}

              {hasAutoStageReady && stagedPlanner && (
                <button
                  type="button"
                  disabled={stagedPlanner.isAutoStaging}
                  onClick={() => {
                    closeMenu();
                    stagedPlanner.openAutoStagePreview();
                  }}
                  className="w-full h-7 px-2.5 rounded-lg border border-dashed border-indigo-400 bg-status-staged-bg/90 hover:bg-status-staged-bg-strong text-status-staged-fg text-[11px] font-extrabold tracking-tight flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {stagedPlanner.isAutoStaging
                    ? '📌 Staging...'
                    : `📌 Auto-Stage Open (${openStagedCount})`}
                </button>
              )}

              {hasAutoDispatchReady && onRunAutoDispatchSweep && (
                <button
                  type="button"
                  disabled={isRunningAutoDispatchSweep}
                  onClick={() => {
                    closeMenu();
                    void onRunAutoDispatchSweep();
                  }}
                  className={`w-full h-7 px-2.5 rounded-lg border text-[11px] font-extrabold tracking-tight flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50 ${
                    isManualOrPaused
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
                      : 'bg-status-staged-bg hover:bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border'
                  }`}
                  title={`Run ${effectiveSweepMode.replace(/_/g, ' ')} for ${readyAutoDispatchCount} open trip(s) inside the ${scheduledDispatchLeadMinutes}m Pre-Pickup Lead Window`}
                >
                  {isRunningAutoDispatchSweep
                    ? '⚡ Dispatching...'
                    : `⚡ Auto-Dispatch Ready (${readyAutoDispatchCount})`}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
