import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router';
import { CarIcon, PhoneIcon, MenuIcon, XIcon, ShieldCheckIcon } from '../ui/Icons';
import { getAdminConfigService } from '../../core/services/config/admin-config.service';

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
  const location = useLocation();
  const [companySettings, setCompanySettings] = useState(() => {
    try {
      return getAdminConfigService().getCachedSettings().company;
    } catch {
      return {
        name: 'Chesterfield Taxi',
        phone: '(636) 555-TAXI',
        email: 'dispatch@chesterfieldtaxi.com',
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
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl"
            aria-label="Chesterfield Taxi Home"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm group-hover:bg-amber-400 transition-colors">
              <CarIcon className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-slate-950 block leading-none">
                {companySettings.name || 'Chesterfield Taxi'}
              </span>
              <span className="text-[11px] font-bold tracking-wider text-amber-600 uppercase leading-none mt-1 block">
                Professional Car Service
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
                      ? 'bg-amber-500/10 text-amber-700 font-bold border border-amber-500/20'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            {/* Dynamic Admin Console Entry Link */}
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isActive
                    ? 'bg-slate-900 text-amber-400 font-bold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`
              }
              title="Dispatcher & Operator Console"
            >
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              <span>Admin</span>
            </NavLink>
          </nav>

          {/* Desktop Right CTAs */}
          <div className="hidden md:flex items-center gap-3.5">
            {/* Quick Phone Link */}
            <a
              href={`tel:${companySettings.phone.replace(/[^0-9+]/g, '') || '+16365558294'}`}
              className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-950 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-amber-500" />
              <span>{companySettings.phone || '(636) 555-TAXI'}</span>
            </a>

            {/* Prominent Book Now CTA */}
            <Link
              to="/book"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold text-sm px-5 py-2.5 rounded-xl shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              <CarIcon className="w-4 h-4" />
              <span>Book Now</span>
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to="/book"
              className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-xs font-bold px-3 py-2 rounded-xl shadow-xs"
            >
              Book Now
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                      ? 'bg-amber-50 text-amber-900 font-bold border-l-4 border-amber-500 pl-3'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-slate-900 text-amber-400 font-bold'
                    : 'text-slate-500 hover:bg-slate-50'
                }`
              }
            >
              <ShieldCheckIcon className="w-4 h-4 text-amber-500" />
              <span>Operator &amp; Admin Console</span>
            </NavLink>
          </nav>

          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <Link
              to="/book"
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-base py-3 px-4 rounded-xl shadow-sm transition-all"
            >
              <CarIcon className="w-5 h-5" />
              <span>Book Online Now</span>
            </Link>

            <a
              href={`tel:${companySettings.phone.replace(/[^0-9+]/g, '') || '+16365558294'}`}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm py-2.5 px-4 rounded-xl transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-amber-600" />
              <span>Call Dispatch: {companySettings.phone || '(636) 555-TAXI'}</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
