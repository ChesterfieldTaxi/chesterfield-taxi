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

const QUICK_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Book a Ride', path: '/book' },
  { label: 'Services Overview', path: '/services' },
  { label: 'About Us', path: '/about' },
  { label: 'Contact & Support', path: '/contact' },
  { label: 'Admin Console', path: '/admin' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          
          {/* Column 1: Brand & Overview */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-sm">
                <CarIcon className="w-6 h-6" />
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-tight text-white block leading-none">
                  {COMPANY_CONFIG.name}
                </span>
                <span className="text-[10px] font-bold tracking-widest text-amber-400 uppercase leading-none mt-1 block">
                  {COMPANY_CONFIG.tagline}
                </span>
              </div>
            </Link>
            
            <p className="text-sm text-slate-400 leading-relaxed">
              West St. Louis County&apos;s premier licensed taxi and private transportation service.
              Delivering dependable, upfront-priced rides {COMPANY_CONFIG.operatingHours.toLowerCase()}.
            </p>

            <div className="flex items-center gap-2 text-xs text-amber-400/90 font-medium">
              <ShieldCheckIcon className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Fully Licensed, Insured &amp; Background-Checked</span>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4">
              Quick Navigation
            </h3>
            <ul className="space-y-2.5 text-sm">
              {QUICK_LINKS.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-amber-400 transition-colors" />
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Service Area Coverage */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4">
              Service Areas
            </h3>
            <ul className="space-y-2 text-xs text-slate-400">
              {COMPANY_CONFIG.serviceAreas.map((area) => (
                <li key={area} className="flex items-center gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: 24/7 Dispatch Contact */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4">
              24/7 Dispatch Desk
            </h3>

            <div className="space-y-3">
              <a
                href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-amber-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                  <PhoneIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Instant Phone Dispatch</span>
                  <span className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                    {COMPANY_CONFIG.phone.dispatch}
                  </span>
                </div>
              </a>

              <a
                href={`mailto:${COMPANY_CONFIG.email.dispatch}`}
                className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-amber-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Support &amp; Accounts</span>
                  <span className="text-xs font-medium text-white truncate group-hover:text-amber-400 transition-colors">
                    {COMPANY_CONFIG.email.dispatch}
                  </span>
                </div>
              </a>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
              <ClockIcon className="w-4 h-4 text-slate-600 shrink-0" />
              <span>Available {COMPANY_CONFIG.operatingHours}</span>
            </div>
          </div>

        </div>

        {/* Bottom Sub-footer */}
        <div className="mt-12 pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            &copy; {currentYear} {COMPANY_CONFIG.legalName}. All rights reserved. Registered in Missouri.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/book" className="hover:text-amber-400 transition-colors">
              Online Booking
            </Link>
            <Link to="/services" className="hover:text-amber-400 transition-colors">
              Airport Rates
            </Link>
            <Link to="/contact" className="hover:text-amber-400 transition-colors">
              Support
            </Link>
            <Link to="/admin" className="hover:text-amber-400 transition-colors">
              Staff Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
