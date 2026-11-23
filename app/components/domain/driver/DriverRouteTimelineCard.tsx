import React from 'react';
import type { Trip, TripLocation } from '../../../core/types/trip';
import type { DriverMultiStopProgressController } from '../../../core/hooks/useDriverMultiStopProgress';
import {
  summarizeTripStopProgress,
  type TripStopProgressEntry,
} from '../../../core/services/driver/driver-stop-progress';
import {
  buildMultiStopNavigationUrl,
  formatTimer,
  openMapNavigation,
  openTripRouteNavigation,
  type PreferredNavApp,
} from '../../../core/utils/driver-ui.util';
import { getTripIntermediateStopCount } from '../../../core/utils/route-markers.util';
import { ClockIcon, MapPinIcon, SpinnerIcon } from '../../ui/Icons';

export interface DriverRouteTimelineCardProps {
  trip: Trip;
  preferredNavApp: PreferredNavApp;
  variant?: 'compact' | 'interactive';
  showPointNavButtons?: boolean;
  multiStop?: DriverMultiStopProgressController;
}

function resolveLocationNote(loc?: TripLocation | null): string | null {
  if (!loc) return null;
  const parts: string[] = [];
  if (loc.driverNotes && loc.driverNotes.trim()) {
    parts.push(loc.driverNotes.trim());
  }
  if (loc.notes && loc.notes.trim() && loc.notes.trim() !== loc.driverNotes?.trim()) {
    parts.push(loc.notes.trim());
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export const DriverRouteTimelineCard = React.memo(function DriverRouteTimelineCard({
  trip,
  preferredNavApp,
  variant = 'interactive',
  showPointNavButtons = false,
  multiStop,
}: DriverRouteTimelineCardProps) {
  const summary =
    multiStop && multiStop.activeSummary && variant === 'interactive'
      ? multiStop.activeSummary
      : summarizeTripStopProgress(trip);

  const stopEntries = summary.entries;
  const totalStopsCount =
    stopEntries.length > 0 ? stopEntries.length : getTripIntermediateStopCount(trip);
  const hasStops = totalStopsCount > 0;
  const isInProgress = trip.status === 'in_progress';

  const navPlan = buildMultiStopNavigationUrl({
    trip,
    app: preferredNavApp,
    completedStopIndices: summary.completedIndicesSet,
  });

  const pickupNote = resolveLocationNote(trip.pickupLocation);
  const dropoffNote = resolveLocationNote(trip.dropoffLocation);

  // ───────────────────────────────────────────────────────────────────────────
  // COMPACT VARIANT (Offer Cards & Scheduled Queue Cards)
  // ───────────────────────────────────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 space-y-2.5 text-xs">
        {hasStops && (
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              +{totalStopsCount} {totalStopsCount === 1 ? 'Stop' : 'Stops'}
            </span>
            {showPointNavButtons && navPlan.url && (
              <button
                type="button"
                onClick={() =>
                  openTripRouteNavigation(trip, preferredNavApp, summary.completedIndicesSet)
                }
                className="px-2.5 py-1 min-h-[32px] rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 font-bold text-[11px] cursor-pointer"
              >
                {navPlan.mode === 'full_waypoints'
                  ? 'Full Route Nav'
                  : `Next Leg: ${navPlan.targetLabel}`}
              </button>
            )}
          </div>
        )}

        <div className="relative space-y-2.5">
          {/* Connecting vertical route rail */}
          <div
            className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-emerald-500/60 via-amber-500/50 to-rose-500/60 pointer-events-none"
            aria-hidden="true"
          />

          {/* Pickup (Emerald ●) */}
          <div className="relative flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center shrink-0 mt-0.5 z-10 bg-slate-950">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                  Pickup
                </span>
                <span className="text-slate-100 font-medium leading-snug block">
                  {trip.pickupLocation?.address}
                  {trip.pickupLocation?.unitOrApt ? ` (${trip.pickupLocation.unitOrApt})` : ''}
                </span>
                {pickupNote && (
                  <span className="text-[11px] text-emerald-300/80 italic block mt-0.5">
                    {pickupNote}
                  </span>
                )}
              </div>
            </div>
            {showPointNavButtons && trip.pickupLocation?.address && (
              <button
                type="button"
                onClick={() =>
                  openMapNavigation(
                    trip.pickupLocation.address,
                    preferredNavApp,
                    trip.pickupLocation.coordinates
                  )
                }
                className="px-2.5 py-1.5 min-h-[38px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer"
              >
                Nav
              </button>
            )}
          </div>

          {/* Intermediate Stops (Amber 1..N) */}
          {stopEntries.map((entry, idx) => {
            const rawStop = trip.intermediateStops?.[entry.stopIndex];
            const stopNote = resolveLocationNote(rawStop);
            const stopNumber = idx + 1;
            const isDone = entry.status === 'completed';
            const isSkipped = entry.status === 'skipped';

            return (
              <div key={entry.stopIndex} className="relative flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10 text-[11px] font-black border ${
                      isDone
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                        : isSkipped
                        ? 'bg-slate-800 text-slate-400 border-slate-600'
                        : 'bg-amber-500 text-slate-950 border-amber-300'
                    }`}
                  >
                    {isDone ? '✓' : stopNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                        Stop #{stopNumber}
                      </span>
                      {entry.status === 'arrived' && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          At Stop
                        </span>
                      )}
                      {isDone && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Completed
                        </span>
                      )}
                      {isSkipped && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          Skipped
                        </span>
                      )}
                    </div>
                    <span
                      className={`leading-snug block ${
                        isSkipped ? 'text-slate-500 line-through' : 'text-slate-200'
                      }`}
                    >
                      {entry.address}
                      {rawStop?.unitOrApt ? ` (${rawStop.unitOrApt})` : ''}
                    </span>
                    {stopNote && (
                      <span className="text-[11px] text-amber-200/80 italic block mt-0.5">
                        Note: {stopNote}
                      </span>
                    )}
                  </div>
                </div>
                {showPointNavButtons && rawStop?.address && (
                  <button
                    type="button"
                    onClick={() =>
                      openMapNavigation(rawStop.address, preferredNavApp, rawStop.coordinates)
                    }
                    className="px-2.5 py-1.5 min-h-[38px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    Nav
                  </button>
                )}
              </div>
            );
          })}

          {/* Destination (Rose ■) */}
          <div className="relative flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <div className="w-6 h-6 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center shrink-0 mt-0.5 z-10 bg-slate-950">
                <span className="w-2 h-2 rounded-[2px] bg-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400 block">
                  Destination
                </span>
                <span className="text-slate-100 font-medium leading-snug block">
                  {trip.dropoffLocation?.address}
                  {trip.dropoffLocation?.unitOrApt ? ` (${trip.dropoffLocation.unitOrApt})` : ''}
                </span>
                {dropoffNote && (
                  <span className="text-[11px] text-rose-300/80 italic block mt-0.5">
                    {dropoffNote}
                  </span>
                )}
              </div>
            </div>
            {showPointNavButtons && trip.dropoffLocation?.address && (
              <button
                type="button"
                onClick={() =>
                  openMapNavigation(
                    trip.dropoffLocation.address,
                    preferredNavApp,
                    trip.dropoffLocation.coordinates
                  )
                }
                className="px-2.5 py-1.5 min-h-[38px] bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer"
              >
                Nav
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERACTIVE VARIANT (Active Trip Console in DriverLiveMeterCard)
  // ───────────────────────────────────────────────────────────────────────────
  const stopActionLoading = multiStop?.stopActionLoading ?? null;
  const activeWaitTimer = multiStop?.activeWaitTimer;
  const nextPendingIndex = summary.nextPendingEntry?.stopIndex ?? null;
  const hasArrivedStop = Boolean(summary.activeArrivedEntry);

  return (
    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/90 space-y-3.5">
      {/* Top Multi-Stop Header Bar */}
      {stopEntries.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide border ${
                summary.allStopsCompleted
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  summary.allStopsCompleted ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              Stops: {summary.completedCount}/{summary.totalStops} Completed
            </span>
            {summary.skippedCount > 0 && (
              <span className="text-[10px] font-semibold text-slate-400">
                ({summary.skippedCount} skipped)
              </span>
            )}
          </div>

          {navPlan.url && (
            <button
              type="button"
              onClick={() =>
                openTripRouteNavigation(trip, preferredNavApp, summary.completedIndicesSet)
              }
              className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
            >
              <MapPinIcon className="w-4 h-4 shrink-0" />
              <span>
                {navPlan.mode === 'full_waypoints'
                  ? 'Full Route Nav'
                  : `Navigate Next Leg: ${navPlan.targetLabel}`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Vertical Connected Route Timeline */}
      <div className="relative space-y-3.5">
        <div
          className="absolute left-[13px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-emerald-500/70 via-amber-500/60 to-rose-500/70 pointer-events-none"
          aria-hidden="true"
        />

        {/* 1. Pickup Row (Emerald ●) */}
        <div className="relative flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-full bg-slate-950 border-2 border-emerald-500 flex items-center justify-center shrink-0 mt-0.5 z-10 shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                Pickup Location
              </span>
              <p className="text-sm font-semibold text-white leading-snug">
                {trip.pickupLocation?.address}
                {trip.pickupLocation?.unitOrApt ? ` (${trip.pickupLocation.unitOrApt})` : ''}
              </p>
              {pickupNote && (
                <p className="text-xs text-emerald-200/90 mt-1 italic">
                  Pickup Note: {pickupNote}
                </p>
              )}
            </div>
          </div>

          {trip.pickupLocation?.address && (
            <button
              type="button"
              onClick={() =>
                openMapNavigation(
                  trip.pickupLocation.address,
                  preferredNavApp,
                  trip.pickupLocation.coordinates
                )
              }
              className="px-3 py-2 min-h-[44px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <MapPinIcon className="w-4 h-4 text-emerald-400" />
              <span>Nav</span>
            </button>
          )}
        </div>

        {/* 2. Intermediate Stops (Amber/Orange 1..N) */}
        {stopEntries.map((entry: TripStopProgressEntry, ordinalIdx: number) => {
          const stopNumber = ordinalIdx + 1;
          const rawStop = trip.intermediateStops?.[entry.stopIndex];
          const stopNote = resolveLocationNote(rawStop);

          const isArrived = entry.status === 'arrived';
          const isCompleted = entry.status === 'completed';
          const isSkipped = entry.status === 'skipped';
          const isNextPending =
            isInProgress &&
            !hasArrivedStop &&
            entry.status === 'pending' &&
            entry.stopIndex === nextPendingIndex;

          return (
            <div key={entry.stopIndex} className="relative pl-10">
              {/* Stop Number Pin on Rail */}
              <div
                className={`absolute left-0 top-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 z-10 shadow-xs ${
                  isCompleted
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                    : isSkipped
                    ? 'bg-slate-800 text-slate-400 border-slate-600'
                    : isArrived
                    ? 'bg-amber-400 text-slate-950 border-white ring-4 ring-amber-500/25'
                    : isNextPending
                    ? 'bg-amber-500 text-slate-950 border-amber-200 ring-2 ring-amber-500/25'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/60 bg-slate-950'
                }`}
              >
                {isCompleted ? '✓' : stopNumber}
              </div>

              <div
                className={`rounded-2xl p-3 border transition-colors space-y-2.5 ${
                  isArrived
                    ? 'bg-amber-950/35 border-amber-400/80 shadow-lg'
                    : isNextPending
                    ? 'bg-amber-500/10 border-amber-500/60 shadow-md'
                    : isCompleted
                    ? 'bg-emerald-950/20 border-emerald-800/50'
                    : isSkipped
                    ? 'bg-slate-900/50 border-slate-800/80 opacity-80'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                        Stop #{stopNumber}
                      </span>

                      {isArrived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-400 text-slate-950">
                          At Stop #{stopNumber}
                        </span>
                      )}

                      {isCompleted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          ✓ Completed
                          {typeof entry.waitedSeconds === 'number' && entry.waitedSeconds > 0
                            ? ` · ${formatTimer(entry.waitedSeconds)}`
                            : ''}
                        </span>
                      )}

                      {isCompleted &&
                        typeof entry.waitFeeAdded === 'number' &&
                        entry.waitFeeAdded > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-500/40 font-mono">
                            +${entry.waitFeeAdded.toFixed(2)} wait fee added
                          </span>
                        )}

                      {isSkipped && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          Skipped
                        </span>
                      )}

                      {!isArrived && !isCompleted && !isSkipped && isNextPending && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-200 border border-amber-500/40">
                          Next Stop
                        </span>
                      )}

                      {(isCompleted || isSkipped) && isInProgress && multiStop && (
                        <button
                          type="button"
                          disabled={Boolean(stopActionLoading)}
                          onClick={() => void multiStop.resetStopToPending(trip, entry.stopIndex)}
                          className="text-[11px] font-bold text-slate-400 hover:text-amber-300 underline ml-1 cursor-pointer"
                        >
                          Undo
                        </button>
                      )}
                    </div>

                    <p
                      className={`text-xs sm:text-sm font-semibold leading-snug mt-1 ${
                        isSkipped ? 'text-slate-400 line-through' : 'text-white'
                      }`}
                    >
                      {entry.address}
                      {rawStop?.unitOrApt ? ` (${rawStop.unitOrApt})` : ''}
                    </p>

                    {stopNote && (
                      <p className="text-xs text-amber-200/90 mt-1 italic">
                        Stop Note: {stopNote}
                      </p>
                    )}
                  </div>

                  {rawStop?.address && (
                    <button
                      type="button"
                      onClick={() =>
                        openMapNavigation(rawStop.address, preferredNavApp, rawStop.coordinates)
                      }
                      className="px-3 py-2 min-h-[40px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Nav
                    </button>
                  )}
                </div>

                {/* Next Pending Stop Controls (`in_progress`) */}
                {isNextPending && multiStop && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(stopActionLoading)}
                      onClick={() => void multiStop.arriveAtStop(trip, entry.stopIndex)}
                      className="flex-1 py-3 px-3 min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                    >
                      {stopActionLoading === `arrive-${entry.stopIndex}` ? (
                        <SpinnerIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <MapPinIcon className="w-4 h-4 shrink-0" />
                      )}
                      <span>Arrived at Stop #{stopNumber}</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(stopActionLoading)}
                      onClick={() => void multiStop.skipStop(trip, entry.stopIndex)}
                      className="py-3 px-3.5 min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 cursor-pointer"
                    >
                      {stopActionLoading === `skip-${entry.stopIndex}` ? '...' : 'Skip'}
                    </button>
                  </div>
                )}

                {/* Live Stop Free-Wait Countdown Banner (`status === 'arrived'`) */}
                {isArrived && isInProgress && multiStop && activeWaitTimer && (
                  <div
                    className={`rounded-xl p-3 border space-y-2.5 ${
                      activeWaitTimer.isOverFreeWindow
                        ? 'bg-rose-950/55 border-rose-500/60'
                        : 'bg-emerald-950/45 border-emerald-500/50'
                    }`}
                  >
                    {!activeWaitTimer.isOverFreeWindow ? (
                      <>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-300">
                            <ClockIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>
                              Free Stop Wait: {formatTimer(activeWaitTimer.remainingFreeSeconds)}{' '}
                              left of {activeWaitTimer.freeMinutes}m grace
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={Boolean(stopActionLoading)}
                            onClick={() =>
                              void multiStop.resetStopToPending(trip, entry.stopIndex)
                            }
                            className="text-[11px] font-semibold text-slate-400 hover:text-white underline cursor-pointer"
                          >
                            Undo Arrival
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={Boolean(stopActionLoading)}
                          onClick={() =>
                            void multiStop.completeStopAndResume(trip, entry.stopIndex, {
                              applySuggestedWaitFee: false,
                            })
                          }
                          className="w-full py-3 px-3 min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                        >
                          {stopActionLoading === `complete-${entry.stopIndex}` ? (
                            <SpinnerIcon className="w-4 h-4 animate-spin" />
                          ) : null}
                          <span>Resume Trip (Depart Stop #{stopNumber})</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-black text-rose-200 flex items-center gap-1.5 flex-wrap">
                              <ClockIcon className="w-4 h-4 text-rose-400 shrink-0" />
                              <span>
                                Over Free Wait by +{formatTimer(activeWaitTimer.excessSeconds)} ·
                                Suggested Fee: +${activeWaitTimer.suggestedWaitFee.toFixed(2)}
                              </span>
                            </div>
                            <span className="text-[11px] text-rose-300/90 block mt-0.5">
                              {activeWaitTimer.excessBillableMinutes} billable min × $
                              {activeWaitTimer.perMinuteRate.toFixed(2)}/min past{' '}
                              {activeWaitTimer.freeMinutes}m free window
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={Boolean(stopActionLoading)}
                            onClick={() =>
                              void multiStop.resetStopToPending(trip, entry.stopIndex)
                            }
                            className="text-[11px] font-semibold text-slate-400 hover:text-white underline shrink-0 cursor-pointer"
                          >
                            Undo
                          </button>
                        </div>

                        {activeWaitTimer.suggestedWaitFee > 0 && !entry.waitFeeExtraId ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={Boolean(stopActionLoading)}
                              onClick={() =>
                                void multiStop.completeStopAndResume(trip, entry.stopIndex, {
                                  applySuggestedWaitFee: true,
                                })
                              }
                              className="py-3 px-3 min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                            >
                              {stopActionLoading === `complete-${entry.stopIndex}` ? (
                                <SpinnerIcon className="w-4 h-4 animate-spin" />
                              ) : null}
                              <span>
                                Resume + Add ${activeWaitTimer.suggestedWaitFee.toFixed(2)} Wait Fee
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={Boolean(stopActionLoading)}
                              onClick={() =>
                                void multiStop.completeStopAndResume(trip, entry.stopIndex, {
                                  applySuggestedWaitFee: false,
                                })
                              }
                              className="py-3 px-3 min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 cursor-pointer"
                            >
                              Resume Without Fee
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(stopActionLoading)}
                            onClick={() =>
                              void multiStop.completeStopAndResume(trip, entry.stopIndex, {
                                applySuggestedWaitFee: false,
                              })
                            }
                            className="w-full py-3 px-3 min-h-[46px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md cursor-pointer"
                          >
                            Resume Trip (Depart Stop #{stopNumber})
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 3. Destination Row (Rose ■) */}
        <div className="relative flex items-start justify-between gap-2.5 pt-1">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-full bg-slate-950 border-2 border-rose-500 flex items-center justify-center shrink-0 mt-0.5 z-10 shadow-xs">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block">
                Destination
              </span>
              <p className="text-sm font-semibold text-white leading-snug">
                {trip.dropoffLocation?.address}
                {trip.dropoffLocation?.unitOrApt ? ` (${trip.dropoffLocation.unitOrApt})` : ''}
              </p>
              {dropoffNote && (
                <p className="text-xs text-rose-200/90 mt-1 italic">
                  Dropoff Note: {dropoffNote}
                </p>
              )}
            </div>
          </div>

          {trip.dropoffLocation?.address && (
            <button
              type="button"
              onClick={() =>
                openMapNavigation(
                  trip.dropoffLocation.address,
                  preferredNavApp,
                  trip.dropoffLocation.coordinates
                )
              }
              className="px-3 py-2 min-h-[44px] bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <MapPinIcon className="w-4 h-4 text-rose-400" />
              <span>Nav</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
