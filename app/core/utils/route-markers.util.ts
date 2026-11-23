import type { Trip, TripLocation } from '../types/trip';

export type RouteWaypointKind = 'pickup' | 'stop' | 'dropoff';

export interface RouteWaypointPaletteEntry {
  fill: string;
  border: string;
  badgeBgClass: string;
  badgeTextClass: string;
  badgeBorderClass: string;
  dotClass: string;
}

/**
 * Canonical route waypoint color language aligned with `DispatchLocationInput.tsx`:
 * - Pickup  = Emerald (`#10b981` / border `#047857`)
 * - Stop    = Amber/Orange (`#f59e0b` / border `#b45309`)
 * - Dropoff = Rose/Red (`#ef4444` / border `#b91c1c`)
 */
export const ROUTE_WAYPOINT_PALETTE: Record<RouteWaypointKind, RouteWaypointPaletteEntry> = {
  pickup: {
    fill: '#10b981',
    border: '#047857',
    badgeBgClass: 'bg-emerald-50',
    badgeTextClass: 'text-emerald-900',
    badgeBorderClass: 'border-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  stop: {
    fill: '#f59e0b',
    border: '#b45309',
    badgeBgClass: 'bg-amber-50',
    badgeTextClass: 'text-amber-900',
    badgeBorderClass: 'border-amber-300',
    dotClass: 'bg-amber-500',
  },
  dropoff: {
    fill: '#ef4444',
    border: '#b91c1c',
    badgeBgClass: 'bg-rose-50',
    badgeTextClass: 'text-rose-900',
    badgeBorderClass: 'border-rose-300',
    dotClass: 'bg-rose-500',
  },
};

export const ROUTE_WAYPOINT_PIN_WIDTH = 34;
export const ROUTE_WAYPOINT_PIN_HEIGHT = 42;
export const ROUTE_WAYPOINT_PIN_ANCHOR_X = 17;
export const ROUTE_WAYPOINT_PIN_ANCHOR_Y = 40;

const waypointPinDataUrlCache = new Map<string, string>();

export interface BuildRouteWaypointPinOptions {
  kind: RouteWaypointKind;
  stopNumber?: number;
  isSelected?: boolean;
}

/**
 * Generates a memoized, crisp Teardrop SVG Map Pin (`34x42`, bottom tip anchored at `(17, 40)`)
 * visually distinct from the circular top-down Fleet Car icons:
 * - `pickup` (`#10b981`): inner white circle dot.
 * - `stop` (`#f59e0b`): bold centered white stop number (`1`, `2`, `3`, ...).
 * - `dropoff` (`#ef4444`): inner white rounded square destination glyph.
 * - `isSelected`: renders a subtle outer halo ring around the pin head.
 */
export function buildRouteWaypointPinDataUrl(options: BuildRouteWaypointPinOptions): string {
  const { kind, stopNumber, isSelected = false } = options;
  const normalizedStopNumber =
    kind === 'stop'
      ? typeof stopNumber === 'number' && Number.isFinite(stopNumber)
        ? Math.max(1, Math.min(99, Math.floor(stopNumber)))
        : 1
      : 0;

  const cacheKey = `${kind}|${normalizedStopNumber}|${isSelected ? 1 : 0}`;
  const cached = waypointPinDataUrlCache.get(cacheKey);
  if (cached) return cached;

  const palette = ROUTE_WAYPOINT_PALETTE[kind] || ROUTE_WAYPOINT_PALETTE.pickup;
  const stopLabel = String(normalizedStopNumber).replace(/[^0-9]/g, '') || '1';
  const fontSize = stopLabel.length >= 2 ? '10' : '11.5';

  const innerGlyph =
    kind === 'pickup'
      ? `<circle cx="17" cy="16" r="4.8" fill="#ffffff"/>`
      : kind === 'stop'
      ? `<circle cx="17" cy="16" r="7.8" fill="${palette.border}" fill-opacity="0.28"/><text x="17" y="19.8" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff">${stopLabel}</text>`
      : `<rect x="12.5" y="11.5" width="9" height="9" rx="2.1" fill="#ffffff"/>`;

  const selectedHalo = isSelected
    ? `<circle cx="17" cy="16" r="15.2" fill="${palette.fill}" fill-opacity="0.24" stroke="${palette.fill}" stroke-width="1.8"/>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ROUTE_WAYPOINT_PIN_WIDTH}" height="${ROUTE_WAYPOINT_PIN_HEIGHT}" viewBox="0 0 34 42">
  <defs>
    <filter id="wpShadow" x="-25%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.42"/>
    </filter>
  </defs>
  <g>
    ${selectedHalo}
    <path d="M 17 4 C 10.37 4 5 9.37 5 16 C 5 24.6 15.2 37.2 17 40 C 18.8 37.2 29 24.6 29 16 C 29 9.37 23.63 4 17 4 Z" fill="${palette.fill}" stroke="#ffffff" stroke-width="${isSelected ? '2.6' : '2.1'}" stroke-linejoin="round" filter="url(#wpShadow)"/>
    <circle cx="17" cy="16" r="10.1" fill="none" stroke="${palette.border}" stroke-width="1.1" stroke-opacity="0.65"/>
    ${innerGlyph}
  </g>
</svg>`;

  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  if (waypointPinDataUrlCache.size >= 256) {
    waypointPinDataUrlCache.clear();
  }
  waypointPinDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Filters `trip.intermediateStops` to entries with a non-empty trimmed street/venue address.
 */
export function getTripIntermediateStops(
  trip: Pick<Trip, 'intermediateStops'> | null | undefined
): TripLocation[] {
  if (!trip || !Array.isArray(trip.intermediateStops)) return [];
  return trip.intermediateStops.filter(
    (stop): stop is TripLocation =>
      Boolean(stop && typeof stop.address === 'string' && stop.address.trim().length > 0)
  );
}

/**
 * Resolves the intermediate stop count for a trip, preferring concrete `intermediateStops`
 * and falling back to `trip.pricing.intermediateStopsCount` when only summary metadata exists.
 */
export function getTripIntermediateStopCount(
  trip: Pick<Trip, 'intermediateStops' | 'pricing'> | null | undefined
): number {
  const concreteCount = getTripIntermediateStops(trip).length;
  if (concreteCount > 0) return concreteCount;
  const summaryCount = trip?.pricing?.intermediateStopsCount;
  if (typeof summaryCount === 'number' && Number.isFinite(summaryCount) && summaryCount > 0) {
    return Math.floor(summaryCount);
  }
  return 0;
}

/**
 * Produces a concise street or venue preview prior to the city/state comma
 * (e.g., `"Chesterfield Mall, 291 Chesterfield Center, Chesterfield, MO"` -> `"Chesterfield Mall"`).
 */
export function formatShortStopPreview(address: string, maxChars = 28): string {
  if (typeof address !== 'string') return '';
  const trimmed = address.trim();
  if (!trimmed) return '';
  const primarySegment = trimmed.split(',')[0].replace(/\s+/g, ' ').trim();
  if (!primarySegment) return '';
  if (primarySegment.length <= maxChars) return primarySegment;
  return `${primarySegment.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/**
 * Builds a multi-line ordered itinerary tooltip (`Pickup: ...` -> `Stop 1..N: ...` -> `Dropoff: ...`).
 */
export function buildTripItineraryTooltip(
  trip: Pick<Trip, 'pickupLocation' | 'intermediateStops' | 'dropoffLocation'>
): string {
  const pickupAddr = trip.pickupLocation?.address?.trim() || 'Unspecified Pickup';
  const dropoffAddr = trip.dropoffLocation?.address?.trim() || 'Unspecified Dropoff';
  const stops = getTripIntermediateStops(trip);

  const lines: string[] = [`Pickup: ${pickupAddr}`];
  stops.forEach((stop, index) => {
    lines.push(`Stop ${index + 1}: ${stop.address.trim()}`);
  });
  lines.push(`Dropoff: ${dropoffAddr}`);
  return lines.join('\n');
}
