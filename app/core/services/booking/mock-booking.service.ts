/**
 * Mock Booking Service
 * 
 * In-memory & localStorage fallback implementation of IBookingService.
 * Enables local development, integration testing, and offline demonstrations
 * without requiring live Firebase credentials.
 */

import type {
  Trip,
  CreateTripInput,
  TripStatus,
  TripStatusHistoryEntry,
} from '../../types';
import { isValidTripTransition } from '../../types';
import type {
  IBookingService,
  QuoteRequest,
  QuoteResponse,
  BookingStatusResponse,
} from '../booking-service';
import { calculateTripPricing } from '../pricing';
import { getServerRouteService } from '../maps';

const STORAGE_KEY = 'chesterfield_taxi_mock_trips';

export class MockBookingService implements IBookingService {
  private trips: Map<string, Trip> = new Map();
  private listeners: Map<string, Set<(trip: Trip) => void>> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const data = window.localStorage.getItem(STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data) as Trip[];
          for (const trip of parsed) {
            this.trips.set(trip.id, trip);
          }
        }
      } catch (err) {
        console.warn('[MockBookingService] Failed to load trips from localStorage:', err);
      }
    }
  }

  private persistToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const array = Array.from(this.trips.values());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(array));
      } catch (err) {
        console.warn('[MockBookingService] Failed to persist trips to localStorage:', err);
      }
    }
  }

  private notifyListeners(trip: Trip): void {
    const tripListeners = this.listeners.get(trip.id);
    if (tripListeners) {
      for (const listener of tripListeners) {
        try {
          listener(trip);
        } catch (err) {
          console.error(`[MockBookingService] Listener error for trip ${trip.id}:`, err);
        }
      }
    }
  }

  public async calculateQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const routeService = getServerRouteService();
    const route = await routeService.calculateRoute({
      origin: request.pickupLocation.coordinates ?? request.pickupLocation.address,
      destination: request.dropoffLocation.coordinates ?? request.dropoffLocation.address,
    });

    const now = new Date();
    const pickupDateTime = request.scheduledPickupTime
      ? new Date(request.scheduledPickupTime)
      : now;

    const { pricing } = calculateTripPricing({
      distanceMiles: route.distanceMiles,
      durationMinutes: route.durationMinutes,
      vehicleTier: request.vehicleTier,
      pickupDateTime,
      promoCode: request.promoCode,
      isAirportPickup: request.pickupLocation.address.toLowerCase().includes('airport'),
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min validity

    return {
      pricing,
      estimatedDistanceMiles: route.distanceMiles,
      estimatedDurationMinutes: route.durationMinutes,
      currency: pricing.currency,
      expiresAt,
    };
  }

  public async createBooking(payload: CreateTripInput): Promise<Trip> {
    const now = new Date().toISOString();
    const id = payload.id ?? `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const initialHistoryEntry: TripStatusHistoryEntry = {
      from: null,
      to: 'pending',
      timestamp: now,
      actorRole: 'passenger',
      reason: 'Booking submitted via web portal',
    };

    const newTrip: Trip = {
      ...payload,
      id,
      status: 'pending',
      offeredToIds: [],
      rejectedByIds: [],
      assignedDriverId: null,
      statusHistory: [initialHistoryEntry],
      createdAt: now,
      updatedAt: now,
    };

    this.trips.set(id, newTrip);
    this.persistToStorage();
    this.notifyListeners(newTrip);

    return newTrip;
  }

  public async getBookingStatus(bookingId: string): Promise<BookingStatusResponse | null> {
    const trip = this.trips.get(bookingId);
    if (!trip) {
      return null;
    }

    return {
      tripId: trip.id,
      status: trip.status,
      assignedDriverId: trip.assignedDriverId,
      estimatedPickupTime: trip.scheduledPickupTime,
      trip,
    };
  }

  public async cancelBooking(
    bookingId: string,
    reason?: string,
    cancelledBy: 'passenger' | 'driver' | 'admin' | 'system' = 'passenger'
  ): Promise<Trip> {
    const trip = this.trips.get(bookingId);
    if (!trip) {
      throw new Error(`Booking with ID "${bookingId}" not found.`);
    }

    if (!isValidTripTransition(trip.status, 'cancelled')) {
      throw new Error(
        `Cannot cancel trip in state "${trip.status}". Valid transitions: pending, offered, assigned.`
      );
    }

    const now = new Date().toISOString();
    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: 'cancelled',
      timestamp: now,
      actorRole: cancelledBy,
      reason: reason ?? 'Booking cancelled by user',
    };

    const updatedTrip: Trip = {
      ...trip,
      status: 'cancelled',
      cancelledAt: now,
      cancellationReason: reason,
      cancelledBy,
      updatedAt: now,
      statusHistory: [...trip.statusHistory, historyEntry],
    };

    this.trips.set(bookingId, updatedTrip);
    this.persistToStorage();
    this.notifyListeners(updatedTrip);

    return updatedTrip;
  }

  public subscribeToBooking(
    bookingId: string,
    onUpdate: (trip: Trip) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!this.listeners.has(bookingId)) {
      this.listeners.set(bookingId, new Set());
    }

    const tripListeners = this.listeners.get(bookingId)!;
    tripListeners.add(onUpdate);

    // If trip already exists in memory, immediately push initial state
    const current = this.trips.get(bookingId);
    if (current) {
      Promise.resolve().then(() => onUpdate(current)).catch(onError);
    }

    return () => {
      tripListeners.delete(onUpdate);
      if (tripListeners.size === 0) {
        this.listeners.delete(bookingId);
      }
    };
  }

  /**
   * Test helper to simulate driver dispatch broadcasting & assignment
   */
  public simulateDriverOffer(bookingId: string, driverIds: string[]): Trip {
    const trip = this.trips.get(bookingId);
    if (!trip) throw new Error('Trip not found');

    const now = new Date().toISOString();
    const updated: Trip = {
      ...trip,
      status: 'offered',
      offeredToIds: driverIds,
      updatedAt: now,
      statusHistory: [
        ...trip.statusHistory,
        {
          from: trip.status,
          to: 'offered',
          timestamp: now,
          actorRole: 'system',
          reason: `Broadcasted offer to ${driverIds.length} driver(s)`,
        },
      ],
    };

    this.trips.set(bookingId, updated);
    this.persistToStorage();
    this.notifyListeners(updated);
    return updated;
  }
}
