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

function getServerThreadEvents(threadId: string, includeArchived = true): CommsEvent[] {
  return Array.from(commsServerStore.events.values())
    .filter((e) => e.threadId === threadId && (includeArchived || !e.isArchived))
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

  const canonicalThreadId =
    resolution.threadId !== 'thr_unknown'
      ? resolution.threadId
      : input.threadId || existingEvent?.threadId || candidateMatches[0]?.id || 'thr_unknown';

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

  commsServerStore.events.set(eventId, nextEvent);
  enforceBoundedMap(commsServerStore.events, MAX_SERVER_EVENTS);

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

  const updatedThread = recomputeCommsThreadRollups(
    seedThread,
    getServerThreadEvents(effectiveThreadId, true),
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
  if (Array.isArray(options?.clientEvents)) {
    for (const evt of options.clientEvents) {
      if (!evt || !evt.id || !evt.channel) continue;
      if (!commsServerStore.events.has(evt.id)) {
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
      }
    }
  }

  let flushedCount = 0;
  const token = !options?.skipFirestore
    ? await resolveServerFirestoreToken(options?.staffBearerToken)
    : null;

  if (token && !options?.skipFirestore && isFirebaseConfigured()) {
    // 1. Flush dirty events
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

    // 2. Flush dirty threads
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

    // 3. Flush dirty webhook logs
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

    // 4. Hydrate any persisted Firestore docs not yet in this serverless instance's memory
    const [remoteThreads, remoteEvents] = await Promise.all([
      listFirestoreCollectionRest<CommsThread>('commsThreads', token, 100),
      listFirestoreCollectionRest<CommsEvent>('commsEvents', token, 200),
    ]);

    if (Array.isArray(remoteThreads)) {
      for (const rt of remoteThreads) {
        if (rt?.id && !rt.mergedIntoThreadId && !commsServerStore.threads.has(rt.id)) {
          commsServerStore.threads.set(rt.id, rt);
        }
      }
    }
    if (Array.isArray(remoteEvents)) {
      for (const re of remoteEvents) {
        if (re?.id && !commsServerStore.events.has(re.id)) {
          commsServerStore.events.set(re.id, re);
        }
      }
    }
  }

  const threads = Array.from(commsServerStore.threads.values())
    .filter((t) => !t.mergedIntoThreadId && !t.isArchived)
    .sort((a, b) => (b.lastEventAtMs || 0) - (a.lastEventAtMs || 0));

  const events = Array.from(commsServerStore.events.values())
    .filter((e) => !e.isArchived)
    .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));

  return {
    threads,
    events,
    flushedCount,
  };
}
