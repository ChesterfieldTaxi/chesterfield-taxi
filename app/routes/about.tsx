import React from 'react';
import { Link } from 'react-router';
import {
  ShieldCheckIcon,
  CarIcon,
  ClockIcon,
  CheckIcon,
  AccessibilityIcon,
  SparklesIcon,
  PhoneIcon,
  ChevronRightIcon,
} from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `About Us – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content:
        `Learn about ${COMPANY_CONFIG.name}, our commitment to passenger safety, professional driver vetting, and wheelchair accessible fleet across West St. Louis County.`,
    },
  ];
}

const STATS = [
  { value: '100k+', label: 'Safe Passenger Trips', detail: 'Across St. Louis Metro' },
  { value: '99.8%', label: 'On-Time Pickup Rate', detail: 'Guaranteed Arrival Windows' },
  { value: '24/7/365', label: 'Continuous Dispatch', detail: 'Always Open, Day & Night' },
  { value: '100%', label: 'Licensed & Insured', detail: 'Full Commercial Coverage' },
];

const PILLARS = [
  {
    icon: <ShieldCheckIcon className="w-6 h-6 text-amber-500" />,
    title: 'Rigorous Driver Screening & Training',
    description:
      'Every driver in our fleet undergoes multi-jurisdictional criminal background checks, DMV record monitoring, and regular substance screenings. Our drivers are courteous, seasoned professionals who know the quickest routes through West County traffic.',
  },
  {
    icon: <CarIcon className="w-6 h-6 text-amber-500" />,
    title: 'Immaculate Fleet Maintenance',
    description:
      'Our vehicles are subject to scheduled mechanical inspections and daily interior detailing. We maintain non-smoking, climate-controlled cabins equipped with GPS navigation to guarantee a smooth, comfortable commute.',
  },
  {
    icon: <ClockIcon className="w-6 h-6 text-amber-500" />,
    title: 'Upfront Fare Guarantee',
    description:
      'We reject predatory surge algorithms. When bad weather strikes or flights arrive late, our rates remain transparent and predictable. What you are quoted in our booking system is what you pay.',
  },
  {
    icon: <AccessibilityIcon className="w-6 h-6 text-amber-500" />,
    title: 'Wheelchair & Mobility Accessibility (WAV)',
    description:
      'Transportation is an essential public service. We maintain dedicated wheelchair-accessible vans operated by drivers trained in certified four-point tie-down securement protocols and compassionate mobility assistance.',
  },
];

export default function AboutRoute() {
  return (
    <div className="py-12 bg-slate-50 flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Page Header & Mission */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-amber-100/90 text-amber-950 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-amber-300">
            About {COMPANY_CONFIG.name}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight">
            West County&apos;s Trusted Private Car Service
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            Founded on the simple principle that ground transit should be punctual, transparent, and
            driven by courteous local professionals.
          </p>
        </div>

        {/* Heritage Story Block */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                Our Heritage &amp; Mission
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                Locally Owned, Community Focused
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                {COMPANY_CONFIG.name} was established to bridge the gap between impersonal rideshare apps
                and outdated taxi companies. Based right in Chesterfield, Missouri, we serve corporate
                campuses, residential subdivisions, and airport commuters throughout West St. Louis
                County.
              </p>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Whether transporting an executive to a critical meeting in Clayton, ensuring an
                elderly passenger reaches an appointment at St. Luke&apos;s Hospital safely, or meeting an
                early flight at Lambert-St. Louis International, we treat every passenger with respect
                and undivided attention.
              </p>
            </div>

            <div className="lg:col-span-5 bg-slate-950 text-white p-8 rounded-2xl space-y-6">
              <h3 className="text-lg font-bold text-amber-400">Our Operational Promise</h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="w-4 h-4 text-amber-400 shrink-0 mt-1 stroke-[3]" />
                  <span>Always on time — we dispatch vehicles ahead of your reservation.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="w-4 h-4 text-amber-400 shrink-0 mt-1 stroke-[3]" />
                  <span>Transparent rates with zero hidden airport baggage surcharges.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="w-4 h-4 text-amber-400 shrink-0 mt-1 stroke-[3]" />
                  <span>Licensed by the St. Louis Metropolitan Taxicab Commission.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="w-4 h-4 text-amber-400 shrink-0 mt-1 stroke-[3]" />
                  <span>Real human dispatchers standing by 24/7 on the phone.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Milestone Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs text-center space-y-1 hover:border-amber-400 transition-colors"
            >
              <span className="text-3xl sm:text-4xl font-black text-amber-500 block tracking-tight">
                {stat.value}
              </span>
              <span className="text-sm font-extrabold text-slate-900 block">{stat.label}</span>
              <span className="text-xs text-slate-500 block">{stat.detail}</span>
            </div>
          ))}
        </div>

        {/* Safety & Quality Pillars */}
        <div className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
              Safety &amp; Compliance
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              Safety Is Our Non-Negotiable Standard
            </h2>
            <p className="text-sm text-slate-600">
              How we ensure peace of mind on every trip throughout the St. Louis metropolitan area.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PILLARS.map((pillar) => (
              <Card
                key={pillar.title}
                variant="default"
                className="p-8 rounded-3xl bg-white border-slate-200/80 space-y-3"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500">
                  {pillar.icon}
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">{pillar.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{pillar.description}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Ready to Ride Banner */}
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl font-extrabold tracking-tight">
              Ready to experience dependable transit?
            </h3>
            <p className="text-slate-400 text-sm">
              Book your next airport transfer or local ride with our easy online reservation tool.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Link
              to="/book"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm px-6 py-3.5 rounded-xl shadow-xs transition-colors"
            >
              <span>Book Online</span>
              <ChevronRightIcon className="w-4 h-4 stroke-[3]" />
            </Link>

            <Link
              to="/contact"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm px-6 py-3.5 rounded-xl border border-slate-700 transition-colors"
            >
              <span>Contact Dispatch</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
