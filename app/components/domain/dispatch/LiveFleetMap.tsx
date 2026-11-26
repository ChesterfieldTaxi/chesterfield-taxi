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
import type { Trip } from '../../../core/types/trip';
import type { DriverDutyStatus } from '../../../core/types/driver';
import {
  loadGoogleMaps,
  CHESTERFIELD_CENTER,
  subscribeToGoogleMapsStatus,
  type GoogleMapsStatus,
} from '../../../core/services/maps/google-maps-loader';
import {
  DARK_FLEET_MAP_STYLES,
  LIGHT_FLEET_MAP_STYLES,
} from '../../../config/theme-tokens';
import { useTheme } from '../../../hooks/useTheme';
import { useDispatchMapPreferences } from '../../../core/hooks/dispatch/useDispatchMapPreferences';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { getTripIntermediateStopCount } from '../../../core/utils/route-markers.util';
import {
  FLEET_STATUS_COLORS,
  getMapStatusLabel,
  type LiveFleetDriver,
} from '../../../core/hooks/useDispatchFleet';
import { PhoneIcon, CarIcon, MapPinIcon, UsersIcon, XIcon, CheckIcon } from '../../ui/Icons';
import { useBottomSheetDragToClose } from '../../../core/hooks/useBottomSheetDragToClose';
import { MapRouteOverlayHud } from './map/MapRouteOverlayHud';
import { MapCustomOverlayInfoCard } from './map/MapCustomOverlayInfoCard';
import { MapLayersAndVehiclesToolbar } from './map/MapLayersAndVehiclesToolbar';
import {
  buildFleetCarMarkerDataUrl,
  computeHaversineMiles,
  extractCabShortLabel,
  formatLastSeen,
  matchesSelectedVehicleTypes,
} from './map/fleet-car-marker.util';
import {
  clearRoutePolylines,
  clearRouteWaypointMarkers,
  type RoutePolylineHandles,
} from './map/route-map-sync';
import { useLiveMapRouteOverlaySync } from './map/useLiveMapRouteOverlaySync';
import {
  useLiveMapCustomOverlays,
  type PopulateBookingEndpointPayload,
} from './map/useLiveMapCustomOverlays';

export { buildFleetCarMarkerDataUrl };

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
  onOpenTripDetails?: (tripId: string) => void;
  onPopulateBooking?: (payload: PopulateBookingEndpointPayload) => void;
  onSwitchToRoster?: () => void;
  className?: string;
}

type MapFilterKey = 'all' | 'available' | 'en_route' | 'busy' | 'break' | 'offline';

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
  onOpenTripDetails,
  onPopulateBooking,
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
  const clearSelectedWaypointRef = useRef<() => void>(() => {});
  const clearSelectedOverlayRef = useRef<() => void>(() => {});

  const [adminSettings, setAdminSettings] = useState(() =>
    getAdminConfigService().getCachedSettings()
  );
  useEffect(() => {
    return getAdminConfigService().subscribeToSettings((next) => setAdminSettings(next));
  }, []);

  const {
    preferences: mapPreferences,
    togglePreference,
    toggleVehicleType,
    setSelectedVehicleTypes,
  } = useDispatchMapPreferences(adminSettings.dispatchConsoleConfig);
  const { resolvedTheme } = useTheme({ applyToDom: false });
  const resolvedThemeRef = useRef(resolvedTheme);
  resolvedThemeRef.current = resolvedTheme;
  const [mapReady, setMapReady] = useState(false);
  const [mapsStatus, setMapsStatus] = useState<GoogleMapsStatus>('loading');
  const [statusFilter, setStatusFilter] = useState<MapFilterKey>('all');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
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
          const isDarkInit = resolvedThemeRef.current === 'dark';
          const map = new gMaps.maps.Map(mapContainerRef.current, {
            center: { lat: CHESTERFIELD_CENTER.lat, lng: CHESTERFIELD_CENTER.lng },
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
            clickableIcons: false,
            backgroundColor: isDarkInit ? '#0f172a' : '#f1f5f9',
            styles: isDarkInit ? DARK_FLEET_MAP_STYLES : LIGHT_FLEET_MAP_STYLES,
          });

          map.addListener('click', () => {
            setSelectedDriverId(null);
            clearSelectedWaypointRef.current();
            clearSelectedOverlayRef.current();
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

  // Dynamically apply light/dark Google Maps tile styles when resolvedTheme changes
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const isDarkMap = resolvedTheme === 'dark';
    mapInstanceRef.current.setOptions({
      backgroundColor: isDarkMap ? '#0f172a' : '#f1f5f9',
      styles: isDarkMap ? DARK_FLEET_MAP_STYLES : LIGHT_FLEET_MAP_STYLES,
    });
  }, [mapReady, resolvedTheme]);

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
      if (
        !matchesSelectedVehicleTypes(
          drv,
          mapPreferences.selectedVehicleTypes,
          adminSettings.fleet,
          adminSettings.vehicles
        )
      ) {
        continue;
      }
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
  }, [fleet, statusFilter, mapPreferences.selectedVehicleTypes, adminSettings.fleet, adminSettings.vehicles]);

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

  const {
    activeRoute,
    effectiveWaypoints,
    selectedWaypoint,
    routeMetrics,
    clearSelectedWaypoint,
    handlePanToWaypoint,
    handleDismissRouteOverlay,
  } = useLiveMapRouteOverlaySync({
    mapReady,
    mapInstanceRef,
    directionsRendererRef,
    routePolylineHandlesRef,
    routeWaypointMarkersRef,
    selectedTrip,
    activeFormValues,
    activeTrip,
    shouldZoom,
    mapPreferences,
    onClearSelectedTrip,
  });
  clearSelectedWaypointRef.current = clearSelectedWaypoint;

  const {
    selectedOverlay, availableDriversInSelectedZone, appliedEndpointFeedback, clearSelectedOverlay, handleSetPlaceEndpoint,
  } = useLiveMapCustomOverlays({
    mapReady, mapInstanceRef, preferences: mapPreferences, fleet,
    fleetCars: adminSettings.fleet, vehicleTiers: adminSettings.vehicles,
    companyInfo: adminSettings.company, onPopulateBooking,
  });
  clearSelectedOverlayRef.current = clearSelectedOverlay;

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

  // Straight-line distance from selected driver to active pickup (selected trip or draft form)
  const distanceToSelectedPickup = useMemo(() => {
    const drvCoords = selectedDriver?.telemetry?.coordinates;
    const pickupCoords =
      selectedTrip?.pickupLocation?.coordinates ||
      effectiveWaypoints.find((w) => w.kind === 'pickup')?.coordinates;
    if (!drvCoords || !pickupCoords) return null;
    return computeHaversineMiles(drvCoords, pickupCoords);
  }, [selectedDriver, selectedTrip, effectiveWaypoints]);

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
    <div className={`relative w-full h-full overflow-hidden bg-surface-header select-none ${className}`}>
      {/* Google Maps Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Graceful Offline/Unconfigured Radar Fallback */}
      {showFallbackRadar && (
        <div className="absolute inset-0 z-10 bg-surface-header/95 text-fg-on-header flex flex-col p-4 pt-16 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full space-y-3">
            <div className="flex items-center justify-between border-b border-border-header pb-2">
              <div>
                <h3 className="text-sm font-black text-white">Live Fleet Telemetry Radar (Fallback View)</h3>
                <p className="text-[11px] text-fg-subtle">
                  Google Maps tile layer unavailable — displaying real-time GPS driver statuses below.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-header-elevated text-emerald-400">
                {visibleWithGps.length} GPS Live
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {fleet
                .filter(
                  (d) =>
                    !d.isBlacklisted &&
                    matchesSelectedVehicleTypes(
                      d,
                      mapPreferences.selectedVehicleTypes,
                      adminSettings.fleet,
                      adminSettings.vehicles
                    ) &&
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
                      className="text-left p-2.5 rounded-xl bg-surface-header border border-border-header hover:border-slate-600 transition-colors cursor-pointer"
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
                      <div className="mt-1.5 text-[10px] font-mono text-fg-subtle flex items-center justify-between">
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
        <div className="pointer-events-auto sm:hidden w-full grid grid-cols-6 gap-1 bg-surface-card/95 backdrop-blur-md border border-border-subtle/90 shadow-lg rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`py-1 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-surface-inverted text-fg-inverted shadow-2xs'
                : 'text-fg-secondary hover:bg-surface-muted'
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
                    ? 'bg-surface-inverted text-fg-inverted shadow-2xs'
                    : 'text-fg-secondary hover:bg-surface-muted'
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
                ? 'bg-surface-inverted text-fg-inverted shadow-2xs'
                : 'text-fg-muted hover:bg-surface-muted'
            }`}
            title="Filter Offline drivers on map"
          >
            <span className="inline-flex items-center gap-1 leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle shrink-0" />
              <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">Off</span>
            </span>
            <span className="text-xs font-black font-mono leading-tight">{counts.offline}</span>
          </button>
        </div>

        {/* Desktop / Tablet (sm+): Compact Single-Row Status Color Filter Pills */}
        <div className="pointer-events-auto hidden sm:flex flex-wrap items-center gap-1 bg-surface-card/95 backdrop-blur-md border border-border-subtle/90 shadow-lg rounded-xl px-1.5 py-1 max-w-full">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
              statusFilter === 'all'
                ? 'bg-surface-inverted text-fg-inverted shadow-2xs'
                : 'text-fg-secondary hover:bg-surface-muted'
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
                    ? 'bg-surface-inverted text-fg-inverted border-surface-inverted shadow-2xs'
                    : 'bg-surface-card text-fg-secondary border-transparent hover:bg-surface-muted'
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

          <div className="h-4 w-px bg-border-subtle mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 border shrink-0 ${
              statusFilter === 'offline'
                ? 'bg-surface-inverted text-fg-inverted border-surface-inverted shadow-2xs'
                : 'text-fg-muted border-transparent hover:bg-surface-muted'
            }`}
            title="Filter Offline drivers on map"
          >
            <span className="w-2 h-2 rounded-full bg-fg-subtle shrink-0" />
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
                className="px-2.5 py-1.5 rounded-xl bg-status-warning-bg/95 hover:bg-status-warning-bg-strong border border-status-warning-border text-status-warning-fg text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1.5"
                title="On-shift drivers who have not yet transmitted a live GPS fix"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Awaiting GPS ({awaitingGpsDrivers.length})</span>
              </button>

              {showAwaitingGps && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-surface-card border border-border-subtle rounded-xl shadow-2xl p-2 z-30 space-y-1 max-h-60 overflow-y-auto">
                  <div className="flex items-center justify-between px-1.5 pb-1 border-b border-border-faint">
                    <span className="text-[10px] font-black uppercase tracking-wider text-fg-muted">
                      On-Shift Without GPS Fix
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAwaitingGps(false)}
                      className="text-fg-subtle hover:text-fg-secondary cursor-pointer"
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
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-subtle flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: pal.hex }}
                          />
                          <span className="font-bold text-fg-strong truncate">
                            {extractCabShortLabel(drv)} {drv.firstName || drv.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-fg-muted shrink-0">
                          {getMapStatusLabel(drv.mapStatus, drv.activeTripStatus)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <MapLayersAndVehiclesToolbar
            fleet={fleet}
            fleetCars={adminSettings.fleet}
            vehicleTiers={adminSettings.vehicles}
            preferences={mapPreferences}
            onTogglePreference={togglePreference}
            onToggleVehicleType={toggleVehicleType}
            onSetSelectedVehicleTypes={setSelectedVehicleTypes}
            variant="desktop"
          />

          <button
            type="button"
            onClick={handleFitFleet}
            className="px-2.5 py-1.5 rounded-xl bg-surface-card/95 hover:bg-surface-subtle border border-border-subtle text-fg-strong text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1"
            title="Zoom to fit all visible live GPS vehicles"
          >
            <CarIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Fit Fleet</span>
          </button>

          <button
            type="button"
            onClick={handleRecenterChesterfield}
            className="px-2 py-1.5 rounded-xl bg-surface-card/95 hover:bg-surface-subtle border border-border-subtle text-fg-secondary text-[11px] font-bold shadow-md backdrop-blur-md cursor-pointer flex items-center gap-1"
            title="Recenter on Chesterfield, MO"
          >
            <MapPinIcon className="w-3.5 h-3.5 text-fg-secondary" />
          </button>
        </div>
      </div>

      {/* ─── MOBILE VEHICLES & LAYERS HUD STRIP ─── */}
      <div className="pointer-events-auto sm:hidden absolute top-[62px] right-2.5 z-20 flex items-center gap-1.5">
        <MapLayersAndVehiclesToolbar
          fleet={fleet}
          fleetCars={adminSettings.fleet}
          vehicleTiers={adminSettings.vehicles}
          preferences={mapPreferences}
          onTogglePreference={togglePreference}
          onToggleVehicleType={toggleVehicleType}
          onSetSelectedVehicleTypes={setSelectedVehicleTypes}
          variant="mobile"
        />
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
              className="px-3 py-2 rounded-full bg-status-warning-bg/95 active:scale-95 border border-status-warning-border text-status-warning-fg text-[11px] font-bold shadow-lg backdrop-blur-md cursor-pointer flex items-center gap-1.5"
              title="On-shift drivers without live GPS"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>No GPS ({awaitingGpsDrivers.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFitFleet}
            className="w-11 h-11 rounded-full bg-surface-card/95 active:scale-95 border border-border-subtle text-blue-600 shadow-lg backdrop-blur-md cursor-pointer flex items-center justify-center"
            title="Fit all live GPS vehicles"
            aria-label="Fit Fleet"
          >
            <CarIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleRecenterChesterfield}
            className="w-11 h-11 rounded-full bg-surface-card/95 active:scale-95 border border-border-subtle text-fg-secondary shadow-lg backdrop-blur-md cursor-pointer flex items-center justify-center"
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
            className="px-4 py-2.5 rounded-full bg-surface-header hover:bg-surface-header-elevated active:scale-95 text-white text-xs font-extrabold shadow-xl ring-1 ring-white/15 flex items-center gap-2 cursor-pointer transition-all"
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
          className="sm:hidden fixed inset-0 z-[110] bg-surface-overlay/40 backdrop-blur-[2px] flex items-end"
          onClick={dismissAwaitingGps}
        >
          <div
            style={awaitingGpsSheetDrag.sheetStyle}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-surface-card rounded-t-3xl shadow-2xl border-t border-border-subtle pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh] flex flex-col animate-in slide-in-from-bottom-4 duration-150"
          >
            <div {...awaitingGpsSheetDrag.dragHandlers} className="shrink-0 touch-none">
              <div className="pt-2.5 pb-1 flex justify-center">
                <div className="w-10 h-1.5 rounded-full bg-surface-strong" />
              </div>
              <div className="px-4 py-2 border-b border-border-faint flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-extrabold text-fg-primary uppercase tracking-wider">
                    On-Shift Without GPS ({awaitingGpsDrivers.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={dismissAwaitingGps}
                  className="p-1.5 rounded-full bg-surface-muted text-fg-muted hover:text-fg-strong cursor-pointer"
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
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-surface-subtle active:bg-surface-muted border border-border-subtle/80 flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: pal.hex }}
                      />
                      <span className="font-bold text-fg-primary truncate">
                        {extractCabShortLabel(drv)} • {drv.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-fg-muted shrink-0">
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
          className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-3 sm:left-3 sm:right-auto z-30 sm:w-[min(340px,calc(100%-24px))] bg-surface-card/98 backdrop-blur-md rounded-2xl border border-border-subtle shadow-2xl p-3 space-y-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Mobile Drag Handle + Header */}
          <div {...driverSheetDrag.dragHandlers} className="touch-none space-y-1.5">
            <div className="sm:hidden flex justify-center -mt-1">
              <div className="w-9 h-1 rounded-full bg-surface-strong" />
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
                    <span className="font-extrabold text-fg-primary text-sm truncate">
                      {selectedDriver.name}
                    </span>
                    {selectedDriver.driverScore !== undefined && (
                      <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-status-info-bg text-status-info-fg border border-status-info-border shrink-0">
                        {selectedDriver.driverScore}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-fg-muted truncate">
                    {selectedDriver.vehicle} • {selectedDriver.tier}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={dismissSelectedDriver}
                className="p-1.5 sm:p-1 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer"
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
                    ? 'bg-status-success-bg/70 text-status-success-fg border-status-success-border'
                    : 'bg-status-warning-bg text-status-warning-fg border-status-warning-border'
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
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-surface-muted text-fg-muted border border-border-subtle">
                Awaiting GPS Fix
              </span>
            )}

            {selectedDriver.queuedTripsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-status-staged-bg text-status-staged-fg border border-status-staged-border">
                {selectedDriver.queuedTripsCount} Queued
              </span>
            )}

            {distanceToSelectedPickup !== null && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-status-info-bg text-status-info-fg border border-status-info-border">
                {distanceToSelectedPickup.toFixed(1)} mi to pickup
              </span>
            )}
          </div>

          {/* Active Trip Context (if En Route / Arrived / In Progress) */}
          {selectedDriver.activeTrip && (
            <div className="p-2 rounded-xl bg-surface-subtle border border-border-subtle space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-fg-muted">
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
              <div className="flex items-center gap-1.5 text-[11px] text-fg-secondary">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{selectedDriver.activeTrip.pickupLocation?.address}</span>
              </div>
              {getTripIntermediateStopCount(selectedDriver.activeTrip) > 0 && (
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-status-warning-fg">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span>
                    +{getTripIntermediateStopCount(selectedDriver.activeTrip)}{' '}
                    {getTripIntermediateStopCount(selectedDriver.activeTrip) === 1 ? 'stop' : 'stops'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-fg-secondary">
                <MapPinIcon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="truncate">{selectedDriver.activeTrip.dropoffLocation?.address}</span>
              </div>
            </div>
          )}

          {/* Quick Dispatcher Duty Override (Persisted to Firestore) */}
          {onChangeDriverDutyStatus && !selectedDriver.activeTrip && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-bold text-fg-muted uppercase mr-0.5">Set:</span>
              {(
                [
                  { duty: 'on_duty', label: 'Available', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                  { duty: 'on_break', label: 'Break', activeClass: 'bg-amber-500 text-slate-950 border-amber-500' },
                  { duty: 'off_duty', label: 'Offline', activeClass: 'bg-surface-header-muted text-white border-border-header' },
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
                        : 'bg-surface-card text-fg-secondary border-border-subtle hover:bg-surface-subtle'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border-faint">
            <button
              type="button"
              disabled={!selectedDriver.telemetry?.coordinates}
              onClick={handleFindSelectedVehicle}
              className="py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl bg-surface-header hover:bg-surface-header-elevated disabled:bg-surface-emphasis disabled:text-fg-subtle text-white font-bold text-xs sm:text-[11px] shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
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
                className="py-2 sm:py-1.5 px-3 sm:px-2.5 rounded-xl bg-surface-muted hover:bg-surface-emphasis text-fg-strong font-bold text-xs sm:text-[11px] border border-border-subtle transition-colors cursor-pointer flex items-center gap-1"
                title={`Call ${selectedDriver.phone}`}
              >
                <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Call</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── CUSTOM OVERLAY INFO CARD (ZONE / PLACE / DRIVER HOME / EXCLUSION) ─── */}
      <MapCustomOverlayInfoCard
        selectedOverlay={selectedOverlay}
        availableDriversInZone={availableDriversInSelectedZone}
        appliedEndpointFeedback={appliedEndpointFeedback}
        onSetPlaceEndpoint={handleSetPlaceEndpoint}
        onOpenDriverQueue={onOpenDriverQueue}
        onClose={clearSelectedOverlay}
      />

      {/* ─── ROUTE WAYPOINT POPOVER & BOTTOM-LEFT SUMMARY PILL HUD ─── */}
      <MapRouteOverlayHud
        activeRoute={activeRoute}
        waypoints={effectiveWaypoints}
        selectedWaypoint={selectedWaypoint}
        metrics={routeMetrics}
        preferences={mapPreferences}
        hasSelectedDriverHud={Boolean(selectedDriver)}
        onCloseWaypointPopover={clearSelectedWaypoint}
        onPanToWaypoint={handlePanToWaypoint}
        onClearSelectedTrip={handleDismissRouteOverlay}
        onOpenTripDetails={onOpenTripDetails}
      />
    </div>
  );
}

export const LiveFleetMap = React.memo(LiveFleetMapComponent);
