import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { getCommsThreadService } from '../../../../core/services/comms/comms-thread.service';
import { FloatingWindow } from '../../../ui/FloatingWindow';
import {
  CarIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  MailIcon,
  PhoneIcon,
  TrashIcon,
} from '../../../ui/Icons';
import type { CommsSheetDragProps, InteractionEvent } from './comms-types';

export interface UseCommsRowTriageOptions {
  currentTabItems: InteractionEvent[];
  setInteractions: React.Dispatch<React.SetStateAction<InteractionEvent[]>>;
}

export function useCommsRowTriage({
  currentTabItems,
  setInteractions,
}: UseCommsRowTriageOptions) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [forwardToast, setForwardToast] = useState<string | null>(null);
  const [commsActionSheetEvent, setCommsActionSheetEvent] = useState<InteractionEvent | null>(null);

  const masterCheckboxRef = useRef<HTMLInputElement>(null);
  const commsLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commsLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const commsLongPressTriggeredIdRef = useRef<string | null>(null);

  const isAllSelected =
    currentTabItems.length > 0 && currentTabItems.every((item) => selectedItemIds.has(item.id));
  const isSomeSelected =
    currentTabItems.some((item) => selectedItemIds.has(item.id)) && !isAllSelected;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  useEffect(() => {
    return () => {
      if (commsLongPressTimerRef.current) {
        clearTimeout(commsLongPressTimerRef.current);
      }
    };
  }, []);

  const cancelCommsLongPress = () => {
    if (commsLongPressTimerRef.current) {
      clearTimeout(commsLongPressTimerRef.current);
      commsLongPressTimerRef.current = null;
    }
    commsLongPressStartRef.current = null;
  };

  const handleCommsRowTouchStart = (
    event: InteractionEvent,
    e: React.TouchEvent<HTMLDivElement>
  ) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a')) return;
    const touch = e.touches[0];
    if (!touch) return;
    cancelCommsLongPress();
    commsLongPressStartRef.current = { x: touch.clientX, y: touch.clientY };
    commsLongPressTimerRef.current = setTimeout(() => {
      commsLongPressTimerRef.current = null;
      commsLongPressStartRef.current = null;
      commsLongPressTriggeredIdRef.current = event.id;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(15);
        } catch {
          // Ignore haptic feedback restrictions
        }
      }
      if (selectedItemIds.size > 0) {
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          if (next.has(event.id)) next.delete(event.id);
          else next.add(event.id);
          return next;
        });
      } else {
        setCommsActionSheetEvent(event);
      }
    }, 380);
  };

  const handleCommsRowTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!commsLongPressStartRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (
      Math.abs(touch.clientX - commsLongPressStartRef.current.x) > 10 ||
      Math.abs(touch.clientY - commsLongPressStartRef.current.y) > 10
    ) {
      cancelCommsLongPress();
    }
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        currentTabItems.forEach((i) => next.delete(i.id));
        return next;
      });
    } else {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        currentTabItems.forEach((i) => next.add(i.id));
        return next;
      });
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const handleBatchMarkRead = () => {
    const ids = Array.from(selectedItemIds);
    setInteractions((prev) =>
      prev.map((item) => (selectedItemIds.has(item.id) ? { ...item, isUnread: false } : item))
    );
    void getCommsThreadService().markEventsRead(ids);
    setSelectedItemIds(new Set());
  };

  const handleBatchMarkUnread = () => {
    const ids = Array.from(selectedItemIds);
    setInteractions((prev) =>
      prev.map((item) => (selectedItemIds.has(item.id) ? { ...item, isUnread: true } : item))
    );
    void getCommsThreadService().markEventsUnread(ids);
    setSelectedItemIds(new Set());
  };

  const handleBatchArchive = () => {
    const ids = Array.from(selectedItemIds);
    setInteractions((prev) => prev.filter((item) => !selectedItemIds.has(item.id)));
    void getCommsThreadService().archiveEvents(ids);
    setSelectedItemIds(new Set());
  };

  const handleToggleReadStatus = (id: string) => {
    setInteractions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isUnread: !item.isUnread } : item))
    );
    void getCommsThreadService().toggleEventReadStatus(id);
  };

  const handleArchiveItem = (id: string) => {
    setInteractions((prev) => prev.filter((item) => item.id !== id));
    void getCommsThreadService().archiveEvents([id]);
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleForwardItem = (item: InteractionEvent) => {
    const text = `[Chesterfield Taxi Comms Record]\nContact: ${item.contactName} (${item.contactPhone || item.contactEmail || ''})\nTime: ${item.timestamp}\nType: ${item.type}\nContent: ${item.transcription || item.snippet}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setForwardToast(`Copied ${item.contactName}'s comms log to clipboard`);
      setTimeout(() => setForwardToast(null), 2500);
    }
  };

  return {
    selectedItemIds,
    setSelectedItemIds,
    isAllSelected,
    masterCheckboxRef,
    forwardToast,
    setForwardToast,
    commsActionSheetEvent,
    setCommsActionSheetEvent,
    commsLongPressTriggeredIdRef,
    cancelCommsLongPress,
    handleCommsRowTouchStart,
    handleCommsRowTouchMove,
    handleToggleSelectAll,
    handleToggleSelectRow,
    handleClearSelection,
    handleBatchMarkRead,
    handleBatchMarkUnread,
    handleBatchArchive,
    handleToggleReadStatus,
    handleArchiveItem,
    handleForwardItem,
  };
}

export interface CommsRowActionSheetProps {
  event: InteractionEvent | null;
  onClose: () => void;
  onCallBack: (target: InteractionEvent) => void;
  onOpenThread: (target: InteractionEvent) => void;
  onBookTrip: (target: InteractionEvent) => void;
  onToggleRead: (target: InteractionEvent) => void;
  onSelectMultiple: (target: InteractionEvent) => void;
  onArchive: (target: InteractionEvent) => void;
  onOpenEmailInDock?: (target: InteractionEvent) => void;
  sheetDrag?: CommsSheetDragProps;
}

export function CommsRowActionSheet({
  event,
  onClose,
  onCallBack,
  onOpenThread,
  onBookTrip,
  onToggleRead,
  onSelectMultiple,
  onArchive,
  onOpenEmailInDock,
  sheetDrag,
}: CommsRowActionSheetProps) {
  if (!event) return null;

  const contactHandle = event.contactPhone || event.contactEmail || 'Dispatch Thread';
  const isEmailEvent = event.type.startsWith('email_');

  return (
    <FloatingWindow
      id="comms_row_actions"
      isOpen={Boolean(event)}
      onClose={onClose}
      hasBackdrop={false}
      title={event.contactName || 'Communication Actions'}
      subtitle={`${contactHandle} · ${event.timestamp}`}
      icon={<ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 420, height: 420 }}
      autoHeight
      minWidth={340}
      minHeight={260}
      zIndex={225}
    >
      <div className="p-4 space-y-3">
        {event.snippet && (
          <p className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 line-clamp-2">
            {event.snippet}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!event.contactPhone}
              onClick={() => onCallBack(event)}
              className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 disabled:opacity-45 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <PhoneIcon className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold">Call Back</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenThread(event)}
              className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-extrabold">Open Thread</span>
            </button>

            <button
              type="button"
              onClick={() => onBookTrip(event)}
              className="p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <CarIcon className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-extrabold">Book Trip</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleRead(event)}
              className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <CheckIcon className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-extrabold">
                {event.isUnread ? 'Mark Read' : 'Mark Unread'}
              </span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
            {isEmailEvent && onOpenEmailInDock && (
              <button
                type="button"
                onClick={() => onOpenEmailInDock(event)}
                className="w-full px-3.5 py-3 flex items-center gap-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
              >
                <MailIcon className="w-4 h-4 text-indigo-600" />
                <span>Open in Email Dock</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectMultiple(event)}
              className="w-full px-3.5 py-3 flex items-center gap-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <CheckIcon className="w-4 h-4 text-blue-600" />
              <span>Select Multiple</span>
            </button>

            <button
              type="button"
              onClick={() => onArchive(event)}
              className="w-full px-3.5 py-3 flex items-center gap-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              <TrashIcon className="w-4 h-4 text-rose-600" />
              <span>Archive Communication</span>
            </button>
          </div>
      </div>
    </FloatingWindow>
  );
}
