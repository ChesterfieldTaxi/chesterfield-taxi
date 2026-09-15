import type { Trip } from '../types/trip';
import type { PassengerAccount } from '../types/passenger';
import type { DriverProfile } from '../types/driver';

export type BookingExecutionMode = 'AUTO_CONFIRM' | 'REQUIRE_REVIEW' | 'BLACKLIST_BLOCK';

export interface BookingRuleEvaluationResult {
  mode: BookingExecutionMode;
  reason?: string;
  matchedRuleTags?: string[];
}

export interface BookingRulesConfig {
  minimumCustomerScoreForAutoConfirm: number;
  minimumDriverScoreForPremium: number;
  lateNightReviewRequired: boolean;
  lateNightStartHour: number; // 24h format e.g. 23
  lateNightEndHour: number; // 24h format e.g. 4
  blacklistEnabled: boolean;
}

const DEFAULT_CONFIG: BookingRulesConfig = {
  minimumCustomerScoreForAutoConfirm: 70, // 0-100
  minimumDriverScoreForPremium: 85,
  lateNightReviewRequired: true,
  lateNightStartHour: 23,
  lateNightEndHour: 4,
  blacklistEnabled: true
};

export class BookingRulesEngine {
  private config: BookingRulesConfig;

  constructor(config: Partial<BookingRulesConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluateBookingRequest(
    tripInput: Partial<Trip>, 
    customer?: PassengerAccount,
    driver?: DriverProfile
  ): BookingRuleEvaluationResult {
    
    // Mode C: Blacklist Block
    if (this.config.blacklistEnabled && customer) {
      if (customer.isBlacklisted || customer.isArchived) {
        return {
          mode: 'BLACKLIST_BLOCK',
          reason: customer.blacklistReason || 'Account is suspended or archived.',
          matchedRuleTags: ['BLACKLISTED_USER']
        };
      }
    }

    if (this.config.blacklistEnabled && driver) {
      if (driver.isBlacklisted || driver.isArchived) {
         return {
          mode: 'BLACKLIST_BLOCK',
          reason: driver.blacklistReason || 'Driver account is suspended or archived.',
          matchedRuleTags: ['BLACKLISTED_DRIVER']
        };
      }
    }

    const tags: string[] = [];
    let requireReview = false;
    let reviewReason = '';

    // Customer Score checks
    if (customer && customer.customerScore !== undefined) {
      if (customer.customerScore < this.config.minimumCustomerScoreForAutoConfirm) {
        requireReview = true;
        tags.push('LOW_CUSTOMER_SCORE');
        reviewReason = `Customer score (${customer.customerScore}) is below auto-confirm threshold.`;
      }
    }

    // Late Night checks
    if (this.config.lateNightReviewRequired && tripInput.scheduledPickupTime) {
      const pickupDate = new Date(tripInput.scheduledPickupTime);
      const hour = pickupDate.getHours();
      
      const isLate = this.config.lateNightStartHour > this.config.lateNightEndHour 
        ? (hour >= this.config.lateNightStartHour || hour < this.config.lateNightEndHour)
        : (hour >= this.config.lateNightStartHour && hour < this.config.lateNightEndHour);

      if (isLate) {
        requireReview = true;
        tags.push('LATE_NIGHT_POLICY');
        reviewReason = reviewReason || 'Booking falls within late-night review window.';
      }
    }

    // Driver Score checks (e.g. assigning a driver directly)
    if (driver && driver.driverScore !== undefined && tripInput.vehicleTier === 'premium') {
        if (driver.driverScore < this.config.minimumDriverScoreForPremium) {
           requireReview = true;
           tags.push('LOW_DRIVER_SCORE_PREMIUM');
           reviewReason = reviewReason || 'Driver score does not meet premium service requirements.';
        }
    }

    // Mode B: Require Review
    if (requireReview) {
      return {
        mode: 'REQUIRE_REVIEW',
        reason: reviewReason,
        matchedRuleTags: tags
      };
    }

    // Mode A: Auto Confirm
    return {
      mode: 'AUTO_CONFIRM'
    };
  }
}

let instance: BookingRulesEngine | null = null;
export function getBookingRulesEngine(): BookingRulesEngine {
  if (!instance) {
    instance = new BookingRulesEngine();
  }
  return instance;
}
