import React from 'react';
import type { Trip } from '../../../core/types/trip';
import {
  getPendingDriverUpdateAck,
  hasUnacknowledgedDriverUpdate,
} from '../../../core/services/dispatch/trip-update-ack.service';
import { CheckIcon, SpinnerIcon } from '../../ui/Icons';

export interface DriverTripUpdateAckBannerProps {
  trip: Trip;
  compact?: boolean;
  isAcknowledging?: boolean;
  onAcknowledge?: (trip: Trip) => void | Promise<void>;
}

export const DriverTripUpdateAckBanner = React.memo(function DriverTripUpdateAckBanner({
  trip,
  compact = false,
  isAcknowledging = false,
  onAcknowledge,
}: DriverTripUpdateAckBannerProps) {
  if (!hasUnacknowledgedDriverUpdate(trip)) return null;
  const ack = getPendingDriverUpdateAck(trip);
  if (!ack) return null;

  const formattedTime =
    ack.updatedAt && Number.isFinite(Date.parse(ack.updatedAt))
      ? new Date(ack.updatedAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  const headerTitle =
    ack.source === 'guest_manage_ride'
      ? '⚠️ TRIP UPDATED BY PASSENGER — PLEASE ACKNOWLEDGE'
      : '⚠️ TRIP UPDATED BY DISPATCH — PLEASE ACKNOWLEDGE';

  return (
    <div
      role="alert"
      className={`rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-500/20 via-amber-500/15 to-orange-500/10 shadow-xl ${
        compact ? 'p-3 space-y-2' : 'p-4 space-y-3'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span
            className={`font-black uppercase tracking-wide text-amber-300 leading-snug ${
              compact ? 'text-[11px]' : 'text-xs'
            }`}
          >
            {headerTitle}
          </span>
        </div>
        {formattedTime && (
          <span className="font-mono text-[10.5px] font-bold text-amber-200/90 bg-slate-950/60 px-2 py-0.5 rounded-md border border-amber-400/30 shrink-0">
            {formattedTime}
          </span>
        )}
      </div>

      <ul
        className={`bg-slate-950/65 rounded-xl border border-amber-400/30 text-amber-100 font-semibold ${
          compact ? 'px-2.5 py-2 space-y-1 text-[11px]' : 'px-3 py-2.5 space-y-1.5 text-xs'
        }`}
      >
        {ack.changesSummary.map((change, idx) => (
          <li key={idx} className="leading-snug flex items-start gap-1.5">
            <span className="text-amber-400 font-black shrink-0">•</span>
            <span>{change}</span>
          </li>
        ))}
      </ul>

      {onAcknowledge && (
        <button
          type="button"
          disabled={isAcknowledging}
          onClick={(e) => {
            e.stopPropagation();
            void onAcknowledge(trip);
          }}
          className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.985] disabled:opacity-60 text-slate-950 font-black text-xs sm:text-sm tracking-wide shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {isAcknowledging ? (
            <>
              <SpinnerIcon className="w-4 h-4 animate-spin" />
              <span>ACKNOWLEDGING...</span>
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              <span>✓ ACKNOWLEDGE TRIP UPDATE</span>
            </>
          )}
        </button>
      )}
    </div>
  );
});
