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
import { getServerRouteService, calculateLiveRoute, isGoogleMapsReady } from '../maps';
import { getAdminConfigService } from '../config/admin-config.service';

const STORAGE_KEY = 'chesterfield_taxi_mock_trips';

export class MockBookingService implements IBookingService {
  private trips: Map<string, Trip> = new Map();
  private listeners: Map<string, Set<(trip: Trip) => void>> = new Map();
  private allTripsListeners: Set<(trips: Trip[]) => void> = new Set();


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

    // Notify all-trips admin subscribers
    const allTrips = Array.from(this.trips.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const listener of this.allTripsListeners) {
      try {
        listener(allTrips);
      } catch (err) {
        console.error('[MockBookingService] All-trips listener error:', err);
      }
    }
  }

  public async calculateQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const origin = request.pickupLocation.coordinates ?? request.pickupLocation.address;
    const destination = request.dropoffLocation.coordinates ?? request.dropoffLocation.address;
    const waypoints = (request.intermediateStops ?? [])
      .map((s) => s.coordinates ?? s.address)
      .filter((w) => {
        if (typeof w === 'string') return w.trim().length > 0;
        return Boolean(w);
      });

    let distanceMiles: number | null = null;
    let durationMinutes: number | null = null;
    let isLiveGoogleResult = false;

    // 1. Attempt live Google Maps client-side Directions calculation
    if (typeof window !== 'undefined') {
      try {
        const liveResult = await calculateLiveRoute({
          origin,
          destination,
          waypoints,
        });
        if (liveResult) {
          distanceMiles = liveResult.distanceMiles;
          durationMinutes = liveResult.durationMinutes;
          isLiveGoogleResult = true;
          console.log('[MockBookingService] Using live Google Maps route for quote:', {
            distanceMiles,
            durationMinutes,
            origin,
            destination,
          });
        }
      } catch (e) {
        console.warn('[MockBookingService] Client-side live route failed:', e);
      }
    }

    // 2. Fall back to ServerRouteService (with HTTPS Google Directions API query or St. Louis Haversine fallback)
    if (distanceMiles === null || durationMinutes === null) {
      console.log('[MockBookingService] Falling back to ServerRouteService');
      const routeService = getServerRouteService();
      const route = await routeService.calculateRoute({
        origin: request.pickupLocation.coordinates ?? request.pickupLocation.address,
        destination: request.dropoffLocation.coordinates ?? request.dropoffLocation.address,
        waypoints: request.intermediateStops?.map((s) => s.coordinates ?? s.address),
      });
      distanceMiles = route.distanceMiles;
      durationMinutes = route.durationMinutes;
      isLiveGoogleResult = Boolean(route.isLiveGoogleResult);
    }

    const now = new Date();
    const pickupDateTime = request.scheduledPickupTime
      ? new Date(request.scheduledPickupTime)
      : now;

    const adminConfig = getAdminConfigService();
    const settings = await adminConfig.getSettings();
    const dynamicPricingConfig = adminConfig.toPricingConfig(settings);

    const { pricing } = calculateTripPricing(
      {
        distanceMiles,
        durationMinutes,
        vehicleTier: request.vehicleTier,
        pickupDateTime,
        promoCode: request.promoCode,
        isAirportPickup: request.pickupLocation.address.toLowerCase().includes('airport'),
      },
      dynamicPricingConfig
    );

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min validity

    return {
      pricing,
      estimatedDistanceMiles: distanceMiles,
      estimatedDurationMinutes: durationMinutes,
      currency: pricing.currency,
      isLiveGoogleResult,
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

  public async getAllTrips(): Promise<Trip[]> {
    return Array.from(this.trips.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public subscribeToAllTrips(
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    this.allTripsListeners.add(onUpdate);

    // Immediately push current sorted trips
    const current = Array.from(this.trips.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    Promise.resolve().then(() => onUpdate(current)).catch(onError);

    return () => {
      this.allTripsListeners.delete(onUpdate);
    };
  }

  public async updateTripStatus(
    tripId: string,
    status: TripStatus,
    options?: {
      reason?: string;
      actorRole?: 'passenger' | 'driver' | 'admin' | 'system';
      assignedDriverId?: string;
      offeredToIds?: string[];
    }
  ): Promise<Trip> {
    const trip = this.trips.get(tripId);
    if (!trip) {
      throw new Error(`Booking with ID "${tripId}" not found.`);
    }

    const now = new Date().toISOString();
    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: status,
      timestamp: now,
      actorRole: options?.actorRole ?? 'admin',
      reason: options?.reason ?? `Status updated to ${status}`,
    };

    const updated: Trip = {
      ...trip,
      status,
      updatedAt: now,
      statusHistory: [...trip.statusHistory, historyEntry],
    };

    if (options?.assignedDriverId !== undefined) {
      updated.assignedDriverId = options.assignedDriverId;
    }

    if (options?.offeredToIds !== undefined) {
      updated.offeredToIds = options.offeredToIds;
    }

    if (status === 'completed') {
      updated.completedAt = now;
    } else if (status === 'cancelled') {
      updated.cancelledAt = now;
      updated.cancellationReason = options?.reason;
      updated.cancelledBy = options?.actorRole ?? 'admin';
    }

    this.trips.set(tripId, updated);
    this.persistToStorage();
    this.notifyListeners(updated);

    return updated;
  }

  public async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip> {
    const trip = this.trips.get(tripId);
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const now = new Date().toISOString();
    const updated: Trip = {
      ...trip,
      ...updates,
      updatedAt: now,
    };

    this.trips.set(tripId, updated);
    this.persistToStorage();
    this.notifyListeners(updated);

    return updated;
  }
}

