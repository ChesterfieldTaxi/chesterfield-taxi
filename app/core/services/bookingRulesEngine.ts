import type { Trip } from '../types/trip';
import type { PassengerAccount } from '../types/passenger';
import type { DriverProfile } from '../types/driver';
import type { BlacklistedLocation } from '../types/zone';

export type BookingExecutionMode = 'AUTO_CONFIRM' | 'REQUIRE_REVIEW' | 'BLACKLIST_BLOCK';

export interface BookingRuleEvaluationResult {
  mode: BookingExecutionMode;
  reason?: string;
  matchedRuleTags?: string[];
  tierResults?: {
    tier1: { matched: boolean; reason?: string };
    tier2: { matched: boolean; reason?: string };
    tier3: { matched: boolean; reason?: string };
  };
}

export type RuleLocationMode = 'all' | 'specific_zones' | 'airports' | 'prohibited_only' | 'outside_service_area';
export type RuleTimeMode = 'all_hours' | 'custom_window' | 'late_night';
export type RulePaymentMethod = 'prepaid' | 'corporate' | 'card' | 'cash' | 'voucher';

/**
 * Standardized, Identical Modular Tier Configuration Schema
 * Replicated across Tier 1 (Auto-Confirm), Tier 2 (Require Review), and Tier 3 (Blacklist Block).
 */
export interface ModularTierConfig {
  enabled: boolean;

  // 1. Customer Score & Rider Profile
  customerScoreMin: number; // e.g. 70 for T1, 40 for T2, 0 for T3
  customerScoreMax: number; // e.g. 100 for T1, 69 for T2, 39 for T3
  allowUnratedGuests: boolean; // false = hold or reject unrated guest riders

  // 2. Granular Spatial Routing (Separated Pickup & Dropoff)
  pickupLocationMode: RuleLocationMode;
  pickupZoneIds: string[];
  dropoffLocationMode: RuleLocationMode;
  dropoffZoneIds: string[];

  // 3. Time Windows & Operating Hours
  timeMode: RuleTimeMode;
  startHour: number; // 0-23
  endHour: number;   // 0-23

  // 4. Fare & Pricing Bounds
  minPrice: number; // e.g. $10
  maxPrice: number; // e.g. $200

  // 5. Payment Types Matrix
  paymentMethods: RulePaymentMethod[]; // e.g. ['prepaid', 'corporate']

  // 6. Advanced Operational Trip Flags
  matchReturnBooked: boolean;            // Trigger / apply on round-trip booking
  matchSeparateContactPerson: boolean;   // Trigger / apply when booker != passenger
  matchIntermediateStops: boolean;       // Trigger / apply when trip has stops
  matchMultipleVehicles: boolean;        // Trigger / apply when requesting 2+ cars

  // 7. Vehicle Classes & Driver Standards
  allowedVehicleTiers: string[];         // ['standard', 'premium', 'xl', 'wheelchair']
  minDriverScoreForPremium?: number;     // e.g. 85

  // 8. Governance & Security Safeguards (Tier 3 and audit)
  enforcePassengerBlacklist?: boolean;
  enforceDriverBlacklist?: boolean;
  enforceVehicleGrounding?: boolean;
  securityAuditLogging?: boolean;

  // Backward compatibility alias properties
  minCustomerScore?: number;
  triggerOnNewCustomers?: boolean;
  excludeNewCustomers?: boolean;
  reviewUnratedGuests?: boolean;
  locationScope?: 'anywhere' | 'whitelisted_zones_only';
  allowedPickupZones?: string[];
  allowedDropoffZones?: string[];
  operatingHours?: '24_7' | 'custom_window';
  allowedStartHour?: number;
  allowedEndHour?: number;
  customWindowStartHour?: number;
  customWindowEndHour?: number;
  allowedServiceClasses?: string[];
  maxEstimatedFare?: number;
  maxTripFare?: number;
  lateNightEnabled?: boolean;
  lateNightReviewRequired?: boolean;
  lateNightStartHour?: number;
  lateNightEndHour?: number;
  highValueThreshold?: number;
  highValueFareThreshold?: number;
  hardCustomerScoreFloor?: number;
  hardScoreFloor?: number;
  hardScoreFloorEnabled?: boolean;
  blockBlacklistedCustomers?: boolean;
  blockGroundedVehicles?: boolean;
  prohibitedZones?: string[];
  blockProhibitedZones?: boolean;
  blockOutsidePerimeter?: boolean;
  logSecurityAudit?: boolean;
  reviewAirportLocations?: boolean;
  flagSensitiveLocations?: boolean;
  reviewSensitiveZones?: string[];
  minimumDriverScoreForPremium?: number;
}

// Backward compatibility type aliases
export type Tier1AutoConfirmConfig = ModularTierConfig;
export type Tier2RequireReviewConfig = ModularTierConfig;
export type Tier3BlacklistBlockConfig = ModularTierConfig;

export interface BookingRulesConfig {
  // Backward compatibility root fields
  minimumCustomerScoreForAutoConfirm: number;
  minimumDriverScoreForPremium: number;
  lateNightReviewRequired: boolean;
  lateNightStartHour: number;
  lateNightEndHour: number;
  blacklistEnabled: boolean;

  // Unified, Identical 3-Tier Controls
  tier1: ModularTierConfig;
  tier2: ModularTierConfig;
  tier3: ModularTierConfig;
}

export const DEFAULT_BOOKING_RULES_CONFIG: BookingRulesConfig = {
  minimumCustomerScoreForAutoConfirm: 70,
  minimumDriverScoreForPremium: 85,
  lateNightReviewRequired: true,
  lateNightStartHour: 23,
  lateNightEndHour: 4,
  blacklistEnabled: true,

  tier1: {
    enabled: true,
    customerScoreMin: 70,
    customerScoreMax: 100,
    allowUnratedGuests: false,
    pickupLocationMode: 'all',
    pickupZoneIds: [],
    dropoffLocationMode: 'all',
    dropoffZoneIds: [],
    timeMode: 'all_hours',
    startHour: 5,
    endHour: 23,
    minPrice: 10,
    maxPrice: 200,
    paymentMethods: ['prepaid', 'corporate'],
    matchReturnBooked: false,
    matchSeparateContactPerson: false,
    matchIntermediateStops: false,
    matchMultipleVehicles: false,
    allowedVehicleTiers: ['standard', 'premium', 'xl', 'wheelchair'],
    minDriverScoreForPremium: 85,

    // Aliases
    minCustomerScore: 70,
    allowedPickupZones: [],
    allowedDropoffZones: [],
    maxEstimatedFare: 200,
    maxTripFare: 200,
    operatingHours: '24_7',
    allowedStartHour: 5,
    allowedEndHour: 23,
    locationScope: 'anywhere',
  },

  tier2: {
    enabled: true,
    customerScoreMin: 40,
    customerScoreMax: 69,
    allowUnratedGuests: true, // Holds unrated guests for review
    pickupLocationMode: 'airports',
    pickupZoneIds: [],
    dropoffLocationMode: 'outside_service_area',
    dropoffZoneIds: [],
    timeMode: 'late_night',
    startHour: 23,
    endHour: 4,
    minPrice: 0,
    maxPrice: 150, // Fares above $150 held for review
    paymentMethods: ['card', 'cash'], // In-car card & cash require review
    matchReturnBooked: true,
    matchSeparateContactPerson: true,
    matchIntermediateStops: true,
    matchMultipleVehicles: true,
    allowedVehicleTiers: ['premium', 'xl'],
    minDriverScoreForPremium: 85,

    // Aliases
    triggerOnNewCustomers: true,
    reviewUnratedGuests: true,
    reviewAirportLocations: true,
    flagSensitiveLocations: true,
    reviewSensitiveZones: [],
    lateNightEnabled: true,
    lateNightReviewRequired: true,
    lateNightStartHour: 23,
    lateNightEndHour: 4,
    highValueThreshold: 150,
    highValueFareThreshold: 150,
    minimumDriverScoreForPremium: 85,
  },

  tier3: {
    enabled: true,
    customerScoreMin: 0,
    customerScoreMax: 39,
    allowUnratedGuests: false,
    pickupLocationMode: 'prohibited_only',
    pickupZoneIds: [],
    dropoffLocationMode: 'prohibited_only',
    dropoffZoneIds: [],
    timeMode: 'all_hours',
    startHour: 0,
    endHour: 23,
    minPrice: 0,
    maxPrice: 1000,
    paymentMethods: [],
    matchReturnBooked: false,
    matchSeparateContactPerson: false,
    matchIntermediateStops: false,
    matchMultipleVehicles: false,
    allowedVehicleTiers: [],
    enforcePassengerBlacklist: true,
    enforceDriverBlacklist: true,
    enforceVehicleGrounding: true,
    securityAuditLogging: true,

    // Aliases
    hardCustomerScoreFloor: 40,
    hardScoreFloor: 40,
    hardScoreFloorEnabled: true,
    blockBlacklistedCustomers: true,
    blockGroundedVehicles: true,
    prohibitedZones: [],
    blockProhibitedZones: true,
    blockOutsidePerimeter: true,
    logSecurityAudit: true,
  },
};

export type BookingEvaluationTripInput = Partial<Trip> & {
  fare?: number;
  fareEstimate?: number;
  pickupAirportCode?: string;
  flightNumber?: string;
  paymentMethod?: string;
  hasReturnTrip?: boolean;
  returnBooked?: boolean;
  hasSeparateContactPerson?: boolean;
  contactPerson?: { name: string; phone: string };
  hasIntermediateStops?: boolean;
  multipleVehiclesRequested?: boolean;
  vehicleCount?: number;
  pickupZoneId?: string;
  dropoffZoneId?: string;
  isPickupAirport?: boolean;
  isDropoffAirport?: boolean;
  isPickupProhibited?: boolean;
  isDropoffProhibited?: boolean;
};

export class BookingRulesEngine {
  private config: BookingRulesConfig;

  constructor(config: Partial<BookingRulesConfig> = {}) {
    this.config = {
      ...DEFAULT_BOOKING_RULES_CONFIG,
      ...config,
      tier1: { ...DEFAULT_BOOKING_RULES_CONFIG.tier1, ...(config.tier1 || {}) },
      tier2: { ...DEFAULT_BOOKING_RULES_CONFIG.tier2, ...(config.tier2 || {}) },
      tier3: { ...DEFAULT_BOOKING_RULES_CONFIG.tier3, ...(config.tier3 || {}) },
    };

    // Backward compatibility sync
    if (this.config.tier1.customerScoreMin !== undefined) {
      this.config.tier1.minCustomerScore = this.config.tier1.customerScoreMin;
      this.config.minimumCustomerScoreForAutoConfirm = this.config.tier1.customerScoreMin;
    }
    if (this.config.tier2.startHour !== undefined && this.config.tier2.timeMode === 'late_night') {
      this.config.lateNightStartHour = this.config.tier2.startHour;
      this.config.tier2.lateNightStartHour = this.config.tier2.startHour;
    }
    if (this.config.tier2.endHour !== undefined && this.config.tier2.timeMode === 'late_night') {
      this.config.lateNightEndHour = this.config.tier2.endHour;
      this.config.tier2.lateNightEndHour = this.config.tier2.endHour;
    }
    if (this.config.tier3.customerScoreMax !== undefined) {
      this.config.tier3.hardCustomerScoreFloor = this.config.tier3.customerScoreMax + 1;
      this.config.tier3.hardScoreFloor = this.config.tier3.customerScoreMax + 1;
    }
  }

  public getConfig(): BookingRulesConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<BookingRulesConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      tier1: { ...this.config.tier1, ...(updates.tier1 || {}) },
      tier2: { ...this.config.tier2, ...(updates.tier2 || {}) },
      tier3: { ...this.config.tier3, ...(updates.tier3 || {}) },
    };
  }

  evaluateBookingRequest(
    tripInput: BookingEvaluationTripInput,
    customer?: PassengerAccount,
    driver?: DriverProfile,
    blacklistedLocations?: BlacklistedLocation[]
  ): BookingRuleEvaluationResult {
    const t1 = this.config.tier1;
    const t2 = this.config.tier2;
    const t3 = this.config.tier3;

    // Derived Trip Values
    const evalFare = tripInput.fare ?? tripInput.fareEstimate ?? tripInput.pricing?.totalFare ?? 0;
    const evalPayment = (
      tripInput.paymentMethod ||
      tripInput.payment?.method ||
      'card'
    ).toLowerCase() as RulePaymentMethod;

    const hasReturn = !!(tripInput.hasReturnTrip || tripInput.returnBooked);
    const hasSeparateContact = !!(
      tripInput.hasSeparateContactPerson ||
      (tripInput.contactPerson && tripInput.contactPerson.name)
    );
    const hasStops = !!(
      tripInput.hasIntermediateStops ||
      (tripInput.intermediateStops && tripInput.intermediateStops.length > 0)
    );
    const isMultiCar = !!(
      tripInput.multipleVehiclesRequested ||
      (tripInput.vehicleCount && tripInput.vehicleCount > 1)
    );

    let pickupHour = 12;
    if (tripInput.scheduledPickupTime) {
      try {
        pickupHour = new Date(tripInput.scheduledPickupTime).getHours();
      } catch {
        pickupHour = 12;
      }
    }

    const tierResults = {
      tier1: { matched: false, reason: undefined as string | undefined },
      tier2: { matched: false, reason: undefined as string | undefined },
      tier3: { matched: false, reason: undefined as string | undefined },
    };

    // ─────────────────────────────────────────────────────────────
    // 1. TIER 3: BLACKLIST & SECURITY BLOCK EVALUATION
    // ─────────────────────────────────────────────────────────────
    if (t3.enabled && this.config.blacklistEnabled) {
      // Passenger Blacklist
      if (t3.enforcePassengerBlacklist && customer) {
        if (customer.isBlacklisted || customer.isArchived) {
          tierResults.tier3 = {
            matched: true,
            reason: customer.blacklistReason || 'Passenger account is blacklisted or archived.',
          };
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: tierResults.tier3.reason,
            matchedRuleTags: ['BLACKLISTED_USER'],
            tierResults,
          };
        }

        // Hard Score Floor (Score in T3 bracket)
        const scoreFloor = t3.customerScoreMax ?? (t3.hardCustomerScoreFloor ? t3.hardCustomerScoreFloor - 1 : 39);
        if (customer.customerScore !== undefined && customer.customerScore <= scoreFloor) {
          tierResults.tier3 = {
            matched: true,
            reason: `Customer score (${customer.customerScore}) is at or below security block threshold (${scoreFloor}). Account restricted.`,
          };
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: tierResults.tier3.reason,
            matchedRuleTags: ['CRITICAL_LOW_SCORE_BLOCK'],
            tierResults,
          };
        }
      }

      // Prohibited Pickup or Dropoff Geofences
      if (tripInput.isPickupProhibited || tripInput.isDropoffProhibited) {
        tierResults.tier3 = {
          matched: true,
          reason: 'Pickup or dropoff location is inside a prohibited security exclusion geofence.',
        };
        return {
          mode: 'BLACKLIST_BLOCK',
          reason: tierResults.tier3.reason,
          matchedRuleTags: ['BLACKLISTED_LOCATION'],
          tierResults,
        };
      }

      // Spatial Blacklist evaluation via coordinates
      if (blacklistedLocations && blacklistedLocations.length > 0) {
        const coordsToTest = [
          tripInput.pickupLocation?.coordinates,
          tripInput.dropoffLocation?.coordinates,
        ].filter((c) => !!c) as { lat: number; lng: number }[];

        for (const loc of blacklistedLocations) {
          if (!loc.isActive || loc.isArchived) continue;
          for (const coord of coordsToTest) {
            if (loc.coordinates && loc.radiusMiles) {
              const dist = this.calculateDistance(coord, loc.coordinates);
              if (dist <= loc.radiusMiles && loc.action === 'BLACKLIST_BLOCK') {
                tierResults.tier3 = {
                  matched: true,
                  reason: `Location is in prohibited safety zone: ${loc.reasonCode || loc.name}`,
                };
                return {
                  mode: 'BLACKLIST_BLOCK',
                  reason: tierResults.tier3.reason,
                  matchedRuleTags: ['BLACKLISTED_LOCATION'],
                  tierResults,
                };
              }
            }
          }
        }
      }

      // Driver Blacklist
      if (t3.enforceDriverBlacklist && driver) {
        if (driver.isBlacklisted || driver.isArchived) {
          tierResults.tier3 = {
            matched: true,
            reason: driver.blacklistReason || 'Assigned driver profile is blacklisted or archived.',
          };
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: tierResults.tier3.reason,
            matchedRuleTags: ['BLACKLISTED_DRIVER'],
            tierResults,
          };
        }
      }

      // Grounded Vehicle
      if (t3.enforceVehicleGrounding && tripInput.assignedVehicle) {
        if ((tripInput.assignedVehicle as any).isBlacklisted || (tripInput.assignedVehicle as any).isArchived) {
          tierResults.tier3 = {
            matched: true,
            reason: 'Assigned vehicle is grounded for safety inspection or archived.',
          };
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: tierResults.tier3.reason,
            matchedRuleTags: ['GROUNDED_VEHICLE'],
            tierResults,
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. TIER 2: REQUIRE HUMAN REVIEW EVALUATION
    // ─────────────────────────────────────────────────────────────
    const reviewTags: string[] = [];
    const reviewReasons: string[] = [];

    if (t2.enabled) {
      // Score in Tier 2 Review Range
      if (customer && customer.customerScore !== undefined) {
        if (customer.customerScore >= t2.customerScoreMin && customer.customerScore <= t2.customerScoreMax) {
          reviewTags.push('REVIEW_CUSTOMER_SCORE');
          reviewReasons.push(`Customer score (${customer.customerScore}) falls in review bracket (${t2.customerScoreMin}-${t2.customerScoreMax}).`);
        }
      } else if (t2.allowUnratedGuests && !customer) {
        // Holding unrated guest accounts
        reviewTags.push('UNRATED_GUEST');
        reviewReasons.push('First-time unrated guest rider requires dispatch verification.');
      }

      // Granular Separated Pickup Location Review
      if (
        (t2.pickupLocationMode === 'airports' && (tripInput.pickupAirportCode || tripInput.isPickupAirport || tripInput.flightNumber)) ||
        (t2.pickupLocationMode === 'specific_zones' && tripInput.pickupZoneId && t2.pickupZoneIds.includes(tripInput.pickupZoneId))
      ) {
        reviewTags.push('PICKUP_LOCATION_REVIEW');
        reviewReasons.push('Pickup location requires airport/corridor operational review.');
      }

      // Granular Separated Dropoff Location Review
      if (
        (t2.dropoffLocationMode === 'airports' && tripInput.isDropoffAirport) ||
        (t2.dropoffLocationMode === 'outside_service_area') ||
        (t2.dropoffLocationMode === 'specific_zones' && tripInput.dropoffZoneId && t2.dropoffZoneIds.includes(tripInput.dropoffZoneId))
      ) {
        if (tripInput.dropoffZoneId && t2.dropoffZoneIds.includes(tripInput.dropoffZoneId)) {
          reviewTags.push('DROPOFF_LOCATION_REVIEW');
          reviewReasons.push('Dropoff location in designated review zone.');
        }
      }

      // Time Schedule / Late Night Review
      if (t2.timeMode === 'late_night' || t2.timeMode === 'custom_window') {
        const isWithinWindow =
          t2.startHour > t2.endHour
            ? pickupHour >= t2.startHour || pickupHour < t2.endHour
            : pickupHour >= t2.startHour && pickupHour < t2.endHour;

        if (isWithinWindow) {
          reviewTags.push('REVIEW_TIME_WINDOW');
          reviewReasons.push(
            `Pickup at ${pickupHour}:00 falls within operational review window (${t2.startHour}:00 - ${t2.endHour}:00).`
          );
        }
      }

      // Price / Fare Bounds (High Value or Below Min)
      if (t2.maxPrice > 0 && evalFare >= t2.maxPrice) {
        reviewTags.push('HIGH_VALUE_FARE');
        reviewReasons.push(`Estimated fare ($${evalFare.toFixed(2)}) meets or exceeds high-value threshold ($${t2.maxPrice}).`);
      } else if (t2.minPrice > 0 && evalFare < t2.minPrice) {
        reviewTags.push('MIN_PRICE_REVIEW');
        reviewReasons.push(`Estimated fare ($${evalFare.toFixed(2)}) is below minimum review floor ($${t2.minPrice}).`);
      }

      // Payment Method Trigger (e.g. Cash, Card on board)
      if (t2.paymentMethods && t2.paymentMethods.length > 0 && t2.paymentMethods.includes(evalPayment)) {
        reviewTags.push('PAYMENT_METHOD_REVIEW');
        reviewReasons.push(`Payment method "${evalPayment.toUpperCase()}" requires dispatcher authorization.`);
      }

      // Operational Trip Flags
      if (t2.matchReturnBooked && hasReturn) {
        reviewTags.push('RETURN_TRIP_COORDINATION');
        reviewReasons.push('Round-trip reservation requires return flight/schedule alignment.');
      }
      if (t2.matchSeparateContactPerson && hasSeparateContact) {
        reviewTags.push('THIRD_PARTY_CONTACT');
        reviewReasons.push('Booking placed with third-party contact person (booker ≠ passenger).');
      }
      if (t2.matchIntermediateStops && hasStops) {
        reviewTags.push('MULTI_STOP_ROUTE');
        reviewReasons.push('Route includes multiple intermediate stops requiring waypoint confirmation.');
      }
      if (t2.matchMultipleVehicles && isMultiCar) {
        reviewTags.push('MULTI_CAR_CONVOY');
        reviewReasons.push('Reservation requests 2+ fleet vehicles requiring fleet coordination.');
      }

      // Driver Score for Premium
      if (
        driver &&
        driver.driverScore !== undefined &&
        tripInput.vehicleTier === 'premium' &&
        t2.minDriverScoreForPremium &&
        driver.driverScore < t2.minDriverScoreForPremium
      ) {
        reviewTags.push('LOW_DRIVER_SCORE_PREMIUM');
        reviewReasons.push(`Driver score (${driver.driverScore}) is below premium threshold (${t2.minDriverScoreForPremium}).`);
      }
    }

    if (reviewTags.length > 0) {
      tierResults.tier2 = {
        matched: true,
        reason: reviewReasons[0] || 'Booking flagged for human dispatcher review.',
      };
      return {
        mode: 'REQUIRE_REVIEW',
        reason: tierResults.tier2.reason,
        matchedRuleTags: reviewTags,
        tierResults,
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 3. TIER 1: AUTO-CONFIRM PASS-THROUGH EVALUATION
    // ─────────────────────────────────────────────────────────────
    if (t1.enabled) {
      // Score qualification
      if (customer && customer.customerScore !== undefined) {
        if (customer.customerScore < t1.customerScoreMin) {
          tierResults.tier1 = {
            matched: false,
            reason: `Customer score (${customer.customerScore}) is below auto-confirm threshold (${t1.customerScoreMin}).`,
          };
          return {
            mode: 'REQUIRE_REVIEW',
            reason: tierResults.tier1.reason,
            matchedRuleTags: ['LOW_CUSTOMER_SCORE'],
            tierResults,
          };
        }
      } else if (!t1.allowUnratedGuests && !customer) {
        tierResults.tier1 = {
          matched: false,
          reason: 'Tier 1 Auto-Confirm requires an established customer account.',
        };
        return {
          mode: 'REQUIRE_REVIEW',
          reason: tierResults.tier1.reason,
          matchedRuleTags: ['UNRATED_GUEST'],
          tierResults,
        };
      }

      // Operating Time Window
      if (t1.timeMode === 'custom_window') {
        const isInWindow =
          t1.startHour > t1.endHour
            ? pickupHour >= t1.startHour || pickupHour < t1.endHour
            : pickupHour >= t1.startHour && pickupHour < t1.endHour;

        if (!isInWindow) {
          tierResults.tier1 = {
            matched: false,
            reason: `Pickup at ${pickupHour}:00 is outside auto-confirm operating window (${t1.startHour}:00 - ${t1.endHour}:00).`,
          };
          return {
            mode: 'REQUIRE_REVIEW',
            reason: tierResults.tier1.reason,
            matchedRuleTags: ['OUTSIDE_AUTO_HOURS'],
            tierResults,
          };
        }
      }

      // Fare Bounds
      if (t1.maxPrice > 0 && evalFare > t1.maxPrice) {
        tierResults.tier1 = {
          matched: false,
          reason: `Fare ($${evalFare.toFixed(2)}) exceeds auto-confirm ceiling ($${t1.maxPrice}).`,
        };
        return {
          mode: 'REQUIRE_REVIEW',
          reason: tierResults.tier1.reason,
          matchedRuleTags: ['FARE_EXCEEDS_AUTO_CEILING'],
          tierResults,
        };
      }
      if (t1.minPrice > 0 && evalFare < t1.minPrice) {
        tierResults.tier1 = {
          matched: false,
          reason: `Fare ($${evalFare.toFixed(2)}) is below auto-confirm minimum ($${t1.minPrice}).`,
        };
        return {
          mode: 'REQUIRE_REVIEW',
          reason: tierResults.tier1.reason,
          matchedRuleTags: ['FARE_BELOW_AUTO_FLOOR'],
          tierResults,
        };
      }

      // Payment Method allowed for Auto-Confirm
      if (t1.paymentMethods && t1.paymentMethods.length > 0 && !t1.paymentMethods.includes(evalPayment)) {
        tierResults.tier1 = {
          matched: false,
          reason: `Payment method "${evalPayment.toUpperCase()}" is not eligible for auto-confirm pass-through.`,
        };
        return {
          mode: 'REQUIRE_REVIEW',
          reason: tierResults.tier1.reason,
          matchedRuleTags: ['PAYMENT_NOT_AUTO_CONFIRMED'],
          tierResults,
        };
      }

      // Complex trip flags disqualifying instant auto-confirm
      if (t1.matchReturnBooked && hasReturn) {
        return {
          mode: 'REQUIRE_REVIEW',
          reason: 'Return trip reservation requires dispatcher review.',
          matchedRuleTags: ['RETURN_TRIP_DISQUALIFIED_AUTO'],
          tierResults,
        };
      }
      if (t1.matchSeparateContactPerson && hasSeparateContact) {
        return {
          mode: 'REQUIRE_REVIEW',
          reason: 'Third-party contact requires dispatcher review.',
          matchedRuleTags: ['THIRD_PARTY_DISQUALIFIED_AUTO'],
          tierResults,
        };
      }
      if (t1.matchIntermediateStops && hasStops) {
        return {
          mode: 'REQUIRE_REVIEW',
          reason: 'Multiple stops require dispatcher route review.',
          matchedRuleTags: ['MULTI_STOP_DISQUALIFIED_AUTO'],
          tierResults,
        };
      }
      if (t1.matchMultipleVehicles && isMultiCar) {
        return {
          mode: 'REQUIRE_REVIEW',
          reason: 'Multi-vehicle request requires fleet dispatcher review.',
          matchedRuleTags: ['MULTI_CAR_DISQUALIFIED_AUTO'],
          tierResults,
        };
      }

      tierResults.tier1 = {
        matched: true,
        reason: 'Passed all Tier 1 criteria for instant confirmation.',
      };
      return {
        mode: 'AUTO_CONFIRM',
        reason: 'Passed all Tier 1 criteria for instant confirmation.',
        tierResults,
      };
    }

    return {
      mode: 'AUTO_CONFIRM',
      tierResults,
    };
  }

  private calculateDistance(
    coord1: { lat: number; lng: number },
    coord2: { lat: number; lng: number }
  ): number {
    const R = 3958.8; // Earth radius in miles
    const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.lat * Math.PI) / 180) *
        Math.cos((coord2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

let instance: BookingRulesEngine | null = null;
export function getBookingRulesEngine(): BookingRulesEngine {
  if (!instance) {
    instance = new BookingRulesEngine();
  }
  return instance;
}
