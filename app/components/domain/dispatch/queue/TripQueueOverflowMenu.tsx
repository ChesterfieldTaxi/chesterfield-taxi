import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { DisplayLayout } from '../../../../core/hooks/useDisplayLayout';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  BoltIcon,
  ListBulletIcon,
  Squares2X2Icon,
  TableCellsIcon,
} from '../../../ui/Icons';
import { type QueueFilterType } from './trip-queue-layout.util';
import {
  MenuCheckIndicator,
  QUEUE_FILTER_MENU_ITEMS,
  usePortalDropdownPosition,
} from './TripQueueFilterPopovers';
import { useQueueTableColumns } from './TripQueueColumnsDropdown';
import {
  DEFAULT_QUEUE_COLUMNS,
  TRIP_QUEUE_COLUMN_DEFINITIONS,
  TRIP_QUEUE_COLUMN_PRESETS,
  areQueueColumnsEqual,
  resolveActiveQueueColumnPreset,
  toggleQueueColumnSelection,
} from './trip-queue-columns.util';

export interface TripQueueOverflowMenuProps {
  filteredTripsCount: number;
  activeFilterKeys: QueueFilterType[];
  onActiveFilterKeysChange: (keys: QueueFilterType[]) => void;
  displayLayout: DisplayLayout;
  effectiveDisplayLayout: DisplayLayout;
  isAutoCardsFallback: boolean;
  onDisplayLayoutChange: (layout: DisplayLayout) => void;
  stagedPlanner?: DispatchStagedPlannerController;
  readyAutoDispatchCount?: number;
  isRunningAutoDispatchSweep?: boolean;
  onRunAutoDispatchSweep?: () => void | Promise<void>;
  isManualOrPaused?: boolean;
  effectiveSweepMode?: string;
  scheduledDispatchLeadMinutes?: number;
  showFiltersInMenu?: boolean;
  showAssignmentInMenu?: boolean;
  showColumnsInMenu?: boolean;
}

const PORTAL_MENU_SHELL_CLASS =
  'bg-surface-card rounded-xl shadow-xl border border-border-subtle/90 text-xs animate-in fade-in zoom-in-95 duration-100 text-left select-none z-[99999] overflow-hidden';

/**
 * Consolidated overflow portal menu (`⋯`) for secondary queue filters,
 * view/layout mode, table columns, staging/auto-dispatch actions, and trip count.
 */
export function TripQueueOverflowMenu({
  filteredTripsCount,
  activeFilterKeys,
  onActiveFilterKeysChange,
  displayLayout,
  effectiveDisplayLayout,
  isAutoCardsFallback,
  onDisplayLayoutChange,
  stagedPlanner,
  readyAutoDispatchCount = 0,
  isRunningAutoDispatchSweep = false,
  onRunAutoDispatchSweep,
  isManualOrPaused = false,
  effectiveSweepMode = 'manual_1tap',
  scheduledDispatchLeadMinutes = 45,
  showFiltersInMenu = true,
  showAssignmentInMenu = true,
  showColumnsInMenu = true,
}: TripQueueOverflowMenuProps) {
  const showColumnsSection =
    showColumnsInMenu &&
    (effectiveDisplayLayout === 'table' || displayLayout === 'table' || displayLayout === 'auto');

  const hasAutoStageReady = Boolean(stagedPlanner && stagedPlanner.openScheduledUnstagedCount > 0);
  const hasAutoDispatchReady = Boolean(readyAutoDispatchCount > 0 && onRunAutoDispatchSweep);
  const hasAssignModeToggle = Boolean(stagedPlanner && effectiveDisplayLayout !== 'table');
  const hasDispatchSection =
    showAssignmentInMenu && (hasAssignModeToggle || hasAutoStageReady || hasAutoDispatchReady);

  const estimatedMenuHeight =
    112 +
    (showFiltersInMenu ? 148 : 0) +
    (showColumnsSection ? 176 : 0) +
    (hasDispatchSection ? 92 : 0);

  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, coords, setCoords, computeCoords } = usePortalDropdownPosition({
    isOpen,
    onClose: closeMenu,
    menuWidth: 280,
    estimatedHeight: estimatedMenuHeight,
    align: 'right',
  });

  const { visibleColumns, setVisibleColumns } = useQueueTableColumns();
  const isDefaultColumns = areQueueColumnsEqual(visibleColumns, DEFAULT_QUEUE_COLUMNS);
  const activePresetKey = resolveActiveQueueColumnPreset(visibleColumns);
  const nonActionSelectedCount = visibleColumns.filter((k) => k !== 'action').length;

  const showFilterBadgeOnTrigger = showFiltersInMenu && activeFilterKeys.length > 0;
  const hasActiveState =
    showFilterBadgeOnTrigger ||
    (showAssignmentInMenu && (hasAutoDispatchReady || hasAutoStageReady)) ||
    (showColumnsSection && !isDefaultColumns);

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

  const toggleFilterKey = (key: QueueFilterType) => {
    onActiveFilterKeysChange(
      activeFilterKeys.includes(key)
        ? activeFilterKeys.filter((k) => k !== key)
        : [...activeFilterKeys, key]
    );
  };

  const layoutOptions: ReadonlyArray<{
    mode: DisplayLayout;
    label: string;
    icon: React.ReactNode;
  }> = [
    { mode: 'auto', label: 'Auto', icon: <BoltIcon className="w-3 h-3 shrink-0" /> },
    { mode: 'table', label: 'Table', icon: <TableCellsIcon className="w-3 h-3 shrink-0" /> },
    { mode: 'cards', label: 'Cards', icon: <Squares2X2Icon className="w-3 h-3 shrink-0" /> },
    { mode: 'compact', label: 'Compact', icon: <ListBulletIcon className="w-3 h-3 shrink-0" /> },
  ];

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={`h-7 px-2 rounded-lg border text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
          isOpen
            ? 'bg-status-info-bg border-blue-400 text-status-info-fg ring-2 ring-blue-500/20'
            : showFilterBadgeOnTrigger
            ? 'bg-status-info-bg/80 border-blue-400 text-status-info-fg hover:bg-status-info-bg'
            : showAssignmentInMenu && (hasAutoDispatchReady || hasAutoStageReady)
            ? 'bg-status-staged-bg/90 border-status-staged-border text-status-staged-fg hover:bg-status-staged-bg-strong/70'
            : 'bg-surface-card border-border-strong hover:bg-surface-subtle text-fg-secondary'
        }`}
        title="More options: filters, layout, columns, staging & auto-dispatch"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="text-sm leading-none tracking-tight font-black" aria-hidden="true">
          ⋯
        </span>
        {showFilterBadgeOnTrigger ? (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[9.5px] font-black tabular-nums inline-flex items-center justify-center leading-none">
            {activeFilterKeys.length}
          </span>
        ) : hasActiveState ? (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" aria-hidden="true" />
        ) : null}
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
              ...(coords.openUpward
                ? { bottom: `${coords.bottom}px` }
                : { top: `${coords.top}px` }),
              left: `${coords.left}px`,
              width: '280px',
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={PORTAL_MENU_SHELL_CLASS}
          >
            <div className="max-h-[75vh] overflow-y-auto divide-y divide-border-faint">
              {/* ─── 1. Filters ─── */}
              {showFiltersInMenu && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/70">
                    <span>Filters</span>
                    <button
                      type="button"
                      disabled={activeFilterKeys.length === 0}
                      onClick={() => onActiveFilterKeysChange([])}
                      className="text-[10px] font-bold text-rose-600 hover:text-status-danger-fg disabled:opacity-40 disabled:pointer-events-none cursor-pointer normal-case tracking-normal"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-0.5 p-1.5">
                    {QUEUE_FILTER_MENU_ITEMS.map((item) => {
                      const active = activeFilterKeys.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => toggleFilterKey(item.key)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11.5px] transition-colors cursor-pointer text-left min-w-0 ${
                            active
                              ? 'font-bold text-status-info-fg bg-status-info-bg/90 hover:bg-status-info-bg-strong/70'
                              : 'font-semibold text-fg-secondary hover:bg-surface-muted'
                          }`}
                        >
                          <MenuCheckIndicator checked={active} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ─── 2. View / Layout ─── */}
              <div>
                <div className="px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/70">
                  <span>View / Layout</span>
                  {displayLayout === 'auto' && (
                    <span className="px-1.5 py-0.5 rounded bg-status-info-bg-strong/80 text-status-info-fg text-[9.5px] font-bold normal-case tracking-normal">
                      {isAutoCardsFallback ? 'Auto: Cards' : 'Auto: Table'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1 p-1.5">
                  {layoutOptions.map((opt) => {
                    const isSelected = displayLayout === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        onClick={() => onDisplayLayoutChange(opt.mode)}
                        className={`flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-surface-card hover:bg-surface-subtle text-fg-secondary border-border-subtle'
                        }`}
                      >
                        {opt.icon}
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ─── 3. Table Columns (when Table or Auto is active) ─── */}
              {showColumnsSection && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/70">
                    <span>Columns</span>
                    <button
                      type="button"
                      disabled={isDefaultColumns}
                      onClick={() => setVisibleColumns(DEFAULT_QUEUE_COLUMNS)}
                      className="text-[10px] font-bold text-blue-600 hover:text-status-info-fg disabled:opacity-40 disabled:pointer-events-none cursor-pointer normal-case tracking-normal"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="px-2 pt-1.5 flex items-center gap-1">
                    {TRIP_QUEUE_COLUMN_PRESETS.map((preset) => {
                      const isPresetActive = activePresetKey === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => setVisibleColumns(preset.columns)}
                          className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-extrabold border transition-colors cursor-pointer truncate text-center ${
                            isPresetActive
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-surface-card hover:bg-status-info-bg text-fg-secondary hover:text-status-info-fg border-border-subtle'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-0.5 p-1.5">
                    {TRIP_QUEUE_COLUMN_DEFINITIONS.map((col) => {
                      const checked = visibleColumns.includes(col.key);
                      const isLastDataCol = checked && !col.isPinned && nonActionSelectedCount <= 1;
                      const isLocked = col.isPinned || isLastDataCol;
                      return (
                        <button
                          key={col.key}
                          type="button"
                          disabled={isLocked}
                          onClick={() =>
                            setVisibleColumns(toggleQueueColumnSelection(visibleColumns, col.key))
                          }
                          className={`flex items-center justify-between gap-1 px-2 py-1 rounded-lg text-[11px] text-left min-w-0 transition-colors ${
                            isLocked
                              ? 'opacity-70 cursor-default font-semibold text-fg-muted bg-surface-subtle/60'
                              : checked
                              ? 'cursor-pointer font-bold text-status-info-fg bg-status-info-bg/80 hover:bg-status-info-bg-strong/70'
                              : 'cursor-pointer font-semibold text-fg-secondary hover:bg-surface-muted'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <MenuCheckIndicator checked={checked} />
                            <span className="truncate">{col.menuLabel}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ─── 4. Staging & Auto-Dispatch Actions (conditional) ─── */}
              {hasDispatchSection && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider bg-surface-subtle/70">
                    Dispatch &amp; Staging
                  </div>
                  <div className="p-2 space-y-1.5">
                    {hasAssignModeToggle && stagedPlanner && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-fg-secondary">
                          Assign Mode
                        </span>
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
                          : `📌 Auto-Stage Open (${stagedPlanner.openScheduledUnstagedCount})`}
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
                </div>
              )}

              {/* ─── 5. Trip Count Summary ─── */}
              <div className="px-3 py-1.5 bg-surface-subtle/80 text-[11px] font-semibold text-fg-muted flex items-center justify-between">
                <span>Queue Summary</span>
                <span className="font-bold text-fg-secondary">
                  Displaying {filteredTripsCount} {filteredTripsCount === 1 ? 'trip' : 'trips'}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
