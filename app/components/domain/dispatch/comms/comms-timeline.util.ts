/**
 * Pure Omnichannel Timeline, Call Audio Guard & Email Snippet Utilities (`comms-timeline.util.ts`)
 * Zero React/DOM, `*.server`, or `node:*` imports.
 */
import type { WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import type { InteractionEvent, ThreadTab } from './comms-types';

const TERMINAL_TRIP_STATUSES = new Set(['completed', 'cancelled', 'declined']);
const LIVE_TRIP_STATUSES = new Set(['in_progress', 'arrived', 'en_route']);

export type OmnichannelTimelineItem =
  | { kind: 'event'; timestampMs: number; event: InteractionEvent }
  | { kind: 'trip'; timestampMs: number; trip: Trip };

export interface BuildOmnichannelTimelineOptions {
  events: ReadonlyArray<InteractionEvent>;
  trips?: ReadonlyArray<Trip>;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactId?: string | null;
  threadTab?: ThreadTab;
  nowMs?: number;
}

export interface BuildOmnichannelTimelineResult {
  matchedTrips: Trip[];
  pinnedUpcomingTrip: Trip | null;
  items: OmnichannelTimelineItem[];
}

export function hasPlayableCallAudio(
  evt: Pick<InteractionEvent, 'type' | 'audioUrl' | 'recordingSid'> | null | undefined
): boolean {
  if (!evt) return false;
  return Boolean(
    evt.audioUrl ||
      (evt.recordingSid && /^RE[0-9a-f]{32}$/i.test(evt.recordingSid.trim())) ||
      (evt.type === 'voicemail' && evt.recordingSid)
  );
}

export function cleanCommsEmailSnippet(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[=-]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLast10Digits(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function normalizeEmailLower(raw?: string | null): string {
  const clean = String(raw || '').trim().toLowerCase();
  return clean.includes('@') ? clean : '';
}

export function resolveTripTimelineTimestampMs(trip: Trip): number {
  for (const iso of [trip.scheduledPickupTime, trip.completedAt, trip.createdAt, trip.updatedAt]) {
    const parsed = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function formatShortTripId(id: string): string {
  const clean = String(id || '').trim().replace(/^#/, '');
  if (!clean) return '#TRIP';
  return clean.length > 12 ? `#${clean.slice(0, 8)}` : `#${clean}`;
}

export function formatShortRouteEndpoint(address?: string | null): string {
  return String(address || '').split(',')[0]?.trim() || 'Unspecified';
}

export function formatTripTimelineDateTime(trip: Trip): string {
  if (!trip.scheduledPickupTime) {
    return trip.bookingType === 'asap' ? 'ASAP' : 'Scheduled';
  }
  const dt = new Date(trip.scheduledPickupTime);
  if (Number.isNaN(dt.getTime())) return 'Scheduled';
  const datePart = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timePart = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

export function buildReturnTripDraftPayload(
  trip: Trip,
  _nowMs: number = Date.now()
): WorkspaceEventMap['POPULATE_BOOKING'] {
  const passengerName = `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`.trim();
  const meta = (trip.metadata || {}) as Record<string, any>;
  const corpDetails = (meta.corporateDetails || {}) as Record<string, any>;

  return {
    passengerName: passengerName || undefined,
    passengerPhone: trip.passenger?.phone || undefined,
    passengerEmail: trip.passenger?.email || undefined,
    pickupAddress: trip.dropoffLocation?.address || '',
    pickupCoordinates: trip.dropoffLocation?.coordinates
      ? { ...trip.dropoffLocation.coordinates }
      : undefined,
    dropoffAddress: trip.pickupLocation?.address || '',
    dropoffCoordinates: trip.pickupLocation?.coordinates
      ? { ...trip.pickupLocation.coordinates }
      : undefined,
    vehicleTier: trip.vehicleTier || undefined,
    corporateAccount: corpDetails.corporateAccount || meta.corporateOrgName || undefined,
    corporateAccountNumber: meta.corporateAccountNumber || undefined,
    billingPo: corpDetails.billingPo || undefined,
    notes: `Return ride from ${formatShortTripId(trip.id)}`,
  };
}

function matchesEventChannelTab(evt: InteractionEvent, tab: ThreadTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'trips') return false;
  if (tab === 'sms') return evt.type.startsWith('sms_');
  if (tab === 'calls') return evt.type.startsWith('call_') || evt.type === 'voicemail';
  if (tab === 'emails') return evt.type.startsWith('email_');
  if (tab === 'notes') return evt.type === 'internal_note';
  return true;
}

export function buildOmnichannelTimelineItems({
  events,
  trips = [],
  contactPhone,
  contactEmail,
  contactId,
  threadTab = 'all',
  nowMs = Date.now(),
}: BuildOmnichannelTimelineOptions): BuildOmnichannelTimelineResult {
  const phoneNeedles = new Set<string>();
  const primaryDigits = extractLast10Digits(contactPhone);
  if (primaryDigits) phoneNeedles.add(primaryDigits);
  for (const evt of events) {
    const d1 = extractLast10Digits(evt.contactPhone);
    const d2 = extractLast10Digits(evt.mobilePhone);
    const d3 = extractLast10Digits(evt.homePhone);
    if (d1) phoneNeedles.add(d1);
    if (d2) phoneNeedles.add(d2);
    if (d3) phoneNeedles.add(d3);
  }

  const emailNeedle =
    normalizeEmailLower(contactEmail) ||
    normalizeEmailLower(events.find((e) => e.contactEmail)?.contactEmail);
  const cleanContactId =
    contactId && !String(contactId).startsWith('temp_') ? String(contactId).trim() : '';

  const seenTripIds = new Set<string>();
  const matchedTrips: Trip[] = [];
  for (const trip of trips) {
    if (!trip || seenTripIds.has(trip.id)) continue;
    const paxDigits = extractLast10Digits(trip.passenger?.phone || (trip as any).passengerPhone);
    const paxEmail = normalizeEmailLower(trip.passenger?.email);
    const idMatch = Boolean(cleanContactId && trip.customerId === cleanContactId);
    const phoneMatch = Boolean(paxDigits && phoneNeedles.has(paxDigits));
    const emailMatch = Boolean(emailNeedle && paxEmail && paxEmail === emailNeedle);

    if (idMatch || phoneMatch || emailMatch) {
      seenTripIds.add(trip.id);
      matchedTrips.push(trip);
    }
  }

  const nonTerminal = matchedTrips.filter(
    (t) => !TERMINAL_TRIP_STATUSES.has(String(t.status || '').trim().toLowerCase())
  );
  const sortedUpcoming = [...nonTerminal].sort((a, b) => {
    const stA = String(a.status || '').trim().toLowerCase();
    const stB = String(b.status || '').trim().toLowerCase();
    const tsA = resolveTripTimelineTimestampMs(a);
    const tsB = resolveTripTimelineTimestampMs(b);
    const activeWindowA = LIVE_TRIP_STATUSES.has(stA) || tsA >= nowMs - 4 * 3_600_000 ? 1 : 0;
    const activeWindowB = LIVE_TRIP_STATUSES.has(stB) || tsB >= nowMs - 4 * 3_600_000 ? 1 : 0;
    if (activeWindowA !== activeWindowB) return activeWindowB - activeWindowA;
    return tsA - tsB || a.id.localeCompare(b.id);
  });
  const pinnedUpcomingTrip = sortedUpcoming[0] ?? null;

  const items: OmnichannelTimelineItem[] = [];
  if (threadTab !== 'trips') {
    for (const evt of events) {
      if (matchesEventChannelTab(evt, threadTab)) {
        items.push({ kind: 'event', timestampMs: evt.timestampMs || 0, event: evt });
      }
    }
  }
  if (threadTab === 'all' || threadTab === 'trips') {
    for (const trip of matchedTrips) {
      items.push({ kind: 'trip', timestampMs: resolveTripTimelineTimestampMs(trip), trip });
    }
  }

  items.sort((a, b) => a.timestampMs - b.timestampMs);
  return { matchedTrips, pinnedUpcomingTrip, items };
}
