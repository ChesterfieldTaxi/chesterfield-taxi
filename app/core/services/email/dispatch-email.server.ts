/**
 * Server-Isolated Single-Mailbox Dispatch Email & Resend Outbound Gateway (`dispatch-email.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) — isolates `node:crypto`, outbound RFC Message-ID &
 * `In-Reply-To`/`References` threading, Resend dispatch, and server-side Firestore REST
 * ingestion, while re-exporting all Svix webhook verification & inbound webhook handlers from
 * `dispatch-email-webhook.server.ts` so both `app/routes/api.email.webhook.ts` and
 * `app/routes/api.send-email.ts` compile to `0.00 kB` client chunks.
 *
 * Strictly scoped to the single dispatch mailbox: `dispatch@chesterfieldtaxi.com`.
 */

import crypto from 'node:crypto';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import {
  DISPATCH_MAILBOX_DOMAIN,
  buildDeterministicRfcMessageId,
  buildDispatchEmailCommsEventId,
  normalizeRfcMessageId,
  parseRfcMessageIdList,
  type DispatchEmailCategory,
  type DispatchEmailDeliveryStatus,
  type DispatchEmailFolder,
  type DispatchEmailRecord,
} from '../../types/dispatch-email';
import {
  checkRateLimit,
  getRequestClientIp,
  verifyServerRequestAuth,
} from '../auth/server-auth.server';
import { ingestCommsEventServer } from '../comms/comms-thread.server';
import {
  getContactService,
  normalizeEmail,
  normalizePhoneE164,
} from '../customer/contact.service';
import {
  buildEmailSnippet,
  htmlToPlainText,
  normalizeEmailSubject,
  plainTextToSafeHtml,
  sanitizeDispatchEmailHtml,
} from './email-booking-parser';
import {
  escapeHtml,
  renderBookingDeclinedEmail,
  renderClarificationRequestEmail,
  renderCorporateInvoiceEmail,
  renderPassengerConfirmationEmail,
  renderStatusUpdateEmail,
  renderTripReceiptEmail,
} from './email-templates';
import { ResendEmailService } from './resend-email.service';
import type { EmailDispatchApiRequest, EmailDispatchResult } from './types';
import {
  DEFAULT_SVIX_TOLERANCE_SECONDS,
  findParentEmailByRfcHeaders,
  getDispatchEmailServerStore,
  makeEnvReader,
  persistDispatchEmailAndWebhook,
  resetDispatchEmailServerStoreForTests,
  resolveConfiguredDispatchMailbox,
  shouldEnforceStaffAuth,
  type DispatchEmailServerStore,
  type EmailHttpHandlerOptions,
} from './dispatch-email-store.server';
import {
  computeResendWebhookSignature,
  flushAndSyncDispatchEmailsServer,
  getDispatchEmailDiagnostics,
  handleEmailWebhookGet,
  handleEmailWebhookPost,
  verifyResendWebhookSignature,
  type ResendWebhookSignatureResult,
} from './dispatch-email-webhook.server';

export {
  DEFAULT_SVIX_TOLERANCE_SECONDS,
  computeResendWebhookSignature,
  flushAndSyncDispatchEmailsServer,
  getDispatchEmailDiagnostics,
  getDispatchEmailServerStore,
  handleEmailWebhookGet,
  handleEmailWebhookPost,
  resetDispatchEmailServerStoreForTests,
  verifyResendWebhookSignature,
};

export type {
  DispatchEmailServerStore,
  EmailHttpHandlerOptions,
  ResendWebhookSignatureResult,
};

// ─────────────────────────────────────────────────────────────────────────────
// Outbound `/api/send-email` Gateway + RFC Threading & Multi-Channel Sync
// ─────────────────────────────────────────────────────────────────────────────

const STRUCTURED_EMAIL_TYPES = new Set([
  'booking_confirmation',
  'dispatcher_alert',
  'status_update',
  'booking_declined',
  'clarification_request',
  'trip_receipt',
  'corporate_invoice',
  'contact_inquiry',
]);

const STAFF_ONLY_TYPES = new Set([
  'direct',
  'status_update',
  'booking_declined',
  'clarification_request',
  'corporate_invoice',
]);

const STAFF_OR_DRIVER_TYPES = new Set(['trip_receipt']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function generateOutboundEmailId(prefix: string, nowMs: number): string {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${nowMs}_${rand}`;
}

function buildOutboundRfcContext(params: {
  emailId: string;
  explicitThreadId?: string;
  explicitInReplyTo?: string;
  explicitReferences?: string[];
  recipientEmail: string;
}): {
  rfcMessageId: string;
  inReplyTo?: string;
  references: string[];
  parentEmail?: DispatchEmailRecord;
  headers: Record<string, string>;
} {
  const store = getDispatchEmailServerStore();
  const rfcMessageId = buildDeterministicRfcMessageId(params.emailId, DISPATCH_MAILBOX_DOMAIN);
  let inReplyTo = normalizeRfcMessageId(params.explicitInReplyTo) || undefined;
  const explicitRefs = parseRfcMessageIdList(params.explicitReferences);
  let parentEmail = findParentEmailByRfcHeaders(inReplyTo, explicitRefs);

  // If replying to an explicit `threadId` without `inReplyTo`, automatically chain to latest email in that thread
  if (!parentEmail && params.explicitThreadId) {
    const threadEmails = Array.from(store.emails.values())
      .filter((e) => e.threadId === params.explicitThreadId && e.rfcMessageId)
      .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
    if (threadEmails[0]) {
      parentEmail = threadEmails[0];
      if (!inReplyTo && parentEmail.rfcMessageId) {
        inReplyTo = normalizeRfcMessageId(parentEmail.rfcMessageId) || undefined;
      }
    }
  }

  const mergedRefs = Array.from(
    new Set(
      [
        ...(parentEmail?.references || []),
        ...(parentEmail?.rfcMessageId ? [normalizeRfcMessageId(parentEmail.rfcMessageId)] : []),
        ...explicitRefs,
        ...(inReplyTo ? [inReplyTo] : []),
      ].filter(Boolean)
    )
  );

  const headers: Record<string, string> = {
    'Message-ID': rfcMessageId,
  };
  if (inReplyTo) {
    headers['In-Reply-To'] = inReplyTo;
  }
  if (mergedRefs.length > 0) {
    headers.References = mergedRefs.join(' ');
  }

  return {
    rfcMessageId,
    inReplyTo,
    references: mergedRefs,
    parentEmail,
    headers,
  };
}

async function recordOutboundCustomerEmail(params: {
  emailId: string;
  resendResult: EmailDispatchResult;
  category: DispatchEmailCategory;
  folder: DispatchEmailFolder;
  configuredMailbox: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  rfcMessageId: string;
  inReplyTo?: string;
  references: string[];
  explicitThreadId?: string;
  parentThreadId?: string;
  contactName?: string;
  contactPhone?: string;
  tripId?: string;
  invoiceId?: string;
  corporateAccountNumber?: string;
  staffBearerToken?: string;
  actorId?: string;
  actorName?: string;
  nowMs: number;
  skipFirestore?: boolean;
}): Promise<{ emailRecord: DispatchEmailRecord; threadId: string; commsEventId: string }> {
  const nowIso = new Date(params.nowMs).toISOString();
  const normRecipient = normalizeEmail(params.recipientEmail) || params.recipientEmail.toLowerCase();
  const sanitizedHtmlBody = params.htmlBody
    ? sanitizeDispatchEmailHtml(params.htmlBody)
    : plainTextToSafeHtml(params.textBody);
  const cleanText = params.textBody.trim() || htmlToPlainText(params.htmlBody);
  const snippet = buildEmailSnippet(cleanText, params.htmlBody);

  const deliveryStatus: DispatchEmailDeliveryStatus = !params.resendResult.success
    ? 'failed'
    : params.resendResult.simulated
    ? 'simulated'
    : 'sent';

  const contactResolution = getContactService().resolveUnifiedContact({
    email: normRecipient,
    phone: params.contactPhone,
    name: params.contactName,
  });

  const targetThreadId =
    params.explicitThreadId || params.parentThreadId || contactResolution.threadId;

  const commsResult = await ingestCommsEventServer(
    {
      id: buildDispatchEmailCommsEventId(params.emailId),
      threadId: targetThreadId,
      channel: 'email',
      direction: 'outbound',
      eventType: 'email_outbound',
      contactId: contactResolution.contactId,
      contactName:
        params.contactName || contactResolution.contact?.name || contactResolution.contactName,
      contactPhone: normalizePhoneE164(params.contactPhone) || contactResolution.primaryPhone,
      contactEmail: normRecipient,
      fromAddress: params.configuredMailbox,
      toAddress: normRecipient,
      subject: params.subject,
      snippet: `${params.subject} — ${snippet}`.slice(0, 200),
      bodyText: cleanText,
      emailMessageId: params.emailId,
      tripId: params.tripId,
      deliveryStatus,
      errorMessage: params.resendResult.error,
      isUnread: false,
      actorId: params.actorId,
      actorName: params.actorName || `${COMPANY_CONFIG.name} Dispatch`,
      timestampIso: params.resendResult.dispatchedAt || nowIso,
      timestampMs: params.nowMs,
    },
    {
      staffBearerToken: params.staffBearerToken,
      skipFirestore: params.skipFirestore,
      nowMs: params.nowMs,
    }
  );

  const emailRecord: DispatchEmailRecord = {
    id: params.emailId,
    threadId: commsResult.thread.id,
    commsEventId: commsResult.event.id,
    ...(params.resendResult.messageId ? { resendEmailId: params.resendResult.messageId } : {}),
    rfcMessageId: params.rfcMessageId,
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo } : {}),
    references: params.references,
    normalizedSubject: normalizeEmailSubject(params.subject),
    direction: 'outbound',
    category: params.category,
    folder: params.folder,
    fromName: `${COMPANY_CONFIG.name} Dispatch`,
    fromEmail: params.configuredMailbox,
    toEmail: normRecipient,
    replyTo: params.configuredMailbox,
    subject: params.subject,
    textBody: cleanText,
    sanitizedHtmlBody,
    snippet,
    attachments: [],
    contactId: commsResult.event.contactId,
    contactPhone: commsResult.event.contactPhone,
    ...(params.tripId ? { tripId: params.tripId } : {}),
    ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
    ...(params.corporateAccountNumber
      ? { corporateAccountNumber: params.corporateAccountNumber }
      : {}),
    deliveryStatus,
    ...(params.resendResult.error ? { deliveryError: params.resendResult.error } : {}),
    isUnread: false,
    isStarred: false,
    createdAt: params.resendResult.dispatchedAt || nowIso,
    timestampMs: params.nowMs,
    updatedAt: nowIso,
  };

  await persistDispatchEmailAndWebhook({
    emailRecord,
    staffBearerToken: params.staffBearerToken,
    skipFirestore: params.skipFirestore,
  });

  return {
    emailRecord,
    threadId: emailRecord.threadId,
    commsEventId: emailRecord.commsEventId,
  };
}

async function recordWebsiteInquiryAsInboundEmail(params: {
  emailId: string;
  resendResult: EmailDispatchResult;
  configuredMailbox: string;
  visitorName: string;
  visitorEmailRaw: string;
  visitorPhoneRaw: string;
  tripId?: string;
  subject: string;
  htmlBody: string;
  messageText: string;
  staffBearerToken?: string;
  nowMs: number;
  skipFirestore?: boolean;
}): Promise<{ emailRecord: DispatchEmailRecord; threadId: string; commsEventId: string }> {
  const nowIso = new Date(params.nowMs).toISOString();
  const normVisitorEmail = normalizeEmail(params.visitorEmailRaw);
  const normVisitorPhone = normalizePhoneE164(params.visitorPhoneRaw);
  const effectiveFromEmail = normVisitorEmail || 'website-visitor@chesterfieldtaxi.com';
  const cleanName = params.visitorName.trim() || 'Website Visitor';
  const sanitizedHtmlBody = sanitizeDispatchEmailHtml(params.htmlBody);
  const snippet = buildEmailSnippet(params.messageText, params.htmlBody);

  const contactResolution = getContactService().resolveUnifiedContact({
    email: normVisitorEmail || undefined,
    phone: normVisitorPhone || undefined,
    name: cleanName,
  });

  const commsResult = await ingestCommsEventServer(
    {
      id: buildDispatchEmailCommsEventId(params.emailId),
      threadId: contactResolution.threadId,
      channel: 'email',
      direction: 'inbound',
      eventType: 'email_inbound',
      contactId: contactResolution.contactId,
      contactName: contactResolution.contact?.name || cleanName,
      contactPhone: normVisitorPhone || contactResolution.primaryPhone,
      contactEmail: normVisitorEmail || contactResolution.primaryEmail,
      fromAddress: normVisitorEmail || cleanName,
      toAddress: params.configuredMailbox,
      subject: params.subject,
      snippet: `${params.subject} — ${snippet}`.slice(0, 200),
      bodyText: params.messageText.trim(),
      emailMessageId: params.emailId,
      tripId: params.tripId,
      deliveryStatus: 'received',
      isUnread: true,
      timestampIso: nowIso,
      timestampMs: params.nowMs,
    },
    {
      staffBearerToken: params.staffBearerToken,
      skipFirestore: params.skipFirestore,
      nowMs: params.nowMs,
    }
  );

  const emailRecord: DispatchEmailRecord = {
    id: params.emailId,
    threadId: commsResult.thread.id,
    commsEventId: commsResult.event.id,
    ...(params.resendResult.messageId ? { resendEmailId: params.resendResult.messageId } : {}),
    rfcMessageId: buildDeterministicRfcMessageId(params.emailId, DISPATCH_MAILBOX_DOMAIN),
    references: [],
    normalizedSubject: normalizeEmailSubject(params.subject),
    direction: 'inbound',
    category: 'website_inquiry',
    folder: 'inquiries',
    fromName: cleanName,
    fromEmail: effectiveFromEmail,
    toEmail: params.configuredMailbox,
    replyTo: normVisitorEmail || params.configuredMailbox,
    subject: params.subject,
    textBody: params.messageText.trim(),
    sanitizedHtmlBody,
    snippet,
    attachments: [],
    contactId: commsResult.event.contactId,
    ...(normVisitorPhone || commsResult.event.contactPhone
      ? { contactPhone: normVisitorPhone || commsResult.event.contactPhone }
      : {}),
    ...(params.tripId ? { tripId: params.tripId } : {}),
    deliveryStatus: 'received',
    isUnread: true,
    isStarred: false,
    createdAt: nowIso,
    timestampMs: params.nowMs,
    updatedAt: nowIso,
  };

  await persistDispatchEmailAndWebhook({
    emailRecord,
    staffBearerToken: params.staffBearerToken,
    skipFirestore: params.skipFirestore,
  });

  return {
    emailRecord,
    threadId: emailRecord.threadId,
    commsEventId: emailRecord.commsEventId,
  };
}

export async function handleSendEmailPost(
  request: Request,
  options?: EmailHttpHandlerOptions
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  try {
    const body = (await request.json()) as EmailDispatchApiRequest;

    if (!body || !body.type) {
      return Response.json(
        { success: false, error: 'Malformed request: "type" is required.' },
        { status: 400 }
      );
    }

    const readEnv = makeEnvReader(options?.env);
    const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;
    const auth = await resolveAuth(request);
    const enforceAuth = shouldEnforceStaffAuth(options?.enforceAuth, readEnv);
    const clientIp = getRequestClientIp(request);
    const nowMs = options?.nowMs ?? Date.now();
    const configuredMailbox = resolveConfiguredDispatchMailbox(readEnv);
    const staffToken = auth.isDispatcher ? auth.rawToken : undefined;

    // Rate-limit public / non-staff email calls to block relay/spam abuse
    if (!auth.isDispatcher) {
      const allowed = checkRateLimit(`email_public:${clientIp}`, 12, 5 * 60_000);
      if (!allowed) {
        return Response.json(
          {
            success: false,
            error:
              'Rate limit exceeded. Please wait a few minutes before sending another email.',
          },
          { status: 429 }
        );
      }
    }

    // Staff-only types strictly require Dispatcher/Admin authentication
    if (STAFF_ONLY_TYPES.has(body.type)) {
      if (enforceAuth && !auth.isDispatcher) {
        return Response.json(
          {
            success: false,
            error: 'Unauthorized: Staff authentication is required for this email action.',
          },
          { status: 403 }
        );
      }
    }

    // Driver or Staff types (official post-trip receipts)
    if (STAFF_OR_DRIVER_TYPES.has(body.type)) {
      if (enforceAuth && !auth.isDispatcher && !auth.isDriver) {
        return Response.json(
          {
            success: false,
            error: 'Unauthorized: Driver or Staff authentication is required to send receipts.',
          },
          { status: 403 }
        );
      }
    }

    const emailService = new ResendEmailService({
      apiKey: readEnv('RESEND_API_KEY') || undefined,
      fromAddress: readEnv('RESEND_FROM_EMAIL') || readEnv('EMAIL_FROM') || undefined,
      adminAlertRecipient:
        readEnv('DISPATCH_ALERT_EMAIL') ||
        readEnv('ADMIN_ALERT_EMAIL') ||
        configuredMailbox,
      replyToAddress: configuredMailbox,
      fetchImpl: options?.fetchImpl,
    });

    // 1. Direct HTML/text email (`EmailDock` & Staff Replies/Compose)
    if (body.type === 'direct') {
      const p = (
        body.payload && typeof body.payload === 'object' ? body.payload : {}
      ) as Record<string, any>;
      const recipient = String(body.recipient || p.recipient || '').trim();
      const subject = String(body.subject || p.subject || '').trim();
      const html = String(body.html || p.html || '').trim();
      const text = String(body.text || p.text || '').trim() || htmlToPlainText(html);

      if (!recipient || !EMAIL_PATTERN.test(recipient) || !subject || !html) {
        return Response.json(
          {
            success: false,
            error: 'Direct email requires valid "recipient", "subject", and "html".',
          },
          { status: 400 }
        );
      }

      const emailId = generateOutboundEmailId('out', nowMs);
      const explicitThreadId = String(body.threadId || p.threadId || '').trim() || undefined;
      const explicitInReplyTo = String(body.inReplyTo || p.inReplyTo || '').trim() || undefined;
      const explicitReferences = Array.isArray(body.references)
        ? body.references
        : Array.isArray(p.references)
        ? p.references
        : undefined;

      const rfcCtx = buildOutboundRfcContext({
        emailId,
        explicitThreadId,
        explicitInReplyTo,
        explicitReferences,
        recipientEmail: recipient,
      });

      const result = await emailService.sendDirect({
        recipient,
        subject,
        html,
        text,
        replyTo: configuredMailbox,
        headers: rfcCtx.headers,
      });

      const synced = await recordOutboundCustomerEmail({
        emailId,
        resendResult: result,
        category: 'direct',
        folder: 'sent',
        configuredMailbox,
        recipientEmail: recipient,
        subject,
        htmlBody: html,
        textBody: text,
        rfcMessageId: rfcCtx.rfcMessageId,
        inReplyTo: rfcCtx.inReplyTo,
        references: rfcCtx.references,
        explicitThreadId,
        parentThreadId: rfcCtx.parentEmail?.threadId,
        contactName: String(body.contactName || p.contactName || '').trim() || undefined,
        contactPhone: String(body.contactPhone || p.contactPhone || '').trim() || undefined,
        tripId: String(body.tripId || p.tripId || rfcCtx.parentEmail?.tripId || '').trim() || undefined,
        invoiceId:
          String(body.invoiceId || p.invoiceId || rfcCtx.parentEmail?.invoiceId || '').trim() ||
          undefined,
        corporateAccountNumber:
          String(
            body.corporateAccountNumber ||
              p.corporateAccountNumber ||
              rfcCtx.parentEmail?.corporateAccountNumber ||
              ''
          ).trim() || undefined,
        staffBearerToken: staffToken,
        actorId: auth.uid,
        actorName: auth.email,
        nowMs,
        skipFirestore: options?.skipFirestore,
      });

      return Response.json({
        ...result,
        emailId: synced.emailRecord.id,
        threadId: synced.threadId,
        commsEventId: synced.commsEventId,
        rfcMessageId: rfcCtx.rfcMessageId,
      });
    }

    const isStructuredDispatch =
      STRUCTURED_EMAIL_TYPES.has(body.type) &&
      typeof body.payload === 'object' &&
      body.payload !== null &&
      Object.keys(body.payload).length > 0;

    if (!isStructuredDispatch) {
      return Response.json(
        {
          success: false,
          error: `Malformed request: valid "payload" is required for type "${body.type}".`,
        },
        { status: 400 }
      );
    }

    switch (body.type) {
      case 'booking_confirmation': {
        const rawPayload = { ...(body.payload as any) };
        const targetEmail = String(rawPayload?.passenger?.email || '').trim();
        if (!targetEmail || !EMAIL_PATTERN.test(targetEmail) || !rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId and passenger email are required.' },
            { status: 400 }
          );
        }

        if (!auth.isDispatcher) {
          delete rawPayload.recipientEmailOverride;
          delete rawPayload.companySettings;
        }

        const effectiveRecipient =
          String(rawPayload.recipientEmailOverride || '').trim() || targetEmail;
        const rendered = renderPassengerConfirmationEmail(rawPayload);
        const emailId = generateOutboundEmailId('out', nowMs);
        const rfcCtx = buildOutboundRfcContext({
          emailId,
          explicitThreadId: body.threadId,
          explicitInReplyTo: body.inReplyTo,
          explicitReferences: body.references,
          recipientEmail: effectiveRecipient,
        });

        const result = await emailService.sendBookingConfirmation(rawPayload, {
          replyTo: configuredMailbox,
          headers: rfcCtx.headers,
        });

        const passengerFullName = `${rawPayload.passenger?.firstName || ''} ${
          rawPayload.passenger?.lastName || ''
        }`.trim();

        const synced = await recordOutboundCustomerEmail({
          emailId,
          resendResult: result,
          category: 'booking_confirmation',
          folder: 'sent',
          configuredMailbox,
          recipientEmail: effectiveRecipient,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
          rfcMessageId: rfcCtx.rfcMessageId,
          inReplyTo: rfcCtx.inReplyTo,
          references: rfcCtx.references,
          explicitThreadId: body.threadId,
          parentThreadId: rfcCtx.parentEmail?.threadId,
          contactName: body.contactName || passengerFullName || undefined,
          contactPhone: body.contactPhone || rawPayload.passenger?.phone,
          tripId: String(rawPayload.tripId),
          staffBearerToken: staffToken,
          actorId: auth.uid,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: rfcCtx.rfcMessageId,
        });
      }

      case 'dispatcher_alert': {
        // Internal self-notification to operations team: send alert via Resend, NEVER pollute customer CommsThreads
        const rawPayload = { ...(body.payload as any) };
        if (!rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId is required for dispatch alert.' },
            { status: 400 }
          );
        }
        if (!auth.isDispatcher) {
          delete rawPayload.companySettings;
        }
        const result = await emailService.sendAdminDispatchAlert(rawPayload, {
          replyTo: configuredMailbox,
        });
        return Response.json(result);
      }

      case 'status_update': {
        const rawPayload = body.payload;
        const recipient = String(rawPayload?.passenger?.email || '').trim();
        if (!recipient || !EMAIL_PATTERN.test(recipient) || !rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId and passenger email are required.' },
            { status: 400 }
          );
        }

        const rendered = renderStatusUpdateEmail(rawPayload);
        const emailId = generateOutboundEmailId('out', nowMs);
        const rfcCtx = buildOutboundRfcContext({
          emailId,
          explicitThreadId: body.threadId,
          explicitInReplyTo: body.inReplyTo,
          explicitReferences: body.references,
          recipientEmail: recipient,
        });

        const result = await emailService.sendStatusUpdateNotification(rawPayload, {
          replyTo: configuredMailbox,
          headers: rfcCtx.headers,
        });

        const passengerFullName = `${rawPayload.passenger?.firstName || ''} ${
          rawPayload.passenger?.lastName || ''
        }`.trim();

        const synced = await recordOutboundCustomerEmail({
          emailId,
          resendResult: result,
          category: 'status_update',
          folder: 'sent',
          configuredMailbox,
          recipientEmail: recipient,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
          rfcMessageId: rfcCtx.rfcMessageId,
          inReplyTo: rfcCtx.inReplyTo,
          references: rfcCtx.references,
          explicitThreadId: body.threadId,
          parentThreadId: rfcCtx.parentEmail?.threadId,
          contactName: body.contactName || passengerFullName || undefined,
          contactPhone: body.contactPhone || rawPayload.passenger?.phone,
          tripId: String(rawPayload.tripId),
          staffBearerToken: staffToken,
          actorId: auth.uid,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: rfcCtx.rfcMessageId,
        });
      }

      case 'booking_declined': {
        const rawPayload = body.payload;
        const recipient = String(rawPayload?.passenger?.email || '').trim();
        if (!recipient || !EMAIL_PATTERN.test(recipient) || !rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId and passenger email are required.' },
            { status: 400 }
          );
        }

        const rendered = renderBookingDeclinedEmail(rawPayload);
        const emailId = generateOutboundEmailId('out', nowMs);
        const rfcCtx = buildOutboundRfcContext({
          emailId,
          explicitThreadId: body.threadId,
          explicitInReplyTo: body.inReplyTo,
          explicitReferences: body.references,
          recipientEmail: recipient,
        });

        const result = await emailService.sendBookingDeclined(rawPayload, {
          replyTo: configuredMailbox,
          headers: rfcCtx.headers,
        });

        const passengerFullName = `${rawPayload.passenger?.firstName || ''} ${
          rawPayload.passenger?.lastName || ''
        }`.trim();

        const synced = await recordOutboundCustomerEmail({
          emailId,
          resendResult: result,
          category: 'booking_declined',
          folder: 'sent',
          configuredMailbox,
          recipientEmail: recipient,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
          rfcMessageId: rfcCtx.rfcMessageId,
          inReplyTo: rfcCtx.inReplyTo,
          references: rfcCtx.references,
          explicitThreadId: body.threadId,
          parentThreadId: rfcCtx.parentEmail?.threadId,
          contactName: body.contactName || passengerFullName || undefined,
          contactPhone: body.contactPhone || rawPayload.passenger?.phone,
          tripId: String(rawPayload.tripId),
          staffBearerToken: staffToken,
          actorId: auth.uid,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: rfcCtx.rfcMessageId,
        });
      }

      case 'clarification_request': {
        const rawPayload = body.payload;
        const recipient = String(rawPayload?.passenger?.email || '').trim();
        if (!recipient || !EMAIL_PATTERN.test(recipient) || !rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId and passenger email are required.' },
            { status: 400 }
          );
        }

        const rendered = renderClarificationRequestEmail(rawPayload);
        const emailId = generateOutboundEmailId('out', nowMs);
        const rfcCtx = buildOutboundRfcContext({
          emailId,
          explicitThreadId: body.threadId,
          explicitInReplyTo: body.inReplyTo,
          explicitReferences: body.references,
          recipientEmail: recipient,
        });

        const result = await emailService.sendClarificationRequest(rawPayload, {
          replyTo: configuredMailbox,
          headers: rfcCtx.headers,
        });

        const passengerFullName = `${rawPayload.passenger?.firstName || ''} ${
          rawPayload.passenger?.lastName || ''
        }`.trim();

        const synced = await recordOutboundCustomerEmail({
          emailId,
          resendResult: result,
          category: 'clarification_request',
          folder: 'sent',
          configuredMailbox,
          recipientEmail: recipient,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
          rfcMessageId: rfcCtx.rfcMessageId,
          inReplyTo: rfcCtx.inReplyTo,
          references: rfcCtx.references,
          explicitThreadId: body.threadId,
          parentThreadId: rfcCtx.parentEmail?.threadId,
          contactName: body.contactName || passengerFullName || undefined,
          contactPhone: body.contactPhone || rawPayload.passenger?.phone,
          tripId: String(rawPayload.tripId),
          staffBearerToken: staffToken,
          actorId: auth.uid,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: rfcCtx.rfcMessageId,
        });
      }

      case 'trip_receipt': {
        const rawPayload = body.payload;
        const targetEmail = String(rawPayload?.passenger?.email || '').trim();
        if (!targetEmail || !EMAIL_PATTERN.test(targetEmail) || !rawPayload?.tripId) {
          return Response.json(
            {
              success: false,
              error: 'Valid tripId and passenger email are required for receipt.',
            },
            { status: 400 }
          );
        }

        const rendered = renderTripReceiptEmail(rawPayload);
        const emailId = generateOutboundEmailId('rcpt', nowMs);
        const rfcCtx = buildOutboundRfcContext({
          emailId,
          explicitThreadId: body.threadId,
          explicitInReplyTo: body.inReplyTo,
          explicitReferences: body.references,
          recipientEmail: targetEmail,
        });

        const result = await emailService.sendTripReceipt(rawPayload, {
          replyTo: configuredMailbox,
          headers: rfcCtx.headers,
        });

        const passengerFullName = `${rawPayload.passenger?.firstName || ''} ${
          rawPayload.passenger?.lastName || ''
        }`.trim();

        const synced = await recordOutboundCustomerEmail({
          emailId,
          resendResult: result,
          category: 'trip_receipt',
          folder: 'receipts',
          configuredMailbox,
          recipientEmail: targetEmail,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
          rfcMessageId: rfcCtx.rfcMessageId,
          inReplyTo: rfcCtx.inReplyTo,
          references: rfcCtx.references,
          explicitThreadId: body.threadId,
          parentThreadId: rfcCtx.parentEmail?.threadId,
          contactName: body.contactName || passengerFullName || undefined,
          contactPhone: body.contactPhone || rawPayload.passenger?.phone,
          tripId: String(rawPayload.tripId),
          corporateAccountNumber: body.corporateAccountNumber || rawPayload.poNumber,
          staffBearerToken: staffToken,
          actorId: auth.uid,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: rfcCtx.rfcMessageId,
        });
      }

      case 'corporate_invoice': {
        const rawPayload = body.payload;
        const targetEmail = String(rawPayload?.customerEmail || '').trim();
        if (!targetEmail || !EMAIL_PATTERN.test(targetEmail) || !rawPayload?.invoiceNumber) {
          return Response.json(
            {
              success: false,
              error: 'Valid customerEmail and invoiceNumber are required.',
            },
            { status: 400 }
          );
        }

        const rendered = renderCorporateInvoiceEmail(rawPayload);
        const emailId = generateOutboundEmailId('inv', nowMs);
        const rfcCtx = buildOutboundRfcContext({
          emailId,
          explicitThreadId: body.threadId,
          explicitInReplyTo: body.inReplyTo,
          explicitReferences: body.references,
          recipientEmail: targetEmail,
        });

        const result = await emailService.sendCorporateInvoice(rawPayload, {
          replyTo: configuredMailbox,
          headers: rfcCtx.headers,
        });

        const synced = await recordOutboundCustomerEmail({
          emailId,
          resendResult: result,
          category: 'corporate_invoice',
          folder: 'receipts',
          configuredMailbox,
          recipientEmail: targetEmail,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
          rfcMessageId: rfcCtx.rfcMessageId,
          inReplyTo: rfcCtx.inReplyTo,
          references: rfcCtx.references,
          explicitThreadId: body.threadId,
          parentThreadId: rfcCtx.parentEmail?.threadId,
          contactName: body.contactName || rawPayload.customerName,
          contactPhone: body.contactPhone,
          invoiceId: String(rawPayload.invoiceId || rawPayload.invoiceNumber),
          corporateAccountNumber: body.corporateAccountNumber || rawPayload.accountNumber,
          staffBearerToken: staffToken,
          actorId: auth.uid,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: rfcCtx.rfcMessageId,
        });
      }

      case 'contact_inquiry': {
        const p = body.payload as Record<string, any>;
        const rawVisitorName = String(p.name || 'Website Visitor').trim();
        const rawVisitorEmail = String(p.email || '').trim();
        const rawVisitorPhone = String(p.phone || '').trim();
        const rawSubjectCategory = String(p.subject || 'General Inquiry').trim();
        const rawTripRef = String(p.tripId || '').trim();
        const rawMessage = String(p.message || '').trim();

        if (!rawMessage) {
          return Response.json(
            { success: false, error: 'Message body is required for contact inquiry.' },
            { status: 400 }
          );
        }

        const safeName = escapeHtml(rawVisitorName || 'Website Visitor');
        const safeEmail = escapeHtml(rawVisitorEmail || 'Not provided');
        const safePhone = escapeHtml(rawVisitorPhone || 'Not provided');
        const safeCategory = escapeHtml(rawSubjectCategory || 'General Inquiry');
        const safeTripRef = escapeHtml(rawTripRef || 'N/A');
        const safeMessage = escapeHtml(rawMessage);

        const renderedSubject = `[Website Inquiry - ${rawSubjectCategory}] From ${rawVisitorName}`;
        const renderedHtml = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="margin:0 0 16px;color:#0f172a;">New ${escapeHtml(COMPANY_CONFIG.name)} Website Inquiry</h2>
          <p style="margin:4px 0;"><strong>Category:</strong> ${safeCategory}</p>
          <p style="margin:4px 0;"><strong>Name:</strong> ${safeName}</p>
          <p style="margin:4px 0;"><strong>Phone:</strong> ${safePhone}</p>
          <p style="margin:4px 0;"><strong>Email:</strong> ${safeEmail}</p>
          <p style="margin:4px 0;"><strong>Trip Reference:</strong> ${safeTripRef}</p>
          <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;" />
          <p style="white-space:pre-wrap;color:#334155;">${safeMessage}</p>
        </div>`;
        const renderedText = `New Website Inquiry (${rawSubjectCategory})\nName: ${rawVisitorName}\nPhone: ${
          rawVisitorPhone || 'Not provided'
        }\nEmail: ${rawVisitorEmail || 'Not provided'}\nTrip Ref: ${
          rawTripRef || 'N/A'
        }\n\n${rawMessage}`;

        const emailId = generateOutboundEmailId('inq', nowMs);
        const normVisitorEmail = normalizeEmail(rawVisitorEmail);

        const result = await emailService.sendDirect({
          recipient: configuredMailbox,
          subject: renderedSubject,
          html: renderedHtml,
          text: renderedText,
          replyTo: normVisitorEmail || configuredMailbox,
          headers: {
            'Message-ID': buildDeterministicRfcMessageId(emailId, DISPATCH_MAILBOX_DOMAIN),
          },
        });

        const cleanTripId =
          rawTripRef && rawTripRef.toUpperCase() !== 'N/A' ? rawTripRef : undefined;

        const synced = await recordWebsiteInquiryAsInboundEmail({
          emailId,
          resendResult: result,
          configuredMailbox,
          visitorName: rawVisitorName,
          visitorEmailRaw: rawVisitorEmail,
          visitorPhoneRaw: rawVisitorPhone,
          tripId: cleanTripId,
          subject: renderedSubject,
          htmlBody: renderedHtml,
          messageText: rawMessage,
          staffBearerToken: staffToken,
          nowMs,
          skipFirestore: options?.skipFirestore,
        });

        return Response.json({
          ...result,
          emailId: synced.emailRecord.id,
          threadId: synced.threadId,
          commsEventId: synced.commsEventId,
          rfcMessageId: synced.emailRecord.rfcMessageId,
        });
      }

      default:
        return Response.json(
          {
            success: false,
            error: `Unsupported dispatch type: ${(body as { type: string }).type}`,
          },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.send-email] Server action caught error:', errorMessage);
    return Response.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function handleSendEmailGet(options?: EmailHttpHandlerOptions): Promise<Response> {
  const readEnv = makeEnvReader(options?.env);
  const apiKey = readEnv('RESEND_API_KEY');
  const fromEmail = readEnv('RESEND_FROM_EMAIL') || readEnv('EMAIL_FROM');
  const mailboxAddress = resolveConfiguredDispatchMailbox(readEnv);

  return Response.json({
    status: 'healthy',
    service: 'Chesterfield Taxi Email Dispatch Service',
    mailboxAddress,
    configured: Boolean(apiKey),
    customDomainConfigured: Boolean(fromEmail && !fromEmail.includes('onboarding@resend.dev')),
    timestamp: new Date(options?.nowMs ?? Date.now()).toISOString(),
  });
}
