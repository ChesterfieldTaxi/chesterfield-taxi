/**
 * Passenger Lookup Service
 * 
 * Provides search and profile resolution for dispatchers and operators.
 * Searches past customer history in Firestore by telephone number or email address,
 * with fallbacks to regional accounts for instant operational readiness.
 */

import { getBookingService } from './index';
import type { Trip } from '../../types';

export interface PassengerProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  corporateAccountId?: string;
  notes?: string;
  preferredVehicleTier?: 'standard' | 'premium' | 'xl' | 'wheelchair';
  recentPickupAddress?: string;
  recentDropoffAddress?: string;
  totalTrips?: number;
  vipStatus?: boolean;
}

/**
 * Curated regional and corporate profiles for offline dispatch & immediate demonstration.
 */
export const SAMPLE_PASSENGER_PROFILES: PassengerProfile[] = [
  {
    id: 'pass_bayer_01',
    firstName: 'Sarah',
    lastName: 'Jenkins',
    phone: '(314) 738-9921',
    email: 'sjenkins@bayer.com',
    corporateAccountId: 'CORP-BAYER-WEST',
    notes: 'Executive traveler; prefers prompt airport pickups at Terminal 1 baggage claim.',
    preferredVehicleTier: 'premium',
    recentPickupAddress: 'Bayer Chesterfield Campus, 700 Chesterfield Pkwy W, Chesterfield, MO',
    recentDropoffAddress: 'St. Louis Lambert International Airport (STL)',
    totalTrips: 24,
    vipStatus: true,
  },
  {
    id: 'pass_mercy_02',
    firstName: 'Arthur',
    lastName: 'Pendelton',
    phone: '(314) 555-0142',
    email: 'pendelton.md@mercy.net',
    corporateAccountId: 'CORP-MERCY-STL',
    notes: 'Staff Physician; direct invoicing to Mercy Hospital Administration.',
    preferredVehicleTier: 'standard',
    recentPickupAddress: 'Mercy Hospital St. Louis, 615 S New Ballas Rd, St. Louis, MO',
    recentDropoffAddress: 'Spirit of St. Louis Airport (SUS), Chesterfield, MO',
    totalTrips: 18,
    vipStatus: true,
  },
  {
    id: 'pass_vance_03',
    firstName: 'Marcus',
    lastName: 'Vance',
    phone: '(314) 822-4411',
    email: 'marcus.vance@vancetech.com',
    corporateAccountId: 'CORP-VANCE-TECH',
    notes: 'Frequent multi-passenger team transfers; luggage storage needed.',
    preferredVehicleTier: 'xl',
    recentPickupAddress: '16640 Chesterfield Airport Rd, Chesterfield, MO',
    recentDropoffAddress: 'Four Seasons Hotel St. Louis, 999 N 2nd St, St. Louis, MO',
    totalTrips: 9,
    vipStatus: false,
  },
  {
    id: 'pass_wav_04',
    firstName: 'Eleanor',
    lastName: 'Davis',
    phone: '(314) 965-3320',
    email: 'edavis@westcountycares.org',
    notes: 'Requires wheelchair accessible van (WAV) with rear motorized ramp.',
    preferredVehicleTier: 'wheelchair',
    recentPickupAddress: 'Brooking Park Senior Living, 307 S Woods Mill Rd, Chesterfield, MO',
    recentDropoffAddress: 'St. Luke’s Hospital, 232 S Woods Mill Rd, Chesterfield, MO',
    totalTrips: 14,
    vipStatus: false,
  },
];

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export class PassengerLookupService {
  /**
   * Searches for passenger profiles matching query string against phone, email, or name.
   */
  public async searchPassengers(query: string): Promise<PassengerProfile[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const cleanNumeric = normalizePhone(trimmed);

    // 1. Gather historical profiles from existing Firestore trips
    const firestoreProfiles: PassengerProfile[] = [];
    try {
      const bookingService = getBookingService();
      let trips: Trip[] = [];
      if (bookingService.getAllTrips) {
        trips = await bookingService.getAllTrips();
      }

      // Map trips into unique passenger profiles
      const seen = new Map<string, PassengerProfile>();
      for (const trip of trips) {
        if (!trip.passenger || !trip.passenger.phone) continue;
        const phone = trip.passenger.phone;
        const norm = normalizePhone(phone);
        const email = (trip.passenger.email || '').toLowerCase();
        const fullName = `${trip.passenger.firstName} ${trip.passenger.lastName}`.toLowerCase();

        const matchesQuery =
          (cleanNumeric && norm.includes(cleanNumeric)) ||
          email.includes(trimmed) ||
          fullName.includes(trimmed);

        if (matchesQuery) {
          if (!seen.has(norm)) {
            seen.set(norm, {
              id: trip.customerId || `pass_${norm}`,
              firstName: trip.passenger.firstName,
              lastName: trip.passenger.lastName,
              phone: trip.passenger.phone,
              email: trip.passenger.email,
              corporateAccountId: (trip.metadata?.corporateAccountId as string) || undefined,
              notes: trip.passenger.specialRequests || trip.driverNotes,
              preferredVehicleTier: trip.vehicleTier,
              recentPickupAddress: trip.pickupLocation?.address,
              recentDropoffAddress: trip.dropoffLocation?.address,
              totalTrips: 1,
              vipStatus: Boolean(trip.metadata?.vipStatus),
            });
          } else {
            const existing = seen.get(norm)!;
            existing.totalTrips = (existing.totalTrips || 1) + 1;
          }
        }
      }
      firestoreProfiles.push(...Array.from(seen.values()));
    } catch (err) {
      console.warn('[PassengerLookupService] Error searching Firestore trips:', err);
    }

    // 2. Filter sample fallback profiles
    const sampleMatches = SAMPLE_PASSENGER_PROFILES.filter((profile) => {
      const norm = normalizePhone(profile.phone);
      const email = profile.email.toLowerCase();
      const fullName = `${profile.firstName} ${profile.lastName}`.toLowerCase();
      return (
        (cleanNumeric && norm.includes(cleanNumeric)) ||
        email.includes(trimmed) ||
        fullName.includes(trimmed)
      );
    });

    // Merge and deduplicate by normalized phone
    const combined = new Map<string, PassengerProfile>();
    for (const p of firestoreProfiles) {
      combined.set(normalizePhone(p.phone), p);
    }
    for (const p of sampleMatches) {
      const norm = normalizePhone(p.phone);
      if (!combined.has(norm)) {
        combined.set(norm, p);
      }
    }

    return Array.from(combined.values());
  }
}

let instance: PassengerLookupService | null = null;
export function getPassengerLookupService(): PassengerLookupService {
  if (!instance) {
    instance = new PassengerLookupService();
  }
  return instance;
}
