import { useState, useEffect, useCallback, useRef } from 'react';

export const DISPATCH_MAP_PREFS_STORAGE_KEY = 'ct_dispatch_map_prefs_v1';

export interface DispatchMapPreferences {
  /** High-contrast outer-cased polyline + directional chevrons along the route (default: true). */
  casedRouteWithArrows: boolean;
  /** Clicking any Green / Orange / Red route pin opens an interactive leg details popover (default: true). */
  interactiveRoutePinPopovers: boolean;
  /** Compact floating route summary pill at bottom-left of the map with distance/ETA & 1-click Clear Route (default: true). */
  showRouteSummaryPill: boolean;
  /** Render active /zones polygons & radius circles on the Dispatch map (default: false). */
  showZonesOverlay: boolean;
  /** Attach Google Maps live TrafficLayer on the Dispatch map (default: false). */
  showTrafficOverlay: boolean;
  /** Render curated Places & Location Collection POIs on the Dispatch map (default: false). */
  showPlacesOverlay: boolean;
  /** Render blacklisted / safety exclusion circles on the Dispatch map (default: false). */
  showExclusionsOverlay: boolean;
  /** Multi-select vehicle type filter keys; empty array `[]` means all vehicle types shown (default: []). */
  selectedVehicleTypes: string[];
}

export interface DispatchMapAdminOverlayDefaults {
  defaultShowZonesOverlay?: boolean;
  defaultShowTrafficOverlay?: boolean;
  defaultShowPlacesOverlay?: boolean;
  defaultShowExclusionsOverlay?: boolean;
}

export const DEFAULT_DISPATCH_MAP_PREFERENCES: DispatchMapPreferences = Object.freeze({
  casedRouteWithArrows: true,
  interactiveRoutePinPopovers: true,
  showRouteSummaryPill: true,
  showZonesOverlay: false,
  showTrafficOverlay: false,
  showPlacesOverlay: false,
  showExclusionsOverlay: false,
  selectedVehicleTypes: [],
});

function normalizeVehicleTypeArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function buildFallbackPreferences(
  adminDefaults?: DispatchMapAdminOverlayDefaults | null
): DispatchMapPreferences {
  return {
    casedRouteWithArrows: DEFAULT_DISPATCH_MAP_PREFERENCES.casedRouteWithArrows,
    interactiveRoutePinPopovers: DEFAULT_DISPATCH_MAP_PREFERENCES.interactiveRoutePinPopovers,
    showRouteSummaryPill: DEFAULT_DISPATCH_MAP_PREFERENCES.showRouteSummaryPill,
    showZonesOverlay: Boolean(
      adminDefaults?.defaultShowZonesOverlay ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showZonesOverlay
    ),
    showTrafficOverlay: Boolean(
      adminDefaults?.defaultShowTrafficOverlay ??
        DEFAULT_DISPATCH_MAP_PREFERENCES.showTrafficOverlay
    ),
    showPlacesOverlay: Boolean(
      adminDefaults?.defaultShowPlacesOverlay ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showPlacesOverlay
    ),
    showExclusionsOverlay: Boolean(
      adminDefaults?.defaultShowExclusionsOverlay ??
        DEFAULT_DISPATCH_MAP_PREFERENCES.showExclusionsOverlay
    ),
    selectedVehicleTypes: [],
  };
}

/**
 * Pure, resilient parser for serialized `DispatchMapPreferences`.
 * Falls back field-by-field to `DEFAULT_DISPATCH_MAP_PREFERENCES` (and optional Admin baseline defaults)
 * on null, malformed JSON, or invalid field types.
 */
export function parseDispatchMapPreferences(
  raw: string | null | undefined,
  adminDefaults?: DispatchMapAdminOverlayDefaults | null
): DispatchMapPreferences {
  const fallback = buildFallbackPreferences(adminDefaults);
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback;
    }
    const obj = parsed as Record<string, unknown>;
    return {
      casedRouteWithArrows:
        typeof obj.casedRouteWithArrows === 'boolean'
          ? obj.casedRouteWithArrows
          : fallback.casedRouteWithArrows,
      interactiveRoutePinPopovers:
        typeof obj.interactiveRoutePinPopovers === 'boolean'
          ? obj.interactiveRoutePinPopovers
          : fallback.interactiveRoutePinPopovers,
      showRouteSummaryPill:
        typeof obj.showRouteSummaryPill === 'boolean'
          ? obj.showRouteSummaryPill
          : fallback.showRouteSummaryPill,
      showZonesOverlay:
        typeof obj.showZonesOverlay === 'boolean'
          ? obj.showZonesOverlay
          : fallback.showZonesOverlay,
      showTrafficOverlay:
        typeof obj.showTrafficOverlay === 'boolean'
          ? obj.showTrafficOverlay
          : fallback.showTrafficOverlay,
      showPlacesOverlay:
        typeof obj.showPlacesOverlay === 'boolean'
          ? obj.showPlacesOverlay
          : fallback.showPlacesOverlay,
      showExclusionsOverlay:
        typeof obj.showExclusionsOverlay === 'boolean'
          ? obj.showExclusionsOverlay
          : fallback.showExclusionsOverlay,
      selectedVehicleTypes: normalizeVehicleTypeArray(obj.selectedVehicleTypes),
    };
  } catch {
    return fallback;
  }
}

export function serializeDispatchMapPreferences(prefs: Partial<DispatchMapPreferences>): string {
  return JSON.stringify({
    casedRouteWithArrows: Boolean(
      prefs.casedRouteWithArrows ?? DEFAULT_DISPATCH_MAP_PREFERENCES.casedRouteWithArrows
    ),
    interactiveRoutePinPopovers: Boolean(
      prefs.interactiveRoutePinPopovers ??
        DEFAULT_DISPATCH_MAP_PREFERENCES.interactiveRoutePinPopovers
    ),
    showRouteSummaryPill: Boolean(
      prefs.showRouteSummaryPill ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showRouteSummaryPill
    ),
    showZonesOverlay: Boolean(
      prefs.showZonesOverlay ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showZonesOverlay
    ),
    showTrafficOverlay: Boolean(
      prefs.showTrafficOverlay ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showTrafficOverlay
    ),
    showPlacesOverlay: Boolean(
      prefs.showPlacesOverlay ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showPlacesOverlay
    ),
    showExclusionsOverlay: Boolean(
      prefs.showExclusionsOverlay ?? DEFAULT_DISPATCH_MAP_PREFERENCES.showExclusionsOverlay
    ),
    selectedVehicleTypes: normalizeVehicleTypeArray(prefs.selectedVehicleTypes),
  });
}

function arePreferencesEqual(a: DispatchMapPreferences, b: DispatchMapPreferences): boolean {
  if (
    a.casedRouteWithArrows !== b.casedRouteWithArrows ||
    a.interactiveRoutePinPopovers !== b.interactiveRoutePinPopovers ||
    a.showRouteSummaryPill !== b.showRouteSummaryPill ||
    a.showZonesOverlay !== b.showZonesOverlay ||
    a.showTrafficOverlay !== b.showTrafficOverlay ||
    a.showPlacesOverlay !== b.showPlacesOverlay ||
    a.showExclusionsOverlay !== b.showExclusionsOverlay ||
    a.selectedVehicleTypes.length !== b.selectedVehicleTypes.length
  ) {
    return false;
  }
  for (let i = 0; i < a.selectedVehicleTypes.length; i += 1) {
    if (a.selectedVehicleTypes[i] !== b.selectedVehicleTypes[i]) return false;
  }
  return true;
}

type PrefsListener = (next: DispatchMapPreferences) => void;
const inWindowListeners = new Set<PrefsListener>();

function readClientStoredPreferences(
  adminDefaults?: DispatchMapAdminOverlayDefaults | null
): DispatchMapPreferences {
  if (typeof window === 'undefined') {
    return buildFallbackPreferences(adminDefaults);
  }
  try {
    return parseDispatchMapPreferences(
      window.localStorage.getItem(DISPATCH_MAP_PREFS_STORAGE_KEY),
      adminDefaults
    );
  } catch {
    return buildFallbackPreferences(adminDefaults);
  }
}

function writeClientStoredPreferences(next: DispatchMapPreferences): void {
  const normalized = parseDispatchMapPreferences(serializeDispatchMapPreferences(next));
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        DISPATCH_MAP_PREFS_STORAGE_KEY,
        serializeDispatchMapPreferences(normalized)
      );
    } catch {}
  }
  inWindowListeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch {}
  });
}

export type DispatchMapBooleanPreferenceKey = Exclude<
  keyof DispatchMapPreferences,
  'selectedVehicleTypes'
>;

export interface UseDispatchMapPreferencesResult {
  preferences: DispatchMapPreferences;
  setPreferences: (next: DispatchMapPreferences) => void;
  updatePreference: <K extends keyof DispatchMapPreferences>(
    key: K,
    value: DispatchMapPreferences[K]
  ) => void;
  togglePreference: (key: DispatchMapBooleanPreferenceKey) => void;
  toggleVehicleType: (vehicleTypeKey: string) => void;
  setSelectedVehicleTypes: (types: string[]) => void;
  resetPreferences: () => void;
}

/**
 * SSR-deterministic hook for Dispatch Map & Route Display preferences (`ct_dispatch_map_prefs_v1`).
 * Initializes with `DEFAULT_DISPATCH_MAP_PREFERENCES` on both server and initial client render,
 * hydrates inside `useEffect`, and synchronizes updates across both same-window components
 * and detached `?module=map` pop-out windows (`storage` event).
 */
export function useDispatchMapPreferences(
  adminDefaults?: DispatchMapAdminOverlayDefaults | null
): UseDispatchMapPreferencesResult {
  const [preferences, setPreferencesState] = useState<DispatchMapPreferences>(() =>
    buildFallbackPreferences(null)
  );
  const adminDefaultsRef = useRef(adminDefaults);
  adminDefaultsRef.current = adminDefaults;

  useEffect(() => {
    setPreferencesState(readClientStoredPreferences(adminDefaultsRef.current));

    const handleInWindowChange: PrefsListener = (next) => {
      setPreferencesState((prev) =>
        arePreferencesEqual(prev, next)
          ? prev
          : { ...next, selectedVehicleTypes: [...next.selectedVehicleTypes] }
      );
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === DISPATCH_MAP_PREFS_STORAGE_KEY || e.key === null) {
        const next = parseDispatchMapPreferences(e.newValue, adminDefaultsRef.current);
        handleInWindowChange(next);
      }
    };

    inWindowListeners.add(handleInWindowChange);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      inWindowListeners.delete(handleInWindowChange);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [
    adminDefaults?.defaultShowZonesOverlay,
    adminDefaults?.defaultShowTrafficOverlay,
    adminDefaults?.defaultShowPlacesOverlay,
    adminDefaults?.defaultShowExclusionsOverlay,
  ]);

  const setPreferences = useCallback((next: DispatchMapPreferences) => {
    writeClientStoredPreferences(next);
  }, []);

  const updatePreference = useCallback(
    <K extends keyof DispatchMapPreferences>(key: K, value: DispatchMapPreferences[K]) => {
      const current = readClientStoredPreferences(adminDefaultsRef.current);
      const next: DispatchMapPreferences =
        key === 'selectedVehicleTypes'
          ? {
              ...current,
              selectedVehicleTypes: normalizeVehicleTypeArray(value),
            }
          : {
              ...current,
              [key]: Boolean(value),
            };
      writeClientStoredPreferences(next);
    },
    []
  );

  const togglePreference = useCallback((key: DispatchMapBooleanPreferenceKey) => {
    const current = readClientStoredPreferences(adminDefaultsRef.current);
    const next: DispatchMapPreferences = {
      ...current,
      [key]: !current[key],
    };
    writeClientStoredPreferences(next);
  }, []);

  const toggleVehicleType = useCallback((vehicleTypeKey: string) => {
    const clean = String(vehicleTypeKey || '')
      .trim()
      .toLowerCase();
    if (!clean) return;
    const current = readClientStoredPreferences(adminDefaultsRef.current);
    const has = current.selectedVehicleTypes.includes(clean);
    const nextTypes = has
      ? current.selectedVehicleTypes.filter((t) => t !== clean)
      : [...current.selectedVehicleTypes, clean];
    writeClientStoredPreferences({
      ...current,
      selectedVehicleTypes: nextTypes,
    });
  }, []);

  const setSelectedVehicleTypes = useCallback((types: string[]) => {
    const current = readClientStoredPreferences(adminDefaultsRef.current);
    writeClientStoredPreferences({
      ...current,
      selectedVehicleTypes: normalizeVehicleTypeArray(types),
    });
  }, []);

  const resetPreferences = useCallback(() => {
    writeClientStoredPreferences(buildFallbackPreferences(adminDefaultsRef.current));
  }, []);

  return {
    preferences,
    setPreferences,
    updatePreference,
    togglePreference,
    toggleVehicleType,
    setSelectedVehicleTypes,
    resetPreferences,
  };
}
