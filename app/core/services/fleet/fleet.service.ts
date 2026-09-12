/**
 * Fleet Asset Management Service
 * 
 * Provides CRUD operations and real-time synchronization for physical fleet vehicles
 * stored in Firestore collection `/fleet` with resilient local storage fallback.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Firestore,
} from 'firebase/firestore';
import type { PhysicalFleetAsset } from '../../types/fleet';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const FLEET_STORAGE_KEY = 'chesterfield_taxi_fleet_assets';

export const DEFAULT_FLEET_ASSETS: PhysicalFleetAsset[] = [
  {
    id: 'asset-101',
    unitNumber: 'Cab #101',
    vehicleTypeId: 'standard',
    make: 'Toyota',
    model: 'Camry Hybrid',
    year: 2024,
    color: 'Silver',
    licensePlate: 'MO-7TX91',
    vin: '4T1B11HK5PU120481',
    assignedDriverId: 'driver-101',
    assignedDriverName: 'Mike T.',
    insurancePolicy: 'ST-902348-COMM',
    insuranceExpiry: '2027-06-30',
    mileage: 48250,
    status: 'active',
    maintenanceHistory: [
      {
        id: 'm-1',
        date: '2026-08-15',
        description: 'Synthetic oil change & tire rotation',
        cost: 110,
        odometer: 45000,
        performedBy: 'Chesterfield Auto Care',
      },
    ],
  },
  {
    id: 'asset-104',
    unitNumber: 'Cab #104',
    vehicleTypeId: 'xl',
    make: 'Chevrolet',
    model: 'Suburban LT',
    year: 2023,
    color: 'Midnight Black',
    licensePlate: 'MO-8XL42',
    vin: '1GNSKBKC8PR230914',
    assignedDriverId: 'driver-102',
    assignedDriverName: 'Sarah K.',
    insurancePolicy: 'ST-902348-COMM',
    insuranceExpiry: '2027-06-30',
    mileage: 62100,
    status: 'active',
    maintenanceHistory: [
      {
        id: 'm-2',
        date: '2026-07-20',
        description: 'Brake pads replacement & rotor resurfacing',
        cost: 450,
        odometer: 60000,
        performedBy: 'West County Chevrolet',
      },
    ],
  },
  {
    id: 'asset-108',
    unitNumber: 'Cab #108',
    vehicleTypeId: 'wheelchair',
    make: 'Toyota',
    model: 'Sienna BraunAbility WAV',
    year: 2024,
    color: 'White',
    licensePlate: 'MO-9WAV1',
    vin: '5TDKZ3DC5PS981023',
    assignedDriverId: 'driver-103',
    assignedDriverName: 'David L.',
    insurancePolicy: 'ST-902348-COMM',
    insuranceExpiry: '2027-06-30',
    mileage: 31400,
    status: 'active',
    maintenanceHistory: [
      {
        id: 'm-3',
        date: '2026-06-10',
        description: 'Hydraulic ramp inspection and servicing',
        cost: 280,
        odometer: 30000,
        performedBy: 'Mobility Works St. Louis',
      },
    ],
  },
  {
    id: 'asset-112',
    unitNumber: 'Cab #112',
    vehicleTypeId: 'standard',
    make: 'Honda',
    model: 'Accord Touring',
    year: 2022,
    color: 'Modern Steel',
    licensePlate: 'MO-4AC88',
    vin: '1HGCV1F89NA019284',
    assignedDriverId: 'driver-104',
    assignedDriverName: 'Alex R.',
    insurancePolicy: 'ST-902348-COMM',
    insuranceExpiry: '2026-11-30',
    mileage: 78500,
    status: 'maintenance',
    maintenanceHistory: [
      {
        id: 'm-4',
        date: '2026-09-01',
        description: 'A/C compressor diagnostics and coolant recharge',
        cost: 320,
        odometer: 78400,
        performedBy: 'Chesterfield Auto Care',
      },
    ],
  },
];

export class FleetService {
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    if (this.isConfigured) {
      try {
        this.db = getFirestoreDb();
      } catch (err) {
        console.warn('[FleetService] Failed to initialize Firestore client:', err);
      }
    }
  }

  private getCachedFleet(): PhysicalFleetAsset[] {
    if (typeof window === 'undefined') return DEFAULT_FLEET_ASSETS;
    try {
      const raw = localStorage.getItem(FLEET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_FLEET_ASSETS;
  }

  private setCachedFleet(fleet: PhysicalFleetAsset[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(fleet));
    } catch {
      // Ignore storage errors
    }
  }

  public async getFleet(): Promise<PhysicalFleetAsset[]> {
    if (this.isConfigured && this.db) {
      try {
        const fleetCol = collection(this.db, 'fleet');
        const snapshot = await getDocs(fleetCol);
        if (!snapshot.empty) {
          const assets: PhysicalFleetAsset[] = [];
          snapshot.forEach((docSnap) => {
            assets.push({ id: docSnap.id, ...(docSnap.data() as Omit<PhysicalFleetAsset, 'id'>) });
          });
          this.setCachedFleet(assets);
          return assets;
        }
      } catch (err) {
        console.warn('[FleetService] Firestore query error, falling back to cache:', err);
      }
    }
    return this.getCachedFleet();
  }

  public subscribeToFleet(
    onUpdate: (fleet: PhysicalFleetAsset[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (this.isConfigured && this.db) {
      try {
        const fleetCol = collection(this.db, 'fleet');
        const q = query(fleetCol);
        return onSnapshot(
          q,
          (snapshot) => {
            const assets: PhysicalFleetAsset[] = [];
            snapshot.forEach((docSnap) => {
              assets.push({ id: docSnap.id, ...(docSnap.data() as Omit<PhysicalFleetAsset, 'id'>) });
            });
            if (assets.length > 0) {
              this.setCachedFleet(assets);
              onUpdate(assets);
            } else {
              // If collection is empty in Firestore, seed with defaults or cache
              const cached = this.getCachedFleet();
              onUpdate(cached);
            }
          },
          (err) => {
            console.warn('[FleetService] onSnapshot subscription warning:', err);
            onUpdate(this.getCachedFleet());
            if (onError) onError(err);
          }
        );
      } catch (err) {
        console.warn('[FleetService] subscribeToFleet fallback:', err);
      }
    }

    // Offline / SSR fallback
    onUpdate(this.getCachedFleet());
    return () => {};
  }

  public async saveAsset(asset: PhysicalFleetAsset): Promise<PhysicalFleetAsset> {
    const assetId = asset.id || `asset-${Date.now().toString(36)}`;
    const sanitizedAsset: PhysicalFleetAsset = {
      ...asset,
      id: assetId,
      updatedAt: new Date().toISOString(),
      createdAt: asset.createdAt || new Date().toISOString(),
    };

    if (this.isConfigured && this.db) {
      try {
        const assetRef = doc(this.db, 'fleet', assetId);
        const payload = sanitizePayload(sanitizedAsset);
        await setDoc(assetRef, payload, { merge: true });
      } catch (err) {
        console.warn('[FleetService] Firestore setDoc error, saving to local cache:', err);
      }
    }

    // Update local cache
    const current = this.getCachedFleet();
    const existingIndex = current.findIndex((a) => a.id === assetId);
    let updated: PhysicalFleetAsset[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = sanitizedAsset;
    } else {
      updated = [sanitizedAsset, ...current];
    }
    this.setCachedFleet(updated);
    return sanitizedAsset;
  }

  public async deleteAsset(assetId: string): Promise<void> {
    if (this.isConfigured && this.db) {
      try {
        const assetRef = doc(this.db, 'fleet', assetId);
        await deleteDoc(assetRef);
      } catch (err) {
        console.warn('[FleetService] Firestore deleteDoc error:', err);
      }
    }

    const current = this.getCachedFleet();
    const updated = current.filter((a) => a.id !== assetId);
    this.setCachedFleet(updated);
  }
}

let fleetServiceInstance: FleetService | null = null;

export function getFleetService(): FleetService {
  if (!fleetServiceInstance) {
    fleetServiceInstance = new FleetService();
  }
  return fleetServiceInstance;
}
