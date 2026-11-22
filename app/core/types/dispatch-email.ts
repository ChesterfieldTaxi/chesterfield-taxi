/**
 * Single-Mailbox Dispatch Email Domain Contracts (`dispatch-email.ts`)
 *
 * Strictly scoped to the single operational mailbox `dispatch@chesterfieldtaxi.com`
 * (`DISPATCH_MAILBOX_ADDRESS`) — zero multi-alias routing complexity.
 *
 * Defines canonical Firestore models for `/dispatchEmails/{emailId}` and
 * `/emailWebhookEvents/{webhookEventId}` integrated with unified `CommsThread`
 * (`/commsThreads/{threadId}`) and `CommsEvent` (`em_${emailId}`).
 */

import { buildCommsEventId, type CommsSuggestedBooking } from './comms';

export const DISPATCH_MAILBOX_ADDRESS = 'dispatch@chesterfieldtaxi.com' as const;
export const DISPATCH_MAILBOX_DOMAIN = 'chesterfieldtaxi.com' as const;

export const SUBSCRIBED_RESEND_WEBHOOK_EVENTS = [
  'email.received',
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
] as const;

export type SubscribedResendWebhookEventType =
  (typeof SUBSCRIBED_RESEND_WEBHOOK_EVENTS)[number];

export type DispatchEmailFolder =
  | 'inbox'
  | 'bookings'
  | 'inquiries'
  | 'sent'
  | 'receipts'
  | 'drafts'
  | 'archive'
  | 'trash';

export type DispatchEmailDeliveryStatus =
  | 'received'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'delayed'
  | 'failed'
  | 'simulated';

export type DispatchEmailCategory =
  | 'direct'
  | 'booking_request'
  | 'website_inquiry'
  | 'booking_confirmation'
  | 'status_update'
  | 'clarification_request'
  | 'booking_declined'
  | 'trip_receipt'
  | 'corporate_invoice'
  | 'dispatcher_alert'
  | 'general';

export interface DispatchEmailAttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes?: number;
  downloadUrl?: string;
}

export interface DispatchEmailRecord {
  id: string;
  threadId: string; // canonical CommsThread.id
  commsEventId: string; // em_${emailId}
  resendEmailId?: string;
  rfcMessageId?: string; // e.g. <em_...@chesterfieldtaxi.com>
  inReplyTo?: string;
  references: string[];
  normalizedSubject: string;
  direction: 'inbound' | 'outbound';
  category: DispatchEmailCategory;
  folder: DispatchEmailFolder;
  fromName: string;
  fromEmail: string; // lowercase
  toEmail: string; // lowercase
  ccEmails?: string[];
  replyTo?: string;
  subject: string;
  textBody: string;
  sanitizedHtmlBody: string;
  snippet: string;
  attachments: DispatchEmailAttachmentMeta[];
  contactId?: string;
  contactPhone?: string;
  tripId?: string;
  invoiceId?: string;
  corporateAccountNumber?: string;
  suggestedBooking?: CommsSuggestedBooking;
  deliveryStatus: DispatchEmailDeliveryStatus;
  deliveryError?: string;
  isUnread: boolean;
  isStarred: boolean;
  createdAt: string;
  timestampMs: number;
  updatedAt: string;
}

export interface EmailWebhookEventRecord {
  id: string;
  svixId?: string;
  eventType: string;
  resendEmailId?: string;
  emailId?: string;
  threadId?: string;
  commsEventId?: string;
  fromEmail?: string;
  toEmail?: string;
  deliveryStatus?: DispatchEmailDeliveryStatus;
  deliveryError?: string;
  outcome: string;
  processedAt: string;
}

export interface DispatchEmailDiagnosticsSummary {
  success: boolean;
  mailboxAddress: string;
  endpointPath: string;
  resendApiConfigured: boolean;
  webhookSecretConfigured: boolean;
  customDomainConfigured: boolean;
  toleranceSeconds: number;
  subscribedEvents: string[];
  storedEmailCount: number;
  unreadEmailCount: number;
  processedWebhookCount: number;
  dirtyEmailCount?: number;
  recentWebhooks?: EmailWebhookEventRecord[];
  error?: string;
}

/**
 * Sanitizes an arbitrary identifier into a clean Firestore document ID segment
 * (stripping angle brackets, slashes, and whitespace; removing any leading `em_`).
 */
export function sanitizeDispatchEmailId(rawId?: string | null): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/^[<]+|[>]+$/g, '')
    .replace(/[\/\s]+/g, '_')
    .replace(/^em_/, '');
  if (cleaned) return cleaned;
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Builds deterministic `CommsEvent.id` (`em_${emailId}`) for a `DispatchEmailRecord`.
 */
export function buildDispatchEmailCommsEventId(emailId: string): string {
  return buildCommsEventId('email', sanitizeDispatchEmailId(emailId));
}

/**
 * Builds deterministic RFC-5322 `Message-ID` (`<em_${emailId}@chesterfieldtaxi.com>`).
 */
export function buildDeterministicRfcMessageId(
  emailId: string,
  domain: string = DISPATCH_MAILBOX_DOMAIN
): string {
  const cleanId = sanitizeDispatchEmailId(emailId);
  return `<em_${cleanId}@${domain}>`;
}

/**
 * Normalizes an RFC-5322 `Message-ID` or `In-Reply-To` token into canonical `<id@domain>`
 * lowercase form for deterministic lookup.
 */
export function normalizeRfcMessageId(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const bracketMatch = trimmed.match(/<([^<>\s]+)>/);
  const inner = (bracketMatch ? bracketMatch[1] : trimmed.replace(/^[<]+|[>]+$/g, '')).trim();
  if (!inner) return '';
  return `<${inner.toLowerCase()}>`;
}

/**
 * Extracts all unique normalized RFC-5322 `<...>` message IDs from a `References`
 * string or array.
 */
export function parseRfcMessageIdList(
  raw?: string | string[] | null
): string[] {
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(' ') : String(raw);
  if (!joined.trim()) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  const bracketMatches = joined.match(/<[^<>\s]+>/g);
  const tokens = bracketMatches && bracketMatches.length > 0 ? bracketMatches : joined.split(/[\s,]+/);

  for (const tok of tokens) {
    const norm = normalizeRfcMessageId(tok);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}
