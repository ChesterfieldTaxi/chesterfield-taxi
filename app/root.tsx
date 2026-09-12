import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
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
          "--color-primary": COMPANY_CONFIG.primaryColor || "#f59e0b",
          "--color-secondary": COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--brand-primary": COMPANY_CONFIG.primaryColor || "#f59e0b",
          "--brand-secondary": COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--color-heading": COMPANY_CONFIG.headingColor || "#0f172a",
          "--color-text-main": COMPANY_CONFIG.bodyTextColor || "#334155",
          "--color-text-muted": COMPANY_CONFIG.mutedTextColor || "#64748b",
          "--btn-primary-bg": COMPANY_CONFIG.btnPrimaryBg || "#f59e0b",
          "--btn-primary-text": COMPANY_CONFIG.btnPrimaryText || "#020617",
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
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
