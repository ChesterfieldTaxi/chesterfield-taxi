/**
 * Theme Service
 *
 * Pure + DOM/Storage-abstracted theme preference management:
 * - Values: `'light' | 'dark' | 'system'` (default: `'light'`)
 * - Fallback order: `localStorage` -> Firestore user profile (`themePreference`) -> `'light'`
 * - Applies `.dark` class on `document.documentElement` immediately from `localStorage` without
 *   blocking on Firestore, and syncs user profile preference via `AdminAuthService`.
 */

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  isDarkModeRoutePath,
  type ResolvedTheme,
  type ThemePreference,
} from '../config/theme-tokens';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import type { BrandingConfig } from '../core/types/config';

export interface ThemeStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeRootElementLike {
  classList: {
    add(...tokens: string[]): void;
    remove(...tokens: string[]): void;
    contains?(token: string): boolean;
  };
  style?: {
    colorScheme?: string;
  };
}

export interface UserThemeProfilePort {
  getUserThemePreference(uid: string): Promise<ThemePreference | undefined>;
  updateUserThemePreference(uid: string, preference: ThemePreference): Promise<void>;
}

export interface ThemeServiceDeps {
  storage?: ThemeStorageLike | null;
  rootElement?: ThemeRootElementLike | null;
  getSystemPrefersDark?: () => boolean;
  getPathname?: () => string;
  enforceRouteScope?: boolean;
  profilePort?: UserThemeProfilePort;
}

export interface ThemeStateSnapshot {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
}

type ThemeSubscriber = (snapshot: ThemeStateSnapshot) => void;

const subscribers = new Set<ThemeSubscriber>();

export function isValidThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function detectSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function getDefaultStorage(): ThemeStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getDefaultRootElement(): ThemeRootElementLike | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement;
}

function getDefaultPathname(): string {
  if (typeof window === 'undefined' || !window.location) return '/app/dispatch';
  return window.location.pathname || '';
}

function getDefaultProfilePort(): UserThemeProfilePort {
  return getAdminAuthService();
}

/**
 * Resolves `'light' | 'dark' | 'system'` (or missing/invalid) to `'light' | 'dark'`.
 * Missing or unrecognized values strictly resolve to `'light'`.
 */
export function resolveTheme(
  preference: ThemePreference | string | null | undefined,
  systemPrefersDark?: boolean
): ResolvedTheme {
  if (!isValidThemePreference(preference)) {
    return 'light';
  }
  if (preference === 'system') {
    const prefersDark = systemPrefersDark ?? detectSystemPrefersDark();
    return prefersDark ? 'dark' : 'light';
  }
  return preference;
}

/**
 * Resolves effective preference following the Phase 92 fallback chain:
 * 1. Cached `localStorage` preference
 * 2. User profile `themePreference` (Firestore)
 * 3. Default (`'light'`)
 */
export function resolvePreferenceWithFallback(
  cachedPreference: unknown,
  profilePreference?: unknown
): ThemePreference {
  if (isValidThemePreference(cachedPreference)) {
    return cachedPreference;
  }
  if (isValidThemePreference(profilePreference)) {
    return profilePreference;
  }
  return DEFAULT_THEME_PREFERENCE;
}

export function getCachedThemePreference(
  storage: ThemeStorageLike | null = getDefaultStorage()
): ThemePreference | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isValidThemePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setCachedThemePreference(
  preference: ThemePreference,
  storage: ThemeStorageLike | null = getDefaultStorage()
): void {
  if (!storage || !isValidThemePreference(preference)) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {}
}

/**
 * Applies a resolved theme (`'light' | 'dark'`) to the target root element (`.dark` class + `colorScheme`).
 */
export function applyResolvedTheme(
  resolved: ResolvedTheme,
  deps?: Pick<ThemeServiceDeps, 'rootElement' | 'getPathname' | 'enforceRouteScope'>
): ResolvedTheme {
  const root = deps?.rootElement !== undefined ? deps.rootElement : getDefaultRootElement();
  const enforceScope = deps?.enforceRouteScope ?? false;
  const pathname = deps?.getPathname ? deps.getPathname() : getDefaultPathname();
  const effectiveResolved: ResolvedTheme =
    enforceScope && !isDarkModeRoutePath(pathname) ? 'light' : resolved;

  if (root) {
    if (effectiveResolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (root.style) {
      root.style.colorScheme = effectiveResolved;
    }
  }
  return effectiveResolved;
}

function emitThemeChange(snapshot: ThemeStateSnapshot): void {
  subscribers.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: snapshot }));
    } catch {}
  }
}

export function getThemeSnapshot(deps?: ThemeServiceDeps): ThemeStateSnapshot {
  const storage = deps?.storage !== undefined ? deps.storage : getDefaultStorage();
  const systemDark = deps?.getSystemPrefersDark
    ? deps.getSystemPrefersDark()
    : detectSystemPrefersDark();
  const preference = resolvePreferenceWithFallback(getCachedThemePreference(storage));
  const resolvedTheme = resolveTheme(preference, systemDark);
  return { preference, resolvedTheme };
}

/**
 * Synchronously reads `localStorage` (falling back to `'light'`), resolves, and applies `.dark`.
 * Never blocks on Firestore.
 */
export function initTheme(deps?: ThemeServiceDeps): ThemeStateSnapshot {
  const snapshot = getThemeSnapshot(deps);
  applyResolvedTheme(snapshot.resolvedTheme, deps);
  return snapshot;
}

/**
 * Hydrates theme preference from the user's profile when `localStorage` has no saved preference
 * (e.g. signing in on a new device), caches it to `localStorage`, and applies immediately.
 */
export async function syncThemeFromProfile(
  uid: string | null | undefined,
  knownProfilePreference?: ThemePreference | null,
  deps?: ThemeServiceDeps
): Promise<ThemeStateSnapshot> {
  const storage = deps?.storage !== undefined ? deps.storage : getDefaultStorage();
  const systemDark = deps?.getSystemPrefersDark
    ? deps.getSystemPrefersDark()
    : detectSystemPrefersDark();
  const cached = getCachedThemePreference(storage);

  if (cached) {
    const resolvedTheme = resolveTheme(cached, systemDark);
    applyResolvedTheme(resolvedTheme, deps);
    return { preference: cached, resolvedTheme };
  }

  let profilePref: ThemePreference | undefined = isValidThemePreference(knownProfilePreference)
    ? knownProfilePreference
    : undefined;

  if (!profilePref && uid) {
    const port = deps?.profilePort ?? getDefaultProfilePort();
    try {
      profilePref = await port.getUserThemePreference(uid);
    } catch {}
  }

  const effectivePref = resolvePreferenceWithFallback(cached, profilePref);
  if (profilePref && isValidThemePreference(profilePref)) {
    setCachedThemePreference(profilePref, storage);
  }

  const resolvedTheme = resolveTheme(effectivePref, systemDark);
  applyResolvedTheme(resolvedTheme, deps);
  const snapshot: ThemeStateSnapshot = { preference: effectivePref, resolvedTheme };
  emitThemeChange(snapshot);
  return snapshot;
}

/**
 * Updates theme preference:
 * 1. Caches in `localStorage` immediately
 * 2. Applies `.dark` class and notifies same-window + cross-window listeners immediately
 * 3. Persists asynchronously to Firestore user profile when `uid` is provided
 */
export async function setThemePreference(
  preference: ThemePreference,
  uid?: string | null,
  deps?: ThemeServiceDeps
): Promise<ThemeStateSnapshot> {
  const validPref = isValidThemePreference(preference) ? preference : DEFAULT_THEME_PREFERENCE;
  const storage = deps?.storage !== undefined ? deps.storage : getDefaultStorage();
  const systemDark = deps?.getSystemPrefersDark
    ? deps.getSystemPrefersDark()
    : detectSystemPrefersDark();

  setCachedThemePreference(validPref, storage);
  const resolvedTheme = resolveTheme(validPref, systemDark);
  applyResolvedTheme(resolvedTheme, deps);

  const snapshot: ThemeStateSnapshot = { preference: validPref, resolvedTheme };
  emitThemeChange(snapshot);

  if (uid) {
    const port = deps?.profilePort ?? getDefaultProfilePort();
    try {
      await port.updateUserThemePreference(uid, validPref);
    } catch {}
  }

  return snapshot;
}

export function subscribeToTheme(listener: ThemeSubscriber): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Resolves effective public-site branding for the active theme (`'light' | 'dark'`).
 * In dark mode, merges preset/custom `darkTokens` and applies safe dark surface/text
 * fallbacks for custom brands without `darkTokens`, preserving `primaryColor`, fonts,
 * and `btnBorderRadius` unless explicitly overridden.
 */
export function resolveEffectiveBranding(
  branding: BrandingConfig,
  resolvedTheme: ResolvedTheme
): BrandingConfig {
  if (resolvedTheme !== 'dark') {
    return branding;
  }
  const dt = branding.darkTokens;
  return {
    ...branding,
    ...dt,
    headingColor: dt?.headingColor ?? '#f8fafc',
    bodyTextColor: dt?.bodyTextColor ?? '#cbd5e1',
    mutedTextColor: dt?.mutedTextColor ?? '#94a3b8',
    cardBg: dt?.cardBg ?? '#0f172a',
    navbarBg: dt?.navbarBg ?? '#020617',
    btnSecondaryBg: dt?.btnSecondaryBg ?? '#1e293b',
    btnSecondaryText: dt?.btnSecondaryText ?? '#f8fafc',
  };
}
