/**
 * React Hook for Semantic Theme Management (`useTheme`)
 *
 * - Reads cached preference immediately without SSR mismatch or flash
 * - Hydrates from Firestore user profile on new devices when `uid` is available
 * - Live-syncs across detached pop-out windows (`dispatch.popout.tsx`) via `storage` events
 * - Live-syncs OS theme transitions via `matchMedia('(prefers-color-scheme: dark)')` when preference is `'system'`
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from '../config/theme-tokens';
import {
  applyResolvedTheme,
  getThemeSnapshot,
  initTheme,
  resolvePreferenceWithFallback,
  resolveTheme,
  setThemePreference,
  subscribeToTheme,
  syncThemeFromProfile,
} from '../services/theme.service';

export interface UseThemeOptions {
  uid?: string | null;
  profilePreference?: ThemePreference | null;
  /** When false, observes preference/resolvedTheme without mutating `document.documentElement` directly. */
  applyToDom?: boolean;
}

export interface UseThemeResult {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setPreference: (next: ThemePreference) => void;
}

export function useTheme(options?: UseThemeOptions): UseThemeResult {
  const uid = options?.uid ?? null;
  const profilePreference = options?.profilePreference ?? null;
  const applyToDom = options?.applyToDom ?? true;

  // Deterministic initial state for SSR hydration safety; synced immediately in useEffect
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window !== 'undefined' ? getThemeSnapshot().preference : DEFAULT_THEME_PREFERENCE
  );
  const [resolvedTheme, setResolvedThemeState] = useState<ResolvedTheme>(() =>
    typeof window !== 'undefined' ? getThemeSnapshot().resolvedTheme : 'light'
  );

  // 1. Initialize from localStorage immediately on mount & subscribe to in-window changes
  useEffect(() => {
    const initial = applyToDom ? initTheme() : getThemeSnapshot();
    setPreferenceState(initial.preference);
    setResolvedThemeState(initial.resolvedTheme);

    const unsub = subscribeToTheme((snapshot) => {
      setPreferenceState(snapshot.preference);
      setResolvedThemeState(snapshot.resolvedTheme);
    });

    return unsub;
  }, [applyToDom]);

  // 2. Sync from user profile on new devices (no localStorage entry yet)
  useEffect(() => {
    if (!uid && !profilePreference) return;
    let active = true;
    void syncThemeFromProfile(uid, profilePreference).then((snapshot) => {
      if (!active) return;
      setPreferenceState(snapshot.preference);
      setResolvedThemeState(snapshot.resolvedTheme);
    });
    return () => {
      active = false;
    };
  }, [uid, profilePreference]);

  // 3. Listen to cross-window `storage` events (for `dispatch.popout.tsx` live sync) + OS `prefers-color-scheme`
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      const nextPref = resolvePreferenceWithFallback(event.newValue);
      const nextResolved = resolveTheme(nextPref);
      if (applyToDom) {
        applyResolvedTheme(nextResolved);
      }
      setPreferenceState(nextPref);
      setResolvedThemeState(nextResolved);
    };

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleSystemChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const current = getThemeSnapshot();
      if (current.preference !== 'system') return;
      const nextResolved: ResolvedTheme = event.matches ? 'dark' : 'light';
      if (applyToDom) {
        applyResolvedTheme(nextResolved);
      }
      setResolvedThemeState(nextResolved);
    };

    window.addEventListener('storage', handleStorage);
    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleSystemChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleSystemChange);
      }
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleSystemChange);
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(handleSystemChange);
        }
      }
    };
  }, [applyToDom]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      void setThemePreference(next, uid);
    },
    [uid]
  );

  return {
    preference,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setPreference,
  };
}
