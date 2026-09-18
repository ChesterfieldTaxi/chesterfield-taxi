import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import type { AppSettings } from '../core/types/config';
import { AdminLayoutTab } from '../components/domain/admin/AdminLayoutTab';
import { CarIcon, SpinnerIcon } from '../components/ui/Icons';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: 'Admin Settings & Customer Form – Chesterfield Taxi' },
    { name: 'description', content: 'Manage public booking form layouts and system settings' },
  ];
}

export default function AdminSettingsRoute() {
  const navigate = useNavigate();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [settings, setSettings] = useState<AppSettings>(() =>
    getAdminConfigService().getCachedSettings()
  );
  const [isSaving, setIsSaving] = useState(false);

  // Auth Guard
  useEffect(() => {
    const authService = getAdminAuthService();
    const unsub = authService.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/admin/login', { replace: true });
      } else {
        setUser(currentUser);
        setIsAuthChecking(false);
      }
    });
    return unsub;
  }, [navigate]);

  // Load latest settings
  useEffect(() => {
    const configService = getAdminConfigService();
    configService.getSettings().then((loaded) => {
      setSettings(loaded);
    });
  }, []);

  const handleSaveSettings = async (updates: Partial<AppSettings>) => {
    try {
      setIsSaving(true);
      const configService = getAdminConfigService();
      const updated = await configService.updateSettings({
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || 'admin@chesterfieldtaxi.com',
      });
      setSettings(updated);
    } finally {
      setIsSaving(false);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-white">
          <SpinnerIcon className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium">Verifying administrator authorization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-950 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              style={{
                backgroundColor: 'var(--brand-primary, #2563eb)',
                color: 'var(--btn-primary-text, #ffffff)',
              }}
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs"
            >
              <CarIcon className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-tight">
                  {COMPANY_CONFIG.name}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                  Settings
                </span>
              </div>
              <p className="text-[11px] text-slate-400">System Configuration &amp; Form Features</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                const currentMode = settings.constructionMode !== false;
                const nextVal = !currentMode;
                await handleSaveSettings({ constructionMode: nextVal });
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                settings.constructionMode !== false
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title={
                settings.constructionMode !== false
                  ? 'Maintenance Mode is ON: Public customers see the Under Construction page. Click to turn OFF.'
                  : 'Maintenance Mode is OFF: Public customers see the live booking site. Click to turn ON.'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.constructionMode !== false ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <span className="hidden sm:inline">Maintenance Mode:</span>
              <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                settings.constructionMode !== false ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
              }`}>
                {settings.constructionMode !== false ? 'ON' : 'OFF'}
              </span>
            </button>

            <Link
              to="/admin"
              className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              ← Back to Admin Console
            </Link>
          </div>
        </div>
      </header>

      {/* Main Settings Content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        <AdminLayoutTab
          settings={settings}
          onSave={handleSaveSettings}
          isLoading={isSaving}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} Chesterfield Taxi &bull; Form Configuration &bull; React Router v7
      </footer>
    </div>
  );
}
