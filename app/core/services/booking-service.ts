/**
 * IBookingService Abstraction Layer
 * 
 * Fully decouples UI components and presentation layers from the backend
 * (Firebase Firestore / serverless routing / dispatch engine).
 * Enables seamless mocking in development, isolated unit tests, and swappable backends.
 */

import type {
  Trip,
  TripStatus,
  CreateTripInput,
  TripLocation,
  TripPricing,
  VehicleTier,
} from '../types';

/**
 * Payload parameters required to generate a deterministic price quote.
 */
export interface QuoteRequest {
  pickupLocation: TripLocation;
  dropoffLocation: TripLocation;
  intermediateStops?: TripLocation[];
  vehicleTier: VehicleTier;
  vehicleType?: string;
  vehicleClass?: string;
  bookingType: 'asap' | 'scheduled';
  scheduledPickupTime?: string; // ISO 8601 string
  passengerCount?: number;
  luggageCount?: number;
  oversizedBags?: Record<string, number>;
  selectedCustomExtras?: Record<string, number>;
  corporateAccountId?: string;
  accountTags?: string[];
  /** Optional list of vehicle type IDs to evaluate simultaneously on the resolved route */
  evaluateAllVehicleIds?: string[];
  carSeatsBreakdown?: {
    rearFacing?: number;
    frontFacing?: number;
    booster?: number;
    total?: number;
  };
  carSeatsCount?: number;
  equipment?: {
    carSeats?: number;
    luggageCount?: number;
    hasOversizedLuggage?: boolean;
    [key: string]: unknown;
  };
  zoneIds?: string[];
  zoneGroupIds?: string[];
  locationCollectionIds?: string[];
  promoCode?: string;
  tolls?: number;
  customTollsOrFees?: number;
  bypassSurge?: boolean;
  waiveMultiStopFees?: boolean;
  waiveAirportFee?: boolean;
  waivedSurchargeIds?: string[];
  waivedExtraKeys?: string[];
  manualDiscount?: number;
  manualDiscountPercent?: number;
  manualDiscountLabel?: string;
  manualFareOverride?: number;
  selectedRuleId?: string;
  accountType?: 'retail' | 'corporate' | 'vip';
  isAirportPickup?: boolean;
  isAirportDropoff?: boolean;
  isAirportTrip?: boolean;
  originZoneId?: string;
  destinationZoneId?: string;
  curbWaitMinutes?: number;
  delayMinutes?: number;
}

/**
 * Calculated pricing quote returned to the client before booking submission.
 */
export interface QuoteResponse {
  pricing: TripPricing;
  /** Exact engine-calculated pricing for every requested vehicle ID on the same route */
  vehicleQuotes?: Record<string, TripPricing>;
  estimatedDistanceMiles: number;
  estimatedDurationMinutes: number;
  currency: string;
  isLiveGoogleResult?: boolean;
  expiresAt: string; // ISO 8601 string expiration for the quote
}

/**
 * Response returned when querying real-time booking status.
 */
export interface BookingStatusResponse {
  tripId: string;
  status: TripStatus;
  assignedDriverId: string | null;
  estimatedPickupTime?: string; // ISO 8601 string
  trip: Trip;
}

/**
 * Cursor-paginated and filtered trip query options (Phase 101).
 */
export interface TripPageQueryOptions {
  limit?: number;
  cursor?: string | null;
  status?: TripStatus | TripStatus[] | 'all';
  startDateIso?: string;
  endDateIso?: string;
  driverId?: string;
  corporateAccountId?: string;
  includeArchived?: boolean;
  orderField?: 'createdAt' | 'scheduledPickupTime';
  orderDirection?: 'asc' | 'desc';
}

export interface TripPageResult {
  trips: Trip[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CustomerTripsQuery {
  customerId?: string;
  email?: string;
  phone?: string;
  limit?: number;
}

export interface ActiveAndUpcomingTripsOptions {
  pastHours?: number;
  futureHours?: number;
  limit?: number;
  standingOrderId?: string;
  trackingToken?: string;
}

/**
 * Core interface for booking lifecycle management.
 */
export interface IBookingService {
  /**
   * Calculates a deterministic price quote based on locations, vehicle tier, and surge rules.
   */
  calculateQuote(request: QuoteRequest): Promise<QuoteResponse>;

  /**
   * Creates a new booking in the dispatch pipeline, setting the initial state to 'pending'.
   */
  createBooking(payload: CreateTripInput): Promise<Trip>;

  /**
   * Fetches the current status and details of an existing booking.
   */
  getBookingStatus(bookingId: string): Promise<BookingStatusResponse | null>;

  /**
   * Cancels an existing booking, transitioning it to the 'cancelled' state machine status.
   */
  cancelBooking(
    bookingId: string,
    reason?: string,
    cancelledBy?: 'passenger' | 'driver' | 'admin' | 'system'
  ): Promise<Trip>;

  /**
   * Optional subscription for real-time booking updates (e.g., Firestore onSnapshot).
   * Returns an unsubscribe callback.
   */
  subscribeToBooking?(
    bookingId: string,
    onUpdate: (trip: Trip) => void,
    onError?: (error: Error) => void
  ): () => void;

  /**
   * Admin / Operator query to fetch all recent trips.
   */
  getAllTrips?(): Promise<Trip[]>;

  /**
   * Admin / Operator real-time stream of all bookings in the dispatch queue.
   */
  subscribeToAllTrips?(
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void;

  /**
   * Shared, ref-counted active-window real-time stream (active statuses + [-7d, +30d] window,
   * capped at 500 docs) applying incremental `docChanges()` into an in-memory Map.
   */
  subscribeToActiveTrips?(
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void;

  /**
   * Cursor-based (`startAfter` + `limit`) historical / filtered trip page query.
   */
  queryTripsPage?(options?: TripPageQueryOptions): Promise<TripPageResult>;

  /**
   * Scoped customer trip lookup by `customerId`, `email`, and/or `phone`.
   */
  getTripsByCustomer?(customerQuery: string | CustomerTripsQuery): Promise<Trip[]>;

  /**
   * Targeted active/upcoming (or token/series-scoped) trips fetch for server/dispatch callers.
   */
  getActiveAndUpcomingTrips?(options?: ActiveAndUpcomingTripsOptions): Promise<Trip[]>;

  /**
   * Scoped driver real-time stream: merges trips assigned to `driverId` and offers
   * containing `driverId` in `offeredToIds`, satisfying strict Firestore `allow list` rules.
   */
  subscribeToDriverTrips?(
    driverId: string,
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void;

  /**
   * Scoped passenger real-time stream: merges trips matching `customerId`, `userId`,
   * or authenticated `passenger.email`, satisfying strict Firestore `allow list` rules.
   */
  subscribeToPassengerTrips?(
    identity: { uid?: string; email?: string; phone?: string },
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void;

  /**
   * Atomically claims an offered trip for `driverId` using a Firestore transaction
   * (prevents multi-driver race/hijack and clears `offeredToIds`).
   */
  acceptDriverOffer?(tripId: string, driverId: string): Promise<Trip>;

  /**
   * Atomically declines an offered trip for `driverId`, appending to `rejectedByIds`
   * and removing from `offeredToIds` without assigning the declining driver.
   */
  declineDriverOffer?(tripId: string, driverId: string, reason?: string): Promise<Trip>;

  /**
   * Transitions a trip through the state machine (e.g., admin dispatch assignment or completion).
   */
  updateTripStatus?(
    tripId: string,
    status: TripStatus,
    options?: {
      reason?: string;
      actorRole?: 'passenger' | 'driver' | 'admin' | 'system';
      assignedDriverId?: string;
      offeredToIds?: string[];
    }
  ): Promise<Trip>;

  /**
   * Updates an existing trip's details in Firestore (e.g., dispatcher editing route, passenger, pricing, notes).
   */
  updateTrip?(tripId: string, updates: Partial<Trip>): Promise<Trip>;
}

