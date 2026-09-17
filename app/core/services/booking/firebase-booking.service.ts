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
  orderBy,
  updateDoc,
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
import { getServerRouteService, calculateLiveRoute, isGoogleMapsReady } from '../maps';
import { getAdminConfigService } from '../config/admin-config.service';
import {
  getZoneService,
  isCoordinateInZone,
  isCoordinateInZoneGroup,
  isCoordinateNearLocationCollection,
} from '../zones/zone.service';
import { getPricingRulesService } from '../pricing/pricing-rules.service';



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

    // Hydrate namedPricingRules from PricingRulesService
    try {
      const pricingRulesService = getPricingRulesService();
      const allRules = await pricingRulesService.getRules();
      dynamicPricingConfig.namedPricingRules = allRules.filter((r) => r.isActive);
    } catch (rulesErr) {
      console.warn('[FirebaseBookingService] Could not load active pricing rules:', rulesErr);
    }

    const validIntermediateStops = (request.intermediateStops ?? []).filter((s) => {
      if (s.coordinates) return true;
      if (s.address && s.address.trim().length > 0) return true;
      return false;
    });

    // Resolve spatial containment (Zones, Zone Groups, Location Collections)
    const matchedZoneIds = new Set<string>(request.zoneIds || []);
    const matchedZoneGroupIds = new Set<string>(request.zoneGroupIds || []);
    const matchedLocationCollectionIds = new Set<string>(request.locationCollectionIds || []);

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
            const check = isCoordinateNearLocationCollection(coord, coll);
            if (check.matches) {
              matchedLocationCollectionIds.add(coll.id);
            }
          }
        }
      } catch (zoneErr) {
        console.warn('[FirebaseBookingService] Failed to evaluate spatial containment:', zoneErr);
      }
    }

    const { pricing } = calculateTripPricing(
      {
        distanceMiles,
        durationMinutes,
        vehicleTier: request.vehicleTier,
        pickupDateTime,
        promoCode: request.promoCode,
        isAirportPickup: request.pickupLocation.address.toLowerCase().includes('airport'),
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

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

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
    const tripDocRef = payload.id
      ? doc(this.db, this.collectionName, payload.id)
      : doc(collection(this.db, this.collectionName));

    const id = tripDocRef.id;

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

    const auditEvent = {
      action: initialStatus === 'CONFIRMED' ? 'AUTO_CONFIRMED' : 'TRIP_REQUESTED',
      timestamp: now,
      actorRole: 'passenger',
      context: initialHistoryEntry.reason
    };

    const newTrip: Trip = {
      ...payload,
      id,
      status: initialStatus,
      offeredToIds: [],
      rejectedByIds: [],
      assignedDriverId: null,
      statusHistory: [initialHistoryEntry],
      auditLog: [auditEvent as any],
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

    return sanitizedTrip;
  }

  public async getBookingStatus(bookingId: string): Promise<BookingStatusResponse | null> {
    const rawId = (bookingId || '').trim();
    const cleanId = rawId.replace(/^#/, '').trim();
    const cleanLower = cleanId.toLowerCase();

    let trip: Trip | null = null;

    // 1. Try direct doc lookup with raw and cleaned ID
    for (const lookupKey of [cleanId, rawId]) {
      if (!lookupKey) continue;
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

    const tripDocRef = doc(this.db, this.collectionName, cleanId || rawId);

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
          return JSON.parse(stored) as Trip[];
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

    // Listen for local trip creations across tabs
    const handleLocalTripEvent = () => {
      const freshLocal = this.getLocalTrips();
      onUpdate(this.mergeTrips(latestRemoteTrips, freshLocal));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('chesterfield_trip_created', handleLocalTripEvent);
      window.addEventListener('storage', handleLocalTripEvent);
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
        window.removeEventListener('storage', handleLocalTripEvent);
      }
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
         let vehicleSnapshot: TripAssignedVehicle = {
            vehicleId: 'veh-' + options.assignedDriverId,
            vehicleNumber: 'Cab #204',
            licensePlate: 'MO-7TX91',
            model: 'Toyota Camry Hybrid'
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
         updates.assignedVehicle = vehicleSnapshot;
         updates.auditLog?.push({
            action: 'DRIVER_ACCEPTED',
            timestamp: now,
            actorRole: options.actorRole ?? 'dispatcher',
            context: `Driver assigned: ${options.assignedDriverId} with ${vehicleSnapshot.vehicleNumber} (${vehicleSnapshot.model})`
         } as any);
      }
    }

    if (options?.offeredToIds !== undefined) {
      updates.offeredToIds = options.offeredToIds;
    }

    if (status === 'completed') {
      updates.completedAt = now;
    } else if (status === 'cancelled') {
      updates.cancelledAt = now;
      updates.cancellationReason = options?.reason ?? '';
      updates.cancelledBy = options?.actorRole ?? 'admin';
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

    return updatedTrip;
  }

  public async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip> {
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

    return mergedTrip;
  }
}

