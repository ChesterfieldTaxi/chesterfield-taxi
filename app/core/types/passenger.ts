/**
 * Passenger Account & Saved Places Data Models
 * 
 * Defines schemas for passenger profiles, categorized saved places,
 * communication preferences, and quick booking shortcuts.
 */

import type { VehicleTier } from './trip';
import type { VaultedCard } from './payment';

export type SavedPlaceCategory =
  | 'home'
  | 'work'
  | 'airport'
  | 'medical'
  | 'favorite'
  | 'other';

export interface SavedPlace {
  id: string;
  label: string; // e.g. "Home", "Office", "Lambert Airport T1"
  category: SavedPlaceCategory;
  address: string;
  notes?: string; // e.g. "Front circle drive", "Apt 4B"
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface CommunicationPreferences {
  smsUpdates: boolean;
  emailReceipts: boolean;
  phoneCalls: boolean;
}

export interface AlternatePhone {
  type: 'mobile' | 'home' | 'work' | 'other';
  number: string;
  label?: string;
  isPrimarySms?: boolean;
}

export interface PassengerAccount {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  alternatePhones?: AlternatePhone[];
  homePhone?: string;
  workPhone?: string;
  primaryMobilePhone?: string;
  passengerNotes?: string; // e.g. "Prefer side door, wheelchair ramp access needed"
  preferredVehicleTier?: VehicleTier;
  communicationPreferences: CommunicationPreferences;
  savedPlaces: SavedPlace[];
  recentSearches?: string[];
  vaultedPaymentMethods?: VaultedCard[];

  /** Universal Governance & Scoring (Phase 29) */
  isArchived?: boolean;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  
  customerScore?: number; // 0-100 metric
  totalTrips?: number;
  cancellationRate?: number; // %
  noShows?: number;
  averageRating?: number; // 1.0 - 5.0
}
