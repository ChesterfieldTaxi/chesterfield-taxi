/**
 * TaxiCaller Historical Client Import Utility
 *
 * Pure deterministic parser, noise filter, phone deduplicator, gate-code extractor,
 * saved-places aggregator, and corporate-account linker for TaxiCaller JSON exports.
 * Zero AI calls; safe for both CLI scripts and future browser/Admin UI imports.
 */

import type { CorporateAccountConfig } from '../../types/config';
import type { Trip, TripLocation } from '../../types/trip';
import { formatDisplayPhone } from '../../utils/phone';
import {
  normalizeEmail,
  normalizePhone,
  normalizePhoneE164,
  normalizePlaceAddressKey,
  type ContactRecord,
  type ContactSavedPlace,
} from './contact.service';

export interface TaxiCallerClientRow {
  date?: string;
  passenger?: string;
  phone?: string;
  'passenger.email'?: string;
  email?: string;
  'account.name'?: string;
  account?: string;
  from?: string;
  to?: string;
  info?: string;
}

export interface TaxiCallerExportPayload {
  root?: {
    src_id?: string;
    rows?: TaxiCallerClientRow[];
  };
  rows?: TaxiCallerClientRow[];
}

export interface TaxiCallerImportStats {
  totalRows: number;
  filteredNoiseRows: number;
  filteredInvalidPhoneRows: number;
  uniquePhones: number;
  excludedSingleTripCount: number;
  includedContactsCount: number;
  corporateLinkedCount: number;
  gateCodeCount: number;
  savedPlacesCount: number;
  constructedTripsCount: number;
}

export interface TaxiCallerImportResult {
  contacts: ContactRecord[];
  trips: Trip[];
  stats: TaxiCallerImportStats;
}

export interface TaxiCallerImportOptions {
  corporateAccounts?: ReadonlyArray<CorporateAccountConfig>;
  nowMs?: number;
  maxSavedPlaces?: number;
  maxTripsPerCustomer?: number;
}

const NOISE_TEXT_PATTERNS: RegExp[] = [
  /\btest(?:s|ing)?\b/i,
  /\bsmoke\s*house\b/i,
];

const PLACEHOLDER_PHONES = new Set<string>([
  '1234567890',
  '0123456789',
  '3145551212',
  '3140000000',
  '6360000000',
]);

const REPEATED_DIGIT_PHONE_PATTERN = /^(\d)\1{9,}$/;

const HUB_ADDRESS_PATTERNS: RegExp[] = [
  /\blambert\b/i,
  /\blambert\s+ap\b/i,
  /\bspirit\s+of\s+st\.?\s*louis\b/i,
  /\bspirit\s+airport\b/i,
  /\bmidamerica\b/i,
  /\bsmoke\s*house\b/i,
];

const ZIP_ONLY_PATTERN = /^\d{5}(?:-\d{4})?$/;

const GATE_CODE_PATTERN =
  /\bgate(?:\s+code)?\s*(?:#|:|-|\bis\b)?\s*([*#]?\d{3,8}[*#]?)/i;

/**
 * Extracts the rows array from a TaxiCaller JSON export object or raw row array.
 */
export function extractTaxiCallerRows(
  payload: TaxiCallerExportPayload | TaxiCallerClientRow[] | null | undefined
): TaxiCallerClientRow[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.root?.rows)) return payload.root.rows;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

/**
 * Returns true if the row contains test or Smoke House noise in passenger, from, to, or info.
 */
export function isTaxiCallerNoiseRow(row: TaxiCallerClientRow): boolean {
  const fields = [row.passenger, row.from, row.to, row.info];
  for (const field of fields) {
    if (!field || typeof field !== 'string') continue;
    for (const pattern of NOISE_TEXT_PATTERNS) {
      if (pattern.test(field)) return true;
    }
  }
  return false;
}

/**
 * Normalizes a raw TaxiCaller phone string to a deduplication key and E.164 phone.
 * Returns null for invalid, short (< 10 digits), or placeholder phone numbers.
 */
export function parseTaxiCallerPhone(
  rawPhone: string | null | undefined
): { key: string; e164: string } | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;

  const normalized10 = normalizePhone(rawPhone);
  if (normalized10.length < 10) return null;

  if (
    PLACEHOLDER_PHONES.has(normalized10) ||
    REPEATED_DIGIT_PHONE_PATTERN.test(normalized10)
  ) {
    return null;
  }

  const e164 = normalizePhoneE164(rawPhone);
  if (!e164) return null;

  return { key: normalized10, e164 };
}

/**
 * Extracts a gate code (e.g. "#4848" or "5209") from a TaxiCaller `info` string.
 */
export function extractGateCode(info: string | null | undefined): string | null {
  if (!info || typeof info !== 'string') return null;
  const match = info.match(GATE_CODE_PATTERN);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

/**
 * Returns true if the address is a valid non-hub street address suitable for `savedPlaces`.
 */
export function isEligibleSavedPlaceAddress(address: string | null | undefined): boolean {
  if (!address || typeof address !== 'string') return false;
  const trimmed = address.trim();
  if (trimmed.length < 8) return false;
  if (ZIP_ONLY_PATTERN.test(trimmed)) return false;

  for (const pattern of HUB_ADDRESS_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Require at least one letter and either a street number or comma-separated location
  const hasLetter = /[a-zA-Z]/.test(trimmed);
  const hasDigitOrComma = /\d/.test(trimmed) || trimmed.includes(',');
  return hasLetter && hasDigitOrComma;
}

/**
 * Builds a compact street label from a full geocoded address.
 */
function buildPlaceLabel(address: string, isPrimaryHome: boolean): string {
  if (isPrimaryHome) return 'Home';
  const firstSegment = address.split(',')[0]?.trim();
  return firstSegment && firstSegment.length <= 48 ? firstSegment : address.slice(0, 48).trim();
}

/**
 * Parses a TaxiCaller date string (e.g., "01/01/2021 01:45 AM") to epoch ms, or null.
 */
export function parseTaxiCallerDateMs(rawDate: string | null | undefined): number | null {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const trimmed = rawDate.trim();
  if (!trimmed || trimmed === '-') return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Builds a lookup map for corporate accounts keyed by normalized accountNumber.
 */
function buildCorporateAccountLookup(
  accounts?: ReadonlyArray<CorporateAccountConfig>
): Map<string, CorporateAccountConfig> {
  const map = new Map<string, CorporateAccountConfig>();
  if (!accounts) return map;
  for (const acc of accounts) {
    if (!acc || !acc.accountNumber) continue;
    const key = acc.accountNumber.trim().toUpperCase();
    if (key) map.set(key, acc);
  }
  return map;
}

function normalizeCorporateKey(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/^ACCT?\s*#?\s*/i, '');
}

/**
 * Formats a person's name with regular Title Case when the input is ALL CAPS or all lowercase,
 * while preserving intentional mixed-case names (e.g. "McCartie", "DeAngelo").
 */
export function formatPersonName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';

  const hasLetters = /[a-zA-Z]/.test(collapsed);
  if (!hasLetters) return collapsed;

  const isAllUpper = collapsed === collapsed.toUpperCase();
  const isAllLower = collapsed === collapsed.toLowerCase();
  if (!isAllUpper && !isAllLower) {
    return collapsed;
  }

  return collapsed
    .split(' ')
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => {
          if (part === '-' || part === "'" || !part) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('')
    )
    .join(' ');
}

const LAMBERT_AP_ZONE_PATTERN = /\blambert\s+ap\b/i;

const CANONICAL_STL_LOCATION: TripLocation = {
  address: 'St. Louis Lambert International Airport (STL)',
  formattedAddress: '10701 Lambert International Blvd, St. Louis, MO 63145',
  placeId: 'canonical-lambert-stl',
  coordinates: { lat: 38.7487, lng: -90.37 },
};

function buildTripLocation(rawAddress: string, fallbackAddress: string): TripLocation {
  const addr = (rawAddress || '').trim();
  if (addr && LAMBERT_AP_ZONE_PATTERN.test(addr)) {
    return { ...CANONICAL_STL_LOCATION, coordinates: { ...CANONICAL_STL_LOCATION.coordinates! } };
  }
  return { address: addr || fallbackAddress };
}

/** Cutoff timestamp (2026-11-26 23:59:59.999 local): trips after this date are set to `confirmed`. */
const CONFIRMED_TRIP_CUTOFF_MS = new Date(2026, 10, 26, 23, 59, 59, 999).getTime();

function splitFirstLastName(fullName: string): { firstName?: string; lastName?: string } {
  const trimmed = fullName.trim();
  if (!trimmed || /^\(?\d/.test(trimmed)) return {};
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

interface PlaceAccumulator {
  address: string;
  count: number;
  gateCodes: Set<string>;
}

interface RawTripSnapshot {
  dateMs: number | null;
  orderIndex: number;
  from: string;
  to: string;
  info: string;
}

interface ClientAccumulator {
  phoneKey: string;
  e164: string;
  tripCount: number;
  latestName: string;
  latestNameDateMs: number;
  latestNameOrder: number;
  emails: Map<string, number>;
  accountNumbers: Map<string, number>;
  gateCodes: Set<string>;
  places: Map<string, PlaceAccumulator>;
  rawTrips: RawTripSnapshot[];
  firstSeenMs: number | null;
  lastSeenMs: number | null;
}

/**
 * Parses, filters, deduplicates, and enriches TaxiCaller rows into `ContactRecord[]` and `Trip[]`.
 */
export function transformTaxiCallerRows(
  rows: ReadonlyArray<TaxiCallerClientRow>,
  options: TaxiCallerImportOptions = {}
): TaxiCallerImportResult {
  const nowMs = options.nowMs ?? Date.now();
  const maxSavedPlaces = options.maxSavedPlaces ?? 8;
  const maxTripsPerCustomer = Math.min(Math.max(options.maxTripsPerCustomer ?? 10, 1), 10);
  const corpLookup = buildCorporateAccountLookup(options.corporateAccounts);

  const stats: TaxiCallerImportStats = {
    totalRows: rows.length,
    filteredNoiseRows: 0,
    filteredInvalidPhoneRows: 0,
    uniquePhones: 0,
    excludedSingleTripCount: 0,
    includedContactsCount: 0,
    corporateLinkedCount: 0,
    gateCodeCount: 0,
    savedPlacesCount: 0,
    constructedTripsCount: 0,
  };

  const byPhone = new Map<string, ClientAccumulator>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || typeof row !== 'object') continue;

    if (isTaxiCallerNoiseRow(row)) {
      stats.filteredNoiseRows += 1;
      continue;
    }

    const parsedPhone = parseTaxiCallerPhone(row.phone);
    if (!parsedPhone) {
      stats.filteredInvalidPhoneRows += 1;
      continue;
    }

    let acc = byPhone.get(parsedPhone.key);
    if (!acc) {
      acc = {
        phoneKey: parsedPhone.key,
        e164: parsedPhone.e164,
        tripCount: 0,
        latestName: '',
        latestNameDateMs: -1,
        latestNameOrder: -1,
        emails: new Map(),
        accountNumbers: new Map(),
        gateCodes: new Set(),
        places: new Map(),
        rawTrips: [],
        firstSeenMs: null,
        lastSeenMs: null,
      };
      byPhone.set(parsedPhone.key, acc);
    }

    acc.tripCount += 1;

    const dateMs = parseTaxiCallerDateMs(row.date);
    if (dateMs !== null) {
      if (acc.firstSeenMs === null || dateMs < acc.firstSeenMs) acc.firstSeenMs = dateMs;
      if (acc.lastSeenMs === null || dateMs > acc.lastSeenMs) acc.lastSeenMs = dateMs;
    }

    const rawName = (row.passenger || '').trim();
    if (rawName) {
      const effectiveMs = dateMs ?? 0;
      const isMoreRecent =
        effectiveMs > acc.latestNameDateMs ||
        (effectiveMs === acc.latestNameDateMs && rowIndex >= acc.latestNameOrder);
      if (isMoreRecent || !acc.latestName) {
        acc.latestName = formatPersonName(rawName);
        acc.latestNameDateMs = effectiveMs;
        acc.latestNameOrder = rowIndex;
      }
    }

    const rawEmail = row['passenger.email'] ?? row.email;
    const normEmail = normalizeEmail(rawEmail);
    if (normEmail) {
      acc.emails.set(normEmail, (acc.emails.get(normEmail) || 0) + 1);
    }

    const rawAccount = row['account.name'] ?? row.account;
    const normAccount = normalizeCorporateKey(rawAccount);
    if (normAccount) {
      acc.accountNumbers.set(normAccount, (acc.accountNumbers.get(normAccount) || 0) + 1);
    }

    const gateCode = extractGateCode(row.info);
    if (gateCode) {
      acc.gateCodes.add(gateCode);
    }

    acc.rawTrips.push({
      dateMs,
      orderIndex: rowIndex,
      from: (row.from || '').trim(),
      to: (row.to || '').trim(),
      info: (row.info || '').trim(),
    });

    for (const candidateAddr of [row.from, row.to]) {
      if (!isEligibleSavedPlaceAddress(candidateAddr)) continue;
      const addrKey = normalizePlaceAddressKey(candidateAddr);
      if (!addrKey) continue;
      let place = acc.places.get(addrKey);
      if (!place) {
        place = {
          address: candidateAddr!.trim(),
          count: 0,
          gateCodes: new Set(),
        };
        acc.places.set(addrKey, place);
      } else if (candidateAddr!.trim().length > place.address.length) {
        // Prefer fuller address (e.g. with ZIP code) when available
        place.address = candidateAddr!.trim();
      }
      place.count += 1;
      if (gateCode) {
        place.gateCodes.add(gateCode);
      }
    }
  }

  stats.uniquePhones = byPhone.size;
  const contacts: ContactRecord[] = [];
  const trips: Trip[] = [];

  for (const acc of byPhone.values()) {
    const hasEmail = acc.emails.size > 0;
    const hasAccount = acc.accountNumbers.size > 0;
    const meetsInclusion = acc.tripCount >= 2 || hasEmail || hasAccount;

    if (!meetsInclusion) {
      stats.excludedSingleTripCount += 1;
      continue;
    }

    const name = acc.latestName || formatDisplayPhone(acc.e164) || acc.e164;
    const { firstName, lastName } = splitFirstLastName(name);

    // Pick most frequent email
    let primaryEmail: string | undefined;
    let bestEmailCount = 0;
    for (const [em, count] of acc.emails.entries()) {
      if (count > bestEmailCount) {
        bestEmailCount = count;
        primaryEmail = em;
      }
    }

    // Pick most frequent account number & link against Firestore corporateAccounts
    let topAccountNumber: string | undefined;
    let bestAcctCount = 0;
    for (const [acctNum, count] of acc.accountNumbers.entries()) {
      if (count > bestAcctCount) {
        bestAcctCount = count;
        topAccountNumber = acctNum;
      }
    }

    const matchedCorp = topAccountNumber ? corpLookup.get(topAccountNumber) : undefined;
    if (matchedCorp || topAccountNumber) {
      stats.corporateLinkedCount += 1;
    }

    // Aggregate saved places sorted by frequency descending
    const sortedPlaces = Array.from(acc.places.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, maxSavedPlaces);

    const homeAddress = sortedPlaces[0]?.address;
    const savedPlaces: ContactSavedPlace[] = sortedPlaces.map((p, idx) => {
      const placeGateNotes =
        p.gateCodes.size > 0
          ? `Gate code: ${Array.from(p.gateCodes).join(', ')}`
          : undefined;
      return {
        id: `tc_place_${acc.phoneKey}_${idx + 1}`,
        label: buildPlaceLabel(p.address, idx === 0),
        category: idx === 0 ? 'home' : 'other',
        address: p.address,
        notes: placeGateNotes,
      };
    });

    stats.savedPlacesCount += savedPlaces.length;

    const gateCodesList = Array.from(acc.gateCodes);
    if (gateCodesList.length > 0) {
      stats.gateCodeCount += 1;
    }

    const noteParts: string[] = [];
    if (gateCodesList.length > 0) {
      noteParts.push(`Gate code: ${gateCodesList.join(', ')}`);
    }
    if (topAccountNumber && !matchedCorp) {
      noteParts.push(`TaxiCaller Account: ${topAccountNumber}`);
    }

    const contactId = `tc_${acc.phoneKey}`;
    const record: ContactRecord = {
      id: contactId,
      name,
      firstName,
      lastName,
      phone: acc.e164,
      primaryPhoneType: 'mobile',
      email: primaryEmail,
      corporateAccountId: matchedCorp?.id,
      corporateAccountNumber: matchedCorp?.accountNumber || topAccountNumber,
      corporateAccountName: matchedCorp?.companyName,
      homeAddress,
      savedPlaces: savedPlaces.length > 0 ? savedPlaces : undefined,
      notes: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
      tripCount: acc.tripCount,
      createdAt: acc.firstSeenMs ?? nowMs,
      updatedAt: acc.lastSeenMs ?? nowMs,
    };

    contacts.push(record);

    // Construct between 1 and 10 most recent trips for this customer
    const recentTrips = [...acc.rawTrips]
      .sort((a, b) => {
        const msDiff = (b.dateMs ?? 0) - (a.dateMs ?? 0);
        return msDiff !== 0 ? msDiff : b.orderIndex - a.orderIndex;
      })
      .slice(0, maxTripsPerCustomer);

    for (let tIdx = 0; tIdx < recentTrips.length; tIdx += 1) {
      const rawTrip = recentTrips[tIdx];
      const tripMs = rawTrip.dateMs ?? acc.lastSeenMs ?? nowMs;
      const tripIso = new Date(tripMs).toISOString();
      const isUpcomingConfirmed =
        rawTrip.dateMs !== null && rawTrip.dateMs > CONFIRMED_TRIP_CUTOFF_MS;
      const tripStatus = isUpcomingConfirmed ? 'confirmed' : 'completed';

      const tripDoc: Trip = {
        id: `tc_trip_${acc.phoneKey}_${tIdx + 1}`,
        customerId: contactId,
        corporateAccountId: matchedCorp?.id,
        status: tripStatus,
        offeredToIds: [],
        rejectedByIds: [],
        assignedDriverId: null,
        pickupLocation: buildTripLocation(rawTrip.from, homeAddress || 'Chesterfield, MO'),
        dropoffLocation: buildTripLocation(rawTrip.to, homeAddress || 'Chesterfield, MO'),
        driverNotes: rawTrip.info || undefined,
        bookingType: 'scheduled',
        scheduledPickupTime: tripIso,
        completedAt: isUpcomingConfirmed ? undefined : tripIso,
        passenger: {
          firstName: firstName || name,
          lastName: lastName || '',
          email: primaryEmail || '',
          phone: acc.e164,
          passengerCount: 1,
          luggageCount: 0,
          specialRequests: rawTrip.info || undefined,
        },
        vehicleTier: /\bvan\b/i.test(rawTrip.info) ? 'van' : 'standard',
        pricing: {
          baseFare: 0,
          distanceMiles: 0,
          durationMinutes: 0,
          distanceRate: 0,
          timeRate: 0,
          vehicleMultiplier: 1,
          surgeMultiplier: 1,
          discountAmount: 0,
          subtotal: 0,
          totalFare: 0,
          currency: 'USD',
        },
        payment: {
          method: matchedCorp?.id ? 'corporate' : 'cash',
          status: isUpcomingConfirmed ? 'pending' : 'settled',
          amount: 0,
          paidAt: isUpcomingConfirmed ? undefined : tripIso,
          corporateAccountId: matchedCorp?.id,
        },
        statusHistory: [
          {
            from: null,
            to: tripStatus,
            timestamp: tripIso,
            actorRole: 'system',
            reason: 'Imported from TaxiCaller history',
          },
        ],
        createdAt: tripIso,
        updatedAt: tripIso,
        metadata: {
          source: 'taxicaller_import',
        },
      };
      trips.push(tripDoc);
    }
  }

  stats.includedContactsCount = contacts.length;
  stats.constructedTripsCount = trips.length;
  return { contacts, trips, stats };
}
