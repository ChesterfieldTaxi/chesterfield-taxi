/**
 * Pure Auto-Dispatch Candidate Evaluation, Ranking & Pre-Pickup Lead-Window Gating
 * (`auto-dispatch-ranking.ts` — Platform Phase 50)
 *
 * Extracted from `auto-dispatch.service.ts` to keep each domain module strictly modular
 * and browser/SSR-safe with zero React, DOM, or `node:*` dependencies per `constitution.md`.
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
  TripAssignedVehicle,
} from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
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
  /** Optional override to ignore attemptedDriverIds while still respecting explicit rejectedByIds */
  ignoreAttemptedIds?: boolean;
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
  isPlannedDriver?: boolean;
}

export type CandidateExclusionCode =
  | 'BLACKLISTED_OR_SUSPENDED'
  | 'OFF_DUTY_OR_BREAK'
  | 'BUSY_OR_CONFLICT'
  | 'ALREADY_REJECTED_OR_ATTEMPTED'
  | 'VEHICLE_GROUNDED_OR_INACTIVE'
  | 'CAPACITY_OR_TIER_MISMATCH'
  | 'SCORE_BELOW_MINIMUM'
  | 'NO_GPS_TELEMETRY'
  | 'GPS_TELEMETRY_STALE'
  | 'OUTSIDE_MAX_RADIUS';

export interface ExcludedDispatchCandidate {
  driverId: string;
  driverName: string;
  driverLabel: string;
  cabNumber?: string;
  vehicleUnit: string;
  vehicleTier: string;
  exclusionCode: CandidateExclusionCode;
  exclusionReason: string;
}

export interface CandidateEvaluationResult {
  eligible: RankedDispatchCandidate[];
  excluded: ExcludedDispatchCandidate[];
  pickupZoneIds: string[];
  config: DispatchAutomationConfig;
}

type CanonicalVehicleCategory = 'standard' | 'premium' | 'xl' | 'van' | 'wheelchair';

interface ResolvedVehicleCapacity {
  category: CanonicalVehicleCategory;
  maxPassengers: number;
  maxLuggage: number;
}

export function isValidGeoPoint(pt?: GeoPoint | null): pt is GeoPoint {
  return Boolean(
    pt &&
      typeof pt.lat === 'number' &&
      typeof pt.lng === 'number' &&
      Number.isFinite(pt.lat) &&
      Number.isFinite(pt.lng) &&
      (pt.lat !== 0 || pt.lng !== 0)
  );
}

export function extractUnitDigits(raw?: string | null): string {
  if (!raw) return '';
  const match = String(raw).match(/#?(\d+)/);
  return match ? match[1] : '';
}

export function formatCandidateLabel(drv: AutoDispatchDriverInput): string {
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

  const canonicalDefaults: Record<
    CanonicalVehicleCategory,
    { maxPassengers: number; maxLuggage: number }
  > = {
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

export function evaluateDriverVehicleCompatibility(
  trip: Partial<Trip>,
  driverTierRaw: string,
  vehicleTiers?: ReadonlyArray<VehicleTierConfig>
): { compatible: boolean; reason?: string } {
  const driverCap = resolveDriverVehicleCapacity(driverTierRaw, vehicleTiers);
  const requiredPax = Math.max(1, Number(trip.passenger?.passengerCount || 1));
  const requiredBags = Math.max(0, Number(trip.passenger?.luggageCount || 0));

  if (driverCap.maxPassengers < requiredPax) {
    return {
      compatible: false,
      reason: `Capacity ${driverCap.maxPassengers} pax < required ${requiredPax} pax`,
    };
  }
  if (driverCap.maxLuggage < requiredBags) {
    return {
      compatible: false,
      reason: `Luggage capacity ${driverCap.maxLuggage} bags < required ${requiredBags} bags`,
    };
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
    return driverCap.category === 'wheelchair'
      ? { compatible: true }
      : { compatible: false, reason: 'Trip requires a Wheelchair Accessible Vehicle (WAV)' };
  }

  if (driverCap.category === 'wheelchair' && requestedRaw !== 'any') {
    return {
      compatible: false,
      reason: 'WAV unit reserved unless WAV or Any Vehicle is requested',
    };
  }

  if (requestedRaw === 'van' || requestedRaw === 'minivan') {
    return driverCap.category === 'van'
      ? { compatible: true }
      : { compatible: false, reason: `Trip requires Van/Minivan (unit is ${driverCap.category})` };
  }

  if (requestedRaw === 'xl' || requestedRaw === 'suv' || requiresSuvOrVan) {
    return driverCap.category === 'xl' || driverCap.category === 'van'
      ? { compatible: true }
      : {
          compatible: false,
          reason: `Trip requires XL SUV/Van upgrade (unit is ${driverCap.category})`,
        };
  }

  if (requestedRaw === 'premium' || requestedRaw === 'executive') {
    return driverCap.category === 'premium'
      ? { compatible: true }
      : {
          compatible: false,
          reason: `Trip requires Executive Premium vehicle (unit is ${driverCap.category})`,
        };
  }

  return { compatible: true };
}

export function findDriverFleetVehicle(
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

export function resolveDriverFrozenVehicleSnapshot(
  drv: AutoDispatchDriverInput | undefined,
  candidate: RankedDispatchCandidate,
  fleetVehicles?: ReadonlyArray<FleetCarConfig | PhysicalFleetAsset>
): TripAssignedVehicle {
  const matchedFleetVeh = drv ? findDriverFleetVehicle(drv, fleetVehicles) : undefined;
  const vehicleId = matchedFleetVeh?.id || drv?.vehicleId || `veh-${candidate.driverId}`;
  const vehicleNumber =
    matchedFleetVeh?.unitNumber ||
    candidate.vehicleUnit ||
    (candidate.cabNumber ? `Car #${candidate.cabNumber}` : 'Assigned Unit');
  const licensePlate = matchedFleetVeh?.licensePlate || 'ON-FILE';
  const model = matchedFleetVeh
    ? [matchedFleetVeh.year, matchedFleetVeh.color, matchedFleetVeh.make, matchedFleetVeh.model]
        .filter(Boolean)
        .join(' ')
        .trim() || `${matchedFleetVeh.make} ${matchedFleetVeh.model}`.trim()
    : drv?.vehicle || candidate.vehicleTier || 'Standard Sedan';

  return {
    vehicleId,
    vehicleNumber,
    licensePlate,
    model,
  };
}

function hasConflictingActiveTrip(
  driverId: string,
  targetTrip: Partial<Trip>,
  activeTrips: ReadonlyArray<Partial<Trip>> | undefined,
  nowMs: number,
  conflictWindowMinutes: number
): string | null {
  if (!activeTrips || activeTrips.length === 0) return null;

  const targetPickupMs = targetTrip.scheduledPickupTime
    ? Date.parse(targetTrip.scheduledPickupTime)
    : nowMs;
  const conflictMs = Math.max(15, conflictWindowMinutes) * 60_000;

  for (const other of activeTrips) {
    if (!other || other.id === targetTrip.id) continue;
    const status = String(other.status || '');
    if (['completed', 'cancelled', 'DECLINED', 'declined'].includes(status)) continue;

    if (
      status === 'offered' &&
      Array.isArray(other.offeredToIds) &&
      other.offeredToIds.includes(driverId)
    ) {
      return `Holding active offer on Trip #${String(other.id || '').slice(-6).toUpperCase()}`;
    }

    if (other.assignedDriverId !== driverId) continue;

    if (status === 'en_route' || status === 'arrived' || status === 'in_progress') {
      return `Executing live ${status.replace(/_/g, ' ')} Trip #${String(other.id || '')
        .slice(-6)
        .toUpperCase()}`;
    }

    if (status === 'assigned' || status === 'accepted') {
      if (targetTrip.bookingType === 'asap' && other.bookingType === 'asap') {
        return `Assigned to another ASAP Trip #${String(other.id || '').slice(-6).toUpperCase()}`;
      }
      const otherPickupMs = other.scheduledPickupTime
        ? Date.parse(other.scheduledPickupTime)
        : nowMs;
      if (
        Number.isFinite(targetPickupMs) &&
        Number.isFinite(otherPickupMs) &&
        Math.abs(targetPickupMs - otherPickupMs) <= conflictMs
      ) {
        return `Scheduled conflict within ${conflictWindowMinutes}m window (Trip #${String(
          other.id || ''
        )
          .slice(-6)
          .toUpperCase()})`;
      }
    }
  }

  return null;
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

/**
 * Pure candidate evaluation returning both the sorted `eligible` queue and
 * structured `excluded` diagnostics for every skipped driver.
 */
export function evaluateAutoDispatchCandidates(
  trip: Partial<Trip>,
  drivers: ReadonlyArray<AutoDispatchDriverInput>,
  zones?: ReadonlyArray<ZoneGeofence> | null,
  config?: Partial<DispatchAutomationConfig> | null,
  options?: RankCandidatesOptions
): CandidateEvaluationResult {
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  const nowMs = options?.nowMs ?? Date.now();
  const conflictWindowMinutes = options?.conflictWindowMinutes ?? 45;

  const activeZones = (zones && zones.length > 0 ? zones : DEFAULT_ZONES).filter(
    (z) => z.isActive && !z.isArchived && !z.isBlacklisted
  );

  const rejectedSet = new Set<string>(trip.rejectedByIds || []);
  const attemptedSet = options?.ignoreAttemptedIds
    ? new Set<string>()
    : new Set<string>(trip.offerCascade?.attemptedDriverIds || []);

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

  const eligible: RankedDispatchCandidate[] = [];
  const excluded: ExcludedDispatchCandidate[] = [];

  for (const drv of drivers) {
    if (!drv || !drv.id) continue;

    const matchedFleetVeh = findDriverFleetVehicle(drv, options?.fleetVehicles);
    const unitDigits = extractUnitDigits(
      drv.cabNumber || drv.vehicleUnit || matchedFleetVeh?.unitNumber || drv.vehicle
    );
    const vehicleUnit = unitDigits
      ? `Car #${unitDigits}`
      : drv.vehicleUnit || matchedFleetVeh?.unitNumber || drv.vehicle || 'Unit';
    const effectiveDriverTier =
      drv.vehicleTier || drv.tier || matchedFleetVeh?.vehicleTypeId || 'standard';
    const driverLabel = formatCandidateLabel(drv);

    const recordExclusion = (
      exclusionCode: CandidateExclusionCode,
      exclusionReason: string
    ): void => {
      excluded.push({
        driverId: drv.id,
        driverName: drv.name,
        driverLabel,
        cabNumber: unitDigits || drv.cabNumber,
        vehicleUnit,
        vehicleTier: effectiveDriverTier,
        exclusionCode,
        exclusionReason,
      });
    };

    // 1. Blacklisted / archived / suspended drivers
    if (drv.isBlacklisted || drv.isArchived || drv.zone === 'Suspended') {
      recordExclusion(
        'BLACKLISTED_OR_SUSPENDED',
        drv.isBlacklisted
          ? 'Driver is blacklisted'
          : drv.isArchived
          ? 'Driver profile is archived'
          : 'Driver operator status is suspended'
      );
      continue;
    }

    // 2. Off-duty or on-break drivers
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
      recordExclusion(
        'OFF_DUTY_OR_BREAK',
        resolvedDuty === 'on_break' || drv.mapStatus === 'break' || drv.status === 'break'
          ? 'Driver is currently on break'
          : 'Driver is off duty / offline'
      );
      continue;
    }

    // 3. Busy / en-route / conflicting active trips
    if (
      drv.mapStatus === 'busy' ||
      drv.mapStatus === 'en_route' ||
      drv.status === 'on_trip' ||
      Boolean(drv.activeTrip) ||
      Boolean(drv.currentTripId)
    ) {
      recordExclusion('BUSY_OR_CONFLICT', 'Driver is currently busy on an active trip');
      continue;
    }

    const conflictReason = hasConflictingActiveTrip(
      drv.id,
      trip,
      options?.activeTrips,
      nowMs,
      conflictWindowMinutes
    );
    if (conflictReason) {
      recordExclusion('BUSY_OR_CONFLICT', conflictReason);
      continue;
    }

    // 4. Already rejected or already attempted drivers
    if (rejectedSet.has(drv.id) || attemptedSet.has(drv.id)) {
      recordExclusion(
        'ALREADY_REJECTED_OR_ATTEMPTED',
        rejectedSet.has(drv.id)
          ? 'Driver previously declined or timed out on this trip'
          : 'Driver was already attempted in this cascade'
      );
      continue;
    }

    // 5. Grounded / blacklisted / non-active fleet vehicles
    if (
      drv.isVehicleGrounded ||
      drv.isVehicleBlacklisted ||
      (drv.vehicleStatus && drv.vehicleStatus !== 'active')
    ) {
      recordExclusion(
        'VEHICLE_GROUNDED_OR_INACTIVE',
        `Assigned vehicle ${vehicleUnit} is ${drv.vehicleStatus || 'grounded/blacklisted'}`
      );
      continue;
    }

    if (matchedFleetVeh) {
      const groundedReason = (matchedFleetVeh as FleetCarConfig).groundedReason;
      if (
        matchedFleetVeh.status !== 'active' ||
        matchedFleetVeh.isBlacklisted ||
        matchedFleetVeh.isArchived ||
        Boolean(groundedReason)
      ) {
        recordExclusion(
          'VEHICLE_GROUNDED_OR_INACTIVE',
          `Vehicle ${vehicleUnit} unavailable (${groundedReason || matchedFleetVeh.status})`
        );
        continue;
      }
    }

    // 6. Vehicle capacity & tier compatibility
    const vehCompatibility = evaluateDriverVehicleCompatibility(
      trip,
      effectiveDriverTier,
      options?.vehicleTiers
    );
    if (!vehCompatibility.compatible) {
      recordExclusion(
        'CAPACITY_OR_TIER_MISMATCH',
        vehCompatibility.reason || 'Vehicle tier or capacity mismatch'
      );
      continue;
    }

    // 7. Minimum driver score guardrail
    const driverScore =
      typeof drv.driverScore === 'number' && Number.isFinite(drv.driverScore)
        ? drv.driverScore
        : 80;
    if (cfg.minDriverScore > 0 && driverScore < cfg.minDriverScore) {
      recordExclusion(
        'SCORE_BELOW_MINIMUM',
        `Driver score ${driverScore} is below minimum required score (${cfg.minDriverScore})`
      );
      continue;
    }

    // 8. GPS coordinates & freshness guardrail
    const driverCoord = isValidGeoPoint(drv.currentLocation?.coordinates)
      ? drv.currentLocation!.coordinates
      : isValidGeoPoint(drv.telemetry?.coordinates)
      ? drv.telemetry!.coordinates
      : isValidGeoPoint(drv.coordinates)
      ? drv.coordinates
      : null;

    if (cfg.maxGpsStaleSeconds > 0) {
      if (!driverCoord) {
        recordExclusion(
          'NO_GPS_TELEMETRY',
          `No live GPS coordinates (maxGpsStaleSeconds = ${cfg.maxGpsStaleSeconds}s)`
        );
        continue;
      }

      const rawGpsTimestamp =
        drv.currentLocation?.timestamp ||
        drv.telemetry?.timestamp ||
        drv.locationUpdatedAt ||
        drv.lastActiveAt;

      if (rawGpsTimestamp) {
        const parsedGpsMs = Date.parse(rawGpsTimestamp);
        if (Number.isFinite(parsedGpsMs)) {
          const gpsAgeSeconds = Math.max(0, Math.round((nowMs - parsedGpsMs) / 1000));
          if (gpsAgeSeconds > cfg.maxGpsStaleSeconds) {
            recordExclusion(
              'GPS_TELEMETRY_STALE',
              `GPS telemetry is stale (${gpsAgeSeconds}s old > max ${cfg.maxGpsStaleSeconds}s)`
            );
            continue;
          }
        }
      }
    }

    // 9. Pickup distance & max radius guardrail
    const distanceMiles =
      pickupCoord && driverCoord
        ? Number(calculateHaversineDistanceMiles(pickupCoord, driverCoord).toFixed(3))
        : null;

    if (
      cfg.maxPickupRadiusMiles > 0 &&
      distanceMiles !== null &&
      distanceMiles > cfg.maxPickupRadiusMiles
    ) {
      recordExclusion(
        'OUTSIDE_MAX_RADIUS',
        `Distance ${distanceMiles.toFixed(1)} mi exceeds max pickup radius (${cfg.maxPickupRadiusMiles} mi)`
      );
      continue;
    }

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

    const rawIdleRef =
      drv.idleSince || drv.lastCompletedTripAt || drv.lastActiveAt || drv.locationUpdatedAt;
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

    const isPlannedDriver = Boolean(trip.plannedDriverId && trip.plannedDriverId === drv.id);
    const distStr = distanceMiles !== null ? `${distanceMiles.toFixed(1)} mi` : 'no GPS';
    const idleMins = Math.round(idleDurationMs / 60_000);
    const baseReason =
      cfg.rankingStrategy === 'nearest_in_zone'
        ? `${inPickupZone ? 'In pickup zone' : 'Outside pickup zone'} · ${distStr} · Score ${driverScore}`
        : cfg.rankingStrategy === 'longest_idle_in_zone'
        ? `${inPickupZone ? 'In pickup zone' : 'Outside pickup zone'} · Idle ${idleMins}m · ${distStr}`
        : `Score ${driverScore} · ${inPickupZone ? 'In pickup zone' : 'Outside pickup zone'} · ${distStr}`;

    eligible.push({
      driverId: drv.id,
      driverName: drv.name,
      driverLabel,
      cabNumber: unitDigits || drv.cabNumber,
      vehicleUnit,
      vehicleTier: effectiveDriverTier,
      inPickupZone,
      matchedZoneIds,
      distanceMiles,
      idleDurationMs,
      driverScore,
      strategy: cfg.rankingStrategy,
      rankReason: isPlannedDriver ? `Planned Driver · ${baseReason}` : baseReason,
      ...(isPlannedDriver ? { isPlannedDriver: true } : {}),
    });
  }

  const compareDistance = (a: RankedDispatchCandidate, b: RankedDispatchCandidate): number => {
    const distA = a.distanceMiles ?? Number.POSITIVE_INFINITY;
    const distB = b.distanceMiles ?? Number.POSITIVE_INFINITY;
    if (distA !== distB) return distA - distB;
    return 0;
  };

  eligible.sort((a, b) => {
    // Pre-staged / planned driver always receives #1 priority when eligible
    if (Boolean(a.isPlannedDriver) !== Boolean(b.isPlannedDriver)) {
      return a.isPlannedDriver ? -1 : 1;
    }

    // Enforce strictZoneFirst across all strategies when enabled
    if (cfg.strictZoneFirst && a.inPickupZone !== b.inPickupZone) {
      return a.inPickupZone ? -1 : 1;
    }

    if (cfg.rankingStrategy === 'nearest_in_zone') {
      const distCmp = compareDistance(a, b);
      if (distCmp !== 0) return distCmp;
      if (a.inPickupZone !== b.inPickupZone) return a.inPickupZone ? -1 : 1;
      if (a.driverScore !== b.driverScore) return b.driverScore - a.driverScore;
      return a.driverId.localeCompare(b.driverId);
    }

    if (cfg.rankingStrategy === 'longest_idle_in_zone') {
      if (a.idleDurationMs !== b.idleDurationMs) return b.idleDurationMs - a.idleDurationMs;
      if (a.inPickupZone !== b.inPickupZone) return a.inPickupZone ? -1 : 1;
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

  return {
    eligible,
    excluded,
    pickupZoneIds: Array.from(pickupZoneIds),
    config: cfg,
  };
}

/**
 * Pure deterministic candidate ranking engine (returns `eligible` from `evaluateAutoDispatchCandidates`).
 */
export function rankAutoDispatchCandidates(
  trip: Partial<Trip>,
  drivers: ReadonlyArray<AutoDispatchDriverInput>,
  zones?: ReadonlyArray<ZoneGeofence> | null,
  config?: Partial<DispatchAutomationConfig> | null,
  options?: RankCandidatesOptions
): RankedDispatchCandidate[] {
  return evaluateAutoDispatchCandidates(trip, drivers, zones, config, options).eligible;
}

/**
 * Evaluates whether `nowDate` falls inside the configured Auto-Dispatch operating hours window.
 * Supports both `'always'` (24/7) and `'custom_window'` (including overnight wrap-around such as 22:00–06:00).
 */
export function isWithinAutoDispatchOperatingHours(
  config?: Partial<DispatchAutomationConfig> | null,
  nowDate: Date | number = new Date()
): boolean {
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);
  if (cfg.operatingHoursMode === 'always') {
    return true;
  }

  const d = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const hour = d.getHours();
  const start = cfg.windowStartHour;
  const end = cfg.windowEndHour;

  if (start === end) {
    return true;
  }

  // Daytime window (e.g. 08:00 -> 18:00)
  if (start < end) {
    return hour >= start && hour < end;
  }

  // Overnight wrap-around window (e.g. 22:00 -> 06:00)
  return hour >= start || hour < end;
}

/**
 * Pure Pre-Pickup Lead Window check:
 * - Trip must be unassigned (`!trip.assignedDriverId`), in `'CONFIRMED' | 'confirmed' | 'pending'`
 *   (NEVER `'UNCONFIRMED'`), and NOT currently in an active offer cascade.
 * - ASAP rides (`bookingType === 'asap'` or no `scheduledPickupTime`) are immediately inside the window.
 * - Scheduled rides with a future `scheduledPickupTime` are inside the window ONLY when
 *   `minutesUntilPickup <= leadMinutes + airportExtra` (and `minutesUntilPickup >= -60`).
 *   Rides hours, days, weeks, or months ahead return `false` and stay untouched in `CONFIRMED`.
 */
export function isTripWithinDispatchLeadWindow(
  trip: Partial<Trip> | null | undefined,
  config?: Partial<DispatchAutomationConfig> | null,
  nowMs: number = Date.now()
): boolean {
  if (!trip || trip.assignedDriverId) return false;
  if (trip.isArchived || trip.isBlacklisted) return false;

  const status = String(trip.status || '');
  if (status !== 'CONFIRMED' && status !== 'confirmed' && status !== 'pending') {
    return false;
  }

  if (trip.offerCascade?.state === 'active') {
    return false;
  }

  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);

  if (trip.bookingType === 'asap' || !trip.scheduledPickupTime) {
    return true;
  }

  const scheduledMs = Date.parse(trip.scheduledPickupTime);
  if (!Number.isFinite(scheduledMs)) {
    return true;
  }

  const minutesUntilPickup = (scheduledMs - nowMs) / 60_000;
  if (minutesUntilPickup < -60) {
    return false;
  }

  const meta = (trip.metadata || {}) as Record<string, any>;
  const airportCheck = detectAirportInAddresses(
    trip.pickupLocation?.address || '',
    trip.dropoffLocation?.address || ''
  );
  const isAirportTrip = Boolean(airportCheck.isAirportTrip || meta.isAirportTrip);
  const airportExtra = isAirportTrip ? cfg.airportExtraLeadMinutes : 0;

  const baseLeadMinutes = trip.plannedDriverId
    ? cfg.stagedAutoReleaseLeadMinutes
    : cfg.scheduledDispatchLeadMinutes;
  const effectiveLeadMinutes = baseLeadMinutes + airportExtra;

  return minutesUntilPickup <= effectiveLeadMinutes;
}

/**
 * Returns all open unassigned trips currently inside `isTripWithinDispatchLeadWindow`
 * (excluding already `'exhausted'` cascades unless `options.includeExhausted` is true).
 * Powers the live `Auto-Dispatch Ready (N)` button even when `dispatchMode === 'manual_1tap'`
 * or `isPaused === true`.
 */
export function getReadyForAutoDispatchTrips(
  trips: ReadonlyArray<Trip>,
  config?: Partial<DispatchAutomationConfig> | null,
  nowMs: number = Date.now(),
  options?: { includeExhausted?: boolean }
): Trip[] {
  if (!Array.isArray(trips) || trips.length === 0) return [];
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);

  const ready = trips.filter((trip) => {
    if (!isTripWithinDispatchLeadWindow(trip, cfg, nowMs)) return false;
    if (!options?.includeExhausted && trip.offerCascade?.state === 'exhausted') {
      return false;
    }
    return true;
  });

  ready.sort((a, b) => {
    const aAsap = a.bookingType === 'asap' || !a.scheduledPickupTime;
    const bAsap = b.bookingType === 'asap' || !b.scheduledPickupTime;
    if (aAsap !== bAsap) return aAsap ? -1 : 1;
    const aMs = a.scheduledPickupTime ? Date.parse(a.scheduledPickupTime) : nowMs;
    const bMs = b.scheduledPickupTime ? Date.parse(b.scheduledPickupTime) : nowMs;
    if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
      return aMs - bMs;
    }
    return a.id.localeCompare(b.id);
  });

  return ready;
}

/**
 * Evaluates whether a trip is eligible for continuous unattended `Auto-Pilot` execution right now.
 */
export function isTripEligibleForAutoPilot(
  trip: Partial<Trip> | null | undefined,
  config?: Partial<DispatchAutomationConfig> | null,
  nowMs: number = Date.now()
): boolean {
  if (!trip) return false;
  const cfg = normalizeDispatchAutomationConfig(config || DEFAULT_DISPATCH_AUTOMATION_CONFIG);

  if (cfg.dispatchMode === 'manual_1tap') return false;
  if (cfg.isPaused) return false;
  if (!isWithinAutoDispatchOperatingHours(cfg, new Date(nowMs))) return false;

  if (trip.plannedDriverId && !cfg.autoReleaseStagedDrivers) {
    return false;
  }

  const isAsap = trip.bookingType === 'asap' || !trip.scheduledPickupTime;
  if (isAsap && !cfg.autoDispatchAsapRides) return false;
  if (!isAsap && !cfg.autoDispatchScheduledRides) return false;

  if (
    trip.offerCascade?.state === 'exhausted' ||
    trip.offerCascade?.state === 'cancelled'
  ) {
    return false;
  }

  return isTripWithinDispatchLeadWindow(trip, cfg, nowMs);
}

/**
 * Pure check for whether an active `offerCascade` requires immediate transition
 * (accepted, cancelled, expired, or all offered drivers in step/pool declined).
 */
export function shouldAdvanceActiveCascade(
  trip: Partial<Trip> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const cascade = trip?.offerCascade;
  if (!trip || !cascade || cascade.state !== 'active') return false;

  if (
    trip.assignedDriverId ||
    ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed'].includes(
      String(trip.status || '')
    )
  ) {
    return true;
  }

  if (trip.status === 'cancelled' || trip.status === 'DECLINED' || trip.status === 'declined') {
    return true;
  }

  const expiresMs = Date.parse(cascade.offerExpiresAt);
  if (Number.isFinite(expiresMs) && nowMs >= expiresMs) {
    return true;
  }

  const offeredSet = new Set(trip.offeredToIds || []);
  const rejectedSet = new Set(trip.rejectedByIds || []);

  if (cascade.mode === 'broadcast_pool') {
    const poolIds =
      Array.isArray(cascade.activeOfferedDriverIds) && cascade.activeOfferedDriverIds.length > 0
        ? cascade.activeOfferedDriverIds
        : cascade.activeOfferedDriverId
        ? [cascade.activeOfferedDriverId]
        : [];
    const remainingActive = poolIds.filter((id) => offeredSet.has(id) && !rejectedSet.has(id));
    return remainingActive.length === 0;
  }

  const activeDriverId = cascade.activeOfferedDriverId;
  const activeStillOffered = Boolean(
    activeDriverId && offeredSet.has(activeDriverId) && !rejectedSet.has(activeDriverId)
  );
  return !activeStillOffered;
}
