import React from 'react';
import type {
  BookingConflictCheckSummary,
  BookingConflictItem,
} from '../../../../core/services/dispatch/booking-conflict-checker.service';
import { FloatingWindow } from '../../../ui/FloatingWindow';
import { AlertTriangleIcon, ClockIcon } from '../../../ui/Icons';

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
          ? 'bg-status-danger-bg/95 border-status-danger-border text-status-danger-fg'
          : 'bg-status-warning-bg/95 border-status-warning-border text-status-warning-fg'
      }`}
      role="status"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-extrabold">
          <AlertTriangleIcon
            className={`w-3.5 h-3.5 shrink-0 ${isCritical ? 'text-rose-600' : 'text-amber-600'}`}
          />
          <span>
            {isCritical
              ? `${summary.criticalCount} Booking Conflict${summary.criticalCount === 1 ? '' : 's'} Detected`
              : `${summary.warningCount} Schedule Warning${summary.warningCount === 1 ? '' : 's'}`}
          </span>
        </div>
        <span
          className={`px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase ${
            isCritical ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950'
          }`}
        >
          {isCritical ? 'Check Before Booking' : 'Heads Up'}
        </span>
      </div>

      <div className="space-y-1.5">
        {summary.conflicts.slice(0, 3).map((conflict) => (
          <div
            key={conflict.id}
            className="bg-surface-card/90 rounded-lg border border-border-subtle/90 px-2.5 py-1.5 flex items-start justify-between gap-2"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="font-extrabold text-fg-primary leading-tight">
                {conflict.severity === 'critical' ? '❌ ' : '⚠️ '}
                {conflict.title}
              </div>
              <div className="text-[10.5px] text-fg-secondary leading-snug">{conflict.description}</div>
              <div className="text-[10px] text-fg-muted truncate">{conflict.routeLabel}</div>
            </div>

            {onOpenTrip && (
              <button
                type="button"
                onClick={() => onOpenTrip(conflict.conflictingTripId)}
                className="px-2 py-1 rounded-md bg-surface-header hover:bg-surface-header-elevated text-white text-[10px] font-bold shrink-0 cursor-pointer transition-colors"
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
    <FloatingWindow
      id="dispatch_conflict_guard"
      isOpen={isOpen && conflicts.length > 0}
      onClose={() => {
        if (!isSubmitting) onCancel();
      }}
      hasBackdrop={false}
      title={hasCritical ? 'Duplicate or Overlapping Trip Detected' : 'Upcoming Trip Schedule Warning'}
      subtitle={`${conflicts.length} active/future trip conflict${conflicts.length === 1 ? '' : 's'} — confirm before ${
        isEditMode ? 'saving changes' : 'creating another booking'
      }`}
      icon={<AlertTriangleIcon className="w-4 h-4 text-amber-400" />}
      initialSize={{ width: 460, height: 420 }}
      autoHeight
      minWidth={360}
      minHeight={240}
      isResizable={false}
      isMaximizable={false}
      zIndex={235}
      footer={
        <div className="px-4 py-3 bg-surface-subtle flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-muted text-xs font-extrabold text-fg-strong cursor-pointer"
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
              className="px-3.5 py-2 rounded-xl bg-surface-header hover:bg-surface-header-elevated text-white text-xs font-extrabold cursor-pointer"
            >
              Open Existing #{primaryConflict.conflictingTripNumber}
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirmBookAnyway}
            className={`px-3.5 py-2 rounded-xl text-white text-xs font-extrabold cursor-pointer shadow-xs ${
              hasCritical ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSubmitting ? 'Booking...' : isEditMode ? 'Save Anyway' : 'Book Anyway'}
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-2.5">
        {conflicts.map((conflict) => (
          <div
            key={conflict.id}
            className={`p-3 rounded-xl border space-y-1 text-xs ${
              conflict.severity === 'critical'
                ? 'bg-status-danger-bg/70 border-status-danger-border text-status-danger-fg'
                : 'bg-status-warning-bg/70 border-status-warning-border text-status-warning-fg'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold">
                {conflict.severity === 'critical' ? '❌ ' : '⚠️ '}
                {conflict.title}
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-surface-card border border-border-subtle text-fg-secondary shrink-0">
                <ClockIcon className="w-3 h-3 text-fg-muted" />
                <span>{conflict.pickupTimeLabel}</span>
              </span>
            </div>
            <p className="text-[11px] text-fg-secondary leading-snug">{conflict.description}</p>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10.5px] text-fg-muted truncate">{conflict.routeLabel}</span>
              {onOpenTrip && (
                <button
                  type="button"
                  onClick={() => {
                    onCancel();
                    onOpenTrip(conflict.conflictingTripId);
                  }}
                  className="px-2 py-0.5 rounded-md bg-surface-card hover:bg-surface-muted border border-border-strong text-fg-strong text-[10.5px] font-bold shrink-0 cursor-pointer"
                >
                  Open #{conflict.conflictingTripNumber}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </FloatingWindow>
  );
}
