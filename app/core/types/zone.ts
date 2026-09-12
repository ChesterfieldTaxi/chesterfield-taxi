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
  createdAt?: string;
  updatedAt?: string;
}
