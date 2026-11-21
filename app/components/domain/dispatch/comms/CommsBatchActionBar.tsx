import { CheckIcon, MailIcon, TrashIcon, XIcon } from '../../../ui/Icons';

export interface CommsBatchActionBarProps {
  selectedCount: number;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onClear: () => void;
}

export function CommsBatchActionBar({
  selectedCount,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onClear,
}: CommsBatchActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="p-2.5 px-3 bg-slate-900 text-white flex items-center justify-between gap-2 shadow-xs shrink-0 animate-in fade-in duration-150">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-xs font-bold text-slate-200">
          {selectedCount} selected
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onMarkRead}
          className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          title="Mark selected as Read"
        >
          <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>Mark Read</span>
        </button>
        <button
          type="button"
          onClick={onMarkUnread}
          className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          title="Mark selected as Unread"
        >
          <MailIcon className="w-3.5 h-3.5 text-blue-400" />
          <span>Mark Unread</span>
        </button>
        <button
          type="button"
          onClick={onArchive}
          className="px-2 py-1 rounded-md bg-rose-950/70 hover:bg-rose-900 text-xs font-semibold text-rose-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 border border-rose-800/40"
          title="Archive / Remove selected"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          <span>Archive</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="p-1 rounded-md text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-1"
          title="Clear selection"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
