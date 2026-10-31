import React, { useEffect, useRef, useState } from 'react';
import type {
  ZoneGeofence,
  ZoneGroup,
  LocationCollection,
  BlacklistedLocation,
  ZoneCoordinate,
} from '~/core/types/zone';
import { loadGoogleMaps } from '~/core/services/maps/google-maps-loader';

export interface InteractiveZoneGoogleMapProps {
  zones: ZoneGeofence[];
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
  isEditingZone: boolean;
  zoneFormData: ZoneGeofence;
  onChangeZoneFormData: React.Dispatch<React.SetStateAction<ZoneGeofence>>;
  activeSubTab: 'places' | 'zones' | 'groups' | 'collections' | 'blacklists';
  selectedGroup?: ZoneGroup | null;
  locationCollections?: LocationCollection[];
  selectedCollectionId?: string | null;
  selectedPoiId?: string | null;
  onSelectPoi?: (poiId: string, collId: string) => void;
  blacklistedLocations?: BlacklistedLocation[];
  selectedBlacklistId?: string | null;
  onSelectBlacklist?: (id: string) => void;
  onFallbackToSchematic?: () => void;
}

const MILES_TO_METERS = 1609.344;

export function InteractiveZoneGoogleMap({
  zones,
  selectedZoneId,
  onSelectZone,
  isEditingZone,
  zoneFormData,
  onChangeZoneFormData,
  activeSubTab,
  selectedGroup,
  locationCollections = [],
  selectedCollectionId,
  selectedPoiId,
  onSelectPoi,
  blacklistedLocations = [],
  selectedBlacklistId,
  onSelectBlacklist,
  onFallbackToSchematic,
}: InteractiveZoneGoogleMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.Polygon | google.maps.Circle | google.maps.Marker | google.maps.Polyline>>([]);
  const draftOverlaysRef = useRef<Array<google.maps.Polygon | google.maps.Circle | google.maps.Marker | google.maps.Polyline>>([]);
  const isInternalSyncRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Keep latest state in ref for map click listeners
  const latestStateRef = useRef({
    isEditingZone,
    zoneFormData,
    activeSubTab,
    onChangeZoneFormData,
  });
  useEffect(() => {
    latestStateRef.current = {
      isEditingZone,
      zoneFormData,
      activeSubTab,
      onChangeZoneFormData,
    };
  }, [isEditingZone, zoneFormData, activeSubTab, onChangeZoneFormData]);

  // 1. Initialize Google Map
  useEffect(() => {
    let mounted = true;
    loadGoogleMaps()
      .then((googleObj) => {
        if (!mounted) return;
        if (!googleObj || !googleObj.maps || !mapContainerRef.current) {
          setMapError('Google Maps unavailable');
          onFallbackToSchematic?.();
          return;
        }

        if (!mapInstanceRef.current) {
          const map = new googleObj.maps.Map(mapContainerRef.current, {
            center: { lat: 38.6631, lng: -90.45 },
            zoom: 11,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            gestureHandling: 'greedy',
          });

          map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const { isEditingZone: editing, zoneFormData: form, activeSubTab: tab, onChangeZoneFormData: setForm } =
              latestStateRef.current;

            if (!editing || tab !== 'zones') return;

            const clickedCoord: ZoneCoordinate = {
              lat: Number(e.latLng.lat().toFixed(5)),
              lng: Number(e.latLng.lng().toFixed(5)),
            };

            if (form.type === 'polygon') {
              setForm((prev) => ({
                ...prev,
                vertices: [...(prev.vertices || []), clickedCoord],
              }));
            } else if (form.type === 'radius') {
              setForm((prev) => ({
                ...prev,
                center: clickedCoord,
              }));
            }
          });

          mapInstanceRef.current = map;
        }
        setMapReady(true);
      })
      .catch((err) => {
        if (!mounted) return;
        setMapError(err instanceof Error ? err.message : 'Failed to load map');
        onFallbackToSchematic?.();
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Update cursor when drawing polygon
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (isEditingZone && activeSubTab === 'zones') {
      mapInstanceRef.current.setOptions({
        draggableCursor: 'crosshair',
      });
    } else {
      mapInstanceRef.current.setOptions({
        draggableCursor: undefined,
      });
    }
  }, [isEditingZone, activeSubTab, zoneFormData.type, mapReady]);

  // 2. Render saved zones / groups / collections / blacklists
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || typeof google === 'undefined') return;
    const map = mapInstanceRef.current;

    // Clear previous static overlays
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    if (activeSubTab === 'zones' || activeSubTab === 'groups') {
      zones.forEach((zone) => {
        // Skip the zone currently being edited so only the editable draft overlay renders
        if (isEditingZone && activeSubTab === 'zones' && zoneFormData.id && zoneFormData.id === zone.id) {
          return;
        }

        const isSelected = activeSubTab === 'zones' && selectedZoneId === zone.id;
        const isGroupMember = activeSubTab === 'groups' && selectedGroup?.zoneIds.includes(zone.id);
        const color = isGroupMember ? selectedGroup?.color || '#6366f1' : zone.color || '#3b82f6';
        const fillOpacity = isSelected || isGroupMember ? 0.32 : 0.14;
        const strokeWeight = isSelected || isGroupMember ? 3 : 1.75;

        if (zone.type === 'radius' && zone.center) {
          const circle = new google.maps.Circle({
            map,
            center: zone.center,
            radius: (zone.radiusMiles || 3) * MILES_TO_METERS,
            strokeColor: color,
            strokeOpacity: zone.isActive ? 0.9 : 0.4,
            strokeWeight,
            fillColor: color,
            fillOpacity: zone.isActive ? fillOpacity : 0.05,
            clickable: !isEditingZone,
          });
          if (!isEditingZone) {
            circle.addListener('click', () => {
              if (activeSubTab === 'zones') onSelectZone(zone.id);
            });
          }
          overlaysRef.current.push(circle);
        } else if (zone.type === 'polygon' && zone.vertices && zone.vertices.length >= 3) {
          const poly = new google.maps.Polygon({
            map,
            paths: zone.vertices,
            strokeColor: color,
            strokeOpacity: zone.isActive ? 0.95 : 0.4,
            strokeWeight,
            fillColor: color,
            fillOpacity: zone.isActive ? fillOpacity : 0.05,
            clickable: !isEditingZone,
          });
          if (!isEditingZone) {
            poly.addListener('click', () => {
              if (activeSubTab === 'zones') onSelectZone(zone.id);
            });
          }
          overlaysRef.current.push(poly);
        }
      });
    } else if (activeSubTab === 'collections') {
      locationCollections.forEach((coll) => {
        const isCollSelected = selectedCollectionId === coll.id;
        const bufferMeters = (coll.proximityRadiusMiles ?? 0.5) * MILES_TO_METERS;
        (coll.locations || []).forEach((loc) => {
          const isPoiSelected = selectedPoiId === loc.id;
          const circle = new google.maps.Circle({
            map,
            center: loc.coordinates,
            radius: bufferMeters,
            strokeColor: '#10b981',
            strokeOpacity: 0.85,
            strokeWeight: isPoiSelected ? 2.5 : 1.2,
            fillColor: '#10b981',
            fillOpacity: isCollSelected || isPoiSelected ? 0.25 : 0.1,
            clickable: true,
          });
          const marker = new google.maps.Marker({
            map,
            position: loc.coordinates,
            title: loc.name,
          });
          const handleClick = () => onSelectPoi?.(loc.id, coll.id);
          circle.addListener('click', handleClick);
          marker.addListener('click', handleClick);
          overlaysRef.current.push(circle, marker);
        });
      });
    } else if (activeSubTab === 'blacklists') {
      blacklistedLocations.forEach((loc) => {
        if (!loc.coordinates) return;
        const isSelected = selectedBlacklistId === loc.id;
        const color = loc.action === 'BLACKLIST_BLOCK' ? '#ef4444' : '#f59e0b';
        const circle = new google.maps.Circle({
          map,
          center: loc.coordinates,
          radius: Math.max(150, (loc.radiusMiles || 0.1) * MILES_TO_METERS),
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: isSelected ? 3 : 1.5,
          fillColor: color,
          fillOpacity: isSelected ? 0.35 : 0.2,
          clickable: true,
        });
        circle.addListener('click', () => onSelectBlacklist?.(loc.id));
        overlaysRef.current.push(circle);
      });
    }
  }, [
    mapReady,
    zones,
    selectedZoneId,
    isEditingZone,
    zoneFormData.id,
    activeSubTab,
    selectedGroup,
    locationCollections,
    selectedCollectionId,
    selectedPoiId,
    blacklistedLocations,
    selectedBlacklistId,
  ]);

  // 3. Render interactive editable draft zone (Polygon or Radius)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || typeof google === 'undefined') return;
    if (isInternalSyncRef.current) {
      isInternalSyncRef.current = false;
      return;
    }

    const map = mapInstanceRef.current;

    // Clear previous draft overlays
    draftOverlaysRef.current.forEach((o) => o.setMap(null));
    draftOverlaysRef.current = [];

    if (!isEditingZone || activeSubTab !== 'zones') return;

    const color = zoneFormData.color || '#3b82f6';

    if (zoneFormData.type === 'polygon') {
      const vertices = zoneFormData.vertices || [];

      if (vertices.length >= 2) {
        const poly = new google.maps.Polygon({
          map,
          paths: vertices,
          strokeColor: color,
          strokeOpacity: 1,
          strokeWeight: 3,
          fillColor: color,
          fillOpacity: 0.28,
          editable: true,
          draggable: false,
          clickable: true,
        });

        const path = poly.getPath();
        const syncPathToState = () => {
          const updatedVertices: ZoneCoordinate[] = [];
          for (let i = 0; i < path.getLength(); i++) {
            const pt = path.getAt(i);
            updatedVertices.push({
              lat: Number(pt.lat().toFixed(5)),
              lng: Number(pt.lng().toFixed(5)),
            });
          }
          isInternalSyncRef.current = true;
          onChangeZoneFormData((prev) => ({
            ...prev,
            vertices: updatedVertices,
          }));
        };

        path.addListener('set_at', syncPathToState);
        path.addListener('insert_at', syncPathToState);
        path.addListener('remove_at', syncPathToState);

        // Allow right-clicking a vertex on the map to delete it
        poly.addListener('contextmenu', (e: google.maps.PolyMouseEvent) => {
          if (e.vertex !== undefined && path.getLength() > 3) {
            path.removeAt(e.vertex);
          }
        });

        // Forward clicks inside the polygon to add a new vertex if less than 3 points
        poly.addListener('click', (e: google.maps.PolyMouseEvent) => {
          if (e.vertex !== undefined || e.edge !== undefined) return;
          if (!e.latLng) return;
          const clickedCoord: ZoneCoordinate = {
            lat: Number(e.latLng.lat().toFixed(5)),
            lng: Number(e.latLng.lng().toFixed(5)),
          };
          onChangeZoneFormData((prev) => ({
            ...prev,
            vertices: [...(prev.vertices || []), clickedCoord],
          }));
        });

        draftOverlaysRef.current.push(poly);
      } else if (vertices.length === 1) {
        const marker = new google.maps.Marker({
          map,
          position: vertices[0],
          label: {
            text: '1',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '11px',
          },
          draggable: true,
        });
        marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          isInternalSyncRef.current = true;
          onChangeZoneFormData((prev) => ({
            ...prev,
            vertices: [
              {
                lat: Number(e.latLng!.lat().toFixed(5)),
                lng: Number(e.latLng!.lng().toFixed(5)),
              },
            ],
          }));
        });
        draftOverlaysRef.current.push(marker);
      }
    } else if (zoneFormData.type === 'radius') {
      const center = zoneFormData.center || { lat: 38.6631, lng: -90.5771 };
      const radiusMeters = (zoneFormData.radiusMiles || 3.0) * MILES_TO_METERS;

      const circle = new google.maps.Circle({
        map,
        center,
        radius: radiusMeters,
        strokeColor: color,
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: color,
        fillOpacity: 0.25,
        editable: true,
        draggable: true,
      });

      circle.addListener('center_changed', () => {
        const newCenter = circle.getCenter();
        if (!newCenter) return;
        const lat = Number(newCenter.lat().toFixed(5));
        const lng = Number(newCenter.lng().toFixed(5));
        isInternalSyncRef.current = true;
        onChangeZoneFormData((prev) => ({
          ...prev,
          center: { lat, lng },
        }));
      });

      circle.addListener('radius_changed', () => {
        const newMeters = circle.getRadius();
        const newMiles = Math.max(0.5, Number((newMeters / MILES_TO_METERS).toFixed(1)));
        isInternalSyncRef.current = true;
        onChangeZoneFormData((prev) => ({
          ...prev,
          radiusMiles: newMiles,
        }));
      });

      draftOverlaysRef.current.push(circle);
    }
  }, [
    mapReady,
    isEditingZone,
    activeSubTab,
    zoneFormData.type,
    zoneFormData.color,
    zoneFormData.vertices,
    zoneFormData.center,
    zoneFormData.radiusMiles,
  ]);

  if (mapError) {
    return null;
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full" />
      {!mapReady && (
        <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center text-xs text-slate-300">
          Loading interactive regional map...
        </div>
      )}
    </div>
  );
}
