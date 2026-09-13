/**
 * Operational Zone Geofence & Geographic Entity Service
 * 
 * Manages geographic zones (radius circles and polygon geofences),
 * Zone Groups (clustered geofences), and Named Location Collections (curated POIs)
 * stored in Firestore collections `/zones`, `/zoneGroups`, and `/locationCollections`.
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
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  LocationPoint,
  ZoneCoordinate,
} from '../../types/zone';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const ZONES_STORAGE_KEY = 'chesterfield_taxi_geofence_zones';
const ZONE_GROUPS_STORAGE_KEY = 'chesterfield_taxi_zone_groups';
const LOCATION_COLLECTIONS_STORAGE_KEY = 'chesterfield_taxi_location_collections';

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

export const DEFAULT_ZONE_GROUPS: ZoneGroup[] = [
  {
    id: 'group-metro-west',
    name: 'Metro West Corridor',
    description: 'Primary Western suburbs cluster uniting Chesterfield Valley and West County suburban communities.',
    zoneIds: ['zone-chesterfield-valley', 'zone-west-county'],
    color: '#6366f1', // Indigo
    surchargeMultiplier: 1.0,
    flatFee: 0,
    isActive: true,
  },
  {
    id: 'group-regional-aviation',
    name: 'Regional Airport Hubs',
    description: 'Commercial and corporate aviation perimeters uniting Lambert (STL) and Spirit of St. Louis (SUS).',
    zoneIds: ['zone-spirit-airport', 'zone-lambert-airport'],
    color: '#f59e0b', // Amber
    surchargeMultiplier: 1.0,
    flatFee: 5.00,
    isActive: true,
  },
  {
    id: 'group-downtown-core',
    name: 'Downtown Core & Sports Corridor',
    description: 'High-density urban event centers, stadiums, and conventions in downtown St. Louis.',
    zoneIds: ['zone-downtown-stl'],
    color: '#ec4899', // Pink
    surchargeMultiplier: 1.10,
    flatFee: 5.00,
    isActive: true,
  },
];

export const DEFAULT_LOCATION_COLLECTIONS: LocationCollection[] = [
  {
    id: 'collection-regional-airports',
    name: 'Regional Airport Terminals & Hangars',
    description: 'Curated commercial gates and private aviation FBOs across St. Louis & Chesterfield.',
    category: 'airport',
    flatFee: 5.00,
    surchargeMultiplier: 1.0,
    proximityRadiusMiles: 0.6,
    isActive: true,
    locations: [
      {
        id: 'poi-stl-t1',
        name: 'STL Lambert Terminal 1 (Main Concourse)',
        address: '10701 Lambert International Blvd, St. Louis, MO 63145',
        coordinates: { lat: 38.7487, lng: -90.3700 },
        category: 'airport',
        flatFee: 5.00,
        notes: 'Terminal 1 Departures / Arrivals pickup curb',
      },
      {
        id: 'poi-stl-t2',
        name: 'STL Lambert Terminal 2 (Southwest Airlines)',
        address: '9885 Air Cargo Rd, St. Louis, MO 63134',
        coordinates: { lat: 38.7441, lng: -90.3582 },
        category: 'airport',
        flatFee: 5.00,
        notes: 'Terminal 2 Baggage Claim exit doors',
      },
      {
        id: 'poi-sus-hangar',
        name: 'Spirit of St. Louis Airport Executive FBO',
        address: '18260 Edison Ave, Chesterfield, MO 63005',
        coordinates: { lat: 38.6622, lng: -90.6508 },
        category: 'airport',
        flatFee: 3.50,
        notes: 'VIP private hangar corridor',
      },
      {
        id: 'poi-cps-downtown',
        name: 'St. Louis Downtown Airport (CPS)',
        address: '1400 Upper Cahokia Rd, Cahokia, IL 62206',
        coordinates: { lat: 38.5714, lng: -90.1568 },
        category: 'airport',
        flatFee: 4.00,
        notes: 'Charter flight ramp',
      },
    ],
  },
  {
    id: 'collection-stadiums-arenas',
    name: 'Sports & Entertainment Arenas',
    description: 'Major athletic stadiums, hockey arenas, and convention centers in the St. Louis metro area.',
    category: 'venue',
    flatFee: 6.00,
    surchargeMultiplier: 1.0,
    proximityRadiusMiles: 0.4,
    isActive: true,
    locations: [
      {
        id: 'poi-busch-stadium',
        name: 'Busch Stadium (St. Louis Cardinals)',
        address: '700 Clark Ave, St. Louis, MO 63102',
        coordinates: { lat: 38.6226, lng: -90.1928 },
        category: 'venue',
        flatFee: 6.00,
        notes: 'Gate 2 passenger drop-off on 8th St',
      },
      {
        id: 'poi-enterprise-center',
        name: 'Enterprise Center (St. Louis Blues)',
        address: '1401 Clark Ave, St. Louis, MO 63103',
        coordinates: { lat: 38.6268, lng: -90.2026 },
        category: 'venue',
        flatFee: 6.00,
        notes: 'Clark Ave passenger loading zone',
      },
      {
        id: 'poi-citypark',
        name: 'CITYPARK Stadium (St. Louis CITY SC)',
        address: '2100 Market St, St. Louis, MO 63103',
        coordinates: { lat: 38.6315, lng: -90.2112 },
        category: 'venue',
        flatFee: 6.00,
        notes: 'Market St match day transit pullout',
      },
      {
        id: 'poi-dome',
        name: 'The Dome at America\'s Center',
        address: '701 Convention Plaza, St. Louis, MO 63101',
        coordinates: { lat: 38.6328, lng: -90.1885 },
        category: 'venue',
        flatFee: 5.00,
        notes: 'Broadway & Convention Plaza entrance',
      },
    ],
  },
  {
    id: 'collection-transit-stations',
    name: 'Metro Transit & Rail Stations',
    description: 'Regional passenger train depots, multi-modal transfer hubs, and express transit centers.',
    category: 'train_station',
    flatFee: 2.50,
    surchargeMultiplier: 1.0,
    proximityRadiusMiles: 0.3,
    isActive: true,
    locations: [
      {
        id: 'poi-gateway-multimodal',
        name: 'Gateway Multimodal Transportation Center (Amtrak)',
        address: '430 S 15th St, St. Louis, MO 63103',
        coordinates: { lat: 38.6234, lng: -90.2033 },
        category: 'train_station',
        flatFee: 3.00,
        notes: 'Amtrak and Greyhound regional terminal',
      },
      {
        id: 'poi-chesterfield-transit',
        name: 'Chesterfield Valley Commuter Transit Station',
        address: '17200 Chesterfield Airport Rd, Chesterfield, MO 63005',
        coordinates: { lat: 38.6631, lng: -90.5771 },
        category: 'train_station',
        flatFee: 0,
        notes: 'West County park-and-ride transfer hub',
      },
    ],
  },
];

// ----------------------------------------------------------------------------
// Pure Spatial Utilities (Haversine & Ray-Casting)
// ----------------------------------------------------------------------------

/**
 * Calculates distance between two coordinates in statute miles using the Haversine formula.
 */
export function calculateHaversineDistanceMiles(
  coord1: ZoneCoordinate,
  coord2: ZoneCoordinate
): number {
  const R = 3958.8; // Earth's radius in statute miles
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if a coordinate is within a given radius circle.
 */
export function isCoordinateInRadius(
  coord: ZoneCoordinate,
  center: ZoneCoordinate,
  radiusMiles: number
): boolean {
  const dist = calculateHaversineDistanceMiles(coord, center);
  return dist <= radiusMiles;
}

/**
 * Checks if a coordinate is inside a polygon using the ray-casting algorithm.
 */
export function isCoordinateInPolygon(
  coord: ZoneCoordinate,
  vertices: ZoneCoordinate[]
): boolean {
  if (!vertices || vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].lng;
    const yi = vertices[i].lat;
    const xj = vertices[j].lng;
    const yj = vertices[j].lat;

    const intersect =
      yi > coord.lat !== yj > coord.lat &&
      coord.lng < ((xj - xi) * (coord.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Evaluates whether a coordinate falls inside a ZoneGeofence.
 */
export function isCoordinateInZone(
  coord: ZoneCoordinate,
  zone: ZoneGeofence
): boolean {
  if (!zone.isActive) return false;
  if (zone.type === 'radius' && zone.center && typeof zone.radiusMiles === 'number') {
    return isCoordinateInRadius(coord, zone.center, zone.radiusMiles);
  }
  if (zone.type === 'polygon' && zone.vertices && zone.vertices.length >= 3) {
    return isCoordinateInPolygon(coord, zone.vertices);
  }
  return false;
}

/**
 * Evaluates whether a coordinate falls inside any zone belonging to a ZoneGroup.
 */
export function isCoordinateInZoneGroup(
  coord: ZoneCoordinate,
  group: ZoneGroup,
  allZones: ZoneGeofence[]
): boolean {
  if (!group.isActive || !group.zoneIds || group.zoneIds.length === 0) return false;
  const memberZones = allZones.filter((z) => group.zoneIds.includes(z.id));
  return memberZones.some((z) => isCoordinateInZone(coord, z));
}

/**
 * Evaluates whether a coordinate is within proximity of any point in a LocationCollection.
 */
export function isCoordinateNearLocationCollection(
  coord: ZoneCoordinate,
  collection: LocationCollection,
  defaultToleranceMiles: number = 0.5
): { matches: boolean; matchedLocation?: LocationPoint; distanceMiles?: number } {
  if (!collection.isActive || !collection.locations || collection.locations.length === 0) {
    return { matches: false };
  }
  const tolerance = collection.proximityRadiusMiles ?? defaultToleranceMiles;

  let closestLoc: LocationPoint | undefined;
  let minDistance = Infinity;

  for (const loc of collection.locations) {
    const dist = calculateHaversineDistanceMiles(coord, loc.coordinates);
    if (dist < minDistance) {
      minDistance = dist;
      closestLoc = loc;
    }
  }

  if (closestLoc && minDistance <= tolerance) {
    return {
      matches: true,
      matchedLocation: closestLoc,
      distanceMiles: minDistance,
    };
  }

  return { matches: false };
}

// ----------------------------------------------------------------------------
// ZoneService Class
// ----------------------------------------------------------------------------

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

  // --- Zones Cache ---
  private getCachedZones(): ZoneGeofence[] {
    if (typeof window === 'undefined') return DEFAULT_ZONES;
    try {
      const raw = localStorage.getItem(ZONES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  // --- Zone Groups Cache ---
  private getCachedZoneGroups(): ZoneGroup[] {
    if (typeof window === 'undefined') return DEFAULT_ZONE_GROUPS;
    try {
      const raw = localStorage.getItem(ZONE_GROUPS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_ZONE_GROUPS;
  }

  private setCachedZoneGroups(groups: ZoneGroup[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ZONE_GROUPS_STORAGE_KEY, JSON.stringify(groups));
    } catch {
      // Ignore storage errors
    }
  }

  // --- Location Collections Cache ---
  private getCachedLocationCollections(): LocationCollection[] {
    if (typeof window === 'undefined') return DEFAULT_LOCATION_COLLECTIONS;
    try {
      const raw = localStorage.getItem(LOCATION_COLLECTIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_LOCATION_COLLECTIONS;
  }

  private setCachedLocationCollections(colls: LocationCollection[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCATION_COLLECTIONS_STORAGE_KEY, JSON.stringify(colls));
    } catch {
      // Ignore storage errors
    }
  }

  // ==========================================================================
  // Zones API (/zones)
  // ==========================================================================

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
        console.warn('[ZoneService] Firestore getZones error, using cache:', err);
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
              onUpdate(this.getCachedZones());
            }
          },
          (err) => {
            console.warn('[ZoneService] onSnapshot zones error:', err);
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
        console.warn('[ZoneService] Firestore setDoc zone error, saving to cache:', err);
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
        console.warn('[ZoneService] Firestore deleteDoc zone error:', err);
      }
    }

    const current = this.getCachedZones();
    const updated = current.filter((z) => z.id !== zoneId);
    this.setCachedZones(updated);
  }

  public async resetZonesToDefaults(): Promise<ZoneGeofence[]> {
    this.setCachedZones(DEFAULT_ZONES);
    if (this.isConfigured && this.db) {
      try {
        for (const zone of DEFAULT_ZONES) {
          const zoneRef = doc(this.db, 'zones', zone.id);
          await setDoc(zoneRef, sanitizePayload(zone), { merge: true });
        }
      } catch (err) {
        console.warn('[ZoneService] Reset zones error:', err);
      }
    }
    return DEFAULT_ZONES;
  }

  // ==========================================================================
  // Zone Groups API (/zoneGroups)
  // ==========================================================================

  public async getZoneGroups(): Promise<ZoneGroup[]> {
    if (this.isConfigured && this.db) {
      try {
        const groupsCol = collection(this.db, 'zoneGroups');
        const snapshot = await getDocs(groupsCol);
        if (!snapshot.empty) {
          const groups: ZoneGroup[] = [];
          snapshot.forEach((docSnap) => {
            groups.push({ id: docSnap.id, ...(docSnap.data() as Omit<ZoneGroup, 'id'>) });
          });
          this.setCachedZoneGroups(groups);
          return groups;
        }
      } catch (err) {
        console.warn('[ZoneService] Firestore getZoneGroups error, using cache:', err);
      }
    }
    return this.getCachedZoneGroups();
  }

  public subscribeToZoneGroups(
    onUpdate: (groups: ZoneGroup[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (this.isConfigured && this.db) {
      try {
        const groupsCol = collection(this.db, 'zoneGroups');
        const q = query(groupsCol);
        return onSnapshot(
          q,
          (snapshot) => {
            const groups: ZoneGroup[] = [];
            snapshot.forEach((docSnap) => {
              groups.push({ id: docSnap.id, ...(docSnap.data() as Omit<ZoneGroup, 'id'>) });
            });
            if (groups.length > 0) {
              this.setCachedZoneGroups(groups);
              onUpdate(groups);
            } else {
              onUpdate(this.getCachedZoneGroups());
            }
          },
          (err) => {
            console.warn('[ZoneService] onSnapshot zoneGroups error:', err);
            onUpdate(this.getCachedZoneGroups());
            if (onError) onError(err);
          }
        );
      } catch (err) {
        console.warn('[ZoneService] subscribeToZoneGroups fallback:', err);
      }
    }

    onUpdate(this.getCachedZoneGroups());
    return () => {};
  }

  public async saveZoneGroup(group: ZoneGroup): Promise<ZoneGroup> {
    const groupId =
      group.id ||
      `group-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36)}`;
    const sanitizedGroup: ZoneGroup = {
      ...group,
      id: groupId,
      updatedAt: new Date().toISOString(),
      createdAt: group.createdAt || new Date().toISOString(),
    };

    if (this.isConfigured && this.db) {
      try {
        const groupRef = doc(this.db, 'zoneGroups', groupId);
        const payload = sanitizePayload(sanitizedGroup);
        await setDoc(groupRef, payload, { merge: true });
      } catch (err) {
        console.warn('[ZoneService] Firestore saveZoneGroup error, saving to cache:', err);
      }
    }

    const current = this.getCachedZoneGroups();
    const existingIndex = current.findIndex((g) => g.id === groupId);
    let updated: ZoneGroup[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = sanitizedGroup;
    } else {
      updated = [sanitizedGroup, ...current];
    }
    this.setCachedZoneGroups(updated);
    return sanitizedGroup;
  }

  public async deleteZoneGroup(groupId: string): Promise<void> {
    if (this.isConfigured && this.db) {
      try {
        const groupRef = doc(this.db, 'zoneGroups', groupId);
        await deleteDoc(groupRef);
      } catch (err) {
        console.warn('[ZoneService] Firestore deleteZoneGroup error:', err);
      }
    }

    const current = this.getCachedZoneGroups();
    const updated = current.filter((g) => g.id !== groupId);
    this.setCachedZoneGroups(updated);
  }

  public async resetZoneGroupsToDefaults(): Promise<ZoneGroup[]> {
    this.setCachedZoneGroups(DEFAULT_ZONE_GROUPS);
    if (this.isConfigured && this.db) {
      try {
        for (const grp of DEFAULT_ZONE_GROUPS) {
          const groupRef = doc(this.db, 'zoneGroups', grp.id);
          await setDoc(groupRef, sanitizePayload(grp), { merge: true });
        }
      } catch (err) {
        console.warn('[ZoneService] Reset zone groups error:', err);
      }
    }
    return DEFAULT_ZONE_GROUPS;
  }

  // ==========================================================================
  // Location Collections API (/locationCollections)
  // ==========================================================================

  public async getLocationCollections(): Promise<LocationCollection[]> {
    if (this.isConfigured && this.db) {
      try {
        const collsRef = collection(this.db, 'locationCollections');
        const snapshot = await getDocs(collsRef);
        if (!snapshot.empty) {
          const colls: LocationCollection[] = [];
          snapshot.forEach((docSnap) => {
            colls.push({ id: docSnap.id, ...(docSnap.data() as Omit<LocationCollection, 'id'>) });
          });
          this.setCachedLocationCollections(colls);
          return colls;
        }
      } catch (err) {
        console.warn('[ZoneService] Firestore getLocationCollections error, using cache:', err);
      }
    }
    return this.getCachedLocationCollections();
  }

  public subscribeToLocationCollections(
    onUpdate: (collections: LocationCollection[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (this.isConfigured && this.db) {
      try {
        const collsRef = collection(this.db, 'locationCollections');
        const q = query(collsRef);
        return onSnapshot(
          q,
          (snapshot) => {
            const colls: LocationCollection[] = [];
            snapshot.forEach((docSnap) => {
              colls.push({ id: docSnap.id, ...(docSnap.data() as Omit<LocationCollection, 'id'>) });
            });
            if (colls.length > 0) {
              this.setCachedLocationCollections(colls);
              onUpdate(colls);
            } else {
              onUpdate(this.getCachedLocationCollections());
            }
          },
          (err) => {
            console.warn('[ZoneService] onSnapshot locationCollections error:', err);
            onUpdate(this.getCachedLocationCollections());
            if (onError) onError(err);
          }
        );
      } catch (err) {
        console.warn('[ZoneService] subscribeToLocationCollections fallback:', err);
      }
    }

    onUpdate(this.getCachedLocationCollections());
    return () => {};
  }

  public async saveLocationCollection(
    coll: LocationCollection
  ): Promise<LocationCollection> {
    const collId =
      coll.id ||
      `collection-${coll.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36)}`;
    const sanitizedColl: LocationCollection = {
      ...coll,
      id: collId,
      updatedAt: new Date().toISOString(),
      createdAt: coll.createdAt || new Date().toISOString(),
    };

    if (this.isConfigured && this.db) {
      try {
        const collRef = doc(this.db, 'locationCollections', collId);
        const payload = sanitizePayload(sanitizedColl);
        await setDoc(collRef, payload, { merge: true });
      } catch (err) {
        console.warn('[ZoneService] Firestore saveLocationCollection error, saving to cache:', err);
      }
    }

    const current = this.getCachedLocationCollections();
    const existingIndex = current.findIndex((c) => c.id === collId);
    let updated: LocationCollection[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = sanitizedColl;
    } else {
      updated = [sanitizedColl, ...current];
    }
    this.setCachedLocationCollections(updated);
    return sanitizedColl;
  }

  public async deleteLocationCollection(collId: string): Promise<void> {
    if (this.isConfigured && this.db) {
      try {
        const collRef = doc(this.db, 'locationCollections', collId);
        await deleteDoc(collRef);
      } catch (err) {
        console.warn('[ZoneService] Firestore deleteLocationCollection error:', err);
      }
    }

    const current = this.getCachedLocationCollections();
    const updated = current.filter((c) => c.id !== collId);
    this.setCachedLocationCollections(updated);
  }

  public async resetLocationCollectionsToDefaults(): Promise<LocationCollection[]> {
    this.setCachedLocationCollections(DEFAULT_LOCATION_COLLECTIONS);
    if (this.isConfigured && this.db) {
      try {
        for (const col of DEFAULT_LOCATION_COLLECTIONS) {
          const colRef = doc(this.db, 'locationCollections', col.id);
          await setDoc(colRef, sanitizePayload(col), { merge: true });
        }
      } catch (err) {
        console.warn('[ZoneService] Reset location collections error:', err);
      }
    }
    return DEFAULT_LOCATION_COLLECTIONS;
  }
}

let zoneServiceInstance: ZoneService | null = null;

export function getZoneService(): ZoneService {
  if (!zoneServiceInstance) {
    zoneServiceInstance = new ZoneService();
  }
  return zoneServiceInstance;
}
