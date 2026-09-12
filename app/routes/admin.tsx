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
  AdminBookingsTab,
  AdminLayoutTab,
} from '../components/domain/admin';
import { UserDropdown } from '../components/domain/common/UserDropdown';
import {
  CarIcon,
  SpinnerIcon,
} from '../components/ui/Icons';

export function meta() {
  return [
    { title: 'Admin Console – Chesterfield Taxi' },
    { name: 'description', content: 'Operator management and configuration console' },
  ];
}

export type AdminTabKey =
  | 'dashboard'
  | 'general'
  | 'rates'
  | 'vehicles'
  | 'zones'
  | 'operators'
  | 'advanced'
  // Legacy tab aliases
  | 'pricing'
  | 'fleet'
  | 'staff'
  | 'bookings'
  | 'layout';

interface TabItem {
  key: AdminTabKey;
  label: string;
  badge?: string;
  description: string;
}

const PRIMARY_TABS: TabItem[] = [
  {
    key: 'dashboard',
    label: '📊 Dashboard',
    description: 'KPI summary cards, revenue charts, active trip volume, and unassigned booking alerts',
  },
  {
    key: 'general',
    label: '🏢 General',
    description: 'Company details, localization, 24/7 operating hours, and branding settings preview',
  },
  {
    key: 'rates',
    label: '💵 Rates',
    description: 'Base pricing rules, real-time fare simulator, named pricing rules, and distance tier tables',
  },
  {
    key: 'vehicles',
    label: '🚗 Vehicles',
    description: 'Dual-section management: Vehicle service classes & physical motorized fleet asset inventory',
  },
  {
    key: 'zones',
    label: '📍 Zones',
    description: 'Geofence map manager for drawing and saving named polygon and radius surcharge zones',
  },
  {
    key: 'operators',
    label: '👥 Operators',
    description: 'Integrated staff and driver roster table with role management (RBAC), contact info, and status',
  },
  {
    key: 'advanced',
    label: '⚙️ Advanced',
    description: 'Sensitive system configurations, API key controls, Firestore rule parameters, and audit logging',
  },
];

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

  // Active tab derived reactively from location.search with legacy aliasing
  const searchParams = new URLSearchParams(location.search);
  const rawTab = (searchParams.get('tab') as AdminTabKey) || 'dashboard';

  // Normalize legacy tab query parameters
  let normalizedTab: AdminTabKey = rawTab;
  let subSection: 'types' | 'fleet' | undefined = undefined;

  if (rawTab === 'pricing') {
    normalizedTab = 'rates';
  } else if (rawTab === 'fleet') {
    normalizedTab = 'vehicles';
    subSection = 'fleet';
  } else if (rawTab === 'staff') {
    normalizedTab = 'operators';
  }

  const subParam = searchParams.get('sub');
  if (subParam === 'fleet' || subParam === 'types') {
    subSection = subParam;
  }

  const handleTabChange = (key: AdminTabKey, sub?: 'types' | 'fleet') => {
    const params: Record<string, string> = { tab: key };
    if (sub) {
      params.sub = sub;
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
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 mb-4 shadow-lg">
          <CarIcon className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <SpinnerIcon className="w-4 h-4 animate-spin text-amber-500" />
          <span>Verifying administrator credentials...</span>
        </div>
      </div>
    );
  }

  const currentTabObj =
    PRIMARY_TABS.find((t) => t.key === normalizedTab) || PRIMARY_TABS[0];

  return (
    <div
      className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col"
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
      {/* ─── Top Navigation Bar ─── */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Wordmark & Mode Badge */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
              <CarIcon className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-extrabold tracking-tight leading-none text-white">
                {settings.company.name || 'Chesterfield Taxi'}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 uppercase tracking-wider">
                Admin
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveFirebase ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                title={isLiveFirebase ? 'Firestore Connected' : 'Local Storage Mode'}
              />
            </div>
          </div>

          {/* User actions, Prominent Dispatch Button, and public site link */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Prominent Header CTA: The Single Primary Entry Point to /dispatch */}
            <Link
              to="/dispatch"
              reloadDocument
              className="text-xs sm:text-sm text-slate-950 font-black px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 shadow-md hover:shadow-lg border border-amber-300 transition-all flex items-center gap-2 transform active:scale-95"
              title="Launch Live 3-Pane Dispatch Console"
            >
              <span className="text-base">🚕</span>
              <span>Launch Dispatch Console</span>
            </Link>

            {/* Link to public portal */}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex text-xs text-amber-400 hover:text-amber-300 font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              Public Site &rarr;
            </a>

            {/* Unified User Dropdown across all admin pages */}
            <UserDropdown
              email={user?.email}
              onSignOut={handleSignOut}
              variant="dark"
            />
          </div>
        </div>
      </header>

      {/* ─── Main Admin Workspace ─── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dynamic 7-Tab Navigation Selector Bar */}
        <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {PRIMARY_TABS.map((tab) => {
              const isActive = normalizedTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all text-center ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Tab Body */}
        <div>
          {normalizedTab === 'dashboard' && (
            <AdminDashboardTab
              settings={settings}
              onNavigateTab={(tab) => handleTabChange(tab as AdminTabKey)}
            />
          )}

          {normalizedTab === 'general' && (
            <AdminGeneralTab
              settings={settings}
              onSave={handleSaveSettings}
              isLoading={isSavingConfig || isConfigLoading}
            />
          )}

          {normalizedTab === 'rates' && (
            <AdminRatesTab
              settings={settings}
              onSave={handleSaveSettings}
              isLoading={isSavingConfig || isConfigLoading}
            />
          )}

          {normalizedTab === 'vehicles' && (
            <AdminVehiclesTab
              settings={settings}
              onSave={handleSaveSettings}
              isLoading={isSavingConfig || isConfigLoading}
              initialSubTab={subSection || 'types'}
            />
          )}

          {normalizedTab === 'zones' && <AdminZonesTab />}

          {normalizedTab === 'operators' && <AdminOperatorsTab />}

          {normalizedTab === 'advanced' && (
            <AdminAdvancedTab
              settings={settings}
              onSave={handleSaveSettings}
              isLoading={isSavingConfig || isConfigLoading}
            />
          )}

          {/* Legacy Backward Compatibility Fallbacks */}
          {normalizedTab === 'bookings' && <AdminBookingsTab />}

          {normalizedTab === 'layout' && (
            <AdminLayoutTab
              settings={settings}
              onSave={handleSaveSettings}
              isLoading={isSavingConfig}
            />
          )}
        </div>

        {/* Outlet for any nested routes */}
        <Outlet />
      </main>

      {/* Admin Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} Chesterfield Taxi &bull; Admin &amp; Dispatch Portal
          </div>
          <div className="flex items-center gap-4">
            <span>React Router v7 Framework Mode</span>
            <span>&bull;</span>
            <span>Firebase Firestore Sync</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
