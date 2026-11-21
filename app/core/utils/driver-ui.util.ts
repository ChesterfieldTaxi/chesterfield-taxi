import type { GeoPoint, Trip, TripStatus } from '../types/trip';
import type { DriverMeterExtra } from '../types/driver';
import { COMPANY_CONFIG } from '../../config/companyConfig';

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

export function formatCabUnitLabel(vehicleUnit?: string | null): string {
  const raw = (vehicleUnit || '').trim();
  if (!raw) return 'No Car Assigned';
  if (/^car\s*#/i.test(raw)) return raw;
  if (/^cab\s*#/i.test(raw)) return raw.replace(/^cab\s*#/i, 'Car #');
  if (/^#/.test(raw)) return `Car ${raw}`;
  return `Car #${raw}`;
}

export function openMapNavigation(
  address: string,
  app: PreferredNavApp = 'google',
  coords?: GeoPoint | null
) {
  if (!address && !coords) return;
  const hasCoords =
    coords &&
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng);

  const destination = hasCoords ? `${coords.lat},${coords.lng}` : address;
  const encodedDest = encodeURIComponent(destination);
  const encodedAddr = encodeURIComponent(address || destination);

  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}&travelmode=driving`;
  if (app === 'apple') {
    url = hasCoords
      ? `https://maps.apple.com/?daddr=${encodedDest}&dirflg=d`
      : `https://maps.apple.com/?daddr=${encodedAddr}&dirflg=d`;
  } else if (app === 'waze') {
    url = hasCoords
      ? `https://waze.com/ul?ll=${encodedDest}&navigate=yes`
      : `https://waze.com/ul?q=${encodedAddr}&navigate=yes`;
  }
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
