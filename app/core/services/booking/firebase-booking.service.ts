/**
 * Firebase Firestore Booking Service Implementation
 * 
 * Implements IBookingService using Firebase Firestore to store, read,
 * update, and stream real-time Trip documents.
 * 
 * Enforces:
 * - Initial state: 'pending'
 * - Targeting arrays: 'offeredToIds'
 * - State machine transitions and status history audit log
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  runTransaction,
  collection,
  onSnapshot,
  type Firestore,
} from 'firebase/firestore';

import type {
  Trip,
  TripStatus,
  CreateTripInput,
  TripStatusHistoryEntry,
  GeoPoint,
  TripAssignedVehicle,
  TripAuditEvent,
  TripFieldDiff,
} from '../../types';
import { isValidTripTransition } from '../../types';
import type {
  IBookingService,
  QuoteRequest,
  QuoteResponse,
  BookingStatusResponse,
} from '../booking-service';
import { calculateTripPricing } from '../pricing';
import {
  generateTrackingToken,
  computeTripPhoneLookupKey,
  buildSanitizedTrackingProjection,
} from '../../utils/tracking-token.util';
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
import { getUniversalExtrasConfig, getUniversalExtrasService } from '../pricing/extras.service';
import { getSurchargesConfig, getSurchargesService } from '../pricing/surcharges.service';
import { detectAirportInAddresses } from '../../config/airports';
import { generateTripId } from '../../utils/trip-id.util';
import {
  buildAssociateEntryFromTrip,
  mergeMultiCarAssociateUpdate,
} from './multi-car.util';



export interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

import {
  sanitizePayload,
  sanitizeFirestoreDocument,
  sanitizeFirestoreUpdate,
} from '../firestore-sanitizer';

export {
  sanitizePayload,
  sanitizeFirestoreDocument,
  sanitizeFirestoreUpdate,
};

import { getFirestoreDb, getFirebaseApp } from '../firebase';

export class FirebaseBookingService implements IBookingService {
  private db: Firestore;
  private collectionName = 'trips';

  constructor(customConfig?: FirebaseClientConfig) {
    if (customConfig && customConfig.apiKey) {
      const app = getFirebaseApp(customConfig);
      this.db = getFirestore(app);
    } else {
      this.db = getFirestoreDb();
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
          console.log('[FirebaseBookingService] Using live Google Maps route for quote:', {
            distanceMiles,
            durationMinutes,
            origin,
            destination,
          });
        }
      } catch (e) {
        console.warn('[FirebaseBookingService] Client-side live route failed:', e);
      }
    }

    // 2. Fall back to ServerRouteService (with HTTPS Google Directions API query or St. Louis Haversine fallback)
    if (distanceMiles === null || durationMinutes === null) {
      console.log('[FirebaseBookingService] Falling back to ServerRouteService');
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
      console.warn('[FirebaseBookingService] Could not load active tariffs:', tariffErr);
    }

    try {
      const pricingRulesService = getPricingRulesService();
      const allRules = await pricingRulesService.getRules();
      dynamicPricingConfig.namedPricingRules = allRules;
    } catch (rulesErr) {
      console.warn('[FirebaseBookingService] Could not load active pricing rules:', rulesErr);
    }

    try {
      const extras = await getUniversalExtrasService().getExtras();
      if (extras) {
        dynamicPricingConfig.universalExtras = extras;
      }
    } catch (extrasErr) {
      console.warn('[FirebaseBookingService] Could not load universal extras:', extrasErr);
      dynamicPricingConfig.universalExtras = getUniversalExtrasConfig();
    }

    try {
      const surcharges = await getSurchargesService().getSurcharges();
      if (surcharges) {
        dynamicPricingConfig.surchargesCatalog = surcharges;
      }
    } catch (surchargesErr) {
      console.warn('[FirebaseBookingService] Could not load surcharges:', surchargesErr);
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

    // Resolve spatial containment (separate Origin vs Destination zones for accurate corridor/pickup/dropoff rules)
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
            const check = isCoordinateNearLocationCollection(coord, coll);
            if (check.matches) {
              matchedLocationCollectionIds.add(coll.id);
            }
          }
        };

        evaluateCoord(pickupCoord, 'origin');
        evaluateCoord(dropoffCoord, 'destination');
        for (const sc of stopCoords) evaluateCoord(sc, 'stop');
      } catch (zoneErr) {
        console.warn('[FirebaseBookingService] Failed to evaluate spatial containment:', zoneErr);
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

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

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
    const id = payload.id || generateTripId(
      payload.passenger?.phone,
      payload.passenger?.email,
      payload.passenger?.firstName
    );
    const tripDocRef = doc(this.db, this.collectionName, id);

    // Phase 29: Evaluate booking request against Rules Engine & Universal Blacklist
    let initialStatus: TripStatus = payload.status || 'UNCONFIRMED';
    let blockReason = '';
    
    try {
      const { getBookingRulesEngine } = await import('./../bookingRulesEngine');
      const { getUniversalGovernanceService } = await import('./../governance/universal-governance.service');
      const engine = getBookingRulesEngine();
      const governanceService = getUniversalGovernanceService();
      
      const zoneService = getZoneService();
      const blacklistedLocs = await zoneService.getBlacklistedLocations();
      
      // Check passenger blacklist via phone or email
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
      } : undefined;

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
         throw e; // Bubble up block
      }
      console.warn('Booking rules evaluation failed', e);
    }

    const initialHistoryEntry: TripStatusHistoryEntry = {
      from: null,
      to: initialStatus,
      timestamp: now,
      actorRole: 'passenger',
      reason: initialStatus === 'UNCONFIRMED'
        ? blockReason || 'Web booking submitted by customer (pending dispatcher review)'
        : 'Booking auto-confirmed by rules engine',
    };

    const meta = (payload.metadata || {}) as Record<string, any>;
    const channel = (meta.channel || (meta.createdByRole === 'dispatcher' ? 'dispatch' : 'web')) as 'web' | 'app' | 'dispatch' | 'email' | 'phone';
    const bookedByName = meta.bookedByName || (meta.createdByRole === 'dispatcher' ? 'Dispatcher Console' : payload.passenger?.firstName ? `${payload.passenger.firstName} ${payload.passenger.lastName || ''}`.trim() : 'Online Passenger');
    const bookedByRole = (meta.createdByRole || 'passenger') as 'passenger' | 'dispatcher' | 'admin' | 'system';
    const bkgRef = (meta.referenceNumber as string) || `BKG-${Math.floor(1000 + Math.random() * 9000)}`;

    const auditEvent: TripAuditEvent = {
      action: initialStatus === 'CONFIRMED' ? 'AUTO_CONFIRMED' : 'TRIP_REQUESTED',
      timestamp: now,
      actorRole: bookedByRole,
      referenceNumber: bkgRef,
      referenceType: 'booking',
      bookingChannel: channel,
      bookedBy: {
        name: bookedByName,
        role: bookedByRole,
        email: payload.passenger?.email,
      },
      context: `Initial reservation received via ${channel.toUpperCase()} intake by ${bookedByName} (${payload.passenger?.email || 'no email'}). ${initialHistoryEntry.reason}`,
    };

    const trackingToken = payload.trackingToken || generateTrackingToken();
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
      trackingToken,
      status: initialStatus,
      offeredToIds: [],
      rejectedByIds: [],
      assignedDriverId: null,
      statusHistory: [initialHistoryEntry],
      auditLog: [auditEvent],
      createdAt: now,
      updatedAt: now,
    };

    const sanitizedTrip = sanitizePayload(newTrip);

    // Always mirror to localStorage fallback cache so that client dispatch and admin tabs
    // see the booking immediately even if Firestore writes fail, are delayed, or security rules reject
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
        const existing = window.localStorage.getItem(STORAGE_KEY);
        const trips: Trip[] = existing ? JSON.parse(existing) : [];
        const idx = trips.findIndex((t) => t.id === sanitizedTrip.id);
        if (idx >= 0) {
          trips[idx] = sanitizedTrip;
        } else {
          trips.unshift(sanitizedTrip);
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        window.dispatchEvent(new CustomEvent('chesterfield_trip_created', { detail: sanitizedTrip }));
      } catch (storageErr) {
        console.warn('[FirebaseBookingService] LocalStorage mirror error:', storageErr);
      }
    }

    try {
      await setDoc(tripDocRef, sanitizedTrip);
    } catch (err: unknown) {
      console.warn('[FirebaseBookingService] Firestore setDoc failed (e.g. cloud security rules pending deploy), trip preserved in local storage:', err);
    }

    // Mirror strictly zero-PII public tracking projection & last-4 phone lookup index
    this.syncPublicTrackingProjection(sanitizedTrip, true).catch(() => {});

    return sanitizedTrip;
  }

  private async syncPublicTrackingProjection(trip: Trip, isInitialCreate = false): Promise<void> {
    try {
      const projection = buildSanitizedTrackingProjection(trip);
      if (!projection) return;
      const sanitizedProjection = sanitizePayload(projection);
      await setDoc(doc(this.db, 'tripTracking', projection.trackingToken), sanitizedProjection, { merge: true });

      if (isInitialCreate && trip.passenger?.phone) {
        const lookupKey = await computeTripPhoneLookupKey(trip.id, trip.passenger.phone);
        if (lookupKey) {
          await setDoc(
            doc(this.db, 'tripTrackingLookup', lookupKey),
            {
              trackingToken: projection.trackingToken,
              updatedAt: projection.updatedAt,
            },
            { merge: true }
          );
        }
      }
    } catch (err) {
      console.warn('[FirebaseBookingService] Public tracking projection sync warning:', err);
    }
  }

  public async getBookingStatus(bookingId: string): Promise<BookingStatusResponse | null> {
    const rawId = (bookingId || '').trim();
    const cleanId = rawId.replace(/^#/, '').trim();
    const cleanLower = cleanId.toLowerCase();

    let trip: Trip | null = null;

    // 1. Try direct doc lookup with normalized uppercase, cleaned, and raw ID
    const candidateKeys = Array.from(new Set([cleanId.toUpperCase(), cleanId, rawId].filter(Boolean)));
    for (const lookupKey of candidateKeys) {
      try {
        const tripDocRef = doc(this.db, this.collectionName, lookupKey);
        const snapshot = await getDoc(tripDocRef);
        if (snapshot.exists()) {
          trip = snapshot.data() as Trip;
          break;
        }
      } catch (e) {
        // ignore
      }
    }

    // 2. Fallback to local trips with case-insensitive and suffix/phone matching
    if (!trip) {
      const locals = this.getLocalTrips();
      trip =
        locals.find((t) => t.id === cleanId || t.id === rawId) ||
        locals.find((t) => t.id.toLowerCase() === cleanLower) ||
        locals.find((t) => t.id.toLowerCase().endsWith(cleanLower) || cleanLower.endsWith(t.id.toLowerCase())) ||
        locals.find((t) => t.id.toLowerCase().includes(cleanLower)) ||
        locals.find((t) => t.passenger?.phone?.replace(/\D/g, '').includes(cleanId.replace(/\D/g, '')) && cleanId.replace(/\D/g, '').length >= 7) ||
        null;
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
    const tripDocRef = doc(this.db, this.collectionName, bookingId);
    let trip: Trip | null = null;
    try {
      const snapshot = await getDoc(tripDocRef);
      if (snapshot.exists()) {
        trip = snapshot.data() as Trip;
      }
    } catch (e) {
      // ignore
    }

    if (!trip) {
      trip = this.getLocalTrips().find((t) => t.id === bookingId) || null;
    }

    if (!trip) {
      throw new Error(`Booking with ID "${bookingId}" not found.`);
    }

    if (!isValidTripTransition(trip.status, 'cancelled')) {
      throw new Error(
        `Cannot cancel trip in state "${trip.status}". Permitted states: pending, offered, assigned.`
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

    const updates: Partial<Trip> = {
      status: 'cancelled',
      cancelledAt: now,
      cancellationReason: reason,
      cancelledBy,
      updatedAt: now,
      statusHistory: [...trip.statusHistory, historyEntry],
    };

    const sanitizedUpdates = sanitizePayload(updates);
    try {
      await updateDoc(tripDocRef, sanitizedUpdates);
    } catch (err) {
      console.warn('[FirebaseBookingService] cancelBooking updateDoc warning:', err);
    }

    const cancelledTrip: Trip = {
      ...trip,
      ...updates,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
        const existing = window.localStorage.getItem(STORAGE_KEY);
        const trips: Trip[] = existing ? JSON.parse(existing) : [];
        const idx = trips.findIndex((t) => t.id === cancelledTrip.id);
        if (idx >= 0) trips[idx] = cancelledTrip;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        window.dispatchEvent(new CustomEvent('chesterfield_trip_created', { detail: cancelledTrip }));
      } catch (e) {
        // ignore
      }
    }

    this.syncPublicTrackingProjection(cancelledTrip).catch(() => {});

    return cancelledTrip;
  }

  public subscribeToBooking(
    bookingId: string,
    onUpdate: (trip: Trip) => void,
    onError?: (error: Error) => void
  ): () => void {
    const rawId = (bookingId || '').trim();
    const cleanId = rawId.replace(/^#/, '').trim();
    const cleanLower = cleanId.toLowerCase();

    const findMatch = () => {
      const locals = this.getLocalTrips();
      return (
        locals.find((t) => t.id === cleanId || t.id === rawId) ||
        locals.find((t) => t.id.toLowerCase() === cleanLower) ||
        locals.find((t) => t.id.toLowerCase().endsWith(cleanLower) || cleanLower.endsWith(t.id.toLowerCase())) ||
        locals.find((t) => t.id.toLowerCase().includes(cleanLower)) ||
        null
      );
    };

    const local = findMatch();
    if (local) {
      Promise.resolve().then(() => onUpdate(local)).catch(onError);
    }

    const handleLocalTripEvent = (e: any) => {
      const detail = e?.detail as Trip | undefined;
      if (
        detail &&
        (detail.id === cleanId ||
          detail.id.toLowerCase() === cleanLower ||
          detail.id.toLowerCase().includes(cleanLower))
      ) {
        onUpdate(detail);
      } else {
        const fresh = findMatch();
        if (fresh) onUpdate(fresh);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('chesterfield_trip_created', handleLocalTripEvent);
      window.addEventListener('storage', handleLocalTripEvent);
    }

    const normalizedDocId = (cleanId || rawId).toUpperCase();
    const tripDocRef = doc(this.db, this.collectionName, normalizedDocId);

    const unsubscribe = onSnapshot(
      tripDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.data() as Trip);
        }
      },
      (err) => {
        console.warn(`[FirebaseBookingService] Snapshot error on trip ${bookingId}:`, err);
        const fallback = this.getLocalTrips().find((t) => t.id === bookingId);
        if (fallback) onUpdate(fallback);
        if (onError) onError(err);
      }
    );

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('chesterfield_trip_created', handleLocalTripEvent);
        window.removeEventListener('storage', handleLocalTripEvent);
      }
    };
  }

  private getLocalTrips(): Trip[] {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem('chesterfield_taxi_mock_trips');
        if (stored) {
          const parsed = JSON.parse(stored) as Trip[];
          return parsed.filter(
            (t) =>
              !(t.passenger?.lastName === 'User' && (t.passenger?.firstName || '').startsWith('Test')) &&
              t.pickupLocation?.address !== '123 Test St' &&
              !t.id.startsWith('MOCK-') &&
              !t.id.startsWith('stress_')
          );
        }
      } catch (err) {
        console.warn('[FirebaseBookingService] Failed to read local trips:', err);
      }
    }
    return [];
  }

  private mergeTrips(remoteTrips: Trip[], localTrips: Trip[]): Trip[] {
    const map = new Map<string, Trip>();
    // Add remote trips first
    for (const trip of remoteTrips) {
      map.set(trip.id, trip);
    }
    // Overlay or add local trips (especially recently created unconfirmed ones)
    for (const trip of localTrips) {
      if (!map.has(trip.id)) {
        map.set(trip.id, trip);
      } else {
        // If local version has newer or pending updates, retain it
        const remote = map.get(trip.id)!;
        if (new Date(trip.updatedAt || trip.createdAt).getTime() > new Date(remote.updatedAt || remote.createdAt).getTime()) {
          map.set(trip.id, trip);
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getAllTrips(): Promise<Trip[]> {
    const localTrips = this.getLocalTrips();
    try {
      const q = query(collection(this.db, this.collectionName), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const remoteTrips: Trip[] = [];
      snapshot.forEach((d) => {
        remoteTrips.push(d.data() as Trip);
      });
      return this.mergeTrips(remoteTrips, localTrips);
    } catch (err) {
      console.warn('[FirebaseBookingService] getAllTrips remote fetch warning, using local:', err);
      return localTrips;
    }
  }

  public subscribeToAllTrips(
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    let latestRemoteTrips: Trip[] = [];
    const localTrips = this.getLocalTrips();

    // Push initial local trips immediately
    if (localTrips.length > 0) {
      Promise.resolve().then(() => onUpdate(localTrips)).catch(onError);
    }

    // Listen for local trip creations across tabs (ignore unrelated localStorage keys like drafts/alerts!)
    const handleLocalTripEvent = () => {
      const freshLocal = this.getLocalTrips();
      onUpdate(this.mergeTrips(latestRemoteTrips, freshLocal));
    };
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key && e.key !== 'chesterfield_taxi_mock_trips') return;
      handleLocalTripEvent();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('chesterfield_trip_created', handleLocalTripEvent);
      window.addEventListener('storage', handleStorageEvent);
    }

    const q = query(collection(this.db, this.collectionName), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const trips: Trip[] = [];
        snapshot.forEach((d) => {
          trips.push(d.data() as Trip);
        });
        latestRemoteTrips = trips;
        const merged = this.mergeTrips(latestRemoteTrips, this.getLocalTrips());
        onUpdate(merged);
      },
      (err) => {
        console.warn('[FirebaseBookingService] Snapshot error on all trips (using local trips):', err);
        const fallback = this.getLocalTrips();
        onUpdate(fallback);
        if (onError) onError(err);
      }
    );

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('chesterfield_trip_created', handleLocalTripEvent);
        window.removeEventListener('storage', handleStorageEvent);
      }
    };
  }

  /**
   * Resolves a driver's real assigned vehicle snapshot + contact details from DriverProfile,
   * OperatorService roster, and `/fleet` without inventing fake Cab #204 defaults.
   */
  private async resolveDriverVehicleSnapshot(driverId: string): Promise<{
    vehicle?: TripAssignedVehicle;
    driverName?: string;
    driverPhone?: string;
  }> {
    let vehicle: TripAssignedVehicle | undefined;
    let driverName: string | undefined;
    let driverPhone: string | undefined;

    try {
      const { getDriverService } = await import('../driver.service');
      const dProfile = await getDriverService().getDriverProfile(driverId);
      if (dProfile?.name) driverName = dProfile.name;
      if (dProfile?.phone) driverPhone = dProfile.phone;

      let matchedFleetPlate = dProfile?.licensePlate || '';
      let matchedFleetModel = `${dProfile?.vehicleMake || ''} ${dProfile?.vehicleModel || ''}`.trim();
      let matchedFleetId = dProfile?.vehicleId || '';
      let matchedFleetUnit = dProfile?.vehicleUnit || '';

      try {
        const { getOperatorService } = await import('../operator.service');
        const rosterMatch = getOperatorService()
          .getDriverRoster()
          .find((r) => r.id === driverId);
        if (rosterMatch) {
          if (!driverName && rosterMatch.name) driverName = rosterMatch.name;
          if (!driverPhone && rosterMatch.phone) driverPhone = rosterMatch.phone;
          if (!matchedFleetUnit && (rosterMatch.cabNumber || rosterMatch.vehicle)) {
            matchedFleetUnit = rosterMatch.cabNumber ? `Car #${rosterMatch.cabNumber}` : rosterMatch.vehicle;
          }
        }
      } catch {}

      try {
        const { getFleetService } = await import('../fleet/fleet.service');
        const assets = await getFleetService().getFleet();
        const unitNorm = (matchedFleetUnit || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const asset = assets.find(
          (a) =>
            (matchedFleetId && a.id === matchedFleetId) ||
            a.assignedDriverId === driverId ||
            (unitNorm && a.unitNumber.toLowerCase().replace(/[^a-z0-9]/g, '') === unitNorm)
        );
        if (asset) {
          matchedFleetId = asset.id;
          matchedFleetUnit = asset.unitNumber;
          matchedFleetPlate = asset.licensePlate || matchedFleetPlate;
          matchedFleetModel = `${asset.year ? asset.year + ' ' : ''}${asset.make} ${asset.model}`.trim();
        }
      } catch {}

      if (matchedFleetUnit || matchedFleetModel || matchedFleetPlate) {
        vehicle = {
          vehicleId: matchedFleetId || `unit-${driverId}`,
          vehicleNumber: matchedFleetUnit || 'Assigned Car',
          licensePlate: matchedFleetPlate || '',
          model: matchedFleetModel || 'Assigned Car',
        };
      }
    } catch {}

    return { vehicle, driverName, driverPhone };
  }

  /**
   * Synchronizes `multiCarAssociates` (and `multiCarDriverIds` when staff/owner updates)
   * across all sibling Trip documents in a linked multi-vehicle order so every driver
   * always sees up-to-date associate driver names, cab numbers, phones, and live statuses.
   */
  private async syncMultiCarConvoyAssociates(
    changedTrip: Trip,
    resolvedDriver?: { driverName?: string; driverPhone?: string; vehicle?: TripAssignedVehicle },
    actorRole: 'admin' | 'dispatcher' | 'driver' | 'system' | 'passenger' = 'admin'
  ): Promise<void> {
    if (!changedTrip.multiCarGroupId || !Array.isArray(changedTrip.multiCarTripIds) || changedTrip.multiCarTripIds.length <= 1) {
      return;
    }

    let driverInfo = resolvedDriver;
    if (changedTrip.assignedDriverId && (!driverInfo?.driverName || !driverInfo?.driverPhone || !driverInfo?.vehicle)) {
      const fetched = await this.resolveDriverVehicleSnapshot(changedTrip.assignedDriverId);
      driverInfo = {
        driverName: driverInfo?.driverName || fetched.driverName,
        driverPhone: driverInfo?.driverPhone || fetched.driverPhone,
        vehicle: driverInfo?.vehicle || fetched.vehicle,
      };
    }

    const updatedEntry = buildAssociateEntryFromTrip(changedTrip, {
      driverId: changedTrip.assignedDriverId ?? null,
      driverName: driverInfo?.driverName,
      driverPhone: driverInfo?.driverPhone,
      vehicleUnit: driverInfo?.vehicle?.vehicleNumber || changedTrip.assignedVehicle?.vehicleNumber,
      licensePlate: driverInfo?.vehicle?.licensePlate || changedTrip.assignedVehicle?.licensePlate,
      vehicleModel: driverInfo?.vehicle?.model || changedTrip.assignedVehicle?.model,
    });

    const now = new Date().toISOString();
    const isDriverActor = actorRole === 'driver';

    // Update every trip in the convoy (including changedTrip itself so its own associates stay fresh)
    await Promise.all(
      changedTrip.multiCarTripIds.map(async (siblingId) => {
        try {
          const sibRef = doc(this.db, this.collectionName, siblingId);
          let siblingTrip: Trip | null = siblingId === changedTrip.id ? changedTrip : null;
          if (!siblingTrip) {
            try {
              const snap = await getDoc(sibRef);
              if (snap.exists()) siblingTrip = snap.data() as Trip;
            } catch {}
          }
          if (!siblingTrip) {
            siblingTrip = this.getLocalTrips().find((t) => t.id === siblingId) || null;
          }

          const baseAssociates =
            siblingTrip?.multiCarAssociates && siblingTrip.multiCarAssociates.length > 0
              ? siblingTrip.multiCarAssociates
              : changedTrip.multiCarAssociates || [];

          const { associates, driverIds } = mergeMultiCarAssociateUpdate(baseAssociates, updatedEntry);

          // Drivers updating a sibling trip only write ['multiCarAssociates', 'updatedAt'] per firestore.rules
          const patch: Partial<Trip> =
            isDriverActor && siblingId !== changedTrip.id
              ? { multiCarAssociates: associates, updatedAt: now }
              : { multiCarAssociates: associates, multiCarDriverIds: driverIds, updatedAt: now };

          try {
            await updateDoc(sibRef, sanitizePayload(patch));
          } catch {}

          // Keep localStorage mirror fresh too
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
              const list: Trip[] = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
              const idx = list.findIndex((t) => t.id === siblingId);
              if (idx >= 0) {
                list[idx] = { ...list[idx], ...patch };
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
              }
            } catch {}
          }
        } catch (err) {
          console.warn(`[FirebaseBookingService] Multi-car associate sync warning for ${siblingId}:`, err);
        }
      })
    );
  }

  /**
   * Scoped Driver Real-Time Subscription:
   * Queries ONLY trips assigned to `driverId` OR offered to `driverId` in `offeredToIds`,
   * fully compliant with strict Firestore `allow list` rules.
   */
  public subscribeToDriverTrips(
    driverId: string,
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!driverId) {
      onUpdate([]);
      return () => {};
    }

    let assignedRemote: Trip[] = [];
    let offeredRemote: Trip[] = [];

    const emitMerged = () => {
      const localMatches = this.getLocalTrips().filter(
        (t) => t.assignedDriverId === driverId || (Array.isArray(t.offeredToIds) && t.offeredToIds.includes(driverId))
      );
      const combined = this.mergeTrips([...assignedRemote, ...offeredRemote], localMatches);
      onUpdate(combined);
    };

    Promise.resolve().then(emitMerged).catch(() => {});

    const handleLocalTripEvent = () => emitMerged();
    if (typeof window !== 'undefined') {
      window.addEventListener('chesterfield_trip_created', handleLocalTripEvent);
      window.addEventListener('storage', handleLocalTripEvent);
    }

    const qAssigned = query(
      collection(this.db, this.collectionName),
      where('assignedDriverId', '==', driverId)
    );
    const qOffered = query(
      collection(this.db, this.collectionName),
      where('offeredToIds', 'array-contains', driverId)
    );

    const unsubAssigned = onSnapshot(
      qAssigned,
      (snap) => {
        assignedRemote = snap.docs.map((d) => d.data() as Trip);
        emitMerged();
      },
      (err) => {
        console.warn('[FirebaseBookingService] Driver assigned trips snapshot error:', err);
        emitMerged();
        if (onError) onError(err);
      }
    );

    const unsubOffered = onSnapshot(
      qOffered,
      (snap) => {
        offeredRemote = snap.docs.map((d) => d.data() as Trip);
        emitMerged();
      },
      (err) => {
        console.warn('[FirebaseBookingService] Driver offered trips snapshot error:', err);
        emitMerged();
        if (onError) onError(err);
      }
    );

    return () => {
      unsubAssigned();
      unsubOffered();
      if (typeof window !== 'undefined') {
        window.removeEventListener('chesterfield_trip_created', handleLocalTripEvent);
        window.removeEventListener('storage', handleLocalTripEvent);
      }
    };
  }

  /**
   * Scoped Passenger Real-Time Subscription:
   * Queries ONLY trips matching authenticated `customerId`, `userId`, or `passenger.email`,
   * fully compliant with strict Firestore `allow list` rules.
   */
  public subscribeToPassengerTrips(
    identity: { uid?: string; email?: string; phone?: string },
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const uid = identity.uid?.trim();
    const email = identity.email?.trim().toLowerCase();
    const rawEmail = identity.email?.trim();

    if (!uid && !email) {
      onUpdate([]);
      return () => {};
    }

    const buckets = new Map<string, Trip[]>();

    const emitMerged = () => {
      const remoteAll: Trip[] = [];
      for (const list of buckets.values()) {
        remoteAll.push(...list);
      }
      const localMatches = this.getLocalTrips().filter((t) => {
        if (uid && (t.customerId === uid || t.userId === uid)) return true;
        if (email && t.passenger?.email?.trim().toLowerCase() === email) return true;
        return false;
      });
      onUpdate(this.mergeTrips(remoteAll, localMatches));
    };

    Promise.resolve().then(emitMerged).catch(() => {});

    const handleLocalTripEvent = () => emitMerged();
    if (typeof window !== 'undefined') {
      window.addEventListener('chesterfield_trip_created', handleLocalTripEvent);
      window.addEventListener('storage', handleLocalTripEvent);
    }

    const unsubs: Array<() => void> = [];

    const attachQuery = (bucketKey: string, q: ReturnType<typeof query>) => {
      const unsub = onSnapshot(
        q,
        (snap) => {
          buckets.set(
            bucketKey,
            snap.docs.map((d) => d.data() as Trip)
          );
          emitMerged();
        },
        (err) => {
          console.warn(`[FirebaseBookingService] Passenger ${bucketKey} snapshot warning:`, err);
          emitMerged();
          if (onError) onError(err);
        }
      );
      unsubs.push(unsub);
    };

    if (uid) {
      attachQuery('customerId', query(collection(this.db, this.collectionName), where('customerId', '==', uid)));
      attachQuery('userId', query(collection(this.db, this.collectionName), where('userId', '==', uid)));
    }
    if (rawEmail) {
      attachQuery('email', query(collection(this.db, this.collectionName), where('passenger.email', '==', rawEmail)));
    }

    return () => {
      unsubs.forEach((u) => u());
      if (typeof window !== 'undefined') {
        window.removeEventListener('chesterfield_trip_created', handleLocalTripEvent);
        window.removeEventListener('storage', handleLocalTripEvent);
      }
    };
  }

  /**
   * Atomically accepts a broadcast/offered trip using a Firestore transaction.
   * Guarantees only the first accepting driver claims the ride and clears `offeredToIds`.
   */
  public async acceptDriverOffer(tripId: string, driverId: string): Promise<Trip> {
    if (!tripId || !driverId) {
      throw new Error('tripId and driverId are required to accept an offer.');
    }

    const tripDocRef = doc(this.db, this.collectionName, tripId);
    const { vehicle, driverName, driverPhone } = await this.resolveDriverVehicleSnapshot(driverId);
    const now = new Date().toISOString();

    let updatedTrip: Trip | null = null;

    try {
      updatedTrip = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(tripDocRef);
        if (!snap.exists()) {
          throw new Error(`Trip "${tripId}" was not found.`);
        }
        const current = snap.data() as Trip;

        if (current.assignedDriverId && current.assignedDriverId !== driverId) {
          throw new Error('This trip offer was already claimed by another driver.');
        }
        if (current.status !== 'offered' && current.assignedDriverId !== driverId) {
          throw new Error(`Trip offer is no longer available (current status: ${current.status}).`);
        }

        const historyEntry: TripStatusHistoryEntry = {
          from: current.status,
          to: 'assigned',
          timestamp: now,
          actorRole: 'driver',
          reason: `Offer accepted by driver ${driverName || driverId}`,
        };

        const auditEvent: TripAuditEvent = {
          action: 'DRIVER_ACCEPTED',
          timestamp: now,
          actorId: driverId,
          actorRole: 'driver',
          referenceNumber: `ACP-${Math.floor(1000 + Math.random() * 9000)}`,
          referenceType: 'offer',
          context: `Driver ${driverName || driverId} atomically accepted trip offer${vehicle ? ` (${vehicle.vehicleNumber})` : ''}.`,
        };

        const nextMetadata = {
          ...(current.metadata || {}),
          ...(driverName ? { assignedDriverName: driverName } : {}),
          ...(driverPhone ? { assignedDriverPhone: driverPhone } : {}),
        };

        const nextOfferCascade = current.offerCascade
          ? {
              ...current.offerCascade,
              state: 'accepted' as const,
              activeOfferedDriverId: driverId,
              ...(driverName ? { activeOfferedDriverName: driverName } : {}),
            }
          : undefined;

        const patch: Partial<Trip> = {
          status: 'assigned',
          assignedDriverId: driverId,
          offeredToIds: [],
          ...(vehicle ? { assignedVehicle: vehicle } : {}),
          ...(nextOfferCascade ? { offerCascade: nextOfferCascade } : {}),
          metadata: nextMetadata,
          statusHistory: [...(current.statusHistory || []), historyEntry],
          auditLog: [...(current.auditLog || []), auditEvent],
          updatedAt: now,
        };

        tx.update(tripDocRef, sanitizePayload(patch));
        return { ...current, ...patch } as Trip;
      });
    } catch (txErr: any) {
      // Re-throw genuine business conflicts (already claimed / cancelled / expired)
      if (
        txErr?.message?.includes('already claimed') ||
        txErr?.message?.includes('no longer available') ||
        txErr?.message?.includes('not found')
      ) {
        throw txErr;
      }
      // Offline / local fallback if Firestore unavailable
      const local = this.getLocalTrips().find((t) => t.id === tripId);
      if (!local) throw txErr;
      if (local.assignedDriverId && local.assignedDriverId !== driverId) {
        throw new Error('This trip offer was already claimed by another driver.');
      }
      updatedTrip = {
        ...local,
        status: 'assigned',
        assignedDriverId: driverId,
        offeredToIds: [],
        ...(vehicle ? { assignedVehicle: vehicle } : {}),
        ...(local.offerCascade
          ? {
              offerCascade: {
                ...local.offerCascade,
                state: 'accepted',
                activeOfferedDriverId: driverId,
                ...(driverName ? { activeOfferedDriverName: driverName } : {}),
              },
            }
          : {}),
        metadata: { ...(local.metadata || {}), ...(driverName ? { assignedDriverName: driverName } : {}) },
        statusHistory: [
          ...(local.statusHistory || []),
          { from: local.status, to: 'assigned', timestamp: now, actorRole: 'driver', reason: 'Offer accepted by driver' },
        ],
        updatedAt: now,
      };
    }

    if (updatedTrip && typeof window !== 'undefined' && window.localStorage) {
      try {
        const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
        const trips: Trip[] = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
        const idx = trips.findIndex((t) => t.id === updatedTrip!.id);
        if (idx >= 0) trips[idx] = updatedTrip;
        else trips.unshift(updatedTrip);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        window.dispatchEvent(new CustomEvent('chesterfield_trip_created', { detail: updatedTrip }));
      } catch {}
    }

    if (updatedTrip) {
      this.syncPublicTrackingProjection(updatedTrip).catch(() => {});
      this.syncMultiCarConvoyAssociates(
        updatedTrip,
        { driverName, driverPhone, vehicle },
        'driver'
      ).catch(() => {});
    }

    return updatedTrip!;
  }

  /**
   * Atomically declines a trip offer for `driverId`.
   * Removes `driverId` from `offeredToIds`, records `driverId` in `rejectedByIds`,
   * keeps `assignedDriverId: null`, and only reverts to `pending` if no other drivers remain offered.
   */
  public async declineDriverOffer(tripId: string, driverId: string, reason?: string): Promise<Trip> {
    if (!tripId || !driverId) {
      throw new Error('tripId and driverId are required to decline an offer.');
    }

    const tripDocRef = doc(this.db, this.collectionName, tripId);
    const now = new Date().toISOString();
    let updatedTrip: Trip | null = null;

    try {
      updatedTrip = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(tripDocRef);
        if (!snap.exists()) {
          throw new Error(`Trip "${tripId}" was not found.`);
        }
        const current = snap.data() as Trip;

        const remainingOffered = (current.offeredToIds || []).filter((id) => id !== driverId);
        const nextRejected = Array.from(new Set([...(current.rejectedByIds || []), driverId]));
        const nextStatus: TripStatus =
          current.status === 'offered' && remainingOffered.length === 0 ? 'pending' : current.status;

        const historyEntry: TripStatusHistoryEntry = {
          from: current.status,
          to: nextStatus,
          timestamp: now,
          actorRole: 'driver',
          reason: reason || 'Driver declined trip offer',
        };

        const auditEvent: TripAuditEvent = {
          action: 'DRIVER_DECLINED',
          timestamp: now,
          actorId: driverId,
          actorRole: 'driver',
          referenceNumber: `DEC-${Math.floor(1000 + Math.random() * 9000)}`,
          referenceType: 'decline',
          context: `Driver ${driverId} declined trip offer. Remaining offered drivers: ${remainingOffered.length}.`,
        };

        const nextOfferCascade = current.offerCascade
          ? {
              ...current.offerCascade,
              activeOfferedDriverId:
                current.offerCascade.activeOfferedDriverId === driverId
                  ? null
                  : current.offerCascade.activeOfferedDriverId,
              ...(current.offerCascade.activeOfferedDriverId === driverId
                ? { activeOfferedDriverName: '' }
                : {}),
              attemptedDriverIds: Array.from(
                new Set([...(current.offerCascade.attemptedDriverIds || []), driverId])
              ),
            }
          : undefined;

        const patch: Partial<Trip> = {
          status: nextStatus,
          assignedDriverId: current.assignedDriverId === driverId ? null : current.assignedDriverId,
          offeredToIds: remainingOffered,
          rejectedByIds: nextRejected,
          ...(nextOfferCascade ? { offerCascade: nextOfferCascade } : {}),
          statusHistory: [...(current.statusHistory || []), historyEntry],
          auditLog: [...(current.auditLog || []), auditEvent],
          updatedAt: now,
        };

        tx.update(tripDocRef, sanitizePayload(patch));
        return { ...current, ...patch } as Trip;
      });
    } catch (txErr) {
      const local = this.getLocalTrips().find((t) => t.id === tripId);
      if (!local) throw txErr;
      const remainingOffered = (local.offeredToIds || []).filter((id) => id !== driverId);
      const nextRejected = Array.from(new Set([...(local.rejectedByIds || []), driverId]));
      const nextStatus: TripStatus =
        local.status === 'offered' && remainingOffered.length === 0 ? 'pending' : local.status;
      updatedTrip = {
        ...local,
        status: nextStatus,
        assignedDriverId: local.assignedDriverId === driverId ? null : local.assignedDriverId,
        offeredToIds: remainingOffered,
        rejectedByIds: nextRejected,
        ...(local.offerCascade
          ? {
              offerCascade: {
                ...local.offerCascade,
                activeOfferedDriverId:
                  local.offerCascade.activeOfferedDriverId === driverId
                    ? null
                    : local.offerCascade.activeOfferedDriverId,
                ...(local.offerCascade.activeOfferedDriverId === driverId
                  ? { activeOfferedDriverName: '' }
                  : {}),
                attemptedDriverIds: Array.from(
                  new Set([...(local.offerCascade.attemptedDriverIds || []), driverId])
                ),
              },
            }
          : {}),
        updatedAt: now,
      };
    }

    if (updatedTrip && typeof window !== 'undefined' && window.localStorage) {
      try {
        const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
        const trips: Trip[] = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
        const idx = trips.findIndex((t) => t.id === updatedTrip!.id);
        if (idx >= 0) trips[idx] = updatedTrip;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        window.dispatchEvent(new CustomEvent('chesterfield_trip_created', { detail: updatedTrip }));
      } catch {}
    }

    if (updatedTrip) {
      this.syncPublicTrackingProjection(updatedTrip).catch(() => {});
      this.syncMultiCarConvoyAssociates(updatedTrip, undefined, 'driver').catch(() => {});
    }

    return updatedTrip!;
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
    const tripDocRef = doc(this.db, this.collectionName, tripId);
    let trip: Trip | null = null;
    let docExistsOnFirestore = false;

    try {
      const snapshot = await getDoc(tripDocRef);
      if (snapshot.exists()) {
        trip = snapshot.data() as Trip;
        docExistsOnFirestore = true;
      }
    } catch (e) {
      // Permission or network error
    }

    if (!trip) {
      trip = this.getLocalTrips().find((t) => t.id === tripId) || null;
    }

    if (!trip) {
      throw new Error(`Booking with ID "${tripId}" not found.`);
    }

    // Validate state machine transition for driver/passenger actions (admins/dispatchers may override)
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
      reason: options?.reason ?? `Status manually updated to ${status}`,
    };
    
    const auditEvent = {
      action: 'STATUS_CHANGED',
      timestamp: now,
      actorRole: options?.actorRole ?? 'admin',
      context: `Status changed to ${status}. ${options?.reason || ''}`
    };

    const updates: Partial<Trip> = {
      status,
      updatedAt: now,
      statusHistory: [...trip.statusHistory, historyEntry],
      auditLog: [...(trip.auditLog || []), auditEvent as any]
    };

    if (options?.assignedDriverId !== undefined) {
      updates.assignedDriverId = options.assignedDriverId;
      if (options.assignedDriverId && (status === 'assigned' || status === 'accepted')) {
         const { vehicle: vehicleSnapshot, driverName, driverPhone } = await this.resolveDriverVehicleSnapshot(options.assignedDriverId);
         if (vehicleSnapshot) {
           updates.assignedVehicle = vehicleSnapshot;
         }
         if (driverName || driverPhone) {
           updates.metadata = {
             ...(trip.metadata || {}),
             ...(driverName ? { assignedDriverName: driverName } : {}),
             ...(driverPhone ? { assignedDriverPhone: driverPhone } : {}),
           };
         }
         updates.auditLog?.push({
            action: 'DRIVER_ACCEPTED',
            timestamp: now,
            actorRole: options.actorRole ?? 'dispatcher',
            context: `Driver assigned: ${driverName || options.assignedDriverId}${vehicleSnapshot ? ` with ${vehicleSnapshot.vehicleNumber} (${vehicleSnapshot.model})` : ''}`
         } as any);
      }
    }

    if (options?.offeredToIds !== undefined) {
      updates.offeredToIds = options.offeredToIds;
    } else if (status === 'assigned' || status === 'accepted' || status === 'cancelled') {
      updates.offeredToIds = [];
    }

    if (trip.offerCascade?.state === 'active') {
      if (status === 'assigned' || status === 'accepted') {
        updates.offerCascade = {
          ...trip.offerCascade,
          state: 'accepted',
          activeOfferedDriverId: options?.assignedDriverId || trip.assignedDriverId || null,
        };
      } else if (status === 'cancelled' || status === 'DECLINED' || status === 'declined') {
        updates.offerCascade = {
          ...trip.offerCascade,
          state: 'cancelled',
          activeOfferedDriverId: null,
        };
      }
    }

    if (status === 'in_progress' && !trip.actualPickupTime) {
      updates.actualPickupTime = now;
    }

    if (status === 'completed') {
      updates.completedAt = now;
      if (trip.payment?.method === 'account' || trip.payment?.method === 'corporate') {
        try {
          const { getInvoicingService } = await import('../invoicing.service');
          await getInvoicingService().handleCorporateTripCompleted({
            ...trip,
            ...updates,
          } as Trip);
          updates.payment = {
            ...(trip.payment || { method: 'account', amount: trip.pricing?.totalFare || 0 }),
            status: 'pending_invoice',
          };
          updates.auditLog?.push({
            action: 'INVOICE_GENERATED',
            timestamp: now,
            actorRole: 'system',
            referenceNumber: `AR-${Math.floor(1000 + Math.random() * 9000)}`,
            referenceType: 'invoice',
            context: 'Trip marked completed. Corporate account credit confirmed; unbilled itemized transaction logged in AR ledger (status: pending_invoice).',
          });
        } catch (invErr) {
          console.warn('[FirebaseBookingService] Corporate invoicing hook error:', invErr);
        }
      }
    } else if (status === 'cancelled') {
      updates.cancelledAt = now;
      updates.cancellationReason = options?.reason ?? '';
      updates.cancelledBy = options?.actorRole ?? 'admin';
    } else if (trip.status === 'cancelled') {
      updates.cancelledAt = undefined;
      updates.cancellationReason = undefined;
      updates.cancelledBy = undefined;
      updates.auditLog?.push({
        action: 'TRIP_REACTIVATED',
        timestamp: now,
        actorRole: options?.actorRole ?? 'dispatcher',
        referenceNumber: `RCT-${Math.floor(1000 + Math.random() * 9000)}`,
        referenceType: 'lifecycle',
        context: `Trip reactivated from cancelled state back to active status (${status}). ${options?.reason || ''}`,
      });
    }

    const updatedTrip: Trip = {
      ...trip,
      ...updates,
    };

    const sanitizedUpdates = sanitizePayload(updates);
    try {
      if (docExistsOnFirestore) {
        await updateDoc(tripDocRef, sanitizedUpdates);
      } else {
        await setDoc(tripDocRef, sanitizePayload(updatedTrip), { merge: true });
      }
    } catch (updateErr) {
      console.warn('[FirebaseBookingService] updateTripStatus Firestore sync warning:', updateErr);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
        const existing = window.localStorage.getItem(STORAGE_KEY);
        const trips: Trip[] = existing ? JSON.parse(existing) : [];
        const idx = trips.findIndex((t) => t.id === updatedTrip.id);
        if (idx >= 0) trips[idx] = updatedTrip;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        window.dispatchEvent(new CustomEvent('chesterfield_trip_created', { detail: updatedTrip }));
      } catch (e) {
        // ignore
      }
    }

    // Mirror status & assigned vehicle updates to zero-PII public tracking projection
    this.syncPublicTrackingProjection(updatedTrip).catch(() => {});

    // Keep linked multi-car convoy associates synced when status or driver changes
    if (updatedTrip.multiCarGroupId && updatedTrip.multiCarTripIds && updatedTrip.multiCarTripIds.length > 1) {
      this.syncMultiCarConvoyAssociates(
        updatedTrip,
        undefined,
        options?.actorRole ?? 'admin'
      ).catch(() => {});
    }

    return updatedTrip;
  }

  public async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip> {
    const tripDocRef = doc(this.db, this.collectionName, tripId);
    const updateKeys = Object.keys(updates).filter((k) => (updates as any)[k] !== undefined);
    const isTelemetryOnly =
      updateKeys.length > 0 &&
      updateKeys.every((k) => k === 'driverTelemetry' || k === 'currentLocation' || k === 'updatedAt');

    // Fast path for high-frequency GPS telemetry pings: avoid redundant getDoc, auditLog spam, and localStorage churn
    if (isTelemetryOnly) {
      const now = new Date().toISOString();
      const telemetryPatch = sanitizePayload({
        ...updates,
        updatedAt: now,
      });
      try {
        await updateDoc(tripDocRef, telemetryPatch);
      } catch (err) {
        console.warn('[FirebaseBookingService] Telemetry updateDoc warning:', err);
      }
      const cachedTrip = this.getLocalTrips().find((t) => t.id === tripId);
      const token = cachedTrip?.trackingToken;
      if (token) {
        const ping = updates.driverTelemetry || updates.currentLocation;
        if (ping) {
          setDoc(
            doc(this.db, 'tripTracking', token),
            sanitizePayload({ driverTelemetry: ping, updatedAt: now }),
            { merge: true }
          ).catch(() => {});
        }
      }
      return {
        ...(cachedTrip || ({ id: tripId } as Trip)),
        ...telemetryPatch,
      } as Trip;
    }

    let trip: Trip | null = null;
    let docExistsOnFirestore = false;
    try {
      const snapshot = await getDoc(tripDocRef);
      if (snapshot.exists()) {
        trip = snapshot.data() as Trip;
        docExistsOnFirestore = true;
      }
    } catch (e) {
      // ignore
    }

    if (!trip) {
      const local = this.getLocalTrips().find((t) => t.id === tripId);
      if (local) trip = local;
    }

    if (!trip) {
      throw new Error(`Booking with ID "${tripId}" not found.`);
    }

    const now = new Date().toISOString();

    const fieldChanges: TripFieldDiff[] = [];
    if (updates.pickupLocation?.address && updates.pickupLocation.address !== trip.pickupLocation?.address) {
      fieldChanges.push({
        field: 'pickupLocation',
        label: 'Pickup Address',
        oldValue: trip.pickupLocation?.address,
        newValue: updates.pickupLocation.address,
      });
    }
    if (updates.dropoffLocation?.address && updates.dropoffLocation.address !== trip.dropoffLocation?.address) {
      fieldChanges.push({
        field: 'dropoffLocation',
        label: 'Dropoff Address',
        oldValue: trip.dropoffLocation?.address,
        newValue: updates.dropoffLocation.address,
      });
    }
    if (updates.scheduledPickupTime && updates.scheduledPickupTime !== trip.scheduledPickupTime) {
      fieldChanges.push({
        field: 'scheduledPickupTime',
        label: 'Pickup Time',
        oldValue: trip.scheduledPickupTime,
        newValue: updates.scheduledPickupTime,
      });
    }
    if (updates.vehicleTier && updates.vehicleTier !== trip.vehicleTier) {
      fieldChanges.push({
        field: 'vehicleTier',
        label: 'Vehicle Tier',
        oldValue: trip.vehicleTier,
        newValue: updates.vehicleTier,
      });
    }
    if (updates.pricing?.totalFare !== undefined && updates.pricing?.totalFare !== trip.pricing?.totalFare) {
      fieldChanges.push({
        field: 'totalFare',
        label: 'Total Fare',
        oldValue: trip.pricing?.totalFare ? `$${trip.pricing.totalFare.toFixed(2)}` : '$0.00',
        newValue: `$${updates.pricing.totalFare.toFixed(2)}`,
      });
    }
    if (updates.passenger?.phone && updates.passenger.phone !== trip.passenger?.phone) {
      fieldChanges.push({
        field: 'passengerPhone',
        label: 'Passenger Phone',
        oldValue: trip.passenger?.phone,
        newValue: updates.passenger.phone,
      });
    }

    let updatedAuditLog: TripAuditEvent[] = trip.auditLog ? [...trip.auditLog] : [];
    if (fieldChanges.length > 0) {
      const refSuffix = Math.floor(1000 + Math.random() * 9000);
      updatedAuditLog.push({
        action: 'TRIP_MODIFIED',
        timestamp: now,
        actorRole: 'dispatcher',
        referenceNumber: `EDT-${refSuffix}`,
        referenceType: 'edit',
        fieldChanges,
        context: `Dispatcher modified trip fields: ${fieldChanges.map((f) => f.label).join(', ')}`,
      });
    }

    const cleanUpdates = sanitizePayload({
      ...updates,
      auditLog: updatedAuditLog,
      updatedAt: now,
    });

    const mergedTrip: Trip = {
      ...trip,
      ...cleanUpdates,
    };

    try {
      if (docExistsOnFirestore) {
        await updateDoc(tripDocRef, cleanUpdates);
      } else {
        await setDoc(tripDocRef, sanitizePayload(mergedTrip), { merge: true });
      }
    } catch (err) {
      console.warn('[FirebaseBookingService] updateTrip Firestore sync warning:', err);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const STORAGE_KEY = 'chesterfield_taxi_mock_trips';
        const existing = window.localStorage.getItem(STORAGE_KEY);
        const trips: Trip[] = existing ? JSON.parse(existing) : [];
        const idx = trips.findIndex((t) => t.id === mergedTrip.id);
        if (idx >= 0) trips[idx] = mergedTrip;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        window.dispatchEvent(new CustomEvent('chesterfield_trip_created', { detail: mergedTrip }));
      } catch (e) {
        // ignore
      }
    }

    this.syncPublicTrackingProjection(mergedTrip).catch(() => {});

    // Sync linked multi-car convoy associates whenever driver, vehicle, or status changes
    const affectsConvoy =
      updates.assignedDriverId !== undefined ||
      updates.assignedVehicle !== undefined ||
      updates.status !== undefined;
    if (
      affectsConvoy &&
      mergedTrip.multiCarGroupId &&
      mergedTrip.multiCarTripIds &&
      mergedTrip.multiCarTripIds.length > 1
    ) {
      this.syncMultiCarConvoyAssociates(mergedTrip, undefined, 'admin').catch(() => {});
    }

    return mergedTrip;
  }
}

