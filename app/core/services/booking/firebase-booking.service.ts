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
import { getAdminConfigService } from '../config/admin-config.service';


export interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export class FirebaseBookingService implements IBookingService {
  private db: Firestore;
  private collectionName = 'trips';

  constructor(customConfig?: FirebaseClientConfig) {
    const config: FirebaseClientConfig = {
      apiKey: customConfig?.apiKey ?? process.env.VITE_FIREBASE_API_KEY,
      authDomain: customConfig?.authDomain ?? process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: customConfig?.projectId ?? process.env.VITE_FIREBASE_PROJECT_ID ?? 'chesterfield-taxi',
      storageBucket: customConfig?.storageBucket ?? process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: customConfig?.messagingSenderId ?? process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: customConfig?.appId ?? process.env.VITE_FIREBASE_APP_ID,
    };

    let app: FirebaseApp;
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApps()[0];
    }

    this.db = getFirestore(app);
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

    const adminConfig = getAdminConfigService();
    const settings = await adminConfig.getSettings();
    const dynamicPricingConfig = adminConfig.toPricingConfig(settings);

    const { pricing } = calculateTripPricing(
      {
        distanceMiles: route.distanceMiles,
        durationMinutes: route.durationMinutes,
        vehicleTier: request.vehicleTier,
        pickupDateTime,
        promoCode: request.promoCode,
        isAirportPickup: request.pickupLocation.address.toLowerCase().includes('airport'),
      },
      dynamicPricingConfig
    );


    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

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
    const tripDocRef = payload.id
      ? doc(this.db, this.collectionName, payload.id)
      : doc(collection(this.db, this.collectionName));

    const id = tripDocRef.id;

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

    await setDoc(tripDocRef, newTrip);
    return newTrip;
  }

  public async getBookingStatus(bookingId: string): Promise<BookingStatusResponse | null> {
    const tripDocRef = doc(this.db, this.collectionName, bookingId);
    const snapshot = await getDoc(tripDocRef);

    if (!snapshot.exists()) {
      return null;
    }

    const trip = snapshot.data() as Trip;
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
    const snapshot = await getDoc(tripDocRef);

    if (!snapshot.exists()) {
      throw new Error(`Booking with ID "${bookingId}" not found in Firestore.`);
    }

    const trip = snapshot.data() as Trip;

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

    await updateDoc(tripDocRef, updates);

    return {
      ...trip,
      ...updates,
    };
  }

  public subscribeToBooking(
    bookingId: string,
    onUpdate: (trip: Trip) => void,
    onError?: (error: Error) => void
  ): () => void {
    const tripDocRef = doc(this.db, this.collectionName, bookingId);

    const unsubscribe = onSnapshot(
      tripDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.data() as Trip);
        }
      },
      (err) => {
        console.error(`[FirebaseBookingService] Snapshot error on trip ${bookingId}:`, err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  }

  public async getAllTrips(): Promise<Trip[]> {
    const q = query(collection(this.db, this.collectionName), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const trips: Trip[] = [];
    snapshot.forEach((d) => {
      trips.push(d.data() as Trip);
    });
    return trips;
  }

  public subscribeToAllTrips(
    onUpdate: (trips: Trip[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const q = query(collection(this.db, this.collectionName), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const trips: Trip[] = [];
        snapshot.forEach((d) => {
          trips.push(d.data() as Trip);
        });
        onUpdate(trips);
      },
      (err) => {
        console.error('[FirebaseBookingService] Snapshot error on all trips:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
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
    const snapshot = await getDoc(tripDocRef);

    if (!snapshot.exists()) {
      throw new Error(`Booking with ID "${tripId}" not found in Firestore.`);
    }

    const trip = snapshot.data() as Trip;
    const now = new Date().toISOString();

    const historyEntry: TripStatusHistoryEntry = {
      from: trip.status,
      to: status,
      timestamp: now,
      actorRole: options?.actorRole ?? 'admin',
      reason: options?.reason ?? `Status manually updated to ${status}`,
    };

    const updates: Partial<Trip> = {
      status,
      updatedAt: now,
      statusHistory: [...trip.statusHistory, historyEntry],
    };

    if (options?.assignedDriverId !== undefined) {
      updates.assignedDriverId = options.assignedDriverId;
    }

    if (options?.offeredToIds !== undefined) {
      updates.offeredToIds = options.offeredToIds;
    }

    if (status === 'completed') {
      updates.completedAt = now;
    } else if (status === 'cancelled') {
      updates.cancelledAt = now;
      updates.cancellationReason = options?.reason;
      updates.cancelledBy = options?.actorRole ?? 'admin';
    }

    await updateDoc(tripDocRef, updates);

    return {
      ...trip,
      ...updates,
    };
  }
}

