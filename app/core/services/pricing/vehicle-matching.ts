/**
 * Shared Vehicle Matching & Local Date Helpers for the Pricing Engine
 *
 * Ensures Tariffs, Named Pricing Rules, and Conditional Surcharges all match
 * admin-created vehicle IDs (e.g. 'compact_suv', 'midsize_suv', 'minivan', 'any')
 * using one deterministic, exact-first algorithm.
 */

export interface VehicleMatchCandidate {
  vehicleTypeId?: string;
  vehicleType?: string;
  vehicleTier?: string;
  vehicleClass?: string;
}

const CANONICAL_LEGACY_ALIASES: Record<string, readonly string[]> = {
  standard: ['sedan'],
  sedan: ['standard'],
  wheelchair: ['wheelchair_wav'],
  wheelchair_wav: ['wheelchair'],
  van: ['minivan'],
  minivan: ['van'],
  xl: ['suv'],
  suv: ['xl'],
};

/**
 * Formats a Date in local wall-clock timezone as YYYY-MM-DD (avoiding UTC evening rollover).
 */
export function formatLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves the primary vehicle identifier selected for a trip/quote.
 */
export function resolvePrimaryVehicleId(input: VehicleMatchCandidate): string {
  return (
    input.vehicleTypeId ||
    input.vehicleType ||
    input.vehicleTier ||
    'any'
  )
    .trim()
    .toLowerCase();
}

/**
 * Checks whether a trip's selected vehicle matches a list of allowed vehicle IDs.
 *
 * Rules:
 * - Empty list or 'all' matches every vehicle.
 * - Exact ID match always wins (so custom IDs like 'compact_suv' vs 'midsize_suv' never collide).
 * - When `allowAnyDispatch` is true (e.g. Tariff eligibility), 'any' matches tariffs that accept
 *   multiple vehicles or standard/sedan/any. When false (e.g. Vehicle Upgrade Surcharges),
 *   'any' ONLY matches if 'any' or 'all' is explicitly listed.
 * - Canonical legacy alias pairs (standard<->sedan, van<->minivan, xl<->suv, wheelchair<->wheelchair_wav)
 *   provide backward compatibility for older configs without conflating distinct custom vehicle IDs.
 */
export function doesVehicleMatchAllowedList(
  allowedList: ReadonlyArray<string> | undefined,
  input: VehicleMatchCandidate,
  options?: { allowAnyDispatch?: boolean }
): boolean {
  if (!allowedList || allowedList.length === 0) {
    return true;
  }

  const normalizedAllowed = new Set(
    allowedList.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
  );

  if (normalizedAllowed.size === 0 || normalizedAllowed.has('all')) {
    return true;
  }

  const primaryId = resolvePrimaryVehicleId(input);

  // Build ordered unique candidate identifiers for this vehicle
  const candidateSet = new Set<string>();
  for (const raw of [input.vehicleTypeId, input.vehicleType, input.vehicleTier, input.vehicleClass]) {
    const clean = String(raw || '').trim().toLowerCase();
    if (clean) candidateSet.add(clean);
  }
  if (candidateSet.size === 0) {
    candidateSet.add('any');
  }

  // 1. Exact ID match
  for (const cand of candidateSet) {
    if (normalizedAllowed.has(cand)) {
      return true;
    }
  }

  // 2. 'Any Vehicle' dispatch semantics
  if (primaryId === 'any') {
    if (options?.allowAnyDispatch) {
      // A tariff is eligible for "Any Vehicle" if it allows multiple vehicles or standard/sedan
      return (
        normalizedAllowed.size > 1 ||
        normalizedAllowed.has('standard') ||
        normalizedAllowed.has('sedan') ||
        normalizedAllowed.has('any')
      );
    }
    return false;
  }

  // 3. Canonical legacy alias pairs ONLY (never substring matching custom IDs)
  for (const cand of candidateSet) {
    const aliases = CANONICAL_LEGACY_ALIASES[cand];
    if (aliases && aliases.some((alias) => normalizedAllowed.has(alias))) {
      return true;
    }
  }

  return false;
}
