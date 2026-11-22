import React, { useEffect, useMemo, useState } from 'react';
import { resolveStlTerminalInfo } from '../../../../core/config/airports';
import {
  DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG,
  formatDispatchEmailTimestamp,
  type SenderCrossChannelContext,
} from '../../../../core/services/email/dispatch-email.service';
import {
  extractSuggestedBookingFromEmail,
  plainTextToSafeHtml,
  sanitizeDispatchEmailHtml,
} from '../../../../core/services/email/email-booking-parser';
import type { DispatchEmailRecord } from '../../../../core/types/dispatch-email';
import {
  AlertCircleIcon,
  BuildingIcon,
  CarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  MailIcon,
  MapPinIcon,
  PlaneIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
} from '../../../ui/Icons';

export interface EmailReaderPaneProps {
  selectedEmail: DispatchEmailRecord;
  conversationMessages: DispatchEmailRecord[];
  senderContext: SenderCrossChannelContext;
  isRailOpen: boolean;
  onToggleRail: () => void;
  onBackToList: () => void;
  onToggleStar: (emailId: string) => void;
  onMarkUnread: (emailId: string) => void;
  onMoveToFolder: (emailId: string, folder: 'inbox' | 'archive' | 'trash') => void;
  onPopulateBooking: (email: DispatchEmailRecord) => void;
  onStartReply: (mode: 'reply' | 'reply_all' | 'forward', targetEmail: DispatchEmailRecord) => void;
  inlineComposerNode?: React.ReactNode;
}

const DELIVERY_TONE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatAttachmentBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailReaderPane({
  selectedEmail,
  conversationMessages,
  senderContext,
  isRailOpen,
  onToggleRail,
  onBackToList,
  onToggleStar,
  onMarkUnread,
  onMoveToFolder,
  onPopulateBooking,
  onStartReply,
  inlineComposerNode,
}: EmailReaderPaneProps) {
  const latestMessage =
    conversationMessages[conversationMessages.length - 1] || selectedEmail;

  // Older messages collapse to 1-line headers by default; latest message stays expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set([latestMessage.id, selectedEmail.id])
  );

  useEffect(() => {
    const newest = conversationMessages[conversationMessages.length - 1] || selectedEmail;
    setExpandedIds(new Set([newest.id]));
  }, [selectedEmail.id, conversationMessages.length]);

  const toggleMessageExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Find any bounced/failed message in the active thread for prominent operational alerting
  const bouncedOrFailedMessage = useMemo(() => {
    return [...conversationMessages]
      .reverse()
      .find(
        (m) =>
          m.deliveryStatus === 'bounced' ||
          m.deliveryStatus === 'failed' ||
          m.deliveryStatus === 'complained'
      );
  }, [conversationMessages]);

  // Resolve structured booking card from latest inbound booking email in thread (or selectedEmail)
  const bookingSourceEmail = useMemo(() => {
    if (selectedEmail.suggestedBooking) return selectedEmail;
    return (
      [...conversationMessages].reverse().find((m) => Boolean(m.suggestedBooking)) ||
      selectedEmail
    );
  }, [selectedEmail, conversationMessages]);

  const extractedBookingMeta = useMemo(() => {
    return extractSuggestedBookingFromEmail({
      subject: bookingSourceEmail.subject,
      textBody: bookingSourceEmail.textBody,
      htmlBody: bookingSourceEmail.sanitizedHtmlBody,
      fromName: bookingSourceEmail.fromName,
      fromEmail: bookingSourceEmail.replyTo || bookingSourceEmail.fromEmail,
    });
  }, [bookingSourceEmail]);

  const hasStructuredBooking = Boolean(
    bookingSourceEmail.suggestedBooking ||
      (extractedBookingMeta.pickupLocation && extractedBookingMeta.dropoffLocation)
  );

  const terminalInfo = useMemo(() => {
    if (!extractedBookingMeta.isAirportTrip) return null;
    return resolveStlTerminalInfo(
      extractedBookingMeta.airlineCode || extractedBookingMeta.pickupLocation,
      extractedBookingMeta.airportCode
    );
  }, [extractedBookingMeta]);

  const timelineBadgeCount =
    senderContext.timelineEvents.length + senderContext.activeTrips.length;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-white overflow-hidden">
      {/* ─── READER TOP BAR ─── */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/90 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onBackToList}
              className="@2xl/emaildock:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0 shadow-2xs"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleStar(selectedEmail.id)}
              className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                selectedEmail.isStarred
                  ? 'text-amber-500 hover:bg-amber-50'
                  : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
              }`}
              title={selectedEmail.isStarred ? 'Remove star' : 'Star conversation'}
            >
              <StarIcon
                className="w-4 h-4"
                fill={selectedEmail.isStarred ? 'currentColor' : 'none'}
              />
            </button>

            <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
              {selectedEmail.subject || '(No Subject)'}
            </h3>

            {conversationMessages.length > 1 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-700 shrink-0">
                {conversationMessages.length} msgs
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleRail}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 cursor-pointer transition-colors ${
                isRailOpen
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title="Toggle Unified Customer Activity & Trips panel"
            >
              <UserIcon className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Activity &amp; Trips</span>
              {timelineBadgeCount > 0 && (
                <span
                  className={`text-[9.5px] font-black px-1 rounded-full ${
                    isRailOpen ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {timelineBadgeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onMarkUnread(selectedEmail.id)}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
              title="Mark as Unread"
              aria-label="Mark as Unread"
            >
              <MailIcon className="w-3.5 h-3.5" />
            </button>

            {selectedEmail.folder === 'archive' || selectedEmail.folder === 'trash' ? (
              <button
                type="button"
                onClick={() => onMoveToFolder(selectedEmail.id, 'inbox')}
                className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer"
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onMoveToFolder(selectedEmail.id, 'archive')}
                className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-bold cursor-pointer"
                title="Archive email"
              >
                Archive
              </button>
            )}

            {selectedEmail.folder !== 'trash' && (
              <button
                type="button"
                onClick={() => onMoveToFolder(selectedEmail.id, 'trash')}
                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 cursor-pointer"
                title="Move to Trash"
                aria-label="Move to Trash"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── SCROLLABLE THREADED CONVERSATION STREAM ─── */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-50/40">
        {/* 1. BOUNCE / DELIVERY FAILURE ALERT BANNER */}
        {bouncedOrFailedMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5 shadow-2xs">
            <AlertCircleIcon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-xs space-y-0.5">
              <p className="font-extrabold text-rose-900">
                Email Delivery {bouncedOrFailedMessage.deliveryStatus.toUpperCase()} —{' '}
                {bouncedOrFailedMessage.toEmail}
              </p>
              <p className="text-[11px] text-rose-700">
                {bouncedOrFailedMessage.deliveryError ||
                  'The recipient mail server rejected or failed to accept this message. Follow up via Phone or SMS in the Customer Activity panel.'}
              </p>
            </div>
          </div>
        )}

        {/* 2. EXTRACTED RIDE RESERVATION CARD (1-Click `POPULATE_BOOKING`) */}
        {hasStructuredBooking && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-white to-blue-50/60 border border-emerald-200 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CarIcon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block leading-tight">
                    Extracted Dispatch Booking Intelligence
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Deterministic parser ready to populate Dispatch Console
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onPopulateBooking(bookingSourceEmail)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shrink-0"
              >
                <CarIcon className="w-3.5 h-3.5" />
                <span>Populate Dispatch Booking</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-white/85 rounded-xl p-2.5 border border-slate-200/80">
              <div className="flex items-start gap-1.5 min-w-0">
                <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Passenger &amp; Contact
                  </span>
                  <span className="font-bold text-slate-900 block truncate">
                    {bookingSourceEmail.suggestedBooking?.passengerName ||
                      extractedBookingMeta.passengerName ||
                      bookingSourceEmail.fromName}
                  </span>
                  <span className="font-mono text-[10.5px] text-slate-600 block truncate">
                    {bookingSourceEmail.suggestedBooking?.passengerPhone ||
                      extractedBookingMeta.passengerPhone ||
                      'Phone not specified'}{' '}
                    ·{' '}
                    {bookingSourceEmail.suggestedBooking?.passengerEmail ||
                      extractedBookingMeta.passengerEmail ||
                      bookingSourceEmail.fromEmail}
                  </span>
                </div>
              </div>

              {(bookingSourceEmail.suggestedBooking?.pickupTime ||
                extractedBookingMeta.pickupTime ||
                extractedBookingMeta.flightIdent ||
                bookingSourceEmail.corporateAccountNumber ||
                extractedBookingMeta.corporateAccountNumber) && (
                <div className="flex items-start gap-1.5 min-w-0">
                  <ClockIcon className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Schedule, Flight &amp; Billing
                    </span>
                    {(bookingSourceEmail.suggestedBooking?.pickupTime ||
                      extractedBookingMeta.pickupTime) && (
                      <span className="font-bold text-slate-900 block">
                        {bookingSourceEmail.suggestedBooking?.pickupTime ||
                          extractedBookingMeta.pickupTime}
                      </span>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      {extractedBookingMeta.flightIdent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-50 text-sky-800 border border-sky-200">
                          <PlaneIcon className="w-3 h-3" />
                          <span>
                            {extractedBookingMeta.flightIdent}
                            {terminalInfo?.shortTerminal
                              ? ` · ${terminalInfo.shortTerminal}`
                              : ''}
                          </span>
                        </span>
                      )}
                      {(bookingSourceEmail.corporateAccountNumber ||
                        extractedBookingMeta.corporateAccountNumber) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          <BuildingIcon className="w-3 h-3" />
                          <span>
                            {bookingSourceEmail.corporateAccountNumber ||
                              extractedBookingMeta.corporateAccountNumber}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div className="flex items-start gap-1.5 min-w-0">
                  <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Pickup Location
                    </span>
                    <span className="font-semibold text-slate-800 break-words">
                      {bookingSourceEmail.suggestedBooking?.pickupLocation ||
                        bookingSourceEmail.suggestedBooking?.pickup ||
                        extractedBookingMeta.pickupLocation ||
                        'Not specified'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-1.5 min-w-0">
                  <MapPinIcon className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Dropoff Destination
                    </span>
                    <span className="font-semibold text-slate-800 break-words">
                      {bookingSourceEmail.suggestedBooking?.dropoffLocation ||
                        bookingSourceEmail.suggestedBooking?.dropoff ||
                        extractedBookingMeta.dropoffLocation ||
                        'Not specified'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. CHRONOLOGICAL CONVERSATION MESSAGES */}
        <div className="space-y-2.5">
          {conversationMessages.map((msg, idx) => {
            const isLatest = idx === conversationMessages.length - 1;
            const isExpanded = expandedIds.has(msg.id) || conversationMessages.length === 1;
            const deliveryCfg = DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG[msg.deliveryStatus];
            const safeHtml = sanitizeDispatchEmailHtml(
              msg.sanitizedHtmlBody || plainTextToSafeHtml(msg.textBody)
            );

            // Collapsed 1-line header for older messages in conversation
            if (!isExpanded) {
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => toggleMessageExpanded(msg.id)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-extrabold text-slate-800 shrink-0">
                      {msg.direction === 'outbound'
                        ? 'Chesterfield Dispatch'
                        : msg.fromName || msg.fromEmail}
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">
                      — {msg.snippet || msg.textBody}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {msg.direction === 'outbound' && deliveryCfg && (
                      <span
                        className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border ${
                          DELIVERY_TONE_CLASSES[deliveryCfg.tone] ||
                          DELIVERY_TONE_CLASSES.slate
                        }`}
                      >
                        {deliveryCfg.label}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {formatDispatchEmailTimestamp(msg.timestampMs, msg.createdAt)}
                    </span>
                  </div>
                </button>
              );
            }

            return (
              <article
                key={msg.id}
                className={`rounded-2xl bg-white border shadow-2xs overflow-hidden ${
                  isLatest ? 'border-slate-300' : 'border-slate-200'
                }`}
              >
                {/* Message Header */}
                <div
                  onClick={() => {
                    if (conversationMessages.length > 1) {
                      toggleMessageExpanded(msg.id);
                    }
                  }}
                  className={`px-3.5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-start justify-between gap-2 ${
                    conversationMessages.length > 1 ? 'cursor-pointer hover:bg-slate-100/70' : ''
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conversationMessages.length > 1 && (
                        <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-extrabold text-slate-900">
                        {msg.fromName || msg.fromEmail}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 truncate">
                        &lt;{msg.fromEmail}&gt;
                      </span>
                      {msg.direction === 'outbound' && deliveryCfg && (
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-full border ${
                            DELIVERY_TONE_CLASSES[deliveryCfg.tone] ||
                            DELIVERY_TONE_CLASSES.slate
                          }`}
                        >
                          {deliveryCfg.label}
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-slate-500 flex flex-wrap items-center gap-x-2">
                      <span>
                        To: <span className="font-mono text-slate-600">{msg.toEmail}</span>
                      </span>
                      {msg.ccEmails && msg.ccEmails.length > 0 && (
                        <span>
                          Cc:{' '}
                          <span className="font-mono text-slate-600">
                            {msg.ccEmails.join(', ')}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10.5px] text-slate-400 font-medium shrink-0">
                    {formatDispatchEmailTimestamp(msg.timestampMs, msg.createdAt)}
                  </span>
                </div>

                {/* Attachments Strip */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="px-3.5 py-2 bg-slate-50/40 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
                    {msg.attachments.map((att) => {
                      const sizeLabel = formatAttachmentBytes(att.sizeBytes);
                      const chipBody = (
                        <>
                          <span className="font-bold text-slate-800 truncate max-w-[180px]">
                            {att.filename}
                          </span>
                          {sizeLabel && (
                            <span className="text-slate-400 font-mono">({sizeLabel})</span>
                          )}
                          {att.downloadUrl && (
                            <ExternalLinkIcon className="w-3 h-3 text-blue-600 shrink-0" />
                          )}
                        </>
                      );
                      return att.downloadUrl ? (
                        <a
                          key={att.id || att.filename}
                          href={att.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-300 text-[11px] shadow-2xs"
                        >
                          {chipBody}
                        </a>
                      ) : (
                        <span
                          key={att.id || att.filename}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px]"
                        >
                          {chipBody}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Safe Sanitized HTML Email Body */}
                <div
                  className="p-4 text-xs sm:text-[13px] text-slate-800 leading-relaxed overflow-x-auto select-text [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_p]:mb-2 last:[&_p]:mb-0"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />
              </article>
            );
          })}
        </div>

        {/* 4. THREAD REPLY / REPLY ALL / FORWARD TRIGGERS OR INLINE COMPOSER */}
        {inlineComposerNode ? (
          <div className="pt-1">{inlineComposerNode}</div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => onStartReply('reply', latestMessage)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-2xs cursor-pointer transition-colors"
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => onStartReply('reply_all', latestMessage)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Reply All
            </button>
            <button
              type="button"
              onClick={() => onStartReply('forward', latestMessage)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Forward
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
