/// <reference types="google.maps" />

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoPoint, Trip } from '../../../../core/types/trip';
import type { DispatchMapPreferences } from '../../../../core/hooks/dispatch/useDispatchMapPreferences';
import {
  applyCachedDirectionsToWaypoints,
  clearRoutePolylines,
  clearRouteWaypointMarkers,
  extractDirectionsRouteSnapshot,
  frameRouteViewportOnMap,
  geocodeAddressCached,
  getCachedDirectionsResult,
  isRoutableMapRoute,
  resolveActiveRouteContext,
  setCachedDirectionsResult,
  syncRoutePolylines,
  syncRouteWaypointMarkers,
  type ActiveRouteContext,
  type ResolvedRouteMetrics,
  type ResolvedRouteWaypoint,
  type RoutePolylineHandles,
} from './route-map-sync';

export interface UseLiveMapRouteOverlaySyncParams {
  mapReady: boolean;
  mapInstanceRef: React.RefObject<google.maps.Map | null>;
  directionsRendererRef: React.RefObject<google.maps.DirectionsRenderer | null>;
  routePolylineHandlesRef: React.RefObject<RoutePolylineHandles>;
  routeWaypointMarkersRef: React.RefObject<Map<string, google.maps.Marker>>;
  selectedTrip?: Trip | null;
  activeFormValues?: any;
  activeTrip?: Trip | null;
  shouldZoom: boolean;
  mapPreferences: DispatchMapPreferences;
  onClearSelectedTrip?: () => void;
}

export interface UseLiveMapRouteOverlaySyncResult {
  activeRoute: ActiveRouteContext | null;
  effectiveWaypoints: ResolvedRouteWaypoint[];
  selectedWaypoint: ResolvedRouteWaypoint | null;
  routeMetrics: ResolvedRouteMetrics | null;
  clearSelectedWaypoint: () => void;
  handlePanToWaypoint: (waypoint: ResolvedRouteWaypoint) => void;
  handleDismissRouteOverlay: (() => void) | undefined;
}

export function useLiveMapRouteOverlaySync({
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
}: UseLiveMapRouteOverlaySyncParams): UseLiveMapRouteOverlaySyncResult {
  const directionsSeqRef = useRef<number>(0);
  const lastRenderedRouteSigRef = useRef<string>('');
  const lastFramedRouteKeyRef = useRef<string>('');

  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [snappedWaypoints, setSnappedWaypoints] = useState<ResolvedRouteWaypoint[] | null>(null);
  const [routePath, setRoutePath] = useState<GeoPoint[]>([]);
  const [routeMetrics, setRouteMetrics] = useState<ResolvedRouteMetrics | null>(null);
  const [dismissedRouteSig, setDismissedRouteSig] = useState<string | null>(null);

  const stopsSig = [
    ...(selectedTrip?.intermediateStops || []),
    ...(Array.isArray(activeFormValues?.intermediateStops)
      ? activeFormValues.intermediateStops
      : []),
    ...(activeTrip?.intermediateStops || []),
  ]
    .map((s: any) => `${s?.address || ''}|${s?.coordinates?.lat ?? ''},${s?.coordinates?.lng ?? ''}`)
    .join(';');

  const rawActiveRoute = useMemo(
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
      activeFormValues?.pickupPlaceId,
      activeFormValues?.dropoffAddress,
      activeFormValues?.dropoffCoordinates?.lat,
      activeFormValues?.dropoffCoordinates?.lng,
      activeFormValues?.dropoffPlaceId,
      activeTrip?.id,
      activeTrip?.pickupLocation?.address,
      activeTrip?.dropoffLocation?.address,
      stopsSig,
      shouldZoom,
    ]
  );

  const activeRoute = useMemo(() => {
    if (!rawActiveRoute) return null;
    if (
      rawActiveRoute.source === 'draft_form' &&
      dismissedRouteSig === rawActiveRoute.locationSignature
    ) {
      return null;
    }
    return rawActiveRoute;
  }, [rawActiveRoute, dismissedRouteSig]);

  const dismissOverlayCallback = useCallback(() => {
    if (rawActiveRoute?.source === 'draft_form') {
      setDismissedRouteSig(rawActiveRoute.locationSignature);
    }
    onClearSelectedTrip?.();
  }, [rawActiveRoute, onClearSelectedTrip]);

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

    const frameKey = `${activeRoute.source}:${activeRoute.tripId || 'draft'}:${activeRoute.locationSignature}`;
    const shouldFrameViewport =
      Boolean(shouldZoom || activeRoute.source === 'draft_form') &&
      lastFramedRouteKeyRef.current !== frameKey;

    const fallbackPath = activeRoute.waypoints.map((w) => w.coordinates);

    // 1. Single-endpoint or partial booking-form preview (before both Pickup & Dropoff exist)
    if (!activeRoute.hasFullRoute) {
      try {
        directionsRendererRef.current?.setDirections({ routes: [] } as any);
      } catch {}
      setSnappedWaypoints(null);
      setRoutePath(activeRoute.waypoints.length >= 2 ? fallbackPath : []);
      setRouteMetrics(null);

      const needsGeocode = activeRoute.waypoints.some((w) => !w.hasExplicitCoordinates);
      if (!needsGeocode || typeof window.google?.maps?.Geocoder !== 'function') {
        if (shouldFrameViewport) {
          lastFramedRouteKeyRef.current = frameKey;
          frameRouteViewportOnMap({
            map: mapInstanceRef.current,
            waypoints: activeRoute.waypoints,
            path: fallbackPath,
          });
        }
        return;
      }

      const requestSeq = ++directionsSeqRef.current;
      const geocodeTimer = setTimeout(() => {
        void Promise.all(
          activeRoute.waypoints.map(async (wp) => {
            if (wp.hasExplicitCoordinates) return wp;
            const resolvedPt = await geocodeAddressCached(wp.address);
            return resolvedPt
              ? { ...wp, coordinates: resolvedPt, hasExplicitCoordinates: true }
              : wp;
          })
        ).then((resolvedWps) => {
          if (requestSeq !== directionsSeqRef.current) return;
          setSnappedWaypoints(resolvedWps);
          const nextPath = resolvedWps.length >= 2 ? resolvedWps.map((w) => w.coordinates) : [];
          setRoutePath(nextPath);
          if ((shouldZoom || activeRoute.source === 'draft_form') && mapInstanceRef.current) {
            lastFramedRouteKeyRef.current = frameKey;
            frameRouteViewportOnMap({
              map: mapInstanceRef.current,
              waypoints: resolvedWps,
              path: nextPath,
            });
          }
        });
      }, 450);

      return () => clearTimeout(geocodeTimer);
    }

    // 2. Full route: check 50-entry LRU Directions cache first (0ms, 0 extra API calls)
    const cachedRoute = getCachedDirectionsResult(activeRoute.locationSignature);
    if (cachedRoute) {
      const mergedWaypoints = applyCachedDirectionsToWaypoints(cachedRoute, activeRoute.waypoints);
      setSnappedWaypoints(mergedWaypoints);
      setRoutePath(cachedRoute.path);
      setRouteMetrics(cachedRoute.metrics);
      if (shouldFrameViewport) {
        lastFramedRouteKeyRef.current = frameKey;
        frameRouteViewportOnMap({
          map: mapInstanceRef.current,
          waypoints: mergedWaypoints,
          path: cachedRoute.path,
          bounds: cachedRoute.bounds,
        });
      }
      return;
    }

    setSnappedWaypoints(null);
    setRoutePath(fallbackPath);
    setRouteMetrics(null);

    if (
      !isRoutableMapRoute(activeRoute) ||
      typeof window.google?.maps?.DirectionsService !== 'function'
    ) {
      try {
        directionsRendererRef.current?.setDirections({ routes: [] } as any);
      } catch {}
      if (shouldFrameViewport) {
        lastFramedRouteKeyRef.current = frameKey;
        frameRouteViewportOnMap({
          map: mapInstanceRef.current,
          waypoints: activeRoute.waypoints,
          path: fallbackPath,
        });
      }
      return;
    }

    if (shouldFrameViewport && activeRoute.waypoints.every((w) => w.hasExplicitCoordinates)) {
      frameRouteViewportOnMap({
        map: mapInstanceRef.current,
        waypoints: activeRoute.waypoints,
        path: fallbackPath,
      });
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
            const routeBounds = result.routes?.[0]?.bounds || null;
            setCachedDirectionsResult(activeRoute.locationSignature, {
              ...snapshot,
              bounds: routeBounds,
            });
            setSnappedWaypoints(snapshot.snappedWaypoints);
            setRoutePath(snapshot.path);
            setRouteMetrics(snapshot.metrics);
            if ((shouldZoom || activeRoute.source === 'draft_form') && mapInstanceRef.current) {
              lastFramedRouteKeyRef.current = frameKey;
              frameRouteViewportOnMap({
                map: mapInstanceRef.current,
                waypoints: snapshot.snappedWaypoints,
                path: snapshot.path,
                bounds: routeBounds,
              });
            }
          } else if (shouldFrameViewport && mapInstanceRef.current) {
            lastFramedRouteKeyRef.current = frameKey;
            frameRouteViewportOnMap({
              map: mapInstanceRef.current,
              waypoints: activeRoute.waypoints,
              path: fallbackPath,
            });
          }
        }
      );
    }, 350);

    return () => clearTimeout(timer);
  }, [mapReady, activeRoute, shouldZoom, mapInstanceRef, directionsRendererRef, routePolylineHandlesRef, routeWaypointMarkersRef]);

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
  }, [mapReady, routePath, mapPreferences.casedRouteWithArrows, mapInstanceRef, routePolylineHandlesRef]);

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
    mapInstanceRef,
    routeWaypointMarkersRef,
  ]);

  const selectedWaypoint = useMemo(
    () =>
      selectedWaypointId ? effectiveWaypoints.find((w) => w.id === selectedWaypointId) || null : null,
    [effectiveWaypoints, selectedWaypointId]
  );

  const clearSelectedWaypoint = useCallback(() => setSelectedWaypointId(null), []);

  const handlePanToWaypoint = useCallback(
    (waypoint: ResolvedRouteWaypoint) => {
      if (!mapInstanceRef.current) return;
      mapInstanceRef.current.panTo(waypoint.coordinates);
      const currentZoom = mapInstanceRef.current.getZoom?.() || 12;
      if (currentZoom < 14) mapInstanceRef.current.setZoom(14);
    },
    [mapInstanceRef]
  );

  const handleDismissRouteOverlay =
    onClearSelectedTrip || activeRoute?.source === 'draft_form'
      ? dismissOverlayCallback
      : undefined;

  return {
    activeRoute,
    effectiveWaypoints,
    selectedWaypoint,
    routeMetrics,
    clearSelectedWaypoint,
    handlePanToWaypoint,
    handleDismissRouteOverlay,
  };
}
