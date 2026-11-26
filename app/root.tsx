import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useRouteLoaderData,
} from "react-router";
import { COMPANY_CONFIG, DEFAULT_GOOGLE_MAPS_KEY } from "./config/companyConfig";
import { buildPreHydrationThemeScript, isDarkModeRoutePath, THEME_CHANGE_EVENT, THEME_STORAGE_KEY } from "./config/theme-tokens";
import { applyResolvedTheme, getThemeSnapshot, initTheme, resolveEffectiveBranding, subscribeToTheme } from "./services/theme.service";
import { getAdminConfigService } from "./core/services/config/admin-config.service";
import { useRootPwaServiceWorker } from "./core/hooks/usePushNotifications";
import type { BrandingConfig } from "./core/types/config";
import { MapPinIcon, AlertTriangleIcon } from "./components/ui/Icons";
import "./app.css";

function getAccessibleContrastColor(hexColor?: string): string {
  if (!hexColor) return "#ffffff";
  const clean = hexColor.replace("#", "").trim();
  if (clean.length !== 6) return "#ffffff";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.35 ? "#020617" : "#ffffff";
}

function sanitizeCustomCss(css?: string): string {
  if (!css) return "";
  return css.replace(/<\/?style[^>]*>/gi, "").replace(/<\/?script[^>]*>/gi, "");
}

export async function loader() {
  const clientMapsApiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    DEFAULT_GOOGLE_MAPS_KEY;

  return {
    ENV: {
      VITE_GOOGLE_MAPS_API_KEY: clientMapsApiKey,
    },
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isDriverRoute =
    location.pathname.startsWith('/app/driver') || location.pathname.startsWith('/driver');
  const manifestHref = isDriverRoute ? '/manifest-driver.json' : '/manifest.json';
  const appIconHref = isDriverRoute ? '/icon-driver-192.svg' : '/icon-192.svg';

  const rootData = useRouteLoaderData<typeof loader>("root");
  const clientMapsKey =
    rootData?.ENV?.VITE_GOOGLE_MAPS_API_KEY ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) ||
    DEFAULT_GOOGLE_MAPS_KEY;

  const primaryHex = COMPANY_CONFIG.primaryColor || "#2563eb";
  const primaryFg = getAccessibleContrastColor(primaryHex);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={
        {
          "--color-primary": primaryHex,
          "--color-primary-fg": primaryFg,
          "--color-secondary": COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--brand-primary": primaryHex,
          "--brand-secondary": COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--color-heading": COMPANY_CONFIG.headingColor || "#0f172a",
          "--color-text-main": COMPANY_CONFIG.bodyTextColor || "#334155",
          "--color-text-muted": COMPANY_CONFIG.mutedTextColor || "#64748b",
          "--btn-primary-bg": COMPANY_CONFIG.btnPrimaryBg || primaryHex,
          "--btn-primary-text": COMPANY_CONFIG.btnPrimaryText || primaryFg,
          "--btn-secondary-bg": COMPANY_CONFIG.btnSecondaryBg || "#0f172a",
          "--btn-secondary-text": COMPANY_CONFIG.btnSecondaryText || "#ffffff",
          "--btn-radius": COMPANY_CONFIG.btnBorderRadius || "12px",
          "--navbar-bg": COMPANY_CONFIG.navbarBg || "#0f172a",
          "--card-bg": COMPANY_CONFIG.cardBg || "#ffffff",
          "--font-heading": `'${COMPANY_CONFIG.headingFont || 'Lexend'}', 'Inter', sans-serif`,
          "--font-body": `'${COMPANY_CONFIG.bodyFont || 'Inter'}', sans-serif`,
        } as React.CSSProperties
      }
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#2563eb" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lexend:wght@500;600;700;800&display=swap"
        />
        <link rel="manifest" href={manifestHref} />
        <link rel="icon" type="image/svg+xml" href={appIconHref} />
        <link rel="apple-touch-icon" href={appIconHref} />
        <Meta />
        <Links />
        {COMPANY_CONFIG.cms?.customCss && (
          <style dangerouslySetInnerHTML={{ __html: sanitizeCustomCss(COMPANY_CONFIG.cms.customCss) }} />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: buildPreHydrationThemeScript(),
          }}
        />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = window.ENV || {}; window.ENV.VITE_GOOGLE_MAPS_API_KEY = ${JSON.stringify(
              clientMapsKey
            )};`,
          }}
        />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function useDynamicBrandingSync(pathname: string) {
  useEffect(() => {
    let latestBranding: BrandingConfig = {
      primaryColor: COMPANY_CONFIG.primaryColor || '#2563eb',
      secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a',
      headingFont: COMPANY_CONFIG.headingFont || 'Lexend',
      bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
      headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
      bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
      mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
      btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#2563eb',
      btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#ffffff',
      btnSecondaryBg: COMPANY_CONFIG.btnSecondaryBg || '#0f172a',
      btnSecondaryText: COMPANY_CONFIG.btnSecondaryText || '#ffffff',
      btnBorderRadius: COMPANY_CONFIG.btnBorderRadius || '12px',
      navbarBg: COMPANY_CONFIG.navbarBg || '#0f172a',
      cardBg: COMPANY_CONFIG.cardBg || '#ffffff',
    };

    const applyTokens = (rawBranding?: Partial<BrandingConfig>) => {
      if (typeof document === 'undefined') return;
      if (rawBranding) {
        latestBranding = { ...latestBranding, ...rawBranding };
      }
      const effectiveTheme = isDarkModeRoutePath(pathname)
        ? getThemeSnapshot().resolvedTheme
        : 'light';
      const branding = resolveEffectiveBranding(latestBranding, effectiveTheme);
      const root = document.documentElement;
      if (branding.primaryColor) {
        root.style.setProperty('--color-primary', branding.primaryColor);
        root.style.setProperty('--brand-primary', branding.primaryColor);
        root.style.setProperty('--color-primary-fg', getAccessibleContrastColor(branding.primaryColor));
      }
      if (branding.secondaryColor) {
        root.style.setProperty('--color-secondary', branding.secondaryColor);
        root.style.setProperty('--brand-secondary', branding.secondaryColor);
      }
      if (branding.headingFont) {
        root.style.setProperty('--font-heading', `'${branding.headingFont}', sans-serif`);
      }
      if (branding.bodyFont) {
        root.style.setProperty('--font-body', `'${branding.bodyFont}', sans-serif`);
      }
      if (branding.headingColor) {
        root.style.setProperty('--color-heading', branding.headingColor);
      }
      if (branding.bodyTextColor) {
        root.style.setProperty('--color-text-main', branding.bodyTextColor);
      }
      if (branding.mutedTextColor) {
        root.style.setProperty('--color-text-muted', branding.mutedTextColor);
      }
      if (branding.btnPrimaryBg) {
        root.style.setProperty('--btn-primary-bg', branding.btnPrimaryBg);
      }
      if (branding.btnPrimaryText) {
        root.style.setProperty('--btn-primary-text', branding.btnPrimaryText);
      }
      if (branding.btnSecondaryBg) {
        root.style.setProperty('--btn-secondary-bg', branding.btnSecondaryBg);
      }
      if (branding.btnSecondaryText) {
        root.style.setProperty('--btn-secondary-text', branding.btnSecondaryText);
      }
      if (branding.btnBorderRadius) {
        root.style.setProperty('--btn-radius', branding.btnBorderRadius);
      }
      if (branding.navbarBg) {
        root.style.setProperty('--navbar-bg', branding.navbarBg);
      }
      if (branding.cardBg) {
        root.style.setProperty('--card-bg', branding.cardBg);
      }
    };

    try {
      const cached = getAdminConfigService().getCachedSettings();
      applyTokens(cached?.branding);
    } catch {}

    const unsubSettings = getAdminConfigService().subscribeToSettings(
      (settings) => {
        if (settings?.branding) {
          applyTokens(settings.branding);
        }
      },
      () => {}
    );

    const unsubTheme = subscribeToTheme(() => applyTokens());
    const handleThemeEvent = () => applyTokens();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) {
        applyTokens();
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeEvent);
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubSettings();
      unsubTheme();
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, [pathname]);
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  useDynamicBrandingSync(location.pathname);
  useRootPwaServiceWorker(navigate);

  useEffect(() => {
    if (isDarkModeRoutePath(location.pathname)) {
      initTheme();
    } else {
      applyResolvedTheme('light');
    }
  }, [location.pathname]);

  return <Outlet />;
}

export function ErrorBoundary({ error }: { error?: unknown }) {
  let message = "We're sorry, but an unexpected error occurred.";
  let details = "";
  let is404 = false;

  if (error && typeof error === 'object') {
    if ('status' in error && (error as Record<string, unknown>).status === 404) {
      is404 = true;
      message = "Page Not Found";
      details = "The page you are looking for might have been moved, removed, or is temporarily unavailable.";
    } else if ('message' in error) {
      details = String((error as Record<string, unknown>).message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center px-4 py-12 text-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center">
          {is404 ? <MapPinIcon className="w-8 h-8" /> : <AlertTriangleIcon className="w-8 h-8 text-amber-400" />}
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {is404 ? '404 - Destination Not Found' : 'Service Temporarily Interrupted'}
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {message}
          </p>
          {details && !is404 && (
            <p className="text-xs text-slate-500 font-mono bg-slate-950 p-2.5 rounded-lg text-left overflow-x-auto">
              {details}
            </p>
          )}
        </div>
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <a
            href="/"
            className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <span>Return to Home</span>
          </a>
          <a
            href={`tel:${COMPANY_CONFIG.phone.dispatch.replace(/[^0-9+]/g, '')}`}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <span>Call Dispatch</span>
          </a>
        </div>
      </div>
    </div>
  );
}
