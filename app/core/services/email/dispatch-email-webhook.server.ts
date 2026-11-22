/**
 * Server-Isolated Svix HMAC Verification & Resend Webhook Engine (`dispatch-email-webhook.server.ts`)
 *
 * Extracted from `dispatch-email.server.ts` (Phase 47):
 * - Svix HMAC-SHA256 cryptographic signature verification (`computeResendWebhookSignature`,
 *   `verifyResendWebhookSignature`)
 * - Resend Receiving API fetch & inbound `email.received` ingestion (`dispatch@chesterfieldtaxi.com`)
 * - Outbound delivery status reconciliation (`email.sent`, `email.delivered`, `email.bounced`,
 *   `email.complained`, `email.delivery_delayed`, `email.failed`)
 * - Staff diagnostics & `sync_emails` server/Firestore flush (`handleEmailWebhookGet`,
 *   `handleEmailWebhookPost`)
 */

import crypto from 'node:crypto';
import {
  SUBSCRIBED_RESEND_WEBHOOK_EVENTS,
  buildDispatchEmailCommsEventId,
  normalizeRfcMessageId,
  parseRfcMessageIdList,
  sanitizeDispatchEmailId,
  type DispatchEmailAttachmentMeta,
  type DispatchEmailDeliveryStatus,
  type DispatchEmailDiagnosticsSummary,
  type DispatchEmailRecord,
  type EmailWebhookEventRecord,
} from '../../types/dispatch-email';
import {
  fetchFirestoreDocumentRest,
  verifyServerRequestAuth,
  type VerifiedServerAuth,
} from '../auth/server-auth.server';
import {
  flushAndSyncCommsServer,
  getCommsServerStore,
  ingestCommsEventServer,
} from '../comms/comms-thread.server';
import {
  getContactService,
  normalizeEmail,
} from '../customer/contact.service';
import { isFirebaseConfigured } from '../firebase';
import {
  listFirestoreCollectionRest,
  patchFirestoreDocumentRest,
} from '../payments/stripe-webhook.server';
import {
  buildEmailSnippet,
  extractSuggestedBookingFromEmail,
  htmlToPlainText,
  normalizeEmailSubject,
  parseEmailDisplayAddress,
  plainTextToSafeHtml,
  sanitizeDispatchEmailHtml,
} from './email-booking-parser';
import {
  DEFAULT_SVIX_TOLERANCE_SECONDS,
  findParentEmailByRfcHeaders,
  getDispatchEmailServerStore,
  indexDispatchEmailRecord,
  makeEnvReader,
  persistDispatchEmailAndWebhook,
  resolveConfiguredDispatchMailbox,
  resolveServerFirestoreToken,
  shouldEnforceResendWebhookSignature,
  shouldEnforceStaffAuth,
  type EmailHttpHandlerOptions,
} from './dispatch-email-store.server';

export { DEFAULT_SVIX_TOLERANCE_SECONDS };

// ─────────────────────────────────────────────────────────────────────────────
// 1. Svix Cryptographic Signature Verification (Resend Webhooks)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResendWebhookSignatureResult {
  valid: boolean;
  status: number;
  svixId?: string;
  timestamp?: number;
  code?:
    | 'MISSING_SECRET'
    | 'MISSING_HEADERS'
    | 'INVALID_TIMESTAMP'
    | 'TIMESTAMP_EXPIRED'
    | 'MALFORMED_SIGNATURE'
    | 'SIGNATURE_MISMATCH';
  error?: string;
}

function decodeSvixSecretBytes(rawSecret?: string | null): Buffer | null {
  const trimmed = String(rawSecret ?? '').trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
  if (!withoutPrefix || !/^[A-Za-z0-9+/=_-]+$/.test(withoutPrefix)) {
    return null;
  }
  const normalizedBase64 = withoutPrefix.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(normalizedBase64, 'base64');
  return bytes.length > 0 ? bytes : null;
}

/**
 * Computes a Svix `v1,<base64>` signature over `${svixId}.${svixTimestamp}.${rawBody}`
 * using the Base64-decoded `whsec_...` secret bytes.
 */
export function computeResendWebhookSignature(
  webhookSecret: string,
  svixId: string,
  svixTimestamp: string | number,
  rawBody: string
): string {
  const secretBytes = decodeSvixSecretBytes(webhookSecret);
  if (!secretBytes) {
    throw new Error('Invalid RESEND_WEBHOOK_SECRET format.');
  }
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const digestBase64 = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');
  return `v1,${digestBase64}`;
}

/**
 * Verifies Resend's Svix webhook headers (`svix-id`, `svix-timestamp`, `svix-signature`)
 * using `node:crypto` HMAC-SHA256 + constant-time `crypto.timingSafeEqual`.
 */
export function verifyResendWebhookSignature(input: {
  rawBody: string;
  request?: Request;
  headers?: Headers | Record<string, string | undefined>;
  svixId?: string | null;
  svixTimestamp?: string | null;
  svixSignature?: string | null;
  webhookSecret?: string | null;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): ResendWebhookSignatureResult {
  const secretBytes = decodeSvixSecretBytes(input.webhookSecret);
  if (!secretBytes) {
    return {
      valid: false,
      status: 503,
      code: 'MISSING_SECRET',
      error: 'RESEND_WEBHOOK_SECRET is not configured or invalid on the server.',
    };
  }

  const readHeader = (name: string): string => {
    if (input.headers) {
      if (typeof (input.headers as Headers).get === 'function') {
        return String((input.headers as Headers).get(name) ?? '').trim();
      }
      const rec = input.headers as Record<string, string | undefined>;
      const direct = rec[name] ?? rec[name.toLowerCase()];
      if (direct !== undefined) return String(direct).trim();
      for (const [k, v] of Object.entries(rec)) {
        if (k.toLowerCase() === name.toLowerCase()) return String(v ?? '').trim();
      }
    }
    if (input.request) {
      return String(input.request.headers.get(name) ?? '').trim();
    }
    return '';
  };

  const svixId =
    (input.svixId !== undefined ? String(input.svixId ?? '').trim() : '') ||
    readHeader('svix-id') ||
    readHeader('webhook-id');
  const svixTimestamp =
    (input.svixTimestamp !== undefined ? String(input.svixTimestamp ?? '').trim() : '') ||
    readHeader('svix-timestamp') ||
    readHeader('webhook-timestamp');
  const svixSignature =
    (input.svixSignature !== undefined ? String(input.svixSignature ?? '').trim() : '') ||
    readHeader('svix-signature') ||
    readHeader('webhook-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return {
      valid: false,
      status: 403,
      code: 'MISSING_HEADERS',
      error: 'Missing required Svix headers (svix-id, svix-timestamp, svix-signature).',
    };
  }

  if (!/^\d+$/.test(svixTimestamp)) {
    return {
      valid: false,
      status: 403,
      code: 'INVALID_TIMESTAMP',
      error: 'Invalid svix-timestamp header value.',
    };
  }

  const timestampSec = Number(svixTimestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_SVIX_TOLERANCE_SECONDS;

  if (!Number.isSafeInteger(timestampSec) || Math.abs(nowSeconds - timestampSec) > toleranceSeconds) {
    return {
      valid: false,
      status: 403,
      timestamp: timestampSec,
      code: 'TIMESTAMP_EXPIRED',
      error: `Webhook timestamp outside ${toleranceSeconds}s replay tolerance window.`,
    };
  }

  const v1Candidates: string[] = [];
  for (const token of svixSignature.split(/\s+/)) {
    const trimmedToken = token.trim();
    if (!trimmedToken) continue;
    const commaIdx = trimmedToken.indexOf(',');
    if (commaIdx <= 0) continue;
    const version = trimmedToken.slice(0, commaIdx).trim();
    const sigValue = trimmedToken.slice(commaIdx + 1).trim();
    if (version === 'v1' && sigValue) {
      v1Candidates.push(sigValue);
    }
  }

  if (v1Candidates.length === 0) {
    return {
      valid: false,
      status: 403,
      svixId,
      timestamp: timestampSec,
      code: 'MALFORMED_SIGNATURE',
      error: 'No v1 signature present in svix-signature header.',
    };
  }

  const signedContent = `${svixId}.${svixTimestamp}.${input.rawBody}`;
  const expectedBase64 = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');
  const expectedBuf = Buffer.from(expectedBase64, 'utf8');

  for (const candidate of v1Candidates) {
    const candBuf = Buffer.from(candidate, 'utf8');
    if (candBuf.length === expectedBuf.length && crypto.timingSafeEqual(candBuf, expectedBuf)) {
      return {
        valid: true,
        status: 200,
        svixId,
        timestamp: timestampSec,
      };
    }
  }

  return {
    valid: false,
    status: 403,
    svixId,
    timestamp: timestampSec,
    code: 'SIGNATURE_MISMATCH',
    error: 'Invalid Resend Svix webhook signature.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Webhook Lookup & Normalization Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function findDispatchEmailByResendOrId(
  rawIdentifier: string,
  options?: { staffBearerToken?: string; skipFirestore?: boolean }
): Promise<DispatchEmailRecord | undefined> {
  const store = getDispatchEmailServerStore();
  const trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return undefined;

  const direct = store.emails.get(trimmed);
  if (direct) return direct;

  const cleanId = sanitizeDispatchEmailId(trimmed);
  const byClean = store.emails.get(cleanId);
  if (byClean) return byClean;

  const indexedId = store.resendIdIndex.get(trimmed);
  if (indexedId && store.emails.has(indexedId)) {
    return store.emails.get(indexedId);
  }

  for (const rec of store.emails.values()) {
    if (rec.resendEmailId === trimmed || rec.id === trimmed || rec.id === cleanId) {
      return rec;
    }
  }

  if (!options?.skipFirestore && isFirebaseConfigured()) {
    const token = await resolveServerFirestoreToken(options?.staffBearerToken);
    if (token) {
      const remote = await fetchFirestoreDocumentRest('dispatchEmails', cleanId, token);
      if (remote && remote.id) {
        const hydrated = remote as DispatchEmailRecord;
        indexDispatchEmailRecord(hydrated);
        return hydrated;
      }
    }
  }

  return undefined;
}

function normalizeRecipientArray(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(',')
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const norm = normalizeEmail(String(item ?? ''));
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function extractCaseInsensitiveHeader(
  headers: unknown,
  targetName: string
): string | undefined {
  if (!headers) return undefined;
  const lowerTarget = targetName.toLowerCase();

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as any).name === 'string' &&
        (entry as any).name.toLowerCase() === lowerTarget
      ) {
        const val = (entry as any).value;
        if (Array.isArray(val)) return val.join(' ');
        if (typeof val === 'string' && val.trim()) return val.trim();
      }
    }
    return undefined;
  }

  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === lowerTarget) {
        if (Array.isArray(v)) return v.map(String).join(' ').trim();
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
  }

  return undefined;
}

function normalizeAttachments(rawAttachments: unknown): DispatchEmailAttachmentMeta[] {
  if (!Array.isArray(rawAttachments)) return [];
  const out: DispatchEmailAttachmentMeta[] = [];

  rawAttachments.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as Record<string, any>;
    const id = String(item.id || `att_${idx + 1}`).trim();
    const filename = String(item.filename || item.name || `attachment-${idx + 1}`).trim();
    const contentType = String(
      item.contentType || item.content_type || 'application/octet-stream'
    ).trim();
    const sizeBytes =
      typeof item.sizeBytes === 'number'
        ? item.sizeBytes
        : typeof item.size === 'number'
        ? item.size
        : undefined;
    const downloadUrl =
      typeof item.downloadUrl === 'string' && item.downloadUrl.trim()
        ? item.downloadUrl.trim()
        : typeof item.download_url === 'string' && item.download_url.trim()
        ? item.download_url.trim()
        : undefined;

    out.push({
      id,
      filename,
      contentType,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      ...(downloadUrl ? { downloadUrl } : {}),
    });
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Resend Receiving API Fetch & Inbound `email.received` Ingestion
// ─────────────────────────────────────────────────────────────────────────────

async function fetchResendInboundEmailDetails(
  resendEmailId: string,
  resendApiKey: string,
  fetchFn: typeof fetch
): Promise<Record<string, any> | null> {
  if (!resendEmailId || !resendApiKey) return null;
  const url = `https://api.resend.com/emails/receiving/${encodeURIComponent(resendEmailId)}`;
  try {
    const resp = await fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as Record<string, any>;
    if (!json || typeof json !== 'object') return null;
    if (
      json.html !== undefined ||
      json.text !== undefined ||
      json.headers !== undefined ||
      json.attachments !== undefined
    ) {
      return json;
    }
    if (json.data && typeof json.data === 'object') {
      return json.data as Record<string, any>;
    }
    return json;
  } catch {
    return null;
  }
}

async function handleResendInboundEmailReceived(params: {
  webhookId: string;
  eventData: Record<string, any>;
  eventCreatedAt?: string;
  configuredMailbox: string;
  resendApiKey: string;
  enforceSingleMailbox: boolean;
  fetchFn: typeof fetch;
  nowMs: number;
  skipFirestore?: boolean;
}): Promise<Response> {
  const {
    webhookId,
    eventData,
    configuredMailbox,
    resendApiKey,
    enforceSingleMailbox,
    fetchFn,
    nowMs,
    skipFirestore,
  } = params;
  const nowIso = new Date(nowMs).toISOString();

  const toRecipients = normalizeRecipientArray(eventData.to);
  const ccRecipients = normalizeRecipientArray(eventData.cc);
  const bccRecipients = normalizeRecipientArray(eventData.bcc);
  const allRecipients = Array.from(new Set([...toRecipients, ...ccRecipients, ...bccRecipients]));

  const addressedToDispatchMailbox = allRecipients.includes(configuredMailbox);
  if (
    (allRecipients.length > 0 && !addressedToDispatchMailbox) ||
    (enforceSingleMailbox && !addressedToDispatchMailbox)
  ) {
    const ignoredWebhook: EmailWebhookEventRecord = {
      id: webhookId,
      svixId: webhookId,
      eventType: 'email.received',
      resendEmailId: String(eventData.email_id || eventData.id || '') || undefined,
      toEmail: allRecipients[0],
      outcome: 'ignored_unrelated_recipient',
      processedAt: nowIso,
    };
    await persistDispatchEmailAndWebhook({
      webhookRecord: ignoredWebhook,
      skipFirestore,
    });
    return Response.json({
      success: true,
      received: true,
      ignored: true,
      reason: 'unrelated_recipient',
      mailboxAddress: configuredMailbox,
    });
  }

  const resendEmailId = String(eventData.email_id || eventData.id || '').trim();
  let hydratedData: Record<string, any> = { ...eventData };

  // Fetch full inbound message (`html`, `text`, `headers`, `attachments`) from Resend Receiving API
  // whenever body fields are not inline in the webhook payload
  const hasInlineBody =
    (typeof hydratedData.html === 'string' && hydratedData.html.trim().length > 0) ||
    (typeof hydratedData.text === 'string' && hydratedData.text.trim().length > 0);

  if (!hasInlineBody && resendEmailId && resendApiKey) {
    const fetched = await fetchResendInboundEmailDetails(resendEmailId, resendApiKey, fetchFn);
    if (fetched) {
      hydratedData = {
        ...hydratedData,
        ...fetched,
        attachments: fetched.attachments ?? hydratedData.attachments,
        headers: fetched.headers ?? hydratedData.headers,
      };
    }
  }

  const parsedSender = parseEmailDisplayAddress(
    typeof hydratedData.from === 'string' ? hydratedData.from : ''
  );
  const fromEmail =
    parsedSender.email ||
    normalizeEmail(hydratedData.from_email) ||
    'unknown-sender@external.invalid';
  const rawSubject = String(hydratedData.subject || '(No Subject)').trim() || '(No Subject)';
  const normalizedSubject = normalizeEmailSubject(rawSubject);

  const rawHtml = typeof hydratedData.html === 'string' ? hydratedData.html : '';
  const rawText = typeof hydratedData.text === 'string' ? hydratedData.text : '';
  const sanitizedHtmlBody = rawHtml
    ? sanitizeDispatchEmailHtml(rawHtml)
    : plainTextToSafeHtml(rawText);
  const textBody = rawText.trim() || htmlToPlainText(rawHtml);
  const snippet = buildEmailSnippet(textBody, rawHtml);

  const rawMessageId =
    (typeof hydratedData.message_id === 'string' && hydratedData.message_id) ||
    extractCaseInsensitiveHeader(hydratedData.headers, 'message-id') ||
    '';
  const rfcMessageId = normalizeRfcMessageId(rawMessageId) || undefined;

  const rawInReplyTo =
    (typeof hydratedData.in_reply_to === 'string' && hydratedData.in_reply_to) ||
    extractCaseInsensitiveHeader(hydratedData.headers, 'in-reply-to') ||
    '';
  const inReplyTo = normalizeRfcMessageId(rawInReplyTo) || undefined;

  const headerRefs = parseRfcMessageIdList(
    hydratedData.references ?? extractCaseInsensitiveHeader(hydratedData.headers, 'references')
  );
  const references = Array.from(new Set([...(inReplyTo ? [inReplyTo] : []), ...headerRefs]));

  const replyToList = normalizeRecipientArray(
    hydratedData.reply_to ?? extractCaseInsensitiveHeader(hydratedData.headers, 'reply-to')
  );
  const replyTo = replyToList[0] || fromEmail;

  const extracted = extractSuggestedBookingFromEmail({
    subject: rawSubject,
    textBody,
    htmlBody: rawHtml,
    fromName: parsedSender.name,
    fromEmail,
  });

  // Correlate thread:
  // 1. RFC `In-Reply-To` / `References` match against stored `rfcMessageId` first
  // 2. `resolveUnifiedContact({ email: fromEmail, phone: extractedPhone, name: fromName })` second
  const parentEmail = findParentEmailByRfcHeaders(inReplyTo, references);
  const contactResolution = getContactService().resolveUnifiedContact({
    email: fromEmail,
    phone: extracted.passengerPhone,
    name: extracted.passengerName || parsedSender.name,
  });

  const preferredThreadId = parentEmail?.threadId || contactResolution.threadId;
  const emailId = sanitizeDispatchEmailId(resendEmailId || webhookId);
  const createdTimestampIso =
    (typeof hydratedData.created_at === 'string' &&
      Number.isFinite(Date.parse(hydratedData.created_at)) &&
      new Date(Date.parse(hydratedData.created_at)).toISOString()) ||
    (params.eventCreatedAt &&
      Number.isFinite(Date.parse(params.eventCreatedAt)) &&
      new Date(Date.parse(params.eventCreatedAt)).toISOString()) ||
    nowIso;
  const timestampMs = Date.parse(createdTimestampIso) || nowMs;

  const resolvedFromName =
    contactResolution.contact?.name ||
    parsedSender.name ||
    extracted.passengerName ||
    fromEmail;

  const effectiveTripId = extracted.tripId || parentEmail?.tripId;
  const effectiveInvoiceId = parentEmail?.invoiceId;
  const effectiveCorpAcct =
    extracted.corporateAccountNumber || parentEmail?.corporateAccountNumber;

  const commsResult = await ingestCommsEventServer(
    {
      id: buildDispatchEmailCommsEventId(emailId),
      threadId: preferredThreadId,
      channel: 'email',
      direction: 'inbound',
      eventType: 'email_inbound',
      contactId: contactResolution.contactId || parentEmail?.contactId,
      contactName: resolvedFromName,
      contactPhone:
        extracted.passengerPhone ||
        contactResolution.primaryPhone ||
        parentEmail?.contactPhone,
      contactEmail: fromEmail,
      fromAddress: fromEmail,
      toAddress: configuredMailbox,
      subject: rawSubject,
      snippet: `${rawSubject} — ${snippet}`.slice(0, 200),
      bodyText: textBody,
      emailMessageId: emailId,
      tripId: effectiveTripId,
      deliveryStatus: 'received',
      suggestedBooking: extracted.suggestedBooking,
      isUnread: true,
      timestampIso: createdTimestampIso,
      timestampMs,
    },
    {
      skipFirestore,
      nowMs,
    }
  );

  const emailRecord: DispatchEmailRecord = {
    id: emailId,
    threadId: commsResult.thread.id,
    commsEventId: commsResult.event.id,
    ...(resendEmailId ? { resendEmailId } : {}),
    ...(rfcMessageId ? { rfcMessageId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    references,
    normalizedSubject,
    direction: 'inbound',
    category: extracted.category,
    folder: extracted.folder,
    fromName: resolvedFromName,
    fromEmail,
    toEmail: configuredMailbox,
    ...(ccRecipients.length > 0 ? { ccEmails: ccRecipients } : {}),
    replyTo,
    subject: rawSubject,
    textBody,
    sanitizedHtmlBody,
    snippet,
    attachments: normalizeAttachments(hydratedData.attachments),
    contactId: commsResult.event.contactId,
    contactPhone: commsResult.event.contactPhone,
    ...(effectiveTripId ? { tripId: effectiveTripId } : {}),
    ...(effectiveInvoiceId ? { invoiceId: effectiveInvoiceId } : {}),
    ...(effectiveCorpAcct ? { corporateAccountNumber: effectiveCorpAcct } : {}),
    ...(extracted.suggestedBooking ? { suggestedBooking: extracted.suggestedBooking } : {}),
    deliveryStatus: 'received',
    isUnread: true,
    isStarred: false,
    createdAt: createdTimestampIso,
    timestampMs,
    updatedAt: nowIso,
  };

  const webhookRecord: EmailWebhookEventRecord = {
    id: webhookId,
    svixId: webhookId,
    eventType: 'email.received',
    resendEmailId: resendEmailId || undefined,
    emailId: emailRecord.id,
    threadId: emailRecord.threadId,
    commsEventId: emailRecord.commsEventId,
    fromEmail: emailRecord.fromEmail,
    toEmail: emailRecord.toEmail,
    deliveryStatus: 'received',
    outcome: `ingested_${emailRecord.folder}`,
    processedAt: nowIso,
  };

  await persistDispatchEmailAndWebhook({
    emailRecord,
    webhookRecord,
    skipFirestore,
  });

  return Response.json({
    success: true,
    received: true,
    duplicate: false,
    emailId: emailRecord.id,
    threadId: emailRecord.threadId,
    commsEventId: emailRecord.commsEventId,
    folder: emailRecord.folder,
    category: emailRecord.category,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Outbound Delivery Status Reconciliation (`sent` / `delivered` / `bounced`...)
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_EVENT_STATUS_MAP: Record<string, DispatchEmailDeliveryStatus> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
  'email.failed': 'failed',
};

function extractResendDeliveryError(
  eventType: string,
  eventData: Record<string, any>
): string | undefined {
  if (eventType === 'email.bounced') {
    const bounce = eventData.bounce as Record<string, any> | undefined;
    const msg =
      bounce?.message ||
      [bounce?.type, bounce?.subType].filter(Boolean).join(' / ') ||
      eventData.reason ||
      eventData.error;
    return String(msg || 'Recipient mail server bounced delivery.').trim();
  }
  if (eventType === 'email.complained') {
    return String(eventData.reason || 'Recipient reported spam complaint.').trim();
  }
  if (eventType === 'email.failed') {
    return String(
      eventData.failed?.reason || eventData.error || eventData.reason || 'Email delivery failed.'
    ).trim();
  }
  if (eventType === 'email.delivery_delayed') {
    return eventData.reason ? String(eventData.reason).trim() : undefined;
  }
  return undefined;
}

async function handleResendDeliveryStatusEvent(params: {
  webhookId: string;
  eventType: string;
  eventData: Record<string, any>;
  deliveryStatus: DispatchEmailDeliveryStatus;
  nowMs: number;
  skipFirestore?: boolean;
}): Promise<Response> {
  const { webhookId, eventType, eventData, deliveryStatus, nowMs, skipFirestore } = params;
  const nowIso = new Date(nowMs).toISOString();
  const targetResendId = String(
    eventData.email_id || eventData.emailId || eventData.id || ''
  ).trim();
  const deliveryError = extractResendDeliveryError(eventType, eventData);

  const existingRecord = targetResendId
    ? await findDispatchEmailByResendOrId(targetResendId, { skipFirestore })
    : undefined;

  if (!existingRecord) {
    const unmatchedWebhook: EmailWebhookEventRecord = {
      id: webhookId,
      svixId: webhookId,
      eventType,
      resendEmailId: targetResendId || undefined,
      deliveryStatus,
      ...(deliveryError ? { deliveryError } : {}),
      outcome: 'status_unmatched_email',
      processedAt: nowIso,
    };
    await persistDispatchEmailAndWebhook({
      webhookRecord: unmatchedWebhook,
      skipFirestore,
    });
    return Response.json({
      success: true,
      received: true,
      matched: false,
      deliveryStatus,
    });
  }

  const updatedEmail: DispatchEmailRecord = {
    ...existingRecord,
    resendEmailId: existingRecord.resendEmailId || targetResendId || undefined,
    deliveryStatus,
    ...(deliveryError !== undefined
      ? { deliveryError }
      : deliveryStatus === 'delivered'
      ? { deliveryError: undefined }
      : {}),
    updatedAt: nowIso,
  };

  // Reconcile linked `em_${emailId}` CommsEvent status & errorMessage in place
  const commsStore = getCommsServerStore();
  const existingCommsEvt = commsStore.events.get(updatedEmail.commsEventId);

  await ingestCommsEventServer(
    {
      id: updatedEmail.commsEventId,
      threadId: updatedEmail.threadId,
      channel: 'email',
      direction: updatedEmail.direction,
      eventType: updatedEmail.direction === 'inbound' ? 'email_inbound' : 'email_outbound',
      contactId: updatedEmail.contactId,
      contactName: existingCommsEvt?.contactName || updatedEmail.fromName,
      contactPhone: updatedEmail.contactPhone,
      contactEmail:
        updatedEmail.direction === 'inbound' ? updatedEmail.fromEmail : updatedEmail.toEmail,
      fromAddress: updatedEmail.fromEmail,
      toAddress: updatedEmail.toEmail,
      subject: updatedEmail.subject,
      snippet: existingCommsEvt?.snippet || `${updatedEmail.subject} — ${updatedEmail.snippet}`,
      bodyText: updatedEmail.textBody,
      emailMessageId: updatedEmail.id,
      tripId: updatedEmail.tripId,
      deliveryStatus,
      errorMessage:
        deliveryError !== undefined
          ? deliveryError
          : deliveryStatus === 'delivered'
          ? undefined
          : existingCommsEvt?.errorMessage,
      isUnread: existingCommsEvt ? existingCommsEvt.isUnread : updatedEmail.isUnread,
      timestampIso: updatedEmail.createdAt,
      timestampMs: updatedEmail.timestampMs,
    },
    {
      skipFirestore,
      nowMs,
    }
  );

  const webhookRecord: EmailWebhookEventRecord = {
    id: webhookId,
    svixId: webhookId,
    eventType,
    resendEmailId: targetResendId || updatedEmail.resendEmailId,
    emailId: updatedEmail.id,
    threadId: updatedEmail.threadId,
    commsEventId: updatedEmail.commsEventId,
    fromEmail: updatedEmail.fromEmail,
    toEmail: updatedEmail.toEmail,
    deliveryStatus,
    ...(deliveryError ? { deliveryError } : {}),
    outcome: `reconciled_${deliveryStatus}`,
    processedAt: nowIso,
  };

  await persistDispatchEmailAndWebhook({
    emailRecord: updatedEmail,
    webhookRecord,
    skipFirestore,
  });

  return Response.json({
    success: true,
    received: true,
    matched: true,
    emailId: updatedEmail.id,
    threadId: updatedEmail.threadId,
    commsEventId: updatedEmail.commsEventId,
    deliveryStatus,
    ...(deliveryError ? { deliveryError } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Staff Diagnostics & `sync_emails` Flush/Hydration
// ─────────────────────────────────────────────────────────────────────────────

export async function flushAndSyncDispatchEmailsServer(options?: {
  staffBearerToken?: string;
  clientEmails?: DispatchEmailRecord[];
  skipFirestore?: boolean;
  nowMs?: number;
}): Promise<{
  emails: DispatchEmailRecord[];
  flushedCount: number;
  syncedAt: string;
}> {
  const store = getDispatchEmailServerStore();

  if (Array.isArray(options?.clientEmails)) {
    for (const ce of options.clientEmails) {
      if (ce?.id && !store.emails.has(ce.id)) {
        indexDispatchEmailRecord(ce);
        store.dirtyEmailIds.add(ce.id);
      }
    }
  }

  let flushedCount = 0;
  const token = !options?.skipFirestore
    ? await resolveServerFirestoreToken(options?.staffBearerToken)
    : null;

  if (token && !options?.skipFirestore && isFirebaseConfigured()) {
    for (const emailId of Array.from(store.dirtyEmailIds)) {
      const rec = store.emails.get(emailId);
      if (!rec) {
        store.dirtyEmailIds.delete(emailId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'dispatchEmails',
        rec.id,
        rec as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        store.dirtyEmailIds.delete(emailId);
        flushedCount += 1;
      }
    }

    for (const whId of Array.from(store.dirtyWebhookEventIds)) {
      const wh = store.webhookEvents.get(whId);
      if (!wh) {
        store.dirtyWebhookEventIds.delete(whId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'emailWebhookEvents',
        wh.id,
        wh as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        store.dirtyWebhookEventIds.delete(whId);
      }
    }

    // Also flush any dirty multi-channel CommsThreads/CommsEvents linked to emails
    const commsSynced = await flushAndSyncCommsServer({
      staffBearerToken: options?.staffBearerToken,
      skipFirestore: options?.skipFirestore,
    });
    flushedCount += commsSynced.flushedCount;

    const remoteEmails = await listFirestoreCollectionRest<DispatchEmailRecord>(
      'dispatchEmails',
      token,
      150
    );
    if (Array.isArray(remoteEmails)) {
      for (const re of remoteEmails) {
        if (re?.id && !store.emails.has(re.id)) {
          indexDispatchEmailRecord(re);
        }
      }
    }
  }

  const emails = Array.from(store.emails.values()).sort(
    (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
  );

  return {
    emails,
    flushedCount,
    syncedAt: new Date(options?.nowMs ?? Date.now()).toISOString(),
  };
}

export function getDispatchEmailDiagnostics(
  options?: EmailHttpHandlerOptions
): DispatchEmailDiagnosticsSummary {
  const store = getDispatchEmailServerStore();
  const readEnv = makeEnvReader(options?.env);
  const mailboxAddress = resolveConfiguredDispatchMailbox(readEnv);
  const apiKey = readEnv('RESEND_API_KEY');
  const webhookSecret = readEnv('RESEND_WEBHOOK_SECRET');
  const fromEmail = readEnv('RESEND_FROM_EMAIL') || readEnv('EMAIL_FROM');

  const allEmails = Array.from(store.emails.values());
  const unreadEmailCount = allEmails.filter(
    (e) => e.isUnread && e.folder !== 'trash' && e.folder !== 'archive'
  ).length;
  const recentWebhooks = Array.from(store.webhookEvents.values())
    .sort((a, b) => Date.parse(b.processedAt || '') - Date.parse(a.processedAt || ''))
    .slice(0, 15);

  return {
    success: true,
    mailboxAddress,
    endpointPath: '/api/email/webhook',
    resendApiConfigured: Boolean(apiKey),
    webhookSecretConfigured: Boolean(decodeSvixSecretBytes(webhookSecret)),
    customDomainConfigured: Boolean(fromEmail && !fromEmail.includes('onboarding@resend.dev')),
    toleranceSeconds: options?.toleranceSeconds ?? DEFAULT_SVIX_TOLERANCE_SECONDS,
    subscribedEvents: [...SUBSCRIBED_RESEND_WEBHOOK_EVENTS],
    storedEmailCount: allEmails.length,
    unreadEmailCount,
    processedWebhookCount: store.webhookEvents.size,
    dirtyEmailCount: store.dirtyEmailIds.size,
    recentWebhooks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. `/api/email/webhook` HTTP Route Handlers (`GET` & `POST`)
// ─────────────────────────────────────────────────────────────────────────────

async function checkDispatcherAuthGate(
  request: Request,
  options?: EmailHttpHandlerOptions
): Promise<{ allowed: true; auth: VerifiedServerAuth } | { allowed: false; response: Response }> {
  const readEnv = makeEnvReader(options?.env);
  const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;
  const enforce = shouldEnforceStaffAuth(options?.enforceAuth, readEnv);
  const auth = await resolveAuth(request);

  if (!enforce) {
    return { allowed: true, auth };
  }
  if (!auth.authenticated) {
    return {
      allowed: false,
      response: Response.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Authentication required for Dispatch Email operations.',
        },
        { status: 401 }
      ),
    };
  }
  if (!auth.isDispatcher) {
    return {
      allowed: false,
      response: Response.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Dispatcher or Admin privileges required for Dispatch Email operations.',
        },
        { status: 403 }
      ),
    };
  }
  return { allowed: true, auth };
}

export async function handleEmailWebhookGet(
  request: Request,
  options?: EmailHttpHandlerOptions
): Promise<Response> {
  const gate = await checkDispatcherAuthGate(request, options);
  if (!gate.allowed) {
    return gate.response;
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const readEnv = makeEnvReader(options?.env);
  const mailboxAddress = resolveConfiguredDispatchMailbox(readEnv);

  if (action === 'sync_emails') {
    const synced = await flushAndSyncDispatchEmailsServer({
      staffBearerToken: gate.auth.isDispatcher ? gate.auth.rawToken : undefined,
      skipFirestore: options?.skipFirestore,
      nowMs: options?.nowMs,
    });
    return Response.json({
      success: true,
      mailboxAddress,
      emails: synced.emails,
      flushedCount: synced.flushedCount,
      syncedAt: synced.syncedAt,
    });
  }

  return Response.json(getDispatchEmailDiagnostics(options));
}

export async function handleEmailWebhookPost(
  request: Request,
  options?: EmailHttpHandlerOptions
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  const store = getDispatchEmailServerStore();
  const url = new URL(request.url);
  const queryAction = url.searchParams.get('action') || '';
  const readEnv = makeEnvReader(options?.env);
  const configuredMailbox = resolveConfiguredDispatchMailbox(readEnv);

  // Staff-authenticated `POST /api/email/webhook?action=sync_emails`
  if (queryAction === 'sync_emails') {
    const gate = await checkDispatcherAuthGate(request, options);
    if (!gate.allowed) {
      return gate.response;
    }
    let clientEmails: DispatchEmailRecord[] | undefined;
    try {
      const bodyJson = (await request.json().catch(() => ({}))) as {
        emails?: DispatchEmailRecord[];
      };
      if (Array.isArray(bodyJson?.emails)) {
        clientEmails = bodyJson.emails;
      }
    } catch {
      // Optional JSON body
    }

    const synced = await flushAndSyncDispatchEmailsServer({
      staffBearerToken: gate.auth.isDispatcher ? gate.auth.rawToken : undefined,
      clientEmails,
      skipFirestore: options?.skipFirestore,
      nowMs: options?.nowMs,
    });
    return Response.json({
      success: true,
      mailboxAddress: configuredMailbox,
      emails: synced.emails,
      flushedCount: synced.flushedCount,
      syncedAt: synced.syncedAt,
    });
  }

  // Svix-verified Resend Webhook (`POST /api/email/webhook`)
  const rawBody = await request.text();
  const webhookSecret = readEnv('RESEND_WEBHOOK_SECRET');
  const nowMs = options?.nowMs ?? Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);

  if (
    shouldEnforceResendWebhookSignature(
      options?.enforceWebhookSignature,
      readEnv,
      webhookSecret
    )
  ) {
    const sigCheck = verifyResendWebhookSignature({
      rawBody,
      request,
      webhookSecret,
      toleranceSeconds: options?.toleranceSeconds ?? DEFAULT_SVIX_TOLERANCE_SECONDS,
      nowSeconds,
    });
    if (!sigCheck.valid) {
      return Response.json(
        {
          success: false,
          code: sigCheck.code,
          error: sigCheck.error,
        },
        { status: sigCheck.status }
      );
    }
  }

  let payload: {
    type?: string;
    created_at?: string;
    data?: Record<string, any>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { success: false, error: 'Malformed JSON webhook body.' },
      { status: 400 }
    );
  }

  const eventType = String(payload?.type || '').trim();
  const eventData =
    payload?.data && typeof payload.data === 'object' ? payload.data : {};
  if (!eventType) {
    return Response.json(
      { success: false, error: 'Missing Resend webhook "type".' },
      { status: 400 }
    );
  }

  const rawSvixId =
    request.headers.get('svix-id')?.trim() ||
    request.headers.get('webhook-id')?.trim() ||
    '';
  const fallbackKey = `${eventType}_${String(
    eventData.email_id || eventData.id || nowMs
  )}`;
  const webhookId = sanitizeDispatchEmailId(rawSvixId || fallbackKey);

  // Strict Svix webhook idempotency check (`/emailWebhookEvents/{svixId}`)
  const existingMemWh = store.webhookEvents.get(webhookId);
  if (existingMemWh) {
    return Response.json({
      success: true,
      received: true,
      duplicate: true,
      svixId: webhookId,
      emailId: existingMemWh.emailId,
      threadId: existingMemWh.threadId,
      outcome: existingMemWh.outcome,
    });
  }

  if (!options?.skipFirestore && isFirebaseConfigured()) {
    const token = await resolveServerFirestoreToken();
    if (token) {
      const remoteWh = await fetchFirestoreDocumentRest('emailWebhookEvents', webhookId, token);
      if (remoteWh && remoteWh.id) {
        const hydratedWh = remoteWh as EmailWebhookEventRecord;
        store.webhookEvents.set(webhookId, hydratedWh);
        return Response.json({
          success: true,
          received: true,
          duplicate: true,
          svixId: webhookId,
          emailId: hydratedWh.emailId,
          threadId: hydratedWh.threadId,
          outcome: hydratedWh.outcome,
        });
      }
    }
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const resendApiKey = readEnv('RESEND_API_KEY');
  const enforceSingleMailbox =
    options?.enforceSingleMailbox ?? (readEnv('NODE_ENV') === 'production');

  if (eventType === 'email.received') {
    return handleResendInboundEmailReceived({
      webhookId,
      eventData,
      eventCreatedAt: payload.created_at,
      configuredMailbox,
      resendApiKey,
      enforceSingleMailbox,
      fetchFn,
      nowMs,
      skipFirestore: options?.skipFirestore,
    });
  }

  const mappedStatus = RESEND_EVENT_STATUS_MAP[eventType];
  if (mappedStatus) {
    return handleResendDeliveryStatusEvent({
      webhookId,
      eventType,
      eventData,
      deliveryStatus: mappedStatus,
      nowMs,
      skipFirestore: options?.skipFirestore,
    });
  }

  // Unhandled Resend event type — acknowledge cleanly with 200 so Resend does not retry endlessly
  const passthroughWh: EmailWebhookEventRecord = {
    id: webhookId,
    svixId: webhookId,
    eventType,
    outcome: 'ignored_event_type',
    processedAt: new Date(nowMs).toISOString(),
  };
  await persistDispatchEmailAndWebhook({
    webhookRecord: passthroughWh,
    skipFirestore: options?.skipFirestore,
  });

  return Response.json({
    success: true,
    received: true,
    ignored: true,
    eventType,
  });
}
