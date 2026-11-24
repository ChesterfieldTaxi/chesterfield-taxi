import {
  collectContactEmailsNormalized,
  collectContactPhonesE164,
  normalizeEmail,
  normalizePhone,
  type ContactRecord,
} from '../../../core/services/customer/contact.service';
import { cloneTripToDispatchFormValues } from '../../../core/hooks/dispatch/dispatch-workspace.util';
import type { Trip } from '../../../core/types/trip';
import { formatDisplayPhone } from '../../../core/utils/phone';
import type { DispatchFormValues } from './DispatchBookingEngine';

export const CLIENT_TRIPS_PAGE_SIZE = 10;

export interface ResolvedClientProfileData {
  isExistingClient: boolean;
  contact: ContactRecord | null;
  displayName: string;
  displayPhone: string;
  rawPhone: string;
  displayEmail: string;
  isVip: boolean;
  isBlacklisted: boolean;
  corporateAccountName: string | null;
  customerScore: number | null;
  totalTrips: number;
  totalSpend: number;
  dispatcherNotes: string;
  sortedTrips: Trip[];
}

export interface PaginatedClientTrips {
  visibleTrips: Trip[];
  hasMore: boolean;
  remainingCount: number;
  nextVisibleCount: number;
}

function getTripSortTimestampMs(trip: Trip): number {
  for (const iso of [trip.scheduledPickupTime, trip.createdAt, trip.updatedAt]) {
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export function resolveClientProfileData(params: {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  contacts?: ReadonlyArray<ContactRecord>;
  trips?: ReadonlyArray<Trip>;
}): ResolvedClientProfileData {
  const contacts = params.contacts || [];
  const allTrips = params.trips || [];
  const queryPhoneNorm = normalizePhone(params.phone || '');
  const queryEmailNorm = normalizeEmail(params.email || '');
  const queryNameNorm = String(params.name || '').trim().toLowerCase();

  let matchedContact: ContactRecord | null = null;
  for (const c of contacts) {
    if (c.isArchived) continue;
    const cPhones = collectContactPhonesE164(c).map((p) => normalizePhone(p));
    const cEmails = collectContactEmailsNormalized(c);
    if ((queryPhoneNorm.length >= 7 && cPhones.includes(queryPhoneNorm)) || (queryEmailNorm && cEmails.includes(queryEmailNorm))) {
      matchedContact = c;
      break;
    }
  }

  const targetPhones = new Set<string>();
  if (queryPhoneNorm.length >= 7) targetPhones.add(queryPhoneNorm);
  if (matchedContact) {
    collectContactPhonesE164(matchedContact).forEach((p) => {
      const n = normalizePhone(p);
      if (n.length >= 7) targetPhones.add(n);
    });
  }
  const targetEmails = new Set<string>(queryEmailNorm ? [queryEmailNorm] : []);
  if (matchedContact) collectContactEmailsNormalized(matchedContact).forEach((em) => targetEmails.add(em));

  const matchingTrips = allTrips.filter((t) => {
    const paxPhone = normalizePhone(t.passenger?.phone || '');
    const meta = (t.metadata || {}) as Record<string, any>;
    const bookerPhone = normalizePhone(meta.contactPerson?.contactPhone || '');
    const paxEmail = normalizeEmail(t.passenger?.email || '');
    const bookerEmail = normalizeEmail(meta.contactPerson?.contactEmail || '');
    if (targetPhones.size > 0 && (targetPhones.has(paxPhone) || targetPhones.has(bookerPhone))) return true;
    if (targetEmails.size > 0 && (targetEmails.has(paxEmail) || targetEmails.has(bookerEmail))) return true;
    if (targetPhones.size === 0 && targetEmails.size === 0 && queryNameNorm.length >= 3) {
      return `${t.passenger?.firstName || ''} ${t.passenger?.lastName || ''}`.trim().toLowerCase() === queryNameNorm;
    }
    return false;
  });

  const sortedTrips = [...matchingTrips].sort(
    (a, b) => getTripSortTimestampMs(b) - getTripSortTimestampMs(a) || b.id.localeCompare(a.id)
  );
  const latestTrip = sortedTrips[0];
  const latestMeta = ((latestTrip?.metadata || {}) as Record<string, any>) || {};
  const rawPhone = matchedContact?.phone || params.phone?.trim() || latestTrip?.passenger?.phone || '';
  const displayName =
    matchedContact?.name ||
    (latestTrip ? `${latestTrip.passenger?.firstName || ''} ${latestTrip.passenger?.lastName || ''}`.trim() : '') ||
    params.name?.trim() ||
    (rawPhone ? formatDisplayPhone(rawPhone) : 'Client Profile');
  const displayEmail = matchedContact?.email || params.email?.trim() || latestTrip?.passenger?.email || '';
  const computedSpend = sortedTrips.reduce(
    (sum, t) => (t.status === 'cancelled' || t.status === 'declined' ? sum : sum + Math.max(0, Number(t.pricing?.totalFare || 0))),
    0
  );
  const noteParts = [matchedContact?.internalDispatcherNotes, matchedContact?.notes, !matchedContact ? latestMeta.internalNotes : undefined]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  return {
    isExistingClient: Boolean(matchedContact || sortedTrips.length > 0),
    contact: matchedContact,
    displayName,
    displayPhone: rawPhone ? formatDisplayPhone(rawPhone) : '',
    rawPhone,
    displayEmail,
    isVip: Boolean(matchedContact?.isVip || latestMeta.vipStatus),
    isBlacklisted: Boolean(matchedContact?.isBlacklisted),
    corporateAccountName:
      matchedContact?.corporateAccountName || matchedContact?.corporateAccountId ||
      latestMeta.corporateDetails?.corporateAccount || latestMeta.corporateOrgName || null,
    customerScore: typeof matchedContact?.customerScore === 'number' ? matchedContact.customerScore : null,
    totalTrips: Math.max(matchedContact?.tripCount || 0, sortedTrips.length),
    totalSpend: Number(Math.max(matchedContact?.totalSpend || 0, computedSpend).toFixed(2)),
    dispatcherNotes: Array.from(new Set(noteParts)).join(' • '),
    sortedTrips,
  };
}

export function paginateClientTrips(
  sortedTrips: ReadonlyArray<Trip>,
  visibleCount: number = CLIENT_TRIPS_PAGE_SIZE
): PaginatedClientTrips {
  const safeLimit = Math.max(CLIENT_TRIPS_PAGE_SIZE, Math.floor(visibleCount || CLIENT_TRIPS_PAGE_SIZE));
  const visibleTrips = sortedTrips.slice(0, safeLimit);
  const remainingCount = Math.max(0, sortedTrips.length - visibleTrips.length);
  return {
    visibleTrips,
    hasMore: remainingCount > 0,
    remainingCount,
    nextVisibleCount: safeLimit + CLIENT_TRIPS_PAGE_SIZE,
  };
}

export function shouldAutoOpenClientProfileOnCall(params: {
  phone?: string | null;
  callSid?: string | null;
  seenCallKeys: Set<string>;
  contacts?: ReadonlyArray<ContactRecord>;
  trips?: ReadonlyArray<Trip>;
}): { shouldOpen: boolean; dedupeKey: string; profile: ResolvedClientProfileData | null } {
  const normPhone = normalizePhone(params.phone || '');
  if (normPhone.length < 7) return { shouldOpen: false, dedupeKey: '', profile: null };
  const sid = String(params.callSid || '').trim();
  const phoneKey = `call_phone_${normPhone}`;
  const dedupeKey = sid || phoneKey;
  // Ring -> Answer dedupe: honour BOTH the callSid and the phone key; late-arriving callSid is recorded
  if ((sid && params.seenCallKeys.has(sid)) || params.seenCallKeys.has(phoneKey)) {
    if (sid) params.seenCallKeys.add(sid);
    return { shouldOpen: false, dedupeKey, profile: null };
  }
  const profile = resolveClientProfileData({ phone: params.phone, contacts: params.contacts, trips: params.trips });
  if (!profile.isExistingClient) return { shouldOpen: false, dedupeKey, profile: null };
  params.seenCallKeys.add(phoneKey);
  if (sid) params.seenCallKeys.add(sid);
  return { shouldOpen: true, dedupeKey, profile };
}

export function buildNewTabValuesFromClientTrip(trip: Trip): DispatchFormValues {
  return cloneTripToDispatchFormValues(trip);
}
