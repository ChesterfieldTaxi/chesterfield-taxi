/**
 * Operator Service
 * 
 * Manages administrative, dispatcher, and driver operator users.
 * Provides unified real-time synchronization between Admin Operators Tab,
 * Dispatch Console driver rosters, and booking engine driver assignment dropdowns.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getFirestore,
} from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import type { UserRole } from './auth/admin-auth.service';

/**
 * Standardizes driver username generation: firstname + lastname_initial + cabnumber (e.g. michaelj400)
 */
export function generateDriverUsername(firstName?: string, lastName?: string, cabNumber?: string): string {
  const fn = (firstName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const ln = (lastName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastInitial = ln.length > 0 ? ln.charAt(0) : '';
  const cab = (cabNumber || '').trim().replace(/[^0-9a-zA-Z]/g, '');
  return `${fn}${lastInitial}${cab}`;
}

/**
 * Formats a space-efficient driver option label prioritizing cab number: #cab, firstname (e.g. #400, Michael)
 */
export function formatDriverAssignmentLabel(driver: {
  name?: string;
  firstName?: string;
  lastName?: string;
  cabNumber?: string;
  assignedUnit?: string;
  vehicle?: string;
  zone?: string;
  status?: string;
  isBlacklisted?: boolean;
}): string {
  // Extract cab number
  let cab = driver.cabNumber;
  if (!cab && driver.assignedUnit) {
    const m = driver.assignedUnit.match(/#?(\d+)/);
    if (m) cab = m[1];
    else cab = driver.assignedUnit;
  }
  if (!cab && driver.vehicle) {
    const m = driver.vehicle.match(/#(\d+)/);
    if (m) cab = m[1];
  }

  // Extract first name
  let first = driver.firstName;
  if (!first && driver.name) {
    const parenMatch = driver.name.match(/\(([^)]+)\)/);
    if (parenMatch) {
      first = parenMatch[1].split(' ')[0];
    } else {
      first = driver.name.split(' ')[0];
    }
  }

  if (cab) {
    const cleanCab = cab.startsWith('#') ? cab : `#${cab}`;
    return first ? `${cleanCab}, ${first}` : cleanCab;
  }

  return first || driver.name || 'Driver';
}

export interface OperatorUser {
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  cabNumber?: string;
  role: UserRole;
  roles?: UserRole[];
  phone?: string;
  driverLicense?: string;
  assignedUnit?: string;
  status?: 'active' | 'suspended';
  createdAt?: string;
  lastLogin?: string;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  isArchived?: boolean;
  driverScore?: number;
}

export interface DriverRosterItem {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  cabNumber?: string;
  formattedLabel?: string;
  status: 'available' | 'on_trip' | 'offline' | 'break';
  vehicle: string;
  tier: string;
  phone: string;
  zone: string;
  currentTripId?: string;
  driverScore?: number;
  isBlacklisted?: boolean;
  isArchived?: boolean;
  driverLicense?: string;
  email?: string;
  isOperator?: boolean;
}

export const DEFAULT_OPERATORS: OperatorUser[] = [
  {
    uid: 'demo-admin-01',
    email: 'admin@chesterfieldtaxi.com',
    displayName: 'Executive Administrator',
    firstName: 'Executive',
    lastName: 'Administrator',
    username: 'admin',
    role: 'admin',
    phone: '(314) 738-0100',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    uid: 'demo-dispatch-01',
    email: 'dispatch@chesterfieldtaxi.com',
    displayName: 'Lead Night Dispatcher',
    firstName: 'Lead',
    lastName: 'Dispatcher',
    username: 'dispatch',
    role: 'dispatcher',
    phone: '(314) 555-0144',
    status: 'active',
    createdAt: '2026-02-15T08:00:00Z',
  },
  {
    uid: 'demo-driver-01',
    email: 'marcus.vance@chesterfieldtaxi.com',
    displayName: 'Marcus Vance',
    firstName: 'Marcus',
    lastName: 'Vance',
    cabNumber: '101',
    username: 'marcusv101',
    role: 'driver',
    phone: '(314) 555-0182',
    driverLicense: 'MO-DL-8829104',
    assignedUnit: 'Unit #101',
    status: 'active',
    createdAt: '2026-03-01T10:00:00Z',
    driverScore: 98,
  },
  {
    uid: 'demo-driver-02',
    email: 'sarah.connor@chesterfieldtaxi.com',
    displayName: 'Sarah Connor',
    firstName: 'Sarah',
    lastName: 'Connor',
    cabNumber: '102',
    username: 'sarahc102',
    role: 'driver',
    phone: '(314) 555-0199',
    driverLicense: 'MO-DL-7734190',
    assignedUnit: 'Unit #102',
    status: 'active',
    createdAt: '2026-03-10T12:00:00Z',
    driverScore: 96,
  },
  {
    uid: 'demo-driver-03',
    email: 'dave.miller@chesterfieldtaxi.com',
    displayName: 'Dave Miller',
    firstName: 'Dave',
    lastName: 'Miller',
    cabNumber: '103',
    username: 'davem103',
    role: 'driver',
    phone: '(314) 555-0128',
    driverLicense: 'MO-DL-4481023',
    assignedUnit: 'Unit #103',
    status: 'suspended',
    createdAt: '2026-04-01T15:00:00Z',
    driverScore: 78,
  },
];

export const LEGACY_DEFAULT_DRIVERS: DriverRosterItem[] = [
  {
    id: 'drv-101',
    name: 'Driver 101 (Mike T.)',
    firstName: 'Mike',
    lastName: 'T.',
    cabNumber: '204',
    username: 'miket204',
    formattedLabel: '#204, Mike',
    status: 'available',
    vehicle: 'Toyota Camry (#204)',
    tier: 'Sedan',
    phone: '(314) 555-0101',
    zone: 'Chesterfield Valley',
    driverScore: 98,
  },
  {
    id: 'drv-104',
    name: 'Driver 104 (Sarah K.)',
    firstName: 'Sarah',
    lastName: 'K.',
    cabNumber: '301',
    username: 'sarahk301',
    formattedLabel: '#301, Sarah',
    status: 'on_trip',
    vehicle: 'Chevy Suburban (#301)',
    tier: 'SUV',
    phone: '(314) 555-0104',
    zone: 'Lambert Airport (STL)',
    currentTripId: 'tr-8831',
    driverScore: 95,
  },
  {
    id: 'drv-108',
    name: 'Driver 108 (David R.)',
    firstName: 'David',
    lastName: 'R.',
    cabNumber: '102',
    username: 'davidr102',
    formattedLabel: '#102, David',
    status: 'available',
    vehicle: 'Ford Transit (#102)',
    tier: 'Van',
    phone: '(314) 555-0108',
    zone: 'Town and Country',
    driverScore: 91,
  },
  {
    id: 'drv-112',
    name: 'Driver 112 (James W.)',
    firstName: 'James',
    lastName: 'W.',
    cabNumber: '208',
    username: 'jamesw208',
    formattedLabel: '#208, James',
    status: 'available',
    vehicle: 'Lincoln Continental (#208)',
    tier: 'Sedan',
    phone: '(314) 555-0112',
    zone: 'Ballwin / Manchester',
    driverScore: 88,
  },
  {
    id: 'drv-115',
    name: 'Driver 115 (Alex M.)',
    firstName: 'Alex',
    lastName: 'M.',
    cabNumber: '105',
    username: 'alexm105',
    formattedLabel: '#105, Alex',
    status: 'offline',
    vehicle: 'Toyota Sienna (#105)',
    tier: 'Van',
    phone: '(314) 555-0115',
    zone: 'Off Duty',
    driverScore: 74,
  },
];

const STORAGE_KEY = 'chesterfield_operators_cache_v1';
const UPDATE_EVENT = 'chesterfield:operators-updated';

export class OperatorService {
  private operators: OperatorUser[] = [];
  private listeners = new Set<(operators: OperatorUser[]) => void>();
  private driverListeners = new Set<(drivers: DriverRosterItem[]) => void>();
  private isHydrated = false;
  private unsubscribeFirestore: (() => void) | null = null;

  constructor() {
    this.hydrateFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener(UPDATE_EVENT, () => {
        this.hydrateFromStorage();
        this.notifyAll();
      });
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.hydrateFromStorage();
          this.notifyAll();
        }
      });
    }
  }

  private hydrateFromStorage(): void {
    if (typeof window === 'undefined') {
      this.operators = DEFAULT_OPERATORS;
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.operators = parsed;
          this.isHydrated = true;
          return;
        }
      }
    } catch {}

    this.operators = DEFAULT_OPERATORS;
    this.isHydrated = true;
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.operators));
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    } catch {}
  }

  private notifyAll(): void {
    for (const l of this.listeners) {
      try {
        l(this.operators);
      } catch (e) {
        console.error('[OperatorService] Listener error:', e);
      }
    }

    const roster = this.getDriverRoster();
    for (const dl of this.driverListeners) {
      try {
        dl(roster);
      } catch (e) {
        console.error('[OperatorService] Driver listener error:', e);
      }
    }
  }

  /**
   * Fetch all operators from Firestore or local cache
   */
  public async getOperators(): Promise<OperatorUser[]> {
    if (!isFirebaseConfigured()) {
      if (!this.isHydrated) this.hydrateFromStorage();
      return this.operators;
    }

    try {
      const db = getFirestore(getFirebaseApp());
      const querySnapshot = await getDocs(collection(db, 'users'));
      if (querySnapshot.empty) {
        if (!this.operators || this.operators.length === 0) {
          this.operators = DEFAULT_OPERATORS;
        }
        return this.operators;
      }

      const fetched: OperatorUser[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const roles = (data.roles as UserRole[]) || (data.role ? [data.role as UserRole] : ['customer']);
        const primaryRole = roles[0] || 'customer';

        if (!roles.includes('customer') || roles.length > 1) {
          const firstName = data.firstName || (data.displayName ? data.displayName.split(' ')[0] : '');
          const lastName = data.lastName || (data.displayName ? data.displayName.split(' ').slice(1).join(' ') : '');
          const cabNumber = data.cabNumber || (data.assignedUnit ? (data.assignedUnit.match(/#?(\d+)/)?.[1] || data.assignedUnit) : '');
          const username = data.username || generateDriverUsername(firstName, lastName, cabNumber);

          fetched.push({
            uid: docSnap.id,
            email: data.email || 'unknown@chesterfieldtaxi.com',
            displayName: data.displayName || data.name || (firstName ? `${firstName} ${lastName}`.trim() : ''),
            firstName,
            lastName,
            username,
            cabNumber,
            role: primaryRole,
            roles,
            phone: data.phone || data.phoneNumber || '',
            driverLicense: data.driverLicense || '',
            assignedUnit: data.assignedUnit || (cabNumber ? `Cab #${cabNumber}` : ''),
            status: data.status || 'active',
            createdAt: data.createdAt,
            lastLogin: data.lastLogin,
            isBlacklisted: data.isBlacklisted,
            blacklistReason: data.blacklistReason,
            isArchived: data.isArchived,
            driverScore: data.driverScore,
          });
        }
      });

      // Merge default drivers if not present in fresh Firestore
      const hasDrivers = fetched.some((u) => u.roles?.includes('driver') || u.role === 'driver');
      if (!hasDrivers) {
        fetched.push(...DEFAULT_OPERATORS.filter((o) => o.role === 'driver'));
      }

      this.operators = fetched;
      this.saveToStorage();
      return fetched;
    } catch (err) {
      console.warn('[OperatorService] Firestore fetch error, using cache:', err);
      return this.operators;
    }
  }

  /**
   * Return only operators with driver role
   */
  public async getDriverOperators(): Promise<OperatorUser[]> {
    const all = await this.getOperators();
    return all.filter((op) => {
      const isArchived = Boolean(op.isArchived);
      if (isArchived) return false;
      const roles = op.roles || [op.role];
      return roles.includes('driver');
    });
  }

  /**
   * Get an operator by UID from current state or defaults
   */
  public getOperatorById(uid: string): OperatorUser | undefined {
    return this.operators.find((o) => o.uid === uid) || DEFAULT_OPERATORS.find((o) => o.uid === uid);
  }

  /**
   * Generates a unified driver roster merging driver operators with legacy drivers
   */
  public getDriverRoster(): DriverRosterItem[] {
    const driverOps = this.operators.filter((op) => {
      if (op.isArchived) return false;
      const roles = op.roles || [op.role];
      return roles.includes('driver');
    });

    const operatorDrivers: DriverRosterItem[] = driverOps.map((op) => {
      const isSuspended = op.status === 'suspended';
      const firstName = op.firstName || (op.displayName ? op.displayName.split(' ')[0] : '');
      const lastName = op.lastName || (op.displayName ? op.displayName.split(' ').slice(1).join(' ') : '');
      const cabNumber = op.cabNumber || (op.assignedUnit ? (op.assignedUnit.match(/#?(\d+)/)?.[1] || op.assignedUnit) : '');
      const username = op.username || generateDriverUsername(firstName, lastName, cabNumber);
      const vehicle = op.assignedUnit || (cabNumber ? `Cab #${cabNumber}` : 'Unassigned');
      const formattedLabel = formatDriverAssignmentLabel({
        name: op.displayName,
        firstName,
        lastName,
        cabNumber,
        assignedUnit: vehicle,
      });

      return {
        id: op.uid,
        name: op.displayName || (firstName ? `${firstName} ${lastName}`.trim() : op.email.split('@')[0]),
        firstName,
        lastName,
        cabNumber,
        username,
        formattedLabel,
        status: isSuspended ? 'offline' : 'available',
        vehicle,
        tier: 'Sedan',
        phone: op.phone || '',
        zone: isSuspended ? 'Suspended' : 'Chesterfield Valley',
        driverScore: op.driverScore || 95,
        isBlacklisted: Boolean(op.isBlacklisted),
        isArchived: Boolean(op.isArchived),
        driverLicense: op.driverLicense,
        email: op.email,
        isOperator: true,
      };
    });

    // Merge legacy drivers if not already in list
    const existingIds = new Set(operatorDrivers.map((d) => d.id));
    const merged = [...operatorDrivers];

    for (const legacy of LEGACY_DEFAULT_DRIVERS) {
      if (!existingIds.has(legacy.id)) {
        merged.push(legacy);
        existingIds.add(legacy.id);
      }
    }

    return merged;
  }

  /**
   * Subscribe to operator list changes
   */
  public subscribeToOperators(callback: (operators: OperatorUser[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.operators);

    this.ensureFirestoreSubscription();

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Subscribe to driver roster changes (operators + legacy)
   */
  public subscribeToDrivers(callback: (drivers: DriverRosterItem[]) => void): () => void {
    this.driverListeners.add(callback);
    callback(this.getDriverRoster());

    this.ensureFirestoreSubscription();

    return () => {
      this.driverListeners.delete(callback);
    };
  }

  private ensureFirestoreSubscription(): void {
    if (this.unsubscribeFirestore || !isFirebaseConfigured()) return;

    try {
      const db = getFirestore(getFirebaseApp());
      this.unsubscribeFirestore = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const fetched: OperatorUser[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const roles = (data.roles as UserRole[]) || (data.role ? [data.role as UserRole] : ['customer']);
            const primaryRole = roles[0] || 'customer';

            if (!roles.includes('customer') || roles.length > 1) {
              const firstName = data.firstName || (data.displayName ? data.displayName.split(' ')[0] : '');
              const lastName = data.lastName || (data.displayName ? data.displayName.split(' ').slice(1).join(' ') : '');
              const cabNumber = data.cabNumber || (data.assignedUnit ? (data.assignedUnit.match(/#?(\d+)/)?.[1] || data.assignedUnit) : '');
              const username = data.username || generateDriverUsername(firstName, lastName, cabNumber);

              fetched.push({
                uid: docSnap.id,
                email: data.email || 'unknown@chesterfieldtaxi.com',
                displayName: data.displayName || data.name || (firstName ? `${firstName} ${lastName}`.trim() : ''),
                firstName,
                lastName,
                username,
                cabNumber,
                role: primaryRole,
                roles,
                phone: data.phone || data.phoneNumber || '',
                driverLicense: data.driverLicense || '',
                assignedUnit: data.assignedUnit || (cabNumber ? `Cab #${cabNumber}` : ''),
                status: data.status || 'active',
                createdAt: data.createdAt,
                lastLogin: data.lastLogin,
                isBlacklisted: data.isBlacklisted,
                blacklistReason: data.blacklistReason,
                isArchived: data.isArchived,
                driverScore: data.driverScore,
              });
            }
          });

          // Ensure default driver operators are preserved if fresh DB
          const hasDrivers = fetched.some((u) => u.roles?.includes('driver') || u.role === 'driver');
          if (!hasDrivers) {
            fetched.push(...DEFAULT_OPERATORS.filter((o) => o.role === 'driver'));
          }

          this.operators = fetched;
          this.saveToStorage();
          this.notifyAll();
        },
        (err) => {
          console.warn('[OperatorService] Snapshot error:', err);
        }
      );
    } catch (e) {
      console.warn('[OperatorService] Could not establish Firestore snapshot listener:', e);
    }
  }

  /**
   * Save or update an operator
   */
  public async saveOperator(operator: OperatorUser): Promise<void> {
    const firstName = operator.firstName || (operator.displayName ? operator.displayName.split(' ')[0] : '');
    const lastName = operator.lastName || (operator.displayName ? operator.displayName.split(' ').slice(1).join(' ') : '');
    const cabNumber = operator.cabNumber || (operator.assignedUnit ? (operator.assignedUnit.match(/#?(\d+)/)?.[1] || operator.assignedUnit) : '');
    const username = operator.username || generateDriverUsername(firstName, lastName, cabNumber);
    const displayName = operator.displayName || (firstName ? `${firstName} ${lastName}`.trim() : '');
    const assignedUnit = operator.assignedUnit || (cabNumber ? `Cab #${cabNumber}` : '');

    const completeOperator: OperatorUser = {
      ...operator,
      firstName,
      lastName,
      cabNumber,
      username,
      displayName,
      assignedUnit,
    };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        await setDoc(doc(db, 'users', completeOperator.uid), completeOperator, { merge: true });
      } catch (err) {
        console.warn('[OperatorService] Firestore save error:', err);
      }
    }

    const idx = this.operators.findIndex((o) => o.uid === completeOperator.uid);
    if (idx >= 0) {
      this.operators[idx] = { ...this.operators[idx], ...completeOperator };
    } else {
      this.operators = [completeOperator, ...this.operators];
    }

    this.saveToStorage();
    this.notifyAll();
  }

  /**
   * Delete an operator
   */
  public async deleteOperator(uid: string): Promise<void> {
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        await deleteDoc(doc(db, 'users', uid));
      } catch (err) {
        console.warn('[OperatorService] Firestore delete error:', err);
      }
    }

    this.operators = this.operators.filter((o) => o.uid !== uid);
    this.saveToStorage();
    this.notifyAll();
  }
}

let operatorServiceInstance: OperatorService | null = null;

export function getOperatorService(): OperatorService {
  if (!operatorServiceInstance) {
    operatorServiceInstance = new OperatorService();
  }
  return operatorServiceInstance;
}
