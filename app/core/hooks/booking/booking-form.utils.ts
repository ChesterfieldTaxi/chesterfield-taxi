import type { GeoPoint, TripPricing, VehicleTier } from '../../types';
import type { OversizedBagCategory, VehicleTierConfig } from '../../types/config';
import type { DriverRosterItem } from '../../services/operator.service';
import { formatVehicleTier } from '../../utils/trip-id.util';

export const CUSTOMER_FBO_FACILITIES = [
  'Signature Aviation - Lambert (STL)',
  'Signature Aviation - Spirit (SUS)',
  'TAC Air / Million Air - Spirit of St. Louis (SUS)',
  'Jet Aviation - St. Louis Downtown (CPS)',
  'Premier Jet Center (ALN)',
  'West Star Aviation',
  'Private Hangar / Other FBO',
];

export const DISPATCH_FBO_FACILITIES = [
  'Signature Flight Support (STL - Hangar 2)',
  'Signature Aviation (SUS - Spirit of St. Louis)',
  'Million Air (SUS - Spirit of St. Louis)',
  'TAC Air / Signature (CPS - St. Louis Downtown)',
  'Premier Jet Center (SUS)',
  'Helicopter / Private Ramp Area',
  'Other / General Aviation Hangar',
];

export const COMMON_FBO_FACILITIES = CUSTOMER_FBO_FACILITIES;

export const DEFAULT_BOOKER_ROLES = [
  'Hotel Front Desk / Concierge',
  'Corporate Travel / Executive Admin',
  'Medical Coordinator / Clinic',
  'Family Member / Caregiver',
  'Event Organizer / Wedding Planner',
  'Other',
];

export const DEFAULT_DISPATCH_COMPANIES = [
  'Chesterfield Taxi',
  'St. Louis Taxi',
  'West County Express',
];

export const DEFAULT_CORPORATE_ACCOUNTS = [
  'Bayer Crop Science (St. Louis HQ)',
  'Pfizer Chesterfield',
  'Marriott St. Louis West',
  'Mercy Hospital St. Louis',
  "St. Luke's Hospital",
  'Delmar Gardens Chesterfield',
  'West County Orthopedics',
  'Custom Direct Bill Account',
];

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type BookingVehicleChoice = 'any' | 'sedan' | 'suv' | 'van' | (string & {});
export type SpecialRequestKey = 'petFriendly' | 'quietRide' | 'musicOk';
export type SpecialRequestFlags = Record<SpecialRequestKey, boolean>;

export interface BookingWaypointItem {
  id: string;
  address: string;
  placeId?: string;
  coordinates?: GeoPoint;
}

export interface BookingStopPoint {
  id?: string;
  address: string;
  placeId?: string;
  coordinates?: GeoPoint;
}

export interface BookingAdditionalPassenger {
  name: string;
  phone?: string;
}

export interface CarSeatsBreakdown {
  rearFacing: number;
  frontFacing: number;
  booster: number;
}

export interface VehicleCapacityInfo {
  maxPassengers: number;
  maxBags: number;
  name?: string;
}

export interface DispatchVehicleOption {
  key: BookingVehicleChoice;
  label: string;
  badge?: string;
  maxPassengers: number;
  maxBags: number;
}

export interface TierRestrictionEvaluation {
  isRestricted: boolean;
  restrictionReason: string;
}

export function formatUsPhone(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  if (hStr === undefined || mStr === undefined) return time24;
  let hour = parseInt(hStr, 10);
  if (isNaN(hour)) return time24;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const minute = mStr.padStart(2, '0');
  return `${hour}:${minute} ${ampm}`;
}

export function computeDefaultLeadDateTime(
  now: Date = new Date(),
  leadMinutes = 45,
  stepMinutes = 5
): { todayLocalDate: string; defaultDate: string; defaultTime: string } {
  const todayLocalDate = formatLocalDate(now);
  const future = new Date(now.getTime() + leadMinutes * 60 * 1000);
  const rem = future.getMinutes() % stepMinutes;
  if (rem !== 0) {
    future.setMinutes(future.getMinutes() + (stepMinutes - rem), 0, 0);
  } else {
    future.setSeconds(0, 0);
  }
  const defaultDate = formatLocalDate(future);
  const defaultTime = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;
  return { todayLocalDate, defaultDate, defaultTime };
}

export interface GenerateRecurringDatesOptions {
  repeatWeeksPattern?: 'all' | 'odd' | 'even';
  skipDates?: ReadonlyArray<string>;
  maxCap?: number;
  includeStartDate?: boolean;
  /** Optional week parity anchor YYYY-MM-DD (defaults to startDateStr) */
  anchorDateStr?: string;
}

/**
 * Generates local YYYY-MM-DD dates for recurring dispatch schedules.
 * By default (`includeStartDate = false`), excludes `startDateStr` and returns up to `maxOccurrences - 1`
 * subsequent dates (capped at `maxCap`, default 20, up to 60 for standing-order horizon extension).
 */
export function generateRecurringDates(
  startDateStr: string,
  frequency: 'daily' | 'weekdays' | 'weekly' | 'custom',
  repeatDays: string[],
  maxOccurrences: number,
  untilDateStr?: string,
  options?: GenerateRecurringDatesOptions
): string[] {
  const results: string[] = [];
  if (!startDateStr) return results;

  const effectiveMaxCap = Math.min(Math.max(1, options?.maxCap ?? 20), 60);
  const cap = Math.min(Math.max(1, maxOccurrences), effectiveMaxCap);
  const includeStartDate = Boolean(options?.includeStartDate);
  const targetCount = includeStartDate ? cap : cap - 1;
  if (targetCount <= 0) return results;

  const [y, m, d] = startDateStr.split('-').map(Number);
  if (!y || !m || !d) return results;

  const anchorStr = options?.anchorDateStr || startDateStr;
  const [ay, am, ad] = anchorStr.split('-').map(Number);
  const anchorUtcMs = ay && am && ad ? Date.UTC(ay, am - 1, ad) : Date.UTC(y, m - 1, d);
  const anchorDow = ay && am && ad ? new Date(ay, am - 1, ad).getDay() : new Date(y, m - 1, d).getDay();

  const cursor = new Date(y, m - 1, d);
  const untilDate = untilDateStr
    ? (() => {
        const [uy, um, ud] = untilDateStr.split('-').map(Number);
        return uy && um && ud ? new Date(uy, um - 1, ud, 23, 59, 59) : null;
      })()
    : null;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeksPattern = options?.repeatWeeksPattern ?? 'all';
  const skipSet = new Set(
    (options?.skipDates || [])
      .map((s) => String(s || '').trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  );

  const maxScanDays = Math.max(366, targetCount * 21);
  let safety = 0;

  while (results.length < targetCount && safety < maxScanDays) {
    if (safety > 0 || !includeStartDate) {
      cursor.setDate(cursor.getDate() + 1);
    }
    safety += 1;

    if (untilDate && cursor > untilDate) break;

    const dow = cursor.getDay();
    const dayName = dayNames[dow];
    let include = false;
    if (frequency === 'daily') include = true;
    else if (frequency === 'weekdays') include = dow >= 1 && dow <= 5;
    else if (frequency === 'weekly' || frequency === 'custom') {
      include = repeatDays.length > 0 ? repeatDays.includes(dayName) : dow === anchorDow;
    }

    if (include && weeksPattern !== 'all') {
      const cursorUtcMs = Date.UTC(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const diffDays = Math.floor((cursorUtcMs - anchorUtcMs) / 86_400_000);
      const weekIndex = Math.floor(diffDays / 7);
      const parity = ((weekIndex % 2) + 2) % 2;
      include = weeksPattern === 'even' ? parity === 0 : parity === 1;
    }

    if (include) {
      const dateStr = formatLocalDate(cursor);
      if (!skipSet.has(dateStr)) {
        results.push(dateStr);
      }
    }
  }
  return results;
}

export function getDriverStatusEmoji(
  d: DriverRosterItem & { mapStatus?: string }
): string {
  const mapStatus = d.mapStatus;
  if (mapStatus === 'available') return '[Avail]';
  if (mapStatus === 'en_route') return '[En Route]';
  if (mapStatus === 'busy') return '[Busy]';
  if (mapStatus === 'break') return '[Break]';
  if (mapStatus === 'offline') return '[Off]';
  if (d.status === 'available') return '[Avail]';
  if (d.status === 'on_trip') return '[Busy]';
  if (d.status === 'break') return '[Break]';
  return '[Off]';
}

/**
 * Resolves a dispatch vehicle choice into the exact Admin VehicleTierConfig ID
 * without flattening custom vehicles (compact_suv, midsize_suv, minivan, xl, etc.) to 'standard'.
 */
export function resolveVehicleEngineId(
  v: BookingVehicleChoice,
  availableIds?: string[]
): VehicleTier {
  if (!v || v === 'any') return 'standard';
  if (availableIds && availableIds.includes(v)) return v as VehicleTier;
  if (v === 'sedan') return 'standard';
  if (v === 'suv') return 'xl';
  if (v === 'van') return availableIds?.includes('minivan') ? 'minivan' : 'wheelchair';
  return v as VehicleTier;
}

/**
 * Maps a customer web vehicle choice into its pricing VehicleTier identifier.
 */
export function mapCustomerChoiceToTier(choice: BookingVehicleChoice): VehicleTier {
  if (choice === 'any') return 'any';
  if (choice === 'suv' || choice === 'van') return 'xl';
  if (choice === 'sedan') return 'standard';
  return choice as VehicleTier;
}

export function isVehicleChoiceSelected(
  choice: string,
  optionId: string,
  vanMappedId: 'xl' | 'wheelchair' = 'xl'
): boolean {
  return (
    choice === optionId ||
    (choice === 'any' && optionId === 'any') ||
    (choice === 'sedan' && (optionId === 'standard' || optionId === 'sedan')) ||
    (choice === 'suv' && (optionId === 'xl' || optionId === 'suv')) ||
    (choice === 'van' && (optionId === vanMappedId || optionId === 'van'))
  );
}

export function buildCustomerActiveVehicleTiers(
  vehicleTiers: VehicleTierConfig[]
): VehicleTierConfig[] {
  const anyTier: VehicleTierConfig = {
    id: 'any',
    name: 'Any Vehicle',
    badge: 'Best Value',
    baseMultiplier: 1.0,
    maxPassengers: 4,
    maxLuggage: 3,
    description: 'Nearest available Sedan, SUV, or Minivan',
    iconType: 'standard',
  };

  const baseTiers: VehicleTierConfig[] =
    vehicleTiers.length > 0
      ? vehicleTiers
      : [
          {
            id: 'standard',
            name: 'Sedan',
            badge: 'Executive',
            baseMultiplier: 1.0,
            maxPassengers: 4,
            maxLuggage: 3,
            description: 'Executive Lincoln / Camry',
            iconType: 'standard',
          },
          {
            id: 'xl',
            name: 'SUV',
            badge: 'Full-Size XL',
            baseMultiplier: 1.3,
            maxPassengers: 6,
            maxLuggage: 5,
            description: 'Full-size Chevy Suburban / Tahoe',
            iconType: 'xl',
          },
        ];

  if (!baseTiers.some((t) => t.id === 'any')) {
    return [anyTier, ...baseTiers];
  }
  return baseTiers;
}

export function buildDispatchVehicleOptions(
  vehicleTiers: VehicleTierConfig[]
): DispatchVehicleOption[] {
  const options: DispatchVehicleOption[] = [
    { key: 'any', label: 'Any', maxPassengers: 4, maxBags: 3 },
  ];

  if (vehicleTiers.length > 0) {
    for (const tier of vehicleTiers) {
      options.push({
        key: tier.id as BookingVehicleChoice,
        label: tier.name,
        badge: tier.badge,
        maxPassengers: tier.maxPassengers,
        maxBags: tier.maxLuggage,
      });
    }
  } else {
    options.push(
      { key: 'sedan', label: 'Sedan', maxPassengers: 4, maxBags: 3 },
      { key: 'suv', label: 'SUV', maxPassengers: 6, maxBags: 5 },
      { key: 'van', label: 'Van', maxPassengers: 7, maxBags: 6 }
    );
  }
  return options;
}

export function buildCustomerVehicleCapacities(
  activeVehicleTiers: VehicleTierConfig[]
): Record<string, VehicleCapacityInfo> {
  const map: Record<string, VehicleCapacityInfo> = {
    sedan: { maxPassengers: 4, maxBags: 3, name: 'Sedan' },
    suv: { maxPassengers: 6, maxBags: 5, name: 'SUV' },
    van: { maxPassengers: 7, maxBags: 6, name: 'Passenger Van' },
    any: { maxPassengers: 4, maxBags: 3, name: 'Any Available' },
  };

  for (const tier of activeVehicleTiers) {
    map[tier.id] = {
      maxPassengers: tier.maxPassengers,
      maxBags: tier.maxLuggage,
      name: tier.name,
    };
  }
  return map;
}

export function buildDispatchVehicleCapacities(
  dispatchVehicleOptions: DispatchVehicleOption[]
): Record<string, VehicleCapacityInfo> {
  const map: Record<string, VehicleCapacityInfo> = {
    any: { maxPassengers: 4, maxBags: 3, name: 'Any' },
    sedan: { maxPassengers: 4, maxBags: 3, name: 'Sedan' },
    suv: { maxPassengers: 6, maxBags: 5, name: 'SUV' },
    van: { maxPassengers: 7, maxBags: 6, name: 'Van' },
  };

  for (const opt of dispatchVehicleOptions) {
    map[opt.key] = {
      maxPassengers: opt.maxPassengers,
      maxBags: opt.maxBags,
      name: opt.label,
    };
  }
  return map;
}

export function resolveFriendlyVehicleName(
  choice: string,
  vehicleCapacities: Record<string, VehicleCapacityInfo>,
  activeVehicleTiers: VehicleTierConfig[]
): string {
  if (!choice) return 'Standard Fleet';
  if (vehicleCapacities[choice]?.name) {
    return vehicleCapacities[choice].name!;
  }
  const found = activeVehicleTiers.find((t) => isVehicleChoiceSelected(choice, t.id, 'xl'));
  if (found?.name) return found.name;
  return formatVehicleTier(choice);
}

export function sumSelectedVehicleCapacities(
  selectedVehicles: string[],
  vehicleCapacities: Record<string, VehicleCapacityInfo>
): { maxPassengers: number; maxBags: number } {
  return {
    maxPassengers: selectedVehicles.reduce(
      (acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4),
      0
    ),
    maxBags: selectedVehicles.reduce(
      (acc, v) => acc + (vehicleCapacities[v]?.maxBags || 3),
      0
    ),
  };
}

export function computeCustomerFleetCapacity(
  allowMultiVehicle: boolean | undefined,
  selectedVehicles: string[],
  vehicleCapacities: Record<string, VehicleCapacityInfo>
): { maxPassengers: number; maxBags: number } {
  if (allowMultiVehicle && selectedVehicles.length > 1) {
    return sumSelectedVehicleCapacities(selectedVehicles, vehicleCapacities);
  }
  const values = Object.values(vehicleCapacities);
  return {
    maxPassengers: Math.max(...values.map((v) => v.maxPassengers || 4), 7),
    maxBags: Math.max(...values.map((v) => v.maxBags || 3), 6),
  };
}

export function evaluateCustomerTierRestriction(params: {
  tier: VehicleTierConfig;
  passengers: number;
  totalLuggage: number;
  totalCarSeats: number;
  oversizedRequiresUpgrade: boolean;
  oversizedReasonLabel?: string;
}): TierRestrictionEvaluation {
  const {
    tier,
    passengers,
    totalLuggage,
    totalCarSeats,
    oversizedRequiresUpgrade,
    oversizedReasonLabel = 'Requires SUV/Van (Oversized items)',
  } = params;

  const isSmallSedanClass =
    tier.id === 'sedan' || tier.id === 'standard' || tier.id === 'any' || tier.maxPassengers <= 4;
  const isCarSeatRestricted = totalCarSeats > 0 && isSmallSedanClass;
  const isOversizedRestricted = oversizedRequiresUpgrade && isSmallSedanClass;
  const isPaxRestricted = passengers > tier.maxPassengers;
  const isLuggageRestricted = totalLuggage > tier.maxLuggage;
  const isRestricted =
    isCarSeatRestricted || isOversizedRestricted || isPaxRestricted || isLuggageRestricted;

  let restrictionReason = '';
  if (isOversizedRestricted) {
    restrictionReason = oversizedReasonLabel;
  } else if (isCarSeatRestricted) {
    restrictionReason = 'Requires SUV/Van (Car seats)';
  } else if (isPaxRestricted) {
    restrictionReason = `Max ${tier.maxPassengers} passengers`;
  } else if (isLuggageRestricted) {
    restrictionReason = `Max ${tier.maxLuggage} bags`;
  }

  return { isRestricted, restrictionReason };
}

export function findCapableCustomerTiers(params: {
  activeVehicleTiers: VehicleTierConfig[];
  passengers: number;
  totalLuggage: number;
  requiresUpgradedVehicle: boolean;
}): VehicleTierConfig[] {
  const { activeVehicleTiers, passengers, totalLuggage, requiresUpgradedVehicle } = params;
  return [...activeVehicleTiers]
    .filter((tier) => {
      if (passengers > tier.maxPassengers) return false;
      if (totalLuggage > tier.maxLuggage) return false;
      if (
        requiresUpgradedVehicle &&
        (tier.id === 'sedan' ||
          tier.id === 'standard' ||
          tier.id === 'any' ||
          tier.maxPassengers <= 4)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.id === 'any') return -1;
      if (b.id === 'any') return 1;
      return a.baseMultiplier - b.baseMultiplier;
    });
}

export function computeTotalCarSeats(
  enabled: boolean,
  rearFacing: number,
  frontFacing: number,
  booster: number
): number {
  return enabled ? rearFacing + frontFacing + booster : 0;
}

export function computeCarSeatsToggleState(
  checked: boolean,
  current: CarSeatsBreakdown
): { enabled: boolean } & CarSeatsBreakdown {
  if (!checked) {
    return {
      enabled: false,
      rearFacing: 0,
      frontFacing: 0,
      booster: 0,
    };
  }
  const hasExisting =
    current.rearFacing > 0 || current.frontFacing > 0 || current.booster > 0;
  return {
    enabled: true,
    rearFacing: hasExisting ? current.rearFacing : 1,
    frontFacing: current.frontFacing,
    booster: current.booster,
  };
}

export function stepLuggageCount(
  carryOnBags: number,
  checkedBags: number,
  target: 'carryOn' | 'checked',
  delta: 1 | -1,
  maxTotalBags: number
): { carryOnBags: number; checkedBags: number; bags: number } {
  if (target === 'carryOn') {
    const nextCarry =
      delta < 0
        ? Math.max(0, carryOnBags - 1)
        : Math.min(maxTotalBags - checkedBags, carryOnBags + 1);
    return {
      carryOnBags: nextCarry,
      checkedBags,
      bags: nextCarry + checkedBags,
    };
  }
  const nextChecked =
    delta < 0
      ? Math.max(0, checkedBags - 1)
      : Math.min(maxTotalBags - carryOnBags, checkedBags + 1);
  return {
    carryOnBags,
    checkedBags: nextChecked,
    bags: carryOnBags + nextChecked,
  };
}

export function countTotalOversizedBags(oversizedBags?: Record<string, number>): number {
  return Object.values(oversizedBags || {}).reduce(
    (sum, count) => sum + (Number(count) || 0),
    0
  );
}

export function cleanOversizedBagsPayload(
  enabled: boolean,
  oversizedBags?: Record<string, number>
): Record<string, number> | undefined {
  if (!enabled) return undefined;
  const cleaned: Record<string, number> = {};
  for (const [id, count] of Object.entries(oversizedBags || {})) {
    if (count > 0) cleaned[id] = count;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function doesOversizedRequireUpgrade(
  enabled: boolean,
  oversizedBags: Record<string, number> | undefined,
  categories: OversizedBagCategory[]
): boolean {
  if (!enabled) return false;
  return Object.entries(oversizedBags || {}).some(([id, count]) => {
    if (count <= 0) return false;
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.requiresUpgrade : true;
  });
}

export function formatOversizedItemsSummary(
  oversizedBags: Record<string, number> | undefined,
  categories: OversizedBagCategory[]
): string;
export function formatOversizedItemsSummary(
  oversizedBags: Record<string, number> | undefined,
  categories: OversizedBagCategory[],
  options: { enabled: boolean; notes?: string; emptyAsUndefined: true }
): string | undefined;
export function formatOversizedItemsSummary(
  oversizedBags: Record<string, number> | undefined,
  categories: OversizedBagCategory[],
  options?: { enabled?: boolean; notes?: string; emptyAsUndefined?: boolean }
): string | undefined {
  if (options?.enabled === false) {
    return options.emptyAsUndefined ? undefined : '';
  }
  const parts = Object.entries(oversizedBags || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const cat = categories.find((c) => c.id === id);
      return `${count}x ${cat?.label || id}`;
    });

  if (options?.notes && options.notes.trim()) {
    parts.push(options.notes.trim());
  }

  if (parts.length === 0) {
    return options?.emptyAsUndefined ? undefined : '';
  }
  return parts.join(', ');
}

export function formatCustomExtrasSummary(
  selectedCustomExtras: Record<string, number> | undefined,
  catalog: Array<{ id: string; name: string }>
): string;
export function formatCustomExtrasSummary(
  selectedCustomExtras: Record<string, number> | undefined,
  catalog: Array<{ id: string; name: string }> | undefined,
  options: { alwaysPrefixQty: true; emptyAsUndefined: true }
): string | undefined;
export function formatCustomExtrasSummary(
  selectedCustomExtras: Record<string, number> | undefined,
  catalog: Array<{ id: string; name: string }> | undefined,
  options?: { alwaysPrefixQty?: boolean; emptyAsUndefined?: boolean }
): string | undefined {
  const parts = Object.entries(selectedCustomExtras || {})
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const def = catalog?.find((e) => e.id === id);
      const label = def?.name || id;
      if (options?.alwaysPrefixQty) {
        return `${qty}x ${label}`;
      }
      return qty > 1 ? `${qty}x ${label}` : label;
    });

  if (parts.length === 0) {
    return options?.emptyAsUndefined ? undefined : '';
  }
  return parts.join(', ');
}

export function formatCarSeatSummaryLabel(
  enabled: boolean,
  breakdown: CarSeatsBreakdown
): string | undefined {
  if (!enabled) return undefined;
  const parts = [
    breakdown.rearFacing > 0 ? `${breakdown.rearFacing} Rear-Facing` : null,
    breakdown.frontFacing > 0 ? `${breakdown.frontFacing} Front-Facing` : null,
    breakdown.booster > 0 ? `${breakdown.booster} Booster` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `Car Seats: ${parts.join(', ')}` : undefined;
}

export function resolveAirportZoneId(
  isEndpointAirport: boolean,
  iataCode?: string
): string | undefined {
  if (!isEndpointAirport) return undefined;
  return iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport';
}

export function formatDispatchFlightNotesTag(params: {
  enabled?: boolean;
  isPrivateAviation?: boolean;
  isReturn?: boolean;
  airline?: string;
  flightNumber?: string;
  flightOrigin?: string;
  tailNumber?: string;
  fboFacility?: string;
  hasCheckedLuggage?: boolean;
}): string {
  if (!params.enabled) return '';
  const checkedSuffix = params.hasCheckedLuggage ? ' (Checked Luggage)' : '';
  if (params.isPrivateAviation) {
    if (!params.tailNumber && !params.fboFacility) return '';
    const prefix = params.isReturn ? 'Return Private Aviation' : 'Private Aviation';
    return `[${prefix}: Tail #${params.tailNumber || 'N/A'}, FBO: ${params.fboFacility || 'N/A'}${checkedSuffix}]`;
  }
  if (!params.airline && !params.flightNumber) return '';
  const prefix = params.isReturn ? 'Return Flight' : 'Flight';
  const originSegment = params.flightOrigin ? ` from ${params.flightOrigin}` : '';
  return `[${prefix}: ${params.airline || 'N/A'} #${params.flightNumber || 'N/A'}${originSegment}${checkedSuffix}]`;
}

export function buildPersistedPricing(
  enginePricing: TripPricing | null,
  targetFare: number,
  distMiles: number,
  durMins: number,
  overridden: boolean
): TripPricing {
  if (overridden) {
    return {
      ...(enginePricing || {
        baseFare: targetFare,
        distanceMiles: distMiles,
        durationMinutes: durMins,
        distanceRate: 0,
        timeRate: 0,
        vehicleMultiplier: 1,
        surgeMultiplier: 1,
        discountAmount: 0,
        subtotal: targetFare,
        totalFare: targetFare,
        currency: 'USD',
      }),
      distanceMiles: distMiles || enginePricing?.distanceMiles || 0,
      durationMinutes: durMins || enginePricing?.durationMinutes || 0,
      subtotal: targetFare,
      totalFare: targetFare,
      manualAdjustment: enginePricing
        ? Number((targetFare - enginePricing.totalFare).toFixed(2))
        : 0,
      breakdown: [
        {
          id: 'base-fare',
          category: 'base',
          label: 'Base Fare',
          detail: 'Dispatcher agreed rate',
          amount: targetFare,
          sourceType: 'rule',
        },
      ],
      currency: 'USD',
    };
  }

  if (enginePricing) {
    const diff = Number((targetFare - enginePricing.totalFare).toFixed(2));
    const adjustedBreakdown =
      Math.abs(diff) > 0.005 && enginePricing.breakdown && enginePricing.breakdown.length > 0
        ? [
            ...enginePricing.breakdown,
            {
              id: 'round-trip-balance',
              category: 'rounding' as const,
              label: 'Round-Trip Balance Adjustment',
              amount: diff,
              sourceType: 'rounding' as const,
            },
          ]
        : enginePricing.breakdown;
    return {
      ...enginePricing,
      distanceMiles: distMiles || enginePricing.distanceMiles,
      durationMinutes: durMins || enginePricing.durationMinutes,
      totalFare: targetFare,
      breakdown: adjustedBreakdown,
      currency: enginePricing.currency || 'USD',
    };
  }

  return {
    baseFare: targetFare,
    tariffBaseSubtotal: targetFare,
    distanceMiles: distMiles,
    durationMinutes: durMins,
    distanceRate: 0,
    timeRate: 0,
    vehicleMultiplier: 1.0,
    surgeMultiplier: 1.0,
    discountAmount: 0,
    subtotal: targetFare,
    totalFare: targetFare,
    currency: 'USD',
    breakdown: [
      {
        id: 'base-fare',
        category: 'base',
        label: 'Base Fare',
        amount: targetFare,
        sourceType: 'tariff',
      },
    ],
  };
}
