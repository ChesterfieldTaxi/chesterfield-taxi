import React, { useCallback, useRef, useState } from 'react';
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
import { FloatingWindow } from '../../../ui/FloatingWindow';
import {
  BuildingIcon,
  CarIcon,
  CheckIcon,
  EditIcon,
  MailIcon,
  StarIcon,
  TrashIcon,
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
  emerald: 'bg-status-success-bg text-status-success-fg border-status-success-border',
  blue: 'bg-status-info-bg text-status-info-fg border-status-info-border',
  amber: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
  rose: 'bg-status-danger-bg text-status-danger-fg border-status-danger-border',
  indigo: 'bg-status-staged-bg text-status-staged-fg border-status-staged-border',
  slate: 'bg-surface-muted text-fg-secondary border-border-subtle',
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
      <div className={`divide-y divide-border-faint overflow-y-auto pb-16 bg-surface-card ${className}`}>
        {drafts.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <EditIcon className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-fg-secondary">{folderConfig.emptyTitle}</p>
            <p className="text-[11px] text-fg-subtle">{folderConfig.emptyDescription}</p>
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
                    ? 'bg-status-warning-bg/70 border-l-amber-500'
                    : 'bg-surface-card hover:bg-surface-subtle border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.2 rounded bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border shrink-0">
                      Draft
                    </span>
                    <span className="text-xs font-bold text-fg-strong truncate">
                      {draft.toName || draft.toEmail || '(No recipient yet)'}
                    </span>
                  </div>
                  <span className="text-[10px] text-fg-subtle shrink-0">
                    {formatDispatchEmailTimestamp(draft.updatedAtMs)}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-fg-primary truncate mt-1">
                  {draft.subject || '(No subject)'}
                </h4>
                <p className="text-[11px] text-fg-muted line-clamp-1 mt-0.5">
                  {draft.bodyText.trim() || 'Click to continue writing...'}
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscardDraft(draft.id);
                  }}
                  title="Discard draft"
                  className="absolute right-2.5 bottom-2.5 p-1 rounded-md bg-surface-card/95 border border-border-subtle text-fg-subtle hover:text-rose-600 hover:border-status-danger-border shadow-2xs cursor-pointer"
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
      <div className={`divide-y divide-border-faint overflow-y-auto pb-16 bg-surface-card ${className}`}>
        {emails.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <MailIcon className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-fg-secondary">{folderConfig.emptyTitle}</p>
            <p className="text-[11px] text-fg-subtle max-w-xs mx-auto">
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
                  isPressing ? 'scale-[0.99] bg-status-info-bg/80' : ''
                } ${
                  isSelected
                    ? 'bg-status-info-bg/90 border-l-blue-600'
                    : isChecked
                    ? 'bg-status-info-bg/50 border-l-blue-400'
                    : email.isUnread
                    ? 'bg-status-info-bg/35 hover:bg-status-info-bg/70 border-l-blue-600'
                    : 'bg-surface-card hover:bg-surface-subtle/90 border-l-transparent'
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
                      className="w-3.5 h-3.5 rounded border-border-strong text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
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
                          ? 'font-black text-fg-primary'
                          : 'font-semibold text-fg-secondary'
                      }`}
                    >
                      {displayCounterparty}
                    </span>

                    {threadCount > 1 && (
                      <span
                        className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-surface-emphasis/90 text-fg-secondary shrink-0"
                        title={`${threadCount} messages in conversation`}
                      >
                        {threadCount}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-fg-subtle shrink-0 font-medium">
                    {formatDispatchEmailTimestamp(email.timestampMs, email.createdAt)}
                  </span>
                </div>

                {/* Row 2: Subject */}
                <h4
                  className={`text-xs mt-1 truncate pl-5 ${
                    email.isUnread ? 'font-bold text-fg-primary' : 'font-medium text-fg-secondary'
                  }`}
                >
                  {email.subject || '(No Subject)'}
                </h4>

                {/* Row 3: Snippet */}
                <p className="text-[11px] text-fg-muted line-clamp-1 mt-0.5 pl-5">
                  {email.snippet || email.textBody}
                </p>

                {/* Row 4: Operational Category, Delivery, VIP/Corporate & Attachment Chips */}
                <div className="flex items-center gap-1 flex-wrap mt-1.5 pl-5">
                  {email.suggestedBooking && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border bg-status-success-bg text-status-success-fg border-status-success-border">
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
                    <span className="inline-flex items-center text-[9.5px] font-black px-1.5 py-0.2 rounded-full border bg-status-warning-bg text-status-warning-fg border-status-warning-border">
                      VIP
                    </span>
                  )}

                  {corporateLabel && (
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border bg-status-staged-bg text-status-staged-fg border-status-staged-border max-w-[140px] truncate">
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
                      className="inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border bg-surface-muted text-fg-secondary border-border-subtle"
                      title={email.attachments.map((a) => a.filename).join(', ')}
                    >
                      <PaperclipMiniIcon className="w-2.5 h-2.5 shrink-0" />
                      <span>{email.attachments.length}</span>
                    </span>
                  )}

                  {email.tripId && (
                    <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded border bg-surface-subtle text-fg-secondary border-border-subtle">
                      {email.tripId}
                    </span>
                  )}
                </div>

                {/* Desktop Hover Quick Actions */}
                <div className="absolute right-2 top-2 hidden sm:group-hover:flex items-center gap-0.5 bg-surface-card/95 shadow-sm border border-border-subtle rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRead(email.id);
                    }}
                    title={email.isUnread ? 'Mark as read' : 'Mark as unread'}
                    className="p-1 hover:bg-surface-muted text-fg-muted hover:text-blue-600 rounded cursor-pointer"
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
                      className="px-1.5 py-0.5 hover:bg-status-info-bg text-[10px] font-bold text-blue-600 rounded cursor-pointer"
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
                      className="px-1.5 py-0.5 hover:bg-surface-muted text-[10px] font-bold text-fg-secondary rounded cursor-pointer"
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
                      className="p-1 hover:bg-status-danger-bg text-fg-muted hover:text-rose-600 rounded cursor-pointer"
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

      {/* ─── EMAIL QUICK ACTION FLOATING WINDOW ─── */}
      {actionSheetEmail && (
        <FloatingWindow
          id="dispatch_email_actions"
          isOpen={Boolean(actionSheetEmail)}
          onClose={dismissActionSheet}
          hasBackdrop={false}
          title={actionSheetEmail.fromName || actionSheetEmail.fromEmail}
          subtitle={actionSheetEmail.subject}
          icon={<MailIcon className="w-4 h-4 text-blue-400" />}
          initialSize={{ width: 420, height: 360 }}
          autoHeight
          minWidth={340}
          minHeight={240}
          zIndex={225}
        >
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
                className="py-2.5 px-3 rounded-xl bg-status-info-bg border border-status-info-border text-status-info-fg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="py-2.5 px-3 rounded-xl bg-status-staged-bg border border-status-staged-border text-status-staged-fg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="py-2.5 px-3 rounded-xl bg-surface-subtle border border-border-subtle text-fg-secondary font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="py-2.5 px-3 rounded-xl bg-status-warning-bg border border-status-warning-border text-status-warning-fg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                  className="py-2.5 px-3 rounded-xl bg-status-info-bg border border-status-info-border text-status-info-fg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                  className="py-2.5 px-3 rounded-xl bg-surface-muted border border-border-subtle text-fg-secondary font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="py-2.5 px-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-status-danger-fg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrashIcon className="w-4 h-4" />
                <span>Trash</span>
              </button>
            </div>
          </div>
        </FloatingWindow>
      )}
    </>
  );
}
