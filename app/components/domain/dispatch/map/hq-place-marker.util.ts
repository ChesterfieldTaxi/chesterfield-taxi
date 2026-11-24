/// <reference types="google.maps" />

import { useState, useEffect, useRef } from 'react';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import {
  DEFAULT_COMPANY_CONFIG_VALUES,
  type CompanyInfoConfig,
} from '../../../../core/types/config';
import { calculateHaversineDistanceMiles } from '../../../../core/services/zones/zone.service';
import type { SpecialPlace } from '../../../../core/services/places/special-places.service';
import type { ZoneCoordinate } from '../../../../core/types/zone';

export type CustomPlaceMarkerCategory = 'hq' | 'airport' | 'hotel' | 'hospital' | 'venue';

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

export const DEFAULT_HEADQUARTERS_FALLBACK_COORDS: ZoneCoordinate = {
  lat: 38.6631,
  lng: -90.5771,
};

export const PLACE_CATEGORY_META: Record<
  CustomPlaceMarkerCategory,
  { label: string; glyph: string; hex: string; darkHex: string }
> = {
  hq: { label: '🏛️ Company Headquarters (HQ)', glyph: 'HQ', hex: '#0f172a', darkHex: '#f59e0b' },
  airport: { label: '✈️ Airports / FBOs', glyph: 'AIR', hex: '#0284c7', darkHex: '#0369a1' },
  hotel: { label: '🏨 Hotels', glyph: 'HTL', hex: '#d97706', darkHex: '#b45309' },
  hospital: { label: '🏥 Hospitals', glyph: 'MED', hex: '#e11d48', darkHex: '#be123c' },
  venue: { label: '🏢 Venues / Corporate', glyph: 'HUB', hex: '#4f46e5', darkHex: '#3730a3' },
};

const placePinSvgCache = new Map<CustomPlaceMarkerCategory, string>();

export function isValidCoord(c?: ZoneCoordinate | null): c is ZoneCoordinate {
  return Boolean(
    c &&
      typeof c.lat === 'number' &&
      typeof c.lng === 'number' &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      (c.lat !== 0 || c.lng !== 0)
  );
}

export function disposeGoogleOverlayList(
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

export function buildHeadquartersPinDataUrl(): string {
  const cached = placePinSvgCache.get('hq');
  if (cached) return cached;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="44" viewBox="0 0 38 44"><path d="M19 42 C19 42 33 27.5 33 16.5 A14 14 0 1 0 5 16.5 C5 27.5 19 42 19 42 Z" fill="#0f172a" stroke="#f59e0b" stroke-width="2.6"/><circle cx="19" cy="16" r="9.8" fill="#1e293b" stroke="#fbbf24" stroke-width="1.6"/><text x="19" y="19.4" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="8.6" font-weight="900" letter-spacing="0.4" fill="#fde68a">HQ</text></svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  placePinSvgCache.set('hq', url);
  return url;
}

export function buildPlaceMarkerDataUrl(category: CustomPlaceMarkerCategory): string {
  if (category === 'hq') return buildHeadquartersPinDataUrl();
  const cached = placePinSvgCache.get(category);
  if (cached) return cached;
  const meta = PLACE_CATEGORY_META[category];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42"><path d="M18 40 C18 40 31 26.5 31 16 A13 13 0 1 0 5 16 C5 26.5 18 40 18 40 Z" fill="${meta.hex}" stroke="#ffffff" stroke-width="2.2"/><circle cx="18" cy="15.5" r="9.2" fill="${meta.darkHex}"/><text x="18" y="18.6" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="7.5" font-weight="900" fill="#ffffff">${meta.glyph}</text></svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  placePinSvgCache.set(category, url);
  return url;
}

export function normalizePlaceCategory(raw?: string): CustomPlaceMarkerCategory {
  const c = String(raw || '').trim().toLowerCase();
  if (c === 'hq' || c === 'airport' || c === 'hotel' || c === 'hospital') return c;
  return 'venue';
}

export function resolveHeadquartersCoordinates(
  companyInfo?: Partial<CompanyInfoConfig> | null,
  geocodedCoords?: ZoneCoordinate | null
): ZoneCoordinate {
  if (isValidCoord(companyInfo?.headquartersCoordinates)) {
    return {
      lat: companyInfo!.headquartersCoordinates.lat,
      lng: companyInfo!.headquartersCoordinates.lng,
    };
  }
  if (isValidCoord(geocodedCoords)) {
    return { lat: geocodedCoords.lat, lng: geocodedCoords.lng };
  }
  return { ...DEFAULT_HEADQUARTERS_FALLBACK_COORDS };
}

export function resolveHeadquartersOverlayPlace(
  companyInfo?: Partial<CompanyInfoConfig> | null,
  geocodedCoords?: ZoneCoordinate | null
): MapOverlayPlaceItem {
  const brandName = String(companyInfo?.name || DEFAULT_COMPANY_CONFIG_VALUES.name).trim();
  const address = String(companyInfo?.address || DEFAULT_COMPANY_CONFIG_VALUES.address).trim();
  return {
    id: 'company-hq',
    name: `${brandName} Headquarters (HQ)`,
    address,
    coordinates: resolveHeadquartersCoordinates(companyInfo, geocodedCoords),
    category: 'hq',
    categoryLabel: PLACE_CATEGORY_META.hq.label,
    notes: 'Official Dispatch & Fleet Operations Headquarters',
  };
}

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

export function useHeadquartersMapPin(params: {
  mapReady: boolean;
  mapInstanceRef: React.RefObject<google.maps.Map | null>;
  companyInfoOverride?: Partial<CompanyInfoConfig> | null;
  onSelectPlace: (place: MapOverlayPlaceItem) => void;
  onSyncPlaceIfSelected: (place: MapOverlayPlaceItem) => void;
}): void {
  const { mapReady, mapInstanceRef, companyInfoOverride, onSelectPlace, onSyncPlaceIfSelected } = params;
  const hqMarkerRef = useRef<google.maps.Marker | null>(null);
  const geocodedHqCacheRef = useRef<{ address: string; coords: ZoneCoordinate } | null>(null);
  const [liveCompanyInfo, setLiveCompanyInfo] = useState<CompanyInfoConfig>(
    () => getAdminConfigService().getCachedSettings().company
  );
  const [geocodedHqCoords, setGeocodedHqCoords] = useState<ZoneCoordinate | null>(null);

  useEffect(() => {
    return getAdminConfigService().subscribeToSettings((next) => {
      if (next?.company) setLiveCompanyInfo(next.company);
    });
  }, []);

  const effectiveCompanyInfo = companyInfoOverride ?? liveCompanyInfo;

  useEffect(() => {
    if (isValidCoord(effectiveCompanyInfo?.headquartersCoordinates)) {
      setGeocodedHqCoords(null);
      return;
    }
    const addr = String(effectiveCompanyInfo?.address || '').trim();
    if (!addr || !mapReady || typeof window === 'undefined' || !window.google?.maps) return;
    if (geocodedHqCacheRef.current?.address === addr) {
      setGeocodedHqCoords(geocodedHqCacheRef.current.coords);
      return;
    }
    let cancelled = false;
    const commitResolved = (resolved: ZoneCoordinate) => {
      if (cancelled || !isValidCoord(resolved)) return;
      geocodedHqCacheRef.current = { address: addr, coords: resolved };
      setGeocodedHqCoords(resolved);
    };
    const runPlacesFallback = () => {
      if (
        cancelled ||
        !mapInstanceRef.current ||
        !window.google?.maps?.places?.PlacesService
      ) {
        return;
      }
      try {
        const placesSvc = new window.google.maps.places.PlacesService(mapInstanceRef.current);
        placesSvc.findPlaceFromQuery(
          { query: addr, fields: ['geometry', 'name', 'formatted_address'] },
          (placeResults, placeStatus) => {
            if (cancelled) return;
            const loc = placeResults?.[0]?.geometry?.location;
            if (placeStatus === 'OK' && loc) {
              commitResolved({ lat: loc.lat(), lng: loc.lng() });
            }
          }
        );
      } catch {}
    };
    try {
      if (window.google.maps.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: addr }, (results, status) => {
          if (cancelled) return;
          const loc = results?.[0]?.geometry?.location;
          if (status === 'OK' && loc) {
            commitResolved({ lat: loc.lat(), lng: loc.lng() });
          } else {
            runPlacesFallback();
          }
        });
      } else {
        runPlacesFallback();
      }
    } catch {
      runPlacesFallback();
    }
    return () => {
      cancelled = true;
    };
  }, [mapReady, effectiveCompanyInfo?.address, effectiveCompanyInfo?.headquartersCoordinates]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || typeof window === 'undefined' || !window.google?.maps?.Marker) {
      if (hqMarkerRef.current) {
        disposeGoogleOverlayList([hqMarkerRef.current]);
        hqMarkerRef.current = null;
      }
      return;
    }
    const gMaps = window.google.maps;
    const hqPlace = resolveHeadquartersOverlayPlace(effectiveCompanyInfo, geocodedHqCoords);
    onSyncPlaceIfSelected(hqPlace);

    if (hqMarkerRef.current) disposeGoogleOverlayList([hqMarkerRef.current]);
    const marker = new gMaps.Marker({
      position: hqPlace.coordinates,
      map: mapInstanceRef.current,
      icon: {
        url: buildHeadquartersPinDataUrl(),
        scaledSize: new gMaps.Size(34, 40),
        anchor: new gMaps.Point(17, 39),
      },
      title: `${hqPlace.name} · ${hqPlace.address}`,
      zIndex: 135,
    });
    marker.addListener('click', () => onSelectPlace(hqPlace));
    hqMarkerRef.current = marker;

    return () => {
      if (hqMarkerRef.current) {
        disposeGoogleOverlayList([hqMarkerRef.current]);
        hqMarkerRef.current = null;
      }
    };
  }, [mapReady, mapInstanceRef, effectiveCompanyInfo, geocodedHqCoords, onSelectPlace, onSyncPlaceIfSelected]);
}
