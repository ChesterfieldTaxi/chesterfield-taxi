import React from 'react';
import type { Route } from './+types/home';
import { BookingForm } from '../components/domain/BookingForm';
import {
  ShieldCheckIcon,
  ClockIcon,
  CarIcon,
  PhoneIcon,
  CheckIcon,
} from '../components/ui/Icons';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Chesterfield Taxi – Book Online' },
    {
      name: 'description',
      content:
        'Book a licensed, professional taxi or executive car service in Chesterfield, MO. Instant dispatch, transparent pricing, and 24/7 availability.',
    },
  ];
}

const TRUST_BADGES = [
  {
    icon: <ClockIcon className="w-5 h-5 text-amber-500" />,
    title: '24/7 Dispatch',
    description: 'Available any time, any day — including holidays and late nights.',
  },
  {
    icon: <ShieldCheckIcon className="w-5 h-5 text-amber-500" />,
    title: 'Transparent Pricing',
    description: 'Live fare quotes calculated upfront. No hidden fees or surprises.',
  },
  {
    icon: <CarIcon className="w-5 h-5 text-amber-500" />,
    title: 'Licensed & Insured',
    description: 'Fully licensed fleet with fully insured, background-checked drivers.',
  },
];

const HIGHLIGHTS = [
  'Serving Chesterfield, Wildwood, Ballwin & greater St. Louis metro',
  'Airport transfers to Lambert STL & Spirit of St. Louis Airport (SUS)',
  'Wheelchair Accessible Vehicle (WAV) on request',
  'Corporate account & voucher code support',
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/20">

      {/* ─── Navigation Header ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
              <CarIcon className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-950 leading-none">
                Chesterfield Taxi
              </h1>
              <span className="text-[10px] font-semibold tracking-widest text-amber-600 uppercase leading-none">
                Professional Car Service
              </span>
            </div>
          </div>

          {/* Quick Call CTA */}
          <a
            href="tel:+16365550000"
            className="hidden sm:inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <PhoneIcon className="w-4 h-4 text-amber-400" />
            (636) 555-TAXI
          </a>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6">
        <div className="text-center max-w-3xl mx-auto">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider mb-4 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Serving Chesterfield, MO &amp; Surrounding Areas
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight leading-[1.15]">
            Dependable, Professional{' '}
            <span className="text-amber-500 inline-block">Taxi &amp; Executive</span>{' '}
            Car Service
          </h2>

          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Book your ride in minutes. Instant ASAP dispatch or schedule in advance — upfront
            pricing, no surprises, with licensed &amp; insured drivers ready around the clock.
          </p>

          {/* Feature highlights */}
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-600">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="flex items-center gap-1.5">
                <CheckIcon className="w-4 h-4 text-amber-500 shrink-0 stroke-[2.5]" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Trust Badges ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TRUST_BADGES.map((badge) => (
            <div
              key={badge.title}
              className="flex items-start gap-3.5 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                {badge.icon}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{badge.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {badge.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Booking Form Wizard ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Book Your Ride
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Complete the quick 5-step form below for an instant guaranteed fare quote.
          </p>
        </div>

        <BookingForm />
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center">
                <CarIcon className="w-3.5 h-3.5 text-slate-950" />
              </div>
              <span className="font-semibold text-slate-700">Chesterfield Taxi</span>
            </div>
            <p className="text-xs text-center sm:text-right">
              &copy; {new Date().getFullYear()} Chesterfield Taxi. All rights reserved.
              Licensed &amp; Insured. Chesterfield, MO.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
