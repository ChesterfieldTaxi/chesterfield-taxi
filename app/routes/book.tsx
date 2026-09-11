import React from 'react';
import { BookingForm } from '../components/domain/BookingForm';
import {
  ShieldCheckIcon,
  ClockIcon,
  PhoneIcon,
  CarIcon,
  CheckIcon,
} from '../components/ui/Icons';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `Book a Ride – ${COMPANY_CONFIG.name} Online Booking` },
    {
      name: 'description',
      content:
        'Reserve your taxi or executive car in Chesterfield, MO. Live upfront fare calculation, instant ASAP dispatch or scheduled airport transfers.',
    },
  ];
}

const GUARANTEES = [
  {
    icon: <ShieldCheckIcon className="w-4 h-4 text-amber-500" />,
    text: 'Upfront fixed fare guarantee — what you see is what you pay',
  },
  {
    icon: <ClockIcon className="w-4 h-4 text-amber-500" />,
    text: '24/7 live dispatch monitoring with real-time driver tracking',
  },
  {
    icon: <CarIcon className="w-4 h-4 text-amber-500" />,
    text: 'Standard, Executive SUV, and Wheelchair Accessible (WAV) fleet',
  },
];

export default function BookRoute() {
  return (
    <div className="py-8 sm:py-12 bg-gradient-to-b from-slate-50 via-white to-amber-50/20 flex-1">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Distraction-Free Header */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 bg-amber-100/80 text-amber-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {COMPANY_CONFIG.name} Reservation System
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Book Your Ride Online
          </h1>

          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Complete the 5 quick steps below to receive a guaranteed live fare quote and reserve
            your vehicle.
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

        {/* Interactive Booking Wizard Form */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-8">
          <BookingForm />
        </div>

        {/* Live Support Footnote */}
        <div className="mt-8 text-center text-xs text-slate-500 space-y-1">
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
