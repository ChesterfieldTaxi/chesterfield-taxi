import type { Trip } from '../types/trip';
import type { PassengerAccount } from '../types/passenger';
import type { DriverProfile } from '../types/driver';
import type { BlacklistedLocation } from '../types/zone';

export type BookingExecutionMode = 'AUTO_CONFIRM' | 'REQUIRE_REVIEW' | 'BLACKLIST_BLOCK';

export interface BookingRuleEvaluationResult {
  mode: BookingExecutionMode;
  reason?: string;
  matchedRuleTags?: string[];
}

/**
 * Isolated Tier 1 (Auto-Confirm) Configuration
 */
export interface Tier1AutoConfirmConfig {
  enabled: boolean;
  minCustomerScore: number; // e.g. 70
  pickupLocationMode: 'all' | 'specific_zones';
  allowedPickupZones: string[];
  dropoffLocationMode: 'all' | 'specific_zones';
  allowedDropoffZones: string[];
  timeMode: 'all_hours' | 'time_window';
  operatingHours?: '24_7' | 'custom_window';
  allowedStartHour: number; // e.g. 5 (5 AM)
  allowedEndHour: number;   // e.g. 23 (11 PM)
  customWindowStartHour?: number;
  customWindowEndHour?: number;
  allowedServiceClasses: string[]; // e.g. ['standard', 'premium', 'xl', 'wheelchair']
  maxEstimatedFare: number; // e.g. 150
  maxTripFare?: number;
  excludeNewCustomers?: boolean;
  locationScope?: 'anywhere' | 'whitelisted_zones_only';
}

/**
 * Isolated Tier 2 (Require Human Review) Configuration
 */
export interface Tier2RequireReviewConfig {
  enabled: boolean;
  customerScoreMin: number; // e.g. 40
  customerScoreMax: number; // e.g. 69
  triggerOnNewCustomers?: boolean;
  reviewUnratedGuests: boolean;
  reviewAirportLocations: boolean;
  flagSensitiveLocations?: boolean;
  reviewSensitiveZones: string[];
  lateNightEnabled: boolean;
  lateNightReviewRequired?: boolean;
  lateNightStartHour: number; // e.g. 23 (11 PM)
  lateNightEndHour: number;   // e.g. 4 (4 AM)
  highValueThreshold: number; // e.g. 100 ($)
  highValueFareThreshold?: number;
  minDriverScoreForPremium: number; // e.g. 85
  minimumDriverScoreForPremium?: number;
}

/**
 * Isolated Tier 3 (Blacklist / Security Block) Configuration
 */
export interface Tier3BlacklistBlockConfig {
  enabled: boolean;
  hardCustomerScoreFloor: number; // e.g. 40 (scores < 40 trigger instant block)
  hardScoreFloor?: number;
  hardScoreFloorEnabled?: boolean;
  enforcePassengerBlacklist: boolean;
  blockBlacklistedCustomers?: boolean;
  enforceDriverBlacklist: boolean;
  enforceVehicleGrounding: boolean;
  blockGroundedVehicles?: boolean;
  prohibitedZones: string[];
  blockProhibitedZones?: boolean;
  blockOutsidePerimeter: boolean;
  securityAuditLogging: boolean;
  logSecurityAudit?: boolean;
}

export interface BookingRulesConfig {
  // Backward compatibility fields
  minimumCustomerScoreForAutoConfirm: number;
  minimumDriverScoreForPremium: number;
  lateNightReviewRequired: boolean;
  lateNightStartHour: number; // 24h format e.g. 23
  lateNightEndHour: number; // 24h format e.g. 4
  blacklistEnabled: boolean;

  // Isolated Tier Controls
  tier1: Tier1AutoConfirmConfig;
  tier2: Tier2RequireReviewConfig;
  tier3: Tier3BlacklistBlockConfig;
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
    minCustomerScore: 70,
    pickupLocationMode: 'all',
    allowedPickupZones: [],
    dropoffLocationMode: 'all',
    allowedDropoffZones: [],
    timeMode: 'all_hours',
    operatingHours: '24_7',
    allowedStartHour: 5,
    allowedEndHour: 23,
    customWindowStartHour: 5,
    customWindowEndHour: 23,
    allowedServiceClasses: ['standard', 'premium', 'xl', 'wheelchair'],
    maxEstimatedFare: 200,
    maxTripFare: 200,
    excludeNewCustomers: false,
    locationScope: 'anywhere',
  },

  tier2: {
    enabled: true,
    customerScoreMin: 40,
    customerScoreMax: 69,
    triggerOnNewCustomers: true,
    reviewUnratedGuests: true,
    reviewAirportLocations: true,
    flagSensitiveLocations: true,
    reviewSensitiveZones: [],
    lateNightEnabled: true,
    lateNightReviewRequired: true,
    lateNightStartHour: 23,
    lateNightEndHour: 4,
    highValueThreshold: 100,
    highValueFareThreshold: 100,
    minDriverScoreForPremium: 85,
    minimumDriverScoreForPremium: 85,
  },

  tier3: {
    enabled: true,
    hardCustomerScoreFloor: 40,
    hardScoreFloor: 40,
    hardScoreFloorEnabled: true,
    enforcePassengerBlacklist: true,
    blockBlacklistedCustomers: true,
    enforceDriverBlacklist: true,
    enforceVehicleGrounding: true,
    blockGroundedVehicles: true,
    prohibitedZones: [],
    blockProhibitedZones: true,
    blockOutsidePerimeter: true,
    securityAuditLogging: true,
    logSecurityAudit: true,
  },
};

export type BookingEvaluationTripInput = Partial<Trip> & {
  fare?: number;
  fareEstimate?: number;
  pickupAirportCode?: string;
  flightNumber?: string;
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
    // Sync backward compatibility properties if tier properties were provided
    if (config.tier1?.minCustomerScore !== undefined) {
      this.config.minimumCustomerScoreForAutoConfirm = config.tier1.minCustomerScore;
    }
    if (config.tier2?.lateNightEnabled !== undefined) {
      this.config.lateNightReviewRequired = config.tier2.lateNightEnabled;
    }
    if (config.tier2?.lateNightStartHour !== undefined) {
      this.config.lateNightStartHour = config.tier2.lateNightStartHour;
    }
    if (config.tier2?.lateNightEndHour !== undefined) {
      this.config.lateNightEndHour = config.tier2.lateNightEndHour;
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

    // ─── TIER 3: BLACKLIST & SECURITY BLOCK EVALUATION ───
    if (t3.enabled && this.config.blacklistEnabled) {
      // 1. Passenger Account Blacklist / Archive
      if (t3.enforcePassengerBlacklist && customer) {
        if (customer.isBlacklisted || customer.isArchived) {
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: customer.blacklistReason || 'Passenger account is blacklisted or archived.',
            matchedRuleTags: ['BLACKLISTED_USER']
          };
        }

        // Hard Customer Score Floor
        if (customer.customerScore !== undefined && customer.customerScore < t3.hardCustomerScoreFloor) {
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: `Customer score (${customer.customerScore}) is below safety threshold (${t3.hardCustomerScoreFloor}). Account restricted.`,
            matchedRuleTags: ['CRITICAL_LOW_SCORE_BLOCK']
          };
        }
      }

      // 2. Driver Account Blacklist / Archive
      if (t3.enforceDriverBlacklist && driver) {
        if (driver.isBlacklisted || driver.isArchived) {
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: driver.blacklistReason || 'Assigned driver profile is blacklisted or archived.',
            matchedRuleTags: ['BLACKLISTED_DRIVER']
          };
        }
      }

      // 3. Prohibited Pickup / Dropoff Zones and Spatial Blacklist
      if (blacklistedLocations && blacklistedLocations.length > 0) {
        const coordsToTest = [
          tripInput.pickupLocation?.coordinates,
          tripInput.dropoffLocation?.coordinates
        ].filter(c => !!c) as {lat: number; lng: number}[];

        for (const loc of blacklistedLocations) {
          if (!loc.isActive || loc.isArchived) continue;
          
          for (const coord of coordsToTest) {
            if (loc.coordinates && loc.radiusMiles) {
              const dist = this.calculateDistance(coord, loc.coordinates);
              if (dist <= loc.radiusMiles) {
                if (loc.action === 'BLACKLIST_BLOCK') {
                  return {
                    mode: 'BLACKLIST_BLOCK',
                    reason: `Location is in prohibited safety zone: ${loc.reasonCode || loc.name}`,
                    matchedRuleTags: ['BLACKLISTED_LOCATION']
                  };
                }
              }
            }
          }
        }
      }

      // 4. Grounded Vehicle Check
      if (t3.enforceVehicleGrounding && tripInput.assignedVehicle) {
        if ((tripInput.assignedVehicle as any).isBlacklisted || (tripInput.assignedVehicle as any).isArchived) {
          return {
            mode: 'BLACKLIST_BLOCK',
            reason: 'Assigned vehicle is grounded for safety inspection or archived.',
            matchedRuleTags: ['GROUNDED_VEHICLE']
          };
        }
      }
    }

    // ─── TIER 2: REQUIRE HUMAN REVIEW EVALUATION ───
    const reviewTags: string[] = [];
    let reviewReasons: string[] = [];

    if (t2.enabled) {
      // 1. Customer Score within Review Range
      if (customer && customer.customerScore !== undefined) {
        if (customer.customerScore >= t2.customerScoreMin && customer.customerScore <= t2.customerScoreMax) {
          reviewTags.push('REVIEW_CUSTOMER_SCORE');
          reviewReasons.push(`Customer score (${customer.customerScore}) requires operational review (${t2.customerScoreMin}-${t2.customerScoreMax}).`);
        }
      } else if (t2.reviewUnratedGuests && !customer) {
        reviewTags.push('UNRATED_GUEST');
        reviewReasons.push('First-time guest customer booking requires dispatch verification.');
      }

      // 2. Sensitive Locations / Airport Review
      if (t2.reviewAirportLocations && (tripInput.pickupAirportCode || tripInput.flightNumber)) {
        reviewTags.push('AIRPORT_FLIGHT_TRACKING');
        reviewReasons.push('Airport reservation requires flight itinerary and terminal review.');
      }

      if (blacklistedLocations && blacklistedLocations.length > 0) {
        const coordsToTest = [
          tripInput.pickupLocation?.coordinates,
          tripInput.dropoffLocation?.coordinates
        ].filter(c => !!c) as {lat: number; lng: number}[];

        for (const loc of blacklistedLocations) {
          if (!loc.isActive || loc.isArchived) continue;
          for (const coord of coordsToTest) {
            if (loc.coordinates && loc.radiusMiles) {
              const dist = this.calculateDistance(coord, loc.coordinates);
              if (dist <= loc.radiusMiles && loc.action === 'REQUIRE_REVIEW') {
                reviewTags.push('REVIEW_LOCATION');
                reviewReasons.push(`Location flagged for review: ${loc.reasonCode || loc.name}`);
              }
            }
          }
        }
      }

      // 3. Late Night Review Window
      if (t2.lateNightEnabled && tripInput.scheduledPickupTime) {
        const pickupDate = new Date(tripInput.scheduledPickupTime);
        const hour = pickupDate.getHours();
        
        const isLate = t2.lateNightStartHour > t2.lateNightEndHour 
          ? (hour >= t2.lateNightStartHour || hour < t2.lateNightEndHour)
          : (hour >= t2.lateNightStartHour && hour < t2.lateNightEndHour);

        if (isLate) {
          reviewTags.push('LATE_NIGHT_POLICY');
          reviewReasons.push(`Pickup at ${hour}:00 falls within late-night review window (${t2.lateNightStartHour}:00 - ${t2.lateNightEndHour}:00).`);
        }
      }

      // 4. High-Value Fare Threshold
      const evalFare = tripInput.fare ?? tripInput.fareEstimate ?? tripInput.pricing?.totalFare ?? 0;
      if (t2.highValueThreshold > 0 && evalFare >= t2.highValueThreshold) {
        reviewTags.push('HIGH_VALUE_FARE');
        reviewReasons.push(`Estimated fare ($${evalFare.toFixed(2)}) meets or exceeds high-value threshold ($${t2.highValueThreshold}).`);
      }

      // 5. Driver Score for Premium Class
      if (driver && driver.driverScore !== undefined && tripInput.vehicleTier === 'premium') {
        if (driver.driverScore < t2.minDriverScoreForPremium) {
          reviewTags.push('LOW_DRIVER_SCORE_PREMIUM');
          reviewReasons.push(`Driver score (${driver.driverScore}) is below premium threshold (${t2.minDriverScoreForPremium}).`);
        }
      }
    }

    if (reviewTags.length > 0) {
      return {
        mode: 'REQUIRE_REVIEW',
        reason: reviewReasons[0] || 'Booking flagged for human dispatcher review.',
        matchedRuleTags: reviewTags
      };
    }

    // ─── TIER 1: AUTO-CONFIRM EVALUATION ───
    if (t1.enabled) {
      // Check customer score qualification
      if (customer && customer.customerScore !== undefined) {
        if (customer.customerScore < t1.minCustomerScore) {
          return {
            mode: 'REQUIRE_REVIEW',
            reason: `Customer score (${customer.customerScore}) is below auto-confirm threshold (${t1.minCustomerScore}).`,
            matchedRuleTags: ['LOW_CUSTOMER_SCORE']
          };
        }
      }

      // Operating time window check if not all_hours
      if (t1.timeMode === 'time_window' && tripInput.scheduledPickupTime) {
        const pickupDate = new Date(tripInput.scheduledPickupTime);
        const hour = pickupDate.getHours();
        const isInWindow = t1.allowedStartHour > t1.allowedEndHour
          ? (hour >= t1.allowedStartHour || hour < t1.allowedEndHour)
          : (hour >= t1.allowedStartHour && hour < t1.allowedEndHour);
        if (!isInWindow) {
          return {
            mode: 'REQUIRE_REVIEW',
            reason: `Pickup at ${hour}:00 is outside auto-confirm operating window (${t1.allowedStartHour}:00 - ${t1.allowedEndHour}:00).`,
            matchedRuleTags: ['OUTSIDE_AUTO_HOURS']
          };
        }
      }

      // Fare ceiling
      const evalFare = tripInput.fare ?? tripInput.fareEstimate ?? tripInput.pricing?.totalFare ?? 0;
      if (t1.maxEstimatedFare > 0 && evalFare > t1.maxEstimatedFare) {
        return {
          mode: 'REQUIRE_REVIEW',
          reason: `Fare ($${evalFare.toFixed(2)}) exceeds auto-confirm ceiling ($${t1.maxEstimatedFare}).`,
          matchedRuleTags: ['FARE_EXCEEDS_AUTO_CEILING']
        };
      }

      return {
        mode: 'AUTO_CONFIRM'
      };
    }

    return {
      mode: 'AUTO_CONFIRM'
    };
  }

  private calculateDistance(coord1: {lat: number; lng: number}, coord2: {lat: number; lng: number}): number {
    const R = 3958.8; // Earth's radius in statute miles
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
