/**
 * Driver Domain Types & Mobile App Schemas
 * 
 * Defines Driver Profile, Shift Duty Status, Vehicle Assignment,
 * and live Taximeter Extra Fee adjustments.
 */

import type { DriverTelemetryPing, GeoPoint } from './trip';

export type DriverDutyStatus = 'on_duty' | 'off_duty' | 'on_break';

export type DriverCarOwnership = 'owner_operator' | 'company_owned';

export type DriverPayoutType = 'percent' | 'flat';

export type FlatPayoutPeriod = 'day' | 'week' | 'month';

export interface PaymentTypeCommissionRates {
  cash?: number | null;
  card?: number | null;
  account?: number | null;
}

/**
 * Canonical Live Fleet Map Status (Option C CAD Palette):
 * - available: Green  (on_duty, not currently en_route / arrived / in_progress)
 * - en_route:  Blue   (heading to pickup)
 * - busy:      Red    (arrived at pickup or trip in_progress)
 * - break:     Yellow (on_break, still emitting light 30s GPS)
 * - offline:   Slate  (off_duty or suspended)
 */
export type LiveDriverMapStatus = 'available' | 'en_route' | 'busy' | 'break' | 'offline';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DriverShiftHours {
  enabled: boolean;
  startHour: string; // "07:00"
  endHour: string;   // "17:00"
}


export interface DriverTimeOff {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason?: string;
  createdAt: string;
}

export interface DriverScheduleConfig {
  weeklyHours: Record<DayOfWeek, DriverShiftHours>;
  timeOffList: DriverTimeOff[];
}

export interface DriverProfile {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  cabNumber?: string;
  phone: string;
  email?: string;
  dutyStatus: DriverDutyStatus;
  vehicleUnit: string;
  vehicleId?: string;
  vehicleTier: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  licensePlate?: string;
  /** Car ownership classification (defaults to 'owner_operator') */
  carOwnership?: DriverCarOwnership;
  /** Driver payout mode ('percent' commission split vs 'flat' lease/fee) */
  payoutType?: DriverPayoutType;
  /** Period unit when payoutType === 'flat' */
  flatPayoutPeriod?: FlatPayoutPeriod;
  /** Flat fee/lease amount ($) owed per flatPayoutPeriod */
  flatPayoutAmount?: number;
  /** Configurable driver fare commission share (0.0 - 1.0 or 0 - 100%, default 0.75 / 75%) */
  commissionRate?: number;
  /** Optional per-driver payment-type commission percentages (0 - 100) */
  paymentTypeCommissionRates?: PaymentTypeCommissionRates;
  currentTripId?: string | null;
  zone?: string;
  avatarUrl?: string;
  lastActiveAt?: string;
  /** Live GPS telemetry written continuously while on_duty or on_break */
  currentLocation?: DriverTelemetryPing;
  locationUpdatedAt?: string;
  homeAddress?: string;
  homeCoordinates?: GeoPoint;
  schedule?: DriverScheduleConfig;
  
  /** Universal Governance & Scoring (Phase 29) */
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  
  driverScore?: number; // 0-100 metric
  acceptanceRate?: number; // %
  onTimeArrivalRate?: number; // %
  completionRatio?: number; // %
  averageRating?: number; // 1.0 - 5.0
}

export interface VehicleAssignmentShift {
  id: string;
  driverId: string;
  vehicleId: string;
  vehicleNumber: string;
  startedAt: string; // ISO 8601
  endedAt?: string; // ISO 8601
  status: 'active' | 'completed';
}


export interface DriverShiftRecord {
  id: string;
  driverId: string;
  startedAt: string;
  endedAt?: string;
  status: DriverDutyStatus;
  vehicleUnit: string;
  tripsCompletedCount: number;
  totalEarnings: number;
}

export interface DriverMeterExtra {
  id: string;
  name: string;
  amount: number;
  category: 'toll' | 'parking' | 'luggage' | 'cleaning' | 'custom';
}
