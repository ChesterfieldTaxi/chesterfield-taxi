import type React from 'react';
import { SearchIcon } from '../../../ui/Icons';
import type { ContactFilter } from './comms-types';

export interface CommsFilterToolbarProps {
  isAllSelected: boolean;
  masterCheckboxRef?: React.RefObject<HTMLInputElement | null>;
  onToggleSelectAll: () => void;
  unreadCount: number;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  contactFilter: ContactFilter;
  onChangeContactFilter: (val: ContactFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  showChannelFilter?: boolean;
  channelFilter?: string;
  onChangeChannelFilter?: (val: string) => void;
  channelOptions?: { value: string; label: string }[];
  placeholder?: string;
}

export function CommsFilterToolbar({
  isAllSelected,
  masterCheckboxRef,
  onToggleSelectAll,
  unreadCount,
  filterUnreadOnly,
  onToggleUnreadOnly,
  contactFilter,
  onChangeContactFilter,
  searchQuery,
  onChangeSearchQuery,
  showChannelFilter = false,
  channelFilter = 'all',
  onChangeChannelFilter,
  channelOptions = [],
  placeholder = 'Filter communications...',
}: CommsFilterToolbarProps) {
  return (
    <div className="p-2.5 sm:p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 bg-slate-50/50 shrink-0">
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <input
          type="checkbox"
          ref={masterCheckboxRef}
          checked={isAllSelected}
          onChange={onToggleSelectAll}
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
          title="Select/Deselect all communications in this view"
        />

        <button
          type="button"
          onClick={onToggleUnreadOnly}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border shrink-0 ${
            filterUnreadOnly
              ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          Unread ({unreadCount})
        </button>

        {showChannelFilter && channelOptions.length > 0 && (
          <select
            value={channelFilter}
            onChange={(e) => onChangeChannelFilter && onChangeChannelFilter(e.target.value)}
            className="px-2 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 cursor-pointer flex-1 sm:flex-none min-w-[110px]"
          >
            {channelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        <select
          value={contactFilter}
          onChange={(e) => onChangeContactFilter(e.target.value as ContactFilter)}
          className="px-2 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 cursor-pointer flex-1 sm:flex-none min-w-[110px]"
        >
          <option value="all">All contacts</option>
          <option value="passengers">Passengers &amp; VIPs</option>
          <option value="drivers">Active Drivers</option>
        </select>
      </div>

      {/* Search input */}
      <div className="relative w-full sm:w-48">
        <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onChangeSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-1.5 sm:py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-blue-500"
        />
      </div>
    </div>
  );
}
