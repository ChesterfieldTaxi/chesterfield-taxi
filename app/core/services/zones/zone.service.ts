/**
 * Operational Zone Geofence Service
 * 
 * Manages geographic zones (radius circles and polygon geofences) stored in
 * Firestore collection `/zones` with regional presets for Chesterfield and St. Louis.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  type Firestore,
} from 'firebase/firestore';
import type { ZoneGeofence } from '../../types/zone';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const ZONES_STORAGE_KEY = 'chesterfield_taxi_geofence_zones';

export const DEFAULT_ZONES: ZoneGeofence[] = [
  {
    id: 'zone-chesterfield-valley',
    name: 'Chesterfield Valley Core',
    description: 'Primary local service zone enveloping Chesterfield Valley, outlet malls, and residential neighborhoods.',
    type: 'radius',
    center: { lat: 38.6631, lng: -90.5771 },
    radiusMiles: 5.0,
    color: '#3b82f6', // Blue
    surchargeMultiplier: 1.0,
    flatFee: 0,
    isActive: true,
  },
  {
    id: 'zone-spirit-airport',
    name: 'Spirit of St. Louis Airport (SUS)',
    description: 'Corporate VIP aviation and private hangar zone in Chesterfield.',
    type: 'radius',
    center: { lat: 38.6622, lng: -90.6508 },
    radiusMiles: 2.5,
    color: '#10b981', // Emerald
    surchargeMultiplier: 1.0,
    flatFee: 3.50,
    isActive: true,
  },
  {
    id: 'zone-lambert-airport',
    name: 'St. Louis Lambert International (STL)',
    description: 'Commercial airport terminal pickup and drop-off gate perimeter.',
    type: 'radius',
    center: { lat: 38.7487, lng: -90.3700 },
    radiusMiles: 3.5,
    color: '#f59e0b', // Amber
    surchargeMultiplier: 1.0,
    flatFee: 5.00,
    isActive: true,
  },
  {
    id: 'zone-west-county',
    name: 'West County Suburban Corridor',
    description: 'Envelops Wildwood, Clarkson Valley, Ballwin, Ellisville, and Town & Country.',
    type: 'polygon',
    vertices: [
      { lat: 38.6850, lng: -90.6200 },
      { lat: 38.6850, lng: -90.4500 },
      { lat: 38.5600, lng: -90.4500 },
      { lat: 38.5600, lng: -90.6200 },
    ],
    color: '#8b5cf6', // Violet
    surchargeMultiplier: 1.0,
    flatFee: 0,
    isActive: true,
  },
  {
    id: 'zone-downtown-stl',
    name: 'Downtown St. Louis Metro Hub',
    description: 'Metropolitan center covering Gateway Arch, Busch Stadium, Enterprise Center, and hotels.',
    type: 'radius',
    center: { lat: 38.6270, lng: -90.1994 },
    radiusMiles: 4.0,
    color: '#ec4899', // Pink
    surchargeMultiplier: 1.10,
    flatFee: 5.00,
    isActive: true,
  },
];

export class ZoneService {
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    if (this.isConfigured) {
      try {
        this.db = getFirestoreDb();
      } catch (err) {
        console.warn('[ZoneService] Failed to initialize Firestore client:', err);
      }
    }
  }

  private getCachedZones(): ZoneGeofence[] {
    if (typeof window === 'undefined') return DEFAULT_ZONES;
    try {
      const raw = localStorage.getItem(ZONES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_ZONES;
  }

  private setCachedZones(zones: ZoneGeofence[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
    } catch {
      // Ignore storage errors
    }
  }

  public async getZones(): Promise<ZoneGeofence[]> {
    if (this.isConfigured && this.db) {
      try {
        const zonesCol = collection(this.db, 'zones');
        const snapshot = await getDocs(zonesCol);
        if (!snapshot.empty) {
          const zones: ZoneGeofence[] = [];
          snapshot.forEach((docSnap) => {
            zones.push({ id: docSnap.id, ...(docSnap.data() as Omit<ZoneGeofence, 'id'>) });
          });
          this.setCachedZones(zones);
          return zones;
        }
      } catch (err) {
        console.warn('[ZoneService] Firestore query error, falling back to cache:', err);
      }
    }
    return this.getCachedZones();
  }

  public subscribeToZones(
    onUpdate: (zones: ZoneGeofence[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (this.isConfigured && this.db) {
      try {
        const zonesCol = collection(this.db, 'zones');
        const q = query(zonesCol);
        return onSnapshot(
          q,
          (snapshot) => {
            const zones: ZoneGeofence[] = [];
            snapshot.forEach((docSnap) => {
              zones.push({ id: docSnap.id, ...(docSnap.data() as Omit<ZoneGeofence, 'id'>) });
            });
            if (zones.length > 0) {
              this.setCachedZones(zones);
              onUpdate(zones);
            } else {
              const cached = this.getCachedZones();
              onUpdate(cached);
            }
          },
          (err) => {
            console.warn('[ZoneService] onSnapshot error:', err);
            onUpdate(this.getCachedZones());
            if (onError) onError(err);
          }
        );
      } catch (err) {
        console.warn('[ZoneService] subscribeToZones fallback:', err);
      }
    }

    onUpdate(this.getCachedZones());
    return () => {};
  }

  public async saveZone(zone: ZoneGeofence): Promise<ZoneGeofence> {
    const zoneId =
      zone.id ||
      `zone-${zone.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36)}`;
    const sanitizedZone: ZoneGeofence = {
      ...zone,
      id: zoneId,
      updatedAt: new Date().toISOString(),
      createdAt: zone.createdAt || new Date().toISOString(),
    };

    if (this.isConfigured && this.db) {
      try {
        const zoneRef = doc(this.db, 'zones', zoneId);
        const payload = sanitizePayload(sanitizedZone);
        await setDoc(zoneRef, payload, { merge: true });
      } catch (err) {
        console.warn('[ZoneService] Firestore setDoc error, saving to cache:', err);
      }
    }

    const current = this.getCachedZones();
    const existingIndex = current.findIndex((z) => z.id === zoneId);
    let updated: ZoneGeofence[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = sanitizedZone;
    } else {
      updated = [sanitizedZone, ...current];
    }
    this.setCachedZones(updated);
    return sanitizedZone;
  }

  public async deleteZone(zoneId: string): Promise<void> {
    if (this.isConfigured && this.db) {
      try {
        const zoneRef = doc(this.db, 'zones', zoneId);
        await deleteDoc(zoneRef);
      } catch (err) {
        console.warn('[ZoneService] Firestore deleteDoc error:', err);
      }
    }

    const current = this.getCachedZones();
    const updated = current.filter((z) => z.id !== zoneId);
    this.setCachedZones(updated);
  }
}

let zoneServiceInstance: ZoneService | null = null;

export function getZoneService(): ZoneService {
  if (!zoneServiceInstance) {
    zoneServiceInstance = new ZoneService();
  }
  return zoneServiceInstance;
}
