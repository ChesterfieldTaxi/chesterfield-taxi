import type { ZoneCoordinate } from '~/core/types/zone';

export type AdminZonesSubTab = 'places' | 'zones' | 'groups' | 'collections' | 'blacklists';

export type ZoneArchiveFilter = 'active' | 'archived' | 'all';

export type ZoneMapMode = 'google' | 'schematic';

// Map coordinate normalization
// Chesterfield: ~38.66, -90.58; STL Metro span: lat 38.50 - 38.80, lng -90.70 - -90.15
const MAP_CENTER = { lat: 38.66, lng: -90.45 };
const LAT_SPAN = 0.35;
const LNG_SPAN = 0.65;

export function projectToMap(coord: ZoneCoordinate): { x: number; y: number } {
  const x = ((coord.lng - (MAP_CENTER.lng - LNG_SPAN / 2)) / LNG_SPAN) * 100;
  const y = ((MAP_CENTER.lat + LAT_SPAN / 2 - coord.lat) / LAT_SPAN) * 100;
  return {
    x: Math.max(5, Math.min(95, x)),
    y: Math.max(5, Math.min(95, y)),
  };
}

export function unprojectFromMap(xPct: number, yPct: number): ZoneCoordinate {
  const lng = MAP_CENTER.lng - LNG_SPAN / 2 + (xPct / 100) * LNG_SPAN;
  const lat = MAP_CENTER.lat + LAT_SPAN / 2 - (yPct / 100) * LAT_SPAN;
  return {
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
  };
}

export function generateBoxVertices(
  center: ZoneCoordinate = { lat: 38.6631, lng: -90.5771 }
): ZoneCoordinate[] {
  return [
    { lat: Number((center.lat + 0.035).toFixed(5)), lng: Number((center.lng - 0.05).toFixed(5)) },
    { lat: Number((center.lat + 0.035).toFixed(5)), lng: Number((center.lng + 0.05).toFixed(5)) },
    { lat: Number((center.lat - 0.035).toFixed(5)), lng: Number((center.lng + 0.05).toFixed(5)) },
    { lat: Number((center.lat - 0.035).toFixed(5)), lng: Number((center.lng - 0.05).toFixed(5)) },
  ];
}
