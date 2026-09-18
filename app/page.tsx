// app/page.tsx (Next.js App Router)
import React from 'react';
import { Phone, Clock, ShieldCheck, MapPin } from 'lucide-react';

export default function UnderConstruction() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6 font-sans">
      {/* Header / Brand */}
      <header className="max-w-4xl mx-auto w-full pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-amber-400 rounded-lg flex items-center justify-center text-slate-900 font-bold text-xl">
            CT
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            Chesterfield Taxi & Car Service
          </span>
        </div>
      </header>

      {/* Main Content Card */}
      <main className="max-w-2xl mx-auto w-full my-auto py-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/10 text-amber-400 text-sm font-semibold mb-6 border border-amber-400/20">
          <Clock className="w-4 h-4" /> System Upgrade In Progress
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
          We’re upgrading your dispatch experience.
        </h1>

        <p className="text-slate-400 text-lg mb-8 max-w-lg mx-auto">
          Our online booking system is currently undergoing scheduled maintenance. Direct phone dispatch remains fully operational 24/7.
        </p>

        {/* Primary Call to Action */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl mb-8">
          <p className="text-sm uppercase tracking-wider font-semibold text-slate-400 mb-2">
            Need a ride immediately?
          </p>
          <a
            href="tel:+13147389921"
            className="inline-flex items-center justify-center gap-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-2xl px-8 py-4 rounded-xl transition-all duration-150 transform active:scale-95 shadow-lg shadow-amber-400/10 w-full sm:w-auto"
          >
            <Phone className="w-6 h-6 fill-current" />
            (314) 738-9921
          </a>
          <p className="text-xs text-slate-400 mt-3">
            Click to call dispatch directly from your mobile device
          </p>
        </div>

        {/* Value Props */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800">
            <ShieldCheck className="w-5 h-5 text-amber-400 mb-2" />
            <h2 className="text-sm font-semibold text-slate-200">24/7 Dispatch</h2>
            <p className="text-xs text-slate-400 mt-1">Live operators ready to confirm your pickup instantly.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800">
            <MapPin className="w-5 h-5 text-amber-400 mb-2" />
            <h2 className="text-sm font-semibold text-slate-200">Airport & Local</h2>
            <p className="text-xs text-slate-400 mt-1">Reliable transit across St. Louis & Lambert Airport.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800">
            <Clock className="w-5 h-5 text-amber-400 mb-2" />
            <h2 className="text-sm font-semibold text-slate-200">On-Time Guarantee</h2>
            <p className="text-xs text-slate-400 mt-1">Pre-scheduled bookings serviced as normal.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center pb-6 text-xs text-slate-400">
        © {new Date().getFullYear()} Chesterfield Taxi & Car Service. All rights reserved.
      </footer>
    </div>
  );
}
