import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon, RefreshCwIcon, SearchIcon, XIcon } from '../../../ui/Icons';
import { Switch } from '../../../ui/Switch';
import type { ChannelFilter, ContactFilter } from './comms-types';

const CHANNEL_OPTS: ReadonlyArray<{ value: ChannelFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'calls', label: 'Calls' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'messages', label: 'SMS' },
  { value: 'emails', label: 'Email' },
  { value: 'notes', label: 'Notes' },
];

const CONTACT_OPTS: ReadonlyArray<{ value: ContactFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'passengers', label: 'Passengers' },
  { value: 'drivers', label: 'Drivers' },
];

export interface CommsFilterToolbarProps {
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  channelFilter: ChannelFilter;
  onChangeChannelFilter: (val: ChannelFilter) => void;
  showChannelFilter?: boolean;
  contactFilter: ContactFilter;
  onChangeContactFilter: (val: ContactFilter) => void;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  unreadCount: number;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  placeholder?: string;
  leadingSlot?: React.ReactNode;
}

export function CommsFilterToolbar({
  searchQuery, onChangeSearchQuery, searchInputRef, channelFilter, onChangeChannelFilter,
  showChannelFilter = true, contactFilter, onChangeContactFilter, filterUnreadOnly,
  onToggleUnreadOnly, unreadCount, onMarkAllRead, onRefresh, placeholder = 'Search comms...', leadingSlot,
}: CommsFilterToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const computePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 248;
    const menuHeight = menuRef.current?.offsetHeight || 280;
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
    const onOutside = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
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

  const activeFilterCount =
    (showChannelFilter && channelFilter !== 'all' ? 1 : 0) +
    (contactFilter !== 'all' ? 1 : 0) +
    (filterUnreadOnly ? 1 : 0);

  return (
    <div data-comms-row="toolbar" className="h-9 px-2.5 border-b border-slate-200/80 bg-slate-50/80 flex items-center gap-1.5 shrink-0">
      {leadingSlot}
      <div className="relative flex-1 min-w-0">
        <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onChangeSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="h-7 w-full pl-7 pr-6 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
        />
        {searchQuery ? (
          <button type="button" onClick={() => onChangeSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer" title="Clear search">
            <XIcon className="w-3 h-3" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-block absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1 rounded pointer-events-none">/</kbd>
        )}
      </div>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`h-7 px-2 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
          isOpen || activeFilterCount > 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
        }`}
      >
        <span>Filter</span>
        {activeFilterCount > 0 && <span className="px-1 rounded-full bg-blue-600 text-white text-[9.5px] font-black">{activeFilterCount}</span>}
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && coords !== null && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`, width: '248px' }}
          className="z-[260] bg-white rounded-xl shadow-xl ring-1 ring-slate-900/5 p-2.5 text-xs space-y-2.5 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {showChannelFilter && (
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Channel</span>
              <div className="grid grid-cols-3 gap-1">
                {CHANNEL_OPTS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => onChangeChannelFilter(opt.value)} className={`px-1.5 py-1 rounded-md text-[11px] font-bold border cursor-pointer ${channelFilter === opt.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Contact</span>
            <div className="grid grid-cols-3 gap-1">
              {CONTACT_OPTS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => onChangeContactFilter(opt.value)} className={`px-1.5 py-1 rounded-md text-[11px] font-bold border cursor-pointer ${contactFilter === opt.value ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100">
            <Switch size="sm" checked={filterUnreadOnly} onChange={() => onToggleUnreadOnly()} label={<span className="text-xs font-bold text-slate-800">Unread Only ({unreadCount})</span>} className="py-0.5" />
          </div>
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
            <button type="button" onClick={() => { onMarkAllRead(); setIsOpen(false); }} className="flex-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer">
              <CheckIcon className="w-3 h-3 text-emerald-600" /><span>Mark All Read</span>
            </button>
            <button type="button" onClick={() => { onRefresh(); setIsOpen(false); }} className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
              <RefreshCwIcon className="w-3 h-3" /><span>Refresh</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
