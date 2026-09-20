/**
 * Unified Tariff Engine Types
 * 
 * Defines self-contained Tariff Profiles combining Taximeter Step Brackets,
 * Intermediate Distance Increments, Flat Corridors, Inheritance, and Extras into single containers.
 */

export interface TariffCorridor {
  id: string;
  name: string;
  fromZoneId?: string;
  fromLocationCollectionId?: string;
  toZoneId?: string;
  toLocationCollectionId?: string;
  flatPrice: number;
  allowReturn?: boolean; // When true, corridor also applies in reverse (To ➔ From)
  priorityRank?: number;
}

export interface TariffDistanceIncrement {
  id: string;
  name?: string;
  upToDistance: number; // e.g. 10.0 mi (from previous limit up to this limit)
  stepDistance: number; // e.g. 0.1 mi (176 yards)
  ratePerStep: number;  // e.g. $0.245
}

export interface TariffTaximeterRate {
  startPrice: number; // Flag drop start price ($)
  initialDistanceIncluded: number; // e.g. 0 or 1.5 mi
  initialTimeIncluded: number; // e.g. 0 min
  primaryDistanceStep: number; // e.g. 0.1 mi (or 176 yards in Imperial)
  primaryDistanceRate: number; // e.g. $0.255 per 0.1 mi = $2.55/mi
  primaryDistanceLimit: number; // e.g. 20.0 mi (35200 yards)
  intermediateIncrements?: TariffDistanceIncrement[]; // Increments between primary limit and then rate
  thenDistanceStep: number; // e.g. 0.1 mi
  thenDistanceRate: number; // e.g. $0.230 per 0.1 mi = $2.30/mi (open-ended after last limit)
  freeTrafficMinutes: number; // e.g. 5.0 min (traffic delay allowance)
  waitingRatePerStep: number; // e.g. $0.60 per interval
  waitingStepSeconds: number; // e.g. 90 sec
  minimumPrice: number; // e.g. $15.00 or $28.00 floor
}

export interface TariffExtras {
  carSeatFeePerUnit: number; // $ per child safety seat (e.g. $5.00)
  passengerBaseAllowance: number; // Base headcount included (e.g. 2 passengers)
  extraPassengerFeePerHead: number; // Fee per headcount above allowance (e.g. $3.00)
  vehicleTierMultipliers?: Record<string, number>;
  customSurcharges?: Array<{
    id: string;
    name: string;
    amount: number;
    type: 'flat' | 'percent';
  }>;
}

export interface TariffInheritanceConfig {
  parentTariffId?: string;
  overrideTaximeter?: boolean;
  overrideCorridors?: boolean;
  overrideExtras?: boolean;
  overrideTriggers?: boolean;
}

export interface TariffGroup {
  id: string;
  name: string;
  description?: string;
  tariffIds: string[];
  priority?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type TariffRateModel = 'taximeter' | 'zip_matrix' | 'hourly' | 'corridor';

export interface ZipRateMatrixEntry {
  id?: string; // e.g. "zip-63005"
  zip: string; // "63005"
  city: string; // "Chesterfield"
  car: number; // Driver base fare e.g. 12.00
  tip: number; // Agreed tip e.g. 2.50
  total: number; // Car + Tip e.g. 14.50
  customerCharge: number; // Invoiced Customer Charge e.g. 17.00
  driverPay?: number; // Driver payout (defaults to customerCharge)
  notes?: string;
}

export interface HourlyRateConfig {
  ratePerHour: number; // e.g. 75.00
  minimumHours: number; // e.g. 2 hours
  includedMilesPerHour?: number; // e.g. 20 mi/hr included
  excessMileageRate?: number; // e.g. $2.50/mi after included miles
}

export interface TariffProfile {
  id: string;
  name: string; // e.g. "Airport Flat Rate", "Point-to-Point METER", "Smoke House Agreed Rates", "Hourly Charter"
  description?: string;
  currency: string; // "USD"
  units: 'imperial' | 'metric';

  fareIncrement?: number; // e.g. 0.10 or 2.50
  priority: number; // 1 to 100 (higher evaluated first)
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  isDefault?: boolean;
  groupId?: string; // Group this tariff belongs to
  parentTariffId?: string; // Parent tariff to inherit from
  inheritance?: TariffInheritanceConfig;

  // Rate Model
  rateModel?: TariffRateModel; // 'taximeter' | 'zip_matrix' | 'hourly' | 'corridor'

  // Surcharge & Protection Policies
  allowSurgeMultiplier?: boolean; // When false, surge multipliers (e.g. 1.25x) are locked out
  allowOperationalSurcharges?: boolean; // When false, airport/toll surcharges are excluded

  triggers: {
    vehicleTiers?: string[]; // Legacy tiers
    vehicleTypes?: string[]; // e.g. ['sedan', 'suv', 'minivan', 'van', 'wheelchair_wav']
    vehicleClasses?: string[]; // e.g. ['standard', 'executive', 'xl', 'medical', 'delivery']
    accountIds?: string[]; // e.g. ['corp-smoke-house']
    zoneIds?: string[];
    zoneGroupIds?: string[];
    locationCollectionIds?: string[];
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    timeWindows?: Array<{ start: string; end: string }>; // "HH:MM" 24h
  };

  taximeter: TariffTaximeterRate;
  corridors: TariffCorridor[];


  extras: TariffExtras;

  // Optional rate-model specific payloads
  zipMatrix?: ZipRateMatrixEntry[];
  zipMatrixRates?: ZipRateMatrixEntry[]; // alias
  hourlyConfig?: HourlyRateConfig;
  hourlyRate?: HourlyRateConfig; // alias
  taximeterRate?: TariffTaximeterRate; // alias
  eligibleVehicleTypes?: string[];
  eligibleVehicleClasses?: string[];

  createdAt?: string;
  updatedAt?: string;
}


