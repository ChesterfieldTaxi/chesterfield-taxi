import type { GeoPoint } from '../../../../core/types/trip';
import type { LiveDriverMapStatus } from '../../../../core/types/driver';
import type { FleetCarConfig, VehicleTierConfig } from '../../../../core/types/config';
import {
  FLEET_STATUS_COLORS,
  type LiveFleetDriver,
} from '../../../../core/hooks/useDispatchFleet';

// Memoized cache for encoded SVG car marker data URLs
const svgIconCache = new Map<string, string>();

export const CANONICAL_VEHICLE_TYPE_OPTIONS = [
  { key: 'sedan', label: 'Sedan' },
  { key: 'suv', label: 'SUV' },
  { key: 'minivan', label: 'Minivan' },
  { key: 'van', label: 'Van' },
  { key: 'wheelchair_wav', label: 'Wheelchair WAV' },
] as const;

export type CanonicalVehicleTypeKey = (typeof CANONICAL_VEHICLE_TYPE_OPTIONS)[number]['key'];

export interface DriverVehicleFilterTarget {
  id?: string;
  cabNumber?: string;
  vehicle?: string;
  tier?: string;
  vehicleType?: string;
  vehicleTypeId?: string;
  isBlacklisted?: boolean;
  mapStatus?: LiveDriverMapStatus;
}

export interface VehicleTypeFilterOption {
  key: string;
  label: string;
  totalDriversCount: number;
  onShiftDriversCount: number;
}

function extractUnitNumberToken(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numMatch = trimmed.match(/#?(\d+[a-zA-Z]?)/);
  if (numMatch) return numMatch[1].toLowerCase();
  return trimmed.toLowerCase().replace(/^#/, '');
}

function findMatchedFleetCar(
  driver: DriverVehicleFilterTarget,
  fleetCars?: FleetCarConfig[] | null
): FleetCarConfig | undefined {
  if (!Array.isArray(fleetCars) || fleetCars.length === 0) return undefined;
  const activeCars = fleetCars.filter((c) => !c.isArchived);
  if (driver.id) {
    const byId = activeCars.find((c) => c.assignedDriverId === driver.id);
    if (byId) return byId;
  }
  const drvCab = extractUnitNumberToken(driver.cabNumber) || extractUnitNumberToken(driver.vehicle);
  if (drvCab) {
    return activeCars.find((c) => extractUnitNumberToken(c.unitNumber) === drvCab);
  }
  return undefined;
}

function normalizeTierToken(raw?: string | null): string {
  return String(raw || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function getActiveAdminVehicleTiers(
  vehicleTiers?: readonly VehicleTierConfig[] | null
): VehicleTierConfig[] {
  if (!Array.isArray(vehicleTiers) || vehicleTiers.length === 0) return [];
  return vehicleTiers.filter(
    (t) => !t.isArchived && t.isActive !== false && Boolean(String(t.id || '').trim())
  );
}

function findMatchedVehicleTier(
  driver: DriverVehicleFilterTarget,
  matchedCar: FleetCarConfig | undefined,
  vehicleTiers?: readonly VehicleTierConfig[] | null
): VehicleTierConfig | undefined {
  const activeTiers = getActiveAdminVehicleTiers(vehicleTiers);
  if (activeTiers.length === 0) return undefined;
  const candidateTokens = [
    driver.vehicleTypeId,
    matchedCar?.vehicleTypeId,
    driver.vehicleType,
    driver.tier,
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);

  for (const tok of candidateTokens) {
    const slug = normalizeTierToken(tok);
    const exact = activeTiers.find(
      (t) =>
        t.id.trim().toLowerCase() === tok ||
        normalizeTierToken(t.id) === slug ||
        t.name.trim().toLowerCase() === tok ||
        normalizeTierToken(t.name) === slug
    );
    if (exact) return exact;
  }
  return undefined;
}

function classifyCanonicalVehicleText(text: string): CanonicalVehicleTypeKey | null {
  if (!text) return null;
  const norm = text.toLowerCase();
  if (/\b(wheelchair|wheelchair_wav|wav|accessible|ada|ramp)\b/i.test(norm)) {
    return 'wheelchair_wav';
  }
  if (/\b(minivan|mini-van|sienna|odyssey|pacifica|caravan|voyager|carnival)\b/i.test(norm)) {
    return 'minivan';
  }
  if (
    /\b(sprinter|transit|promaster|econoline|passenger\s+van|shuttle\s+van|cargo\s+van|van)\b/i.test(
      norm
    )
  ) {
    return 'van';
  }
  if (
    /\b(suv|suburban|tahoe|yukon|escalade|expedition|explorer|highlander|pilot|telluride|palisade|traverse|4runner|navigator|aviator|crossover)\b/i.test(
      norm
    )
  ) {
    return 'suv';
  }
  if (
    /\b(sedan|camry|accord|sonata|altima|avalon|prius|corolla|civic|malibu|impala|fusion|es\s*350|ls\s*500|town\s*car)\b/i.test(
      norm
    )
  ) {
    return 'sedan';
  }
  return null;
}

function resolveCanonicalDriverVehicleKey(
  driver: DriverVehicleFilterTarget,
  matchedCar?: FleetCarConfig
): string {
  const specificVehicleSignal = [
    driver.vehicleType,
    matchedCar ? `${matchedCar.make} ${matchedCar.model}` : '',
    driver.vehicle,
  ]
    .filter(Boolean)
    .join(' ');
  const fromSpecific = classifyCanonicalVehicleText(specificVehicleSignal);
  if (fromSpecific) return fromSpecific;

  const directTierSignal = [driver.tier, driver.vehicleTypeId].filter(Boolean).join(' ');
  const fromDirectTier = classifyCanonicalVehicleText(directTierSignal);
  if (fromDirectTier) return fromDirectTier;

  const rawTierLower = String(driver.vehicleTypeId || driver.tier || '').trim().toLowerCase();
  if (rawTierLower === 'wheelchair' || rawTierLower === 'wav') return 'wheelchair_wav';
  if (rawTierLower === 'xl') return 'suv';
  if (
    rawTierLower === 'standard' ||
    rawTierLower === 'premium' ||
    rawTierLower === 'executive' ||
    !rawTierLower ||
    rawTierLower === 'any'
  ) {
    return 'sedan';
  }
  return rawTierLower;
}

function mapCanonicalClassToActiveTier(
  canonicalKey: string,
  activeTiers: readonly VehicleTierConfig[]
): VehicleTierConfig | undefined {
  const matchByClass = (target: CanonicalVehicleTypeKey) =>
    activeTiers.find((t) => classifyCanonicalVehicleText(`${t.id} ${t.name}`) === target);

  if (canonicalKey === 'wheelchair_wav') {
    return (
      activeTiers.find((t) => t.id.toLowerCase() === 'wheelchair' || t.iconType === 'wheelchair') ||
      matchByClass('wheelchair_wav')
    );
  }
  if (canonicalKey === 'minivan') {
    return (
      matchByClass('minivan') ||
      activeTiers.find((t) => t.id.toLowerCase() === 'xl' || t.iconType === 'xl') ||
      matchByClass('suv')
    );
  }
  if (canonicalKey === 'van') {
    return (
      matchByClass('van') ||
      matchByClass('minivan') ||
      activeTiers.find((t) => t.id.toLowerCase() === 'xl' || t.iconType === 'xl') ||
      matchByClass('suv')
    );
  }
  if (canonicalKey === 'suv') {
    return (
      matchByClass('suv') ||
      activeTiers.find((t) => t.id.toLowerCase() === 'xl' || t.iconType === 'xl')
    );
  }
  return (
    activeTiers.find((t) => t.id.toLowerCase() === 'standard') ||
    matchByClass('sedan') ||
    activeTiers.find((t) => t.iconType === 'standard') ||
    activeTiers[0]
  );
}

/**
 * Resolves a driver's vehicle type key onto active Admin `VehicleTierConfig` IDs when present,
 * falling back to canonical keys (`'sedan' | 'suv' | 'minivan' | 'van' | 'wheelchair_wav'`) only when
 * `vehicleTiers` is empty or null.
 */
export function resolveDriverVehicleTypeKey(
  driver: DriverVehicleFilterTarget | null | undefined,
  fleetCars?: FleetCarConfig[] | null,
  vehicleTiers?: VehicleTierConfig[] | null
): string {
  const activeTiers = getActiveAdminVehicleTiers(vehicleTiers);
  if (!driver) {
    return activeTiers[0] ? activeTiers[0].id.trim().toLowerCase() : 'sedan';
  }

  const matchedCar = findMatchedFleetCar(driver, fleetCars);
  if (activeTiers.length > 0) {
    const matchedTier = findMatchedVehicleTier(driver, matchedCar, activeTiers);
    if (matchedTier) return matchedTier.id.trim().toLowerCase();
    const canonical = resolveCanonicalDriverVehicleKey(driver, matchedCar);
    const mappedTier = mapCanonicalClassToActiveTier(canonical, activeTiers);
    return mappedTier ? mappedTier.id.trim().toLowerCase() : canonical;
  }

  return resolveCanonicalDriverVehicleKey(driver, matchedCar);
}

/**
 * Pure multi-select matcher for `LiveFleetMap` vehicle filtering.
 * When `selectedVehicleTypes` is empty (`[]`), all drivers match (`true`).
 */
export function matchesSelectedVehicleTypes(
  driver: DriverVehicleFilterTarget | null | undefined,
  selectedVehicleTypes: readonly string[] | null | undefined,
  fleetCars?: FleetCarConfig[] | null,
  vehicleTiers?: VehicleTierConfig[] | null
): boolean {
  if (!selectedVehicleTypes || selectedVehicleTypes.length === 0) {
    return true;
  }
  const normalizedSelected = new Set(
    selectedVehicleTypes.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
  );
  if (normalizedSelected.size === 0) {
    return true;
  }
  if (!driver) return false;

  const matchedCar = findMatchedFleetCar(driver, fleetCars);
  const resolvedKey = resolveDriverVehicleTypeKey(driver, fleetCars, vehicleTiers);
  const canonicalKey = resolveCanonicalDriverVehicleKey(driver, matchedCar);
  if (normalizedSelected.has(resolvedKey) || normalizedSelected.has(canonicalKey)) {
    return true;
  }

  const matchedTier = findMatchedVehicleTier(driver, matchedCar, vehicleTiers);
  const candidateTokens = [
    matchedTier?.id,
    matchedCar?.vehicleTypeId,
    driver.vehicleTypeId,
    driver.tier,
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);

  for (const tok of candidateTokens) {
    if (normalizedSelected.has(tok) || normalizedSelected.has(normalizeTierToken(tok))) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the multi-select option catalog with live driver counts for `Vehicles ▾` HUD popover.
 * Strictly uses active Admin `VehicleTierConfig` entries (preserving configured order & `v.name`)
 * when present, falling back to `CANONICAL_VEHICLE_TYPE_OPTIONS` only when `vehicleTiers` is empty/null.
 */
export function buildVehicleTypeFilterOptions(
  fleet: readonly DriverVehicleFilterTarget[],
  fleetCars?: FleetCarConfig[] | null,
  vehicleTiers?: VehicleTierConfig[] | null
): VehicleTypeFilterOption[] {
  const activeTiers = getActiveAdminVehicleTiers(vehicleTiers);
  const optionsMap = new Map<string, VehicleTypeFilterOption>();

  if (activeTiers.length > 0) {
    for (const tier of activeTiers) {
      const key = tier.id.trim().toLowerCase();
      if (!key || optionsMap.has(key)) continue;
      optionsMap.set(key, {
        key,
        label: tier.name || tier.id,
        totalDriversCount: 0,
        onShiftDriversCount: 0,
      });
    }
  } else {
    for (const item of CANONICAL_VEHICLE_TYPE_OPTIONS) {
      optionsMap.set(item.key, {
        key: item.key,
        label: item.label,
        totalDriversCount: 0,
        onShiftDriversCount: 0,
      });
    }
  }

  for (const drv of fleet) {
    if (drv.isBlacklisted) continue;
    const key = resolveDriverVehicleTypeKey(drv, fleetCars, activeTiers.length > 0 ? activeTiers : null);
    let entry = optionsMap.get(key);
    if (!entry && activeTiers.length === 0) {
      entry = {
        key,
        label: key.toUpperCase(),
        totalDriversCount: 0,
        onShiftDriversCount: 0,
      };
      optionsMap.set(key, entry);
    }
    if (!entry) continue;
    entry.totalDriversCount += 1;
    if (drv.mapStatus && drv.mapStatus !== 'offline') {
      entry.onShiftDriversCount += 1;
    }
  }

  return Array.from(optionsMap.values());
}

/**
 * Generates a crisp top-down SVG car icon color-coded by fleet status,
 * rotated by GPS heading, with an always-upright cab number badge below.
 */
export function buildFleetCarMarkerDataUrl(options: {
  status: LiveDriverMapStatus;
  cabLabel: string;
  heading?: number;
  isStale?: boolean;
  isSelected?: boolean;
}): string {
  const { status, cabLabel, heading = 0, isStale = false, isSelected = false } = options;
  // Quantize heading to 10-degree steps for high cache hit rate
  const roundedHeading = (((Math.round(heading / 10) * 10) % 360) + 360) % 360;
  const safeCab = (cabLabel || 'CAB').replace(/[^a-zA-Z0-9#\-]/g, '').slice(0, 6);
  const cacheKey = `${status}|${safeCab}|${roundedHeading}|${isStale ? 1 : 0}|${isSelected ? 1 : 0}`;

  const cached = svgIconCache.get(cacheKey);
  if (cached) return cached;

  const palette = FLEET_STATUS_COLORS[status];
  const fill = palette.hex;
  const dark = palette.darkHex;
  const ring = palette.ringHex;
  const opacity = status === 'offline' ? 0.65 : isStale ? 0.78 : 1;
  const badgeBg = isSelected ? '#0f172a' : '#1e293b';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="66" viewBox="0 0 56 66">
  <defs>
    <filter id="s" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" flood-color="#0f172a" flood-opacity="0.45"/>
    </filter>
  </defs>
  <g opacity="${opacity}">
    ${isSelected ? `<circle cx="28" cy="25" r="22" fill="${fill}" fill-opacity="0.22" stroke="${fill}" stroke-width="2.5"/>` : ''}
    <circle cx="28" cy="25" r="17.5" fill="#ffffff" fill-opacity="0.92" stroke="${fill}" stroke-width="${isSelected ? '3' : '2.2'}" ${isStale ? 'stroke-dasharray="4 3"' : ''} filter="url(#s)"/>
    <g transform="rotate(${roundedHeading} 28 25)">
      <!-- Directional nose indicator -->
      <polygon points="28,6.5 24.5,11 31.5,11" fill="${dark}"/>
      <!-- Top-down car chassis -->
      <rect x="20.5" y="12.5" width="15" height="25" rx="4.5" fill="${fill}" stroke="${dark}" stroke-width="1.2"/>
      <!-- Front windshield -->
      <path d="M22.2 18.5 Q28 16.5 33.8 18.5 L33 22.2 Q28 21 23 22.2 Z" fill="#e2e8f0" fill-opacity="0.92"/>
      <!-- Rear glass -->
      <path d="M23 30.2 Q28 31.2 33 30.2 L33.5 33.2 Q28 34.4 22.5 33.2 Z" fill="#cbd5e1" fill-opacity="0.82"/>
      <!-- Roof & taxi light -->
      <rect x="23.5" y="23.2" width="9" height="6" rx="1.8" fill="${ring}" fill-opacity="0.9"/>
      <rect x="25.5" y="25" width="5" height="2.2" rx="0.8" fill="#ffffff"/>
      <!-- Headlights -->
      <rect x="22" y="13.2" width="2.8" height="1.5" rx="0.6" fill="#fef08a"/>
      <rect x="31.2" y="13.2" width="2.8" height="1.5" rx="0.6" fill="#fef08a"/>
    </g>
    <!-- Upright cab number pill -->
    <rect x="9" y="46" width="38" height="16" rx="8" fill="${badgeBg}" stroke="${fill}" stroke-width="1.8" filter="url(#s)"/>
    <text x="28" y="57.2" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9.5" font-weight="800" fill="#ffffff">${safeCab}</text>
  </g>
</svg>`;

  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  if (svgIconCache.size > 400) {
    svgIconCache.clear();
  }
  svgIconCache.set(cacheKey, url);
  return url;
}

export function extractCabShortLabel(driver: LiveFleetDriver): string {
  if (driver.cabNumber) {
    return driver.cabNumber.startsWith('#') ? driver.cabNumber : `#${driver.cabNumber}`;
  }
  const m = (driver.vehicle || '').match(/#?(\d+)/);
  if (m) return `#${m[1]}`;
  return (driver.firstName || driver.name || 'CAB').slice(0, 5).toUpperCase();
}

export function computeHaversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatLastSeen(seconds: number | null): string {
  if (seconds === null) return 'No GPS';
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
