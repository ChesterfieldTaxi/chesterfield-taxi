/**
 * Pure Auto-Dispatch Candidate Ranking & Sequential Offer Cascade Service (Phase 35)
 *
 * Responsibilities:
 * 1. `rankAutoDispatchCandidates(trip, drivers, zones, config, options)`:
 *    - Excludes off-duty/break, busy/en-route/conflicting, blacklisted/archived drivers,
 *      grounded/blacklisted fleet vehicles, and drivers in `rejectedByIds` / `attemptedDriverIds`.
 *    - Enforces passenger count, luggage capacity, wheelchair WAV, and SUV/Van upgrade rules.
 *    - Deterministically sorts eligible drivers via `nearest_in_zone`, `longest_idle_in_zone`,
 *      or `highest_driver_score`.
 * 2. Sequential single-target cascade lifecycle (`startOfferCascade`, `advanceOrExpireOfferCascade`,
 *    `cancelOfferCascade`):
 *    - Sets `status: 'offered'` and `offeredToIds: [activeOfferedDriverId]` (1 active target per step)
 *      for seamless compatibility with `acceptDriverOffer` / `declineDriverOffer` and `firestore.rules`.
 *    - Rolls over to the next ranked candidate on decline or timeout up to `maxCascadeAttempts`.
 *    - Cleanly transitions to `offerCascade.state = 'exhausted'` and reverts `status` to `'CONFIRMED'`
 *      (or `'pending'`) when exhausted.
 *
 * Zero React or browser DOM dependencies per `constitution.md`.
 */

import { detectAirportInAddresses } from '../../config/airports';
import {
  DEFAULT_DISPATCH_AUTOMATION_CONFIG,
  normalizeDispatchAutomationConfig,
  type DispatchAutomationConfig,
  type DispatchRankingStrategy,
  type FleetCarConfig,
  type VehicleTierConfig,
} from '../../types/config';
import type { DriverDutyStatus, LiveDriverMapStatus } from '../../types/driver';
import type { PhysicalFleetAsset } from '../../types/fleet';
import type {
  DriverTelemetryPing,
  GeoPoint,
  Trip,
  TripAuditEvent,
  TripOfferCascade,
  TripStatus,
  TripStatusHistoryEntry,
} from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import { authorizedFetch } from '../auth/auth-headers';
import { getBookingService } from '../booking';
import type { IBookingService } from '../booking-service';
import { formatDriverOfferNotificationPayload } from '../notifications/push-notification.service';
import {
  DEFAULT_ZONES,
  calculateHaversineDistanceMiles,
  isCoordinateInZone,
} from '../zones/zone.service';

export interface AutoDispatchDriverInput {
  id: string;
  name: string;
  cabNumber?: string;
  vehicleUnit?: string;
  vehicle?: string;
  vehicleId?: string;
  vehicleTier?: string;
  tier?: string;
  dutyStatus?: DriverDutyStatus;
  mapStatus?: LiveDriverMapStatus;
  status?: 'available' | 'on_trip' | 'break' | 'offline' | string;
  currentTripId?: string | null;
  activeTrip?: Partial<Trip> | null;
  zone?: string;
  phone?: string;
  driverScore?: number;
  isBlacklisted?: boolean;
  isArchived?: boolean;
  currentLocation?: DriverTelemetryPing | null;
  telemetry?: DriverTelemetryPing | null;
  coordinates?: GeoPoint | null;
  lastActiveAt?: string;
  locationUpdatedAt?: string;
  idleSince?: string;
  lastCompletedTripAt?: string;
  formattedLabel?: string;
  /** Optional inline vehicle health overrides for test/lightweight callers */
  vehicleStatus?: FleetCarConfig['status'] | PhysicalFleetAsset['status'];
  isVehicleGrounded?: boolean;
  isVehicleBlacklisted?: boolean;
}

export interface RankCandidatesOptions {
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  activeTrips?: ReadonlyArray<Partial<Trip>>;
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>;
  nowMs?: number;
  /** Scheduled pickup conflict window in minutes (default 45) */
  conflictWindowMinutes?: number;
}

export interface RankedDispatchCandidate {
  driverId: string;
  driverName: string;
  driverLabel: string;
  cabNumber?: string;
  vehicleUnit: string;
  vehicleTier: string;
  inPickupZone: boolean;
  matchedZoneIds: string[];
  distanceMiles: number | null;
  idleDurationMs: number;
  driverScore: number;
  strategy: DispatchRankingStrategy;
  rankReason: string;
}

export type PushOfferSender = (
  targetDriverId: string,
  trip: Trip
) => Promise<void> | void;

export interface StartOfferCascadeParams {
  trip: Trip;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  zones?: ReadonlyArray<ZoneGeofence>;
  config?: Partial<DispatchAutomationConfig> | null;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  activeTrips?: ReadonlyArray<Partial<Trip>>;
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  actorId?: string;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export interface AdvanceOfferCascadeParams {
  trip: Trip;
  drivers: ReadonlyArray<AutoDispatchDriverInput>;
  zones?: ReadonlyArray<ZoneGeofence>;
  config?: Partial<DispatchAutomationConfig> | null;
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>;
  activeTrips?: ReadonlyArray<Partial<Trip>>;
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>;
  bookingService?: IBookingService;
  sendPush?: PushOfferSender | false;
  nowMs?: number;
}

export interface CancelOfferCascadeParams {
  trip: Trip;
  reason?: string;
  actorRole?: 'dispatcher' | 'admin' | 'system';
  actorId?: string;
  bookingService?: IBookingService;
  nowMs?: number;
}

export interface OfferCascadeStepResult {
  outcome: 'offered' | 'advanced' | 'accepted' | 'exhausted' | 'cancelled' | 'waiting' | 'noop';
  trip: Trip;
  candidate: RankedDispatchCandidate | null;
  candidates: RankedDispatchCandidate[];
  reason?: string;
}

type CanonicalVehicleCategory = 'standard' | 'premium' | 'xl' | 'van' | 'wheelchair';

interface ResolvedVehicleCapacity {
  category: CanonicalVehicleCategory;
  maxPassengers: number;
  maxLuggage: number;
}

function isValidGeoPoint(pt?: GeoPoint | null): pt is GeoPoint {
  return Boolean(
    pt &&
      typeof pt.lat === 'number' &&
      typeof pt.lng === 'number' &&
      Number.isFinite(pt.lat) &&
      Number.isFinite(pt.lng) &&
      (pt.lat !== 0 || pt.lng !== 0)
  );
}

function extractUnitDigits(raw?: string | null): string {
  if (!raw) return '';
  const match = String(raw).match(/#?(\d+)/);
  return match ? match[1] : '';
}

function formatCandidateLabel(drv: AutoDispatchDriverInput): string {
  if (drv.formattedLabel?.trim()) return drv.formattedLabel.trim();
  const unitDigits = extractUnitDigits(drv.cabNumber || drv.vehicleUnit || drv.vehicle);
  if (unitDigits) {
    return `Car #${unitDigits} (${drv.name})`;
  }
  if (drv.vehicleUnit?.trim()) {
    return `${drv.vehicleUnit.trim()} (${drv.name})`;
  }
  return drv.name;
}

function classifyVehicleCategory(rawTier: string): CanonicalVehicleCategory {
  const norm = rawTier.trim().toLowerCase();
  if (norm === 'wheelchair' || norm === 'wheelchair_wav' || norm === 'wav') {
    return 'wheelchair';
  }
  if (norm === 'van' || norm === 'minivan' || norm === 'passenger_van') {
    return 'van';
  }
  if (norm === 'xl' || norm === 'suv' || norm.includes('suv') || norm.includes('suburban')) {
    return 'xl';
  }
  if (norm === 'premium' || norm === 'executive' || norm === 'luxury') {
    return 'premium';
  }
  return 'standard';
}

function resolveDriverVehicleCapacity(
  rawTier: string,
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>
): ResolvedVehicleCapacity {
  const norm = (rawTier || 'standard').trim().toLowerCase();
  const category = classifyVehicleCategory(norm);

  const canonicalDefaults: Record<CanonicalVehicleCategory, { maxPassengers: number; maxLuggage: number }> = {
    standard: { maxPassengers: 4, maxLuggage: 3 },
    premium: { maxPassengers: 4, maxLuggage: 3 },
    xl: { maxPassengers: 6, maxLuggage: 5 },
    van: { maxPassengers: 7, maxLuggage: 6 },
    wheelchair: { maxPassengers: 4, maxLuggage: 3 },
  };

  if (vehicleTiers && vehicleTiers.length > 0) {
    const matchedConfig =
      vehicleTiers.find((vt) => !vt.isArchived && vt.id.trim().toLowerCase() === norm) ||
      vehicleTiers.find(
        (vt) => !vt.isArchived && classifyVehicleCategory(vt.id) === category
      );

    if (matchedConfig) {
      return {
        category,
        maxPassengers: Math.max(
          canonicalDefaults[category].maxPassengers,
          Number(matchedConfig.maxPassengers || 0)
        ),
        maxLuggage: Math.max(
          canonicalDefaults[category].maxLuggage,
          Number(matchedConfig.maxLuggage || 0)
        ),
      };
    }
  }

  return {
    category,
    ...canonicalDefaults[category],
  };
}

function isDriverVehicleCompatibleWithTrip(
  trip: Partial<Trip>,
  driverTierRaw: string,
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>
): boolean {
  const driverCap = resolveDriverVehicleCapacity(driverTierRaw, vehicleTiers);
  const requiredPax = Math.max(1, Number(trip.passenger?.passengerCount || 1));
  const requiredBags = Math.max(0, Number(trip.passenger?.luggageCount || 0));

  if (driverCap.maxPassengers < requiredPax || driverCap.maxLuggage < requiredBags) {
    return false;
  }

  const meta = (trip.metadata || {}) as Record<string, any>;
  const requestedRaw = String(meta.vehicleTypeId || trip.vehicleTier || 'standard')
    .trim()
    .toLowerCase();

  const csb = (meta.carSeatsBreakdown || {}) as {
    rearFacing?: number;
    frontFacing?: number;
    booster?: number;
    total?: number;
  };
  const carSeatCount = Number(
    csb.total ?? (csb.rearFacing || 0) + (csb.frontFacing || 0) + (csb.booster || 0)
  );
  const hasOversizedUpgrade = Boolean(meta.hasOversizedLuggage || meta.requiresVehicleUpgrade);
  const requiresSuvOrVan =
    requiredPax > 4 || requiredBags > 3 || hasOversizedUpgrade || carSeatCount >= 2;
  const requiresWheelchair =
    requestedRaw === 'wheelchair' ||
    requestedRaw === 'wheelchair_wav' ||
    Boolean(meta.wheelchairRequired);

  if (requiresWheelchair) {
    return driverCap.category === 'wheelchair';
  }

  if (driverCap.category === 'wheelchair' && requestedRaw !== 'any') {
    return false;
  }

  if (requestedRaw === 'van' || requestedRaw === 'minivan') {
    return driverCap.category === 'van';
  }

  if (requestedRaw === 'xl' || requestedRaw === 'suv' || requiresSuvOrVan) {
    return driverCap.category === 'xl' || driverCap.category === 'van';
  }

  if (requestedRaw === 'premium' || requestedRaw === 'executive') {
    return driverCap.category === 'premium';
  }

  // Standard / Sedan / Any request: any non-WAV active tier with sufficient capacity qualifies
  return true;
}

function findDriverFleetVehicle(
  drv: AutoDispatchDriverInput,
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>
): (FleetCarConfig | PhysicalFleetAsset) | undefined {
  if (!fleetVehicles || fleetVehicles.length === 0) return undefined;

  if (drv.vehicleId) {
    const byId = fleetVehicles.find((v) => v.id === drv.vehicleId);
    if (byId) return byId;
  }

  const byAssignedDriver = fleetVehicles.find((v) => v.assignedDriverId === drv.id);
  if (byAssignedDriver) return byAssignedDriver;

  const drvDigits = extractUnitDigits(drv.cabNumber || drv.vehicleUnit || drv.vehicle);
  if (drvDigits) {
    return fleetVehicles.find((v) => extractUnitDigits(v.unitNumber) === drvDigits);
  }

  return undefined;
}

function hasConflictingActiveTrip(
  driverId: string,
  targetTrip: Partial<Trip>,
  activeTrips: ReadonlyArray<Partial<Trip>> | undefined,
  nowMs: number,
  conflictWindowMinutes: number
): boolean {
  if (!activeTrips || activeTrips.length === 0) return false;

  const targetPickupMs = targetTrip.scheduledPickupTime
    ? Date.parse(targetTrip.scheduledPickupTime)
    : nowMs;
  const conflictMs = Math.max(15, conflictWindowMinutes) * 60_000;

  for (const other of activeTrips) {
    if (!other || other.id === targetTrip.id) continue;
    const status = String(other.status || '');
    if (['completed', 'cancelled', 'DECLINED', 'declined'].includes(status)) continue;

    // Driver already holding an active offer on a different trip
    if (
      status === 'offered' &&
      Array.isArray(other.offeredToIds) &&
      other.offeredToIds.includes(driverId)
    ) {
      return true;
    }

    if (other.assignedDriverId !== driverId) continue;

    // Actively executing a live trip right now
    if (status === 'en_route' || status === 'arrived' || status === 'in_progress') {
      return true;
    }

    // Scheduled / ASAP overlap check for assigned/accepted trips
    if (status === 'assigned' || status === 'accepted') {
      if (targetTrip.bookingType === 'asap' && other.bookingType === 'asap') {
        return true;
      }
      const otherPickupMs = other.scheduledPickupTime
        ? Date.parse(other.scheduledPickupTime)
        : nowMs;
      if (
        Number.isFinite(targetPickupMs) &&
        Number.isFinite(otherPickupMs) &&
        Math.abs(targetPickupMs - otherPickupMs) <= conflictMs
      ) {
        return true;
      }
    }
  }

  return false;
}

function resolveLastCompletedMsFromTrips(
  driverId: string,
  trips?: ReadonlyArray<Partial<Trip>>
): number | null {
  if (!trips || trips.length === 0) return null;
  let latestMs: number | null = null;
  for (const t of trips) {
    if (t.assignedDriverId !== driverId || t.status !== 'completed') continue;
    const rawTs = t.completedAt || t.updatedAt;
    if (!rawTs) continue;
    const ms = Date.parse(rawTs);
    if (Number.isFinite(ms) && (latestMs === null || ms > latestMs)) {
      latestMs = ms;
    }
  }
  return latestMs;
}

function resolvePostExhaustionFallbackStatus(trip: Partial<Trip>): TripStatus {
  if (trip.bookingType === 'scheduled') {
    return 'CONFIRMED';
  }
  const history = Array.isArray(trip.statusHistory) ? trip.statusHistory : [];
  for (let i = history.length - 1; i >= 0; i--) {
    const prev = history[i]?.from;
    if (prev === 'CONFIRMED' || prev === 'confirmed') return 'CONFIRMED';
    if (prev === 'pending') return 'pending';
  }
  return 'CONFIRMED';
}

async function defaultTriggerServerPush(targetDriverId: string, trip: Trip): Promise<void> {
  if (typeof window === 'undefined' || !targetDriverId) return;
  try {
    const formatted = formatDriverOfferNotificationPayload(trip);
    await authorizedFetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_push',
        targetUid: targetDriverId,
        notification: {
          title: formatted.title,
          body: formatted.body,
          url: formatted.url,
          tag: formatted.tag,
          requireInteraction: true,
        },
      }),
    });
  } catch {
    // Non-fatal: active Driver PWA clients also receive offers via Firestore real-time snapshot
  }
}

/**
 * Pure deterministic candidate ranking engine.
 */
export function rankAutoDispatchCandidates(
  trip: Partial<Trip>,
  drivers: ReadonlyArray<AutoDispatchDriverInput>,
  zones?: ReadonlyArray<ZoneGeofence> | null,
  config?: Partial<DispatchAutomationConfig> | null,
  options?: RankCandidatesOptions
): RankedDispatchCandidate[] {
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const nowMs = options?.nowMs ?? Date.now();
  const conflictWindowMinutes = options?.conflictWindowMinutes ?? 45;

  const activeZones = (zones && zones.length > 0 ? zones : DEFAULT_ZONES).filter(
    (z) => z.isActive && !z.isArchived && !z.isBlacklisted
  );

  const rejectedSet = new Set<string>(trip.rejectedByIds || []);
  const attemptedSet = new Set<string>(trip.offerCascade?.attemptedDriverIds || []);

  // Resolve pickup zone containment
  const pickupCoord = isValidGeoPoint(trip.pickupLocation?.coordinates)
    ? trip.pickupLocation!.coordinates!
    : null;
  const pickupZoneIds = new Set<string>();
  const pickupZoneNamesLower: string[] = [];

  if (pickupCoord) {
    for (const zone of activeZones) {
      if (isCoordinateInZone(pickupCoord, zone)) {
        pickupZoneIds.add(zone.id);
        pickupZoneNamesLower.push(zone.name.toLowerCase());
      }
    }
  }

  const airportCheck = detectAirportInAddresses(
    trip.pickupLocation?.address || '',
    trip.dropoffLocation?.address || ''
  );
  if (airportCheck.isPickupAirport && airportCheck.airport) {
    const airportZoneId =
      airportCheck.airport.iataCode === 'SUS' ? 'zone-spirit-airport' : 'zone-lambert-airport';
    pickupZoneIds.add(airportZoneId);
    const matchingAirportZone = activeZones.find((z) => z.id === airportZoneId);
    if (matchingAirportZone) {
      pickupZoneNamesLower.push(matchingAirportZone.name.toLowerCase());
    }
  }

  const candidates: RankedDispatchCandidate[] = [];

  for (const drv of drivers) {
    if (!drv || !drv.id) continue;

    // 1. Exclude blacklisted / archived / suspended drivers
    if (drv.isBlacklisted || drv.isArchived || drv.zone === 'Suspended') {
      continue;
    }

    // 2. Exclude off-duty or on-break drivers
    const resolvedDuty: DriverDutyStatus =
      drv.dutyStatus ||
      (drv.mapStatus === 'offline' || drv.status === 'offline'
        ? 'off_duty'
        : drv.mapStatus === 'break' || drv.status === 'break'
        ? 'on_break'
        : 'on_duty');

    if (
      resolvedDuty !== 'on_duty' ||
      drv.mapStatus === 'offline' ||
      drv.mapStatus === 'break' ||
      drv.status === 'offline' ||
      drv.status === 'break'
    ) {
      continue;
    }

    // 3. Exclude busy / en-route drivers or conflicting active trips
    if (
      drv.mapStatus === 'busy' ||
      drv.mapStatus === 'en_route' ||
      drv.status === 'on_trip' ||
      Boolean(drv.activeTrip) ||
      Boolean(drv.currentTripId)
    ) {
      continue;
    }

    if (
      hasConflictingActiveTrip(
        drv.id,
        trip,
        options?.activeTrips,
        nowMs,
        conflictWindowMinutes
      )
    ) {
      continue;
    }

    // 4. Exclude already rejected or already attempted drivers
    if (rejectedSet.has(drv.id) || attemptedSet.has(drv.id)) {
      continue;
    }

    // 5. Exclude grounded / blacklisted / non-active fleet vehicles
    if (
      drv.isVehicleGrounded ||
      drv.isVehicleBlacklisted ||
      (drv.vehicleStatus && drv.vehicleStatus !== 'active')
    ) {
      continue;
    }

    const matchedFleetVeh = findDriverFleetVehicle(drv, options?.fleetVehicles);
    if (matchedFleetVeh) {
      const groundedReason = (matchedFleetVeh as FleetCarConfig).groundedReason;
      if (
        matchedFleetVeh.status !== 'active' ||
        matchedFleetVeh.isBlacklisted ||
        matchedFleetVeh.isArchived ||
        Boolean(groundedReason)
      ) {
        continue;
      }
    }

    // 6. Enforce vehicle capacity & tier compatibility
    const effectiveDriverTier =
      drv.vehicleTier || drv.tier || matchedFleetVeh?.vehicleTypeId || 'standard';
    if (!isDriverVehicleCompatibleWithTrip(trip, effectiveDriverTier, options?.vehicleTiers)) {
      continue;
    }

    // 7. Compute spatial metrics, idle duration, and driver score
    const driverCoord = isValidGeoPoint(drv.currentLocation?.coordinates)
      ? drv.currentLocation!.coordinates
      : isValidGeoPoint(drv.telemetry?.coordinates)
      ? drv.telemetry!.coordinates
      : isValidGeoPoint(drv.coordinates)
      ? drv.coordinates
      : null;

    const distanceMiles =
      pickupCoord && driverCoord
        ? Number(calculateHaversineDistanceMiles(pickupCoord, driverCoord).toFixed(3))
        : null;

    const matchedZoneIds: string[] = [];
    if (driverCoord) {
      for (const zone of activeZones) {
        if (isCoordinateInZone(driverCoord, zone)) {
          matchedZoneIds.push(zone.id);
        }
      }
    }

    let inPickupZone = false;
    if (pickupZoneIds.size > 0) {
      inPickupZone = matchedZoneIds.some((zId) => pickupZoneIds.has(zId));
      if (!inPickupZone && !driverCoord && drv.zone) {
        const drvZoneLower = drv.zone.trim().toLowerCase();
        inPickupZone =
          pickupZoneIds.has(drvZoneLower) ||
          pickupZoneNamesLower.some(
            (zName) => zName.includes(drvZoneLower) || drvZoneLower.includes(zName)
          );
      }
    }

    const rawIdleRef = drv.idleSince || drv.lastCompletedTripAt || drv.lastActiveAt || drv.locationUpdatedAt;
    let idleDurationMs = 0;
    if (rawIdleRef) {
      const parsedIdleMs = Date.parse(rawIdleRef);
      if (Number.isFinite(parsedIdleMs)) {
        idleDurationMs = Math.max(0, nowMs - parsedIdleMs);
      }
    } else {
      const completedMs = resolveLastCompletedMsFromTrips(drv.id, options?.activeTrips);
      if (completedMs !== null) {
        idleDurationMs = Math.max(0, nowMs - completedMs);
      }
    }

    const driverScore =
      typeof drv.driverScore === 'number' && Number.isFinite(drv.driverScore)
        ? drv.driverScore
        : 80;

    const unitDigits = extractUnitDigits(
      drv.cabNumber || drv.vehicleUnit || matchedFleetVeh?.unitNumber || drv.vehicle
    );
    const vehicleUnit = unitDigits
      ? `Car #${unitDigits}`
      : drv.vehicleUnit || matchedFleetVeh?.unitNumber || drv.vehicle || 'Unit';

    const distStr = distanceMiles !== null ? `${distanceMiles.toFixed(1)} mi` : 'no GPS';
    const idleMins = Math.round(idleDurationMs / 60_000);
    const rankReason =
      cfg.rankingStrategy === 'nearest_in_zone'
        ? `${inPickupZone ? 'In pickup zone' : 'Outside pickup zone'} · ${distStr} · Score ${driverScore}`
        : cfg.rankingStrategy === 'longest_idle_in_zone'
        ? `${inPickupZone ? 'In pickup zone' : 'Outside pickup zone'} · Idle ${idleMins}m · ${distStr}`
        : `Score ${driverScore} · ${inPickupZone ? 'In pickup zone' : 'Outside pickup zone'} · ${distStr}`;

    candidates.push({
      driverId: drv.id,
      driverName: drv.name,
      driverLabel: formatCandidateLabel(drv),
      cabNumber: unitDigits || drv.cabNumber,
      vehicleUnit,
      vehicleTier: effectiveDriverTier,
      inPickupZone,
      matchedZoneIds,
      distanceMiles,
      idleDurationMs,
      driverScore,
      strategy: cfg.rankingStrategy,
      rankReason,
    });
  }

  const compareDistance = (a: RankedDispatchCandidate, b: RankedDispatchCandidate): number => {
    const distA = a.distanceMiles ?? Number.POSITIVE_INFINITY;
    const distB = b.distanceMiles ?? Number.POSITIVE_INFINITY;
    if (distA !== distB) return distA - distB;
    return 0;
  };

  candidates.sort((a, b) => {
    if (cfg.rankingStrategy === 'nearest_in_zone') {
      if (a.inPickupZone !== b.inPickupZone) return a.inPickupZone ? -1 : 1;
      const distCmp = compareDistance(a, b);
      if (distCmp !== 0) return distCmp;
      if (a.driverScore !== b.driverScore) return b.driverScore - a.driverScore;
      return a.driverId.localeCompare(b.driverId);
    }

    if (cfg.rankingStrategy === 'longest_idle_in_zone') {
      if (a.inPickupZone !== b.inPickupZone) return a.inPickupZone ? -1 : 1;
      if (a.idleDurationMs !== b.idleDurationMs) return b.idleDurationMs - a.idleDurationMs;
      const distCmp = compareDistance(a, b);
      if (distCmp !== 0) return distCmp;
      if (a.driverScore !== b.driverScore) return b.driverScore - a.driverScore;
      return a.driverId.localeCompare(b.driverId);
    }

    // 'highest_driver_score'
    if (a.driverScore !== b.driverScore) return b.driverScore - a.driverScore;
    if (a.inPickupZone !== b.inPickupZone) return a.inPickupZone ? -1 : 1;
    const distCmp = compareDistance(a, b);
    if (distCmp !== 0) return distCmp;
    return a.driverId.localeCompare(b.driverId);
  });

  return candidates;
}

/**
 * Initiates a sequential offer cascade for an unassigned trip.
 */
export async function startOfferCascade(
  params: StartOfferCascadeParams
): Promise<OfferCascadeStepResult> {
  const {
    trip,
    drivers,
    zones,
    config,
    fleetVehicles,
    activeTrips,
    vehicleTiers,
    actorRole = 'dispatcher',
    actorId,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const nowIso = new Date(nowMs).toISOString();

  // Start a fresh cascade run (while still respecting explicit `trip.rejectedByIds` from prior declines)
  const tripForFreshCascade: Partial<Trip> = {
    ...trip,
    offerCascade: undefined,
  };

  const candidates = rankAutoDispatchCandidates(tripForFreshCascade, drivers, zones, cfg, {
    fleetVehicles,
    activeTrips,
    vehicleTiers,
    nowMs,
  });

  if (candidates.length === 0) {
    const fallbackStatus: TripStatus =
      trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed'
        ? 'CONFIRMED'
        : trip.status === 'offered'
        ? resolvePostExhaustionFallbackStatus(trip)
        : trip.status;

    const exhaustedCascade: TripOfferCascade = {
      state: 'exhausted',
      activeOfferedDriverId: null,
      offerStartedAt: nowIso,
      offerExpiresAt: nowIso,
      timeoutSeconds: cfg.offerTimeoutSeconds,
      cascadeAttempt: 0,
      maxAttempts: cfg.maxCascadeAttempts,
      attemptedDriverIds: [],
      strategy: cfg.rankingStrategy,
    };

    const auditEvent: TripAuditEvent = {
      action: 'STATUS_CHANGED',
      timestamp: nowIso,
      actorId,
      actorRole,
      referenceNumber: `CSC-${Math.floor(1000 + Math.random() * 9000)}`,
      referenceType: 'offer',
      context: `Auto-Offer Cascade exhausted immediately (0 eligible drivers matched strategy "${cfg.rankingStrategy}"). Manual dispatcher assignment required.`,
    };

    const patch: Partial<Trip> = {
      status: fallbackStatus,
      offeredToIds: [],
      offerCascade: exhaustedCascade,
      auditLog: [...(trip.auditLog || []), auditEvent],
      updatedAt: nowIso,
    };

    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    return {
      outcome: 'exhausted',
      trip: updatedTrip,
      candidate: null,
      candidates: [],
      reason: 'No eligible on-duty drivers matched trip requirements.',
    };
  }

  const top = candidates[0];
  const expiresIso = new Date(nowMs + cfg.offerTimeoutSeconds * 1000).toISOString();

  const activeCascade: TripOfferCascade = {
    state: 'active',
    activeOfferedDriverId: top.driverId,
    activeOfferedDriverName: top.driverLabel,
    offerStartedAt: nowIso,
    offerExpiresAt: expiresIso,
    timeoutSeconds: cfg.offerTimeoutSeconds,
    cascadeAttempt: 1,
    maxAttempts: cfg.maxCascadeAttempts,
    attemptedDriverIds: [top.driverId],
    strategy: cfg.rankingStrategy,
  };

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: 'offered',
    timestamp: nowIso,
    actorId,
    actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
    reason: `Cascade Step 1/${cfg.maxCascadeAttempts}: Offered to ${top.driverLabel} (${cfg.offerTimeoutSeconds}s window)`,
  };

  const offerAudit: TripAuditEvent = {
    action: 'DISPATCH_OFFERED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'offer',
    context: `Auto-Offer Cascade Step 1/${cfg.maxCascadeAttempts} (${cfg.rankingStrategy}): Offered to ${top.driverLabel} [${top.rankReason}]. Expires in ${cfg.offerTimeoutSeconds}s.`,
  };

  const patch: Partial<Trip> = {
    status: 'offered',
    assignedDriverId: null,
    offeredToIds: [top.driverId],
    offerCascade: activeCascade,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), offerAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  if (sendPush !== false) {
    const pushFn = typeof sendPush === 'function' ? sendPush : defaultTriggerServerPush;
    Promise.resolve(pushFn(top.driverId, updatedTrip)).catch(() => {});
  }

  return {
    outcome: 'offered',
    trip: updatedTrip,
    candidate: top,
    candidates,
  };
}

/**
 * Evaluates an active `offerCascade` trip and either:
 * - Marks `'accepted'` if already claimed by a driver,
 * - Waits if `offerExpiresAt` has not elapsed and the active driver has not declined,
 * - Rolls over to the next ranked driver if declined or expired and `cascadeAttempt < maxAttempts`, or
 * - Transitions to `'exhausted'` and reverts `status` to `'CONFIRMED'` (or `'pending'`) when exhausted.
 */
export async function advanceOrExpireOfferCascade(
  params: AdvanceOfferCascadeParams
): Promise<OfferCascadeStepResult> {
  const {
    trip,
    drivers,
    zones,
    config,
    fleetVehicles,
    activeTrips,
    vehicleTiers,
    bookingService = getBookingService(),
    sendPush,
    nowMs = Date.now(),
  } = params;

  const cascade = trip.offerCascade;
  if (!cascade || cascade.state !== 'active') {
    return { outcome: 'noop', trip, candidate: null, candidates: [] };
  }

  const nowIso = new Date(nowMs).toISOString();

  // Already accepted / assigned
  if (
    trip.assignedDriverId ||
    ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'].includes(
      trip.status
    )
  ) {
    const acceptedCascade: TripOfferCascade = {
      ...cascade,
      state: 'accepted',
      activeOfferedDriverId: trip.assignedDriverId || cascade.activeOfferedDriverId,
    };
    const patch: Partial<Trip> = {
      offerCascade: acceptedCascade,
      updatedAt: nowIso,
    };
    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    return { outcome: 'accepted', trip: updatedTrip, candidate: null, candidates: [] };
  }

  // Cancelled or declined trip
  if (trip.status === 'cancelled' || trip.status === 'DECLINED' || trip.status === 'declined') {
    const cancelledCascade: TripOfferCascade = {
      ...cascade,
      state: 'cancelled',
      activeOfferedDriverId: null,
      activeOfferedDriverName: '',
    };
    const patch: Partial<Trip> = {
      offerCascade: cancelledCascade,
      offeredToIds: [],
      updatedAt: nowIso,
    };
    const updatedTrip = bookingService.updateTrip
      ? await bookingService.updateTrip(trip.id, patch)
      : ({ ...trip, ...patch } as Trip);

    return { outcome: 'cancelled', trip: updatedTrip, candidate: null, candidates: [] };
  }

  const activeDriverId = cascade.activeOfferedDriverId;
  const activeDriverStillOffered = Boolean(
    activeDriverId &&
      Array.isArray(trip.offeredToIds) &&
      trip.offeredToIds.includes(activeDriverId) &&
      !(Array.isArray(trip.rejectedByIds) && trip.rejectedByIds.includes(activeDriverId))
  );

  const expiresMs = Date.parse(cascade.offerExpiresAt);
  const isExpired = Number.isFinite(expiresMs) && nowMs >= expiresMs;
  const wasDeclined = !activeDriverStillOffered;

  if (!wasDeclined && !isExpired) {
    return { outcome: 'waiting', trip, candidate: null, candidates: [] };
  }

  const cfg = normalizeDispatchAutomationConfig({
    ...(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG),
    rankingStrategy: (cascade.strategy as DispatchRankingStrategy) || config?.rankingStrategy,
    offerTimeoutSeconds: cascade.timeoutSeconds || config?.offerTimeoutSeconds,
    maxCascadeAttempts: cascade.maxAttempts || config?.maxCascadeAttempts,
  });

  // Record timed-out driver in rejectedByIds & attemptedDriverIds so they are never re-offered
  const nextRejectedByIds = Array.from(
    new Set([
      ...(trip.rejectedByIds || []),
      ...(activeDriverId ? [activeDriverId] : []),
    ])
  );
  const baseAttemptedIds = Array.from(
    new Set([
      ...(cascade.attemptedDriverIds || []),
      ...(activeDriverId ? [activeDriverId] : []),
    ])
  );

  const currentAttempt = Math.max(1, Number(cascade.cascadeAttempt || 1));
  const maxAttempts = Math.max(1, Number(cascade.maxAttempts || cfg.maxCascadeAttempts));
  const transitionReason = wasDeclined
    ? `Driver ${cascade.activeOfferedDriverName || activeDriverId || 'candidate'} declined`
    : `Offer timed out after ${cascade.timeoutSeconds || cfg.offerTimeoutSeconds}s`;

  if (currentAttempt < maxAttempts) {
    const virtualTripForRanking: Partial<Trip> = {
      ...trip,
      rejectedByIds: nextRejectedByIds,
      offerCascade: {
        ...cascade,
        attemptedDriverIds: baseAttemptedIds,
      },
    };

    const remainingCandidates = rankAutoDispatchCandidates(
      virtualTripForRanking,
      drivers,
      zones,
      cfg,
      {
        fleetVehicles,
        activeTrips,
        vehicleTiers,
        nowMs,
      }
    );

    if (remainingCandidates.length > 0) {
      const nextCandidate = remainingCandidates[0];
      const nextAttempt = currentAttempt + 1;
      const timeoutSeconds = cascade.timeoutSeconds || cfg.offerTimeoutSeconds;
      const nextExpiresIso = new Date(nowMs + timeoutSeconds * 1000).toISOString();

      const nextCascade: TripOfferCascade = {
        state: 'active',
        activeOfferedDriverId: nextCandidate.driverId,
        activeOfferedDriverName: nextCandidate.driverLabel,
        offerStartedAt: nowIso,
        offerExpiresAt: nextExpiresIso,
        timeoutSeconds,
        cascadeAttempt: nextAttempt,
        maxAttempts,
        attemptedDriverIds: Array.from(new Set([...baseAttemptedIds, nextCandidate.driverId])),
        strategy: cfg.rankingStrategy,
      };

      const historyEntry: TripStatusHistoryEntry = {
        from: trip.status,
        to: 'offered',
        timestamp: nowIso,
        actorRole: 'system',
        reason: `${transitionReason}. Cascade Step ${nextAttempt}/${maxAttempts}: Offered to ${nextCandidate.driverLabel}`,
      };

      const rolloverAudit: TripAuditEvent = {
        action: 'DISPATCH_OFFERED',
        timestamp: nowIso,
        actorRole: 'system',
        referenceNumber: `OFR-${Math.floor(1000 + Math.random() * 9000)}`,
        referenceType: 'offer',
        context: `${transitionReason}. Auto-Offer Cascade Step ${nextAttempt}/${maxAttempts} (${cfg.rankingStrategy}): Rolled over to ${nextCandidate.driverLabel} [${nextCandidate.rankReason}].`,
      };

      const patch: Partial<Trip> = {
        status: 'offered',
        assignedDriverId: null,
        offeredToIds: [nextCandidate.driverId],
        rejectedByIds: nextRejectedByIds,
        offerCascade: nextCascade,
        statusHistory: [...(trip.statusHistory || []), historyEntry],
        auditLog: [...(trip.auditLog || []), rolloverAudit],
        updatedAt: nowIso,
      };

      const updatedTrip = bookingService.updateTrip
        ? await bookingService.updateTrip(trip.id, patch)
        : ({ ...trip, ...patch } as Trip);

      if (sendPush !== false) {
        const pushFn = typeof sendPush === 'function' ? sendPush : defaultTriggerServerPush;
        Promise.resolve(pushFn(nextCandidate.driverId, updatedTrip)).catch(() => {});
      }

      return {
        outcome: 'advanced',
        trip: updatedTrip,
        candidate: nextCandidate,
        candidates: remainingCandidates,
        reason: transitionReason,
      };
    }
  }

  // Exhausted (`currentAttempt >= maxAttempts` or 0 eligible candidates left)
  const fallbackStatus = resolvePostExhaustionFallbackStatus(trip);
  const exhaustedCascade: TripOfferCascade = {
    ...cascade,
    state: 'exhausted',
    activeOfferedDriverId: null,
    activeOfferedDriverName: '',
    attemptedDriverIds: baseAttemptedIds,
  };

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: fallbackStatus,
    timestamp: nowIso,
    actorRole: 'system',
    reason: `${transitionReason}. Offer cascade exhausted after ${baseAttemptedIds.length} driver attempt(s).`,
  };

  const exhaustedAudit: TripAuditEvent = {
    action: 'STATUS_CHANGED',
    timestamp: nowIso,
    actorRole: 'system',
    referenceNumber: `EXH-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'offer',
    context: `${transitionReason}. Auto-Offer Cascade exhausted (${baseAttemptedIds.length}/${maxAttempts} attempts). Reverted to ${fallbackStatus} for immediate dispatcher triage.`,
  };

  const patch: Partial<Trip> = {
    status: fallbackStatus,
    assignedDriverId: null,
    offeredToIds: [],
    rejectedByIds: nextRejectedByIds,
    offerCascade: exhaustedCascade,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), exhaustedAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  return {
    outcome: 'exhausted',
    trip: updatedTrip,
    candidate: null,
    candidates: [],
    reason: `${transitionReason}; cascade exhausted after ${baseAttemptedIds.length} attempt(s).`,
  };
}

/**
 * Cancels an in-flight `offerCascade`, clears `offeredToIds`, and restores unassigned queue status.
 */
export async function cancelOfferCascade(
  params: CancelOfferCascadeParams
): Promise<OfferCascadeStepResult> {
  const {
    trip,
    reason = 'Offer cascade cancelled by dispatcher',
    actorRole = 'dispatcher',
    actorId,
    bookingService = getBookingService(),
    nowMs = Date.now(),
  } = params;

  if (!trip.offerCascade || trip.offerCascade.state !== 'active') {
    return { outcome: 'noop', trip, candidate: null, candidates: [] };
  }

  const nowIso = new Date(nowMs).toISOString();
  const nextStatus: TripStatus =
    trip.status === 'offered' && !trip.assignedDriverId
      ? resolvePostExhaustionFallbackStatus(trip)
      : trip.status;

  const cancelledCascade: TripOfferCascade = {
    ...trip.offerCascade,
    state: 'cancelled',
    activeOfferedDriverId: null,
    activeOfferedDriverName: '',
  };

  const historyEntry: TripStatusHistoryEntry = {
    from: trip.status,
    to: nextStatus,
    timestamp: nowIso,
    actorId,
    actorRole: actorRole === 'dispatcher' ? 'admin' : actorRole,
    reason,
  };

  const cancelAudit: TripAuditEvent = {
    action: 'STATUS_CHANGED',
    timestamp: nowIso,
    actorId,
    actorRole,
    referenceNumber: `CNL-${Math.floor(1000 + Math.random() * 9000)}`,
    referenceType: 'offer',
    context: `${reason}. Cleared active driver offer and restored status to ${nextStatus}.`,
  };

  const patch: Partial<Trip> = {
    status: nextStatus,
    offeredToIds: [],
    offerCascade: cancelledCascade,
    statusHistory: [...(trip.statusHistory || []), historyEntry],
    auditLog: [...(trip.auditLog || []), cancelAudit],
    updatedAt: nowIso,
  };

  const updatedTrip = bookingService.updateTrip
    ? await bookingService.updateTrip(trip.id, patch)
    : ({ ...trip, ...patch } as Trip);

  return {
    outcome: 'cancelled',
    trip: updatedTrip,
    candidate: null,
    candidates: [],
    reason,
  };
}
