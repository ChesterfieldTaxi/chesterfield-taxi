import React, { useCallback, useRef, useState } from 'react';
import { useBottomSheetDragToClose } from '../../../../core/hooks/useBottomSheetDragToClose';
import { getContactService, normalizeEmail } from '../../../../core/services/customer/contact.service';
import {
  DISPATCH_EMAIL_CATEGORY_BADGE_CONFIG,
  DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG,
  DISPATCH_EMAIL_FOLDER_CONFIGS,
  formatDispatchEmailTimestamp,
  type DispatchEmailDraft,
  type DispatchEmailFolderView,
} from '../../../../core/services/email/dispatch-email.service';
import {
  DISPATCH_MAILBOX_ADDRESS,
  type DispatchEmailRecord,
} from '../../../../core/types/dispatch-email';
import {
  BuildingIcon,
  CarIcon,
  CheckIcon,
  EditIcon,
  MailIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from '../../../ui/Icons';

export interface EmailMessageListPaneProps {
  activeFolder: DispatchEmailFolderView;
  emails: DispatchEmailRecord[];
  drafts: DispatchEmailDraft[];
  selectedEmailId: string | null;
  activeDraftId: string | null;
  selectedIds: Set<string>;
  getConversationCount: (email: DispatchEmailRecord) => number;
  onSelectEmail: (email: DispatchEmailRecord) => void;
  onOpenDraft: (draft: DispatchEmailDraft) => void;
  onDiscardDraft: (draftId: string) => void;
  onToggleSelectId: (emailId: string) => void;
  onToggleRead: (emailId: string) => void;
  onToggleStar: (emailId: string) => void;
  onMoveToFolder: (emailId: string, folder: 'inbox' | 'archive' | 'trash') => void;
  onPopulateBooking: (email: DispatchEmailRecord) => void;
  onQuickReply: (email: DispatchEmailRecord) => void;
  className?: string;
}

const TONE_BADGE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

function PaperclipMiniIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function EmailMessageListPane({
  activeFolder,
  emails,
  drafts,
  selectedEmailId,
  activeDraftId,
  selectedIds,
  getConversationCount,
  onSelectEmail,
  onOpenDraft,
  onDiscardDraft,
  onToggleSelectId,
  onToggleRead,
  onToggleStar,
  onMoveToFolder,
  onPopulateBooking,
  onQuickReply,
  className = '',
}: EmailMessageListPaneProps) {
  const [actionSheetEmail, setActionSheetEmail] = useState<DispatchEmailRecord | null>(null);
  const [longPressingId, setLongPressingId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);

  const dismissActionSheet = useCallback(() => setActionSheetEmail(null), []);
  const actionSheetDrag = useBottomSheetDragToClose({ onClose: dismissActionSheet });

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
    setLongPressingId(null);
  }, []);

  const handleRowTouchStart = useCallback(
    (email: DispatchEmailRecord, e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input')) return;
      const touch = e.touches[0];
      longPressStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      setLongPressingId(email.id);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        suppressNextClickRef.current = true;
        setLongPressingId(null);
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(15);
          }
        } catch {}
        setActionSheetEmail(email);
      }, 380);
    },
    []
  );

  const handleRowTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!longPressStartPosRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - longPressStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - longPressStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        cancelLongPress();
      }
    },
    [cancelLongPress]
  );

  const folderConfig =
    DISPATCH_EMAIL_FOLDER_CONFIGS.find((f) => f.id === activeFolder) ||
    DISPATCH_EMAIL_FOLDER_CONFIGS[0];

  // ─── DRAFTS FOLDER VIEW ───
  if (activeFolder === 'drafts') {
    return (
      <div className={`divide-y divide-slate-100 overflow-y-auto pb-16 bg-white ${className}`}>
        {drafts.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <EditIcon className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">{folderConfig.emptyTitle}</p>
            <p className="text-[11px] text-slate-400">{folderConfig.emptyDescription}</p>
          </div>
        ) : (
          drafts.map((draft) => {
            const isActive = activeDraftId === draft.id;
            return (
              <div
                key={draft.id}
                onClick={() => onOpenDraft(draft)}
                className={`group relative p-3 cursor-pointer border-l-4 transition-colors ${
                  isActive
                    ? 'bg-amber-50/70 border-l-amber-500'
                    : 'bg-white hover:bg-slate-50 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                      Draft
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {draft.toName || draft.toEmail || '(No recipient yet)'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {formatDispatchEmailTimestamp(draft.updatedAtMs)}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 truncate mt-1">
                  {draft.subject || '(No subject)'}
                </h4>
                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  {draft.bodyText.trim() || 'Click to continue writing...'}
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscardDraft(draft.id);
                  }}
                  title="Discard draft"
                  className="absolute right-2.5 bottom-2.5 p-1 rounded-md bg-white/95 border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 shadow-2xs cursor-pointer"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  }

  const contactService = getContactService();

  return (
    <>
      <div className={`divide-y divide-slate-100 overflow-y-auto pb-16 bg-white ${className}`}>
        {emails.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <MailIcon className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">{folderConfig.emptyTitle}</p>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              {folderConfig.emptyDescription}
            </p>
          </div>
        ) : (
          emails.map((email) => {
            const isSelected = selectedEmailId === email.id;
            const isChecked = selectedIds.has(email.id);
            const isPressing = longPressingId === email.id;
            const threadCount = getConversationCount(email);

            const counterpartyEmail =
              email.direction === 'outbound'
                ? normalizeEmail(email.toEmail) || email.toEmail
                : normalizeEmail(
                    email.replyTo && normalizeEmail(email.replyTo) !== DISPATCH_MAILBOX_ADDRESS
                      ? email.replyTo
                      : email.fromEmail
                  ) || email.fromEmail;

            const matchedContact = counterpartyEmail
              ? contactService.getContactByEmail(counterpartyEmail)
              : null;
            const isVip = Boolean(matchedContact?.isVip);
            const corporateLabel =
              email.corporateAccountNumber ||
              matchedContact?.corporateAccountNumber ||
              matchedContact?.corporateAccountName;

            const displayCounterparty =
              email.direction === 'outbound'
                ? `To: ${matchedContact?.name || email.toEmail}`
                : email.fromName || counterpartyEmail;

            const deliveryCfg = DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG[email.deliveryStatus];
            const showDeliveryBadge =
              deliveryCfg?.showInList &&
              (email.direction === 'outbound' ||
                email.deliveryStatus === 'bounced' ||
                email.deliveryStatus === 'failed');

            const categoryCfg = DISPATCH_EMAIL_CATEGORY_BADGE_CONFIG[email.category];

            return (
              <div
                key={email.id}
                onTouchStart={(e) => handleRowTouchStart(email, e)}
                onTouchMove={handleRowTouchMove}
                onTouchEnd={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  onSelectEmail(email);
                }}
                className={`group relative px-3 py-2.5 transition-all cursor-pointer border-l-4 select-none ${
                  isPressing ? 'scale-[0.99] bg-blue-50/80' : ''
                } ${
                  isSelected
                    ? 'bg-blue-50/90 border-l-blue-600'
                    : isChecked
                    ? 'bg-blue-50/50 border-l-blue-400'
                    : email.isUnread
                    ? 'bg-blue-50/35 hover:bg-blue-50/70 border-l-blue-600'
                    : 'bg-white hover:bg-slate-50/90 border-l-transparent'
                }`}
              >
                {/* Row 1: Checkbox + Star + Sender + Thread Count + Timestamp */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelectId(email.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                      aria-label={`Select email ${email.subject}`}
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(email.id);
                      }}
                      className={`p-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                        email.isStarred
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-slate-300 hover:text-amber-400'
                      }`}
                      title={email.isStarred ? 'Remove star' : 'Star email'}
                      aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
                    >
                      <StarIcon
                        className="w-3.5 h-3.5"
                        fill={email.isStarred ? 'currentColor' : 'none'}
                      />
                    </button>

                    {email.isUnread && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 shadow-[0_0_5px_rgba(37,99,235,0.7)]" />
                    )}

                    <span
                      className={`text-xs truncate ${
                        email.isUnread
                          ? 'font-black text-slate-900'
                          : 'font-semibold text-slate-700'
                      }`}
                    >
                      {displayCounterparty}
                    </span>

                    {threadCount > 1 && (
                      <span
                        className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-slate-200/90 text-slate-700 shrink-0"
                        title={`${threadCount} messages in conversation`}
                      >
                        {threadCount}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                    {formatDispatchEmailTimestamp(email.timestampMs, email.createdAt)}
                  </span>
                </div>

                {/* Row 2: Subject */}
                <h4
                  className={`text-xs mt-1 truncate pl-5 ${
                    email.isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                  }`}
                >
                  {email.subject || '(No Subject)'}
                </h4>

                {/* Row 3: Snippet */}
                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 pl-5">
                  {email.snippet || email.textBody}
                </p>

                {/* Row 4: Operational Category, Delivery, VIP/Corporate & Attachment Chips */}
                <div className="flex items-center gap-1 flex-wrap mt-1.5 pl-5">
                  {email.suggestedBooking && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                      <CarIcon className="w-2.5 h-2.5 shrink-0" />
                      <span>Booking Req</span>
                    </span>
                  )}

                  {!email.suggestedBooking && categoryCfg && (
                    <span
                      className={`inline-flex items-center text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border ${
                        TONE_BADGE_CLASSES[categoryCfg.tone] || TONE_BADGE_CLASSES.slate
                      }`}
                    >
                      {categoryCfg.label}
                    </span>
                  )}

                  {isVip && (
                    <span className="inline-flex items-center text-[9.5px] font-black px-1.5 py-0.2 rounded-full border bg-amber-50 text-amber-800 border-amber-300">
                      VIP
                    </span>
                  )}

                  {corporateLabel && (
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 max-w-[140px] truncate">
                      <BuildingIcon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{corporateLabel}</span>
                    </span>
                  )}

                  {showDeliveryBadge && deliveryCfg && (
                    <span
                      className={`inline-flex items-center text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border ${
                        TONE_BADGE_CLASSES[deliveryCfg.tone] || TONE_BADGE_CLASSES.slate
                      }`}
                    >
                      {deliveryCfg.label}
                    </span>
                  )}

                  {email.attachments && email.attachments.length > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border bg-slate-100 text-slate-600 border-slate-200"
                      title={email.attachments.map((a) => a.filename).join(', ')}
                    >
                      <PaperclipMiniIcon className="w-2.5 h-2.5 shrink-0" />
                      <span>{email.attachments.length}</span>
                    </span>
                  )}

                  {email.tripId && (
                    <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded border bg-slate-50 text-slate-600 border-slate-200">
                      {email.tripId}
                    </span>
                  )}
                </div>

                {/* Desktop Hover Quick Actions */}
                <div className="absolute right-2 top-2 hidden sm:group-hover:flex items-center gap-0.5 bg-white/95 shadow-sm border border-slate-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRead(email.id);
                    }}
                    title={email.isUnread ? 'Mark as read' : 'Mark as unread'}
                    className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded cursor-pointer"
                  >
                    <MailIcon className="w-3 h-3" />
                  </button>
                  {activeFolder === 'archive' || activeFolder === 'trash' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToFolder(email.id, 'inbox');
                      }}
                      title="Move to Inbox"
                      className="px-1.5 py-0.5 hover:bg-blue-50 text-[10px] font-bold text-blue-600 rounded cursor-pointer"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToFolder(email.id, 'archive');
                      }}
                      title="Archive"
                      className="px-1.5 py-0.5 hover:bg-slate-100 text-[10px] font-bold text-slate-600 rounded cursor-pointer"
                    >
                      Archive
                    </button>
                  )}
                  {activeFolder !== 'trash' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToFolder(email.id, 'trash');
                      }}
                      title="Move to Trash"
                      className="p-1 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded cursor-pointer"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── SCROLL-SAFE MOBILE TOUCH-AND-HOLD ACTION SHEET ─── */}
      {actionSheetEmail && (
        <div
          className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={dismissActionSheet}
        >
          <div
            style={actionSheetDrag.sheetStyle}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0"
          >
            <div
              {...actionSheetDrag.dragHandlers}
              className="bg-slate-900 text-white px-4 pt-2 pb-3.5 touch-none"
            >
              <div
                className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden"
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-white truncate">
                    {actionSheetEmail.fromName || actionSheetEmail.fromEmail}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {actionSheetEmail.subject}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissActionSheet}
                  className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
                  aria-label="Close email actions"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {actionSheetEmail.suggestedBooking && (
                <button
                  type="button"
                  onClick={() => {
                    const target = actionSheetEmail;
                    setActionSheetEmail(null);
                    onPopulateBooking(target);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <CarIcon className="w-4 h-4" />
                  <span>Populate Dispatch Booking</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = actionSheetEmail;
                    setActionSheetEmail(null);
                    onSelectEmail(target);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MailIcon className="w-4 h-4" />
                  <span>Open Thread</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = actionSheetEmail;
                    setActionSheetEmail(null);
                    onQuickReply(target);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <EditIcon className="w-4 h-4" />
                  <span>Reply</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = actionSheetEmail.id;
                    setActionSheetEmail(null);
                    onToggleRead(id);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>{actionSheetEmail.isUnread ? 'Mark Read' : 'Mark Unread'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = actionSheetEmail.id;
                    setActionSheetEmail(null);
                    onToggleStar(id);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <StarIcon className="w-4 h-4" />
                  <span>{actionSheetEmail.isStarred ? 'Unstar' : 'Star'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {actionSheetEmail.folder === 'archive' || actionSheetEmail.folder === 'trash' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const id = actionSheetEmail.id;
                      setActionSheetEmail(null);
                      onMoveToFolder(id, 'inbox');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Move to Inbox</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const id = actionSheetEmail.id;
                      setActionSheetEmail(null);
                      onMoveToFolder(id, 'archive');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Archive</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const id = actionSheetEmail.id;
                    setActionSheetEmail(null);
                    onMoveToFolder(id, 'trash');
                  }}
                  className="py-2.5 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <TrashIcon className="w-4 h-4" />
                  <span>Trash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
