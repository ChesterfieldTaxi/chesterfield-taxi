import React from 'react';
import { Link } from 'react-router';
import {
  PlaneIcon,
  BuildingIcon,
  SparklesIcon,
  ClockIcon,
  CarIcon,
  AccessibilityIcon,
  CheckIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
} from '../components/ui/Icons';
import { Card } from '../components/ui/Card';

export function meta() {
  return [
    { title: 'Services & Rates – Chesterfield Taxi' },
    {
      name: 'description',
      content:
        'Comprehensive transportation services including Lambert STL airport transfers, corporate accounts, hourly charters, and WAV handicap accessible taxi service in Chesterfield, MO.',
    },
  ];
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
    icon: <PlaneIcon className="w-6 h-6 text-amber-500" />,
    description:
      'Eliminate the stress of airport parking and unreliable rideshare surges. We provide guaranteed curb-to-curb departures and scheduled arrivals with live flight number tracking.',
    features: [
      'Automated flight arrival tracking (delays monitored automatically)',
      'Complimentary 30-minute grace period for domestic flights',
      'Curbside pickup or inside terminal baggage claim meet-and-greet',
      'Generous luggage capacity with executive SUV options',
    ],
    recommendedVehicle: 'Standard Sedan or Executive SUV',
    estimatedPricing: 'Flat rates from $45-$65 from West County to STL',
  },
  {
    id: 'corporate-accounts',
    title: 'Corporate Travel & Executive Accounts',
    subtitle: 'Streamlined billing and executive transportation for businesses',
    badge: 'Business Class',
    icon: <BuildingIcon className="w-6 h-6 text-amber-500" />,
    description:
      'Designed for corporate headquarters, law firms, and medical facilities throughout Chesterfield Valley and Maryville Centre. Enjoy consolidated monthly billing and VIP chauffeur standards.',
    features: [
      'Consolidated monthly itemized invoicing & expense reporting',
      'Priority vehicle dispatch during morning & evening peak rush hours',
      'Non-smoking, pristine black-car executive sedans and SUVs',
      'Dedicated corporate account manager & voucher code integration',
    ],
    recommendedVehicle: 'Executive Black Car / SUV',
    estimatedPricing: 'Corporate contract rates & volume discounting',
  },
  {
    id: 'special-events',
    title: 'Special Events & Wedding Shuttles',
    subtitle: 'Reliable group transit for weddings, galas, and game days',
    badge: 'Group & Events',
    icon: <SparklesIcon className="w-6 h-6 text-amber-500" />,
    description:
      'Arrive in comfort and style. We coordinate seamless group arrivals and departures for wedding parties, charity galas, and sporting events at Enterprise Center or Busch Stadium.',
    features: [
      'Multi-vehicle coordination for guest groups and families',
      'No surge pricing after concerts or late-night sporting events',
      'Punctual pickup schedules customized to your itinerary',
      'Spacious luggage and wardrobe storage capacity',
    ],
    recommendedVehicle: 'Executive SUV or Multi-Vehicle Fleet',
    estimatedPricing: 'Custom event package pricing available',
  },
  {
    id: 'hourly-charters',
    title: 'Hourly As-Directed Chauffeur',
    subtitle: 'Flexible personal driver on standby for multi-stop schedules',
    badge: 'Maximum Flexibility',
    icon: <ClockIcon className="w-6 h-6 text-amber-500" />,
    description:
      'Need a vehicle at your command for executive roadshows, medical appointments, or regional wine tours? Our hourly charter service keeps your professional driver on standby.',
    features: [
      'Vehicle and driver remain on-site throughout your appointments',
      'Unlimited stops within the booked hourly window',
      'Ideal for executives visiting multiple Chesterfield campuses',
      'Zero cancellation penalties when schedule shifts',
    ],
    recommendedVehicle: 'Executive SUV / Luxury Sedan',
    estimatedPricing: 'Hourly rates starting at $75/hr (2-hr minimum)',
  },
];

const FLEET_TIERS = [
  {
    name: 'Standard Sedan',
    capacity: 'Up to 4 Passengers &bull; 3 Luggage',
    description: 'Clean, fuel-efficient sedans ideal for daily commutes, errands, and quick solo airport runs.',
    icon: <CarIcon className="w-6 h-6 text-slate-900" />,
  },
  {
    name: 'Executive SUV',
    capacity: 'Up to 6 Passengers &bull; 6 Luggage',
    description: 'Full-size luxury SUVs with leather seating, rear climate controls, and immense luggage volume.',
    icon: <SparklesIcon className="w-6 h-6 text-amber-500" />,
  },
  {
    name: 'Wheelchair Accessible (WAV)',
    capacity: '1 Wheelchair + 3 Passengers &bull; 2 Luggage',
    description: 'Rear or side-entry ramp equipped vans with ADA-certified four-point tie-down safety locks.',
    icon: <AccessibilityIcon className="w-6 h-6 text-blue-600" />,
  },
];

export default function ServicesRoute() {
  return (
    <div className="py-12 bg-slate-50 flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-100/90 text-amber-950 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-amber-300">
            Chesterfield Taxi Services
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight">
            Premium Transportation Services
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            Tailored car services engineered for airport convenience, executive efficiency, and
            safe passenger transport across St. Louis County.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {SERVICES.map((service) => (
            <Card
              key={service.id}
              variant="elevated"
              className="border-slate-200/80 hover:border-amber-400/80 transition-all bg-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xs"
            >
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                    {service.icon}
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                    {service.badge}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight">
                    {service.title}
                  </h2>
                  <p className="text-xs font-semibold text-amber-600 mt-0.5">
                    {service.subtitle}
                  </p>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {service.description}
                </p>

                {/* Key features checklist */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Service Inclusions
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {service.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckIcon className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Pricing Guide</span>
                  <span className="text-xs font-bold text-slate-800">{service.estimatedPricing}</span>
                </div>

                <Link
                  to="/book"
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 text-xs font-extrabold px-5 py-2.5 rounded-xl transition-colors shadow-xs"
                >
                  <span>Book This Service</span>
                  <ChevronRightIcon className="w-3.5 h-3.5 stroke-[3]" />
                </Link>
              </div>
            </Card>
          ))}
        </div>

        {/* Fleet Categories Section */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-10 shadow-xs space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
              Our Modern Fleet
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              A Vehicle for Every Requirement
            </h2>
            <p className="text-sm text-slate-600">
              All vehicles in our fleet are smoke-free, inspected weekly, and climate-controlled.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FLEET_TIERS.map((tier) => (
              <div
                key={tier.name}
                className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                    {tier.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{tier.name}</h3>
                    <p
                      className="text-xs font-semibold text-amber-700 mt-0.5"
                      dangerouslySetInnerHTML={{ __html: tier.capacity }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {tier.description}
                  </p>
                </div>

                <Link
                  to="/book"
                  className="text-xs font-bold text-slate-900 hover:text-amber-600 inline-flex items-center gap-1 transition-colors"
                >
                  <span>Select in Booking Wizard</span>
                  <ChevronRightIcon className="w-3 h-3 stroke-[3]" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Strip */}
        <div className="bg-amber-500 rounded-3xl p-8 sm:p-10 text-slate-950 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-2xl font-extrabold tracking-tight">
              Have a custom corporate or multi-car request?
            </h3>
            <p className="text-sm font-medium text-slate-900">
              Speak directly with our Chesterfield operations manager for tailored itinerary pricing.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/contact"
              className="bg-slate-950 hover:bg-slate-900 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors shadow-xs"
            >
              Contact Dispatch
            </Link>
            <Link
              to="/book"
              className="bg-white hover:bg-slate-100 text-slate-950 font-extrabold text-sm px-6 py-3 rounded-xl transition-colors shadow-xs"
            >
              Book Online Now
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
