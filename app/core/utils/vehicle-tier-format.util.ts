import type { FleetCarConfig, VehicleTierConfig } from '../types/config';
import type { Trip } from '../types/trip';

export interface DriverVehicleLookupItem {
  id: string;
  cabNumber?: string;
  vehicle?: string;
  tier?: string;
  vehicleType?: string;
  vehicleTypeId?: string;
}

function normalizeVehicleSlug(raw?: string | null): string {
  return String(raw || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function findLiveVehicleTier(
  tier?: string | null,
  vehicles?: readonly VehicleTierConfig[] | null
): VehicleTierConfig | undefined {
  if (!tier || !Array.isArray(vehicles) || vehicles.length === 0) return undefined;
  const norm = tier.trim().toLowerCase();
  const slug = normalizeVehicleSlug(tier);
  if (!norm || norm === 'any') return undefined;

  const activePool = vehicles.filter((v) => !v.isArchived && v.isActive !== false);
  for (const pool of [activePool, vehicles]) {
    const matched = pool.find(
      (v) =>
        v.id.trim().toLowerCase() === norm ||
        normalizeVehicleSlug(v.id) === slug ||
        v.name.trim().toLowerCase() === norm ||
        normalizeVehicleSlug(v.name) === slug
    );
    if (matched) return matched;
  }
  return undefined;
}

function isLegacyGenericDisplayToken(val: string): boolean {
  const lower = val.trim().toLowerCase();
  return lower === 'standard' || lower === 'sedan' || lower === 'xl' || lower === 'suv';
}

/**
 * Resolves a human-friendly vehicle class label prioritizing:
 * 1. `'Any'` if requested as `'any'`
 * 2. Live Admin `VehicleTierConfig.name` lookup by `tier` ID
 * 3. Explicit persisted `vehicleDisplayName` (when non-generic)
 * 4. Clean fallback formatter
 */
export function formatVehicleTier(
  tier: string,
  vehicles?: VehicleTierConfig[],
  explicitDisplayName?: string
): string {
  const tierTrimmed = String(tier || '').trim();
  const tierLower = tierTrimmed.toLowerCase();
  if (tierLower === 'any' || tierLower.startsWith('any vehicle')) return 'Any';

  const liveMatched = findLiveVehicleTier(tierTrimmed, vehicles);
  if (liveMatched?.name?.trim()) return liveMatched.name.trim();

  if (explicitDisplayName && explicitDisplayName.trim()) {
    const trimmed = explicitDisplayName.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'any' || lower.startsWith('any vehicle')) return 'Any';
    if (!isLegacyGenericDisplayToken(trimmed)) return trimmed;
  }

  if (!tierTrimmed) return 'Standard Sedan';
  const clean = tierLower.replace(/[-_]+/g, ' ');
  if (clean === 'any' || clean.startsWith('any')) return 'Any';
  if (clean === 'standard' || clean === 'sedan') return 'Standard Sedan';
  if (clean === 'premium') return 'Premium Sedan';
  if (clean === 'xl' || clean === 'suv' || clean === 'large suv') return 'Full-Size SUV (XL)';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'midsize suv') return 'Midsize SUV';
  if (clean === 'minivan') return 'Minivan';
  if (clean === 'van') return 'Passenger Van';
  if (clean === 'wheelchair' || clean === 'wav' || clean === 'wheelchair wav') {
    return 'Wheelchair Accessible Van (WAV)';
  }
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Concise UI badge formatting for vehicle tiers in tables, queues, and cards.
 * Looks up live `vehicles` by `tier` ID BEFORE falling back to `explicitDisplayName`.
 */
export function formatVehicleTierDisplay(
  tier?: string,
  vehicles?: VehicleTierConfig[],
  explicitDisplayName?: string
): string {
  const tierTrimmed = String(tier || '').trim();
  const tierLower = tierTrimmed.toLowerCase();
  if (tierLower === 'any' || tierLower.startsWith('any vehicle')) return 'Any';

  const liveMatched = findLiveVehicleTier(tierTrimmed, vehicles);
  if (liveMatched?.name?.trim()) return liveMatched.name.trim();

  if (explicitDisplayName && explicitDisplayName.trim()) {
    const trimmed = explicitDisplayName.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'any' || lower.startsWith('any vehicle')) return 'Any';
    if (!isLegacyGenericDisplayToken(trimmed)) return trimmed;
  }

  if (!tierTrimmed) return 'Standard';
  const clean = tierLower.replace(/[-_]+/g, ' ');
  if (clean === 'any' || clean.startsWith('any vehicle')) return 'Any';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'midsize suv') return 'Midsize SUV';
  if (clean === 'standard') return 'Standard Sedan';
  if (clean === 'sedan') return 'Sedan';
  if (clean === 'xl') return 'Full-Size SUV (XL)';
  if (clean === 'suv' || clean === 'large suv' || clean === 'full size suv') return 'Full-Size SUV';
  if (clean === 'minivan') return 'Minivan';
  if (clean === 'van') return 'Passenger Van';
  if (clean === 'wheelchair' || clean === 'wav' || clean === 'wheelchair wav') return 'WAV';
  if (clean === 'premium') return 'Premium';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractCabUnitToken(raw?: string): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/#?(\d+[a-zA-Z]?)/);
  return m ? m[1].toLowerCase() : raw.trim().toLowerCase().replace(/^#/, '') || null;
}

function inferVehicleTokenFromDescription(desc: string): string | null {
  const norm = desc.toLowerCase();
  if (!norm) return null;
  if (/\b(wheelchair|wav|accessible|ramp)\b/.test(norm)) return 'wheelchair';
  if (/\b(minivan|sienna|odyssey|pacifica|carnival|caravan)\b/.test(norm)) return 'minivan';
  if (/\b(midsize\s*suv|highlander|pilot|explorer|telluride|palisade|traverse)\b/.test(norm)) {
    return 'midsize-suv';
  }
  if (/\b(compact\s*suv|rav4|cr-?v|rogue|tucson|cx-?5)\b/.test(norm)) return 'compact-suv';
  if (/\b(sprinter|transit|promaster|passenger\s+van|van)\b/.test(norm)) return 'van';
  if (/\b(suburban|tahoe|yukon|escalade|expedition|suv)\b/.test(norm)) return 'xl';
  if (/\b(sedan|camry|accord|sonata|altima|prius|corolla|civic)\b/.test(norm)) return 'standard';
  return null;
}

/**
 * Formats the Queue / Admin Trips `VEHICLE` column:
 * - Unassigned `'any'` booking -> `'Any'`
 * - Assigned `'any'` booking (`tier === 'any'` or `metadata.requestedAnyVehicle`) -> `'Any → <Assigned Tier>'`
 * - Specific tier booking -> live Admin tier name via `formatVehicleTierDisplay`
 */
export function formatTripVehicleColumnDisplay(
  trip: Pick<Trip, 'vehicleTier' | 'assignedDriverId' | 'metadata'> | null | undefined,
  vehicles?: VehicleTierConfig[] | null,
  drivers?: ReadonlyArray<DriverVehicleLookupItem> | null,
  fleetCars?: ReadonlyArray<FleetCarConfig> | null
): string {
  if (!trip) return 'Standard';
  const meta = (trip.metadata || {}) as Record<string, unknown>;
  const rawTypeId = typeof meta.vehicleTypeId === 'string' ? meta.vehicleTypeId.trim() : '';
  const rawPref = typeof meta.vehiclePreference === 'string' ? meta.vehiclePreference.trim() : '';
  const rawDisplay =
    typeof meta.vehicleDisplayName === 'string' ? meta.vehicleDisplayName.trim() : undefined;
  const rawTier = String(trip.vehicleTier || '').trim();

  const wasBookedAsAny =
    Boolean(meta.requestedAnyVehicle) ||
    rawTier.toLowerCase() === 'any' ||
    rawTypeId.toLowerCase() === 'any' ||
    rawPref.toLowerCase() === 'any' ||
    (rawDisplay ? rawDisplay.toLowerCase() === 'any' : false);

  if (!wasBookedAsAny) {
    return formatVehicleTierDisplay(rawTypeId || rawTier, vehicles || undefined, rawDisplay);
  }

  if (!trip.assignedDriverId) {
    return 'Any';
  }

  const assignedDriver = (drivers || []).find((d) => d.id === trip.assignedDriverId);
  const activeCars = (fleetCars || []).filter((c) => !c.isArchived);
  let matchedCar = activeCars.find((c) => c.assignedDriverId === trip.assignedDriverId);
  if (!matchedCar && assignedDriver) {
    const cabTok =
      extractCabUnitToken(assignedDriver.cabNumber) || extractCabUnitToken(assignedDriver.vehicle);
    if (cabTok) {
      matchedCar = activeCars.find((c) => extractCabUnitToken(c.unitNumber) === cabTok);
    }
  }

  const metaAssignedTier =
    (typeof meta.assignedVehicleTypeId === 'string' && meta.assignedVehicleTypeId.trim()) ||
    (typeof meta.assignedVehicleTier === 'string' && meta.assignedVehicleTier.trim()) ||
    '';
  const metaAssignedDisplay =
    typeof meta.assignedVehicleDisplayName === 'string'
      ? meta.assignedVehicleDisplayName.trim()
      : undefined;

  const explicitDriverTier = [
    matchedCar?.vehicleTypeId,
    assignedDriver?.vehicleTypeId,
    assignedDriver?.tier,
    assignedDriver?.vehicleType,
    metaAssignedTier,
  ]
    .map((v) => String(v || '').trim())
    .find((v) => Boolean(v) && v.toLowerCase() !== 'any');

  const inferredFromDesc = inferVehicleTokenFromDescription(
    [matchedCar ? `${matchedCar.make} ${matchedCar.model}` : '', assignedDriver?.vehicle || '']
      .filter(Boolean)
      .join(' ')
  );

  const fallbackNonDefaultTier =
    rawTier && rawTier.toLowerCase() !== 'any' && rawTier.toLowerCase() !== 'standard'
      ? rawTier
      : '';

  const resolvedToken = explicitDriverTier || inferredFromDesc || fallbackNonDefaultTier;
  const matchedAdminTier =
    findLiveVehicleTier(resolvedToken, vehicles) ||
    findLiveVehicleTier(metaAssignedDisplay, vehicles);
  const assignedLabel = matchedAdminTier?.name?.trim();
  if (!assignedLabel || assignedLabel.toLowerCase() === 'any') {
    return 'Any';
  }
  return `Any → ${assignedLabel}`;
}
