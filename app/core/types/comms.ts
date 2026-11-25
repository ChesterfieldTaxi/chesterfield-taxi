/**
 * Unified Multi-Channel Communications Domain Contracts (`comms.ts`)
 *
 * Defines canonical models for `/commsThreads/{threadId}`, `/commsEvents/{eventId}`,
 * and `/telephonyWebhookEvents/{eventId}` spanning Calls, SMS, Voicemails,
 * Emails (`dispatch@chesterfieldtaxi.com`), and Internal Dispatcher Notes.
 */

export type CommsChannel = 'sms' | 'call' | 'voicemail' | 'email' | 'note';

export type CommsDirection = 'inbound' | 'outbound' | 'internal';

export type CommsEventType =
  | 'sms_inbound'
  | 'sms_outbound'
  | 'call_inbound'
  | 'call_outbound'
  | 'call_missed'
  | 'voicemail'
  | 'email_inbound'
  | 'email_outbound'
  | 'internal_note';

export type CommsContactType = 'passenger' | 'driver' | 'corporate' | 'unknown';

export interface CommsUnreadByChannel {
  sms: number;
  call: number;
  voicemail: number;
  email: number;
}

export interface CommsSuggestedBooking {
  passengerName?: string;
  passengerPhone?: string;
  passengerEmail?: string;
  pickup?: string;
  dropoff?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupTime?: string;
  notes?: string;
}

export interface CommsThread {
  id: string;
  contactId?: string;
  contactName: string;
  contactType: CommsContactType;
  primaryPhone?: string; // E.164
  phones: string[]; // E.164
  primaryEmail?: string; // lowercase
  emails: string[]; // lowercase
  corporateAccountId?: string;
  corporateAccountName?: string;
  linkedTripIds: string[];
  channels: CommsChannel[];
  lastEventAt: string; // ISO
  lastEventAtMs: number;
  lastChannel: CommsChannel;
  lastDirection: CommsDirection;
  lastSubject?: string;
  lastSnippet: string;
  unreadCountTotal: number;
  unreadByChannel: CommsUnreadByChannel;
  isStarred?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  statusUpdatedAtMs?: number;
  mergedIntoThreadId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommsEvent {
  /**
   * Deterministic idempotent ID:
   * - `sms_${MessageSid}`
   * - `call_${CallSid}`
   * - `vm_${RecordingSid}`
   * - `em_${emailId}`
   * - `note_${id}`
   */
  id: string;
  threadId: string;
  channel: CommsChannel;
  direction: CommsDirection;
  eventType: CommsEventType;
  contactId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  fromAddress: string;
  toAddress: string;
  subject?: string;
  snippet: string;
  bodyText?: string;
  emailMessageId?: string;
  tripId?: string;
  deliveryStatus?: string;
  errorCode?: number | string;
  errorMessage?: string;
  externalSid?: string;
  recordingSid?: string;
  durationSeconds?: number;
  audioUrl?: string;
  audioDuration?: string;
  transcription?: string;
  suggestedBooking?: CommsSuggestedBooking;
  isUnread: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  statusUpdatedAtMs?: number;
  actorId?: string;
  actorName?: string;
  timestampIso: string;
  timestampMs: number;
}

export interface TelephonyWebhookEventRecord {
  id: string;
  action: string;
  externalSid?: string;
  callSid?: string;
  recordingSid?: string;
  messageSid?: string;
  threadId?: string;
  commsEventId?: string;
  fromAddress?: string;
  toAddress?: string;
  status?: string;
  processedAt: string;
}

export interface RecordCommsEventInput {
  id?: string;
  threadId?: string;
  channel: CommsChannel;
  direction: CommsDirection;
  eventType: CommsEventType;
  contactId?: string;
  contactName?: string;
  contactType?: CommsContactType;
  contactPhone?: string;
  contactEmail?: string;
  fromAddress?: string;
  toAddress?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  emailMessageId?: string;
  tripId?: string;
  deliveryStatus?: string;
  errorCode?: number | string;
  errorMessage?: string;
  externalSid?: string;
  recordingSid?: string;
  durationSeconds?: number;
  audioUrl?: string;
  audioDuration?: string;
  transcription?: string;
  suggestedBooking?: CommsSuggestedBooking;
  isUnread?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  statusUpdatedAtMs?: number;
  actorId?: string;
  actorName?: string;
  timestampIso?: string;
  timestampMs?: number;
}

function sanitizeFirestoreIdSegment(raw: string): string {
  return raw.trim().replace(/[\/\s]+/g, '_');
}

/**
 * Computes a deterministic, idempotent `CommsEvent.id` by channel:
 * - `sms_${MessageSid}`
 * - `call_${CallSid}`
 * - `vm_${RecordingSid}`
 * - `em_${emailId}`
 * - `note_${id}`
 */
export function buildCommsEventId(
  channel: CommsChannel,
  rawIdentifier?: string | null
): string {
  const prefixMap: Record<CommsChannel, string> = {
    sms: 'sms_',
    call: 'call_',
    voicemail: 'vm_',
    email: 'em_',
    note: 'note_',
  };
  const prefix = prefixMap[channel];
  const fallback = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cleaned = sanitizeFirestoreIdSegment(rawIdentifier || '') || fallback;

  if (cleaned.startsWith(prefix)) {
    return cleaned;
  }
  return `${prefix}${cleaned}`;
}

export function createEmptyUnreadByChannel(): CommsUnreadByChannel {
  return {
    sms: 0,
    call: 0,
    voicemail: 0,
    email: 0,
  };
}

/**
 * Reconciles `isUnread`, `isArchived`, and `isDeleted` across `CommsEvent` versions using
 * `statusUpdatedAtMs` last-write-wins, with `isDeleted: true` enforced as a sticky tombstone.
 */
export function reconcileCommsEventStatus(
  existing: CommsEvent | undefined,
  incoming: CommsEvent
): CommsEvent {
  if (!existing) {
    const isDeleted = Boolean(incoming.isDeleted);
    const isArchived = Boolean(incoming.isArchived);
    return {
      ...incoming,
      isDeleted,
      isArchived,
      isUnread: isDeleted || isArchived ? false : Boolean(incoming.isUnread),
    };
  }

  const stickyDeleted = Boolean(existing.isDeleted || incoming.isDeleted);
  const existingTs = existing.statusUpdatedAtMs ?? 0;
  const incomingTs = incoming.statusUpdatedAtMs ?? 0;

  let isUnread: boolean;
  let isArchived: boolean;
  let statusUpdatedAtMs: number | undefined;

  if (stickyDeleted) {
    isUnread = false;
    isArchived =
      incomingTs > existingTs
        ? Boolean(incoming.isArchived)
        : Boolean(existing.isArchived ?? incoming.isArchived);
    statusUpdatedAtMs = Math.max(existingTs, incomingTs) || undefined;
  } else if (existingTs > 0 || incomingTs > 0) {
    if (incomingTs > existingTs) {
      isArchived = Boolean(incoming.isArchived);
      isUnread = isArchived ? false : Boolean(incoming.isUnread);
      statusUpdatedAtMs = incomingTs;
    } else if (existingTs > incomingTs) {
      isArchived = Boolean(existing.isArchived);
      isUnread = isArchived ? false : Boolean(existing.isUnread);
      statusUpdatedAtMs = existingTs;
    } else {
      isArchived = Boolean(existing.isArchived || incoming.isArchived);
      isUnread = isArchived ? false : Boolean(existing.isUnread && incoming.isUnread);
      statusUpdatedAtMs = existingTs;
    }
  } else {
    isArchived = Boolean(existing.isArchived || incoming.isArchived);
    isUnread = isArchived
      ? false
      : !existing.isUnread
      ? false
      : Boolean(incoming.isUnread);
    statusUpdatedAtMs = undefined;
  }

  const reconciled: CommsEvent = {
    ...existing,
    ...incoming,
    isUnread,
    isArchived,
    isDeleted: stickyDeleted,
  };
  if (statusUpdatedAtMs !== undefined) {
    reconciled.statusUpdatedAtMs = statusUpdatedAtMs;
  } else {
    delete reconciled.statusUpdatedAtMs;
  }
  return reconciled;
}

/**
 * Reconciles `isArchived` and `isDeleted` across `CommsThread` versions using
 * `statusUpdatedAtMs` last-write-wins, with `isDeleted: true` enforced as a sticky tombstone.
 */
export function reconcileCommsThreadStatus(
  existing: CommsThread | undefined,
  incoming: CommsThread
): CommsThread {
  if (!existing) {
    return {
      ...incoming,
      isArchived: Boolean(incoming.isArchived),
      isDeleted: Boolean(incoming.isDeleted),
    };
  }

  const stickyDeleted = Boolean(existing.isDeleted || incoming.isDeleted);
  const existingTs = existing.statusUpdatedAtMs ?? 0;
  const incomingTs = incoming.statusUpdatedAtMs ?? 0;

  let isArchived: boolean;
  let statusUpdatedAtMs: number | undefined;

  if (existingTs > 0 || incomingTs > 0) {
    if (incomingTs > existingTs) {
      isArchived = Boolean(incoming.isArchived);
      statusUpdatedAtMs = incomingTs;
    } else if (existingTs > incomingTs) {
      isArchived = Boolean(existing.isArchived);
      statusUpdatedAtMs = existingTs;
    } else {
      isArchived = Boolean(existing.isArchived || incoming.isArchived);
      statusUpdatedAtMs = existingTs;
    }
  } else {
    isArchived = Boolean(existing.isArchived || incoming.isArchived);
    statusUpdatedAtMs = undefined;
  }

  const existingUpdatedMs = Date.parse(existing.updatedAt || '') || 0;
  const incomingUpdatedMs = Date.parse(incoming.updatedAt || '') || 0;
  const existingNewerMeta =
    (existing.lastEventAtMs || 0) > (incoming.lastEventAtMs || 0) ||
    ((existing.lastEventAtMs || 0) === (incoming.lastEventAtMs || 0) &&
      existingUpdatedMs > incomingUpdatedMs);

  const mergedBase: CommsThread = existingNewerMeta
    ? { ...incoming, ...existing }
    : { ...existing, ...incoming };

  const reconciled: CommsThread = {
    ...mergedBase,
    isArchived,
    isDeleted: stickyDeleted,
  };
  if (statusUpdatedAtMs !== undefined) {
    reconciled.statusUpdatedAtMs = statusUpdatedAtMs;
  } else {
    delete reconciled.statusUpdatedAtMs;
  }
  return reconciled;
}
