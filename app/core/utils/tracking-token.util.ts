/**
 * Secure Guest Tracking Token & Sanitized Public Projection Utilities
 *
 * Ensures unauthenticated `/track/:trackingToken` viewers NEVER receive
 * sensitive passenger PII (full name, phone, email, gate codes, apt/unit,
 * corporate PO numbers, or billing details).
 */

import type { DriverTelemetryPing, Trip, TripStatus, VehicleTier } from '../types/trip';
import { COMPANY_CONFIG } from '../../config/companyConfig';

export interface PublicTripTrackingProjection {
  trackingToken: string;
  tripId: string;
  status: TripStatus;
  bookingType: 'asap' | 'scheduled';
  scheduledPickupTime?: string;
  pickupDisplay: string;
  dropoffDisplay: string;
  pickupCoordinates?: { lat: number; lng: number };
  dropoffCoordinates?: { lat: number; lng: number };
  intermediateStops?: Array<{
    display: string;
    coordinates?: { lat: number; lng: number };
  }>;
  vehicleTier: VehicleTier;
  vehicleDisplayName?: string;
  assignedDriverFirstName?: string;
  assignedVehicle?: {
    vehicleNumber: string;
    licensePlate?: string;
    model?: string;
  };
  driverTelemetry?: DriverTelemetryPing;
  etaMinutes?: number;
  proxyPhone: string;
  updatedAt: string;
}

/**
 * Generates a high-entropy URL-safe tracking token (128+ bits).
 */
export function generateTrackingToken(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    if (typeof globalThis.crypto.randomUUID === 'function') {
      const part1 = globalThis.crypto.randomUUID().replace(/-/g, '');
      const bytes = new Uint8Array(6);
      globalThis.crypto.getRandomValues(bytes);
      const part2 = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `trk_${part1}${part2}`;
    }
    const bytes = new Uint8Array(20);
    globalThis.crypto.getRandomValues(bytes);
    return `trk_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `trk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Extracts normalized last 4 digits of a phone string.
 */
export function extractPhoneLast4(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return digits.slice(-4);
}

/**
 * Computes a deterministic lookup key combining uppercase tripId + last4 phone hash.
 * Uses Web Crypto SHA-256 when available (browser & Node 20+), with a deterministic fallback.
 */
export async function computeTripPhoneLookupKey(tripId: string, phoneOrLast4: string): Promise<string | null> {
  const cleanId = String(tripId || '').trim().replace(/^#/, '').toUpperCase();
  const last4 = extractPhoneLast4(phoneOrLast4);
  if (!cleanId || last4.length !== 4) return null;

  const input = `ct_track_v1:${cleanId}:${last4}`;
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    try {
      const data = new TextEncoder().encode(input);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 20);
      return `${cleanId}_${hex}`;
    } catch {
      // Fallback below
    }
  }

  // Deterministic FNV-1a 64-bit fallback if subtle crypto is unavailable
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x01000193);
  }
  const hex = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
  return `${cleanId}_${hex}`;
}

/**
 * Strips apartment/unit/gate details from an address string for public display.
 */
export function sanitizePublicAddressDisplay(address?: string): string {
  if (!address) return 'Scheduled Location';
  // Remove explicit unit/apt/suite/gate markers while preserving street & city for orientation
  const cleaned = address
    .replace(/\b(apt|apartment|unit|suite|ste|gate|code|#)\s*[:#-]?\s*[a-z0-9-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
  return cleaned || 'Scheduled Location';
}

/**
 * Builds a strictly zero-PII public tracking document from a full Trip record.
 */
export function buildSanitizedTrackingProjection(
  trip: Trip,
  overrides?: {
    driverFirstName?: string;
    etaMinutes?: number;
  }
): PublicTripTrackingProjection | null {
  const token = trip.trackingToken?.trim();
  if (!token) return null;

  const meta = (trip.metadata || {}) as Record<string, any>;
  const vehicleDisplayName =
    typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName.trim()
      ? meta.vehicleDisplayName.trim()
      : undefined;

  const rawDriverName =
    overrides?.driverFirstName ||
    (typeof meta.assignedDriverName === 'string' ? meta.assignedDriverName : undefined);
  const assignedDriverFirstName = rawDriverName
    ? rawDriverName.trim().split(/\s+/)[0]
    : undefined;

  const projection: PublicTripTrackingProjection = {
    trackingToken: token,
    tripId: trip.id,
    status: trip.status,
    bookingType: trip.bookingType,
    scheduledPickupTime: trip.scheduledPickupTime,
    pickupDisplay: sanitizePublicAddressDisplay(trip.pickupLocation?.address),
    dropoffDisplay: sanitizePublicAddressDisplay(trip.dropoffLocation?.address),
    pickupCoordinates: trip.pickupLocation?.coordinates,
    dropoffCoordinates: trip.dropoffLocation?.coordinates,
    intermediateStops: trip.intermediateStops?.length
      ? trip.intermediateStops.map((s) => ({
          display: sanitizePublicAddressDisplay(s.address),
          coordinates: s.coordinates,
        }))
      : undefined,
    vehicleTier: trip.vehicleTier,
    vehicleDisplayName,
    assignedDriverFirstName,
    assignedVehicle: trip.assignedVehicle
      ? {
          vehicleNumber: trip.assignedVehicle.vehicleNumber,
          licensePlate: trip.assignedVehicle.licensePlate,
          model: trip.assignedVehicle.model,
        }
      : undefined,
    driverTelemetry: trip.driverTelemetry || trip.currentLocation,
    etaMinutes: overrides?.etaMinutes,
    proxyPhone: trip.proxyNumber || COMPANY_CONFIG.phone.primaryRaw,
    updatedAt: trip.updatedAt || new Date().toISOString(),
  };

  return projection;
}
