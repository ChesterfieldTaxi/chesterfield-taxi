import React, { useEffect, useState } from 'react';
import type { Trip } from '../../../core/types/trip';
import type { TripSlaEvaluation } from '../../../core/services/dispatch/sla-monitor.service';
import { resolveTripFlightBadge } from '../../../core/services/flight/flight-status.service';
import { AlertTriangleIcon, BoltIcon, ClockIcon, PlaneIcon, XIcon } from '../../ui/Icons';

export function isTripCascadeActive(trip?: Partial<Trip> | null): boolean {
  return Boolean(
    trip &&
      !trip.assignedDriverId &&
      trip.offerCascade?.state === 'active' &&
      trip.status === 'offered'
  );
}

export function canTripTriggerAutoOffer(trip?: Partial<Trip> | null): boolean {
  if (!trip || trip.assignedDriverId) return false;
  if (isTripCascadeActive(trip)) return false;
  const terminalOrDeclined = ['completed', 'cancelled', 'DECLINED', 'declined'];
  return !terminalOrDeclined.includes(String(trip.status || ''));
}

export interface DispatchSlaBadgeProps {
  sla?: TripSlaEvaluation | null;
}

export const DispatchSlaBadge = React.memo(function DispatchSlaBadge({
  sla,
}: DispatchSlaBadgeProps) {
  if (!sla || !sla.isEligible || sla.level === 'normal' || !sla.badgeLabel) {
    return null;
  }

  const styleClass =
    sla.level === 'overdue'
      ? 'bg-rose-600 text-white border-rose-700 animate-pulse shadow-2xs'
      : sla.level === 'critical'
      ? 'bg-rose-100 text-rose-900 border-rose-300'
      : 'bg-amber-100 text-amber-900 border-amber-300';

  const tooltip = sla.isAirportTrip
    ? `Scheduled SLA (${sla.level.toUpperCase()}) — includes +${sla.airportExtraLeadMinutes}m ${sla.airportCode || 'Airport'} lead buffer`
    : `Scheduled SLA (${sla.level.toUpperCase()})`;

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-extrabold tracking-tight shrink-0 ${styleClass}`}
    >
      <ClockIcon className="w-3 h-3 shrink-0" />
      <span>{sla.badgeLabel}</span>
      {sla.isAirportTrip && <PlaneIcon className="w-2.5 h-2.5 shrink-0 opacity-85" />}
    </span>
  );
});

export interface DispatchCascadePillProps {
  trip: Trip;
  onCancel?: () => void;
  compact?: boolean;
}

export const DispatchCascadePill = React.memo(function DispatchCascadePill({
  trip,
  onCancel,
  compact = false,
}: DispatchCascadePillProps) {
  const cascade = trip.offerCascade;
  const isActive = isTripCascadeActive(trip);
  const isExhausted = !trip.assignedDriverId && cascade?.state === 'exhausted';

  const expiresAt = isActive ? cascade?.offerExpiresAt : undefined;
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (isActive && cascade) {
    const expiresMs = Date.parse(cascade.offerExpiresAt);
    const remainingSec = Number.isFinite(expiresMs)
      ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000))
      : cascade.timeoutSeconds || 45;
    const rawTargetLabel = cascade.activeOfferedDriverName || cascade.activeOfferedDriverId || 'Driver';
    const shortTargetLabel = compact
      ? rawTargetLabel.split('(')[0].trim() || rawTargetLabel
      : rawTargetLabel;

    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-300 text-[10.5px] font-extrabold shrink-0"
        title={`Sequential Offer Cascade (${cascade.strategy}): Step ${cascade.cascadeAttempt} of ${cascade.maxAttempts}`}
      >
        <BoltIcon className="w-3 h-3 text-indigo-600 animate-pulse shrink-0" />
        <span className="truncate max-w-[165px]">
          Offering {shortTargetLabel} • {remainingSec}s · {cascade.cascadeAttempt}/{cascade.maxAttempts}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-200/80 text-indigo-700 hover:text-rose-700 cursor-pointer transition-colors"
            title="Cancel Offer Cascade"
            aria-label="Cancel Offer Cascade"
          >
            <XIcon className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
    );
  }

  if (isExhausted && cascade) {
    const attemptedCount = cascade.attemptedDriverIds?.length || cascade.cascadeAttempt || 0;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300 text-[10.5px] font-extrabold shrink-0"
        title={`Auto-Offer Cascade exhausted (${attemptedCount}/${cascade.maxAttempts} attempts). Assign a driver manually or retry Auto-Offer.`}
      >
        <AlertTriangleIcon className="w-3 h-3 text-rose-600 shrink-0" />
        <span>
          {compact
            ? 'Cascade Exhausted'
            : `Cascade Exhausted (${attemptedCount}/${cascade.maxAttempts})`}
        </span>
      </span>
    );
  }

  return null;
});

export interface DispatchFlightTelemetryPillProps {
  trip: Trip;
  compact?: boolean;
}

export const DispatchFlightTelemetryPill = React.memo(function DispatchFlightTelemetryPill({
  trip,
  compact = false,
}: DispatchFlightTelemetryPillProps) {
  const badge = resolveTripFlightBadge(trip);
  if (!badge.hasFlight || !badge.label) {
    return null;
  }

  const toneClasses: Record<typeof badge.tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    amber: 'bg-amber-100 text-amber-950 border-amber-300',
    rose: 'bg-rose-100 text-rose-900 border-rose-300',
    blue: 'bg-sky-50 text-sky-900 border-sky-300',
    slate: 'bg-slate-100 text-slate-800 border-slate-300',
  };

  const tooltipParts = [
    badge.flightIdent ? `Flight ${badge.flightIdent}` : null,
    badge.terminal || null,
    badge.gate ? `Gate ${badge.gate}` : null,
    badge.baggageClaim ? `Baggage ${badge.baggageClaim}` : null,
    badge.pickupDoorGuidance || null,
  ].filter(Boolean);

  return (
    <span
      title={tooltipParts.join(' · ')}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-extrabold tracking-tight shrink-0 ${
        toneClasses[badge.tone]
      }`}
    >
      <PlaneIcon className="w-3 h-3 shrink-0" />
      <span className={compact ? 'truncate max-w-[140px]' : ''}>
        {compact ? badge.shortLabel : badge.label}
      </span>
    </span>
  );
});
