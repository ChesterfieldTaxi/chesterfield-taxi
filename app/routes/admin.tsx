import React, { useState, useEffect } from 'react';
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
  AdminBookingsTab,
  AdminLayoutTab,
} from '../components/domain/admin';
import { AdminSidebar } from '../components/domain/admin/navigation/AdminSidebar';
import { UserDropdown } from '../components/domain/common/UserDropdown';
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
  | 'customers'
  | 'rates'
  | 'vehicles'
  | 'zones'
  | 'operators'
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
    label: 'Trips',
    icon: HistoryIcon,
    description: 'Active dispatch queue, searchable trip archive, CSV export, and exceptions',
  },
  {
    key: 'invoicing',
    label: 'Invoicing',
    icon: CreditCardIcon,
    description: 'Billing ledger, corporate accounts, and payment gateway options',
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: UsersIcon,
    description: 'Searchable passenger directory, corporate accounts, and VIP statuses',
  },
  {
    key: 'rates',
    label: 'Rates',
    icon: DollarSignIcon,
    description: 'Base pricing rules, real-time fare simulator, named pricing rules, and distance tier tables',
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    icon: CarIcon,
    description: 'Vehicle service classes & physical motorized fleet asset inventory',
  },
  {
    key: 'zones',
    label: 'Zones',
    icon: MapPinIcon,
    description: 'Geofence map manager for drawing and saving named polygon and radius surcharge zones',
  },
  {
    key: 'operators',
    label: 'Operators',
    icon: UserCheckIcon,
    description: 'Integrated staff and driver roster table with role management (RBAC), contact info, and status',
  },
  {
    key: 'general',
    label: 'General',
    icon: SettingsIcon,
    description: 'Dynamic branding studio, company profile, and regional localization',
  },
  {
    key: 'advanced',
    label: 'Advanced Settings',
    icon: SettingsIcon,
    description: 'Visual website studio, security permissions, audit trails, and maintenance',
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
    { key: 'exceptions', label: 'Exceptions' },
  ],
  invoicing: [
    { key: 'ledger', label: 'Invoices' },
    { key: 'accounts', label: 'Corporate Accounts' },
    { key: 'gateways', label: 'Payment Gateways' },
  ],
  customers: [
    { key: 'directory', label: 'Directory' },
    { key: 'corporate', label: 'Corporate' },
  ],
  rates: [
    { key: 'tariffs', label: 'Unified Tariffs' },
    { key: 'base', label: 'Standard Rates' },
    { key: 'named_rules', label: 'Surge Rules' },
    { key: 'step_increments', label: 'Distance Tiers' },
    { key: 'condition_surcharges', label: 'Surcharges' },
  ],
  vehicles: [
    { key: 'types', label: 'Service Classes' },
    { key: 'fleet', label: 'Fleet Inventory' },
  ],
  zones: [],
  operators: [],
  general: [
    { key: 'branding', label: 'Branding Studio' },
    { key: 'company', label: 'Business Profile' },
  ],
  advanced: [
    { key: 'website', label: 'Website Studio' },
    { key: 'security', label: 'Security & Access' },
    { key: 'audit', label: 'Audit Trail' },
    { key: 'system', label: 'System Ops' },
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

  // Active tab derived reactively from location.search with legacy aliasing
  const searchParams = new URLSearchParams(location.search);
  const rawTab = (searchParams.get('tab') as AdminTabKey) || 'dashboard';

  // Normalize legacy tab query parameters
  let normalizedTab: AdminTabKey = rawTab;
  let activeSubParam = searchParams.get('sub') || undefined;

  if (rawTab === 'pricing') {
    normalizedTab = 'rates';
  } else if (rawTab === 'fleet') {
    normalizedTab = 'vehicles';
    activeSubParam = 'fleet';
  } else if (rawTab === 'staff') {
    normalizedTab = 'operators';
  } else if (rawTab === 'bookings') {
    normalizedTab = 'trips';
  } else if (rawTab === 'form' || rawTab === 'layout' || rawTab === 'website') {
    normalizedTab = 'advanced';
    activeSubParam = 'website';
  }

  if (normalizedTab === 'advanced' && (activeSubParam === 'form' || activeSubParam === 'customer-form')) {
    activeSubParam = 'website';
  }

  // Current subpages for the active tab
  const currentSubList = SUB_PAGES[normalizedTab];
  const effectiveSub = activeSubParam || (currentSubList ? currentSubList[0].key : undefined);

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
        navigate('/admin/login?message=unauthenticated', { replace: true });
      } else if (currentUser.role !== 'admin') {
        navigate('/admin/login?message=unauthorized', { replace: true });
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
    window.location.href = '/admin/login?message=logged_out';
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
      className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-row antialiased"
      style={
        {
          "--color-primary": settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || "#f59e0b",
          "--color-secondary": settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--brand-primary": settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || "#f59e0b",
          "--brand-secondary": settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || "#0f172a",
          "--color-heading": settings.branding?.headingColor || COMPANY_CONFIG.headingColor || "#0f172a",
          "--color-text-main": settings.branding?.bodyTextColor || COMPANY_CONFIG.bodyTextColor || "#334155",
          "--color-text-muted": settings.branding?.mutedTextColor || COMPANY_CONFIG.mutedTextColor || "#64748b",
          "--btn-primary-bg": settings.branding?.btnPrimaryBg || COMPANY_CONFIG.btnPrimaryBg || "#f59e0b",
          "--btn-primary-text": settings.branding?.btnPrimaryText || COMPANY_CONFIG.btnPrimaryText || "#020617",
          "--btn-secondary-bg": settings.branding?.btnSecondaryBg || COMPANY_CONFIG.btnSecondaryBg || "#0f172a",
          "--btn-secondary-text": settings.branding?.btnSecondaryText || COMPANY_CONFIG.btnSecondaryText || "#ffffff",
          "--btn-radius": settings.branding?.btnBorderRadius || COMPANY_CONFIG.btnBorderRadius || "8px",
          "--navbar-bg": settings.branding?.navbarBg || COMPANY_CONFIG.navbarBg || "#0f172a",
          "--card-bg": settings.branding?.cardBg || COMPANY_CONFIG.cardBg || "#ffffff",
          "--font-heading": `'${settings.branding?.headingFont || COMPANY_CONFIG.headingFont || "Inter"}', sans-serif`,
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
        {/* Top Control Header with Section Title, Sub-Tab Menu & Actions */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
          <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            {/* Left: Mobile Toggle, Active Section Title, and Sub-Tab Navigation Bar */}
            <div className="flex items-center gap-3.5 min-w-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                title="Open Navigation Menu"
              >
                <MenuIcon className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
                  {currentTabObj.label}
                </span>
              </div>

              {/* Top Sub-Tab Navigation Bar */}
              {activeSubList.length > 0 && (
                <>
                  <div className="h-5 w-px bg-slate-200 shrink-0 hidden sm:block" />
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {activeSubList.map((sub) => {
                      const isActive = effectiveSub === sub.key;
                      return (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => handleTabChange(normalizedTab, sub.key)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer select-none ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Right: Quick Launch Dispatch, Public Link, Status Badge */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              <Link
                to="/dispatch"
                reloadDocument
                style={{
                  backgroundColor: 'var(--brand-primary, #2563eb)',
                  color: 'var(--btn-primary-text, #ffffff)',
                }}
                className="hidden sm:inline-flex text-xs font-black px-3.5 py-2 rounded-xl shadow-xs hover:opacity-95 transition-all items-center gap-2"
                title="Launch Live 3-Pane Dispatch Console"
              >
                <RadioIcon className="w-3.5 h-3.5 animate-pulse" />
                <span>Launch Dispatch</span>
              </Link>

              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-600 hover:text-slate-900 font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
              >
                <span>Live Site</span>
                <ExternalLinkIcon className="w-3.5 h-3.5 text-slate-400" />
              </a>

              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-[11px] font-bold text-slate-600">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLiveFirebase ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-amber-400'
                  }`}
                />
                <span>{isLiveFirebase ? 'Cloud Synced' : 'Local Storage'}</span>
              </div>
            </div>
          </div>
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

            {normalizedTab === 'trips' && (
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

            {normalizedTab === 'customers' && (
              <AdminCustomersSubpage
                settings={settings}
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

            {normalizedTab === 'zones' && <AdminZonesTab />}

            {normalizedTab === 'operators' && <AdminOperatorsTab />}

            {normalizedTab === 'advanced' && (
              <AdminAdvancedTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab={effectiveSub as any}
              />
            )}

            {/* Legacy Backward Compatibility Fallbacks */}
            {normalizedTab === 'general' && (
              <AdminGeneralTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
              />
            )}

            {(normalizedTab === 'form' || normalizedTab === 'layout') && (
              <AdminAdvancedTab
                settings={settings}
                onSave={handleSaveSettings}
                isLoading={isSavingConfig || isConfigLoading}
                initialSubTab="website"
              />
            )}

            {normalizedTab === 'bookings' && (
              <AdminTripsSubpage initialSubTab="dispatch" />
            )}
          </div>

          {/* Outlet for any nested routes */}
          <Outlet />
        </main>

        {/* Admin Footer */}
        <footer className="border-t border-slate-200 bg-white py-5 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              &copy; {new Date().getFullYear()} {settings.company?.name || COMPANY_CONFIG.name} &bull; Admin &amp; Dispatch Console
            </div>
            <div className="flex items-center gap-3">
              <span>React Router v7 Framework Mode</span>
              <span>&bull;</span>
              <span>Firebase Firestore Sync</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
