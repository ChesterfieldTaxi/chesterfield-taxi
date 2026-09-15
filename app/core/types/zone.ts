/**
 * Operational Zone Geofence Firestore Schema & TypeScript Definitions
 * 
 * Represents named regional geofences (e.g. Chesterfield Valley, Lambert Airport STL)
 * stored in Firestore collection `/zones`.
 */

export type ZoneType = 'radius' | 'polygon';

export interface ZoneCoordinate {
  lat: number;
  lng: number;
}

export interface ZoneGeofence {
  id: string; // e.g. "zone-chesterfield-valley"
  name: string; // e.g. "Chesterfield Valley Core"
  description?: string;
  type: ZoneType;
  // Radius-based zone parameters
  center?: ZoneCoordinate;
  radiusMiles?: number;
  // Polygon-based zone parameters (ordered sequence of coordinates)
  vertices?: ZoneCoordinate[];
  // Display & pricing attributes
  color: string; // Hex color string, e.g. "#3b82f6"
  surchargeMultiplier?: number; // e.g. 1.15 (+15%)
  flatFee?: number; // e.g. 5.00 ($5 surcharge or zone fee)
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Zone Group Schema
 * 
 * Groups multiple individual geofences (radii and polygons) into named
 * operational clusters (e.g. "Metro West Corridor", "Regional Aviation Hubs").
 * Stored in Firestore collection `/zoneGroups`.
 */
export interface ZoneGroup {
  id: string; // e.g. "group-metro-west"
  name: string; // e.g. "Metro West Corridor"
  description?: string;
  zoneIds: string[]; // references ZoneGeofence.id
  color: string; // Hex color string, e.g. "#6366f1"
  surchargeMultiplier?: number; // e.g. 1.05 (+5%)
  flatFee?: number; // e.g. 2.50 ($2.50 cluster surcharge)
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Named Location Collection Schema
 * 
 * Represents curated Point-of-Interest (POI) markers and address lists
 * (e.g. Airports, Venues, Train Stations).
 * Stored in Firestore collection `/locationCollections`.
 */
export type LocationCategory =
  | 'airport'
  | 'venue'
  | 'train_station'
  | 'hotel'
  | 'hospital'
  | 'corporate'
  | 'other';

export interface LocationPoint {
  id: string; // e.g. "poi-stl-t1"
  name: string; // e.g. "Lambert International Terminal 1"
  address: string;
  coordinates: ZoneCoordinate;
  category?: LocationCategory;
  flatFee?: number; // e.g. gate fee or pickup surcharge
  notes?: string;
  isArchived?: boolean;
}

export interface LocationCollection {
  id: string; // e.g. "collection-regional-airports"
  name: string; // e.g. "Regional Aviation Hubs"
  description?: string;
  category?: string;
  locations: LocationPoint[];
  flatFee?: number; // Surcharge applied if pickup/dropoff matches this collection
  surchargeMultiplier?: number;
  proximityRadiusMiles?: number; // Detection tolerance in miles, default 0.5 mi
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Blacklisted Location Schema
 * 
 * Represents an address, POI, or radius area where pickups/dropoffs are
 * either explicitly blocked or flagged for review.
 * Stored in Firestore collection `/blacklistedLocations`.
 */
export type BlacklistedLocationAction = 'BLACKLIST_BLOCK' | 'REQUIRE_REVIEW';

export interface BlacklistedLocation {
  id: string; // e.g. "bl-safety-hazard-1"
  name: string; // e.g. "Abandoned Factory Site"
  reasonCode: string; // e.g. "Safety Hazard", "Restricted Private Property"
  action: BlacklistedLocationAction;
  
  // Spatial definitions (could be point+radius)
  coordinates: ZoneCoordinate;
  radiusMiles: number;
  
  isActive: boolean;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
