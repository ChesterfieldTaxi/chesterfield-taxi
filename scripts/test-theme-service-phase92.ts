import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  APPEARANCE_OPTIONS,
  DARK_FLEET_MAP_STYLES,
  DEFAULT_THEME_PREFERENCE,
  LIGHT_FLEET_MAP_STYLES,
  SEMANTIC_THEME_TOKENS,
  THEME_STORAGE_KEY,
  buildPreHydrationThemeScript,
  isDarkModeRoutePath,
  type ThemePreference,
} from '../app/config/theme-tokens';
import {
  applyResolvedTheme,
  getCachedThemePreference,
  initTheme,
  resolvePreferenceWithFallback,
  resolveTheme,
  setThemePreference,
  subscribeToTheme,
  syncThemeFromProfile,
  type ThemeRootElementLike,
  type ThemeStorageLike,
  type UserThemeProfilePort,
} from '../app/services/theme.service';

function createMockStorage(initial: Record<string, string> = {}): ThemeStorageLike & {
  dump: () => Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

function createMockRoot(): ThemeRootElementLike & { classes: Set<string>; style: { colorScheme?: string } } {
  const classes = new Set<string>();
  const style: { colorScheme?: string } = {};
  return {
    classes,
    style,
    classList: {
      add: (...tokens) => tokens.forEach((t) => classes.add(t)),
      remove: (...tokens) => tokens.forEach((t) => classes.delete(t)),
      contains: (t) => classes.has(t),
    },
  };
}

function runPreHydrationInSandbox(params: {
  pathname: string;
  storedValue: string | null;
  systemDark: boolean;
  startWithDarkClass?: boolean;
}) {
  const classes = new Set<string>(params.startWithDarkClass ? ['dark'] : []);
  const style: Record<string, string> = {};
  const sandbox = {
    window: {
      location: { pathname: params.pathname },
      matchMedia: (q: string) => ({
        matches: q.includes('dark') ? params.systemDark : false,
      }),
    },
    localStorage: {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? params.storedValue : null),
    },
    document: {
      documentElement: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
        style,
      },
    },
  };
  vm.runInNewContext(buildPreHydrationThemeScript(), sandbox);
  return { isDark: classes.has('dark'), colorScheme: style.colorScheme };
}

async function runTests() {
  // 1. Config-driven appearance options & route scope
  assert.equal(DEFAULT_THEME_PREFERENCE, 'light');
  assert.deepEqual(
    APPEARANCE_OPTIONS.map((o) => o.value),
    ['light', 'dark', 'system']
  );
  assert.ok(SEMANTIC_THEME_TOKENS.surface.card === '--surface-card');
  assert.ok(SEMANTIC_THEME_TOKENS.fg.muted === '--fg-muted');
  assert.ok(DARK_FLEET_MAP_STYLES.length > LIGHT_FLEET_MAP_STYLES.length);

  assert.equal(isDarkModeRoutePath('/app/dispatch'), true);
  assert.equal(isDarkModeRoutePath('/app/dispatch/popout'), true);
  assert.equal(isDarkModeRoutePath('/dispatch'), true);
  assert.equal(isDarkModeRoutePath('/'), false);
  assert.equal(isDarkModeRoutePath('/app/admin'), true);
  assert.equal(isDarkModeRoutePath('/admin'), true);
  assert.equal(isDarkModeRoutePath('/app/passenger'), true);
  assert.equal(isDarkModeRoutePath('/app/login'), true);
  assert.equal(isDarkModeRoutePath('/app/register'), true);
  assert.equal(isDarkModeRoutePath('/app/hub'), true);
  assert.equal(isDarkModeRoutePath('/app/corporate'), true);
  assert.equal(isDarkModeRoutePath('/app/driver'), false);

  // 2. resolveTheme behavior (`light` | `dark` | `system` | unset/invalid)
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme(null, true), 'light', 'Unset preference must default to light');
  assert.equal(resolveTheme(undefined, true), 'light');
  assert.equal(resolveTheme('invalid_value', true), 'light');

  // 3. Fallback order: localStorage -> Firestore profile -> 'light'
  assert.equal(
    resolvePreferenceWithFallback('dark', 'light'),
    'dark',
    'localStorage must take precedence over profile when cached locally'
  );
  assert.equal(
    resolvePreferenceWithFallback(null, 'dark'),
    'dark',
    'New device with empty localStorage must fall back to profile value'
  );
  assert.equal(
    resolvePreferenceWithFallback(null, 'system'),
    'system',
    'New device must honor system preference from profile'
  );
  assert.equal(
    resolvePreferenceWithFallback(null, undefined),
    'light',
    'User with neither localStorage nor profile preference must default to light'
  );
  assert.equal(resolvePreferenceWithFallback('corrupt', 'dark'), 'dark');

  // 4. applyResolvedTheme & initTheme DOM class toggling
  const root = createMockRoot();
  applyResolvedTheme('dark', { rootElement: root });
  assert.equal(root.classes.has('dark'), true);
  assert.equal(root.style.colorScheme, 'dark');

  applyResolvedTheme('light', { rootElement: root });
  assert.equal(root.classes.has('dark'), false);
  assert.equal(root.style.colorScheme, 'light');

  // Route scope enforcement keeps non-enabled portals light
  applyResolvedTheme('dark', {
    rootElement: root,
    enforceRouteScope: true,
    getPathname: () => '/app/driver',
  });
  assert.equal(root.classes.has('dark'), false);

  const initStorage = createMockStorage({ [THEME_STORAGE_KEY]: 'system' });
  const initSnap = initTheme({
    storage: initStorage,
    rootElement: root,
    getSystemPrefersDark: () => true,
  });
  assert.deepEqual(initSnap, { preference: 'system', resolvedTheme: 'dark' });
  assert.equal(root.classes.has('dark'), true);

  // 5. New-device profile hydration & setThemePreference persistence
  const newDeviceStorage = createMockStorage();
  const savedProfileUpdates: Array<{ uid: string; pref: ThemePreference }> = [];
  const profilePort: UserThemeProfilePort = {
    getUserThemePreference: async (uid) => (uid === 'disp-42' ? 'dark' : undefined),
    updateUserThemePreference: async (uid, pref) => {
      savedProfileUpdates.push({ uid, pref });
    },
  };

  const notifications: Array<{ preference: ThemePreference; resolvedTheme: string }> = [];
  const unsub = subscribeToTheme((snap) => notifications.push(snap));

  const hydratedSnap = await syncThemeFromProfile('disp-42', undefined, {
    storage: newDeviceStorage,
    rootElement: root,
    getSystemPrefersDark: () => false,
    profilePort,
  });
  assert.deepEqual(hydratedSnap, { preference: 'dark', resolvedTheme: 'dark' });
  assert.equal(
    getCachedThemePreference(newDeviceStorage),
    'dark',
    'Profile preference hydrated on a new device must be cached in localStorage'
  );
  assert.equal(root.classes.has('dark'), true);

  // Subsequent sync when localStorage already has a value does not overwrite local cache
  await setThemePreference('light', 'disp-42', {
    storage: newDeviceStorage,
    rootElement: root,
    getSystemPrefersDark: () => true,
    profilePort,
  });
  assert.equal(getCachedThemePreference(newDeviceStorage), 'light');
  assert.equal(root.classes.has('dark'), false);
  assert.deepEqual(savedProfileUpdates, [{ uid: 'disp-42', pref: 'light' }]);

  const secondSync = await syncThemeFromProfile('disp-42', 'dark', {
    storage: newDeviceStorage,
    rootElement: root,
    getSystemPrefersDark: () => false,
    profilePort,
  });
  assert.equal(secondSync.preference, 'light', 'Existing localStorage cache wins without blocking');
  assert.ok(notifications.length >= 2);
  unsub();

  // 6. Pre-hydration script (no flash on reload + shared storage key + non-dispatch isolation)
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/dispatch',
      storedValue: 'dark',
      systemDark: false,
    }),
    { isDark: true, colorScheme: 'dark' }
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/dispatch/popout',
      storedValue: 'system',
      systemDark: true,
    }),
    { isDark: true, colorScheme: 'dark' }
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/dispatch',
      storedValue: null,
      systemDark: true,
    }),
    { isDark: false, colorScheme: 'light' },
    'No saved preference must default to light even if OS prefers dark'
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/admin',
      storedValue: 'dark',
      systemDark: true,
    }),
    { isDark: true, colorScheme: 'dark' },
    'Admin routes must apply dark pre-hydration in Phase 93'
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/passenger',
      storedValue: 'dark',
      systemDark: true,
    }),
    { isDark: true, colorScheme: 'dark' },
    'Passenger routes must apply dark pre-hydration in Phase 94'
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/login',
      storedValue: 'dark',
      systemDark: true,
    }),
    { isDark: true, colorScheme: 'dark' },
    'Client login route must apply dark pre-hydration in Phase 94'
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/corporate',
      storedValue: 'dark',
      systemDark: true,
    }),
    { isDark: true, colorScheme: 'dark' },
    'Corporate route must apply dark pre-hydration in Phase 95'
  );
  assert.deepEqual(
    runPreHydrationInSandbox({
      pathname: '/app/driver',
      storedValue: 'dark',
      systemDark: true,
      startWithDarkClass: true,
    }),
    { isDark: false, colorScheme: 'light' },
    'Non-enabled routes must stay visually unchanged'
  );

  // 7. Static wiring verification
  const appCss = fs.readFileSync(path.resolve('app/app.css'), 'utf8');
  assert.ok(appCss.includes('@custom-variant dark (&:where(.dark, .dark *));'));
  assert.ok(appCss.includes('--color-surface-card: var(--surface-card);'));
  assert.ok(appCss.includes('.dark {'));

  const topHeader = fs.readFileSync(
    path.resolve('app/components/domain/dispatch/workspace/DispatchDesktopTopHeader.tsx'),
    'utf8'
  );
  assert.ok(topHeader.includes('Dispatch Settings'));
  assert.ok(!topHeader.includes('Console &amp; Map Settings'));
  assert.ok(topHeader.includes('AppearanceToggle'));
  const appearanceToggle = fs.readFileSync(
    path.resolve('app/components/ui/AppearanceToggle.tsx'),
    'utf8'
  );
  assert.ok(appearanceToggle.includes('APPEARANCE_OPTIONS'));

  const presets = fs.readFileSync(
    path.resolve('app/components/domain/admin/website/theme-presets.ts'),
    'utf8'
  );
  assert.ok(presets.includes('darkTokens?: Partial<BrandingConfig>;'));

  console.log('✓ Phase 92 theme.service & dark mode foundation tests passed (all assertions green).');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
