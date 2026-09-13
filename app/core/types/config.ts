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

export interface LocalizationConfig {
  currency: string; // e.g. "USD"
  currencySymbol: string; // e.g. "$"
  timezone: string; // e.g. "America/Chicago"
  timeFormat: '12h' | '24h';
  dateFormat: string; // e.g. "MM/DD/YYYY"
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  headingFont?: string; // e.g. 'Inter', 'Outfit', 'Cinzel', 'Playfair Display', 'Plus Jakarta Sans', 'System UI'
  bodyFont?: string; // e.g. 'Inter', 'Roboto', 'Open Sans', 'Lato', 'System UI'
  headingColor?: string;
  bodyTextColor?: string;
  mutedTextColor?: string;
  btnPrimaryBg?: string;
  btnPrimaryText?: string;
  btnSecondaryBg?: string;
  btnSecondaryText?: string;
  btnBorderRadius?: string; // e.g. '0px', '4px', '8px', '12px', '16px', '9999px'
  navbarBg?: string;
  cardBg?: string;
}

export interface StepIncrementTier {
  id: string;
  name: string;
  startMiles: number;
  endMiles: number;
  stepMiles: number; // e.g. 0.1
  ratePerStep: number; // e.g. 0.35
}

export interface DelayRateConfig {
  stepSeconds: number; // e.g. 90 sec
  ratePerStep: number; // e.g. $0.60
  gracePeriodMinutes: number; // e.g. 5 min
}

export interface ConditionSurchargeConfig {
  carSeatFeePerUnit: number; // $ per child safety seat
  passengerBaseAllowance: number; // e.g. 2 passengers included
  extraPassengerFeePerHead: number; // $ per passenger over base allowance
  vehicleTierSurcharges?: Record<string, { flat: number; percent: number }>;
  zoneSurcharges?: Record<string, { flat: number; percent: number }>;
}

export interface RuleEquipmentFilter {
  minCarSeats?: number;
  minLuggage?: number;
}

export interface RulePassengerFilter {
  min?: number;
  max?: number;
}

export interface PricingRuleTrigger {
  zoneIds?: string[];
  zoneGroupIds?: string[];
  locationCollectionIds?: string[];
  minDistanceMiles?: number;
  maxDistanceMiles?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  daysOfWeek?: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  timeWindows?: Array<{ start: string; end: string }>; // "HH:MM" 24h
  holidayDates?: string[]; // "YYYY-MM-DD"
  accountTypes?: Array<'retail' | 'corporate' | 'vip'>;
  accountTags?: string[];
  vehicleTiers?: string[]; // e.g. 'standard', 'premium', 'xl', 'wheelchair'
  equipment?: RuleEquipmentFilter;
  passengers?: RulePassengerFilter;
}

export interface RuleSurchargeAdder {
  id?: string;
  name: string;
  amount: number;
  type: 'flat' | 'percent';
}

export interface PricingRuleModifier {
  type: 'flat_override' | 'multiplier' | 'surcharge_flat' | 'surcharge_percent' | 'base_override';
  value: number;
  // Phase 20 Delta & Base Overrides
  baseFareOverride?: number;
  perMileRateOverride?: number;
  perMinuteRateOverride?: number;
  surchargeAdders?: RuleSurchargeAdder[];
}

export interface NamedPricingRule {
  id: string;
  name: string;
  description?: string;
  parentRuleId?: string; // Rule Inheritance: Inherits base parameters from parent rule
  priority: number; // 1 to 100, higher number = evaluated first
  isActive: boolean;
  stopProcessingOnMatch?: boolean; // When true, halts subsequent rule evaluations upon match
  allowDriverSelection: boolean;
  triggers: PricingRuleTrigger;
  modifier: PricingRuleModifier;
  createdAt?: string;
  updatedAt?: string;
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
  // Phase 19: Condition-Based & Incremental Rates
  flagDropIncludedMiles?: number; // e.g. 1.5 miles included in baseFare
  useStepIncrements?: boolean;
  stepIncrementTiers?: StepIncrementTier[];
  delayRate?: DelayRateConfig;
  conditionSurcharges?: ConditionSurchargeConfig;
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

export interface CustomerBookingConfig {
  allowMultiVehicle: boolean;
  maxVehiclesAllowed: number;
  multiVehicleCallPhone?: string;
  multiVehicleCallEmail?: string;
  multiVehicleCustomNote?: string;
  allowImmediateAsap: boolean;
  minAdvanceNoticeMinutes: number;
  requireFlightNumberForAirport: boolean;
  allowRoundTrip: boolean;
  allowChildSafetySeats: boolean;
  acceptedPaymentMethods: Array<'card' | 'cash' | 'account'>;
}

export interface AppSettings {
  company: CompanyConfig;
  branding: BrandingConfig;
  pricing: DynamicPricingConfig;
  vehicles: VehicleTierConfig[]; // Vehicle Types (tiers/classes)
  fleet?: FleetCarConfig[]; // Physical Fleet Cars
  localization?: LocalizationConfig;
  publicFormVersion?: 'v1' | 'v2';
  customerBookingConfig?: CustomerBookingConfig;
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
