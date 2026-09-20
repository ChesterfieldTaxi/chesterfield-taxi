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

export interface CanonicalConsolidationPlace {
  name: string;
  address: string;
  placeId?: string;
  coordinates: ZoneCoordinate;
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
  consolidateInAutocomplete?: boolean; // When true, consolidates multi-terminal suggestions into single canonical place
  canonicalPlace?: CanonicalConsolidationPlace;
  suppressKeywords?: string[];
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

// ============================================================================
// UNIFIED OPERATIONAL ZONES (Polygons, Radii, POIs, Zip Codes)
// ============================================================================

export interface UnifiedZonePoi {
  id: string;
  name: string; // e.g. "Terminal 1 Gate 4", "Main Entrance"
  address: string;
  coordinates: ZoneCoordinate;
  proximityRadiusMiles?: number; // Default 0.25 mi buffer
}

export interface UnifiedZonePolygon {
  id: string;
  name?: string;
  vertices: ZoneCoordinate[];
}

export interface UnifiedZoneRadius {
  id: string;
  center: ZoneCoordinate;
  radiusMiles: number;
}

export interface UnifiedZoneGeometries {
  polygons?: UnifiedZonePolygon[];
  radii?: UnifiedZoneRadius[];
  pois?: UnifiedZonePoi[];
  zipCodes?: string[];
}

export interface UnifiedZone {
  id: string; // e.g. "zone-lambert-airport"
  name: string; // e.g. "Lambert International Airport"
  category: 'airport' | 'commercial' | 'residential' | 'venue' | 'restricted' | 'other';
  color: string; // Hex color e.g. "#f59e0b"
  isActive: boolean;
  isArchived?: boolean;
  groupId?: string; // e.g. "group-airports"

  geometries: UnifiedZoneGeometries;

  pricing?: {
    flatFee?: number; // e.g. $4.00 Airport Gate Access Fee
    surchargeMultiplier?: number; // e.g. 1.10 (+10% remote fee)
  };

  restriction?: {
    isRestricted: boolean;
    restrictionType: 'BLOCK' | 'REQUIRE_DISPATCH_CONFIRMATION';
    reason?: string;
  };

  createdAt?: string;
  updatedAt?: string;
}

export interface UnifiedZoneGroup {
  id: string; // e.g. "group-airports"
  name: string; // e.g. "Airports"
  description?: string;
  zoneIds: string[]; // e.g. ["zone-lambert-airport", "zone-spirit-airport"]
  color: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

