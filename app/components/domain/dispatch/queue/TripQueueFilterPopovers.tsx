import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ACTIVE_QUEUE_STATUS_KEYS,
  isUnconfirmedQuickFilterActive,
  parseStatusFilterSelection,
  serializeStatusFilterSelection,
  type CanonicalQueueStatusKey,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
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
  { key: 'declined', label: 'Declined', dotClass: 'bg-slate-400' },
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
  'bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none z-[99999]';
const PORTAL_HEADER_STRIP_CLASS =
  'px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/60 rounded-t-xl min-h-[28px]';

export function MenuCheckIndicator({ checked, indeterminate = false }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-blue-600 border-blue-600 text-white' : indeterminate ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-300'
      }`}
    >
      {checked ? <CheckIcon className="w-2.5 h-2.5 stroke-[3]" /> : indeterminate ? <span className="w-2 h-0.5 bg-blue-600 rounded-full" /> : null}
    </span>
  );
}

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
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);

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

    let left = align === 'right' ? rect.right - menuWidth : rect.left;
    if (align === 'right' && left < 8) left = Math.max(8, rect.left);
    if (left + menuWidth > vw - 8) left = Math.max(8, vw - menuWidth - 8);
    if (left < 8) left = 8;
    return { top, left, openUpward };
  }, [menuWidth, estimatedHeight, align]);

  useEffect(() => {
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
  onStatusFilterChange: (nextStatusFilter: string) => void;
}

export function TripStatusMultiSelectDropdown({
  statusFilter,
  onStatusFilterChange,
}: TripStatusMultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen, onClose: closeMenu, menuWidth: 232, estimatedHeight: 336, align: 'left',
  });

  const isUnconfirmedOnly = isUnconfirmedQuickFilterActive(statusFilter);
  const selectedSet = parseStatusFilterSelection(statusFilter);
  const lifecycleSelectedCount = isUnconfirmedOnly
    ? 0
    : STATUS_FILTER_OPTIONS.filter((o) => selectedSet.has(o.key)).length;
  const allSelected = !isUnconfirmedOnly && lifecycleSelectedCount === STATUS_FILTER_OPTIONS.length;
  const noneSelected = !isUnconfirmedOnly && lifecycleSelectedCount === 0;
  const someSelected = !isUnconfirmedOnly && lifecycleSelectedCount > 0 && !allSelected;
  const isNeutral = allSelected || isUnconfirmedOnly;

  const isActivePresetSelected =
    !isUnconfirmedOnly &&
    selectedSet.size === ACTIVE_QUEUE_STATUS_KEYS.length &&
    ACTIVE_QUEUE_STATUS_KEYS.every((k) => selectedSet.has(k));

  const buttonLabel = isNeutral
    ? 'All Status'
    : isActivePresetSelected
    ? 'Active Only'
    : noneSelected
    ? 'Status (0)'
    : lifecycleSelectedCount === 1
    ? STATUS_FILTER_OPTIONS.find((o) => selectedSet.has(o.key))?.label || 'Status (1)'
    : `Status (${lifecycleSelectedCount})`;

  const toggleStatusKey = (key: CanonicalQueueStatusKey) => {
    if (isUnconfirmedOnly) {
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
    if (isOpen) { setCoords(null); setIsOpen(false); }
    else { const initial = computeCoords(); if (initial) setCoords(initial); setIsOpen(true); }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef} type="button" onClick={handleTriggerClick}
        className={`h-7 px-2.5 border rounded-lg text-xs shadow-2xs cursor-pointer flex items-center gap-1.5 max-w-[145px] sm:max-w-[175px] transition-all ${
          isOpen ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold ring-2 ring-blue-500/20'
            : isActivePresetSelected ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700 font-semibold'
            : !isNeutral ? 'bg-blue-50 border-blue-500 text-blue-800 font-bold'
            : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700 font-semibold'
        }`}
        title="Filter trips by lifecycle status" aria-haspopup="true" aria-expanded={isOpen}
      >
        {isActivePresetSelected && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{buttonLabel}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} />
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
                className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 hover:text-blue-700 cursor-pointer"
              >
                <MenuCheckIndicator checked={allSelected} indeterminate={someSelected} />
                <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              <button
                type="button" onClick={() => onStatusFilterChange(serializeStatusFilterSelection(ACTIVE_QUEUE_STATUS_KEYS))}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-colors normal-case tracking-normal ${
                  isActivePresetSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                }`}
                title="Check only live/open statuses (hide Completed, Cancelled, Declined)"
              >
                Active Only
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {STATUS_FILTER_OPTIONS.map((opt) => {
                const checked = !isUnconfirmedOnly && selectedSet.has(opt.key);
                return (
                  <button
                    key={opt.key} type="button" onClick={() => toggleStatusKey(opt.key)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                      checked ? 'font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70' : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
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
          isOpen ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : activeFilterKeys.length > 0 ? 'border-blue-400 bg-blue-50/70 text-blue-800 hover:bg-blue-50'
            : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
        }`}
        title="Add or toggle queue filters" aria-haspopup="true" aria-expanded={isOpen}
      >
        <FunnelIcon className={`w-3.5 h-3.5 shrink-0 ${isOpen ? 'text-blue-600' : 'text-slate-500'}`} />
        <span>{compactMobile ? '+ Filter' : 'Filter'}</span>
        {activeFilterKeys.length > 0 && (
          <span className="px-1.5 py-0.1 rounded-full bg-blue-600 text-white text-[9.5px] font-black">{activeFilterKeys.length}</span>
        )}
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} />
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
                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-40 disabled:pointer-events-none cursor-pointer normal-case tracking-normal"
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
                      active ? 'font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70' : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
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
    { mode: 'table', label: 'Table', icon: <TableCellsIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" /> },
    { mode: 'cards', label: 'Cards', icon: <Squares2X2Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" /> },
    { mode: 'compact', label: 'Compact', icon: <ListBulletIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" /> },
  ];

  return (
    <div className="hidden lg:block relative shrink-0" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 border rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer h-7 ${
          isOpen
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : isAutoCardsFallback
            ? 'bg-blue-50/80 hover:bg-blue-50 border-blue-300 text-blue-800'
            : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
        }`}
        title={layoutTriggerTooltip}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {effectiveDisplayLayout === 'cards' ? (
          <Squares2X2Icon className={`w-3.5 h-3.5 ${isOpen || isAutoCardsFallback ? 'text-blue-600' : 'text-slate-600'}`} />
        ) : effectiveDisplayLayout === 'table' ? (
          <TableCellsIcon className={`w-3.5 h-3.5 ${isOpen ? 'text-blue-600' : 'text-slate-600'}`} />
        ) : (
          <ListBulletIcon className={`w-3.5 h-3.5 ${isOpen ? 'text-blue-600' : 'text-slate-600'}`} />
        )}
        <span className="hidden sm:inline">{layoutTriggerLabel}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} />
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
                      isSelected ? 'font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70' : 'font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.icon}
                      <div className="min-w-0">
                        <div className="truncate leading-tight">{item.label}</div>
                        {item.sublabel && <div className="text-[10px] font-normal text-slate-400 leading-tight">{item.sublabel}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.mode === 'auto' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-100/80 text-blue-700 text-[10px] font-bold">
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
