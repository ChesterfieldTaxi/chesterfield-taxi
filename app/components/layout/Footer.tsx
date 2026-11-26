import React from 'react';
import { Link } from 'react-router';
import {
  CarIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  ClockIcon,
  ShieldCheckIcon,
} from '../ui/Icons';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { getAdminConfigService } from '../../core/services/config/admin-config.service';
import type { AppSettings, CompanyConfig } from '../../core/types/config';
import { AppearanceToggle } from '../ui/AppearanceToggle';
import { useTheme } from '../../hooks/useTheme';

const QUICK_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Book a Ride', path: '/book' },
  { label: 'Services & Rates', path: '/services' },
  { label: 'Service Areas & Airport Rates', path: '/service-areas' },
  { label: 'About Us', path: '/about' },
  { label: 'Contact Us', path: '/contact' },
  { label: 'Drive With Us', path: '/apply' },
];

const FEATURED_CORRIDOR_LINKS = [
  { label: 'Chesterfield ↔ STL Airport', path: '/service-areas/chesterfield-to-stl-airport' },
  { label: 'Spirit Airport (SUS) FBO', path: '/service-areas/spirit-of-st-louis-airport-sus' },
  { label: 'Clayton ↔ STL Airport', path: '/service-areas/clayton-to-stl-airport' },
  { label: 'Town & Country Car Service', path: '/service-areas/town-and-country-car-service' },
  { label: 'Creve Coeur Executive Taxi', path: '/service-areas/creve-coeur-executive-taxi' },
  { label: 'Wildwood & Ellisville Taxi', path: '/service-areas/wildwood-and-ellisville-taxi' },
  { label: 'Maryland Hts & Westport', path: '/service-areas/maryland-heights-westport-taxi' },
  { label: 'Downtown St. Louis ↔ STL', path: '/service-areas/downtown-st-louis-airport-transfer' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { preference, setPreference } = useTheme({ applyToDom: false });
  const [company, setCompany] = React.useState<CompanyConfig>({
    name: COMPANY_CONFIG.name,
    phone: COMPANY_CONFIG.phone.dispatch,
    email: COMPANY_CONFIG.email.dispatch,
    address: COMPANY_CONFIG.address.formatted,
  });

  React.useEffect(() => {
    try {
      const configService = getAdminConfigService();
      const applySettings = (settings: AppSettings) => {
        if (settings?.company) {
          setCompany(settings.company);
        }
      };
      applySettings(configService.getCachedSettings());
      const unsub =
        typeof configService.subscribeToSettings === 'function'
          ? configService.subscribeToSettings(applySettings)
          : undefined;
      if (typeof configService.getSettings === 'function') {
        configService.getSettings().then(applySettings).catch(() => {});
      }
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    } catch {
      // Ignore errors
    }
  }, []);

  const companyName = company?.name?.trim() || COMPANY_CONFIG.name;
  const phoneDisplay = company?.phone?.trim() || COMPANY_CONFIG.phone.dispatch;
  const phoneRaw =
    (company?.phone || COMPANY_CONFIG.phone.primaryRaw).replace(/[^\d+]/g, '') ||
    COMPANY_CONFIG.phone.primaryRaw;
  const emailDisplay = company?.email?.trim() || COMPANY_CONFIG.email.dispatch;

  return (
    <footer className="bg-surface-header text-slate-300 border-t border-border-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          
          {/* Column 1: Brand & Overview */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <div
                style={{
                  backgroundColor: 'var(--brand-primary, #2563eb)',
                  color: 'var(--btn-primary-text, #ffffff)',
                }}
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
              >
                <CarIcon className="w-6 h-6" />
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-tight text-white block leading-none">
                  {companyName}
                </span>
                <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase leading-none mt-1 block">
                  {COMPANY_CONFIG.tagline}
                </span>
              </div>
            </Link>
            
            <p className="text-sm text-fg-subtle leading-relaxed">
              West St. Louis County&apos;s premier licensed taxi and private transportation service.
              Delivering dependable, upfront-priced rides {COMPANY_CONFIG.operatingHours.toLowerCase()}.
            </p>

            <div className="flex items-center gap-2 text-xs text-blue-400/90 font-medium">
              <ShieldCheckIcon className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Fully Licensed, Insured &amp; Background-Checked</span>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-4">
              Quick Navigation
            </h3>
            <ul className="space-y-2.5 text-sm">
              {QUICK_LINKS.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-fg-subtle hover:text-white transition-colors flex items-center gap-2 group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-surface-header-muted group-hover:bg-blue-400 transition-colors" />
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Service Area Coverage */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-4">
              <Link to="/service-areas" className="hover:text-blue-300 transition-colors">
                Service Areas &amp; Corridors
              </Link>
            </h3>
            <ul className="space-y-2 text-xs text-fg-subtle">
              {FEATURED_CORRIDOR_LINKS.map((corridor) => (
                <li key={corridor.path}>
                  <Link
                    to={corridor.path}
                    className="flex items-center gap-2 hover:text-white transition-colors group"
                  >
                    <MapPinIcon className="w-3.5 h-3.5 text-blue-400/80 group-hover:text-blue-400 shrink-0" />
                    <span>{corridor.label}</span>
                  </Link>
                </li>
              ))}
              <li className="pt-1">
                <Link
                  to="/service-areas"
                  className="text-blue-400 hover:text-blue-300 font-bold transition-colors inline-flex items-center gap-1"
                >
                  <span>View All Service Areas &rarr;</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: 24/7 Dispatch Desk */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-4">
              24/7 Dispatch Desk
            </h3>

            <div className="space-y-3">
              <a
                href={`tel:${phoneRaw}`}
                className="flex items-center gap-3 p-3 bg-surface-header border border-border-header rounded-xl hover:border-blue-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <PhoneIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] text-fg-subtle block">24/7 Dispatch</span>
                  <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                    {phoneDisplay}
                  </span>
                </div>
              </a>

              <a
                href={`mailto:${emailDisplay}`}
                className="flex items-center gap-3 p-3 bg-surface-header border border-border-header rounded-xl hover:border-blue-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] text-fg-subtle block">Support &amp; Accounts</span>
                  <span className="text-xs font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                    {emailDisplay}
                  </span>
                </div>
              </a>
            </div>

            <div className="flex items-center gap-2 text-xs text-fg-on-header-muted pt-1">
              <ClockIcon className="w-4 h-4 text-fg-on-header-muted shrink-0" />
              <span>Available {COMPANY_CONFIG.operatingHours}</span>
            </div>
          </div>

        </div>

        {/* Bottom Sub-footer */}
        <div className="mt-12 pt-8 border-t border-border-header flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-fg-on-header-muted">
          <p>
            &copy; {currentYear} {COMPANY_CONFIG.legalName}. All rights reserved. Registered in Missouri.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <AppearanceToggle
              preference={preference}
              onChange={setPreference}
              variant="selector"
              className="w-52"
            />
            <Link to="/book" className="hover:text-blue-400 transition-colors">
              Book a Ride
            </Link>
            <Link to="/service-areas" className="hover:text-blue-400 transition-colors">
              Service Areas
            </Link>
            <Link to="/services" className="hover:text-blue-400 transition-colors">
              Airport Rates
            </Link>
            <Link to="/contact" className="hover:text-blue-400 transition-colors">
              Support
            </Link>
            <Link to="/terms" className="hover:text-blue-400 transition-colors">
              Terms &amp; Conditions
            </Link>
            <Link to="/privacy" className="hover:text-blue-400 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/track" className="hover:text-blue-400 transition-colors">
              Track Ride
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
