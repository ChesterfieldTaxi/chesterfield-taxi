import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getContactService,
  normalizeEmail,
  type ContactRecord,
} from '../../../../core/services/customer/contact.service';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import {
  CANNED_DISPATCH_EMAIL_TEMPLATES,
  appendOutboundEmailSignature,
  buildTripTrackingUrl,
  formatDispatchEmailTimestamp,
  getDispatchEmailService,
  interpolateDispatchEmailTemplate,
  normalizeDispatchEmailPolicy,
  type CannedDispatchTemplateId,
  type DispatchEmailDraft,
  type DispatchEmailTemplateContext,
} from '../../../../core/services/email/dispatch-email.service';
import { getPayLinkService } from '../../../../core/services/payments/pay-link.service';
import {
  DISPATCH_MAILBOX_ADDRESS,
  type DispatchEmailRecord,
} from '../../../../core/types/dispatch-email';
import type { Trip } from '../../../../core/types/trip';
import {
  BuildingIcon,
  CheckIcon,
  ChevronDownIcon,
  CreditCardIcon,
  LinkIcon,
  MailIcon,
  SparklesIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from '../../../ui/Icons';

export interface EmailComposerPaneProps {
  variant: 'inline' | 'dock' | 'modal';
  initialDraft: DispatchEmailDraft;
  anchorEmail?: DispatchEmailRecord | null;
  matchedTrips?: Trip[];
  pendingInsertion?: { id: string; text: string; tripId?: string } | null;
  onConsumePendingInsertion?: () => void;
  onSent: (result: { emailRecord: DispatchEmailRecord; simulated: boolean }) => void;
  onClose: () => void;
  onDiscarded: (draftId: string) => void;
  onToast?: (msg: string, tone?: 'success' | 'error') => void;
}

export function EmailComposerPane({
  variant,
  initialDraft,
  anchorEmail,
  matchedTrips = [],
  pendingInsertion,
  onConsumePendingInsertion,
  onSent,
  onClose,
  onDiscarded,
  onToast,
}: EmailComposerPaneProps) {
  const [draftId] = useState<string>(initialDraft.id);
  const [toEmail, setToEmail] = useState<string>(initialDraft.toEmail || '');
  const [toName, setToName] = useState<string>(initialDraft.toName || '');
  const [showCc, setShowCc] = useState<boolean>(
    Boolean(initialDraft.ccEmails && initialDraft.ccEmails.length > 0)
  );
  const [ccInput, setCcInput] = useState<string>((initialDraft.ccEmails || []).join(', '));
  const [subject, setSubject] = useState<string>(initialDraft.subject || '');
  const [bodyText, setBodyText] = useState<string>(initialDraft.bodyText || '');
  const [selectedTripId, setSelectedTripId] = useState<string>(
    initialDraft.tripId || matchedTrips[0]?.id || anchorEmail?.tripId || ''
  );
  const [contactPhone, setContactPhone] = useState<string | undefined>(initialDraft.contactPhone);
  const [corporateAccountNumber, setCorporateAccountNumber] = useState<string | undefined>(
    initialDraft.corporateAccountNumber || anchorEmail?.corporateAccountNumber
  );

  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState<boolean>(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [lastSavedAtMs, setLastSavedAtMs] = useState<number | null>(
    initialDraft.updatedAtMs || null
  );
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isGeneratingPayLink, setIsGeneratingPayLink] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const hasMountedRef = useRef<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync selectedTripId if matchedTrips updates and none was selected yet
  useEffect(() => {
    if (!selectedTripId && matchedTrips.length > 0) {
      setSelectedTripId(matchedTrips[0].id);
    }
  }, [matchedTrips, selectedTripId]);

  // Apply external link/snippet insertions triggered from `EmailCrossChannelRail`
  useEffect(() => {
    if (!pendingInsertion) return;
    setIsMinimized(false);
    setBodyText((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed}\n\n${pendingInsertion.text}` : pendingInsertion.text;
    });
    if (pendingInsertion.tripId) {
      setSelectedTripId(pendingInsertion.tripId);
    }
    onConsumePendingInsertion?.();
    textareaRef.current?.focus();
  }, [pendingInsertion, onConsumePendingInsertion]);

  const parsedCcList = useMemo(() => {
    return ccInput
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [ccInput]);

  // Debounced auto-save draft to `DispatchEmailService`
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    // Only auto-save if user has entered at least some recipient, subject, or body content
    const hasContent = Boolean(toEmail.trim() || subject.trim() || bodyText.trim());
    if (!hasContent) return;

    const timer = setTimeout(() => {
      const saved = getDispatchEmailService().saveDraft({
        id: draftId,
        mode: initialDraft.mode || 'new',
        toEmail: toEmail.trim(),
        toName: toName.trim() || undefined,
        ccEmails: parsedCcList.length > 0 ? parsedCcList : undefined,
        subject,
        bodyText,
        threadId: initialDraft.threadId,
        replyToEmailId: initialDraft.replyToEmailId,
        inReplyTo: initialDraft.inReplyTo,
        references: initialDraft.references,
        tripId: selectedTripId || undefined,
        contactId: initialDraft.contactId,
        contactPhone,
        corporateAccountNumber,
      });
      setLastSavedAtMs(saved.updatedAtMs);
    }, 350);

    return () => clearTimeout(timer);
  }, [
    draftId,
    initialDraft.mode,
    initialDraft.threadId,
    initialDraft.replyToEmailId,
    initialDraft.inReplyTo,
    initialDraft.references,
    initialDraft.contactId,
    toEmail,
    toName,
    parsedCcList,
    subject,
    bodyText,
    selectedTripId,
    contactPhone,
    corporateAccountNumber,
  ]);

  // ContactService `To` autocomplete candidates
  const contactSuggestions = useMemo((): ContactRecord[] => {
    const q = toEmail.trim().toLowerCase();
    const allContacts = getContactService()
      .getAllContacts()
      .filter((c) => Boolean(c.email || c.secondaryEmail));

    if (!q) {
      return allContacts.slice(0, 6);
    }
    return allContacts
      .filter((c) => {
        const em1 = (c.email || '').toLowerCase();
        const em2 = (c.secondaryEmail || '').toLowerCase();
        const nm = (c.name || '').toLowerCase();
        const ph = (c.phone || '').toLowerCase();
        const corp = (c.corporateAccountName || c.corporateAccountNumber || '').toLowerCase();
        return (
          em1.includes(q) ||
          em2.includes(q) ||
          nm.includes(q) ||
          ph.includes(q) ||
          corp.includes(q)
        );
      })
      .slice(0, 6);
  }, [toEmail]);

  const selectedTrip = useMemo(() => {
    return matchedTrips.find((t) => t.id === selectedTripId) || matchedTrips[0] || null;
  }, [matchedTrips, selectedTripId]);

  const buildTemplateInterpolationContext = useCallback(
    (overridePayUrl?: string): DispatchEmailTemplateContext => {
      const normTo = normalizeEmail(toEmail);
      const matchedContact = normTo ? getContactService().getContactByEmail(normTo) : null;

      const passengerFull =
        (selectedTrip
          ? `${selectedTrip.passenger?.firstName || ''} ${
              selectedTrip.passenger?.lastName || ''
            }`.trim()
          : '') ||
        anchorEmail?.suggestedBooking?.passengerName ||
        toName ||
        matchedContact?.name ||
        (anchorEmail?.direction === 'inbound' ? anchorEmail?.fromName : '') ||
        '';

      const firstName =
        selectedTrip?.passenger?.firstName ||
        matchedContact?.firstName ||
        (passengerFull ? passengerFull.split(/\s+/)[0] : undefined);

      const pickupAddress =
        selectedTrip?.pickupLocation?.address ||
        anchorEmail?.suggestedBooking?.pickupLocation ||
        anchorEmail?.suggestedBooking?.pickup;

      const dropoffAddress =
        selectedTrip?.dropoffLocation?.address ||
        anchorEmail?.suggestedBooking?.dropoffLocation ||
        anchorEmail?.suggestedBooking?.dropoff;

      const pickupTime = selectedTrip?.scheduledPickupTime
        ? new Date(selectedTrip.scheduledPickupTime).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : anchorEmail?.suggestedBooking?.pickupTime;

      const trackingUrl = selectedTrip ? buildTripTrackingUrl(selectedTrip) : undefined;
      const payLinkService = getPayLinkService();
      const cachedPayToken = payLinkService.getTripCachedPayToken(selectedTrip);
      const payUrl =
        overridePayUrl ||
        (cachedPayToken ? payLinkService.buildPayUrl(cachedPayToken) : undefined);

      const corporateAccount =
        corporateAccountNumber ||
        selectedTrip?.corporateAccountId ||
        matchedContact?.corporateAccountNumber ||
        matchedContact?.corporateAccountName;

      return {
        firstName,
        passengerName: passengerFull || undefined,
        tripId: selectedTrip?.id || selectedTripId || anchorEmail?.tripId,
        pickupAddress,
        dropoffAddress,
        pickupTime,
        trackingUrl,
        payUrl,
        corporateAccount,
      };
    },
    [toEmail, toName, selectedTrip, selectedTripId, anchorEmail, corporateAccountNumber]
  );

  const handleApplyTemplate = useCallback(
    async (templateId: CannedDispatchTemplateId) => {
      const tpl = CANNED_DISPATCH_EMAIL_TEMPLATES.find((t) => t.id === templateId);
      if (!tpl) return;

      let resolvedPayUrl: string | undefined;
      if (templateId === 'secure_payment_link' && selectedTrip) {
        const payService = getPayLinkService();
        const cached = payService.getTripCachedPayToken(selectedTrip);
        if (cached) {
          resolvedPayUrl = payService.buildPayUrl(cached);
        } else {
          setIsGeneratingPayLink(true);
          const created = await payService.createOrGetTripPayLink(selectedTrip, {
            sendSms: false,
            sendEmail: false,
          });
          setIsGeneratingPayLink(false);
          if (created.success && (created.payUrl || created.payToken)) {
            resolvedPayUrl =
              created.payUrl || payService.buildPayUrl(created.payToken as string);
          }
        }
      }

      const ctx = buildTemplateInterpolationContext(resolvedPayUrl);
      const rendered = interpolateDispatchEmailTemplate(tpl, ctx);
      const emailPolicy = normalizeDispatchEmailPolicy(
        getAdminConfigService().getCachedSettings().integrations?.dispatchEmail
      );

      const isReplyMode =
        initialDraft.mode === 'reply' || initialDraft.mode === 'reply_all';
      if (!isReplyMode || !subject.trim()) {
        setSubject(rendered.subject);
      }
      setBodyText(appendOutboundEmailSignature(rendered.bodyText, emailPolicy.outboundSignature));
      setSelectedTemplateId('');
      textareaRef.current?.focus();
    },
    [buildTemplateInterpolationContext, initialDraft.mode, selectedTrip, subject]
  );

  const appendSnippetToBody = useCallback((snippet: string) => {
    setBodyText((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed}\n\n${snippet}` : snippet;
    });
    textareaRef.current?.focus();
  }, []);

  const handleInsertTrackingLink = useCallback(() => {
    const url = selectedTrip
      ? buildTripTrackingUrl(selectedTrip)
      : `${
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://chesterfieldtaxi.com'
        }/booking/lookup`;
    const label = selectedTrip
      ? `Live Chauffeur Tracking (${selectedTrip.id}):\n${url}`
      : `Track Your Reservation:\n${url}`;
    appendSnippetToBody(label);
    onToast?.('Inserted live tracking link into message.', 'success');
  }, [selectedTrip, appendSnippetToBody, onToast]);

  const handleInsertPayLink = useCallback(async () => {
    const payService = getPayLinkService();
    if (!selectedTrip) {
      const fallbackUrl = `${
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://chesterfieldtaxi.com'
      }/pay`;
      appendSnippetToBody(`Secure 1-Tap Payment Link:\n${fallbackUrl}`);
      onToast?.('Inserted payment portal link (select an active trip for tokenized link).', 'success');
      return;
    }

    const cachedToken = payService.getTripCachedPayToken(selectedTrip);
    if (cachedToken) {
      const url = payService.buildPayUrl(cachedToken);
      appendSnippetToBody(`Secure 1-Tap Payment Link (${selectedTrip.id}):\n${url}`);
      onToast?.(`Inserted 1-tap Pay Link for ${selectedTrip.id}.`, 'success');
      return;
    }

    setIsGeneratingPayLink(true);
    const created = await payService.createOrGetTripPayLink(selectedTrip, {
      sendSms: false,
      sendEmail: false,
    });
    setIsGeneratingPayLink(false);

    if (created.success && (created.payUrl || created.payToken)) {
      const url = created.payUrl || payService.buildPayUrl(created.payToken as string);
      appendSnippetToBody(`Secure 1-Tap Payment Link (${selectedTrip.id}):\n${url}`);
      onToast?.(`Generated & inserted 1-tap Pay Link for ${selectedTrip.id}.`, 'success');
    } else {
      onToast?.(
        created.error || 'Unable to generate Pay Link right now.',
        'error'
      );
    }
  }, [selectedTrip, appendSnippetToBody, onToast]);

  const handleSelectContact = (contact: ContactRecord) => {
    const chosenEmail = normalizeEmail(contact.email) || normalizeEmail(contact.secondaryEmail) || '';
    setToEmail(chosenEmail);
    setToName(contact.name || '');
    setContactPhone(contact.phone || contact.mobilePhone || undefined);
    setCorporateAccountNumber(contact.corporateAccountNumber || contact.corporateAccountId);
    setIsAutocompleteOpen(false);
  };

  const handleSend = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    const res = await getDispatchEmailService().sendComposerEmail({
      draftId,
      toEmail,
      toName: toName || undefined,
      ccEmails: parsedCcList.length > 0 ? parsedCcList : undefined,
      subject,
      bodyText,
      threadId: initialDraft.threadId,
      inReplyTo: initialDraft.inReplyTo,
      references: initialDraft.references,
      tripId: selectedTripId || undefined,
      contactId: initialDraft.contactId,
      contactPhone,
      corporateAccountNumber,
    });
    setIsSending(false);

    if (!res.success || !res.emailRecord) {
      onToast?.(res.error || 'Failed to send email.', 'error');
      return;
    }

    onSent({
      emailRecord: res.emailRecord,
      simulated: Boolean(res.simulated),
    });
  }, [
    isSending,
    draftId,
    toEmail,
    toName,
    parsedCcList,
    subject,
    bodyText,
    initialDraft.threadId,
    initialDraft.inReplyTo,
    initialDraft.references,
    initialDraft.contactId,
    selectedTripId,
    contactPhone,
    corporateAccountNumber,
    onSent,
    onToast,
  ]);

  const handleDiscard = () => {
    getDispatchEmailService().discardDraft(draftId);
    onDiscarded(draftId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
    }
  };

  const modeLabel =
    initialDraft.mode === 'reply'
      ? 'Threaded Reply'
      : initialDraft.mode === 'reply_all'
      ? 'Reply All'
      : initialDraft.mode === 'forward'
      ? 'Forward Email'
      : 'New Dispatch Email';

  const isInline = variant === 'inline';
  const minimizedSummary =
    subject.trim() ||
    (toEmail.trim() ? `To: ${toEmail.trim()}` : modeLabel);

  const composerInner = (
    <div
      onKeyDown={handleKeyDown}
      className={
        isInline
          ? 'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden'
          : 'flex flex-col flex-1 min-h-0 overflow-hidden bg-white'
      }
    >
      {/* Header Bar */}
      <div
        onClick={!isInline ? () => setIsMinimized((prev) => !prev) : undefined}
        className={`px-3 py-2 flex items-center justify-between gap-2 shrink-0 ${
          !isInline
            ? 'bg-slate-900 text-white cursor-pointer hover:bg-slate-800/95 transition-colors'
            : 'bg-slate-50 border-b border-slate-200 text-slate-800'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <MailIcon
              className={`w-3.5 h-3.5 shrink-0 ${
                !isInline ? 'text-blue-400' : 'text-blue-600'
              }`}
            />
            <span className="text-xs font-extrabold truncate">
              {!isInline && isMinimized ? minimizedSummary : modeLabel}
            </span>
            {(!isMinimized || isInline) && (
              <span
                className={`hidden @md/emaildock:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded truncate ${
                  !isInline
                    ? 'bg-slate-800 text-slate-300'
                    : 'bg-white border border-slate-200 text-slate-500'
                }`}
              >
                {DISPATCH_MAILBOX_ADDRESS}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {lastSavedAtMs && (
            <span
              className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold mr-1 ${
                !isInline ? 'text-emerald-300' : 'text-emerald-700'
              }`}
            >
              <CheckIcon className="w-3 h-3" />
              <span>Saved {formatDispatchEmailTimestamp(lastSavedAtMs)}</span>
            </span>
          )}
          {!isInline && (
            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 cursor-pointer"
              title={isMinimized ? 'Expand compose pane' : 'Minimize to bottom bar'}
              aria-label={isMinimized ? 'Expand compose pane' : 'Minimize compose pane'}
            >
              <ChevronDownIcon
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isMinimized ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded-lg cursor-pointer ${
              !isInline
                ? 'text-slate-400 hover:text-white hover:bg-slate-700/80'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70'
            }`}
            title="Close & keep draft saved"
            aria-label="Close composer"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Form Fields & Footer (Collapsible when bottom-docked) */}
      {(isInline || !isMinimized) && (
        <>
          <div className="flex-1 min-h-0 p-2.5 space-y-2 overflow-y-auto">
            {/* To + Collapsible Cc */}
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 w-12 shrink-0">To:</span>
                <div className="relative flex-1 min-w-0">
                  <input
                    type="email"
                    value={toEmail}
                    onFocus={() => setIsAutocompleteOpen(true)}
                    onBlur={() => setTimeout(() => setIsAutocompleteOpen(false), 160)}
                    onChange={(e) => {
                      setToEmail(e.target.value);
                      setIsAutocompleteOpen(true);
                    }}
                    placeholder="passenger@company.com (type name or email...)"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  {isAutocompleteOpen && contactSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                      {contactSuggestions.map((c) => {
                        const displayEmail = c.email || c.secondaryEmail || '';
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectContact(c);
                            }}
                            className="w-full px-3 py-1.5 text-left hover:bg-blue-50/70 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {c.name}
                                </span>
                                {c.isVip && (
                                  <span className="text-[9px] font-black px-1 py-0.2 rounded bg-amber-100 text-amber-800">
                                    VIP
                                  </span>
                                )}
                                {c.corporateAccountName && (
                                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 inline-flex items-center gap-0.5 truncate max-w-[110px]">
                                    <BuildingIcon className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">{c.corporateAccountName}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-slate-500 truncate">
                                {displayEmail}
                              </p>
                            </div>
                            {c.phone && (
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                {c.phone}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
                  >
                    + Cc
                  </button>
                )}
              </div>
            </div>

            {showCc && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 w-12 shrink-0">Cc:</span>
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  placeholder="assistant@company.com, travel@company.com"
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCcInput('');
                    setShowCc(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Remove Cc"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 w-12 shrink-0">Subject:</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Reservation Confirmation / Airport Pickup Instructions"
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Smart Canned Templates + 1-Tap Tracking / Pay Link Toolbar */}
            <div className="flex items-center gap-1.5 flex-wrap bg-slate-50/90 p-1.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-1 min-w-[155px] flex-1 sm:flex-none">
                <SparklesIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const val = e.target.value as CannedDispatchTemplateId;
                    setSelectedTemplateId(val);
                    if (val) void handleApplyTemplate(val);
                  }}
                  className="w-full text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 cursor-pointer focus:outline-none focus:border-blue-500"
                  aria-label="Insert canned dispatch email template"
                >
                  <option value="">+ Canned Dispatch Template...</option>
                  {CANNED_DISPATCH_EMAIL_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.label}
                    </option>
                  ))}
                </select>
              </div>

              {matchedTrips.length > 0 && (
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="text-[11px] font-mono font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 cursor-pointer max-w-[150px]"
                  title="Linked customer trip for Tracking & Pay links"
                >
                  {matchedTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} ({t.status})
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={handleInsertTrackingLink}
                className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[11px] font-bold text-blue-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
                title="1-Tap Insert Live Chauffeur Tracking Link (/track/...)"
              >
                <LinkIcon className="w-3 h-3 shrink-0" />
                <span>Tracking Link</span>
              </button>

              <button
                type="button"
                onClick={() => void handleInsertPayLink()}
                disabled={isGeneratingPayLink}
                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold text-emerald-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                title="1-Tap Insert Tokenized Stripe Payment Link (/pay/...)"
              >
                {isGeneratingPayLink ? (
                  <SpinnerIcon className="w-3 h-3 animate-spin shrink-0" />
                ) : (
                  <CreditCardIcon className="w-3 h-3 shrink-0" />
                )}
                <span>Pay Link</span>
              </button>
            </div>

            {/* Message Body */}
            <textarea
              ref={textareaRef}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={isInline ? 6 : 4}
              placeholder="Write message or choose a Canned Dispatch Template above... (Ctrl/Cmd + Enter to send)"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
            />
          </div>

          {/* Footer Action Bar */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-[11px] font-bold text-slate-600 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer transition-colors"
                title="Discard draft permanently"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
              <span className="hidden @lg/emaildock:inline text-[10px] text-slate-400">
                Ctrl/Cmd + Enter to send
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
              >
                Save &amp; Close
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending || !toEmail.trim() || !subject.trim() || !bodyText.trim()}
                className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white text-xs font-extrabold shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isSending && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSending ? 'Sending...' : 'Send Email'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (isInline) {
    return composerInner;
  }

  return (
    <div
      className={`shrink-0 z-30 w-full @4xl/emaildock:max-w-2xl @4xl/emaildock:ml-auto @4xl/emaildock:mr-3 bg-white border-t-2 border-slate-900 @4xl/emaildock:border-x @4xl/emaildock:rounded-t-2xl shadow-[0_-8px_24px_rgba(15,23,42,0.12)] flex flex-col overflow-hidden ${
        isMinimized ? '' : 'max-h-[58%] @2xl/emaildock:max-h-[54%]'
      }`}
    >
      {composerInner}
    </div>
  );
}
