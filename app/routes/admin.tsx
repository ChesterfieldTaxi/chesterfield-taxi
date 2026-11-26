import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation, Outlet, Link } from 'react-router';
import { useBottomSheetDragToClose } from '../core/hooks/useBottomSheetDragToClose';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { isFirebaseConfigured } from '../core/services/firebase';
import type { AppSettings } from '../core/types/config';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { AdminSidebar } from '../components/domain/admin/navigation/AdminSidebar';
import { HelpTriggerButton } from '../components/domain/common/HelpTriggerButton';
import { AppearanceToggle } from '../components/ui/AppearanceToggle';
import { useTheme } from '../hooks/useTheme';

const HelpDrawer = React.lazy(() =>
  import('../components/domain/common/HelpDrawer').then((m) => ({
    default: m.HelpDrawer,
  }))
);

const AdminDashboardTab = React.lazy(() =>
  import('../components/domain/admin/AdminDashboardTab').then((m) => ({
    default: m.AdminDashboardTab,
  }))
);
const AdminGeneralTab = React.lazy(() =>
  import('../components/domain/admin/AdminGeneralTab').then((m) => ({
    default: m.AdminGeneralTab,
  }))
);
const AdminRatesTab = React.lazy(() =>
  import('../components/domain/admin/AdminRatesTab').then((m) => ({
    default: m.AdminRatesTab,
  }))
);
const AdminVehiclesTab = React.lazy(() =>
  import('../components/domain/admin/AdminVehiclesTab').then((m) => ({
    default: m.AdminVehiclesTab,
  }))
);
const AdminZonesTab = React.lazy(() =>
  import('../components/domain/admin/AdminZonesTab').then((m) => ({
    default: m.AdminZonesTab,
  }))
);
const AdminOperatorsTab = React.lazy(() =>
  import('../components/domain/admin/AdminOperatorsTab').then((m) => ({
    default: m.AdminOperatorsTab,
  }))
);
const AdminAdvancedTab = React.lazy(() =>
  import('../components/domain/admin/AdminAdvancedTab').then((m) => ({
    default: m.AdminAdvancedTab,
  }))
);
const AdminTripsSubpage = React.lazy(() =>
  import('../components/domain/admin/subpages/AdminTripsSubpage').then((m) => ({
    default: m.AdminTripsSubpage,
  }))
);
const AdminInvoicingSubpage = React.lazy(() =>
  import('../components/domain/admin/subpages/AdminInvoicingSubpage').then((m) => ({
    default: m.AdminInvoicingSubpage,
  }))
);
const AdminCustomersSubpage = React.lazy(() =>
  import('../components/domain/admin/subpages/AdminCustomersSubpage').then((m) => ({
    default: m.AdminCustomersSubpage,
  }))
);
const AdminWebsiteTab = React.lazy(() =>
  import('../components/domain/admin/website/AdminWebsiteTab').then((m) => ({
    default: m.AdminWebsiteTab,
  }))
);
const AdminIntegrationsSubpage = React.lazy(() =>
  import('../components/domain/admin/subpages/AdminIntegrationsSubpage').then((m) => ({
    default: m.AdminIntegrationsSubpage,
  }))
);
const AdminRulesTab = React.lazy(() =>
  import('../components/domain/admin/AdminRulesTab').then((m) => ({
    default: m.AdminRulesTab,
  }))
);
import {
  SUB_PAGES as ADMIN_SUB_PAGES,
  resolveAdminTabAndSub,
  type AdminTabKey,
} from '../core/utils/admin-nav.util';
import {
  CarIcon,
  SpinnerIcon,
  BarChartIcon,
  HistoryIcon,
  CreditCardIcon,
  UsersIcon,
  DollarSignIcon,
  MapPinIcon,
  UserCheckIcon,
  SettingsIcon,
  WrenchIcon,
  RadioIcon,
  MenuIcon,
  ExternalLinkIcon,
  PaletteIcon,
  ZapIcon,
  SlidersIcon,
  XIcon,
} from '../components/ui/Icons';

export type { AdminTabKey };

export const SUB_PAGES: Record<string, Array<{ key: string; label: string }>> = {
  ...ADMIN_SUB_PAGES,
  dashboard: [
    { key: 'overview', label: 'Overview' },
    { key: 'analytics', label: 'Analytics & SLA' },
    { key: 'telemetry', label: 'System Health' },
  ],
};

export function meta() {
  return [
    { title: 'Admin Console – Chesterfield Taxi' },
    { name: 'description', content: 'Operator management and configuration console' },
  ];
}

interface TabItem {
  key: AdminTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  description: string;
}

const PRIMARY_TABS: TabItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: BarChartIcon,
    description: 'Summary cards, SLA & revenue analytics, and system health',
  },
  {
    key: 'trips',
    label: 'Trips',
    icon: HistoryIcon,
    description: 'Active dispatch queue, standing orders, rider exceptions, and trip history',
  },
  {
    key: 'automation',
    label: 'Dispatch & Automation',
    icon: RadioIcon,
    description: 'Auto-Pilot lead windows, booking intake rules, conflict guard, and standing defaults',
  },
  {
    key: 'customers',
    label: 'Clients & Corporate',
    icon: UsersIcon,
    description: 'Passenger directory, corporate accounts, and VIP profiles',
  },
  {
    key: 'invoicing',
    label: 'Billing & Payouts',
    icon: CreditCardIcon,
    description: 'Invoices, corporate AR billing, driver & staff payouts, and QuickBooks sync',
  },
  {
    key: 'rates',
    label: 'Rates & Pricing',
    icon: DollarSignIcon,
    description: 'Tariffs, extras, surcharges, pricing rules, and pricing audit log',
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    icon: CarIcon,
    description: 'Vehicle classes and physical company fleet cars',
  },
  {
    key: 'zones',
    label: 'Service Zones',
    icon: MapPinIcon,
    description: 'Service zones, places, zone groups, and exclusions',
  },
  {
    key: 'operators',
    label: 'Drivers & Staff',
    icon: UserCheckIcon,
    description: 'Driver and staff roster, permissions, contact info, and applications',
  },
  {
    key: 'website',
    label: 'Website, Brand & SEO',
    icon: PaletteIcon,
    description: 'Themes & branding studio, booking & /track form, local SEO, pages, and sections',
  },
  {
    key: 'integrations',
    label: 'Comms & Integrations',
    icon: ZapIcon,
    description: 'Payment processors (Stripe & Square), Twilio voice & SMS, and webhooks',
  },
  {
    key: 'general',
    label: 'General',
    icon: SettingsIcon,
    description: 'Company info, operating hours, time format, units, and regional defaults',
  },
  {
    key: 'advanced',
    label: 'System & Governance',
    icon: WrenchIcon,
    description: 'Access & roles, activity log, universal archive, and system maintenance',
  },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  // Authentication state (initialize `isAuthChecking = true` so SSR & initial client hydration match)
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const { preference: themePreference, setPreference: setThemePreference } = useTheme({
    uid: user?.uid,
    profilePreference: user?.themePreference,
  });

  // Dynamic configuration state
  const [settings, setSettings] = useState<AppSettings>(() =>
    getAdminConfigService().getCachedSettings()
  );
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLiveFirebase, setIsLiveFirebase] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSystemMenuOpen, setIsSystemMenuOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [hasOpenedHelp, setHasOpenedHelp] = useState(false);
  const handleOpenHelp = useCallback(() => {
    setHasOpenedHelp(true);
    setIsHelpOpen(true);
  }, []);
  const systemMenuRef = useRef<HTMLDivElement>(null);
  const dismissSystemMenu = useCallback(() => setIsSystemMenuOpen(false), []);
  const systemSheetDrag = useBottomSheetDragToClose({ onClose: dismissSystemMenu });

  useEffect(() => {
    if (!isSystemMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (systemMenuRef.current && !systemMenuRef.current.contains(e.target as Node)) {
        setIsSystemMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSystemMenuOpen]);

  // Active tab & sub-page derived deterministically via resolveAdminTabAndSub
  const searchParams = new URLSearchParams(location.search);
  const resolvedRoute = resolveAdminTabAndSub(
    searchParams.get('tab'),
    searchParams.get('sub'),
    searchParams.get('entity')
  );
  const normalizedTab: AdminTabKey = resolvedRoute.tab;
  const effectiveSub = resolvedRoute.sub;
  const resolvedArchiveEntity = resolvedRoute.archiveEntity || 'all';

  const handleTabChange = (key: AdminTabKey, sub?: string) => {
    const resolved = resolveAdminTabAndSub(key, sub);
    const params: Record<string, string> = { tab: resolved.tab, sub: resolved.sub };
    if (resolved.archiveEntity && resolved.archiveEntity !== 'all') {
      params.entity = resolved.archiveEntity;
    }
    setSearchParams(params);
  };

  // Client-side Firebase Auth Route Guard
  useEffect(() => {
    setIsLiveFirebase(isFirebaseConfigured());
    const authService = getAdminAuthService();

    // Check auth status
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/app/login?message=unauthenticated&redirect=/app/admin', { replace: true });
      } else if (currentUser.roles && !currentUser.roles.includes('admin') && currentUser.role !== 'admin') {
        navigate('/app/login?message=unauthorized', { replace: true });
      } else {
        setUser(currentUser);
        setIsAuthChecking(false);
      }
    });

    return unsubscribe;
  }, [navigate]);

  // Subscribe to real-time configuration updates from Firestore config/appSettings
  useEffect(() => {
    const configService = getAdminConfigService();
    setIsConfigLoading(true);

    const unsubscribe = configService.subscribeToSettings(
      (updatedSettings) => {
        setSettings(updatedSettings);
        setIsConfigLoading(false);
      },
      (err) => {
        console.warn('[Admin] Config subscription warning:', err);
        setIsConfigLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const handleSaveSettings = async (updates: Partial<AppSettings>) => {
    setIsSavingConfig(true);
    try {
      const configService = getAdminConfigService();
      const newSettings = await configService.updateSettings(updates);
      setSettings(newSettings);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
        localStorage.removeItem('chesterfield_taxi_admin_session');
      } catch {}
    }
    try {
      getAdminAuthService().signOut().catch(() => {});
    } catch {}
    window.location.href = '/app/login?message=logged_out';
  };

  // Render auth loading screen while validating credentials
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-surface-header flex flex-col items-center justify-center text-white p-4">
        <div
          style={{
            backgroundColor: 'var(--brand-primary, #2563eb)',
            color: 'var(--btn-primary-text, #ffffff)',
          }}
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
        >
          <CarIcon className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2 text-sm text-fg-subtle">
          <SpinnerIcon className="w-4 h-4 animate-spin text-blue-500" />
          <span>Verifying administrator credentials...</span>
        </div>
      </div>
    );
  }

  const currentTabObj =
    PRIMARY_TABS.find((t) => t.key === normalizedTab) || PRIMARY_TABS[0];
  const activeSubList = SUB_PAGES[normalizedTab] || [];

  return (
    <div
      className="min-h-screen bg-surface-subtle text-fg-primary flex flex-row antialiased"
      style={
        {
          "--color-primary": settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || "#2563eb",
          "--color-secondary": settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--brand-primary": settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || "#2563eb",
          "--brand-secondary": settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--color-heading": settings.branding?.headingColor || COMPANY_CONFIG.headingColor || "#0f172a",
          "--color-text-main": settings.branding?.bodyTextColor || COMPANY_CONFIG.bodyTextColor || "#334155",
          "--color-text-muted": settings.branding?.mutedTextColor || COMPANY_CONFIG.mutedTextColor || "#64748b",
          "--btn-primary-bg": settings.branding?.btnPrimaryBg || COMPANY_CONFIG.btnPrimaryBg || "#2563eb",
          "--btn-primary-text": settings.branding?.btnPrimaryText || COMPANY_CONFIG.btnPrimaryText || "#ffffff",
          "--btn-secondary-bg": settings.branding?.btnSecondaryBg || COMPANY_CONFIG.btnSecondaryBg || "#0f172a",
          "--btn-secondary-text": settings.branding?.btnSecondaryText || COMPANY_CONFIG.btnSecondaryText || "#ffffff",
          "--btn-radius": settings.branding?.btnBorderRadius || COMPANY_CONFIG.btnBorderRadius || "12px",
          "--navbar-bg": settings.branding?.navbarBg || COMPANY_CONFIG.navbarBg || "#0f172a",
          "--card-bg": settings.branding?.cardBg || COMPANY_CONFIG.cardBg || "#ffffff",
          "--font-heading": `'${settings.branding?.headingFont || COMPANY_CONFIG.headingFont || "Lexend"}', 'Inter', sans-serif`,
          "--font-body": `'${settings.branding?.bodyFont || COMPANY_CONFIG.bodyFont || "Inter"}', sans-serif`,
        } as React.CSSProperties
      }
    >
      {/* ─── Persistent Left Sidebar ─── */}
      <AdminSidebar
        currentTab={normalizedTab}
        onSelectTab={handleTabChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        settings={settings}
        user={user}
        onSignOut={handleSignOut}
        isLiveFirebase={isLiveFirebase}
      />

      {/* ─── Main Admin Workspace Canvas ─── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Clean Executive Top Header + Underline Sub-Navigation */}
        <header className="sticky top-0 z-30 bg-surface-card/95 backdrop-blur-md border-b border-border-subtle/90">
          <div className="px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Mobile Toggle + Page Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-1.5 rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-surface-muted transition-colors shrink-0 cursor-pointer"
                title="Open Navigation Menu"
                aria-label="Open Navigation Menu"
              >
                <MenuIcon className="w-5 h-5" />
              </button>

              <h1 className="text-base sm:text-lg font-extrabold text-fg-primary tracking-tight truncate">
                {currentTabObj.label}
              </h1>

              {settings.constructionMode !== false && (
                <button
                  type="button"
                  onClick={() => setIsSystemMenuOpen(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-status-warning-bg border border-status-warning-border text-status-warning-fg text-[11px] font-bold hover:bg-status-warning-bg-strong transition-colors cursor-pointer shrink-0"
                  title="Maintenance Mode is active — click to manage"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Maintenance ON</span>
                </button>
              )}
            </div>

            {/* Right: Primary Dispatch CTA, Live Site Link, System Controls Popover */}
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/app/dispatch"
                reloadDocument
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
                title="Launch Live 3-Pane Dispatch Console"
              >
                <RadioIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Launch Dispatch</span>
              </Link>

              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-fg-secondary hover:text-fg-primary font-semibold px-2.5 py-1.5 rounded-xl bg-surface-muted hover:bg-surface-emphasis/80 transition-colors flex items-center gap-1.5"
                title="Open live customer website"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                <span className="hidden md:inline">Live Site</span>
              </a>

              <AppearanceToggle
                variant="cycle"
                preference={themePreference}
                onChange={setThemePreference}
              />

              <HelpTriggerButton
                onClick={handleOpenHelp}
                isOpen={isHelpOpen}
              />

              {/* Compact System Controls Popover (Maintenance, Get App, Cloud Sync) */}
              <div className="relative" ref={systemMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSystemMenuOpen((prev) => !prev)}
                  className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isSystemMenuOpen
                      ? 'bg-surface-header text-white border-slate-900'
                      : 'bg-surface-card text-fg-secondary hover:text-fg-primary border-border-subtle hover:bg-surface-subtle'
                  }`}
                  title="Site Availability & System Status"
                  aria-label="Site Availability & System Status"
                >
                  <SlidersIcon className="w-4 h-4" />
                  <span
                    className={`w-2 h-2 rounded-full ${
                      settings.constructionMode !== false
                        ? 'bg-amber-500'
                        : isLiveFirebase
                        ? 'bg-emerald-500'
                        : 'bg-fg-subtle'
                    }`}
                  />
                </button>

                {isSystemMenuOpen && (
                  <>
                    {/* Desktop Popover */}
                    <div className="hidden sm:block absolute right-0 mt-2 w-72 bg-surface-card rounded-2xl border border-border-subtle shadow-xl p-3 space-y-2.5 z-50">
                      <div className="flex items-center justify-between px-1 pb-2 border-b border-border-faint">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                          Site Controls
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-secondary">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isLiveFirebase ? 'bg-emerald-500' : 'bg-amber-400'
                            }`}
                          />
                          {isLiveFirebase ? 'Cloud Synced' : 'Local Storage'}
                        </span>
                      </div>

                      {/* Maintenance Mode Toggle */}
                      <button
                        type="button"
                        onClick={async () => {
                          const currentMode = settings.constructionMode !== false;
                          await handleSaveSettings({
                            constructionMode: !currentMode,
                            updatedAt: new Date().toISOString(),
                          });
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-subtle hover:bg-surface-muted border border-border-subtle/80 text-left transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold text-fg-primary">Maintenance Mode</div>
                          <div className="text-[11px] text-fg-muted">
                            {settings.constructionMode !== false
                              ? 'Showing Under Construction page'
                              : 'Public site live for booking'}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                            settings.constructionMode !== false
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-status-success-bg-strong text-status-success-fg'
                          }`}
                        >
                          {settings.constructionMode !== false ? 'ON' : 'OFF'}
                        </span>
                      </button>

                      {/* Get App Buttons Toggle */}
                      <button
                        type="button"
                        onClick={async () => {
                          const currentEnabled = settings.enableGetAppButtons === true;
                          await handleSaveSettings({
                            enableGetAppButtons: !currentEnabled,
                            updatedAt: new Date().toISOString(),
                          });
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-subtle hover:bg-surface-muted border border-border-subtle/80 text-left transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold text-fg-primary">&ldquo;Get App&rdquo; Buttons</div>
                          <div className="text-[11px] text-fg-muted">
                            {settings.enableGetAppButtons === true
                              ? 'Visible in public header'
                              : 'Hidden sitewide'}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                            settings.enableGetAppButtons === true
                              ? 'bg-blue-600 text-white'
                              : 'bg-surface-emphasis text-fg-secondary'
                          }`}
                        >
                          {settings.enableGetAppButtons === true ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </div>

                    {/* Mobile Drag-Down-to-Close Site Controls Sheet */}
                    <div
                      className="sm:hidden fixed inset-0 z-[110] bg-surface-overlay/45 flex items-end"
                      onClick={dismissSystemMenu}
                    >
                      <div
                        style={systemSheetDrag.sheetStyle}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-surface-card rounded-t-3xl border-t border-border-subtle shadow-2xl overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200"
                      >
                        <div
                          {...systemSheetDrag.dragHandlers}
                          className="px-4 pt-2.5 pb-3 border-b border-border-faint touch-none"
                        >
                          <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto mb-2.5" aria-hidden="true" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-extrabold text-fg-primary">Site Controls</span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-secondary bg-surface-muted px-2 py-0.5 rounded-full">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isLiveFirebase ? 'bg-emerald-500' : 'bg-amber-400'
                                  }`}
                                />
                                {isLiveFirebase ? 'Cloud Synced' : 'Local'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={dismissSystemMenu}
                              className="p-1.5 rounded-xl text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted cursor-pointer"
                              aria-label="Close site controls"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="p-4 space-y-2.5">
                          <div className="p-3 rounded-2xl bg-surface-subtle border border-border-subtle/80 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-fg-primary">Appearance</span>
                              <span className="text-[11px] font-semibold text-fg-muted capitalize">
                                {themePreference}
                              </span>
                            </div>
                            <AppearanceToggle
                              variant="selector"
                              preference={themePreference}
                              onChange={setThemePreference}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={async () => {
                              const currentMode = settings.constructionMode !== false;
                              await handleSaveSettings({
                                constructionMode: !currentMode,
                                updatedAt: new Date().toISOString(),
                              });
                            }}
                            className="w-full flex items-center justify-between p-3 rounded-2xl bg-surface-subtle active:bg-surface-muted border border-border-subtle/80 text-left cursor-pointer"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="text-xs font-extrabold text-fg-primary">Maintenance Mode</div>
                              <div className="text-[11px] text-fg-muted mt-0.5">
                                {settings.constructionMode !== false
                                  ? 'Showing Under Construction page'
                                  : 'Public site live for booking'}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg shrink-0 ${
                                settings.constructionMode !== false
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-status-success-bg-strong text-status-success-fg'
                              }`}
                            >
                              {settings.constructionMode !== false ? 'ON' : 'OFF'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              const currentEnabled = settings.enableGetAppButtons === true;
                              await handleSaveSettings({
                                enableGetAppButtons: !currentEnabled,
                                updatedAt: new Date().toISOString(),
                              });
                            }}
                            className="w-full flex items-center justify-between p-3 rounded-2xl bg-surface-subtle active:bg-surface-muted border border-border-subtle/80 text-left cursor-pointer"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="text-xs font-extrabold text-fg-primary">&ldquo;Get App&rdquo; Buttons</div>
                              <div className="text-[11px] text-fg-muted mt-0.5">
                                {settings.enableGetAppButtons === true
                                  ? 'Visible in public header'
                                  : 'Hidden sitewide'}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg shrink-0 ${
                                settings.enableGetAppButtons === true
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-surface-emphasis text-fg-secondary'
                              }`}
                            >
                              {settings.enableGetAppButtons === true ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Clean Underline Sub-Navigation Bar */}
          {activeSubList.length > 0 && (
            <div className="px-3 sm:px-6 lg:px-8 border-t border-border-faint overflow-x-auto no-scrollbar flex items-center gap-4 sm:gap-5 shrink-0">
              {activeSubList.map((sub) => {
                const isActive = effectiveSub === sub.key;
                return (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() => handleTabChange(normalizedTab, sub.key)}
                    className={`py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                      isActive
                        ? 'border-blue-600 text-blue-600 font-bold'
                        : 'border-transparent text-fg-muted hover:text-fg-primary hover:border-border-strong'
                    }`}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {/* ─── Main Admin Workspace Content ─── */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-3.5 sm:py-6 pb-24 lg:pb-6 space-y-4 sm:space-y-6">
          {/* Dynamic Tab Body */}
          <div className="pt-1">
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-fg-muted">
                  <SpinnerIcon className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs font-semibold tracking-wide">Loading module...</span>
                </div>
              }
            >
            {normalizedTab === 'dashboard' && (
              <AdminDashboardTab
                settings={settings}
                onNavigateTab={(tab) => handleTabChange(tab as AdminTabKey)}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'trips' && (
              <AdminTripsSubpage initialSubTab={effectiveSub as any} />
            )}

            {normalizedTab === 'automation' && (
              <AdminRulesTab initialSection={effectiveSub as any} />
            )}

            {normalizedTab === 'invoicing' && (
              <AdminInvoicingSubpage
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'integrations' && (
              <AdminIntegrationsSubpage
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'customers' && (
              <AdminCustomersSubpage
                settings={settings}
                onSave={handleSaveSettings}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'rates' && (
              <AdminRatesTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'vehicles' && (
              <AdminVehiclesTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'zones' && <AdminZonesTab initialSubTab={effectiveSub as any} />}

            {normalizedTab === 'operators' && (
              <AdminOperatorsTab initialSubTab={effectiveSub as any} settings={settings} />
            )}

            {normalizedTab === 'advanced' && (
              <AdminAdvancedTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
                archiveEntity={resolvedArchiveEntity}
              />
            )}

            {/* Website, Brand & SEO Studio */}
            {normalizedTab === 'website' && (
              <AdminWebsiteTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub}
              />
            )}

            {/* General Settings (Company Info & Units) */}
            {normalizedTab === 'general' && (
              <AdminGeneralTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
                uid={user?.uid}
              />
            )}
            </Suspense>
          </div>

          {/* Outlet for any nested routes */}
          <Outlet />
        </main>

        {/* ─── Mobile Bottom Quick-Navigation Bar (< lg) ─── */}
        <nav
          aria-label="Admin Mobile Navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-card/95 backdrop-blur-md border-t border-border-subtle/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] flex items-center justify-around"
        >
          {(
            [
              { key: 'dashboard' as AdminTabKey, label: 'Overview', Icon: BarChartIcon },
              { key: 'trips' as AdminTabKey, label: 'Trips', Icon: HistoryIcon },
              { key: 'rates' as AdminTabKey, label: 'Rates', Icon: DollarSignIcon },
              { key: 'customers' as AdminTabKey, label: 'Clients', Icon: UsersIcon },
            ] as const
          ).map(({ key, label, Icon }) => {
            const isActive = normalizedTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleTabChange(key)}
                className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'text-blue-600 font-extrabold'
                    : 'text-fg-muted hover:text-fg-strong font-medium'
                }`}
              >
                <div className={`px-3 py-1 rounded-full transition-colors ${isActive ? 'bg-status-info-bg text-blue-600' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight leading-none">{label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className={`flex-1 py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
              !['dashboard', 'trips', 'rates', 'customers'].includes(normalizedTab)
                ? 'text-blue-600 font-extrabold'
                : 'text-fg-muted hover:text-fg-strong font-medium'
            }`}
          >
            <div
              className={`px-3 py-1 rounded-full transition-colors ${
                !['dashboard', 'trips', 'rates', 'customers'].includes(normalizedTab)
                  ? 'bg-status-info-bg text-blue-600'
                  : ''
              }`}
            >
              <MenuIcon className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight leading-none">More</span>
          </button>
        </nav>
      </div>

      {hasOpenedHelp && (
        <Suspense fallback={null}>
          <HelpDrawer
            isOpen={isHelpOpen}
            onClose={() => setIsHelpOpen(false)}
            role="admin"
            context={{
              portal: 'admin',
              tab: normalizedTab,
              sub: effectiveSub,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
