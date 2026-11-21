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

export type VehicleType = 'sedan' | 'suv' | 'minivan' | 'van' | 'wheelchair_wav' | (string & {});
export type VehicleClass = 'standard' | 'executive' | 'xl' | 'medical' | 'delivery' | (string & {});

export interface OversizedBagCategory {
  id: string;
  label: string;
  fee: number;
  requiresUpgrade: boolean;
  maxCount: number;
}

export const DEFAULT_OVERSIZED_BAG_CATEGORIES: OversizedBagCategory[] = [
  { id: 'golf_bag', label: 'Golf Clubs / Bag', fee: 10, requiresUpgrade: true, maxCount: 4 },
  { id: 'skis', label: 'Skis / Snowboard Bag', fee: 15, requiresUpgrade: true, maxCount: 4 },
  { id: 'large_box', label: 'Large Cargo Box / Heavy Trunk', fee: 15, requiresUpgrade: true, maxCount: 4 },
  { id: 'folding_walker', label: 'Folding Walker / Mobility Cart', fee: 0, requiresUpgrade: false, maxCount: 2 },
  { id: 'bicycle_sports', label: 'Bicycle Box / Surfboard / Large Gear', fee: 25, requiresUpgrade: true, maxCount: 2 },
];

export interface UniversalExtrasConfig {
  carSeatFeePerUnit: number; // $10.00
  carSeatAutoUpgradeVehicleType?: boolean; // true -> forces SUV/Minivan
  oversizedBagsConfig?: OversizedBagCategory[];
  oversizedAutoUpgradeVehicleType?: boolean;
  passengerBaseAllowance: number; // 1 free
  extraPassengerFeePerHead: number; // $1.00
  intermediateStopFee: number; // $5.00
  intermediateStopFreeWaitingMinutes?: number; // 5 min
  curbWaitingGraceMinutes: number; // e.g. 5 or 10 min
  curbWaitingRatePerMinute: number; // e.g. $0.50
  pickupGraceMinutes?: number; // alias
  waitingRatePerMinute?: number; // alias
  petFee?: number;
  waiveCarSeatFee?: boolean;
  waiveExtraPaxFee?: boolean;
  customExtras?: Array<{
    id: string;
    name: string;
    fee: number;
    description?: string;
    isPerUnit?: boolean;
    isActive?: boolean;
    showOnBookingForm?: boolean;
  }>;
}

export type SurchargeDefaultPolicy = 'universal' | 'rule_only';
export type SurchargeCalcMode = 'flat' | 'per_mile' | 'percent' | 'multiplier';

export interface SurchargeCatalogItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean; // Master kill switch: false = never applies
  defaultPolicy: SurchargeDefaultPolicy; // 'universal' (Allow by default) | 'rule_only' (Deny by default)
  mode: SurchargeCalcMode;
  amount: number; // $ for flat/per_mile, % for percent, multiplier (e.g. 1.25) for multiplier
  isBuiltIn?: boolean;
  /** Legacy migration metadata (only used if pre-v2 Firestore doc has no matching Rule yet) */
  legacyAutoCondition?: {
    kind: 'airport' | 'remote_distance' | 'custom_triggers';
    remoteThresholdMiles?: number;
    airportZoneIds?: string[];
    customTriggers?: CustomSurchargeTrigger;
  };
}

export interface SurchargesConfig {
  /** Version 2 firewall catalog schema */
  catalogVersion?: number;
  items?: SurchargeCatalogItem[];

  // Legacy fields retained for lossless read-time migration & backward compatibility
  airportGateFee: number; // $4.00
  airportCommercialGateFee?: number; // alias
  airportTargetZoneIds?: string[]; // e.g. ['zone-lambert-airport', 'zone-spirit-airport']
  peakSurgeMultiplier: number; // e.g. 1.25
  isPeakSurgeActive?: boolean;
  outOfAreaRemoteFee: number; // $15.00
  remoteServiceFlatFee?: number; // alias
  outOfAreaThresholdMiles?: number; // 15.0 mi radius
  remoteBoundaryDistanceMiles?: number; // alias
  cancellationFeeWithinOneHour: number; // e.g. $15.00 or $28.00
  cancellationFee?: number; // alias
  cancellationWindowMinutes?: number; // 60 min
  noShowFee: number; // e.g. $28.00
  // Built-in Fuel / Gas Surcharge
  isFuelSurchargeActive?: boolean;
  fuelSurchargeType?: 'flat' | 'per_mile' | 'percent';
  fuelSurchargeAmount?: number; // e.g. $2.50 flat, $0.15/mi, or 5%
  fuelSurchargeApplicableTariffs?: string[];
  waiveFuelSurcharge?: boolean;
  airportFeeApplicableTariffs?: string[];
  surgeApplicableTariffs?: string[];
  remoteFeeApplicableTariffs?: string[];
  waiveAirportFee?: boolean;
  waiveRemoteFee?: boolean;
  customSurcharges?: CustomSurchargeItem[];
}

export interface CustomSurchargeTrigger {
  vehicleTiers?: string[];
  vehicleTypes?: string[];
  vehicleClasses?: string[];
  minDistanceMiles?: number;
  maxDistanceMiles?: number;
  timeWindow?: {
    startHour: number;
    endHour: number;
  };
  daysOfWeek?: number[];
  zoneIds?: string[];
}

export interface CustomSurchargeItem {
  id: string;
  name: string;
  description?: string;
  amount: number;
  type: 'flat' | 'percent' | 'per_mile';
  isActive: boolean;
  applicableTariffIds?: string[];
  applicableRateIds?: string[];
  applicableVehicleTypes?: string[];
  applicableVehicleClasses?: string[];
  triggers?: CustomSurchargeTrigger;
}

export type RuleZoneMatchMode = 'any_end' | 'pickup_only' | 'dropoff_only' | 'corridor';

export interface PricingRuleTrigger {
  zoneMatchMode?: RuleZoneMatchMode;
  pickupZoneIds?: string[];
  dropoffZoneIds?: string[];
  isAirportOnly?: boolean;
  isHourlyBooking?: boolean;
  zoneIds?: string[];
  zoneGroupIds?: string[];
  locationCollectionIds?: string[];
  fromZoneId?: string; // Origin Zone for Corridor rules
  toZoneId?: string; // Destination Zone for Corridor rules
  isBidirectionalTransfer?: boolean; // When true, matches if Pickup OR Dropoff is in zoneIds/zoneGroupIds
  minDistanceMiles?: number;
  maxDistanceMiles?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  daysOfWeek?: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  timeWindows?: Array<{ start: string; end: string }>; // "HH:MM" 24h
  holidayDates?: string[]; // "YYYY-MM-DD"
  accountTypes?: Array<'retail' | 'corporate' | 'vip'>;
  accountTags?: string[];
  vehicleTiers?: string[]; // Legacy tiers
  vehicleTypes?: VehicleType[]; // 'sedan' | 'suv' | 'minivan' | 'van' | 'wheelchair_wav'
  vehicleClasses?: VehicleClass[]; // 'standard' | 'executive' | 'xl' | 'medical' | 'delivery'
  equipment?: RuleEquipmentFilter;
  passengers?: RulePassengerFilter;
}

export interface RuleSurchargeAdder {
  id?: string;
  name: string;
  amount: number;
  type: 'flat' | 'percent';
}

export interface RuleSurchargeAction {
  surchargeId: string;
  action: 'apply' | 'waive' | 'override';
  overrideAmount?: number;
  overrideMode?: SurchargeCalcMode;
}

export type RuleExtraTarget = 'car_seat' | 'extra_passenger' | 'intermediate_stop' | 'curb_wait';

export interface RuleExtraAction {
  extraKey: RuleExtraTarget;
  action: 'waive' | 'override';
  overrideAmount?: number;
}

export interface RuleFareAdjustment {
  type: 'flat_override' | 'discount_percent' | 'discount_flat' | 'multiplier';
  value: number;
}

export interface PricingRuleModifier {
  type: 'flat_override' | 'multiplier' | 'surcharge_flat' | 'surcharge_percent' | 'base_override' | 'apply_tariff';
  value: number;
  targetTariffId?: string; // Applied Rate Profile ID (e.g. Airport Flat Rate)
  /** Firewall-style per-surcharge directives (APPLY / WAIVE / OVERRIDE) */
  surchargeActions?: RuleSurchargeAction[];
  /** Per-extra directives (WAIVE / OVERRIDE) */
  extraActions?: RuleExtraAction[];
  /** Optional direct base-fare adjustment */
  fareAdjustment?: RuleFareAdjustment;
  baseFareOverride?: number;
  perMileRateOverride?: number;
  perMinuteRateOverride?: number;
  surchargeAdders?: RuleSurchargeAdder[];
  // Legacy overrules (translated automatically to extraActions / surchargeActions)
  overruleExtras?: Partial<UniversalExtrasConfig>;
  overruleSurcharges?: Partial<SurchargesConfig>;
  // Layering
  layerZoneFee?: number;
  excessMileageRate?: { thresholdMiles: number; ratePerMile: number };
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
  /** Default driver commission split (0.0 - 1.0, e.g. 0.75 = 75% driver / 25% company) */
  defaultDriverCommissionRate?: number;
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
  imageUrl?: string; // Optional vehicle photo / illustration URL
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
  imageUrl?: string; // Optional physical vehicle photo URL
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
  lambertPickupInstructions?: string; // Curbside door / baggage claim pickup instructions for STL Lambert Airport
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
  allowOversizedLuggage?: boolean;
  oversizedBags?: OversizedBagCategory[];
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


export interface InvoiceLineItemRecord {
  description: string;
  amount: number;
  tripId?: string;
  date?: string;
  passengerName?: string;
  pickupDropoff?: string;
  poNumber?: string;
  vehicleDisplayName?: string;
  authorizedBy?: string;
  baseFare?: number;
  gratuity?: number;
  tolls?: number;
  waitTimeFee?: number;
  discountAmount?: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  corporateAccountId?: string;
  accountNumber?: string;
  billingCycle?: 'net15' | 'net30' | 'net60' | 'immediate';
  customerName: string;
  customerEmail: string;
  tripIds: string[];
  subtotal?: number;
  discountAmount?: number;
  totalAmount: number;
  status: 'draft' | 'issued' | 'paid' | 'overdue';
  dueDate: string;
  issuedDate: string;
  paidDate?: string;
  lineItems: InvoiceLineItemRecord[];
  notes?: string;
}

export interface BillingSettingsConfig {
  autoEmailReceipts?: boolean;
  stripeTerminalEnabled?: boolean;
  passCardSurcharge?: boolean;
  surchargePercent?: number;
  remittanceBankName?: string;
  remittanceAccountName?: string;
  remittanceRoutingNumber?: string;
  remittanceAccountLast4?: string;
  usdotNumber?: string;
  taxId?: string;
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

export type DispatchRankingStrategy =
  | 'nearest_in_zone'
  | 'longest_idle_in_zone'
  | 'highest_driver_score';

export interface DispatchAutomationConfig {
  /** false = 1-tap dispatcher-initiated (default); true = auto-start cascade when a ride becomes CONFIRMED / ASAP pending */
  autoOfferOnConfirm: boolean;
  rankingStrategy: DispatchRankingStrategy;
  /** Seconds per cascade offer step (default 45, clamped 15–180s) */
  offerTimeoutSeconds: number;
  /** Maximum drivers offered sequentially per cascade (default 3, clamped 1–10) */
  maxCascadeAttempts: number;
  /** Minutes before scheduled pickup to enter SLA warning window (default 60) */
  slaWarningMinutes: number;
  /** Minutes before scheduled pickup to enter SLA critical window (default 30) */
  slaCriticalMinutes: number;
  /** Extra lead minutes added automatically when detectAirportInAddresses matches STL/SUS/CPS (default 15) */
  airportExtraLeadMinutes: number;
}

export const DEFAULT_DISPATCH_AUTOMATION_CONFIG: DispatchAutomationConfig = {
  autoOfferOnConfirm: false,
  rankingStrategy: 'nearest_in_zone',
  offerTimeoutSeconds: 45,
  maxCascadeAttempts: 3,
  slaWarningMinutes: 60,
  slaCriticalMinutes: 30,
  airportExtraLeadMinutes: 15,
};

export function normalizeDispatchAutomationConfig(
  raw?: Partial<DispatchAutomationConfig> | null
): DispatchAutomationConfig {
  const validStrategies: readonly DispatchRankingStrategy[] = [
    'nearest_in_zone',
    'longest_idle_in_zone',
    'highest_driver_score',
  ];
  const rankingStrategy: DispatchRankingStrategy =
    raw?.rankingStrategy && validStrategies.includes(raw.rankingStrategy)
      ? raw.rankingStrategy
      : DEFAULT_DISPATCH_AUTOMATION_CONFIG.rankingStrategy;

  const clampInt = (val: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  };

  const slaCriticalMinutes = clampInt(
    raw?.slaCriticalMinutes,
    DEFAULT_DISPATCH_AUTOMATION_CONFIG.slaCriticalMinutes,
    1,
    720
  );
  const rawWarning = clampInt(
    raw?.slaWarningMinutes,
    DEFAULT_DISPATCH_AUTOMATION_CONFIG.slaWarningMinutes,
    1,
    720
  );

  return {
    autoOfferOnConfirm: Boolean(
      raw?.autoOfferOnConfirm ?? DEFAULT_DISPATCH_AUTOMATION_CONFIG.autoOfferOnConfirm
    ),
    rankingStrategy,
    offerTimeoutSeconds: clampInt(
      raw?.offerTimeoutSeconds,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.offerTimeoutSeconds,
      15,
      180
    ),
    maxCascadeAttempts: clampInt(
      raw?.maxCascadeAttempts,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.maxCascadeAttempts,
      1,
      10
    ),
    slaWarningMinutes: Math.max(slaCriticalMinutes, rawWarning),
    slaCriticalMinutes,
    airportExtraLeadMinutes: clampInt(
      raw?.airportExtraLeadMinutes,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.airportExtraLeadMinutes,
      0,
      180
    ),
  };
}

export interface TelephonyIntegrationConfig {
  provider: 'twilio';
  accountSid: string;
  authToken?: string;
  phoneNumber: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  twimlAppSid?: string;
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
  billingSettings?: BillingSettingsConfig;
  securityControls?: SecurityControlsConfig;
  configAuditTrail?: ConfigAuditEntry[];
  fleetAlertsConfig?: FleetAlertsConfig;
  tariffs?: import('./tariff').TariffProfile[]; // Unified Tariff Profiles
  tariffGroups?: import('./tariff').TariffGroup[]; // Tariff Groups
  bookingRulesConfig?: import('../services/bookingRulesEngine').BookingRulesConfig;
  dispatchAutomation?: DispatchAutomationConfig;
  integrations?: IntegrationsConfig;
  constructionMode?: boolean;
  enableRealtimeRouting?: boolean;
  enableGetAppButtons?: boolean;
  cms?: Record<string, any>;
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
