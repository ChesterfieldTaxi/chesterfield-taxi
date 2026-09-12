import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router';
import { Navbar, Footer } from '../components/layout';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../config/companyConfig';

export default function PublicLayout() {
  const [primaryColor, setPrimaryColor] = useState(COMPANY_CONFIG.primaryColor || '#f59e0b');
  const [secondaryColor, setSecondaryColor] = useState(COMPANY_CONFIG.secondaryColor || '#0f172a');

  useEffect(() => {
    const applyColors = (prim: string, sec: string) => {
      setPrimaryColor(prim);
      setSecondaryColor(sec);
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--color-primary', prim);
        document.documentElement.style.setProperty('--color-secondary', sec);
        document.documentElement.style.setProperty('--brand-primary', prim);
        document.documentElement.style.setProperty('--brand-secondary', sec);
      }
    };

    const configService = getAdminConfigService();
    if (configService.subscribeToSettings) {
      const unsub = configService.subscribeToSettings((settings) => {
        const prim = settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || '#f59e0b';
        const sec = settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || '#0f172a';
        applyColors(prim, sec);
      });
      return unsub;
    } else {
      configService.getSettings().then((settings) => {
        const prim = settings.branding?.primaryColor || COMPANY_CONFIG.primaryColor || '#f59e0b';
        const sec = settings.branding?.secondaryColor || COMPANY_CONFIG.secondaryColor || '#0f172a';
        applyColors(prim, sec);
      });
    }
  }, []);

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-amber-500 selection:text-slate-950"
      style={{
        '--color-primary': primaryColor,
        '--color-secondary': secondaryColor,
        '--brand-primary': primaryColor,
        '--brand-secondary': secondaryColor,
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
