/**
 * Passenger Account & Saved Places Data Models
 * 
 * Defines schemas for passenger profiles, categorized saved places,
 * communication preferences, and quick booking shortcuts.
 */

import type { VehicleTier } from './trip';

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

export interface PassengerAccount {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passengerNotes?: string; // e.g. "Prefer side door, wheelchair ramp access needed"
  preferredVehicleTier?: VehicleTier;
  communicationPreferences: CommunicationPreferences;
  savedPlaces: SavedPlace[];
  recentSearches?: string[];
}
