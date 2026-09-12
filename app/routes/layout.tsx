import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router';
import { Navbar, Footer } from '../components/layout';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../config/companyConfig';
import type { BrandingConfig } from '../core/types/config';

export default function PublicLayout() {
  const [branding, setBranding] = useState<BrandingConfig>({
    primaryColor: COMPANY_CONFIG.primaryColor || '#f59e0b',
    secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a',
    headingFont: COMPANY_CONFIG.headingFont || 'Inter',
    bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
    headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
    bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
    mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
    btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#f59e0b',
    btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#020617',
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
    } catch {}

    if (configService.subscribeToSettings) {
      const unsub = configService.subscribeToSettings((settings) => {
        if (settings?.branding) {
          setBranding((prev) => ({ ...prev, ...settings.branding }));
        }
      });
      return unsub;
    }
  }, []);

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-amber-500 selection:text-slate-950"
      style={{
        '--color-primary': branding.primaryColor,
        '--color-secondary': branding.secondaryColor,
        '--brand-primary': branding.primaryColor,
        '--brand-secondary': branding.secondaryColor,
        '--color-heading': branding.headingColor || '#0f172a',
        '--color-text-main': branding.bodyTextColor || '#334155',
        '--color-text-muted': branding.mutedTextColor || '#64748b',
        '--btn-primary-bg': branding.btnPrimaryBg || '#f59e0b',
        '--btn-primary-text': branding.btnPrimaryText || '#020617',
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
