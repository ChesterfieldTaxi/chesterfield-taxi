/**
 * Client-Safe Multi-Channel Sender Timeline & Active Trip Resolution (`dispatch-email-timeline.ts`)
 *
 * Extracted from `dispatch-email.service.ts` (Phase 47):
 * Resolves unified sender identity, multi-channel `CommsEvent` history (Email + SMS + Voice +
 * Voicemail + Internal Notes), and matched active/upcoming/completed `Trip` records.
 *
 * Strictly adheres to `constitution.md`: zero `*.server.ts` or `node:*` imports.
 */

import type { CommsEvent, CommsThread } from '../../types/comms';
import {
  DISPATCH_MAILBOX_ADDRESS,
  buildDispatchEmailCommsEventId,
  type DispatchEmailRecord,
} from '../../types/dispatch-email';
import type { Trip } from '../../types/trip';
import { formatDisplayPhone } from '../../utils/phone';
import { getCommsThreadService } from '../comms/comms-thread.service';
import {
  collectContactEmailsNormalized,
  collectContactPhonesE164,
  getContactService,
  normalizeEmail,
  normalizePhone,
  type ContactRecord,
} from '../customer/contact.service';
import { parseEmailDisplayAddress } from './email-booking-parser';

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

export function resolveSenderCrossChannelTimeline(
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
  trips: Trip[] = [],
  storedEmails: Iterable<DispatchEmailRecord> = []
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
  for (const em of storedEmails) {
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
