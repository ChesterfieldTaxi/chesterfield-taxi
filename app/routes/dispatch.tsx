import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Outlet, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { isFirebaseConfigured } from '../core/services/firebase';
import type { AppSettings } from '../core/types/config';
import {
  AdminGeneralTab,
  AdminPricingTab,
  AdminFleetTab,
  AdminBookingsTab,
} from '../components/domain/admin';
import {
  CarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SpinnerIcon,
  ClockIcon,
} from '../components/ui/Icons';
import { Button } from '../components/ui/Button';

export function meta() {
  return [
    { title: 'Dispatch Console – Chesterfield Taxi' },
    { name: 'description', content: 'Operator dispatch and workflow console' },
  ];
}

type TabKey = 'general' | 'pricing' | 'fleet' | 'bookings';

interface TabItem {
  key: TabKey;
  label: string;
  badge?: string;
  description: string;
}

const TABS: TabItem[] = [
  {
    key: 'bookings',
    label: 'Live Bookings',
    badge: 'Real-time',
    description: 'Incoming customer bookings and dispatch workflow management',
  },
];

export default function DispatchLayout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Authentication state
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Dynamic configuration state
  const [settings, setSettings] = useState<AppSettings>(() =>
    getAdminConfigService().getCachedSettings()
  );
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLiveFirebase, setIsLiveFirebase] = useState(false);

  // Active tab derived from query param or default 'bookings'
  const activeTab: TabKey = (searchParams.get('tab') as TabKey) || 'bookings';

  const handleTabChange = (key: TabKey) => {
    setSearchParams({ tab: key });
  };

  // Client-side Firebase Auth Route Guard
  useEffect(() => {
    setIsLiveFirebase(isFirebaseConfigured());
    const authService = getAdminAuthService();

    // Check auth status
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/admin/login?message=unauthenticated', { replace: true });
      } else if (currentUser.role !== 'admin' && currentUser.role !== 'dispatcher') {
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

  const handleSignOut = async () => {
    const authService = getAdminAuthService();
    await authService.signOut();
    navigate('/admin/login', { replace: true });
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

  const currentTabObj = TABS.find((t) => t.key === activeTab) || TABS[0];

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col">
      {/* ─── Top Navigation Bar ─── */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Wordmark & Mode Badge */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <CarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight leading-none text-white">
                  {settings.company.name || 'Chesterfield Taxi'}
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                  Dispatch Console
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Phase 16: Advanced Trip Management
              </span>
            </div>
          </div>

          {/* User actions and public site link */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Sync Mode Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveFirebase ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-300 font-medium">
                {isLiveFirebase ? 'Firestore Connected' : 'Local Storage Mode'}
              </span>
            </div>

            {/* Operator Identifier */}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[180px]">
                {user?.email || 'Dispatcher'}
              </span>
              <span className="text-[10px] text-slate-400">Operator</span>
            </div>

            {/* Link to form layout settings (Admin Only) */}
            {user?.role === 'admin' && (
              <Link
                to="/admin/settings"
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Form Layout ⚙
              </Link>
            )}

            {/* Link to public portal */}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              View Public Site &rarr;
            </a>

            {/* Sign Out Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Main Admin Workspace ─── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Dynamic Tab Selector Bar */}
        <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex items-center justify-center sm:justify-between px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md uppercase tracking-wider hidden sm:inline-block ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 font-extrabold'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Context Banner */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-1">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {currentTabObj.label}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{currentTabObj.description}</p>
          </div>

          <div className="text-[11px] text-slate-400">
            Document: <span className="font-mono text-slate-600">config/appSettings</span>
          </div>
        </div>

        {/* Dynamic Tab Body */}
        <div>
          {activeTab === 'bookings' && <AdminBookingsTab />}
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
