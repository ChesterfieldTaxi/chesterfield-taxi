import type { GeoPoint, Trip, TripStatus } from '../types/trip';
import type { DriverMeterExtra } from '../types/driver';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { summarizeTripStopProgress } from '../services/driver/driver-stop-progress';

export type DriverTab = 'active' | 'offers' | 'earnings' | 'scheduled' | 'schedule';
export type PreferredNavApp = 'google' | 'apple' | 'waze';

export interface RideFareSnapshot {
  isQuotedLocked: boolean;
  baseRideFare: number;
  tollsTotal: number;
  nonTollExtrasTotal: number;
  subtotalFare: number;
  tariffName: string;
}

export interface LastStepUndoState {
  tripId: string;
  previousStatus: TripStatus;
  toLabel: string;
  fromLabel: string;
}

export interface MultiStopNavigationResult {
  url: string;
  mode: 'full_waypoints' | 'next_leg';
  targetLabel: string;
}

export function formatCabUnitLabel(vehicleUnit?: string | null): string {
  const raw = (vehicleUnit || '').trim();
  if (!raw) return 'No Car Assigned';
  if (/^car\s*#/i.test(raw)) return raw;
  if (/^cab\s*#/i.test(raw)) return raw.replace(/^cab\s*#/i, 'Car #');
  if (/^#/.test(raw)) return `Car ${raw}`;
  return `Car #${raw}`;
}

function hasValidFiniteCoords(coords?: GeoPoint | null): coords is GeoPoint {
  return Boolean(
    coords &&
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng)
  );
}

/**
 * Formats a navigation endpoint target, preferring finite `"lat,lng"` coordinates
 * when available and falling back to trimmed `address`.
 */
export function formatNavTarget(address?: string, coords?: GeoPoint | null): string {
  if (hasValidFiniteCoords(coords)) {
    return `${coords.lat},${coords.lng}`;
  }
  return (address || '').trim();
}

/**
 * Pure, SSR-safe single-point navigation URL builder for Google Maps, Apple Maps, and Waze.
 */
export function buildSinglePointNavigationUrl(
  address: string,
  app: PreferredNavApp = 'google',
  coords?: GeoPoint | null
): string {
  const trimmedAddress = (address || '').trim();
  const hasCoords = hasValidFiniteCoords(coords);
  if (!trimmedAddress && !hasCoords) return '';

  const destination = formatNavTarget(trimmedAddress, coords);
  const encodedDest = encodeURIComponent(destination);
  const encodedAddr = encodeURIComponent(trimmedAddress || destination);

  if (app === 'apple') {
    return hasCoords
      ? `https://maps.apple.com/?daddr=${encodedDest}&dirflg=d`
      : `https://maps.apple.com/?daddr=${encodedAddr}&dirflg=d`;
  }

  if (app === 'waze') {
    return hasCoords
      ? `https://waze.com/ul?ll=${encodedDest}&navigate=yes`
      : `https://waze.com/ul?q=${encodedAddr}&navigate=yes`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}&travelmode=driving`;
}

export function openMapNavigation(
  address: string,
  app: PreferredNavApp = 'google',
  coords?: GeoPoint | null
): void {
  const url = buildSinglePointNavigationUrl(address, app, coords);
  if (!url || typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Pure, SSR-safe multi-stop & active-leg navigation URL builder:
 * - Google Maps (`app === 'google'`): builds full `&waypoints=` URLs (`Pickup|Stop1..N -> Dropoff`
 *   before `in_progress`, or `RemainingStops -> Dropoff` during `in_progress`).
 * - Apple Maps (`app === 'apple'`) & Waze (`app === 'waze'`): resolves the next active leg
 *   (`Pickup` before `in_progress`, first uncompleted `Stop #k` during `in_progress`, or `Destination`).
 */
export function buildMultiStopNavigationUrl(params: {
  trip: Trip;
  app: PreferredNavApp;
  completedStopIndices?: ReadonlySet<number>;
}): MultiStopNavigationResult {
  const { trip, app, completedStopIndices } = params;
  const effectiveCompleted =
    completedStopIndices ?? summarizeTripStopProgress(trip).completedIndicesSet;

  const rawStops = Array.isArray(trip?.intermediateStops) ? trip.intermediateStops : [];
  const validStops: Array<{
    stopIndex: number;
    displayNumber: number;
    address: string;
    coordinates?: GeoPoint;
    target: string;
  }> = [];

  rawStops.forEach((stop, stopIndex) => {
    const target = formatNavTarget(stop?.address, stop?.coordinates);
    if (!target) return;
    validStops.push({
      stopIndex,
      displayNumber: validStops.length + 1,
      address: (stop?.address || '').trim(),
      coordinates: stop?.coordinates,
      target,
    });
  });

  const remainingStops = validStops.filter((s) => !effectiveCompleted.has(s.stopIndex));
  const isInProgress = trip?.status === 'in_progress';

  if (app === 'apple' || app === 'waze') {
    if (!isInProgress) {
      return {
        url: buildSinglePointNavigationUrl(
          trip?.pickupLocation?.address || '',
          app,
          trip?.pickupLocation?.coordinates
        ),
        mode: 'next_leg',
        targetLabel: 'Pickup',
      };
    }

    if (remainingStops.length > 0) {
      const nextStop = remainingStops[0];
      return {
        url: buildSinglePointNavigationUrl(
          nextStop.address,
          app,
          nextStop.coordinates
        ),
        mode: 'next_leg',
        targetLabel: `Stop #${nextStop.displayNumber}`,
      };
    }

    return {
      url: buildSinglePointNavigationUrl(
        trip?.dropoffLocation?.address || '',
        app,
        trip?.dropoffLocation?.coordinates
      ),
      mode: 'next_leg',
      targetLabel: 'Destination',
    };
  }

  // Google Maps (`app === 'google'`)
  const pickupTarget = formatNavTarget(
    trip?.pickupLocation?.address,
    trip?.pickupLocation?.coordinates
  );
  const dropoffTarget = formatNavTarget(
    trip?.dropoffLocation?.address,
    trip?.dropoffLocation?.coordinates
  );

  if (!dropoffTarget) {
    return {
      url: pickupTarget
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pickupTarget)}&travelmode=driving`
        : '',
      mode: 'full_waypoints',
      targetLabel: pickupTarget ? 'Pickup' : 'Route',
    };
  }

  const baseGoogleUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    dropoffTarget
  )}&travelmode=driving`;

  if (!isInProgress) {
    const preTripWaypoints = [pickupTarget, ...validStops.map((s) => s.target)].filter(Boolean);
    const url =
      preTripWaypoints.length > 0
        ? `${baseGoogleUrl}&waypoints=${encodeURIComponent(preTripWaypoints.join('|'))}`
        : baseGoogleUrl;
    return {
      url,
      mode: 'full_waypoints',
      targetLabel:
        validStops.length > 0
          ? `Full Route (${validStops.length} ${validStops.length === 1 ? 'Stop' : 'Stops'})`
          : 'Full Route',
    };
  }

  if (remainingStops.length > 0) {
    const remainingTargets = remainingStops.map((s) => s.target);
    return {
      url: `${baseGoogleUrl}&waypoints=${encodeURIComponent(remainingTargets.join('|'))}`,
      mode: 'full_waypoints',
      targetLabel:
        remainingStops.length === 1
          ? `Stop #${remainingStops[0].displayNumber} → Destination`
          : `${remainingStops.length} Stops → Destination`,
    };
  }

  return {
    url: baseGoogleUrl,
    mode: 'full_waypoints',
    targetLabel: 'Destination',
  };
}

export function openTripRouteNavigation(
  trip: Trip,
  app: PreferredNavApp = 'google',
  completedStopIndices?: ReadonlySet<number>
): void {
  const { url } = buildMultiStopNavigationUrl({
    trip,
    app,
    completedStopIndices,
  });
  if (!url || typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Decision #2: Determines whether a trip has a locked upfront quoted/flat fare
 * vs a live GPS-metered walk-up ride.
 */
export function isTripQuotedLocked(trip: Trip | null): boolean {
  if (!trip) return true;
  const meta = (trip.metadata || {}) as Record<string, any>;
  if (meta.isWalkupMetered === true || meta.billingMode === 'metered') return false;
  if (
    trip.pricing?.matchedCorridorId ||
    meta.manualFareOverride != null ||
    (trip.pricing?.totalFare && trip.pricing.totalFare > 0)
  ) {
    return true;
  }
  return false;
}

/**
 * Splits a trip's in-cab driver extras cleanly into 100%-reimbursed tolls vs commissionable non-toll extras.
 */
export function splitDriverExtras(trip: Trip | null): {
  extras: DriverMeterExtra[];
  tollsTotal: number;
  nonTollExtrasTotal: number;
  allDriverExtrasTotal: number;
} {
  const raw = (trip?.pricing?.driverExtras || trip?.meterExtras || []) as DriverMeterExtra[];
  const tollsTotal = Number(
    raw
      .filter((e) => e.category === 'toll')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
      .toFixed(2)
  );
  const nonTollExtrasTotal = Number(
    raw
      .filter((e) => e.category !== 'toll')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
      .toFixed(2)
  );
  return {
    extras: raw,
    tollsTotal,
    nonTollExtrasTotal,
    allDriverExtrasTotal: Number((tollsTotal + nonTollExtrasTotal).toFixed(2)),
  };
}

export function maskPhoneForDisplay(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return 'Masked';
  return `(•••) •••-${digits.slice(-4)}`;
}

export function formatStepLabel(status: TripStatus): string {
  switch (status) {
    case 'assigned':
    case 'accepted':
      return 'Assigned';
    case 'en_route':
      return 'En Route';
    case 'arrived':
      return 'Arrived';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    default:
      return String(status).replace(/_/g, ' ');
  }
}

export function formatTimer(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function resolveCallPassengerHref(trip: Trip): { href: string; isMasked: boolean } {
  const hasDistinctProxy =
    Boolean(trip.proxyNumber) &&
    trip.proxyNumber !== COMPANY_CONFIG.phone.primaryRaw &&
    trip.proxyNumber !== COMPANY_CONFIG.phone.dispatch;
  if (hasDistinctProxy && trip.proxyNumber) {
    return { href: `tel:${trip.proxyNumber}`, isMasked: true };
  }
  return {
    href: `tel:${trip.passenger?.phone || COMPANY_CONFIG.phone.primaryRaw}`,
    isMasked: false,
  };
}
