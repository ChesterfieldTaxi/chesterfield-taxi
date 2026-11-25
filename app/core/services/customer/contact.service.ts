/**
 * Contact Service & Unified Multi-Channel Identity Resolution
 *
 * Centralized contact management for Chesterfield Taxi.
 * Unifies passenger profiles across Dispatch (`CommsHub`, `EmailDock`), Admin Directory,
 * Serverless Telephony Webhooks, and Booking Engine.
 * Persists custom updates in localStorage with cross-tab synchronization via WorkspaceBus.
 */

import type {
  CommsChannel,
  CommsContactType,
  CommsEvent,
  CommsThread,
  CommsUnreadByChannel,
} from '../../types/comms';
import { formatDisplayPhone, sanitizeToE164 } from '../../utils/phone';
import { SAMPLE_PASSENGER_PROFILES } from '../booking/passenger-lookup.service';
import { getWorkspaceBus } from '../workspace-bus.service';

export type PhoneType = 'mobile' | 'home' | 'work' | 'other';

export interface AdditionalPhone {
  id: string;
  type: PhoneType;
  number: string;
  extension?: string;
  label?: string;
}

export type ContactSavedPlaceCategory = 'home' | 'work' | 'airport' | 'medical' | 'favorite' | 'other';

export interface ContactSavedPlace {
  id: string;
  label: string;
  category: ContactSavedPlaceCategory;
  address: string;
  coordinates?: { lat: number; lng: number };
  notes?: string;
}

export interface ContactRecord {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone: string; // Primary phone
  primaryPhoneType?: PhoneType;
  additionalPhones?: AdditionalPhone[];
  mobilePhone?: string;
  homePhone?: string;
  workPhone?: string;
  workExtension?: string;
  email?: string;
  secondaryEmail?: string;
  corporateAccountId?: string;
  corporateAccountNumber?: string;
  corporateAccountName?: string;
  billingDepartment?: string;
  defaultPoNumber?: string;
  isVip?: boolean;
  vipReason?: string;
  preferredVehicleTier?: 'standard' | 'premium' | 'xl' | 'wheelchair' | 'executive' | 'suv' | 'van';
  preferredDriverIds?: string[];
  excludedDriverIds?: string[];
  homeAddress?: string;
  workAddress?: string;
  savedPlaces?: ContactSavedPlace[];
  accessibilityNeeds?: {
    wheelchair?: boolean;
    walker?: boolean;
    serviceAnimal?: boolean;
    extraAssistance?: boolean;
  };
  smsNotifications?: boolean;
  notes?: string;
  internalDispatcherNotes?: string;
  tripCount?: number;
  totalSpend?: number;
  customerScore?: number;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  isArchived?: boolean;
  createdAt?: string | number;
  updatedAt: number;
}

export interface UnifiedContactQuery {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  contactType?: CommsContactType;
  /**
   * When true (default when both phone and email are provided and match at least one existing
   * profile, or when linking identities), persists newly discovered phone/email linkage onto
   * the unified `ContactRecord`.
   */
  autoLink?: boolean;
}

export interface UnifiedContactResolution {
  contact: ContactRecord | null;
  contactId?: string;
  contactName: string;
  contactType: CommsContactType;
  primaryPhone?: string; // E.164
  phones: string[]; // E.164
  primaryEmail?: string; // lowercase
  emails: string[]; // lowercase
  corporateAccountId?: string;
  corporateAccountName?: string;
  threadId: string;
}

const STORAGE_KEY = 'ct_contacts_database';
const EMAIL_BASIC_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Normalizes a phone string into canonical E.164 (`+13145550199`) when it contains
 * at least 7 digits; returns `''` for non-numeric placeholders (e.g. `"Caller"`).
 */
export function normalizePhoneE164(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return sanitizeToE164(phone);
}

/**
 * Pure email normalizer: extracts address from optional `"Display Name <addr@domain.com>"`
 * formatting, trims whitespace, lowercases, and validates `@` domain structure.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  if (!trimmed) return '';
  const bracketMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (bracketMatch ? bracketMatch[1] : trimmed).trim().toLowerCase();
  if (!EMAIL_BASIC_PATTERN.test(candidate)) return '';
  return candidate;
}

function sanitizeThreadIdPart(raw: string): string {
  return raw.trim().replace(/[\/\s]+/g, '_');
}

/** Normalized dedupe key for street addresses (case/punctuation/whitespace-insensitive). */
export function normalizePlaceAddressKey(address: string | null | undefined): string {
  return String(address || '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes client driver priority & exclusion lists: trims IDs, preserves `#1..#N` order
 * in `preferredDriverIds`, deduplicates both lists, and enforces strict mutual exclusivity
 * (any ID in `excludedDriverIds` is stripped from `preferredDriverIds`).
 */
export function normalizeClientDriverPreferences(
  preferredIds?: ReadonlyArray<string> | null,
  excludedIds?: ReadonlyArray<string> | null
): { preferredDriverIds: string[]; excludedDriverIds: string[] } {
  const excludedSet = new Set<string>();
  const excludedDriverIds: string[] = [];
  if (Array.isArray(excludedIds)) {
    for (const raw of excludedIds) {
      const id = String(raw || '').trim();
      if (id && !excludedSet.has(id)) {
        excludedSet.add(id);
        excludedDriverIds.push(id);
      }
    }
  }
  const preferredSet = new Set<string>();
  const preferredDriverIds: string[] = [];
  if (Array.isArray(preferredIds)) {
    for (const raw of preferredIds) {
      const id = String(raw || '').trim();
      if (id && !excludedSet.has(id) && !preferredSet.has(id)) {
        preferredSet.add(id);
        preferredDriverIds.push(id);
      }
    }
  }
  return { preferredDriverIds, excludedDriverIds };
}

/**
 * Pure deterministic canonical `threadId` resolver.
 * Priority:
 * 1. Stable `contactId` (`thr_contact_${contactId}`) so multi-phone + multi-email contacts
 *    always share one canonical thread across Calls, SMS, Voicemails, Emails, and Notes.
 * 2. Normalized E.164 phone (`thr_phone_${e164}`).
 * 3. Normalized lowercase email (`thr_email_${email}`).
 */
export function resolveCanonicalThreadId(input: {
  contactId?: string | null;
  phone?: string | null;
  email?: string | null;
  contact?: ContactRecord | null;
}): string {
  const effectiveContactId = String(input.contact?.id || input.contactId || '').trim();
  if (effectiveContactId && !effectiveContactId.startsWith('temp_')) {
    return `thr_contact_${sanitizeThreadIdPart(effectiveContactId)}`;
  }

  const e164 =
    normalizePhoneE164(input.phone) ||
    normalizePhoneE164(input.contact?.phone) ||
    normalizePhoneE164(input.contact?.mobilePhone);
  if (e164) {
    return `thr_phone_${sanitizeThreadIdPart(e164)}`;
  }

  const normEmail =
    normalizeEmail(input.email) ||
    normalizeEmail(input.contact?.email) ||
    normalizeEmail(input.contact?.secondaryEmail);
  if (normEmail) {
    return `thr_email_${sanitizeThreadIdPart(normEmail)}`;
  }

  return 'thr_unknown';
}

export function collectContactPhonesE164(
  contact?: ContactRecord | null,
  extraPhones: Array<string | null | undefined> = []
): string[] {
  const seenNorm = new Set<string>();
  const out: string[] = [];

  const pushPhone = (raw?: string | null) => {
    const e164 = normalizePhoneE164(raw);
    if (!e164) return;
    const norm = normalizePhone(e164) || e164;
    if (seenNorm.has(norm)) return;
    seenNorm.add(norm);
    out.push(e164);
  };

  if (contact) {
    pushPhone(contact.phone);
    pushPhone(contact.mobilePhone);
    pushPhone(contact.homePhone);
    pushPhone(contact.workPhone);
    if (Array.isArray(contact.additionalPhones)) {
      for (const ap of contact.additionalPhones) {
        pushPhone(ap?.number);
      }
    }
  }
  for (const extra of extraPhones) {
    pushPhone(extra);
  }
  return out;
}

export function collectContactEmailsNormalized(
  contact?: ContactRecord | null,
  extraEmails: Array<string | null | undefined> = []
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushEmail = (raw?: string | null) => {
    const norm = normalizeEmail(raw);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };

  if (contact) {
    pushEmail(contact.email);
    pushEmail(contact.secondaryEmail);
  }
  for (const extra of extraEmails) {
    pushEmail(extra);
  }
  return out;
}

/**
 * Pure rollup recomputation over a thread's events. Guarantees exact `unreadByChannel`,
 * `unreadCountTotal`, `channels`, and `lastEvent*` metadata with zero drift on retries or merges.
 */
export function recomputeCommsThreadRollups(
  baseThread: CommsThread,
  events: CommsEvent[],
  nowIso: string = new Date().toISOString()
): CommsThread {
  const activeEvents = events
    .filter((e) => !e.isArchived)
    .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

  const unreadByChannel: CommsUnreadByChannel = {
    sms: 0,
    call: 0,
    voicemail: 0,
    email: 0,
  };
  const channelSet = new Set<CommsChannel>(baseThread.channels || []);
  const phoneList = collectContactPhonesE164(null, baseThread.phones || []);
  const emailList = collectContactEmailsNormalized(null, baseThread.emails || []);
  const tripIds = new Set<string>(baseThread.linkedTripIds || []);

  const addPhone = (raw?: string) => {
    const e164 = normalizePhoneE164(raw);
    if (!e164) return;
    const norm = normalizePhone(e164);
    if (!phoneList.some((p) => normalizePhone(p) === norm)) {
      phoneList.push(e164);
    }
  };
  const addEmail = (raw?: string) => {
    const norm = normalizeEmail(raw);
    if (norm && !emailList.includes(norm)) {
      emailList.push(norm);
    }
  };

  if (baseThread.primaryPhone) addPhone(baseThread.primaryPhone);
  if (baseThread.primaryEmail) addEmail(baseThread.primaryEmail);

  for (const evt of activeEvents) {
    channelSet.add(evt.channel);
    if (evt.contactPhone) addPhone(evt.contactPhone);
    if (evt.contactEmail) addEmail(evt.contactEmail);
    if (evt.tripId) tripIds.add(evt.tripId);

    if (evt.isUnread) {
      if (evt.channel === 'sms') unreadByChannel.sms += 1;
      else if (evt.channel === 'call') unreadByChannel.call += 1;
      else if (evt.channel === 'voicemail') unreadByChannel.voicemail += 1;
      else if (evt.channel === 'email') unreadByChannel.email += 1;
    }
  }

  const unreadCountTotal =
    unreadByChannel.sms +
    unreadByChannel.call +
    unreadByChannel.voicemail +
    unreadByChannel.email;

  const latest = activeEvents[activeEvents.length - 1];

  return {
    ...baseThread,
    primaryPhone: normalizePhoneE164(baseThread.primaryPhone) || phoneList[0] || undefined,
    phones: phoneList,
    primaryEmail: normalizeEmail(baseThread.primaryEmail) || emailList[0] || undefined,
    emails: emailList,
    linkedTripIds: Array.from(tripIds),
    channels: Array.from(channelSet),
    lastEventAt: latest ? latest.timestampIso : baseThread.lastEventAt,
    lastEventAtMs: latest ? latest.timestampMs : baseThread.lastEventAtMs,
    lastChannel: latest ? latest.channel : baseThread.lastChannel,
    lastDirection: latest ? latest.direction : baseThread.lastDirection,
    lastSubject: latest?.subject !== undefined ? latest.subject : baseThread.lastSubject,
    lastSnippet: latest ? latest.snippet : baseThread.lastSnippet,
    unreadCountTotal,
    unreadByChannel,
    updatedAt: nowIso,
  };
}

/**
 * Pure multi-thread merge helper: merges 1..N existing threads (e.g. a phone-only thread
 * and an email-only thread) and all of their events into a single canonical `CommsThread`.
 */
export function mergeCommsThreads(input: {
  canonicalThreadId: string;
  threads: CommsThread[];
  events: CommsEvent[];
  contact?: ContactRecord | null;
  contactName?: string;
  contactType?: CommsContactType;
  phones?: string[];
  emails?: string[];
  corporateAccountId?: string;
  corporateAccountName?: string;
  nowIso?: string;
}): {
  mergedThread: CommsThread;
  updatedEvents: CommsEvent[];
  removedThreadIds: string[];
} {
  const nowIso = input.nowIso || new Date().toISOString();
  const sortedThreads = [...input.threads].sort(
    (a, b) => (b.lastEventAtMs || 0) - (a.lastEventAtMs || 0)
  );
  const seed = sortedThreads[0];

  const allPhones = collectContactPhonesE164(input.contact, [
    ...(input.phones || []),
    ...sortedThreads.flatMap((t) => [t.primaryPhone, ...(t.phones || [])]),
  ]);
  const allEmails = collectContactEmailsNormalized(input.contact, [
    ...(input.emails || []),
    ...sortedThreads.flatMap((t) => [t.primaryEmail, ...(t.emails || [])]),
  ]);
  const linkedTrips = Array.from(
    new Set(sortedThreads.flatMap((t) => t.linkedTripIds || []))
  );
  const channels = Array.from(
    new Set<CommsChannel>(sortedThreads.flatMap((t) => t.channels || []))
  );

  const earliestCreatedAt = sortedThreads
    .map((t) => t.createdAt)
    .filter(Boolean)
    .sort()[0] || nowIso;

  const resolvedContactId =
    (input.contact?.id && !input.contact.id.startsWith('temp_') ? input.contact.id : undefined) ||
    sortedThreads.find((t) => t.contactId && !t.contactId.startsWith('temp_'))?.contactId;

  const resolvedName =
    input.contact?.name ||
    input.contactName ||
    sortedThreads.find((t) => t.contactName && !t.contactName.startsWith('+'))?.contactName ||
    seed?.contactName ||
    (allPhones[0] ? formatDisplayPhone(allPhones[0]) : allEmails[0] || 'Customer');

  const resolvedCorporateId =
    input.contact?.corporateAccountId ||
    input.corporateAccountId ||
    sortedThreads.find((t) => t.corporateAccountId)?.corporateAccountId;

  const resolvedCorporateName =
    input.contact?.corporateAccountName ||
    input.corporateAccountName ||
    sortedThreads.find((t) => t.corporateAccountName)?.corporateAccountName;

  const resolvedType: CommsContactType =
    input.contactType ||
    (resolvedCorporateId ? 'corporate' : undefined) ||
    sortedThreads.find((t) => t.contactType && t.contactType !== 'unknown')?.contactType ||
    'passenger';

  // Deduplicate events by deterministic event.id and point every event to canonicalThreadId
  const eventMap = new Map<string, CommsEvent>();
  for (const evt of input.events) {
    const existing = eventMap.get(evt.id);
    const rewritten: CommsEvent = {
      ...(existing || {}),
      ...evt,
      threadId: input.canonicalThreadId,
      contactId: resolvedContactId || evt.contactId || existing?.contactId,
      contactName: resolvedName || evt.contactName,
      contactPhone: evt.contactPhone || existing?.contactPhone || allPhones[0],
      contactEmail: evt.contactEmail || existing?.contactEmail || allEmails[0],
    };
    eventMap.set(evt.id, rewritten);
  }

  const updatedEvents = Array.from(eventMap.values()).sort(
    (a, b) => (a.timestampMs || 0) - (b.timestampMs || 0)
  );

  const baseThread: CommsThread = {
    id: input.canonicalThreadId,
    contactId: resolvedContactId,
    contactName: resolvedName,
    contactType: resolvedType,
    primaryPhone: allPhones[0],
    phones: allPhones,
    primaryEmail: allEmails[0],
    emails: allEmails,
    corporateAccountId: resolvedCorporateId,
    corporateAccountName: resolvedCorporateName,
    linkedTripIds: linkedTrips,
    channels,
    lastEventAt: seed?.lastEventAt || nowIso,
    lastEventAtMs: seed?.lastEventAtMs || Date.parse(nowIso) || Date.now(),
    lastChannel: seed?.lastChannel || 'sms',
    lastDirection: seed?.lastDirection || 'inbound',
    lastSubject: seed?.lastSubject,
    lastSnippet: seed?.lastSnippet || '',
    unreadCountTotal: 0,
    unreadByChannel: { sms: 0, call: 0, voicemail: 0, email: 0 },
    isStarred: sortedThreads.some((t) => Boolean(t.isStarred)),
    isArchived: sortedThreads.length > 0 && sortedThreads.every((t) => Boolean(t.isArchived)),
    createdAt: earliestCreatedAt,
    updatedAt: nowIso,
  };

  const mergedThread = recomputeCommsThreadRollups(baseThread, updatedEvents, nowIso);
  const removedThreadIds = sortedThreads
    .map((t) => t.id)
    .filter((id) => id !== input.canonicalThreadId);

  return {
    mergedThread,
    updatedEvents,
    removedThreadIds,
  };
}

function sampleProfileToContactRecord(
  sample: (typeof SAMPLE_PASSENGER_PROFILES)[number]
): ContactRecord {
  return {
    id: sample.id,
    name: `${sample.firstName} ${sample.lastName}`.trim(),
    firstName: sample.firstName,
    lastName: sample.lastName,
    phone: sample.phone,
    mobilePhone: sample.phone,
    email: normalizeEmail(sample.email) || sample.email,
    corporateAccountId: sample.corporateAccountId,
    corporateAccountName: sample.corporateAccountId
      ? sample.corporateAccountId.replace('CORP-', '').replace(/-/g, ' ')
      : undefined,
    isVip: sample.vipStatus ?? false,
    preferredVehicleTier: sample.preferredVehicleTier,
    homeAddress: sample.recentPickupAddress,
    workAddress: sample.recentDropoffAddress,
    notes: sample.notes,
    tripCount: sample.totalTrips || 1,
    totalSpend: (sample.totalTrips || 1) * 45,
    customerScore: sample.vipStatus ? 95 : 85,
    updatedAt: 0,
  };
}

function isIndexKey(key: string): boolean {
  return key.startsWith('phone_') || key.startsWith('email_');
}

class ContactService {
  private customContacts: Map<string, ContactRecord> = new Map();
  private listeners: Set<(event: { action: 'saved' | 'deleted'; contact: ContactRecord }) => void> =
    new Set();

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.loadFromStorage();
          this.notifyListeners({ action: 'saved', contact: {} as ContactRecord });
        }
      });

      const bus = getWorkspaceBus();
      bus.subscribe((msg) => {
        if (msg.type === 'CONTACT_UPDATED' && (msg.payload as any)?.contact) {
          const contact = (msg.payload as any).contact as ContactRecord;
          this.indexContactRecord(contact);
          this.notifyListeners({ action: 'saved', contact });
        }
      });
    }
  }

  private indexContactRecord(record: ContactRecord) {
    if (!record || !record.id) return;
    this.customContacts.set(record.id, record);

    const phones = collectContactPhonesE164(record);
    for (const p of phones) {
      const norm = normalizePhone(p);
      if (norm) {
        this.customContacts.set(`phone_${norm}`, record);
      }
    }

    const emails = collectContactEmailsNormalized(record);
    for (const em of emails) {
      this.customContacts.set(`email_${em}`, record);
    }
  }

  private removeContactIndexes(record: ContactRecord) {
    this.customContacts.delete(record.id);
    for (const p of collectContactPhonesE164(record)) {
      const norm = normalizePhone(p);
      if (norm && this.customContacts.get(`phone_${norm}`)?.id === record.id) {
        this.customContacts.delete(`phone_${norm}`);
      }
    }
    for (const em of collectContactEmailsNormalized(record)) {
      if (this.customContacts.get(`email_${em}`)?.id === record.id) {
        this.customContacts.delete(`email_${em}`);
      }
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.customContacts.clear();
          for (const item of parsed) {
            this.indexContactRecord(item);
          }
        }
      }
    } catch {
      // Storage parsing failure fallback
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const uniqueList: ContactRecord[] = [];
      const seenIds = new Set<string>();
      for (const [key, record] of this.customContacts.entries()) {
        if (!isIndexKey(key) && !seenIds.has(record.id)) {
          seenIds.add(record.id);
          uniqueList.push(record);
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueList));
    } catch {
      // Storage write error
    }
  }

  private notifyListeners(event: { action: 'saved' | 'deleted'; contact: ContactRecord }) {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch {}
    });
  }

  public subscribe(
    listener: (event: { action: 'saved' | 'deleted'; contact: ContactRecord }) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public resetForTests(): void {
    this.customContacts.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }

  public getAllContacts(): ContactRecord[] {
    const combinedById = new Map<string, ContactRecord>();
    const phoneOwnerId = new Map<string, string>();
    const emailOwnerId = new Map<string, string>();

    // 1. Baseline sample passenger profiles
    for (const sample of SAMPLE_PASSENGER_PROFILES) {
      const rec = sampleProfileToContactRecord(sample);
      combinedById.set(rec.id, rec);
      const normPhone = normalizePhone(rec.phone);
      if (normPhone) phoneOwnerId.set(normPhone, rec.id);
      const normEm = normalizeEmail(rec.email);
      if (normEm) emailOwnerId.set(normEm, rec.id);
    }

    // 2. Custom created or edited contacts override matching baseline records
    const seenIds = new Set<string>();
    for (const [key, record] of this.customContacts.entries()) {
      if (!isIndexKey(key) && !seenIds.has(record.id)) {
        seenIds.add(record.id);
        const normPhone = normalizePhone(record.phone);
        const normEm = normalizeEmail(record.email);
        const overriddenPhoneId = normPhone ? phoneOwnerId.get(normPhone) : undefined;
        const overriddenEmailId = normEm ? emailOwnerId.get(normEm) : undefined;
        if (overriddenPhoneId && overriddenPhoneId !== record.id) {
          combinedById.delete(overriddenPhoneId);
        }
        if (overriddenEmailId && overriddenEmailId !== record.id) {
          combinedById.delete(overriddenEmailId);
        }
        combinedById.set(record.id, record);
      }
    }

    return Array.from(combinedById.values());
  }

  public getContactByPhone(phone: string): ContactRecord | null {
    if (!phone) return null;
    const norm = normalizePhone(phone);
    if (!norm || norm.length < 7) return null;

    const custom = this.customContacts.get(`phone_${norm}`);
    if (custom) return custom;

    for (const [key, record] of this.customContacts.entries()) {
      if (isIndexKey(key)) continue;
      if (
        normalizePhone(record.phone) === norm ||
        (record.mobilePhone && normalizePhone(record.mobilePhone) === norm) ||
        (record.homePhone && normalizePhone(record.homePhone) === norm) ||
        (record.workPhone && normalizePhone(record.workPhone) === norm) ||
        (record.additionalPhones &&
          record.additionalPhones.some((ap) => normalizePhone(ap.number) === norm))
      ) {
        return record;
      }
    }

    const sample = SAMPLE_PASSENGER_PROFILES.find((s) => normalizePhone(s.phone) === norm);
    if (sample) {
      return sampleProfileToContactRecord(sample);
    }

    return null;
  }

  public getContactByEmail(email: string): ContactRecord | null {
    const normEmail = normalizeEmail(email);
    if (!normEmail) return null;

    const direct = this.customContacts.get(`email_${normEmail}`);
    if (direct) return direct;

    for (const [key, record] of this.customContacts.entries()) {
      if (isIndexKey(key)) continue;
      if (
        normalizeEmail(record.email) === normEmail ||
        normalizeEmail(record.secondaryEmail) === normEmail
      ) {
        return record;
      }
    }

    const sample = SAMPLE_PASSENGER_PROFILES.find((s) => normalizeEmail(s.email) === normEmail);
    if (sample) {
      return sampleProfileToContactRecord(sample);
    }

    return null;
  }

  public getContactById(id: string): ContactRecord | null {
    if (!id) return null;
    const custom = this.customContacts.get(id);
    if (custom) return custom;

    const all = this.getAllContacts();
    return all.find((c) => c.id === id) || null;
  }

  public saveContact(
    profile: Partial<ContactRecord> & { phone?: string; email?: string; name: string }
  ): ContactRecord {
    const cleanPhoneInput = (profile.phone || '').trim();
    const cleanEmailInput = normalizeEmail(profile.email);
    const normPhone = normalizePhone(cleanPhoneInput);

    const existingById = profile.id ? this.getContactById(profile.id) : null;
    const existingByPhone = cleanPhoneInput ? this.getContactByPhone(cleanPhoneInput) : null;
    const existingByEmail = cleanEmailInput ? this.getContactByEmail(cleanEmailInput) : null;

    // Prefer stable ID match -> phone match -> email match; merge if phone & email hit two separate records
    const primaryExisting = existingById || existingByPhone || existingByEmail;
    const secondaryExisting =
      existingByPhone && existingByEmail && existingByPhone.id !== existingByEmail.id
        ? primaryExisting?.id === existingByPhone.id
          ? existingByEmail
          : existingByPhone
        : null;

    if (secondaryExisting) {
      this.removeContactIndexes(secondaryExisting);
    }

    const mergedExisting: Partial<ContactRecord> = {
      ...(secondaryExisting || {}),
      ...(primaryExisting || {}),
    };

    const id =
      (primaryExisting?.id && !primaryExisting.id.startsWith('temp_')
        ? primaryExisting.id
        : undefined) ||
      (profile.id && !profile.id.startsWith('temp_') ? profile.id : undefined) ||
      (normPhone
        ? `contact_${normPhone}`
        : cleanEmailInput
        ? `contact_${sanitizeThreadIdPart(cleanEmailInput)}`
        : `contact_${Date.now()}`);

    const resolvedName = (
      profile.name ||
      mergedExisting.name ||
      (cleanPhoneInput ? formatDisplayPhone(cleanPhoneInput) : cleanEmailInput) ||
      'Customer'
    ).trim();
    const nameParts = resolvedName.split(/\s+/);
    const firstName =
      profile.firstName ||
      mergedExisting.firstName ||
      (nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0]);
    const lastName =
      profile.lastName ||
      mergedExisting.lastName ||
      (nameParts.length > 1 ? nameParts.slice(-1)[0] : '');

    const primaryPhoneValue = cleanPhoneInput || mergedExisting.phone || '';
    const additionalPhones = [...(profile.additionalPhones || mergedExisting.additionalPhones || [])];
    if (
      secondaryExisting?.phone &&
      primaryPhoneValue &&
      normalizePhone(secondaryExisting.phone) !== normalizePhone(primaryPhoneValue) &&
      !additionalPhones.some(
        (ap) => normalizePhone(ap.number) === normalizePhone(secondaryExisting.phone)
      )
    ) {
      additionalPhones.push({
        id: `phone_merged_${Date.now()}`,
        type: 'other',
        number: secondaryExisting.phone,
      });
    }

    const primaryEmailValue = cleanEmailInput || normalizeEmail(mergedExisting.email) || '';
    const secondaryEmailCandidate =
      normalizeEmail(profile.secondaryEmail) ||
      normalizeEmail(mergedExisting.secondaryEmail) ||
      (secondaryExisting?.email &&
      normalizeEmail(secondaryExisting.email) !== primaryEmailValue
        ? normalizeEmail(secondaryExisting.email)
        : '');

    const normalizedDriverPrefs = normalizeClientDriverPreferences(
      profile.preferredDriverIds !== undefined ? profile.preferredDriverIds : mergedExisting.preferredDriverIds,
      profile.excludedDriverIds !== undefined ? profile.excludedDriverIds : mergedExisting.excludedDriverIds
    );

    const record: ContactRecord = {
      ...(mergedExisting as ContactRecord),
      ...profile,
      id,
      name: resolvedName,
      firstName,
      lastName,
      phone: primaryPhoneValue,
      primaryPhoneType: profile.primaryPhoneType || mergedExisting.primaryPhoneType || 'mobile',
      additionalPhones,
      mobilePhone:
        profile.mobilePhone?.trim() || mergedExisting.mobilePhone || primaryPhoneValue,
      homePhone: profile.homePhone?.trim() || mergedExisting.homePhone || '',
      workPhone: profile.workPhone?.trim() || mergedExisting.workPhone || '',
      workExtension: profile.workExtension?.trim() || mergedExisting.workExtension || '',
      email: primaryEmailValue,
      secondaryEmail:
        secondaryEmailCandidate && secondaryEmailCandidate !== primaryEmailValue
          ? secondaryEmailCandidate
          : '',
      corporateAccountId:
        profile.corporateAccountId !== undefined
          ? profile.corporateAccountId
          : mergedExisting.corporateAccountId,
      corporateAccountNumber:
        profile.corporateAccountNumber !== undefined
          ? profile.corporateAccountNumber
          : mergedExisting.corporateAccountNumber,
      corporateAccountName:
        profile.corporateAccountName !== undefined
          ? profile.corporateAccountName
          : mergedExisting.corporateAccountName,
      billingDepartment:
        profile.billingDepartment !== undefined
          ? profile.billingDepartment
          : mergedExisting.billingDepartment,
      defaultPoNumber:
        profile.defaultPoNumber !== undefined
          ? profile.defaultPoNumber
          : mergedExisting.defaultPoNumber,
      isVip: profile.isVip ?? mergedExisting.isVip ?? false,
      vipReason:
        profile.vipReason !== undefined ? profile.vipReason : mergedExisting.vipReason || '',
      preferredVehicleTier:
        profile.preferredVehicleTier || mergedExisting.preferredVehicleTier || 'standard',
      preferredDriverIds: normalizedDriverPrefs.preferredDriverIds,
      excludedDriverIds: normalizedDriverPrefs.excludedDriverIds,
      homeAddress:
        profile.homeAddress !== undefined ? profile.homeAddress : mergedExisting.homeAddress || '',
      workAddress:
        profile.workAddress !== undefined ? profile.workAddress : mergedExisting.workAddress || '',
      accessibilityNeeds: profile.accessibilityNeeds || mergedExisting.accessibilityNeeds || {},
      smsNotifications: profile.smsNotifications ?? mergedExisting.smsNotifications ?? true,
      notes: profile.notes !== undefined ? profile.notes : mergedExisting.notes || '',
      internalDispatcherNotes:
        profile.internalDispatcherNotes || mergedExisting.internalDispatcherNotes || '',
      customerScore: profile.customerScore ?? mergedExisting.customerScore ?? 90,
      tripCount: profile.tripCount ?? mergedExisting.tripCount ?? 1,
      totalSpend: profile.totalSpend ?? mergedExisting.totalSpend ?? 0,
      updatedAt: Date.now(),
    };

    this.indexContactRecord(record);
    this.saveToStorage();

    try {
      const bus = getWorkspaceBus();
      bus.publish('CONTACT_UPDATED', { contact: record });
    } catch {}

    this.notifyListeners({ action: 'saved', contact: record });
    return record;
  }

  public upsertContact(
    profile: Partial<ContactRecord> & { phone?: string; email?: string; name: string }
  ): ContactRecord {
    return this.saveContact(profile);
  }

  /**
   * Resolves a customer or operator identity across phone (E.164) and email (lowercase)
   * so calls/texts from `+13145550199` and emails from `amanda.vance@bayer.com` map to
   * the exact same `ContactRecord` and canonical `threadId`.
   */
  public resolveUnifiedContact(query: UnifiedContactQuery): UnifiedContactResolution {
    const phoneE164 = normalizePhoneE164(query.phone);
    const emailNorm = normalizeEmail(query.email);
    const cleanName = (query.name || '').trim();

    const byPhone = phoneE164 ? this.getContactByPhone(phoneE164) : null;
    const byEmail = emailNorm ? this.getContactByEmail(emailNorm) : null;

    let resolvedContact: ContactRecord | null = byPhone || byEmail;

    // If both phone and email are supplied and either bridge two records or enrich an existing one, link them
    const shouldAutoLink = query.autoLink ?? Boolean(phoneE164 && emailNorm);
    if (shouldAutoLink && phoneE164 && emailNorm) {
      const needsLink =
        !resolvedContact ||
        (byPhone && byEmail && byPhone.id !== byEmail.id) ||
        !collectContactPhonesE164(resolvedContact).some(
          (p) => normalizePhone(p) === normalizePhone(phoneE164)
        ) ||
        !collectContactEmailsNormalized(resolvedContact).includes(emailNorm);

      if (needsLink) {
        resolvedContact = this.saveContact({
          id: resolvedContact?.id,
          name:
            resolvedContact?.name ||
            (cleanName && !cleanName.startsWith('+') ? cleanName : formatDisplayPhone(phoneE164)),
          phone: resolvedContact?.phone || phoneE164,
          email: normalizeEmail(resolvedContact?.email) || emailNorm,
          secondaryEmail:
            resolvedContact?.email && normalizeEmail(resolvedContact.email) !== emailNorm
              ? emailNorm
              : resolvedContact?.secondaryEmail,
        });
      }
    }

    const phones = collectContactPhonesE164(resolvedContact, [phoneE164]);
    const emails = collectContactEmailsNormalized(resolvedContact, [emailNorm]);
    const primaryPhone = phones[0] || phoneE164 || undefined;
    const primaryEmail = emails[0] || emailNorm || undefined;

    const corporateAccountId = resolvedContact?.corporateAccountId;
    const corporateAccountName = resolvedContact?.corporateAccountName;

    const contactType: CommsContactType =
      query.contactType === 'driver'
        ? 'driver'
        : corporateAccountId
        ? 'corporate'
        : query.contactType || (resolvedContact ? 'passenger' : 'passenger');

    const contactName =
      resolvedContact?.name ||
      (cleanName && cleanName !== 'Caller' && cleanName !== 'Passenger' ? cleanName : '') ||
      (primaryPhone ? formatDisplayPhone(primaryPhone) : '') ||
      primaryEmail ||
      'Unknown Contact';

    const threadId = resolveCanonicalThreadId({
      contact: resolvedContact,
      contactId: resolvedContact?.id,
      phone: primaryPhone,
      email: primaryEmail,
    });

    return {
      contact: resolvedContact,
      contactId: resolvedContact?.id,
      contactName,
      contactType,
      primaryPhone,
      phones,
      primaryEmail,
      emails,
      corporateAccountId,
      corporateAccountName,
      threadId,
    };
  }

  /** Persists an already-built record (index + storage + CONTACT_UPDATED + listeners). */
  private commitContactRecord(record: ContactRecord): ContactRecord {
    const next: ContactRecord = { ...record, updatedAt: Date.now() };
    this.indexContactRecord(next);
    this.saveToStorage();
    try {
      getWorkspaceBus().publish('CONTACT_UPDATED', { contact: next });
    } catch {}
    this.notifyListeners({ action: 'saved', contact: next });
    return next;
  }

  /**
   * Saves (or updates) a client's saved place. Creates the `ContactRecord` when the caller only
   * existed in `trips`, dedupes by `id` or normalized address, and syncs `homeAddress` /
   * `workAddress` for `'home'` / `'work'` categories.
   */
  public saveContactPlace(
    identity: { contactId?: string; phone?: string; email?: string; name?: string },
    place: Omit<ContactSavedPlace, 'id'> & { id?: string }
  ): ContactRecord {
    const address = String(place.address || '').trim();
    const existing =
      (identity.contactId ? this.getContactById(identity.contactId) : null) ||
      (identity.phone ? this.getContactByPhone(identity.phone) : null) ||
      (identity.email ? this.getContactByEmail(identity.email) : null);

    const base: ContactRecord =
      existing ||
      this.saveContact({
        name: (identity.name || '').trim() || identity.phone || identity.email || 'Customer',
        phone: identity.phone || '',
        email: identity.email || '',
      });

    if (!address) return base;

    const addrKey = normalizePlaceAddressKey(address);
    const list = [...(base.savedPlaces || [])];
    const idx = list.findIndex(
      (p) => (place.id && p.id === place.id) || (addrKey && normalizePlaceAddressKey(p.address) === addrKey)
    );
    const defaultLabel =
      place.category === 'other' ? 'Place' : place.category.charAt(0).toUpperCase() + place.category.slice(1);
    const saved: ContactSavedPlace = {
      id: place.id || (idx >= 0 ? list[idx].id : `place_${Date.now().toString(36)}_${list.length}`),
      label: String(place.label || '').trim() || defaultLabel,
      category: place.category,
      address,
      ...(place.coordinates ? { coordinates: { ...place.coordinates } } : {}),
      ...(place.notes ? { notes: place.notes } : {}),
    };
    if (idx >= 0) list[idx] = saved;
    else list.push(saved);

    return this.commitContactRecord({
      ...base,
      savedPlaces: list,
      homeAddress: saved.category === 'home' ? address : base.homeAddress,
      workAddress: saved.category === 'work' ? address : base.workAddress,
    });
  }

  public removeContactPlace(contactId: string, placeId: string): ContactRecord | null {
    const existing = this.getContactById(contactId);
    const removed = existing?.savedPlaces?.find((p) => p.id === placeId);
    if (!existing || !removed) return null;
    const key = normalizePlaceAddressKey(removed.address);
    const remaining = (existing.savedPlaces || []).filter((p) => p.id !== placeId);
    return this.commitContactRecord({
      ...existing,
      savedPlaces: remaining,
      homeAddress:
        removed.category === 'home' && normalizePlaceAddressKey(existing.homeAddress) === key
          ? remaining.find((p) => p.category === 'home')?.address || ''
          : existing.homeAddress,
      workAddress:
        removed.category === 'work' && normalizePlaceAddressKey(existing.workAddress) === key
          ? remaining.find((p) => p.category === 'work')?.address || ''
          : existing.workAddress,
    });
  }

  public deleteContact(id: string): boolean {
    const existing = this.getContactById(id);
    if (!existing) return false;

    this.removeContactIndexes(existing);
    this.saveToStorage();
    this.notifyListeners({ action: 'deleted', contact: existing });
    return true;
  }
}

let contactServiceInstance: ContactService | null = null;
export function getContactService(): ContactService {
  if (!contactServiceInstance) {
    contactServiceInstance = new ContactService();
  }
  return contactServiceInstance;
}

export function resolveUnifiedContact(query: UnifiedContactQuery): UnifiedContactResolution {
  return getContactService().resolveUnifiedContact(query);
}
