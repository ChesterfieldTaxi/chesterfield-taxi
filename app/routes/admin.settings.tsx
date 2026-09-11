import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import type { AppSettings } from '../core/types/config';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  CarIcon,
  SparklesIcon,
  CheckIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../components/ui/Icons';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: 'Admin Settings & Form Layout – Chesterfield Taxi' },
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
  const [selectedVersion, setSelectedVersion] = useState<'v1' | 'v2'>(
    settings.publicFormVersion || 'v2'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      if (loaded.publicFormVersion) {
        setSelectedVersion(loaded.publicFormVersion);
      }
    });
  }, []);

  const handleSaveLayout = async (version: 'v1' | 'v2') => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveError(null);
      setSelectedVersion(version);

      const configService = getAdminConfigService();
      const updated = await configService.updateSettings({
        publicFormVersion: version,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || 'admin@chesterfieldtaxi.com',
      });

      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update form layout version.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-white">
          <SpinnerIcon className="w-8 h-8 animate-spin text-amber-500" />
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
            <Link to="/admin" className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-xs">
              <CarIcon className="w-5 h-5 text-slate-950" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-tight">
                  {COMPANY_CONFIG.name}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
                  Settings
                </span>
              </div>
              <p className="text-[11px] text-slate-400">System Configuration &amp; Form Versioning</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              ← Back to Dispatch Console
            </Link>
          </div>
        </div>
      </header>

      {/* Main Settings Content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Booking Form Layout Switcher
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Choose which layout version the public customer portal (<code>/book</code>) serves to users.
          </p>
        </div>

        {saveSuccess && (
          <Alert variant="success" title="Layout Updated">
            Public booking form version switched to <strong>Layout {selectedVersion.toUpperCase()}</strong> and synced with Firestore.
          </Alert>
        )}

        {saveError && (
          <Alert variant="error" title="Update Failed">
            {saveError}
          </Alert>
        )}

        {/* Layout Version Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Layout V2 Card */}
          <Card
            variant="elevated"
            className={`border-2 transition-all ${
              selectedVersion === 'v2'
                ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/20 shadow-md'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <CardHeader className="border-b border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2.5 py-1 rounded-md">
                  Layout V2
                </span>
                {selectedVersion === 'v2' ? (
                  <Badge variant="success" size="sm">
                    ● Currently Active
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">Inactive</span>
                )}
              </div>
              <CardTitle className="text-lg text-slate-900 mt-2">
                Streamlined Single-Page UI
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Mockup-based single-page card flow with segmented time picker, flight radar subcard, visual vehicle cards, and emerald Book Ride CTA.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs text-slate-600">
              <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
                <li>Segmented [Now] / [Schedule] pickup control</li>
                <li>Pickup / dropoff card with ✈ Flight Information subcard</li>
                <li>Stepper counters for Passengers and Luggage</li>
                <li>Visual vehicle cards (Sedan, SUV, Minivan)</li>
                <li>Special requests chips &amp; return trip toggle</li>
                <li>Sticky bottom total with green "Book Ride" CTA</li>
              </ul>

              <div className="pt-2">
                <a
                  href="/book?layout=v2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Open Live V2 Preview in New Tab ↗
                </a>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-emerald-600">
                ★ Recommended for Customers
              </span>
              <Button
                type="button"
                variant={selectedVersion === 'v2' ? 'secondary' : 'primary'}
                size="sm"
                isLoading={isSaving && selectedVersion === 'v2'}
                onClick={() => handleSaveLayout('v2')}
                disabled={selectedVersion === 'v2'}
              >
                {selectedVersion === 'v2' ? 'Active in Production' : 'Activate Layout V2'}
              </Button>
            </CardFooter>
          </Card>

          {/* Layout V1 Card */}
          <Card
            variant="elevated"
            className={`border-2 transition-all ${
              selectedVersion === 'v1'
                ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 shadow-md'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <CardHeader className="border-b border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                  Layout V1
                </span>
                {selectedVersion === 'v1' ? (
                  <Badge variant="warning" size="sm">
                    ● Currently Active
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">Inactive</span>
                )}
              </div>
              <CardTitle className="text-lg text-slate-900 mt-2">
                Master Booking Engine
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Phase 15 Master Booking Engine with multi-section role configurations, expandable itinerary fields, and interactive guidance sidebar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs text-slate-600">
              <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
                <li>Config-driven role schema engine (roleFormConfig)</li>
                <li>Comprehensive vehicle tier selector with rate breakdown</li>
                <li>Intermediate stop waypoint routing</li>
                <li>Contextual help &amp; live price calculation panel</li>
                <li>Full customer &amp; dispatcher mode parity</li>
              </ul>

              <div className="pt-2">
                <a
                  href="/book?layout=v1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-amber-600 hover:underline inline-flex items-center gap-1"
                >
                  Open Live V1 Preview in New Tab ↗
                </a>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-slate-500">
                Phase 15 Architecture
              </span>
              <Button
                type="button"
                variant={selectedVersion === 'v1' ? 'secondary' : 'primary'}
                size="sm"
                isLoading={isSaving && selectedVersion === 'v1'}
                onClick={() => handleSaveLayout('v1')}
                disabled={selectedVersion === 'v1'}
              >
                {selectedVersion === 'v1' ? 'Active in Production' : 'Activate Layout V1'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Informational Callout */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-2 text-xs text-slate-600">
          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
            Testing Layouts Without Changing Production
          </h4>
          <p>
            You can test either layout at any time by simply appending <code>?layout=v1</code> or <code>?layout=v2</code> to the public URL (e.g.{' '}
            <a href="/book?layout=v2" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold underline">/book?layout=v2</a> or{' '}
            <a href="/book?layout=v1" target="_blank" rel="noopener noreferrer" className="text-amber-600 font-semibold underline">/book?layout=v1</a>
            ). The query parameter overrides the production setting for that session only.
          </p>
        </div>
      </main>
    </div>
  );
}
