import React from 'react';
import type { Trip } from '../../../core/types/trip';
import type { DispatchStagedPlannerController } from '../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  formatShortTripNumber,
  type AutoStageSuggestionItem,
  type StagedConflictResolutionStrategy,
} from '../../../core/services/dispatch/staged-driver-planner.service';
import {
  AlertTriangleIcon,
  BoltIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  SparklesIcon,
} from '../../ui/Icons';
import { FloatingWindow } from '../../ui/FloatingWindow';

export interface StagedDriverConflictModalProps {
  isOpen: boolean;
  sourceLabel: string;
  stagedTrips: Trip[];
  unstagedTrips: Trip[];
  isResolving?: boolean;
  onResolve: (strategy: StagedConflictResolutionStrategy) => void | Promise<void>;
  onClose: () => void;
}

export function StagedDriverConflictModal({
  isOpen,
  sourceLabel,
  stagedTrips,
  unstagedTrips,
  isResolving = false,
  onResolve,
  onClose,
}: StagedDriverConflictModalProps) {
  if (!isOpen || stagedTrips.length === 0) return null;

  const totalCount = stagedTrips.length + unstagedTrips.length;

  return (
    <FloatingWindow
      id="dispatch_staged_conflict"
      isOpen={isOpen && stagedTrips.length > 0}
      onClose={() => {
        if (!isResolving) onClose();
      }}
      hasBackdrop={false}
      title={`Staged Driver Placeholder${stagedTrips.length === 1 ? '' : 's'} Detected`}
      subtitle={`${stagedTrips.length} of ${totalCount} target trip${
        totalCount === 1 ? '' : 's'
      } in ${sourceLabel} already staged`}
      icon={<AlertTriangleIcon className="w-4 h-4 text-amber-300" />}
      initialSize={{ width: 520, height: 540 }}
      autoHeight
      minWidth={380}
      minHeight={320}
      zIndex={230}
      footer={
        <div className="px-4 sm:px-5 py-3 bg-surface-subtle flex items-center justify-end">
          <button
            type="button"
            disabled={isResolving}
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-muted text-xs font-bold text-fg-secondary cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">
              <span>Trips with Staged Drivers ({stagedTrips.length})</span>
              {unstagedTrips.length > 0 && (
                <span className="text-fg-subtle font-semibold normal-case">
                  + {unstagedTrips.length} unstaged trip{unstagedTrips.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
              {stagedTrips.map((t) => {
                const paxName =
                  [t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ').trim() ||
                  'Guest';
                const pickupStr = t.scheduledPickupTime
                  ? new Date(t.scheduledPickupTime).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'ASAP';
                return (
                  <div
                    key={t.id}
                    className="px-3 py-2 rounded-xl border border-dashed border-status-staged-border bg-status-staged-bg/60 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-fg-primary">
                          #{formatShortTripNumber(t.id)}
                        </span>
                        <span className="font-bold text-fg-strong truncate">{paxName}</span>
                        <span className="text-[10.5px] text-fg-muted font-semibold shrink-0">
                          · {pickupStr}
                        </span>
                      </div>
                      <div className="text-[11px] text-fg-muted truncate">
                        {t.pickupLocation?.address} → {t.dropoffLocation?.address}
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-indigo-400 bg-surface-card text-status-staged-fg font-extrabold text-[10.5px] shrink-0">
                      <span>📌 {t.plannedDriverLabel || t.plannedDriverId}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Explicit Resolution Choices */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isResolving}
              onClick={() => void onResolve('keep_staged')}
              className="w-full p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-left transition-colors cursor-pointer shadow-sm space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold flex items-center gap-1.5">
                  <CarIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Keep Staged (Send to Staged Driver)</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/80 border border-status-staged-border/40">
                  Recommended
                </span>
              </div>
              <p className="text-[11px] text-indigo-100 leading-snug">
                Sends {stagedTrips.length === 1 ? 'this staged trip' : `all ${stagedTrips.length} staged trips`}{' '}
                directly to {stagedTrips.length === 1 ? 'its' : 'their'} planned driver
                {unstagedTrips.length > 0
                  ? ` and runs Auto-Dispatch on the remaining ${unstagedTrips.length} unstaged trip(s).`
                  : '.'}
              </p>
            </button>

            <button
              type="button"
              disabled={isResolving}
              onClick={() => void onResolve('skip_staged')}
              className="w-full p-3 rounded-xl bg-surface-subtle hover:bg-surface-muted disabled:opacity-50 border border-border-strong text-fg-primary text-left transition-colors cursor-pointer space-y-0.5"
            >
              <div className="text-xs font-extrabold flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5 text-fg-secondary shrink-0" />
                <span>Skip Staged Trips</span>
              </div>
              <p className="text-[11px] text-fg-secondary leading-snug">
                Leaves {stagedTrips.length === 1 ? 'this staged trip' : `these ${stagedTrips.length} staged trips`}{' '}
                held in Dispatch untouched
                {unstagedTrips.length > 0
                  ? ` and runs Auto-Dispatch only on ${unstagedTrips.length} unstaged trip(s).`
                  : '.'}
              </p>
            </button>

            <button
              type="button"
              disabled={isResolving}
              onClick={() => void onResolve('override_staged')}
              className="w-full p-3 rounded-xl bg-status-warning-bg/80 hover:bg-status-warning-bg-strong/80 disabled:opacity-50 border border-status-warning-border text-status-warning-fg text-left transition-colors cursor-pointer space-y-0.5"
            >
              <div className="text-xs font-extrabold flex items-center gap-1.5">
                <BoltIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Override Staged &amp; Re-Rank</span>
              </div>
              <p className="text-[11px] text-status-warning-fg leading-snug">
                Clears the staged driver placeholder{stagedTrips.length === 1 ? '' : 's'} and runs fresh
                Auto-Dispatch candidate ranking across all {totalCount} trip{totalCount === 1 ? '' : 's'}.
              </p>
            </button>
          </div>
      </div>
    </FloatingWindow>
  );
}

export interface AutoStageSuggestionsModalProps {
  isOpen: boolean;
  suggestions: AutoStageSuggestionItem[];
  unmatchedTripIds: string[];
  trips: Trip[];
  isApplying?: boolean;
  onConfirmApply: () => void | Promise<void>;
  onClose: () => void;
}

export function AutoStageSuggestionsModal({
  isOpen,
  suggestions,
  unmatchedTripIds,
  trips,
  isApplying = false,
  onConfirmApply,
  onClose,
}: AutoStageSuggestionsModalProps) {
  if (!isOpen) return null;

  return (
    <FloatingWindow
      id="dispatch_auto_stage_suggestions"
      isOpen={isOpen}
      onClose={() => {
        if (!isApplying) onClose();
      }}
      hasBackdrop={false}
      title={`Auto-Stage Shift Suggestions (${suggestions.length})`}
      subtitle="Non-conflicting driver shift placeholders (≥15m turnaround buffer)"
      icon={<SparklesIcon className="w-4 h-4 text-indigo-400" />}
      initialSize={{ width: 520, height: 500 }}
      autoHeight
      minWidth={380}
      minHeight={300}
      zIndex={230}
      footer={
        <div className="px-4 sm:px-5 py-3 bg-surface-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isApplying}
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-muted text-xs font-bold text-fg-secondary cursor-pointer"
          >
            Cancel
          </button>
          {suggestions.length > 0 && (
            <button
              type="button"
              disabled={isApplying}
              onClick={() => void onConfirmApply()}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <CheckIcon className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isApplying
                  ? 'Staging...'
                  : `Stage ${suggestions.length} Trip${suggestions.length === 1 ? '' : 's'} (Hold)`}
              </span>
            </button>
          )}
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-3">
          {suggestions.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-border-strong text-center space-y-1.5">
              <p className="text-xs font-bold text-fg-strong">
                No Non-Conflicting Driver Placeholders Found
              </p>
              <p className="text-[11px] text-fg-muted">
                {unmatchedTripIds.length > 0
                  ? `${unmatchedTripIds.length} selected scheduled ride(s) could not be paired without creating a < 15m turnaround conflict or vehicle mismatch.`
                  : 'There are currently no eligible unstaged scheduled trips in your selection.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((item) => {
                const fullTrip = trips.find((t) => t.id === item.tripId);
                const pax =
                  [fullTrip?.passenger?.firstName, fullTrip?.passenger?.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim() || 'Passenger';
                const pickupLabel = new Date(item.scheduledPickupTime).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={item.tripId}
                    className="p-3 rounded-xl border border-dashed border-status-staged-border bg-status-staged-bg/50 flex items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-black text-fg-primary">
                          #{item.tripNumber}
                        </span>
                        <span className="font-bold text-fg-strong truncate">{pax}</span>
                        <span className="text-[10.5px] font-semibold text-fg-muted">
                          · {pickupLabel}
                        </span>
                      </div>
                      {fullTrip && (
                        <div className="text-[11px] text-fg-muted truncate">
                          {fullTrip.pickupLocation?.address} → {fullTrip.dropoffLocation?.address}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-card border border-dashed border-indigo-400 text-status-staged-fg font-extrabold text-[11px]">
                        📌 {item.driverLabel}
                      </span>
                      <span className="text-[10px] font-semibold text-status-success-fg">
                        {item.bufferMinutesAfterPrior !== null
                          ? `+${item.bufferMinutesAfterPrior}m buffer`
                          : 'First shift leg'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unmatchedTripIds.length > 0 && suggestions.length > 0 && (
            <div className="p-2.5 rounded-xl bg-status-warning-bg border border-status-warning-border text-[11px] text-status-warning-fg font-medium">
              Note: {unmatchedTripIds.length} selected ride(s) were skipped to avoid &lt;15m turnaround
              overlaps or vehicle capacity mismatches.
            </div>
          )}
      </div>
    </FloatingWindow>
  );
}

export function DispatchStagedPlannerModals({
  stagedPlanner,
  trips,
}: {
  stagedPlanner: DispatchStagedPlannerController;
  trips: Trip[];
}) {
  return (
    <>
      <StagedDriverConflictModal
        isOpen={stagedPlanner.conflictModal.isOpen}
        sourceLabel={stagedPlanner.conflictModal.sourceLabel}
        stagedTrips={stagedPlanner.conflictModal.stagedTrips}
        unstagedTrips={stagedPlanner.conflictModal.unstagedTrips}
        isResolving={stagedPlanner.isResolvingConflict}
        onResolve={stagedPlanner.resolveConflictModal}
        onClose={stagedPlanner.closeConflictModal}
      />
      <AutoStageSuggestionsModal
        isOpen={stagedPlanner.autoStageModal.isOpen}
        suggestions={stagedPlanner.autoStageModal.suggestions}
        unmatchedTripIds={stagedPlanner.autoStageModal.unmatchedTripIds}
        trips={trips}
        isApplying={stagedPlanner.isAutoStaging}
        onConfirmApply={stagedPlanner.confirmApplyAutoStageSuggestions}
        onClose={stagedPlanner.closeAutoStageModal}
      />
    </>
  );
}
