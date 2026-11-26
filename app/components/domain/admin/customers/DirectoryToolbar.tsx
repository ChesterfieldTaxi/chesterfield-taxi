import React from 'react';
import { Button } from '../../../ui/Button';
import { Squares2X2Icon, TableCellsIcon, XIcon } from '../../../ui/Icons';
import type {
  DirectoryToolbarAction,
  DirectoryToolbarFilterPill,
  DirectoryToolbarQuickToggle,
  DirectoryToolbarSortOption,
  DirectoryViewMode,
} from './types';

export interface DirectoryToolbarProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  onSearchClear: () => void;
  searchPlaceholder: string;
  searchClearLabel: string;
  filterPills: ReadonlyArray<DirectoryToolbarFilterPill>;
  activeFilterId: string;
  onFilterChange: (id: string) => void;
  quickToggle?: DirectoryToolbarQuickToggle;
  sortOptions: ReadonlyArray<DirectoryToolbarSortOption>;
  sortValue: string;
  onSortChange: (id: string) => void;
  sortAriaLabel: string;
  viewMode: DirectoryViewMode;
  onViewModeChange: (mode: DirectoryViewMode) => void;
  inlineExtra?: React.ReactNode;
  actions?: ReadonlyArray<DirectoryToolbarAction>;
}

/**
 * Config-driven single-row-on-desktop directory header toolbar shared by Passengers and Corporate.
 */
export function DirectoryToolbar({
  searchValue,
  onSearchChange,
  onSearchClear,
  searchPlaceholder,
  searchClearLabel,
  filterPills,
  activeFilterId,
  onFilterChange,
  quickToggle,
  sortOptions,
  sortValue,
  onSortChange,
  sortAriaLabel,
  viewMode,
  onViewModeChange,
  inlineExtra,
  actions,
}: DirectoryToolbarProps) {
  return (
    <div className="bg-surface-card p-3 sm:px-4 sm:py-3 rounded-2xl border border-border-subtle/90 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
      {/* Left: Search + Status Pills + Optional Quick Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0 flex-wrap xl:flex-nowrap">
        <div className="relative w-full sm:w-56 xl:w-60 shrink-0">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-3 pr-8 py-1.5 bg-surface-subtle border border-border-subtle rounded-xl text-xs font-medium text-fg-strong placeholder-fg-subtle focus:bg-surface-card focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchValue && (
            <button
              type="button"
              onClick={onSearchClear}
              aria-label={searchClearLabel}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 min-w-0">
          <div className="inline-flex flex-wrap sm:flex-nowrap items-center bg-surface-muted p-0.5 rounded-xl border border-border-subtle text-xs font-semibold">
            {filterPills.map((pill) => {
              const isActive = activeFilterId === pill.id;
              const activeCls =
                pill.activeClassName || 'bg-surface-card text-fg-primary shadow-xs font-bold';
              const inactiveCls =
                pill.inactiveClassName || 'text-fg-muted hover:text-fg-primary';

              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => onFilterChange(pill.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                    isActive ? activeCls : inactiveCls
                  }`}
                >
                  {pill.icon}
                  <span>
                    {pill.label}
                    {pill.count !== undefined ? ` (${pill.count})` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {quickToggle && (
            <button
              type="button"
              onClick={quickToggle.onToggle}
              aria-pressed={quickToggle.active}
              className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                quickToggle.active
                  ? 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border shadow-2xs'
                  : 'bg-surface-card text-fg-secondary border-border-subtle hover:bg-status-warning-bg/60 hover:text-status-warning-fg'
              }`}
            >
              {quickToggle.icon}
              <span>{quickToggle.label}</span>
            </button>
          )}
        </div>
      </div>

      {/* Right: Sort + Table/Cards Toggle + Inline Extra + Actions */}
      <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0 justify-between sm:justify-end">
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-fg-muted shrink-0">
            <span className="hidden 2xl:inline">Sort:</span>
            <select
              aria-label={sortAriaLabel}
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-surface-subtle border border-border-subtle text-xs font-bold text-fg-primary focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div
            className="inline-flex items-center bg-surface-muted p-0.5 rounded-xl border border-border-subtle shrink-0"
            role="group"
            aria-label="Directory view mode"
          >
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              aria-pressed={viewMode === 'table'}
              title="Table view"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-surface-card text-fg-primary shadow-xs'
                  : 'text-fg-muted hover:text-fg-primary'
              }`}
            >
              <TableCellsIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('cards')}
              aria-pressed={viewMode === 'cards'}
              title="Cards view"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-surface-card text-fg-primary shadow-xs'
                  : 'text-fg-muted hover:text-fg-primary'
              }`}
            >
              <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>

        {inlineExtra}

        {actions && actions.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {actions.map((action) => (
              <Button
                key={action.id}
                type="button"
                variant={action.variant ?? 'primary'}
                size="sm"
                leftIcon={action.icon}
                onClick={action.onClick}
                className="text-xs font-bold whitespace-nowrap justify-center shrink-0"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
