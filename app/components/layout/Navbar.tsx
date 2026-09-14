import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router';
import { CarIcon, PhoneIcon, MenuIcon, XIcon, ShieldCheckIcon, UserIcon } from '../ui/Icons';
import { getAdminConfigService } from '../../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { UserDropdown } from '../domain/common/UserDropdown';

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

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
    import('../../core/services/auth/admin-auth.service').then(({ getAdminAuthService }) => {
      const authService = getAdminAuthService();
      setCurrentUser(authService.getCurrentUser());
      
      const unsubscribe = authService.onAuthStateChanged((user) => {
        setCurrentUser(user);
      });
      
      return () => unsubscribe();
    }).catch(console.error);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
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

            {/* Get App CTA */}
            <button
              type="button"
              onClick={() => setIsAppModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
              <span>Get App</span>
            </button>

            {/* User Dropdown / Sign In CTA */}
            {currentUser ? (
              <div className="w-48">
                <UserDropdown
                  email={currentUser.email}
                  onSignOut={() => {
                    import('../../core/services/auth/admin-auth.service').then(({ getAdminAuthService }) => {
                      getAdminAuthService().signOut();
                    });
                  }}
                  variant="light"
                />
              </div>
            ) : (
              <Link
                to="/signin"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all shadow-2xs"
                title="Sign in to your account"
              >
                <UserIcon className="w-4 h-4 text-slate-500" />
                <span>Sign In</span>
              </Link>
            )}

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
            {currentUser ? (
              <div className="w-full">
                <UserDropdown
                  email={currentUser.email}
                  onSignOut={() => {
                    import('../../core/services/auth/admin-auth.service').then(({ getAdminAuthService }) => {
                      getAdminAuthService().signOut();
                    });
                  }}
                  variant="light"
                />
              </div>
            ) : (
              <Link
                to="/signin"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-sm py-2.5 px-4 rounded-xl transition-colors"
              >
                <UserIcon className="w-4 h-4" />
                <span>Sign In</span>
              </Link>
            )}

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

      {/* App Download Modal */}
      {isAppModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                Download the App
              </h3>
              <button onClick={() => setIsAppModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="text-center space-y-2">
                <p className="text-sm text-slate-600 font-medium">Get the Chesterfield Taxi Passenger App for faster bookings, live tracking, and digital receipts.</p>
              </div>
              
              <div className="flex justify-center">
                <div className="w-40 h-40 bg-white border-2 border-slate-100 shadow-sm rounded-xl flex items-center justify-center">
                  <svg className="w-32 h-32 text-slate-800" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-5 0h3v2h-3v-2zm3 3h5v2h-5v-2zm-3 3h3v2h-3v-2zm3 3h3v2h-3v-2zm-3 0h2v2h-2v-2z" /></svg>
                </div>
              </div>
              <p className="text-xs text-center text-slate-500 uppercase font-bold tracking-wider">Scan to Install</p>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <button className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors group cursor-not-allowed opacity-70">
                  <svg className="w-6 h-6 mb-1 text-slate-700 group-hover:text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.14 1.36-.59 2.53-1.34 3.32-.72.77-2.06 1.45-3 1.34-.14-1.37.51-2.43 1.4-3.16"/></svg>
                  <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">iOS App Store</span>
                </button>
                <button className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors group cursor-not-allowed opacity-70">
                  <svg className="w-6 h-6 mb-1 text-slate-700 group-hover:text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12 3.84 21.85C3.34 21.61 3 21.09 3 20.5zm11.41-9.21l3.12 3.12-11.83 6.83L14.41 11.29zm.79-1.29l5.05-5.05c.42-.42.42-1.09 0-1.51l-1.41-1.41L15.2 10zM5.7 3.76l11.83 6.83-3.12 3.12L5.7 3.76z"/></svg>
                  <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">Google Play</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
