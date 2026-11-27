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
  CheckIcon,
} from '../../ui/Icons';
import {
  computeDriverScheduleTimeline,
  hasStagedDriver,
  isTripEligibleForStaging,
  type DriverScheduleTimelineItem,
} from '../../../core/services/dispatch/staged-driver-planner.service';
import {
  TripActionDropdown,
  type DispatchUniversalTripActions,
} from './TripActionDropdown';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import type { Trip, TripPassenger } from '../../../core/types/trip';
import { formatPhoneDisplay } from '../../../core/utils/phone.util';

export interface DriverQueueWindowProps {
  driver: DriverRosterItem | null;
  isOpen: boolean;
  isDesktop?: boolean;
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
  tripActions?: DispatchUniversalTripActions;
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
  isDesktop = true,
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
  tripActions,
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
      zIndex={90}
      headerExtra={
        feedbackToast && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-700 text-white font-bold animate-in fade-in">
            {feedbackToast}
          </span>
        )
      }
      footer={
        <div className="p-3 bg-surface-card flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-fg-muted font-medium">
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
                className="px-3 py-1.5 rounded-lg bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg font-bold border border-status-info-border transition-colors cursor-pointer"
                title="Assign the currently open booking draft to this driver"
              >
                + Assign Active Draft
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-surface-header hover:bg-surface-header-elevated text-white font-bold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* DRIVER SUMMARY BANNER + STAGED / OVERLAP PILLS */}
        <div className="bg-surface-card rounded-xl p-3.5 border border-border-subtle shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-status-info-bg text-status-info-fg flex items-center justify-center font-black text-sm border border-blue-100">
                {driver.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-fg-primary text-sm">{driver.name}</span>
                  {driver.driverScore !== undefined && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-status-warning-bg text-status-warning-fg border border-status-warning-border">
                      <StarIcon className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      <span>{driver.driverScore}</span>
                    </span>
                  )}
                  {(() => {
                    const mapStatus = (driver as any).mapStatus as string | undefined;
                    const activeTripStatus = (driver as any).activeTripStatus as string | undefined;
                    if (mapStatus === 'busy') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-danger-bg text-status-danger-fg border border-status-danger-border">
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-warning-bg text-status-warning-fg border border-status-warning-border">
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
                <div className="text-[11px] text-fg-muted flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>
                    {driver.vehicle} ({driver.tier})
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3 text-fg-subtle shrink-0" />
                    <span>{driver.zone}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onCallPassenger?.(driver.phone, driver.name)}
                className="px-2.5 py-1 rounded-lg bg-status-success-bg hover:bg-status-success-bg-strong text-status-success-fg border border-status-success-border font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <PhoneIcon className="w-3 h-3 text-emerald-600" />
                <span>{driver.phone}</span>
              </button>
            </div>
          </div>

          {/* Summary & Sanity Check Pills Bar */}
          <div className="pt-2 border-t border-border-faint flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-2.5 py-0.5 rounded-full bg-status-info-bg text-status-info-fg border border-status-info-border font-extrabold">
                Assigned ({timeline.assignedCount})
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-status-staged-bg text-status-staged-fg border border-dashed border-indigo-400 font-extrabold">
                📌 Staged ({timeline.stagedCount})
              </span>
              {timeline.overlapCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border font-extrabold">
                  ❌ {timeline.overlapCount} Overlap
                </span>
              )}
              {timeline.tightTurnaroundCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border font-extrabold">
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
            <div className="flex items-center justify-between text-[11px] font-black text-status-success-fg uppercase tracking-wide px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Current Active Trip</span>
              </span>
              <span className="text-fg-muted font-mono text-[10px]">
                ID: {activeItem.trip.id}
              </span>
            </div>

            <div className="bg-status-success-bg/70 border-2 border-emerald-500/80 rounded-xl p-3.5 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-fg-primary">
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
                      className="font-mono text-[11px] text-status-success-fg hover:underline font-bold"
                    >
                      {formatPhoneDisplay(activeItem.trip.passenger.phone)}
                    </button>
                  </div>
                  <Badge variant="info">
                    {activeItem.trip.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm font-black text-status-success-fg block">
                    ${getTripTotalFare(activeItem.trip).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-status-success-fg font-medium">
                    ~{activeItem.durationMinutes} min trip
                  </span>
                </div>
              </div>

              <div className="bg-surface-card/80 rounded-lg p-2.5 space-y-1.5 border border-status-success-border text-xs">
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-fg-secondary line-clamp-1">
                    {activeItem.trip.pickupLocation.address}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <FlagIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                  <span className="text-fg-secondary line-clamp-1">
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
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-card border border-status-success-border font-bold text-fg-secondary">
                        <CarIcon className="w-3 h-3 text-fg-muted shrink-0" />
                        <span>{String(vehLabel)}</span>
                      </span>
                    )}
                    {oversized && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-status-danger-bg border border-status-danger-border font-bold text-status-danger-fg">
                        <LuggageIcon className="w-3 h-3 text-rose-500 shrink-0" />
                        <span>{oversized}</span>
                      </span>
                    )}
                    {customExtras && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-status-staged-bg border border-status-staged-border font-bold text-status-staged-fg">
                        <SparklesIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span>{customExtras}</span>
                      </span>
                    )}
                    {specialReq && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-status-warning-bg border border-status-warning-border font-semibold text-status-warning-fg">
                        <DocumentTextIcon className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{specialReq}</span>
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center justify-between text-xs pt-1 border-t border-status-success-border/80">
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5 text-status-success-fg" />
                  <span className="text-fg-secondary font-medium">Status / Arrival:</span>
                  <span className="font-black text-status-success-fg">{activeArrivalLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-fg-secondary font-medium">Est. Dropoff:</span>
                  <span className="font-black text-status-success-fg">
                    ~{formatTimeStr(activeItem.projectedDropoffMs)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1.5 flex-wrap pt-1">
                {tripActions && (
                  <button
                    type="button"
                    onClick={() => tripActions.onCompleteTrip(activeItem.trip)}
                    className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <CheckIcon className="w-3 h-3 shrink-0" />
                    <span>Complete Trip</span>
                  </button>
                )}
                {tripActions ? (
                  <button
                    type="button"
                    onClick={() => tripActions.onReview(activeItem.trip, 'details')}
                    className="px-2.5 py-1 rounded bg-surface-card hover:bg-status-success-bg-strong text-status-success-fg font-bold text-[11px] border border-status-success-border transition-colors cursor-pointer"
                  >
                    Details &amp; Audit
                  </button>
                ) : (
                  onOpenEditTrip && (
                    <button
                      type="button"
                      onClick={() => onOpenEditTrip(activeItem.trip.id)}
                      className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                    >
                      Open Details
                    </button>
                  )
                )}
                {onFocusTripOnMap && (
                  <button
                    type="button"
                    onClick={() => onFocusTripOnMap(activeItem.trip.id)}
                    className="px-2.5 py-1 rounded bg-surface-card hover:bg-status-success-bg-strong text-status-success-fg font-bold text-[11px] border border-status-success-border transition-colors cursor-pointer"
                  >
                    Map
                  </button>
                )}
                {tripActions && (
                  <TripActionDropdown
                    trip={activeItem.trip}
                    isUnconfirmed={
                      activeItem.trip.status === 'UNCONFIRMED' ||
                      activeItem.trip.status === 'unconfirmed'
                    }
                    isDesktop={isDesktop}
                    compact
                    showEditOnDesktop
                    showFocusMapOnDesktop
                    onReview={() => tripActions.onReview(activeItem.trip, 'details')}
                    onEdit={() => tripActions.onEdit(activeItem.trip)}
                    onFare={() => tripActions.onFare(activeItem.trip)}
                    onAudit={() => tripActions.onReview(activeItem.trip, 'audit')}
                    onClone={() => tripActions.onClone(activeItem.trip)}
                    onFocusMap={() => tripActions.onFocusMap(activeItem.trip)}
                    onStartAutoOffer={
                      tripActions.onStartAutoOffer
                        ? () => void tripActions.onStartAutoOffer?.(activeItem.trip)
                        : undefined
                    }
                    onCancelAutoOffer={
                      tripActions.onCancelAutoOffer
                        ? () => void tripActions.onCancelAutoOffer?.(activeItem.trip)
                        : undefined
                    }
                    onCompleteTrip={() => tripActions.onCompleteTrip(activeItem.trip)}
                    onCancelTrip={() => tripActions.onCancelTrip(activeItem.trip)}
                    onReactivateTrip={() => tripActions.onReactivateTrip(activeItem.trip)}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. INTERLEAVED UPCOMING ASSIGNED + STAGED QUEUE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-black text-fg-secondary uppercase tracking-wide px-1">
            <span>Upcoming Schedule ({upcomingItems.length})</span>
            <span className="text-[10px] text-fg-subtle normal-case font-normal">
              Assigned &amp; 📌 Staged interleaved chronologically
            </span>
          </div>

          {upcomingItems.length === 0 ? (
            <div className="text-center py-8 bg-surface-card rounded-xl border border-dashed border-border-strong p-6 space-y-2">
              <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-fg-secondary">No Upcoming Trips Scheduled</p>
              <p className="text-[11px] text-fg-subtle max-w-sm mx-auto">
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
                            ? 'bg-status-danger-bg border-status-danger-border text-status-danger-fg'
                            : 'bg-status-warning-bg border-status-warning-border text-status-warning-fg'
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

                    {/* Centered Transit Buffer Between Trips */}
                    {item.bufferMinutesAfterPrior !== null && (
                      <div className="flex items-center justify-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                            item.conflictStatus === 'overlap'
                              ? 'bg-status-danger-bg-strong text-status-danger-fg border border-status-danger-border'
                              : item.conflictStatus === 'tight_turnaround'
                              ? 'bg-status-warning-bg-strong text-status-warning-fg border border-status-warning-border'
                              : 'bg-status-success-bg text-status-success-fg border border-status-success-border'
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
                      </div>
                    )}

                    <div
                      className={`rounded-xl shadow-2xs transition-all overflow-hidden ${
                        isStaged
                          ? 'bg-status-staged-bg/35 border-2 border-dashed border-indigo-400 hover:border-indigo-500'
                          : 'bg-surface-card border border-border-subtle/90 hover:border-status-info-border'
                      }`}
                    >
                      {/* Header bar of trip card */}
                      <div
                        className={`px-3.5 py-2 border-b flex items-center justify-between gap-2 flex-wrap ${
                          isStaged
                            ? 'bg-status-staged-bg/80 border-status-staged-border/90'
                            : 'bg-surface-subtle border-border-subtle'
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
                          <span className="text-xs font-bold text-fg-strong">
                            {getPassengerDisplayName(item.trip.passenger)}
                          </span>
                          <span className="text-[11px] font-mono text-fg-muted">
                            ID: {item.trip.id.slice(-6)}
                          </span>
                          {isStaged ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-surface-card border border-dashed border-indigo-400 text-status-staged-fg">
                              📌 Staged (Held in Dispatch)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-info-bg-strong text-status-info-fg">
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
                                : 'text-fg-secondary hover:text-status-info-fg hover:bg-status-info-bg border border-border-subtle bg-surface-card'
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
                                : 'text-fg-secondary hover:text-status-info-fg hover:bg-status-info-bg border border-border-subtle bg-surface-card'
                            }`}
                            title="Move later in queue"
                          >
                            ▼
                          </button>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-3.5 space-y-2.5 bg-surface-card/85">
                        <div className="flex items-start justify-between gap-2 text-xs">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-start gap-1.5 text-fg-strong">
                              <MapPinIcon className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                              <span className="line-clamp-1">
                                {item.trip.pickupLocation.address}
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5 text-fg-strong">
                              <FlagIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                              <span className="line-clamp-1">
                                {item.trip.dropoffLocation.address}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-extrabold text-fg-primary text-xs block">
                              ${getTripTotalFare(item.trip).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-fg-muted">
                              ~{item.durationMinutes} mins
                            </span>
                          </div>
                        </div>

                        {/* Timelines: Pickup & Dropoff */}
                        <div className="bg-surface-subtle rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-xs border border-border-faint">
                          <div className="flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-fg-muted font-medium">Pickup:</span>
                            <span className="font-black text-fg-primary">
                              {formatDateAndTimeStr(item.projectedPickupMs)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-fg-muted font-medium">Est. Dropoff:</span>
                            <span className="font-black text-fg-primary">
                              ~{formatTimeStr(item.projectedDropoffMs)}
                            </span>
                          </div>
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
                              <span>{formatPhoneDisplay(item.trip.passenger.phone)}</span>
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
                                    className="px-2 py-0.5 rounded text-[10px] text-rose-600 hover:bg-status-danger-bg border border-status-danger-border font-bold transition-colors cursor-pointer"
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
                                  className="px-2 py-0.5 rounded text-[10px] text-rose-600 hover:bg-status-danger-bg border border-status-danger-border font-bold transition-colors cursor-pointer"
                                  title="Unassign this trip from driver"
                                >
                                  Unassign
                                </button>
                              )
                            )}
                            {tripActions ? (
                              <button
                                type="button"
                                onClick={() => tripActions.onReview(item.trip, 'details')}
                                className="px-2 py-0.5 rounded text-[10px] bg-surface-muted text-fg-secondary hover:bg-surface-emphasis border border-border-subtle font-bold transition-colors cursor-pointer"
                              >
                                Details
                              </button>
                            ) : (
                              <>
                                {onFocusTripOnMap && (
                                  <button
                                    type="button"
                                    onClick={() => onFocusTripOnMap(item.trip.id)}
                                    className="px-2 py-0.5 rounded text-[10px] text-fg-secondary hover:bg-surface-muted border border-border-subtle font-bold transition-colors cursor-pointer"
                                  >
                                    Map
                                  </button>
                                )}
                                {onOpenEditTrip && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenEditTrip(item.trip.id)}
                                    className="px-2 py-0.5 rounded text-[10px] bg-status-info-bg text-status-info-fg hover:bg-status-info-bg-strong border border-status-info-border font-bold transition-colors cursor-pointer"
                                  >
                                    Edit Trip
                                  </button>
                                )}
                              </>
                            )}
                            {tripActions && (
                              <TripActionDropdown
                                trip={item.trip}
                                isUnconfirmed={
                                  item.trip.status === 'UNCONFIRMED' ||
                                  item.trip.status === 'unconfirmed'
                                }
                                isDesktop={isDesktop}
                                compact
                                showEditOnDesktop
                                showFocusMapOnDesktop
                                onReview={() => tripActions.onReview(item.trip, 'details')}
                                onEdit={() => tripActions.onEdit(item.trip)}
                                onFare={() => tripActions.onFare(item.trip)}
                                onAudit={() => tripActions.onReview(item.trip, 'audit')}
                                onClone={() => tripActions.onClone(item.trip)}
                                onFocusMap={() => tripActions.onFocusMap(item.trip)}
                                onStartAutoOffer={
                                  tripActions.onStartAutoOffer
                                    ? () => void tripActions.onStartAutoOffer?.(item.trip)
                                    : undefined
                                }
                                onCancelAutoOffer={
                                  tripActions.onCancelAutoOffer
                                    ? () => void tripActions.onCancelAutoOffer?.(item.trip)
                                    : undefined
                                }
                                onSendStagedToDriver={
                                  onSendStagedTrip && hasStagedDriver(item.trip)
                                    ? () => void onSendStagedTrip(item.trip)
                                    : undefined
                                }
                                onStageDriver={
                                  tripActions.stagedPlanner &&
                                  isTripEligibleForStaging(item.trip) &&
                                  tripActions.onOpenDriverPicker
                                    ? () => {
                                        tripActions.stagedPlanner?.setDriverPickerMode('stage_hold');
                                        tripActions.onOpenDriverPicker?.(item.trip);
                                      }
                                    : undefined
                                }
                                onClearStagedDriver={
                                  onUnstageTrip && hasStagedDriver(item.trip)
                                    ? () => void onUnstageTrip(item.trip)
                                    : undefined
                                }
                                onCompleteTrip={() => tripActions.onCompleteTrip(item.trip)}
                                onCancelTrip={() => tripActions.onCancelTrip(item.trip)}
                                onReactivateTrip={() => tripActions.onReactivateTrip(item.trip)}
                              />
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
