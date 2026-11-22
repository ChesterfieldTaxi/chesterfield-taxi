import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { GeoPoint, Trip, TripStatus, DriverTelemetryPing } from '../../../core/types/trip';
import type { VehicleTierConfig } from '../../../core/types/config';
import type { PublicTripTrackingProjection } from '../../../core/utils/tracking-token.util';
import { loadGoogleMaps, CHESTERFIELD_CENTER } from '../../../core/services/maps/google-maps-loader';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { formatVehicleTierDisplay } from '../../../core/utils/vehicle-tier-format.util';
import { buildFleetCarMarkerDataUrl } from '../dispatch/LiveFleetMap';
import { CarIcon, MapPinIcon, RadioIcon, ShieldCheckIcon, ClockIcon, PhoneIcon, ChatBubbleLeftRightIcon } from '../../ui/Icons';

export interface CustomerTelemetryMapProps {
  trip?: Trip | null;
  tracking?: PublicTripTrackingProjection | null;
  adminVehicles?: VehicleTierConfig[];
  className?: string;
}

const STALE_GPS_MS = 90_000;

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isValidCoord(c?: GeoPoint | null): c is GeoPoint {
  return Boolean(
    c &&
      typeof c.lat === 'number' &&
      typeof c.lng === 'number' &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      !(c.lat === 0 && c.lng === 0)
  );
}

export function CustomerTelemetryMap({
  trip,
  tracking,
  adminVehicles,
  className = '',
}: CustomerTelemetryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerPickupRef = useRef<google.maps.Marker | null>(null);
  const markerDropoffRef = useRef<google.maps.Marker | null>(null);
  const markerVehicleRef = useRef<google.maps.Marker | null>(null);
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const fallbackPolylineRef = useRef<google.maps.Polyline | null>(null);
  const lastRouteRequestMsRef = useRef<number>(0);
  const lastRouteKeyRef = useRef<string>('');
  const hasFitBoundsRef = useRef<boolean>(false);

  const [mapsLoaded, setMapsLoaded] = useState<boolean>(false);
  const [liveEtaText, setLiveEtaText] = useState<string | null>(null);
  const [liveDistanceText, setLiveDistanceText] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick every 15s to evaluate GPS freshness accurately
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Unified normalized view over either full Trip or zero-PII PublicTripTrackingProjection
  const normalized = useMemo(() => {
    if (trip) {
      const meta = (trip.metadata || {}) as Record<string, any>;
      const telemetry: DriverTelemetryPing | undefined =
        trip.driverTelemetry?.coordinates
          ? trip.driverTelemetry
          : trip.currentLocation?.coordinates
          ? trip.currentLocation
          : undefined;

      const rawDriverName =
        (typeof meta.assignedDriverName === 'string' && meta.assignedDriverName) ||
        (typeof meta.driverName === 'string' && meta.driverName) ||
        '';
      const driverFirstName = rawDriverName ? rawDriverName.trim().split(/\s+/)[0] : undefined;

      const vehicleDisplayName =
        (typeof meta.vehicleDisplayName === 'string' && meta.vehicleDisplayName.trim()) ||
        formatVehicleTierDisplay(trip.vehicleTier, adminVehicles);

      return {
        tripId: trip.id,
        status: trip.status as TripStatus,
        hasAssignedDriver: Boolean(trip.assignedDriverId),
        driverFirstName,
        pickupAddress: trip.pickupLocation?.address || 'Pickup Location',
        dropoffAddress: trip.dropoffLocation?.address || 'Destination',
        pickupCoord: isValidCoord(trip.pickupLocation?.coordinates)
          ? trip.pickupLocation.coordinates
          : null,
        dropoffCoord: isValidCoord(trip.dropoffLocation?.coordinates)
          ? trip.dropoffLocation.coordinates
          : null,
        stops: (trip.intermediateStops || [])
          .filter((s) => isValidCoord(s.coordinates))
          .map((s) => ({ address: s.address, coordinates: s.coordinates! })),
        telemetry,
        assignedUnit:
          trip.assignedVehicle?.vehicleNumber ||
          (meta.vehicleUnit ? String(meta.vehicleUnit) : undefined),
        assignedModel: trip.assignedVehicle?.model || vehicleDisplayName,
        licensePlate: trip.assignedVehicle?.licensePlate || '',
        proxyPhone: trip.proxyNumber || COMPANY_CONFIG.phone.primaryRaw,
        updatedAt: trip.updatedAt || trip.createdAt,
      };
    }

    if (tracking) {
      const vehicleDisplayName =
        tracking.vehicleDisplayName || formatVehicleTierDisplay(tracking.vehicleTier, adminVehicles);
      return {
        tripId: tracking.tripId,
        status: tracking.status as TripStatus,
        hasAssignedDriver: Boolean(
          tracking.assignedDriverFirstName ||
            tracking.assignedVehicle ||
            ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(tracking.status)
        ),
        driverFirstName: tracking.assignedDriverFirstName,
        pickupAddress: tracking.pickupDisplay || 'Pickup Location',
        dropoffAddress: tracking.dropoffDisplay || 'Destination',
        pickupCoord: isValidCoord(tracking.pickupCoordinates) ? tracking.pickupCoordinates : null,
        dropoffCoord: isValidCoord(tracking.dropoffCoordinates) ? tracking.dropoffCoordinates : null,
        stops: (tracking.intermediateStops || [])
          .filter((s) => isValidCoord(s.coordinates))
          .map((s) => ({ address: s.display, coordinates: s.coordinates! })),
        telemetry: tracking.driverTelemetry,
        assignedUnit: tracking.assignedVehicle?.vehicleNumber,
        assignedModel: tracking.assignedVehicle?.model || vehicleDisplayName,
        licensePlate: tracking.assignedVehicle?.licensePlate || '',
        proxyPhone: tracking.proxyPhone || COMPANY_CONFIG.phone.primaryRaw,
        updatedAt: tracking.updatedAt,
      };
    }

    return null;
  }, [trip, tracking, adminVehicles]);

  if (!normalized) return null;

  const hasLiveGps = Boolean(
    normalized.hasAssignedDriver && isValidCoord(normalized.telemetry?.coordinates)
  );
  const liveVehicleCoord = hasLiveGps ? normalized.telemetry!.coordinates : null;
  const gpsTimestampMs = normalized.telemetry?.timestamp
    ? Date.parse(normalized.telemetry.timestamp)
    : 0;
  const isGpsStale = Boolean(
    hasLiveGps &&
      (normalized.telemetry?.isOfflineBuffer ||
        (gpsTimestampMs > 0 && nowMs - gpsTimestampMs > STALE_GPS_MS))
  );

  const vehicleHeading = normalized.telemetry?.heading ?? 0;
  const carMapStatus =
    normalized.status === 'arrived' || normalized.status === 'in_progress'
      ? 'busy'
      : normalized.status === 'en_route'
      ? 'en_route'
      : 'available';
  const carShortLabel = (normalized.assignedUnit || 'CAR').replace(/^(?:Cab|Car)\s*/i, '');

  // Fallback Haversine ETA when live GPS exists before DirectionsResult arrives
  const fallbackEta = useMemo(() => {
    if (!liveVehicleCoord) return null;
    const target =
      normalized.status === 'en_route' || normalized.status === 'assigned' || normalized.status === 'accepted'
        ? normalized.pickupCoord
        : normalized.status === 'in_progress'
        ? normalized.dropoffCoord
        : null;
    if (!target) return null;
    const miles = haversineMiles(liveVehicleCoord, target);
    const speedMph = Math.max(22, normalized.telemetry?.speedMph || 28);
    const mins = Math.max(1, Math.round((miles / speedMph) * 60));
    return {
      etaText: `${mins} min`,
      distText: `${miles.toFixed(1)} mi`,
    };
  }, [liveVehicleCoord, normalized.status, normalized.pickupCoord, normalized.dropoffCoord, normalized.telemetry?.speedMph]);

  // 1. Initialize Google Map ONCE cleanly (no React children inside mapContainerRef!)
  useEffect(() => {
    let isMounted = true;
    loadGoogleMaps()
      .then((gMaps) => {
        if (!isMounted || !gMaps || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          const initialCenter =
            liveVehicleCoord || normalized.pickupCoord || normalized.dropoffCoord || CHESTERFIELD_CENTER;

          const map = new gMaps.maps.Map(mapContainerRef.current, {
            center: initialCenter,
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeId: 'roadmap',
          });
          mapInstanceRef.current = map;
          directionsServiceRef.current = new gMaps.maps.DirectionsService();
          directionsRendererRef.current = new gMaps.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: '#2563eb',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            },
          });

          setMapsLoaded(true);
        }
      })
      .catch(() => {
        setMapsLoaded(false);
      });

    return () => {
      isMounted = false;
      markerPickupRef.current?.setMap(null);
      markerPickupRef.current = null;
      markerDropoffRef.current?.setMap(null);
      markerDropoffRef.current = null;
      markerVehicleRef.current?.setMap(null);
      markerVehicleRef.current = null;
      stopMarkersRef.current.forEach((m) => m.setMap(null));
      stopMarkersRef.current = [];
      directionsRendererRef.current?.setMap(null);
      directionsRendererRef.current = null;
      fallbackPolylineRef.current?.setMap(null);
      fallbackPolylineRef.current = null;
      if (mapInstanceRef.current && typeof google !== 'undefined' && google?.maps?.event) {
        google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Sync markers, real road route (DirectionsService), ETA & fitBounds smoothly
  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps) {
      return;
    }

    const gMaps = window.google.maps;
    const map = mapInstanceRef.current;

    // Pickup marker (only when real coordinates exist)
    if (normalized.pickupCoord) {
      if (!markerPickupRef.current) {
        markerPickupRef.current = new gMaps.Marker({
          position: normalized.pickupCoord,
          map,
          title: `Pickup: ${normalized.pickupAddress}`,
          label: { text: 'P', color: '#ffffff', fontWeight: 'bold' },
        });
      } else {
        markerPickupRef.current.setPosition(normalized.pickupCoord);
        markerPickupRef.current.setMap(map);
      }
    } else if (markerPickupRef.current) {
      markerPickupRef.current.setMap(null);
    }

    // Dropoff marker
    if (normalized.dropoffCoord) {
      if (!markerDropoffRef.current) {
        markerDropoffRef.current = new gMaps.Marker({
          position: normalized.dropoffCoord,
          map,
          title: `Destination: ${normalized.dropoffAddress}`,
          label: { text: 'D', color: '#ffffff', fontWeight: 'bold' },
        });
      } else {
        markerDropoffRef.current.setPosition(normalized.dropoffCoord);
        markerDropoffRef.current.setMap(map);
      }
    } else if (markerDropoffRef.current) {
      markerDropoffRef.current.setMap(null);
    }

    // Intermediate Stop markers
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = normalized.stops.map(
      (s, i) =>
        new gMaps.Marker({
          position: s.coordinates,
          map,
          title: `Stop ${i + 1}: ${s.address}`,
          label: { text: String(i + 1), color: '#ffffff', fontWeight: 'bold' },
        })
    );

    // Vehicle Marker — STRICTLY ONLY when assigned driver has real live GPS!
    if (liveVehicleCoord) {
      const iconSpec = {
        url: buildFleetCarMarkerDataUrl({
          status: carMapStatus,
          cabLabel: carShortLabel,
          heading: vehicleHeading,
          isStale: isGpsStale,
        }),
        scaledSize: new gMaps.Size(50, 59),
        anchor: new gMaps.Point(25, 22),
      };

      if (!markerVehicleRef.current) {
        markerVehicleRef.current = new gMaps.Marker({
          position: liveVehicleCoord,
          map,
          title: normalized.assignedUnit || 'Assigned Driver',
          icon: iconSpec,
          zIndex: 250,
          optimized: false,
        });
      } else {
        markerVehicleRef.current.setPosition(liveVehicleCoord);
        markerVehicleRef.current.setIcon(iconSpec);
        markerVehicleRef.current.setMap(map);
      }
    } else if (markerVehicleRef.current) {
      markerVehicleRef.current.setMap(null);
    }

    // Auto fitBounds on first paint or status change
    const boundsPoints: GeoPoint[] = [];
    if (normalized.pickupCoord) boundsPoints.push(normalized.pickupCoord);
    if (normalized.dropoffCoord) boundsPoints.push(normalized.dropoffCoord);
    normalized.stops.forEach((s) => boundsPoints.push(s.coordinates));
    if (liveVehicleCoord) boundsPoints.push(liveVehicleCoord);

    if (boundsPoints.length >= 2 && !hasFitBoundsRef.current) {
      const bounds = new gMaps.LatLngBounds();
      boundsPoints.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, { top: 76, right: 36, bottom: 36, left: 36 });
      hasFitBoundsRef.current = true;
    } else if (boundsPoints.length === 1 && !hasFitBoundsRef.current) {
      map.setCenter(boundsPoints[0]);
      map.setZoom(14);
      hasFitBoundsRef.current = true;
    }

    // Real Road Route via DirectionsService (throttled to max 1 request per 25s unless leg changes)
    let routeOrigin: GeoPoint | null = null;
    let routeDest: GeoPoint | null = null;
    let routeWaypoints: google.maps.DirectionsWaypoint[] = [];

    if (
      liveVehicleCoord &&
      normalized.pickupCoord &&
      ['assigned', 'accepted', 'en_route'].includes(normalized.status)
    ) {
      routeOrigin = liveVehicleCoord;
      routeDest = normalized.pickupCoord;
    } else if (liveVehicleCoord && normalized.dropoffCoord && normalized.status === 'in_progress') {
      routeOrigin = liveVehicleCoord;
      routeDest = normalized.dropoffCoord;
      routeWaypoints = normalized.stops.map((s) => ({ location: s.coordinates, stopover: true }));
    } else if (normalized.pickupCoord && normalized.dropoffCoord) {
      routeOrigin = normalized.pickupCoord;
      routeDest = normalized.dropoffCoord;
      routeWaypoints = normalized.stops.map((s) => ({ location: s.coordinates, stopover: true }));
    }

    if (routeOrigin && routeDest && directionsServiceRef.current && directionsRendererRef.current) {
      const routeKey = `${normalized.status}:${routeOrigin.lat.toFixed(3)},${routeOrigin.lng.toFixed(3)}->${routeDest.lat.toFixed(3)},${routeDest.lng.toFixed(3)}`;
      const elapsed = Date.now() - lastRouteRequestMsRef.current;

      if (routeKey !== lastRouteKeyRef.current && (elapsed > 25_000 || lastRouteRequestMsRef.current === 0)) {
        lastRouteKeyRef.current = routeKey;
        lastRouteRequestMsRef.current = Date.now();

        directionsServiceRef.current.route(
          {
            origin: routeOrigin,
            destination: routeDest,
            waypoints: routeWaypoints,
            travelMode: gMaps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === gMaps.DirectionsStatus.OK && result) {
              fallbackPolylineRef.current?.setMap(null);
              directionsRendererRef.current?.setDirections(result);
              const legs = result.routes?.[0]?.legs || [];
              const totalSec = legs.reduce((acc, l) => acc + (l.duration?.value || 0), 0);
              const totalMeters = legs.reduce((acc, l) => acc + (l.distance?.value || 0), 0);
              if (totalSec > 0) {
                setLiveEtaText(`${Math.max(1, Math.round(totalSec / 60))} min`);
              }
              if (totalMeters > 0) {
                setLiveDistanceText(`${(totalMeters / 1609.34).toFixed(1)} mi`);
              }
            } else {
              // Clean geodesic fallback ONLY along actual origin -> destination (never backwards!)
              if (!fallbackPolylineRef.current) {
                fallbackPolylineRef.current = new gMaps.Polyline({
                  path: [routeOrigin!, ...normalized.stops.map((s) => s.coordinates), routeDest!],
                  geodesic: true,
                  strokeColor: '#2563eb',
                  strokeOpacity: 0.75,
                  strokeWeight: 4,
                  map,
                });
              } else {
                fallbackPolylineRef.current.setPath([routeOrigin!, routeDest!]);
                fallbackPolylineRef.current.setMap(map);
              }
            }
          }
        );
      }
    }
  }, [
    mapsLoaded,
    normalized.status,
    normalized.pickupCoord?.lat,
    normalized.pickupCoord?.lng,
    normalized.dropoffCoord?.lat,
    normalized.dropoffCoord?.lng,
    liveVehicleCoord?.lat,
    liveVehicleCoord?.lng,
    carMapStatus,
    carShortLabel,
    vehicleHeading,
    isGpsStale,
  ]);

  const displayedEta = liveEtaText || fallbackEta?.etaText || null;
  const displayedDist = liveDistanceText || fallbackEta?.distText || null;
  const isDispatchNumber =
    normalized.proxyPhone === COMPANY_CONFIG.phone.primaryRaw ||
    normalized.proxyPhone === COMPANY_CONFIG.phone.dispatch;

  const statusHeadline =
    normalized.status === 'en_route'
      ? 'Driver on the Way to Pickup'
      : normalized.status === 'arrived'
      ? 'Driver Arrived at Pickup'
      : normalized.status === 'in_progress'
      ? 'Ride in Progress'
      : normalized.status === 'completed'
      ? 'Trip Completed'
      : normalized.status === 'assigned' || normalized.status === 'accepted'
      ? 'Driver Assigned — Getting Ready'
      : 'Dispatch Tracking Active';

  const gpsTimestampDisplay = normalized.telemetry?.timestamp
    ? new Date(normalized.telemetry.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : new Date(normalized.updatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-xl ${className}`}>
      {/* Live Tracking Header */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-900/92 backdrop-blur-md px-4 py-2.5 border border-slate-700/60 shadow-lg text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-3 w-3 shrink-0">
            {hasLiveGps && !isGpsStale && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                !hasLiveGps
                  ? 'bg-slate-400'
                  : isGpsStale
                  ? 'bg-amber-400'
                  : 'bg-emerald-500'
              }`}
            />
          </span>
          <div className="min-w-0">
            <div
              className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                !hasLiveGps
                  ? 'text-slate-400'
                  : isGpsStale
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              <RadioIcon className="w-3 h-3" />
              {!hasLiveGps
                ? 'Waiting for Live GPS'
                : isGpsStale
                ? 'GPS Updating...'
                : 'Live GPS'}
            </div>
            <div className="text-xs font-bold text-slate-100 truncate">{statusHeadline}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {displayedEta && ['assigned', 'accepted', 'en_route', 'in_progress'].includes(normalized.status) && (
            <div className="px-2.5 py-1 rounded-xl bg-blue-600/25 border border-blue-400/40 text-right">
              <div className="text-[9px] font-bold uppercase text-blue-300 flex items-center justify-end gap-1">
                <ClockIcon className="w-2.5 h-2.5" /> ETA
              </div>
              <div className="text-xs font-black text-white">
                {displayedEta}
                {displayedDist ? <span className="text-[10px] font-normal text-blue-200"> · {displayedDist}</span> : null}
              </div>
            </div>
          )}

          {normalized.hasAssignedDriver && (
            <div className="flex items-center gap-2 text-right">
              <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0">
                <CarIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-black text-slate-100">
                  {normalized.driverFirstName ? `${normalized.driverFirstName} · ` : ''}
                  {normalized.assignedUnit || 'Assigned Car'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {normalized.assignedModel}
                  {normalized.licensePlate ? ` • ${normalized.licensePlate}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map Wrapper: Google Maps container has ZERO React children to prevent removeChild crash! */}
      <div className="w-full h-72 sm:h-80 bg-slate-950 relative">
        <div ref={mapContainerRef} className="w-full h-full" />

        {!mapsLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center select-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
            <div className="relative w-full max-w-sm h-40 flex items-center justify-between px-8">
              <div className="absolute left-14 right-14 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-rose-500 rounded-full" />

              {hasLiveGps && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 z-10"
                  style={{
                    left:
                      normalized.status === 'en_route'
                        ? '30%'
                        : normalized.status === 'arrived'
                        ? '18%'
                        : normalized.status === 'in_progress'
                        ? '55%'
                        : '82%',
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white">
                    <CarIcon className="w-4 h-4" />
                  </div>
                </div>
              )}

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow flex items-center justify-center text-white text-xs font-black">
                  P
                </div>
                <span className="text-[10px] font-bold text-emerald-400 mt-1">Pickup</span>
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-rose-500 border-2 border-white shadow flex items-center justify-center text-white text-xs font-black">
                  D
                </div>
                <span className="text-[10px] font-bold text-rose-400 mt-1">Dropoff</span>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {hasLiveGps
                  ? `Live GPS${displayedEta ? ` • ETA ${displayedEta}` : ''}`
                  : 'Waiting for live driver location'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Live Tracking Footer */}
      <div className="bg-slate-950 px-4 py-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPinIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="truncate max-w-[220px] sm:max-w-xs">{normalized.pickupAddress}</span>
        </div>

        {normalized.hasAssignedDriver &&
          ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(normalized.status) && (
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`tel:${normalized.proxyPhone}`}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
                title={isDispatchNumber ? 'Call 24/7 dispatch' : 'Call your driver'}
              >
                <PhoneIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>{isDispatchNumber ? 'Call Dispatch' : 'Call Driver'}</span>
              </a>
              <a
                href={`sms:${normalized.proxyPhone}?body=${encodeURIComponent(`Trip #${normalized.tripId}: `)}`}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>Text</span>
              </a>
            </div>
          )}

        <div className="font-mono text-[11px] text-slate-500">
          {hasLiveGps ? `GPS: ${gpsTimestampDisplay}` : `Updated: ${gpsTimestampDisplay}`}
        </div>
      </div>
    </div>
  );
}
