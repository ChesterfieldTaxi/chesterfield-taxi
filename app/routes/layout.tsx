import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Navbar, Footer } from '../components/layout';
import UnderConstruction from '../components/UnderConstruction';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { isLocalhostDevHost } from '../core/utils/security-sanitizer.util';
import type { BrandingConfig } from '../core/types/config';

export { isLocalhostDevHost };

export default function PublicLayout() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const previewParam = searchParams.get('preview') === 'true';
  const [isStaffUser, setIsStaffUser] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    const unsub = getAdminAuthService().onAuthStateChanged((user) => {
      setIsStaffUser(Boolean(user && (user.role === 'admin' || user.role === 'dispatcher')));
    });
    return unsub;
  }, []);

  const isPreview = previewParam && isStaffUser;

  const [constructionMode, setConstructionMode] = useState<boolean>(
    COMPANY_CONFIG.constructionMode ?? false
  );

  const [branding, setBranding] = useState<BrandingConfig>({
    primaryColor: COMPANY_CONFIG.primaryColor || '#2563eb',
    secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a',
    headingFont: COMPANY_CONFIG.headingFont || 'Lexend',
    bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
    headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
    bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
    mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
    btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#2563eb',
    btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#ffffff',
    btnSecondaryBg: COMPANY_CONFIG.btnSecondaryBg || '#0f172a',
    btnSecondaryText: COMPANY_CONFIG.btnSecondaryText || '#ffffff',
    btnBorderRadius: COMPANY_CONFIG.btnBorderRadius || '12px',
    navbarBg: COMPANY_CONFIG.navbarBg || '#0f172a',
    cardBg: COMPANY_CONFIG.cardBg || '#ffffff',
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLocalhost(isLocalhostDevHost(window.location.hostname));
    }
    const configService = getAdminConfigService();
    try {
      const cached = configService.getCachedSettings();
      if (cached?.branding) {
        setBranding((prev) => ({ ...prev, ...cached.branding }));
      }
      if (cached?.constructionMode !== undefined) {
        setConstructionMode(cached.constructionMode);
      }
    } catch {}

    if (configService.subscribeToSettings) {
      const unsub = configService.subscribeToSettings((settings) => {
        if (settings?.branding) {
          setBranding((prev) => ({ ...prev, ...settings.branding }));
        }
        if (settings?.constructionMode !== undefined) {
          setConstructionMode(settings.constructionMode);
        }
      });
      return unsub;
    }
  }, []);

  if (constructionMode && !isPreview && !isLocalhost) {
    return <UnderConstruction />;
  }

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white"
      style={{
        '--color-primary': branding.primaryColor,
        '--color-secondary': branding.secondaryColor,
        '--brand-primary': branding.primaryColor,
        '--brand-secondary': branding.secondaryColor,
        '--color-heading': branding.headingColor || '#0f172a',
        '--color-text-main': branding.bodyTextColor || '#334155',
        '--color-text-muted': branding.mutedTextColor || '#64748b',
        '--btn-primary-bg': branding.btnPrimaryBg || '#2563eb',
        '--btn-primary-text': branding.btnPrimaryText || '#ffffff',
        '--btn-secondary-bg': branding.btnSecondaryBg || '#0f172a',
        '--btn-secondary-text': branding.btnSecondaryText || '#ffffff',
        '--btn-radius': branding.btnBorderRadius || '8px',
        '--navbar-bg': branding.navbarBg || '#0f172a',
        '--card-bg': branding.cardBg || '#ffffff',
        '--font-heading': `'${branding.headingFont || 'Inter'}', sans-serif`,
        '--font-body': `'${branding.bodyFont || 'Inter'}', sans-serif`,
      } as React.CSSProperties}
    >
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <Footer />
      {constructionMode && isLocalhost && (
        <div
          role="status"
          className="fixed bottom-3 right-3 z-50 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/95 text-amber-200 border border-amber-500/60 shadow-lg text-[11px] font-bold backdrop-blur-xs pointer-events-none print:hidden"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span>Live Site: Maintenance ON</span>
        </div>
      )}
    </div>
  );
}
