/**
 * Pure Omnichannel Timeline, Call Audio Guard, Cab/Ride Chip & Email Snippet Utilities (`comms-timeline.util.ts`)
 * Zero React/DOM, `*.server`, or `node:*` imports.
 */
import type { WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import type { Trip } from '../../../../core/types/trip';
import type { InteractionEvent, ThreadTab, ThreadTimelineType } from './comms-types';

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
  timelineFilters?: ReadonlyArray<ThreadTimelineType>;
  nowMs?: number;
}

export interface BuildOmnichannelTimelineResult {
  matchedTrips: Trip[];
  pinnedUpcomingTrip: Trip | null;
  items: OmnichannelTimelineItem[];
}

export interface ActiveRideSmsPassengerChip {
  tripId: string;
  shortTripId: string;
  passengerName: string;
  phone: string;
  status: Trip['status'];
}

export const COMMS_AVATAR_PASTEL_PALETTE = [
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-amber-100 text-amber-800',
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-fuchsia-100 text-fuchsia-800',
] as const;

export interface ContactAvatarSpec {
  initials: string | null;
  toneClass: string;
  paletteIndex: number;
}

export interface ResolveContactAvatarInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  fallbackId?: string | null;
}

function extractContactInitials(rawName?: string | null): string | null {
  const clean = String(rawName || '').trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  if (lower === 'unknown caller' || lower === 'unknown') return null;
  if (clean.includes('@')) return null;
  if (/^[+(\d]/.test(clean) && /^[\d\s().+-]+$/.test(clean)) return null;
  const words = clean.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return null;
  const firstChar = words[0].replace(/^[^a-zA-Z0-9]+/, '').charAt(0).toUpperCase();
  if (!firstChar) return null;
  if (words.length === 1) return firstChar;
  const lastChar = words[words.length - 1].replace(/^[^a-zA-Z0-9]+/, '').charAt(0).toUpperCase();
  return lastChar ? `${firstChar}${lastChar}` : firstChar;
}

export function resolveContactAvatarSpec(input: ResolveContactAvatarInput): ContactAvatarSpec {
  const normPhone = extractLast10Digits(input.phone);
  const normEmail = normalizeEmailLower(input.email);
  const rawName = String(input.name || '').trim();
  const normName = rawName.toLowerCase();
  const hashKey =
    normPhone ||
    normEmail ||
    (normName && normName !== 'unknown caller' ? normName : '') ||
    String(input.fallbackId || '').trim() ||
    'unknown';

  let hash = 2166136261;
  for (let i = 0; i < hashKey.length; i++) {
    hash ^= hashKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const paletteIndex = (hash >>> 0) % COMMS_AVATAR_PASTEL_PALETTE.length;
  return {
    initials: extractContactInitials(rawName),
    toneClass: COMMS_AVATAR_PASTEL_PALETTE[paletteIndex],
    paletteIndex,
  };
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
  return String(raw).replace(/[=-]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
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
  if (!trip.scheduledPickupTime) return trip.bookingType === 'asap' ? 'ASAP' : 'Scheduled';
  const dt = new Date(trip.scheduledPickupTime);
  if (Number.isNaN(dt.getTime())) return 'Scheduled';
  return `${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function resolveTripCabBadgeLabel(
  trip: Trip,
  drivers?: ReadonlyArray<any>
): { label: string; tone: 'assigned' | 'staged' | 'unassigned' } {
  const stripCab = (raw?: string | null) => String(raw || '').replace(/^car\s*#?\s*/i, '').replace(/^#/, '').trim();
  if (trip.assignedDriverId || trip.assignedVehicle?.vehicleNumber) {
    const drv = trip.assignedDriverId ? drivers?.find((d) => d.id === trip.assignedDriverId) : undefined;
    const unit = stripCab(drv?.cabNumber || drv?.vehicleUnit || trip.assignedVehicle?.vehicleNumber);
    return { label: unit ? `#${unit}` : drv?.name || 'Assigned', tone: 'assigned' };
  }
  if (trip.plannedDriverId) {
    const drv = drivers?.find((d) => d.id === trip.plannedDriverId);
    const unit = stripCab(drv?.cabNumber || drv?.vehicleUnit);
    return { label: unit ? `#${unit} staged` : `${drv?.name || 'Driver'} staged`, tone: 'staged' };
  }
  return { label: 'Unassigned', tone: 'unassigned' };
}

export function buildActiveRideSmsPassengerChips(
  trips: ReadonlyArray<Trip> = [],
  nowMs: number = Date.now()
): ActiveRideSmsPassengerChip[] {
  const candidates = trips
    .filter((t) => t && !t.isArchived && !TERMINAL_TRIP_STATUSES.has(String(t.status || '').toLowerCase()) && extractLast10Digits(t.passenger?.phone))
    .sort((a, b) => {
      const liveA = LIVE_TRIP_STATUSES.has(String(a.status || '').toLowerCase()) ? 1 : 0;
      const liveB = LIVE_TRIP_STATUSES.has(String(b.status || '').toLowerCase()) ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;
      return Math.abs(resolveTripTimelineTimestampMs(a) - nowMs) - Math.abs(resolveTripTimelineTimestampMs(b) - nowMs);
    });
  const seenPhones = new Set<string>();
  const chips: ActiveRideSmsPassengerChip[] = [];
  for (const t of candidates) {
    const digits = extractLast10Digits(t.passenger?.phone);
    if (!digits || seenPhones.has(digits)) continue;
    seenPhones.add(digits);
    const name = `${t.passenger?.firstName || ''} ${t.passenger?.lastName || ''}`.trim() || t.passenger?.phone || 'Passenger';
    chips.push({ tripId: t.id, shortTripId: formatShortTripId(t.id), passengerName: name, phone: t.passenger?.phone || digits, status: t.status });
    if (chips.length >= 6) break;
  }
  return chips;
}

export function buildReturnTripDraftPayload(trip: Trip, _nowMs: number = Date.now()): WorkspaceEventMap['POPULATE_BOOKING'] {
  const passengerName = `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`.trim();
  const meta = (trip.metadata || {}) as Record<string, any>;
  const corpDetails = (meta.corporateDetails || {}) as Record<string, any>;
  return {
    passengerName: passengerName || undefined, passengerPhone: trip.passenger?.phone || undefined,
    passengerEmail: trip.passenger?.email || undefined, pickupAddress: trip.dropoffLocation?.address || '',
    pickupCoordinates: trip.dropoffLocation?.coordinates ? { ...trip.dropoffLocation.coordinates } : undefined,
    dropoffAddress: trip.pickupLocation?.address || '',
    dropoffCoordinates: trip.pickupLocation?.coordinates ? { ...trip.pickupLocation.coordinates } : undefined,
    vehicleTier: trip.vehicleTier || undefined, corporateAccount: corpDetails.corporateAccount || meta.corporateOrgName || undefined,
    corporateAccountNumber: meta.corporateAccountNumber || undefined, billingPo: corpDetails.billingPo || undefined,
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
  events, trips = [], contactPhone, contactEmail, contactId, threadTab = 'all', timelineFilters, nowMs = Date.now(),
}: BuildOmnichannelTimelineOptions): BuildOmnichannelTimelineResult {
  const phoneNeedles = new Set<string>();
  const primaryDigits = extractLast10Digits(contactPhone);
  if (primaryDigits) phoneNeedles.add(primaryDigits);
  for (const evt of events) {
    for (const raw of [evt.contactPhone, evt.mobilePhone, evt.homePhone]) {
      const d = extractLast10Digits(raw);
      if (d) phoneNeedles.add(d);
    }
  }
  const emailNeedle = normalizeEmailLower(contactEmail) || normalizeEmailLower(events.find((e) => e.contactEmail)?.contactEmail);
  const cleanContactId = contactId && !String(contactId).startsWith('temp_') ? String(contactId).trim() : '';

  const seenTripIds = new Set<string>();
  const matchedTrips: Trip[] = [];
  for (const trip of trips) {
    if (!trip || seenTripIds.has(trip.id)) continue;
    const paxDigits = extractLast10Digits(trip.passenger?.phone || (trip as any).passengerPhone);
    const paxEmail = normalizeEmailLower(trip.passenger?.email);
    if ((cleanContactId && trip.customerId === cleanContactId) || (paxDigits && phoneNeedles.has(paxDigits)) || (emailNeedle && paxEmail && paxEmail === emailNeedle)) {
      seenTripIds.add(trip.id);
      matchedTrips.push(trip);
    }
  }

  const nonTerminal = matchedTrips.filter((t) => !TERMINAL_TRIP_STATUSES.has(String(t.status || '').trim().toLowerCase()));
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

  const hasMulti = Boolean(timelineFilters && timelineFilters.length > 0);
  const items: OmnichannelTimelineItem[] = [];
  for (const evt of events) {
    const keep = hasMulti
      ? timelineFilters!.some((ft) => ft !== 'trips' && matchesEventChannelTab(evt, ft))
      : threadTab !== 'trips' && matchesEventChannelTab(evt, threadTab);
    if (keep) items.push({ kind: 'event', timestampMs: evt.timestampMs || 0, event: evt });
  }
  const includeTrips = hasMulti ? timelineFilters!.includes('trips') : threadTab === 'all' || threadTab === 'trips';
  if (includeTrips) {
    for (const trip of matchedTrips) items.push({ kind: 'trip', timestampMs: resolveTripTimelineTimestampMs(trip), trip });
  }

  items.sort((a, b) => a.timestampMs - b.timestampMs);
  return { matchedTrips, pinnedUpcomingTrip, items };
}
