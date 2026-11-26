import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getBookingService } from '../../../core/services/booking';
import { getCommsThreadService } from '../../../core/services/comms/comms-thread.service';
import { getContactService, normalizeEmail } from '../../../core/services/customer/contact.service';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import {
  appendOutboundEmailSignature,
  buildPopulateBookingPayloadFromEmail,
  buildReplyOrForwardDraftSeed,
  filterDispatchDrafts,
  filterDispatchEmails,
  getDispatchEmailService,
  normalizeDispatchEmailPolicy,
  type DispatchEmailDraft,
  type DispatchEmailFolderView,
  type DispatchEmailSnapshot,
} from '../../../core/services/email/dispatch-email.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import {
  DISPATCH_MAILBOX_ADDRESS,
  type DispatchEmailRecord,
} from '../../../core/types/dispatch-email';
import type { Trip } from '../../../core/types/trip';
import { AlertCircleIcon, CheckIcon, MailIcon, PlusIcon, XIcon } from '../../ui/Icons';
import {
  EmailComposerPane,
  EmailCrossChannelRail,
  EmailFolderToolbar,
  EmailMessageListPane,
  EmailReaderPane,
} from './email';

export type EmailMessage = DispatchEmailRecord;

export interface EmailDockProps {
  onClose?: () => void;
  onPopOut?: () => void;
  showWindowControls?: boolean;
  isPopout?: boolean;
  isDocked?: boolean;
  trips?: Trip[];
  onOpenEditTrip?: (tripId: string) => void;
  onPopulateBooking?: (bookingData: any) => void;
}

export function EmailDock({
  onClose,
  onPopOut,
  isPopout = false,
  isDocked = false,
  trips: externalTrips,
  onOpenEditTrip,
  onPopulateBooking,
}: EmailDockProps) {
  const emailService = getDispatchEmailService();

  const [snapshot, setSnapshot] = useState<DispatchEmailSnapshot>(() =>
    emailService.getSnapshot()
  );
  const [fallbackTrips, setFallbackTrips] = useState<Trip[]>([]);
  const [commsTick, setCommsTick] = useState<number>(0);

  const [activeFolder, setActiveFolder] = useState<DispatchEmailFolderView>('inbox');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Composer state (`inline` inside reader for replies/forwards, `modal` for + Compose / Drafts)
  const [inlineReplyDraft, setInlineReplyDraft] = useState<DispatchEmailDraft | null>(null);
  const [modalComposeDraft, setModalComposeDraft] = useState<DispatchEmailDraft | null>(null);
  const [pendingInsertion, setPendingInsertion] = useState<{
    id: string;
    text: string;
    tripId?: string;
  } | null>(null);

  // Cross-channel sender timeline rail (open by default in wide pop-out windows)
  const [isRailOpen, setIsRailOpen] = useState<boolean>(() => Boolean(isPopout));

  // Toast feedback banner
  const [toast, setToast] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  // 1. Subscribe to `DispatchEmailService`, `CommsThreadService`, and `ContactService`
  useEffect(() => {
    const unsubEmails = emailService.subscribe((snap) => {
      setSnapshot(snap);
    });
    const unsubComms = getCommsThreadService().subscribe(() => {
      setCommsTick((t) => t + 1);
    });
    const unsubContacts = getContactService().subscribe(() => {
      setCommsTick((t) => t + 1);
    });

    // Hydrate/flush `/api/email/webhook?action=sync_emails` on mount (seeding offline dev samples only if empty)
    setIsSyncing(true);
    void emailService
      .syncWithServer({ seedSamplesIfOfflineEmpty: true })
      .finally(() => setIsSyncing(false));

    return () => {
      unsubEmails();
      unsubComms();
      unsubContacts();
    };
  }, [emailService]);

  // 2. Fallback subscription to `getBookingService()` if `trips` prop is omitted
  useEffect(() => {
    if (externalTrips !== undefined) return;
    const bookingService = getBookingService();
    if (!bookingService.subscribeToAllTrips) return;
    const unsub = bookingService.subscribeToAllTrips(
      (list: Trip[]) => setFallbackTrips(list),
      () => {}
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [externalTrips]);

  const effectiveTrips = externalTrips ?? fallbackTrips;

  // 3. Cross-module `OPEN_EMAIL_MESSAGE` deep-link handler from `CommsHub` / `WorkspaceBus`
  useEffect(() => {
    const unsub = getWorkspaceBus().subscribe((msg) => {
      if (msg.type !== 'OPEN_EMAIL_MESSAGE') return;
      const p = msg.payload;
      const cleanId = p.emailMessageId?.replace(/^em_/, '').trim();
      const normSender = normalizeEmail(p.senderEmail);
      const all = emailService.getAllEmails();

      const matched = all.find((em) => {
        if (cleanId && em.id === cleanId) return true;
        if (p.threadId && em.threadId === p.threadId) return true;
        if (
          normSender &&
          (normalizeEmail(em.fromEmail) === normSender ||
            normalizeEmail(em.toEmail) === normSender)
        ) {
          return true;
        }
        return false;
      });

      if (matched) {
        if (matched.folder === 'sent') setActiveFolder('sent');
        else if (matched.folder === 'receipts') setActiveFolder('receipts');
        else if (matched.folder === 'archive') setActiveFolder('archive');
        else if (matched.folder === 'trash') setActiveFolder('trash');
        else setActiveFolder('inbox');

        setSelectedEmailId(matched.id);
        if (matched.isUnread) {
          void emailService.markEmailsRead([matched.id]);
        }
      } else if (normSender || p.threadId) {
        const contact = normSender ? getContactService().getContactByEmail(normSender) : null;
        const nowMs = Date.now();
        setModalComposeDraft({
          id: `draft_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
          mode: 'new',
          toEmail: normSender || contact?.email || '',
          toName: contact?.name || '',
          subject: '',
          bodyText: '',
          threadId: p.threadId,
          contactId: contact?.id,
          contactPhone: contact?.phone,
          corporateAccountNumber: contact?.corporateAccountNumber,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        });
      }
    });
    return () => unsub();
  }, [emailService]);

  // Filtered emails & drafts for active view
  const visibleEmails = useMemo(() => {
    return filterDispatchEmails(snapshot.emails, {
      folder: activeFolder,
      searchQuery,
      unreadOnly,
    });
  }, [snapshot.emails, activeFolder, searchQuery, unreadOnly]);

  const visibleDrafts = useMemo(() => {
    return filterDispatchDrafts(snapshot.drafts, searchQuery);
  }, [snapshot.drafts, searchQuery]);

  const selectedEmail = useMemo(() => {
    if (!selectedEmailId) return null;
    return snapshot.emails.find((e) => e.id === selectedEmailId) || null;
  }, [snapshot.emails, selectedEmailId]);

  const conversationMessages = useMemo(() => {
    if (!selectedEmail) return [];
    return emailService.getConversationMessages(selectedEmail);
  }, [emailService, selectedEmail, snapshot.emails]);

  const senderContext = useMemo(() => {
    // Re-evaluates when emails, comms events (`commsTick`), or trips update
    void commsTick;
    if (selectedEmail) {
      return emailService.resolveSenderTimeline(selectedEmail, effectiveTrips);
    }
    if (modalComposeDraft?.toEmail) {
      return emailService.resolveSenderTimeline(
        {
          email: modalComposeDraft.toEmail,
          phone: modalComposeDraft.contactPhone,
          name: modalComposeDraft.toName,
          threadId: modalComposeDraft.threadId,
          tripId: modalComposeDraft.tripId,
          corporateAccountNumber: modalComposeDraft.corporateAccountNumber,
        },
        effectiveTrips
      );
    }
    return emailService.resolveSenderTimeline({}, effectiveTrips);
  }, [emailService, selectedEmail, modalComposeDraft, effectiveTrips, commsTick]);

  // Selection helpers
  const handleSelectFolder = useCallback((folder: DispatchEmailFolderView) => {
    setActiveFolder(folder);
    setSelectedIds(new Set());
    if (folder === 'drafts') {
      setSelectedEmailId(null);
    }
  }, []);

  const handleSelectEmail = useCallback(
    (email: DispatchEmailRecord) => {
      setSelectedEmailId(email.id);
      setInlineReplyDraft(null);
      // Mark all unread messages in the opened conversation read
      const threadMsgs = emailService.getConversationMessages(email);
      const unreadIds = threadMsgs.filter((m) => m.isUnread).map((m) => m.id);
      if (unreadIds.length > 0) {
        void emailService.markEmailsRead(unreadIds);
      } else if (email.isUnread) {
        void emailService.markEmailsRead([email.id]);
      }
    },
    [emailService]
  );

  const handleToggleSelectId = useCallback((emailId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }, []);

  const isAllSelected =
    visibleEmails.length > 0 && visibleEmails.every((e) => selectedIds.has(e.id));

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleEmails.map((e) => e.id)));
    }
  }, [isAllSelected, visibleEmails]);

  // Manual sync
  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    const res = await emailService.syncWithServer();
    setIsSyncing(false);
    if (res.success) {
      showToast(`Synced ${DISPATCH_MAILBOX_ADDRESS}`, 'success');
    } else {
      showToast(res.error || 'Mailbox sync unavailable right now.', 'error');
    }
  }, [emailService, showToast]);

  // Triage actions
  const handleToggleRead = useCallback(
    (emailId: string) => {
      void emailService.toggleEmailRead(emailId);
    },
    [emailService]
  );

  const handleMarkUnread = useCallback(
    (emailId: string) => {
      void emailService.markEmailsUnread([emailId]);
      showToast('Marked email as unread');
    },
    [emailService, showToast]
  );

  const handleToggleStar = useCallback(
    (emailId: string) => {
      void emailService.toggleEmailStar(emailId);
    },
    [emailService]
  );

  const handleMoveToFolder = useCallback(
    (emailId: string, folder: 'inbox' | 'archive' | 'trash') => {
      void emailService.moveEmailsToFolder([emailId], folder);
      if (selectedEmailId === emailId && folder !== 'inbox') {
        setSelectedEmailId(null);
        setInlineReplyDraft(null);
      }
      showToast(
        folder === 'archive'
          ? 'Email archived'
          : folder === 'trash'
          ? 'Moved email to Trash'
          : 'Restored email to Inbox'
      );
    },
    [emailService, selectedEmailId, showToast]
  );

  // Batch triage actions
  const handleBatchMarkRead = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    void emailService.markEmailsRead(ids);
    setSelectedIds(new Set());
    showToast(`Marked ${ids.length} email(s) read`);
  }, [emailService, selectedIds, showToast]);

  const handleBatchMarkUnread = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    void emailService.markEmailsUnread(ids);
    setSelectedIds(new Set());
    showToast(`Marked ${ids.length} email(s) unread`);
  }, [emailService, selectedIds, showToast]);

  const handleBatchStar = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    void emailService.setEmailsStarred(ids, true);
    setSelectedIds(new Set());
    showToast(`Starred ${ids.length} email(s)`);
  }, [emailService, selectedIds, showToast]);

  const handleBatchMove = useCallback(
    (folder: 'inbox' | 'archive' | 'trash') => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      void emailService.moveEmailsToFolder(ids, folder);
      if (selectedEmailId && selectedIds.has(selectedEmailId) && folder !== 'inbox') {
        setSelectedEmailId(null);
        setInlineReplyDraft(null);
      }
      setSelectedIds(new Set());
      showToast(
        folder === 'archive'
          ? `Archived ${ids.length} email(s)`
          : folder === 'trash'
          ? `Moved ${ids.length} email(s) to Trash`
          : `Moved ${ids.length} email(s) to Inbox`
      );
    },
    [emailService, selectedIds, selectedEmailId, showToast]
  );

  // Booking population
  const handlePopulateBookingFromPayload = useCallback(
    (payload: any) => {
      getWorkspaceBus().publish('POPULATE_BOOKING', payload);
      if (onPopulateBooking && !isPopout) {
        onPopulateBooking(payload);
      }
      showToast('Populated Dispatch Booking form!', 'success');
    },
    [onPopulateBooking, isPopout, showToast]
  );

  const handlePopulateBookingFromEmail = useCallback(
    (email: DispatchEmailRecord) => {
      const payload = buildPopulateBookingPayloadFromEmail(email);
      if (!payload.pickupAddress && !payload.dropoffAddress) {
        showToast('No pickup/dropoff route detected in this email.', 'error');
        return;
      }
      handlePopulateBookingFromPayload(payload);
    },
    [handlePopulateBookingFromPayload, showToast]
  );

  const resolveConfiguredEmailSignature = useCallback((): string => {
    const policy = normalizeDispatchEmailPolicy(
      getAdminConfigService().getCachedSettings().integrations?.dispatchEmail
    );
    return policy.outboundSignature;
  }, []);

  // Compose & Reply / Forward orchestration
  const handleOpenNewCompose = useCallback(() => {
    const nowMs = Date.now();
    const sig = resolveConfiguredEmailSignature();
    setModalComposeDraft({
      id: `draft_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
      mode: 'new',
      toEmail: '',
      subject: '',
      bodyText: appendOutboundEmailSignature('', sig),
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    });
  }, [resolveConfiguredEmailSignature]);

  const handleOpenExistingDraft = useCallback(
    (draft: DispatchEmailDraft) => {
      if (
        (draft.mode === 'reply' || draft.mode === 'reply_all') &&
        draft.replyToEmailId &&
        emailService.getEmailById(draft.replyToEmailId)
      ) {
        setSelectedEmailId(draft.replyToEmailId);
        setInlineReplyDraft(draft);
      } else {
        setModalComposeDraft(draft);
      }
    },
    [emailService]
  );

  const handleDiscardDraft = useCallback(
    (draftId: string) => {
      emailService.discardDraft(draftId);
      if (inlineReplyDraft?.id === draftId) setInlineReplyDraft(null);
      if (modalComposeDraft?.id === draftId) setModalComposeDraft(null);
      showToast('Draft discarded');
    },
    [emailService, inlineReplyDraft?.id, modalComposeDraft?.id, showToast]
  );

  const handleStartReply = useCallback(
    (mode: 'reply' | 'reply_all' | 'forward', targetEmail: DispatchEmailRecord) => {
      const conv = emailService.getConversationMessages(targetEmail);
      const seed = buildReplyOrForwardDraftSeed({
        mode,
        email: targetEmail,
        conversation: conv,
      });
      const sig = resolveConfiguredEmailSignature();
      const nowMs = Date.now();
      setSelectedEmailId(targetEmail.id);
      setInlineReplyDraft({
        ...seed,
        bodyText: appendOutboundEmailSignature(seed.bodyText || '', sig),
        id: `draft_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });
    },
    [emailService, resolveConfiguredEmailSignature]
  );

  const handleInsertIntoComposer = useCallback(
    (snippetText: string, tripId?: string) => {
      const insertion = {
        id: `ins_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        text: snippetText,
        tripId,
      };
      if (inlineReplyDraft || modalComposeDraft) {
        setPendingInsertion(insertion);
        return;
      }
      if (selectedEmail) {
        const conv = emailService.getConversationMessages(selectedEmail);
        const seed = buildReplyOrForwardDraftSeed({
          mode: 'reply',
          email: selectedEmail,
          conversation: conv,
        });
        const nowMs = Date.now();
        setInlineReplyDraft({
          ...seed,
          id: `draft_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
          bodyText: snippetText,
          tripId: tripId || seed.tripId,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        });
      } else {
        const nowMs = Date.now();
        setModalComposeDraft({
          id: `draft_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
          mode: 'new',
          toEmail: senderContext.primaryEmail || '',
          toName: senderContext.contactName,
          subject: tripId ? `Chesterfield Taxi Update (${tripId})` : '',
          bodyText: snippetText,
          tripId,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        });
      }
    },
    [inlineReplyDraft, modalComposeDraft, selectedEmail, emailService, senderContext]
  );

  return (
    <div className="@container/emaildock relative flex flex-col h-full bg-surface-card text-fg-strong overflow-hidden select-none">
      {/* ─── TOP HEADER, SEARCH, FOLDER PILLS & BATCH ACTION BAR ─── */}
      <EmailFolderToolbar
        isDocked={isDocked}
        isPopout={isPopout}
        activeFolder={activeFolder}
        onSelectFolder={handleSelectFolder}
        counts={snapshot.counts}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        unreadOnly={unreadOnly}
        onToggleUnreadOnly={() => setUnreadOnly((prev) => !prev)}
        isSyncing={isSyncing}
        onSyncNow={() => void handleSyncNow()}
        onOpenNewCompose={handleOpenNewCompose}
        onPopOut={onPopOut}
        onClose={onClose}
        selectableCount={visibleEmails.length}
        selectedCount={selectedIds.size}
        isAllSelected={isAllSelected}
        onToggleSelectAll={handleToggleSelectAll}
        onClearSelection={() => setSelectedIds(new Set())}
        onBatchMarkRead={handleBatchMarkRead}
        onBatchMarkUnread={handleBatchMarkUnread}
        onBatchStar={handleBatchStar}
        onBatchArchive={() => handleBatchMove('archive')}
        onBatchRestoreToInbox={() => handleBatchMove('inbox')}
        onBatchTrash={() => handleBatchMove('trash')}
      />

      {/* ─── TOAST BANNER ─── */}
      {toast && (
        <div
          className={`px-3 py-1.5 text-xs font-bold flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150 ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {toast.tone === 'error' ? (
              <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CheckIcon className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── ADAPTIVE WORKSPACE BODY (`@container/emaildock` responsive split) ─── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* 1. LEFT MESSAGE / DRAFT LIST PANE */}
        <EmailMessageListPane
          activeFolder={activeFolder}
          emails={visibleEmails}
          drafts={visibleDrafts}
          selectedEmailId={selectedEmail?.id || null}
          activeDraftId={modalComposeDraft?.id || inlineReplyDraft?.id || null}
          selectedIds={selectedIds}
          getConversationCount={(em) => emailService.getConversationCount(em)}
          onSelectEmail={handleSelectEmail}
          onOpenDraft={handleOpenExistingDraft}
          onDiscardDraft={handleDiscardDraft}
          onToggleSelectId={handleToggleSelectId}
          onToggleRead={handleToggleRead}
          onToggleStar={handleToggleStar}
          onMoveToFolder={handleMoveToFolder}
          onPopulateBooking={handlePopulateBookingFromEmail}
          onQuickReply={(em) => handleStartReply('reply', em)}
          className={
            selectedEmail
              ? 'hidden @2xl/emaildock:block @2xl/emaildock:w-72 @5xl/emaildock:w-80 border-r border-border-subtle shrink-0 h-full'
              : 'flex-1 h-full'
          }
        />

        {/* 2. CENTER CONVERSATION READER + INLINE COMPOSER */}
        {selectedEmail ? (
          <EmailReaderPane
            selectedEmail={selectedEmail}
            conversationMessages={conversationMessages}
            senderContext={senderContext}
            isRailOpen={isRailOpen}
            onToggleRail={() => setIsRailOpen((prev) => !prev)}
            onBackToList={() => {
              setSelectedEmailId(null);
              setInlineReplyDraft(null);
            }}
            onToggleStar={handleToggleStar}
            onMarkUnread={handleMarkUnread}
            onMoveToFolder={handleMoveToFolder}
            onPopulateBooking={handlePopulateBookingFromEmail}
            onStartReply={handleStartReply}
            inlineComposerNode={
              inlineReplyDraft ? (
                <EmailComposerPane
                  key={inlineReplyDraft.id}
                  variant="inline"
                  initialDraft={inlineReplyDraft}
                  anchorEmail={selectedEmail}
                  matchedTrips={senderContext.matchedTrips}
                  pendingInsertion={pendingInsertion}
                  onConsumePendingInsertion={() => setPendingInsertion(null)}
                  onSent={({ emailRecord, simulated }) => {
                    setInlineReplyDraft(null);
                    showToast(
                      simulated
                        ? `Reply logged in simulation mode (${emailRecord.toEmail})`
                        : `Reply sent to ${emailRecord.toEmail}`,
                      'success'
                    );
                  }}
                  onClose={() => setInlineReplyDraft(null)}
                  onDiscarded={() => setInlineReplyDraft(null)}
                  onToast={showToast}
                />
              ) : undefined
            }
          />
        ) : (
          <div className="hidden @2xl/emaildock:flex flex-1 items-center justify-center p-8 text-center bg-surface-subtle/50">
            <div className="max-w-xs space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-surface-card border border-border-subtle shadow-2xs flex items-center justify-center mx-auto text-blue-600">
                <MailIcon className="w-6 h-6" />
              </div>
              <p className="font-extrabold text-fg-strong text-xs sm:text-sm">
                Select a conversation in {DISPATCH_MAILBOX_ADDRESS}
              </p>
              <p className="text-[11px] text-fg-muted leading-relaxed">
                Convert ride requests into Dispatch bookings in 1 click, send canned STL/SUS
                curbside instructions or Pay Links, and view the sender&apos;s live Call + SMS +
                Voicemail timeline.
              </p>
            </div>
          </div>
        )}

        {/* 3. RIGHT CROSS-CHANNEL SENDER TIMELINE & TRIPS RAIL */}
        {selectedEmail && isRailOpen && (
          <>
            {/* Backdrop on compact containers (< @5xl) so slide-over rail closes cleanly on outside tap */}
            <div
              onClick={() => setIsRailOpen(false)}
              className="@5xl/emaildock:hidden absolute inset-0 z-20 bg-surface-overlay/25 backdrop-blur-[1px]"
            />
            <EmailCrossChannelRail
              context={senderContext}
              onClose={() => setIsRailOpen(false)}
              onOpenEditTrip={onOpenEditTrip}
              onPopulateBookingPayload={handlePopulateBookingFromPayload}
              onInsertIntoComposer={handleInsertIntoComposer}
              onSelectEmailFromTimeline={(emailId) => {
                const target = emailService.getEmailById(emailId.replace(/^em_/, ''));
                if (target) handleSelectEmail(target);
              }}
              onToast={showToast}
              className="absolute right-0 top-0 bottom-0 z-30 w-80 max-w-[90%] shadow-2xl @5xl/emaildock:static @5xl/emaildock:z-auto @5xl/emaildock:w-80 @5xl/emaildock:max-w-none @5xl/emaildock:shadow-none shrink-0"
            />
          </>
        )}
      </div>

      {/* ─── STANDARDIZED FLOATING COMPOSE EMAIL BUTTON (Matches SMS Compose FAB) ─── */}
      {!modalComposeDraft && !inlineReplyDraft && (
        <button
          type="button"
          onClick={handleOpenNewCompose}
          className="absolute bottom-4 right-4 z-20 w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition-all cursor-pointer"
          title={`Compose new email from ${DISPATCH_MAILBOX_ADDRESS}`}
          aria-label="Compose New Email"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      )}

      {/* ─── BOTTOM-DOCKED COMPOSE PANE (Anchored inside EmailDock — never covers Dispatch) ─── */}
      {modalComposeDraft && (
        <EmailComposerPane
          key={modalComposeDraft.id}
          variant="dock"
          initialDraft={modalComposeDraft}
          matchedTrips={senderContext.matchedTrips}
          pendingInsertion={pendingInsertion}
          onConsumePendingInsertion={() => setPendingInsertion(null)}
          onSent={({ emailRecord, simulated }) => {
            setModalComposeDraft(null);
            showToast(
              simulated
                ? `Email logged in simulation mode (${emailRecord.toEmail})`
                : `Email delivered to ${emailRecord.toEmail}`,
              'success'
            );
          }}
          onClose={() => setModalComposeDraft(null)}
          onDiscarded={() => setModalComposeDraft(null)}
          onToast={showToast}
        />
      )}
    </div>
  );
}
