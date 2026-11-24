/**
 * Standing Orders & Recurring Rides Series Data Model (`/standingOrders/{seriesId}` — Platform Phase 54)
 *
 * Represents a managed recurring passenger commute, medical transport, or corporate shuttle series
 * with pause/resume controls, holiday/skip-date exclusions, preferred/staged driver assignment,
 * and rolling horizon extension.
 */

import type { PaymentMethod, TripLocation, TripPricing, VehicleTier } from './trip';

export type StandingOrderStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type StandingOrderFrequency = 'daily' | 'weekdays' | 'weekly' | 'custom';

export type StandingOrderWeeksPattern = 'all' | 'odd' | 'even';

export type PreferredDriverAssignmentMode = 'stage_hold' | 'send_to_driver' | 'unassigned';

export interface StandingOrderPassenger {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  passengerCount: number;
  luggageCount: number;
  specialRequests?: string;
}

export interface StandingOrderRoute {
  pickupLocation: TripLocation;
  intermediateStops?: TripLocation[];
  dropoffLocation: TripLocation;
}

export interface StandingOrderSchedule {
  startDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:mm (24h local)
  frequency: StandingOrderFrequency;
  repeatDays: string[]; // ['Mon', 'Tue', ...]
  repeatWeeksPattern: StandingOrderWeeksPattern;
  untilDate?: string; // YYYY-MM-DD
  skipDates: string[]; // YYYY-MM-DD[]
  skipHolidays?: boolean;
}

export interface StandingOrderSeries {
  id: string;
  status: StandingOrderStatus;
  label: string;
  passenger: StandingOrderPassenger;
  route: StandingOrderRoute;
  schedule: StandingOrderSchedule;
  vehicleTier: VehicleTier;
  vehicleDisplayName?: string;
  pricingSnapshot: TripPricing;
  paymentMethod: PaymentMethod;
  corporateAccountId?: string;
  corporateAccountName?: string;
  billingPo?: string;
  driverNotes?: string;
  preferredDriverId?: string | null;
  preferredDriverLabel?: string | null;
  preferredDriverMode: PreferredDriverAssignmentMode;
  generatedTripIds: string[];
  lastGeneratedDate?: string;
  pausedAt?: string | null;
  pauseReason?: string | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}
