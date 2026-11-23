/// <reference types="google.maps" />

import type { GeoPoint, Trip, TripLocation } from '../../../../core/types/trip';
import { resolveMockCoordinates } from '../../../../core/services/maps/mock-routing';
import {
  ROUTE_WAYPOINT_PIN_ANCHOR_X,
  ROUTE_WAYPOINT_PIN_ANCHOR_Y,
  ROUTE_WAYPOINT_PIN_HEIGHT,
  ROUTE_WAYPOINT_PIN_WIDTH,
  buildRouteWaypointPinDataUrl,
  getTripIntermediateStops,
  type RouteWaypointKind,
} from '../../../../core/utils/route-markers.util';

export interface ResolvedRouteWaypoint {
  id: string;
  kind: RouteWaypointKind;
  stopNumber?: number;
  badgeLabel: string;
  address: string;
  notes?: string;
  coordinates: GeoPoint;
}

export interface ResolvedRouteMetrics {
  distanceMiles: number;
  durationMinutes: number;
}

export interface ActiveRouteContext {
  source: 'selected_trip' | 'draft_form' | 'active_trip';
  tripId?: string;
  passengerLabel?: string;
  originInput: GeoPoint | string;
  destinationInput: GeoPoint | string;
  waypointInputs: Array<{ location: GeoPoint | string; stopover: boolean }>;
  waypoints: ResolvedRouteWaypoint[];
  stopCount: number;
  fallbackMetrics: ResolvedRouteMetrics | null;
  signature: string;
}

export interface RoutePolylineHandles {
  casingPolyline: google.maps.Polyline | null;
  mainPolyline: google.maps.Polyline | null;
}

function isValidGeoPoint(pt?: GeoPoint | null): pt is GeoPoint {
  return Boolean(
    pt &&
      typeof pt.lat === 'number' &&
      typeof pt.lng === 'number' &&
      Number.isFinite(pt.lat) &&
      Number.isFinite(pt.lng) &&
      !(pt.lat === 0 && pt.lng === 0)
  );
}

function combineLocationNotes(...parts: Array<string | undefined | null>): string | undefined {
  const unique: string[] = [];
  for (const part of parts) {
    const trimmed = typeof part === 'string' ? part.trim() : '';
    if (trimmed && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique.length > 0 ? unique.join(' • ') : undefined;
}

function locSignatureToken(val: GeoPoint | string | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val.lat === 'number' && typeof val.lng === 'number') {
    return `${val.lat.toFixed(5)},${val.lng.toFixed(5)}`;
  }
  return String(val);
}

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
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

export function estimateFallbackRouteMetrics(
  waypoints: ResolvedRouteWaypoint[],
  explicitMiles?: number,
  explicitMinutes?: number
): ResolvedRouteMetrics | null {
  if (
    typeof explicitMiles === 'number' &&
    explicitMiles > 0 &&
    typeof explicitMinutes === 'number' &&
    explicitMinutes > 0
  ) {
    return {
      distanceMiles: Number(explicitMiles.toFixed(1)),
      durationMinutes: Math.max(1, Math.round(explicitMinutes)),
    };
  }
  if (waypoints.length < 2) return null;
  let straightMiles = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    straightMiles += haversineMiles(waypoints[i].coordinates, waypoints[i + 1].coordinates);
  }
  const roadMiles = Math.max(0.4, straightMiles * 1.24);
  const estMinutes = Math.max(2, Math.round((roadMiles / 28) * 60));
  return {
    distanceMiles: Number(roadMiles.toFixed(1)),
    durationMinutes: estMinutes,
  };
}

function buildWaypointsFromTrip(trip: Trip): {
  originInput: GeoPoint | string;
  destinationInput: GeoPoint | string;
  waypointInputs: Array<{ location: GeoPoint | string; stopover: boolean }>;
  waypoints: ResolvedRouteWaypoint[];
} {
  const pickupLoc = trip.pickupLocation;
  const dropoffLoc = trip.dropoffLocation;
  const stops: TripLocation[] = getTripIntermediateStops(trip);

  const originInput: GeoPoint | string = isValidGeoPoint(pickupLoc.coordinates)
    ? pickupLoc.coordinates
    : pickupLoc.address;
  const destinationInput: GeoPoint | string = isValidGeoPoint(dropoffLoc.coordinates)
    ? dropoffLoc.coordinates
    : dropoffLoc.address;

  const waypointInputs = stops.map((s) => ({
    location: isValidGeoPoint(s.coordinates) ? s.coordinates : s.address,
    stopover: true,
  }));

  const waypoints: ResolvedRouteWaypoint[] = [
    {
      id: 'pickup',
      kind: 'pickup',
      badgeLabel: 'Pickup',
      address: pickupLoc.address.trim(),
      notes: combineLocationNotes(
        pickupLoc.unitOrApt ? `Unit/Apt: ${pickupLoc.unitOrApt}` : undefined,
        pickupLoc.notes,
        pickupLoc.flightNotes || trip.flightNotes,
        pickupLoc.driverNotes || trip.driverNotes
      ),
      coordinates: isValidGeoPoint(pickupLoc.coordinates)
        ? pickupLoc.coordinates
        : resolveMockCoordinates(pickupLoc.address),
    },
    ...stops.map((stop, idx) => ({
      id: `stop-${idx + 1}`,
      kind: 'stop' as const,
      stopNumber: idx + 1,
      badgeLabel: `Stop #${idx + 1}`,
      address: stop.address.trim(),
      notes: combineLocationNotes(
        stop.unitOrApt ? `Unit/Apt: ${stop.unitOrApt}` : undefined,
        stop.notes,
        stop.driverNotes
      ),
      coordinates: isValidGeoPoint(stop.coordinates)
        ? stop.coordinates
        : resolveMockCoordinates(stop.address),
    })),
    {
      id: 'dropoff',
      kind: 'dropoff',
      badgeLabel: 'Dropoff',
      address: dropoffLoc.address.trim(),
      notes: combineLocationNotes(
        dropoffLoc.unitOrApt ? `Unit/Apt: ${dropoffLoc.unitOrApt}` : undefined,
        dropoffLoc.notes,
        dropoffLoc.driverNotes
      ),
      coordinates: isValidGeoPoint(dropoffLoc.coordinates)
        ? dropoffLoc.coordinates
        : resolveMockCoordinates(dropoffLoc.address),
    },
  ];

  return { originInput, destinationInput, waypointInputs, waypoints };
}

/**
 * Resolves the active route context from `selectedTrip`, `activeFormValues`, or `activeTrip`
 * with a deterministic signature so Google Directions only re-queries when locations change.
 */
export function resolveActiveRouteContext(params: {
  selectedTrip?: Trip | null;
  activeFormValues?: any;
  activeTrip?: Trip | null;
  shouldZoom?: boolean;
}): ActiveRouteContext | null {
  const { selectedTrip, activeFormValues, activeTrip, shouldZoom = false } = params;

  if (selectedTrip?.pickupLocation?.address?.trim() && selectedTrip?.dropoffLocation?.address?.trim()) {
    const built = buildWaypointsFromTrip(selectedTrip);
    const passengerName = `${selectedTrip.passenger?.firstName || ''} ${
      selectedTrip.passenger?.lastName || ''
    }`.trim();
    const signature = [
      'selected',
      selectedTrip.id,
      locSignatureToken(built.originInput),
      locSignatureToken(built.destinationInput),
      built.waypointInputs.map((w) => locSignatureToken(w.location)).join('|'),
      shouldZoom ? '1' : '0',
    ].join('=>');

    return {
      source: 'selected_trip',
      tripId: selectedTrip.id,
      passengerLabel: passengerName || undefined,
      ...built,
      stopCount: Math.max(0, built.waypoints.length - 2),
      fallbackMetrics: estimateFallbackRouteMetrics(
        built.waypoints,
        selectedTrip.pricing?.distanceMiles,
        selectedTrip.pricing?.durationMinutes
      ),
      signature,
    };
  }

  if (activeFormValues?.pickupAddress?.trim() && activeFormValues?.dropoffAddress?.trim()) {
    const pickupAddr = String(activeFormValues.pickupAddress).trim();
    const dropoffAddr = String(activeFormValues.dropoffAddress).trim();
    const rawStops: Array<any> = Array.isArray(activeFormValues.intermediateStops)
      ? activeFormValues.intermediateStops.filter(
          (s: any) => typeof s?.address === 'string' && s.address.trim().length > 0
        )
      : [];

    const originInput: GeoPoint | string = isValidGeoPoint(activeFormValues.pickupCoordinates)
      ? activeFormValues.pickupCoordinates
      : pickupAddr;
    const destinationInput: GeoPoint | string = isValidGeoPoint(activeFormValues.dropoffCoordinates)
      ? activeFormValues.dropoffCoordinates
      : dropoffAddr;
    const waypointInputs = rawStops.map((s) => ({
      location: isValidGeoPoint(s.coordinates) ? s.coordinates : String(s.address).trim(),
      stopover: true,
    }));

    const waypoints: ResolvedRouteWaypoint[] = [
      {
        id: 'pickup',
        kind: 'pickup',
        badgeLabel: 'Pickup',
        address: pickupAddr,
        notes: combineLocationNotes(activeFormValues.notesForAll),
        coordinates: isValidGeoPoint(activeFormValues.pickupCoordinates)
          ? activeFormValues.pickupCoordinates
          : resolveMockCoordinates(pickupAddr),
      },
      ...rawStops.map((s, idx) => {
        const addr = String(s.address).trim();
        return {
          id: `stop-${idx + 1}`,
          kind: 'stop' as const,
          stopNumber: idx + 1,
          badgeLabel: `Stop #${idx + 1}`,
          address: addr,
          notes: combineLocationNotes(s.notes),
          coordinates: isValidGeoPoint(s.coordinates)
            ? s.coordinates
            : resolveMockCoordinates(addr),
        };
      }),
      {
        id: 'dropoff',
        kind: 'dropoff',
        badgeLabel: 'Dropoff',
        address: dropoffAddr,
        coordinates: isValidGeoPoint(activeFormValues.dropoffCoordinates)
          ? activeFormValues.dropoffCoordinates
          : resolveMockCoordinates(dropoffAddr),
      },
    ];

    const signature = [
      'draft',
      locSignatureToken(originInput),
      locSignatureToken(destinationInput),
      waypointInputs.map((w) => locSignatureToken(w.location)).join('|'),
      shouldZoom ? '1' : '0',
    ].join('=>');

    return {
      source: 'draft_form',
      passengerLabel: activeFormValues.passengerName?.trim() || 'Booking Draft',
      originInput,
      destinationInput,
      waypointInputs,
      waypoints,
      stopCount: rawStops.length,
      fallbackMetrics: estimateFallbackRouteMetrics(
        waypoints,
        activeFormValues.estimatedDistanceMiles,
        activeFormValues.estimatedDurationMinutes
      ),
      signature,
    };
  }

  if (activeTrip?.pickupLocation?.address?.trim() && activeTrip?.dropoffLocation?.address?.trim()) {
    const built = buildWaypointsFromTrip(activeTrip);
    const passengerName = `${activeTrip.passenger?.firstName || ''} ${
      activeTrip.passenger?.lastName || ''
    }`.trim();
    const signature = [
      'active',
      activeTrip.id,
      locSignatureToken(built.originInput),
      locSignatureToken(built.destinationInput),
      built.waypointInputs.map((w) => locSignatureToken(w.location)).join('|'),
      shouldZoom ? '1' : '0',
    ].join('=>');

    return {
      source: 'active_trip',
      tripId: activeTrip.id,
      passengerLabel: passengerName || undefined,
      ...built,
      stopCount: Math.max(0, built.waypoints.length - 2),
      fallbackMetrics: estimateFallbackRouteMetrics(
        built.waypoints,
        activeTrip.pricing?.distanceMiles,
        activeTrip.pricing?.durationMinutes
      ),
      signature,
    };
  }

  return null;
}

function latLngToGeoPoint(latLng: google.maps.LatLng | GeoPoint | null | undefined): GeoPoint | null {
  if (!latLng) return null;
  const anyLoc = latLng as any;
  const lat = typeof anyLoc.lat === 'function' ? anyLoc.lat() : anyLoc.lat;
  const lng = typeof anyLoc.lng === 'function' ? anyLoc.lng() : anyLoc.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

/**
 * Extracts snapped waypoint coordinates, full road polyline path, and summed leg metrics
 * from a Google `DirectionsResult`.
 */
export function extractDirectionsRouteSnapshot(
  result: google.maps.DirectionsResult,
  baseWaypoints: ResolvedRouteWaypoint[]
): {
  snappedWaypoints: ResolvedRouteWaypoint[];
  path: GeoPoint[];
  metrics: ResolvedRouteMetrics | null;
} {
  const route = result.routes?.[0];
  if (!route) {
    return {
      snappedWaypoints: baseWaypoints,
      path: baseWaypoints.map((w) => w.coordinates),
      metrics: null,
    };
  }

  const legs = route.legs || [];
  const snappedWaypoints = baseWaypoints.map((wp, idx) => {
    if (legs.length === 0) return wp;
    if (idx === 0) {
      const startPt = latLngToGeoPoint(legs[0]?.start_location);
      return startPt ? { ...wp, coordinates: startPt } : wp;
    }
    if (idx === baseWaypoints.length - 1) {
      const endPt = latLngToGeoPoint(legs[legs.length - 1]?.end_location);
      return endPt ? { ...wp, coordinates: endPt } : wp;
    }
    // Intermediate stop idx (1..N) corresponds to legs[idx - 1].end_location
    const legEndPt = latLngToGeoPoint(legs[idx - 1]?.end_location);
    return legEndPt ? { ...wp, coordinates: legEndPt } : wp;
  });

  const stepPoints: GeoPoint[] = [];
  for (const leg of legs) {
    for (const step of leg.steps || []) {
      for (const pt of step.path || []) {
        const converted = latLngToGeoPoint(pt);
        if (converted) stepPoints.push(converted);
      }
    }
  }

  const overviewPoints =
    stepPoints.length >= 2
      ? stepPoints
      : (route.overview_path || [])
          .map((pt) => latLngToGeoPoint(pt))
          .filter((pt): pt is GeoPoint => Boolean(pt));

  const totalMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
  const totalSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
  const metrics =
    totalMeters > 0 || totalSeconds > 0
      ? {
          distanceMiles: Number((totalMeters / 1609.344).toFixed(1)),
          durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
        }
      : null;

  return {
    snappedWaypoints,
    path: overviewPoints.length >= 2 ? overviewPoints : snappedWaypoints.map((w) => w.coordinates),
    metrics,
  };
}

export function clearRoutePolylines(handles: RoutePolylineHandles): void {
  if (handles.casingPolyline) {
    try {
      handles.casingPolyline.setMap(null);
    } catch {}
    handles.casingPolyline = null;
  }
  if (handles.mainPolyline) {
    try {
      handles.mainPolyline.setMap(null);
    } catch {}
    handles.mainPolyline = null;
  }
}

/**
 * Synchronizes either a high-contrast outer-cased polyline with periodic travel-direction
 * arrow chevrons (`casedRouteWithArrows === true`) or a clean single blue polyline (`false`).
 */
export function syncRoutePolylines(params: {
  map: google.maps.Map | null;
  handles: RoutePolylineHandles;
  path: GeoPoint[];
  casedRouteWithArrows: boolean;
}): void {
  const { map, handles, path, casedRouteWithArrows } = params;
  if (!map || path.length < 2 || typeof window === 'undefined' || !window.google?.maps?.Polyline) {
    clearRoutePolylines(handles);
    return;
  }

  const gMaps = window.google.maps;

  if (casedRouteWithArrows) {
    if (!handles.casingPolyline) {
      handles.casingPolyline = new gMaps.Polyline({
        path,
        strokeColor: '#1e3a8a',
        strokeWeight: 8,
        strokeOpacity: 0.55,
        zIndex: 40,
        clickable: false,
        map,
      });
    } else {
      handles.casingPolyline.setOptions({
        path,
        strokeColor: '#1e3a8a',
        strokeWeight: 8,
        strokeOpacity: 0.55,
        zIndex: 40,
        clickable: false,
      });
      if (!handles.casingPolyline.getMap()) {
        handles.casingPolyline.setMap(map);
      }
    }

    const arrowIcons: google.maps.IconSequence[] =
      gMaps.SymbolPath?.FORWARD_CLOSED_ARROW !== undefined
        ? [
            {
              icon: {
                path: gMaps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 2.6,
                fillColor: '#ffffff',
                fillOpacity: 1,
                strokeColor: '#1d4ed8',
                strokeWeight: 1.2,
              },
              offset: '48px',
              repeat: '90px',
            },
          ]
        : [];

    if (!handles.mainPolyline) {
      handles.mainPolyline = new gMaps.Polyline({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 4.5,
        strokeOpacity: 0.96,
        zIndex: 41,
        clickable: false,
        icons: arrowIcons,
        map,
      });
    } else {
      handles.mainPolyline.setOptions({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 4.5,
        strokeOpacity: 0.96,
        zIndex: 41,
        clickable: false,
        icons: arrowIcons,
      });
      if (!handles.mainPolyline.getMap()) {
        handles.mainPolyline.setMap(map);
      }
    }
  } else {
    if (handles.casingPolyline) {
      try {
        handles.casingPolyline.setMap(null);
      } catch {}
      handles.casingPolyline = null;
    }

    if (!handles.mainPolyline) {
      handles.mainPolyline = new gMaps.Polyline({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 5,
        strokeOpacity: 0.85,
        zIndex: 41,
        clickable: false,
        icons: [],
        map,
      });
    } else {
      handles.mainPolyline.setOptions({
        path,
        strokeColor: '#2563eb',
        strokeWeight: 5,
        strokeOpacity: 0.85,
        zIndex: 41,
        clickable: false,
        icons: [],
      });
      if (!handles.mainPolyline.getMap()) {
        handles.mainPolyline.setMap(map);
      }
    }
  }
}

export function clearRouteWaypointMarkers(pool: Map<string, google.maps.Marker>): void {
  pool.forEach((marker) => {
    try {
      if (typeof google !== 'undefined' && google?.maps?.event) {
        google.maps.event.clearInstanceListeners(marker);
      }
      marker.setMap(null);
    } catch {}
  });
  pool.clear();
}

/**
 * Synchronizes pooled Green Pickup, Orange Stop `1..N`, and Red Dropoff teardrop SVG pins.
 */
export function syncRouteWaypointMarkers(params: {
  map: google.maps.Map | null;
  pool: Map<string, google.maps.Marker>;
  waypoints: ResolvedRouteWaypoint[];
  selectedWaypointId: string | null;
  interactiveRoutePinPopovers: boolean;
  onSelectWaypoint: (waypointId: string) => void;
}): void {
  const {
    map,
    pool,
    waypoints,
    selectedWaypointId,
    interactiveRoutePinPopovers,
    onSelectWaypoint,
  } = params;

  if (!map || waypoints.length === 0 || typeof window === 'undefined' || !window.google?.maps?.Marker) {
    clearRouteWaypointMarkers(pool);
    return;
  }

  const gMaps = window.google.maps;
  const activeIds = new Set<string>();

  for (const wp of waypoints) {
    activeIds.add(wp.id);
    const isSelected = interactiveRoutePinPopovers && selectedWaypointId === wp.id;
    const icon: google.maps.Icon = {
      url: buildRouteWaypointPinDataUrl({
        kind: wp.kind,
        stopNumber: wp.stopNumber,
        isSelected,
      }),
      scaledSize: new gMaps.Size(ROUTE_WAYPOINT_PIN_WIDTH, ROUTE_WAYPOINT_PIN_HEIGHT),
      anchor: new gMaps.Point(ROUTE_WAYPOINT_PIN_ANCHOR_X, ROUTE_WAYPOINT_PIN_ANCHOR_Y),
    };

    const title = `${wp.badgeLabel}: ${wp.address}${wp.notes ? ` (${wp.notes})` : ''}`;
    const zIndex = isSelected
      ? 480
      : wp.kind === 'pickup'
      ? 435
      : wp.kind === 'dropoff'
      ? 430
      : 410 + (wp.stopNumber || 0);

    const existing = pool.get(wp.id);
    if (existing) {
      existing.setPosition(wp.coordinates);
      existing.setIcon(icon);
      existing.setTitle(title);
      existing.setZIndex(zIndex);
      existing.setClickable(interactiveRoutePinPopovers);
      if (!existing.getMap()) {
        existing.setMap(map);
      }
    } else {
      const marker = new gMaps.Marker({
        position: wp.coordinates,
        map,
        icon,
        title,
        zIndex,
        clickable: interactiveRoutePinPopovers,
        optimized: false,
      });
      marker.addListener('click', () => {
        onSelectWaypoint(wp.id);
      });
      pool.set(wp.id, marker);
    }
  }

  pool.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      try {
        if (typeof google !== 'undefined' && google?.maps?.event) {
          google.maps.event.clearInstanceListeners(marker);
        }
        marker.setMap(null);
      } catch {}
      pool.delete(id);
    }
  });
}
