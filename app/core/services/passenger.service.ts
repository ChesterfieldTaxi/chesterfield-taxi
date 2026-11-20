/**
 * Passenger Domain Service
 *
 * Manages authenticated Customer Account state synced with Firestore `/users/{uid}`,
 * Saved Places CRUD, communication preferences, real-time scoped trip history,
 * and active ride detection. Never leaks hardcoded demo personas to real users.
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import type { PassengerAccount, SavedPlace } from '../types/passenger';
import type { Trip, TripStatus } from '../types/trip';
import { getBookingService } from './booking';
import { getFirestoreDb, isFirebaseConfigured } from './firebase';
import { sanitizePayload } from './firestore-sanitizer';

const PASSENGER_STORAGE_PREFIX = 'chesterfield_passenger_account_v2_';
const LEGACY_PASSENGER_STORAGE_KEY = 'chesterfield_passenger_account_v1';

export const DEFAULT_PASSENGER_ACCOUNT: PassengerAccount = {
  id: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  passengerNotes: '',
  preferredVehicleTier: 'standard',
  communicationPreferences: {
    smsUpdates: true,
    emailReceipts: true,
    phoneCalls: true,
  },
  savedPlaces: [],
  recentSearches: [],
};

export const SAMPLE_PASSENGER_PAST_TRIPS: Trip[] = [];

function createEmptyAccountForUser(user?: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  phone?: string | null;
} | null): PassengerAccount {
  if (!user?.uid) {
    return { ...DEFAULT_PASSENGER_ACCOUNT, savedPlaces: [], recentSearches: [] };
  }
  const rawName = (user.displayName || '').trim();
  const parts = rawName ? rawName.split(/\s+/) : [];
  const fallbackFirst =
    parts[0] || (user.email ? user.email.split('@')[0] : 'Passenger');
  const fallbackLast = parts.slice(1).join(' ');

  return {
    ...DEFAULT_PASSENGER_ACCOUNT,
    id: user.uid,
    firstName: fallbackFirst,
    lastName: fallbackLast,
    email: (user.email || '').trim(),
    phone: (user.phone || '').trim(),
    savedPlaces: [],
    recentSearches: [],
  };
}

export class PassengerService {
  private boundUid: string = '';
  private account: PassengerAccount = createEmptyAccountForUser(null);
  private listeners = new Set<(account: PassengerAccount) => void>();
  private firestoreUnsub: (() => void) | null = null;

  constructor() {
    // Clean up legacy shared Sarah Jenkins cache key so stale demo PII never resurfaces
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(LEGACY_PASSENGER_STORAGE_KEY);
      } catch {}
    }
  }

  /**
   * Binds PassengerService to the signed-in Firebase Auth user and starts live
   * synchronization with Firestore `/users/{uid}`.
   */
  public bindToAuthUser(
    user: {
      uid: string;
      email?: string | null;
      displayName?: string | null;
      phone?: string | null;
    } | null
  ): void {
    const nextUid = user?.uid || '';
    if (nextUid === this.boundUid && nextUid) {
      return;
    }

    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }

    this.boundUid = nextUid;

    if (!nextUid || !user) {
      this.account = createEmptyAccountForUser(null);
      this.notify();
      return;
    }

    // Hydrate UID-scoped cache immediately, then live-sync from Firestore `/users/{uid}`
    const baseAccount = createEmptyAccountForUser(user);
    const cached = this.loadUidCache(nextUid);
    this.account = cached
      ? {
          ...baseAccount,
          ...cached,
          id: nextUid,
          email: cached.email || baseAccount.email,
          communicationPreferences: {
            ...baseAccount.communicationPreferences,
            ...(cached.communicationPreferences || {}),
          },
          savedPlaces: Array.isArray(cached.savedPlaces) ? cached.savedPlaces : [],
        }
      : baseAccount;
    this.notify();

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const userRef = doc(db, 'users', nextUid);
        this.firestoreUnsub = onSnapshot(
          userRef,
          (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Record<string, any>;
            const rawDisplay = String(data.displayName || '').trim();
            const displayParts = rawDisplay ? rawDisplay.split(/\s+/) : [];

            const hydrated: PassengerAccount = {
              ...baseAccount,
              id: nextUid,
              firstName: data.firstName ?? displayParts[0] ?? baseAccount.firstName,
              lastName: data.lastName ?? displayParts.slice(1).join(' ') ?? baseAccount.lastName,
              email: data.email || baseAccount.email,
              phone: data.phone || baseAccount.phone,
              homePhone: data.homePhone,
              workPhone: data.workPhone,
              primaryMobilePhone: data.primaryMobilePhone,
              alternatePhones: Array.isArray(data.alternatePhones) ? data.alternatePhones : undefined,
              passengerNotes: typeof data.passengerNotes === 'string' ? data.passengerNotes : '',
              preferredVehicleTier: data.preferredVehicleTier || 'standard',
              communicationPreferences: {
                smsUpdates: data.communicationPreferences?.smsUpdates ?? true,
                emailReceipts: data.communicationPreferences?.emailReceipts ?? true,
                phoneCalls: data.communicationPreferences?.phoneCalls ?? true,
              },
              savedPlaces: Array.isArray(data.savedPlaces) ? data.savedPlaces : [],
              recentSearches: Array.isArray(data.recentSearches) ? data.recentSearches : [],
              customerScore: data.customerScore,
              totalTrips: data.totalTrips,
              isArchived: Boolean(data.isArchived),
              isBlacklisted: Boolean(data.isBlacklisted),
            };

            this.account = hydrated;
            this.persist();
            this.notify();
          },
          (err) => {
            console.warn('[PassengerService] Firestore user snapshot warning:', err);
          }
        );
      } catch (err) {
        console.warn('[PassengerService] Could not subscribe to /users/' + nextUid, err);
      }
    }
  }

  /**
   * Clears all passenger & cached trip data from browser storage on sign-out
   * (prevents shared-device PII leakage).
   */
  public clearLocalSession(): void {
    const prevUid = this.boundUid;
    this.bindToAuthUser(null);
    if (typeof window !== 'undefined') {
      try {
        if (prevUid) {
          localStorage.removeItem(PASSENGER_STORAGE_PREFIX + prevUid);
        }
        localStorage.removeItem(LEGACY_PASSENGER_STORAGE_KEY);
        localStorage.removeItem('chesterfield_taxi_mock_trips');
      } catch {}
    }
  }

  public async getAccount(): Promise<PassengerAccount> {
    if (this.boundUid && isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'users', this.boundUid));
        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;
          this.account = {
            ...this.account,
            id: this.boundUid,
            firstName: data.firstName ?? this.account.firstName,
            lastName: data.lastName ?? this.account.lastName,
            phone: data.phone ?? this.account.phone,
            email: data.email ?? this.account.email,
            passengerNotes: data.passengerNotes ?? this.account.passengerNotes,
            preferredVehicleTier: data.preferredVehicleTier ?? this.account.preferredVehicleTier,
            communicationPreferences: {
              ...this.account.communicationPreferences,
              ...(data.communicationPreferences || {}),
            },
            savedPlaces: Array.isArray(data.savedPlaces) ? data.savedPlaces : this.account.savedPlaces,
          };
          this.persist();
        }
      } catch {}
    }
    return { ...this.account };
  }

  public getCachedAccount(): PassengerAccount {
    return { ...this.account };
  }

  public async updateAccount(updates: Partial<PassengerAccount>): Promise<PassengerAccount> {
    this.account = {
      ...this.account,
      ...updates,
      id: this.boundUid || this.account.id,
      communicationPreferences: {
        ...this.account.communicationPreferences,
        ...(updates.communicationPreferences || {}),
      },
    };
    this.persist();
    this.notify();
    await this.persistProfileToFirestore();
    return { ...this.account };
  }

  public async addSavedPlace(placeInput: Omit<SavedPlace, 'id'>): Promise<SavedPlace> {
    const newPlace: SavedPlace = {
      ...placeInput,
      id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    this.account = {
      ...this.account,
      savedPlaces: [newPlace, ...this.account.savedPlaces],
    };

    this.persist();
    this.notify();
    await this.persistProfileToFirestore();
    return newPlace;
  }

  public async updateSavedPlace(id: string, updates: Partial<SavedPlace>): Promise<SavedPlace> {
    let updatedTarget: SavedPlace | null = null;

    this.account = {
      ...this.account,
      savedPlaces: this.account.savedPlaces.map((sp) => {
        if (sp.id === id) {
          updatedTarget = { ...sp, ...updates };
          return updatedTarget;
        }
        return sp;
      }),
    };

    this.persist();
    this.notify();
    await this.persistProfileToFirestore();

    if (!updatedTarget) {
      throw new Error(`Saved place #${id} not found.`);
    }

    return updatedTarget;
  }

  public async deleteSavedPlace(id: string): Promise<void> {
    this.account = {
      ...this.account,
      savedPlaces: this.account.savedPlaces.filter((sp) => sp.id !== id),
    };
    this.persist();
    this.notify();
    await this.persistProfileToFirestore();
  }

  public subscribeToAccount(callback: (account: PassengerAccount) => void): () => void {
    this.listeners.add(callback);
    callback({ ...this.account });
    return () => {
      this.listeners.delete(callback);
    };
  }

  private matchesCurrentPassenger(trip: Trip): boolean {
    const uid = this.boundUid || this.account.id;
    const normAccountPhone = normalizePhone(this.account.phone);
    const accountEmail = (this.account.email || '').trim().toLowerCase();

    if (uid && (trip.customerId === uid || trip.userId === uid)) return true;
    if (accountEmail && trip.passenger?.email?.trim().toLowerCase() === accountEmail) return true;
    if (normAccountPhone && normAccountPhone.length >= 10) {
      const tripPhone = normalizePhone(trip.passenger?.phone);
      if (tripPhone && tripPhone === normAccountPhone) return true;
    }
    return false;
  }

  /**
   * Real-time scoped subscription to ALL trips belonging to the signed-in passenger.
   * Satisfies strict Firestore `allow list` rules (queries by customerId, userId, passenger.email).
   */
  public subscribeToPassengerTrips(callback: (trips: Trip[]) => void): () => void {
    const bookingService = getBookingService();
    const uid = this.boundUid || this.account.id;
    const email = this.account.email;
    const phone = this.account.phone;

    const sortNewestFirst = (list: Trip[]) =>
      [...list].sort((a, b) => {
        const timeA = new Date(a.scheduledPickupTime || a.createdAt).getTime();
        const timeB = new Date(b.scheduledPickupTime || b.createdAt).getTime();
        return timeB - timeA;
      });

    if (bookingService.subscribeToPassengerTrips) {
      return bookingService.subscribeToPassengerTrips({ uid, email, phone }, (remoteTrips) => {
        callback(sortNewestFirst(remoteTrips));
      });
    }

    if (bookingService.subscribeToAllTrips) {
      return bookingService.subscribeToAllTrips((all) => {
        callback(sortNewestFirst(all.filter((t) => this.matchesCurrentPassenger(t))));
      });
    }

    this.getPassengerTrips().then(callback).catch(() => callback([]));
    return () => {};
  }

  /**
   * One-shot fetch of trips for the current passenger.
   */
  public async getPassengerTrips(): Promise<Trip[]> {
    return new Promise((resolve) => {
      let settled = false;
      const unsub = this.subscribeToPassengerTrips((list) => {
        if (!settled) {
          settled = true;
          resolve(list);
          setTimeout(() => unsub(), 0);
        }
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub();
          resolve([]);
        }
      }, 2500);
    });
  }

  public async getTripsHistory(): Promise<Trip[]> {
    return this.getPassengerTrips();
  }

  /**
   * Subscribes to live scoped passenger trips and emits the most urgent active trip.
   */
  public subscribeToActiveTrip(callback: (activeTrip: Trip | null) => void): () => void {
    const activeStatuses: TripStatus[] = [
      'in_progress',
      'arrived',
      'en_route',
      'accepted',
      'assigned',
      'CONFIRMED',
      'confirmed',
      'UNCONFIRMED',
      'unconfirmed',
      'pending',
    ];

    return this.subscribeToPassengerTrips((trips) => {
      const candidates = trips.filter((t) => activeStatuses.includes(t.status));
      candidates.sort(
        (a, b) => activeStatuses.indexOf(a.status) - activeStatuses.indexOf(b.status)
      );
      callback(candidates[0] || null);
    });
  }

  private async persistProfileToFirestore(): Promise<void> {
    if (!this.boundUid || !isFirebaseConfigured()) return;
    try {
      const db = getFirestoreDb();
      const userRef = doc(db, 'users', this.boundUid);
      // Only write owner-allowed profile fields (NEVER role/roles/status/governance keys!)
      const safeProfilePatch = sanitizePayload({
        firstName: this.account.firstName,
        lastName: this.account.lastName,
        displayName: `${this.account.firstName} ${this.account.lastName}`.trim() || undefined,
        phone: this.account.phone,
        email: this.account.email,
        homePhone: this.account.homePhone,
        workPhone: this.account.workPhone,
        primaryMobilePhone: this.account.primaryMobilePhone,
        alternatePhones: this.account.alternatePhones,
        passengerNotes: this.account.passengerNotes,
        preferredVehicleTier: this.account.preferredVehicleTier,
        communicationPreferences: this.account.communicationPreferences,
        savedPlaces: this.account.savedPlaces,
        recentSearches: this.account.recentSearches,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(userRef, safeProfilePatch, { merge: true });
    } catch (err) {
      console.warn('[PassengerService] Could not sync profile to Firestore /users/' + this.boundUid, err);
    }
  }

  private loadUidCache(uid: string): Partial<PassengerAccount> | null {
    if (typeof window === 'undefined' || !uid) return null;
    try {
      const raw = localStorage.getItem(PASSENGER_STORAGE_PREFIX + uid);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private persist() {
    if (typeof window !== 'undefined' && this.boundUid) {
      try {
        localStorage.setItem(PASSENGER_STORAGE_PREFIX + this.boundUid, JSON.stringify(this.account));
      } catch (err) {
        console.warn('[PassengerService] Could not persist passenger account cache:', err);
      }
    }
  }

  private notify() {
    const snapshot = { ...this.account };
    this.listeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[PassengerService] Listener error:', err);
      }
    });
  }
}

let instance: PassengerService | null = null;
export function getPassengerService(): PassengerService {
  if (!instance) {
    instance = new PassengerService();
  }
  return instance;
}

/**
 * Normalizes phone numbers to 10 standard digits for cross-system comparisons.
 */
export function normalizePhone(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

/**
 * Resolves the preferred mobile number for sending SMS dispatch confirmations and tracking links.
 */
export function resolvePrimarySmsPhone(passenger: PassengerAccount): string {
  if (passenger.primaryMobilePhone) return passenger.primaryMobilePhone;
  const primaryAlt = passenger.alternatePhones?.find((p) => p.isPrimarySms || p.type === 'mobile');
  if (primaryAlt) return primaryAlt.number;
  return passenger.phone;
}

/**
 * Matches an incoming caller phone number against all known customer phone numbers.
 */
export function matchPassengerByPhone(
  searchPhone: string,
  passengerDirectory: PassengerAccount[] = []
): { passenger: PassengerAccount; matchedType: 'mobile' | 'home' | 'work' | 'primary' } | null {
  const searchNorm = normalizePhone(searchPhone);
  if (!searchNorm || passengerDirectory.length === 0) return null;

  for (const account of passengerDirectory) {
    if (normalizePhone(account.phone) === searchNorm) {
      return { passenger: account, matchedType: 'primary' };
    }
    if (account.homePhone && normalizePhone(account.homePhone) === searchNorm) {
      return { passenger: account, matchedType: 'home' };
    }
    if (account.workPhone && normalizePhone(account.workPhone) === searchNorm) {
      return { passenger: account, matchedType: 'work' };
    }
    if (account.primaryMobilePhone && normalizePhone(account.primaryMobilePhone) === searchNorm) {
      return { passenger: account, matchedType: 'mobile' };
    }
    if (account.alternatePhones) {
      const match = account.alternatePhones.find((p) => normalizePhone(p.number) === searchNorm);
      if (match) {
        return { passenger: account, matchedType: match.type as any };
      }
    }
  }

  return null;
}
