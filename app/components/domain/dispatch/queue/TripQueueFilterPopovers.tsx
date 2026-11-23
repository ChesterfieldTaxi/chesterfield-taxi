import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ACTIVE_QUEUE_STATUS_KEYS,
  ALL_QUEUE_STATUS_KEYS,
  parseStatusFilterSelection,
  serializeStatusFilterSelection,
  type CanonicalQueueStatusKey,
} from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import { ChevronDownIcon, FunnelIcon } from '../../../ui/Icons';
import type { QueueFilterType } from './trip-queue-layout.util';

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  key: CanonicalQueueStatusKey;
  label: string;
  dotClass: string;
}> = [
  { key: 'unconfirmed', label: 'Unconfirmed', dotClass: 'bg-amber-500' },
  { key: 'confirmed', label: 'Confirmed', dotClass: 'bg-emerald-500' },
  { key: 'pending', label: 'Pending', dotClass: 'bg-yellow-500' },
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

function usePortalDropdownPosition(params: {
  isOpen: boolean;
  onClose: () => void;
  menuWidth: number;
  estimatedHeight: number;
}) {
  const { isOpen, onClose, menuWidth, estimatedHeight } = params;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(
    null
  );

  const computeCoords = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return null;
    const rect = triggerEl.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || estimatedHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(8, rect.top - menuHeight - 6)
      : Math.min(vh - menuHeight - 8, rect.bottom + 6);

    let left = rect.left;
    if (left + menuWidth > vw - 8) {
      left = Math.max(8, vw - menuWidth - 8);
    }
    if (left < 8) left = 8;

    return { top, left, openUpward };
  }, [menuWidth, estimatedHeight]);

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    const initial = computeCoords();
    if (initial) setCoords(initial);

    const raf = requestAnimationFrame(() => {
      const next = computeCoords();
      if (next) setCoords(next);
    });

    const handleReposition = () => {
      const next = computeCoords();
      if (next) setCoords(next);
    };

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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

  return { triggerRef, menuRef, coords };
}

export interface TripStatusMultiSelectDropdownProps {
  statusFilter: string;
  unconfirmedCount: number;
  onStatusFilterChange: (nextStatusFilter: string) => void;
}

export function TripStatusMultiSelectDropdown({
  statusFilter,
  unconfirmedCount,
  onStatusFilterChange,
}: TripStatusMultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);

  const { triggerRef, menuRef, coords } = usePortalDropdownPosition({
    isOpen,
    onClose: closeMenu,
    menuWidth: 232,
    estimatedHeight: 356,
  });

  const selectedSet = parseStatusFilterSelection(statusFilter);
  const totalCount = ALL_QUEUE_STATUS_KEYS.length;
  const selectedCount = selectedSet.size;
  const allSelected = selectedCount >= totalCount;
  const noneSelected = selectedCount === 0;
  const someSelected = selectedCount > 0 && !allSelected;

  const buttonLabel = (() => {
    if (allSelected) {
      return unconfirmedCount > 0 ? `All Status (${unconfirmedCount} new)` : 'All Status';
    }
    if (noneSelected) {
      return 'Status (0)';
    }
    if (selectedCount === 1) {
      const onlyKey = Array.from(selectedSet)[0];
      const match = STATUS_FILTER_OPTIONS.find((o) => o.key === onlyKey);
      if (onlyKey === 'unconfirmed') {
        return `Unconfirmed (${unconfirmedCount})`;
      }
      return match?.label || onlyKey;
    }
    return `Status (${selectedCount})`;
  })();

  const toggleStatusKey = (key: CanonicalQueueStatusKey) => {
    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onStatusFilterChange(serializeStatusFilterSelection(next));
  };

  const handleToggleAll = () => {
    if (allSelected) {
      onStatusFilterChange('none');
    } else {
      onStatusFilterChange('all');
    }
  };

  const handleSelectActiveOnly = () => {
    onStatusFilterChange(serializeStatusFilterSelection(ACTIVE_QUEUE_STATUS_KEYS));
  };

  const isActivePresetSelected =
    selectedCount === ACTIVE_QUEUE_STATUS_KEYS.length &&
    ACTIVE_QUEUE_STATUS_KEYS.every((k) => selectedSet.has(k));

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`h-7 px-2.5 bg-white border rounded-lg text-xs font-semibold shadow-2xs cursor-pointer flex items-center gap-1.5 max-w-[145px] sm:max-w-[175px] transition-colors ${
          !allSelected
            ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold'
            : unconfirmedCount > 0
            ? 'border-amber-300 text-slate-800 hover:bg-slate-50'
            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
        title="Filter trips by one or more statuses"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDownIcon className="w-3 h-3 text-slate-400 shrink-0" />
      </button>

      {unconfirmedCount > 0 && !(selectedCount === 1 && selectedSet.has('unconfirmed')) && (
        <span
          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-pulse pointer-events-none"
          title={`${unconfirmedCount} unconfirmed booking(s)`}
        />
      )}

      {isOpen &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: '232px',
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom left' : 'top left',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden text-xs select-none animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header: Select/Deselect All + Active Only Quick Chip */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-extrabold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={handleToggleAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
              </label>

              <button
                type="button"
                onClick={handleSelectActiveOnly}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition-colors ${
                  isActivePresetSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                }`}
                title="Check only live/open statuses (hide Completed, Cancelled, Declined)"
              >
                Active Only
              </button>
            </div>

            {/* Individual Status Checkboxes */}
            <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-50">
              {STATUS_FILTER_OPTIONS.map((opt) => {
                const checked = selectedSet.has(opt.key);
                return (
                  <label
                    key={opt.key}
                    className={`px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      checked
                        ? 'bg-blue-50/40 text-slate-900 font-bold hover:bg-blue-50/80'
                        : 'text-slate-600 font-medium hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatusKey(opt.key)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                      />
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {opt.key === 'unconfirmed' && unconfirmedCount > 0 && (
                      <span className="px-1.5 py-0.1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-black shrink-0">
                        {unconfirmedCount}
                      </span>
                    )}
                  </label>
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

  const { triggerRef, menuRef, coords } = usePortalDropdownPosition({
    isOpen,
    onClose: closeMenu,
    menuWidth: 204,
    estimatedHeight: 290,
  });

  const toggleFilterKey = (key: QueueFilterType) => {
    if (activeFilterKeys.includes(key)) {
      onActiveFilterKeysChange(activeFilterKeys.filter((k) => k !== key));
    } else {
      onActiveFilterKeysChange([...activeFilterKeys, key]);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-1 bg-white hover:bg-slate-50 border rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer ${
          compactMobile ? 'px-2.5 py-0.5 h-6' : 'px-2.5 py-1 h-7'
        } ${
          activeFilterKeys.length > 0
            ? 'border-blue-400 bg-blue-50/70 text-blue-800'
            : 'border-slate-300 text-slate-700'
        }`}
        title="Add or toggle queue filters"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <FunnelIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>{compactMobile ? '+ Filter' : 'Filter'}</span>
        {activeFilterKeys.length > 0 && (
          <span className="px-1.5 py-0.1 rounded-full bg-blue-600 text-white text-[9.5px] font-black">
            {activeFilterKeys.length}
          </span>
        )}
        <ChevronDownIcon className="w-3 h-3 text-slate-400 shrink-0" />
      </button>

      {isOpen &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: '204px',
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom left' : 'top left',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden text-xs select-none animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                Queue Filters
              </span>
              {activeFilterKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => onActiveFilterKeysChange([])}
                  className="text-[10.5px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="py-1">
              {QUEUE_FILTER_MENU_ITEMS.map((item) => {
                const active = activeFilterKeys.includes(item.key);
                return (
                  <label
                    key={item.key}
                    className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors ${
                      active
                        ? 'bg-blue-50/50 text-blue-800 font-bold hover:bg-blue-50'
                        : 'text-slate-700 font-semibold hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleFilterKey(item.key)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
