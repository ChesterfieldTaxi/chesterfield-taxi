import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router';
import { CarIcon, PhoneIcon, MenuIcon, XIcon, ShieldCheckIcon, UserIcon } from '../ui/Icons';
import { getAdminConfigService } from '../../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../../config/companyConfig';

interface NavItem {
  label: string;
  path: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', end: true },
  { label: 'Services', path: '/services' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const location = useLocation();
  const [companySettings, setCompanySettings] = useState(() => {
    try {
      return getAdminConfigService().getCachedSettings().company;
    } catch {
      return {
        name: COMPANY_CONFIG.name,
        phone: COMPANY_CONFIG.phone.dispatch,
        email: COMPANY_CONFIG.email.dispatch,
      };
    }
  });

  // Keep company settings updated if admin config changes
  useEffect(() => {
    try {
      const configService = getAdminConfigService();
      const unsub = configService.subscribeToSettings((settings) => {
        setCompanySettings(settings.company);
      });
      return unsub;
    } catch {
      // Ignore if server-rendered
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Brand Logo & Wordmark */}
          <Link
            to="/"
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
            aria-label="Chesterfield Taxi Home"
          >
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors"
              style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
            >
              <CarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-slate-950 block leading-none">
                {companySettings.name || COMPANY_CONFIG.name}
              </span>
              <span 
                className="text-[11px] font-bold tracking-wider uppercase leading-none mt-1 block"
                style={{ color: 'var(--brand-primary, #2563eb)' }}
              >
                {COMPANY_CONFIG.tagline}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

          </nav>

          {/* Desktop Right CTAs */}
          <div className="hidden md:flex items-center gap-3">
            {/* Quick Phone Link */}
            <a
              href={`tel:${companySettings.phone ? companySettings.phone.replace(/[^0-9+]/g, '') : COMPANY_CONFIG.phone.primaryRaw}`}
              className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-950 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-blue-600" />
              <span>{companySettings.phone || COMPANY_CONFIG.phone.dispatch}</span>
            </a>

            {/* Sleek Sign In CTA */}
            <Link
              to="/signin"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all shadow-2xs"
              title="Sign in to your account"
            >
              <UserIcon className="w-4 h-4 text-slate-500" />
              <span>Sign In</span>
            </Link>

            {/* Prominent Book Now CTA */}
            <Link
              to="/book"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('reset-booking-form'));
                }
              }}
              style={{
                backgroundColor: 'var(--btn-primary-bg, #2563eb)',
                color: 'var(--btn-primary-text, #ffffff)',
                borderRadius: 'var(--btn-radius, 12px)',
              }}
              className="inline-flex items-center gap-2 font-extrabold text-sm px-5 py-2.5 shadow-sm hover:opacity-90 active:opacity-95 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <CarIcon className="w-4 h-4" />
              <span>Book Now</span>
            </Link>
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to="/signin"
              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <UserIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Sign In</span>
            </Link>

            <Link
              to="/book"
              style={{
                backgroundColor: 'var(--btn-primary-bg, #2563eb)',
                color: 'var(--btn-primary-text, #ffffff)',
                borderRadius: 'var(--btn-radius, 10px)',
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 shadow-xs hover:opacity-90 transition-all"
            >
              Book Now
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <XIcon className="w-6 h-6" />
              ) : (
                <MenuIcon className="w-6 h-6" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer / Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white/98 px-4 pt-3 pb-6 space-y-3 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `px-4 py-3 rounded-xl text-base font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-900 font-bold border-l-4 border-blue-600 pl-3'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <Link
              to="/signin"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-sm py-2.5 px-4 rounded-xl transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              <span>Sign In</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsAppModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-sm py-2.5 px-4 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
              <span>Get App</span>
            </button>

            <Link
              to="/book"
              onClick={() => {
                setMobileMenuOpen(false);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('reset-booking-form'));
                }
              }}
              style={{
                backgroundColor: 'var(--btn-primary-bg, #2563eb)',
                color: 'var(--btn-primary-text, #ffffff)',
                borderRadius: 'var(--btn-radius, 12px)',
              }}
              className="w-full flex items-center justify-center gap-2 font-extrabold text-sm py-2.5 px-4 shadow-sm hover:opacity-90 transition-all"
            >
              <CarIcon className="w-4 h-4" />
              <span>Book Now</span>
            </Link>

            <a
              href={`tel:${companySettings.phone ? companySettings.phone.replace(/[^0-9+]/g, '') : COMPANY_CONFIG.phone.primaryRaw}`}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm py-2.5 px-4 rounded-xl transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-blue-600" />
              <span>Call Dispatch: {companySettings.phone || COMPANY_CONFIG.phone.dispatch}</span>
            </a>
          </div>
        </div>
      )}

    </header>
  );
}
