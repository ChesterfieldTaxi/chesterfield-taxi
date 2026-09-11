import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { BookingEngine } from '../components/domain/BookingEngine';
import { BookingEngineV2 } from '../components/domain/BookingEngineV2';
import {
  ShieldCheckIcon,
  ClockIcon,
  CarIcon,
} from '../components/ui/Icons';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { getAdminConfigService } from '../core/services/config/admin-config.service';

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
    icon: <ShieldCheckIcon className="w-4 h-4 text-amber-500" />,
    text: 'Upfront fixed fare guarantee — no surprise surge rates',
  },
  {
    icon: <ClockIcon className="w-4 h-4 text-amber-500" />,
    text: '24/7 live dispatch desk with real-time flight radar tracking',
  },
  {
    icon: <CarIcon className="w-4 h-4 text-amber-500" />,
    text: 'Premium Sedans, Executive SUVs, and WAV Wheelchair Accessible fleet',
  },
];

export default function BookRoute() {
  const [searchParams] = useSearchParams();
  const queryLayout = searchParams.get('layout'); // 'v1' or 'v2'

  const [activeVersion, setActiveVersion] = useState<'v1' | 'v2'>(() => {
    if (queryLayout === 'v1' || queryLayout === 'v2') return queryLayout;
    return COMPANY_CONFIG.publicFormVersion || 'v2';
  });

  // Hydrate dynamic settings from Firestore
  useEffect(() => {
    if (queryLayout === 'v1' || queryLayout === 'v2') {
      setActiveVersion(queryLayout);
      return;
    }

    const configService = getAdminConfigService();
    configService.getSettings().then((settings) => {
      if (settings.publicFormVersion) {
        setActiveVersion(settings.publicFormVersion);
      }
    });

    if (configService.subscribeToSettings) {
      const unsub = configService.subscribeToSettings((updated) => {
        if (!queryLayout && updated.publicFormVersion) {
          setActiveVersion(updated.publicFormVersion);
        }
      });
      return unsub;
    }
  }, [queryLayout]);

  return (
    <div className="py-8 sm:py-12 bg-gradient-to-b from-slate-50 via-white to-amber-50/20 flex-1 pb-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Bar */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 bg-amber-100/80 text-amber-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {COMPANY_CONFIG.name} Reservation System
            <span className="ml-1 text-[10px] bg-amber-200 text-amber-950 px-1.5 py-0.2 rounded font-mono">
              Layout {activeVersion.toUpperCase()}
            </span>
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

        {/* Dynamic Booking Engine Layout (V1 vs V2) */}
        <div className="mt-6">
          {activeVersion === 'v2' ? (
            <BookingEngineV2 />
          ) : (
            <BookingEngine mode="customer" />
          )}
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
