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
  StarIcon,
  LuggageIcon,
  SparklesIcon,
  DocumentTextIcon,
} from '../../ui/Icons';
import {
  computeDriverScheduleTimeline,
  type DriverScheduleTimelineItem,
} from '../../../core/services/dispatch/staged-driver-planner.service';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import type { Trip, TripPassenger } from '../../../core/types/trip';

export interface DriverQueueWindowProps {
  driver: DriverRosterItem | null;
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  onReorderQueue: (driverId: string, reorderedTripIds: string[]) => Promise<void> | void;
  onUnassignTrip?: (tripId: string) => Promise<void> | void;
  onSendStagedTrip?: (trip: Trip) => Promise<void> | void;
  onUnstageTrip?: (trip: Trip) => Promise<void> | void;
  onSendAllStagedTrips?: (driverId: string) => Promise<void> | void;
  onOpenEditTrip?: (tripId: string) => void;
  onFocusTripOnMap?: (tripId: string) => void;
  onCallPassenger?: (phone: string, name?: string) => void;
  onAssignActiveDraft?: (driver: DriverRosterItem) => void;
}

function getPassengerDisplayName(passenger?: TripPassenger | null): string {
  if (!passenger) return 'Guest Passenger';
  const full = [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return (passenger as any).name || 'Guest Passenger';
}

function getTripTotalFare(trip: Trip): number {
  return (
    trip.pricing?.totalFare ??
    (trip.pricing as any)?.estimatedTotal ??
    trip.pricing?.subtotal ??
    0
  );
}

function formatSignedMinutes(mins: number): string {
  return mins >= 0 ? `+${mins}m` : `${mins}m`;
}

export function DriverQueueWindow({
  driver,
  isOpen,
  onClose,
  trips,
  onReorderQueue,
  onUnassignTrip,
  onSendStagedTrip,
  onUnstageTrip,
  onSendAllStagedTrips,
  onOpenEditTrip,
  onFocusTripOnMap,
  onCallPassenger,
  onAssignActiveDraft,
}: DriverQueueWindowProps) {
  const [localOrderOverrides, setLocalOrderOverrides] = useState<Record<string, number>>({});
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  useEffect(() => {
    setLocalOrderOverrides({});
  }, [driver?.id]);

  useEffect(() => {
    if (!feedbackToast) return;
    const t = setTimeout(() => setFeedbackToast(null), 2800);
    return () => clearTimeout(t);
  }, [feedbackToast]);

  const effectiveTripsForTimeline = useMemo(() => {
    if (Object.keys(localOrderOverrides).length === 0) return trips;
    return trips.map((t) =>
      localOrderOverrides[t.id] !== undefined
        ? { ...t, queueOrder: localOrderOverrides[t.id] }
        : t
    );
  }, [trips, localOrderOverrides]);

  const timeline = useMemo(() => {
    if (!driver) {
      return computeDriverScheduleTimeline('', []);
    }
    return computeDriverScheduleTimeline(driver.id, effectiveTripsForTimeline);
  }, [driver, effectiveTripsForTimeline]);

  const activeItem: DriverScheduleTimelineItem | null = useMemo(
    () => timeline.items.find((it) => it.assignmentState === 'active') || null,
    [timeline.items]
  );

  const upcomingItems: DriverScheduleTimelineItem[] = useMemo(
    () => timeline.items.filter((it) => it.assignmentState !== 'active'),
    [timeline.items]
  );

  const formatTimeStr = (ms: number): string => {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateAndTimeStr = (ms: number): string => {
    const d = new Date(ms);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return formatTimeStr(ms);
    }
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleMoveTrip = async (index: number, direction: 'up' | 'down') => {
    if (!driver) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= upcomingItems.length) return;

    const reordered = upcomingItems.map((it) => it.trip);
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const nextOverrides: Record<string, number> = {};
    reordered.forEach((t, idx) => {
      nextOverrides[t.id] = idx;
    });
    setLocalOrderOverrides(nextOverrides);
    setFeedbackToast(`Moved Trip #${moved.id.slice(-6)} to position #${targetIndex + 1}`);

    try {
      setIsUpdatingOrder(true);
      await onReorderQueue(
        driver.id,
        reordered.map((t) => t.id)
      );
    } catch (err) {
      console.error('Failed to update driver queue order:', err);
      setLocalOrderOverrides({});
      setFeedbackToast('Failed to save new queue order');
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  if (!isOpen || !driver) return null;

  const activeArrivalLabel = activeItem
    ? activeItem.trip.status === 'in_progress'
      ? 'Passenger in vehicle'
      : activeItem.trip.status === 'arrived'
      ? 'Driver on scene'
      : `~${formatTimeStr(activeItem.projectedPickupMs)}`
    : '';

  return (
    <FloatingWindow
      id={`driver_queue_${driver.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Driver Schedule &amp; Queue: {driver.name}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-800 text-blue-200 font-mono font-bold">
            Car #{String(driver.cabNumber || driver.vehicle || '').replace(/^(Cab|Car)\s*#?/i, '')}
          </span>
        </div>
      }
      subtitle={`Interleaved live & staged shift timeline (${timeline.assignedCount} assigned · ${timeline.stagedCount} staged)`}
      icon={<CarIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 640, height: 700 }}
      minWidth={450}
      minHeight={360}
      hasBackdrop={false}
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
        <div className="p-3 bg-white flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <span>
              Total Schedule: <strong>${timeline.totalFare.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              ~<strong>{timeline.totalDurationMinutes} mins</strong> drive time
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {timeline.stagedCount > 0 && onSendAllStagedTrips && (
              <button
                type="button"
                disabled={isSendingAll}
                onClick={async () => {
                  setIsSendingAll(true);
                  try {
                    await onSendAllStagedTrips(driver.id);
                    setFeedbackToast(`Sent ${timeline.stagedCount} staged trip(s) to ${driver.name}`);
                  } finally {
                    setIsSendingAll(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold transition-colors cursor-pointer"
                title="Send all staged trips to driver"
              >
                {isSendingAll ? 'Sending...' : `Send All Staged (${timeline.stagedCount})`}
              </button>
            )}
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
        {/* DRIVER SUMMARY BANNER + STAGED / OVERLAP PILLS */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-sm border border-blue-100">
                {driver.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900 text-sm">{driver.name}</span>
                  {driver.driverScore !== undefined && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      <StarIcon className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      <span>{driver.driverScore}</span>
                    </span>
                  )}
                  {(() => {
                    const mapStatus = (driver as any).mapStatus as string | undefined;
                    const activeTripStatus = (driver as any).activeTripStatus as string | undefined;
                    if (mapStatus === 'busy') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          {activeTripStatus === 'arrived' ? 'Arrived' : 'In Progress'}
                        </span>
                      );
                    }
                    if (mapStatus === 'en_route' || driver.status === 'on_trip') {
                      return <Badge variant="info">En Route</Badge>;
                    }
                    if (mapStatus === 'break' || driver.status === 'break') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          On Break
                        </span>
                      );
                    }
                    if (mapStatus === 'available' || driver.status === 'available') {
                      return <Badge variant="success">Available</Badge>;
                    }
                    return <Badge variant="neutral">Offline</Badge>;
                  })()}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>
                    {driver.vehicle} ({driver.tier})
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{driver.zone}</span>
                  </span>
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

          {/* Summary & Sanity Check Pills Bar */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-extrabold">
                Assigned ({timeline.assignedCount})
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-dashed border-indigo-400 font-extrabold">
                📌 Staged ({timeline.stagedCount})
              </span>
              {timeline.overlapCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-extrabold">
                  ❌ {timeline.overlapCount} Overlap
                </span>
              )}
              {timeline.tightTurnaroundCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-extrabold">
                  ⚠️ {timeline.tightTurnaroundCount} Tight (&lt;15m)
                </span>
              )}
            </div>

            {timeline.stagedCount > 0 && onSendAllStagedTrips && (
              <button
                type="button"
                disabled={isSendingAll}
                onClick={async () => {
                  setIsSendingAll(true);
                  try {
                    await onSendAllStagedTrips(driver.id);
                    setFeedbackToast(`Sent ${timeline.stagedCount} staged trip(s) to ${driver.name}`);
                  } finally {
                    setIsSendingAll(false);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-extrabold shadow-2xs transition-colors cursor-pointer"
                title="Send all staged trips to driver"
              >
                {isSendingAll ? 'Sending...' : `Send All Staged (${timeline.stagedCount})`}
              </button>
            )}
          </div>
        </div>

        {/* 1. ACTIVE TRIP CARD (IF ANY) */}
        {activeItem && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-black text-emerald-800 uppercase tracking-wide px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Current Active Trip</span>
              </span>
              <span className="text-slate-500 font-mono text-[10px]">
                ID: {activeItem.trip.id}
              </span>
            </div>

            <div className="bg-emerald-50/70 border-2 border-emerald-500/80 rounded-xl p-3.5 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900">
                      {getPassengerDisplayName(activeItem.trip.passenger)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onCallPassenger?.(
                          activeItem.trip.passenger.phone,
                          getPassengerDisplayName(activeItem.trip.passenger)
                        )
                      }
                      className="font-mono text-[11px] text-emerald-800 hover:underline font-bold"
                    >
                      {activeItem.trip.passenger.phone}
                    </button>
                  </div>
                  <Badge variant="info">
                    {activeItem.trip.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm font-black text-emerald-900 block">
                    ${getTripTotalFare(activeItem.trip).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium">
                    ~{activeItem.durationMinutes} min trip
                  </span>
                </div>
              </div>

              <div className="bg-white/80 rounded-lg p-2.5 space-y-1.5 border border-emerald-200 text-xs">
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700 line-clamp-1">
                    {activeItem.trip.pickupLocation.address}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <FlagIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-slate-700 line-clamp-1">
                    {activeItem.trip.dropoffLocation.address}
                  </span>
                </div>
              </div>

              {(() => {
                const meta = (activeItem.trip.metadata || {}) as Record<string, any>;
                const vehLabel =
                  meta.vehicleDisplayName || meta.vehicleTypeId || activeItem.trip.vehicleTier;
                const oversized = meta.oversizedItemsSummary as string | undefined;
                const customExtras = meta.customExtrasSummary as string | undefined;
                const specialReq = activeItem.trip.passenger?.specialRequests;
                return (
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {vehLabel && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-emerald-200 font-bold text-slate-700">
                        <CarIcon className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{String(vehLabel)}</span>
                      </span>
                    )}
                    {oversized && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 font-bold text-rose-700">
                        <LuggageIcon className="w-3 h-3 text-rose-500 shrink-0" />
                        <span>{oversized}</span>
                      </span>
                    )}
                    {customExtras && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 font-bold text-indigo-700">
                        <SparklesIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span>{customExtras}</span>
                      </span>
                    )}
                    {specialReq && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 font-semibold text-amber-800">
                        <DocumentTextIcon className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{specialReq}</span>
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/80">
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-slate-600 font-medium">Status / Arrival:</span>
                  <span className="font-black text-emerald-900">{activeArrivalLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 font-medium">Est. Dropoff:</span>
                  <span className="font-black text-emerald-900">
                    ~{formatTimeStr(activeItem.projectedDropoffMs)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {onFocusTripOnMap && (
                  <button
                    type="button"
                    onClick={() => onFocusTripOnMap(activeItem.trip.id)}
                    className="px-2.5 py-1 rounded bg-white hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 transition-colors cursor-pointer"
                  >
                    Focus Map
                  </button>
                )}
                {onOpenEditTrip && (
                  <button
                    type="button"
                    onClick={() => onOpenEditTrip(activeItem.trip.id)}
                    className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                  >
                    Open Details
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. INTERLEAVED UPCOMING ASSIGNED + STAGED QUEUE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-black text-slate-700 uppercase tracking-wide px-1">
            <span>Upcoming Schedule ({upcomingItems.length})</span>
            <span className="text-[10px] text-slate-400 normal-case font-normal">
              Assigned &amp; 📌 Staged interleaved chronologically
            </span>
          </div>

          {upcomingItems.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-xl border border-dashed border-slate-300 p-6 space-y-2">
              <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">No Upcoming Trips Scheduled</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Stage shift placeholders ahead of time or send live bookings from the Dispatch
                queue.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingItems.map((item, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === upcomingItems.length - 1;
                const isStaged = item.assignmentState === 'staged';

                return (
                  <React.Fragment key={item.trip.id}>
                    {/* Between-Leg Turnaround / Overlap Callout Banner */}
                    {item.bufferMinutesAfterPrior !== null && item.conflictStatus !== 'ok' && (
                      <div
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-extrabold flex items-center justify-between gap-2 ${
                          item.conflictStatus === 'overlap'
                            ? 'bg-rose-50 border-rose-300 text-rose-900'
                            : 'bg-amber-50 border-amber-300 text-amber-900'
                        }`}
                      >
                        <span>
                          {item.conflictStatus === 'overlap'
                            ? `❌ Time Overlap (${formatSignedMinutes(item.bufferMinutesAfterPrior)})`
                            : `⚠️ Tight Turnaround (${formatSignedMinutes(
                                item.bufferMinutesAfterPrior
                              )})`}
                        </span>
                        <span className="text-[10px] font-semibold opacity-80">
                          {item.conflictStatus === 'overlap'
                            ? 'Pickup starts before prior dropoff completes'
                            : 'Less than 15m transit buffer after prior dropoff'}
                        </span>
                      </div>
                    )}

                    <div
                      className={`rounded-xl shadow-2xs transition-all overflow-hidden ${
                        isStaged
                          ? 'bg-indigo-50/35 border-2 border-dashed border-indigo-400 hover:border-indigo-500'
                          : 'bg-white border border-slate-200/90 hover:border-blue-300'
                      }`}
                    >
                      {/* Header bar of trip card */}
                      <div
                        className={`px-3.5 py-2 border-b flex items-center justify-between gap-2 flex-wrap ${
                          isStaged
                            ? 'bg-indigo-50/80 border-indigo-200/90'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded font-mono ${
                              isStaged ? 'bg-indigo-700 text-white' : 'bg-blue-600 text-white'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {getPassengerDisplayName(item.trip.passenger)}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            ID: {item.trip.id.slice(-6)}
                          </span>
                          {isStaged ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white border border-dashed border-indigo-400 text-indigo-800">
                              📌 Staged (Held in Dispatch)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              Assigned
                            </span>
                          )}
                        </div>

                        {/* Re-order Up / Down Controls */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isFirst || isUpdatingOrder}
                            onClick={() => void handleMoveTrip(idx, 'up')}
                            className={`p-1 rounded text-xs font-bold transition-all cursor-pointer ${
                              isFirst
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 bg-white'
                            }`}
                            title="Move earlier in queue"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={isLast || isUpdatingOrder}
                            onClick={() => void handleMoveTrip(idx, 'down')}
                            className={`p-1 rounded text-xs font-bold transition-all cursor-pointer ${
                              isLast
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 bg-white'
                            }`}
                            title="Move later in queue"
                          >
                            ▼
                          </button>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-3.5 space-y-2.5 bg-white/85">
                        <div className="flex items-start justify-between gap-2 text-xs">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-start gap-1.5 text-slate-800">
                              <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                              <span className="line-clamp-1">
                                {item.trip.pickupLocation.address}
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5 text-slate-800">
                              <FlagIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                              <span className="line-clamp-1">
                                {item.trip.dropoffLocation.address}
                              </span>
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

                        {/* Timelines: Pickup, Dropoff & Buffer */}
                        <div className="bg-slate-50 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-xs border border-slate-100">
                          <div className="flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-slate-500 font-medium">Pickup:</span>
                            <span className="font-black text-slate-900">
                              {formatDateAndTimeStr(item.projectedPickupMs)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 font-medium">Est. Dropoff:</span>
                            <span className="font-black text-slate-900">
                              ~{formatTimeStr(item.projectedDropoffMs)}
                            </span>
                          </div>

                          {item.bufferMinutesAfterPrior !== null && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                                item.conflictStatus === 'overlap'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : item.conflictStatus === 'tight_turnaround'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                              title="Transit buffer between prior dropoff and this pickup"
                            >
                              <ClockIcon className="w-2.5 h-2.5 shrink-0" />
                              <span>
                                {item.conflictStatus === 'overlap'
                                  ? `Overlap ${formatSignedMinutes(item.bufferMinutesAfterPrior)}`
                                  : `${formatSignedMinutes(item.bufferMinutesAfterPrior)} buffer`}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Card Action footer */}
                        <div className="flex items-center justify-between pt-1 text-xs flex-wrap gap-2">
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

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isStaged ? (
                              <>
                                {onSendStagedTrip && (
                                  <button
                                    type="button"
                                    onClick={() => void onSendStagedTrip(item.trip)}
                                    className="px-2.5 py-0.5 rounded text-[10.5px] bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold transition-colors cursor-pointer shadow-2xs"
                                    title="Send to Driver"
                                  >
                                    Send to Driver
                                  </button>
                                )}
                                {onUnstageTrip && (
                                  <button
                                    type="button"
                                    onClick={() => void onUnstageTrip(item.trip)}
                                    className="px-2 py-0.5 rounded text-[10px] text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold transition-colors cursor-pointer"
                                    title="Clear staged driver placeholder"
                                  >
                                    Unstage
                                  </button>
                                )}
                              </>
                            ) : (
                              onUnassignTrip && (
                                <button
                                  type="button"
                                  onClick={() => void onUnassignTrip(item.trip.id)}
                                  className="px-2 py-0.5 rounded text-[10px] text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold transition-colors cursor-pointer"
                                  title="Unassign this trip from driver"
                                >
                                  Unassign
                                </button>
                              )
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
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}
