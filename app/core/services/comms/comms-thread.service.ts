/**
 * Client & Domain Unified Multi-Channel Thread Service (`comms-thread.service.ts`)
 *
 * Manages canonical `CommsThread` (`/commsThreads/{threadId}`) and deterministic
 * `CommsEvent` (`/commsEvents/{eventId}`) records across Calls, SMS, Voicemails,
 * Emails (`dispatch@chesterfieldtaxi.com`), and Internal Notes:
 * - Real-time Firestore `onSnapshot` sync (when `isFirebaseConfigured()`) with
 *   strict `sanitizePayload` writes.
 * - Offline-first `localStorage` persistence + `WorkspaceBus` cross-window broadcast.
 * - Automatic thread merging when phone-only and email-only threads become linked
 *   via `ContactService` updates or trip creation.
 * - Bidirectional `InteractionEvent` adapters for `CommsHub` & `EmailDock`.
 */

import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { InteractionEvent } from '../../../components/domain/dispatch/comms/comms-types';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import {
  buildCommsEventId,
  createEmptyUnreadByChannel,
  type CommsChannel,
  type CommsContactType,
  type CommsDirection,
  type CommsEvent,
  type CommsEventType,
  type CommsThread,
  type RecordCommsEventInput,
} from '../../types/comms';
import { formatDisplayPhone } from '../../utils/phone';
import {
  collectContactEmailsNormalized,
  collectContactPhonesE164,
  getContactService,
  mergeCommsThreads,
  normalizeEmail,
  normalizePhone,
  normalizePhoneE164,
  recomputeCommsThreadRollups,
  resolveCanonicalThreadId,
  type ContactRecord,
} from '../customer/contact.service';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { getWorkspaceBus } from '../workspace-bus.service';

const STORAGE_KEY_THREADS = 'ct_comms_threads_v1';
const STORAGE_KEY_EVENTS = 'ct_comms_events_v1';
const MAX_LOCAL_THREADS = 300;
const MAX_LOCAL_EVENTS = 800;

export function formatCommsDisplayTimestamp(timestampMs?: number, fallback?: string): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return fallback || 'Recent';
  const d = new Date(timestampMs);
  if (Number.isNaN(d.getTime())) return fallback || 'Recent';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function inferChannelFromEventType(eventType: CommsEventType): CommsChannel {
  if (eventType.startsWith('sms_')) return 'sms';
  if (eventType.startsWith('call_')) return 'call';
  if (eventType === 'voicemail') return 'voicemail';
  if (eventType.startsWith('email_')) return 'email';
  return 'note';
}

export function inferDirectionFromEventType(eventType: CommsEventType): CommsDirection {
  if (eventType === 'internal_note') return 'internal';
  if (eventType.endsWith('_outbound')) return 'outbound';
  return 'inbound';
}

/**
 * Converts a canonical `CommsEvent` (and optional parent `CommsThread`) into a `CommsHub`
 * `InteractionEvent` without losing multi-channel metadata.
 */
export function commsEventToInteractionEvent(
  event: CommsEvent,
  thread?: CommsThread | null
): InteractionEvent {
  const resolvedPhone =
    event.contactPhone ||
    thread?.primaryPhone ||
    thread?.phones?.[0] ||
    '';
  const resolvedEmail =
    event.contactEmail ||
    thread?.primaryEmail ||
    thread?.emails?.[0];
  const resolvedName =
    thread?.contactName ||
    event.contactName ||
    (resolvedPhone ? formatDisplayPhone(resolvedPhone) : resolvedEmail || 'Unknown Contact');
  const resolvedType = thread?.contactType || 'passenger';

  const sb = event.suggestedBooking;
  const adaptedSuggestedBooking = sb
    ? {
        pickup: sb.pickup || sb.pickupLocation || '',
        dropoff: sb.dropoff || sb.dropoffLocation || '',
        pickupTime: sb.pickupTime || 'Scheduled',
        passengerName: sb.passengerName || resolvedName,
        passengerPhone: sb.passengerPhone || resolvedPhone,
        passengerEmail: sb.passengerEmail || resolvedEmail,
        notes: sb.notes,
      }
    : undefined;

  return {
    id: event.id,
    threadId: event.threadId,
    channel: event.channel,
    type: event.eventType,
    contactName: resolvedName,
    contactPhone: resolvedPhone,
    contactEmail: resolvedEmail,
    contactType: resolvedType,
    timestamp: formatCommsDisplayTimestamp(event.timestampMs, event.timestampIso),
    timestampMs: event.timestampMs,
    durationSeconds: event.durationSeconds,
    subject: event.subject,
    snippet: event.snippet,
    bodyText: event.bodyText,
    emailMessageId: event.emailMessageId,
    tripId: event.tripId,
    actorName: event.actorName,
    isUnread: event.isUnread,
    deliveryStatus: event.deliveryStatus,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage,
    hasRecording: Boolean(event.recordingSid || event.audioUrl),
    recordingSid: event.recordingSid || (event.channel === 'voicemail' ? event.externalSid : undefined),
    callSid: event.channel === 'call' ? event.externalSid : undefined,
    audioUrl: event.audioUrl,
    audioDuration: event.audioDuration,
    transcription: event.transcription,
    suggestedBooking: adaptedSuggestedBooking,
  };
}

/**
 * Converts a legacy or UI-originated `InteractionEvent` into a normalized `RecordCommsEventInput` / `CommsEvent`.
 */
export function interactionEventToCommsEvent(interaction: InteractionEvent): CommsEvent {
  const channel = interaction.channel || inferChannelFromEventType(interaction.type);
  const direction = inferDirectionFromEventType(interaction.type);
  const rawSid =
    channel === 'voicemail'
      ? interaction.recordingSid || interaction.id
      : channel === 'call'
      ? interaction.callSid || interaction.recordingSid || interaction.id
      : channel === 'email'
      ? interaction.emailMessageId || interaction.id
      : interaction.id;

  const id = buildCommsEventId(channel, rawSid);
  const resolution = getContactService().resolveUnifiedContact({
    phone: interaction.contactPhone,
    email: interaction.contactEmail,
    name: interaction.contactName,
    contactType: interaction.contactType,
    autoLink: false,
  });

  const tsMs = interaction.timestampMs || Date.now();
  const tsIso = new Date(tsMs).toISOString();
  const dispatchPhone = COMPANY_CONFIG.phone.primaryRaw || '+13147380100';
  const dispatchEmail = COMPANY_CONFIG.email.dispatch || 'dispatch@chesterfieldtaxi.com';

  const contactAddress =
    channel === 'email'
      ? resolution.primaryEmail || interaction.contactEmail || ''
      : resolution.primaryPhone || interaction.contactPhone || '';
  const companyAddress = channel === 'email' ? dispatchEmail : dispatchPhone;

  return {
    id,
    threadId: interaction.threadId || resolution.threadId,
    channel,
    direction,
    eventType: interaction.type,
    contactId: resolution.contactId,
    contactName: resolution.contactName || interaction.contactName,
    contactPhone: resolution.primaryPhone || normalizePhoneE164(interaction.contactPhone) || undefined,
    contactEmail: resolution.primaryEmail || normalizeEmail(interaction.contactEmail) || undefined,
    fromAddress:
      direction === 'inbound'
        ? contactAddress
        : direction === 'outbound'
        ? companyAddress
        : interaction.actorName || 'Dispatcher',
    toAddress:
      direction === 'inbound'
        ? companyAddress
        : direction === 'outbound'
        ? contactAddress
        : resolution.contactName,
    subject: interaction.subject,
    snippet: interaction.snippet || '',
    bodyText: interaction.bodyText || interaction.snippet || '',
    emailMessageId: interaction.emailMessageId,
    tripId: interaction.tripId,
    deliveryStatus: interaction.deliveryStatus,
    errorCode: interaction.errorCode,
    errorMessage: interaction.errorMessage,
    externalSid: rawSid,
    recordingSid: interaction.recordingSid,
    durationSeconds: interaction.durationSeconds,
    audioUrl: interaction.audioUrl,
    audioDuration: interaction.audioDuration,
    transcription: interaction.transcription,
    suggestedBooking: interaction.suggestedBooking,
    isUnread: Boolean(interaction.isUnread),
    actorName: interaction.actorName,
    timestampIso: tsIso,
    timestampMs: tsMs,
  };
}

export interface CommsThreadSnapshot {
  threads: CommsThread[];
  events: CommsEvent[];
}

export class CommsThreadService {
  private threads: Map<string, CommsThread> = new Map();
  private events: Map<string, CommsEvent> = new Map();
  private listeners: Set<(snapshot: CommsThreadSnapshot) => void> = new Set();
  private firestoreUnsubs: Unsubscribe[] = [];
  private realtimeStarted = false;

  constructor() {
    this.loadFromStorage();

    // Automatically merge threads whenever a contact profile is saved or linked
    getContactService().subscribe((evt) => {
      if (evt.action === 'saved' && evt.contact && evt.contact.id) {
        void this.mergeThreadsForContact(evt.contact);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_THREADS || e.key === STORAGE_KEY_EVENTS) {
          this.loadFromStorage();
          this.notifyListeners();
        }
      });

      const bus = getWorkspaceBus();
      bus.subscribe((msg) => {
        if (msg.type === 'COMMS_EVENT_RECORDED') {
          this.loadFromStorage();
          this.notifyListeners();
        }
      });
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const rawThreads = localStorage.getItem(STORAGE_KEY_THREADS);
      if (rawThreads) {
        const parsed = JSON.parse(rawThreads) as CommsThread[];
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            if (t && t.id) this.threads.set(t.id, t);
          }
        }
      }
      const rawEvents = localStorage.getItem(STORAGE_KEY_EVENTS);
      if (rawEvents) {
        const parsed = JSON.parse(rawEvents) as CommsEvent[];
        if (Array.isArray(parsed)) {
          for (const e of parsed) {
            if (e && e.id) this.events.set(e.id, e);
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
      const threadArr = Array.from(this.threads.values())
        .sort((a, b) => (b.lastEventAtMs || 0) - (a.lastEventAtMs || 0))
        .slice(0, MAX_LOCAL_THREADS);
      const eventArr = Array.from(this.events.values())
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
        .slice(0, MAX_LOCAL_EVENTS);
      localStorage.setItem(STORAGE_KEY_THREADS, JSON.stringify(threadArr));
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(eventArr));
    } catch {
      // Ignore storage quota errors
    }
  }

  private notifyListeners(): void {
    if (this.listeners.size === 0) return;
    const snap: CommsThreadSnapshot = {
      threads: this.getThreads(),
      events: this.getAllEvents(),
    };
    this.listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {}
    });
  }

  public startRealtimeSync(): void {
    if (this.realtimeStarted || typeof window === 'undefined' || !isFirebaseConfigured()) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) return;

    this.realtimeStarted = true;
    try {
      const threadsQuery = query(
        collection(db, 'commsThreads'),
        orderBy('lastEventAtMs', 'desc'),
        limit(MAX_LOCAL_THREADS)
      );
      const unsubThreads = onSnapshot(
        threadsQuery,
        (snap) => {
          let changed = false;
          snap.docChanges().forEach((change) => {
            const data = change.doc.data() as CommsThread;
            const id = data.id || change.doc.id;
            if (change.type === 'removed' || data.mergedIntoThreadId) {
              if (this.threads.delete(id)) changed = true;
            } else {
              this.threads.set(id, { ...data, id });
              changed = true;
            }
          });
          if (changed) {
            this.saveToStorage();
            this.notifyListeners();
          }
        },
        () => {
          // Graceful fallback when staff auth is not yet initialized
        }
      );

      const eventsQuery = query(
        collection(db, 'commsEvents'),
        orderBy('timestampMs', 'desc'),
        limit(MAX_LOCAL_EVENTS)
      );
      const unsubEvents = onSnapshot(
        eventsQuery,
        (snap) => {
          let changed = false;
          const touchedThreadIds = new Set<string>();
          snap.docChanges().forEach((change) => {
            const data = change.doc.data() as CommsEvent;
            const id = data.id || change.doc.id;
            if (change.type === 'removed') {
              const existing = this.events.get(id);
              if (existing) touchedThreadIds.add(existing.threadId);
              if (this.events.delete(id)) changed = true;
            } else {
              this.events.set(id, { ...data, id });
              if (data.threadId) touchedThreadIds.add(data.threadId);
              changed = true;
            }
          });
          if (changed) {
            for (const tid of touchedThreadIds) {
              const parent = this.threads.get(tid);
              if (parent) {
                const threadEvents = this.getThreadEvents(tid, true);
                this.threads.set(tid, recomputeCommsThreadRollups(parent, threadEvents));
              }
            }
            this.saveToStorage();
            this.notifyListeners();
          }
        },
        () => {
          // Graceful fallback when staff auth is not yet initialized
        }
      );

      this.firestoreUnsubs.push(unsubThreads, unsubEvents);
    } catch {
      this.realtimeStarted = false;
    }
  }

  public stopRealtimeSync(): void {
    for (const unsub of this.firestoreUnsubs) {
      try {
        unsub();
      } catch {}
    }
    this.firestoreUnsubs = [];
    this.realtimeStarted = false;
  }

  public subscribe(listener: (snapshot: CommsThreadSnapshot) => void): () => void {
    this.startRealtimeSync();
    this.listeners.add(listener);
    try {
      listener({
        threads: this.getThreads(),
        events: this.getAllEvents(),
      });
    } catch {}
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async persistThreadAndEventsToFirestore(
    thread: CommsThread,
    eventsToWrite: CommsEvent[],
    removedThreadIds: string[] = []
  ): Promise<void> {
    if (typeof window === 'undefined' || !isFirebaseConfigured()) return;
    const db = getFirestoreDb();
    if (!db) return;

    try {
      const cleanThread = sanitizePayload(thread, { mode: 'omit' });
      await setDoc(doc(db, 'commsThreads', thread.id), cleanThread, { merge: true });

      for (const evt of eventsToWrite) {
        const cleanEvt = sanitizePayload(evt, { mode: 'omit' });
        await setDoc(doc(db, 'commsEvents', evt.id), cleanEvt, { merge: true });
      }

      for (const oldId of removedThreadIds) {
        if (oldId !== thread.id) {
          await deleteDoc(doc(db, 'commsThreads', oldId)).catch(() => {});
        }
      }
    } catch {
      // Tolerated offline / unauthenticated fallback
    }
  }

  private findMatchingThreadsInternal(criteria: {
    threadId?: string;
    contactId?: string;
    phones?: string[];
    emails?: string[];
  }): CommsThread[] {
    const normPhones = new Set(
      (criteria.phones || []).map((p) => normalizePhone(p)).filter(Boolean)
    );
    const normEmails = new Set(
      (criteria.emails || []).map((e) => normalizeEmail(e)).filter(Boolean)
    );
    const matches: CommsThread[] = [];
    const seen = new Set<string>();

    for (const t of this.threads.values()) {
      if (t.mergedIntoThreadId) continue;
      let hit = false;
      if (criteria.threadId && t.id === criteria.threadId) hit = true;
      if (
        !hit &&
        criteria.contactId &&
        !criteria.contactId.startsWith('temp_') &&
        t.contactId === criteria.contactId
      ) {
        hit = true;
      }
      if (!hit && normPhones.size > 0) {
        const tPhones = [t.primaryPhone, ...(t.phones || [])]
          .map((p) => normalizePhone(p || ''))
          .filter(Boolean);
        if (tPhones.some((p) => normPhones.has(p))) hit = true;
      }
      if (!hit && normEmails.size > 0) {
        const tEmails = [t.primaryEmail, ...(t.emails || [])]
          .map((e) => normalizeEmail(e || ''))
          .filter(Boolean);
        if (tEmails.some((e) => normEmails.has(e))) hit = true;
      }
      if (hit && !seen.has(t.id)) {
        seen.add(t.id);
        matches.push(t);
      }
    }
    return matches;
  }

  /**
   * Records or idempotently updates a `CommsEvent` and recomputes parent `CommsThread` rollups.
   */
  public async recordCommsEvent(
    input: RecordCommsEventInput,
    options?: { skipFirestore?: boolean; skipBroadcast?: boolean }
  ): Promise<{ thread: CommsThread; event: CommsEvent; deduplicated: boolean }> {
    const rawKey =
      input.channel === 'voicemail'
        ? input.recordingSid || input.externalSid || input.id
        : input.channel === 'email'
        ? input.emailMessageId || input.externalSid || input.id
        : input.externalSid || input.id;

    const eventId = buildCommsEventId(input.channel, rawKey);
    const existingEvent = this.events.get(eventId);

    const resolution = getContactService().resolveUnifiedContact({
      phone: input.contactPhone || existingEvent?.contactPhone,
      email: input.contactEmail || existingEvent?.contactEmail,
      name: input.contactName || existingEvent?.contactName,
      contactType: input.contactType,
    });

    const candidateMatches = this.findMatchingThreadsInternal({
      threadId: input.threadId || existingEvent?.threadId || resolution.threadId,
      contactId: resolution.contactId || input.contactId,
      phones: resolution.phones,
      emails: resolution.emails,
    });

    const canonicalThreadId =
      resolution.threadId !== 'thr_unknown'
        ? resolution.threadId
        : input.threadId || existingEvent?.threadId || candidateMatches[0]?.id || 'thr_unknown';

    let removedThreadIds: string[] = [];
    let activeThread: CommsThread | undefined;

    if (
      candidateMatches.length > 1 ||
      (candidateMatches.length === 1 &&
        canonicalThreadId.startsWith('thr_contact_') &&
        candidateMatches[0].id !== canonicalThreadId)
    ) {
      const sourceThreadIds = new Set(candidateMatches.map((t) => t.id));
      const relatedEvents = Array.from(this.events.values()).filter((e) =>
        sourceThreadIds.has(e.threadId)
      );
      const merged = mergeCommsThreads({
        canonicalThreadId,
        threads: candidateMatches,
        events: relatedEvents,
        contact: resolution.contact,
        contactName: resolution.contactName,
        contactType: resolution.contactType,
        phones: resolution.phones,
        emails: resolution.emails,
        corporateAccountId: resolution.corporateAccountId,
        corporateAccountName: resolution.corporateAccountName,
      });
      activeThread = merged.mergedThread;
      removedThreadIds = merged.removedThreadIds;
      for (const oldId of removedThreadIds) {
        this.threads.delete(oldId);
      }
      for (const updEvt of merged.updatedEvents) {
        this.events.set(updEvt.id, updEvt);
      }
      this.threads.set(activeThread.id, activeThread);
    } else {
      activeThread =
        this.threads.get(canonicalThreadId) || candidateMatches[0];
    }

    const effectiveThreadId = activeThread?.id || canonicalThreadId;
    const tsMs =
      input.timestampMs ??
      existingEvent?.timestampMs ??
      (input.timestampIso ? Date.parse(input.timestampIso) : Date.now());
    const tsIso = input.timestampIso || existingEvent?.timestampIso || new Date(tsMs).toISOString();

    const dispatchPhone = COMPANY_CONFIG.phone.primaryRaw || '+13147380100';
    const dispatchEmail = COMPANY_CONFIG.email.dispatch || 'dispatch@chesterfieldtaxi.com';
    const contactAddr =
      input.channel === 'email'
        ? resolution.primaryEmail || normalizeEmail(input.contactEmail) || ''
        : resolution.primaryPhone || normalizePhoneE164(input.contactPhone) || '';
    const companyAddr = input.channel === 'email' ? dispatchEmail : dispatchPhone;

    const defaultUnread =
      input.direction === 'inbound' && input.channel !== 'note' ? true : false;

    const nextEvent: CommsEvent = {
      ...(existingEvent || {}),
      id: eventId,
      threadId: effectiveThreadId,
      channel: input.channel,
      direction: input.direction,
      eventType: input.eventType,
      contactId: resolution.contactId || input.contactId || existingEvent?.contactId,
      contactName:
        resolution.contactName ||
        input.contactName ||
        existingEvent?.contactName ||
        'Customer',
      contactPhone:
        resolution.primaryPhone ||
        normalizePhoneE164(input.contactPhone) ||
        existingEvent?.contactPhone,
      contactEmail:
        resolution.primaryEmail ||
        normalizeEmail(input.contactEmail) ||
        existingEvent?.contactEmail,
      fromAddress:
        input.fromAddress ||
        existingEvent?.fromAddress ||
        (input.direction === 'inbound'
          ? contactAddr
          : input.direction === 'outbound'
          ? companyAddr
          : input.actorName || 'Dispatcher'),
      toAddress:
        input.toAddress ||
        existingEvent?.toAddress ||
        (input.direction === 'inbound'
          ? companyAddr
          : input.direction === 'outbound'
          ? contactAddr
          : resolution.contactName),
      subject: input.subject !== undefined ? input.subject : existingEvent?.subject,
      snippet:
        input.snippet !== undefined
          ? input.snippet
          : existingEvent?.snippet || input.bodyText?.slice(0, 160) || '',
      bodyText: input.bodyText !== undefined ? input.bodyText : existingEvent?.bodyText,
      emailMessageId: input.emailMessageId || existingEvent?.emailMessageId,
      tripId: input.tripId || existingEvent?.tripId,
      deliveryStatus: input.deliveryStatus || existingEvent?.deliveryStatus,
      errorCode: input.errorCode !== undefined ? input.errorCode : existingEvent?.errorCode,
      errorMessage:
        input.errorMessage !== undefined ? input.errorMessage : existingEvent?.errorMessage,
      externalSid: input.externalSid || existingEvent?.externalSid,
      recordingSid: input.recordingSid || existingEvent?.recordingSid,
      durationSeconds:
        input.durationSeconds !== undefined
          ? input.durationSeconds
          : existingEvent?.durationSeconds,
      audioUrl: input.audioUrl || existingEvent?.audioUrl,
      audioDuration: input.audioDuration || existingEvent?.audioDuration,
      transcription:
        input.transcription !== undefined ? input.transcription : existingEvent?.transcription,
      suggestedBooking: input.suggestedBooking || existingEvent?.suggestedBooking,
      isUnread:
        input.isUnread !== undefined
          ? input.isUnread
          : existingEvent
          ? existingEvent.isUnread
          : defaultUnread,
      isArchived:
        input.isArchived !== undefined ? input.isArchived : existingEvent?.isArchived ?? false,
      actorId: input.actorId || existingEvent?.actorId,
      actorName: input.actorName || existingEvent?.actorName,
      timestampIso: tsIso,
      timestampMs: tsMs,
    };

    this.events.set(eventId, nextEvent);

    const nowIso = new Date().toISOString();
    const seedThread: CommsThread = activeThread
      ? {
          ...activeThread,
          contactId: resolution.contactId || activeThread.contactId,
          contactName:
            resolution.contactName && !resolution.contactName.startsWith('+')
              ? resolution.contactName
              : activeThread.contactName || resolution.contactName,
          contactType:
            resolution.corporateAccountId
              ? 'corporate'
              : activeThread.contactType || resolution.contactType,
          corporateAccountId: resolution.corporateAccountId || activeThread.corporateAccountId,
          corporateAccountName:
            resolution.corporateAccountName || activeThread.corporateAccountName,
          primaryPhone: resolution.primaryPhone || activeThread.primaryPhone,
          phones: collectContactPhonesE164(resolution.contact, [
            ...resolution.phones,
            ...(activeThread.phones || []),
          ]),
          primaryEmail: resolution.primaryEmail || activeThread.primaryEmail,
          emails: collectContactEmailsNormalized(resolution.contact, [
            ...resolution.emails,
            ...(activeThread.emails || []),
          ]),
          isArchived: false,
        }
      : {
          id: effectiveThreadId,
          contactId: resolution.contactId,
          contactName: resolution.contactName,
          contactType: resolution.contactType,
          primaryPhone: resolution.primaryPhone,
          phones: resolution.phones,
          primaryEmail: resolution.primaryEmail,
          emails: resolution.emails,
          corporateAccountId: resolution.corporateAccountId,
          corporateAccountName: resolution.corporateAccountName,
          linkedTripIds: nextEvent.tripId ? [nextEvent.tripId] : [],
          channels: [nextEvent.channel],
          lastEventAt: nextEvent.timestampIso,
          lastEventAtMs: nextEvent.timestampMs,
          lastChannel: nextEvent.channel,
          lastDirection: nextEvent.direction,
          lastSubject: nextEvent.subject,
          lastSnippet: nextEvent.snippet,
          unreadCountTotal: 0,
          unreadByChannel: createEmptyUnreadByChannel(),
          isStarred: false,
          isArchived: false,
          createdAt: tsIso,
          updatedAt: nowIso,
        };

    const threadEvents = this.getThreadEvents(effectiveThreadId, true);
    const updatedThread = recomputeCommsThreadRollups(seedThread, threadEvents, nowIso);
    this.threads.set(effectiveThreadId, updatedThread);

    this.saveToStorage();
    this.notifyListeners();

    if (!options?.skipBroadcast) {
      try {
        getWorkspaceBus().publish('COMMS_EVENT_RECORDED', {
          threadId: effectiveThreadId,
          eventId,
          channel: nextEvent.channel,
        });
      } catch {}
    }

    if (!options?.skipFirestore) {
      const eventsToPersist = removedThreadIds.length > 0 ? threadEvents : [nextEvent];
      await this.persistThreadAndEventsToFirestore(
        updatedThread,
        eventsToPersist,
        removedThreadIds
      );
    }

    return {
      thread: updatedThread,
      event: nextEvent,
      deduplicated: Boolean(existingEvent),
    };
  }

  public async addInternalNote(input: {
    id?: string;
    threadId?: string;
    phone?: string;
    email?: string;
    contactName?: string;
    bodyText: string;
    tripId?: string;
    actorId?: string;
    actorName?: string;
    timestampMs?: number;
  }): Promise<{ thread: CommsThread; event: CommsEvent }> {
    const cleanBody = input.bodyText.trim();
    const noteId = input.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const existingThread = input.threadId ? this.threads.get(input.threadId) : undefined;
    const res = await this.recordCommsEvent({
      id: noteId,
      threadId: input.threadId,
      channel: 'note',
      direction: 'internal',
      eventType: 'internal_note',
      contactName: input.contactName || existingThread?.contactName,
      contactPhone: input.phone || existingThread?.primaryPhone,
      contactEmail: input.email || existingThread?.primaryEmail,
      snippet: cleanBody.slice(0, 160),
      bodyText: cleanBody,
      tripId: input.tripId,
      isUnread: false,
      actorId: input.actorId,
      actorName: input.actorName || 'Dispatcher',
      timestampMs: input.timestampMs,
    });
    return { thread: res.thread, event: res.event };
  }

  public async markThreadRead(
    threadId: string,
    channels?: CommsChannel[]
  ): Promise<CommsThread | null> {
    const thread = this.threads.get(threadId);
    if (!thread) return null;

    const channelFilter = channels && channels.length > 0 ? new Set(channels) : null;
    const changedEvents: CommsEvent[] = [];

    for (const evt of this.events.values()) {
      if (evt.threadId !== threadId) continue;
      if (channelFilter && !channelFilter.has(evt.channel)) continue;
      if (evt.isUnread) {
        const updated = { ...evt, isUnread: false };
        this.events.set(evt.id, updated);
        changedEvents.push(updated);
      }
    }

    const updatedThread = recomputeCommsThreadRollups(
      thread,
      this.getThreadEvents(threadId, true)
    );
    this.threads.set(threadId, updatedThread);
    this.saveToStorage();
    this.notifyListeners();
    await this.persistThreadAndEventsToFirestore(updatedThread, changedEvents);
    return updatedThread;
  }

  public async markEventsRead(eventIds: string[]): Promise<void> {
    const touchedThreads = new Map<string, CommsEvent[]>();
    for (const id of eventIds) {
      const evt = this.events.get(id);
      if (evt && evt.isUnread) {
        const updated = { ...evt, isUnread: false };
        this.events.set(id, updated);
        const list = touchedThreads.get(evt.threadId) || [];
        list.push(updated);
        touchedThreads.set(evt.threadId, list);
      }
    }
    for (const [tid, evts] of touchedThreads.entries()) {
      const parent = this.threads.get(tid);
      if (parent) {
        const recomputed = recomputeCommsThreadRollups(parent, this.getThreadEvents(tid, true));
        this.threads.set(tid, recomputed);
        await this.persistThreadAndEventsToFirestore(recomputed, evts);
      }
    }
    if (touchedThreads.size > 0) {
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  public async markThreadsUnread(
    threadIds: string[],
    channel?: CommsChannel
  ): Promise<void> {
    for (const tid of threadIds) {
      const thread = this.threads.get(tid);
      if (!thread) continue;
      const events = this.getThreadEvents(tid);
      const target = [...events]
        .reverse()
        .find((e) => e.channel !== 'note' && (!channel || e.channel === channel));
      const changed: CommsEvent[] = [];
      if (target && !target.isUnread) {
        const updated = { ...target, isUnread: true };
        this.events.set(updated.id, updated);
        changed.push(updated);
      }
      const recomputed = recomputeCommsThreadRollups(thread, this.getThreadEvents(tid, true));
      this.threads.set(tid, recomputed);
      await this.persistThreadAndEventsToFirestore(recomputed, changed);
    }
    this.saveToStorage();
    this.notifyListeners();
  }

  public async markEventsUnread(eventIds: string[]): Promise<void> {
    const touchedThreads = new Map<string, CommsEvent[]>();
    for (const id of eventIds) {
      const evt = this.events.get(id);
      if (evt && !evt.isUnread && evt.channel !== 'note') {
        const updated = { ...evt, isUnread: true };
        this.events.set(id, updated);
        const list = touchedThreads.get(evt.threadId) || [];
        list.push(updated);
        touchedThreads.set(evt.threadId, list);
      }
    }
    for (const [tid, evts] of touchedThreads.entries()) {
      const parent = this.threads.get(tid);
      if (parent) {
        const recomputed = recomputeCommsThreadRollups(parent, this.getThreadEvents(tid, true));
        this.threads.set(tid, recomputed);
        await this.persistThreadAndEventsToFirestore(recomputed, evts);
      }
    }
    if (touchedThreads.size > 0) {
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  public async toggleEventReadStatus(eventId: string): Promise<CommsEvent | null> {
    const evt = this.events.get(eventId);
    if (!evt) return null;
    if (evt.isUnread) {
      await this.markEventsRead([eventId]);
    } else {
      await this.markEventsUnread([eventId]);
    }
    return this.events.get(eventId) || null;
  }

  public async archiveThreads(threadIds: string[]): Promise<void> {
    for (const tid of threadIds) {
      const thread = this.threads.get(tid);
      if (!thread) continue;
      const changedEvents: CommsEvent[] = [];
      for (const evt of this.events.values()) {
        if (evt.threadId === tid && (!evt.isArchived || evt.isUnread)) {
          const updated = { ...evt, isArchived: true, isUnread: false };
          this.events.set(evt.id, updated);
          changedEvents.push(updated);
        }
      }
      const recomputed: CommsThread = {
        ...recomputeCommsThreadRollups(thread, this.getThreadEvents(tid, true)),
        isArchived: true,
      };
      this.threads.set(tid, recomputed);
      await this.persistThreadAndEventsToFirestore(recomputed, changedEvents);
    }
    this.saveToStorage();
    this.notifyListeners();
  }

  public async archiveEvents(eventIds: string[]): Promise<void> {
    const touchedThreads = new Map<string, CommsEvent[]>();
    for (const id of eventIds) {
      const evt = this.events.get(id);
      if (evt && !evt.isArchived) {
        const updated = { ...evt, isArchived: true, isUnread: false };
        this.events.set(id, updated);
        const list = touchedThreads.get(evt.threadId) || [];
        list.push(updated);
        touchedThreads.set(evt.threadId, list);
      }
    }
    for (const [tid, evts] of touchedThreads.entries()) {
      const parent = this.threads.get(tid);
      if (parent) {
        const remainingActive = this.getThreadEvents(tid, false);
        const recomputed: CommsThread = {
          ...recomputeCommsThreadRollups(parent, this.getThreadEvents(tid, true)),
          isArchived: remainingActive.length === 0 ? true : parent.isArchived,
        };
        this.threads.set(tid, recomputed);
        await this.persistThreadAndEventsToFirestore(recomputed, evts);
      }
    }
    if (touchedThreads.size > 0) {
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Links a `Trip` to its unified `CommsThread` and automatically merges any previously
   * separate phone-only and email-only threads when the trip carries both phone & email.
   */
  public async linkTripToThread(input: {
    tripId: string;
    threadId?: string;
    phone?: string;
    email?: string;
    passengerName?: string;
    corporateAccountId?: string;
    corporateAccountName?: string;
  }): Promise<CommsThread | null> {
    if (!input.tripId) return null;

    const resolution = getContactService().resolveUnifiedContact({
      phone: input.phone,
      email: input.email,
      name: input.passengerName,
      autoLink: Boolean(input.phone && input.email),
    });

    if (resolution.contact) {
      await this.mergeThreadsForContact(resolution.contact);
    }

    const targetThread =
      (input.threadId ? this.threads.get(input.threadId) : undefined) ||
      this.threads.get(resolution.threadId) ||
      this.findMatchingThreadsInternal({
        contactId: resolution.contactId,
        phones: resolution.phones,
        emails: resolution.emails,
      })[0];

    if (!targetThread) return null;

    if (!targetThread.linkedTripIds.includes(input.tripId)) {
      const updated: CommsThread = {
        ...targetThread,
        linkedTripIds: [...targetThread.linkedTripIds, input.tripId],
        corporateAccountId: input.corporateAccountId || targetThread.corporateAccountId,
        corporateAccountName: input.corporateAccountName || targetThread.corporateAccountName,
        updatedAt: new Date().toISOString(),
      };
      this.threads.set(updated.id, updated);
      this.saveToStorage();
      this.notifyListeners();
      await this.persistThreadAndEventsToFirestore(updated, []);
      return updated;
    }

    return targetThread;
  }

  /**
   * Merges all existing threads matching a contact's ID, phones, or emails into a single
   * canonical `CommsThread` and re-points every child `CommsEvent.threadId`.
   */
  public async mergeThreadsForContact(
    contactOrInput:
      | ContactRecord
      | {
          id?: string;
          name?: string;
          phone?: string;
          email?: string;
          phones?: string[];
          emails?: string[];
          corporateAccountId?: string;
          corporateAccountName?: string;
          contactType?: CommsContactType;
        }
  ): Promise<CommsThread | null> {
    const isFullContact = 'updatedAt' in contactOrInput && typeof contactOrInput.phone === 'string';
    const contact = isFullContact
      ? (contactOrInput as ContactRecord)
      : contactOrInput.id
      ? getContactService().getContactById(contactOrInput.id)
      : null;

    const phones = collectContactPhonesE164(contact, [
      contactOrInput.phone,
      ...((contactOrInput as any).phones || []),
    ]);
    const emails = collectContactEmailsNormalized(contact, [
      contactOrInput.email,
      ...((contactOrInput as any).emails || []),
    ]);

    const canonicalThreadId = resolveCanonicalThreadId({
      contact,
      contactId: contact?.id || contactOrInput.id,
      phone: phones[0],
      email: emails[0],
    });
    if (canonicalThreadId === 'thr_unknown') return null;

    const matchingThreads = this.findMatchingThreadsInternal({
      threadId: canonicalThreadId,
      contactId: contact?.id || contactOrInput.id,
      phones,
      emails,
    });

    if (matchingThreads.length === 0) return null;
    if (
      matchingThreads.length === 1 &&
      matchingThreads[0].id === canonicalThreadId &&
      matchingThreads[0].phones.length >= phones.length &&
      matchingThreads[0].emails.length >= emails.length
    ) {
      return matchingThreads[0];
    }

    const sourceIds = new Set(matchingThreads.map((t) => t.id));
    const matchingEvents = Array.from(this.events.values()).filter((e) =>
      sourceIds.has(e.threadId)
    );

    const { mergedThread, updatedEvents, removedThreadIds } = mergeCommsThreads({
      canonicalThreadId,
      threads: matchingThreads,
      events: matchingEvents,
      contact,
      contactName: contact?.name || contactOrInput.name,
      contactType: (contactOrInput as any).contactType,
      phones,
      emails,
      corporateAccountId: contact?.corporateAccountId || contactOrInput.corporateAccountId,
      corporateAccountName: contact?.corporateAccountName || contactOrInput.corporateAccountName,
    });

    for (const oldId of removedThreadIds) {
      this.threads.delete(oldId);
    }
    for (const evt of updatedEvents) {
      this.events.set(evt.id, evt);
    }
    this.threads.set(mergedThread.id, mergedThread);

    this.saveToStorage();
    this.notifyListeners();
    await this.persistThreadAndEventsToFirestore(mergedThread, updatedEvents, removedThreadIds);

    return mergedThread;
  }

  public hydrateFromServerSync(payload: {
    threads?: CommsThread[];
    events?: CommsEvent[];
  }): void {
    let changed = false;
    const touchedThreadIds = new Set<string>();

    if (Array.isArray(payload.threads)) {
      for (const t of payload.threads) {
        if (!t || !t.id || t.mergedIntoThreadId) continue;
        const existing = this.threads.get(t.id);
        if (!existing || (t.lastEventAtMs || 0) >= (existing.lastEventAtMs || 0)) {
          this.threads.set(t.id, { ...existing, ...t });
          touchedThreadIds.add(t.id);
          changed = true;
        }
      }
    }

    if (Array.isArray(payload.events)) {
      for (const evt of payload.events) {
        if (!evt || !evt.id) continue;
        const existing = this.events.get(evt.id);
        if (
          !existing ||
          existing.transcription !== evt.transcription ||
          existing.deliveryStatus !== evt.deliveryStatus ||
          existing.audioUrl !== evt.audioUrl
        ) {
          this.events.set(evt.id, {
            ...existing,
            ...evt,
            // Preserve local read state if user already read it locally
            isUnread: existing && !existing.isUnread ? false : evt.isUnread,
          });
          touchedThreadIds.add(evt.threadId);
          changed = true;
        }
      }
    }

    if (changed) {
      for (const tid of touchedThreadIds) {
        const parent = this.threads.get(tid);
        if (parent) {
          this.threads.set(tid, recomputeCommsThreadRollups(parent, this.getThreadEvents(tid, true)));
        }
      }
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  public getThreads(options?: { includeArchived?: boolean }): CommsThread[] {
    return Array.from(this.threads.values())
      .filter((t) => !t.mergedIntoThreadId && (options?.includeArchived || !t.isArchived))
      .sort((a, b) => (b.lastEventAtMs || 0) - (a.lastEventAtMs || 0));
  }

  public getThreadById(threadId: string): CommsThread | null {
    return this.threads.get(threadId) || null;
  }

  public findThread(queryInput: {
    threadId?: string;
    contactId?: string;
    phone?: string;
    email?: string;
  }): CommsThread | null {
    if (queryInput.threadId && this.threads.has(queryInput.threadId)) {
      return this.threads.get(queryInput.threadId) || null;
    }
    const resolution = getContactService().resolveUnifiedContact({
      phone: queryInput.phone,
      email: queryInput.email,
      autoLink: false,
    });
    if (this.threads.has(resolution.threadId)) {
      return this.threads.get(resolution.threadId) || null;
    }
    const matches = this.findMatchingThreadsInternal({
      contactId: queryInput.contactId || resolution.contactId,
      phones: queryInput.phone ? [queryInput.phone, ...resolution.phones] : resolution.phones,
      emails: queryInput.email ? [queryInput.email, ...resolution.emails] : resolution.emails,
    });
    return matches[0] || null;
  }

  public getThreadEvents(threadId: string, includeArchived = false): CommsEvent[] {
    return Array.from(this.events.values())
      .filter((e) => e.threadId === threadId && (includeArchived || !e.isArchived))
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  }

  public getAllEvents(options?: { includeArchived?: boolean }): CommsEvent[] {
    return Array.from(this.events.values())
      .filter((e) => options?.includeArchived || !e.isArchived)
      .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }

  public getInteractionEvents(options?: { includeArchived?: boolean }): InteractionEvent[] {
    return this.getAllEvents(options).map((evt) =>
      commsEventToInteractionEvent(evt, this.threads.get(evt.threadId))
    );
  }

  public resetForTests(): void {
    this.stopRealtimeSync();
    this.threads.clear();
    this.events.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY_THREADS);
        localStorage.removeItem(STORAGE_KEY_EVENTS);
      } catch {}
    }
  }
}

let commsThreadServiceInstance: CommsThreadService | null = null;

export function getCommsThreadService(): CommsThreadService {
  if (!commsThreadServiceInstance) {
    commsThreadServiceInstance = new CommsThreadService();
  }
  return commsThreadServiceInstance;
}
