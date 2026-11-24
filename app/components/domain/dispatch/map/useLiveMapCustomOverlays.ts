/// <reference types="google.maps" />

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { DispatchMapPreferences } from '../../../../core/hooks/dispatch/useDispatchMapPreferences';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type {
  CompanyInfoConfig,
  FleetCarConfig,
  VehicleTierConfig,
} from '../../../../core/types/config';
import { getZoneService, isCoordinateInZone } from '../../../../core/services/zones/zone.service';
import {
  getSpecialPlacesService,
  type SpecialPlace,
} from '../../../../core/services/places/special-places.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import type { BlacklistedLocation, ZoneGeofence } from '../../../../core/types/zone';
import {
  buildDriverHomePinDataUrl,
  buildDriverHomesOverlayItems,
  formatDriverShiftScheduleSummary,
  useDriverHomesMapLayer,
  type DriverHomeOverlayItem,
} from './driver-homes-overlay.util';
import {
  DEFAULT_HEADQUARTERS_FALLBACK_COORDS,
  buildHeadquartersPinDataUrl,
  buildPlaceMarkerDataUrl,
  buildStarredPlacesOverlayItems,
  disposeGoogleOverlayList,
  isValidCoord,
  resolveHeadquartersCoordinates,
  resolveHeadquartersOverlayPlace,
  useHeadquartersMapPin,
  type CustomPlaceMarkerCategory,
  type MapOverlayPlaceItem,
} from './hq-place-marker.util';

export {
  DEFAULT_HEADQUARTERS_FALLBACK_COORDS,
  buildDriverHomePinDataUrl,
  buildDriverHomesOverlayItems,
  buildHeadquartersPinDataUrl,
  buildPlaceMarkerDataUrl,
  buildStarredPlacesOverlayItems,
  formatDriverShiftScheduleSummary,
  resolveHeadquartersCoordinates,
  resolveHeadquartersOverlayPlace,
  type CustomPlaceMarkerCategory,
  type DriverHomeOverlayItem,
  type MapOverlayPlaceItem,
};

const MILES_TO_METERS = 1609.344;

export type SelectedCustomOverlayItem =
  | { kind: 'zone'; zone: ZoneGeofence }
  | { kind: 'place'; place: MapOverlayPlaceItem }
  | { kind: 'exclusion'; exclusion: BlacklistedLocation }
  | { kind: 'driver_home'; driverHome: DriverHomeOverlayItem };

export interface PopulateBookingEndpointPayload {
  pickupAddress?: string;
  pickupCoordinates?: { lat: number; lng: number };
  dropoffAddress?: string;
  dropoffCoordinates?: { lat: number; lng: number };
}

export interface UseLiveMapCustomOverlaysParams {
  mapReady: boolean;
  mapInstanceRef: React.RefObject<google.maps.Map | null>;
  preferences: DispatchMapPreferences;
  fleet: LiveFleetDriver[];
  fleetCars?: FleetCarConfig[] | null;
  vehicleTiers?: VehicleTierConfig[] | null;
  companyInfo?: Partial<CompanyInfoConfig> | null;
  onPopulateBooking?: (payload: PopulateBookingEndpointPayload) => void;
}

export function useLiveMapCustomOverlays({
  mapReady,
  mapInstanceRef,
  preferences,
  fleet,
  fleetCars,
  vehicleTiers,
  companyInfo,
  onPopulateBooking,
}: UseLiveMapCustomOverlaysParams) {
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const zoneShapesRef = useRef<Array<google.maps.Polygon | google.maps.Circle>>([]);
  const placeMarkersRef = useRef<google.maps.Marker[]>([]);
  const exclusionCirclesRef = useRef<google.maps.Circle[]>([]);

  const [selectedOverlay, setSelectedOverlay] = useState<SelectedCustomOverlayItem | null>(null);
  const [appliedEndpointFeedback, setAppliedEndpointFeedback] = useState<'pickup' | 'dropoff' | null>(null);

  const clearSelectedOverlay = useCallback(() => {
    setSelectedOverlay(null);
    setAppliedEndpointFeedback(null);
  }, []);

  const handleSelectHqPlace = useCallback((hqPlace: MapOverlayPlaceItem) => {
    setAppliedEndpointFeedback(null);
    setSelectedOverlay({ kind: 'place', place: hqPlace });
  }, []);

  const handleSyncHqPlace = useCallback((hqPlace: MapOverlayPlaceItem) => {
    setSelectedOverlay((prev) =>
      prev?.kind === 'place' && prev.place.id === 'company-hq' ? { kind: 'place', place: hqPlace } : prev
    );
  }, []);

  useHeadquartersMapPin({
    mapReady,
    mapInstanceRef,
    companyInfoOverride: companyInfo,
    onSelectPlace: handleSelectHqPlace,
    onSyncPlaceIfSelected: handleSyncHqPlace,
  });

  const handleSelectDriverHome = useCallback((driverHome: DriverHomeOverlayItem) => {
    setAppliedEndpointFeedback(null);
    setSelectedOverlay({ kind: 'driver_home', driverHome });
  }, []);

  const handleClearHiddenDriverHome = useCallback((validDriverIds: Set<string>) => {
    setSelectedOverlay((prev) =>
      prev?.kind === 'driver_home' && !validDriverIds.has(prev.driverHome.driverId) ? null : prev
    );
  }, []);

  useDriverHomesMapLayer({
    mapReady,
    mapInstanceRef,
    showDriverHomesOverlay: preferences.showDriverHomesOverlay,
    fleet,
    selectedVehicleTypes: preferences.selectedVehicleTypes,
    fleetCars,
    vehicleTiers,
    onSelectDriverHome: handleSelectDriverHome,
    onClearIfHidden: handleClearHiddenDriverHome,
  });

  // 1. Live Google TrafficLayer lifecycle
  useEffect(() => {
    if (
      !mapReady ||
      !mapInstanceRef.current ||
      !preferences.showTrafficOverlay ||
      typeof window === 'undefined' ||
      !window.google?.maps?.TrafficLayer
    ) {
      if (trafficLayerRef.current) {
        try {
          trafficLayerRef.current.setMap(null);
        } catch {}
        trafficLayerRef.current = null;
      }
      return;
    }
    const layer = new window.google.maps.TrafficLayer();
    layer.setMap(mapInstanceRef.current);
    trafficLayerRef.current = layer;
    return () => {
      try {
        layer.setMap(null);
      } catch {}
      if (trafficLayerRef.current === layer) trafficLayerRef.current = null;
    };
  }, [mapReady, mapInstanceRef, preferences.showTrafficOverlay]);

  // 2. Active Zones (/zones) Polygons & Circles lifecycle
  useEffect(() => {
    disposeGoogleOverlayList(zoneShapesRef.current);
    zoneShapesRef.current = [];
    if (!preferences.showZonesOverlay) {
      setSelectedOverlay((prev) => (prev?.kind === 'zone' ? null : prev));
      return;
    }
    if (!mapReady || !mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps) {
      return;
    }

    let cancelled = false;
    const map = mapInstanceRef.current;
    const gMaps = window.google.maps;

    getZoneService()
      .getZones()
      .then((allZones) => {
        if (cancelled || !mapInstanceRef.current) return;
        const created: Array<google.maps.Polygon | google.maps.Circle> = [];
        for (const zone of (allZones || []).filter((z) => z.isActive && !z.isArchived)) {
          const color = zone.color || '#3b82f6';
          const shapeOpts = {
            map,
            strokeColor: color,
            strokeOpacity: 0.85,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.12,
            clickable: true,
            zIndex: 20,
          };
          if (zone.type === 'polygon' && Array.isArray(zone.vertices) && zone.vertices.length >= 3) {
            const poly = new gMaps.Polygon({ ...shapeOpts, paths: zone.vertices });
            poly.addListener('click', () => {
              setAppliedEndpointFeedback(null);
              setSelectedOverlay({ kind: 'zone', zone });
            });
            created.push(poly);
          } else if (zone.type === 'radius' && isValidCoord(zone.center) && (zone.radiusMiles || 0) > 0) {
            const circle = new gMaps.Circle({
              ...shapeOpts,
              center: zone.center,
              radius: (zone.radiusMiles || 3) * MILES_TO_METERS,
            });
            circle.addListener('click', () => {
              setAppliedEndpointFeedback(null);
              setSelectedOverlay({ kind: 'zone', zone });
            });
            created.push(circle);
          }
        }
        zoneShapesRef.current = created;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      disposeGoogleOverlayList(zoneShapesRef.current);
      zoneShapesRef.current = [];
    };
  }, [mapReady, mapInstanceRef, preferences.showZonesOverlay]);

  // 3. Starred Admin Places (sp.isActive && sp.isPopular && !sp.isArchived) lifecycle
  useEffect(() => {
    disposeGoogleOverlayList(placeMarkersRef.current);
    placeMarkersRef.current = [];
    if (!preferences.showPlacesOverlay) {
      setSelectedOverlay((prev) =>
        prev?.kind === 'place' && prev.place.id !== 'company-hq' ? null : prev
      );
      return;
    }
    if (!mapReady || !mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps?.Marker) {
      return;
    }

    let cancelled = false;
    const map = mapInstanceRef.current;
    const gMaps = window.google.maps;
    const placesSvc = getSpecialPlacesService();

    const renderPlacesList = (specialPlaces: readonly SpecialPlace[]) => {
      if (cancelled || !mapInstanceRef.current) return;
      disposeGoogleOverlayList(placeMarkersRef.current);
      const starredItems = buildStarredPlacesOverlayItems(specialPlaces);
      setSelectedOverlay((prev) => {
        if (prev?.kind !== 'place' || prev.place.id === 'company-hq') return prev;
        const updated = starredItems.find((p) => p.id === prev.place.id);
        return updated ? { kind: 'place', place: updated } : null;
      });
      placeMarkersRef.current = starredItems.map((place) => {
        const marker = new gMaps.Marker({
          position: place.coordinates,
          map,
          icon: {
            url: buildPlaceMarkerDataUrl(place.category),
            scaledSize: new gMaps.Size(30, 35),
            anchor: new gMaps.Point(15, 34),
          },
          title: `${place.categoryLabel} · ${place.name}`,
          zIndex: 120,
        });
        marker.addListener('click', () => {
          setAppliedEndpointFeedback(null);
          setSelectedOverlay({ kind: 'place', place });
        });
        return marker;
      });
    };

    placesSvc
      .syncWithFirestore()
      .then((specialPlaces) => renderPlacesList(specialPlaces))
      .catch(() => renderPlacesList(placesSvc.getAllPlaces()));

    const unsubLocal = placesSvc.subscribe((updatedPlaces) => renderPlacesList(updatedPlaces));
    const unsubBus = getWorkspaceBus().subscribe((msg) => {
      if (msg.type === 'SPECIAL_PLACES_UPDATED') {
        placesSvc
          .syncWithFirestore()
          .then((specialPlaces) => renderPlacesList(specialPlaces))
          .catch(() => renderPlacesList(placesSvc.getAllPlaces()));
      }
    });

    return () => {
      cancelled = true;
      unsubLocal();
      unsubBus();
      disposeGoogleOverlayList(placeMarkersRef.current);
      placeMarkersRef.current = [];
    };
  }, [mapReady, mapInstanceRef, preferences.showPlacesOverlay]);

  // 4. Safety Exclusion Circles (/blacklistedLocations) lifecycle
  useEffect(() => {
    disposeGoogleOverlayList(exclusionCirclesRef.current);
    exclusionCirclesRef.current = [];
    if (!preferences.showExclusionsOverlay) {
      setSelectedOverlay((prev) => (prev?.kind === 'exclusion' ? null : prev));
      return;
    }
    if (!mapReady || !mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps?.Circle) {
      return;
    }

    let cancelled = false;
    const map = mapInstanceRef.current;
    const gMaps = window.google.maps;

    getZoneService()
      .getBlacklistedLocations()
      .then((locs) => {
        if (cancelled || !mapInstanceRef.current) return;
        const activeLocs = (locs || []).filter(
          (b) => b.isActive && !b.isArchived && isValidCoord(b.coordinates)
        );
        exclusionCirclesRef.current = activeLocs.map((exclusion) => {
          const color = exclusion.action === 'BLACKLIST_BLOCK' ? '#ef4444' : '#f59e0b';
          const circle = new gMaps.Circle({
            center: exclusion.coordinates,
            radius: Math.max(0.08, exclusion.radiusMiles || 0.25) * MILES_TO_METERS,
            map,
            strokeColor: color,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.16,
            clickable: true,
            zIndex: 25,
          });
          circle.addListener('click', () => {
            setAppliedEndpointFeedback(null);
            setSelectedOverlay({ kind: 'exclusion', exclusion });
          });
          return circle;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      disposeGoogleOverlayList(exclusionCirclesRef.current);
      exclusionCirclesRef.current = [];
    };
  }, [mapReady, mapInstanceRef, preferences.showExclusionsOverlay]);

  const availableDriversInSelectedZone = useMemo(() => {
    if (!selectedOverlay || selectedOverlay.kind !== 'zone') return 0;
    return fleet.reduce((acc, drv) => {
      if (drv.isBlacklisted || drv.mapStatus !== 'available' || !drv.telemetry?.coordinates) {
        return acc;
      }
      return isCoordinateInZone(drv.telemetry.coordinates, selectedOverlay.zone) ? acc + 1 : acc;
    }, 0);
  }, [fleet, selectedOverlay]);

  const handleSetPlaceEndpoint = useCallback(
    (place: MapOverlayPlaceItem, endpoint: 'pickup' | 'dropoff') => {
      const payload: PopulateBookingEndpointPayload =
        endpoint === 'pickup'
          ? { pickupAddress: place.address, pickupCoordinates: { ...place.coordinates } }
          : { dropoffAddress: place.address, dropoffCoordinates: { ...place.coordinates } };
      onPopulateBooking?.(payload);
      getWorkspaceBus().publish('POPULATE_BOOKING', payload);
      setAppliedEndpointFeedback(endpoint);
    },
    [onPopulateBooking]
  );

  return {
    selectedOverlay,
    availableDriversInSelectedZone,
    appliedEndpointFeedback,
    clearSelectedOverlay,
    handleSetPlaceEndpoint,
  };
}
