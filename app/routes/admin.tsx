import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation, Outlet, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { isFirebaseConfigured } from '../core/services/firebase';
import type { AppSettings } from '../core/types/config';
import { COMPANY_CONFIG } from '../config/companyConfig';
import {
  AdminDashboardTab,
  AdminGeneralTab,
  AdminRatesTab,
  AdminVehiclesTab,
  AdminZonesTab,
  AdminOperatorsTab,
  AdminAdvancedTab,
  AdminTripsSubpage,
  AdminInvoicingSubpage,
  AdminCustomersSubpage,
  AdminWebsiteTab,
  AdminArchiveTab,
} from '../components/domain/admin';
import { AdminIntegrationsSubpage } from '../components/domain/admin/subpages/AdminIntegrationsSubpage';
import { AdminRulesTab } from '../components/domain/admin/AdminRulesTab';
import { AdminSidebar } from '../components/domain/admin/navigation/AdminSidebar';
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
  RadioIcon,
  MenuIcon,
  ExternalLinkIcon,
  ArchiveBoxIcon,
  PaletteIcon,
  ZapIcon,
  SlidersIcon,
} from '../components/ui/Icons';

export function meta() {
  return [
    { title: 'Admin Console – Chesterfield Taxi' },
    { name: 'description', content: 'Operator management and configuration console' },
  ];
}

export type AdminTabKey =
  | 'dashboard'
  | 'trips'
  | 'invoicing'
  | 'financials'
  | 'integrations'
  | 'customers'
  | 'rates'
  | 'vehicles'
  | 'zones'
  | 'operators'
  | 'archive'
  | 'advanced'
  // Legacy tab aliases
  | 'general'
  | 'form'
  | 'pricing'
  | 'fleet'
  | 'staff'
  | 'bookings'
  | 'layout'
  | 'website';

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
    description: 'KPI summary cards, revenue charts, system telemetry, and analytics',
  },
  {
    key: 'trips',
    label: 'Trips & Rules',
    icon: HistoryIcon,
    description: 'Active dispatch queue, booking rules engine, searchable trip archive, CSV export, and exceptions',
  },
  {
    key: 'invoicing',
    label: 'Financials & Invoicing',
    icon: CreditCardIcon,
    description: 'Double-entry general ledger, B2B corporate billing, statements, and QuickBooks/GL sync',
  },
  {
    key: 'integrations',
    label: 'Integrations & APIs',
    icon: ZapIcon,
    description: 'Payment processors (Stripe & Square), Twilio voice & SMS gateway, and system webhooks',
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: UsersIcon,
    description: 'Searchable passenger directory, corporate accounts, and VIP statuses',
  },
  {
    key: 'rates',
    label: 'Rates & Tariffs',
    icon: DollarSignIcon,
    description: 'Base pricing rules, real-time fare simulator, named pricing rules, and distance tier tables',
  },
  {
    key: 'vehicles',
    label: 'Fleet & Vehicles',
    icon: CarIcon,
    description: 'Vehicle service classes & physical motorized fleet asset inventory',
  },
  {
    key: 'zones',
    label: 'Service Zones',
    icon: MapPinIcon,
    description: 'Geofence map manager for drawing and saving named polygon and radius surcharge zones',
  },
  {
    key: 'operators',
    label: 'Drivers & Staff',
    icon: UserCheckIcon,
    description: 'Integrated staff and driver roster table with role management (RBAC), contact info, and status',
  },
  {
    key: 'archive',
    label: 'Archive Vault',
    icon: ArchiveBoxIcon,
    description: 'Enterprise data retention vault and 1-click restoration engine across all platform entities',
  },
  {
    key: 'website',
    label: 'Website Studio',
    icon: PaletteIcon,
    description: 'Visual pages directory, booking form controls, navigation, and SEO',
  },
  {
    key: 'general',
    label: 'General & Branding',
    icon: SettingsIcon,
    description: 'Dynamic branding studio, company profile, and regional localization',
  },
  {
    key: 'advanced',
    label: 'Advanced Settings',
    icon: SettingsIcon,
    description: 'Security permissions, audit trails, and system operations',
  },
];

export const SUB_PAGES: Record<string, Array<{ key: string; label: string }>> = {
  dashboard: [
    { key: 'overview', label: 'Overview' },
    { key: 'telemetry', label: 'Telemetry' },
    { key: 'analytics', label: 'Analytics' },
  ],
  trips: [
    { key: 'dispatch', label: 'Active Queue' },
    { key: 'history', label: 'Trip History' },
    { key: 'rules', label: 'Booking Rules Engine' },
    { key: 'archive', label: 'Archived Trips' },
    { key: 'exceptions', label: 'Exceptions' },
  ],
  invoicing: [
    { key: 'ledger', label: 'Invoices & Ledger' },
    { key: 'accounts', label: 'Corporate Accounts' },
    { key: 'accounting-sync', label: 'QuickBooks & GL Sync' },
  ],
  financials: [
    { key: 'ledger', label: 'Invoices & Ledger' },
    { key: 'accounts', label: 'Corporate Accounts' },
    { key: 'accounting-sync', label: 'QuickBooks & GL Sync' },
  ],
  integrations: [
    { key: 'gateways', label: 'Payment Gateways' },
    { key: 'telephony', label: 'Twilio & Telephony' },
    { key: 'webhooks', label: 'Webhooks & APIs' },
  ],
  customers: [
    { key: 'directory', label: 'Directory' },
    { key: 'corporate', label: 'Corporate' },
  ],
  rates: [
    { key: 'rates', label: 'Tariffs & Rates' },
    { key: 'extras', label: 'Extras & Services' },
    { key: 'surcharges', label: 'Surcharges' },
    { key: 'rules', label: 'Rules & Routing' },
  ],
  vehicles: [
    { key: 'types', label: 'Service Classes' },
    { key: 'fleet', label: 'Fleet Inventory' },
  ],
  zones: [
    { key: 'zones', label: 'Operational Geofences & Polygons' },
    { key: 'places', label: 'Special Places & Landmarks' },
    { key: 'groups', label: 'Zone Groups' },
    { key: 'blacklists', label: 'Exclusion Zones' },
  ],
  operators: [
    { key: 'roster', label: 'Roster' },
    { key: 'onboarding', label: 'Onboarding Queue' },
  ],
  general: [
    { key: 'studio', label: 'Branding Studio' },
    { key: 'profile', label: 'Business Profile' },
  ],
  website: [
    { key: 'pages', label: 'Pages' },
    { key: 'themes', label: 'Themes & Livery' },
    { key: 'form', label: 'Form Controls' },
    { key: 'layout', label: 'Section Canvas' },
    { key: 'navigation', label: 'Header & Footer' },
    { key: 'seo', label: 'SEO & Analytics' },
    { key: 'css', label: 'Custom CSS' },
  ],
  advanced: [
    { key: 'security', label: 'Security & Access' },
    { key: 'audit', label: 'Audit Trail' },
    { key: 'system', label: 'System Ops' },
  ],
  archive: [
    { key: 'all', label: 'All Records' },
    { key: 'trips', label: 'Trips' },
    { key: 'customers', label: 'Passengers' },
    { key: 'operators', label: 'Staff & Drivers' },
    { key: 'vehicles', label: 'Fleet & Types' },
    { key: 'zones', label: 'Zones & Corridors' },
    { key: 'tariffs', label: 'Unified Tariffs' },
  ],
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  // Authentication state
  const [user, setUser] = useState<AdminUser | null>(() => getAdminAuthService().getCurrentUser());
  const [isAuthChecking, setIsAuthChecking] = useState(() => !getAdminAuthService().getCurrentUser());

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
  const systemMenuRef = useRef<HTMLDivElement>(null);

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

  // Active tab derived reactively from location.search with legacy aliasing
  const searchParams = new URLSearchParams(location.search);
  const rawTab = (searchParams.get('tab') as AdminTabKey) || 'dashboard';

  // Normalize legacy tab query parameters
  let normalizedTab: AdminTabKey = rawTab;
  let activeSubParam = searchParams.get('sub') || undefined;

  if (rawTab === 'financials') {
    normalizedTab = 'invoicing';
  } else if (rawTab === 'pricing') {
    normalizedTab = 'rates';
  } else if (rawTab === 'fleet') {
    normalizedTab = 'vehicles';
    activeSubParam = 'fleet';
  } else if (rawTab === 'staff') {
    normalizedTab = 'operators';
  } else if (rawTab === 'bookings') {
    normalizedTab = 'trips';
  } else if (rawTab === 'form' || rawTab === 'layout' || rawTab === 'website') {
    normalizedTab = 'website';
    activeSubParam = undefined;
  }

  if (normalizedTab === 'advanced' && (activeSubParam === 'website' || activeSubParam === 'form' || activeSubParam === 'customer-form')) {
    normalizedTab = 'website';
    activeSubParam = undefined;
  }

  // Current subpages for the active tab (safely handle empty arrays)
  const currentSubList = SUB_PAGES[normalizedTab];
  const effectiveSub =
    activeSubParam || (currentSubList && currentSubList.length > 0 ? currentSubList[0].key : undefined);

  const handleTabChange = (key: AdminTabKey, sub?: string) => {
    const params: Record<string, string> = { tab: key };
    const subList = SUB_PAGES[key];
    if (sub) {
      params.sub = sub;
    } else if (subList && subList.length > 0) {
      params.sub = subList[0].key;
    }
    setSearchParams(params);
  };

  const handleSubChange = (subKey: string) => {
    setSearchParams({ tab: normalizedTab, sub: subKey });
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <div
          style={{
            backgroundColor: 'var(--brand-primary, #2563eb)',
            color: 'var(--btn-primary-text, #ffffff)',
          }}
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
        >
          <CarIcon className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
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
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-row antialiased"
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
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90">
          <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
            {/* Left: Mobile Toggle + Page Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                title="Open Navigation Menu"
                aria-label="Open Navigation Menu"
              >
                <MenuIcon className="w-5 h-5" />
              </button>

              <h1 className="text-base sm:text-lg font-extrabold text-slate-950 tracking-tight truncate">
                {currentTabObj.label}
              </h1>

              {settings.constructionMode !== false && (
                <button
                  type="button"
                  onClick={() => setIsSystemMenuOpen(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
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
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 transition-colors flex items-center gap-1.5"
                title="Open live customer website"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="hidden md:inline">Live Site</span>
              </a>

              {/* Compact System Controls Popover (Maintenance, Get App, Cloud Sync) */}
              <div className="relative" ref={systemMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSystemMenuOpen((prev) => !prev)}
                  className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isSystemMenuOpen
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-50'
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
                        : 'bg-slate-400'
                    }`}
                  />
                </button>

                {isSystemMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 space-y-2.5 z-50">
                    <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Site Controls
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
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
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-left transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-slate-900">Maintenance Mode</div>
                        <div className="text-[11px] text-slate-500">
                          {settings.constructionMode !== false
                            ? 'Showing Under Construction page'
                            : 'Public site live for booking'}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                          settings.constructionMode !== false
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-emerald-100 text-emerald-800'
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
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-left transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-slate-900">&ldquo;Get App&rdquo; Buttons</div>
                        <div className="text-[11px] text-slate-500">
                          {settings.enableGetAppButtons === true
                            ? 'Visible in public header'
                            : 'Hidden sitewide'}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                          settings.enableGetAppButtons === true
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {settings.enableGetAppButtons === true ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Clean Underline Sub-Navigation Bar */}
          {activeSubList.length > 0 && (
            <div className="px-4 sm:px-6 lg:px-8 border-t border-slate-100 overflow-x-auto no-scrollbar flex items-center gap-5 shrink-0">
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
                        : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
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
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Dynamic Tab Body */}
          <div className="pt-1">
            {normalizedTab === 'dashboard' && (
              <AdminDashboardTab
                settings={settings}
                onNavigateTab={(tab) => handleTabChange(tab as AdminTabKey)}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'trips' && effectiveSub === 'rules' && (
              <AdminRulesTab />
            )}

            {normalizedTab === 'trips' && effectiveSub !== 'rules' && (
              <AdminTripsSubpage initialSubTab={effectiveSub as any} />
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

            {normalizedTab === 'operators' && <AdminOperatorsTab initialSubTab={effectiveSub as any} />}

            {normalizedTab === 'advanced' && (
              <AdminAdvancedTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {/* Website Studio (Top-Level CMS) */}
            {normalizedTab === 'website' && (
              <AdminWebsiteTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub}
              />
            )}

            {/* General Settings */}
            {normalizedTab === 'general' && (
              <AdminGeneralTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {normalizedTab === 'archive' && (
              <AdminArchiveTab initialSubTab={effectiveSub as any} />
            )}
          </div>

          {/* Outlet for any nested routes */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
