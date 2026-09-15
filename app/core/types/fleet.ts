/**
 * Physical Fleet Asset Firestore Schema & TypeScript Definitions
 * 
 * Represents concrete operational vehicles stored in Firestore collection `/fleet`.
 */

import type { MaintenanceRecord } from './config';

export type FleetAssetStatus = 'active' | 'maintenance' | 'out_of_service' | 'inspecting';

export interface PhysicalFleetAsset {
  id: string;
  unitNumber: string; // e.g. "Cab #101", "204"
  vehicleTypeId: string; // references VehicleTierConfig.id (e.g. 'standard', 'suv', 'van', 'wheelchair')
  make: string; // e.g. "Toyota"
  model: string; // e.g. "Camry"
  year: number; // e.g. 2023
  color: string; // e.g. "Silver"
  licensePlate: string; // e.g. "MO-7TX91"
  vin: string; // e.g. "1G1YY22U7H510..."
  insurancePolicy?: string; // e.g. "StateFarm #9821-POL"
  insuranceExpiry?: string; // ISO date string e.g. "2026-12-31"
  mileage: number; // current odometer reading
  status: FleetAssetStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  maintenanceHistory?: MaintenanceRecord[];
  createdAt?: string;
  updatedAt?: string;

  /** Universal Governance & Scoring (Phase 29) */
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;
}
