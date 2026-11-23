/// <reference types="google.maps" />

/**
 * Live Fleet Map & Color-Coded Car Icon Radar
 *
 * Reusable across both the main Dispatch Console (`dispatch.tsx`) and the
 * detached multi-monitor map pop-out (`dispatch.popout.tsx?module=map`).
 *
 * Option C Car Status Palette:
 * - Green  (#10b981): Available (on_duty, ready for dispatch)
 * - Blue   (#2563eb): En Route (heading to pickup)
 * - Red    (#ef4444): Arrived / In Progress (curbside or passenger onboard)
 * - Yellow (#eab308): On Break (light 30s GPS active)
 * - Slate  (#64748b): Offline (hidden by default, toggleable)
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { GeoPoint, Trip } from '../../../core/types/trip';
import type { DriverDutyStatus, LiveDriverMapStatus } from '../../../core/types/driver';
import {
  loadGoogleMaps,
  CHESTERFIELD_CENTER,
  subscribeToGoogleMapsStatus,
  type GoogleMapsStatus,
} from '../../../core/services/maps/google-maps-loader';
import { hasValidRoutePair } from '../../../core/hooks/useDebounceRoute';
import { isRealtimeRoutingEnabled } from '../../../core/services/config/admin-config.service';
import { useDispatchMapPreferences } from '../../../core/hooks/dispatch/useDispatchMapPreferences';
import { getTripIntermediateStopCount } from '../../../core/utils/route-markers.util';
import {
  FLEET_STATUS_COLORS,
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../../../core/hooks/useDispatchFleet';
import { PhoneIcon, CarIcon, MapPinIcon, UsersIcon, XIcon, CheckIcon } from '../../ui/Icons';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';
import { MapRouteOverlayHud } from './map/MapRouteOverlayHud';
import {
  clearRoutePolylines,
  clearRouteWaypointMarkers,
  extractDirectionsRouteSnapshot,
  resolveActiveRouteContext,
  syncRoutePolylines,
  syncRouteWaypointMarkers,
  type ResolvedRouteMetrics,
  type ResolvedRouteWaypoint,
  type RoutePolylineHandles,
} from './map/route-map-sync';

export interface LiveFleetMapProps {
  fleet: LiveFleetDriver[];
  trips?: Trip[];
  activeFormValues?: any;
  activeTrip?: Trip | null;
  selectedTrip?: Trip | null;
  shouldZoom?: boolean;
  focusedDriverId?: string | null;
  onClearFocusedDriver?: () => void;
  onAssignDriverToTrip?: (tripId: string, driverId: string) => void | Promise<void>;
  onOpenDriverQueue?: (driver: LiveFleetDriver) => void;
  onCallDriver?: (phone: string, name?: string) => void;
  onChangeDriverDutyStatus?: (driverId: string, dutyStatus: DriverDutyStatus) => void | Promise<void>;
  onSelectTrip?: (trip: Trip) => void;
  onClearSelectedTrip?: () => void;
  onSwitchToRoster?: () => void;
  className?: string;
}

type MapFilterKey = 'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline';

// Memoized cache for encoded SVG car marker data URLs
const svgIconCache = new Map<string, string>();

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
  const roundedHeading = ((Math.round(heading / 10) * 10) % 360 + 360) % 360;
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

function extractCabShortLabel(driver: LiveFleetDriver): string {
  if (driver.cabNumber) {
    return driver.cabNumber.startsWith('#') ? driver.cabNumber : `#${driver.cabNumber}`;
  }
  const m = (driver.vehicle || '').match(/#?(\d+)/);
  if (m) return `#${m[1]}`;
  return (driver.firstName || driver.name || 'CAB').slice(0, 5).toUpperCase();
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

function formatLastSeen(seconds: number | null): string {
  if (seconds === null) return 'No GPS';
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function LiveFleetMapComponent({
  fleet,
  activeFormValues,
  activeTrip,
  selectedTrip,
  shouldZoom = false,
  focusedDriverId = null,
  onClearFocusedDriver,
  onAssignDriverToTrip,
  onOpenDriverQueue,
  onCallDriver,
  onChangeDriverDutyStatus,
  onSelectTrip,
  onClearSelectedTrip,
  onSwitchToRoster,
  className = '',
}: LiveFleetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const routePolylineHandlesRef = useRef<RoutePolylineHandles>({
    casingPolyline: null,
    mainPolyline: null,
  });
  const routeWaypointMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const markersByIdRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const directionsSeqRef = useRef<number>(0);

  const { preferences: mapPreferences } = useDispatchMapPreferences();
  const [mapReady, setMapReady] = useState(false);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>('loading');
  const [statusFilter, setStatusFilter] = useState<MapFilterKey>('all');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [snappedWaypoints, setSnappedWaypoints] = useState<ResolvedRouteWaypoint[] | null>(null);
  const [routePath, setRoutePath] = useState<GeoPoint[]>([]);
  const [routeMetrics, setRouteMetrics] = useState<ResolvedRouteMetrics | null>(null);
  const [showAwaitingGps, setShowAwaitingGps] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const dismissSelectedDriver = useCallback(() => {
    setSelectedDriverId(null);
    onClearFocusedDriver?.();
  }, [onClearFocusedDriver]);

  const dismissAwaitingGps = useCallback(() => {
    setShowAwaitingGps(false);
  }, []);

  const driverSheetDrag = useBottomSheetDragToClose({
    onClose: dismissSelectedDriver,
  });

  const awaitingGpsSheetDrag = useBottomSheetDragToClose({
    onClose: dismissAwaitingGps,
  });

  // Sync external "Locate on Map" focus request
  useEffect(() => {
    if (!focusedDriverId) return;
    setSelectedDriverId(focusedDriverId);
    const target = fleet.find((d) => d.id === focusedDriverId);
    if (target) {
      if (target.mapStatus === 'offline') {
        setStatusFilter('offline');
      } else if (statusFilter !== 'all' && statusFilter !== target.mapStatus) {
        setStatusFilter('all');
      }
      if (target.telemetry?.coordinates && mapInstanceRef.current) {
        mapInstanceRef.current.panTo(target.telemetry.coordinates);
        const currentZoom = mapInstanceRef.current.getZoom() || 11;
        if (currentZoom < 14) mapInstanceRef.current.setZoom(14);
      }
    }
  }, [focusedDriverId, fleet, statusFilter]);

  // Subscribe to Google Maps loader status
  useEffect(() => {
    return subscribeToGoogleMapsStatus((status) => setMapsStatus(status));
  }, []);

  // Initialize Google Map once
  useEffect(() => {
    let isMounted = true;
    loadGoogleMaps()
      .then((gMaps) => {
        if (!isMounted || !gMaps || !mapContainerRef.current) return;
        if (!mapInstanceRef.current) {
          const map = new gMaps.maps.Map(mapContainerRef.current, {
            center: { lat: CHESTERFIELD_CENTER.lat, lng: CHESTERFIELD_CENTER.lng },
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
            clickableIcons: false,
            styles: [
              {
                featureType: 'poi.business',
                stylers: [{ visibility: 'off' }],
              },
            ],
          });

          map.addListener('click', () => {
            setSelectedDriverId(null);
            setSelectedWaypointId(null);
            onClearFocusedDriver?.();
          });

          mapInstanceRef.current = map;

          directionsRendererRef.current = new gMaps.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            suppressPolylines: true,
            preserveViewport: true,
          });

          setMapReady(true);
        }
      })
      .catch((err) => {
        console.warn('[LiveFleetMap] Google Maps initialization failed:', err);
        setMapsStatus('error');
      });

    return () => {
      isMounted = false;
      if (directionsRendererRef.current) {
        try {
          directionsRendererRef.current.setMap(null);
        } catch {}
        directionsRendererRef.current = null;
      }
      clearRoutePolylines(routePolylineHandlesRef.current);
      clearRouteWaypointMarkers(routeWaypointMarkersRef.current);
      markersByIdRef.current.forEach((m) => {
        try {
          if (typeof google !== 'undefined' && google?.maps?.event) {
            google.maps.event.clearInstanceListeners(m);
          }
          m.setMap(null);
        } catch {}
      });
      markersByIdRef.current.clear();
      if (mapInstanceRef.current && typeof google !== 'undefined' && google?.maps?.event) {
        try {
          google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        } catch {}
        mapInstanceRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  // Compute filtered visible fleet & counts
  const { visibleWithGps, awaitingGpsDrivers, counts } = useMemo(() => {
    const c = {
      all: 0,
      available: 0,
      en_route: 0,
      busy: 0,
      break: 0,
      offline: 0,
    };
    const withGps: LiveFleetDriver[] = [];
    const noGps: LiveFleetDriver[] = [];

    for (const drv of fleet) {
      if (drv.isBlacklisted) continue;
      c[drv.mapStatus] += 1;
      if (drv.mapStatus !== 'offline') c.all += 1;

      // Apply mutually exclusive single-select filter rules
      const matchesStatus =
        statusFilter === 'all'
          ? drv.mapStatus !== 'offline'
          : drv.mapStatus === statusFilter;

      if (!matchesStatus) continue;

      if (drv.telemetry?.coordinates) {
        withGps.push(drv);
      } else if (drv.mapStatus !== 'offline') {
        noGps.push(drv);
      }
    }

    return { visibleWithGps: withGps, awaitingGpsDrivers: noGps, counts: c };
  }, [fleet, statusFilter]);

  // Pooled zero-flicker marker synchronization (runs once mapReady === true)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps?.Marker) {
      return;
    }

    const map = mapInstanceRef.current;
    const gMaps = window.google.maps;
    const pool = markersByIdRef.current;
    const visibleIds = new Set<string>();

    for (const drv of visibleWithGps) {
      const coords = drv.telemetry?.coordinates;
      if (!coords) continue;

      visibleIds.add(drv.id);
      const isSelected = selectedDriverId === drv.id;
      const cabLabel = extractCabShortLabel(drv);
      const iconUrl = buildFleetCarMarkerDataUrl({
        status: drv.mapStatus,
        cabLabel,
        heading: drv.telemetry?.heading ?? 0,
        isStale: drv.gpsFreshness === 'stale',
        isSelected,
      });

      const icon: google.maps.Icon = {
        url: iconUrl,
        scaledSize: new gMaps.Size(50, 59),
        anchor: new gMaps.Point(25, 22),
      };

      const statusLabel = getMapStatusLabel(drv.mapStatus, drv.activeTripStatus);
      const speedText =
        typeof drv.telemetry?.speedMph === 'number'
          ? ` • ${Math.round(drv.telemetry.speedMph)} mph`
          : '';
      const title = `${cabLabel} ${drv.name} (${statusLabel}${speedText})`;
      const zIndex = isSelected
        ? 500
        : drv.mapStatus === 'busy'
        ? 300
        : drv.mapStatus === 'en_route'
        ? 250
        : drv.mapStatus === 'available'
        ? 200
        : drv.mapStatus === 'break'
        ? 150
        : 50;

      const existing = pool.get(drv.id);
      if (existing) {
        existing.setPosition(coords);
        existing.setIcon(icon);
        existing.setTitle(title);
        existing.setZIndex(zIndex);
        if (!existing.getMap()) {
          existing.setMap(map);
        }
      } else {
        const marker = new gMaps.Marker({
          position: coords,
          map,
          icon,
          title,
          zIndex,
          optimized: false,
        });
        marker.addListener('click', () => {
          setSelectedDriverId(drv.id);
        });
        pool.set(drv.id, marker);
      }
    }

    // Remove markers no longer visible under active filters
    pool.forEach((marker, driverId) => {
      if (!visibleIds.has(driverId)) {
        try {
          if (typeof google !== 'undefined' && google?.maps?.event) {
            google.maps.event.clearInstanceListeners(marker);
          }
          marker.setMap(null);
        } catch {}
        pool.delete(driverId);
      }
    });
  }, [mapReady, visibleWithGps, selectedDriverId]);

  const stopsSig = [
    ...(selectedTrip?.intermediateStops || []),
    ...(Array.isArray(activeFormValues?.intermediateStops) ? activeFormValues.intermediateStops : []),
    ...(activeTrip?.intermediateStops || []),
  ]
    .map((s: any) => `${s?.address || ''}|${s?.coordinates?.lat ?? ''},${s?.coordinates?.lng ?? ''}`)
    .join(';');

  const activeRoute = useMemo(
    () => resolveActiveRouteContext({ selectedTrip, activeFormValues, activeTrip, shouldZoom }),
    [
      selectedTrip?.id,
      selectedTrip?.pickupLocation?.address,
      selectedTrip?.pickupLocation?.coordinates?.lat,
      selectedTrip?.pickupLocation?.coordinates?.lng,
      selectedTrip?.dropoffLocation?.address,
      selectedTrip?.dropoffLocation?.coordinates?.lat,
      selectedTrip?.dropoffLocation?.coordinates?.lng,
      activeFormValues?.pickupAddress,
      activeFormValues?.pickupCoordinates?.lat,
      activeFormValues?.pickupCoordinates?.lng,
      activeFormValues?.dropoffAddress,
      activeFormValues?.dropoffCoordinates?.lat,
      activeFormValues?.dropoffCoordinates?.lng,
      activeTrip?.id,
      activeTrip?.pickupLocation?.address,
      activeTrip?.dropoffLocation?.address,
      stopsSig,
      shouldZoom,
    ]
  );

  const lastRenderedRouteSigRef = useRef<string>('');

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const nextSig = activeRoute?.signature || '';
    if (lastRenderedRouteSigRef.current === nextSig) return;
    lastRenderedRouteSigRef.current = nextSig;
    setSelectedWaypointId(null);

    if (!activeRoute) {
      directionsSeqRef.current += 1;
      setSnappedWaypoints(null);
      setRoutePath([]);
      setRouteMetrics(null);
      try {
        directionsRendererRef.current?.setDirections({ routes: [] } as any);
      } catch {}
      clearRoutePolylines(routePolylineHandlesRef.current);
      clearRouteWaypointMarkers(routeWaypointMarkersRef.current);
      return;
    }

    const fallbackPath = activeRoute.waypoints.map((w) => w.coordinates);
    setSnappedWaypoints(null);
    setRoutePath(fallbackPath);
    setRouteMetrics(null);

    if (
      !isRealtimeRoutingEnabled() ||
      !hasValidRoutePair(activeRoute.originInput, activeRoute.destinationInput) ||
      typeof window.google?.maps?.DirectionsService !== 'function'
    ) {
      try {
        directionsRendererRef.current?.setDirections({ routes: [] } as any);
      } catch {}
      if (shouldZoom && window.google?.maps?.LatLngBounds && fallbackPath.length >= 2) {
        const bounds = new window.google.maps.LatLngBounds();
        fallbackPath.forEach((pt) => bounds.extend(pt));
        mapInstanceRef.current.fitBounds(bounds, 56);
      }
      return;
    }

    const requestSeq = ++directionsSeqRef.current;
    const timer = setTimeout(() => {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: activeRoute.originInput,
          destination: activeRoute.destinationInput,
          waypoints: activeRoute.waypointInputs,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (requestSeq !== directionsSeqRef.current) return;
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            const snapshot = extractDirectionsRouteSnapshot(result, activeRoute.waypoints);
            setSnappedWaypoints(snapshot.snappedWaypoints);
            setRoutePath(snapshot.path);
            setRouteMetrics(snapshot.metrics);
            if (shouldZoom && result.routes?.[0]?.bounds && mapInstanceRef.current) {
              mapInstanceRef.current.fitBounds(result.routes[0].bounds);
            }
          }
        }
      );
    }, 450);

    return () => clearTimeout(timer);
  }, [mapReady, activeRoute, shouldZoom]);

  const effectiveWaypoints = useMemo(
    () => snappedWaypoints || activeRoute?.waypoints || [],
    [snappedWaypoints, activeRoute]
  );

  useEffect(() => {
    if (!mapReady) return;
    syncRoutePolylines({
      map: mapInstanceRef.current,
      handles: routePolylineHandlesRef.current,
      path: routePath,
      casedRouteWithArrows: mapPreferences.casedRouteWithArrows,
    });
  }, [mapReady, routePath, mapPreferences.casedRouteWithArrows]);

  const interactivePopoversRef = useRef(mapPreferences.interactiveRoutePinPopovers);
  interactivePopoversRef.current = mapPreferences.interactiveRoutePinPopovers;

  const handleSelectWaypoint = useCallback((waypointId: string) => {
    if (!interactivePopoversRef.current) return;
    setSelectedWaypointId((prev) => (prev === waypointId ? null : waypointId));
  }, []);

  useEffect(() => {
    if (!mapPreferences.interactiveRoutePinPopovers && selectedWaypointId) {
      setSelectedWaypointId(null);
    }
  }, [mapPreferences.interactiveRoutePinPopovers, selectedWaypointId]);

  useEffect(() => {
    if (!mapReady) return;
    syncRouteWaypointMarkers({
      map: mapInstanceRef.current,
      pool: routeWaypointMarkersRef.current,
      waypoints: effectiveWaypoints,
      selectedWaypointId,
      interactiveRoutePinPopovers: mapPreferences.interactiveRoutePinPopovers,
      onSelectWaypoint: handleSelectWaypoint,
    });
  }, [
    mapReady,
    effectiveWaypoints,
    selectedWaypointId,
    mapPreferences.interactiveRoutePinPopovers,
    handleSelectWaypoint,
  ]);

  const selectedWaypoint = useMemo(
    () =>
      selectedWaypointId ? effectiveWaypoints.find((w) => w.id === selectedWaypointId) || null : null,
    [effectiveWaypoints, selectedWaypointId]
  );

  const handlePanToWaypoint = useCallback((waypoint: ResolvedRouteWaypoint) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo(waypoint.coordinates);
    const currentZoom = mapInstanceRef.current.getZoom?.() || 12;
    if (currentZoom < 14) mapInstanceRef.current.setZoom(14);
  }, []);

  // Fit all visible cars on map
  const handleFitFleet = useCallback(() => {
    if (!mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps?.LatLngBounds) {
      return;
    }
    if (visibleWithGps.length === 0) {
      mapInstanceRef.current.panTo(CHESTERFIELD_CENTER);
      mapInstanceRef.current.setZoom(11);
      return;
    }
    if (visibleWithGps.length === 1 && visibleWithGps[0].telemetry?.coordinates) {
      mapInstanceRef.current.panTo(visibleWithGps[0].telemetry.coordinates);
      mapInstanceRef.current.setZoom(14);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    for (const drv of visibleWithGps) {
      if (drv.telemetry?.coordinates) {
        bounds.extend(drv.telemetry.coordinates);
      }
    }
    mapInstanceRef.current.fitBounds(bounds, 60);
  }, [visibleWithGps]);

  const handleRecenterChesterfield = useCallback(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo(CHESTERFIELD_CENTER);
    mapInstanceRef.current.setZoom(11);
  }, []);

  const selectedDriver = useMemo(
    () => (selectedDriverId ? fleet.find((d) => d.id === selectedDriverId) || null : null),
    [fleet, selectedDriverId]
  );

  // Straight-line distance from selected driver to selected trip pickup
  const distanceToSelectedPickup = useMemo(() => {
    const drvCoords = selectedDriver?.telemetry?.coordinates;
    const pickupCoords = selectedTrip?.pickupLocation?.coordinates;
    if (!drvCoords || !pickupCoords) return null;
    return haversineMiles(drvCoords, pickupCoords);
  }, [selectedDriver, selectedTrip]);

  const canAssignSelectedTrip = Boolean(
    selectedDriver &&
      selectedTrip &&
      onAssignDriverToTrip &&
      !['completed', 'cancelled', 'DECLINED', 'declined'].includes(selectedTrip.status) &&
      selectedTrip.assignedDriverId !== selectedDriver.id &&
      !selectedDriver.isBlacklisted
  );

  const handleDutySwitch = async (driverId: string, nextDuty: DriverDutyStatus) => {
    if (!onChangeDriverDutyStatus || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await onChangeDriverDutyStatus(driverId, nextDuty);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleFindSelectedVehicle = useCallback(() => {
    const coords = selectedDriver?.telemetry?.coordinates;
    if (!coords || !mapInstanceRef.current) return;
    mapInstanceRef.current.panTo(coords);
    const currentZoom = mapInstanceRef.current.getZoom?.() || 11;
    mapInstanceRef.current.setZoom(Math.max(16, currentZoom));
  }, [selectedDriver]);

  const showFallbackRadar = mapsStatus === 'error' || mapsStatus === 'unconfigured';

  return (
    <div className={`relative w-full h-full overflow-hidden bg-slate-900 select-none ${className}`}>
      {/* Google Maps Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Graceful Offline/Unconfigured Radar Fallback */}
      {showFallbackRadar && (
        <div className="absolute inset-0 z-10 bg-slate-950/95 text-slate-100 flex flex-col p-4 pt-16 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-black text-white">Live Fleet Telemetry Radar (Fallback View)</h3>
                <p className="text-[11px] text-slate-400">
                  Google Maps tile layer unavailable — displaying real-time GPS driver statuses below.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400">
                {visibleWithGps.length} GPS Live
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {fleet
                .filter(
                  (d) =>
                    !d.isBlacklisted &&
                    (statusFilter === 'all'
                      ? d.mapStatus !== 'offline'
                      : d.mapStatus === statusFilter)
                )
                .map((drv) => {
                  const palette = FLEET_STATUS_COLORS[drv.mapStatus];
                  const label = getMapStatusLabel(drv.mapStatus, drv.activeTripStatus);
                  return (
                    <button
                      key={drv.id}
                      type="button"
                      onClick={() => setSelectedDriverId(drv.id)}
                      className="text-left p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: palette.hex }}
                          />
                          <span className="text-xs font-extrabold text-white truncate">
                            {extractCabShortLabel(drv)} • {drv.name}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{ backgroundColor: `${palette.hex}22`, color: palette.hex }}
                        >
                          {label}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                        <span>
                          {drv.telemetry?.coordinates
                            ? `${drv.telemetry.coordinates.lat.toFixed(4)}, ${drv.telemetry.coordinates.lng.toFixed(4)}`
                            : 'Awaiting GPS fix'}
                        </span>
                        <span>{formatLastSeen(drv.lastSeenSeconds)}</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ─── TOP FLOATING FLEET FILTER & LEGEND HUD ─── */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between gap-1.5 pointer-events-none">
        {/* Mobile (< sm): Full-width 6-column 2-line Status + Count Tiles (Zero horizontal overflow, locked level with Roster) */}
        <div className="pointer-events-auto sm:hidden w-full grid grid-cols-6 gap-1 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`py-1 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Show all active on-shift drivers"
          >
            <span className="text-[10px] font-bold tracking-tight whitespace-nowrap leading-none">
              All
            </span>
            <span className="text-xs font-black font-mono leading-tight">{counts.all}</span>
          </button>

          {(
            [
              { key: 'available', label: 'Available', shortLabel: 'Avail', hex: '#10b981', count: counts.available },
              { key: 'en_route', label: 'En Route', shortLabel: 'En Route', hex: '#2563eb', count: counts.en_route },
              { key: 'busy', label: 'Arrived / Busy', shortLabel: 'Busy', hex: '#ef4444', count: counts.busy },
              { key: 'break', label: 'Break', shortLabel: 'Break', hex: '#eab308', count: counts.break },
            ] as const
          ).map((item) => {
            const active = statusFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(active ? 'all' : item.key)}
                className={`py-1 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                title={`Filter ${item.label} drivers`}
              >
                <span className="inline-flex items-center gap-1 leading-none">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-black/10"
                    style={{ backgroundColor: item.hex }}
                  />
                  <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">
                    {item.shortLabel}
                  </span>
                </span>
                <span className="text-xs font-black font-mono leading-tight">{item.count}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
            className={`py-1 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              statusFilter === 'offline'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title="Filter Offline drivers on map"
          >
            <span className="inline-flex items-center gap-1 leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">Off</span>
            </span>
            <span className="text-xs font-black font-mono leading-tight">{counts.offline}</span>
          </button>
        </div>

        {/* Desktop / Tablet (sm+): Compact Single-Row Status Color Filter Pills */}
        <div className="pointer-events-auto hidden sm:flex flex-wrap items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg rounded-xl px-1.5 py-1 max-w-full">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Show all active on-shift drivers"
          >
            <span>All</span>
            <span className="font-mono text-[10px] opacity-80">{counts.all}</span>
          </button>

          {(
            [
              { key: 'available', label: 'Available', shortLabel: 'Avail', hex: '#10b981', count: counts.available },
              { key: 'en_route', label: 'En Route', shortLabel: 'En Route', hex: '#2563eb', count: counts.en_route },
              { key: 'busy', label: 'Arrived / Busy', shortLabel: 'Busy', hex: '#ef4444', count: counts.busy },
              { key: 'break', label: 'Break', shortLabel: 'Break', hex: '#eab308', count: counts.break },
            ] as const
          ).map((item) => {
            const active = statusFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(active ? 'all' : item.key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-transparent hover:bg-slate-100'
                }`}
                title={`Filter ${item.label} drivers`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
                  style={{ backgroundColor: item.hex }}
                />
                <span>{item.label}</span>
                <span className="font-mono text-[10px] opacity-80">{item.count}</span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 border shrink-0 ${
              statusFilter === 'offline'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'text-slate-500 border-transparent hover:bg-slate-100'
            }`}
            title="Filter Offline drivers on map"
          >
            <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
            <span>Offline</span>
            <span className="font-mono text-[10px] opacity-80">{counts.offline}</span>
          </button>
        </div>

        {/* Desktop Map Controls: Awaiting GPS Chip + Fit Fleet + Center */}
        <div className="pointer-events-auto hidden sm:flex items-center gap-1.5 shrink-0">
          {awaitingGpsDrivers.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAwaitingGps((v) => !v)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-50/95 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1.5"
                title="On-shift drivers who have not yet transmitted a live GPS fix"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Awaiting GPS ({awaitingGpsDrivers.length})</span>
              </button>

              {showAwaitingGps && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 z-30 space-y-1 max-h-60 overflow-y-auto">
                  <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      On-Shift Without GPS Fix
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAwaitingGps(false)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {awaitingGpsDrivers.map((drv) => {
                    const pal = FLEET_STATUS_COLORS[drv.mapStatus];
                    return (
                      <button
                        key={drv.id}
                        type="button"
                        onClick={() => {
                          setSelectedDriverId(drv.id);
                          setShowAwaitingGps(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: pal.hex }}
                          />
                          <span className="font-bold text-slate-800 truncate">
                            {extractCabShortLabel(drv)} {drv.firstName || drv.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                          {getMapStatusLabel(drv.mapStatus, drv.activeTripStatus)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleFitFleet}
            className="px-2.5 py-1.5 rounded-xl bg-white/95 hover:bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1"
            title="Zoom to fit all visible live GPS vehicles"
          >
            <CarIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Fit Fleet</span>
          </button>

          <button
            type="button"
            onClick={handleRecenterChesterfield}
            className="px-2 py-1.5 rounded-xl bg-white/95 hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1"
            title="Recenter on Chesterfield, MO"
          >
            <MapPinIcon className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* ─── MOBILE FLOATING RIGHT-EDGE MAP CONTROLS + ROSTER SWITCHER ─── */}
      <div
        className={`lg:hidden absolute right-3.5 z-20 flex flex-col items-end gap-2 pointer-events-auto transition-all ${
          selectedDriver ? 'bottom-[245px] sm:bottom-3.5' : 'bottom-3.5'
        }`}
      >
        <div className="sm:hidden flex flex-col items-end gap-2">
          {awaitingGpsDrivers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAwaitingGps(true)}
              className="px-3 py-2 rounded-full bg-amber-50/95 active:scale-95 border border-amber-300 text-amber-900 text-[11px] font-bold shadow-lg backdrop-blur-md cursor-pointer flex items-center gap-1.5"
              title="On-shift drivers without live GPS"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>No GPS ({awaitingGpsDrivers.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFitFleet}
            className="w-11 h-11 rounded-full bg-white/95 active:scale-95 border border-slate-200 text-blue-600 shadow-lg backdrop-blur-md cursor-pointer flex items-center justify-center"
            title="Fit all live GPS vehicles"
            aria-label="Fit Fleet"
          >
            <CarIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleRecenterChesterfield}
            className="w-11 h-11 rounded-full bg-white/95 active:scale-95 border border-slate-200 text-slate-700 shadow-lg backdrop-blur-md cursor-pointer flex items-center justify-center"
            title="Recenter on Chesterfield, MO"
            aria-label="Recenter Map"
          >
            <MapPinIcon className="w-5 h-5" />
          </button>
        </div>

        {onSwitchToRoster && (
          <button
            type="button"
            onClick={onSwitchToRoster}
            className="px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-extrabold shadow-xl ring-1 ring-white/15 flex items-center gap-2 cursor-pointer transition-all"
            title="Switch to Drivers Roster"
            aria-label="Switch to Drivers Roster"
          >
            <UsersIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Roster</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black leading-none">
              {fleet.filter((d) => d.mapStatus === 'available').length}
            </span>
          </button>
        )}
      </div>

      {/* ─── MOBILE AWAITING GPS BOTTOM SHEET (Drag-down to close) ─── */}
      {showAwaitingGps && awaitingGpsDrivers.length > 0 && (
        <div
          className="sm:hidden fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-[2px] flex items-end"
          onClick={dismissAwaitingGps}
        >
          <div
            style={awaitingGpsSheetDrag.sheetStyle}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh] flex flex-col animate-in slide-in-from-bottom-4 duration-150"
          >
            <div {...awaitingGpsSheetDrag.dragHandlers} className="shrink-0 touch-none">
              <div className="pt-2.5 pb-1 flex justify-center">
                <div className="w-10 h-1.5 rounded-full bg-slate-300" />
              </div>
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    On-Shift Without GPS ({awaitingGpsDrivers.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={dismissAwaitingGps}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-3 space-y-1.5 overflow-y-auto">
              {awaitingGpsDrivers.map((drv) => {
                const pal = FLEET_STATUS_COLORS[drv.mapStatus];
                return (
                  <button
                    key={drv.id}
                    type="button"
                    onClick={() => {
                      setSelectedDriverId(drv.id);
                      setShowAwaitingGps(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 active:bg-slate-100 border border-slate-200/80 flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: pal.hex }}
                      />
                      <span className="font-bold text-slate-900 truncate">
                        {extractCabShortLabel(drv)} • {drv.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                      {getMapStatusLabel(drv.mapStatus, drv.activeTripStatus)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── FLOATING INTERACTIVE DRIVER TELEMETRY HUD (Drag-down-to-close card on mobile) ─── */}
      {selectedDriver && (
        <div
          style={driverSheetDrag.sheetStyle}
          className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-3 sm:left-3 sm:right-auto z-30 sm:w-[min(340px,calc(100%-24px))] bg-white/98 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 space-y-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Mobile Drag Handle + Header */}
          <div {...driverSheetDrag.dragHandlers} className="touch-none space-y-1.5">
            <div className="sm:hidden flex justify-center -mt-1">
              <div className="w-9 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs"
                  style={{ backgroundColor: FLEET_STATUS_COLORS[selectedDriver.mapStatus].hex }}
                >
                  {extractCabShortLabel(selectedDriver)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-900 text-sm truncate">
                      {selectedDriver.name}
                    </span>
                    {selectedDriver.driverScore !== undefined && (
                      <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                        {selectedDriver.driverScore}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {selectedDriver.vehicle} • {selectedDriver.tier}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={dismissSelectedDriver}
                className="p-1.5 sm:p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close driver details"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live Status & Telemetry Strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${FLEET_STATUS_COLORS[selectedDriver.mapStatus].badgeClass}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${FLEET_STATUS_COLORS[selectedDriver.mapStatus].dotClass}`}
              />
              {getMapStatusLabel(selectedDriver.mapStatus, selectedDriver.activeTripStatus)}
            </span>

            {selectedDriver.telemetry ? (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-semibold border ${
                  selectedDriver.gpsFreshness === 'live'
                    ? 'bg-emerald-50/70 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                <span>
                  {typeof selectedDriver.telemetry.speedMph === 'number'
                    ? `${Math.round(selectedDriver.telemetry.speedMph)} mph`
                    : 'GPS'}
                </span>
                <span>•</span>
                <span>{formatLastSeen(selectedDriver.lastSeenSeconds)}</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                Awaiting GPS Fix
              </span>
            )}

            {selectedDriver.queuedTripsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {selectedDriver.queuedTripsCount} Queued
              </span>
            )}

            {distanceToSelectedPickup !== null && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {distanceToSelectedPickup.toFixed(1)} mi to pickup
              </span>
            )}
          </div>

          {/* Active Trip Context (if En Route / Arrived / In Progress) */}
          {selectedDriver.activeTrip && (
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>
                  Active Trip ({selectedDriver.activeTrip.passenger?.firstName}{' '}
                  {selectedDriver.activeTrip.passenger?.lastName})
                </span>
                {onSelectTrip && (
                  <button
                    type="button"
                    onClick={() => onSelectTrip(selectedDriver.activeTrip!)}
                    className="text-blue-600 hover:underline normal-case font-bold cursor-pointer"
                  >
                    Focus Route →
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{selectedDriver.activeTrip.pickupLocation?.address}</span>
              </div>
              {getTripIntermediateStopCount(selectedDriver.activeTrip) > 0 && (
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span>
                    +{getTripIntermediateStopCount(selectedDriver.activeTrip)}{' '}
                    {getTripIntermediateStopCount(selectedDriver.activeTrip) === 1 ? 'stop' : 'stops'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
                <MapPinIcon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="truncate">{selectedDriver.activeTrip.dropoffLocation?.address}</span>
              </div>
            </div>
          )}

          {/* Quick Dispatcher Duty Override (Persisted to Firestore) */}
          {onChangeDriverDutyStatus && !selectedDriver.activeTrip && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-0.5">Set:</span>
              {(
                [
                  { duty: 'on_duty', label: 'Available', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                  { duty: 'on_break', label: 'Break', activeClass: 'bg-amber-500 text-slate-950 border-amber-500' },
                  { duty: 'off_duty', label: 'Offline', activeClass: 'bg-slate-700 text-white border-slate-700' },
                ] as const
              ).map((opt) => {
                const isCurrent = selectedDriver.dutyStatus === opt.duty;
                return (
                  <button
                    key={opt.duty}
                    type="button"
                    disabled={isUpdatingStatus || isCurrent}
                    onClick={() => handleDutySwitch(selectedDriver.id, opt.duty)}
                    className={`flex-1 py-1.5 sm:py-1 px-2 rounded-xl sm:rounded-lg text-[11px] sm:text-[10.5px] font-bold border transition-colors cursor-pointer disabled:cursor-default ${
                      isCurrent
                        ? opt.activeClass
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            <button
              type="button"
              disabled={!selectedDriver.telemetry?.coordinates}
              onClick={handleFindSelectedVehicle}
              className="py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-[11px] shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
              title={
                selectedDriver.telemetry?.coordinates
                  ? `Zoom directly to ${selectedDriver.name}'s vehicle on the map`
                  : 'Awaiting live GPS fix for this vehicle'
              }
            >
              <MapPinIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>Locate</span>
            </button>

            {canAssignSelectedTrip && selectedTrip && (
              <button
                type="button"
                onClick={() => onAssignDriverToTrip?.(selectedTrip.id, selectedDriver.id)}
                className="flex-1 py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-[11px] shadow-xs transition-colors cursor-pointer truncate flex items-center justify-center gap-1"
                title={`Assign ${selectedDriver.name} to selected trip`}
              >
                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Assign Trip</span>
              </button>
            )}

            {onOpenDriverQueue && (
              <button
                type="button"
                onClick={() => onOpenDriverQueue(selectedDriver)}
                className="flex-1 py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-[11px] shadow-xs transition-colors cursor-pointer"
              >
                Queue
              </button>
            )}

            {onCallDriver && selectedDriver.phone && (
              <button
                type="button"
                onClick={() => onCallDriver(selectedDriver.phone, selectedDriver.name)}
                className="py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-[11px] border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                title={`Call ${selectedDriver.phone}`}
              >
                <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Call</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── ROUTE WAYPOINT POPOVER & BOTTOM-LEFT SUMMARY PILL HUD ─── */}
      <MapRouteOverlayHud
        activeRoute={activeRoute}
        waypoints={effectiveWaypoints}
        selectedWaypoint={selectedWaypoint}
        metrics={routeMetrics}
        preferences={mapPreferences}
        hasSelectedDriverHud={Boolean(selectedDriver)}
        onCloseWaypointPopover={() => setSelectedWaypointId(null)}
        onPanToWaypoint={handlePanToWaypoint}
        onClearSelectedTrip={onClearSelectedTrip}
      />
    </div>
  );
}

export const LiveFleetMap = React.memo(LiveFleetMapComponent);
