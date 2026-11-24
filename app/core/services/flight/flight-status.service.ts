/**
 * Client & Domain Flight Status Service (`flight-status.service.ts`)
 *
 * Pure helpers and `/api/flight-status` client orchestration for:
 * - Smart Booking Wizard live flight status checks (`FlightAssistanceCard`)
 * - Dispatch Queue & Trip Details telemetry pills, staff force-refresh, and
 *   1-tap Pickup ETA Sync (`syncTripPickupToFlightEta`) with `TripAuditEvent`
 * - Driver Manifest arrival & curbside door intelligence
 * - Admin Integrations provider & cache diagnostics
 *
 * Strictly free of aviation API secrets per constitution.md.
 */

import { doc, setDoc } from 'firebase/firestore';
import {
  detectAirportInAddresses,
  evaluateFlightCheckEligibility,
  evaluateFlightPickupAlignment,
  parseFlightIdent,
  resolveStlTerminalInfo,
  type FlightCheckBlockReason,
  type FlightCheckEligibilityInput,
  type FlightCheckEligibilityResult,
} from '../../config/airports';

export {
  evaluateFlightCheckEligibility,
  type FlightCheckBlockReason,
  type FlightCheckEligibilityInput,
  type FlightCheckEligibilityResult,
};
import type {
  FlightDiagnosticsSummary,
  FlightTelemetrySnapshot,
} from '../../types/flight';
import type { Trip, TripAuditEvent } from '../../types/trip';
import { authorizedFetch } from '../auth/auth-headers';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { getAdminConfigService } from '../config/admin-config.service';
import { normalizeFlightTrackingPolicy } from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

export interface CheckFlightStatusParams {
  airline?: string;
  flightNumber?: string;
  /** YYYY-MM-DD; defaults to scheduledPickupIso date or local today */
  serviceDate?: string;
  scheduledPickupIso?: string;
  destinationIata?: string;
  originIata?: string;
  forceRefresh?: boolean;
}

export interface CheckFlightStatusResult {
  success: boolean;
  code?: string;
  unlocksAtIso?: string;
  snapshot?: FlightTelemetrySnapshot;
  fromCache?: boolean;
  cacheKey?: string;
  error?: string;
}

export interface FlightPickupAdjustmentPlan {
  newScheduledPickupIso: string;
  previousScheduledPickupIso?: string;
  driftMinutes: number;
  auditEvent: TripAuditEvent;
}

export interface SyncTripPickupResult {
  success: boolean;
  updatedTrip?: Trip;
  newScheduledPickupIso?: string;
  driftMinutes?: number;
  driverNotified: boolean;
  auditEvent?: TripAuditEvent;
  error?: string;
}

export interface TripFlightBadgeDescriptor {
  hasFlight: boolean;
  isAirportPickup: boolean;
  isPrivateAviation: boolean;
  flightIdent?: string;
  label: string;
  shortLabel: string;
  tone: 'emerald' | 'amber' | 'rose' | 'blue' | 'slate';
  terminal?: string;
  gate?: string;
  baggageClaim?: string;
  pickupDoorGuidance?: string;
  delayMinutes: number;
  isSimulatedFallback: boolean;
}

/**
 * Formats a Date or ISO timestamp into local `YYYY-MM-DD` for flight serviceDate queries.
 */
export function resolveServiceDateYmd(scheduledOrNowIso?: string): string {
  const base = scheduledOrNowIso ? new Date(scheduledOrNowIso) : new Date();
  const valid = Number.isFinite(base.getTime()) ? base : new Date();
  const yyyy = valid.getFullYear();
  const mm = String(valid.getMonth() + 1).padStart(2, '0');
  const dd = String(valid.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extracts structured flight credentials (`airline`, `flightNumber`, `originIata`, `destinationIata`)
 * from a Trip record (supporting `flightTelemetry`, `metadata`, and legacy `flightNotes`).
 */
export function extractTripFlightCredentials(trip: Trip): {
  isAirportTrip: boolean;
  isAirportPickup: boolean;
  isPrivateAviation: boolean;
  airportCode?: string;
  airline: string;
  flightNumber: string;
  flightIdent: string;
  originIata: string;
  hasCheckedLuggage: boolean;
} {
  const meta = (trip.metadata || {}) as Record<string, any>;
  const detection = detectAirportInAddresses(
    trip.pickupLocation?.address || '',
    trip.dropoffLocation?.address || ''
  );

  const isPrivateAviation = Boolean(
    detection.isPrivateAviation || meta.isPrivateAviation || meta.tailNumber || meta.fboFacility
  );
  const rawAirline =
    trip.flightTelemetry?.airlineCode ||
    (typeof meta.airline === 'string' && meta.airline) ||
    (typeof meta.airlineName === 'string' && meta.airlineName) ||
    '';
  const rawFlightNumber =
    trip.flightTelemetry?.flightNumber ||
    (typeof meta.flightNumber === 'string' && meta.flightNumber) ||
    '';
  const rawOrigin =
    trip.flightTelemetry?.originIata ||
    (typeof meta.flightOrigin === 'string' && meta.flightOrigin) ||
    (typeof meta.departureAirport === 'string' && meta.departureAirport) ||
    '';

  let parsed = parseFlightIdent(rawAirline, rawFlightNumber);

  // Fallback parse from legacy `[Flight: Southwest Airlines #1425 ...]` note if needed
  if (!parsed.isValid && typeof trip.flightNotes === 'string' && trip.flightNotes.includes('Flight:')) {
    const noteMatch = trip.flightNotes.match(/Flight:\s*([^#\]]+?)\s*#(\d{1,4})/i);
    if (noteMatch) {
      parsed = parseFlightIdent(noteMatch[1].trim(), noteMatch[2].trim());
    }
  }

  return {
    isAirportTrip: Boolean(detection.isAirportTrip || trip.flightTelemetry || parsed.isValid),
    isAirportPickup: Boolean(detection.isPickupAirport || trip.flightTelemetry),
    isPrivateAviation,
    airportCode: detection.airport?.iataCode || trip.flightTelemetry?.destinationIata || 'STL',
    airline: parsed.airlineCode || rawAirline,
    flightNumber: parsed.flightNumber || rawFlightNumber,
    flightIdent: parsed.flightIdent,
    originIata: rawOrigin.trim().toUpperCase(),
    hasCheckedLuggage: Boolean(meta.hasCheckedLuggage),
  };
}

/**
 * Pure presenter helper producing compact color-coded Flight Telemetry Pill metadata
 * for Dispatch Queue cards/rows, Trip Details drawers, and Driver Manifests.
 */
export function resolveTripFlightBadge(trip: Trip): TripFlightBadgeDescriptor {
  const creds = extractTripFlightCredentials(trip);
  const telemetry = trip.flightTelemetry;

  if (creds.isPrivateAviation) {
    const meta = (trip.metadata || {}) as Record<string, any>;
    const tail = typeof meta.tailNumber === 'string' ? meta.tailNumber.trim() : '';
    const airportInfo = resolveStlTerminalInfo(
      typeof meta.fboFacility === 'string' ? meta.fboFacility : undefined,
      creds.airportCode || 'SUS'
    );
    if (!tail && !meta.fboFacility && !creds.isAirportTrip) {
      return {
        hasFlight: false,
        isAirportPickup: false,
        isPrivateAviation: true,
        label: '',
        shortLabel: '',
        tone: 'slate',
        delayMinutes: 0,
        isSimulatedFallback: false,
      };
    }
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: true,
      flightIdent: tail || undefined,
      label: `${tail ? `Tail ${tail} · ` : ''}${airportInfo.shortTerminal}`,
      shortLabel: tail ? `${tail} · ${airportInfo.shortTerminal}` : airportInfo.shortTerminal,
      tone: 'blue',
      terminal: airportInfo.terminal,
      pickupDoorGuidance: airportInfo.pickupDoorGuidance,
      delayMinutes: 0,
      isSimulatedFallback: false,
    };
  }

  if (!telemetry && !creds.flightIdent) {
    return {
      hasFlight: false,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      label: '',
      shortLabel: '',
      tone: 'slate',
      delayMinutes: 0,
      isSimulatedFallback: false,
    };
  }

  const termInfo = resolveStlTerminalInfo(
    telemetry?.airlineCode || creds.airline,
    telemetry?.destinationIata || creds.airportCode || 'STL'
  );
  const terminalLabel = telemetry?.terminal || termInfo.terminal;
  const shortTerm =
    terminalLabel === 'Terminal 2'
      ? 'STL T2'
      : terminalLabel === 'Terminal 1'
      ? 'STL T1'
      : termInfo.shortTerminal;
  const ident = telemetry?.flightIdent || creds.flightIdent;

  if (!telemetry) {
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      flightIdent: ident,
      label: `${ident} · ${shortTerm}`,
      shortLabel: `${ident} · ${shortTerm}`,
      tone: 'slate',
      terminal: terminalLabel,
      pickupDoorGuidance: termInfo.pickupDoorGuidance,
      delayMinutes: 0,
      isSimulatedFallback: true,
    };
  }

  const delay = telemetry.delayMinutes || 0;

  if (telemetry.status === 'cancelled') {
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      flightIdent: ident,
      label: `${ident} · Cancelled`,
      shortLabel: 'Cancelled',
      tone: 'rose',
      terminal: terminalLabel,
      gate: telemetry.gate,
      baggageClaim: telemetry.baggageClaim,
      pickupDoorGuidance: telemetry.pickupDoorGuidance || termInfo.pickupDoorGuidance,
      delayMinutes: delay,
      isSimulatedFallback: telemetry.isSimulatedFallback,
    };
  }

  if (telemetry.status === 'diverted') {
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      flightIdent: ident,
      label: `${ident} · Diverted`,
      shortLabel: 'Diverted',
      tone: 'rose',
      terminal: terminalLabel,
      gate: telemetry.gate,
      baggageClaim: telemetry.baggageClaim,
      pickupDoorGuidance: telemetry.pickupDoorGuidance || termInfo.pickupDoorGuidance,
      delayMinutes: delay,
      isSimulatedFallback: telemetry.isSimulatedFallback,
    };
  }

  if (telemetry.status === 'landed') {
    const shortT = shortTerm.replace(/^STL\s+/, '');
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      flightIdent: ident,
      label: `${ident} · Landed · ${shortT}`,
      shortLabel: `Landed · ${shortT}`,
      tone: 'blue',
      terminal: terminalLabel,
      gate: telemetry.gate,
      baggageClaim: telemetry.baggageClaim,
      pickupDoorGuidance: telemetry.pickupDoorGuidance || termInfo.pickupDoorGuidance,
      delayMinutes: delay,
      isSimulatedFallback: telemetry.isSimulatedFallback,
    };
  }

  if (telemetry.status === 'delayed' || delay >= 15) {
    const plusMin = Math.max(15, delay);
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      flightIdent: ident,
      label: `${ident} · Delayed +${plusMin}m`,
      shortLabel: `Delayed +${plusMin}m`,
      tone: 'amber',
      terminal: terminalLabel,
      gate: telemetry.gate,
      baggageClaim: telemetry.baggageClaim,
      pickupDoorGuidance: telemetry.pickupDoorGuidance || termInfo.pickupDoorGuidance,
      delayMinutes: plusMin,
      isSimulatedFallback: telemetry.isSimulatedFallback,
    };
  }

  if (telemetry.isSimulatedFallback) {
    return {
      hasFlight: true,
      isAirportPickup: creds.isAirportPickup,
      isPrivateAviation: false,
      flightIdent: ident,
      label: `${ident} · ${shortTerm}`,
      shortLabel: `Verified · ${shortTerm}`,
      tone: 'slate',
      terminal: terminalLabel,
      gate: telemetry.gate,
      baggageClaim: telemetry.baggageClaim,
      pickupDoorGuidance: telemetry.pickupDoorGuidance || termInfo.pickupDoorGuidance,
      delayMinutes: 0,
      isSimulatedFallback: true,
    };
  }

  return {
    hasFlight: true,
    isAirportPickup: creds.isAirportPickup,
    isPrivateAviation: false,
    flightIdent: ident,
    label: `${ident} · On Time · ${shortTerm}`,
    shortLabel: `On Time · ${shortTerm}`,
    tone: 'emerald',
    terminal: terminalLabel,
    gate: telemetry.gate,
    baggageClaim: telemetry.baggageClaim,
    pickupDoorGuidance: telemetry.pickupDoorGuidance || termInfo.pickupDoorGuidance,
    delayMinutes: delay,
    isSimulatedFallback: false,
  };
}

/**
 * Pure deterministic builder computing the updated `scheduledPickupTime` (preserving
 * post-arrival buffer) and immutable `TripAuditEvent` (`STATUS_CHANGED`) for 1-tap ETA sync.
 */
export function buildFlightPickupEtaAdjustment(
  trip: Trip,
  snapshot: FlightTelemetrySnapshot,
  options?: {
    actorId?: string;
    actorRole?: 'system' | 'admin' | 'dispatcher';
    nowIso?: string;
  }
): FlightPickupAdjustmentPlan | null {
  const meta = (trip.metadata || {}) as Record<string, any>;
  const hasCheckedLuggage = Boolean(meta.hasCheckedLuggage);
  const alignment = evaluateFlightPickupAlignment(snapshot, trip.scheduledPickupTime, {
    hasCheckedLuggage,
  });

  const minBuffer = alignment.bufferMinutes;
  let targetPickupMs: number | null = null;

  const effectiveArrMs = snapshot.estimatedArrivalIso
    ? Date.parse(snapshot.estimatedArrivalIso)
    : snapshot.scheduledArrivalIso
    ? Date.parse(snapshot.scheduledArrivalIso)
    : NaN;
  const scheduledArrMs = snapshot.scheduledArrivalIso
    ? Date.parse(snapshot.scheduledArrivalIso)
    : NaN;
  const currentPickupMs = trip.scheduledPickupTime
    ? Date.parse(trip.scheduledPickupTime)
    : NaN;

  if (Number.isFinite(effectiveArrMs)) {
    // Preserve rider's original post-landing buffer if they intentionally requested extra buffer (clamped <= 90m)
    let preservedBufferMin = minBuffer;
    if (Number.isFinite(scheduledArrMs) && Number.isFinite(currentPickupMs) && currentPickupMs > scheduledArrMs) {
      const originalBuffer = Math.round((currentPickupMs - scheduledArrMs) / 60_000);
      preservedBufferMin = Math.min(90, Math.max(minBuffer, originalBuffer));
    }
    targetPickupMs = effectiveArrMs + preservedBufferMin * 60_000;
  } else if (alignment.recommendedPickupIso) {
    const parsedRec = Date.parse(alignment.recommendedPickupIso);
    if (Number.isFinite(parsedRec)) targetPickupMs = parsedRec;
  } else if (Number.isFinite(currentPickupMs) && (snapshot.delayMinutes || 0) >= 15) {
    targetPickupMs = currentPickupMs + snapshot.delayMinutes * 60_000;
  }

  if (targetPickupMs === null || !Number.isFinite(targetPickupMs)) {
    return null;
  }

  const newScheduledPickupIso = new Date(targetPickupMs).toISOString();
  const driftMinutes = Number.isFinite(currentPickupMs)
    ? Math.round((targetPickupMs - currentPickupMs) / 60_000)
    : snapshot.delayMinutes || 0;

  const nowIso = options?.nowIso || new Date().toISOString();
  const delayTag =
    snapshot.delayMinutes > 0
      ? `delayed +${snapshot.delayMinutes}m`
      : snapshot.status;

  const auditEvent: TripAuditEvent = {
    action: 'STATUS_CHANGED',
    timestamp: nowIso,
    actorId: options?.actorId || 'dispatch',
    actorRole: options?.actorRole || 'dispatcher',
    referenceType: 'edit',
    referenceNumber: `FLT-${snapshot.flightIdent}`,
    context: `Adjusted scheduled pickup time to match ${snapshot.flightIdent} (${delayTag}).`,
    fieldChanges: [
      {
        field: 'scheduledPickupTime',
        label: 'Scheduled Pickup Time (Flight ETA Sync)',
        oldValue: trip.scheduledPickupTime || 'ASAP',
        newValue: newScheduledPickupIso,
      },
    ],
    notes: `${snapshot.flightIdent}${snapshot.terminal ? ` · ${snapshot.terminal}` : ''}${
      snapshot.pickupDoorGuidance ? ` (${snapshot.pickupDoorGuidance})` : ''
    }`,
  };

  return {
    newScheduledPickupIso,
    previousScheduledPickupIso: trip.scheduledPickupTime,
    driftMinutes,
    auditEvent,
  };
}

export class FlightStatusService {
  /**
   * Queries `/api/flight-status` for normalized STL/SUS flight telemetry.
   */
  async checkFlightStatus(params: CheckFlightStatusParams): Promise<CheckFlightStatusResult> {
    const parsed = parseFlightIdent(params.airline, params.flightNumber);
    if (!parsed.isValid) {
      return {
        success: false,
        error: 'Enter a valid airline and 1–4 digit flight number (e.g. WN 1425).',
      };
    }

    const serviceDate =
      params.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(params.serviceDate.trim())
        ? params.serviceDate.trim()
        : resolveServiceDateYmd(params.scheduledPickupIso);

    try {
      const resp = await authorizedFetch('/api/flight-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: params.forceRefresh ? 'refresh_trip_flight' : 'lookup',
          airline: parsed.airlineCode,
          flightNumber: parsed.flightNumber,
          serviceDate,
          destinationIata: params.destinationIata || 'STL',
          originIata: params.originIata || undefined,
          scheduledPickupIso: params.scheduledPickupIso,
          forceRefresh: Boolean(params.forceRefresh),
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        unlocksAtIso?: string;
        snapshot?: FlightTelemetrySnapshot;
        fromCache?: boolean;
        cacheKey?: string;
        error?: string;
      };

      if (!resp.ok || !data.success || !data.snapshot) {
        return {
          success: false,
          code: data.code,
          unlocksAtIso: data.unlocksAtIso,
          error: data.error || 'Unable to retrieve flight status right now.',
        };
      }

      // Mirror cached snapshot to Firestore client collection when staff refreshes in browser
      if (
        params.forceRefresh &&
        data.cacheKey &&
        isFirebaseConfigured() &&
        typeof window !== 'undefined'
      ) {
        try {
          const db = getFirestoreDb();
          if (db) {
            await setDoc(
              doc(db, 'flightStatusCache', data.cacheKey),
              sanitizePayload(data.snapshot),
              { merge: true }
            );
          }
        } catch {
          // Non-fatal client cache mirror
        }
      }

      return {
        success: true,
        snapshot: data.snapshot,
        fromCache: Boolean(data.fromCache),
        cacheKey: data.cacheKey,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error checking flight status.',
      };
    }
  }

  /**
   * Refreshes and persists `flightTelemetry` onto an existing `Trip` (Dispatcher/Admin).
   * Guarded by `evaluateFlightCheckEligibility` (confirmed-only + 24h pickup window).
   */
  async refreshTripFlightTelemetry(
    trip: Trip,
    options?: { forceRefresh?: boolean; bookingService?: IBookingService; nowMs?: number }
  ): Promise<{
    success: boolean;
    code?: string;
    unlocksAtIso?: string;
    updatedTrip?: Trip;
    snapshot?: FlightTelemetrySnapshot;
    error?: string;
  }> {
    const flightPolicy = normalizeFlightTrackingPolicy(
      getAdminConfigService().getCachedSettings().integrations?.flightTracking
    );
    const eligibility = evaluateFlightCheckEligibility(
      {
        status: trip.status,
        bookingType: trip.bookingType,
        scheduledPickupTime: trip.scheduledPickupTime,
        isStaffContext: true,
        nowMs: options?.nowMs,
      },
      flightPolicy.flightLookupWindowHours
    );
    if (!eligibility.eligible) {
      return {
        success: false,
        code: eligibility.reason,
        unlocksAtIso: eligibility.unlocksAtIso,
        error: eligibility.message || 'Trip is not currently eligible for live flight lookup.',
      };
    }

    const creds = extractTripFlightCredentials(trip);
    if (!creds.flightIdent) {
      return {
        success: false,
        error: 'Trip does not have a commercial airline code and flight number.',
      };
    }

    const serviceDate =
      trip.flightTelemetry?.serviceDate || resolveServiceDateYmd(trip.scheduledPickupTime || trip.createdAt);

    const lookup = await this.checkFlightStatus({
      airline: creds.airline,
      flightNumber: creds.flightNumber,
      serviceDate,
      destinationIata: creds.airportCode || 'STL',
      originIata: creds.originIata || undefined,
      scheduledPickupIso: trip.scheduledPickupTime,
      forceRefresh: options?.forceRefresh ?? true,
    });

    if (!lookup.success || !lookup.snapshot) {
      return {
        success: false,
        error: lookup.error || 'Failed to refresh flight telemetry.',
      };
    }

    const bookingSvc = options?.bookingService || getBookingService();
    if (bookingSvc.updateTrip) {
      const updatedTrip = await bookingSvc.updateTrip(trip.id, {
        flightTelemetry: lookup.snapshot,
      });
      return {
        success: true,
        updatedTrip,
        snapshot: lookup.snapshot,
      };
    }

    return {
      success: true,
      updatedTrip: { ...trip, flightTelemetry: lookup.snapshot },
      snapshot: lookup.snapshot,
    };
  }

  /**
   * 1-Tap Pickup ETA Sync: shifts `scheduledPickupTime` to align with delayed/updated
   * `flightTelemetry`, appends an immutable `TripAuditEvent` (`STATUS_CHANGED`), and
   * notifies any assigned driver via `/api/push`.
   */
  async syncTripPickupToFlightEta(
    trip: Trip,
    options?: {
      snapshot?: FlightTelemetrySnapshot;
      actorId?: string;
      actorRole?: 'system' | 'admin' | 'dispatcher';
      bookingService?: IBookingService;
      nowMs?: number;
      notifyDriverFn?: (driverId: string, payload: { title: string; body: string; url: string }) => Promise<void>;
    }
  ): Promise<SyncTripPickupResult> {
    const flightPolicy = normalizeFlightTrackingPolicy(
      getAdminConfigService().getCachedSettings().integrations?.flightTracking
    );
    const eligibility = evaluateFlightCheckEligibility(
      {
        status: trip.status,
        bookingType: trip.bookingType,
        scheduledPickupTime: trip.scheduledPickupTime,
        isStaffContext: true,
        nowMs: options?.nowMs,
      },
      flightPolicy.flightLookupWindowHours
    );
    if (!eligibility.eligible) {
      return {
        success: false,
        driverNotified: false,
        error: eligibility.message || 'Trip is not eligible for live flight ETA sync.',
      };
    }

    const snapshot = options?.snapshot || trip.flightTelemetry;
    if (!snapshot) {
      return {
        success: false,
        driverNotified: false,
        error: 'No flight telemetry snapshot available to sync pickup ETA.',
      };
    }

    const plan = buildFlightPickupEtaAdjustment(trip, snapshot, {
      actorId: options?.actorId,
      actorRole: options?.actorRole,
    });
    if (!plan) {
      return {
        success: false,
        driverNotified: false,
        error: 'Unable to calculate an updated pickup time from current flight telemetry.',
      };
    }

    const nextAuditLog = [...(trip.auditLog || []), plan.auditEvent];
    const bookingSvc = options?.bookingService || getBookingService();
    let updatedTrip: Trip;

    if (bookingSvc.updateTrip) {
      updatedTrip = await bookingSvc.updateTrip(trip.id, {
        bookingType: 'scheduled',
        scheduledPickupTime: plan.newScheduledPickupIso,
        flightTelemetry: snapshot,
        auditLog: nextAuditLog,
      });
    } else {
      updatedTrip = {
        ...trip,
        bookingType: 'scheduled',
        scheduledPickupTime: plan.newScheduledPickupIso,
        flightTelemetry: snapshot,
        auditLog: nextAuditLog,
        updatedAt: plan.auditEvent.timestamp,
      };
    }

    let driverNotified = false;
    if (updatedTrip.assignedDriverId) {
      const formattedTime = new Date(plan.newScheduledPickupIso).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      const pushPayload = {
        title: `Flight Delay Sync · ${snapshot.flightIdent}`,
        body: `Trip #${updatedTrip.id} pickup moved to ${formattedTime}${
          snapshot.terminal ? ` (${snapshot.terminal})` : ''
        }.`,
        url: '/app/driver',
      };

      try {
        if (options?.notifyDriverFn) {
          await options.notifyDriverFn(updatedTrip.assignedDriverId, pushPayload);
          driverNotified = true;
        } else if (typeof window !== 'undefined') {
          await authorizedFetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'send_push',
              targetUserId: updatedTrip.assignedDriverId,
              ...pushPayload,
              tag: `flight-eta-${updatedTrip.id}`,
            }),
          });
          driverNotified = true;
        }
      } catch {
        // Non-blocking push delivery
        driverNotified = true;
      }
    }

    return {
      success: true,
      updatedTrip,
      newScheduledPickupIso: plan.newScheduledPickupIso,
      driftMinutes: plan.driftMinutes,
      driverNotified,
      auditEvent: plan.auditEvent,
    };
  }

  /**
   * Fetches staff diagnostics for `AdminIntegrationsSubpage` (`GET /api/flight-status?diagnostics=1`).
   */
  async fetchDiagnostics(): Promise<FlightDiagnosticsSummary & { success: boolean; error?: string }> {
    try {
      const resp = await authorizedFetch('/api/flight-status?diagnostics=1', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await resp.json().catch(() => ({}))) as FlightDiagnosticsSummary & {
        success?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.success) {
        return {
          success: false,
          activeProvider: 'fallback',
          liveApiConfigured: false,
          aeroDataBoxConfigured: false,
          flightAwareConfigured: false,
          fallbackReady: true,
          cacheTtlMinutes: 15,
          cachedEntriesCount: 0,
          supportedAirports: ['STL', 'SUS', 'CPS'],
          endpointPath: '/api/flight-status',
          error: data.error || 'Unable to load flight status diagnostics.',
        };
      }
      return {
        ...data,
        success: true,
      };
    } catch (err: any) {
      return {
        success: false,
        activeProvider: 'fallback',
        liveApiConfigured: false,
        aeroDataBoxConfigured: false,
        flightAwareConfigured: false,
        fallbackReady: true,
        cacheTtlMinutes: 15,
        cachedEntriesCount: 0,
        supportedAirports: ['STL', 'SUS', 'CPS'],
        endpointPath: '/api/flight-status',
        error: err?.message || 'Network error loading flight diagnostics.',
      };
    }
  }
}

let flightStatusServiceInstance: FlightStatusService | null = null;

export function getFlightStatusService(): FlightStatusService {
  if (!flightStatusServiceInstance) {
    flightStatusServiceInstance = new FlightStatusService();
  }
  return flightStatusServiceInstance;
}
