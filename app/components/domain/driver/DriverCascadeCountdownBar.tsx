import React, { useEffect, useState } from 'react';
import type { TripOfferCascade } from '../../../core/types/trip';
import { ClockIcon } from '../../ui/Icons';

export interface DriverCascadeCountdownBarProps {
  cascade?: TripOfferCascade;
  compact?: boolean;
}

export const DriverCascadeCountdownBar = React.memo(function DriverCascadeCountdownBar({
  cascade,
  compact = false,
}: DriverCascadeCountdownBarProps) {
  const expiresAt = cascade?.offerExpiresAt;
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!cascade || !expiresAt) {
    return null;
  }

  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return null;
  }

  const totalSeconds = Math.max(15, Number(cascade.timeoutSeconds || 45));
  const remainingSeconds = Math.max(0, Math.ceil((expiresMs - nowMs) / 1000));
  const progressPct = Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100));
  const attempt = Math.max(1, Number(cascade.cascadeAttempt || 1));
  const maxAttempts = Math.max(attempt, Number(cascade.maxAttempts || 3));

  const isUrgent = remainingSeconds <= 10;
  const isWarning = remainingSeconds > 10 && remainingSeconds <= 20;

  const barColorClass = isUrgent
    ? 'bg-rose-500'
    : isWarning
    ? 'bg-amber-400'
    : 'bg-emerald-400';

  const containerClass = isUrgent
    ? 'bg-rose-950/60 border-rose-500/60 text-rose-200'
    : isWarning
    ? 'bg-amber-950/50 border-amber-500/50 text-amber-200'
    : 'bg-blue-950/50 border-blue-500/40 text-blue-200';

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black font-mono ${containerClass}`}
      >
        <ClockIcon className="w-3.5 h-3.5 shrink-0" />
        <span>
          {remainingSeconds > 0
            ? `Accept within ${remainingSeconds}s · Step ${attempt}/${maxAttempts}`
            : `Offer expiring... · Step ${attempt}/${maxAttempts}`}
        </span>
      </span>
    );
  }

  return (
    <div className={`rounded-2xl border p-2.5 space-y-1.5 transition-colors ${containerClass}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-extrabold flex items-center gap-1.5">
          <ClockIcon className={`w-3.5 h-3.5 shrink-0 ${isUrgent ? 'animate-pulse text-rose-400' : ''}`} />
          <span>
            {remainingSeconds > 0
              ? `Accept within ${remainingSeconds}s`
              : 'Offer window expiring...'}
          </span>
        </span>
        <span className="text-[10px] font-black uppercase tracking-wider font-mono px-2 py-0.5 rounded-full bg-slate-950/70 border border-white/10">
          Step {attempt}/{maxAttempts}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-950/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-linear ${barColorClass}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
});
