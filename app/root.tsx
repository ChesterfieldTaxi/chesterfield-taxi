import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { COMPANY_CONFIG, DEFAULT_GOOGLE_MAPS_KEY } from "./config/companyConfig";
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

export default function App() {
  return <Outlet />;
}
