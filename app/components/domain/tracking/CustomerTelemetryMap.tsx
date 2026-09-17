import React, { useEffect, useRef, useState } from 'react';
import type { Trip } from '../../../core/types/trip';
import { loadGoogleMaps, CHESTERFIELD_CENTER } from '../../../core/services/maps/google-maps-loader';
import { CarIcon, MapPinIcon, RadioIcon, ShieldCheckIcon } from '../../ui/Icons';

interface CustomerTelemetryMapProps {
  trip: Trip;
  className?: string;
}

export function CustomerTelemetryMap({ trip, className = '' }: CustomerTelemetryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerPickupRef = useRef<google.maps.Marker | null>(null);
  const markerDropoffRef = useRef<google.maps.Marker | null>(null);
  const markerVehicleRef = useRef<google.maps.Marker | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState<boolean>(false);
  const [simulatedProgress, setSimulatedProgress] = useState<number>(0.35);

  const pickupCoord = trip.pickupLocation?.coordinates || {
    lat: CHESTERFIELD_CENTER.lat - 0.015,
    lng: CHESTERFIELD_CENTER.lng - 0.02,
  };

  const dropoffCoord = trip.dropoffLocation?.coordinates || {
    lat: CHESTERFIELD_CENTER.lat + 0.025,
    lng: CHESTERFIELD_CENTER.lng + 0.035,
  };

  // Calculate vehicle interpolated coordinate based on status
  const getVehicleCoordinates = () => {
    if (trip.status === 'en_route') {
      // Driver approaching pickup
      return {
        lat: pickupCoord.lat - 0.008,
        lng: pickupCoord.lng - 0.006,
      };
    } else if (trip.status === 'arrived') {
      return { lat: pickupCoord.lat, lng: pickupCoord.lng };
    } else if (trip.status === 'in_progress') {
      // Vehicle en route from pickup to dropoff
      return {
        lat: pickupCoord.lat + (dropoffCoord.lat - pickupCoord.lat) * simulatedProgress,
        lng: pickupCoord.lng + (dropoffCoord.lng - pickupCoord.lng) * simulatedProgress,
      };
    } else if (trip.status === 'completed') {
      return { lat: dropoffCoord.lat, lng: dropoffCoord.lng };
    }
    // Default near pickup
    return {
      lat: pickupCoord.lat - 0.005,
      lng: pickupCoord.lng - 0.005,
    };
  };

  const vehicleCoord = getVehicleCoordinates();

  // Pulse simulated progress when in_progress
  useEffect(() => {
    if (trip.status !== 'in_progress') return;
    const interval = setInterval(() => {
      setSimulatedProgress((prev) => (prev >= 0.9 ? 0.2 : prev + 0.05));
    }, 4000);
    return () => clearInterval(interval);
  }, [trip.status]);

  // Initialize Google Maps if available
  useEffect(() => {
    let isMounted = true;
    loadGoogleMaps()
      .then((gMaps) => {
        if (!isMounted || !gMaps || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new gMaps.maps.Map(mapContainerRef.current, {
            center: { lat: vehicleCoord.lat, lng: vehicleCoord.lng },
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeId: 'roadmap',
          });

          // Markers
          markerPickupRef.current = new gMaps.maps.Marker({
            position: pickupCoord,
            map: mapInstanceRef.current,
            title: 'Pickup: ' + (trip.pickupLocation?.address || 'Pickup'),
            label: { text: 'P', color: '#ffffff', fontWeight: 'bold' },
          });

          markerDropoffRef.current = new gMaps.maps.Marker({
            position: dropoffCoord,
            map: mapInstanceRef.current,
            title: 'Dropoff: ' + (trip.dropoffLocation?.address || 'Dropoff'),
            label: { text: 'D', color: '#ffffff', fontWeight: 'bold' },
          });

          markerVehicleRef.current = new gMaps.maps.Marker({
            position: vehicleCoord,
            map: mapInstanceRef.current,
            title: trip.assignedVehicle?.vehicleNumber || 'Taxi Unit',
          });

          // Route Polyline
          polylineRef.current = new gMaps.maps.Polyline({
            path: [pickupCoord, vehicleCoord, dropoffCoord],
            geodesic: true,
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: mapInstanceRef.current,
          });

          setMapsLoaded(true);
        } else {
          // Update positions
          markerVehicleRef.current?.setPosition(vehicleCoord);
          polylineRef.current?.setPath([pickupCoord, vehicleCoord, dropoffCoord]);
        }
      })
      .catch(() => {
        setMapsLoaded(false);
      });

    return () => {
      isMounted = false;
    };
  }, [pickupCoord.lat, pickupCoord.lng, dropoffCoord.lat, dropoffCoord.lng, vehicleCoord.lat, vehicleCoord.lng]);

  const assignedUnit = trip.assignedVehicle?.vehicleNumber || 'Cab #204';
  const assignedModel = trip.assignedVehicle?.model || 'Toyota Camry Hybrid';
  const licensePlate = trip.assignedVehicle?.licensePlate || 'MO-7TX91';

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-xl ${className}`}>
      {/* Real-time Telemetry HUD Overlay Header */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-900/90 backdrop-blur-md px-4 py-2.5 border border-slate-700/60 shadow-lg text-white">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <RadioIcon className="w-3 h-3 animate-pulse" /> Live Telemetry Feed
            </div>
            <div className="text-xs font-bold text-slate-100">
              {trip.status === 'en_route' && 'Driver En Route to Pickup'}
              {trip.status === 'arrived' && 'Driver Arrived at Pickup'}
              {trip.status === 'in_progress' && 'Trip In Progress to Destination'}
              {trip.status === 'completed' && 'Trip Completed'}
              {!['en_route', 'arrived', 'in_progress', 'completed'].includes(trip.status) && 'Dispatch Monitoring Active'}
            </div>
          </div>
        </div>

        {trip.assignedDriverId && (
          <div className="flex items-center gap-2 text-right">
            <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <CarIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-100">{assignedUnit}</div>
              <div className="text-[10px] text-slate-400">{assignedModel} • {licensePlate}</div>
            </div>
          </div>
        )}
      </div>

      {/* Map Display: Google Maps canvas or High-contrast Stylized Radar Canvas */}
      <div ref={mapContainerRef} className="w-full h-72 sm:h-80 bg-slate-950 relative">
        {!mapsLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center select-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
            {/* Grid background lines */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:2rem_2rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30"></div>

            {/* Stylized vector telemetry radar */}
            <div className="relative w-full max-w-sm h-48 flex items-center justify-between px-8 z-0">
              {/* Route connecting line */}
              <div className="absolute left-14 right-14 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-rose-500 rounded-full"></div>

              {/* Animated pulse wave */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out z-10"
                style={{
                  left: trip.status === 'en_route'
                    ? '30%'
                    : trip.status === 'arrived'
                    ? '16%'
                    : trip.status === 'in_progress'
                    ? `${20 + simulatedProgress * 60}%`
                    : trip.status === 'completed'
                    ? '84%'
                    : '50%',
                }}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 animate-ping absolute"></div>
                  <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white">
                    <CarIcon className="w-4 h-4" />
                  </div>
                </div>
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-blue-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-blue-500/30">
                  {assignedUnit}
                </div>
              </div>

              {/* Pickup Waypoint */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow flex items-center justify-center text-white text-xs font-black">
                  P
                </div>
                <span className="text-[10px] font-bold text-emerald-400 mt-1">Pickup</span>
              </div>

              {/* Dropoff Waypoint */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-rose-500 border-2 border-white shadow flex items-center justify-center text-white text-xs font-black">
                  D
                </div>
                <span className="text-[10px] font-bold text-rose-400 mt-1">Dropoff</span>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 z-10 flex items-center gap-1.5 font-mono">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>GPS: {vehicleCoord.lat.toFixed(4)}, {vehicleCoord.lng.toFixed(4)} • Speed: {trip.status === 'in_progress' ? '32 mph' : '0 mph'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Telemetry Status Footer */}
      <div className="bg-slate-950 px-4 py-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <MapPinIcon className="w-3.5 h-3.5 text-slate-500" />
          <span className="truncate max-w-[150px] sm:max-w-xs">{trip.pickupLocation?.address || 'Pickup location'}</span>
        </div>
        
        {trip.assignedDriverId && ['assigned', 'en_route', 'arrived', 'in_progress'].includes(trip.status) && (
          <div className="flex items-center gap-2">
            <button type="button" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700">
              <span className="w-3 h-3 block">📞</span> Call Driver
            </button>
            <button type="button" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700">
              💬 Text
            </button>
          </div>
        )}
        
        <div className="font-mono text-[11px] text-slate-500 hidden sm:block">
          Updated: {new Date(trip.updatedAt || trip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
