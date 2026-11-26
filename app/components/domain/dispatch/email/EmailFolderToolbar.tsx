import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DISPATCH_EMAIL_FOLDER_CONFIGS,
  type DispatchEmailFolderCounts,
  type DispatchEmailFolderView,
} from '../../../../core/services/email/dispatch-email.service';
import { DISPATCH_MAILBOX_ADDRESS } from '../../../../core/types/dispatch-email';
import {
  CheckIcon,
  ChevronDownIcon,
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
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const measureRowRef = useRef<HTMLDivElement | null>(null);
  const moreMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const [visibleFolderCount, setVisibleFolderCount] = useState<number>(
    DISPATCH_EMAIL_FOLDER_CONFIGS.length
  );
  const [isMoreOpen, setIsMoreOpen] = useState<boolean>(false);

  const activeFolderConfig = useMemo(
    () =>
      DISPATCH_EMAIL_FOLDER_CONFIGS.find((f) => f.id === activeFolder) ||
      DISPATCH_EMAIL_FOLDER_CONFIGS[0],
    [activeFolder]
  );

  const visibleFolders = useMemo(
    () => DISPATCH_EMAIL_FOLDER_CONFIGS.slice(0, visibleFolderCount),
    [visibleFolderCount]
  );

  const overflowFolders = useMemo(
    () => DISPATCH_EMAIL_FOLDER_CONFIGS.slice(visibleFolderCount),
    [visibleFolderCount]
  );

  const activeOverflowFolder = useMemo(
    () => overflowFolders.find((f) => f.id === activeFolder) || null,
    [overflowFolders, activeFolder]
  );

  const overflowBadgeTotal = useMemo(
    () =>
      overflowFolders.reduce(
        (sum, folder) => sum + getFolderBadgeValue(folder.id, counts),
        0
      ),
    [overflowFolders, counts]
  );

  const recalculateVisibleFolders = useCallback(() => {
    const barEl = tabBarRef.current;
    const measureEl = measureRowRef.current;
    if (!barEl || !measureEl) return;

    const availableWidth = barEl.clientWidth;
    if (availableWidth <= 0) return;

    const pillEls = Array.from(
      measureEl.querySelectorAll<HTMLElement>('[data-measure-folder-pill]')
    );
    if (pillEls.length !== DISPATCH_EMAIL_FOLDER_CONFIGS.length) return;

    const GAP_PX = 4;
    const pillWidths = pillEls.map((el) => Math.ceil(el.getBoundingClientRect().width));
    const totalAllWidth =
      pillWidths.reduce((sum, w) => sum + w, 0) +
      Math.max(0, pillWidths.length - 1) * GAP_PX;

    if (totalAllWidth <= availableWidth) {
      setVisibleFolderCount(DISPATCH_EMAIL_FOLDER_CONFIGS.length);
      return;
    }

    const baseMoreEl = measureEl.querySelector<HTMLElement>('[data-measure-more-base]');
    const activeMoreEl = measureEl.querySelector<HTMLElement>('[data-measure-more-active]');
    const baseMoreWidth = baseMoreEl
      ? Math.ceil(baseMoreEl.getBoundingClientRect().width)
      : 78;
    const activeMoreWidth = activeMoreEl
      ? Math.ceil(activeMoreEl.getBoundingClientRect().width)
      : 124;

    const activeIdx = DISPATCH_EMAIL_FOLDER_CONFIGS.findIndex(
      (f) => f.id === activeFolder
    );

    let bestCount = 1;
    for (let count = DISPATCH_EMAIL_FOLDER_CONFIGS.length - 1; count >= 1; count -= 1) {
      const isActiveInOverflow = activeIdx >= count;
      const requiredMoreWidth = isActiveInOverflow ? activeMoreWidth : baseMoreWidth;
      let tabsWidth = 0;
      for (let i = 0; i < count; i += 1) {
        tabsWidth += pillWidths[i];
      }
      // `count` gaps covers `(count - 1)` gaps between tabs + `1` gap before the More button
      const requiredTotal = tabsWidth + count * GAP_PX + requiredMoreWidth + 2;
      if (requiredTotal <= availableWidth) {
        bestCount = count;
        break;
      }
    }

    setVisibleFolderCount(bestCount);
  }, [activeFolder]);

  useEffect(() => {
    recalculateVisibleFolders();
    const barEl = tabBarRef.current;
    if (!barEl) return;

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        recalculateVisibleFolders();
      });
      observer.observe(barEl);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', recalculateVisibleFolders);
    return () => window.removeEventListener('resize', recalculateVisibleFolders);
  }, [recalculateVisibleFolders, counts]);

  // Auto-close More menu if container widens enough to show all folders
  useEffect(() => {
    if (overflowFolders.length === 0 && isMoreOpen) {
      setIsMoreOpen(false);
    }
  }, [overflowFolders.length, isMoreOpen]);

  // Close More dropdown on outside click or Escape key
  useEffect(() => {
    if (!isMoreOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        moreMenuContainerRef.current &&
        !moreMenuContainerRef.current.contains(e.target as Node)
      ) {
        setIsMoreOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [isMoreOpen]);

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
    <div className="relative z-40 shrink-0 bg-surface-card border-b border-border-subtle">
      {/* ─── SINGLE-MAILBOX HEADER (Hidden when docked inside Dispatch right drawer to avoid double header) ─── */}
      {!isDocked && (
        <div className="bg-surface-header text-white px-3 py-2.5 flex items-center justify-between gap-2 border-b border-border-header">
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
              <p className="text-[10px] font-mono text-fg-subtle truncate">
                {DISPATCH_MAILBOX_ADDRESS}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isPopout && onPopOut && (
              <button
                type="button"
                onClick={onPopOut}
                className="p-1.5 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated transition-colors cursor-pointer"
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
                className="p-1.5 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated transition-colors cursor-pointer"
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
              className="w-3.5 h-3.5 rounded border-border-strong text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              title="Select or deselect all emails in this view"
              aria-label="Select all emails in view"
            />
          )}

          <div className="relative flex-1 min-w-0">
            <SearchIcon className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="Search mail, trip #, phone... (/)"
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border-subtle bg-surface-subtle/80 focus:bg-surface-card text-fg-strong placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-secondary cursor-pointer"
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
                  ? 'bg-status-info-bg text-status-info-fg border-status-info-border shadow-2xs'
                  : 'bg-surface-card text-fg-secondary border-border-subtle hover:bg-surface-subtle'
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
            className="p-1.5 rounded-lg border border-border-subtle bg-surface-card hover:bg-surface-subtle text-fg-secondary hover:text-fg-primary disabled:opacity-50 transition-colors cursor-pointer shrink-0"
            title={`Sync ${DISPATCH_MAILBOX_ADDRESS}`}
            aria-label="Sync mailbox"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>

        {/* Docked subtle single-mailbox address subtitle */}
        {isDocked && (
          <div className="flex items-center justify-between text-[10px] text-fg-subtle px-0.5">
            <span className="font-mono truncate">{DISPATCH_MAILBOX_ADDRESS}</span>
            {counts.drafts > 0 && (
              <button
                type="button"
                onClick={() => onSelectFolder('drafts')}
                className="text-status-warning-fg hover:underline font-bold cursor-pointer"
              >
                {counts.drafts} saved {counts.drafts === 1 ? 'draft' : 'drafts'}
              </button>
            )}
          </div>
        )}

        {/* ─── RESPONSIVE OPERATIONAL FOLDER TABS + OVERFLOW "MORE" DROPDOWN (NO SCROLLBAR) ─── */}
        <div
          ref={tabBarRef}
          className="relative flex items-center gap-1 min-w-0 pb-0.5"
          role="tablist"
          aria-label="Dispatch Email Folders"
        >
          {/* Off-flow measurement shadow row for exact responsive overflow packing */}
          <div
            ref={measureRowRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap h-0 overflow-hidden"
          >
            {DISPATCH_EMAIL_FOLDER_CONFIGS.map((folder) => {
              const badgeVal = getFolderBadgeValue(folder.id, counts);
              return (
                <span
                  key={`measure-${folder.id}`}
                  data-measure-folder-pill
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shrink-0 border"
                >
                  <span>{folder.shortLabel}</span>
                  {badgeVal > 0 && (
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black leading-tight">
                      {badgeVal}
                    </span>
                  )}
                </span>
              );
            })}
            <span
              data-measure-more-base
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shrink-0 border"
            >
              <span>More</span>
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black leading-tight">
                99
              </span>
              <ChevronDownIcon className="w-3 h-3" />
            </span>
            <span
              data-measure-more-active
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shrink-0 border"
            >
              <span>More · {activeFolderConfig.shortLabel}</span>
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black leading-tight">
                99
              </span>
              <ChevronDownIcon className="w-3 h-3" />
            </span>
          </div>

          {visibleFolders.map((folder) => {
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
                onClick={() => {
                  onSelectFolder(folder.id);
                  setIsMoreOpen(false);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shrink-0 border ${
                  isActive
                    ? 'bg-surface-header text-white border-slate-900 shadow-2xs'
                    : 'bg-surface-subtle/90 text-fg-secondary border-border-subtle/80 hover:bg-surface-muted hover:text-fg-primary'
                }`}
              >
                <span>{folder.shortLabel}</span>
                {badgeVal > 0 && (
                  <span
                    className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-black leading-tight ${
                      isActive
                        ? 'bg-blue-500 text-white'
                        : isDraftBadge
                        ? 'bg-status-warning-bg-strong text-status-warning-fg'
                        : isStarBadge
                        ? 'bg-status-warning-bg text-status-warning-fg border border-status-warning-border'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {badgeVal}
                  </span>
                )}
              </button>
            );
          })}

          {overflowFolders.length > 0 && (
            <div ref={moreMenuContainerRef} className="relative ml-auto shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isMoreOpen}
                onClick={() => setIsMoreOpen((prev) => !prev)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shrink-0 border ${
                  activeOverflowFolder
                    ? 'bg-surface-header text-white border-slate-900 shadow-2xs'
                    : isMoreOpen
                    ? 'bg-surface-muted text-fg-primary border-border-strong'
                    : 'bg-surface-subtle/90 text-fg-secondary border-border-subtle/80 hover:bg-surface-muted hover:text-fg-primary'
                }`}
                title="More email folders"
              >
                <span>
                  {activeOverflowFolder
                    ? `More · ${activeOverflowFolder.shortLabel}`
                    : 'More'}
                </span>
                {overflowBadgeTotal > 0 && (
                  <span
                    className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-black leading-tight ${
                      activeOverflowFolder
                        ? 'bg-blue-500 text-white'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {overflowBadgeTotal}
                  </span>
                )}
                <ChevronDownIcon
                  className={`w-3 h-3 transition-transform duration-150 ${
                    isMoreOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isMoreOpen && (
                <div
                  role="menu"
                  aria-label="Additional email folders"
                  className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-surface-card border border-border-subtle shadow-xl py-1 z-50"
                >
                  {overflowFolders.map((folder) => {
                    const isActive = activeFolder === folder.id;
                    const badgeVal = getFolderBadgeValue(folder.id, counts);
                    const isDraftBadge = folder.badgeMode === 'drafts';
                    const isStarBadge = folder.badgeMode === 'starred';

                    return (
                      <button
                        key={folder.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        onClick={() => {
                          onSelectFolder(folder.id);
                          setIsMoreOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-surface-header text-white font-extrabold'
                            : 'text-fg-secondary font-semibold hover:bg-surface-subtle hover:text-fg-primary'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 truncate">
                          {isActive ? (
                            <CheckIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          <span className="truncate">{folder.label}</span>
                        </span>

                        {badgeVal > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-black leading-none shrink-0 ${
                              isActive
                                ? 'bg-blue-500 text-white'
                                : isDraftBadge
                                ? 'bg-status-warning-bg-strong text-status-warning-fg'
                                : isStarBadge
                                ? 'bg-status-warning-bg text-status-warning-fg border border-status-warning-border'
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── MULTI-SELECT BATCH ACTION BAR ─── */}
      {selectedCount > 0 && (
        <div className="px-3 py-2 bg-surface-header text-white flex items-center justify-between gap-2 border-t border-border-header animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-extrabold text-fg-on-header truncate">
              {selectedCount} selected
            </span>
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            <button
              type="button"
              onClick={onBatchMarkRead}
              className="px-2 py-1 rounded-md bg-surface-header-elevated hover:bg-surface-header-muted text-[11px] font-bold text-fg-on-header hover:text-white cursor-pointer inline-flex items-center gap-1"
              title="Mark selected as Read"
            >
              <CheckIcon className="w-3 h-3 text-emerald-400" />
              <span>Read</span>
            </button>
            <button
              type="button"
              onClick={onBatchMarkUnread}
              className="px-2 py-1 rounded-md bg-surface-header-elevated hover:bg-surface-header-muted text-[11px] font-bold text-fg-on-header hover:text-white cursor-pointer inline-flex items-center gap-1"
              title="Mark selected as Unread"
            >
              <MailIcon className="w-3 h-3 text-blue-400" />
              <span>Unread</span>
            </button>
            <button
              type="button"
              onClick={onBatchStar}
              className="px-2 py-1 rounded-md bg-surface-header-elevated hover:bg-surface-header-muted text-[11px] font-bold text-fg-on-header hover:text-white cursor-pointer inline-flex items-center gap-1"
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
                className="px-2 py-1 rounded-md bg-surface-header-elevated hover:bg-surface-header-muted text-[11px] font-bold text-fg-on-header hover:text-white cursor-pointer"
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
              className="p-1 rounded-md text-fg-subtle hover:text-white hover:bg-surface-header-elevated cursor-pointer"
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
