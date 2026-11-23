import React from 'react';
import { ROUTE_WAYPOINT_PALETTE } from '../../../../core/utils/route-markers.util';
import type { DispatchMapPreferences } from '../../../../core/hooks/dispatch/useDispatchMapPreferences';
import { MapPinIcon, XIcon } from '../../../ui/Icons';
import type {
  ActiveRouteContext,
  ResolvedRouteMetrics,
  ResolvedRouteWaypoint,
} from './route-map-sync';

export interface MapRouteOverlayHudProps {
  activeRoute: ActiveRouteContext | null;
  waypoints: ResolvedRouteWaypoint[];
  selectedWaypoint: ResolvedRouteWaypoint | null;
  metrics: ResolvedRouteMetrics | null;
  preferences: DispatchMapPreferences;
  hasSelectedDriverHud: boolean;
  onCloseWaypointPopover: () => void;
  onPanToWaypoint?: (waypoint: ResolvedRouteWaypoint) => void;
  onClearSelectedTrip?: () => void;
}

export const MapRouteOverlayHud = React.memo(function MapRouteOverlayHud({
  activeRoute,
  waypoints,
  selectedWaypoint,
  metrics,
  preferences,
  hasSelectedDriverHud,
  onCloseWaypointPopover,
  onPanToWaypoint,
  onClearSelectedTrip,
}: MapRouteOverlayHudProps) {
  if (!activeRoute) return null;

  const resolvedMetrics = metrics || activeRoute.fallbackMetrics;
  const stopCount = Math.max(0, waypoints.length - 2);
  const canClearSelectedTrip =
    activeRoute.source === 'selected_trip' && typeof onClearSelectedTrip === 'function';

  const shortTripTag = activeRoute.tripId
    ? `#${activeRoute.tripId.slice(-6).toUpperCase()}`
    : activeRoute.source === 'draft_form'
    ? 'Draft'
    : null;

  return (
    <>
      {/* ─── INTERACTIVE WAYPOINT PIN DETAILS POPOVER ─── */}
      {preferences.interactiveRoutePinPopovers && selectedWaypoint && (() => {
        const pal = ROUTE_WAYPOINT_PALETTE[selectedWaypoint.kind];
        return (
          <div className="absolute top-15 left-2.5 right-2.5 sm:left-auto sm:right-3 sm:w-80 z-30 bg-white/98 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-150 select-text">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${pal.badgeBgClass} ${pal.badgeTextClass} ${pal.badgeBorderClass}`}
              >
                {selectedWaypoint.kind === 'stop' ? (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9.5px] font-black flex items-center justify-center shrink-0">
                    {selectedWaypoint.stopNumber}
                  </span>
                ) : selectedWaypoint.kind === 'pickup' ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-[2px] bg-rose-500 shrink-0" />
                )}
                <span>{selectedWaypoint.badgeLabel}</span>
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {onPanToWaypoint && (
                  <button
                    type="button"
                    onClick={() => onPanToWaypoint(selectedWaypoint)}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Center map on this waypoint"
                  >
                    <MapPinIcon className="w-3 h-3 text-blue-600" />
                    <span>Center</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCloseWaypointPopover}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                  title="Close pin details"
                  aria-label="Close pin details"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="font-bold text-slate-900 text-xs leading-snug break-words">
              {selectedWaypoint.address}
            </div>

            {selectedWaypoint.notes && (
              <div className="px-2.5 py-1.5 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950 font-medium leading-snug break-words">
                <span className="font-extrabold uppercase tracking-wider text-[9.5px] text-amber-700 mr-1.5">
                  Notes:
                </span>
                {selectedWaypoint.notes}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── BOTTOM-LEFT FLOATING ROUTE SUMMARY PILL ─── */}
      {preferences.showRouteSummaryPill && !hasSelectedDriverHud && (
        <div className="absolute bottom-6 left-2.5 z-20 max-w-[calc(100%-132px)] sm:max-w-lg pointer-events-auto animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div className="bg-slate-900/94 backdrop-blur-md text-white border border-slate-700/80 shadow-xl rounded-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-semibold">
            {/* Chain Summary: Pickup -> Optional Stops -> Dropoff */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-emerald-300 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="hidden xs:inline sm:inline">Pickup</span>
              </span>
              <span className="text-slate-500 text-[10px]">→</span>
              {stopCount > 0 && (
                <>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-extrabold text-[10.5px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>
                      {stopCount} {stopCount === 1 ? 'Stop' : 'Stops'}
                    </span>
                  </span>
                  <span className="text-slate-500 text-[10px]">→</span>
                </>
              )}
              <span className="inline-flex items-center gap-1 text-rose-300 font-bold">
                <span className="w-2 h-2 rounded-[2px] bg-rose-400 shrink-0" />
                <span className="hidden xs:inline sm:inline">Dropoff</span>
              </span>
            </div>

            {/* Passenger / #TRIP context */}
            {(shortTripTag || activeRoute.passengerLabel) && (
              <div className="hidden md:flex items-center gap-1 min-w-0 border-l border-slate-700 pl-2 text-slate-200">
                {shortTripTag && (
                  <span className="font-mono text-[10px] font-black text-blue-300 shrink-0">
                    {shortTripTag}
                  </span>
                )}
                {activeRoute.passengerLabel && (
                  <span className="truncate max-w-[120px] font-semibold">
                    {activeRoute.passengerLabel}
                  </span>
                )}
              </div>
            )}

            {/* Distance & ETA */}
            {resolvedMetrics && (
              <div className="flex items-center gap-1 shrink-0 border-l border-slate-700 pl-2 font-mono text-[10.5px] font-bold text-sky-300">
                <span>{resolvedMetrics.distanceMiles.toFixed(1)} mi</span>
                <span className="text-slate-500">·</span>
                <span>{resolvedMetrics.durationMinutes} min</span>
              </div>
            )}

            {/* 1-Click Clear Route Button */}
            {canClearSelectedTrip && (
              <button
                type="button"
                onClick={onClearSelectedTrip}
                className="ml-0.5 w-5 h-5 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title="Clear selected route from map"
                aria-label="Clear selected route from map"
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
});
