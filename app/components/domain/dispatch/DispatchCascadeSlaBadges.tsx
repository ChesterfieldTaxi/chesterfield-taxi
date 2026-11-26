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
      ? 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border'
      : 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border';

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

export function getTripCascadeExhaustedTooltip(trip: Trip): string | null {
  const cascade = trip.offerCascade;
  if (trip.assignedDriverId || cascade?.state !== 'exhausted') {
    return null;
  }
  const attemptedCount = cascade.attemptedDriverIds?.length || cascade.cascadeAttempt || 0;
  return `Auto-Offer Cascade exhausted (${attemptedCount}/${cascade.maxAttempts} attempts) — assign a driver manually or retry Auto-Offer.`;
}

export interface DispatchCascadePillProps {
  trip: Trip;
  onCancel?: () => void;
  compact?: boolean;
  hideExhausted?: boolean;
}

export const DispatchCascadePill = React.memo(function DispatchCascadePill({
  trip,
  onCancel,
  compact = false,
  hideExhausted = false,
}: DispatchCascadePillProps) {
  const cascade = trip.offerCascade;
  const isActive = isTripCascadeActive(trip);
  const isExhausted = !trip.assignedDriverId && cascade?.state === 'exhausted';

  const expiresAt = isActive ? cascade?.offerExpiresAt : undefined;
  const [nowMs, setNowMs] = useState<number>(0);

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
    const remainingSec =
      nowMs > 0 && Number.isFinite(expiresMs)
        ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000))
        : cascade.timeoutSeconds || 45;
    const isBroadcastPool = cascade.mode === 'broadcast_pool';
    const activePoolIds = Array.isArray(cascade.activeOfferedDriverIds)
      ? cascade.activeOfferedDriverIds.filter(
          (id) =>
            Array.isArray(trip.offeredToIds) &&
            trip.offeredToIds.includes(id) &&
            !(Array.isArray(trip.rejectedByIds) && trip.rejectedByIds.includes(id))
        )
      : [];
    const poolCarCount = activePoolIds.length || trip.offeredToIds?.length || 1;
    const rawTargetLabel = cascade.activeOfferedDriverName || cascade.activeOfferedDriverId || 'Driver';
    const shortTargetLabel = compact
      ? rawTargetLabel.split('(')[0].trim() || rawTargetLabel
      : rawTargetLabel;

    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-staged-bg text-status-staged-fg border border-status-staged-border text-[10.5px] font-extrabold shrink-0"
        title={
          isBroadcastPool
            ? `Top-K Broadcast Pool (${cascade.strategy}): ${poolCarCount} car(s) offered · Batch ${cascade.cascadeAttempt}/${cascade.maxAttempts}`
            : `Sequential Offer Cascade (${cascade.strategy}): Step ${cascade.cascadeAttempt} of ${cascade.maxAttempts}`
        }
      >
        {!isBroadcastPool && (
          <BoltIcon className="w-3 h-3 text-indigo-600 animate-pulse shrink-0" />
        )}
        <span className="truncate max-w-[175px]">
          {isBroadcastPool
            ? `⚡ Pool (${poolCarCount} ${poolCarCount === 1 ? 'car' : 'cars'}) • ${remainingSec}s`
            : `Offering ${shortTargetLabel} • ${remainingSec}s · ${cascade.cascadeAttempt}/${cascade.maxAttempts}`}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-200/80 text-status-staged-fg hover:text-status-danger-fg cursor-pointer transition-colors"
            title="Cancel Offer Cascade"
            aria-label="Cancel Offer Cascade"
          >
            <XIcon className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
    );
  }

  if (isExhausted && cascade && !hideExhausted) {
    const attemptedCount = cascade.attemptedDriverIds?.length || cascade.cascadeAttempt || 0;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-danger-bg text-status-danger-fg border border-status-danger-border text-[10.5px] font-extrabold shrink-0"
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
    emerald: 'bg-status-success-bg text-status-success-fg border-status-success-border',
    amber: 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border',
    rose: 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border',
    blue: 'bg-status-info-bg text-status-info-fg border-status-info-border',
    slate: 'bg-surface-muted text-fg-strong border-border-strong',
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
