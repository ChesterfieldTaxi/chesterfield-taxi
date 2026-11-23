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
import { generateTrackingToken } from '../../utils/tracking-token.util';
import { getServerRouteService, calculateLiveRoute, isGoogleMapsReady } from '../maps';
import { getCommsThreadService } from '../comms/comms-thread.service';
import { getAdminConfigService } from '../config/admin-config.service';
import {
  getZoneService,
  isCoordinateInZone,
  isCoordinateInZoneGroup,
  isCoordinateNearLocationCollection,
} from '../zones/zone.service';
import { getPricingRulesService } from '../pricing/pricing-rules.service';
import { getTariffService } from '../pricing/tariff.service';
import { getUniversalExtrasConfig, getUniversalExtrasService } from '../pricing/extras.service';
import { getSurchargesConfig, getSurchargesService } from '../pricing/surcharges.service';
import { detectAirportInAddresses } from '../../config/airports';
import { generateTripId } from '../../utils/trip-id.util';
import {
  buildAssociateEntryFromTrip,
  mergeMultiCarAssociateUpdate,
} from './multi-car.util';


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
            const isMock =
              (trip.passenger?.lastName === 'User' && (trip.passenger?.firstName || '').startsWith('Test')) ||
              trip.pickupLocation?.address === '123 Test St' ||
              trip.id.startsWith('MOCK-') ||
              trip.id.startsWith('stress_');
            if (!isMock) {
              this.trips.set(trip.id, trip);
            }
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
      const allTariffs = await tariffService.getTariffs();
      if (allTariffs && allTariffs.length > 0) {
        dynamicPricingConfig.tariffs = allTariffs;
      }
    } catch (tariffErr) {
      console.warn('[MockBookingService] Could not load active tariffs:', tariffErr);
    }

    try {
      const pricingRulesService = getPricingRulesService();
      const allRules = await pricingRulesService.getRules();
      dynamicPricingConfig.namedPricingRules = allRules;
    } catch (rulesErr) {
      console.warn('[MockBookingService] Could not load active pricing rules:', rulesErr);
    }

    try {
      const extras = await getUniversalExtrasService().getExtras();
      if (extras) {
        dynamicPricingConfig.universalExtras = extras;
      }
    } catch (extrasErr) {
      console.warn('[MockBookingService] Could not load universal extras:', extrasErr);
      dynamicPricingConfig.universalExtras = getUniversalExtrasConfig();
    }

    try {
      const surcharges = await getSurchargesService().getSurcharges();
      if (surcharges) {
        dynamicPricingConfig.surchargesCatalog = surcharges;
      }
    } catch (surchargesErr) {
      console.warn('[MockBookingService] Could not load surcharges:', surchargesErr);
      dynamicPricingConfig.surchargesCatalog = getSurchargesConfig();
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

    // Resolve spatial containment (separate Origin vs Destination zones)
    const matchedZoneIds = new Set<string>(request.zoneIds || []);
    const originZoneIds = new Set<string>(request.originZoneId ? [request.originZoneId] : []);
    const destinationZoneIds = new Set<string>(
      request.destinationZoneId ? [request.destinationZoneId] : []
    );
    const matchedZoneGroupIds = new Set<string>(request.zoneGroupIds || []);
    const matchedLocationCollectionIds = new Set<string>(request.locationCollectionIds || []);

    if (airportCheck.isAirportTrip && airportCheck.airport) {
      const airportZoneId =
        airportCheck.airport.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport';
      matchedZoneIds.add(airportZoneId);
      if (isAirportPickup) originZoneIds.add(airportZoneId);
      if (isAirportDropoff) destinationZoneIds.add(airportZoneId);
    }

    const pickupCoord = request.pickupLocation.coordinates;
    const dropoffCoord = request.dropoffLocation.coordinates;
    const stopCoords = validIntermediateStops
      .map((s) => s.coordinates)
      .filter((c): c is GeoPoint => Boolean(c && typeof c.lat === 'number' && typeof c.lng === 'number'));

    const hasAnyCoord =
      Boolean(pickupCoord && typeof pickupCoord.lat === 'number' && typeof pickupCoord.lng === 'number') ||
      Boolean(dropoffCoord && typeof dropoffCoord.lat === 'number' && typeof dropoffCoord.lng === 'number') ||
      stopCoords.length > 0;

    if (hasAnyCoord) {
      try {
        const zoneService = getZoneService();
        const zones = await zoneService.getZones();
        const zoneGroups = await zoneService.getZoneGroups();
        const locationColls = await zoneService.getLocationCollections();

        const evaluateCoord = (coord: GeoPoint | undefined, role: 'origin' | 'destination' | 'stop') => {
          if (!coord || typeof coord.lat !== 'number' || typeof coord.lng !== 'number') return;
          for (const zone of zones) {
            if (isCoordinateInZone(coord, zone)) {
              matchedZoneIds.add(zone.id);
              if (role === 'origin') originZoneIds.add(zone.id);
              if (role === 'destination') destinationZoneIds.add(zone.id);
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
        };

        evaluateCoord(pickupCoord, 'origin');
        evaluateCoord(dropoffCoord, 'destination');
        for (const sc of stopCoords) evaluateCoord(sc, 'stop');
      } catch (spatialErr) {
        console.warn('[MockBookingService] Spatial entity evaluation warning:', spatialErr);
      }
    }

    const originZoneList = Array.from(originZoneIds);
    const destinationZoneList = Array.from(destinationZoneIds);

    const basePricingInput = {
      distanceMiles,
      durationMinutes,
      vehicleTypeId: request.vehicleType || request.vehicleTier,
      vehicleType: request.vehicleType || request.vehicleTier,
      vehicleTier: request.vehicleTier,
      vehicleClass: request.vehicleClass,
      pickupDateTime,
      promoCode: request.promoCode,
      corporateAccountId: request.corporateAccountId,
      accountTags: request.accountTags,
      isAirportPickup,
      isAirportDropoff,
      isAirportTrip,
      originZoneIds: originZoneList,
      destinationZoneIds: destinationZoneList,
      originZoneId:
        request.originZoneId ||
        originZoneList[0] ||
        (isAirportPickup
          ? airportCheck.airport?.iataCode === 'SUS'
            ? 'zone-spirit-airport'
            : 'zone-lambert-airport'
          : undefined),
      destinationZoneId:
        request.destinationZoneId ||
        destinationZoneList[0] ||
        (isAirportDropoff
          ? airportCheck.airport?.iataCode === 'SUS'
            ? 'zone-spirit-airport'
            : 'zone-lambert-airport'
          : undefined),
      curbWaitMinutes: request.curbWaitMinutes,
      delayMinutes: request.delayMinutes,
      intermediateStopsCount: validIntermediateStops.length,
      tolls: request.tolls,
      customTollsOrFees: request.customTollsOrFees,
      bypassSurge: request.bypassSurge,
      waiveMultiStopFees: request.waiveMultiStopFees,
      waiveAirportFee: request.waiveAirportFee,
      manualDiscount: request.manualDiscount,
      manualDiscountPercent: request.manualDiscountPercent,
      manualDiscountLabel: request.manualDiscountLabel,
      manualFareOverride: request.manualFareOverride,
      selectedRuleId: request.selectedRuleId,
      accountType: request.accountType || (request.corporateAccountId ? 'corporate' : 'retail'),
      pickupZipCode: (request.pickupLocation.address || '').match(/\b(\d{5})(?:-\d{4})?\b/)?.[1],
      dropoffZipCode: (request.dropoffLocation.address || '').match(/\b(\d{5})(?:-\d{4})?\b/)?.[1],
      carSeatsBreakdown: request.carSeatsBreakdown,
      passengers: request.passengerCount,
      oversizedBags: request.oversizedBags,
      selectedCustomExtras: request.selectedCustomExtras,
      equipment: {
        carSeats: request.carSeatsCount || (request.carSeatsBreakdown?.total ?? 0),
        luggageCount: request.luggageCount,
        ...request.equipment,
      },
      zoneIds: Array.from(matchedZoneIds),
      zoneGroupIds: Array.from(matchedZoneGroupIds),
      locationCollectionIds: Array.from(matchedLocationCollectionIds),
    };

    const { pricing } = calculateTripPricing(basePricingInput, dynamicPricingConfig);

    let vehicleQuotes: Record<string, typeof pricing> | undefined;
    if (request.evaluateAllVehicleIds && request.evaluateAllVehicleIds.length > 0) {
      vehicleQuotes = {};
      for (const vId of request.evaluateAllVehicleIds) {
        if (!vId) continue;
        const vResult = calculateTripPricing(
          {
            ...basePricingInput,
            vehicleTypeId: vId,
            vehicleType: vId,
            vehicleTier: vId,
          },
          dynamicPricingConfig
        );
        vehicleQuotes[vId] = vResult.pricing;
      }
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min validity

    return {
      pricing,
      vehicleQuotes,
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

    const meta = (payload.metadata || {}) as Record<string, any>;
    const resolvedCorporateAccountId =
      payload.corporateAccountId ||
      payload.payment?.corporateAccountId ||
      (typeof meta.corporateAccountId === 'string' && meta.corporateAccountId.trim()
        ? meta.corporateAccountId.trim()
        : undefined);

    const newTrip: Trip = {
      ...payload,
      ...(resolvedCorporateAccountId ? { corporateAccountId: resolvedCorporateAccountId } : {}),
      id,
      trackingToken: payload.trackingToken || generateTrackingToken(),
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

    getCommsThreadService()
      .linkTripToThread({
        tripId: newTrip.id,
        phone: newTrip.passenger?.phone,
        email: newTrip.passenger?.email,
        passengerName: `${newTrip.passenger?.firstName || ''} ${newTrip.passenger?.lastName || ''}`.trim(),
        corporateAccountId: newTrip.corporateAccountId,
      })
      .catch(() => {});

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

  public subscribeToDriverTrips(
    driverId: string,
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    return this.subscribeToAllTrips((all) => {
      const scoped = all.filter(
        (t) =>
          t.assignedDriverId === driverId ||
          (Array.isArray(t.offeredToIds) && t.offeredToIds.includes(driverId))
      );
      onUpdate(scoped);
    }, onError);
  }

  public subscribeToPassengerTrips(
    identity: { uid?: string; email?: string; phone?: string },
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const uid = identity.uid?.trim();
    const email = identity.email?.trim().toLowerCase();
    return this.subscribeToAllTrips((all) => {
      const scoped = all.filter((t) => {
        if (uid && (t.customerId === uid || t.userId === uid)) return true;
        if (email && t.passenger?.email?.trim().toLowerCase() === email) return true;
        return false;
      });
      onUpdate(scoped);
    }, onError);
  }

  public async acceptDriverOffer(tripId: string, driverId: string): Promise<Trip> {
    const trip = this.trips.get(tripId);
    if (!trip) throw new Error(`Trip "${tripId}" not found.`);
    if (trip.assignedDriverId && trip.assignedDriverId !== driverId) {
      throw new Error('This trip offer was already claimed by another driver.');
    }
    if (trip.status !== 'offered' && trip.assignedDriverId !== driverId) {
      throw new Error(`Trip offer is no longer available (current status: ${trip.status}).`);
    }
    const assigned = await this.updateTripStatus(tripId, 'assigned', {
      actorRole: 'driver',
      assignedDriverId: driverId,
      offeredToIds: [],
      reason: 'Offer accepted by driver',
    });
    if (assigned.offerCascade) {
      return this.updateTrip(tripId, {
        offerCascade: {
          ...assigned.offerCascade,
          state: 'accepted',
          activeOfferedDriverId: driverId,
        },
      });
    }
    return assigned;
  }

  public async declineDriverOffer(tripId: string, driverId: string, reason?: string): Promise<Trip> {
    const trip = this.trips.get(tripId);
    if (!trip) throw new Error(`Trip "${tripId}" not found.`);
    const remainingOffered = (trip.offeredToIds || []).filter((id) => id !== driverId);
    const nextRejected = Array.from(new Set([...(trip.rejectedByIds || []), driverId]));
    const nextStatus: TripStatus =
      trip.status === 'offered' && remainingOffered.length === 0 ? 'pending' : trip.status;
    const now = new Date().toISOString();
    const updated: Trip = {
      ...trip,
      status: nextStatus,
      assignedDriverId: trip.assignedDriverId === driverId ? null : trip.assignedDriverId,
      offeredToIds: remainingOffered,
      rejectedByIds: nextRejected,
      ...(trip.offerCascade
        ? {
            offerCascade: {
              ...trip.offerCascade,
              activeOfferedDriverId:
                trip.offerCascade.activeOfferedDriverId === driverId
                  ? remainingOffered[0] || null
                  : trip.offerCascade.activeOfferedDriverId,
              ...(trip.offerCascade.activeOfferedDriverId === driverId &&
              remainingOffered.length === 0
                ? { activeOfferedDriverName: '' }
                : {}),
              ...(Array.isArray(trip.offerCascade.activeOfferedDriverIds)
                ? {
                    activeOfferedDriverIds: trip.offerCascade.activeOfferedDriverIds.filter(
                      (id) => id !== driverId
                    ),
                  }
                : {}),
              attemptedDriverIds: Array.from(
                new Set([...(trip.offerCascade.attemptedDriverIds || []), driverId])
              ),
            },
          }
        : {}),
      statusHistory: [
        ...(trip.statusHistory || []),
        { from: trip.status, to: nextStatus, timestamp: now, actorRole: 'driver', reason: reason || 'Driver declined trip offer' },
      ],
      auditLog: [
        ...(trip.auditLog || []),
        {
          action: 'DRIVER_DECLINED',
          timestamp: now,
          actorId: driverId,
          actorRole: 'driver',
          referenceNumber: `DEC-${Math.floor(1000 + Math.random() * 9000)}`,
          referenceType: 'decline',
          context: `Driver ${driverId} declined trip offer.`,
        },
      ],
      updatedAt: now,
    };
    this.trips.set(tripId, updated);
    this.persistToStorage();
    this.notifyListeners(updated);
    return updated;
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

    const isStaffOverride = options?.actorRole === 'admin' || options?.actorRole === 'system';
    if (!isStaffOverride && trip.status !== status && !isValidTripTransition(trip.status, status)) {
      throw new Error(`Invalid trip status transition from "${trip.status}" to "${status}".`);
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
          vehicleNumber: 'Car #204',
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
    } else if (status === 'assigned' || status === 'accepted' || status === 'cancelled') {
      updated.offeredToIds = [];
    }

    if (trip.offerCascade?.state === 'active') {
      if (status === 'assigned' || status === 'accepted') {
        updated.offerCascade = {
          ...trip.offerCascade,
          state: 'accepted',
          activeOfferedDriverId: options?.assignedDriverId || updated.assignedDriverId || null,
        };
      } else if (status === 'cancelled' || status === 'DECLINED' || status === 'declined') {
        updated.offerCascade = {
          ...trip.offerCascade,
          state: 'cancelled',
          activeOfferedDriverId: null,
        };
      }
    }

    if (status === 'in_progress' && !trip.actualPickupTime) {
      updated.actualPickupTime = now;
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
    await this.syncMultiCarConvoyAssociates(updated);

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

    const affectsConvoy =
      updates.assignedDriverId !== undefined ||
      updates.assignedVehicle !== undefined ||
      updates.status !== undefined;
    if (affectsConvoy) {
      await this.syncMultiCarConvoyAssociates(updated);
    }

    return updated;
  }

  private async syncMultiCarConvoyAssociates(changedTrip: Trip): Promise<void> {
    if (!changedTrip.multiCarGroupId || !Array.isArray(changedTrip.multiCarTripIds) || changedTrip.multiCarTripIds.length <= 1) {
      return;
    }

    let driverName: string | undefined;
    let driverPhone: string | undefined;
    let vehicleUnit = changedTrip.assignedVehicle?.vehicleNumber;
    let licensePlate = changedTrip.assignedVehicle?.licensePlate;
    let vehicleModel = changedTrip.assignedVehicle?.model;

    if (changedTrip.assignedDriverId) {
      try {
        const { getOperatorService } = await import('../operator.service');
        const rosterMatch = getOperatorService()
          .getDriverRoster()
          .find((r) => r.id === changedTrip.assignedDriverId);
        if (rosterMatch) {
          driverName = rosterMatch.name;
          driverPhone = rosterMatch.phone;
          if (!vehicleUnit && (rosterMatch.cabNumber || rosterMatch.vehicle)) {
            vehicleUnit = rosterMatch.cabNumber ? `Car #${rosterMatch.cabNumber}` : rosterMatch.vehicle;
          }
        }
      } catch {}
    }

    const updatedEntry = buildAssociateEntryFromTrip(changedTrip, {
      driverId: changedTrip.assignedDriverId ?? null,
      driverName,
      driverPhone,
      vehicleUnit,
      licensePlate,
      vehicleModel,
    });

    const now = new Date().toISOString();
    let anyChanged = false;
    for (const siblingId of changedTrip.multiCarTripIds) {
      const sibling = this.trips.get(siblingId);
      if (!sibling) continue;
      const { associates, driverIds } = mergeMultiCarAssociateUpdate(
        sibling.multiCarAssociates || changedTrip.multiCarAssociates,
        updatedEntry
      );
      const patched: Trip = {
        ...sibling,
        multiCarAssociates: associates,
        multiCarDriverIds: driverIds,
        updatedAt: now,
      };
      this.trips.set(siblingId, patched);
      anyChanged = true;
    }

    if (anyChanged) {
      this.persistToStorage();
      const latestChanged = this.trips.get(changedTrip.id);
      if (latestChanged) {
        this.notifyListeners(latestChanged);
      }
    }
  }
}

