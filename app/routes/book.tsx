import React from 'react';
import { BookingEngineV2 } from '../components/domain/BookingEngineV2';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `Book a Ride – ${COMPANY_CONFIG.name} Online Reservation Portal` },
    {
      name: 'description',
      content:
        'Reserve your taxi or executive car in Chesterfield, MO. Single-page booking with live upfront estimated fare calculation, instant ASAP dispatch, or scheduled airport transfers.',
    },
  ];
}

export default function BookRoute() {
  const [isConfirmed, setIsConfirmed] = React.useState(false);

  return (
    <div className="py-5 sm:py-8 bg-gradient-to-b from-slate-50 via-white to-blue-50/20 flex-1 pb-28 lg:pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Compact Header Bar - Hidden on Confirmation */}
        {!isConfirmed && (
          <div className="text-center mb-5 space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              Book Your Ride
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Upfront estimated fares, 24/7 live Chesterfield dispatch, and real-time STL flight tracking.
            </p>
          </div>
        )}

        {/* Customer Booking Engine */}
        <div className={isConfirmed ? '' : 'mt-4'}>
          <BookingEngineV2 onConfirmedChange={setIsConfirmed} />
        </div>

        {/* Live Support Footnote */}
        <div className="mt-10 text-center text-xs text-slate-500 space-y-1">
          <p>
            Need immediate roadside assistance or specialized group dispatch?
          </p>
          <p className="font-semibold text-slate-700">
            Call our 24/7 {COMPANY_CONFIG.name} Dispatch Desk at{' '}
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="text-blue-600 hover:text-blue-700 underline font-bold"
            >
              {COMPANY_CONFIG.phone.dispatch}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
