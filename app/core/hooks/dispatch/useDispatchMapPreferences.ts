import { useState, useEffect, useCallback } from 'react';

export const DISPATCH_MAP_PREFS_STORAGE_KEY = 'ct_dispatch_map_prefs_v1';

export interface DispatchMapPreferences {
  /** High-contrast outer-cased polyline + directional chevrons along the route (default: true). */
  casedRouteWithArrows: boolean;
  /** Clicking any Green / Orange / Red route pin opens an interactive leg details popover (default: true). */
  interactiveRoutePinPopovers: boolean;
  /** Compact floating route summary pill at bottom-left of the map with distance/ETA & 1-click Clear Route (default: true). */
  showRouteSummaryPill: boolean;
}

export const DEFAULT_DISPATCH_MAP_PREFERENCES: DispatchMapPreferences = Object.freeze({
  casedRouteWithArrows: true,
  interactiveRoutePinPopovers: true,
  showRouteSummaryPill: true,
});

/**
 * Pure, resilient parser for serialized `DispatchMapPreferences`.
 * Falls back field-by-field to `DEFAULT_DISPATCH_MAP_PREFERENCES` on null, malformed JSON, or invalid field types.
 */
export function parseDispatchMapPreferences(
  raw: string | null | undefined
): DispatchMapPreferences {
  if (!raw || typeof raw !== 'string') {
    return { ...DEFAULT_DISPATCH_MAP_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_DISPATCH_MAP_PREFERENCES };
    }
    const obj = parsed as Record<string, unknown>;
    return {
      casedRouteWithArrows:
        typeof obj.casedRouteWithArrows === 'boolean'
          ? obj.casedRouteWithArrows
          : DEFAULT_DISPATCH_MAP_PREFERENCES.casedRouteWithArrows,
      interactiveRoutePinPopovers:
        typeof obj.interactiveRoutePinPopovers === 'boolean'
          ? obj.interactiveRoutePinPopovers
          : DEFAULT_DISPATCH_MAP_PREFERENCES.interactiveRoutePinPopovers,
      showRouteSummaryPill:
        typeof obj.showRouteSummaryPill === 'boolean'
          ? obj.showRouteSummaryPill
          : DEFAULT_DISPATCH_MAP_PREFERENCES.showRouteSummaryPill,
    };
  } catch {
    return { ...DEFAULT_DISPATCH_MAP_PREFERENCES };
  }
}

export function serializeDispatchMapPreferences(prefs: DispatchMapPreferences): string {
  return JSON.stringify({
    casedRouteWithArrows: Boolean(prefs.casedRouteWithArrows),
    interactiveRoutePinPopovers: Boolean(prefs.interactiveRoutePinPopovers),
    showRouteSummaryPill: Boolean(prefs.showRouteSummaryPill),
  });
}

type PrefsListener = (next: DispatchMapPreferences) => void;
const inWindowListeners = new Set<PrefsListener>();

function readClientStoredPreferences(): DispatchMapPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_DISPATCH_MAP_PREFERENCES };
  }
  try {
    return parseDispatchMapPreferences(window.localStorage.getItem(DISPATCH_MAP_PREFS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_DISPATCH_MAP_PREFERENCES };
  }
}

function writeClientStoredPreferences(next: DispatchMapPreferences): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        DISPATCH_MAP_PREFS_STORAGE_KEY,
        serializeDispatchMapPreferences(next)
      );
    } catch {}
  }
  inWindowListeners.forEach((listener) => {
    try {
      listener(next);
    } catch {}
  });
}

export interface UseDispatchMapPreferencesResult {
  preferences: DispatchMapPreferences;
  setPreferences: (next: DispatchMapPreferences) => void;
  updatePreference: <K extends keyof DispatchMapPreferences>(
    key: K,
    value: DispatchMapPreferences[K]
  ) => void;
  togglePreference: (key: keyof DispatchMapPreferences) => void;
  resetPreferences: () => void;
}

/**
 * SSR-deterministic hook for Dispatch Map & Route Display preferences (`ct_dispatch_map_prefs_v1`).
 * Initializes with `DEFAULT_DISPATCH_MAP_PREFERENCES` on both server and initial client render,
 * hydrates inside `useEffect`, and synchronizes updates across both same-window components
 * and detached `?module=map` pop-out windows (`storage` event).
 */
export function useDispatchMapPreferences(): UseDispatchMapPreferencesResult {
  const [preferences, setPreferencesState] = useState<DispatchMapPreferences>(
    () => ({ ...DEFAULT_DISPATCH_MAP_PREFERENCES })
  );

  useEffect(() => {
    setPreferencesState(readClientStoredPreferences());

    const handleInWindowChange: PrefsListener = (next) => {
      setPreferencesState((prev) =>
        prev.casedRouteWithArrows === next.casedRouteWithArrows &&
        prev.interactiveRoutePinPopovers === next.interactiveRoutePinPopovers &&
        prev.showRouteSummaryPill === next.showRouteSummaryPill
          ? prev
          : { ...next }
      );
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === DISPATCH_MAP_PREFS_STORAGE_KEY || e.key === null) {
        const next = parseDispatchMapPreferences(e.newValue);
        handleInWindowChange(next);
      }
    };

    inWindowListeners.add(handleInWindowChange);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      inWindowListeners.delete(handleInWindowChange);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  const setPreferences = useCallback((next: DispatchMapPreferences) => {
    const normalized = parseDispatchMapPreferences(serializeDispatchMapPreferences(next));
    writeClientStoredPreferences(normalized);
  }, []);

  const updatePreference = useCallback(
    <K extends keyof DispatchMapPreferences>(key: K, value: DispatchMapPreferences[K]) => {
      const current = readClientStoredPreferences();
      const next: DispatchMapPreferences = {
        ...current,
        [key]: Boolean(value),
      };
      writeClientStoredPreferences(next);
    },
    []
  );

  const togglePreference = useCallback((key: keyof DispatchMapPreferences) => {
    const current = readClientStoredPreferences();
    const next: DispatchMapPreferences = {
      ...current,
      [key]: !current[key],
    };
    writeClientStoredPreferences(next);
  }, []);

  const resetPreferences = useCallback(() => {
    writeClientStoredPreferences({ ...DEFAULT_DISPATCH_MAP_PREFERENCES });
  }, []);

  return {
    preferences,
    setPreferences,
    updatePreference,
    togglePreference,
    resetPreferences,
  };
}
