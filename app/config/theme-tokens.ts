/**
 * Semantic Theme Tokens & Appearance Configuration
 *
 * Single source of truth for:
 * - User appearance preference options (`light` | `dark` | `system`)
 * - Shared localStorage key (consumed by both `root.tsx` pre-hydration script and `theme.service.ts`)
 * - Route prefixes where semantic dark mode is active (Phase 92: Dispatch Console + Pop-Out;
 *   Phases 93-96 extend to Admin, Passenger, Corporate, and Live Site)
 * - Semantic CSS-variable token registry
 * - Google Maps light & dark tile styles
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';
export const THEME_STORAGE_KEY = 'ct_theme_preference';
export const THEME_CHANGE_EVENT = 'ct:theme-change';

export interface AppearanceOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
  readonly icon: 'sun' | 'moon' | 'monitor';
}

export const APPEARANCE_OPTIONS: readonly AppearanceOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'High-contrast daylight console',
    icon: 'sun',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Low-glare night shift console',
    icon: 'moon',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follow operating system setting',
    icon: 'monitor',
  },
] as const;

/**
 * Surfaces where semantic dark mode is currently enabled.
 * Future phases extend this list as each portal is converted:
 * - Phase 93: `/app/admin`, `/admin`
 * - Phase 94: `/app/passenger`, `/app/login`, `/app/register`, `/app/hub`
 * - Phase 95: `/app/corporate`, `/corporate`
 * - Phase 96: `/` (public live site via brand `darkTokens`)
 */
export const DARK_MODE_ENABLED_PATH_PREFIXES = [
  '/app/dispatch',
  '/dispatch',
  '/app/admin',
  '/admin',
  '/app/passenger',
  '/app/login',
  '/app/register',
  '/app/hub',
  '/app/corporate',
] as const;

export function isDarkModeRoutePath(pathname: string): boolean {
  if (!pathname) return false;
  return DARK_MODE_ENABLED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Builds the synchronous inline pre-hydration script injected in `app/root.tsx` `<head>`
 * so dispatch routes apply `.dark` before first paint without any light-theme flash,
 * while non-converted portals remain untouched.
 */
export function buildPreHydrationThemeScript(): string {
  const keyJson = JSON.stringify(THEME_STORAGE_KEY);
  const prefixesJson = JSON.stringify(DARK_MODE_ENABLED_PATH_PREFIXES);
  return `(function(){try{var p=window.location.pathname||'';var prefixes=${prefixesJson};var enabled=false;for(var i=0;i<prefixes.length;i++){var pre=prefixes[i];if(p===pre||p.indexOf(pre+'/')===0){enabled=true;break;}}var root=document.documentElement;if(!enabled){root.classList.remove('dark');root.style.colorScheme='light';return;}var t=localStorage.getItem(${keyJson});var dark=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark){root.classList.add('dark');root.style.colorScheme='dark';}else{root.classList.remove('dark');root.style.colorScheme='light';}}catch(e){}})();`;
}

export const SEMANTIC_THEME_TOKENS = {
  surface: {
    page: '--surface-page',
    canvas: '--surface-canvas',
    card: '--surface-card',
    subtle: '--surface-subtle',
    muted: '--surface-muted',
    emphasis: '--surface-emphasis',
    strong: '--surface-strong',
    header: '--surface-header',
    headerElevated: '--surface-header-elevated',
    headerMuted: '--surface-header-muted',
    overlay: '--surface-overlay',
    inverted: '--surface-inverted',
  },
  fg: {
    primary: '--fg-primary',
    strong: '--fg-strong',
    secondary: '--fg-secondary',
    muted: '--fg-muted',
    subtle: '--fg-subtle',
    faint: '--fg-faint',
    inverted: '--fg-inverted',
    onHeader: '--fg-on-header',
    onHeaderMuted: '--fg-on-header-muted',
  },
  border: {
    faint: '--border-faint',
    subtle: '--border-subtle',
    strong: '--border-strong',
    emphasis: '--border-emphasis',
    header: '--border-header',
  },
  status: {
    successBg: '--status-success-bg',
    successBgStrong: '--status-success-bg-strong',
    successFg: '--status-success-fg',
    successBorder: '--status-success-border',
    warningBg: '--status-warning-bg',
    warningBgStrong: '--status-warning-bg-strong',
    warningFg: '--status-warning-fg',
    warningBorder: '--status-warning-border',
    dangerBg: '--status-danger-bg',
    dangerBgStrong: '--status-danger-bg-strong',
    dangerFg: '--status-danger-fg',
    dangerBorder: '--status-danger-border',
    infoBg: '--status-info-bg',
    infoBgStrong: '--status-info-bg-strong',
    infoFg: '--status-info-fg',
    infoBorder: '--status-info-border',
    stagedBg: '--status-staged-bg',
    stagedBgStrong: '--status-staged-bg-strong',
    stagedFg: '--status-staged-fg',
    stagedBorder: '--status-staged-border',
  },
} as const;

export const LIGHT_FLEET_MAP_STYLES: google.maps.MapTypeStyle[] = [
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
];

export const DARK_FLEET_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#e2e8f0' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0b2220' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0f172a' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#090e1a' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }],
  },
];
