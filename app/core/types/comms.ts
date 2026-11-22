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
