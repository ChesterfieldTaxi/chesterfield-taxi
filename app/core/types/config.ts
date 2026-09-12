/**
 * Application Settings & Configuration Data Models
 * 
 * Defines the Firestore document structure under `config/appSettings`:
 * - company: name, phone, email, address
 * - branding: primaryColor, secondaryColor, logoUrl
 * - pricing: baseFare, perMileRate, airportFee, surgeMultiplier (plus optional perMinuteRate, minimumFare)
 * - vehicles: array of editable vehicle tiers (id, name, baseMultiplier, maxPassengers, maxLuggage)
 */

export interface CompanyConfig {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

export interface DynamicPricingConfig {
  baseFare: number;
  perMileRate: number;
  airportFee: number;
  surgeMultiplier: number;
  perMinuteRate?: number;
  minimumFare?: number;
  multiStopFee?: number;
  defaultTolls?: number;
}

export interface VehicleTierConfig {
  id: string; // e.g., 'standard', 'premium', 'xl', 'wheelchair', or custom
  name: string;
  baseMultiplier: number;
  maxPassengers: number;
  maxLuggage: number;
  description?: string;
  badge?: string;
  iconType?: 'standard' | 'premium' | 'xl' | 'wheelchair';
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  description: string;
  cost?: number;
  odometer?: number;
  performedBy?: string;
}

export interface FleetCarConfig {
  id: string; // e.g. 'car-101'
  unitNumber: string; // e.g. 'Cab #101'
  vehicleTypeId: string; // references VehicleTierConfig.id (e.g. 'standard', 'xl')
  make: string; // e.g. 'Toyota'
  model: string; // e.g. 'Camry'
  year: number; // e.g. 2023
  color: string; // e.g. 'Silver'
  licensePlate: string; // e.g. 'MO-7TX91'
  vin: string; // e.g. '1G1YY22U7H510...'
  assignedDriverId?: string; // e.g. 'driver-101'
  assignedDriverName?: string;
  insurancePolicy?: string;
  insuranceExpiry?: string;
  mileage: number; // e.g. 45210
  status: 'active' | 'maintenance' | 'out_of_service' | 'inspecting';
  maintenanceHistory?: MaintenanceRecord[];
}

export interface AppSettings {
  company: CompanyConfig;
  branding: BrandingConfig;
  pricing: DynamicPricingConfig;
  vehicles: VehicleTierConfig[]; // Vehicle Types (tiers/classes)
  fleet?: FleetCarConfig[]; // Physical Fleet Cars
  publicFormVersion?: 'v1' | 'v2';
  updatedAt?: string;
  updatedBy?: string;
}

export interface IAdminConfigService {
  /**
   * Retrieves the current app settings, hydrating from Firestore or falling back to defaults.
   */
  getSettings(): Promise<AppSettings>;

  /**
   * Updates partial or full app settings in Firestore config/appSettings.
   */
  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings>;

  /**
   * Optional subscription for real-time app settings updates.
   */
  subscribeToSettings?(
    onUpdate: (settings: AppSettings) => void,
    onError?: (error: Error) => void
  ): () => void;

  /**
   * Resets configuration back to platform defaults.
   */
  resetToDefaults?(): Promise<AppSettings>;
}
