import React from 'react';
import { Link } from 'react-router';
import {
  CarIcon,
  ShieldCheckIcon,
  ClockIcon,
  PhoneIcon,
  CheckIcon,
  PlaneIcon,
  BuildingIcon,
  AccessibilityIcon,
  SparklesIcon,
  MapPinIcon,
  ChevronRightIcon,
} from '../components/ui/Icons';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `${COMPANY_CONFIG.name} – ${COMPANY_CONFIG.tagline}` },
    {
      name: 'description',
      content:
        'West St. Louis County premier licensed taxi & car service. Airport transfers to Lambert STL & Spirit SUS, corporate accounts, 24/7 dispatch with upfront guaranteed fares.',
    },
  ];
}

const VALUE_PROPOSITIONS = [
  {
    icon: <ClockIcon className="w-6 h-6 text-amber-500" />,
    title: 'Guaranteed Punctuality',
    description:
      'We value your schedule. Whether booking for an early morning flight or late night pickup, our dispatch network guarantees on-time arrival.',
  },
  {
    icon: <ShieldCheckIcon className="w-6 h-6 text-amber-500" />,
    title: 'Transparent Fixed Pricing',
    description:
      'No surprise surge pricing or unmetered rates. Receive a guaranteed fare estimate before confirming your trip.',
  },
  {
    icon: <CarIcon className="w-6 h-6 text-amber-500" />,
    title: 'Modern & Clean Fleet',
    description:
      'From executive sedans to spacious SUVs and wheelchair-accessible vans, all vehicles undergo daily cleaning and safety inspections.',
  },
  {
    icon: <SparklesIcon className="w-6 h-6 text-amber-500" />,
    title: 'Professional Chauffeurs',
    description:
      'Fully licensed, background-checked, and commercially insured drivers with thorough local knowledge of West County and St. Louis metro.',
  },
];

const POPULAR_DESTINATIONS = [
  {
    destination: 'Lambert-St. Louis International (STL)',
    type: 'Commercial Airport',
    time: 'Approx. 25-35 min from Chesterfield',
    badge: 'Most Popular',
  },
  {
    destination: 'Spirit of St. Louis Airport (SUS)',
    type: 'Private & Corporate Aviation',
    time: 'Approx. 5-10 min from Chesterfield Valley',
    badge: 'Executive Hub',
  },
  {
    destination: 'Downtown St. Louis & Busch Stadium',
    type: 'Sports, Conventions & Dining',
    time: 'Approx. 30-40 min via I-64 / US-40',
    badge: 'Events',
  },
  {
    destination: 'West County Center & Plaza Frontenac',
    type: 'Shopping & Dining Corridors',
    time: 'Approx. 15-20 min',
    badge: 'Local',
  },
];

const HIGHLIGHTS = [
  'Instant dispatch or scheduled future bookings',
  'Lambert STL flight delay monitoring included',
  'Executive accounts with monthly invoicing',
  'Wheelchair Accessible Vehicles (WAV) available',
];

export default function IndexRoute() {
  return (
    <div className="flex flex-col">
      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50/40 via-white to-slate-50 py-16 sm:py-24 border-b border-slate-200/80">
        <div className="absolute inset-0 pointer-events-none opacity-40 [background-image:radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Headline & Call To Actions */}
            <div className="lg:col-span-7 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 bg-amber-100/90 text-amber-950 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-amber-300/80 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Serving Chesterfield, Wildwood, Ballwin &amp; St. Louis Metro
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 tracking-tight leading-[1.12]">
                Dependable, Professional{' '}
                <span className="text-amber-500 underline decoration-amber-300 decoration-wavy underline-offset-8">
                  Taxi &amp; Executive
                </span>{' '}
                Car Service
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Book your ride in seconds. Upfront guaranteed fare quotes, licensed &amp; insured
                drivers, and 24/7 dispatch across West St. Louis County.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  to="/book"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-base font-extrabold px-8 py-4 rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                >
                  <CarIcon className="w-5 h-5" />
                  <span>Book Your Ride Now</span>
                  <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
                </Link>

                <Link
                  to="/services"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-800 text-base font-bold px-6 py-4 rounded-xl border border-slate-300 shadow-xs transition-colors"
                >
                  <span>Explore Services &amp; Rates</span>
                </Link>
              </div>

              {/* Bullet Features */}
              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm text-slate-600">
                {HIGHLIGHTS.map((highlight) => (
                  <div key={highlight} className="flex items-center gap-2 justify-center lg:justify-start">
                    <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                      <CheckIcon className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Rate Estimation Teaser Card */}
            <div className="lg:col-span-5">
              <Card variant="elevated" className="border-amber-200/80 shadow-xl overflow-hidden bg-white">
                <div className="bg-slate-950 text-white p-6 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Instant Fare Estimate
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                      Upfront Guaranteed
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold tracking-tight">
                    Where can we take you today?
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Calculate mileage, choose your vehicle, and reserve in under two minutes.
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  {/* Step highlights preview */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        1
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Pickup &amp; Destination</span>
                        <span className="text-xs text-slate-500">Address autocomplete with Google Maps routing</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        2
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Select Vehicle Tier</span>
                        <span className="text-xs text-slate-500">Standard Sedan, Executive SUV, or WAV Van</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        3
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Review &amp; Confirm</span>
                        <span className="text-xs text-slate-500">Instant SMS &amp; email dispatch confirmation</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Link
                      to="/book"
                      className="w-full flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 text-amber-400 hover:text-amber-300 font-extrabold text-sm py-3.5 px-4 rounded-xl transition-all shadow-sm"
                    >
                      <span>Launch Online Booking Portal</span>
                      <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
                    </Link>
                  </div>

                  <div className="text-center">
                    <a
                      href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                      className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 font-semibold"
                    >
                      <PhoneIcon className="w-3.5 h-3.5 text-amber-600" />
                      <span>Prefer to call? Speak with dispatch: {COMPANY_CONFIG.phone.dispatch}</span>
                    </a>
                  </div>
                </div>
              </Card>
            </div>

          </div>
        </div>
      </section>

      {/* ─── Value Propositions ─── */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
              Why Choose Chesterfield Taxi
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight mt-1">
              Engineered for Reliability &amp; Comfort
            </h2>
            <p className="text-slate-600 text-base mt-3">
              We combine modern booking technology with the seasoned accountability of a dedicated,
              locally-owned car service.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUE_PROPOSITIONS.map((prop) => (
              <Card
                key={prop.title}
                variant="default"
                className="p-6 rounded-2xl hover:border-amber-300 hover:shadow-md transition-all group bg-slate-50/50"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                  {prop.icon}
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mb-2">{prop.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{prop.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Popular Destinations / Service Highlights ─── */}
      <section className="py-16 bg-slate-50 border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                Service Coverage Highlights
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight mt-1">
                Frequent Routes &amp; Transfers
              </h2>
            </div>

            <Link
              to="/services"
              className="text-sm font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1.5"
            >
              <span>View all specialized services</span>
              <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {POPULAR_DESTINATIONS.map((dest) => (
              <div
                key={dest.destination}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-4 hover:border-amber-400 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="w-4 h-4 text-amber-500 shrink-0" />
                    <h3 className="text-base font-bold text-slate-900">{dest.destination}</h3>
                  </div>
                  <p className="text-xs text-slate-500 pl-6">{dest.type}</p>
                  <p className="text-xs text-amber-700 font-semibold pl-6">{dest.time}</p>
                </div>

                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 shrink-0">
                  {dest.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Bottom Ready to Ride CTA Banner ─── */}
      <section className="py-16 bg-slate-950 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto shadow-md">
            <CarIcon className="w-7 h-7" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to experience professional transit?
          </h2>

          <p className="text-slate-400 max-w-xl mx-auto text-base">
            Book now for immediate dispatch or schedule your upcoming reservation in advance.
            Guaranteed upfront pricing.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              to="/book"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-base font-extrabold px-8 py-3.5 rounded-xl shadow-lg transition-all"
            >
              <span>Book Your Trip Online</span>
              <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
            </Link>

            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-base font-bold px-6 py-3.5 rounded-xl border border-slate-800 transition-colors"
            >
              <PhoneIcon className="w-4 h-4 text-amber-400" />
              <span>{COMPANY_CONFIG.phone.dispatch}</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
