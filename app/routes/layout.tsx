import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Navbar, Footer } from '../components/layout';
import UnderConstruction from '../components/UnderConstruction';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../config/companyConfig';
import type { BrandingConfig } from '../core/types/config';

export default function PublicLayout() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get('preview') === 'true';

  const [constructionMode, setConstructionMode] = useState<boolean>(() => {
    try {
      const cached = getAdminConfigService().getCachedSettings();
      if (cached?.constructionMode !== undefined) {
        return cached.constructionMode;
      }
    } catch {}
    return COMPANY_CONFIG.constructionMode ?? true;
  });

  const [branding, setBranding] = useState<BrandingConfig>({
    primaryColor: COMPANY_CONFIG.primaryColor || '#2563eb',
    secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a',
    headingFont: COMPANY_CONFIG.headingFont || 'Inter',
    bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
    headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
    bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
    mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
    btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#2563eb',
    btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#ffffff',
    btnSecondaryBg: COMPANY_CONFIG.btnSecondaryBg || '#0f172a',
    btnSecondaryText: COMPANY_CONFIG.btnSecondaryText || '#ffffff',
    btnBorderRadius: COMPANY_CONFIG.btnBorderRadius || '8px',
    navbarBg: COMPANY_CONFIG.navbarBg || '#0f172a',
    cardBg: COMPANY_CONFIG.cardBg || '#ffffff',
  });

  useEffect(() => {
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

  if (constructionMode && !isPreview) {
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
    </div>
  );
}
