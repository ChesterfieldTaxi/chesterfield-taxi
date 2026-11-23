/**
 * Secure Guest Tracking Token & Sanitized Public Projection Utilities
 *
 * Ensures unauthenticated `/track/:trackingToken` viewers NEVER receive
 * sensitive passenger PII (full name, phone, email, gate codes, apt/unit,
 * corporate PO numbers, or billing details).
 */

import type { DriverTelemetryPing, Trip, TripStatus, VehicleTier } from '../types/trip';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import {
  evaluateGuestManageEligibility,
  getPendingGuestChangeRequest,
  type GuestRouteTimeMode,
} from '../services/tracking/guest-manage-ride';

export interface PublicPendingGuestChangeSummary {
  requestId: string;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: string;
  requestedScheduledPickupTime?: string;
  requestedPickupDisplay?: string;
  requestedDropoffDisplay?: string;
  estimatedNewFare?: number;
  resolutionNote?: string | null;
}

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

  // Phase 56: Strictly zero-PII self-service summary fields
  totalFare?: number;
  currency?: string;
  hasGateCode?: boolean;
  flightSummary?: string;
  riderNotesPreview?: string;
  canSelfManage?: boolean;
  routeTimeMode?: GuestRouteTimeMode;
  pendingGuestChangeSummary?: PublicPendingGuestChangeSummary | null;
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
export async function computeTripPhoneLookupKey(
  tripId: string,
  phoneOrLast4: string
): Promise<string | null> {
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
  const hex = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
  return `${cleanId}_${hex}`;
}

/**
 * Strips apartment/unit/gate/code/# details from an address string for zero-PII public display.
 */
export function sanitizePublicAddressDisplay(address?: string): string {
  if (!address) return 'Scheduled Location';
  const cleaned = address
    .replace(
      /\b(?:gate\s*code|door\s*code|access\s*code|entry\s*code|apt\.?|apartment|unit|suite|ste\.?|gate|code|rm\.?|room|fl\.?|floor|po\s*box|po)\s*[:#-]?\s*[a-z0-9-]+/gi,
      ''
    )
    .replace(/(?:^|[\s,])#\s*[a-z0-9-]+/gi, '')
    .replace(/\s+,/g, ',')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^,\s*|\s*,\s*$/g, '')
    .trim();
  return cleaned || 'Scheduled Location';
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips gate codes, phone numbers, email addresses, and corporate PO references from rider notes
 * so `riderNotesPreview` remains strictly zero-PII.
 */
export function sanitizePublicNotesPreview(
  rawNotes?: string | null,
  rawGateCode?: string | null
): string | undefined {
  if (!rawNotes) return undefined;
  let cleaned = String(rawNotes).trim();
  if (!cleaned) return undefined;

  const trimmedGate = String(rawGateCode || '').trim();
  if (trimmedGate) {
    cleaned = cleaned.replace(new RegExp(escapeRegExp(trimmedGate), 'gi'), '');
    const gateDigits = trimmedGate.replace(/\D/g, '');
    if (gateDigits.length >= 3) {
      cleaned = cleaned.replace(new RegExp(escapeRegExp(gateDigits), 'g'), '');
    }
  }

  cleaned = cleaned
    // Strip emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    // Strip phone numbers
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '')
    // Strip explicit gate/code/pin/PO markers
    .replace(
      /\b(?:gate\s*code|door\s*code|access\s*code|entry\s*code|pin|gate|code|po\s*number|po\s*#|billing\s*po)\s*[:#-]?\s*[a-z0-9-]+/gi,
      ''
    )
    .replace(/(?:^|[\s,])#\s*\d{2,}[a-z0-9-]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;.\s-]+|[,;.\s-]+$/g, '')
    .trim();

  if (!cleaned) return undefined;
  return cleaned.length > 120 ? `${cleaned.slice(0, 117).trimEnd()}...` : cleaned;
}

function buildFlightSummaryForProjection(trip: Trip): string | undefined {
  const meta = (trip.metadata || {}) as Record<string, any>;
  const flightDetails = (meta.flightDetails || {}) as Record<string, any>;
  const airline = String(
    meta.airline || meta.airlineName || flightDetails.airlineName || ''
  ).trim();
  const flightNum = String(meta.flightNumber || flightDetails.flightNumber || '')
    .trim()
    .replace(/^#/, '');

  if (airline || flightNum) {
    return [airline, flightNum ? `#${flightNum}` : ''].filter(Boolean).join(' ');
  }

  if (typeof trip.flightNotes === 'string' && trip.flightNotes.trim()) {
    const unwrapped = trip.flightNotes
      .trim()
      .replace(/^\[Flight:\s*/i, '')
      .replace(/\]$/, '')
      .trim();
    if (unwrapped) {
      return unwrapped.slice(0, 64);
    }
  }

  return undefined;
}

/**
 * Builds a strictly zero-PII public tracking document from a full Trip record.
 */
export function buildPublicTrackingProjection(
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

  const rawGateCode = typeof meta.gateCode === 'string' ? meta.gateCode.trim() : '';
  const hasGateCode = rawGateCode.length > 0;
  const flightSummary = buildFlightSummaryForProjection(trip);
  const riderNotesPreview = sanitizePublicNotesPreview(
    trip.driverNotes || trip.pickupLocation?.notes,
    rawGateCode
  );

  const eligibility = evaluateGuestManageEligibility(trip);
  const pendingReq = getPendingGuestChangeRequest(trip);
  const pendingGuestChangeSummary: PublicPendingGuestChangeSummary | null = pendingReq
    ? {
        requestId: pendingReq.requestId,
        status: pendingReq.status,
        requestedAt: pendingReq.requestedAt,
        ...(pendingReq.requestedScheduledPickupTime
          ? { requestedScheduledPickupTime: pendingReq.requestedScheduledPickupTime }
          : {}),
        ...(pendingReq.requestedPickupAddress
          ? {
              requestedPickupDisplay: sanitizePublicAddressDisplay(
                pendingReq.requestedPickupAddress
              ),
            }
          : {}),
        ...(pendingReq.requestedDropoffAddress
          ? {
              requestedDropoffDisplay: sanitizePublicAddressDisplay(
                pendingReq.requestedDropoffAddress
              ),
            }
          : {}),
        ...(typeof pendingReq.estimatedNewFare === 'number' &&
        Number.isFinite(pendingReq.estimatedNewFare)
          ? { estimatedNewFare: Number(pendingReq.estimatedNewFare.toFixed(2)) }
          : {}),
        resolutionNote: pendingReq.resolutionNote ?? null,
      }
    : null;

  const totalFare =
    typeof trip.pricing?.totalFare === 'number' && Number.isFinite(trip.pricing.totalFare)
      ? Number(trip.pricing.totalFare.toFixed(2))
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
    totalFare,
    currency: trip.pricing?.currency || 'USD',
    hasGateCode,
    ...(flightSummary ? { flightSummary } : {}),
    ...(riderNotesPreview ? { riderNotesPreview } : {}),
    canSelfManage: eligibility.canSelfManage,
    routeTimeMode: eligibility.routeTimeMode,
    pendingGuestChangeSummary,
  };

  return projection;
}

/**
 * Backward-compatible alias for `buildPublicTrackingProjection`.
 */
export const buildSanitizedTrackingProjection = buildPublicTrackingProjection;

/**
 * Sanitizes an untrusted or Firestore-decoded `/tripTracking/{token}` document into a strictly
 * zero-PII `PublicTripTrackingProjection`.
 */
export function sanitizePublicTrackingProjection(
  doc: Record<string, any>
): PublicTripTrackingProjection {
  const status = (doc.status || 'CONFIRMED') as TripStatus;
  const bookingType = doc.bookingType === 'asap' ? 'asap' : 'scheduled';
  const scheduledPickupTime =
    typeof doc.scheduledPickupTime === 'string' ? doc.scheduledPickupTime : undefined;
  const inferredAssignedDriver =
    Boolean(doc.assignedDriverFirstName) ||
    Boolean(doc.assignedVehicle) ||
    ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(String(status));

  const fallbackEligibility = evaluateGuestManageEligibility({
    status,
    assignedDriverId: inferredAssignedDriver ? 'assigned' : null,
    bookingType,
    scheduledPickupTime,
  });

  const rawSummary = doc.pendingGuestChangeSummary;
  const pendingGuestChangeSummary: PublicPendingGuestChangeSummary | null =
    rawSummary &&
    typeof rawSummary === 'object' &&
    typeof rawSummary.requestId === 'string' &&
    rawSummary.requestId
      ? {
          requestId: String(rawSummary.requestId),
          status:
            rawSummary.status === 'approved' || rawSummary.status === 'declined'
              ? rawSummary.status
              : 'pending',
          requestedAt: String(rawSummary.requestedAt || ''),
          ...(typeof rawSummary.requestedScheduledPickupTime === 'string' &&
          rawSummary.requestedScheduledPickupTime
            ? { requestedScheduledPickupTime: rawSummary.requestedScheduledPickupTime }
            : {}),
          ...(typeof rawSummary.requestedPickupDisplay === 'string' &&
          rawSummary.requestedPickupDisplay
            ? {
                requestedPickupDisplay: sanitizePublicAddressDisplay(
                  rawSummary.requestedPickupDisplay
                ),
              }
            : {}),
          ...(typeof rawSummary.requestedDropoffDisplay === 'string' &&
          rawSummary.requestedDropoffDisplay
            ? {
                requestedDropoffDisplay: sanitizePublicAddressDisplay(
                  rawSummary.requestedDropoffDisplay
                ),
              }
            : {}),
          ...(typeof rawSummary.estimatedNewFare === 'number' &&
          Number.isFinite(rawSummary.estimatedNewFare)
            ? { estimatedNewFare: Number(rawSummary.estimatedNewFare.toFixed(2)) }
            : {}),
          resolutionNote:
            typeof rawSummary.resolutionNote === 'string' ? rawSummary.resolutionNote : null,
        }
      : null;

  return {
    trackingToken: String(doc.trackingToken || ''),
    tripId: String(doc.tripId || ''),
    status,
    bookingType,
    scheduledPickupTime,
    pickupDisplay: sanitizePublicAddressDisplay(String(doc.pickupDisplay || 'Scheduled Pickup')),
    dropoffDisplay: sanitizePublicAddressDisplay(
      String(doc.dropoffDisplay || 'Scheduled Destination')
    ),
    pickupCoordinates: doc.pickupCoordinates,
    dropoffCoordinates: doc.dropoffCoordinates,
    intermediateStops: Array.isArray(doc.intermediateStops)
      ? doc.intermediateStops.map((s: any) => ({
          display: sanitizePublicAddressDisplay(String(s?.display || s?.address || '')),
          ...(s?.coordinates ? { coordinates: s.coordinates } : {}),
        }))
      : undefined,
    vehicleTier: doc.vehicleTier || 'any',
    vehicleDisplayName:
      typeof doc.vehicleDisplayName === 'string' ? doc.vehicleDisplayName : undefined,
    assignedDriverFirstName:
      typeof doc.assignedDriverFirstName === 'string'
        ? doc.assignedDriverFirstName.trim().split(/\s+/)[0]
        : undefined,
    assignedVehicle: doc.assignedVehicle
      ? {
          vehicleNumber: String(doc.assignedVehicle.vehicleNumber || ''),
          ...(doc.assignedVehicle.licensePlate
            ? { licensePlate: String(doc.assignedVehicle.licensePlate) }
            : {}),
          ...(doc.assignedVehicle.model ? { model: String(doc.assignedVehicle.model) } : {}),
        }
      : undefined,
    driverTelemetry: doc.driverTelemetry || undefined,
    etaMinutes: typeof doc.etaMinutes === 'number' ? doc.etaMinutes : undefined,
    proxyPhone: String(doc.proxyPhone || ''),
    updatedAt: String(doc.updatedAt || new Date().toISOString()),
    totalFare:
      typeof doc.totalFare === 'number' && Number.isFinite(doc.totalFare)
        ? Number(doc.totalFare.toFixed(2))
        : undefined,
    currency: typeof doc.currency === 'string' ? doc.currency : undefined,
    hasGateCode: typeof doc.hasGateCode === 'boolean' ? doc.hasGateCode : undefined,
    flightSummary:
      typeof doc.flightSummary === 'string' && doc.flightSummary.trim()
        ? doc.flightSummary.trim()
        : undefined,
    riderNotesPreview:
      typeof doc.riderNotesPreview === 'string'
        ? sanitizePublicNotesPreview(doc.riderNotesPreview)
        : undefined,
    canSelfManage:
      typeof doc.canSelfManage === 'boolean'
        ? doc.canSelfManage
        : fallbackEligibility.canSelfManage,
    routeTimeMode:
      doc.routeTimeMode === 'auto_apply' ||
      doc.routeTimeMode === 'request_approval' ||
      doc.routeTimeMode === 'locked'
        ? doc.routeTimeMode
        : fallbackEligibility.routeTimeMode,
    pendingGuestChangeSummary,
  };
}

/**
 * Extracts strictly the 18 client-rule-permitted keys for unauthenticated browser SDK
 * `/tripTracking/{trackingToken}` fallback writes (while server-side `/api/track` and
 * Service Account REST writes store & serve the full `PublicTripTrackingProjection`).
 */
export function toFirestoreClientRuleProjection(
  projection: PublicTripTrackingProjection
): Record<string, unknown> {
  return {
    trackingToken: projection.trackingToken,
    tripId: projection.tripId,
    status: projection.status,
    bookingType: projection.bookingType,
    ...(projection.scheduledPickupTime !== undefined
      ? { scheduledPickupTime: projection.scheduledPickupTime }
      : {}),
    pickupDisplay: projection.pickupDisplay,
    dropoffDisplay: projection.dropoffDisplay,
    ...(projection.pickupCoordinates !== undefined
      ? { pickupCoordinates: projection.pickupCoordinates }
      : {}),
    ...(projection.dropoffCoordinates !== undefined
      ? { dropoffCoordinates: projection.dropoffCoordinates }
      : {}),
    ...(projection.intermediateStops !== undefined
      ? { intermediateStops: projection.intermediateStops }
      : {}),
    vehicleTier: projection.vehicleTier,
    ...(projection.vehicleDisplayName !== undefined
      ? { vehicleDisplayName: projection.vehicleDisplayName }
      : {}),
    ...(projection.assignedDriverFirstName !== undefined
      ? { assignedDriverFirstName: projection.assignedDriverFirstName }
      : {}),
    ...(projection.assignedVehicle !== undefined
      ? { assignedVehicle: projection.assignedVehicle }
      : {}),
    ...(projection.driverTelemetry !== undefined
      ? { driverTelemetry: projection.driverTelemetry }
      : {}),
    ...(projection.etaMinutes !== undefined ? { etaMinutes: projection.etaMinutes } : {}),
    proxyPhone: projection.proxyPhone,
    updatedAt: projection.updatedAt,
  };
}
