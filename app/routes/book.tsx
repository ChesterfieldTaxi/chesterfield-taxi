import React from 'react';
import { BookingEngineV2 } from '../components/domain/BookingEngineV2';
import {
  ShieldCheckIcon,
  ClockIcon,
  CarIcon,
} from '../components/ui/Icons';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `Book a Ride – ${COMPANY_CONFIG.name} Online Reservation Portal` },
    {
      name: 'description',
      content:
        'Reserve your taxi or executive car in Chesterfield, MO. Single-page booking with live upfront fare calculation, instant ASAP dispatch, or scheduled airport transfers.',
    },
  ];
}

const GUARANTEES = [
  {
    icon: <ShieldCheckIcon className="w-4 h-4 text-blue-600" />,
    text: 'Upfront fixed fare guarantee — no surprise surge rates',
  },
  {
    icon: <ClockIcon className="w-4 h-4 text-blue-600" />,
    text: '24/7 live dispatch desk with real-time flight radar tracking',
  },
  {
    icon: <CarIcon className="w-4 h-4 text-blue-600" />,
    text: 'Premium Sedans, Executive SUVs, and WAV Wheelchair Accessible fleet',
  },
];

export default function BookRoute() {
  return (
    <div className="py-8 sm:py-12 bg-gradient-to-b from-slate-50 via-white to-blue-50/20 flex-1 pb-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Bar */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }} />
            {COMPANY_CONFIG.name} Reservation System
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Book Your Ride Online
          </h1>

          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Single-page booking portal with instant Google Maps live fare calculation and upfront pricing guarantee.
          </p>

          {/* Quick reassurance pills */}
          <div className="pt-3 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-slate-600">
            {GUARANTEES.map((item, index) => (
              <div key={index} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-2xs">
                {item.icon}
                <span className="font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Booking Engine */}
        <div className="mt-6">
          <BookingEngineV2 />
        </div>

        {/* Live Support Footnote */}
        <div className="mt-12 text-center text-xs text-slate-500 space-y-1">
          <p>
            Need immediate roadside assistance or specialized group dispatch?
          </p>
          <p className="font-semibold text-slate-700">
            Call our 24/7 {COMPANY_CONFIG.name} Dispatch Desk at{' '}
            <a href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`} className="text-amber-600 hover:text-amber-700 underline font-bold">
              {COMPANY_CONFIG.phone.dispatch}
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
