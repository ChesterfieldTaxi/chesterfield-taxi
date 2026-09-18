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
  isOpenEnded?: boolean; // When true, tier applies to all miles >= startMiles without an upper ceiling
}

export interface DelayRateConfig {
  stepSeconds: number; // e.g. 90 sec
  ratePerStep: number; // e.g. $0.60
  gracePeriodMinutes: number; // e.g. 5 min
  isOpenEnded?: boolean; // When true, delay step calculation applies indefinitely after grace period
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
  fromZoneId?: string; // Origin Zone for Corridor rules
  toZoneId?: string; // Destination Zone for Corridor rules
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
  // Explicit inheritance override toggles
  overrideBaseFare?: boolean;
  overrideRates?: boolean;
  overrideSurcharges?: boolean;
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
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
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
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  groundedReason?: string;
}

export interface CustomerBookingConfig {
  allowMultiVehicle: boolean;
  maxVehiclesAllowed: number;
  multiVehicleCallPhone?: string;
  multiVehicleCallEmail?: string;
  multiVehicleCustomNote?: string;
  allowImmediateAsap: boolean;
  minAdvanceNoticeMinutes: number;
  maxAdvanceBookingDays?: number; // e.g. 90 days
  asapSearchRadiusMiles?: number; // e.g. 25 miles
  requireFlightNumberForAirport: boolean;
  airportMeetAndGreetOptions?: 'curbside' | 'baggage_claim' | 'both';
  flightDelayGraceMinutes?: number; // e.g. 45 min
  allowRoundTrip: boolean;
  roundTripDiscountPercent?: number; // e.g. 5%
  allowChildSafetySeats: boolean;
  carSeatRentalFeePerUnit?: number; // e.g. $10
  maxChildSeatsAllowed?: number; // e.g. 4
  freeCancellationWindowMinutes?: number; // e.g. 120 min
  lateCancellationFeePercent?: number; // e.g. 25%
  noShowFeeAmount?: number; // e.g. $50
  cardPreAuthThresholdAmount?: number; // e.g. $100 requires card on file
  acceptedPaymentMethods: Array<'card' | 'cash' | 'account'>;
  allowDriverNotes?: boolean;
  allowPetRequest?: boolean;
  allowWheelchairRequest?: boolean;
  allowLuggageSpecialRequest?: boolean;
  publicFormBanner?: {
    enabled: boolean;
    text: string;
    type: 'info' | 'warning' | 'alert';
  };
}

export interface PoHistoryRecord {
  poNumber: string;
  generatedAt: string;
  rotatedAt: string;
  rotatedBy?: string;
  reason?: string;
}

export interface CorporateAccountConfig {
  id: string;
  companyName: string;
  accountNumber: string;
  billingCycle: 'net15' | 'net30' | 'net60' | 'immediate';
  creditLimit: number;
  billingContactName: string;
  billingContactEmail: string;
  billingContactPhone?: string;
  discountPercent: number;
  poRequired: boolean;
  isActive: boolean;
  authorizedBookers?: string[];
  notes?: string;
  createdAt?: string;

  // Extended PO Anti-Fraud & Lifecycle Management
  currentPoNumber?: string;
  poGeneratedAt?: string;
  poExpiresAt?: string;
  poNumberHistory?: PoHistoryRecord[];
  billingAddress?: string;
  taxId?: string;
  updatedAt?: string;
}


export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  corporateAccountId?: string;
  customerName: string;
  customerEmail: string;
  tripIds: string[];
  totalAmount: number;
  status: 'draft' | 'issued' | 'paid' | 'overdue';
  dueDate: string;
  issuedDate: string;
  paidDate?: string;
  lineItems: Array<{ description: string; amount: number }>;
  notes?: string;
}

export interface SecurityControlsConfig {
  sessionTimeoutMinutes: number; // e.g. 60
  require2FA: boolean;
  enableIpAllowlist?: boolean;
  allowedIpRanges?: string[];
  maxFailedLoginAttempts: number; // e.g. 5
  passwordExpiryDays: number; // e.g. 90
  requireSpecialChars: boolean;
  auditLoggingEnabled: boolean;
}

export interface ConfigAuditEntry {
  id: string;
  timestamp: string;
  operatorId: string;
  operatorEmail: string;
  tab: string;
  section: string;
  action: string;
  ipAddress: string;
  changes?: Record<string, { before: any; after: any }>;
}

export interface FleetAlertsConfig {
  autoDismissMinutes?: number; // default: 60 (1 hour)
}

export interface TelephonyIntegrationConfig {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  status?: 'idle' | 'checking' | 'connected' | 'error';
  statusMessage?: string;
  updatedAt?: string;
}

export interface PaymentGatewaysConfig {
  stripe?: {
    mode: 'test' | 'live';
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string;
    status?: 'idle' | 'checking' | 'connected' | 'error';
  };
  square?: {
    applicationId: string;
    accessToken: string;
    locationId: string;
    status?: 'idle' | 'checking' | 'connected' | 'error';
  };
}

export interface IntegrationsConfig {
  telephony?: TelephonyIntegrationConfig;
  payments?: PaymentGatewaysConfig;
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
  corporateAccounts?: CorporateAccountConfig[];
  invoices?: InvoiceRecord[];
  securityControls?: SecurityControlsConfig;
  configAuditTrail?: ConfigAuditEntry[];
  fleetAlertsConfig?: FleetAlertsConfig;
  tariffs?: import('./tariff').TariffProfile[]; // Unified Tariff Profiles
  tariffGroups?: import('./tariff').TariffGroup[]; // Tariff Groups
  bookingRulesConfig?: import('../services/bookingRulesEngine').BookingRulesConfig;
  integrations?: IntegrationsConfig;
  constructionMode?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export * from './tariff';

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
