import React from 'react';
import { Link } from 'react-router';
import {
  PlaneIcon,
  BuildingIcon,
  SparklesIcon,
  ClockIcon,
  CarIcon,
  CheckIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
} from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import type { AppSettings, CompanyConfig, VehicleTierConfig } from '../core/types/config';

export function meta() {
  return [
    { title: `Services & Rates – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content:
        `Comprehensive transportation services including Lambert STL airport transfers, corporate accounts, hourly charters, and executive taxi service in ${COMPANY_CONFIG.name}, MO.`,
    },
  ];
}

function getVehicleIcon(iconType?: string, id?: string) {
  const type = (iconType || id || '').toLowerCase();
  if (type.includes('suv') || type.includes('xl') || type.includes('luxury')) {
    return <SparklesIcon className="w-6 h-6 text-blue-600" />;
  }
  return <CarIcon className="w-6 h-6 text-fg-primary" />;
}

interface ServiceItem {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ReactNode;
  description: string;
  features: string[];
  recommendedVehicle: string;
  estimatedPricing: string;
}

const SERVICES: ServiceItem[] = [
  {
    id: 'airport-transfers',
    title: 'Airport Transfers (STL & SUS)',
    subtitle: 'Lambert-St. Louis International & Spirit of St. Louis Airport',
    badge: 'High Frequency',
    icon: <PlaneIcon className="w-6 h-6 text-blue-600" />,
    description:
      'Eliminate the stress of airport parking and unreliable rideshare surges. We provide guaranteed curb-to-curb departures and scheduled arrivals with live flight number tracking.',
    features: [
      'Automated flight arrival tracking (delays monitored automatically)',
      'We wait as long as it takes when your flight is delayed (exceptions handled individually)',
      'Curbside pickup or inside terminal baggage claim meet-and-greet',
      'Generous luggage capacity with executive SUV options',
    ],
    recommendedVehicle: 'Standard Sedan or Executive SUV',
    estimatedPricing: 'Flat rates from $45-$65 from West County to STL',
  },
  {
    id: 'corporate-accounts',
    title: 'Corporate Accounts',
    subtitle: 'Simple monthly billing and priority rides for local businesses',
    badge: 'Business',
    icon: <BuildingIcon className="w-6 h-6 text-blue-600" />,
    description:
      'Built for offices, law firms, hotels, and medical clinics throughout Chesterfield Valley and Maryville Centre. Set up consolidated monthly invoicing for your team and guests.',
    features: [
      'Monthly itemized invoices and trip summaries',
      'Priority dispatch during morning and evening rush hours',
      'Clean, non-smoking sedans and spacious SUVs',
      'PO number and authorized rider support',
    ],
    recommendedVehicle: 'Standard Sedan or SUV',
    estimatedPricing: 'Monthly invoicing & custom business rates',
  },
  {
    id: 'special-events',
    title: 'Special Events & Group Rides',
    subtitle: 'Dependable group rides for weddings, dinners, and game days',
    badge: 'Group & Events',
    icon: <SparklesIcon className="w-6 h-6 text-blue-600" />,
    description:
      'Get everyone there and back comfortably. We coordinate pickups and dropoffs for weddings, dinners, concerts, and games at Enterprise Center or Busch Stadium.',
    features: [
      'Multi-car coordination for families and event guests',
      'No surge pricing after concerts or late-night games',
      'On-time pickup schedules matched to your plans',
      'Plenty of room for bags, strollers, and gear',
    ],
    recommendedVehicle: 'SUV or Multiple Vehicles',
    estimatedPricing: 'Upfront flat or custom group rates',
  },
  {
    id: 'hourly-charters',
    title: 'Hourly Charter Service',
    subtitle: 'Dedicated driver on standby for multi-stop schedules',
    badge: 'Flexible',
    icon: <ClockIcon className="w-6 h-6 text-blue-600" />,
    description:
      'Need a car waiting between meetings, medical appointments, errands, or local outings? Book by the hour and keep the same driver with you from stop to stop.',
    features: [
      'Car and driver stay on standby throughout your booking',
      'As many stops as you need within your booked hours',
      'Great for back-to-back meetings or appointments',
      'Easy schedule adjustments if plans run long',
    ],
    recommendedVehicle: 'SUV or Sedan',
    estimatedPricing: 'Hourly rates starting at $75/hr (2-hr minimum)',
  },
];


const SERVICE_ZONES = [
  {
    city: 'Chesterfield ↔ STL Airport',
    zip: '63005, 63017',
    note: 'Primary Hub & 24/7 Airport Transfers',
    slug: 'chesterfield-to-stl-airport',
  },
  {
    city: 'Spirit of St. Louis (SUS) FBO',
    zip: '63005',
    note: 'Signature, Million Air & Jet Aviation Ramp Access',
    slug: 'spirit-of-st-louis-airport-sus',
  },
  {
    city: 'Clayton Business District',
    zip: '63105, 63124',
    note: 'Hotels, Financial Towers & STL Express',
    slug: 'clayton-to-stl-airport',
  },
  {
    city: 'Town & Country & Frontenac',
    zip: '63131',
    note: 'Mason, Clayton Rd & Hospital Campuses',
    slug: 'town-and-country-car-service',
  },
  {
    city: 'Creve Coeur Corporate Campus',
    zip: '63141, 63167',
    note: 'Bayer, 39 North, Mercy & BJC West County',
    slug: 'creve-coeur-executive-taxi',
  },
  {
    city: 'Wildwood, Ballwin & Ellisville',
    zip: '63038, 63040',
    note: 'Guaranteed Far-West County Staging',
    slug: 'wildwood-and-ellisville-taxi',
  },
  {
    city: 'Maryland Heights & Westport',
    zip: '63146, 63043',
    note: '14-Min STL Airport & Westport Hotels',
    slug: 'maryland-heights-westport-taxi',
  },
  {
    city: 'Downtown St. Louis',
    zip: '63101 - 63103',
    note: "America's Center, Busch Stadium & Union Station",
    slug: 'downtown-st-louis-airport-transfer',
  },
];

export default function ServicesRoute() {
  const [vehicles, setVehicles] = React.useState<VehicleTierConfig[]>([]);

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
        if (settings?.vehicles) {
          setVehicles(settings.vehicles.filter((v: VehicleTierConfig) => !v.isArchived));
        }
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
    } catch (err) {
      console.warn('Error subscribing to settings in ServicesRoute:', err);
    }
  }, []);

  const companyName = company?.name || COMPANY_CONFIG.name;

  // Derive dynamic vehicle recommendations from Admin Config vehicle classes
  const standardTier =
    vehicles.find((v) => v.iconType === 'standard' || v.id === 'standard') || vehicles[0];
  const premiumTier =
    vehicles.find((v) => v.iconType === 'premium' || v.id === 'premium') || vehicles[1] || vehicles[0];
  const xlTier =
    vehicles.find((v) => v.iconType === 'xl' || v.id === 'xl') ||
    [...vehicles].sort((a, b) => b.maxPassengers - a.maxPassengers)[0];

  const getRecommendedVehicleForService = (serviceId: string, fallback: string): string => {
    if (vehicles.length === 0) return fallback;
    switch (serviceId) {
      case 'airport-transfers':
        return Array.from(new Set([standardTier?.name, xlTier?.name].filter(Boolean))).join(' or ') || fallback;
      case 'corporate-accounts':
        return Array.from(new Set([premiumTier?.name, xlTier?.name].filter(Boolean))).join(' / ') || fallback;
      case 'special-events':
        return xlTier?.name ? `${xlTier.name} or Multi-Vehicle Fleet` : fallback;
      case 'hourly-charters':
        return Array.from(new Set([premiumTier?.name, xlTier?.name].filter(Boolean))).join(' / ') || fallback;
      default:
        return vehicles.map((v) => v.name).join(', ') || fallback;
    }
  };

  const fleetGridCols =
    vehicles.length === 1
      ? 'grid-cols-1 max-w-md mx-auto'
      : vehicles.length === 2
      ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto'
      : vehicles.length === 3
      ? 'grid-cols-1 md:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="py-12 bg-surface-subtle flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 bg-status-info-bg text-status-info-fg text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-status-info-border">
            {companyName} Services
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-fg-primary tracking-tight">
            Services &amp; Rates
          </h1>
          <p className="text-base sm:text-lg text-fg-secondary leading-relaxed">
            Airport pickups, local door-to-door rides, corporate accounts, and hourly charters across
            Chesterfield and St. Louis County.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {SERVICES.map((service) => {
            const dynamicRecommended = getRecommendedVehicleForService(
              service.id,
              service.recommendedVehicle
            );
            return (
              <Card
                key={service.id}
                variant="elevated"
                className="border-border-subtle/80 hover:border-blue-400/80 transition-all bg-surface-card rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xs"
              >
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-status-info-bg border border-status-info-border flex items-center justify-center shrink-0">
                      {service.icon}
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-surface-muted text-fg-secondary">
                      {service.badge}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-fg-primary tracking-tight">
                      {service.title}
                    </h2>
                    <p className="text-xs font-semibold text-blue-600 mt-0.5">
                      {service.subtitle}
                    </p>
                  </div>

                  <p className="text-sm text-fg-secondary leading-relaxed">
                    {service.description}
                  </p>

                  {/* Key features checklist */}
                  <div className="space-y-2 pt-2 border-t border-border-faint">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                      Service Inclusions
                    </h4>
                    <ul className="space-y-1.5 text-xs text-fg-secondary">
                      {service.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckIcon className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-border-faint flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div>
                      <span className="text-[11px] text-fg-subtle block font-medium">Recommended Vehicle</span>
                      <span className="text-xs font-bold text-status-info-fg">{dynamicRecommended}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-fg-subtle block font-medium">Pricing Guide</span>
                      <span className="text-xs font-bold text-fg-strong">{service.estimatedPricing}</span>
                    </div>
                  </div>

                  <Link
                    to="/book"
                    className="inline-flex items-center justify-center gap-2 bg-surface-header hover:bg-surface-header-elevated text-blue-400 hover:text-blue-300 text-xs font-extrabold px-5 py-2.5 rounded-xl transition-colors shadow-xs shrink-0"
                  >
                    <span>Book a Ride</span>
                    <ChevronRightIcon className="w-3.5 h-3.5 stroke-[3]" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Fleet Categories Section */}
        <div className="bg-surface-card rounded-3xl border border-border-subtle/80 p-8 sm:p-10 shadow-xs space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Our Fleet
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-fg-primary tracking-tight">
              Choose the Right Vehicle for Your Ride
            </h2>
            <p className="text-sm text-fg-secondary">
              All vehicles in our fleet are smoke-free, inspected weekly, and climate-controlled.
            </p>
          </div>

          <div className={`grid ${fleetGridCols} gap-6`}>
            {vehicles.map((tier) => (
              <div
                key={tier.id}
                className="rounded-2xl bg-surface-subtle border border-border-subtle/80 hover:border-blue-400/80 transition-all overflow-hidden flex flex-col justify-between shadow-2xs group"
              >
                <div>
                  {tier.imageUrl ? (
                    <div className="relative h-44 w-full bg-surface-emphasis overflow-hidden border-b border-border-subtle/80">
                      <img
                        src={tier.imageUrl}
                        alt={tier.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent" />
                      <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-surface-card/95 backdrop-blur-xs border border-border-subtle/80 flex items-center justify-center shadow-xs">
                        {getVehicleIcon(tier.iconType, tier.id)}
                      </div>
                      {tier.badge && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold text-status-info-fg bg-status-info-bg-strong/95 backdrop-blur-xs border border-status-info-border px-2.5 py-0.5 rounded-full uppercase shadow-2xs">
                          {tier.badge}
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="p-6 space-y-3">
                    {!tier.imageUrl && (
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-surface-card border border-border-subtle flex items-center justify-center">
                          {getVehicleIcon(tier.iconType, tier.id)}
                        </div>
                        {tier.badge && (
                          <span className="text-[10px] font-bold text-status-info-fg bg-status-info-bg-strong px-2 py-0.5 rounded-full uppercase">
                            {tier.badge}
                          </span>
                        )}
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-bold text-fg-primary">{tier.name}</h3>
                      <p className="text-xs font-semibold text-status-info-fg mt-0.5">
                        Up to {tier.maxPassengers} Passengers • {tier.maxLuggage} Bags
                      </p>
                    </div>
                    <p className="text-xs text-fg-secondary leading-relaxed">
                      {tier.description || 'Clean, comfortable, climate-controlled vehicle.'}
                    </p>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-2">
                  <Link
                    to={`/book?vehicle=${tier.id === 'xl' ? 'suv' : 'sedan'}`}
                    className="text-xs font-bold text-fg-primary hover:text-blue-600 inline-flex items-center gap-1 transition-colors"
                  >
                    <span>Book This Vehicle</span>
                    <ChevronRightIcon className="w-3 h-3 stroke-[3]" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service Area Coverage Directory */}
        <div className="bg-surface-card rounded-3xl border border-border-subtle/80 p-8 sm:p-10 shadow-xs space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Service Area Directory
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-fg-primary tracking-tight">
              West County &amp; Regional Hubs
            </h2>
            <p className="text-sm text-fg-secondary">
              Select any corridor below to view instant upfront quotes, STL terminal door guides,
              and local landmarks:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            {SERVICE_ZONES.map((zone) => (
              <Link
                key={zone.slug}
                to={`/service-areas/${zone.slug}`}
                className="p-4 rounded-xl bg-surface-subtle hover:bg-status-info-bg/50 border border-border-subtle/80 hover:border-blue-400 flex items-start justify-between gap-3 text-sm transition-all group"
              >
                <div>
                  <span className="font-bold text-fg-primary group-hover:text-status-info-fg transition-colors block">
                    {zone.city}
                  </span>
                  <span className="text-fg-muted text-xs mt-0.5 block">{zone.note}</span>
                </div>
                <span className="font-mono text-xs text-status-info-fg bg-status-info-bg-strong/70 px-2 py-1 rounded-md font-semibold shrink-0">
                  {zone.zip}
                </span>
              </Link>
            ))}
          </div>

          <div className="pt-2 text-center">
            <Link
              to="/service-areas"
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold text-blue-600 hover:text-status-info-fg"
            >
              <span>Explore All 8 Pre-Quoted Airport &amp; West County Corridors</span>
              <ChevronRightIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* CTA Strip */}
        <div
          style={{
            backgroundColor: 'var(--brand-primary, #2563eb)',
            color: 'var(--btn-primary-text, #ffffff)',
          }}
          className="rounded-3xl p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md"
        >
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-2xl font-extrabold tracking-tight">
              Have a custom corporate or multi-car request?
            </h3>
            <p className="text-sm font-medium opacity-90">
              Speak directly with our Chesterfield operations manager for tailored itinerary pricing.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/contact"
              className="bg-surface-header hover:bg-surface-header text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors shadow-xs"
            >
              Contact Dispatch
            </Link>
            <Link
              to="/book"
              className="bg-surface-card hover:bg-surface-muted text-fg-primary font-extrabold text-sm px-6 py-3 rounded-xl transition-colors shadow-xs"
            >
              Book Online Now
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
