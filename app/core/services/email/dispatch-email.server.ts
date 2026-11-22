/**
 * Server-Isolated Single-Mailbox Dispatch Email & Resend Webhook Engine (`dispatch-email.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) — isolates `node:crypto`, Svix HMAC-SHA256 webhook
 * verification, Resend Receiving API calls, and server-side Firestore REST ingestion so
 * both `app/routes/api.email.webhook.ts` and `app/routes/api.send-email.ts` compile to
 * `0.00 kB` client chunks.
 *
 * Strictly scoped to the single dispatch mailbox: `dispatch@chesterfieldtaxi.com`.
 */

import crypto from 'node:crypto';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import {
  DISPATCH_MAILBOX_ADDRESS,
  DISPATCH_MAILBOX_DOMAIN,
  SUBSCRIBED_RESEND_WEBHOOK_EVENTS,
  buildDeterministicRfcMessageId,
  buildDispatchEmailCommsEventId,
  normalizeRfcMessageId,
  parseRfcMessageIdList,
  sanitizeDispatchEmailId,
  type DispatchEmailAttachmentMeta,
  type DispatchEmailCategory,
  type DispatchEmailDeliveryStatus,
  type DispatchEmailDiagnosticsSummary,
  type DispatchEmailFolder,
  type DispatchEmailRecord,
  type EmailWebhookEventRecord,
} from '../../types/dispatch-email';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
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
  normalizePhoneE164,
} from '../customer/contact.service';
import { isFirebaseConfigured } from '../firebase';
import {
  getServiceAccountDatastoreToken,
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

const MAX_SERVER_EMAILS = 1000;
const MAX_SERVER_EMAIL_WEBHOOKS = 500;
export const DEFAULT_SVIX_TOLERANCE_SECONDS = 300;

export interface DispatchEmailServerStore {
  emails: Map<string, DispatchEmailRecord>;
  webhookEvents: Map<string, EmailWebhookEventRecord>;
  rfcMessageIndex: Map<string, string>; // normalized `<id@domain>` -> emailId
  resendIdIndex: Map<string, string>; // resendEmailId -> emailId
  dirtyEmailIds: Set<string>;
  dirtyWebhookEventIds: Set<string>;
}

const dispatchEmailServerStore: DispatchEmailServerStore = ((globalThis as any)
  .__ct_dispatch_email_server_store ||= {
  emails: new Map<string, DispatchEmailRecord>(),
  webhookEvents: new Map<string, EmailWebhookEventRecord>(),
  rfcMessageIndex: new Map<string, string>(),
  resendIdIndex: new Map<string, string>(),
  dirtyEmailIds: new Set<string>(),
  dirtyWebhookEventIds: new Set<string>(),
});

export function getDispatchEmailServerStore(): DispatchEmailServerStore {
  return dispatchEmailServerStore;
}

export function resetDispatchEmailServerStoreForTests(): void {
  dispatchEmailServerStore.emails.clear();
  dispatchEmailServerStore.webhookEvents.clear();
  dispatchEmailServerStore.rfcMessageIndex.clear();
  dispatchEmailServerStore.resendIdIndex.clear();
  dispatchEmailServerStore.dirtyEmailIds.clear();
  dispatchEmailServerStore.dirtyWebhookEventIds.clear();
}

function enforceBoundedMap<V>(map: Map<string, V>, maxEntries: number): void {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

function indexDispatchEmailRecord(record: DispatchEmailRecord): void {
  dispatchEmailServerStore.emails.set(record.id, record);
  enforceBoundedMap(dispatchEmailServerStore.emails, MAX_SERVER_EMAILS);

  dispatchEmailServerStore.resendIdIndex.set(record.id, record.id);
  if (record.resendEmailId) {
    dispatchEmailServerStore.resendIdIndex.set(record.resendEmailId.trim(), record.id);
  }
  const normMsgId = normalizeRfcMessageId(record.rfcMessageId);
  if (normMsgId) {
    dispatchEmailServerStore.rfcMessageIndex.set(normMsgId, record.id);
  }
}

export interface EmailHttpHandlerOptions {
  enforceAuth?: boolean;
  enforceWebhookSignature?: boolean;
  enforceSingleMailbox?: boolean;
  authResolver?: (request: Request) => Promise<VerifiedServerAuth>;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  toleranceSeconds?: number;
  skipFirestore?: boolean;
}

function makeEnvReader(envOverride?: Record<string, string | undefined>) {
  return (key: string): string => {
    if (envOverride && key in envOverride) {
      return String(envOverride[key] ?? '').trim();
    }
    return String(process.env[key] ?? '').trim();
  };
}

function resolveConfiguredDispatchMailbox(readEnv: (key: string) => string): string {
  return normalizeEmail(readEnv('DISPATCH_MAILBOX_ADDRESS')) || DISPATCH_MAILBOX_ADDRESS;
}

function shouldEnforceStaffAuth(
  explicitFlag: boolean | undefined,
  readEnv: (key: string) => string
): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const flag = readEnv('EMAIL_ENFORCE_AUTH');
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return (
    readEnv('NODE_ENV') === 'production' ||
    Boolean(readEnv('ADMIN_API_SECRET')) ||
    isFirebaseConfigured()
  );
}

function shouldEnforceResendWebhookSignature(
  explicitFlag: boolean | undefined,
  readEnv: (key: string) => string,
  webhookSecret: string
): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const validateSetting = readEnv('RESEND_VALIDATE_WEBHOOK_SIGNATURE');
  if (validateSetting === 'false') return false;
  if (validateSetting === 'true') return true;
  return readEnv('NODE_ENV') === 'production' || Boolean(webhookSecret);
}

async function resolveServerFirestoreToken(staffBearerToken?: string): Promise<string | null> {
  if (staffBearerToken && staffBearerToken.trim()) {
    return staffBearerToken.trim();
  }
  return getServiceAccountDatastoreToken();
}

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
// 2. Internal Persistence, Lookup & RFC Threading Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findParentEmailByRfcHeaders(
  inReplyTo?: string | null,
  references?: string[]
): DispatchEmailRecord | undefined {
  const normReplyTo = normalizeRfcMessageId(inReplyTo);
  if (normReplyTo) {
    const hitId = dispatchEmailServerStore.rfcMessageIndex.get(normReplyTo);
    if (hitId && dispatchEmailServerStore.emails.has(hitId)) {
      return dispatchEmailServerStore.emails.get(hitId);
    }
  }

  if (Array.isArray(references) && references.length > 0) {
    // Check most immediate parent reference first
    for (let i = references.length - 1; i >= 0; i -= 1) {
      const normRef = normalizeRfcMessageId(references[i]);
      if (!normRef) continue;
      const hitId = dispatchEmailServerStore.rfcMessageIndex.get(normRef);
      if (hitId && dispatchEmailServerStore.emails.has(hitId)) {
        return dispatchEmailServerStore.emails.get(hitId);
      }
    }
  }

  if (normReplyTo) {
    for (const rec of dispatchEmailServerStore.emails.values()) {
      if (normalizeRfcMessageId(rec.rfcMessageId) === normReplyTo) {
        return rec;
      }
    }
  }

  return undefined;
}

async function findDispatchEmailByResendOrId(
  rawIdentifier: string,
  options?: { staffBearerToken?: string; skipFirestore?: boolean }
): Promise<DispatchEmailRecord | undefined> {
  const trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return undefined;

  const direct = dispatchEmailServerStore.emails.get(trimmed);
  if (direct) return direct;

  const cleanId = sanitizeDispatchEmailId(trimmed);
  const byClean = dispatchEmailServerStore.emails.get(cleanId);
  if (byClean) return byClean;

  const indexedId = dispatchEmailServerStore.resendIdIndex.get(trimmed);
  if (indexedId && dispatchEmailServerStore.emails.has(indexedId)) {
    return dispatchEmailServerStore.emails.get(indexedId);
  }

  for (const rec of dispatchEmailServerStore.emails.values()) {
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

async function persistDispatchEmailAndWebhook(params: {
  emailRecord?: DispatchEmailRecord;
  webhookRecord?: EmailWebhookEventRecord;
  staffBearerToken?: string;
  skipFirestore?: boolean;
}): Promise<boolean> {
  if (params.emailRecord) {
    indexDispatchEmailRecord(params.emailRecord);
    dispatchEmailServerStore.dirtyEmailIds.add(params.emailRecord.id);
  }
  if (params.webhookRecord) {
    dispatchEmailServerStore.webhookEvents.set(params.webhookRecord.id, params.webhookRecord);
    enforceBoundedMap(dispatchEmailServerStore.webhookEvents, MAX_SERVER_EMAIL_WEBHOOKS);
    dispatchEmailServerStore.dirtyWebhookEventIds.add(params.webhookRecord.id);
  }

  if (params.skipFirestore || !isFirebaseConfigured()) {
    return false;
  }

  const token = await resolveServerFirestoreToken(params.staffBearerToken);
  if (!token) {
    return false;
  }

  let allPersisted = true;
  if (params.emailRecord) {
    const ok = await patchFirestoreDocumentRest(
      'dispatchEmails',
      params.emailRecord.id,
      params.emailRecord as unknown as Record<string, unknown>,
      token
    );
    if (ok) {
      dispatchEmailServerStore.dirtyEmailIds.delete(params.emailRecord.id);
    } else {
      allPersisted = false;
    }
  }

  if (params.webhookRecord) {
    const whOk = await patchFirestoreDocumentRest(
      'emailWebhookEvents',
      params.webhookRecord.id,
      params.webhookRecord as unknown as Record<string, unknown>,
      token
    );
    if (whOk) {
      dispatchEmailServerStore.dirtyWebhookEventIds.delete(params.webhookRecord.id);
    } else {
      allPersisted = false;
    }
  }

  return allPersisted;
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
  if (Array.isArray(options?.clientEmails)) {
    for (const ce of options.clientEmails) {
      if (ce?.id && !dispatchEmailServerStore.emails.has(ce.id)) {
        indexDispatchEmailRecord(ce);
        dispatchEmailServerStore.dirtyEmailIds.add(ce.id);
      }
    }
  }

  let flushedCount = 0;
  const token = !options?.skipFirestore
    ? await resolveServerFirestoreToken(options?.staffBearerToken)
    : null;

  if (token && !options?.skipFirestore && isFirebaseConfigured()) {
    for (const emailId of Array.from(dispatchEmailServerStore.dirtyEmailIds)) {
      const rec = dispatchEmailServerStore.emails.get(emailId);
      if (!rec) {
        dispatchEmailServerStore.dirtyEmailIds.delete(emailId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'dispatchEmails',
        rec.id,
        rec as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        dispatchEmailServerStore.dirtyEmailIds.delete(emailId);
        flushedCount += 1;
      }
    }

    for (const whId of Array.from(dispatchEmailServerStore.dirtyWebhookEventIds)) {
      const wh = dispatchEmailServerStore.webhookEvents.get(whId);
      if (!wh) {
        dispatchEmailServerStore.dirtyWebhookEventIds.delete(whId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'emailWebhookEvents',
        wh.id,
        wh as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        dispatchEmailServerStore.dirtyWebhookEventIds.delete(whId);
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
        if (re?.id && !dispatchEmailServerStore.emails.has(re.id)) {
          indexDispatchEmailRecord(re);
        }
      }
    }
  }

  const emails = Array.from(dispatchEmailServerStore.emails.values()).sort(
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
  const readEnv = makeEnvReader(options?.env);
  const mailboxAddress = resolveConfiguredDispatchMailbox(readEnv);
  const apiKey = readEnv('RESEND_API_KEY');
  const webhookSecret = readEnv('RESEND_WEBHOOK_SECRET');
  const fromEmail = readEnv('RESEND_FROM_EMAIL') || readEnv('EMAIL_FROM');

  const allEmails = Array.from(dispatchEmailServerStore.emails.values());
  const unreadEmailCount = allEmails.filter(
    (e) => e.isUnread && e.folder !== 'trash' && e.folder !== 'archive'
  ).length;
  const recentWebhooks = Array.from(dispatchEmailServerStore.webhookEvents.values())
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
    processedWebhookCount: dispatchEmailServerStore.webhookEvents.size,
    dirtyEmailCount: dispatchEmailServerStore.dirtyEmailIds.size,
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
  const existingMemWh = dispatchEmailServerStore.webhookEvents.get(webhookId);
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
        dispatchEmailServerStore.webhookEvents.set(webhookId, hydratedWh);
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

// ─────────────────────────────────────────────────────────────────────────────
// 7. Outbound `/api/send-email` Gateway + RFC Threading & Multi-Channel Sync
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
  const rfcMessageId = buildDeterministicRfcMessageId(params.emailId, DISPATCH_MAILBOX_DOMAIN);
  let inReplyTo = normalizeRfcMessageId(params.explicitInReplyTo) || undefined;
  const explicitRefs = parseRfcMessageIdList(params.explicitReferences);
  let parentEmail = findParentEmailByRfcHeaders(inReplyTo, explicitRefs);

  // If replying to an explicit `threadId` without `inReplyTo`, automatically chain to latest email in that thread
  if (!parentEmail && params.explicitThreadId) {
    const threadEmails = Array.from(dispatchEmailServerStore.emails.values())
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
    new Set([
      ...(parentEmail?.references || []),
      ...(parentEmail?.rfcMessageId ? [normalizeRfcMessageId(parentEmail.rfcMessageId)] : []),
      ...explicitRefs,
      ...(inReplyTo ? [inReplyTo] : []),
    ].filter(Boolean))
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
