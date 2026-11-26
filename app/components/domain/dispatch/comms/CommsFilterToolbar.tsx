import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toggleCommsMultiFilter } from '../../../../core/services/comms/comms-templates.service';
import { ArchiveBoxIcon, CheckIcon, ChevronDownIcon, MailIcon, MailOpenIcon, RefreshCwIcon, SearchIcon, TrashIcon, XIcon } from '../../../ui/Icons';
import { Switch } from '../../../ui/Switch';
import type { ChannelFilter, CommsAllViewMode, ContactFilter, MultiChannelKey, MultiContactKey } from './comms-types';

export const MULTI_CHANNEL_FILTER_OPTS: ReadonlyArray<{ value: MultiChannelKey; label: string }> = [
  { value: 'calls', label: 'Calls' }, { value: 'voicemail', label: 'Voicemail' },
  { value: 'messages', label: 'Messages' }, { value: 'emails', label: 'Email' }, { value: 'notes', label: 'Notes' },
];

export const MULTI_CONTACT_FILTER_OPTS: ReadonlyArray<{ value: MultiContactKey; label: string }> = [
  { value: 'passengers', label: 'Passengers' }, { value: 'drivers', label: 'Drivers' }, { value: 'corporate', label: 'Corporate' },
];

function MenuCheckBox({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-surface-card border-border-strong'}`}>
      {checked && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}
    </span>
  );
}

export interface CommsFilterToolbarProps {
  searchQuery: string; onChangeSearchQuery: (val: string) => void; searchInputRef?: React.RefObject<HTMLInputElement | null>;
  channelFilter?: ChannelFilter; onChangeChannelFilter?: (val: ChannelFilter) => void;
  channelFilters?: ReadonlyArray<MultiChannelKey>; onChangeChannelFilters?: (next: MultiChannelKey[]) => void; showChannelFilter?: boolean;
  contactFilter?: ContactFilter; onChangeContactFilter?: (val: ContactFilter) => void;
  contactFilters?: ReadonlyArray<MultiContactKey>; onChangeContactFilters?: (next: MultiContactKey[]) => void;
  filterUnreadOnly: boolean; onToggleUnreadOnly: () => void; unreadCount: number;
  showArchived?: boolean; onToggleShowArchived?: () => void;
  onMarkAllRead: () => void; onRefresh: () => void;
  allViewMode?: CommsAllViewMode; onChangeAllViewMode?: (mode: CommsAllViewMode) => void; showAllViewModeToggle?: boolean;
  placeholder?: string; leadingSlot?: React.ReactNode;
  selectedCount?: number;
  allSelected?: boolean;
  selectedHasUnread?: boolean;
  selectedAllArchived?: boolean;
  onToggleSelectAll?: () => void;
  onBulkMarkReadUnread?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
}

export function CommsFilterToolbar({
  searchQuery, onChangeSearchQuery, searchInputRef,
  channelFilter = 'all', onChangeChannelFilter, channelFilters = [], onChangeChannelFilters,
  showChannelFilter = true, contactFilter = 'all', onChangeContactFilter, contactFilters = [], onChangeContactFilters,
  filterUnreadOnly, onToggleUnreadOnly, unreadCount, showArchived = false, onToggleShowArchived, onMarkAllRead, onRefresh,
  allViewMode = 'grouped', onChangeAllViewMode, showAllViewModeToggle = false,
  placeholder = 'Search comms...', leadingSlot,
  selectedCount = 0, allSelected = false, selectedHasUnread = false, selectedAllArchived = false,
  onToggleSelectAll, onBulkMarkReadUnread, onBulkArchive, onBulkDelete, onClearSelection,
}: CommsFilterToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const computePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 248;
    const menuHeight = menuRef.current?.offsetHeight || 340;
    const openUp = window.innerHeight - rect.bottom < menuHeight + 8 && rect.top > menuHeight;
    return {
      top: openUp ? Math.max(8, rect.top - menuHeight - 4) : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4),
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return setCoords(null);
    setCoords(computePosition());
    const update = () => setCoords(computePosition());
    const raf = requestAnimationFrame(update);
    const onOutside = (e: MouseEvent) => { if (!triggerRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setIsOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setIsOpen(false); } };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, computePosition]);

  const setChannels = (next: MultiChannelKey[]) => { onChangeChannelFilters?.(next); if (next.length === 0) onChangeChannelFilter?.('all'); };
  const setContacts = (next: MultiContactKey[]) => { onChangeContactFilters?.(next); if (next.length === 0) onChangeContactFilter?.('all'); };

  const activeFilterCount =
    (showChannelFilter ? (channelFilters.length || (channelFilter !== 'all' ? 1 : 0)) : 0) +
    (contactFilters.length || (contactFilter !== 'all' ? 1 : 0)) +
    (filterUnreadOnly ? 1 : 0) +
    (showArchived ? 1 : 0);

  const headerStripCls = 'px-3 py-1.5 text-[10px] font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between bg-surface-subtle/60';

  if (selectedCount > 0) {
    return (
      <div data-comms-row="toolbar" data-comms-selection-bar="true" className="h-9 px-2.5 border-b border-status-info-border bg-status-info-bg/90 flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleSelectAll}
            title={allSelected ? 'Deselect All' : 'Select All'}
            className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-status-info-fg hover:text-status-info-fg cursor-pointer shrink-0"
          >
            <MenuCheckBox checked={allSelected} />
            <span>{selectedCount} selected</span>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onBulkMarkReadUnread}
            title={selectedHasUnread ? 'Mark Read' : 'Mark Unread'}
            className="h-7 px-2 rounded-md bg-surface-card hover:bg-status-info-bg-strong border border-status-info-border text-status-info-fg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            {selectedHasUnread ? <MailOpenIcon className="w-3.5 h-3.5" /> : <MailIcon className="w-3.5 h-3.5" />}
            <span className="hidden @[360px]/commshub:inline">{selectedHasUnread ? 'Read' : 'Unread'}</span>
          </button>
          <button
            type="button"
            onClick={onBulkArchive}
            title={selectedAllArchived ? 'Unarchive' : 'Archive'}
            className="h-7 px-2 rounded-md bg-surface-card hover:bg-surface-muted border border-border-subtle text-fg-secondary text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <ArchiveBoxIcon className="w-3.5 h-3.5" />
            <span className="hidden @[400px]/commshub:inline">{selectedAllArchived ? 'Unarchive' : 'Archive'}</span>
          </button>
          <button
            type="button"
            onClick={onBulkDelete}
            title="Delete"
            className="h-7 px-2 rounded-md bg-surface-card hover:bg-status-danger-bg border border-status-danger-border text-status-danger-fg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            <span className="hidden @[430px]/commshub:inline">Delete</span>
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            title="Clear selection (Esc)"
            aria-label="Clear selection"
            className="h-7 w-7 rounded-md hover:bg-status-info-bg-strong text-status-info-fg inline-flex items-center justify-center cursor-pointer"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-comms-row="toolbar" className="h-9 px-2.5 border-b border-border-subtle/80 bg-surface-subtle/80 flex items-center gap-1.5 shrink-0">
      {leadingSlot}
      {showAllViewModeToggle && (
        <div data-comms-all-view-toggle="true" className="flex items-center bg-surface-emphasis/80 p-0.5 rounded-lg text-[10.5px] font-bold shrink-0">
          {(['grouped', 'stream'] as const).map((m) => (
            <button key={m} type="button" onClick={() => onChangeAllViewMode?.(m)} className={`h-6 px-2 rounded-md transition-colors cursor-pointer ${allViewMode === m ? 'bg-surface-card text-fg-primary shadow-2xs' : 'text-fg-secondary hover:text-fg-primary'}`}>
              {m === 'grouped' ? 'Grouped' : 'Stream'}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1 min-w-0">
        <SearchIcon className="w-3.5 h-3.5 text-fg-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => onChangeSearchQuery(e.target.value)} placeholder={placeholder} className="h-7 w-full pl-7 pr-6 text-xs rounded-lg border border-border-subtle bg-surface-card text-fg-strong placeholder-slate-400 focus:outline-none focus:border-blue-500" />
        {searchQuery ? (
          <button type="button" onClick={() => onChangeSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary cursor-pointer" title="Clear search"><XIcon className="w-3 h-3" /></button>
        ) : (
          <kbd className="hidden sm:inline-block absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-fg-subtle bg-surface-muted border border-border-subtle px-1 rounded pointer-events-none">/</kbd>
        )}
      </div>

      <button ref={triggerRef} type="button" onClick={() => setIsOpen((v) => !v)} aria-haspopup="true" aria-expanded={isOpen} className={`h-7 px-2 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${isOpen || activeFilterCount > 0 ? 'bg-status-info-bg border-status-info-border text-status-info-fg' : 'bg-surface-card hover:bg-surface-muted border-border-subtle text-fg-secondary'}`}>
        <span>Filter</span>
        {activeFilterCount > 0 && <span className="px-1 rounded-full bg-blue-600 text-white text-[9.5px] font-black">{activeFilterCount}</span>}
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`, width: '248px' }} className="z-[260] bg-surface-card rounded-xl shadow-xl ring-1 ring-slate-900/5 py-1 text-xs divide-y divide-border-faint select-none" onClick={(e) => e.stopPropagation()}>
          {showChannelFilter && (
            <div>
              <div className={headerStripCls}>
                <span>Channels</span>
                <div className="flex items-center gap-1.5 normal-case tracking-normal">
                  <button type="button" onClick={() => setChannels(MULTI_CHANNEL_FILTER_OPTS.map((o) => o.value))} className="text-[10px] font-bold text-fg-secondary hover:text-status-info-fg cursor-pointer">All</button>
                  <span className="text-slate-300">·</span>
                  <button type="button" disabled={channelFilters.length === 0} onClick={() => setChannels([])} className="text-[10px] font-bold text-blue-600 hover:text-status-info-fg disabled:opacity-40 cursor-pointer">Clear</button>
                </div>
              </div>
              <div className="py-0.5">
                {MULTI_CHANNEL_FILTER_OPTS.map((opt) => {
                  const checked = channelFilters.includes(opt.value);
                  return (
                    <button key={opt.value} type="button" onClick={() => setChannels(toggleCommsMultiFilter(channelFilters, opt.value))} className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${checked ? 'bg-status-info-bg/80 text-status-info-fg font-bold hover:bg-status-info-bg-strong/70' : 'text-fg-secondary font-semibold hover:bg-status-info-bg/80 hover:text-status-info-fg'}`}>
                      <span className="flex items-center gap-2"><MenuCheckBox checked={checked} /><span>{opt.label}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className={headerStripCls}>
              <span>Contacts</span>
              <div className="flex items-center gap-1.5 normal-case tracking-normal">
                <button type="button" onClick={() => setContacts(MULTI_CONTACT_FILTER_OPTS.map((o) => o.value))} className="text-[10px] font-bold text-fg-secondary hover:text-status-info-fg cursor-pointer">All</button>
                <span className="text-slate-300">·</span>
                <button type="button" disabled={contactFilters.length === 0} onClick={() => setContacts([])} className="text-[10px] font-bold text-blue-600 hover:text-status-info-fg disabled:opacity-40 cursor-pointer">Clear</button>
              </div>
            </div>
            <div className="py-0.5">
              {MULTI_CONTACT_FILTER_OPTS.map((opt) => {
                const checked = contactFilters.includes(opt.value);
                return (
                  <button key={opt.value} type="button" onClick={() => setContacts(toggleCommsMultiFilter(contactFilters, opt.value))} className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${checked ? 'bg-status-info-bg/80 text-status-info-fg font-bold hover:bg-status-info-bg-strong/70' : 'text-fg-secondary font-semibold hover:bg-status-info-bg/80 hover:text-status-info-fg'}`}>
                    <span className="flex items-center gap-2"><MenuCheckBox checked={checked} /><span>{opt.label}</span></span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-3 py-1.5 space-y-1">
            <Switch size="sm" checked={filterUnreadOnly} onChange={() => onToggleUnreadOnly()} label={<span className="text-xs font-bold text-fg-strong">Unread Only ({unreadCount})</span>} className="py-0.5" />
            {onToggleShowArchived && (
              <Switch size="sm" checked={showArchived} onChange={() => onToggleShowArchived()} label={<span className="text-xs font-bold text-fg-strong">Show Archived</span>} className="py-0.5" />
            )}
          </div>

          <div className="p-2 flex items-center justify-between gap-1.5">
            <button type="button" onClick={() => { onMarkAllRead(); setIsOpen(false); }} className="flex-1 px-2 py-1 rounded-lg bg-surface-muted hover:bg-surface-emphasis text-fg-secondary text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><CheckIcon className="w-3 h-3 text-emerald-600" /><span>Mark All Read</span></button>
            <button type="button" onClick={() => { onRefresh(); setIsOpen(false); }} className="px-2.5 py-1 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"><RefreshCwIcon className="w-3 h-3" /><span>Refresh</span></button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
