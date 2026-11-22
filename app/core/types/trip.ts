/**
 * Trip Data Model & Firestore State Machine
 * 
 * Enforces the dispatch state machine lifecycle:
 * pending -> offered -> assigned -> completed (with 'cancelled' as escape hatch)
 * and driver broadcasting targeting arrays (offeredToIds).
 */

import type { FlightTelemetrySnapshot } from './flight';

/**
 * State machine literal types for Trip lifecycle.
 */
export type CoreTripStatus =
  | 'pending'
  | 'offered'
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed';

export type TripConfirmationStatus =
  | 'UNCONFIRMED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'unconfirmed'
  | 'confirmed'
  | 'declined';

export type TripStatus = CoreTripStatus | TripConfirmationStatus | 'cancelled';

export const TRIP_STATUSES: readonly TripStatus[] = [
  'UNCONFIRMED',
  'CONFIRMED',
  'DECLINED',
  'unconfirmed',
  'confirmed',
  'declined',
  'pending',
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
] as const;

/**
 * Valid state transitions mapping adhering strictly to the dispatch state machine.
 */
export const TRIP_STATE_TRANSITIONS = {
  UNCONFIRMED: ['CONFIRMED', 'DECLINED', 'cancelled', 'pending', 'assigned', 'accepted', 'en_route'],
  CONFIRMED: ['pending', 'offered', 'assigned', 'accepted', 'en_route', 'cancelled'],
  DECLINED: ['cancelled'],
  unconfirmed: ['CONFIRMED', 'confirmed', 'DECLINED', 'declined', 'cancelled', 'pending', 'assigned', 'accepted', 'en_route'],
  confirmed: ['pending', 'offered', 'assigned', 'accepted', 'en_route', 'cancelled'],
  declined: ['cancelled'],

  pending: ['CONFIRMED', 'confirmed', 'offered', 'assigned', 'accepted', 'en_route', 'cancelled'],
  offered: ['assigned', 'accepted', 'offered', 'CONFIRMED', 'confirmed', 'pending', 'cancelled'],
  assigned: ['accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'pending'],
  accepted: ['en_route', 'arrived', 'in_progress', 'cancelled', 'pending'],
  en_route: ['arrived', 'in_progress', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
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
export type VehicleTier = 'standard' | 'premium' | 'xl' | 'wheelchair' | (string & {});

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DriverTelemetryPing {
  coordinates: GeoPoint;
  speedMph?: number;
  heading?: number;
  accuracy?: number;
  timestamp: string; // ISO 8601
  status?: string;
  isOfflineBuffer?: boolean;
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

export interface PriceLineItem {
  id: string;
  category: 'base' | 'extra' | 'surcharge' | 'discount' | 'rounding';
  label: string;
  detail?: string;
  amount: number; // Positive for charges, negative for discounts
  sourceType?:
    | 'tariff'
    | 'corridor'
    | 'zip_matrix'
    | 'hourly'
    | 'extra'
    | 'surcharge'
    | 'rule'
    | 'discount'
    | 'rounding';
  sourceId?: string;
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
  // Canonical single-source itemized breakdown (sum of amounts === totalFare)
  breakdown?: PriceLineItem[];
  tariffBaseSubtotal?: number;
  // Itemized fee breakdowns (summary analytics fields)
  intermediateStopsCount?: number;
  multiStopSurcharge?: number;
  tollsFee?: number;
  airportSurcharge?: number;
  manualAdjustment?: number;
  carSeatFee?: number;
  passengerSurcharge?: number;
  oversizedLuggageFee?: number;
  customExtrasFee?: number;
  delayFee?: number;
  appliedRuleNames?: string[];
  tariffProfileId?: string;
  tariffProfileName?: string;
  matchedCorridorId?: string;
  matchedCorridorName?: string;
  itemizedSurcharges?: Array<{
    name: string;
    amount: number;
    description?: string;
  }>;
  // Phase 24: In-Vehicle Taximeter & Extra Fees
  meterDistanceMiles?: number;
  meterDurationMinutes?: number;
  meterCalculatedFare?: number;
  driverExtras?: Array<{
    id: string;
    name: string;
    amount: number;
    category: 'toll' | 'parking' | 'luggage' | 'cleaning' | 'custom';
  }>;
  driverExtrasTotal?: number;
}

export type PaymentMethod = 'card' | 'cash' | 'corporate' | 'account';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'pending_invoice' | 'invoiced' | 'settled';

export interface TripPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionId?: string;
  paidAt?: string;
  // Phase 31: External Payment & Card Vaulting Integrations
  paymentIntentId?: string;
  vaultedCardId?: string;
  preAuthHoldAmount?: number;
  // Gratuity, Tolls, Wait Time for corporate itemization
  tipAmount?: number;
  tollsAmount?: number;
  waitTimeAmount?: number;
  corporateAccountId?: string;
  driverPayoutId?: string;
  payoutStatus?: 'pending' | 'settled' | 'withheld';
  cardBrand?: string;
  cardLast4?: string;
  // Phase 36: 1-Tap Pay Links & Webhook Settlement Metadata
  payToken?: string;
  payLinkStatus?: 'open' | 'paid' | 'expired' | 'cancelled' | 'refunded';
  receiptNumber?: string;
  refundedAmount?: number;
  refundedAt?: string;
}

export interface TripStatusHistoryEntry {
  from: TripStatus | null;
  to: TripStatus;
  timestamp: string; // ISO 8601 string
  actorId?: string;
  actorRole?: 'passenger' | 'driver' | 'admin' | 'system';
  reason?: string;
}

export interface TripFieldDiff {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
}

export interface TripAuditEvent {
  action:
    | 'TRIP_REQUESTED'
    | 'AUTO_CONFIRMED'
    | 'FLAGGED_FOR_HUMAN_REVIEW'
    | 'DISPATCH_OFFERED'
    | 'DRIVER_ACCEPTED'
    | 'DRIVER_DECLINED'
    | 'STATUS_CHANGED'
    | 'TRIP_MODIFIED'
    | 'TRIP_COMPLETED'
    | 'TRIP_CANCELED'
    | 'TRIP_REACTIVATED'
    | 'TRIP_COPIED'
    | 'INVOICE_GENERATED'
    | 'PAYMENT_SETTLED'
    | 'SCORE_UPDATED'
    | 'BLACK_LISTED'
    | 'CALL_LOGGED'
    | 'SMS_LOGGED'
    | 'EMAIL_LOGGED';
  timestamp: string; // ISO 8601
  actorId?: string;
  actorRole?: 'system' | 'passenger' | 'driver' | 'admin' | 'dispatcher';
  matchedRuleId?: string;
  context?: string;
  referenceNumber?: string; // e.g. TEL-9481, SMS-3810, EML-1092, OFR-4019, DEC-2918, BKG-1920, INV-4019
  referenceType?: 'call' | 'sms' | 'email' | 'offer' | 'decline' | 'lifecycle' | 'edit' | 'booking' | 'invoice' | 'payment';
  bookingChannel?: 'web' | 'app' | 'dispatch' | 'email' | 'phone';
  bookedBy?: {
    name?: string;
    email?: string;
    role?: string;
    ip?: string;
  };
  fieldChanges?: TripFieldDiff[];
  notes?: string;
}

export interface TripAssignedVehicle {
  vehicleId: string;
  vehicleNumber: string;
  licensePlate: string;
  model: string;
}

/**
 * Snapshot of a sibling vehicle & its assigned driver within a linked multi-car order.
 * Synced across all sibling Trip documents so every driver knows their convoy & associates.
 */
export interface MultiCarAssociate {
  tripId: string;
  carIndex: number; // 1-based (Car 1 of N)
  vehicleDisplayName?: string;
  vehicleTier?: string;
  driverId?: string | null;
  driverName?: string;
  driverPhone?: string;
  vehicleUnit?: string;
  licensePlate?: string;
  vehicleModel?: string;
  status?: TripStatus;
}

export type OfferCascadeState = 'active' | 'accepted' | 'exhausted' | 'cancelled';

export interface TripOfferCascade {
  state: OfferCascadeState;
  activeOfferedDriverId: string | null;
  activeOfferedDriverName?: string;
  offerStartedAt: string;
  offerExpiresAt: string;
  timeoutSeconds: number;
  cascadeAttempt: number;
  maxAttempts: number;
  attemptedDriverIds: string[];
  strategy: string;
}

export type TripSlaLevel = 'normal' | 'warning' | 'critical' | 'overdue';

export interface TripSlaStatus {
  level: TripSlaLevel;
  minutesUntilPickup?: number;
  warningNotifiedAt?: string;
  criticalNotifiedAt?: string;
}

/**
 * Core Trip Document Model stored in Firestore.
 */
export interface Trip {
  id: string;
  customerId?: string;
  userId?: string;
  /** Top-level corporate account identifier for multi-tenant Firestore security rules & scoped B2B queries */
  corporateAccountId?: string;
  /** High-entropy token for zero-PII guest tracking links (/track/:trackingToken) */
  trackingToken?: string;

  /** State machine status */
  status: TripStatus;

  /** Universal Governance */
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;

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
  assignedVehicle?: TripAssignedVehicle;

  /** Audit Log */
  auditLog?: TripAuditEvent[];

  /** Location details */
  pickupLocation: TripLocation;
  dropoffLocation: TripLocation;
  intermediateStops?: TripLocation[];
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

  /** Operational Trip Complexity Flags */
  hasReturnTrip?: boolean;
  linkedTripId?: string;
  linkedReturnTripId?: string;
  isReturnRide?: boolean;
  returnScheduledPickupTime?: string;
  hasSeparateContactPerson?: boolean;
  contactPerson?: { name: string; phone: string; email?: string };
  multipleVehiclesRequested?: boolean;
  vehicleCount?: number;
  /** Linked multi-vehicle convoy identifiers & synced associate drivers */
  multiCarGroupId?: string;
  multiCarIndex?: number; // 1-based car number (e.g., 1 of 3)
  multiCarTotal?: number; // Total vehicles in this multi-car order
  multiCarTripIds?: string[]; // All sibling Trip IDs sharing multiCarGroupId
  multiCarDriverIds?: string[]; // Assigned driver UIDs across sibling trips
  multiCarAssociates?: MultiCarAssociate[];

  /** Passenger & Vehicle */
  passenger: TripPassenger;
  vehicleTier: VehicleTier;

  /** Pricing & Payment */
  pricing: TripPricing;
  payment: TripPayment;

  // Phase 31: Masked Telephony Relay
  telephonySessionId?: string;
  proxyNumber?: string;
  meterExtras?: Array<{ id: string; name: string; amount: number; category: string }>;

  // Phase 31.5: Driver Geolocation Telemetry
  driverTelemetry?: DriverTelemetryPing;
  currentLocation?: DriverTelemetryPing;

  // Phase 35: Sequential Auto-Dispatch Offer Cascade & Scheduled SLA Monitor
  offerCascade?: TripOfferCascade;
  slaStatus?: TripSlaStatus;

  // Phase 38: Live Flight Status Telemetry Snapshot (STL / SUS / CPS Airport Pickups)
  flightTelemetry?: FlightTelemetrySnapshot;

  /** State Machine Audit Trail */
  statusHistory: TripStatusHistoryEntry[];

  /** Timestamps */
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string

  /** Extensible metadata */
  metadata?: Record<string, unknown>;

  /** Driver trip queue sequence order */
  queueOrder?: number;
}

/**
 * Input payload when creating a new trip booking.
 */
export type CreateTripInput = Omit<
  Trip,
  'id' | 'status' | 'offeredToIds' | 'rejectedByIds' | 'assignedDriverId' | 'statusHistory' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  status?: TripStatus;
};
