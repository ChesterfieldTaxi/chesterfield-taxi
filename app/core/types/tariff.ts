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

export interface TariffProfile {
  id: string;
  name: string; // e.g. "Standard Flat Rate", "MiniVan Flat Rate", "METER", "MiniVan METER"
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
  triggers: {
    vehicleTiers?: string[]; // e.g. ['standard'], ['suv'], ['xl'], ['wheelchair']
    zoneIds?: string[];
    zoneGroupIds?: string[];
    locationCollectionIds?: string[];
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    timeWindows?: Array<{ start: string; end: string }>; // "HH:MM" 24h
  };
  taximeter: TariffTaximeterRate;
  corridors: TariffCorridor[];
  extras: TariffExtras;
  createdAt?: string;
  updatedAt?: string;
}

