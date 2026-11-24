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
 * - Re-exports all folder/badge configs, canned templates, pure filter/interpolation helpers,
 *   and sender cross-channel timeline contracts from `dispatch-email-catalog.ts` &
 *   `dispatch-email-timeline.ts`.
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
import {
  DEFAULT_DISPATCH_EMAIL_POLICY,
  isInboundEmailSenderBlocked,
  normalizeDispatchEmailPolicy,
  type DispatchEmailPolicyConfig,
} from '../../types/config';
import {
  DISPATCH_MAILBOX_ADDRESS,
  DISPATCH_MAILBOX_DOMAIN,
  buildDeterministicRfcMessageId,
  buildDispatchEmailCommsEventId,
  normalizeRfcMessageId,
  parseRfcMessageIdList,
  type DispatchEmailDeliveryStatus,
  type DispatchEmailDraft,
  type DispatchEmailFolder,
  type DispatchEmailFolderView,
  type DispatchEmailRecord,
} from '../../types/dispatch-email';
import type { Trip } from '../../types/trip';
import { authorizedFetch } from '../auth/auth-headers';
import { getCommsThreadService } from '../comms/comms-thread.service';
import {
  getContactService,
  normalizeEmail,
  normalizePhoneE164,
} from '../customer/contact.service';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { getWorkspaceBus } from '../workspace-bus.service';
import {
  buildEmailSnippet,
  htmlToPlainText,
  normalizeEmailSubject,
  parseEmailDisplayAddress,
  plainTextToSafeHtml,
  sanitizeDispatchEmailHtml,
} from './email-booking-parser';
import {
  CANNED_DISPATCH_EMAIL_TEMPLATES,
  DISPATCH_EMAIL_CATEGORY_BADGE_CONFIG,
  DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG,
  DISPATCH_EMAIL_FOLDER_CONFIGS,
  STORAGE_KEY_DISPATCH_EMAILS,
  STORAGE_KEY_DISPATCH_EMAILS_SEEDED,
  STORAGE_KEY_DISPATCH_EMAIL_DRAFTS,
  areEmailsInSameConversation,
  buildDefaultSampleDispatchEmails,
  buildPopulateBookingPayloadFromEmail,
  buildPopulateRebookPayloadFromTrip,
  buildReplyOrForwardDraftSeed,
  buildTripTrackingUrl,
  computeDispatchEmailFolderCounts,
  filterDispatchDrafts,
  filterDispatchEmails,
  formatDispatchEmailTimestamp,
  getCannedDispatchTemplateById,
  getEmailConversationThread,
  interpolateDispatchEmailTemplate,
  matchesDispatchEmailFolderView,
  matchesDispatchEmailSearch,
  parseRequestedPickupDateTime,
  type CannedDispatchEmailTemplate,
  type CannedDispatchTemplateId,
  type DispatchEmailBadgeStyleConfig,
  type DispatchEmailFilterOptions,
  type DispatchEmailFolderConfig,
  type DispatchEmailFolderCounts,
  type DispatchEmailTemplateContext,
} from './dispatch-email-catalog';
import {
  isActiveOrUpcomingTripStatus,
  resolveSenderCrossChannelTimeline,
  type SenderCrossChannelContext,
} from './dispatch-email-timeline';

export {
  CANNED_DISPATCH_EMAIL_TEMPLATES,
  DISPATCH_EMAIL_CATEGORY_BADGE_CONFIG,
  DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG,
  DISPATCH_EMAIL_FOLDER_CONFIGS,
  STORAGE_KEY_DISPATCH_EMAILS,
  STORAGE_KEY_DISPATCH_EMAILS_SEEDED,
  STORAGE_KEY_DISPATCH_EMAIL_DRAFTS,
  areEmailsInSameConversation,
  buildDefaultSampleDispatchEmails,
  buildPopulateBookingPayloadFromEmail,
  buildPopulateRebookPayloadFromTrip,
  buildReplyOrForwardDraftSeed,
  buildTripTrackingUrl,
  computeDispatchEmailFolderCounts,
  filterDispatchDrafts,
  filterDispatchEmails,
  formatDispatchEmailTimestamp,
  getCannedDispatchTemplateById,
  getEmailConversationThread,
  interpolateDispatchEmailTemplate,
  isActiveOrUpcomingTripStatus,
  matchesDispatchEmailFolderView,
  matchesDispatchEmailSearch,
  parseRequestedPickupDateTime,
  DEFAULT_DISPATCH_EMAIL_POLICY,
  isInboundEmailSenderBlocked,
  normalizeDispatchEmailPolicy,
};

export type {
  CannedDispatchEmailTemplate,
  CannedDispatchTemplateId,
  DispatchEmailBadgeStyleConfig,
  DispatchEmailDraft,
  DispatchEmailFilterOptions,
  DispatchEmailFolderConfig,
  DispatchEmailFolderCounts,
  DispatchEmailFolderView,
  DispatchEmailPolicyConfig,
  DispatchEmailTemplateContext,
  SenderCrossChannelContext,
};

export function appendOutboundEmailSignature(
  bodyText: string,
  signature?: string | null
): string {
  const trimmedSig = typeof signature === 'string' ? signature.trim() : '';
  if (!trimmedSig) return bodyText;
  if (bodyText.includes(trimmedSig)) return bodyText;

  const quoteMarkerIdx = bodyText.indexOf('\n--- Original Message');
  if (quoteMarkerIdx >= 0) {
    const before = bodyText.slice(0, quoteMarkerIdx).trimEnd();
    const after = bodyText.slice(quoteMarkerIdx);
    const prefix = before ? `${before}\n\n--\n${trimmedSig}` : `\n\n--\n${trimmedSig}`;
    return `${prefix}\n${after}`;
  }

  const trimmedBody = bodyText.trimEnd();
  return trimmedBody ? `${trimmedBody}\n\n--\n${trimmedSig}` : `\n\n--\n${trimmedSig}`;
}

const MAX_LOCAL_DISPATCH_EMAILS = 250;
const MAX_LOCAL_EMAIL_DRAFTS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Client Dispatch Email Service (`DispatchEmailService`)
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
    return resolveSenderCrossChannelTimeline(target, trips, this.emails.values());
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
