import React, { useEffect, useRef } from 'react';
import {
  DISPATCH_EMAIL_FOLDER_CONFIGS,
  type DispatchEmailFolderCounts,
  type DispatchEmailFolderView,
} from '../../../../core/services/email/dispatch-email.service';
import { DISPATCH_MAILBOX_ADDRESS } from '../../../../core/types/dispatch-email';
import {
  CheckIcon,
  ExternalLinkIcon,
  MailIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from '../../../ui/Icons';

export interface EmailFolderToolbarProps {
  isDocked?: boolean;
  isPopout?: boolean;
  activeFolder: DispatchEmailFolderView;
  onSelectFolder: (folder: DispatchEmailFolderView) => void;
  counts: DispatchEmailFolderCounts;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  unreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  isSyncing: boolean;
  onSyncNow: () => void;
  onOpenNewCompose: () => void;
  onPopOut?: () => void;
  onClose?: () => void;
  // Multi-select batch controls
  selectableCount: number;
  selectedCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onBatchMarkRead: () => void;
  onBatchMarkUnread: () => void;
  onBatchStar: () => void;
  onBatchArchive: () => void;
  onBatchRestoreToInbox: () => void;
  onBatchTrash: () => void;
}

function getFolderBadgeValue(
  folderId: DispatchEmailFolderView,
  counts: DispatchEmailFolderCounts
): number {
  switch (folderId) {
    case 'inbox':
      return counts.inbox;
    case 'bookings':
      return counts.bookings;
    case 'inquiries':
      return counts.inquiries;
    case 'receipts':
      return counts.receipts;
    case 'drafts':
      return counts.drafts;
    case 'starred':
      return counts.starred;
    default:
      return 0;
  }
}

export function EmailFolderToolbar({
  isDocked = false,
  isPopout = false,
  activeFolder,
  onSelectFolder,
  counts,
  searchQuery,
  onChangeSearchQuery,
  unreadOnly,
  onToggleUnreadOnly,
  isSyncing,
  onSyncNow,
  onOpenNewCompose,
  onPopOut,
  onClose,
  selectableCount,
  selectedCount,
  isAllSelected,
  onToggleSelectAll,
  onClearSelection,
  onBatchMarkRead,
  onBatchMarkUnread,
  onBatchStar,
  onBatchArchive,
  onBatchRestoreToInbox,
  onBatchTrash,
}: EmailFolderToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate =
        selectedCount > 0 && selectedCount < selectableCount;
    }
  }, [selectedCount, selectableCount]);

  // Instant `/` keyboard shortcut to focus search when not typing in another field
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (searchInputRef.current && searchInputRef.current.offsetParent !== null) {
        e.preventDefault();
        searchInputRef.current.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isArchiveOrTrashView = activeFolder === 'archive' || activeFolder === 'trash';

  return (
    <div className="shrink-0 bg-white border-b border-slate-200">
      {/* ─── SINGLE-MAILBOX HEADER (Hidden when docked inside Dispatch right drawer to avoid double header) ─── */}
      {!isDocked && (
        <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600/25 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <MailIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white truncate">
                  Dispatch Email Console
                </span>
                {counts.totalUnread > 0 && (
                  <span className="bg-blue-600 text-[10px] font-black px-1.5 py-0.5 rounded-full text-white shrink-0">
                    {counts.totalUnread} unread
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate">
                {DISPATCH_MAILBOX_ADDRESS}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenNewCompose}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1"
              title={`Compose new email from ${DISPATCH_MAILBOX_ADDRESS}`}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Compose</span>
            </button>

            {!isPopout && onPopOut && (
              <button
                type="button"
                onClick={onPopOut}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Pop out into standalone window"
                aria-label="Pop out Email Console"
              >
                <ExternalLinkIcon className="w-4 h-4" />
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close panel"
                aria-label="Close Email Console"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── DOCKED MAILBOX IDENTITY STRIP + PRIMARY CONTROLS ─── */}
      <div className="px-2.5 pt-2 pb-1.5 space-y-2">
        <div className="flex items-center gap-1.5">
          {activeFolder !== 'drafts' && selectableCount > 0 && (
            <input
              ref={masterCheckboxRef}
              type="checkbox"
              checked={isAllSelected}
              onChange={onToggleSelectAll}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              title="Select or deselect all emails in this view"
              aria-label="Select all emails in view"
            />
          )}

          <div className="relative flex-1 min-w-0">
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="Search mail, trip #, phone... (/)"
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/80 focus:bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Clear email search"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeFolder !== 'drafts' && (
            <button
              type="button"
              onClick={onToggleUnreadOnly}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer shrink-0 ${
                unreadOnly
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Show unread messages only"
            >
              Unread{counts.totalUnread > 0 ? ` (${counts.totalUnread})` : ''}
            </button>
          )}

          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
            title={`Sync ${DISPATCH_MAILBOX_ADDRESS}`}
            aria-label="Sync mailbox"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {isDocked && (
            <button
              type="button"
              onClick={onOpenNewCompose}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
              title={`Compose new email from ${DISPATCH_MAILBOX_ADDRESS}`}
            >
              <PlusIcon className="w-3 h-3" />
              <span>Compose</span>
            </button>
          )}
        </div>

        {/* Docked subtle single-mailbox address subtitle */}
        {isDocked && (
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
            <span className="font-mono truncate">{DISPATCH_MAILBOX_ADDRESS}</span>
            {counts.drafts > 0 && (
              <button
                type="button"
                onClick={() => onSelectFolder('drafts')}
                className="text-amber-700 hover:underline font-bold cursor-pointer"
              >
                {counts.drafts} saved {counts.drafts === 1 ? 'draft' : 'drafts'}
              </button>
            )}
          </div>
        )}

        {/* ─── SCROLLABLE / COMPACT OPERATIONAL FOLDER PILLS ─── */}
        <div
          className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar"
          role="tablist"
          aria-label="Dispatch Email Folders"
        >
          {DISPATCH_EMAIL_FOLDER_CONFIGS.map((folder) => {
            const isActive = activeFolder === folder.id;
            const badgeVal = getFolderBadgeValue(folder.id, counts);
            const isDraftBadge = folder.badgeMode === 'drafts';
            const isStarBadge = folder.badgeMode === 'starred';

            return (
              <button
                key={folder.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectFolder(folder.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shrink-0 border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50/90 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{folder.shortLabel}</span>
                {badgeVal > 0 && (
                  <span
                    className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-black leading-tight ${
                      isActive
                        ? 'bg-blue-500 text-white'
                        : isDraftBadge
                        ? 'bg-amber-100 text-amber-800'
                        : isStarBadge
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {badgeVal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── MULTI-SELECT BATCH ACTION BAR ─── */}
      {selectedCount > 0 && (
        <div className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between gap-2 border-t border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-extrabold text-slate-100 truncate">
              {selectedCount} selected
            </span>
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            <button
              type="button"
              onClick={onBatchMarkRead}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 hover:text-white cursor-pointer inline-flex items-center gap-1"
              title="Mark selected as Read"
            >
              <CheckIcon className="w-3 h-3 text-emerald-400" />
              <span>Read</span>
            </button>
            <button
              type="button"
              onClick={onBatchMarkUnread}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 hover:text-white cursor-pointer inline-flex items-center gap-1"
              title="Mark selected as Unread"
            >
              <MailIcon className="w-3 h-3 text-blue-400" />
              <span>Unread</span>
            </button>
            <button
              type="button"
              onClick={onBatchStar}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 hover:text-white cursor-pointer inline-flex items-center gap-1"
              title="Star selected"
            >
              <StarIcon className="w-3 h-3 text-amber-400" />
              <span>Star</span>
            </button>
            {isArchiveOrTrashView ? (
              <button
                type="button"
                onClick={onBatchRestoreToInbox}
                className="px-2 py-1 rounded-md bg-blue-700 hover:bg-blue-600 text-[11px] font-bold text-white cursor-pointer"
                title="Move selected back to Inbox"
              >
                Move to Inbox
              </button>
            ) : (
              <button
                type="button"
                onClick={onBatchArchive}
                className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 hover:text-white cursor-pointer"
                title="Archive selected"
              >
                Archive
              </button>
            )}
            {activeFolder !== 'trash' && (
              <button
                type="button"
                onClick={onBatchTrash}
                className="px-2 py-1 rounded-md bg-rose-950/80 hover:bg-rose-900 text-[11px] font-bold text-rose-200 hover:text-white border border-rose-800/50 cursor-pointer inline-flex items-center gap-1"
                title="Move selected to Trash"
              >
                <TrashIcon className="w-3 h-3" />
                <span>Trash</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClearSelection}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
