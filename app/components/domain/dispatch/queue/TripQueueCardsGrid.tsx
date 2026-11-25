import React, { useState, useRef, useCallback } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import {
  FLEET_STATUS_COLORS,
  type LiveFleetDriver,
} from '../../../../core/hooks/useDispatchFleet';
import type { DispatchStagedPlannerController } from '../../../../core/hooks/dispatch/useDispatchStagedPlanner';
import {
  hasStagedDriver,
  isTripEligibleForStaging,
} from '../../../../core/services/dispatch/staged-driver-planner.service';
import {
  getPendingDriverUpdateAck,
  hasUnacknowledgedDriverUpdate,
} from '../../../../core/services/dispatch/trip-update-ack.service';
import {
  getPendingGuestChangeRequest,
  hasPendingGuestChangeRequest,
} from '../../../../core/services/tracking/guest-manage-ride';
import type { SlaScanSummary } from '../../../../core/services/dispatch/sla-monitor.service';
import { formatDriverAssignmentLabel } from '../../../../core/services/operator.service';
import {
  buildTripItineraryTooltip,
  formatShortStopPreview,
  getTripIntermediateStopCount,
  getTripIntermediateStops,
} from '../../../../core/utils/route-markers.util';
import { formatVehicleTierDisplay } from '../../../../core/utils/vehicle-tier-format.util';
import { TripActionDropdown } from '../TripActionDropdown';
import {
  DispatchCascadePill,
  DispatchFlightTelemetryPill,
  DispatchSlaBadge,
  getTripCascadeExhaustedTooltip,
  isTripCascadeActive,
} from '../DispatchCascadeSlaBadges';
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ClockIcon,
  PhoneIcon,
  MapPinIcon,
  CarIcon,
} from '../../../ui/Icons';
import { useLiveClockNowMs } from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import { computeResponsiveTripCardColumns } from './trip-queue-layout.util';
import { DriverAssignDropdown } from './DriverAssignDropdown';
import { getDispatchStatusBadge } from './TripQueueToolbar';

export interface TripQueueCardsGridProps {
  isDesktop: boolean;
  queueWidthPx: number;
  settings: AppSettings;
  drivers: LiveFleetDriver[];
  filteredTrips: Trip[];
  selectedTripIds: string[];
  selectedQueueTripId: string | null;
  openTripActionId: string | null;
  onOpenTripActionIdChange: (id: string | null) => void;
  mobileCardGestureMode: 'action_sheet' | 'multi_select';
  onToggleSelectTrip: (tripId: string) => void;
  onSearchTermChange: (term: string) => void;
  onSearchExpandedChange: (expanded: boolean) => void;
  onOpenMobileActionSheetTrip: (trip: Trip) => void;
  onOpenDriverPickerForTrip: (trip: Trip) => void;
  onSelectTripOnQueue: (trip: Trip, shouldZoom: boolean) => void;
  onEditTripFromQueue: (trip: Trip) => void;
  onFocusTripOnMapFromQueue: (trip: Trip) => void;
  onOpenReviewModal: (trip: Trip, initialTab?: 'details' | 'audit') => void;
  onOpenDriverModal: (trip: Trip) => void;
  onCloneBookingFromQueue: (trip: Trip) => void;
  onOpenCompleteTripModal: (trip: Trip) => void;
  onPromptCancelTrip: (trip: Trip) => void;
  onReactivateTrip: (trip: Trip) => void;
  onQuickAssignDriver: (tripId: string, driverId: string) => void | Promise<void>;
  onCallPassengerFromQueue: (phone: string, passengerFullName: string) => void;
  slaSummary: SlaScanSummary;
  onStartAutoOffer: (trip: Trip) => void | Promise<void>;
  onCancelAutoOffer: (trip: Trip) => void | Promise<void>;
  stagedPlanner?: DispatchStagedPlannerController;
}

export function TripQueueCardsGrid({
  isDesktop,
  queueWidthPx,
  settings,
  drivers,
  filteredTrips,
  selectedTripIds,
  selectedQueueTripId,
  openTripActionId,
  onOpenTripActionIdChange,
  mobileCardGestureMode,
  onToggleSelectTrip,
  onSearchTermChange,
  onSearchExpandedChange,
  onOpenMobileActionSheetTrip,
  onOpenDriverPickerForTrip,
  onSelectTripOnQueue,
  onEditTripFromQueue,
  onFocusTripOnMapFromQueue,
  onOpenReviewModal,
  onOpenDriverModal,
  onCloneBookingFromQueue,
  onOpenCompleteTripModal,
  onPromptCancelTrip,
  onReactivateTrip,
  onQuickAssignDriver,
  onCallPassengerFromQueue,
  slaSummary,
  onStartAutoOffer,
  onCancelAutoOffer,
  stagedPlanner,
}: TripQueueCardsGridProps) {
  const nowMs = useLiveClockNowMs(30_000);
  const [longPressingTripId, setLongPressingTripId] = useState<string | null>(null);
  const [expandedStopTripIds, setExpandedStopTripIds] = useState<Set<string>>(() => new Set());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredTripIdRef = useRef<string | null>(null);

  const toggleExpandedStops = useCallback((tripId: string) => {
    setExpandedStopTripIds((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) {
        next.delete(tripId);
      } else {
        next.add(tripId);
      }
      return next;
    });
  }, []);

  const cancelTripCardLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
    setLongPressingTripId(null);
  }, []);

  const handleTripCardTouchStart = useCallback(
    (trip: Trip, e: React.TouchEvent<HTMLDivElement>) => {
      if (isDesktop) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, select, input, a')) return;
      const touch = e.touches[0];
      if (!touch) return;
      cancelTripCardLongPress();
      longPressStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      setLongPressingTripId(trip.id);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressStartPosRef.current = null;
        longPressTriggeredTripIdRef.current = trip.id;
        setLongPressingTripId(null);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(15);
          } catch {}
        }
        if (mobileCardGestureMode === 'action_sheet') {
          onOpenMobileActionSheetTrip(trip);
        } else {
          onToggleSelectTrip(trip.id);
        }
      }, 380);
    },
    [isDesktop, mobileCardGestureMode, cancelTripCardLongPress, onOpenMobileActionSheetTrip, onToggleSelectTrip]
  );

  const handleTripCardTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!longPressStartPosRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - longPressStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - longPressStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        cancelTripCardLongPress();
      }
    },
    [cancelTripCardLongPress]
  );

  const measuredColumns = queueWidthPx > 0 ? computeResponsiveTripCardColumns(queueWidthPx) : null;
  const gridStyle: React.CSSProperties | undefined = measuredColumns
    ? { gridTemplateColumns: `repeat(${measuredColumns}, minmax(0, 1fr))` }
    : undefined;

  return (
    <div className="@container/tripqueue flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/50">
      <div
        style={gridStyle}
        data-queue-card-columns={measuredColumns ?? 'auto'}
        className="p-3 grid grid-cols-1 @[580px]/tripqueue:grid-cols-2 @[900px]/tripqueue:grid-cols-3 @[1220px]/tripqueue:grid-cols-4 gap-3 auto-rows-max content-start"
      >
        {filteredTrips.map((trip) => {
          const isSelected = selectedQueueTripId === trip.id;
          const isChecked = selectedTripIds.includes(trip.id);
          const isUnconfirmedTrip = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
          const pickupTimeStr = trip.scheduledPickupTime
            ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : 'ASAP';

          const assignedDriverObj = trip.assignedDriverId
            ? drivers.find((d) => d.id === trip.assignedDriverId)
            : undefined;
          const assignedDriverLabel = assignedDriverObj
            ? assignedDriverObj.formattedLabel || formatDriverAssignmentLabel(assignedDriverObj)
            : trip.assignedDriverId
            ? 'Assigned Driver'
            : null;
          const assignedDriverStatusPalette = assignedDriverObj
            ? FLEET_STATUS_COLORS[assignedDriverObj.mapStatus] || FLEET_STATUS_COLORS.offline
            : null;
          const isLongPressing = longPressingTripId === trip.id;
          const stops = getTripIntermediateStops(trip);
          const stopCount = getTripIntermediateStopCount(trip);
          const isStopsExpanded = expandedStopTripIds.has(trip.id);
          const firstStopPreview = stops[0] ? formatShortStopPreview(stops[0].address) : '';
          const itineraryTooltip = stopCount > 0 ? buildTripItineraryTooltip(trip) : undefined;

          return (
            <div
              key={trip.id}
              onTouchStart={(e) => handleTripCardTouchStart(trip, e)}
              onTouchMove={handleTripCardTouchMove}
              onTouchEnd={cancelTripCardLongPress}
              onTouchCancel={cancelTripCardLongPress}
              onContextMenu={(e) => {
                if (!isDesktop) e.preventDefault();
              }}
              onClick={() => {
                if (longPressTriggeredTripIdRef.current === trip.id) {
                  longPressTriggeredTripIdRef.current = null;
                  return;
                }
                if (!isDesktop) {
                  if (selectedTripIds.length > 0) {
                    onToggleSelectTrip(trip.id);
                    return;
                  }
                  onSelectTripOnQueue(trip, false);
                  onOpenReviewModal(trip, 'details');
                  return;
                }
                onSelectTripOnQueue(trip, false);
              }}
              onDoubleClick={() => {
                if (isDesktop) {
                  onEditTripFromQueue(trip);
                }
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer bg-white flex flex-col justify-between shadow-2xs min-w-0 select-none ${
                isLongPressing ? 'scale-[0.985] ring-2 ring-blue-500/40' : ''
              } ${
                isChecked
                  ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-400'
                  : isUnconfirmedTrip
                  ? 'border-amber-400 bg-amber-50/50 hover:bg-amber-50 ring-1 ring-amber-300'
                  : isSelected
                  ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-400'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {(isDesktop || selectedTripIds.length > 0) && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleSelectTrip(trip.id);
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                      />
                    )}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-900 truncate">
                        <ClockIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">{pickupTimeStr}</span>
                      </span>
                      <span className="font-mono font-semibold text-[10.5px] text-slate-400 shrink-0">
                        #{trip.id.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {getDispatchStatusBadge(trip.status, { trip, nowMs })}
                    {hasPendingGuestChangeRequest(trip) &&
                      (() => {
                        const guestReq = getPendingGuestChangeRequest(trip);
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReviewModal(trip, 'details');
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-950 border border-violet-400 text-[10px] font-extrabold animate-pulse whitespace-nowrap cursor-pointer"
                            title={
                              guestReq?.customerReason
                                ? `Passenger requested itinerary change (${guestReq.customerReason}) — click to Approve or Decline`
                                : 'Passenger requested itinerary change on /track — click to Approve or Decline'
                            }
                          >
                            📝 Rider Edit Req
                          </button>
                        );
                      })()}
                    {hasUnacknowledgedDriverUpdate(trip) &&
                      (() => {
                        const pendingAck = getPendingDriverUpdateAck(trip);
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-400 text-[10px] font-extrabold animate-pulse whitespace-nowrap"
                            title={
                              pendingAck
                                ? `Trip updated — awaiting driver acknowledgement:\n• ${pendingAck.changesSummary.join('\n• ')}`
                                : 'Awaiting driver acknowledgement of trip update'
                            }
                          >
                            ⏳ Awaiting Ack
                          </span>
                        );
                      })()}
                    {!isDesktop && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMobileActionSheetTrip(trip);
                        }}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                        title="Trip actions"
                        aria-label="Open trip actions"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                          <circle cx="12" cy="5" r="1.75" />
                          <circle cx="12" cy="12" r="1.75" />
                          <circle cx="12" cy="19" r="1.75" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="mb-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-slate-900">
                      {trip.passenger.firstName} {trip.passenger.lastName}
                    </span>
                    <DispatchSlaBadge sla={slaSummary.byTripId[trip.id]} />
                    <DispatchFlightTelemetryPill trip={trip} compact />
                    <DispatchCascadePill
                      trip={trip}
                      hideExhausted
                      onCancel={() => onCancelAutoOffer(trip)}
                    />
                    {trip.multiCarGroupId && (trip.multiCarTotal || 1) > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSearchTermChange(trip.multiCarGroupId!);
                          onSearchExpandedChange(true);
                        }}
                        className="px-1.5 py-0.5 rounded bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-300 text-[10px] font-black cursor-pointer"
                        title={`Multi-car order ${trip.multiCarGroupId} — click to filter all ${trip.multiCarTotal} cars`}
                      >
                        Car {trip.multiCarIndex || 1}/{trip.multiCarTotal}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <span>{trip.passenger.phone}</span>
                    {trip.passenger.phone && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCallPassengerFromQueue(
                            trip.passenger.phone,
                            `${trip.passenger.firstName} ${trip.passenger.lastName}`
                          );
                        }}
                        className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Click-to-Call Passenger via WebRTC Softphone"
                      >
                        <PhoneIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl mb-3">
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                    <span className="truncate font-medium" title={trip.pickupLocation.address}>
                      {trip.pickupLocation.address}
                    </span>
                  </div>

                  {stopCount > 0 && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (stops.length > 0) {
                            toggleExpandedStops(trip.id);
                          }
                        }}
                        title={itineraryTooltip}
                        className={`w-full text-left flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100/90 border border-amber-300/90 text-amber-900 text-[11px] font-bold transition-colors ${
                          stops.length > 0 ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9.5px] font-black flex items-center justify-center shrink-0">
                            {stopCount}
                          </span>
                          <span className="truncate">
                            {firstStopPreview
                              ? `+${stopCount} ${stopCount === 1 ? 'stop' : 'stops'} · ${firstStopPreview}`
                              : `+${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}`}
                          </span>
                        </span>
                        {stops.length > 0 && (
                          <span className="text-[10px] text-amber-700 shrink-0 leading-none">
                            {isStopsExpanded ? '▴' : '▾'}
                          </span>
                        )}
                      </button>

                      {isStopsExpanded && stops.length > 0 && (
                        <div className="pl-1.5 space-y-1 pt-0.5">
                          {stops.map((stop, idx) => (
                            <div
                              key={`${trip.id}-stop-${idx}`}
                              className="flex items-start gap-1.5 text-[11px] text-amber-950"
                            >
                              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center mt-0.5 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="truncate font-medium" title={stop.address}>
                                {stop.address}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-start gap-1.5">
                    <MapPinIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                    <span className="truncate font-medium" title={trip.dropoffLocation.address}>
                      {trip.dropoffLocation.address}
                    </span>
                  </div>
                </div>
              </div>

              {!isDesktop ? (
                /* Mobile-Native Card Footer */
                <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-black text-slate-900 text-sm tabular-nums shrink-0">
                      ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap truncate max-w-[105px]">
                      {formatVehicleTierDisplay(
                        (trip.metadata as any)?.vehicleTypeId || trip.vehicleTier,
                        settings.vehicles,
                        (trip.metadata as any)?.vehicleDisplayName
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isTripCascadeActive(trip) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelAutoOffer(trip);
                        }}
                        className="px-2 py-1 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-[10.5px] cursor-pointer shrink-0"
                        title="Cancel active Offer Cascade"
                      >
                        Cancel Cascade
                      </button>
                    )}

                    {hasStagedDriver(trip) ? (
                      <div className="inline-flex items-stretch max-w-[180px]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            stagedPlanner?.setDriverPickerMode('stage_hold');
                            onOpenDriverPickerForTrip(trip);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-l-full border border-r-0 border-dashed border-indigo-400 bg-indigo-50 text-indigo-950 text-[11px] font-bold transition-all active:scale-95 cursor-pointer min-w-0"
                          title={`Staged hold: ${trip.plannedDriverLabel || trip.plannedDriverId}`}
                        >
                          <span className="shrink-0">📌</span>
                          <span className="truncate">
                            {trip.plannedDriverLabel || trip.plannedDriverId}
                          </span>
                          <ChevronDownIcon className="w-3 h-3 opacity-60 shrink-0" />
                        </button>
                        {stagedPlanner && (
                          <button
                            type="button"
                            disabled={stagedPlanner.busyTripIds.has(trip.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              void stagedPlanner.sendStagedTrip(trip);
                            }}
                            className="px-2 py-1 rounded-r-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black cursor-pointer shrink-0 border border-indigo-600"
                            title="Send to Driver"
                          >
                            Send
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          stagedPlanner?.setDriverPickerMode('send_to_driver');
                          onOpenDriverPickerForTrip(trip);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all active:scale-95 cursor-pointer max-w-[145px] ${
                          assignedDriverLabel
                            ? 'bg-white text-slate-900 border-slate-300 shadow-2xs hover:bg-slate-50'
                            : !trip.assignedDriverId && trip.offerCascade?.state === 'exhausted'
                            ? 'bg-rose-50 text-rose-800 border-rose-400 hover:bg-rose-100'
                            : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                        }`}
                        title={
                          getTripCascadeExhaustedTooltip(trip) || 'Tap to assign or stage driver'
                        }
                      >
                        {assignedDriverStatusPalette ? (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${assignedDriverStatusPalette.dotClass}`}
                          />
                        ) : !trip.assignedDriverId && trip.offerCascade?.state === 'exhausted' ? (
                          <AlertTriangleIcon className="w-3 h-3 text-rose-600 shrink-0" />
                        ) : (
                          <CarIcon className="w-3 h-3 text-blue-600 shrink-0" />
                        )}
                        <span className="truncate">{assignedDriverLabel || 'Unassigned'}</span>
                        <ChevronDownIcon className="w-3 h-3 opacity-60 shrink-0" />
                      </button>
                    )}

                    {isUnconfirmedTrip && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReviewModal(trip);
                        }}
                        className="px-2.5 py-1 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs cursor-pointer animate-pulse shrink-0"
                        title="Review customer web booking"
                      >
                        Review
                      </button>
                    )}
                  </div>
                  </div>
                </div>
              ) : (
                /* Desktop Card Footer */
                <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs">

                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-black text-slate-900 text-sm tabular-nums shrink-0">
                        ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap truncate max-w-[125px]">
                        {formatVehicleTierDisplay(
                          (trip.metadata as any)?.vehicleTypeId || trip.vehicleTier,
                          settings.vehicles,
                          (trip.metadata as any)?.vehicleDisplayName
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnconfirmedTrip && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenReviewModal(trip);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] shadow-xs cursor-pointer animate-pulse"
                          title="Review customer web booking"
                        >
                          Review
                        </button>
                      )}
                      <TripActionDropdown
                        trip={trip}
                        isUnconfirmed={isUnconfirmedTrip}
                        isOpen={openTripActionId === trip.id}
                        isDesktop={isDesktop}
                        onToggle={() => onOpenTripActionIdChange(openTripActionId === trip.id ? null : trip.id)}
                        onClose={() => onOpenTripActionIdChange(null)}
                        onReview={() => onOpenReviewModal(trip, 'details')}
                        onEdit={() => onEditTripFromQueue(trip)}
                        onFare={() => onOpenDriverModal(trip)}
                        onAudit={() => onOpenReviewModal(trip, 'audit')}
                        onClone={() => onCloneBookingFromQueue(trip)}
                        onFocusMap={() => onFocusTripOnMapFromQueue(trip)}
                        onStartAutoOffer={() => onStartAutoOffer(trip)}
                        onCancelAutoOffer={() => onCancelAutoOffer(trip)}
                        onSendStagedToDriver={
                          stagedPlanner && hasStagedDriver(trip)
                            ? () => void stagedPlanner.sendStagedTrip(trip)
                            : undefined
                        }
                        onStageDriver={
                          stagedPlanner && isTripEligibleForStaging(trip)
                            ? () => {
                                stagedPlanner.setDriverPickerMode('stage_hold');
                                onOpenDriverPickerForTrip(trip);
                              }
                            : undefined
                        }
                        onClearStagedDriver={
                          stagedPlanner && hasStagedDriver(trip)
                            ? () => void stagedPlanner.clearTripStage(trip)
                            : undefined
                        }
                        onCompleteTrip={() => onOpenCompleteTripModal(trip)}
                        onCancelTrip={() => onPromptCancelTrip(trip)}
                        onReactivateTrip={() => onReactivateTrip(trip)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="flex-1 min-w-0">
                      <DriverAssignDropdown
                        value={
                          trip.assignedDriverId ||
                          (stagedPlanner?.queueAssignMode === 'stage_hold' && trip.plannedDriverId
                            ? trip.plannedDriverId
                            : 'unassigned')
                        }
                        drivers={drivers}
                        trip={trip}
                        slaConfig={settings.dispatchAutomation}
                        mode={
                          !trip.assignedDriverId && stagedPlanner?.queueAssignMode === 'stage_hold'
                            ? 'stage_hold'
                            : 'send_to_driver'
                        }
                        isAssigned={Boolean(trip.assignedDriverId)}
                        fallbackAssignedLabel={
                          String(
                            (trip.metadata as Record<string, unknown> | undefined)?.assignedDriverName ||
                              trip.plannedDriverLabel ||
                              ''
                          ).trim() || null
                        }
                        stagedDriverId={hasStagedDriver(trip) ? trip.plannedDriverId : null}
                        stagedDriverLabel={hasStagedDriver(trip) ? trip.plannedDriverLabel : null}
                        onSendStaged={
                          stagedPlanner && hasStagedDriver(trip)
                            ? () => void stagedPlanner.sendStagedTrip(trip)
                            : undefined
                        }
                        onClearStaged={
                          stagedPlanner && hasStagedDriver(trip)
                            ? () => void stagedPlanner.clearTripStage(trip)
                            : undefined
                        }
                        isSendBusy={Boolean(stagedPlanner?.busyTripIds.has(trip.id))}
                        isCascadeExhausted={
                          !trip.assignedDriverId && trip.offerCascade?.state === 'exhausted'
                        }
                        cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(trip)}
                        onChange={(val) => {
                          if (
                            !trip.assignedDriverId &&
                            stagedPlanner?.queueAssignMode === 'stage_hold'
                          ) {
                            void stagedPlanner.stageTripDriver(trip, val);
                          } else {
                            void onQuickAssignDriver(trip.id, val);
                          }
                        }}
                        size="sm"
                        fullWidth
                        isDesktop={isDesktop}
                        title={
                          !trip.assignedDriverId && stagedPlanner?.queueAssignMode === 'stage_hold'
                            ? 'Select driver to stage (Hold in Dispatch)'
                            : 'Select driver to send immediately'
                        }
                      />
                    </div>

                    {isTripCascadeActive(trip) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelAutoOffer(trip);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-[11px] cursor-pointer shrink-0 transition-colors"
                        title="Cancel active Offer Cascade"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filteredTrips.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 font-semibold text-xs">
            No trips found.
          </div>
        )}
      </div>
    </div>
  );
}
