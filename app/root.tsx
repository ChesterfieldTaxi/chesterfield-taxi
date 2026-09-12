import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { COMPANY_CONFIG } from "./config/companyConfig";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
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
