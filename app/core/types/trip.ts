/**
 * Trip Data Model & Firestore State Machine
 * 
 * Enforces the dispatch state machine lifecycle:
 * pending -> offered -> assigned -> completed (with 'cancelled' as escape hatch)
 * and driver broadcasting targeting arrays (offeredToIds).
 */

/**
 * State machine literal types for Trip lifecycle.
 */
export type CoreTripStatus = 'pending' | 'offered' | 'assigned' | 'completed';
export type TripStatus = CoreTripStatus | 'cancelled';

export const TRIP_STATUSES: readonly TripStatus[] = [
  'pending',
  'offered',
  'assigned',
  'completed',
  'cancelled',
] as const;

/**
 * Valid state transitions mapping adhering strictly to the dispatch state machine.
 */
export const TRIP_STATE_TRANSITIONS = {
  pending: ['offered', 'assigned', 'cancelled'],
  offered: ['assigned', 'pending', 'cancelled'],
  assigned: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
} as const satisfies Record<TripStatus, readonly TripStatus[]>;

/**
 * Validates whether a state transition is permitted by the state machine.
 */
export function isValidTripTransition(
  currentStatus: TripStatus,
  targetStatus: TripStatus
): boolean {
  const allowedTransitions = TRIP_STATE_TRANSITIONS[currentStatus];
  return (allowedTransitions as readonly TripStatus[]).includes(targetStatus);
}

/**
 * Vehicle tier categories supported by the platform.
 */
export type VehicleTier = 'standard' | 'premium' | 'xl' | 'wheelchair';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TripLocation {
  address: string;
  formattedAddress?: string;
  placeId?: string;
  coordinates?: GeoPoint;
  unitOrApt?: string;
  notes?: string;
  flightNotes?: string;
  driverNotes?: string;
}

export interface TripPassenger {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passengerCount: number;
  luggageCount: number;
  specialRequests?: string;
}

export interface TripPricing {
  baseFare: number;
  distanceMiles: number;
  durationMinutes: number;
  distanceRate: number;
  timeRate: number;
  vehicleMultiplier: number;
  surgeMultiplier: number;
  discountAmount: number;
  subtotal: number;
  totalFare: number;
  currency: string;
}

export type PaymentMethod = 'card' | 'cash' | 'corporate';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface TripPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionId?: string;
  paidAt?: string;
}

export interface TripStatusHistoryEntry {
  from: TripStatus | null;
  to: TripStatus;
  timestamp: string; // ISO 8601 string
  actorId?: string;
  actorRole?: 'passenger' | 'driver' | 'admin' | 'system';
  reason?: string;
}

/**
 * Core Trip Document Model stored in Firestore.
 */
export interface Trip {
  id: string;
  customerId?: string;

  /** State machine status */
  status: TripStatus;

  /**
   * Driver targeting broadcast array.
   * Firestore Security Rules rely on this array to permit only targeted drivers
   * to read or accept the specific trip offer.
   */
  offeredToIds: string[];

  /** Drivers who have explicitly declined or timed out on this offer */
  rejectedByIds: string[];

  /** Currently assigned driver, null if unassigned */
  assignedDriverId: string | null;

  /** Location details */
  pickupLocation: TripLocation;
  dropoffLocation: TripLocation;
  flightNotes?: string;
  driverNotes?: string;

  /** Schedule & timing */
  bookingType: 'asap' | 'scheduled';
  scheduledPickupTime?: string; // ISO 8601 date string
  actualPickupTime?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: 'passenger' | 'driver' | 'admin' | 'system';

  /** Passenger & Vehicle */
  passenger: TripPassenger;
  vehicleTier: VehicleTier;

  /** Pricing & Payment */
  pricing: TripPricing;
  payment: TripPayment;

  /** State Machine Audit Trail */
  statusHistory: TripStatusHistoryEntry[];

  /** Timestamps */
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string

  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input payload when creating a new trip booking.
 */
export type CreateTripInput = Omit<
  Trip,
  'id' | 'status' | 'offeredToIds' | 'rejectedByIds' | 'assignedDriverId' | 'statusHistory' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
};
