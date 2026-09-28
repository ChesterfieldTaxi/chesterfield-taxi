import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { COMPANY_CONFIG, DEFAULT_GOOGLE_MAPS_KEY } from "./config/companyConfig";
import { getAdminConfigService } from "./core/services/config/admin-config.service";
import type { BrandingConfig } from "./core/types/config";
import "./app.css";

export async function loader() {
  const clientMapsApiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    DEFAULT_GOOGLE_MAPS_KEY;

  return {
    ENV: {
      VITE_GOOGLE_MAPS_API_KEY: clientMapsApiKey,
    },
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const clientMapsKey =
    (typeof process !== 'undefined' && (process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY)) ||
    DEFAULT_GOOGLE_MAPS_KEY;

  return (
    <html
      lang="en"
      style={
        {
          "--color-primary": COMPANY_CONFIG.primaryColor || "#2563eb",
          "--color-secondary": COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--brand-primary": COMPANY_CONFIG.primaryColor || "#2563eb",
          "--brand-secondary": COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--color-heading": COMPANY_CONFIG.headingColor || "#0f172a",
          "--color-text-main": COMPANY_CONFIG.bodyTextColor || "#334155",
          "--color-text-muted": COMPANY_CONFIG.mutedTextColor || "#64748b",
          "--btn-primary-bg": COMPANY_CONFIG.btnPrimaryBg || "#2563eb",
          "--btn-primary-text": COMPANY_CONFIG.btnPrimaryText || "#ffffff",
          "--btn-secondary-bg": COMPANY_CONFIG.btnSecondaryBg || "#0f172a",
          "--btn-secondary-text": COMPANY_CONFIG.btnSecondaryText || "#ffffff",
          "--btn-radius": COMPANY_CONFIG.btnBorderRadius || "8px",
          "--navbar-bg": COMPANY_CONFIG.navbarBg || "#0f172a",
          "--card-bg": COMPANY_CONFIG.cardBg || "#ffffff",
          "--font-heading": `'${COMPANY_CONFIG.headingFont || 'Inter'}', sans-serif`,
          "--font-body": `'${COMPANY_CONFIG.bodyFont || 'Inter'}', sans-serif`,
        } as React.CSSProperties
      }
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="theme-color" content="#2563eb" />
        {/* Safely get location inside ErrorBoundary as well if needed, but since we are in head we just use a safe try-catch wrapper for useLocation if it fails, or simpler: just use generic manifest and let specific routes override with 'links' export. Actually we can just use useLocation here. */}
        {(() => {
          try {
            const loc = useLocation();
            if (loc.pathname.startsWith('/driver')) {
              return <link rel="manifest" href="/manifest-driver.json" />;
            }
          } catch (e) {
            // fallback if useLocation throws
          }
          return <link rel="manifest" href="/manifest.json" />;
        })()}
        <link rel="icon" type="image/svg+xml" href="/icon-192.svg" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <Meta />
        <Links />
        {COMPANY_CONFIG.cms?.customCss && (
          <style dangerouslySetInnerHTML={{ __html: COMPANY_CONFIG.cms.customCss }} />
        )}
        {COMPANY_CONFIG.cms?.scripts?.head && (
          <script dangerouslySetInnerHTML={{ __html: COMPANY_CONFIG.cms.scripts.head }} />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
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
        {COMPANY_CONFIG.cms?.scripts?.footer && (
          <script dangerouslySetInnerHTML={{ __html: COMPANY_CONFIG.cms.scripts.footer }} />
        )}
      </body>
    </html>
  );
}

function useDynamicBrandingSync() {
  useEffect(() => {
    const applyTokens = (branding?: Partial<BrandingConfig>) => {
      if (!branding || typeof document === 'undefined') return;
      const root = document.documentElement;
      if (branding.primaryColor) {
        root.style.setProperty('--color-primary', branding.primaryColor);
        root.style.setProperty('--brand-primary', branding.primaryColor);
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
      if (cached?.branding) {
        applyTokens(cached.branding);
      }
    } catch {}

    const unsub = getAdminConfigService().subscribeToSettings(
      (settings) => {
        if (settings?.branding) {
          applyTokens(settings.branding);
        }
      },
      () => {}
    );

    return unsub;
  }, []);
}

export default function App() {
  useDynamicBrandingSync();
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
        <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center text-3xl">
          {is404 ? '📍' : '⚠️'}
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
