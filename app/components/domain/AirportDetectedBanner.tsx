import React from 'react';
import type { RegionalAirport } from '../../core/config/airports';
import { PlaneLandingIcon, PlaneTakeoffIcon, SparklesIcon } from '../ui/Icons';
import { Badge } from '../ui/Badge';

export interface AirportDetectedBannerProps {
  airport: RegionalAirport;
  isPickupAirport: boolean;
  isDropoffAirport: boolean;
  className?: string;
}

export function AirportDetectedBanner({
  airport,
  isPickupAirport,
  isDropoffAirport,
  className = '',
}: AirportDetectedBannerProps) {
  const isArrival = isPickupAirport;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-500/10 via-amber-100/40 to-amber-50/20 p-4 sm:p-5 shadow-2xs transition-all duration-300 animate-in fade-in-50 ${className}`}
      role="region"
      aria-label="Airport Transfer Detected"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Aviation Status Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 border border-amber-400/30 flex items-center justify-center shadow-xs">
          {isArrival ? (
            <PlaneLandingIcon className="w-5 h-5 text-amber-700" />
          ) : (
            <PlaneTakeoffIcon className="w-5 h-5 text-amber-700" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <SparklesIcon className="w-3.5 h-3.5 text-amber-600" />
              Airport Transfer Detected
            </span>
            <Badge variant="warning" size="sm" className="font-mono font-bold">
              {airport.iataCode}
            </Badge>
          </div>

          <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
            {airport.name}
          </h4>

          <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
            {isArrival
              ? `We noticed your pickup is at ${airport.shortName}. In Step 4, we'll collect your flight details to track flight arrivals and guarantee punctual gate dispatch.`
              : `Heading to ${airport.shortName}? We ensure punctual curbside dropoff with ample time before terminal check-in.`}
          </p>
        </div>
      </div>
    </div>
  );
}
