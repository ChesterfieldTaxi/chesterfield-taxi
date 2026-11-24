import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, SlidersIcon } from '../../../ui/Icons';
import {
  MenuCheckIndicator,
  usePortalDropdownPosition,
} from './TripQueueFilterPopovers';
import {
  DEFAULT_QUEUE_COLUMNS,
  DISPATCH_QUEUE_COLUMNS_STORAGE_KEY,
  DISPATCH_QUEUE_COLUMNS_SYNC_EVENT,
  TRIP_QUEUE_COLUMN_DEFINITIONS,
  TRIP_QUEUE_COLUMN_PRESETS,
  areQueueColumnsEqual,
  computeQueueTableMinWidthPx,
  normalizeQueueColumns,
  parseStoredQueueColumns,
  resolveActiveQueueColumnPreset,
  serializeQueueColumns,
  toggleQueueColumnSelection,
  type TripQueueColumnKey,
} from './trip-queue-columns.util';

const PORTAL_SHELL_CLASS =
  'bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none z-[99999]';
const PORTAL_HEADER_CLASS =
  'px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/60 rounded-t-xl min-h-[28px]';

export interface UseQueueTableColumnsResult {
  visibleColumns: TripQueueColumnKey[];
  tableMinWidthPx: number;
  setVisibleColumns: (next: readonly TripQueueColumnKey[]) => void;
  toggleColumn: (key: TripQueueColumnKey) => void;
  resetColumns: () => void;
}

export function useQueueTableColumns(): UseQueueTableColumnsResult {
  const [visibleColumns, setVisibleColumnsState] = useState<TripQueueColumnKey[]>(() => [
    ...DEFAULT_QUEUE_COLUMNS,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromStorage = () => {
      try {
        const stored = localStorage.getItem(DISPATCH_QUEUE_COLUMNS_STORAGE_KEY);
        const parsed = parseStoredQueueColumns(stored);
        setVisibleColumnsState((prev) => (areQueueColumnsEqual(prev, parsed) ? prev : parsed));
      } catch {}
    };

    syncFromStorage();
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === DISPATCH_QUEUE_COLUMNS_STORAGE_KEY) {
        syncFromStorage();
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(DISPATCH_QUEUE_COLUMNS_SYNC_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(DISPATCH_QUEUE_COLUMNS_SYNC_EVENT, syncFromStorage);
    };
  }, []);

  const commitColumns = useCallback((nextRaw: readonly TripQueueColumnKey[]) => {
    const normalized = normalizeQueueColumns(nextRaw);
    setVisibleColumnsState(normalized);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          DISPATCH_QUEUE_COLUMNS_STORAGE_KEY,
          serializeQueueColumns(normalized)
        );
        window.dispatchEvent(new CustomEvent(DISPATCH_QUEUE_COLUMNS_SYNC_EVENT));
      } catch {}
    }
  }, []);

  const toggleColumn = useCallback(
    (key: TripQueueColumnKey) => {
      const next = toggleQueueColumnSelection(visibleColumns, key);
      commitColumns(next);
    },
    [visibleColumns, commitColumns]
  );

  const resetColumns = useCallback(() => {
    commitColumns(DEFAULT_QUEUE_COLUMNS);
  }, [commitColumns]);

  const tableMinWidthPx = useMemo(
    () => computeQueueTableMinWidthPx(visibleColumns),
    [visibleColumns]
  );

  return {
    visibleColumns,
    tableMinWidthPx,
    setVisibleColumns: commitColumns,
    toggleColumn,
    resetColumns,
  };
}

export interface TripQueueColumnsDropdownProps {
  visibleColumns?: readonly TripQueueColumnKey[];
  onVisibleColumnsChange?: (next: readonly TripQueueColumnKey[]) => void;
}

export function TripQueueColumnsDropdown({
  visibleColumns: externalColumns,
  onVisibleColumnsChange,
}: TripQueueColumnsDropdownProps) {
  const internal = useQueueTableColumns();
  const activeColumns = externalColumns ?? internal.visibleColumns;
  const updateColumns = onVisibleColumnsChange ?? internal.setVisibleColumns;

  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen,
    onClose: closeMenu,
    menuWidth: 248,
    estimatedHeight: 382,
    align: 'right',
  });

  const isDefaultSelected = areQueueColumnsEqual(activeColumns, DEFAULT_QUEUE_COLUMNS);
  const activePresetKey = resolveActiveQueueColumnPreset(activeColumns);
  const nonActionSelectedCount = activeColumns.filter((k) => k !== 'action').length;

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
    <div className="hidden lg:block relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 border rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer h-7 ${
          isOpen
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-500/20'
            : !isDefaultSelected
            ? 'bg-blue-50/80 hover:bg-blue-50 border-blue-400 text-blue-800'
            : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
        }`}
        title="Customize visible table columns and column presets"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <SlidersIcon className={`w-3.5 h-3.5 shrink-0 ${isOpen || !isDefaultSelected ? 'text-blue-600' : 'text-slate-500'}`} />
        <span className="hidden sm:inline">Columns</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            data-ui-select-portal="true"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: '248px',
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={PORTAL_SHELL_CLASS}
          >
            <div className={PORTAL_HEADER_CLASS}>
              <span>TABLE COLUMNS</span>
              <button
                type="button"
                disabled={isDefaultSelected}
                onClick={() => updateColumns(DEFAULT_QUEUE_COLUMNS)}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:pointer-events-none cursor-pointer normal-case tracking-normal"
              >
                Reset
              </button>
            </div>

            <div className="px-2.5 py-1.5 flex items-center gap-1 bg-slate-50/30">
              {TRIP_QUEUE_COLUMN_PRESETS.map((preset) => {
                const isPresetActive = activePresetKey === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => updateColumns(preset.columns)}
                    className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-extrabold border transition-colors cursor-pointer truncate text-center ${
                      isPresetActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="py-1 max-h-72 overflow-y-auto">
              {TRIP_QUEUE_COLUMN_DEFINITIONS.map((col) => {
                const checked = activeColumns.includes(col.key);
                const isLastDataCol = checked && !col.isPinned && nonActionSelectedCount <= 1;
                const isLocked = col.isPinned || isLastDataCol;
                return (
                  <button
                    key={col.key}
                    type="button"
                    disabled={isLocked}
                    onClick={() => updateColumns(toggleQueueColumnSelection(activeColumns, col.key))}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors ${
                      isLocked
                        ? 'opacity-75 cursor-default font-semibold text-slate-500 bg-slate-50/40'
                        : checked
                        ? 'cursor-pointer font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100/70'
                        : 'cursor-pointer font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MenuCheckIndicator checked={checked} />
                      <span className="truncate">{col.menuLabel}</span>
                    </span>
                    {col.isPinned && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9.5px] font-bold shrink-0">
                        Pinned
                      </span>
                    )}
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
