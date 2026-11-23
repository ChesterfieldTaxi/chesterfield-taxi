import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Trip } from '../../../../core/types/trip';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  BanIcon,
  BoltIcon,
  CarIcon,
  CheckIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  RadarBroadcastIcon,
  UsersIcon,
  XIcon,
} from '../../../ui/Icons';

export type BatchActionBarTier = 'compact_dropdown' | 'medium_hybrid' | 'wide_hybrid';

export const BATCH_BAR_COMPACT_MAX_PX = 680;
export const BATCH_BAR_MEDIUM_MAX_PX = 1060;

const TERMINAL_STATUS_SET = new Set<string>([
  'completed',
  'cancelled',
  'declined',
  'DECLINED',
]);

export interface BatchSelectionActionCounts {
  selectedCount: number;
  confirmableCount: number;
  completableCount: number;
  cancellableCount: number;
}

/**
 * Pure container-width tier resolver for the Multi-Select Batch Actions Bar:
 * - `'compact_dropdown'`: Mobile (`!isDesktop`) or narrow split-pane (`< 680px`) -> All actions inside `Actions ▾` dropdown (zero wrapping).
 * - `'medium_hybrid'`: Medium split-pane (`680px–1059px`) -> Primary inline (`Confirm`, `Assign`, `Complete`) + `More ▾` dropdown.
 * - `'wide_hybrid'`: Wide desktop (`>= 1060px` or SSR `0px`) -> Primary inline (`Confirm`, `Assign`, `Send to Driver`, `Complete`) + `More ▾` dropdown.
 */
export function resolveBatchActionBarTier(
  isDesktop: boolean,
  queueWidthPx: number
): BatchActionBarTier {
  if (!isDesktop) {
    return 'compact_dropdown';
  }
  if (Number.isFinite(queueWidthPx) && queueWidthPx > 0 && queueWidthPx < BATCH_BAR_COMPACT_MAX_PX) {
    return 'compact_dropdown';
  }
  if (Number.isFinite(queueWidthPx) && queueWidthPx > 0 && queueWidthPx < BATCH_BAR_MEDIUM_MAX_PX) {
    return 'medium_hybrid';
  }
  return 'wide_hybrid';
}

export function computeBatchSelectionActionCounts(
  trips: ReadonlyArray<Trip>,
  selectedTripIds: ReadonlyArray<string>
): BatchSelectionActionCounts {
  if (selectedTripIds.length === 0) {
    return {
      selectedCount: 0,
      confirmableCount: 0,
      completableCount: 0,
      cancellableCount: 0,
    };
  }
  const selectedSet = new Set(selectedTripIds);
  let confirmableCount = 0;
  let completableCount = 0;
  let cancellableCount = 0;

  for (const trip of trips) {
    if (!selectedSet.has(trip.id)) continue;
    const status = String(trip.status || '');
    const isTerminal = TERMINAL_STATUS_SET.has(status);
    if (!isTerminal) {
      completableCount += 1;
      cancellableCount += 1;
      if (status !== 'CONFIRMED' && status !== 'confirmed') {
        confirmableCount += 1;
      }
    }
  }

  return {
    selectedCount: selectedTripIds.length,
    confirmableCount,
    completableCount,
    cancellableCount,
  };
}

export interface TripQueueBatchActionBarProps {
  isDesktop?: boolean;
  queueWidthPx?: number;
  trips?: ReadonlyArray<Trip>;
  selectedTripIds: string[];
  allFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelectedTripIds: () => void;
  onBatchConfirmTrips: () => void;
  onBatchAssignDriver: () => void;
  onBatchCompleteTrips?: () => void;
  onBatchExportCsv: () => void;
  onBatchCancelTrips: () => void;
  stagedPlanner?: DispatchStagedPlannerController;
}

export function TripQueueBatchActionBar({
  isDesktop = true,
  queueWidthPx = 0,
  trips = [],
  selectedTripIds,
  allFilteredSelected,
  onToggleSelectAll,
  onClearSelectedTripIds,
  onBatchConfirmTrips,
  onBatchAssignDriver,
  onBatchCompleteTrips,
  onBatchExportCsv,
  onBatchCancelTrips,
  stagedPlanner,
}: TripQueueBatchActionBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(
    null
  );

  const tier = resolveBatchActionBarTier(isDesktop, queueWidthPx);
  const isCompactDropdown = tier === 'compact_dropdown';

  const counts = useMemo(
    () => computeBatchSelectionActionCounts(trips, selectedTripIds),
    [trips, selectedTripIds]
  );

  // Fallback when trips array wasn't passed (conservative non-zero enablement)
  const hasTripContext = trips.length > 0;
  const confirmableCount = hasTripContext ? counts.confirmableCount : selectedTripIds.length;
  const completableCount = hasTripContext ? counts.completableCount : selectedTripIds.length;
  const cancellableCount = hasTripContext ? counts.cancellableCount : selectedTripIds.length;

  const stagedCount = stagedPlanner?.selectedStagedCount ?? 0;
  const stageableCount = stagedPlanner?.selectedStageableCount ?? 0;
  const autoDispatchableCount = stagedPlanner?.selectedAutoDispatchableCount ?? 0;

  useEffect(() => {
    if (selectedTripIds.length === 0) {
      setIsMenuOpen(false);
    }
  }, [selectedTripIds.length]);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = isCompactDropdown ? 248 : 232;
    const measuredHeight = menuRef.current?.offsetHeight || (isCompactDropdown ? 340 : 225);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < measuredHeight + 12 && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(8, rect.top - measuredHeight - 6)
      : Math.min(vh - measuredHeight - 8, rect.bottom + 6);

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > vw - 8) {
      left = Math.max(8, vw - menuWidth - 8);
    }

    return { top, left, openUpward };
  }, [isCompactDropdown]);

  useEffect(() => {
    if (!isMenuOpen) {
      setCoords(null);
      return;
    }
    const initial = calculatePosition();
    if (initial) setCoords(initial);

    const update = () => {
      const next = calculatePosition();
      if (next) setCoords(next);
    };
    const rafId = requestAnimationFrame(update);

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen, calculatePosition]);

  if (selectedTripIds.length === 0) {
    return null;
  }

  const runAndClose = (fn?: () => void) => {
    setIsMenuOpen(false);
    fn?.();
  };

  return (
    <div
      data-batch-bar-tier={tier}
      className="px-3 py-1.5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-2 text-xs font-semibold shrink-0 h-10 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {/* Left: Selected Count + Select/Deselect All */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0">
          <CheckIcon className="w-3 h-3 shrink-0" />
          <span>{selectedTripIds.length} Selected</span>
        </span>
        <button
          type="button"
          onClick={onToggleSelectAll}
          className="text-[11px] font-semibold text-slate-300 hover:text-white underline cursor-pointer whitespace-nowrap"
        >
          {allFilteredSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Right: Adaptive Inline Primary Buttons + Responsive Batch Actions Dropdown */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!isCompactDropdown && (
          <>
            {confirmableCount > 0 && (
              <button
                type="button"
                onClick={onBatchConfirmTrips}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 rounded-lg text-slate-950 font-extrabold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0"
                title={`Confirm ${confirmableCount} unconfirmed/pending trip(s)`}
              >
                <BoltIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Confirm ({confirmableCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stagedPlanner?.setBatchAssignMode('send_to_driver');
                onBatchAssignDriver();
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-100 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0"
              title="Assign driver to selected trips"
            >
              <UsersIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Assign</span>
            </button>

            {tier === 'wide_hybrid' && stagedPlanner && stagedCount > 0 && (
              <button
                type="button"
                onClick={() => void stagedPlanner.sendSelectedStagedTrips()}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-extrabold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0"
                title="Send selected staged trips live to their planned drivers"
              >
                <CarIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Send to Driver ({stagedCount})</span>
              </button>
            )}

            {onBatchCompleteTrips && completableCount > 0 && (
              <button
                type="button"
                onClick={onBatchCompleteTrips}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-extrabold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0"
                title={`Mark ${completableCount} selected active trip(s) as Completed`}
              >
                <CheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Complete ({completableCount})</span>
              </button>
            )}
          </>
        )}

        {/* Portal Dropdown Trigger (`Batch Actions ▾` on mobile/narrow, `More ▾` on desktop) */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0 border ${
            isCompactDropdown
              ? isMenuOpen
                ? 'bg-blue-500 border-blue-300 text-white ring-2 ring-blue-400/30'
                : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white shadow-xs'
              : isMenuOpen
              ? 'bg-slate-700 border-slate-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
          }`}
          aria-haspopup="true"
          aria-expanded={isMenuOpen}
          title={isCompactDropdown ? 'Open Batch Actions menu' : 'More batch actions'}
        >
          <span>{isCompactDropdown ? 'Batch Actions' : 'More'}</span>
          <ChevronDownIcon
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
              isMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <button
          type="button"
          onClick={onClearSelectedTripIds}
          className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer shrink-0"
          title="Clear selection"
          aria-label="Clear selection"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {isMenuOpen &&
        coords !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: isCompactDropdown ? '248px' : '232px',
              zIndex: 99999,
              transformOrigin: coords.openUpward ? 'bottom right' : 'top right',
            }}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 py-1 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-1.5 bg-slate-50/80 rounded-t-xl flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                Batch Actions ({selectedTripIds.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  onToggleSelectAll();
                }}
                className="text-[10.5px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {allFilteredSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Primary Triage & Dispatch Group */}
            <div className="py-1">
              {(isCompactDropdown || confirmableCount === 0) && (
                <button
                  type="button"
                  disabled={confirmableCount === 0}
                  onClick={() => runAndClose(onBatchConfirmTrips)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50/80 disabled:opacity-45 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <BoltIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Confirm Trips</span>
                  </span>
                  <span className="text-[10.5px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                    {confirmableCount}
                  </span>
                </button>
              )}

              {isCompactDropdown && (
                <button
                  type="button"
                  onClick={() =>
                    runAndClose(() => {
                      stagedPlanner?.setBatchAssignMode('send_to_driver');
                      onBatchAssignDriver();
                    })
                  }
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <UsersIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Assign Driver</span>
                  </span>
                  <span className="text-[10.5px] font-bold text-slate-400">
                    {selectedTripIds.length}
                  </span>
                </button>
              )}

              {stagedPlanner && stagedCount > 0 && tier !== 'wide_hybrid' && (
                <button
                  type="button"
                  onClick={() => runAndClose(() => void stagedPlanner.sendSelectedStagedTrips())}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-extrabold text-indigo-800 bg-indigo-50/60 hover:bg-indigo-100/80 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <CarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Send to Driver</span>
                  </span>
                  <span className="text-[10.5px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-600 text-white">
                    {stagedCount}
                  </span>
                </button>
              )}

              {stagedPlanner && stageableCount > 0 && (
                <button
                  type="button"
                  onClick={() => runAndClose(() => stagedPlanner.openBatchStageDriverModal())}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50/80 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs leading-none shrink-0">📌</span>
                    <span>Stage Driver (Hold)</span>
                  </span>
                  <span className="text-[10.5px] font-bold px-1.5 py-0.2 rounded border border-dashed border-indigo-300 bg-indigo-50 text-indigo-800">
                    {stageableCount}
                  </span>
                </button>
              )}

              {stagedPlanner && autoDispatchableCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    runAndClose(() =>
                      void stagedPlanner.requestBatchAutoDispatchWithStagedCheck()
                    )
                  }
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50/90 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <RadarBroadcastIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Auto-Dispatch</span>
                  </span>
                  <span className="text-[10.5px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                    {autoDispatchableCount}
                  </span>
                </button>
              )}
            </div>

            {/* Completion & Export Group */}
            <div className="py-1">
              {onBatchCompleteTrips && (isCompactDropdown || completableCount === 0) && (
                <button
                  type="button"
                  disabled={completableCount === 0}
                  onClick={() => runAndClose(onBatchCompleteTrips)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-45 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Complete Trips</span>
                  </span>
                  <span className="text-[10.5px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                    {completableCount === 0 ? 'Closed' : completableCount}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => runAndClose(onBatchExportCsv)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <DocumentTextIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Export CSV</span>
                </span>
                <span className="text-[10.5px] font-bold text-slate-400">
                  {selectedTripIds.length}
                </span>
              </button>
            </div>

            {/* Destructive & Clear Group */}
            <div className="py-1">
              <button
                type="button"
                disabled={cancellableCount === 0}
                onClick={() => runAndClose(onBatchCancelTrips)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-45 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <BanIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>Cancel Trips</span>
                </span>
                <span className="text-[10.5px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                  {cancellableCount}
                </span>
              </button>

              {isCompactDropdown && (
                <button
                  type="button"
                  onClick={() => runAndClose(onClearSelectedTripIds)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  <XIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Clear Selection</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
