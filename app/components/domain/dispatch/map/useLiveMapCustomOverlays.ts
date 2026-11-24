/// <reference types="google.maps" />

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { DispatchMapPreferences } from '../../../../core/hooks/dispatch/useDispatchMapPreferences';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import {
  getZoneService,
  isCoordinateInZone,
  calculateHaversineDistanceMiles,
} from '../../../../core/services/zones/zone.service';
import {
  getSpecialPlacesService,
  type SpecialPlace,
} from '../../../../core/services/places/special-places.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import type {
  BlacklistedLocation,
  ZoneCoordinate,
  ZoneGeofence,
} from '../../../../core/types/zone';

const MILES_TO_METERS = 1609.344;

export type CustomPlaceMarkerCategory = 'airport' | 'hotel' | 'hospital' | 'venue';

export interface MapOverlayPlaceItem {
  id: string;
  name: string;
  address: string;
  coordinates: ZoneCoordinate;
  category: CustomPlaceMarkerCategory;
  categoryLabel: string;
  flatFee?: number;
  notes?: string;
}

export type SelectedCustomOverlayItem =
  | { kind: 'zone'; zone: ZoneGeofence }
  | { kind: 'place'; place: MapOverlayPlaceItem }
  | { kind: 'exclusion'; exclusion: BlacklistedLocation };

export interface PopulateBookingEndpointPayload {
  pickupAddress?: string;
  pickupCoordinates?: { lat: number; lng: number };
  dropoffAddress?: string;
  dropoffCoordinates?: { lat: number; lng: number };
}

const PLACE_CATEGORY_META: Record<
  CustomPlaceMarkerCategory,
  { label: string; glyph: string; hex: string; darkHex: string }
> = {
  airport: { label: '✈️ Airports / FBOs', glyph: 'AIR', hex: '#0284c7', darkHex: '#0369a1' },
  hotel: { label: '🏨 Hotels', glyph: 'HTL', hex: '#d97706', darkHex: '#b45309' },
  hospital: { label: '🏥 Hospitals', glyph: 'MED', hex: '#e11d48', darkHex: '#be123c' },
  venue: { label: '🏢 Venues / Corporate', glyph: 'HUB', hex: '#4f46e5', darkHex: '#3730a3' },
};

const placePinSvgCache = new Map<CustomPlaceMarkerCategory, string>();

function buildPlaceMarkerDataUrl(category: CustomPlaceMarkerCategory): string {
  const cached = placePinSvgCache.get(category);
  if (cached) return cached;
  const meta = PLACE_CATEGORY_META[category];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42"><path d="M18 40 C18 40 31 26.5 31 16 A13 13 0 1 0 5 16 C5 26.5 18 40 18 40 Z" fill="${meta.hex}" stroke="#ffffff" stroke-width="2.2"/><circle cx="18" cy="15.5" r="9.2" fill="${meta.darkHex}"/><text x="18" y="18.6" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="7.5" font-weight="900" fill="#ffffff">${meta.glyph}</text></svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  placePinSvgCache.set(category, url);
  return url;
}

function normalizePlaceCategory(raw?: string): CustomPlaceMarkerCategory {
  const c = String(raw || '').trim().toLowerCase();
  if (c === 'airport' || c === 'hotel' || c === 'hospital') return c;
  return 'venue';
}

function isValidCoord(c?: ZoneCoordinate | null): c is ZoneCoordinate {
  return Boolean(
    c &&
      typeof c.lat === 'number' &&
      typeof c.lng === 'number' &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      (c.lat !== 0 || c.lng !== 0)
  );
}

/**
 * Pure filter/mapper for the Dispatch Map `Places` overlay:
 * Renders strictly active Starred (`isPopular`) non-archived Admin `SpecialPlace` entries.
 */
export function buildStarredPlacesOverlayItems(
  specialPlaces: readonly SpecialPlace[] | null | undefined
): MapOverlayPlaceItem[] {
  const merged: MapOverlayPlaceItem[] = [];
  for (const sp of specialPlaces || []) {
    if (!sp.isActive || !sp.isPopular || sp.isArchived) continue;
    if (!isValidCoord(sp.coordinates) || !sp.address) continue;
    const candidateName = (sp.shortName || sp.name || '').trim();
    if (!candidateName) continue;
    const dup = merged.some(
      (ex) =>
        ex.name.trim().toLowerCase() === candidateName.toLowerCase() ||
        calculateHaversineDistanceMiles(ex.coordinates, sp.coordinates) < 0.05
    );
    if (dup) continue;
    const cat = normalizePlaceCategory(sp.category);
    merged.push({
      id: `sp-${sp.id}`,
      name: candidateName,
      address: sp.address,
      coordinates: sp.coordinates,
      category: cat,
      categoryLabel: PLACE_CATEGORY_META[cat].label,
      notes: sp.notes,
    });
  }
  return merged;
}

function disposeGoogleOverlayList(
  items: Array<{ setMap: (map: google.maps.Map | null) => void }>
): void {
  for (const item of items) {
    try {
      if (typeof google !== 'undefined' && google?.maps?.event) {
        google.maps.event.clearInstanceListeners(item);
      }
      item.setMap(null);
    } catch {}
  }
}

export interface UseLiveMapCustomOverlaysParams {
  mapReady: boolean;
  mapInstanceRef: React.RefObject<google.maps.Map | null>;
  preferences: DispatchMapPreferences;
  fleet: LiveFleetDriver[];
  onPopulateBooking?: (payload: PopulateBookingEndpointPayload) => void;
}

export function useLiveMapCustomOverlays({
  mapReady,
  mapInstanceRef,
  preferences,
  fleet,
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
      setSelectedOverlay((prev) => (prev?.kind === 'place' ? null : prev));
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
        if (prev?.kind !== 'place') return prev;
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
