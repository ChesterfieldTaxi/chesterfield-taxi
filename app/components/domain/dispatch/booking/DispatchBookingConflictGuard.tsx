import React from 'react';
import type {
  BookingConflictCheckSummary,
  BookingConflictItem,
} from '../../../../core/services/dispatch/booking-conflict-checker.service';
import { AlertTriangleIcon, ClockIcon, XIcon } from '../../../ui/Icons';

export interface DispatchInlineConflictBannerProps {
  summary: BookingConflictCheckSummary;
  onOpenTrip?: (tripId: string) => void;
}

export function DispatchInlineConflictBanner({
  summary,
  onOpenTrip,
}: DispatchInlineConflictBannerProps) {
  if (!summary.hasConflicts) return null;

  const isCritical = summary.hasCriticalConflicts;

  return (
    <div
      className={`rounded-xl border p-2.5 space-y-2 text-[11px] shadow-2xs ${
        isCritical
          ? 'bg-rose-50/95 border-rose-300 text-rose-950'
          : 'bg-amber-50/95 border-amber-300 text-amber-950'
      }`}
      role="status"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-extrabold">
          <AlertTriangleIcon
            className={`w-3.5 h-3.5 shrink-0 ${
              isCritical ? 'text-rose-600' : 'text-amber-600'
            }`}
          />
          <span>
            {isCritical
              ? `${summary.criticalCount} Booking Conflict${
                  summary.criticalCount === 1 ? '' : 's'
                } Detected`
              : `${summary.warningCount} Schedule Warning${
                  summary.warningCount === 1 ? '' : 's'
                }`}
          </span>
        </div>
        <span
          className={`px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase ${
            isCritical
              ? 'bg-rose-600 text-white'
              : 'bg-amber-500 text-slate-950'
          }`}
        >
          {isCritical ? 'Check Before Booking' : 'Heads Up'}
        </span>
      </div>

      <div className="space-y-1.5">
        {summary.conflicts.slice(0, 3).map((conflict) => (
          <div
            key={conflict.id}
            className="bg-white/90 rounded-lg border border-slate-200/90 px-2.5 py-1.5 flex items-start justify-between gap-2"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="font-extrabold text-slate-900 leading-tight">
                {conflict.severity === 'critical' ? '❌ ' : '⚠️ '}
                {conflict.title}
              </div>
              <div className="text-[10.5px] text-slate-600 leading-snug">
                {conflict.description}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {conflict.routeLabel}
              </div>
            </div>

            {onOpenTrip && (
              <button
                type="button"
                onClick={() => onOpenTrip(conflict.conflictingTripId)}
                className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold shrink-0 cursor-pointer transition-colors"
                title={`Open existing Trip #${conflict.conflictingTripNumber}`}
              >
                Open #{conflict.conflictingTripNumber}
              </button>
            )}
          </div>
        ))}
        {summary.conflicts.length > 3 && (
          <div className="text-[10px] font-semibold opacity-80 px-1">
            + {summary.conflicts.length - 3} more conflict(s) will be shown on Book.
          </div>
        )}
      </div>
    </div>
  );
}

export interface DispatchBookingConflictModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  isSubmitting: boolean;
  conflicts: BookingConflictItem[];
  onCancel: () => void;
  onConfirmBookAnyway: () => void;
  onOpenTrip?: (tripId: string) => void;
}

export function DispatchBookingConflictModal({
  isOpen,
  isEditMode,
  isSubmitting,
  conflicts,
  onCancel,
  onConfirmBookAnyway,
  onOpenTrip,
}: DispatchBookingConflictModalProps) {
  if (!isOpen || conflicts.length === 0) return null;

  const hasCritical = conflicts.some((c) => c.severity === 'critical');
  const primaryConflict = conflicts[0];

  return (
    <div
      className="fixed inset-0 z-[145] bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[88dvh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-booking-conflict-modal-title"
      >
        <div
          className={`px-5 py-4 text-white flex items-start justify-between gap-3 shrink-0 ${
            hasCritical ? 'bg-rose-950' : 'bg-slate-900'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-300" />
              </span>
              <h3
                id="dispatch-booking-conflict-modal-title"
                className="text-sm font-black tracking-tight"
              >
                {hasCritical
                  ? 'Duplicate or Overlapping Trip Detected'
                  : 'Upcoming Trip Schedule Warning'}
              </h3>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              We found <strong>{conflicts.length}</strong> active or future trip conflict
              {conflicts.length === 1 ? '' : 's'}. Confirm before{' '}
              {isEditMode ? 'saving changes' : 'creating another booking'}.
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="w-8 h-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close conflict warning"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
          {conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className={`p-3 rounded-xl border space-y-1 text-xs ${
                conflict.severity === 'critical'
                  ? 'bg-rose-50/70 border-rose-300 text-rose-950'
                  : 'bg-amber-50/70 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">
                  {conflict.severity === 'critical' ? '❌ ' : '⚠️ '}
                  {conflict.title}
                </span>
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 shrink-0">
                  <ClockIcon className="w-3 h-3 text-slate-500" />
                  <span>{conflict.pickupTimeLabel}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-700 leading-snug">
                {conflict.description}
              </p>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[10.5px] text-slate-500 truncate">
                  {conflict.routeLabel}
                </span>
                {onOpenTrip && (
                  <button
                    type="button"
                    onClick={() => {
                      onCancel();
                      onOpenTrip(conflict.conflictingTripId);
                    }}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[10.5px] font-bold shrink-0 cursor-pointer"
                  >
                    Open #{conflict.conflictingTripNumber}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-extrabold text-slate-800 cursor-pointer"
          >
            Cancel &amp; Review
          </button>
          {onOpenTrip && primaryConflict && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                onCancel();
                onOpenTrip(primaryConflict.conflictingTripId);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
            >
              Open Existing #{primaryConflict.conflictingTripNumber}
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirmBookAnyway}
            className={`px-3.5 py-2 rounded-xl text-white text-xs font-extrabold cursor-pointer shadow-xs ${
              hasCritical
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSubmitting
              ? 'Booking...'
              : isEditMode
              ? 'Save Anyway'
              : 'Book Anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
