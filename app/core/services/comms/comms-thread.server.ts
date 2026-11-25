/**
 * Server-Isolated Unified Multi-Channel Thread Ingestion Engine (`comms-thread.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) — never imported into client bundles.
 *
 * Responsibilities:
 * 1. Idempotent server-side persistence to `/commsThreads/{threadId}`,
 *    `/commsEvents/{eventId}`, and `/telephonyWebhookEvents/{eventId}` via Firestore REST
 *    using `getServiceAccountDatastoreToken()` or a verified dispatcher `rawToken`.
 * 2. Bounded in-memory server buffer (`commsServerStore`) retaining inbound Twilio
 *    webhooks (`incoming_sms`, `voicemail_recorded`, `voicemail_transcription`,
 *    `call_status_callback`, `call_recording_status`) even when `FIREBASE_SERVICE_ACCOUNT_JSON`
 *    is not configured, and flushing dirty records to Firestore whenever an authenticated
 *    dispatcher invokes `sync_comms`.
 */

import { COMPANY_CONFIG } from '../../../config/companyConfig';
import {
  buildCommsEventId,
  createEmptyUnreadByChannel,
  reconcileCommsEventStatus,
  reconcileCommsThreadStatus,
  type CommsChannel,
  type CommsEvent,
  type CommsThread,
  type RecordCommsEventInput,
  type TelephonyWebhookEventRecord,
} from '../../types/comms';
import { fetchFirestoreDocumentRest } from '../auth/server-auth.server';
import {
  collectContactEmailsNormalized,
  collectContactPhonesE164,
  getContactService,
  mergeCommsThreads,
  normalizeEmail,
  normalizePhone,
  normalizePhoneE164,
  recomputeCommsThreadRollups,
} from '../customer/contact.service';
import { isFirebaseConfigured } from '../firebase';
import {
  getServiceAccountDatastoreToken,
  listFirestoreCollectionRest,
  patchFirestoreDocumentRest,
} from '../payments/stripe-webhook.server';

const MAX_SERVER_THREADS = 500;
const MAX_SERVER_EVENTS = 1000;
const MAX_SERVER_WEBHOOK_EVENTS = 500;

export interface CommsServerStore {
  threads: Map<string, CommsThread>;
  events: Map<string, CommsEvent>;
  webhookEvents: Map<string, TelephonyWebhookEventRecord>;
  dirtyThreadIds: Set<string>;
  dirtyEventIds: Set<string>;
  dirtyWebhookEventIds: Set<string>;
}

const commsServerStore: CommsServerStore = ((globalThis as any).__ct_comms_server_store ||= {
  threads: new Map<string, CommsThread>(),
  events: new Map<string, CommsEvent>(),
  webhookEvents: new Map<string, TelephonyWebhookEventRecord>(),
  dirtyThreadIds: new Set<string>(),
  dirtyEventIds: new Set<string>(),
  dirtyWebhookEventIds: new Set<string>(),
});

export function getCommsServerStore(): CommsServerStore {
  return commsServerStore;
}

export function resetCommsServerStoreForTests(): void {
  commsServerStore.threads.clear();
  commsServerStore.events.clear();
  commsServerStore.webhookEvents.clear();
  commsServerStore.dirtyThreadIds.clear();
  commsServerStore.dirtyEventIds.clear();
  commsServerStore.dirtyWebhookEventIds.clear();
}

function enforceBoundedMap<V>(map: Map<string, V>, maxEntries: number): void {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

function findMatchingServerThreads(criteria: {
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

  for (const t of commsServerStore.threads.values()) {
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

function getServerThreadEvents(
  threadId: string,
  includeArchived = true,
  includeDeleted = false
): CommsEvent[] {
  return Array.from(commsServerStore.events.values())
    .filter(
      (e) =>
        e.threadId === threadId &&
        (includeDeleted || !e.isDeleted) &&
        (includeArchived || !e.isArchived)
    )
    .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
}

async function resolveServerFirestoreToken(staffBearerToken?: string): Promise<string | null> {
  if (staffBearerToken && staffBearerToken.trim()) {
    return staffBearerToken.trim();
  }
  return getServiceAccountDatastoreToken();
}

export interface IngestCommsServerOptions {
  staffBearerToken?: string;
  webhookAction?: string;
  webhookId?: string;
  skipFirestore?: boolean;
  nowMs?: number;
}

export interface IngestCommsServerResult {
  thread: CommsThread;
  event: CommsEvent;
  deduplicated: boolean;
  webhookDuplicate: boolean;
  persistedToFirestore: boolean;
}

/**
 * Idempotently ingests a `CommsEvent` on the server, updating `commsServerStore`
 * and writing to `/commsThreads`, `/commsEvents`, and `/telephonyWebhookEvents`
 * via Firestore REST when credentials are available.
 */
export async function ingestCommsEventServer(
  input: RecordCommsEventInput,
  options?: IngestCommsServerOptions
): Promise<IngestCommsServerResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const rawKey =
    input.channel === 'voicemail'
      ? input.recordingSid || input.externalSid || input.id
      : input.channel === 'email'
      ? input.emailMessageId || input.externalSid || input.id
      : input.externalSid || input.id;

  const eventId = buildCommsEventId(input.channel, rawKey);

  // Check exact webhook delivery idempotency first
  const webhookEventId = options?.webhookAction
    ? options.webhookId ||
      `${options.webhookAction}_${String(rawKey || eventId).replace(/[\/\s]+/g, '_')}`
    : undefined;

  if (webhookEventId && commsServerStore.webhookEvents.has(webhookEventId)) {
    const existingWebhook = commsServerStore.webhookEvents.get(webhookEventId)!;
    const existingEvt = commsServerStore.events.get(existingWebhook.commsEventId || eventId);
    const existingThr = existingEvt
      ? commsServerStore.threads.get(existingEvt.threadId)
      : undefined;

    // For status callbacks where status may progress (e.g. ringing -> completed), only short-circuit
    // when status is unchanged
    const incomingStatus = input.deliveryStatus || '';
    if (
      existingEvt &&
      existingThr &&
      (!incomingStatus || existingWebhook.status === incomingStatus)
    ) {
      return {
        thread: existingThr,
        event: existingEvt,
        deduplicated: true,
        webhookDuplicate: true,
        persistedToFirestore: !commsServerStore.dirtyEventIds.has(existingEvt.id),
      };
    }
  }

  const existingEvent = commsServerStore.events.get(eventId);
  const resolution = getContactService().resolveUnifiedContact({
    phone: input.contactPhone || existingEvent?.contactPhone,
    email: input.contactEmail || existingEvent?.contactEmail,
    name: input.contactName || existingEvent?.contactName,
    contactType: input.contactType,
  });

  const candidateMatches = findMatchingServerThreads({
    threadId: input.threadId || existingEvent?.threadId || resolution.threadId,
    contactId: resolution.contactId || input.contactId,
    phones: resolution.phones,
    emails: resolution.emails,
  });

  const canonicalThreadId = resolution.threadId.startsWith('thr_contact_')
    ? resolution.threadId
    : (input.threadId && input.threadId !== 'thr_unknown' ? input.threadId : '') ||
      (resolution.threadId !== 'thr_unknown' ? resolution.threadId : '') ||
      existingEvent?.threadId ||
      candidateMatches[0]?.id ||
      'thr_unknown';

  let activeThread: CommsThread | undefined;
  if (
    candidateMatches.length > 1 ||
    (candidateMatches.length === 1 &&
      canonicalThreadId.startsWith('thr_contact_') &&
      candidateMatches[0].id !== canonicalThreadId)
  ) {
    const sourceIds = new Set(candidateMatches.map((t) => t.id));
    const relatedEvents = Array.from(commsServerStore.events.values()).filter((e) =>
      sourceIds.has(e.threadId)
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
      nowIso,
    });
    activeThread = merged.mergedThread;
    for (const oldId of merged.removedThreadIds) {
      commsServerStore.threads.delete(oldId);
      commsServerStore.dirtyThreadIds.delete(oldId);
    }
    for (const updEvt of merged.updatedEvents) {
      commsServerStore.events.set(updEvt.id, updEvt);
      commsServerStore.dirtyEventIds.add(updEvt.id);
    }
    commsServerStore.threads.set(activeThread.id, activeThread);
  } else {
    activeThread = commsServerStore.threads.get(canonicalThreadId) || candidateMatches[0];
  }

  const effectiveThreadId = activeThread?.id || canonicalThreadId;
  const tsMs =
    input.timestampMs ??
    existingEvent?.timestampMs ??
    (input.timestampIso ? Date.parse(input.timestampIso) : nowMs);
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

  const candidateEvent: CommsEvent = {
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
    isDeleted:
      input.isDeleted !== undefined ? input.isDeleted : existingEvent?.isDeleted ?? false,
    ...(input.statusUpdatedAtMs !== undefined
      ? { statusUpdatedAtMs: input.statusUpdatedAtMs }
      : {}),
    actorId: input.actorId || existingEvent?.actorId,
    actorName: input.actorName || existingEvent?.actorName,
    timestampIso: tsIso,
    timestampMs: tsMs,
  };

  // Reconcile status with LWW + sticky isDeleted tombstone so retries/syncs never resurrect deleted or read items
  const nextEvent = reconcileCommsEventStatus(existingEvent, candidateEvent);

  commsServerStore.events.set(eventId, nextEvent);
  enforceBoundedMap(commsServerStore.events, MAX_SERVER_EVENTS);

  const shouldWakeThread =
    !existingEvent &&
    !nextEvent.isDeleted &&
    !nextEvent.isArchived &&
    nextEvent.timestampMs > (activeThread?.statusUpdatedAtMs || 0);

  const seedThread: CommsThread = activeThread
    ? {
        ...activeThread,
        contactId: resolution.contactId || activeThread.contactId,
        contactName:
          resolution.contactName && !resolution.contactName.startsWith('+')
            ? resolution.contactName
            : activeThread.contactName || resolution.contactName,
        contactType: resolution.corporateAccountId
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
        isArchived: shouldWakeThread ? false : Boolean(activeThread.isArchived),
        isDeleted: shouldWakeThread ? false : Boolean(activeThread.isDeleted),
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
        isArchived: Boolean(nextEvent.isArchived),
        isDeleted: Boolean(nextEvent.isDeleted),
        ...(nextEvent.statusUpdatedAtMs !== undefined
          ? { statusUpdatedAtMs: nextEvent.statusUpdatedAtMs }
          : {}),
        createdAt: tsIso,
        updatedAt: nowIso,
      };

  const updatedThread = recomputeCommsThreadRollups(
    seedThread,
    getServerThreadEvents(effectiveThreadId, true, false),
    nowIso
  );
  commsServerStore.threads.set(effectiveThreadId, updatedThread);
  enforceBoundedMap(commsServerStore.threads, MAX_SERVER_THREADS);

  commsServerStore.dirtyThreadIds.add(effectiveThreadId);
  commsServerStore.dirtyEventIds.add(eventId);

  let webhookRecord: TelephonyWebhookEventRecord | undefined;
  if (webhookEventId && options?.webhookAction) {
    webhookRecord = {
      id: webhookEventId,
      action: options.webhookAction,
      externalSid: nextEvent.externalSid,
      callSid: nextEvent.channel === 'call' ? nextEvent.externalSid : undefined,
      recordingSid: nextEvent.recordingSid,
      messageSid: nextEvent.channel === 'sms' ? nextEvent.externalSid : undefined,
      threadId: effectiveThreadId,
      commsEventId: eventId,
      fromAddress: nextEvent.fromAddress,
      toAddress: nextEvent.toAddress,
      status: nextEvent.deliveryStatus || 'processed',
      processedAt: nowIso,
    };
    commsServerStore.webhookEvents.set(webhookEventId, webhookRecord);
    enforceBoundedMap(commsServerStore.webhookEvents, MAX_SERVER_WEBHOOK_EVENTS);
    commsServerStore.dirtyWebhookEventIds.add(webhookEventId);
  }

  let persistedToFirestore = false;
  if (!options?.skipFirestore && isFirebaseConfigured()) {
    const token = await resolveServerFirestoreToken(options?.staffBearerToken);
    if (token) {
      const [thrOk, evtOk] = await Promise.all([
        patchFirestoreDocumentRest(
          'commsThreads',
          updatedThread.id,
          updatedThread as unknown as Record<string, unknown>,
          token
        ),
        patchFirestoreDocumentRest(
          'commsEvents',
          nextEvent.id,
          nextEvent as unknown as Record<string, unknown>,
          token
        ),
      ]);
      if (thrOk) commsServerStore.dirtyThreadIds.delete(updatedThread.id);
      if (evtOk) commsServerStore.dirtyEventIds.delete(nextEvent.id);
      if (webhookRecord) {
        const whOk = await patchFirestoreDocumentRest(
          'telephonyWebhookEvents',
          webhookRecord.id,
          webhookRecord as unknown as Record<string, unknown>,
          token
        );
        if (whOk) commsServerStore.dirtyWebhookEventIds.delete(webhookRecord.id);
      }
      persistedToFirestore = thrOk && evtOk;
    }
  }

  return {
    thread: updatedThread,
    event: nextEvent,
    deduplicated: Boolean(existingEvent),
    webhookDuplicate: false,
    persistedToFirestore,
  };
}

/**
 * Updates an existing voicemail `CommsEvent` (`vm_${RecordingSid}`) in place when Twilio's
 * asynchronous `voicemail_transcription` callback arrives — never creating a duplicate event.
 */
export async function updateVoicemailTranscriptionServer(input: {
  recordingSid?: string;
  callSid?: string;
  transcription: string;
  from?: string;
  staffBearerToken?: string;
  skipFirestore?: boolean;
  nowMs?: number;
}): Promise<{
  updated: boolean;
  event?: CommsEvent;
  thread?: CommsThread;
  webhookDuplicate?: boolean;
}> {
  const cleanTranscript = (input.transcription || '').trim();
  const key = input.recordingSid || input.callSid || '';
  if (!key) {
    return { updated: false };
  }

  const webhookId = `voicemail_transcription_${key.replace(/[\/\s]+/g, '_')}`;
  if (commsServerStore.webhookEvents.has(webhookId)) {
    const wh = commsServerStore.webhookEvents.get(webhookId)!;
    const existingEvt = wh.commsEventId ? commsServerStore.events.get(wh.commsEventId) : undefined;
    if (existingEvt && existingEvt.transcription === cleanTranscript) {
      return {
        updated: true,
        event: existingEvt,
        thread: commsServerStore.threads.get(existingEvt.threadId),
        webhookDuplicate: true,
      };
    }
  }

  let targetEvent: CommsEvent | undefined;
  if (input.recordingSid) {
    const vmId = buildCommsEventId('voicemail', input.recordingSid);
    targetEvent = commsServerStore.events.get(vmId);
  }
  if (!targetEvent) {
    for (const evt of commsServerStore.events.values()) {
      if (evt.channel !== 'voicemail') continue;
      if (
        (input.recordingSid &&
          (evt.recordingSid === input.recordingSid || evt.externalSid === input.recordingSid)) ||
        (input.callSid && evt.externalSid === input.callSid)
      ) {
        targetEvent = evt;
        break;
      }
    }
  }

  const token = !input.skipFirestore
    ? await resolveServerFirestoreToken(input.staffBearerToken)
    : null;

  if (!targetEvent && input.recordingSid && token && isFirebaseConfigured()) {
    const vmId = buildCommsEventId('voicemail', input.recordingSid);
    const remoteDoc = await fetchFirestoreDocumentRest('commsEvents', vmId, token);
    if (remoteDoc && remoteDoc.id) {
      targetEvent = remoteDoc as CommsEvent;
      commsServerStore.events.set(targetEvent.id, targetEvent);
    }
  }

  if (!targetEvent) {
    // If voicemail_transcription arrived out-of-order before voicemail_recorded, create canonical vm_${key}
    const created = await ingestCommsEventServer(
      {
        channel: 'voicemail',
        direction: 'inbound',
        eventType: 'voicemail',
        externalSid: key,
        recordingSid: input.recordingSid,
        contactPhone: input.from,
        snippet: cleanTranscript ? `Voicemail: "${cleanTranscript}"` : 'Voicemail message',
        bodyText: cleanTranscript,
        transcription: cleanTranscript,
        suggestedBooking: {
          passengerName: input.from,
          passengerPhone: input.from,
          notes: cleanTranscript ? `Voicemail: "${cleanTranscript}"` : 'New Voicemail',
        },
        isUnread: true,
      },
      {
        staffBearerToken: input.staffBearerToken,
        webhookAction: 'voicemail_transcription',
        webhookId,
        skipFirestore: input.skipFirestore,
        nowMs: input.nowMs,
      }
    );
    return {
      updated: true,
      event: created.event,
      thread: created.thread,
      webhookDuplicate: created.webhookDuplicate,
    };
  }

  const res = await ingestCommsEventServer(
    {
      id: targetEvent.id,
      threadId: targetEvent.threadId,
      channel: 'voicemail',
      direction: 'inbound',
      eventType: 'voicemail',
      externalSid: targetEvent.externalSid || key,
      recordingSid: input.recordingSid || targetEvent.recordingSid,
      contactPhone: targetEvent.contactPhone || input.from,
      contactName: targetEvent.contactName,
      snippet: cleanTranscript ? `Voicemail: "${cleanTranscript}"` : targetEvent.snippet,
      bodyText: cleanTranscript || targetEvent.bodyText,
      transcription: cleanTranscript,
      suggestedBooking: {
        ...(targetEvent.suggestedBooking || {}),
        notes: cleanTranscript
          ? `Voicemail: "${cleanTranscript}"`
          : targetEvent.suggestedBooking?.notes,
      },
      isUnread: targetEvent.isUnread,
      timestampMs: targetEvent.timestampMs,
      timestampIso: targetEvent.timestampIso,
    },
    {
      staffBearerToken: input.staffBearerToken,
      webhookAction: 'voicemail_transcription',
      webhookId,
      skipFirestore: input.skipFirestore,
      nowMs: input.nowMs,
    }
  );

  return {
    updated: true,
    event: res.event,
    thread: res.thread,
    webhookDuplicate: res.webhookDuplicate,
  };
}

/**
 * Attaches a completed call recording (`call_recording_status`) onto an existing `call_${CallSid}`
 * event (or creates one if the call originated externally) without duplicating call events.
 */
export async function attachCallRecordingServer(input: {
  recordingSid: string;
  callSid?: string;
  durationSeconds: number;
  audioDuration: string;
  audioUrl: string;
  status?: string;
  from?: string;
  to?: string;
  staffBearerToken?: string;
  skipFirestore?: boolean;
  nowMs?: number;
}): Promise<IngestCommsServerResult> {
  const existingCallId = input.callSid ? buildCommsEventId('call', input.callSid) : undefined;
  const existingCall = existingCallId ? commsServerStore.events.get(existingCallId) : undefined;

  return ingestCommsEventServer(
    {
      id: existingCall?.id || existingCallId || buildCommsEventId('call', input.recordingSid),
      threadId: existingCall?.threadId,
      channel: 'call',
      direction: existingCall?.direction || 'inbound',
      eventType: existingCall?.eventType || 'call_inbound',
      externalSid: input.callSid || existingCall?.externalSid || input.recordingSid,
      recordingSid: input.recordingSid,
      contactPhone: existingCall?.contactPhone || input.from,
      contactName: existingCall?.contactName,
      durationSeconds: input.durationSeconds,
      audioDuration: input.audioDuration,
      audioUrl: input.audioUrl,
      deliveryStatus: input.status || existingCall?.deliveryStatus || 'completed',
      snippet: existingCall?.snippet || `Recorded Call (${input.audioDuration})`,
      isUnread: existingCall ? existingCall.isUnread : false,
    },
    {
      staffBearerToken: input.staffBearerToken,
      webhookAction: 'call_recording_status',
      webhookId: `call_recording_status_${input.recordingSid}`,
      skipFirestore: input.skipFirestore,
      nowMs: input.nowMs,
    }
  );
}

export interface UpdateCommsStatusServerInput {
  eventIds?: string[];
  threadIds?: string[];
  channels?: CommsChannel[];
  isUnread?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  statusUpdatedAtMs?: number;
  events?: CommsEvent[];
  threads?: CommsThread[];
  staffBearerToken?: string;
  skipFirestore?: boolean;
  nowMs?: number;
}

export interface UpdateCommsStatusServerResult {
  threads: CommsThread[];
  events: CommsEvent[];
  persistedToFirestore: boolean;
}

function resolveServerStoredEvent(rawId: string): CommsEvent | undefined {
  const direct = commsServerStore.events.get(rawId);
  if (direct) return direct;
  for (const prefix of ['sms_', 'vm_', 'call_', 'em_', 'note_']) {
    const prefixed = commsServerStore.events.get(`${prefix}${rawId}`);
    if (prefixed) return prefixed;
  }
  return undefined;
}

/**
 * Authoritatively mutates read/unread, archive/unarchive, and soft-delete status on
 * `commsServerStore` with `statusUpdatedAtMs` LWW + sticky `isDeleted` tombstones,
 * recomputes parent thread rollups, and flushes dirty records to Firestore REST.
 */
export async function updateCommsStatusServer(
  input: UpdateCommsStatusServerInput
): Promise<UpdateCommsStatusServerResult> {
  const nowMs = input.nowMs ?? Date.now();
  const mutationTs = input.statusUpdatedAtMs ?? nowMs;
  const nowIso = new Date(nowMs).toISOString();

  const touchedThreadIds = new Set<string>();
  const mutatedEventsMap = new Map<string, CommsEvent>();

  // 1. Reconcile any client-provided thread snapshots (handles cold-start server store)
  if (Array.isArray(input.threads)) {
    for (const ct of input.threads) {
      if (!ct || !ct.id || ct.mergedIntoThreadId) continue;
      const existing = commsServerStore.threads.get(ct.id);
      const reconciled = reconcileCommsThreadStatus(existing, {
        ...ct,
        statusUpdatedAtMs: ct.statusUpdatedAtMs ?? mutationTs,
      });
      commsServerStore.threads.set(ct.id, reconciled);
      enforceBoundedMap(commsServerStore.threads, MAX_SERVER_THREADS);
      commsServerStore.dirtyThreadIds.add(ct.id);
      touchedThreadIds.add(ct.id);
    }
  }

  // 2. Reconcile any client-provided event snapshots (handles cold-start server store)
  if (Array.isArray(input.events)) {
    for (const ce of input.events) {
      if (!ce || !ce.id) continue;
      const existing = commsServerStore.events.get(ce.id);
      const reconciled = reconcileCommsEventStatus(existing, {
        ...ce,
        statusUpdatedAtMs: ce.statusUpdatedAtMs ?? mutationTs,
      });
      commsServerStore.events.set(ce.id, reconciled);
      enforceBoundedMap(commsServerStore.events, MAX_SERVER_EVENTS);
      commsServerStore.dirtyEventIds.add(ce.id);
      mutatedEventsMap.set(ce.id, reconciled);
      if (reconciled.threadId) touchedThreadIds.add(reconciled.threadId);
    }
  }

  // 3. Apply explicit eventIds status mutations
  if (Array.isArray(input.eventIds)) {
    for (const rawId of input.eventIds) {
      if (!rawId) continue;
      const existing = resolveServerStoredEvent(rawId);
      if (!existing) continue;
      const candidate: CommsEvent = {
        ...existing,
        isDeleted:
          input.isDeleted !== undefined
            ? Boolean(existing.isDeleted || input.isDeleted)
            : existing.isDeleted,
        isArchived:
          input.isArchived !== undefined ? input.isArchived : existing.isArchived,
        isUnread:
          input.isDeleted || existing.isDeleted || input.isArchived
            ? false
            : input.isUnread !== undefined
            ? input.isUnread
            : existing.isUnread,
        statusUpdatedAtMs: mutationTs,
      };
      const reconciled = reconcileCommsEventStatus(existing, candidate);
      commsServerStore.events.set(reconciled.id, reconciled);
      commsServerStore.dirtyEventIds.add(reconciled.id);
      mutatedEventsMap.set(reconciled.id, reconciled);
      if (reconciled.threadId) touchedThreadIds.add(reconciled.threadId);
    }
  }

  // 4. Apply explicit threadIds status mutations
  const channelSet =
    Array.isArray(input.channels) && input.channels.length > 0
      ? new Set<CommsChannel>(input.channels)
      : null;

  if (Array.isArray(input.threadIds)) {
    for (const tid of input.threadIds) {
      if (!tid) continue;
      touchedThreadIds.add(tid);
      const existingThread = commsServerStore.threads.get(tid);
      const threadEvents = getServerThreadEvents(tid, true, true);

      if (input.isUnread === true && !input.isDeleted && !input.isArchived) {
        const targetEvt = [...threadEvents]
          .reverse()
          .find(
            (e) =>
              !e.isDeleted &&
              e.channel !== 'note' &&
              (!channelSet || channelSet.has(e.channel))
          );
        if (targetEvt) {
          const reconciled = reconcileCommsEventStatus(targetEvt, {
            ...targetEvt,
            isUnread: true,
            statusUpdatedAtMs: mutationTs,
          });
          commsServerStore.events.set(reconciled.id, reconciled);
          commsServerStore.dirtyEventIds.add(reconciled.id);
          mutatedEventsMap.set(reconciled.id, reconciled);
        }
      } else {
        for (const evt of threadEvents) {
          if (channelSet && !channelSet.has(evt.channel)) continue;
          if (
            input.isDeleted === undefined &&
            input.isArchived === undefined &&
            input.isUnread === undefined
          ) {
            continue;
          }
          const candidate: CommsEvent = {
            ...evt,
            isDeleted:
              input.isDeleted !== undefined
                ? Boolean(evt.isDeleted || input.isDeleted)
                : evt.isDeleted,
            isArchived:
              input.isArchived !== undefined ? input.isArchived : evt.isArchived,
            isUnread:
              input.isDeleted || evt.isDeleted || input.isArchived
                ? false
                : input.isUnread !== undefined
                ? input.isUnread
                : evt.isUnread,
            statusUpdatedAtMs: mutationTs,
          };
          const reconciled = reconcileCommsEventStatus(evt, candidate);
          commsServerStore.events.set(reconciled.id, reconciled);
          commsServerStore.dirtyEventIds.add(reconciled.id);
          mutatedEventsMap.set(reconciled.id, reconciled);
        }
      }

      if (existingThread && !channelSet) {
        const candidateThread: CommsThread = {
          ...existingThread,
          isDeleted:
            input.isDeleted !== undefined
              ? Boolean(existingThread.isDeleted || input.isDeleted)
              : existingThread.isDeleted,
          isArchived:
            input.isArchived !== undefined
              ? input.isArchived
              : existingThread.isArchived,
          statusUpdatedAtMs: mutationTs,
          updatedAt: nowIso,
        };
        const reconciledThread = reconcileCommsThreadStatus(existingThread, candidateThread);
        commsServerStore.threads.set(tid, reconciledThread);
        commsServerStore.dirtyThreadIds.add(tid);
      }
    }
  }

  // 5. Recompute rollups for all touched threads
  const updatedThreads: CommsThread[] = [];
  for (const tid of touchedThreadIds) {
    const thr = commsServerStore.threads.get(tid);
    if (!thr) continue;
    const allThrEvents = getServerThreadEvents(tid, true, true);
    const nonDeletedEvents = allThrEvents.filter((e) => !e.isDeleted);
    const activeNonArchivedEvents = nonDeletedEvents.filter((e) => !e.isArchived);

    const allEventsDeleted = allThrEvents.length > 0 && nonDeletedEvents.length === 0;
    const allActiveArchived =
      nonDeletedEvents.length > 0 &&
      activeNonArchivedEvents.length === 0 &&
      input.isArchived === true;

    const recomputed: CommsThread = {
      ...recomputeCommsThreadRollups(thr, nonDeletedEvents, nowIso),
      isDeleted: Boolean(thr.isDeleted || allEventsDeleted),
      isArchived:
        input.isArchived === false
          ? false
          : Boolean(thr.isArchived || allActiveArchived),
      statusUpdatedAtMs: Math.max(thr.statusUpdatedAtMs ?? 0, mutationTs),
    };
    commsServerStore.threads.set(tid, recomputed);
    commsServerStore.dirtyThreadIds.add(tid);
    updatedThreads.push(recomputed);
  }

  const updatedEvents = Array.from(mutatedEventsMap.values());

  // 6. Flush dirty mutations to Firestore REST when configured
  let persistedToFirestore = false;
  if (!input.skipFirestore && isFirebaseConfigured()) {
    const token = await resolveServerFirestoreToken(input.staffBearerToken);
    if (token) {
      let allOk = true;
      for (const evt of updatedEvents) {
        const ok = await patchFirestoreDocumentRest(
          'commsEvents',
          evt.id,
          evt as unknown as Record<string, unknown>,
          token
        );
        if (ok) commsServerStore.dirtyEventIds.delete(evt.id);
        else allOk = false;
      }
      for (const thr of updatedThreads) {
        const ok = await patchFirestoreDocumentRest(
          'commsThreads',
          thr.id,
          thr as unknown as Record<string, unknown>,
          token
        );
        if (ok) commsServerStore.dirtyThreadIds.delete(thr.id);
        else allOk = false;
      }
      persistedToFirestore = allOk && (updatedEvents.length > 0 || updatedThreads.length > 0);
    }
  }

  return {
    threads: updatedThreads,
    events: updatedEvents,
    persistedToFirestore,
  };
}

function eventStatusDiffers(a: CommsEvent, b: CommsEvent): boolean {
  return (
    Boolean(a.isUnread) !== Boolean(b.isUnread) ||
    Boolean(a.isArchived) !== Boolean(b.isArchived) ||
    Boolean(a.isDeleted) !== Boolean(b.isDeleted) ||
    (a.statusUpdatedAtMs ?? 0) !== (b.statusUpdatedAtMs ?? 0)
  );
}

function threadStatusDiffers(a: CommsThread, b: CommsThread): boolean {
  return (
    Boolean(a.isArchived) !== Boolean(b.isArchived) ||
    Boolean(a.isDeleted) !== Boolean(b.isDeleted) ||
    (a.statusUpdatedAtMs ?? 0) !== (b.statusUpdatedAtMs ?? 0) ||
    (a.unreadCountTotal ?? 0) !== (b.unreadCountTotal ?? 0)
  );
}

/**
 * Flushes any buffered `commsServerStore` records to Firestore REST using an authenticated
 * dispatcher's `staffBearerToken` (or service account token) and returns unified threads & events.
 */
export async function flushAndSyncCommsServer(options?: {
  staffBearerToken?: string;
  clientEvents?: CommsEvent[];
  clientThreads?: CommsThread[];
  skipFirestore?: boolean;
}): Promise<{
  threads: CommsThread[];
  events: CommsEvent[];
  flushedCount: number;
}> {
  const touchedThreadIds = new Set<string>();

  if (Array.isArray(options?.clientThreads)) {
    for (const ct of options.clientThreads) {
      if (!ct || !ct.id || ct.mergedIntoThreadId) continue;
      const existing = commsServerStore.threads.get(ct.id);
      const reconciled = reconcileCommsThreadStatus(existing, ct);
      if (!existing || threadStatusDiffers(existing, reconciled)) {
        commsServerStore.threads.set(ct.id, reconciled);
        commsServerStore.dirtyThreadIds.add(ct.id);
        touchedThreadIds.add(ct.id);
      }
    }
  }

  if (Array.isArray(options?.clientEvents)) {
    for (const evt of options.clientEvents) {
      if (!evt || !evt.id || !evt.channel) continue;
      const existing = commsServerStore.events.get(evt.id);
      if (!existing) {
        await ingestCommsEventServer(
          {
            ...evt,
            id: evt.id,
          },
          {
            staffBearerToken: options?.staffBearerToken,
            skipFirestore: true,
          }
        );
      } else {
        const reconciled = reconcileCommsEventStatus(existing, evt);
        if (eventStatusDiffers(existing, reconciled)) {
          commsServerStore.events.set(evt.id, reconciled);
          commsServerStore.dirtyEventIds.add(evt.id);
          touchedThreadIds.add(reconciled.threadId);
        }
      }
    }
  }

  let flushedCount = 0;
  const token = !options?.skipFirestore
    ? await resolveServerFirestoreToken(options?.staffBearerToken)
    : null;

  if (token && !options?.skipFirestore && isFirebaseConfigured()) {
    // 1. Read remote Firestore docs first and reconcile LWW + tombstones before flushing
    // so cold-start in-memory state never overwrites newer Firestore mutations or tombstones.
    const [remoteThreads, remoteEvents] = await Promise.all([
      listFirestoreCollectionRest<CommsThread>('commsThreads', token, 100),
      listFirestoreCollectionRest<CommsEvent>('commsEvents', token, 200),
    ]);

    if (Array.isArray(remoteThreads)) {
      for (const rt of remoteThreads) {
        if (!rt?.id || rt.mergedIntoThreadId) continue;
        const existing = commsServerStore.threads.get(rt.id);
        if (!existing) {
          commsServerStore.threads.set(rt.id, rt);
        } else {
          const reconciled = reconcileCommsThreadStatus(existing, rt);
          commsServerStore.threads.set(rt.id, reconciled);
          // If Firestore already matches the reconciled winner, no need to re-patch unless local had newer changes
          if (!threadStatusDiffers(rt, reconciled) && (rt.lastEventAtMs || 0) >= (existing.lastEventAtMs || 0)) {
            commsServerStore.dirtyThreadIds.delete(rt.id);
          } else if (threadStatusDiffers(rt, reconciled)) {
            commsServerStore.dirtyThreadIds.add(rt.id);
          }
          touchedThreadIds.add(rt.id);
        }
      }
    }

    if (Array.isArray(remoteEvents)) {
      for (const re of remoteEvents) {
        if (!re?.id) continue;
        const existing = commsServerStore.events.get(re.id);
        if (!existing) {
          commsServerStore.events.set(re.id, re);
          if (re.threadId) touchedThreadIds.add(re.threadId);
        } else {
          const reconciled = reconcileCommsEventStatus(existing, re);
          commsServerStore.events.set(re.id, reconciled);
          if (!eventStatusDiffers(re, reconciled) && re.transcription === reconciled.transcription && re.deliveryStatus === reconciled.deliveryStatus) {
            commsServerStore.dirtyEventIds.delete(re.id);
          } else if (eventStatusDiffers(re, reconciled)) {
            commsServerStore.dirtyEventIds.add(re.id);
          }
          if (reconciled.threadId) touchedThreadIds.add(reconciled.threadId);
        }
      }
    }

    for (const tid of touchedThreadIds) {
      const thr = commsServerStore.threads.get(tid);
      if (thr) {
        const recomputed = recomputeCommsThreadRollups(
          thr,
          getServerThreadEvents(tid, true, false)
        );
        commsServerStore.threads.set(tid, recomputed);
      }
    }

    // 2. Flush dirty events
    for (const evtId of Array.from(commsServerStore.dirtyEventIds)) {
      const evt = commsServerStore.events.get(evtId);
      if (!evt) {
        commsServerStore.dirtyEventIds.delete(evtId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'commsEvents',
        evt.id,
        evt as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        commsServerStore.dirtyEventIds.delete(evtId);
        flushedCount += 1;
      }
    }

    // 3. Flush dirty threads
    for (const thrId of Array.from(commsServerStore.dirtyThreadIds)) {
      const thr = commsServerStore.threads.get(thrId);
      if (!thr) {
        commsServerStore.dirtyThreadIds.delete(thrId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'commsThreads',
        thr.id,
        thr as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        commsServerStore.dirtyThreadIds.delete(thrId);
        flushedCount += 1;
      }
    }

    // 4. Flush dirty webhook logs
    for (const whId of Array.from(commsServerStore.dirtyWebhookEventIds)) {
      const wh = commsServerStore.webhookEvents.get(whId);
      if (!wh) {
        commsServerStore.dirtyWebhookEventIds.delete(whId);
        continue;
      }
      const ok = await patchFirestoreDocumentRest(
        'telephonyWebhookEvents',
        wh.id,
        wh as unknown as Record<string, unknown>,
        token
      );
      if (ok) {
        commsServerStore.dirtyWebhookEventIds.delete(whId);
      }
    }
  } else if (touchedThreadIds.size > 0) {
    for (const tid of touchedThreadIds) {
      const thr = commsServerStore.threads.get(tid);
      if (thr) {
        commsServerStore.threads.set(
          tid,
          recomputeCommsThreadRollups(thr, getServerThreadEvents(tid, true, false))
        );
      }
    }
  }

  // Return all non-merged threads and events (including isArchived and isDeleted tombstones)
  // so clients receive authoritative status tombstones and never resurrect deleted/read items.
  const threads = Array.from(commsServerStore.threads.values())
    .filter((t) => !t.mergedIntoThreadId)
    .sort((a, b) => (b.lastEventAtMs || 0) - (a.lastEventAtMs || 0));

  const events = Array.from(commsServerStore.events.values()).sort(
    (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
  );

  return {
    threads,
    events,
    flushedCount,
  };
}
