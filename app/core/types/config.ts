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
  legalEntityName?: string; // e.g. 'Chesterfield Taxi LLC'
  dispatchEmail?: string; // e.g. 'dispatch@chesterfieldtaxi.com'
  operatingHoursLabel?: string; // e.g. 'Monday – Sunday: Open 24 Hours'
  is24x7?: boolean; // default true
  advanceBookingMaxDays?: number; // default 90
}

export type DistanceUnit = 'mi' | 'km';
export type SpeedUnit = 'mph' | 'kmh';
export type TemperatureUnit = 'F' | 'C';

export interface LocalizationConfig {
  currency: string; // e.g. "USD"
  currencySymbol: string; // e.g. "$"
  timezone: string; // e.g. "America/Chicago"
  timeFormat: '12h' | '24h';
  dateFormat: string; // e.g. "MM/DD/YYYY"
  distanceUnit?: DistanceUnit; // default 'mi'
  speedUnit?: SpeedUnit; // default 'mph'
  temperatureUnit?: TemperatureUnit; // default 'F'
  defaultServiceRegion?: string; // default 'Chesterfield & St. Louis Metro, MO'
}

export const DEFAULT_COMPANY_CONFIG_VALUES: Required<CompanyConfig> = {
  name: 'Chesterfield Taxi',
  legalEntityName: 'Chesterfield Taxi & Transportation LLC',
  phone: '(314) 738-0100',
  email: 'support@chesterfieldtaxi.com',
  dispatchEmail: 'dispatch@chesterfieldtaxi.com',
  address: '1814 Woodson Rd, Overland, MO 63114',
  operatingHoursLabel: 'Monday – Sunday: Open 24 Hours',
  is24x7: true,
  advanceBookingMaxDays: 90,
};

export const DEFAULT_LOCALIZATION_CONFIG: Required<LocalizationConfig> = {
  currency: 'USD',
  currencySymbol: '$',
  timezone: 'America/Chicago',
  timeFormat: '12h',
  dateFormat: 'MM/DD/YYYY',
  distanceUnit: 'mi',
  speedUnit: 'mph',
  temperatureUnit: 'F',
  defaultServiceRegion: 'Chesterfield & St. Louis Metro, MO',
};

export function normalizeCompanyConfig(
  raw?: Partial<CompanyConfig> | null
): Required<CompanyConfig> {
  const cleanStr = (val: unknown, fallback: string): string => {
    const trimmed = typeof val === 'string' ? val.trim() : '';
    return trimmed || fallback;
  };
  const name = cleanStr(raw?.name, DEFAULT_COMPANY_CONFIG_VALUES.name);
  const rawDays = typeof raw?.advanceBookingMaxDays === 'number'
    ? raw.advanceBookingMaxDays
    : Number(raw?.advanceBookingMaxDays);
  const advanceBookingMaxDays = Number.isFinite(rawDays) && rawDays > 0
    ? Math.min(365, Math.max(1, Math.round(rawDays)))
    : DEFAULT_COMPANY_CONFIG_VALUES.advanceBookingMaxDays;

  return {
    name,
    legalEntityName: cleanStr(
      raw?.legalEntityName,
      name === DEFAULT_COMPANY_CONFIG_VALUES.name
        ? DEFAULT_COMPANY_CONFIG_VALUES.legalEntityName
        : `${name} LLC`
    ),
    phone: cleanStr(raw?.phone, DEFAULT_COMPANY_CONFIG_VALUES.phone),
    email: cleanStr(raw?.email, DEFAULT_COMPANY_CONFIG_VALUES.email),
    dispatchEmail: cleanStr(raw?.dispatchEmail, DEFAULT_COMPANY_CONFIG_VALUES.dispatchEmail),
    address: cleanStr(raw?.address, DEFAULT_COMPANY_CONFIG_VALUES.address),
    operatingHoursLabel: cleanStr(
      raw?.operatingHoursLabel,
      DEFAULT_COMPANY_CONFIG_VALUES.operatingHoursLabel
    ),
    is24x7: raw?.is24x7 !== undefined ? Boolean(raw.is24x7) : true,
    advanceBookingMaxDays,
  };
}

export function resolveCurrencySymbol(currency: string): string {
  const upper = String(currency || 'USD').trim().toUpperCase();
  if (upper === 'EUR') return '€';
  if (upper === 'GBP') return '£';
  return '$';
}

export function normalizeLocalizationConfig(
  raw?: Partial<LocalizationConfig> | null
): Required<LocalizationConfig> {
  const cleanStr = (val: unknown, fallback: string): string => {
    const trimmed = typeof val === 'string' ? val.trim() : '';
    return trimmed || fallback;
  };
  const validCurrencies = new Set(['USD', 'CAD', 'EUR', 'GBP']);
  const rawCurrency = cleanStr(raw?.currency, DEFAULT_LOCALIZATION_CONFIG.currency).toUpperCase();
  const currency = validCurrencies.has(rawCurrency) ? rawCurrency : 'USD';
  const currencySymbol =
    raw?.currencySymbol && ['$', '€', '£'].includes(raw.currencySymbol)
      ? raw.currencySymbol
      : resolveCurrencySymbol(currency);

  const validDateFormats = new Set(['MM/DD/YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']);
  const dateFormat =
    raw?.dateFormat && validDateFormats.has(raw.dateFormat)
      ? raw.dateFormat
      : DEFAULT_LOCALIZATION_CONFIG.dateFormat;

  return {
    currency,
    currencySymbol,
    timezone: cleanStr(raw?.timezone, DEFAULT_LOCALIZATION_CONFIG.timezone),
    timeFormat: raw?.timeFormat === '24h' ? '24h' : '12h',
    dateFormat,
    distanceUnit: raw?.distanceUnit === 'km' ? 'km' : 'mi',
    speedUnit: raw?.speedUnit === 'kmh' ? 'kmh' : 'mph',
    temperatureUnit: raw?.temperatureUnit === 'C' ? 'C' : 'F',
    defaultServiceRegion: cleanStr(
      raw?.defaultServiceRegion,
      DEFAULT_LOCALIZATION_CONFIG.defaultServiceRegion
    ),
  };
}

export interface LocalizationSamplePreview {
  dateSample: string;
  timeSample: string;
  distanceSample: string;
  speedSample: string;
  temperatureSample: string;
  fareSample: string;
}

export function formatLocalizationPreviewSample(
  raw?: Partial<LocalizationConfig> | null
): LocalizationSamplePreview {
  const loc = normalizeLocalizationConfig(raw);
  const dateSample =
    loc.dateFormat === 'YYYY-MM-DD'
      ? '2026-11-23'
      : loc.dateFormat === 'DD/MM/YYYY'
      ? '23/11/2026'
      : '11/23/2026';
  const timeSample = loc.timeFormat === '24h' ? '14:30' : '2:30 PM';
  const distanceSample = loc.distanceUnit === 'km' ? '29.6 km' : '18.4 mi';
  const speedSample = loc.speedUnit === 'kmh' ? '89 km/h' : '55 mph';
  const temperatureSample = loc.temperatureUnit === 'C' ? '22°C' : '72°F';
  const fareSample = `${loc.currencySymbol}45.00 ${loc.currency}`;

  return {
    dateSample,
    timeSample,
    distanceSample,
    speedSample,
    temperatureSample,
    fareSample,
  };
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

export interface GuestSelfServicePolicyConfig {
  enableGuestSelfService: boolean; // default true
  allowGuestNotesAndFlightEdits: boolean; // default true
  allowGuestPreDispatchRouteTimeEdits: boolean; // default true
  guestDirectEditMinLeadMinutes: number; // default 30, clamped 0..720
  allowGuestAssignedChangeRequests: boolean; // default true
  allowGuestCancellation: boolean; // default true
  maxLookupAttemptsPer5Min: number; // default 5, clamped 3..30
}

export const DEFAULT_GUEST_SELF_SERVICE_POLICY: GuestSelfServicePolicyConfig = {
  enableGuestSelfService: true,
  allowGuestNotesAndFlightEdits: true,
  allowGuestPreDispatchRouteTimeEdits: true,
  guestDirectEditMinLeadMinutes: 30,
  allowGuestAssignedChangeRequests: true,
  allowGuestCancellation: true,
  maxLookupAttemptsPer5Min: 5,
};

export function normalizeGuestSelfServicePolicy(
  raw?: Partial<GuestSelfServicePolicyConfig> | null
): GuestSelfServicePolicyConfig {
  const clampInt = (val: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof val === 'number' ? val : val !== undefined && val !== '' ? Number(val) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  };

  return {
    enableGuestSelfService:
      raw?.enableGuestSelfService !== undefined
        ? Boolean(raw.enableGuestSelfService)
        : DEFAULT_GUEST_SELF_SERVICE_POLICY.enableGuestSelfService,
    allowGuestNotesAndFlightEdits:
      raw?.allowGuestNotesAndFlightEdits !== undefined
        ? Boolean(raw.allowGuestNotesAndFlightEdits)
        : DEFAULT_GUEST_SELF_SERVICE_POLICY.allowGuestNotesAndFlightEdits,
    allowGuestPreDispatchRouteTimeEdits:
      raw?.allowGuestPreDispatchRouteTimeEdits !== undefined
        ? Boolean(raw.allowGuestPreDispatchRouteTimeEdits)
        : DEFAULT_GUEST_SELF_SERVICE_POLICY.allowGuestPreDispatchRouteTimeEdits,
    guestDirectEditMinLeadMinutes: clampInt(
      raw?.guestDirectEditMinLeadMinutes,
      DEFAULT_GUEST_SELF_SERVICE_POLICY.guestDirectEditMinLeadMinutes,
      0,
      720
    ),
    allowGuestAssignedChangeRequests:
      raw?.allowGuestAssignedChangeRequests !== undefined
        ? Boolean(raw.allowGuestAssignedChangeRequests)
        : DEFAULT_GUEST_SELF_SERVICE_POLICY.allowGuestAssignedChangeRequests,
    allowGuestCancellation:
      raw?.allowGuestCancellation !== undefined
        ? Boolean(raw.allowGuestCancellation)
        : DEFAULT_GUEST_SELF_SERVICE_POLICY.allowGuestCancellation,
    maxLookupAttemptsPer5Min: clampInt(
      raw?.maxLookupAttemptsPer5Min,
      DEFAULT_GUEST_SELF_SERVICE_POLICY.maxLookupAttemptsPer5Min,
      3,
      30
    ),
  };
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
  allowPublicCorporateCheckout?: boolean; // default false — gates 'account' off /book unless explicitly enabled
  guestSelfServicePolicy?: GuestSelfServicePolicyConfig; // Phase 62 /track policy controls
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

/**
 * Resolves accepted retail payment methods on `/book` & `/app/passenger`,
 * filtering out `'account'` unless `bookingConfig?.allowPublicCorporateCheckout === true`.
 */
export function resolveRetailAcceptedPaymentMethods(
  bookingConfig?: Partial<CustomerBookingConfig> | null
): Array<'card' | 'cash' | 'account'> {
  const allowPublicCorp = bookingConfig?.allowPublicCorporateCheckout === true;
  const rawList =
    Array.isArray(bookingConfig?.acceptedPaymentMethods) &&
    bookingConfig.acceptedPaymentMethods.length > 0
      ? bookingConfig.acceptedPaymentMethods
      : allowPublicCorp
      ? (['card', 'cash', 'account'] as const)
      : (['card', 'cash'] as const);

  const seen = new Set<'card' | 'cash' | 'account'>();
  const out: Array<'card' | 'cash' | 'account'> = [];

  for (const method of rawList) {
    if (method !== 'card' && method !== 'cash' && method !== 'account') continue;
    if (method === 'account' && !allowPublicCorp) continue;
    if (!seen.has(method)) {
      seen.add(method);
      out.push(method);
    }
  }

  if (allowPublicCorp && !seen.has('account')) {
    out.push('account');
    seen.add('account');
  }

  if (out.length === 0) {
    return ['card', 'cash'];
  }

  return out;
}

/**
 * Pure helper ensuring `/app/corporate` (`hasCorporatePortalContext === true`)
 * always preserves `'account'` payment method and is NEVER clamped to `'card'`
 * when retail `acceptedPaymentMethods` excludes `'account'`.
 */
export function resolveAllowedCustomerPaymentMethod(params: {
  currentMethod: 'card' | 'cash' | 'account';
  bookingConfig?: Partial<CustomerBookingConfig> | null;
  hasCorporatePortalContext?: boolean;
}): 'card' | 'cash' | 'account' {
  if (params.hasCorporatePortalContext) {
    return 'account';
  }
  const retailAllowed = resolveRetailAcceptedPaymentMethods(params.bookingConfig);
  if (retailAllowed.includes(params.currentMethod)) {
    return params.currentMethod;
  }
  return retailAllowed[0] || 'card';
}

export function validatePublicCorporateCheckoutGate(params: {
  paymentMethod: 'card' | 'cash' | 'account';
  bookingConfig?: Partial<CustomerBookingConfig> | null;
  hasCorporatePortalContext?: boolean;
}): { allowed: boolean; error?: string } {
  if (
    !params.hasCorporatePortalContext &&
    params.paymentMethod === 'account' &&
    params.bookingConfig?.allowPublicCorporateCheckout !== true
  ) {
    return {
      allowed: false,
      error:
        'Company account rides must be booked through the Corporate Portal (/app/corporate). Please sign in there or select Card or Cash.',
    };
  }
  return { allowed: true };
}

export interface PoHistoryRecord {
  poNumber: string;
  generatedAt: string;
  rotatedAt: string;
  rotatedBy?: string;
  reason?: string;
}

export interface CorporateAuthorizedRider {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  isVip?: boolean;
}

export interface CorporateSavedLocation {
  id: string;
  label: string;
  address: string;
  notes?: string;
}

export interface CorporatePortalManagerRecord {
  uid?: string;
  email: string;
  name: string;
  provisionedAt: string;
  status: 'active' | 'invited';
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

  // Phase 37: B2B Corporate Self-Service Portal Fields
  authorizedRiders?: CorporateAuthorizedRider[];
  costCenters?: string[];
  savedCompanyLocations?: CorporateSavedLocation[];
  portalManagers?: CorporatePortalManagerRecord[];
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
  paidAt?: string;
  paymentReference?: string;
  receiptNumber?: string;
  payToken?: string;
  payLinkUrl?: string;
  refundedAmount?: number;
  refundedAt?: string;
  lineItems: InvoiceLineItemRecord[];
  notes?: string;
}

export type CreditLimitEnforcementMode = 'soft_warning' | 'hard_block';

export interface CorporatePortalGovernanceConfig {
  allowSelfManageRiders: boolean; // default true
  allowSelfManageSavedLocations: boolean; // default true
  defaultRequirePoForNewAccounts: boolean; // default true
  poFormatRegex?: string; // optional regex e.g. '^PO-[0-9]{4,10}$' validated when non-empty
  creditLimitEnforcement: CreditLimitEnforcementMode; // default 'soft_warning'
}

export const DEFAULT_CORPORATE_PORTAL_POLICY: CorporatePortalGovernanceConfig = {
  allowSelfManageRiders: true,
  allowSelfManageSavedLocations: true,
  defaultRequirePoForNewAccounts: true,
  poFormatRegex: '',
  creditLimitEnforcement: 'soft_warning',
};

export function normalizeCorporatePortalPolicy(
  raw?: Partial<CorporatePortalGovernanceConfig> | null
): CorporatePortalGovernanceConfig {
  let cleanRegex = '';
  if (typeof raw?.poFormatRegex === 'string' && raw.poFormatRegex.trim()) {
    const candidate = raw.poFormatRegex.trim();
    try {
      // Validate compilable RegExp so malformed saved expressions never crash runtime
      new RegExp(candidate);
      cleanRegex = candidate;
    } catch {
      cleanRegex = '';
    }
  }

  return {
    allowSelfManageRiders:
      raw?.allowSelfManageRiders !== undefined
        ? Boolean(raw.allowSelfManageRiders)
        : DEFAULT_CORPORATE_PORTAL_POLICY.allowSelfManageRiders,
    allowSelfManageSavedLocations:
      raw?.allowSelfManageSavedLocations !== undefined
        ? Boolean(raw.allowSelfManageSavedLocations)
        : DEFAULT_CORPORATE_PORTAL_POLICY.allowSelfManageSavedLocations,
    defaultRequirePoForNewAccounts:
      raw?.defaultRequirePoForNewAccounts !== undefined
        ? Boolean(raw.defaultRequirePoForNewAccounts)
        : DEFAULT_CORPORATE_PORTAL_POLICY.defaultRequirePoForNewAccounts,
    ...(cleanRegex ? { poFormatRegex: cleanRegex } : {}),
    creditLimitEnforcement:
      raw?.creditLimitEnforcement === 'hard_block' ? 'hard_block' : 'soft_warning',
  };
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
  // Phase 60: 1-Tap Pay Link & Multi-Role Payout Policies
  payLinkExpiryHours?: number; // default 72, clamped 1..720
  payLinkAllowTipOnTrips?: boolean; // default true
  payLinkAllowTipOnInvoices?: boolean; // default false
  autoSendPayLinkReceiptSms?: boolean; // default true
  driverDefaultCommissionPercent?: number; // default 75, clamped 0..100
  staffDispatcherHourlyRate?: number; // default 24
  staffPerBookingBonusAmount?: number; // default 0
}

export type NormalizedBillingSettingsConfig = Required<
  Pick<
    BillingSettingsConfig,
    | 'autoEmailReceipts'
    | 'stripeTerminalEnabled'
    | 'passCardSurcharge'
    | 'surchargePercent'
    | 'payLinkExpiryHours'
    | 'payLinkAllowTipOnTrips'
    | 'payLinkAllowTipOnInvoices'
    | 'autoSendPayLinkReceiptSms'
    | 'driverDefaultCommissionPercent'
    | 'staffDispatcherHourlyRate'
    | 'staffPerBookingBonusAmount'
  >
> &
  BillingSettingsConfig;

export const DEFAULT_BILLING_SETTINGS_CONFIG: NormalizedBillingSettingsConfig = {
  autoEmailReceipts: true,
  stripeTerminalEnabled: true,
  passCardSurcharge: false,
  surchargePercent: 3.0,
  payLinkExpiryHours: 72,
  payLinkAllowTipOnTrips: true,
  payLinkAllowTipOnInvoices: false,
  autoSendPayLinkReceiptSms: true,
  driverDefaultCommissionPercent: 75,
  staffDispatcherHourlyRate: 24,
  staffPerBookingBonusAmount: 0,
};

export function normalizeBillingSettingsConfig(
  raw?: Partial<BillingSettingsConfig> | null
): NormalizedBillingSettingsConfig {
  const clampNumber = (
    val: unknown,
    fallback: number,
    min: number,
    max: number,
    roundInt = false
  ): number => {
    const num = typeof val === 'number' ? val : val !== undefined && val !== '' ? Number(val) : NaN;
    if (!Number.isFinite(num)) return fallback;
    const clamped = Math.min(max, Math.max(min, num));
    return roundInt ? Math.round(clamped) : Number(clamped.toFixed(2));
  };

  const optStr = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    return trimmed ? trimmed : undefined;
  };

  const normalized: NormalizedBillingSettingsConfig = {
    autoEmailReceipts:
      raw?.autoEmailReceipts !== undefined
        ? Boolean(raw.autoEmailReceipts)
        : DEFAULT_BILLING_SETTINGS_CONFIG.autoEmailReceipts,
    stripeTerminalEnabled:
      raw?.stripeTerminalEnabled !== undefined
        ? Boolean(raw.stripeTerminalEnabled)
        : DEFAULT_BILLING_SETTINGS_CONFIG.stripeTerminalEnabled,
    passCardSurcharge:
      raw?.passCardSurcharge !== undefined
        ? Boolean(raw.passCardSurcharge)
        : DEFAULT_BILLING_SETTINGS_CONFIG.passCardSurcharge,
    surchargePercent: clampNumber(
      raw?.surchargePercent,
      DEFAULT_BILLING_SETTINGS_CONFIG.surchargePercent,
      0,
      15
    ),
    payLinkExpiryHours: clampNumber(
      raw?.payLinkExpiryHours,
      DEFAULT_BILLING_SETTINGS_CONFIG.payLinkExpiryHours,
      1,
      720,
      true
    ),
    payLinkAllowTipOnTrips:
      raw?.payLinkAllowTipOnTrips !== undefined
        ? Boolean(raw.payLinkAllowTipOnTrips)
        : DEFAULT_BILLING_SETTINGS_CONFIG.payLinkAllowTipOnTrips,
    payLinkAllowTipOnInvoices:
      raw?.payLinkAllowTipOnInvoices !== undefined
        ? Boolean(raw.payLinkAllowTipOnInvoices)
        : DEFAULT_BILLING_SETTINGS_CONFIG.payLinkAllowTipOnInvoices,
    autoSendPayLinkReceiptSms:
      raw?.autoSendPayLinkReceiptSms !== undefined
        ? Boolean(raw.autoSendPayLinkReceiptSms)
        : DEFAULT_BILLING_SETTINGS_CONFIG.autoSendPayLinkReceiptSms,
    driverDefaultCommissionPercent: clampNumber(
      raw?.driverDefaultCommissionPercent,
      DEFAULT_BILLING_SETTINGS_CONFIG.driverDefaultCommissionPercent,
      0,
      100
    ),
    staffDispatcherHourlyRate: clampNumber(
      raw?.staffDispatcherHourlyRate,
      DEFAULT_BILLING_SETTINGS_CONFIG.staffDispatcherHourlyRate,
      0,
      1000
    ),
    staffPerBookingBonusAmount: clampNumber(
      raw?.staffPerBookingBonusAmount,
      DEFAULT_BILLING_SETTINGS_CONFIG.staffPerBookingBonusAmount,
      0,
      1000
    ),
  };

  const bankName = optStr(raw?.remittanceBankName);
  const acctName = optStr(raw?.remittanceAccountName);
  const routing = optStr(raw?.remittanceRoutingNumber);
  const last4 = optStr(raw?.remittanceAccountLast4);
  const usdot = optStr(raw?.usdotNumber);
  const taxId = optStr(raw?.taxId);

  if (bankName) normalized.remittanceBankName = bankName;
  if (acctName) normalized.remittanceAccountName = acctName;
  if (routing) normalized.remittanceRoutingNumber = routing;
  if (last4) normalized.remittanceAccountLast4 = last4.slice(-4);
  if (usdot) normalized.usdotNumber = usdot;
  if (taxId) normalized.taxId = taxId;

  return normalized;
}

export type PayoutPayeeType = 'driver' | 'staff' | 'other';
export type CustomPayeeCategory = 'affiliate' | 'contractor' | 'vendor' | 'concierge';
export type CustomPayeeRateType = 'flat' | 'percent' | 'hourly';
export type PayoutSettlementStatus = 'pending' | 'approved' | 'paid';
export type PayoutPaymentMethod = 'ach' | 'check' | 'cash' | 'zelle' | 'payroll';

export interface PayoutPayeeRecord {
  id: string;
  name: string;
  category: CustomPayeeCategory;
  email?: string;
  phone?: string;
  defaultRateType: CustomPayeeRateType;
  defaultRateValue: number;
  notes?: string;
  isActive: boolean;
}

export interface PayoutSettlementRecord {
  id: string;
  payeeType: PayoutPayeeType;
  payeeId: string;
  payeeName: string;
  payeeRoleLabel: string;
  periodStart: string;
  periodEnd: string;
  tripCount?: number;
  hoursWorked?: number;
  grossAmount: number;
  tipsOrBonusAmount: number;
  deductionsOrPlatformFee: number;
  adjustmentsAmount: number;
  netPayoutAmount: number;
  status: PayoutSettlementStatus;
  paymentMethod: PayoutPaymentMethod;
  referenceNumber?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
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

export type DispatchAutomationMode =
  | 'manual_1tap'
  | 'sequential_cascade'
  | 'broadcast_pool'
  | 'direct_auto_assign';

export type ActiveAutoDispatchStrategyMode = Exclude<DispatchAutomationMode, 'manual_1tap'>;

export type DispatchOperatingHoursMode = 'always' | 'custom_window';

export type DispatchExhaustionFallbackMode = 'alert_dispatch' | 'broadcast_all_eligible';

export interface DispatchAutomationConfig {
  /** false = 1-tap dispatcher-initiated (default); true = synchronized when dispatchMode !== 'manual_1tap' */
  autoOfferOnConfirm: boolean;
  /** Primary assignment mode (default 'manual_1tap') */
  dispatchMode: DispatchAutomationMode;
  /** Strategy executed when clicking "Auto-Dispatch Ready (N)" while in 'manual_1tap' mode */
  sweepExecutionMode: ActiveAutoDispatchStrategyMode;
  /** Operational kill/pause switch for continuous Auto-Pilot */
  isPaused: boolean;
  pausedAt?: string;
  pausedBy?: string;
  pauseReason?: string;
  rankingStrategy: DispatchRankingStrategy;
  /** Seconds per cascade/pool offer step (default 45, clamped 15–180s) */
  offerTimeoutSeconds: number;
  /** Maximum drivers/batches offered per cascade (default 3, clamped 1–10) */
  maxCascadeAttempts: number;
  /** Simultaneous top candidates offered in 'broadcast_pool' mode (default 3, clamped 2–8) */
  broadcastPoolSize: number;
  /** Auto-dispatch immediate ASAP rides when Auto-Pilot is active (default true) */
  autoDispatchAsapRides: boolean;
  /** Auto-dispatch scheduled rides once inside the Pre-Pickup Lead Window (default true) */
  autoDispatchScheduledRides: boolean;
  /** Admin/Authorized-Dispatcher adjustable Pre-Pickup Lead Window in minutes (default 45, clamped 15–240) */
  scheduledDispatchLeadMinutes: number;
  /** Automatically release pre-staged/planned drivers inside lead window (default true) */
  autoReleaseStagedDrivers: boolean;
  /** Lead window in minutes for releasing staged drivers (default 45, clamped 15–240) */
  stagedAutoReleaseLeadMinutes: number;
  /** Normalized trimmed UIDs or lowercase emails of dispatchers granted Lead-Window permission */
  authorizedLeadWindowDispatcherIds: string[];
  /** Maximum pickup radius in miles (default 18, clamped 0–100; 0 = unlimited) */
  maxPickupRadiusMiles: number;
  /** Strictly rank pickup-zone candidates ahead of out-of-zone candidates (default true) */
  strictZoneFirst: boolean;
  /** Minimum driver quality score threshold (default 0, clamped 0–100) */
  minDriverScore: number;
  /** Maximum GPS staleness in seconds (default 300, clamped 0–3600; 0 = allow no-GPS on-duty drivers) */
  maxGpsStaleSeconds: number;
  /** Operating schedule mode ('always' 24/7 vs 'custom_window' hours) */
  operatingHoursMode: DispatchOperatingHoursMode;
  /** Start hour (0–23) when operatingHoursMode === 'custom_window' (default 22) */
  windowStartHour: number;
  /** End hour (0–23) when operatingHoursMode === 'custom_window' (default 6) */
  windowEndHour: number;
  /** Behavior when sequential/pool attempts exhaust without acceptance */
  fallbackOnExhaustion: DispatchExhaustionFallbackMode;
  /** Minutes before scheduled pickup to enter SLA warning window (default 60) */
  slaWarningMinutes: number;
  /** Minutes before scheduled pickup to enter SLA critical window (default 30) */
  slaCriticalMinutes: number;
  /** Extra lead minutes added automatically when detectAirportInAddresses matches STL/SUS/CPS (default 15) */
  airportExtraLeadMinutes: number;
}

export const DEFAULT_DISPATCH_AUTOMATION_CONFIG: DispatchAutomationConfig = {
  autoOfferOnConfirm: false,
  dispatchMode: 'manual_1tap',
  sweepExecutionMode: 'sequential_cascade',
  isPaused: false,
  rankingStrategy: 'nearest_in_zone',
  offerTimeoutSeconds: 45,
  maxCascadeAttempts: 3,
  broadcastPoolSize: 3,
  autoDispatchAsapRides: true,
  autoDispatchScheduledRides: true,
  scheduledDispatchLeadMinutes: 45,
  autoReleaseStagedDrivers: true,
  stagedAutoReleaseLeadMinutes: 45,
  authorizedLeadWindowDispatcherIds: [],
  maxPickupRadiusMiles: 18,
  strictZoneFirst: true,
  minDriverScore: 0,
  maxGpsStaleSeconds: 300,
  operatingHoursMode: 'always',
  windowStartHour: 22,
  windowEndHour: 6,
  fallbackOnExhaustion: 'alert_dispatch',
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
  const validModes: readonly DispatchAutomationMode[] = [
    'manual_1tap',
    'sequential_cascade',
    'broadcast_pool',
    'direct_auto_assign',
  ];
  const validActiveModes: readonly ActiveAutoDispatchStrategyMode[] = [
    'sequential_cascade',
    'broadcast_pool',
    'direct_auto_assign',
  ];

  const rankingStrategy: DispatchRankingStrategy =
    raw?.rankingStrategy && validStrategies.includes(raw.rankingStrategy)
      ? raw.rankingStrategy
      : DEFAULT_DISPATCH_AUTOMATION_CONFIG.rankingStrategy;

  let dispatchMode: DispatchAutomationMode;
  if (raw?.dispatchMode && validModes.includes(raw.dispatchMode)) {
    dispatchMode = raw.dispatchMode;
  } else if (raw?.autoOfferOnConfirm === true) {
    dispatchMode = 'sequential_cascade';
  } else {
    dispatchMode = 'manual_1tap';
  }

  const autoOfferOnConfirm = dispatchMode !== 'manual_1tap';

  const sweepExecutionMode: ActiveAutoDispatchStrategyMode =
    raw?.sweepExecutionMode && validActiveModes.includes(raw.sweepExecutionMode)
      ? raw.sweepExecutionMode
      : dispatchMode !== 'manual_1tap'
      ? dispatchMode
      : DEFAULT_DISPATCH_AUTOMATION_CONFIG.sweepExecutionMode;

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

  const normalizedAuthorizedIds = Array.isArray(raw?.authorizedLeadWindowDispatcherIds)
    ? Array.from(
        new Set(
          raw.authorizedLeadWindowDispatcherIds
            .map((entry) => {
              const trimmed = String(entry || '').trim();
              if (!trimmed) return '';
              return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
            })
            .filter(Boolean)
        )
      )
    : [];

  const operatingHoursMode: DispatchOperatingHoursMode =
    raw?.operatingHoursMode === 'custom_window' ? 'custom_window' : 'always';

  const fallbackOnExhaustion: DispatchExhaustionFallbackMode =
    raw?.fallbackOnExhaustion === 'broadcast_all_eligible'
      ? 'broadcast_all_eligible'
      : 'alert_dispatch';

  const isPaused = Boolean(raw?.isPaused ?? DEFAULT_DISPATCH_AUTOMATION_CONFIG.isPaused);
  const pausedAt =
    typeof raw?.pausedAt === 'string' && raw.pausedAt.trim() ? raw.pausedAt.trim() : undefined;
  const pausedBy =
    typeof raw?.pausedBy === 'string' && raw.pausedBy.trim() ? raw.pausedBy.trim() : undefined;
  const pauseReason =
    typeof raw?.pauseReason === 'string' && raw.pauseReason.trim()
      ? raw.pauseReason.trim()
      : undefined;

  return {
    autoOfferOnConfirm,
    dispatchMode,
    sweepExecutionMode,
    isPaused,
    ...(pausedAt ? { pausedAt } : {}),
    ...(pausedBy ? { pausedBy } : {}),
    ...(pauseReason ? { pauseReason } : {}),
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
    broadcastPoolSize: clampInt(
      raw?.broadcastPoolSize,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.broadcastPoolSize,
      2,
      8
    ),
    autoDispatchAsapRides:
      raw?.autoDispatchAsapRides !== undefined
        ? Boolean(raw.autoDispatchAsapRides)
        : DEFAULT_DISPATCH_AUTOMATION_CONFIG.autoDispatchAsapRides,
    autoDispatchScheduledRides:
      raw?.autoDispatchScheduledRides !== undefined
        ? Boolean(raw.autoDispatchScheduledRides)
        : DEFAULT_DISPATCH_AUTOMATION_CONFIG.autoDispatchScheduledRides,
    scheduledDispatchLeadMinutes: clampInt(
      raw?.scheduledDispatchLeadMinutes,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.scheduledDispatchLeadMinutes,
      15,
      240
    ),
    autoReleaseStagedDrivers:
      raw?.autoReleaseStagedDrivers !== undefined
        ? Boolean(raw.autoReleaseStagedDrivers)
        : DEFAULT_DISPATCH_AUTOMATION_CONFIG.autoReleaseStagedDrivers,
    stagedAutoReleaseLeadMinutes: clampInt(
      raw?.stagedAutoReleaseLeadMinutes,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.stagedAutoReleaseLeadMinutes,
      15,
      240
    ),
    authorizedLeadWindowDispatcherIds: normalizedAuthorizedIds,
    maxPickupRadiusMiles: clampInt(
      raw?.maxPickupRadiusMiles,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.maxPickupRadiusMiles,
      0,
      100
    ),
    strictZoneFirst:
      raw?.strictZoneFirst !== undefined
        ? Boolean(raw.strictZoneFirst)
        : DEFAULT_DISPATCH_AUTOMATION_CONFIG.strictZoneFirst,
    minDriverScore: clampInt(
      raw?.minDriverScore,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.minDriverScore,
      0,
      100
    ),
    maxGpsStaleSeconds: clampInt(
      raw?.maxGpsStaleSeconds,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.maxGpsStaleSeconds,
      0,
      3600
    ),
    operatingHoursMode,
    windowStartHour: clampInt(
      raw?.windowStartHour,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.windowStartHour,
      0,
      23
    ),
    windowEndHour: clampInt(
      raw?.windowEndHour,
      DEFAULT_DISPATCH_AUTOMATION_CONFIG.windowEndHour,
      0,
      23
    ),
    fallbackOnExhaustion,
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

/**
 * Pure RBAC helper checking whether an operator may adjust Auto-Dispatch Pre-Pickup /
 * Staged Auto-Release Lead Windows directly from the Dispatch Console.
 * Returns true for any 'admin' OR any 'dispatcher' whose UID or lowercase email is
 * granted in `config.authorizedLeadWindowDispatcherIds`.
 */
export function canOperatorConfigureLeadWindows(
  user:
    | { uid?: string; email?: string | null; role?: string; roles?: string[] }
    | null
    | undefined,
  config?: Partial<DispatchAutomationConfig> | null
): boolean {
  if (!user) return false;

  const roleSet = new Set<string>(
    [
      ...(Array.isArray(user.roles) ? user.roles : []),
      ...(user.role ? [user.role] : []),
    ].map((r) => String(r).trim().toLowerCase())
  );

  if (roleSet.has('admin') || roleSet.has('super_admin')) return true;
  if (!roleSet.has('dispatcher')) return false;

  const allowlist = Array.isArray(config?.authorizedLeadWindowDispatcherIds)
    ? config!.authorizedLeadWindowDispatcherIds!
    : [];
  if (allowlist.length === 0) return false;

  const uid = (user.uid || '').trim();
  const emailLower = (user.email || '').trim().toLowerCase();

  for (const item of allowlist) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    if (uid && clean === uid) return true;
    if (emailLower && clean.toLowerCase() === emailLower) return true;
  }

  return false;
}

export type DispatchQueueLayoutMode = 'auto' | 'table' | 'cards' | 'compact';

export interface DispatchConsoleSettingsConfig {
  conflictGuardEnabled: boolean; // default true
  nearbyWindowMinutes: number; // default 90, clamped 15..360
  tightTurnaroundMinutes: number; // default 15, clamped 5..120
  autoClearFormAfterCreate: boolean; // default true
  defaultQueueLayout: DispatchQueueLayoutMode; // default 'auto'
  maxConcurrentDraftTabs: number; // default 8, clamped 2..20
  enableRealtimeRouting: boolean; // synced with top-level AppSettings.enableRealtimeRouting
  defaultShowZonesOverlay?: boolean; // default false
  defaultShowTrafficOverlay?: boolean; // default false
  defaultShowPlacesOverlay?: boolean; // default false
  defaultShowExclusionsOverlay?: boolean; // default false
}

export const DEFAULT_DISPATCH_CONSOLE_CONFIG: DispatchConsoleSettingsConfig = {
  conflictGuardEnabled: true,
  nearbyWindowMinutes: 90,
  tightTurnaroundMinutes: 15,
  autoClearFormAfterCreate: true,
  defaultQueueLayout: 'auto',
  maxConcurrentDraftTabs: 8,
  enableRealtimeRouting: false,
  defaultShowZonesOverlay: false,
  defaultShowTrafficOverlay: false,
  defaultShowPlacesOverlay: false,
  defaultShowExclusionsOverlay: false,
};

export function normalizeDispatchConsoleConfig(
  raw?: Partial<DispatchConsoleSettingsConfig> | null,
  enableRealtimeRouting?: boolean
): DispatchConsoleSettingsConfig {
  const clampInt = (val: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof val === 'number' ? val : val !== undefined && val !== '' ? Number(val) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  };

  const validLayouts: readonly DispatchQueueLayoutMode[] = ['auto', 'table', 'cards', 'compact'];
  const defaultQueueLayout: DispatchQueueLayoutMode =
    raw?.defaultQueueLayout && validLayouts.includes(raw.defaultQueueLayout)
      ? raw.defaultQueueLayout
      : DEFAULT_DISPATCH_CONSOLE_CONFIG.defaultQueueLayout;

  const syncedRealtimeRouting =
    typeof enableRealtimeRouting === 'boolean'
      ? enableRealtimeRouting
      : typeof raw?.enableRealtimeRouting === 'boolean'
      ? raw.enableRealtimeRouting
      : DEFAULT_DISPATCH_CONSOLE_CONFIG.enableRealtimeRouting;

  return {
    conflictGuardEnabled:
      raw?.conflictGuardEnabled !== undefined
        ? Boolean(raw.conflictGuardEnabled)
        : DEFAULT_DISPATCH_CONSOLE_CONFIG.conflictGuardEnabled,
    nearbyWindowMinutes: clampInt(
      raw?.nearbyWindowMinutes,
      DEFAULT_DISPATCH_CONSOLE_CONFIG.nearbyWindowMinutes,
      15,
      360
    ),
    tightTurnaroundMinutes: clampInt(
      raw?.tightTurnaroundMinutes,
      DEFAULT_DISPATCH_CONSOLE_CONFIG.tightTurnaroundMinutes,
      5,
      120
    ),
    autoClearFormAfterCreate:
      raw?.autoClearFormAfterCreate !== undefined
        ? Boolean(raw.autoClearFormAfterCreate)
        : DEFAULT_DISPATCH_CONSOLE_CONFIG.autoClearFormAfterCreate,
    defaultQueueLayout,
    maxConcurrentDraftTabs: clampInt(
      raw?.maxConcurrentDraftTabs,
      DEFAULT_DISPATCH_CONSOLE_CONFIG.maxConcurrentDraftTabs,
      2,
      20
    ),
    enableRealtimeRouting: syncedRealtimeRouting,
    defaultShowZonesOverlay:
      raw?.defaultShowZonesOverlay !== undefined ? Boolean(raw.defaultShowZonesOverlay) : false,
    defaultShowTrafficOverlay:
      raw?.defaultShowTrafficOverlay !== undefined ? Boolean(raw.defaultShowTrafficOverlay) : false,
    defaultShowPlacesOverlay:
      raw?.defaultShowPlacesOverlay !== undefined ? Boolean(raw.defaultShowPlacesOverlay) : false,
    defaultShowExclusionsOverlay:
      raw?.defaultShowExclusionsOverlay !== undefined
        ? Boolean(raw.defaultShowExclusionsOverlay)
        : false,
  };
}

export interface HolidayCalendarEntry {
  date: string; // YYYY-MM-DD
  name: string;
}

export type StandingOrderDefaultHorizonDays = 7 | 14 | 30;
export type StandingOrderDefaultAssignmentMode = 'stage_hold' | 'send_to_driver';

export interface StandingOrdersGovernanceConfig {
  defaultHorizonDays: StandingOrderDefaultHorizonDays; // default 14
  maxHorizonDays: number; // default 60, clamped 7..180
  defaultAssignmentMode: StandingOrderDefaultAssignmentMode; // default 'stage_hold'
  defaultSkipHolidays: boolean; // default true
  holidayCalendarDates: HolidayCalendarEntry[];
}

export function buildUsFederalHolidaysForYear(year: number): HolidayCalendarEntry[] {
  const safeYear = Number.isFinite(year) && year >= 2020 && year <= 2100 ? Math.floor(year) : 2026;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  // Memorial Day: last Monday of May
  const may31Dow = new Date(Date.UTC(safeYear, 4, 31)).getUTCDay();
  const memorialDay = 31 - ((may31Dow + 6) % 7);

  // Labor Day: 1st Monday of September
  const sep1Dow = new Date(Date.UTC(safeYear, 8, 1)).getUTCDay();
  const laborDay = 1 + ((1 - sep1Dow + 7) % 7);

  // Thanksgiving: 4th Thursday of November
  const nov1Dow = new Date(Date.UTC(safeYear, 10, 1)).getUTCDay();
  const thanksgivingDay = 1 + ((4 - nov1Dow + 7) % 7) + 21;

  return [
    { date: `${safeYear}-01-01`, name: "New Year's Day" },
    { date: `${safeYear}-05-${pad2(memorialDay)}`, name: 'Memorial Day' },
    { date: `${safeYear}-07-04`, name: 'Independence Day' },
    { date: `${safeYear}-09-${pad2(laborDay)}`, name: 'Labor Day' },
    { date: `${safeYear}-11-${pad2(thanksgivingDay)}`, name: 'Thanksgiving Day' },
    { date: `${safeYear}-12-24`, name: 'Christmas Eve' },
    { date: `${safeYear}-12-25`, name: 'Christmas Day' },
  ];
}

const SEED_HOLIDAY_BASE_YEAR = new Date().getFullYear();

export const DEFAULT_US_HOLIDAY_CALENDAR_DATES: HolidayCalendarEntry[] = [
  ...buildUsFederalHolidaysForYear(SEED_HOLIDAY_BASE_YEAR),
  ...buildUsFederalHolidaysForYear(SEED_HOLIDAY_BASE_YEAR + 1),
];

export const DEFAULT_STANDING_ORDERS_CONFIG: StandingOrdersGovernanceConfig = {
  defaultHorizonDays: 14,
  maxHorizonDays: 60,
  defaultAssignmentMode: 'stage_hold',
  defaultSkipHolidays: true,
  holidayCalendarDates: [...DEFAULT_US_HOLIDAY_CALENDAR_DATES],
};

export function normalizeStandingOrdersConfig(
  raw?: Partial<StandingOrdersGovernanceConfig> | null
): StandingOrdersGovernanceConfig {
  const rawHorizon = Number(raw?.defaultHorizonDays);
  const defaultHorizonDays: StandingOrderDefaultHorizonDays =
    rawHorizon === 7 || rawHorizon === 14 || rawHorizon === 30 ? rawHorizon : 14;

  const rawMax =
    typeof raw?.maxHorizonDays === 'number'
      ? raw.maxHorizonDays
      : raw?.maxHorizonDays !== undefined
      ? Number(raw.maxHorizonDays)
      : NaN;
  const maxHorizonDays = Number.isFinite(rawMax)
    ? Math.min(180, Math.max(7, Math.round(rawMax)))
    : DEFAULT_STANDING_ORDERS_CONFIG.maxHorizonDays;

  const defaultAssignmentMode: StandingOrderDefaultAssignmentMode =
    raw?.defaultAssignmentMode === 'send_to_driver' ? 'send_to_driver' : 'stage_hold';

  const defaultSkipHolidays =
    raw?.defaultSkipHolidays !== undefined
      ? Boolean(raw.defaultSkipHolidays)
      : DEFAULT_STANDING_ORDERS_CONFIG.defaultSkipHolidays;

  let holidayCalendarDates: HolidayCalendarEntry[];
  if (Array.isArray(raw?.holidayCalendarDates)) {
    const byDate = new Map<string, HolidayCalendarEntry>();
    for (const item of raw.holidayCalendarDates) {
      if (!item || typeof item !== 'object') continue;
      const dateStr = String(item.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
      const nameStr = String(item.name || '').trim() || 'Holiday';
      byDate.set(dateStr, { date: dateStr, name: nameStr });
    }
    holidayCalendarDates = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  } else {
    holidayCalendarDates = DEFAULT_US_HOLIDAY_CALENDAR_DATES.map((h) => ({ ...h }));
  }

  return {
    defaultHorizonDays,
    maxHorizonDays,
    defaultAssignmentMode,
    defaultSkipHolidays,
    holidayCalendarDates,
  };
}

export type DriverDefaultNavigationProvider = 'google_maps' | 'apple_maps' | 'waze';

export interface DriverAppPoliciesConfig {
  intermediateStopFreeWaitingMinutes: number; // default 5, clamped 0..30 (synced with UniversalExtrasConfig)
  intermediateStopExcessWaitRatePerMinute: number; // default 0.50, clamped 0..10 (synced with UniversalExtrasConfig)
  requireDriverUpdateAck: boolean; // default true
  unacknowledgedAlertMinutes: number; // default 5, clamped 1..60
  enforceScreenWakeLockOnDuty: boolean; // default true
  enableAudibleOfferChime: boolean; // default true
  defaultNavigationProvider: DriverDefaultNavigationProvider; // default 'google_maps'
}

export const DEFAULT_DRIVER_APP_POLICIES_CONFIG: DriverAppPoliciesConfig = {
  intermediateStopFreeWaitingMinutes: 5,
  intermediateStopExcessWaitRatePerMinute: 0.5,
  requireDriverUpdateAck: true,
  unacknowledgedAlertMinutes: 5,
  enforceScreenWakeLockOnDuty: true,
  enableAudibleOfferChime: true,
  defaultNavigationProvider: 'google_maps',
};

export function normalizeDriverAppPoliciesConfig(
  raw?: Partial<DriverAppPoliciesConfig> | null,
  extras?: Partial<UniversalExtrasConfig> | null
): DriverAppPoliciesConfig {
  const clampNum = (
    val: unknown,
    fallback: number,
    min: number,
    max: number,
    roundInt = false
  ): number => {
    const num = typeof val === 'number' ? val : val !== undefined && val !== '' ? Number(val) : NaN;
    if (!Number.isFinite(num)) return fallback;
    const clamped = Math.min(max, Math.max(min, num));
    return roundInt ? Math.round(clamped) : Number(clamped.toFixed(2));
  };

  const fallbackFreeMins = clampNum(
    extras?.intermediateStopFreeWaitingMinutes,
    DEFAULT_DRIVER_APP_POLICIES_CONFIG.intermediateStopFreeWaitingMinutes,
    0,
    30,
    true
  );

  const fallbackExcessRate = clampNum(
    extras?.curbWaitingRatePerMinute ?? extras?.waitingRatePerMinute,
    DEFAULT_DRIVER_APP_POLICIES_CONFIG.intermediateStopExcessWaitRatePerMinute,
    0,
    10,
    false
  );

  const rawNav = String(raw?.defaultNavigationProvider || '').trim().toLowerCase();
  let defaultNavigationProvider: DriverDefaultNavigationProvider = 'google_maps';
  if (rawNav === 'apple_maps' || rawNav === 'apple') {
    defaultNavigationProvider = 'apple_maps';
  } else if (rawNav === 'waze') {
    defaultNavigationProvider = 'waze';
  } else if (rawNav === 'google_maps' || rawNav === 'google') {
    defaultNavigationProvider = 'google_maps';
  }

  return {
    intermediateStopFreeWaitingMinutes: clampNum(
      raw?.intermediateStopFreeWaitingMinutes,
      fallbackFreeMins,
      0,
      30,
      true
    ),
    intermediateStopExcessWaitRatePerMinute: clampNum(
      raw?.intermediateStopExcessWaitRatePerMinute,
      fallbackExcessRate,
      0,
      10,
      false
    ),
    requireDriverUpdateAck:
      raw?.requireDriverUpdateAck !== undefined
        ? Boolean(raw.requireDriverUpdateAck)
        : DEFAULT_DRIVER_APP_POLICIES_CONFIG.requireDriverUpdateAck,
    unacknowledgedAlertMinutes: clampNum(
      raw?.unacknowledgedAlertMinutes,
      DEFAULT_DRIVER_APP_POLICIES_CONFIG.unacknowledgedAlertMinutes,
      1,
      60,
      true
    ),
    enforceScreenWakeLockOnDuty:
      raw?.enforceScreenWakeLockOnDuty !== undefined
        ? Boolean(raw.enforceScreenWakeLockOnDuty)
        : DEFAULT_DRIVER_APP_POLICIES_CONFIG.enforceScreenWakeLockOnDuty,
    enableAudibleOfferChime:
      raw?.enableAudibleOfferChime !== undefined
        ? Boolean(raw.enableAudibleOfferChime)
        : DEFAULT_DRIVER_APP_POLICIES_CONFIG.enableAudibleOfferChime,
    defaultNavigationProvider,
  };
}

export function mapDriverPolicyNavToPreferredApp(
  provider?: DriverDefaultNavigationProvider | string | null
): 'google' | 'apple' | 'waze' {
  const clean = String(provider || '').trim().toLowerCase();
  if (clean === 'apple_maps' || clean === 'apple') return 'apple';
  if (clean === 'waze') return 'waze';
  return 'google';
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
    secretKey?: string;
    webhookSecret?: string;
    status?: 'idle' | 'checking' | 'connected' | 'error';
  };
  square?: {
    applicationId: string;
    accessToken?: string;
    locationId: string;
    status?: 'idle' | 'checking' | 'connected' | 'error';
  };
}

export interface LocalSeoFaqOverrideItem {
  question: string;
  answer: string;
}

export interface LocalSeoCorridorOverride {
  enabled?: boolean;
  featured?: boolean;
  customHeroHeadline?: string;
  customHeroSubheadline?: string;
  customMetaTitle?: string;
  customMetaDescription?: string;
  customFaqs?: LocalSeoFaqOverrideItem[];
}

export interface LocalSeoAdminConfig {
  corridorOverrides: Record<string, LocalSeoCorridorOverride>;
}

export const DEFAULT_LOCAL_SEO_CONFIG: LocalSeoAdminConfig = {
  corridorOverrides: {},
};

export function normalizeLocalSeoConfig(
  raw?: Partial<LocalSeoAdminConfig> | null
): LocalSeoAdminConfig {
  const rawOverrides =
    raw && raw.corridorOverrides && typeof raw.corridorOverrides === 'object'
      ? raw.corridorOverrides
      : {};
  const corridorOverrides: Record<string, LocalSeoCorridorOverride> = {};

  for (const [rawSlug, entry] of Object.entries(rawOverrides)) {
    const slug = String(rawSlug || '').trim().toLowerCase();
    if (!slug || !entry || typeof entry !== 'object') continue;

    const cleanOpt = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const trimmed = v.trim();
      return trimmed ? trimmed : undefined;
    };

    const customFaqs: LocalSeoFaqOverrideItem[] | undefined = Array.isArray(entry.customFaqs)
      ? entry.customFaqs
          .map((f) => ({
            question: typeof f?.question === 'string' ? f.question.trim() : '',
            answer: typeof f?.answer === 'string' ? f.answer.trim() : '',
          }))
          .filter((f) => f.question.length > 0 && f.answer.length > 0)
      : undefined;

    const normalizedEntry: LocalSeoCorridorOverride = {};
    if (entry.enabled !== undefined) normalizedEntry.enabled = Boolean(entry.enabled);
    if (entry.featured !== undefined) normalizedEntry.featured = Boolean(entry.featured);

    const headline = cleanOpt(entry.customHeroHeadline);
    const subheadline = cleanOpt(entry.customHeroSubheadline);
    const metaTitle = cleanOpt(entry.customMetaTitle);
    const metaDesc = cleanOpt(entry.customMetaDescription);

    if (headline) normalizedEntry.customHeroHeadline = headline;
    if (subheadline) normalizedEntry.customHeroSubheadline = subheadline;
    if (metaTitle) normalizedEntry.customMetaTitle = metaTitle;
    if (metaDesc) normalizedEntry.customMetaDescription = metaDesc;
    if (customFaqs && customFaqs.length > 0) normalizedEntry.customFaqs = customFaqs;

    if (Object.keys(normalizedEntry).length > 0) {
      corridorOverrides[slug] = normalizedEntry;
    }
  }

  return { corridorOverrides };
}

export type FlightPreferredProvider = 'auto' | 'aerodatabox' | 'flightaware' | 'heuristic_only';

export interface FlightTrackingPolicyConfig {
  flightLookupWindowHours: number; // default 24, clamped 2..72
  cacheTtlMinutes: number; // default 15, clamped 1..120
  preferredProvider: FlightPreferredProvider; // default 'auto'
  delayAlertThresholdMinutes: number; // default 20, clamped 5..180
}

export const DEFAULT_FLIGHT_TRACKING_POLICY: FlightTrackingPolicyConfig = {
  flightLookupWindowHours: 24,
  cacheTtlMinutes: 15,
  preferredProvider: 'auto',
  delayAlertThresholdMinutes: 20,
};

export function normalizeFlightTrackingPolicy(
  raw?: Partial<FlightTrackingPolicyConfig> | null
): FlightTrackingPolicyConfig {
  const clampInt = (val: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof val === 'number' ? val : val !== undefined && val !== '' ? Number(val) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  };

  const validProviders: readonly FlightPreferredProvider[] = [
    'auto',
    'aerodatabox',
    'flightaware',
    'heuristic_only',
  ];
  const preferredProvider: FlightPreferredProvider =
    raw?.preferredProvider && validProviders.includes(raw.preferredProvider)
      ? raw.preferredProvider
      : DEFAULT_FLIGHT_TRACKING_POLICY.preferredProvider;

  return {
    flightLookupWindowHours: clampInt(
      raw?.flightLookupWindowHours,
      DEFAULT_FLIGHT_TRACKING_POLICY.flightLookupWindowHours,
      2,
      72
    ),
    cacheTtlMinutes: clampInt(
      raw?.cacheTtlMinutes,
      DEFAULT_FLIGHT_TRACKING_POLICY.cacheTtlMinutes,
      1,
      120
    ),
    preferredProvider,
    delayAlertThresholdMinutes: clampInt(
      raw?.delayAlertThresholdMinutes,
      DEFAULT_FLIGHT_TRACKING_POLICY.delayAlertThresholdMinutes,
      5,
      180
    ),
  };
}

export type CannedSmsTemplateCategory =
  | 'dispatch'
  | 'airport'
  | 'arrival'
  | 'billing'
  | 'custom';

export interface BuiltInSmsTemplateOverride {
  label?: string;
  shortLabel?: string;
  bodyTemplate?: string;
  enabled?: boolean;
}

export interface CustomCannedSmsTemplateItem {
  id: string;
  label: string;
  shortLabel?: string;
  category: CannedSmsTemplateCategory;
  description?: string;
  bodyTemplate: string;
  enabled: boolean;
}

export interface CannedSmsTemplatesConfig {
  builtInOverrides: Record<string, BuiltInSmsTemplateOverride>;
  customTemplates: CustomCannedSmsTemplateItem[];
}

export const DEFAULT_CANNED_SMS_TEMPLATES_CONFIG: CannedSmsTemplatesConfig = {
  builtInOverrides: {},
  customTemplates: [],
};

export function normalizeCannedSmsTemplates(
  raw?: Partial<CannedSmsTemplatesConfig> | null
): CannedSmsTemplatesConfig {
  const validCategories: readonly CannedSmsTemplateCategory[] = [
    'dispatch',
    'airport',
    'arrival',
    'billing',
    'custom',
  ];

  const rawBuiltIn =
    raw && raw.builtInOverrides && typeof raw.builtInOverrides === 'object'
      ? raw.builtInOverrides
      : {};
  const builtInOverrides: Record<string, BuiltInSmsTemplateOverride> = {};

  for (const [rawId, item] of Object.entries(rawBuiltIn)) {
    const id = String(rawId || '').trim();
    if (!id || !item || typeof item !== 'object') continue;
    const next: BuiltInSmsTemplateOverride = {};
    if (typeof item.label === 'string' && item.label.trim()) {
      next.label = item.label.trim().slice(0, 80);
    }
    if (typeof item.shortLabel === 'string' && item.shortLabel.trim()) {
      next.shortLabel = item.shortLabel.trim().slice(0, 40);
    }
    if (typeof item.bodyTemplate === 'string' && item.bodyTemplate.trim()) {
      next.bodyTemplate = item.bodyTemplate.trim().slice(0, 600);
    }
    if (item.enabled !== undefined) {
      next.enabled = Boolean(item.enabled);
    }
    if (Object.keys(next).length > 0) {
      builtInOverrides[id] = next;
    }
  }

  const customTemplates: CustomCannedSmsTemplateItem[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw?.customTemplates)) {
    for (const rawTpl of raw.customTemplates) {
      if (!rawTpl || typeof rawTpl !== 'object') continue;
      const id = String(rawTpl.id || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const label = String(rawTpl.label || '').trim().slice(0, 80);
      const bodyTemplate = String(rawTpl.bodyTemplate || '').trim().slice(0, 600);
      if (!id || !label || !bodyTemplate || seenIds.has(id)) continue;
      seenIds.add(id);

      const category: CannedSmsTemplateCategory = validCategories.includes(
        rawTpl.category as CannedSmsTemplateCategory
      )
        ? (rawTpl.category as CannedSmsTemplateCategory)
        : 'custom';
      const shortLabel =
        typeof rawTpl.shortLabel === 'string' && rawTpl.shortLabel.trim()
          ? rawTpl.shortLabel.trim().slice(0, 40)
          : label.slice(0, 28);
      const description =
        typeof rawTpl.description === 'string' && rawTpl.description.trim()
          ? rawTpl.description.trim().slice(0, 160)
          : undefined;

      customTemplates.push({
        id,
        label,
        shortLabel,
        category,
        ...(description ? { description } : {}),
        bodyTemplate,
        enabled: rawTpl.enabled !== undefined ? Boolean(rawTpl.enabled) : true,
      });
    }
  }

  return {
    builtInOverrides,
    customTemplates,
  };
}

export interface DispatchEmailPolicyConfig {
  inboundParseToBookingDraft: boolean; // default true
  outboundSignature: string; // default 'Chesterfield Taxi Dispatch · (314) 738-0100'
  blockedSenderList: string[]; // default [] — lowercase emails or '@domain.com' entries
  autoAckInboundBookingEmails: boolean; // default false
}

export const DEFAULT_DISPATCH_EMAIL_POLICY: DispatchEmailPolicyConfig = {
  inboundParseToBookingDraft: true,
  outboundSignature: 'Chesterfield Taxi Dispatch · (314) 738-0100',
  blockedSenderList: [],
  autoAckInboundBookingEmails: false,
};

export function normalizeDispatchEmailPolicy(
  raw?: Partial<DispatchEmailPolicyConfig> | null
): DispatchEmailPolicyConfig {
  const blockedSenderList = Array.isArray(raw?.blockedSenderList)
    ? Array.from(
        new Set(
          raw.blockedSenderList
            .map((entry) =>
              String(entry || '')
                .trim()
                .toLowerCase()
                .replace(/^\*@/, '@')
            )
            .filter((entry) => entry.length >= 3 && (entry.includes('@') || entry.includes('.')))
            .map((entry) => (entry.includes('@') ? entry : `@${entry}`))
        )
      )
    : [];

  return {
    inboundParseToBookingDraft:
      raw?.inboundParseToBookingDraft !== undefined
        ? Boolean(raw.inboundParseToBookingDraft)
        : DEFAULT_DISPATCH_EMAIL_POLICY.inboundParseToBookingDraft,
    outboundSignature:
      typeof raw?.outboundSignature === 'string'
        ? raw.outboundSignature.trim().slice(0, 500)
        : DEFAULT_DISPATCH_EMAIL_POLICY.outboundSignature,
    blockedSenderList,
    autoAckInboundBookingEmails:
      raw?.autoAckInboundBookingEmails !== undefined
        ? Boolean(raw.autoAckInboundBookingEmails)
        : DEFAULT_DISPATCH_EMAIL_POLICY.autoAckInboundBookingEmails,
  };
}

export function isInboundEmailSenderBlocked(
  senderEmail: string | null | undefined,
  policy?: Partial<DispatchEmailPolicyConfig> | null
): boolean {
  const raw = String(senderEmail || '').trim().toLowerCase();
  if (!raw) return false;
  const angleMatch = raw.match(/<([^>]+)>/);
  const candidate = (angleMatch ? angleMatch[1] : raw).trim().toLowerCase();
  const atIdx = candidate.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === candidate.length - 1) return false;

  const senderDomain = candidate.slice(atIdx); // '@domain.com'
  const cfg = normalizeDispatchEmailPolicy(policy);
  if (cfg.blockedSenderList.length === 0) return false;

  for (const rule of cfg.blockedSenderList) {
    if (rule.startsWith('@')) {
      if (senderDomain === rule || senderDomain.endsWith(`.${rule.slice(1)}`)) {
        return true;
      }
    } else if (candidate === rule) {
      return true;
    }
  }
  return false;
}

export interface IntegrationsConfig {
  telephony?: TelephonyIntegrationConfig;
  payments?: PaymentGatewaysConfig;
  flightTracking?: FlightTrackingPolicyConfig;
  cannedSmsTemplates?: CannedSmsTemplatesConfig;
  dispatchEmail?: DispatchEmailPolicyConfig;
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
  localSeoConfig?: LocalSeoAdminConfig;
  corporateAccounts?: CorporateAccountConfig[];
  corporatePortalPolicy?: CorporatePortalGovernanceConfig;
  invoices?: InvoiceRecord[];
  billingSettings?: BillingSettingsConfig;
  customPayees?: PayoutPayeeRecord[];
  payoutSettlements?: PayoutSettlementRecord[];
  securityControls?: SecurityControlsConfig;
  configAuditTrail?: ConfigAuditEntry[];
  fleetAlertsConfig?: FleetAlertsConfig;
  tariffs?: import('./tariff').TariffProfile[]; // Unified Tariff Profiles
  tariffGroups?: import('./tariff').TariffGroup[]; // Tariff Groups
  bookingRulesConfig?: import('../services/bookingRulesEngine').BookingRulesConfig;
  dispatchAutomation?: DispatchAutomationConfig;
  dispatchConsoleConfig?: DispatchConsoleSettingsConfig;
  standingOrdersConfig?: StandingOrdersGovernanceConfig;
  driverAppConfig?: DriverAppPoliciesConfig;
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
