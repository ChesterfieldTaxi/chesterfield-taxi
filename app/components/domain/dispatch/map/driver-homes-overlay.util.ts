/// <reference types="google.maps" />

import { useEffect, useRef } from 'react';
import type { LiveFleetDriver } from '../../../../core/hooks/useDispatchFleet';
import type { FleetCarConfig, VehicleTierConfig } from '../../../../core/types/config';
import type { DayOfWeek, DriverScheduleConfig } from '../../../../core/types/driver';
import { formatVehicleTier } from '../../../../core/utils/vehicle-tier-format.util';
import {
  extractCabShortLabel,
  matchesSelectedVehicleTypes,
  resolveDriverVehicleTypeKey,
} from './fleet-car-marker.util';
import { disposeGoogleOverlayList, isValidCoord } from './hq-place-marker.util';

export interface DriverHomeOverlayItem {
  driverId: string;
  driver: LiveFleetDriver;
  driverName: string;
  cabLabel: string;
  vehicleClassLabel: string;
  shiftScheduleSummary: string;
  homeAddress: string;
  homeCoordinates: { lat: number; lng: number };
}

const ORDERED_DAYS: ReadonlyArray<{ key: DayOfWeek; short: string }> = [
  { key: 'mon', short: 'Mon' },
  { key: 'tue', short: 'Tue' },
  { key: 'wed', short: 'Wed' },
  { key: 'thu', short: 'Thu' },
  { key: 'fri', short: 'Fri' },
  { key: 'sat', short: 'Sat' },
  { key: 'sun', short: 'Sun' },
];

const homePinSvgCache = new Map<string, string>();

export function formatDriverShiftScheduleSummary(
  schedule?: DriverScheduleConfig | null
): string {
  const weekly = schedule?.weeklyHours;
  if (!weekly) return 'Flexible / On-Demand Shift';

  const enabled = ORDERED_DAYS.filter((d) => Boolean(weekly[d.key]?.enabled)).map((d) => ({
    short: d.short,
    window: `${weekly[d.key].startHour || '07:00'}–${weekly[d.key].endHour || '17:00'}`,
  }));

  if (enabled.length === 0) return 'Off-Schedule / On-Call';

  const uniqueWindows = Array.from(new Set(enabled.map((e) => e.window)));
  if (uniqueWindows.length === 1) {
    const dayLabel =
      enabled.length === 7
        ? 'Daily'
        : enabled.length === 5 &&
          enabled[0].short === 'Mon' &&
          enabled[4].short === 'Fri'
        ? 'Mon–Fri'
        : enabled.map((e) => e.short).join(', ');
    return `${dayLabel} ${uniqueWindows[0]}`;
  }

  return enabled
    .slice(0, 3)
    .map((e) => `${e.short} ${e.window}`)
    .join(' · ');
}

export function buildDriverHomePinDataUrl(cabLabel?: string): string {
  const cleanCab = String(cabLabel || '').trim() || 'HOME';
  const badgeText = cleanCab.startsWith('#') ? cleanCab : cleanCab === 'HOME' ? 'HOME' : `#${cleanCab}`;
  const cached = homePinSvgCache.get(badgeText);
  if (cached) return cached;

  const escaped = badgeText.replace(/[<>&"']/g, '').slice(0, 6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="48" viewBox="0 0 46 48"><path d="M23 46 C23 46 39 30.5 39 18.5 A16 16 0 1 0 7 18.5 C7 30.5 23 46 23 46 Z" fill="#0f766e" stroke="#ffffff" stroke-width="2.2"/><path d="M14.5 17.5 L23 10.5 L31.5 17.5 V25.5 H14.5 Z" fill="#134e4a" stroke="#99f6e4" stroke-width="1.3"/><text x="23" y="16.2" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="5.6" font-weight="900" fill="#ccfbf1">HOME</text><text x="23" y="23.6" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="7.2" font-weight="900" fill="#ffffff">${escaped}</text></svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  homePinSvgCache.set(badgeText, url);
  return url;
}

export function buildDriverHomesOverlayItems(
  fleet: ReadonlyArray<LiveFleetDriver> | null | undefined,
  selectedVehicleTypes: ReadonlyArray<string> = [],
  fleetCars?: ReadonlyArray<FleetCarConfig> | null,
  vehicleTiers?: ReadonlyArray<VehicleTierConfig> | null
): DriverHomeOverlayItem[] {
  if (!Array.isArray(fleet) || fleet.length === 0) return [];
  const items: DriverHomeOverlayItem[] = [];

  for (const drv of fleet) {
    if (drv.isArchived || drv.isBlacklisted || drv.zone === 'Suspended') continue;
    if (!isValidCoord(drv.homeCoordinates)) continue;
    if (
      !matchesSelectedVehicleTypes(
        drv,
        selectedVehicleTypes as string[],
        fleetCars as FleetCarConfig[] | undefined,
        vehicleTiers as VehicleTierConfig[] | undefined
      )
    ) {
      continue;
    }

    const cabShort = extractCabShortLabel(drv);
    const cabLabel = cabShort.startsWith('#') ? cabShort : `#${cabShort}`;
    const resolvedKey = resolveDriverVehicleTypeKey(
      drv,
      fleetCars as FleetCarConfig[] | undefined,
      vehicleTiers as VehicleTierConfig[] | undefined
    );
    const vehicleClassLabel = formatVehicleTier(
      resolvedKey || drv.tier || 'standard',
      vehicleTiers as VehicleTierConfig[] | undefined,
      drv.tier || drv.vehicle
    );

    items.push({
      driverId: drv.id,
      driver: drv,
      driverName: drv.name || 'Driver',
      cabLabel,
      vehicleClassLabel,
      shiftScheduleSummary: formatDriverShiftScheduleSummary(drv.schedule),
      homeAddress: drv.homeAddress?.trim() || `${drv.homeCoordinates.lat.toFixed(4)}, ${drv.homeCoordinates.lng.toFixed(4)}`,
      homeCoordinates: {
        lat: drv.homeCoordinates.lat,
        lng: drv.homeCoordinates.lng,
      },
    });
  }

  return items;
}

export function useDriverHomesMapLayer(params: {
  mapReady: boolean;
  mapInstanceRef: React.RefObject<google.maps.Map | null>;
  showDriverHomesOverlay: boolean;
  fleet: LiveFleetDriver[];
  selectedVehicleTypes: string[];
  fleetCars?: FleetCarConfig[] | null;
  vehicleTiers?: VehicleTierConfig[] | null;
  onSelectDriverHome: (item: DriverHomeOverlayItem) => void;
  onClearIfHidden: (validDriverIds: Set<string>) => void;
}): void {
  const {
    mapReady,
    mapInstanceRef,
    showDriverHomesOverlay,
    fleet,
    selectedVehicleTypes,
    fleetCars,
    vehicleTiers,
    onSelectDriverHome,
    onClearIfHidden,
  } = params;

  const homeMarkersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    disposeGoogleOverlayList(homeMarkersRef.current);
    homeMarkersRef.current = [];

    if (!showDriverHomesOverlay) {
      onClearIfHidden(new Set());
      return;
    }
    if (
      !mapReady ||
      !mapInstanceRef.current ||
      typeof window === 'undefined' ||
      !window.google?.maps?.Marker
    ) {
      return;
    }

    const map = mapInstanceRef.current;
    const gMaps = window.google.maps;
    const items = buildDriverHomesOverlayItems(fleet, selectedVehicleTypes, fleetCars, vehicleTiers);
    onClearIfHidden(new Set(items.map((it) => it.driverId)));

    homeMarkersRef.current = items.map((item) => {
      const marker = new gMaps.Marker({
        position: item.homeCoordinates,
        map,
        icon: {
          url: buildDriverHomePinDataUrl(item.cabLabel),
          scaledSize: new gMaps.Size(38, 40),
          anchor: new gMaps.Point(19, 39),
        },
        title: `🏠 ${item.cabLabel} ${item.driverName} · ${item.homeAddress}`,
        zIndex: 115,
      });
      marker.addListener('click', () => onSelectDriverHome(item));
      return marker;
    });

    return () => {
      disposeGoogleOverlayList(homeMarkersRef.current);
      homeMarkersRef.current = [];
    };
  }, [
    mapReady,
    mapInstanceRef,
    showDriverHomesOverlay,
    fleet,
    selectedVehicleTypes,
    fleetCars,
    vehicleTiers,
    onSelectDriverHome,
    onClearIfHidden,
  ]);
}
