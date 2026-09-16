/**
 * Passenger Domain Service
 * 
 * Manages Customer Account state, Saved Places CRUD,
 * Communication preferences, active trip detection,
 * and ride history with itemized receipts.
 */

import type {
  PassengerAccount,
  SavedPlace,
  CommunicationPreferences,
} from '../types/passenger';
import type { Trip, TripStatus } from '../types/trip';
import { getBookingService } from './booking';

const PASSENGER_STORAGE_KEY = 'chesterfield_passenger_account_v1';

export const DEFAULT_PASSENGER_ACCOUNT: PassengerAccount = {
  id: 'cust-sarah-jenkins',
  firstName: 'Sarah',
  lastName: 'Jenkins',
  phone: '(314) 738-9921',
  homePhone: '(314) 532-1200',
  workPhone: '(314) 694-1000',
  primaryMobilePhone: '(314) 738-9921',
  alternatePhones: [
    { type: 'mobile', number: '(314) 738-9921', label: 'Personal Cell (SMS)', isPrimarySms: true },
    { type: 'home', number: '(314) 532-1200', label: 'Chesterfield Residence Landline', isPrimarySms: false },
    { type: 'work', number: '(314) 694-1000', label: 'Bayer Campus Desk Direct', isPrimarySms: false },
  ],
  email: 'sjenkins@bayer.com',
  passengerNotes: 'Side porch door pickup. Gate code #4421. Please call or text on arrival.',
  preferredVehicleTier: 'standard',
  communicationPreferences: {
    smsUpdates: true,
    emailReceipts: true,
    phoneCalls: true,
  },
  savedPlaces: [
    {
      id: 'place-home',
      label: 'Home',
      category: 'home',
      address: '14848 Conway Rd, Chesterfield, MO 63017',
      notes: 'Front circular driveway or side porch door',
      coordinates: { lat: 38.6534, lng: -90.5281 },
    },
    {
      id: 'place-work',
      label: 'Work (Bayer Campus)',
      category: 'work',
      address: '700 Chesterfield Pkwy W, Chesterfield, MO 63017',
      notes: 'Visitor dropoff circle at Building A entrance',
      coordinates: { lat: 38.6631, lng: -90.5752 },
    },
    {
      id: 'place-airport',
      label: 'STL Lambert Airport',
      category: 'airport',
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      notes: 'Terminal 1 Departure Upper Level Curbside',
      coordinates: { lat: 38.7499, lng: -90.3700 },
    },
    {
      id: 'place-spirit',
      label: 'Spirit of St. Louis Airport (SUS)',
      category: 'airport',
      address: '18270 Edison Ave, Chesterfield, MO 63005',
      notes: 'Tac Air Executive FBO Terminal',
      coordinates: { lat: 38.6622, lng: -90.6515 },
    },
    {
      id: 'place-stlukes',
      label: "St. Luke's Hospital",
      category: 'medical',
      address: '232 S Woods Mill Rd, Chesterfield, MO 63017',
      notes: 'East Medical Building main patient canopy',
      coordinates: { lat: 38.659, lng: -90.493 },
    },
  ],
  recentSearches: [
    'St. Louis Lambert International Airport (STL)',
    '17200 Chesterfield Airport Rd, Chesterfield, MO',
    '700 Chesterfield Pkwy W, Chesterfield, MO',
  ],
};

export const SAMPLE_PASSENGER_PAST_TRIPS: Trip[] = [
  {
    id: 'TRIP-9042',
    customerId: 'cust-sarah-jenkins',
    status: 'completed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-101',
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-09-12T08:15:00.000Z',
    actualPickupTime: '2026-09-12T08:14:20.000Z',
    completedAt: '2026-09-12T08:44:10.000Z',
    pickupLocation: {
      address: '14848 Conway Rd, Chesterfield, MO 63017',
      formattedAddress: '14848 Conway Rd, Chesterfield, MO 63017, USA',
      notes: 'Front circular driveway',
      coordinates: { lat: 38.6534, lng: -90.5281 },
    },
    dropoffLocation: {
      address: '10701 Lambert International Blvd, St. Louis, MO 63145',
      formattedAddress: 'Terminal 1, St. Louis Lambert International Airport (STL)',
      notes: 'American Airlines Departures Door 3',
      coordinates: { lat: 38.7499, lng: -90.3700 },
    },
    passenger: {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: 'sjenkins@bayer.com',
      phone: '(314) 738-9921',
      passengerCount: 1,
      luggageCount: 2,
      specialRequests: 'Flight AA 2314 to DFW. Need prompt airport curbside assistance.',
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 4.5,
      distanceMiles: 19.8,
      durationMinutes: 28,
      distanceRate: 2.8,
      timeRate: 0.55,
      vehicleMultiplier: 1.0,
      surgeMultiplier: 1.0,
      discountAmount: 0,
      subtotal: 62.5,
      airportSurcharge: 4.0,
      tollsFee: 0,
      totalFare: 66.5,
      currency: 'USD',
      tariffProfileName: 'Standard Flat Rate (Metro)',
    },
    payment: {
      method: 'card',
      status: 'captured',
      amount: 66.5,
      transactionId: 'ch_live_9042_stl_aa',
      paidAt: '2026-09-12T08:44:15.000Z',
    },
    statusHistory: [
      { from: null, to: 'UNCONFIRMED', timestamp: '2026-09-11T20:10:00.000Z', actorRole: 'passenger' },
      { from: 'UNCONFIRMED', to: 'CONFIRMED', timestamp: '2026-09-11T20:25:00.000Z', actorRole: 'admin', reason: 'Confirmed by Dispatch Desk' },
      { from: 'CONFIRMED', to: 'assigned', timestamp: '2026-09-12T07:45:00.000Z', actorRole: 'system', actorId: 'drv-101' },
      { from: 'assigned', to: 'in_progress', timestamp: '2026-09-12T08:14:20.000Z', actorRole: 'driver', actorId: 'drv-101' },
      { from: 'in_progress', to: 'completed', timestamp: '2026-09-12T08:44:10.000Z', actorRole: 'driver', actorId: 'drv-101' },
    ],
    metadata: {
      driverName: 'Mike T. (Cab #204)',
      vehicleUnit: 'Cab #204 (Toyota Camry)',
      driverPhone: '(314) 555-0101',
    },
    createdAt: '2026-09-11T20:10:00.000Z',
    updatedAt: '2026-09-12T08:44:15.000Z',
  },
  {
    id: 'TRIP-8812',
    customerId: 'cust-sarah-jenkins',
    status: 'completed',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: 'drv-104',
    bookingType: 'asap',
    scheduledPickupTime: '2026-09-08T17:30:00.000Z',
    actualPickupTime: '2026-09-08T17:35:10.000Z',
    completedAt: '2026-09-08T18:12:45.000Z',
    pickupLocation: {
      address: '700 Chesterfield Pkwy W, Chesterfield, MO 63017',
      formattedAddress: 'Bayer Chesterfield Campus, Building A',
      notes: 'Visitor circle entrance',
      coordinates: { lat: 38.6631, lng: -90.5752 },
    },
    dropoffLocation: {
      address: '999 N 2nd St, St. Louis, MO 63102',
      formattedAddress: 'Four Seasons Hotel St. Louis, Downtown Metro',
      notes: 'Main hotel valet porte-cochere',
      coordinates: { lat: 38.6315, lng: -90.1834 },
    },
    passenger: {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: 'sjenkins@bayer.com',
      phone: '(314) 738-9921',
      passengerCount: 2,
      luggageCount: 1,
      specialRequests: 'Corporate client dinner. Executive black car preferred.',
    },
    vehicleTier: 'premium',
    pricing: {
      baseFare: 6.5,
      distanceMiles: 23.4,
      durationMinutes: 34,
      distanceRate: 3.2,
      timeRate: 0.65,
      vehicleMultiplier: 1.25,
      surgeMultiplier: 1.0,
      discountAmount: 0,
      subtotal: 88.0,
      tollsFee: 0,
      totalFare: 88.0,
      currency: 'USD',
      tariffProfileName: 'Executive Flat Corridor',
    },
    payment: {
      method: 'card',
      status: 'captured',
      amount: 88.0,
      transactionId: 'ch_live_8812_fourseasons',
      paidAt: '2026-09-08T18:12:50.000Z',
    },
    statusHistory: [
      { from: null, to: 'CONFIRMED', timestamp: '2026-09-08T17:15:00.000Z', actorRole: 'passenger' },
      { from: 'CONFIRMED', to: 'assigned', timestamp: '2026-09-08T17:20:00.000Z', actorRole: 'system', actorId: 'drv-104' },
      { from: 'assigned', to: 'in_progress', timestamp: '2026-09-08T17:35:10.000Z', actorRole: 'driver', actorId: 'drv-104' },
      { from: 'in_progress', to: 'completed', timestamp: '2026-09-08T18:12:45.000Z', actorRole: 'driver', actorId: 'drv-104' },
    ],
    metadata: {
      driverName: 'Sarah K. (Cab #301)',
      vehicleUnit: 'Cab #301 (Chevy Suburban)',
      driverPhone: '(314) 555-0104',
    },
    createdAt: '2026-09-08T17:15:00.000Z',
    updatedAt: '2026-09-08T18:12:50.000Z',
  },
  {
    id: 'TRIP-7940',
    customerId: 'cust-sarah-jenkins',
    status: 'cancelled',
    cancellationReason: 'Passenger requested schedule adjustment',
    cancelledBy: 'passenger',
    offeredToIds: [],
    rejectedByIds: [],
    assignedDriverId: null,
    bookingType: 'scheduled',
    scheduledPickupTime: '2026-08-25T14:00:00.000Z',
    pickupLocation: {
      address: '14848 Conway Rd, Chesterfield, MO 63017',
      formattedAddress: '14848 Conway Rd, Chesterfield, MO',
    },
    dropoffLocation: {
      address: '232 S Woods Mill Rd, Chesterfield, MO 63017',
      formattedAddress: "St. Luke's Hospital Medical Arts",
    },
    passenger: {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      email: 'sjenkins@bayer.com',
      phone: '(314) 738-9921',
      passengerCount: 1,
      luggageCount: 0,
    },
    vehicleTier: 'standard',
    pricing: {
      baseFare: 4.5,
      distanceMiles: 4.2,
      durationMinutes: 10,
      distanceRate: 2.8,
      timeRate: 0.55,
      vehicleMultiplier: 1.0,
      surgeMultiplier: 1.0,
      discountAmount: 0,
      subtotal: 18.5,
      totalFare: 18.5,
      currency: 'USD',
    },
    payment: {
      method: 'cash',
      status: 'refunded',
      amount: 0,
    },
    statusHistory: [
      { from: null, to: 'UNCONFIRMED', timestamp: '2026-08-24T18:00:00.000Z', actorRole: 'passenger' },
      { from: 'UNCONFIRMED', to: 'cancelled', timestamp: '2026-08-25T09:00:00.000Z', actorRole: 'passenger', reason: 'Rescheduled appointment' },
    ],
    createdAt: '2026-08-24T18:00:00.000Z',
    updatedAt: '2026-08-25T09:00:00.000Z',
  },
];

export class PassengerService {
  private account: PassengerAccount = DEFAULT_PASSENGER_ACCOUNT;
  private listeners = new Set<(account: PassengerAccount) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(PASSENGER_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.account = {
            ...DEFAULT_PASSENGER_ACCOUNT,
            ...parsed,
            communicationPreferences: {
              ...DEFAULT_PASSENGER_ACCOUNT.communicationPreferences,
              ...(parsed.communicationPreferences || {}),
            },
            savedPlaces: Array.isArray(parsed.savedPlaces) && parsed.savedPlaces.length > 0
              ? parsed.savedPlaces
              : DEFAULT_PASSENGER_ACCOUNT.savedPlaces,
          };
        }
      } catch (err) {
        console.warn('[PassengerService] Could not parse stored account:', err);
      }
    }
  }

  public async getAccount(): Promise<PassengerAccount> {
    return { ...this.account };
  }

  public getCachedAccount(): PassengerAccount {
    return { ...this.account };
  }

  public async updateAccount(updates: Partial<PassengerAccount>): Promise<PassengerAccount> {
    this.account = {
      ...this.account,
      ...updates,
      communicationPreferences: {
        ...this.account.communicationPreferences,
        ...(updates.communicationPreferences || {}),
      },
    };
    this.persist();
    this.notify();
    return { ...this.account };
  }

  public async addSavedPlace(placeInput: Omit<SavedPlace, 'id'>): Promise<SavedPlace> {
    const newPlace: SavedPlace = {
      ...placeInput,
      id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    this.account = {
      ...this.account,
      savedPlaces: [newPlace, ...this.account.savedPlaces],
    };

    this.persist();
    this.notify();
    return newPlace;
  }

  public async updateSavedPlace(id: string, updates: Partial<SavedPlace>): Promise<SavedPlace> {
    let updatedTarget: SavedPlace | null = null;

    this.account = {
      ...this.account,
      savedPlaces: this.account.savedPlaces.map((sp) => {
        if (sp.id === id) {
          updatedTarget = { ...sp, ...updates };
          return updatedTarget;
        }
        return sp;
      }),
    };

    this.persist();
    this.notify();

    if (!updatedTarget) {
      throw new Error(`Saved place #${id} not found.`);
    }

    return updatedTarget;
  }

  public async deleteSavedPlace(id: string): Promise<void> {
    this.account = {
      ...this.account,
      savedPlaces: this.account.savedPlaces.filter((sp) => sp.id !== id),
    };
    this.persist();
    this.notify();
  }

  public subscribeToAccount(callback: (account: PassengerAccount) => void): () => void {
    this.listeners.add(callback);
    callback({ ...this.account });
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Resolves past completed and cancelled trips for this passenger.
   * Merges live Firestore trips with sample records for full historical auditing.
   */
  public async getPassengerTrips(): Promise<Trip[]> {
    const bookingService = getBookingService();
    let liveTrips: Trip[] = [];
    try {
      if (bookingService.getAllTrips) {
        const all = await bookingService.getAllTrips();
        const normAccountPhone = this.account.phone.replace(/\D/g, '');
        const accountEmail = (this.account.email || '').toLowerCase();

        liveTrips = all.filter((t) => {
          const tPhone = (t.passenger?.phone || '').replace(/\D/g, '');
          const tEmail = (t.passenger?.email || '').toLowerCase();
          const tCust = t.customerId;
          return (
            (normAccountPhone && tPhone.includes(normAccountPhone)) ||
            (accountEmail && tEmail === accountEmail) ||
            tCust === this.account.id
          );
        });
      }
    } catch (err) {
      console.warn('[PassengerService] Error reading live trips from booking service:', err);
    }

    // Merge live trips with sample past trips, avoiding duplicate IDs
    const seenIds = new Set<string>();
    const combined: Trip[] = [];

    for (const trip of liveTrips) {
      if (!seenIds.has(trip.id)) {
        seenIds.add(trip.id);
        combined.push(trip);
      }
    }

    for (const trip of SAMPLE_PASSENGER_PAST_TRIPS) {
      if (!seenIds.has(trip.id)) {
        seenIds.add(trip.id);
        combined.push(trip);
      }
    }

    // Sort by scheduledPickupTime or createdAt descending (newest first)
    return combined.sort((a, b) => {
      const timeA = new Date(a.scheduledPickupTime || a.createdAt).getTime();
      const timeB = new Date(b.scheduledPickupTime || b.createdAt).getTime();
      return timeB - timeA;
    });
  }

  /**
   * Alias for getPassengerTrips for trip history lists.
   */
  public async getTripsHistory(): Promise<Trip[]> {
    return this.getPassengerTrips();
  }

  /**
   * Subscribes to live trips and locates any active trip for this passenger.
   * Active statuses: UNCONFIRMED, CONFIRMED, assigned, accepted, en_route, arrived, in_progress.
   */
  public subscribeToActiveTrip(callback: (activeTrip: Trip | null) => void): () => void {
    const bookingService = getBookingService();
    const activeStatuses: TripStatus[] = [
      'UNCONFIRMED',
      'unconfirmed',
      'CONFIRMED',
      'confirmed',
      'assigned',
      'accepted',
      'en_route',
      'arrived',
      'in_progress',
    ];

    const evaluateTrips = (trips: Trip[]) => {
      const normAccountPhone = this.account.phone.replace(/\D/g, '');
      const accountEmail = (this.account.email || '').toLowerCase();

      const active = trips.find((t) => {
        if (!activeStatuses.includes(t.status)) return false;
        const tPhone = (t.passenger?.phone || '').replace(/\D/g, '');
        const tEmail = (t.passenger?.email || '').toLowerCase();
        const tCust = t.customerId;

        return (
          (normAccountPhone && tPhone.includes(normAccountPhone)) ||
          (accountEmail && tEmail === accountEmail) ||
          tCust === this.account.id
        );
      });

      callback(active || null);
    };

    let unsubBooking: (() => void) | undefined;
    if (bookingService.subscribeToAllTrips) {
      unsubBooking = bookingService.subscribeToAllTrips((trips) => {
        evaluateTrips(trips);
      });
    } else {
      this.getPassengerTrips().then((trips) => evaluateTrips(trips));
    }

    return () => {
      if (unsubBooking) unsubBooking();
    };
  }

  private persist() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(PASSENGER_STORAGE_KEY, JSON.stringify(this.account));
      } catch (err) {
        console.warn('[PassengerService] Could not persist passenger account:', err);
      }
    }
  }

  private notify() {
    const snapshot = { ...this.account };
    this.listeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[PassengerService] Listener error:', err);
      }
    });
  }
}

let instance: PassengerService | null = null;
export function getPassengerService(): PassengerService {
  if (!instance) {
    instance = new PassengerService();
  }
  return instance;
}

/**
 * Normalizes phone numbers to 10 standard digits for cross-system comparisons.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

/**
 * Resolves the preferred mobile number for sending SMS dispatch confirmations and tracking links.
 */
export function resolvePrimarySmsPhone(passenger: PassengerAccount): string {
  if (passenger.primaryMobilePhone) return passenger.primaryMobilePhone;
  const primaryAlt = passenger.alternatePhones?.find((p) => p.isPrimarySms || p.type === 'mobile');
  if (primaryAlt) return primaryAlt.number;
  return passenger.phone;
}

/**
 * Matches an incoming caller phone number against all known customer phone numbers (mobile, home, work).
 */
export function matchPassengerByPhone(
  searchPhone: string,
  passengerDirectory: PassengerAccount[] = []
): { passenger: PassengerAccount; matchedType: 'mobile' | 'home' | 'work' | 'primary' } | null {
  const searchNorm = normalizePhone(searchPhone);
  if (!searchNorm) return null;

  // Search directory or default passenger
  const directory = passengerDirectory.length > 0 ? passengerDirectory : [DEFAULT_PASSENGER_ACCOUNT];

  for (const account of directory) {
    if (normalizePhone(account.phone) === searchNorm) {
      return { passenger: account, matchedType: 'primary' };
    }
    if (account.homePhone && normalizePhone(account.homePhone) === searchNorm) {
      return { passenger: account, matchedType: 'home' };
    }
    if (account.workPhone && normalizePhone(account.workPhone) === searchNorm) {
      return { passenger: account, matchedType: 'work' };
    }
    if (account.primaryMobilePhone && normalizePhone(account.primaryMobilePhone) === searchNorm) {
      return { passenger: account, matchedType: 'mobile' };
    }
    if (account.alternatePhones) {
      const match = account.alternatePhones.find((p) => normalizePhone(p.number) === searchNorm);
      if (match) {
        return { passenger: account, matchedType: match.type as any };
      }
    }
  }

  return null;
}
