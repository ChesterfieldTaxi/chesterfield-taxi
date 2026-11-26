/**
 * Passenger Lookup Service
 *
 * Provides search and profile resolution for dispatchers and operators.
 * Uses indexed remote contact search (`ContactService.searchContactsRemote`)
 * with an in-memory LRU cache and regional sample fallbacks — zero `getAllTrips()` scans.
 */

import { getContactService } from '../customer/contact.service';

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
  {
    id: 'pass_bayer_amanda',
    firstName: 'Amanda',
    lastName: 'Vance',
    phone: '(314) 555-0199',
    email: 'amanda.vance@bayer.com',
    corporateAccountId: 'CORP-BAYER-WEST',
    notes: 'Corporate Travel Coordinator | Bayer Chesterfield Campus. Prefers executive sedan transfers.',
    preferredVehicleTier: 'premium',
    recentPickupAddress: 'St. Louis Lambert International Airport (STL) Terminal 1 Exit 6',
    recentDropoffAddress: 'Bayer Crop Science Campus, 700 Chesterfield Pkwy W, Chesterfield, MO 63017',
    totalTrips: 16,
    vipStatus: true,
  },
  {
    id: 'pass_bjc_rossi',
    firstName: 'Elena',
    lastName: 'Rossi',
    phone: '(314) 555-0144',
    email: 'elena.rossi@bjc.org',
    corporateAccountId: 'CORP-BJC-WEST',
    notes: 'Barnes-Jewish West County Hospital outpatient coordinator; folding wheelchair trunk assistance.',
    preferredVehicleTier: 'standard',
    recentPickupAddress: 'Barnes-Jewish West County Hospital, 12634 Olive Blvd, Creve Coeur, MO 63141',
    recentDropoffAddress: '14848 Conway Rd, Chesterfield, MO 63017',
    totalTrips: 11,
    vipStatus: false,
  },
];

function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function mapTierToPassengerTier(
  tier?: string
): PassengerProfile['preferredVehicleTier'] {
  if (tier === 'premium' || tier === 'executive') return 'premium';
  if (tier === 'xl' || tier === 'suv' || tier === 'van') return 'xl';
  if (tier === 'wheelchair') return 'wheelchair';
  return 'standard';
}

export class PassengerLookupService {
  /**
   * Searches for passenger profiles matching query string against phone, email, or name
   * via `ContactService.searchContactsRemote` (bounded to 25 indexed matches + LRU cache).
   */
  public async searchPassengers(query: string): Promise<PassengerProfile[]> {
    const trimmed = query.trim();
    const trimmedLower = trimmed.toLowerCase();
    if (!trimmedLower || trimmedLower.length < 2) {
      return [];
    }

    const cleanNumeric = normalizePhoneDigits(trimmedLower);
    const combined = new Map<string, PassengerProfile>();

    try {
      const contacts = await getContactService().searchContactsRemote(trimmed, 25);
      for (const c of contacts) {
        if (c.isBlacklisted) continue;
        const nameParts = String(c.name || '').trim().split(/\s+/);
        const firstName = c.firstName || nameParts[0] || 'Customer';
        const lastName =
          c.lastName !== undefined ? c.lastName : nameParts.slice(1).join(' ');
        const dedupeKey =
          normalizePhoneDigits(c.phone || '') || (c.email || '').toLowerCase() || c.id;

        combined.set(dedupeKey, {
          id: c.id,
          firstName,
          lastName,
          phone: c.phone || '',
          email: c.email || '',
          corporateAccountId: c.corporateAccountId,
          notes: c.notes || c.internalDispatcherNotes,
          preferredVehicleTier: mapTierToPassengerTier(c.preferredVehicleTier),
          recentPickupAddress: c.homeAddress || c.savedPlaces?.[0]?.address,
          recentDropoffAddress: c.workAddress || c.savedPlaces?.[1]?.address,
          totalTrips: c.tripCount || 1,
          vipStatus: Boolean(c.isVip),
        });
      }
    } catch (err) {
      console.warn('[PassengerLookupService] Error searching contacts:', err);
    }

    // Merge sample fallback profiles if not already present
    for (const profile of SAMPLE_PASSENGER_PROFILES) {
      const norm = normalizePhoneDigits(profile.phone);
      const email = profile.email.toLowerCase();
      const fullName = `${profile.firstName} ${profile.lastName}`.toLowerCase();
      const matches =
        (cleanNumeric.length >= 3 && norm.includes(cleanNumeric)) ||
        email.includes(trimmedLower) ||
        fullName.includes(trimmedLower);
      if (matches && !combined.has(norm)) {
        combined.set(norm, profile);
      }
    }

    return Array.from(combined.values()).slice(0, 25);
  }
}

let instance: PassengerLookupService | null = null;
export function getPassengerLookupService(): PassengerLookupService {
  if (!instance) {
    instance = new PassengerLookupService();
  }
  return instance;
}
