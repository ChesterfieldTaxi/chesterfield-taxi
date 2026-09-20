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
  GeoPoint,
  TripAssignedVehicle,
  TripAuditEvent,
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
import {
  getZoneService,
  isCoordinateInZone,
  isCoordinateInZoneGroup,
  isCoordinateNearLocationCollection,
} from '../zones/zone.service';
import { getPricingRulesService } from '../pricing/pricing-rules.service';
import { getTariffService } from '../pricing/tariff.service';
import { getUniversalExtrasConfig } from '../pricing/extras.service';
import { getSurchargesConfig } from '../pricing/surcharges.service';
import { detectAirportInAddresses } from '../../config/airports';
import { generateTripId } from '../../utils/trip-id.util';


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
          originPlaceId: request.pickupLocation.placeId,
          destinationPlaceId: request.dropoffLocation.placeId,
          waypoints,
          waypointPlaceIds: request.intermediateStops?.map((s) => s.placeId || ''),
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

    // 4-Pillar Config Hydration: Tariffs, Rules, Universal Extras, and Surcharges
    try {
      const tariffService = getTariffService();
      const allTariffs = await tariffService.getAllTariffProfiles();
      if (allTariffs && allTariffs.length > 0) {
        dynamicPricingConfig.tariffs = allTariffs;
      }
    } catch (tariffErr) {
      console.warn('[MockBookingService] Could not load active tariffs:', tariffErr);
    }

    try {
      const pricingRulesService = getPricingRulesService();
      const allRules = await pricingRulesService.getRules();
      dynamicPricingConfig.namedPricingRules = allRules.filter((r) => r.isActive);
    } catch (rulesErr) {
      console.warn('[MockBookingService] Could not load active pricing rules:', rulesErr);
    }

    try {
      const extras = await getUniversalExtrasConfig();
      if (extras) {
        dynamicPricingConfig.universalExtras = extras;
      }
    } catch (extrasErr) {
      console.warn('[MockBookingService] Could not load universal extras:', extrasErr);
    }

    try {
      const surcharges = await getSurchargesConfig();
      if (surcharges) {
        dynamicPricingConfig.surchargesCatalog = surcharges;
      }
    } catch (surchargesErr) {
      console.warn('[MockBookingService] Could not load surcharges:', surchargesErr);
    }

    const validIntermediateStops = (request.intermediateStops ?? []).filter((s) => {
      if (s.coordinates) return true;
      if (s.address && s.address.trim().length > 0) return true;
      return false;
    });

    // Detect airport in pickup and dropoff addresses
    const airportCheck = detectAirportInAddresses(
      request.pickupLocation.address || '',
      request.dropoffLocation.address || ''
    );
    const isAirportPickup = Boolean(request.isAirportPickup ?? airportCheck.isPickupAirport);
    const isAirportDropoff = Boolean(request.isAirportDropoff ?? airportCheck.isDropoffAirport);
    const isAirportTrip = Boolean(request.isAirportTrip ?? airportCheck.isAirportTrip);

    // Resolve spatial containment (Zones, Zone Groups, Location Collections)
    const matchedZoneIds = new Set<string>(request.zoneIds || []);
    const matchedZoneGroupIds = new Set<string>(request.zoneGroupIds || []);
    const matchedLocationCollectionIds = new Set<string>(request.locationCollectionIds || []);

    if (airportCheck.isAirportTrip && airportCheck.airport) {
      if (airportCheck.airport.iataCode === 'STL' || airportCheck.airport.iataCode === 'CPS') {
        matchedZoneIds.add('zone-lambert-airport');
      } else if (airportCheck.airport.iataCode === 'SUS') {
        matchedZoneIds.add('zone-spirit-airport');
      }
    }

    const coordsToTest = [
      request.pickupLocation.coordinates,
      request.dropoffLocation.coordinates,
      ...validIntermediateStops.map((s) => s.coordinates),
    ].filter((c): c is GeoPoint => Boolean(c && typeof c.lat === 'number' && typeof c.lng === 'number'));

    if (coordsToTest.length > 0) {
      try {
        const zoneService = getZoneService();
        const zones = await zoneService.getZones();
        const zoneGroups = await zoneService.getZoneGroups();
        const locationColls = await zoneService.getLocationCollections();

        for (const coord of coordsToTest) {
          for (const zone of zones) {
            if (isCoordinateInZone(coord, zone)) {
              matchedZoneIds.add(zone.id);
            }
          }
          for (const group of zoneGroups) {
            if (isCoordinateInZoneGroup(coord, group, zones)) {
              matchedZoneGroupIds.add(group.id);
            }
          }
          for (const coll of locationColls) {
            const matchResult = isCoordinateNearLocationCollection(coord, coll);
            if (matchResult.matches) {
              matchedLocationCollectionIds.add(coll.id);
            }
          }
        }
      } catch (spatialErr) {
        console.warn('[MockBookingService] Spatial entity evaluation warning:', spatialErr);
      }
    }

    const { pricing } = calculateTripPricing(
      {
        distanceMiles,
        durationMinutes,
        vehicleTier: request.vehicleTier,
        pickupDateTime,
        promoCode: request.promoCode,
        isAirportPickup,
        isAirportDropoff,
        isAirportTrip,
        originZoneId: request.originZoneId || (isAirportPickup ? (airportCheck.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined),
        destinationZoneId: request.destinationZoneId || (isAirportDropoff ? (airportCheck.airport?.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport') : undefined),
        curbWaitMinutes: request.curbWaitMinutes,
        delayMinutes: request.delayMinutes,
        intermediateStopsCount: validIntermediateStops.length,
        tolls: request.tolls,
        customTollsOrFees: request.customTollsOrFees,
        bypassSurge: request.bypassSurge,
        waiveMultiStopFees: request.waiveMultiStopFees,
        waiveAirportFee: request.waiveAirportFee,
        manualDiscount: request.manualDiscount,
        manualFareOverride: request.manualFareOverride,
        carSeatsBreakdown: request.carSeatsBreakdown,
        passengers: request.passengerCount,
        equipment: {
          carSeats: request.carSeatsCount || (request.carSeatsBreakdown?.total ?? 0),
          luggageCount: request.luggageCount,
          ...request.equipment,
        },
        zoneIds: Array.from(matchedZoneIds),
        zoneGroupIds: Array.from(matchedZoneGroupIds),
        locationCollectionIds: Array.from(matchedLocationCollectionIds),
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
    const id = payload.id ?? generateTripId(
      payload.passenger?.phone,
      payload.passenger?.email,
      payload.passenger?.firstName
    );
    let initialStatus: TripStatus = payload.status || 'UNCONFIRMED';
    let blockReason = '';

    try {
      const { getBookingRulesEngine } = await import('../bookingRulesEngine');
      const { getUniversalGovernanceService } = await import('../governance/universal-governance.service');
      const engine = getBookingRulesEngine();
      const governanceService = getUniversalGovernanceService();

      const zoneService = getZoneService();
      const blacklistedLocs = await zoneService.getBlacklistedLocations();

      const passengerPhone = payload.passenger?.phone;
      const passengerEmail = payload.passenger?.email;
      const passengerCheck = await governanceService.isPassengerBlacklisted(passengerPhone, passengerEmail);

      const customerProfileMock = passengerCheck.isBlacklisted ? {
        id: payload.customerId || 'passenger',
        isBlacklisted: true,
        blacklistReason: passengerCheck.reason || 'Passenger profile is blacklisted by dispatch',
        isArchived: passengerCheck.isArchived,
        firstName: payload.passenger?.firstName || 'Customer',
        lastName: payload.passenger?.lastName || '',
        phone: passengerPhone || '',
        email: passengerEmail || '',
        preferredVehicleTier: payload.vehicleTier,
        communicationPreferences: { smsUpdates: true, emailReceipts: true, phoneCalls: true },
        savedPlaces: [],
      } : (payload.customerId ? {
        id: payload.customerId,
        customerScore: (payload as any).customerScore,
        isBlacklisted: false,
        isArchived: false,
        firstName: payload.passenger?.firstName || 'Customer',
        lastName: payload.passenger?.lastName || '',
        phone: passengerPhone || '',
        email: passengerEmail || '',
        preferredVehicleTier: payload.vehicleTier,
        communicationPreferences: { smsUpdates: true, emailReceipts: true, phoneCalls: true },
        savedPlaces: [],
      } : undefined);

      const evaluation = engine.evaluateBookingRequest(payload, customerProfileMock as any, undefined, blacklistedLocs);

      if (evaluation.mode === 'BLACKLIST_BLOCK') {
        governanceService.recordSecurityAudit({
          action: 'BLACKLIST_BLOCK',
          entityType: 'passenger',
          entityId: passengerEmail || passengerPhone || payload.customerId || 'unknown-passenger',
          actorRole: 'system',
          reason: evaluation.reason || 'Ride creation blocked by security rules engine',
          metadata: { tripId: id, pickup: payload.pickupLocation?.address, dropoff: payload.dropoffLocation?.address }
        });
        throw new Error(`Booking Blocked: ${evaluation.reason || 'This account or location has been restricted by dispatch policy.'}`);
      } else if (evaluation.mode === 'AUTO_CONFIRM') {
        initialStatus = 'CONFIRMED';
      } else if (evaluation.mode === 'REQUIRE_REVIEW') {
        initialStatus = 'UNCONFIRMED';
        blockReason = evaluation.reason || 'Flagged for dispatcher review';
      }
    } catch (e: any) {
      if (e.message?.includes('Booking Blocked')) {
        throw e;
      }
      console.warn('[MockBookingService] Booking rules evaluation failed', e);
    }

    const initialHistoryEntry: TripStatusHistoryEntry = {
      from: null,
      to: initialStatus,
      timestamp: now,
      actorRole: 'passenger',
      reason: initialStatus === 'UNCONFIRMED'
        ? (blockReason || 'Web booking submitted by customer (pending dispatcher review)')
        : 'Booking submitted via system (Auto-confirmed)',
    };

    const newTrip: Trip = {
      ...payload,
      id,
      status: initialStatus,
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
    const rawId = (bookingId || '').trim();
    const cleanId = rawId.replace(/^#/, '').trim();
    const cleanLower = cleanId.toLowerCase();

    let trip = this.trips.get(bookingId) || this.trips.get(cleanId);
    if (!trip) {
      for (const t of this.trips.values()) {
        if (
          t.id.toLowerCase() === cleanLower ||
          t.id.toLowerCase().endsWith(cleanLower) ||
          cleanLower.endsWith(t.id.toLowerCase()) ||
          t.id.toLowerCase().includes(cleanLower) ||
          (t.passenger?.phone?.replace(/\D/g, '').includes(cleanId.replace(/\D/g, '')) && cleanId.replace(/\D/g, '').length >= 7)
        ) {
          trip = t;
          break;
        }
      }
    }

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

    const auditEvent: TripAuditEvent = {
      action: (status === 'assigned' || status === 'accepted') ? 'DRIVER_ACCEPTED' : 'STATUS_CHANGED',
      timestamp: now,
      actorRole: options?.actorRole ?? 'admin',
      context: `Status changed to ${status}. ${options?.reason || ''}`,
    };

    const updated: Trip = {
      ...trip,
      status,
      updatedAt: now,
      statusHistory: [...trip.statusHistory, historyEntry],
      auditLog: [...(trip.auditLog || []), auditEvent],
    };

    if (options?.assignedDriverId !== undefined) {
      updated.assignedDriverId = options.assignedDriverId;
      if (options.assignedDriverId && (status === 'assigned' || status === 'accepted')) {
        let vehicleSnapshot: TripAssignedVehicle = {
          vehicleId: 'veh-' + options.assignedDriverId,
          vehicleNumber: 'Cab #204',
          licensePlate: 'MO-7TX91',
          model: 'Toyota Camry Hybrid',
        };
        try {
          const { getDriverService } = await import('../driver.service');
          const dProfile = await getDriverService().getDriverProfile(options.assignedDriverId);
          if (dProfile?.vehicleUnit) {
            vehicleSnapshot.vehicleNumber = dProfile.vehicleUnit;
            if (dProfile.vehicleMake || dProfile.vehicleModel) {
              vehicleSnapshot.model = `${dProfile.vehicleMake || ''} ${dProfile.vehicleModel || ''}`.trim();
            }
          }
        } catch {}
        updated.assignedVehicle = vehicleSnapshot;
        updated.auditLog?.push({
          action: 'DRIVER_ACCEPTED',
          timestamp: now,
          actorRole: options?.actorRole ?? 'dispatcher',
          context: `Driver assigned: ${options.assignedDriverId} with ${vehicleSnapshot.vehicleNumber} (${vehicleSnapshot.model})`,
        });
      }
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

