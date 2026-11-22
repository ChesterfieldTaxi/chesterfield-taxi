/**
 * Client & Pure Domain Dispatch Email Service (`dispatch-email.service.ts`)
 *
 * Powers the dedicated `EmailDock` & detached pop-out console (`/app/dispatch/popout?module=email`)
 * scoped strictly to the single operational mailbox `dispatch@chesterfieldtaxi.com`:
 * - Real-time Firestore `onSnapshot` sync on `/dispatchEmails` (`orderBy('timestampMs', 'desc')`)
 *   paired with `authorizedFetch('/api/email/webhook?action=sync_emails')` hydration/flush.
 * - Offline-first `localStorage` persistence (`ct_dispatch_emails_v1` & `ct_dispatch_email_drafts_v1`)
 *   and `WorkspaceBus` (`EMAIL_STATE_CHANGED`) cross-window synchronization.
 * - 9 operational folder views (`inbox`, `bookings`, `inquiries`, `sent`, `receipts`, `drafts`,
 *   `starred`, `archive`, `trash`), instant search, `unreadOnly` filter, and batch triage synced
 *   1:1 with `CommsThreadService` (`em_${emailId}` & `unreadByChannel.email`).
 * - Auto-saved `DispatchEmailDraft` lifecycle & zero-duplicate `sendComposerEmail` hydrating
 *   authoritative `emailId` / `rfcMessageId` from `/api/send-email`.
 * - Config-driven `CANNED_DISPATCH_EMAIL_TEMPLATES`, pure `interpolateDispatchEmailTemplate`,
 *   `POPULATE_BOOKING` payload builder, and unified cross-channel sender timeline resolution.
 *
 * Strictly adheres to `constitution.md`: zero `*.server.ts` or `node:*` imports.
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { resolveStlTerminalInfo } from '../../config/airports';
import type { CommsEvent, CommsThread } from '../../types/comms';
import {
  DISPATCH_MAILBOX_ADDRESS,
  DISPATCH_MAILBOX_DOMAIN,
  buildDeterministicRfcMessageId,
  buildDispatchEmailCommsEventId,
  normalizeRfcMessageId,
  parseRfcMessageIdList,
  type DispatchEmailCategory,
  type DispatchEmailDeliveryStatus,
  type DispatchEmailDraft,
  type DispatchEmailFolder,
  type DispatchEmailFolderView,
  type DispatchEmailRecord,
} from '../../types/dispatch-email';
import type { Trip } from '../../types/trip';
import { formatDisplayPhone } from '../../utils/phone';
import { authorizedFetch } from '../auth/auth-headers';
import { getCommsThreadService } from '../comms/comms-thread.service';
import {
  collectContactEmailsNormalized,
  collectContactPhonesE164,
  getContactService,
  normalizeEmail,
  normalizePhone,
  normalizePhoneE164,
  type ContactRecord,
} from '../customer/contact.service';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { getWorkspaceBus, type WorkspaceEventMap } from '../workspace-bus.service';
import {
  buildEmailSnippet,
  extractSuggestedBookingFromEmail,
  htmlToPlainText,
  normalizeEmailSubject,
  parseEmailDisplayAddress,
  plainTextToSafeHtml,
  sanitizeDispatchEmailHtml,
} from './email-booking-parser';

export type { DispatchEmailDraft, DispatchEmailFolderView };

export const STORAGE_KEY_DISPATCH_EMAILS = 'ct_dispatch_emails_v1' as const;
export const STORAGE_KEY_DISPATCH_EMAIL_DRAFTS = 'ct_dispatch_email_drafts_v1' as const;
export const STORAGE_KEY_DISPATCH_EMAILS_SEEDED = 'ct_dispatch_emails_seeded_v1' as const;

const MAX_LOCAL_DISPATCH_EMAILS = 250;
const MAX_LOCAL_EMAIL_DRAFTS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Config-Driven UI Descriptors (Folders, Delivery Pills, Categories, Templates)
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchEmailFolderConfig {
  id: DispatchEmailFolderView;
  label: string;
  shortLabel: string;
  badgeMode: 'unread' | 'drafts' | 'starred' | 'none';
  emptyTitle: string;
  emptyDescription: string;
}

export const DISPATCH_EMAIL_FOLDER_CONFIGS: readonly DispatchEmailFolderConfig[] = [
  {
    id: 'inbox',
    label: 'Inbox',
    shortLabel: 'Inbox',
    badgeMode: 'unread',
    emptyTitle: 'Inbox is clear',
    emptyDescription: 'Active inbound messages to dispatch@chesterfieldtaxi.com appear here.',
  },
  {
    id: 'bookings',
    label: 'Bookings',
    shortLabel: 'Bookings',
    badgeMode: 'unread',
    emptyTitle: 'No booking requests',
    emptyDescription: 'Extracted ride & airport transfer requests appear here for 1-click dispatch.',
  },
  {
    id: 'inquiries',
    label: 'Inquiries',
    shortLabel: 'Inquiries',
    badgeMode: 'unread',
    emptyTitle: 'No website inquiries',
    emptyDescription: 'Submissions from the Chesterfield Taxi public contact portal appear here.',
  },
  {
    id: 'sent',
    label: 'Sent',
    shortLabel: 'Sent',
    badgeMode: 'none',
    emptyTitle: 'No sent messages yet',
    emptyDescription: 'Outbound replies, confirmations, and status updates sent from dispatch.',
  },
  {
    id: 'receipts',
    label: 'Receipts',
    shortLabel: 'Receipts',
    badgeMode: 'unread',
    emptyTitle: 'No receipts or statements',
    emptyDescription: 'Itemized trip receipts, corporate invoices, and receipt copy requests.',
  },
  {
    id: 'drafts',
    label: 'Drafts',
    shortLabel: 'Drafts',
    badgeMode: 'drafts',
    emptyTitle: 'No saved drafts',
    emptyDescription: 'Unsent replies and composed emails are automatically saved here.',
  },
  {
    id: 'starred',
    label: 'Starred',
    shortLabel: 'Starred',
    badgeMode: 'starred',
    emptyTitle: 'No starred emails',
    emptyDescription: 'Star priority VIP, airport, or corporate threads for quick follow-up.',
  },
  {
    id: 'archive',
    label: 'Archive',
    shortLabel: 'Archive',
    badgeMode: 'none',
    emptyTitle: 'Archive is empty',
    emptyDescription: 'Resolved dispatch emails moved out of Inbox remain searchable here.',
  },
  {
    id: 'trash',
    label: 'Trash',
    shortLabel: 'Trash',
    badgeMode: 'none',
    emptyTitle: 'Trash is empty',
    emptyDescription: 'Discarded messages can be restored back to Inbox at any time.',
  },
] as const;

export interface DispatchEmailBadgeStyleConfig {
  label: string;
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'indigo' | 'slate';
  showInList: boolean;
}

export const DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG: Record<
  DispatchEmailDeliveryStatus,
  DispatchEmailBadgeStyleConfig
> = {
  delivered: { label: 'Delivered', tone: 'emerald', showInList: true },
  sent: { label: 'Sent', tone: 'blue', showInList: true },
  queued: { label: 'Queued', tone: 'slate', showInList: true },
  delayed: { label: 'Delayed', tone: 'amber', showInList: true },
  bounced: { label: 'Bounced', tone: 'rose', showInList: true },
  complained: { label: 'Spam Report', tone: 'rose', showInList: true },
  failed: { label: 'Failed', tone: 'rose', showInList: true },
  simulated: { label: 'Simulated', tone: 'amber', showInList: true },
  received: { label: 'Received', tone: 'slate', showInList: false },
};

export const DISPATCH_EMAIL_CATEGORY_BADGE_CONFIG: Partial<
  Record<DispatchEmailCategory, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'blue' | 'rose' | 'slate' }>
> = {
  booking_request: { label: 'Booking Req', tone: 'emerald' },
  website_inquiry: { label: 'Web Inquiry', tone: 'indigo' },
  trip_receipt: { label: 'Receipt', tone: 'amber' },
  corporate_invoice: { label: 'Corp Invoice', tone: 'indigo' },
  booking_confirmation: { label: 'Confirmation', tone: 'blue' },
  status_update: { label: 'Status Update', tone: 'blue' },
  clarification_request: { label: 'Clarification', tone: 'amber' },
  booking_declined: { label: 'Declined', tone: 'rose' },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Canned Dispatch Email Templates & Pure Variable Interpolation
// ─────────────────────────────────────────────────────────────────────────────

export type CannedDispatchTemplateId =
  | 'reservation_confirmation'
  | 'airport_curbside_pickup'
  | 'fare_quote_booking_link'
  | 'secure_payment_link'
  | 'lost_and_found_followup'
  | 'corporate_account_po_confirmation';

export interface DispatchEmailTemplateContext {
  firstName?: string;
  passengerName?: string;
  tripId?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupTime?: string;
  trackingUrl?: string;
  payUrl?: string;
  corporateAccount?: string;
  airlineOrAirportHint?: string;
}

export interface CannedDispatchEmailTemplate {
  id: CannedDispatchTemplateId;
  label: string;
  shortLabel: string;
  description: string;
  subjectTemplate: string;
  bodyTemplate: string;
}

export const CANNED_DISPATCH_EMAIL_TEMPLATES: readonly CannedDispatchEmailTemplate[] = [
  {
    id: 'reservation_confirmation',
    label: 'Reservation Confirmation & Chauffeur Details',
    shortLabel: 'Reservation Confirmed',
    description: 'Confirms scheduled pickup, route, trip reference, and live chauffeur tracking URL.',
    subjectTemplate: 'Reservation Confirmed ({tripId}) — Chesterfield Taxi Dispatch',
    bodyTemplate: `Hello {firstName},

Your reservation with Chesterfield Taxi has been confirmed under reference {tripId}.

Reservation Summary:
• Passenger: {passengerName}
• Pickup: {pickupAddress}
• Destination: {dropoffAddress}
• Scheduled Pickup: {pickupTime}

Live Chauffeur & ETA Tracking:
{trackingUrl}

Your assigned chauffeur's vehicle number and direct arrival updates will appear automatically on your tracking link prior to pickup. Simply reply to this email or call (314) 738-0100 if any itinerary details change.

Warm regards,
Chesterfield Taxi Dispatch
dispatch@chesterfieldtaxi.com · (314) 738-0100`,
  },
  {
    id: 'airport_curbside_pickup',
    label: 'STL / SUS Airport Curbside Pickup Instructions',
    shortLabel: 'STL / SUS Curbside',
    description: 'Provides Terminal 1 Exit Door 6, Terminal 2 Exit Door 12, and SUS FBO curbside instructions.',
    subjectTemplate: 'Airport Curbside Pickup Instructions ({tripId}) — Chesterfield Taxi',
    bodyTemplate: `Hello {firstName},

We are actively monitoring your arrival for reservation {tripId} ({pickupTime}) from {pickupAddress} to {dropoffAddress}.

Curbside Meeting Instructions:
• STL Terminal 1 (American, Delta, United, Alaska, Air Canada, Spirit, Frontier): Proceed to Lower Level Baggage Claim and exit through Terminal 1 Exit Door 6.
• STL Terminal 2 (Southwest Airlines, Lufthansa): Proceed to Lower Level Baggage Claim and exit through Terminal 2 Exit Door 12.
• Spirit of St. Louis Airport (SUS FBO — Chesterfield): Your chauffeur coordinates directly with the SUS FBO lobby/ramp desk (Signature Aviation, Million Air, or TAC Air) for planeside or lobby greeting.

Once you have collected any checked luggage and stepped toward your exit door, tap your live tracking link or reply/text us so your chauffeur pulls directly to the curb:
{trackingUrl}

Safe travels,
Chesterfield Taxi Dispatch
dispatch@chesterfieldtaxi.com · (314) 738-0100`,
  },
  {
    id: 'fare_quote_booking_link',
    label: 'Fare Quote & Online Booking Link',
    shortLabel: 'Fare Quote',
    description: 'Shares route estimate details and direct online booking confirmation options.',
    subjectTemplate: 'Fare Quote: {pickupAddress} to {dropoffAddress} — Chesterfield Taxi',
    bodyTemplate: `Hello {firstName},

Thank you for contacting Chesterfield Taxi Dispatch regarding transportation from {pickupAddress} to {dropoffAddress} ({pickupTime}).

You can lock in your guaranteed flat-rate reservation online in seconds at:
https://chesterfieldtaxi.com/book

Or simply reply directly to this email with your preferred pickup time, passenger count, and any flight/luggage notes, and our dispatch team will schedule your vehicle right away.

Best regards,
Chesterfield Taxi Dispatch
dispatch@chesterfieldtaxi.com · (314) 738-0100`,
  },
  {
    id: 'secure_payment_link',
    label: '1-Tap Secure Payment / Invoice Link',
    shortLabel: '1-Tap Pay Link',
    description: 'Sends tokenized Stripe 1-tap payment URL ({payUrl}) for Apple Pay, Google Pay, or card.',
    subjectTemplate: 'Secure 1-Tap Payment Link ({tripId}) — Chesterfield Taxi',
    bodyTemplate: `Hello {firstName},

Here is your secure 1-tap payment link for Chesterfield Taxi reference {tripId} ({pickupAddress} to {dropoffAddress}):

{payUrl}

You may complete settlement via Apple Pay, Google Pay, or credit/debit card. An official itemized tax receipt will be emailed to you automatically as soon as payment is confirmed.

Thank you for riding with Chesterfield Taxi,
Chesterfield Taxi Dispatch
dispatch@chesterfieldtaxi.com · (314) 738-0100`,
  },
  {
    id: 'lost_and_found_followup',
    label: 'Lost & Found Follow-Up',
    shortLabel: 'Lost & Found',
    description: 'Updates passenger on vehicle cabin inspection and item return coordination.',
    subjectTemplate: 'Lost & Found Update ({tripId}) — Chesterfield Taxi Dispatch',
    bodyTemplate: `Hello {firstName},

Thank you for reaching out to Chesterfield Taxi Dispatch regarding your recent ride ({tripId} · {pickupAddress} to {dropoffAddress}).

We have logged a priority cabin inspection with your assigned driver and fleet supervisor. As soon as our team confirms the status of your item, we will contact you immediately to coordinate convenient return delivery or pickup at our Chesterfield dispatch office.

For urgent updates, please reply to this email or call our 24/7 dispatch desk at (314) 738-0100.

Sincerely,
Chesterfield Taxi Dispatch
dispatch@chesterfieldtaxi.com · (314) 738-0100`,
  },
  {
    id: 'corporate_account_po_confirmation',
    label: 'Corporate Account & PO Confirmation',
    shortLabel: 'Corporate & PO',
    description: 'Confirms B2B direct-bill corporate account & PO reference assignment.',
    subjectTemplate: 'Corporate Transfer Confirmed ({corporateAccount} · {tripId})',
    bodyTemplate: `Hello {firstName},

Your executive transfer for {passengerName} has been confirmed and billed directly to corporate account {corporateAccount}.

Corporate Reservation Details:
• Trip Reference: {tripId}
• Billing Account / PO: {corporateAccount}
• Pickup: {pickupAddress}
• Destination: {dropoffAddress}
• Scheduled Pickup: {pickupTime}

Live Chauffeur Tracking:
{trackingUrl}

Itemized trip charges will appear automatically on your consolidated corporate statement. Please reply if you need additional guest transfers or return legs added.

Best regards,
Chesterfield Taxi Corporate Dispatch
dispatch@chesterfieldtaxi.com · (314) 738-0100`,
  },
] as const;

function resolveTemplateVariableMap(
  context: DispatchEmailTemplateContext = {}
): Record<string, string> {
  const cleanPassenger = (context.passengerName || '').trim();
  const derivedFirst =
    (context.firstName || '').trim() ||
    (cleanPassenger ? cleanPassenger.split(/\s+/)[0] : '') ||
    'there';
  const effectivePassenger =
    cleanPassenger ||
    ((context.firstName || '').trim() ? (context.firstName || '').trim() : 'Valued Passenger');

  let effectivePickup = (context.pickupAddress || '').trim() || 'your requested pickup location';
  if (context.airlineOrAirportHint) {
    const termInfo = resolveStlTerminalInfo(context.airlineOrAirportHint);
    if (
      termInfo.terminal &&
      effectivePickup.toLowerCase().includes('lambert') &&
      !effectivePickup.toLowerCase().includes('terminal')
    ) {
      effectivePickup = `${effectivePickup} (${termInfo.pickupDoorGuidance})`;
    }
  }

  return {
    firstName: derivedFirst,
    passengerName: effectivePassenger,
    tripId: (context.tripId || '').trim() || 'Pending Assignment',
    pickupAddress: effectivePickup,
    dropoffAddress: (context.dropoffAddress || '').trim() || 'your destination',
    pickupTime: (context.pickupTime || '').trim() || 'your scheduled pickup time',
    trackingUrl:
      (context.trackingUrl || '').trim() || 'https://chesterfieldtaxi.com/booking/lookup',
    payUrl: (context.payUrl || '').trim() || 'https://chesterfieldtaxi.com/pay',
    corporateAccount:
      (context.corporateAccount || '').trim() || 'Corporate Direct Bill Account',
  };
}

function interpolateRawTemplateString(
  raw: string,
  vars: Record<string, string>
): string {
  if (!raw) return '';
  return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (fullMatch, tokenName: string) => {
    return Object.prototype.hasOwnProperty.call(vars, tokenName) ? vars[tokenName] : fullMatch;
  });
}

/**
 * Pure variable interpolation engine for Chesterfield Taxi canned dispatch templates.
 * Supports `{firstName}`, `{passengerName}`, `{tripId}`, `{pickupAddress}`, `{dropoffAddress}`,
 * `{pickupTime}`, `{trackingUrl}`, `{payUrl}`, and `{corporateAccount}`.
 */
export function interpolateDispatchEmailTemplate(
  template: CannedDispatchEmailTemplate,
  context?: DispatchEmailTemplateContext
): { subject: string; bodyText: string };
export function interpolateDispatchEmailTemplate(
  template: string,
  context?: DispatchEmailTemplateContext
): string;
export function interpolateDispatchEmailTemplate(
  template: CannedDispatchEmailTemplate | string,
  context: DispatchEmailTemplateContext = {}
): { subject: string; bodyText: string } | string {
  const vars = resolveTemplateVariableMap(context);
  if (typeof template === 'string') {
    return interpolateRawTemplateString(template, vars);
  }
  return {
    subject: interpolateRawTemplateString(template.subjectTemplate, vars),
    bodyText: interpolateRawTemplateString(template.bodyTemplate, vars),
  };
}

export function getCannedDispatchTemplateById(
  id: CannedDispatchTemplateId | string
): CannedDispatchEmailTemplate | undefined {
  return CANNED_DISPATCH_EMAIL_TEMPLATES.find((tpl) => tpl.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pure Folder Filtering, Counts, Conversation Grouping & Booking Mapping
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchEmailFilterOptions {
  folder?: DispatchEmailFolderView;
  searchQuery?: string;
  unreadOnly?: boolean;
}

export interface DispatchEmailFolderCounts {
  totalUnread: number;
  inbox: number;
  bookings: number;
  inquiries: number;
  sent: number;
  receipts: number;
  drafts: number;
  starred: number;
  archive: number;
  trash: number;
  totals: Record<DispatchEmailFolderView, number>;
  unread: Record<Exclude<DispatchEmailFolderView, 'drafts'>, number>;
}

/**
 * Pure folder view membership predicate.
 * - `'inbox'`: active non-archived, non-trashed inbound messages across `inbox` + `bookings` + `inquiries`.
 * - `'starred'`: `isStarred && folder !== 'trash'`.
 * - All other views match their canonical `folder`.
 */
export function matchesDispatchEmailFolderView(
  email: DispatchEmailRecord,
  folderView: DispatchEmailFolderView = 'inbox'
): boolean {
  switch (folderView) {
    case 'inbox':
      return (
        email.direction === 'inbound' &&
        (email.folder === 'inbox' ||
          email.folder === 'bookings' ||
          email.folder === 'inquiries')
      );
    case 'bookings':
      return email.folder === 'bookings';
    case 'inquiries':
      return email.folder === 'inquiries';
    case 'sent':
      return email.folder === 'sent';
    case 'receipts':
      return email.folder === 'receipts';
    case 'drafts':
      return email.folder === 'drafts';
    case 'starred':
      return Boolean(email.isStarred) && email.folder !== 'trash';
    case 'archive':
      return email.folder === 'archive';
    case 'trash':
      return email.folder === 'trash';
    default:
      return false;
  }
}

export function matchesDispatchEmailSearch(
  email: DispatchEmailRecord,
  rawQuery?: string
): boolean {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return true;

  const haystacks = [
    email.fromName,
    email.fromEmail,
    email.toEmail,
    ...(email.ccEmails || []),
    email.subject,
    email.snippet,
    email.textBody,
    email.tripId,
    email.invoiceId,
    email.corporateAccountNumber,
    email.contactPhone,
    email.suggestedBooking?.passengerName,
    email.suggestedBooking?.passengerPhone,
    email.suggestedBooking?.pickupLocation,
    email.suggestedBooking?.dropoffLocation,
    email.suggestedBooking?.notes,
  ];

  return haystacks.some((val) => typeof val === 'string' && val.toLowerCase().includes(q));
}

export function filterDispatchEmails(
  emails: DispatchEmailRecord[],
  options: DispatchEmailFilterOptions = {}
): DispatchEmailRecord[] {
  const folder = options.folder || 'inbox';
  const unreadOnly = Boolean(options.unreadOnly);
  const searchQuery = options.searchQuery || '';

  return emails
    .filter((em) => {
      if (!matchesDispatchEmailFolderView(em, folder)) return false;
      if (unreadOnly && !em.isUnread) return false;
      if (!matchesDispatchEmailSearch(em, searchQuery)) return false;
      return true;
    })
    .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
}

export function filterDispatchDrafts(
  drafts: DispatchEmailDraft[],
  rawQuery?: string
): DispatchEmailDraft[] {
  const q = (rawQuery || '').trim().toLowerCase();
  return drafts
    .filter((d) => {
      if (!q) return true;
      return [d.toEmail, d.toName, ...(d.ccEmails || []), d.subject, d.bodyText, d.tripId].some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

export function computeDispatchEmailFolderCounts(
  emails: DispatchEmailRecord[],
  drafts: DispatchEmailDraft[] = []
): DispatchEmailFolderCounts {
  const totals: Record<DispatchEmailFolderView, number> = {
    inbox: 0,
    bookings: 0,
    inquiries: 0,
    sent: 0,
    receipts: 0,
    drafts: drafts.length,
    starred: 0,
    archive: 0,
    trash: 0,
  };

  const unread: Record<Exclude<DispatchEmailFolderView, 'drafts'>, number> = {
    inbox: 0,
    bookings: 0,
    inquiries: 0,
    sent: 0,
    receipts: 0,
    starred: 0,
    archive: 0,
    trash: 0,
  };

  let totalUnread = 0;

  for (const em of emails) {
    if (em.isUnread && em.folder !== 'archive' && em.folder !== 'trash') {
      totalUnread += 1;
    }

    const nonDraftViews: Array<Exclude<DispatchEmailFolderView, 'drafts'>> = [
      'inbox',
      'bookings',
      'inquiries',
      'sent',
      'receipts',
      'starred',
      'archive',
      'trash',
    ];
    for (const view of nonDraftViews) {
      if (matchesDispatchEmailFolderView(em, view)) {
        totals[view] += 1;
        if (em.isUnread) {
          unread[view] += 1;
        }
      }
    }
  }

  return {
    totalUnread,
    inbox: unread.inbox,
    bookings: unread.bookings,
    inquiries: unread.inquiries,
    sent: totals.sent,
    receipts: unread.receipts,
    drafts: drafts.length,
    starred: totals.starred,
    archive: totals.archive,
    trash: totals.trash,
    totals,
    unread,
  };
}

/**
 * Determines whether two `DispatchEmailRecord` items belong to the same email conversation
 * via RFC-5322 `Message-ID`/`In-Reply-To`/`References` chain OR matching `threadId` + `normalizedSubject`.
 */
export function areEmailsInSameConversation(
  a: DispatchEmailRecord,
  b: DispatchEmailRecord
): boolean {
  if (a.id === b.id) return true;

  const aRfc = normalizeRfcMessageId(a.rfcMessageId);
  const bRfc = normalizeRfcMessageId(b.rfcMessageId);
  const aRefs = new Set(
    [normalizeRfcMessageId(a.inReplyTo), ...parseRfcMessageIdList(a.references)].filter(Boolean)
  );
  const bRefs = new Set(
    [normalizeRfcMessageId(b.inReplyTo), ...parseRfcMessageIdList(b.references)].filter(Boolean)
  );

  if (aRfc && bRefs.has(aRfc)) return true;
  if (bRfc && aRefs.has(bRfc)) return true;
  for (const ref of aRefs) {
    if (bRefs.has(ref)) return true;
  }

  const aSubj = (a.normalizedSubject || normalizeEmailSubject(a.subject)).toLowerCase();
  const bSubj = (b.normalizedSubject || normalizeEmailSubject(b.subject)).toLowerCase();

  if (aSubj && bSubj && aSubj === bSubj) {
    if (a.threadId && b.threadId && a.threadId === b.threadId) {
      return true;
    }
    const aCounterparty = normalizeEmail(
      a.direction === 'outbound' ? a.toEmail : a.replyTo || a.fromEmail
    );
    const bCounterparty = normalizeEmail(
      b.direction === 'outbound' ? b.toEmail : b.replyTo || b.fromEmail
    );
    if (
      aCounterparty &&
      bCounterparty &&
      aCounterparty !== DISPATCH_MAILBOX_ADDRESS &&
      aCounterparty === bCounterparty
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns all messages belonging to `anchor`'s email conversation sorted chronologically
 * (oldest -> newest) so older messages collapse cleanly above the latest expanded message.
 */
export function getEmailConversationThread(
  anchor: DispatchEmailRecord,
  allEmails: DispatchEmailRecord[]
): DispatchEmailRecord[] {
  const includeTrash = anchor.folder === 'trash';
  const matched = allEmails.filter((candidate) => {
    if (!includeTrash && candidate.folder === 'trash' && candidate.id !== anchor.id) {
      return false;
    }
    return areEmailsInSameConversation(anchor, candidate);
  });

  if (!matched.some((m) => m.id === anchor.id)) {
    matched.push(anchor);
  }

  return matched.sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
}

export function formatDispatchEmailTimestamp(
  timestampMs?: number,
  fallbackIso?: string,
  nowMs: number = Date.now()
): string {
  const resolvedMs =
    timestampMs && Number.isFinite(timestampMs)
      ? timestampMs
      : fallbackIso
      ? Date.parse(fallbackIso)
      : NaN;
  if (!Number.isFinite(resolvedMs)) return fallbackIso || 'Recent';

  const date = new Date(resolvedMs);
  const now = new Date(nowMs);
  const timeStr = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return timeStr;

  const yesterday = new Date(nowMs - 86_400_000);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return `Yesterday, ${timeStr}`;

  const datePart = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${datePart}, ${timeStr}`;
}

export function buildTripTrackingUrl(
  trip: Pick<Trip, 'id' | 'trackingToken'>,
  originOverride?: string
): string {
  const origin =
    originOverride ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://chesterfieldtaxi.com');
  if (trip.trackingToken && trip.trackingToken.trim()) {
    return `${origin}/track/${encodeURIComponent(trip.trackingToken.trim())}`;
  }
  return `${origin}/booking/status/${encodeURIComponent(trip.id)}`;
}

const MONTH_INDEX_BY_PREFIX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function toIsoLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseRequestedPickupDateTime(
  rawPickupTime?: string | null,
  nowMs: number = Date.now()
): { date?: string; time?: string } {
  if (!rawPickupTime || typeof rawPickupTime !== 'string') return {};
  const text = rawPickupTime.trim();
  if (!text) return {};

  let date: string | undefined;
  let time: string | undefined;

  // 1. Parse clock time (e.g. "8:30 AM", "14:15", "11 AM")
  const clockMatch =
    text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i) ||
    text.match(/\b(\d{1,2})\s*(AM|PM)\b/i);
  if (clockMatch) {
    let hours = parseInt(clockMatch[1], 10);
    const hasMinutes = clockMatch.length === 4;
    const minutes = hasMinutes ? parseInt(clockMatch[2] || '0', 10) : 0;
    const meridiem = (hasMinutes ? clockMatch[3] : clockMatch[2])?.toUpperCase();

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // 2. Parse calendar date
  const lower = text.toLowerCase();
  const baseDate = new Date(nowMs);
  if (/\btomorrow\b/.test(lower)) {
    const tmr = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);
    date = toIsoLocalDate(tmr);
  } else if (/\b(?:today|tonight)\b/.test(lower)) {
    date = toIsoLocalDate(baseDate);
  } else {
    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      date = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    } else {
      const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (slashMatch) {
        const m = parseInt(slashMatch[1], 10) - 1;
        const day = parseInt(slashMatch[2], 10);
        let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : baseDate.getFullYear();
        if (year < 100) year += 2000;
        const candidate = new Date(year, m, day);
        if (!Number.isNaN(candidate.getTime())) {
          date = toIsoLocalDate(candidate);
        }
      } else {
        const monthMatch = text.match(
          /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i
        );
        if (monthMatch) {
          const prefix = monthMatch[1].slice(0, 3).toLowerCase();
          const m = MONTH_INDEX_BY_PREFIX[prefix];
          const day = parseInt(monthMatch[2], 10);
          const year = monthMatch[3] ? parseInt(monthMatch[3], 10) : baseDate.getFullYear();
          if (m !== undefined) {
            const candidate = new Date(year, m, day);
            if (!Number.isNaN(candidate.getTime())) {
              date = toIsoLocalDate(candidate);
            }
          }
        }
      }
    }
  }

  return { date, time };
}

/**
 * Pure mapper converting a `DispatchEmailRecord` (and its extracted booking intelligence)
 * into a complete `POPULATE_BOOKING` WorkspaceBus payload for 1-click Dispatch Console hydration.
 */
export function buildPopulateBookingPayloadFromEmail(
  email: DispatchEmailRecord,
  options?: { nowMs?: number }
): WorkspaceEventMap['POPULATE_BOOKING'] & Record<string, any> {
  const effectiveSenderEmail =
    email.direction === 'outbound'
      ? normalizeEmail(email.toEmail)
      : normalizeEmail(
          email.replyTo && normalizeEmail(email.replyTo) !== DISPATCH_MAILBOX_ADDRESS
            ? email.replyTo
            : email.fromEmail
        ) || email.fromEmail;

  const extracted = extractSuggestedBookingFromEmail({
    subject: email.subject,
    textBody: email.textBody,
    htmlBody: email.sanitizedHtmlBody,
    fromName: email.fromName,
    fromEmail: effectiveSenderEmail,
  });

  const sb = email.suggestedBooking;
  const passengerName =
    sb?.passengerName || extracted.passengerName || email.fromName || 'Passenger';
  const passengerPhone =
    normalizePhoneE164(sb?.passengerPhone) ||
    sb?.passengerPhone ||
    extracted.passengerPhone ||
    email.contactPhone ||
    '';
  const passengerEmail =
    normalizeEmail(sb?.passengerEmail) ||
    extracted.passengerEmail ||
    effectiveSenderEmail ||
    '';

  const pickupAddress =
    sb?.pickupLocation || sb?.pickup || extracted.pickupLocation || '';
  const dropoffAddress =
    sb?.dropoffLocation || sb?.dropoff || extracted.dropoffLocation || '';
  const rawPickupTime = sb?.pickupTime || extracted.pickupTime;
  const parsedDateTime = parseRequestedPickupDateTime(rawPickupTime, options?.nowMs);

  const corporateAccount =
    email.corporateAccountNumber || extracted.corporateAccountNumber || undefined;
  const poNumber = extracted.poNumber || undefined;

  const combinedLower = `${email.subject}\n${email.textBody}\n${sb?.notes || ''}`.toLowerCase();
  const needsWheelchair = /\bwheelchair\b/.test(combinedLower);

  const noteParts: string[] = [];
  if (sb?.notes) {
    noteParts.push(sb.notes);
  } else if (extracted.suggestedBooking?.notes) {
    noteParts.push(extracted.suggestedBooking.notes);
  } else if (email.subject) {
    noteParts.push(`Extracted from email: ${email.subject}`);
  }

  return {
    passenger: {
      name: passengerName,
      fullName: passengerName,
      phone: passengerPhone,
      email: passengerEmail,
    },
    passengerName,
    passengerPhone,
    phone: passengerPhone,
    passengerEmail,
    email: passengerEmail,
    pickupAddress,
    dropoffAddress,
    pickupLocation: { address: pickupAddress },
    dropoffLocation: { address: dropoffAddress },
    pickup: pickupAddress,
    dropoff: dropoffAddress,
    ...(parsedDateTime.date ? { date: parsedDateTime.date } : {}),
    ...(parsedDateTime.time ? { time: parsedDateTime.time } : {}),
    ...(rawPickupTime ? { pickupTime: rawPickupTime } : {}),
    ...(extracted.airlineCode ? { airline: extracted.airlineCode, airlineCode: extracted.airlineCode } : {}),
    ...(extracted.flightNumber ? { flightNumber: extracted.flightNumber } : {}),
    ...(extracted.flightIdent ? { flightIdent: extracted.flightIdent } : {}),
    ...(corporateAccount
      ? {
          corporateAccount,
          corporateAccountNumber: corporateAccount,
          accountNumber: corporateAccount,
        }
      : {}),
    ...(poNumber ? { poNumber, billingPo: poNumber } : {}),
    ...(needsWheelchair
      ? {
          vehicleTier: 'wheelchair',
          accessibilityNeeds: ['wheelchair'],
        }
      : {}),
    notes: noteParts.join(' · '),
  };
}

export function buildPopulateRebookPayloadFromTrip(
  trip: Trip
): WorkspaceEventMap['POPULATE_BOOKING'] {
  const passengerName = `${trip.passenger?.firstName || ''} ${
    trip.passenger?.lastName || ''
  }`.trim();
  const phone = trip.passenger?.phone || '';
  const email = trip.passenger?.email || '';
  const pickupAddress = trip.pickupLocation?.address || '';
  const dropoffAddress = trip.dropoffLocation?.address || '';
  const meta = (trip.metadata || {}) as Record<string, any>;
  const corporateAccount =
    trip.corporateAccountId ||
    (typeof meta.corporateAccountNumber === 'string' ? meta.corporateAccountNumber : undefined);

  return {
    passengerName: passengerName || 'Passenger',
    passengerPhone: phone,
    phone,
    passengerEmail: email,
    email,
    pickupAddress,
    dropoffAddress,
    vehicleTier: trip.vehicleTier,
    ...(corporateAccount
      ? {
          corporateAccount,
          corporateAccountNumber: corporateAccount,
        }
      : {}),
    notes: `Rebook from Trip ${trip.id}`,
  };
}

export function buildReplyOrForwardDraftSeed(params: {
  mode: 'reply' | 'reply_all' | 'forward';
  email: DispatchEmailRecord;
  conversation?: DispatchEmailRecord[];
}): Omit<DispatchEmailDraft, 'id' | 'updatedAtMs'> {
  const { mode, email } = params;
  const latestMsg =
    params.conversation && params.conversation.length > 0
      ? params.conversation[params.conversation.length - 1]
      : email;

  const replyTargetEmail =
    latestMsg.direction === 'outbound'
      ? normalizeEmail(latestMsg.toEmail)
      : normalizeEmail(
          latestMsg.replyTo && normalizeEmail(latestMsg.replyTo) !== DISPATCH_MAILBOX_ADDRESS
            ? latestMsg.replyTo
            : latestMsg.fromEmail
        ) || latestMsg.fromEmail;

  const replyTargetName =
    latestMsg.direction === 'outbound'
      ? parseEmailDisplayAddress(latestMsg.toEmail).name
      : latestMsg.fromName;

  const cleanBaseSubject = normalizeEmailSubject(latestMsg.subject) || latestMsg.subject || 'Inquiry';
  const subject =
    mode === 'forward' ? `Fwd: ${cleanBaseSubject}` : `Re: ${cleanBaseSubject}`;

  const ccSet = new Set<string>();
  if (mode === 'reply_all') {
    for (const cc of latestMsg.ccEmails || []) {
      const normCc = normalizeEmail(cc);
      if (
        normCc &&
        normCc !== DISPATCH_MAILBOX_ADDRESS &&
        normCc !== replyTargetEmail
      ) {
        ccSet.add(normCc);
      }
    }
  }

  const rfcChain = Array.from(
    new Set(
      [
        ...parseRfcMessageIdList(latestMsg.references),
        normalizeRfcMessageId(latestMsg.rfcMessageId),
      ].filter(Boolean)
    )
  );

  const forwardQuotedBody =
    mode === 'forward'
      ? `\n\n---------- Forwarded message ----------\nFrom: ${latestMsg.fromName} <${latestMsg.fromEmail}>\nDate: ${latestMsg.createdAt}\nSubject: ${latestMsg.subject}\nTo: ${latestMsg.toEmail}\n\n${latestMsg.textBody}`
      : '';

  return {
    mode,
    toEmail: mode === 'forward' ? '' : replyTargetEmail,
    toName: mode === 'forward' ? '' : replyTargetName,
    ccEmails: Array.from(ccSet),
    subject,
    bodyText: forwardQuotedBody,
    threadId: mode === 'forward' ? undefined : latestMsg.threadId,
    replyToEmailId: latestMsg.id,
    inReplyTo:
      mode === 'forward'
        ? undefined
        : normalizeRfcMessageId(latestMsg.rfcMessageId) || undefined,
    references: mode === 'forward' ? undefined : rfcChain,
    tripId: latestMsg.tripId,
    contactId: latestMsg.contactId,
    contactPhone:
      latestMsg.contactPhone || latestMsg.suggestedBooking?.passengerPhone,
    corporateAccountNumber: latestMsg.corporateAccountNumber,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Offline Dev Fallback Seed Builder (Valid `DispatchEmailRecord`s Only)
// ─────────────────────────────────────────────────────────────────────────────

function createSeedDispatchEmailRecord(params: {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  textBody: string;
  isUnread: boolean;
  timestampMs: number;
}): DispatchEmailRecord {
  const extracted = extractSuggestedBookingFromEmail({
    subject: params.subject,
    textBody: params.textBody,
    fromName: params.fromName,
    fromEmail: params.fromEmail,
  });

  const resolution = getContactService().resolveUnifiedContact({
    email: params.fromEmail,
    phone: extracted.passengerPhone,
    name: extracted.passengerName || params.fromName,
    autoLink: Boolean(params.fromEmail && extracted.passengerPhone),
  });

  const iso = new Date(params.timestampMs).toISOString();
  return {
    id: params.id,
    threadId: resolution.threadId,
    commsEventId: buildDispatchEmailCommsEventId(params.id),
    rfcMessageId: buildDeterministicRfcMessageId(params.id, DISPATCH_MAILBOX_DOMAIN),
    references: [],
    normalizedSubject: normalizeEmailSubject(params.subject),
    direction: 'inbound',
    category: extracted.category,
    folder: extracted.folder,
    fromName: params.fromName,
    fromEmail: normalizeEmail(params.fromEmail) || params.fromEmail.toLowerCase(),
    toEmail: DISPATCH_MAILBOX_ADDRESS,
    replyTo: normalizeEmail(params.fromEmail) || params.fromEmail.toLowerCase(),
    subject: params.subject,
    textBody: params.textBody,
    sanitizedHtmlBody: plainTextToSafeHtml(params.textBody),
    snippet: buildEmailSnippet(params.textBody),
    attachments: [],
    contactId: resolution.contactId,
    contactPhone: extracted.passengerPhone || resolution.primaryPhone,
    corporateAccountNumber: extracted.corporateAccountNumber,
    suggestedBooking: extracted.suggestedBooking,
    deliveryStatus: 'received',
    isUnread: params.isUnread,
    isStarred: false,
    createdAt: iso,
    timestampMs: params.timestampMs,
    updatedAt: iso,
  };
}

export function buildDefaultSampleDispatchEmails(nowMs: number = Date.now()): DispatchEmailRecord[] {
  return [
    createSeedDispatchEmailRecord({
      id: 'seed_bayer_stl_01',
      fromName: 'Amanda Vance',
      fromEmail: 'amanda.vance@bayer.com',
      subject:
        'Executive Transfer Request - STL Airport to Bayer Campus Chesterfield (Tomorrow 8:30 AM)',
      isUnread: true,
      timestampMs: nowMs - 25 * 60_000,
      textBody: `Hello Chesterfield Taxi Dispatch,

We would like to request an executive sedan transfer for our VP tomorrow morning at 8:30 AM.

Details:
• Passenger: Amanda Vance
• Phone: (314) 555-0199
• Pickup: St. Louis Lambert International Airport (STL) Terminal 1 Exit 6
• Destination: Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017
• Arriving on Delta DL 1492 from ATL (scheduled 8:15 AM)
• Account: Bayer Corporate #BY-8821

Please reply with confirmation and assigned driver when available.

Best regards,
Amanda Vance
Corporate Travel Coordinator | Bayer Chesterfield`,
    }),
    createSeedDispatchEmailRecord({
      id: 'seed_bjc_wav_02',
      fromName: 'Dr. Elena Rossi',
      fromEmail: 'elena.rossi@bjc.org',
      subject: 'Transport Booking & Wheelchair Assistance - Barnes-Jewish West County',
      isUnread: true,
      timestampMs: nowMs - 2 * 3_600_000,
      textBody: `Good afternoon,

I need to pre-arrange safe transport for an outpatient discharge scheduled for tomorrow at 11:00 AM.

Pickup Location: Barnes-Jewish West County Hospital, 12634 Olive Blvd, Creve Coeur, MO 63141
Drop-off Location: 14848 Conway Rd, Chesterfield, MO 63017
Passenger: Elena Rossi (Phone: 314-555-0144)

Special requirement: The passenger uses a folding wheelchair that easily fits into a standard sedan trunk. Driver assistance to load wheelchair into trunk is appreciated.

Thank you for your reliable service,
Dr. Elena Rossi`,
    }),
    createSeedDispatchEmailRecord({
      id: 'seed_receipt_03',
      fromName: 'Marcus Sterling',
      fromEmail: 'marcus.sterling@gmail.com',
      subject: 'Trip Receipt Copy Request - Ride from Chesterfield Commons to Clayton',
      isUnread: false,
      timestampMs: nowMs - 20 * 3_600_000,
      textBody: `Hi Chesterfield Taxi Support,

Could you please resend my itemized PDF receipt for the trip taken from Chesterfield Commons to The Ritz-Carlton St. Louis in Clayton ($48.50)?

Payment was made with Visa ending in 4242. I need this to submit my weekly expense report by Friday morning.

Thank you,
Marcus Sterling
Mobile: (636) 555-0112`,
    }),
    createSeedDispatchEmailRecord({
      id: 'seed_lost_ipad_04',
      fromName: 'Sarah Jenkins',
      fromEmail: 'sjenkins@spiritaviation.com',
      subject: 'Lost Item Inquiry - Grey iPad in Vehicle #104',
      isUnread: false,
      timestampMs: nowMs - 26 * 3_600_000,
      textBody: `Hello Dispatch,

My husband took Car #104 yesterday afternoon from Clarkson Rd to Spirit of St. Louis Airport (SUS) (dropped off around 2:15 PM).

He believes he left his grey iPad in a charcoal magnetic folio case in the back seat.

Could you please check with the driver and let us know if it was recovered?
Contact phone: (636) 555-0178.

Thank you so much!
Sarah Jenkins`,
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cross-Channel Sender Timeline & Active Trip Resolution Contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface SenderCrossChannelContext {
  contact: ContactRecord | null;
  contactId?: string;
  contactName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  displayPhone?: string;
  phones: string[];
  emails: string[];
  isVip: boolean;
  corporateAccountId?: string;
  corporateAccountName?: string;
  corporateAccountNumber?: string;
  thread: CommsThread | null;
  threadId: string;
  timelineEvents: CommsEvent[]; // Chronological (oldest -> newest) across Calls, SMS, Voicemails, Notes, Emails
  matchedTrips: Trip[]; // Active/upcoming first, then recent completed
  activeTrips: Trip[];
}

const ACTIVE_TRIP_STATUS_PRIORITY: Record<string, number> = {
  in_progress: 1,
  arrived: 2,
  en_route: 3,
  accepted: 4,
  assigned: 5,
  offered: 6,
  pending: 7,
  CONFIRMED: 8,
  confirmed: 8,
  UNCONFIRMED: 9,
  unconfirmed: 9,
  completed: 20,
  cancelled: 30,
  DECLINED: 31,
  declined: 31,
};

export function isActiveOrUpcomingTripStatus(status?: string): boolean {
  if (!status) return false;
  return (
    status !== 'completed' &&
    status !== 'cancelled' &&
    status !== 'DECLINED' &&
    status !== 'declined'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Client Dispatch Email Service (`DispatchEmailService`)
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchEmailSnapshot {
  emails: DispatchEmailRecord[];
  drafts: DispatchEmailDraft[];
  counts: DispatchEmailFolderCounts;
}

export interface SendComposerEmailInput {
  draftId?: string;
  toEmail: string;
  toName?: string;
  ccEmails?: string[];
  subject: string;
  bodyText: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  tripId?: string;
  invoiceId?: string;
  corporateAccountNumber?: string;
  contactId?: string;
  contactPhone?: string;
}

export interface SendComposerEmailResult {
  success: boolean;
  emailRecord?: DispatchEmailRecord;
  emailId?: string;
  threadId?: string;
  commsEventId?: string;
  rfcMessageId?: string;
  simulated?: boolean;
  error?: string;
}

export class DispatchEmailService {
  private emails: Map<string, DispatchEmailRecord> = new Map();
  private drafts: Map<string, DispatchEmailDraft> = new Map();
  private listeners: Set<(snapshot: DispatchEmailSnapshot) => void> = new Set();
  private firestoreUnsub: Unsubscribe | null = null;
  private realtimeStarted = false;
  private isHandlingExternalSync = false;
  private isSyncingComms = false;

  constructor() {
    this.loadFromStorage();

    // Keep email read/archive states synchronized if dispatchers triage `em_*` events inside CommsHub
    getCommsThreadService().subscribe((commsSnap) => {
      if (this.isSyncingComms || this.emails.size === 0) return;
      let changed = false;
      for (const evt of commsSnap.events) {
        if (evt.channel !== 'email') continue;
        const rawEmailId = evt.emailMessageId || evt.id.replace(/^em_/, '');
        const existing = this.emails.get(rawEmailId);
        if (!existing) continue;
        if (existing.folder === 'archive' || existing.folder === 'trash') continue;
        if (Boolean(evt.isUnread) !== Boolean(existing.isUnread)) {
          this.emails.set(existing.id, {
            ...existing,
            isUnread: Boolean(evt.isUnread),
          });
          changed = true;
        }
      }
      if (changed) {
        this.saveToStorage();
        this.notifyListeners();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (
          e.key === STORAGE_KEY_DISPATCH_EMAILS ||
          e.key === STORAGE_KEY_DISPATCH_EMAIL_DRAFTS
        ) {
          this.loadFromStorage();
          this.notifyListeners();
        }
      });

      getWorkspaceBus().subscribe((msg) => {
        if (msg.type === 'EMAIL_STATE_CHANGED' && !this.isHandlingExternalSync) {
          this.isHandlingExternalSync = true;
          try {
            this.loadFromStorage();
            this.notifyListeners();
          } finally {
            this.isHandlingExternalSync = false;
          }
        }
      });
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const rawEmails = localStorage.getItem(STORAGE_KEY_DISPATCH_EMAILS);
      if (rawEmails) {
        const parsed = JSON.parse(rawEmails) as DispatchEmailRecord[];
        if (Array.isArray(parsed)) {
          this.emails.clear();
          for (const rec of parsed) {
            if (rec && rec.id) {
              this.emails.set(rec.id, rec);
            }
          }
        }
      }
      const rawDrafts = localStorage.getItem(STORAGE_KEY_DISPATCH_EMAIL_DRAFTS);
      if (rawDrafts) {
        const parsed = JSON.parse(rawDrafts) as DispatchEmailDraft[];
        if (Array.isArray(parsed)) {
          this.drafts.clear();
          for (const draft of parsed) {
            if (draft && draft.id) {
              this.drafts.set(draft.id, draft);
            }
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const sortedEmails = Array.from(this.emails.values())
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
        .slice(0, MAX_LOCAL_DISPATCH_EMAILS);
      const sortedDrafts = Array.from(this.drafts.values())
        .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))
        .slice(0, MAX_LOCAL_EMAIL_DRAFTS);

      localStorage.setItem(STORAGE_KEY_DISPATCH_EMAILS, JSON.stringify(sortedEmails));
      localStorage.setItem(STORAGE_KEY_DISPATCH_EMAIL_DRAFTS, JSON.stringify(sortedDrafts));
    } catch {
      // Ignore storage quota errors
    }
  }

  private broadcastStateChanged(): void {
    if (this.isHandlingExternalSync) return;
    try {
      this.isHandlingExternalSync = true;
      getWorkspaceBus().publish('EMAIL_STATE_CHANGED', {
        unreadCount: this.getUnreadCount(),
        updatedAt: Date.now(),
      });
    } catch {
      // Non-blocking broadcast
    } finally {
      this.isHandlingExternalSync = false;
    }
  }

  private notifyListeners(): void {
    if (this.listeners.size === 0) return;
    const snap = this.getSnapshot();
    this.listeners.forEach((listener) => {
      try {
        listener(snap);
      } catch {}
    });
  }

  public getSnapshot(): DispatchEmailSnapshot {
    const allEmails = this.getAllEmails();
    const allDrafts = this.listDrafts();
    return {
      emails: allEmails,
      drafts: allDrafts,
      counts: computeDispatchEmailFolderCounts(allEmails, allDrafts),
    };
  }

  public subscribe(listener: (snapshot: DispatchEmailSnapshot) => void): () => void {
    this.startRealtimeSync();
    this.listeners.add(listener);
    try {
      listener(this.getSnapshot());
    } catch {}
    return () => {
      this.listeners.delete(listener);
    };
  }

  public startRealtimeSync(): void {
    if (this.realtimeStarted || typeof window === 'undefined' || !isFirebaseConfigured()) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) return;

    this.realtimeStarted = true;
    try {
      const emailsQuery = query(
        collection(db, 'dispatchEmails'),
        orderBy('timestampMs', 'desc'),
        limit(MAX_LOCAL_DISPATCH_EMAILS)
      );
      this.firestoreUnsub = onSnapshot(
        emailsQuery,
        (snap) => {
          let changed = false;
          snap.docChanges().forEach((change) => {
            const data = change.doc.data() as DispatchEmailRecord;
            const id = data.id || change.doc.id;
            if (change.type === 'removed') {
              if (this.emails.delete(id)) changed = true;
            } else {
              const hydrated: DispatchEmailRecord = { ...data, id };
              this.emails.set(id, hydrated);
              void this.syncEmailRecordToComms(hydrated, {
                skipFirestore: true,
                skipBroadcast: true,
              });
              changed = true;
            }
          });
          if (changed) {
            this.saveToStorage();
            this.notifyListeners();
            this.broadcastStateChanged();
          }
        },
        () => {
          // Graceful fallback prior to staff auth initialization
        }
      );
    } catch {
      this.realtimeStarted = false;
    }
  }

  public stopRealtimeSync(): void {
    if (this.firestoreUnsub) {
      try {
        this.firestoreUnsub();
      } catch {}
      this.firestoreUnsub = null;
    }
    this.realtimeStarted = false;
  }

  private async persistEmailRecordToFirestore(record: DispatchEmailRecord): Promise<void> {
    if (typeof window === 'undefined' || !isFirebaseConfigured()) return;
    const db = getFirestoreDb();
    if (!db) return;
    try {
      const sanitized = sanitizePayload(record, { mode: 'omit' });
      await setDoc(doc(db, 'dispatchEmails', record.id), sanitized, { merge: true });
    } catch {
      // Tolerated offline / unauthenticated fallback
    }
  }

  private async syncEmailRecordToComms(
    record: DispatchEmailRecord,
    options?: { skipFirestore?: boolean; skipBroadcast?: boolean }
  ): Promise<void> {
    this.isSyncingComms = true;
    try {
      const commsService = getCommsThreadService();
      const commsEventId = record.commsEventId || buildDispatchEmailCommsEventId(record.id);
      const isArchivedFolder = record.folder === 'archive' || record.folder === 'trash';
      const counterpartyEmail =
        record.direction === 'outbound'
          ? normalizeEmail(record.toEmail) || record.toEmail
          : normalizeEmail(
              record.replyTo && normalizeEmail(record.replyTo) !== DISPATCH_MAILBOX_ADDRESS
                ? record.replyTo
                : record.fromEmail
            ) || record.fromEmail;

      const counterpartyName =
        record.direction === 'outbound'
          ? record.suggestedBooking?.passengerName || parseEmailDisplayAddress(record.toEmail).name
          : record.suggestedBooking?.passengerName || record.fromName;

      await commsService.recordCommsEvent(
        {
          id: record.id,
          emailMessageId: record.id,
          threadId: record.threadId,
          channel: 'email',
          direction: record.direction,
          eventType: record.direction === 'outbound' ? 'email_outbound' : 'email_inbound',
          contactId: record.contactId,
          contactName: counterpartyName || undefined,
          contactEmail: counterpartyEmail,
          contactPhone: record.contactPhone || record.suggestedBooking?.passengerPhone,
          fromAddress: record.fromEmail,
          toAddress: record.toEmail,
          subject: record.subject,
          snippet: `${record.subject} — ${record.snippet || ''}`.slice(0, 200),
          bodyText: record.textBody,
          tripId: record.tripId,
          deliveryStatus: record.deliveryStatus,
          errorMessage: record.deliveryError,
          suggestedBooking: record.suggestedBooking,
          isUnread: isArchivedFolder ? false : Boolean(record.isUnread),
          isArchived: isArchivedFolder,
          timestampIso: record.createdAt,
          timestampMs: record.timestampMs,
        },
        {
          skipFirestore: options?.skipFirestore ?? true,
          skipBroadcast: options?.skipBroadcast ?? true,
        }
      );

      if (isArchivedFolder) {
        await commsService.archiveEvents([commsEventId]);
      }
    } finally {
      this.isSyncingComms = false;
    }
  }

  /**
   * Ensures every active `DispatchEmailRecord` currently held in `DispatchEmailService`
   * is mirrored idempotently into `CommsThreadService` (`em_${emailId}`) so `CommsHub`
   * always reflects `dispatch@chesterfieldtaxi.com` emails even before `EmailDock` opens.
   */
  public async ensureCommsMirrorSynced(): Promise<void> {
    if (this.emails.size === 0) return;
    const commsService = getCommsThreadService();
    const sortedChrono = Array.from(this.emails.values()).sort(
      (a, b) => (a.timestampMs || 0) - (b.timestampMs || 0)
    );
    for (const record of sortedChrono) {
      if (!record || !record.id) continue;
      const commsEventId = record.commsEventId || buildDispatchEmailCommsEventId(record.id);
      const existingCommsEvt = commsService.getAllEvents({ includeArchived: true }).find(
        (e) => e.id === commsEventId
      );
      if (
        !existingCommsEvt ||
        existingCommsEvt.deliveryStatus !== record.deliveryStatus ||
        existingCommsEvt.errorMessage !== record.deliveryError
      ) {
        await this.syncEmailRecordToComms(record, {
          skipFirestore: true,
          skipBroadcast: true,
        });
      }
    }
  }

  /**
   * Hydrates & flushes `/dispatchEmails` via `/api/email/webhook?action=sync_emails`.
   * Preserves newer local triage states (`isUnread`, `isStarred`, `folder`) while always
   * adopting upstream Resend delivery status updates (`delivered`, `bounced`, `complained`, `delayed`).
   */
  public async syncWithServer(options?: {
    fetchImpl?: typeof fetch;
    seedSamplesIfOfflineEmpty?: boolean;
  }): Promise<{
    success: boolean;
    emails: DispatchEmailRecord[];
    syncedAt?: string;
    error?: string;
  }> {
    const fetchFn = options?.fetchImpl ?? authorizedFetch;
    try {
      const res = await fetchFn('/api/email/webhook?action=sync_emails', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        emails?: DispatchEmailRecord[];
        syncedAt?: string;
        error?: string;
      };

      if (!res.ok || !data.success) {
        if (options?.seedSamplesIfOfflineEmpty) {
          this.seedOfflineSampleEmailsIfEmpty();
        }
        return {
          success: false,
          emails: this.getAllEmails(),
          error: data.error || `Sync failed (${res.status})`,
        };
      }

      if (Array.isArray(data.emails) && data.emails.length > 0) {
        await this.mergeServerEmails(data.emails);
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            localStorage.setItem(STORAGE_KEY_DISPATCH_EMAILS_SEEDED, '1');
          } catch {}
        }
      } else if (options?.seedSamplesIfOfflineEmpty) {
        this.seedOfflineSampleEmailsIfEmpty();
      }

      return {
        success: true,
        emails: this.getAllEmails(),
        syncedAt: data.syncedAt,
      };
    } catch (err: unknown) {
      if (options?.seedSamplesIfOfflineEmpty) {
        this.seedOfflineSampleEmailsIfEmpty();
      }
      return {
        success: false,
        emails: this.getAllEmails(),
        error: err instanceof Error ? err.message : 'Network error syncing dispatch emails.',
      };
    }
  }

  public async mergeServerEmails(serverEmails: DispatchEmailRecord[]): Promise<void> {
    let changed = false;

    for (const incoming of serverEmails) {
      if (!incoming || !incoming.id) continue;
      const existing = this.emails.get(incoming.id);
      if (!existing) {
        this.emails.set(incoming.id, incoming);
        await this.syncEmailRecordToComms(incoming, {
          skipFirestore: true,
          skipBroadcast: true,
        });
        changed = true;
        continue;
      }

      const incomingUpdatedMs = Date.parse(incoming.updatedAt || incoming.createdAt || '') || 0;
      const existingUpdatedMs = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
      const deliveryChanged =
        incoming.deliveryStatus !== existing.deliveryStatus ||
        incoming.deliveryError !== existing.deliveryError ||
        incoming.resendEmailId !== existing.resendEmailId;

      if (incomingUpdatedMs > existingUpdatedMs || deliveryChanged) {
        const merged: DispatchEmailRecord = {
          ...existing,
          ...incoming,
          // Preserve local triage state if local mutation is at least as recent as server record
          isUnread:
            existingUpdatedMs >= incomingUpdatedMs ? existing.isUnread : incoming.isUnread,
          isStarred:
            existingUpdatedMs >= incomingUpdatedMs ? existing.isStarred : incoming.isStarred,
          folder: existingUpdatedMs >= incomingUpdatedMs ? existing.folder : incoming.folder,
        };
        this.emails.set(merged.id, merged);
        await this.syncEmailRecordToComms(merged, {
          skipFirestore: true,
          skipBroadcast: true,
        });
        changed = true;
      }
    }

    if (changed) {
      this.saveToStorage();
      this.notifyListeners();
      this.broadcastStateChanged();
    }
  }

  /**
   * Seeds realistic fallback `DispatchEmailRecord` items ONLY in offline browser dev
   * when Firestore is unconfigured, server `sync_emails` returned 0 emails, and `localStorage`
   * has never been initialized.
   */
  public seedOfflineSampleEmailsIfEmpty(): DispatchEmailRecord[] {
    if (this.emails.size > 0 || isFirebaseConfigured()) {
      return this.getAllEmails();
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (localStorage.getItem(STORAGE_KEY_DISPATCH_EMAILS_SEEDED) === '1') {
          return this.getAllEmails();
        }
        localStorage.setItem(STORAGE_KEY_DISPATCH_EMAILS_SEEDED, '1');
      } catch {}
    }

    const samples = buildDefaultSampleDispatchEmails();
    for (const sample of samples) {
      this.emails.set(sample.id, sample);
      void this.syncEmailRecordToComms(sample, {
        skipFirestore: true,
        skipBroadcast: true,
      });
    }
    this.saveToStorage();
    this.notifyListeners();
    this.broadcastStateChanged();
    return this.getAllEmails();
  }

  public async upsertEmailRecord(
    record: DispatchEmailRecord,
    options?: { syncComms?: boolean; skipFirestore?: boolean; skipBroadcast?: boolean }
  ): Promise<DispatchEmailRecord> {
    const normalizedRecord: DispatchEmailRecord = {
      ...record,
      commsEventId: record.commsEventId || buildDispatchEmailCommsEventId(record.id),
      normalizedSubject: record.normalizedSubject || normalizeEmailSubject(record.subject),
      sanitizedHtmlBody: record.sanitizedHtmlBody
        ? sanitizeDispatchEmailHtml(record.sanitizedHtmlBody)
        : plainTextToSafeHtml(record.textBody),
      snippet: record.snippet || buildEmailSnippet(record.textBody, record.sanitizedHtmlBody),
    };

    this.emails.set(normalizedRecord.id, normalizedRecord);

    if (options?.syncComms !== false) {
      await this.syncEmailRecordToComms(normalizedRecord, {
        skipFirestore: options?.skipFirestore ?? true,
        skipBroadcast: options?.skipBroadcast ?? true,
      });
    }

    if (!options?.skipFirestore) {
      await this.persistEmailRecordToFirestore(normalizedRecord);
    }

    this.saveToStorage();
    this.notifyListeners();
    if (!options?.skipBroadcast) {
      this.broadcastStateChanged();
    }
    return normalizedRecord;
  }

  public async upsertEmailRecords(
    records: DispatchEmailRecord[],
    options?: { syncComms?: boolean; skipFirestore?: boolean; skipBroadcast?: boolean }
  ): Promise<void> {
    for (const rec of records) {
      await this.upsertEmailRecord(rec, { ...options, skipBroadcast: true });
    }
    if (!options?.skipBroadcast) {
      this.broadcastStateChanged();
    }
  }

  public getAllEmails(): DispatchEmailRecord[] {
    return Array.from(this.emails.values()).sort(
      (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
    );
  }

  public getEmails(filter?: DispatchEmailFilterOptions): DispatchEmailRecord[] {
    return filterDispatchEmails(this.getAllEmails(), filter);
  }

  public getEmailById(emailId: string): DispatchEmailRecord | null {
    return this.emails.get(emailId) || null;
  }

  public getConversationMessages(
    emailIdOrRecord: string | DispatchEmailRecord
  ): DispatchEmailRecord[] {
    const anchor =
      typeof emailIdOrRecord === 'string'
        ? this.emails.get(emailIdOrRecord)
        : emailIdOrRecord;
    if (!anchor) return [];
    return getEmailConversationThread(anchor, this.getAllEmails());
  }

  public getConversationCount(emailIdOrRecord: string | DispatchEmailRecord): number {
    return this.getConversationMessages(emailIdOrRecord).length;
  }

  public getFolderCounts(): DispatchEmailFolderCounts {
    return computeDispatchEmailFolderCounts(this.getAllEmails(), this.listDrafts());
  }

  public getUnreadCount(): number {
    return this.getFolderCounts().totalUnread;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Smart Batch & Single-Item Triage (Synced 1:1 with `CommsThreadService`)
  // ───────────────────────────────────────────────────────────────────────────

  public async markEmailsRead(emailIds: string[]): Promise<void> {
    const nowIso = new Date().toISOString();
    const commsEventIds: string[] = [];
    const changedRecords: DispatchEmailRecord[] = [];

    for (const id of emailIds) {
      const existing = this.emails.get(id);
      if (!existing) continue;
      commsEventIds.push(existing.commsEventId || buildDispatchEmailCommsEventId(id));
      if (existing.isUnread) {
        const updated: DispatchEmailRecord = {
          ...existing,
          isUnread: false,
          updatedAt: nowIso,
        };
        this.emails.set(id, updated);
        changedRecords.push(updated);
      }
    }

    if (commsEventIds.length > 0) {
      this.isSyncingComms = true;
      try {
        await getCommsThreadService().markEventsRead(commsEventIds);
      } finally {
        this.isSyncingComms = false;
      }
    }

    if (changedRecords.length > 0) {
      for (const rec of changedRecords) {
        await this.persistEmailRecordToFirestore(rec);
      }
      this.saveToStorage();
      this.notifyListeners();
      this.broadcastStateChanged();
    }
  }

  public async markEmailsUnread(emailIds: string[]): Promise<void> {
    const nowIso = new Date().toISOString();
    const commsEventIds: string[] = [];
    const changedRecords: DispatchEmailRecord[] = [];

    for (const id of emailIds) {
      const existing = this.emails.get(id);
      if (!existing || existing.folder === 'archive' || existing.folder === 'trash') continue;
      commsEventIds.push(existing.commsEventId || buildDispatchEmailCommsEventId(id));
      if (!existing.isUnread) {
        const updated: DispatchEmailRecord = {
          ...existing,
          isUnread: true,
          updatedAt: nowIso,
        };
        this.emails.set(id, updated);
        changedRecords.push(updated);
      }
    }

    if (commsEventIds.length > 0) {
      this.isSyncingComms = true;
      try {
        await getCommsThreadService().markEventsUnread(commsEventIds);
      } finally {
        this.isSyncingComms = false;
      }
    }

    if (changedRecords.length > 0) {
      for (const rec of changedRecords) {
        await this.persistEmailRecordToFirestore(rec);
      }
      this.saveToStorage();
      this.notifyListeners();
      this.broadcastStateChanged();
    }
  }

  public async toggleEmailRead(emailId: string): Promise<DispatchEmailRecord | null> {
    const existing = this.emails.get(emailId);
    if (!existing) return null;
    if (existing.isUnread) {
      await this.markEmailsRead([emailId]);
    } else {
      await this.markEmailsUnread([emailId]);
    }
    return this.emails.get(emailId) || null;
  }

  public async toggleEmailStar(emailId: string): Promise<DispatchEmailRecord | null> {
    const existing = this.emails.get(emailId);
    if (!existing) return null;
    const updated: DispatchEmailRecord = {
      ...existing,
      isStarred: !existing.isStarred,
      updatedAt: new Date().toISOString(),
    };
    this.emails.set(emailId, updated);
    await this.persistEmailRecordToFirestore(updated);
    this.saveToStorage();
    this.notifyListeners();
    this.broadcastStateChanged();
    return updated;
  }

  public async setEmailsStarred(emailIds: string[], starred: boolean): Promise<void> {
    const nowIso = new Date().toISOString();
    const changed: DispatchEmailRecord[] = [];
    for (const id of emailIds) {
      const existing = this.emails.get(id);
      if (!existing || Boolean(existing.isStarred) === starred) continue;
      const updated: DispatchEmailRecord = {
        ...existing,
        isStarred: starred,
        updatedAt: nowIso,
      };
      this.emails.set(id, updated);
      changed.push(updated);
    }
    if (changed.length > 0) {
      for (const rec of changed) {
        await this.persistEmailRecordToFirestore(rec);
      }
      this.saveToStorage();
      this.notifyListeners();
      this.broadcastStateChanged();
    }
  }

  /**
   * Moves one or more emails to `'inbox'`, `'archive'`, or `'trash'` and keeps
   * `CommsThreadService` (`em_${emailId}` archive/read state and `unreadByChannel.email`)
   * in exact synchronization.
   */
  public async moveEmailsToFolder(
    emailIds: string[],
    targetFolder: 'inbox' | 'archive' | 'trash'
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const archivedCommsEventIds: string[] = [];
    const restoredRecords: DispatchEmailRecord[] = [];
    const changedRecords: DispatchEmailRecord[] = [];

    for (const id of emailIds) {
      const existing = this.emails.get(id);
      if (!existing) continue;

      const resolvedFolder: DispatchEmailFolder =
        targetFolder === 'inbox'
          ? existing.direction === 'outbound'
            ? existing.category === 'trip_receipt' || existing.category === 'corporate_invoice'
              ? 'receipts'
              : 'sent'
            : existing.category === 'booking_request'
            ? 'bookings'
            : existing.category === 'website_inquiry'
            ? 'inquiries'
            : 'inbox'
          : targetFolder;

      const nextUnread =
        targetFolder === 'archive' || targetFolder === 'trash' ? false : existing.isUnread;

      const updated: DispatchEmailRecord = {
        ...existing,
        folder: resolvedFolder,
        isUnread: nextUnread,
        updatedAt: nowIso,
      };

      this.emails.set(id, updated);
      changedRecords.push(updated);

      if (targetFolder === 'archive' || targetFolder === 'trash') {
        archivedCommsEventIds.push(
          updated.commsEventId || buildDispatchEmailCommsEventId(updated.id)
        );
      } else {
        restoredRecords.push(updated);
      }
    }

    if (archivedCommsEventIds.length > 0) {
      this.isSyncingComms = true;
      try {
        await getCommsThreadService().archiveEvents(archivedCommsEventIds);
      } finally {
        this.isSyncingComms = false;
      }
    }

    for (const restored of restoredRecords) {
      await this.syncEmailRecordToComms(restored, {
        skipFirestore: true,
        skipBroadcast: true,
      });
    }

    if (changedRecords.length > 0) {
      for (const rec of changedRecords) {
        await this.persistEmailRecordToFirestore(rec);
      }
      this.saveToStorage();
      this.notifyListeners();
      this.broadcastStateChanged();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Auto-Saved Drafts & Zero-Duplicate Threaded Composer Dispatch
  // ───────────────────────────────────────────────────────────────────────────

  public saveDraft(
    input: Partial<DispatchEmailDraft> & {
      toEmail?: string;
      subject?: string;
      bodyText?: string;
    }
  ): DispatchEmailDraft {
    const nowMs = input.updatedAtMs ?? Date.now();
    const id =
      (input.id && input.id.trim()) ||
      `draft_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const existing = this.drafts.get(id);

    const cleanCc = Array.isArray(input.ccEmails)
      ? input.ccEmails.map((c) => normalizeEmail(c) || c.trim()).filter(Boolean)
      : existing?.ccEmails;

    const draft: DispatchEmailDraft = {
      ...(existing || {}),
      ...input,
      id,
      toEmail: input.toEmail !== undefined ? input.toEmail : existing?.toEmail || '',
      subject: input.subject !== undefined ? input.subject : existing?.subject || '',
      bodyText: input.bodyText !== undefined ? input.bodyText : existing?.bodyText || '',
      ...(cleanCc && cleanCc.length > 0 ? { ccEmails: cleanCc } : { ccEmails: undefined }),
      createdAtMs: existing?.createdAtMs ?? input.createdAtMs ?? nowMs,
      updatedAtMs: nowMs,
    };

    this.drafts.set(id, draft);
    this.saveToStorage();
    this.notifyListeners();
    this.broadcastStateChanged();
    return draft;
  }

  public getDraftById(draftId: string): DispatchEmailDraft | null {
    return this.drafts.get(draftId) || null;
  }

  public listDrafts(): DispatchEmailDraft[] {
    return Array.from(this.drafts.values()).sort(
      (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
    );
  }

  public discardDraft(draftId: string): boolean {
    if (!draftId || !this.drafts.has(draftId)) return false;
    this.drafts.delete(draftId);
    this.saveToStorage();
    this.notifyListeners();
    this.broadcastStateChanged();
    return true;
  }

  public deleteDraft(draftId: string): boolean {
    return this.discardDraft(draftId);
  }

  /**
   * Sends a composer email or threaded reply via `/api/send-email` (`type: 'direct'`),
   * hydrates the authoritative `emailId` & `rfcMessageId` returned by the server so
   * zero duplicate local + server Sent records are ever created, syncs `CommsThreadService`,
   * and automatically removes any associated `draftId` upon success.
   */
  public async sendComposerEmail(
    input: SendComposerEmailInput,
    options?: { fetchImpl?: typeof fetch }
  ): Promise<SendComposerEmailResult> {
    const parsedTo = parseEmailDisplayAddress(input.toEmail);
    const normRecipient = normalizeEmail(input.toEmail) || parsedTo.email;
    const cleanSubject = (input.subject || '').trim();
    const cleanBodyText = (input.bodyText || '').trim();

    if (!normRecipient) {
      return { success: false, error: 'Please enter a valid recipient email address.' };
    }
    if (!cleanSubject) {
      return { success: false, error: 'Please enter an email subject.' };
    }
    if (!cleanBodyText && !input.htmlBody?.trim()) {
      return { success: false, error: 'Please enter a message body before sending.' };
    }

    const html =
      input.htmlBody && input.htmlBody.trim()
        ? sanitizeDispatchEmailHtml(input.htmlBody)
        : plainTextToSafeHtml(cleanBodyText);

    const resolution = getContactService().resolveUnifiedContact({
      email: normRecipient,
      phone: input.contactPhone,
      name: input.toName || parsedTo.name || undefined,
      autoLink: Boolean(normRecipient && input.contactPhone),
    });

    const effectiveContactName =
      input.toName?.trim() ||
      resolution.contact?.name ||
      parsedTo.name ||
      resolution.contactName;
    const effectiveContactPhone =
      normalizePhoneE164(input.contactPhone) || resolution.primaryPhone;
    const effectiveThreadId = input.threadId || resolution.threadId;
    const cleanCc = (input.ccEmails || [])
      .map((c) => normalizeEmail(c))
      .filter((c): c is string => Boolean(c && c !== normRecipient));
    const cleanRefs = parseRfcMessageIdList(input.references);
    const cleanInReplyTo = normalizeRfcMessageId(input.inReplyTo) || undefined;

    const fetchFn = options?.fetchImpl ?? authorizedFetch;

    try {
      const response = await fetchFn('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          recipient: normRecipient,
          subject: cleanSubject,
          text: cleanBodyText || htmlToPlainText(html),
          html,
          replyTo: DISPATCH_MAILBOX_ADDRESS,
          threadId: effectiveThreadId,
          inReplyTo: cleanInReplyTo,
          references: cleanRefs.length > 0 ? cleanRefs : undefined,
          tripId: input.tripId,
          invoiceId: input.invoiceId,
          corporateAccountNumber:
            input.corporateAccountNumber || resolution.contact?.corporateAccountNumber,
          contactId: input.contactId || resolution.contactId,
          contactPhone: effectiveContactPhone,
          contactName: effectiveContactName,
          payload: {
            recipient: normRecipient,
            ccEmails: cleanCc.length > 0 ? cleanCc : undefined,
            subject: cleanSubject,
            text: cleanBodyText || htmlToPlainText(html),
            html,
          },
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        messageId?: string;
        emailId?: string;
        threadId?: string;
        commsEventId?: string;
        rfcMessageId?: string;
        dispatchedAt?: string;
        simulated?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || `Failed to send email (${response.status}).`,
        };
      }

      const nowMs = Date.now();
      const dispatchedIso = data.dispatchedAt || new Date(nowMs).toISOString();
      const authoritativeEmailId =
        (data.emailId && data.emailId.trim()) || `out_${nowMs}`;
      const authoritativeThreadId =
        (data.threadId && data.threadId.trim()) || effectiveThreadId;
      const authoritativeCommsEventId =
        (data.commsEventId && data.commsEventId.trim()) ||
        buildDispatchEmailCommsEventId(authoritativeEmailId);
      const authoritativeRfcMessageId =
        (data.rfcMessageId && data.rfcMessageId.trim()) ||
        buildDeterministicRfcMessageId(authoritativeEmailId, DISPATCH_MAILBOX_DOMAIN);

      const deliveryStatus: DispatchEmailDeliveryStatus = data.simulated
        ? 'simulated'
        : 'sent';

      const outboundRecord: DispatchEmailRecord = {
        id: authoritativeEmailId,
        threadId: authoritativeThreadId,
        commsEventId: authoritativeCommsEventId,
        ...(data.messageId ? { resendEmailId: data.messageId } : {}),
        rfcMessageId: authoritativeRfcMessageId,
        ...(cleanInReplyTo ? { inReplyTo: cleanInReplyTo } : {}),
        references: cleanRefs,
        normalizedSubject: normalizeEmailSubject(cleanSubject),
        direction: 'outbound',
        category: 'direct',
        folder: 'sent',
        fromName: `${COMPANY_CONFIG.name} Dispatch`,
        fromEmail: DISPATCH_MAILBOX_ADDRESS,
        toEmail: normRecipient,
        ...(cleanCc.length > 0 ? { ccEmails: cleanCc } : {}),
        replyTo: DISPATCH_MAILBOX_ADDRESS,
        subject: cleanSubject,
        textBody: cleanBodyText || htmlToPlainText(html),
        sanitizedHtmlBody: html,
        snippet: buildEmailSnippet(cleanBodyText, html),
        attachments: [],
        contactId: input.contactId || resolution.contactId,
        contactPhone: effectiveContactPhone,
        ...(input.tripId ? { tripId: input.tripId } : {}),
        ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
        ...(input.corporateAccountNumber || resolution.contact?.corporateAccountNumber
          ? {
              corporateAccountNumber:
                input.corporateAccountNumber || resolution.contact?.corporateAccountNumber,
            }
          : {}),
        deliveryStatus,
        isUnread: false,
        isStarred: false,
        createdAt: dispatchedIso,
        timestampMs: Date.parse(dispatchedIso) || nowMs,
        updatedAt: dispatchedIso,
      };

      // Keyed by server's authoritative `emailId` so subsequent `onSnapshot` / `sync_emails` merges cleanly with 0 duplicates
      this.emails.set(outboundRecord.id, outboundRecord);
      await this.syncEmailRecordToComms(outboundRecord, {
        skipFirestore: true,
        skipBroadcast: false,
      });

      if (input.draftId) {
        this.drafts.delete(input.draftId);
      }

      this.saveToStorage();
      this.notifyListeners();
      this.broadcastStateChanged();

      return {
        success: true,
        emailRecord: outboundRecord,
        emailId: outboundRecord.id,
        threadId: outboundRecord.threadId,
        commsEventId: outboundRecord.commsEventId,
        rfcMessageId: outboundRecord.rfcMessageId,
        simulated: Boolean(data.simulated),
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error sending dispatch email.',
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-Channel Sender Timeline & Active Trip Resolution (`EmailCrossChannelRail`)
  // ───────────────────────────────────────────────────────────────────────────

  public resolveSenderTimeline(
    target:
      | DispatchEmailRecord
      | {
          email?: string;
          phone?: string;
          name?: string;
          threadId?: string;
          tripId?: string;
          corporateAccountNumber?: string;
        },
    trips: Trip[] = []
  ): SenderCrossChannelContext {
    const isRecord = 'direction' in target && 'fromEmail' in target;
    const rawEmail = isRecord
      ? target.direction === 'outbound'
        ? target.toEmail
        : target.replyTo && normalizeEmail(target.replyTo) !== DISPATCH_MAILBOX_ADDRESS
        ? target.replyTo
        : target.fromEmail
      : target.email;

    const rawPhone = isRecord
      ? target.contactPhone || target.suggestedBooking?.passengerPhone
      : target.phone;

    const rawName = isRecord
      ? target.direction === 'outbound'
        ? target.suggestedBooking?.passengerName || parseEmailDisplayAddress(target.toEmail).name
        : target.suggestedBooking?.passengerName || target.fromName
      : target.name;

    const explicitThreadId = target.threadId;
    const explicitTripId = target.tripId;
    const explicitCorpNumber = target.corporateAccountNumber;

    // Also inspect matched trips for additional phone/email cross-linking
    const normSeedEmail = normalizeEmail(rawEmail);
    const normSeedPhone = normalizePhone(rawPhone || '');
    let tripLinkedPhone = rawPhone;
    let tripLinkedEmail = rawEmail;

    if ((!tripLinkedPhone || !tripLinkedEmail) && trips.length > 0) {
      for (const t of trips) {
        const tEmail = normalizeEmail(t.passenger?.email);
        const tPhone = normalizePhone(t.passenger?.phone || '');
        if (explicitTripId && t.id === explicitTripId) {
          tripLinkedPhone ||= t.passenger?.phone;
          tripLinkedEmail ||= t.passenger?.email;
          break;
        }
        if (normSeedEmail && tEmail === normSeedEmail && t.passenger?.phone) {
          tripLinkedPhone ||= t.passenger.phone;
        }
        if (normSeedPhone && tPhone === normSeedPhone && t.passenger?.email) {
          tripLinkedEmail ||= t.passenger.email;
        }
      }
    }

    const resolution = getContactService().resolveUnifiedContact({
      email: tripLinkedEmail,
      phone: tripLinkedPhone,
      name: rawName,
      autoLink: Boolean(tripLinkedEmail && tripLinkedPhone),
    });

    const commsService = getCommsThreadService();
    if (resolution.contact) {
      void commsService.mergeThreadsForContact(resolution.contact);
    }

    const thread = commsService.findThread({
      threadId: explicitThreadId || resolution.threadId,
      contactId: resolution.contactId,
      phone: resolution.primaryPhone,
      email: resolution.primaryEmail,
    });

    const allEmailsNorm = new Set(
      collectContactEmailsNormalized(resolution.contact, [
        ...resolution.emails,
        ...(thread?.emails || []),
        tripLinkedEmail,
      ])
    );
    const allPhonesE164 = collectContactPhonesE164(resolution.contact, [
      ...resolution.phones,
      ...(thread?.phones || []),
      tripLinkedPhone,
    ]);
    const allPhonesNorm = new Set(allPhonesE164.map((p) => normalizePhone(p)).filter(Boolean));

    // Gather all multi-channel events (Calls, SMS, Voicemails, Internal Notes, Emails) for this sender
    const eventById = new Map<string, CommsEvent>();
    if (thread) {
      for (const evt of commsService.getThreadEvents(thread.id, false)) {
        eventById.set(evt.id, evt);
      }
    }
    for (const evt of commsService.getAllEvents({ includeArchived: false })) {
      if (eventById.has(evt.id)) continue;
      const evtEmail = normalizeEmail(evt.contactEmail);
      const evtPhone = normalizePhone(evt.contactPhone || '');
      if (
        (explicitThreadId && evt.threadId === explicitThreadId) ||
        (resolution.contactId && evt.contactId === resolution.contactId) ||
        (evtEmail && allEmailsNorm.has(evtEmail)) ||
        (evtPhone && allPhonesNorm.has(evtPhone))
      ) {
        eventById.set(evt.id, evt);
      }
    }

    // Ensure any active `DispatchEmailRecord`s for this customer are represented in the timeline
    for (const em of this.emails.values()) {
      if (em.folder === 'archive' || em.folder === 'trash') continue;
      const commsId = em.commsEventId || buildDispatchEmailCommsEventId(em.id);
      if (eventById.has(commsId)) continue;
      const emCounterparty = normalizeEmail(
        em.direction === 'outbound' ? em.toEmail : em.replyTo || em.fromEmail
      );
      const emPhone = normalizePhone(em.contactPhone || '');
      if (
        (emCounterparty && allEmailsNorm.has(emCounterparty)) ||
        (emPhone && allPhonesNorm.has(emPhone))
      ) {
        eventById.set(commsId, {
          id: commsId,
          threadId: thread?.id || em.threadId,
          channel: 'email',
          direction: em.direction,
          eventType: em.direction === 'outbound' ? 'email_outbound' : 'email_inbound',
          contactId: resolution.contactId,
          contactName: resolution.contactName,
          contactPhone: resolution.primaryPhone,
          contactEmail: emCounterparty || resolution.primaryEmail,
          fromAddress: em.fromEmail,
          toAddress: em.toEmail,
          subject: em.subject,
          snippet: `${em.subject} — ${em.snippet}`.slice(0, 200),
          bodyText: em.textBody,
          emailMessageId: em.id,
          tripId: em.tripId,
          deliveryStatus: em.deliveryStatus,
          errorMessage: em.deliveryError,
          suggestedBooking: em.suggestedBooking,
          isUnread: em.isUnread,
          timestampIso: em.createdAt,
          timestampMs: em.timestampMs,
        });
      }
    }

    const timelineEvents = Array.from(eventById.values()).sort(
      (a, b) => (a.timestampMs || 0) - (b.timestampMs || 0)
    );

    // Match active, upcoming, and recent Trips for this sender
    const linkedTripIdSet = new Set<string>([
      ...(thread?.linkedTripIds || []),
      ...(explicitTripId ? [explicitTripId] : []),
    ]);
    for (const evt of timelineEvents) {
      if (evt.tripId) linkedTripIdSet.add(evt.tripId);
    }

    const matchedTrips = trips
      .filter((t) => {
        if (!t || t.isArchived) return false;
        if (linkedTripIdSet.has(t.id)) return true;
        const pEmail = normalizeEmail(t.passenger?.email);
        const cEmail = normalizeEmail(t.contactPerson?.email);
        if ((pEmail && allEmailsNorm.has(pEmail)) || (cEmail && allEmailsNorm.has(cEmail))) {
          return true;
        }
        const pPhone = normalizePhone(t.passenger?.phone || '');
        const cPhone = normalizePhone(t.contactPerson?.phone || '');
        if ((pPhone && allPhonesNorm.has(pPhone)) || (cPhone && allPhonesNorm.has(cPhone))) {
          return true;
        }
        return false;
      })
      .sort((a, b) => {
        const prioA = ACTIVE_TRIP_STATUS_PRIORITY[a.status] ?? 15;
        const prioB = ACTIVE_TRIP_STATUS_PRIORITY[b.status] ?? 15;
        if (prioA !== prioB) return prioA - prioB;
        const timeA = Date.parse(a.scheduledPickupTime || a.createdAt || '') || 0;
        const timeB = Date.parse(b.scheduledPickupTime || b.createdAt || '') || 0;
        return timeB - timeA;
      });

    const activeTrips = matchedTrips.filter((t) => isActiveOrUpcomingTripStatus(t.status));
    const primaryPhone = allPhonesE164[0] || resolution.primaryPhone;
    const primaryEmail = Array.from(allEmailsNorm)[0] || resolution.primaryEmail;

    return {
      contact: resolution.contact,
      contactId: resolution.contactId,
      contactName: resolution.contactName,
      primaryEmail,
      primaryPhone,
      displayPhone: primaryPhone ? formatDisplayPhone(primaryPhone) : undefined,
      phones: allPhonesE164,
      emails: Array.from(allEmailsNorm),
      isVip: Boolean(resolution.contact?.isVip),
      corporateAccountId:
        resolution.corporateAccountId || matchedTrips[0]?.corporateAccountId,
      corporateAccountName: resolution.corporateAccountName,
      corporateAccountNumber:
        explicitCorpNumber || resolution.contact?.corporateAccountNumber,
      thread,
      threadId: thread?.id || resolution.threadId,
      timelineEvents,
      matchedTrips,
      activeTrips,
    };
  }

  public resetForTests(): void {
    this.stopRealtimeSync();
    this.emails.clear();
    this.drafts.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY_DISPATCH_EMAILS);
        localStorage.removeItem(STORAGE_KEY_DISPATCH_EMAIL_DRAFTS);
        localStorage.removeItem(STORAGE_KEY_DISPATCH_EMAILS_SEEDED);
      } catch {}
    }
  }
}

let dispatchEmailServiceInstance: DispatchEmailService | null = null;

export function getDispatchEmailService(): DispatchEmailService {
  if (!dispatchEmailServiceInstance) {
    dispatchEmailServiceInstance = new DispatchEmailService();
  }
  return dispatchEmailServiceInstance;
}
