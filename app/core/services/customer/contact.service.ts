/**
 * Contact Service
 *
 * Centralized contact management for Chesterfield Taxi.
 * Unifies passenger profiles across Dispatch (CommsHub), Admin Directory, and Booking Engine.
 * Persists custom updates in localStorage with cross-tab synchronization via WorkspaceBus.
 */

import { getWorkspaceBus } from '../workspace-bus.service';
import { SAMPLE_PASSENGER_PROFILES } from '../booking/passenger-lookup.service';

export type PhoneType = 'mobile' | 'home' | 'work' | 'other';

export interface AdditionalPhone {
  id: string;
  type: PhoneType;
  number: string;
  extension?: string;
  label?: string;
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
  homeAddress?: string;
  workAddress?: string;
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

const STORAGE_KEY = 'ct_contacts_database';

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

class ContactService {
  private customContacts: Map<string, ContactRecord> = new Map();
  private listeners: Set<(event: { action: 'saved' | 'deleted'; contact: ContactRecord }) => void> = new Set();

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
          this.customContacts.set(contact.id, contact);
          const norm = normalizePhone(contact.phone);
          if (norm) this.customContacts.set(`phone_${norm}`, contact);
          this.notifyListeners({ action: 'saved', contact });
        }
      });
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
            this.customContacts.set(item.id, item);
            const norm = normalizePhone(item.phone);
            if (norm) {
              this.customContacts.set(`phone_${norm}`, item);
            }
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
      // Deduplicate unique profiles by id
      const uniqueList: ContactRecord[] = [];
      const seenIds = new Set<string>();
      for (const [key, record] of this.customContacts.entries()) {
        if (!key.startsWith('phone_') && !seenIds.has(record.id)) {
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

  public subscribe(listener: (event: { action: 'saved' | 'deleted'; contact: ContactRecord }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getAllContacts(): ContactRecord[] {
    const combined = new Map<string, ContactRecord>();

    // 1. Baseline sample passenger profiles
    for (const sample of SAMPLE_PASSENGER_PROFILES) {
      const norm = normalizePhone(sample.phone);
      combined.set(norm, {
        id: sample.id,
        name: `${sample.firstName} ${sample.lastName}`.trim(),
        firstName: sample.firstName,
        lastName: sample.lastName,
        phone: sample.phone,
        mobilePhone: sample.phone,
        email: sample.email,
        corporateAccountId: sample.corporateAccountId,
        corporateAccountName: sample.corporateAccountId ? sample.corporateAccountId.replace('CORP-', '').replace('-', ' ') : undefined,
        isVip: sample.vipStatus ?? false,
        preferredVehicleTier: sample.preferredVehicleTier,
        notes: sample.notes,
        tripCount: sample.totalTrips || 1,
        totalSpend: (sample.totalTrips || 1) * 45,
        customerScore: sample.vipStatus ? 95 : 85,
        updatedAt: 0,
      });
    }

    // 2. Custom created or edited contacts override baseline
    const seenIds = new Set<string>();
    for (const [key, record] of this.customContacts.entries()) {
      if (!key.startsWith('phone_') && !seenIds.has(record.id)) {
        seenIds.add(record.id);
        const norm = normalizePhone(record.phone);
        if (norm) {
          combined.set(norm, record);
        } else {
          combined.set(record.id, record);
        }
      }
    }

    return Array.from(combined.values());
  }

  public getContactByPhone(phone: string): ContactRecord | null {
    if (!phone) return null;
    const norm = normalizePhone(phone);
    if (!norm) return null;

    // Direct lookup in custom contacts
    const custom = this.customContacts.get(`phone_${norm}`);
    if (custom) return custom;

    // Check all custom contacts for alternate phone fields and additional phones
    for (const record of this.customContacts.values()) {
      if (
        normalizePhone(record.phone) === norm ||
        (record.mobilePhone && normalizePhone(record.mobilePhone) === norm) ||
        (record.homePhone && normalizePhone(record.homePhone) === norm) ||
        (record.workPhone && normalizePhone(record.workPhone) === norm) ||
        (record.additionalPhones && record.additionalPhones.some((ap) => normalizePhone(ap.number) === norm))
      ) {
        return record;
      }
    }

    // Check sample profiles
    const sample = SAMPLE_PASSENGER_PROFILES.find(
      (s) => normalizePhone(s.phone) === norm
    );
    if (sample) {
      return {
        id: sample.id,
        name: `${sample.firstName} ${sample.lastName}`.trim(),
        firstName: sample.firstName,
        lastName: sample.lastName,
        phone: sample.phone,
        mobilePhone: sample.phone,
        email: sample.email,
        corporateAccountId: sample.corporateAccountId,
        corporateAccountName: sample.corporateAccountId ? sample.corporateAccountId.replace('CORP-', '').replace('-', ' ') : undefined,
        isVip: sample.vipStatus ?? false,
        preferredVehicleTier: sample.preferredVehicleTier,
        notes: sample.notes,
        tripCount: sample.totalTrips || 1,
        totalSpend: (sample.totalTrips || 1) * 45,
        customerScore: sample.vipStatus ? 95 : 85,
        updatedAt: 0,
      };
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

  public saveContact(profile: Partial<ContactRecord> & { phone: string; name: string }): ContactRecord {
    const norm = normalizePhone(profile.phone);
    const existing = (profile.id ? this.getContactById(profile.id) : null) || this.getContactByPhone(profile.phone);

    const id = existing?.id || profile.id || `contact_${norm || Date.now()}`;
    const nameParts = (profile.name || existing?.name || '').trim().split(' ');
    const firstName = profile.firstName || (nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0]);
    const lastName = profile.lastName || (nameParts.length > 1 ? nameParts.slice(-1)[0] : '');

    const record: ContactRecord = {
      ...(existing || {}),
      ...profile,
      id,
      name: profile.name.trim(),
      firstName,
      lastName,
      phone: profile.phone.trim(),
      primaryPhoneType: profile.primaryPhoneType || existing?.primaryPhoneType || 'mobile',
      additionalPhones: profile.additionalPhones || existing?.additionalPhones || [],
      mobilePhone: profile.mobilePhone?.trim() || existing?.mobilePhone || profile.phone.trim(),
      homePhone: profile.homePhone?.trim() || existing?.homePhone || '',
      workPhone: profile.workPhone?.trim() || existing?.workPhone || '',
      workExtension: profile.workExtension?.trim() || existing?.workExtension || '',
      email: profile.email?.trim() || existing?.email || '',
      secondaryEmail: profile.secondaryEmail?.trim() || existing?.secondaryEmail || '',
      corporateAccountId: profile.corporateAccountId || existing?.corporateAccountId,
      corporateAccountNumber: profile.corporateAccountNumber || existing?.corporateAccountNumber,
      corporateAccountName: profile.corporateAccountName || existing?.corporateAccountName,
      billingDepartment: profile.billingDepartment || existing?.billingDepartment,
      defaultPoNumber: profile.defaultPoNumber || existing?.defaultPoNumber,
      isVip: profile.isVip ?? existing?.isVip ?? false,
      vipReason: profile.vipReason || existing?.vipReason || '',
      preferredVehicleTier: profile.preferredVehicleTier || existing?.preferredVehicleTier || 'standard',
      homeAddress: profile.homeAddress || existing?.homeAddress || '',
      workAddress: profile.workAddress || existing?.workAddress || '',
      accessibilityNeeds: profile.accessibilityNeeds || existing?.accessibilityNeeds || {},
      smsNotifications: profile.smsNotifications ?? existing?.smsNotifications ?? true,
      notes: profile.notes !== undefined ? profile.notes : existing?.notes || '',
      internalDispatcherNotes: profile.internalDispatcherNotes || existing?.internalDispatcherNotes || '',
      customerScore: profile.customerScore ?? existing?.customerScore ?? 90,
      tripCount: profile.tripCount ?? existing?.tripCount ?? 1,
      totalSpend: profile.totalSpend ?? existing?.totalSpend ?? 0,
      updatedAt: Date.now(),
    };

    this.customContacts.set(id, record);
    if (norm) {
      this.customContacts.set(`phone_${norm}`, record);
    }
    if (record.additionalPhones) {
      for (const ap of record.additionalPhones) {
        const apNorm = normalizePhone(ap.number);
        if (apNorm) {
          this.customContacts.set(`phone_${apNorm}`, record);
        }
      }
    }
    this.saveToStorage();

    // Broadcast across windows
    try {
      const bus = getWorkspaceBus();
      bus.publish('CONTACT_UPDATED', { contact: record });
    } catch {}

    this.notifyListeners({ action: 'saved', contact: record });
    return record;
  }

  public deleteContact(id: string): boolean {
    const existing = this.getContactById(id);
    if (!existing) return false;

    this.customContacts.delete(id);
    const norm = normalizePhone(existing.phone);
    if (norm) {
      this.customContacts.delete(`phone_${norm}`);
    }
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
