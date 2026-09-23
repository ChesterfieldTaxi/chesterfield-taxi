import React, { useState, useEffect, useMemo } from 'react';
import { FloatingWindow } from '../../ui/FloatingWindow';
import { Badge } from '../../ui/Badge';
import {
  MapPinIcon,
  FlagIcon,
  ClockIcon,
  PhoneIcon,
  CarIcon,
  CalendarIcon,
  ChevronDownIcon,
} from '../../ui/Icons';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import type { Trip, TripPassenger } from '../../../core/types/trip';

export interface DriverQueueWindowProps {
  driver: DriverRosterItem | null;
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  onReorderQueue: (driverId: string, reorderedTripIds: string[]) => Promise<void> | void;
  onUnassignTrip?: (tripId: string) => Promise<void> | void;
  onOpenEditTrip?: (tripId: string) => void;
  onFocusTripOnMap?: (tripId: string) => void;
  onCallPassenger?: (phone: string, name?: string) => void;
  onAssignActiveDraft?: (driver: DriverRosterItem) => void;
}

interface ProjectedTripSchedule {
  trip: Trip;
  estimatedArrivalLabel: string;
  estimatedDropoffLabel: string;
  durationMinutes: number;
  bufferMinutesAfterPrior?: number;
  projectedDropoffMs: number;
}

function getPassengerDisplayName(passenger?: TripPassenger | null): string {
  if (!passenger) return 'Guest Passenger';
  const full = [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return (passenger as any).name || 'Guest Passenger';
}

function getTripTotalFare(trip: Trip): number {
  return trip.pricing?.totalFare ?? (trip.pricing as any)?.estimatedTotal ?? trip.pricing?.subtotal ?? 0;
}

export function DriverQueueWindow({
  driver,
  isOpen,
  onClose,
  trips,
  onReorderQueue,
  onUnassignTrip,
  onOpenEditTrip,
  onFocusTripOnMap,
  onCallPassenger,
  onAssignActiveDraft,
}: DriverQueueWindowProps) {
  // Local list of upcoming trips to support instant, optimistic re-ordering
  const [localUpcomingOrder, setLocalUpcomingOrder] = useState<Trip[]>([]);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Filter all non-completed/non-cancelled trips assigned to this driver
  const allAssignedTrips = useMemo(() => {
    if (!driver) return [];
    return trips.filter(
      (t) =>
        t.assignedDriverId === driver.id &&
        !['completed', 'cancelled', 'declined', 'DECLINED'].includes(t.status)
    );
  }, [trips, driver]);

  // Determine active in-progress trip (en_route, arrived, in_progress)
  const activeTrip = useMemo(() => {
    if (!driver) return null;
    return (
      allAssignedTrips.find((t) =>
        ['en_route', 'arrived', 'in_progress'].includes(t.status)
      ) ||
      allAssignedTrips.find((t) => t.id === driver.currentTripId) ||
      null
    );
  }, [allAssignedTrips, driver]);

  // Synchronize local upcoming trips from incoming trips props
  useEffect(() => {
    if (!driver) {
      setLocalUpcomingOrder([]);
      return;
    }

    const upcoming = allAssignedTrips.filter(
      (t) => !activeTrip || t.id !== activeTrip.id
    );

    // Sort by explicit queueOrder first, then scheduled time
    const sorted = [...upcoming].sort((a, b) => {
      const orderA = a.queueOrder ?? (a.metadata?.driverQueueOrder as number) ?? 999;
      const orderB = b.queueOrder ?? (b.metadata?.driverQueueOrder as number) ?? 999;
      if (orderA !== orderB) return orderA - orderB;

      const timeA = a.scheduledPickupTime ? new Date(a.scheduledPickupTime).getTime() : 0;
      const timeB = b.scheduledPickupTime ? new Date(b.scheduledPickupTime).getTime() : 0;
      return timeA - timeB;
    });

    setLocalUpcomingOrder(sorted);
  }, [allAssignedTrips, activeTrip, driver]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!feedbackToast) return;
    const t = setTimeout(() => setFeedbackToast(null), 2500);
    return () => clearTimeout(t);
  }, [feedbackToast]);

  // Helper to format timestamp into 12-hour format
  const formatTimeStr = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Compute chained estimated arrival and dropoff timelines
  const { activeTripSchedule, projectedUpcomingSchedules } = useMemo(() => {
    const now = Date.now();
    let currentDropoffMs = now;

    let activeSched: ProjectedTripSchedule | null = null;
    if (activeTrip) {
      const duration = activeTrip.pricing?.durationMinutes || 20;
      const durationMs = duration * 60 * 1000;

      let arrivalLabel = 'Immediate';
      if (activeTrip.status === 'in_progress') {
        arrivalLabel = 'Passenger in vehicle';
        currentDropoffMs = now + Math.round(durationMs * 0.6);
      } else if (activeTrip.status === 'arrived') {
        arrivalLabel = 'Driver on scene';
        currentDropoffMs = now + durationMs;
      } else {
        const etaMins = (activeTrip as any).etaMinutes || 8;
        const arrivalDate = new Date(now + etaMins * 60 * 1000);
        arrivalLabel = `~${etaMins}m (${formatTimeStr(arrivalDate)})`;
        currentDropoffMs = arrivalDate.getTime() + durationMs;
      }

      activeSched = {
        trip: activeTrip,
        estimatedArrivalLabel: arrivalLabel,
        estimatedDropoffLabel: `~${formatTimeStr(new Date(currentDropoffMs))}`,
        durationMinutes: duration,
        projectedDropoffMs: currentDropoffMs,
      };
    }

    const upcomingScheds: ProjectedTripSchedule[] = [];
    let priorEndMs = activeSched ? activeSched.projectedDropoffMs : now;

    for (let i = 0; i < localUpcomingOrder.length; i++) {
      const trip = localUpcomingOrder[i];
      const duration = trip.pricing?.durationMinutes || 20;
      const durationMs = duration * 60 * 1000;
      const transitBufferMs = 10 * 60 * 1000; // 10 min transit buffer between trips

      let scheduledMs = trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime).getTime() : 0;
      if (isNaN(scheduledMs) || scheduledMs < now) {
        scheduledMs = 0;
      }

      // Projected pickup is either scheduled time or prior trip end + transit buffer
      const projectedArrivalMs = scheduledMs > priorEndMs + transitBufferMs
        ? scheduledMs
        : priorEndMs + transitBufferMs;

      const projectedDropoffMs = projectedArrivalMs + durationMs;
      const bufferMinutes = Math.max(0, Math.round((projectedArrivalMs - priorEndMs) / (60 * 1000)));

      upcomingScheds.push({
        trip,
        estimatedArrivalLabel: formatTimeStr(new Date(projectedArrivalMs)),
        estimatedDropoffLabel: `~${formatTimeStr(new Date(projectedDropoffMs))}`,
        durationMinutes: duration,
        bufferMinutesAfterPrior: bufferMinutes,
        projectedDropoffMs,
      });

      priorEndMs = projectedDropoffMs;
    }

    return {
      activeTripSchedule: activeSched,
      projectedUpcomingSchedules: upcomingScheds,
    };
  }, [activeTrip, localUpcomingOrder]);

  // Total summary metrics
  const totalQueueFare = useMemo(() => {
    return allAssignedTrips.reduce((acc, t) => acc + getTripTotalFare(t), 0);
  }, [allAssignedTrips]);

  const totalDurationMinutes = useMemo(() => {
    return allAssignedTrips.reduce((acc, t) => acc + (t.pricing?.durationMinutes || 20), 0);
  }, [allAssignedTrips]);

  // Handle re-arranging trips up or down
  const handleMoveTrip = async (index: number, direction: 'up' | 'down') => {
    if (!driver) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localUpcomingOrder.length) return;

    const newOrder = [...localUpcomingOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    // Optimistically update local view
    setLocalUpcomingOrder(newOrder);
    setFeedbackToast(`Moved Trip #${moved.id.slice(-6)} to position #${targetIndex + 1}`);

    try {
      setIsUpdatingOrder(true);
      const reorderedTripIds = newOrder.map((t) => t.id);
      await onReorderQueue(driver.id, reorderedTripIds);
    } catch (err) {
      console.error('Failed to update driver queue order:', err);
      // Revert on failure
      setLocalUpcomingOrder(localUpcomingOrder);
      setFeedbackToast('Failed to save new queue order');
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  if (!isOpen || !driver) return null;

  return (
    <FloatingWindow
      id={`driver_queue_${driver.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Driver Schedule & Queue: {driver.name}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-800 text-blue-200 font-mono font-bold">
            Cab #{driver.cabNumber || driver.vehicle}
          </span>
        </div>
      }
      subtitle={`Live schedule timeline & queued dispatch orders (${allAssignedTrips.length} assigned)`}
      icon={<CarIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 620, height: 680 }}
      minWidth={440}
      minHeight={340}
      hasBackdrop={false} // Modeless: doesn't block background map, table, or softphone!
      isDraggable={true}
      isResizable={true}
      headerExtra={
        feedbackToast && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-700 text-white font-bold animate-in fade-in">
            {feedbackToast}
          </span>
        )
      }
      footer={
        <div className="p-3 bg-white flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <span>
              Total Queue: <strong>${totalQueueFare.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              ~<strong>{totalDurationMinutes} mins</strong> drive time
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onAssignActiveDraft && (
              <button
                type="button"
                onClick={() => {
                  onAssignActiveDraft(driver);
                  setFeedbackToast(`Assigned active draft to ${driver.name}`);
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 transition-colors cursor-pointer"
                title="Assign the currently open booking draft to this driver"
              >
                + Assign Active Draft
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* DRIVER SUMMARY BANNER */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-sm border border-blue-100">
                {driver.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900 text-sm">{driver.name}</span>
                  {driver.driverScore !== undefined && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      ★ {driver.driverScore}
                    </span>
                  )}
                  {driver.status === 'on_trip' ? (
                    <Badge variant="info">On Trip</Badge>
                  ) : driver.status === 'available' ? (
                    <Badge variant="success">Available</Badge>
                  ) : (
                    <Badge variant="neutral">Offline</Badge>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{driver.vehicle} ({driver.tier})</span>
                  <span>•</span>
                  <span>📍 {driver.zone}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onCallPassenger?.(driver.phone, driver.name)}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <PhoneIcon className="w-3 h-3 text-emerald-600" />
                <span>{driver.phone}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Ride</span>
              <span className="text-xs font-black text-slate-800">
                {activeTrip ? `#${activeTrip.id.slice(-6)}` : 'None'}
              </span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Queued Trips</span>
              <span className="text-xs font-black text-blue-600">
                {localUpcomingOrder.length} upcoming
              </span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Est. Revenue</span>
              <span className="text-xs font-black text-emerald-600">
                ${totalQueueFare.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 1. ACTIVE TRIP CARD (IF ANY) */}
        {activeTripSchedule && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-black text-emerald-800 uppercase tracking-wide px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Current Active Trip</span>
              </span>
              <span className="text-slate-500 font-mono text-[10px]">
                ID: {activeTripSchedule.trip.id}
              </span>
            </div>

            <div className="bg-emerald-50/70 border-2 border-emerald-500/80 rounded-xl p-3.5 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900">
                      {getPassengerDisplayName(activeTripSchedule.trip.passenger)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onCallPassenger?.(
                          activeTripSchedule.trip.passenger.phone,
                          getPassengerDisplayName(activeTripSchedule.trip.passenger)
                        )
                      }
                      className="font-mono text-[11px] text-emerald-800 hover:underline font-bold"
                    >
                      {activeTripSchedule.trip.passenger.phone}
                    </button>
                  </div>
                  <Badge variant="info">
                    {activeTripSchedule.trip.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm font-black text-emerald-900 block">
                    ${getTripTotalFare(activeTripSchedule.trip).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium">
                    ~{activeTripSchedule.durationMinutes} min trip
                  </span>
                </div>
              </div>

              {/* Route */}
              <div className="bg-white/80 rounded-lg p-2.5 space-y-1.5 border border-emerald-200 text-xs">
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700 line-clamp-1">
                    {activeTripSchedule.trip.pickupLocation.address}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <FlagIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-slate-700 line-clamp-1">
                    {activeTripSchedule.trip.dropoffLocation.address}
                  </span>
                </div>
              </div>

              {/* Arrival & Dropoff Times */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/80">
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-slate-600 font-medium">Status / Arrival:</span>
                  <span className="font-black text-emerald-900">
                    {activeTripSchedule.estimatedArrivalLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 font-medium">Est. Dropoff:</span>
                  <span className="font-black text-emerald-900">
                    {activeTripSchedule.estimatedDropoffLabel}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {onFocusTripOnMap && (
                  <button
                    type="button"
                    onClick={() => onFocusTripOnMap(activeTripSchedule.trip.id)}
                    className="px-2.5 py-1 rounded bg-white hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 transition-colors cursor-pointer"
                  >
                    Focus Map
                  </button>
                )}
                {onOpenEditTrip && (
                  <button
                    type="button"
                    onClick={() => onOpenEditTrip(activeTripSchedule.trip.id)}
                    className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                  >
                    Open Details
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. UPCOMING QUEUED TRIPS WITH RE-ARRANGING */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-black text-slate-700 uppercase tracking-wide px-1">
            <span>Upcoming Queue ({localUpcomingOrder.length})</span>
            <span className="text-[10px] text-slate-400 normal-case font-normal">
              Use ▲ / ▼ buttons to re-order sequence
            </span>
          </div>

          {projectedUpcomingSchedules.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-xl border border-dashed border-slate-300 p-6 space-y-2">
              <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">No Upcoming Trips in Queue</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                This driver currently has no additional scheduled bookings queued. Assign an active
                draft or assign trips from the dispatch board.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {projectedUpcomingSchedules.map((item, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === projectedUpcomingSchedules.length - 1;

                return (
                  <div
                    key={item.trip.id}
                    className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-300 transition-all overflow-hidden"
                  >
                    {/* Header bar of trip card */}
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-600 text-white font-mono">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {getPassengerDisplayName(item.trip.passenger)}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          ID: {item.trip.id.slice(-6)}
                        </span>
                      </div>

                      {/* Re-order Up / Down Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isFirst || isUpdatingOrder}
                          onClick={() => handleMoveTrip(idx, 'up')}
                          className={`p-1 rounded text-xs font-bold transition-all cursor-pointer ${
                            isFirst
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200'
                          }`}
                          title="Move earlier in queue"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={isLast || isUpdatingOrder}
                          onClick={() => handleMoveTrip(idx, 'down')}
                          className={`p-1 rounded text-xs font-bold transition-all cursor-pointer ${
                            isLast
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200'
                          }`}
                          title="Move later in queue"
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-start gap-1.5 text-slate-800">
                            <MapPinIcon className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                            <span className="line-clamp-1">{item.trip.pickupLocation.address}</span>
                          </div>
                          <div className="flex items-start gap-1.5 text-slate-800">
                            <FlagIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                            <span className="line-clamp-1">{item.trip.dropoffLocation.address}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-slate-900 text-xs block">
                            ${getTripTotalFare(item.trip).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ~{item.durationMinutes} mins
                          </span>
                        </div>
                      </div>

                      {/* Timelines: Estimated Arrival & Dropoff */}
                      <div className="bg-slate-50 rounded-lg p-2 flex items-center justify-between text-xs border border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-slate-500 font-medium">Est. Arrival:</span>
                          <span className="font-black text-slate-900">
                            {item.estimatedArrivalLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 font-medium">Est. Dropoff:</span>
                          <span className="font-black text-slate-900">
                            {item.estimatedDropoffLabel}
                          </span>
                        </div>

                        {item.bufferMinutesAfterPrior !== undefined && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              item.bufferMinutesAfterPrior < 10
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200/70 text-slate-700'
                            }`}
                            title="Transit buffer between prior dropoff and this pickup"
                          >
                            ⏱ {item.bufferMinutesAfterPrior}m buffer
                          </span>
                        )}
                      </div>

                      {/* Card Action footer */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onCallPassenger?.(
                                item.trip.passenger.phone,
                                getPassengerDisplayName(item.trip.passenger)
                              )
                            }
                            className="text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <PhoneIcon className="w-3 h-3 text-blue-600" />
                            <span>{item.trip.passenger.phone}</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {onUnassignTrip && (
                            <button
                              type="button"
                              onClick={() => onUnassignTrip(item.trip.id)}
                              className="px-2 py-0.5 rounded text-[10px] text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold transition-colors cursor-pointer"
                              title="Unassign this trip from driver"
                            >
                              Unassign
                            </button>
                          )}
                          {onFocusTripOnMap && (
                            <button
                              type="button"
                              onClick={() => onFocusTripOnMap(item.trip.id)}
                              className="px-2 py-0.5 rounded text-[10px] text-slate-600 hover:bg-slate-100 border border-slate-200 font-bold transition-colors cursor-pointer"
                            >
                              Map
                            </button>
                          )}
                          {onOpenEditTrip && (
                            <button
                              type="button"
                              onClick={() => onOpenEditTrip(item.trip.id)}
                              className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold transition-colors cursor-pointer"
                            >
                              Edit Trip
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}
