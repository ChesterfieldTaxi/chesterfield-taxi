import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router';
import { Navbar, Footer } from '../components/layout';
import { getAdminConfigService } from '../core/services/config/admin-config.service';

export default function PublicLayout() {
  const [primaryColor, setPrimaryColor] = useState('#f59e0b'); // amber-500
  const [secondaryColor, setSecondaryColor] = useState('#0f172a'); // slate-900

  useEffect(() => {
    const configService = getAdminConfigService();
    if (configService.subscribeToSettings) {
      const unsub = configService.subscribeToSettings((settings) => {
        if (settings.branding?.primaryColor) {
          setPrimaryColor(settings.branding.primaryColor);
        }
        if (settings.branding?.secondaryColor) {
          setSecondaryColor(settings.branding.secondaryColor);
        }
      });
      return unsub;
    } else {
      configService.getSettings().then((settings) => {
        if (settings.branding?.primaryColor) setPrimaryColor(settings.branding.primaryColor);
        if (settings.branding?.secondaryColor) setSecondaryColor(settings.branding.secondaryColor);
      });
    }
  }, []);

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-amber-500 selection:text-slate-950"
      style={{
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
