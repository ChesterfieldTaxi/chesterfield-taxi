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
  vehicleTier: VehicleTier;
  bookingType: 'asap' | 'scheduled';
  scheduledPickupTime?: string; // ISO 8601 string
  passengerCount?: number;
  luggageCount?: number;
  promoCode?: string;
}

/**
 * Calculated pricing quote returned to the client before booking submission.
 */
export interface QuoteResponse {
  pricing: TripPricing;
  estimatedDistanceMiles: number;
  estimatedDurationMinutes: number;
  currency: string;
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
}
